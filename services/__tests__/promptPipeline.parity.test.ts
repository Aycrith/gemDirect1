/**
 * Flag-Off Parity Tests
 * 
 * Phase 7: E2E Testing - Verifies new pipeline matches legacy behavior when flags are off
 * These tests ensure backward compatibility during gradual rollout
 */
import { describe, it, expect } from 'vitest';
import { 
    assemblePromptForProvider,
    buildSceneKeyframePrompt,
} from '../promptPipeline';
import type { StoryBibleV2, Scene, ShotEnhancers } from '../../types';

// Default shot enhancers for test scenes
const defaultShotEnhancers: ShotEnhancers = {
    'default': {
        framing: ['medium shot'],
        movement: ['static'],
        lens: ['50mm'],
        pacing: ['normal'],
        lighting: ['natural'],
        mood: ['neutral'],
    }
};

// Helper to create a mock V2 Story Bible
function createV2Bible(overrides: Partial<StoryBibleV2> = {}): StoryBibleV2 {
    return {
        // Base StoryBible properties
        logline: 'A mysterious adventure',
        characters: 'Alice: protagonist. Bob: mentor.',
        setting: 'A distant planet in the year 3000',
        plotOutline: 'A journey of discovery',
        // V2 specific properties
        version: '2.0',
        characterProfiles: [
            {
                id: 'char1',
                name: 'Alice',
                role: 'protagonist',
                visualDescriptor: 'tall woman, short brown hair, determined expression',
                appearance: {
                    age: '30',
                    build: 'athletic',
                    distinguishingFeatures: ['scar on left cheek'],
                },
                personality: ['brave', 'determined'],
                backstory: 'A test backstory',
                motivations: ['save the world'],
                relationships: [],
            },
            {
                id: 'char2',
                name: 'Bob',
                role: 'supporting',
                visualDescriptor: 'elderly man, white beard, kind eyes',
                appearance: {
                    age: '70',
                    build: 'average',
                    distinguishingFeatures: [],
                },
                personality: ['wise', 'patient'],
                backstory: 'A mentor backstory',
                motivations: ['guide the hero'],
                relationships: [],
            },
        ],
        plotScenes: [],
        genre: 'Sci-Fi',
        themes: ['discovery', 'humanity'],
        ...overrides,
    };
}

// Helper to create a mock scene
function createScene(overrides: Partial<Scene> = {}): Scene {
    return {
        id: 'scene1',
        title: 'Opening Scene',
        summary: 'Alice discovers an ancient artifact in the ruins',
        timeline: { 
            shots: [], 
            shotEnhancers: defaultShotEnhancers,
            transitions: [],
            negativePrompt: '',
        },
        ...overrides,
    };
}

describe('Flag-Off Parity', () => {
    describe('assemblePromptForProvider', () => {
        it('returns prompt unchanged when no additional negatives', () => {
            const positive = 'A woman walking through ancient ruins';
            
            const result = assemblePromptForProvider(positive, [], { provider: 'comfyui' });
            
            expect(result.separateFormat.positive).toBe(positive);
            expect(result.separateFormat.negative).toBe('');
        });
        
        it('maintains original prompt structure in inline format', () => {
            const positive = 'scenic landscape';
            
            const result = assemblePromptForProvider(positive, [], { provider: 'gemini' });
            
            expect(result.inlineFormat).toContain('scenic landscape');
        });
        
        it('includes negatives in separate format', () => {
            const positive = 'test positive';
            const negatives = ['blur', 'watermark'];
            
            const result = assemblePromptForProvider(positive, negatives, { provider: 'comfyui' });
            
            expect(result.separateFormat.positive).toBe('test positive');
            expect(result.separateFormat.negative).toContain('blur');
            expect(result.separateFormat.negative).toContain('watermark');
        });
    });
    
    describe('buildSceneKeyframePrompt', () => {
        it('generates prompt from scene summary', () => {
            const bible = createV2Bible();
            const scene = createScene();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'cinematic');
            
            expect(result.separateFormat.positive).toBeTruthy();
            expect(result.separateFormat.positive).toContain('ruins');
        });
        
        it('includes character descriptors when mentioned in summary', () => {
            const bible = createV2Bible();
            const scene = createScene({ summary: 'Alice walks through ancient ruins' });
            
            const result = buildSceneKeyframePrompt(scene, bible, 'cinematic');
            
            // Should include character visual descriptor
            expect(result.separateFormat.positive.toLowerCase()).toContain('tall woman');
        });
        
        it('applies director vision style', () => {
            const bible = createV2Bible();
            const scene = createScene();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'noir cinematic style');
            
            expect(result.separateFormat.positive.toLowerCase()).toContain('noir');
        });
        
        it('returns both inline and separate formats', () => {
            const bible = createV2Bible();
            const scene = createScene();
            
            const result = buildSceneKeyframePrompt(scene, bible, 'dramatic');
            
            expect(result.inlineFormat).toBeTruthy();
            expect(result.separateFormat).toBeTruthy();
            expect(result.separateFormat.positive).toBeTruthy();
        });
    });
    
    describe('Negative Prompt Handling', () => {
        it('deduplicates negatives case-insensitively', () => {
            const positive = 'test';
            const negatives = ['BLUR', 'blur', 'Blur', 'watermark'];
            
            const result = assemblePromptForProvider(positive, negatives, { provider: 'comfyui' });
            
            // Should only have unique negatives (case-insensitive)
            const negativeList = result.separateFormat.negative.toLowerCase().split(',').map(s => s.trim());
            const uniqueNegatives = [...new Set(negativeList)];
            
            expect(negativeList.length).toBe(uniqueNegatives.length);
        });
        
        it('preserves first occurrence in deduplication', () => {
            const positive = 'test';
            const negatives = ['BLUR', 'blur'];  // First occurrence is uppercase
            
            const result = assemblePromptForProvider(positive, negatives, { provider: 'comfyui' });
            
            // Should preserve 'BLUR' from first occurrence
            expect(result.separateFormat.negative).toBe('BLUR');
        });
        
        it('handles empty negatives gracefully', () => {
            const positive = 'test';
            
            const result = assemblePromptForProvider(positive, [], { provider: 'comfyui' });
            
            expect(result.separateFormat.negative).toBe('');
        });
        
        it('includes negatives in inline format', () => {
            const positive = 'test prompt';
            const negatives = ['blur', 'watermark'];
            
            const result = assemblePromptForProvider(positive, negatives, { provider: 'gemini' });
            
            expect(result.inlineFormat).toContain('blur');
            expect(result.inlineFormat).toContain('watermark');
        });
    });
    
});
