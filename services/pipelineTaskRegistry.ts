import type {
    PipelineMediaOutput,
    PipelineTask,
    PipelineTaskOf,
    PipelineTaskOutputMap,
    PipelineTaskType,
} from '../types/pipeline';
import { useSettingsStore } from './settingsStore';
import { useGenerationStatusStore } from './generationStatusStore';
import {
    queueComfyUIPromptWithQueue,
    type ComfyUIPromptPayloads,
    stripDataUrlPrefix,
    waitForComfyCompletion,
} from './comfyUIService';
import { prepareIPAdapterPayload } from './ipAdapterService';
import {
    DEFAULT_INTERPOLATION_CONFIG,
    DEFAULT_UPSCALE_CONFIG,
    type InterpolationConfig,
    type UpscaleConfig,
    interpolateVideo,
    upscaleVideo,
} from './videoUpscalingService';
import { extractFramesFromVideo } from '../utils/videoUtils';

export type TaskExecutor<TType extends PipelineTaskType> = (
    task: PipelineTaskOf<TType>,
    context?: { dependencies: Record<string, PipelineTask> }
) => Promise<PipelineTaskOutputMap[TType]>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
};

type NodeFrameExtractor = {
    extractLastFrameBase64FromVideoUrl: (videoUrl: string) => Promise<string | null>;
};

const getInjectedNodeFrameExtractor = (): NodeFrameExtractor | null => {
    const candidate = (globalThis as unknown as { __flf2vNodeFrameExtractor?: unknown }).__flf2vNodeFrameExtractor;
    if (!isRecord(candidate)) return null;
    const fn = candidate.extractLastFrameBase64FromVideoUrl;
    return typeof fn === 'function' ? (candidate as NodeFrameExtractor) : null;
};

const normalizeToPipelineMediaOutput = (value: unknown): PipelineMediaOutput => {
    if (!isRecord(value)) {
        return {};
    }

    const images = Array.isArray(value.images) ? value.images.filter((v): v is string => typeof v === 'string') : undefined;
    const videos = Array.isArray(value.videos) ? value.videos.filter((v): v is string => typeof v === 'string') : undefined;

    const assets = Array.isArray(value.assets)
        ? value.assets
              .filter(isRecord)
              .filter((a) => (a.type === 'image' || a.type === 'video') && typeof a.data === 'string' && typeof a.filename === 'string')
              .map((a) => ({
                  type: a.type as 'image' | 'video',
                  data: a.data as string,
                  filename: a.filename as string,
              }))
        : undefined;

    // If we got a single-asset shape ({ type, data, filename }) ensure images/videos are populated.
    const singleType = typeof value.type === 'string' ? value.type : undefined;
    const singleData = typeof value.data === 'string' ? value.data : undefined;
    const inferredImages = !images && singleType === 'image' && singleData ? [singleData] : undefined;
    const inferredVideos = !videos && singleType === 'video' && singleData ? [singleData] : undefined;

    return {
        images: images ?? inferredImages,
        videos: videos ?? inferredVideos,
        assets,
        metadata: value.metadata,
    };
};

const fetchVideoAsFile = async (url: string): Promise<File> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], 'video.mp4', { type: 'video/mp4' });
};


export const executeKeyframeGeneration: TaskExecutor<'generate_keyframe'> = async (task) => {
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
    return normalizeToPipelineMediaOutput(result);
};

