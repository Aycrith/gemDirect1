/**
 * Type Guard Tests for Story Bible V2 Types
 * 
 * Tests for CharacterProfile, StoryBibleV2, PlotScene type guards and utilities.
 * 
 * @module utils/__tests__/typeGuards.test
 */

import { describe, it, expect } from 'vitest';
import {
    isStoryBibleV2,
    hasCompleteAppearance,
    type StoryBible,
    type StoryBibleV2,
    type CharacterProfile,
    type CharacterAppearance,
    type PlotScene,
    type CharacterRelationship,
} from '../../types';

describe('Story Bible Type Guards', () => {
    describe('isStoryBibleV2', () => {
        it('should return true for V2 Story Bible', () => {
            const bible: StoryBibleV2 = {
                version: '2.0',
                logline: 'A detective solves a mystery.',
                characters: 'Detective John',
                setting: 'A dark city.',
                plotOutline: 'Act I...',
                characterProfiles: [],
                plotScenes: [],
            };
            
            expect(isStoryBibleV2(bible)).toBe(true);
        });

        it('should return false for V1 Story Bible', () => {
            const bible: StoryBible = {
                logline: 'A detective solves a mystery.',
                characters: 'Detective John',
                setting: 'A dark city.',
                plotOutline: 'Act I...',
            };
            
            expect(isStoryBibleV2(bible)).toBe(false);
        });

        it('should return false for object with wrong version', () => {
            const bible = {
                version: '1.0',
                logline: 'Test',
                characters: 'Test',
                setting: 'Test',
                plotOutline: 'Test',
            } as StoryBible;
            
            expect(isStoryBibleV2(bible)).toBe(false);
        });
    });

    describe('hasCompleteAppearance', () => {
        const baseProfile: CharacterProfile = {
            id: 'char-1',
            name: 'John Doe',
            appearance: {},
            personality: ['brave'],
            backstory: 'A former soldier.',
            motivations: ['justice'],
            relationships: [],
            visualDescriptor: '',
            role: 'protagonist',
        };

        it('should return true for complete appearance', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    hair: 'short black hair',
                    eyes: 'brown eyes',
                    height: 'tall',
                    build: 'athletic',
                },
                visualDescriptor: 'Tall athletic man with short black hair and brown eyes',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(true);
        });

        it('should return true with height but no build', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    hair: 'long red hair',
                    eyes: 'green eyes',
                    height: '5\'8"',
                },
                visualDescriptor: 'Woman with long red hair and green eyes',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(true);
        });

        it('should return true with build but no height', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    hair: 'bald',
                    eyes: 'blue eyes',
                    build: 'muscular',
                },
                visualDescriptor: 'Muscular bald man with blue eyes',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(true);
        });

        it('should return false without hair', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    eyes: 'brown eyes',
                    height: 'tall',
                },
                visualDescriptor: 'Tall man with brown eyes',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(false);
        });

        it('should return false without eyes', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    hair: 'blonde hair',
                    height: 'tall',
                },
                visualDescriptor: 'Tall blonde woman',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(false);
        });

        it('should return false without height or build', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    hair: 'black hair',
                    eyes: 'dark eyes',
                },
                visualDescriptor: 'Person with black hair and dark eyes',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(false);
        });

        it('should return false without visualDescriptor', () => {
            const profile: CharacterProfile = {
                ...baseProfile,
                appearance: {
                    hair: 'short hair',
                    eyes: 'blue eyes',
                    height: 'average',
                },
                visualDescriptor: '',
            };
            
            expect(hasCompleteAppearance(profile)).toBe(false);
        });
    });
});

describe('CharacterProfile Structure', () => {
    it('should support all appearance fields', () => {
        const appearance: CharacterAppearance = {
            height: 'tall',
            build: 'athletic',
            hair: 'short brown hair',
            eyes: 'green eyes with gold flecks',
            age: '35',
            distinguishingFeatures: ['scar on left cheek', 'prosthetic right hand'],
            typicalAttire: 'worn leather jacket, dark jeans',
        };
        
        expect(appearance.height).toBe('tall');
        expect(appearance.distinguishingFeatures).toHaveLength(2);
    });

    it('should support relationship types', () => {
        const relationship: CharacterRelationship = {
            characterId: 'char-2',
            characterName: 'Jane Smith',
            relationshipType: 'mentor',
            description: 'Trained the protagonist in combat',
        };
        
        expect(relationship.relationshipType).toBe('mentor');
        expect(['ally', 'enemy', 'family', 'romantic', 'mentor', 'rival', 'neutral']).toContain(relationship.relationshipType);
    });

    it('should support all role types', () => {
        const roles: CharacterProfile['role'][] = ['protagonist', 'antagonist', 'supporting', 'background'];
        
        roles.forEach(role => {
            const profile: CharacterProfile = {
                id: `char-${role}`,
                name: `${role} Character`,
                appearance: {},
                personality: [],
                backstory: '',
                motivations: [],
                relationships: [],
                visualDescriptor: '',
                role,
            };
            expect(profile.role).toBe(role);
        });
    });
});

