import { readFileSync } from 'fs';
import { resolve } from 'path';
import { test, expect } from 'vitest';

const queueScriptPath = resolve(__dirname, '..', 'queue-real-workflow.ps1');
const queueScript = readFileSync(queueScriptPath, 'utf8');

test('queue-real-workflow.ps1 includes frame stability verification', () => {
  expect(queueScript).toContain('stabilitySeconds');
  expect(queueScript).toContain('stabilityRetries');
  expect(queueScript).toContain('Debug: verifying file stability');
  expect(queueScript).toContain('forced copy after');
});