export const executeVideoGeneration: TaskExecutor<'generate_video'> = async (task, context) => {
    console.log(`[TaskRegistry] Executing video generation for task ${task.id}`);
    
    const { prompt, negativePrompt, workflowProfileId, sceneId, shotId, visualBible, scene } = task.payload;
    let { keyframeImage } = task.payload;
    const settings = useSettingsStore.getState();

    const flf2vEnabled = !!settings.featureFlags?.enableFLF2V;
    let frameSource = 'keyframe';
    let fallbackUsed = false;

    console.log(`[TaskRegistry] FLF2V Check: enabled=${flf2vEnabled}, deps=${Object.keys(context?.dependencies || {}).join(',')}`);

    // FLF2V: Check for previous video dependency
    if (flf2vEnabled && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type !== 'generate_video') continue;

            const depOutput = normalizeToPipelineMediaOutput(dep.output);
            const videoPath = depOutput.videos?.[0];
            if (!videoPath) continue;

            try {
                // If videoPath is already a URL, use it, otherwise construct a ComfyUI /view URL.
                const videoUrl = videoPath.startsWith('http')
                    ? videoPath
                    : `${settings.comfyUIUrl}/view?filename=${encodeURIComponent(videoPath)}&type=output`;

                console.log(`[TaskRegistry] FLF2V: Fetching previous video from ${videoUrl}`);

                let extracted: string | null = null;

                // Try browser extraction first.
                if (typeof window !== 'undefined') {
                    try {
                        const videoFile = await fetchVideoAsFile(videoUrl);
                        const frames = await extractFramesFromVideo(videoFile, 1);
                        extracted = frames.length > 0 ? frames[frames.length - 1] ?? null : null;
                    } catch (e) {
                        console.warn(`[TaskRegistry] FLF2V: Browser extraction failed, attempting fallback if available`, e);
                    }
                }

                // Node/Headless fallback: dynamically import Node-only extractor.
                if (!extracted && typeof window === 'undefined') {
                    try {
                        const injected = getInjectedNodeFrameExtractor();
                        if (injected) {
                            extracted = await injected.extractLastFrameBase64FromVideoUrl(videoUrl);
                        } else {
                            // Use a non-literal specifier so Vite doesn't try to include this Node-only module in browser builds.
                            const modulePath = './flf2v/nodeFrameExtractor';
                            const nodeExtractor = await import(/* @vite-ignore */ modulePath);
                            extracted = await nodeExtractor.extractLastFrameBase64FromVideoUrl(videoUrl);
                        }
                    } catch (e) {
                        console.warn(`[TaskRegistry] FLF2V: Node extraction failed`, e);
                    }
                }

                if (extracted) {
                    keyframeImage = extracted;
                    frameSource = 'last-frame';
                    console.log(`[TaskRegistry] FLF2V: Using last frame from ${dep.id} as input`);
                } else {
                    fallbackUsed = true;
                    console.warn(`[TaskRegistry] FLF2V: Could not extract last frame, falling back to keyframe`);
                }
            } catch (e) {
                console.warn(`[TaskRegistry] FLF2V: Failed to extract last frame from ${dep.id}`, e);
                fallbackUsed = true;
            }

            break;
        }
    }

    // Resolve keyframe image from dependencies if not provided (fallback or standard flow)
    if (!keyframeImage && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type !== 'generate_keyframe') continue;
            const depOutput = normalizeToPipelineMediaOutput(dep.output);
            const img = depOutput.images?.[0];
            if (img) {
                keyframeImage = img;
                console.log(`[TaskRegistry] Resolved keyframe image from dependency ${dep.id}`);
                break;
            }
        }
    }

    if (!prompt) throw new Error('Missing prompt in task payload');
    if (!keyframeImage) throw new Error('Missing keyframe image in task payload (or dependency)');

    // Prepare IP Adapter Payload
    let ipAdapterPayload;
    if (visualBible && scene) {
         try {
            const profileId = workflowProfileId || 'wan-i2v';
            const workflowProfile = settings.workflowProfiles?.[profileId];
             if (workflowProfile?.workflowJson) {
                const shot = scene.timeline?.shots?.find((s) => s.id === shotId) ?? null;
                ipAdapterPayload = await prepareIPAdapterPayload(
                    visualBible,
                    scene,
                    shot,
                    workflowProfile.workflowJson
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
    
    const normalized = normalizeToPipelineMediaOutput(result);

    // Attach FLF2V telemetry (merge with any existing metadata).
    const existingMeta = isRecord(normalized.metadata) ? (normalized.metadata as Record<string, unknown>) : {};
    const metadata = {
        ...existingMeta,
        flf2vEnabled,
        flf2vSource: frameSource,
        flf2vFallback: fallbackUsed,
    };

    return { ...normalized, metadata };
};

export const executeUpscaleVideo: TaskExecutor<'upscale_video'> = async (task, context) => {
    console.log(`[TaskRegistry] Executing upscale for task ${task.id}`);
    
    const { config } = task.payload;
    let { videoPath } = task.payload;
    const settings = useSettingsStore.getState();

    // Resolve video path from dependencies if not provided
    if (!videoPath && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type !== 'generate_video') continue;
            const depOutput = normalizeToPipelineMediaOutput(dep.output);
            const v = depOutput.videos?.[0];
            if (v) {
                videoPath = v;
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

    const finalOutput = await waitForComfyCompletion(settings, result.promptId);
    return normalizeToPipelineMediaOutput(finalOutput);
};

export const executeInterpolateVideo: TaskExecutor<'interpolate_video'> = async (task, context) => {
    console.log(`[TaskRegistry] Executing interpolation for task ${task.id}`);
    
    const { config } = task.payload;
    let { videoPath } = task.payload;
    const settings = useSettingsStore.getState();

    // Resolve video path from dependencies if not provided
    if (!videoPath && context?.dependencies) {
        for (const dep of Object.values(context.dependencies)) {
            if (dep.type !== 'generate_video' && dep.type !== 'upscale_video') continue;
            const depOutput = normalizeToPipelineMediaOutput(dep.output);
            const v = depOutput.videos?.[0];
            if (v) {
                videoPath = v;
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
        videos: [result.outputPath || result.outputData || ''].filter((v) => v.length > 0),
        metadata: {
            interpolationElapsed: result.interpolationElapsed,
            upscaleMethod: result.upscaleMethod,
            finalFps: result.finalFps,
        },
    };
};

export const TaskRegistry: { [K in PipelineTaskType]: TaskExecutor<K> } = {
    generate_keyframe: executeKeyframeGeneration,
    generate_video: executeVideoGeneration,
    upscale_video: executeUpscaleVideo,
    interpolate_video: executeInterpolateVideo,
    export_timeline: async (task) => {
        console.log(`[TaskRegistry] Executing export for task ${task.id}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        return undefined;
    },
    generic_action: async (task) => {
        console.log(`[TaskRegistry] Executing generic action for task ${task.id}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return undefined;
    },
};
