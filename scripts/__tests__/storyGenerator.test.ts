import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

import {
    SAMPLE_SCENES,
    selectSceneTemplates,
    buildStoryPayload,
    ensureSampleKeyframe,
    buildGeneratedScene,
    type StoryGenerationWarning,
} from '../storyGenerator';
import { type LLMProviderMetadata } from '../types/storyTypes';

const TEMP_ROOT_PREFIX = 'story-gen-test-';
const tempDirs: string[] = [];

const createTempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_ROOT_PREFIX));
    tempDirs.push(dir);
    return dir;
};

afterAll(async () => {
    await Promise.all(
        tempDirs.map(async (dir) => {
            await fs.rm(dir, { recursive: true, force: true });
        }),
    );
});

describe('story generator helpers', () => {
    it('selects fallback scenes when no LLM response is provided', () => {
        const templates = selectSceneTemplates(2, null);
        expect(templates.length).toBe(2);
        expect(templates[0].title).toBe(SAMPLE_SCENES[0].title);
    });

    it('builds story payload from LLM response when available', () => {
        const llmMeta: LLMProviderMetadata = {
            enabled: true,
            providerUrl: 'http://localhost:11434',
            seed: '42',
            status: 'success',
            scenesRequested: 1,
            scenesReceived: 1,
            durationMs: 1200,
        };
        const warnings: StoryGenerationWarning[] = [{ code: 'TEST', message: 'warning' }];
        const response = {
            storyId: 'llm-story-123',
            logline: 'LLM logline',
            directorsVision: 'LLM vision',
            scenes: [
                {
                    title: 'LLM Scene',
                    summary: 'Summary',
                    prompt: 'Prompt',
                    mood: 'Mood',
                },
            ],
            generator: 'test-llm',
        };
        const dummyScene = {
            id: 'scene-001',
            title: 'LLM Scene',
            summary: 'Summary',
            prompt: 'Prompt',
            mood: 'Mood',
            keyframePath: '/tmp/foo.png',
            expectedFrames: 25,
            negativePrompt: 'neg',
        };
        const { story } = buildStoryPayload([dummyScene], response as any, llmMeta, warnings);
        expect(story.storyId).toBe('llm-story-123');
        expect(story.generator).toMatch(/local-llm:/);
        expect(story.scenes[0].id).toBe(dummyScene.id);
        expect(story.llm).toEqual(llmMeta);
        expect(story.warnings).toEqual(['warning']);
    });

    it('creates a fallback keyframe when preferred sample is missing', async () => {
        const dir = await createTempDir();
        const fallback = await ensureSampleKeyframe(undefined, dir);
        expect(fallback).toMatch(/fallback-keyframe\.png$/);
        const stats = await fs.stat(fallback);
        expect(stats.size).toBeGreaterThan(0);
    });

    it('writes scene/keyframe assets to the run directory', async () => {
        const dir = await createTempDir();
        const sampleKeyframe = path.join(dir, 'sample.png');
        await fs.writeFile(
            sampleKeyframe,
            Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAI0lEQVR4nGNgYGD4z0AEYBxVSFIBDcQZiAJQGyCmAZhGIAEAOwECkbnWD+YAAAAASUVORK5CYII=', 'base64'),
        );
        const scene = await buildGeneratedScene(dir, sampleKeyframe, 0, {
            title: 'Test Scene',
            summary: 'Summary',
            prompt: 'Prompt text',
            mood: 'Calm',
        });
        expect(scene.id).toBe('scene-001');
        const sceneJsonPath = path.join(dir, 'scenes', 'scene-001.json');
        const sceneJson = JSON.parse(await fs.readFile(sceneJsonPath, 'utf-8'));
        expect(sceneJson.prompt).toBe('Prompt text');
        const keyframeCopy = path.join(dir, 'keyframes', 'scene-001.png');
        const copied = await fs.readFile(keyframeCopy);
        const original = await fs.readFile(sampleKeyframe);
        expect(Buffer.compare(copied, original)).toBe(0);
    });

    it('includes llm metadata even when falling back to deterministic story', () => {
        const llmMeta: LLMProviderMetadata = {
            enabled: false,
            status: 'skipped',
            scenesRequested: 1,
        };
        const warnings: StoryGenerationWarning[] = [];
        const dummyScene = {
            id: 'scene-001',
            title: 'Fallback',
            summary: 'Fallback summary',
            prompt: 'Prompt',
            mood: 'Calm',
            keyframePath: '/tmp/keyframe.png',
            expectedFrames: 25,
            negativePrompt: 'neg',
        };
        const { story } = buildStoryPayload([dummyScene], null, llmMeta, warnings);
        expect(story.llm).toEqual(llmMeta);
        expect(story.generator).toBe('scripts/generate-story-scenes.ts');
    });
});
