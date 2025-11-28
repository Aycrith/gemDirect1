/**
 * Character Appearance Tracking Service
 * 
 * Tracks character appearances across scenes and detects narrative gaps.
 * Warns when main/supporting characters are absent for extended periods.
 * 
 * @module services/characterTrackingService
 */

import type { 
    VisualBible, 
    VisualBibleCharacter, 
    Scene,
    StoryBible,
    StoryBibleV2,
    CharacterProfile 
} from '../types';
import { isStoryBibleV2 } from '../types';

/**
 * Character appearance gap information
 */
export interface CharacterGap {
    /** Character ID */
    characterId: string;
    /** Character name */
    characterName: string;
    /** Character role */
    role: VisualBibleCharacter['role'];
    /** Number of scenes since last appearance */
    sceneGap: number;
    /** Index of first scene in gap */
    gapStartSceneIndex: number;
    /** Index of last scene character appeared in */
    lastSeenSceneIndex: number;
    /** ID of last scene character appeared in */
    lastSeenSceneId: string;
    /** Warning severity based on gap length and role */
    severity: 'info' | 'warning' | 'critical';
    /** Human-readable message */
    message: string;
}

/**
 * Character tracking analysis result
 */
export interface TrackingAnalysis {
    /** Characters with appearance gaps */
    gaps: CharacterGap[];
    /** Characters that appear consistently */
    consistent: string[];
    /** Total scenes analyzed */
    totalScenes: number;
    /** Summary statistics */
    stats: {
        protagonistsTracked: number;
        antagonistsTracked: number;
        supportingTracked: number;
        averageGap: number;
        maxGap: number;
    };
}

/**
 * Gap thresholds by character role
 * Protagonists should appear more frequently than supporting characters
 */
export const GAP_THRESHOLDS = {
    protagonist: {
        warning: 2,    // Warn after 2 scenes absent
        critical: 4,   // Critical after 4 scenes absent
    },
    antagonist: {
        warning: 3,
        critical: 6,
    },
    supporting: {
        warning: 4,
        critical: 8,
    },
    background: {
        warning: 10,   // Background characters can be absent longer
        critical: 20,
    },
    default: {
        warning: 5,
        critical: 10,
    },
} as const;

/**
 * Builds a scene order index from scenes array
 */
export function buildSceneIndex(scenes: Scene[]): Map<string, number> {
    const index = new Map<string, number>();
    scenes.forEach((scene, idx) => index.set(scene.id, idx));
    return index;
}

/**
 * Gets character appearances across scenes
 * @returns Map of characterId -> array of scene indices where they appear
 */
export function getCharacterAppearances(
    scenes: Scene[],
    visualBible: VisualBible
): Map<string, number[]> {
    const appearances = new Map<string, number[]>();
    
    scenes.forEach((scene, sceneIndex) => {
        const characterIds = visualBible.sceneCharacters?.[scene.id] || [];
        
        for (const charId of characterIds) {
            const existing = appearances.get(charId) || [];
            existing.push(sceneIndex);
            appearances.set(charId, existing);
        }
        
        // Also check if characters are mentioned in shot-level mappings
        if (visualBible.shotCharacters) {
            // Find all shots for this scene (would need timeline data)
            // For now, we rely on scene-level mappings
        }
    });
    
    return appearances;
}

/**
 * Analyzes character appearance patterns and identifies gaps
 */
