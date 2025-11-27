/**
 * Set Vision Validator
 * 
 * Validates user-entered Director's Vision before scene generation.
 * Implements quality gates based on COMPREHENSIVE_IMPROVEMENT_PLAN.md Phase 4.
 * 
 * Follows patterns from:
 * - storyIdeaValidator.ts (issue detection, quality scoring)
 * - storyBibleValidator.ts (token validation)
 * 
 * @module services/setVisionValidator
 */

import { estimateTokens } from './promptRegistry';
import type { StoryBible } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Issue codes for Set Vision validation failures
 */
export type VisionIssueCode = 
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_VAGUE'
  | 'MISSING_VISUAL_STYLE'
  | 'MISSING_MOOD'
  | 'MISSING_CAMERA_STYLE'
  | 'LOW_COHERENCE';

/**
 * Severity levels for validation issues
 */
export type VisionIssueSeverity = 'error' | 'warning';

/**
 * A single validation issue with details
 */
export interface VisionIssue {
  code: VisionIssueCode;
  message: string;
  severity: VisionIssueSeverity;
  autoFixable: boolean;
  suggestion?: string;
}

/**
 * Token budget validation result
 */
export interface TokenBudgetValidation {
  tokens: number;
  budget: number;
  percentage: number;
  isOver: boolean;
  isWarning: boolean;
}

/**
 * Complete validation result for a Director's Vision
 */
export interface SetVisionValidation {
  valid: boolean;
  issues: VisionIssue[];
  suggestions: string[];
  qualityScore: number;  // 0-1 scale
  canProceed: boolean;   // True if no errors (warnings allowed)
  tokenStatus: TokenBudgetValidation;
  coherenceScore: number; // 0-1 scale, coherence with Story Bible
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Token budget for Set Vision (from COMPREHENSIVE_IMPROVEMENT_PLAN.md)
 */
export const SET_VISION_TOKEN_BUDGET = 600;

/**
 * Validation thresholds
 */
export const VISION_THRESHOLDS = {
  MIN_WORDS: 20,
  MAX_WORDS: 200,
  MIN_TOKENS: 30,
  MAX_TOKENS: SET_VISION_TOKEN_BUDGET,
  WARNING_THRESHOLD: 0.8,  // 80% of budget triggers warning
} as const;

// ============================================================================
// Keyword Detection
// ============================================================================

/**
 * Keywords indicating visual style elements
 */
const VISUAL_STYLE_KEYWORDS = [
  'color', 'palette', 'lighting', 'contrast', 'saturation', 'vibrant', 'muted',
  'aesthetic', 'style', 'look', 'visual', 'cinematography', 'composition',
  'dark', 'bright', 'warm', 'cool', 'neon', 'pastel', 'noir', 'minimalist',
  'textured', 'clean', 'gritty', 'polished', 'raw', 'stylized', 'realistic',
  'animation', 'anime', 'ghibli', 'pixar', 'comic', 'graphic', 'painted',
  'watercolor', 'oil', 'digital', '3d', '2d', 'cel-shaded', 'retro', 'vintage'
];

/**
 * Keywords indicating mood/tone elements
 */
const MOOD_KEYWORDS = [
  'mood', 'tone', 'feel', 'feeling', 'atmosphere', 'vibe', 'energy',
  'tension', 'suspense', 'dread', 'joy', 'melancholy', 'nostalgia',
  'hopeful', 'dark', 'light', 'intense', 'calm', 'chaotic', 'serene',
  'ominous', 'uplifting', 'somber', 'playful', 'serious', 'whimsical',
  'dreamlike', 'nightmarish', 'ethereal', 'grounded', 'surreal', 'emotional'
];

/**
 * Keywords indicating camera/cinematic style elements
 */
const CAMERA_STYLE_KEYWORDS = [
  'camera', 'shot', 'angle', 'framing', 'movement', 'dolly', 'pan', 'tilt',
  'zoom', 'tracking', 'handheld', 'steadicam', 'crane', 'aerial', 'drone',
  'close-up', 'wide', 'medium', 'establishing', 'over-the-shoulder',
  'pov', 'first-person', 'slow-motion', 'fast', 'quick-cut', 'long-take',
  'kinetic', 'dynamic', 'static', 'smooth', 'jerky', 'lens', 'focus',
  'depth', 'bokeh', 'shallow', 'deep', 'anamorphic', 'widescreen'
];

/**
 * Director/film reference keywords (for coherence detection)
 */
const DIRECTOR_REFERENCE_KEYWORDS = [
  'kubrick', 'spielberg', 'nolan', 'tarantino', 'fincher', 'wes anderson',
  'villeneuve', 'scorsese', 'coppola', 'hitchcock', 'kurosawa', 'miyazaki',
  'edgar wright', 'denis', 'ridley scott', 'cameron', 'zemeckis', 'del toro',
  'spider-verse', 'into the spider', 'blade runner', 'matrix', 'inception',
  'mad max', 'fury road', 'john wick', 'sicario', 'dune', 'arrival'
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if text contains any keywords from a list (case-insensitive)
 */
function containsKeyword(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => {
    // For multi-word keywords, check exact phrase
    if (keyword.includes(' ')) {
      return lowerText.includes(keyword.toLowerCase());
    }
    // For single words, use word boundary match
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerText);
  });
}

