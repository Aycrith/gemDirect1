import { ApiLogCallback, ApiStateChangeCallback } from './geminiService';
import * as geminiService from './geminiService';
import { Shot, CreativeEnhancers, LocalGenerationSettings } from '../types';
import { generateSceneKeyframeLocally, generateShotImageLocally } from './comfyUIService';

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
