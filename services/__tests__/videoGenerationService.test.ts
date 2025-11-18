import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSceneVideoManager, resetSceneVideoManager } from '../videoGenerationService';
import type { ArtifactSceneMetadata, SceneVideoMetadata } from '../../utils/hooks';

const createScene = (overrides: Partial<ArtifactSceneMetadata> = {}): ArtifactSceneMetadata => {
  const base: ArtifactSceneMetadata = {
    SceneId: 'scene-001',
    Prompt: 'Test prompt',
    NegativePrompt: 'neg',
    FrameFloor: 25,
    FrameCount: 0,
    DurationSeconds: 0,
    FramePrefix: 'gemdirect1_scene-001',
    HistoryPath: 'history.json',
    Success: true,
    MeetsFrameFloor: true,
    HistoryRetrieved: true,
  };

  return {
    ...base,
    ...overrides,
  };
};

const createVideo = (overrides: Partial<SceneVideoMetadata> = {}): SceneVideoMetadata => ({
  Path: 'video/scene-001.mp4',
  Status: 'ready',
  ...overrides,
});

describe('SceneVideoManager', () => {
  beforeEach(() => {
    resetSceneVideoManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when Video metadata is missing', () => {
    const manager = getSceneVideoManager();
    const scene = createScene();

    const result = manager.getSceneVideo(scene, 'logs/run-001');

    expect(result).toBeNull();
  });

  it('returns null when Video.Path is empty', () => {
    const manager = getSceneVideoManager();
    const scene = createScene({
      Video: createVideo({ Path: '' }),
    });

    const result = manager.getSceneVideo(scene, 'logs/run-001');

    expect(result).toBeNull();
  });

  it('returns normalized SceneVideoRecord for relative path + runDir', () => {
    const manager = getSceneVideoManager();
    const scene = createScene({
      Video: createVideo({ Path: 'video/scene-001.mp4' }),
    });

    const result = manager.getSceneVideo(scene, 'logs/20251114-153223');

    expect(result).not.toBeNull();
    expect(result?.sceneId).toBe('scene-001');
    expect(result?.Path).toBe('logs/20251114-153223/video/scene-001.mp4');
    expect(result?.Status).toBe('ready');
  });

  it('normalizes Windows-style relative paths and backslashes', () => {
    const manager = getSceneVideoManager();
    const scene = createScene({
      Video: createVideo({ Path: 'video\\scene-001.mp4' }),
    });

    const result = manager.getSceneVideo(scene, 'C:\\Dev\\gemDirect1\\logs\\20251114-153223\\');

    expect(result).not.toBeNull();
    expect(result?.Path).toBe('C:/Dev/gemDirect1/logs/20251114-153223/video/scene-001.mp4');
  });

  it('does not prefix absolute file paths', () => {
    const manager = getSceneVideoManager();
    const absolutePath = 'C:\\videos\\scene-001.mp4';
    const scene = createScene({
      Video: createVideo({ Path: absolutePath }),
    });

    const result = manager.getSceneVideo(scene, 'logs/run-001');

    expect(result).not.toBeNull();
    expect(result?.Path).toBe(absolutePath);
  });

  it('does not prefix http/https URLs', () => {
    const manager = getSceneVideoManager();
    const url = 'https://cdn.example.com/scene-001.mp4';
    const scene = createScene({
      Video: createVideo({ Path: url }),
    });

    const result = manager.getSceneVideo(scene, 'logs/run-001');

    expect(result).not.toBeNull();
    expect(result?.Path).toBe(url);
  });

  it('regenerateScene logs a warning when fetch is not available', async () => {
    const manager = getSceneVideoManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Ensure fetch is not defined in this test environment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = undefined;

    await expect(manager.regenerateScene('scene-001')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(
      'regenerateScene("scene-001") requested but fetch is not available'
    );
  });

  it('regenerateScene attempts HTTP call when fetch is available', async () => {
    const manager = getSceneVideoManager();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as Response);

    await expect(
      manager.regenerateScene('scene-001', {
        prompt: 'Updated prompt',
        negativePrompt: 'Updated negative',
      })
    ).resolves.toBeUndefined();

    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(typeof url).toBe('string');
    const req = options as RequestInit;
    expect(req.method).toBe('POST');
    expect(req.body).toContain('scene-001');
    expect(req.body).toContain('Updated prompt');
    expect(req.body).toContain('Updated negative');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
