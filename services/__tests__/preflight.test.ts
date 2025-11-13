import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkServerConnection, checkSystemResources } from '../comfyUIService';

const createResponse = (opts: Partial<{ ok: boolean; status: number; body: any }> = {}) => ({
  ok: opts.ok ?? true,
  status: opts.status ?? 200,
  json: async () => opts.body ?? {},
});

describe('checkServerConnection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves when server returns valid stats', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createResponse({ body: { system: { cpu: 'x' }, devices: [{ type: 'cuda', name: 'GPU' }] } })
    );

    await expect(checkServerConnection('http://localhost:8188')).resolves.toBeUndefined();
  });

  it('throws when server responds with non-ok status', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createResponse({ ok: false, status: 500 })
    );

    await expect(checkServerConnection('http://localhost:8188')).rejects.toThrow(
      /Failed to connect to server/
    );
  });

  it('throws timeout errors specially', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    );

    await expect(checkServerConnection('http://localhost:8188')).rejects.toThrow(/timed out/);
  });
});

describe('checkSystemResources', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns GPU stats when device exists', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createResponse({
        body: {
          system: { cpu: 'x' },
          devices: [{ type: 'cuda', name: 'RTX', vram_total: 12 * 1024 ** 3, vram_free: 3 * 1024 ** 3 }],
        },
      })
    );

    const message = await checkSystemResources('http://localhost:8188');
    expect(message).toContain('GPU: RTX');
    expect(message).toContain('Free VRAM');
  });

  it('warns when VRAM is low', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createResponse({
        body: {
          system: { cpu: 'x' },
          devices: [{ type: 'cuda', name: 'RTX', vram_total: 4 * 1024 ** 3, vram_free: 1 * 1024 ** 3 }],
        },
      })
    );

    const message = await checkSystemResources('http://localhost:8188');
    expect(message).toMatch(/Low VRAM detected/i);
  });

  it('warns when no GPU is listed', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createResponse({ body: { system: {}, devices: [] } })
    );

    const message = await checkSystemResources('http://localhost:8188');
    expect(message).toContain('No dedicated GPU');
  });

  it('reports timeout as a failure message', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('delay'), { name: 'AbortError' })
    );

    const message = await checkSystemResources('http://localhost:8188');
    expect(message).toContain('timed out');
  });

  it('handles HTTP errors gracefully', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createResponse({ ok: false, status: 502 })
    );

    const message = await checkSystemResources('http://localhost:8188');
    expect(message).toContain('status: 502');
  });
});
