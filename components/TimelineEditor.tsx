import React, { useState, useCallback, useRef, memo } from 'react';
import { Shot, ShotEnhancers, CreativeEnhancers, Scene, TimelineData, StoryBible, BatchShotTask, BatchShotResult, LocalGenerationSettings, LocalGenerationStatus } from '../types';
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
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { queueComfyUIPrompt } from '../services/videoGenerationService';
import ServerIcon from './icons/ServerIcon';
import ImageIcon from './icons/ImageIcon';
// FIX: Renamed component import to avoid name collision with the 'LocalGenerationStatus' type.
import LocalGenerationStatusComponent from './LocalGenerationStatus';

interface TimelineEditorProps {
    scene: Scene;
    storyBible: StoryBible;
    directorsVision: string;
    narrativeContext: string;
    setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
    setShotEnhancers: React.Dispatch<React.SetStateAction<ShotEnhancers>>;
    setTransitions: React.Dispatch<React.SetStateAction<string[]>>;
    setNegativePrompt: React.Dispatch<React.SetStateAction<string>>;
    onGoToNextScene: () => void;
    nextScene: Scene | null;
    onProceedToReview?: () => void;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
    onGenerateKeyframe: (sceneId: string, timeline: TimelineData) => void;
    onExportPrompts: (sceneId: string, timeline: TimelineData) => void;
    generatedImage?: string;
    shotPreviewImages: Record<string, { image: string, isLoading: boolean }>;
    onGenerateShotPreview: (shotId: string) => void;
    localGenerationSettings: LocalGenerationSettings;
    localGenerationStatus: LocalGenerationStatus;
    onStartLocalGeneration: (promptId: string, workflowJson: string) => void;
    onClearLocalGeneration: () => void;
}

const SuggestionButton: React.FC<{
    onClick: () => void;
    isLoading: boolean;
    tooltip: string;
    icon?: React.ReactNode;
}> = memo(({ onClick, isLoading, tooltip, icon }) => (
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
                icon || <SparklesIcon className="w-4 h-4" />
            )}
        </button>
    </Tooltip>
));

const ShotCard: React.FC<{
    shot: Shot;
    index: number;
    totalShots: number;
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    preview?: { image: string, isLoading: boolean };
    onDescriptionChange: (id: string, newDescription: string) => void;
    onEnhancersChange: (id: string, newEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>) => void;
    onDeleteShot: (id: string) => void;
    onAddShotAfter: (id: string) => void;
    onRefineDescription: (shot: Shot) => void;
    onSuggestEnhancers: (shot: Shot) => void;
    onGeneratePreview: (shotId: string) => void;
    suggestionState: { processingIds: Set<string> };
}> = ({ 
    shot, index, totalShots, enhancers, preview, onDescriptionChange, onEnhancersChange, 
    onDeleteShot, onAddShotAfter, onRefineDescription, onSuggestEnhancers, onGeneratePreview, suggestionState 
}) => {
    const isProcessingSuggestion = suggestionState.processingIds.has(shot.id);
    const isPreviewLoading = preview?.isLoading ?? false;

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg fade-in">
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
                </div>
            </div>
            <div className="p-4 space-y-4">
                {preview?.image && !isPreviewLoading && (
                     <div className="rounded-lg overflow-hidden border border-gray-600">
                        <img src={`data:image/jpeg;base64,${preview.image}`} alt={`Preview for shot ${index + 1}`} className="w-full aspect-video object-cover"/>
                    </div>
                )}
                {isPreviewLoading && (
                    <div className="aspect-video bg-gray-900/50 flex items-center justify-center rounded-lg animate-pulse">
                        <p className="text-sm text-gray-400">Generating preview...</p>
                    </div>
                )}
                <div>
                    <div className="flex items-start gap-2">
                        <textarea
                            value={shot.description}
                            onChange={(e) => onDescriptionChange(shot.id, e.target.value)}
                            rows={3}
                            className="flex-grow w-full bg-gray-900/50 p-2 border border-gray-600 rounded-md focus:ring-1 focus:ring-indigo-500 text-sm text-gray-300"
                            placeholder="Describe the action in this shot..."
                        />
                         <div className="flex flex-col">
                            <SuggestionButton 
                                onClick={() => onRefineDescription(shot)}
                                isLoading={isProcessingSuggestion}
                                tooltip="Refine Description with AI"
                            />
                            <SuggestionButton 
                                onClick={() => onGeneratePreview(shot.id)}
                                isLoading={isPreviewLoading}
                                tooltip="Generate Preview Image"
                                icon={<ImageIcon className="w-4 h-4" />}
                            />
                        </div>
                    </div>
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-semibold text-gray-300">Creative Enhancers (Directing Controls)</p>
                        <SuggestionButton 
                            onClick={() => onSuggestEnhancers(shot)}
                            isLoading={isProcessingSuggestion}
                            tooltip="Suggest Enhancers with AI"
                        />
                    </div>
                    <CreativeControls
                        value={enhancers}
                        onChange={(newEnhancers) => onEnhancersChange(shot.id, newEnhancers)}
                    />
                </div>
            </div>
        </div>
    );
};

