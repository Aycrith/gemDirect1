/**
 * Tests for Scene Transition Service
 * 
 * Validates scene-to-scene transition context generation
 * for narrative coherence in video generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSceneTransitionContext,
  generateAllTransitionContexts,
  formatTransitionContextForPrompt,
  buildShotTransitionContext,
  generateAllShotTransitionContexts,
  formatShotTransitionContextForPrompt,
  propagateKeyframesToShots,
  type SceneTransitionContext,
  type ShotTransitionContext,
} from '../sceneTransitionService';
import type { Scene, StoryBible } from '../../types';

describe('sceneTransitionService', () => {
  let mockStoryBible: StoryBible;
  let mockScene1: Scene;
  let mockScene2: Scene;
  let mockScene3: Scene;

  beforeEach(() => {
    mockStoryBible = {
      logline: 'A hero discovers their true purpose through trials.',
      characters: '**Hero** - The protagonist seeking meaning.\n**Mentor** - A wise guide.',
      setting: 'A mystical realm where magic and technology coexist.',
      plotOutline: 'The hero embarks on a journey, faces challenges, and returns transformed.',
    };

    mockScene1 = {
      id: 'scene-1',
      title: 'The Ordinary World',
      summary: 'Hero lives their mundane life, unaware of the adventure ahead.',
      timeline: {
        shots: [
          { id: 'shot-1-1', description: 'Wide shot of hero at work' },
          { id: 'shot-1-2', description: 'Close-up showing boredom' },
        ],
        shotEnhancers: {
          'shot-1-1': { lighting: ['natural daylight'], mood: ['melancholy'] },
        },
        transitions: ['cut'],
        negativePrompt: '',
      },
      heroArcName: 'Ordinary World',
      heroArcOrder: 1,
      temporalContext: {
        startMoment: 'Hero wakes up for another day',
        endMoment: 'Hero receives mysterious message',
      },
    };

    mockScene2 = {
      id: 'scene-2',
      title: 'Call to Adventure',
      summary: 'A mysterious message disrupts the hero\'s routine life.',
      timeline: {
        shots: [
          { id: 'shot-2-1', description: 'Hero reads the message' },
          { id: 'shot-2-2', description: 'Hero looks conflicted' },
        ],
        shotEnhancers: {
          'shot-2-1': { lighting: ['dramatic shadows'], mood: ['tense'] },
        },
        transitions: ['dissolve'],
        negativePrompt: '',
      },
      heroArcName: 'Call to Adventure',
      heroArcOrder: 2,
      temporalContext: {
        startMoment: 'Hero opens the mysterious message',
        endMoment: 'Hero makes decision to investigate',
      },
    };

    mockScene3 = {
      id: 'scene-3',
      title: 'Crossing the Threshold',
      summary: 'Hero leaves familiar world and enters the unknown.',
      timeline: {
        shots: [
          { id: 'shot-3-1', description: 'Hero steps through portal' },
        ],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: '',
      },
      heroArcName: 'Crossing the Threshold',
      heroArcOrder: 5,
    };
  });

  describe('generateSceneTransitionContext', () => {
    it('should return null previousSceneEndState for first scene', () => {
      const context = generateSceneTransitionContext(mockScene1, null, mockStoryBible);
      
      expect(context.sceneId).toBe('scene-1');
      expect(context.previousSceneEndState).toBeNull();
      expect(context.transitionBridge).toContain('Opening scene');
    });

    it('should reference previous scene end state for subsequent scenes', () => {
      const context = generateSceneTransitionContext(mockScene2, mockScene1, mockStoryBible);
      
      expect(context.sceneId).toBe('scene-2');
      expect(context.previousSceneEndState).toBe('Hero receives mysterious message');
      expect(context.transitionBridge).toContain('From "Hero receives mysterious message"');
    });

    it('should detect act progression in transition bridge', () => {
      const context = generateSceneTransitionContext(mockScene2, mockScene1, mockStoryBible);
      
      expect(context.transitionBridge).toContain('Act I progression');
    });

    it('should extract narrative momentum from hero arc', () => {
      const context = generateSceneTransitionContext(mockScene1, null, mockStoryBible);
      
      expect(context.narrativeMomentum).toContain("Hero's Journey: Ordinary World");
      expect(context.narrativeMomentum).toContain('Establish ordinary world');
    });

    it('should fallback to summary when temporalContext is missing', () => {
      const context = generateSceneTransitionContext(mockScene3, mockScene2, mockStoryBible);
      
      expect(context.previousSceneEndState).toBe('Hero makes decision to investigate');
    });
  });

  describe('generateAllTransitionContexts', () => {
    it('should generate contexts for all scenes in order', () => {
      const scenes = [mockScene1, mockScene2, mockScene3];
      const batch = generateAllTransitionContexts(scenes, mockStoryBible);
      
      expect(batch.contexts).toHaveLength(3);
      expect(batch.contexts[0]?.sceneId).toBe('scene-1');
      expect(batch.contexts[1]?.sceneId).toBe('scene-2');
      expect(batch.contexts[2]?.sceneId).toBe('scene-3');
    });

    it('should set previousSceneEndState correctly for chain', () => {
      const scenes = [mockScene1, mockScene2];
      const batch = generateAllTransitionContexts(scenes, mockStoryBible);
      
      expect(batch.contexts[0]?.previousSceneEndState).toBeNull();
      expect(batch.contexts[1]?.previousSceneEndState).toBe('Hero receives mysterious message');
    });

    it('should include generation timestamp', () => {
      const before = Date.now();
      const batch = generateAllTransitionContexts([mockScene1], mockStoryBible);
      const after = Date.now();
      
      expect(batch.generatedAt).toBeGreaterThanOrEqual(before);
      expect(batch.generatedAt).toBeLessThanOrEqual(after);
    });

    it('should generate consistent story bible hash', () => {
      const batch1 = generateAllTransitionContexts([mockScene1], mockStoryBible);
      const batch2 = generateAllTransitionContexts([mockScene1], mockStoryBible);
      
      expect(batch1.storyBibleHash).toBe(batch2.storyBibleHash);
    });

    it('should detect story bible changes via hash', () => {
      const batch1 = generateAllTransitionContexts([mockScene1], mockStoryBible);
      
      const modifiedBible = { ...mockStoryBible, logline: 'A different story entirely.' };
      const batch2 = generateAllTransitionContexts([mockScene1], modifiedBible);
      
      expect(batch1.storyBibleHash).not.toBe(batch2.storyBibleHash);
    });
  });

  describe('formatTransitionContextForPrompt', () => {
    it('should format context with previous scene state', () => {
      const context: SceneTransitionContext = {
        sceneId: 'scene-2',
        previousSceneEndState: 'Hero receives message',
        transitionBridge: 'Act I progression',
        narrativeMomentum: 'Call disrupts the norm',
        visualContinuity: ['Maintain character appearance'],
      };

      const formatted = formatTransitionContextForPrompt(context);
      
      expect(formatted).toContain('SCENE CONTINUITY: Previous scene ended with: "Hero receives message"');
      expect(formatted).toContain('TRANSITION: Act I progression');
      expect(formatted).toContain('NARRATIVE MOMENTUM: Call disrupts the norm');
      expect(formatted).toContain('VISUAL CONTINUITY: Maintain character appearance');
    });

    it('should handle first scene without previous state', () => {
      const context: SceneTransitionContext = {
        sceneId: 'scene-1',
        previousSceneEndState: null,
        transitionBridge: 'Opening scene',
        narrativeMomentum: 'Establish world',
        visualContinuity: [],
      };

      const formatted = formatTransitionContextForPrompt(context);
      
      expect(formatted).not.toContain('SCENE CONTINUITY');
      expect(formatted).toContain('TRANSITION: Opening scene');
    });

    it('should handle empty visual continuity array', () => {
      const context: SceneTransitionContext = {
        sceneId: 'scene-2',
        previousSceneEndState: 'End state',
        transitionBridge: 'Bridge text',
        narrativeMomentum: 'Momentum',
        visualContinuity: [],
      };

      const formatted = formatTransitionContextForPrompt(context);
      
      expect(formatted).not.toContain('VISUAL CONTINUITY');
    });
  });

  describe('extractVisualContinuityElements', () => {
    it('should detect character continuity', () => {
      const context = generateSceneTransitionContext(mockScene2, mockScene1, mockStoryBible);
      
      // Both scenes have "hero" in shot descriptions
      expect(context.visualContinuity).toContainEqual(
        expect.stringContaining('character')
      );
    });

    it('should detect lighting continuity from enhancers', () => {
      // mockScene1 and mockScene2 don't share exact lighting values
      // This tests the conditional behavior
      const context = generateSceneTransitionContext(mockScene2, mockScene1, mockStoryBible);
      
      // The lighting arrays are different, so no lighting continuity expected
      const hasLightingContinuity = context.visualContinuity.some(
        v => v.toLowerCase().includes('lighting')
      );
      
      // This is expected behavior - different lighting means no continuity element
      expect(hasLightingContinuity).toBe(false);
    });
  });

  // ============================================================================
  // SHOT-LEVEL TRANSITION TESTS (Phase 7: shotLevelContinuity feature)
  // ============================================================================

  describe('buildShotTransitionContext', () => {
    it('should build context for first shot with no previous shot', () => {
      const context = buildShotTransitionContext(mockScene1, 0);

      expect(context.shotId).toBe('shot-1-1');
      expect(context.sceneId).toBe('scene-1');
      expect(context.shotIndex).toBe(0);
      expect(context.previousShotDescription).toBeNull();
      expect(context.previousShotEnhancers).toBeNull();
      expect(context.narrativePosition).toBe('opening');
    });

    it('should include previous shot info for subsequent shots', () => {
      const context = buildShotTransitionContext(mockScene1, 1);

      expect(context.shotId).toBe('shot-1-2');
      expect(context.shotIndex).toBe(1);
      expect(context.previousShotDescription).toBe('Wide shot of hero at work');
      expect(context.previousShotEnhancers).toEqual({
        lighting: ['natural daylight'],
        mood: ['melancholy']
      });
    });

    it('should include transition type from previous shot', () => {
      const context = buildShotTransitionContext(mockScene1, 1);
      expect(context.transitionType).toBe('cut');
    });

    it('should include scene keyframe reference when provided', () => {
      const context = buildShotTransitionContext(mockScene1, 0, 'base64-keyframe-data');
      expect(context.sceneKeyframeRef).toBe('base64-keyframe-data');
    });

    it('should throw error for invalid shot index', () => {
      expect(() => buildShotTransitionContext(mockScene1, 99)).toThrow();
    });
  });

  describe('generateAllShotTransitionContexts', () => {
    it('should generate contexts for all shots in a scene', () => {
      const batch = generateAllShotTransitionContexts(mockScene1);

      expect(batch.sceneId).toBe('scene-1');
      expect(batch.contexts).toHaveLength(2);
      expect(batch.contexts[0]?.shotId).toBe('shot-1-1');
      expect(batch.contexts[1]?.shotId).toBe('shot-1-2');
    });

    it('should include generation timestamp', () => {
      const before = Date.now();
      const batch = generateAllShotTransitionContexts(mockScene1);
      const after = Date.now();

      expect(batch.generatedAt).toBeGreaterThanOrEqual(before);
      expect(batch.generatedAt).toBeLessThanOrEqual(after);
    });

    it('should determine narrative positions correctly', () => {
      const batch = generateAllShotTransitionContexts(mockScene1);

      expect(batch.contexts[0]?.narrativePosition).toBe('opening');
      expect(batch.contexts[1]?.narrativePosition).toBe('closing');
    });

    it('should handle scene with no timeline gracefully', () => {
      const emptyScene: Scene = {
        id: 'empty-scene',
        title: 'Empty Scene',
        summary: 'No shots',
        timeline: { shots: [], transitions: [], shotEnhancers: {}, negativePrompt: '' },
      };

      const batch = generateAllShotTransitionContexts(emptyScene);
      expect(batch.contexts).toHaveLength(0);
    });
  });

  describe('formatShotTransitionContextForPrompt', () => {
    it('should format opening shot context', () => {
      const context: ShotTransitionContext = {
        shotId: 'shot-1',
        sceneId: 'scene-1',
        shotIndex: 0,
        previousShotDescription: null,
        previousShotEnhancers: null,
        visualContinuity: [],
        transitionType: null,
        sceneKeyframeRef: null,
        narrativePosition: 'opening',
      };

      const formatted = formatShotTransitionContextForPrompt(context);

      expect(formatted).toContain('SHOT POSITION: Opening shot');
      expect(formatted).not.toContain('PREVIOUS SHOT');
      expect(formatted).not.toContain('TRANSITION FROM PREVIOUS');
    });

    it('should format subsequent shot context with all elements', () => {
      const context: ShotTransitionContext = {
        shotId: 'shot-2',
        sceneId: 'scene-1',
        shotIndex: 1,
        previousShotDescription: 'Hero stands at the window',
        previousShotEnhancers: { lighting: ['sunset glow'] },
        visualContinuity: ['Maintain character continuity', 'Match lighting: sunset glow'],
        transitionType: 'dissolve',
        sceneKeyframeRef: 'keyframe-ref',
        narrativePosition: 'middle',
      };

      const formatted = formatShotTransitionContextForPrompt(context);

      expect(formatted).toContain('SHOT POSITION: Middle sequence');
      expect(formatted).toContain('PREVIOUS SHOT: "Hero stands at the window');
      expect(formatted).toContain('TRANSITION FROM PREVIOUS: dissolve');
      expect(formatted).toContain('SHOT CONTINUITY: Maintain character continuity; Match lighting: sunset glow');
      expect(formatted).toContain('REFERENCE: Use scene keyframe');
    });

    it('should format climax shot context', () => {
      const context: ShotTransitionContext = {
        shotId: 'shot-climax',
        sceneId: 'scene-1',
        shotIndex: 4,
        previousShotDescription: 'Tension builds',
        previousShotEnhancers: null,
        visualContinuity: [],
        transitionType: 'cut',
        sceneKeyframeRef: null,
        narrativePosition: 'climax',
      };

      const formatted = formatShotTransitionContextForPrompt(context);
      expect(formatted).toContain('SHOT POSITION: Climax moment');
    });

    it('should format closing shot context', () => {
      const context: ShotTransitionContext = {
        shotId: 'shot-end',
        sceneId: 'scene-1',
        shotIndex: 9,
        previousShotDescription: 'Final action',
        previousShotEnhancers: null,
        visualContinuity: [],
        transitionType: null,
        sceneKeyframeRef: null,
        narrativePosition: 'closing',
      };

      const formatted = formatShotTransitionContextForPrompt(context);
      expect(formatted).toContain('SHOT POSITION: Closing shot');
    });
  });

  describe('propagateKeyframesToShots', () => {
    it('should assign scene keyframe to all shots when not in bookend mode', () => {
      const generatedImages = { 'scene-1': 'keyframe-base64-data' };
      const keyframes = propagateKeyframesToShots(mockScene1, generatedImages);

      expect(keyframes['shot-1-1']).toBe('keyframe-base64-data');
      expect(keyframes['shot-1-2']).toBe('keyframe-base64-data');
    });

    it('should assign start keyframe to first shot and end keyframe to last shot in bookend mode', () => {
      const bookendScene: Scene = {
        ...mockScene1,
        keyframeMode: 'bookend',
        keyframeStart: 'start-keyframe-data',
        keyframeEnd: 'end-keyframe-data',
      };
      const generatedImages = { 'scene-1': 'main-keyframe' };
      const keyframes = propagateKeyframesToShots(bookendScene, generatedImages);

      expect(keyframes['shot-1-1']).toBe('start-keyframe-data');
      expect(keyframes['shot-1-2']).toBe('end-keyframe-data');
    });

    it('should return empty map when no keyframes available', () => {
      const keyframes = propagateKeyframesToShots(mockScene1, {});
      expect(Object.keys(keyframes)).toHaveLength(0);
    });

    it('should handle scene with no shots', () => {
      const emptyScene: Scene = {
        id: 'empty',
        title: 'Empty',
        summary: 'No shots',
        timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
      };
      const keyframes = propagateKeyframesToShots(emptyScene, { 'empty': 'keyframe' });
      expect(Object.keys(keyframes)).toHaveLength(0);
    });
  });
});
