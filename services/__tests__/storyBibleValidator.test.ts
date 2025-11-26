/**
 * Story Bible Validator Tests
 * 
 * Tests for hard-gate validation, section validators, repetition detection,
 * and utility functions.
 * 
 * @module services/__tests__/storyBibleValidator.test
 */

import { describe, it, expect } from 'vitest';
import {
    validateLogline,
    validateSetting,
    validateCharacterProfiles,
    validateCharactersMarkdown,
    validatePlotScenes,
    validatePlotOutline,
    detectRepetition,
    validateStoryBibleHard,
    validateStoryBibleSoft,
    extractCharacterVisualDescriptors,
    formatValidationIssues,
    getIssuesBySection,
    buildRegenerationFeedback,
    ValidationCodes,
    WORD_RANGES,
    CHARACTER_LIMITS,
} from '../storyBibleValidator';
import type { 
    StoryBible, 
    StoryBibleV2, 
    CharacterProfile, 
    PlotScene 
} from '../../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const validLogline = 'A retired detective must return to solve one last case when a serial killer from his past resurfaces, threatening everyone he loves.';

const shortLogline = 'Detective solves case.';

const validSetting = `Neo-noir metropolis, 2049. Rain-soaked streets reflect neon advertisements flickering against 
perpetually overcast skies. The city sprawls upward in towering megastructures of steel and glass, while the lower 
levels descend into forgotten slums where sunlight never reaches. Constant surveillance drones patrol the upper 
districts, their searchlights cutting through smog. The air tastes of ozone and rust. Steam vents punctuate 
sidewalks, casting eerie shadows. Corporate logos dominate the skyline, their holographic displays competing 
for attention. The divide between the privileged heights and the desperate depths defines every aspect of life.`;

const shortSetting = 'A city with tall buildings.';

const validCharacterProfile: CharacterProfile = {
    id: 'char-1',
    name: 'Detective Marcus Cole',
    age: '52',
    appearance: {
        height: 'tall, 6\'2"',
        build: 'lean but weathered',
        hair: 'gray-streaked black hair, cropped short',
        eyes: 'sharp steel-gray eyes with deep crow\'s feet',
        distinguishingFeatures: ['scar across left cheek', 'calloused hands'],
        typicalAttire: 'worn trench coat, rumpled suit',
    },
    personality: ['methodical', 'haunted', 'determined', 'cynical'],
    backstory: 'Former decorated homicide detective forced into early retirement after a case went wrong. Lost his partner and his marriage to the job.',
    motivations: ['redemption', 'protecting the innocent', 'finally catching the one who got away'],
    relationships: [],
    visualDescriptor: 'Tall, weathered man in his 50s with gray-streaked black hair, steel-gray eyes, scar on left cheek, wearing a worn trench coat',
    role: 'protagonist',
};

const incompleteCharacterProfile: CharacterProfile = {
    id: 'char-2',
    name: 'Mystery Man',
    appearance: {},
    personality: [],
    backstory: '',
    motivations: [],
    relationships: [],
    visualDescriptor: '',
    role: 'supporting',
};

const validPlotScene: PlotScene = {
    actNumber: 1,
    sceneNumber: 1,
    summary: 'Marcus receives an anonymous letter containing photos from an unsolved case, drawing him back into the investigation.',
    visualCues: ['dim apartment', 'scattered photographs', 'rain on windows', 'cigarette smoke'],
    characterArcs: ['Marcus confronts his past'],
    pacing: 'slow',
    location: 'Marcus\'s rundown apartment',
    timeOfDay: 'night',
    emotionalTone: 'melancholic, tense',
};

const validStoryBible: StoryBible = {
    logline: validLogline,
    characters: `**Detective Marcus Cole**: A haunted former homicide detective in his 50s, forced into retirement after a case went wrong. 
**Sarah Chen**: Marcus's former partner, now a captain, who reluctantly brings him back.
**The Architect**: A mysterious serial killer who orchestrates elaborate crime scenes.`,
    setting: validSetting,
    plotOutline: `**Act I: The Return**
Scene 1: Marcus receives an anonymous letter with photos from an old case.
Scene 2: Sarah contacts Marcus, revealing similar killings have resumed.
Scene 3: Marcus visits the first crime scene, recognizing the Architect's signature.

**Act II: The Investigation**
Scene 4: Marcus and Sarah interview witnesses, uncovering connections.
Scene 5: A second victim is found, escalating the urgency.
Scene 6: Marcus discovers a pattern pointing to someone close.
Scene 7: The Architect contacts Marcus directly, making it personal.

**Act III: The Confrontation**
Scene 8: Marcus identifies the Architect's next target.
Scene 9: A trap is set, leading to a tense standoff.
Scene 10: The final confrontation reveals the Architect's connection to Marcus's past.`,
};

