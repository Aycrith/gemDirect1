/**
 * Pipeline Configuration Service
 * 
 * Provides loading, validation, and resolution of pipeline configurations.
 * Transforms config-driven pipeline definitions into runtime objects used by
 * comfyUIService, videoGenerationService, and UI components.
 * 
 * Part of C2 - Modular Pipeline Refactor & Configuration Schema
 * Extended in E1 with Camera Path resolution support
 * 
 * @module services/pipelineConfigService
 */

import type { LocalGenerationSettings } from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import {
    DEFAULT_FEATURE_FLAGS,
    SAFE_DEFAULTS_FLAGS,
    PRODUCTION_QA_FLAGS,
    mergeFeatureFlags,
} from '../utils/featureFlags';
import {
    STABILITY_PROFILES,
    applyStabilityProfile,
    type StabilityProfileId,
} from '../utils/stabilityProfiles';
import type {
    PipelineConfig,
    PipelineConfigLoadResult,
    PipelineConfigValidationResult,
    ResolvedPipelineConfig,
    FeatureFlagsConfig,
    CameraPath,
} from '../types/pipelineConfig';
import { isPipelineConfig, PIPELINE_CONFIG_SCHEMA_VERSION } from '../types/pipelineConfig';
import { isCameraPath, validateCameraPath } from '../types/cameraPath';

// ============================================================================
// CONFIG LOADING
// ============================================================================

/**
 * Cache for loaded pipeline configs (browser environment)
 * Maps config path to loaded config
 */
const configCache = new Map<string, PipelineConfig>();

/**
 * Load a pipeline configuration from a JSON file
 * 
 * In browser: Fetches from public folder or relative path
 * Caches loaded configs to avoid repeated fetches
 * 
 * @param configPath Path to the config JSON file (relative to public or config folder)
 * @returns Load result with config or error
 */
export async function loadPipelineConfig(
    configPath: string
): Promise<PipelineConfigLoadResult> {
    // Check cache first
    if (configCache.has(configPath)) {
        const cached = configCache.get(configPath)!;
        return {
            success: true,
            config: cached,
            warnings: [],
        };
    }

    try {
        // Normalize path for browser fetch
        const fetchPath = normalizeFetchPath(configPath);
        
        const response = await fetch(fetchPath);
        if (!response.ok) {
            return {
                success: false,
                error: `Failed to load config: ${response.status} ${response.statusText}`,
            };
        }

        const rawConfig = await response.json();
        
        // Validate the loaded config
        const validation = validatePipelineConfig(rawConfig);
        if (!validation.valid) {
            return {
                success: false,
                error: `Invalid config: ${validation.errors?.join(', ')}`,
                warnings: validation.warnings,
            };
        }

        const config = rawConfig as PipelineConfig;
        
        // Cache for future use
        configCache.set(configPath, config);

        return {
            success: true,
            config,
            warnings: validation.warnings,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: `Failed to load config from ${configPath}: ${message}`,
        };
    }
}

/**
 * Load a pipeline config by ID from the standard config folder
 * 
 * @param configId Config ID (e.g., 'production-qa-preview')
 * @returns Load result with config or error
 */
export async function loadPipelineConfigById(
    configId: string
): Promise<PipelineConfigLoadResult> {
    const configPath = `/config/pipelines/${configId}.json`;
    return loadPipelineConfig(configPath);
}

/**
 * Clear the config cache
 * Useful for development/hot-reloading scenarios
 */
export function clearConfigCache(): void {
    configCache.clear();
}

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

/**
 * Validate a pipeline configuration object
 * 
 * Checks:
 * - Required fields present
 * - Valid enum values for presetMode, stabilityProfile
 * - Valid feature flag base preset
 * - Schema version compatibility
 * 
 * @param config Raw config object to validate
 * @returns Validation result with errors/warnings
 */
