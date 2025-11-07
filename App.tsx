import React, { useState, useCallback, useEffect } from 'react';
import { Scene, StoryBible, ToastMessage, WorkflowStage, Suggestion, TimelineData, Shot } from './types';
import { useProjectData, usePersistentState } from './utils/hooks';
import { updateSceneSummaryWithRefinements, generateNextSceneFromContinuity } from './services/geminiService';
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
    const { 
        workflowStage, setWorkflowStage, storyBible, setStoryBible, 
        directorsVision, setDirectorsVision, scenes, setScenes,
        handleGenerateStoryBible, handleGenerateScenes, isLoading: isProjectLoading,
        scenesToReview, applySuggestions
    } = useProjectData();

    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [refinedSceneIds, setRefinedSceneIds] = useState(new Set<string>());
    const [continuityModal, setContinuityModal] = useState<{ sceneId: string, lastFrame: string } | null>(null);
    const [isExtending, setIsExtending] = useState(false);

    const [localGenSettings, setLocalGenSettings] = usePersistentState('localGenSettings', { comfyUIUrl: '', comfyUIClientId: '', workflowJson: '', mapping: {} });
    const [generatedImages, setGeneratedImages] = usePersistentState('generatedImages', {});
    const [generatedShotImages, setGeneratedShotImages] = usePersistentState('generatedShotImages', {});
    const [continuityData, setContinuityData] = usePersistentState('continuityData', {});
    const [localGenStatus, setLocalGenStatus] = usePersistentState('localGenStatus', {});
    
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();

    // Effect for the interactive background gradient
    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const { clientX, clientY } = event;
            document.documentElement.style.setProperty('--mouse-x', `${clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${clientY}px`);
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

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

    // Set active scene when scenes are loaded/updated
    useEffect(() => {
        if (scenes.length > 0 && !scenes.find(s => s.id === activeSceneId)) {
            setActiveSceneId(scenes[0].id);
        } else if (scenes.length === 0) {
            setActiveSceneId(null);
        }
    }, [scenes, activeSceneId]);

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

    const handleApplySuggestion = (suggestion: Suggestion, sceneId: string) => {
        // This is now the single dispatcher for all suggestion types.
        applySuggestions([suggestion], sceneId, addToast);
        
        // Mark scene as refined if it was a timeline change
        if (suggestion.type === 'ADD_SHOT_AFTER' || suggestion.type === 'UPDATE_SHOT') {
            setRefinedSceneIds(prev => new Set(prev).add(sceneId));
        }
    };

    const handleUpdateSceneSummary = async (sceneId: string): Promise<boolean> => {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) {
            addToast("Scene not found for summary update.", 'error');
            return false;
        }
        try {
            const newSummary = await updateSceneSummaryWithRefinements(scene.summary, scene.timeline, logApiCall, updateApiStatus);
            const updatedScenes = scenes.map(s => s.id === sceneId ? { ...s, summary: newSummary } : s);
            setScenes(updatedScenes);
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
                        <StoryIdeaForm onSubmit={(idea) => handleGenerateStoryBible(idea, addToast)} isLoading={isProjectLoading} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />
                    </>
                )
            case 'bible':
                return storyBible && <StoryBibleEditor storyBible={storyBible} onUpdate={setStoryBible} onGenerateScenes={() => setWorkflowStage('vision')} isLoading={isProjectLoading} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />;
            case 'vision':
                return storyBible && <DirectorsVisionForm onSubmit={(vision) => handleGenerateScenes(vision, addToast, setGeneratedImages)} isLoading={isProjectLoading} storyBible={storyBible} onApiStateChange={updateApiStatus} onApiLog={logApiCall} />;
            case 'director':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="lg:col-span-1">
                            <SceneNavigator scenes={scenes} activeSceneId={activeSceneId} onSelectScene={setActiveSceneId} scenesToReview={scenesToReview} />
                        </div>
                        <div className="lg:col-span-3">
                            {activeScene ? <TimelineEditor 
                                key={activeScene.id} 
                                scene={activeScene} 
                                onUpdateScene={(updatedScene) => {
                                    const newScenes = scenes.map(s => s.id === updatedScene.id ? updatedScene : s);
                                    setScenes(newScenes);
                                }} 
                                directorsVision={directorsVision} 
                                storyBible={storyBible!} 
                                onApiStateChange={updateApiStatus} 
                                onApiLog={logApiCall} 
                                scenes={scenes}
                                onApplySuggestion={handleApplySuggestion}
                                generatedImages={generatedImages}
                                generatedShotImages={generatedShotImages}
                                setGeneratedShotImages={setGeneratedShotImages}
                                localGenSettings={localGenSettings}
                                localGenStatus={localGenStatus}
                                setLocalGenStatus={setLocalGenStatus}
                                isRefined={refinedSceneIds.has(activeScene.id)}
                                onUpdateSceneSummary={handleUpdateSceneSummary}
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
                    onApplySuggestion={handleApplySuggestion}
                    refinedSceneIds={refinedSceneIds}
                    onUpdateSceneSummary={handleUpdateSceneSummary}
                    onExtendTimeline={handleExtendTimeline}
                />;
            default:
                return <p>Welcome! Please start with an idea.</p>;
        }
    };
    
    if (isProjectLoading && workflowStage === 'idea') {
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