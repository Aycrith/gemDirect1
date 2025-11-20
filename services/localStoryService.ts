import type { StoryBible, HeroArc } from '../types';
import * as localFallback from './localFallbackService';

interface HeroArcTemplate {
  id: string;
  name: string;
  summary: string;
  emotionalShift: string;
  importance: number;
}

const HERO_ARC_LIBRARY: HeroArcTemplate[] = [
  { id: 'arc-01', name: 'Ordinary World', summary: 'Introduce the hero in their regular environment before anything has changed.', emotionalShift: 'Calm → restless', importance: 5 },
  { id: 'arc-02', name: 'Call to Adventure', summary: 'A disruptive event invites the hero into a new possibility or threat.', emotionalShift: 'Curiosity → unease', importance: 6 },
  { id: 'arc-03', name: 'Refusal of the Call', summary: 'The hero hesitates, doubting their ability to act or fearing change.', emotionalShift: 'Self-doubt → resolve', importance: 5 },
  { id: 'arc-04', name: 'Meeting the Mentor', summary: 'A guide or mentor provides tools, knowledge, or perspective to help the hero commit.', emotionalShift: 'Confusion → clarity', importance: 6 },
  { id: 'arc-05', name: 'Crossing the Threshold', summary: 'The hero commits and crosses into the unfamiliar territory of the story.', emotionalShift: 'Comfort → commitment', importance: 7 },
  { id: 'arc-06', name: 'Tests, Allies, Enemies', summary: 'Challenges reveal allies and antagonists while the hero learns the rules of the new world.', emotionalShift: 'Uncertainty → confidence', importance: 6 },
  { id: 'arc-07', name: 'Approach to the Inmost Cave', summary: 'The hero prepares for the biggest trial by gathering resources and confronting fears.', emotionalShift: 'Anxiety → focus', importance: 7 },
  { id: 'arc-08', name: 'Ordeal', summary: 'A central crisis forces the hero to face death, loss, or transformation.', emotionalShift: 'Despair → awakening', importance: 8 },
  { id: 'arc-09', name: 'Reward', summary: 'After surviving the ordeal, the hero earns a prize, insight, or affirmation.', emotionalShift: 'Exhaustion → relief', importance: 6 },
  { id: 'arc-10', name: 'The Road Back', summary: 'The hero redeploys lessons to return home, often chased by consequences.', emotionalShift: 'Momentum → urgency', importance: 6 },
  { id: 'arc-11', name: 'Resurrection', summary: 'A final test proves everything the hero has learned is now internalized.', emotionalShift: 'Doubt → mastery', importance: 8 },
  { id: 'arc-12', name: 'Return with the Elixir', summary: 'The hero returns to their world changed and able to share the reward.', emotionalShift: 'Isolation → generosity', importance: 7 },
];

interface StoryBlueprintResponse {
  logline?: string;
  characters?: string;
  setting?: string;
  plotOutline?: string;
  heroArcs?: Partial<HeroArc>[];
}

const DEFAULT_MODEL = import.meta.env.VITE_LOCAL_LLM_MODEL ?? 'mistralai/mistral-7b-instruct-v0.3';
const DEFAULT_TEMPERATURE = Number(import.meta.env.VITE_LOCAL_LLM_TEMPERATURE ?? 0.35);
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_LOCAL_LLM_TIMEOUT_MS ?? 120000);
const DEFAULT_REQUEST_FORMAT = import.meta.env.VITE_LOCAL_LLM_REQUEST_FORMAT ?? 'openai-chat';
const DEFAULT_SEED = import.meta.env.VITE_LOCAL_LLM_SEED;
const FALLBACK_TIMEOUT = 120000;

const getSettings = () => {
  if (typeof window !== 'undefined') {
    return (window as any).__localGenSettings || {};
  }
  return {};
};

const getLocalStoryProviderUrl = (): string | null => {
  const settings = getSettings();
  
  // Priority: settings > env > window.LOCAL_STORY_PROVIDER_URL
  const url = settings.llmProviderUrl || import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL;
  
  if (url) {
    // In browser context during development, use Vite proxy to avoid CORS
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      return '/api/local-llm';
    }
    return url;
  }
  
  if (typeof window !== 'undefined') {
    const win = window as Window & { LOCAL_STORY_PROVIDER_URL?: string };
    return win.LOCAL_STORY_PROVIDER_URL ?? null;
  }
  return null;
};

