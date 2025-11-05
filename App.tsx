import React, { useState, useCallback, useMemo, useEffect } from 'react';
import StoryIdeaForm from './components/StoryIdeaForm';
import StoryBibleEditor from './components/StoryBibleEditor';
import SceneNavigator from './components/SceneNavigator';
import TimelineEditor from './components/TimelineEditor';
import CoDirector from './components/CoDirector';
import DirectorsVisionForm from './components/DirectorsVisionForm';
import ContinuityDirector from './components/ContinuityDirector';
import FinalPromptModal from './components/FinalPromptModal';
import { generateStoryBible, generateSceneList, generateInitialShotsForScene, getPrunedContextForShotGeneration, getPrunedContextForCoDirector, ApiStateChangeCallback, ApiLogCallback, suggestCoDirectorObjectives, getCoDirectorSuggestions, generateVideoPrompt } from './services/geminiService';
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

type GenerationModalState = {
    isOpen: boolean;
    sceneId: string | null;
    jsonPayload: string | null;
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
    
    const [generationModalState, setGenerationModalState] = useState<GenerationModalState>({
        isOpen: false, sceneId: null, jsonPayload: null
    });

    // UI and Loading State
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Loading project...');
    const [coDirectorResult, setCoDirectorResult] = useState<CoDirectorResult | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);


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
                    setScenes(savedScenes || []);
                    setDirectorsVision(vision || '');
                    setGeneratedImages(images || {});
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

    const handleSceneSelect = async (sceneId: string) => {
        setActiveSceneId(sceneId);
        const selectedScene = scenes.find(s => s.id === sceneId);
        if (selectedScene && selectedScene.timeline.shots.length === 0) {
            setIsLoading(true);
            setLoadingMessage(`Generating initial shots for "${selectedScene.title}"...`);
            try {
                if (!storyBible || !directorsVision) throw new Error("Missing context for shot generation.");
                const prunedContext = await getPrunedContextForShotGeneration(storyBible, getNarrativeContext(sceneId), selectedScene.summary, directorsVision, handleApiLog, handleApiStateChange);
                const shotDescriptions = await generateInitialShotsForScene(prunedContext, handleApiLog, handleApiStateChange);
                const newShots: Shot[] = shotDescriptions.map(desc => ({ id: `shot_${Date.now()}_${Math.random()}`, description: desc }));
                const newTransitions = new Array(newShots.length - 1).fill('Cut');
                setScenes(prevScenes => prevScenes.map(s =>
                    s.id === sceneId ? { ...s, timeline: { ...s.timeline, shots: newShots, transitions: newTransitions } } : s
                ));
                addToast(`Initial shots generated for ${selectedScene.title}`, 'success');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
                addToast(`Failed to generate initial shots: ${errorMessage}`, 'error');
            } finally {
                setIsLoading(false);
            }
        }
    };
    
    const handleProceedToReview = () => setWorkflowStage('continuity');

    const updateActiveSceneTimeline = useCallback((updater: (prevTimeline: TimelineData) => TimelineData) => {
        if (!activeSceneId) return;
        setScenes(prevScenes =>
            prevScenes.map(scene => scene.id === activeSceneId ? { ...scene, timeline: updater(scene.timeline) } : scene)
        );
    }, [activeSceneId]);

    const handleGenerateVideo = async (sceneId: string, timelineData: TimelineData) => {
        const activeScene = scenes.find(s => s.id === sceneId);
        if (!directorsVision || !activeScene) return;

        try {
            const payloadObject = generateVideoPrompt(
                timelineData, 
                directorsVision,
                { title: activeScene.title, summary: activeScene.summary }
            );
            const jsonPayload = JSON.stringify(payloadObject, null, 2);
            setGenerationModalState({ isOpen: true, sceneId, jsonPayload });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error creating payload';
            console.error(error);
            addToast(`Failed to generate request: ${errorMessage}`, 'error');
        }
    };

    const handleGetCoDirectorSuggestions = async (objective: string) => {
        if (!activeSceneId) return;
        const activeScene = scenes.find(s => s.id === activeSceneId);
        if (!activeScene || !storyBible || !directorsVision) return;

        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const prunedContext = await getPrunedContextForCoDirector(storyBible, getNarrativeContext(activeSceneId), activeScene, directorsVision, handleApiLog, handleApiStateChange);
            const result = await getCoDirectorSuggestions(prunedContext, activeScene, objective, handleApiLog, handleApiStateChange);
            setCoDirectorResult(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            addToast(`Co-Director failed: ${errorMessage}`, 'error');
        } finally {
            setIsCoDirectorLoading(false);
        }
    };
    
    const handleApplySuggestion = (suggestion: Suggestion) => {
        updateActiveSceneTimeline(prev => {
            let newShots = [...prev.shots];
            let newEnhancers = { ...prev.shotEnhancers };
            let newTransitions = [...prev.transitions];
            if (suggestion.type === 'UPDATE_SHOT' && suggestion.shot_id) {
                newShots = newShots.map(s => s.id === suggestion.shot_id ? { ...s, description: suggestion.payload.description || s.description } : s);
                if (suggestion.payload.enhancers) newEnhancers[suggestion.shot_id] = { ...newEnhancers[suggestion.shot_id], ...suggestion.payload.enhancers };
            } else if (suggestion.type === 'ADD_SHOT_AFTER' && suggestion.after_shot_id) {
                const newShot: Shot = { id: `shot_${Date.now()}`, description: suggestion.payload.description || '', title: suggestion.payload.title };
                const index = newShots.findIndex(s => s.id === suggestion.after_shot_id);
                if (index > -1) {
                    newShots.splice(index + 1, 0, newShot);
                    newTransitions.splice(index + 1, 0, 'Cut');
                    if (suggestion.payload.enhancers) newEnhancers[newShot.id] = suggestion.payload.enhancers;
                }
            } else if (suggestion.type === 'UPDATE_TRANSITION' && suggestion.transition_index !== undefined) {
                if (suggestion.transition_index < newTransitions.length) newTransitions[suggestion.transition_index] = suggestion.payload.type || newTransitions[suggestion.transition_index];
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
            if (Object.keys(continuityData).length > 0) await db.saveData('continuityData', continuityData);
            await db.saveData('workflowStage', workflowStage);
            addToast("Project Saved Successfully!", "success");
        } catch (error) {
            addToast("Error saving project.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [storyBible, scenes, directorsVision, generatedImages, continuityData, workflowStage, addToast]);
    
    const handleClearProject = async () => {
        if (window.confirm("Are you sure you want to delete all data?")) {
            await db.clearProjectData();
            window.location.reload();
        }
    };
    
    const activeScene = useMemo(() => scenes.find(s => s.id === activeSceneId), [scenes, activeSceneId]);
    const activeSceneIndex = useMemo(() => scenes.findIndex(s => s.id === activeSceneId), [scenes, activeSceneId]);
    const nextScene = useMemo(() => (activeSceneIndex > -1 && activeSceneIndex < scenes.length - 1) ? scenes[activeSceneIndex + 1] : null, [scenes, activeSceneIndex]);
    
    const handleGoToNextScene = useCallback(() => {
        if (nextScene) handleSceneSelect(nextScene.id);
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
                return <StoryIdeaForm onSubmit={handleStoryBibleSubmit} isLoading={isLoading} onApiStateChange={handleApiStateChange} onApiLog={handleApiLog} />;
            case 'bible':
                if (storyBible) return <StoryBibleEditor storyBible={storyBible} setStoryBible={setStoryBible} onContinue={() => setWorkflowStage('vision')} isLoading={isLoading} onApiStateChange={handleApiStateChange} onApiLog={handleApiLog} />;
                return null;
            case 'vision':
                if (storyBible) return <DirectorsVisionForm storyBible={storyBible} onSubmit={handleDirectorsVisionSubmit} isLoading={isLoading} onApiStateChange={handleApiStateChange} onApiLog={handleApiLog} />;
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
                                    onGetInspiration={() => suggestCoDirectorObjectives(storyBible!.logline, activeScene.summary, directorsVision, handleApiLog, handleApiStateChange)}
                                    onApiLog={handleApiLog}
                                />
                                <TimelineEditor
                                    key={activeScene.id}
                                    scene={activeScene}
                                    storyBible={storyBible!}
                                    directorsVision={directorsVision}
                                    narrativeContext={getNarrativeContext(activeScene.id)}
                                    setShots={updater => updateActiveSceneTimeline(t => ({ ...t, shots: typeof updater === 'function' ? updater(t.shots) : updater }))}
                                    setShotEnhancers={updater => updateActiveSceneTimeline(t => ({ ...t, shotEnhancers: typeof updater === 'function' ? updater(t.shotEnhancers) : updater }))}
                                    setTransitions={updater => updateActiveSceneTimeline(t => ({ ...t, transitions: typeof updater === 'function' ? updater(t.transitions) : updater }))}
                                    setNegativePrompt={updater => updateActiveSceneTimeline(t => ({ ...t, negativePrompt: typeof updater === 'function' ? updater(t.negativePrompt) : updater }))}
                                    onGoToNextScene={handleGoToNextScene}
                                    nextScene={nextScene}
                                    onProceedToReview={handleProceedToReview}
                                    onApiStateChange={handleApiStateChange}
                                    onApiLog={handleApiLog}
                                    onGenerateVideo={handleGenerateVideo}
                                    sceneContinuity={continuityData[activeScene.id]}
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
                            continuityData={continuityData}
                            setContinuityData={setContinuityData}
                            addToast={addToast}
                            onApiStateChange={handleApiStateChange}
                            onApiLog={handleApiLog}
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
            <FinalPromptModal
                isOpen={generationModalState.isOpen}
                onClose={() => setGenerationModalState({ isOpen: false, sceneId: null, jsonPayload: null })}
                jsonPayload={generationModalState.jsonPayload}
            />
            <main className="container mx-auto px-4 py-8">
                <header className="text-center mb-12">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500">Cinematic Story Generator</h1>
                    <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">From a simple idea to a complete, production-ready cinematic package.</p>
                </header>
                
                <WorkflowTracker currentStage={workflowStage} />

                {renderContent()}

                <UsageDashboard isOpen={isUsageDashboardOpen} onClose={() => setIsUsageDashboardOpen(false)} />

                {storyBible && (
                    <div className="fixed bottom-4 right-4 z-30 flex gap-2">
                         <button onClick={() => setIsUsageDashboardOpen(true)} className="p-3 bg-gray-600 text-white rounded-full shadow-lg hover:bg-gray-700 transition-colors" aria-label="Open Usage Dashboard">
                            <BarChartIcon className="w-6 h-6" />
                        </button>
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
        <UsageProvider>
            <AppContent />
        </UsageProvider>
    </ApiStatusProvider>
)

export default App;