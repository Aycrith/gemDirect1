/**
 * Golden Scenario Tests for Video Quality Gate Service
 * 
 * These tests encode expected decisions for:
 * - Golden-like bookend video scores (based on real FLF2V regression data)
 * - Borderline scenarios (near thresholds with warnings)
 * - Bad-case scenarios (clear failures)
 * 
 * The thresholds are calibrated for the FLF2V model which produces
 * ~35-40% pixel similarity even with correct endpoint preservation.
 * 
 * Current DEFAULT_QUALITY_THRESHOLDS:
 * - minStartFrameMatch: 30 (calibrated for FLF2V)
 * - minEndFrameMatch: 30 (calibrated for FLF2V)
 * - minMotionQuality: 60
 * - minPromptAdherence: 60
 * - minVideoOverallScore: 70
 * 
 * WARNING_MARGIN: 10 (scores within 10 of threshold are warnings, not errors)
 */

import { describe, it, expect } from 'vitest';
import {
    videoPassesQualityGate,
    DEFAULT_QUALITY_THRESHOLDS,
} from '../videoQualityGateService';
import type { VideoFeedbackResult } from '../videoFeedbackService';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a VideoFeedbackResult with specified scores
 */
function createScores(scores: {
    startFrameMatch: number;
    endFrameMatch: number;
    motionQuality: number;
    promptAdherence: number;
    overall: number;
}): VideoFeedbackResult {
    return {
        sceneId: 'test-scene',
        scores,
        issues: [],
        suggestions: [],
        summary: 'Test feedback',
        modelUsed: 'test-model',
        analyzedAt: Date.now(),
        responseTimeMs: 100,
    };
}

/**
 * Import and test checkViolations + determineDecision directly
 * These are not exported, so we test via videoPassesQualityGate
 * which internally uses these functions.
 */

// ============================================================================
// Threshold Constants for Tests
// ============================================================================

// These should match DEFAULT_QUALITY_THRESHOLDS in videoQualityGateService.ts
const THRESHOLDS = {
    minStartFrameMatch: 30,
    minEndFrameMatch: 30,
    minMotionQuality: 60,
    minPromptAdherence: 60,
    minVideoOverallScore: 70,
};

// WARNING_MARGIN is 10 in the service (scores within 10 of threshold are warnings, not errors)

// ============================================================================
// Golden-Like Scenario Tests
// ============================================================================

describe('Golden-Like Scenario: Should PASS or WARN, never FAIL', () => {
    /**
     * These scores are based on real FLF2V regression results:
     * - sample-001-geometric: start=35.5%, end=40.8%, avg=38.2%
     * - sample-002-character: start=50%, end=52.8%, avg=51.4%
     * - sample-003-environment: start=54.4%, end=54.2%, avg=54.3%
     */

    it('should PASS for sample-001-geometric-like scores', () => {
        // Simulates geometric sample: ~38% frame match, good motion/prompt
        const goldenLikeScores = createScores({
            startFrameMatch: 36,   // Above 30 threshold
            endFrameMatch: 41,     // Above 30 threshold
            motionQuality: 75,     // Clearly above 60
            promptAdherence: 80,   // Clearly above 60
            overall: 78,           // Above 70
        });

        const passes = videoPassesQualityGate(goldenLikeScores);
        expect(passes).toBe(true);
    });

    it('should PASS for sample-002-character-like scores', () => {
        // Simulates character sample: ~51% frame match
        const goldenLikeScores = createScores({
            startFrameMatch: 50,
            endFrameMatch: 53,
            motionQuality: 72,
            promptAdherence: 75,
            overall: 75,
        });

        const passes = videoPassesQualityGate(goldenLikeScores);
        expect(passes).toBe(true);
    });

    it('should PASS for sample-003-environment-like scores', () => {
        // Simulates environment sample: ~54% frame match
        const goldenLikeScores = createScores({
            startFrameMatch: 54,
            endFrameMatch: 54,
            motionQuality: 70,
            promptAdherence: 72,
            overall: 73,
        });

        const passes = videoPassesQualityGate(goldenLikeScores);
        expect(passes).toBe(true);
    });

    it('should PASS with all scores comfortably above thresholds', () => {
        const strongScores = createScores({
            startFrameMatch: 45,   // Above 30
            endFrameMatch: 48,     // Above 30
            motionQuality: 75,     // Above 60
            promptAdherence: 80,   // Above 60
            overall: 78,           // Above 70
        });

        const passes = videoPassesQualityGate(strongScores);
        expect(passes).toBe(true);
    });

    it('should not have error-level violations for golden-like scores', () => {
        // This test verifies the internal violation severity logic
        // If startFrameMatch=36 and threshold=30, diff=6 < WARNING_MARGIN(10)
        // So if there were a violation, it would be warning-level, not error
        const goldenScores = createScores({
            startFrameMatch: 36,
            endFrameMatch: 40,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 75,
        });

        // videoPassesQualityGate returns true if no error-level violations
        expect(videoPassesQualityGate(goldenScores)).toBe(true);
    });
});

