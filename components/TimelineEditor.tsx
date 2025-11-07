

import React, { useState, useCallback } from 'react';
import { Scene, Shot, TimelineData, CreativeEnhancers, BatchShotTask, ShotEnhancers, Suggestion, LocalGenerationSettings, LocalGenerationStatus } from '../types';
import CreativeControls from './CreativeControls';
import TransitionSelector from './TransitionSelector';
import CoDirector from './CoDirector';
import PlusIcon from './icons/PlusIcon';
import TrashIcon from './icons/TrashIcon';
import SparklesIcon from './icons/SparklesIcon';
import ImageIcon from './icons/ImageIcon';
// FIX: Import 'getCoDirectorSuggestions' and 'batchProcessShotEnhancements' from geminiService.
import { generateInitialShotsForScene, generateImageForShot, getCoDirectorSuggestions, batchProcessShotEnhancements } from '../services/geminiService';
import { generateVideoRequestPayloads } from '../services/payloadService';
import { queueComfyUIPrompt, trackPromptExecution } from '../services/comfyUIService';
import FinalPromptModal from './FinalPromptModal';
import LocalGenerationStatusComponent from './LocalGenerationStatus';
import TimelineIcon from './icons/TimelineIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';

interface TimelineEditorProps {
    scene: Scene;
    onUpdateScene: (scene: Scene) => void;
    directorsVision: string;
    storyBible: any;
    onApiStateChange: (status: any, message: string) => void;
    onApiLog: (log: any) => void;
    scenes: Scene[];
    onApplySuggestion: (suggestion: Suggestion, sceneId: string) => void;
    generatedImages: Record<string, string>;
    generatedShotImages: Record<string, string>;
    setGeneratedShotImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    localGenSettings: LocalGenerationSettings;
    localGenStatus: Record<string, LocalGenerationStatus>;
    setLocalGenStatus: React.Dispatch<React.SetStateAction<Record<string, LocalGenerationStatus>>>;
    isRefined: boolean;
    onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
}

