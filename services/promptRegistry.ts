/**
 * Prompt Registry - Centralized prompt template management with token budgets
 * 
 * Provides:
 * - Token estimation (4 chars/token rule)
 * - Smart truncation at sentence boundaries
 * - Token budget validation for all prompt phases
 * - Character prompt configuration for ControlNet/VAE workflows
 * 
 * @module services/promptRegistry
 */

// ============================================================================
// Token Budget Configuration
// ============================================================================

/**
 * Token budgets for each prompt phase.
 * Based on 4 chars/token estimation for LLM compatibility.
 */
export interface PromptTokenBudget {
    /** Story logline: 50-100 words, max 500 tokens (~2000 chars) */
    logline: number;
    /** Each character profile: max 400 tokens (~1600 chars) */
    characterProfile: number;
    /** Setting description: 200-300 words, max 600 tokens (~2400 chars) */
    setting: number;
    /** Each plot scene: max 200 tokens (~800 chars) */
    plotScene: number;
    /** ComfyUI shot prompt: max 500 tokens (~2000 chars) */
    comfyuiShot: number;
    /** Plot outline total: max 800 tokens (~3200 chars) */
    plotOutline: number;
    /** Scene keyframe positive prompt: max 600 tokens (~2400 chars) */
    sceneKeyframe: number;
}

/**
 * Default token budgets enforced across the pipeline
 */
export const DEFAULT_TOKEN_BUDGETS: PromptTokenBudget = {
    logline: 500,
    characterProfile: 400,
    setting: 600,
    plotScene: 200,
    comfyuiShot: 500,
    plotOutline: 800,
    sceneKeyframe: 600,
};

/**
 * Prompt section types for validation
 */
export type PromptSection = keyof PromptTokenBudget;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimates token count for a text string.
 * Uses 4 chars/token rule for broad LLM compatibility.
 * 
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
    if (!text || typeof text !== 'string') {
        return 0;
    }
    // 4 chars per token is a conservative estimate that works across models
    return Math.ceil(text.length / 4);
}

/**
 * Converts token count to approximate character count
 * @param tokens - Number of tokens
 * @returns Approximate character count
 */
export function tokensToChars(tokens: number): number {
    return tokens * 4;
}

/**
 * Converts character count to approximate token count
 * @param chars - Number of characters
 * @returns Approximate token count
 */
export function charsToTokens(chars: number): number {
    return Math.ceil(chars / 4);
}

// ============================================================================
// Smart Truncation
// ============================================================================

/**
 * Sentence-ending patterns for smart truncation
 */
const SENTENCE_ENDINGS = /[.!?]\s+/g;

/**
 * Truncates text to fit within a token limit while preserving sentence boundaries.
 * 
 * @param text - Text to truncate
 * @param maxTokens - Maximum token count
 * @param preserveEnd - If true, preserves end of text instead of beginning
 * @returns Truncated text with ellipsis if truncation occurred
 */
