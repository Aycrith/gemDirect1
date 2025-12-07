/**
 * Tests for useRunController hook
 * 
 * @module hooks/__tests__/useRunController.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { 
    useRunController, 
    formatRunStatus, 
    formatDuration, 
    calculateProgress 
} from '../useRunController';
import type { RunState, RunStatusFile } from '../../types/pipelineRun';

// ============================================================================
// Mock Data
// ============================================================================

const createMockRunState = (overrides: Partial<RunState> = {}): RunState => ({
    runId: 'run-2024-01-15_12-00-00-abc123',
    pipelineType: 'production',
    status: 'running',
    identifier: 'production-qa-golden (sample-001-geometric)',
    startedAt: '2024-01-15T12:00:00.000Z',
    events: [],
    ...overrides,
});

const createMockStatusFile = (run: RunState | null = null): RunStatusFile => ({
    version: '1.0',
    run,
    lastUpdated: new Date().toISOString(),
});

// ============================================================================
// Tests: formatRunStatus
// ============================================================================

describe('formatRunStatus', () => {
    it('formats queued status', () => {
        const result = formatRunStatus('queued');
        expect(result.text).toBe('Queued');
        expect(result.emoji).toBe('⏳');
        expect(result.color).toContain('yellow');
    });

    it('formats running status', () => {
        const result = formatRunStatus('running');
        expect(result.text).toBe('Running');
        expect(result.emoji).toBe('🔄');
        expect(result.color).toContain('blue');
    });

    it('formats succeeded status', () => {
        const result = formatRunStatus('succeeded');
        expect(result.text).toBe('Succeeded');
        expect(result.emoji).toBe('✅');
        expect(result.color).toContain('green');
    });

    it('formats failed status', () => {
        const result = formatRunStatus('failed');
        expect(result.text).toBe('Failed');
        expect(result.emoji).toBe('❌');
        expect(result.color).toContain('red');
    });

    it('formats cancelled status', () => {
        const result = formatRunStatus('cancelled');
        expect(result.text).toBe('Cancelled');
        expect(result.emoji).toBe('🛑');
        expect(result.color).toContain('gray');
    });

    it('formats unknown status', () => {
        const result = formatRunStatus(undefined);
        expect(result.text).toBe('Unknown');
        expect(result.emoji).toBe('❓');
    });
});

// ============================================================================
// Tests: formatDuration
// ============================================================================

describe('formatDuration', () => {
    it('formats undefined as --', () => {
        expect(formatDuration(undefined)).toBe('--');
    });

    it('formats milliseconds', () => {
        expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
        expect(formatDuration(5000)).toBe('5.0s');
        expect(formatDuration(30500)).toBe('30.5s');
    });

    it('formats minutes and seconds', () => {
        expect(formatDuration(60000)).toBe('1m 0s');
        expect(formatDuration(90000)).toBe('1m 30s');
        expect(formatDuration(125000)).toBe('2m 5s');
    });
});

// ============================================================================
// Tests: calculateProgress
// ============================================================================

describe('calculateProgress', () => {
    it('returns 0 for null run', () => {
        expect(calculateProgress(null)).toBe(0);
    });

    it('returns 100 for succeeded run', () => {
        const run = createMockRunState({ status: 'succeeded' });
        expect(calculateProgress(run)).toBe(100);
    });

    it('returns 0 for failed run', () => {
        const run = createMockRunState({ status: 'failed' });
        expect(calculateProgress(run)).toBe(0);
    });

    it('returns 0 for cancelled run', () => {
        const run = createMockRunState({ status: 'cancelled' });
        expect(calculateProgress(run)).toBe(0);
    });

    it('calculates progress from step counts', () => {
        const run = createMockRunState({
            status: 'running',
            completedSteps: 2,
            totalSteps: 4,
        });
        expect(calculateProgress(run)).toBe(50);
    });

    it('returns 50 for running with no step info', () => {
        const run = createMockRunState({ status: 'running' });
        expect(calculateProgress(run)).toBe(50);
    });

    it('handles zero total steps', () => {
        const run = createMockRunState({
            status: 'running',
            completedSteps: 0,
            totalSteps: 0,
        });
        expect(calculateProgress(run)).toBe(50); // Fallback to default
    });
});

// ============================================================================
// Tests: useRunController hook
// ============================================================================

describe('useRunController', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('initializes with empty state', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        expect(result.current.state.run).toBeNull();
        expect(result.current.state.isPolling).toBe(false);
        expect(result.current.isActive).toBe(false);
        expect(result.current.isComplete).toBe(false);
    });

    it('fetches run status on mount', async () => {
        const mockRun = createMockRunState();
        const mockStatusFile = createMockStatusFile(mockRun);

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockStatusFile),
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        await waitFor(() => {
            expect(result.current.state.isReady).toBe(true);
        });

        expect(result.current.state.run).toEqual(mockRun);
        expect(result.current.isActive).toBe(true);
    });

    it('handles 404 gracefully', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        await waitFor(() => {
            expect(result.current.state.isReady).toBe(true);
        });

        expect(result.current.state.run).toBeNull();
        expect(result.current.state.error).toBeNull();
    });

    it('handles fetch errors', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const onError = vi.fn();
        const { result } = renderHook(() => 
            useRunController({ autoPolling: false, onError })
        );

        await waitFor(() => {
            expect(result.current.state.isReady).toBe(true);
        });

        expect(result.current.state.error).toBe('Network error');
        expect(onError).toHaveBeenCalledWith('Network error');
    });

    it('generates command for production run', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        const command = result.current.generateCommand({
            type: 'production',
            pipelineId: 'production-qa-golden',
            sampleId: 'sample-001-geometric',
        });

        expect(command).toContain('--type production');
        expect(command).toContain('--pipeline production-qa-golden');
        expect(command).toContain('--sample sample-001-geometric');
    });

    it('generates command for narrative run', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        const command = result.current.generateCommand({
            type: 'narrative',
            scriptPath: 'config/narrative/demo-three-shot.json',
            verbose: true,
        });

        expect(command).toContain('--type narrative');
        expect(command).toContain('--script config/narrative/demo-three-shot.json');
        expect(command).toContain('--verbose');
    });

    it('includes temporal mode when not auto', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        const command = result.current.generateCommand({
            type: 'production',
            pipelineId: 'production-qa-golden',
            sampleId: 'sample-001-geometric',
            temporalMode: 'on',
        });

        expect(command).toContain('--temporal on');
    });

    it('excludes temporal mode when auto', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        const command = result.current.generateCommand({
            type: 'production',
            pipelineId: 'production-qa-golden',
            sampleId: 'sample-001-geometric',
            temporalMode: 'auto',
        });

        expect(command).not.toContain('--temporal');
    });

    it('includes dry-run flag when specified', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        const command = result.current.generateCommand({
            type: 'production',
            pipelineId: 'production-qa-golden',
            sampleId: 'sample-001-geometric',
            dryRun: true,
        });

        expect(command).toContain('--dry-run');
    });

    it('identifies completed runs correctly', async () => {
        const completedRun = createMockRunState({ status: 'succeeded' });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(createMockStatusFile(completedRun)),
        });

        const { result } = renderHook(() => 
            useRunController({ autoPolling: false })
        );

        await waitFor(() => {
            expect(result.current.state.isReady).toBe(true);
        });

        expect(result.current.isActive).toBe(false);
        expect(result.current.isComplete).toBe(true);
    });

    it('can trigger manual refresh', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const { result } = renderHook(() => useRunController({ autoPolling: false }));

        // Wait for initial load
        await waitFor(() => {
            expect(result.current.state.isReady).toBe(true);
        });

        // Clear mock to track new calls
        (global.fetch as ReturnType<typeof vi.fn>).mockClear();

        // Trigger refresh
        await act(async () => {
            await result.current.refresh();
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
