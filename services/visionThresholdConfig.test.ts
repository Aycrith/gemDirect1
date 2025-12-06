/**
 * Tests for Vision Threshold Configuration
 * 
 * Validates WARN vs FAIL semantics for unified QA threshold logic.
 * See Documentation/QA_SEMANTICS.md for detailed semantics.
 * 
 * @module services/visionThresholdConfig.test
 */

import { describe, it, expect } from 'vitest';
import {
    WARNING_MARGIN,
    DEFAULT_COHERENCE_THRESHOLDS,
    calculateMinMetricVerdict,
    calculateMaxMetricVerdict,
    calculateSampleVerdict,
    checkCoherenceThresholds,
    getRuntimeCoherenceThresholds,
} from './visionThresholdConfig';

// ============================================================================
// Constants Tests
// ============================================================================

describe('visionThresholdConfig constants', () => {
    it('WARNING_MARGIN should be 5 (matches vision-thresholds.json)', () => {
        expect(WARNING_MARGIN).toBe(5);
    });

    it('DEFAULT_COHERENCE_THRESHOLDS should match globalDefaults from vision-thresholds.json', () => {
        expect(DEFAULT_COHERENCE_THRESHOLDS.minOverall).toBe(80);
        expect(DEFAULT_COHERENCE_THRESHOLDS.minFocusStability).toBe(85);
        expect(DEFAULT_COHERENCE_THRESHOLDS.maxArtifactSeverity).toBe(40);
        expect(DEFAULT_COHERENCE_THRESHOLDS.minObjectConsistency).toBe(85);
        expect(DEFAULT_COHERENCE_THRESHOLDS.disallowBlackFrames).toBe(true);
        expect(DEFAULT_COHERENCE_THRESHOLDS.disallowHardFlicker).toBe(true);
    });

    it('getRuntimeCoherenceThresholds returns copy of defaults', () => {
        const thresholds = getRuntimeCoherenceThresholds();
        expect(thresholds).toEqual(DEFAULT_COHERENCE_THRESHOLDS);
        expect(thresholds).not.toBe(DEFAULT_COHERENCE_THRESHOLDS); // Should be a copy
    });
});

// ============================================================================
// calculateMinMetricVerdict Tests
// ============================================================================

describe('calculateMinMetricVerdict (higher is better)', () => {
    const threshold = 80;
    const margin = 5;

    describe('PASS scenarios', () => {
        it('returns PASS when value is well above threshold', () => {
            const result = calculateMinMetricVerdict(90, threshold, margin);
            expect(result.verdict).toBe('PASS');
            expect(result.message).toBeUndefined();
        });

        it('returns PASS when value equals threshold + margin', () => {
            // At exactly 85 (80 + 5), we're at the edge of warning zone but still pass
            const result = calculateMinMetricVerdict(85, threshold, margin);
            expect(result.verdict).toBe('PASS');
        });

        it('returns PASS when value is 1 point above warning zone', () => {
            const result = calculateMinMetricVerdict(86, threshold, margin);
            expect(result.verdict).toBe('PASS');
        });
    });

    describe('WARN scenarios', () => {
        it('returns WARN when value is within margin above threshold', () => {
            // 81 is above threshold (80) but within warning margin (5)
            const result = calculateMinMetricVerdict(81, threshold, margin, 'overall');
            expect(result.verdict).toBe('WARN');
            expect(result.message).toBe('overall~80');
        });

        it('returns WARN when value equals threshold exactly', () => {
            const result = calculateMinMetricVerdict(80, threshold, margin, 'overall');
            expect(result.verdict).toBe('WARN');
        });

        it('returns WARN at upper edge of warning zone', () => {
            // 84 is within margin (80 + 5 = 85, so 84 is still warning)
            const result = calculateMinMetricVerdict(84, threshold, margin);
            expect(result.verdict).toBe('WARN');
        });
    });

    describe('FAIL scenarios', () => {
        it('returns FAIL when value is below threshold', () => {
            const result = calculateMinMetricVerdict(79, threshold, margin, 'overall');
            expect(result.verdict).toBe('FAIL');
            expect(result.message).toBe('overall<80');
        });

        it('returns FAIL when value is significantly below threshold', () => {
            const result = calculateMinMetricVerdict(50, threshold, margin);
            expect(result.verdict).toBe('FAIL');
        });

        it('returns FAIL when value is 1 point below threshold', () => {
            const result = calculateMinMetricVerdict(79, threshold, margin);
            expect(result.verdict).toBe('FAIL');
        });
    });
});

