import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LocalGenerationSettings } from '../../types';
import { trackPromptExecution } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';
import { comfyEventManager } from '../comfyUIEventManager';

// Mock the comfyEventManager
vi.mock('../comfyUIEventManager', () => ({
  comfyEventManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    connect: vi.fn(),
  },
}));

describe('trackPromptExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const setup = (override?: Partial<LocalGenerationSettings>) => {
    const settings = createValidTestSettings();
    return { settings: { ...settings, ...override } };
  };

  it('reports queue status updates', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    const promptId = 'prompt-1';

    trackPromptExecution(settings, promptId, onProgress);

    // Verify subscribe was called
    expect(comfyEventManager.subscribe).toHaveBeenCalledWith(promptId, expect.any(Function));

    // Get the callback
    const callback = vi.mocked(comfyEventManager.subscribe).mock.calls[0]![1];

    // Simulate status message
    callback({ type: 'status', data: { queue_remaining: 4 }, raw: {} });

    expect(onProgress).toHaveBeenCalledWith({
      status: 'queued',
      message: 'In queue... Position: 4',
      queue_position: 4,
      promptId: 'prompt-1',
    });
  });

  it('reports execution progress and node titles', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    const promptId = 'prompt-1';

    trackPromptExecution(settings, promptId, onProgress);

    const callback = vi.mocked(comfyEventManager.subscribe).mock.calls[0]![1];

    // Simulate execution start
    callback({ type: 'execution_start', data: { prompt_id: promptId }, raw: {} });
    expect(onProgress).toHaveBeenCalledWith({ status: 'running', message: 'Execution started.', promptId });

    // Simulate executing node
    callback({ type: 'executing', data: { prompt_id: promptId, node: 'positive_clip' }, raw: {} });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        message: 'Executing: CLIPTextEncode - Positive Prompt Layer',
        node_title: 'CLIPTextEncode - Positive Prompt Layer',
        promptId,
      })
    );

    // Simulate progress
    callback({ type: 'progress', data: { prompt_id: promptId, value: 10, max: 40 }, raw: {} });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running', progress: 25, promptId })
    );
  });

  it('handles execution errors', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    const promptId = 'prompt-1';

    trackPromptExecution(settings, promptId, onProgress);

    const callback = vi.mocked(comfyEventManager.subscribe).mock.calls[0]![1];

    callback({
      type: 'execution_error',
      data: { prompt_id: promptId, node_id: 'node-5', exception_message: 'something broke' },
      raw: {}
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'error',
      message: 'ComfyUI error (node node-5): something broke',
      promptId,
    });
  });

  it('reports completion without outputs', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    const promptId = 'prompt-1';

    trackPromptExecution(settings, promptId, onProgress);

    const callback = vi.mocked(comfyEventManager.subscribe).mock.calls[0]![1];

    callback({ type: 'executed', data: { prompt_id: promptId, output: {} }, raw: {} });

    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'complete',
      message: 'Generation complete! No visual output found in final node.',
      promptId,
    });
  });
});