// ============================================================================
// Logline Validation Tests
// ============================================================================

describe('validateLogline', () => {
    it('should pass valid logline', () => {
        const issues = validateLogline(validLogline);
        const errors = issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('should fail empty logline', () => {
        const issues = validateLogline('');
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.EMPTY_SECTION,
            severity: 'error',
        }));
    });

    it('should fail logline that is too short', () => {
        const issues = validateLogline(shortLogline);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_TOO_SHORT,
            severity: 'error',
        }));
    });

    it('should warn about very long logline', () => {
        const longLogline = 'word '.repeat(120);
        const issues = validateLogline(longLogline);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_TOO_LONG,
            severity: 'warning',
        }));
    });

    it('should fail logline exceeding token budget', () => {
        const hugeLogline = 'A '.repeat(1500); // Way over budget
        const issues = validateLogline(hugeLogline);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_TOKEN_OVERFLOW,
            severity: 'error',
        }));
    });

    it('should warn when conflict indicators are missing', () => {
        const noConflict = 'A detective in a city does detective things and investigates cases.';
        const issues = validateLogline(noConflict);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_MISSING_CONFLICT,
            severity: 'warning',
        }));
    });

    it('should not warn when conflict indicators are present', () => {
        const issues = validateLogline(validLogline);
        expect(issues).not.toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_MISSING_CONFLICT,
        }));
    });
});

// ============================================================================
// Setting Validation Tests
// ============================================================================

describe('validateSetting', () => {
    it('should pass valid setting', () => {
        const issues = validateSetting(validSetting);
        const errors = issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('should fail empty setting', () => {
        const issues = validateSetting('');
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.EMPTY_SECTION,
            severity: 'error',
        }));
    });

    it('should fail setting that is too short', () => {
        const issues = validateSetting(shortSetting);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.SETTING_TOO_SHORT,
            severity: 'error',
        }));
    });

    it('should warn about very long setting', () => {
        const longSetting = 'word '.repeat(400);
        const issues = validateSetting(longSetting);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.SETTING_TOO_LONG,
            severity: 'warning',
        }));
    });

    it('should fail setting exceeding token budget', () => {
        const hugeSetting = 'A '.repeat(2000);
        const issues = validateSetting(hugeSetting);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.SETTING_TOKEN_OVERFLOW,
            severity: 'error',
        }));
    });
});

// ============================================================================
// Character Profile Validation Tests
// ============================================================================

describe('validateCharacterProfiles', () => {
    it('should pass valid profiles', () => {
        const profiles = [validCharacterProfile, { ...validCharacterProfile, id: 'char-2', name: 'Sarah Chen' }];
        const issues = validateCharacterProfiles(profiles);
        const errors = issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('should fail with too few profiles', () => {
        const issues = validateCharacterProfiles([validCharacterProfile]);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.CHARACTERS_TOO_FEW,
            severity: 'error',
        }));
    });

    it('should warn with too many profiles', () => {
        const profiles = Array.from({ length: 8 }, (_, i) => ({
            ...validCharacterProfile,
            id: `char-${i}`,
            name: `Character ${i}`,
        }));
        const issues = validateCharacterProfiles(profiles);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.CHARACTERS_TOO_MANY,
            severity: 'warning',
        }));
    });

    it('should warn about incomplete appearance', () => {
        const profiles = [incompleteCharacterProfile, validCharacterProfile];
        const issues = validateCharacterProfiles(profiles);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.CHARACTER_INCOMPLETE_APPEARANCE,
            section: 'characterProfiles.char-2',
        }));
    });

    it('should fail missing visual descriptor', () => {
        const profiles = [incompleteCharacterProfile, validCharacterProfile];
        const issues = validateCharacterProfiles(profiles);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.CHARACTER_MISSING_VISUAL_DESCRIPTOR,
            severity: 'error',
        }));
    });
});

