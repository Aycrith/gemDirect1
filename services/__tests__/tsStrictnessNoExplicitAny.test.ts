import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const readSource = (relativeToThisTest: string): string => {
  const absPath = fileURLToPath(new URL(relativeToThisTest, import.meta.url));
  return readFileSync(absPath, 'utf-8');
};

const EXPLICIT_ANY_PATTERNS: RegExp[] = [
  /:\s*any\b/,
  /\bas\s+any\b/,
  /<\s*any\s*>/,
  /\bany\s*\[\s*]/,
  /\bArray\s*<\s*any\s*>/,
  /\bRecord\s*<[^>]*,\s*any\s*>/,
];

const expectNoExplicitAny = (path: string) => {
  const source = readSource(path);
  for (const pattern of EXPLICIT_ANY_PATTERNS) {
    expect(source).not.toMatch(pattern);
  }
};

describe('TypeScript strictness regression', () => {
  it('services/comfyUIService.ts has no explicit any', () => {
    expectNoExplicitAny('../comfyUIService.ts');
  });

  it('utils/migrations.ts has no explicit any', () => {
    expectNoExplicitAny('../../utils/migrations.ts');
  });
});

