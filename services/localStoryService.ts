import type { StoryBible, HeroArc } from '../types';
import { CSGError, ErrorCodes } from '../types/errors';
import * as localFallback from './localFallbackService';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';
import { 
    validateStoryBibleSoft, 
    formatValidationIssues, 
    buildRegenerationFeedback,
    type StoryBibleValidationResult 
} from './storyBibleValidator';

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

const getEnv = (key: string) => (import.meta as any).env?.[key] ?? (typeof process !== 'undefined' ? process.env[key] : undefined);

const DEFAULT_MODEL = getEnv('VITE_LOCAL_LLM_MODEL') ?? 'mistralai/mistral-nemo-instruct-2407';
const DEFAULT_TEMPERATURE = Number(getEnv('VITE_LOCAL_LLM_TEMPERATURE') ?? 0.35);
const DEFAULT_TIMEOUT_MS = Number(getEnv('VITE_LOCAL_LLM_TIMEOUT_MS') ?? 120000);
const DEFAULT_REQUEST_FORMAT = getEnv('VITE_LOCAL_LLM_REQUEST_FORMAT') ?? 'openai-chat';
const DEFAULT_SEED = getEnv('VITE_LOCAL_LLM_SEED');
const FALLBACK_TIMEOUT = 120000;
// Enable system role for models that support it (Qwen, Llama, etc.) - disable for old Mistral 7B
const USE_SYSTEM_ROLE = getEnv('VITE_LOCAL_LLM_USE_SYSTEM_ROLE') !== 'false';
// Note: response_format is NOT supported by LM Studio - JSON enforcement is via prompt only

const getSettings = () => {
  if (typeof window !== 'undefined') {
    return (window as any).__localGenSettings || {};
  }
  return {};
};

