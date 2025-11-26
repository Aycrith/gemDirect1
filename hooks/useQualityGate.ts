/**
 * Quality Gate Hook
 * 
 * Provides quality gate checks for generation operations.
 * When promptQualityGate flag is enabled, blocks generation for low-quality inputs.
 * 
 * @module hooks/useQualityGate
 */

import { useCallback, useState } from 'react';
import { LocalGenerationSettings } from '../types';
import { isFeatureEnabled } from '../utils/featureFlags';
import {
    ValidationResult,
    QualityScore,
    validationSuccess,
    validationFailure,
    createValidationError,
    createValidationWarning,
    ValidationErrorCodes,
} from '../types/validation';
import { notifyQualityThreshold, AddToastFn } from '../utils/qualityNotifications';

/**
 * Quality gate check options
 */
export interface QualityGateOptions {
    /** Minimum quality score threshold (0-1). Default: 0.6 */
    minQualityScore?: number;
    /** Whether to block generation on low quality (default: true when gate enabled) */
    blockOnLowQuality?: boolean;
    /** Toast function for notifications */
    addToast?: AddToastFn;
    /** Context for notifications (e.g., scene title) */
    context?: string;
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
    /** Whether generation should proceed */
    allowed: boolean;
    /** Quality score details */
    qualityScore: QualityScore;
    /** Validation result with details */
    validation: ValidationResult<QualityScore>;
    /** Whether gate was bypassed (flag disabled) */
    bypassed: boolean;
}

/**
 * Default quality thresholds
 */
const DEFAULT_MIN_QUALITY_SCORE = 0.6;

/**
 * Calculate quality score for a prompt
 * 
 * @param prompt - The prompt text to evaluate
 * @returns Quality score breakdown
 */
function calculatePromptQuality(prompt: string): QualityScore {
    if (!prompt || prompt.trim().length === 0) {
        return {
            overall: 0,
            threshold: DEFAULT_MIN_QUALITY_SCORE,
            passed: false,
            breakdown: {
                structuralCompleteness: 0,
                visualSpecificity: 0,
                narrativeClarity: 0,
            },
        };
    }

    const trimmed = prompt.trim();
    const words = trimmed.split(/\s+/).length;
    const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

    // Score calculations (0-1 each)
    
    // Structural completeness: good length, multiple sentences
    const structuralCompleteness = Math.min(1, (words / 50) * 0.5 + (sentences / 3) * 0.5);
    
    // Visual specificity: contains visual/descriptive terms
    const visualTerms = /\b(color|light|dark|bright|shadow|texture|scene|frame|shot|camera|wide|close|medium|angle|perspective|background|foreground|cinematic|dramatic|soft|harsh|warm|cool|vivid|muted|golden|silver|crimson|azure|emerald)/gi;
    const visualMatches = (trimmed.match(visualTerms) || []).length;
    const visualSpecificity = Math.min(1, visualMatches / 5);
    
    // Narrative clarity: describes action or state
    const narrativeTerms = /\b(is|are|was|were|has|have|stands|sits|walks|runs|looks|faces|holds|wears|shows|reveals|depicts|captures|features|displays|surrounded|framed|positioned|illuminated|bathed)/gi;
    const narrativeMatches = (trimmed.match(narrativeTerms) || []).length;
    const narrativeClarity = Math.min(1, narrativeMatches / 3);

    // Character reference density (bonus)
    const characterTerms = /\b(person|man|woman|character|figure|protagonist|hero|heroine|face|eyes|expression|stance|posture|gesture)/gi;
    const characterMatches = (trimmed.match(characterTerms) || []).length;
    const characterReferenceDensity = Math.min(1, characterMatches / 2);

    // Temporal markers (bonus for video-relevant prompts)
    const temporalTerms = /\b(moment|instant|beginning|ending|transition|movement|motion|action|still|frozen|dynamic|static)/gi;
    const temporalMatches = (trimmed.match(temporalTerms) || []).length;
    const temporalMarkers = Math.min(1, temporalMatches / 2);

    // Weighted overall score
    const overall = 
        structuralCompleteness * 0.25 +
        visualSpecificity * 0.3 +
        narrativeClarity * 0.25 +
        characterReferenceDensity * 0.1 +
        temporalMarkers * 0.1;

    return {
        overall,
        threshold: DEFAULT_MIN_QUALITY_SCORE,
        passed: overall >= DEFAULT_MIN_QUALITY_SCORE,
        breakdown: {
            structuralCompleteness,
            visualSpecificity,
            narrativeClarity,
            characterReferenceDensity,
            temporalMarkers,
        },
    };
}

/**
 * Hook for quality gate checks before generation
 * 
 * @param settings - Local generation settings containing feature flags
 * @returns Quality gate functions and state
 * 
 * @example
 * ```tsx
 * const { checkQuality, lastResult, isChecking } = useQualityGate(settings);
 * 
 * const handleGenerate = async () => {
 *   const result = await checkQuality(prompt, { addToast, context: 'Scene 1' });
 *   if (!result.allowed) {
 *     return; // Generation blocked by quality gate
 *   }
 *   // Proceed with generation...
 * };
 * ```
 */