describe('PlotScene Structure', () => {
    it('should support all act numbers', () => {
        const actNumbers: PlotScene['actNumber'][] = [1, 2, 3];
        
        actNumbers.forEach(actNumber => {
            const scene: PlotScene = {
                actNumber,
                sceneNumber: 1,
                summary: 'Test scene',
                visualCues: [],
                characterArcs: [],
                pacing: 'medium',
            };
            expect(scene.actNumber).toBe(actNumber);
        });
    });

    it('should support all pacing types', () => {
        const pacingTypes: PlotScene['pacing'][] = ['slow', 'medium', 'fast'];
        
        pacingTypes.forEach(pacing => {
            const scene: PlotScene = {
                actNumber: 1,
                sceneNumber: 1,
                summary: 'Test scene',
                visualCues: [],
                characterArcs: [],
                pacing,
            };
            expect(scene.pacing).toBe(pacing);
        });
    });

    it('should support optional fields', () => {
        const scene: PlotScene = {
            actNumber: 2,
            sceneNumber: 3,
            summary: 'The confrontation in the warehouse',
            visualCues: ['dim lighting', 'industrial setting', 'rain on windows'],
            characterArcs: ['protagonist faces fear', 'antagonist reveals motive'],
            pacing: 'fast',
            location: 'Abandoned warehouse, industrial district',
            timeOfDay: 'night',
            emotionalTone: 'tense, claustrophobic',
        };
        
        expect(scene.location).toBe('Abandoned warehouse, industrial district');
        expect(scene.timeOfDay).toBe('night');
        expect(scene.emotionalTone).toBe('tense, claustrophobic');
    });
});

describe('StoryBibleV2 Structure', () => {
    it('should maintain backward compatibility with StoryBible', () => {
        const bibleV2: StoryBibleV2 = {
            version: '2.0',
            // Original StoryBible fields
            logline: 'A detective uncovers a conspiracy.',
            characters: 'John - detective\nMary - informant',
            setting: 'Neo-noir city in 2049.',
            plotOutline: 'Act I: Discovery...',
            heroArcs: [
                { id: 'arc-1', name: 'Redemption', summary: 'John seeks redemption', emotionalShift: 'guilt to peace', importance: 1 }
            ],
            // V2 fields
            characterProfiles: [],
            plotScenes: [],
            tokenMetadata: {
                loglineTokens: 10,
                charactersTokens: 20,
                settingTokens: 15,
                plotOutlineTokens: 30,
                totalTokens: 75,
                lastUpdated: Date.now(),
            },
            genre: 'sci-fi noir',
            themes: ['redemption', 'identity', 'technology'],
        };
        
        // Should be usable as StoryBible
        const asV1: StoryBible = bibleV2;
        expect(asV1.logline).toBe(bibleV2.logline);
        expect(asV1.heroArcs).toEqual(bibleV2.heroArcs);
        
        // Should have V2 fields
        expect(bibleV2.version).toBe('2.0');
        expect(bibleV2.genre).toBe('sci-fi noir');
        expect(bibleV2.themes).toContain('redemption');
    });

    it('should track token metadata', () => {
        const bibleV2: StoryBibleV2 = {
            version: '2.0',
            logline: 'Test logline',
            characters: 'Test characters',
            setting: 'Test setting',
            plotOutline: 'Test outline',
            characterProfiles: [],
            plotScenes: [],
            tokenMetadata: {
                loglineTokens: 50,
                charactersTokens: 200,
                settingTokens: 150,
                plotOutlineTokens: 300,
                totalTokens: 700,
                lastUpdated: Date.now(),
            },
        };
        
        expect(bibleV2.tokenMetadata?.totalTokens).toBe(700);
        expect(bibleV2.tokenMetadata?.loglineTokens).toBe(50);
    });
});
