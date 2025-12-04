/**
 * Vision Threshold Configuration
 * 
 * Provides shared coherence thresholds for runtime video QA.
 * These thresholds are derived from the CI golden sample thresholds
 * (data/bookend-golden-samples/vision-thresholds.json) to ensure
 * consistent quality gating between CI and runtime.
 * 
 * The runtime thresholds are intentionally conservative (use global defaults)
 * because runtime videos don't have per-sample calibration like golden samples.
 * 
 * @module services/visionThresholdConfig
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Coherence thresholds for video quality gating.
 * These metrics measure temporal consistency and artifact detection.
 */
export interface CoherenceThresholds {
    /** Minimum overall quality score (0-100). Default: 80 */
    minOverall: number;
    
    /** Minimum focus stability score (0-100). Measures if main subject stays in focus. Default: 85 */
    minFocusStability: number;
    
    /** Maximum artifact severity (0-100). Higher = more artifacts. Default: 40 */
    maxArtifactSeverity: number;
    
    /** Minimum object consistency (0-100). Measures if objects maintain identity. Default: 85 */
    minObjectConsistency: number;
    
    /** Whether to fail videos with black frames. Default: true */
    disallowBlackFrames: boolean;
    
    /** Whether to fail videos with hard flicker. Default: true */
    disallowHardFlicker: boolean;
}

/**
 * Coherence check result for a single metric.
 */
export interface CoherenceViolation {
    /** Which coherence metric was violated */
    metric: keyof Omit<CoherenceThresholds, 'disallowBlackFrames' | 'disallowHardFlicker'> | 'blackFrames' | 'hardFlicker';
    /** The actual value observed */
    actual: number | boolean;
    /** The threshold that was violated */
    threshold: number | boolean;
    /** Whether this is an error (hard fail) or warning (soft fail) */
    severity: 'error' | 'warning';
    /** Human-readable message */
    message: string;
}

/**
 * Result of coherence threshold check.
 */
export interface CoherenceCheckResult {
    /** Whether all coherence checks passed */
    passes: boolean;
    /** List of violations (if any) */
    violations: CoherenceViolation[];
    /** Overall decision */
    decision: 'pass' | 'warn' | 'fail';
    /** The metrics that were checked (for UI display) */
    metrics: {
        overall?: number;
        focusStability?: number;
        artifactSeverity?: number;
        objectConsistency?: number;
        hasBlackFrames?: boolean;
        hasHardFlicker?: boolean;
    };
}

// ============================================================================
// Default Thresholds (Derived from vision-thresholds.json globalDefaults)
// ============================================================================

/**
 * Runtime coherence thresholds.
 * 
 * These are intentionally aligned with the CI golden sample globalDefaults
 * from data/bookend-golden-samples/vision-thresholds.json v2.0.0:
 * 
 * - minOverall: 80 (matches globalDefaults)
 * - minFocusStability: 85 (matches globalDefaults)
 * - maxArtifactSeverity: 40 (matches globalDefaults)
 * - minObjectConsistency: 85 (matches globalDefaults)
 * - disallowBlackFrames: true (matches globalDefaults)
 * - disallowHardFlicker: true (matches globalDefaults)
 * 
 * Note: CI uses per-sample overrides for golden samples which can be stricter.
 * Runtime uses global defaults since we don't know which "sample type" a video is.
 */
export const DEFAULT_COHERENCE_THRESHOLDS: CoherenceThresholds = {
    minOverall: 80,
    minFocusStability: 85,
    maxArtifactSeverity: 40,
    minObjectConsistency: 85,
    disallowBlackFrames: true,
    disallowHardFlicker: true,
};

/**
 * Warning margin for threshold checks.
 * If a metric is within this margin of the threshold, it triggers a warning instead of pass.
 */
const WARNING_MARGIN = 5;

// ============================================================================
// Functions
// ============================================================================

/**
 * Get runtime coherence thresholds.
 * 
 * Returns a copy of the default thresholds that can be used for runtime QA.
 * These match the globalDefaults from vision-thresholds.json to ensure
 * CI and runtime use the same quality bar.
 */
export function getRuntimeCoherenceThresholds(): CoherenceThresholds {
    return { ...DEFAULT_COHERENCE_THRESHOLDS };
}

/**
 * Check coherence metrics against thresholds.
 * 
 * @param metrics - Object containing coherence metrics from video analysis
 * @param thresholds - Thresholds to check against (defaults to runtime thresholds)
 * @returns CoherenceCheckResult with pass/warn/fail decision and violations
 */
