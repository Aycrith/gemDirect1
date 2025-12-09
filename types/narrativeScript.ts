/**
 * Narrative Script Types
 * 
 * Defines the schema for multi-shot narrative scripts.
 * A narrative script describes a sequence of shots that form a short video,
 * where each shot references a pipeline config and optional camera path.
 * 
 * Part of N1 - Story-to-Shot Narrative Pipeline (first pass)
 * 
 * @module types/narrativeScript
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Reference to a single shot in a narrative script.
 * Each shot maps to a pipeline config and optionally overrides camera path.
 */
export interface NarrativeShotRef {
    /**
     * Unique identifier for the shot within this script.
     * Used to correlate outputs (videos, manifests, benchmarks).
     * @example "shot-001"
     */
    id: string;

    /**
     * Human-readable name describing the shot content.
     * @example "Establishing exterior"
     */
    name?: string;

    /**
     * ID of the pipeline config to use for this shot.
     * Must match a valid config in config/pipelines/ (e.g., "production-qa-preview").
     */
    pipelineConfigId: string;

    /**
     * Optional camera path ID to override the pipeline config's default.
     * If not specified, uses the camera path from the pipeline config.
     */
    cameraPathId?: string;

    /**
     * Target duration for this shot in seconds.
     * Used as a hint for video generation.
     * @default 3.0
     */
    durationSeconds?: number;

    /**
     * Optional sample ID to use for this shot.
     * Links to a golden sample context in data/bookend-golden-samples/.
     * If not specified, uses a default sample or generates fresh.
     */
    sampleId?: string;

    /**
     * Optional description or notes for this shot.
     */
    description?: string;

    /**
     * Optional temporal regularization override for this shot.
     * - 'on': Always apply temporal regularization
     * - 'off': Skip temporal regularization
     * - 'auto': Use pipeline config default
     * @default 'auto'
     */
    temporalRegularization?: 'on' | 'off' | 'auto';
}

/**
 * A complete narrative script defining a multi-shot video.
 */
export interface NarrativeScript {
    /**
     * Unique identifier for the narrative script.
     * Used for output folder naming and manifest linkage.
     * @example "demo-three-shot"
     */
    id: string;

    /**
     * Human-readable title for the narrative.
     * @example "Three-Shot Demo: Fast → Production → Cinematic"
     */
    title?: string;

    /**
     * Description of what the narrative demonstrates or depicts.
     */
    description?: string;

    /**
     * Version of the narrative script schema.
     * Used for future migration support.
     * @default "1.0"
     */
    version?: string;

    /**
     * Ordered sequence of shots that compose this narrative.
     * Shots are generated in order and concatenated sequentially.
     */
    shots: NarrativeShotRef[];

    /**
     * Optional metadata for the narrative script.
     */
    metadata?: NarrativeScriptMetadata;
}

/**
 * Metadata about a narrative script.
 */
export interface NarrativeScriptMetadata {
    /** ISO timestamp when script was created */
    createdAt?: string;
    /** ISO timestamp when script was last modified */
    lastModifiedAt?: string;
    /** Author or team responsible for the script */
    author?: string;
    /** Tags for categorization */
    tags?: string[];
    /** Additional notes */
    notes?: string;
}

// ============================================================================
// Narrative Run Context
// ============================================================================

/**
 * Per-shot artifact tracking during a narrative run.
 */
export interface NarrativeShotArtifacts {
    /** Shot ID from the script */
    shotId: string;
    /** Pipeline config ID used */
    pipelineConfigId: string;
    /** Camera path ID used (if any) */
    cameraPathId?: string;
    /** Path to generated video file */
    videoPath?: string;
    /** Run directory containing artifacts */
    runDir?: string;
    /** Path to generation manifest */
    manifestPath?: string;
    /** Path to benchmark JSON output */
    benchmarkPath?: string;
    /** Path to Vision QA results */
    visionQaPath?: string;
    /** Sample ID used for generation */
    sampleId?: string;
    /** Whether temporal regularization was applied */
    temporalRegularizationApplied?: boolean;
    /** Original (pre-temporal) video path */
    originalVideoPath?: string;
    /** Warning message if temporal failed or skipped */
    temporalWarning?: string;
    /** Skip reason when temporal was not applied */
    temporalSkipReason?: string;
    /** Generation status */
    status: 'pending' | 'succeeded' | 'failed' | 'skipped';
    /** Error message if failed */
    errorMessage?: string;
}

/**
 * Context maintained during a narrative pipeline run.
 * Tracks per-shot artifacts and overall progress.
 */
export interface NarrativeRunContext {
    /** Narrative script ID */
    narrativeId: string;
    /** Path to source script JSON */
    scriptPath: string;
    /** Base output directory for narrative artifacts */
    outputDir: string;
    /** Timestamp when run started */
    startedAt: string;
    /** Per-shot artifact tracking */
    shots: NarrativeShotArtifacts[];
    /** Path to final concatenated video (set after concat step) */
    finalVideoPath?: string;
    /** Overall run status */
    status: 'running' | 'succeeded' | 'failed';
}

// ============================================================================
// Narrative Summary Types
// ============================================================================

/**
 * Key metrics extracted from benchmark/QA for summary reports.
 */
