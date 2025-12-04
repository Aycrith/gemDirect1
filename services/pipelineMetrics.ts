/**
 * Pipeline Metrics Service
 * 
 * Aggregates timing data for chain-of-frames video generation pipeline.
 * Tracks per-shot duration, queue wait times, GPU VRAM usage, and validation results.
 * 
 * @module services/pipelineMetrics
 */

// ============================================================================
// Types
// ============================================================================

export interface ShotMetrics {
    shotId: string;
    shotIndex: number;
    promptId?: string;
    /** Time when shot was queued to ComfyUI */
    queuedAt: number;
    /** Time when ComfyUI started processing (if tracked) */
    startedAt?: number;
    /** Time when generation completed */
    completedAt?: number;
    /** Duration from queue to completion (ms) */
    totalDurationMs?: number;
    /** Time spent waiting in queue (ms) */
    queueWaitMs?: number;
    /** Actual generation time (ms) */
    generationDurationMs?: number;
    /** GPU VRAM at start of generation (bytes) */
    vramBeforeBytes?: number;
    /** GPU VRAM at end of generation (bytes) */
    vramAfterBytes?: number;
    /** Peak GPU VRAM during generation (bytes) */
    vramPeakBytes?: number;
    /** Whether video passed validation */
    validationPassed?: boolean;
    /** Validation errors if any */
    validationErrors?: string[];
    /** Validation warnings if any */
    validationWarnings?: string[];
    /** Error message if generation failed */
    error?: string;
}

export interface PipelineMetrics {
    /** Unique run identifier */
    runId: string;
    /** Scene ID being processed */
    sceneId: string;
    /** Total number of shots in pipeline */
    totalShots: number;
    /** Number of shots completed successfully */
    successfulShots: number;
    /** Number of shots that failed */
    failedShots: number;
    /** Workflow profile used */
    workflowProfile: string;
    /** Pipeline start time */
    startedAt: number;
    /** Pipeline end time */
    completedAt?: number;
    /** Total pipeline duration (ms) */
    totalDurationMs?: number;
    /** Per-shot metrics */
    shots: ShotMetrics[];
    /** Aggregated statistics (calculated on completion) */
    aggregates?: PipelineAggregates;
}

export interface PipelineAggregates {
    /** Average shot duration (ms) */
    avgShotDurationMs: number;
    /** Median shot duration (ms) */
    medianShotDurationMs: number;
    /** P50 shot duration (ms) */
    p50ShotDurationMs: number;
    /** P95 shot duration (ms) */
    p95ShotDurationMs: number;
    /** Min shot duration (ms) */
    minShotDurationMs: number;
    /** Max shot duration (ms) */
    maxShotDurationMs: number;
    /** Average queue wait time (ms) */
    avgQueueWaitMs: number;
    /** Total VRAM consumed (peak - start) across all shots */
    totalVramConsumedBytes?: number;
    /** Validation pass rate (0-1) */
    validationPassRate?: number;
}

// ============================================================================
// In-memory storage for metrics (can be persisted later)
// ============================================================================

const metricsHistory: PipelineMetrics[] = [];
const MAX_HISTORY_SIZE = 50; // Keep last 50 pipeline runs

// Active pipeline tracking
const activePipelines: Map<string, PipelineMetrics> = new Map();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique run ID
 */
export const generateRunId = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `run_${timestamp}_${random}`;
};

/**
 * Calculate percentile from sorted array
 */
const calculatePercentile = (sortedValues: number[], percentile: number): number => {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0;
};

/**
 * Calculate aggregates from shot metrics
 */
