/**
 * Story Idea Enhancer
 * 
 * Enhances user-entered story ideas to meet validation requirements.
 * Works with storyIdeaValidator.ts to ensure quality before Story Bible generation.
 * 
 * @module services/storyIdeaEnhancer
 */

import { 
  validateStoryIdea, 
  StoryIdeaValidation, 
  IdeaIssueCode,
  VALIDATION_THRESHOLDS,
  countWords
} from './storyIdeaValidator';

/**
 * Enhancement result with metadata
 */
export interface EnhancementResult {
  enhanced: string;
  original: string;
  validation: StoryIdeaValidation;
  enhancementsApplied: IdeaIssueCode[];
  attempts: number;
  success: boolean;
}

/**
 * Configuration for enhancement behavior
 */
export interface EnhancementConfig {
  maxAttempts: number;
  targetWordCount: { min: number; max: number };
  preserveOriginalIntent: boolean;
}

/**
 * Default enhancement configuration
 * Aligned with VALIDATION_THRESHOLDS from storyIdeaValidator.ts
 */
export const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig = {
  maxAttempts: 3,
  targetWordCount: { min: 40, max: 120 },  // Safe range within VALIDATION_THRESHOLDS (15-150)
  preserveOriginalIntent: true
};

/**
 * Genre-specific enhancement templates
 */
const GENRE_TEMPLATES: Record<string, {
  protagonistTypes: string[];
  conflictTypes: string[];
  settingTypes: string[];
}> = {
  'sci-fi': {
    protagonistTypes: ['scientist', 'astronaut', 'engineer', 'AI researcher', 'starship captain', 'colonist'],
    conflictTypes: ['alien threat', 'rogue AI', 'cosmic anomaly', 'resource scarcity', 'first contact', 'time paradox'],
    settingTypes: ['distant future', 'space station', 'alien planet', 'generation ship', 'cyberpunk city', 'terraformed world']
  },
  'drama': {
    protagonistTypes: ['struggling parent', 'ambitious professional', 'returning exile', 'reformed criminal', 'grieving spouse', 'idealistic teacher'],
    conflictTypes: ['family secrets', 'moral dilemma', 'past mistakes', 'societal pressure', 'personal sacrifice', 'forbidden love'],
    settingTypes: ['small town', 'big city', 'family home', 'workplace', 'courtroom', 'hospital']
  },
  'thriller': {
    protagonistTypes: ['detective', 'journalist', 'witness', 'undercover agent', 'hacker', 'survivor'],
    conflictTypes: ['conspiracy', 'serial killer', 'corruption', 'hostage situation', 'deadline', 'betrayal'],
    settingTypes: ['urban jungle', 'isolated location', 'government facility', 'criminal underworld', 'foreign city', 'secure compound']
  }
};

/**
 * Build an enhancement prompt for the LLM
 */
export function buildEnhancementPrompt(
  idea: string,
  validation: StoryIdeaValidation,
  genre: string = 'sci-fi',
  config: EnhancementConfig = DEFAULT_ENHANCEMENT_CONFIG
): string {
  const issues = validation.issues;
  const genreTemplate = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES['sci-fi']!;
  
  let prompt = `Enhance this story idea to make it more compelling and complete for cinematic storytelling.

ORIGINAL IDEA:
${idea}

REQUIREMENTS:`;

  // Add specific requirements based on issues
  if (issues.some(i => i.code === 'TOO_SHORT')) {
    prompt += `
- Expand the idea to ${config.targetWordCount.min}-${config.targetWordCount.max} words
- Add specific details while keeping the core concept`;
  }
  
  if (issues.some(i => i.code === 'MISSING_PROTAGONIST')) {
    prompt += `
- Add a clear protagonist with a distinctive role or trait
- Suggested types for ${genre}: ${genreTemplate.protagonistTypes.slice(0, 3).join(', ')}`;
  }
  
  if (issues.some(i => i.code === 'MISSING_CONFLICT')) {
    prompt += `
- Add a clear conflict, obstacle, or antagonist
- Use "but" or "however" to introduce tension
- Suggested conflicts for ${genre}: ${genreTemplate.conflictTypes.slice(0, 3).join(', ')}`;
  }
  
  if (issues.some(i => i.code === 'MISSING_SETTING')) {
    prompt += `
- Add setting/location/time context
- Suggested settings for ${genre}: ${genreTemplate.settingTypes.slice(0, 3).join(', ')}`;
  }
  
  if (issues.some(i => i.code === 'TOO_VAGUE')) {
    prompt += `
- Add concrete, specific details
- Include sensory or visual elements that can be filmed
- Name characters or locations if appropriate`;
  }

  prompt += `

CRITICAL CONSTRAINTS (MUST FOLLOW):
- HARD LIMIT: Output MUST be between ${config.targetWordCount.min} and ${config.targetWordCount.max} words
- MUST NOT exceed ${VALIDATION_THRESHOLDS.MAX_WORDS} words under any circumstances
- Keep the enhanced version to 2-4 sentences maximum
- Preserve the original author's core vision and intent
- Make it cinematic and visually evocative
- DO NOT add unnecessary elaboration or flowery language

Return ONLY the enhanced story idea, no preamble or explanation.`;

  return prompt;
}

