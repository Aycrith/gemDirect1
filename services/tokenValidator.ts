/**
 * Token Validation Service
 * 
 * Provides token counting with Google GenAI API fallback to heuristic estimation.
 * Implements flag-gated enforcement modes (off/warn/block) via promptTokenGuard.
 * 
 * @module services/tokenValidator
 */

import { FeatureFlags, getFeatureFlagValue } from '../utils/featureFlags';

// ============================================================================
// Constants
// ============================================================================

/**
 * Timeout for countTokens API calls (ms).
 * Configured via VITE_TOKEN_API_TIMEOUT_MS environment variable.
 */
const TOKEN_API_TIMEOUT_MS = parseInt(
    import.meta.env?.VITE_TOKEN_API_TIMEOUT_MS || '500',
    10
);

/**
 * Conservative estimate for fallback when API is unavailable.
 * Based on empirical testing: Gemini averages ~3.5 chars per token for English text.
 */
const FALLBACK_CHARS_PER_TOKEN = 3.5;

/**
 * Threshold for fast-path heuristic (skip API if well under budget).
 * If heuristic estimate is under 80% of budget, we don't call the API.
 */
const FAST_PATH_THRESHOLD = 0.8;

/**
 * Provider-specific token estimation ratios.
 * Based on empirical analysis of tokenizer behavior:
 * - CLIP (ComfyUI/SD): ~3.5 chars/token, 77-token max per chunk
 * - Gemini: ~4.0 chars/token for mixed content
 */
export const TOKEN_RATIOS = {
    /** CLIP tokenizer (SD/ComfyUI) - averages 3.5 chars/token */
    clip: 3.5,
    /** Gemini tokenizer - averages 4 chars/token */
    gemini: 4.0,
    /** WAN model tokenizer - similar to CLIP */
    wan: 3.5,
    /** Conservative fallback */
    default: 3.5,
} as const;

/** Provider IDs for token estimation */
export type TokenProvider = keyof typeof TOKEN_RATIOS;

/** CLIP model has 77-token maximum per chunk */
export const CLIP_MAX_TOKENS_PER_CHUNK = 77;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of token counting operation.
 */
export interface TokenCountResult {
    /** Number of tokens counted/estimated */
    tokens: number;
    /** Source of the count ('api' or 'heuristic') */
    source: 'api' | 'heuristic';
    /** Optional error message if API failed */
    error?: string;
}

/**
 * Result of token budget guard check.
 */
export interface TokenGuardResult {
    /** Whether the prompt is allowed (based on flag mode) */
    allowed: boolean;
    /** Token count (actual or estimated) */
    tokens: number;
    /** The budget limit that was checked against */
    budget: number;
    /** Source of token count */
    source: 'api' | 'heuristic';
    /** Whether the prompt exceeds the budget */
    overBudget: boolean;
    /** Warning message if over budget but allowed */
    warning?: string;
}

/**
 * Google GenAI SDK interface for countTokens.
 * This matches the ai.models.countTokens signature.
 */
export interface TokenCountApi {
    countTokens: (params: {
        model: string;
        contents: string;
    }) => Promise<{ totalTokens: number }>;
}

/**
 * API call logger callback type.
 */
export type ApiLogCallback = (
    component: string,
    action: string,
    details?: Record<string, unknown>
) => void;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Estimates token count using heuristic (character-based).
 * 
 * Uses provider-specific ratios for more accurate estimation:
 * - CLIP/ComfyUI: 3.5 chars/token
 * - Gemini: 4.0 chars/token
 * - Default: 3.5 chars/token (conservative)
 * 
 * @param text - Text to estimate tokens for
 * @param provider - Provider for ratio selection (default: 'default')
 * @returns Estimated token count
 */
export function heuristicTokenEstimate(
    text: string,
    provider: TokenProvider = 'default'
): number {
    if (!text) return 0;
    const ratio = TOKEN_RATIOS[provider] ?? TOKEN_RATIOS.default;
    return Math.ceil(text.length / ratio);
}

