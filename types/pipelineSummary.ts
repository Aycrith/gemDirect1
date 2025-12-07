/**
 * Pipeline Summary Types
 * 
 * TypeScript types for production and narrative pipeline summaries.
 * These match the JSON structures in public/latest-*-summary(-lite).json files.
 * 
 * @module types/pipelineSummary
 */

// ============================================================================
// Preflight Types
// ============================================================================

/**
 * Preflight check results from pipeline runs
 */
export interface PreflightInfo {
    /** FFmpeg version string */
    ffmpegVersion?: string;
    /** Whether ffmpeg supports tmix normalize=1 */
    tmixNormalizeSupported?: boolean;
    /** Vision LLM endpoint URL */
    vlmEndpoint?: string;
    /** Whether VLM is reachable */
    vlmReachable?: boolean;
    /** Any preflight warnings */
    warnings?: string[];
}

/**
 * Standalone preflight status file structure
 * Sourced from: public/preflight-status.json
 */
export interface PreflightStatusFile {
    /** Schema version */
    version: string;
    /** When the preflight was generated */
    generatedAt: string;
    /** Preflight check results */
    result: PreflightInfo;
}

// ============================================================================
// Production Summary Types
// ============================================================================

/**
 * Lite version of production run summary (smaller payload)
 * Sourced from: public/latest-run-summary-lite.json
 */
export interface ProductionSummaryLite {
    /** Pipeline identifier */
    pipelineId?: string;
    /** Run start time (ISO string) */
    startedAt?: string;
    /** Run finish time (ISO string) */
    finishedAt?: string;
    /** Run status */
    status?: 'succeeded' | 'failed' | 'running' | 'pending';
    /** Path to output video */
    videoPath?: string;
    /** Vision QA status */
    visionQaStatus?: 'PASS' | 'FAIL' | 'SKIP' | string;
    /** Path to benchmark JSON */
    benchmarkJsonPath?: string;
    /** Warnings from the run */
    warnings?: string[];
    /** Preflight check results (included when fetching full summaries) */
    preflight?: PreflightInfo;
}

/**
 * Full production run summary
 * Sourced from: public/latest-run-summary.json
 */
export interface ProductionSummary extends ProductionSummaryLite {
    /** Sample name */
    sample?: string;
    /** Run directory */
    runDir?: string;
    /** Original video path (before temporal smoothing) */
    originalVideoPath?: string;
    /** Whether temporal regularization was applied */
    temporalRegularizationApplied?: boolean;
    /** Path to vision QA results */
    visionQaResultsPath?: string;
    /** Path to benchmark report (markdown) */
    benchmarkReportPath?: string;
    /** Path to manifest file */
    manifestPath?: string;
    /** Preflight check results */
    preflight?: PreflightInfo;
}

// ============================================================================
// Narrative Summary Types
// ============================================================================

/**
 * Shot info in narrative lite summary
 */
export interface NarrativeShotLite {
    /** Shot identifier */
    shotId: string;
    /** Whether temporal regularization was applied */
    temporalApplied?: boolean;
    /** Path to output video (smoothed if temporal applied) */
    videoPath?: string;
    /** Path to original video (before smoothing) */
    originalVideoPath?: string;
    /** Warning about temporal skip */
    temporalWarning?: string;
}

/**
 * Lite version of narrative run summary (smaller payload)
 * Sourced from: public/latest-narrative-summary-lite.json
 */
export interface NarrativeSummaryLite {
    /** Narrative identifier */
    narrativeId?: string;
    /** Narrative title */
    title?: string;
    /** Run start time (ISO string) */
    startedAt?: string;
    /** Run finish time (ISO string) */
    finishedAt?: string;
    /** Run status */
    status?: 'succeeded' | 'failed' | 'running' | 'pending';
    /** Path to final concatenated video */
    finalVideoPath?: string;
    /** Shot results (lite) */
    shots?: NarrativeShotLite[];
    /** Preflight check results (may be present in lite summaries) */
    preflight?: PreflightInfo;
    /** Warnings from the run */
    warnings?: string[];
}

/**
 * Shot artifact info in full narrative summary
 */
