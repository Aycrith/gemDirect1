import React, { useState, useCallback } from 'react';
import { Shot, ShotEnhancers } from '../types';
import TimelineIcon from './icons/TimelineIcon';
import CreativeControls from './CreativeControls';
import TransitionSelector from './TransitionSelector';
import ProgressBar, { ProcessingStage } from './ProgressBar';
import SaveIcon from './icons/SaveIcon';
import UploadCloudIcon from './icons/UploadCloudIcon';
import PlusIcon from './icons/PlusIcon';
import TrashIcon from './icons/TrashIcon';
import NegativePromptSuggestions from './NegativePromptSuggestions';
import SparklesIcon from './icons/SparklesIcon';

interface TimelineEditorProps {
    shots: Shot[];
    setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
    shotEnhancers: ShotEnhancers;
    setShotEnhancers: React.Dispatch<React.SetStateAction<ShotEnhancers>>;
    transitions: string[];
    setTransitions: React.Dispatch<React.SetStateAction<string[]>>;
    isProcessing: boolean;
    processingStatus: string;
    processingStage: ProcessingStage;
    onSaveTimeline: () => void;
    onLoadTimeline: () => void;
    negativePrompt: string;
    setNegativePrompt: React.Dispatch<React.SetStateAction<string>>;
    suggestedNegativePrompts: string[];
    onGenerateRemix: () => void;
    isRemixing: boolean;
}

