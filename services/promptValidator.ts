/**
 * Prompt Validator - Guardrails for ComfyUI prompt construction
 * 
 * Ensures all prompts follow standardized format:
 * - Single-frame instruction present
 * - Aspect ratio specified (16:9 or widescreen)
 * - Negative prompts include multi-panel avoidance terms
 * - Prompt lengths within reasonable bounds
 * - No duplicate phrases (e.g., director's vision repeated)
 * 
 * @module services/promptValidator
 */

import {
    ValidationResult,
    ValidationError,
    ValidationWarning,
    QualityScore,
    validationSuccess,
    validationFailure,
    createValidationError,
    createValidationWarning,
    ValidationErrorCodes,
    BatchValidationResult,
} from '../types/validation';

/**
 * @deprecated Use ValidationResult from types/validation instead
 * Kept for backward compatibility during migration
 */
export interface PromptValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    context: string;
}

/**
 * Configuration for prompt validation
 */
export interface PromptValidationConfig {
    /** Required negative prompt terms (default: ['multi-panel', 'split-screen', 'collage']) */
    requiredNegativeTerms?: string[];
    /** Minimum prompt length (default: 100) */
    minPromptLength?: number;
    /** Maximum prompt length (default: 2500) */
    maxPromptLength?: number;
    /** Minimum quality score to pass gate (default: 0.5) */
    qualityThreshold?: number;
    /** Enable quality scoring (default: false) */
    enableQualityScoring?: boolean;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: Required<PromptValidationConfig> = {
    requiredNegativeTerms: ['multi-panel', 'split-screen', 'collage'],
    minPromptLength: 100,
    maxPromptLength: 2500,
    qualityThreshold: 0.5,
    enableQualityScoring: false,
};

/**
 * Validates that a prompt adheres to required guardrails.
 * 
 * @param prompt - The positive prompt text
 * @param negativePrompt - The negative prompt text
 * @param context - Identifier for debugging (e.g., "Scene Keyframe: abc123")
 * @param config - Optional validation configuration
 * @returns Validation result with errors and warnings
 * 
 * @deprecated Use validatePromptWithResult for unified ValidationResult type
 */
export const validatePromptGuardrails = (
    prompt: string,
    negativePrompt: string,
    context: string,
    config?: PromptValidationConfig
): PromptValidationResult => {
    const result = validatePromptWithResult(prompt, negativePrompt, context, config);
    
    // Convert to legacy format for backward compatibility
    return {
        isValid: result.success,
        errors: result.errors?.map(e => e.message) || [],
        warnings: result.warnings?.map(w => w.message) || [],
        context,
    };
};

/**
 * Validates that a prompt adheres to required guardrails.
 * Returns unified ValidationResult type for consistent error handling.
 * 
 * @param prompt - The positive prompt text
 * @param negativePrompt - The negative prompt text
 * @param context - Identifier for debugging (e.g., "Scene Keyframe: abc123")
 * @param config - Optional validation configuration
 * @returns Unified ValidationResult with errors, warnings, and quality score
 */
export const validatePromptWithResult = (
    prompt: string,
    negativePrompt: string,
    context: string,
    config?: PromptValidationConfig
): ValidationResult => {
    const cfg = { ...DEFAULT_VALIDATION_CONFIG, ...config };
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // RULE 1: Single-frame instruction must be present
    // Accepts multiple phrasings: "WIDE ESTABLISHING SHOT", "EXACTLY ONE UNIFIED SCENE", "SINGLE CONTINUOUS WIDE-ANGLE SHOT", or "Single cinematic frame"
    if (!prompt.includes('WIDE ESTABLISHING SHOT') && !prompt.includes('EXACTLY ONE UNIFIED SCENE') && !prompt.includes('SINGLE CONTINUOUS WIDE-ANGLE SHOT') && !prompt.includes('Single unified cinematic frame') && !prompt.includes('Single cinematic frame')) {
        errors.push(createValidationError(
            ValidationErrorCodes.PROMPT_MISSING_SINGLE_FRAME,
            `[${context}] Missing SINGLE_FRAME_PROMPT prefix`,
            { context, fix: 'Add single-frame instruction prefix to prompt' }
        ));
    }

    // RULE 2: 16:9 aspect ratio must be specified
    if (!prompt.includes('16:9') && !prompt.includes('widescreen')) {
        errors.push(createValidationError(
            ValidationErrorCodes.PROMPT_MISSING_ASPECT_RATIO,
            `[${context}] Missing aspect ratio specification`,
            { context, fix: 'Add "16:9" or "widescreen" to prompt' }
        ));
    }

    // RULE 3: Negative prompt must include multi-panel avoidance
    const missingTerms = cfg.requiredNegativeTerms.filter(
        term => !negativePrompt.toLowerCase().includes(term.toLowerCase())
    );
    if (missingTerms.length > 0) {
        errors.push(createValidationError(
            ValidationErrorCodes.PROMPT_MISSING_NEGATIVE_TERMS,
            `[${context}] Negative prompt missing terms: ${missingTerms.join(', ')}`,
            { context, fix: `Add missing terms to negative prompt: ${missingTerms.join(', ')}` }
        ));
    }

    // RULE 4: Prompt length should be reasonable
    if (prompt.length < cfg.minPromptLength) {
        warnings.push(createValidationWarning(
            ValidationErrorCodes.PROMPT_TOO_SHORT,
            `[${context}] Prompt unusually short (${prompt.length} chars) - may lack detail`,
            { context, suggestion: `Expand prompt to at least ${cfg.minPromptLength} characters` }
        ));
    }
    if (prompt.length > cfg.maxPromptLength) {
        warnings.push(createValidationWarning(
            ValidationErrorCodes.PROMPT_TOO_LONG,
            `[${context}] Prompt very long (${prompt.length} chars) - may overwhelm model`,
            { context, suggestion: `Consider trimming prompt to under ${cfg.maxPromptLength} characters` }
        ));
    }

    // RULE 5: Check for duplicate phrases (e.g., director's vision repeated)
    const sentences = prompt
        .split(/[.!?]/)
        .map(s => s.trim())
        .filter(s => s.length > 30);
    
    const duplicates = sentences.filter((sentence, idx) => 
        sentences.indexOf(sentence) !== idx && sentences.indexOf(sentence) < idx
    );
    
    if (duplicates.length > 0) {
        warnings.push(createValidationWarning(
            ValidationErrorCodes.PROMPT_DUPLICATE_PHRASES,
            `[${context}] Duplicate phrases detected (${duplicates.length} instances) - may indicate redundant content`,
            { context, suggestion: 'Remove duplicate phrases from prompt' }
        ));
    }

    // Calculate quality score if enabled
    let qualityScore: QualityScore | undefined;
    if (cfg.enableQualityScoring) {
        qualityScore = scorePromptQuality(prompt, negativePrompt, context, cfg.qualityThreshold);
        
        if (!qualityScore.passed) {
            errors.push(createValidationError(
                ValidationErrorCodes.PROMPT_LOW_QUALITY_SCORE,
                `[${context}] Prompt quality score (${qualityScore.overall.toFixed(2)}) below threshold (${cfg.qualityThreshold})`,
                { context, fix: 'Improve prompt structure, add character references, or include temporal markers' }
            ));
        }
    }

    if (errors.length > 0) {
        return validationFailure(errors, {
            warnings: warnings.length > 0 ? warnings : undefined,
            context,
            message: `Prompt validation failed with ${errors.length} error(s)`,
        });
    }

    return {
        success: true,
        warnings: warnings.length > 0 ? warnings : undefined,
        qualityScore,
        context,
        message: 'Prompt validation passed',
        timestamp: Date.now(),
    };
};

/**
 * Validates a batch of prompts and aggregates results.
 * Useful for validating multiple shots in a timeline.
 * 
 * @param prompts - Array of { prompt, negativePrompt, context } objects
 * @param config - Optional validation configuration
 * @returns Aggregated validation results (unified format)
 */
export const validatePromptBatch = (
    prompts: Array<{ prompt: string; negativePrompt: string; context: string }>,
    config?: PromptValidationConfig
): BatchValidationResult => {
    const results = prompts.map(p => 
        validatePromptWithResult(p.prompt, p.negativePrompt, p.context, config)
    );

    const totalErrors = results.reduce((sum, r) => sum + (r.errors?.length || 0), 0);
    const totalWarnings = results.reduce((sum, r) => sum + (r.warnings?.length || 0), 0);
    
    // Calculate average quality score if available
    const scoresWithQuality = results.filter(r => r.qualityScore);
    const averageQualityScore = scoresWithQuality.length > 0
        ? scoresWithQuality.reduce((sum, r) => sum + (r.qualityScore?.overall || 0), 0) / scoresWithQuality.length
        : undefined;

    return {
        allValid: results.every(r => r.success),
        totalErrors,
        totalWarnings,
        results,
        averageQualityScore,
    };
};

/**
 * @deprecated Use validatePromptBatch with unified results instead
 * Kept for backward compatibility
 */
export const validatePromptBatchLegacy = (
    prompts: Array<{ prompt: string; negativePrompt: string; context: string }>
): {
    allValid: boolean;
    totalErrors: number;
    totalWarnings: number;
    results: PromptValidationResult[];
} => {
    const results = prompts.map(p => 
        validatePromptGuardrails(p.prompt, p.negativePrompt, p.context)
    );

    return {
        allValid: results.every(r => r.isValid),
        totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
        totalWarnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
        results,
    };
};

/**
 * Calculate prompt quality score based on structural analysis
 * 
 * Evaluates:
 * - Structural completeness (single-frame, aspect ratio, negative terms)
 * - Character reference density (names, descriptions in prompt)
 * - Temporal markers (time-related words for continuity)
 * - Visual specificity (concrete visual descriptors)
 * - Narrative clarity (action verbs, scene context)
 * 
 * @param prompt - The positive prompt text
 * @param negativePrompt - The negative prompt text
 * @param context - Identifier for debugging
 * @param threshold - Minimum score to pass (default: 0.5)
 * @returns Quality score with breakdown
 */
export const scorePromptQuality = (
    prompt: string,
    negativePrompt: string,
    context: string,
    threshold: number = 0.5
): QualityScore => {
    const breakdown = {
        structuralCompleteness: 0,
        characterReferenceDensity: 0,
        temporalMarkers: 0,
        visualSpecificity: 0,
        narrativeClarity: 0,
    };

    // 1. Structural completeness (0-1)
    let structuralScore = 0;
    if (prompt.includes('WIDE ESTABLISHING SHOT') || prompt.includes('EXACTLY ONE UNIFIED SCENE') || 
        prompt.includes('SINGLE CONTINUOUS WIDE-ANGLE SHOT') || prompt.includes('Single cinematic frame')) {
        structuralScore += 0.4;
    }
    if (prompt.includes('16:9') || prompt.includes('widescreen')) {
        structuralScore += 0.3;
    }
    const hasRequiredNegatives = ['multi-panel', 'split-screen', 'collage'].every(
        term => negativePrompt.toLowerCase().includes(term.toLowerCase())
    );
    if (hasRequiredNegatives) {
        structuralScore += 0.3;
    }
    breakdown.structuralCompleteness = structuralScore;

    // 2. Character reference density (0-1)
    // Look for character-related patterns: names (capitalized words), "character", "protagonist", etc.
    const characterPatterns = [
        /\b[A-Z][a-z]+\b/g,  // Capitalized names
        /protagonist|antagonist|character|hero|villain/gi,
        /wearing|dressed in|hair|eyes|face/gi,
    ];
    const characterMatches = characterPatterns.reduce((count, pattern) => {
        const matches = prompt.match(pattern);
        return count + (matches ? matches.length : 0);
    }, 0);
    breakdown.characterReferenceDensity = Math.min(1, characterMatches / 10);

    // 3. Temporal markers (0-1)
    // Look for time-related words that help with continuity
    const temporalPatterns = [
        /\b(moment|instant|during|while|as|when|suddenly|gradually|slowly|quickly)\b/gi,
        /\b(beginning|middle|end|start|finish|continues|continues to)\b/gi,
        /\b(before|after|then|next|following|previous)\b/gi,
    ];
    const temporalMatches = temporalPatterns.reduce((count, pattern) => {
        const matches = prompt.match(pattern);
        return count + (matches ? matches.length : 0);
    }, 0);
    breakdown.temporalMarkers = Math.min(1, temporalMatches / 5);

    // 4. Visual specificity (0-1)
    // Look for concrete visual descriptors
    const visualPatterns = [
        /\b(color|light|shadow|texture|material)\b/gi,
        /\b(close-up|wide shot|medium shot|establishing|pan|zoom)\b/gi,
        /\b(dramatic|cinematic|atmospheric|moody|bright|dark|vivid)\b/gi,
        /\b(foreground|background|depth|composition|frame)\b/gi,
    ];
    const visualMatches = visualPatterns.reduce((count, pattern) => {
        const matches = prompt.match(pattern);
        return count + (matches ? matches.length : 0);
    }, 0);
    breakdown.visualSpecificity = Math.min(1, visualMatches / 8);

    // 5. Narrative clarity (0-1)
    // Look for action verbs and scene context
    const narrativePatterns = [
        /\b(walking|running|standing|sitting|looking|watching|moving)\b/gi,
        /\b(scene|setting|location|environment|atmosphere)\b/gi,
        /\b(emotion|feeling|tension|conflict|resolution)\b/gi,
    ];
    const narrativeMatches = narrativePatterns.reduce((count, pattern) => {
        const matches = prompt.match(pattern);
        return count + (matches ? matches.length : 0);
    }, 0);
    breakdown.narrativeClarity = Math.min(1, narrativeMatches / 6);

    // Calculate overall score (weighted average)
    const weights = {
        structuralCompleteness: 0.3,    // Most important for guardrails
        characterReferenceDensity: 0.2,
        temporalMarkers: 0.15,
        visualSpecificity: 0.2,
        narrativeClarity: 0.15,
    };

    const overall = 
        breakdown.structuralCompleteness * weights.structuralCompleteness +
        breakdown.characterReferenceDensity * weights.characterReferenceDensity +
        breakdown.temporalMarkers * weights.temporalMarkers +
        breakdown.visualSpecificity * weights.visualSpecificity +
        breakdown.narrativeClarity * weights.narrativeClarity;

    return {
        overall,
        breakdown,
        threshold,
        passed: overall >= threshold,
    };
};

/**
 * Validate prompt and get detailed quality analysis
 * Combines guardrail validation with quality scoring
 * 
 * @param prompt - The positive prompt text
 * @param negativePrompt - The negative prompt text
 * @param context - Identifier for debugging
 * @param config - Optional validation configuration
 * @returns Full validation result with quality score
 */
export const validateAndScorePrompt = (
    prompt: string,
    negativePrompt: string,
    context: string,
    config?: PromptValidationConfig
): ValidationResult => {
    return validatePromptWithResult(prompt, negativePrompt, context, {
        ...config,
        enableQualityScoring: true,
    });
};
