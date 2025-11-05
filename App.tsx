import React, { useState, useCallback, useMemo, useEffect } from 'react';
import StoryIdeaForm from './components/StoryIdeaForm';
import StoryBibleEditor from './components/StoryBibleEditor';
import SceneNavigator from './components/SceneNavigator';
import TimelineEditor from './components/TimelineEditor';
import CoDirector from './components/CoDirector';
import DirectorsVisionForm from './components/DirectorsVisionForm';
import ContinuityDirector from './components/ContinuityDirector';
import { generateStoryBible, generateSceneList, generateInitialShotsForScene, getCoDirectorSuggestions, generateSceneImage, suggestCoDirectorObjectives, generateVideoPrompt, getPrunedContextForShotGeneration, getPrunedContextForCoDirector, ApiStateChangeCallback } from './services/geminiService';
import { StoryBible, Scene, Shot, ShotEnhancers, CoDirectorResult, Suggestion, TimelineData, ToastMessage, SceneContinuityData } from './types';
import Toast from './components/Toast';
import WorkflowTracker, { WorkflowStage } from './components/WorkflowTracker';
import SaveIcon from './components/icons/SaveIcon';
import * as db from './utils/database';
import { ApiStatusProvider, useApiStatus } from './contexts/ApiStatusContext';
import ApiStatusIndicator from './components/ApiStatusIndicator';

const emptyTimeline: TimelineData = {
    shots: [],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: '',
};

