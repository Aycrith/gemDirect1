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

export interface PromptValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    context: string;
}

/**
 * Validates that a prompt adheres to required guardrails.
 * 
 * @param prompt - The positive prompt text
 * @param negativePrompt - The negative prompt text
 * @param context - Identifier for debugging (e.g., "Scene Keyframe: abc123")
 * @returns Validation result with errors and warnings
 */
export const validatePromptGuardrails = (
    prompt: string,
    negativePrompt: string,
    context: string
): PromptValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // RULE 1: Single-frame instruction must be present
    // Accepts multiple phrasings: "WIDE ESTABLISHING SHOT", "EXACTLY ONE UNIFIED SCENE", "SINGLE CONTINUOUS WIDE-ANGLE SHOT", or "Single cinematic frame"
    if (!prompt.includes('WIDE ESTABLISHING SHOT') && !prompt.includes('EXACTLY ONE UNIFIED SCENE') && !prompt.includes('SINGLE CONTINUOUS WIDE-ANGLE SHOT') && !prompt.includes('Single unified cinematic frame') && !prompt.includes('Single cinematic frame')) {
        errors.push(`[${context}] Missing SINGLE_FRAME_PROMPT prefix`);
    }

    // RULE 2: 16:9 aspect ratio must be specified
    if (!prompt.includes('16:9') && !prompt.includes('widescreen')) {
        errors.push(`[${context}] Missing aspect ratio specification`);
    }

    // RULE 3: Negative prompt must include multi-panel avoidance
    const requiredNegativeTerms = ['multi-panel', 'split-screen', 'collage'];
    const missingTerms = requiredNegativeTerms.filter(
        term => !negativePrompt.toLowerCase().includes(term.toLowerCase())
    );
    if (missingTerms.length > 0) {
        errors.push(`[${context}] Negative prompt missing terms: ${missingTerms.join(', ')}`);
    }

    // RULE 4: Prompt length should be reasonable (100-2500 chars)
    if (prompt.length < 100) {
        warnings.push(
            `[${context}] Prompt unusually short (${prompt.length} chars) - may lack detail`
        );
    }
    if (prompt.length > 2500) {
        warnings.push(
            `[${context}] Prompt very long (${prompt.length} chars) - may overwhelm model`
        );
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
        warnings.push(
            `[${context}] Duplicate phrases detected (${duplicates.length} instances) - may indicate redundant content`
        );
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        context
    };
};

/**
 * Validates a batch of prompts and aggregates results.
 * Useful for validating multiple shots in a timeline.
 * 
 * @param prompts - Array of { prompt, negativePrompt, context } objects
 * @returns Aggregated validation results
 */
export const validatePromptBatch = (
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
        results
    };
};
