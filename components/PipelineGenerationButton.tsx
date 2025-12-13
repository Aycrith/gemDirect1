import React, { useEffect, useMemo, useState } from 'react';
import { Scene, LocalGenerationSettings, VisualBible } from '../types';
import { createSceneGenerationPipeline } from '../services/pipelineFactory';
import { pipelineEngine } from '../services/pipelineEngine';
import { usePipelineStore } from '../services/pipelineStore';
import { getActiveKeyframeImage } from '../types';
import { isInterpolationReady, isUpscalingReady } from '../utils/wanProfileReadiness';

interface PipelineGenerationButtonProps {
    scene: Scene;
    settings: LocalGenerationSettings;
    keyframeData: Record<string, any>; // Map of shotId -> KeyframeData
    visualBible?: VisualBible;
    characterReferenceImages?: Record<string, string>;
    disabled?: boolean;
}

export const PipelineGenerationButton: React.FC<PipelineGenerationButtonProps> = ({
    scene,
    settings,
    keyframeData,
    visualBible,
    characterReferenceImages,
    disabled
}) => {
    const activePipelineId = usePipelineStore(state => state.activePipelineId);
    const isPipelineActive = !!activePipelineId;

    const [upscaleEnabled, setUpscaleEnabled] = useState(false);
    const [interpolateEnabled, setInterpolateEnabled] = useState(false);

    const videoUpscalingEnabled = !!settings.featureFlags?.videoUpscaling;
    const frameInterpolationEnabled = !!settings.featureFlags?.frameInterpolationEnabled;

    const upscalePrereqsMet = useMemo(() => {
        return isUpscalingReady(settings);
    }, [settings.comfyUIUrl, settings.workflowProfiles, videoUpscalingEnabled]);

    const interpolationPrereqsMet = useMemo(() => {
        return isInterpolationReady(settings);
    }, [settings.comfyUIUrl, settings.workflowProfiles, frameInterpolationEnabled]);

    // Guard against stale enabled state when settings/profile selection changes.
    // If prereqs become unmet, force-disable the option so we don't enqueue unsupported postproc steps.
    useEffect(() => {
        if (!upscalePrereqsMet) {
            setUpscaleEnabled(false);
        }
    }, [upscalePrereqsMet]);

    useEffect(() => {
        if (!interpolationPrereqsMet) {
            setInterpolateEnabled(false);
        }
    }, [interpolationPrereqsMet]);

    const handleGenerate = () => {
        // Resolve keyframes
        const keyframeImages: Record<string, string> = {};
        scene.timeline?.shots.forEach(shot => {
            const data = keyframeData[shot.id] || keyframeData[scene.id]; // Fallback to scene keyframe?
            const image = getActiveKeyframeImage(data);
            if (image) {
                keyframeImages[shot.id] = image;
            }
        });

        const pipelineId = createSceneGenerationPipeline(
            scene,
            settings,
            keyframeImages,
            {
                generateVideos: true,
                upscale: upscaleEnabled,
                interpolate: interpolateEnabled,
                visualBible,
                characterReferenceImages
            }
        );

        if (pipelineId) {
            pipelineEngine.start();
        }
    };

    return (
        <div className="inline-flex flex-col items-start gap-1">
            <div className="flex items-center gap-3 text-[11px] text-slate-300">
                <label
                    className={`flex items-center gap-1.5 ${!upscalePrereqsMet ? 'opacity-60 cursor-not-allowed' : ''}`}
                    title={upscalePrereqsMet ? 'Add an upscale step after video generation' : 'Requires Video Upscaling enabled, ComfyUI configured, and a "video-upscaler*" workflow profile with input_video mapping'}
                >
                    <input
                        type="checkbox"
                        className="accent-indigo-500"
                        checked={upscaleEnabled}
                        onChange={(e) => setUpscaleEnabled(e.target.checked)}
                        disabled={disabled || isPipelineActive || !upscalePrereqsMet}
                    />
                    Upscale 2x
                </label>
                <label
                    className={`flex items-center gap-1.5 ${!interpolationPrereqsMet ? 'opacity-60 cursor-not-allowed' : ''}`}
                    title={interpolationPrereqsMet ? 'Add a frame interpolation step after video generation' : 'Requires Frame Interpolation enabled, ComfyUI configured, and a "rife-interpolation*" workflow profile with input_video mapping'}
                >
                    <input
                        type="checkbox"
                        className="accent-indigo-500"
                        checked={interpolateEnabled}
                        onChange={(e) => setInterpolateEnabled(e.target.checked)}
                        disabled={disabled || isPipelineActive || !interpolationPrereqsMet}
                    />
                    Interpolate 2x
                </label>
            </div>

            <button
                onClick={handleGenerate}
                disabled={disabled || isPipelineActive}
                className={`
                    px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2
                    ${disabled || isPipelineActive 
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'}
                `}
                title="Generate videos using the new Pipeline Engine (Beta)"
            >
                <span className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse" />
                Pipeline Generate (Beta)
            </button>
        </div>
    );
};
