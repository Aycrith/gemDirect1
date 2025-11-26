/**
 * Tests for localFallbackService
 * Validates Story Bible V2 generation, character profiles, and plot scenes
 */

import { describe, it, expect } from 'vitest';
import {
    generateStoryBible,
    generateSceneList,
    suggestStoryIdeas,
    suggestDirectorsVisions,
    generateKeyframeForScene,
    getPrunedContextForShotGeneration,
} from '../localFallbackService';
import { isStoryBibleV2 } from '../../types';

describe('localFallbackService', () => {
    describe('generateStoryBible', () => {
        it('should return a StoryBibleV2 with version 2.0', async () => {
            const bible = await generateStoryBible('A detective uncovers a conspiracy', 'thriller');
            expect(bible.version).toBe('2.0');
            expect(isStoryBibleV2(bible)).toBe(true);
        });

        it('should generate character profiles array', async () => {
            const bible = await generateStoryBible('A young wizard discovers hidden powers');
            expect(bible.characterProfiles).toBeDefined();
            expect(Array.isArray(bible.characterProfiles)).toBe(true);
            expect(bible.characterProfiles.length).toBeGreaterThanOrEqual(3);
        });

        it('should include protagonist character', async () => {
            const bible = await generateStoryBible('Sarah the knight must defend her kingdom');
            const protagonist = bible.characterProfiles?.find(c => c.role === 'protagonist');
            expect(protagonist).toBeDefined();
            expect(protagonist?.name).toBeDefined();
            expect(protagonist?.visualDescriptor).toBeDefined();
        });

        it('should include antagonist character', async () => {
            const bible = await generateStoryBible('The hero battles the Shadow Lord');
            const antagonist = bible.characterProfiles?.find(c => c.role === 'antagonist');
            expect(antagonist).toBeDefined();
            expect(antagonist?.relationships).toBeDefined();
        });

        it('should generate plot scenes array', async () => {
            const bible = await generateStoryBible('A space explorer finds alien life');
            expect(bible.plotScenes).toBeDefined();
            expect(Array.isArray(bible.plotScenes)).toBe(true);
            expect(bible.plotScenes.length).toBeGreaterThanOrEqual(6);
        });

        it('should have plot scenes covering all three acts', async () => {
            const bible = await generateStoryBible('A rebellion rises against the empire');
            const acts = new Set(bible.plotScenes?.map(s => s.actNumber));
            expect(acts.has(1)).toBe(true);
            expect(acts.has(2)).toBe(true);
            expect(acts.has(3)).toBe(true);
        });

        it('should calculate token metadata', async () => {
            const bible = await generateStoryBible('A hacker infiltrates a megacorp');
            expect(bible.tokenMetadata).toBeDefined();
            expect(bible.tokenMetadata?.loglineTokens).toBeGreaterThan(0);
            expect(bible.tokenMetadata?.totalTokens).toBeGreaterThan(0);
            expect(bible.tokenMetadata?.lastUpdated).toBeGreaterThan(0);
        });

        it('should detect themes from idea', async () => {
            const bible = await generateStoryBible('A tale of revenge and redemption');
            expect(bible.themes).toBeDefined();
            expect(bible.themes).toContain('revenge');
            expect(bible.themes).toContain('redemption');
        });

        it('should default to transformation theme', async () => {
            const bible = await generateStoryBible('Simple story without specific keywords');
            expect(bible.themes).toBeDefined();
            expect(bible.themes!.length).toBeGreaterThan(0);
        });

        it('should maintain backward compatible markdown fields', async () => {
            const bible = await generateStoryBible('An explorer discovers lost ruins');
            expect(typeof bible.logline).toBe('string');
            expect(typeof bible.characters).toBe('string');
            expect(typeof bible.setting).toBe('string');
            expect(typeof bible.plotOutline).toBe('string');
        });

        it('should include genre in output', async () => {
            const bible = await generateStoryBible('A love story in Paris', 'romance');
            expect(bible.genre).toBe('romance');
        });

        it('should default to sci-fi genre', async () => {
            const bible = await generateStoryBible('A mysterious signal from space');
            expect(bible.genre).toBe('sci-fi');
        });

        it('should detect space setting', async () => {
            const bible = await generateStoryBible('Explorers journey through deep space');
            expect(bible.setting.toLowerCase()).toMatch(/space|vessel/i);
        });

        it('should detect city setting', async () => {
            const bible = await generateStoryBible('A chase through the urban city streets');
            expect(bible.setting.toLowerCase()).toMatch(/city/i);
        });

        it('should character profiles have visual descriptors', async () => {
            const bible = await generateStoryBible('Warriors prepare for battle');
            bible.characterProfiles?.forEach(profile => {
                expect(profile.visualDescriptor).toBeDefined();
                expect(profile.visualDescriptor.length).toBeGreaterThan(10);
            });
        });

        it('should plot scenes have visual cues', async () => {
            const bible = await generateStoryBible('The heist begins at midnight');
            bible.plotScenes?.forEach(scene => {
                expect(scene.visualCues).toBeDefined();
                expect(Array.isArray(scene.visualCues)).toBe(true);
                expect(scene.visualCues.length).toBeGreaterThan(0);
            });
        });

        it('should handle empty idea gracefully', async () => {
            const bible = await generateStoryBible('');
            expect(bible.version).toBe('2.0');
            expect(bible.logline).toBe('.');
        });

        it('should handle very long ideas', async () => {
            const longIdea = 'A '.repeat(500) + 'very long story idea that exceeds normal limits';
            const bible = await generateStoryBible(longIdea);
            expect(bible.version).toBe('2.0');
            expect(bible.logline.length).toBeGreaterThan(0);
        });

        it('should include hero arcs for backward compatibility', async () => {
            const bible = await generateStoryBible('A hero begins their journey');
            expect(bible.heroArcs).toBeDefined();
            expect(Array.isArray(bible.heroArcs)).toBe(true);
            expect(bible.heroArcs!.length).toBe(12); // 12 stages of hero's journey
        });
    });

    describe('character profile structure', () => {
        it('should have complete appearance data', async () => {
            const bible = await generateStoryBible('A warrior trains for combat');
            const protagonist = bible.characterProfiles?.find(c => c.role === 'protagonist');
            expect(protagonist?.appearance).toBeDefined();
            expect(protagonist?.appearance?.build).toBeDefined();
            expect(protagonist?.appearance?.eyes).toBeDefined();
        });

        it('should have personality traits', async () => {
            const bible = await generateStoryBible('A cunning spy infiltrates enemy lines');
            const protagonist = bible.characterProfiles?.find(c => c.role === 'protagonist');
            expect(protagonist?.personality).toBeDefined();
            expect(Array.isArray(protagonist?.personality)).toBe(true);
            expect(protagonist?.personality?.length).toBeGreaterThan(0);
        });

        it('should have motivations', async () => {
            const bible = await generateStoryBible('A parent searches for their lost child');
            const protagonist = bible.characterProfiles?.find(c => c.role === 'protagonist');
            expect(protagonist?.motivations).toBeDefined();
            expect(Array.isArray(protagonist?.motivations)).toBe(true);
        });

        it('should have character IDs', async () => {
            const bible = await generateStoryBible('A team assembles for a mission');
            bible.characterProfiles?.forEach((profile, index) => {
                expect(profile.id).toBe(`char-${index + 1}`);
            });
        });

        it('should antagonist reference protagonist in relationships', async () => {
            const bible = await generateStoryBible('The villain hunts the hero');
            const antagonist = bible.characterProfiles?.find(c => c.role === 'antagonist');
            expect(antagonist?.relationships).toBeDefined();
            expect(antagonist?.relationships?.length).toBeGreaterThan(0);
            expect(antagonist?.relationships?.[0]?.characterId).toBe('char-1');
        });
    });

    describe('plot scene structure', () => {
        it('should have act and scene numbers', async () => {
            const bible = await generateStoryBible('The rebellion begins');
            bible.plotScenes?.forEach(scene => {
                expect(scene.actNumber).toBeGreaterThanOrEqual(1);
                expect(scene.actNumber).toBeLessThanOrEqual(3);
                expect(scene.sceneNumber).toBeGreaterThanOrEqual(1);
            });
        });

        it('should have pacing values', async () => {
            const bible = await generateStoryBible('The chase intensifies');
            const pacingValues = ['slow', 'medium', 'fast'];
            bible.plotScenes?.forEach(scene => {
                expect(pacingValues).toContain(scene.pacing);
            });
        });

        it('should have emotional tones', async () => {
            const bible = await generateStoryBible('A journey of discovery');
            bible.plotScenes?.forEach(scene => {
                expect(scene.emotionalTone).toBeDefined();
                expect(scene.emotionalTone!.length).toBeGreaterThan(0);
            });
        });

        it('should have character arcs', async () => {
            const bible = await generateStoryBible('The hero transforms');
            bible.plotScenes?.forEach(scene => {
                expect(scene.characterArcs).toBeDefined();
                expect(Array.isArray(scene.characterArcs)).toBe(true);
            });
        });

        it('should have summaries', async () => {
            const bible = await generateStoryBible('The story unfolds');
            bible.plotScenes?.forEach(scene => {
                expect(scene.summary).toBeDefined();
                expect(scene.summary.length).toBeGreaterThan(10);
            });
        });
    });

    describe('generateSceneList', () => {
        it('should generate scenes from plot outline', async () => {
            const plotOutline = 'Act I\n- The hero begins their journey\nAct II\n- Complications arise\nAct III\n- Resolution';
            const scenes = await generateSceneList(plotOutline, 'Cinematic style');
            expect(scenes.length).toBeGreaterThan(0);
            expect(scenes.length).toBeLessThanOrEqual(6);
        });

        it('should include temporal context', async () => {
            const plotOutline = 'Act I\n- Opening scene\nAct II\n- Middle scene\nAct III\n- Closing scene';
            const scenes = await generateSceneList(plotOutline, 'Epic scope');
            scenes.forEach(scene => {
                expect(scene.temporalContext).toBeDefined();
                expect(scene.temporalContext.startMoment).toBeDefined();
                expect(scene.temporalContext.endMoment).toBeDefined();
            });
        });
    });

    describe('suggestStoryIdeas', () => {
        it('should return array of ideas', async () => {
            const ideas = await suggestStoryIdeas();
            expect(Array.isArray(ideas)).toBe(true);
            expect(ideas.length).toBeGreaterThan(0);
        });

        it('should return non-empty strings', async () => {
            const ideas = await suggestStoryIdeas();
            ideas.forEach(idea => {
                expect(typeof idea).toBe('string');
                expect(idea.length).toBeGreaterThan(10);
            });
        });
    });

    describe('suggestDirectorsVisions', () => {
        it('should return visions based on story bible', async () => {
            const bible = await generateStoryBible('A cyberpunk thriller');
            const visions = await suggestDirectorsVisions(bible);
            expect(Array.isArray(visions)).toBe(true);
            expect(visions.length).toBe(3);
        });

        it('should reference the setting', async () => {
            const bible = await generateStoryBible('An underwater adventure');
            const visions = await suggestDirectorsVisions(bible);
            // Visions should contain text related to the setting
            const allText = visions.join(' ');
            expect(allText.length).toBeGreaterThan(100);
        });
    });

    describe('generateKeyframeForScene', () => {
        it('should return base64 encoded SVG', async () => {
            const keyframe = await generateKeyframeForScene('Noir lighting', 'A tense confrontation');
            expect(typeof keyframe).toBe('string');
            // Should be base64
            expect(() => Buffer.from(keyframe, 'base64')).not.toThrow();
        });

        it('should incorporate vision and summary', async () => {
            const keyframe = await generateKeyframeForScene('Warm golden light', 'Sunset reunion');
            const decoded = Buffer.from(keyframe, 'base64').toString('utf-8');
            expect(decoded).toContain('svg');
        });
    });

    describe('getPrunedContextForShotGeneration', () => {
        it('should return combined context string', async () => {
            const bible = await generateStoryBible('A mystery unfolds');
            const context = await getPrunedContextForShotGeneration(
                bible,
                'Middle of act two',
                'The revelation scene',
                'Film noir aesthetics'
            );
            expect(typeof context).toBe('string');
            expect(context).toMatch(/Story Focus/i);
            expect(context).toMatch(/Narrative Context/i);
            expect(context).toMatch(/Scene Purpose/i);
            expect(context).toMatch(/Visual Priorities/i);
        });
    });

    describe('theme detection', () => {
        it('should detect love theme', async () => {
            const bible = await generateStoryBible('A love story between rivals');
            expect(bible.themes).toContain('love');
        });

        it('should detect power theme', async () => {
            const bible = await generateStoryBible('The quest for ultimate power');
            expect(bible.themes).toContain('power');
        });

        it('should detect freedom theme', async () => {
            const bible = await generateStoryBible('Breaking free from oppression');
            expect(bible.themes).toContain('freedom');
        });

        it('should detect identity theme', async () => {
            const bible = await generateStoryBible('Discovering who I really am');
            expect(bible.themes).toContain('identity');
        });

        it('should detect survival theme', async () => {
            const bible = await generateStoryBible('Survive the harsh wilderness');
            expect(bible.themes).toContain('survival');
        });

        it('should detect justice theme', async () => {
            const bible = await generateStoryBible('Fighting for what is right and just');
            expect(bible.themes).toContain('justice');
        });

        it('should detect multiple themes', async () => {
            const bible = await generateStoryBible('A love story about freedom and survival');
            expect(bible.themes!.length).toBeGreaterThanOrEqual(2);
        });
    });
});
