import React, { useState, useCallback, useEffect } from 'react';
import { StoryBible } from '../types';
import { marked } from 'marked';
import type { ApiStateChangeCallback, ApiLogCallback } from '../services/planExpansionService';
import { 
    getPrunedContextForLogline, 
    getPrunedContextForSetting, 
    getPrunedContextForCharacters, 
    getPrunedContextForPlotOutline 
} from '../services/geminiService';
import BookOpenIcon from './icons/BookOpenIcon';
import SparklesIcon from './icons/SparklesIcon';
import SaveIcon from './icons/SaveIcon';
import ClapperboardIcon from './icons/ClapperboardIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';
import { useInteractiveSpotlight, useStoryBibleValidation } from '../utils/hooks';
import GuideCard from './GuideCard';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { estimateTokens, DEFAULT_TOKEN_BUDGETS } from '../services/promptRegistry';
import { validateStoryBibleHard, type StoryBibleValidationResult } from '../services/storyBibleValidator';
import { refineField } from '../services/refineField';
import { logCorrelation, generateCorrelationId } from '../utils/correlation';
import { useFieldState } from '../utils/useFieldState';
import { suggestionHistoryStore } from '../store/suggestionHistoryStore';

interface StoryBibleEditorProps {
    storyBible: StoryBible;
    onUpdate: (bible: StoryBible) => void;
    onGenerateScenes: () => void;
    isLoading: boolean;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${active ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-700/50'}`}
    >
        {children}
    </button>
);

/**
 * Token budget meter component showing usage for a Story Bible section
 */
const TokenMeter: React.FC<{ 
    label: string; 
    value: string; 
    budget: number;
    showWarning?: boolean;
}> = ({ label, value, budget, showWarning = true }) => {
    const tokens = estimateTokens(value);
    const percentage = Math.min((tokens / budget) * 100, 100);
    const isOver = tokens > budget;
    const isWarning = tokens > budget * 0.8 && !isOver;
    
    const getBarColor = () => {
        if (isOver) return 'bg-red-500';
        if (isWarning) return 'bg-yellow-500';
        return 'bg-green-500';
    };
    
    const getTextColor = () => {
        if (isOver) return 'text-red-400';
        if (isWarning) return 'text-yellow-400';
        return 'text-gray-400';
    };
    
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 w-16">{label}</span>
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-300 ${getBarColor()}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className={`w-20 text-right ${getTextColor()}`}>
                {tokens} / {budget}
                {isOver && showWarning && <span className="ml-1">⚠️</span>}
            </span>
        </div>
    );
};

/**
 * Validation status badge showing Story Bible validation state
 */
