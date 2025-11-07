
import React, { useState, useEffect, useCallback } from 'react';
import { Scene, StoryBible, ToastMessage, WorkflowStage, SceneContinuityData, LocalGenerationSettings, Suggestion, TimelineData, Shot, LocalGenerationStatus } from './types';
import * as db from './utils/database';
import { generateSceneList, generateStoryBible, updateSceneSummaryWithRefinements, generateNextSceneFromContinuity, generateKeyframeForScene } from './services/geminiService';
import { ApiStatusProvider, useApiStatus } from './contexts/ApiStatusContext';
import { UsageProvider, useUsage } from './contexts/UsageContext';

import StoryIdeaForm from './components/StoryIdeaForm';
import StoryBibleEditor from './components/StoryBibleEditor';
import DirectorsVisionForm from './components/DirectorsVisionForm';
import SceneNavigator from './components/SceneNavigator';
import TimelineEditor from './components/TimelineEditor';
import WorkflowTracker from './components/WorkflowTracker';
import Toast from './components/Toast';
import ApiStatusIndicator from './components/ApiStatusIndicator';
import UsageDashboard from './components/UsageDashboard';
import BarChartIcon from './components/icons/BarChartIcon';
import SettingsIcon from './components/icons/SettingsIcon';
import LocalGenerationSettingsModal from './components/LocalGenerationSettingsModal';
import ContinuityDirector from './components/ContinuityDirector';
import ContinuityModal from './components/ContinuityModal';
import SparklesIcon from './components/icons/SparklesIcon';

