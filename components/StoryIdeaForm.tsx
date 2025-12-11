import React, { useState, useCallback, useMemo, useEffect } from 'react';
import SparklesIcon from './icons/SparklesIcon';
import type { ApiStateChangeCallback, ApiLogCallback } from '../services/planExpansionService';
import { useInteractiveSpotlight } from '../utils/hooks';
import ThematicLoader from './ThematicLoader';
import GuideCard from './GuideCard';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { 
    validateStoryIdea, 
    getValidationStatus, 
    getStatusColor,
    type StoryIdeaValidation,
    type ValidationStatus
} from '../services/storyIdeaValidator';
import {
    parseEnhancementResponse,
    isEnhancementBetter,
} from '../services/storyIdeaEnhancer';
import { refineField } from '../services/refineField';
import { useFieldState } from '../utils/useFieldState';
import { suggestionHistoryStore } from '../store/suggestionHistoryStore';
import { logCorrelation, generateCorrelationId } from '../utils/correlation';
import { useSettingsStore } from '../services/settingsStore';
import AlertTriangleIcon from './icons/AlertTriangleIcon';

interface StoryIdeaFormProps {
    onSubmit: (idea: string, genre?: string) => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const StoryIdeaForm: React.FC<StoryIdeaFormProps> = ({ onSubmit, isLoading, onApiStateChange, onApiLog }) => {
    const [idea, setIdea] = useState('');
    const [genre, setGenre] = useState<string>('sci-fi');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [showValidation, setShowValidation] = useState(true);
    const fieldState = useFieldState('Draft');
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();
    const planActions = usePlanExpansionActions();
    const useMockLLM = useSettingsStore(state => state.useMockLLM);

    // Compute validation result whenever idea changes
    const validation: StoryIdeaValidation = useMemo(() => {
        return validateStoryIdea(idea);
    }, [idea]);

    const validationStatus: ValidationStatus = useMemo(() => {
        return getValidationStatus(validation);
    }, [validation]);

    const statusColor = getStatusColor(validationStatus);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.error('[StoryIdeaForm] handleSubmit called');
        if (idea.trim() && validation.canProceed) {
            fieldState.setValidating();
            console.error('[StoryIdeaForm] Submitting idea with validation:', {
                wordCount: validation.wordCount,
                qualityScore: validation.qualityScore,
                issueCount: validation.issues.length
            });
            onSubmit(idea, genre);
        } else if (!validation.canProceed) {
            // Show validation panel if trying to submit invalid idea
            setShowValidation(true);
            fieldState.setHasIssues();
            console.error('[StoryIdeaForm] Blocked submission - validation failed:', validation.issues);
        }
    };
    
    useEffect(() => {
        if (!idea.trim()) {
            fieldState.setDraft();
            return;
        }
        if (validation.issues.length === 0) {
            fieldState.setValid();
        } else {
            fieldState.setHasIssues();
        }
    }, [validation, idea, fieldState]);
    
    const handleSuggest = useCallback(async () => {
        setIsSuggesting(true);
        setSuggestions([]);
        try {
            const result = await planActions.suggestStoryIdeas(onApiLog, onApiStateChange);
            // Enforce uniqueness across session history
            const unique = result.filter(r => !suggestionHistoryStore.has(r));
            const needed = Math.max(4, Math.min(6, unique.length));
            const trimmed = unique.slice(0, needed);
            suggestionHistoryStore.add(trimmed);
            setSuggestions(trimmed);
        } catch (e) {
            console.error(e);
            // The global handler in withRetry will set the error state
        } finally {
            setIsSuggesting(false);
        }
    }, [onApiStateChange, onApiLog, planActions]);

    const handleEnhance = useCallback(async () => {
        if (!idea.trim()) return;
        setIsEnhancing(true);
        
        const originalValidation = validation;
        
        try {
            fieldState.setConverging();
            const enhanced = await refineField({
                fieldType: 'idea',
                storyIdea: idea,
                bibleContext: '',
                currentValue: idea,
                validationIssues: originalValidation.issues.map(i => `${i.code}: ${i.message}`),
                validationSuggestions: originalValidation.issues.map(i => i.suggestion || '').filter(Boolean),
                callLLM: (prompt) => planActions.enhanceStoryIdea(prompt, onApiLog, onApiStateChange),
            });
            
            // Parse and clean the response
            const cleaned = parseEnhancementResponse(enhanced, idea);
            const newValidation = validateStoryIdea(cleaned);
            const correlationId = generateCorrelationId();
            logCorrelation(
                { correlationId, timestamp: Date.now(), source: 'story-idea' },
                'story-idea-enhance',
                {
                    originalWordCount: originalValidation.wordCount,
                    enhancedWordCount: newValidation.wordCount,
                    originalIssues: originalValidation.issues.map(i => i.code),
                    enhancedIssues: newValidation.issues.map(i => i.code),
                }
            );
            
            // Only apply if enhancement is actually better
            if (isEnhancementBetter(originalValidation, newValidation)) {
                console.log('[StoryIdeaForm] Enhancement improved idea:', {
                    oldScore: originalValidation.qualityScore.toFixed(2),
                    newScore: newValidation.qualityScore.toFixed(2),
                    oldIssues: originalValidation.issues.length,
                    newIssues: newValidation.issues.length
                });
                setIdea(cleaned);
                if (newValidation.issues.length === 0) {
                    fieldState.setValid();
                } else {
                    fieldState.setConverging();
                }
            } else {
                console.log('[StoryIdeaForm] Enhancement applied (user requested)');
                setIdea(cleaned);
            }
        } catch (e) {
            console.error('[StoryIdeaForm] Enhancement error:', e);
            fieldState.setHasIssues();
        } finally {
            setIsEnhancing(false);
        }
    }, [idea, genre, validation, planActions, onApiLog, onApiStateChange, fieldState]);

