import type { StoryBible, HeroArc } from '../types';
import * as localFallback from './localFallbackService';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';

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

const DEFAULT_MODEL = import.meta.env.VITE_LOCAL_LLM_MODEL ?? 'mistralai/mistral-nemo-instruct-2407';
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
    
    // In production builds, do not silently switch to proxy route
    // Browser fetch to direct URLs will likely fail due to CORS
    if (typeof window !== 'undefined' && !import.meta.env.DEV) {
      // Check if URL is a direct IP/host (not a relative path)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        throw new Error(
          `Production CORS error: Cannot fetch from ${url} directly in browser. ` +
          'Please configure a reverse proxy or use server-side rendering for LLM calls. ' +
          'See documentation for proxy setup instructions.'
        );
      }
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

/**
 * Builds a single combined message that includes system instructions and user input.
 * This is required for models like Mistral 7B Instruct v0.3 that only support user/assistant roles.
 */
const buildCombinedUserMessage = (idea: string, genre: string) =>
  `${buildSystemMessage()}\n\n${buildUserMessage(idea, genre)}`;

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
      // Use single user message (Mistral 7B Instruct v0.3 only supports user/assistant roles)
      messages: [
        { role: 'user', content: buildCombinedUserMessage(idea, genre) }
      ],
      max_tokens: 1600,
      seed: settings.llmSeed !== undefined ? settings.llmSeed : (DEFAULT_SEED ? Number(DEFAULT_SEED) : undefined),
      stream: false,
    };

    const correlationId = generateCorrelationId();
    const corrContext = { correlationId, timestamp: Date.now(), source: 'lm-studio' as const };
    logCorrelation(corrContext, 'story-generation-request', { providerUrl, model: body.model });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Request-ID': correlationId,
      },
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

/**
 * Suggest 3-5 story ideas using local LLM
 */
