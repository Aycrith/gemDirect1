import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeKeyframeGeneration, executeVideoGeneration } from '../pipelineTaskRegistry';
import { queueComfyUIPromptWithQueue } from '../comfyUIService';
import { useSettingsStore } from '../settingsStore';

vi.mock('../comfyUIService', () => ({
  queueComfyUIPromptWithQueue: vi.fn(),
  waitForComfyCompletion: vi.fn(),
  stripDataUrlPrefix: (value: string) => {
    const parts = value.split(',');
    return parts.length > 1 ? parts.slice(1).join(',') : value;
  }
}));

vi.mock('../settingsStore', () => ({
  useSettingsStore: {
    getState: vi.fn()
  }
}));

describe('PipelineTaskRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore.getState as any).mockReturnValue({
      comfyUIUrl: 'http://localhost:8188'
    });
  });

  it('executeKeyframeGeneration should queue prompt and wait for completion', async () => {
    const task = {
      id: 't1',
      type: 'generate_keyframe',
      payload: { prompt: 'test prompt', sceneId: 's1', shotId: 'sh1' }
    } as any;

    // Mock successful completion
    (queueComfyUIPromptWithQueue as any).mockResolvedValue({ images: ['img1'] });

    const result = await executeKeyframeGeneration(task);

    expect(queueComfyUIPromptWithQueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: 'test prompt' }),
      '',
      'wan-t2i',
      expect.objectContaining({ sceneId: 's1', shotId: 'sh1', waitForCompletion: true })
    );
    expect(result).toEqual({ images: ['img1'] });
  });

  it('executeVideoGeneration should resolve keyframe from dependencies', async () => {
    const task = {
      id: 't2',
      type: 'generate_video',
      payload: { prompt: 'test prompt', sceneId: 's1', shotId: 'sh1' }
    } as any;

    const context = {
      dependencies: {
        't1': {
          id: 't1',
          type: 'generate_keyframe',
          output: { images: ['data:image/png;base64,abc'] }
        } as any
      }
    };

    // Mock successful completion
    (queueComfyUIPromptWithQueue as any).mockResolvedValue({ videos: ['vid1'] });

    const result = await executeVideoGeneration(task, context);

    expect(queueComfyUIPromptWithQueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'abc', // Stripped prefix
      'wan-i2v',
      expect.objectContaining({ sceneId: 's1', shotId: 'sh1', waitForCompletion: true })
    );
    expect(result).toEqual({ 
      videos: ['vid1'],
      metadata: {
        flf2vEnabled: false,
        flf2vFallback: false,
        flf2vSource: 'keyframe'
      }
    });
  });
});
