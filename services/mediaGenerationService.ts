import { ApiLogCallback, ApiStateChangeCallback } from './geminiService';
import * as geminiService from './geminiService';
import { Shot, CreativeEnhancers, LocalGenerationSettings } from '../types';
import { generateSceneKeyframeLocally, generateShotImageLocally } from './comfyUIService';

export type MediaGenerationActions = {
    generateKeyframeForScene: (
        vision: string,
        sceneSummary: string,
        sceneId?: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
    generateImageForShot: (
        shot: Shot,
        enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
        directorsVision: string,
        sceneSummary: string,
        sceneId?: string,
        logApiCall: ApiLogCallback,
        onStateChange?: ApiStateChangeCallback
    ) => Promise<string>;
};

const GEMINI_PROVIDER_ID = 'gemini-image';
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
    generateKeyframeForScene: (vision, sceneSummary, sceneId, logApiCall, onStateChange) =>
        geminiService.generateKeyframeForScene(vision, sceneSummary, logApiCall, onStateChange),
    generateImageForShot: (shot, enhancers, directorsVision, sceneSummary, sceneId, logApiCall, onStateChange) =>
        geminiService.generateImageForShot(shot, enhancers, directorsVision, sceneSummary, logApiCall, onStateChange)
};

const createLocalActions = (settings?: LocalGenerationSettings): MediaGenerationActions => {
    const ensureSettings = (): LocalGenerationSettings => {
        if (!settings || !settings.comfyUIUrl || !settings.workflowJson) {
            throw new Error('Local generation settings are incomplete. Please configure ComfyUI in Settings.');
        }
        return settings;
    };

    return {
        generateKeyframeForScene: (vision, sceneSummary, sceneId, logApiCall, onStateChange) =>
            runLocal(
                'generate scene keyframe',
                () => generateSceneKeyframeLocally(ensureSettings(), vision, sceneSummary, sceneId),
                logApiCall,
                onStateChange
            ),
        generateImageForShot: (shot, enhancers, directorsVision, sceneSummary, sceneId, logApiCall, onStateChange) =>
            runLocal(
                'generate shot image',
                () => generateShotImageLocally(ensureSettings(), shot, enhancers, directorsVision, sceneSummary, sceneId),
                logApiCall,
                onStateChange
            )
    };
};

export const createMediaGenerationActions = (providerId: string, localSettings?: LocalGenerationSettings): MediaGenerationActions => {
    if (providerId === LOCAL_COMFY_ID) {
        return createLocalActions(localSettings);
    }
    return geminiActions;
};

export type { ApiLogCallback, ApiStateChangeCallback };