export interface NarrativeShotMetrics {
    /** Shot ID */
    shotId: string;
    /** Benchmark: flicker frame count */
    flickerFrameCount?: number;
    /** Benchmark: jitter score */
    jitterScore?: number;
    /** Benchmark: identity score (0-100) */
    identityScore?: number;
    /** Benchmark: overall quality (0-100) */
    overallQuality?: number;
    /** Camera path: mean adherence error */
    pathAdherenceMeanError?: number;
    /** Camera path: direction consistency (0-1) */
    pathDirectionConsistency?: number;
    /** Vision QA: overall score */
    visionQaOverall?: number;
    /** Vision QA: artifacts/flicker score */
    visionQaArtifacts?: number;
    /** Vision QA: status (PASS/WARN/FAIL) */
    visionQaStatus?: string;
}

/**
 * Summary of a complete narrative run.
 */
export interface NarrativeRunSummary {
    /** Narrative script ID */
    narrativeId: string;
    /** Script title */
    title?: string;
    /** Path to source script */
    scriptPath: string;
    /** Timestamp when run started */
    startedAt: string;
    /** Timestamp when run completed */
    finishedAt: string;
    /** Total duration in milliseconds */
    totalDurationMs: number;
    /** Number of shots in script */
    shotCount: number;
    /** Number of shots successfully generated */
    successfulShots: number;
    /** Number of shots that failed */
    failedShots: number;
    /** Per-shot metrics */
    shotMetrics: NarrativeShotMetrics[];
    /** Per-shot artifact paths */
    shotArtifacts: NarrativeShotArtifacts[];
    /** Path to final concatenated video */
    finalVideoPath?: string;
    /** Overall run status */
    status: 'succeeded' | 'failed';
    /** Aggregated QA summary with per-shot and overall verdicts (N2) */
    qaSummary?: NarrativeQASummary;
    /** Preflight checks captured at run start (ffmpeg/VLM) */
    preflight?: {
        ffmpegVersion?: string;
        tmixNormalizeSupported?: boolean;
        vlmReachable?: boolean;
        vlmEndpoint?: string;
        warnings?: string[];
    };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an object is a valid NarrativeShotRef
 */
export function isNarrativeShotRef(obj: unknown): obj is NarrativeShotRef {
    if (!obj || typeof obj !== 'object') return false;
    const shot = obj as Record<string, unknown>;
    return (
        typeof shot.id === 'string' &&
        typeof shot.pipelineConfigId === 'string'
    );
}

/**
 * Type guard to check if an object is a valid NarrativeScript
 */
export function isNarrativeScript(obj: unknown): obj is NarrativeScript {
    if (!obj || typeof obj !== 'object') return false;
    const script = obj as Record<string, unknown>;
    return (
        typeof script.id === 'string' &&
        Array.isArray(script.shots) &&
        script.shots.every(isNarrativeShotRef)
    );
}

/**
 * Schema version for narrative scripts
 */
export const NARRATIVE_SCRIPT_SCHEMA_VERSION = '1.0';

// ============================================================================
// Narrative QA Types (N2)
// ============================================================================

/**
 * QA verdict for shot-level and narrative-level quality assessment.
 * - PASS: All metrics meet thresholds with comfortable margin
 * - WARN: Metrics pass but one or more are in the warning zone
 * - FAIL: One or more metrics violate thresholds
 */
export type QAVerdict = 'PASS' | 'WARN' | 'FAIL';

/**
 * QA summary for a single shot within a narrative.
 * Combines Vision QA, benchmark, and camera-path metrics into a unified verdict.
 */
export interface ShotQASummary {
    /** Shot ID from the narrative script */
    shotId: string;
    /** Pipeline config used for this shot */
    pipelineConfigId: string;
    /** Camera path ID if specified */
    cameraPathId?: string;
    /** Whether temporal regularization was applied */
    temporalRegularizationApplied?: boolean;
    
    /** Key metrics from various QA sources */
    metrics: {
        // From benchmark:
        /** Number of frames with anomalous brightness (flicker indicator) */
        flickerFrameCount?: number;
        /** Motion jitter score (lower = smoother) */
        jitterScore?: number;
        /** Identity preservation score (0-100, higher = better) */
        identityScore?: number;
        /** Aggregated quality score from benchmark (0-100) */
        overallQuality?: number;
        
        // From camera path metrics (E3):
        /** Mean Euclidean distance between observed and expected camera positions */
        pathAdherenceMeanError?: number;
        /** Direction consistency (0-1, higher = better match to expected motion) */
        pathDirectionConsistency?: number;
        
        // From Vision QA:
        /** Vision QA overall score (0-100) */
        visionOverall?: number;
        /** Vision QA artifacts/flicker score */
        visionArtifacts?: number;
        /** Vision QA status string */
        visionStatus?: string;
    };
    
    /** Computed QA verdict for this shot */
    verdict: QAVerdict;
    /** Human-readable reasons for the verdict (e.g., "mild flicker", "low identity score") */
    verdictReasons: string[];
}

/**
 * Aggregated QA summary for an entire narrative run.
 */
export interface NarrativeQASummary {
    /** Overall verdict for the narrative (worst-case across all shots) */
    overallVerdict: QAVerdict;
    /** Reasons for the overall verdict */
    overallReasons: string[];
    /** Per-shot QA summaries */
    shots: ShotQASummary[];
}
