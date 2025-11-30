import React, { useState, useCallback } from 'react';
import type { ApiLogCallback, ApiStateChangeCallback } from '../services/planExpansionService';
import SparklesIcon from './icons/SparklesIcon';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { suggestionHistoryStore } from '../store/suggestionHistoryStore';

interface NegativePromptSuggestionsProps {
    directorsVision: string;
    sceneSummary: string;
    onSelect: (suggestion: string) => void;
    onApiLog: ApiLogCallback;
    onApiStateChange: ApiStateChangeCallback;
}

const NegativePromptSuggestions: React.FC<NegativePromptSuggestionsProps> = ({ directorsVision, sceneSummary, onSelect, onApiLog, onApiStateChange }) => {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const planActions = usePlanExpansionActions();

    const handleSuggest = useCallback(async () => {
        setIsLoading(true);
        setSuggestions([]);
        try {
            const result = await planActions.suggestNegativePrompts(directorsVision, sceneSummary, onApiLog, onApiStateChange);
            const unique = result.filter(r => !suggestionHistoryStore.has(r));
            const needed = Math.max(4, Math.min(6, unique.length));
            const trimmed = unique.slice(0, needed);
            suggestionHistoryStore.add(trimmed);
            setSuggestions(trimmed);
        } catch (e) {
            console.error(e);
            // Error toast is handled by the service
        } finally {
            setIsLoading(false);
        }
    }, [directorsVision, sceneSummary, onApiLog, onApiStateChange, planActions]);
    
    const handleSelect = (suggestion: string) => {
        onSelect(suggestion);
        setSuggestions(prev => prev.filter(s => s !== suggestion));
    };

    return (
        <div className="mt-2">
            <button 
                onClick={handleSuggest}
                disabled={isLoading}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 disabled:text-gray-500 flex items-center gap-1.5"
            >
                {isLoading ? (
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <SparklesIcon className="w-3 h-3" />
                )}
                Suggest Negative Prompts
            </button>

            {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                    {suggestions.map((s, i) => (
                        <button 
                            key={i} 
                            onClick={() => handleSelect(s)} 
                            className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-gray-800/60 border border-gray-700 rounded-full hover:bg-gray-700/80 hover:border-gray-600 transition-colors"
                        >
                            + {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default NegativePromptSuggestions;
