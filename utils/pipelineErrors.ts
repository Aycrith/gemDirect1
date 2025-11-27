/**
 * Pipeline Error Handling
 * 
 * Provides error classification and handling for the prompt engineering pipeline.
 * Implements recoverable vs non-recoverable error patterns with flag-gated behavior.
 * 
 * @module utils/pipelineErrors
 */

import { FeatureFlags, getFeatureFlagValue } from './featureFlags';

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Categories of pipeline errors.
 */
export type PipelineErrorCategory =
    | 'token_overflow'      // Prompt exceeds token budget
    | 'validation_failed'   // Scene/shot validation failed
    | 'api_timeout'         // External API call timed out
    | 'api_rate_limit'      // Rate limit exceeded (429)
    | 'api_quota'           // Quota exhausted
    | 'api_unavailable'     // Service unavailable (503)
    | 'invalid_response'    // Unexpected API response format
    | 'workflow_invalid'    // ComfyUI workflow validation failed
    | 'mapping_missing'     // Required workflow mapping missing
    | 'image_upload_failed' // Failed to upload image to ComfyUI
    | 'generation_blocked'  // Generation blocked by content filter
    | 'unknown';            // Uncategorized error

/**
 * Whether an error is potentially recoverable through retry or user action.
 */
export type RecoveryType = 
    | 'retry'       // Can be retried automatically (rate limit, timeout)
    | 'user_action' // Requires user action (shorten prompt, fix mapping)
    | 'fatal';      // Cannot be recovered (quota exhausted, invalid config)

/**
 * Structured pipeline error with classification.
 */
export class PipelineError extends Error {
    public readonly category: PipelineErrorCategory;
    public readonly recovery: RecoveryType;
    public readonly details?: Record<string, unknown>;
    public readonly timestamp: number;
    
    constructor(
        message: string,
        category: PipelineErrorCategory,
        recovery: RecoveryType,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'PipelineError';
        this.category = category;
        this.recovery = recovery;
        this.details = details;
        this.timestamp = Date.now();
    }
    
    /**
     * Whether this error can be automatically retried.
     */
    get isRetryable(): boolean {
        return this.recovery === 'retry';
    }
    
    /**
     * Whether user action is required to resolve.
     */
    get requiresUserAction(): boolean {
        return this.recovery === 'user_action';
    }
    
    /**
     * Whether this error is fatal (cannot be recovered).
     */
    get isFatal(): boolean {
        return this.recovery === 'fatal';
    }
    
    /**
     * Serializes the error for logging/storage.
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            category: this.category,
            recovery: this.recovery,
            details: this.details,
            timestamp: this.timestamp,
        };
    }
}

// ============================================================================
// Error Classification Functions
// ============================================================================

/**
 * Classifies an error message into a PipelineErrorCategory.
 */
export function classifyError(error: Error | string): PipelineErrorCategory {
    const message = typeof error === 'string' ? error : error.message;
    const lowerMessage = message.toLowerCase();
    
    // Token/budget errors
    if (lowerMessage.includes('token') && (lowerMessage.includes('exceed') || lowerMessage.includes('overflow'))) {
        return 'token_overflow';
    }
    
    // API rate limiting
    if (lowerMessage.includes('429') || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
        return 'api_rate_limit';
    }
    
    // API quota
    if (lowerMessage.includes('quota') || lowerMessage.includes('resource_exhausted')) {
        return 'api_quota';
    }
    
    // Timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out') || lowerMessage.includes('etimedout')) {
        return 'api_timeout';
    }
    
    // Service unavailable
    if (lowerMessage.includes('503') || lowerMessage.includes('service unavailable') || lowerMessage.includes('econnrefused')) {
        return 'api_unavailable';
    }
    
    // Validation errors
    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') && lowerMessage.includes('scene')) {
        return 'validation_failed';
    }
    
    // Workflow/mapping errors
    if (lowerMessage.includes('workflow') && (lowerMessage.includes('invalid') || lowerMessage.includes('json'))) {
        return 'workflow_invalid';
    }
    if (lowerMessage.includes('mapping') && lowerMessage.includes('missing')) {
        return 'mapping_missing';
    }
    
    // Upload errors
    if (lowerMessage.includes('upload') && lowerMessage.includes('fail')) {
        return 'image_upload_failed';
    }
    
    // Content filter
    if (lowerMessage.includes('safety') || lowerMessage.includes('filter') || lowerMessage.includes('blocked')) {
        return 'generation_blocked';
    }
    
    // Invalid response
    if (lowerMessage.includes('unexpected') || lowerMessage.includes('parse') || lowerMessage.includes('json')) {
        return 'invalid_response';
    }
    
    return 'unknown';
}

/**
 * Determines recovery type for an error category.
 */
export function getRecoveryType(category: PipelineErrorCategory): RecoveryType {
    switch (category) {
        // Retryable errors
        case 'api_timeout':
        case 'api_rate_limit':
        case 'api_unavailable':
            return 'retry';
        
        // Requires user action
        case 'token_overflow':
        case 'validation_failed':
        case 'workflow_invalid':
        case 'mapping_missing':
        case 'image_upload_failed':
        case 'generation_blocked':
            return 'user_action';
        
        // Fatal errors
        case 'api_quota':
            return 'fatal';
        
        // Unknown defaults to user action
        case 'invalid_response':
        case 'unknown':
        default:
            return 'user_action';
    }
}

/**
 * Creates a PipelineError from a generic error.
 */
export function toPipelineError(
    error: Error | string,
    additionalDetails?: Record<string, unknown>
): PipelineError {
    const message = typeof error === 'string' ? error : error.message;
    const category = classifyError(error);
    const recovery = getRecoveryType(category);
    
    return new PipelineError(message, category, recovery, {
        originalError: typeof error === 'string' ? undefined : error.name,
        ...additionalDetails,
    });
}

