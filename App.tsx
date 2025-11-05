import React, { useState, useCallback, useMemo, useEffect } from 'react';
import StoryIdeaForm from './components/StoryIdeaForm';
import StoryBibleEditor from './components/StoryBibleEditor';
import SceneNavigator from './components/SceneNavigator';
import TimelineEditor from './components/TimelineEditor';
import CoDirector from './components/CoDirector';
import DirectorsVisionForm from './components/DirectorsVisionForm';
import { generateStoryBible, generateSceneList, generateInitialShotsForScene, getCoDirectorSuggestions, generateSceneImage, suggestCoDirectorObjectives, generateVideoPrompt } from './services/geminiService';
import { StoryBible, Scene, Shot, ShotEnhancers, CoDirectorResult, Suggestion, TimelineData, ToastMessage, SceneContinuityData } from './types';
import Toast from './components/Toast';
import WorkflowTracker, { WorkflowStage } from './components/WorkflowTracker';
import VideoAnalyzer from './components/VideoAnalyzer';
import FilmIcon from './components/icons/FilmIcon';
import PencilRulerIcon from './components/icons/PencilRulerIcon';
import ContinuityDirector from './components/ContinuityDirector';
import ClipboardCheckIcon from './components/icons/ClipboardCheckIcon';
import SaveIcon from './components/icons/SaveIcon';
import * as db from './utils/database';

type AppMode = 'generator' | 'analyzer' | 'continuity';

const emptyTimeline: TimelineData = {
    shots: [],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: '',
};

