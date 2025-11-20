import crypto from 'node:crypto';

import { type LLMStoryRequest, type LLMStoryResponse, type LLMRequestFormat } from './types/storyTypes';
import { generateCorrelationId, logCorrelation } from '../utils/correlation.ts';

// Increase default timeout for local LLM calls to allow slower local/stable LLMs
// (LM Studio and similar) extra time to reply. Can be overridden via CLI/env.
// Mistral-7B needs ~110ms/token, 900 tokens = ~100s minimum + network overhead
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_CHAT_TEMPERATURE = 0.45;
const DEFAULT_MAX_TOKENS = 900;

interface FetchOptions {
    timeoutMs?: number;
    format?: LLMRequestFormat;
    model?: string;
    temperature?: number;
}

interface OpenAIChatResponse {
    choices?: Array<{
        message?: {
            role?: string;
            content?: string;
        };
    }>;
}

const stripFence = (content: string): string => {
    const trimmed = content.trim();
    if (trimmed.startsWith('```')) {
        return trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    return trimmed;
};

const ensureScenesLength = (response: LLMStoryResponse, requestedScenes: number): LLMStoryResponse => {
    if (!Array.isArray(response.scenes) || response.scenes.length === 0) {
        throw new Error('LLM response did not contain any scenes.');
    }
    const maxScenes = Math.max(1, requestedScenes);
    const storyId = response.storyId ?? `story-${crypto.randomUUID()}`;
    const scenes = response.scenes.slice(0, maxScenes).map((scene, index) => ({
        title: scene.title ?? `Scene ${index + 1}`,
        summary: scene.summary ?? 'TBD summary',
        prompt: scene.prompt ?? 'Highly-detailed cinematic shot',
        mood: scene.mood ?? 'evocative',
        cameraMovement: scene.cameraMovement,
        palette: scene.palette,
        expectedFrames: scene.expectedFrames ?? 25,
        negativePrompt:
            scene.negativePrompt ??
            'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur',
    }));
    return {
        ...response,
        storyId,
        scenes,
    };
};

const fetchDirectJsonStory = async (
    url: string,
    request: LLMStoryRequest,
    timeoutMs: number,
): Promise<LLMStoryResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const correlationId = generateCorrelationId();
        logCorrelation(correlationId, 'lm-studio-direct-json', { url, sceneCount: request.sceneCount });

        const body = {
            sceneCount: request.sceneCount,
            seed: request.seed,
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`LLM service responded with ${response.status}: ${text}`);
        }

        const payload = (await response.json()) as LLMStoryResponse;
        return ensureScenesLength(payload, request.sceneCount);
    } finally {
        clearTimeout(timeout);
    }
};

const fetchOpenAIChatStory = async (
    url: string,
    request: LLMStoryRequest,
    timeoutMs: number,
    options: FetchOptions,
): Promise<LLMStoryResponse> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const model = options.model ?? 'mistralai/mistral-7b-instruct-v0.3';
        const temperature = options.temperature ?? DEFAULT_CHAT_TEMPERATURE;
        const systemPrompt =
            'You are the cinematic story generator for gemDirect1. Produce cohesive sci-fi short films with three-act energy, highlight director intentions, moods, palettes, and camera motion.';
        const userPrompt = [
            `Generate ${request.sceneCount} cinematic scenes for a high-end story-to-video pipeline.`,
            'Return JSON with: storyId (string), logline (string), directorsVision (string), scenes (array).',
            'Each scene requires: title, summary, prompt, mood, cameraMovement, palette, expectedFrames (25), negativePrompt (list common issues), generator metadata optional.',
            request.seed ? `Honor deterministic tone using seed ${request.seed}.` : 'Seed can be random but keep tone coherent.',
            'Do NOT include explanations or prose outside the JSON object. Respond with strict JSON, no markdown fences.',
        ].join(' ');
        const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`.trim();

        const body: Record<string, unknown> = {
            model,
            messages: [
                { role: 'user', content: combinedPrompt },
            ],
            temperature,
            max_tokens: DEFAULT_MAX_TOKENS,
        };

        if (request.seed) {
            body.seed = request.seed;
        }

        const correlationId = generateCorrelationId();
        logCorrelation(correlationId, 'lm-studio-openai-chat', { url, model, sceneCount: request.sceneCount });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`LLM service responded with ${response.status}: ${text}`);
        }

        const json = (await response.json()) as OpenAIChatResponse;
        const content = json?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('LLM chat response was empty.');
        }
        const parsed = JSON.parse(stripFence(content)) as LLMStoryResponse;
        return ensureScenesLength(parsed, request.sceneCount);
    } finally {
        clearTimeout(timeout);
    }
};

export const fetchLocalStory = async (
    url: string,
    request: LLMStoryRequest,
    options: FetchOptions = {},
): Promise<LLMStoryResponse> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const format: LLMRequestFormat = options.format ?? request.format ?? 'direct-json';
    try {
        if (format === 'openai-chat') {
            return await fetchOpenAIChatStory(url, request, timeoutMs, options);
        }
        return await fetchDirectJsonStory(url, request, timeoutMs);
    } catch (err) {
        const msg = (err as Error).message || String(err);
        // Emit targeted guidance if we detect common local model crash signatures
        if (/crashed|Exit code|model has crashed/i.test(msg)) {
            console.warn('[LocalLLM] Detected local model crash during story generation.');
            console.warn('[LocalLLM] Recommended actions:');
            console.warn('  1. In LM Studio, increase GPU offload layers (e.g. 32 for Mistral-7B) to avoid slow CPU-only generation.');
            console.warn('  2. Ensure other high VRAM processes (e.g. ComfyUI heavy workflows) are not consuming GPU memory at model load time.');
            console.warn('  3. If repeated, lower context length or max_tokens, or switch to a smaller quantization (Q4_K_M already medium).');
            console.warn('  4. Confirm CUDA initialization succeeds and no earlier "failed to initialize CUDA" appears in LM Studio logs.');
        }
        console.warn(`[LocalLLM] Story generation error: ${msg}`);
        throw err;
    }
};
