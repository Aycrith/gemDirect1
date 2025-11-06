import React, { useState, useCallback, useMemo, useEffect } from 'react';
import StoryIdeaForm from './components/StoryIdeaForm';
import StoryBibleEditor from './components/StoryBibleEditor';
import SceneNavigator from './components/SceneNavigator';
import TimelineEditor from './components/TimelineEditor';
import CoDirector from './components/CoDirector';
import DirectorsVisionForm from './components/DirectorsVisionForm';
import ContinuityDirector from './components/ContinuityDirector';
import FinalPromptModal from './components/FinalPromptModal';
import { generateStoryBible, generateSceneList, generateInitialShotsForScene, getPrunedContextForShotGeneration, getPrunedContextForCoDirector, ApiStateChangeCallback, ApiLogCallback, suggestCoDirectorObjectives, getCoDirectorSuggestions, generateKeyframeForScene } from './services/geminiService';
import { generateVideoRequestPayloads } from './services/videoGenerationService';
import { StoryBible, Scene, Shot, ShotEnhancers, CoDirectorResult, Suggestion, TimelineData, ToastMessage, SceneContinuityData } from './types';
import Toast from './components/Toast';
import WorkflowTracker, { WorkflowStage } from './components/WorkflowTracker';
import SaveIcon from './components/icons/SaveIcon';
import * as db from './utils/database';
import { ApiStatusProvider, useApiStatus } from './contexts/ApiStatusContext';
import { UsageProvider, useUsage } from './contexts/UsageContext';
import ApiStatusIndicator from './components/ApiStatusIndicator';
import UsageDashboard from './components/UsageDashboard';
import BarChartIcon from './components/icons/BarChartIcon';

const emptyTimeline: TimelineData = {
    shots: [],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: '',
};

