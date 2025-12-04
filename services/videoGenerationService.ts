import { TimelineData, LocalGenerationSettings, Shot } from '../types';
import { base64ToBlob } from '../utils/videoUtils';
import type { ArtifactSceneMetadata, SceneVideoMetadata } from '../utils/hooks';
import { isFeatureEnabled, FeatureFlags } from '../utils/featureFlags';
import { getGenerationQueue, createVideoTask, GenerationStatus } from './generationQueue';
import {
    startPipeline,
    recordShotQueued,
    recordShotCompleted,
    completePipeline,
    type PipelineMetrics,
} from './pipelineMetrics';
import { checkSystemResources } from './comfyUIService';

/**
 * Generates a structured JSON payload and a human-readable text prompt from timeline data.
 * @param timeline The scene's timeline data.
 * @param directorsVision The overall visual style guide.
 * @param sceneSummary A brief summary of the scene's purpose.
 * @returns An object containing both the JSON payload and a human-readable text prompt.
 */
export const generateVideoRequestPayloads = (
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string
): { json: string; text: string } => {

    const interleavedTimeline = timeline.shots.reduce((acc: any[], shot, index) => {
        const shotData = {
            type: 'shot',
            shot_number: index + 1,
            description: shot.description,
            enhancers: timeline.shotEnhancers[shot.id] || {}
        };
        acc.push(shotData);

        if (index < timeline.transitions.length) {
            const transitionData = {
                type: 'transition',
                transition_type: timeline.transitions[index]
            };
            acc.push(transitionData);
        }

        return acc;
    }, []);

    const payload = {
        request_metadata: {
            tool: "Cinematic Story Generator",
            timestamp: new Date().toISOString(),
            description: "This payload is designed for use with an external video generation model (e.g., via LM Studio, ComfyUI, or another API)."
        },
        generation_config: {
            scene_summary: sceneSummary,
            directors_vision: directorsVision,
            global_negative_prompt: timeline.negativePrompt
        },
        timeline: interleavedTimeline
    };

    const json = JSON.stringify(payload, null, 2);
    const text = generateHumanReadablePrompt(timeline, directorsVision, sceneSummary);

    return { json, text };
};

/**
 * Creates a human-readable, narrative prompt from the timeline data.
 * @param timeline The scene's timeline data.
 * @param directorsVision The overall visual style guide.
 * @param sceneSummary A brief summary of the scene's purpose.
 * @returns A formatted string suitable for use as a descriptive prompt.
 */
export const generateHumanReadablePrompt = (
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string
): string => {
    let prompt = `Create a cinematic sequence. The scene is about: "${sceneSummary}". The overall visual style should be "${directorsVision}".\n\n`;

    timeline.shots.forEach((shot, index) => {
        prompt += `Shot ${index + 1}: ${shot.description}`;
        const enhancers = timeline.shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            const enhancerText = Object.entries(enhancers)
                .map(([key, value]) => {
                    if (Array.isArray(value) && value.length > 0) {
                        return `${key}: ${value.join(', ')}`;
                    }
                    return null;
                })
                .filter(Boolean)
                .join('; ');
            if (enhancerText) {
                prompt += ` (Style: ${enhancerText})`;
            }
        }
        prompt += '.\n';

        if (index < timeline.transitions.length) {
            prompt += `\n--[${timeline.transitions[index]}]-->\n\n`;
        }
    });

    if (timeline.negativePrompt) {
        prompt += `\nGlobal Style & Negative Prompt: ${timeline.negativePrompt}`;
    }

    return prompt.trim();
};


/**
 * Constructs and sends a generation request to a ComfyUI server based on a synced workflow.
 * This function includes robust pre-flight checks to ensure configuration is valid before queuing.
 * @param settings The local generation settings, including URL, workflow, and mapping.
 * @param payloads The generated JSON and text prompts.
 * @param base64Image The base64-encoded keyframe image.
 * @returns The server's response after queueing the prompt.
 */
