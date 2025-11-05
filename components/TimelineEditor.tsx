import React, { useState } from 'react';
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
}

const ShotCard: React.FC<{
    shot: Shot;
    onDescriptionChange: (id: string, newDescription: string) => void;
    onTitleChange: (id: string, newTitle: string) => void;
    onDelete: (id: string) => void;
    enhancers: ShotEnhancers[string];
    onEnhancersChange: (id:string, newEnhancers: ShotEnhancers[string]) => void;
}> = ({ shot, onDescriptionChange, onTitleChange, onDelete, enhancers, onEnhancersChange }) => {
    const [isEditingStyle, setIsEditingStyle] = useState(false);

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 relative group">
            <input
                type="text"
                className="block w-full bg-transparent font-bold text-indigo-400 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-lg mb-2 p-1 -ml-1"
                value={shot.title || ''}
                onChange={(e) => onTitleChange(shot.id, e.target.value)}
                placeholder="Untitled Shot"
                aria-label={`Title for ${shot.id}`}
            />
            <textarea
                rows={3}
                className="block w-full bg-gray-900 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3"
                value={shot.description}
                onChange={(e) => onDescriptionChange(shot.id, e.target.value)}
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
                onClick={() => onDelete(shot.id)}
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
                                onChange={(newEnhancers) => onEnhancersChange(shot.id, newEnhancers)}
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
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({
    shots, setShots, shotEnhancers, setShotEnhancers, transitions, setTransitions, 
    isProcessing, processingStatus, processingStage, 
    onSaveTimeline, onLoadTimeline,
    negativePrompt, setNegativePrompt, suggestedNegativePrompts
}) => {
    
    const handleDescriptionChange = (id: string, newDescription: string) => {
        setShots(shots.map(shot => shot.id === id ? { ...shot, description: newDescription } : shot));
    };
    
    const handleTitleChange = (id: string, newTitle: string) => {
        setShots(shots.map(shot => shot.id === id ? { ...shot, title: newTitle } : shot));
    }

    const handleEnhancersChange = (id: string, newEnhancers: ShotEnhancers[string]) => {
        setShotEnhancers(prev => ({ ...prev, [id]: newEnhancers }));
    };

    const handleTransitionChange = (index: number, newTransition: string) => {
        const newTransitions = [...transitions];
        newTransitions[index] = newTransition;
        setTransitions(newTransitions);
    };

    const handleAddShot = () => {
        const newShot: Shot = {
            id: `shot_${Date.now()}`,
            title: 'New Shot',
            description: ''
        };
        setShots([...shots, newShot]);
        if (shots.length > 0) {
            setTransitions([...transitions, 'Cut']);
        }
    };

    const handleDeleteShot = (id: string) => {
        const shotIndex = shots.findIndex(shot => shot.id === id);
        if (shotIndex === -1) return;

        setShots(prev => prev.filter(shot => shot.id !== id));
        
        setShotEnhancers(prev => {
            const newEnhancers = { ...prev };
            delete newEnhancers[id];
            return newEnhancers;
        });

        // If there's at least one shot left, adjust transitions
        if (shots.length > 1) {
            setTransitions(prev => {
                const newTransitions = [...prev];
                // Remove the transition *before* the deleted shot, unless it's the first shot
                const transitionIndexToRemove = shotIndex > 0 ? shotIndex - 1 : 0;
                newTransitions.splice(transitionIndexToRemove, 1);
                return newTransitions;
            });
        } else {
            // No shots left, or only one left, so no transitions
            setTransitions([]);
        }
    }


    return (
        <div className="my-6">
            <div className="flex justify-between items-center mb-2">
                <h2 className="flex items-center text-lg font-semibold text-gray-200">
                    <TimelineIcon className="w-5 h-5 mr-2 text-indigo-400" />
                    Director's Console
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
                                    <div className="text-center text-gray-500 py-8">
                                        <p>No shots in the timeline.</p>
                                        <p className="text-sm">Upload a video for AI analysis or load a saved timeline.</p>
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
                    </>
                )}
            </div>
        </div>
    );
};

export default TimelineEditor;