/**
 * Story Bible Validator - Hard-gate validation for Story Bible content
 * 
 * Enforces:
 * - Token budgets per section (hard fail if exceeded)
 * - Content quality thresholds
 * - Word count ranges for sections
 * - Character profile completeness
 * - Repetition detection between sections
 * 
 * Supports auto-retry with feedback for failed validations.
 * 
 * @module services/storyBibleValidator
 */

import {
    StoryBible,
    StoryBibleV2,
    CharacterProfile,
    PlotScene,
    isStoryBibleV2,
    hasCompleteAppearance,
} from '../types';

import {
    estimateTokens,
    validateTokenBudget,
    validateTokenBudgets,
    countWords,
    isWithinWordRange,
    DEFAULT_TOKEN_BUDGETS,
    type TokenBudgetValidation,
    type PromptSection,
} from './promptRegistry';

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Individual validation issue
 */
export interface ValidationIssue {
    /** Unique code for the issue type */
    code: string;
    /** Human-readable message */
    message: string;
    /** Affected section or field */
    section: string;
    /** Severity level */
    severity: ValidationSeverity;
    /** Suggestion for fixing the issue */
    suggestion?: string;
    /** Current value causing the issue */
    currentValue?: string | number;
    /** Expected value or range */
    expectedValue?: string | number;
}

/**
 * Complete validation result for a Story Bible
 */
export interface StoryBibleValidationResult {
    /** Whether validation passed (no errors) */
    valid: boolean;
    /** List of all issues found */
    issues: ValidationIssue[];
    /** Count of errors (hard failures) */
    errorCount: number;
    /** Count of warnings (soft issues) */
    warningCount: number;
    /** Token validation details per section */
    tokenValidation?: Record<string, TokenBudgetValidation>;
    /** Overall quality score (0-1) */
    qualityScore?: number;
    /** Timestamp of validation */
    timestamp: number;
}

// ============================================================================
// Validation Issue Codes
// ============================================================================

export const ValidationCodes = {
    // Token budget issues
    LOGLINE_TOKEN_OVERFLOW: 'LOGLINE_TOKEN_OVERFLOW',
    CHARACTERS_TOKEN_OVERFLOW: 'CHARACTERS_TOKEN_OVERFLOW',
    SETTING_TOKEN_OVERFLOW: 'SETTING_TOKEN_OVERFLOW',
    PLOT_TOKEN_OVERFLOW: 'PLOT_TOKEN_OVERFLOW',
    
    // Word count issues
    LOGLINE_TOO_SHORT: 'LOGLINE_TOO_SHORT',
    LOGLINE_TOO_LONG: 'LOGLINE_TOO_LONG',
    SETTING_TOO_SHORT: 'SETTING_TOO_SHORT',
    SETTING_TOO_LONG: 'SETTING_TOO_LONG',
    CHARACTERS_TOO_FEW: 'CHARACTERS_TOO_FEW',
    CHARACTERS_TOO_MANY: 'CHARACTERS_TOO_MANY',
    PLOT_SCENES_TOO_FEW: 'PLOT_SCENES_TOO_FEW',
    PLOT_SCENES_TOO_MANY: 'PLOT_SCENES_TOO_MANY',
    
    // Content quality issues
    LOGLINE_MISSING_CONFLICT: 'LOGLINE_MISSING_CONFLICT',
    CHARACTER_INCOMPLETE_APPEARANCE: 'CHARACTER_INCOMPLETE_APPEARANCE',
    CHARACTER_MISSING_VISUAL_DESCRIPTOR: 'CHARACTER_MISSING_VISUAL_DESCRIPTOR',
    CHARACTER_PROFILE_TOO_LONG: 'CHARACTER_PROFILE_TOO_LONG',
    PLOT_MISSING_ACT: 'PLOT_MISSING_ACT',
    PLOT_MISSING_VISUAL_CUES: 'PLOT_MISSING_VISUAL_CUES',
    
    // Repetition issues
    SECTION_REPETITION: 'SECTION_REPETITION',
    LOGLINE_VERBATIM_REPEATED: 'LOGLINE_VERBATIM_REPEATED',
    
    // Structure issues
    EMPTY_SECTION: 'EMPTY_SECTION',
    INVALID_ACT_STRUCTURE: 'INVALID_ACT_STRUCTURE',
} as const;

