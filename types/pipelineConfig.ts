/**
 * Pipeline Configuration Types
 * 
 * Defines the schema for config-driven scene/pipeline definitions.
 * Allows scenes and pipelines to be defined as data (JSON configs) rather than
 * having pipeline logic scattered across UI and services.
 * 
 * Part of C2 - Modular Pipeline Refactor & Configuration Schema
 * Extended in E1 with Camera Path ("Camera-as-Code") support
 * 
 * @module types/pipelineConfig
 */

import type { FeatureFlags } from '../utils/featureFlags';
import type { StabilityProfileId } from '../utils/stabilityProfiles';
import type { CameraPath, MotionTrack } from './cameraPath';

// Re-export camera path types for convenience
export type { CameraPath, CameraKeyframe, CameraCoordinateSpace, MotionTrack, CameraPathSummary } from './cameraPath';

/**
 * Schema version for migration support
 */
export const PIPELINE_CONFIG_SCHEMA_VERSION = '1.0';

/**
 * Pipeline preset mode identifier
 * Maps to existing presets in PIPELINE_PRESETS (ProductionQualityPreviewPanel)
 */
export type PipelinePresetMode = 
    | 'fast'           // Fast iteration, low VRAM (6-8 GB)
    | 'production'     // Balanced quality/speed, default (8-12 GB)
    | 'production-qa'  // Production + QA gates (10-12 GB)
    | 'cinematic'      // Full temporal stack (12-16 GB)
    | 'safe-defaults'  // Most conservative (8 GB)
    | 'custom';        // User-configured

/**
 * QA expectations for the pipeline
 * Specifies which QA modes should be active
 */
export interface PipelineQAConfig {
    /**
     * Enable keyframe pair analysis preflight check before bookend video generation.
     * Uses vision LLM to analyze start/end keyframes for visual continuity.
     * @default false
     */
    keyframePairAnalysis?: boolean;

    /**
     * Master switch for Bookend QA Mode.
     * When enabled, forces keyframePairAnalysis and videoQualityGateEnabled.
     * @default false
     */
    bookendQAMode?: boolean;

    /**
     * Enable video quality gate enforcement.
     * Videos are evaluated against quality thresholds and flagged if below bar.
     * @default false
     */
    videoQualityGateEnabled?: boolean;

    /**
     * Minimum overall score threshold for video quality acceptance.
     * Videos below this score will be flagged for regeneration.
     * @default 60
     */
    videoQualityThreshold?: number;

    /**
     * Enable video analysis feedback after generation.
     * @default false
     */
    videoAnalysisFeedback?: boolean;

    /**
     * Auto-analyze videos after generation completes.
     * @default false
     */
    autoVideoAnalysis?: boolean;
}

/**
 * Output hints for video generation
 * Optional parameters that influence output characteristics
 */
export interface PipelineOutputHints {
    /**
     * Target output resolution (e.g., '1280x720', '1920x1080')
     * If not specified, uses workflow default
     */
    resolution?: string;

    /**
     * Target frames per second
     * If not specified, uses workflow default
     */
    fps?: number;

    /**
     * Target duration in seconds
     * Hint for temporal context generation
     */
    durationSeconds?: number;

    /**
     * Number of frames to generate
     * Alternative to durationSeconds
     */
    frameCount?: number;
}

/**
 * Feature flags overlay configuration
 * Can specify a base preset and/or explicit overrides
 */
export interface FeatureFlagsConfig {
    /**
     * Base feature flags preset to start from
     * - 'default': DEFAULT_FEATURE_FLAGS
     * - 'safe-defaults': SAFE_DEFAULTS_FLAGS
     * - 'production-qa': PRODUCTION_QA_FLAGS
     * @default 'default'
     */
    base?: 'default' | 'safe-defaults' | 'production-qa';

    /**
     * Explicit flag overrides to apply on top of the base
     * Any FeatureFlags property can be overridden here
     */
    overrides?: Partial<FeatureFlags>;
}

/**
 * Scene configuration for pipeline execution
 * Defines a single scene within a pipeline
 */
export interface SceneConfig {
    /**
     * Unique scene identifier
     */
    id: string;

    /**
     * Human-readable scene name
     */
    name: string;

    /**
     * Optional description of the scene
     */
    description?: string;

    /**
     * Temporal context for bookend workflow
     */
    temporalContext?: {
        /**
         * Description of the start moment (e.g., "Explorer approaches artifact")
         */
        startMoment: string;

        /**
         * Description of the end moment (e.g., "Artifact begins glowing")
         */
        endMoment: string;

        /**
         * Optional duration in seconds
         */
        duration?: number;
    };
}

/**
 * Complete pipeline configuration
 * Captures all settings needed to drive video generation
 */
export interface PipelineConfig {
    /**
     * Schema version for migration support
     * @example '1.0'
     */
    $schema?: string;
    version: string;

    /**
     * Unique pipeline identifier
     * Used for lookup and referencing
     */
    id: string;

    /**
     * Human-readable pipeline name
     */
    name: string;

    /**
     * Optional pipeline description
     */
    description?: string;

    /**
     * Workflow profile ID from LocalGenerationSettings.workflowProfiles
     * Must match an existing profile (e.g., 'wan-fun-inpaint', 'wan-flf2v')
     */
    workflowProfileId: string;

