import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as localStoryService from '../localStoryService';

describe('localStoryService.generateStoryBlueprint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).window?.LOCAL_STORY_PROVIDER_URL;
    vi.restoreAllMocks();
  });

  it('falls back to deterministic blueprint when no provider URL is configured', async () => {
    const result = await localStoryService.generateStoryBlueprint('A hero finds a map', 'adventure');
    expect(result).toBeTruthy();
    expect(Array.isArray(result.heroArcs)).toBe(true);
    expect(result.heroArcs?.length).toBe(12);
    expect(result.logline).toBeTruthy();
  });

  it('parses well-formed JSON from provider and normalizes to 12 hero arcs', async () => {
    (globalThis as any).window = { LOCAL_STORY_PROVIDER_URL: 'http://127.0.0.1:12345/v1/chat/completions' } as any;

    const fakeResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              logline: 'Concise arc-aware logline',
              characters: 'Two leads',
              setting: 'Futuristic city',
              plotOutline: 'Three acts',
              heroArcs: Array.from({ length: 12 }, (_, i) => ({ id: `arc-${(i + 1).toString().padStart(2, '0')}`, name: `Arc ${i+1}` })),
            }),
          },
        },
      ],
    } as any;

    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => fakeResponse } as any);

    const result = await localStoryService.generateStoryBlueprint('A hero finds a map', 'adventure');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.heroArcs?.length).toBe(12);
    expect(result.logline).toBe('Concise arc-aware logline');
  });

  it('handles malformed provider output and returns fallback blueprint', async () => {
    (globalThis as any).window = { LOCAL_STORY_PROVIDER_URL: 'http://127.0.0.1:12345/v1/chat/completions' } as any;
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) } as any);

    const result = await localStoryService.generateStoryBlueprint('Map', 'adventure');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.heroArcs?.length).toBe(12);
    expect(result.logline).toBeTruthy();
  });
});