const App: React.FC = () => {
    // App Flow & State
    const [appMode, setAppMode] = useState<AppMode>('generator');
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    
    // Generation State
    const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
    const [imageGenerationState, setImageGenerationState] = useState<{
        sceneId: string | null;
        status: 'idle' | 'generating' | 'success' | 'error';
        error: string | null;
    }>({ sceneId: null, status: 'idle', error: null });
    const isGeneratingImage = imageGenerationState.status === 'generating';
    
    const [videoPrompts, setVideoPrompts] = useState<Record<string, string>>({});
    const [isVideoPromptGenerating, setIsVideoPromptGenerating] = useState(false);

    // Continuity State
    const [continuityData, setContinuityDataState] = useState<Record<string, SceneContinuityData>>({});

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
                const [bible, savedScenes, vision, images, prompts, continuity] = await Promise.all([
                    db.getStoryBible(),
                    db.getAllScenes(),
                    db.getData('directorsVision'),
                    db.getData('generatedImages'),
                    db.getData('videoPrompts'),
                    db.getData('continuityData'),
                ]);

                if (bible) {
                    setStoryBible(bible);
                    setScenes(savedScenes || []);
                    setDirectorsVision(vision || '');
                    setGeneratedImages(images || {});
                    setVideoPrompts(prompts || {});
                    setContinuityDataState(continuity || {});

                    if (savedScenes && savedScenes.length > 0) {
                        setActiveSceneId(savedScenes[0].id);
                        handleSceneSelect(savedScenes[0].id, true); // Soft select without re-generating shots
                        setWorkflowStage('director');
                    } else if (vision) {
                        setWorkflowStage('vision');
                    } else {
                        setWorkflowStage('bible');
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

    // --- AI Service Handlers (Story Flow) ---
    const handleGenerateStoryBible = useCallback(async (idea: string) => {
        setIsLoading(true);
        setLoadingMessage('Generating your Story Bible...');
        try {
            await db.clearProjectData(); // Start fresh
            const bible = await generateStoryBible(idea);
            setStoryBible(bible);
            await db.saveStoryBible(bible);
            setWorkflowStage('bible');
            addToast('Story Bible generated and saved!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'An unknown error occurred', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    const handleProceedToVision = useCallback(() => {
        if (!storyBible) return;
        setWorkflowStage('vision');
        addToast("Story Bible confirmed. Now, let's set the vision.", 'info');
    }, [storyBible, addToast]);
    
    const handleSaveProject = useCallback(() => {
        // Note: Project saves automatically on changes. This provides manual confirmation.
        addToast('Project saved locally!', 'success');
    }, [addToast]);

    const handleGenerateScenes = useCallback(async (vision: string) => {
        if (!storyBible) return;
        setDirectorsVision(vision);
        setIsLoading(true);
        setLoadingMessage('Breaking down the plot into scenes...');
        try {
            const sceneList = await generateSceneList(storyBible.plotOutline, vision);
            const newScenes: Scene[] = sceneList.map((s, i) => ({
                id: `scene_${Date.now()}_${i}`,
                title: s.title,
                summary: s.summary,
                timeline: emptyTimeline,
            }));
            setScenes(newScenes);
            await db.saveData('directorsVision', vision);
            await db.saveScenes(newScenes);
            setWorkflowStage('scenes');
            addToast('Scene list created and saved!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'An unknown error occurred', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [storyBible, addToast]);

    const handleSceneSelect = useCallback(async (sceneId: string, softSelect = false) => {
        setActiveSceneId(sceneId);
        if (softSelect) {
            if (workflowStage !== 'director') setWorkflowStage('director');
            return;
        }

        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        const targetScene = scenes[sceneIndex];

        if (targetScene && targetScene.timeline.shots.length === 0) {
            setIsLoading(true);
            setLoadingMessage(`Generating initial shots for "${targetScene.title}"...`);
            try {
                if (!storyBible) throw new Error("Story Bible not found.");
                
                let previousSceneSummary: string | undefined = undefined;
                if (sceneIndex > 0) {
                    previousSceneSummary = scenes[sceneIndex - 1].summary;
                }

                const shotDescriptions = await generateInitialShotsForScene(storyBible.logline, storyBible.plotOutline, targetScene.summary, directorsVision, previousSceneSummary);
                const newShots: Shot[] = shotDescriptions.map((desc, index) => ({
                    id: `shot_${Date.now()}_${index}`,
                    description: desc,
                }));

                const newTimeline: TimelineData = {
                    ...emptyTimeline,
                    shots: newShots,
                    transitions: new Array(Math.max(0, newShots.length - 1)).fill('Cut'),
                    negativePrompt: 'floating characters, illogical perspective, weird angles, distorted anatomy, person standing on the camera/viewer, shaky camera, blurry, low quality, watermark, text, signature, ugly, deformed, disfigured, jpeg artifacts, lowres, painting, cartoon, 3d render',
                };
                
                const updatedScene = { ...targetScene, timeline: newTimeline };
                
                setScenes(prevScenes => prevScenes.map(s => s.id === sceneId ? updatedScene : s));
                await db.updateSceneTimeline(sceneId, newTimeline);
                
                if (previousSceneSummary) {
                    addToast(`Shots for "${targetScene.title}" created with context from the previous scene.`, 'success');
                } else {
                    addToast(`Shots generated for "${targetScene.title}"`, 'success');
                }

            } catch (error) {
                 addToast(error instanceof Error ? error.message : 'An unknown error occurred', 'error');
            } finally {
                setIsLoading(false);
            }
        }
        if (workflowStage !== 'director') {
            setWorkflowStage('director');
        }
    }, [scenes, storyBible, directorsVision, addToast, workflowStage]);

    // --- Timeline and Scene State Management ---
    const activeScene = useMemo(() => scenes.find(s => s.id === activeSceneId), [scenes, activeSceneId]);
    
    const isContinuityAvailable = useMemo(() => {
        return scenes.some(scene => videoPrompts[scene.id]);
    }, [scenes, videoPrompts]);

    const updateActiveSceneTimeline = useCallback(async (updater: (timeline: TimelineData) => TimelineData) => {
        if (!activeSceneId) return;
        let updatedTimeline: TimelineData | null = null;
        setScenes(prevScenes =>
            prevScenes.map(scene => {
                if (scene.id === activeSceneId) {
                    updatedTimeline = updater(scene.timeline);
                    return { ...scene, timeline: updatedTimeline };
                }
                return scene;
            })
        );
        if (updatedTimeline) {
           await db.updateSceneTimeline(activeSceneId, updatedTimeline);
        }
    }, [activeSceneId]);

    const setShotsForActiveScene = useCallback((setter: React.SetStateAction<Shot[]>) => {
        updateActiveSceneTimeline(timeline => ({ ...timeline, shots: typeof setter === 'function' ? setter(timeline.shots) : setter }));
    }, [updateActiveSceneTimeline]);

    const setShotEnhancersForActiveScene = useCallback((setter: React.SetStateAction<ShotEnhancers>) => {
        updateActiveSceneTimeline(timeline => ({ ...timeline, shotEnhancers: typeof setter === 'function' ? setter(timeline.shotEnhancers) : setter }));
    }, [updateActiveSceneTimeline]);

    const setTransitionsForActiveScene = useCallback((setter: React.SetStateAction<string[]>) => {
        updateActiveSceneTimeline(timeline => ({ ...timeline, transitions: typeof setter === 'function' ? setter(timeline.transitions) : setter }));
    }, [updateActiveSceneTimeline]);

    const setNegativePromptForActiveScene = useCallback((setter: React.SetStateAction<string>) => {
        updateActiveSceneTimeline(timeline => ({ ...timeline, negativePrompt: typeof setter === 'function' ? setter(timeline.negativePrompt) : setter }));
    }, [updateActiveSceneTimeline]);

    // --- Continuity Data Management with DB Sync ---
    const setContinuityData = useCallback((updater: React.SetStateAction<Record<string, SceneContinuityData>>) => {
        setContinuityDataState(prev => {
            const newData = typeof updater === 'function' ? updater(prev) : updater;
            // Fire-and-forget save
            db.saveData('continuityData', newData);
            return newData;
        });
    }, []);

    // --- Co-Director ---
     const handleGetCoDirectorSuggestions = useCallback(async (objective: string) => {
        if (!storyBible || !activeScene) {
            addToast('Please select a scene first.', 'error');
            return;
        }
        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const result = await getCoDirectorSuggestions(storyBible.logline, storyBible.plotOutline, activeScene, objective, directorsVision);
            setCoDirectorResult(result);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "An unknown error occurred.", 'error');
        } finally {
            setIsCoDirectorLoading(false);
        }
    }, [storyBible, activeScene, directorsVision, addToast]);

    const handleGetCoDirectorInspiration = useCallback(async () => {
        if (!storyBible || !activeScene) {
            addToast('Please select a scene first to get inspiration.', 'error');
            return;
        };
        try {
            const objectives = await suggestCoDirectorObjectives(storyBible.logline, activeScene.summary, directorsVision);
            return objectives;
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to get inspiration', 'error');
        }
    }, [storyBible, activeScene, directorsVision, addToast]);

    const handleApplySuggestion = useCallback((suggestion: Suggestion) => {
        if (!activeSceneId) return;

        const applyToScene = (scene: Scene): Scene => {
            let timeline = { ...scene.timeline };
            switch (suggestion.type) {
                case 'UPDATE_SHOT':
                    if (suggestion.shot_id) {
                        timeline.shots = timeline.shots.map(shot =>
                            shot.id === suggestion.shot_id && suggestion.payload.description
                                ? { ...shot, description: suggestion.payload.description }
                                : shot
                        );
                        if (suggestion.payload.enhancers) {
                            timeline.shotEnhancers = { ...timeline.shotEnhancers, [suggestion.shot_id]: { ...timeline.shotEnhancers[suggestion.shot_id], ...suggestion.payload.enhancers }};
                        }
                    }
                    break;
                case 'ADD_SHOT_AFTER':
                     if (suggestion.after_shot_id) {
                        const newShot: Shot = {
                            id: `shot_${Date.now()}`,
                            title: suggestion.payload.title || 'New Scene',
                            description: suggestion.payload.description || 'A new scene'
                        };
                        const index = timeline.shots.findIndex(s => s.id === suggestion.after_shot_id);
                        if (index > -1) {
                            timeline.shots.splice(index + 1, 0, newShot);
                            timeline.transitions.splice(index + 1, 0, 'Cut');
                        }
                    }
                    break;
                case 'UPDATE_TRANSITION':
                    if (suggestion.transition_index !== undefined && suggestion.payload.type) {
                       timeline.transitions[suggestion.transition_index] = suggestion.payload.type;
                    }
                    break;
            }
            return { ...scene, timeline };
        };
        
        // This is a synchronous update, so we can pass the updater function directly
        updateActiveSceneTimeline(currentTimeline => applyToScene({ ...activeScene!, timeline: currentTimeline }).timeline);
        addToast('Suggestion applied!', 'success');
    }, [activeSceneId, activeScene, updateActiveSceneTimeline, addToast]);
    
    // --- Scene Generation ---
    const handleGenerateImageForScene = useCallback(async (timelineData: TimelineData, sceneId: string) => {
        if (timelineData.shots.length === 0) {
            addToast('Cannot generate an image from an empty timeline.', 'error');
            return;
        }

        setImageGenerationState({ sceneId, status: 'generating', error: null });

        try {
            const currentSceneIndex = scenes.findIndex(s => s.id === sceneId);
            let previousImageBase64: string | undefined = undefined;

            if (currentSceneIndex > 0) {
                const previousSceneId = scenes[currentSceneIndex - 1].id;
                if (generatedImages[previousSceneId]) {
                    previousImageBase64 = generatedImages[previousSceneId];
                }
            }
            
            const imageBase64 = await generateSceneImage(timelineData, directorsVision, previousImageBase64);
            
            const newImages = { ...generatedImages, [sceneId]: imageBase64 };
            setGeneratedImages(newImages);
            await db.saveData('generatedImages', newImages);

            setImageGenerationState({ sceneId, status: 'success', error: null });
            addToast('Scene image generated!', 'success');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(errorMessage, 'error');
            setImageGenerationState({ sceneId, status: 'error', error: errorMessage });
        }
    }, [addToast, scenes, generatedImages, directorsVision]);

    const handleGenerateVideoPrompt = useCallback(async (timelineData: TimelineData, sceneId: string) => {
        setIsVideoPromptGenerating(true);
        try {
            const prompt = await generateVideoPrompt(timelineData, directorsVision);
            const newPrompts = { ...videoPrompts, [sceneId]: prompt };
            setVideoPrompts(newPrompts);
            await db.saveData('videoPrompts', newPrompts);
            addToast('Video prompt generated!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to generate video prompt.', 'error');
        } finally {
            setIsVideoPromptGenerating(false);
        }
    }, [directorsVision, addToast, videoPrompts]);

     const handleGoToNextScene = useCallback(() => {
        const currentSceneIndex = scenes.findIndex(s => s.id === activeSceneId);
        if (currentSceneIndex > -1 && currentSceneIndex < scenes.length - 1) {
            const nextSceneId = scenes[currentSceneIndex + 1].id;
            handleSceneSelect(nextSceneId);
        }
    }, [scenes, activeSceneId, handleSceneSelect]);

    const getAppStage = () => {
        if (!storyBible) return 'idea';
        if (!directorsVision) return 'vision';
        if (scenes.length === 0) return 'bible'; // Should be vision, but handles edge case
        if (!activeSceneId) return 'scenes';
        return 'director';
    }

    const renderContent = () => {
        if (isLoading && !storyBible) {
            return (
                <div className="text-center p-12">
                     <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-4 text-gray-400">Loading your project...</p>
                </div>
            );
        }

        if (appMode === 'analyzer') {
            return <VideoAnalyzer />;
        }
        
        if (appMode === 'continuity') {
            return (
                <ContinuityDirector 
                    scenes={scenes}
                    storyBible={storyBible!}
                    directorsVision={directorsVision}
                    generatedImages={generatedImages}
                    videoPrompts={videoPrompts}
                    continuityData={continuityData}
                    setContinuityData={setContinuityData}
                    addToast={addToast}
                />
            );
        }

        const appStage = getAppStage();

        switch (appStage) {
            case 'idea':
                return <StoryIdeaForm onSubmit={handleGenerateStoryBible} isLoading={isLoading} />;
            case 'bible':
                return storyBible && <StoryBibleEditor storyBible={storyBible} setStoryBible={setStoryBible} onContinue={handleProceedToVision} isLoading={isLoading} />;
            case 'vision':
                return storyBible && <DirectorsVisionForm onSubmit={handleGenerateScenes} isLoading={isLoading} storyBible={storyBible} />;
            case 'scenes':
            case 'director':
                 const currentSceneIndex = scenes.findIndex(s => s.id === activeSceneId);
                 const nextScene = currentSceneIndex > -1 && currentSceneIndex < scenes.length - 1 ? scenes[currentSceneIndex + 1] : null;

                 return (
                    <div className="flex flex-col lg:flex-row gap-8">
                        <aside className="lg:w-1/4">
                             <SceneNavigator scenes={scenes} activeSceneId={activeSceneId} onSelectScene={handleSceneSelect} />
                        </aside>
                        <main className="flex-1">
                            {isLoading && !activeScene && (
                                <div className="flex items-center justify-center p-8 bg-gray-800/30 rounded-lg h-64">
                                     <svg className="animate-spin mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <p className="text-indigo-300">{loadingMessage}</p>
                                </div>
                            )}
                            {activeScene && storyBible && (
                                <div className="space-y-8">
                                     <CoDirector 
                                        onGetSuggestions={handleGetCoDirectorSuggestions} 
                                        isLoading={isCoDirectorLoading} 
                                        result={coDirectorResult} 
                                        onApplySuggestion={handleApplySuggestion} 
                                        onClose={() => setCoDirectorResult(null)} 
                                        onGetInspiration={handleGetCoDirectorInspiration}
                                    />
                                     <TimelineEditor
                                        key={activeScene.id}
                                        scene={activeScene}
                                        storyBible={storyBible}
                                        directorsVision={directorsVision}
                                        imageUrl={generatedImages[activeScene.id]}
                                        setShots={setShotsForActiveScene}
                                        setShotEnhancers={setShotEnhancersForActiveScene}
                                        setTransitions={setTransitionsForActiveScene}
                                        setNegativePrompt={setNegativePromptForActiveScene}
                                        onGenerateImage={(timelineData) => handleGenerateImageForScene(timelineData, activeScene.id)}
                                        isGeneratingImage={isGeneratingImage && imageGenerationState.sceneId === activeScene.id}
                                        onGoToNextScene={handleGoToNextScene}
                                        nextScene={nextScene}
                                        onGenerateVideoPrompt={(timelineData) => handleGenerateVideoPrompt(timelineData, activeScene.id)}
                                        isGeneratingVideoPrompt={isVideoPromptGenerating}
                                        generatedVideoPrompt={videoPrompts[activeScene.id] || null}
                                    />
                                </div>
                            )}
                             {!activeScene && !isLoading && (
                                <div className="text-center py-12 border-2 border-dashed border-gray-700 rounded-lg">
                                    <p className="mt-1 text-lg text-gray-500">Select a scene to begin directing.</p>
                                </div>
                            )}
                        </main>
                    </div>
                 );
            default:
                return null;
        }
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Toast toasts={toasts} removeToast={removeToast} />
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
                        Cinematic Story Generator
                    </h1>
                    <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
                        Your AI partner for crafting compelling narratives from idea to final prompt.
                    </p>
                </header>
                
                <div className="flex justify-center mb-8">
                    <div className="inline-flex rounded-md shadow-sm bg-gray-800 p-1" role="group">
                        <button
                            type="button"
                            onClick={() => setAppMode('generator')}
                            className={`flex items-center gap-2 px-6 py-2 text-sm font-medium transition-colors rounded-md ${appMode === 'generator' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                        >
                            <PencilRulerIcon className="w-5 h-5" />
                            Story Generator
                        </button>
                        <button
                            type="button"
                            onClick={() => setAppMode('analyzer')}
                            className={`flex items-center gap-2 px-6 py-2 text-sm font-medium transition-colors rounded-md ${appMode === 'analyzer' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                        >
                            <FilmIcon className="w-5 h-5" />
                            Video Analyzer
                        </button>
                         {isContinuityAvailable && (
                            <button
                                type="button"
                                onClick={() => {
                                    setAppMode('continuity');
                                    setWorkflowStage('continuity');
                                }}
                                className={`flex items-center gap-2 px-6 py-2 text-sm font-medium transition-colors rounded-md ${appMode === 'continuity' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                <ClipboardCheckIcon className="w-5 h-5" />
                                Continuity Director
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSaveProject}
                            title="Manually save project progress. The app also saves automatically."
                            className={`flex items-center gap-2 px-6 py-2 text-sm font-medium transition-colors rounded-md text-gray-300 hover:bg-gray-700`}
                        >
                            <SaveIcon className="w-5 h-5" />
                            Save Project
                        </button>
                    </div>
                </div>

                {appMode === 'generator' && storyBible && <WorkflowTracker currentStage={workflowStage} />}

                <div className="mt-12 fade-in">
                    {renderContent()}
                </div>

            </main>
             <footer className="text-center py-6 text-gray-600 text-sm">
                <p>Powered by Google Gemini. Built for demonstration purposes.</p>
            </footer>
        </div>
    );
};

export default App;