import React, { useState, useCallback } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import { suggestStoryIdeas, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import { useInteractiveSpotlight } from '../utils/hooks';
import ThematicLoader from './ThematicLoader';

interface StoryIdeaFormProps {
    onSubmit: (idea: string) => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const StoryIdeaForm: React.FC<StoryIdeaFormProps> = ({ onSubmit, isLoading, onApiStateChange, onApiLog }) => {
    const [idea, setIdea] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (idea.trim()) {
            onSubmit(idea);
        }
    };
    
    const handleSuggest = useCallback(async () => {
        setIsSuggesting(true);
        setSuggestions([]);
        try {
            const result = await suggestStoryIdeas(onApiLog, onApiStateChange);
            setSuggestions(result);
        } catch (e) {
            console.error(e);
            // The global handler in withRetry will set the error state
        } finally {
            setIsSuggesting(false);
        }
    }, [onApiStateChange, onApiLog]);

    return (
        <div ref={spotlightRef} className="max-w-3xl mx-auto glass-card p-8 rounded-xl shadow-2xl shadow-black/30 interactive-spotlight">
            <h2 className="text-2xl font-bold text-gray-100 mb-2 text-center">Start with an Idea</h2>
            <p className="text-gray-400 mb-6 text-center">What story do you want to create?</p>
            
            <form onSubmit={handleSubmit}>
                <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-indigo-500/30 shadow-black/30 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
                    placeholder="e.g., A space explorer finds an ancient artifact that could save humanity, but it's guarded by a sentient AI."
                />
                <button
                    type="submit"
                    disabled={isLoading || !idea.trim()}
                    className="mt-6 w-full sm:w-auto flex items-center justify-center px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105 animate-glow"
                >
                    {isLoading ? (
                        <ThematicLoader text="Generating..." />
                    ) : (
                        <>
                            <SparklesIcon className="mr-2 h-5 w-5" />
                            Generate Story Bible
                        </>
                    )}
                </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-700/50">
                <button 
                    onClick={handleSuggest}
                    disabled={isSuggesting}
                    className="text-sm font-semibold text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 flex items-center gap-2 mx-auto sm:mx-0"
                >
                    {isSuggesting ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <SparklesIcon className="w-4 h-4" />
                    )}
                    Need inspiration? Get suggestions.
                </button>
                {suggestions.length > 0 && (
                    <div className="space-y-2 mt-4">
                        {suggestions.map((s, i) => (
                            <button 
                                key={i} 
                                onClick={() => { setIdea(s); setSuggestions([]); }} 
                                className="text-left text-sm text-indigo-400 hover:text-indigo-300 bg-gray-800/50 p-3 rounded-md w-full transition-all duration-300 ease-in-out animate-fade-in-right ring-1 ring-gray-700 hover:ring-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 transform hover:-translate-y-1"
                                style={{ animationDelay: `${i * 100}ms` }}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoryIdeaForm;