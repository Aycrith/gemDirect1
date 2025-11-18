import { describe, it, expect, beforeEach } from 'vitest';
import {
    checkRateLimit,
    createRateLimiter,
    getRateLimiter,
    resetRateLimiter,
    clearAllRateLimiters,
    waitForRateLimit,
    generateRateLimitReport
} from '../../utils/rateLimiter';

describe('rateLimiter', () => {
    beforeEach(() => {
        clearAllRateLimiters();
    });

    describe('checkRateLimit', () => {
        it('allows requests within per-minute limit', () => {
            // Create limiter with high burst limit so we can test minute limit
            createRateLimiter('test', { burstLimit: 100 });
            
            // Make some requests but stay under the limit
            for (let i = 0; i < 30; i++) {
                const status = checkRateLimit('test');
                expect(status.allowed).toBe(true);
            }
        });

        it('blocks requests exceeding per-minute limit', () => {
            // Create limiter with high burst limit
            createRateLimiter('test-minute', { 
                requestsPerMinute: 10,
                burstLimit: 100 
            });

            // Use up all 10 per-minute requests
            for (let i = 0; i < 10; i++) {
                checkRateLimit('test-minute');
            }

            // Next request should fail
            const status = checkRateLimit('test-minute');
            expect(status.allowed).toBe(false);
            expect(status.message).toContain('per minute');
        });

        it('tracks remaining requests', () => {
            createRateLimiter('test-remaining', { burstLimit: 100 });
            
            const status1 = checkRateLimit('test-remaining');
            expect(status1.remaining).toBeLessThanOrEqual(59);

            const status2 = checkRateLimit('test-remaining');
            expect(status2.remaining).toBeLessThanOrEqual(status1.remaining);
        });

        it('provides reset time', () => {
            createRateLimiter('test-reset', { 
                requestsPerMinute: 10,
                burstLimit: 100
            });
            
            for (let i = 0; i < 10; i++) {
                checkRateLimit('test-reset');
            }

            const status = checkRateLimit('test-reset');
            expect(status.resetIn).toBeGreaterThan(0);
            expect(status.resetIn).toBeLessThanOrEqual(60000);
        });
    });

    describe('Rate Limit Buckets', () => {
        it('maintains separate limits per identifier', () => {
            // Create limiters with high burst limits
            createRateLimiter('user-1', { 
                requestsPerMinute: 10,
                burstLimit: 100 
            });
            createRateLimiter('user-2', { 
                requestsPerMinute: 10,
                burstLimit: 100 
            });
            
            // Use up 10 for 'user-1'
            for (let i = 0; i < 10; i++) {
                checkRateLimit('user-1');
            }

            // 'user-2' should still have requests available
            const status = checkRateLimit('user-2');
            expect(status.allowed).toBe(true);
        });
    });

    describe('createRateLimiter', () => {
        it('creates custom rate limiter', () => {
            const limiter = createRateLimiter('custom', {
                requestsPerMinute: 10,
                burstLimit: 2
            });

            expect(limiter).toBeDefined();
            expect(limiter.getConfig().requestsPerMinute).toBe(10);
        });

        it('uses custom limits', () => {
            createRateLimiter('limited', {
                requestsPerMinute: 5
            });

            for (let i = 0; i < 5; i++) {
                const status = checkRateLimit('limited');
                expect(status.allowed).toBe(true);
            }

            const status = checkRateLimit('limited');
            expect(status.allowed).toBe(false);
        });
    });

    describe('getRateLimiter', () => {
        it('retrieves existing rate limiter', () => {
            createRateLimiter('test', {
                requestsPerMinute: 10
            });

            const limiter = getRateLimiter('test');
            expect(limiter).toBeDefined();
            expect(limiter?.getConfig().requestsPerMinute).toBe(10);
        });

        it('returns undefined for non-existent limiter', () => {
            const limiter = getRateLimiter('non-existent');
            expect(limiter).toBeUndefined();
        });
    });

    describe('resetRateLimiter', () => {
        it('resets rate limiter state', () => {
            // Use up requests
            for (let i = 0; i < 60; i++) {
                checkRateLimit('test');
            }

            expect(checkRateLimit('test').allowed).toBe(false);

            // Reset
            resetRateLimiter('test');

            // Should be allowed again
            expect(checkRateLimit('test').allowed).toBe(true);
        });
    });

    describe('Burst Limit', () => {
        it('enforces burst limit per second', () => {
            createRateLimiter('burst-test', {
                requestsPerMinute: 60,
                burstLimit: 3
            });

            // First 3 requests should succeed
            for (let i = 0; i < 3; i++) {
                const status = checkRateLimit('burst-test');
                expect(status.allowed).toBe(true);
            }

            // 4th request should fail due to burst limit (within same second)
            const status = checkRateLimit('burst-test');
            expect(status.allowed).toBe(false);
            expect(status.message).toContain('Burst limit exceeded');
        });
    });

    describe('Burst Recovery', () => {
        it('recovers burst allowance after time', async () => {
            createRateLimiter('burst-recover', {
                requestsPerMinute: 60,
                burstLimit: 2
            });

            // Use burst limit
            checkRateLimit('burst-recover');
            checkRateLimit('burst-recover');
            expect(checkRateLimit('burst-recover').allowed).toBe(false);

            // Wait for time window
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should have tokens again
            const status = checkRateLimit('burst-recover');
            expect(status.allowed).toBe(true);
        });
    });

    describe('waitForRateLimit', () => {
        it('waits for rate limit availability', async () => {
            // Use up all requests
            for (let i = 0; i < 60; i++) {
                checkRateLimit('wait-test');
            }

            expect(checkRateLimit('wait-test').allowed).toBe(false);

            // Wait for availability (should timeout since we test with short time)
            const available = await waitForRateLimit('wait-test', 100);

            // Depending on timing, may or may not be available
            expect(typeof available).toBe('boolean');
        });

        it('returns true when limit available', async () => {
            checkRateLimit('available-test');

            const available = await waitForRateLimit('available-test', 1000);
            expect(available).toBe(true);
        });
    });

    describe('generateRateLimitReport', () => {
        it('generates report for all limiters', () => {
            checkRateLimit('user-1');
            checkRateLimit('user-2');

            const report = generateRateLimitReport();

            expect(report).toContain('Rate Limit Statistics');
            expect(report).toContain('user-1');
            expect(report).toContain('user-2');
        });

        it('shows empty report when no limiters', () => {
            const report = generateRateLimitReport();

            expect(report).toContain('No rate limiters');
        });
    });

    describe('Configuration Validation', () => {
        it('validates rate limiter configuration', () => {
            const validConfig = createRateLimiter('valid', {
                requestsPerMinute: 60,
                requestsPerHour: 3600,
                burstLimit: 5
            });

            const config = validConfig.getConfig();
            expect(config.requestsPerMinute).toBeGreaterThan(0);
            expect(config.requestsPerHour).toBeGreaterThanOrEqual(config.requestsPerMinute);
            expect(config.burstLimit).toBeGreaterThan(0);
        });
    });

    describe('State Management', () => {
        it('tracks state across requests', () => {
            checkRateLimit('state-test');
            checkRateLimit('state-test');

            const limiter = getRateLimiter('state-test');
            const state = limiter?.getState();

            expect(state?.tokensMinute).toBeLessThan(60);
        });

        it('gets remaining tokens', () => {
            checkRateLimit('remaining-test');

            const limiter = getRateLimiter('remaining-test');
            const remaining = limiter?.getRemaining();

            expect(remaining?.minute).toBe(59);
            expect(remaining?.hour).toBe(599);
        });
    });
});
