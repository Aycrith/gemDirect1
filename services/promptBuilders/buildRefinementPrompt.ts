import type { RefinableField, ValidationRule } from '../validationRules';

type BuildRefinementPromptArgs = {
  fieldType: RefinableField;
  storyIdea: string;
  bibleContext?: string;
  currentValue: string;
  validationIssues: string[];
  validationSuggestions?: string[];
  validationRules: ValidationRule;
};

export function buildRefinementPrompt({
  fieldType,
  storyIdea,
  bibleContext = '',
  currentValue,
  validationIssues,
  validationSuggestions = [],
  validationRules,
}: BuildRefinementPromptArgs): string {
  const rules = [
    `Min ${validationRules.minWords} words`,
    `Max ${validationRules.maxWords} words`,
    ...(validationRules.requiredNotes || []),
    ...(validationRules.styleNotes || []),
  ];

  const issues = validationIssues.length
    ? validationIssues.join('\n- ')
    : 'No explicit issues listed; improve clarity and adherence to rules.';

  const suggestions = validationSuggestions.length
    ? validationSuggestions.join('\n- ')
    : 'Use tighter wording, make it cinematic, and align with the story idea.';

  return `
You are refining a ${fieldType.toUpperCase()} for a cinematic story generator.

Story Idea:
${storyIdea || '(not provided)'}

Current Value:
${currentValue}

Additional Context:
${bibleContext || '(none)'}

Validation Rules (must obey):
- ${rules.join('\n- ')}

Validation Issues:
- ${issues}

Refinement Suggestions:
- ${suggestions}

Your task:
Rewrite ONLY to fix the listed issues while preserving genre, canon, tone, and intent.
Return a single improved ${fieldType} that stays within the word cap and follows the rules.

Output:
[REVISED_${fieldType.toUpperCase()}_ONLY]`;
}
