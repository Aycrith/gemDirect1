/**
 * Camera Path to ComfyUI Node Mapping Service
 * 
 * Converts camera path definitions into ComfyUI node overrides for
 * camera/motion control. Part of E1.2 - Camera Path → ComfyUI Node Integration.
 * 
 * This service takes a CameraPath (sequence of keyframes with positions)
 * and generates per-frame position overrides that can be injected into
 * ComfyUI workflows that support camera/motion control nodes.
 * 
 * Currently supports:
 * - Basic 2D pan/tilt motion via position overrides
 * - Linear and eased interpolation between keyframes
 * - Screen-space coordinate output (normalized 0-1)
 * 
 * Future extensions:
 * - 3D camera control (dolly, zoom via FOV)
 * - Rotation support (yaw, pitch, roll)
 * - Integration with specific ComfyUI camera control nodes
 * 
 * @module services/cameraPathToComfyNodes
 */

import type { CameraPath, CameraKeyframe, CameraEasing, Position3D } from '../types/cameraPath';

// ============================================================================
// Types
// ============================================================================

/**
 * A single frame's camera position override
 */
export interface CameraFrameOverride {
    /** Frame index (0-based) */
    frameIndex: number;
    /** Normalized x position (0-1, where 0 is left edge) */
    x: number;
    /** Normalized y position (0-1, where 0 is top edge) */
    y: number;
    /** Optional z depth (normalized, for 3D camera control) */
    z?: number;
    /** Optional FOV override in degrees */
    fovDegrees?: number;
}

/**
 * Complete set of camera overrides for a video generation
 */
export interface CameraNodeOverrides {
    /** Per-frame position overrides */
    positions: CameraFrameOverride[];
    /** Total number of frames */
    totalFrames: number;
    /** Source camera path ID */
    cameraPathId: string;
    /** Coordinate space used */
    coordinateSpace: 'screen' | 'world' | 'relative';
    /** Motion type hint */
    motionType?: string;
    /** Whether overrides include FOV changes */
    hasFovChanges: boolean;
    /** Whether overrides include z-depth changes */
    hasDepthChanges: boolean;
}

/**
 * Configuration for camera override generation
 */
export interface CameraOverrideConfig {
    /** Target frame rate (used to compute frame indices from time) */
    fps?: number;
    /** Whether to apply easing functions from keyframes */
    applyEasing?: boolean;
    /** Clamp positions to [0, 1] range */
    clampPositions?: boolean;
    /** Default position when keyframe doesn't specify one */
    defaultPosition?: Position3D;
}

const DEFAULT_CONFIG: Required<CameraOverrideConfig> = {
    fps: 16, // Common WAN video fps
    applyEasing: true,
    clampPositions: true,
    defaultPosition: { x: 0.5, y: 0.5 },
};

// ============================================================================
// Easing Functions
// ============================================================================

/**
 * Apply easing function to interpolation parameter t (0-1)
 */
export function applyEasing(t: number, easing: CameraEasing = 'linear'): number {
    switch (easing) {
        case 'linear':
            return t;
        case 'easeIn':
            // Quadratic ease in
            return t * t;
        case 'easeOut':
            // Quadratic ease out
            return t * (2 - t);
        case 'easeInOut':
            // Quadratic ease in-out
            return t < 0.5 
                ? 2 * t * t 
                : -1 + (4 - 2 * t) * t;
        default:
            return t;
    }
}

// ============================================================================
// Interpolation Helpers
// ============================================================================

/**
 * Find the surrounding keyframes for a given time
 */