const ValidationBadge: React.FC<{ 
    valid: boolean; 
    errorCount: number; 
    warningCount: number;
    isV2: boolean;
}> = ({ valid, errorCount, warningCount, isV2 }) => {
    if (valid) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-700/50 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-xs text-green-400 font-medium">Valid</span>
                {isV2 && <span className="text-xs text-green-600 ml-1">(V2)</span>}
            </div>
        );
    }
    
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-700/50 rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-xs text-red-400 font-medium">
                {errorCount} error{errorCount !== 1 ? 's' : ''}
                {warningCount > 0 && `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
            </span>
        </div>
    );
};

const FieldStateBadge: React.FC<{ state: string }> = ({ state }) => (
    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-800 text-gray-300 border border-gray-600">
        {state}
    </span>
);


const StoryBibleEditor: React.FC<StoryBibleEditorProps> = ({ storyBible, onUpdate, onGenerateScenes, isLoading, onApiStateChange, onApiLog }) => {
    const [editableBible, setEditableBible] = useState(storyBible);
    const [charTab, setCharTab] = useState<'edit' | 'preview'>('edit');
    const [plotTab, setPlotTab] = useState<'edit' | 'preview'>('edit');
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();

    const [previewContent, setPreviewContent] = useState({ characters: '', plotOutline: '' });
    const [isPreviewLoading, setIsPreviewLoading] = useState({ characters: false, plotOutline: false });
    // Inline "Enhance" button state for all four Story Bible fields
    // Characters and PlotOutline added to match Logline/Setting pattern (2025-11-29)
    const [isEnhancing, setIsEnhancing] = useState({ logline: false, setting: false, characters: false, plotOutline: false });
    const [suggestions, setSuggestions] = useState({ logline: [] as string[], setting: [] as string[] });
    const [isSuggesting, setIsSuggesting] = useState({ logline: false, setting: false });
    const [showValidationDetails, setShowValidationDetails] = useState(true);
    const [, setLastValidation] = useState<StoryBibleValidationResult | null>(null);
    const planActions = usePlanExpansionActions();
    const bibleFieldState = useFieldState('Draft');
    const loglineState = useFieldState('Draft');
    const charactersState = useFieldState('Draft');
    const settingState = useFieldState('Draft');
    const plotOutlineState = useFieldState('Draft');
    
    // Story Bible validation hook - provides real-time validation feedback
    const validation = useStoryBibleValidation(editableBible);

    useEffect(() => {
        if (validation.issues.length > 0) {
            console.log('[Validation Debug] Issues:', JSON.stringify(validation.issues, null, 2));
        }
    }, [validation.issues]);
    
    // Sync editable bible when prop changes (e.g., after save)
    useEffect(() => {
        setEditableBible(storyBible);
    }, [storyBible]);

    // Keep a validation snapshot to surface issues immediately after refinements
    useEffect(() => {
        const snapshot = validateStoryBibleHard(editableBible);
        setLastValidation(snapshot);
        if (!editableBible.logline && !editableBible.characters && !editableBible.setting && !editableBible.plotOutline) {
            bibleFieldState.setDraft();
        } else if (snapshot.errorCount === 0) {
            bibleFieldState.setValid();
        } else {
            bibleFieldState.setHasIssues();
        }
        setShowValidationDetails(true);
    }, [editableBible]);

    useEffect(() => {
        const updateFieldState = (
            fieldKey: keyof StoryBible,
            sectionKey: string,
            stateHook: ReturnType<typeof useFieldState>
        ) => {
            const value = editableBible[fieldKey];
            // heroArcs is an array, not a string - skip trim check for it
            const stringValue = typeof value === 'string' ? value : '';
            if (!stringValue.trim()) {
                stateHook.setDraft();
                return;
            }
            const hasSectionErrors = validation.errors.some(
                issue => issue.section.split('.')[0] === sectionKey
            );
            if (!hasSectionErrors) {
                stateHook.setValid();
            } else {
                stateHook.setHasIssues();
            }
        };

        updateFieldState('logline', 'logline', loglineState);
        updateFieldState('characters', 'characters', charactersState);
        updateFieldState('setting', 'setting', settingState);
        updateFieldState('plotOutline', 'plotOutline', plotOutlineState);
    }, [editableBible, validation.errors, loglineState, charactersState, settingState, plotOutlineState]);

    const handleFieldChange = (field: keyof StoryBible, value: string) => {
        setEditableBible(prev => {
            const next = { ...prev, [field]: value };
            setLastValidation(validateStoryBibleHard(next));
            setShowValidationDetails(true);
            return next;
        });
    };

    const handleSave = () => {
        onUpdate(editableBible);
    };

    const createMarkup = (markdown: string) => {
        const rawMarkup = marked.parse(markdown);
        return { __html: rawMarkup as string };
    };
    
    const handleGeneratePreview = async (section: 'characters' | 'plotOutline') => {
        const currentContent = editableBible[section];
        if (!currentContent.trim()) {
            return;
        }

        setIsPreviewLoading(prev => ({ ...prev, [section]: true }));
        setPreviewContent(prev => ({ ...prev, [section]: '' })); // Clear previous preview

        if (section === 'characters') {
            charactersState.setConverging();
        } else {
            plotOutlineState.setConverging();
        }

        try {
            const prunedContext = section === 'characters'
                ? getPrunedContextForCharacters(editableBible)
                : getPrunedContextForPlotOutline(editableBible);

            const sectionIssues = validation.issues.filter(issue => issue.section.split('.')[0] === section);
            const validationIssues = sectionIssues.map(issue => `${issue.code}: ${issue.message}`);
            const validationSuggestions = sectionIssues
                .map(issue => issue.suggestion || '')
                .filter(Boolean);

            const refinedText = await refineField({
                fieldType: section,
                storyIdea: editableBible.logline || '',
                bibleContext: prunedContext,
                currentValue: currentContent,
                validationIssues,
                validationSuggestions,
                callLLM: (prompt: string) =>
                    planActions.refineStoryBibleSection(
                        section,
                        prompt,
                        prunedContext,
                        onApiLog,
                        onApiStateChange
                    ),
            });

            setPreviewContent(prev => ({ ...prev, [section]: refinedText }));
        } catch (e) {
            console.error(e);
            if (section === 'characters') {
                charactersState.setHasIssues();
            } else {
                plotOutlineState.setHasIssues();
            }
        } finally {
            setIsPreviewLoading(prev => ({ ...prev, [section]: false }));
        }
    };
    
    const handleTabClick = (section: 'characters' | 'plotOutline', tab: 'edit' | 'preview') => {
        if (section === 'characters') setCharTab(tab);
        if (section === 'plotOutline') setPlotTab(tab);

        if (tab === 'preview' && ( (section === 'characters' && charTab !== 'preview') || (section === 'plotOutline' && plotTab !== 'preview') )) {
            handleGeneratePreview(section);
        }
    };

    const acceptPreview = (section: 'characters' | 'plotOutline') => {
        const updatedValue = previewContent[section];
        if (!updatedValue) return;

        handleFieldChange(section, updatedValue);

        const validationSnapshot = validateStoryBibleHard({ ...editableBible, [section]: updatedValue });
        setLastValidation(validationSnapshot);
        validation.revalidate();

        logCorrelation(
            { correlationId: generateCorrelationId(), timestamp: Date.now(), source: 'story-bible' },
            `refine-${section}`,
            {
                newLength: updatedValue.length,
                issues: validationSnapshot.issues.map(i => i.code),
            }
        );

        const hasErrorsForSection = validationSnapshot.issues.some(
            issue => issue.severity === 'error' && issue.section.split('.')[0] === section
        );

        if (validationSnapshot.errorCount === 0) {
            bibleFieldState.setValid();
        } else {
            bibleFieldState.setConverging();
        }

        if (section === 'characters') {
            if (!hasErrorsForSection) {
                charactersState.setValid();
            } else {
                charactersState.setConverging();
            }
            setCharTab('edit');
        } else {
            if (!hasErrorsForSection) {
                plotOutlineState.setValid();
            } else {
                plotOutlineState.setConverging();
            }
            setPlotTab('edit');
        }
    };

    /**
     * handleEnhanceField - Inline refinement for Story Bible fields
     * 
     * Supports all four core fields: logline, setting, characters, plotOutline
     * Uses refineField() with validation-aware prompts for convergent refinements.
     * 
     * IMPORTANT: Characters and PlotOutline were added 2025-11-29 to provide
     * consistent UX across all Story Bible fields. Previously these only had
     * "Refine with AI" via the Preview tab.
     * 
     * @param field - The Story Bible field to enhance
     */
    const handleEnhanceField = useCallback(async (field: 'logline' | 'setting' | 'characters' | 'plotOutline') => {
        const currentContent = editableBible[field];
        if (!currentContent.trim()) return;
        
        setIsEnhancing(prev => ({ ...prev, [field]: true }));
        bibleFieldState.setConverging();
        
        // Update per-field state based on which field is being enhanced
        switch (field) {
            case 'logline': loglineState.setConverging(); break;
            case 'setting': settingState.setConverging(); break;
            case 'characters': charactersState.setConverging(); break;
            case 'plotOutline': plotOutlineState.setConverging(); break;
        }
        try {
            // Use pruned context instead of full Story Bible (80-90% token reduction)
            // Select the appropriate context getter based on field type
            let prunedContext: string;
            switch (field) {
                case 'logline': prunedContext = getPrunedContextForLogline(editableBible); break;
                case 'setting': prunedContext = getPrunedContextForSetting(editableBible); break;
                case 'characters': prunedContext = getPrunedContextForCharacters(editableBible); break;
                case 'plotOutline': prunedContext = getPrunedContextForPlotOutline(editableBible); break;
            }
            
            // For characters and plotOutline, use refineField for validation-aware refinement
            // For logline and setting, use existing refineStoryBibleSection pattern
            let updatedValue: string;
            
            if (field === 'characters' || field === 'plotOutline') {
                // Use refineField for validation-aware refinement (added 2025-11-29)
                const sectionIssues = validation.issues.filter(issue => issue.section.split('.')[0] === field);
                const validationIssues = sectionIssues.map(issue => `${issue.code}: ${issue.message}`);
                const validationSuggestions = sectionIssues.map(issue => issue.suggestion || '').filter(Boolean);
                
                updatedValue = await refineField({
                    fieldType: field,
                    storyIdea: editableBible.logline || '',
                    bibleContext: prunedContext,
                    currentValue: currentContent,
                    validationIssues,
                    validationSuggestions,
                    callLLM: (prompt: string) =>
                        planActions.refineStoryBibleSection(
                            field,
                            prompt,
                            prunedContext,
                            onApiLog,
                            onApiStateChange
                        ),
                });
            } else {
                // Use refineStoryBibleSection for logline and setting
                const enhanced = await planActions.refineStoryBibleSection(
                    field,
                    currentContent,
                    prunedContext,
                    onApiLog,
                    onApiStateChange
                );
                
                // Extract just the refined text (remove any preamble)
                const cleanedEnhanced = enhanced.replace(/^.*?(logline|setting):?\s*/i, '').trim();
                updatedValue = cleanedEnhanced || enhanced;
            }
            
            handleFieldChange(field, updatedValue);
            const validationSnapshot = validateStoryBibleHard({ ...editableBible, [field]: updatedValue });
            setLastValidation(validationSnapshot);
            setShowValidationDetails(true);
            validation.revalidate();
            logCorrelation(
                { correlationId: generateCorrelationId(), timestamp: Date.now(), source: 'story-bible' },
                `refine-${field}`,
                {
                    newLength: updatedValue.length,
                    issues: validationSnapshot.issues.map(i => i.code),
                }
            );
            
            // Update per-field state based on validation result
            const hasErrorsForField = validationSnapshot.issues.some(
                issue => issue.severity === 'error' && issue.section.split('.')[0] === field
            );
            
            if (validationSnapshot.errorCount === 0) {
                bibleFieldState.setValid();
            } else {
                bibleFieldState.setConverging();
            }
            
            // Update the specific field's state
            switch (field) {
                case 'logline':
                    hasErrorsForField ? loglineState.setConverging() : loglineState.setValid();
                    break;
                case 'setting':
                    hasErrorsForField ? settingState.setConverging() : settingState.setValid();
                    break;
                case 'characters':
                    hasErrorsForField ? charactersState.setConverging() : charactersState.setValid();
                    break;
                case 'plotOutline':
                    hasErrorsForField ? plotOutlineState.setConverging() : plotOutlineState.setValid();
                    break;
            }
        } catch(e) {
            console.error(e);
            bibleFieldState.setHasIssues();
            // Set error state for the specific field
            switch (field) {
                case 'logline': loglineState.setHasIssues(); break;
                case 'setting': settingState.setHasIssues(); break;
                case 'characters': charactersState.setHasIssues(); break;
                case 'plotOutline': plotOutlineState.setHasIssues(); break;
            }
        } finally {
            setIsEnhancing(prev => ({ ...prev, [field]: false }));
        }
    }, [editableBible, planActions, onApiLog, onApiStateChange, bibleFieldState, validation, loglineState, settingState, charactersState, plotOutlineState]);

    const handleSuggestField = useCallback(async (field: 'logline' | 'setting') => {
        setIsSuggesting(prev => ({ ...prev, [field]: true }));
        setSuggestions(prev => ({ ...prev, [field]: [] }));
        try {
            // Use pruned context for suggestions (80-90% token reduction)
            const prunedContext = field === 'logline'
                ? getPrunedContextForLogline(editableBible)
                : getPrunedContextForSetting(editableBible);
            
            // Generate field-specific suggestions using refinement API
            // Pass empty content with special marker to trigger suggestion mode
            const suggestionPrompt = field === 'logline'
                ? `[SUGGESTION MODE] Generate 3-5 compelling story loglines. Each should be a single sentence (140 chars max). Return a numbered list.`
                : `[SUGGESTION MODE] Generate 3-5 evocative setting descriptions. Each should be 1-2 sentences. Return a numbered list.`;
            
            const result = await planActions.refineStoryBibleSection(
                field, // Pass actual field type for field-specific suggestions
                suggestionPrompt,
                prunedContext,
                onApiLog,
                onApiStateChange
            );
            
            // Parse the numbered list into individual suggestions
            const lines = result.split('\n').filter(line => line.trim());
            const parsedSuggestions = lines
                .map(line => line.replace(/^\d+\.?\s*/, '').trim())
                .filter(line => line.length > 10)
                .slice(0, 6);
            const unique = parsedSuggestions.filter(s => !suggestionHistoryStore.has(s));
            const needed = Math.max(4, Math.min(6, unique.length));
            const trimmed = unique.slice(0, needed);
            suggestionHistoryStore.add(trimmed);
            
            setSuggestions(prev => ({ 
                ...prev, 
                [field]: trimmed.length > 0 ? trimmed : ['Failed to generate suggestions. Please try again.'] 
            }));
        } catch(e) {
            console.error(e);
        } finally {
            setIsSuggesting(prev => ({ ...prev, [field]: false }));
        }
    }, [editableBible, planActions, onApiLog, onApiStateChange]);

    const hasChanges = JSON.stringify(storyBible) !== JSON.stringify(editableBible);

    const renderPreviewPane = (section: 'characters' | 'plotOutline') => (
        <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-gray-300 bg-gray-900/50 p-4 rounded-md border border-gray-700/50 min-h-[210px] relative">
            {isPreviewLoading[section] ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/50">
                    <svg className="animate-spin h-8 w-8 text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="mt-3 text-sm text-gray-400">AI is refining...</p>
                </div>
            ) : previewContent[section] ? (
                <>
                    <div dangerouslySetInnerHTML={createMarkup(previewContent[section])} />
                    <div className="absolute top-2 right-2 not-prose flex gap-2">
                        <button
                            onClick={() => section === 'characters' ? setCharTab('edit') : setPlotTab('edit')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-gray-600 text-white hover:bg-gray-700"
                        >
                            Back to Edit
                        </button>
                        <button 
                            onClick={() => acceptPreview(section)} 
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-green-600 text-white hover:bg-green-700"
                        >
                            <RefreshCwIcon className="w-4 h-4" />
                            Accept & Update
                        </button>
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-center p-4">
                    <p className="text-gray-500 italic">Click the "Refine with AI" tab again to re-generate, or go back to edit.</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center">
                <BookOpenIcon className="w-12 h-12 mx-auto text-amber-400 mb-4" />
                <h2 className="text-3xl font-bold text-gray-100">Your Story Bible</h2>
                <p className="text-gray-400 mt-2">This is the narrative foundation of your project. Refine it here before generating scenes.</p>
                
                {/* Validation Status Badge */}
                <div className="flex flex-col items-center gap-2 mt-4">
                    <ValidationBadge 
                        valid={validation.valid} 
                        errorCount={validation.errors.length}
                        warningCount={validation.warnings.length}
                        isV2={validation.isV2}
                    />
                    <span className="text-xs text-gray-400">State: {bibleFieldState.state}</span>
                </div>
            </div>

            <GuideCard title="What is a Story Bible?">
                <p>
                    The Story Bible is the single source of truth for your entire project. Every creative decision flows from here. 
                    Take your time to refine each section. A strong foundation here leads to a much more coherent and compelling final story.
                    Use the <strong className="text-amber-300">Refine with AI</strong> feature to enhance the AI's initial draft.
                </p>
            </GuideCard>
            
            {/* Token Budget Overview */}
            <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-300">Token Budgets</h3>
                    <button 
                        onClick={() => setShowValidationDetails(!showValidationDetails)}
                        className="text-xs text-amber-400 hover:text-amber-300"
                    >
                        {showValidationDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                </div>
                <div className="space-y-2">
                    <TokenMeter label="Logline" value={editableBible.logline} budget={DEFAULT_TOKEN_BUDGETS.logline} />
                    <TokenMeter label="Characters" value={editableBible.characters} budget={DEFAULT_TOKEN_BUDGETS.characterProfile * 5} />
                    <TokenMeter label="Setting" value={editableBible.setting} budget={DEFAULT_TOKEN_BUDGETS.setting} />
                    <TokenMeter label="Plot" value={editableBible.plotOutline} budget={DEFAULT_TOKEN_BUDGETS.plotOutline} />
                </div>
                
                {/* Validation Details Expandable */}
                {showValidationDetails && validation.issues.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700/50">
                        <h4 className="text-sm font-medium text-gray-400 mb-2">Validation Issues</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {validation.errors.map((issue, idx) => (
                                <div key={`err-${idx}`} className="flex items-start gap-2 text-xs bg-red-900/20 p-2 rounded border border-red-800/30">
                                    <span className="text-red-400">❌</span>
                                    <div>
                                        <span className="text-red-300">[{issue.section}]</span>
                                        <span className="text-gray-300 ml-2">{issue.message}</span>
                                        {issue.suggestion && (
                                            <p className="text-gray-400 mt-1 italic">💡 {issue.suggestion}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {validation.warnings.map((issue, idx) => (
                                <div key={`warn-${idx}`} className="flex items-start gap-2 text-xs bg-yellow-900/20 p-2 rounded border border-yellow-800/30">
                                    <span className="text-yellow-400">⚠️</span>
                                    <div>
                                        <span className="text-yellow-300">[{issue.section}]</span>
                                        <span className="text-gray-300 ml-2">{issue.message}</span>
                                        {issue.suggestion && (
                                            <p className="text-gray-400 mt-1 italic">💡 {issue.suggestion}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div ref={spotlightRef} className="glass-card p-8 rounded-xl space-y-6 interactive-spotlight">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <div className="flex items-center">
                                <label className="block text-sm font-medium text-gray-300">Logline</label>
                                <FieldStateBadge state={loglineState.state} />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">A single, powerful sentence that captures your entire story. This is your north star.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {editableBible.logline.trim() ? (
                                <button
                                    type="button"
                                    onClick={() => handleEnhanceField('logline')}
                                    disabled={isEnhancing.logline}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-600/50 text-amber-200 hover:bg-amber-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                                >
                                    {isEnhancing.logline ? (
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    Enhance
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleSuggestField('logline')}
                                    disabled={isSuggesting.logline}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-yellow-600/50 text-yellow-200 hover:bg-yellow-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                                >
                                    {isSuggesting.logline ? (
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    Suggest
                                </button>
                            )}
                        </div>
                    </div>
                    <textarea
                        value={editableBible.logline}
                        placeholder="e.g., A retired detective is pulled back for one last case that threatens to unravel his past."
                        onChange={(e) => handleFieldChange('logline', e.target.value)}
                        rows={2}
                        className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-amber-500/30 shadow-black/30 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
                    />
                    {suggestions.logline.length > 0 && (
                        <div className="space-y-2 mt-3">
                            {suggestions.logline.map((s, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => { handleFieldChange('logline', s); setSuggestions(prev => ({ ...prev, logline: [] })); }} 
                                    className="text-left text-sm text-amber-400 hover:text-amber-300 bg-gray-800/50 p-3 rounded-md w-full transition-all duration-300 ease-in-out animate-fade-in-right ring-1 ring-gray-700 hover:ring-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transform hover:-translate-y-1"
                                    style={{ animationDelay: `${i * 100}ms` }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                
                <div>
                    <div className="flex justify-between items-center mb-2">
                          <div>
                               <div className="flex items-center">
                                   <label className="block text-sm font-medium text-gray-300">Characters</label>
                                   <FieldStateBadge state={charactersState.state} />
                               </div>
                               <p className="text-xs text-gray-400 mt-1">Introduce your key players. Deepen their motivations and conflicts to drive the story.</p>
                          </div>
                        <div className="flex items-center gap-2">
                            {/* Inline Enhance button for Characters - added 2025-11-29 for UX consistency */}
                            {editableBible.characters.trim() && (
                                <button
                                    type="button"
                                    onClick={() => handleEnhanceField('characters')}
                                    disabled={isEnhancing.characters}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-600/50 text-amber-200 hover:bg-amber-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                                    title="Quick enhance characters inline"
                                >
                                    {isEnhancing.characters ? (
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    Enhance
                                </button>
                            )}
                            <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-lg">
                                <TabButton active={charTab === 'edit'} onClick={() => handleTabClick('characters', 'edit')}>Edit</TabButton>
                                <TabButton active={charTab === 'preview'} onClick={() => handleTabClick('characters', 'preview')}>
                                    <SparklesIcon className="w-3 h-3" /> Refine with AI
                                </TabButton>
                            </div>
                        </div>
                    </div>
                    {charTab === 'edit' ? (
                        <textarea
                            value={editableBible.characters}
                            onChange={(e) => handleFieldChange('characters', e.target.value)}
                            rows={8}
                            placeholder="e.g., * **Protagonist:** A grizzled detective haunted by a past failure.
* **Antagonist:** A cunning art thief who leaves behind cryptic clues."
                            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-200 p-3"
                        />
                    ) : renderPreviewPane('characters')}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-2">
                         <div>
                            <div className="flex items-center">
                                <label className="block text-sm font-medium text-gray-300">Setting</label>
                                <FieldStateBadge state={settingState.state} />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Describe the world, time, and atmosphere. What does it feel like to be there?</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {editableBible.setting.trim() ? (
                                <button
                                    type="button"
                                    onClick={() => handleEnhanceField('setting')}
                                    disabled={isEnhancing.setting}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-600/50 text-amber-200 hover:bg-amber-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                                >
                                    {isEnhancing.setting ? (
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    Enhance
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => handleSuggestField('setting')}
                                    disabled={isSuggesting.setting}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-yellow-600/50 text-yellow-200 hover:bg-yellow-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                                >
                                    {isSuggesting.setting ? (
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    Suggest
                                </button>
                            )}
                        </div>
                    </div>
                    <textarea
                        value={editableBible.setting}
                        placeholder="e.g., A rain-slicked, neon-lit metropolis in the year 2049, where technology and decay coexist."
                        onChange={(e) => handleFieldChange('setting', e.target.value)}
                        rows={4}
                        className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:shadow-amber-500/30 shadow-black/30 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-3 transition-all duration-300"
                    />
                    {suggestions.setting.length > 0 && (
                        <div className="space-y-2 mt-3">
                            {suggestions.setting.map((s, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => { handleFieldChange('setting', s); setSuggestions(prev => ({ ...prev, setting: [] })); }} 
                                    className="text-left text-sm text-amber-400 hover:text-amber-300 bg-gray-800/50 p-3 rounded-md w-full transition-all duration-300 ease-in-out animate-fade-in-right ring-1 ring-gray-700 hover:ring-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transform hover:-translate-y-1"
                                    style={{ animationDelay: `${i * 100}ms` }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                
                <div>
                    <div className="flex justify-between items-center mb-2">
                         <div>
                            <div className="flex items-center">
                                <label className="block text-sm font-medium text-gray-300">Plot Outline</label>
                                <FieldStateBadge state={plotOutlineState.state} />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Structure your narrative. The AI will adapt a classic structure (like The Hero's Journey) to fit your story. Use the AI refiner to add twists and foreshadowing.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Inline Enhance button for Plot Outline - added 2025-11-29 for UX consistency */}
                            {editableBible.plotOutline.trim() && (
                                <button
                                    type="button"
                                    onClick={() => handleEnhanceField('plotOutline')}
                                    disabled={isEnhancing.plotOutline}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-amber-600/50 text-amber-200 hover:bg-amber-600/80 disabled:bg-gray-600 disabled:text-gray-400"
                                    title="Quick enhance plot outline inline"
                                >
                                    {isEnhancing.plotOutline ? (
                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : (
                                        <SparklesIcon className="w-3 h-3" />
                                    )}
                                    Enhance
                                </button>
                            )}
                            <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-lg">
                               <TabButton active={plotTab === 'edit'} onClick={() => handleTabClick('plotOutline', 'edit')}>Edit</TabButton>
                               <TabButton active={plotTab === 'preview'} onClick={() => handleTabClick('plotOutline', 'preview')}>
                                   <SparklesIcon className="w-3 h-3" /> Refine with AI
                               </TabButton>
                            </div>
                        </div>
                    </div>
                     {plotTab === 'edit' ? (
                        <textarea
                            value={editableBible.plotOutline}
                            onChange={(e) => handleFieldChange('plotOutline', e.target.value)}
                            rows={10}
                            placeholder="e.g., * **Act I:** The detective discovers the first crime, reluctantly takes the case...
* **Act II:** A cat-and-mouse game ensues across the city...
* **Act III:** The final confrontation in a museum reveals a shocking truth."
                            className="w-full bg-gray-800/70 border border-gray-700 rounded-md shadow-inner focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-200 p-3"
                        />
                    ) : renderPreviewPane('plotOutline')}
                </div>

                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-6 border-t border-gray-700/50">
                    <div className="flex gap-4">
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || isLoading}
                            className="inline-flex items-center justify-center px-6 py-2 bg-gray-600 text-white font-semibold rounded-full shadow-sm transition-colors hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                            <SaveIcon className="mr-2 h-5 w-5" />
                            Save Changes
                        </button>
                        <button
                            onClick={onGenerateScenes}
                            disabled={isLoading || hasChanges || !validation.valid}
                            title={!validation.valid ? 'Fix validation errors before generating scenes' : hasChanges ? 'Save changes first' : ''}
                            className="inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:from-amber-700 hover:to-orange-700 focus:outline-none focus:ring-4 focus:ring-amber-500 focus:ring-opacity-50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105 animate-glow"
                        >
                            <ClapperboardIcon className="mr-2 h-5 w-5" />
                            Set Vision & Generate Scenes
                        </button>
                    </div>
                </div>
                 {hasChanges && <p className="text-center text-yellow-400 text-sm mt-2">You have unsaved changes. Please save before proceeding.</p>}
                 {!validation.valid && !hasChanges && (
                    <p className="text-center text-red-400 text-sm mt-2">
                        Please fix {validation.errors.length} validation error{validation.errors.length !== 1 ? 's' : ''} before generating scenes.
                    </p>
                 )}
            </div>
        </div>
    );
};

export default StoryBibleEditor;
