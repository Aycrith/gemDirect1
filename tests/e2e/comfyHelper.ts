import { execFile as nodeExecFile } from 'child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { TestInfo } from '@playwright/test';

const execFile = promisify(nodeExecFile);
const LOG_DIR = path.join(process.cwd(), 'test-results', 'comfyui-status');

export async function runComfyStatus(testInfo: TestInfo) {
  await mkdir(LOG_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${testInfo.title.replace(/\s+/g, '_')}-${timestamp}.log`;
  const logPath = path.join(LOG_DIR, fileName);

  const attachLogFile = async () => {
    try {
      if (existsSync(logPath)) {
        await testInfo.attach('comfyui-status-log', { path: logPath, contentType: 'text/plain' });
      }
    } catch (e) {
      console.warn('Failed to attach log file:', e);
    }
  };

  const attachSummaryIfAvailable = async (stdout: string) => {
    try {
      const match = /Helper summary written to (.+)/.exec(stdout);
      if (match) {
        const summaryPath = match[1].trim();
        if (existsSync(summaryPath)) {
          await testInfo.attach('comfyui-status-summary', { path: summaryPath, contentType: 'application/json' });
        }
      }
    } catch (e) {
      console.warn('Failed to attach summary:', e);
    }
  };

  const attachStdStreams = async (stdout?: string, stderr?: string) => {
    try {
      if (stdout) {
        await testInfo.attach('comfyui-status-stdout', { body: stdout, contentType: 'text/plain' });
      }
      if (stderr) {
        await testInfo.attach('comfyui-status-stderr', { body: stderr, contentType: 'text/plain' });
      }
    } catch (e) {
      console.warn('Failed to attach streams:', e);
    }
  };

  try {
    const helperArgs = ['scripts/comfyui-status.ts', '--summary-dir', LOG_DIR, '--log-path', logPath];
    const { stdout, stderr } = await execFile('node', helperArgs, { env: process.env });
    await attachLogFile();
    await attachSummaryIfAvailable(stdout ?? '');
    await attachStdStreams(stdout, stderr);
  } catch (error: any) {
    const stdout = error?.stdout ?? '';
    const stderr = error?.stderr ?? error?.message ?? 'Unknown error';
    await attachLogFile();
    await attachSummaryIfAvailable(stdout);
    await attachStdStreams(stdout, stderr);
    throw new Error(`comfyui-status failed: ${error?.message ?? 'Unknown error'}`);
  }
}
