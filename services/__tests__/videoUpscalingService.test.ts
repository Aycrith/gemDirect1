/**
 * Video Upscaling Service Tests
 * 
 * Tests for video upscaling functionality including:
 * - Configuration validation
 * - VRAM estimation
 * - Support detection
 * 
 * @module services/__tests__/videoUpscalingService.test
 */

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_UPSCALE_CONFIG,
    validateUpscaleConfig,
    estimateVramUsage,
    isUpscalingSupported,
    isInterpolationSupported,
    getUpscalerProfile,
    buildUpscalePayload,
} from '../videoUpscalingService';
import type { LocalGenerationSettings } from '../../types';

// Helper to create mock settings
function createMockSettings(overrides?: Partial<LocalGenerationSettings>): LocalGenerationSettings {
    return {
        enabled: true,
        comfyUIUrl: 'http://127.0.0.1:8188',
        comfyUIClientId: 'test',
        videoProvider: 'comfyui-local',
        imageWorkflowProfile: 'flux-t2i',
        videoWorkflowProfile: 'wan-i2v',
        featureFlags: {
            videoUpscaling: true,
            frameInterpolationEnabled: true,
        },
        workflowProfiles: {
            'video-upscaler': {
                id: 'video-upscaler',
                label: 'Video Upscaler',
                workflowJson: '{"prompt":{}}',
                mapping: {
                    '1:file': 'input_video',
                },
            },
            'rife-interpolation': {
                id: 'rife-interpolation',
                label: 'RIFE Interpolation',
                workflowJson: '{"prompt":{}}',
                mapping: {
                    '1:file': 'input_video',
                },
            },
        },
        ...overrides,
    } as LocalGenerationSettings;
}