const calculateAggregates = (shots: ShotMetrics[]): PipelineAggregates => {
    const completedShots = shots.filter(s => s.totalDurationMs !== undefined);
    const durations = completedShots
        .map(s => s.totalDurationMs!)
        .sort((a, b) => a - b);
    
    const queueWaits = completedShots
        .filter(s => s.queueWaitMs !== undefined)
        .map(s => s.queueWaitMs!);
    
    const vramDeltas = completedShots
        .filter(s => s.vramBeforeBytes !== undefined && s.vramAfterBytes !== undefined)
        .map(s => (s.vramAfterBytes! - s.vramBeforeBytes!));
    
    const validatedShots = shots.filter(s => s.validationPassed !== undefined);
    const passedValidation = validatedShots.filter(s => s.validationPassed === true);
    
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => arr.length > 0 ? sum(arr) / arr.length : 0;
    
    return {
        avgShotDurationMs: avg(durations),
        medianShotDurationMs: calculatePercentile(durations, 50),
        p50ShotDurationMs: calculatePercentile(durations, 50),
        p95ShotDurationMs: calculatePercentile(durations, 95),
        minShotDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
        maxShotDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
        avgQueueWaitMs: avg(queueWaits),
        totalVramConsumedBytes: vramDeltas.length > 0 ? sum(vramDeltas) : undefined,
        validationPassRate: validatedShots.length > 0 
            ? passedValidation.length / validatedShots.length 
            : undefined,
    };
};

// ============================================================================
// Pipeline Lifecycle Functions
// ============================================================================

/**
 * Start tracking a new pipeline run
 */
export const startPipeline = (
    sceneId: string,
    totalShots: number,
    workflowProfile: string
): PipelineMetrics => {
    const runId = generateRunId();
    const metrics: PipelineMetrics = {
        runId,
        sceneId,
        totalShots,
        successfulShots: 0,
        failedShots: 0,
        workflowProfile,
        startedAt: Date.now(),
        shots: [],
    };
    
    activePipelines.set(runId, metrics);
    console.log(`[PipelineMetrics] Started pipeline ${runId} for scene ${sceneId} with ${totalShots} shots`);
    
    return metrics;
};

/**
 * Record when a shot is queued
 */
export const recordShotQueued = (
    runId: string,
    shotId: string,
    shotIndex: number,
    promptId?: string,
    vramBeforeBytes?: number
): ShotMetrics | null => {
    const pipeline = activePipelines.get(runId);
    if (!pipeline) {
        console.warn(`[PipelineMetrics] Pipeline ${runId} not found`);
        return null;
    }
    
    const shotMetrics: ShotMetrics = {
        shotId,
        shotIndex,
        promptId,
        queuedAt: Date.now(),
        vramBeforeBytes,
    };
    
    pipeline.shots.push(shotMetrics);
    return shotMetrics;
};

/**
 * Record when a shot starts processing (if ComfyUI provides this info)
 */
export const recordShotStarted = (runId: string, shotId: string): void => {
    const pipeline = activePipelines.get(runId);
    if (!pipeline) return;
    
    const shot = pipeline.shots.find(s => s.shotId === shotId);
    if (shot) {
        shot.startedAt = Date.now();
        shot.queueWaitMs = shot.startedAt - shot.queuedAt;
    }
};

/**
 * Record when a shot completes
 */
export const recordShotCompleted = (
    runId: string,
    shotId: string,
    success: boolean,
    vramAfterBytes?: number,
    vramPeakBytes?: number,
    error?: string
): void => {
    const pipeline = activePipelines.get(runId);
    if (!pipeline) return;
    
    const shot = pipeline.shots.find(s => s.shotId === shotId);
    if (shot) {
        shot.completedAt = Date.now();
        shot.totalDurationMs = shot.completedAt - shot.queuedAt;
        shot.vramAfterBytes = vramAfterBytes;
        shot.vramPeakBytes = vramPeakBytes;
        
        if (shot.startedAt) {
            shot.generationDurationMs = shot.completedAt - shot.startedAt;
        }
        
        if (!success) {
            shot.error = error;
            pipeline.failedShots++;
        } else {
            pipeline.successfulShots++;
        }
    }
};

/**
 * Record validation results for a shot
 */
export const recordShotValidation = (
    runId: string,
    shotId: string,
    passed: boolean,
    errors?: string[],
    warnings?: string[]
): void => {
    const pipeline = activePipelines.get(runId);
    if (!pipeline) return;
    
    const shot = pipeline.shots.find(s => s.shotId === shotId);
    if (shot) {
        shot.validationPassed = passed;
        shot.validationErrors = errors;
        shot.validationWarnings = warnings;
    }
};

/**
 * Complete a pipeline run and calculate aggregates
 */