const getLocalStoryProviderUrl = (): string | null => {
  const settings = getSettings();
  
  // Priority: settings > env > window.LOCAL_STORY_PROVIDER_URL
  const url = settings.llmProviderUrl || getEnv('VITE_LOCAL_STORY_PROVIDER_URL');
  
  if (url) {
    // In browser context during development, use Vite proxy to avoid CORS
    if (typeof window !== 'undefined' && getEnv('DEV')) {
      return '/api/local-llm';
    }
    
    // In production builds, do not silently switch to proxy route
    // Browser fetch to direct URLs will likely fail due to CORS
    if (typeof window !== 'undefined' && !getEnv('DEV')) {
      // Check if URL is a direct IP/host (not a relative path)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        throw new CSGError(
          ErrorCodes.NETWORK_CORS_BLOCKED,
          { url, environment: 'production' }
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
  'You are the gemDirect1 narrative designer. Return ONLY a JSON object with these exact keys: logline (string, max 140 chars), characters (string describing main characters), setting (string describing the world, 50-300 words), plotOutline (string with 3-act structure), heroArcs (array of exactly 12 hero journey arc objects). Each heroArc must have: id (string like "arc-01"), name (string), summary (string max 120 chars), emotionalShift (string), importance (number 1-10). Do NOT include scenes array. Output valid JSON only, no markdown fences, no explanations.';

const buildUserMessage = (idea: string, genre: string, feedback?: string) => {
  let message = `Idea: ${idea.trim()}\nGenre: ${genre.trim() || 'sci-fi'}\nReturn JSON only. Limit logline & summaries to ~140 characters, titles to 48, summaries to 180, and hero arc summaries to 120. Use the canonical hero's-journey names and keep descriptions cinematic.`;
  
  if (feedback) {
    message += `\n\n**CRITICAL: Previous generation failed validation. You MUST fix these issues:**\n${feedback}`;
  }
  
  return message;
};

/**
 * Builds a single combined message that includes system instructions and user input.
 * This is required for models like Mistral 7B Instruct v0.3 that only support user/assistant roles.
 * @param idea - The story idea
 * @param genre - The genre of the story
 * @param feedback - Optional validation feedback from previous failed attempt
 */
const buildCombinedUserMessage = (idea: string, genre: string, feedback?: string) =>
  `${buildSystemMessage()}\n\n${buildUserMessage(idea, genre, feedback)}`;

const sanitizeLLMJson = (content: string): string => {
  // Strip <think>...</think> blocks (Qwen3 thinking mode)
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Strip markdown code fences
  const fenceMatch = /```(?:json)?\r?\n([\s\S]*?)\r?\n```/i.exec(cleaned);
  const payload = fenceMatch?.[1] ?? cleaned;
  
  // Extract JSON object
  const firstBrace = payload.indexOf('{');
  const lastBrace = payload.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return payload.slice(firstBrace, lastBrace + 1);
  }
  
  // Try extracting JSON array if no object found
  const firstBracket = payload.indexOf('[');
  const lastBracket = payload.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return payload.slice(firstBracket, lastBracket + 1);
  }
  
  return payload.trim();
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

const getMockStoryResponse = (idea: string, genre: string): StoryBible => {
  return {
    logline: `[MOCK] A compelling story about ${idea} set in a ${genre} world.`,
    characters: 'Protagonist: A determined hero with a hidden past. Antagonist: A powerful rival seeking control.',
    setting: 'A vivid world that reflects the themes of the story, full of contrast and detail.',
    plotOutline: 'Act 1: The Inciting Incident disrupts the status quo. Act 2: Rising action and complications. Act 3: Climax and resolution.',
    heroArcs: HERO_ARC_LIBRARY.map(arc => ({
      ...arc,
      summary: `[MOCK] The hero experiences ${arc.name} in the context of ${idea}.`,
      emotionalShift: arc.emotionalShift
    }))
  };
};

const callStoryProvider = async (
  idea: string,
  genre: string,
  fallback: StoryBible,
  feedback?: string
): Promise<StoryBible> => {
  const settings = getSettings();
  
  if (settings.useMockLLM) {
    console.log('[LocalStoryService] Using Mock LLM response');
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return getMockStoryResponse(idea, genre);
  }

  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    throw new CSGError(ErrorCodes.LLM_CONNECTION_FAILED, { reason: 'URL not configured' });
  }
  if (typeof fetch !== 'function') {
    throw new CSGError(ErrorCodes.LLM_CONNECTION_FAILED, { reason: 'fetch not available' });
  }
  
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || Number(getEnv('VITE_LOCAL_LLM_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS) || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Build messages based on model capabilities
    const useSystemRole = settings.useSystemRole ?? USE_SYSTEM_ROLE;
    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    
    // Qwen3 models have thinking mode enabled by default which consumes tokens on reasoning
    // Add /no_think suffix to disable thinking mode for faster, direct responses
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const messages = useSystemRole
      ? [
          { role: 'system', content: buildSystemMessage() },
          { role: 'user', content: buildUserMessage(idea, genre, feedback) + noThinkSuffix }
        ]
      : [
          { role: 'user', content: buildCombinedUserMessage(idea, genre, feedback) + noThinkSuffix }
        ];

    const body: Record<string, unknown> = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : DEFAULT_TEMPERATURE,
      messages,
      max_tokens: 4096,  // Increased to allow complete story bible JSON responses
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
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        operation: 'story-generation'
      });
    }

    const payload = await response.json();
    
    // Extract content from response, handling various LLM response formats
    // Qwen3 models may return content in 'content' field or 'reasoning_content' if thinking mode is enabled
    const message = payload?.choices?.[0]?.message;
    const messageContent =
      message?.content ||
      payload?.choices?.[0]?.content ||
      payload?.output?.[0]?.content ||
      payload?.text ||
      // Fallback: if content is empty but reasoning_content exists, the model may still be in thinking mode
      // In this case, we log a warning and use fallback instead of parsing reasoning
      '';
    
    // If content is empty, check if model returned reasoning instead (thinking mode not disabled)
    if (!messageContent && message?.reasoning_content) {
      console.warn('[localStoryService] Model returned reasoning_content but no content. Thinking mode may not be disabled. Using fallback.');
      return fallback;
    }
    
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

/**
 * Result of story generation with optional validation
 */
export interface StoryBibleGenerationResult {
    /** The generated Story Bible */
    storyBible: StoryBible;
    /** Validation result (soft validation with warnings) */
    validation: StoryBibleValidationResult;
    /** Whether validation passed (no errors) */
    isValid: boolean;
    /** Whether user override was applied */
    wasOverridden?: boolean;
    /** Source of the story bible (llm or fallback) */
    source: 'llm' | 'fallback';
}

/**
 * Generate story blueprint with validation
 * Returns both the story and validation result so UI can show warnings with override option
 */
export const generateStoryBlueprintWithValidation = async (
    idea: string, 
    genre: string = 'sci-fi', 
    feedback?: string
): Promise<StoryBibleGenerationResult> => {
    const fallback = await localFallback.generateStoryBible(idea, genre);
    
    try {
        const storyBible = await callStoryProvider(idea, genre, fallback, feedback);
        const validation = validateStoryBibleSoft(storyBible);
        
        // Log validation results
        if (validation.warningCount > 0 || validation.errorCount > 0) {
            console.log('[localStoryService] Validation result:', {
                valid: validation.valid,
                errors: validation.errorCount,
                warnings: validation.warningCount,
                qualityScore: validation.qualityScore?.toFixed(2)
            });
            
            if (validation.errorCount > 0) {
                console.warn('[localStoryService] Validation errors found:', 
                    formatValidationIssues(validation)
                );
            }
        }
        
        return {
            storyBible,
            validation,
            isValid: validation.valid,
            source: 'llm'
        };
    } catch (error) {
        console.warn('[localStoryService] Falling back to deterministic blueprint:', error);
        const validation = validateStoryBibleSoft(fallback);
        
        return {
            storyBible: fallback,
            validation,
            isValid: validation.valid,
            source: 'fallback'
        };
    }
};

/**
 * Build feedback for regeneration attempt based on validation issues
 */
export const buildValidationFeedback = (
    validation: StoryBibleValidationResult
): string | undefined => {
    if (validation.valid && validation.warningCount === 0) {
        return undefined;
    }
    
    // Build feedback from the most critical issues
    const feedback = buildRegenerationFeedback(validation, 'logline');
    return feedback || undefined;
};

export const generateStoryBlueprint = async (idea: string, genre: string = 'sci-fi', feedback?: string): Promise<StoryBible> => {
  const fallback = await localFallback.generateStoryBible(idea, genre);
  try {
    return await callStoryProvider(idea, genre, fallback, feedback);
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
    const prompt = `You generate 4-6 DISTINCT story ideas for cinematic short videos.

Constraints:
- Avoid repeating any prior suggestions in this session.
- Strong diversity across genre, tone, premise, stakes, aesthetics.
- Each idea: 1 sentence, <= 140 characters.
- Return ONLY JSON array of strings.

If there is any duplication risk, replace with a new idea.`;

    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : DEFAULT_TEMPERATURE,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt + noThinkSuffix }],
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
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        operation: 'suggest-story-ideas'
      });
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
      throw new CSGError(ErrorCodes.LLM_INVALID_RESPONSE, { 
        reason: 'Expected array of strings',
        operation: 'suggest-story-ideas'
      });
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
 * Enhance a story idea using local LLM.
 * This is a pass-through function that sends the prompt directly to the LLM
 * without any section-specific wrapping (unlike refineStoryBibleSection).
 * 
 * @param prompt - The complete prompt from refineField/buildRefinementPrompt
 * @returns The enhanced story idea text from the LLM
 */