// ============================================================================
// calculateMaxMetricVerdict Tests (artifacts - lower is better)
// ============================================================================

describe('calculateMaxMetricVerdict (lower is better)', () => {
    const threshold = 40; // maxArtifactSeverity
    const margin = 5;

    describe('PASS scenarios', () => {
        it('returns PASS when value is well below threshold', () => {
            const result = calculateMaxMetricVerdict(30, threshold, margin);
            expect(result.verdict).toBe('PASS');
        });

        it('returns PASS when value equals threshold - margin', () => {
            // At exactly 35 (40 - 5), we're at the edge of warning zone but still pass
            const result = calculateMaxMetricVerdict(35, threshold, margin);
            expect(result.verdict).toBe('PASS');
        });

        it('returns PASS when value is 1 point below warning zone', () => {
            const result = calculateMaxMetricVerdict(34, threshold, margin);
            expect(result.verdict).toBe('PASS');
        });
    });

    describe('WARN scenarios', () => {
        it('returns WARN when value is within margin below threshold', () => {
            // 39 is below threshold (40) but within warning margin
            const result = calculateMaxMetricVerdict(39, threshold, margin, 'artifacts');
            expect(result.verdict).toBe('WARN');
            expect(result.message).toBe('artifacts~40');
        });

        it('returns WARN when value equals threshold exactly', () => {
            const result = calculateMaxMetricVerdict(40, threshold, margin, 'artifacts');
            expect(result.verdict).toBe('WARN');
        });

        it('returns WARN at lower edge of warning zone', () => {
            // 36 is within margin (40 - 5 = 35, so 36 is still warning)
            const result = calculateMaxMetricVerdict(36, threshold, margin);
            expect(result.verdict).toBe('WARN');
        });
    });

    describe('FAIL scenarios', () => {
        it('returns FAIL when value is above threshold', () => {
            const result = calculateMaxMetricVerdict(41, threshold, margin, 'artifacts');
            expect(result.verdict).toBe('FAIL');
            expect(result.message).toBe('artifacts>40');
        });

        it('returns FAIL when value is significantly above threshold', () => {
            const result = calculateMaxMetricVerdict(70, threshold, margin);
            expect(result.verdict).toBe('FAIL');
        });
    });
});

// ============================================================================
// calculateSampleVerdict Tests
// ============================================================================