export const completePipeline = (runId: string): PipelineMetrics | null => {
    const pipeline = activePipelines.get(runId);
    if (!pipeline) {
        console.warn(`[PipelineMetrics] Pipeline ${runId} not found`);
        return null;
    }
    
    pipeline.completedAt = Date.now();
    pipeline.totalDurationMs = pipeline.completedAt - pipeline.startedAt;
    pipeline.aggregates = calculateAggregates(pipeline.shots);
    
    // Move to history
    metricsHistory.unshift(pipeline);
    if (metricsHistory.length > MAX_HISTORY_SIZE) {
        metricsHistory.pop();
    }
    
    activePipelines.delete(runId);
    
    console.log(`[PipelineMetrics] Completed pipeline ${runId}:`, {
        totalDurationMs: pipeline.totalDurationMs,
        successfulShots: pipeline.successfulShots,
        failedShots: pipeline.failedShots,
        avgShotDurationMs: pipeline.aggregates?.avgShotDurationMs,
        p95ShotDurationMs: pipeline.aggregates?.p95ShotDurationMs,
    });
    
    return pipeline;
};

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get the current active pipeline for a scene
 */
export const getActivePipeline = (runId: string): PipelineMetrics | undefined => {
    return activePipelines.get(runId);
};

/**
 * Get all active pipelines
 */
export const getAllActivePipelines = (): PipelineMetrics[] => {
    return Array.from(activePipelines.values());
};

/**
 * Get pipeline history
 */
export const getPipelineHistory = (limit: number = 10): PipelineMetrics[] => {
    return metricsHistory.slice(0, limit);
};

/**
 * Get aggregated stats across all historical runs
 */
export const getGlobalStats = (): {
    totalRuns: number;
    totalShots: number;
    overallSuccessRate: number;
    avgPipelineDurationMs: number;
    avgShotDurationMs: number;
    p50ShotDurationMs: number;
    p95ShotDurationMs: number;
} => {
    if (metricsHistory.length === 0) {
        return {
            totalRuns: 0,
            totalShots: 0,
            overallSuccessRate: 0,
            avgPipelineDurationMs: 0,
            avgShotDurationMs: 0,
            p50ShotDurationMs: 0,
            p95ShotDurationMs: 0,
        };
    }
    
    const totalShots = metricsHistory.reduce((sum, p) => sum + p.totalShots, 0);
    const successfulShots = metricsHistory.reduce((sum, p) => sum + p.successfulShots, 0);
    
    const pipelineDurations = metricsHistory
        .filter(p => p.totalDurationMs !== undefined)
        .map(p => p.totalDurationMs!);
    
    const allShotDurations = metricsHistory
        .flatMap(p => p.shots)
        .filter(s => s.totalDurationMs !== undefined)
        .map(s => s.totalDurationMs!)
        .sort((a, b) => a - b);
    
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => arr.length > 0 ? sum(arr) / arr.length : 0;
    
    return {
        totalRuns: metricsHistory.length,
        totalShots,
        overallSuccessRate: totalShots > 0 ? successfulShots / totalShots : 0,
        avgPipelineDurationMs: avg(pipelineDurations),
        avgShotDurationMs: avg(allShotDurations),
        p50ShotDurationMs: calculatePercentile(allShotDurations, 50),
        p95ShotDurationMs: calculatePercentile(allShotDurations, 95),
    };
};

/**
 * Clear all metrics history (useful for testing)
 */
export const clearMetricsHistory = (): void => {
    metricsHistory.length = 0;
    activePipelines.clear();
};

/**
 * Export metrics for external analysis
 */
export const exportMetrics = (): {
    activePipelines: PipelineMetrics[];
    history: PipelineMetrics[];
    globalStats: ReturnType<typeof getGlobalStats>;
} => {
    return {
        activePipelines: getAllActivePipelines(),
        history: getPipelineHistory(MAX_HISTORY_SIZE),
        globalStats: getGlobalStats(),
    };
};

// ============================================================================
// Compatibility Aliases
// ============================================================================

/**
 * Alias for getPipelineHistory for backward compatibility
 * @deprecated Use getPipelineHistory instead
 */
export const getHistory = getPipelineHistory;

/**
 * Type alias for global stats return type
 */
export type GlobalPipelineStats = ReturnType<typeof getGlobalStats>;
