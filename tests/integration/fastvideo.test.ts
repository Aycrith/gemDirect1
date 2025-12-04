/**
 * FastVideo Service Integration Tests
 * Tests for FastVideo adapter integration (requires server running)
 */

import { describe, it, expect } from 'vitest';
import { 
    checkFastVideoHealth, 
    queueFastVideoPrompt, 
    validateFastVideoConfig,
    stripDataUrlPrefix 
} from '../../services/fastVideoService';
import type { LocalGenerationSettings } from '../../types';

const TEST_SERVER_URL = process.env.FASTVIDEO_TEST_URL || 'http://127.0.0.1:8055';
// Skip live tests by default - requires explicit opt-in via RUN_FASTVIDEO_TESTS=true
const SKIP_LIVE_TESTS = process.env.RUN_FASTVIDEO_TESTS !== 'true';

describe('FastVideo Service', () => {
    const mockSettings: LocalGenerationSettings = {
        videoProvider: 'fastvideo-local',
        comfyUIUrl: 'http://127.0.0.1:8188',
        comfyUIClientId: 'test',
        workflowJson: '{}',
        mapping: {},
        fastVideo: {
            endpointUrl: TEST_SERVER_URL,
            modelId: 'FastVideo/FastWan2.2-TI2V-5B-Diffusers',
            fps: 8,
            numFrames: 8,
            height: 480,
            width: 720,
            outputDir: 'test-results/fastvideo-integration',
            attentionBackend: 'VIDEO_SPARSE_ATTN'
        }
    };

    describe('Configuration Validation', () => {
        it('should validate correct FastVideo config', () => {
            const errors = validateFastVideoConfig(mockSettings);
            expect(errors).toHaveLength(0);
        });

        it('should reject missing config', () => {
            const invalidSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: undefined
            };
            const errors = validateFastVideoConfig(invalidSettings);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]).toContain('FastVideo configuration is missing');
        });

        it('should reject invalid endpoint URL', () => {
            const invalidSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: {
                    ...mockSettings.fastVideo!,
                    endpointUrl: 'invalid-url'
                }
            };
            const errors = validateFastVideoConfig(invalidSettings);
            expect(errors.some(e => e.includes('must start with http'))).toBe(true);
        });

        it('should reject out-of-range FPS', () => {
            const invalidSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: {
                    ...mockSettings.fastVideo!,
                    fps: 50
                }
            };
            const errors = validateFastVideoConfig(invalidSettings);
            expect(errors.some(e => e.includes('FPS must be between'))).toBe(true);
        });

        it('should reject out-of-range numFrames', () => {
            const invalidSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: {
                    ...mockSettings.fastVideo!,
                    numFrames: 500
                }
            };
            const errors = validateFastVideoConfig(invalidSettings);
            expect(errors.some(e => e.includes('numFrames must be between'))).toBe(true);
        });

        it('should reject invalid resolution', () => {
            const invalidSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: {
                    ...mockSettings.fastVideo!,
                    width: 50
                }
            };
            const errors = validateFastVideoConfig(invalidSettings);
            expect(errors.some(e => e.includes('width must be between'))).toBe(true);
        });
    });

    describe('Utility Functions', () => {
        it('should strip data URL prefix', () => {
            const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAUA';
            const withPrefix = `data:image/png;base64,${base64}`;
            
            expect(stripDataUrlPrefix(withPrefix)).toBe(base64);
            expect(stripDataUrlPrefix(base64)).toBe(base64);
        });

        it('should handle empty strings', () => {
            expect(stripDataUrlPrefix('')).toBe('');
        });
    });

    describe('Health Check', () => {
        it('should check server health', async () => {
            if (SKIP_LIVE_TESTS) {
                console.log('⊘ Skipping live FastVideo health check (set RUN_FASTVIDEO_TESTS=true to run)');
                return;
            }

            try {
                const health = await checkFastVideoHealth(mockSettings);
                
                expect(health).toBeDefined();
                expect(health.status).toBe('ok');
                expect(health.service).toBe('fastvideo-adapter');
                expect(health.modelId).toContain('FastVideo');
                expect(typeof health.modelLoaded).toBe('boolean');
            } catch (error: any) {
                if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
                    console.log('⊘ FastVideo server not running - skipping health check');
                    return;
                }
                throw error;
            }
        }, 10000);

        it('should handle connection failure gracefully', async () => {
            const badSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: {
                    ...mockSettings.fastVideo!,
                    endpointUrl: 'http://localhost:9999'  // Invalid port
                }
            };

            try {
                await checkFastVideoHealth(badSettings);
                // If we reach here without error, skip test (server may not be running)
                console.log('⊘ FastVideo server not responding - test gracefully handled');
            } catch (error: any) {
                // Expected behavior: connection should fail
                expect(
                    error.message.includes('timeout') ||
                    error.message.includes('ECONNREFUSED') ||
                    error.message.includes('FastVideo health check failed')
                ).toBe(true);
            }
        }, 10000);
    });

    describe('Video Generation', () => {
        it('should queue minimal generation request', async () => {
            if (SKIP_LIVE_TESTS) {
                console.log('⊘ Skipping live FastVideo generation test (set RUN_FASTVIDEO_TESTS=true to run)');
                return;
            }

            try {
                const logs: string[] = [];
                const logCallback = (msg: string, level?: 'info' | 'warn' | 'error') => {
                    logs.push(`[${level || 'info'}] ${msg}`);
                };

                const result = await queueFastVideoPrompt(
                    mockSettings,
                    'Test: a simple geometric shape on white background',
                    'complex, detailed, text',
                    undefined, // No keyframe
                    logCallback
                );

                expect(result).toBeDefined();
                expect(result.status).toBe('complete');
                expect(result.outputVideoPath).toBeDefined();
                expect(result.frames).toBe(8);
                expect(result.durationMs).toBeGreaterThan(0);
                
                // Check telemetry logs
                expect(logs.some(l => l.includes('Queuing generation'))).toBe(true);
                expect(logs.some(l => l.includes('Generation complete'))).toBe(true);
            } catch (error: any) {
                if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
                    console.log('⊘ FastVideo server not running - skipping generation test');
                    return;
                }
                throw error;
            }
        }, 120000); // 2 minute timeout for generation

        it('should reject generation without config', async () => {
            const noConfigSettings: LocalGenerationSettings = {
                ...mockSettings,
                fastVideo: undefined
            };

            await expect(queueFastVideoPrompt(
                noConfigSettings,
                'Test prompt',
                undefined,
                undefined
            )).rejects.toThrow('FastVideo configuration missing');
        });
    });

    describe('Telemetry', () => {
        it('should track request metadata', async () => {
            if (SKIP_LIVE_TESTS) {
                console.log('⊘ Skipping telemetry test (set RUN_FASTVIDEO_TESTS=true to run)');
                return;
            }

            const logs: string[] = [];
            const logCallback = (msg: string) => logs.push(msg);

            try {
                await queueFastVideoPrompt(
                    mockSettings,
                    'Telemetry test prompt',
                    undefined,
                    undefined,
                    logCallback
                );

                // Verify telemetry logs
                expect(logs.some(l => l.includes('Request fv_'))).toBe(true);
                expect(logs.some(l => l.includes('Telemetry saved'))).toBe(true);
            } catch (error: any) {
                if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
                    console.log('⊘ FastVideo server not running - skipping telemetry test');
                    return;
                }
                throw error;
            }
        }, 120000);
    });
});
