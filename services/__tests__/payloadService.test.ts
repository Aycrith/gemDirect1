/**
 * Tests for payloadService
 * Validates payload generation for ComfyUI integration
 */

import { describe, it, expect } from 'vitest';
import {
    generateVideoRequestPayloads,
    generateKeyframePayloads,
    generateShotPayloads,
    getAssembledPromptFromPayloads,
    generateBookendPayloads,
} from '../payloadService';
import { Scene, Shot, StoryBible, StoryBibleV2, TimelineData } from '../../types';

// Test fixtures
const createMockShot = (id: string, description: string): Shot => ({
    id,
    description,
});

const createMockScene = (shots: Shot[]): Scene => ({
    id: 'scene-1',
    title: 'Test Scene',
    summary: 'A dramatic scene where the protagonist faces their greatest challenge.',
    timeline: {
        shots,
        shotEnhancers: {},
        transitions: [],
        negativePrompt: '',
    },
});

const createMockStoryBible = (): StoryBible => ({
    logline: 'A hero must save the world from darkness.',
    characters: '**Hero**: The protagonist, brave and determined.',
    setting: 'A fantasy realm filled with magic and danger.',
    plotOutline: 'Act I: The Call\nAct II: The Journey\nAct III: The Return',
});

const createMockStoryBibleV2 = (): StoryBibleV2 => ({
    ...createMockStoryBible(),
    version: '2.0',
    characterProfiles: [
        {
            id: 'char-1',
            name: 'Elena',
            age: '28',
            appearance: {
                height: 'tall',
                build: 'athletic',
            },
            personality: ['brave'],
            backstory: 'A warrior from the northern kingdoms.',
            motivations: ['protect her people'],
            relationships: [],
            visualDescriptor: 'Elena, tall athletic woman with dark hair',
            role: 'protagonist',
        },
    ],
    plotScenes: [],
});

const createMockTimeline = (): TimelineData => ({
    shots: [
        createMockShot('shot-1', 'Wide establishing shot'),
        createMockShot('shot-2', 'Close-up on protagonist'),
    ],
    shotEnhancers: {
        'shot-1': { framing: ['wide shot'], lighting: ['golden hour'] },
    },
    transitions: ['dissolve'],
    negativePrompt: 'blurry, low quality',
});

