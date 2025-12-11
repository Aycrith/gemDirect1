import { PipelineTask, PipelineTaskType } from '../types/pipeline';
import { useSettingsStore } from './settingsStore';
import { 
    queueComfyUIPromptWithQueue, 
    ComfyUIPromptPayloads,
    trackPromptExecution
} from './comfyUIService';
import { 
    upscaleVideo, 
    DEFAULT_UPSCALE_CONFIG, 
    UpscaleConfig 
} from './videoUpscalingService';

export type TaskExecutor = (task: PipelineTask, context?: { dependencies: Record<string, PipelineTask> }) => Promise<any>;

const stripDataUrlPrefix = (dataUrl: string): string => {
    return dataUrl.replace(/^data:image\/\w+;base64,/, "");
};

export const executeKeyframeGeneration: TaskExecutor = async (task) => {
    console.log(`[TaskRegistry] Executing keyframe generation for task ${task.id}`);
    
    const { prompt, negativePrompt, workflowProfileId, sceneId, shotId } = task.payload;
    const settings = useSettingsStore.getState();

    if (!prompt) {
        throw new Error('Missing prompt in task payload');
    }

    const payloads: ComfyUIPromptPayloads = {
        json: prompt, // Using prompt as JSON for now, assuming it's the full prompt
        text: prompt,
        negativePrompt: negativePrompt || '',
        structured: []
    };

    // For keyframe generation, we don't usually have an input image
    const result = await queueComfyUIPromptWithQueue(
        settings,
        payloads,
        '', // No input image
        workflowProfileId || 'wan-t2i', // Default to T2I
        {
            sceneId,
            shotId,
            waitForCompletion: true
        }
    );

    if (!result) {
        throw new Error('Failed to queue keyframe generation');
    }

    console.log(`[TaskRegistry] Keyframe generation completed for task ${task.id}`);
    return result;
};

export const executeVideoGeneration: TaskExecutor = async (task, context) => {
    console.log(`[TaskRegistry] Executing video generation for task ${task.id}`);
    
    let { prompt, negativePrompt, keyframeImage, workflowProfileId, sceneId, shotId } = task.payload;
    const settings = useSettingsStore.getState();

    // Resolve keyframe image from dependencies if not provided
    if (!keyframeImage && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type === 'generate_keyframe' && dep.output?.images?.[0]) {
                keyframeImage = dep.output.images[0];
                console.log(`[TaskRegistry] Resolved keyframe image from dependency ${dep.id}`);
                break;
            }
        }
    }

    if (!prompt) throw new Error('Missing prompt in task payload');
    if (!keyframeImage) throw new Error('Missing keyframe image in task payload (or dependency)');

    const payloads: ComfyUIPromptPayloads = {
        json: prompt,
        text: prompt,
        negativePrompt: negativePrompt || '',
        structured: []
    };

    const cleanImage = stripDataUrlPrefix(keyframeImage);

    const result = await queueComfyUIPromptWithQueue(
        settings,
        payloads,
        cleanImage,
        workflowProfileId || 'wan-i2v', // Default to I2V
        {
            sceneId,
            shotId,
            waitForCompletion: true
        }
    );

    if (!result) {
        throw new Error('Failed to queue video generation');
    }

    console.log(`[TaskRegistry] Video generation completed for task ${task.id}`);
    return result;
};

export const executeUpscaleVideo: TaskExecutor = async (task, context) => {
    console.log(`[TaskRegistry] Executing upscale for task ${task.id}`);
    
    let { videoPath, config } = task.payload;
    const settings = useSettingsStore.getState();

    // Resolve video path from dependencies if not provided
    if (!videoPath && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type === 'generate_video' && dep.output?.videos?.[0]) {
                videoPath = dep.output.videos[0];
                console.log(`[TaskRegistry] Resolved video path from dependency ${dep.id}`);
                break;
            }
        }
    }

    if (!videoPath) throw new Error('Missing video path in task payload (or dependency)');

    const upscaleConfig: UpscaleConfig = {
        ...DEFAULT_UPSCALE_CONFIG,
        ...config
    };

    const result = await upscaleVideo(settings, videoPath, upscaleConfig);

    if (!result.success || !result.promptId) {
        throw new Error(result.error || 'Failed to queue upscale job');
    }

    console.log(`[TaskRegistry] Upscale queued with ID: ${result.promptId}`);
    return trackPromptExecution(settings, result.promptId, (status) => {
        console.log(`[TaskRegistry] Upscale progress: ${status.status} - ${status.message}`);
    });
};

export const TaskRegistry: Record<PipelineTaskType, TaskExecutor> = {
    'generate_keyframe': executeKeyframeGeneration,
    'generate_video': executeVideoGeneration,
    'upscale_video': executeUpscaleVideo,
    'export_timeline': async (task) => {
        console.log(`[TaskRegistry] Executing export for task ${task.id}`);
        return new Promise(resolve => setTimeout(resolve, 500));
    },
    'generic_action': async (task) => {
        console.log(`[TaskRegistry] Executing generic action for task ${task.id}`);
        return new Promise(resolve => setTimeout(resolve, 100));
    }
};