// ============================================================================
// Word Count Ranges
// ============================================================================

/**
 * Expected word count ranges for each section
 */
export const WORD_RANGES = {
    logline: { min: 10, max: 100 },      // 50-100 words recommended
    setting: { min: 50, max: 300 },      // 200-300 words recommended
    characterProfile: { min: 20, max: 100 }, // ~80 words per profile
    plotScene: { min: 10, max: 60 },     // ~50 words per scene
} as const;

/**
 * Character count ranges
 */
export const CHARACTER_LIMITS = {
    minProfiles: 2,
    maxProfiles: 6,
    minScenesPerAct: 2,
    maxScenesPerAct: 12,
} as const;

// ============================================================================
// Section Validators
// ============================================================================

/**
 * Validates the logline section.
 * 
 * Requirements:
 * - 50-100 words (min 10 for error, max 100)
 * - Under 500 tokens
 * - Contains conflict indicator
 */
export function validateLogline(logline: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    // Check for empty
    if (!logline || logline.trim().length === 0) {
        issues.push({
            code: ValidationCodes.EMPTY_SECTION,
            message: 'Logline is empty',
            section: 'logline',
            severity: 'error',
            suggestion: 'Provide a concise summary of the story conflict',
        });
        return issues;
    }

    // Word count check
    const wordCount = countWords(logline);
    if (wordCount < WORD_RANGES.logline.min) {
        issues.push({
            code: ValidationCodes.LOGLINE_TOO_SHORT,
            message: `Logline is too short (${wordCount} words)`,
            section: 'logline',
            severity: 'error',
            currentValue: wordCount,
            expectedValue: `${WORD_RANGES.logline.min}-${WORD_RANGES.logline.max} words`,
            suggestion: 'Expand to include protagonist, goal, and conflict',
        });
    } else if (wordCount > WORD_RANGES.logline.max) {
        issues.push({
            code: ValidationCodes.LOGLINE_TOO_LONG,
            message: `Logline is too long (${wordCount} words)`,
            section: 'logline',
            severity: 'warning',
            currentValue: wordCount,
            expectedValue: `${WORD_RANGES.logline.min}-${WORD_RANGES.logline.max} words`,
            suggestion: 'Condense to essential conflict and stakes',
        });
    }

    // Token budget check
    const tokenResult = validateTokenBudget('logline', logline);
    if (!tokenResult.valid) {
        issues.push({
            code: ValidationCodes.LOGLINE_TOKEN_OVERFLOW,
            message: `Logline exceeds token budget (${tokenResult.tokens}/${tokenResult.budget})`,
            section: 'logline',
            severity: 'error',
            currentValue: tokenResult.tokens,
            expectedValue: tokenResult.budget,
            suggestion: 'Reduce length to fit within token budget',
        });
    }

    // Conflict indicator check (soft)
    const conflictIndicators = [
        'must', 'but', 'when', 'until', 'before', 'after', 'against',
        'despite', 'however', 'threatens', 'discovers', 'confronts',
        'struggles', 'fights', 'risks', 'faces', 'challenges',
    ];
    const hasConflict = conflictIndicators.some(word => 
        logline.toLowerCase().includes(word)
    );
    if (!hasConflict) {
        issues.push({
            code: ValidationCodes.LOGLINE_MISSING_CONFLICT,
            message: 'Logline may lack clear conflict indicator',
            section: 'logline',
            severity: 'warning',
            suggestion: 'Include words that establish tension (e.g., "must", "but", "against")',
        });
    }

    return issues;
}

/**
 * Validates the setting section.
 * 
 * Requirements:
 * - 200-300 words (min 50 for error, max 300)
 * - Under 600 tokens
 * - Contains visual/atmospheric details
 */
