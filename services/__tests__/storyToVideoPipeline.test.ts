import { describe, it, expect, vi } from 'vitest';
import { generateStoryToVideo } from '../storyToVideoPipeline';
import type { LocalGenerationSettings } from '../../types';

describe('storyToVideoPipeline.generateStoryToVideo', () => {
  const settings: LocalGenerationSettings = {
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: 'test-client',
    workflowJson: '{}',
    mapping: {},
    workflowProfiles: {
      'wan-t2i': { workflowJson: '{}', mapping: {} },
      'wan-i2v': { workflowJson: '{}', mapping: {} },
    },
  } as any;

  it('propagates hero arcs into scenes and seeds shot arc metadata', async () => {
    // Mock localStoryService responses by monkey-patching module exports
    const mod = await vi.importActual<any>('../localStoryService');
    const spyBlueprint = vi.spyOn(mod, 'generateStoryBlueprint').mockResolvedValue({
      logline: 'Hero journeys',
      characters: 'Protagonist, Mentor',
      setting: 'City',
      plotOutline: 'Arc-based outline',
      heroArcs: Array.from({ length: 12 }, (_, i) => ({ id: `arc-${String(i + 1).padStart(2, '0')}`, name: `Arc ${i + 1}`, summary: 's', emotionalShift: 'x', importance: 5 })),
    });
    const spyScenes = vi.spyOn(mod, 'generateLocalSceneList').mockResolvedValue([
      { title: 'Scene 1', summary: 'S1 sum' },
      { title: 'Scene 2', summary: 'S2 sum' },
    ]);

    const result = await generateStoryToVideo({
      idea: 'test',
      genre: 'sci-fi',
      directorsVision: 'vision',
      settings,
    });

    expect(spyBlueprint).toHaveBeenCalled();
    expect(spyScenes).toHaveBeenCalled();
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0].heroArcId).toBe('arc-01');
    expect(result.scenes[0].timeline.shots[0].arcId).toBeDefined();
    expect(result.scenes[0].timeline.shots[0].heroMoment).toBe(true);
  });
});