export const queueComfyUIPrompt = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string },
    base64Image: string,
): Promise<any> => {
    
    // --- PRE-FLIGHT CHECK 1: Basic Configuration ---
    if (!settings.comfyUIUrl) {
        throw new Error("ComfyUI server address is not configured. Please set it in Settings.");
    }
    if (!settings.workflowJson) {
        throw new Error("Workflow not synced. Please configure and sync it in Settings.");
    }

    // --- PRE-FLIGHT CHECK 2: Workflow & Mapping Validity ---
    let workflowApi;
    try {
        workflowApi = JSON.parse(settings.workflowJson);
    } catch (e) {
        throw new Error("The synced workflow is not valid JSON. Please re-sync your workflow in Settings.");
    }

    const promptPayloadTemplate = workflowApi.prompt || workflowApi;
    if (typeof promptPayloadTemplate !== 'object' || promptPayloadTemplate === null) {
        throw new Error("Synced workflow has an invalid structure. Please re-sync.");
    }

    // Verify that all mapped inputs still exist in the workflow.
    for (const [key, dataType] of Object.entries(settings.mapping)) {
        if (dataType === 'none') continue;

        const parts = key.split(':');
        const nodeId = parts[0];
        const inputName = parts[1];
        if (!nodeId || !inputName) continue;
        
        const node = promptPayloadTemplate[nodeId];

        if (!node) {
            throw new Error(`Configuration Mismatch: Mapped node ID '${nodeId}' not found in your workflow. Please re-sync your workflow in Settings.`);
        }
        if (!node.inputs || typeof node.inputs[inputName] === 'undefined') {
            const nodeTitle = node._meta?.title || `Node ${nodeId}`;
            throw new Error(`Configuration Mismatch: Mapped input '${inputName}' not found on node '${nodeTitle}'. Please re-sync your workflow in Settings.`);
        }
    }
    
    // --- ALL CHECKS PASSED, PROCEED WITH GENERATION ---
    try {
        // Deep copy the prompt object to avoid modifying the stored settings object.
        const promptPayload = JSON.parse(JSON.stringify(promptPayloadTemplate));
        const baseUrl = settings.comfyUIUrl.endsWith('/') ? settings.comfyUIUrl : `${settings.comfyUIUrl}/`;
        
        let uploadedImageFilename: string | null = null;
        
        // --- STEP 1: UPLOAD ASSETS (IF MAPPED) ---
        const imageMappingKey = Object.keys(settings.mapping).find(key => settings.mapping[key] === 'keyframe_image');
        if (imageMappingKey) {
            const nodeId = imageMappingKey.split(':')[0];
            if (!nodeId) throw new Error('Invalid mapping key format for keyframe_image');
            const node = promptPayload[nodeId];

            if (node && node.class_type === 'LoadImage') {
                const blob = base64ToBlob(base64Image, 'image/jpeg');
                const formData = new FormData();
                formData.append('image', blob, `csg_keyframe_${Date.now()}.jpg`);
                formData.append('overwrite', 'true');
                
                const uploadResponse = await fetch(`${baseUrl}upload/image`, {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadResponse.ok) throw new Error(`Failed to upload image to ComfyUI. Status: ${uploadResponse.status}`);
                const uploadResult = await uploadResponse.json();
                uploadedImageFilename = uploadResult.name;
            }
        }

        // --- STEP 2: INJECT DATA INTO WORKFLOW BASED ON MAPPING ---
        for (const [key, dataType] of Object.entries(settings.mapping)) {
            if (dataType === 'none') continue;

            const parts = key.split(':');
            const nodeId = parts[0];
            const inputName = parts[1];
            if (!nodeId || !inputName) continue;
            
            const node = promptPayload[nodeId];
            
            if (node && node.inputs) {
                let dataToInject: any = null;
                switch (dataType) {
                    case 'human_readable_prompt':
                        dataToInject = payloads.text;
                        break;
                    case 'full_timeline_json':
                        dataToInject = payloads.json;
                        break;
                    case 'keyframe_image':
                        if (uploadedImageFilename && node.class_type === 'LoadImage') {
                             dataToInject = uploadedImageFilename;
                        } else {
                            dataToInject = base64Image;
                        }
                        break;
                }
                if (dataToInject !== null) {
                    node.inputs[inputName] = dataToInject;
                }
            }
        }
        
        // --- STEP 3: QUEUE THE PROMPT ---
        const body = JSON.stringify({ prompt: promptPayload, client_id: settings.comfyUIClientId });
        const response = await fetch(`${baseUrl}prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!response.ok) {
            let errorMessage = `ComfyUI server responded with status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage += ` - ${errorData.error?.message || JSON.stringify(errorData)}`;
            } catch (e) { /* ignore json parse error */ }
            throw new Error(errorMessage);
        }
        return response.json();

    } catch (error) {
        console.error("Error processing ComfyUI request:", error);
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error(`Failed to connect to ComfyUI at '${settings.comfyUIUrl}'. Please check if the server is running and accessible.`);
        }
        throw new Error(`Failed to process ComfyUI workflow. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// ============================================================================
// SceneVideoManager: Manages scene video metadata and provides lifecycle hooks
// ============================================================================

export interface SceneVideoRecord extends SceneVideoMetadata {
    sceneId: string;
}

export interface SceneVideoManager {
    /**
     * Returns a normalized video record for a scene if one exists,
     * otherwise null. This is a pure read helper that assumes another
     * process (ComfyUI/ffmpeg) has already produced the MP4 and updated
     * ArtifactSceneMetadata.Video.
     */
    getSceneVideo(scene: ArtifactSceneMetadata, runDir?: string): SceneVideoRecord | null;

    /**
     * Placeholder for future per-scene regeneration. For now this is a
     * no-op that simply logs a warning so the UI wiring can be completed
     * without requiring the video backend to be present.
     */
    regenerateScene(
        sceneId: string,
        options?: {
            prompt?: string;
            negativePrompt?: string;
        }
    ): Promise<void>;
}

class DefaultSceneVideoManager implements SceneVideoManager {
    getSceneVideo(scene: ArtifactSceneMetadata, runDir?: string): SceneVideoRecord | null {
        const video = scene.Video;
        if (!video || !video.Path) {
            return null;
        }

        const normalizedPath = normalizeVideoPath(video.Path, runDir);

        return {
            sceneId: scene.SceneId,
            Path: normalizedPath,
            Status: video.Status,
            DurationSeconds: video.DurationSeconds,
            UpdatedAt: video.UpdatedAt,
            Error: video.Error,
        };
    }

    async regenerateScene(
        sceneId: string,
        options?: {
            prompt?: string;
            negativePrompt?: string;
        }
    ): Promise<void> {
        // Attempt to call a local regeneration endpoint if available. This is
        // intentionally best-effort; failures are logged but not thrown so the
        // UI remains responsive even when the backend is not running.
        let endpoint = 'http://127.0.0.1:43210/api/scene/regenerate';
        if (typeof window !== 'undefined') {
            const w = window as any;
            if (w.__SCENE_REGEN_ENDPOINT__) {
                endpoint = String(w.__SCENE_REGEN_ENDPOINT__);
            } else if (w.importMetaEnv?.VITE_SCENE_REGEN_ENDPOINT) {
                endpoint = String(w.importMetaEnv.VITE_SCENE_REGEN_ENDPOINT);
            }
        }

        if (typeof fetch !== 'function') {
            // eslint-disable-next-line no-console
            console.warn(
                `[SceneVideoManager] regenerateScene("${sceneId}") requested but fetch is not available; ` +
                    'ensure this is called from a browser environment.'
            );
            return;
        }

        try {
            const payload: Record<string, unknown> = { sceneId };
            if (options?.prompt !== undefined) {
                payload.prompt = options.prompt;
            }
            if (options?.negativePrompt !== undefined) {
                payload.negativePrompt = options.negativePrompt;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[SceneVideoManager] regenerateScene("${sceneId}") failed: ` +
                        `HTTP ${response.status} ${response.statusText}`
                );
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
                `[SceneVideoManager] regenerateScene("${sceneId}") error: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }
}

function normalizeVideoPath(path: string, runDir?: string): string {
    // If the path looks absolute (starts with http or a drive), return as-is.
    if (/^https?:\/\//i.test(path) || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')) {
        return path;
    }

    if (!runDir) {
        return path.replace(/\\/g, '/');
    }

    const trimmedRunDir = runDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const trimmedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');

    return `${trimmedRunDir}/${trimmedPath}`;
}

let sceneVideoManager: SceneVideoManager | null = null;

export function getSceneVideoManager(): SceneVideoManager {
    if (!sceneVideoManager) {
        sceneVideoManager = new DefaultSceneVideoManager();
    }
    return sceneVideoManager;
}

export function resetSceneVideoManager(): void {
    sceneVideoManager = null;
}

/**
 * Queue video generation with automatic provider routing
 * Routes to ComfyUI or FastVideo based on settings.videoProvider
 * 
 * @param settings Local generation settings
 * @param payloads Generated payloads (JSON and text prompts)
 * @param base64Image Keyframe image (base64)
 * @param profileId Workflow profile ID (ComfyUI only)
 * @param logCallback Optional logging callback
 * @returns Provider-specific response
 */
export const queueVideoGeneration = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string; structured?: any[]; negativePrompt?: string },
    base64Image: string,
    profileId?: string,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<any> => {
    const provider = settings.videoProvider || 'comfyui-local';
    const log = logCallback || console.log;

    log(`[VideoGen] Using provider: ${provider}`, 'info');

    if (provider === 'fastvideo-local') {
        // Route to FastVideo
        const { queueFastVideoPrompt, stripDataUrlPrefix, validateFastVideoConfig } = await import('./fastVideoService');
        
        // Validate FastVideo configuration
        const errors = validateFastVideoConfig(settings);
        if (errors.length > 0) {
            throw new Error(`FastVideo configuration invalid:\n${errors.join('\n')}`);
        }

        // Extract prompt and negative prompt
        const prompt = payloads.text || payloads.json;
        const negativePrompt = payloads.negativePrompt || '';
        const cleanedImage = base64Image ? stripDataUrlPrefix(base64Image) : undefined;

        log(`[VideoGen] Queuing FastVideo generation`, 'info');
        
        return await queueFastVideoPrompt(
            settings,
            prompt,
            negativePrompt,
            cleanedImage,
            logCallback
        );
    } else {
        // Default: Route to ComfyUI
        log(`[VideoGen] Queuing ComfyUI generation (profile: ${profileId || 'default'})`, 'info');
        
        // Import ComfyUI service dynamically to avoid circular dependency
        const { queueComfyUIPrompt: comfyUIQueue } = await import('./comfyUIService');
        
        // Ensure all required fields for ComfyUI are present
        const fullPayloads = {
            json: payloads.json,
            text: payloads.text,
            structured: payloads.structured || [],
            negativePrompt: payloads.negativePrompt || ''
        };
        
        return await comfyUIQueue(
            settings,
            fullPayloads,
            base64Image,
            profileId
        );
    }
};

// ============================================================================
// Queue-Aware Video Generation (Feature Flag Controlled)
// ============================================================================

export interface QueuedVideoGenerationOptions {
    /** Scene ID for task tracking */
    sceneId: string;
    /** Shot ID for task tracking */
    shotId?: string;
    /** Feature flags to check useGenerationQueue */
    featureFlags?: FeatureFlags;
    /** Logging callback */
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void;
    /** Progress callback for queue status updates */
    onProgress?: (progress: number, message?: string) => void;
    /** Status change callback */
    onStatusChange?: (status: GenerationStatus) => void;
}

/**
 * Queue video generation with optional GenerationQueue routing.
 * 
 * When `useGenerationQueue` feature flag is enabled:
 * - Routes through serial GenerationQueue to prevent VRAM exhaustion
 * - Provides automatic retry and circuit breaker patterns
 * - Tracks progress and status changes
 * 
 * When disabled:
 * - Falls back to direct queueVideoGeneration (existing behavior)
 * 
 * @param settings Local generation settings
 * @param payloads Generated payloads (JSON and text prompts)
 * @param base64Image Keyframe image (base64)
 * @param profileId Workflow profile ID (ComfyUI only)
 * @param options Queue-aware options including feature flags
 * @returns Provider-specific response
 */
export const queueVideoGenerationWithQueue = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string; structured?: any[]; negativePrompt?: string },
    base64Image: string,
    profileId?: string,
    options?: QueuedVideoGenerationOptions
): Promise<any> => {
    const useQueue = isFeatureEnabled(options?.featureFlags, 'useGenerationQueue');
    const log = options?.logCallback || console.log;
    
    if (!useQueue) {
        // Feature flag disabled: fall back to direct generation
        log('[VideoGen] GenerationQueue disabled by feature flag, using direct generation', 'info');
        return await queueVideoGeneration(settings, payloads, base64Image, profileId, options?.logCallback);
    }
    
    // Feature flag enabled: route through GenerationQueue
    log('[VideoGen] GenerationQueue enabled, queueing video generation task', 'info');
    
    const queue = getGenerationQueue();
    
    const task = createVideoTask(
        () => queueVideoGeneration(settings, payloads, base64Image, profileId, options?.logCallback),
        {
            sceneId: options?.sceneId || 'unknown',
            shotId: options?.shotId,
            priority: 'normal',
            onProgress: options?.onProgress,
            onStatusChange: options?.onStatusChange,
        }
    );
    
    return await queue.enqueue(task);
};

// ============================================================================
// Chain-of-Frames Scene Video Generation
// ============================================================================

export interface ChainedVideoGenerationOptions {
    /** Scene ID for task tracking */
    sceneId: string;
    /** Director's vision for consistent styling */
    directorsVision: string;
    /** Scene summary for context */
    sceneSummary: string;
    /** Scene keyframe image (base64) - used as start frame for first shot */
    sceneKeyframe: string;
    /** Feature flags */
    featureFlags?: FeatureFlags;
    /** Logging callback */
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void;
    /** Progress callback */
    onProgress?: (shotIndex: number, totalShots: number, message?: string) => void;
    /** Enable VRAM gating - waits for sufficient VRAM before each shot (default: false) */
    enableVramGating?: boolean;
    /** Minimum free VRAM in MB required before starting a shot (default: 4096) */
    minVramMb?: number;
    /** Maximum time to wait for VRAM to be available in ms (default: 60000) */
    vramWaitTimeoutMs?: number;
    /** Enable circuit breaker - stops after consecutive failures (default: true) */
    enableCircuitBreaker?: boolean;
    /** Number of consecutive failures before stopping (default: 3) */
    circuitBreakerThreshold?: number;
}

export interface ChainedVideoResult {
    /** Shot ID */
    shotId: string;
    /** Video data (base64) */
    videoData?: string;
    /** Video path (if saved to disk) */
    videoPath?: string;
    /** Error message if generation failed */
    error?: string;
    /** Last frame of this video (base64) - used as start frame for next shot */
    lastFrame?: string;
    /** Time from queue to completion (ms) */
    durationMs?: number;
    /** Time spent waiting in queue (ms) */
    queueWaitMs?: number;
}

/** Extended result including pipeline metrics */
export interface ChainedVideoGenerationResult {
    results: ChainedVideoResult[];
    metrics: PipelineMetrics;
}

/** Default VRAM gating configuration */
const DEFAULT_MIN_VRAM_MB = 4096;
const DEFAULT_VRAM_WAIT_TIMEOUT_MS = 60000;
const DEFAULT_VRAM_POLL_INTERVAL_MS = 5000;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3;

/**
 * Waits for sufficient VRAM to be available before proceeding.
 * @param comfyUIUrl ComfyUI server URL
 * @param minVramMb Minimum free VRAM required in MB
 * @param timeoutMs Maximum time to wait
 * @param logCallback Logging callback
 * @returns Object with success status and current free VRAM
 */
async function waitForVramAvailable(
    comfyUIUrl: string,
    minVramMb: number,
    timeoutMs: number,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<{ available: boolean; freeVramMb: number }> {
    const log = logCallback || console.log;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const resourceStatus = await checkSystemResources(comfyUIUrl);
            const vramMatch = resourceStatus.match(/Free VRAM:\s*([\d.]+)\s*GB/);
            
            if (vramMatch && vramMatch[1]) {
                const freeVramMb = parseFloat(vramMatch[1]) * 1024;
                
                if (freeVramMb >= minVramMb) {
                    return { available: true, freeVramMb };
                }
                
                log(`[VRAMGate] Waiting for VRAM: ${freeVramMb.toFixed(0)}MB free, need ${minVramMb}MB`, 'info');
            }
        } catch (e) {
            log(`[VRAMGate] Could not check VRAM status: ${e}`, 'warn');
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, DEFAULT_VRAM_POLL_INTERVAL_MS));
    }
    
    log(`[VRAMGate] Timeout waiting for VRAM after ${timeoutMs}ms`, 'warn');
    return { available: false, freeVramMb: 0 };
}

/**
 * Generates videos for all shots in a scene using chain-of-frames approach.
 * Each shot's video starts from the last frame of the previous shot's video,
 * ensuring visual coherence (same characters, environments, lighting) across the scene.
 * 
 * Flow:
 * 1. Shot 1: Uses scene keyframe as start_image → generates video → extracts last frame
 * 2. Shot 2: Uses Shot 1's last frame as start_image → generates video → extracts last frame
 * 3. Shot N: Uses Shot N-1's last frame as start_image → generates video
 * 
 * This eliminates the "morphing monster" problem caused by pixel-based FFmpeg concatenation.
 * 
 * @param settings Local generation settings (must have sceneChainedWorkflowProfile configured)
 * @param shots Array of shots to generate videos for (in order)
 * @param timeline Timeline data for prompt generation
 * @param options Chained generation options
 * @returns Array of generation results for each shot
 */
export const generateSceneVideoChained = async (
    settings: LocalGenerationSettings,
    shots: Shot[],
    timeline: TimelineData,
    options: ChainedVideoGenerationOptions
): Promise<ChainedVideoResult[]> => {
    const log = options.logCallback || ((msg, level) => console.log(`[${level || 'info'}] ${msg}`));
    const results: ChainedVideoResult[] = [];
    
    // Validate configuration
    const chainedProfileId = settings.sceneChainedWorkflowProfile || 'wan-i2v';
    const chainedProfile = settings.workflowProfiles?.[chainedProfileId];
    
    if (!chainedProfile) {
        throw new Error(
            `Scene chained workflow profile '${chainedProfileId}' not found. ` +
            `Please configure it in Settings > Workflow Profiles with mappings for ` +
            `'keyframe_image' (or 'start_image') and 'human_readable_prompt'.`
        );
    }
    
    // Start pipeline metrics tracking
    const pipelineMetrics = startPipeline(options.sceneId, shots.length, chainedProfileId);
    const runId = pipelineMetrics.runId;
    
    log(`[ChainedVideo] Starting chain-of-frames generation for ${shots.length} shots (runId: ${runId})`, 'info');
    log(`[ChainedVideo] Using workflow profile: ${chainedProfileId}`, 'info');
    
    // Get initial GPU VRAM status
    let initialVramBytes: number | undefined;
    try {
        const resourceStatus = await checkSystemResources(settings.comfyUIUrl);
        const vramMatch = resourceStatus.match(/Free VRAM:\s*([\d.]+)\s*GB/);
        if (vramMatch && vramMatch[1]) {
            initialVramBytes = parseFloat(vramMatch[1]) * 1024 * 1024 * 1024;
            log(`[ChainedVideo] Initial free VRAM: ${vramMatch[1]} GB`, 'info');
        }
    } catch (e) {
        log(`[ChainedVideo] Could not get initial VRAM status`, 'warn');
    }
    
    // Track the current start frame (begins with scene keyframe)
    let currentStartFrame = options.sceneKeyframe;
    
    // Circuit breaker state
    const enableCircuitBreaker = options.enableCircuitBreaker !== false; // Default: true
    const circuitBreakerThreshold = options.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    let consecutiveFailures = 0;
    
    // VRAM gating configuration
    const enableVramGating = options.enableVramGating ?? false;
    const minVramMb = options.minVramMb ?? DEFAULT_MIN_VRAM_MB;
    const vramWaitTimeoutMs = options.vramWaitTimeoutMs ?? DEFAULT_VRAM_WAIT_TIMEOUT_MS;
    
    // Dynamic import for frame extraction (only available in Node.js/Electron)
    type ExtractFrameFn = (videoPath: string, outputFormat?: 'png' | 'jpg') => Promise<{ success: boolean; base64Image?: string; error?: string }>;
    let extractLastFrameFn: ExtractFrameFn | null = null;
    try {
        const videoSplicer = await import('../utils/videoSplicer');
        extractLastFrameFn = videoSplicer.extractLastFrame;
    } catch (e) {
        log('[ChainedVideo] Frame extraction not available (browser context)', 'warn');
    }
    
    for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        if (!shot) {
            log(`[ChainedVideo] Shot at index ${i} is undefined, skipping`, 'warn');
            continue;
        }
        
        // Circuit breaker check
        if (enableCircuitBreaker && consecutiveFailures >= circuitBreakerThreshold) {
            log(`[ChainedVideo] Circuit breaker tripped after ${consecutiveFailures} consecutive failures. Stopping pipeline.`, 'error');
            // Record remaining shots as failed
            for (let j = i; j < shots.length; j++) {
                const remainingShot = shots[j];
                if (remainingShot) {
                    recordShotCompleted(runId, remainingShot.id, false, undefined, undefined, 'Circuit breaker tripped');
                    results.push({
                        shotId: remainingShot.id,
                        error: 'Circuit breaker tripped - too many consecutive failures'
                    });
                }
            }
            break;
        }
        
        // VRAM gating check (if enabled)
        if (enableVramGating) {
            options.onProgress?.(i + 1, shots.length, `Checking VRAM availability...`);
            const vramStatus = await waitForVramAvailable(settings.comfyUIUrl, minVramMb, vramWaitTimeoutMs, log);
            
            if (!vramStatus.available) {
                log(`[ChainedVideo] VRAM gating failed for shot ${i + 1} - insufficient memory`, 'error');
                recordShotCompleted(runId, shot.id, false, undefined, undefined, 'Insufficient VRAM');
                results.push({
                    shotId: shot.id,
                    error: `Insufficient VRAM: need ${minVramMb}MB free`
                });
                consecutiveFailures++;
                continue;
            }
            
            log(`[ChainedVideo] VRAM gate passed: ${vramStatus.freeVramMb.toFixed(0)}MB free`, 'info');
        }
        
        options.onProgress?.(i + 1, shots.length, `Generating shot ${i + 1}/${shots.length}: ${shot.description.slice(0, 50)}...`);
        
        log(`[ChainedVideo] Processing shot ${i + 1}/${shots.length}: ${shot.id}`, 'info');
        
        // Record shot queued with initial VRAM
        const shotQueuedAt = Date.now();
        
        try {
            // Generate shot-specific prompt
            const shotPayloads = generateShotPayload(shot, timeline, options.directorsVision, options.sceneSummary, i);
            
            // Prepare the chained payload with start frame
            const chainedPayloads = {
                json: shotPayloads.json,
                text: shotPayloads.text,
                structured: [],
                negativePrompt: timeline.negativePrompt || ''
            };
            
            // Queue the generation with the chain start frame
            const response = await queueVideoGeneration(
                settings,
                chainedPayloads,
                currentStartFrame, // This becomes chain_start_frame in the workflow
                chainedProfileId,
                log
            );
            
            // Record shot queued in metrics
            const promptId = response?.prompt_id;
            recordShotQueued(runId, shot.id, i, promptId, initialVramBytes);
            
            // Calculate queue duration
            const queueCompletedAt = Date.now();
            const queueDurationMs = queueCompletedAt - shotQueuedAt;
            
            // Extract result - this depends on provider / queue format
            const result: ChainedVideoResult = {
                shotId: shot.id,
                durationMs: queueDurationMs,
                queueWaitMs: queueDurationMs, // In async mode, this is the queue time
            };
            
            // Handle response based on format
            if (response?.videoPath && typeof response.videoPath === 'string') {
                // Synchronous completion with a real video path
                result.videoPath = response.videoPath;
                log(`[ChainedVideo] Shot ${i + 1} completed with videoPath: ${response.videoPath} (${queueDurationMs}ms)`, 'info');
                
                // Record successful completion only when we have a real result
                recordShotCompleted(runId, shot.id, true, result.durationMs, result.queueWaitMs);
                consecutiveFailures = 0;
            } else if (promptId) {
                // Async / queued completion – no real file path yet
                result.videoPath = `pending:${promptId}`;
                log(`[ChainedVideo] Shot ${i + 1} queued with prompt_id: ${promptId} (${queueDurationMs}ms)`, 'info');
                // Do NOT record completion or reset the circuit breaker here, since
                // the shot has only been queued and may still fail later.
            }
            
            // If we have a video path and frame extraction is available,
            // extract the last frame for the next shot
            if (result.videoPath && extractLastFrameFn && !result.videoPath.startsWith('pending:')) {
                try {
                    const frameResult = await extractLastFrameFn(result.videoPath);
                    if (frameResult.success && frameResult.base64Image) {
                        result.lastFrame = frameResult.base64Image;
                        currentStartFrame = frameResult.base64Image;
                        log(`[ChainedVideo] Extracted last frame from shot ${i + 1} for chaining`, 'info');
                    } else {
                        log(`[ChainedVideo] Frame extraction returned no image for shot ${i + 1}: ${frameResult.error}`, 'warn');
                    }
                } catch (frameError) {
                    log(`[ChainedVideo] Failed to extract last frame from shot ${i + 1}: ${frameError}`, 'warn');
                    // Continue with scene keyframe if extraction fails
                }
            } else if (result.videoData && extractLastFrameFn) {
                // If we have video data (base64), we'd need to save it first
                // For now, log a warning
                log(`[ChainedVideo] Video data available but needs temp file for frame extraction`, 'warn');
            }
            
            results.push(result);
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(`[ChainedVideo] Failed to generate shot ${i + 1}: ${errorMessage}`, 'error');
            
            // Record failed shot in metrics
            recordShotCompleted(runId, shot.id, false, undefined, undefined, errorMessage);
            
            // Increment consecutive failures for circuit breaker
            consecutiveFailures++;
            
            results.push({
                shotId: shot.id,
                error: errorMessage
            });
            
            // Continue with next shot using scene keyframe as fallback
            // This maintains some coherence even if one shot fails
            currentStartFrame = options.sceneKeyframe;
        }
    }
    
    // Complete pipeline and get final metrics
    const finalMetrics = completePipeline(runId);
    
    const successCount = results.filter(r => !r.error).length;
    log(`[ChainedVideo] Completed: ${successCount}/${shots.length} shots generated successfully`, 'info');
    
    // Log pipeline metrics summary
    if (finalMetrics?.aggregates) {
        log(`[ChainedVideo] Pipeline metrics: avgDuration=${finalMetrics.aggregates.avgShotDurationMs.toFixed(0)}ms, p95=${finalMetrics.aggregates.p95ShotDurationMs.toFixed(0)}ms, total=${finalMetrics.totalDurationMs}ms`, 'info');
    }
    
    return results;
};

/**
 * Generates a prompt payload for a single shot within a chained sequence.
 * @param shot The shot to generate a prompt for
 * @param timeline Full timeline for context
 * @param directorsVision Visual style guide
 * @param sceneSummary Scene context
 * @param shotIndex Index of shot in sequence
 * @returns JSON and text payloads for the shot
 */
function generateShotPayload(
    shot: Shot,
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string,
    shotIndex: number
): { json: string; text: string } {
    // Build a focused prompt for this specific shot
    const enhancers = timeline.shotEnhancers[shot.id] || {};
    const enhancerText = Object.entries(enhancers)
        .map(([key, value]) => {
            if (Array.isArray(value) && value.length > 0) {
                return `${key}: ${value.join(', ')}`;
            }
            return null;
        })
        .filter(Boolean)
        .join('; ');
    
    // Text prompt focused on the single shot
    let text = `${shot.description}`;
    if (enhancerText) {
        text += ` (Style: ${enhancerText})`;
    }
    text += `. Visual style: ${directorsVision}. Scene context: ${sceneSummary}`;
    
    // Add continuity hint for shots after the first
    if (shotIndex > 0) {
        text += `. Continue from previous shot - maintain character consistency and environment.`;
    }
    
    // JSON payload for structured workflows
    const json = JSON.stringify({
        shot_number: shotIndex + 1,
        description: shot.description,
        enhancers: enhancers,
        directors_vision: directorsVision,
        scene_summary: sceneSummary,
        continuity_mode: shotIndex > 0 ? 'chain' : 'start'
    }, null, 2);
    
    return { json, text };
}

/**
 * Waits for a chained video generation to complete and retrieves results.
 * Uses a hybrid approach: WebSocket for real-time updates + polling fallback.
 * This mirrors the robust completion detection from comfyUIService.waitForComfyCompletion.
 * 
 * @param settings Local generation settings
 * @param promptId ComfyUI prompt ID to wait for
 * @param timeoutMs Maximum time to wait (default 5 minutes)
 * @param logCallback Optional logging callback
 * @param onProgress Optional progress callback for WebSocket updates
 * @returns The completed video result
 */
export const waitForChainedVideoComplete = async (
    settings: LocalGenerationSettings,
    promptId: string,
    timeoutMs: number = 300000,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void,
    onProgress?: (status: string, message: string) => void
): Promise<{ videoPath: string; videoData?: string; lastFrame?: string }> => {
    const log = logCallback || console.log;
    const baseUrl = settings.comfyUIUrl.endsWith('/') ? settings.comfyUIUrl : `${settings.comfyUIUrl}/`;
    
    return new Promise((resolve, reject) => {
        // Mutex pattern to prevent dual resolution (WebSocket vs polling)
        let resolutionState: 'pending' | 'resolving' | 'resolved' = 'pending';
        let wsReceivedEvents = false;
        
        const tryResolve = (result: { videoPath: string; videoData?: string; lastFrame?: string }, source: 'websocket' | 'polling'): boolean => {
            if (resolutionState !== 'pending') {
                log(`[ChainedVideo] Ignoring ${source} resolution - already ${resolutionState} for ${promptId.slice(0,8)}...`, 'warn');
                return false;
            }
            resolutionState = 'resolving';
            log(`[ChainedVideo] Resolving via ${source} for ${promptId.slice(0,8)}...`, 'info');
            cleanup();
            resolve(result);
            resolutionState = 'resolved';
            return true;
        };
        
        const tryReject = (error: Error, source: 'websocket' | 'polling' | 'timeout'): boolean => {
            if (resolutionState !== 'pending') {
                log(`[ChainedVideo] Ignoring ${source} rejection - already ${resolutionState} for ${promptId.slice(0,8)}...`, 'warn');
                return false;
            }
            resolutionState = 'resolving';
            log(`[ChainedVideo] Rejecting via ${source} for ${promptId.slice(0,8)}...`, 'error');
            cleanup();
            reject(error);
            resolutionState = 'resolved';
            return true;
        };
        
        const cleanup = () => {
            clearTimeout(timeout);
            clearInterval(pollingInterval);
        };
        
        // Timeout handler
        const timeout = setTimeout(() => {
            tryReject(new Error(`Timeout waiting for prompt ${promptId} after ${timeoutMs}ms`), 'timeout');
        }, timeoutMs);
        
        log(`[ChainedVideo] Waiting for prompt ${promptId.slice(0,8)}... (timeout: ${timeoutMs}ms)`, 'info');
        
        // Polling fallback: Check history API every 2 seconds
        const pollIntervalMs = 2000;
        log(`[ChainedVideo] Starting hybrid completion detection (WebSocket + polling every ${pollIntervalMs}ms)`, 'info');
        
        const pollingInterval = setInterval(async () => {
            if (resolutionState !== 'pending') {
                clearInterval(pollingInterval);
                return;
            }
            
            try {
                const historyResponse = await fetch(`${baseUrl}history/${promptId}`);
                if (!historyResponse.ok) {
                    return; // Not in history yet
                }
                
                const history = await historyResponse.json();
                const promptHistory = history[promptId];
                
                if (!promptHistory) {
                    return; // No history entry yet
                }
                
                // Check for status
                const status = promptHistory.status;
                if (status?.status_str === 'success' && status?.completed) {
                    log(`[ChainedVideo] Polling detected completion for ${promptId.slice(0,8)}... (WebSocket events: ${wsReceivedEvents ? 'received' : 'MISSING'})`, 'info');
                    
                    // Extract video from outputs
                    const outputs = promptHistory.outputs || {};
                    for (const nodeId of Object.keys(outputs)) {
                        const nodeOutput = outputs[nodeId];
                        if (nodeOutput.gifs || nodeOutput.videos) {
                            const videos = nodeOutput.gifs || nodeOutput.videos;
                            if (videos.length > 0) {
                                const video = videos[0];
                                const videoPath = `${baseUrl}view?filename=${video.filename}&subfolder=${video.subfolder || ''}&type=${video.type || 'output'}`;
                                log(`[ChainedVideo] Video complete: ${video.filename}`, 'info');
                                tryResolve({ videoPath }, 'polling');
                                return;
                            }
                        }
                    }
                    
                    tryReject(new Error('Completion detected but no video output found'), 'polling');
                } else if (status?.status_str === 'error') {
                    const errorMsg = status.messages?.find((m: any) => m[0] === 'execution_error')?.[1]?.exception_message || 'ComfyUI execution failed';
                    tryReject(new Error(errorMsg), 'polling');
                }
            } catch (error) {
                // Polling error - continue trying
                log(`[ChainedVideo] Poll error: ${error}`, 'warn');
            }
        }, pollIntervalMs);
        
        // WebSocket tracking for real-time updates
        try {
            // Dynamic import to avoid circular deps
            import('./comfyUIService').then(({ trackPromptExecution }) => {
                trackPromptExecution(settings, promptId, (update) => {
                    wsReceivedEvents = true;
                    
                    // Forward progress updates
                    if (update.status && update.message) {
                        onProgress?.(update.status, update.message);
                    }
                    
                    if (update.status === 'complete' && update.final_output) {
                        const output = update.final_output;
                        // Extract video path from output
                        if (output.videos && output.videos.length > 0 && output.videos[0]) {
                            tryResolve({ 
                                videoPath: output.videos[0], 
                                videoData: output.data 
                            }, 'websocket');
                        } else if (output.data) {
                            tryResolve({ 
                                videoPath: output.filename || 'video.mp4', 
                                videoData: output.data 
                            }, 'websocket');
                        }
                    } else if (update.status === 'error') {
                        tryReject(new Error(update.message || 'ComfyUI generation failed'), 'websocket');
                    }
                });
            }).catch(err => {
                log(`[ChainedVideo] WebSocket tracking failed to initialize: ${err}`, 'warn');
                // Continue with polling-only mode
            });
        } catch (err) {
            log(`[ChainedVideo] WebSocket tracking unavailable, using polling only`, 'warn');
        }
    });
};