export function checkCoherenceThresholds(
    metrics: {
        overall?: number;
        focusStability?: number;
        artifactSeverity?: number;
        objectConsistency?: number;
        hasBlackFrames?: boolean;
        hasHardFlicker?: boolean;
    },
    thresholds: CoherenceThresholds = DEFAULT_COHERENCE_THRESHOLDS
): CoherenceCheckResult {
    const violations: CoherenceViolation[] = [];
    
    // Check overall score
    if (metrics.overall !== undefined && metrics.overall < thresholds.minOverall) {
        const isError = metrics.overall < thresholds.minOverall - WARNING_MARGIN;
        violations.push({
            metric: 'minOverall',
            actual: metrics.overall,
            threshold: thresholds.minOverall,
            severity: isError ? 'error' : 'warning',
            message: `Overall score ${metrics.overall} below threshold ${thresholds.minOverall}`,
        });
    }
    
    // Check focus stability
    if (metrics.focusStability !== undefined && metrics.focusStability < thresholds.minFocusStability) {
        const isError = metrics.focusStability < thresholds.minFocusStability - WARNING_MARGIN;
        violations.push({
            metric: 'minFocusStability',
            actual: metrics.focusStability,
            threshold: thresholds.minFocusStability,
            severity: isError ? 'error' : 'warning',
            message: `Focus stability ${metrics.focusStability} below threshold ${thresholds.minFocusStability}`,
        });
    }
    
    // Check artifact severity (higher = worse, so we check if ABOVE threshold)
    if (metrics.artifactSeverity !== undefined && metrics.artifactSeverity > thresholds.maxArtifactSeverity) {
        const isError = metrics.artifactSeverity > thresholds.maxArtifactSeverity + WARNING_MARGIN;
        violations.push({
            metric: 'maxArtifactSeverity',
            actual: metrics.artifactSeverity,
            threshold: thresholds.maxArtifactSeverity,
            severity: isError ? 'error' : 'warning',
            message: `Artifact severity ${metrics.artifactSeverity} above threshold ${thresholds.maxArtifactSeverity}`,
        });
    }
    
    // Check object consistency
    if (metrics.objectConsistency !== undefined && metrics.objectConsistency < thresholds.minObjectConsistency) {
        const isError = metrics.objectConsistency < thresholds.minObjectConsistency - WARNING_MARGIN;
        violations.push({
            metric: 'minObjectConsistency',
            actual: metrics.objectConsistency,
            threshold: thresholds.minObjectConsistency,
            severity: isError ? 'error' : 'warning',
            message: `Object consistency ${metrics.objectConsistency} below threshold ${thresholds.minObjectConsistency}`,
        });
    }
    
    // Check black frames (hard fail if present and disallowed)
    if (thresholds.disallowBlackFrames && metrics.hasBlackFrames === true) {
        violations.push({
            metric: 'blackFrames',
            actual: true,
            threshold: false,
            severity: 'error',
            message: 'Video contains black frames',
        });
    }
    
    // Check hard flicker (hard fail if present and disallowed)
    if (thresholds.disallowHardFlicker && metrics.hasHardFlicker === true) {
        violations.push({
            metric: 'hardFlicker',
            actual: true,
            threshold: false,
            severity: 'error',
            message: 'Video contains hard flicker',
        });
    }
    
    // Determine overall decision
    const hasErrors = violations.some(v => v.severity === 'error');
    const hasWarnings = violations.some(v => v.severity === 'warning');
    
    let decision: 'pass' | 'warn' | 'fail';
    if (hasErrors) {
        decision = 'fail';
    } else if (hasWarnings) {
        decision = 'warn';
    } else {
        decision = 'pass';
    }
    
    return {
        passes: !hasErrors,
        violations,
        decision,
        metrics, // Include the metrics for UI display
    };
}

/**
 * Format coherence check result for display.
 * 
 * @param result - Result from checkCoherenceThresholds
 * @returns Human-readable string describing the result
 */
export function formatCoherenceResult(result: CoherenceCheckResult): string {
    if (result.decision === 'pass') {
        return '✅ Coherence check passed';
    }
    
    const prefix = result.decision === 'fail' ? '❌' : '⚠️';
    const violationMessages = result.violations.map(v => v.message).join('; ');
    
    return `${prefix} Coherence check ${result.decision}: ${violationMessages}`;
}