describe('videoUpscalingService', () => {
    describe('DEFAULT_UPSCALE_CONFIG', () => {
        it('should have sensible defaults', () => {
            expect(DEFAULT_UPSCALE_CONFIG.scaleFactor).toBe(2);
            expect(DEFAULT_UPSCALE_CONFIG.model).toBe('4x-UltraSharp');
            expect(DEFAULT_UPSCALE_CONFIG.useTiles).toBe(true);
            expect(DEFAULT_UPSCALE_CONFIG.tileSize).toBe(512);
            expect(DEFAULT_UPSCALE_CONFIG.quality).toBe(90);
        });
    });

    describe('validateUpscaleConfig', () => {
        it('should accept valid config', () => {
            const result = validateUpscaleConfig({
                scaleFactor: 2,
                quality: 90,
                tileSize: 512,
            });
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should reject invalid scale factor', () => {
            const result = validateUpscaleConfig({
                scaleFactor: 3 as any, // Invalid
            });
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid scale factor');
        });

        it('should reject quality out of range', () => {
            const result = validateUpscaleConfig({
                quality: 101,
            });
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid quality');
        });

        it('should reject tile size out of range', () => {
            const result = validateUpscaleConfig({
                tileSize: 64, // Too small
            });
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid tile size');
        });

        it('should allow all valid scale factors', () => {
            expect(validateUpscaleConfig({ scaleFactor: 1.5 }).valid).toBe(true);
            expect(validateUpscaleConfig({ scaleFactor: 2 }).valid).toBe(true);
            expect(validateUpscaleConfig({ scaleFactor: 4 }).valid).toBe(true);
        });
    });

    describe('estimateVramUsage', () => {
        it('should estimate VRAM for small video', () => {
            const result = estimateVramUsage(640, 480, DEFAULT_UPSCALE_CONFIG);
            expect(result.estimated).toBeGreaterThan(0);
            expect(result.safe).toBe(true);
        });

        it('should estimate higher VRAM for larger video', () => {
            const small = estimateVramUsage(640, 480, DEFAULT_UPSCALE_CONFIG);
            const large = estimateVramUsage(1920, 1080, DEFAULT_UPSCALE_CONFIG);
            // Convert to same unit for comparison
            const smallMB = small.unit === 'GB' ? small.estimated * 1024 : small.estimated;
            const largeMB = large.unit === 'GB' ? large.estimated * 1024 : large.estimated;
            expect(largeMB).toBeGreaterThan(smallMB);
        });

        it('should estimate lower VRAM with tiles', () => {
            const withTiles = estimateVramUsage(1920, 1080, {
                ...DEFAULT_UPSCALE_CONFIG,
                useTiles: true,
            });
            const withoutTiles = estimateVramUsage(1920, 1080, {
                ...DEFAULT_UPSCALE_CONFIG,
                useTiles: false,
            });
            expect(withTiles.estimated).toBeLessThan(withoutTiles.estimated);
        });

        it('should use MB for small estimates', () => {
            const result = estimateVramUsage(320, 240, DEFAULT_UPSCALE_CONFIG);
            expect(result.unit).toBe('MB');
        });
    });

    describe('isUpscalingSupported', () => {
        it('should return true when all requirements met', () => {
            const settings = createMockSettings();
            expect(isUpscalingSupported(settings)).toBe(true);
        });

        it('should return false when feature flag disabled', () => {
            const settings = createMockSettings({
                featureFlags: { videoUpscaling: false, frameInterpolationEnabled: true } as LocalGenerationSettings['featureFlags'],
            });
            expect(isUpscalingSupported(settings)).toBe(false);
        });

        it('should return false when ComfyUI URL missing', () => {
            const settings = createMockSettings({
                comfyUIUrl: '',
            });
            expect(isUpscalingSupported(settings)).toBe(false);
        });

        it('should return false when upscaler profile missing', () => {
            const settings = createMockSettings({
                workflowProfiles: {},
            });
            expect(isUpscalingSupported(settings)).toBe(false);
        });
    });

    describe('isInterpolationSupported', () => {
        it('should return true when all requirements met', () => {
            const settings = createMockSettings();
            expect(isInterpolationSupported(settings)).toBe(true);
        });

        it('should return false when feature flag disabled', () => {
            const settings = createMockSettings({
                featureFlags: { videoUpscaling: true, frameInterpolationEnabled: false } as LocalGenerationSettings['featureFlags'],
            });
            expect(isInterpolationSupported(settings)).toBe(false);
        });

        it('should return false when ComfyUI URL missing', () => {
            const settings = createMockSettings({
                comfyUIUrl: '',
            });
            expect(isInterpolationSupported(settings)).toBe(false);
        });

        it('should return false when interpolation profile missing', () => {
            const base = createMockSettings();
            const settings = createMockSettings({
                workflowProfiles: {
                    'video-upscaler': base.workflowProfiles!['video-upscaler']!,
                },
            });
            expect(isInterpolationSupported(settings)).toBe(false);
        });
    });

    describe('getUpscalerProfile', () => {
        it('should return profile when exists', () => {
            const settings = createMockSettings();
            const profile = getUpscalerProfile(settings);
            expect(profile).not.toBeNull();
            expect(profile?.id).toBe('video-upscaler');
        });

        it('should return null when profile missing', () => {
            const settings = createMockSettings({
                workflowProfiles: {},
            });
            expect(getUpscalerProfile(settings)).toBeNull();
        });
    });

    describe('buildUpscalePayload', () => {
        it('should build payload with defaults', () => {
            const payload = buildUpscalePayload('/path/to/video.mp4');
            expect(payload.input_video).toBe('/path/to/video.mp4');
            expect(payload.upscale_model).toBe('4x-UltraSharp');
            expect(payload.scale_factor).toBe(2);
            expect(payload.use_tiles).toBe(true);
            expect(payload.tile_size).toBe(512);
            expect(payload.quality).toBe(90);
        });

        it('should use custom config values', () => {
            const payload = buildUpscalePayload('/path/to/video.mp4', {
                scaleFactor: 4,
                model: 'RealESRGAN_x4plus',
                useTiles: false,
                tileSize: 1024,
                quality: 100,
            });
            expect(payload.upscale_model).toBe('RealESRGAN_x4plus');
            expect(payload.scale_factor).toBe(4);
            expect(payload.use_tiles).toBe(false);
            expect(payload.tile_size).toBe(1024);
            expect(payload.quality).toBe(100);
        });
    });
});
