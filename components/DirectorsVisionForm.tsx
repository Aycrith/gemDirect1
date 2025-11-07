import React, { useState, useCallback } from 'react';
import PaintBrushIcon from './icons/PaintBrushIcon';
import SparklesIcon from './icons/SparklesIcon';
import { suggestDirectorsVisions, refineDirectorsVision, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import { StoryBible } from '../types';
import { useInteractiveSpotlight } from '../utils/hooks';
import ThematicLoader from './ThematicLoader';
import GuideCard from './GuideCard';

interface DirectorsVisionFormProps {
    onSubmit: (vision: string) => void;
    isLoading: boolean;
    storyBible: StoryBible;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const DirectorsVisionForm: React.FC<DirectorsVisionFormProps> = ({ onSubmit, isLoading, storyBible, onApiStateChange, onApiLog }) => {
    const [vision, setVision] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (vision.trim()) {
            onSubmit(vision);
        }
    };

    const handleSuggest = useCallback(async () => {
        setIsSuggesting(true);
        setSuggestions([]);
        try {
            const result = await suggestDirectorsVisions(storyBible, onApiLog, onApiStateChange);
            setSuggestions(result);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSuggesting(false);
        }
    }, [storyBible, onApiStateChange, onApiLog]);

    const handleEnhance = useCallback(async () => {
        if (!vision.trim()) return;
        setIsEnhancing(true);
        try {
            const enhancedVision = await refineDirectorsVision(vision, storyBible, onApiLog, onApiStateChange);
            setVision(enhancedVision);
        } catch(e) {
            console.error(e);
        } finally {
            setIsEnhancing(false);
        }
    }, [vision, storyBible, onApiLog, onApiStateChange]);

    return (
        <div ref={spotlightRef} className="max-w-3xl mx-auto text-center glass-card p-8 rounded-xl shadow-2xl shadow-black/30 interactive-spotlight">
            <h2 className="text-3xl font-bold text-gray-100 mb-4">Define Your Director's Vision</h2>
            <p className="text-gray-400 mb-8">
                Describe the overall cinematic style, mood, and aesthetic. This is your creative guardrail, influencing everything from camera work to color grading. Think about film styles, animation aesthetics, or famous directors.
            </p>
            
            <GuideCard title="Crafting Your Vision">
                <p>
                   Your Director's Vision acts as a "style guide" for the AI. The more specific and evocative you are, the better the results will be.
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Use the <strong>Suggest a Vision</strong> button if you need ideas.</li>
                    <li>Once you have a concept, use the <strong>Enhance</strong> button to let the AI flesh it out with more cinematic language.</li>
                </ul>
                <p className="mt-3 font-semibold text-gray-300">What's Next?</p>
                <p>After submitting your vision, the AI will generate a list of scenes and a cinematic keyframe image for each one, bringing your story to life visually for the first time.</p>
            </GuideCard>

            <form onSubmit={handleSubmit} className="mt-6">
                 <div className="relative">
                    <textarea
                        value={vision}
                        onChange={(e) => setVision(e.target.value)}
                        rows={4}
                        className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-amber-500/30 shadow-black/30 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
                        placeholder="e.g., 'A fast-paced, kinetic style inspired by Edgar Wright...' or 'A lush, hand-painted Ghibli aesthetic with an emphasis on nature...' or 'Spider-Verse-style dynamic comic book visuals.'"
                    />
                    <button
                        type="button"
                        onClick={handleEnhance}
                        disabled={isEnhancing || !vision.trim()}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-600/50 text-amber-200 hover:bg-amber-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                    >
                        {isEnhancing ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <SparklesIcon className="w-4 h-4" />
                        )}
                        Enhance
                    </button>
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !vision.trim()}
                    className="mt-6 inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-amber-700 hover:to-orange-700 focus:outline-none focus:ring-4 focus:ring-amber-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105 animate-glow"
                >
                    {isLoading ? (
                        <ThematicLoader text="Generating..." />
                    ) : (
                        <>
                            <PaintBrushIcon className="mr-2 h-5 w-5" />
                            Generate Scenes with this Vision
                        </>
                    )}
                </button>
            </form>

            <div className="mt-10 pt-6 border-t border-gray-700/50 text-left">
                <button 
                    onClick={handleSuggest}
                    disabled={isSuggesting}
                    className="text-sm font-semibold text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 flex items-center gap-2"
                >
                    {isSuggesting ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <SparklesIcon className="w-4 h-4" />
                    )}
                    Suggest a Vision
                </button>
                {suggestions.length > 0 && (
                    <div className="space-y-2 mt-3">
                        {suggestions.map((qs, i) => (
                            <button 
                                key={i} 
                                onClick={() => setVision(qs)} 
                                className="text-left text-sm text-amber-400 hover:text-amber-300 bg-gray-800/50 p-3 rounded-md w-full transition-all duration-300 ease-in-out animate-fade-in-right ring-1 ring-gray-700 hover:ring-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transform hover:-translate-y-1"
                                style={{ animationDelay: `${i * 100}ms` }}
                            >
                                {qs}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DirectorsVisionForm;