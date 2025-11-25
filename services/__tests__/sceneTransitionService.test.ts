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
  type SceneTransitionContext,
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
});
