import React, { useState, useCallback } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import { suggestStoryIdeas, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';

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
        <div className="relative max-w-3xl mx-auto text-center bg-gray-900/50 backdrop-blur-lg p-8 rounded-xl ring-1 ring-white/10 overflow-hidden">
            <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-pink-500/50 opacity-50 blur-xl -z-10"></div>
            <div className="relative">
                <h2 className="text-3xl font-bold text-gray-100 mb-4">Start with an Idea</h2>
                <p className="text-gray-400 mb-8">Describe the story you want to create. It can be a simple sentence or a detailed paragraph. The AI will use this as the foundation for your entire narrative.</p>
                
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
                        className="mt-6 inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating...
                            </>
                        ) : (
                            <>
                                <SparklesIcon className="mr-2 h-5 w-5" />
                                Generate Story Bible
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
                        Inspire Me
                    </button>
                    {suggestions.length > 0 && (
                        <div className="space-y-2 mt-3">
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
        </div>
    );
};

export default StoryIdeaForm;