/**
 * Tests for Resource Preflight Module
 * 
 * @module services/__tests__/resourcePreflight.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before imports
vi.mock('../comfyUIService', () => ({
    checkSystemResources: vi.fn(),
    getInstalledNodes: vi.fn(),
}));

vi.mock('../deflickerService', () => ({
    getAvailableDeflickerNode: vi.fn(),
}));

vi.mock('../ipAdapterService', () => ({
    checkIPAdapterAvailability: vi.fn(),
}));

import {
    parseVRAMStatus,
    checkVRAMForPreset,
    checkNodesForProfile,
    findBestAvailablePreset,
    runResourcePreflight,
    canProceedWithGeneration,
    formatPreflightSummary,
    PRESET_VRAM_REQUIREMENTS,
    VRAM_HEADROOM_MB,
    WORKFLOW_REQUIRED_NODES,
} from '../resourcePreflight';

import { checkSystemResources, getInstalledNodes } from '../comfyUIService';
import { getAvailableDeflickerNode } from '../deflickerService';
import { checkIPAdapterAvailability } from '../ipAdapterService';

describe('resourcePreflight', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parseVRAMStatus', () => {
        it('should parse valid VRAM status message', () => {
            const message = 'GPU: NVIDIA GeForce RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 20.5 GB';
            const result = parseVRAMStatus(message);

            expect(result.available).toBe(true);
            expect(result.gpuName).toBe('NVIDIA GeForce RTX 3090');
            expect(result.totalMB).toBe(24.0 * 1024);
            expect(result.freeMB).toBe(20.5 * 1024);
            expect(result.utilizationPercent).toBeCloseTo(14.6, 0);
        });

        it('should handle message with only free VRAM', () => {
            const message = 'Free VRAM: 10.0 GB';
            const result = parseVRAMStatus(message);

            expect(result.available).toBe(true);
            expect(result.freeMB).toBe(10.0 * 1024);
        });

        it('should return unavailable for empty message', () => {
            const result = parseVRAMStatus('');

            expect(result.available).toBe(false);
            expect(result.freeMB).toBe(0);
        });
    });

    describe('PRESET_VRAM_REQUIREMENTS', () => {
        it('should have requirements for all presets', () => {
            // Updated for Task B2: Safe defaults mode with lower VRAM thresholds
            expect(PRESET_VRAM_REQUIREMENTS.fast).toBe(6144);     // ~6 GB
            expect(PRESET_VRAM_REQUIREMENTS.standard).toBe(8192); // ~8 GB
            expect(PRESET_VRAM_REQUIREMENTS.cinematic).toBe(12288); // ~12 GB
            expect(PRESET_VRAM_REQUIREMENTS.custom).toBe(8192);   // ~8 GB (same as standard)
        });

        it('should have fast < standard < cinematic requirements', () => {
            expect(PRESET_VRAM_REQUIREMENTS.fast).toBeLessThan(PRESET_VRAM_REQUIREMENTS.standard);
            expect(PRESET_VRAM_REQUIREMENTS.standard).toBeLessThan(PRESET_VRAM_REQUIREMENTS.cinematic);
        });
    });

    describe('WORKFLOW_REQUIRED_NODES', () => {
        it('should have node requirements for common profiles', () => {
            expect(WORKFLOW_REQUIRED_NODES['wan-t2i']).toContain('CLIPTextEncode');
            expect(WORKFLOW_REQUIRED_NODES['wan-i2v']).toContain('LoadImage');
            expect(WORKFLOW_REQUIRED_NODES['wan-flf2v']).toContain('WanFirstLastFrameToVideo');
        });
    });

    describe('checkVRAMForPreset', () => {
        it('should return sufficient when VRAM exceeds requirement', async () => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 20.0 GB'
            );

            const result = await checkVRAMForPreset('http://localhost:8188', 'standard');

            expect(result.sufficient).toBe(true);
            expect(result.vramStatus.freeMB).toBe(20.0 * 1024);
        });

        it('should return insufficient when VRAM is below requirement', async () => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 8.0 GB'
            );

            const result = await checkVRAMForPreset('http://localhost:8188', 'cinematic');

            expect(result.sufficient).toBe(false);
        });

        it('should account for headroom in requirement', async () => {
            const exactRequirement = PRESET_VRAM_REQUIREMENTS.fast + VRAM_HEADROOM_MB;
            vi.mocked(checkSystemResources).mockResolvedValue(
                `GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: ${(exactRequirement / 1024).toFixed(1)} GB`
            );

            const result = await checkVRAMForPreset('http://localhost:8188', 'fast');

            expect(result.sufficient).toBe(true);
        });

        it('should handle check failure gracefully', async () => {
            vi.mocked(checkSystemResources).mockRejectedValue(new Error('Connection refused'));

            const result = await checkVRAMForPreset('http://localhost:8188', 'standard');

            expect(result.sufficient).toBe(false);
            expect(result.message).toContain('check failed');
        });
    });

    describe('checkNodesForProfile', () => {
        it('should return success when all nodes available', async () => {
            vi.mocked(getInstalledNodes).mockResolvedValue(
                new Set(['CLIPTextEncode', 'LoadImage', 'KSampler', 'VAEDecode', 'VHS_VideoCombine'])
            );

            const result = await checkNodesForProfile('http://localhost:8188', 'wan-i2v');

            expect(result.success).toBe(true);
            expect(result.missing.length).toBe(0);
        });

        it('should return failure when nodes are missing', async () => {
            vi.mocked(getInstalledNodes).mockResolvedValue(
                new Set(['CLIPTextEncode']) // Missing LoadImage, etc.
            );

            const result = await checkNodesForProfile('http://localhost:8188', 'wan-i2v');

            expect(result.success).toBe(false);
            expect(result.missing).toContain('LoadImage');
        });

        it('should succeed for unknown profile (no requirements)', async () => {
            const result = await checkNodesForProfile('http://localhost:8188', 'unknown-profile');

            expect(result.success).toBe(true);
        });
    });

    describe('findBestAvailablePreset', () => {
        it('should return requested preset when VRAM sufficient', () => {
            const vramStatus = { available: true, freeMB: 20000, totalMB: 24000, utilizationPercent: 17 };
            const result = findBestAvailablePreset(vramStatus, 'cinematic');

            expect(result.preset).toBe('cinematic');
            expect(result.wasDowngraded).toBe(false);
        });

        it('should downgrade cinematic to standard when insufficient', () => {
            // Standard needs 8192 + 2048 headroom = 10240MB
            // So 11000MB is enough for standard but not cinematic (12288 + 2048 = 14336)
            const vramStatus = { available: true, freeMB: 11000, totalMB: 24000, utilizationPercent: 54.2 };
            const result = findBestAvailablePreset(vramStatus, 'cinematic');

            expect(result.preset).toBe('standard');
            expect(result.wasDowngraded).toBe(true);
        });

        it('should downgrade to fast when very low VRAM', () => {
            const vramStatus = { available: true, freeMB: 10000, totalMB: 24000, utilizationPercent: 58 };
            const result = findBestAvailablePreset(vramStatus, 'cinematic');

            expect(result.preset).toBe('fast');
            expect(result.wasDowngraded).toBe(true);
        });

        it('should return fast even when insufficient for fast (blocked scenario)', () => {
            const vramStatus = { available: true, freeMB: 5000, totalMB: 24000, utilizationPercent: 79 };
            const result = findBestAvailablePreset(vramStatus, 'fast');

            expect(result.preset).toBe('fast');
            expect(result.wasDowngraded).toBe(true);
        });
    });

    describe('runResourcePreflight', () => {
        const mockSettings = {
            comfyUIUrl: 'http://localhost:8188',
            comfyUIClientId: 'test-client',
            workflowJson: '{}',
            mapping: {},
        };

        beforeEach(() => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 20.0 GB'
            );
            vi.mocked(getInstalledNodes).mockResolvedValue(
                new Set(['CLIPTextEncode', 'LoadImage', 'KSampler', 'VAEDecode', 'VHS_VideoCombine'])
            );
            vi.mocked(getAvailableDeflickerNode).mockResolvedValue(null);
            vi.mocked(checkIPAdapterAvailability).mockResolvedValue({
                available: false,
                availableNodes: [],
                missingNodes: ['IPAdapterApply'],
                warnings: [],
            });
        });

        it('should return ready when all checks pass', async () => {
            // Also mock deflicker to return a node so we get 'ready' not 'warning'
            vi.mocked(getAvailableDeflickerNode).mockResolvedValueOnce('VHS_VideoDeflicker');
            vi.mocked(checkIPAdapterAvailability).mockResolvedValueOnce({
                available: true,
                availableNodes: ['IPAdapterApply'],
                missingNodes: [],
                warnings: [],
            });

            const result = await runResourcePreflight(mockSettings, {
                profileId: 'wan-i2v',
                requestedPreset: 'standard',
            });

            // Status is 'ready' when all checks pass and enhancements available
            expect(result.status).toBe('ready');
            expect(result.wasDowngraded).toBe(false);
        });

        it('should return blocked when ComfyUI URL not configured', async () => {
            const result = await runResourcePreflight({ ...mockSettings, comfyUIUrl: '' });

            expect(result.status).toBe('blocked');
            expect(result.messages.some(m => m.code === 'SERVER_UNREACHABLE')).toBe(true);
        });

        it('should allow skipping VRAM check', async () => {
            vi.mocked(checkSystemResources).mockRejectedValue(new Error('Timeout'));

            const result = await runResourcePreflight(mockSettings, {
                skipVRAMCheck: true,
                skipNodeCheck: true,
            });

            expect(result.status).toBe('ready');
        });

        it('should downgrade preset when VRAM insufficient', async () => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 12.0 GB'
            );

            const result = await runResourcePreflight(mockSettings, {
                requestedPreset: 'cinematic',
                allowDowngrade: true,
            });

            expect(result.status).toBe('warning');
            expect(result.wasDowngraded).toBe(true);
            expect(result.recommendedPreset).not.toBe('cinematic');
        });

        it('should block when downgrade not allowed and VRAM insufficient', async () => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 5.0 GB'
            );

            const result = await runResourcePreflight(mockSettings, {
                requestedPreset: 'cinematic',
                allowDowngrade: false,
            });

            expect(result.status).toBe('blocked');
        });
    });

    describe('canProceedWithGeneration', () => {
        it('should return canProceed true when VRAM sufficient', async () => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 12.0 GB'
            );

            const result = await canProceedWithGeneration('http://localhost:8188');

            expect(result.canProceed).toBe(true);
            expect(result.freeMB).toBe(12 * 1024);
        });

        it('should return canProceed false when VRAM too low', async () => {
            vi.mocked(checkSystemResources).mockResolvedValue(
                'GPU: RTX 3090 | Total VRAM: 24.0 GB | Free VRAM: 4.0 GB'
            );

            const result = await canProceedWithGeneration('http://localhost:8188');

            expect(result.canProceed).toBe(false);
            expect(result.reason).toContain('Insufficient VRAM');
        });

        it('should fail-open on error', async () => {
            vi.mocked(checkSystemResources).mockRejectedValue(new Error('Network error'));

            const result = await canProceedWithGeneration('http://localhost:8188');

            expect(result.canProceed).toBe(true);
            expect(result.reason).toContain('check failed');
        });
    });

    describe('formatPreflightSummary', () => {
        it('should format ready status correctly', () => {
            const result = {
                status: 'ready' as const,
                messages: [{ level: 'info' as const, code: 'VRAM_OK' as const, message: 'VRAM OK' }],
                vramStatus: { available: true, freeMB: 20000, totalMB: 24000, utilizationPercent: 17, gpuName: 'RTX 3090' },
                wasDowngraded: false,
                recommendedPreset: 'cinematic' as const,
                availableNodes: ['CLIPTextEncode'],
                missingNodes: [],
                availableEnhancements: [],
                missingEnhancements: [],
            };

            const summary = formatPreflightSummary(result);

            expect(summary).toContain('✅');
            expect(summary).toContain('READY');
            expect(summary).toContain('RTX 3090');
        });

        it('should format blocked status with errors', () => {
            const result = {
                status: 'blocked' as const,
                messages: [
                    { level: 'error' as const, code: 'VRAM_CRITICAL' as const, message: 'VRAM too low' },
                ],
                wasDowngraded: false,
                availableNodes: [],
                missingNodes: ['LoadImage'],
                availableEnhancements: [],
                missingEnhancements: [],
            };

            const summary = formatPreflightSummary(result);

            expect(summary).toContain('❌');
            expect(summary).toContain('BLOCKED');
            expect(summary).toContain('VRAM too low');
        });

        it('should show downgrade information', () => {
            const result = {
                status: 'warning' as const,
                messages: [],
                vramStatus: { available: true, freeMB: 12000, totalMB: 24000, utilizationPercent: 50 },
                wasDowngraded: true,
                originalPreset: 'cinematic' as const,
                recommendedPreset: 'standard' as const,
                availableNodes: [],
                missingNodes: [],
                availableEnhancements: [],
                missingEnhancements: [],
            };

            const summary = formatPreflightSummary(result);

            expect(summary).toContain('downgraded from cinematic');
        });
    });
});
