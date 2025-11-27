/**
 * Story Idea Enhancer Tests
 * 
 * Tests for the story idea enhancement service that improves user ideas
 * to meet validation requirements.
 */

import { describe, it, expect } from 'vitest';
import {
  buildEnhancementPrompt,
  parseEnhancementResponse,
  isEnhancementBetter,
  applyLocalFixes,
  generateFallbackEnhancement,
  validateEnhancement,
  createEnhancementResult,
  DEFAULT_ENHANCEMENT_CONFIG,
  type EnhancementConfig
} from '../storyIdeaEnhancer';
import { validateStoryIdea } from '../storyIdeaValidator';

describe('storyIdeaEnhancer', () => {
  
  // Helper to create mock validation with specific issues
  function createMockValidation(issueCodes: string[]): ReturnType<typeof validateStoryIdea> {
    return {
      valid: false,
      issues: issueCodes.map(code => ({
        code: code as any,
        message: `Mock ${code}`,
        severity: 'error' as const,
        autoFixable: true
      })),
      suggestions: [],
      qualityScore: 0.2,
      canProceed: false,
      wordCount: 3,
      estimatedTokens: 5
    };
  }
  
  describe('buildEnhancementPrompt', () => {
    it('should create a prompt with original idea', () => {
      const idea = 'A robot learns to feel';
      const validation = validateStoryIdea(idea);
      
      const prompt = buildEnhancementPrompt(idea, validation);
      
      expect(prompt).toContain('ORIGINAL IDEA:');
      expect(prompt).toContain(idea);
      expect(prompt).toContain('REQUIREMENTS:');
      expect(prompt).toContain('CONSTRAINTS:');
    });
    
    it('should add word count expansion requirement for short ideas', () => {
      const idea = 'Robot feels';
      const validation = validateStoryIdea(idea);
      
      const prompt = buildEnhancementPrompt(idea, validation);
      
      expect(prompt).toContain('Expand the idea');
      expect(prompt).toContain('30-80 words');
    });
    
    it('should add protagonist requirement when missing', () => {
      const idea = 'In a world of darkness, hope emerges slowly';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_PROTAGONIST']);
      
      const prompt = buildEnhancementPrompt(idea, validation, 'sci-fi');
      
      expect(prompt).toContain('Add a clear protagonist');
      expect(prompt).toMatch(/scientist|astronaut|engineer/i);
    });
    
    it('should add conflict requirement when missing', () => {
      const idea = 'Sarah is a scientist living on Mars';
      const validation = createMockValidation(['MISSING_CONFLICT']);
      
      const prompt = buildEnhancementPrompt(idea, validation, 'sci-fi');
      
      expect(prompt).toContain('Add a clear conflict');
      expect(prompt).toMatch(/alien threat|rogue AI|cosmic anomaly/i);
    });
    
    it('should use genre-appropriate templates for drama', () => {
      const idea = 'A story about family';
      const validation = createMockValidation(['MISSING_PROTAGONIST']);
      
      const prompt = buildEnhancementPrompt(idea, validation, 'drama');
      
      expect(prompt).toMatch(/struggling parent|ambitious professional|returning exile/i);
    });
    
    it('should use genre-appropriate templates for thriller', () => {
      const idea = 'Someone discovers a secret';
      const validation = createMockValidation(['MISSING_PROTAGONIST']);
      
      const prompt = buildEnhancementPrompt(idea, validation, 'thriller');
      
      expect(prompt).toMatch(/detective|journalist|witness/i);
    });
    
    it('should default to sci-fi for unknown genres', () => {
      const idea = 'A tale of adventure';
      const validation = createMockValidation(['MISSING_PROTAGONIST']);
      
      const prompt = buildEnhancementPrompt(idea, validation, 'unknown-genre');
      
      expect(prompt).toMatch(/scientist|astronaut|engineer/i);
    });
    
    it('should include custom config word count targets', () => {
      const idea = 'Short idea';
      const validation = validateStoryIdea(idea);
      const config: EnhancementConfig = {
        ...DEFAULT_ENHANCEMENT_CONFIG,
        targetWordCount: { min: 50, max: 100 }
      };
      
      const prompt = buildEnhancementPrompt(idea, validation, 'sci-fi', config);
      
      expect(prompt).toContain('50-100 words');
    });
  });
  
  describe('parseEnhancementResponse', () => {
    const originalIdea = 'A robot learns to feel';
    
    it('should trim whitespace', () => {
      const response = '  A compelling robot story  ';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('A compelling robot story');
    });
    
    it('should remove "Enhanced version:" preamble', () => {
      const response = 'Enhanced version: A robot awakens to consciousness';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('A robot awakens to consciousness');
    });
    
    it('should remove "Here\'s the enhanced idea:" preamble', () => {
      const response = "Here's the enhanced idea: In a future world, an android discovers emotions";
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('In a future world, an android discovers emotions');
    });
    
    it('should remove "Improved version:" preamble', () => {
      const response = 'Improved version: The robot awakens';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('The robot awakens');
    });
    
    it('should remove "Revised idea:" preamble', () => {
      const response = 'Revised idea: A sentient machine in a dystopian future';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('A sentient machine in a dystopian future');
    });
    
    it('should remove surrounding double quotes', () => {
      const response = '"A robot awakens to consciousness and seeks its creator"';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('A robot awakens to consciousness and seeks its creator');
    });
    
    it('should remove surrounding single quotes', () => {
      const response = "'A robot awakens to consciousness'";
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('A robot awakens to consciousness');
    });
    
    it('should return original if cleaned response is too short', () => {
      const response = 'ok';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe(originalIdea);
    });
    
    it('should handle multiple preambles', () => {
      const response = 'Story idea: The robot must find its purpose';
      
      const result = parseEnhancementResponse(response, originalIdea);
      
      expect(result).toBe('The robot must find its purpose');
    });
  });
  
  describe('isEnhancementBetter', () => {
    it('should return true when enhanced can proceed and original cannot', () => {
      // A short idea that cannot proceed
      const originalValidation = validateStoryIdea('Robot');
      // A fuller idea that can proceed
      const enhancedValidation = validateStoryIdea(
        'A sentient robot named ARIA discovers she can feel emotions when she meets a lonely scientist, but her corporation wants to deactivate her for being defective.'
      );
      
      const result = isEnhancementBetter(originalValidation, enhancedValidation);
      
      expect(result).toBe(true);
    });
    
    it('should return true when enhanced has fewer errors', () => {
      const original = validateStoryIdea('A thing happens somewhere');
      const enhanced = validateStoryIdea('A detective in Chicago investigates a mysterious disappearance');
      
      const result = isEnhancementBetter(original, enhanced);
      
      // Enhanced should have fewer vague/missing element errors
      expect(result).toBe(true);
    });
    
    it('should return true when enhanced has higher quality score', () => {
      const original = validateStoryIdea('Something occurs');
      const enhanced = validateStoryIdea('A brave astronaut on the ISS discovers an alien signal, but NASA orders a cover-up');
      
      const result = isEnhancementBetter(original, enhanced);
      
      expect(result).toBe(true);
    });
    
    it('should return false when original is already better', () => {
      const original = validateStoryIdea(
        'A renowned physicist discovers a portal to parallel universes, but an interdimensional entity threatens to destroy both worlds unless she closes the gateway.'
      );
      const enhanced = validateStoryIdea('Physics portal thing');
      
      const result = isEnhancementBetter(original, enhanced);
      
      expect(result).toBe(false);
    });
  });
  
  describe('applyLocalFixes', () => {
    it('should add period if missing ending punctuation', () => {
      const idea = 'A robot learns to feel emotions';
      const validation = validateStoryIdea(idea);
      
      const result = applyLocalFixes(idea, validation);
      
      expect(result).toBe('A robot learns to feel emotions.');
    });
    
    it('should not add period if idea ends with period', () => {
      const idea = 'A robot learns to feel emotions.';
      const validation = validateStoryIdea(idea);
      
      const result = applyLocalFixes(idea, validation);
      
      expect(result).toBe('A robot learns to feel emotions.');
    });
    
    it('should not add period if idea ends with exclamation', () => {
      const idea = 'A robot learns to feel emotions!';
      const validation = validateStoryIdea(idea);
      
      const result = applyLocalFixes(idea, validation);
      
      expect(result).toBe('A robot learns to feel emotions!');
    });
    
    it('should not add period if idea ends with question mark', () => {
      const idea = 'Can a robot learn to feel emotions?';
      const validation = validateStoryIdea(idea);
      
      const result = applyLocalFixes(idea, validation);
      
      expect(result).toBe('Can a robot learn to feel emotions?');
    });
  });
  
  describe('generateFallbackEnhancement', () => {
    it('should add sci-fi protagonist when TOO_SHORT and MISSING_PROTAGONIST', () => {
      const idea = 'world';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_PROTAGONIST']);
      
      const result = generateFallbackEnhancement(idea, validation, 'sci-fi');
      
      expect(result).toContain('scientist');
      expect(result).toContain('world');
    });
    
    it('should add drama protagonist when TOO_SHORT and MISSING_PROTAGONIST', () => {
      const idea = 'life';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_PROTAGONIST']);
      
      const result = generateFallbackEnhancement(idea, validation, 'drama');
      
      expect(result).toContain('struggling parent');
      expect(result).toContain('life');
    });
    
    it('should add setting when TOO_SHORT and MISSING_SETTING', () => {
      const idea = 'hero';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_SETTING']);
      
      const result = generateFallbackEnhancement(idea, validation, 'sci-fi');
      
      expect(result).toContain('distant future');
      expect(result).toContain('hero');
    });
    
    it('should add conflict when TOO_SHORT and MISSING_CONFLICT', () => {
      const idea = 'person';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_CONFLICT']);
      
      const result = generateFallbackEnhancement(idea, validation, 'sci-fi');
      
      expect(result).toContain('alien threat');
      expect(result).toContain('person');
    });
    
    it('should integrate multiple missing elements with original', () => {
      const idea = 'survival';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_PROTAGONIST', 'MISSING_SETTING', 'MISSING_CONFLICT']);
      
      const result = generateFallbackEnhancement(idea, validation, 'sci-fi');
      
      expect(result).toContain('—');
      expect(result).toContain('survival');
      expect(result).toContain('scientist');
      expect(result).toContain('distant future');
      expect(result).toContain('alien threat');
    });
    
    it('should default to sci-fi templates for unknown genre', () => {
      const idea = 'something';
      const validation = createMockValidation(['TOO_SHORT', 'MISSING_PROTAGONIST']);
      
      const result = generateFallbackEnhancement(idea, validation, 'unknown-genre');
      
      expect(result).toContain('scientist');
    });
    
    it('should not modify idea when TOO_SHORT is not present', () => {
      const idea = 'some valid idea';
      const validation = createMockValidation(['MISSING_PROTAGONIST']); // No TOO_SHORT
      
      const result = generateFallbackEnhancement(idea, validation, 'sci-fi');
      
      expect(result).toBe('some valid idea'); // Unchanged
    });
  });
  
  describe('validateEnhancement', () => {
    it('should return valid for properly enhanced idea', () => {
      const enhanced = 'A scientist discovers a portal to another dimension, but an alien entity threatens to invade through it, forcing her to choose between scientific discovery and human survival.';
      const original = 'A scientist finds a portal';
      
      const result = validateEnhancement(enhanced, original);
      
      expect(result.valid).toBe(true);
    });
    
    it('should return invalid for too short enhancement', () => {
      const enhanced = 'Hi';
      const original = 'A story';
      
      const result = validateEnhancement(enhanced, original);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Enhancement too short');
    });
    
    it('should return invalid for identical enhancement', () => {
      const idea = 'A brilliant scientist discovers a portal to another dimension where time flows differently, but a shadowy organization seeks to weaponize the technology for their own dark purposes.';
      
      const result = validateEnhancement(idea, idea);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Enhancement identical to original');
    });
    
    it('should return invalid for case-insensitive identical', () => {
      const original = 'A Detective In Chicago Investigates A Series Of Murders While Battling Personal Demons And Corporate Conspiracy That Threatens The Entire City.';
      const enhanced = 'a detective in chicago investigates a series of murders while battling personal demons and corporate conspiracy that threatens the entire city.';
      
      const result = validateEnhancement(enhanced, original);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Enhancement identical to original');
    });
    
    it('should return invalid if strays too far from original', () => {
      const original = 'A detective solves crimes in Chicago';
      const enhanced = 'An astronaut explores distant galaxies and encounters alien civilizations while searching for new habitable planets in the cosmos.';
      const config: EnhancementConfig = {
        ...DEFAULT_ENHANCEMENT_CONFIG,
        preserveOriginalIntent: true
      };
      
      const result = validateEnhancement(enhanced, original, config);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Enhancement strays too far from original intent');
    });
    
    it('should accept enhancement that preserves original words', () => {
      const original = 'A detective solves crimes';
      const enhanced = 'A brilliant detective in modern Chicago solves crimes involving the supernatural, but faces a conspiracy within the police department that threatens her career.';
      const config: EnhancementConfig = {
        ...DEFAULT_ENHANCEMENT_CONFIG,
        preserveOriginalIntent: true
      };
      
      const result = validateEnhancement(enhanced, original, config);
      
      expect(result.valid).toBe(true);
    });
    
    it('should skip preservation check for very short originals', () => {
      const original = 'hi';
      const enhanced = 'A scientist on a distant space station discovers an ancient alien artifact that holds the key to faster-than-light travel, but a hostile corporation will stop at nothing to claim it.';
      const config: EnhancementConfig = {
        ...DEFAULT_ENHANCEMENT_CONFIG,
        preserveOriginalIntent: true
      };
      
      const result = validateEnhancement(enhanced, original, config);
      
      // Should be valid because original has < 5 words
      expect(result.valid).toBe(true);
    });
    
    it('should respect preserveOriginalIntent=false config', () => {
      const original = 'A detective solves crimes in Chicago';
      const enhanced = 'An astronaut explores distant galaxies and encounters alien civilizations while searching for new habitable planets in the cosmos.';
      const config: EnhancementConfig = {
        ...DEFAULT_ENHANCEMENT_CONFIG,
        preserveOriginalIntent: false
      };
      
      const result = validateEnhancement(enhanced, original, config);
      
      // Should be valid because we're not checking intent preservation
      expect(result.valid).toBe(true);
    });
  });
  
  describe('createEnhancementResult', () => {
    it('should create result with validation details', () => {
      const enhanced = 'A scientist on Mars discovers ancient alien ruins, but a sandstorm threatens to bury the evidence before she can document it.';
      const original = 'Scientist on Mars';
      
      const result = createEnhancementResult(enhanced, original, 1, true);
      
      expect(result.enhanced).toBe(enhanced);
      expect(result.original).toBe(original);
      expect(result.attempts).toBe(1);
      expect(result.success).toBe(true);
      expect(result.validation).toBeDefined();
      expect(result.validation.issues).toBeDefined();
    });
    
    it('should track which issues were fixed', () => {
      const original = 'thing';
      const enhanced = 'A brave scientist in a futuristic laboratory discovers a portal to another dimension, but a malevolent entity threatens to escape through it.';
      
      const result = createEnhancementResult(enhanced, original, 2, true);
      
      // The enhanced version should have fixed many of the original issues
      expect(result.enhancementsApplied).toBeInstanceOf(Array);
      // Original "thing" should have TOO_SHORT, MISSING_PROTAGONIST, etc.
      expect(result.enhancementsApplied.length).toBeGreaterThan(0);
    });
    
    it('should track failed enhancement', () => {
      const original = 'A scientist';
      const enhanced = 'A'; // Still too short
      
      const result = createEnhancementResult(enhanced, original, 3, false);
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });
    
    it('should correctly identify fixed issues', () => {
      const original = 'x'; // TOO_SHORT, MISSING_PROTAGONIST, MISSING_CONFLICT, MISSING_SETTING
      const enhanced = 'A detective in New York City investigates a series of murders connected to a secret society, but discovers his own partner may be involved.';
      
      const result = createEnhancementResult(enhanced, original, 1, true);
      
      // Should have fixed TOO_SHORT at minimum
      expect(result.enhancementsApplied).toContain('TOO_SHORT');
    });
  });
  
  describe('DEFAULT_ENHANCEMENT_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_ENHANCEMENT_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_ENHANCEMENT_CONFIG.targetWordCount.min).toBe(30);
      expect(DEFAULT_ENHANCEMENT_CONFIG.targetWordCount.max).toBe(80);
      expect(DEFAULT_ENHANCEMENT_CONFIG.preserveOriginalIntent).toBe(true);
    });
  });
});