describe('payloadService', () => {
    describe('generateKeyframePayloads', () => {
        it('should generate payloads with scene keyframe prompt', () => {
            const scene = createMockScene([createMockShot('shot-1', 'Test')]);
            const bible = createMockStoryBible();
            
            const result = generateKeyframePayloads(scene, bible, 'Cinematic style', []);
            
            expect(result.text).toBeTruthy();
            expect(result.json).toBeTruthy();
            expect(result.structured).toHaveLength(1);
            expect(result.structured[0].type).toBe('keyframe');
        });

        it('should include scene information in metadata', () => {
            const scene = createMockScene([]);
            scene.title = 'The Confrontation';
            const bible = createMockStoryBible();
            
            const result = generateKeyframePayloads(scene, bible, 'Dark atmosphere', []);
            const parsed = JSON.parse(result.json);
            
            expect(parsed.metadata.type).toBe('scene_keyframe');
            expect(parsed.metadata.sceneId).toBe('scene-1');
            expect(parsed.metadata.sceneTitle).toBe('The Confrontation');
            expect(parsed.metadata.pipelineVersion).toBe('2.0');
        });

        it('should include negative prompts', () => {
            const scene = createMockScene([]);
            const bible = createMockStoryBible();
            
            const result = generateKeyframePayloads(
                scene, bible, 'Style',
                ['blurry', 'low quality']
            );
            
            expect(result.negativePrompt).toContain('blurry');
            expect(result.negativePrompt).toContain('low quality');
        });

        it('should use V2 bible character descriptors', () => {
            const scene = createMockScene([]);
            scene.summary = 'Elena prepares for battle.';
            const bible = createMockStoryBibleV2();
            
            const result = generateKeyframePayloads(scene, bible, 'Epic style', []);
            
            // Should include character descriptor from V2 bible
            expect(result.text).toContain('Elena');
        });
    });

    describe('generateShotPayloads', () => {
        it('should generate payloads for a shot', () => {
            const shot = createMockShot('shot-1', 'Hero draws sword');
            const scene = createMockScene([shot]);
            const bible = createMockStoryBible();
            
            const result = generateShotPayloads(shot, scene, bible, 'Fantasy style');
            
            expect(result.text).toContain('Hero draws sword');
            expect(result.structured[0].type).toBe('shot');
            expect(result.structured[0].shotId).toBe('shot-1');
        });

        it('should include enhancers in prompt', () => {
            const shot = createMockShot('shot-1', 'Character walks');
            const scene = createMockScene([shot]);
            const bible = createMockStoryBible();
            const enhancers = {
                framing: ['close-up'],
                lighting: ['dramatic'],
            };
            
            const result = generateShotPayloads(shot, scene, bible, 'Style', enhancers);
            
            expect(result.text).toContain('close-up');
            expect(result.text).toContain('dramatic');
        });

        it('should include style directives', () => {
            const shot = createMockShot('shot-1', 'Simple shot');
            const scene = createMockScene([shot]);
            const bible = createMockStoryBible();
            
            const result = generateShotPayloads(
                shot, scene, bible,
                'cinematic, 4k, film grain'
            );
            
            expect(result.text).toContain('cinematic');
            expect(result.text).toContain('4k');
        });

        it('should handle negative prompts', () => {
            const shot = createMockShot('shot-1', 'A scene');
            const scene = createMockScene([shot]);
            const bible = createMockStoryBible();
            
            const result = generateShotPayloads(
                shot, scene, bible, 'Style', undefined,
                ['blur', 'watermark']
            );
            
            expect(result.negativePrompt).toContain('blur');
            expect(result.negativePrompt).toContain('watermark');
        });
    });

    describe('generateVideoRequestPayloads', () => {
        it('should generate payloads from timeline', () => {
            const timeline = createMockTimeline();
            
            const result = generateVideoRequestPayloads(
                timeline,
                'Cinematic vision',
                'A dramatic scene',
                {}
            );
            
            expect(result.text).toBeTruthy();
            expect(result.json).toBeTruthy();
            expect(result.structured).toHaveLength(2);
            expect(result.negativePrompt).toBe('blurry, low quality');
        });

        it('should include shot enhancers', () => {
            const timeline = createMockTimeline();
            
            const result = generateVideoRequestPayloads(
                timeline,
                'Vision',
                'Scene',
                {}
            );
            
            expect(result.text).toContain('wide shot');
            expect(result.text).toContain('golden hour');
        });
    });

    describe('generateBookendPayloads', () => {
        it('should generate start and end payloads', () => {
            const result = generateBookendPayloads(
                'A tense confrontation',
                'Fantasy story context',
                'Dark moody lighting',
                { startMoment: 'The hero enters', endMoment: 'The villain falls' },
                'blurry'
            );
            
            expect(result.start.text).toContain('OPENING FRAME');
            expect(result.start.text).toContain('The hero enters');
            expect(result.end.text).toContain('CLOSING FRAME');
            expect(result.end.text).toContain('The villain falls');
        });

        it('should include negative prompt in both payloads', () => {
            const result = generateBookendPayloads(
                'Scene',
                'Context',
                'Vision',
                { startMoment: 'Start', endMoment: 'End' },
                'low quality, blurry'
            );
            
            expect(result.start.negativePrompt).toBe('low quality, blurry');
            expect(result.end.negativePrompt).toBe('low quality, blurry');
        });
    });

    describe('getAssembledPromptFromPayloads', () => {
        it('should extract assembled prompt from payloads', () => {
            const payloads = {
                json: '{}',
                text: 'A beautiful sunset over mountains',
                structured: [],
                negativePrompt: 'blurry',
            };
            
            const result = getAssembledPromptFromPayloads(payloads);
            
            expect(result.separateFormat.positive).toBe('A beautiful sunset over mountains');
        });
    });
});
