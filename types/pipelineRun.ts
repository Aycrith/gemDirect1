/**
 * Pipeline Run Types
 * 
 * Types for orchestrating pipeline runs from the React UI.
 * These define the contract between the UI and the run controller.
 * 
 * @module types/pipelineRun
 */

// ============================================================================
// Pipeline Types
// ============================================================================

/**
 * Available pipeline types
 */
export type PipelineType = 'production' | 'narrative';

/**
 * Temporal regularization mode
 */
export type TemporalMode = 'on' | 'off' | 'auto';

/**
 * Run status values
 */
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

// ============================================================================
// Run Request Types
// ============================================================================

/**
 * Base run request options
 */
export interface BaseRunOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Dry run - simulate without executing */
    dryRun?: boolean;
    /** Temporal regularization mode */
    temporalMode?: TemporalMode;
}

/**
 * Production pipeline run request
 */
export interface ProductionRunRequest extends BaseRunOptions {
    type: 'production';
    /** Pipeline ID (currently only 'production-qa-golden') */
    pipelineId: string;
    /** Sample ID to use (e.g., 'sample-001-geometric') */
    sampleId: string;
}

/**
 * Narrative pipeline run request
 */
export interface NarrativeRunRequest extends BaseRunOptions {
    type: 'narrative';
    /** Path to narrative script JSON */
    scriptPath: string;
}

/**
 * Union of all run request types
 */
export type RunRequest = ProductionRunRequest | NarrativeRunRequest;

// ============================================================================
// Run Progress Types
// ============================================================================

/**
 * Progress event from a running pipeline
 */
export interface RunProgressEvent {
    /** Timestamp of the event */
    timestamp: string;
    /** Event type */
    eventType: 'step-start' | 'step-complete' | 'step-failed' | 'log' | 'warning' | 'error';
    /** Step ID if applicable */
    stepId?: string;
    /** Step description */
    stepDescription?: string;
    /** Log message */
    message?: string;
    /** Step duration in ms (for step-complete) */
    durationMs?: number;
}

/**
 * Step timing information for performance tracking
 */
export interface StepTimingSummary {
    /** Step ID */
    stepId: string;
    /** Duration in milliseconds */
    durationMs: number;
    /** Step status */
    status: 'running' | 'complete' | 'failed';
}

/**
 * Current state of a pipeline run
 */
export interface RunState {
    /** Unique run ID */
    runId: string;
    /** Type of pipeline */
    pipelineType: PipelineType;
    /** Current status */
    status: RunStatus;
    /** Pipeline or script identifier */
    identifier: string;
    /** When the run started */
    startedAt: string;
    /** When the run finished (if complete) */
    finishedAt?: string;
    /** Total duration in ms */
    durationMs?: number;
    /** Current step being executed */
    currentStep?: string;
    /** Total steps in pipeline */
    totalSteps?: number;
    /** Completed steps count */
    completedSteps?: number;
    /** Progress events log */
    events: RunProgressEvent[];
    /** Error message if failed */
    errorMessage?: string;
    /** Path to output summary file (when complete) */
    summaryPath?: string;
    /** Step timing information for performance tracking */
    stepTimings?: StepTimingSummary[];
    /** Validation warnings from input checks */
    validationWarnings?: string[];
}

// ============================================================================
// Run Controller API Types
// ============================================================================

/**
 * Response from starting a run
 */
export interface StartRunResponse {
    /** Whether the run was started successfully */
    success: boolean;
    /** The run ID if started */
    runId?: string;
    /** Error message if failed to start */
    error?: string;
}

/**
 * Response from getting run status
 */
export interface GetRunStatusResponse {
    /** The current run state, or null if no active run */
    run: RunState | null;
}

/**
 * Available sample info
 */
export interface SampleInfo {
    /** Sample ID */
    id: string;
    /** Sample display name */
    name: string;
    /** Sample description */
    description?: string;
}

/**
 * Available narrative script info
 */
export interface NarrativeScriptInfo {
    /** Script file path */
    path: string;
    /** Script ID */
    id: string;
    /** Script title */
    title?: string;
    /** Script description */
    description?: string;
    /** Number of shots */
    shotCount: number;
}

/**
 * Response from listing available options
 */
export interface ListOptionsResponse {
    /** Available production samples */
    samples: SampleInfo[];
    /** Available narrative scripts */
    scripts: NarrativeScriptInfo[];
    /** Available pipelines */
    pipelines: {
        id: string;
        description: string;
    }[];
}

// ============================================================================
// Status File Types
// ============================================================================

/**
 * Run status file written by the controller
 * This is what the UI polls for during active runs
 */
export interface RunStatusFile {
    /** Version for forward compatibility */
    version: '1.0';
    /** Current run state */
    run: RunState | null;
    /** Last updated timestamp */
    lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default polling interval for run status (ms) */
export const RUN_STATUS_POLL_INTERVAL_MS = 1000;

/** Path to the run status file (relative to public/) */
export const RUN_STATUS_FILE_PATH = '/run-status.json';

/** Default sample for production runs */
export const DEFAULT_SAMPLE_ID = 'sample-001-geometric';

/** Default pipeline for production runs */
export const DEFAULT_PIPELINE_ID = 'production-qa-golden';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for production run request
 */
export function isProductionRunRequest(req: RunRequest): req is ProductionRunRequest {
    return req.type === 'production';
}

/**
 * Type guard for narrative run request
 */
export function isNarrativeRunRequest(req: RunRequest): req is NarrativeRunRequest {
    return req.type === 'narrative';
}

/**
 * Check if a run is still active
 */
export function isRunActive(status: RunStatus): boolean {
    return status === 'queued' || status === 'running';
}

/**
 * Check if a run has completed (successfully or not)
 */
export function isRunComplete(status: RunStatus): boolean {
    return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}