const AppContent: React.FC = () => {
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [localGenSettings, setLocalGenSettings] = useState<LocalGenerationSettings>({ comfyUIUrl: '', comfyUIClientId: '', workflowJson: '', mapping: {} });
    const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
    const [generatedShotImages, setGeneratedShotImages] = useState<Record<string, string>>({});
    const [localGenStatus, setLocalGenStatus] = useState<Record<string, LocalGenerationStatus>>({});
    const [continuityData, setContinuityData] = useState<Record<string, SceneContinuityData>>({});
    const [refinedSceneIds, setRefinedSceneIds] = useState(new Set<string>());
    const [continuityModal, setContinuityModal] = useState<{ sceneId: string, lastFrame: string } | null>(null);
    const [isExtending, setIsExtending] = useState(false);


    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();

    const addToast = useCallback((message: string, type: ToastMessage['type']) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(currentToasts => currentToasts.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Load data from IndexedDB on initial mount
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const bible = await db.getStoryBible();
            const vision = await db.getData('directorsVision');
            const sceneList = await db.getAllScenes();
            const settings = await db.getData('localGenSettings');
            const images = await db.getData('generatedImages');
            const shotImages = await db.getData('generatedShotImages');
            const continuity = await db.getData('continuityData');
            const genStatus = await db.getData('localGenStatus');

            if (bible) {
                setStoryBible(bible);
                if (vision) {
                    setDirectorsVision(vision);
                    if (sceneList.length > 0) {
                        setScenes(sceneList);
                        setActiveSceneId(sceneList[0].id);
                        setWorkflowStage('director');
                    } else {
                        setWorkflowStage('vision');
                    }
                } else {
                    setWorkflowStage('bible');
                }
            } else {
                setWorkflowStage('idea');
            }
            if(settings) setLocalGenSettings(settings);
            if(images) setGeneratedImages(images);
            if(shotImages) setGeneratedShotImages(shotImages);
            if(continuity) setContinuityData(continuity);
            if(genStatus) setLocalGenStatus(genStatus);


            setIsLoading(false);
        };
        loadData();
    }, []);

    const handleGenerateStoryBible = async (idea: string) => {
        setIsLoading(true);
        try {
            const bible = await generateStoryBible(idea, logApiCall, updateApiStatus);
            setStoryBible(bible);
            await db.saveStoryBible(bible);
            setWorkflowStage('bible');
            addToast('Story Bible generated successfully!', 'success');
        } catch (e) {
            console.error(e);
            addToast(e instanceof Error ? e.message : 'Failed to generate Story Bible.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStoryBible = async (bible: StoryBible) => {
        setStoryBible(bible);
        await db.saveStoryBible(bible);
        addToast('Story Bible updated.', 'info');
    };

    const handleGenerateScenes = async (vision: string) => {
        if (!storyBible) return;
        setIsLoading(true);
        setDirectorsVision(vision);
        await db.saveData('directorsVision', vision);
        try {
            const sceneList = await generateSceneList(storyBible.plotOutline, vision, logApiCall, updateApiStatus);
            const newScenes: Scene[] = sceneList.map(s => ({
                id: `scene_${Date.now()}_${Math.random()}`,
                title: s.title,
                summary: s.summary,
                timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
            }));
            setScenes(newScenes);
            await db.saveScenes(newScenes);
            if (newScenes.length > 0) {
                setActiveSceneId(newScenes[0].id);
            }
            addToast(`${newScenes.length} scenes generated! Now generating keyframe images...`, 'info');

            // Post-generation: Create keyframe images for each scene
            const imagePromises = newScenes.map(scene => {
                const prompt = `A cinematic keyframe for a scene about: "${scene.summary}". Style: ${vision}`;
                return generateKeyframeForScene(prompt, logApiCall, updateApiStatus).then(image => ({ sceneId: scene.id, image }));
            });

            const results = await Promise.all(imagePromises);
            const newImages = results.reduce((acc, result) => {
                acc[result.sceneId] = result.image;
                return acc;
            }, {} as Record<string, string>);

            setGeneratedImages(prev => ({...prev, ...newImages}));
            await db.saveData('generatedImages', {...generatedImages, ...newImages});

            setWorkflowStage('director');
            addToast('Scene keyframes generated successfully!', 'success');

        } catch (e) {
            console.error(e);
            addToast(e instanceof Error ? e.message : 'Failed to generate scenes.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStageClick = (stage: WorkflowStage) => {
        if (stage === 'director' && (!storyBible || !directorsVision || scenes.length === 0)) {
            addToast('Please complete previous steps first.', 'info');
            return;
        }
        if (stage === 'continuity' && scenes.length === 0) {
            addToast('Please generate scenes before moving to continuity review.', 'info');
            return;
        }
        setWorkflowStage(stage);
    };

    const handleApplyTimelineSuggestion = (suggestion: Suggestion, sceneId: string) => {
        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) {
            addToast(`Could not find scene to apply suggestion.`, 'error');
            return;
        }
    
        const updatedScenes = JSON.parse(JSON.stringify(scenes)); // Deep copy
        const sceneToUpdate = updatedScenes[sceneIndex];
        const timeline: TimelineData = sceneToUpdate.timeline;
        let summaryNeedsUpdate = false;
    
        switch (suggestion.type) {
            case 'UPDATE_SHOT':
                if (suggestion.shot_id) {
                    const shot = timeline.shots.find(s => s.id === suggestion.shot_id);
                    if (shot) {
                        if (suggestion.payload.description) {
                            shot.description = suggestion.payload.description;
                            summaryNeedsUpdate = true;
                        }
                        if (suggestion.payload.enhancers) {
                            timeline.shotEnhancers[suggestion.shot_id] = {
                                ...(timeline.shotEnhancers[suggestion.shot_id] || {}),
                                ...suggestion.payload.enhancers
                            };
                        }
                    }
                }
                break;
            case 'ADD_SHOT_AFTER':
                if (suggestion.after_shot_id) {
                    const afterShotIndex = timeline.shots.findIndex(s => s.id === suggestion.after_shot_id);
                    if (afterShotIndex > -1) {
                        const newShot: Shot = {
                            id: `shot_${Date.now()}_${Math.random()}`,
                            title: suggestion.payload.title,
                            description: suggestion.payload.description || '',
                        };
                        timeline.shots.splice(afterShotIndex + 1, 0, newShot);
                        timeline.transitions.splice(afterShotIndex, 0, 'Cut');
                        if (suggestion.payload.enhancers) {
                            timeline.shotEnhancers[newShot.id] = suggestion.payload.enhancers;
                        }
                        summaryNeedsUpdate = true;
                    }
                }
                break;
            case 'UPDATE_TRANSITION':
                if (suggestion.transition_index !== undefined && suggestion.payload.type) {
                    if (timeline.transitions[suggestion.transition_index]) {
                        timeline.transitions[suggestion.transition_index] = suggestion.payload.type;
                    }
                }
                break;
            default:
                console.warn("Unknown suggestion type:", suggestion.type);
        }
        
        setScenes(updatedScenes);
        db.saveScenes(updatedScenes);
    
        addToast("Suggestion applied successfully!", 'success');
        if (summaryNeedsUpdate) {
            setRefinedSceneIds(prev => new Set(prev).add(sceneId));
        }
    };

    const handleUpdateSceneSummary = async (sceneId: string): Promise<boolean> => {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) {
            addToast("Scene not found for summary update.", 'error');
            return false;
        }
        setIsLoading(true);
        try {
            const newSummary = await updateSceneSummaryWithRefinements(scene.summary, scene.timeline, logApiCall, updateApiStatus);
            const updatedScenes = scenes.map(s => s.id === sceneId ? { ...s, summary: newSummary } : s);
            setScenes(updatedScenes);
            await db.saveScenes(updatedScenes);
            setRefinedSceneIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(sceneId);
                return newSet;
            });
            addToast("Scene summary updated based on refinements.", 'info');
            return true;
        } catch(e) {
            addToast(e instanceof Error ? e.message : 'Failed to update scene summary.', 'error');
            return false;
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleExtendTimeline = (sceneId: string, lastFrame: string) => {
        setContinuityModal({ sceneId, lastFrame });
    };

    const activeScene = scenes.find(s => s.id === activeSceneId);

    const renderCurrentStage = () => {
        switch (workflowStage) {
            case 'idea':
                return (
                    <>
                        <div className="text-center py-16 sm:py-20 fade-in">
                            <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                                Cinematic Story Generator
                            </h1>
                            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-300">
                                Transform your ideas into fully-realized cinematic stories, from high-level plot to shot-by-shot details, all with the power of AI.
                            </p>
                        </div>
                        <StoryIdeaForm onSubmit={handleGenerateStoryBible} isLoading={isLoading} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />
                    </>
                )
            case 'bible':
                return storyBible && <StoryBibleEditor storyBible={storyBible} onUpdate={handleUpdateStoryBible} onGenerateScenes={() => setWorkflowStage('vision')} isLoading={isLoading} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />;
            case 'vision':
                return storyBible && <DirectorsVisionForm onSubmit={handleGenerateScenes} isLoading={isLoading} storyBible={storyBible} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />;
            case 'director':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-1">
                            <SceneNavigator scenes={scenes} activeSceneId={activeSceneId} onSelectScene={setActiveSceneId} />
                        </div>
                        <div className="lg:col-span-3">
                            {activeScene ? <TimelineEditor 
                                key={activeScene.id} 
                                scene={activeScene} 
                                onUpdateScene={(updatedScene) => {
                                    const newScenes = scenes.map(s => s.id === updatedScene.id ? updatedScene : s);
                                    setScenes(newScenes);
                                    db.saveScenes(newScenes);
                                }} 
                                directorsVision={directorsVision} 
                                storyBible={storyBible!} 
                                onApiStateChange={updateApiStatus} 
                                onApiLog={logApiCall} 
                                scenes={scenes}
                                onApplySuggestion={handleApplyTimelineSuggestion}
                                generatedImages={generatedImages}
                                generatedShotImages={generatedShotImages}
                                setGeneratedShotImages={(updater) => {
                                    const newImages = typeof updater === 'function' ? updater(generatedShotImages) : updater;
                                    setGeneratedShotImages(newImages);
                                    db.saveData('generatedShotImages', newImages);
                                }}
                                localGenSettings={localGenSettings}
                                localGenStatus={localGenStatus}
                                setLocalGenStatus={(updater) => {
                                    const newStatus = typeof updater === 'function' ? updater(localGenStatus) : updater;
                                    setLocalGenStatus(newStatus);
                                    db.saveData('localGenStatus', newStatus);
                                }}
                            /> : <p>Select a scene</p>}
                        </div>
                    </div>
                );
            case 'continuity':
                return <ContinuityDirector 
                    scenes={scenes}
                    storyBible={storyBible!}
                    directorsVision={directorsVision}
                    generatedImages={generatedImages}
                    continuityData={continuityData}
                    setContinuityData={setContinuityData}
                    addToast={addToast}
                    onApiStateChange={updateApiStatus}
                    onApiLog={logApiCall}
                    onApplyTimelineSuggestion={handleApplyTimelineSuggestion}
                    refinedSceneIds={refinedSceneIds}
                    onUpdateSceneSummary={handleUpdateSceneSummary}
                    onExtendTimeline={handleExtendTimeline}
                />;
            default:
                return <p>Welcome! Please start with an idea.</p>;
        }
    };
    
    if (isLoading && !storyBible) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading project...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            <header className="p-4 flex justify-between items-center sticky top-0 bg-gray-900/80 backdrop-blur-md z-30 border-b border-indigo-500/20">
                <div className="flex items-center gap-3">
                    <SparklesIcon className="w-7 h-7 text-indigo-400" />
                    <h1 className="text-xl font-bold text-white">Cinematic Story Generator</h1>
                </div>
                <div>
                     <button onClick={() => setIsUsageDashboardOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors mr-2" aria-label="Open usage dashboard">
                        <BarChartIcon className="w-6 h-6 text-gray-400" />
                    </button>
                    <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Open settings">
                        <SettingsIcon className="w-6 h-6 text-gray-400" />
                    </button>
                </div>
            </header>
            
            <main className="py-8 sm:py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <WorkflowTracker currentStage={workflowStage} onStageClick={handleStageClick} />
                    {renderCurrentStage()}
                </div>
            </main>

            <Toast toasts={toasts} removeToast={removeToast} />
            <ApiStatusIndicator />
            <UsageDashboard isOpen={isUsageDashboardOpen} onClose={() => setIsUsageDashboardOpen(false)} />
            <LocalGenerationSettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                settings={localGenSettings}
                onSave={(newSettings) => {
                    setLocalGenSettings(newSettings);
                    db.saveData('localGenSettings', newSettings);
                    addToast('Settings saved!', 'success');
                }}
            />
            {continuityModal && (
                <ContinuityModal
                    isOpen={true}
                    onClose={() => setContinuityModal(null)}
                    onSubmit={async (direction) => {
                        if (!continuityModal) return;
                        setIsExtending(true);
                        try {
                            const lastScene = scenes.find(s => s.id === continuityModal.sceneId);
                            if (!storyBible || !lastScene) throw new Error("Missing context for scene generation.");
                            
                            const newSceneData = await generateNextSceneFromContinuity(
                                storyBible,
                                directorsVision,
                                lastScene.summary,
                                direction,
                                continuityModal.lastFrame,
                                logApiCall,
                                updateApiStatus
                            );
                    
                            const newScene: Scene = {
                                id: `scene_${Date.now()}_${Math.random()}`,
                                title: newSceneData.title,
                                summary: newSceneData.summary,
                                timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
                            };
                            
                            const currentSceneIndex = scenes.findIndex(s => s.id === continuityModal.sceneId);
                            const newScenes = [...scenes];
                            newScenes.splice(currentSceneIndex + 1, 0, newScene);
                            
                            setScenes(newScenes);
                            await db.saveScenes(newScenes);
                    
                            addToast(`New scene "${newScene.title}" added to timeline!`, 'success');
                            setContinuityModal(null);
                        } catch (e) {
                            addToast(e instanceof Error ? e.message : 'Failed to generate next scene.', 'error');
                        } finally {
                            setIsExtending(false);
                        }
                    }}
                    lastFrame={continuityModal.lastFrame}
                    isLoading={isExtending}
                />
            )}
        </div>
    );
};

const App: React.FC = () => (
    <UsageProvider>
        <ApiStatusProvider>
            <AppContent />
        </ApiStatusProvider>
    </UsageProvider>
);

export default App;
