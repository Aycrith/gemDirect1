import React, { useState, useCallback, memo } from 'react';
import { Shot, ShotEnhancers, CreativeEnhancers, Scene, TimelineData } from '../types';
import CreativeControls from './CreativeControls';
import TransitionSelector from './TransitionSelector';
import NegativePromptSuggestions from './NegativePromptSuggestions';
import GenerationControls from './GenerationControls';
import TimelineIcon from './icons/TimelineIcon';
import TrashIcon from './icons/TrashIcon';
import PlusIcon from './icons/PlusIcon';
import FilmIcon from './icons/FilmIcon';

interface TimelineEditorProps {
    scene: Scene;
    setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
    setShotEnhancers: React.Dispatch<React.SetStateAction<ShotEnhancers>>;
    setTransitions: React.Dispatch<React.SetStateAction<string[]>>;
    setNegativePrompt: React.Dispatch<React.SetStateAction<string>>;
    onGenerateFinalPrompt: (timelineData: TimelineData) => void;
    isGeneratingPrompt: boolean;
}

const ShotCard: React.FC<{
    shot: Shot;
    index: number;
    totalShots: number;
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    onDescriptionChange: (id: string, newDescription: string) => void;
    onEnhancersChange: (id: string, newEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>) => void;
    onDeleteShot: (id: string) => void;
    onAddShotAfter: (id: string) => void;
}> = memo(({ shot, index, totalShots, enhancers, onDescriptionChange, onEnhancersChange, onDeleteShot, onAddShotAfter }) => {
    const [isExpanded, setIsExpanded] = useState(index < 2);

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
                 <textarea
                    value={shot.description}
                    onChange={(e) => onDescriptionChange(shot.id, e.target.value)}
                    rows={3}
                    className="w-full bg-gray-900/50 p-2 border border-gray-600 rounded-md focus:ring-1 focus:ring-indigo-500 text-sm text-gray-300"
                    placeholder="Describe the action in this shot..."
                />
            </div>
            {isExpanded && (
                <div className="p-4 border-t border-gray-700">
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
    setShots,
    setShotEnhancers,
    setTransitions,
    setNegativePrompt,
    onGenerateFinalPrompt,
    isGeneratingPrompt,
}) => {
    const { shots, shotEnhancers, transitions, negativePrompt } = scene.timeline;

    const [mitigateViolence, setMitigateViolence] = useState(true);
    const [enhanceRealism, setEnhanceRealism] = useState(true);
    
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

    const handleGenerateClick = useCallback(() => {
        let finalNegativePrompt = negativePrompt;
        let finalPositiveEnhancers = '';
        const violenceNegativePrompt = "graphic violence, blood, gore, combat, weapons, injury, death";
        const realismNegativePrompt = "painting, oil paint, digital art, illustration, AI art, stylized, matte painting, low detail, smudged, plastic, blurry, distorted, low-resolution, waxy, dreamlike, fantasy, glowing, cartoon, AI-generated look, watercolor, posterized";
        const realismPositiveEnhancer = "photorealistic, cinematic film, realistic lighting, crisp focus, high-fidelity detail, real camera physics, true-to-life materials, cinematic realism, 4K";

        if (mitigateViolence) finalNegativePrompt = finalNegativePrompt ? `${finalNegativePrompt}, ${violenceNegativePrompt}` : violenceNegativePrompt;
        if (enhanceRealism) {
            finalNegativePrompt = finalNegativePrompt ? `${finalNegativePrompt}, ${realismNegativePrompt}` : realismNegativePrompt;
            finalPositiveEnhancers = realismPositiveEnhancer;
        }

        const timelineData: TimelineData = { shots, shotEnhancers, transitions, negativePrompt: finalNegativePrompt.trim(), positiveEnhancers: finalPositiveEnhancers };
        onGenerateFinalPrompt(timelineData);
    }, [shots, shotEnhancers, transitions, negativePrompt, mitigateViolence, enhanceRealism, onGenerateFinalPrompt]);
    
    return (
        <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6">
            <h2 className="flex items-center text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
                <TimelineIcon className="w-8 h-8 mr-3 text-purple-400" />
                Director's Console
            </h2>
             <p className="text-sm text-gray-400 mb-6">Now directing: <span className="font-bold text-gray-200">{scene.title}</span></p>

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
                        onClick={handleGenerateClick}
                        disabled={isGeneratingPrompt}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
                    >
                         {isGeneratingPrompt ? (
                             <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating...
                            </>
                         ) : (
                            <>
                                <FilmIcon className="mr-3 h-6 w-6" />
                                Generate Final Prompt for Scene
                            </>
                         )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default memo(TimelineEditor);