    /**
     * Optional explicit workflow JSON path override
     * If specified, takes precedence over workflowProfileId's embedded workflow
     */
    workflowPath?: string;

    /**
     * Target pipeline preset mode
     * Determines the baseline configuration
     */
    presetMode: PipelinePresetMode;

    /**
     * Stability profile for temporal coherence settings
     * @default 'standard'
     */
    stabilityProfile: StabilityProfileId;

    /**
     * Feature flags configuration
     * Specifies base preset and/or explicit overrides
     */
    featureFlags?: FeatureFlagsConfig;

    /**
     * QA expectations and settings
     */
    qa?: PipelineQAConfig;

    /**
     * Output generation hints
     */
    outputHints?: PipelineOutputHints;

    /**
     * Scene configurations (optional - for multi-scene pipelines)
     * If not provided, the pipeline is a single-scene configuration
     */
    scenes?: SceneConfig[];

    /**
     * Keyframe mode for the pipeline
     * @default 'bookend'
     */
    keyframeMode?: 'single' | 'bookend';

    // =========================================================================
    // Camera Path / Motion Path (E1 - Camera-as-Code)
    // =========================================================================

    /**
     * Reference to a camera path by ID
     * Used when camera paths are defined externally or shared across configs
     * If both cameraPathId and cameraPath are provided, inline cameraPath takes precedence
     */
    cameraPathId?: string;

    /**
     * Inline camera path definition
     * Describes the camera movement over the duration of the generation
     * See types/cameraPath.ts for full schema
     */
    cameraPath?: CameraPath;

    /**
     * Optional motion tracks for subject movement
     * Stub for future optical flow guidance; not fully implemented yet
     */
    motionTracks?: MotionTrack[];

    /**
     * VRAM requirements (informational)
     * Helps with preflight checks and preset downgrade decisions
     */
    vramRequirements?: {
        /**
         * Minimum VRAM in GB
         */
        minGB: number;

        /**
         * Recommended VRAM in GB
         */
        recommendedGB: number;

        /**
         * VRAM usage category for UI display
         */
        category: 'low' | 'medium' | 'high';
    };

    /**
     * Metadata for tracking and debugging
     */
    metadata?: {
        /**
         * When the config was created
         */
        createdAt?: string;

        /**
         * When the config was last modified
         */
        lastModifiedAt?: string;

        /**
         * Author or source of the config
         */
        author?: string;

        /**
         * Tags for organization
         */
        tags?: string[];

        /**
         * Notes about the configuration
         */
        notes?: string;
    };
}

/**
 * Result of resolving a pipeline config to runtime objects
 */
export interface ResolvedPipelineConfig {
    /**
     * The original pipeline config
     */
    source: PipelineConfig;

    /**
     * Resolved workflow profile ID
     */
    workflowProfileId: string;

    /**
     * Resolved stability profile ID
     */
    stabilityProfileId: StabilityProfileId;

    /**
     * Fully resolved feature flags (base + overrides applied)
     */
    featureFlags: FeatureFlags;

    /**
     * VRAM requirements for preflight
     */
    vramRequirements: {
        minGB: number;
        recommendedGB: number;
    };

    /**
     * Keyframe mode
     */
    keyframeMode: 'single' | 'bookend';

    /**
     * Resolved camera path (if defined in config)
     * Takes precedence over cameraPathId if both present
     */
    cameraPath?: CameraPath;

    /**
     * Resolved motion tracks (if defined in config)
     */
    motionTracks?: MotionTrack[];
}

/**
 * Pipeline config loading result
 */
export interface PipelineConfigLoadResult {
    /**
     * Whether loading succeeded
     */
    success: boolean;

    /**
     * Loaded config (if success)
     */
    config?: PipelineConfig;

    /**
     * Error message (if failed)
     */
    error?: string;

    /**
     * Validation warnings (non-fatal issues)
     */
    warnings?: string[];
}

/**
 * Pipeline config validation result
 */
export interface PipelineConfigValidationResult {
    /**
     * Whether the config is valid
     */
    valid: boolean;

    /**
     * Validation errors (if invalid)
     */
    errors?: string[];

    /**
     * Validation warnings (non-fatal issues)
     */
    warnings?: string[];
}

/**
 * Type guard to check if an object is a valid PipelineConfig
 */
export function isPipelineConfig(obj: unknown): obj is PipelineConfig {
    if (!obj || typeof obj !== 'object') return false;
    
    const config = obj as Record<string, unknown>;
    
    // Check required fields
    if (typeof config.version !== 'string') return false;
    if (typeof config.id !== 'string') return false;
    if (typeof config.name !== 'string') return false;
    if (typeof config.workflowProfileId !== 'string') return false;
    if (typeof config.presetMode !== 'string') return false;
    if (typeof config.stabilityProfile !== 'string') return false;
    
    // Validate presetMode
    const validPresetModes: PipelinePresetMode[] = [
        'fast', 'production', 'production-qa', 'cinematic', 'safe-defaults', 'custom'
    ];
    if (!validPresetModes.includes(config.presetMode as PipelinePresetMode)) return false;
    
    // Validate stabilityProfile
    const validStabilityProfiles: StabilityProfileId[] = ['fast', 'standard', 'cinematic', 'custom'];
    if (!validStabilityProfiles.includes(config.stabilityProfile as StabilityProfileId)) return false;
    
    return true;
}
