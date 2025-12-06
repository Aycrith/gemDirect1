/**
 * Unit Tests for Camera Path to ComfyUI Node Mapping Service
 * 
 * Tests for E1.2 - Camera Path → ComfyUI Node Integration
 */

import { describe, it, expect } from 'vitest';
import {
    buildCameraNodeOverrides,
    applyEasing,
    formatAsMotionPathString,
    formatAsPositionArrays,
    formatForComfyUINode,
    validateCameraPathForGeneration,
} from '../cameraPathToComfyNodes';
import type { CameraPath } from '../../types/cameraPath';

// ============================================================================
// Test Data
// ============================================================================

/**
 * Simple left-to-right pan camera path (3 seconds)
 */
const leftToRightPan: CameraPath = {
    id: 'test-pan-left-right',
    description: 'Simple left-to-right pan',
    coordinateSpace: 'screen',
    motionType: 'pan',
    motionIntensity: 0.3,
    keyframes: [
        { timeSeconds: 0, position: { x: 0, y: 0.5 }, label: 'Start - left' },
        { timeSeconds: 3, position: { x: 1, y: 0.5 }, label: 'End - right' },
    ],
};

/**
 * Three-keyframe path with easing
 */
const threeKeyframePath: CameraPath = {
    id: 'test-three-keyframes',
    coordinateSpace: 'screen',
    keyframes: [
        { timeSeconds: 0, position: { x: 0, y: 0.5 } },
        { timeSeconds: 1.5, position: { x: 0.5, y: 0.5 }, easing: 'easeInOut' },
        { timeSeconds: 3, position: { x: 1, y: 0.5 }, easing: 'easeOut' },
    ],
};

/**
 * Static camera (single keyframe)
 */
const staticCamera: CameraPath = {
    id: 'test-static',
    coordinateSpace: 'screen',
    keyframes: [
        { timeSeconds: 0, position: { x: 0.5, y: 0.5 } },
    ],
};

/**
 * Path with FOV changes (zoom)
 */
const zoomPath: CameraPath = {
    id: 'test-zoom',
    coordinateSpace: 'screen',
    motionType: 'zoom',
    keyframes: [
        { timeSeconds: 0, position: { x: 0.5, y: 0.5 }, fovDegrees: 60 },
        { timeSeconds: 2, position: { x: 0.5, y: 0.5 }, fovDegrees: 30 },
    ],
};

/**
 * Path with 3D depth (z coordinate)
 */
const dollyPath: CameraPath = {
    id: 'test-dolly',
    coordinateSpace: 'world',
    motionType: 'dolly',
    keyframes: [
        { timeSeconds: 0, position: { x: 0.5, y: 0.5, z: 0.2 } },
        { timeSeconds: 3, position: { x: 0.5, y: 0.5, z: 0.8 } },
    ],
};

// ============================================================================
// Tests: buildCameraNodeOverrides
// ============================================================================

