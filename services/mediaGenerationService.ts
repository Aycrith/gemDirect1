import { ApiLogCallback, ApiStateChangeCallback } from './geminiService';
import * as geminiService from './geminiService';
import { Shot, CreativeEnhancers, LocalGenerationSettings } from '../types';
import { generateSceneKeyframeLocally, generateShotImageLocally } from './comfyUIService';
import { getGenerationQueue, createKeyframeTask, createImageTask, GenerationStatus } from './generationQueue';
import { isFeatureEnabled } from '../utils/featureFlags';

export type MediaGenerationActions = {
    generateKeyframeForScene: (
        vision: string,
        sceneSummary: string,
        sceneId: string | undefined,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    generateImageForShot: (
        shot: Shot,
        enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
        directorsVision: string,
        sceneSummary: string,
        sceneId: string | undefined,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
};

export const LOCAL_COMFY_ID = 'comfyui-local';

const notify = (onStateChange: ApiStateChangeCallback | undefined, status: Parameters<ApiStateChangeCallback>[0], message: string) => {
    onStateChange?.(status, message);
};

const logSuccess = (logApiCall: ApiLogCallback, context: string, model: string) => {
    logApiCall({ context, model, tokens: 0, status: 'success' });
};

const logError = (logApiCall: ApiLogCallback, context: string, model: string) => {
    logApiCall({ context, model, tokens: 0, status: 'error' });
};

const runLocal = async <T>(
    context: string,
    operation: () => Promise<T>,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<T> => {
    try {
        notify(onStateChange, 'loading', `Generating locally: ${context}...`);
        const result = await operation();
        notify(onStateChange, 'success', `${context} generated via local engine.`);
        logSuccess(logApiCall, `${context} (local)`, LOCAL_COMFY_ID);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Local generation failed.';
        notify(onStateChange, 'error', message);
        logError(logApiCall, `${context} (local)`, LOCAL_COMFY_ID);
        throw error;
    }
};

const geminiActions: MediaGenerationActions = {
    generateKeyframeForScene: (vision, sceneSummary, _sceneId, logApiCall, onStateChange) =>
        geminiService.generateKeyframeForScene(vision, sceneSummary, logApiCall, onStateChange),
    generateImageForShot: (shot, enhancers, directorsVision, sceneSummary, _sceneId, logApiCall, onStateChange) =>
        geminiService.generateImageForShot(shot, enhancers ?? {}, directorsVision, sceneSummary, logApiCall, onStateChange)
};

const createLocalActions = (settings?: LocalGenerationSettings): MediaGenerationActions => {
    const ensureSettings = (): LocalGenerationSettings => {
        if (!settings) {
            throw new Error('Local generation settings not configured. Please configure in Settings.');
        }
        
        if (!settings.comfyUIUrl) {
            throw new Error('ComfyUI server URL not configured. Please configure in Settings → ComfyUI Settings.');
        }
        
        // Check if we have either a direct workflowJson OR workflow profiles with at least one configured profile
        const hasDirectWorkflow = Boolean(settings.workflowJson);
        const hasWorkflowProfiles = Boolean(
            settings.workflowProfiles && 
            Object.keys(settings.workflowProfiles).length > 0 &&
            Object.values(settings.workflowProfiles).some(profile => profile.workflowJson)
        );
        
        if (!hasDirectWorkflow && !hasWorkflowProfiles) {
            throw new Error('No ComfyUI workflows configured for local generation. To use ComfyUI: Settings → ComfyUI Settings → Import from File. Or skip keyframes and use "Export Prompts" to generate elsewhere.');
        }
        
        return settings;
    };

    // Check if GenerationQueue is enabled for VRAM-safe serial execution
    const useQueue = isFeatureEnabled(settings?.featureFlags, 'useGenerationQueue');

    return {
        generateKeyframeForScene: (vision, sceneSummary, sceneId, logApiCall, onStateChange) => {
            const executeKeyframe = () => generateSceneKeyframeLocally(ensureSettings(), vision, sceneSummary, sceneId);
            
            if (useQueue) {
                // Route through GenerationQueue for VRAM-safe serial execution
                const queue = getGenerationQueue();
                const task = createKeyframeTask(
                    () => runLocal('generate scene keyframe', executeKeyframe, logApiCall, onStateChange),
                    {
                        sceneId: sceneId || 'unknown',
                        priority: 'normal',
                        onStatusChange: (status: GenerationStatus) => {
                            if (status === 'pending') {
                                onStateChange?.('loading', 'Queued for generation...');
                            }
                        },
                    }
                );
                console.log(`[MediaGeneration] Queueing keyframe for scene ${sceneId} via GenerationQueue`);
                return queue.enqueue(task);
            }
            
            // Direct execution (legacy behavior)
            return runLocal('generate scene keyframe', executeKeyframe, logApiCall, onStateChange);
        },
        generateImageForShot: (shot, enhancers, directorsVision, sceneSummary, sceneId, logApiCall, onStateChange) => {
            const executeImage = () => generateShotImageLocally(ensureSettings(), shot, enhancers, directorsVision, sceneSummary, sceneId);
            
            if (useQueue) {
                // Route through GenerationQueue for VRAM-safe serial execution
                const queue = getGenerationQueue();
                const task = createImageTask(
                    () => runLocal('generate shot image', executeImage, logApiCall, onStateChange),
                    {
                        sceneId: sceneId || 'unknown',
                        shotId: shot.id,
                        priority: 'normal',
                        onStatusChange: (status: GenerationStatus) => {
                            if (status === 'pending') {
                                onStateChange?.('loading', 'Queued for generation...');
                            }
                        },
                    }
                );
                console.log(`[MediaGeneration] Queueing image for shot ${shot.id} via GenerationQueue`);
                return queue.enqueue(task);
            }
            
            // Direct execution (legacy behavior)
            return runLocal('generate shot image', executeImage, logApiCall, onStateChange);
        }
    };
};

export const createMediaGenerationActions = (providerId: string, localSettings?: LocalGenerationSettings): MediaGenerationActions => {
    if (providerId === LOCAL_COMFY_ID) {
        return createLocalActions(localSettings);
    }
    return geminiActions;
};

export type { ApiLogCallback, ApiStateChangeCallback };