export const enhanceStoryIdea = async (prompt: string): Promise<string> => {
  const providerUrl = getLocalStoryProviderUrl();
  if (!providerUrl) {
    console.warn('[localStoryService] No LLM provider configured, cannot enhance story idea');
    // Return the original content extracted from the prompt if possible
    // The prompt contains "Current Value:\n{content}" so we try to extract it
    const currentValueMatch = /Current Value:\n(.+?)(?:\n\nAdditional Context:|$)/s.exec(prompt);
    return currentValueMatch?.[1]?.trim() || '';
  }

  const settings = getSettings();
  const controller = new AbortController();
  const timeoutMs = Math.max(12000, settings.llmTimeoutMs || DEFAULT_TIMEOUT_MS || FALLBACK_TIMEOUT);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : DEFAULT_TEMPERATURE,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt + noThinkSuffix }],
      max_tokens: 400,
      stream: false,
    };

    const correlationId = generateCorrelationId();
    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, 'enhance-story-idea', { providerUrl });

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        statusText: response.statusText 
      });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const content = message?.content?.trim();
    
    // Check if model returned only reasoning (thinking mode not disabled)
    if (!content && message?.reasoning_content) {
      console.warn('[localStoryService] Empty content with reasoning_content - Qwen3 thinking mode may be active');
      return '';
    }
    
    if (!content) {
      console.warn('[localStoryService] Empty response from LLM for story idea enhancement');
      return '';
    }

    logCorrelation({ correlationId, timestamp: Date.now(), source: 'lm-studio' }, 'enhance-story-idea-response', { 
      responseLength: content.length 
    });

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CSGError(ErrorCodes.LLM_TIMEOUT, { timeoutMs });
    }
    throw error;
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
    const prompt = `You are a visionary film director. Based on the following story, suggest 3 distinct and evocative Director's Vision statements.

**Story Context:**
- Logline: ${storyBible.logline}
- Characters: ${storyBible.characters?.slice(0, 300) || 'Not specified'}
- Setting: ${storyBible.setting?.slice(0, 300) || 'Not specified'}
- Plot: ${storyBible.plotOutline?.slice(0, 300) || 'Not specified'}

**CRITICAL OUTPUT CONSTRAINTS (HARD LIMITS):**
- Each vision MUST be 2-3 sentences (maximum 80 words each)
- Be concise but evocative - every word must count
- DO NOT add verbose descriptions or flowery prose

**Requirements:**
- Include specific cinematography terms (camera work, lighting, color palette)
- Reference film styles or directors when appropriate
- Make each vision distinct from the others

Return ONLY a JSON array of 3 strings, no surrounding text or markdown.

Example output format:
["Naturalistic handheld camerawork with warm diffusion, evoking Terrence Malick's contemplative pacing.", "Stylized neo-noir palette with contrasting pools of light and shadow, echoing Blade Runner's dystopian aesthetic."]`;

    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.7, // Higher temp for creativity
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt + noThinkSuffix }],
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
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        operation: 'suggest-directors-visions'
      });
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
      throw new CSGError(ErrorCodes.LLM_INVALID_RESPONSE, { 
        reason: 'Expected array of strings',
        operation: 'suggest-directors-visions'
      });
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

