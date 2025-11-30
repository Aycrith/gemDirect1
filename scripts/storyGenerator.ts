import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { fetchLocalStory } from './localStoryProvider.ts';
import {
    type LLMScenePayload,
    type LLMStoryRequest,
    type LLMStoryResponse,
    type LLMProviderMetadata,
    type LLMRequestFormat,
} from './types/storyTypes.ts';

export interface CliOptions {
    outputDir: string;
    sceneCount: number;
    sampleKeyframe?: string;
    useLocalLLM?: boolean;
    localLLMSeed?: string;
    providerUrl?: string;
    llmTimeoutMs?: number;
    localLLMModel?: string;
    localLLMTemperature?: number;
    llmRequestFormat?: LLMRequestFormat;
    customStoryIdea?: string;
}

export interface GeneratedScene {
    id: string;
    title: string;
    summary: string;
    prompt: string;
    mood: string;
    keyframePath: string;
    expectedFrames: number;
    negativePrompt: string;
    cameraMovement?: string;
    palette?: string;
}

export interface StoryGenerationWarning {
    code: string;
    message: string;
}

export const DEFAULT_NEGATIVE_PROMPT =
    'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur';

const normalizeNegativePrompt = (value: unknown): string => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
            .join(', ');
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }
    return DEFAULT_NEGATIVE_PROMPT;
};

const DEFAULT_CHAT_MODEL = 'mistralai/mistral-7b-instruct-v0.3';
const DEFAULT_REQUEST_FORMAT: LLMRequestFormat = 'direct-json';

const inferRequestFormat = (providerUrl?: string, requested?: LLMRequestFormat): LLMRequestFormat => {
    if (requested) return requested;
    if (!providerUrl) return DEFAULT_REQUEST_FORMAT;
    if (/\/v1\/chat/i.test(providerUrl) || /\/chat\/completions/i.test(providerUrl)) {
        return 'openai-chat';
    }
    return DEFAULT_REQUEST_FORMAT;
};

const createLLMMetadata = (options: CliOptions): LLMProviderMetadata => ({
    enabled: Boolean(options.useLocalLLM),
    providerUrl: options.providerUrl,
    seed: options.localLLMSeed,
    model: options.localLLMModel,
    requestFormat: options.llmRequestFormat,
    temperature: options.localLLMTemperature,
    status: options.useLocalLLM ? 'skipped' : 'skipped',
    scenesRequested: options.sceneCount,
});

export const SAMPLE_SCENES: Array<LLMScenePayload> = [
    {
        title: 'Signal in the Mist',
        summary: 'A lone courier crosses a suspended rail bridge as aurora storm clouds simmer below.',
        prompt:
            'Ultra-wide cinematic shot of a courier silhouetted on a floating rail bridge, vaporous aurora and neon mist swirling beneath, volumetric lighting, shallow haze, 1970s film grain',
        mood: 'Resolute, breathless',
        cameraMovement: 'Slow, deliberate dolly forward across the bridge line',
        expectedFrames: 49,
    },
    {
        title: 'Archive Heartbeat',
        summary: 'Holo-projectors bloom inside a cathedral-like archive while drones carve through shafts of light.',
        prompt:
            'Slow dolly shot through a vaulted archive lit by cascading holograms, bronze shelves, reflective marble floor, micro drones tracing glowing calligraphy, richly saturated cinematic palette',
        mood: 'Wondrous, reverent',
        cameraMovement: 'Floating steadicam between marble columns',
        expectedFrames: 49,
    },
    {
        title: 'Rainlight Market',
        summary: 'An alleyway bazaar flickers with bioluminescent fibers and mirrored puddles after a downpour.',
        prompt:
            'Handheld tracking shot weaving through a rain-soaked bazaar, bioluminescent fabric stalls, reflections on stone, warm lanterns contrasted with cool cyan signage, shallow depth of field',
        mood: 'Alive, kinetic',
        cameraMovement: 'Handheld chase through crowd',
        expectedFrames: 49,
    },
];

