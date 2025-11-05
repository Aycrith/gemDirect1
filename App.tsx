import React, { useState, useCallback, useMemo } from 'react';
import StoryIdeaForm from './components/StoryIdeaForm';
import StoryBibleEditor from './components/StoryBibleEditor';
import SceneNavigator from './components/SceneNavigator';
import TimelineEditor from './components/TimelineEditor';
import CoDirector from './components/CoDirector';
import { generateStoryBible, generateSceneList, generateInitialShotsForScene, getCoDirectorSuggestions, generateVideoPrompt } from './services/geminiService';
import { StoryBible, Scene, Shot, ShotEnhancers, CoDirectorResult, Suggestion, TimelineData, ToastMessage } from './types';
import Toast from './components/Toast';
import WorkflowTracker, { WorkflowStage } from './components/WorkflowTracker';
import FinalPromptModal from './components/FinalPromptModal';

type AppStage = 'idea' | 'bible' | 'scenes' | 'director';

const emptyTimeline: TimelineData = {
    shots: [],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: '',
    positiveEnhancers: '',
};

const App: React.FC = () => {
    // Story and State Management
    const [appStage, setAppStage] = useState<AppStage>('idea');
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
    
    // UI and Loading State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [coDirectorResult, setCoDirectorResult] = useState<CoDirectorResult | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [finalPrompt, setFinalPrompt] = useState<string>('');
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // --- Toast Notifications ---
    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);

    // --- AI Service Handlers ---
    const handleGenerateStoryBible = useCallback(async (idea: string) => {
        setIsLoading(true);
        setLoadingMessage('Generating your Story Bible...');
        try {
            const bible = await generateStoryBible(idea);
            setStoryBible(bible);
            setAppStage('bible');
            setWorkflowStage('bible');
            addToast('Story Bible generated!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'An unknown error occurred', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    const handleGenerateScenes = useCallback(async () => {
        if (!storyBible) return;
        setIsLoading(true);
        setLoadingMessage('Breaking down the plot into scenes...');
        try {
            const sceneList = await generateSceneList(storyBible.plotOutline);
            const newScenes: Scene[] = sceneList.map((s, i) => ({
                id: `scene_${Date.now()}_${i}`,
                title: s.title,
                summary: s.summary,
                timeline: emptyTimeline,
            }));
            setScenes(newScenes);
            setAppStage('scenes');
            setWorkflowStage('scenes');
            addToast('Scene list created!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'An unknown error occurred', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [storyBible, addToast]);

    const handleSceneSelect = useCallback(async (sceneId: string) => {
        setActiveSceneId(sceneId);
        const targetScene = scenes.find(s => s.id === sceneId);

        if (targetScene && targetScene.timeline.shots.length === 0) {
            setIsLoading(true);
            setLoadingMessage(`Generating initial shots for "${targetScene.title}"...`);
            try {
                if (!storyBible) throw new Error("Story Bible not found.");
                const shotDescriptions = await generateInitialShotsForScene(storyBible, targetScene);
                const newShots: Shot[] = shotDescriptions.map((desc, index) => ({
                    id: `shot_${Date.now()}_${index}`,
                    description: desc,
                }));

                const newTimeline: TimelineData = {
                    ...emptyTimeline,
                    shots: newShots,
                    transitions: new Array(Math.max(0, newShots.length - 1)).fill('Cut'),
                    negativePrompt: 'shaky camera, blurry, low quality, watermark, text, signature, ugly, deformed, disfigured, jpeg artifacts, lowres, painting, cartoon, 3d render',
                };

                setScenes(prevScenes => prevScenes.map(s => s.id === sceneId ? { ...s, timeline: newTimeline } : s));
                addToast(`Shots generated for "${targetScene.title}"`, 'success');
            } catch (error) {
                 addToast(error instanceof Error ? error.message : 'An unknown error occurred', 'error');
            } finally {
                setIsLoading(false);
            }
        }
        if (appStage !== 'director') {
            setAppStage('director');
            setWorkflowStage('director');
        }
    }, [scenes, storyBible, addToast, appStage]);

    // --- Timeline and Scene State Management ---
    const activeScene = useMemo(() => scenes.find(s => s.id === activeSceneId), [scenes, activeSceneId]);

    const updateActiveSceneTimeline = useCallback((updater: (timeline: TimelineData) => TimelineData) => {
        setScenes(prevScenes =>
            prevScenes.map(scene =>
                scene.id === activeSceneId ? { ...scene, timeline: updater(scene.timeline) } : scene
            )
        );
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


    // --- Co-Director ---
     const handleGetCoDirectorSuggestions = useCallback(async (objective: string) => {
        if (!storyBible || !activeScene) {
            addToast('Please select a scene first.', 'error');
            return;
        }
        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const result = await getCoDirectorSuggestions(storyBible, activeScene, objective);
            setCoDirectorResult(result);
        } catch (error) {
            addToast(error instanceof Error ? error.message : "An unknown error occurred.", 'error');
        } finally {
            setIsCoDirectorLoading(false);
        }
    }, [storyBible, activeScene, addToast]);

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

        setScenes(prev => prev.map(s => s.id === activeSceneId ? applyToScene(s) : s));
        addToast('Suggestion applied!', 'success');
    }, [activeSceneId, addToast]);
    
    // --- Final Prompt Generation ---
     const handleGenerateFinalPrompt = useCallback(async (timelineData: TimelineData) => {
        if (timelineData.shots.length === 0) {
            addToast('Cannot generate a prompt from an empty timeline.', 'error');
            return;
        }
        setIsGeneratingPrompt(true);
        try {
            const prompt = await generateVideoPrompt(timelineData);
            setFinalPrompt(prompt);
            setIsPromptModalOpen(true);
            addToast('Final prompt generated!', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : "An unknown error occurred.", 'error');
        } finally {
            setIsGeneratingPrompt(false);
        }
    }, [addToast]);

    const renderContent = () => {
        switch (appStage) {
            case 'idea':
                return <StoryIdeaForm onSubmit={handleGenerateStoryBible} isLoading={isLoading} />;
            case 'bible':
                return storyBible && <StoryBibleEditor storyBible={storyBible} setStoryBible={setStoryBible} onContinue={handleGenerateScenes} isLoading={isLoading} />;
            case 'scenes':
            case 'director':
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
                            {activeScene && (
                                <div className="space-y-8">
                                     <CoDirector onGetSuggestions={handleGetCoDirectorSuggestions} isLoading={isCoDirectorLoading} result={coDirectorResult} onApplySuggestion={handleApplySuggestion} onClose={() => setCoDirectorResult(null)} />
                                     <TimelineEditor
                                        key={activeScene.id}
                                        scene={activeScene}
                                        setShots={setShotsForActiveScene}
                                        setShotEnhancers={setShotEnhancersForActiveScene}
                                        setTransitions={setTransitionsForActiveScene}
                                        setNegativePrompt={setNegativePromptForActiveScene}
                                        onGenerateFinalPrompt={handleGenerateFinalPrompt}
                                        isGeneratingPrompt={isGeneratingPrompt}
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
                
                <WorkflowTracker currentStage={workflowStage} />
                
                <div className="mt-12 fade-in">
                    {renderContent()}
                </div>

                {activeScene && 
                    <FinalPromptModal 
                        isOpen={isPromptModalOpen}
                        onClose={() => setIsPromptModalOpen(false)}
                        prompt={finalPrompt}
                        isLoading={isGeneratingPrompt}
                    />
                }
            </main>
             <footer className="text-center py-6 text-gray-600 text-sm">
                <p>Powered by Google Gemini. Built for demonstration purposes.</p>
            </footer>
        </div>
    );
};

export default App;