export function validatePipelineConfig(
    config: unknown
): PipelineConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check basic structure
    if (!config || typeof config !== 'object') {
        return {
            valid: false,
            errors: ['Config must be a non-null object'],
        };
    }

    // Use type guard for initial validation
    if (!isPipelineConfig(config)) {
        // Try to provide specific error messages
        const obj = config as Record<string, unknown>;
        
        if (!obj.version) errors.push('Missing required field: version');
        if (!obj.id) errors.push('Missing required field: id');
        if (!obj.name) errors.push('Missing required field: name');
        if (!obj.workflowProfileId) errors.push('Missing required field: workflowProfileId');
        if (!obj.presetMode) errors.push('Missing required field: presetMode');
        if (!obj.stabilityProfile) errors.push('Missing required field: stabilityProfile');
        
        return {
            valid: false,
            errors: errors.length > 0 ? errors : ['Config does not match PipelineConfig schema'],
        };
    }

    // Version compatibility check
    const majorVersion = config.version.split('.')[0];
    const expectedMajor = PIPELINE_CONFIG_SCHEMA_VERSION.split('.')[0];
    if (majorVersion !== expectedMajor) {
        warnings.push(`Config version ${config.version} may not be fully compatible with current schema ${PIPELINE_CONFIG_SCHEMA_VERSION}`);
    }

    // Validate feature flags config
    if (config.featureFlags) {
        const validBases = ['default', 'safe-defaults', 'production-qa'];
        if (config.featureFlags.base && !validBases.includes(config.featureFlags.base)) {
            errors.push(`Invalid featureFlags.base: ${config.featureFlags.base}. Must be one of: ${validBases.join(', ')}`);
        }
    }

    // Validate VRAM requirements if present
    if (config.vramRequirements) {
        if (config.vramRequirements.minGB > config.vramRequirements.recommendedGB) {
            warnings.push('VRAM minGB is greater than recommendedGB');
        }
    }

    // Validate QA config if present
    if (config.qa) {
        if (config.qa.videoQualityThreshold !== undefined) {
            if (config.qa.videoQualityThreshold < 0 || config.qa.videoQualityThreshold > 100) {
                errors.push('videoQualityThreshold must be between 0 and 100');
            }
        }
    }

    // Validate camera path if present (E1 - Camera-as-Code)
    if (config.cameraPath) {
        if (!isCameraPath(config.cameraPath)) {
            errors.push('cameraPath must be a valid CameraPath object with id and keyframes');
        } else {
            const cameraValidation = validateCameraPath(config.cameraPath);
            if (!cameraValidation.valid && cameraValidation.errors) {
                cameraValidation.errors.forEach(err => errors.push(`cameraPath: ${err}`));
            }
            if (cameraValidation.warnings) {
                cameraValidation.warnings.forEach(w => warnings.push(`cameraPath: ${w}`));
            }
        }
    }

    // Validate cameraPathId if present without inline cameraPath
    if (config.cameraPathId && !config.cameraPath) {
        // Note: cameraPathId resolution to external files is a future extension
        // For now, just log a warning that it won't be resolved
        warnings.push('cameraPathId without inline cameraPath: external camera path resolution not yet implemented');
    }

    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

// ============================================================================
// CONFIG RESOLUTION
// ============================================================================

/**
 * Resolve a pipeline config to runtime objects
 * 
 * Transforms the config into:
 * - workflowProfileId: The workflow profile to use
 * - stabilityProfileId: The stability profile for temporal settings
 * - featureFlags: Fully resolved FeatureFlags (base + overrides + stability profile)
 * - vramRequirements: VRAM requirements for preflight
 * - keyframeMode: single or bookend
 * 
 * @param config The pipeline config to resolve
 * @param globalSettings Current LocalGenerationSettings (for workflow profile lookup)
 * @returns Resolved runtime configuration
 * @throws Error if workflowProfileId not found in globalSettings
 */
