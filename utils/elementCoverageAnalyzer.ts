/**
 * Element Coverage Analyzer
 * 
 * Analyzes scene content to detect which mandatory template elements
 * are covered/mentioned in the generated text.
 * 
 * Usage:
 *   const coverage = analyzeElementCoverage(sceneContent, mandatoryElements);
 *   console.log(`${coverage.percentage}% of elements covered`);
 */

export interface ElementCoverageResult {
  covered: Set<string>;
  uncovered: Set<string>;
  percentage: number;
  details: Record<string, {
    element: string;
    covered: boolean;
    keywords: string[];
    foundKeywords: string[];
    confidence: number;
  }>;
}

/**
 * Extract keywords from an element phrase
 * Filters out stop words and very short terms
 */
function extractKeywords(phrase: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
    'the', 'to', 'was', 'will', 'with', 'the', 'this', 'but', 'have', 'not'
  ]);
  
  return phrase
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter(word => word.length >= 3 && !stopWords.has(word))
    .map(word => word.replace(/[^a-z0-9]/g, ''));
}

/**
 * Calculate keyword matching confidence
 * Returns 0-1 score based on how many keywords are found
 */
function calculateConfidence(keywords: string[], foundKeywords: string[]): number {
  if (keywords.length === 0) return 1;
  const matchCount = keywords.filter(kw => foundKeywords.includes(kw)).length;
  return matchCount / keywords.length;
}

/**
 * Analyze scene content against mandatory elements
 */
export function analyzeElementCoverage(
  sceneContent: string,
  mandatoryElements: string[],
  confidenceThreshold: number = 0.6
): ElementCoverageResult {
  const contentLower = sceneContent.toLowerCase();
  const contentKeywords = extractKeywords(sceneContent);
  
  const covered = new Set<string>();
  const uncovered = new Set<string>();
  const details: Record<string, ElementCoverageResult['details'][string]> = {};
  
  mandatoryElements.forEach(element => {
    const elementKeywords = extractKeywords(element);
    
    // Find which keywords are present in the content
    const foundKeywords = elementKeywords.filter(keyword => 
      contentKeywords.includes(keyword)
    );
    
    const confidence = calculateConfidence(elementKeywords, foundKeywords);
    const isCovered = confidence >= confidenceThreshold;
    
    if (isCovered) {
      covered.add(element);
    } else {
      uncovered.add(element);
    }
    
    details[element] = {
      element,
      covered: isCovered,
      keywords: elementKeywords,
      foundKeywords,
      confidence,
    };
  });
  
  const percentage = mandatoryElements.length > 0 
    ? Math.round((covered.size / mandatoryElements.length) * 100)
    : 0;
  
  return {
    covered,
    uncovered,
    percentage,
    details,
  };
}

/**
 * Get uncovered elements for suggestions
 */
export function getUncoveredElementSuggestions(
  mandatoryElements: string[],
  coverage: ElementCoverageResult
): string[] {
  return Array.from(coverage.uncovered)
    .sort((a, b) => coverage.details[b].confidence - coverage.details[a].confidence);
}

/**
 * Suggest what to add to cover missing elements
 */
export function generateCoverageImprovement(
  coverage: ElementCoverageResult,
  maxSuggestions: number = 3
): string {
  const uncovered = getUncoveredElementSuggestions(
    Array.from(coverage.uncovered),
    coverage
  );
  
  if (uncovered.length === 0) {
    return 'All mandatory elements are covered!';
  }
  
  const suggestions = uncovered.slice(0, maxSuggestions);
  return `Consider adding: ${suggestions.join(', ')}`;
}
