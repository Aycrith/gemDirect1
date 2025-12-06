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
 * 
 * IMPORTANT: This value must remain consistent across all QA systems:
 * - services/visionThresholdConfig.ts (this file)
 * - data/bookend-golden-samples/vision-thresholds.json (thresholdStrategy.warnMargin)
 * - components/BookendVisionQAPanel.tsx (should import from this file)
 * - components/UsageDashboard.tsx (QualityStatusWidget, should import from this file)
 * - scripts/test-bookend-vision-regression.ps1 ($warnMargin)
 * 
 * DO NOT change this value without updating the documentation in QA_SEMANTICS.md
 */
export const WARNING_MARGIN = 5;

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
 * USE THIS FUNCTION FOR: Runtime quality gating, CI pipeline checks,
 * programmatic pass/fail decisions where you only care about actual violations.
 * 
 * DO NOT USE FOR: UI verdicts where you want to show "close to failing" warnings.
 * For UI display, use calculateSampleVerdict() instead.
 * 
 * SEMANTIC DIFFERENCE: This function only produces violations when metrics
 * are BELOW threshold. A score of 82 (above threshold 80) produces NO violation.
 * The warning margin affects violation SEVERITY, not presence.
 * 
 * See Documentation/QA_SEMANTICS.md for full explanation of dual API semantics.
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

// ============================================================================
// UI Verdict Calculation (Shared Logic for Components)
// ============================================================================

/**
 * Verdict type used by UI components.
 * - PASS: All metrics meet thresholds with comfortable margin
 * - WARN: Metrics are passing but within warning margin of thresholds
 * - FAIL: One or more metrics violate thresholds
 */
export type Verdict = 'PASS' | 'WARN' | 'FAIL';

/**
 * Result of calculating a verdict for a single metric.
 */
export interface MetricVerdictResult {
    verdict: Verdict;
    /** Human-readable message (e.g., "overall<80", "overall~80") */
    message?: string;
}

/**
 * Calculate verdict for a single metric (minimum threshold).
 * Used for metrics where higher is better (overall, focusStability, objectConsistency).
 * 
 * @param value - The metric value (0-100)
 * @param threshold - The minimum threshold
 * @param warnMargin - Warning margin (default: WARNING_MARGIN)
 * @param metricName - Name for message generation
 * @returns MetricVerdictResult with verdict and optional message
 */
export function calculateMinMetricVerdict(
    value: number,
    threshold: number,
    warnMargin: number = WARNING_MARGIN,
    metricName?: string
): MetricVerdictResult {
    if (value < threshold) {
        return {
            verdict: 'FAIL',
            message: metricName ? `${metricName}<${threshold}` : undefined,
        };
    } else if (value < threshold + warnMargin) {
        return {
            verdict: 'WARN',
            message: metricName ? `${metricName}~${threshold}` : undefined,
        };
    }
    return { verdict: 'PASS' };
}

/**
 * Calculate verdict for a single metric (maximum threshold).
 * Used for metrics where lower is better (artifactSeverity).
 * 
 * @param value - The metric value (0-100)
 * @param threshold - The maximum threshold
 * @param warnMargin - Warning margin (default: WARNING_MARGIN)
 * @param metricName - Name for message generation
 * @returns MetricVerdictResult with verdict and optional message
 */
export function calculateMaxMetricVerdict(
    value: number,
    threshold: number,
    warnMargin: number = WARNING_MARGIN,
    metricName?: string
): MetricVerdictResult {
    if (value > threshold) {
        return {
            verdict: 'FAIL',
            message: metricName ? `${metricName}>${threshold}` : undefined,
        };
    } else if (value > threshold - warnMargin) {
        return {
            verdict: 'WARN',
            message: metricName ? `${metricName}~${threshold}` : undefined,
        };
    }
    return { verdict: 'PASS' };
}

/**
 * Input for calculating a sample verdict.
 */
export interface SampleMetrics {
    overall: number;
    focusStability: number;
    artifactSeverity: number;
    objectConsistency: number;
    hasBlackFrames?: boolean;
    hasHardFlicker?: boolean;
}

