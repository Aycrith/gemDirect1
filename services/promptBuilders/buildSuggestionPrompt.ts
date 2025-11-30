type BuildSuggestionPromptArgs = {
  feature: string;
  storyIdea: string;
  bibleSummary?: string;
  previousSuggestions: string[];
  count?: number;
};

export function buildSuggestionPrompt({
  feature,
  storyIdea,
  bibleSummary = '',
  previousSuggestions,
  count = 5,
}: BuildSuggestionPromptArgs): string {
  return `
You generate creative suggestions for ${feature}.

Context:
Story Idea: ${storyIdea || '(none)'}
Story Bible Summary: ${bibleSummary || '(none)'}
Previously used suggestions (avoid repeating):
${previousSuggestions.join('\n')}

Requirements:
- Generate ${count} DISTINCT suggestions
- Strong diversity in tone, premise, scale, style, stakes, aesthetics, themes
- No repeats or near-duplicates of previous suggestions
- Keep it JSON array only

Return format:
[
  { "title": "...", "summary": "...", "whyDifferent": "..." },
  ...
]`;
}
