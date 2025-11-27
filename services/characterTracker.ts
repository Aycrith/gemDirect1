/**
 * Character Tracker Service
 * 
 * Tracks character appearances across timeline shots and analyzes continuity.
 * Part of Prompt Optimization Phase 4: Character Appearance Tracking.
 * 
 * Features:
 * - Track character mentions (explicit names and implicit references)
 * - Detect continuity issues (gaps, sudden appearances, inconsistencies)
 * - Link shot appearances to StoryBible character profiles
 * 
 * @module services/characterTracker
 */

import type { CharacterProfile, StoryBible, StoryBibleV2, TimelineData } from '../types';
import { isStoryBibleV2 } from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum consecutive shots a protagonist can be absent before warning
 */
export const MAX_PROTAGONIST_GAP = 3;

/**
 * Maximum consecutive shots a supporting character can be absent before warning
 */
export const MAX_SUPPORTING_GAP = 5;

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a character's appearance in a specific shot
 */
export interface ShotCharacterAppearance {
    /** Character ID from StoryBible */
    characterId: string;
    /** Character's name for display */
    characterName: string;
    /** Shot ID where character appears */
    shotId: string;
    /** Index of the shot in the timeline */
    shotIndex: number;
    /** Whether the character is mentioned by name (vs. pronoun/role) */
    isExplicitlyMentioned: boolean;
    /** Optional visual descriptor found in the shot */
    visualDescriptor?: string;
}

/**
 * Types of continuity warnings
 */
export type ContinuityWarningType = 
    | 'gap'                     // Character absent for too many shots
    | 'sudden_appearance'       // Character appears without prior introduction
    | 'inconsistent_descriptor'; // Visual description doesn't match profile

/**
 * A warning about character continuity issues
 */
export interface CharacterContinuityWarning {
    /** Character ID from StoryBible */
    characterId: string;
    /** Character's name for display */
    characterName: string;
    /** Type of continuity issue */
    warningType: ContinuityWarningType;
    /** Human-readable description of the issue */
    details: string;
    /** Shot IDs affected by this warning */
    affectedShotIds: string[];
    /** Suggested action to fix the issue */
    suggestion: string;
}

/**
 * Result of tracking character appearances
 */
export interface CharacterTrackingResult {
    /** All character appearances found */
    appearances: ShotCharacterAppearance[];
    /** Map of character ID to their shot indices */
    characterTimeline: Map<string, number[]>;
    /** Total shots analyzed */
    totalShots: number;
}

/**
 * Result of continuity analysis
 */
export interface ContinuityAnalysisResult {
    /** Warnings found during analysis */
    warnings: CharacterContinuityWarning[];
    /** Summary statistics */
    stats: {
        totalCharacters: number;
        charactersWithWarnings: number;
        totalWarnings: number;
    };
}

// ============================================================================
// Character Name Extraction Helpers
// ============================================================================

/**
 * Common pronouns that might refer to characters
 */
const PRONOUNS = new Set([
    'he', 'she', 'they', 'him', 'her', 'them',
    'his', 'hers', 'their', 'theirs',
    'himself', 'herself', 'themselves'
]);

/**
 * Extracts character profiles from a StoryBible (V1 or V2).
 * For V1 (string characters), returns empty array - character tracking requires V2.
 * For V2, returns the characterProfiles array.
 * 
 * @param storyBible - Story Bible (V1 or V2)
 * @returns CharacterProfile[] from V2, or empty array for V1
 */
function getCharacterProfiles(storyBible: StoryBible | StoryBibleV2): CharacterProfile[] {
    if (isStoryBibleV2(storyBible)) {
        return storyBible.characterProfiles || [];
    }
    // V1 StoryBible has characters as a string - cannot track
    return [];
}

/**
 * Extracts potential character references from shot description
 */
