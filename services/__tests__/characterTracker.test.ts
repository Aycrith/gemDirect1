/**
 * Tests for characterTracker service
 * Validates character appearance tracking and continuity analysis
 */
import { describe, it, expect } from 'vitest';
import {
    trackCharacterAppearances,
    analyzeCharacterContinuity,
    analyzeCharacterTimeline,
    MAX_PROTAGONIST_GAP,
    MAX_SUPPORTING_GAP,
} from '../characterTracker';
import type { TimelineData, StoryBibleV2, CharacterProfile, Shot } from '../../types';

// ============================================================================
// Test Helpers
// ============================================================================

function createShot(id: string, description: string): Shot {
    return {
        id,
        description,
        title: `Shot ${id}`,
        purpose: 'Test shot'
    };
}

function createCharacter(
    id: string, 
    name: string, 
    role: 'protagonist' | 'antagonist' | 'supporting' | 'background' = 'supporting'
): CharacterProfile {
    return {
        id,
        name,
        role,
        appearance: {
            hair: 'brown hair',
            build: 'athletic',
            typicalAttire: 'leather jacket'
        },
        personality: ['brave', 'determined'],
        backstory: 'A test character',
        motivations: ['succeed'],
        relationships: [],
        visualDescriptor: `${name} with brown hair`
    };
}

function createTimeline(shots: Shot[]): TimelineData {
    return {
        shots,
        shotEnhancers: {},
        transitions: [],
        negativePrompt: ''
    };
}