export function useQualityGate(settings: LocalGenerationSettings | null) {
    const [lastResult, setLastResult] = useState<QualityGateResult | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    const isGateEnabled = isFeatureEnabled(settings?.featureFlags, 'promptQualityGate');

    /**
     * Check quality gate for a prompt
     */
    const checkQuality = useCallback(async (
        prompt: string,
        options: QualityGateOptions = {}
    ): Promise<QualityGateResult> => {
        const {
            minQualityScore = DEFAULT_MIN_QUALITY_SCORE,
            blockOnLowQuality = true,
            addToast,
            context,
        } = options;

        setIsChecking(true);

        try {
            // If gate is disabled, bypass with success
            if (!isGateEnabled) {
                const qualityScore = calculatePromptQuality(prompt);
                const result: QualityGateResult = {
                    allowed: true,
                    qualityScore,
                    validation: validationSuccess(qualityScore, 'Quality gate bypassed (feature disabled)'),
                    bypassed: true,
                };
                setLastResult(result);
                return result;
            }

            // Calculate quality score
            const qualityScore = calculatePromptQuality(prompt);
            
            // Update threshold from options
            qualityScore.threshold = minQualityScore;
            qualityScore.passed = qualityScore.overall >= minQualityScore;

            // Build validation result
            let validation: ValidationResult<QualityScore>;
            let allowed: boolean;

            if (qualityScore.passed) {
                validation = validationSuccess(qualityScore, 'Quality check passed');
                allowed = true;
            } else {
                const errors = [
                    createValidationError(
                        ValidationErrorCodes.PROMPT_LOW_QUALITY_SCORE,
                        `Quality score ${Math.round(qualityScore.overall * 100)}% is below threshold ${Math.round(minQualityScore * 100)}%`,
                        {
                            context: context || 'Prompt Quality',
                            fix: 'Add more visual details, descriptive terms, and character references',
                        }
                    ),
                ];

                const warnings = [];
                if (qualityScore.breakdown) {
                    if ((qualityScore.breakdown.visualSpecificity || 0) < 0.3) {
                        warnings.push(createValidationWarning(
                            'LOW_VISUAL_SPECIFICITY',
                            'Low visual specificity. Add more color, lighting, or framing details.'
                        ));
                    }
                    if ((qualityScore.breakdown.narrativeClarity || 0) < 0.3) {
                        warnings.push(createValidationWarning(
                            'LOW_NARRATIVE_CLARITY',
                            'Low narrative clarity. Describe the action or state more clearly.'
                        ));
                    }
                }

                validation = validationFailure<QualityScore>(errors, {
                    warnings: warnings.length > 0 ? warnings : undefined,
                    message: `Quality too low: ${Math.round(qualityScore.overall * 100)}% < ${Math.round(minQualityScore * 100)}%`,
                    data: qualityScore,
                });

                // Allow but warn if blockOnLowQuality is false
                allowed = !blockOnLowQuality;
            }

            // Show notification if addToast provided
            if (addToast) {
                if (!qualityScore.passed) {
                    notifyQualityThreshold(addToast, qualityScore, { context, showScoreDetails: true });
                }
            }

            const result: QualityGateResult = {
                allowed,
                qualityScore,
                validation,
                bypassed: false,
            };

            setLastResult(result);
            return result;

        } finally {
            setIsChecking(false);
        }
    }, [isGateEnabled]);

    /**
     * Check if quality gate is enabled
     */
    const isEnabled = useCallback(() => isGateEnabled, [isGateEnabled]);

    return {
        /** Check quality gate for a prompt */
        checkQuality,
        /** Last quality check result */
        lastResult,
        /** Whether a quality check is in progress */
        isChecking,
        /** Whether quality gate feature is enabled */
        isEnabled,
        /** Directly check if gate is enabled */
        gateEnabled: isGateEnabled,
    };
}

/**
 * Standalone quality check function (non-hook)
 * Useful for one-off validation without React state
 * 
 * @param prompt - The prompt to check
 * @param minQualityScore - Minimum quality threshold (default: 0.6)
 * @returns Quality score result
 */
export function checkPromptQuality(
    prompt: string,
    minQualityScore: number = DEFAULT_MIN_QUALITY_SCORE
): QualityScore {
    const score = calculatePromptQuality(prompt);
    score.threshold = minQualityScore;
    score.passed = score.overall >= minQualityScore;
    return score;
}

/**
 * Validate prompt quality and return ValidationResult
 * 
 * @param prompt - The prompt to validate
 * @param options - Validation options
 * @returns ValidationResult with quality score
 */
export function validatePromptQuality(
    prompt: string,
    options: {
        minQualityScore?: number;
        context?: string;
    } = {}
): ValidationResult<QualityScore> {
    const { minQualityScore = DEFAULT_MIN_QUALITY_SCORE, context } = options;
    const qualityScore = checkPromptQuality(prompt, minQualityScore);

    if (qualityScore.passed) {
        return validationSuccess(qualityScore, `Quality check passed: ${Math.round(qualityScore.overall * 100)}%`);
    }

    return validationFailure<QualityScore>([
        createValidationError(
            ValidationErrorCodes.PROMPT_LOW_QUALITY_SCORE,
            `Quality score ${Math.round(qualityScore.overall * 100)}% is below threshold ${Math.round(minQualityScore * 100)}%`,
            {
                context,
                fix: 'Enhance prompt with more visual details, specific actions, and character descriptions',
            }
        ),
    ], {
        message: `Quality too low: ${Math.round(qualityScore.overall * 100)}%`,
        data: qualityScore,
    });
}
