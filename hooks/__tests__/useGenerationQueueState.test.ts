/**
 * Tests for useGenerationQueueState hook
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { 
    useGenerationQueueState, 
    useGenerationQueueActions,
    useGenerationQueue 
} from '../useGenerationQueueState';
import { getGenerationQueue, resetGlobalQueue } from '../../services/generationQueue';
import type { FeatureFlags } from '../../utils/featureFlags';

// Helper to create valid feature flags
const createFlags = (useGenerationQueue: boolean): Partial<FeatureFlags> => ({
    useGenerationQueue,
});

describe('useGenerationQueueState', () => {
    beforeEach(() => {
        resetGlobalQueue();
    });

    afterEach(() => {
        resetGlobalQueue();
    });

    it('should return disabled state when feature flag is off', () => {
        const { result } = renderHook(() => 
            useGenerationQueueState(createFlags(false))
        );

        expect(result.current.isEnabled).toBe(false);
        expect(result.current.size).toBe(0);
        expect(result.current.healthStatus).toBe('healthy');
    });

    it('should return initial queue state when feature flag is on', () => {
        const { result } = renderHook(() => 
            useGenerationQueueState(createFlags(true))
        );

        expect(result.current.isEnabled).toBe(true);
        expect(result.current.size).toBe(0);
        expect(result.current.isRunning).toBe(false);
        expect(result.current.healthStatus).toBe('healthy');
        expect(result.current.successRate).toBe(100);
    });

    it('should update when queue state changes', async () => {
        const { result, unmount } = renderHook(() => 
            useGenerationQueueState(createFlags(true))
        );

        expect(result.current.size).toBe(0);

        // Enqueue a task
        const queue = getGenerationQueue();
        const taskPromise = queue.enqueue({
            id: 'test-task',
            type: 'video',
            priority: 'normal',
            execute: () => new Promise(resolve => setTimeout(resolve, 100)),
        });

        // Wait for state update
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        // Size should reflect queued task
        expect(result.current.size).toBeGreaterThan(0);

        // Cleanup
        queue.cancel('test-task');
        await taskPromise.catch(() => {}); // Ignore cancellation error
        unmount();
    });

    it('should compute health status correctly', async () => {
        const { result, unmount } = renderHook(() => 
            useGenerationQueueState(createFlags(true))
        );

        expect(result.current.healthStatus).toBe('healthy');

        // Simulate failures to trigger health status changes
        const queue = getGenerationQueue();
        
        // First failure
        const task1 = queue.enqueue({
            id: 'fail-1',
            type: 'video',
            priority: 'normal',
            execute: () => Promise.reject(new Error('Fail 1')),
        });
        await task1.catch(() => {});

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
        });

        expect(result.current.consecutiveFailures).toBe(1);
        expect(result.current.healthStatus).toBe('degraded');
        
        // Cleanup
        unmount();
    });

    it('should format times correctly', () => {
        const { result } = renderHook(() => 
            useGenerationQueueState(createFlags(true))
        );

        // Initial state has 0ms times
        expect(result.current.avgWaitTimeFormatted).toBe('0ms');
        expect(result.current.avgExecTimeFormatted).toBe('0ms');
    });
});

describe('useGenerationQueueActions', () => {
    beforeEach(() => {
        resetGlobalQueue();
    });

    afterEach(() => {
        resetGlobalQueue();
    });

    it('should provide cancelTask action', () => {
        const { result, unmount } = renderHook(() => useGenerationQueueActions());
        
        // Verify the action exists and is callable
        expect(typeof result.current.cancelTask).toBe('function');
        
        // Calling with non-existent task should return false
        const cancelled = result.current.cancelTask('non-existent');
        expect(cancelled).toBe(false);
        
        unmount();
    });

    it('should provide cancelAll action', () => {
        const { result, unmount } = renderHook(() => useGenerationQueueActions());
        
        // Verify the action exists and is callable
        expect(typeof result.current.cancelAll).toBe('function');
        
        // Calling on empty queue should return 0
        const cancelled = result.current.cancelAll();
        expect(cancelled).toBe(0);
        
        unmount();
    });

    it('should provide resetCircuitBreaker action', () => {
        const { result, unmount } = renderHook(() => useGenerationQueueActions());
        
        // Verify the action exists and is callable
        expect(typeof result.current.resetCircuitBreaker).toBe('function');
        
        // Reset should not throw
        expect(() => result.current.resetCircuitBreaker()).not.toThrow();
        
        unmount();
    });

    it('should provide clearQueue action', () => {
        const { result, unmount } = renderHook(() => useGenerationQueueActions());
        
        // Verify the action exists and is callable
        expect(typeof result.current.clearQueue).toBe('function');
        
        // Clear should not throw
        expect(() => result.current.clearQueue()).not.toThrow();
        
        unmount();
    });
});

describe('useGenerationQueue (combined)', () => {
    beforeEach(() => {
        resetGlobalQueue();
    });

    afterEach(() => {
        resetGlobalQueue();
    });

    it('should provide both state and actions', () => {
        const { result, unmount } = renderHook(() => 
            useGenerationQueue(createFlags(true))
        );

        // State properties
        expect(result.current.isEnabled).toBe(true);
        expect(result.current.size).toBe(0);
        expect(result.current.healthStatus).toBe('healthy');

        // Action methods
        expect(typeof result.current.cancelTask).toBe('function');
        expect(typeof result.current.cancelAll).toBe('function');
        expect(typeof result.current.resetCircuitBreaker).toBe('function');
        expect(typeof result.current.clearQueue).toBe('function');
        
        // Cleanup
        unmount();
    });
});