/**
 * Calculate coherence score between vision and story bible
 * Higher score = better alignment
 */
function calculateCoherence(vision: string, storyBible: StoryBible | null): number {
  if (!storyBible || !vision) return 0.5; // Neutral if no story bible
  
  const visionLower = vision.toLowerCase();
  let coherencePoints = 0;
  let maxPoints = 0;
  
  // Check for genre alignment from logline
  if (storyBible.logline) {
    maxPoints += 2;
    const loglineLower = storyBible.logline.toLowerCase();
    
    // Sci-fi indicators
    if (loglineLower.includes('space') || loglineLower.includes('future') || loglineLower.includes('alien')) {
      if (containsKeyword(visionLower, ['futuristic', 'sci-fi', 'cyberpunk', 'neon', 'technological', 'sleek', 'chrome', 'blade runner', 'alien', 'space'])) {
        coherencePoints += 2;
      }
    }
    // Drama indicators
    if (loglineLower.includes('family') || loglineLower.includes('relationship') || loglineLower.includes('love')) {
      if (containsKeyword(visionLower, ['intimate', 'emotional', 'naturalistic', 'warm', 'authentic', 'grounded', 'realistic'])) {
        coherencePoints += 2;
      }
    }
    // Thriller indicators
    if (loglineLower.includes('danger') || loglineLower.includes('chase') || loglineLower.includes('killer')) {
      if (containsKeyword(visionLower, ['tense', 'suspense', 'dark', 'shadows', 'noir', 'gritty', 'kinetic', 'handheld'])) {
        coherencePoints += 2;
      }
    }
  }
  
  // Check for setting alignment
  if (storyBible.setting) {
    maxPoints += 1;
    const settingLower = storyBible.setting.toLowerCase();
    // If setting mentions urban/city, vision should have urban elements
    if (settingLower.includes('city') || settingLower.includes('urban')) {
      if (containsKeyword(visionLower, ['urban', 'city', 'streets', 'buildings', 'metropolitan', 'neon'])) {
        coherencePoints += 1;
      }
    }
    // If setting mentions nature/rural
    if (settingLower.includes('forest') || settingLower.includes('nature') || settingLower.includes('rural')) {
      if (containsKeyword(visionLower, ['natural', 'organic', 'lush', 'pastoral', 'earthy', 'ghibli'])) {
        coherencePoints += 1;
      }
    }
  }
  
  // Check for tone alignment from characters
  if (storyBible.characters) {
    maxPoints += 1;
    const charactersLower = storyBible.characters.toLowerCase();
    // If characters suggest action/conflict
    if (charactersLower.includes('warrior') || charactersLower.includes('fighter') || charactersLower.includes('soldier')) {
      if (containsKeyword(visionLower, ['action', 'dynamic', 'kinetic', 'intense', 'powerful', 'explosive'])) {
        coherencePoints += 1;
      }
    }
  }
  
  if (maxPoints === 0) return 0.5;
  return Math.min(1, 0.3 + (coherencePoints / maxPoints) * 0.7);
}

/**
 * Calculate overall quality score
 */