function findSurroundingKeyframes(
    keyframes: CameraKeyframe[],
    timeSeconds: number
): { prev: CameraKeyframe; next: CameraKeyframe; t: number } | null {
    if (keyframes.length === 0) {
        return null;
    }

    if (keyframes.length === 1) {
        const kf = keyframes[0]!;
        return { prev: kf, next: kf, t: 0 };
    }

    // Find prev and next keyframes
    let prevKf: CameraKeyframe | null = null;
    let nextKf: CameraKeyframe | null = null;

    for (const kf of keyframes) {
        if (kf.timeSeconds <= timeSeconds) {
            prevKf = kf;
        }
        if (kf.timeSeconds >= timeSeconds && !nextKf) {
            nextKf = kf;
        }
    }

    // Handle edge cases
    if (!prevKf) {
        prevKf = keyframes[0]!;
    }
    if (!nextKf) {
        nextKf = keyframes[keyframes.length - 1]!;
    }

    // Same keyframe
    if (prevKf.timeSeconds === nextKf.timeSeconds) {
        return { prev: prevKf, next: nextKf, t: 0 };
    }

    // Compute interpolation parameter
    const duration = nextKf.timeSeconds - prevKf.timeSeconds;
    const t = (timeSeconds - prevKf.timeSeconds) / duration;

    return { prev: prevKf, next: nextKf, t: Math.max(0, Math.min(1, t)) };
}

/**
 * Interpolate position between two keyframes
 */
function interpolatePosition(
    prev: CameraKeyframe,
    next: CameraKeyframe,
    t: number,
    applyEasingFunc: boolean,
    defaultPos: Position3D
): Position3D {
    const prevPos = prev.position || defaultPos;
    const nextPos = next.position || defaultPos;

    // Apply easing from the next keyframe (easing describes transition TO that keyframe)
    const easedT = applyEasingFunc ? applyEasing(t, next.easing) : t;

    return {
        x: prevPos.x + easedT * (nextPos.x - prevPos.x),
        y: prevPos.y + easedT * (nextPos.y - prevPos.y),
        z: (prevPos.z !== undefined && nextPos.z !== undefined)
            ? prevPos.z + easedT * (nextPos.z - prevPos.z)
            : undefined,
    };
}

/**
 * Interpolate FOV between two keyframes
 */
function interpolateFov(
    prev: CameraKeyframe,
    next: CameraKeyframe,
    t: number,
    applyEasingFunc: boolean
): number | undefined {
    if (prev.fovDegrees === undefined && next.fovDegrees === undefined) {
        return undefined;
    }

    const prevFov = prev.fovDegrees ?? 50; // Default FOV
    const nextFov = next.fovDegrees ?? 50;

    const easedT = applyEasingFunc ? applyEasing(t, next.easing) : t;
    return prevFov + easedT * (nextFov - prevFov);
}

// ============================================================================
// Main Export: Build Camera Node Overrides
// ============================================================================

/**
 * Build per-frame camera node overrides from a camera path.
 * 
 * @param cameraPath - The camera path definition with keyframes
 * @param totalFrames - Total number of frames in the video
 * @param config - Optional configuration for override generation
 * @returns Camera node overrides for each frame
 * 
 * @example
 * ```ts
 * const cameraPath: CameraPath = {
 *   id: 'pan-left-to-right',
 *   coordinateSpace: 'screen',
 *   keyframes: [
 *     { timeSeconds: 0, position: { x: 0, y: 0.5 } },
 *     { timeSeconds: 3, position: { x: 1, y: 0.5 }, easing: 'easeInOut' }
 *   ]
 * };
 * 
 * const overrides = buildCameraNodeOverrides(cameraPath, 49, { fps: 16 });
 * // Returns 49 frame overrides with positions from x=0 to x=1
 * ```
 */
