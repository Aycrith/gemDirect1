/**
 * Run Controller Hook
 * 
 * React hook for monitoring and interacting with pipeline runs.
 * Polls run-status.json for status updates and provides run state to the UI.
 * 
 * NOTE: This hook does NOT spawn processes directly (browser limitation).
 * Actual run spawning is done via:
 * - VS Code tasks (recommended for dev)
 * - scripts/run-controller.ts (CLI)
 * - Future: Server-side endpoint
 * 
 * Phase 2: Run Launchers & Orchestration
 * 
 * @module hooks/useRunController
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
    RunState,
    RunStatusFile,
    RunRequest,
} from '../types/pipelineRun';
import {
    RUN_STATUS_POLL_INTERVAL_MS,
    RUN_STATUS_FILE_PATH,
    isRunActive,
    isRunComplete,
} from '../types/pipelineRun';

// ============================================================================
// Configuration
// ============================================================================

/** URL to fetch run status */
const RUN_STATUS_URL = RUN_STATUS_FILE_PATH; // '/run-status.json'

// ============================================================================
// Hook Options
// ============================================================================

export interface UseRunControllerOptions {
    /** Enable polling when run is active (default: true) */
    autoPolling?: boolean;
    /** Polling interval in ms (default: 1000) */
    pollIntervalMs?: number;
    /** Callback when run status changes */
    onStatusChange?: (run: RunState | null) => void;
    /** Callback when run completes */
    onComplete?: (run: RunState) => void;
    /** Callback on fetch error */
    onError?: (error: string) => void;
}

// ============================================================================
// State Interface
// ============================================================================

