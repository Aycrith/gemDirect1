/**
 * Video Upscaling Service
 * 
 * Provides video upscaling as a post-processing step after video generation.
 * Uses ComfyUI upscaler models (Real-ESRGAN, 4x-UltraSharp, etc.).
 * 
 * @module services/videoUpscalingService
 */

import type { LocalGenerationSettings, WorkflowProfile, LocalGenerationAsset, MappableData } from '../types';

type SettingsWithInterpolationProfile = LocalGenerationSettings & {
    /** Optional explicit workflow profile id for interpolation (may be introduced in a separate PR). */
    interpolationWorkflowProfile?: string;
};

function getInterpolationWorkflowProfileId(settings: LocalGenerationSettings): string | undefined {
    return (settings as SettingsWithInterpolationProfile).interpolationWorkflowProfile;
}

/**
 * Upscaling configuration
 */
export interface UpscaleConfig {
    /** Target scale factor (1.5, 2, 4) */
    scaleFactor: 1.5 | 2 | 4;
    /** Upscale model to use */
    model: 'RealESRGAN_x4plus' | '4x-UltraSharp' | 'RealESRGAN_x4plus_anime_6B';
    /** Whether to use tile-based upscaling for large videos */
    useTiles: boolean;
    /** Tile size for tiled upscaling */
    tileSize: number;
    /** Output quality (1-100) */
    quality: number;
}

/**
 * Default upscale configuration
 */
export const DEFAULT_UPSCALE_CONFIG: UpscaleConfig = {
    scaleFactor: 2,
    model: '4x-UltraSharp',
    useTiles: true,
    tileSize: 512,
    quality: 90,
};

/**
 * Interpolation configuration
 */
export interface InterpolationConfig {
    /** Target FPS multiplier (2x, 4x) */
    multiplier: 2 | 4;
    /** Interpolation model */
    model: 'RIFE' | 'GMFSS';
}

export const DEFAULT_INTERPOLATION_CONFIG: InterpolationConfig = {
    multiplier: 2,
    model: 'RIFE'
};

/**
 * Result of video upscaling operation
 */
export interface UpscaleResult {
    success: boolean;
    outputPath?: string;
    outputData?: string; // Base64 encoded video
    originalResolution?: { width: number; height: number };
    upscaledResolution?: { width: number; height: number };
    processingTimeMs?: number;
    error?: string;
    // Telemetry
    interpolationElapsed?: number;
    upscaleMethod?: string;
    finalFps?: number;
}

import { queueComfyUIPromptWithQueue, ComfyUIPromptPayloads } from './comfyUIService';

function hasRequiredWorkflow(profile: WorkflowProfile | undefined, requiredMapping: MappableData): boolean {
    if (!profile?.workflowJson || profile.workflowJson.trim().length < 10) {
        return false;
    }
    const mapping = profile.mapping || {};
    return Object.values(mapping).includes(requiredMapping);
}

function findFirstProfileWithPrefix(
    settings: LocalGenerationSettings,
    prefix: string,
    requiredMapping: MappableData
): string | null {
    const profiles = settings.workflowProfiles || {};
    const candidates = Object.keys(profiles).filter(id => id.startsWith(prefix));
    for (const id of candidates) {
        if (hasRequiredWorkflow(profiles[id], requiredMapping)) return id;
    }
    return null;
}

export function resolveUpscalerProfileId(settings: LocalGenerationSettings, config: UpscaleConfig): string | null {
    const profiles = settings.workflowProfiles || {};

    const explicit = settings.upscalerWorkflowProfile;
    if (explicit && hasRequiredWorkflow(profiles[explicit], 'input_video')) {
        return explicit;
    }

    const byConfig: string[] = [];
    if (config.model === '4x-UltraSharp') {
        if (config.scaleFactor === 4) {
            byConfig.push('video-upscaler-ultrasharp-4x');
        } else {
            byConfig.push('video-upscaler-ultrasharp-2x', 'video-upscaler');
        }
    } else if (config.model === 'RealESRGAN_x4plus') {
        byConfig.push(
            config.scaleFactor === 4 ? 'video-upscaler-realesrgan-x4plus-4x' : 'video-upscaler-realesrgan-x4plus-2x'
        );
    } else if (config.model === 'RealESRGAN_x4plus_anime_6B') {
        byConfig.push(config.scaleFactor === 4 ? 'video-upscaler-anime-6b-4x' : 'video-upscaler-anime-6b-2x');
    }
    byConfig.push('video-upscaler');

    for (const candidate of byConfig) {
        if (hasRequiredWorkflow(profiles[candidate], 'input_video')) return candidate;
    }

    // Safe fallback: any available `video-upscaler*` profile with input_video mapping.
    return findFirstProfileWithPrefix(settings, 'video-upscaler', 'input_video');
}

