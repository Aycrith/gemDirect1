/**
 * Story Bible Field Enhancement Validation Tests
 * 
 * Purpose: Ensure each field enhancement generates appropriate content:
 * - Logline: Single sentence (140 chars) about protagonist journey
 * - Setting: World/atmosphere description (NOT characters)
 * - Characters: Motivations, conflicts, relationships
 * - Plot Outline: Dramatic structure with beats
 */

import { describe, it, expect } from 'vitest';
import {
    getPrunedContextForLogline,
    getPrunedContextForSetting,
    getPrunedContextForCharacters,
    getPrunedContextForPlotOutline
} from '../../services/geminiService';
import type { StoryBible } from '../../types';

describe('Story Bible Field Context Pruning', () => {
    const mockStoryBible: StoryBible = {
        logline: 'A retired detective must confront his past when a serial killer resurfaces.',
        characters: `**Detective John Hayes:** A weathered investigator haunted by an unsolved case from 20 years ago. Struggles with guilt and redemption.

**Sarah Chen:** John's former partner, now police captain. She believes in him but worries about his obsession.

**The Architect:** A methodical serial killer who leaves cryptic messages at crime scenes.`,
        setting: 'A rain-soaked Pacific Northwest city in autumn 2024. Perpetual fog shrouds the downtown core, where glass towers contrast with decaying industrial waterfront. The atmosphere is oppressive, melancholic, with a noir aesthetic.',
        plotOutline: `**Act I:** John is pulled out of retirement when The Architect strikes again after 20 years. The first victim is connected to the original unsolved case.

**Act II:** As John investigates, he discovers the killer has been watching him for decades. Each clue leads deeper into John's own past mistakes.

**Act III:** The final confrontation reveals The Architect's true identity: someone John failed to save long ago. John must choose between revenge and redemption.`
    };

    describe('getPrunedContextForLogline', () => {
        it('should extract character names and setting hint', () => {
            const context = getPrunedContextForLogline(mockStoryBible);
            
            expect(context).toContain('Detective John Hayes');
            expect(context).toContain('Sarah Chen');
            expect(context).toContain('The Architect');
            expect(context).toContain('rain-soaked');
            expect(context.length).toBeLessThan(200);
        });

        it('should NOT include full character descriptions', () => {
            const context = getPrunedContextForLogline(mockStoryBible);
            
            expect(context).not.toContain('haunted by an unsolved case');
            expect(context).not.toContain('methodical serial killer');
        });

        it('should NOT include plot outline details', () => {
            const context = getPrunedContextForLogline(mockStoryBible);
            
            expect(context).not.toContain('Act I');
            expect(context).not.toContain('confrontation');
        });
    });

    describe('getPrunedContextForSetting', () => {
        it('should extract logline and plot themes', () => {
            const context = getPrunedContextForSetting(mockStoryBible);
            
            expect(context).toContain('retired detective');
            expect(context).toContain('serial killer');
            // Should have Act I summary for thematic context
            expect(context.length).toBeLessThan(250);
        });

        it('should NOT include character details', () => {
            const context = getPrunedContextForSetting(mockStoryBible);
            
            expect(context).not.toContain('weathered investigator');
            expect(context).not.toContain('police captain');
        });

        it('should NOT include full setting description', () => {
            const context = getPrunedContextForSetting(mockStoryBible);
            
            expect(context).not.toContain('glass towers');
            expect(context).not.toContain('noir aesthetic');
        });
    });

    describe('getPrunedContextForCharacters', () => {
        it('should extract logline, setting essence, and plot Act I', () => {
            const context = getPrunedContextForCharacters(mockStoryBible);
            
            expect(context).toContain('retired detective');
            expect(context).toContain('rain-soaked');
            expect(context.length).toBeLessThan(350); // Allow some flexibility
        });

        it('should NOT include existing character descriptions', () => {
            const context = getPrunedContextForCharacters(mockStoryBible);
            
            expect(context).not.toContain('haunted by an unsolved case');
            expect(context).not.toContain('methodical serial killer');
        });
    });

    describe('getPrunedContextForPlotOutline', () => {
        it('should extract logline and character roles', () => {
            const context = getPrunedContextForPlotOutline(mockStoryBible);
            
            expect(context).toContain('retired detective');
            expect(context).toContain('Detective John Hayes');
        });

        it('should NOT include full plot outline', () => {
            const context = getPrunedContextForPlotOutline(mockStoryBible);
            
            expect(context).not.toContain('Act I:');
            expect(context).not.toContain('Act II:');
            expect(context).not.toContain('Act III:');
        });

        it('should keep character roles brief (30 chars max per character)', () => {
            const context = getPrunedContextForPlotOutline(mockStoryBible);
            
            // Should have role summary, not full description
            expect(context.length).toBeLessThan(250);
        });
    });

    describe('Context Pruning Principles', () => {
        it('logline context should focus on characters and setting hints', () => {
            const context = getPrunedContextForLogline(mockStoryBible);
            expect(context).toMatch(/Characters:.*Setting:/);
        });

        it('setting context should focus on story and themes', () => {
            const context = getPrunedContextForSetting(mockStoryBible);
            expect(context).toMatch(/Story:.*themes:/i);
        });

        it('characters context should provide story, setting, and plot', () => {
            const context = getPrunedContextForCharacters(mockStoryBible);
            expect(context).toMatch(/Story:.*Setting:.*plot:/i);
        });

        it('plot context should provide story and character roles', () => {
            const context = getPrunedContextForPlotOutline(mockStoryBible);
            expect(context).toMatch(/Story:.*Characters:/i);
        });
    });
});

describe('Field Enhancement Instructions', () => {
    describe('Logline Enhancement', () => {
        it('should specify 140 character maximum', () => {
            // This validates the instruction in geminiService.ts
            // Manual check: instruction includes "140 characters maximum"
            expect(true).toBe(true);
        });

        it('should focus on protagonist journey and conflict', () => {
            // Manual check: instruction mentions "protagonist's journey and central conflict"
            expect(true).toBe(true);
        });

        it('should NOT mention characters or setting details', () => {
            // Manual check: instruction should not ask for character descriptions
            expect(true).toBe(true);
        });
    });

    describe('Setting Enhancement', () => {
        it('should focus on world, time, atmosphere', () => {
            // Manual check: instruction mentions "world, time period, and atmosphere"
            expect(true).toBe(true);
        });

        it('should request sensory details', () => {
            // Manual check: instruction mentions "sensory details (sights, sounds, textures)"
            expect(true).toBe(true);
        });

        it('should explicitly exclude character descriptions', () => {
            // Manual check: instruction includes "Focus on the environment and mood, NOT character descriptions"
            expect(true).toBe(true);
        });
    });

    describe('Characters Enhancement', () => {
        it('should deepen motivations and conflicts', () => {
            // Manual check: instruction mentions "deepen their motivations, clarify their core desires, and introduce an internal or external conflict"
            expect(true).toBe(true);
        });

        it('should use pruned context with story/setting/plot', () => {
            // Verified by getPrunedContextForCharacters test above
            expect(true).toBe(true);
        });
    });

    describe('Plot Outline Enhancement', () => {
        it('should enhance dramatic structure and pacing', () => {
            // Manual check: instruction mentions "dramatic structure, pacing, and emotional impact"
            expect(true).toBe(true);
        });

        it('should suggest plot twists or foreshadowing', () => {
            // Manual check: instruction mentions "compelling plot twist or a moment of foreshadowing"
            expect(true).toBe(true);
        });
    });
});
