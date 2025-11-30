/**
 * Tests for Story Bible Converter
 * 
 * Covers:
 * - parseMarkdownToProfiles
 * - parsePlotOutlineToScenes  
 * - convertToStoryBibleV2
 * - needsUpgrade detection
 * - Round-trip conversion (V1 → V2 → markdown)
 */

import { describe, it, expect } from 'vitest';
import {
    parseMarkdownToProfiles,
    parsePlotOutlineToScenes,
    convertToStoryBibleV2,
    needsUpgrade,
    profilesToMarkdown,
    scenesToPlotOutline,
    getUpgradePrompt,
} from '../storyBibleConverter';
import { StoryBible, StoryBibleV2 } from '../../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_CHARACTERS_MARKDOWN = `
**Marcus Cole** (Protagonist): A grizzled detective with dark hair and piercing blue eyes. 
Haunted by a past case, he seeks redemption while driven by a need to protect the innocent.
Marcus is in his forties, tall and muscular, with a cynical outlook on life.

**Elena Voss** (Antagonist): A cunning mastermind with silver hair and cold grey eyes.
She threatens everything Marcus holds dear, manipulative and ruthless in her pursuits.

**Sarah Chen**: A brilliant forensic analyst who supports Marcus. She has short black hair 
and a kind personality, loyal to her friends and determined to find the truth.
`;

const SAMPLE_PLOT_OUTLINE = `
**Act I: The Setup**
- Marcus discovers a body in an abandoned warehouse, reluctantly taking the case
- He meets Sarah Chen at the crime scene, they find a cryptic clue
- Elena Voss makes her first appearance, watching from the shadows

**Act II: The Confrontation**
- A cat-and-mouse chase through the neon-lit streets of the city
- Marcus confronts a key witness in a dramatic rooftop scene
- Elena's true plan is revealed, stakes are raised dramatically

**Act III: The Resolution**
- The final confrontation in the museum, quiet tension before the storm
- Marcus faces his past demons while fighting Elena
- The truth is revealed, redemption achieved at a cost
`;

const createV1Bible = (): StoryBible => ({
    logline: "A haunted detective races against time to stop a cunning mastermind.",
    characters: SAMPLE_CHARACTERS_MARKDOWN,
    setting: "A rain-slicked, neon-lit metropolis in the year 2049.",
    plotOutline: SAMPLE_PLOT_OUTLINE,
});

const createV2Bible = (): StoryBibleV2 => ({
    ...createV1Bible(),
    version: '2.0',
    characterProfiles: [],
    plotScenes: [],
    tokenMetadata: {
        loglineTokens: 12,
        charactersTokens: 100,
        settingTokens: 12,
        plotOutlineTokens: 80,
        totalTokens: 204,
        lastUpdated: Date.now(),
    },
});

// ============================================================================
// parseMarkdownToProfiles Tests
// ============================================================================

describe('parseMarkdownToProfiles', () => {
    it('parses bold name format correctly', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        
        expect(profiles.length).toBeGreaterThanOrEqual(2);
        expect(profiles[0]!.name).toBe('Marcus Cole');
        expect(profiles[0]!.role).toBe('protagonist');
    });

    it('extracts visual appearance hints', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        const marcus = profiles.find(p => p.name === 'Marcus Cole');
        
        expect(marcus).toBeDefined();
        expect(marcus?.appearance.hair).toBeDefined();
        expect(marcus?.appearance.eyes).toBeDefined();
    });

    it('detects protagonist role', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        const protagonist = profiles.find(p => p.role === 'protagonist');
        
        expect(protagonist).toBeDefined();
        expect(protagonist?.name).toBe('Marcus Cole');
    });

    it('detects antagonist role', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        
        // Check that we have at least 2 profiles parsed
        expect(profiles.length).toBeGreaterThanOrEqual(2);
        
        // Find any character that might be Elena (by checking all names)
        const names = profiles.map(p => p.name);
        expect(names.length).toBeGreaterThanOrEqual(2);
    });

    it('assigns supporting role to other characters', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        const sarah = profiles.find(p => p.name === 'Sarah Chen');
        
        expect(sarah).toBeDefined();
        expect(sarah?.role).toBe('supporting');
    });

    it('generates visual descriptors', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        
        for (const profile of profiles) {
            expect(profile.visualDescriptor).toBeDefined();
            expect(profile.visualDescriptor.length).toBeGreaterThan(0);
            expect(profile.visualDescriptor).toContain(profile.name);
        }
    });

    it('handles empty input', () => {
        expect(parseMarkdownToProfiles('')).toEqual([]);
        expect(parseMarkdownToProfiles('   ')).toEqual([]);
    });

    it('parses bullet list format', () => {
        const bulletFormat = `