// ============================================================================
// Plot Scene Validation Tests
// ============================================================================

describe('validatePlotScenes', () => {
    it('should pass valid scenes covering all acts', () => {
        const scenes: PlotScene[] = [
            { ...validPlotScene, actNumber: 1, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 1, sceneNumber: 2 },
            { ...validPlotScene, actNumber: 2, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 2, sceneNumber: 2 },
            { ...validPlotScene, actNumber: 3, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 3, sceneNumber: 2 },
        ];
        const issues = validatePlotScenes(scenes);
        const errors = issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('should fail with empty scenes', () => {
        const issues = validatePlotScenes([]);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.EMPTY_SECTION,
            severity: 'error',
        }));
    });

    it('should fail missing act', () => {
        const scenes: PlotScene[] = [
            { ...validPlotScene, actNumber: 1, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 1, sceneNumber: 2 },
            // Missing Act 2
            { ...validPlotScene, actNumber: 3, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 3, sceneNumber: 2 },
        ];
        const issues = validatePlotScenes(scenes);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.PLOT_MISSING_ACT,
            severity: 'error',
        }));
    });

    it('should warn about missing visual cues', () => {
        const scenes: PlotScene[] = [
            { ...validPlotScene, actNumber: 1, sceneNumber: 1, visualCues: [] },
            { ...validPlotScene, actNumber: 1, sceneNumber: 2 },
            { ...validPlotScene, actNumber: 2, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 2, sceneNumber: 2 },
            { ...validPlotScene, actNumber: 3, sceneNumber: 1 },
            { ...validPlotScene, actNumber: 3, sceneNumber: 2 },
        ];
        const issues = validatePlotScenes(scenes);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.PLOT_MISSING_VISUAL_CUES,
            severity: 'warning',
        }));
    });
});

// ============================================================================
// Repetition Detection Tests
// ============================================================================

describe('detectRepetition', () => {
    it('should pass with distinct sections', () => {
        const issues = detectRepetition(validStoryBible);
        const errors = issues.filter(i => i.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('should fail with verbatim logline in characters', () => {
        const bible: StoryBible = {
            ...validStoryBible,
            characters: validLogline + '\n\nSome character info.',
        };
        const issues = detectRepetition(bible);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_VERBATIM_REPEATED,
            section: 'characters',
        }));
    });

    it('should fail with verbatim logline in setting', () => {
        const bible: StoryBible = {
            ...validStoryBible,
            setting: validLogline + '\n\n' + validSetting,
        };
        const issues = detectRepetition(bible);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.LOGLINE_VERBATIM_REPEATED,
            section: 'setting',
        }));
    });

    it('should fail with high word overlap', () => {
        const bible: StoryBible = {
            logline: 'A detective must solve a mystery in the city before time runs out.',
            characters: 'A detective must solve a mystery. The detective works in the city. Time is running out for the detective.',
            setting: 'A dark city.',
            plotOutline: 'Act I: Detective arrives. Act II: Detective investigates. Act III: Detective solves.',
        };
        const issues = detectRepetition(bible);
        expect(issues).toContainEqual(expect.objectContaining({
            code: ValidationCodes.SECTION_REPETITION,
            severity: 'error',
        }));
    });
});

// ============================================================================
// Main Validation Function Tests
// ============================================================================

describe('validateStoryBibleHard', () => {
    it('should pass valid story bible', () => {
        const result = validateStoryBibleHard(validStoryBible);
        expect(result.valid).toBe(true);
        expect(result.errorCount).toBe(0);
    });

    it('should fail with invalid story bible', () => {
        const invalidBible: StoryBible = {
            logline: '',
            characters: '',
            setting: '',
            plotOutline: '',
        };
        const result = validateStoryBibleHard(invalidBible);
        expect(result.valid).toBe(false);
        expect(result.errorCount).toBeGreaterThan(0);
    });

    it('should calculate quality score', () => {
        const result = validateStoryBibleHard(validStoryBible);
        expect(result.qualityScore).toBeGreaterThan(0.5);
    });

    it('should include token validation', () => {
        const result = validateStoryBibleHard(validStoryBible);
        expect(result.tokenValidation).toBeDefined();
        expect(result.tokenValidation?.logline).toBeDefined();
        expect(result.tokenValidation?.setting).toBeDefined();
    });

    it('should include timestamp', () => {
        const result = validateStoryBibleHard(validStoryBible);
        expect(result.timestamp).toBeDefined();
        expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });
});

