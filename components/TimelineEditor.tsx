import React, { useState, useCallback, memo, useRef } from 'react';
import { Shot, ShotEnhancers, CreativeEnhancers, Scene, TimelineData, StoryBible, BatchShotTask } from '../types';
import CreativeControls from './CreativeControls';
import TransitionSelector from './TransitionSelector';
import NegativePromptSuggestions from './NegativePromptSuggestions';
import GenerationControls from './GenerationControls';
import TimelineIcon from './icons/TimelineIcon';
import TrashIcon from './icons/TrashIcon';
import PlusIcon from './icons/PlusIcon';
import FilmIcon from './icons/FilmIcon';
import SparklesIcon from './icons/SparklesIcon';
import { batchProcessShotEnhancements, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import Tooltip from './Tooltip';
import CameraIcon from './icons/CameraIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';
import { useApiStatus } from '../contexts/ApiStatusContext';

interface TimelineEditorProps {
    scene: Scene;
    storyBible: StoryBible;
    directorsVision: string;
    narrativeContext: string;
    imageUrl?: string;
    setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
    setShotEnhancers: React.Dispatch<React.SetStateAction<ShotEnhancers>>;
    setTransitions: React.Dispatch<React.SetStateAction<string[]>>;
    setNegativePrompt: React.Dispatch<React.SetStateAction<string>>;
    onGenerateImage: (timelineData: TimelineData) => void;
    isGeneratingImage: boolean;
    onGoToNextScene: () => void;
    nextScene: Scene | null;
    onGeneratePrompt: (timelineData: TimelineData) => void;
    isGeneratingPrompt: boolean;
    generatedPrompt?: string;
    onProceedToReview?: () => void;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const SuggestionButton: React.FC<{
    onClick: () => void;
    isLoading: boolean;
    tooltip: string;
}> = memo(({ onClick, isLoading, tooltip }) => (
    <Tooltip text={tooltip}>
        <button
            onClick={onClick}
            disabled={isLoading}
            className="p-1.5 text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 disabled:cursor-wait transition-colors"
        >
            {isLoading ? (
                 <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : (
                <SparklesIcon className="w-4 h-4" />
            )}
        </button>
    </Tooltip>
));


const ShotCard: React.FC<{
    shot: Shot;
    index: number;
    totalShots: number;
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    onDescriptionChange: (id: string, newDescription: string) => void;
    onEnhancersChange: (id: string, newEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>) => void;
    onDeleteShot: (id: string) => void;
    onAddShotAfter: (id: string) => void;
    onRefineDescription: (shot: Shot) => void;
    onSuggestEnhancers: (shot: Shot) => void;
    suggestionState: { processingIds: Set<string> };
}> = memo(({ 
    shot, index, totalShots, enhancers, onDescriptionChange, onEnhancersChange, 
    onDeleteShot, onAddShotAfter, onRefineDescription, onSuggestEnhancers, suggestionState 
}) => {
    const [isExpanded, setIsExpanded] = useState(index < 2);
    const isProcessing = suggestionState.processingIds.has(shot.id);

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h4 className="font-bold text-gray-200">Shot {index + 1}</h4>
                <div className="flex items-center gap-2">
                     <button onClick={() => onAddShotAfter(shot.id)} className="p-1 text-gray-400 hover:text-white transition-colors" title="Add shot after">
                        <PlusIcon className="w-5 h-5" />
                    </button>
                    {totalShots > 1 && (
                        <button onClick={() => onDeleteShot(shot.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Delete shot">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-indigo-400 font-medium text-sm"
                    >
                        {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                </div>
            </div>
            <div className="p-4">
                <div className="flex items-start gap-2">
                    <textarea
                        value={shot.description}
                        onChange={(e) => onDescriptionChange(shot.id, e.target.value)}
                        rows={3}
                        className="flex-grow w-full bg-gray-900/50 p-2 border border-gray-600 rounded-md focus:ring-1 focus:ring-indigo-500 text-sm text-gray-300"
                        placeholder="Describe the action in this shot..."
                    />
                     <SuggestionButton 
                        onClick={() => onRefineDescription(shot)}
                        isLoading={isProcessing}
                        tooltip="Refine Description with AI"
                    />
                </div>
            </div>
            {isExpanded && (
                <div className="p-4 border-t border-gray-700">
                    <div className="flex justify-end -mb-2">
                         <SuggestionButton 
                            onClick={() => onSuggestEnhancers(shot)}
                            isLoading={isProcessing}
                            tooltip="Suggest Enhancers with AI"
                        />
                    </div>
                    <CreativeControls
                        value={enhancers}
                        onChange={(newEnhancers) => onEnhancersChange(shot.id, newEnhancers)}
                    />
                </div>
            )}
        </div>
    );
});


const TimelineEditor: React.FC<TimelineEditorProps> = ({
    scene,
    storyBible,
    directorsVision,
    narrativeContext,
    imageUrl,
    setShots,
    setShotEnhancers,
    setTransitions,
    setNegativePrompt,
    onGenerateImage,
    isGeneratingImage,
    onGoToNextScene,
    nextScene,
    onGeneratePrompt,
    isGeneratingPrompt,
    generatedPrompt,
    onProceedToReview,
    onApiStateChange,
    onApiLog
}) => {
    const { shots, shotEnhancers, transitions, negativePrompt } = scene.timeline;
    const { updateApiStatus } = useApiStatus();

    const [mitigateViolence, setMitigateViolence] = useState(false);
    const [enhanceRealism, setEnhanceRealism] = useState(true);
    
    // --- Batching and Debouncing Logic ---
    const batchTimeoutRef = useRef<number | null>(null);
    const [queuedTasks, setQueuedTasks] = useState<Map<string, BatchShotTask>>(new Map());
    const [suggestionState, setSuggestionState] = useState<{ processingIds: Set<string> }>({ processingIds: new Set() });

    const processTaskQueue = useCallback(async () => {
        if (queuedTasks.size === 0) return;

        const tasksToProcess = Array.from(queuedTasks.values());
        setQueuedTasks(new Map()); // Clear queue immediately

        try {
            const results = await batchProcessShotEnhancements(tasksToProcess, narrativeContext, directorsVision, onApiLog, onApiStateChange);

            let shotsUpdater = (prev: Shot[]) => prev;
            let enhancersUpdater = (prev: ShotEnhancers) => prev;

            results.forEach(result => {
                if (result.refined_description) {
                    const prevUpdater = shotsUpdater;
                    shotsUpdater = (prev) => prevUpdater(prev).map(s => s.id === result.shot_id ? { ...s, description: result.refined_description! } : s);
                }
                if (result.suggested_enhancers) {
                    const prevUpdater = enhancersUpdater;
                    enhancersUpdater = (prev) => {
                        const newEnhancers = { ...prev };
                        newEnhancers[result.shot_id] = { ...newEnhancers[result.shot_id], ...result.suggested_enhancers };
                        return prevUpdater(newEnhancers);
                    };
                }
            });

            setShots(shotsUpdater);
            setShotEnhancers(enhancersUpdater);

        } catch (e) {
            console.error("Batch processing failed:", e);
        } finally {
            setSuggestionState(prev => {
                const newProcessingIds = new Set(prev.processingIds);
                tasksToProcess.forEach(task => newProcessingIds.delete(task.shot_id));
                return { processingIds: newProcessingIds };
            });
        }
    }, [queuedTasks, narrativeContext, directorsVision, setShots, setShotEnhancers, onApiStateChange, onApiLog]);

    // FIX: Refactored task queuing logic to be type-safe and immutable.
    // The previous implementation had type inference issues with `existingTask`
    // and mutated state, leading to cascading errors. This new version explicitly
    // handles new vs. existing tasks, creates new objects to avoid mutation,
    // and ensures type consistency for the `queuedTasks` state.
    const queueTask = useCallback((shot: Shot, action: 'REFINE_DESCRIPTION' | 'SUGGEST_ENHANCERS') => {
        setSuggestionState(prev => ({ processingIds: new Set(prev.processingIds).add(shot.id) }));

        setQueuedTasks(prevQueue => {
            const newQueue = new Map(prevQueue);
            const existingTask = newQueue.get(shot.id);
            
            if (existingTask) {
                // To avoid mutation, create a new task object
                const updatedTask: BatchShotTask = {
                    ...existingTask,
                    description: shot.description, // always update description with latest
                    actions: existingTask.actions.includes(action) 
                        ? existingTask.actions 
                        : [...existingTask.actions, action]
                };
                newQueue.set(shot.id, updatedTask);
            } else {
                const newTask: BatchShotTask = {
                    shot_id: shot.id,
                    description: shot.description,
                    actions: [action],
                };
                newQueue.set(shot.id, newTask);
            }
            
            updateApiStatus('bundling', `Bundling ${newQueue.size} task(s)...`);
            return newQueue;
        });

        if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
        }
        batchTimeoutRef.current = window.setTimeout(processTaskQueue, 750);
    }, [processTaskQueue, updateApiStatus]);


    const handleRefineDescription = useCallback((shot: Shot) => {
        queueTask(shot, 'REFINE_DESCRIPTION');
    }, [queueTask]);

    const handleSuggestEnhancers = useCallback((shot: Shot) => {
        queueTask(shot, 'SUGGEST_ENHANCERS');
    }, [queueTask]);

    const handleRefineAllDescriptions = useCallback(() => {
        shots.forEach(shot => queueTask(shot, 'REFINE_DESCRIPTION'));
    }, [shots, queueTask]);

    const handleSuggestEnhancersForAll = useCallback(() => {
        shots.forEach(shot => queueTask(shot, 'SUGGEST_ENHANCERS'));
    }, [shots, queueTask]);
    // --- End of Batching Logic ---


    const handleDescriptionChange = useCallback((id: string, newDescription: string) => {
        setShots(prevShots => prevShots.map(s => s.id === id ? { ...s, description: newDescription } : s));
    }, [setShots]);

    const handleEnhancersChange = useCallback((id: string, newEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>) => {
        setShotEnhancers(prev => ({ ...prev, [id]: newEnhancers }));
    }, [setShotEnhancers]);
    
    const handleTransitionChange = useCallback((index: number, newValue: string) => {
        setTransitions(prev => {
            const newTransitions = [...prev];
            newTransitions[index] = newValue;
            return newTransitions;
        });
    }, [setTransitions]);

    const handleDeleteShot = useCallback((id: string) => {
        const shotIndex = shots.findIndex(s => s.id === id);
        setShots(prev => prev.filter(s => s.id !== id));
        setShotEnhancers(prev => {
            const newEnhancers = { ...prev };
            delete newEnhancers[id];
            return newEnhancers;
        });
        setTransitions(prev => {
            const newTransitions = [...prev];
            if (shotIndex < prev.length) {
                newTransitions.splice(shotIndex, 1);
            } else if (shotIndex > 0) {
                 newTransitions.splice(shotIndex - 1, 1);
            }
            return newTransitions;
        });
    }, [shots, setShots, setShotEnhancers, setTransitions]);

    const handleAddShotAfter = useCallback((id: string) => {
        const newShot: Shot = { id: `shot_${Date.now()}`, description: 'A new scene begins.' };
        const index = shots.findIndex(s => s.id === id);
        if (index > -1) {
            setShots(prev => {
                const newShots = [...prev];
                newShots.splice(index + 1, 0, newShot);
                return newShots;
            });
            setTransitions(prev => {
                const newTransitions = [...prev];
                newTransitions.splice(index, 0, 'Cut');
                return newTransitions;
            });
        }
    }, [shots, setShots, setTransitions]);

    const buildTimelineData = useCallback(() => {
        let finalNegativePrompt = negativePrompt;
        const violenceNegativePrompt = "graphic violence, blood, gore, combat, weapons, injury, death";
        const realismNegativePrompt = "painting, oil paint, digital art, illustration, AI art, stylized, matte painting, low detail, smudged, plastic, blurry, distorted, low-resolution, waxy, dreamlike, fantasy, glowing, cartoon, AI-generated look, watercolor, posterized";

        if (mitigateViolence) finalNegativePrompt = finalNegativePrompt ? `${finalNegativePrompt}, ${violenceNegativePrompt}` : violenceNegativePrompt;
        if (enhanceRealism) {
            finalNegativePrompt = finalNegativePrompt ? `${finalNegativePrompt}, ${realismNegativePrompt}` : realismNegativePrompt;
        }

        return { shots, shotEnhancers, transitions, negativePrompt: finalNegativePrompt.trim() };
    }, [shots, shotEnhancers, transitions, negativePrompt, mitigateViolence, enhanceRealism]);

    const handleGenerateImageClick = useCallback(() => {
        const timelineData = buildTimelineData();
        onGenerateImage(timelineData);
    }, [buildTimelineData, onGenerateImage]);

    const handleGeneratePromptClick = useCallback(() => {
        const timelineData = buildTimelineData();
        onGeneratePrompt(timelineData);
    }, [buildTimelineData, onGeneratePrompt]);
    
    const isProcessingSuggestions = suggestionState.processingIds.size > 0;

    return (
        <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6">
            {imageUrl && (
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-green-400 mb-4">Generated Scene Keyframe</h3>
                    <img src={`data:image/jpeg;base64,${imageUrl}`} alt={`Generated for ${scene.title}`} className="w-full max-w-4xl mx-auto bg-black rounded-lg object-cover aspect-video shadow-2xl shadow-indigo-500/20 border border-gray-700" />
                </div>
            )}
            
            <h2 className="flex items-center text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
                <TimelineIcon className="w-8 h-8 mr-3 text-purple-400" />
                Director's Console
            </h2>
             <p className="text-sm text-gray-400 mb-6">Now directing: <span className="font-bold text-gray-200">{scene.title}</span></p>

             <div className="bg-gray-900/30 p-3 rounded-md border border-gray-700 mb-6">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <p className="text-sm font-semibold text-gray-300">AI Bulk Actions:</p>
                    <button onClick={handleRefineAllDescriptions} disabled={isProcessingSuggestions} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-600/80 text-white hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-wait transition-colors flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4" /> Refine All Descriptions
                    </button>
                    <button onClick={handleSuggestEnhancersForAll} disabled={isProcessingSuggestions} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-600/80 text-white hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-wait transition-colors flex items-center gap-2">
                       <SparklesIcon className="w-4 h-4" /> Suggest Enhancers for All
                    </button>
                </div>
             </div>

            <div className="space-y-4">
                {shots.map((shot, index) => (
                    <React.Fragment key={shot.id}>
                        <ShotCard
                            shot={shot}
                            index={index}
                            totalShots={shots.length}
                            enhancers={shotEnhancers[shot.id] || {}}
                            onDescriptionChange={handleDescriptionChange}
                            onEnhancersChange={handleEnhancersChange}
                            onDeleteShot={handleDeleteShot}
                            onAddShotAfter={handleAddShotAfter}
                            onRefineDescription={handleRefineDescription}
                            onSuggestEnhancers={handleSuggestEnhancers}
                            suggestionState={suggestionState}
                        />
                        {index < shots.length - 1 && (
                            <TransitionSelector
                                value={transitions[index]}
                                onChange={(newValue) => handleTransitionChange(index, newValue)}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700 space-y-8">
                <NegativePromptSuggestions
                    suggestions={['shaky camera', 'blurry', 'low quality', 'watermark', 'text']}
                    negativePrompt={negativePrompt}
                    setNegativePrompt={setNegativePrompt}
                />
                <GenerationControls 
                    mitigateViolence={mitigateViolence}
                    setMitigateViolence={setMitigateViolence}
                    enhanceRealism={enhanceRealism}
                    setEnhanceRealism={setEnhanceRealism}
                />
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button
                        onClick={handleGenerateImageClick}
                        disabled={isGeneratingImage}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                    >
                         {isGeneratingImage ? (
                             <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating Image...
                            </>
                         ) : (
                            <>
                                <CameraIcon className="mr-3 h-6 w-6" />
                                {imageUrl ? 'Re-render Scene Keyframe' : 'Render Scene Keyframe'}
                            </>
                         )}
                    </button>
                    {imageUrl && !generatedPrompt && (
                        <button
                            onClick={handleGeneratePromptClick}
                            disabled={isGeneratingPrompt || isGeneratingImage}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-purple-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                        >
                            {isGeneratingPrompt ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Generating Prompt...
                                </>
                            ) : (
                                <>
                                    <FilmIcon className="mr-3 h-6 w-6" />
                                    Generate Final Prompt
                                </>
                            )}
                        </button>
                    )}
                    {generatedPrompt && nextScene && (
                        <button
                            onClick={onGoToNextScene}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transform hover:scale-105"
                        >
                           Continue to: {nextScene.title}
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    )}
                </div>

                {generatedPrompt && (
                     <div className="mt-6 p-4 bg-gray-900/50 border border-gray-700 rounded-lg fade-in">
                        <h4 className="font-semibold text-purple-300">Final Generation Prompt:</h4>
                        <p className="text-sm text-gray-300 mt-2 font-mono bg-black/30 p-3 rounded">{generatedPrompt}</p>
                        <p className="text-xs text-gray-500 mt-2">Use this prompt and the generated keyframe with an external video generation model.</p>
                    </div>
                )}

                {generatedPrompt && !nextScene && (
                    <div className="mt-6 p-4 text-center bg-green-900/50 border border-green-800 rounded-lg fade-in space-y-3">
                        <h4 className="font-semibold text-green-300">Final Scene Complete!</h4>
                        <p className="text-sm text-gray-400">You've reached the end of your story's creative direction.</p>
                        {onProceedToReview && (
                            <button
                                onClick={onProceedToReview}
                                className="inline-flex items-center justify-center px-6 py-3 bg-cyan-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-cyan-700 focus:outline-none focus:ring-4 focus:ring-cyan-500 focus:ring-opacity-50 transform hover:scale-105"
                            >
                                <ClipboardCheckIcon className="mr-3 h-5 w-5" />
                                Proceed to Continuity Review
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(TimelineEditor);