export function analyzeCharacterGaps(
    scenes: Scene[],
    visualBible: VisualBible,
    storyBible?: StoryBible | null
): TrackingAnalysis {
    if (!scenes.length || !visualBible.characters.length) {
        return {
            gaps: [],
            consistent: [],
            totalScenes: scenes.length,
            stats: {
                protagonistsTracked: 0,
                antagonistsTracked: 0,
                supportingTracked: 0,
                averageGap: 0,
                maxGap: 0,
            },
        };
    }
    
    const appearances = getCharacterAppearances(scenes, visualBible);
    const gaps: CharacterGap[] = [];
    const consistent: string[] = [];
    
    // Get character profiles from StoryBible V2 for additional context
    const characterProfiles = new Map<string, CharacterProfile>();
    if (storyBible && isStoryBibleV2(storyBible)) {
        const bible = storyBible as StoryBibleV2;
        bible.characterProfiles?.forEach(profile => {
            characterProfiles.set(profile.id, profile);
            characterProfiles.set(profile.name.toLowerCase(), profile);
        });
    }
    
    // Track only characters with significant roles
    const trackableCharacters = visualBible.characters.filter(
        char => char.role && char.role !== 'background'
    );
    
    let totalGaps = 0;
    let maxGap = 0;
    let protagonistsTracked = 0;
    let antagonistsTracked = 0;
    let supportingTracked = 0;
    
    for (const character of trackableCharacters) {
        const charAppearances = appearances.get(character.id) || [];
        
        // Count by role
        if (character.role === 'protagonist') protagonistsTracked++;
        else if (character.role === 'antagonist') antagonistsTracked++;
        else if (character.role === 'supporting') supportingTracked++;
        
        if (charAppearances.length === 0) {
            // Character never appears - this is a critical gap
            gaps.push({
                characterId: character.id,
                characterName: character.name,
                role: character.role,
                sceneGap: scenes.length,
                gapStartSceneIndex: 0,
                lastSeenSceneIndex: -1,
                lastSeenSceneId: '',
                severity: 'critical',
                message: `${character.name} (${character.role}) never appears in any scene`,
            });
            maxGap = Math.max(maxGap, scenes.length);
            totalGaps++;
            continue;
        }
        
        // Sort appearances chronologically
        const sortedAppearances = [...charAppearances].sort((a, b) => a - b);
        
        // Check gap from start
        const firstAppearance = sortedAppearances[0];
        if (firstAppearance !== undefined && firstAppearance > 0) {
            const gapSize = firstAppearance;
            const threshold = GAP_THRESHOLDS[character.role || 'default'];
            
            if (gapSize >= threshold.warning) {
                const severity = gapSize >= threshold.critical ? 'critical' : 'warning';
                gaps.push({
                    characterId: character.id,
                    characterName: character.name,
                    role: character.role,
                    sceneGap: gapSize,
                    gapStartSceneIndex: 0,
                    lastSeenSceneIndex: -1,
                    lastSeenSceneId: '',
                    severity,
                    message: `${character.name} doesn't appear until scene ${firstAppearance + 1}`,
                });
                maxGap = Math.max(maxGap, gapSize);
                totalGaps++;
            }
        }
        
        // Check gaps between appearances
        for (let i = 1; i < sortedAppearances.length; i++) {
            const currentAppearance = sortedAppearances[i];
            const previousAppearance = sortedAppearances[i - 1];
            
            // Skip if either value is undefined (shouldn't happen but TypeScript needs the check)
            if (currentAppearance === undefined || previousAppearance === undefined) continue;
            
            const gapSize = currentAppearance - previousAppearance - 1;
            
            if (gapSize > 0) {
                const threshold = GAP_THRESHOLDS[character.role || 'default'];
                
                if (gapSize >= threshold.warning) {
                    const lastSeenIdx = previousAppearance;
                    const severity = gapSize >= threshold.critical ? 'critical' : 'warning';
                    gaps.push({
                        characterId: character.id,
                        characterName: character.name,
                        role: character.role,
                        sceneGap: gapSize,
                        gapStartSceneIndex: lastSeenIdx + 1,
                        lastSeenSceneIndex: lastSeenIdx,
                        lastSeenSceneId: scenes[lastSeenIdx]?.id || '',
                        severity,
                        message: `${character.name} absent for ${gapSize} scene${gapSize > 1 ? 's' : ''} after scene ${lastSeenIdx + 1}`,
                    });
                    maxGap = Math.max(maxGap, gapSize);
                    totalGaps++;
                }
            }
        }
        
        // Check gap to end
        const lastAppearanceIdx = sortedAppearances[sortedAppearances.length - 1];
        
        // Skip if undefined (shouldn't happen for non-empty array but TypeScript needs the check)
        if (lastAppearanceIdx === undefined) continue;
        
        const gapToEnd = scenes.length - 1 - lastAppearanceIdx;
        
        if (gapToEnd > 0) {
            const threshold = GAP_THRESHOLDS[character.role || 'default'];
            
            if (gapToEnd >= threshold.warning) {
                const severity = gapToEnd >= threshold.critical ? 'critical' : 'warning';
                gaps.push({
                    characterId: character.id,
                    characterName: character.name,
                    role: character.role,
                    sceneGap: gapToEnd,
                    gapStartSceneIndex: lastAppearanceIdx + 1,
                    lastSeenSceneIndex: lastAppearanceIdx,
                    lastSeenSceneId: scenes[lastAppearanceIdx]?.id || '',
                    severity,
                    message: `${character.name} disappears after scene ${lastAppearanceIdx + 1} (${gapToEnd} scene${gapToEnd > 1 ? 's' : ''} remaining)`,
                });
                maxGap = Math.max(maxGap, gapToEnd);
                totalGaps++;
            }
        }
        
        // Mark as consistent if no significant gaps found
        const hasGaps = gaps.some(g => g.characterId === character.id);
        if (!hasGaps) {
            consistent.push(character.id);
        }
    }
    
    // Sort gaps by severity (critical first) then by gap size
    gaps.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.sceneGap - a.sceneGap;
    });
    
    return {
        gaps,
        consistent,
        totalScenes: scenes.length,
        stats: {
            protagonistsTracked,
            antagonistsTracked,
            supportingTracked,
            averageGap: totalGaps > 0 ? maxGap / totalGaps : 0,
            maxGap,
        },
    };
}

/**
 * Updates character tracking metadata after scene changes
 */
export function updateCharacterTracking(
    character: VisualBibleCharacter,
    sceneId: string,
    _sceneIndex: number
): VisualBibleCharacter {
    return {
        ...character,
        appearanceCount: (character.appearanceCount || 0) + 1,
        lastSeenSceneId: sceneId,
    };
}

/**
 * Gets a summary string for display in UI
 */
export function getTrackingSummary(analysis: TrackingAnalysis): string {
    if (analysis.gaps.length === 0) {
        return `✓ All ${analysis.stats.protagonistsTracked + analysis.stats.antagonistsTracked + analysis.stats.supportingTracked} tracked characters appear consistently`;
    }
    
    const criticalCount = analysis.gaps.filter(g => g.severity === 'critical').length;
    const warningCount = analysis.gaps.filter(g => g.severity === 'warning').length;
    
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (warningCount > 0) parts.push(`${warningCount} warning`);
    
    return `⚠ ${parts.join(', ')} appearance gap${analysis.gaps.length > 1 ? 's' : ''} detected`;
}
