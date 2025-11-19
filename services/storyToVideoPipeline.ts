import type { StoryBible, LocalGenerationSettings, TimelineData, Shot, HeroArc, CreativeEnhancers } from '../types';
import { DEFAULT_NEGATIVE_PROMPT } from './comfyUIService';
import { generateStoryBlueprint, generateLocalSceneList } from './localStoryService';

export interface StoryToVideoResult {
  storyId: string;
  storyBible: StoryBible;
  scenes: StorySceneResult[];
  totalDuration: number;
  status: 'pending' | 'complete';
}

export interface StorySceneResult {
  id: string;
  title: string;
  summary: string;
  timeline: TimelineData;
  heroArcId?: string;
  heroArcName?: string;
  heroArcSummary?: string;
  heroArcOrder?: number;
  shotPurpose?: string;
  heroMoment?: boolean;
}

const sanitizeId = (value: string, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const buildSceneTimeline = (
  sceneSummary: string,
  heroArc?: HeroArc,
  index?: number,
  settings?: LocalGenerationSettings
): TimelineData => {
  const safeIndex = isNaN(Number(index)) ? 0 : Number(index);
  const shotBase = `scene-${safeIndex + 1}`;
  const description = `${sceneSummary} ${heroArc ? `(${heroArc.name} beat)` : ''}`.trim();

  const shots: Shot[] = [
    {
      id: `${shotBase}-establish`,
      description: `${description} - Establishing the stakes and palette.`,
      purpose: heroArc ? `Open the ${heroArc.name} arc.` : 'Establish stakes.',
      arcId: heroArc?.id,
      arcName: heroArc?.name,
      heroMoment: true,
    },
    {
      id: `${shotBase}-close`,
      description: `${description} - Heroic moment that hints at transformation.`,
      purpose: heroArc ? `Advance the ${heroArc.name} arc.` : 'Elevate the emotional beat.',
      arcId: heroArc?.id,
      arcName: heroArc?.name,
      heroMoment: heroArc ? true : false,
    },
  ];

  const shotEnhancers: Record<string, Partial<Omit<CreativeEnhancers, 'transitions'>>> = {};
  shots.forEach((shot, idx) => {
    shotEnhancers[shot.id] = {
      framing: idx === 0 ? ['Wide establishing'] : ['Tight close-up'],
      lighting: ['Cinematic key/soft fill'],
      mood: heroArc ? [heroArc.name, 'Resolute'] : ['Evocative'],
      vfx: ['Subtle grain'],
      lens: ['35mm storytelling'],
    };
  });

  const providerLabel = settings?.comfyUIUrl ? 'local ComfyUI' : 'default generator';

  return {
    shots,
    shotEnhancers,
    transitions: ['Cut'],
    negativePrompt: `${DEFAULT_NEGATIVE_PROMPT} (tuned for ${providerLabel})`,
  };
};

export const generateStoryToVideo = async (options: {
  idea: string;
  genre?: string;
  directorsVision: string;
  settings: LocalGenerationSettings;
}): Promise<StoryToVideoResult> => {
  const storyBible = await generateStoryBlueprint(options.idea, options.genre);
  const sceneSummaries = await generateLocalSceneList(storyBible.plotOutline, options.directorsVision);
  const heroArcs = storyBible.heroArcs ?? [];

  const scenes: StorySceneResult[] = sceneSummaries.map((scene, index) => {
    const arc = heroArcs[index % Math.max(1, heroArcs.length)];
    const sceneId = sanitizeId(scene.title, `scene-${index + 1}`);
    const timeline = buildSceneTimeline(scene.summary, arc, index, options.settings);

    return {
      id: sceneId,
      title: scene.title || `Scene ${index + 1}`,
      summary: scene.summary,
      timeline,
      heroArcId: arc?.id,
      heroArcName: arc?.name,
      heroArcSummary: arc?.summary,
      heroArcOrder: arc ? Number(arc.id.split('-')[1]) || index + 1 : index + 1,
      shotPurpose: arc ? `Advance ${arc.name}` : undefined,
      heroMoment: true,
    };
  });

  return {
    storyId: sanitizeId(storyBible.logline, `story-${Date.now()}`),
    storyBible,
    scenes,
    totalDuration: scenes.length * 6,
    status: 'pending',
  };
};

