import { describe, it, expect } from 'vitest';
import { validateSceneProgression } from '../sceneProgressionValidator';
import { Scene, StoryBible } from '../../types';

const mockStoryBible: StoryBible = {
    logline: 'A hero saves the world',
    characters: '## Alice\nProtagonist\n\n## Bob\nAntagonist',
    setting: 'A futuristic city',
    plotOutline: 'Three act structure',
    heroArcs: [
        { id: 'arc1', name: 'Call to Adventure', summary: '...', emotionalShift: '...', importance: 1 },
        { id: 'arc2', name: 'Trials', summary: '...', emotionalShift: '...', importance: 2 },
        { id: 'arc3', name: 'Return', summary: '...', emotionalShift: '...', importance: 3 }
    ]
};

const createScene = (id: string, title: string, summary: string, heroArcOrder?: number): Scene => ({
    id,
    title,
    summary,
    timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
    heroArcOrder
});

describe('Scene Progression Validation', () => {
    describe('Act ordering', () => {
        it('should pass when acts are in order', () => {
            const scenes: Scene[] = [
                createScene('1', 'Act 1: Beginning', 'The story starts'),
                createScene('2', 'Act 2: Middle', 'The conflict rises'),
                createScene('3', 'Act 3: End', 'The resolution')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.metadata.actsDetected).toEqual([1, 2, 3]);
        });

        it('should detect out-of-order acts', () => {
            const scenes: Scene[] = [
                createScene('1', 'Act 1: Beginning', 'The story starts'),
                createScene('2', 'Act 3: End', 'The resolution'),
                createScene('3', 'Act 2: Middle', 'The conflict rises')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    errorType: 'out_of_order',
                    sceneIndex: 2,
                    message: expect.stringContaining('Act 2 but previous scene was Act 3')
                })
            );
        });

        it('should detect missing acts', () => {
            const scenes: Scene[] = [
                createScene('1', 'Act 1: Beginning', 'The story starts'),
                createScene('2', 'Act 3: End', 'The resolution')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    errorType: 'missing_act',
                    message: expect.stringContaining('missing intermediate act')
                })
            );
        });

        it('should detect acts in summary text', () => {
            const scenes: Scene[] = [
                createScene('1', 'Opening Scene', 'This is Act 1 where the hero is introduced'),
                createScene('2', 'Middle Scene', 'Act 2 brings the conflict')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.metadata.actsDetected).toEqual([1, 2]);
        });

        it('should handle scenes without act references', () => {
            const scenes: Scene[] = [
                createScene('1', 'Opening', 'A scene without act mention'),
                createScene('2', 'Middle', 'Another scene')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.isValid).toBe(true);
            expect(result.metadata.actsDetected).toEqual([]);
        });
    });

    describe('Hero arc progression', () => {
        it('should validate hero arc order progression', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'Opening', 1),
                createScene('2', 'Scene 2', 'Middle', 2),
                createScene('3', 'Scene 3', 'End', 3)
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.warnings).not.toContainEqual(
                expect.objectContaining({ errorType: 'out_of_order' })
            );
        });

        it('should detect out-of-order hero arc progression', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'Opening', 1),
                createScene('2', 'Scene 2', 'Middle', 3),
                createScene('3', 'Scene 3', 'End', 2)
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    errorType: 'out_of_order',
                    sceneIndex: 2,
                    message: expect.stringContaining('hero arc order (2) is before previous scene (3)')
                })
            );
        });

        it('should track hero arcs used', () => {
            const scenes: Scene[] = [
                { ...createScene('1', 'Scene 1', 'Opening', 1), heroArcId: 'arc1' },
                { ...createScene('2', 'Scene 2', 'Middle', 2), heroArcId: 'arc2' }
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.metadata.heroArcsUsed).toContain('arc2');
        });

        it('should handle scenes without hero arc order', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'Opening'),
                createScene('2', 'Scene 2', 'Middle')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Character continuity', () => {
        it('should detect characters referenced before introduction', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'Alice meets Bob.'),
                createScene('2', 'Scene 2', 'Charlie appears for the first time.'),
                createScene('3', 'Scene 3', 'Alice talks to Charlie.')
            ];
            const bible = { ...mockStoryBible, characters: '## Alice\n...\n## Bob\n...\n## Charlie\n...' };
            const result = validateSceneProgression(scenes, bible);

            // Charlie introduced in Scene 2, so Scene 3 reference is valid
            expect(result.metadata.charactersIntroduced).toContain('Charlie');
        });

        it('should extract character names from markdown', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'Alice and Bob meet.')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.metadata.charactersIntroduced).toContain('Alice');
            expect(result.metadata.charactersIntroduced).toContain('Bob');
        });

        it('should be case-insensitive in character detection', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'ALICE meets bob.')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.metadata.charactersIntroduced).toContain('Alice');
            expect(result.metadata.charactersIntroduced).toContain('Bob');
        });

        it('should handle empty characters section', () => {
            const scenes: Scene[] = [
                createScene('1', 'Scene 1', 'A scene with no characters')
            ];
            const bible = { ...mockStoryBible, characters: '' };
            const result = validateSceneProgression(scenes, bible);
            expect(result.metadata.charactersIntroduced).toHaveLength(0);
        });
    });

    describe('Integration scenarios', () => {
        it('should validate a well-structured story', () => {
            const scenes: Scene[] = [
                { ...createScene('1', 'Act 1: The Call', 'Alice discovers her destiny', 1), heroArcId: 'arc1' },
                { ...createScene('2', 'Act 2: The Journey', 'Alice and Bob face trials', 2), heroArcId: 'arc2' },
                { ...createScene('3', 'Act 3: The Return', 'Alice defeats Bob and returns home', 3), heroArcId: 'arc3' }
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.warnings).toHaveLength(0);
            expect(result.metadata.actsDetected).toEqual([1, 2, 3]);
            expect(result.metadata.totalScenes).toBe(3);
        });

        it('should detect multiple issues in problematic story', () => {
            const scenes: Scene[] = [
                createScene('1', 'Act 1: Opening', 'Alice appears'),
                createScene('2', 'Act 3: Ending', 'Charlie helps Alice'), // Missing Act 2, character before intro
                createScene('3', 'Act 2: Middle', 'Bob is introduced') // Out of order
            ];
            const bible = { ...mockStoryBible, characters: '## Alice\n...\n## Bob\n...\n## Charlie\n...' };
            const result = validateSceneProgression(scenes, bible);
            
            expect(result.warnings.length).toBeGreaterThan(1);
            expect(result.warnings.some(w => w.errorType === 'missing_act')).toBe(true);
            expect(result.warnings.some(w => w.errorType === 'out_of_order')).toBe(true);
        });

        it('should provide helpful suggestions', () => {
            const scenes: Scene[] = [
                createScene('1', 'Act 1: Opening', 'Story begins'),
                createScene('2', 'Act 3: Ending', 'Story ends')
            ];
            const result = validateSceneProgression(scenes, mockStoryBible);
            
            const missingActWarning = result.warnings.find(w => w.errorType === 'missing_act');
            expect(missingActWarning?.suggestion).toBeDefined();
            expect(missingActWarning?.suggestion).toContain('Add scenes for Act 2');
        });

        it('should handle empty scene array', () => {
            const result = validateSceneProgression([], mockStoryBible);
            expect(result.isValid).toBe(true);
            expect(result.metadata.totalScenes).toBe(0);
        });
    });
});
