import { Scene, LocalGenerationSettings } from '../types';
import { PipelineTask } from '../types/pipeline';
import { usePipelineStore } from './pipelineStore';

export const createExportPipeline = (
    scenes: Scene[],
    settings: LocalGenerationSettings,
    options: {
        generateKeyframes?: boolean;
        generateVideos?: boolean;
        upscale?: boolean;
        interpolate?: boolean;
    } = { generateKeyframes: true, generateVideos: true, upscale: false, interpolate: false }
): string => {
    const tasks: PipelineTask[] = [];

    scenes.forEach(scene => {
        if (!scene.timeline) return;

        let previousVideoTaskId: string | null = null;

        scene.timeline.shots.forEach((shot, _index) => {
            const keyframeTaskId = `keyframe-${scene.id}-${shot.id}`;
            const videoTaskId = `video-${scene.id}-${shot.id}`;
            const upscaleTaskId = `upscale-${scene.id}-${shot.id}`;
            const interpolateTaskId = `interpolate-${scene.id}-${shot.id}`;

            // Use visualPrompt if available (via cast for now), else description
            const prompt = (shot as any).visualPrompt || shot.description;
            const negativePrompt = scene.timeline.negativePrompt || '';

            // 1. Keyframe Generation
            if (options.generateKeyframes) {
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
                    createdAt: Date.now()
                });
            }

            // 2. Video Generation
            if (options.generateVideos) {
                const deps = [];
                if (options.generateKeyframes) {
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
                    createdAt: Date.now()
                });

                previousVideoTaskId = videoTaskId;
            }

            // 3. Upscale
            if (options.upscale) {
                 tasks.push({
                    id: upscaleTaskId,
                    type: 'upscale_video',
                    label: `Upscale: ${scene.title} - Shot ${shot.id}`,
                    status: 'pending',
                    dependencies: [videoTaskId],
                    payload: {
                        config: {
                            scale: 2
                        }
                    },
                    retryCount: 0,
                    createdAt: Date.now()
                });
            }

            // 4. Interpolation
            if (options.interpolate) {
                const deps = options.upscale ? [upscaleTaskId] : [videoTaskId];
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
                    createdAt: Date.now()
                });
            }
        });
    });

    const store = usePipelineStore.getState();
    return store.createPipeline(`Export All (${scenes.length} scenes)`, tasks);
};
