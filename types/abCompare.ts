/**
 * A/B Comparison Types
 * 
 * Defines the schema for A/B QA comparisons between pipeline configurations.
 * Used by the A/B Dashboard to compare presets, temporal regularization settings,
 * and stability profiles.
 * 
 * Part of F1 - In-App A/B QA Dashboard
 * 
 * @module types/abCompare
 */

import type { StabilityProfileId } from '../utils/stabilityProfiles';
import type { QAVerdict } from './narrativeScript';

// ============================================================================
// Pipeline Identifiers
// ============================================================================

/**
 * Known pipeline configuration identifiers for A/B comparisons.
 * Maps to config files in config/pipelines/.
 */
export type ComparePipelineId =
    | 'fast-preview'
    | 'production-qa-preview'
    | 'cinematic-preview'
    | 'cinematic-gold';

/**
 * Temporal regularization mode for comparison runs.
 * - 'on': Always apply temporal regularization
 * - 'off': Skip temporal regularization
 * - 'auto': Use pipeline config default
 */
export type TemporalRegularizationMode = 'on' | 'off' | 'auto';

// ============================================================================
// Compare Target Definition
// ============================================================================

/**
 * A single target in an A/B comparison.
 * Represents one configuration to test.
 */
export interface CompareTarget {
    /** Target identifier (e.g., "A" or "B") */
    id: 'A' | 'B';
    
    /** Human-readable label for the target (e.g., "Production QA") */
    label: string;
    
    /** Pipeline configuration ID to use */
    pipelineConfigId: ComparePipelineId;
    
    /** Stability profile key */
    stabilityProfileKey: StabilityProfileId;
    
    /** Temporal regularization mode override */
    temporalRegularizationMode?: TemporalRegularizationMode;
    
    /** Optional temporal regularization strength (0.0-1.0) */
    temporalRegularizationStrength?: number;
}

// ============================================================================
// Comparison Run Summary
// ============================================================================

/**
 * Metrics extracted from benchmark and Vision QA results.
 */
export interface CompareMetrics {
    // Vision QA metrics
    /** Overall Vision QA verdict */
    visionVerdict?: QAVerdict;
    /** Vision QA overall score (0-100) */
    visionOverall?: number;
    /** Vision QA artifact severity score */
    artifacts?: number;
    
    // Temporal metrics (from benchmark)
    /** Number of frames with anomalous brightness (flicker indicator) */
    flickerMetric?: number;
    /** Motion jitter score (lower = smoother) */
    jitterScore?: number;
    /** Identity preservation score (0-100, higher = better) */
    identityScore?: number;
    /** Overall quality score from benchmark */
    overallQuality?: number;
    
    // Camera path metrics (E3)
    /** Mean adherence error (normalized units) */
    pathAdherenceMeanError?: number;
    /** Direction consistency (0-1, higher = better) */
    pathDirectionConsistency?: number;
}

/**
 * Summary of a single A/B comparison run.
 */
export interface CompareRunSummary {
    /** The target configuration that was run */
    target: CompareTarget;
    
    /** Path to generated video file (if available) */
    videoPath?: string;
    
    /** Path to benchmark JSON output (if available) */
    benchmarkPath?: string;
    
    /** Path to Vision QA results (if available) */
    visionQaPath?: string;
    
    /** Path to generation manifest (if available) */
    manifestPath?: string;
    
    /** Run directory containing all artifacts */
    runDir?: string;
    
    /** Extracted metrics from benchmark and Vision QA */
    metrics?: CompareMetrics;
    
    /** Execution time in milliseconds */
    executionTimeMs?: number;
    
    /** Run status */
    status: 'pending' | 'running' | 'succeeded' | 'failed';
    
    /** Error message if failed */
    errorMessage?: string;
}

// ============================================================================
// A/B Comparison Options and Results
// ============================================================================

/**
 * Options for initiating an A/B comparison.
 */
export interface AbCompareOptions {
    /** Sample ID to use for comparison (e.g., "sample-001-geometric") */
    sampleId?: string;
    
    /** Target A configuration */
    targetA: CompareTarget;
    
    /** Target B configuration */
    targetB: CompareTarget;
    
    /** Optional output directory override */
    outputDir?: string;
    
    /** Enable verbose logging */
    verbose?: boolean;
}

/**
 * Complete result of an A/B comparison run.
 */
export interface AbCompareResult {
    /** Comparison ID (timestamp-based) */
    compareId: string;
    
    /** Sample ID used for comparison */
    sampleId: string;
    
