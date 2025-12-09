import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueComfyUIPrompt } from '../comfyUIService';
import { createValidTestSettings } from './fixtures';

const makeResponse = (opts: Partial<{ ok: boolean; status: number; body: any }> = {}) => ({
  ok: opts.ok ?? true,
  status: opts.status ?? 200,
  async json() {
    return opts.body ?? {};
  },
});

describe('queueComfyUIPrompt integration', () => {
  const payloads = {
    json: JSON.stringify({ shot_id: 'shot-99', description: 'Test description' }),
    text: 'A stormy horizon bathed in neon',
    structured: [{ note: 'scene detail' }],
    negativePrompt: 'blurry',
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads the keyframe and injects prompts into the workflow payload', async () => {
    const settings = createValidTestSettings();
    const recordedBodies: any[] = [];
    let systemStatsCallCount = 0;

    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url, options) => {
      if (url.endsWith('/system_stats')) {
        systemStatsCallCount += 1;
        return makeResponse({
          body: {
            system: { cpu: 'x' },
            devices: [{ type: 'cuda', name: 'RTX', vram_total: 4 * 1024 ** 3, vram_free: 3 * 1024 ** 3 }],
          },
        });
      }

      if (url.includes('/upload/image')) {
        return makeResponse({
          body: { name: 'uploaded-keyframe.jpg' },
        });
      }

      if (url.includes('/prompt')) {
        recordedBodies.push(JSON.parse((options as RequestInit).body as string));
        return makeResponse({ body: { prompt_id: 'queue-555' } });
      }

      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const response = await queueComfyUIPrompt(settings, payloads, 'data:image/jpeg;base64,IMG');
    expect(response).not.toBeNull();
    expect(response!.prompt_id).toBe('queue-555');
  expect(response!.systemResources).toContain('GPU: RTX');
  expect(systemStatsCallCount).toBeGreaterThanOrEqual(2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/upload/image'), expect.anything());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/prompt'), expect.anything());

    const queuedPayload = recordedBodies[0];
    expect(queuedPayload.prompt.positive_clip.inputs.text).toContain('stormy horizon');
    expect(queuedPayload.prompt.negative_clip.inputs.text).toContain('blurry');
    expect(queuedPayload.prompt.timeline_json.inputs.text).toBe(payloads.json);
    expect(queuedPayload.prompt.keyframe_loader.inputs.image).toBe('uploaded-keyframe.jpg');
    expect(queuedPayload.client_id).toBe(settings.comfyUIClientId);
  });
});