// ============================================================================
// Flag-Gated Error Handling
// ============================================================================

/**
 * Result of flag-gated error handling.
 */
export interface ErrorHandlingResult {
    /** Whether the operation should continue */
    shouldContinue: boolean;
    /** Whether an error was logged as warning */
    wasWarning: boolean;
    /** The pipeline error (if created) */
    error?: PipelineError;
    /** User-facing message */
    userMessage: string;
}

/**
 * Handles a token overflow error based on promptTokenGuard flag.
 * 
 * @param tokens - Actual token count
 * @param budget - Token budget limit
 * @param flags - Feature flags
 * @returns Handling result with continuation decision
 */
export function handleTokenOverflow(
    tokens: number,
    budget: number,
    flags: Partial<FeatureFlags>
): ErrorHandlingResult {
    const mode = getFeatureFlagValue(flags as FeatureFlags, 'promptTokenGuard');
    const message = `Token budget exceeded: ${tokens}/${budget} tokens`;
    
    if (mode === 'off' || mode === false) {
        return {
            shouldContinue: true,
            wasWarning: false,
            userMessage: '',
        };
    }
    
    const error = new PipelineError(message, 'token_overflow', 'user_action', { tokens, budget });
    
    if (mode === 'warn') {
        console.warn(`[TokenGuard] ${message}`);
        return {
            shouldContinue: true,
            wasWarning: true,
            error,
            userMessage: `Warning: ${message}. Consider shortening your prompt.`,
        };
    }
    
    // mode === 'block'
    return {
        shouldContinue: false,
        wasWarning: false,
        error,
        userMessage: `Generation blocked: ${message}. Please shorten your prompt.`,
    };
}

/**
 * Handles a validation error based on sceneListValidationMode flag.
 * 
 * @param validationErrors - Array of validation error messages
 * @param flags - Feature flags
 * @returns Handling result with continuation decision
 */
export function handleValidationError(
    validationErrors: string[],
    flags: Partial<FeatureFlags>
): ErrorHandlingResult {
    const mode = getFeatureFlagValue(flags as FeatureFlags, 'sceneListValidationMode');
    const message = `Validation failed: ${validationErrors.join('; ')}`;
    
    if (mode === 'off' || mode === false) {
        return {
            shouldContinue: true,
            wasWarning: false,
            userMessage: '',
        };
    }
    
    const error = new PipelineError(message, 'validation_failed', 'user_action', { errors: validationErrors });
    
    if (mode === 'warn') {
        console.warn(`[Validation] ${message}`);
        return {
            shouldContinue: true,
            wasWarning: true,
            error,
            userMessage: `Warning: ${message}`,
        };
    }
    
    // mode === 'block'
    return {
        shouldContinue: false,
        wasWarning: false,
        error,
        userMessage: `Generation blocked: ${message}`,
    };
}

// ============================================================================
// User-Facing Error Messages
// ============================================================================

/**
 * Gets a user-friendly message for an error category.
 */
export function getUserFriendlyMessage(category: PipelineErrorCategory): string {
    switch (category) {
        case 'token_overflow':
            return 'Your prompt is too long. Try shortening your scene description or removing some details.';
        case 'validation_failed':
            return 'The scene validation found issues. Please review and simplify your scene descriptions.';
        case 'api_timeout':
            return 'The request timed out. Please try again in a moment.';
        case 'api_rate_limit':
            return 'Too many requests. Please wait a few seconds and try again.';
        case 'api_quota':
            return 'API quota exceeded. Please check your billing or wait until the quota resets.';
        case 'api_unavailable':
            return 'The server is currently unavailable. Please try again later.';
        case 'invalid_response':
            return 'Received an unexpected response. Please try again.';
        case 'workflow_invalid':
            return 'The workflow configuration is invalid. Please check your ComfyUI workflow settings.';
        case 'mapping_missing':
            return 'Required workflow mappings are missing. Please configure your workflow profile.';
        case 'image_upload_failed':
            return 'Failed to upload the keyframe image. Please check your ComfyUI connection.';
        case 'generation_blocked':
            return 'Content was blocked by safety filters. Please modify your prompt and try again.';
        case 'unknown':
        default:
            return 'An unexpected error occurred. Please try again or check the console for details.';
    }
}

/**
 * Gets recovery instructions for an error category.
 */
export function getRecoveryInstructions(category: PipelineErrorCategory): string[] {
    switch (category) {
        case 'token_overflow':
            return [
                'Shorten your scene description',
                'Remove detailed character descriptions',
                'Split complex scenes into multiple simpler ones',
            ];
        case 'validation_failed':
            return [
                'Simplify scene summaries to under 200 characters',
                'Reduce the number of action verbs per scene',
                'Ensure character names are mentioned',
            ];
        case 'api_rate_limit':
        case 'api_timeout':
            return [
                'Wait a few seconds before retrying',
                'Reduce the number of concurrent operations',
            ];
        case 'api_quota':
            return [
                'Check your API billing status',
                'Wait for the daily quota to reset',
                'Consider upgrading your API plan',
            ];
        case 'workflow_invalid':
        case 'mapping_missing':
            return [
                'Re-sync your workflow from ComfyUI',
                'Check that all required nodes are present',
                'Verify the workflow profile mappings',
            ];
        case 'generation_blocked':
            return [
                'Remove potentially sensitive content from your prompt',
                'Use more neutral language',
                'Avoid descriptions of violence or controversial topics',
            ];
        default:
            return ['Try again', 'Check the browser console for more details'];
    }
}