describe('validateStoryBibleSoft', () => {
    it('should always return valid=true', () => {
        const invalidBible: StoryBible = {
            logline: '',
            characters: '',
            setting: '',
            plotOutline: '',
        };
        const result = validateStoryBibleSoft(invalidBible);
        expect(result.valid).toBe(true);
        expect(result.errorCount).toBe(0);
    });

    it('should convert errors to warnings', () => {
        const invalidBible: StoryBible = {
            logline: '',
            characters: '',
            setting: '',
            plotOutline: '',
        };
        const result = validateStoryBibleSoft(invalidBible);
        expect(result.warningCount).toBeGreaterThan(0);
        expect(result.issues.every(i => i.severity !== 'error')).toBe(true);
    });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('extractCharacterVisualDescriptors', () => {
    it('should extract visual descriptors', () => {
        const profiles = [validCharacterProfile];
        const descriptors = extractCharacterVisualDescriptors(profiles);
        expect(descriptors['char-1']).toBe(validCharacterProfile.visualDescriptor);
    });

    it('should build fallback from appearance', () => {
        const profile: CharacterProfile = {
            id: 'char-fallback',
            name: 'Test Character',
            appearance: {
                hair: 'blonde hair',
                eyes: 'blue eyes',
                build: 'athletic',
            },
            personality: [],
            backstory: '',
            motivations: [],
            relationships: [],
            visualDescriptor: '',
            role: 'supporting',
        };
        const descriptors = extractCharacterVisualDescriptors([profile]);
        expect(descriptors['char-fallback']).toContain('blonde hair');
        expect(descriptors['char-fallback']).toContain('blue eyes');
    });

    it('should handle empty profiles', () => {
        const descriptors = extractCharacterVisualDescriptors([]);
        expect(Object.keys(descriptors)).toHaveLength(0);
    });
});

describe('formatValidationIssues', () => {
    it('should format passed validation', () => {
        const result = validateStoryBibleHard(validStoryBible);
        const formatted = formatValidationIssues(result);
        expect(formatted).toContain('PASSED');
        expect(formatted).toContain('Quality Score');
    });

    it('should format failed validation', () => {
        const invalidBible: StoryBible = {
            logline: '',
            characters: '',
            setting: '',
            plotOutline: '',
        };
        const result = validateStoryBibleHard(invalidBible);
        const formatted = formatValidationIssues(result);
        expect(formatted).toContain('FAILED');
        expect(formatted).toContain('✗');
    });
});

describe('getIssuesBySection', () => {
    it('should group issues by section', () => {
        const invalidBible: StoryBible = {
            logline: '',
            characters: '',
            setting: '',
            plotOutline: '',
        };
        const result = validateStoryBibleHard(invalidBible);
        const bySection = getIssuesBySection(result);
        
        expect(bySection['logline']).toBeDefined();
        expect(bySection['setting']).toBeDefined();
    });
});

describe('buildRegenerationFeedback', () => {
    it('should build feedback for section with issues', () => {
        const invalidBible: StoryBible = {
            logline: '',
            characters: 'Some characters',
            setting: 'Some setting with enough words to pass the minimum threshold for validation purposes.',
            plotOutline: 'Act I: Setup. Act II: Conflict. Act III: Resolution.',
        };
        const result = validateStoryBibleHard(invalidBible);
        const feedback = buildRegenerationFeedback(result, 'logline');
        
        expect(feedback).toContain('logline');
        expect(feedback).toContain('issues');
        expect(feedback).toContain('regenerate');
    });

    it('should return empty for section without issues', () => {
        const result = validateStoryBibleHard(validStoryBible);
        const feedback = buildRegenerationFeedback(result, 'logline');
        expect(feedback).toBe('');
    });
});
