import type { ArtifactSceneMetadata, SceneVideoMetadata } from '../utils/hooks';

export interface SceneVideoRecord extends SceneVideoMetadata {
    sceneId: string;
}

export interface SceneVideoManager {
    /**
     * Returns a normalized video record for a scene if one exists,
     * otherwise null. This is a pure read helper that assumes another
     * process (ComfyUI/ffmpeg) has already produced the MP4 and updated
     * ArtifactSceneMetadata.Video.
     */
    getSceneVideo(scene: ArtifactSceneMetadata, runDir?: string): SceneVideoRecord | null;

    /**
     * Placeholder for future per-scene regeneration. For now this is a
     * no-op that simply logs a warning so the UI wiring can be completed
     * without requiring the video backend to be present.
     */
    regenerateScene(
        sceneId: string,
        options?: {
            prompt?: string;
            negativePrompt?: string;
        }
    ): Promise<void>;
}

class DefaultSceneVideoManager implements SceneVideoManager {
    getSceneVideo(scene: ArtifactSceneMetadata, runDir?: string): SceneVideoRecord | null {
        const video = scene.Video;
        if (!video || !video.Path) {
            return null;
        }

        const normalizedPath = normalizeVideoPath(video.Path, runDir);

        return {
            sceneId: scene.SceneId,
            Path: normalizedPath,
            Status: video.Status,
            DurationSeconds: video.DurationSeconds,
            UpdatedAt: video.UpdatedAt,
            Error: video.Error,
        };
    }

    async regenerateScene(
        sceneId: string,
        options?: {
            prompt?: string;
            negativePrompt?: string;
        }
    ): Promise<void> {
        // Attempt to call a local regeneration endpoint if available. This is
        // intentionally best-effort; failures are logged but not thrown so the
        // UI remains responsive even when the backend is not running.
        let endpoint = 'http://127.0.0.1:43210/api/scene/regenerate';
        if (typeof window !== 'undefined') {
            const w = window as any;
            if (w.__SCENE_REGEN_ENDPOINT__) {
                endpoint = String(w.__SCENE_REGEN_ENDPOINT__);
            } else if (w.importMetaEnv?.VITE_SCENE_REGEN_ENDPOINT) {
                endpoint = String(w.importMetaEnv.VITE_SCENE_REGEN_ENDPOINT);
            }
        }

        if (typeof fetch !== 'function') {
            // eslint-disable-next-line no-console
            console.warn(
                `[SceneVideoManager] regenerateScene("${sceneId}") requested but fetch is not available; ` +
                    'ensure this is called from a browser environment.'
            );
            return;
        }

        try {
            const payload: Record<string, unknown> = { sceneId };
            if (options?.prompt !== undefined) {
                payload.prompt = options.prompt;
            }
            if (options?.negativePrompt !== undefined) {
                payload.negativePrompt = options.negativePrompt;
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[SceneVideoManager] regenerateScene("${sceneId}") failed: ` +
                        `HTTP ${response.status} ${response.statusText}`
                );
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
                `[SceneVideoManager] regenerateScene("${sceneId}") error: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }
}

function normalizeVideoPath(path: string, runDir?: string): string {
    // If the path looks absolute (starts with http or a drive), return as-is.
    if (/^https?:\/\//i.test(path) || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')) {
        return path;
    }

    if (!runDir) {
        return path.replace(/\\/g, '/');
    }

    const trimmedRunDir = runDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const trimmedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');

    return `${trimmedRunDir}/${trimmedPath}`;
}

let sceneVideoManager: SceneVideoManager | null = null;

export function getSceneVideoManager(): SceneVideoManager {
    if (!sceneVideoManager) {
        sceneVideoManager = new DefaultSceneVideoManager();
    }
    return sceneVideoManager;
}

export function resetSceneVideoManager(): void {
    sceneVideoManager = null;
}