/**
 * Thresholds for sample verdict calculation.
 */
export interface SampleThresholds {
    minOverall: number;
    minFocusStability: number;
    maxArtifactSeverity: number;
    minObjectConsistency: number;
    disallowBlackFrames?: boolean;
    disallowHardFlicker?: boolean;
}

/**
 * Full result of sample verdict calculation.
 */
export interface SampleVerdictResult {
    verdict: Verdict;
    failures: string[];
    warnings: string[];
}

/**
 * Calculate verdict for a complete sample with all metrics.
 * This is the unified function that replaces duplicated logic in UI components.
 * 
 * USE THIS FUNCTION FOR: UI display, per-sample verdicts in panels/reports,
 * showing users "close to failing" warnings, aggregating PASS/WARN/FAIL counts.
 * 
 * DO NOT USE FOR: Runtime quality gating where you only want violations on
 * actual threshold failures. For that, use checkCoherenceThresholds() instead.
 * 
 * SEMANTIC DIFFERENCE: This function has a WARN zone ABOVE threshold.
 * A score of 82 (above threshold 80, but below 85) produces WARN verdict
 * because it "passed but barely."
 * 
 * See Documentation/QA_SEMANTICS.md for full explanation of dual API semantics.
 * 
 * Semantics:
 * - FAIL: Any metric below threshold, or hard failures (blackFrames, hardFlicker)
 * - WARN: All metrics pass but one or more within WARNING_MARGIN of threshold
 * - PASS: All metrics pass with comfortable margin
 * 
 * @param metrics - The sample's quality metrics
 * @param thresholds - The thresholds to check against
 * @param warnMargin - Warning margin (default: WARNING_MARGIN)
 * @returns SampleVerdictResult with verdict and detailed failure/warning messages
 */
export function calculateSampleVerdict(
    metrics: SampleMetrics,
    thresholds: SampleThresholds,
    warnMargin: number = WARNING_MARGIN
): SampleVerdictResult {
    const failures: string[] = [];
    const warnings: string[] = [];

    // Check overall (min threshold)
    const overallResult = calculateMinMetricVerdict(metrics.overall, thresholds.minOverall, warnMargin, 'overall');
    if (overallResult.verdict === 'FAIL' && overallResult.message) failures.push(overallResult.message);
    else if (overallResult.verdict === 'WARN' && overallResult.message) warnings.push(overallResult.message);

    // Check focusStability (min threshold)
    const focusResult = calculateMinMetricVerdict(metrics.focusStability, thresholds.minFocusStability, warnMargin, 'focus');
    if (focusResult.verdict === 'FAIL' && focusResult.message) failures.push(focusResult.message);
    else if (focusResult.verdict === 'WARN' && focusResult.message) warnings.push(focusResult.message);

    // Check artifactSeverity (max threshold - higher is worse)
    const artifactResult = calculateMaxMetricVerdict(metrics.artifactSeverity, thresholds.maxArtifactSeverity, warnMargin, 'artifacts');
    if (artifactResult.verdict === 'FAIL' && artifactResult.message) failures.push(artifactResult.message);
    else if (artifactResult.verdict === 'WARN' && artifactResult.message) warnings.push(artifactResult.message);

    // Check objectConsistency (min threshold)
    const objResult = calculateMinMetricVerdict(metrics.objectConsistency, thresholds.minObjectConsistency, warnMargin, 'objConsist');
    if (objResult.verdict === 'FAIL' && objResult.message) failures.push(objResult.message);
    else if (objResult.verdict === 'WARN' && objResult.message) warnings.push(objResult.message);

    // Hard failures (boolean checks)
    if (thresholds.disallowBlackFrames !== false && metrics.hasBlackFrames) {
        failures.push('hasBlackFrames');
    }
    if (thresholds.disallowHardFlicker !== false && metrics.hasHardFlicker) {
        failures.push('hasHardFlicker');
    }

    // Determine final verdict
    let verdict: Verdict = 'PASS';
    if (failures.length > 0) {
        verdict = 'FAIL';
    } else if (warnings.length > 0) {
        verdict = 'WARN';
    }

    return { verdict, failures, warnings };
}
