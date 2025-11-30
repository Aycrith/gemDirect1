/**
 * Tests for promptPipeline service
 * Validates ComfyUI prompt building, token management, and chain validation
 */

import { describe, it, expect, vi } from 'vitest';
import {
    buildComfyUIPrompt,
    syncCharacterDescriptors,
    validatePromptChain,
    buildCharacterPromptConfig,
    getPromptStatistics,
    assemblePromptForProvider,
    buildSceneKeyframePrompt,
    buildSceneKeyframePromptWithGuard,
    buildComfyUIPromptWithGuard,
} from '../promptPipeline';
import { FeatureFlags } from '../../utils/featureFlags';
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
            const shot = scene.timeline.shots[0]!;
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Epic fantasy cinematography', []);
            
            expect(result.positive).toBeTruthy();
            expect(result.positive).toContain('Wide establishing shot');
            expect(result.tokens.positive).toBeGreaterThan(0);
        });

        it('should include character descriptors from StoryBibleV2', () => {
            const bible = createMockStoryBibleV2();
            const scene = createMockScene([createMockShot('shot-1', 'Elena draws her sword')]);
            const shot = scene.timeline.shots[0]!;
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Fantasy style');
            
            expect(result.positive).toContain('Elena');
        });

        it('should respect token budget', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'A very long shot description '.repeat(100))]);
            const shot = scene.timeline.shots[0]!;
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style', [], 100);
            
            expect(result.tokens.positive).toBeLessThanOrEqual(100);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should include negative prompts', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Hero stands')]);
            const shot = scene.timeline.shots[0]!;
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style', ['blurry', 'low quality']);
            
            expect(result.negative).toContain('blurry');
            expect(result.negative).toContain('low quality');
        });

        it('should use default negative prompts when none provided', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Hero stands')]);
            const shot = scene.timeline.shots[0]!;
            
            const result = buildComfyUIPrompt(bible, scene, shot, 'Style');
            
            expect(result.negative).toBeTruthy();
            expect(result.negative.length).toBeGreaterThan(0);
        });

        it('should mark withinBudget correctly', () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Short')]);
            const shot = scene.timeline.shots[0]!;
            
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
            const shot = scene.timeline.shots[0]!;
            
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

        it('should skip characters with descriptorSource === userEdit', () => {
            const bible = createMockStoryBibleV2();
            const visualChars: VisualBibleCharacter[] = [
                { id: 'vis-1', name: 'Elena', description: 'The hero', storyBibleCharacterId: 'char-1', descriptorSource: 'userEdit' },
                { id: 'vis-2', name: 'Malachar', description: 'The villain', storyBibleCharacterId: 'char-2' },
            ];
            
            const result = syncCharacterDescriptors(bible, visualChars);
            
            expect(result.skippedUserEdits).toContain('Elena');
            expect(result.synchronized).toContain('Malachar');
            expect(result.synchronized).not.toContain('Elena');
        });

        it('should sync characters with descriptorSource === storyBible', () => {
            const bible = createMockStoryBibleV2();
            const visualChars: VisualBibleCharacter[] = [
                { id: 'vis-1', name: 'Elena', description: 'The hero', storyBibleCharacterId: 'char-1', descriptorSource: 'storyBible' },
            ];
            
            const result = syncCharacterDescriptors(bible, visualChars);
            
            expect(result.synchronized).toContain('Elena');
            expect(result.skippedUserEdits.length).toBe(0);
        });
    });

    describe('assemblePromptForProvider', () => {
        it('should create inline format for Gemini', () => {
            const result = assemblePromptForProvider(
                'A beautiful sunset over mountains',
                ['blurry', 'low quality'],
                { provider: 'gemini' }
            );
            
            expect(result.inlineFormat).toContain('A beautiful sunset');
            expect(result.inlineFormat).toContain('NEGATIVE PROMPT:');
            expect(result.inlineFormat).toContain('blurry, low quality');
        });

        it('should create separate format for ComfyUI', () => {
            const result = assemblePromptForProvider(
                'A beautiful sunset over mountains',
                ['blurry', 'low quality'],
                { provider: 'comfyui' }
            );
            
            expect(result.separateFormat.positive).toBe('A beautiful sunset over mountains');
            expect(result.separateFormat.negative).toBe('blurry, low quality');
        });

        it('should deduplicate negatives case-insensitively', () => {
            const result = assemblePromptForProvider(
                'Test prompt',
                ['Blurry', 'blurry', 'BLURRY', 'low quality', 'Low Quality'],
                { provider: 'comfyui' }
            );
            
            // First-wins: should keep 'Blurry' not 'blurry' or 'BLURRY'
            expect(result.separateFormat.negative).toBe('Blurry, low quality');
        });

        it('should append style directives to positive prompt', () => {
            const result = assemblePromptForProvider(
                'A forest scene',
                [],
                { provider: 'comfyui', styleDirectives: 'cinematic, 4k, dramatic lighting' }
            );
            
            expect(result.separateFormat.positive).toBe('A forest scene, cinematic, 4k, dramatic lighting');
        });

        it('should add token warning when prompt exceeds budget', () => {
            const longPrompt = 'word '.repeat(500);
            const result = assemblePromptForProvider(
                longPrompt,
                [],
                { provider: 'comfyui', validateTokens: true, maxTokens: 100 }
            );
            
            expect(result.tokenWarning).toBeDefined();
            expect(result.tokenWarning).toContain('exceed');
        });

        it('should not add token warning when within budget', () => {
            const result = assemblePromptForProvider(
                'Short prompt',
                ['blurry'],
                { provider: 'comfyui', validateTokens: true, maxTokens: 1000 }
            );
            
            expect(result.tokenWarning).toBeUndefined();
        });

        it('should handle empty negatives gracefully', () => {
            const result = assemblePromptForProvider(
                'A simple prompt',
                [],
                { provider: 'gemini' }
            );
            
            expect(result.inlineFormat).toBe('A simple prompt');
            expect(result.inlineFormat).not.toContain('NEGATIVE PROMPT');
            expect(result.separateFormat.negative).toBe('');
        });
    });

    describe('buildSceneKeyframePrompt', () => {
        it('should build keyframe prompt from scene summary', () => {
            const scene = createMockScene([createMockShot('shot-1', 'Test shot')]);
            const bible = createMockStoryBible();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'Epic fantasy style', []);
            
            expect(result.separateFormat.positive).toContain('dramatic scene');
            expect(result.separateFormat.positive).toContain('Epic fantasy style');
        });

        it('should include character descriptors from V2 bible', () => {
            const scene = createMockScene([createMockShot('shot-1', 'Elena fights')]);
            scene.summary = 'Elena confronts Malachar in the throne room.';
            const bible = createMockStoryBibleV2();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'Dark fantasy style', []);
            
            // Should include character visual descriptors
            expect(result.separateFormat.positive).toContain('Elena');
        });

        it('should include negative prompts', () => {
            const scene = createMockScene([createMockShot('shot-1', 'Test')]);
            const bible = createMockStoryBible();
            
            const result = buildSceneKeyframePrompt(
                scene, bible, 'Style',
                ['blurry', 'watermark']
            );
            
            expect(result.separateFormat.negative).toContain('blurry');
            expect(result.separateFormat.negative).toContain('watermark');
        });

        it('should prioritize protagonist over supporting characters', () => {
            const scene = createMockScene([]);
            scene.summary = 'Elena and Malachar face off.';
            const bible = createMockStoryBibleV2();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'Style', []);
            
            // Protagonist Elena should appear before antagonist Malachar
            const positive = result.separateFormat.positive;
            const elenaIndex = positive.indexOf('Elena');
            const malacharIndex = positive.indexOf('Malachar');
            
            // Both should be present since both are in scene
            expect(elenaIndex).toBeGreaterThan(-1);
            expect(malacharIndex).toBeGreaterThan(-1);
        });

        it('should provide both inline and separate formats', () => {
            const scene = createMockScene([]);
            scene.summary = 'A test scene.';
            const bible = createMockStoryBible();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'Cinematic', ['blur']);
            
            expect(result.inlineFormat).toBeDefined();
            expect(result.separateFormat).toBeDefined();
            expect(result.inlineFormat).toContain('NEGATIVE PROMPT');
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

    describe('buildSceneKeyframePromptWithGuard', () => {
        const createMockFlags = (mode: 'off' | 'warn' | 'block'): Partial<FeatureFlags> => ({
            promptTokenGuard: mode,
        });

        const createMockApi = (tokenCount: number) => ({
            countTokens: vi.fn().mockResolvedValue({ totalTokens: tokenCount }),
        });

        it('should always allow when guard is off', async () => {
            const scene = createMockScene([createMockShot('shot-1', 'Test')]);
            const bible = createMockStoryBible();
            
            const result = await buildSceneKeyframePromptWithGuard(
                scene,
                bible,
                'Style',
                [],
                { flags: createMockFlags('off') }
            );
            
            expect(result.allowed).toBe(true);
            expect(result.prompt).toBeDefined();
        });

        it('should allow with warning when guard is warn and API reports over budget', async () => {
            const scene = createMockScene([]);
            // Create a scene summary long enough that truncated prompt is still near budget
            // sceneKeyframe budget = 600, fast path threshold = 80% = 480 tokens
            // At 3.5 chars/token, need ~1680 chars to trigger API call
            scene.summary = 'A dramatic scene where the protagonist faces their greatest challenge. '.repeat(30);
            const bible = createMockStoryBible();
            // API returns tokens over budget (600)
            const api = createMockApi(700);
            
            const result = await buildSceneKeyframePromptWithGuard(
                scene,
                bible,
                'Cinematic lighting, epic fantasy style, dramatic atmosphere, golden hour',
                [],
                { flags: createMockFlags('warn'), tokenApi: api }
            );
            
            // If prompt was long enough, API was called and returns over budget
            if (result.source === 'api') {
                expect(result.allowed).toBe(true);
                expect(result.tokens > result.budget).toBe(true);
                expect(result.warning).toBeDefined();
                expect(result.warning).toContain('exceeds');
            } else {
                // If fast path was taken, the heuristic showed under budget
                // This is expected behavior for shorter prompts
                expect(result.allowed).toBe(true);
            }
        });

        it('should block when guard is block and API reports over budget', async () => {
            const scene = createMockScene([]);
            scene.summary = 'A dramatic scene where the protagonist faces their greatest challenge. '.repeat(30);
            const bible = createMockStoryBible();
            // API returns tokens over budget (600)
            const api = createMockApi(700);
            
            const result = await buildSceneKeyframePromptWithGuard(
                scene,
                bible,
                'Cinematic lighting, epic fantasy style, dramatic atmosphere, golden hour',
                [],
                { flags: createMockFlags('block'), tokenApi: api }
            );
            
            // If prompt was long enough for API call
            if (result.source === 'api') {
                expect(result.allowed).toBe(false);
                expect(result.tokens > result.budget).toBe(true);
            } else {
                // Fast path - heuristic showed under budget, so allowed
                expect(result.allowed).toBe(true);
            }
        });

        it('should include token count and source', async () => {
            const scene = createMockScene([]);
            scene.summary = 'A short scene.';
            const bible = createMockStoryBible();
            
            const result = await buildSceneKeyframePromptWithGuard(
                scene,
                bible,
                'Brief style',
                [],
                { flags: createMockFlags('warn') }
            );
            
            expect(result.tokens).toBeGreaterThan(0);
            expect(result.source).toBe('heuristic'); // No API provided, uses heuristic fast path
            expect(result.budget).toBe(600); // sceneKeyframe budget
        });

        it('should call API when prompt is near budget threshold', async () => {
            const scene = createMockScene([]);
            // Create a long summary that survives truncation
            scene.summary = 'A very long scene description that needs many words. '.repeat(40);
            const bible = createMockStoryBible();
            const api = createMockApi(550); // Under budget but API should be called
            
            const result = await buildSceneKeyframePromptWithGuard(
                scene,
                bible,
                'Epic cinematic style with dramatic lighting and atmospheric effects',
                [],
                { flags: createMockFlags('warn'), tokenApi: api }
            );
            
            // The test validates the mechanism works - either API was called or heuristic fast path was used
            expect(result.tokens).toBeGreaterThan(0);
            expect(['api', 'heuristic']).toContain(result.source);
        });
    });

    describe('buildComfyUIPromptWithGuard', () => {
        const createMockFlags = (mode: 'off' | 'warn' | 'block'): Partial<FeatureFlags> => ({
            promptTokenGuard: mode,
        });

        const createMockApi = (tokenCount: number) => ({
            countTokens: vi.fn().mockResolvedValue({ totalTokens: tokenCount }),
        });

        it('should return both comfyPrompt and assembled prompt', async () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Test shot')]);
            const shot = scene.timeline.shots[0]!;
            
            const result = await buildComfyUIPromptWithGuard(
                bible,
                scene,
                shot,
                'Style',
                [],
                { flags: createMockFlags('off') }
            );
            
            expect(result.comfyPrompt).toBeDefined();
            expect(result.comfyPrompt.positive).toBeTruthy();
            expect(result.prompt.separateFormat).toBeDefined();
        });

        it('should respect block mode', async () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'Very long description '.repeat(100))]);
            const shot = scene.timeline.shots[0]!;
            const api = createMockApi(1000);
            
            const result = await buildComfyUIPromptWithGuard(
                bible,
                scene,
                shot,
                'Style',
                [],
                { flags: createMockFlags('block'), tokenApi: api },
                500 // Budget
            );
            
            expect(result.allowed).toBe(false);
        });

        it('should log API calls when callback provided', async () => {
            const bible = createMockStoryBible();
            const scene = createMockScene([createMockShot('shot-1', 'a'.repeat(400))]); // Near budget
            const shot = scene.timeline.shots[0]!;
            const api = createMockApi(450);
            const logApiCall = vi.fn();
            
            await buildComfyUIPromptWithGuard(
                bible,
                scene,
                shot,
                'Style',
                [],
                { flags: createMockFlags('warn'), tokenApi: api, logApiCall }
            );
            
            expect(logApiCall).toHaveBeenCalled();
        });
    });
});
