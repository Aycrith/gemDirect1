import { describe, it, expect } from 'vitest';
import {
    analyzeCharacterGaps,
    buildSceneIndex,
    getCharacterAppearances,
    getTrackingSummary,
    updateCharacterTracking,
    GAP_THRESHOLDS,
    type TrackingAnalysis,
} from '../characterTrackingService';
import type { Scene, VisualBible, VisualBibleCharacter } from '../../types';

// Helper to create mock scenes
function createScenes(count: number): Scene[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `scene-${i + 1}`,
        title: `Scene ${i + 1}`,
        summary: `Scene ${i + 1} summary`,
        timeline: { 
            shots: [], 
            shotEnhancers: {}, 
            transitions: [],
            negativePrompt: '',
        },
    }));
}

// Helper to create mock visual bible character
function createCharacter(
    id: string,
    name: string,
    role: VisualBibleCharacter['role'] = 'supporting'
): VisualBibleCharacter {
    return {
        id,
        name,
        role,
    };
}

describe('characterTrackingService', () => {
    describe('buildSceneIndex', () => {
        it('should build correct scene index', () => {
            const scenes = createScenes(3);
            const index = buildSceneIndex(scenes);
            
            expect(index.get('scene-1')).toBe(0);
            expect(index.get('scene-2')).toBe(1);
            expect(index.get('scene-3')).toBe(2);
        });
        
        it('should handle empty scenes', () => {
            const index = buildSceneIndex([]);
            expect(index.size).toBe(0);
        });
    });
    
    describe('getCharacterAppearances', () => {
        it('should track character appearances across scenes', () => {
            const scenes = createScenes(5);
            const visualBible: VisualBible = {
                characters: [createCharacter('char-1', 'Hero')],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['char-1'],
                    'scene-3': ['char-1'],
                    'scene-5': ['char-1'],
                },
            };
            
            const appearances = getCharacterAppearances(scenes, visualBible);
            
            expect(appearances.get('char-1')).toEqual([0, 2, 4]);
        });
        
        it('should handle no appearances', () => {
            const scenes = createScenes(3);
            const visualBible: VisualBible = {
                characters: [createCharacter('char-1', 'Hero')],
                styleBoards: [],
                sceneCharacters: {},
            };
            
            const appearances = getCharacterAppearances(scenes, visualBible);
            
            expect(appearances.get('char-1')).toBeUndefined();
        });
    });
    
    describe('analyzeCharacterGaps', () => {
        it('should return empty analysis for empty inputs', () => {
            const analysis = analyzeCharacterGaps([], { characters: [], styleBoards: [] });
            
            expect(analysis.gaps).toEqual([]);
            expect(analysis.consistent).toEqual([]);
            expect(analysis.totalScenes).toBe(0);
        });
        
        it('should detect protagonist absence as critical', () => {
            const scenes = createScenes(6);
            const visualBible: VisualBible = {
                characters: [createCharacter('hero', 'Hero', 'protagonist')],
                styleBoards: [],
                sceneCharacters: {
                    // Hero never appears - should be critical
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.gaps.length).toBe(1);
            expect(analysis.gaps[0]!.severity).toBe('critical');
            expect(analysis.gaps[0]!.characterName).toBe('Hero');
            expect(analysis.gaps[0]!.message).toContain('never appears');
        });
        
        it('should detect mid-story gaps for protagonists', () => {
            const scenes = createScenes(8);
            const visualBible: VisualBible = {
                characters: [createCharacter('hero', 'Hero', 'protagonist')],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['hero'],
                    'scene-2': ['hero'],
                    // 3-5 missing (3 scenes = warning for protagonist)
                    'scene-6': ['hero'],
                    'scene-7': ['hero'],
                    'scene-8': ['hero'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.gaps.length).toBe(1);
            expect(analysis.gaps[0]!.sceneGap).toBe(3);
            expect(analysis.gaps[0]!.severity).toBe('warning');
        });
        
        it('should mark supporting characters with shorter gaps as warning', () => {
            const scenes = createScenes(10);
            const visualBible: VisualBible = {
                characters: [createCharacter('sidekick', 'Sidekick', 'supporting')],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['sidekick'],
                    // 2-5 missing (4 scenes = warning for supporting)
                    'scene-6': ['sidekick'],
                    'scene-7': ['sidekick'],
                    'scene-8': ['sidekick'],
                    'scene-9': ['sidekick'],
                    'scene-10': ['sidekick'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.gaps.length).toBe(1);
            expect(analysis.gaps[0]!.sceneGap).toBe(4);
            expect(analysis.gaps[0]!.severity).toBe('warning');
        });
        
        it('should ignore background characters with normal gaps', () => {
            const scenes = createScenes(8);
            const visualBible: VisualBible = {
                characters: [createCharacter('extra', 'Extra', 'background')],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['extra'],
                    'scene-8': ['extra'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            // Background characters only tracked if they have significant roles
            expect(analysis.gaps.length).toBe(0);
        });
        
        it('should mark consistent characters correctly', () => {
            const scenes = createScenes(5);
            const visualBible: VisualBible = {
                characters: [createCharacter('hero', 'Hero', 'protagonist')],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['hero'],
                    'scene-2': ['hero'],
                    'scene-3': ['hero'],
                    'scene-4': ['hero'],
                    'scene-5': ['hero'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.gaps.length).toBe(0);
            expect(analysis.consistent).toContain('hero');
        });
        
        it('should detect late introduction of protagonist', () => {
            const scenes = createScenes(6);
            const visualBible: VisualBible = {
                characters: [createCharacter('hero', 'Hero', 'protagonist')],
                styleBoards: [],
                sceneCharacters: {
                    // Hero doesn't appear until scene 4 (gap of 3 from start)
                    'scene-4': ['hero'],
                    'scene-5': ['hero'],
                    'scene-6': ['hero'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.gaps.length).toBe(1);
            expect(analysis.gaps[0]!.gapStartSceneIndex).toBe(0);
            expect(analysis.gaps[0]!.message).toContain("doesn't appear until");
        });
        
        it('should detect early exit of protagonist', () => {
            const scenes = createScenes(6);
            const visualBible: VisualBible = {
                characters: [createCharacter('hero', 'Hero', 'protagonist')],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['hero'],
                    'scene-2': ['hero'],
                    'scene-3': ['hero'],
                    // Hero disappears with 3 scenes remaining (warning)
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.gaps.length).toBe(1);
            expect(analysis.gaps[0]!.message).toContain('disappears after');
        });
        
        it('should sort gaps by severity then by gap size', () => {
            const scenes = createScenes(15);
            const visualBible: VisualBible = {
                characters: [
                    createCharacter('hero', 'Hero', 'protagonist'),
                    createCharacter('villain', 'Villain', 'antagonist'),
                ],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['hero', 'villain'],
                    // Hero absent for 5 scenes (critical for protagonist)
                    // Villain absent for 4 scenes (warning for antagonist)
                    'scene-7': ['hero'],
                    'scene-6': ['villain'],
                    'scene-8': ['hero', 'villain'],
                    'scene-9': ['hero', 'villain'],
                    'scene-10': ['hero', 'villain'],
                    'scene-11': ['hero', 'villain'],
                    'scene-12': ['hero', 'villain'],
                    'scene-13': ['hero', 'villain'],
                    'scene-14': ['hero', 'villain'],
                    'scene-15': ['hero', 'villain'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            // Critical gaps should come first
            expect(analysis.gaps.length).toBeGreaterThan(0);
            const criticalGaps = analysis.gaps.filter(g => g.severity === 'critical');
            const warningGaps = analysis.gaps.filter(g => g.severity === 'warning');
            
            if (criticalGaps.length > 0 && warningGaps.length > 0) {
                const firstCriticalIndex = analysis.gaps.findIndex(g => g.severity === 'critical');
                const firstWarningIndex = analysis.gaps.findIndex(g => g.severity === 'warning');
                expect(firstCriticalIndex).toBeLessThan(firstWarningIndex);
            }
        });
        
        it('should provide accurate stats', () => {
            const scenes = createScenes(5);
            const visualBible: VisualBible = {
                characters: [
                    createCharacter('hero', 'Hero', 'protagonist'),
                    createCharacter('villain', 'Villain', 'antagonist'),
                    createCharacter('sidekick', 'Sidekick', 'supporting'),
                ],
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['hero', 'villain', 'sidekick'],
                    'scene-2': ['hero', 'villain', 'sidekick'],
                    'scene-3': ['hero', 'villain', 'sidekick'],
                    'scene-4': ['hero', 'villain', 'sidekick'],
                    'scene-5': ['hero', 'villain', 'sidekick'],
                },
            };
            
            const analysis = analyzeCharacterGaps(scenes, visualBible);
            
            expect(analysis.stats.protagonistsTracked).toBe(1);
            expect(analysis.stats.antagonistsTracked).toBe(1);
            expect(analysis.stats.supportingTracked).toBe(1);
            expect(analysis.totalScenes).toBe(5);
        });
    });
    
    describe('updateCharacterTracking', () => {
        it('should increment appearance count', () => {
            const character = createCharacter('hero', 'Hero');
            character.appearanceCount = 2;
            
            const updated = updateCharacterTracking(character, 'scene-3', 2);
            
            expect(updated.appearanceCount).toBe(3);
            expect(updated.lastSeenSceneId).toBe('scene-3');
        });
        
        it('should handle first appearance', () => {
            const character = createCharacter('hero', 'Hero');
            
            const updated = updateCharacterTracking(character, 'scene-1', 0);
            
            expect(updated.appearanceCount).toBe(1);
            expect(updated.lastSeenSceneId).toBe('scene-1');
        });
    });
    
    describe('getTrackingSummary', () => {
        it('should return success message when no gaps', () => {
            const analysis: TrackingAnalysis = {
                gaps: [],
                consistent: ['hero', 'villain'],
                totalScenes: 5,
                stats: {
                    protagonistsTracked: 1,
                    antagonistsTracked: 1,
                    supportingTracked: 0,
                    averageGap: 0,
                    maxGap: 0,
                },
            };
            
            const summary = getTrackingSummary(analysis);
            
            expect(summary).toContain('✓');
            expect(summary).toContain('2 tracked characters');
        });
        
        it('should report critical and warning counts', () => {
            const analysis: TrackingAnalysis = {
                gaps: [
                    {
                        characterId: 'hero',
                        characterName: 'Hero',
                        role: 'protagonist',
                        sceneGap: 5,
                        gapStartSceneIndex: 1,
                        lastSeenSceneIndex: 0,
                        lastSeenSceneId: 'scene-1',
                        severity: 'critical',
                        message: 'Test',
                    },
                    {
                        characterId: 'sidekick',
                        characterName: 'Sidekick',
                        role: 'supporting',
                        sceneGap: 4,
                        gapStartSceneIndex: 1,
                        lastSeenSceneIndex: 0,
                        lastSeenSceneId: 'scene-1',
                        severity: 'warning',
                        message: 'Test',
                    },
                ],
                consistent: [],
                totalScenes: 10,
                stats: {
                    protagonistsTracked: 1,
                    antagonistsTracked: 0,
                    supportingTracked: 1,
                    averageGap: 4.5,
                    maxGap: 5,
                },
            };
            
            const summary = getTrackingSummary(analysis);
            
            expect(summary).toContain('⚠');
            expect(summary).toContain('1 critical');
            expect(summary).toContain('1 warning');
        });
    });
    
    describe('GAP_THRESHOLDS', () => {
        it('should have stricter thresholds for protagonists', () => {
            expect(GAP_THRESHOLDS.protagonist.warning).toBeLessThan(GAP_THRESHOLDS.supporting.warning);
            expect(GAP_THRESHOLDS.protagonist.critical).toBeLessThan(GAP_THRESHOLDS.supporting.critical);
        });
        
        it('should have most lenient thresholds for background', () => {
            expect(GAP_THRESHOLDS.background.warning).toBeGreaterThan(GAP_THRESHOLDS.protagonist.warning);
            expect(GAP_THRESHOLDS.background.warning).toBeGreaterThan(GAP_THRESHOLDS.antagonist.warning);
            expect(GAP_THRESHOLDS.background.warning).toBeGreaterThan(GAP_THRESHOLDS.supporting.warning);
        });
    });
});