export function resolvePipelineRuntimeConfig(
    config: PipelineConfig,
    globalSettings: LocalGenerationSettings
): ResolvedPipelineConfig {
    // Validate workflow profile exists
    const workflowProfile = globalSettings.workflowProfiles?.[config.workflowProfileId];
    if (!workflowProfile) {
        throw new Error(
            `Workflow profile '${config.workflowProfileId}' not found in settings. ` +
            'Import workflow profiles from Settings → ComfyUI Settings → Import from File.'
        );
    }

    // Resolve feature flags
    const resolvedFlags = resolveFeatureFlags(config.featureFlags, config.stabilityProfile);

    // Apply QA config overrides if present
    if (config.qa) {
        if (config.qa.keyframePairAnalysis !== undefined) {
            resolvedFlags.keyframePairAnalysis = config.qa.keyframePairAnalysis;
        }
        if (config.qa.bookendQAMode !== undefined) {
            resolvedFlags.bookendQAMode = config.qa.bookendQAMode;
        }
        if (config.qa.videoQualityGateEnabled !== undefined) {
            resolvedFlags.videoQualityGateEnabled = config.qa.videoQualityGateEnabled;
        }
        if (config.qa.videoQualityThreshold !== undefined) {
            resolvedFlags.videoQualityThreshold = config.qa.videoQualityThreshold;
        }
        if (config.qa.videoAnalysisFeedback !== undefined) {
            resolvedFlags.videoAnalysisFeedback = config.qa.videoAnalysisFeedback;
        }
        if (config.qa.autoVideoAnalysis !== undefined) {
            resolvedFlags.autoVideoAnalysis = config.qa.autoVideoAnalysis;
        }
    }

    // Get VRAM requirements from config or stability profile
    const stabilityProfile = STABILITY_PROFILES[config.stabilityProfile];
    const vramRequirements = config.vramRequirements ?? {
        minGB: stabilityProfile?.performance.vramMinGB ?? 8,
        recommendedGB: stabilityProfile?.performance.vramRecommendedGB ?? 12,
    };

    // Resolve camera path (E1 - Camera-as-Code)
    // Inline cameraPath takes precedence over cameraPathId
    // cameraPathId resolution to external files is a future extension
    const resolvedCameraPath: CameraPath | undefined = config.cameraPath ?? undefined;

    // Motion tracks pass through directly
    const resolvedMotionTracks = config.motionTracks ?? undefined;

    return {
        source: config,
        workflowProfileId: config.workflowProfileId,
        stabilityProfileId: config.stabilityProfile,
        featureFlags: resolvedFlags,
        vramRequirements: {
            minGB: vramRequirements.minGB,
            recommendedGB: vramRequirements.recommendedGB,
        },
        keyframeMode: config.keyframeMode ?? 'bookend',
        cameraPath: resolvedCameraPath,
        motionTracks: resolvedMotionTracks,
    };
}

/**
 * Resolve feature flags from config
 * 
 * Process:
 * 1. Start with base preset (default, safe-defaults, or production-qa)
 * 2. Apply explicit overrides from config
 * 3. Apply stability profile temporal settings
 * 
 * @param flagsConfig Feature flags configuration from pipeline config
 * @param stabilityProfileId Stability profile to apply
 * @returns Fully resolved FeatureFlags
 */
export function resolveFeatureFlags(
    flagsConfig: FeatureFlagsConfig | undefined,
    stabilityProfileId: StabilityProfileId
): FeatureFlags {
    // Step 1: Get base flags
    let baseFlags: FeatureFlags;
    const base = flagsConfig?.base ?? 'default';
    
    switch (base) {
        case 'safe-defaults':
            baseFlags = { ...SAFE_DEFAULTS_FLAGS };
            break;
        case 'production-qa':
            baseFlags = { ...PRODUCTION_QA_FLAGS };
            break;
        case 'default':
        default:
            baseFlags = { ...DEFAULT_FEATURE_FLAGS };
            break;
    }

    // Step 2: Apply explicit overrides
    if (flagsConfig?.overrides) {
        Object.assign(baseFlags, flagsConfig.overrides);
    }

    // Step 3: Apply stability profile (temporal coherence flags)
    const withStabilityProfile = applyStabilityProfile(baseFlags, stabilityProfileId);

    // Ensure we return complete FeatureFlags
    return mergeFeatureFlags(withStabilityProfile);
}

// ============================================================================
// PIPELINE LOOKUP UTILITIES
// ============================================================================

/**
 * Standard pipeline config IDs shipped with the application
 */
export const STANDARD_PIPELINE_IDS = [
    'fast-preview',
    'production-qa-preview',
    'cinematic-preview',
] as const;

