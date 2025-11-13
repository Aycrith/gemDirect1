import { readFileSync } from 'fs';
import { resolve } from 'path';
import { test, expect } from 'vitest';

const queueScriptPath = resolve(__dirname, '..', 'queue-real-workflow.ps1');
const queueScript = readFileSync(queueScriptPath, 'utf8');

test('queue-real-workflow.ps1 contains required telemetry field names', () => {
  expect(queueScript).toContain('DurationSeconds');
  expect(queueScript).toContain('ExecutionSuccessDetected');
  expect(queueScript).toContain('HistoryExitReason');
  expect(queueScript).toContain('VramBeforeMB');
  expect(queueScript).toContain('VramAfterMB');
  expect(queueScript).toContain('VramDeltaMB');
  expect(queueScript).toContain('System.FallbackNotes');
});
