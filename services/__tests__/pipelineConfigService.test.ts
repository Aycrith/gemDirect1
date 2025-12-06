/**
 * Tests for Pipeline Configuration Service
 * 
 * @module services/__tests__/pipelineConfigService.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LocalGenerationSettings, WorkflowProfile } from '../../types';
import type { PipelineConfig, FeatureFlagsConfig } from '../../types/pipelineConfig';
import { DEFAULT_FEATURE_FLAGS } from '../../utils/featureFlags';

// Import the service under test
import {
    loadPipelineConfig,
    loadPipelineConfigById,
    validatePipelineConfig,
    resolvePipelineRuntimeConfig,
    resolveFeatureFlags,
    getDefaultPipelineIdForPreset,
    validateWorkflowProfileExists,
    clearConfigCache,
    createSettingsOverrides,
    mergePipelineIntoSettings,
    _testConfigCache,
} from '../pipelineConfigService';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const VALID_PIPELINE_CONFIG: PipelineConfig = {
    version: '1.0',
    id: 'test-pipeline',
    name: 'Test Pipeline',
    description: 'A test pipeline configuration',
    workflowProfileId: 'wan-fun-inpaint',
    presetMode: 'production-qa',
    stabilityProfile: 'standard',
    featureFlags: {
        base: 'production-qa',
        overrides: {},
    },
    qa: {
        keyframePairAnalysis: true,
        bookendQAMode: true,
        videoQualityGateEnabled: true,
        videoQualityThreshold: 70,
    },
    keyframeMode: 'bookend',
    vramRequirements: {
        minGB: 10,
        recommendedGB: 12,
        category: 'medium',
    },
};

const createMockSettings = (workflowProfiles?: Record<string, WorkflowProfile>): LocalGenerationSettings => ({
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: 'test-client',
    workflowJson: '{}',
    mapping: {},
    workflowProfiles: workflowProfiles ?? {
        'wan-fun-inpaint': {
            id: 'wan-fun-inpaint',
            label: 'WAN Fun Inpaint',
            workflowJson: '{"nodes": []}',
            mapping: {},
        },
        'wan-flf2v': {
            id: 'wan-flf2v',
            label: 'WAN FLF2V',
            workflowJson: '{"nodes": []}',
            mapping: {},
        },
    },
});

// ============================================================================
// TESTS: validatePipelineConfig
// ============================================================================

describe('pipelineConfigService', () => {
    beforeEach(() => {
        clearConfigCache();
        vi.clearAllMocks();
    });

    describe('validatePipelineConfig', () => {
        it('should validate a valid pipeline config', () => {
            const result = validatePipelineConfig(VALID_PIPELINE_CONFIG);
            
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });

        it('should reject null config', () => {
            const result = validatePipelineConfig(null);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Config must be a non-null object');
        });

        it('should reject non-object config', () => {
            const result = validatePipelineConfig('not an object');
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Config must be a non-null object');
        });

        it('should report missing required fields', () => {
            const incompleteConfig = {
                id: 'test',
                name: 'Test',
            };
            
            const result = validatePipelineConfig(incompleteConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors).toContain('Missing required field: version');
            expect(result.errors).toContain('Missing required field: workflowProfileId');
            expect(result.errors).toContain('Missing required field: presetMode');
            expect(result.errors).toContain('Missing required field: stabilityProfile');
        });

        it('should validate invalid presetMode', () => {
            const invalidConfig = {
                ...VALID_PIPELINE_CONFIG,
                presetMode: 'invalid-mode',
            };
            
            const result = validatePipelineConfig(invalidConfig);
            
            expect(result.valid).toBe(false);
        });

        it('should validate invalid stabilityProfile', () => {
            const invalidConfig = {
                ...VALID_PIPELINE_CONFIG,
                stabilityProfile: 'invalid-profile',
            };
            
            const result = validatePipelineConfig(invalidConfig);
            
            expect(result.valid).toBe(false);
        });

        it('should reject invalid featureFlags.base', () => {
            const invalidConfig: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                featureFlags: {
                    base: 'invalid-base' as 'default',
                    overrides: {},
                },
            };
            
            const result = validatePipelineConfig(invalidConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                "Invalid featureFlags.base: invalid-base. Must be one of: default, safe-defaults, production-qa"
            );
        });

        it('should warn on version mismatch', () => {
            const futureVersionConfig = {
                ...VALID_PIPELINE_CONFIG,
                version: '2.0',
            };
            
            const result = validatePipelineConfig(futureVersionConfig);
            
            expect(result.valid).toBe(true);
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.some(w => w.includes('may not be fully compatible'))).toBe(true);
        });

        it('should warn if minGB > recommendedGB', () => {
            const invalidVRAMConfig: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                vramRequirements: {
                    minGB: 16,
                    recommendedGB: 12,
                    category: 'high',
                },
            };
            
            const result = validatePipelineConfig(invalidVRAMConfig);
            
            expect(result.valid).toBe(true); // Warnings don't fail validation
            expect(result.warnings).toContain('VRAM minGB is greater than recommendedGB');
        });

        it('should reject invalid videoQualityThreshold', () => {
            const invalidQAConfig: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                qa: {
                    videoQualityThreshold: 150, // Out of range
                },
            };
            
            const result = validatePipelineConfig(invalidQAConfig);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('videoQualityThreshold must be between 0 and 100');
        });
    });

    // ============================================================================
    // TESTS: resolveFeatureFlags
    // ============================================================================

    describe('resolveFeatureFlags', () => {
        it('should use default flags when base is "default"', () => {
            const config: FeatureFlagsConfig = {
                base: 'default',
                overrides: {},
            };
            
            const result = resolveFeatureFlags(config, 'standard');
            
            // Should have all default flag values (with stability profile applied)
            expect(result.videoUpscaling).toBe(DEFAULT_FEATURE_FLAGS.videoUpscaling);
            expect(result.characterConsistency).toBe(DEFAULT_FEATURE_FLAGS.characterConsistency);
        });

        it('should use safe-defaults flags when base is "safe-defaults"', () => {
            const config: FeatureFlagsConfig = {
                base: 'safe-defaults',
                overrides: {},
            };
            
            const result = resolveFeatureFlags(config, 'fast');
            
            // Safe defaults should have these disabled
            expect(result.videoUpscaling).toBe(false);
            expect(result.videoDeflicker).toBe(false);
            expect(result.visionLLMFeedback).toBe(false);
        });

        it('should use production-qa flags when base is "production-qa"', () => {
            const config: FeatureFlagsConfig = {
                base: 'production-qa',
                overrides: {},
            };
            
            const result = resolveFeatureFlags(config, 'standard');
            
            // Production QA should have QA features enabled
            expect(result.keyframePairAnalysis).toBe(true);
            expect(result.bookendQAMode).toBe(true);
            expect(result.videoQualityGateEnabled).toBe(true);
        });

        it('should apply explicit overrides on top of base', () => {
            const config: FeatureFlagsConfig = {
                base: 'default',
                overrides: {
                    videoUpscaling: true,
                    characterConsistency: true,
                },
            };
            
            const result = resolveFeatureFlags(config, 'standard');
            
            expect(result.videoUpscaling).toBe(true);
            expect(result.characterConsistency).toBe(true);
        });

        it('should apply stability profile temporal settings', () => {
            const config: FeatureFlagsConfig = {
                base: 'default',
                overrides: {},
            };
            
            // Standard profile enables deflicker
            const resultStandard = resolveFeatureFlags(config, 'standard');
            expect(resultStandard.videoDeflicker).toBe(true);
            
            // Fast profile disables deflicker
            const resultFast = resolveFeatureFlags(config, 'fast');
            expect(resultFast.videoDeflicker).toBe(false);
            
            // Cinematic enables full stack
            const resultCinematic = resolveFeatureFlags(config, 'cinematic');
            expect(resultCinematic.videoDeflicker).toBe(true);
            expect(resultCinematic.ipAdapterReferenceConditioning).toBe(true);
        });

        it('should handle undefined config by using defaults', () => {
            const result = resolveFeatureFlags(undefined, 'standard');
            
            // Should return complete FeatureFlags object
            expect(result).toBeDefined();
            expect(typeof result.videoUpscaling).toBe('boolean');
        });
    });

    // ============================================================================
    // TESTS: resolvePipelineRuntimeConfig
    // ============================================================================

    describe('resolvePipelineRuntimeConfig', () => {
        it('should resolve a valid config to runtime objects', () => {
            const settings = createMockSettings();
            
            const result = resolvePipelineRuntimeConfig(VALID_PIPELINE_CONFIG, settings);
            
            expect(result.source).toBe(VALID_PIPELINE_CONFIG);
            expect(result.workflowProfileId).toBe('wan-fun-inpaint');
            expect(result.stabilityProfileId).toBe('standard');
            expect(result.keyframeMode).toBe('bookend');
            expect(result.vramRequirements.minGB).toBe(10);
            expect(result.vramRequirements.recommendedGB).toBe(12);
        });

        it('should throw error when workflowProfileId is not found', () => {
            const settingsWithoutProfile = createMockSettings({});
            
            expect(() => {
                resolvePipelineRuntimeConfig(VALID_PIPELINE_CONFIG, settingsWithoutProfile);
            }).toThrow("Workflow profile 'wan-fun-inpaint' not found");
        });

        it('should apply QA config overrides to feature flags', () => {
            const settings = createMockSettings();
            const configWithQA: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                qa: {
                    keyframePairAnalysis: true,
                    bookendQAMode: true,
                    videoQualityGateEnabled: true,
                    videoQualityThreshold: 80,
                    videoAnalysisFeedback: true,
                    autoVideoAnalysis: true,
                },
            };
            
            const result = resolvePipelineRuntimeConfig(configWithQA, settings);
            
            expect(result.featureFlags.keyframePairAnalysis).toBe(true);
            expect(result.featureFlags.bookendQAMode).toBe(true);
            expect(result.featureFlags.videoQualityGateEnabled).toBe(true);
            expect(result.featureFlags.videoQualityThreshold).toBe(80);
            expect(result.featureFlags.videoAnalysisFeedback).toBe(true);
            expect(result.featureFlags.autoVideoAnalysis).toBe(true);
        });

        it('should use stability profile defaults for VRAM when not specified', () => {
            const settings = createMockSettings();
            const configWithoutVRAM: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                vramRequirements: undefined,
            };
            
            const result = resolvePipelineRuntimeConfig(configWithoutVRAM, settings);
            
            // Standard profile: 8 GB min, 12 GB recommended
            expect(result.vramRequirements.minGB).toBe(8);
            expect(result.vramRequirements.recommendedGB).toBe(12);
        });

        it('should default keyframeMode to bookend when not specified', () => {
            const settings = createMockSettings();
            const configWithoutKeyframeMode: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                keyframeMode: undefined,
            };
            
            const result = resolvePipelineRuntimeConfig(configWithoutKeyframeMode, settings);
            
            expect(result.keyframeMode).toBe('bookend');
        });

        // =========================================================================
        // Camera Path Tests (E1 - Camera-as-Code)
        // =========================================================================

        it('should resolve camera path when provided inline', () => {
            const settings = createMockSettings();
            const configWithCameraPath: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                cameraPath: {
                    id: 'test-camera-path',
                    description: 'Test pan',
                    coordinateSpace: 'screen',
                    keyframes: [
                        { timeSeconds: 0, position: { x: 0, y: 0.5 } },
                        { timeSeconds: 2, position: { x: 1, y: 0.5 } },
                    ],
                },
            };

            const result = resolvePipelineRuntimeConfig(configWithCameraPath, settings);

            expect(result.cameraPath).toBeDefined();
            expect(result.cameraPath?.id).toBe('test-camera-path');
            expect(result.cameraPath?.keyframes.length).toBe(2);
            expect(result.cameraPath?.coordinateSpace).toBe('screen');
        });

        it('should have undefined cameraPath when not provided', () => {
            const settings = createMockSettings();
            const configWithoutCameraPath: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
            };

            const result = resolvePipelineRuntimeConfig(configWithoutCameraPath, settings);

            expect(result.cameraPath).toBeUndefined();
        });

        it('should resolve motionTracks when provided', () => {
            const settings = createMockSettings();
            const configWithMotionTracks: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                motionTracks: [
                    {
                        id: 'subject-1',
                        description: 'Main character walking',
                        motionType: 'walking',
                        intensity: 0.5,
                    },
                ],
            };

            const result = resolvePipelineRuntimeConfig(configWithMotionTracks, settings);

            expect(result.motionTracks).toBeDefined();
            expect(result.motionTracks?.length).toBe(1);
            expect(result.motionTracks?.[0]?.id).toBe('subject-1');
        });
    });

    // ============================================================================
    // TESTS: validatePipelineConfig - Camera Path Validation
    // ============================================================================

    describe('validatePipelineConfig - camera path validation', () => {
        it('should accept valid camera path', () => {
            const configWithValidCameraPath: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                cameraPath: {
                    id: 'valid-path',
                    keyframes: [
                        { timeSeconds: 0, position: { x: 0, y: 0 } },
                        { timeSeconds: 1, position: { x: 1, y: 1 } },
                    ],
                },
            };

            const result = validatePipelineConfig(configWithValidCameraPath);

            expect(result.valid).toBe(true);
        });

        it('should warn when camera path has single keyframe', () => {
            const configWithSingleKeyframe: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                cameraPath: {
                    id: 'single-keyframe',
                    keyframes: [
                        { timeSeconds: 0, position: { x: 0.5, y: 0.5 } },
                    ],
                },
            };

            const result = validatePipelineConfig(configWithSingleKeyframe);

            expect(result.valid).toBe(true);
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.some(w => w.includes('only one keyframe'))).toBe(true);
        });

        it('should reject camera path with no keyframes', () => {
            const configWithNoKeyframes: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                cameraPath: {
                    id: 'no-keyframes',
                    keyframes: [],
                },
            };

            const result = validatePipelineConfig(configWithNoKeyframes);

            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('at least one keyframe'))).toBe(true);
        });

        it('should reject camera path with out-of-order keyframes', () => {
            const configWithOutOfOrder: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                cameraPath: {
                    id: 'out-of-order',
                    keyframes: [
                        { timeSeconds: 2, position: { x: 1, y: 0 } },
                        { timeSeconds: 1, position: { x: 0, y: 0 } },
                    ],
                },
            };

            const result = validatePipelineConfig(configWithOutOfOrder);

            expect(result.valid).toBe(false);
            expect(result.errors?.some(e => e.includes('less than previous'))).toBe(true);
        });

        it('should warn when cameraPathId is provided without inline cameraPath', () => {
            const configWithPathId: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                cameraPathId: 'external-path-reference',
            };

            const result = validatePipelineConfig(configWithPathId);

            expect(result.valid).toBe(true);
            expect(result.warnings?.some(w => w.includes('external camera path resolution'))).toBe(true);
        });
    });

    // ============================================================================
    // TESTS: getDefaultPipelineIdForPreset
    // ============================================================================

    describe('getDefaultPipelineIdForPreset', () => {
        it('should return fast-preview for fast preset', () => {
            expect(getDefaultPipelineIdForPreset('fast')).toBe('fast-preview');
        });

        it('should return production-qa-preview for production preset', () => {
            expect(getDefaultPipelineIdForPreset('production')).toBe('production-qa-preview');
        });

        it('should return production-qa-preview for production-qa preset', () => {
            expect(getDefaultPipelineIdForPreset('production-qa')).toBe('production-qa-preview');
        });

        it('should return cinematic-preview for cinematic preset', () => {
            expect(getDefaultPipelineIdForPreset('cinematic')).toBe('cinematic-preview');
        });

        it('should default to production-qa-preview for unknown presets', () => {
            expect(getDefaultPipelineIdForPreset('unknown')).toBe('production-qa-preview');
        });
    });

    // ============================================================================
    // TESTS: validateWorkflowProfileExists
    // ============================================================================

    describe('validateWorkflowProfileExists', () => {
        it('should return exists:true for valid profile', () => {
            const settings = createMockSettings();
            
            const result = validateWorkflowProfileExists('wan-fun-inpaint', settings);
            
            expect(result.exists).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return exists:false for missing profile', () => {
            const settings = createMockSettings();
            
            const result = validateWorkflowProfileExists('non-existent', settings);
            
            expect(result.exists).toBe(false);
            expect(result.error).toContain('not found');
        });

        it('should return exists:false for profile without workflowJson', () => {
            const settingsWithEmptyProfile = createMockSettings({
                'empty-profile': {
                    id: 'empty-profile',
                    label: 'Empty Profile',
                    workflowJson: '',
                    mapping: {},
                },
            });
            
            const result = validateWorkflowProfileExists('empty-profile', settingsWithEmptyProfile);
            
            expect(result.exists).toBe(false);
            expect(result.error).toContain('no workflow JSON');
        });
    });

    // ============================================================================
    // TESTS: createSettingsOverrides & mergePipelineIntoSettings
    // ============================================================================

    describe('createSettingsOverrides', () => {
        it('should create correct settings overrides', () => {
            const settings = createMockSettings();
            const resolved = resolvePipelineRuntimeConfig(VALID_PIPELINE_CONFIG, settings);
            
            const overrides = createSettingsOverrides(resolved);
            
            expect(overrides.videoWorkflowProfile).toBe('wan-fun-inpaint');
            expect(overrides.sceneBookendWorkflowProfile).toBe('wan-fun-inpaint');
            expect(overrides.keyframeMode).toBe('bookend');
            expect(overrides.featureFlags).toBeDefined();
        });
    });

    describe('mergePipelineIntoSettings', () => {
        it('should merge pipeline config into settings', () => {
            const settings = createMockSettings();
            const resolved = resolvePipelineRuntimeConfig(VALID_PIPELINE_CONFIG, settings);
            
            const merged = mergePipelineIntoSettings(settings, resolved);
            
            // Original settings preserved
            expect(merged.comfyUIUrl).toBe(settings.comfyUIUrl);
            expect(merged.comfyUIClientId).toBe(settings.comfyUIClientId);
            
            // Pipeline config applied
            expect(merged.videoWorkflowProfile).toBe('wan-fun-inpaint');
            expect(merged.keyframeMode).toBe('bookend');
            expect(merged.featureFlags?.bookendQAMode).toBe(true);
        });

        it('should not mutate original settings', () => {
            const settings = createMockSettings();
            const originalVideoProfile = settings.videoWorkflowProfile;
            const resolved = resolvePipelineRuntimeConfig(VALID_PIPELINE_CONFIG, settings);
            
            mergePipelineIntoSettings(settings, resolved);
            
            // Original should be unchanged
            expect(settings.videoWorkflowProfile).toBe(originalVideoProfile);
        });
    });

    // ============================================================================
    // TESTS: loadPipelineConfig (with fetch mock)
    // ============================================================================

    describe('loadPipelineConfig', () => {
        const originalFetch = global.fetch;

        beforeEach(() => {
            clearConfigCache();
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        it('should load and cache valid config', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(VALID_PIPELINE_CONFIG),
            });

            const result = await loadPipelineConfig('/config/pipelines/test.json');

            expect(result.success).toBe(true);
            expect(result.config).toEqual(VALID_PIPELINE_CONFIG);
            expect(_testConfigCache.has('/config/pipelines/test.json')).toBe(true);
        });

        it('should return cached config on second call', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(VALID_PIPELINE_CONFIG),
            });

            await loadPipelineConfig('/config/pipelines/test.json');
            const result = await loadPipelineConfig('/config/pipelines/test.json');

            // Fetch should only be called once (second call uses cache)
            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(result.success).toBe(true);
        });

        it('should return error for failed fetch', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            const result = await loadPipelineConfig('/config/pipelines/missing.json');

            expect(result.success).toBe(false);
            expect(result.error).toContain('404');
        });

        it('should return error for invalid JSON', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ invalid: 'config' }),
            });

            const result = await loadPipelineConfig('/config/pipelines/invalid.json');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid config');
        });

        it('should return error for fetch exception', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const result = await loadPipelineConfig('/config/pipelines/error.json');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('loadPipelineConfigById', () => {
        afterEach(() => {
            global.fetch = vi.fn();
        });

        it('should construct correct path from ID', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(VALID_PIPELINE_CONFIG),
            });

            await loadPipelineConfigById('production-qa-preview');

            expect(global.fetch).toHaveBeenCalledWith('/config/pipelines/production-qa-preview.json');
        });

        it('should load cinematic-gold pipeline configuration', async () => {
            // Test that cinematic-gold ID is properly wired
            const cinematicGoldConfig: PipelineConfig = {
                ...VALID_PIPELINE_CONFIG,
                id: 'cinematic-gold',
                name: 'Cinematic Gold',
                workflowProfileId: 'wan-flf2v-feta',
            };
            
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(cinematicGoldConfig),
            });

            const result = await loadPipelineConfigById('cinematic-gold');

            expect(global.fetch).toHaveBeenCalledWith('/config/pipelines/cinematic-gold.json');
            expect(result.success).toBe(true);
            expect(result.config?.id).toBe('cinematic-gold');
            expect(result.config?.workflowProfileId).toBe('wan-flf2v-feta');
        });
    });

    describe('clearConfigCache', () => {
        it('should clear the config cache', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(VALID_PIPELINE_CONFIG),
            });

            await loadPipelineConfig('/test.json');
            expect(_testConfigCache.size).toBeGreaterThan(0);

            clearConfigCache();
            expect(_testConfigCache.size).toBe(0);
        });
    });
});