export type StandardPipelineId = typeof STANDARD_PIPELINE_IDS[number];

/**
 * Get the default pipeline config ID for a preset mode
 */
export function getDefaultPipelineIdForPreset(presetMode: string): StandardPipelineId {
    switch (presetMode) {
        case 'fast':
            return 'fast-preview';
        case 'production':
        case 'production-qa':
            return 'production-qa-preview';
        case 'cinematic':
            return 'cinematic-preview';
        default:
            return 'production-qa-preview';
    }
}

/**
 * Check if a workflow profile exists and is valid
 */
export function validateWorkflowProfileExists(
    profileId: string,
    globalSettings: LocalGenerationSettings
): { exists: boolean; error?: string } {
    const profile = globalSettings.workflowProfiles?.[profileId];
    
    if (!profile) {
        return {
            exists: false,
            error: `Workflow profile '${profileId}' not found. Import from Settings → ComfyUI Settings.`,
        };
    }

    // Basic validation - check it has required fields
    if (!profile.workflowJson) {
        return {
            exists: false,
            error: `Workflow profile '${profileId}' has no workflow JSON configured.`,
        };
    }

    return { exists: true };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize a config path for browser fetch
 * Handles relative paths and ensures proper URL format
 */
function normalizeFetchPath(configPath: string): string {
    // If already absolute URL or starts with /, use as-is
    if (configPath.startsWith('http') || configPath.startsWith('/')) {
        return configPath;
    }
    
    // Convert relative path to /config/pipelines/ path
    if (configPath.endsWith('.json')) {
        const filename = configPath.split('/').pop() ?? configPath;
        return `/config/pipelines/${filename}`;
    }
    
    return `/config/pipelines/${configPath}.json`;
}

/**
 * Create LocalGenerationSettings overrides from a resolved pipeline config
 * 
 * Use this to merge pipeline config into existing settings before generation
 * 
 * @param resolved Resolved pipeline config
 * @returns Partial settings to merge with existing LocalGenerationSettings
 */
export function createSettingsOverrides(
    resolved: ResolvedPipelineConfig
): Partial<LocalGenerationSettings> {
    return {
        videoWorkflowProfile: resolved.workflowProfileId,
        sceneBookendWorkflowProfile: resolved.workflowProfileId,
        keyframeMode: resolved.keyframeMode,
        featureFlags: resolved.featureFlags,
    };
}

/**
 * Merge pipeline config into existing settings
 * Creates a new settings object without mutating the original
 */
export function mergePipelineIntoSettings(
    existingSettings: LocalGenerationSettings,
    resolved: ResolvedPipelineConfig
): LocalGenerationSettings {
    return {
        ...existingSettings,
        ...createSettingsOverrides(resolved),
    };
}

// ============================================================================
// CAMERA PATH RESOLUTION (E1.2)
// ============================================================================

/**
 * Resolve camera path from a pipeline config or load result
 * 
 * Returns the camera path if available in the config, or undefined.
 * This is a convenience function for E1.2 integration.
 * 
 * @param configOrResult Either a PipelineConfigLoadResult or a resolved/raw config
 * @returns The camera path if available, undefined otherwise
 */
export function resolveCameraPath(
    configOrResult: PipelineConfigLoadResult | ResolvedPipelineConfig | PipelineConfig | null | undefined
): CameraPath | undefined {
    if (!configOrResult) {
        return undefined;
    }

    // Handle PipelineConfigLoadResult
    if ('success' in configOrResult) {
        const loadResult = configOrResult as PipelineConfigLoadResult;
        if (!loadResult.success || !loadResult.config) {
            return undefined;
        }
        return loadResult.config.cameraPath;
    }

    // Handle ResolvedPipelineConfig
    if ('source' in configOrResult) {
        const resolved = configOrResult as ResolvedPipelineConfig;
        return resolved.cameraPath;
    }

    // Handle raw PipelineConfig
    if ('id' in configOrResult && 'cameraPath' in configOrResult) {
        const config = configOrResult as PipelineConfig;
        return config.cameraPath;
    }

    return undefined;
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export { configCache as _testConfigCache };