function createStoryBible(characters: CharacterProfile[]): StoryBibleV2 {
    return {
        version: '2.0',
        logline: 'A test story',
        characters: 'Test characters', // Legacy field (string)
        setting: 'Test setting',
        plotOutline: 'Test plot',
        characterProfiles: characters,
        plotScenes: []
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('characterTracker', () => {
    describe('trackCharacterAppearances', () => {
        it('should track character mentions across timeline shots', () => {
            const chars = [createCharacter('char-1', 'Alice', 'protagonist')];
            const shots = [
                createShot('shot-1', 'Alice walks into the room'),
                createShot('shot-2', 'The door closes behind Alice'),
                createShot('shot-3', 'Empty hallway')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances.length).toBe(2);
            expect(result.appearances[0]!.characterName).toBe('Alice');
            expect(result.appearances[0]!.shotIndex).toBe(0);
            expect(result.appearances[1]!.shotIndex).toBe(1);
        });
        
        it('should identify explicit character references by name', () => {
            const chars = [createCharacter('char-1', 'Bob', 'protagonist')];
            const shots = [createShot('shot-1', 'Bob enters the scene dramatically')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances.length).toBe(1);
            expect(result.appearances[0]!.isExplicitlyMentioned).toBe(true);
        });
        
        it('should identify implicit references (pronouns)', () => {
            const chars = [createCharacter('char-1', 'Alice', 'protagonist')];
            const shots = [createShot('shot-1', 'She looks at the horizon')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            // Should find protagonist via pronoun inference
            expect(result.appearances.length).toBe(1);
            expect(result.appearances[0]!.isExplicitlyMentioned).toBe(false);
        });
        
        it('should link appearances to character profiles from StoryBible', () => {
            const chars = [
                createCharacter('hero-1', 'John', 'protagonist'),
                createCharacter('villain-1', 'Marcus', 'antagonist')
            ];
            const shots = [
                createShot('shot-1', 'John confronts Marcus in the warehouse')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances.length).toBe(2);
            expect(result.appearances.map(a => a.characterId).sort()).toEqual(['hero-1', 'villain-1']);
        });
        
        it('should handle shots with no character mentions', () => {
            const chars = [createCharacter('char-1', 'Alice', 'protagonist')];
            const shots = [
                createShot('shot-1', 'The sun sets over the mountains'),
                createShot('shot-2', 'Wind blows through the trees')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances.length).toBe(0);
            expect(result.totalShots).toBe(2);
        });
        
        it('should handle empty character list', () => {
            const shots = [createShot('shot-1', 'Action happens')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible([]);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances.length).toBe(0);
            expect(result.characterTimeline.size).toBe(0);
        });
    });

    describe('analyzeCharacterContinuity', () => {
        it('should warn when protagonist absent > 3 consecutive shots', () => {
            const chars = [createCharacter('hero', 'Alice', 'protagonist')];
            const shots = [
                createShot('shot-1', 'Alice starts her journey'),
                createShot('shot-2', 'Empty landscape'),
                createShot('shot-3', 'Trees sway'),
                createShot('shot-4', 'Clouds pass'),
                createShot('shot-5', 'Rain falls'),
                createShot('shot-6', 'Alice arrives at destination')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.warningType === 'gap')).toBe(true);
        });
        
        it('should warn when supporting character absent > 5 shots', () => {
            const chars = [
                createCharacter('hero', 'Alice', 'protagonist'),
                createCharacter('sidekick', 'Bob', 'supporting')
            ];
            const shots = [
                createShot('shot-1', 'Alice and Bob meet'),
                createShot('shot-2', 'Alice walks'),
                createShot('shot-3', 'Alice runs'),
                createShot('shot-4', 'Alice jumps'),
                createShot('shot-5', 'Alice climbs'),
                createShot('shot-6', 'Alice swims'),
                createShot('shot-7', 'Alice flies'),
                createShot('shot-8', 'Bob reappears')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            const bobWarnings = result.warnings.filter(w => w.characterId === 'sidekick');
            expect(bobWarnings.some(w => w.warningType === 'gap')).toBe(true);
        });
        
        it('should not warn for normal appearance gaps within limits', () => {
            const chars = [createCharacter('hero', 'Alice', 'protagonist')];
            const shots = [
                createShot('shot-1', 'Alice begins'),
                createShot('shot-2', 'Scene transition'),
                createShot('shot-3', 'Environment'),
                createShot('shot-4', 'Alice continues')  // 2-shot gap, under MAX_PROTAGONIST_GAP=3
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings.filter(w => w.warningType === 'gap').length).toBe(0);
        });
        
        it('should detect sudden character appearances without introduction', () => {
            const chars = [createCharacter('hero', 'Alice', 'protagonist')];
            const shots = [
                createShot('shot-1', 'Empty room'),
                createShot('shot-2', 'Still empty'),
                createShot('shot-3', 'Nothing here'),
                createShot('shot-4', 'Quiet'),
                createShot('shot-5', 'Alice suddenly appears')  // First appearance at shot 5
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings.some(w => w.warningType === 'sudden_appearance')).toBe(true);
        });
        
        it('should return empty warnings array for consistent timelines', () => {
            const chars = [createCharacter('hero', 'Alice', 'protagonist')];
            const shots = [
                createShot('shot-1', 'Alice enters'),
                createShot('shot-2', 'Alice looks around'),
                createShot('shot-3', 'Alice exits')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings.length).toBe(0);
        });
        
        it('should handle empty story bible', () => {
            const shots = [createShot('shot-1', 'Action')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible([]);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings.length).toBe(0);
            expect(result.stats.totalCharacters).toBe(0);
        });
    });

    describe('MAX_GAP constants', () => {
        it('should define MAX_PROTAGONIST_GAP = 3', () => {
            expect(MAX_PROTAGONIST_GAP).toBe(3);
        });
        
        it('should define MAX_SUPPORTING_GAP = 5', () => {
            expect(MAX_SUPPORTING_GAP).toBe(5);
        });
    });

    describe('ShotCharacterAppearance structure', () => {
        it('should include characterId from StoryBible', () => {
            const chars = [createCharacter('unique-id', 'Test', 'protagonist')];
            const shots = [createShot('shot-1', 'Test appears')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances[0]!.characterId).toBe('unique-id');
        });
        
        it('should include characterName', () => {
            const chars = [createCharacter('id', 'CharacterName', 'protagonist')];
            const shots = [createShot('shot-1', 'CharacterName speaks')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances[0]!.characterName).toBe('CharacterName');
        });
        
        it('should include shotId and shotIndex', () => {
            const chars = [createCharacter('id', 'Test', 'protagonist')];
            const shots = [
                createShot('first-shot', 'Nothing'),
                createShot('second-shot', 'Test appears')
            ];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances[0]!.shotId).toBe('second-shot');
            expect(result.appearances[0]!.shotIndex).toBe(1);
        });
        
        it('should include isExplicitlyMentioned flag', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            const shots = [createShot('shot-1', 'Alice runs')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(typeof result.appearances[0]!.isExplicitlyMentioned).toBe('boolean');
        });
        
        it('should optionally include visualDescriptor', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            chars[0]!.appearance.hair = 'red hair';
            const shots = [createShot('shot-1', 'Alice with red hair walks')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = trackCharacterAppearances(timeline, storyBible);
            
            expect(result.appearances[0]!.visualDescriptor).toContain('red hair');
        });
    });

    describe('CharacterContinuityWarning structure', () => {
        it('should include characterId', () => {
            const chars = [createCharacter('test-id', 'Alice', 'protagonist')];
            const shots = Array(10).fill(null).map((_, i) => 
                createShot(`shot-${i}`, i === 0 || i === 9 ? 'Alice appears' : 'Empty')
            );
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings[0]!.characterId).toBe('test-id');
        });
        
        it('should include warningType', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            const shots = Array(10).fill(null).map((_, i) => 
                createShot(`shot-${i}`, i === 0 || i === 9 ? 'Alice appears' : 'Empty')
            );
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(['gap', 'sudden_appearance', 'inconsistent_descriptor']).toContain(
                result.warnings[0]!.warningType
            );
        });
        
        it('should include human-readable details', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            const shots = Array(10).fill(null).map((_, i) => 
                createShot(`shot-${i}`, i === 0 || i === 9 ? 'Alice appears' : 'Empty')
            );
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(result.warnings[0]!.details).toContain('Alice');
            expect(typeof result.warnings[0]!.details).toBe('string');
        });
        
        it('should include affectedShotIds array', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            const shots = Array(10).fill(null).map((_, i) => 
                createShot(`shot-${i}`, i === 0 || i === 9 ? 'Alice appears' : 'Empty')
            );
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(Array.isArray(result.warnings[0]!.affectedShotIds)).toBe(true);
        });
        
        it('should include actionable suggestion', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            const shots = Array(10).fill(null).map((_, i) => 
                createShot(`shot-${i}`, i === 0 || i === 9 ? 'Alice appears' : 'Empty')
            );
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const tracking = trackCharacterAppearances(timeline, storyBible);
            const result = analyzeCharacterContinuity(tracking, storyBible);
            
            expect(typeof result.warnings[0]!.suggestion).toBe('string');
            expect(result.warnings[0]!.suggestion.length).toBeGreaterThan(0);
        });
    });

    describe('analyzeCharacterTimeline convenience function', () => {
        it('should return both tracking and continuity results', () => {
            const chars = [createCharacter('id', 'Alice', 'protagonist')];
            const shots = [createShot('shot-1', 'Alice appears')];
            const timeline = createTimeline(shots);
            const storyBible = createStoryBible(chars);
            
            const result = analyzeCharacterTimeline(timeline, storyBible);
            
            expect(result).toHaveProperty('tracking');
            expect(result).toHaveProperty('continuity');
            expect(result.tracking.appearances.length).toBe(1);
            expect(result.continuity.warnings.length).toBe(0);
        });
    });
});