/**
 * Known header/preamble patterns that LLMs commonly prefix responses with.
 * Comprehensive list to handle various LLM formatting styles.
 */
const ENHANCEMENT_HEADER_PATTERNS = [
  // Markdown bold headers (e.g., **Refined Plot Outline:**)
  /^\*{1,2}refined\s*(plot\s*)?(outline|version|idea)?:?\*{0,2}\s*/i,
  /^\*{1,2}enhanced\s*(version|idea)?:?\*{0,2}\s*/i,
  /^\*{1,2}improved\s*(version|idea)?:?\*{0,2}\s*/i,
  /^\*{1,2}revised\s*(version|idea)?:?\*{0,2}\s*/i,
  // Plain text headers
  /^refined\s*(plot\s*)?(outline|version|idea)?:?\s*/i,
  /^enhanced\s*(version|idea)?:?\s*/i,
  /^here'?s?\s*(the\s+)?enhanced\s*(version|idea)?:?\s*/i,
  /^here'?s?\s*(the\s+)?refined\s*(version|idea)?:?\s*/i,
  /^improved\s*(version|idea)?:?\s*/i,
  /^revised\s*(version|idea)?:?\s*/i,
  /^suggestion:?\s*/i,
  /^story\s*idea:?\s*/i,
  /^output:?\s*/i,
  /^plot\s*outline:?\s*/i,
];

/**
 * Parse and clean enhancement response from LLM.
 * Handles multi-line responses where the first line may be a header.
 */
