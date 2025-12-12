import { describe, it, expect } from 'vitest';

import { normalizeArtifactMetadata, type ArtifactMetadata } from '../hooks';

// NOTE: these tests focus on backward-compat normalization of telemetry keys.

describe('normalizeArtifactMetadata', () => {
  it('maps camelCase telemetry keys to the contract (PascalCase) fields', () => {
    const input: ArtifactMetadata = {
      RunId: 'run-1',
      Timestamp: new Date().toISOString(),
      RunDir: 'C:/tmp/run-1',
      Story: {
        Id: 'story-1',
        Logline: 'Test logline',
        DirectorsVision: 'Test vision',
      },
      Scenes: [
        {
          SceneId: 'scene-1',
          Prompt: 'prompt',
          NegativePrompt: 'negative',
          FrameFloor: 10,
          FrameCount: 10,
          DurationSeconds: 1,
          FramePrefix: 'scene-1',
          HistoryPath: 'history.json',
          Success: true,
          MeetsFrameFloor: true,
          HistoryRetrieved: true,
          Telemetry: {
            DurationSeconds: 1,
            // legacy/camelCase variants (simulating alternate producer)
            flf2vEnabled: true,
            flf2vSource: 'last-frame',
            flf2vFallback: false,
            interpolationElapsed: '1250',
            upscaleMethod: 'RIFE',
            finalFps: '48',
            finalResolution: '1920x1080',
          } as any,
        },
      ],
      VitestLogs: {
        ComfyUI: 'comfy.log',
        E2E: 'e2e.log',
        Scripts: 'scripts.log',
      },
      Archive: 'archive.zip',
    };

    const normalized = normalizeArtifactMetadata(input);
    const telemetry = normalized.Scenes[0]?.Telemetry;

    expect(telemetry?.FLF2VEnabled).toBe(true);
    expect(telemetry?.FLF2VSource).toBe('last-frame');
    expect(telemetry?.FLF2VFallback).toBe(false);
    expect(telemetry?.InterpolationElapsed).toBe(1250);
    expect(telemetry?.UpscaleMethod).toBe('RIFE');
    expect(telemetry?.FinalFPS).toBe(48);
    expect(telemetry?.FinalResolution).toBe('1920x1080');
  });
});