/**
 * Estimates the number of CLIP chunks needed for a prompt.
 * CLIP models process text in 77-token chunks; prompts exceeding
 * this are split and processed separately.
 * 
 * @param text - Text to estimate chunks for
 * @returns Number of 77-token chunks needed
 */
export function estimateCLIPChunks(text: string): number {
    const tokens = heuristicTokenEstimate(text, 'clip');
    return Math.ceil(tokens / CLIP_MAX_TOKENS_PER_CHUNK);
}

/**
 * Maps provider IDs to token estimation providers.
 */
export function getTokenProviderFromId(providerId: string): TokenProvider {
    switch (providerId.toLowerCase()) {
        case 'comfyui':
        case 'sd':
        case 'stable-diffusion':
            return 'clip';
        case 'wan':
        case 'wan2':
            return 'wan';
        case 'gemini':
            return 'gemini';
        default:
            return 'default';
    }
}

/**
 * Counts tokens with API fallback to heuristic.
 * 
 * - Uses Google GenAI countTokens API if available
 * - Falls back to heuristic if API times out or errors
 * - Respects VITE_TOKEN_API_ENABLED environment variable
 * 
 * @param text - Text to count tokens for
 * @param api - Token counting API (optional, skips API if not provided)
 * @param model - Model to use for counting (default: 'gemini-2.0-flash')
 * @returns Token count result with source information
 */
export async function countTokensWithFallback(
    text: string,
    api?: TokenCountApi,
    model: string = 'gemini-2.0-flash'
): Promise<TokenCountResult> {
    // Fast path for empty text
    if (!text) {
        return { tokens: 0, source: 'heuristic' };
    }
    
    // Check if API is disabled via environment
    const apiEnabled = import.meta.env?.VITE_TOKEN_API_ENABLED !== 'false';
    
    if (!api || !apiEnabled) {
        return {
            tokens: heuristicTokenEstimate(text),
            source: 'heuristic',
        };
    }
    
    try {
        // Create timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TOKEN_API_TIMEOUT_MS);
        
        // Call API with timeout
        const result = await Promise.race([
            api.countTokens({ model, contents: text }),
            new Promise<never>((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                    reject(new Error('Token count API timeout'));
                });
            }),
        ]);
        
        clearTimeout(timeoutId);
        
        return {
            tokens: result.totalTokens,
            source: 'api',
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[TokenValidator] countTokens unavailable, using heuristic:', errorMessage);
        
        return {
            tokens: heuristicTokenEstimate(text),
            source: 'heuristic',
            error: errorMessage,
        };
    }
}

/**
 * Guards token budget based on feature flag mode.
 * 
 * Behavior by promptTokenGuard flag value:
 * - 'off': Always allowed, no checks
 * - 'warn': Allowed with warning if over budget
 * - 'block': Blocked if over budget
 * 
 * Uses fast-path heuristic for prompts well under budget (< 80%).
 * Only calls API for prompts near the budget threshold.
 * 
 * @param prompt - Prompt text to validate
 * @param budget - Token budget limit
 * @param flags - Feature flags (uses promptTokenGuard)
 * @param api - Optional token counting API
 * @param logApiCall - Optional callback for logging
 * @returns Guard result with allowed status and token count
 */
