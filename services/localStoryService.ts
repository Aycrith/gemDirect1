import { StoryBible, HeroArc } from '../types';

const DEFAULT_MODEL = 'mistralai/mistral-7b-instruct-v0.3';
const DEFAULT_TEMPERATURE = 0.35;
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_RESPONSE_LENGTH = 2000;

const HERO_ARC_TEMPLATES: Array<Partial<HeroArc>> = [
  { name: 'Ordinary World', summary: 'Familiar routines before the adventure', emotionalShift: 'Comfort → Quiet curiosity', importance: 7 },
  { name: 'Call to Adventure', summary: 'A new challenge beckons', emotionalShift: 'Comfort → Stirring', importance: 8 },
  { name: 'Refusal of the Call', summary: 'Hesitation and resistance to change', emotionalShift: 'Stirring → Doubt', importance: 6 },
  { name: 'Meeting the Mentor', summary: 'Guidance arrives', emotionalShift: 'Doubt → Inspiration', importance: 6 },
  { name: 'Crossing the Threshold', summary: 'Commitment to the unknown', emotionalShift: 'Inspiration → Boldness', importance: 8 },
  { name: 'Tests, Allies, Enemies', summary: 'Trials that harden resolve', emotionalShift: 'Boldness → Struggle', importance: 7 },
  { name: 'Approach to the Inmost Cave', summary: 'Preparation for the biggest challenge', emotionalShift: 'Struggle → Focused intent', importance: 7 },
  { name: 'Ordeal', summary: 'Confrontation and rebirth', emotionalShift: 'Intent → Transformation', importance: 9 },
  { name: 'Reward', summary: 'Hard-earned insight or treasure', emotionalShift: 'Transformation → Satisfaction', importance: 6 },
  { name: 'The Road Back', summary: 'Return journey begins', emotionalShift: 'Satisfaction → Pressure', importance: 5 },
  { name: 'Resurrection', summary: 'Final trial, ultimate change', emotionalShift: 'Pressure → Renewal', importance: 8 },
  { name: 'Return with the Elixir', summary: 'Sharing the gift with the world', emotionalShift: 'Renewal → Gratitude', importance: 7 },
];

const buildHeroArc = (base: Partial<HeroArc>, index: number): HeroArc => ({
  id: base.id ?? `arc-${String(index + 1).padStart(2, '0')}`,
  name: base.name ?? HERO_ARC_TEMPLATES[index]?.name ?? `Arc ${index + 1}`,
  summary: base.summary ?? HERO_ARC_TEMPLATES[index]?.summary ?? 'A critical beat of the hero journey.',
  emotionalShift: base.emotionalShift ?? HERO_ARC_TEMPLATES[index]?.emotionalShift ?? 'Shift required',
  importance: typeof base.importance === 'number' ? base.importance : HERO_ARC_TEMPLATES[index]?.importance ?? 5,
});

export const buildHeroArcList = (payloadHeroArcs?: any[]): HeroArc[] => {
  const arcs: HeroArc[] = HERO_ARC_TEMPLATES.map((template, idx) => buildHeroArc(template, idx));
  if (!Array.isArray(payloadHeroArcs)) {
    return arcs;
  }
  payloadHeroArcs.forEach((arcData, idx) => {
    if (idx < arcs.length) {
      const override = buildHeroArc(arcData, idx);
      arcs[idx] = override;
    } else {
      arcs.push(buildHeroArc(arcData, idx));
    }
  });
  return arcs;
};

const deriveSceneHeroArcMeta = (scenePayload: any, heroArcs: HeroArc[], index: number) => {
  const requestedId = scenePayload?.heroArcId ?? scenePayload?.arcId ?? scenePayload?.heroArc?.id;
  let heroArc = heroArcs.find(arc => arc.id === requestedId);
  if (!heroArc) {
    heroArc = heroArcs[Math.min(index, heroArcs.length - 1)];
  }
  return {
    heroArcId: heroArc?.id,
    heroArcName: heroArc?.name,
    heroArcSummary: heroArc?.summary,
    heroArcOrder: heroArc ? heroArcs.indexOf(heroArc) + 1 : index + 1,
  };
};

export { deriveSceneHeroArcMeta };

interface LocalLLMResult<T> {
  data: T;
  metadata: {
    durationMs: number;
    seed?: string;
    model: string;
    warning?: string;
  };
}

interface LLMConfig {
  url: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  format: 'openai-chat' | 'direct-json';
  seed?: string;
  proxyBase: string;
}

interface LocalStoryScene {
  title: string;
  summary: string;
  mood?: string;
  prompt?: string;
  cameraMovement?: string;
  heroArcId?: string;
  heroArcName?: string;
  heroArcSummary?: string;
  heroArcOrder?: number;
  shotPurpose?: string;
}

interface LocalStoryBlueprint {
  logline: string;
  characters: string;
  setting: string;
  plotOutline: string;
  directorsVision: string;
  heroArcs: HeroArc[];
  scenes: LocalStoryScene[];
}