export function validateSetting(setting: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    if (!setting || setting.trim().length === 0) {
        issues.push({
            code: ValidationCodes.EMPTY_SECTION,
            message: 'Setting is empty',
            section: 'setting',
            severity: 'error',
            suggestion: 'Describe the world, time period, and atmosphere',
        });
        return issues;
    }

    // Word count check
    const wordCount = countWords(setting);
    if (wordCount < WORD_RANGES.setting.min) {
        issues.push({
            code: ValidationCodes.SETTING_TOO_SHORT,
            message: `Setting is too brief (${wordCount} words)`,
            section: 'setting',
            severity: 'error',
            currentValue: wordCount,
            expectedValue: `${WORD_RANGES.setting.min}-${WORD_RANGES.setting.max} words`,
            suggestion: 'Expand with visual details, atmosphere, and sensory elements',
        });
    } else if (wordCount > WORD_RANGES.setting.max) {
        issues.push({
            code: ValidationCodes.SETTING_TOO_LONG,
            message: `Setting is too long (${wordCount} words)`,
            section: 'setting',
            severity: 'warning',
            currentValue: wordCount,
            expectedValue: `${WORD_RANGES.setting.min}-${WORD_RANGES.setting.max} words`,
            suggestion: 'Focus on key visual and atmospheric elements',
        });
    }

    // Token budget check
    const tokenResult = validateTokenBudget('setting', setting);
    if (!tokenResult.valid) {
        issues.push({
            code: ValidationCodes.SETTING_TOKEN_OVERFLOW,
            message: `Setting exceeds token budget (${tokenResult.tokens}/${tokenResult.budget})`,
            section: 'setting',
            severity: 'error',
            currentValue: tokenResult.tokens,
            expectedValue: tokenResult.budget,
            suggestion: 'Reduce length to fit within token budget',
        });
    }

    return issues;
}

/**
 * Validates character profiles for V2 Story Bible.
 * 
 * Requirements:
 * - 3-5 characters (min 2, max 6)
 * - Each profile under 400 tokens
 * - Each profile has complete appearance data
 * - Each profile has visual descriptor
 */