export function buildCameraNodeOverrides(
    cameraPath: CameraPath,
    totalFrames: number,
    config?: CameraOverrideConfig
): CameraNodeOverrides {
    const cfg: Required<CameraOverrideConfig> = {
        ...DEFAULT_CONFIG,
        ...config,
    };

    const keyframes = cameraPath.keyframes || [];
    const positions: CameraFrameOverride[] = [];
    let hasFovChanges = false;
    let hasDepthChanges = false;

    // Get total duration from keyframes
    const maxTime = keyframes.length > 0
        ? Math.max(...keyframes.map(kf => kf.timeSeconds))
        : 0;

    // Handle edge case: no keyframes or zero duration
    if (keyframes.length === 0 || maxTime === 0) {
        // Fill with default positions
        for (let i = 0; i < totalFrames; i++) {
            positions.push({
                frameIndex: i,
                x: cfg.defaultPosition.x,
                y: cfg.defaultPosition.y,
                z: cfg.defaultPosition.z,
            });
        }
        return {
            positions,
            totalFrames,
            cameraPathId: cameraPath.id,
            coordinateSpace: cameraPath.coordinateSpace || 'screen',
            motionType: cameraPath.motionType,
            hasFovChanges: false,
            hasDepthChanges: false,
        };
    }

    // Check for FOV changes
    const hasFov = keyframes.some(kf => kf.fovDegrees !== undefined);

    // Generate per-frame overrides
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        // Convert frame index to time (handle single frame case)
        const timeSeconds = totalFrames <= 1
            ? 0
            : (frameIndex / (totalFrames - 1)) * maxTime;

        // Find surrounding keyframes and interpolation parameter
        const surrounding = findSurroundingKeyframes(keyframes, timeSeconds);
        
        if (!surrounding) {
            // Fallback to default position
            positions.push({
                frameIndex,
                x: cfg.defaultPosition.x,
                y: cfg.defaultPosition.y,
            });
            continue;
        }

        const { prev, next, t } = surrounding;

        // Interpolate position
        const pos = interpolatePosition(prev, next, t, cfg.applyEasing, cfg.defaultPosition);

        // Clamp if configured
        let x = pos.x;
        let y = pos.y;
        let z = pos.z;

        if (cfg.clampPositions) {
            x = Math.max(0, Math.min(1, x));
            y = Math.max(0, Math.min(1, y));
            if (z !== undefined) {
                z = Math.max(0, Math.min(1, z));
            }
        }

        // Interpolate FOV if present
        const fov = hasFov 
            ? interpolateFov(prev, next, t, cfg.applyEasing) 
            : undefined;

        if (fov !== undefined) {
            hasFovChanges = true;
        }
        if (z !== undefined) {
            hasDepthChanges = true;
        }

        positions.push({
            frameIndex,
            x,
            y,
            z,
            fovDegrees: fov,
        });
    }

    return {
        positions,
        totalFrames,
        cameraPathId: cameraPath.id,
        coordinateSpace: cameraPath.coordinateSpace || 'screen',
        motionType: cameraPath.motionType,
        hasFovChanges,
        hasDepthChanges,
    };
}

// ============================================================================
// ComfyUI-Specific Formatters
// ============================================================================

/**
 * Format camera overrides for ComfyUI camera control nodes.
 * 
 * Different ComfyUI nodes expect different input formats:
 * - Some accept per-frame position arrays
 * - Some accept motion vector strings
 * - Some accept transform matrices
 * 
 * This function produces a generic format that can be adapted
 * to specific node requirements.
 */
export interface ComfyUIMotionInput {
    /** Node input key (e.g., 'motion_path', 'camera_positions') */
    inputKey: string;
    /** Value to inject (format depends on target node) */
    value: unknown;
}

/**
 * Format overrides as a motion path string.
 * Format: "frame:x,y;frame:x,y;..."
 * 
 * Used by some motion control nodes that accept string paths.
 */
export function formatAsMotionPathString(overrides: CameraNodeOverrides): string {
    return overrides.positions
        .map(p => `${p.frameIndex}:${p.x.toFixed(3)},${p.y.toFixed(3)}`)
        .join(';');
}

/**
 * Format overrides as position arrays for batch injection.
 * Returns separate x, y, z arrays that can be used as node inputs.
 */
export function formatAsPositionArrays(overrides: CameraNodeOverrides): {
    x: number[];
    y: number[];
    z?: number[];
    fov?: number[];
} {
    const x = overrides.positions.map(p => p.x);
    const y = overrides.positions.map(p => p.y);
    
    const hasZ = overrides.hasDepthChanges;
    const hasFov = overrides.hasFovChanges;

    return {
        x,
        y,
        z: hasZ ? overrides.positions.map(p => p.z ?? 0.5) : undefined,
        fov: hasFov ? overrides.positions.map(p => p.fovDegrees ?? 50) : undefined,
    };
}

