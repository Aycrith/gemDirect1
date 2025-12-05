/**
 * Tests for Deflicker Service (Phase 5 - Temporal Coherence Enhancement)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isDeflickerEnabled,
    getDeflickerConfig,
    isDeflickerSupported,
    createDeflickerNodeInjection,
    applyDeflickerToWorkflow,
    estimateDeflickerTime,
    getAvailableDeflickerNode,
    DEFAULT_DEFLICKER_CONFIG,
    type DeflickerConfig,
} from '../deflickerService';
import type { LocalGenerationSettings } from '../../types';
import { DEFAULT_FEATURE_FLAGS } from '../../utils/featureFlags';

// Mock getInstalledNodes from comfyUIService
vi.mock('../comfyUIService', () => ({
    getInstalledNodes: vi.fn().mockResolvedValue(new Set(['TemporalSmoothing'])),
}));

// Import the mock for verification
import { getInstalledNodes } from '../comfyUIService';

// Mock console to avoid noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Helper to create test settings
function createTestSettings(overrides: Partial<LocalGenerationSettings> = {}): LocalGenerationSettings {
    return {
        comfyUIUrl: 'http://localhost:8188',
        comfyUIClientId: 'test-client',
        workflowJson: '{}',
        mapping: {},
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
        ...overrides,
    };
}

describe('Deflicker Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isDeflickerEnabled', () => {
        it('should return true when deflicker is enabled (Phase 8 default)', () => {
            // Phase 8: Standard profile is now the default, which has deflicker ON
            const settings = createTestSettings();
            expect(isDeflickerEnabled(settings)).toBe(true);
        });

        it('should return false when deflicker is explicitly disabled', () => {
            const settings = createTestSettings({
                featureFlags: { ...DEFAULT_FEATURE_FLAGS, videoDeflicker: false },
            });
            expect(isDeflickerEnabled(settings)).toBe(false);
        });
    });

    describe('getDeflickerConfig', () => {
        it('should return enabled config by default (Phase 8 Standard profile)', () => {
            // Phase 8: Standard profile is now the default, which has deflicker ON
            const settings = createTestSettings();
            const config = getDeflickerConfig(settings);
            
            expect(config.enabled).toBe(true);
            expect(config.strength).toBe(DEFAULT_DEFLICKER_CONFIG.strength);
            expect(config.windowSize).toBe(DEFAULT_DEFLICKER_CONFIG.windowSize);
            expect(config.method).toBe('temporal_blend');
        });

        it('should return custom config when values are set', () => {
            const settings = createTestSettings({
                featureFlags: {
                    ...DEFAULT_FEATURE_FLAGS,
                    videoDeflicker: true,
                    deflickerStrength: 0.5,
                    deflickerWindowSize: 5,
                },
            });
            const config = getDeflickerConfig(settings);
            
            expect(config.enabled).toBe(true);
            expect(config.strength).toBe(0.5);
            expect(config.windowSize).toBe(5);
        });
    });

    describe('isDeflickerSupported', () => {
        it('should return true (always supported for now)', () => {
            const settings = createTestSettings();
            expect(isDeflickerSupported(settings)).toBe(true);
        });
    });

    describe('getAvailableDeflickerNode', () => {
        it('should return TemporalSmoothing when available', async () => {
            vi.mocked(getInstalledNodes).mockResolvedValueOnce(new Set(['TemporalSmoothing', 'KSampler']));
            const result = await getAvailableDeflickerNode('http://localhost:8188');
            expect(result).toBe('TemporalSmoothing');
        });

        it('should return VHS_VideoDeflicker when available and TemporalSmoothing is not', async () => {
            vi.mocked(getInstalledNodes).mockResolvedValueOnce(new Set(['VHS_VideoDeflicker', 'KSampler']));
            const result = await getAvailableDeflickerNode('http://localhost:8188');
            expect(result).toBe('VHS_VideoDeflicker');
        });

        it('should return null when no deflicker nodes are available', async () => {
            vi.mocked(getInstalledNodes).mockResolvedValueOnce(new Set(['KSampler', 'VAEDecode']));
            const result = await getAvailableDeflickerNode('http://localhost:8188');
            expect(result).toBeNull();
        });

        it('should return null and log warning when ComfyUI query fails', async () => {
            vi.mocked(getInstalledNodes).mockRejectedValueOnce(new Error('Connection refused'));
            const result = await getAvailableDeflickerNode('http://localhost:8188');
            expect(result).toBeNull();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to query'),
                expect.any(Error)
            );
        });
    });

    describe('createDeflickerNodeInjection', () => {
        it('should return empty object when disabled', () => {
            const config: DeflickerConfig = {
                enabled: false,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            const result = createDeflickerNodeInjection(config, '14', 0);
            expect(Object.keys(result).length).toBe(0);
        });

        it('should create node injection when enabled', () => {
            const config: DeflickerConfig = {
                enabled: true,
                strength: 0.4,
                windowSize: 5,
                method: 'temporal_blend',
            };
            const result = createDeflickerNodeInjection(config, '14', 0, 'TemporalSmoothing');
            
            expect(Object.keys(result).length).toBe(1);
            const nodeId = Object.keys(result)[0];
            expect(nodeId).toBeDefined();
            expect(nodeId).toContain('deflicker_');
            
            if (!nodeId) throw new Error('nodeId should be defined');
            const node = result[nodeId];
            expect(node).toBeDefined();
            expect(node!.class_type).toBe('TemporalSmoothing');
            expect(node!.inputs.images).toEqual(['14', 0]);
            expect(node!.inputs.window_size).toBe(5);
            expect(node!.inputs.strength).toBe(0.4);
        });
    });

    describe('applyDeflickerToWorkflow', () => {
        const mockWorkflow = {
            nodes: {
                '14': {
                    class_type: 'VAEDecode',
                    inputs: { samples: ['13', 0], vae: ['2', 0] },
                },
                '15': {
                    class_type: 'CreateVideo',
                    inputs: { fps: 16, images: ['14', 0] },
                },
            },
        };

        it('should return unchanged workflow when disabled', async () => {
            const config: DeflickerConfig = {
                enabled: false,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            const result = await applyDeflickerToWorkflow(mockWorkflow, config);
            expect(result).toBe(mockWorkflow);
        });

        it('should inject deflicker node when enabled and node is available', async () => {
            // Mock that TemporalSmoothing is available
            vi.mocked(getInstalledNodes).mockResolvedValueOnce(new Set(['TemporalSmoothing']));
            
            const config: DeflickerConfig = {
                enabled: true,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            const result = await applyDeflickerToWorkflow(mockWorkflow, config, 'http://localhost:8188');
            
            // Should not mutate original
            expect(result).not.toBe(mockWorkflow);
            
            // Should have new deflicker node
            const nodes = result.nodes as Record<string, Record<string, unknown>>;
            const nodeIds = Object.keys(nodes);
            expect(nodeIds.length).toBe(3);
            
            const deflickerNodeId = nodeIds.find(id => id.includes('deflicker_'));
            expect(deflickerNodeId).toBeDefined();
            
            // CreateVideo should now point to deflicker node
            const videoNode = nodes['15'];
            expect(videoNode).toBeDefined();
            expect(videoNode!.inputs).toHaveProperty('images');
            const images = (videoNode!.inputs as Record<string, unknown>).images as [string, number];
            expect(images[0]).toBe(deflickerNodeId);
        });

        it('should skip injection when no deflicker node is available (graceful degradation)', async () => {
            // Mock that no deflicker nodes are available
            vi.mocked(getInstalledNodes).mockResolvedValueOnce(new Set(['KSampler', 'VAEDecode']));
            
            const config: DeflickerConfig = {
                enabled: true,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            const result = await applyDeflickerToWorkflow(mockWorkflow, config, 'http://localhost:8188');
            
            // Should return unchanged workflow (graceful degradation)
            expect(result).toBe(mockWorkflow);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('no compatible node installed'));
        });

        it('should warn when required nodes are missing', async () => {
            const config: DeflickerConfig = {
                enabled: true,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            const badWorkflow = { nodes: {} };
            const result = await applyDeflickerToWorkflow(badWorkflow, config);
            
            expect(console.warn).toHaveBeenCalled();
            expect(result).toBe(badWorkflow);
        });
    });

    describe('estimateDeflickerTime', () => {
        it('should return 0 when disabled', () => {
            const config: DeflickerConfig = {
                enabled: false,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            expect(estimateDeflickerTime(81, config)).toBe(0);
        });

        it('should estimate time based on frame count and window size', () => {
            const config: DeflickerConfig = {
                enabled: true,
                strength: 0.35,
                windowSize: 3,
                method: 'temporal_blend',
            };
            const estimate = estimateDeflickerTime(81, config);
            
            // 81 frames * 10ms base * (3/3 multiplier) = 810ms
            expect(estimate).toBe(810);
        });

        it('should scale with window size', () => {
            const config: DeflickerConfig = {
                enabled: true,
                strength: 0.35,
                windowSize: 6,
                method: 'temporal_blend',
            };
            const estimate = estimateDeflickerTime(81, config);
            
            // 81 frames * 10ms base * (6/3 multiplier) = 1620ms
            expect(estimate).toBe(1620);
        });
    });
});
