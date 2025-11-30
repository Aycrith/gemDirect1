import {
    TimelineData,
    Shot,
    CreativeEnhancers,
    LocalGenerationSettings,
    LocalGenerationStatus,
    StoryBible,
    StoryBibleV2,
    Scene,
    isStoryBibleV2,
} from '../types';
import {
    DEFAULT_NEGATIVE_PROMPT,
    generateTimelineVideos,
    stripDataUrlPrefix,
    VideoGenerationDependencies,
} from './comfyUIService';
import { 
    buildComfyUIPrompt, 
    type ComfyUIPrompt,
} from './promptPipeline';
import { convertToStoryBibleV2 } from './storyBibleConverter';
import type { MediaGenerationActions, ApiLogCallback, ApiStateChangeCallback } from './mediaGenerationService';

export interface SceneShotPlan {
    shot: Shot;
    prompt: string;
    negativePrompt: string;
    enhancers?: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    order: number;
    /** Token-validated prompt from promptPipeline (if storyBible provided) */
    validatedPrompt?: ComfyUIPrompt;
}

export interface SceneShotPlanningResult {
    shots: SceneShotPlan[];
    combinedPrompt: string;
    timelineJson: string;
    /** Validation warnings from prompt pipeline */
    promptWarnings: string[];
}

/**
 * Creates a shot plan using the prompt pipeline for token validation.
 * Story Bible is required for proper character descriptor injection and token enforcement.
 */
export const createSceneShotPlan = (
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string,
    _settings: LocalGenerationSettings,
    /** Story Bible for prompt pipeline token validation (required) */
    storyBible: StoryBible | StoryBibleV2,
    /** Scene for structured prompt generation (required) */
    scene: Scene,
): SceneShotPlanningResult => {
    if (!timeline || !Array.isArray(timeline.shots) || timeline.shots.length === 0) {
        throw new Error('Timeline must include at least one shot before running the generation pipeline.');
    }

    // Ensure we have V2 for character profile access
    const bibleV2 = isStoryBibleV2(storyBible) ? storyBible : convertToStoryBibleV2(storyBible);

    const promptWarnings: string[] = [];

    const shots: SceneShotPlan[] = timeline.shots.map((shot, index) => {
        // Always use prompt pipeline with token validation
        const validatedPrompt = buildComfyUIPrompt(
            bibleV2,
            scene,
            shot,
            directorsVision,
            [timeline.negativePrompt || DEFAULT_NEGATIVE_PROMPT],
            500, // Max tokens per shot
            timeline.shotEnhancers  // Pass entire map so buildComfyUIPrompt can look up by shot.id
        );
        
        // Collect warnings
        if (validatedPrompt.warnings.length > 0) {
            promptWarnings.push(...validatedPrompt.warnings.map(w => `Shot ${index + 1}: ${w}`));
        }
        
        const enhancers = timeline.shotEnhancers[shot.id];
        return {
            shot,
            order: index,
            prompt: validatedPrompt.positive,
            negativePrompt: validatedPrompt.negative,
            enhancers,
            validatedPrompt,
        };
    });

    const combinedPrompt = shots
        .map((plan) => `Shot ${plan.order + 1}: ${plan.prompt}`)
        .concat(`Scene summary: ${sceneSummary}`)
        .join('\n');

    const timelineJson = JSON.stringify(
        {
            summary: sceneSummary,
            directorsVision,
            timeline,
        },
        null,
        2,
    );

    return {
        shots,
        combinedPrompt,
        timelineJson,
        promptWarnings,
    };
};

export interface SceneAssetSynthesisOptions {
    mediaActions: MediaGenerationActions;
    directorsVision: string;
    sceneSummary: string;
    sceneId?: string;
    logApiCall: ApiLogCallback;
    onStateChange?: ApiStateChangeCallback;
}

export interface SceneAssetSynthesisResult {
    keyframes: Record<string, string>;
    errors: Array<{ shotId: string; error: string }>;
}

export const generateKeyframesForPlans = async (
    plans: SceneShotPlan[],
    options: SceneAssetSynthesisOptions,
): Promise<SceneAssetSynthesisResult> => {
    const keyframes: Record<string, string> = {};
    const errors: Array<{ shotId: string; error: string }> = [];

    for (const plan of plans) {
        try {
            const imageData = await options.mediaActions.generateImageForShot(
                plan.shot,
                plan.enhancers,
                options.directorsVision,
                options.sceneSummary,
                options.sceneId,
                options.logApiCall,
                options.onStateChange,
            );
            keyframes[plan.shot.id] = stripDataUrlPrefix(imageData);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            errors.push({ shotId: plan.shot.id, error: reason });
        }
    }

    return { keyframes, errors };
};

export interface ScenePipelineOptions {
    settings: LocalGenerationSettings;
    timeline: TimelineData;
    directorsVision: string;
    sceneSummary: string;
    sceneId?: string;
    mediaActions: MediaGenerationActions;
    logApiCall: ApiLogCallback;
    onStateChange?: ApiStateChangeCallback;
    existingKeyframes?: Record<string, string>;
    dependencies?: {
        generateVideos?: typeof generateTimelineVideos;
        videoDependencies?: VideoGenerationDependencies;
    };
    onShotProgress?: (shotId: string, update: Partial<LocalGenerationStatus>) => void;
    /** Story Bible for prompt pipeline token validation (required) */
    storyBible: StoryBible | StoryBibleV2;
    /** Scene for structured prompt generation (required) */
    scene: Scene;
}

export const runSceneGenerationPipeline = async (
    options: ScenePipelineOptions,
): Promise<{
    plan: SceneShotPlanningResult;
    keyframes: Record<string, string>;
    videoResults: Record<string, { videoPath: string; duration: number; filename: string }>;
    keyframeErrors: Array<{ shotId: string; error: string }>;
    promptWarnings: string[];
}> => {
    const plan = createSceneShotPlan(
        options.timeline, 
        options.directorsVision, 
        options.sceneSummary, 
        options.settings,
        options.storyBible,
        options.scene
    );
    
    // Log any prompt warnings
    if (plan.promptWarnings.length > 0) {
        console.warn('[SceneGenerationPipeline] Prompt warnings:', plan.promptWarnings);
    }
    
    const existingKeyframes = options.existingKeyframes ?? {};

    const missingPlans = plan.shots.filter((shotPlan) => !existingKeyframes[shotPlan.shot.id]);
    let synthesizedKeyframes: Record<string, string> = {};
    let synthesisErrors: Array<{ shotId: string; error: string }> = [];

    if (missingPlans.length > 0) {
        const synthesisResult = await generateKeyframesForPlans(missingPlans, {
            mediaActions: options.mediaActions,
            directorsVision: options.directorsVision,
            sceneSummary: options.sceneSummary,
            sceneId: options.sceneId,
            logApiCall: options.logApiCall,
            onStateChange: options.onStateChange,
        });
        synthesizedKeyframes = synthesisResult.keyframes;
        synthesisErrors = synthesisResult.errors;
    }

    const mergedKeyframes = {
        ...existingKeyframes,
        ...synthesizedKeyframes,
    };

    const videoResults = await (options.dependencies?.generateVideos ?? generateTimelineVideos)(
        options.settings,
        options.timeline,
        options.directorsVision,
        options.sceneSummary,
        mergedKeyframes,
        options.onShotProgress,
        {
            dependencies: options.dependencies?.videoDependencies,
        },
    );

    return {
        plan,
        keyframes: mergedKeyframes,
        videoResults,
        keyframeErrors: synthesisErrors,
        promptWarnings: plan.promptWarnings,
    };
};