/**
 * Format overrides for a specific ComfyUI node type.
 * 
 * @param overrides - Camera node overrides
 * @param nodeType - Target ComfyUI node type
 * @returns Array of node inputs to inject
 * 
 * Supported node types:
 * - 'MotionCtrl': Motion control node with position arrays
 * - 'CameraPath': Camera path node with motion string
 * - 'generic': Generic format with position arrays
 */
export function formatForComfyUINode(
    overrides: CameraNodeOverrides,
    nodeType: 'MotionCtrl' | 'CameraPath' | 'generic' = 'generic'
): ComfyUIMotionInput[] {
    switch (nodeType) {
        case 'MotionCtrl': {
            const arrays = formatAsPositionArrays(overrides);
            return [
                { inputKey: 'motion_x', value: arrays.x },
                { inputKey: 'motion_y', value: arrays.y },
            ];
        }
        
        case 'CameraPath': {
            return [
                { inputKey: 'camera_path', value: formatAsMotionPathString(overrides) },
            ];
        }
        
        case 'generic':
        default: {
            const arrays = formatAsPositionArrays(overrides);
            const inputs: ComfyUIMotionInput[] = [
                { inputKey: 'positions_x', value: arrays.x },
                { inputKey: 'positions_y', value: arrays.y },
            ];
            if (arrays.z) {
                inputs.push({ inputKey: 'positions_z', value: arrays.z });
            }
            if (arrays.fov) {
                inputs.push({ inputKey: 'fov_degrees', value: arrays.fov });
            }
            return inputs;
        }
    }
}

// ============================================================================
// Utility: Validate Camera Path for Generation
// ============================================================================

/**
 * Validate a camera path is suitable for generation.
 * Returns warnings/errors without throwing.
 */
export function validateCameraPathForGeneration(
    cameraPath: CameraPath | undefined,
    totalFrames: number
): {
    valid: boolean;
    warnings: string[];
    errors: string[];
} {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!cameraPath) {
        errors.push('No camera path provided');
        return { valid: false, warnings, errors };
    }

    if (!cameraPath.id) {
        errors.push('Camera path must have an id');
    }

    const keyframes = cameraPath.keyframes || [];

    if (keyframes.length === 0) {
        errors.push('Camera path has no keyframes');
        return { valid: false, warnings, errors };
    }

    if (keyframes.length === 1) {
        warnings.push('Camera path has only one keyframe - camera will be static');
    }

    // Check keyframe ordering
    for (let i = 1; i < keyframes.length; i++) {
        const prev = keyframes[i - 1]!;
        const curr = keyframes[i]!;
        if (curr.timeSeconds < prev.timeSeconds) {
            errors.push(
                `Keyframe ${i} timeSeconds (${curr.timeSeconds}) is less than previous (${prev.timeSeconds})`
            );
        }
    }

    // Check for reasonable duration vs frame count
    const maxTime = Math.max(...keyframes.map(kf => kf.timeSeconds));
    if (maxTime > 0 && totalFrames > 0) {
        const impliedFps = totalFrames / maxTime;
        if (impliedFps < 8) {
            warnings.push(
                `Camera path duration (${maxTime}s) with ${totalFrames} frames implies very low fps (${impliedFps.toFixed(1)})`
            );
        }
        if (impliedFps > 60) {
            warnings.push(
                `Camera path duration (${maxTime}s) with ${totalFrames} frames implies very high fps (${impliedFps.toFixed(1)})`
            );
        }
    }

    // Validate coordinate space
    const validSpaces = ['world', 'screen', 'relative'];
    if (cameraPath.coordinateSpace && !validSpaces.includes(cameraPath.coordinateSpace)) {
        errors.push(`Invalid coordinateSpace: ${cameraPath.coordinateSpace}`);
    }

    return {
        valid: errors.length === 0,
        warnings,
        errors,
    };
}

export default {
    buildCameraNodeOverrides,
    formatAsMotionPathString,
    formatAsPositionArrays,
    formatForComfyUINode,
    validateCameraPathForGeneration,
    applyEasing,
};
