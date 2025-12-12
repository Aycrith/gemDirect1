import { PipelineTask, PipelineTaskType } from '../types/pipeline';
import { useSettingsStore } from './settingsStore';
import { useGenerationStatusStore } from './generationStatusStore';
import { 
    queueComfyUIPromptWithQueue, 
    ComfyUIPromptPayloads,
    trackPromptExecution
} from './comfyUIService';
import { prepareIPAdapterPayload } from './ipAdapterService';
import { 
    upscaleVideo, 
    interpolateVideo,
    DEFAULT_UPSCALE_CONFIG, 
    DEFAULT_INTERPOLATION_CONFIG,
    UpscaleConfig,
    InterpolationConfig
} from './videoUpscalingService';
import { extractFramesFromVideo } from '../utils/videoUtils';

export type TaskExecutor = (task: PipelineTask, context?: { dependencies: Record<string, PipelineTask> }) => Promise<any>;

const stripDataUrlPrefix = (dataUrl: string): string => {
    return dataUrl.replace(/^data:image\/\w+;base64,/, "");
};

const fetchVideoAsFile = async (url: string): Promise<File> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], "video.mp4", { type: "video/mp4" });
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
    
    const { prompt, negativePrompt, workflowProfileId, sceneId, shotId, visualBible, scene, characterReferenceImages } = task.payload;
    let { keyframeImage } = task.payload;
    const settings = useSettingsStore.getState();

    const flf2vEnabled = !!settings.featureFlags?.enableFLF2V;
    let frameSource = 'keyframe';
    let fallbackUsed = false;

    console.log(`[TaskRegistry] FLF2V Check: enabled=${flf2vEnabled}, deps=${Object.keys(context?.dependencies || {}).join(',')}`);

    // FLF2V: Check for previous video dependency
    if (flf2vEnabled && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type === 'generate_video' && dep.output?.videos?.[0]) {
                try {
                    const videoPath = dep.output.videos[0];
                    // Construct URL - assuming ComfyUI serves files at /view
                    // If videoPath is already a URL, use it, otherwise construct it
                    const videoUrl = videoPath.startsWith('http') 
                        ? videoPath 
                        : `${settings.comfyUIUrl}/view?filename=${encodeURIComponent(videoPath)}&type=output`;
                    
                    console.log(`[TaskRegistry] FLF2V: Fetching previous video from ${videoUrl}`);
                    
                    let frames: string[] = [];
                    let extractionSuccess = false;
                    
                    // Try browser extraction first if in browser
                    if (typeof window !== 'undefined') {
                        try {
                            const videoFile = await fetchVideoAsFile(videoUrl);
                            frames = await extractFramesFromVideo(videoFile, 1);
                            extractionSuccess = true;
                        } catch (e) {
                            console.warn(`[TaskRegistry] FLF2V: Browser extraction failed, attempting fallback if available`, e);
                        }
                    }

                    // Try Node extraction if browser failed or we are in Node
                    if (!extractionSuccess && typeof window === 'undefined') {
                        // Node/Headless path
                        try {
                            // Use dynamic imports to avoid bundling issues in browser
                            const { exec } = await import('child_process');
                            const util = await import('util');
                            const fs = await import('fs');
                            const path = await import('path');
                            const execAsync = util.promisify(exec);
                            
                            const tempDir = path.join(process.cwd(), 'temp');
                            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                            
                            const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
                            const tempFramePath = path.join(tempDir, `temp_frame_${Date.now()}.jpg`);
                            
                            // Download video
                            const response = await fetch(videoUrl);
                            if (!response.ok) throw new Error(`Failed to fetch video: ${response.statusText}`);
                            const buffer = await response.arrayBuffer();
                            fs.writeFileSync(tempVideoPath, Buffer.from(buffer));
                            
                            // Extract last frame using ffmpeg
                            // -sseof -0.1 seeks to 0.1s from end to ensure we get a frame
                            await execAsync(`ffmpeg -sseof -0.1 -i "${tempVideoPath}" -vsync 0 -q:v 2 -update 1 "${tempFramePath}" -y`);
                            
                            if (fs.existsSync(tempFramePath)) {
                                const frameBuffer = fs.readFileSync(tempFramePath);
                                frames = [frameBuffer.toString('base64')];
                                extractionSuccess = true;
                                
                                // Cleanup
                                fs.unlinkSync(tempVideoPath);
                                fs.unlinkSync(tempFramePath);
                            }
                        } catch (e) {
                            console.warn(`[TaskRegistry] FLF2V: Node extraction failed`, e);
                        }
                    }
                    
                    if (frames.length > 0) {
                        // Use the last frame
                        keyframeImage = frames[frames.length - 1];
                        frameSource = 'last-frame';
                        console.log(`[TaskRegistry] FLF2V: Using last frame from ${dep.id} as input`);
                    } else {
                        fallbackUsed = true;
                        console.warn(`[TaskRegistry] FLF2V: Could not extract frames, falling back to keyframe`);
                    }
                } catch (e) {
                    console.warn(`[TaskRegistry] FLF2V: Failed to extract last frame from ${dep.id}`, e);
                    fallbackUsed = true;
                }
                break;
            }
        }
    }

    // Resolve keyframe image from dependencies if not provided (fallback or standard flow)
    if (!keyframeImage && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            console.log(`[TaskRegistry] Checking dep ${dep.id} type=${dep.type} output=${JSON.stringify(dep.output)}`);
            if (dep.type === 'generate_keyframe' && dep.output?.images?.[0]) {
                keyframeImage = dep.output.images[0];
                console.log(`[TaskRegistry] Resolved keyframe image from dependency ${dep.id}`);
                break;
            }
        }
    }

    if (!prompt) throw new Error('Missing prompt in task payload');
    if (!keyframeImage) throw new Error('Missing keyframe image in task payload (or dependency)');

    // Prepare IP Adapter Payload
    let ipAdapterPayload;
    if (visualBible && scene && characterReferenceImages) {
         try {
            const profileId = workflowProfileId || 'wan-i2v';
            const workflowProfile = settings.workflowProfiles?.[profileId];
             if (workflowProfile?.workflowJson) {
                ipAdapterPayload = await prepareIPAdapterPayload(
                    JSON.parse(workflowProfile.workflowJson),
                    visualBible,
                    scene,
                    characterReferenceImages
                );
                console.log(`[TaskRegistry] Prepared IP Adapter payload for task ${task.id}`);
             }
         } catch (e) {
             console.warn('[TaskRegistry] Failed to prepare IP Adapter payload', e);
         }
    }

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
            waitForCompletion: true,
            extraData: {
                ipAdapter: ipAdapterPayload
            },
            onProgress: (update) => {
                if (sceneId) {
                    useGenerationStatusStore.getState().updateSceneStatus(sceneId, update);
                }
            }
        }
    );

    if (!result) {
        throw new Error('Failed to queue video generation');
    }

    console.log(`[TaskRegistry] Video generation completed for task ${task.id}`);
    
    // Attach FLF2V telemetry
    const metadata = {
        flf2vEnabled,
        flf2vSource: frameSource,
        flf2vFallback: fallbackUsed
    };
    
    return { ...result, metadata };
};

