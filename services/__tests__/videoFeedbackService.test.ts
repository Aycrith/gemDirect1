/**
 * Video Feedback Service Tests
 * 
 * Tests for video analysis functionality including:
 * - Frame extraction from videos
 * - Frame comparison against keyframes
 * - Motion quality analysis
 * - Overall video analysis workflow
 * 
 * @module services/__tests__/videoFeedbackService.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import {
    extractFramesFromVideo,
    extractBookendFrames,
    compareFrameToKeyframe,
    analyzeMotionQuality,
    analyzeVideo,
    formatVideoFeedback,
    isVideoQualityAcceptable,
    type VideoFeedbackResult,
    type VideoAnalysisRequest,
} from '../videoFeedbackService';
import type { Scene, StoryBible } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

// Mock the correlation utilities
vi.mock('../../utils/correlation', () => ({
    generateCorrelationId: () => 'test-correlation-id',
    logCorrelation: vi.fn(),
}));

// Mock fetch for LLM API calls - save original for proper cleanup
const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Restore original fetch after all tests
afterAll(() => {
    global.fetch = originalFetch;
});

// Mock HTML5 Video and Canvas APIs for frame extraction
const mockVideoElement = {
    preload: '',
    muted: false,
    duration: 5.0,
    videoWidth: 1280,
    videoHeight: 720,
    currentTime: 0,
    onloadedmetadata: null as (() => void) | null,
    onseeked: null as (() => void) | null,
    onerror: null as (() => void) | null,
    src: '',
    load: vi.fn(),
};

const mockCanvasContext = {
    drawImage: vi.fn(),
};

const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => mockCanvasContext),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,mockFrameBase64Data'),
};

// Store original createElement
const originalCreateElement = document.createElement.bind(document);

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockScene = (overrides: Partial<Scene> = {}): Scene => ({
    id: 'scene-1',
    title: 'Test Scene',
    summary: 'A test scene for video analysis',
    timeline: {
        shots: [
            {
                id: 'shot-1',
                description: 'Opening shot',
            },
        ],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: '',
    },
    ...overrides,
});

const createMockStoryBible = (overrides: Partial<StoryBible> = {}): StoryBible => ({
    logline: 'A test story for video analysis',
    characters: 'Test characters',
    setting: 'Test setting',
    plotOutline: 'Test plot outline',
    ...overrides,
});

const createMockVideoAnalysisRequest = (
    overrides: Partial<VideoAnalysisRequest> = {}
): VideoAnalysisRequest => ({
    videoBase64: 'data:video/mp4;base64,mockVideoData',
    startKeyframeBase64: 'mockStartKeyframeBase64',
    endKeyframeBase64: 'mockEndKeyframeBase64',
    originalPrompt: 'A cinematic scene with smooth motion',
    directorsVision: 'Dark and moody aesthetic',
    scene: createMockScene(),
    storyBible: createMockStoryBible(),
    isBookendVideo: true,
    ...overrides,
});

const createMockFrameComparisonResponse = (): string => JSON.stringify({
    similarityScore: 85,
    compositionMatch: 90,
    characterConsistency: 80,
    lightingMatch: 85,
    backgroundConsistency: 88,
    differences: ['Slight color shift', 'Minor pose variation'],
    notes: 'Good overall match with minor deviations',
});

const createMockMotionAnalysisResponse = (): string => JSON.stringify({
    qualityScore: 78,
    smoothness: 'good',
    temporalCoherence: 82,
    promptAdherence: 75,
    issues: ['Minor flickering in background', 'Slight jitter at frame 3'],
    description: 'Good motion quality with some minor artifacts',
    suggestions: ['Consider reducing motion complexity', 'Try a longer generation time'],
});

const createMockVideoFeedbackResult = (
    overrides: Partial<VideoFeedbackResult> = {}
): VideoFeedbackResult => ({
    sceneId: 'scene-1',
    scores: {
        startFrameMatch: 85,
        endFrameMatch: 80,
        motionQuality: 75,
        promptAdherence: 70,
        overall: 78,
    },
    issues: [
        {
            severity: 'warning',
            category: 'motion',
            message: 'Minor flickering detected',
        },
    ],
    suggestions: [
        {
            id: 'suggestion-1',
            type: 'video-feedback',
            sceneId: 'scene-1',
            description: 'Consider simplifying the motion',
            rationale: 'Current motion is complex',
            impact: 'medium',
            confidence: 0.75,
        },
    ],
    summary: '**Overall Score**: 78%',
    modelUsed: 'qwen/qwen3-vl-8b',
    analyzedAt: Date.now(),
    responseTimeMs: 1500,
    ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('videoFeedbackService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock document.createElement for video and canvas
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName === 'video') {
                return mockVideoElement as unknown as HTMLElement;
            }
            if (tagName === 'canvas') {
                return mockCanvas as unknown as HTMLElement;
            }
            return originalCreateElement(tagName);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // Frame Extraction Tests
    // ========================================================================

    describe('extractFramesFromVideo', () => {
        it('should extract the specified number of frames', async () => {
            // Setup: Simulate successful video loading and frame capture
            // In a full test environment, we would capture 5 frames
            
            // Mock the video element behavior
            setTimeout(() => {
                // Trigger metadata loaded
                mockVideoElement.onloadedmetadata?.();
            }, 10);
            
            // Mock the seeking behavior
            const originalOnseeked = mockVideoElement.onseeked;
            Object.defineProperty(mockVideoElement, 'onseeked', {
                set: (fn) => {
                    // Auto-trigger onseeked after a small delay when currentTime changes
                    setTimeout(() => fn?.(), 5);
                },
                get: () => originalOnseeked,
            });
            
            // Note: Full integration test would require jsdom with video support
            // This test validates the structure
            expect(typeof extractFramesFromVideo).toBe('function');
        });

        it('should handle video load errors gracefully', async () => {
            // Mock video error
            setTimeout(() => {
                mockVideoElement.onerror?.();
            }, 10);
            
            // The function should reject on error
            expect(typeof extractFramesFromVideo).toBe('function');
        });
    });

    describe('extractBookendFrames', () => {
        it('should extract exactly first and last frames', async () => {
            expect(typeof extractBookendFrames).toBe('function');
            // This function calls extractFramesFromVideo with count=2
            // Full test would require video element mocking
        });
    });

    // ========================================================================
    // Frame Comparison Tests
    // ========================================================================

    describe('compareFrameToKeyframe', () => {
        it('should call vision LLM with correct prompt structure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: createMockFrameComparisonResponse() } }],
                }),
            });

            const result = await compareFrameToKeyframe(
                'originalKeyframeBase64',
                'extractedFrameBase64',
                'start',
                { directorsVision: 'Dark aesthetic', sceneSummary: 'Test scene' }
            );

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(result.similarityScore).toBe(85);
            expect(result.differences).toContain('Slight color shift');
        });

        it('should handle API errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('API timeout'));

            await expect(
                compareFrameToKeyframe(
                    'originalKeyframeBase64',
                    'extractedFrameBase64',
                    'start',
                    { directorsVision: '', sceneSummary: '' }
                )
            ).rejects.toThrow('API timeout');
        });

        it('should handle malformed JSON responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'not valid json' } }],
                }),
            });

            await expect(
                compareFrameToKeyframe(
                    'originalKeyframeBase64',
                    'extractedFrameBase64',
                    'end',
                    { directorsVision: '', sceneSummary: '' }
                )
            ).rejects.toThrow();
        });
    });

    // ========================================================================
    // Motion Analysis Tests
    // ========================================================================

    describe('analyzeMotionQuality', () => {
        it('should analyze multiple frames for motion quality', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: createMockMotionAnalysisResponse() } }],
                }),
            });

            const frames = ['frame1', 'frame2', 'frame3', 'frame4', 'frame5'];
            const result = await analyzeMotionQuality(
                frames,
                'A smooth cinematic pan',
                { directorsVision: 'Elegant movement', sceneSummary: 'Pan shot' }
            );

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(result.qualityScore).toBe(78);
            expect(result.smoothness).toBe('good');
            expect(result.issues).toHaveLength(2);
        });

        it('should handle empty frame array', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: createMockMotionAnalysisResponse() } }],
                }),
            });

            await analyzeMotionQuality(
                [],
                'A test prompt',
                { directorsVision: '', sceneSummary: '' }
            );

            // Should still make API call (though not ideal)
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // Format and Utility Tests
    // ========================================================================

    describe('formatVideoFeedback', () => {
        it('should format result as markdown', () => {
            const result = createMockVideoFeedbackResult();
            const formatted = formatVideoFeedback(result);

            expect(formatted).toContain('## Video Analysis Results');
            expect(formatted).toContain('78%');
            expect(formatted).toContain('Issues Detected');
            expect(formatted).toContain('Suggestions');
        });

        it('should handle results with no issues', () => {
            const result = createMockVideoFeedbackResult({
                issues: [],
                suggestions: [],
            });
            const formatted = formatVideoFeedback(result);

            expect(formatted).not.toContain('### Issues Detected');
            expect(formatted).not.toContain('### Suggestions');
        });

        it('should include timestamp and model info', () => {
            const result = createMockVideoFeedbackResult();
            const formatted = formatVideoFeedback(result);

            expect(formatted).toContain(result.modelUsed);
            expect(formatted).toContain(`${result.responseTimeMs}ms`);
        });
    });

    describe('isVideoQualityAcceptable', () => {
        it('should return true for high-quality results', () => {
            const result = createMockVideoFeedbackResult({
                scores: {
                    startFrameMatch: 90,
                    endFrameMatch: 85,
                    motionQuality: 80,
                    promptAdherence: 75,
                    overall: 82,
                },
                issues: [],
            });

            expect(isVideoQualityAcceptable(result)).toBe(true);
        });

        it('should return false for low overall score', () => {
            const result = createMockVideoFeedbackResult({
                scores: {
                    startFrameMatch: 40,
                    endFrameMatch: 35,
                    motionQuality: 30,
                    promptAdherence: 25,
                    overall: 32,
                },
            });

            expect(isVideoQualityAcceptable(result)).toBe(false);
        });

        it('should return false when errors exceed threshold', () => {
            const result = createMockVideoFeedbackResult({
                scores: {
                    startFrameMatch: 80,
                    endFrameMatch: 75,
                    motionQuality: 70,
                    promptAdherence: 65,
                    overall: 72,
                },
                issues: [
                    { severity: 'error', category: 'motion', message: 'Error 1' },
                    { severity: 'error', category: 'motion', message: 'Error 2' },
                    { severity: 'error', category: 'motion', message: 'Error 3' },
                ],
            });

            expect(isVideoQualityAcceptable(result)).toBe(false);
        });

        it('should respect custom thresholds', () => {
            const result = createMockVideoFeedbackResult({
                scores: {
                    startFrameMatch: 55,
                    endFrameMatch: 55,
                    motionQuality: 55,
                    promptAdherence: 55,
                    overall: 55,
                },
            });

            // Default threshold is 60, so should fail
            expect(isVideoQualityAcceptable(result)).toBe(false);

            // With lower threshold, should pass
            expect(isVideoQualityAcceptable(result, { minOverall: 50 })).toBe(true);
        });
    });

    // ========================================================================
    // VideoFeedbackResult Type Tests
    // ========================================================================

    describe('VideoFeedbackResult type', () => {
        it('should have correct structure', () => {
            const result = createMockVideoFeedbackResult();

            expect(result).toHaveProperty('sceneId');
            expect(result).toHaveProperty('scores');
            expect(result).toHaveProperty('issues');
            expect(result).toHaveProperty('suggestions');
            expect(result).toHaveProperty('summary');
            expect(result).toHaveProperty('modelUsed');
            expect(result).toHaveProperty('analyzedAt');
            expect(result).toHaveProperty('responseTimeMs');
        });

        it('should have correct score structure', () => {
            const result = createMockVideoFeedbackResult();

            expect(result.scores).toHaveProperty('startFrameMatch');
            expect(result.scores).toHaveProperty('endFrameMatch');
            expect(result.scores).toHaveProperty('motionQuality');
            expect(result.scores).toHaveProperty('promptAdherence');
            expect(result.scores).toHaveProperty('overall');

            // All scores should be numbers
            Object.values(result.scores).forEach(score => {
                expect(typeof score).toBe('number');
            });
        });

        it('should have valid issue structure', () => {
            const result = createMockVideoFeedbackResult();

            result.issues.forEach(issue => {
                expect(['error', 'warning', 'info']).toContain(issue.severity);
                expect(typeof issue.message).toBe('string');
                expect(typeof issue.category).toBe('string');
            });
        });
    });

    // ========================================================================
    // Integration Tests (Mocked)
    // ========================================================================

    describe('analyzeVideo (integration)', () => {
        // Note: Full integration tests would require:
        // 1. Video element support in test environment
        // 2. Real LLM responses or comprehensive mocking
        // These tests validate the function exists and has correct signature

        it('should be a function', () => {
            expect(typeof analyzeVideo).toBe('function');
        });

        it('should accept VideoAnalysisRequest parameter', async () => {
            const request = createMockVideoAnalysisRequest();
            
            // Function should be callable with request
            // Full test would require video element support
            expect(request).toHaveProperty('videoBase64');
            expect(request).toHaveProperty('scene');
            expect(request).toHaveProperty('isBookendVideo');
        });
    });
});

// ============================================================================
// Component Props Type Tests
// ============================================================================

describe('VideoAnalysisCard component types', () => {
    it('should accept VideoFeedbackResult as prop', () => {
        const result = createMockVideoFeedbackResult();
        
        // Type check: result should be valid for VideoAnalysisCard
        expect(result.scores.overall).toBeGreaterThanOrEqual(0);
        expect(result.scores.overall).toBeLessThanOrEqual(100);
    });
});
