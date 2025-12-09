/**
 * FastVideo Service
 * Browser-side adapter for local FastVideo HTTP server
 * Mirrors ComfyUI service patterns for consistency
 */

import { LocalGenerationSettings } from '../types';

export interface FastVideoGenerateRequest {
    prompt: string;
    negativePrompt?: string;
    keyframeBase64?: string;
    fps: number;
    numFrames: number;
    width: number;
    height: number;
    seed?: number;
    outputDir: string;
}

export interface FastVideoGenerateResponse {
    status: 'complete' | 'error';
    outputVideoPath?: string;
    frames?: number;
    durationMs?: number;
    seed?: number;
    warnings?: string[];
    error?: string;
}

export interface FastVideoHealthResponse {
    status: string;
    service: string;
    modelId: string;
    modelLoaded: boolean;
    attentionBackend: string;
}

/**
 * Check FastVideo server health
 */
export const checkFastVideoHealth = async (
    settings: LocalGenerationSettings
): Promise<FastVideoHealthResponse> => {
    const endpointUrl = settings.fastVideo?.endpointUrl || 'http://127.0.0.1:8055';
    const url = `${endpointUrl}/health`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });

        if (!response) {
            throw new Error('No response received from FastVideo server');
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error: unknown) {
        const err = error as Error;
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
            throw new Error('FastVideo server timeout - is it running?');
        }
        throw new Error(`FastVideo health check failed: ${err.message || 'Unknown error'}`);
    }
};

/**
 * Write telemetry summary to artifacts directory
 */
const writeTelemetrySummary = async (
    summary: Record<string, any>,
    _outputDir: string
): Promise<void> => {
    try {
        // In browser environment, log to console (can't write files directly)
        // In Node/test environment, this could be extended to write to filesystem
        console.log('[FastVideo Telemetry]', JSON.stringify(summary, null, 2));
        
        // Store in sessionStorage for debugging
        try {
            const key = `fastvideo_telemetry_${Date.now()}`;
            sessionStorage.setItem(key, JSON.stringify(summary));
            
            // Keep only last 10 entries
            const keys = Object.keys(sessionStorage)
                .filter(k => k.startsWith('fastvideo_telemetry_'))
                .sort()
                .reverse();
            
            keys.slice(10).forEach(k => sessionStorage.removeItem(k));
        } catch (storageError) {
            // SessionStorage might be full or disabled
        }
    } catch (error) {
        console.warn('[FastVideo] Failed to write telemetry:', error);
    }
};

/**
 * Queue a FastVideo generation request
 * 
 * @param settings Local generation settings with FastVideo config
 * @param prompt Human-readable text prompt
 * @param negativePrompt Optional negative prompt
 * @param keyframeBase64 Optional base64 keyframe for TI2V (with or without data URL prefix)
 * @param logCallback Optional logging callback
 * @returns Generation result with output path
 */