describe('calculateSampleVerdict', () => {
    const defaultThresholds = {
        minOverall: 80,
        minFocusStability: 85,
        maxArtifactSeverity: 40,
        minObjectConsistency: 85,
    };

    describe('PASS verdict', () => {
        it('returns PASS when all metrics comfortably pass', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 90,
                    focusStability: 95,
                    artifactSeverity: 20,
                    objectConsistency: 95,
                    hasBlackFrames: false,
                    hasHardFlicker: false,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('PASS');
            expect(result.failures).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
        });
    });

    describe('WARN verdict', () => {
        it('returns WARN when one metric is in warning zone', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 82, // Warning zone (80 + 5 = 85, 82 < 85)
                    focusStability: 95,
                    artifactSeverity: 20,
                    objectConsistency: 95,
                    hasBlackFrames: false,
                    hasHardFlicker: false,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('WARN');
            expect(result.warnings).toContain('overall~80');
            expect(result.failures).toHaveLength(0);
        });

        it('returns WARN when artifact severity is in warning zone', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 90,
                    focusStability: 95,
                    artifactSeverity: 38, // Warning zone (40 - 5 = 35, 38 > 35)
                    objectConsistency: 95,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('WARN');
            expect(result.warnings).toContain('artifacts~40');
        });

        it('returns WARN when multiple metrics are in warning zone', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 82,
                    focusStability: 87, // Warning zone
                    artifactSeverity: 20,
                    objectConsistency: 95,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('WARN');
            expect(result.warnings.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('FAIL verdict', () => {
        it('returns FAIL when one metric fails threshold', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 70, // Below 80
                    focusStability: 95,
                    artifactSeverity: 20,
                    objectConsistency: 95,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('FAIL');
            expect(result.failures).toContain('overall<80');
        });

        it('returns FAIL when artifact severity exceeds threshold', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 90,
                    focusStability: 95,
                    artifactSeverity: 50, // Above 40
                    objectConsistency: 95,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('FAIL');
            expect(result.failures).toContain('artifacts>40');
        });

        it('returns FAIL when hasBlackFrames is true', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 90,
                    focusStability: 95,
                    artifactSeverity: 20,
                    objectConsistency: 95,
                    hasBlackFrames: true,
                    hasHardFlicker: false,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('FAIL');
            expect(result.failures).toContain('hasBlackFrames');
        });

        it('returns FAIL when hasHardFlicker is true', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 90,
                    focusStability: 95,
                    artifactSeverity: 20,
                    objectConsistency: 95,
                    hasBlackFrames: false,
                    hasHardFlicker: true,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('FAIL');
            expect(result.failures).toContain('hasHardFlicker');
        });

        it('returns FAIL with multiple failures', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 70,
                    focusStability: 60,
                    artifactSeverity: 60,
                    objectConsistency: 70,
                    hasBlackFrames: true,
                    hasHardFlicker: true,
                },
                defaultThresholds
            );
            expect(result.verdict).toBe('FAIL');
            expect(result.failures.length).toBeGreaterThanOrEqual(6);
        });
    });

    describe('custom warnMargin', () => {
        it('uses custom warnMargin when provided', () => {
            // With warnMargin=10, value of 82 should WARN (since 80+10=90, 82<90)
            const result = calculateSampleVerdict(
                {
                    overall: 82,
                    focusStability: 95,
                    artifactSeverity: 20,
                    objectConsistency: 95,
                },
                defaultThresholds,
                10 // Custom margin
            );
            expect(result.verdict).toBe('WARN');
        });

        it('with warnMargin=0, no warning zone exists', () => {
            // With warnMargin=0, value of 80 should be at exact threshold
            // The logic is: WARN if value < threshold + margin, so 80 < 80 + 0 = false → PASS
            const result = calculateSampleVerdict(
                {
                    overall: 80,
                    focusStability: 85,
                    artifactSeverity: 40,
                    objectConsistency: 85,
                },
                defaultThresholds,
                0 // No warning margin
            );
            // With margin=0, exactly at threshold means we're NOT in warn zone
            // But we need to check the logic: if value < threshold, it fails
            // if value < threshold + margin (0), it warns (but 80 is not < 80)
            // So 80 should PASS with margin=0
            expect(result.verdict).toBe('PASS');
        });
    });
});

// ============================================================================
// checkCoherenceThresholds Integration Tests
// ============================================================================