export const suggestStoryIdeas = async (): Promise<string[]> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    console.warn('[localStoryService] No LLM provider configured, using fallback suggestions');
    return localFallback.suggestStoryIdeas();
  }

  const settings = getSettings();
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || DEFAULT_TIMEOUT_MS || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const prompt = `Generate 3-5 creative and diverse story ideas suitable for a short video narrative. Each idea should be:
- A single sentence (140 characters max)
- Compelling and visually interesting
- Spanning different genres (sci-fi, fantasy, thriller, drama, etc.)

Return ONLY a JSON array of strings, no surrounding text or markdown.

Example output format:
["An astronaut discovers mysterious alien ruins on Mars that hold a dire warning for humanity", "A detective with the ability to see memories must solve her own murder", "In a city where music is outlawed, a young pianist sparks a revolution"]`;

    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : DEFAULT_TEMPERATURE,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      stream: false,
    };

    const correlationId = generateCorrelationId();
    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, 'suggest-story-ideas', { providerUrl });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
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
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed;
      }
      throw new Error('Invalid response format');
    } catch (parseError) {
      console.warn('[localStoryService] Failed to parse story ideas, using fallback:', parseError);
      return localFallback.suggestStoryIdeas();
    }
  } catch (error) {
    console.warn('[localStoryService] Error suggesting story ideas:', error);
    return localFallback.suggestStoryIdeas();
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Suggest 3-5 director's visions based on story bible
 */
export const suggestDirectorsVisions = async (storyBible: StoryBible): Promise<string[]> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    console.warn('[localStoryService] No LLM provider configured, using fallback visions');
    return localFallback.suggestDirectorsVisions(storyBible);
  }

  const settings = getSettings();
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || DEFAULT_TIMEOUT_MS || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const prompt = `You are a visionary film director. Based on the following story, suggest 3-5 distinct and evocative Director's Vision statements. Each should describe a complete cinematic style, mood, and aesthetic approach.

**Story Context:**
- Logline: ${storyBible.logline}
- Characters: ${storyBible.characters?.slice(0, 300) || 'Not specified'}
- Setting: ${storyBible.setting?.slice(0, 300) || 'Not specified'}
- Plot: ${storyBible.plotOutline?.slice(0, 300) || 'Not specified'}

**Requirements:**
- Each vision should be 1-2 sentences
- Include specific cinematography terms (camera work, lighting, color palette, editing pace)
- Reference film styles or directors when appropriate
- Make each vision distinct from the others

Return ONLY a JSON array of strings, no surrounding text or markdown.

Example output format:
["Naturalistic handheld camerawork with warm diffusion and emphasis on organic textures, evoking Terrence Malick's contemplative pacing", "Stylized neo-noir palette with contrasting pools of light and shadow, reflective surfaces echoing Blade Runner's dystopian aesthetic"]`;

    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.7, // Higher temp for creativity
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      stream: false,
    };

    const correlationId = generateCorrelationId();
    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, 'suggest-directors-visions', { providerUrl });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
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
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed;
      }
      throw new Error('Invalid response format');
    } catch (parseError) {
      console.warn('[localStoryService] Failed to parse director visions, using fallback:', parseError);
      return localFallback.suggestDirectorsVisions(storyBible);
    }
  } catch (error) {
    console.warn('[localStoryService] Error suggesting director visions:', error);
    return localFallback.suggestDirectorsVisions(storyBible);
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Refine and enhance director's vision with cinematic language
 */
export const refineDirectorsVision = async (vision: string, storyBible: StoryBible): Promise<string> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    console.warn('[localStoryService] No LLM provider configured, using fallback refinement');
    return localFallback.refineDirectorsVision(vision, storyBible);
  }

  const settings = getSettings();
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || DEFAULT_TIMEOUT_MS || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const prompt = `You are a visionary film director and critic. Refine and expand the following Director's Vision to make it more evocative, detailed, and actionable for a creative team.

**Story Context:**
- Logline: ${storyBible.logline}
- Characters: ${storyBible.characters?.slice(0, 200) || 'Not specified'}
- Setting: ${storyBible.setting?.slice(0, 200) || 'Not specified'}

**Original Director's Vision:**
"${vision}"

**Your Task:**
Return a refined, enhanced version of this vision as a single paragraph. It should:
- Be more descriptive and professional
- Use specific cinematic terminology (camera work, color palettes, lighting styles, editing pace, sound design)
- Maintain the original intent while adding depth
- Be 2-4 sentences long

Return ONLY the refined vision text, no surrounding quotes, markdown, or explanations.`;

    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.6,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      stream: false,
    };

    const correlationId = generateCorrelationId();
    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, 'refine-directors-vision', { providerUrl });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
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

    const refinedVision = String(messageContent).trim();
    if (refinedVision && refinedVision.length > 20) {
      return refinedVision;
    }
    throw new Error('Empty or invalid response');
  } catch (error) {
    console.warn('[localStoryService] Error refining director vision:', error);
    return localFallback.refineDirectorsVision(vision, storyBible);
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Suggest Co-Director objectives based on story context
 */
export const suggestCoDirectorObjectives = async (
  logline: string,
  sceneSummary: string,
  directorsVision: string
): Promise<string[]> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    console.warn('[localStoryService] No LLM provider configured, using fallback objectives');
    return localFallback.suggestCoDirectorObjectives(logline, sceneSummary, directorsVision);
  }

  const settings = getSettings();
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || DEFAULT_TIMEOUT_MS || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const prompt = `You are an AI Co-Director assistant. Based on the following story context, suggest 3-5 creative objectives or directions that could enhance this scene's emotional impact, visual storytelling, or narrative clarity.

**Story Context:**
- Logline: ${logline}
- Current Scene: ${sceneSummary}
- Director's Vision: ${directorsVision}

**Requirements:**
- Each objective should be specific and actionable
- Focus on mood, pacing, visual storytelling, or emotional beats
- Keep each objective to 1-2 sentences
- Make objectives distinct from each other

Return ONLY a JSON array of strings, no surrounding text or markdown.

Example output format:
["Amplify the dramatic tension by sharpening the conflict in the opening confrontation", "Layer visual callbacks from the director's vision using strategic lighting and framing", "Add a moment of quiet introspection before the climactic action begins"]`;

    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.7,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      stream: false,
    };

    const correlationId = generateCorrelationId();
    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, 'suggest-codirector-objectives', { providerUrl });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
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
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed;
      }
      throw new Error('Invalid response format');
    } catch (parseError) {
      console.warn('[localStoryService] Failed to parse objectives, using fallback:', parseError);
      return localFallback.suggestCoDirectorObjectives(logline, sceneSummary, directorsVision);
    }
  } catch (error) {
    console.warn('[localStoryService] Error suggesting objectives:', error);
    return localFallback.suggestCoDirectorObjectives(logline, sceneSummary, directorsVision);
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Refine a story bible section (characters, plotOutline, logline, or setting) using local LLM
 */
export const refineStoryBibleSection = async (
  section: 'characters' | 'plotOutline' | 'logline' | 'setting',
  content: string,
  prunedContext: string
): Promise<string> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    console.warn('[localStoryService] No LLM provider configured, using fallback refinement');
    return localFallback.refineStoryBibleSection(section, content, prunedContext);
  }

  const settings = getSettings();
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || DEFAULT_TIMEOUT_MS || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isSuggestionMode = content.includes('[SUGGESTION MODE]');
    const cleanContent = content.replace('[SUGGESTION MODE]', '').trim();
    const sectionName = section === 'logline' ? 'Logline' : section === 'setting' ? 'Setting' : section === 'characters' ? 'Characters' : 'Plot Outline';
    let prompt = '';
    
    if (section === 'logline') {
      prompt = isSuggestionMode
        ? `You are a master storyteller. Based on the provided context, generate 3-5 compelling story loglines.

**Story Context:**
${prunedContext}

**Task:**
${cleanContent}

Generate diverse, cinematic loglines. Each must be ONE sentence, 140 characters max. Return ONLY a numbered list (1. 2. 3. etc).`
        : `You are a master storyteller. Refine this story logline to be a single, powerful sentence (maximum 140 characters) that captures the entire story's essence.

**Story Context:**
${prunedContext}

**Current Logline:**
${content}

**Your Task:**
Create a compelling, concise logline that:
- Is ONE sentence (140 characters max)
- Captures the protagonist's journey and central conflict
- Is cinematic and immediately engaging
- Focuses on the core story premise

Return ONLY the refined logline sentence, no explanation or preamble.`;
    } else if (section === 'setting') {
      prompt = isSuggestionMode
        ? `You are a master storyteller. Based on the provided context, generate 3-5 evocative setting descriptions.

**Story Context:**
${prunedContext}

**Task:**
${cleanContent}

Generate vivid, atmospheric settings. Each should be 1-2 sentences. Return ONLY a numbered list (1. 2. 3. etc).`
        : `You are a master storyteller. Refine this setting description to vividly describe the world, time period, and atmosphere.

**Story Context:**
${prunedContext}

**Current Setting:**
${content}

**Your Task:**
Enhance the setting description by:
- Adding sensory details (sights, sounds, textures, mood)
- Establishing the time period and location clearly
- Creating atmospheric tone that supports the story
- Focusing on ENVIRONMENT and WORLD, NOT characters

Return the refined setting description (2-4 sentences). Use vivid, cinematic language.`;
    } else if (section === 'characters') {
      prompt = `You are a narrative designer. Refine the following character descriptions to make them more compelling and cinematically vivid.

**Story Context:**
${prunedContext}

**Current Characters:**
${content}

**Your Task:**
Enhance the character descriptions by:
- Deepening their motivations and internal conflicts
- Making their relationships and dynamics clearer
- Adding specific visual details that would translate well to screen
- Ensuring each character has a clear arc potential

Return the refined character section. Maintain the original structure but enhance the depth. Use markdown formatting if appropriate (bullet points, bold text).`;
    } else { // plotOutline
      prompt = `You are a narrative designer. Refine the following plot outline to make it more engaging and structurally sound.

**Story Context:**
${prunedContext}

**Current Plot Outline:**
${content}

**Your Task:**
Enhance the plot outline by:
- Sharpening the emotional stakes at each turn
- Adding foreshadowing or thematic resonance
- Ensuring scene transitions carry deliberate momentum
- Highlighting key dramatic beats and turning points

Return the refined plot outline. Maintain the original structure but enhance the narrative flow. Use markdown formatting if appropriate (bullet points, bold text).`;
    }

    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.6,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      stream: false,
    };

    const correlationId = generateCorrelationId();
    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, `refine-${section}`, { providerUrl });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
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

    const refinedContent = String(messageContent).trim();
    if (refinedContent && refinedContent.length > 50) {
      return refinedContent;
    }
    throw new Error('Empty or invalid response');
  } catch (error) {
    console.warn(`[localStoryService] Error refining ${section}:`, error);
    return localFallback.refineStoryBibleSection(section, content, prunedContext);
  } finally {
    clearTimeout(timeoutId);
  }
};




