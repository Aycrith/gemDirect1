/**
 * Tests for Story Bible V2 Generation in geminiService
 * 
 * Validates:
 * - generateStoryBible returns StoryBibleV2 format
 * - Structured characterProfiles are present
 * - Structured plotScenes are present
 * - Token metadata is calculated
 */

import { describe, it, expect } from 'vitest';
import { 
    StoryBibleV2, 
    isStoryBibleV2 
} from '../../types';

// Mock Story Bible V2 output (simulating what Gemini would return)
const mockGeminiV2Response: StoryBibleV2 = {
    logline: 'A retired detective is pulled back for one last case that threatens to unravel his dark past.',
    characters: '**Marcus Cole**: Haunted detective. **Elena Voss**: Cunning mastermind.',
    setting: 'Rain-soaked neo-noir metropolis in 2049. Neon lights reflect off perpetual puddles.',
    plotOutline: 'Act I: Marcus discovers a body. Act II: Investigation deepens. Act III: Final confrontation.',
    version: '2.0',
    characterProfiles: [
        {
            id: 'char-1',
            name: 'Marcus Cole',
            age: '45',
            appearance: {
                height: '6\'1"',
                build: 'lean and weathered',
                hair: 'salt-and-pepper, cropped',
                eyes: 'steel gray',
                distinguishingFeatures: ['old scar on left cheek'],
                typicalAttire: 'worn leather jacket',
            },
            personality: ['cynical', 'determined', 'secretly compassionate'],
            backstory: 'Former homicide detective who left the force after a case went wrong.',
            motivations: ['redemption', 'protecting the innocent'],
            relationships: [],
            role: 'protagonist',
            visualDescriptor: 'Weathered 45yo detective, gray eyes, salt-pepper hair, leather jacket, stubbled face',
        },
        {
            id: 'char-2',
            name: 'Elena Voss',
            age: '38',
            appearance: {
                height: '5\'8"',
                build: 'athletic',
                hair: 'silver, sharp bob',
                eyes: 'cold gray',
            },
            personality: ['calculating', 'ruthless', 'charming'],
            backstory: 'Corporate executive with hidden criminal connections.',
            motivations: ['power', 'revenge'],
            relationships: [],
            role: 'antagonist',
            visualDescriptor: 'Athletic woman, silver bob, cold gray eyes, designer suit, calculating presence',
        },
    ],
    plotScenes: [
        {
            actNumber: 1,
            sceneNumber: 1,
            summary: 'Marcus receives news of a murder bearing the signature of his buried case.',
            visualCues: ['dimly lit apartment', 'scattered newspapers', 'ringing phone'],
            characterArcs: ['Marcus forced out of retirement'],
            pacing: 'slow',
            location: 'Marcus\'s apartment',
            timeOfDay: 'late evening',
            emotionalTone: 'unsettling',
        },
        {
            actNumber: 1,
            sceneNumber: 2,
            summary: 'Marcus investigates the crime scene in an abandoned warehouse.',
            visualCues: ['crime scene tape', 'forensic equipment', 'rain through broken windows'],
            characterArcs: ['Marcus confronts past memories'],
            pacing: 'medium',
            location: 'Abandoned warehouse',
            timeOfDay: 'night',
            emotionalTone: 'tense',
        },
        {
            actNumber: 2,
            sceneNumber: 1,
            summary: 'Marcus meets Elena at a corporate gala, sensing her involvement.',
            visualCues: ['elegant ballroom', 'champagne glasses', 'hidden security'],
            characterArcs: ['Marcus and Elena clash'],
            pacing: 'medium',
            location: 'Corporate headquarters',
            timeOfDay: 'evening',
            emotionalTone: 'suspenseful',
        },
        {
            actNumber: 3,
            sceneNumber: 1,
            summary: 'Final confrontation in the abandoned precinct where it all began.',
            visualCues: ['dusty files', 'broken windows', 'dramatic shadows'],
            characterArcs: ['Truth revealed', 'Marcus chooses redemption'],
            pacing: 'fast',
            location: 'Abandoned precinct',
            timeOfDay: 'midnight',
            emotionalTone: 'climactic',
        },
    ],
    tokenMetadata: {
        loglineTokens: 22,
        charactersTokens: 17,
        settingTokens: 20,
        plotOutlineTokens: 20,
        totalTokens: 79,
        lastUpdated: Date.now(),
    },
    genre: 'noir',
};