export async function guardTokenBudget(
    prompt: string,
    budget: number,
    flags: Partial<FeatureFlags>,
    api?: TokenCountApi,
    logApiCall?: ApiLogCallback
): Promise<TokenGuardResult> {
    const guardMode = getFeatureFlagValue(flags as FeatureFlags, 'promptTokenGuard');
    
    // Fast path: guard is off
    if (guardMode === 'off') {
        const tokens = heuristicTokenEstimate(prompt);
        return {
            allowed: true,
            tokens,
            budget,
            source: 'heuristic',
            overBudget: tokens > budget,
        };
    }
    
    // Fast path: heuristic shows well under budget
    const heuristicTokens = heuristicTokenEstimate(prompt);
    if (heuristicTokens <= budget * FAST_PATH_THRESHOLD) {
        logApiCall?.('token_guard', 'fast_path', {
            heuristic: heuristicTokens,
            budget,
            threshold: FAST_PATH_THRESHOLD,
        });
        
        return {
            allowed: true,
            tokens: heuristicTokens,
            budget,
            source: 'heuristic',
            overBudget: false,
        };
    }
    
    // Near budget: use API with fallback
    const countResult = await countTokensWithFallback(prompt, api);
    const overBudget = countResult.tokens > budget;
    
    // Determine allowed based on mode
    const allowed = guardMode === 'warn' || !overBudget;
    
    // Build warning message
    let warning: string | undefined;
    if (overBudget && allowed) {
        warning = `Prompt exceeds token budget: ${countResult.tokens}/${budget} tokens (${countResult.source})`;
    }
    
    logApiCall?.('token_guard', 'check', {
        heuristic: heuristicTokens,
        actual: countResult.tokens,
        budget,
        allowed,
        source: countResult.source,
        mode: guardMode,
    });
    
    return {
        allowed,
        tokens: countResult.tokens,
        budget,
        source: countResult.source,
        overBudget,
        warning,
    };
}

/**
 * Validates a prompt against a token budget.
 * 
 * This is a simpler version of guardTokenBudget that doesn't require
 * feature flags. Always returns whether the prompt is within budget.
 * 
 * @param prompt - Prompt text to validate
 * @param budget - Token budget limit
 * @param api - Optional token counting API
 * @returns Object with validation result and token count
 */
export async function validatePromptTokens(
    prompt: string,
    budget: number,
    api?: TokenCountApi
): Promise<{
    valid: boolean;
    tokens: number;
    budget: number;
    source: 'api' | 'heuristic';
}> {
    const result = await countTokensWithFallback(prompt, api);
    
    return {
        valid: result.tokens <= budget,
        tokens: result.tokens,
        budget,
        source: result.source,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the current token API configuration.
 * Useful for diagnostics and debugging.
 */
export function getTokenApiConfig(): {
    enabled: boolean;
    timeoutMs: number;
    charsPerToken: number;
    fastPathThreshold: number;
    tokenRatios: typeof TOKEN_RATIOS;
    clipMaxTokensPerChunk: number;
} {
    return {
        enabled: import.meta.env?.VITE_TOKEN_API_ENABLED !== 'false',
        timeoutMs: TOKEN_API_TIMEOUT_MS,
        charsPerToken: FALLBACK_CHARS_PER_TOKEN,
        fastPathThreshold: FAST_PATH_THRESHOLD,
        tokenRatios: TOKEN_RATIOS,
        clipMaxTokensPerChunk: CLIP_MAX_TOKENS_PER_CHUNK,
    };
}

/**
 * Creates a token budget summary for multiple prompts.
 * 
 * @param prompts - Array of prompts to analyze
 * @param budget - Token budget per prompt
 * @returns Summary statistics
 */
export function summarizeTokenBudgets(
    prompts: string[],
    budget: number
): {
    totalTokens: number;
    maxTokens: number;
    minTokens: number;
    avgTokens: number;
    overBudgetCount: number;
    withinBudgetPercent: number;
} {
    if (prompts.length === 0) {
        return {
            totalTokens: 0,
            maxTokens: 0,
            minTokens: 0,
            avgTokens: 0,
            overBudgetCount: 0,
            withinBudgetPercent: 100,
        };
    }
    
    const tokenCounts = prompts.map(p => heuristicTokenEstimate(p));
    const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
    const maxTokens = Math.max(...tokenCounts);
    const minTokens = Math.min(...tokenCounts);
    const overBudgetCount = tokenCounts.filter(t => t > budget).length;
    
    return {
        totalTokens,
        maxTokens,
        minTokens,
        avgTokens: Math.round(totalTokens / prompts.length),
        overBudgetCount,
        withinBudgetPercent: Math.round(((prompts.length - overBudgetCount) / prompts.length) * 100),
    };
}
