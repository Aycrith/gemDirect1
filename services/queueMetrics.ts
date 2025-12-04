/**
 * Queue Metrics Service
 * 
 * Extends pipelineMetrics with generation queue-specific telemetry.
 * Tracks queue depth, wait times, circuit breaker events, and throughput.
 * 
 * @module services/queueMetrics
 */

import { GenerationType, GenerationPriority, QueueState, VRAMStatus } from './generationQueue';

// ============================================================================
// Types
// ============================================================================

export interface QueueEvent {
    /** Event type */
    type: 'enqueue' | 'dequeue' | 'complete' | 'fail' | 'cancel' | 'timeout' | 'circuit-open' | 'circuit-close' | 'vram-gate';
    /** Timestamp */
    timestamp: number;
    /** Task ID if applicable */
    taskId?: string;
    /** Task type */
    taskType?: GenerationType;
    /** Priority */
    priority?: GenerationPriority;
    /** Additional data */
    data?: Record<string, unknown>;
}

export interface QueueSnapshot {
    /** Timestamp of snapshot */
    timestamp: number;
    /** Queue depth at this moment */
    depth: number;
    /** Is task running */
    isRunning: boolean;
    /** Consecutive failures */
    consecutiveFailures: number;
    /** Circuit breaker state */
    isCircuitOpen: boolean;
    /** VRAM status if available */
    vram?: VRAMStatus;
}

export interface QueueMetrics {
    /** Start time for this metrics window */
    windowStartTime: number;
    /** End time for this metrics window (null if still collecting) */
    windowEndTime: number | null;
    /** Total tasks enqueued */
    totalEnqueued: number;
    /** Total tasks completed successfully */
    totalCompleted: number;
    /** Total tasks failed */
    totalFailed: number;
    /** Total tasks cancelled */
    totalCancelled: number;
    /** Total tasks timed out */
    totalTimedOut: number;
    /** Circuit breaker open events */
    circuitBreakerOpenCount: number;
    /** VRAM gate events (blocked due to low VRAM) */
    vramGateCount: number;
    /** Average queue wait time (ms) */
    avgQueueWaitMs: number;
    /** P95 queue wait time (ms) */
    p95QueueWaitMs: number;
    /** Max queue wait time (ms) */
    maxQueueWaitMs: number;
    /** Average execution time (ms) */
    avgExecutionTimeMs: number;
    /** P95 execution time (ms) */
    p95ExecutionTimeMs: number;
    /** Max execution time (ms) */
    maxExecutionTimeMs: number;
    /** Average queue depth */
    avgQueueDepth: number;
    /** Max queue depth observed */
    maxQueueDepth: number;
    /** Throughput (tasks/minute) */
    throughputPerMinute: number;
    /** Success rate (0-1) */
    successRate: number;
    /** Events log */
    events: QueueEvent[];
    /** Periodic snapshots */
    snapshots: QueueSnapshot[];
}

export interface QueueMetricsSummary {
    /** Current queue state */
    currentState: QueueState | null;
    /** Current window metrics */
    currentWindow: QueueMetrics;
    /** Historical windows (rolling buffer) */
    historicalWindows: QueueMetrics[];
    /** All-time aggregate metrics */
    lifetime: {
        totalEnqueued: number;
        totalCompleted: number;
        totalFailed: number;
        successRate: number;
        avgQueueWaitMs: number;
        avgExecutionTimeMs: number;
    };
}

// ============================================================================
// Configuration
// ============================================================================

/** Metrics window duration (5 minutes) */
const WINDOW_DURATION_MS = 5 * 60 * 1000;

/** Max events to keep per window */
const MAX_EVENTS_PER_WINDOW = 500;

/** Max snapshots to keep per window */
const MAX_SNAPSHOTS_PER_WINDOW = 60; // 1 per 5 seconds for 5 minutes

/** Number of historical windows to keep */
const MAX_HISTORICAL_WINDOWS = 12; // 1 hour of history

/** Snapshot interval (5 seconds) */
const SNAPSHOT_INTERVAL_MS = 5000;

// ============================================================================
// Queue Metrics Collector
// ============================================================================