const AppContent: React.FC = () => {
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();
    
    const [isUsageDashboardOpen, setIsUsageDashboardOpen] = useState(false);

    const handleApiStateChange: ApiStateChangeCallback = useCallback((status, message) => {
        updateApiStatus(status, message);
    }, [updateApiStatus]);

    const handleApiLog: ApiLogCallback = useCallback((log) => {
        logApiCall(log);
    }, [logApiCall]);

    // App Flow & State
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    
    // Generation State
    const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({}); // Keyframes
    const [continuityData, setContinuityData] = useState<Record<string, SceneContinuityData>>({});
    
    // UI and Loading State
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Loading project...');
    const [coDirectorResult, setCoDirectorResult] = useState<CoDirectorResult | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [finalPrompt, setFinalPrompt] = useState<{ json: string; text: string; } | null>(null);


    useEffect(() => {
        const loadProject = async () => {
            try {
                const [bible, savedScenes, vision, images, savedContinuityData, savedStage] = await Promise.all([
                    db.getStoryBible(),
                    db.getAllScenes(),
                    db.getData('directorsVision'),
                    db.getData('generatedImages'),
                    db.getData('continuityData'),
                    db.getData('workflowStage'),
                ]);

                if (bible) {
                    setStoryBible(bible);
                    const loadedScenes = savedScenes || [];
                    // Data sanitization step to prevent crashes from old/corrupt data
                    const sanitizedScenes = loadedScenes.map(s => ({
                        ...s,
                        timeline: s.timeline || emptyTimeline,
                    }));
                    setScenes(sanitizedScenes);
                    setDirectorsVision(vision || '');
                    setGeneratedImages(images || {});
                    setContinuityData(savedContinuityData || {});
                    
                    let determinedStage: WorkflowStage = 'bible';
                    if (vision) determinedStage = 'vision';
                    if (savedScenes && savedScenes.length > 0) determinedStage = 'director';

                    // Prefer the saved stage if it's not "ahead" of what's possible with the loaded data.
                    const stageOrder: WorkflowStage[] = ['idea', 'bible', 'vision', 'director', 'continuity'];
                    const savedStageIndex = stageOrder.indexOf(savedStage);
                    const determinedStageIndex = stageOrder.indexOf(determinedStage);

                    let finalStage: WorkflowStage = determinedStage;
                    if (savedStage && savedStageIndex <= determinedStageIndex) {
                        finalStage = savedStage;
                    }
                    if (savedStage === 'continuity' && determinedStageIndex >= stageOrder.indexOf('director')) {
                        finalStage = 'continuity';
                    }

                    setWorkflowStage(finalStage);

                    if (savedScenes && savedScenes.length > 0) {
                        setActiveSceneId(savedScenes[0].id);
                    }

                } else {
                    setWorkflowStage('idea');
                }
            } catch (error) {
                console.error("Failed to load project from database", error);
                addToast("Could not load saved project.", "error");
            } finally {
                setIsLoading(false);
                setLoadingMessage('');
            }
        };
        loadProject();
    }, []);
    
    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);
    
    const getNarrativeContext = useCallback((sceneId: string): string => {
        if (!storyBible || !scenes.length) return '';
        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return '';
        const plotLines = storyBible.plotOutline.split('\n');
        const actStarts = {
            'act i': plotLines.findIndex(l => l.toLowerCase().includes('act i')),
            'act ii': plotLines.findIndex(l => l.toLowerCase().includes('act ii')),
            'act iii': plotLines.findIndex(l => l.toLowerCase().includes('act iii')),
        };
        const sceneFraction = scenes.length > 1 ? sceneIndex / (scenes.length - 1) : 0;
        let currentActKey: 'act i' | 'act ii' | 'act iii' = 'act i';
        if (actStarts['act iii'] !== -1 && sceneFraction >= 0.7) currentActKey = 'act iii';
        else if (actStarts['act ii'] !== -1 && sceneFraction >= 0.3) currentActKey = 'act ii';
        const start = actStarts[currentActKey];
        let actText = '';
        if (start !== -1) {
            let end: number | undefined;
            if (currentActKey === 'act i') end = actStarts['act ii'] !== -1 ? actStarts['act ii'] : actStarts['act iii'];
            if (currentActKey === 'act ii') end = actStarts['act iii'] !== -1 ? actStarts['act iii'] : undefined;
            actText = plotLines.slice(start, end).join('\n');
        } else {
            actText = storyBible.plotOutline;
        }
        const prevSceneSummary = sceneIndex > 0 ? `PREVIOUS SCENE: ${scenes[sceneIndex - 1].summary}` : 'This is the opening scene.';
        const nextSceneSummary = sceneIndex < scenes.length - 1 ? `NEXT SCENE: ${scenes[sceneIndex + 1].summary}` : 'This is the final scene.';
        return `This scene occurs within:\n${actText}\nContext:\n- ${prevSceneSummary}\n- ${nextSceneSummary}`.trim();
    }, [storyBible, scenes]);

    const handleStoryBibleSubmit = async (idea: string) => {
        setIsLoading(true);
        setLoadingMessage('Generating your story bible...');
        try {
            const bible = await generateStoryBible(idea, handleApiLog, handleApiStateChange);
            setStoryBible(bible);
            setWorkflowStage('bible');
            addToast('Story bible generated!', 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to generate story bible: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDirectorsVisionSubmit = async (vision: string) => {
        setIsLoading(true);
        setLoadingMessage('Generating scenes based on your vision...');
        setDirectorsVision(vision);
        try {
            if (!storyBible) throw new Error("Story bible not available.");
            const sceneList = await generateSceneList(storyBible.plotOutline, vision, handleApiLog, handleApiStateChange);
            const newScenes: Scene[] = sceneList.map((s, i) => ({
                id: `scene_${Date.now()}_${i}`, title: s.title, summary: s.summary, timeline: emptyTimeline
            }));
            setScenes(newScenes);
            setActiveSceneId(newScenes[0].id);
            setWorkflowStage('director');
            addToast('Scene list generated!', 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to generate scenes: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const generateShotsForScene = useCallback(async (sceneId: string) => {
        const sceneToProcess = scenes.find(s => s.id === sceneId);
        if (!sceneToProcess || sceneToProcess.timeline.shots.length > 0 || !storyBible || !directorsVision) {
            return;
        }
    
        setIsLoading(true);
        setLoadingMessage(`Generating initial shots for "${sceneToProcess.title}"...`);
        try {
            const prunedContext = await getPrunedContextForShotGeneration(storyBible, getNarrativeContext(sceneId), sceneToProcess.summary, directorsVision, handleApiLog, handleApiStateChange);
            const shotDescriptions = await generateInitialShotsForScene(prunedContext, handleApiLog, handleApiStateChange);
            const newShots: Shot[] = shotDescriptions.map(desc => ({ id: `shot_${Date.now()}_${Math.random()}`, description: desc }));
            const newTransitions = newShots.length > 1 ? new Array(newShots.length - 1).fill('Cut') : [];
            setScenes(prevScenes => prevScenes.map(s =>
                s.id === sceneId ? { ...s, timeline: { ...s.timeline, shots: newShots, transitions: newTransitions } } : s
            ));
            addToast(`Initial shots generated for ${sceneToProcess.title}`, 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to generate initial shots: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [scenes, storyBible, directorsVision, handleApiLog, handleApiStateChange, getNarrativeContext, addToast]);
    
    const handleSceneSelect = (sceneId: string) => {
        setActiveSceneId(sceneId);
    };

    const activeScene = useMemo(() => scenes.find(s => s.id === activeSceneId), [scenes, activeSceneId]);

    useEffect(() => {
        const isReadyForGeneration = activeScene &&
                                    activeScene.timeline.shots.length === 0 &&
                                    (workflowStage === 'director' || workflowStage === 'continuity') &&
                                    storyBible && directorsVision && !isLoading;

        if (isReadyForGeneration) {
            generateShotsForScene(activeScene.id);
        }
    }, [activeScene, workflowStage, isLoading, storyBible, directorsVision, generateShotsForScene]);

    const updateActiveSceneTimeline = (timelineUpdater: (prevTimeline: TimelineData) => TimelineData) => {
        if (!activeSceneId) return;
        setScenes(prevScenes =>
            prevScenes.map(s =>
                s.id === activeSceneId ? { ...s, timeline: timelineUpdater(s.timeline) } : s
            )
        );
    };

    const handleSetShots = (setter: React.SetStateAction<Shot[]>) => {
        updateActiveSceneTimeline(prev => ({
            ...prev,
            shots: typeof setter === 'function' ? setter(prev.shots) : setter
        }));
    };

    const handleSetShotEnhancers = (setter: React.SetStateAction<ShotEnhancers>) => {
        updateActiveSceneTimeline(prev => ({
            ...prev,
            shotEnhancers: typeof setter === 'function' ? setter(prev.shotEnhancers) : setter
        }));
    };

    const handleSetTransitions = (setter: React.SetStateAction<string[]>) => {
        updateActiveSceneTimeline(prev => ({
            ...prev,
            transitions: typeof setter === 'function' ? setter(prev.transitions) : setter
        }));
    };

    const handleSetNegativePrompt = (setter: React.SetStateAction<string>) => {
        updateActiveSceneTimeline(prev => ({
            ...prev,
            negativePrompt: typeof setter === 'function' ? setter(prev.negativePrompt) : setter
        }));
    };

    const handleCoDirectorSubmit = async (objective: string) => {
        if (!activeSceneId || !storyBible || !directorsVision) {
            addToast("Cannot get suggestions without an active scene and context.", 'error');
            return;
        }
        const activeScene = scenes.find(s => s.id === activeSceneId);
        if (!activeScene) return;

        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const prunedContext = await getPrunedContextForCoDirector(storyBible, getNarrativeContext(activeSceneId), activeScene, directorsVision, handleApiLog, handleApiStateChange);
            const result = await getCoDirectorSuggestions(prunedContext, activeScene, objective, handleApiLog, handleApiStateChange);
            setCoDirectorResult(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Co-Director failed: ${errorMessage}`, 'error');
        } finally {
            setIsCoDirectorLoading(false);
        }
    };
    
    const handleApplySuggestion = useCallback((suggestion: Suggestion) => {
        setScenes(prevScenes => {
            if (!activeSceneId) return prevScenes;
            return prevScenes.map(scene => {
                if (scene.id !== activeSceneId) return scene;

                let newTimeline = { ...scene.timeline };
                const { type, payload } = suggestion;

                if (type === 'UPDATE_SHOT' && suggestion.shot_id) {
                    newTimeline.shots = newTimeline.shots.map(shot =>
                        shot.id === suggestion.shot_id ? { ...shot, ...payload } : shot
                    );
                    if (payload.enhancers) {
                        newTimeline.shotEnhancers = {
                            ...newTimeline.shotEnhancers,
                            [suggestion.shot_id]: { ...(newTimeline.shotEnhancers[suggestion.shot_id] || {}), ...payload.enhancers }
                        };
                    }
                } else if (type === 'ADD_SHOT_AFTER' && suggestion.after_shot_id && payload.description) {
                    const newShot: Shot = { id: `shot_${Date.now()}`, description: payload.description, title: payload.title };
                    const index = newTimeline.shots.findIndex(s => s.id === suggestion.after_shot_id);
                    if (index > -1) {
                        newTimeline.shots.splice(index + 1, 0, newShot);
                        newTimeline.transitions.splice(index, 0, 'Cut');
                        if (payload.enhancers) {
                            newTimeline.shotEnhancers[newShot.id] = payload.enhancers;
                        }
                    }
                } else if (type === 'UPDATE_TRANSITION' && typeof suggestion.transition_index !== 'undefined' && payload.type) {
                     if (suggestion.transition_index < newTimeline.transitions.length) {
                        newTimeline.transitions[suggestion.transition_index] = payload.type;
                    }
                }

                return { ...scene, timeline: newTimeline };
            });
        });
        addToast('Suggestion applied!', 'success');
    }, [activeSceneId]);
    
    const handleGetInspiration = async () => {
        if (!storyBible || !activeSceneId) return;
        const activeScene = scenes.find(s => s.id === activeSceneId);
        if (!activeScene) return;
        return suggestCoDirectorObjectives(storyBible.logline, activeScene.summary, directorsVision, handleApiLog, handleApiStateChange);
    }
    
    const handleSaveProject = async () => {
        setIsLoading(true);
        setLoadingMessage('Saving project...');
        try {
            if (storyBible) await db.saveStoryBible(storyBible);
            await db.saveScenes(scenes);
            await db.saveData('directorsVision', directorsVision);
            await db.saveData('generatedImages', generatedImages);
            await db.saveData('continuityData', continuityData);
            await db.saveData('workflowStage', workflowStage);
            addToast('Project saved successfully!', 'success');
        } catch (error) {
            console.error("Failed to save project", error);
            addToast('Failed to save project.', 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerateVideo = async (sceneId: string, timeline: TimelineData) => {
        const activeScene = scenes.find(s => s.id === sceneId);
        if (!activeScene || !directorsVision) {
            addToast('Could not generate video request: missing scene data or director\'s vision.', 'error');
            return;
        }
        
        const payloads = generateVideoRequestPayloads(timeline, directorsVision, activeScene.summary);
        setFinalPrompt(payloads);

        try {
            addToast('Generating scene keyframe...', 'info');
            const base64Image = await generateKeyframeForScene(payloads.text, handleApiLog, handleApiStateChange);
            setGeneratedImages(prev => ({ ...prev, [sceneId]: base64Image }));
            addToast('Scene keyframe generated!', 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to generate keyframe: ${errorMessage}`, 'error');
        }
    };
    
    const getNextScene = () => {
        if (!activeSceneId) return null;
        const currentIndex = scenes.findIndex(s => s.id === activeSceneId);
        if (currentIndex > -1 && currentIndex < scenes.length - 1) {
            return scenes[currentIndex + 1];
        }
        return null;
    }

    const renderStageContent = () => {
        switch (workflowStage) {
            case 'idea':
                return <StoryIdeaForm onSubmit={handleStoryBibleSubmit} isLoading={isLoading} onApiStateChange={handleApiStateChange} onApiLog={handleApiLog} />;
            case 'bible':
                if (storyBible) return <StoryBibleEditor storyBible={storyBible} setStoryBible={setStoryBible} onContinue={() => setWorkflowStage('vision')} isLoading={isLoading} onApiStateChange={handleApiStateChange} onApiLog={handleApiLog} />;
                return null;
            case 'vision':
                 if (storyBible) return <DirectorsVisionForm onSubmit={handleDirectorsVisionSubmit} isLoading={isLoading} storyBible={storyBible} onApiStateChange={handleApiStateChange} onApiLog={handleApiLog} />;
                 return null;
            case 'director':
                if (!storyBible || !directorsVision) return <p>Missing Story Bible or Director's Vision.</p>;
                return (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                        <div className="md:col-span-1 lg:col-span-1">
                            <SceneNavigator scenes={scenes} activeSceneId={activeSceneId} onSelectScene={handleSceneSelect} />
                        </div>
                        <div className="md:col-span-2 lg:col-span-3">
                            {isLoading && <p>{loadingMessage}</p>}
                            {activeScene && !isLoading && (
                                <>
                                <CoDirector 
                                    onGetSuggestions={handleCoDirectorSubmit}
                                    isLoading={isCoDirectorLoading}
                                    result={coDirectorResult}
                                    onApplySuggestion={handleApplySuggestion}
                                    onClose={() => setCoDirectorResult(null)}
                                    onGetInspiration={handleGetInspiration}
                                    onApiLog={handleApiLog}
                                />
                                <TimelineEditor
                                    scene={activeScene}
                                    storyBible={storyBible}
                                    directorsVision={directorsVision}
                                    narrativeContext={getNarrativeContext(activeScene.id)}
                                    setShots={handleSetShots}
                                    setShotEnhancers={handleSetShotEnhancers}
                                    setTransitions={handleSetTransitions}
                                    setNegativePrompt={handleSetNegativePrompt}
                                    onGoToNextScene={() => {
                                        const nextScene = getNextScene();
                                        if (nextScene) handleSceneSelect(nextScene.id);
                                    }}
                                    nextScene={getNextScene()}
                                    onProceedToReview={() => setWorkflowStage('continuity')}
                                    onApiStateChange={handleApiStateChange}
                                    onApiLog={handleApiLog}
                                    onGenerateVideo={handleGenerateVideo}
                                    sceneContinuity={continuityData[activeScene.id]}
                                    generatedImage={generatedImages[activeScene.id]}
                                />
                                </>
                            )}
                        </div>
                    </div>
                );
             case 'continuity':
                if (!storyBible || !directorsVision) return <p>Missing Story Bible or Director's Vision.</p>;
                return <ContinuityDirector 
                            scenes={scenes}
                            storyBible={storyBible}
                            directorsVision={directorsVision}
                            generatedImages={generatedImages}
                            continuityData={continuityData}
                            setContinuityData={setContinuityData}
                            addToast={addToast}
                            onApiStateChange={handleApiStateChange}
                            onApiLog={handleApiLog}
                        />;
            default:
                return <p>Welcome to the Cinematic Story Generator!</p>;
        }
    }
    
    if (isLoading && !storyBible) {
      return <div className="flex justify-center items-center h-screen"><p>{loadingMessage}</p></div>
    }

    return (
        <div className="p-4 sm:p-8 max-w-screen-2xl mx-auto">
            <Toast toasts={toasts} removeToast={removeToast} />
            <div className="flex justify-between items-start mb-8">
                 <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Cinematic Story Generator</h1>
                 <div className="flex items-center gap-4">
                    <button onClick={handleSaveProject} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md border transition-colors bg-gray-700/50 border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-50">
                        <SaveIcon className="w-4 h-4" /> Save Project
                    </button>
                    <button onClick={() => setIsUsageDashboardOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md border transition-colors bg-gray-700/50 border-gray-600 text-gray-200 hover:bg-gray-700">
                        <BarChartIcon className="w-4 h-4" /> Usage
                    </button>
                 </div>
            </div>

            <WorkflowTracker currentStage={workflowStage} onStageClick={setWorkflowStage} />

            {renderStageContent()}
            
            <ApiStatusIndicator />
            <UsageDashboard isOpen={isUsageDashboardOpen} onClose={() => setIsUsageDashboardOpen(false)} />
            <FinalPromptModal isOpen={!!finalPrompt} onClose={() => setFinalPrompt(null)} payloads={finalPrompt} />
        </div>
    );
};


const App: React.FC = () => (
    <ApiStatusProvider>
        <UsageProvider>
            <AppContent />
        </UsageProvider>
    </ApiStatusProvider>
);

export default App;