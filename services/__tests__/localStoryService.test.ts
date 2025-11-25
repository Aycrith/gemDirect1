import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateStoryBlueprint } from '../localStoryService';

describe('localStoryService.generateStoryBlueprint', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear window-level settings
    if ((globalThis as any).window) {
      delete (globalThis as any).window.LOCAL_STORY_PROVIDER_URL;
      delete (globalThis as any).window.__localGenSettings;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if ((globalThis as any).window) {
      delete (globalThis as any).window.LOCAL_STORY_PROVIDER_URL;
      delete (globalThis as any).window.__localGenSettings;
    }
  });

  it('falls back to deterministic blueprint when fetch fails', async () => {
    // Mock fetch to fail - simulating no provider or network error
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    
    const result = await generateStoryBlueprint('A hero finds a map', 'adventure');
    expect(result).toBeTruthy();
    expect(Array.isArray(result.heroArcs)).toBe(true);
    expect(result.heroArcs?.length).toBe(12);
    expect(result.logline).toBeTruthy();
  });

  it('parses well-formed JSON from provider and normalizes to 12 hero arcs', async () => {
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
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ 
      ok: true, 
      json: async () => fakeResponse 
    } as Response);

    const result = await generateStoryBlueprint('A hero finds a map', 'adventure');

    expect(result.heroArcs?.length).toBe(12);
    expect(result.logline).toBe('Concise arc-aware logline');
  });

  it('handles malformed provider output and returns fallback blueprint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ 
      ok: true, 
      json: async () => ({ choices: [{ message: { content: 'not json' } }] }) 
    } as Response);

    const result = await generateStoryBlueprint('Map', 'adventure');

    expect(result.heroArcs?.length).toBe(12);
    expect(result.logline).toBeTruthy();
  });
});