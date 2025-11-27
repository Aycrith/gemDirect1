/**
 * Pipeline Context Utilities
 * 
 * Provides centralized context assertions and fallbacks for the prompt pipeline.
 * Ensures consistent handling of optional callbacks and CI-mode behaviors.
 * 
 * @module utils/pipelineContext
 */

/**
 * API log callback type for telemetry tracking.
 * Matches the ApiLogCallback type from services.
 */
export type ApiLogCallback = (
    context: string,
    model: string,
    tokens: number,
    status: 'success' | 'error'
) => void;

/**
 * API state change callback type for UI progress updates.
 */
export type ApiStateChangeCallback = (state: {
    isLoading?: boolean;
    error?: string;
    progress?: number;
    message?: string;
}) => void;

/**
 * No-op API log callback for fallback scenarios.
 * Use this when a logging callback is optional but the function signature requires one.
 */
const noOpLogCallback: ApiLogCallback = () => {
    // Intentionally empty - used as fallback when no logger is provided
};

/**
 * No-op state change callback for fallback scenarios.
 */
const noOpStateChangeCallback: ApiStateChangeCallback = () => {
    // Intentionally empty - used as fallback when no state handler is provided
};

/**
 * Ensures logApiCall is available, returning no-op if missing.
 * Use this to safely pass logging callbacks through the pipeline.
 * 
 * @param logApiCall - Optional logging callback
 * @returns The provided callback or a no-op fallback
 * 
 * @example
 * ```typescript
 * const logger = ensureLogApiCall(logApiCall);
 * logger('keyframe-gen', 'gemini-2.5-flash', 150, 'success');
 * ```
 */
export function ensureLogApiCall(
    logApiCall?: ApiLogCallback
): ApiLogCallback {
    return logApiCall ?? noOpLogCallback;
}

/**
 * Ensures onStateChange is available, returning no-op if missing.
 * 
 * @param onStateChange - Optional state change callback
 * @returns The provided callback or a no-op fallback
 */
export function ensureStateChangeCallback(
    onStateChange?: ApiStateChangeCallback
): ApiStateChangeCallback {
    return onStateChange ?? noOpStateChangeCallback;
}

/**
 * Pipeline context for passing through generation functions.
 */
export interface PipelineContext {
    logApiCall?: ApiLogCallback;
    onStateChange?: ApiStateChangeCallback;
    flagName?: string;
}

/**
 * Asserts pipeline context is valid.
 * In CI mode, throws an error if required callbacks are missing.
 * In development mode, logs a warning.
 * 
 * @param context - The pipeline context to validate
 * @param flagName - Name of the feature flag requiring this context
 * @throws Error in CI mode if context is invalid
 * 
 * @example
 * ```typescript
 * assertPipelineContext({ logApiCall }, 'keyframePromptPipeline');
 * ```
 */
export function assertPipelineContext(
    context: PipelineContext,
    flagName: string
): void {
    // Check for CI mode via Vite env variable
    // Using globalThis to avoid import.meta issues in non-Vite contexts
    const viteCIMode = (globalThis as any).__VITE_CI_MODE__ ?? 
                       (typeof process !== 'undefined' && process.env?.VITE_CI_MODE);
    const isCI = viteCIMode === 'true' || viteCIMode === true;
    
    if (!context.logApiCall) {
        const message = `[PipelineContext] Warning: logApiCall missing for flag "${flagName}". ` +
                       'Telemetry will not be recorded.';
        
        if (isCI) {
            throw new Error(message);
        } else {
            console.warn(message);
        }
    }
}

/**
 * Creates a complete pipeline context with fallbacks.
 * 
 * @param partial - Partial context with optional callbacks
 * @returns Complete context with all callbacks defined (using no-ops for missing)
 */
export function createPipelineContext(
    partial: Partial<PipelineContext> = {}
): Required<Omit<PipelineContext, 'flagName'>> & Pick<PipelineContext, 'flagName'> {
    return {
        logApiCall: ensureLogApiCall(partial.logApiCall),
        onStateChange: ensureStateChangeCallback(partial.onStateChange),
        flagName: partial.flagName,
    };
}

/**
 * Token budget validation result.
 */
export interface TokenValidationResult {
    valid: boolean;
    tokens: number;
    budget: number;
    overflow: number;
    warning?: string;
}

/**
 * Validates token count against a budget based on the promptTokenGuard mode.
 * 
 * @param tokens - Estimated token count
 * @param budget - Maximum allowed tokens
 * @param mode - Guard mode: 'off', 'warn', or 'block'
 * @param context - Context string for logging
 * @returns Validation result with overflow information
 */
export function validateTokenBudget(
    tokens: number,
    budget: number,
    mode: 'off' | 'warn' | 'block',
    context: string
): TokenValidationResult {
    const overflow = Math.max(0, tokens - budget);
    const valid = tokens <= budget;
    
    if (mode === 'off') {
        return { valid: true, tokens, budget, overflow };
    }
    
    if (!valid) {
        const warning = `[TokenGuard] ${context}: Token budget exceeded (${tokens}/${budget}, overflow: ${overflow})`;
        
        if (mode === 'warn') {
            console.warn(warning);
            return { valid: true, tokens, budget, overflow, warning };
        }
        
        if (mode === 'block') {
            return { valid: false, tokens, budget, overflow, warning };
        }
    }
    
    // Near budget warning (>80%)
    const percentUsed = budget > 0 ? (tokens / budget) * 100 : 0;
    if (percentUsed >= 80 && percentUsed < 100) {
        const warning = `[TokenGuard] ${context}: Approaching token budget (${percentUsed.toFixed(0)}% used)`;
        console.info(warning);
        return { valid: true, tokens, budget, overflow, warning };
    }
    
    return { valid: true, tokens, budget, overflow };
}