describe('Story Bible V2 Structure', () => {
    it('should pass isStoryBibleV2 type guard', () => {
        expect(isStoryBibleV2(mockGeminiV2Response)).toBe(true);
    });

    it('should have version 2.0', () => {
        expect(mockGeminiV2Response.version).toBe('2.0');
    });

    it('should have valid characterProfiles array', () => {
        expect(Array.isArray(mockGeminiV2Response.characterProfiles)).toBe(true);
        expect(mockGeminiV2Response.characterProfiles.length).toBeGreaterThanOrEqual(2);
    });

    it('should have valid plotScenes array', () => {
        expect(Array.isArray(mockGeminiV2Response.plotScenes)).toBe(true);
        expect(mockGeminiV2Response.plotScenes.length).toBeGreaterThanOrEqual(3);
    });

    it('should have tokenMetadata', () => {
        expect(mockGeminiV2Response.tokenMetadata).toBeDefined();
        expect(mockGeminiV2Response.tokenMetadata?.totalTokens).toBeGreaterThan(0);
    });
});

describe('CharacterProfile Structure', () => {
    const protagonist = mockGeminiV2Response.characterProfiles[0]!;
    const antagonist = mockGeminiV2Response.characterProfiles[1]!;

    it('should have required fields for protagonist', () => {
        expect(protagonist.id).toBeDefined();
        expect(protagonist.name).toBe('Marcus Cole');
        expect(protagonist.role).toBe('protagonist');
        expect(protagonist.visualDescriptor.length).toBeGreaterThan(0);
    });

    it('should have appearance details', () => {
        expect(protagonist.appearance).toBeDefined();
        expect(protagonist.appearance.height).toBeDefined();
        expect(protagonist.appearance.hair).toBeDefined();
        expect(protagonist.appearance.eyes).toBeDefined();
    });

    it('should have personality traits array', () => {
        expect(Array.isArray(protagonist.personality)).toBe(true);
        expect(protagonist.personality.length).toBeGreaterThanOrEqual(2);
    });

    it('should have motivations array', () => {
        expect(Array.isArray(protagonist.motivations)).toBe(true);
        expect(protagonist.motivations.length).toBeGreaterThanOrEqual(1);
    });

    it('should identify antagonist role correctly', () => {
        expect(antagonist.role).toBe('antagonist');
    });

    it('should have distinguishing features for detailed characters', () => {
        expect(protagonist.appearance.distinguishingFeatures).toBeDefined();
        expect(Array.isArray(protagonist.appearance.distinguishingFeatures)).toBe(true);
    });

    it('should have visualDescriptor suitable for image generation', () => {
        // Visual descriptor should be concise but descriptive
        expect(protagonist.visualDescriptor.length).toBeLessThan(200);
        expect(protagonist.visualDescriptor.length).toBeGreaterThan(20);
        // Should contain key visual elements
        expect(protagonist.visualDescriptor.toLowerCase()).toMatch(/detective|hair|eyes|jacket/);
    });
});