// ============================================================================
// Borderline Scenario Tests
// ============================================================================

describe('Borderline Scenario: Should yield WARNING, not FAIL', () => {
    /**
     * Scores just above thresholds but within WARNING_MARGIN
     * These should trigger warnings but not failures
     */

    it('should PASS (with internal warnings) when scores are 1 above thresholds', () => {
        const borderlineScores = createScores({
            startFrameMatch: THRESHOLDS.minStartFrameMatch + 1,  // 31
            endFrameMatch: THRESHOLDS.minEndFrameMatch + 1,      // 31
            motionQuality: THRESHOLDS.minMotionQuality + 1,      // 61
            promptAdherence: THRESHOLDS.minPromptAdherence + 1,  // 61
            overall: THRESHOLDS.minVideoOverallScore + 1,        // 71
        });

        // Should pass because no violations (all above threshold)
        const passes = videoPassesQualityGate(borderlineScores);
        expect(passes).toBe(true);
    });

    it('should PASS when startFrameMatch is exactly at threshold', () => {
        const atThresholdScores = createScores({
            startFrameMatch: THRESHOLDS.minStartFrameMatch,      // 30 (at threshold, not below)
            endFrameMatch: 45,
            motionQuality: 75,
            promptAdherence: 75,
            overall: 75,
        });

        // At threshold = no violation
        const passes = videoPassesQualityGate(atThresholdScores);
        expect(passes).toBe(true);
    });

    it('should still PASS when scores are slightly below threshold (warning range)', () => {
        // Scores in warning range: threshold - WARNING_MARGIN < score < threshold
        // e.g., minStartFrameMatch=30, WARNING_MARGIN=10
        // So scores 20-29 are warning-level violations (not error)
        const warningRangeScores = createScores({
            startFrameMatch: THRESHOLDS.minStartFrameMatch - 5,  // 25 (in warning range)
            endFrameMatch: 45,
            motionQuality: 75,
            promptAdherence: 75,
            overall: 75,
        });

        // videoPassesQualityGate returns true if no ERROR-level violations
        // warning-level violations don't cause failure
        const passes = videoPassesQualityGate(warningRangeScores);
        expect(passes).toBe(true);
    });
});

// ============================================================================
// Bad-Case Scenario Tests
// ============================================================================