const buildSystemMessage = () =>
  'You are the gemDirect1 narrative designer. Return strict JSON with keys logline, characters, setting, plotOutline, heroArcs, and an array of scenes. heroArcs must contain exactly twelve entries with id, name, summary, emotionalShift, and importance (1-10). Scenes should each reference a heroArcId and include heroArcName, heroArcSummary, heroArcOrder, shotPurpose, heroMoment, mood, prompt, and cameraMovement when available. Output JSON only with no surrounding prose or markdown fences.';

const buildUserMessage = (idea: string, genre: string) =>
  `Idea: ${idea.trim()}\nGenre: ${genre.trim() || 'sci-fi'}\nReturn JSON only. Limit logline & summaries to ~140 characters, titles to 48, summaries to 180, and hero arc summaries to 120. Use the canonical hero's-journey names and keep descriptions cinematic.`;

const sanitizeLLMJson = (content: string): string => {
  const fenceMatch = /```(?:json)?\n([\s\S]*?)\n```/i.exec(content);
  const payload = fenceMatch?.[1] ?? content;
  const firstBrace = payload.indexOf('{');
  const lastBrace = payload.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return payload.slice(firstBrace, lastBrace + 1);
  }
  return payload;
};

const normalizeHeroArcs = (raw?: Partial<HeroArc>[]): HeroArc[] => {
  return HERO_ARC_LIBRARY.map((template, index) => {
    const override = raw?.[index] ?? {};
    const name = override.name?.trim() || template.name;
    return {
      id: override.id?.trim() || template.id,
      name,
      summary: override.summary?.trim() || template.summary,
      emotionalShift: override.emotionalShift?.trim() || template.emotionalShift,
      importance: typeof override.importance === 'number' ? override.importance : template.importance,
    };
  });
};

const buildStoryFromResponse = (parsed: StoryBlueprintResponse, fallback: StoryBible): StoryBible => {
  const heroArcs = normalizeHeroArcs(parsed.heroArcs ?? fallback.heroArcs);
  return {
    logline: parsed.logline?.trim() || fallback.logline,
    characters: parsed.characters?.trim() || fallback.characters,
    setting: parsed.setting?.trim() || fallback.setting,
    plotOutline: parsed.plotOutline?.trim() || fallback.plotOutline,
    heroArcs,
  };
};

const callStoryProvider = async (
  idea: string,
  genre: string,
  fallback: StoryBible
): Promise<StoryBible> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    throw new Error('Local Story Provider URL is not configured.');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this environment.');
  }

  const settings = getSettings();
  
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || Number(import.meta.env.VITE_LOCAL_LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS) || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : DEFAULT_TEMPERATURE,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [
        { role: 'system', content: buildSystemMessage() },
        { role: 'user', content: buildUserMessage(idea, genre) }
      ],
      max_tokens: 1600,
      seed: settings.llmSeed !== undefined ? settings.llmSeed : (DEFAULT_SEED ? Number(DEFAULT_SEED) : undefined),
      stream: false,
    };

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with ${response.status}`);
    }

    const payload = await response.json();
    const messageContent =
      payload?.choices?.[0]?.message?.content ||
      payload?.choices?.[0]?.content ||
      payload?.output?.[0]?.content ||
      payload?.text ||
      '';
    const jsonText = sanitizeLLMJson(String(messageContent));
    try {
      const parsed: StoryBlueprintResponse = JSON.parse(jsonText);
      return buildStoryFromResponse(parsed, fallback);
    } catch (parseError) {
      console.warn('[localStoryService] Provider returned non-JSON; using fallback. Snippet:', String(messageContent).slice(0, 200));
      return fallback;
    }  } finally {
    clearTimeout(timeoutId);
  }
};

export const generateStoryBlueprint = async (idea: string, genre: string = 'sci-fi'): Promise<StoryBible> => {
  const fallback = await localFallback.generateStoryBible(idea, genre);
  try {
    return await callStoryProvider(idea, genre, fallback);
  } catch (error) {
    console.warn('[localStoryService] Falling back to deterministic blueprint:', error);
    return fallback;
  }
};

export const generateLocalSceneList = (plotOutline: string, directorsVision: string) =>
  localFallback.generateSceneList(plotOutline, directorsVision);

export const suggestStoryIdeas = localFallback.suggestStoryIdeas;
export const suggestDirectorsVisions = localFallback.suggestDirectorsVisions;
export const refineDirectorsVision = localFallback.refineDirectorsVision;
export const suggestCoDirectorObjectives = localFallback.suggestCoDirectorObjectives;