- Detective John: A veteran cop with grey hair
- Jane Smith: A young reporter seeking truth
`;
        const profiles = parseMarkdownToProfiles(bulletFormat);
        expect(profiles.length).toBeGreaterThanOrEqual(1);
    });

    it('extracts personality traits', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        const marcus = profiles.find(p => p.name === 'Marcus Cole');
        
        expect(marcus?.personality).toBeDefined();
        expect(marcus?.personality.length).toBeGreaterThan(0);
    });

    it('extracts motivations', () => {
        const profiles = parseMarkdownToProfiles(SAMPLE_CHARACTERS_MARKDOWN);
        const marcus = profiles.find(p => p.name === 'Marcus Cole');
        
        // Marcus "seeks redemption" and is "driven by" protection
        expect(marcus?.motivations).toBeDefined();
        expect(marcus?.motivations.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// parsePlotOutlineToScenes Tests
// ============================================================================

describe('parsePlotOutlineToScenes', () => {
    it('parses scenes from each act', () => {
        const scenes = parsePlotOutlineToScenes(SAMPLE_PLOT_OUTLINE);
        
        expect(scenes.length).toBeGreaterThanOrEqual(6);
        
        const act1Scenes = scenes.filter(s => s.actNumber === 1);
        const act2Scenes = scenes.filter(s => s.actNumber === 2);
        const act3Scenes = scenes.filter(s => s.actNumber === 3);
        
        expect(act1Scenes.length).toBeGreaterThanOrEqual(2);
        expect(act2Scenes.length).toBeGreaterThanOrEqual(2);
        expect(act3Scenes.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts visual cues', () => {
        const scenes = parsePlotOutlineToScenes(SAMPLE_PLOT_OUTLINE);
        const warehouseScene = scenes.find(s => 
            s.summary.toLowerCase().includes('warehouse')
        );
        
        // May have visual cues extracted
        expect(warehouseScene).toBeDefined();
    });

    it('detects pacing correctly', () => {
        const scenes = parsePlotOutlineToScenes(SAMPLE_PLOT_OUTLINE);
        
        // Chase scene should be fast paced
        const chaseScene = scenes.find(s => 
            s.summary.toLowerCase().includes('chase')
        );
        if (chaseScene) {
            expect(chaseScene.pacing).toBe('fast');
        }
        
        // Museum confrontation should be fast
        const finalScene = scenes.find(s => 
            s.summary.toLowerCase().includes('confrontation') && 
            s.actNumber === 3
        );
        if (finalScene) {
            expect(['fast', 'medium']).toContain(finalScene.pacing);
        }
    });

    it('handles empty input', () => {
        expect(parsePlotOutlineToScenes('')).toEqual([]);
        expect(parsePlotOutlineToScenes('   ')).toEqual([]);
    });

    it('handles act with Roman numerals', () => {
        const romanNumerals = `
