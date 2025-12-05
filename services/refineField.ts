import { buildRefinementPrompt } from './promptBuilders/buildRefinementPrompt';
import { getValidationRule, RefinableField } from './validationRules';
import { countWords } from './storyIdeaValidator';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';

export interface RefineFieldArgs {
  fieldType: RefinableField;
  storyIdea: string;
  bibleContext?: string;
  currentValue: string;
  validationIssues: string[];
  validationSuggestions?: string[];
  callLLM: (prompt: string) => Promise<string>;
}

const clampToWordCap = (text: string, maxWords: number): string => {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ').trim();
};

/**
 * Known header patterns that LLMs commonly prefix responses with.
 * These should be stripped before processing content.
 */
const HEADER_PATTERNS = [
  // Bracket-style instruction prefixes (e.g., [REVISED_IDEA_ONLY], [OUTPUT])
  /^\[[\w_\-\s]+\]\s*/i,
  /^\*{1,2}refined\s*(plot\s*)?(outline|version|idea)?:?\*{0,2}\s*/i,
  /^\*{1,2}enhanced\s*(version|idea)?:?\*{0,2}\s*/i,
  /^\*{1,2}improved\s*(version|idea)?:?\*{0,2}\s*/i,
  /^\*{1,2}revised\s*(version|idea)?:?\*{0,2}\s*/i,
  /^enhanced\s*(version|idea)?:?\s*/i,
  /^here'?s?\s*(the\s+)?enhanced\s*(version|idea)?:?\s*/i,
  /^improved\s*(version|idea)?:?\s*/i,
  /^revised\s*(version|idea)?:?\s*/i,
  /^suggestion:?\s*/i,
  /^story\s*idea:?\s*/i,
  /^output:?\s*/i,
];

/**
 * Sanitizes LLM output by stripping header patterns and joining multi-line content.
 * This fixes the bug where multi-line responses would only keep the first line.
 */
const sanitizeSingleOutput = (text: string): string => {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(```.*?```)/gs, '$1'); // leave fenced blocks alone
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  
  // Apply header pattern removal
  for (const pattern of HEADER_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Split into lines and process
  const lines = cleaned.split('\n').map(l => l.trim());
  
  // Check for "Title: followed by blank line" pattern (generic header detection)
  // If first line looks like a header (ends with : and is short) and followed by blank, strip it
  if (lines.length >= 2 && lines[0] && lines[1] === '') {
    const firstLine = lines[0];
    // Header heuristic: ends with colon, less than 50 chars, mostly non-content
    if (firstLine.endsWith(':') && firstLine.length < 50 && !firstLine.includes('.')) {
      lines.shift(); // Remove header line
      lines.shift(); // Remove blank line after header
    }
  }
  
  // Filter empty lines and join remaining content
  const contentLines = lines.filter(Boolean);
  cleaned = contentLines.join('\n').trim();
  
  return cleaned;
};

export async function refineField({
  fieldType,
  storyIdea,
  bibleContext = '',
  currentValue,
  validationIssues,
  validationSuggestions = [],
  callLLM,
}: RefineFieldArgs): Promise<string> {
  const rules = getValidationRule(fieldType);
  const prompt = buildRefinementPrompt({
    fieldType,
    storyIdea,
    bibleContext,
    currentValue,
    validationIssues,
    validationSuggestions,
    validationRules: rules,
  });

  const correlationId = generateCorrelationId();
  logCorrelation({ correlationId, timestamp: Date.now(), source: 'refine-field' }, `refine-${fieldType}-request`, {
    currentLength: currentValue.length,
    issues: validationIssues,
  });

  const llmOutput = await callLLM(prompt);
  const sanitized = sanitizeSingleOutput(llmOutput);
  const clamped = clampToWordCap(sanitized, rules.maxWords);
  const words = countWords(clamped);

  logCorrelation({ correlationId, timestamp: Date.now(), source: 'refine-field' }, `refine-${fieldType}-response`, {
    newLength: clamped.length,
    wordCount: words,
  });

  return clamped;
}