function extractCharacterReferences(
    description: string,
    characters: CharacterProfile[]
): { explicit: Set<string>; implicit: Set<string> } {
    const explicit = new Set<string>();
    const implicit = new Set<string>();
    const lowerDesc = description.toLowerCase();
    
    // Check for explicit name mentions
    for (const char of characters) {
        const nameLower = char.name.toLowerCase();
        // Match whole word only
        const nameRegex = new RegExp(`\\b${escapeRegex(nameLower)}\\b`, 'i');
        if (nameRegex.test(description)) {
            explicit.add(char.id);
        }
    }
    
    // Check for role-based references (only if we haven't found explicit)
    for (const char of characters) {
        if (explicit.has(char.id)) continue;
        
        // Check if character's role is mentioned
        const roleLower = char.role.toLowerCase();
        if (lowerDesc.includes(roleLower)) {
            implicit.add(char.id);
        }
    }
    
    // Check for pronouns (very basic - could be enhanced with NLP)
    // For now, if pronouns are present and we have a protagonist, assume protagonist
    const hasPronouns = Array.from(PRONOUNS).some(p => 
        new RegExp(`\\b${p}\\b`, 'i').test(description)
    );
    
    if (hasPronouns && explicit.size === 0) {
        const protagonist = characters.find(c => c.role === 'protagonist');
        if (protagonist) {
            implicit.add(protagonist.id);
        }
    }
    
    return { explicit, implicit };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract visual descriptors from shot description
 */
function extractVisualDescriptor(
    description: string,
    character: CharacterProfile
): string | undefined {
    const lowerDesc = description.toLowerCase();
    const descriptors: string[] = [];
    
    // Check for appearance-related terms
    const appearance = character.appearance;
    if (appearance.hair && lowerDesc.includes(appearance.hair.toLowerCase())) {
        descriptors.push(appearance.hair);
    }
    if (appearance.build && lowerDesc.includes(appearance.build.toLowerCase())) {
        descriptors.push(appearance.build);
    }
    if (appearance.typicalAttire && lowerDesc.includes(appearance.typicalAttire.toLowerCase())) {
        descriptors.push(appearance.typicalAttire);
    }
    
    return descriptors.length > 0 ? descriptors.join(', ') : undefined;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Tracks character appearances across all shots in a timeline.
 * 
 * @param timeline - The timeline containing shots
 * @param storyBible - Story Bible with character profiles (V2 required for tracking)
 * @returns Tracking result with appearances and character timeline
 */
export function trackCharacterAppearances(
    timeline: TimelineData,
    storyBible: StoryBible | StoryBibleV2
): CharacterTrackingResult {
    const appearances: ShotCharacterAppearance[] = [];
    const characterTimeline = new Map<string, number[]>();
    const characters = getCharacterProfiles(storyBible);
    
    if (characters.length === 0) {
        return {
            appearances,
            characterTimeline,
            totalShots: timeline.shots.length
        };
    }
    
    // Initialize character timeline map
    for (const char of characters) {
        characterTimeline.set(char.id, []);
    }
    
    // Process each shot
    timeline.shots.forEach((shot, index) => {
        const refs = extractCharacterReferences(shot.description, characters);
        
        // Process explicit mentions
        for (const charId of refs.explicit) {
            const char = characters.find((c: CharacterProfile) => c.id === charId);
            if (!char) continue;
            
            appearances.push({
                characterId: charId,
                characterName: char.name,
                shotId: shot.id,
                shotIndex: index,
                isExplicitlyMentioned: true,
                visualDescriptor: extractVisualDescriptor(shot.description, char)
            });
            
            characterTimeline.get(charId)?.push(index);
        }
        
        // Process implicit mentions
        for (const charId of refs.implicit) {
            const char = characters.find((c: CharacterProfile) => c.id === charId);
            if (!char) continue;
            
            appearances.push({
                characterId: charId,
                characterName: char.name,
                shotId: shot.id,
                shotIndex: index,
                isExplicitlyMentioned: false,
                visualDescriptor: extractVisualDescriptor(shot.description, char)
            });
            
            characterTimeline.get(charId)?.push(index);
        }
    });
    
    return {
        appearances,
        characterTimeline,
        totalShots: timeline.shots.length
    };
}

/**
 * Analyzes character continuity and returns warnings for potential issues.
 * 
 * @param trackingResult - Result from trackCharacterAppearances
 * @param storyBible - Story Bible with character profiles (V2 required for analysis)
 * @returns Analysis result with warnings and stats
 */
export function analyzeCharacterContinuity(
    trackingResult: CharacterTrackingResult,
    storyBible: StoryBible | StoryBibleV2
): ContinuityAnalysisResult {
    const warnings: CharacterContinuityWarning[] = [];
    const characters = getCharacterProfiles(storyBible);
    const charactersWithWarnings = new Set<string>();
    
    if (characters.length === 0 || trackingResult.totalShots === 0) {
        return {
            warnings,
            stats: {
                totalCharacters: 0,
                charactersWithWarnings: 0,
                totalWarnings: 0
            }
        };
    }
    
    for (const char of characters) {
        const appearances = trackingResult.characterTimeline.get(char.id) || [];
        const maxGap = char.role === 'protagonist' ? MAX_PROTAGONIST_GAP : MAX_SUPPORTING_GAP;
        
        // Check for gaps
        if (appearances.length > 0) {
            // Check gap at beginning
            if (appearances[0]! > maxGap) {
                warnings.push({
                    characterId: char.id,
                    characterName: char.name,
                    warningType: 'sudden_appearance',
                    details: `${char.name} first appears at shot ${appearances[0]! + 1} without prior introduction`,
                    affectedShotIds: [trackingResult.appearances.find(a => 
                        a.characterId === char.id && a.shotIndex === appearances[0]
                    )?.shotId || ''],
                    suggestion: `Consider introducing ${char.name} earlier in the timeline, or add a brief setup in an earlier shot.`
                });
                charactersWithWarnings.add(char.id);
            }
            
            // Check gaps between appearances
            for (let i = 1; i < appearances.length; i++) {
                const gap = appearances[i]! - appearances[i - 1]! - 1;
                if (gap > maxGap) {
                    const startShot = appearances[i - 1]! + 1;
                    const endShot = appearances[i]!;
                    const affectedIds: string[] = [];
                    
                    // Collect affected shot IDs
                    for (let j = startShot; j <= endShot; j++) {
                        const shot = trackingResult.appearances.find(a => a.shotIndex === j);
                        if (shot) affectedIds.push(shot.shotId);
                    }
                    
                    warnings.push({
                        characterId: char.id,
                        characterName: char.name,
                        warningType: 'gap',
                        details: `${char.name} is absent for ${gap} consecutive shots (shots ${startShot + 1}-${endShot})`,
                        affectedShotIds: affectedIds.length > 0 ? affectedIds : [`shot-${startShot}`],
                        suggestion: `Add a brief mention or reaction shot of ${char.name} to maintain character presence.`
                    });
                    charactersWithWarnings.add(char.id);
                }
            }
        } else if (char.role === 'protagonist' || char.role === 'antagonist') {
            // Main characters should appear in the timeline
            warnings.push({
                characterId: char.id,
                characterName: char.name,
                warningType: 'gap',
                details: `${char.name} (${char.role}) is not mentioned in any shots`,
                affectedShotIds: [],
                suggestion: `${char.name} is a key character but doesn't appear in the timeline. Add shots featuring them.`
            });
            charactersWithWarnings.add(char.id);
        }
    }
    
    return {
        warnings,
        stats: {
            totalCharacters: characters.length,
            charactersWithWarnings: charactersWithWarnings.size,
            totalWarnings: warnings.length
        }
    };
}

/**
 * Convenience function to run full character tracking analysis.
 * 
 * @param timeline - The timeline to analyze
 * @param storyBible - Story Bible with character profiles (V2 required)
 * @returns Combined tracking and analysis results
 */
export function analyzeCharacterTimeline(
    timeline: TimelineData,
    storyBible: StoryBible | StoryBibleV2
): {
    tracking: CharacterTrackingResult;
    continuity: ContinuityAnalysisResult;
} {
    const tracking = trackCharacterAppearances(timeline, storyBible);
    const continuity = analyzeCharacterContinuity(tracking, storyBible);
    
    return { tracking, continuity };
}