export interface RunControllerState {
    /** Current run state, or null if no active run */
    run: RunState | null;
    /** Whether we're currently polling for updates */
    isPolling: boolean;
    /** Last time we fetched status */
    lastFetchedAt: string | null;
    /** Error message if status fetch failed */
    error: string | null;
    /** Whether initial load is complete */
    isReady: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for monitoring and interacting with pipeline runs.
 * 
 * @example
 * ```tsx
 * const { run, isPolling, refresh, generateCommand } = useRunController({
 *     onComplete: (run) => {
 *         if (run.status === 'succeeded') {
 *             // Refresh summaries
 *         }
 *     }
 * });
 * 
 * // Display run status
 * if (run?.status === 'running') {
 *     return <div>Running: {run.currentStep}</div>;
 * }
 * 
 * // Generate command for user to run
 * const cmd = generateCommand({ type: 'production', pipelineId: 'production-qa-golden', sampleId: 'sample-001-geometric' });
 * // cmd = 'npx tsx scripts/run-controller.ts --type production --pipeline production-qa-golden --sample sample-001-geometric'
 * ```
 */
export function useRunController(options: UseRunControllerOptions = {}): {
    state: RunControllerState;
    refresh: () => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
    isActive: boolean;
    isComplete: boolean;
    generateCommand: (request: RunRequest) => string;
    copyCommand: (request: RunRequest) => Promise<void>;
} {
    const {
        autoPolling = true,
        pollIntervalMs = RUN_STATUS_POLL_INTERVAL_MS,
        onStatusChange,
        onComplete,
        onError,
    } = options;

    // State
    const [state, setState] = useState<RunControllerState>({
        run: null,
        isPolling: false,
        lastFetchedAt: null,
        error: null,
        isReady: false,
    });

    // Refs for callbacks to avoid stale closures
    const onStatusChangeRef = useRef(onStatusChange);
    const onCompleteRef = useRef(onComplete);
    const onErrorRef = useRef(onError);
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Keep refs updated
    useEffect(() => {
        onStatusChangeRef.current = onStatusChange;
        onCompleteRef.current = onComplete;
        onErrorRef.current = onError;
    }, [onStatusChange, onComplete, onError]);

    // Fetch run status
    const fetchStatus = useCallback(async (): Promise<void> => {
        try {
            const response = await fetch(RUN_STATUS_URL, {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // No status file yet - that's OK
                    setState(prev => ({
                        ...prev,
                        run: null,
                        lastFetchedAt: new Date().toISOString(),
                        error: null,
                        isReady: true,
                    }));
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: RunStatusFile = await response.json();
            const newRun = data.run;

            setState(prev => {
                const prevStatus = prev.run?.status;
                const newStatus = newRun?.status;

                // Detect status change
                if (prevStatus !== newStatus && newRun) {
                    // Call status change callback
                    onStatusChangeRef.current?.(newRun);

                    // Call complete callback if run just finished
                    if (prevStatus && isRunActive(prevStatus as any) && newStatus && isRunComplete(newStatus)) {
                        onCompleteRef.current?.(newRun);
                    }
                }

                return {
                    ...prev,
                    run: newRun,
                    lastFetchedAt: new Date().toISOString(),
                    error: null,
                    isReady: true,
                };
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setState(prev => ({
                ...prev,
                error: message,
                isReady: true,
            }));
            onErrorRef.current?.(message);
        }
    }, []);

    // Manual refresh
    const refresh = useCallback(async (): Promise<void> => {
        await fetchStatus();
    }, [fetchStatus]);

    // Start polling
    const startPolling = useCallback((): void => {
        if (pollingIntervalRef.current) return; // Already polling

        setState(prev => ({ ...prev, isPolling: true }));
        pollingIntervalRef.current = setInterval(fetchStatus, pollIntervalMs);
    }, [fetchStatus, pollIntervalMs]);

    // Stop polling
    const stopPolling = useCallback((): void => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setState(prev => ({ ...prev, isPolling: false }));
    }, []);

    // Generate command string for a run request
    const generateCommand = useCallback((request: RunRequest): string => {
        const parts = ['npx tsx scripts/run-controller.ts'];

        if (request.type === 'production') {
            parts.push('--type production');
            parts.push(`--pipeline ${request.pipelineId}`);
            parts.push(`--sample ${request.sampleId}`);
        } else if (request.type === 'narrative') {
            parts.push('--type narrative');
            parts.push(`--script ${request.scriptPath}`);
        }

        if (request.temporalMode && request.temporalMode !== 'auto') {
            parts.push(`--temporal ${request.temporalMode}`);
        }

        if (request.verbose) {
            parts.push('--verbose');
        }

        if (request.dryRun) {
            parts.push('--dry-run');
        }

        return parts.join(' ');
    }, []);

    // Copy command to clipboard
    const copyCommand = useCallback(async (request: RunRequest): Promise<void> => {
        const command = generateCommand(request);
        try {
            await navigator.clipboard.writeText(command);
        } catch {
            // Fallback for browsers without clipboard API
            console.log('Command:', command);
        }
    }, [generateCommand]);

    // Initial fetch
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Auto-polling based on run state
    useEffect(() => {
        if (!autoPolling) return;

        const runIsActive = state.run && isRunActive(state.run.status);

        if (runIsActive && !state.isPolling) {
            startPolling();
        } else if (!runIsActive && state.isPolling) {
            stopPolling();
        }
    }, [autoPolling, state.run, state.isPolling, startPolling, stopPolling]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    // Computed values
    const isActive = state.run ? isRunActive(state.run.status) : false;
    const isComplete = state.run ? isRunComplete(state.run.status) : false;

    return {
        state,
        refresh,
        startPolling,
        stopPolling,
        isActive,
        isComplete,
        generateCommand,
        copyCommand,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format run status for display
 */
export function formatRunStatus(status: string | undefined): { text: string; emoji: string; color: string } {
    switch (status) {
        case 'queued':
            return { text: 'Queued', emoji: '⏳', color: 'text-yellow-600' };
        case 'running':
            return { text: 'Running', emoji: '🔄', color: 'text-blue-600' };
        case 'succeeded':
            return { text: 'Succeeded', emoji: '✅', color: 'text-green-600' };
        case 'failed':
            return { text: 'Failed', emoji: '❌', color: 'text-red-600' };
        case 'cancelled':
            return { text: 'Cancelled', emoji: '🛑', color: 'text-gray-600' };
        default:
            return { text: 'Unknown', emoji: '❓', color: 'text-gray-400' };
    }
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number | undefined): string {
    if (ms === undefined) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(run: RunState | null): number {
    if (!run) return 0;
    if (run.status === 'succeeded') return 100;
    if (run.status === 'failed' || run.status === 'cancelled') return 0;
    if (run.completedSteps !== undefined && run.totalSteps !== undefined && run.totalSteps > 0) {
        return Math.round((run.completedSteps / run.totalSteps) * 100);
    }
    return run.status === 'running' ? 50 : 0; // Default to 50% if running but no step info
}