export const queueFastVideoPrompt = async (
    settings: LocalGenerationSettings,
    prompt: string,
    negativePrompt?: string,
    keyframeBase64?: string,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<FastVideoGenerateResponse> => {
    const log = logCallback || console.log;
    const fastVideoConfig = settings.fastVideo;
    const requestId = `fv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!fastVideoConfig) {
        throw new Error('FastVideo configuration missing in settings');
    }

    const endpointUrl = fastVideoConfig.endpointUrl || 'http://127.0.0.1:8055';
    const url = `${endpointUrl}/generate`;

    // Build request payload
    const payload: FastVideoGenerateRequest = {
        prompt,
        negativePrompt,
        keyframeBase64,
        fps: fastVideoConfig.fps,
        numFrames: fastVideoConfig.numFrames,
        width: fastVideoConfig.width,
        height: fastVideoConfig.height,
        seed: fastVideoConfig.seed,
        outputDir: fastVideoConfig.outputDir
    };

    // Telemetry tracking
    const telemetry: Record<string, any> = {
        requestId,
        timestamp: new Date().toISOString(),
        provider: 'fastvideo-local',
        config: {
            fps: payload.fps,
            numFrames: payload.numFrames,
            resolution: `${payload.width}x${payload.height}`,
            hasKeyframe: !!keyframeBase64,
            seed: payload.seed
        },
        promptLength: prompt.length,
        negativePromptLength: negativePrompt?.length || 0
    };

    log(`[FastVideo] Request ${requestId}: ${payload.numFrames} frames @ ${payload.fps} FPS`, 'info');
    log(`[FastVideo] Endpoint: ${url}`, 'info');

    const startTime = Date.now();
    try {
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            // Long timeout for video generation (10 minutes)
            signal: AbortSignal.timeout(600000)
        });

        const elapsed = Date.now() - startTime;
        log(`[FastVideo] Response received (${elapsed}ms)`, 'info');

        if (!response) {
            throw new Error('No response received from FastVideo server');
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            
            try {
                const errorJson = JSON.parse(errorText);
                errorMsg = errorJson.detail || errorJson.error || errorMsg;
            } catch {
                errorMsg = errorText || errorMsg;
            }

            // Handle specific HTTP error codes
            if (response.status === 507) {
                log('[FastVideo] CUDA OOM - reduce numFrames or resolution', 'error');
            } else if (response.status === 500) {
                log('[FastVideo] Server error - check adapter logs', 'error');
            }

            throw new Error(errorMsg);
        }

        const result: FastVideoGenerateResponse = await response.json();

        if (result.status === 'error') {
            telemetry.status = 'error';
            telemetry.error = result.error;
            telemetry.durationMs = elapsed;
            await writeTelemetrySummary(telemetry, fastVideoConfig.outputDir);
            
            log(`[FastVideo] Generation failed: ${result.error}`, 'error');
            throw new Error(result.error || 'Unknown generation error');
        }

        // Success - update telemetry
        telemetry.status = 'complete';
        telemetry.durationMs = elapsed;
        telemetry.outputVideoPath = result.outputVideoPath;
        telemetry.actualFrames = result.frames;
        telemetry.actualSeed = result.seed;
        telemetry.warnings = result.warnings || [];
        
        await writeTelemetrySummary(telemetry, fastVideoConfig.outputDir);

        log(`[FastVideo] Generation complete: ${result.outputVideoPath}`, 'info');
        log(`[FastVideo] Telemetry saved (ID: ${requestId})`, 'info');
        
        if (result.warnings && result.warnings.length > 0) {
            result.warnings.forEach(warning => log(`[FastVideo] Warning: ${warning}`, 'warn'));
        }

        return result;

    } catch (error: unknown) {
        const err = error as Error;
        telemetry.status = 'error';
        telemetry.durationMs = Date.now() - startTime;
        telemetry.error = err.message || 'Unknown error';
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
            log('[FastVideo] Generation timeout (10 min) - server may still be processing', 'error');
            throw new Error('FastVideo generation timeout - try reducing numFrames or resolution');
        }

        if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
            log('[FastVideo] Network error - is server running?', 'error');
            telemetry.error = 'Cannot connect to FastVideo server';
            await writeTelemetrySummary(telemetry, fastVideoConfig.outputDir);
            throw new Error('Cannot connect to FastVideo server - run scripts/run-fastvideo-server.ps1');
        }

        await writeTelemetrySummary(telemetry, fastVideoConfig.outputDir);
        log(`[FastVideo] Error: ${err.message}`, 'error');
        throw err;
    }
};

/**
 * Strip data URL prefix from base64 string if present
 * (Useful for ensuring clean base64 before sending to adapter)
 */
export const stripDataUrlPrefix = (base64: string): string => {
    if (base64.startsWith('data:')) {
        return base64.split(',', 2)[1] || base64;
    }
    return base64;
};

/**
 * Validate FastVideo configuration
 * Returns array of validation errors (empty if valid)
 */
export const validateFastVideoConfig = (settings: LocalGenerationSettings): string[] => {
    const errors: string[] = [];
    const config = settings.fastVideo;

    if (!config) {
        errors.push('FastVideo configuration is missing');
        return errors;
    }

    if (!config.endpointUrl) {
        errors.push('FastVideo endpoint URL is required');
    } else if (!config.endpointUrl.startsWith('http://') && !config.endpointUrl.startsWith('https://')) {
        errors.push('FastVideo endpoint URL must start with http:// or https://');
    }

    if (!config.modelId || config.modelId.trim() === '') {
        errors.push('FastVideo model ID is required');
    }

    if (config.fps < 8 || config.fps > 30) {
        errors.push('FastVideo FPS must be between 8 and 30');
    }

    if (config.numFrames < 8 || config.numFrames > 300) {
        errors.push('FastVideo numFrames must be between 8 and 300');
    }

    if (config.width < 256 || config.width > 1920) {
        errors.push('FastVideo width must be between 256 and 1920');
    }

    if (config.height < 256 || config.height > 1080) {
        errors.push('FastVideo height must be between 256 and 1080');
    }

    if (!config.outputDir || config.outputDir.trim() === '') {
        errors.push('FastVideo output directory is required');
    }

    return errors;
};
