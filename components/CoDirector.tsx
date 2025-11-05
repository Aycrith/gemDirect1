import React, { useState } from 'react';
import { CoDirectorResult, Suggestion } from '../types';
import LightbulbIcon from './icons/LightbulbIcon';
import SparklesIcon from './icons/SparklesIcon';
import { marked } from 'marked';


interface CoDirectorProps {
  onGetSuggestions: (objective: string) => Promise<void>;
  isLoading: boolean;
  result: CoDirectorResult | null;
  onApplySuggestion: (suggestion: Suggestion) => void;
  onClose: () => void;
}

const SuggestionModal: React.FC<{
  result: CoDirectorResult;
  onApply: (suggestion: Suggestion) => void;
  onClose: () => void;
}> = ({ result, onApply, onClose }) => {
    const [appliedIndices, setAppliedIndices] = useState<number[]>([]);

    const handleApply = (suggestion: Suggestion, index: number) => {
        onApply(suggestion);
        setAppliedIndices(prev => [...prev, index]);
    }
    
    const createMarkup = (markdown: string) => {
        const rawMarkup = marked(markdown, { sanitize: true });
        return { __html: rawMarkup };
    };

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-dialog-title"
        >
            <div 
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <h3 id="suggestion-dialog-title" className="flex items-center text-lg font-bold text-indigo-400 mb-4">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        AI Co-Director Suggestions
                    </h3>

                    {result.thematic_concept && (
                        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-center">
                            <h4 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Thematic Concept</h4>
                            <p className="text-xl font-bold text-white mt-1">"{result.thematic_concept}"</p>
                        </div>
                    )}

                    <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 mb-4 border-b border-gray-700 pb-4">
                        <div dangerouslySetInnerHTML={createMarkup(result.reasoning)} />
                    </div>

                    <div className="space-y-3">
                        {result.suggested_changes.map((suggestion, index) => (
                            <div key={index} className="bg-gray-900/70 p-3 rounded-md flex items-center justify-between gap-4">
                                <p className="text-sm text-gray-300 flex-1">{suggestion.description}</p>
                                <button
                                    onClick={() => handleApply(suggestion, index)}
                                    disabled={appliedIndices.includes(index)}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                                >
                                    {appliedIndices.includes(index) ? 'Applied' : 'Apply'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="text-right mt-6 pt-4 border-t border-gray-700">
                        <button 
                            onClick={onClose} 
                            className="px-6 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const CoDirector: React.FC<CoDirectorProps> = ({ onGetSuggestions, isLoading, result, onApplySuggestion, onClose }) => {
    const [objective, setObjective] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (objective.trim()) {
            onGetSuggestions(objective);
        }
    }

    return (
        <div className="my-6">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
                <label htmlFor="objective" className="flex items-center text-sm font-medium text-gray-300 mb-2">
                    <LightbulbIcon className="w-5 h-5 mr-2 text-yellow-400" />
                    AI Co-Director: What's your creative goal?
                </label>
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                     <input
                        id="objective"
                        type="text"
                        value={objective}
                        onChange={(e) => setObjective(e.target.value)}
                        className="flex-grow bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3"
                        placeholder="e.g., Make it more suspenseful, give it a dreamlike quality..."
                     />
                     <button
                        type="submit"
                        disabled={isLoading || !objective.trim()}
                        className="inline-flex items-center justify-center px-6 py-3 bg-yellow-600 text-white font-semibold rounded-md shadow-sm transition-colors hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:bg-gray-500 disabled:cursor-not-allowed"
                     >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Getting Suggestions...
                            </>
                        ) : 'Get Suggestions'}
                     </button>
                </form>
            </div>
            {result && <SuggestionModal result={result} onApply={onApplySuggestion} onClose={onClose} />}
        </div>
    )
}

export default CoDirector;
