/**
 * Vision Feedback Service Tests
 * 
 * Tests for vision-language model analysis of generated keyframe images:
 * - Configuration extraction from settings
 * - Image analysis with vision LLM
 * - Response parsing and error handling
 * - GPU/CUDA error parsing
 * - Feedback formatting
 * 
 * @module services/__tests__/visionFeedbackService.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    analyzeKeyframe,
    checkVisionLLMHealth,
    getVisionConfig,
    getVisionConfigFromSettings,
    formatVisionFeedback,
    VisionAnalysisRequest,
    VisionFeedbackResult,
} from '../visionFeedbackService';
import type { Scene, StoryBible, LocalGenerationSettings, TimelineData } from '../../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockTimeline: TimelineData = {
    shots: [],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: '',
};

const mockScene: Scene = {
    id: 'scene-1',
    title: 'Opening Scene',
    summary: 'A dramatic sunrise over the mountains',
    timeline: mockTimeline,
};

const mockStoryBible: StoryBible = {
    characters: 'A brave explorer named Alex',
    setting: 'Mountain range in present day alpine wilderness',
    logline: 'An epic journey through untamed wilderness',
    plotOutline: 'A journey begins in the mountains',
};

const mockAnalysisRequest: VisionAnalysisRequest = {
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    originalPrompt: 'A dramatic sunrise over mountain peaks, cinematic lighting',
    directorsVision: 'Capture the majesty of nature with warm golden tones',
    scene: mockScene,
    storyBible: mockStoryBible,
};

const mockSuccessfulResponse = {
    choices: [{
        message: {
            content: JSON.stringify({
                scores: {
                    composition: 85,
                    lighting: 78,
                    characterAccuracy: 70,
                    styleAdherence: 82,
                    overall: 79,
                },
                issues: [
                    {
                        severity: 'warning',
                        category: 'lighting',
                        message: 'Shadows could be more defined',
                    },
                    {
                        severity: 'info',
                        category: 'composition',
                        message: 'Consider rule of thirds for mountain placement',
                    },
                ],
                summary: 'Good overall composition with strong lighting. Minor improvements suggested for shadow definition.',
                refinedPrompt: 'A dramatic sunrise over mountain peaks, cinematic lighting with defined shadows, rule of thirds composition',
            }),
        },
    }],
};

// ============================================================================
// Configuration Tests
// ============================================================================

describe('VisionFeedbackService', () => {
    describe('getVisionConfig', () => {
        it('should return default configuration', () => {
            const config = getVisionConfig();
            
            expect(config).toHaveProperty('providerUrl');
            expect(config).toHaveProperty('modelId');
            expect(config).toHaveProperty('timeoutMs');
            expect(config).toHaveProperty('temperature');
            expect(typeof config.timeoutMs).toBe('number');
            expect(config.temperature).toBeLessThanOrEqual(1);
        });
    });

    describe('getVisionConfigFromSettings', () => {
        it('should use unified model settings when useUnifiedVisionModel is true', () => {
            const settings: LocalGenerationSettings = {
                llmProviderUrl: 'http://localhost:5000/v1/chat/completions',
                llmModel: 'test-model',
                llmTimeoutMs: 60000,
                llmTemperature: 0.5,
                useUnifiedVisionModel: true,
            } as LocalGenerationSettings;

            const config = getVisionConfigFromSettings(settings);

            expect(config.providerUrl).toBe('http://localhost:5000/v1/chat/completions');
            expect(config.modelId).toBe('test-model');
            expect(config.timeoutMs).toBe(60000);
            expect(config.temperature).toBe(0.5);
        });

        it('should use separate vision settings when useUnifiedVisionModel is false', () => {
            const settings: LocalGenerationSettings = {
                llmProviderUrl: 'http://localhost:5000/v1/chat/completions',
                llmModel: 'text-model',
                visionLLMProviderUrl: 'http://localhost:6000/v1/chat/completions',
                visionLLMModel: 'vision-model',
                visionLLMTimeoutMs: 120000,
                visionLLMTemperature: 0.2,
                useUnifiedVisionModel: false,
            } as LocalGenerationSettings;

            const config = getVisionConfigFromSettings(settings);

            expect(config.providerUrl).toBe('http://localhost:6000/v1/chat/completions');
            expect(config.modelId).toBe('vision-model');
            expect(config.timeoutMs).toBe(120000);
            expect(config.temperature).toBe(0.2);
        });

        it('should fall back to main LLM settings when vision-specific settings are missing', () => {
            const settings: LocalGenerationSettings = {
                llmProviderUrl: 'http://localhost:5000/v1/chat/completions',
                llmModel: 'fallback-model',
                llmTimeoutMs: 90000,
                useUnifiedVisionModel: false,
            } as LocalGenerationSettings;

            const config = getVisionConfigFromSettings(settings);

            expect(config.providerUrl).toBe('http://localhost:5000/v1/chat/completions');
            expect(config.timeoutMs).toBe(90000);
        });

        it('should default useUnifiedVisionModel to true when not specified', () => {
            const settings: LocalGenerationSettings = {
                llmProviderUrl: 'http://localhost:5000/v1/chat/completions',
                llmModel: 'unified-model',
            } as LocalGenerationSettings;

            const config = getVisionConfigFromSettings(settings);

            // Should use the main LLM settings (unified mode default)
            expect(config.providerUrl).toBe('http://localhost:5000/v1/chat/completions');
            expect(config.modelId).toBe('unified-model');
        });
    });
});

// ============================================================================
// Keyframe Analysis Tests
// ============================================================================

describe('analyzeKeyframe', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        fetchSpy.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should analyze keyframe and return structured result', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSuccessfulResponse),
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest, {
            providerUrl: 'http://test:1234/v1/chat/completions',
            modelId: 'test-vision-model',
        });

        expect(result.sceneId).toBe('scene-1');
        expect(result.scores.overall).toBe(79);
        expect(result.scores.composition).toBe(85);
        expect(result.issues).toHaveLength(2);
        expect(result.summary).toContain('Good overall');
        expect(result.refinedPrompt).toContain('rule of thirds');
        expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should send correct request format to vision LLM', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSuccessfulResponse),
        } as Response);

        await analyzeKeyframe(mockAnalysisRequest, {
            providerUrl: 'http://test:1234/v1/chat/completions',
            modelId: 'test-model',
            temperature: 0.3,
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            'http://test:1234/v1/chat/completions',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                }),
            })
        );

        const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
        expect(body.model).toBe('test-model');
        expect(body.temperature).toBe(0.3);
        expect(body.messages[0].content).toHaveLength(2); // text + image_url
        expect(body.messages[0].content[1].type).toBe('image_url');
    });

    it('should include correlation ID in request headers', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSuccessfulResponse),
        } as Response);

        await analyzeKeyframe(mockAnalysisRequest);

        // Check correlation ID header is present and non-empty
        const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
        expect(headers['X-Correlation-ID']).toBeDefined();
        expect(headers['X-Correlation-ID']).toMatch(/^[\w-]+$/);
    });

    it('should handle HTTP error responses gracefully', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest);

        // Should return error result instead of throwing
        expect(result.scores.overall).toBe(0);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.severity).toBe('error');
        expect(result.issues[0]!.message).toContain('500');
    });

    it('should handle network errors gracefully', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('Network error'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.scores.overall).toBe(0);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.severity).toBe('error');
        expect(result.summary).toContain('failed');
    });

    it('should handle timeout errors', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('The operation was aborted'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('timed out');
    });

    it('should parse GPU memory errors into user-friendly messages', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('CUDA out of memory. Tried to allocate 2.00 GiB'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('GPU ran out of memory');
        expect(result.issues[0]!.message).toContain('Close other');
    });

    it('should handle JSON response wrapped in markdown fences', async () => {
        const wrappedResponse = {
            choices: [{
                message: {
                    content: '```json\n' + JSON.stringify({
                        scores: { composition: 70, lighting: 75, characterAccuracy: 65, styleAdherence: 72, overall: 70 },
                        issues: [],
                        summary: 'Test summary',
                    }) + '\n```',
                },
            }],
        };

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(wrappedResponse),
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.scores.overall).toBe(70);
        expect(result.summary).toBe('Test summary');
    });

    it('should handle response with thinking blocks', async () => {
        const responseWithThinking = {
            choices: [{
                message: {
                    content: '<think>Let me analyze this image carefully...</think>' + JSON.stringify({
                        scores: { composition: 80, lighting: 80, characterAccuracy: 80, styleAdherence: 80, overall: 80 },
                        issues: [],
                        summary: 'Clean analysis',
                    }),
                },
            }],
        };

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(responseWithThinking),
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.scores.overall).toBe(80);
        expect(result.rawAnalysis).toContain('<think>');
    });

    it('should return partial result when JSON parsing fails', async () => {
        const malformedResponse = {
            choices: [{
                message: {
                    content: 'This is not valid JSON at all',
                },
            }],
        };

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(malformedResponse),
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest);

        // Should return default scores, not throw
        expect(result.scores.overall).toBe(50);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('parse');
        expect(result.rawAnalysis).toBe('This is not valid JSON at all');
    });

    it('should handle empty response content', async () => {
        const emptyResponse = {
            choices: [{
                message: {
                    content: '',
                },
            }],
        };

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(emptyResponse),
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.scores.overall).toBe(50);
    });

    it('should generate suggestions from high-severity issues', async () => {
        const responseWithErrors = {
            choices: [{
                message: {
                    content: JSON.stringify({
                        scores: { composition: 40, lighting: 50, characterAccuracy: 30, styleAdherence: 45, overall: 41 },
                        issues: [
                            { severity: 'error', category: 'character', message: 'Character is completely wrong' },
                            { severity: 'warning', category: 'lighting', message: 'Lighting is too dark' },
                            { severity: 'info', category: 'style', message: 'Consider warmer tones' },
                        ],
                        summary: 'Multiple issues found',
                    }),
                },
            }],
        };

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(responseWithErrors),
        } as Response);

        const result = await analyzeKeyframe(mockAnalysisRequest);

        // Should generate suggestions for errors and warnings, not info
        expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
        expect(result.suggestions.every(s => s.type === 'FLAG_SCENE_FOR_REVIEW')).toBe(true);
    });
});

// ============================================================================
// Health Check Tests
// ============================================================================

describe('checkVisionLLMHealth', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return available true when vision model is loaded', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                data: [
                    { id: 'huihui-qwen3-vl-32b' },
                    { id: 'text-model' },
                ],
            }),
        } as Response);

        const health = await checkVisionLLMHealth({
            providerUrl: 'http://test:1234/v1/chat/completions',
        });

        expect(health.available).toBe(true);
        expect(health.model).toBe('huihui-qwen3-vl-32b');
    });

    it('should return available false when no vision model is loaded', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                data: [
                    { id: 'text-only-model' },
                    { id: 'another-text-model' },
                ],
            }),
        } as Response);

        const health = await checkVisionLLMHealth();

        expect(health.available).toBe(false);
        expect(health.error).toContain('No vision model');
    });

    it('should call models endpoint', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ data: [] }),
        } as Response);

        await checkVisionLLMHealth({
            providerUrl: 'http://test:1234/v1/chat/completions',
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            'http://test:1234/v1/models',
            expect.any(Object)
        );
    });

    it('should handle server errors', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            status: 503,
        } as Response);

        const health = await checkVisionLLMHealth();

        expect(health.available).toBe(false);
        expect(health.error).toContain('503');
    });

    it('should handle connection failures', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const health = await checkVisionLLMHealth();

        expect(health.available).toBe(false);
        expect(health.error).toContain('ECONNREFUSED');
    });

    it('should detect vision capability from model name containing VL', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                data: [{ id: 'some-vl-model' }],
            }),
        } as Response);

        const health = await checkVisionLLMHealth();

        expect(health.available).toBe(true);
    });

    it('should detect vision capability from model name containing vision', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                data: [{ id: 'gpt-4-vision-preview' }],
            }),
        } as Response);

        const health = await checkVisionLLMHealth();

        expect(health.available).toBe(true);
    });
});

// ============================================================================
// Feedback Formatting Tests
// ============================================================================

describe('formatVisionFeedback', () => {
    it('should format complete feedback result', () => {
        const result: VisionFeedbackResult = {
            sceneId: 'scene-1',
            scores: {
                composition: 85,
                lighting: 78,
                characterAccuracy: 70,
                styleAdherence: 82,
                overall: 79,
            },
            issues: [
                { severity: 'warning', category: 'lighting', message: 'Shadows could be more defined' },
                { severity: 'info', category: 'composition', message: 'Consider rule of thirds' },
            ],
            suggestions: [],
            summary: 'Good overall quality',
            refinedPrompt: 'Improved prompt here',
            modelUsed: 'test-model',
            analyzedAt: Date.now(),
            responseTimeMs: 1500,
        };

        const formatted = formatVisionFeedback(result);

        expect(formatted).toContain('## Vision Analysis');
        expect(formatted).toContain('**Overall Score:** 79/100');
        expect(formatted).toContain('| Composition | 85/100 |');
        expect(formatted).toContain('| Lighting | 78/100 |');
        expect(formatted).toContain('⚠️');
        expect(formatted).toContain('ℹ️');
        expect(formatted).toContain('Improved prompt here');
    });

    it('should format feedback without issues', () => {
        const result: VisionFeedbackResult = {
            sceneId: 'scene-1',
            scores: {
                composition: 90,
                lighting: 90,
                characterAccuracy: 90,
                styleAdherence: 90,
                overall: 90,
            },
            issues: [],
            suggestions: [],
            summary: 'Excellent quality',
            modelUsed: 'test-model',
            analyzedAt: Date.now(),
            responseTimeMs: 1000,
        };

        const formatted = formatVisionFeedback(result);

        expect(formatted).toContain('**Overall Score:** 90/100');
        expect(formatted).not.toContain('### Issues');
    });

    it('should format feedback with error severity issues', () => {
        const result: VisionFeedbackResult = {
            sceneId: 'scene-1',
            scores: {
                composition: 30,
                lighting: 40,
                characterAccuracy: 20,
                styleAdherence: 35,
                overall: 31,
            },
            issues: [
                { severity: 'error', category: 'character', message: 'Character completely wrong' },
            ],
            suggestions: [],
            summary: 'Major issues found',
            modelUsed: 'test-model',
            analyzedAt: Date.now(),
            responseTimeMs: 2000,
        };

        const formatted = formatVisionFeedback(result);

        expect(formatted).toContain('❌');
        expect(formatted).toContain('Character completely wrong');
    });

    it('should format feedback without refined prompt', () => {
        const result: VisionFeedbackResult = {
            sceneId: 'scene-1',
            scores: {
                composition: 75,
                lighting: 75,
                characterAccuracy: 75,
                styleAdherence: 75,
                overall: 75,
            },
            issues: [],
            suggestions: [],
            summary: 'Good quality',
            modelUsed: 'test-model',
            analyzedAt: Date.now(),
            responseTimeMs: 1200,
        };

        const formatted = formatVisionFeedback(result);

        expect(formatted).not.toContain('### Suggested Refined Prompt');
    });
});

// ============================================================================
// GPU Error Parsing Tests
// ============================================================================

describe('GPU Error Parsing (via analyzeKeyframe)', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.restoreAllMocks();
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should parse CUDA OOM errors', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('CUDA error: out of memory'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('GPU ran out of memory');
    });

    it('should parse general OOM errors', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('Memory allocation failed'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('out of memory');
    });

    it('should parse cuDNN errors', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('cuDNN error: initialization failed'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('GPU error');
    });

    it('should parse model loading errors', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('Failed to load model: file not found'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('model failed to load');
    });

    it('should parse connection errors', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message).toContain('Cannot connect');
    });

    it('should truncate very long error messages', async () => {
        const longError = 'A'.repeat(200);
        fetchSpy.mockRejectedValueOnce(new Error(longError));

        const result = await analyzeKeyframe(mockAnalysisRequest);

        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]!.message.length).toBeLessThan(200);
        expect(result.issues[0]!.message).toContain('...');
    });
});
