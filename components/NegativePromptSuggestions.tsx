import React from 'react';
import PlusIcon from './icons/PlusIcon';

interface NegativePromptSuggestionsProps {
    suggestions: string[];
    negativePrompt: string;
    setNegativePrompt: React.Dispatch<React.SetStateAction<string>>;
}

const NegativePromptSuggestions: React.FC<NegativePromptSuggestionsProps> = ({ suggestions, negativePrompt, setNegativePrompt }) => {

    const handleAddSuggestion = (suggestion: string) => {
        if (!negativePrompt.includes(suggestion)) {
            setNegativePrompt(prev => prev ? `${prev}, ${suggestion}` : suggestion);
        }
    }

    return (
         <div>
            <label htmlFor="negative-prompt" className="block text-sm font-medium text-gray-300 mb-2">
                Global Style &amp; Negative Prompt
            </label>
            <textarea
                id="negative-prompt"
                rows={2}
                className="block w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3"
                placeholder={"e.g., Ridley Scott aesthetic, dynamic camera physics, AVOID shaky camera..."}
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                aria-label="Global Style and Negative Prompt"
            />
            {suggestions.length > 0 && (
                 <div className="mt-3">
                     <p className="text-xs text-gray-400 mb-2">AI Suggestions (to avoid):</p>
                    <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion, index) => (
                            <button
                                key={index}
                                onClick={() => handleAddSuggestion(suggestion)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all duration-200 bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-gray-500"
                            >
                                <PlusIcon className="w-3 h-3" />
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default NegativePromptSuggestions;