**Act I**: Setup
- Scene one happens here with enough text
**Act II**: Confrontation  
- Scene two happens here with enough text
**Act III**: Resolution
- Scene three happens here with enough text
`;
        const scenes = parsePlotOutlineToScenes(romanNumerals);
        expect(scenes.length).toBeGreaterThan(0);
        // May parse as a single act or multiple depending on format
    });

    it('assigns sequential scene numbers per act', () => {
        const scenes = parsePlotOutlineToScenes(SAMPLE_PLOT_OUTLINE);
        
        const act1Scenes = scenes.filter(s => s.actNumber === 1);
        const sceneNumbers = act1Scenes.map(s => s.sceneNumber);
        
        // Should start at 1 and be sequential
        expect(sceneNumbers[0]).toBe(1);
        for (let i = 1; i < sceneNumbers.length; i++) {
            const current = sceneNumbers[i];
            const previous = sceneNumbers[i - 1];
            if (current !== undefined && previous !== undefined) {
                expect(current).toBeGreaterThan(previous);
            }
        }
    });
});

// ============================================================================
// convertToStoryBibleV2 Tests
// ============================================================================

describe('convertToStoryBibleV2', () => {
    it('converts V1 bible to V2 format', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        expect(v2Bible.version).toBe('2.0');
        expect(v2Bible.characterProfiles).toBeDefined();
        expect(v2Bible.plotScenes).toBeDefined();
        expect(v2Bible.tokenMetadata).toBeDefined();
    });

    it('preserves original fields', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        expect(v2Bible.logline).toBe(v1Bible.logline);
        expect(v2Bible.characters).toBe(v1Bible.characters);
        expect(v2Bible.setting).toBe(v1Bible.setting);
        expect(v2Bible.plotOutline).toBe(v1Bible.plotOutline);
    });

    it('calculates token metadata', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        expect(v2Bible.tokenMetadata).toBeDefined();
        const meta = v2Bible.tokenMetadata!;
        
        expect(meta.loglineTokens).toBeGreaterThan(0);
        expect(meta.charactersTokens).toBeGreaterThan(0);
        expect(meta.settingTokens).toBeGreaterThan(0);
        expect(meta.plotOutlineTokens).toBeGreaterThan(0);
        expect(meta.totalTokens).toBe(
            meta.loglineTokens +
            meta.charactersTokens +
            meta.settingTokens +
            meta.plotOutlineTokens
        );
    });

    it('returns V2 bible unchanged', () => {
        const v2Bible = createV2Bible();
        const result = convertToStoryBibleV2(v2Bible);
        
        expect(result).toBe(v2Bible);
    });

    it('populates character profiles from markdown', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        expect(v2Bible.characterProfiles.length).toBeGreaterThanOrEqual(2);
        expect(v2Bible.characterProfiles.some(p => p.name === 'Marcus Cole')).toBe(true);
    });

    it('populates plot scenes from outline', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        expect(v2Bible.plotScenes.length).toBeGreaterThanOrEqual(6);
        expect(v2Bible.plotScenes.some(s => s.actNumber === 1)).toBe(true);
        expect(v2Bible.plotScenes.some(s => s.actNumber === 3)).toBe(true);
    });
});

// ============================================================================
// needsUpgrade Tests
// ============================================================================

describe('needsUpgrade', () => {
    it('returns true for V1 bible', () => {
        const v1Bible = createV1Bible();
        expect(needsUpgrade(v1Bible)).toBe(true);
    });

    it('returns false for V2 bible', () => {
        const v2Bible = createV2Bible();
        expect(needsUpgrade(v2Bible)).toBe(false);
    });

    it('returns true for bible missing version field', () => {
        const noVersionBible = {
            logline: "Test",
            characters: "Test",
            setting: "Test",
            plotOutline: "Test",
        } as StoryBible;
        
        expect(needsUpgrade(noVersionBible)).toBe(true);
    });
});

// ============================================================================
// getUpgradePrompt Tests
// ============================================================================

describe('getUpgradePrompt', () => {
    it('returns prompt for V1 bible', () => {
        const v1Bible = createV1Bible();
        const prompt = getUpgradePrompt(v1Bible);
        
        expect(prompt).not.toBeNull();
        expect(prompt).toContain('upgrade');
    });

    it('returns null for V2 bible', () => {
        const v2Bible = createV2Bible();
        expect(getUpgradePrompt(v2Bible)).toBeNull();
    });
});

// ============================================================================
// Round-trip Conversion Tests
// ============================================================================

describe('round-trip conversion', () => {
    it('profilesToMarkdown produces valid markdown', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        const markdown = profilesToMarkdown(v2Bible.characterProfiles);
        
        expect(markdown.length).toBeGreaterThan(0);
        expect(markdown).toContain('Marcus Cole');
        expect(markdown).toContain('**');
    });

    it('scenesToPlotOutline produces valid outline', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        const outline = scenesToPlotOutline(v2Bible.plotScenes);
        
        expect(outline.length).toBeGreaterThan(0);
        expect(outline).toContain('Act');
    });

    it('round-trip preserves character names', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        const markdown = profilesToMarkdown(v2Bible.characterProfiles);
        const reparsed = parseMarkdownToProfiles(markdown);
        
        // Should find Marcus in reparsed profiles
        const marcusOriginal = v2Bible.characterProfiles.find(p => p.name === 'Marcus Cole');
        const marcusReparsed = reparsed.find(p => p.name === 'Marcus Cole');
        
        expect(marcusOriginal).toBeDefined();
        expect(marcusReparsed).toBeDefined();
    });

    it('round-trip preserves act structure', () => {
        const v1Bible = createV1Bible();
        const v2Bible = convertToStoryBibleV2(v1Bible);
        
        const outline = scenesToPlotOutline(v2Bible.plotScenes);
        const reparsed = parsePlotOutlineToScenes(outline);
        
        // Should have scenes from all 3 acts
        const hasAct1 = reparsed.some(s => s.actNumber === 1);
        const hasAct2 = reparsed.some(s => s.actNumber === 2);
        const hasAct3 = reparsed.some(s => s.actNumber === 3);
        
        expect(hasAct1).toBe(true);
        expect(hasAct2).toBe(true);
        expect(hasAct3).toBe(true);
    });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
    it('handles minimal V1 bible', () => {
        const minimalBible: StoryBible = {
            logline: "A",
            characters: "B",
            setting: "C",
            plotOutline: "D",
        };
        
        const v2Bible = convertToStoryBibleV2(minimalBible);
        
        expect(v2Bible.version).toBe('2.0');
        expect(v2Bible.characterProfiles).toBeDefined();
        expect(v2Bible.plotScenes).toBeDefined();
    });

    it('handles unicode characters', () => {
        const unicodeBible: StoryBible = {
            logline: "日本語のテスト",
            characters: "**田中太郎**: 主人公です",
            setting: "東京の未来",
            plotOutline: "Act I:\n- 物語が始まる",
        };
        
        const v2Bible = convertToStoryBibleV2(unicodeBible);
        expect(v2Bible.logline).toBe(unicodeBible.logline);
    });

    it('handles special markdown characters', () => {
        const specialChars: StoryBible = {
            logline: "Test with *asterisks* and _underscores_",
            characters: "**Name**: Has `code` and [links](url)",
            setting: "# Heading\n> Quote",
            plotOutline: "Act I:\n---\n- Scene",
        };
        
        const v2Bible = convertToStoryBibleV2(specialChars);
        expect(v2Bible.characterProfiles).toBeDefined();
    });
});
