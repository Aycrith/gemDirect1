import React, { useState, useCallback } from 'react';
import { CoDirectorResult, Suggestion, StoryBible, Scene, ToastMessage } from '../types';
import type { ApiStateChangeCallback, ApiLogCallback } from '../services/planExpansionService';
import LightbulbIcon from './icons/LightbulbIcon';
import SparklesIcon from './icons/SparklesIcon';
import { marked } from 'marked';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';

interface CoDirectorProps {
  onGetSuggestions: (objective: string) => Promise<void>;
  isLoading: boolean;
  result: CoDirectorResult | null;
  onApplySuggestion: (suggestion: Suggestion) => void;
  onClose: () => void;
  storyBible: StoryBible;
  scene: Scene;
  directorsVision: string;
  onApiLog: ApiLogCallback;
  onApiStateChange: ApiStateChangeCallback;
  addToast?: (message: string, type: ToastMessage['type']) => void;
}

const SuggestionModal: React.FC<{
  result: CoDirectorResult;
  onApply: (suggestion: Suggestion) => void;
  onClose: () => void;
}> = React.memo(({ result, onApply, onClose }) => {
    const [appliedIndices, setAppliedIndices] = useState<number[]>([]);

    const handleApply = useCallback((suggestion: Suggestion, index: number) => {
        onApply(suggestion);
        setAppliedIndices(prev => [...prev, index]);
    }, [onApply]);
    
    const createMarkup = (markdown: string) => {
        const rawMarkup = marked.parse(markdown);
        return { __html: rawMarkup };
    };

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-dialog-title"
        >
            <div 
                className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <h3 id="suggestion-dialog-title" className="flex items-center text-lg font-bold text-amber-400 mb-4">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        AI Co-Director Suggestions
                    </h3>

                    {result.thematic_concept && (
                        <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-center">
                            <h4 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Thematic Concept</h4>
                            <p className="text-2xl font-bold text-white mt-1 italic">"{result.thematic_concept}"</p>
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
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-amber-600 text-white hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                                >
                                    {appliedIndices.includes(index) ? 'Applied ✓' : 'Apply'}
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
});


const CoDirector: React.FC<CoDirectorProps> = ({ 
    onGetSuggestions, 
    isLoading, 
    result, 
    onApplySuggestion, 
    onClose, 
    storyBible, 
    scene, 
    directorsVision,
    onApiLog,
    onApiStateChange,
    addToast
}) => {
    const [objective, setObjective] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const planActions = usePlanExpansionActions();

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (objective.trim()) {
            setIsProcessing(true);
            setSuggestions([]);
            try {
                await onGetSuggestions(objective);
            } finally {
                setIsProcessing(false);
            }
        }
    }, [objective, onGetSuggestions]);

    const handleInspire = useCallback(async () => {
        console.log('[CoDirector] handleInspire starting', {
            hasStoryBible: !!storyBible,
            hasLogline: !!storyBible?.logline,
            hasScene: !!scene,
            hasSceneSummary: !!scene?.summary,
            hasDirectorsVision: !!directorsVision,
            directorsVisionLength: directorsVision?.length || 0
        });
        
        setIsProcessing(true);
        setSuggestions([]);
        setLastError(null);
        
        // Validate required context before calling API
        if (!storyBible?.logline) {
            const errorMsg = 'Missing story logline. Please generate a Story Bible first.';
            console.warn('[CoDirector] Validation failed:', errorMsg);
            setLastError(errorMsg);
            addToast?.(errorMsg, 'info');
            setIsProcessing(false);
            return;
        }
        
        if (!scene?.summary) {
            const errorMsg = 'Missing scene summary. Please add a scene description first.';
            console.warn('[CoDirector] Validation failed:', errorMsg);
            setLastError(errorMsg);
            addToast?.(errorMsg, 'info');
            setIsProcessing(false);
            return;
        }
        
        try {
            console.log('[CoDirector] Calling suggestCoDirectorObjectives with:', {
                logline: storyBible.logline.substring(0, 50) + '...',
                sceneSummary: scene.summary.substring(0, 50) + '...',
                visionPreview: directorsVision?.substring(0, 50) || '(empty)'
            });
            
            const result = await planActions.suggestCoDirectorObjectives(
                storyBible.logline,
                scene.summary,
                directorsVision,
                onApiLog,
                onApiStateChange
            );
            
            console.log('[CoDirector] suggestCoDirectorObjectives result:', {
                hasResult: !!result,
                resultLength: result?.length || 0,
                resultPreview: result?.slice(0, 2) || []
            });
            
            if (!result || result.length === 0) {
                const warnMsg = 'No suggestions generated. The AI may need more context - try adding more detail to your scene or director\'s vision.';
                console.warn('[CoDirector] Empty result from suggestCoDirectorObjectives');
                setLastError(warnMsg);
                addToast?.(warnMsg, 'info');
            } else {
                setSuggestions(result);
                console.log('[CoDirector] Successfully set', result.length, 'suggestions');
            }
        } catch(e) {
            const error = e as Error;
            const errorMsg = `AI Co-Director error: ${error.message || 'Unknown error occurred'}`;
            console.error('[CoDirector] Error in handleInspire:', error);
            console.error('[CoDirector] Error stack:', error.stack);
            setLastError(errorMsg);
            addToast?.(errorMsg, 'error');
        } finally {
            setIsProcessing(false);
        }
    }, [storyBible, scene, directorsVision, onApiLog, onApiStateChange, planActions, addToast]);

    const isAnyActionLoading = isLoading || isProcessing;

    return (
        <div className="my-6">
            <div className="relative bg-gray-800/50 backdrop-blur-sm border rounded-lg p-6 shadow-xl shadow-yellow-500/10 overflow-hidden animated-border-glow">
                 <div className="relative">
                    <div className="mb-4 text-center sm:text-left">
                        <h2 className="flex items-center justify-center sm:justify-start text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">
                            <LightbulbIcon className="w-8 h-8 mr-3 text-yellow-300" />
                            AI Co-Director
                        </h2>
                        <p className="text-gray-400 mt-2 max-w-3xl mx-auto sm:mx-0">
                            Describe the mood, style, or changes you want for this scene, and the AI will suggest specific, creative edits to your timeline.
                        </p>
                    </div>
                    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                        <input
                            id="co-director-objective"
                            type="text"
                            value={objective}
                            onChange={(e) => setObjective(e.target.value)}
                            className="flex-grow bg-gray-900/70 border border-gray-700 rounded-md shadow-sm focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm text-gray-200 p-3"
                            placeholder="e.g., Make it more suspenseful, give it a dreamlike quality..."
                        />
                        <button
                            type="submit"
                            disabled={isAnyActionLoading || !objective.trim()}
                            className="inline-flex items-center justify-center px-6 py-3 bg-amber-600 text-white font-semibold rounded-md shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:bg-gray-500 disabled:cursor-not-allowed"
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

                    <div className="mt-4 text-left">
                        <button 
                            onClick={handleInspire}
                            disabled={isAnyActionLoading}
                            className="text-sm font-semibold text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 flex items-center gap-2"
                        >
                            {isProcessing && !isLoading ? (
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
                                        onClick={() => { setObjective(s); setSuggestions([]); setLastError(null); }} 
                                        className="text-left text-sm text-amber-400 hover:text-amber-300 bg-gray-800/50 p-3 rounded-md w-full transition-all duration-300 ease-in-out animate-fade-in-right ring-1 ring-gray-700 hover:ring-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transform hover:-translate-y-1"
                                        style={{ animationDelay: `${i * 100}ms` }}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                        {lastError && suggestions.length === 0 && (
                            <div className="mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded-md text-sm text-red-300">
                                <span className="font-semibold">⚠️ </span>{lastError}
                            </div>
                        )}
                    </div>
                 </div>
            </div>
            {result && <SuggestionModal result={result} onApply={onApplySuggestion} onClose={onClose} />}
        </div>
    )
}

export default React.memo(CoDirector);