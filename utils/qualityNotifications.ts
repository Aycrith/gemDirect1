/**
 * Quality Gate Notification Utilities
 * 
 * Provides standardized toast notifications for quality gates, validation results,
 * and coherence checks throughout the application.
 * 
 * @module utils/qualityNotifications
 */

import { ValidationResult, QualityScore } from '../types/validation';
import { CoherenceCheckResult } from './coherenceGate';

/**
 * Toast notification type
 */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * Toast callback type (matches App.tsx addToast signature)
 */
export type AddToastFn = (message: string, type: ToastType) => void;

/**
 * Quality gate notification options
 */
export interface QualityNotificationOptions {
    /** Context for the notification (e.g., scene title, shot number) */
    context?: string;
    /** Whether to show suggestions in the notification */
    showSuggestions?: boolean;
    /** Maximum number of suggestions to show */
    maxSuggestions?: number;
    /** Whether to show score details */
    showScoreDetails?: boolean;
}

// ============================================================================
// Validation Result Notifications
// ============================================================================

/**
 * Show toast notification for a ValidationResult
 */
export function notifyValidationResult<T>(
    addToast: AddToastFn,
    result: ValidationResult<T>,
    options: QualityNotificationOptions = {}
): void {
    const { context, showSuggestions = true, maxSuggestions = 2 } = options;
    const prefix = context ? `[${context}] ` : '';

    if (result.success) {
        // Success notification
        const qualityMsg = result.qualityScore 
            ? ` (Quality: ${Math.round(result.qualityScore.overall * 100)}%)`
            : '';
        addToast(`${prefix}${result.message || 'Validation passed'}${qualityMsg}`, 'success');
    } else {
        // Error notification
        const errorCount = result.errors?.length || 0;
        const warningCount = result.warnings?.length || 0;
        
        let message = `${prefix}${result.message || 'Validation failed'}`;
        
        // Add error/warning counts if multiple
        if (errorCount > 1) {
            message += ` (${errorCount} errors)`;
        }
        if (warningCount > 0) {
            message += ` + ${warningCount} warning(s)`;
        }

        // Add first suggestion if available
        if (showSuggestions && result.suggestions && result.suggestions.length > 0) {
            const suggestionList = result.suggestions
                .slice(0, maxSuggestions)
                .map(s => s.description)
                .join('; ');
            message += `. Try: ${suggestionList}`;
        }

        addToast(message, 'error');
    }
}

/**
 * Show toast notification for quality score threshold
 */
export function notifyQualityThreshold(
    addToast: AddToastFn,
    score: QualityScore,
    options: QualityNotificationOptions = {}
): void {
    const { context, showScoreDetails = false } = options;
    const prefix = context ? `[${context}] ` : '';
    const percentage = Math.round(score.overall * 100);
    const thresholdPercentage = Math.round(score.threshold * 100);

    if (score.passed) {
        let message = `${prefix}Quality check passed: ${percentage}%`;
        if (showScoreDetails && score.breakdown) {
            const details = Object.entries(score.breakdown)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => `${formatScoreName(k)}: ${Math.round((v as number) * 100)}%`)
                .slice(0, 3)
                .join(', ');
            message += ` (${details})`;
        }
        addToast(message, 'success');
    } else {
        addToast(
            `${prefix}Quality score ${percentage}% is below threshold (${thresholdPercentage}% required)`,
            'warning'
        );
    }
}

// ============================================================================
// Coherence Gate Notifications
// ============================================================================

/**
 * Show toast notification for coherence gate result
 */
export function notifyCoherenceGate(
    addToast: AddToastFn,
    result: CoherenceCheckResult,
    options: QualityNotificationOptions = {}
): void {
    const { context, showSuggestions = true, maxSuggestions = 2 } = options;
    const prefix = context ? `[${context}] ` : '';
    const percentage = Math.round(result.score * 100);
    const thresholdPercentage = Math.round(result.threshold * 100);

    if (result.passed) {
        addToast(`${prefix}Coherence gate passed: ${percentage}%`, 'success');
    } else {
        let message = `${prefix}Coherence gate not met: ${percentage}% (need ${thresholdPercentage}%)`;
        
        // Add suggestions if available
        if (showSuggestions && result.suggestions && result.suggestions.length > 0) {
            const suggestionList = result.suggestions
                .slice(0, maxSuggestions)
                .map(s => s.description)
                .join('; ');
            message += `. Suggestions: ${suggestionList}`;
        }

        addToast(message, 'warning');
    }
}