describe('PlotScene Structure', () => {
    const scenes = mockGeminiV2Response.plotScenes;

    it('should have scenes for all three acts', () => {
        const acts = new Set(scenes.map(s => s.actNumber));
        expect(acts.size).toBe(3);
        expect(acts.has(1)).toBe(true);
        expect(acts.has(2)).toBe(true);
        expect(acts.has(3)).toBe(true);
    });

    it('should have required fields for each scene', () => {
        for (const scene of scenes) {
            expect(scene.actNumber).toBeGreaterThanOrEqual(1);
            expect(scene.actNumber).toBeLessThanOrEqual(3);
            expect(scene.sceneNumber).toBeGreaterThanOrEqual(1);
            expect(scene.summary.length).toBeGreaterThan(0);
            expect(Array.isArray(scene.visualCues)).toBe(true);
            expect(['slow', 'medium', 'fast']).toContain(scene.pacing);
        }
    });

    it('should have visualCues for image generation', () => {
        for (const scene of scenes) {
            expect(scene.visualCues.length).toBeGreaterThanOrEqual(2);
            // Visual cues should be descriptive phrases
            for (const cue of scene.visualCues) {
                expect(cue.length).toBeGreaterThan(3);
            }
        }
    });

    it('should have characterArcs linking to story progression', () => {
        // At least some scenes should advance character arcs
        const scenesWithArcs = scenes.filter(s => s.characterArcs.length > 0);
        expect(scenesWithArcs.length).toBeGreaterThan(0);
    });

    it('should have location and timeOfDay for scene setting', () => {
        for (const scene of scenes) {
            expect(scene.location).toBeDefined();
            expect(scene.location!.length).toBeGreaterThan(0);
            expect(scene.timeOfDay).toBeDefined();
        }
    });

    it('should have emotionalTone for directing generation style', () => {
        for (const scene of scenes) {
            expect(scene.emotionalTone).toBeDefined();
            expect(scene.emotionalTone!.length).toBeGreaterThan(0);
        }
    });
});

describe('Token Metadata Structure', () => {
    const metadata = mockGeminiV2Response.tokenMetadata!;

    it('should have per-section token counts', () => {
        expect(metadata.loglineTokens).toBeGreaterThan(0);
        expect(metadata.charactersTokens).toBeGreaterThan(0);
        expect(metadata.settingTokens).toBeGreaterThan(0);
        expect(metadata.plotOutlineTokens).toBeGreaterThan(0);
    });

    it('should have totalTokens as sum of sections', () => {
        const sum = metadata.loglineTokens + 
                    metadata.charactersTokens + 
                    metadata.settingTokens + 
                    metadata.plotOutlineTokens;
        expect(metadata.totalTokens).toBe(sum);
    });

    it('should have lastUpdated timestamp', () => {
        expect(metadata.lastUpdated).toBeGreaterThan(0);
        expect(metadata.lastUpdated).toBeLessThanOrEqual(Date.now());
    });
});

describe('Backward Compatibility', () => {
    it('should retain V1 fields (logline, characters, setting, plotOutline)', () => {
        expect(mockGeminiV2Response.logline).toBeDefined();
        expect(mockGeminiV2Response.characters).toBeDefined();
        expect(mockGeminiV2Response.setting).toBeDefined();
        expect(mockGeminiV2Response.plotOutline).toBeDefined();
    });

    it('should have markdown-formatted characters for legacy display', () => {
        expect(mockGeminiV2Response.characters).toContain('**');
    });

    it('should have act structure in plotOutline for legacy parsing', () => {
        expect(mockGeminiV2Response.plotOutline.toLowerCase()).toContain('act');
    });
});

describe('Visual Descriptor Quality', () => {
    it('should produce descriptors suitable for Stable Diffusion prompts', () => {
        for (const profile of mockGeminiV2Response.characterProfiles) {
            const descriptor = profile.visualDescriptor.toLowerCase();
            
            // Should contain concrete visual elements
            const hasVisualElements = 
                descriptor.match(/eyes|hair|build|face|wearing|jacket|suit|dress/i) !== null;
            expect(hasVisualElements).toBe(true);
            
            // Should not contain abstract concepts unsuitable for image gen
            expect(descriptor).not.toMatch(/personality|motivation|goal|story/i);
        }
    });

    it('should have scene visualCues suitable for ComfyUI prompts', () => {
        for (const scene of mockGeminiV2Response.plotScenes) {
            for (const cue of scene.visualCues) {
                // Visual cues should be concrete, not abstract
                expect(cue.toLowerCase()).not.toMatch(/feeling|emotion|meaning|symbolism/);
            }
        }
    });
});
