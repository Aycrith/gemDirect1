/**
 * Tests for promptPipeline service
 * Validates ComfyUI prompt building, token management, and chain validation
 */

import { describe, it, expect } from 'vitest';
import {
    buildComfyUIPrompt,
    syncCharacterDescriptors,
    validatePromptChain,
    buildCharacterPromptConfig,
    getPromptStatistics,
} from '../promptPipeline';
import { StoryBible, StoryBibleV2, Scene, Shot, CharacterProfile, VisualBibleCharacter } from '../../types';

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
                hair: 'long dark hair',
                eyes: 'piercing green eyes',
            },
            personality: ['brave', 'determined', 'compassionate'],
            backstory: 'A warrior from the northern kingdoms.',
            motivations: ['protect her people', 'find her lost brother'],
            relationships: [],
            visualDescriptor: 'Elena, tall athletic woman with long dark hair and piercing green eyes',
            role: 'protagonist',
        },
        {
            id: 'char-2',
            name: 'Malachar',
            age: 'ancient',
            appearance: {
                build: 'imposing',
                eyes: 'glowing red eyes',
            },
            personality: ['cunning', 'ruthless'],
            backstory: 'The shadow lord who seeks to cover the world in darkness.',
            motivations: ['eternal power'],
            relationships: [{ characterId: 'char-1', characterName: 'Elena', relationshipType: 'enemy', description: 'Mortal enemies' }],
            visualDescriptor: 'Malachar, imposing figure with glowing red eyes and dark robes',
            role: 'antagonist',
        },
    ],
    plotScenes: [],
});