// ============================================================================
// Workflow Stage Notifications
// ============================================================================

/**
 * Notify when entering a workflow stage
 */
export function notifyStageEnter(
    addToast: AddToastFn,
    stageName: string,
    prerequisitesMet: boolean = true
): void {
    if (!prerequisitesMet) {
        addToast(`Cannot enter ${stageName} stage: prerequisites not met`, 'error');
        return;
    }
    // Stage transitions are typically silent, but can be enabled for verbose mode
}

/**
 * Notify when a stage gate blocks progression
 */
export function notifyStageGateBlocked(
    addToast: AddToastFn,
    currentStage: string,
    targetStage: string,
    reason: string
): void {
    addToast(`Cannot proceed to ${targetStage}: ${reason}`, 'warning');
}

/**
 * Notify when stage is completed
 */
export function notifyStageComplete(
    addToast: AddToastFn,
    stageName: string,
    nextStageName?: string
): void {
    const message = nextStageName 
        ? `${stageName} complete! Proceeding to ${nextStageName}.`
        : `${stageName} complete!`;
    addToast(message, 'success');
}

// ============================================================================
// Provider Health Notifications
// ============================================================================

/**
 * Notify provider health status change
 */
export function notifyProviderHealth(
    addToast: AddToastFn,
    providerName: string,
    isHealthy: boolean,
    details?: string
): void {
    if (isHealthy) {
        addToast(`${providerName} is ready`, 'success');
    } else {
        const message = details 
            ? `${providerName} unavailable: ${details}`
            : `${providerName} is unavailable`;
        addToast(message, 'error');
    }
}

/**
 * Notify when provider fallback is activated
 */
export function notifyProviderFallback(
    addToast: AddToastFn,
    primaryProvider: string,
    fallbackProvider: string
): void {
    addToast(
        `Switched from ${primaryProvider} to ${fallbackProvider} due to connectivity issues`,
        'info'
    );
}

// ============================================================================
// Generation Notifications
// ============================================================================

/**
 * Notify generation start
 */
export function notifyGenerationStart(
    addToast: AddToastFn,
    itemType: string,
    itemName?: string
): void {
    const name = itemName ? ` "${itemName}"` : '';
    addToast(`Generating ${itemType}${name}...`, 'info');
}

/**
 * Notify generation complete with quality score
 */
export function notifyGenerationComplete(
    addToast: AddToastFn,
    itemType: string,
    qualityScore?: number,
    itemName?: string
): void {
    const name = itemName ? ` "${itemName}"` : '';
    const quality = qualityScore !== undefined 
        ? ` (Quality: ${Math.round(qualityScore * 100)}%)`
        : '';
    addToast(`${itemType}${name} generated successfully${quality}`, 'success');
}

/**
 * Notify generation failed
 */
export function notifyGenerationFailed(
    addToast: AddToastFn,
    itemType: string,
    error: string,
    itemName?: string
): void {
    const name = itemName ? ` "${itemName}"` : '';
    addToast(`Failed to generate ${itemType}${name}: ${error}`, 'error');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format score breakdown name for display
 */
function formatScoreName(name: string): string {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

/**
 * Create a rate-limited toast function to prevent spam
 */
export function createRateLimitedToast(
    addToast: AddToastFn,
    minIntervalMs: number = 1000
): AddToastFn {
    let lastToastTime = 0;
    const pendingToasts: Array<{ message: string; type: ToastType }> = [];

    return (message: string, type: ToastType) => {
        const now = Date.now();
        if (now - lastToastTime >= minIntervalMs) {
            addToast(message, type);
            lastToastTime = now;
        } else {
            // Queue toast for later (simplified - in practice you might want a proper queue)
            pendingToasts.push({ message, type });
            setTimeout(() => {
                const pending = pendingToasts.shift();
                if (pending) {
                    addToast(pending.message, pending.type);
                }
            }, minIntervalMs);
        }
    };
}
