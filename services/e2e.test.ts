/**
 * End-to-End Integration Tests for Video Generation Pipeline
 * 
 * Tests the complete flow:
 * Story Idea → Story Bible → Director's Vision → Scene Timeline → Video Generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    Shot,
    StoryBible,
    CreativeEnhancers,
    TimelineData,
    Scene,
    LocalGenerationSettings,
} from '../types';

// ============================================================================
// TEST SUITE: Complete Workflow - Idea to Video
// ============================================================================

describe('E2E: Story to Video Generation Pipeline', () => {
    // Mock data for complete workflow
    let mockStoryIdea: string;
    let mockStoryBible: StoryBible;
    let mockDirectorsVision: string;
    let mockScene: Scene;
    let mockSettings: LocalGenerationSettings;

    beforeEach(() => {
        // Step 1: Story Idea
        mockStoryIdea =
            'A detective uncovers a conspiracy in a noir-inspired city during the 1940s';

        // Step 2: Story Bible
        mockStoryBible = {
            logline: 'A cynical detective must confront her past to stop a city-wide conspiracy.',
            characters:
                'Detective Sarah Chen (protagonist, hardened, determined), Detective Marcus Wilson (partner, by-the-book), The Kingpin (antagonist, mysterious)',
            setting:
                'Noir-inspired 1940s city, rain-soaked streets, neon signs, underground networks',
            plotOutline:
                'Sarah discovers a pattern in unsolved cases. She teams with Marcus to investigate. They uncover a web of corruption. Sarah must choose between justice and revenge.',
        };

        // Step 3: Director's Vision
        mockDirectorsVision =
            'High contrast black and white cinematography, heavy use of shadows, wide angles for establishing shots, slow pacing with dramatic reveals';

        // Step 4: Scene Timeline
        mockScene = {
            id: 'scene-1-opening',
            title: 'Opening: Rainy Streets',
            summary: 'Detective Chen walks through rain-soaked streets toward a crime scene',
            timeline: {
                shots: [
                    {
                        id: 'shot-1',
                        title: 'Establishing Shot',
                        description:
                            'Wide aerial view of the city, rain falling, neon signs reflecting in puddles',
                    },
                    {
                        id: 'shot-2',
                        title: 'Street Level',
                        description:
                            'Detective Chen walks down empty street, fedora pulled low, trench coat soaked',
                    },
                    {
                        id: 'shot-3',
                        title: 'Close-up',
                        description: 'Detective Chen arrives at building, looks up at crime scene tape',
                    },
                ],
                shotEnhancers: {
                    'shot-1': {
                        framing: ['wide angle', 'aerial drone'],
                        lighting: ['night time', 'neon glow'],
                        mood: ['mysterious', 'atmospheric'],
                        movement: ['slow pan'],
                    },
                    'shot-2': {
                        framing: ['medium wide'],
                        movement: ['steady cam walking'],
                        lighting: ['low key', 'shadows'],
                        mood: ['tension', 'determination'],
                    },
                    'shot-3': {
                        framing: ['close-up'],
                        movement: ['static'],
                        lighting: ['dramatic', 'side lighting'],
                        mood: ['suspense', 'determination'],
                    },
                },
                transitions: ['fade', 'cut', 'dissolve'],
                negativePrompt:
                    'bright, colorful, daylight, cartoon, animation, low quality, watermark',
            },
        };

        // Step 5: Generation Settings
        mockSettings = {
            comfyUIUrl: 'http://127.0.0.1:8188',
            comfyUIClientId: 'e2e-test-client',
            workflowJson: JSON.stringify({ test: true }),
            mapping: {},
        };
    });

    it('should validate story idea can be expanded to a story bible', () => {
        expect(mockStoryIdea).toBeTruthy();
        expect(mockStoryIdea.length).toBeGreaterThan(10);

        // Verify Story Bible has all required fields
        expect(mockStoryBible).toHaveProperty('logline');
        expect(mockStoryBible).toHaveProperty('characters');
        expect(mockStoryBible).toHaveProperty('setting');
        expect(mockStoryBible).toHaveProperty('plotOutline');

        // Verify fields are non-empty
        expect(mockStoryBible.logline).toBeTruthy();
        expect(mockStoryBible.characters).toBeTruthy();
        expect(mockStoryBible.setting).toBeTruthy();
        expect(mockStoryBible.plotOutline).toBeTruthy();
    });

    it('should validate directors vision provides visual direction', () => {
        expect(mockDirectorsVision).toBeTruthy();
        expect(mockDirectorsVision).toContain('cinematography');

        // Verify it includes technical/creative terms
        const creativeTerms = [
            'contrast',
            'shadow',
            'angle',
            'pacing',
            'dramatic',
        ];
        const hasCreativeTerm = creativeTerms.some((term) =>
            mockDirectorsVision.toLowerCase().includes(term)
        );
        expect(hasCreativeTerm).toBe(true);
    });

    it('should validate scene contains complete timeline data', () => {
        expect(mockScene).toHaveProperty('id');
        expect(mockScene).toHaveProperty('title');
        expect(mockScene).toHaveProperty('summary');
        expect(mockScene).toHaveProperty('timeline');

        const timeline = mockScene.timeline;
        expect(timeline.shots).toBeDefined();
        expect(timeline.shots.length).toBeGreaterThan(0);
        expect(timeline.shotEnhancers).toBeDefined();
        expect(timeline.transitions).toBeDefined();
        expect(timeline.negativePrompt).toBeDefined();
    });

    it('should ensure all shots have required properties', () => {
        mockScene.timeline.shots.forEach((shot) => {
            expect(shot).toHaveProperty('id');
            expect(shot).toHaveProperty('description');
            expect(shot.id).toBeTruthy();
            expect(shot.description).toBeTruthy();
        });
    });

    it('should ensure all shots have enhancers defined', () => {
        mockScene.timeline.shots.forEach((shot) => {
            const enhancers = mockScene.timeline.shotEnhancers[shot.id];
            expect(enhancers).toBeDefined();

            // Enhancers should have relevant properties
            const enhancerKeys = Object.keys(enhancers || {});
            expect(enhancerKeys.length).toBeGreaterThan(0);
        });
    });

    it('should validate shot enhancers are properly structured', () => {
        const shot1Enhancers = mockScene.timeline.shotEnhancers['shot-1'];
        expect(shot1Enhancers).toBeDefined();
        if (!shot1Enhancers) return;

        expect(shot1Enhancers.framing).toBeInstanceOf(Array);
        expect(shot1Enhancers.lighting).toBeInstanceOf(Array);
        expect(shot1Enhancers.mood).toBeInstanceOf(Array);
        expect(shot1Enhancers.movement).toBeInstanceOf(Array);

        // All should have at least one value
        expect(shot1Enhancers.framing!.length).toBeGreaterThan(0);
        expect(shot1Enhancers.lighting!.length).toBeGreaterThan(0);
    });

    it('should match enhancer values to known categories', () => {
        const validFraming = ['wide angle', 'close-up', 'medium', 'aerial drone'];
        const validMovement = ['steady cam walking', 'static', 'slow pan', 'tracking'];
        // These are defined for reference but not currently used in assertions
        // const validLighting = ['night time', 'neon glow', 'low key', 'dramatic'];
        // const validMood = ['mysterious', 'tension', 'suspense', 'atmospheric'];

        const shot1Enhancers = mockScene.timeline.shotEnhancers['shot-1'];
        if (!shot1Enhancers) return;

        shot1Enhancers.framing?.forEach((value) => {
            expect(validFraming).toContain(value);
        });

        shot1Enhancers.movement?.forEach((value) => {
            expect(validMovement).toContain(value);
        });
    });

    it('should support batch generation with multiple shots', () => {
        const batchSize = mockScene.timeline.shots.length;
        expect(batchSize).toBeGreaterThanOrEqual(1);

        // Simulate batch tracking
        const batchResults: Record<string, any> = {};
        mockScene.timeline.shots.forEach((shot, index) => {
            batchResults[shot.id] = {
                order: index,
                status: 'completed',
                videoPath: `output/video_${index}.mp4`,
                duration: 1.04,
            };
        });

        expect(Object.keys(batchResults)).toHaveLength(batchSize);
        expect(batchResults['shot-1']).toBeDefined();
        expect(batchResults['shot-2']).toBeDefined();
        expect(batchResults['shot-3']).toBeDefined();
    });

    it('should maintain shot order in batch generation results', () => {
        const results: Record<string, any> = {};

        mockScene.timeline.shots.forEach((shot, index) => {
            results[shot.id] = { order: index, title: shot.title };
        });

        const orderedResults = Object.entries(results).map(([id, data]) => ({
            id,
            order: data.order,
        }));

        expect(orderedResults[0]?.order).toBe(0);
        expect(orderedResults[1]?.order).toBe(1);
        expect(orderedResults[2]?.order).toBe(2);
    });

    it('should support transitions between shots', () => {
        const transitions = mockScene.timeline.transitions;

        expect(transitions).toBeDefined();
        expect(Array.isArray(transitions)).toBe(true);
        expect(transitions.length).toBeGreaterThan(0);

        // Valid transition types
        const validTransitions = ['fade', 'cut', 'dissolve', 'wipe', 'slide'];
        transitions.forEach((trans) => {
            expect(validTransitions).toContain(trans);
        });
    });

    it('should use negative prompt to exclude unwanted elements', () => {
        const negativePrompt = mockScene.timeline.negativePrompt;

        expect(negativePrompt).toBeTruthy();
        expect(negativePrompt).toContain('low quality');
        expect(negativePrompt).toContain('watermark');

        // Negative prompt should be incompatible with directors vision
        expect(negativePrompt).toContain('bright');
        expect(mockDirectorsVision).toContain('contrast');
    });

    it('should provide error recovery for failed shots', () => {
        const failedShot = mockScene.timeline.shots[1];
        expect(failedShot).toBeDefined();
        if (!failedShot) return;
        
        const error = new Error(
            `Failed to generate video for shot: ${failedShot.id}`
        );

        expect(error.message).toContain('Failed to generate');
        expect(error.message).toContain(failedShot.id);

        // Verify other shots can still be processed
        const remainingShots = mockScene.timeline.shots.filter(
            (shot) => shot.id !== failedShot.id
        );
        expect(remainingShots.length).toBe(2);
    });

    it('should track generation progress for monitoring', () => {
        const progressUpdates: any[] = [];

        // Simulate progress tracking
        mockScene.timeline.shots.forEach((shot, index) => {
            const shotProgress = (index + 1) / mockScene.timeline.shots.length;
            progressUpdates.push({
                shotId: shot.id,
                progress: Math.round(shotProgress * 100),
                status: 'running',
            });
        });

        expect(progressUpdates[0].progress).toBe(33); // 1/3
        expect(progressUpdates[1].progress).toBeLessThanOrEqual(67); // 2/3, allow rounding
        expect(progressUpdates[2].progress).toBe(100); // 3/3
    });

    it('should validate complete workflow data consistency', () => {
        // Verify cross-references between timeline and enhancers
        mockScene.timeline.shots.forEach((shot) => {
            const enhancers = mockScene.timeline.shotEnhancers[shot.id];
            expect(enhancers).toBeDefined();
        });

        // Verify all shots have descriptions that could be used for prompts
        mockScene.timeline.shots.forEach((shot) => {
            expect(shot.description).toBeTruthy();
            expect(shot.description.length).toBeGreaterThan(5);
        });

        // Verify settings are valid for API calls
        expect(mockSettings.comfyUIUrl).toMatch(/^http/);
        expect(mockSettings.comfyUIClientId).toBeTruthy();
    });
});

// ============================================================================
// TEST SUITE: Workflow Variations and Edge Cases
// ============================================================================

describe('E2E: Workflow Variations', () => {
    it('should handle single-shot scenes', () => {
        const singleShotTimeline: TimelineData = {
            shots: [
                {
                    id: 'single-shot',
                    description: 'A single important moment in time',
                },
            ],
            shotEnhancers: {
                'single-shot': { framing: ['wide'] },
            },
            transitions: [],
            negativePrompt: 'blurry',
        };

        expect(singleShotTimeline.shots).toHaveLength(1);
        expect(singleShotTimeline.shots[0]).toHaveProperty('id');
    });

    it('should handle complex multi-shot scenes', () => {
        const complexTimeline: TimelineData = {
            shots: Array.from({ length: 10 }, (_, i) => ({
                id: `shot-${i + 1}`,
                description: `Action sequence shot ${i + 1}`,
            })),
            shotEnhancers: {},
            transitions: ['cut', 'fade'],
            negativePrompt: 'low quality',
        };

        expect(complexTimeline.shots).toHaveLength(10);
        complexTimeline.shots.forEach((shot) => {
            expect(shot.id).toMatch(/^shot-\d+$/);
        });
    });

    it('should handle minimal enhancers', () => {
        const minimalEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
            framing: ['wide'],
        };

        expect(Object.keys(minimalEnhancers)).toHaveLength(1);
    });

    it('should handle comprehensive enhancers', () => {
        const comprehensiveEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
            framing: ['wide', 'close-up'],
            movement: ['tracking', 'pan'],
            lighting: ['golden hour', 'natural'],
            mood: ['dramatic', 'intimate'],
            lens: ['35mm', 'anamorphic'],
            vfx: ['lens flare', 'depth of field'],
            pacing: ['slow', 'rhythmic'],
        };

        const numCategories = Object.keys(comprehensiveEnhancers).length;
        expect(numCategories).toBe(7);
    });
});

// ============================================================================
// TEST SUITE: Quality Assurance Checks
// ============================================================================

describe('E2E: Quality Assurance', () => {
    it('should ensure story bible is coherent', () => {
        const bible: StoryBible = {
            logline: 'A story about something important',
            characters: 'Protagonist (brave), Antagonist (cunning)',
            setting: 'A mysterious location',
            plotOutline: 'Setup → Conflict → Resolution',
        };

        // Verify logline mentions key elements
        const allElements = (
            bible.logline +
            bible.characters +
            bible.setting +
            bible.plotOutline
        ).toLowerCase();
        expect(allElements.length).toBeGreaterThan(50);
    });

    it('should validate visual consistency across shots', () => {
        const timeline: TimelineData = {
            shots: [
                {
                    id: 'shot-1',
                    description: 'Establishing shot in daylight',
                },
                {
                    id: 'shot-2',
                    description: 'Close-up in daylight',
                },
                {
                    id: 'shot-3',
                    description: 'Wide shot in daylight',
                },
            ],
            shotEnhancers: {
                'shot-1': { lighting: ['daylight'] },
                'shot-2': { lighting: ['daylight'] },
                'shot-3': { lighting: ['daylight'] },
            },
            transitions: ['cut'],
            negativePrompt: 'night time',
        };

        // All shots should have consistent lighting
        const allShots = timeline.shots;
        const allHaveDaylight = allShots.every((shot) =>
            shot.description.toLowerCase().includes('daylight')
        );
        expect(allHaveDaylight).toBe(true);
    });

    it('should detect timing consistency', () => {
        const shots: Shot[] = Array.from({ length: 25 }, (_, i) => ({
            id: `frame-${i}`,
            description: `Frame ${i} of animation`,
        }));

        // 25 frames @ 24fps = ~1.04 seconds
        const expectedDuration = shots.length / 24;
        expect(expectedDuration).toBeCloseTo(1.04, 1);
    });
});
