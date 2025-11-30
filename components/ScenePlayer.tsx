import React, { useMemo } from 'react';
import type { ArtifactSceneMetadata } from '../utils/hooks';
import { getSceneVideoManager } from '../services/videoGenerationService';
import type { LocalGenerationStatus } from '../types';
import { extractVideoFromLocalStatus } from '../utils/videoValidation';

interface ScenePlayerProps {
    scene: ArtifactSceneMetadata;
    runDir?: string;
    isRegenerating?: boolean;
    onRegenerateScene?: (sceneId: string) => void;
    /** Optional: Local generation status for this scene (takes priority over artifact lookup) */
    localGenStatus?: LocalGenerationStatus;
}

const ScenePlayer: React.FC<ScenePlayerProps> = ({ scene, runDir, isRegenerating, onRegenerateScene, localGenStatus }) => {
    const manager = useMemo(() => getSceneVideoManager(), []);
    const record = useMemo(() => manager.getSceneVideo(scene, runDir), [manager, scene, runDir]);
    
    // Check for locally generated video (takes priority)
    const localVideoOutput = useMemo(() => extractVideoFromLocalStatus(localGenStatus), [localGenStatus]);
    const localVideoUrl = localVideoOutput?.data;

    // Priority: local generation > artifact-based video
    if (localVideoUrl) {
        return (
            <div className="space-y-2">
                <div className="relative">
                    <div className="absolute top-2 left-2 z-10 px-2 py-1 text-xs font-medium bg-green-600/90 text-white rounded-md shadow-lg">
                        ✓ Generated
                    </div>
                    <video
                        className="w-full rounded-lg border border-gray-700"
                        controls
                        src={localVideoUrl}
                        poster={scene.SceneKeyframe ? `data:image/jpeg;base64,${scene.SceneKeyframe}` : undefined}
                    />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                    <div>
                        Status: <span className="text-green-400">Complete</span>
                        <span className="ml-2 text-gray-500">· Generated via ComfyUI</span>
                    </div>
                    {onRegenerateScene && (
                        <button
                            className="rounded-full border border-amber-500 px-3 py-1 font-semibold text-amber-200 hover:bg-amber-500/10"
                            onClick={() => onRegenerateScene(scene.SceneId)}
                            disabled={isRegenerating}
                        >
                            {isRegenerating ? 'Regenerating…' : 'Regenerate scene'}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (!record) {
        return (
            <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3 text-sm text-gray-300">
                <span>No video found for scene {scene.SceneId}. Upload or regenerate to preview footage.</span>
                {onRegenerateScene && (
                    <button
                        className="rounded-full border border-amber-500 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
                        onClick={() => onRegenerateScene(scene.SceneId)}
                        disabled={isRegenerating}
                    >
                        {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <video
                className="w-full rounded-lg border border-gray-700"
                controls
                src={record.Path}
                poster={scene.SceneKeyframe ? `data:image/jpeg;base64,${scene.SceneKeyframe}` : undefined}
            />
            <div className="flex items-center justify-between text-xs text-gray-400">
                <div>
                    Status: <span className="text-gray-200">{record.Status}</span>
                    {record.DurationSeconds && ` · ${record.DurationSeconds.toFixed(1)}s`}
                    {record.UpdatedAt && ` · updated ${new Date(record.UpdatedAt).toLocaleString()}`}
                </div>
                {onRegenerateScene && (
                    <button
                        className="rounded-full border border-amber-500 px-3 py-1 font-semibold text-amber-200 hover:bg-amber-500/10"
                        onClick={() => onRegenerateScene(scene.SceneId)}
                        disabled={isRegenerating}
                    >
                        {isRegenerating ? 'Regenerating…' : 'Regenerate scene'}
                    </button>
                )}
            </div>
            {record.Error && <p className="text-xs text-red-300">{record.Error}</p>}
        </div>
    );
};

export default ScenePlayer;