function resolveInterpolationProfileId(settings: LocalGenerationSettings, config: InterpolationConfig): string | null {
    const profiles = settings.workflowProfiles || {};

    const explicit = getInterpolationWorkflowProfileId(settings);
    if (explicit && hasRequiredWorkflow(profiles[explicit], 'input_video')) {
        return explicit;
    }

    const candidates: string[] = [];
    if (config.model === 'RIFE') {
        if (config.multiplier === 4) {
            candidates.push('rife-interpolation-4x-quality', 'rife-interpolation-4x-fast', 'rife-interpolation-4x');
        } else {
            candidates.push('rife-interpolation-2x-quality', 'rife-interpolation-2x-fast', 'rife-interpolation-2x', 'rife-interpolation');
        }
    }
    candidates.push('rife-interpolation');

    for (const candidate of candidates) {
        if (hasRequiredWorkflow(profiles[candidate], 'input_video')) return candidate;
    }

    // Safe fallback: any available `rife-interpolation*` profile with input_video mapping.
    return findFirstProfileWithPrefix(settings, 'rife-interpolation', 'input_video');
}

export const interpolateVideo = async (
    settings: LocalGenerationSettings,
    videoPath: string,
    config: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG
): Promise<UpscaleResult> => {
    console.log(`[VideoUpscaling] Interpolating video: ${videoPath} with config`, config);
    const startTime = Date.now();

    // Match upscaling support semantics (feature flag + ComfyUI configured).
    const flags = settings.featureFlags;
    if (!flags?.frameInterpolationEnabled || !settings.comfyUIUrl) {
        return {
            success: false,
            error: 'Video interpolation not supported with current settings',
        };
    }

    // If the user explicitly selected an interpolation profile, provide a targeted error
    // when it is missing or misconfigured (helps UI gating + troubleshooting).
    const explicit = getInterpolationWorkflowProfileId(settings);
    if (explicit) {
        const explicitProfile = settings.workflowProfiles?.[explicit];
        if (!explicitProfile) {
            return {
                success: false,
                error: `Interpolation workflow profile "${explicit}" was selected but was not found in workflowProfiles.`,
            };
        }
        if (!explicitProfile.workflowJson || explicitProfile.workflowJson.trim().length < 10) {
            return {
                success: false,
                error: `Interpolation workflow profile "${explicit}" is missing a valid workflowJson. Please re-import the profile.`,
            };
        }
        const mapping = explicitProfile.mapping || {};
        const hasInputVideo = Object.values(mapping).includes('input_video');
        if (!hasInputVideo) {
            return {
                success: false,
                error: `Interpolation workflow profile "${explicit}" is missing the required input_video mapping.`,
            };
        }
    }

    const profileId = resolveInterpolationProfileId(settings, config);
    
    if (!profileId) {
        return {
            success: false,
            error: 'No interpolation workflow profile found. Please import it in settings.',
        };
    }

    try {
        // Empty payloads as we're driving via inputVideo mapping
        const payloads: ComfyUIPromptPayloads = {
            json: "{}",
            text: "",
            structured: [],
            negativePrompt: ""
        };

        const result = await queueComfyUIPromptWithQueue(
            settings,
            payloads,
            "", // No keyframe image needed for RIFE usually
            profileId,
            {
                waitForCompletion: true,
                extraData: {
                    inputVideo: videoPath
                }
            }
        );

        // When waitForCompletion is true, result is LocalGenerationStatus['final_output']
        // We need to cast it safely
        const output = result as { 
            type: string; 
            data: string; 
            filename: string; 
            assets?: LocalGenerationAsset[] 
        };

        if (output && (output.type === 'video' || output.type === 'image')) {
            const elapsed = Date.now() - startTime;
            return {
                success: true,
                outputPath: output.filename,
                outputData: output.data,
                processingTimeMs: elapsed,
                interpolationElapsed: elapsed,
                upscaleMethod: config.model,
                finalFps: config.multiplier * 24 // Estimate based on multiplier
            };
        }

        const elapsed = Date.now() - startTime;
        return {
            success: false,
            error: 'Video interpolation failed: completed but no output video was returned',
            processingTimeMs: elapsed,
            interpolationElapsed: elapsed,
        };

    } catch (error) {
        console.error(`[VideoUpscaling] Interpolation failed:`, error);
        return {
            success: false,
            error: `Video interpolation failed: ${error instanceof Error ? error.message : String(error)}`,
            processingTimeMs: Date.now() - startTime,
        };
    }
};