export function validateCharacterProfiles(profiles: CharacterProfile[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Character count check
    if (profiles.length < CHARACTER_LIMITS.minProfiles) {
        issues.push({
            code: ValidationCodes.CHARACTERS_TOO_FEW,
            message: `Too few character profiles (${profiles.length})`,
            section: 'characterProfiles',
            severity: 'error',
            currentValue: profiles.length,
            expectedValue: `${CHARACTER_LIMITS.minProfiles}-${CHARACTER_LIMITS.maxProfiles}`,
            suggestion: 'Add more primary characters to the story',
        });
    } else if (profiles.length > CHARACTER_LIMITS.maxProfiles) {
        issues.push({
            code: ValidationCodes.CHARACTERS_TOO_MANY,
            message: `Too many character profiles (${profiles.length})`,
            section: 'characterProfiles',
            severity: 'warning',
            currentValue: profiles.length,
            expectedValue: `${CHARACTER_LIMITS.minProfiles}-${CHARACTER_LIMITS.maxProfiles}`,
            suggestion: 'Focus on 3-5 primary characters',
        });
    }

    // Validate each profile
    for (const profile of profiles) {
        const profileText = JSON.stringify(profile);
        const tokenResult = validateTokenBudget('characterProfile', profileText);
        
        if (!tokenResult.valid) {
            issues.push({
                code: ValidationCodes.CHARACTER_PROFILE_TOO_LONG,
                message: `Character "${profile.name}" profile exceeds token budget`,
                section: `characterProfiles.${profile.id}`,
                severity: 'error',
                currentValue: tokenResult.tokens,
                expectedValue: tokenResult.budget,
                suggestion: 'Condense backstory and personality descriptions',
            });
        }

        // Check appearance completeness
        if (!hasCompleteAppearance(profile)) {
            issues.push({
                code: ValidationCodes.CHARACTER_INCOMPLETE_APPEARANCE,
                message: `Character "${profile.name}" has incomplete appearance data`,
                section: `characterProfiles.${profile.id}`,
                severity: 'warning',
                suggestion: 'Add hair, eyes, and height/build to appearance',
            });
        }

        // Check visual descriptor
        if (!profile.visualDescriptor || profile.visualDescriptor.trim().length < 10) {
            issues.push({
                code: ValidationCodes.CHARACTER_MISSING_VISUAL_DESCRIPTOR,
                message: `Character "${profile.name}" missing or short visual descriptor`,
                section: `characterProfiles.${profile.id}`,
                severity: 'error',
                suggestion: 'Add a compact visual description for prompt injection',
            });
        }
    }

    return issues;
}

/**
 * Validates the legacy characters markdown string.
 * Used for V1 Story Bible validation.
 */
export function validateCharactersMarkdown(characters: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!characters || characters.trim().length === 0) {
        issues.push({
            code: ValidationCodes.EMPTY_SECTION,
            message: 'Characters section is empty',
            section: 'characters',
            severity: 'error',
            suggestion: 'Add character descriptions with names, roles, and motivations',
        });
        return issues;
    }

    // Token budget check
    const tokenResult = validateTokenBudget('characterProfile', characters);
    // Use higher limit for full characters section (multiple profiles)
    const effectiveBudget = DEFAULT_TOKEN_BUDGETS.characterProfile * 5;
    const tokens = estimateTokens(characters);
    
    if (tokens > effectiveBudget) {
        issues.push({
            code: ValidationCodes.CHARACTERS_TOKEN_OVERFLOW,
            message: `Characters section exceeds token budget (${tokens}/${effectiveBudget})`,
            section: 'characters',
            severity: 'error',
            currentValue: tokens,
            expectedValue: effectiveBudget,
            suggestion: 'Reduce character descriptions or focus on fewer characters',
        });
    }

    // Check for minimum character markers
    const characterMarkers = characters.match(/\*\*[^*]+\*\*|^#+\s+\w+|^-\s+\w+:/gm) || [];
    if (characterMarkers.length < 2) {
        issues.push({
            code: ValidationCodes.CHARACTERS_TOO_FEW,
            message: 'Characters section may have too few character entries',
            section: 'characters',
            severity: 'warning',
            suggestion: 'Include at least 2-3 main characters with clear formatting',
        });
    }

    return issues;
}

/**
 * Validates plot scenes for V2 Story Bible.
 * 
 * Requirements:
 * - 8-12 scenes per act
 * - All three acts represented
 * - Each scene has visual cues
 */
export function validatePlotScenes(scenes: PlotScene[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (scenes.length === 0) {
        issues.push({
            code: ValidationCodes.EMPTY_SECTION,
            message: 'No plot scenes defined',
            section: 'plotScenes',
            severity: 'error',
            suggestion: 'Add structured scenes for each act',
        });
        return issues;
    }

    // Count scenes per act
    const scenesPerAct = { 1: 0, 2: 0, 3: 0 };
    for (const scene of scenes) {
        if (scene.actNumber >= 1 && scene.actNumber <= 3) {
            scenesPerAct[scene.actNumber]++;
        }
    }

    // Check all acts are represented
    for (const act of [1, 2, 3] as const) {
        if (scenesPerAct[act] === 0) {
            issues.push({
                code: ValidationCodes.PLOT_MISSING_ACT,
                message: `No scenes defined for Act ${act}`,
                section: 'plotScenes',
                severity: 'error',
                suggestion: `Add scenes for Act ${act}`,
            });
        } else if (scenesPerAct[act] < CHARACTER_LIMITS.minScenesPerAct) {
            issues.push({
                code: ValidationCodes.PLOT_SCENES_TOO_FEW,
                message: `Too few scenes in Act ${act} (${scenesPerAct[act]})`,
                section: `plotScenes.act${act}`,
                severity: 'warning',
                currentValue: scenesPerAct[act],
                expectedValue: `${CHARACTER_LIMITS.minScenesPerAct}-${CHARACTER_LIMITS.maxScenesPerAct}`,
                suggestion: `Add more scenes to Act ${act}`,
            });
        } else if (scenesPerAct[act] > CHARACTER_LIMITS.maxScenesPerAct) {
            issues.push({
                code: ValidationCodes.PLOT_SCENES_TOO_MANY,
                message: `Too many scenes in Act ${act} (${scenesPerAct[act]})`,
                section: `plotScenes.act${act}`,
                severity: 'warning',
                currentValue: scenesPerAct[act],
                expectedValue: `${CHARACTER_LIMITS.minScenesPerAct}-${CHARACTER_LIMITS.maxScenesPerAct}`,
                suggestion: `Consider consolidating scenes in Act ${act}`,
            });
        }
    }

    // Check individual scenes
    for (const scene of scenes) {
        if (!scene.visualCues || scene.visualCues.length === 0) {
            issues.push({
                code: ValidationCodes.PLOT_MISSING_VISUAL_CUES,
                message: `Scene ${scene.actNumber}.${scene.sceneNumber} missing visual cues`,
                section: `plotScenes.${scene.actNumber}.${scene.sceneNumber}`,
                severity: 'warning',
                suggestion: 'Add visual cues for image/video generation',
            });
        }

        // Scene summary token check
        const tokenResult = validateTokenBudget('plotScene', scene.summary);
        if (!tokenResult.valid) {
            issues.push({
                code: ValidationCodes.PLOT_TOKEN_OVERFLOW,
                message: `Scene ${scene.actNumber}.${scene.sceneNumber} summary exceeds token budget`,
                section: `plotScenes.${scene.actNumber}.${scene.sceneNumber}`,
                severity: 'error',
                currentValue: tokenResult.tokens,
                expectedValue: tokenResult.budget,
                suggestion: 'Condense the scene summary',
            });
        }
    }

    return issues;
}

/**
 * Validates plot outline markdown string.
 * Used for V1 Story Bible validation.
 */
export function validatePlotOutline(plotOutline: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!plotOutline || plotOutline.trim().length === 0) {
        issues.push({
            code: ValidationCodes.EMPTY_SECTION,
            message: 'Plot outline is empty',
            section: 'plotOutline',
            severity: 'error',
            suggestion: 'Add a three-act structure with story beats',
        });
        return issues;
    }

    // Token budget check
    const tokenResult = validateTokenBudget('plotOutline', plotOutline);
    if (!tokenResult.valid) {
        issues.push({
            code: ValidationCodes.PLOT_TOKEN_OVERFLOW,
            message: `Plot outline exceeds token budget (${tokenResult.tokens}/${tokenResult.budget})`,
            section: 'plotOutline',
            severity: 'error',
            currentValue: tokenResult.tokens,
            expectedValue: tokenResult.budget,
            suggestion: 'Condense the plot outline to fit within budget',
        });
    }

    // Check for act structure
    const actMarkers = plotOutline.match(/act\s*[123iI]+|act\s*one|act\s*two|act\s*three/gi) || [];
    if (actMarkers.length < 3) {
        issues.push({
            code: ValidationCodes.INVALID_ACT_STRUCTURE,
            message: 'Plot outline may not have clear three-act structure',
            section: 'plotOutline',
            severity: 'warning',
            suggestion: 'Organize into Act I, Act II, and Act III sections',
        });
    }

    return issues;
}

// ============================================================================
// Repetition Detection
// ============================================================================

/**
 * Detects repetition between sections.
 * Returns issues if sections share too much common content.
 */
export function detectRepetition(bible: StoryBible): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Normalize for comparison
    const normalize = (text: string): Set<string> => {
        return new Set(
            text
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3)
        );
    };

    const loglineWords = normalize(bible.logline);
    const charWords = normalize(bible.characters);
    const settingWords = normalize(bible.setting);
    const plotWords = normalize(bible.plotOutline);

    // Check logline repetition in characters
    const charOverlap = Array.from(charWords).filter(w => loglineWords.has(w)).length;
    const charOverlapPercent = loglineWords.size > 0 ? (charOverlap / loglineWords.size) * 100 : 0;
    
    if (charOverlapPercent > 60) {
        issues.push({
            code: ValidationCodes.SECTION_REPETITION,
            message: `Characters section repeats ${charOverlapPercent.toFixed(0)}% of logline content`,
            section: 'characters',
            severity: 'error',
            currentValue: `${charOverlapPercent.toFixed(0)}%`,
            expectedValue: '<60%',
            suggestion: 'Characters should add NEW information about roles and motivations',
        });
    }

    // Check logline repetition in setting
    const settingOverlap = Array.from(settingWords).filter(w => loglineWords.has(w)).length;
    const settingOverlapPercent = loglineWords.size > 0 ? (settingOverlap / loglineWords.size) * 100 : 0;
    
    if (settingOverlapPercent > 60) {
        issues.push({
            code: ValidationCodes.SECTION_REPETITION,
            message: `Setting section repeats ${settingOverlapPercent.toFixed(0)}% of logline content`,
            section: 'setting',
            severity: 'error',
            currentValue: `${settingOverlapPercent.toFixed(0)}%`,
            expectedValue: '<60%',
            suggestion: 'Setting should focus on world, atmosphere, and visual details',
        });
    }

    // Check verbatim logline repetition
    if (bible.characters.includes(bible.logline)) {
        issues.push({
            code: ValidationCodes.LOGLINE_VERBATIM_REPEATED,
            message: 'Logline appears verbatim in characters section',
            section: 'characters',
            severity: 'error',
            suggestion: 'Remove the repeated logline from characters',
        });
    }

    if (bible.setting.includes(bible.logline)) {
        issues.push({
            code: ValidationCodes.LOGLINE_VERBATIM_REPEATED,
            message: 'Logline appears verbatim in setting section',
            section: 'setting',
            severity: 'error',
            suggestion: 'Remove the repeated logline from setting',
        });
    }

    if (bible.plotOutline.includes(bible.logline)) {
        issues.push({
            code: ValidationCodes.LOGLINE_VERBATIM_REPEATED,
            message: 'Logline appears verbatim in plot outline',
            section: 'plotOutline',
            severity: 'warning',
            suggestion: 'Avoid repeating the full logline in plot outline',
        });
    }

    return issues;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Performs hard-gate validation on a Story Bible.
 * Returns valid=false if any errors are found.
 * 
 * @param bible - The Story Bible to validate
 * @returns Complete validation result with all issues
 */