describe('promptPipeline', () => {
    describe('buildComfyUIPrompt', () => {
        it('should build a prompt with scene context and shot description', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Wide establishing shot of the castle')]);
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Epic fantasy cinematography', []);
            
            expect(result.positive).toBeTruthy();
            expect(result.positive).toContain('Wide establishing shot');
            expect(result.tokens.positive).toBeGreaterThan(0);
        });

        it('should include character descriptors from StoryBibleV2', () => {
            const bible = createMockStoryBibleV2();
            const scene = createMockScene([createMockShot('shot-1', 'Elena draws her sword')]);
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Fantasy style');
            
            expect(result.positive).toContain('Elena');
        });

        it('should respect token budget', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'A very long shot description '.repeat(100))]);
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style', [], 100);
            
            expect(result.tokens.positive).toBeLessThanOrEqual(100);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should include negative prompts', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Hero stands')]);
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style', ['blurry', 'low quality']);
            
            expect(result.negative).toContain('blurry');
            expect(result.negative).toContain('low quality');
        });

        it('should use default negative prompts when none provided', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Hero stands')]);
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style');
            
            expect(result.negative).toBeTruthy();
            expect(result.negative.length).toBeGreaterThan(0);
        });

        it('should mark withinBudget correctly', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Short')]);
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style', [], 1000);
            
            expect(result.withinBudget).toBe(true);
        });

        it('should include shot enhancers when provided', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Hero stands')]);
            scene.timeline.shotEnhancers = {
                'shot-1': {
                    framing: ['wide shot'],
                    lighting: ['golden hour'],
                },
            };
            const shot = scene.timeline.shots[0];
            
            const result = buildComfyUIPrompt(
                bible, scene, shot, 'Style', [], 500,
                scene.timeline.shotEnhancers
            );
            
            expect(result.positive).toContain('wide shot');
            expect(result.positive).toContain('golden hour');
        });
    });

    describe('syncCharacterDescriptors', () => {
        it('should sync visual characters with story bible profiles', () => {
            const bible = createMockStoryBibleV2();
            const visualChars: VisualBibleCharacter[] = [
                { id: 'vis-1', name: 'Elena', description: 'The hero', storyBibleCharacterId: 'char-1' },
            ];
            
            const result = syncCharacterDescriptors(bible, visualChars);
            
            expect(result.synchronized).toContain('Elena');
            expect(result.descriptors.get('vis-1')).toBeDefined();
        });

        it('should match by name when storyBibleCharacterId not set', () => {
            const bible = createMockStoryBibleV2();
            const visualChars: VisualBibleCharacter[] = [
                { id: 'vis-1', name: 'Elena', description: 'The hero' },
            ];
            
            const result = syncCharacterDescriptors(bible, visualChars);
            
            expect(result.synchronized).toContain('Elena');
        });

        it('should report missing characters', () => {
            const bible = createMockStoryBibleV2();
            const visualChars: VisualBibleCharacter[] = [
                { id: 'vis-1', name: 'Unknown Character', description: 'Mystery' },
            ];
            
            const result = syncCharacterDescriptors(bible, visualChars);
            
            expect(result.missing).toContain('Unknown Character');
        });

        it('should return empty sync for V1 bibles', () => {
            const bible = createMockStoryBible();
            const visualChars: VisualBibleCharacter[] = [
                { id: 'vis-1', name: 'Elena', description: 'The hero' },
            ];
            
            const result = syncCharacterDescriptors(bible, visualChars);
            
            expect(result.synchronized.length).toBe(0);
            expect(result.missing.length).toBe(0);
        });
    });

    describe('validatePromptChain', () => {
        it('should validate empty timeline as valid', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([]);
            
            const result = validatePromptChain(bible, scene, 'Style');
            
            expect(result.valid).toBe(true);
            expect(result.totalTokens).toBe(0);
        });

        it('should validate timeline with shots within budget', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([
                createMockShot('shot-1', 'Short shot'),
                createMockShot('shot-2', 'Another short'),
            ]);
            
            const result = validatePromptChain(bible, scene, 'Style');
            
            expect(result.valid).toBe(true);
            expect(result.oversizedShots.length).toBe(0);
        });

        it('should detect oversized shots', () => {
            const bible = createMockStoryBible();
            const longDescription = 'Very detailed shot '.repeat(500);
            const scene = createMockScene([
                createMockShot('shot-1', longDescription),
            ]);
            
            const result = validatePromptChain(bible, scene, 'Style');
            
            // Note: truncation means withinBudget is true after truncation
            // but we still get warnings
            expect(result.messages.length).toBeGreaterThan(0);
        });

        it('should calculate total tokens', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([
                createMockShot('shot-1', 'Shot one description'),
                createMockShot('shot-2', 'Shot two description'),
            ]);
            
            const result = validatePromptChain(bible, scene, 'Style');
            
            expect(result.totalTokens).toBeGreaterThan(0);
        });

        it('should check against total budget when specified', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([
                createMockShot('shot-1', 'Description that is reasonably long'),
                createMockShot('shot-2', 'Another reasonable description'),
            ]);
            
            const result = validatePromptChain(bible, scene, 'Style', [], 10); // Very low budget
            
            expect(result.messages.some(m => m.includes('exceeds chain budget'))).toBe(true);
        });
    });

    describe('buildCharacterPromptConfig', () => {
        it('should build config from character profile', () => {
            const profile: CharacterProfile = {
                id: 'char-1',
                name: 'Elena',
                age: '28',
                appearance: {
                    height: 'tall',
                    build: 'athletic',
                    hair: 'dark hair',
                    eyes: 'green eyes',
                },
                personality: ['brave'],
                backstory: 'A warrior',
                motivations: ['save the world'],
                relationships: [],
                visualDescriptor: 'Elena, tall warrior with dark hair',
                role: 'protagonist',
            };
            
            const result = buildCharacterPromptConfig(profile);
            
            expect(result.characterId).toBe('char-1');
            expect(result.visualDescriptor).toBe('Elena, tall warrior with dark hair');
        });

        it('should generate visual descriptor from appearance if not provided', () => {
            const profile: CharacterProfile = {
                id: 'char-1',
                name: 'Unknown',
                age: '30',
                appearance: {
                    height: 'tall',
                    build: 'slim',
                },
                personality: [],
                backstory: '',
                motivations: [],
                relationships: [],
                visualDescriptor: '',
                role: 'supporting',
            };
            
            const result = buildCharacterPromptConfig(profile);
            
            expect(result.visualDescriptor).toContain('tall');
            expect(result.visualDescriptor).toContain('slim');
        });
    });

    describe('getPromptStatistics', () => {
        it('should return zero stats for empty timeline', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([]);
            
            const result = getPromptStatistics(bible, scene, 'Style');
            
            expect(result.shotCount).toBe(0);
            expect(result.budgetCompliance).toBe(100);
        });

        it('should calculate statistics for timeline', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([
                createMockShot('shot-1', 'First shot'),
                createMockShot('shot-2', 'Second shot with more words'),
            ]);
            
            const result = getPromptStatistics(bible, scene, 'Style');
            
            expect(result.shotCount).toBe(2);
            expect(result.avgTokensPerShot).toBeGreaterThan(0);
            expect(result.maxTokens).toBeGreaterThanOrEqual(result.minTokens);
        });

        it('should report 100% compliance for short prompts', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([
                createMockShot('shot-1', 'Short'),
                createMockShot('shot-2', 'Also short'),
            ]);
            
            const result = getPromptStatistics(bible, scene, 'Brief');
            
            expect(result.budgetCompliance).toBe(100);
        });
    });
});