/**
 * Validates upscaling is supported for the current settings
 */
export function isUpscalingSupported(settings: LocalGenerationSettings): boolean {
    // Check if video upscaling is enabled in feature flags
    const flags = settings.featureFlags;
    if (!flags?.videoUpscaling) {
        return false;
    }

    // Check if ComfyUI is configured
    if (!settings.comfyUIUrl) {
        return false;
    }

    // Contract: only supported when the resolved profile is valid (workflowJson + input_video mapping).
    const resolvedProfileId = resolveUpscalerProfileId(settings, DEFAULT_UPSCALE_CONFIG);
    if (!resolvedProfileId) return false;
    const resolvedProfile = settings.workflowProfiles?.[resolvedProfileId];
    return hasRequiredWorkflow(resolvedProfile, 'input_video');
}

/**
 * Validates interpolation is supported for the current settings
 */
export function isInterpolationSupported(settings: LocalGenerationSettings): boolean {
    const flags = settings.featureFlags;
    if (!flags?.frameInterpolationEnabled) {
        return false;
    }

    if (!settings.comfyUIUrl) {
        return false;
    }

    const resolvedProfileId = resolveInterpolationProfileId(settings, DEFAULT_INTERPOLATION_CONFIG);
    if (!resolvedProfileId) return false;
    const resolvedProfile = settings.workflowProfiles?.[resolvedProfileId];
    return hasRequiredWorkflow(resolvedProfile, 'input_video');
}

/**
 * Gets the upscaler workflow profile from settings
 */
export function getUpscalerProfile(settings: LocalGenerationSettings): WorkflowProfile | null {
    const resolved = resolveUpscalerProfileId(settings, DEFAULT_UPSCALE_CONFIG);
    if (resolved) {
        return settings.workflowProfiles?.[resolved] || null;
    }

    const fallbackId = findFirstProfileWithPrefix(settings, 'video-upscaler', 'input_video');
    if (fallbackId) {
        return settings.workflowProfiles?.[fallbackId] || null;
    }

    // Back-compat fallback
    return settings.workflowProfiles?.['video-upscaler'] || null;
}

/**
 * Builds upscale request payload for ComfyUI
 */
export function buildUpscalePayload(
    videoPath: string,
    config: UpscaleConfig = DEFAULT_UPSCALE_CONFIG
): Record<string, unknown> {
    return {
        input_video: videoPath,
        upscale_model: config.model,
        scale_factor: config.scaleFactor,
        use_tiles: config.useTiles,
        tile_size: config.tileSize,
        quality: config.quality,
    };
}

/**
 * Validates upscale configuration
 */