export function validateStoryBibleHard(bible: StoryBible): StoryBibleValidationResult {
    const issues: ValidationIssue[] = [];

    // Validate logline
    issues.push(...validateLogline(bible.logline));

    // Validate setting
    issues.push(...validateSetting(bible.setting));

    // Validate characters (V2 or V1)
    if (isStoryBibleV2(bible)) {
        issues.push(...validateCharacterProfiles(bible.characterProfiles));
        issues.push(...validatePlotScenes(bible.plotScenes));
    } else {
        issues.push(...validateCharactersMarkdown(bible.characters));
        issues.push(...validatePlotOutline(bible.plotOutline));
    }

    // Detect repetition
    issues.push(...detectRepetition(bible));

    // Calculate token validation summary
    const tokenValidation: Record<string, TokenBudgetValidation> = {
        logline: validateTokenBudget('logline', bible.logline),
        setting: validateTokenBudget('setting', bible.setting),
    };

    // Count errors and warnings
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    // Calculate quality score (0-1)
    const maxPossibleIssues = 20; // Rough estimate of max issues
    const weightedIssueCount = errorCount * 2 + warningCount;
    const qualityScore = Math.max(0, 1 - (weightedIssueCount / maxPossibleIssues));

    return {
        valid: errorCount === 0,
        issues,
        errorCount,
        warningCount,
        tokenValidation,
        qualityScore,
        timestamp: Date.now(),
    };
}

