/**
 * LLM Error Handler Service
 * 
 * Provides structured error categorization, retry logic, and recovery strategies
 * for local LLM operations. Enables graceful degradation and intelligent fallback.
 */

export interface LLMErrorContext {
    endpoint?: string;
    model?: string;
    seed?: string;
    timeoutMs?: number;
    attemptNumber: number;
    requestSize?: number;
}

export interface LLMErrorRecovery {
    fallback: boolean;
    message: string;
    canRetry: boolean;
    retryDelay?: number;
    severity: 'info' | 'warning' | 'error' | 'critical';
}

export type LLMErrorType = 
    | 'timeout'
    | 'rate-limit'
    | 'server-error'
    | 'network-error'
    | 'invalid-format'
    | 'authentication'
    | 'unknown';

/**
 * Categorize an error and determine recovery strategy
 */
export const handleLLMError = (
    error: unknown,
    context: LLMErrorContext
): LLMErrorRecovery => {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorType = categorizeError(err.message);
    
    switch (errorType) {
        case 'timeout':
            return {
                fallback: true,
                message: `LLM request timed out after ${context.timeoutMs}ms. Using template-based fallback.`,
                canRetry: context.attemptNumber < 3,
                retryDelay: calculateBackoff(context.attemptNumber, 1000, 8000),
                severity: 'warning'
            };
        
        case 'rate-limit':
            return {
                fallback: true,
                message: 'LLM rate limited (429). Backing off before retry...',
                canRetry: true,
                retryDelay: calculateBackoff(context.attemptNumber, 2000, 30000),
                severity: 'warning'
            };
        
        case 'server-error':
            return {
                fallback: true,
                message: `LLM server error (5xx). Using templates for this run. (${err.message})`,
                canRetry: context.attemptNumber < 2,
                retryDelay: calculateBackoff(context.attemptNumber, 3000, 10000),
                severity: 'error'
            };
        
        case 'network-error':
            return {
                fallback: true,
                message: `Network error connecting to LLM. Using templates. (${err.message})`,
                canRetry: context.attemptNumber < 3,
                retryDelay: calculateBackoff(context.attemptNumber, 1000, 8000),
                severity: 'error'
            };
        
        case 'authentication':
            return {
                fallback: true,
                message: 'LLM authentication failed. Check credentials. Using templates.',
                canRetry: false,
                severity: 'critical'
            };
        
        case 'invalid-format':
            return {
                fallback: true,
                message: `LLM returned invalid response format. Using templates. (${err.message})`,
                canRetry: false,
                severity: 'error'
            };
        
        default:
            return {
                fallback: true,
                message: `LLM error: ${err.message}. Using template-based fallback.`,
                canRetry: context.attemptNumber < 2,
                retryDelay: calculateBackoff(context.attemptNumber, 1000, 5000),
                severity: 'error'
            };
    }
};

/**
 * Categorize error type from error message
 */
export const categorizeError = (errorMessage: string): LLMErrorType => {
    const msg = errorMessage.toLowerCase();
    
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return 'timeout';
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
        return 'rate-limit';
    }
    if (/\b5\d{2}\b/.test(msg) || msg.includes('server error')) {
        return 'server-error';
    }
    if (msg.includes('econnrefused') || msg.includes('network') || msg.includes('unreachable')) {
        return 'network-error';
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) {
        return 'authentication';
    }
    if (msg.includes('invalid') || msg.includes('json') || msg.includes('parse')) {
        return 'invalid-format';
    }
    
    return 'unknown';
};

/**
 * Calculate exponential backoff with jitter
 * @param attemptNumber - Current attempt (1-based)
 * @param initialDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
export const calculateBackoff = (
    attemptNumber: number,
    initialDelayMs: number = 1000,
    maxDelayMs: number = 30000
): number => {
    const exponentialDelay = initialDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1));
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
    
    // Add jitter (±10%)
    const jitter = cappedDelay * 0.1 * (Math.random() - 0.5);
    return Math.round(cappedDelay + jitter);
};

/**
 * Determine if error is recoverable
 */
export const isRecoverableError = (errorType: LLMErrorType): boolean => {
    return ['timeout', 'rate-limit', 'server-error', 'network-error'].includes(errorType);
};

/**
 * Format error for user-facing display
 */
export const formatUserMessage = (recovery: LLMErrorRecovery): string => {
    return recovery.message;
};

/**
 * Log error with context for debugging
 */
export const logLLMError = (
    error: unknown,
    context: LLMErrorContext,
    recovery: LLMErrorRecovery
): void => {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorType = categorizeError(err.message);
    
    console.warn(`[LLMError] Type: ${errorType}`, {
        message: err.message,
        endpoint: context.endpoint,
        model: context.model,
        attemptNumber: context.attemptNumber,
        timeoutMs: context.timeoutMs,
        fallback: recovery.fallback,
        canRetry: recovery.canRetry,
        retryDelay: recovery.retryDelay,
        severity: recovery.severity
    });
};

/**
 * Sleep utility for delays
 */
export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry an operation with exponential backoff
 */
export const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    operationName: string,
    maxAttempts: number = 3,
    onRetry?: (attempt: number, delay: number) => void
): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (attempt === maxAttempts) {
                throw new Error(
                    `${operationName} failed after ${maxAttempts} attempts: ${lastError.message}`
                );
            }
            
            const delay = calculateBackoff(attempt);
            onRetry?.(attempt, delay);
            await sleep(delay);
        }
    }
    
    throw lastError || new Error(`${operationName} failed`);
};
