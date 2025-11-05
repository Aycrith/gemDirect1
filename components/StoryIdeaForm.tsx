import React, { useState, useCallback } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import { suggestStoryIdeas, ApiStateChangeCallback } from '../services/geminiService';

interface StoryIdeaFormProps {
    onSubmit: (idea: string) => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
}

const StoryIdeaForm: React.FC<StoryIdeaFormProps> = ({ onSubmit, isLoading, onApiStateChange }) => {
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
            const result = await suggestStoryIdeas(onApiStateChange);
            setSuggestions(result);
        } catch (e) {
            console.error(e);
            // The global handler in withRetry will set the error state
        } finally {
            setIsSuggesting(false);
        }
    }, [onApiStateChange]);

    return (
        <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-gray-200 mb-4">Start with an Idea</h2>
            <p className="text-gray-400 mb-6">Describe the story you want to create. It can be a simple sentence or a detailed paragraph. The AI will use this as the foundation for your entire narrative.</p>
            
            <form onSubmit={handleSubmit}>
                <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3"
                    placeholder="e.g., A space explorer finds an ancient artifact that could save humanity, but it's guarded by a sentient AI."
                />
                <button
                    type="submit"
                    disabled={isLoading || !idea.trim()}
                    className="mt-4 inline-flex items-center justify-center px-8 py-3 bg-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105"
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

            <div className="mt-8 text-left">
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
                                className="text-left text-sm text-indigo-400 hover:text-indigo-300 bg-gray-800/50 p-3 rounded-md w-full transition-colors animate-fade-in-right"
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