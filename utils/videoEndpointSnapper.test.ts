/**
 * Tests for Video Endpoint Snapper
 * 
 * @module utils/videoEndpointSnapper.test
 */

import { describe, it, expect } from 'vitest';
import {
  isEndpointSnappingSupported,
  validateSnappingOptions,
  type EndpointSnappingOptions,
} from './videoEndpointSnapper';

describe('videoEndpointSnapper', () => {
  describe('isEndpointSnappingSupported', () => {
    it('should check for MediaRecorder support', () => {
      // This will depend on the test environment
      const result = isEndpointSnappingSupported();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('validateSnappingOptions', () => {
    it('should accept valid default options', () => {
      const options: EndpointSnappingOptions = {
        startFrameCount: 1,
        endFrameCount: 1,
        blendMode: 'hard',
      };
      const result = validateSnappingOptions(options, 48); // 2 second video at 24fps
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when startFrameCount exceeds 1/3 of video', () => {
      const options: EndpointSnappingOptions = {
        startFrameCount: 20,
        endFrameCount: 1,
        blendMode: 'hard',
      };
      const result = validateSnappingOptions(options, 48);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('startFrameCount');
    });

    it('should warn when endFrameCount exceeds 1/3 of video', () => {
      const options: EndpointSnappingOptions = {
        startFrameCount: 1,
        endFrameCount: 25,
        blendMode: 'hard',
      };
      const result = validateSnappingOptions(options, 48);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('endFrameCount');
    });

    it('should warn when fadeFrames exceeds replacement frame count', () => {
      const options: EndpointSnappingOptions = {
        startFrameCount: 2,
        endFrameCount: 2,
        blendMode: 'fade',
        fadeFrames: 5,
      };
      const result = validateSnappingOptions(options, 48);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('fadeFrames'))).toBe(true);
    });

    it('should not warn for valid fade options', () => {
      const options: EndpointSnappingOptions = {
        startFrameCount: 5,
        endFrameCount: 5,
        blendMode: 'fade',
        fadeFrames: 3,
      };
      const result = validateSnappingOptions(options, 48);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle empty options with defaults', () => {
      const result = validateSnappingOptions({}, 48);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle short videos gracefully', () => {
      const options: EndpointSnappingOptions = {
        startFrameCount: 5,
        endFrameCount: 5,
      };
      const result = validateSnappingOptions(options, 12); // Very short video
      expect(result.valid).toBe(true);
      // Should warn that frame counts will be clamped
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('WorkflowPostProcessingOptions integration', () => {
    it('should have compatible type structure with EndpointSnappingOptions', () => {
      // This test validates that the types are aligned
      const workflowOptions = {
        snapEndpointsToKeyframes: true,
        startFrameCount: 1,
        endFrameCount: 1,
        blendMode: 'hard' as const,
        fadeFrames: 3,
      };

      // The workflow options should be usable as snapping options
      const snappingOptions: EndpointSnappingOptions = {
        startFrameCount: workflowOptions.startFrameCount,
        endFrameCount: workflowOptions.endFrameCount,
        blendMode: workflowOptions.blendMode,
        fadeFrames: workflowOptions.fadeFrames,
      };

      expect(snappingOptions.startFrameCount).toBe(1);
      expect(snappingOptions.blendMode).toBe('hard');
    });
  });
});

// Note: Full integration tests for snapEndpointsToKeyframes would require:
// 1. A test video blob
// 2. Test keyframe images
// 3. Browser APIs (MediaRecorder, canvas, video element)
// These would be covered by E2E/Playwright tests rather than unit tests