export const ensureDir = async (dir: string) => fs.mkdir(dir, { recursive: true });

const fileExists = async (target: string | undefined): Promise<boolean> => {
    if (!target) return false;
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
};

export const ensureSampleKeyframe = async (preferredPath: string | undefined, outputDir: string): Promise<string> => {
    if (await fileExists(preferredPath)) {
        return preferredPath as string;
    }
    const fallbackPath = path.join(outputDir, 'fallback-keyframe.png');
    await ensureDir(path.dirname(fallbackPath));
    await fs.writeFile(fallbackPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAI0lEQVR4nGNgYGD4z0AEYBxVSFIBDcQZiAJQGyCmAZhGIAEAOwECkbnWD+YAAAAASUVORK5CYII=', 'base64'));
    return fallbackPath;
};

export const selectSceneTemplates = (
    count: number,
    llmResponse: LLMStoryResponse | null,
): Array<LLMScenePayload> => {
    const source = llmResponse?.scenes ?? SAMPLE_SCENES;
    return source.slice(0, Math.max(1, Math.min(count, source.length)));
};

export const buildGeneratedScene = async (
    storyDir: string,
    keyframeSource: string,
    index: number,
    template: LLMScenePayload,
): Promise<GeneratedScene> => {
    const sceneId = `scene-${String(index + 1).padStart(3, '0')}`;
    const sceneDir = path.join(storyDir, 'scenes');
    const keyframeDir = path.join(storyDir, 'keyframes');
    await Promise.all([ensureDir(sceneDir), ensureDir(keyframeDir)]);

    const keyframeFilename = `${sceneId}.png`;
    const keyframePath = path.join(keyframeDir, keyframeFilename);
    await fs.copyFile(keyframeSource, keyframePath);

    const generated: GeneratedScene = {
        id: sceneId,
        title: template.title,
        summary: template.summary,
        prompt: template.prompt,
        mood: template.mood ?? 'Unspecified',
        keyframePath,
        expectedFrames: template.expectedFrames ?? 49,
        negativePrompt: normalizeNegativePrompt(template.negativePrompt),
        cameraMovement: template.cameraMovement,
        palette: template.palette,
    };

    const sceneJsonPath = path.join(sceneDir, `${sceneId}.json`);
    await fs.writeFile(sceneJsonPath, JSON.stringify(generated, null, 2), 'utf-8');

    return generated;
};

export const buildStoryPayload = (
    generatedScenes: GeneratedScene[],
    llmResponse: LLMStoryResponse | null,
    llmMetadata: LLMProviderMetadata,
    warnings: StoryGenerationWarning[],
): { story: Record<string, unknown> } => {
    const llmSnapshot = { ...llmMetadata };
    const warningMessages = warnings.map((warning) => warning.message);

    if (llmResponse) {
        return {
            story: {
                storyId: llmResponse.storyId,
                generatedAt: new Date().toISOString(),
                logline: llmResponse.logline,
                directorsVision: llmResponse.directorsVision,
                scenes: generatedScenes,
                generator: `local-llm:${llmResponse.generator ?? 'custom'}`,
                llm: llmSnapshot,
                warnings: warningMessages,
            },
        };
    }

    return {
        story: {
            storyId: `story-${crypto.randomUUID()}`,
            generatedAt: new Date().toISOString(),
            logline: 'An exhausted courier discovers that their encoded deliveries are rewriting the future of the skyline.',
            directorsVision:
                'Analog-inspired futurism with bold silhouettes, rain-bent reflections, and saturated bioluminescent accents. Camera work should feel like a patient steadicam with occasional handheld breathing.',
            scenes: generatedScenes,
            generator: 'scripts/generate-story-scenes.ts',
            llm: llmSnapshot,
            warnings: warningMessages,
        },
    };
};

export const generateStoryAssets = async (options: CliOptions) => {
    const resolvedOptions: CliOptions = {
        ...options,
        useLocalLLM: options.useLocalLLM ?? Boolean(options.providerUrl),
    };

    const runStoryDir = resolvedOptions.outputDir;
    await ensureDir(runStoryDir);
    const sampleKeyframe = await ensureSampleKeyframe(resolvedOptions.sampleKeyframe, runStoryDir);
    let llmResponse: LLMStoryResponse | null = null;
    const warnings: StoryGenerationWarning[] = [];
    const llmMetadata = createLLMMetadata(resolvedOptions);
    const resolvedRequestFormat = inferRequestFormat(resolvedOptions.providerUrl, resolvedOptions.llmRequestFormat);
    llmMetadata.requestFormat = resolvedRequestFormat;
    if (!llmMetadata.model && resolvedRequestFormat === 'openai-chat') {
        llmMetadata.model = DEFAULT_CHAT_MODEL;
    }

    if (llmMetadata.enabled) {
        if (!llmMetadata.providerUrl) {
            llmMetadata.status = 'error';
            llmMetadata.error = 'LOCAL_STORY_PROVIDER_URL not configured.';
            warnings.push({
                code: 'LLM_PROVIDER_MISSING',
                message: 'Local LLM was requested but LOCAL_STORY_PROVIDER_URL is not configured; using fallback story templates.',
            });
        } else {
            const llmStart = performance.now();
            llmMetadata.startedAt = new Date().toISOString();
            try {
                const request: LLMStoryRequest = {
                    sceneCount: resolvedOptions.sceneCount,
                    seed: resolvedOptions.localLLMSeed,
                    format: resolvedRequestFormat,
                };
                const resolvedModel =
                    resolvedOptions.localLLMModel ??
                    (resolvedRequestFormat === 'openai-chat' ? DEFAULT_CHAT_MODEL : undefined);
                if (resolvedModel) {
                    llmMetadata.model = resolvedModel;
                }
                if (resolvedOptions.localLLMTemperature !== undefined) {
                    llmMetadata.temperature = resolvedOptions.localLLMTemperature;
                }
                llmResponse = await fetchLocalStory(llmMetadata.providerUrl, request, {
                    timeoutMs: resolvedOptions.llmTimeoutMs,
                    format: resolvedRequestFormat,
                    model: resolvedModel,
                    temperature: resolvedOptions.localLLMTemperature,
                    customStoryIdea: resolvedOptions.customStoryIdea,
                });
                llmMetadata.status = 'success';
                llmMetadata.scenesReceived = llmResponse?.scenes?.length ?? 0;
            } catch (error) {
                llmMetadata.status = 'error';
                llmMetadata.error = error instanceof Error ? error.message : String(error);
                warnings.push({
                    code: 'LLM_FAILURE',
                    message: `Local LLM request failed (${llmMetadata.error}). Using deterministic fallback scenes.`,
                });
            } finally {
                llmMetadata.completedAt = new Date().toISOString();
                llmMetadata.durationMs = Math.round(performance.now() - llmStart);
            }
        }
    } else {
        llmMetadata.status = 'skipped';
    }

    const templates = selectSceneTemplates(resolvedOptions.sceneCount, llmResponse);
    if (llmMetadata.enabled && llmMetadata.status === 'success' && templates.length < resolvedOptions.sceneCount) {
        warnings.push({
            code: 'LLM_SCENE_SHORTFALL',
            message: `Local LLM returned ${templates.length} scenes, fewer than requested (${resolvedOptions.sceneCount}).`,
        });
    }

    const generatedScenes: GeneratedScene[] = [];
    for (let i = 0; i < templates.length; i += 1) {
        const template = templates[i];
        if (!template) continue;
        const generated = await buildGeneratedScene(runStoryDir, sampleKeyframe, i, template);
        generatedScenes.push(generated);
    }

    const { story } = buildStoryPayload(generatedScenes, llmResponse, llmMetadata, warnings);
    const storyPath = path.join(runStoryDir, 'story.json');
    await fs.writeFile(storyPath, JSON.stringify(story, null, 2), 'utf-8');

    return {
        runStoryDir,
        storyPath,
        story,
        generatedScenes,
        llm: llmMetadata,
        warnings,
    };
};