const getConfig = (): LLMConfig => {
  const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
  const url = env.VITE_LOCAL_STORY_PROVIDER_URL ?? '';
  if (!url) {
    throw new Error('Local story provider URL is missing. Set VITE_LOCAL_STORY_PROVIDER_URL to the LM Studio endpoint.');
  }

  const format = (env.VITE_LOCAL_LLM_REQUEST_FORMAT as 'openai-chat' | 'direct-json') ?? 'openai-chat';
  const model = env.VITE_LOCAL_LLM_MODEL ?? DEFAULT_MODEL;
  const temperature = Number(env.VITE_LOCAL_LLM_TEMPERATURE ?? DEFAULT_TEMPERATURE);
  const timeoutMs = Number(env.VITE_LOCAL_LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const seed = env.VITE_LOCAL_LLM_SEED;
  const proxyBase = env.VITE_LOCAL_STORY_PROXY_PATH ?? '/local-llm';

  return { url, model, temperature, timeoutMs, format, seed, proxyBase };
};

const stripFence = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  return trimmed;
};

const buildPayload = (config: LLMConfig, userContent: string) => {
  if (config.format === 'openai-chat') {
    const messages = [{ role: 'user', content: userContent }];
    return {
      model: config.model,
      temperature: config.temperature,
      messages,
      max_tokens: MAX_RESPONSE_LENGTH,
      ...(config.seed ? { seed: config.seed } : {}),
    };
  }
  return {
    prompt: `${userContent}`,
    model: config.model,
    temperature: config.temperature,
    max_tokens: MAX_RESPONSE_LENGTH,
    ...(config.seed ? { seed: config.seed } : {}),
  };
};

import * as localFallback from './localFallbackService';

