/**
 * Video Upscaling Service
 * 
 * Provides video upscaling as a post-processing step after video generation.
 * Uses ComfyUI upscaler models (Real-ESRGAN, 4x-UltraSharp, etc.).
 * 
 * @module services/videoUpscalingService
 */

import type { LocalGenerationSettings, WorkflowProfile } from '../types';

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
}

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

    // Check if upscaler workflow profile exists
    const profile = settings.workflowProfiles?.['video-upscaler'];
    if (!profile) {
        return false;
    }

    return true;
}

/**
 * Gets the upscaler workflow profile from settings
 */
export function getUpscalerProfile(settings: LocalGenerationSettings): WorkflowProfile | null {
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
    const profile = getUpscalerProfile(settings);
    if (!profile) {
        return {
            success: false,
            error: 'Upscaler workflow profile not configured',
        };
    }
    
    onProgress?.({
        status: 'queuing',
        percent: 0,
        message: `Queueing upscale job (${config.model}, ${config.scaleFactor}x)...`,
    });
    
    try {
        // Import videoGenerationService for safe queueing (avoid circular dependency)
        const { queueComfyUIPromptSafe } = await import('./videoGenerationService');
        
        // Build payload
        const payload = buildUpscalePayload(videoPath, config);
        
        // Queue the upscale job
        // Note: This uses a custom workflow profile for upscaling
        const response = await queueComfyUIPromptSafe(
            settings,
            {
                json: JSON.stringify(payload),
                text: `Upscale video ${config.scaleFactor}x using ${config.model}`,
            },
            '', // No keyframe needed for upscaling
            { sceneId: 'upscale' } // Provide dummy sceneId for queue tracking
        ) as any;
        
        if (!response?.prompt_id) {
            return {
                success: false,
                error: 'Failed to queue upscale job',
            };
        }
        
        onProgress?.({
            status: 'queued',
            percent: 10,
            message: `Upscale job queued: ${response.prompt_id}`,
        });
        
        // Return immediately with prompt_id for caller to track
        // The caller should use trackPromptExecution() to monitor progress
        return {
            success: true,
            promptId: response.prompt_id,
            processingTimeMs: Date.now() - startTime,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: `Upscaling failed: ${errorMessage}`,
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