const TimelineItem: React.FC<{
    shot: Shot;
    index: number;
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    imageUrl?: string;
    isGeneratingImage: boolean;
    onDescriptionChange: (shotId: string, newDescription: string) => void;
    onEnhancersChange: (shotId: string, newEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>) => void;
    onDeleteShot: (shotId: string) => void;
    onGenerateImage: (shotId: string) => void;
}> = ({ shot, index, enhancers, imageUrl, isGeneratingImage, onDescriptionChange, onEnhancersChange, onDeleteShot, onGenerateImage }) => {
    const [isControlsVisible, setIsControlsVisible] = useState(false);

    return (
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700/80 transition-shadow hover:shadow-lg hover:shadow-indigo-500/10 flex gap-4">
            {imageUrl && (
                <div className="w-1/4 flex-shrink-0">
                    <img src={`data:image/jpeg;base64,${imageUrl}`} alt={`Preview for shot ${index + 1}`} className="rounded-md aspect-video object-cover" />
                </div>
            )}
            <div className="flex-grow">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-grow">
                        <label className="block text-sm font-bold text-gray-300 mb-2">Shot {index + 1}</label>
                        <textarea
                            value={shot.description}
                            onChange={(e) => onDescriptionChange(shot.id, e.target.value)}
                            rows={3}
                            className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-2"
                            placeholder="Describe the shot..."
                        />
                    </div>
                    <div className="flex flex-col items-end gap-2 mt-8">
                        <button
                            onClick={() => setIsControlsVisible(!isControlsVisible)}
                            className={`p-2 rounded-full transition-colors ${isControlsVisible ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                            aria-label="Toggle creative controls"
                        >
                            <SparklesIcon className="w-5 h-5" />
                        </button>
                         <button onClick={() => onGenerateImage(shot.id)} disabled={isGeneratingImage} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-wait" aria-label="Generate shot preview">
                            {isGeneratingImage ? <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ImageIcon className="w-5 h-5" />}
                        </button>
                        <button onClick={() => onDeleteShot(shot.id)} className="p-2 rounded-full bg-red-800/50 hover:bg-red-700 text-red-300 transition-colors" aria-label="Delete shot">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {isControlsVisible && (
                    <div className="mt-4 pt-4 border-t border-gray-700/50 fade-in">
                        <CreativeControls value={enhancers} onChange={(newEnhancers) => onEnhancersChange(shot.id, newEnhancers)} />
                    </div>
                )}
            </div>
        </div>
    );
};

const TimelineEditor: React.FC<TimelineEditorProps> = ({ 
    scene, 
    onUpdateScene, 
    directorsVision, 
    storyBible, 
    onApiStateChange, 
    onApiLog, 
    scenes, 
    onApplySuggestion,
    generatedImages,
    generatedShotImages,
    setGeneratedShotImages,
    localGenSettings,
    localGenStatus,
    setLocalGenStatus,
    isRefined,
    onUpdateSceneSummary
}) => {
    const [timeline, setTimeline] = useState<TimelineData>(scene.timeline);
    const [coDirectorResult, setCoDirectorResult] = useState<any | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [promptsToExport, setPromptsToExport] = useState<{ json: string; text: string } | null>(null);
    const [isGeneratingShotImage, setIsGeneratingShotImage] = useState<Record<string, boolean>>({});
    const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);


    const sceneKeyframe = generatedImages[scene.id];
    
    const getNarrativeContext = useCallback((sceneId: string): string => {
        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return "No context found.";
        
        const actBreakdown = storyBible.plotOutline.split(/act [iI]+/);
        let actContext = "General Plot";
        if (sceneIndex / scenes.length > 0.66 && actBreakdown[3]) actContext = "Act III: " + actBreakdown[3];
        else if (sceneIndex / scenes.length > 0.33 && actBreakdown[2]) actContext = "Act II: " + actBreakdown[2];
        else if (actBreakdown[1]) actContext = "Act I: " + actBreakdown[1];

        return `This scene occurs in: ${actContext.trim()}`;
    }, [scenes, storyBible]);


    const updateTimeline = (newTimeline: Partial<TimelineData>) => {
        setTimeline(prev => ({ ...prev, ...newTimeline }));
    };

    const handleSaveChanges = () => {
        onUpdateScene({ ...scene, timeline });
        onApiStateChange('success', 'Timeline saved locally!');
    };

    const handleAddShot = () => {
        const newShot: Shot = { id: `shot_${Date.now()}`, description: '' };
        const newShots = [...timeline.shots, newShot];
        const newTransitions = [...timeline.transitions];
        if (newShots.length > 1) {
            newTransitions.push('Cut');
        }
        updateTimeline({ shots: newShots, transitions: newTransitions });
    };

    const handleDeleteShot = (shotId: string) => {
        const shotIndex = timeline.shots.findIndex(s => s.id === shotId);
        if (shotIndex === -1) return;
        
        const newShots = timeline.shots.filter(s => s.id !== shotId);
        const newEnhancers = { ...timeline.shotEnhancers };
        delete newEnhancers[shotId];

        const newTransitions = [...timeline.transitions];
        if (newShots.length > 0 && shotIndex < newTransitions.length) {
            newTransitions.splice(shotIndex > 0 ? shotIndex -1 : 0, 1);
        } else if (newShots.length === 0) {
            newTransitions.splice(0, newTransitions.length);
        }

        updateTimeline({ shots: newShots, shotEnhancers: newEnhancers, transitions: newTransitions });
    };

    const handleGenerateInitialShots = async () => {
        try {
            const shotDescriptions = await generateInitialShotsForScene(scene.summary, onApiLog, onApiStateChange);
            
            const newShots: Shot[] = shotDescriptions.map((desc: string) => ({ id: `shot_${Date.now()}_${Math.random()}`, description: desc }));
            const newTransitions = new Array(Math.max(0, newShots.length - 1)).fill('Cut');

            updateTimeline({ shots: newShots, transitions: newTransitions, shotEnhancers: {} });
        } catch (error) {
            console.error("Failed to generate initial shots:", error);
        }
    };
    
    const handleGetCoDirectorSuggestions = async (objective: string) => {
        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const result = await getCoDirectorSuggestions(scene.summary, { ...scene, timeline }, objective, onApiLog, onApiStateChange);
            setCoDirectorResult(result);
        } catch (error) {
            console.error(error);
        } finally {
            setIsCoDirectorLoading(false);
        }
    };
    
    const handleBatchProcess = async (actions: Array<'REFINE_DESCRIPTION' | 'SUGGEST_ENHANCERS'>) => {
        const tasks: BatchShotTask[] = timeline.shots.map(shot => ({
            shot_id: shot.id,
            description: shot.description,
            actions: actions,
        }));

        if (tasks.length === 0) return;

        try {
            const narrativeContext = getNarrativeContext(scene.id);
            const results = await batchProcessShotEnhancements(tasks, narrativeContext, directorsVision, onApiLog, onApiStateChange);

            const newShots = [...timeline.shots];
            const newEnhancers: ShotEnhancers = JSON.parse(JSON.stringify(timeline.shotEnhancers));

            results.forEach(result => {
                const shotIndex = newShots.findIndex(s => s.id === result.shot_id);
                if (shotIndex !== -1) {
                    if (result.refined_description) {
                        newShots[shotIndex] = { ...newShots[shotIndex], description: result.refined_description };
                    }
                    if (result.suggested_enhancers) {
                        newEnhancers[result.shot_id] = { ...newEnhancers[result.shot_id], ...result.suggested_enhancers };
                    }
                }
            });
            updateTimeline({ shots: newShots, shotEnhancers: newEnhancers });

        } catch (error) {
            console.error("Batch processing failed: ", error);
        }
    };
    
    const handleGenerateShotImage = async (shotId: string) => {
        const shot = timeline.shots.find(s => s.id === shotId);
        if (!shot) return;

        setIsGeneratingShotImage(prev => ({ ...prev, [shotId]: true }));
        try {
            const enhancers = timeline.shotEnhancers[shotId] || {};
            const image = await generateImageForShot(shot, enhancers, directorsVision, scene.summary, onApiLog, onApiStateChange);
            setGeneratedShotImages(prev => ({ ...prev, [shotId]: image }));
        } catch (error) {
            console.error(`Failed to generate image for shot ${shotId}:`, error);
        } finally {
            setIsGeneratingShotImage(prev => ({ ...prev, [shotId]: false }));
        }
    };

    const handleExportPrompts = () => {
        const payloads = generateVideoRequestPayloads(timeline, directorsVision, scene.summary);
        setPromptsToExport(payloads);
        setIsPromptModalOpen(true);
    };

    const handleGenerateLocally = async () => {
        if (!sceneKeyframe) {
            onApiStateChange('error', 'Please generate a scene keyframe before local generation.');
            return;
        }

        // Scoped status updater for this specific scene
        const updateStatus = (update: Partial<LocalGenerationStatus>) => {
            setLocalGenStatus(prev => ({
                ...prev,
                [scene.id]: { ...(prev[scene.id] || { status: 'idle', message: '', progress: 0 }), ...update }
            }));
        };

        updateStatus({ status: 'queued', message: 'Preparing to queue prompt...', progress: 0 });
        
        try {
            const payloads = generateVideoRequestPayloads(timeline, directorsVision, scene.summary);
            const response = await queueComfyUIPrompt(localGenSettings, payloads, sceneKeyframe);
            
            if (response.prompt_id) {
                updateStatus({ message: `Prompt queued! (ID: ${response.prompt_id})` });
                // Start tracking progress via WebSocket
                trackPromptExecution(localGenSettings, response.prompt_id, updateStatus);
            } else {
                 updateStatus({ status: 'error', message: 'Queueing failed: No prompt ID received.' });
            }
        } catch (error) {
             const message = error instanceof Error ? error.message : "An unknown error occurred.";
             updateStatus({ status: 'error', message });
        }
    };
    
    const handleUpdateSummaryClick = async () => {
        setIsSummaryUpdating(true);
        await onUpdateSceneSummary(scene.id);
        setIsSummaryUpdating(false);
    };

    return (
        <div className="space-y-6">
            <header className="bg-gray-800/30 p-4 rounded-lg border border-gray-700/50 flex flex-col sm:flex-row gap-6">
                {sceneKeyframe && (
                    <div className="sm:w-1/3 flex-shrink-0">
                        <img src={`data:image/jpeg;base64,${sceneKeyframe}`} alt={`Keyframe for ${scene.title}`} className="rounded-md aspect-video object-cover" />
                    </div>
                )}
                <div className="flex-grow">
                    <h2 className="text-2xl font-bold text-white">{scene.title}</h2>
                    <p className="text-gray-400 mt-1">{scene.summary}</p>
                    {isRefined && (
                         <button 
                            onClick={handleUpdateSummaryClick} 
                            disabled={isSummaryUpdating}
                            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-yellow-600 text-white hover:bg-yellow-700 disabled:bg-gray-500"
                        >
                            {isSummaryUpdating ? <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <RefreshCwIcon className="w-4 h-4"/>}
                            Update Summary
                        </button>
                    )}
                </div>
            </header>

            <div className="space-y-4">
                {timeline.shots.length > 0 ? (
                    timeline.shots.map((shot, index) => (
                        <React.Fragment key={shot.id}>
                            <TimelineItem
                                shot={shot}
                                index={index}
                                enhancers={timeline.shotEnhancers[shot.id] || {}}
                                imageUrl={generatedShotImages[shot.id]}
                                isGeneratingImage={isGeneratingShotImage[shot.id] || false}
                                onDescriptionChange={(shotId, desc) => updateTimeline({ shots: timeline.shots.map(s => s.id === shotId ? { ...s, description: desc } : s) })}
                                onEnhancersChange={(shotId, enh) => updateTimeline({ shotEnhancers: { ...timeline.shotEnhancers, [shotId]: enh } })}
                                onDeleteShot={handleDeleteShot}
                                onGenerateImage={handleGenerateShotImage}
                            />
                            {index < timeline.shots.length - 1 && (
                                <TransitionSelector value={timeline.transitions[index] || 'Cut'} onChange={(newVal) => {
                                    const newTransitions = [...timeline.transitions];
                                    newTransitions[index] = newVal;
                                    updateTimeline({ transitions: newTransitions });
                                }} />
                            )}
                        </React.Fragment>
                    ))
                ) : (
                    <div className="text-center py-16 bg-gray-800/30 rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center">
                        <TimelineIcon className="w-12 h-12 text-gray-600 mb-4" />
                        <h3 className="text-lg font-semibold text-gray-300">This scene is an empty canvas.</h3>
                        <p className="text-gray-400 mt-2 max-w-sm">Let's bring it to life. Generate an initial shot list with AI to get started.</p>
                        <button onClick={handleGenerateInitialShots} className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 disabled:bg-gray-500 transform hover:scale-105">
                           <SparklesIcon className="mr-2 h-5 w-5" /> Generate Initial Shots
                        </button>
                    </div>
                )}
            </div>

            <div className="flex justify-center">
                <button onClick={handleAddShot} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-300 bg-gray-800/60 border border-gray-700 rounded-full hover:bg-gray-700/80 hover:border-gray-600 transition-colors">
                    <PlusIcon className="w-4 h-4" /> Add Shot
                </button>
            </div>
            
             <div className="flex flex-col sm:flex-row justify-center gap-4 mt-4">
                <button onClick={() => handleBatchProcess(['REFINE_DESCRIPTION'])} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-gray-500 flex items-center gap-2 justify-center">
                    <SparklesIcon className="w-4 h-4" /> Refine All Descriptions
                </button>
                <button onClick={() => handleBatchProcess(['SUGGEST_ENHANCERS'])} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-gray-500 flex items-center gap-2 justify-center">
                    <SparklesIcon className="w-4 h-4" /> Suggest All Enhancers
                </button>
            </div>

            <CoDirector
                onGetSuggestions={handleGetCoDirectorSuggestions}
                isLoading={isCoDirectorLoading}
                result={coDirectorResult}
                onApplySuggestion={(suggestion) => onApplySuggestion(suggestion, scene.id)}
                onClose={() => setCoDirectorResult(null)}
                onGetInspiration={() => Promise.resolve([])}
            />
            
            <div className="space-y-6 pt-6 border-t border-gray-700/50">
                 <LocalGenerationStatusComponent 
                    status={localGenStatus[scene.id] || { status: 'idle', message: '', progress: 0 }}
                    onClear={() => setLocalGenStatus(prev => ({ ...prev, [scene.id]: { status: 'idle', message: '', progress: 0 }}))}
                 />
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex gap-4">
                        <button onClick={handleExportPrompts} className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-full shadow-lg hover:bg-gray-700 transition-colors">
                            Export Prompts
                        </button>
                        <button onClick={handleGenerateLocally} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-full shadow-lg hover:bg-indigo-700 transition-colors">
                           Generate Locally
                        </button>
                    </div>
                    <button onClick={handleSaveChanges} className="px-8 py-3 bg-green-600 text-white font-semibold rounded-full shadow-lg hover:bg-green-700 transition-colors">
                        Save Timeline
                    </button>
                </div>
            </div>

             <FinalPromptModal 
                isOpen={isPromptModalOpen}
                onClose={() => setIsPromptModalOpen(false)}
                payloads={promptsToExport}
             />
        </div>
    );
};

export default TimelineEditor;