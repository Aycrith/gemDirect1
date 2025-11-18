/**
 * ComfyUI Resilience Service
 * 
 * Provides retry logic, circuit breaker pattern, and recovery strategies
 * for ComfyUI queue operations and workflow execution.
 */

export interface RetryPolicy {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    timeoutMs: number;
}

export interface ComfyUIExecutionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    attempts: number;
    totalTimeMs: number;
    recovered: boolean;
}

export interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime?: number;
    successCount: number;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxAttempts: 4,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    timeoutMs: 180000
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIME = 60000; // 1 minute

/**
 * Circuit breaker for cascading failure prevention
 */
class CircuitBreaker {
    private state: CircuitBreakerState = {
        state: 'closed',
        failureCount: 0,
        successCount: 0
    };

    getState(): CircuitBreakerState {
        // Auto-reset half-open after timeout
        if (this.state.state === 'open' && this.state.lastFailureTime) {
            if (Date.now() - this.state.lastFailureTime > CIRCUIT_BREAKER_RESET_TIME) {
                this.state.state = 'half-open';
                this.state.failureCount = 0;
            }
        }
        return { ...this.state };
    }

    recordSuccess(): void {
        this.state.successCount++;
        if (this.state.state === 'half-open') {
            this.state.state = 'closed';
            this.state.failureCount = 0;
            this.state.successCount = 0;
        }
    }

    recordFailure(): void {
        this.state.failureCount++;
        this.state.lastFailureTime = Date.now();
        if (this.state.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
            this.state.state = 'open';
        }
    }

    canExecute(): boolean {
        const state = this.getState();
        return state.state !== 'open';
    }

    reset(): void {
        this.state = {
            state: 'closed',
            failureCount: 0,
            successCount: 0
        };
    }
}

/**
 * Global circuit breaker instance
 */
const circuitBreaker = new CircuitBreaker();

/**
 * Calculate exponential backoff delay
 */
const calculateDelay = (
    attempt: number,
    policy: RetryPolicy
): number => {
    const exponentialDelay = policy.initialDelayMs * Math.pow(
        policy.backoffMultiplier,
        Math.max(0, attempt - 1)
    );
    const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
    
    // Add jitter (±10%)
    const jitter = cappedDelay * 0.1 * (Math.random() - 0.5);
    return Math.round(cappedDelay + jitter);
};

/**
 * Sleep utility
 */
const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Execute operation with retry logic and circuit breaker
 */
export const executeWithRetry = async <T>(
    operation: () => Promise<T>,
    operationName: string,
    policy: Partial<RetryPolicy> = {}
): Promise<ComfyUIExecutionResult<T>> => {
    const fullPolicy = { ...DEFAULT_RETRY_POLICY, ...policy };
    const startTime = Date.now();
    
    // Check circuit breaker
    if (!circuitBreaker.canExecute()) {
        const state = circuitBreaker.getState();
        return {
            success: false,
            error: `Circuit breaker is ${state.state} after ${state.failureCount} failures`,
            attempts: 0,
            totalTimeMs: Date.now() - startTime,
            recovered: false
        };
    }

    let lastError: Error | null = null;
    let recovered = false;

    for (let attempt = 1; attempt <= fullPolicy.maxAttempts; attempt++) {
        try {
            const result = await executeWithTimeout(
                operation,
                fullPolicy.timeoutMs
            );
            
            circuitBreaker.recordSuccess();
            return {
                success: true,
                data: result,
                attempts: attempt,
                totalTimeMs: Date.now() - startTime,
                recovered
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Determine if error is retryable
            if (!isRetryableError(lastError)) {
                circuitBreaker.recordFailure();
                return {
                    success: false,
                    error: lastError.message,
                    attempts: attempt,
                    totalTimeMs: Date.now() - startTime,
                    recovered
                };
            }

            if (attempt === fullPolicy.maxAttempts) {
                circuitBreaker.recordFailure();
                return {
                    success: false,
                    error: `${operationName} failed after ${fullPolicy.maxAttempts} attempts: ${lastError.message}`,
                    attempts: attempt,
                    totalTimeMs: Date.now() - startTime,
                    recovered
                };
            }

            // Wait before retry
            const delayMs = calculateDelay(attempt, fullPolicy);
            console.warn(`[ComfyUIRetry] ${operationName} attempt ${attempt} failed. Retrying in ${delayMs}ms...`, {
                error: lastError.message,
                attempt,
                maxAttempts: fullPolicy.maxAttempts
            });
            
            await sleep(delayMs);
            recovered = true;
        }
    }

    circuitBreaker.recordFailure();
    return {
        success: false,
        error: lastError?.message || 'Unknown error',
        attempts: fullPolicy.maxAttempts,
        totalTimeMs: Date.now() - startTime,
        recovered
    };
};

/**
 * Execute with timeout wrapper
 */
const executeWithTimeout = <T>(
    operation: () => Promise<T>,
    timeoutMs: number
): Promise<T> => {
    return Promise.race([
        operation(),
        new Promise<T>((_, reject) =>
            setTimeout(
                () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
                timeoutMs
            )
        )
    ]);
};

/**
 * Determine if error is retryable
 */
const isRetryableError = (error: Error): boolean => {
    const message = error.message.toLowerCase();
    
    // Network errors are retryable
    if (message.includes('econnrefused') || 
        message.includes('enotfound') ||
        message.includes('network') ||
        message.includes('timeout')) {
        return true;
    }
    
    // Server errors (5xx) are retryable
    if (message.includes('500') || 
        message.includes('502') || 
        message.includes('503') ||
        message.includes('504')) {
        return true;
    }
    
    // Too many requests is retryable
    if (message.includes('429')) {
        return true;
    }
    
    // Client errors (4xx except 429) are not retryable
    if (message.includes('400') || 
        message.includes('401') || 
        message.includes('403') ||
        message.includes('404')) {
        return false;
    }
    
    return true; // Default to retryable for unknown errors
};

/**
 * Get circuit breaker state
 */
export const getCircuitBreakerState = (): CircuitBreakerState => {
    return circuitBreaker.getState();
};

/**
 * Reset circuit breaker (for testing/recovery)
 */
export const resetCircuitBreaker = (): void => {
    circuitBreaker.reset();
    console.log('[ComfyUIResilience] Circuit breaker reset');
};

/**
 * Create custom retry policy
 */
export const createRetryPolicy = (overrides: Partial<RetryPolicy> = {}): RetryPolicy => {
    return { ...DEFAULT_RETRY_POLICY, ...overrides };
};

/**
 * Validate retry policy
 */
export const validateRetryPolicy = (policy: RetryPolicy): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (policy.maxAttempts < 1) {
        errors.push('maxAttempts must be at least 1');
    }
    if (policy.initialDelayMs < 100) {
        errors.push('initialDelayMs must be at least 100');
    }
    if (policy.maxDelayMs < policy.initialDelayMs) {
        errors.push('maxDelayMs must be >= initialDelayMs');
    }
    if (policy.backoffMultiplier < 1) {
        errors.push('backoffMultiplier must be >= 1');
    }
    if (policy.timeoutMs < 1000) {
        errors.push('timeoutMs must be at least 1000');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Format execution result for logging
 */
export const formatExecutionResult = <T>(result: ComfyUIExecutionResult<T>): string => {
    return `[${result.success ? 'SUCCESS' : 'FAILED'}] ` +
        `Attempts: ${result.attempts}, ` +
        `Time: ${result.totalTimeMs}ms, ` +
        `Recovered: ${result.recovered}` +
        (result.error ? `, Error: ${result.error}` : '');
};