function calculateQualityScore(
  _vision: string,
  wordCount: number,
  hasVisualStyle: boolean,
  hasMood: boolean,
  hasCameraStyle: boolean,
  hasDirectorReference: boolean,
  coherenceScore: number
): number {
  let score = 0;
  
  // Length score (0-0.2): Sweet spot is 50-120 words
  if (wordCount >= 50 && wordCount <= 120) {
    score += 0.2;
  } else if (wordCount >= VISION_THRESHOLDS.MIN_WORDS && wordCount <= VISION_THRESHOLDS.MAX_WORDS) {
    const distFromOptimal = Math.min(
      Math.abs(wordCount - 50),
      Math.abs(wordCount - 120)
    );
    score += Math.max(0.05, 0.2 - (distFromOptimal * 0.002));
  }
  
  // Vision element scores
  if (hasVisualStyle) score += 0.2;
  if (hasMood) score += 0.15;
  if (hasCameraStyle) score += 0.15;
  if (hasDirectorReference) score += 0.1;  // Bonus for film references
  
  // Coherence with story bible (0-0.2)
  score += coherenceScore * 0.2;
  
  return Math.min(1, score);
}

/**
 * Generate improvement suggestions based on issues
 */
function generateSuggestions(issues: VisionIssue[]): string[] {
  const suggestions: string[] = [];
  
  for (const issue of issues) {
    switch (issue.code) {
      case 'TOO_SHORT':
        suggestions.push('Expand your vision with more specific visual details.');
        break;
      case 'TOO_VAGUE':
        suggestions.push('Reference a specific film, director, or animation style.');
        suggestions.push('Describe specific colors, lighting, or camera techniques.');
        break;
      case 'MISSING_VISUAL_STYLE':
        suggestions.push('Add visual elements: color palette, lighting style, or animation aesthetic.');
        break;
      case 'MISSING_MOOD':
        suggestions.push('Describe the emotional tone: tense, playful, melancholic, etc.');
        break;
      case 'MISSING_CAMERA_STYLE':
        suggestions.push('Mention camera style: kinetic, steady, close-up focused, sweeping, etc.');
        break;
      case 'LOW_COHERENCE':
        suggestions.push('Align your vision with your story\'s genre and setting.');
        break;
    }
  }
  
  return [...new Set(suggestions)];
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a Director's Vision and return detailed validation results
 * 
 * @param vision - The user's Director's Vision text
 * @param storyBible - The Story Bible for coherence checking (optional)
 * @returns Detailed validation result with issues, suggestions, and quality score
 */
export function validateSetVision(
  vision: string,
  storyBible: StoryBible | null = null
): SetVisionValidation {
  const trimmedVision = vision.trim();
  const issues: VisionIssue[] = [];
  
  // Calculate metrics
  const wordCount = countWords(trimmedVision);
  const tokens = estimateTokens(trimmedVision);
  
  // Token status
  const tokenStatus: TokenBudgetValidation = {
    tokens,
    budget: SET_VISION_TOKEN_BUDGET,
    percentage: (tokens / SET_VISION_TOKEN_BUDGET) * 100,
    isOver: tokens > SET_VISION_TOKEN_BUDGET,
    isWarning: tokens > SET_VISION_TOKEN_BUDGET * VISION_THRESHOLDS.WARNING_THRESHOLD && tokens <= SET_VISION_TOKEN_BUDGET
  };
  
  // Check vision elements
  const hasVisualStyle = containsKeyword(trimmedVision, VISUAL_STYLE_KEYWORDS);
  const hasMood = containsKeyword(trimmedVision, MOOD_KEYWORDS);
  const hasCameraStyle = containsKeyword(trimmedVision, CAMERA_STYLE_KEYWORDS);
  const hasDirectorReference = containsKeyword(trimmedVision, DIRECTOR_REFERENCE_KEYWORDS);
  
  // Calculate coherence
  const coherenceScore = calculateCoherence(trimmedVision, storyBible);
  
  // ============================================================================
  // Validation Checks
  // ============================================================================
  
  // 1. Length check - ERROR if too short
  if (wordCount < VISION_THRESHOLDS.MIN_WORDS) {
    issues.push({
      code: 'TOO_SHORT',
      message: `Vision has ${wordCount} words. Minimum ${VISION_THRESHOLDS.MIN_WORDS} words for effective scene generation.`,
      severity: 'error',
      autoFixable: true,
      suggestion: 'Click "Enhance" to automatically expand your vision.'
    });
  }
  
  // 2. Token overflow - ERROR if over budget
  if (tokenStatus.isOver) {
    issues.push({
      code: 'TOO_LONG',
      message: `Vision has ${tokens} tokens, exceeding the ${SET_VISION_TOKEN_BUDGET} token budget.`,
      severity: 'error',
      autoFixable: false,
      suggestion: 'Simplify your vision. Focus on core aesthetic elements.'
    });
  }
  
  // 3. Visual style check - WARNING
  if (!hasVisualStyle && wordCount >= 10) {
    issues.push({
      code: 'MISSING_VISUAL_STYLE',
      message: 'No visual style elements detected (colors, lighting, animation style).',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Add: color palette, lighting style, or animation aesthetic.'
    });
  }
  
  // 4. Mood check - WARNING
  if (!hasMood && wordCount >= 15) {
    issues.push({
      code: 'MISSING_MOOD',
      message: 'No mood or tone indicators detected.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Add: emotional tone, atmosphere, or feeling.'
    });
  }
  
  // 5. Camera style check - WARNING (lower priority)
  if (!hasCameraStyle && wordCount >= 20) {
    issues.push({
      code: 'MISSING_CAMERA_STYLE',
      message: 'No camera/cinematic style indicated.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Add: camera movement style, shot preferences, or pacing.'
    });
  }
  
  // 6. Vagueness check - WARNING
  if (wordCount >= VISION_THRESHOLDS.MIN_WORDS && !hasVisualStyle && !hasMood && !hasCameraStyle && !hasDirectorReference) {
    issues.push({
      code: 'TOO_VAGUE',
      message: 'Vision appears too generic. Add specific cinematic references.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Reference a specific film, director, or animation style.'
    });
  }
  
  // 7. Coherence check - WARNING if low
  if (storyBible && coherenceScore < 0.4 && wordCount >= 20) {
    issues.push({
      code: 'LOW_COHERENCE',
      message: 'Vision may not align well with your story\'s genre and setting.',
      severity: 'warning',
      autoFixable: false,
      suggestion: 'Consider visual styles that match your story\'s genre.'
    });
  }
  
  // Calculate quality score
  const qualityScore = calculateQualityScore(
    trimmedVision,
    wordCount,
    hasVisualStyle,
    hasMood,
    hasCameraStyle,
    hasDirectorReference,
    coherenceScore
  );
  
  // Generate suggestions
  const suggestions = generateSuggestions(issues);
  
  // Determine if user can proceed
  const hasErrors = issues.some(issue => issue.severity === 'error');
  const canProceed = !hasErrors && wordCount > 0;
  
  return {
    valid: issues.length === 0,
    issues,
    suggestions,
    qualityScore,
    canProceed,
    tokenStatus,
    coherenceScore
  };
}

// ============================================================================
// Status Helpers (for UI)
// ============================================================================

/**
 * Get a simple status for UI display
 */
export type VisionValidationStatus = 'valid' | 'warning' | 'error' | 'empty';

export function getVisionValidationStatus(validation: SetVisionValidation): VisionValidationStatus {
  if (validation.tokenStatus.tokens === 0) return 'empty';
  if (validation.issues.some(i => i.severity === 'error')) return 'error';
  if (validation.issues.length > 0) return 'warning';
  return 'valid';
}

/**
 * Get color class for validation status
 */
export function getVisionStatusColor(status: VisionValidationStatus): string {
  switch (status) {
    case 'valid': return 'text-green-400';
    case 'warning': return 'text-amber-400';
    case 'error': return 'text-red-400';
    case 'empty': return 'text-gray-500';
  }
}

/**
 * Get border color class for validation status
 */
export function getVisionBorderColor(status: VisionValidationStatus): string {
  switch (status) {
    case 'valid': return 'border-green-500/50';
    case 'warning': return 'border-amber-500/50';
    case 'error': return 'border-red-500/50';
    case 'empty': return 'border-gray-700';
  }
}