export interface NarrativeShotArtifact {
    /** Shot identifier */
    shotId: string;
    /** Pipeline config used */
    pipelineConfigId?: string;
    /** Shot status */
    status?: 'succeeded' | 'failed' | 'skipped';
    /** Run directory */
    runDir?: string;
    /** Path to output video */
    videoPath?: string;
    /** Path to original video (before smoothing) */
    originalVideoPath?: string;
    /** Whether temporal regularization was applied */
    temporalRegularizationApplied?: boolean;
    /** Reason temporal was skipped */
    temporalSkipReason?: string;
    /** Path to vision QA results */
    visionQaPath?: string;
    /** Path to benchmark JSON */
    benchmarkPath?: string;
    /** Path to manifest file */
    manifestPath?: string;
}

/**
 * QA summary for a single shot
 */
export interface ShotQaSummary {
    /** Shot identifier */
    shotId: string;
    /** Pipeline config used */
    pipelineConfigId?: string;
    /** Whether temporal regularization was applied */
    temporalRegularizationApplied?: boolean;
    /** QA metrics */
    metrics?: Record<string, unknown>;
    /** QA verdict */
    verdict?: 'PASS' | 'FAIL' | 'SKIP';
    /** Reasons for verdict */
    verdictReasons?: string[];
}

/**
 * Overall QA summary
 */
export interface NarrativeQaSummary {
    /** Overall verdict */
    overallVerdict?: 'PASS' | 'FAIL' | 'PARTIAL';
    /** Reasons for overall verdict */
    overallReasons?: string[];
    /** Per-shot QA summaries */
    shots?: ShotQaSummary[];
}

/**
 * Full narrative run summary
 * Sourced from: public/latest-narrative-summary.json
 */
export interface NarrativeSummary extends NarrativeSummaryLite {
    /** Script path */
    scriptPath?: string;
    /** Total duration in milliseconds */
    totalDurationMs?: number;
    /** Total shot count */
    shotCount?: number;
    /** Number of successful shots */
    successfulShots?: number;
    /** Number of failed shots */
    failedShots?: number;
    /** Shot metrics (minimal) */
    shotMetrics?: Array<{ shotId: string }>;
    /** Detailed shot artifacts */
    shotArtifacts?: NarrativeShotArtifact[];
    /** QA summary */
    qaSummary?: NarrativeQaSummary;
}

// ============================================================================
// Combined Summary State
// ============================================================================

/**
 * State for both summaries with metadata
 */
export interface PipelineSummariesState {
    /** Production summary data */
    production: ProductionSummaryLite | null;
    /** Narrative summary data */
    narrative: NarrativeSummaryLite | null;
    /** Standalone preflight from preflight-status.json (when available) */
    standalonePreflight: PreflightInfo | null;
    /** Merged preflight: prefers standalone, falls back to production summary preflight */
    mergedPreflight: PreflightInfo | null;
    /** Whether fetching is in progress */
    loading: boolean;
    /** Fetch error (if any) */
    error: string | null;
    /** Last fetch timestamp */
    lastFetchedAt: number | null;
    /** Whether production summary is stale */
    productionStale: boolean;
    /** Whether narrative summary is stale */
    narrativeStale: boolean;
    /** Age of production summary in ms (null if unavailable) */
    productionAgeMs: number | null;
    /** Age of narrative summary in ms (null if unavailable) */
    narrativeAgeMs: number | null;
}

// ============================================================================
// Staleness Configuration
// ============================================================================

/**
 * Default staleness threshold (24 hours in milliseconds)
 * 
 * NOTE: Phase 2 may want to make this configurable via settings.
 * For now, 24 hours is reasonable for development workflows.
 */
export const DEFAULT_STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Calculate age of a summary based on finishedAt timestamp
 */
export function calculateSummaryAge(finishedAt: string | undefined): number | null {
    if (!finishedAt) return null;
    try {
        const finishedDate = new Date(finishedAt);
        if (isNaN(finishedDate.getTime())) return null;
        return Date.now() - finishedDate.getTime();
    } catch {
        return null;
    }
}

/**
 * Check if a summary is stale based on threshold
 */
export function isSummaryStale(
    finishedAt: string | undefined,
    thresholdMs: number = DEFAULT_STALENESS_THRESHOLD_MS
): boolean {
    const age = calculateSummaryAge(finishedAt);
    return age === null || age > thresholdMs;
}

/**
 * Format age as human-readable string
 */
export function formatAge(ageMs: number | null): string {
    if (ageMs === null) return 'unknown';
    
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ago`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
}