describe('Bad-Case Scenario: Should FAIL', () => {
    /**
     * Scores clearly below thresholds - should trigger error-level violations
     * Error threshold = threshold - WARNING_MARGIN
     */

    it('should FAIL when all scores are 20 below thresholds', () => {
        const badScores = createScores({
            startFrameMatch: THRESHOLDS.minStartFrameMatch - 20,   // 10
            endFrameMatch: THRESHOLDS.minEndFrameMatch - 20,       // 10
            motionQuality: THRESHOLDS.minMotionQuality - 20,       // 40
            promptAdherence: THRESHOLDS.minPromptAdherence - 20,   // 40
            overall: THRESHOLDS.minVideoOverallScore - 20,         // 50
        });

        const passes = videoPassesQualityGate(badScores);
        expect(passes).toBe(false);
    });

    it('should FAIL when startFrameMatch is way below threshold (error range)', () => {
        // Error range: score < threshold - WARNING_MARGIN
        // e.g., score < 30 - 10 = 20
        const frameMatchFailure = createScores({
            startFrameMatch: 15,   // Way below 30, in error range
            endFrameMatch: 45,     // OK
            motionQuality: 75,     // OK
            promptAdherence: 75,   // OK
            overall: 65,           // Below 70, but in warning range (not error)
        });

        const passes = videoPassesQualityGate(frameMatchFailure);
        expect(passes).toBe(false);
    });

    it('should FAIL when overall score is in error range', () => {
        const overallFailure = createScores({
            startFrameMatch: 45,
            endFrameMatch: 45,
            motionQuality: 75,
            promptAdherence: 75,
            overall: 55,  // Below 70 - 10 = 60, so error-level
        });

        const passes = videoPassesQualityGate(overallFailure);
        expect(passes).toBe(false);
    });

    it('should FAIL when multiple metrics are in error range', () => {
        const multipleFailures = createScores({
            startFrameMatch: 10,   // Error
            endFrameMatch: 10,     // Error
            motionQuality: 40,     // Error (below 60-10=50)
            promptAdherence: 40,   // Error
            overall: 35,           // Error
        });

        const passes = videoPassesQualityGate(multipleFailures);
        expect(passes).toBe(false);
    });

    it('should FAIL when only motion quality is severely degraded', () => {
        const motionFailure = createScores({
            startFrameMatch: 50,   // Good
            endFrameMatch: 50,     // Good
            motionQuality: 45,     // Below 60-10=50, error-level
            promptAdherence: 70,   // Good
            overall: 60,           // Below 70, in warning range
        });

        const passes = videoPassesQualityGate(motionFailure);
        expect(passes).toBe(false);
    });
});

// ============================================================================
// Threshold Validation Tests
// ============================================================================

describe('DEFAULT_QUALITY_THRESHOLDS calibration', () => {
    it('should have FLF2V-calibrated frame match thresholds', () => {
        // Verify the thresholds are set for FLF2V model behavior
        expect(DEFAULT_QUALITY_THRESHOLDS.minStartFrameMatch).toBe(30);
        expect(DEFAULT_QUALITY_THRESHOLDS.minEndFrameMatch).toBe(30);
    });

    it('should have standard thresholds for other metrics', () => {
        expect(DEFAULT_QUALITY_THRESHOLDS.minMotionQuality).toBe(60);
        expect(DEFAULT_QUALITY_THRESHOLDS.minPromptAdherence).toBe(60);
        expect(DEFAULT_QUALITY_THRESHOLDS.minVideoOverallScore).toBe(70);
    });

    it('should allow golden regression samples to pass quality gate', () => {
        // All three golden samples should pass:
        // 001: avg 38.2%, 002: avg 51.4%, 003: avg 54.3%
        // With minStartFrameMatch=30, all should pass

        const sample001 = createScores({
            startFrameMatch: 35.5,
            endFrameMatch: 40.8,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 72,
        });

        const sample002 = createScores({
            startFrameMatch: 50,
            endFrameMatch: 52.8,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 72,
        });

        const sample003 = createScores({
            startFrameMatch: 54.4,
            endFrameMatch: 54.2,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 72,
        });

        expect(videoPassesQualityGate(sample001)).toBe(true);
        expect(videoPassesQualityGate(sample002)).toBe(true);
        expect(videoPassesQualityGate(sample003)).toBe(true);
    });
});
