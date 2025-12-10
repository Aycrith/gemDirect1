import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeKeyframeGeneration, executeVideoGeneration } from '../pipelineTaskRegistry';
import { queueComfyUIPrompt, trackPromptExecution } from '../comfyUIService';
import { useSettingsStore } from '../settingsStore';

vi.mock('../comfyUIService', () => ({
  queueComfyUIPrompt: vi.fn(),
  trackPromptExecution: vi.fn()
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
      payload: { prompt: 'test prompt' }
    } as any;

    (queueComfyUIPrompt as any).mockResolvedValue({ prompt_id: 'p1' });
    (trackPromptExecution as any).mockImplementation((_settings: any, _id: any, cb: any) => {
      cb({ status: 'complete', final_output: { images: ['img1'] } });
    });

    const result = await executeKeyframeGeneration(task);

    expect(queueComfyUIPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: 'test prompt' }),
      '',
      'wan-t2i'
    );
    expect(result).toEqual({ images: ['img1'] });
  });

  it('executeVideoGeneration should resolve keyframe from dependencies', async () => {
    const task = {
      id: 't2',
      type: 'generate_video',
      payload: { prompt: 'test prompt' }
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

    (queueComfyUIPrompt as any).mockResolvedValue({ prompt_id: 'p2' });
    (trackPromptExecution as any).mockImplementation((_settings: any, _id: any, cb: any) => {
      cb({ status: 'complete', final_output: { video: 'vid1' } });
    });

    const result = await executeVideoGeneration(task, context);

    expect(queueComfyUIPrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'abc', // Stripped prefix
      'wan-i2v'
    );
    expect(result).toEqual({ video: 'vid1' });
  });
});
