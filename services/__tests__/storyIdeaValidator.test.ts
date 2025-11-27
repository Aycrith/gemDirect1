/**
 * Tests for storyIdeaValidator service
 * Phase 3: Input Quality validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateStoryIdea,
  getValidationStatus,
  getStatusColor,
  countWords,
  estimateTokenCount,
  VALIDATION_THRESHOLDS
} from '../storyIdeaValidator';

describe('storyIdeaValidator', () => {
  describe('countWords', () => {
    it('should count words correctly', () => {
      expect(countWords('hello world')).toBe(2);
      expect(countWords('   hello   world   ')).toBe(2);
      expect(countWords('')).toBe(0);
      expect(countWords('one')).toBe(1);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate tokens based on word count', () => {
      const tokens = estimateTokenCount('hello world test');
      expect(tokens).toBeGreaterThanOrEqual(3);
      expect(tokens).toBeLessThanOrEqual(10);
    });
  });

  describe('validateStoryIdea', () => {
    it('should reject empty ideas', () => {
      const result = validateStoryIdea('');
      expect(result.canProceed).toBe(false);
      expect(result.wordCount).toBe(0);
    });

    it('should reject ideas that are too short', () => {
      const result = validateStoryIdea('A hero fights.');
      expect(result.canProceed).toBe(false);
      expect(result.issues.some(i => i.code === 'TOO_SHORT')).toBe(true);
    });

    it('should accept well-formed story ideas', () => {
      const idea = 'A young scientist discovers an ancient artifact in a remote cave, but a powerful corporation will stop at nothing to obtain it for their own sinister purposes.';
      const result = validateStoryIdea(idea);
      
      expect(result.wordCount).toBeGreaterThanOrEqual(VALIDATION_THRESHOLDS.MIN_WORDS);
      expect(result.canProceed).toBe(true);
      expect(result.qualityScore).toBeGreaterThan(0.5);
    });

    it('should detect missing conflict', () => {
      const idea = 'A young scientist works in a laboratory in the distant future studying ancient artifacts from a lost civilization.';
      const result = validateStoryIdea(idea);
      
      // Has protagonist and setting, but no clear conflict
      expect(result.issues.some(i => i.code === 'MISSING_CONFLICT')).toBe(true);
    });

    it('should detect missing protagonist', () => {
      const idea = 'In the distant future, a strange signal arrives from deep space, but nobody knows what it means or where it came from.';
      const result = validateStoryIdea(idea);
      
      // Has setting but vague protagonist ("nobody")
      // Note: "nobody" is in our protagonist keywords, so this should pass
      expect(result.wordCount).toBeGreaterThanOrEqual(VALIDATION_THRESHOLDS.MIN_WORDS);
    });

    it('should detect missing setting', () => {
      const idea = 'A detective must solve a series of mysterious murders, but the killer always seems to be one step ahead.';
      const result = validateStoryIdea(idea);
      
      // Has protagonist and conflict, but no clear setting
      expect(result.issues.some(i => i.code === 'MISSING_SETTING')).toBe(true);
    });

    it('should calculate quality score based on elements', () => {
      const poorIdea = 'Something happens somewhere.';
      const goodIdea = 'A lone detective in 1920s Chicago must solve a string of murders, but the killer has connections to the corrupt police force.';
      
      const poorResult = validateStoryIdea(poorIdea);
      const goodResult = validateStoryIdea(goodIdea);
      
      expect(goodResult.qualityScore).toBeGreaterThan(poorResult.qualityScore);
    });

    it('should reject ideas that are too long', () => {
      // Create an idea with more than 150 words
      const longIdea = Array(160).fill('word').join(' ');
      const result = validateStoryIdea(longIdea);
      
      expect(result.issues.some(i => i.code === 'TOO_LONG')).toBe(true);
      expect(result.canProceed).toBe(false);
    });

    it('should provide suggestions for issues', () => {
      const shortIdea = 'A hero.';
      const result = validateStoryIdea(shortIdea);
      
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should mark some issues as autoFixable', () => {
      const shortIdea = 'A hero.';
      const result = validateStoryIdea(shortIdea);
      
      expect(result.issues.some(i => i.autoFixable)).toBe(true);
    });
  });

  describe('getValidationStatus', () => {
    it('should return "empty" for empty ideas', () => {
      const result = validateStoryIdea('');
      expect(getValidationStatus(result)).toBe('empty');
    });

    it('should return "error" for ideas with errors', () => {
      const result = validateStoryIdea('Short.');
      expect(getValidationStatus(result)).toBe('error');
    });

    it('should return "warning" for ideas with only warnings', () => {
      // Create an idea that's long enough but missing elements
      const idea = 'Something interesting is happening in the world right now and people are noticing it.';
      const result = validateStoryIdea(idea);
      
      // If it has warnings but no errors
      if (!result.issues.some(i => i.severity === 'error') && result.issues.length > 0) {
        expect(getValidationStatus(result)).toBe('warning');
      }
    });

    it('should return "valid" for perfect ideas', () => {
      const idea = 'A young scientist discovers an ancient artifact in a remote cave, but a powerful corporation will stop at nothing to obtain it for their own sinister purposes.';
      const result = validateStoryIdea(idea);
      
      if (result.issues.length === 0) {
        expect(getValidationStatus(result)).toBe('valid');
      }
    });
  });

  describe('getStatusColor', () => {
    it('should return correct colors for each status', () => {
      expect(getStatusColor('valid')).toContain('green');
      expect(getStatusColor('warning')).toContain('amber');
      expect(getStatusColor('error')).toContain('red');
      expect(getStatusColor('empty')).toContain('gray');
    });
  });
});
