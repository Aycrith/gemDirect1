import { Scene, LocalGenerationSettings, VisualBible } from '../types';
import { PipelineTask } from '../types/pipeline';
import { usePipelineStore } from './pipelineStore';

export const createExportPipeline = (
    scenes: Scene[],
    settings: LocalGenerationSettings,
    options?: {
        generateKeyframes?: boolean;
        generateVideos?: boolean;
        upscale?: boolean;
        interpolate?: boolean;
        maxRetries?: number;
    }
): string => {
    const {
        generateKeyframes = true,
        generateVideos = true,
        upscale = false,
        interpolate = false,
        maxRetries = 1,
    } = options ?? {};
    const tasks: PipelineTask[] = [];

    scenes.forEach(scene => {
        if (!scene.timeline) return;

        let previousVideoTaskId: string | null = null;

        scene.timeline.shots.forEach((shot, _index) => {
            const keyframeTaskId = `keyframe-${scene.id}-${shot.id}`;
            const videoTaskId = `video-${scene.id}-${shot.id}`;
            const upscaleTaskId = `upscale-${scene.id}-${shot.id}`;
            const interpolateTaskId = `interpolate-${scene.id}-${shot.id}`;

            // Prefer a precomputed visual prompt when available.
            const prompt = shot.visualPrompt || shot.description;
            const negativePrompt = scene.timeline.negativePrompt || '';

            // 1. Keyframe Generation
            if (generateKeyframes) {
                tasks.push({
                    id: keyframeTaskId,
                    type: 'generate_keyframe',
                    label: `Keyframe: ${scene.title} - Shot ${shot.id}`,
                    status: 'pending',
                    dependencies: [],
                    payload: {
                        sceneId: scene.id,
                        shotId: shot.id,
                        prompt,
                        negativePrompt,
                        workflowProfileId: settings.imageWorkflowProfile || 'wan-t2i'
                    },
                    retryCount: 0,
                    maxRetries,
                    createdAt: Date.now()
                });
            }

            // 2. Video Generation
            if (generateVideos) {
                const deps = [];
                if (generateKeyframes) {
                    deps.push(keyframeTaskId);
                }

                // FLF2V: Add dependency on previous shot's video task
                // This ensures sequential generation and allows passing the last frame
                if (settings.featureFlags?.enableFLF2V && previousVideoTaskId) {
                    deps.push(previousVideoTaskId);
                }

                tasks.push({
                    id: videoTaskId,
                    type: 'generate_video',
                    label: `Video: ${scene.title} - Shot ${shot.id}`,
                    status: 'pending',
                    dependencies: deps,
                    payload: {
                        sceneId: scene.id,
                        shotId: shot.id,
                        prompt,
                        negativePrompt,
                        workflowProfileId: settings.videoWorkflowProfile || 'wan-i2v'
                    },
                    retryCount: 0,
                    maxRetries,
                    createdAt: Date.now()
                });

                previousVideoTaskId = videoTaskId;
            }

            // 3. Upscale
            if (upscale) {
                 tasks.push({
                    id: upscaleTaskId,
                    type: 'upscale_video',
                    label: `Upscale: ${scene.title} - Shot ${shot.id}`,
                    status: 'pending',
                    dependencies: [videoTaskId],
                    payload: {
                        config: {
                            scaleFactor: 2
                        }
                    },
                    retryCount: 0,
                    maxRetries,
                    createdAt: Date.now()
                });
            }

            // 4. Interpolation
            if (interpolate) {
                const deps = upscale ? [upscaleTaskId] : [videoTaskId];
                tasks.push({
                    id: interpolateTaskId,
                    type: 'interpolate_video',
                    label: `Interpolate: ${scene.title} - Shot ${shot.id}`,
                    status: 'pending',
                    dependencies: deps,
                    payload: {
                        config: {
                            multiplier: 2
                        }
                    },
                    retryCount: 0,
                    maxRetries,
                    createdAt: Date.now()
                });
            }
        });
    });

    const store = usePipelineStore.getState();
    return store.createPipeline(`Export All (${scenes.length} scenes)`, tasks);
};

export const createSceneGenerationPipeline = (
    scene: Scene,
    settings: LocalGenerationSettings,
    keyframeImages: Record<string, string>,
    options?: {
        generateVideos?: boolean;
        upscale?: boolean;
        interpolate?: boolean;
        visualBible?: VisualBible;
        characterReferenceImages?: Record<string, string>;
        maxRetries?: number;
    }
): string => {
    const {
        generateVideos = true,
        upscale = false,
        interpolate = false,
        visualBible,
        characterReferenceImages,
        maxRetries = 1,
    } = options ?? {};
    const tasks: PipelineTask[] = [];
    if (!scene.timeline) return '';

    let previousVideoTaskId: string | null = null;

    scene.timeline.shots.forEach((shot) => {
        const videoTaskId = `video-${scene.id}-${shot.id}`;
        const upscaleTaskId = `upscale-${scene.id}-${shot.id}`;
        const interpolateTaskId = `interpolate-${scene.id}-${shot.id}`;

        const prompt = shot.visualPrompt || shot.description;
        const negativePrompt = scene.timeline.negativePrompt || '';
        const keyframeImage = keyframeImages[shot.id];

        // 1. Video Generation
        if (generateVideos) {
            const deps: string[] = [];
            
            // FLF2V: Add dependency on previous shot's video task
            if (settings.featureFlags?.enableFLF2V && previousVideoTaskId) {
                deps.push(previousVideoTaskId);
            }

            tasks.push({
                id: videoTaskId,
                type: 'generate_video',
                label: `Video: ${scene.title} - Shot ${shot.id}`,
                status: 'pending',
                dependencies: deps,
                payload: {
                    sceneId: scene.id,
                    shotId: shot.id,
                    prompt,
                    negativePrompt,
                    workflowProfileId: settings.videoWorkflowProfile || 'wan-i2v',
                    keyframeImage: keyframeImage, // Pass existing keyframe
                    visualBible,
                    scene: scene,
                    characterReferenceImages
                },
                retryCount: 0,
                maxRetries,
                createdAt: Date.now()
            });

            previousVideoTaskId = videoTaskId;
        }

        // 2. Upscale
        if (upscale) {
             tasks.push({
                id: upscaleTaskId,
                type: 'upscale_video',
                label: `Upscale: ${scene.title} - Shot ${shot.id}`,
                status: 'pending',
                dependencies: [videoTaskId],
                payload: {
                    config: {
                        scaleFactor: 2
                    }
                },
                retryCount: 0,
                maxRetries,
                createdAt: Date.now()
            });
        }
        
        // 3. Interpolation
        if (interpolate) {
            const deps = upscale ? [upscaleTaskId] : [videoTaskId];
            tasks.push({
                id: interpolateTaskId,
                type: 'interpolate_video',
                label: `Interpolate: ${scene.title} - Shot ${shot.id}`,
                status: 'pending',
                dependencies: deps,
                payload: {
                    config: {
                        multiplier: 2
                    }
                },
                retryCount: 0,
                maxRetries,
                createdAt: Date.now()
            });
        }
    });

    const store = usePipelineStore.getState();
    return store.createPipeline(`Generate Scene: ${scene.title}`, tasks);
};
