/**
 * Unit Tests for Video Quality Benchmark (E3 - Camera Path Aware)
 * 
 * Tests the pure helper functions for camera path interpolation and
 * motion coherence metric calculations.
 * 
 * Does NOT test video I/O (no ffmpeg calls in tests).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for fs module
const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
}));

// Mock fs module
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: fsMocks.existsSync,
        readFileSync: fsMocks.readFileSync,
        readdirSync: fsMocks.readdirSync,
        default: { 
            ...actual, 
            existsSync: fsMocks.existsSync, 
            readFileSync: fsMocks.readFileSync,
            readdirSync: fsMocks.readdirSync,
        }
    };
});

import {
    loadManifestContext,
    findManifestForVideo,
    interpolateCameraPosition,
    computeObservedPositions,
    computeCameraPathMetrics,
    type ObservedPosition,
    type FrameMetrics,
} from '../video-quality-benchmark';
import type { CameraPath, CameraKeyframe } from '../../../types/cameraPath';

// ============================================================================
// Test Fixtures
// ============================================================================

const createSimpleCameraPath = (keyframes: CameraKeyframe[]): CameraPath => ({
    id: 'test-camera-path',
    description: 'Test camera path for unit tests',
    coordinateSpace: 'screen',
    keyframes,
});

const createFrameMetrics = (overrides: Partial<FrameMetrics>[]): FrameMetrics[] =>
    overrides.map((o, i) => ({
        frameIndex: o.frameIndex ?? i,
        timestamp: o.timestamp ?? i * 0.04,
        yAvg: o.yAvg ?? 128,
        yVar: o.yVar ?? 100,
        uAvg: o.uAvg ?? 128,
        vAvg: o.vAvg ?? 128,
    }));

// ============================================================================
// Tests: interpolateCameraPosition
// ============================================================================

describe('interpolateCameraPosition', () => {
    it('returns position from single keyframe at any time', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0.5, y: 0.5 } },
        ]);

        const pos0 = interpolateCameraPosition(path, 0);
        const pos50 = interpolateCameraPosition(path, 0.5);
        const pos100 = interpolateCameraPosition(path, 1);

        expect(pos0).toEqual({ x: 0.5, y: 0.5 });
        expect(pos50).toEqual({ x: 0.5, y: 0.5 });
        expect(pos100).toEqual({ x: 0.5, y: 0.5 });
    });

    it('interpolates linearly between two keyframes', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 2, position: { x: 1, y: 1 } },
        ]);

        const pos0 = interpolateCameraPosition(path, 0);
        const pos50 = interpolateCameraPosition(path, 0.5);
        const pos100 = interpolateCameraPosition(path, 1);

        expect(pos0).toEqual({ x: 0, y: 0 });
        expect(pos50).toEqual({ x: 0.5, y: 0.5 });
        expect(pos100).toEqual({ x: 1, y: 1 });
    });

    it('interpolates correctly with three keyframes', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 1, position: { x: 1, y: 0 } },
            { timeSeconds: 2, position: { x: 1, y: 1 } },
        ]);

        // At t=0 (normalized 0)
        const pos0 = interpolateCameraPosition(path, 0);
        expect(pos0).toEqual({ x: 0, y: 0 });

        // At t=1 (normalized 0.5)
        const pos50 = interpolateCameraPosition(path, 0.5);
        expect(pos50).toEqual({ x: 1, y: 0 });

        // At t=2 (normalized 1)
        const pos100 = interpolateCameraPosition(path, 1);
        expect(pos100).toEqual({ x: 1, y: 1 });

        // At t=0.5 (normalized 0.25) - midway between first two keyframes
        const pos25 = interpolateCameraPosition(path, 0.25);
        expect(pos25).toEqual({ x: 0.5, y: 0 });
    });

    it('returns null for empty keyframes', () => {
        const path = createSimpleCameraPath([]);
        const pos = interpolateCameraPosition(path, 0.5);
        expect(pos).toBeNull();
    });

    it('handles keyframe without position using default', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0 },
            { timeSeconds: 1, position: { x: 1, y: 1 } },
        ]);

        // First keyframe has no position, should use default (0.5, 0.5)
        const pos0 = interpolateCameraPosition(path, 0);
        expect(pos0).toEqual({ x: 0.5, y: 0.5 });

        // At midpoint, interpolates between default and (1,1)
        const pos50 = interpolateCameraPosition(path, 0.5);
        expect(pos50).toEqual({ x: 0.75, y: 0.75 });
    });
});

// ============================================================================
// Tests: computeObservedPositions
// ============================================================================

describe('computeObservedPositions', () => {
    it('computes positions from frame metrics', () => {
        const frames = createFrameMetrics([
            { frameIndex: 0, yAvg: 100, uAvg: 100, vAvg: 100 },
            { frameIndex: 10, yAvg: 150, uAvg: 150, vAvg: 100 },
            { frameIndex: 20, yAvg: 200, uAvg: 100, vAvg: 150 },
        ]);

        const positions = computeObservedPositions(frames);

        expect(positions).toHaveLength(3);
        expect(positions[0]?.frameIndex).toBe(0);
        expect(positions[1]?.frameIndex).toBe(10);
        expect(positions[2]?.frameIndex).toBe(20);

        // All positions should be in valid range [0, 1]
        for (const pos of positions) {
            expect(pos.x).toBeGreaterThanOrEqual(0);
            expect(pos.x).toBeLessThanOrEqual(1);
            expect(pos.y).toBeGreaterThanOrEqual(0);
            expect(pos.y).toBeLessThanOrEqual(1);
        }
    });

    it('returns empty array for empty input', () => {
        const positions = computeObservedPositions([]);
        expect(positions).toHaveLength(0);
    });
});

// ============================================================================
// Tests: computeCameraPathMetrics
// ============================================================================

describe('computeCameraPathMetrics', () => {
    it('returns hasCameraPath false when no camera path', () => {
        const positions: ObservedPosition[] = [
            { frameIndex: 0, x: 0.5, y: 0.5 },
            { frameIndex: 10, x: 0.5, y: 0.5 },
        ];

        const metrics = computeCameraPathMetrics(positions, undefined, 20);

        expect(metrics.hasCameraPath).toBe(false);
        expect(metrics.pathAdherenceMeanError).toBeUndefined();
    });

    it('returns hasCameraPath false with insufficient positions', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 1, position: { x: 1, y: 1 } },
        ]);

        const metrics = computeCameraPathMetrics([{ frameIndex: 0, x: 0.5, y: 0.5 }], path, 20);

        expect(metrics.hasCameraPath).toBe(false);
    });

    it('computes zero error when positions match path exactly', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 1, position: { x: 1, y: 1 } },
        ]);

        const positions: ObservedPosition[] = [
            { frameIndex: 0, x: 0, y: 0 },
            { frameIndex: 10, x: 0.5, y: 0.5 },
            { frameIndex: 20, x: 1, y: 1 },
        ];

        const metrics = computeCameraPathMetrics(positions, path, 21);

        expect(metrics.hasCameraPath).toBe(true);
        expect(metrics.pathAdherenceMeanError).toBe(0);
        expect(metrics.pathAdherenceMaxError).toBe(0);
    });

    it('computes non-zero error when positions deviate', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 1, position: { x: 1, y: 0 } },
        ]);

        const positions: ObservedPosition[] = [
            { frameIndex: 0, x: 0, y: 0.1 }, // Off by 0.1 in y
            { frameIndex: 10, x: 0.5, y: 0.1 }, // Off by 0.1 in y
            { frameIndex: 20, x: 1, y: 0.1 }, // Off by 0.1 in y
        ];

        const metrics = computeCameraPathMetrics(positions, path, 21);

        expect(metrics.hasCameraPath).toBe(true);
        expect(metrics.pathAdherenceMeanError).toBeCloseTo(0.1, 3);
        expect(metrics.pathAdherenceMaxError).toBeCloseTo(0.1, 3);
    });

    it('computes direction consistency for aligned motion', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 1, position: { x: 1, y: 0 } },
        ]);

        // Observed motion goes in same direction (positive x)
        const positions: ObservedPosition[] = [
            { frameIndex: 0, x: 0, y: 0 },
            { frameIndex: 10, x: 0.3, y: 0 },
            { frameIndex: 20, x: 0.6, y: 0 },
            { frameIndex: 30, x: 1, y: 0 },
        ];

        const metrics = computeCameraPathMetrics(positions, path, 31);

        expect(metrics.hasCameraPath).toBe(true);
        // Direction consistency should be high (close to 1.0)
        expect(metrics.pathDirectionConsistency).toBeGreaterThan(0.9);
    });

    it('computes direction consistency for opposite motion', () => {
        const path = createSimpleCameraPath([
            { timeSeconds: 0, position: { x: 0, y: 0 } },
            { timeSeconds: 1, position: { x: 1, y: 0 } },
        ]);

        // Observed motion goes in opposite direction (negative x)
        const positions: ObservedPosition[] = [
            { frameIndex: 0, x: 1, y: 0 },
            { frameIndex: 10, x: 0.7, y: 0 },
            { frameIndex: 20, x: 0.3, y: 0 },
            { frameIndex: 30, x: 0, y: 0 },
        ];

        const metrics = computeCameraPathMetrics(positions, path, 31);

        expect(metrics.hasCameraPath).toBe(true);
        // Direction consistency should be low (close to 0.0)
        expect(metrics.pathDirectionConsistency).toBeLessThan(0.1);
    });
});

// ============================================================================
// Tests: loadManifestContext
// ============================================================================

describe('loadManifestContext', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns null for non-existent file', () => {
        fsMocks.existsSync.mockReturnValue(false);
        
        const result = loadManifestContext('/path/to/missing.json');
        
        expect(result).toBeNull();
    });

    it('extracts camera path context from manifest', () => {
        const manifest = {
            manifestVersion: '1.0.0',
            cameraPathId: 'slow-zoom',
            cameraPathSummary: {
                id: 'slow-zoom',
                keyframeCount: 3,
                durationSeconds: 2.5,
                coordinateSpace: 'screen',
            },
            temporalRegularizationApplied: true,
            temporalRegularizationSettings: {
                strength: 0.35,
                windowFrames: 3,
            },
        };

        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue(JSON.stringify(manifest));

        const result = loadManifestContext('/path/to/manifest.json');

        expect(result).not.toBeNull();
        expect(result?.cameraPathId).toBe('slow-zoom');
        expect(result?.cameraPathSummary?.keyframeCount).toBe(3);
        expect(result?.temporalRegularizationApplied).toBe(true);
        expect(result?.temporalRegularizationStrength).toBe(0.35);
    });

    it('handles malformed JSON gracefully', () => {
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue('not valid json');

        const result = loadManifestContext('/path/to/bad.json');

        expect(result).toBeNull();
    });

    it('handles manifest without camera path fields', () => {
        const manifest = {
            manifestVersion: '1.0.0',
            generationType: 'video',
        };

        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readFileSync.mockReturnValue(JSON.stringify(manifest));

        const result = loadManifestContext('/path/to/manifest.json');

        expect(result).not.toBeNull();
        expect(result?.cameraPathId).toBeUndefined();
        expect(result?.temporalRegularizationApplied).toBeUndefined();
    });
});

// ============================================================================
// Tests: findManifestForVideo
// ============================================================================

describe('findManifestForVideo', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns null when manifest directory does not exist', () => {
        fsMocks.existsSync.mockReturnValue(false);

        const result = findManifestForVideo('/path/to/video.mp4', 'sample-001');

        expect(result).toBeNull();
    });

    it('finds manifest matching sample ID', () => {
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readdirSync.mockReturnValue([
            'sample-001-manifest.json',
            'sample-002-manifest.json',
            'other.txt',
        ]);

        const result = findManifestForVideo('/path/to/video.mp4', 'sample-001', '/manifests');

        expect(result).toContain('sample-001-manifest.json');
    });

    it('finds manifest matching video filename', () => {
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readdirSync.mockReturnValue([
            'myvideo-manifest.json',
            'other.json',
        ]);

        const result = findManifestForVideo('/path/to/myvideo.mp4', 'sample-999', '/manifests');

        expect(result).toContain('myvideo-manifest.json');
    });

    it('returns null when no matching manifest found', () => {
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.readdirSync.mockReturnValue([
            'unrelated-manifest.json',
            'other.txt',
        ]);

        const result = findManifestForVideo('/path/to/video.mp4', 'sample-001', '/manifests');

        expect(result).toBeNull();
    });
});
