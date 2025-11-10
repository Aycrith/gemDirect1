import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LocalGenerationSettings } from '../../types';
import { trackPromptExecution } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: (error: unknown) => void;
  onclose?: () => void;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close() {
    this.onclose?.();
  }
}

describe('trackPromptExecution', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  const setup = (override?: Partial<LocalGenerationSettings>) => {
    const settings = createValidTestSettings();
    return { settings: { ...settings, ...override } };
  };

  it('reports queue status updates', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    trackPromptExecution(settings, 'prompt-1', onProgress);

    const ws = MockWebSocket.instances[0];
    ws.simulateMessage({ type: 'status', data: { queue_remaining: 4 } });

    expect(onProgress).toHaveBeenCalledWith({
      status: 'queued',
      message: 'In queue... Position: 4',
      queue_position: 4,
    });
  });

  it('reports execution progress and node titles', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    trackPromptExecution(settings, 'prompt-1', onProgress);

    const ws = MockWebSocket.instances[0];
    ws.simulateMessage({ type: 'execution_start', data: { prompt_id: 'prompt-1' } });
    ws.simulateMessage({ type: 'executing', data: { prompt_id: 'prompt-1', node: 'positive_clip' } });
    ws.simulateMessage({ type: 'progress', data: { prompt_id: 'prompt-1', value: 10, max: 40 } });

    expect(onProgress).toHaveBeenCalledWith({ status: 'running', message: 'Execution started.' });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        message: 'Executing: CLIPTextEncode - Positive Prompt Layer',
        node_title: 'CLIPTextEncode - Positive Prompt Layer',
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running', progress: 25 })
    );
  });

  it('handles execution errors', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    trackPromptExecution(settings, 'prompt-1', onProgress);

    const ws = MockWebSocket.instances[0];
    ws.simulateMessage({
      type: 'execution_error',
      data: { prompt_id: 'prompt-1', node_id: 'node-5', exception_message: 'something broke' },
    });

    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'error',
      message: 'Execution error on node node-5: something broke',
    });
  });

  it('reports completion without outputs', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    trackPromptExecution(settings, 'prompt-1', onProgress);

    const ws = MockWebSocket.instances[0];
    ws.simulateMessage({ type: 'executed', data: { prompt_id: 'prompt-1', output: {} } });

    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'complete',
      message: 'Generation complete! No visual output found in final node.',
    });
  });

  it('reports websocket connection errors', () => {
    const { settings } = setup();
    const onProgress = vi.fn();
    trackPromptExecution(settings, 'prompt-1', onProgress);

    const ws = MockWebSocket.instances[0];
    ws.onerror?.(new Error('connection lost'));

    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'error',
      message: expect.stringContaining('WebSocket connection error'),
    });
  });
});
