/**
 * Story Idea Validator
 * 
 * Validates user-entered story ideas before proceeding to Story Bible generation.
 * Implements quality gates based on COMPREHENSIVE_IMPROVEMENT_PLAN.md Phase 3.
 * 
 * @module services/storyIdeaValidator
 */

/**
 * Issue codes for story idea validation failures
 */
export type IdeaIssueCode = 
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_VAGUE'
  | 'MISSING_CONFLICT'
  | 'MISSING_SETTING'
  | 'MISSING_PROTAGONIST';

/**
 * Severity levels for validation issues
 */
export type IssueSeverity = 'error' | 'warning';

/**
 * A single validation issue with details
 */
export interface IdeaIssue {
  code: IdeaIssueCode;
  message: string;
  severity: IssueSeverity;
  autoFixable: boolean;
  suggestion?: string;
}

/**
 * Complete validation result for a story idea
 */
export interface StoryIdeaValidation {
  valid: boolean;
  issues: IdeaIssue[];
  suggestions: string[];
  qualityScore: number;  // 0-1 scale
  canProceed: boolean;   // True if no errors (warnings allowed)
  wordCount: number;
  estimatedTokens: number;
}

/**
 * Validation thresholds from COMPREHENSIVE_IMPROVEMENT_PLAN.md
 */
export const VALIDATION_THRESHOLDS = {
  MIN_WORDS: 15,
  MAX_WORDS: 150,
  MAX_TOKENS: 200,
  // Approximate tokens-to-words ratio for English
  TOKENS_PER_WORD: 1.3,
} as const;

/**
 * Keywords that indicate conflict/tension in a story
 */
const CONFLICT_KEYWORDS = [
  'but', 'however', 'must', 'need', 'fight', 'battle', 'struggle',
  'against', 'enemy', 'threat', 'danger', 'risk', 'challenge',
  'overcome', 'defeat', 'escape', 'save', 'protect', 'stop',
  'discover', 'uncover', 'expose', 'confront', 'face', 'hunt',
  'chase', 'survive', 'conflict', 'war', 'crisis', 'disaster',
  'obstacle', 'problem', 'dilemma', 'secret', 'mystery', 'forbidden'
];

/**
 * Keywords that indicate setting/location/time
 */
const SETTING_KEYWORDS = [
  'in', 'on', 'at', 'world', 'city', 'planet', 'kingdom', 'land',
  'future', 'past', 'present', 'year', 'century', 'era', 'age',
  'space', 'earth', 'universe', 'dimension', 'realm', 'town',
  'village', 'forest', 'ocean', 'mountain', 'desert', 'island',
  'station', 'ship', 'base', 'castle', 'mansion', 'underground',
  'dystopian', 'utopian', 'post-apocalyptic', 'medieval', 'ancient',
  'modern', 'colonial', 'frontier', 'remote', 'isolated'
];

/**
 * Keywords that indicate protagonist/character
 */
const PROTAGONIST_KEYWORDS = [
  'a', 'an', 'the', 'young', 'old', 'lone', 'unlikely', 'reluctant',
  'hero', 'heroine', 'detective', 'scientist', 'explorer', 'warrior',
  'soldier', 'agent', 'spy', 'captain', 'pilot', 'doctor', 'engineer',
  'princess', 'prince', 'king', 'queen', 'child', 'teenager', 'woman',
  'man', 'girl', 'boy', 'orphan', 'survivor', 'outcast', 'rebel',
  'thief', 'assassin', 'wizard', 'witch', 'knight', 'samurai',
  'she', 'he', 'they', 'who', 'someone', 'nobody', 'everybody'
];

/**
 * Estimate token count from text
 * Uses approximate ratio for English text
 */
export function estimateTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil(words * VALIDATION_THRESHOLDS.TOKENS_PER_WORD);
}

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
    // Word boundary match for whole words
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerText);
  });
}

/**
 * Calculate quality score based on various factors
 * Returns a score from 0 to 1
 */
function calculateQualityScore(
  text: string,
  wordCount: number,
  hasConflict: boolean,
  hasSetting: boolean,
  hasProtagonist: boolean
): number {
  let score = 0;
  
  // Length score (0-0.3): Sweet spot is 30-80 words
  if (wordCount >= 30 && wordCount <= 80) {
    score += 0.3;
  } else if (wordCount >= VALIDATION_THRESHOLDS.MIN_WORDS && wordCount <= VALIDATION_THRESHOLDS.MAX_WORDS) {
    // Partial score based on distance from sweet spot
    const distFromOptimal = Math.min(
      Math.abs(wordCount - 30),
      Math.abs(wordCount - 80)
    );
    score += Math.max(0.1, 0.3 - (distFromOptimal * 0.01));
  }
  
  // Story element scores (0.2 each = 0.6 total)
  if (hasProtagonist) score += 0.2;
  if (hasConflict) score += 0.25;  // Slightly higher weight for conflict
  if (hasSetting) score += 0.15;
  
  // Specificity bonus (0-0.1): Check for specific details
  const hasNumbers = /\d/.test(text);
  const hasProperNouns = /[A-Z][a-z]+/.test(text.slice(1)); // Capital letters after first char
  if (hasNumbers) score += 0.05;
  if (hasProperNouns) score += 0.05;
  
  return Math.min(1, score);
}

/**
 * Generate improvement suggestions based on issues
 */