export function validateUpscaleConfig(config: Partial<UpscaleConfig>): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (config.scaleFactor !== undefined) {
        if (![1.5, 2, 4].includes(config.scaleFactor)) {
            errors.push(`Invalid scale factor: ${config.scaleFactor}. Must be 1.5, 2, or 4.`);
        }
    }

    if (config.quality !== undefined) {
        if (config.quality < 1 || config.quality > 100) {
            errors.push(`Invalid quality: ${config.quality}. Must be 1-100.`);
        }
    }

    if (config.tileSize !== undefined) {
        if (config.tileSize < 128 || config.tileSize > 2048) {
            errors.push(`Invalid tile size: ${config.tileSize}. Must be 128-2048.`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Estimates VRAM usage for upscaling operation
 * Based on input resolution, scale factor, and model
 */
export function estimateVramUsage(
    inputWidth: number,
    inputHeight: number,
    config: UpscaleConfig
): { estimated: number; unit: 'MB' | 'GB'; safe: boolean } {
    // Base VRAM for model: ~500MB for Real-ESRGAN
    const baseVram = 500;
    
    // Per-pixel VRAM estimate (empirical): ~0.001MB per 1000 output pixels
    const outputPixels = inputWidth * inputHeight * config.scaleFactor * config.scaleFactor;
    const pixelVram = outputPixels / 1000 * 0.001;
    
    // Tile processing reduces peak VRAM usage
    const tileMultiplier = config.useTiles ? 0.5 : 1.0;
    
    const totalVram = (baseVram + pixelVram * 1000) * tileMultiplier;
    
    // Assume 24GB available VRAM with some buffer
    const safeThreshold = 20 * 1024; // 20GB in MB
    
    if (totalVram > 1024) {
        return {
            estimated: Math.round(totalVram / 1024 * 10) / 10,
            unit: 'GB',
            safe: totalVram < safeThreshold,
        };
    }
    
    return {
        estimated: Math.round(totalVram),
        unit: 'MB',
        safe: totalVram < safeThreshold,
    };
}

/**
 * Upscales a video using ComfyUI
 * 
 * This function queues an upscale job and returns the prompt_id for tracking.
 * The caller should use trackPromptExecution() to monitor progress.
 * 
 * @param settings - Local generation settings with ComfyUI config
 * @param videoPath - Path to the video file or base64 data URL
 * @param config - Upscaling configuration
 * @param onProgress - Progress callback (only for queue phase)
 * @returns Promise resolving to upscale result with prompt_id for tracking
 */
export async function upscaleVideo(
    settings: LocalGenerationSettings,
    videoPath: string,
    config: UpscaleConfig = DEFAULT_UPSCALE_CONFIG,
    onProgress?: (progress: { status: string; percent: number; message: string }) => void
): Promise<UpscaleResult & { promptId?: string }> {
    const startTime = Date.now();
    
    // Validate settings
    if (!isUpscalingSupported(settings)) {
        return {
            success: false,
            error: 'Video upscaling not supported with current settings',
        };
    }
    
    // Validate config
    const validation = validateUpscaleConfig(config);
    if (!validation.valid) {
        return {
            success: false,
            error: `Invalid upscale config: ${validation.errors.join(', ')}`,
        };
    }
    
    // Get upscaler profile
    const profileId = resolveUpscalerProfileId(settings, config);
    if (!profileId) {
        return {
            success: false,
            error: 'No upscaler workflow profile found. Please import it in settings.',
        };
    }
    
    onProgress?.({
        status: 'queuing',
        percent: 0,
        message: `Queueing upscale job (${config.model}, ${config.scaleFactor}x)...`,
    });
    
    try {
        // Provide config via payloads.json (some workflows may use it), while still
        // driving the actual video input through the inputVideo mapping.
        const payload = buildUpscalePayload(videoPath, config);
        const payloads: ComfyUIPromptPayloads = {
            json: JSON.stringify(payload),
            text: `Upscale video ${config.scaleFactor}x using ${config.model}`,
            structured: [],
            negativePrompt: ""
        };

        // Queue the upscale job (do NOT wait for completion; callers track via promptId)
        const result = await queueComfyUIPromptWithQueue(
            settings,
            payloads,
            '', // No keyframe needed for upscaling
            profileId,
            {
                waitForCompletion: false,
                sceneId: 'upscale',
                extraData: {
                    inputVideo: videoPath
                }
            }
        );

        const promptId = (result as { prompt_id?: unknown })?.prompt_id;
        if (typeof promptId === 'string' && promptId.length > 0) {
            onProgress?.({
                status: 'queued',
                percent: 100,
                message: `Upscale job queued (promptId=${promptId})`,
            });
            return {
                success: true,
                promptId,
                processingTimeMs: Date.now() - startTime,
            };
        }

        return {
            success: false,
            error: 'Failed to queue upscale job: no promptId returned',
            processingTimeMs: Date.now() - startTime,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Video upscaling failed: ${errorMessage}`,
            processingTimeMs: Date.now() - startTime,
        };
    }
}

/**
 * Checks if an upscale model is available in ComfyUI
 */
export async function checkUpscaleModelAvailable(
    settings: LocalGenerationSettings,
    modelName: string
): Promise<boolean> {
    try {
        const response = await fetch(`${settings.comfyUIUrl}/object_info/UpscaleModelLoader`);
        if (!response.ok) {
            return false;
        }
        
        const info = await response.json();
        const availableModels = info?.UpscaleModelLoader?.input?.required?.model_name?.[0] || [];
        
        return availableModels.includes(modelName);
    } catch {
        return false;
    }
}

/**
 * Gets list of available upscale models from ComfyUI
 */
export async function getAvailableUpscaleModels(
    settings: LocalGenerationSettings
): Promise<string[]> {
    try {
        const response = await fetch(`${settings.comfyUIUrl}/object_info/UpscaleModelLoader`);
        if (!response.ok) {
            return [];
        }
        
        const info = await response.json();
        return info?.UpscaleModelLoader?.input?.required?.model_name?.[0] || [];
    } catch {
        return [];
    }
}
