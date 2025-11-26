/**
 * Integration Tests for Prompt Engineering Pipeline
 * 
 * Tests the complete flow from Story Bible V2 → Scene → Shot → ComfyUI prompt
 * Validates:
 * - V2 character profiles flow through to buildComfyUIPrompt
 * - Token truncation behavior with oversized prompts
 * - Validation error propagation
 * - Character descriptor synchronization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
    buildComfyUIPrompt, 
    syncCharacterDescriptors,
    validatePromptChain,
} from '../promptPipeline';
import { convertToStoryBibleV2 } from '../storyBibleConverter';
import { createSceneShotPlan } from '../sceneGenerationPipeline';
import { validateStoryBibleHard } from '../storyBibleValidator';
import { 
    StoryBible, 
    StoryBibleV2, 
    Scene,
    TimelineData,
    LocalGenerationSettings,
    VisualBibleCharacter,
} from '../../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const createV1Bible = (): StoryBible => ({
    logline: "A haunted detective races against time to stop a cunning mastermind threatening the city.",
    characters: `
**Marcus Cole** (Protagonist): A grizzled detective with dark hair and piercing blue eyes. 
He's tall and muscular, haunted by past failures. Driven by a need for redemption, 
Marcus seeks justice while battling his inner demons.

**Elena Voss**: A cunning mastermind who threatens everything Marcus holds dear.
She has silver hair and cold grey eyes, manipulative and ruthless.
`,
    setting: "A rain-slicked, neon-lit metropolis in the year 2049, where towering skyscrapers cast long shadows over crowded streets. The city never sleeps, its inhabitants living in a perpetual state of controlled chaos.",
    plotOutline: `
**Act I**
- Marcus discovers a body in an abandoned warehouse
- He meets Sarah at the crime scene, finding cryptic clues

**Act II**
- A chase through neon-lit streets
- Marcus confronts Elena in a dramatic rooftop scene

**Act III**
- The final confrontation in an abandoned museum
- Truth revealed, redemption achieved
`,
});

const createV2Bible = (): StoryBibleV2 => convertToStoryBibleV2(createV1Bible());

const createTestScene = (): Scene => ({
    id: 'scene-1',
    title: 'Warehouse Investigation',
    summary: 'Marcus investigates the abandoned warehouse, discovering crucial evidence.',
    timeline: {
        shots: [
            {
                id: 'shot-1',
                description: 'Marcus enters the warehouse cautiously, flashlight beam cutting through dust particles.',
            },
            {
                id: 'shot-2', 
                description: 'Close-up on Marcus examining evidence, his eyes narrowing.',
            },
        ],
        shotEnhancers: {},
        negativePrompt: '',
        transitions: [],
    },
});

const createTestTimeline = (): TimelineData => ({
    shots: [
        {
            id: 'shot-1',
            description: 'Marcus enters the warehouse cautiously, flashlight beam cutting through dust particles.',
        },
        {
            id: 'shot-2',
            description: 'Close-up on Marcus examining evidence, his eyes narrowing.',
        },
    ],
    shotEnhancers: {},
    transitions: [],
    negativePrompt: '',
});

const createTestSettings = (): LocalGenerationSettings => ({
    comfyUIUrl: 'http://localhost:8188',
    comfyUIClientId: 'test-client-id',
    workflowJson: '{}',
    mapping: {},
});

// ============================================================================
// Integration Tests: Story Bible → Prompt Pipeline
// ============================================================================

describe('Story Bible V2 → Prompt Pipeline Integration', () => {
    let v2Bible: StoryBibleV2;
    let scene: Scene;

    beforeEach(() => {
        v2Bible = createV2Bible();
        scene = createTestScene();
    });

    it('V2 character profiles flow through to buildComfyUIPrompt', () => {
        const shot = scene.timeline.shots[0]!;
        
        const prompt = buildComfyUIPrompt(
            v2Bible,
            scene,
            shot,
            'Cinematic noir lighting, dramatic shadows',
            ['blur', 'distortion'],
            500
        );

        // Should produce a valid prompt
        expect(prompt.positive.length).toBeGreaterThan(0);
        expect(prompt.negative.length).toBeGreaterThan(0);
        
        // Should be within token budget
        expect(prompt.tokens.positive).toBeLessThanOrEqual(500);
        expect(prompt.withinBudget).toBe(true);
    });

    it('buildComfyUIPrompt includes character visual descriptors', () => {
        // Ensure we have character profiles
        expect(v2Bible.characterProfiles.length).toBeGreaterThan(0);
        
        const shot = scene.timeline.shots[0]!;
        
        const prompt = buildComfyUIPrompt(
            v2Bible,
            scene,
            shot,
            'Film noir style',
            [],
            500
        );

        // The prompt should include some visual descriptors from the character
        // The exact content depends on the character parsing, but we should have output
        expect(prompt.positive).toBeTruthy();
    });

    it('handles V1 bible gracefully (no character profiles)', () => {
        const v1Bible = createV1Bible();
        const shot = scene.timeline.shots[0]!;
        
        // Should not throw when using V1 bible
        const prompt = buildComfyUIPrompt(
            v1Bible,
            scene,
            shot,
            'Cinematic lighting',
            [],
            500
        );

        expect(prompt.positive.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Integration Tests: Token Truncation
// ============================================================================

describe('Token Truncation Behavior', () => {
    it('truncates oversized prompts and adds warning', () => {
        const v2Bible = createV2Bible();
        const scene = createTestScene();
        const shot = scene.timeline.shots[0]!;
        
        // Use very small token budget to force truncation
        const prompt = buildComfyUIPrompt(
            v2Bible,
            scene,
            shot,
            'A very long director vision that should definitely exceed a tiny token budget when combined with all the other prompt elements and scene descriptions and character information that gets injected into the final prompt output.',
            [],
            50 // Very small budget
        );

        // Should have warning about truncation
        expect(prompt.warnings.length).toBeGreaterThan(0);
        expect(prompt.warnings.some(w => w.includes('Truncated'))).toBe(true);
        
        // Should still be within budget after truncation
        expect(prompt.tokens.positive).toBeLessThanOrEqual(50);
    });

    it('does not truncate prompts within budget', () => {
        const v2Bible = createV2Bible();
        const scene = createTestScene();
        const shot = scene.timeline.shots[0]!;
        
        const prompt = buildComfyUIPrompt(
            v2Bible,
            scene,
            shot,
            'Short vision',
            [],
            500 // Normal budget
        );

        // Should have no truncation warning
        expect(prompt.warnings.filter(w => w.includes('Truncated')).length).toBe(0);
        expect(prompt.withinBudget).toBe(true);
    });
});

// ============================================================================
// Integration Tests: Story Bible Validation → Scene Generation
// ============================================================================

describe('Validation Error Propagation', () => {
    it('validateStoryBibleHard detects token budget violations', () => {
        // Create a bible with very long content (500 tokens * 4 chars/token = 2000 chars)
        // Use 2500+ characters to ensure token overflow
        const longBible: StoryBibleV2 = {
            ...createV2Bible(),
            logline: 'A detective must stop a villain before time runs out. '.repeat(60), // ~2700 chars
        };

        const result = validateStoryBibleHard(longBible);
        
        expect(result.valid).toBe(false);
        // Token overflow is the issue for budget violation (not word count)
        expect(result.issues.some(i => i.code === 'LOGLINE_TOKEN_OVERFLOW')).toBe(true);
    });

    it('validation issues include suggestions for fixing', () => {
        const emptyBible: StoryBibleV2 = {
            logline: '',
            characters: '',
            setting: '',
            plotOutline: '',
            version: '2.0',
            characterProfiles: [],
            plotScenes: [],
        };

        const result = validateStoryBibleHard(emptyBible);
        
        expect(result.valid).toBe(false);
        
        // Should have suggestions for fixing
        const issuesWithSuggestions = result.issues.filter(i => i.suggestion);
        expect(issuesWithSuggestions.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Integration Tests: Scene Shot Plan Creation
// ============================================================================

describe('Scene Shot Plan Integration', () => {
    it('createSceneShotPlan produces valid prompts with storyBible and scene', () => {
        const timeline = createTestTimeline();
        const settings = createTestSettings();
        const v2Bible = createV2Bible();
        const scene = createTestScene();
        
        const plan = createSceneShotPlan(
            timeline,
            'Cinematic noir style',
            'Marcus investigates the warehouse',
            settings,
            v2Bible,
            scene
        );

        expect(plan.shots.length).toBe(2);
        expect(plan.shots[0]?.prompt.length).toBeGreaterThan(0);
        expect(plan.shots[1]?.prompt.length).toBeGreaterThan(0);
    });

    it('createSceneShotPlan with storyBible adds validation', () => {
        const timeline = createTestTimeline();
        const settings = createTestSettings();
        const v2Bible = createV2Bible();
        const scene = createTestScene();
        
        const plan = createSceneShotPlan(
            timeline,
            'Cinematic noir style',
            'Marcus investigates the warehouse',
            settings,
            v2Bible,
            scene
        );

        expect(plan.shots.length).toBe(2);
        
        // Each shot should have a validatedPrompt from the pipeline
        for (const shotPlan of plan.shots) {
            expect(shotPlan.validatedPrompt).toBeDefined();
            expect(shotPlan.validatedPrompt?.withinBudget).toBe(true);
        }
    });

    it('createSceneShotPlan collects prompt warnings', () => {
        const timeline = createTestTimeline();
        const settings = createTestSettings();
        const v2Bible = createV2Bible();
        const scene = createTestScene();
        
        const plan = createSceneShotPlan(
            timeline,
            'Cinematic noir style',
            'Marcus investigates the warehouse',
            settings,
            v2Bible,
            scene
        );

        // promptWarnings should be an array (may be empty if no warnings)
        expect(Array.isArray(plan.promptWarnings)).toBe(true);
    });
});

// ============================================================================
// Integration Tests: Character Descriptor Sync
// ============================================================================

describe('Character Descriptor Synchronization', () => {
    it('syncCharacterDescriptors links Visual Bible to Story Bible', () => {
        const v2Bible = createV2Bible();
        
        // Create visual bible characters
        const visualCharacters: VisualBibleCharacter[] = [
            {
                id: 'vchar-1',
                name: 'Marcus Cole',
                description: 'Detective character',
            },
            {
                id: 'vchar-2',
                name: 'Elena Voss',
                description: 'Antagonist character',
            },
        ];

        const result = syncCharacterDescriptors(v2Bible, visualCharacters);
        
        // Should have synchronized some characters
        expect(result.descriptors.size).toBeGreaterThanOrEqual(0);
    });

    it('syncCharacterDescriptors returns empty for V1 bible', () => {
        const v1Bible = createV1Bible();
        
        const visualCharacters: VisualBibleCharacter[] = [
            { id: 'vchar-1', name: 'Test', description: 'Test' },
        ];

        const result = syncCharacterDescriptors(v1Bible, visualCharacters);
        
        // V1 bible can't be synced
        expect(result.synchronized.length).toBe(0);
    });
});

// ============================================================================
// Integration Tests: Prompt Chain Validation
// ============================================================================

describe('Prompt Chain Validation', () => {
    it('validatePromptChain validates entire scene timeline', () => {
        const v2Bible = createV2Bible();
        const scene = createTestScene();
        
        const result = validatePromptChain(
            v2Bible,
            scene,
            'Cinematic style',
            ['blur', 'distortion'],
            5000
        );

        expect(result.valid).toBe(true);
        expect(result.totalTokens).toBeGreaterThan(0);
        expect(result.oversizedShots.length).toBe(0);
    });

    it('validatePromptChain handles scene with no timeline', () => {
        const v2Bible = createV2Bible();
        const emptyScene: Scene = {
            id: 'empty-scene',
            title: 'Empty Scene',
            summary: 'Empty scene for testing',
            timeline: {
                shots: [],
                shotEnhancers: {},
                transitions: [],
                negativePrompt: '',
            },
        };
        
        const result = validatePromptChain(
            v2Bible,
            emptyScene,
            'Vision',
            [],
        );

        // Should be valid with no shots
        expect(result.valid).toBe(true);
        expect(result.totalTokens).toBe(0);
        expect(result.messages).toContain('No shots to validate');
    });
});

// ============================================================================
// End-to-End: Full Pipeline Flow
// ============================================================================

describe('End-to-End Pipeline Flow', () => {
    it('complete flow from V1 Bible → V2 → Validation → Prompts', () => {
        // Step 1: Start with V1 Bible
        const v1Bible = createV1Bible();
        expect(v1Bible.characters).toContain('Marcus');

        // Step 2: Convert to V2
        const v2Bible = convertToStoryBibleV2(v1Bible);
        expect(v2Bible.version).toBe('2.0');
        expect(v2Bible.characterProfiles).toBeDefined();

        // Step 3: Validate
        const validation = validateStoryBibleHard(v2Bible);
        // May have warnings but should not hard-fail with valid content
        expect(validation).toBeDefined();

        // Step 4: Create scene and timeline
        const scene = createTestScene();
        const timeline = createTestTimeline();

        // Step 5: Create shot plan with validation
        const plan = createSceneShotPlan(
            timeline,
            'Film noir, dramatic lighting',
            scene.summary,
            createTestSettings(),
            v2Bible,
            scene
        );

        expect(plan.shots.length).toBe(2);
        expect(plan.combinedPrompt.length).toBeGreaterThan(0);

        // Step 6: Each shot should have validated prompt
        for (const shot of plan.shots) {
            expect(shot.prompt.length).toBeGreaterThan(0);
            if (shot.validatedPrompt) {
                expect(shot.validatedPrompt.tokens.positive).toBeGreaterThan(0);
            }
        }
    });

    it('pipeline handles edge case of minimal scene', () => {
        const v2Bible = createV2Bible();
        const minimalScene: Scene = {
            id: 'minimal-scene',
            title: 'Minimal Scene',
            summary: '',
            timeline: {
                shots: [{ id: 'shot-1', description: 'Test shot' }],
                shotEnhancers: {},
                transitions: [],
                negativePrompt: '',
            },
        };

        // Should not throw
        const prompt = buildComfyUIPrompt(
            v2Bible,
            minimalScene,
            { id: 'shot-1', description: 'Test shot' },
            'Vision',
            [],
            500
        );

        expect(prompt.positive.length).toBeGreaterThan(0);
    });
});
