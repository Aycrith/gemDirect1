import React, { useMemo, useState } from 'react';
import { Scene, LocalGenerationSettings, VisualBible } from '../types';
import { createSceneGenerationPipeline } from '../services/pipelineFactory';
import { pipelineEngine } from '../services/pipelineEngine';
import { usePipelineStore } from '../services/pipelineStore';
import { getActiveKeyframeImage } from '../types';

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

    const upscalePrereqsMet = useMemo(() => {
        return !!settings.comfyUIUrl && !!settings.workflowProfiles?.['video-upscaler'];
    }, [settings.comfyUIUrl, settings.workflowProfiles]);

    const interpolationPrereqsMet = useMemo(() => {
        return !!settings.comfyUIUrl && !!settings.workflowProfiles?.['rife-interpolation'];
    }, [settings.comfyUIUrl, settings.workflowProfiles]);

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
                    title={upscalePrereqsMet ? 'Add an upscale step after video generation' : 'Requires ComfyUI and a \"video-upscaler\" workflow profile'}
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
                    title={interpolationPrereqsMet ? 'Add a frame interpolation step after video generation' : 'Requires ComfyUI and a \"rife-interpolation\" workflow profile'}
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