export function parseEnhancementResponse(response: string, originalIdea: string): string {
  let cleaned = response.trim();
  
  // Apply all header pattern removal
  for (const pattern of ENHANCEMENT_HEADER_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Split into lines for header detection
  const lines = cleaned.split('\n').map(l => l.trim());
  
  // Check for "Title: followed by blank line" pattern (generic header detection)
  // If first line looks like a header and is followed by blank, strip both
  if (lines.length >= 2 && lines[0] && lines[1] === '') {
    const firstLine = lines[0];
    // Header heuristic: ends with colon, less than 50 chars, no sentence-ending punctuation
    if (firstLine.endsWith(':') && firstLine.length < 50 && !firstLine.includes('.') && !firstLine.includes('!') && !firstLine.includes('?')) {
      lines.shift(); // Remove header line
      lines.shift(); // Remove blank line after header
    }
  }
  
  // Join remaining content lines (preserve paragraph breaks as single newlines)
  cleaned = lines.filter(Boolean).join('\n').trim();
  
  // Remove quotes if the entire response is quoted
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // If cleaning resulted in empty or very short string, return original
  if (cleaned.length < 10) {
    console.warn('[parseEnhancementResponse] Cleaned response too short, returning original idea');
    return originalIdea;
  }

  // Hard word-count clamp to enforcement range
  // This guarantees we never exceed the global MAX_WORDS threshold,
  // even if the LLM ignores prompt instructions.
  const wordCount = countWords(cleaned);
  if (wordCount > VALIDATION_THRESHOLDS.MAX_WORDS) {
    const words = cleaned.split(/\s+/).slice(0, VALIDATION_THRESHOLDS.MAX_WORDS);
    cleaned = words.join(' ');
  }

  return cleaned.trim();
}

/**
 * Check if enhancement actually improved the idea
 */
export function isEnhancementBetter(
  original: StoryIdeaValidation,
  enhanced: StoryIdeaValidation
): boolean {
  // Better if:
  // 1. Quality score improved
  // 2. Error count decreased
  // 3. Can proceed now when couldn't before
  
  if (enhanced.canProceed && !original.canProceed) {
    return true;
  }
  
  const originalErrors = original.issues.filter(i => i.severity === 'error').length;
  const enhancedErrors = enhanced.issues.filter(i => i.severity === 'error').length;
  
  if (enhancedErrors < originalErrors) {
    return true;
  }
  
  if (enhanced.qualityScore > original.qualityScore) {
    return true;
  }
  
  return false;
}

/**
 * Apply local (non-LLM) fixes for simple issues
 * These are quick fixes that don't require LLM calls
 */
export function applyLocalFixes(idea: string, _validation: StoryIdeaValidation): string {
  // For now, local fixes are limited
  // Most enhancements require LLM creativity
  
  // Example: If only issue is missing a period, add one
  if (!idea.endsWith('.') && !idea.endsWith('!') && !idea.endsWith('?')) {
    return idea + '.';
  }
  
  return idea;
}

/**
 * Generate fallback enhancement without LLM
 * Used when LLM calls fail or for testing
 */
export function generateFallbackEnhancement(
  idea: string,
  validation: StoryIdeaValidation,
  genre: string = 'sci-fi'
): string {
  const genreTemplate = GENRE_TEMPLATES[genre] ?? GENRE_TEMPLATES['sci-fi']!;
  let enhanced = idea;
  
  // Add missing elements with genre-appropriate defaults
  const issues = validation.issues.map(i => i.code);
  
  // Only enhance if too short
  if (issues.includes('TOO_SHORT')) {
    const additions: string[] = [];
    
    if (issues.includes('MISSING_PROTAGONIST')) {
      const protagonist = genreTemplate.protagonistTypes[0] ?? 'hero';
      additions.push(`A ${protagonist}`);
    }
    
    if (issues.includes('MISSING_SETTING')) {
      const setting = genreTemplate.settingTypes[0] ?? 'world';
      additions.push(`in a ${setting}`);
    }
    
    if (issues.includes('MISSING_CONFLICT')) {
      const conflict = genreTemplate.conflictTypes[0] ?? 'unknown threat';
      additions.push(`must confront a ${conflict}`);
    }
    
    if (additions.length > 0) {
      // Try to integrate with original idea
      enhanced = `${additions.join(' ')} — ${idea}`;
    }
  }
  
  return enhanced;
}

/**
 * Validate enhancement meets requirements
 */
export function validateEnhancement(
  enhanced: string,
  original: string,
  config: EnhancementConfig = DEFAULT_ENHANCEMENT_CONFIG
): { valid: boolean; reason?: string } {
  const wordCount = countWords(enhanced);
  
  // Check word count bounds
  if (wordCount < VALIDATION_THRESHOLDS.MIN_WORDS) {
    return { valid: false, reason: 'Enhancement too short' };
  }
  
  if (wordCount > VALIDATION_THRESHOLDS.MAX_WORDS) {
    return { valid: false, reason: 'Enhancement too long' };
  }
  
  // Check that it's actually different from original
  if (enhanced.toLowerCase() === original.toLowerCase()) {
    return { valid: false, reason: 'Enhancement identical to original' };
  }
  
  // Check that original content is somewhat preserved (if configured)
  if (config.preserveOriginalIntent) {
    // Simple check: at least some words from original should appear
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const enhancedWords = enhanced.toLowerCase().split(/\s+/);
    const preservedWords = enhancedWords.filter(w => originalWords.has(w));
    
    // At least 20% of original words should be preserved
    const preservationRatio = preservedWords.length / originalWords.size;
    if (preservationRatio < 0.2 && originalWords.size >= 5) {
      return { valid: false, reason: 'Enhancement strays too far from original intent' };
    }
  }
  
  return { valid: true };
}

/**
 * Create a complete enhancement result object
 */
export function createEnhancementResult(
  enhanced: string,
  original: string,
  attempts: number,
  success: boolean
): EnhancementResult {
  const validation = validateStoryIdea(enhanced);
  const originalValidation = validateStoryIdea(original);
  
  // Determine which issues were fixed
  const originalIssueCodes = new Set(originalValidation.issues.map(i => i.code));
  const enhancedIssueCodes = new Set(validation.issues.map(i => i.code));
  const fixedIssues = [...originalIssueCodes].filter(code => !enhancedIssueCodes.has(code)) as IdeaIssueCode[];
  
  return {
    enhanced,
    original,
    validation,
    enhancementsApplied: fixedIssues,
    attempts,
    success
  };
}
