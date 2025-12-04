/**
 * React Hook for Generation Queue State
 * 
 * Provides reactive access to the GenerationQueue state, automatically
 * re-rendering components when queue state changes.
 * 
 * @module hooks/useGenerationQueueState
 */

import { useState, useEffect, useCallback } from 'react';
import { getGenerationQueue, QueueState } from '../services/generationQueue';
import { isFeatureEnabled, FeatureFlags } from '../utils/featureFlags';

/**
 * Extended queue state with computed properties
 */
export interface GenerationQueueUIState extends QueueState {
    /** Whether queue feature is enabled */
    isEnabled: boolean;
    /** Number of pending tasks (not including running) */
    pendingCount: number;
    /** Success rate percentage (0-100) */
    successRate: number;
    /** Formatted average wait time */
    avgWaitTimeFormatted: string;
    /** Formatted average execution time */
    avgExecTimeFormatted: string;
    /** Health status: 'healthy' | 'degraded' | 'failing' | 'circuit-open' */
    healthStatus: 'healthy' | 'degraded' | 'failing' | 'circuit-open';
}

/**
 * Format milliseconds to human-readable string
 */
function formatMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Compute health status from queue state
 */
function computeHealthStatus(state: QueueState): GenerationQueueUIState['healthStatus'] {
    if (state.isCircuitOpen) return 'circuit-open';
    if (state.consecutiveFailures >= 3) return 'failing';
    if (state.consecutiveFailures >= 1) return 'degraded';
    return 'healthy';
}

/**
 * Extend QueueState with computed properties
 */
function extendQueueState(state: QueueState, isEnabled: boolean): GenerationQueueUIState {
    const totalAttempted = state.stats.totalCompleted + state.stats.totalFailed;
    const successRate = totalAttempted > 0 
        ? (state.stats.totalCompleted / totalAttempted) * 100 
        : 100;
    
    return {
        ...state,
        isEnabled,
        pendingCount: Math.max(0, state.size - (state.isRunning ? 1 : 0)),
        successRate,
        avgWaitTimeFormatted: formatMs(state.stats.averageWaitTimeMs),
        avgExecTimeFormatted: formatMs(state.stats.averageExecutionTimeMs),
        healthStatus: computeHealthStatus(state),
    };
}

/**
 * Create initial state when queue is disabled
 */
function createDisabledState(): GenerationQueueUIState {
    return {
        isEnabled: false,
        size: 0,
        isRunning: false,
        currentTaskId: null,
        isCircuitOpen: false,
        consecutiveFailures: 0,
        pendingCount: 0,
        successRate: 100,
        avgWaitTimeFormatted: '0ms',
        avgExecTimeFormatted: '0ms',
        healthStatus: 'healthy',
        stats: {
            totalQueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalCancelled: 0,
            averageWaitTimeMs: 0,
            averageExecutionTimeMs: 0,
        },
    };
}

/**
 * Hook to subscribe to generation queue state changes.
 * 
 * @param featureFlags - Feature flags to check if queue is enabled
 * @returns Current queue state with computed properties
 * 
 * @example
 * ```tsx
 * const { isEnabled, size, healthStatus } = useGenerationQueueState(settings.featureFlags);
 * 
 * return (
 *   <div>
 *     {isEnabled && (
 *       <span className={`status-${healthStatus}`}>
 *         Queue: {size} items
 *       </span>
 *     )}
 *   </div>
 * );
 * ```
 */
export function useGenerationQueueState(
    featureFlags?: Partial<FeatureFlags>
): GenerationQueueUIState {
    const isEnabled = isFeatureEnabled(featureFlags, 'useGenerationQueue');
    
    const [state, setState] = useState<GenerationQueueUIState>(() => {
        if (!isEnabled) return createDisabledState();
        const queue = getGenerationQueue();
        return extendQueueState(queue.getState(), true);
    });

    useEffect(() => {
        if (!isEnabled) {
            setState(createDisabledState());
            return;
        }

        const queue = getGenerationQueue();
        
        // Set initial state
        setState(extendQueueState(queue.getState(), true));
        
        // Subscribe to updates
        const unsubscribe = queue.subscribe((queueState) => {
            setState(extendQueueState(queueState, true));
        });

        return unsubscribe;
    }, [isEnabled]);

    return state;
}

/**
 * Hook to get queue actions (cancel, reset circuit breaker).
 * 
 * @returns Object with queue action methods
 */
export function useGenerationQueueActions() {
    const cancelTask = useCallback((taskId: string): boolean => {
        const queue = getGenerationQueue();
        return queue.cancel(taskId);
    }, []);

    const cancelAll = useCallback((): number => {
        const queue = getGenerationQueue();
        return queue.cancelAll();
    }, []);

    const resetCircuitBreaker = useCallback(() => {
        const queue = getGenerationQueue();
        queue.resetCircuitBreaker();
    }, []);

    const clearQueue = useCallback(() => {
        const queue = getGenerationQueue();
        queue.clear();
    }, []);

    return {
        cancelTask,
        cancelAll,
        resetCircuitBreaker,
        clearQueue,
    };
}

/**
 * Combined hook for both state and actions
 */
export function useGenerationQueue(featureFlags?: Partial<FeatureFlags>) {
    const state = useGenerationQueueState(featureFlags);
    const actions = useGenerationQueueActions();
    
    return {
        ...state,
        ...actions,
    };
}

export default useGenerationQueueState;
