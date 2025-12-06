/**
 * Tests for Replay UI Service
 * 
 * @module services/replayUiService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
    replayFromManifestForUi,
    getReplayPreview,
    getOriginalVideoPath,
    isManifestValidForReplay,
    createInitialReplayState,
    type ReplayUiRequest,
} from './replayUiService';
import * as manifestReplayService from './manifestReplayService';
import type { ReplayPlan, ReplayResult } from './manifestReplayService';
import type { GenerationManifest } from './generationManifestService';
import { DEFAULT_FEATURE_FLAGS } from '../utils/featureFlags';

// Mock the manifestReplayService
vi.mock('./manifestReplayService', () => ({
    loadReplayPlan: vi.fn(),
    executeReplay: vi.fn(),
    readManifestFile: vi.fn(),
}));

describe('replayUiService', () => {
    // Create a mock manifest
    const createMockManifest = (overrides: Partial<GenerationManifest> = {}): GenerationManifest => ({
        manifestVersion: '1.0.0' as const,
        manifestId: 'test-manifest-123',
        generationType: 'video' as const,
        sceneId: 'scene-1',
        shotId: 'shot-1',
        videoProvider: 'comfyui-local',
        comfyUIUrl: 'http://localhost:8188',
        workflow: {
            profileId: 'wan-i2v',
            label: 'WAN I2V',
            category: 'video',
            syncedAt: Date.now(),
        },
        inputs: {
            prompt: 'A test scene',
        },
        outputs: {
            videoPath: '/path/to/original/video.mp4',
        },
        determinism: {
            seed: 12345,
            seedExplicit: true,
        },
        timing: {
            queuedAt: new Date().toISOString(),
        },
        ...overrides,
    });

    // Create a mock replay plan
    const createMockReplayPlan = (manifest: GenerationManifest): ReplayPlan => ({
        manifest,
        workflowProfile: {
            id: 'wan-i2v',
            label: 'WAN I2V',
            workflowJson: '{}',
            mapping: {},
            category: 'video',
        },
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
        stabilityProfileId: 'standard',
        seed: manifest.determinism.seed,
        prompt: manifest.inputs.prompt,
        warnings: [],
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('replayFromManifestForUi', () => {
        it('should return success result when replay succeeds', async () => {
            const mockManifest = createMockManifest();
            const mockPlan = createMockReplayPlan(mockManifest);
            const mockReplayResult: ReplayResult = {
                outputVideoPath: '/path/to/replayed/video.mp4',
                dryRun: false,
                durationMs: 5000,
                warnings: [],
            };

            (manifestReplayService.loadReplayPlan as Mock).mockResolvedValue(mockPlan);
            (manifestReplayService.executeReplay as Mock).mockResolvedValue(mockReplayResult);

            const request: ReplayUiRequest = {
                manifestPath: '/path/to/manifest.json',
            };

            const result = await replayFromManifestForUi(request);

            expect(result.success).toBe(true);
            expect(result.manifestPath).toBe('/path/to/manifest.json');
            expect(result.originalVideoPath).toBe('/path/to/original/video.mp4');
            expect(result.replayedVideoPath).toBe('/path/to/replayed/video.mp4');
            expect(result.durationMs).toBe(5000);
            expect(result.plan).toBeDefined();
        });

        it('should include warnings from replay result', async () => {
            const mockManifest = createMockManifest();
            const mockPlan = createMockReplayPlan(mockManifest);
            mockPlan.warnings = ['Plan warning'];
            const mockReplayResult: ReplayResult = {
                outputVideoPath: '/path/to/replayed/video.mp4',
                dryRun: false,
                warnings: ['Execution warning'],
            };

            (manifestReplayService.loadReplayPlan as Mock).mockResolvedValue(mockPlan);
            (manifestReplayService.executeReplay as Mock).mockResolvedValue(mockReplayResult);

            const result = await replayFromManifestForUi({
                manifestPath: '/path/to/manifest.json',
            });

            expect(result.success).toBe(true);
            expect(result.warnings).toContain('Execution warning');
        });

        it('should return failure result when loadReplayPlan throws', async () => {
            (manifestReplayService.loadReplayPlan as Mock).mockRejectedValue(
                new Error('Manifest not found')
            );

            const result = await replayFromManifestForUi({
                manifestPath: '/invalid/path.json',
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Manifest not found');
            expect(result.replayedVideoPath).toBeUndefined();
        });

        it('should return failure result when executeReplay throws', async () => {
            const mockManifest = createMockManifest();
            const mockPlan = createMockReplayPlan(mockManifest);

            (manifestReplayService.loadReplayPlan as Mock).mockResolvedValue(mockPlan);
            (manifestReplayService.executeReplay as Mock).mockRejectedValue(
                new Error('Generation failed')
            );

            const result = await replayFromManifestForUi({
                manifestPath: '/path/to/manifest.json',
            });

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Generation failed');
        });

        it('should pass outputDirOverride to executeReplay', async () => {
            const mockManifest = createMockManifest();
            const mockPlan = createMockReplayPlan(mockManifest);
            const mockReplayResult: ReplayResult = {
                outputVideoPath: '/custom/output/video.mp4',
                dryRun: false,
                warnings: [],
            };

            (manifestReplayService.loadReplayPlan as Mock).mockResolvedValue(mockPlan);
            (manifestReplayService.executeReplay as Mock).mockResolvedValue(mockReplayResult);

            await replayFromManifestForUi({
                manifestPath: '/path/to/manifest.json',
                outputDirOverride: '/custom/output',
            });

            expect(manifestReplayService.executeReplay).toHaveBeenCalledWith(
                mockPlan,
                { dryRun: false, outputDir: '/custom/output' }
            );
        });
    });

    describe('getReplayPreview', () => {
        it('should return preview without executing replay', async () => {
            const mockManifest = createMockManifest();
            const mockPlan = createMockReplayPlan(mockManifest);

            (manifestReplayService.loadReplayPlan as Mock).mockResolvedValue(mockPlan);

            const result = await getReplayPreview('/path/to/manifest.json');

            expect(result.success).toBe(true);
            expect(result.originalVideoPath).toBe('/path/to/original/video.mp4');
            expect(result.replayedVideoPath).toBeUndefined();
            expect(result.plan).toBeDefined();
            expect(manifestReplayService.executeReplay).not.toHaveBeenCalled();
        });

        it('should include plan warnings in preview', async () => {
            const mockManifest = createMockManifest();
            const mockPlan = createMockReplayPlan(mockManifest);
            mockPlan.warnings = ['Workflow version mismatch'];

            (manifestReplayService.loadReplayPlan as Mock).mockResolvedValue(mockPlan);

            const result = await getReplayPreview('/path/to/manifest.json');

            expect(result.success).toBe(true);
            expect(result.warnings).toContain('Workflow version mismatch');
        });

        it('should return failure result when loadReplayPlan throws', async () => {
            (manifestReplayService.loadReplayPlan as Mock).mockRejectedValue(
                new Error('Invalid manifest format')
            );

            const result = await getReplayPreview('/invalid/manifest.json');

            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Invalid manifest format');
        });
    });

    describe('getOriginalVideoPath', () => {
        it('should return video path from manifest', () => {
            const mockManifest = createMockManifest();
            (manifestReplayService.readManifestFile as Mock).mockReturnValue(mockManifest);

            const result = getOriginalVideoPath('/path/to/manifest.json');

            expect(result).toBe('/path/to/original/video.mp4');
        });

        it('should return undefined when video path not in manifest', () => {
            const mockManifest = createMockManifest({
                outputs: {},
            });
            (manifestReplayService.readManifestFile as Mock).mockReturnValue(mockManifest);

            const result = getOriginalVideoPath('/path/to/manifest.json');

            expect(result).toBeUndefined();
        });

        it('should return undefined when readManifestFile throws', () => {
            (manifestReplayService.readManifestFile as Mock).mockImplementation(() => {
                throw new Error('File not found');
            });

            const result = getOriginalVideoPath('/invalid/path.json');

            expect(result).toBeUndefined();
        });
    });

    describe('isManifestValidForReplay', () => {
        it('should return true for valid manifest', () => {
            const mockManifest = createMockManifest();
            (manifestReplayService.readManifestFile as Mock).mockReturnValue(mockManifest);

            const result = isManifestValidForReplay('/path/to/manifest.json');

            expect(result).toBe(true);
        });

        it('should return false when manifest cannot be read', () => {
            (manifestReplayService.readManifestFile as Mock).mockImplementation(() => {
                throw new Error('Invalid JSON');
            });

            const result = isManifestValidForReplay('/invalid/manifest.json');

            expect(result).toBe(false);
        });
    });

    describe('createInitialReplayState', () => {
        it('should return state with idle status', () => {
            const state = createInitialReplayState();

            expect(state.status).toBe('idle');
            expect(state.manifestPath).toBeUndefined();
            expect(state.result).toBeUndefined();
        });
    });
});