export const executeUpscaleVideo: TaskExecutor = async (task, context) => {
    console.log(`[TaskRegistry] Executing upscale for task ${task.id}`);
    
    const { config } = task.payload;
    let { videoPath } = task.payload;
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

export const executeInterpolateVideo: TaskExecutor = async (task, context) => {
    console.log(`[TaskRegistry] Executing interpolation for task ${task.id}`);
    
    const { config } = task.payload;
    let { videoPath } = task.payload;
    const settings = useSettingsStore.getState();

    // Resolve video path from dependencies if not provided
    if (!videoPath && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            // Can come from generate_video OR upscale_video
            if ((dep.type === 'generate_video' || dep.type === 'upscale_video') && dep.output?.videos?.[0]) {
                videoPath = dep.output.videos[0];
                console.log(`[TaskRegistry] Resolved video path from dependency ${dep.id}`);
                break;
            }
        }
    }

    if (!videoPath) throw new Error('Missing video path in task payload (or dependency)');

    const interpolationConfig: InterpolationConfig = {
        ...DEFAULT_INTERPOLATION_CONFIG,
        ...config
    };

    const result = await interpolateVideo(settings, videoPath, interpolationConfig);

    if (!result.success) {
        throw new Error(result.error || 'Failed to interpolate video');
    }

    console.log(`[TaskRegistry] Interpolation completed: ${result.outputPath}`);
    return { 
        videos: [result.outputPath],
        metadata: {
            interpolationElapsed: result.interpolationElapsed,
            upscaleMethod: result.upscaleMethod,
            finalFps: result.finalFps
        }
    };
};

export const TaskRegistry: Record<PipelineTaskType, TaskExecutor> = {
    'generate_keyframe': executeKeyframeGeneration,
    'generate_video': executeVideoGeneration,
    'upscale_video': executeUpscaleVideo,
    'interpolate_video': executeInterpolateVideo,
    'export_timeline': async (task) => {
        console.log(`[TaskRegistry] Executing export for task ${task.id}`);
        return new Promise(resolve => setTimeout(resolve, 500));
    },
    'generic_action': async (task) => {
        console.log(`[TaskRegistry] Executing generic action for task ${task.id}`);
        return new Promise(resolve => setTimeout(resolve, 100));
    }
};
