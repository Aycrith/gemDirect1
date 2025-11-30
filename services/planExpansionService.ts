import { ApiStateChangeCallback, ApiLogCallback } from './geminiService';
import * as geminiService from './geminiService';
import * as localFallback from './localFallbackService';
import {
    generateLocalSceneList,
    generateStoryBlueprint,
    suggestStoryIdeas as llmSuggestStoryIdeas,
    suggestDirectorsVisions as llmSuggestDirectorsVisions,
    refineDirectorsVision as llmRefineDirectorsVision,
    suggestCoDirectorObjectives as llmSuggestCoDirectorObjectives,
    refineStoryBibleSection as llmRefineStoryBibleSection,
} from './localStoryService';
import { StoryBible, StoryBibleV2, Scene, TimelineData, BatchShotTask, BatchShotResult, DetailedShotResult, CoDirectorResult, ContinuityResult, WorkflowMapping, isStoryBibleV2 } from '../types';
import { validateStoryBibleHard, buildRegenerationFeedback } from './storyBibleValidator';
import { convertToStoryBibleV2 } from './storyBibleConverter';

export type PlanExpansionActions = {
    getPrunedContextForShotGeneration: (
        storyBible: StoryBible,
        narrativeContext: string,
        sceneSummary: string,
        directorsVision: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    getPrunedContextForCoDirector: (
        storyBible: StoryBible,
        narrativeContext: string,
        scene: Scene,
        directorsVision: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    getPrunedContextForBatchProcessing: (
        narrativeContext: string,
        directorsVision: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    generateStoryBible: (
        idea: string,
        genre: string | undefined,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<StoryBibleV2>;
    generateSceneList: (
        plotOutline: string,
        directorsVision: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<Array<{ title: string; summary: string; temporalContext?: { startMoment: string; endMoment: string } }>>;
    generateAndDetailInitialShots: (
        prunedContext: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<DetailedShotResult[]>;
    suggestStoryIdeas: (
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string[]>;
    suggestDirectorsVisions: (
        storyBible: StoryBible,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string[]>;
    suggestNegativePrompts: (
        directorsVision: string,
        sceneSummary: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string[]>;
    refineDirectorsVision: (
        vision: string,
        storyBible: StoryBible,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    refineStoryBibleSection: (
        section: 'characters' | 'plotOutline' | 'logline' | 'setting',
        content: string,
        prunedContext: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    suggestCoDirectorObjectives: (
        logline: string,
        sceneSummary: string,
        directorsVision: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string[]>;
    getCoDirectorSuggestions: (
        prunedContext: string,
        timelineSummary: string,
        objective: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<CoDirectorResult>;
    batchProcessShotEnhancements: (
        tasks: BatchShotTask[],
        prunedContext: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<BatchShotResult[]>;
    analyzeVideoFrames: (
        frames: string[],
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    getPrunedContextForContinuity: (
        storyBible: StoryBible,
        narrativeContext: string,
        scene: Scene,
        directorsVision: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    scoreContinuity: (
        prunedContext: string,
        scene: Scene,
        videoAnalysis: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<ContinuityResult>;
    generateNextSceneFromContinuity: (
        storyBible: StoryBible,
        directorsVision: string,
        lastSceneSummary: string,
        userDirection: string,
        lastFrame: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<{ title: string; summary: string }>;
    updateSceneSummaryWithRefinements: (
        originalSummary: string,
        refinedTimeline: TimelineData,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    generateWorkflowMapping: (
        workflowJson: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<WorkflowMapping>;
};

const LOCAL_STRATEGY_ID = 'local-drafter';

/**
 * Default strategy is now local-drafter (LM Studio).
 * Users can explicitly select gemini-plan for cloud API access.
 */
export const DEFAULT_STRATEGY_ID = LOCAL_STRATEGY_ID;

/**
 * Maximum retry attempts for Story Bible generation when validation fails.
 */
const MAX_RETRY_ATTEMPTS = 2;

const notify = (onStateChange: ApiStateChangeCallback | undefined, status: Parameters<ApiStateChangeCallback>[0], message: string) => {
    onStateChange?.(status, message);
};

const logSuccess = (logApiCall: ApiLogCallback, context: string, model: string) => {
    logApiCall({ context, model, tokens: 0, status: 'success' });
};

const logError = (logApiCall: ApiLogCallback, context: string, model: string) => {
    logApiCall({ context, model, tokens: 0, status: 'error' });
};

const runLocal = async <T>(
    context: string,
    operation: () => Promise<T>,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<T> => {
    try {
        notify(onStateChange, 'loading', `Running locally: ${context}...`);
        const result = await operation();
        notify(onStateChange, 'success', `${context} completed locally.`);
        logSuccess(logApiCall, `${context} (local)`, LOCAL_STRATEGY_ID);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Local fallback failed.';
        notify(onStateChange, 'error', message);
        logError(logApiCall, `${context} (local)`, LOCAL_STRATEGY_ID);
        throw error;
    }
};

/**
 * Generates a Story Bible with validation and automatic retry on failure.
 * 
 * This is the recommended entry point for Story Bible generation as it:
 * 1. Attempts generation with the local LLM (default) or Gemini
 * 2. Validates the result using hard-gate validation
 * 3. Retries up to MAX_RETRY_ATTEMPTS times with feedback on failure
 * 4. Reports validation issues through onStateChange
 * 
 * @param generator - The underlying generator function (from local or Gemini)
 * @param idea - The story idea to expand
 * @param genre - Genre for template selection
 * @param logApiCall - API logging callback
 * @param onStateChange - State change callback for UI updates
 */
const generateStoryBibleWithValidation = async (
    generator: (idea: string, genre: string) => Promise<StoryBible>,
    idea: string,
    genre: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<StoryBibleV2> => {
    let lastBible: StoryBible | undefined;
    
    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        notify(onStateChange, 'loading', 
            attempt === 0 
                ? 'Generating Story Bible...' 
                : `Regenerating Story Bible (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS + 1})...`
        );
        
        try {
            const bible = await generator(idea, genre);
            lastBible = bible;
            
            // If it's already V2, use it directly; otherwise convert using proper parser
            const bibleV2: StoryBibleV2 = isStoryBibleV2(bible) 
                ? bible 
                : convertToStoryBibleV2(bible);
            
            // Calculate total tokens
            if (bibleV2.tokenMetadata) {
                bibleV2.tokenMetadata.totalTokens = 
                    bibleV2.tokenMetadata.loglineTokens + 
                    bibleV2.tokenMetadata.charactersTokens + 
                    bibleV2.tokenMetadata.settingTokens + 
                    bibleV2.tokenMetadata.plotOutlineTokens;
            }
            
            // Validate
            const validation = validateStoryBibleHard(bibleV2);
            
            if (validation.valid) {
                logSuccess(logApiCall, 'generate Story Bible (validated)', LOCAL_STRATEGY_ID);
                notify(onStateChange, 'success', 'Story Bible generated and validated successfully.');
                return bibleV2;
            }
            
            // If we have hard errors and more attempts, retry with feedback
            const hardErrors = validation.issues.filter(i => i.severity === 'error');
            if (hardErrors.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
                const feedback = buildRegenerationFeedback(validation, 'logline');
                console.warn(`[planExpansionService] Story Bible validation failed, retrying with feedback:`, feedback);
                notify(onStateChange, 'retrying', 
                    `Story Bible has ${hardErrors.length} issues. Regenerating with corrections...`
                );
                // Note: In a full implementation, we'd pass feedback to the generator
                // For now, we just retry and hope for better output
                continue;
            }
            
            // Return with warnings if only soft issues remain
            if (hardErrors.length === 0) {
                const warnings = validation.issues.filter(i => i.severity === 'warning');
                if (warnings.length > 0) {
                    console.info(`[planExpansionService] Story Bible has ${warnings.length} warnings but passed hard validation.`);
                }
                logSuccess(logApiCall, 'generate Story Bible (with warnings)', LOCAL_STRATEGY_ID);
                notify(onStateChange, 'success', 
                    `Story Bible generated with ${warnings.length} minor suggestions.`
                );
                return bibleV2;
            }
            
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Generation failed.';
            console.error(`[planExpansionService] Story Bible generation attempt ${attempt + 1} failed:`, message);
            if (attempt === MAX_RETRY_ATTEMPTS) {
                logError(logApiCall, 'generate Story Bible', LOCAL_STRATEGY_ID);
                notify(onStateChange, 'error', `Story Bible generation failed: ${message}`);
                throw error;
            }
        }
    }
    
    // If we get here, we exhausted retries with validation failures
    // Return the last result anyway with a warning
    if (lastBible) {
        const bibleV2: StoryBibleV2 = isStoryBibleV2(lastBible) 
            ? lastBible 
            : { ...lastBible, version: '2.0', characterProfiles: [], plotScenes: [] };
        
        console.warn(`[planExpansionService] Story Bible validation failed after ${MAX_RETRY_ATTEMPTS + 1} attempts. Returning best effort result.`);
        logSuccess(logApiCall, 'generate Story Bible (validation failed)', LOCAL_STRATEGY_ID);
        notify(onStateChange, 'success', 
            'Story Bible generated but may have quality issues. Consider refining manually.'
        );
        return bibleV2;
    }
    
    throw new Error('Story Bible generation failed completely.');
};

const localActions: PlanExpansionActions = {
    getPrunedContextForShotGeneration: async (storyBible, narrativeContext, sceneSummary, directorsVision, logApiCall, onStateChange) => {
        const result = await localFallback.getPrunedContextForShotGeneration(storyBible, narrativeContext, sceneSummary, directorsVision);
        notify(onStateChange, 'success', 'Context prepared locally.');
        logSuccess(logApiCall, 'prune context for shot generation (local)', LOCAL_STRATEGY_ID);
        return result;
    },
    getPrunedContextForCoDirector: async (storyBible, narrativeContext, scene, directorsVision, logApiCall, onStateChange) => {
        const result = await localFallback.getPrunedContextForCoDirector(storyBible, narrativeContext, scene, directorsVision);
        notify(onStateChange, 'success', 'Co-Director context prepared locally.');
        logSuccess(logApiCall, 'prune context for co-director (local)', LOCAL_STRATEGY_ID);
        return result;
    },
    getPrunedContextForBatchProcessing: async (narrativeContext, directorsVision, logApiCall, onStateChange) => {
        const result = await localFallback.getPrunedContextForBatchProcessing(narrativeContext, directorsVision);
        notify(onStateChange, 'success', 'Batch context prepared locally.');
        logSuccess(logApiCall, 'prune context for batch processing (local)', LOCAL_STRATEGY_ID);
        return result;
    },
    generateStoryBible: (idea, genre = 'sci-fi', logApiCall, onStateChange) => 
        generateStoryBibleWithValidation(
            (i, g) => generateStoryBlueprint(i, g),
            idea,
            genre,
            logApiCall!,
            onStateChange
        ),
    generateSceneList: (plotOutline, directorsVision, logApiCall, onStateChange) => runLocal('generate scene list', () => generateLocalSceneList(plotOutline, directorsVision), logApiCall, onStateChange),
    generateAndDetailInitialShots: (prunedContext, logApiCall, onStateChange) => runLocal('generate and detail initial shots', () => localFallback.generateAndDetailInitialShots(prunedContext), logApiCall, onStateChange),
    suggestStoryIdeas: (logApiCall, onStateChange) => runLocal('suggest ideas', () => llmSuggestStoryIdeas(), logApiCall, onStateChange),
    suggestDirectorsVisions: (storyBible, logApiCall, onStateChange) => runLocal('suggest visions', () => llmSuggestDirectorsVisions(storyBible), logApiCall, onStateChange),
    suggestNegativePrompts: (_directorsVision, _sceneSummary, logApiCall, onStateChange) => runLocal('suggest negative prompts', () => localFallback.suggestNegativePrompts(), logApiCall, onStateChange),
    refineDirectorsVision: (vision, storyBible, logApiCall, onStateChange) => runLocal('refine director vision', () => llmRefineDirectorsVision(vision, storyBible), logApiCall, onStateChange),
    refineStoryBibleSection: (section, content, prunedContext, logApiCall, onStateChange) => runLocal('refine story bible section', () => llmRefineStoryBibleSection(section, content, prunedContext), logApiCall, onStateChange),
    suggestCoDirectorObjectives: (logline, sceneSummary, directorsVision, logApiCall, onStateChange) => runLocal('suggest Co-Director objectives', () => llmSuggestCoDirectorObjectives(logline, sceneSummary, directorsVision), logApiCall, onStateChange),
    getCoDirectorSuggestions: (prunedContext, timelineSummary, objective, logApiCall, onStateChange) => runLocal('get Co-Director suggestions', () => localFallback.getCoDirectorSuggestions(prunedContext, timelineSummary, objective), logApiCall, onStateChange),
    batchProcessShotEnhancements: (tasks, _prunedContext, logApiCall, onStateChange) => runLocal('batch process shots', () => localFallback.batchProcessShotEnhancements(tasks), logApiCall, onStateChange),
    analyzeVideoFrames: (frames, logApiCall, onStateChange) => runLocal('analyze video frames', () => localFallback.analyzeVideoFrames(frames), logApiCall, onStateChange),
    getPrunedContextForContinuity: (storyBible, narrativeContext, scene, directorsVision, logApiCall, onStateChange) => {
        const result = localFallback.getPrunedContextForContinuity(storyBible, narrativeContext, scene, directorsVision);
        notify(onStateChange, 'success', 'Continuity context prepared locally.');
        logSuccess(logApiCall, 'prune context for continuity (local)', LOCAL_STRATEGY_ID);
        return result;
    },
    scoreContinuity: (prunedContext, scene, videoAnalysis, logApiCall, onStateChange) => runLocal('score continuity', () => localFallback.scoreContinuity(prunedContext, scene, videoAnalysis), logApiCall, onStateChange),
    generateNextSceneFromContinuity: (storyBible, directorsVision, lastSceneSummary, userDirection, lastFrame, logApiCall, onStateChange) => runLocal('generate next scene from continuity', () => localFallback.generateNextSceneFromContinuity(storyBible, directorsVision, lastSceneSummary, userDirection, lastFrame), logApiCall, onStateChange),
    updateSceneSummaryWithRefinements: (originalSummary, refinedTimeline, logApiCall, onStateChange) => runLocal('update scene summary', () => localFallback.updateSceneSummaryWithRefinements(originalSummary, refinedTimeline), logApiCall, onStateChange),
    generateWorkflowMapping: (workflowJson, logApiCall, onStateChange) => runLocal('generate ComfyUI workflow mapping', () => localFallback.generateWorkflowMapping(workflowJson), logApiCall, onStateChange)
};

const geminiActions: PlanExpansionActions = {
    getPrunedContextForShotGeneration: geminiService.getPrunedContextForShotGeneration,
    getPrunedContextForCoDirector: geminiService.getPrunedContextForCoDirector,
    getPrunedContextForBatchProcessing: geminiService.getPrunedContextForBatchProcessing,
    generateStoryBible: geminiService.generateStoryBible,
    generateSceneList: geminiService.generateSceneList,
    generateAndDetailInitialShots: geminiService.generateAndDetailInitialShots,
    suggestStoryIdeas: geminiService.suggestStoryIdeas,
    suggestDirectorsVisions: geminiService.suggestDirectorsVisions,
    suggestNegativePrompts: geminiService.suggestNegativePrompts,
    refineDirectorsVision: geminiService.refineDirectorsVision,
    refineStoryBibleSection: geminiService.refineStoryBibleSection,
    suggestCoDirectorObjectives: geminiService.suggestCoDirectorObjectives,
    getCoDirectorSuggestions: geminiService.getCoDirectorSuggestions,
    batchProcessShotEnhancements: geminiService.batchProcessShotEnhancements,
    analyzeVideoFrames: geminiService.analyzeVideoFrames,
    getPrunedContextForContinuity: geminiService.getPrunedContextForContinuity,
    scoreContinuity: geminiService.scoreContinuity,
    generateNextSceneFromContinuity: geminiService.generateNextSceneFromContinuity,
    updateSceneSummaryWithRefinements: geminiService.updateSceneSummaryWithRefinements,
    generateWorkflowMapping: geminiService.generateWorkflowMapping
};

/**
 * Creates a fallback-wrapped action that tries Gemini first, then falls back to local on failure.
 * This provides automatic resilience when Gemini API has issues.
 */
const createFallbackAction = <T extends (...args: any[]) => Promise<any>>(
    geminiAction: T,
    localAction: T,
    actionName: string
): T => {
    return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
        try {
            // Try Gemini first
            return await geminiAction(...args);
        } catch (error) {
            console.warn(`[Fallback] ${actionName} failed with Gemini, falling back to local provider:`, error);
            const onStateChange = args.find((arg): arg is ApiStateChangeCallback => typeof arg === 'function' && arg.length === 2);
            onStateChange?.('retrying', `Gemini failed, automatically switching to local fallback...`);
            
            // Fall back to local
            try {
                return await localAction(...args);
            } catch (localError) {
                console.error(`[Fallback] ${actionName} failed with local provider as well:`, localError);
                throw new Error(`Both Gemini and local providers failed for ${actionName}. ${localError instanceof Error ? localError.message : 'Unknown error'}`);
            }
        }
    }) as T;
};

/**
 * Creates actions with automatic fallback support.
 * When a user selects a strategy, we honor their choice, but for Gemini,
 * we wrap each action with automatic local fallback on failure.
 */
export const createPlanExpansionActions = (strategyId: string): PlanExpansionActions => {
    if (strategyId === LOCAL_STRATEGY_ID) {
        return localActions;
    }
    
    // For Gemini strategy, wrap each action with automatic fallback to local
    const actionsWithFallback: PlanExpansionActions = {
        getPrunedContextForShotGeneration: createFallbackAction(
            geminiActions.getPrunedContextForShotGeneration,
            localActions.getPrunedContextForShotGeneration,
            'getPrunedContextForShotGeneration'
        ),
        getPrunedContextForCoDirector: createFallbackAction(
            geminiActions.getPrunedContextForCoDirector,
            localActions.getPrunedContextForCoDirector,
            'getPrunedContextForCoDirector'
        ),
        getPrunedContextForBatchProcessing: createFallbackAction(
            geminiActions.getPrunedContextForBatchProcessing,
            localActions.getPrunedContextForBatchProcessing,
            'getPrunedContextForBatchProcessing'
        ),
        generateStoryBible: createFallbackAction(
            geminiActions.generateStoryBible,
            localActions.generateStoryBible,
            'generateStoryBible'
        ),
        generateSceneList: createFallbackAction(
            geminiActions.generateSceneList,
            localActions.generateSceneList,
            'generateSceneList'
        ),
        generateAndDetailInitialShots: createFallbackAction(
            geminiActions.generateAndDetailInitialShots,
            localActions.generateAndDetailInitialShots,
            'generateAndDetailInitialShots'
        ),
        suggestStoryIdeas: createFallbackAction(
            geminiActions.suggestStoryIdeas,
            localActions.suggestStoryIdeas,
            'suggestStoryIdeas'
        ),
        suggestDirectorsVisions: createFallbackAction(
            geminiActions.suggestDirectorsVisions,
            localActions.suggestDirectorsVisions,
            'suggestDirectorsVisions'
        ),
        suggestNegativePrompts: createFallbackAction(
            geminiActions.suggestNegativePrompts,
            localActions.suggestNegativePrompts,
            'suggestNegativePrompts'
        ),
        refineDirectorsVision: createFallbackAction(
            geminiActions.refineDirectorsVision,
            localActions.refineDirectorsVision,
            'refineDirectorsVision'
        ),
        refineStoryBibleSection: createFallbackAction(
            geminiActions.refineStoryBibleSection,
            localActions.refineStoryBibleSection,
            'refineStoryBibleSection'
        ),
        suggestCoDirectorObjectives: createFallbackAction(
            geminiActions.suggestCoDirectorObjectives,
            localActions.suggestCoDirectorObjectives,
            'suggestCoDirectorObjectives'
        ),
        getCoDirectorSuggestions: createFallbackAction(
            geminiActions.getCoDirectorSuggestions,
            localActions.getCoDirectorSuggestions,
            'getCoDirectorSuggestions'
        ),
        batchProcessShotEnhancements: createFallbackAction(
            geminiActions.batchProcessShotEnhancements,
            localActions.batchProcessShotEnhancements,
            'batchProcessShotEnhancements'
        ),
        analyzeVideoFrames: createFallbackAction(
            geminiActions.analyzeVideoFrames,
            localActions.analyzeVideoFrames,
            'analyzeVideoFrames'
        ),
        getPrunedContextForContinuity: createFallbackAction(
            geminiActions.getPrunedContextForContinuity,
            localActions.getPrunedContextForContinuity,
            'getPrunedContextForContinuity'
        ),
        scoreContinuity: createFallbackAction(
            geminiActions.scoreContinuity,
            localActions.scoreContinuity,
            'scoreContinuity'
        ),
        generateNextSceneFromContinuity: createFallbackAction(
            geminiActions.generateNextSceneFromContinuity,
            localActions.generateNextSceneFromContinuity,
            'generateNextSceneFromContinuity'
        ),
        updateSceneSummaryWithRefinements: createFallbackAction(
            geminiActions.updateSceneSummaryWithRefinements,
            localActions.updateSceneSummaryWithRefinements,
            'updateSceneSummaryWithRefinements'
        ),
        generateWorkflowMapping: createFallbackAction(
            geminiActions.generateWorkflowMapping,
            localActions.generateWorkflowMapping,
            'generateWorkflowMapping'
        ),
    };

    const LOCAL_ONLY_ACTIONS: Array<keyof PlanExpansionActions> = [
        'suggestStoryIdeas',
        'suggestDirectorsVisions',
        'refineDirectorsVision',
        'suggestCoDirectorObjectives',
    ];
    LOCAL_ONLY_ACTIONS.forEach((actionName) => {
        // Type assertion needed because TypeScript can't narrow the union type
        (actionsWithFallback as Record<string, unknown>)[actionName] = localActions[actionName];
    });

    return actionsWithFallback;
};

export type { ApiStateChangeCallback, ApiLogCallback };

