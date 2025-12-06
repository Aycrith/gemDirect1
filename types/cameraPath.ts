/**
 * Camera Path Types ("Camera-as-Code")
 * 
 * Defines the schema for camera/motion path representations.
 * Camera paths describe the movement and orientation of the virtual camera
 * over time, enabling:
 * - Reproducible camera movements
 * - Temporal coherence guidance for video generation
 * - QA/benchmark context for motion analysis
 * 
 * Part of E1 - Camera-as-Code / Motion Path Infrastructure
 * 
 * @module types/cameraPath
 */

// ============================================================================
// Coordinate Space
// ============================================================================

/**
 * Coordinate space for camera positions and orientations
 * 
 * - 'world': Absolute 3D coordinates in world space (x, y, z)
 * - 'screen': Normalized screen coordinates (0-1, where 0,0 is top-left)
 * - 'relative': Relative to subject or initial position (offsets)
 */
export type CameraCoordinateSpace = 'world' | 'screen' | 'relative';

// ============================================================================
// Easing Functions
// ============================================================================

/**
 * Easing function for keyframe interpolation
 * 
 * Controls how values transition between keyframes:
 * - 'linear': Constant speed throughout
 * - 'easeIn': Starts slow, accelerates toward end
 * - 'easeOut': Starts fast, decelerates toward end
 * - 'easeInOut': Starts and ends slow, fastest in middle
 */
export type CameraEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

// ============================================================================
// 3D Position and Rotation Types
// ============================================================================

/**
 * 3D position coordinates
 * z is optional for 2D/screen-space paths
 */
export interface Position3D {
    x: number;
    y: number;
    z?: number;
}

/**
 * Camera rotation in degrees
 * All angles are optional - unspecified values are interpolated or held constant
 */
export interface RotationDegrees {
    /** Rotation around vertical axis (left/right) */
    yaw?: number;
    /** Rotation around horizontal axis (up/down) */
    pitch?: number;
    /** Rotation around forward axis (tilt) */
    roll?: number;
}

// ============================================================================
// Camera Keyframe
// ============================================================================

/**
 * A single keyframe in a camera path
 * 
 * Defines the camera state at a specific point in time.
 * All properties except timeSeconds are optional - unspecified values
 * are interpolated from surrounding keyframes.
 */
export interface CameraKeyframe {
    /**
     * Time in seconds from the start of the shot/scene
     */
    timeSeconds: number;

    /**
     * Optional frame index (alternative to timeSeconds for precise frame control)
     * If both are provided, timeSeconds takes precedence
     */
    frameIndex?: number;

    /**
     * Camera position in the configured coordinate space
     */
    position?: Position3D;

    /**
     * Camera rotation in degrees
     */
    rotationDeg?: RotationDegrees;

    /**
     * Field of view in degrees (vertical FOV)
     * Used for zoom effects
     */
    fovDegrees?: number;

    /**
     * Point the camera should look at (alternative to rotationDeg)
     * If both are provided, lookAt takes precedence for orientation
     */
    lookAt?: Position3D;

    /**
     * Easing function for transition TO this keyframe from the previous one
     * @default 'linear'
     */
    easing?: CameraEasing;

    /**
     * Optional descriptive label for this keyframe
     * Useful for debugging and documentation
     */
    label?: string;
}

// ============================================================================
// Camera Path
// ============================================================================

/**
 * A complete camera path definition
 * 
 * Describes the camera movement over the duration of a shot/scene
 * as a sequence of keyframes. Intermediate positions are interpolated.
 */
export interface CameraPath {
    /**
     * Unique identifier for this camera path
     */
    id: string;

    /**
     * Human-readable description of the camera movement
     * @example "Slow dolly-in from medium shot to close-up"
     */
    description?: string;

    /**
     * Coordinate space for all keyframe positions
     * @default 'screen'
     */
    coordinateSpace?: CameraCoordinateSpace;

    /**
     * Ordered sequence of camera keyframes
     * Must have at least one keyframe; typically 2+ for motion
     */
    keyframes: CameraKeyframe[];

    /**
     * Optional: Named motion type for categorization
     * @example "pan", "dolly", "zoom", "static", "tracking"
     */
    motionType?: string;

    /**
     * Optional: Intensity/speed hint for motion (0-1 normalized)
     * 0 = very slow/subtle, 1 = fast/dramatic
     */
    motionIntensity?: number;

    /**
     * Metadata for tracking and debugging
     */
    metadata?: {
        createdAt?: string;
        author?: string;
        notes?: string;
        tags?: string[];
    };
}

