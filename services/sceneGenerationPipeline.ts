import {
    TimelineData,
    Shot,
    CreativeEnhancers,
    LocalGenerationSettings,
    LocalGenerationStatus,
} from '../types';
import {
    buildShotPrompt,
    DEFAULT_NEGATIVE_PROMPT,
    generateTimelineVideos,
    stripDataUrlPrefix,
    VideoGenerationDependencies,
} from './comfyUIService';
import type { MediaGenerationActions, ApiLogCallback, ApiStateChangeCallback } from './mediaGenerationService';

export interface SceneShotPlan {
    shot: Shot;
    prompt: string;
    negativePrompt: string;
    enhancers?: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    order: number;
}

export interface SceneShotPlanningResult {
    shots: SceneShotPlan[];
    combinedPrompt: string;
    timelineJson: string;
}

export const createSceneShotPlan = (
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string,
): SceneShotPlanningResult => {
    if (!timeline || !Array.isArray(timeline.shots) || timeline.shots.length === 0) {
        throw new Error('Timeline must include at least one shot before running the generation pipeline.');
    }

    const shots: SceneShotPlan[] = timeline.shots.map((shot, index) => {
        const enhancers = timeline.shotEnhancers[shot.id];
        return {
            shot,
            order: index,
            prompt: buildShotPrompt(shot, enhancers, directorsVision),
            negativePrompt: timeline.negativePrompt || DEFAULT_NEGATIVE_PROMPT,
            enhancers,
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
    };
};

export interface SceneAssetSynthesisOptions {
    mediaActions: MediaGenerationActions;
    directorsVision: string;
    sceneSummary: string;
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
    mediaActions: MediaGenerationActions;
    logApiCall: ApiLogCallback;
    onStateChange?: ApiStateChangeCallback;
    existingKeyframes?: Record<string, string>;
    dependencies?: {
        generateVideos?: typeof generateTimelineVideos;
        videoDependencies?: VideoGenerationDependencies;
    };
    onShotProgress?: (shotId: string, update: Partial<LocalGenerationStatus>) => void;
}

export const runSceneGenerationPipeline = async (
    options: ScenePipelineOptions,
): Promise<{
    plan: SceneShotPlanningResult;
    keyframes: Record<string, string>;
    videoResults: Record<string, { videoPath: string; duration: number; filename: string }>;
    keyframeErrors: Array<{ shotId: string; error: string }>;
}> => {
    const plan = createSceneShotPlan(options.timeline, options.directorsVision, options.sceneSummary);
    const existingKeyframes = options.existingKeyframes ?? {};

    const missingPlans = plan.shots.filter((shotPlan) => !existingKeyframes[shotPlan.shot.id]);
    let synthesizedKeyframes: Record<string, string> = {};
    let synthesisErrors: Array<{ shotId: string; error: string }> = [];

    if (missingPlans.length > 0) {
        const synthesisResult = await generateKeyframesForPlans(missingPlans, {
            mediaActions: options.mediaActions,
            directorsVision: options.directorsVision,
            sceneSummary: options.sceneSummary,
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
    };
};
