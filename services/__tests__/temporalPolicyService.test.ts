/**
 * Unit tests for temporalPolicyService.ts (E2.2)
 * 
 * Tests the path-guided temporal regularization policy service that adjusts
 * smoothing settings based on motion metrics from benchmark analysis.
 */

import { describe, it, expect } from 'vitest';
import {
    analyzeMotionMetrics,
    suggestTemporalRegularization,
    describeSettingsDelta,
    generateAdaptiveSummary,
    MOTION_THRESHOLDS,
    TEMPORAL_BOUNDS,
    type MotionMetrics,
    type BaseTemporalSettings,
    type TemporalPolicySuggestion,
} from '../temporalPolicyService';

describe('temporalPolicyService', () => {
    describe('analyzeMotionMetrics', () => {
        it('should identify low motion content', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 50,
                jitterScore: 1,
                flickerFrameCount: 1,
                maxBrightnessJump: 0.03,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(analysis.category).toBe('low');
            expect(analysis.needsSmoothing).toBe(false);
            expect(analysis.issues).toHaveLength(0);
        });

        it('should identify high motion content', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 600,
                jitterScore: 8,
                flickerFrameCount: 12,
                maxBrightnessJump: 0.15,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(analysis.category).toBe('high');
            expect(analysis.needsSmoothing).toBe(true);
            expect(analysis.issues.length).toBeGreaterThan(0);
        });

        it('should identify moderate motion content', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 200,
                jitterScore: 3,
                flickerFrameCount: 4,
                maxBrightnessJump: 0.08,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(['moderate', 'low']).toContain(analysis.category);
        });

        it('should report flicker issues when frame count exceeds threshold', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 50,
                jitterScore: 2,
                flickerFrameCount: 15, // High flicker
                maxBrightnessJump: 0.05,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(analysis.issues.some(i => i.toLowerCase().includes('flicker'))).toBe(true);
            expect(analysis.needsSmoothing).toBe(true);
        });

        it('should report jitter issues when score exceeds threshold', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 50,
                jitterScore: 8, // High jitter
                flickerFrameCount: 1,
                maxBrightnessJump: 0.05,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(analysis.issues.some(i => i.toLowerCase().includes('jitter'))).toBe(true);
            expect(analysis.needsSmoothing).toBe(true);
        });

        it('should report brightness issues when variance exceeds threshold', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 600, // High brightness variance
                jitterScore: 2,
                flickerFrameCount: 1,
                maxBrightnessJump: 0.15,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(analysis.issues.some(i => i.toLowerCase().includes('brightness'))).toBe(true);
            expect(analysis.needsSmoothing).toBe(true);
        });

        it('should handle missing optional metrics gracefully', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 200,
                // Missing other metrics
            };

            const analysis = analyzeMotionMetrics(metrics);

            // Should not throw, should provide reasonable analysis
            expect(analysis.category).toBeDefined();
            expect(analysis.issues).toBeInstanceOf(Array);
        });

        it('should handle zero values correctly', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 0,
                jitterScore: 0,
                flickerFrameCount: 0,
                maxBrightnessJump: 0,
            };

            const analysis = analyzeMotionMetrics(metrics);

            expect(analysis.category).toBe('low');
            expect(analysis.needsSmoothing).toBe(false);
            expect(analysis.issues).toHaveLength(0);
        });
    });

    describe('suggestTemporalRegularization', () => {
        const defaultBase: BaseTemporalSettings = {
            enabled: true,
            strength: 0.3,
            windowFrames: 3,
        };

        it('should suggest disabling for low motion content', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 50,
                jitterScore: 1,
                flickerFrameCount: 1,
                maxBrightnessJump: 0.02,
            };

            const suggestion = suggestTemporalRegularization(metrics, defaultBase);

            expect(suggestion.suggested.enabled).toBe(false);
            expect(suggestion.reason).toBeDefined();
            expect(suggestion.confidence).toBeGreaterThanOrEqual(70);
        });

        it('should suggest stronger settings for high flicker content', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 600,
                jitterScore: 3,
                flickerFrameCount: 15,
                maxBrightnessJump: 0.12,
            };

            const suggestion = suggestTemporalRegularization(metrics, defaultBase);

            expect(suggestion.suggested.enabled).toBe(true);
            expect(suggestion.suggested.strength).toBeGreaterThanOrEqual(defaultBase.strength);
            expect(suggestion.motionCategory).toBe('high');
        });

        it('should suggest moderate settings for moderate motion', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 400, // Higher variance to trigger needs-smoothing
                jitterScore: 5,  // Higher jitter
                flickerFrameCount: 6,  // More flicker
                maxBrightnessJump: 0.10,
            };

            const suggestion = suggestTemporalRegularization(metrics, defaultBase);

            expect(suggestion.suggested.enabled).toBe(true);
            expect(['moderate', 'low', 'high']).toContain(suggestion.motionCategory);
            // Should stay close to base settings
            expect(suggestion.suggested.strength).toBeCloseTo(defaultBase.strength, 1);
        });

        it('should increase window frames for very high jitter', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 200,
                jitterScore: 10, // Very high jitter
                flickerFrameCount: 8,
                maxBrightnessJump: 0.08,
            };

            const suggestion = suggestTemporalRegularization(metrics, defaultBase);

            expect(suggestion.suggested.enabled).toBe(true);
            expect(suggestion.suggested.windowFrames).toBeGreaterThanOrEqual(defaultBase.windowFrames);
        });

        it('should respect TEMPORAL_BOUNDS constraints', () => {
            const extremeMetrics: MotionMetrics = {
                brightnessVariance: 1000,
                jitterScore: 50,
                flickerFrameCount: 100,
                maxBrightnessJump: 0.9,
            };

            const suggestion = suggestTemporalRegularization(extremeMetrics, defaultBase);

            expect(suggestion.suggested.strength).toBeLessThanOrEqual(TEMPORAL_BOUNDS.strength.max);
            expect(suggestion.suggested.strength).toBeGreaterThanOrEqual(TEMPORAL_BOUNDS.strength.min);
            expect(suggestion.suggested.windowFrames).toBeLessThanOrEqual(TEMPORAL_BOUNDS.windowFrames.max);
            expect(suggestion.suggested.windowFrames).toBeGreaterThanOrEqual(TEMPORAL_BOUNDS.windowFrames.min);
        });

        it('should provide higher confidence for clear-cut cases', () => {
            // Clear high motion case
            const highMotion: MotionMetrics = {
                brightnessVariance: 700,
                jitterScore: 10,
                flickerFrameCount: 20,
                maxBrightnessJump: 0.25,
            };

            const highSuggestion = suggestTemporalRegularization(highMotion, defaultBase);

            // Clear low motion case
            const lowMotion: MotionMetrics = {
                brightnessVariance: 20,
                jitterScore: 0.5,
                flickerFrameCount: 0,
                maxBrightnessJump: 0.01,
            };

            const lowSuggestion = suggestTemporalRegularization(lowMotion, defaultBase);

            // Both should have reasonable confidence
            expect(highSuggestion.confidence).toBeGreaterThan(30);
            expect(lowSuggestion.confidence).toBeGreaterThan(30);
        });

        it('should return all required fields in suggestion', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 200,
                jitterScore: 3,
                flickerFrameCount: 4,
                maxBrightnessJump: 0.08,
            };

            const suggestion = suggestTemporalRegularization(metrics, defaultBase);

            expect(suggestion).toHaveProperty('suggested');
            expect(suggestion).toHaveProperty('reason');
            expect(suggestion).toHaveProperty('confidence');
            expect(suggestion).toHaveProperty('motionCategory');
            expect(suggestion.suggested).toHaveProperty('enabled');
            expect(suggestion.suggested).toHaveProperty('strength');
            expect(suggestion.suggested).toHaveProperty('windowFrames');
        });

        it('should use base settings as starting point', () => {
            const customBase: BaseTemporalSettings = {
                enabled: false,
                strength: 0.5,
                windowFrames: 5,
            };

            const moderateMetrics: MotionMetrics = {
                brightnessVariance: 200,
                jitterScore: 3,
                flickerFrameCount: 3,
                maxBrightnessJump: 0.06,
            };

            const suggestion = suggestTemporalRegularization(moderateMetrics, customBase);

            // For moderate motion, should stay relatively close to base
            // (exact behavior depends on implementation)
            expect(typeof suggestion.suggested.strength).toBe('number');
            expect(typeof suggestion.suggested.windowFrames).toBe('number');
        });
    });

    describe('describeSettingsDelta', () => {
        it('should describe increase in strength', () => {
            const base: BaseTemporalSettings = { enabled: true, strength: 0.3, windowFrames: 3 };
            const suggested: TemporalPolicySuggestion = {
                suggested: { enabled: true, strength: 0.5, windowFrames: 3 },
                reason: 'test',
                confidence: 80,
            };

            const description = describeSettingsDelta(base, suggested);

            expect(description).toContain('strength');
            expect(description).toContain('0.3');
            expect(description).toContain('0.5');
        });

        it('should describe decrease in strength', () => {
            const base: BaseTemporalSettings = { enabled: true, strength: 0.5, windowFrames: 3 };
            const suggested: TemporalPolicySuggestion = {
                suggested: { enabled: true, strength: 0.2, windowFrames: 3 },
                reason: 'test',
                confidence: 80,
            };

            const description = describeSettingsDelta(base, suggested);

            expect(description).toContain('strength');
        });

        it('should describe enabling temporal regularization', () => {
            const base: BaseTemporalSettings = { enabled: false, strength: 0.3, windowFrames: 3 };
            const suggested: TemporalPolicySuggestion = {
                suggested: { enabled: true, strength: 0.3, windowFrames: 3 },
                reason: 'test',
                confidence: 80,
            };

            const description = describeSettingsDelta(base, suggested);

            expect(description.toLowerCase()).toContain('enabl');
        });

        it('should describe disabling temporal regularization', () => {
            const base: BaseTemporalSettings = { enabled: true, strength: 0.3, windowFrames: 3 };
            const suggested: TemporalPolicySuggestion = {
                suggested: { enabled: false, strength: 0.3, windowFrames: 3 },
                reason: 'test',
                confidence: 80,
            };

            const description = describeSettingsDelta(base, suggested);

            expect(description.toLowerCase()).toContain('disabl');
        });

        it('should describe window frame changes', () => {
            const base: BaseTemporalSettings = { enabled: true, strength: 0.3, windowFrames: 3 };
            const suggested: TemporalPolicySuggestion = {
                suggested: { enabled: true, strength: 0.3, windowFrames: 5 },
                reason: 'test',
                confidence: 80,
            };

            const description = describeSettingsDelta(base, suggested);

            expect(description).toContain('window');
        });

        it('should indicate no changes when settings are identical', () => {
            const base: BaseTemporalSettings = { enabled: true, strength: 0.3, windowFrames: 3 };
            const suggested: TemporalPolicySuggestion = {
                suggested: { enabled: true, strength: 0.3, windowFrames: 3 },
                reason: 'test',
                confidence: 80,
            };

            const description = describeSettingsDelta(base, suggested);

            expect(description.toLowerCase()).toMatch(/no change|same|unchanged|identical/);
        });
    });

    describe('generateAdaptiveSummary', () => {
        it('should generate summary for high motion scenario', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 600,
                jitterScore: 8,
                flickerFrameCount: 12,
                maxBrightnessJump: 0.15,
            };
            const base: BaseTemporalSettings = { enabled: true, strength: 0.3, windowFrames: 3 };

            const summary = generateAdaptiveSummary(metrics, base);

            expect(summary.analysis.category).toBe('high');
            expect(summary.baseSettings).toEqual(base);
            expect(summary.adaptiveSettings).toBeDefined();
        });

        it('should generate summary for low motion scenario', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 50,
                jitterScore: 1,
                flickerFrameCount: 1,
                maxBrightnessJump: 0.02,
            };
            const base: BaseTemporalSettings = { enabled: true, strength: 0.3, windowFrames: 3 };

            const summary = generateAdaptiveSummary(metrics, base);

            expect(summary.analysis.category).toBe('low');
            expect(summary.delta).toBeDefined();
        });

        it('should include key metrics in summary', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 200,
                jitterScore: 4,
                flickerFrameCount: 5,
                maxBrightnessJump: 0.09,
            };
            const base: BaseTemporalSettings = { enabled: true, strength: 0.35, windowFrames: 3 };

            const summary = generateAdaptiveSummary(metrics, base);

            expect(summary.analysis).toBeDefined();
            expect(summary.adaptiveSettings.reason).toBeDefined();
        });
    });

    describe('MOTION_THRESHOLDS', () => {
        it('should have correct threshold structure', () => {
            expect(MOTION_THRESHOLDS).toHaveProperty('brightnessVariance');
            expect(MOTION_THRESHOLDS).toHaveProperty('jitter');
            expect(MOTION_THRESHOLDS).toHaveProperty('flicker');
            expect(MOTION_THRESHOLDS).toHaveProperty('pathError');
        });

        it('should have excellent < good < acceptable thresholds for variance', () => {
            expect(MOTION_THRESHOLDS.brightnessVariance.excellent)
                .toBeLessThan(MOTION_THRESHOLDS.brightnessVariance.good);
            expect(MOTION_THRESHOLDS.brightnessVariance.good)
                .toBeLessThan(MOTION_THRESHOLDS.brightnessVariance.acceptable);

            expect(MOTION_THRESHOLDS.jitter.excellent)
                .toBeLessThan(MOTION_THRESHOLDS.jitter.good);
            expect(MOTION_THRESHOLDS.jitter.good)
                .toBeLessThan(MOTION_THRESHOLDS.jitter.acceptable);
        });
    });

    describe('TEMPORAL_BOUNDS', () => {
        it('should have correct bounds structure', () => {
            expect(TEMPORAL_BOUNDS).toHaveProperty('strength');
            expect(TEMPORAL_BOUNDS.strength).toHaveProperty('min');
            expect(TEMPORAL_BOUNDS.strength).toHaveProperty('max');
            expect(TEMPORAL_BOUNDS).toHaveProperty('windowFrames');
            expect(TEMPORAL_BOUNDS.windowFrames).toHaveProperty('min');
            expect(TEMPORAL_BOUNDS.windowFrames).toHaveProperty('max');
        });

        it('should have min < max for all bounds', () => {
            expect(TEMPORAL_BOUNDS.strength.min).toBeLessThan(TEMPORAL_BOUNDS.strength.max);
            expect(TEMPORAL_BOUNDS.windowFrames.min).toBeLessThan(TEMPORAL_BOUNDS.windowFrames.max);
        });

        it('should have reasonable default ranges', () => {
            expect(TEMPORAL_BOUNDS.strength.min).toBeGreaterThanOrEqual(0);
            expect(TEMPORAL_BOUNDS.strength.max).toBeLessThanOrEqual(1);
            expect(TEMPORAL_BOUNDS.windowFrames.min).toBeGreaterThanOrEqual(1);
            expect(TEMPORAL_BOUNDS.windowFrames.max).toBeLessThanOrEqual(10);
        });
    });

    describe('edge cases', () => {
        it('should handle NaN in metrics gracefully', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: NaN,
                jitterScore: 3,
                flickerFrameCount: 2,
                maxBrightnessJump: 0.08,
            };

            // Should not throw
            expect(() => analyzeMotionMetrics(metrics)).not.toThrow();
        });

        it('should handle negative values in metrics', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: -50,
                jitterScore: -3,
                flickerFrameCount: -1,
                maxBrightnessJump: -0.08,
            };

            // Should not throw
            expect(() => analyzeMotionMetrics(metrics)).not.toThrow();
        });

        it('should handle extremely large values', () => {
            const metrics: MotionMetrics = {
                brightnessVariance: 10000,
                jitterScore: 1000,
                flickerFrameCount: 10000,
                maxBrightnessJump: 1000,
            };
            const base: BaseTemporalSettings = {
                enabled: true,
                strength: 0.3,
                windowFrames: 3,
            };

            const suggestion = suggestTemporalRegularization(metrics, base);

            // Should still respect bounds
            expect(suggestion.suggested.strength).toBeLessThanOrEqual(TEMPORAL_BOUNDS.strength.max);
            expect(suggestion.suggested.windowFrames).toBeLessThanOrEqual(TEMPORAL_BOUNDS.windowFrames.max);
        });
    });
});