describe('checkCoherenceThresholds', () => {
    it('returns pass decision when all metrics pass', () => {
        const result = checkCoherenceThresholds({
            overall: 90,
            focusStability: 95,
            artifactSeverity: 20,
            objectConsistency: 95,
            hasBlackFrames: false,
            hasHardFlicker: false,
        });
        expect(result.decision).toBe('pass');
        expect(result.passes).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it('returns warn decision when metrics are just below threshold (within margin)', () => {
        // NOTE: checkCoherenceThresholds has different semantics than calculateSampleVerdict:
        // - It only flags values that are BELOW threshold
        // - Severity is 'warning' if within WARNING_MARGIN below threshold, 'error' if further below
        // For value of 78 (below 80, but within 5 points), it should be a warning
        const result = checkCoherenceThresholds({
            overall: 78, // Below threshold (80), within margin (75-80)
            focusStability: 95,
            artifactSeverity: 20,
            objectConsistency: 95,
        });
        expect(result.decision).toBe('warn');
        expect(result.passes).toBe(true); // Warnings don't fail
        expect(result.violations.some(v => v.severity === 'warning')).toBe(true);
    });

    it('returns pass when metrics are above threshold (no warning zone above)', () => {
        // NOTE: checkCoherenceThresholds does NOT have a "warning zone" above threshold
        // Value of 82 is above threshold 80, so it passes completely
        const result = checkCoherenceThresholds({
            overall: 82, // Above threshold - passes
            focusStability: 95,
            artifactSeverity: 20,
            objectConsistency: 95,
        });
        expect(result.decision).toBe('pass');
        expect(result.violations).toHaveLength(0);
    });

    it('returns fail decision when metrics fail', () => {
        const result = checkCoherenceThresholds({
            overall: 70, // Below threshold
            focusStability: 95,
            artifactSeverity: 20,
            objectConsistency: 95,
        });
        expect(result.decision).toBe('fail');
        expect(result.passes).toBe(false);
        expect(result.violations.some(v => v.severity === 'error')).toBe(true);
    });

    it('returns fail for black frames when disallowed', () => {
        const result = checkCoherenceThresholds({
            overall: 90,
            focusStability: 95,
            artifactSeverity: 20,
            objectConsistency: 95,
            hasBlackFrames: true,
        });
        expect(result.decision).toBe('fail');
        expect(result.violations.some(v => v.metric === 'blackFrames')).toBe(true);
    });

    it('returns fail for hard flicker when disallowed', () => {
        const result = checkCoherenceThresholds({
            overall: 90,
            focusStability: 95,
            artifactSeverity: 20,
            objectConsistency: 95,
            hasHardFlicker: true,
        });
        expect(result.decision).toBe('fail');
        expect(result.violations.some(v => v.metric === 'hardFlicker')).toBe(true);
    });
});

// ============================================================================
// Edge Cases and Boundary Tests
// ============================================================================

describe('boundary value tests', () => {
    describe('exactly at threshold boundaries', () => {
        // Test thresholds for boundary tests (values used inline below):
        // minOverall: 80, minFocusStability: 85, maxArtifactSeverity: 40, minObjectConsistency: 85

        it('value exactly at min threshold is in WARN zone', () => {
            const result = calculateMinMetricVerdict(80, 80, 5);
            expect(result.verdict).toBe('WARN');
        });

        it('value exactly at max threshold is in WARN zone', () => {
            const result = calculateMaxMetricVerdict(40, 40, 5);
            expect(result.verdict).toBe('WARN');
        });

        it('value 1 below min threshold FAILs', () => {
            const result = calculateMinMetricVerdict(79, 80, 5);
            expect(result.verdict).toBe('FAIL');
        });

        it('value 1 above max threshold FAILs', () => {
            const result = calculateMaxMetricVerdict(41, 40, 5);
            expect(result.verdict).toBe('FAIL');
        });
    });

    describe('extreme values', () => {
        it('handles 0 values correctly', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 0,
                    focusStability: 0,
                    artifactSeverity: 0, // Actually good for artifacts
                    objectConsistency: 0,
                },
                { minOverall: 80, minFocusStability: 85, maxArtifactSeverity: 40, minObjectConsistency: 85 }
            );
            expect(result.verdict).toBe('FAIL');
            // Artifacts at 0 should pass (lower is better)
            expect(result.failures).not.toContain('artifacts>40');
        });

        it('handles 100 values correctly', () => {
            const result = calculateSampleVerdict(
                {
                    overall: 100,
                    focusStability: 100,
                    artifactSeverity: 100, // Very bad for artifacts
                    objectConsistency: 100,
                },
                { minOverall: 80, minFocusStability: 85, maxArtifactSeverity: 40, minObjectConsistency: 85 }
            );
            expect(result.verdict).toBe('FAIL');
            expect(result.failures).toContain('artifacts>40');
            // Other metrics should pass
            expect(result.failures).not.toContain('overall<80');
        });
    });
});