    /** ISO timestamp when comparison started */
    startedAt: string;
    
    /** ISO timestamp when comparison finished */
    finishedAt: string;
    
    /** Total duration in milliseconds */
    totalDurationMs: number;
    
    /** Result for target A */
    runA: CompareRunSummary;
    
    /** Result for target B */
    runB: CompareRunSummary;
    
    /** Overall comparison status */
    status: 'succeeded' | 'failed';
}

// ============================================================================
// Preset Definitions for UI
// ============================================================================

/**
 * Preset configuration for the A/B comparison UI.
 * These are pre-built CompareTarget configurations that users can select.
 */
export interface ComparePreset {
    /** Unique preset identifier */
    id: string;
    
    /** Display label */
    label: string;
    
    /** Short label for compact display */
    shortLabel: string;
    
    /** Description of what this preset tests */
    description: string;
    
    /** Pre-configured CompareTarget (without id, which is assigned at runtime) */
    target: Omit<CompareTarget, 'id'>;
}

/**
 * Available presets for A/B comparisons.
 * Users can select from these in the UI.
 */
export const AB_COMPARE_PRESETS: ComparePreset[] = [
    {
        id: 'fast',
        label: 'Fast (Low VRAM)',
        shortLabel: 'Fast',
        description: 'No temporal processing, fastest generation',
        target: {
            label: 'Fast',
            pipelineConfigId: 'fast-preview',
            stabilityProfileKey: 'fast',
            temporalRegularizationMode: 'off',
        },
    },
    {
        id: 'production-qa',
        label: 'Production QA',
        shortLabel: 'Prod QA',
        description: 'Balanced quality with QA gates enabled',
        target: {
            label: 'Production QA',
            pipelineConfigId: 'production-qa-preview',
            stabilityProfileKey: 'standard',
            temporalRegularizationMode: 'auto',
        },
    },
    {
        id: 'production-qa-temporal-on',
        label: 'Production QA + Temporal',
        shortLabel: 'Prod+Temp',
        description: 'Production with forced temporal regularization',
        target: {
            label: 'Prod QA + Temporal ON',
            pipelineConfigId: 'production-qa-preview',
            stabilityProfileKey: 'standard',
            temporalRegularizationMode: 'on',
            temporalRegularizationStrength: 0.3,
        },
    },
    {
        id: 'production-qa-temporal-off',
        label: 'Production QA (No Temporal)',
        shortLabel: 'Prod-Temp',
        description: 'Production with temporal regularization disabled',
        target: {
            label: 'Prod QA + Temporal OFF',
            pipelineConfigId: 'production-qa-preview',
            stabilityProfileKey: 'standard',
            temporalRegularizationMode: 'off',
        },
    },
    {
        id: 'cinematic',
        label: 'Cinematic (High Quality)',
        shortLabel: 'Cinematic',
        description: 'Full temporal stack, highest quality',
        target: {
            label: 'Cinematic',
            pipelineConfigId: 'cinematic-preview',
            stabilityProfileKey: 'cinematic',
            temporalRegularizationMode: 'on',
        },
    },
    {
        id: 'cinematic-gold',
        label: '🏆 Cinematic Gold (Hero)',
        shortLabel: 'Gold',
        description: 'Hero configuration: best features, strict QA (80+), 4s duration',
        target: {
            label: 'Cinematic Gold',
            pipelineConfigId: 'cinematic-gold',
            stabilityProfileKey: 'cinematic',
            temporalRegularizationMode: 'on',
            temporalRegularizationStrength: 0.7,
        },
    },
];

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a string is a valid ComparePipelineId
 */
export function isComparePipelineId(value: string): value is ComparePipelineId {
    return ['fast-preview', 'production-qa-preview', 'cinematic-preview', 'cinematic-gold'].includes(value);
}

/**
 * Type guard to check if a value is a valid TemporalRegularizationMode
 */
export function isTemporalRegularizationMode(value: string): value is TemporalRegularizationMode {
    return ['on', 'off', 'auto'].includes(value);
}

/**
 * Type guard to check if an object is a valid CompareTarget
 */
export function isCompareTarget(obj: unknown): obj is CompareTarget {
    if (!obj || typeof obj !== 'object') return false;
    const target = obj as Record<string, unknown>;
    return (
        (target.id === 'A' || target.id === 'B') &&
        typeof target.label === 'string' &&
        typeof target.pipelineConfigId === 'string' &&
        isComparePipelineId(target.pipelineConfigId as string) &&
        typeof target.stabilityProfileKey === 'string'
    );
}