    return (
        <div ref={spotlightRef} className="max-w-3xl mx-auto glass-card p-8 rounded-xl shadow-2xl shadow-black/30 interactive-spotlight" data-testid="StoryIdeaForm">
            <h2 className="text-2xl font-bold text-gray-100 mb-2 text-center">Start with an Idea</h2>
            <p className="text-gray-400 mb-6 text-center">What story do you want to create?</p>
            
            <GuideCard title="What makes a strong story idea?">
                <p>Your initial idea is the seed for everything that follows. Aim for a concept that includes a <strong className="text-amber-300">protagonist</strong>, a clear <strong className="text-amber-300">goal</strong>, and a significant <strong className="text-amber-300">conflict</strong> or obstacle.</p>
            </GuideCard>

            {useMockLLM && (
                <div className="mt-4 bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 flex items-center gap-2 text-amber-200 text-sm">
                    <AlertTriangleIcon className="w-4 h-4" />
                    <span>Mock LLM Mode Active - Story generation will be simulated</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6">
                <div className="mb-4">
                    <label htmlFor="genre-select" className="block text-sm font-medium text-gray-300 mb-2">
                        Genre (Optional - Applied as Template Guide)
                    </label>
                    <select
                        id="genre-select"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-amber-500/30 shadow-black/30 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
                    >
                        <option value="sci-fi">Science Fiction</option>
                        <option value="drama">Drama</option>
                        <option value="thriller">Thriller</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Template guidance will enhance your story's narrative coherence.</p>
                </div>
                <div className="relative">
                    <textarea
                        data-testid="story-idea-input"
                        aria-label="Story Idea"
                        value={idea}
                        onChange={(e) => { setIdea(e.target.value); setShowValidation(true); }}
                        rows={4}
                        className={`w-full bg-gray-800/70 border rounded-md shadow-inner focus:shadow-amber-500/30 shadow-black/30 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-3 transition-all duration-300 ${
                            validationStatus === 'error' ? 'border-red-500/50' : 
                            validationStatus === 'warning' ? 'border-amber-500/50' : 
                            validationStatus === 'valid' ? 'border-green-500/50' : 
                            'border-gray-700'
                        }`}
                        placeholder="e.g., A space explorer finds an ancient artifact that could save humanity, but it's guarded by a sentient AI."
                    />
                    {idea.trim() && (
                        <button
                            type="button"
                            onClick={handleEnhance}
                            disabled={isEnhancing}
                            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-600/50 text-amber-200 hover:bg-amber-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                        >
                            {isEnhancing ? (
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <SparklesIcon className="w-4 h-4" />
                            )}
                            Enhance
                        </button>
                    )}
                </div>
                
                {/* Validation Status Bar */}
                {idea.trim() && showValidation && (
                    <div className="mt-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <span className={statusColor}>
                                {validationStatus === 'valid' && '✅ Ready'}
                                {validationStatus === 'warning' && '⚠ Could be improved'}
                                {validationStatus === 'error' && '⛔ Needs attention'}
                            </span>
                            <span className="text-gray-500">
                                {validation.wordCount} words • Quality: {Math.round(validation.qualityScore * 100)}% • State: {fieldState.state}
                            </span>
                        </div>
                        {validation.issues.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowValidation(!showValidation)}
                                className="text-gray-400 hover:text-gray-300"
                            >
                                {showValidation ? 'Hide details' : 'Show details'}
                            </button>
                        )}
                    </div>
                )}
                {showValidation && validation.issues.length > 0 && (
                    <ul className="mt-2 text-xs text-gray-300 space-y-1">
                        {validation.issues.map((issue, index) => (
                            <li
                                key={`${issue.code}-${index}`}
                                className="flex items-start gap-2"
                            >
                                <span
                                    className={
                                        issue.severity === 'error'
                                            ? 'text-red-400'
                                            : 'text-amber-300'
                                    }
                                >
                                    •
                                </span>
                                <div>
                                    <div>{issue.message}</div>
                                    {issue.suggestion && (
                                        <div className="text-gray-400">
                                            Suggestion: {issue.suggestion}
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {validation.issues.some(i => i.autoFixable) && (
                    <button
                        type="button"
                        onClick={handleEnhance}
                        disabled={isEnhancing}
                        className="mt-2 text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1"
                    >
                        <SparklesIcon className="w-3 h-3" />
                        Auto-fix with AI enhancement
                    </button>
                )}
                
                <button
                    type="submit"
                    disabled={isLoading || !idea.trim() || !validation.canProceed}
                    className="mt-6 w-full sm:w-auto flex items-center justify-center px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-amber-700 hover:to-orange-700 focus:outline-none focus:ring-4 focus:ring-amber-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105 animate-glow"
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
                                className="text-left text-sm text-amber-400 hover:text-amber-300 bg-gray-800/50 p-3 rounded-md w-full transition-all duration-300 ease-in-out animate-fade-in-right ring-1 ring-gray-700 hover:ring-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transform hover:-translate-y-1"
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





