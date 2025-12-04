/**
 * Unit Tests for Video Quality Gate Service
 * 
 * Tests evaluateVideoQuality(), videoPassesQualityGate(), and
 * helper functions for quality threshold enforcement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    evaluateVideoQuality,
    videoPassesQualityGate,
    isQualityGateEnabled,
    getQualityGateStatusMessage,
    formatQualityGateResult,
    DEFAULT_QUALITY_THRESHOLDS,
    type QualityGateResult,
} from '../videoQualityGateService';
import type { VideoFeedbackResult, VideoAnalysisRequest } from '../videoFeedbackService';
import type { LocalGenerationSettings, Scene } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../videoFeedbackService', () => ({
    analyzeVideo: vi.fn(),
}));

import { analyzeVideo } from '../videoFeedbackService';
const mockAnalyzeVideo = vi.mocked(analyzeVideo);

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockScene = (): Scene => ({
    id: 'scene-1',
    title: 'Test Scene',
    summary: 'A test scene for video quality analysis',
    timeline: {
        shots: [],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: '',
    },
});

const createMockRequest = (): VideoAnalysisRequest => ({
    videoBase64: 'data:video/mp4;base64,MOCK_VIDEO_DATA',
    startKeyframeBase64: 'data:image/png;base64,MOCK_START_KEYFRAME',
    endKeyframeBase64: 'data:image/png;base64,MOCK_END_KEYFRAME',
    originalPrompt: 'A test video prompt for quality analysis',
    directorsVision: 'Test directors vision',
    scene: createMockScene(),
    storyBible: {
        logline: 'A test story logline',
        characters: 'Test Character - the protagonist',
        setting: 'Test Setting',
        plotOutline: 'A test plot outline',
    },
    isBookendVideo: true,
});

const createMockFeedbackResult = (scores: Partial<VideoFeedbackResult['scores']> = {}): VideoFeedbackResult => ({
    sceneId: 'scene-1',
    scores: {
        startFrameMatch: 80,
        endFrameMatch: 80,
        motionQuality: 75,
        promptAdherence: 70,
        overall: 76,
        ...scores,
    },
    issues: [],
    suggestions: [],
    summary: 'Test video analysis summary',
    modelUsed: 'test-model',
    analyzedAt: Date.now(),
    responseTimeMs: 1000,
});

const createMockSettings = (overrides: Partial<LocalGenerationSettings> = {}): LocalGenerationSettings => ({
    comfyUIUrl: 'http://localhost:8188',
    comfyUIClientId: 'test-client',
    workflowJson: '',
    mapping: {},
    featureFlags: {
        videoQualityGateEnabled: true,
        videoQualityThreshold: 70,
    } as LocalGenerationSettings['featureFlags'],
    ...overrides,
});

// ============================================================================
// Tests: evaluateVideoQuality
// ============================================================================

describe('evaluateVideoQuality', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should pass when all scores exceed thresholds', async () => {
        const highScoreFeedback = createMockFeedbackResult({
            startFrameMatch: 85,
            endFrameMatch: 85,
            motionQuality: 80,
            promptAdherence: 75,
            overall: 82,
        });
        mockAnalyzeVideo.mockResolvedValue(highScoreFeedback);

        const result = await evaluateVideoQuality(
            'data:video/mp4;base64,TEST',
            createMockRequest(),
            createMockSettings()
        );

        expect(result.decision).toBe('pass');
        expect(result.violations).toHaveLength(0);
        expect(result.shouldReject).toBe(false);
        expect(result.suggestedAction).toBe('accept');
    });

    it('should fail when overall score is way below threshold', async () => {
        const lowScoreFeedback = createMockFeedbackResult({
            startFrameMatch: 50,
            endFrameMatch: 50,
            motionQuality: 40,
            promptAdherence: 45,
            overall: 46,
        });
        mockAnalyzeVideo.mockResolvedValue(lowScoreFeedback);

        const result = await evaluateVideoQuality(
            'data:video/mp4;base64,TEST',
            createMockRequest(),
            createMockSettings()
        );

        expect(result.decision).toBe('fail');
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations.some(v => v.severity === 'error')).toBe(true);
        expect(result.shouldReject).toBe(true);
    });

    it('should warn when score is close to threshold', async () => {
        // With minStartFrameMatch=30 and WARNING_MARGIN=10,
        // scores 20-29 trigger warning-level violations
        const borderlineFeedback = createMockFeedbackResult({
            startFrameMatch: 25, // Below 30 but within warning margin (30-10=20)
            endFrameMatch: 80,
            motionQuality: 65,
            promptAdherence: 65,
            overall: 72, // Just above 70
        });
        mockAnalyzeVideo.mockResolvedValue(borderlineFeedback);

        const result = await evaluateVideoQuality(
            'data:video/mp4;base64,TEST',
            createMockRequest(),
            createMockSettings()
        );

        expect(result.decision).toBe('warning');
        expect(result.violations.some(v => v.severity === 'warning')).toBe(true);
        expect(result.shouldReject).toBe(false);
    });

    it('should suggest regeneration for frame match failures', async () => {
        // With minStartFrameMatch=30 and WARNING_MARGIN=10,
        // scores below 20 trigger error-level violations (fail)
        const frameMatchFailure = createMockFeedbackResult({
            startFrameMatch: 15, // Way below 30-10=20, error-level
            endFrameMatch: 80,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 55, // Below 70-10=60, also error-level
        });
        mockAnalyzeVideo.mockResolvedValue(frameMatchFailure);

        const result = await evaluateVideoQuality(
            'data:video/mp4;base64,TEST',
            createMockRequest(),
            createMockSettings()
        );

        expect(result.decision).toBe('fail');
        expect(result.suggestedAction).toBe('regenerate');
    });

    it('should use default thresholds from settings', async () => {
        const settings = createMockSettings();
        
        const mediumScoreFeedback = createMockFeedbackResult({
            startFrameMatch: 75,
            endFrameMatch: 75,
            motionQuality: 65,
            promptAdherence: 65,
            overall: 70, // At threshold (should pass)
        });
        mockAnalyzeVideo.mockResolvedValue(mediumScoreFeedback);

        const result = await evaluateVideoQuality(
            'data:video/mp4;base64,TEST',
            createMockRequest(),
            settings
        );

        // Overall should pass at exactly the threshold
        expect(result.violations.filter(v => v.metric === 'minVideoOverallScore')).toHaveLength(0);
    });
});

// ============================================================================
// Tests: videoPassesQualityGate
// ============================================================================

describe('videoPassesQualityGate', () => {
    it('should return true when all scores exceed thresholds', () => {
        const feedback = createMockFeedbackResult({
            startFrameMatch: 85,
            endFrameMatch: 85,
            motionQuality: 80,
            promptAdherence: 75,
            overall: 82,
        });

        expect(videoPassesQualityGate(feedback)).toBe(true);
    });

    it('should return false when there are error-level violations', () => {
        const feedback = createMockFeedbackResult({
            startFrameMatch: 40, // Way below threshold
            endFrameMatch: 80,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 55,
        });

        expect(videoPassesQualityGate(feedback)).toBe(false);
    });

    it('should return true with only warning-level violations', () => {
        const feedback = createMockFeedbackResult({
            startFrameMatch: 72, // Just below 75, warning level
            endFrameMatch: 80,
            motionQuality: 70,
            promptAdherence: 70,
            overall: 75,
        });

        expect(videoPassesQualityGate(feedback)).toBe(true);
    });
});

// ============================================================================
// Tests: isQualityGateEnabled
// ============================================================================

describe('isQualityGateEnabled', () => {
    it('should return true when feature flag is enabled', () => {
        const settings = createMockSettings({
            featureFlags: { videoQualityGateEnabled: true } as LocalGenerationSettings['featureFlags'],
        });
        expect(isQualityGateEnabled(settings)).toBe(true);
    });

    it('should return false when feature flag is disabled', () => {
        const settings = createMockSettings({
            featureFlags: { videoQualityGateEnabled: false } as LocalGenerationSettings['featureFlags'],
        });
        expect(isQualityGateEnabled(settings)).toBe(false);
    });

    it('should return false when no settings provided', () => {
        expect(isQualityGateEnabled(undefined)).toBe(false);
    });

    it('should return false when featureFlags is undefined', () => {
        const settings = createMockSettings({
            featureFlags: undefined,
        });
        expect(isQualityGateEnabled(settings)).toBe(false);
    });
});

// ============================================================================
// Tests: getQualityGateStatusMessage
// ============================================================================

describe('getQualityGateStatusMessage', () => {
    it('should return pass message with checkmark', () => {
        const result: QualityGateResult = {
            decision: 'pass',
            reason: 'All thresholds met',
            scores: { overall: 85, startFrameMatch: 80, endFrameMatch: 80, motionQuality: 75, promptAdherence: 70 },
            violations: [],
            feedbackResult: createMockFeedbackResult(),
            thresholdsUsed: DEFAULT_QUALITY_THRESHOLDS,
            shouldReject: false,
            suggestedAction: 'accept',
        };

        const message = getQualityGateStatusMessage(result);
        expect(message).toContain('✅');
        expect(message).toContain('passed');
        expect(message).toContain('85');
    });

    it('should return warning message with caution icon', () => {
        const result: QualityGateResult = {
            decision: 'warning',
            reason: 'Close to threshold',
            scores: { overall: 72, startFrameMatch: 73, endFrameMatch: 80, motionQuality: 70, promptAdherence: 65 },
            violations: [
                { metric: 'minStartFrameMatch', actual: 73, required: 75, severity: 'warning', message: 'Start frame match 73 below 75' },
            ],
            feedbackResult: createMockFeedbackResult(),
            thresholdsUsed: DEFAULT_QUALITY_THRESHOLDS,
            shouldReject: false,
            suggestedAction: 'manual-review',
        };

        const message = getQualityGateStatusMessage(result);
        expect(message).toContain('⚠️');
        expect(message).toContain('warning');
    });

    it('should return fail message with X icon', () => {
        const result: QualityGateResult = {
            decision: 'fail',
            reason: 'Below threshold',
            scores: { overall: 50, startFrameMatch: 40, endFrameMatch: 50, motionQuality: 55, promptAdherence: 50 },
            violations: [
                { metric: 'minVideoOverallScore', actual: 50, required: 70, severity: 'error', message: 'Overall 50 below 70' },
                { metric: 'minStartFrameMatch', actual: 40, required: 75, severity: 'error', message: 'Start 40 below 75' },
            ],
            feedbackResult: createMockFeedbackResult(),
            thresholdsUsed: DEFAULT_QUALITY_THRESHOLDS,
            shouldReject: true,
            suggestedAction: 'regenerate',
        };

        const message = getQualityGateStatusMessage(result);
        expect(message).toContain('❌');
        expect(message).toContain('failed');
    });
});

// ============================================================================
// Tests: formatQualityGateResult
// ============================================================================

describe('formatQualityGateResult', () => {
    it('should format result with all sections', () => {
        const result: QualityGateResult = {
            decision: 'fail',
            reason: 'Multiple thresholds failed',
            scores: { overall: 55, startFrameMatch: 50, endFrameMatch: 60, motionQuality: 55, promptAdherence: 50 },
            violations: [
                { metric: 'minVideoOverallScore', actual: 55, required: 70, severity: 'error', message: 'Overall below threshold' },
                { metric: 'minStartFrameMatch', actual: 50, required: 75, severity: 'error', message: 'Start frame below threshold' },
            ],
            feedbackResult: createMockFeedbackResult(),
            thresholdsUsed: DEFAULT_QUALITY_THRESHOLDS,
            shouldReject: true,
            suggestedAction: 'regenerate',
        };

        const formatted = formatQualityGateResult(result);

        expect(formatted).toContain('FAIL');
        expect(formatted).toContain('Overall Score: 55/100');
        expect(formatted).toContain('Violations:');
        expect(formatted).toContain('[error]');
        expect(formatted).toContain('Suggested Action: regenerate');
    });

    it('should format pass result concisely', () => {
        const result: QualityGateResult = {
            decision: 'pass',
            reason: 'All thresholds met',
            scores: { overall: 85, startFrameMatch: 85, endFrameMatch: 80, motionQuality: 80, promptAdherence: 75 },
            violations: [],
            feedbackResult: createMockFeedbackResult(),
            thresholdsUsed: DEFAULT_QUALITY_THRESHOLDS,
            shouldReject: false,
            suggestedAction: 'accept',
        };

        const formatted = formatQualityGateResult(result);

        expect(formatted).toContain('PASS');
        expect(formatted).toContain('Overall Score: 85/100');
        expect(formatted).not.toContain('Violations:'); // No violations section for pass
        expect(formatted).toContain('accept');
    });
});

// ============================================================================
// Tests: Default Thresholds
// ============================================================================

describe('DEFAULT_QUALITY_THRESHOLDS', () => {
    it('should have expected default values', () => {
        expect(DEFAULT_QUALITY_THRESHOLDS.minVideoOverallScore).toBe(70);
        // Frame match thresholds calibrated for FLF2V model (~35-40% typical similarity)
        expect(DEFAULT_QUALITY_THRESHOLDS.minStartFrameMatch).toBe(30);
        expect(DEFAULT_QUALITY_THRESHOLDS.minEndFrameMatch).toBe(30);
        expect(DEFAULT_QUALITY_THRESHOLDS.minMotionQuality).toBe(60);
        expect(DEFAULT_QUALITY_THRESHOLDS.minPromptAdherence).toBe(60);
    });
});