export function truncateToTokenLimit(
    text: string,
    maxTokens: number,
    preserveEnd: boolean = false
): { text: string; truncated: boolean; originalTokens: number; finalTokens: number } {
    if (!text || typeof text !== 'string') {
        return { text: '', truncated: false, originalTokens: 0, finalTokens: 0 };
    }

    const originalTokens = estimateTokens(text);
    const maxChars = tokensToChars(maxTokens);

    if (text.length <= maxChars) {
        return { text, truncated: false, originalTokens, finalTokens: originalTokens };
    }

    // Find sentence boundaries
    const sentences: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    
    // Reset regex state
    SENTENCE_ENDINGS.lastIndex = 0;
    
    while ((match = SENTENCE_ENDINGS.exec(text)) !== null) {
        sentences.push(text.slice(lastIndex, match.index + 1));
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text as final sentence
    if (lastIndex < text.length) {
        sentences.push(text.slice(lastIndex));
    }

    if (sentences.length === 0) {
        // No sentence boundaries found, do hard truncation
        const truncated = preserveEnd
            ? '...' + text.slice(-maxChars + 3)
            : text.slice(0, maxChars - 3) + '...';
        return {
            text: truncated,
            truncated: true,
            originalTokens,
            finalTokens: estimateTokens(truncated),
        };
    }

    // Build result by adding sentences until we exceed limit
    let result = '';
    
    if (preserveEnd) {
        // Work backwards from end
        for (let i = sentences.length - 1; i >= 0; i--) {
            const candidate = sentences.slice(i).join('');
            if (candidate.length <= maxChars - 3) {
                result = candidate;
            } else {
                break;
            }
        }
        if (result.length > 0 && result !== text) {
            result = '...' + result;
        }
    } else {
        // Work forwards from beginning
        for (let i = 0; i < sentences.length; i++) {
            const candidate = sentences.slice(0, i + 1).join('');
            if (candidate.length <= maxChars - 3) {
                result = candidate;
            } else {
                break;
            }
        }
        if (result.length > 0 && result !== text) {
            result = result + '...';
        }
    }

    // Fallback to hard truncation if no sentences fit
    if (result.length === 0) {
        result = preserveEnd
            ? '...' + text.slice(-maxChars + 3)
            : text.slice(0, maxChars - 3) + '...';
    }

    return {
        text: result,
        truncated: true,
        originalTokens,
        finalTokens: estimateTokens(result),
    };
}

// ============================================================================
// Token Budget Validation
// ============================================================================

/**
 * Result of token budget validation
 */
export interface TokenBudgetValidation {
    /** Whether the text is within budget */
    valid: boolean;
    /** Estimated token count */
    tokens: number;
    /** Token budget for this section */
    budget: number;
    /** Overflow amount (0 if within budget) */
    overflow: number;
    /** Percentage of budget used */
    percentUsed: number;
    /** Warning if approaching limit (>80%) */
    warning?: string;
}

/**
 * Validates text against the token budget for a given section.
 * 
 * @param section - The prompt section type
 * @param text - Text to validate
 * @param customBudgets - Optional custom budgets to override defaults
 * @returns Validation result with token counts and warnings
 */
export function validateTokenBudget(
    section: PromptSection,
    text: string,
    customBudgets?: Partial<PromptTokenBudget>
): TokenBudgetValidation {
    const budgets = { ...DEFAULT_TOKEN_BUDGETS, ...customBudgets };
    const budget = budgets[section];
    const tokens = estimateTokens(text);
    const overflow = Math.max(0, tokens - budget);
    const percentUsed = budget > 0 ? (tokens / budget) * 100 : 0;
    const valid = tokens <= budget;

    let warning: string | undefined;
    if (percentUsed >= 80 && percentUsed < 100) {
        warning = `${section} is at ${percentUsed.toFixed(0)}% of token budget (${tokens}/${budget})`;
    } else if (!valid) {
        warning = `${section} exceeds token budget by ${overflow} tokens (${tokens}/${budget})`;
    }

    return {
        valid,
        tokens,
        budget,
        overflow,
        percentUsed,
        warning,
    };
}

/**
 * Validates multiple sections at once and returns aggregate result
 */
export function validateTokenBudgets(
    sections: Array<{ section: PromptSection; text: string }>,
    customBudgets?: Partial<PromptTokenBudget>
): {
    allValid: boolean;
    results: Record<string, TokenBudgetValidation>;
    totalTokens: number;
    warnings: string[];
    errors: string[];
} {
    const results: Record<string, TokenBudgetValidation> = {};
    const warnings: string[] = [];
    const errors: string[] = [];
    let totalTokens = 0;
    let allValid = true;

    for (const { section, text } of sections) {
        const result = validateTokenBudget(section, text, customBudgets);
        results[section] = result;
        totalTokens += result.tokens;

        if (!result.valid) {
            allValid = false;
            errors.push(result.warning || `${section} exceeds budget`);
        } else if (result.warning) {
            warnings.push(result.warning);
        }
    }

    return { allValid, results, totalTokens, warnings, errors };
}

// ============================================================================
// Character Prompt Configuration (ControlNet/VAE Support)
// ============================================================================

/**
 * Configuration for character-specific prompts in ControlNet/VAE workflows.
 * Designed for downstream integration with IP-Adapter and face encoding systems.
 */
export interface CharacterPromptConfig {
    /** Character's unique identifier */
    characterId: string;
    
    /** Visual descriptor for prompt injection (appearance, clothing, etc.) */
    visualDescriptor: string;
    
    /** Reference to identity embedding file (LoRA/textual inversion) */
    identityEmbedding?: string;
    
    /** IP-Adapter weight for identity preservation (0-1) */
    ipAdapterWeight?: number;
    
    /** Reference to face encoding vector file */
    faceEncodingRef?: string;
    
    /** Trigger words for trained embeddings */
    triggerWords?: string[];
    
    /** Negative prompt additions specific to this character */
    characterNegative?: string;
}

/**
 * Builds a character-aware prompt segment for ControlNet/VAE workflows.
 * 
 * @param config - Character prompt configuration
 * @returns Formatted prompt segment with character details
 */
export function buildCharacterPromptSegment(config: CharacterPromptConfig): string {
    const parts: string[] = [];

    // Add trigger words first if available
    if (config.triggerWords && config.triggerWords.length > 0) {
        parts.push(config.triggerWords.join(', '));
    }

    // Add visual descriptor
    if (config.visualDescriptor) {
        parts.push(config.visualDescriptor);
    }

    return parts.join(', ');
}

/**
 * Extracts ControlNet metadata from character config for workflow injection
 */
export function extractControlNetMetadata(config: CharacterPromptConfig): {
    hasEmbedding: boolean;
    hasIPAdapter: boolean;
    hasFaceEncoding: boolean;
    metadata: Record<string, unknown>;
} {
    return {
        hasEmbedding: !!config.identityEmbedding,
        hasIPAdapter: config.ipAdapterWeight !== undefined && config.ipAdapterWeight > 0,
        hasFaceEncoding: !!config.faceEncodingRef,
        metadata: {
            embeddingRef: config.identityEmbedding,
            ipAdapterWeight: config.ipAdapterWeight,
            faceEncodingRef: config.faceEncodingRef,
            triggerWords: config.triggerWords,
        },
    };
}

// ============================================================================
// Prompt Templates
// ============================================================================

/**
 * Standard prompt templates with placeholders
 */
export const PROMPT_TEMPLATES = {
    /** Template for Story Bible generation */
    storyBible: {
        version: '2.0',
        systemInstruction: `You are a master storyteller creating a Story Bible. Generate structured, detailed content that serves as the authoritative source of truth for cinematic story generation.

TOKEN LIMITS (STRICT):
- Logline: 50-100 words MAX (~400 chars)
- Each Character Profile: 80 words MAX (~320 chars)
- Setting: 200-300 words MAX (~1200 chars)
- Each Plot Scene: 50 words MAX (~200 chars)

Generate content that is:
1. Visually descriptive (for image/video generation)
2. Consistent across all sections
3. Non-repetitive (each section adds NEW information)
4. Structured for downstream processing`,
    },

    /** Template for scene generation */
    sceneGeneration: {
        version: '1.0',
        systemInstruction: `Generate a single visual moment for this scene. The output must be:
1. ONE moment in time (not a sequence)
2. Visually concrete (describable in an image)
3. Under 200 tokens
4. Reference characters by their Story Bible names`,
    },

    /** Template for ComfyUI prompts */
    comfyUI: {
        version: '1.0',
        maxTokens: 500,
        warningThreshold: 0.8, // 80% of max
        hardLimit: 2500, // Characters, not tokens
    },
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Counts words in a text string
 */
export function countWords(text: string): number {
    if (!text || typeof text !== 'string') {
        return 0;
    }
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Checks if text is within word count range
 */
export function isWithinWordRange(text: string, min: number, max: number): boolean {
    const words = countWords(text);
    return words >= min && words <= max;
}

/**
 * Gets a summary of token usage for logging
 */
export function getTokenUsageSummary(
    sections: Array<{ section: PromptSection; text: string }>
): string {
    const validation = validateTokenBudgets(sections);
    const lines = [
        `Total tokens: ${validation.totalTokens}`,
        `All valid: ${validation.allValid}`,
    ];

    for (const [section, result] of Object.entries(validation.results)) {
        const status = result.valid ? '✓' : '✗';
        lines.push(`  ${status} ${section}: ${result.tokens}/${result.budget} (${result.percentUsed.toFixed(0)}%)`);
    }

    if (validation.warnings.length > 0) {
        lines.push('Warnings:');
        validation.warnings.forEach(w => lines.push(`  ⚠ ${w}`));
    }

    if (validation.errors.length > 0) {
        lines.push('Errors:');
        validation.errors.forEach(e => lines.push(`  ✗ ${e}`));
    }

    return lines.join('\n');
}
