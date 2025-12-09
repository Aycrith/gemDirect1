/**
 * Static Data Service
 *
 * Centralized service for fetching static JSON files from the /public directory.
 * Following the project's service-layer pattern, this keeps all fetch() calls
 * out of components and in a dedicated service.
 *
 * Files served:
 * - /vision-qa-latest.json - Vision QA results
 * - /vision-thresholds.json - Vision threshold configuration
 * - /vision-qa-history.json - Vision QA run history
 * - /latest-run-summary.json - Production run summary
 * - /latest-narrative-summary.json - Narrative run summary
 * - /artifacts/* - Preview assets (images, etc.)
 *
 * @module services/staticDataService
 */

import type { ProductionSummary, NarrativeSummary } from '../types/pipelineSummary';

// ============================================================================
// Types
// ============================================================================

/**
 * Vision QA scores for a single sample
 */
export interface VisionQAScores {
    overall: number;
    focusStability: number;
    artifactSeverity: number;
    objectConsistency: number;
    startFrameMatch?: number;
    endFrameMatch?: number;
    motionQuality?: number;
    promptAdherence?: number;
}

/**
 * Aggregated metric statistics
 */
export interface AggregatedMetric {
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    count: number;
}

/**
 * Aggregated metrics across multiple runs
 */
export interface AggregatedMetrics {
    overall?: AggregatedMetric;
    focusStability?: AggregatedMetric;
    artifactSeverity?: AggregatedMetric;
    objectConsistency?: AggregatedMetric;
    runsSuccessful?: number;
    runsTotal?: number;
}

/**
 * Frame analysis results
 */
export interface FrameAnalysis {
    hasBlackFrames: boolean;
    hasHardFlicker: boolean;
    frameArtifactScore: number;
}

/**
 * Vision QA sample result
 */
export interface VisionQASample {
    scores: VisionQAScores;
    aggregatedMetrics?: AggregatedMetrics | null;
    frameAnalysis?: FrameAnalysis;
    status: 'success' | 'error' | 'parse_error';
    summary?: string;
    timestamp?: string;
}

/**
 * Vision QA results keyed by sample ID
 */
export interface VisionQAResults {
    [sampleId: string]: VisionQASample;
}

/**
 * Vision thresholds configuration
 */
export interface VisionThresholds {
    version: string;
    globalDefaults: {
        minOverall: number;
        minFocusStability: number;
        maxArtifactSeverity: number;
        minObjectConsistency: number;
    };
    perSampleOverrides?: Record<string, {
        minOverall?: number;
        minFocusStability?: number;
        maxArtifactSeverity?: number;
        minObjectConsistency?: number;
        warnMargin?: number;
    }>;
    thresholdStrategy?: {
        warnMargin?: number;
    };
}

/**
 * Vision QA history entry
 */
export interface VisionQAHistoryEntry {
    timestamp: string;
    thresholdVersion: string;
    runId: string;
}

/**
 * Vision QA history data
 */
export interface VisionQAHistory {
    entries: VisionQAHistoryEntry[];
}

/**
 * Default fallback thresholds when file is unavailable
 */
const FALLBACK_THRESHOLDS: VisionThresholds = {
    version: 'fallback',
    globalDefaults: {
        minOverall: 80,
        minFocusStability: 85,
        maxArtifactSeverity: 40,
        minObjectConsistency: 85,
    },
};

// ============================================================================
// Vision QA Data
// ============================================================================

/**
 * Fetch Vision QA results from public directory.
 * Returns null if file doesn't exist (expected when no QA run has occurred).
 */
export async function fetchVisionQAResults(): Promise<VisionQAResults | null> {
    try {
        const response = await fetch('/vision-qa-latest.json');
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Fetch Vision thresholds configuration.
 * Returns fallback thresholds if file is unavailable.
 */
export async function fetchVisionThresholds(): Promise<{ thresholds: VisionThresholds; isFallback: boolean }> {
    try {
        const response = await fetch('/vision-thresholds.json');
        if (!response.ok) {
            return { thresholds: FALLBACK_THRESHOLDS, isFallback: true };
        }
        const data = await response.json();
        if (data && data.globalDefaults) {
            return {
                thresholds: {
                    version: data.version ?? 'unknown',
                    globalDefaults: data.globalDefaults,
                    perSampleOverrides: data.perSampleOverrides ?? undefined,
                    thresholdStrategy: data.thresholdStrategy ?? undefined,
                },
                isFallback: false,
            };
        }
        return { thresholds: FALLBACK_THRESHOLDS, isFallback: true };
    } catch {
        return { thresholds: FALLBACK_THRESHOLDS, isFallback: true };
    }
}

/**
 * Fetch Vision QA history for baseline info.
 * Returns null if unavailable.
 */
export async function fetchVisionQAHistory(): Promise<VisionQAHistory | null> {
    try {
        const response = await fetch('/vision-qa-history.json');
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Fetch all Vision QA data in parallel for efficiency.
 */
export async function fetchAllVisionQAData(): Promise<{
    results: VisionQAResults | null;
    thresholds: VisionThresholds;
    isFallbackThresholds: boolean;
    history: VisionQAHistory | null;
}> {
    const [results, thresholdsData, history] = await Promise.all([
        fetchVisionQAResults(),
        fetchVisionThresholds(),
        fetchVisionQAHistory(),
    ]);

    return {
        results,
        thresholds: thresholdsData.thresholds,
        isFallbackThresholds: thresholdsData.isFallback,
        history,
    };
}

// ============================================================================
// Run Summaries
// ============================================================================

/**
 * Fetch the latest production run summary.
 * Returns null if unavailable.
 */
export async function fetchProductionRunSummary(): Promise<ProductionSummary | null> {
    try {
        const response = await fetch('/latest-run-summary.json');
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Fetch the latest narrative run summary.
 * Returns null if unavailable.
 */
export async function fetchNarrativeRunSummary(): Promise<NarrativeSummary | null> {
    try {
        const response = await fetch('/latest-narrative-summary.json');
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Fetch both run summaries in parallel.
 */
export async function fetchAllRunSummaries(): Promise<{
    production: ProductionSummary | null;
    narrative: NarrativeSummary | null;
}> {
    const [production, narrative] = await Promise.all([
        fetchProductionRunSummary(),
        fetchNarrativeRunSummary(),
    ]);
    return { production, narrative };
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Check if a file exists in the public directory using HEAD request.
 * Returns the first existing file path from candidates, or null if none exist.
 */
export async function findFirstExistingFile(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
        try {
            const response = await fetch(candidate, { method: 'HEAD' });
            if (response.ok) {
                return candidate;
            }
        } catch {
            // Continue to next candidate
        }
    }
    return null;
}

/**
 * Check if a single file exists.
 */
export async function checkFileExists(path: string): Promise<boolean> {
    try {
        const response = await fetch(path, { method: 'HEAD' });
        return response.ok;
    } catch {
        return false;
    }
}

// ============================================================================
// Image Loading
// ============================================================================

/**
 * Load an image from a URL and convert to base64 data URL.
 * Used for loading preview keyframes.
 */
export async function loadImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load image: ${url}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ============================================================================
// ComfyUI Status (lightweight check)
// ============================================================================

/**
 * Quick check if ComfyUI is available.
 * For more comprehensive checks, use services/environmentHealthService.ts
 */
export async function checkComfyUIAvailable(comfyUIUrl: string): Promise<boolean> {
    try {
        const response = await fetch(`${comfyUIUrl}/system_stats`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    } catch {
        return false;
    }
}
