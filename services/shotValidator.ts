export type ShotValidationSeverity = 'error' | 'warning';

export interface ShotValidationIssue {
  code: string;
  message: string;
  severity: ShotValidationSeverity;
}

export interface ShotValidationResult {
  issues: ShotValidationIssue[];
  errorCount: number;
  warningCount: number;
  wordCount: number;
}

const MIN_SHOT_WORDS = 5;
const MAX_SHOT_WORDS = 120;

export function validateShotDescription(description: string): ShotValidationResult {
  const trimmed = description.trim();
  const words = trimmed.length > 0 ? trimmed.split(/\s+/) : [];
  const wordCount = words.length;
  const issues: ShotValidationIssue[] = [];

  if (!trimmed) {
    issues.push({
      code: 'SHOT_EMPTY',
      message: 'Shot description is empty.',
      severity: 'error',
    });
  } else {
    if (wordCount < MIN_SHOT_WORDS) {
      issues.push({
        code: 'SHOT_TOO_SHORT',
        message: `Shot description is very short (${wordCount} words).`,
        severity: 'warning',
      });
    }
    if (wordCount > MAX_SHOT_WORDS) {
      issues.push({
        code: 'SHOT_TOO_LONG',
        message: `Shot description may be too long (${wordCount} words).`,
        severity: 'warning',
      });
    }
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    issues,
    errorCount,
    warningCount,
    wordCount,
  };
}

