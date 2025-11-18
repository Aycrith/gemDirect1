import { describe, it, expect, beforeEach } from 'vitest';
import {
    handleLLMError,
    categorizeError,
    calculateBackoff,
    isRecoverableError,
    formatUserMessage,
    sleep,
    retryWithBackoff
} from '../llmErrorHandler';

describe('llmErrorHandler', () => {
    describe('categorizeError', () => {
        it('categorizes timeout errors', () => {
            expect(categorizeError('timeout')).toBe('timeout');
            expect(categorizeError('request timed out')).toBe('timeout');
        });

        it('categorizes rate limit errors', () => {
            expect(categorizeError('429 too many requests')).toBe('rate-limit');
            expect(categorizeError('rate limit exceeded')).toBe('rate-limit');
        });

        it('categorizes server errors', () => {
            expect(categorizeError('500')).toBe('server-error');
            expect(categorizeError('502')).toBe('server-error');
            expect(categorizeError('503')).toBe('server-error');
        });

        it('categorizes network errors', () => {
            expect(categorizeError('ECONNREFUSED')).toBe('network-error');
            expect(categorizeError('network error')).toBe('network-error');
        });

        it('categorizes authentication errors', () => {
            expect(categorizeError('401 unauthorized')).toBe('authentication');
            expect(categorizeError('403 forbidden')).toBe('authentication');
        });

        it('returns unknown for unrecognized errors', () => {
            expect(categorizeError('some random error')).toBe('unknown');
        });
    });

    describe('calculateBackoff', () => {
        it('calculates exponential backoff', () => {
            const delay1 = calculateBackoff(1, 1000, 30000);
            const delay2 = calculateBackoff(2, 1000, 30000);
            const delay3 = calculateBackoff(3, 1000, 30000);

            // Each should be roughly double the previous (accounting for jitter)
            expect(delay2).toBeGreaterThan(delay1);
            expect(delay3).toBeGreaterThan(delay2);
        });

        it('respects maximum delay', () => {
            const delay = calculateBackoff(10, 1000, 5000);
            expect(delay).toBeLessThanOrEqual(5000 * 1.1); // Allow for jitter
        });

        it('handles zero attempts', () => {
            const delay = calculateBackoff(0, 1000, 30000);
            expect(delay).toBeGreaterThan(0);
        });
    });

    describe('isRecoverableError', () => {
        it('identifies recoverable errors', () => {
            expect(isRecoverableError('timeout')).toBe(true);
            expect(isRecoverableError('rate-limit')).toBe(true);
            expect(isRecoverableError('server-error')).toBe(true);
            expect(isRecoverableError('network-error')).toBe(true);
        });

        it('identifies non-recoverable errors', () => {
            expect(isRecoverableError('authentication')).toBe(false);
            expect(isRecoverableError('invalid-format')).toBe(false);
        });
    });

    describe('handleLLMError', () => {
        it('returns fallback recovery for timeout', () => {
            const result = handleLLMError(
                new Error('request timed out'),
                { attemptNumber: 1, timeoutMs: 5000 }
            );

            expect(result.fallback).toBe(true);
            expect(result.canRetry).toBe(true);
            expect(result.severity).toBe('warning');
        });

        it('returns fallback recovery for rate limit', () => {
            const result = handleLLMError(
                new Error('429 rate limit'),
                { attemptNumber: 1 }
            );

            expect(result.fallback).toBe(true);
            expect(result.canRetry).toBe(true);
            expect(result.retryDelay).toBeGreaterThan(0);
        });

        it('increases retry delay on subsequent attempts', () => {
            const result1 = handleLLMError(
                new Error('timeout'),
                { attemptNumber: 1 }
            );
            const result2 = handleLLMError(
                new Error('timeout'),
                { attemptNumber: 2 }
            );

            expect(result2.retryDelay!).toBeGreaterThan(result1.retryDelay || 0);
        });

        it('stops retrying after max attempts', () => {
            const result = handleLLMError(
                new Error('timeout'),
                { attemptNumber: 3 }
            );

            expect(result.canRetry).toBe(false);
        });
    });

    describe('formatUserMessage', () => {
        it('formats recovery message for user', () => {
            const recovery = {
                fallback: true,
                message: 'Service unavailable',
                canRetry: true,
                severity: 'warning' as const
            };

            const msg = formatUserMessage(recovery);
            expect(msg).toContain('Service unavailable');
        });
    });

    describe('sleep', () => {
        it('delays execution', async () => {
            const start = Date.now();
            await sleep(100);
            const elapsed = Date.now() - start;

            expect(elapsed).toBeGreaterThanOrEqual(100);
            expect(elapsed).toBeLessThan(200);
        });
    });

    describe('retryWithBackoff', () => {
        it('succeeds on first attempt', async () => {
            let attempts = 0;
            const result = await retryWithBackoff(
                async () => {
                    attempts++;
                    return 'success';
                },
                'test-op'
            );

            expect(result).toBe('success');
            expect(attempts).toBe(1);
        });

        it('retries on failure', async () => {
            let attempts = 0;
            const result = await retryWithBackoff(
                async () => {
                    attempts++;
                    if (attempts < 2) throw new Error('fail');
                    return 'success';
                },
                'test-op',
                3
            );

            expect(result).toBe('success');
            expect(attempts).toBe(2);
        });

        it('fails after max attempts', async () => {
            const result = retryWithBackoff(
                async () => {
                    throw new Error('always fails');
                },
                'test-op',
                2
            );

            await expect(result).rejects.toThrow('failed after 2 attempts');
        });

        it('calls onRetry callback', async () => {
            let retryCount = 0;
            const retries: Array<{ attempt: number; delay: number }> = [];

            const result = await retryWithBackoff(
                async () => {
                    retryCount++;
                    if (retryCount < 2) throw new Error('fail');
                    return 'success';
                },
                'test-op',
                3,
                (attempt, delay) => {
                    retries.push({ attempt, delay });
                }
            );

            expect(result).toBe('success');
            expect(retries.length).toBe(1);
            expect(retries[0].attempt).toBe(1);
        });
    });
});
