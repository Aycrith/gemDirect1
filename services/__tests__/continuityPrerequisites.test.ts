/**
 * Continuity Prerequisites Service Tests
 * 
 * Tests for the service that validates prerequisites before accessing
 * the Continuity Review page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateContinuityPrerequisites,
  getPrerequisiteSummary,
  groupMissingItemsByScene,
  type ContinuityPrerequisites,
} from '../continuityPrerequisites';
import type { Scene, TimelineData, Shot } from '../../types';

describe('continuityPrerequisites', () => {
  
  // Suppress console.log during tests
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  // Helper to create a valid shot
  function createShot(id: string, description: string = 'Test shot'): Shot {
    return {
      id,
      description,
      title: 'Shot Title',
      purpose: 'To test',
    };
  }
  
  // Helper to create a valid timeline
  function createTimeline(shots: Shot[] = [createShot('shot-1')]): TimelineData {
    return {
      shots,
      shotEnhancers: {},
      transitions: [],
      negativePrompt: ''
    };
  }
  
  // Helper to create a valid scene
  function createScene(id: string, title: string, timeline?: TimelineData): Scene {
    return {
      id,
      title,
      summary: 'Test scene summary',
      timeline: timeline ?? createTimeline()
    };
  }
  
  // Helper to create keyframe data (base64 image string)
  function createKeyframeData(): string {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
  
  describe('validateContinuityPrerequisites', () => {
    
    describe('with no scenes', () => {
      it('should fail with no scenes message', () => {
        const result = validateContinuityPrerequisites([], {});
        
        expect(result.canProceed).toBe(false);
        expect(result.hasScenes).toBe(false);
        expect(result.missingItems).toHaveLength(1);
        expect(result.missingItems[0]!.type).toBe('scenes');
        expect(result.missingItems[0]!.severity).toBe('error');
      });
      
      it('should suggest going to Director Mode', () => {
        const result = validateContinuityPrerequisites([], {});
        
        expect(result.missingItems[0]!.actionRoute).toBe('director');
        expect(result.missingItems[0]!.actionLabel).toContain('Director');
      });
    });
    
    describe('with scenes missing timelines', () => {
      it('should fail when scene has no timeline', () => {
        const scene = createScene('scene-1', 'Opening Scene');
        scene.timeline = undefined as unknown as TimelineData;
        
        const result = validateContinuityPrerequisites([scene], {});
        
        expect(result.canProceed).toBe(false);
        expect(result.hasTimelines).toBe(false);
        expect(result.missingItems.some(item => item.type === 'timeline')).toBe(true);
      });
      
      it('should fail when scene timeline has no shots', () => {
        const scene = createScene('scene-1', 'Opening Scene', createTimeline([]));
        
        const result = validateContinuityPrerequisites([scene], {});
        
        expect(result.canProceed).toBe(false);
        expect(result.hasTimelines).toBe(false);
        expect(result.missingItems.some(item => item.type === 'timeline')).toBe(true);
      });
      
      it('should include scene title and number in error message', () => {
        const scene = createScene('scene-1', 'The Beginning');
        scene.timeline = createTimeline([]);
        
        const result = validateContinuityPrerequisites([scene], {});
        
        const timelineError = result.missingItems.find(item => item.type === 'timeline');
        expect(timelineError?.message).toContain('Scene 1');
        expect(timelineError?.message).toContain('The Beginning');
      });
    });
    
    describe('with scenes missing keyframes', () => {
      it('should warn when scene has no keyframe', () => {
        const scene = createScene('scene-1', 'Opening Scene');
        
        const result = validateContinuityPrerequisites([scene], {});
        
        expect(result.hasKeyframes).toBe(false);
        expect(result.missingItems.some(item => 
          item.type === 'keyframe' && item.severity === 'warning'
        )).toBe(true);
      });
      
      it('should still allow proceeding when only keyframes are missing', () => {
        const scene = createScene('scene-1', 'Opening Scene');
        
        const result = validateContinuityPrerequisites([scene], {});
        
        // Keyframes are warnings, not errors
        expect(result.canProceed).toBe(true);
      });
    });
    
    describe('with all prerequisites met', () => {
      it('should pass when all scenes have timelines and keyframes', () => {
        const scene1 = createScene('scene-1', 'Opening');
        const scene2 = createScene('scene-2', 'Climax');
        
        const generatedImages = {
          'scene-1': createKeyframeData(),
          'scene-2': createKeyframeData()
        };
        
        const result = validateContinuityPrerequisites([scene1, scene2], generatedImages);
        
        expect(result.canProceed).toBe(true);
        expect(result.hasScenes).toBe(true);
        expect(result.hasTimelines).toBe(true);
        expect(result.hasKeyframes).toBe(true);
      });
      
      it('should have no errors when all prerequisites met', () => {
        const scene = createScene('scene-1', 'Opening');
        const generatedImages = { 'scene-1': createKeyframeData() };
        
        const result = validateContinuityPrerequisites([scene], generatedImages);
        
        const errors = result.missingItems.filter(item => item.severity === 'error');
        expect(errors).toHaveLength(0);
      });
    });
    
    describe('summary counts', () => {
      it('should track total scenes', () => {
        const scenes = [
          createScene('s1', 'Scene 1'),
          createScene('s2', 'Scene 2'),
          createScene('s3', 'Scene 3')
        ];
        
        const result = validateContinuityPrerequisites(scenes, {});
        
        expect(result.summary.totalScenes).toBe(3);
      });
      
      it('should track scenes with timelines', () => {
        const scene1 = createScene('s1', 'Scene 1');
        const scene2 = createScene('s2', 'Scene 2', createTimeline([])); // No shots
        
        const result = validateContinuityPrerequisites([scene1, scene2], {});
        
        expect(result.summary.scenesWithTimelines).toBe(1);
      });
      
      it('should track scenes with keyframes', () => {
        const scene1 = createScene('s1', 'Scene 1');
        const scene2 = createScene('s2', 'Scene 2');
        
        const generatedImages = {
          's1': createKeyframeData()
          // s2 has no keyframe
        };
        
        const result = validateContinuityPrerequisites([scene1, scene2], generatedImages);
        
        expect(result.summary.scenesWithKeyframes).toBe(1);
      });
    });
    
    describe('enhancer tracking', () => {
      it('should detect scenes with enhancers', () => {
        const scene = createScene('s1', 'Scene 1');
        scene.timeline!.shots = [createShot('shot-1')];
        scene.timeline!.shotEnhancers = {
          'shot-1': {
            framing: ['wide shot'],
            movement: ['tracking']
          }
        };
        
        const result = validateContinuityPrerequisites([scene], { 's1': createKeyframeData() });
        
        expect(result.summary.scenesWithEnhancers).toBe(1);
        expect(result.hasEnhancers).toBe(true);
      });
      
      it('should not count empty enhancers', () => {
        const scene = createScene('s1', 'Scene 1');
        scene.timeline!.shots = [createShot('shot-1')];
        scene.timeline!.shotEnhancers = {
          'shot-1': {
            framing: [],  // Empty array
            movement: []
          }
        };
        
        const result = validateContinuityPrerequisites([scene], { 's1': createKeyframeData() });
        
        expect(result.summary.scenesWithEnhancers).toBe(0);
        expect(result.hasEnhancers).toBe(false);
      });
    });
  });
  
  describe('getPrerequisiteSummary', () => {
    it('should return success message when can proceed', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: true,
        hasScenes: true,
        hasTimelines: true,
        hasKeyframes: true,
        hasEnhancers: true,
        missingItems: [],
        summary: { totalScenes: 1, scenesWithTimelines: 1, scenesWithKeyframes: 1, scenesWithEnhancers: 1 }
      };
      
      const summary = getPrerequisiteSummary(prerequisites);
      
      expect(summary).toContain('All prerequisites met');
      expect(summary).toContain('Ready for Continuity Review');
    });
    
    it('should mention error count when there are errors', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,
        hasScenes: false,
        hasTimelines: false,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'scenes', message: 'No scenes', severity: 'error' },
          { type: 'timeline', sceneId: 's1', message: 'No timeline', severity: 'error' }
        ],
        summary: { totalScenes: 0, scenesWithTimelines: 0, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const summary = getPrerequisiteSummary(prerequisites);
      
      expect(summary).toContain('2 required item(s) missing');
    });
    
    it('should mention warning count when there are warnings but cannot proceed', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,  // Cannot proceed
        hasScenes: true,
        hasTimelines: true,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'keyframe', sceneId: 's1', message: 'No keyframe', severity: 'warning' }
        ],
        summary: { totalScenes: 1, scenesWithTimelines: 1, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const summary = getPrerequisiteSummary(prerequisites);
      
      expect(summary).toContain('1 recommended item(s) missing');
    });
    
    it('should suggest Director Mode when cannot proceed', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,
        hasScenes: false,
        hasTimelines: false,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'scenes', message: 'No scenes', severity: 'error' }
        ],
        summary: { totalScenes: 0, scenesWithTimelines: 0, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const summary = getPrerequisiteSummary(prerequisites);
      
      expect(summary).toContain('Director Mode');
    });
  });
  
  describe('groupMissingItemsByScene', () => {
    it('should group general items under "general" key', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,
        hasScenes: false,
        hasTimelines: false,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'scenes', message: 'No scenes', severity: 'error' }
        ],
        summary: { totalScenes: 0, scenesWithTimelines: 0, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const grouped = groupMissingItemsByScene(prerequisites);
      
      expect(grouped['general']).toHaveLength(1);
      expect(grouped['general']![0]!.type).toBe('scenes');
    });
    
    it('should group scene-specific items by scene ID', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,
        hasScenes: true,
        hasTimelines: false,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'timeline', sceneId: 'scene-1', message: 'No timeline', severity: 'error' },
          { type: 'keyframe', sceneId: 'scene-1', message: 'No keyframe', severity: 'warning' },
          { type: 'timeline', sceneId: 'scene-2', message: 'No timeline', severity: 'error' }
        ],
        summary: { totalScenes: 2, scenesWithTimelines: 0, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const grouped = groupMissingItemsByScene(prerequisites);
      
      expect(grouped['scene-1']).toHaveLength(2);
      expect(grouped['scene-2']).toHaveLength(1);
      expect(grouped['general']).toHaveLength(0);
    });
    
    it('should handle mixed general and scene-specific items', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,
        hasScenes: true,
        hasTimelines: false,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'scenes', message: 'Some general issue', severity: 'error' },
          { type: 'timeline', sceneId: 'scene-1', message: 'No timeline', severity: 'error' }
        ],
        summary: { totalScenes: 1, scenesWithTimelines: 0, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const grouped = groupMissingItemsByScene(prerequisites);
      
      expect(grouped['general']).toHaveLength(1);
      expect(grouped['scene-1']).toHaveLength(1);
    });
    
    it('should return empty general array when all items are scene-specific', () => {
      const prerequisites: ContinuityPrerequisites = {
        canProceed: false,
        hasScenes: true,
        hasTimelines: false,
        hasKeyframes: false,
        hasEnhancers: false,
        missingItems: [
          { type: 'timeline', sceneId: 'scene-1', message: 'No timeline', severity: 'error' }
        ],
        summary: { totalScenes: 1, scenesWithTimelines: 0, scenesWithKeyframes: 0, scenesWithEnhancers: 0 }
      };
      
      const grouped = groupMissingItemsByScene(prerequisites);
      
      expect(grouped['general']).toHaveLength(0);
    });
  });
});