function generateSuggestions(issues: IdeaIssue[]): string[] {
  const suggestions: string[] = [];
  
  for (const issue of issues) {
    switch (issue.code) {
      case 'TOO_SHORT':
        suggestions.push('Add more detail about your protagonist, their goal, and the obstacles they face.');
        break;
      case 'TOO_VAGUE':
        suggestions.push('Be more specific about the setting, time period, or world.');
        suggestions.push('Name your protagonist or give them a distinctive trait.');
        break;
      case 'MISSING_CONFLICT':
        suggestions.push('What stands in your protagonist\'s way? Add a "but..." or obstacle.');
        suggestions.push('Consider: Who or what is the antagonist or opposing force?');
        break;
      case 'MISSING_SETTING':
        suggestions.push('Where and when does this story take place?');
        suggestions.push('Add context: Is it set in the future, past, or a fictional world?');
        break;
      case 'MISSING_PROTAGONIST':
        suggestions.push('Who is the main character? Give them a role or distinctive trait.');
        suggestions.push('Start with: "A [type of person] who..."');
        break;
    }
  }
  
  // Deduplicate suggestions
  return [...new Set(suggestions)];
}

/**
 * Validate a story idea and return detailed validation results
 * 
 * @param idea - The user's story idea text
 * @returns Detailed validation result with issues, suggestions, and quality score
 */
export function validateStoryIdea(idea: string): StoryIdeaValidation {
  const trimmedIdea = idea.trim();
  const issues: IdeaIssue[] = [];
  
  // Calculate metrics
  const wordCount = countWords(trimmedIdea);
  const estimatedTokens = estimateTokenCount(trimmedIdea);
  
  // Check story elements
  const hasConflict = containsKeyword(trimmedIdea, CONFLICT_KEYWORDS);
  const hasSetting = containsKeyword(trimmedIdea, SETTING_KEYWORDS);
  const hasProtagonist = containsKeyword(trimmedIdea, PROTAGONIST_KEYWORDS);
  
  // Validation checks
  
  // 1. Length check - ERROR if too short
  if (wordCount < VALIDATION_THRESHOLDS.MIN_WORDS) {
    issues.push({
      code: 'TOO_SHORT',
      message: `Story idea has ${wordCount} words. Minimum ${VALIDATION_THRESHOLDS.MIN_WORDS} words recommended for quality generation.`,
      severity: 'error',
      autoFixable: true,
      suggestion: 'Click "Enhance" to automatically expand your idea.'
    });
  }
  
  // 2. Length check - ERROR if too long
  if (wordCount > VALIDATION_THRESHOLDS.MAX_WORDS) {
    issues.push({
      code: 'TOO_LONG',
      message: `Story idea has ${wordCount} words. Maximum ${VALIDATION_THRESHOLDS.MAX_WORDS} words to avoid token overflow.`,
      severity: 'error',
      autoFixable: false,
      suggestion: 'Simplify your idea to its core concept. Details will be added in the Story Bible.'
    });
  }
  
  // 3. Protagonist check - WARNING
  if (!hasProtagonist && wordCount >= 5) {
    issues.push({
      code: 'MISSING_PROTAGONIST',
      message: 'No clear protagonist detected. Stories work best with a defined main character.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Who is the main character of your story?'
    });
  }
  
  // 4. Conflict check - WARNING
  if (!hasConflict && wordCount >= 10) {
    issues.push({
      code: 'MISSING_CONFLICT',
      message: 'No conflict or obstacle detected. Compelling stories need tension.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'What stands in the protagonist\'s way?'
    });
  }
  
  // 5. Setting check - WARNING (lower priority)
  if (!hasSetting && wordCount >= 15) {
    issues.push({
      code: 'MISSING_SETTING',
      message: 'No setting or location detected. Context helps ground the story.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Where and when does this story take place?'
    });
  }
  
  // 6. Vagueness check - WARNING for very generic ideas
  if (wordCount >= VALIDATION_THRESHOLDS.MIN_WORDS && !hasConflict && !hasSetting && !hasProtagonist) {
    issues.push({
      code: 'TOO_VAGUE',
      message: 'Story idea appears too vague. Add specific details for better results.',
      severity: 'warning',
      autoFixable: true,
      suggestion: 'Try adding: Who is the protagonist? What do they want? What\'s stopping them?'
    });
  }
  
  // Calculate quality score
  const qualityScore = calculateQualityScore(
    trimmedIdea,
    wordCount,
    hasConflict,
    hasSetting,
    hasProtagonist
  );
  
  // Generate suggestions
  const suggestions = generateSuggestions(issues);
  
  // Determine if user can proceed
  // Can proceed if no errors (warnings are allowed)
  const hasErrors = issues.some(issue => issue.severity === 'error');
  const canProceed = !hasErrors && wordCount > 0;
  
  return {
    valid: issues.length === 0,
    issues,
    suggestions,
    qualityScore,
    canProceed,
    wordCount,
    estimatedTokens
  };
}

/**
 * Get a simple status for UI display
 */
export type ValidationStatus = 'valid' | 'warning' | 'error' | 'empty';

export function getValidationStatus(validation: StoryIdeaValidation): ValidationStatus {
  if (validation.wordCount === 0) return 'empty';
  if (validation.issues.some(i => i.severity === 'error')) return 'error';
  if (validation.issues.length > 0) return 'warning';
  return 'valid';
}

/**
 * Get color class for validation status
 */
export function getStatusColor(status: ValidationStatus): string {
  switch (status) {
    case 'valid': return 'text-green-400';
    case 'warning': return 'text-amber-400';
    case 'error': return 'text-red-400';
    case 'empty': return 'text-gray-500';
  }
}

/**
 * Get icon name for validation status
 */
export function getStatusIcon(status: ValidationStatus): 'check' | 'warning' | 'error' | 'empty' {
  switch (status) {
    case 'valid': return 'check';
    case 'warning': return 'warning';
    case 'error': return 'error';
    case 'empty': return 'empty';
  }
}
