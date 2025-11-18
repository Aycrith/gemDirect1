import { describe, it, expect, beforeEach } from 'vitest';
import {
    executeWithRetry,
    getCircuitBreakerState,
    resetCircuitBreaker,
    createRetryPolicy,
    validateRetryPolicy,
    formatExecutionResult
} from '../comfyUIResilience';

describe('comfyUIResilience', () => {
    beforeEach(() => {
        resetCircuitBreaker();
    });

    describe('executeWithRetry', () => {
        it('executes successfully on first attempt', async () => {
            const result = await executeWithRetry(
                async () => 'success',
                'test-op'
            );

            expect(result.success).toBe(true);
            expect(result.data).toBe('success');
            expect(result.attempts).toBe(1);
            expect(result.recovered).toBe(false);
        });

        it('retries on transient failure', async () => {
            let attempts = 0;
            const result = await executeWithRetry(
                async () => {
                    attempts++;
                    if (attempts === 1) throw new Error('timeout');
                    return 'success';
                },
                'test-op'
            );

            expect(result.success).toBe(true);
            expect(result.data).toBe('success');
            expect(result.attempts).toBe(2);
            expect(result.recovered).toBe(true);
        });

        it('fails after max attempts', async () => {
            const result = await executeWithRetry(
                async () => {
                    throw new Error('always fails');
                },
                'test-op',
                { maxAttempts: 2 }
            );

            expect(result.success).toBe(false);
            expect(result.attempts).toBe(2);
            expect(result.error).toContain('failed after 2 attempts');
        });

        it('does not retry non-retryable errors', async () => {
            let attempts = 0;
            const result = await executeWithRetry(
                async () => {
                    attempts++;
                    throw new Error('401 unauthorized');
                },
                'test-op'
            );

            expect(result.success).toBe(false);
            expect(attempts).toBe(1);
        });

        it('respects timeout', async () => {
            const result = await executeWithRetry(
                async () => {
                    // Simulate a long operation that won't complete
                    return new Promise(() => {
                        // Never resolves
                    });
                },
                'test-op',
                { timeoutMs: 100, maxAttempts: 1 }
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('timed out');
        }, 2000); // Increase test timeout

        it('tracks total execution time', async () => {
            const result = await executeWithRetry(
                async () => 'success',
                'test-op'
            );

            expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
            expect(result.totalTimeMs).toBeLessThan(5000);
        });
    });

    describe('Circuit Breaker', () => {
        it('starts in closed state', () => {
            const state = getCircuitBreakerState();
            expect(state.state).toBe('closed');
            expect(state.failureCount).toBe(0);
        });

        it('records failures', async () => {
            const result1 = await executeWithRetry(
                async () => {
                    throw new Error('timeout');
                },
                'test-op',
                { maxAttempts: 1 }
            );

            expect(result1.success).toBe(false);
            
            const state = getCircuitBreakerState();
            expect(state.failureCount).toBeGreaterThan(0);
        });

        it('can be manually reset', () => {
            resetCircuitBreaker();
            const state = getCircuitBreakerState();
            expect(state.state).toBe('closed');
            expect(state.failureCount).toBe(0);
        });
    });

    describe('createRetryPolicy', () => {
        it('creates policy with defaults', () => {
            const policy = createRetryPolicy();
            expect(policy.maxAttempts).toBe(4);
            expect(policy.initialDelayMs).toBe(1000);
        });

        it('overrides defaults', () => {
            const policy = createRetryPolicy({
                maxAttempts: 5,
                initialDelayMs: 500
            });

            expect(policy.maxAttempts).toBe(5);
            expect(policy.initialDelayMs).toBe(500);
        });
    });

    describe('validateRetryPolicy', () => {
        it('validates correct policy', () => {
            const policy = createRetryPolicy();
            const result = validateRetryPolicy(policy);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects invalid maxAttempts', () => {
            const policy = createRetryPolicy({ maxAttempts: 0 });
            const result = validateRetryPolicy(policy);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('maxAttempts');
        });

        it('rejects invalid delays', () => {
            const policy = createRetryPolicy({
                initialDelayMs: 50,
                maxDelayMs: 1000
            });
            const result = validateRetryPolicy(policy);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('initialDelayMs');
        });

        it('rejects invalid backoff multiplier', () => {
            const policy = createRetryPolicy({ backoffMultiplier: 0.5 });
            const result = validateRetryPolicy(policy);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('backoffMultiplier');
        });
    });

    describe('formatExecutionResult', () => {
        it('formats success result', () => {
            const result = {
                success: true,
                data: 'test',
                attempts: 1,
                totalTimeMs: 100,
                recovered: false
            };

            const formatted = formatExecutionResult(result);
            expect(formatted).toContain('SUCCESS');
            expect(formatted).toContain('Attempts: 1');
        });

        it('formats failure result with error', () => {
            const result = {
                success: false,
                error: 'Connection failed',
                attempts: 3,
                totalTimeMs: 5000,
                recovered: true
            };

            const formatted = formatExecutionResult(result);
            expect(formatted).toContain('FAILED');
            expect(formatted).toContain('Connection failed');
            expect(formatted).toContain('Recovered: true');
        });
    });
});
