import React, { useMemo } from 'react';
import type { ArtifactSceneMetadata } from '../utils/hooks';
import { getSceneVideoManager } from '../services/videoGenerationService';

interface ScenePlayerProps {
    scene: ArtifactSceneMetadata;
    runDir?: string;
    isRegenerating?: boolean;
    onRegenerateScene?: (sceneId: string) => void;
}

const ScenePlayer: React.FC<ScenePlayerProps> = ({ scene, runDir, isRegenerating, onRegenerateScene }) => {
    const manager = useMemo(() => getSceneVideoManager(), []);
    const record = useMemo(() => manager.getSceneVideo(scene, runDir), [manager, scene, runDir]);

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