const AppContent: React.FC = () => {
    const { updateApiStatus } = useApiStatus();
    const handleApiStateChange: ApiStateChangeCallback = useCallback((status, message) => {
        updateApiStatus(status, message);
    }, [updateApiStatus]);

    // App Flow & State
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    
    // Generation State
    const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
    const [generatedPrompts, setGeneratedPrompts] = useState<Record<string, string>>({});
    const [continuityData, setContinuityData] = useState<Record<string, SceneContinuityData>>({});

    const [generationStatus, setGenerationStatus] = useState<{
        sceneId: string | null;
        type: 'image' | 'prompt' | null;
        status: 'idle' | 'generating' | 'success' | 'error';
        error: string | null;
    }>({ sceneId: null, type: null, status: 'idle', error: null });

    // UI and Loading State
    const [isLoading, setIsLoading] = useState(true); // Start true for DB load
    const [loadingMessage, setLoadingMessage] = useState('Loading project...');
    const [coDirectorResult, setCoDirectorResult] = useState<CoDirectorResult | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // --- Load project from DB on initial render ---
    useEffect(() => {
        const loadProject = async () => {
            try {
                const [bible, savedScenes, vision, images, prompts, savedContinuityData, savedStage] = await Promise.all([
                    db.getStoryBible(),
                    db.getAllScenes(),
                    db.getData('directorsVision'),
                    db.getData('generatedImages'),
                    db.getData('generatedPrompts'),
                    db.getData('continuityData'),
                    db.getData('workflowStage'),
                ]);

                if (bible) {
                    setStoryBible(bible);
                    setScenes(savedScenes || []);
                    setDirectorsVision(vision || '');
                    setGeneratedImages(images || {});
                    setGeneratedPrompts(prompts || {});
                    setContinuityData(savedContinuityData || {});
                    
                    let loadedStage: WorkflowStage = savedStage || 'bible';
                    if (!vision) loadedStage = 'bible';
                    else if (!savedScenes || savedScenes.length === 0) loadedStage = 'vision';
                    
                    setWorkflowStage(loadedStage);

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
    
    // --- Toast Notifications ---
    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);
    
    // --- Context Optimization ---
    const getNarrativeContext = useCallback((sceneId: string): string => {
        if (!storyBible || !scenes.length) return '';
        
        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        const scene = scenes[sceneIndex];
        if (sceneIndex === -1) return '';

        const plotLines = storyBible.plotOutline.split('\n');
        const actStarts: Record<string, number> = {
            'act i': plotLines.findIndex(l => l.toLowerCase().includes('act i')),
            'act ii': plotLines.findIndex(l => l.toLowerCase().includes('act ii')),
            'act iii': plotLines.findIndex(l => l.toLowerCase().includes('act iii')),
        };

        const sceneFraction = scenes.length > 1 ? sceneIndex / (scenes.length - 1) : 0;
        let currentActKey: 'act i' | 'act ii' | 'act iii' = 'act i';
        if (actStarts['act iii'] !== -1 && sceneFraction >= 0.7) {
            currentActKey = 'act iii';
        } else if (actStarts['act ii'] !== -1 && sceneFraction >= 0.3) {
            currentActKey = 'act ii';
        }

        let actText = '';
        const start = actStarts[currentActKey];
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

        return `
This scene, "${scene.title}", occurs within the following narrative act:
${actText}

CONTEXT FROM ADJACENT SCENES:
- ${prevSceneSummary}
- ${nextSceneSummary}
      `.trim();
    }, [storyBible, scenes]);

    // --- Core Workflow Handlers ---
    const handleStoryBibleSubmit = async (idea: string) => {
        setIsLoading(true);
        setLoadingMessage('Generating your story bible...');
        try {
            const bible = await generateStoryBible(idea, handleApiStateChange);
            setStoryBible(bible);
            setWorkflowStage('bible');
            addToast('Story bible generated!', 'success');
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to generate story bible: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    const handleDirectorsVisionSubmit = async (vision: string) => {
        setIsLoading(true);
        setLoadingMessage('Generating scenes based on your vision...');
        setDirectorsVision(vision);
        try {
            if (!storyBible) throw new Error("Story bible not available.");
            const sceneList = await generateSceneList(storyBible.plotOutline, vision, handleApiStateChange);
            const newScenes: Scene[] = sceneList.map((s, i) => ({
                id: `scene_${Date.now()}_${i}`,
                title: s.title,
                summary: s.summary,
                timeline: emptyTimeline
            }));
            setScenes(newScenes);
            setActiveSceneId(newScenes[0].id);
            setWorkflowStage('director');
            addToast('Scene list generated!', 'success');
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to generate scenes: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const handleSceneSelect = async (sceneId: string) => {
        setActiveSceneId(sceneId);
        const selectedScene = scenes.find(s => s.id === sceneId);
        if (selectedScene && selectedScene.timeline.shots.length === 0) {
            setIsLoading(true);
            setLoadingMessage(`Generating initial shots for "${selectedScene.title}"...`);
            try {
                if (!storyBible || !directorsVision) throw new Error("Missing context for shot generation.");
                
                const prunedContext = await getPrunedContextForShotGeneration(storyBible, getNarrativeContext(sceneId), selectedScene.summary, directorsVision, handleApiStateChange);
                const shotDescriptions = await generateInitialShotsForScene(prunedContext, handleApiStateChange);

                const newShots: Shot[] = shotDescriptions.map(desc => ({
                    id: `shot_${Date.now()}_${Math.random()}`,
                    description: desc
                }));
                const newTransitions = new Array(newShots.length - 1).fill('Cut');
                
                setScenes(prevScenes => prevScenes.map(s =>
                    s.id === sceneId ? { ...s, timeline: { ...s.timeline, shots: newShots, transitions: newTransitions } } : s
                ));
                addToast(`Initial shots generated for ${selectedScene.title}`, 'success');
            } catch (error) {
                console.error(error);
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
                addToast(`Failed to generate initial shots: ${errorMessage}`, 'error');
            } finally {
                setIsLoading(false);
                setLoadingMessage('');
            }
        }
    };
    
    const handleProceedToReview = () => setWorkflowStage('continuity');

    // --- Timeline & Generation Handlers ---
    const updateActiveSceneTimeline = useCallback((updater: (prevTimeline: TimelineData) => TimelineData) => {
        if (!activeSceneId) return;
        setScenes(prevScenes =>
            prevScenes.map(scene =>
                scene.id === activeSceneId
                    ? { ...scene, timeline: updater(scene.timeline) }
                    : scene
            )
        );
    }, [activeSceneId]);

    const handleGenerateImage = async (timelineData: TimelineData) => {
        if (!activeSceneId) return;
        setGenerationStatus({ sceneId: activeSceneId, type: 'image', status: 'generating', error: null });
        try {
            if (!directorsVision) throw new Error("Director's vision is required.");
            const base64Image = await generateSceneImage(timelineData, directorsVision, handleApiStateChange);
            setGeneratedImages(prev => ({ ...prev, [activeSceneId]: base64Image }));
            setGenerationStatus({ sceneId: activeSceneId, type: 'image', status: 'success', error: null });
            addToast('Scene keyframe rendered!', 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(error);
            setGenerationStatus({ sceneId: activeSceneId, type: 'image', status: 'error', error: errorMessage });
            addToast(`Image generation failed: ${errorMessage}`, 'error');
        }
    };

    const handleGeneratePrompt = async (timelineData: TimelineData) => {
        if (!activeSceneId) return;
        setGenerationStatus({ sceneId: activeSceneId, type: 'prompt', status: 'generating', error: null });
        try {
            if (!directorsVision) throw new Error("Director's vision is required.");
            const prompt = await generateVideoPrompt(timelineData, directorsVision, handleApiStateChange);
            setGeneratedPrompts(prev => ({ ...prev, [activeSceneId]: prompt }));
            setGenerationStatus({ sceneId: activeSceneId, type: 'prompt', status: 'success', error: null });
            addToast('Final prompt generated!', 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(error);
            setGenerationStatus({ sceneId: activeSceneId, type: 'prompt', status: 'error', error: errorMessage });
            addToast(`Prompt generation failed: ${errorMessage}`, 'error');
        }
    };

    const handleGetCoDirectorSuggestions = async (objective: string) => {
        if (!activeSceneId) return;
        const activeScene = scenes.find(s => s.id === activeSceneId);
        if (!activeScene || !storyBible || !directorsVision) {
            addToast('Cannot get suggestions without full context.', 'error');
            return;
        }

        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const prunedContext = await getPrunedContextForCoDirector(storyBible, getNarrativeContext(activeSceneId), activeScene, directorsVision, handleApiStateChange);
            const result = await getCoDirectorSuggestions(prunedContext, activeScene, objective, handleApiStateChange);
            setCoDirectorResult(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(error);
            addToast(`Co-Director failed: ${errorMessage}`, 'error');
        } finally {
            setIsCoDirectorLoading(false);
        }
    };
    
    const handleApplySuggestion = (suggestion: Suggestion) => {
        const { type, payload } = suggestion;
        updateActiveSceneTimeline(prev => {
            let newShots = [...prev.shots];
            let newEnhancers = { ...prev.shotEnhancers };
            let newTransitions = [...prev.transitions];

            if (type === 'UPDATE_SHOT' && suggestion.shot_id) {
                newShots = newShots.map(s => s.id === suggestion.shot_id ? { ...s, description: payload.description || s.description } : s);
                if (payload.enhancers) {
                    newEnhancers[suggestion.shot_id] = { ...newEnhancers[suggestion.shot_id], ...payload.enhancers };
                }
            } else if (type === 'ADD_SHOT_AFTER' && suggestion.after_shot_id) {
                const newShot: Shot = { id: `shot_${Date.now()}`, description: payload.description || '', title: payload.title };
                const index = newShots.findIndex(s => s.id === suggestion.after_shot_id);
                if (index > -1) {
                    newShots.splice(index + 1, 0, newShot);
                    newTransitions.splice(index + 1, 0, 'Cut');
                    if (payload.enhancers) newEnhancers[newShot.id] = payload.enhancers;
                }
            } else if (type === 'UPDATE_TRANSITION' && suggestion.transition_index !== undefined) {
                if (suggestion.transition_index < newTransitions.length) {
                    newTransitions[suggestion.transition_index] = payload.type || newTransitions[suggestion.transition_index];
                }
            }

            return { ...prev, shots: newShots, shotEnhancers: newEnhancers, transitions: newTransitions };
        });
        addToast("Co-Director's suggestion applied!", "success");
    };

    const onSaveProject = useCallback(async () => {
        setIsLoading(true);
        setLoadingMessage("Saving project...");
        try {
            if (storyBible) await db.saveStoryBible(storyBible);
            if (scenes.length > 0) await db.saveScenes(scenes);
            if (directorsVision) await db.saveData('directorsVision', directorsVision);
            if (Object.keys(generatedImages).length > 0) await db.saveData('generatedImages', generatedImages);
            if (Object.keys(generatedPrompts).length > 0) await db.saveData('generatedPrompts', generatedPrompts);
            if (Object.keys(continuityData).length > 0) await db.saveData('continuityData', continuityData);
            await db.saveData('workflowStage', workflowStage);
            addToast("Project Saved Successfully!", "success");
        } catch (error) {
            console.error("Failed to save project", error);
            addToast("Error saving project.", "error");
        } finally {
            setIsLoading(false);
            setLoadingMessage("");
        }
    }, [storyBible, scenes, directorsVision, generatedImages, generatedPrompts, continuityData, workflowStage, addToast]);
    
    const handleClearProject = async () => {
        if (window.confirm("Are you sure you want to delete all data and start a new project? This cannot be undone.")) {
            await db.clearProjectData();
            window.location.reload();
        }
    };
    
    // --- Memoized Values for Performance ---
    const activeScene = useMemo(() => scenes.find(s => s.id === activeSceneId), [scenes, activeSceneId]);
    const activeSceneIndex = useMemo(() => scenes.findIndex(s => s.id === activeSceneId), [scenes, activeSceneId]);
    const nextScene = useMemo(() => (activeSceneIndex > -1 && activeSceneIndex < scenes.length - 1) ? scenes[activeSceneIndex + 1] : null, [scenes, activeSceneIndex]);
    
    const handleGoToNextScene = useCallback(() => {
        if (nextScene) {
            handleSceneSelect(nextScene.id);
        }
    }, [nextScene]);


    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="text-center p-10">
                    <svg className="animate-spin h-10 w-10 text-indigo-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-lg font-semibold text-gray-200">{loadingMessage}</p>
                </div>
            );
        }
        
        switch (workflowStage) {
            case 'idea':
                return <StoryIdeaForm onSubmit={handleStoryBibleSubmit} isLoading={isLoading} onApiStateChange={handleApiStateChange} />;
            case 'bible':
                if (storyBible) return <StoryBibleEditor storyBible={storyBible} setStoryBible={setStoryBible} onContinue={() => setWorkflowStage('vision')} isLoading={isLoading} onApiStateChange={handleApiStateChange} />;
                return null;
            case 'vision':
                if (storyBible) return <DirectorsVisionForm storyBible={storyBible} onSubmit={handleDirectorsVisionSubmit} isLoading={isLoading} onApiStateChange={handleApiStateChange} />;
                return null;
            case 'director':
                 if (activeScene) {
                    return (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1">
                                <SceneNavigator scenes={scenes} activeSceneId={activeSceneId} onSelectScene={handleSceneSelect} />
                            </div>
                            <div className="lg:col-span-2 space-y-6">
                                <CoDirector 
                                    isLoading={isCoDirectorLoading}
                                    result={coDirectorResult}
                                    onGetSuggestions={handleGetCoDirectorSuggestions}
                                    onApplySuggestion={handleApplySuggestion}
                                    onClose={() => setCoDirectorResult(null)}
                                    onGetInspiration={() => suggestCoDirectorObjectives(storyBible!.logline, activeScene.summary, directorsVision, handleApiStateChange)}
                                />
                                <TimelineEditor
                                    key={activeScene.id}
                                    scene={activeScene}
                                    storyBible={storyBible!}
                                    directorsVision={directorsVision}
                                    narrativeContext={getNarrativeContext(activeScene.id)}
                                    imageUrl={generatedImages[activeScene.id]}
                                    setShots={updater => updateActiveSceneTimeline(t => ({ ...t, shots: typeof updater === 'function' ? updater(t.shots) : updater }))}
                                    setShotEnhancers={updater => updateActiveSceneTimeline(t => ({ ...t, shotEnhancers: typeof updater === 'function' ? updater(t.shotEnhancers) : updater }))}
                                    setTransitions={updater => updateActiveSceneTimeline(t => ({ ...t, transitions: typeof updater === 'function' ? updater(t.transitions) : updater }))}
                                    setNegativePrompt={updater => updateActiveSceneTimeline(t => ({ ...t, negativePrompt: typeof updater === 'function' ? updater(t.negativePrompt) : updater }))}
                                    onGenerateImage={handleGenerateImage}
                                    isGeneratingImage={generationStatus.type === 'image' && generationStatus.status === 'generating'}
                                    onGoToNextScene={handleGoToNextScene}
                                    nextScene={nextScene}
                                    onGeneratePrompt={handleGeneratePrompt}
                                    isGeneratingPrompt={generationStatus.type === 'prompt' && generationStatus.status === 'generating'}
                                    generatedPrompt={generatedPrompts[activeScene.id]}
                                    onProceedToReview={handleProceedToReview}
                                    onApiStateChange={handleApiStateChange}
                                />
                            </div>
                        </div>
                    );
                }
                return <p>Loading scene...</p>;
            case 'continuity':
                 if (storyBible) {
                    return (
                        <ContinuityDirector
                            scenes={scenes}
                            storyBible={storyBible}
                            directorsVision={directorsVision}
                            generatedImages={generatedImages}
                            videoPrompts={generatedPrompts}
                            continuityData={continuityData}
                            setContinuityData={setContinuityData}
                            addToast={addToast}
                            onApiStateChange={handleApiStateChange}
                        />
                    );
                }
                return <p>Loading continuity review...</p>;
            default:
                return <p>Welcome! Please start with an idea.</p>;
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-900 text-gray-100">
            <Toast toasts={toasts} removeToast={removeToast} />
            <main className="container mx-auto px-4 py-8">
                <header className="text-center mb-12">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500">Cinematic Story Generator</h1>
                    <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">From a simple idea to a complete, production-ready cinematic package.</p>
                </header>
                
                <WorkflowTracker currentStage={workflowStage} />

                {renderContent()}

                {storyBible && (
                    <div className="fixed bottom-4 right-4 z-30 flex gap-2">
                         <button onClick={onSaveProject} className="p-3 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors" aria-label="Save Project">
                            <SaveIcon className="w-6 h-6" />
                        </button>
                         <button onClick={handleClearProject} className="p-3 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-colors" aria-label="Clear Project">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                )}
                 <ApiStatusIndicator />
            </main>
        </div>
    );
};

const App: React.FC = () => (
    <ApiStatusProvider>
        <AppContent />
    </ApiStatusProvider>
)

export default App;