**CRITICAL OUTPUT CONSTRAINTS (HARD LIMITS):**
- Output MUST be a SINGLE paragraph (no line breaks)
- HARD LIMIT: Maximum 150 words
- Be concise but evocative - every word must count
- DO NOT add unnecessary elaboration

**Your Task:**
Return a refined, enhanced version of this vision as a single paragraph. It should:
- Be more descriptive and professional
- Use specific cinematic terminology (camera work, color palettes, lighting styles, editing pace, sound design)
- Maintain the original intent while adding depth
- Be 2-4 sentences long (max 150 words)

Return ONLY the refined vision text, no surrounding quotes, markdown, or explanations.`;

    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.6,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt + noThinkSuffix }],
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
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        operation: 'refine-directors-vision'
      });
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
    throw new CSGError(ErrorCodes.LLM_INVALID_RESPONSE, { 
      reason: 'Empty or too short response',
      operation: 'refine-directors-vision'
    });
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

    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.7,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt + noThinkSuffix }],
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
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        operation: 'suggest-codirector-objectives'
      });
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
      throw new CSGError(ErrorCodes.LLM_INVALID_RESPONSE, { 
        reason: 'Expected array of strings',
        operation: 'suggest-codirector-objectives'
      });
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

HARD CONSTRAINTS:
- Target length: 200-300 words (MIN 50, MAX 300)
- Keep paragraphs concise and focused on visual/atmospheric details

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

STRUCTURE & LENGTH CONSTRAINTS:
- Focus on 3-5 primary characters
- For each character, use a clear markdown heading or bold name, followed by 2-4 sentences
- Total section length should be between 200 and 600 words
- Emphasize VISUAL descriptors (for image/video prompts) plus inner motivation

Return the refined character section. Maintain the original structure but enhance the depth. Use markdown formatting (bold names, bullet points) where appropriate.`;
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

STRUCTURE & LENGTH CONSTRAINTS:
- Use a clear three-act structure (Act I, Act II, Act III) with bullet points for key beats
- Each bullet should be 1-3 sentences (10-60 words)
- Overall outline should stay within ~150-600 words and avoid excessive exposition

Return the refined plot outline. Maintain the original structure but enhance the narrative flow. Use markdown formatting (acts and bullets).`;
    }

    const modelName = (settings.llmModel || DEFAULT_MODEL).toLowerCase();
    const isQwen3 = modelName.includes('qwen3') || modelName.includes('qwen/qwen3');
    const noThinkSuffix = isQwen3 ? ' /no_think' : '';
    
    const body = {
      model: settings.llmModel || DEFAULT_MODEL,
      temperature: settings.llmTemperature !== undefined ? settings.llmTemperature : 0.6,
      request_format: settings.llmRequestFormat || DEFAULT_REQUEST_FORMAT,
      messages: [{ role: 'user', content: prompt + noThinkSuffix }],
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
      throw new CSGError(ErrorCodes.LLM_SERVICE_UNAVAILABLE, { 
        status: response.status,
        operation: `refine-${section}`
      });
    }

    const payload = await response.json();
    const message = payload?.choices?.[0]?.message;
    const messageContent =
      message?.content ||
      payload?.choices?.[0]?.content ||
      payload?.output?.[0]?.content ||
      payload?.text ||
      '';
    
    // Check if model returned only reasoning (thinking mode not disabled)
    if (!messageContent && message?.reasoning_content) {
      console.warn(`[localStoryService] Empty content with reasoning_content for refine-${section} - Qwen3 thinking mode may be active`);
      throw new CSGError(ErrorCodes.LLM_INVALID_RESPONSE, { 
        reason: 'Model returned reasoning instead of content',
        operation: `refine-${section}`
      });
    }

    const refinedContent = String(messageContent).trim();
    if (refinedContent && refinedContent.length > 50) {
      return refinedContent;
    }
    throw new CSGError(ErrorCodes.LLM_INVALID_RESPONSE, { 
      reason: 'Empty or too short response',
      operation: `refine-${section}`
    });
  } catch (error) {
    console.warn(`[localStoryService] Error refining ${section}:`, error);
    return localFallback.refineStoryBibleSection(section, content, prunedContext);
  } finally {
    clearTimeout(timeoutId);
  }
};