const TimelineEditor: React.FC<TimelineEditorProps> = ({
    scene,
    directorsVision,
    narrativeContext,
    setShots,
    setShotEnhancers,
    setTransitions,
    setNegativePrompt,
    onGoToNextScene,
    nextScene,
    onProceedToReview,
    onApiStateChange,
    onApiLog,
    onGenerateKeyframe,
    onExportPrompts,
    generatedImage,
    shotPreviewImages,
    onGenerateShotPreview,
    localGenerationSettings,
    localGenerationStatus,
    onStartLocalGeneration,
    onClearLocalGeneration,
}) => {
    const { shots, shotEnhancers, transitions, negativePrompt } = scene.timeline;
    const { updateApiStatus } = useApiStatus();

    const [mitigateViolence, setMitigateViolence] = useState(false);
    const [enhanceRealism, setEnhanceRealism] = useState(true);
    
    const batchTimeoutRef = useRef<number | null>(null);
    const [queuedTasks, setQueuedTasks] = useState<Map<string, BatchShotTask>>(new Map());
    const [suggestionState, setSuggestionState] = useState<{ processingIds: Set<string> }>({ processingIds: new Set() });

    const processTaskQueue = useCallback(() => {
        setQueuedTasks((currentTasks: Map<string, BatchShotTask>) => {
            const tasksToProcess = Array.from(currentTasks.values());
            
            if (tasksToProcess.length > 0) {
                (async () => {
                    try {
                        const results = await batchProcessShotEnhancements(tasksToProcess, narrativeContext, directorsVision, onApiLog, onApiStateChange);
                        results.forEach((result: BatchShotResult) => {
                            if (result.refined_description) {
                                setShots(prev => prev.map(s => s.id === result.shot_id ? { ...s, description: result.refined_description! } : s));
                            }
                            if (result.suggested_enhancers) {
                                setShotEnhancers(prev => ({ ...prev, [result.shot_id]: { ...(prev[result.shot_id] || {}), ...result.suggested_enhancers } }));
                            }
                        });
                    } catch (e) {
                        console.error("Batch processing failed:", e);
                    } finally {
                        setSuggestionState(prev => {
                            const newProcessingIds = new Set(prev.processingIds);
                            tasksToProcess.forEach(task => newProcessingIds.delete(task.shot_id));
                            return { processingIds: newProcessingIds };
                        });
                    }
                })();
            }
            return new Map<string, BatchShotTask>();
        });
    }, [narrativeContext, directorsVision, onApiLog, onApiStateChange, setShots, setShotEnhancers]);

    const queueTask = useCallback((shot: Shot, action: 'REFINE_DESCRIPTION' | 'SUGGEST_ENHANCERS') => {
        setSuggestionState(prev => ({ processingIds: new Set(prev.processingIds).add(shot.id) }));
        setQueuedTasks((prevQueue: Map<string, BatchShotTask>) => {
            const newQueue = new Map(prevQueue);
            const existingTask = newQueue.get(shot.id);
            if (existingTask) {
                const updatedTask: BatchShotTask = {
                    ...existingTask,
                    description: shot.description,
                    actions: existingTask.actions.includes(action) ? existingTask.actions : [...existingTask.actions, action]
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
        if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = window.setTimeout(processTaskQueue, 750);
    }, [processTaskQueue, updateApiStatus]);


    const handleRefineDescription = useCallback((shot: Shot) => queueTask(shot, 'REFINE_DESCRIPTION'), [queueTask]);
    const handleSuggestEnhancers = useCallback((shot: Shot) => queueTask(shot, 'SUGGEST_ENHANCERS'), [queueTask]);
    const handleRefineAllDescriptions = useCallback(() => shots.forEach(shot => queueTask(shot, 'REFINE_DESCRIPTION')), [shots, queueTask]);
    const handleSuggestEnhancersForAll = useCallback(() => shots.forEach(shot => queueTask(shot, 'SUGGEST_ENHANCERS')), [shots, queueTask]);

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
        setShotEnhancers(prev => { const newEnhancers = { ...prev }; delete newEnhancers[id]; return newEnhancers; });
        setTransitions(prev => {
            const newTransitions = [...prev];
            if (shotIndex === 0) {
                 if (newTransitions.length > 0) newTransitions.shift();
            } else if (shotIndex > 0) {
                 newTransitions.splice(shotIndex - 1, 1);
            }
            return newTransitions;
        });
    }, [shots, setShots, setShotEnhancers, setTransitions]);

    const handleAddShotAfter = useCallback((id: string) => {
        const newShot: Shot = { id: `shot_${Date.now()}`, description: 'A new shot.' };
        const index = shots.findIndex(s => s.id === id);
        if (index > -1) {
            setShots(prev => { const newShots = [...prev]; newShots.splice(index + 1, 0, newShot); return newShots; });
            setTransitions(prev => { const newTransitions = [...prev]; newTransitions.splice(index + 1, 0, 'Cut'); return newTransitions; });
        }
    }, [shots, setShots, setTransitions]);

    const handleAddShot = useCallback((position: 'start' | 'end') => {
        const newShot: Shot = { id: `shot_${Date.now()}`, description: `A new ${position === 'start' ? 'opening' : 'closing'} shot.` };
        if (position === 'start') {
            setShots(prev => [newShot, ...prev]);
            if (shots.length > 0) {
                setTransitions(prev => ['Cut', ...prev]);
            }
        } else {
            setShots(prev => [...prev, newShot]);
            if (shots.length > 0) {
                setTransitions(prev => [...prev, 'Cut']);
            }
        }
    }, [shots.length, setShots, setTransitions]);

    const buildTimelineData = useCallback(() => {
        let finalNegativePrompt = negativePrompt;
        const violenceNegativePrompt = "graphic violence, blood, gore, combat, weapons, injury, death";
        const realismNegativePrompt = "painting, oil paint, digital art, illustration, AI art, stylized, matte painting, low detail, smudged, plastic, blurry, distorted, low-resolution, waxy, dreamlike, fantasy, glowing, cartoon, AI-generated look, watercolor, posterized";
        if (mitigateViolence) finalNegativePrompt = finalNegativePrompt ? `${finalNegativePrompt}, ${violenceNegativePrompt}` : violenceNegativePrompt;
        if (enhanceRealism) finalNegativePrompt = finalNegativePrompt ? `${finalNegativePrompt}, ${realismNegativePrompt}` : realismNegativePrompt;
        return { shots, shotEnhancers, transitions, negativePrompt: finalNegativePrompt.trim() };
    }, [shots, shotEnhancers, transitions, negativePrompt, mitigateViolence, enhanceRealism]);
    
    const handleQueueLocalGeneration = useCallback(async () => {
        try {
            // Early exit if keyframe isn't ready. This is also checked in the disabled logic.
            if (!generatedImage) {
                throw new Error("Cannot generate locally without a scene keyframe.");
            }
            
            const timelineData = buildTimelineData();
            const payloads = {
                json: JSON.stringify({
                    scene_summary: scene.summary,
                    directors_vision: directorsVision,
                    timeline: timelineData,
                }, null, 2),
                text: "Human-readable prompt generation logic would go here if needed",
            };

            // Let the service handle all validation and request logic.
            const response = await queueComfyUIPrompt(
                localGenerationSettings,
                payloads, 
                generatedImage,
            );
            
            if (response.prompt_id) {
                 onStartLocalGeneration(response.prompt_id, localGenerationSettings.workflowJson);
            } else {
                 throw new Error("ComfyUI did not return a prompt_id.");
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            // Display specific errors from the pre-flight checks or API call to the user.
            onApiStateChange('error', errorMessage); // This shows in the status bar and as a toast.
            console.error("Local generation request failed:", error);
        }
    }, [generatedImage, localGenerationSettings, buildTimelineData, directorsVision, scene.summary, onApiStateChange, onStartLocalGeneration]);


    const isProcessingSuggestions = suggestionState.processingIds.size > 0;
    const isWorkflowConfigured = localGenerationSettings.workflowJson && localGenerationSettings.workflowJson.length > 2 && Object.keys(localGenerationSettings.mapping).some(k => localGenerationSettings.mapping[k] !== 'none');
    const isGeneratingLocally = localGenerationStatus.status === 'queued' || localGenerationStatus.status === 'running';

    const getLocalGenerationTooltip = () => {
        if (!isWorkflowConfigured) {
            return 'Sync a workflow and map inputs in Settings to enable local generation.';
        }
        if (!generatedImage) {
            return 'Generate a scene keyframe before starting local generation.';
        }
        return 'Send the current timeline and keyframe to your local ComfyUI server.';
    };

    return (
        <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6">
            <h2 className="flex items-center text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
                <TimelineIcon className="w-8 h-8 mr-3 text-purple-400" />
                Director's Console
            </h2>
            <p className="text-sm text-gray-400 mb-6">Now directing: <span className="font-bold text-gray-200">{scene.title}</span></p>

            <div className="bg-gray-900/30 p-3 rounded-md border border-gray-700 mb-6">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <p className="text-sm font-semibold text-gray-300">AI Bulk Actions:</p>
                    <button onClick={handleRefineAllDescriptions} disabled={isProcessingSuggestions || shots.length === 0} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-600/80 text-white hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-wait transition-colors flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4" /> Refine All Descriptions
                    </button>
                    <button onClick={handleSuggestEnhancersForAll} disabled={isProcessingSuggestions || shots.length === 0} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-600/80 text-white hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-wait transition-colors flex items-center gap-2">
                       <SparklesIcon className="w-4 h-4" /> Suggest Enhancers for All
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <div className="text-center">
                    <button onClick={() => handleAddShot('start')} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-indigo-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors">
                        <PlusIcon className="w-4 h-4" /> Add Shot to Beginning
                    </button>
                </div>

                {shots.length > 0 ? (
                    shots.map((shot, index) => (
                        <React.Fragment key={shot.id}>
                            <ShotCard 
                                shot={shot} 
                                index={index} 
                                totalShots={shots.length} 
                                enhancers={shotEnhancers[shot.id] || {}} 
                                preview={shotPreviewImages[shot.id]}
                                onDescriptionChange={handleDescriptionChange} 
                                onEnhancersChange={handleEnhancersChange} 
                                onDeleteShot={handleDeleteShot} 
                                onAddShotAfter={handleAddShotAfter} 
                                onRefineDescription={handleRefineDescription} 
                                onSuggestEnhancers={handleSuggestEnhancers} 
                                onGeneratePreview={onGenerateShotPreview}
                                suggestionState={suggestionState} 
                            />
                            {index < shots.length - 1 && (
                                <TransitionSelector value={transitions[index]} onChange={(newValue) => handleTransitionChange(index, newValue)} />
                            )}
                        </React.Fragment>
                    ))
                ) : (
                    <div className="text-center py-10 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                        <p className="font-semibold">This scene has no shots.</p>
                        <p className="text-sm mt-1">Click an "Add Shot" button to build your timeline.</p>
                    </div>
                )}
                
                <div className="text-center">
                    <button onClick={() => handleAddShot('end')} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-indigo-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors">
                       <PlusIcon className="w-4 h-4" /> Add Shot to End
                    </button>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700 space-y-8">
                <NegativePromptSuggestions suggestions={['shaky camera', 'blurry', 'low quality', 'watermark', 'text']} negativePrompt={negativePrompt} setNegativePrompt={setNegativePrompt} />
                <GenerationControls 
                    mitigateViolence={mitigateViolence} 
                    setMitigateViolence={setMitigateViolence} 
                    enhanceRealism={enhanceRealism} 
                    setEnhanceRealism={setEnhanceRealism}
                />
            </div>

            <div className="mt-8 pt-6 border-t border-gray-700">
                {/* FIX: Using the renamed component to resolve the name collision and type usage error. */}
                <LocalGenerationStatusComponent status={localGenerationStatus} onClear={onClearLocalGeneration} />

                {generatedImage && !isGeneratingLocally && (
                    <div className="mb-6 fade-in">
                        <h3 className="text-xl font-bold text-green-400 mb-4 text-center">Generated Scene Keyframe</h3>
                        <div className="max-w-lg mx-auto bg-black rounded-lg overflow-hidden shadow-2xl shadow-green-500/20 border border-gray-700">
                            <img src={`data:image/jpeg;base64,${generatedImage}`} alt={`Keyframe for ${scene.title}`} className="w-full aspect-video object-cover" />
                        </div>
                    </div>
                )}
                
                {!isGeneratingLocally && <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                     {generatedImage ? (
                        <Tooltip text={getLocalGenerationTooltip()}>
                        <button
                            onClick={handleQueueLocalGeneration}
                            disabled={!isWorkflowConfigured || !generatedImage}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                        >
                            <ServerIcon className="mr-3 h-6 w-6" />
                            Generate Video (Local)
                        </button>
                        </Tooltip>
                     ) : (
                        <button
                            onClick={() => onGenerateKeyframe(scene.id, buildTimelineData())}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                        >
                            <FilmIcon className="mr-3 h-6 w-6" />
                            Generate Scene Keyframe
                        </button>
                     )}
                     <button
                        onClick={() => onExportPrompts(scene.id, buildTimelineData())}
                        className="w-full sm:w-auto px-6 py-2 text-sm font-semibold rounded-full transition-all duration-300 ease-in-out bg-gray-700/80 text-gray-200 hover:bg-gray-700 border border-gray-600"
                    >
                        Export Prompts
                    </button>
                </div>}

                <div className="mt-8 text-center">
                    {nextScene ? (
                        <button onClick={onGoToNextScene} className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transform hover:scale-105">
                           Continue to: {nextScene.title}
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    ) : (
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
        </div>
    );
};

export default TimelineEditor;