describe('buildCameraNodeOverrides', () => {
    describe('basic functionality', () => {
        it('should generate correct number of frame overrides', () => {
            const overrides = buildCameraNodeOverrides(leftToRightPan, 49);
            
            expect(overrides.totalFrames).toBe(49);
            expect(overrides.positions.length).toBe(49);
            expect(overrides.cameraPathId).toBe('test-pan-left-right');
        });

        it('should interpolate positions from left to right', () => {
            const overrides = buildCameraNodeOverrides(leftToRightPan, 49);
            
            // First frame should be at x=0
            expect(overrides.positions[0]!.x).toBeCloseTo(0, 3);
            expect(overrides.positions[0]!.y).toBeCloseTo(0.5, 3);
            
            // Last frame should be at x=1
            expect(overrides.positions[48]!.x).toBeCloseTo(1, 3);
            expect(overrides.positions[48]!.y).toBeCloseTo(0.5, 3);
            
            // Middle frame should be approximately at x=0.5
            const midIndex = 24;
            expect(overrides.positions[midIndex]!.x).toBeCloseTo(0.5, 2);
        });

        it('should have monotonically increasing x values for pan', () => {
            const overrides = buildCameraNodeOverrides(leftToRightPan, 49);
            
            for (let i = 1; i < overrides.positions.length; i++) {
                const prev = overrides.positions[i - 1]!;
                const curr = overrides.positions[i]!;
                expect(curr.x).toBeGreaterThanOrEqual(prev.x - 0.001); // Allow tiny rounding
            }
        });

        it('should keep positions in [0, 1] range when clamping enabled', () => {
            const overrides = buildCameraNodeOverrides(leftToRightPan, 49, {
                clampPositions: true,
            });
            
            for (const pos of overrides.positions) {
                expect(pos.x).toBeGreaterThanOrEqual(0);
                expect(pos.x).toBeLessThanOrEqual(1);
                expect(pos.y).toBeGreaterThanOrEqual(0);
                expect(pos.y).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('three keyframe interpolation', () => {
        it('should correctly interpolate through three keyframes', () => {
            const overrides = buildCameraNodeOverrides(threeKeyframePath, 49);
            
            // First frame at x=0
            expect(overrides.positions[0]!.x).toBeCloseTo(0, 3);
            
            // Last frame at x=1
            expect(overrides.positions[48]!.x).toBeCloseTo(1, 3);
            
            // Middle should be approximately at x=0.5
            expect(overrides.positions[24]!.x).toBeCloseTo(0.5, 1);
        });
    });

    describe('static camera', () => {
        it('should return same position for all frames with single keyframe', () => {
            const overrides = buildCameraNodeOverrides(staticCamera, 49);
            
            for (const pos of overrides.positions) {
                expect(pos.x).toBeCloseTo(0.5, 3);
                expect(pos.y).toBeCloseTo(0.5, 3);
            }
        });
    });

    describe('FOV changes', () => {
        it('should interpolate FOV values', () => {
            const overrides = buildCameraNodeOverrides(zoomPath, 49);
            
            expect(overrides.hasFovChanges).toBe(true);
            
            // First frame FOV = 60
            expect(overrides.positions[0]!.fovDegrees).toBeCloseTo(60, 1);
            
            // Last frame FOV = 30
            expect(overrides.positions[48]!.fovDegrees).toBeCloseTo(30, 1);
            
            // Middle frame FOV should be ~45
            expect(overrides.positions[24]!.fovDegrees).toBeCloseTo(45, 1);
        });
    });

    describe('depth (z coordinate)', () => {
        it('should interpolate z values', () => {
            const overrides = buildCameraNodeOverrides(dollyPath, 49);
            
            expect(overrides.hasDepthChanges).toBe(true);
            
            // First frame z = 0.2
            expect(overrides.positions[0]!.z).toBeCloseTo(0.2, 3);
            
            // Last frame z = 0.8
            expect(overrides.positions[48]!.z).toBeCloseTo(0.8, 3);
        });
    });

    describe('edge cases', () => {
        it('should handle empty keyframes', () => {
            const emptyPath: CameraPath = { id: 'empty', keyframes: [] };
            const overrides = buildCameraNodeOverrides(emptyPath, 49);
            
            // Should fill with default positions
            expect(overrides.positions.length).toBe(49);
            expect(overrides.positions[0]!.x).toBeCloseTo(0.5, 3);
            expect(overrides.positions[0]!.y).toBeCloseTo(0.5, 3);
        });

        it('should handle zero duration (all keyframes at t=0)', () => {
            const zeroDuration: CameraPath = {
                id: 'zero-duration',
                keyframes: [
                    { timeSeconds: 0, position: { x: 0.3, y: 0.7 } },
                    { timeSeconds: 0, position: { x: 0.3, y: 0.7 } },
                ],
            };
            const overrides = buildCameraNodeOverrides(zeroDuration, 49);
            
            // Should return same position for all frames (edge case handling)
            expect(overrides.positions.length).toBe(49);
        });

        it('should handle single frame generation', () => {
            const overrides = buildCameraNodeOverrides(leftToRightPan, 1);
            
            expect(overrides.positions.length).toBe(1);
            // Single frame at normalized time 0 should be at start position
            expect(overrides.positions[0]!.x).toBeCloseTo(0, 3);
        });
    });
});

// ============================================================================
// Tests: applyEasing
// ============================================================================

describe('applyEasing', () => {
    it('should return t unchanged for linear easing', () => {
        expect(applyEasing(0, 'linear')).toBe(0);
        expect(applyEasing(0.5, 'linear')).toBe(0.5);
        expect(applyEasing(1, 'linear')).toBe(1);
    });

    it('should apply easeIn (quadratic)', () => {
        expect(applyEasing(0, 'easeIn')).toBe(0);
        expect(applyEasing(0.5, 'easeIn')).toBe(0.25); // 0.5^2
        expect(applyEasing(1, 'easeIn')).toBe(1);
    });

    it('should apply easeOut (inverse quadratic)', () => {
        expect(applyEasing(0, 'easeOut')).toBe(0);
        expect(applyEasing(0.5, 'easeOut')).toBe(0.75); // 0.5 * (2 - 0.5)
        expect(applyEasing(1, 'easeOut')).toBe(1);
    });

    it('should apply easeInOut (smooth)', () => {
        expect(applyEasing(0, 'easeInOut')).toBe(0);
        expect(applyEasing(0.5, 'easeInOut')).toBe(0.5);
        expect(applyEasing(1, 'easeInOut')).toBe(1);
        
        // First half should be slower
        expect(applyEasing(0.25, 'easeInOut')).toBeLessThan(0.25);
        // Second half should be faster
        expect(applyEasing(0.75, 'easeInOut')).toBeGreaterThan(0.75);
    });

    it('should handle undefined easing as linear', () => {
        expect(applyEasing(0.5, undefined)).toBe(0.5);
    });
});

// ============================================================================
// Tests: formatters
// ============================================================================

describe('formatAsMotionPathString', () => {
    it('should format positions as colon-semicolon separated string', () => {
        const overrides = buildCameraNodeOverrides(staticCamera, 3);
        const result = formatAsMotionPathString(overrides);
        
        // Format: "frame:x,y;frame:x,y;..."
        expect(result).toContain('0:');
        expect(result).toContain('1:');
        expect(result).toContain('2:');
        expect(result.split(';').length).toBe(3);
    });
});

describe('formatAsPositionArrays', () => {
    it('should return separate x and y arrays', () => {
        const overrides = buildCameraNodeOverrides(leftToRightPan, 5);
        const arrays = formatAsPositionArrays(overrides);
        
        expect(arrays.x.length).toBe(5);
        expect(arrays.y.length).toBe(5);
        expect(arrays.x[0]).toBeCloseTo(0, 2);
        expect(arrays.x[4]).toBeCloseTo(1, 2);
    });

    it('should include z array when depth changes present', () => {
        const overrides = buildCameraNodeOverrides(dollyPath, 5);
        const arrays = formatAsPositionArrays(overrides);
        
        expect(arrays.z).toBeDefined();
        expect(arrays.z!.length).toBe(5);
    });

    it('should include fov array when FOV changes present', () => {
        const overrides = buildCameraNodeOverrides(zoomPath, 5);
        const arrays = formatAsPositionArrays(overrides);
        
        expect(arrays.fov).toBeDefined();
        expect(arrays.fov!.length).toBe(5);
    });
});

describe('formatForComfyUINode', () => {
    it('should format for generic node type', () => {
        const overrides = buildCameraNodeOverrides(leftToRightPan, 5);
        const inputs = formatForComfyUINode(overrides, 'generic');
        
        expect(inputs.length).toBe(2); // positions_x and positions_y
        expect(inputs.find(i => i.inputKey === 'positions_x')).toBeDefined();
        expect(inputs.find(i => i.inputKey === 'positions_y')).toBeDefined();
    });

    it('should format for MotionCtrl node type', () => {
        const overrides = buildCameraNodeOverrides(leftToRightPan, 5);
        const inputs = formatForComfyUINode(overrides, 'MotionCtrl');
        
        expect(inputs.length).toBe(2);
        expect(inputs.find(i => i.inputKey === 'motion_x')).toBeDefined();
        expect(inputs.find(i => i.inputKey === 'motion_y')).toBeDefined();
    });

    it('should format for CameraPath node type', () => {
        const overrides = buildCameraNodeOverrides(leftToRightPan, 5);
        const inputs = formatForComfyUINode(overrides, 'CameraPath');
        
        expect(inputs.length).toBe(1);
        expect(inputs[0]!.inputKey).toBe('camera_path');
        expect(typeof inputs[0]!.value).toBe('string');
    });
});

// ============================================================================
// Tests: validateCameraPathForGeneration
// ============================================================================

describe('validateCameraPathForGeneration', () => {
    it('should validate a valid camera path', () => {
        const result = validateCameraPathForGeneration(leftToRightPan, 49);
        
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
    });

    it('should fail for undefined camera path', () => {
        const result = validateCameraPathForGeneration(undefined, 49);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('No camera path provided');
    });

    it('should fail for empty keyframes', () => {
        const emptyPath: CameraPath = { id: 'empty', keyframes: [] };
        const result = validateCameraPathForGeneration(emptyPath, 49);
        
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Camera path has no keyframes');
    });

    it('should warn for single keyframe', () => {
        const result = validateCameraPathForGeneration(staticCamera, 49);
        
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Camera path has only one keyframe - camera will be static');
    });

    it('should fail for out-of-order keyframes', () => {
        const outOfOrder: CameraPath = {
            id: 'out-of-order',
            keyframes: [
                { timeSeconds: 2, position: { x: 0.5, y: 0.5 } },
                { timeSeconds: 1, position: { x: 0.5, y: 0.5 } },
            ],
        };
        const result = validateCameraPathForGeneration(outOfOrder, 49);
        
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('less than previous'))).toBe(true);
    });

    it('should warn for implied low FPS', () => {
        // 10 frames over 10 seconds = 1 fps
        const longPath: CameraPath = {
            id: 'long',
            keyframes: [
                { timeSeconds: 0, position: { x: 0, y: 0.5 } },
                { timeSeconds: 10, position: { x: 1, y: 0.5 } },
            ],
        };
        const result = validateCameraPathForGeneration(longPath, 10);
        
        expect(result.warnings.some(w => w.includes('very low fps'))).toBe(true);
    });

    it('should warn for implied high FPS', () => {
        // 1000 frames over 1 second = 1000 fps
        const shortPath: CameraPath = {
            id: 'short',
            keyframes: [
                { timeSeconds: 0, position: { x: 0, y: 0.5 } },
                { timeSeconds: 1, position: { x: 1, y: 0.5 } },
            ],
        };
        const result = validateCameraPathForGeneration(shortPath, 1000);
        
        expect(result.warnings.some(w => w.includes('very high fps'))).toBe(true);
    });
});