// ============================================================================
// Motion Track (Subject Motion - Stub for Future Extension)
// ============================================================================

/**
 * A motion track for subject movement
 * 
 * Describes the movement of a subject within the frame over time.
 * This is a stub interface for future extension - full implementation
 * will come in later phases when optical flow guidance is added.
 */
export interface MotionTrack {
    /**
     * Unique identifier for this motion track
     */
    id: string;

    /**
     * Description of the subject and its motion
     */
    description?: string;

    /**
     * Subject identifier (links to character/object tracking)
     */
    subjectId?: string;

    /**
     * Motion type hint
     * @example "walking", "running", "static", "gesture", "subtle"
     */
    motionType?: string;

    /**
     * Motion intensity (0-1 normalized)
     */
    intensity?: number;

    /**
     * Keyframes for subject position (similar to CameraKeyframe but for subjects)
     * Coordinates are in screen space (0-1)
     */
    keyframes?: Array<{
        timeSeconds: number;
        position?: Position3D;
        scale?: number;
    }>;
}

// ============================================================================
// Camera Path Summary (for manifests/QA)
// ============================================================================

/**
 * Summary of a camera path for inclusion in manifests
 * Provides key metrics without full keyframe data
 */
export interface CameraPathSummary {
    /** Camera path ID */
    id: string;

    /** Number of keyframes in the path */
    keyframeCount: number;

    /** Total duration in seconds (max timeSeconds from keyframes) */
    durationSeconds?: number;

    /** Coordinate space used */
    coordinateSpace?: CameraCoordinateSpace;

    /** Motion type if specified */
    motionType?: string;

    /** Motion intensity if specified */
    motionIntensity?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard for CameraKeyframe
 */
export function isCameraKeyframe(obj: unknown): obj is CameraKeyframe {
    if (!obj || typeof obj !== 'object') return false;
    const kf = obj as Record<string, unknown>;
    return typeof kf.timeSeconds === 'number';
}

/**
 * Type guard for CameraPath
 */
export function isCameraPath(obj: unknown): obj is CameraPath {
    if (!obj || typeof obj !== 'object') return false;
    const path = obj as Record<string, unknown>;
    if (typeof path.id !== 'string') return false;
    if (!Array.isArray(path.keyframes)) return false;
    return path.keyframes.every(isCameraKeyframe);
}

/**
 * Create a summary from a full camera path
 */
export function createCameraPathSummary(path: CameraPath): CameraPathSummary {
    const keyframes = path.keyframes || [];
    const maxTime = keyframes.reduce(
        (max, kf) => Math.max(max, kf.timeSeconds || 0),
        0
    );

    return {
        id: path.id,
        keyframeCount: keyframes.length,
        durationSeconds: maxTime > 0 ? maxTime : undefined,
        coordinateSpace: path.coordinateSpace,
        motionType: path.motionType,
        motionIntensity: path.motionIntensity,
    };
}

/**
 * Validate a camera path and return any issues
 */
export function validateCameraPath(path: CameraPath): {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!path.id) {
        errors.push('Camera path must have an id');
    }

    if (!path.keyframes || path.keyframes.length === 0) {
        errors.push('Camera path must have at least one keyframe');
    } else {
        // Check keyframes are in order
        for (let i = 1; i < path.keyframes.length; i++) {
            const prev = path.keyframes[i - 1];
            const curr = path.keyframes[i];
            if (prev && curr && curr.timeSeconds < prev.timeSeconds) {
                errors.push(
                    `Keyframe ${i} timeSeconds (${curr.timeSeconds}) is less than previous (${prev.timeSeconds})`
                );
            }
        }

        // Validate each keyframe
        path.keyframes.forEach((kf, i) => {
            if (typeof kf.timeSeconds !== 'number' || kf.timeSeconds < 0) {
                errors.push(`Keyframe ${i} has invalid timeSeconds: ${kf.timeSeconds}`);
            }
        });
    }

    // Validate coordinate space
    const validSpaces: CameraCoordinateSpace[] = ['world', 'screen', 'relative'];
    if (path.coordinateSpace && !validSpaces.includes(path.coordinateSpace)) {
        errors.push(`Invalid coordinateSpace: ${path.coordinateSpace}`);
    }

    // Warn on single keyframe (static camera)
    if (path.keyframes && path.keyframes.length === 1) {
        warnings.push('Camera path has only one keyframe - camera will be static');
    }

    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

export default {
    isCameraKeyframe,
    isCameraPath,
    createCameraPathSummary,
    validateCameraPath,
};
