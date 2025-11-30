export type RefinableField = 'idea' | 'logline' | 'characters' | 'setting' | 'plotOutline';

export interface ValidationRule {
  minWords: number;
  maxWords: number;
  requiredNotes?: string[];
  styleNotes?: string[];
}

export const validationRules: Record<RefinableField, ValidationRule> = {
  idea: {
    minWords: 15,
    maxWords: 150,
    requiredNotes: ['Single idea statement, cinematic, specific hook'],
    styleNotes: ['2-4 sentences, concise, visually suggestive'],
  },
  logline: {
    minWords: 10,
    maxWords: 100,
    requiredNotes: ['Protagonist, conflict, stakes, genre tone'],
    styleNotes: ['1-2 sentences, cinematic, punchy'],
  },
  characters: {
    minWords: 200,
    maxWords: 600,
    requiredNotes: ['3-5 primary characters, each with visual descriptor, motivation, role'],
    styleNotes: ['Markdown headings or bold names, 2-4 sentences per character'],
  },
  setting: {
    minWords: 200,
    maxWords: 300,
    requiredNotes: ['Time period, location, mood, sensory detail, avoid characters'],
    styleNotes: ['2-4 sentences, vivid atmospheric language'],
  },
  plotOutline: {
    minWords: 150,
    maxWords: 600,
    requiredNotes: ['Three-act structure, clear beats, visual cues'],
    styleNotes: ['Bulleted acts, 1-3 sentences per beat'],
  },
};

export const getValidationRule = (field: RefinableField): ValidationRule => validationRules[field];