// ============================================================================
// Soft Validation (Warnings Only)
// ============================================================================

/**
 * Performs soft validation that returns warnings but never fails.
 * Useful for downstream validation where hard failures aren't desired.
 */
export function validateStoryBibleSoft(bible: StoryBible): StoryBibleValidationResult {
    const hardResult = validateStoryBibleHard(bible);
    
    // Convert all errors to warnings for soft validation
    const softIssues = hardResult.issues.map(issue => ({
        ...issue,
        severity: issue.severity === 'error' ? 'warning' : issue.severity,
    })) as ValidationIssue[];

    return {
        ...hardResult,
        valid: true, // Soft validation always passes
        issues: softIssues,
        errorCount: 0,
        warningCount: softIssues.filter(i => i.severity === 'warning').length,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts visual descriptors from character profiles.
 * Returns a map of characterId → visualDescriptor for prompt injection.
 */
export function extractCharacterVisualDescriptors(
    profiles: CharacterProfile[]
): Record<string, string> {
    const descriptors: Record<string, string> = {};
    
    for (const profile of profiles) {
        if (profile.visualDescriptor && profile.visualDescriptor.trim().length > 0) {
            descriptors[profile.id] = profile.visualDescriptor.trim();
        } else {
            // Build fallback from appearance
            const parts: string[] = [];
            if (profile.appearance.hair) parts.push(profile.appearance.hair);
            if (profile.appearance.eyes) parts.push(profile.appearance.eyes);
            if (profile.appearance.build) parts.push(profile.appearance.build);
            if (profile.appearance.typicalAttire) parts.push(profile.appearance.typicalAttire);
            
            if (parts.length > 0) {
                descriptors[profile.id] = `${profile.name}, ${parts.join(', ')}`;
            }
        }
    }
    
    return descriptors;
}

/**
 * Formats validation issues for display/logging.
 */
export function formatValidationIssues(result: StoryBibleValidationResult): string {
    const lines: string[] = [
        `Story Bible Validation: ${result.valid ? 'PASSED' : 'FAILED'}`,
        `Errors: ${result.errorCount}, Warnings: ${result.warningCount}`,
        `Quality Score: ${((result.qualityScore || 0) * 100).toFixed(0)}%`,
        '',
    ];

    if (result.issues.length === 0) {
        lines.push('No issues found.');
    } else {
        for (const issue of result.issues) {
            const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
            lines.push(`${icon} [${issue.section}] ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`  → ${issue.suggestion}`);
            }
        }
    }

    return lines.join('\n');
}

/**
 * Gets issues by section for targeted feedback.
 */
export function getIssuesBySection(
    result: StoryBibleValidationResult
): Record<string, ValidationIssue[]> {
    const bySection: Record<string, ValidationIssue[]> = {};
    
    for (const issue of result.issues) {
        const sectionKey = issue.section.split('.')[0];
        if (!bySection[sectionKey]) {
            bySection[sectionKey] = [];
        }
        bySection[sectionKey].push(issue);
    }
    
    return bySection;
}

/**
 * Builds feedback prompt for regeneration based on validation issues.
 */
export function buildRegenerationFeedback(
    result: StoryBibleValidationResult,
    section: keyof StoryBible
): string {
    const sectionIssues = result.issues.filter(i => 
        i.section === section || i.section.startsWith(`${section}.`)
    );

    if (sectionIssues.length === 0) {
        return '';
    }

    const lines = [
        `The previous ${section} had the following issues that need to be fixed:`,
        '',
    ];

    for (const issue of sectionIssues) {
        lines.push(`- ${issue.message}`);
        if (issue.suggestion) {
            lines.push(`  Fix: ${issue.suggestion}`);
        }
    }

    lines.push('');
    lines.push(`Please regenerate the ${section} addressing these issues.`);

    return lines.join('\n');
}
