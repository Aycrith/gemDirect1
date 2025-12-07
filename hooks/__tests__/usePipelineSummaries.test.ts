/**
 * Tests for usePipelineSummaries hook
 * 
 * @module hooks/__tests__/usePipelineSummaries.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePipelineSummaries } from '../usePipelineSummaries';
import {
    calculateSummaryAge,
    isSummaryStale,
    formatAge,
    DEFAULT_STALENESS_THRESHOLD_MS,
} from '../../types/pipelineSummary';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('usePipelineSummaries', () => {
    beforeEach(() => {
        mockFetch.mockReset();
    });

    it('should start in loading state', () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        
        const { result } = renderHook(() => usePipelineSummaries({ autoRefresh: false }));
        
        expect(result.current.state.loading).toBe(true);
    });

    it('should fetch both summaries on mount', async () => {
        const productionData = {
            pipelineId: 'test-pipeline',
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
        };
        const narrativeData = {
            narrativeId: 'test-narrative',
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
        };
        const preflightData = {
            version: '1.0',
            generatedAt: new Date().toISOString(),
            result: {
                ffmpegVersion: '4.2.3',
                tmixNormalizeSupported: false,
                vlmReachable: true,
            },
        };

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(productionData),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(narrativeData),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(preflightData),
            });

        const { result } = renderHook(() => usePipelineSummaries({ autoRefresh: false }));

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.production).toEqual(productionData);
        expect(result.current.state.narrative).toEqual(narrativeData);
        expect(result.current.hasProduction).toBe(true);
        expect(result.current.hasNarrative).toBe(true);
        expect(result.current.hasBoth).toBe(true);
    });

    it('should handle 404 gracefully', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });

        const { result } = renderHook(() => usePipelineSummaries({ autoRefresh: false }));

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.production).toBeNull();
        expect(result.current.state.narrative).toBeNull();
        expect(result.current.hasNeither).toBe(true);
        expect(result.current.state.error).toBeNull();
    });

    it('should handle fetch errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const { result } = renderHook(() => usePipelineSummaries({ autoRefresh: false }));

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.error).toBe('Network error');
    });

    it('should detect stale summaries', async () => {
        const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
        const productionData = {
            pipelineId: 'test-pipeline',
            status: 'succeeded',
            finishedAt: staleDate,
        };

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(productionData),
            })
            .mockResolvedValueOnce({ ok: false, status: 404 })
            .mockResolvedValueOnce({ ok: false, status: 404 });

        const { result } = renderHook(() => usePipelineSummaries({ autoRefresh: false }));

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.productionStale).toBe(true);
    });

    it('should refresh on manual trigger', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });

        const { result } = renderHook(() => usePipelineSummaries({ autoRefresh: false }));

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        // Now mock a new response
        const productionData = {
            pipelineId: 'test-pipeline',
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
        };
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(productionData),
            })
            .mockResolvedValueOnce({ ok: false, status: 404 })
            .mockResolvedValueOnce({ ok: false, status: 404 });

        await act(async () => {
            await result.current.refresh();
        });

        await waitFor(() => {
            expect(result.current.state.production).toEqual(productionData);
        });
    });
});

describe('pipelineSummary utilities', () => {
    describe('calculateSummaryAge', () => {
        it('should return null for undefined input', () => {
            expect(calculateSummaryAge(undefined)).toBeNull();
        });

        it('should return null for invalid date', () => {
            expect(calculateSummaryAge('not-a-date')).toBeNull();
        });

        it('should calculate age correctly', () => {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const age = calculateSummaryAge(oneHourAgo);
            expect(age).toBeGreaterThanOrEqual(60 * 60 * 1000 - 100); // Allow small timing variance
            expect(age).toBeLessThan(60 * 60 * 1000 + 1000);
        });
    });

    describe('isSummaryStale', () => {
        it('should return true for undefined input', () => {
            expect(isSummaryStale(undefined)).toBe(true);
        });

        it('should return false for fresh data', () => {
            const fresh = new Date().toISOString();
            expect(isSummaryStale(fresh)).toBe(false);
        });

        it('should return true for old data', () => {
            const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
            expect(isSummaryStale(old)).toBe(true);
        });

        it('should respect custom threshold', () => {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            expect(isSummaryStale(oneHourAgo, 30 * 60 * 1000)).toBe(true); // 30 min threshold
            expect(isSummaryStale(oneHourAgo, 2 * 60 * 60 * 1000)).toBe(false); // 2 hour threshold
        });
    });

    describe('formatAge', () => {
        it('should return "unknown" for null', () => {
            expect(formatAge(null)).toBe('unknown');
        });

        it('should format seconds as "just now"', () => {
            expect(formatAge(30 * 1000)).toBe('just now');
        });

        it('should format minutes', () => {
            expect(formatAge(5 * 60 * 1000)).toBe('5m ago');
        });

        it('should format hours and minutes', () => {
            expect(formatAge(2 * 60 * 60 * 1000 + 30 * 60 * 1000)).toBe('2h 30m ago');
        });

        it('should format days and hours', () => {
            expect(formatAge(2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000)).toBe('2d 5h ago');
        });
    });

    describe('DEFAULT_STALENESS_THRESHOLD_MS', () => {
        it('should be 24 hours', () => {
            expect(DEFAULT_STALENESS_THRESHOLD_MS).toBe(24 * 60 * 60 * 1000);
        });
    });
});