const parseJson = (raw: string) => {
  try {
    return JSON.parse(stripFence(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new Error(`Failed to parse JSON returned by local LLM: ${message}`);
  }
};

const sendRequest = async (prompt: string, context: string): Promise<LocalLLMResult<any>> => {
  const config = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(config.proxyBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(config, prompt)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Local LLM responded with ${response.status}: ${details}`);
    }

    const text = await response.text();
    if (!text) {
      throw new Error('Local LLM returned an empty response.');
    }

    const data = parseJson(text);
    const durationMs = Date.now() - startedAt;
    const warning = Array.isArray(data.warnings)
      ? data.warnings.join('; ')
      : typeof data.warning === 'string'
        ? data.warning
        : undefined;
    console.info(`[localStoryService] ${context} responded in ${durationMs}ms (seed=${config.seed ?? 'n/a'}, model=${config.model}) warning=${warning ?? 'none'}`);
    return {
      data,
      metadata: {
        durationMs,
        seed: config.seed,
        model: config.model,
        warning,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
};

const logLLMMetadata = (operation: string, metadata: LocalLLMResult<any>['metadata']) => {
  console.info(`[localStoryService:${operation}] ${metadata.durationMs}ms (seed=${metadata.seed ?? 'n/a'}, model=${metadata.model}) warning=${metadata.warning ?? 'none'}`);
};

const HERO_ARC_PROMPT_LIST = HERO_ARC_TEMPLATES.map((entry, index) => `${index + 1}. ${entry.name}`).join(', ');

export const generateStoryBlueprint = async (idea: string, genre: string, sceneCount = 3): Promise<LocalStoryBlueprint> => {
    const prompt = `Generate a cinematic story bible for the idea below. Reply with a JSON object containing only valid JSON with the following fields: logline, characters, setting, plotOutline, directorsVision, heroArcs (array of 12 hero's-journey arcs with id, name, summary, emotionalShift, importance), and scenes (array with title, summary, heroArcId referencing heroArcs, shotPurpose, mood, prompt, cameraMovement). Idea: "${idea}" Genre: "${genre}" Scene count: ${sceneCount}. Use the hero arc list: ${HERO_ARC_PROMPT_LIST}.`;
    try {
        const { data: payload, metadata } = await sendRequest(prompt, 'story bible generation');
        logLLMMetadata('generateStoryBlueprint', metadata);
        if (!payload.logline || !payload.plotOutline || !Array.isArray(payload.scenes)) {
            throw new Error('Local LLM returned malformed story bible data.');
        }
        const heroArcs = buildHeroArcList(payload.heroArcs);
        return {
            logline: String(payload.logline),
            characters: String(payload.characters ?? ''),
            setting: String(payload.setting ?? ''),
            plotOutline: String(payload.plotOutline),
            directorsVision: String(payload.directorsVision ?? ''),
            heroArcs,
            scenes: payload.scenes.map((scene: any, index: number) => {
                const arcMeta = deriveSceneHeroArcMeta(scene, heroArcs, index);
                return {
                    title: String(scene.title ?? `Untitled Scene ${index + 1}`),
                    summary: String(scene.summary ?? 'Pending summary.'),
                    mood: scene.mood,
                    prompt: scene.prompt,
                    cameraMovement: scene.cameraMovement,
                    heroArcId: arcMeta.heroArcId,
                    heroArcName: arcMeta.heroArcName,
                    heroArcSummary: arcMeta.heroArcSummary,
                    heroArcOrder: arcMeta.heroArcOrder,
                    shotPurpose: scene.shotPurpose ?? scene.purpose ?? 'Establish the scene',
                };
            }),
        };
    } catch (error) {
        console.warn('[localStoryService] Local LLM story bible generation failed, falling back to template data.', error);
        return localFallback.generateStoryBible(idea, genre);
    }
};

export const generateLocalSceneList = async (plotOutline: string, directorsVision: string, sceneCount = 3): Promise<Array<{ title: string; summary: string }>> => {
    const prompt = `Based on the following plot outline and director's vision, provide JSON with a 'scenes' array where each entry has title and summary. Plot Outline: "${plotOutline}" Director's Vision: "${directorsVision}" Scene count: ${sceneCount}`;
    try {
        const { data: response, metadata } = await sendRequest(prompt, 'scene list generation');
        logLLMMetadata('generateLocalSceneList', metadata);
        if (!Array.isArray(response.scenes) || response.scenes.length === 0) {
            throw new Error('Local LLM returned no scenes.');
        }
        return response.scenes.slice(0, sceneCount).map((scene: any) => ({
            title: String(scene.title ?? 'Untitled Scene'),
            summary: String(scene.summary ?? 'Summary pending.'),
        }));
    } catch (error) {
        console.warn('[localStoryService] Local LLM scene list generation failed, falling back to template data.', error);
        return localFallback.generateSceneList(plotOutline, directorsVision);
    }
};

const ensureArray = (value: any): string[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return [String(value)];
};

export const suggestStoryIdeas = async (): Promise<string[]> => {
  const prompt = `You are an imaginative cinematic storyteller. Reply with JSON {"ideas":[...]} containing three one-sentence story ideas with a unique setting and tone.`;
  try {
    const { data, metadata } = await sendRequest(prompt, 'suggest story ideas');
    logLLMMetadata('suggestStoryIdeas', metadata);
    const ideas = ensureArray(data.ideas).filter(Boolean);
    if (ideas.length === 0) {
      throw new Error('LLM returned no story ideas.');
    }
    return ideas;
  } catch (error) {
    console.warn('[localStoryService] suggestStoryIdeas failed, falling back to preset ideas.', error);
    return localFallback.suggestStoryIdeas();
  }
};

export const suggestDirectorsVisions = async (storyBible: StoryBible): Promise<string[]> => {
  const prompt = `Given the story bible below, provide JSON {"visions":[...]} with three director visions focusing on mood, framing, and palette. Story Bible: logline="${storyBible.logline}" characters="${storyBible.characters}" setting="${storyBible.setting}" plotOutline="${storyBible.plotOutline}"`;
  try {
    const { data, metadata } = await sendRequest(prompt, 'suggest directors visions');
    logLLMMetadata('suggestDirectorsVisions', metadata);
    const visions = ensureArray(data.visions).filter(Boolean);
    if (visions.length === 0) {
      throw new Error('LLM returned no director visions.');
    }
    return visions;
  } catch (error) {
    console.warn('[localStoryService] suggestDirectorsVisions failed, falling back to preset suggestions.', error);
    return localFallback.suggestDirectorsVisions(storyBible);
  }
};

export const refineDirectorsVision = async (vision: string, storyBible: StoryBible): Promise<string> => {
  const prompt = `Refine this director's vision with vivid visual cues, ensuring it stays grounded by the logline "${storyBible.logline}" and the emotional stakes of the plot. Vision: "${vision}"`;
  try {
    const { data, metadata } = await sendRequest(prompt, 'refine director vision');
    logLLMMetadata('refineDirectorsVision', metadata);
    if (typeof data.vision !== 'string' || !data.vision.trim()) {
      throw new Error('LLM returned invalid vision.');
    }
    return data.vision.trim();
  } catch (error) {
    console.warn('[localStoryService] refineDirectorsVision failed, falling back to preset guidance.', error);
    return localFallback.refineDirectorsVision(vision, storyBible);
  }
};

export const suggestCoDirectorObjectives = async (
  logline: string,
  sceneSummary: string,
  directorsVision: string
): Promise<string[]> => {
  const prompt = `You are the AI Co-Director. Based on the logline "${logline}", the scene summary "${sceneSummary}", and the director's vision "${directorsVision}", output JSON {"objectives":[...]} with at least two actionable objectives for pacing, composition, or lighting.`;
  try {
    const { data, metadata } = await sendRequest(prompt, 'co-director objectives');
    logLLMMetadata('suggestCoDirectorObjectives', metadata);
    const objectives = ensureArray(data.objectives).filter(Boolean);
    if (objectives.length === 0) {
      throw new Error('LLM returned no objectives.');
    }
    return objectives;
  } catch (error) {
    console.warn('[localStoryService] suggestCoDirectorObjectives failed, falling back to preset priorities.', error);
    return localFallback.suggestCoDirectorObjectives(logline, sceneSummary, directorsVision);
  }
};