const ShotCard: React.FC<{
    shot: Shot;
    onDescriptionChange: (id: string, newDescription: string) => void;
    onTitleChange: (id: string, newTitle: string) => void;
    onDelete: (id: string) => void;
    enhancers: ShotEnhancers[string];
    onEnhancersChange: (id:string, newEnhancers: ShotEnhancers[string]) => void;
}> = React.memo(({ shot, onDescriptionChange, onTitleChange, onDelete, enhancers, onEnhancersChange }) => {
    const [isEditingStyle, setIsEditingStyle] = useState(false);
    
    const handleOnDelete = useCallback(() => onDelete(shot.id), [shot.id, onDelete]);
    const handleOnDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => onDescriptionChange(shot.id, e.target.value), [shot.id, onDescriptionChange]);
    const handleOnTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => onTitleChange(shot.id, e.target.value), [shot.id, onTitleChange]);
    const handleOnEnhancersChange = useCallback((newEnhancers: ShotEnhancers[string]) => onEnhancersChange(shot.id, newEnhancers), [shot.id, onEnhancersChange]);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 relative group">
            <input
                type="text"
                className="block w-full bg-transparent font-bold text-indigo-400 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-lg mb-2 p-1 -ml-1"
                value={shot.title || ''}
                onChange={handleOnTitleChange}
                placeholder="Untitled Shot"
                aria-label={`Title for ${shot.id}`}
            />
            <textarea
                rows={3}
                className="block w-full bg-gray-900 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3"
                value={shot.description}
                onChange={handleOnDescriptionChange}
                aria-label={`Description for ${shot.id}`}
            />
            <div className="mt-4">
                 <button 
                    onClick={() => setIsEditingStyle(true)}
                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                    Edit Cinematic Style ▸
                </button>
            </div>
             <button
                onClick={handleOnDelete}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-gray-700 text-gray-400 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Delete ${shot.title || 'shot'}`}
            >
                <TrashIcon className="w-4 h-4" />
            </button>
            
            {isEditingStyle && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setIsEditingStyle(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`dialog-title-${shot.id}`}
                >
                    <div 
                        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            <h3 id={`dialog-title-${shot.id}`} className="text-lg font-bold text-indigo-400 mb-4">Editing Style for "{shot.title}"</h3>
                            <CreativeControls 
                                value={enhancers}
                                onChange={handleOnEnhancersChange}
                            />
                            <div className="text-right mt-6 pt-4 border-t border-gray-700">
                                <button 
                                    onClick={() => setIsEditingStyle(false)} 
                                    className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
});

const TimelineEditor: React.FC<TimelineEditorProps> = ({
    shots, setShots, shotEnhancers, setShotEnhancers, transitions, setTransitions, 
    isProcessing, processingStatus, processingStage, 
    onSaveTimeline, onLoadTimeline, onGenerateRemix, isRemixing,
    negativePrompt, setNegativePrompt, suggestedNegativePrompts
}) => {
    
    const handleDescriptionChange = useCallback((id: string, newDescription: string) => {
        setShots(currentShots => currentShots.map(shot => shot.id === id ? { ...shot, description: newDescription } : shot));
    }, [setShots]);
    
    const handleTitleChange = useCallback((id: string, newTitle: string) => {
        setShots(currentShots => currentShots.map(shot => shot.id === id ? { ...shot, title: newTitle } : shot));
    }, [setShots]);

    const handleEnhancersChange = useCallback((id: string, newEnhancers: ShotEnhancers[string]) => {
        setShotEnhancers(prev => ({ ...prev, [id]: newEnhancers }));
    }, [setShotEnhancers]);

    const handleTransitionChange = useCallback((index: number, newTransition: string) => {
        setTransitions(currentTransitions => {
            const newTransitions = [...currentTransitions];
            newTransitions[index] = newTransition;
            return newTransitions;
        });
    }, [setTransitions]);

    const handleAddShot = useCallback(() => {
        const newShot: Shot = {
            id: `shot_${Date.now()}`,
            title: 'New Shot',
            description: ''
        };
        setShots(currentShots => [...currentShots, newShot]);
        setTransitions(currentTransitions => [...currentTransitions, 'Cut']);
    }, [setShots, setTransitions]);

    const handleDeleteShot = useCallback((id: string) => {
        const shotIndex = shots.findIndex(shot => shot.id === id);
        if (shotIndex === -1) return;

        setShots(prev => prev.filter(shot => shot.id !== id));
        
        setShotEnhancers(prev => {
            const newEnhancers = { ...prev };
            delete newEnhancers[id];
            return newEnhancers;
        });

        if (shots.length > 1) {
            setTransitions(prev => {
                const newTransitions = [...prev];
                const transitionIndexToRemove = shotIndex > 0 ? shotIndex - 1 : 0;
                newTransitions.splice(transitionIndexToRemove, 1);
                return newTransitions;
            });
        } else {
            setTransitions([]);
        }
    }, [shots, setShots, setShotEnhancers, setTransitions]);


    return (
        <div className="my-6">
            <div className="flex justify-between items-center mb-2">
                <h2 className="flex items-center text-lg font-semibold text-gray-200">
                    <TimelineIcon className="w-5 h-5 mr-2 text-indigo-400" />
                    Director's Console (Fine-Tuning)
                </h2>
                <div className="flex items-center gap-2">
                     <button onClick={onLoadTimeline} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700/50 border border-gray-600 rounded-md hover:bg-gray-700 transition-colors">
                        <UploadCloudIcon className="w-4 h-4" />
                        Load
                    </button>
                    <button onClick={onSaveTimeline} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 border border-indigo-500 rounded-md hover:bg-indigo-700 transition-colors">
                        <SaveIcon className="w-4 h-4" />
                        Save 
                    </button>
                </div>
            </div>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6 space-y-6">
                {isProcessing ? (
                     <div className="flex flex-col items-center justify-center text-center text-gray-400 h-48">
                        <ProgressBar stage={processingStage} />
                        <p className="mt-4 text-sm animate-pulse">{processingStatus}</p>
                    </div>
                ) : (
                    <>
                        <div>
                             <label className="block text-sm font-medium text-gray-300 mb-2">
                                Creative Timeline
                            </label>
                            <div className="space-y-4">
                                {shots.length > 0 ? shots.map((shot, index) => (
                                <React.Fragment key={shot.id}>
                                        <ShotCard 
                                            shot={shot}
                                            onDescriptionChange={handleDescriptionChange}
                                            onTitleChange={handleTitleChange}
                                            onDelete={handleDeleteShot}
                                            enhancers={shotEnhancers[shot.id] || {}}
                                            onEnhancersChange={handleEnhancersChange}
                                        />
                                        {index < shots.length - 1 && (
                                            <TransitionSelector
                                                value={transitions[index] || ''}
                                                onChange={(newTransition) => handleTransitionChange(index, newTransition)}
                                            />
                                        )}
                                </React.Fragment>
                                )) : (
                                    <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-700 rounded-lg">
                                        <TimelineIcon className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                                        <p className="font-semibold">Your timeline is empty.</p>
                                        <p className="text-sm">Analyze a video or load a timeline to begin editing.</p>
                                    </div>
                                )}
                                <div className="text-center pt-4">
                                    <button 
                                        onClick={handleAddShot}
                                        className="flex items-center mx-auto gap-2 px-4 py-2 text-sm font-medium text-indigo-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Add Shot
                                    </button>
                                </div>
                            </div>
                        </div>

                        <NegativePromptSuggestions
                            suggestions={suggestedNegativePrompts}
                            negativePrompt={negativePrompt}
                            setNegativePrompt={setNegativePrompt}
                        />

                        <div className="mt-8 pt-6 border-t border-gray-700 text-center">
                            <button
                                onClick={onGenerateRemix}
                                disabled={isRemixing || shots.length === 0}
                                className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                                aria-disabled={isRemixing || shots.length === 0}
                            >
                                {isRemixing ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Generating Remix...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="mr-3 h-6 w-6" />
                                        Generate Final Remix Prompt
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 mt-3">Combines all your edits into a final, powerful prompt for a generative video AI.</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default React.memo(TimelineEditor);