class QueueMetricsCollector {
    private currentWindow: QueueMetrics;
    private historicalWindows: QueueMetrics[] = [];
    private lifetimeStats = {
        totalEnqueued: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalCancelled: 0,
        totalWaitTimeMs: 0,
        totalExecutionTimeMs: 0,
        completedCount: 0, // For average calculation
    };
    private waitTimes: number[] = [];
    private executionTimes: number[] = [];
    private depthSamples: number[] = [];
    private currentQueueState: QueueState | null = null;
    private snapshotIntervalId: NodeJS.Timeout | null = null;

    constructor() {
        this.currentWindow = this.createEmptyWindow();
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    /**
     * Start collecting metrics with periodic snapshots
     */
    start(getState: () => QueueState | null): void {
        this.snapshotIntervalId = setInterval(() => {
            const state = getState();
            this.currentQueueState = state;
            this.takeSnapshot(state);
        }, SNAPSHOT_INTERVAL_MS);
    }

    /**
     * Stop collecting metrics
     */
    stop(): void {
        if (this.snapshotIntervalId) {
            clearInterval(this.snapshotIntervalId);
            this.snapshotIntervalId = null;
        }
    }

    // -------------------------------------------------------------------------
    // Event Recording
    // -------------------------------------------------------------------------

    /**
     * Record task enqueued
     */
    recordEnqueue(taskId: string, type: GenerationType, priority: GenerationPriority): void {
        this.addEvent({
            type: 'enqueue',
            timestamp: Date.now(),
            taskId,
            taskType: type,
            priority,
        });
        this.currentWindow.totalEnqueued++;
        this.lifetimeStats.totalEnqueued++;
    }

    /**
     * Record task dequeued (started)
     */
    recordDequeue(taskId: string, waitTimeMs: number): void {
        this.addEvent({
            type: 'dequeue',
            timestamp: Date.now(),
            taskId,
            data: { waitTimeMs },
        });
        this.waitTimes.push(waitTimeMs);
        this.lifetimeStats.totalWaitTimeMs += waitTimeMs;
    }

    /**
     * Record task completed
     */
    recordComplete(taskId: string, executionTimeMs: number): void {
        this.addEvent({
            type: 'complete',
            timestamp: Date.now(),
            taskId,
            data: { executionTimeMs },
        });
        this.currentWindow.totalCompleted++;
        this.lifetimeStats.totalCompleted++;
        this.lifetimeStats.completedCount++;
        this.executionTimes.push(executionTimeMs);
        this.lifetimeStats.totalExecutionTimeMs += executionTimeMs;
    }

    /**
     * Record task failed
     */
    recordFail(taskId: string, error: string): void {
        this.addEvent({
            type: 'fail',
            timestamp: Date.now(),
            taskId,
            data: { error },
        });
        this.currentWindow.totalFailed++;
        this.lifetimeStats.totalFailed++;
    }

    /**
     * Record task cancelled
     */
    recordCancel(taskId: string): void {
        this.addEvent({
            type: 'cancel',
            timestamp: Date.now(),
            taskId,
        });
        this.currentWindow.totalCancelled++;
        this.lifetimeStats.totalCancelled++;
    }

    /**
     * Record task timeout
     */
    recordTimeout(taskId: string, timeoutMs: number): void {
        this.addEvent({
            type: 'timeout',
            timestamp: Date.now(),
            taskId,
            data: { timeoutMs },
        });
        this.currentWindow.totalTimedOut++;
    }

    /**
     * Record circuit breaker open
     */
    recordCircuitOpen(consecutiveFailures: number, resetMs: number): void {
        this.addEvent({
            type: 'circuit-open',
            timestamp: Date.now(),
            data: { consecutiveFailures, resetMs },
        });
        this.currentWindow.circuitBreakerOpenCount++;
    }

    /**
     * Record circuit breaker close
     */
    recordCircuitClose(): void {
        this.addEvent({
            type: 'circuit-close',
            timestamp: Date.now(),
        });
    }

    /**
     * Record VRAM gating event
     */
    recordVRAMGate(freeMB: number, requiredMB: number): void {
        this.addEvent({
            type: 'vram-gate',
            timestamp: Date.now(),
            data: { freeMB, requiredMB },
        });
        this.currentWindow.vramGateCount++;
    }

    // -------------------------------------------------------------------------
    // Snapshot & Window Management
    // -------------------------------------------------------------------------

    /**
     * Take a snapshot of current queue state
     */
    private takeSnapshot(state: QueueState | null): void {
        // Rotate window if needed
        this.rotateWindowIfNeeded();

        const snapshot: QueueSnapshot = {
            timestamp: Date.now(),
            depth: state?.size ?? 0,
            isRunning: state?.isRunning ?? false,
            consecutiveFailures: state?.consecutiveFailures ?? 0,
            isCircuitOpen: state?.isCircuitOpen ?? false,
        };

        this.depthSamples.push(snapshot.depth);
        
        if (this.currentWindow.snapshots.length >= MAX_SNAPSHOTS_PER_WINDOW) {
            this.currentWindow.snapshots.shift();
        }
        this.currentWindow.snapshots.push(snapshot);
    }

    /**
     * Rotate to new window if current window has expired
     */
    private rotateWindowIfNeeded(): void {
        const now = Date.now();
        if (now - this.currentWindow.windowStartTime >= WINDOW_DURATION_MS) {
            this.finalizeCurrentWindow();
            this.historicalWindows.unshift(this.currentWindow);
            
            // Trim historical windows
            if (this.historicalWindows.length > MAX_HISTORICAL_WINDOWS) {
                this.historicalWindows.pop();
            }

            this.currentWindow = this.createEmptyWindow();
            this.waitTimes = [];
            this.executionTimes = [];
            this.depthSamples = [];
        }
    }

    /**
     * Finalize metrics for current window
     */
    private finalizeCurrentWindow(): void {
        const window = this.currentWindow;
        window.windowEndTime = Date.now();

        // Calculate wait time stats
        if (this.waitTimes.length > 0) {
            const sorted = [...this.waitTimes].sort((a, b) => a - b);
            window.avgQueueWaitMs = this.average(sorted);
            window.p95QueueWaitMs = this.percentile(sorted, 95);
            window.maxQueueWaitMs = sorted[sorted.length - 1] ?? 0;
        }

        // Calculate execution time stats
        if (this.executionTimes.length > 0) {
            const sorted = [...this.executionTimes].sort((a, b) => a - b);
            window.avgExecutionTimeMs = this.average(sorted);
            window.p95ExecutionTimeMs = this.percentile(sorted, 95);
            window.maxExecutionTimeMs = sorted[sorted.length - 1] ?? 0;
        }

        // Calculate depth stats
        if (this.depthSamples.length > 0) {
            window.avgQueueDepth = this.average(this.depthSamples);
            window.maxQueueDepth = Math.max(...this.depthSamples);
        }

        // Calculate throughput
        const windowDurationMinutes = (window.windowEndTime - window.windowStartTime) / 60000;
        window.throughputPerMinute = windowDurationMinutes > 0 
            ? window.totalCompleted / windowDurationMinutes 
            : 0;

        // Calculate success rate
        const totalProcessed = window.totalCompleted + window.totalFailed + window.totalCancelled + window.totalTimedOut;
        window.successRate = totalProcessed > 0 
            ? window.totalCompleted / totalProcessed 
            : 0;
    }

    /**
     * Create empty window
     */
    private createEmptyWindow(): QueueMetrics {
        return {
            windowStartTime: Date.now(),
            windowEndTime: null,
            totalEnqueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalCancelled: 0,
            totalTimedOut: 0,
            circuitBreakerOpenCount: 0,
            vramGateCount: 0,
            avgQueueWaitMs: 0,
            p95QueueWaitMs: 0,
            maxQueueWaitMs: 0,
            avgExecutionTimeMs: 0,
            p95ExecutionTimeMs: 0,
            maxExecutionTimeMs: 0,
            avgQueueDepth: 0,
            maxQueueDepth: 0,
            throughputPerMinute: 0,
            successRate: 0,
            events: [],
            snapshots: [],
        };
    }

    /**
     * Add event to current window
     */
    private addEvent(event: QueueEvent): void {
        this.rotateWindowIfNeeded();
        
        if (this.currentWindow.events.length >= MAX_EVENTS_PER_WINDOW) {
            this.currentWindow.events.shift();
        }
        this.currentWindow.events.push(event);
    }

    // -------------------------------------------------------------------------
    // Utility Functions
    // -------------------------------------------------------------------------

    private average(arr: number[]): number {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    private percentile(sortedArr: number[], p: number): number {
        if (sortedArr.length === 0) return 0;
        const index = Math.ceil((p / 100) * sortedArr.length) - 1;
        return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))] ?? 0;
    }

    // -------------------------------------------------------------------------
    // Query Functions
    // -------------------------------------------------------------------------

    /**
     * Get current metrics summary
     */
    getSummary(): QueueMetricsSummary {
        // Update current window aggregates before returning
        this.finalizeCurrentWindow();
        // Reset end time since window is still active
        this.currentWindow.windowEndTime = null;

        const lifetime = this.lifetimeStats;
        const totalProcessed = lifetime.totalCompleted + lifetime.totalFailed;

        return {
            currentState: this.currentQueueState,
            currentWindow: { ...this.currentWindow },
            historicalWindows: this.historicalWindows.map(w => ({ ...w })),
            lifetime: {
                totalEnqueued: lifetime.totalEnqueued,
                totalCompleted: lifetime.totalCompleted,
                totalFailed: lifetime.totalFailed,
                successRate: totalProcessed > 0 
                    ? lifetime.totalCompleted / totalProcessed 
                    : 0,
                avgQueueWaitMs: lifetime.completedCount > 0 
                    ? lifetime.totalWaitTimeMs / lifetime.completedCount 
                    : 0,
                avgExecutionTimeMs: lifetime.completedCount > 0 
                    ? lifetime.totalExecutionTimeMs / lifetime.completedCount 
                    : 0,
            },
        };
    }

    /**
     * Get recent events
     */
    getRecentEvents(limit: number = 50): QueueEvent[] {
        return this.currentWindow.events.slice(-limit);
    }

    /**
     * Get current queue state
     */
    getCurrentState(): QueueState | null {
        return this.currentQueueState;
    }

    /**
     * Export all metrics data
     */
    export(): {
        summary: QueueMetricsSummary;
        currentWindow: QueueMetrics;
        historicalWindows: QueueMetrics[];
        exportedAt: number;
    } {
        return {
            summary: this.getSummary(),
            currentWindow: this.currentWindow,
            historicalWindows: this.historicalWindows,
            exportedAt: Date.now(),
        };
    }

    /**
     * Reset all metrics (useful for testing)
     */
    reset(): void {
        this.currentWindow = this.createEmptyWindow();
        this.historicalWindows = [];
        this.lifetimeStats = {
            totalEnqueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalCancelled: 0,
            totalWaitTimeMs: 0,
            totalExecutionTimeMs: 0,
            completedCount: 0,
        };
        this.waitTimes = [];
        this.executionTimes = [];
        this.depthSamples = [];
        this.currentQueueState = null;
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Global queue metrics collector */
export const queueMetrics = new QueueMetricsCollector();

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Hook queue metrics to a GenerationQueue instance
 * Call this when the queue is created to enable metrics collection
 */
export function hookQueueMetrics(
    queue: {
        subscribe: (listener: (state: QueueState) => void) => () => void;
        getState: () => QueueState;
    }
): () => void {
    // Start periodic snapshots
    queueMetrics.start(() => queue.getState());

    // Subscribe to state changes
    const unsubscribe = queue.subscribe(() => {
        // Snapshot on every state change for more granular data
        // (the periodic snapshot handles regular intervals)
    });

    // Return cleanup function
    return () => {
        unsubscribe();
        queueMetrics.stop();
    };
}

/**
 * Log metrics summary to console (for debugging)
 */
export function logQueueMetrics(): void {
    const summary = queueMetrics.getSummary();
    console.log('[Queue Metrics Summary]', {
        currentState: summary.currentState,
        lifetime: summary.lifetime,
        currentWindow: {
            enqueued: summary.currentWindow.totalEnqueued,
            completed: summary.currentWindow.totalCompleted,
            failed: summary.currentWindow.totalFailed,
            avgWaitMs: summary.currentWindow.avgQueueWaitMs.toFixed(0),
            avgExecMs: summary.currentWindow.avgExecutionTimeMs.toFixed(0),
            throughput: summary.currentWindow.throughputPerMinute.toFixed(2) + '/min',
            circuitBreaks: summary.currentWindow.circuitBreakerOpenCount,
        },
    });
}
