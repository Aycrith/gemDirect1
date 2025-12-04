/**
 * TestWatcher - Monitors test results from Vitest
 * Runs tests and parses output for failures
 */

import { spawn } from 'child_process';
import type { Issue, ScanResult, AgentConfig } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

export class TestWatcher {
  constructor(private config: AgentConfig) {}

  async scan(): Promise<ScanResult> {
    const logger = getLogger();
    const startTime = Date.now();
    const issues: Issue[] = [];

    logger.info('Running Vitest...');

    try {
      const output = await this.runTests();
      const parsed = this.parseOutput(output);
      issues.push(...parsed);
    } catch (error: unknown) {
      const errorData = error as { stdout?: string; stderr?: string };
      if (errorData.stdout) {
        const parsed = this.parseOutput(errorData.stdout);
        issues.push(...parsed);
      }
      if (errorData.stderr && !errorData.stdout) {
        issues.push({
          id: `test-runner-error-${Date.now()}`,
          type: 'error',
          severity: 'critical',
          category: 'test',
          message: `Test runner error: ${errorData.stderr.substring(0, 500)}`,
          autoFixable: false,
          timestamp: new Date(),
        });
      }
    }

    const duration = Date.now() - startTime;

    if (issues.length > 0) {
      logger.warn(`Tests: Found ${issues.length} failures`);
    } else {
      logger.success('Tests: All passing');
    }

    return {
      scanner: 'tests',
      timestamp: new Date(),
      duration,
      issuesFound: issues,
    };
  }

  private runTests(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['test', '--', '--run', '--reporter=json'], {
        cwd: this.config.projectRoot,
        shell: true,
        timeout: 300000, // 5 minute timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject({ code, stdout, stderr });
        }
      });

      child.on('error', (err) => {
        reject({ error: err, stdout, stderr });
      });
    });
  }

  private parseOutput(output: string): Issue[] {
    const issues: Issue[] = [];

    // Try to parse JSON reporter output
    try {
      const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        if (results.testResults) {
          for (const suite of results.testResults) {
            if (suite.status === 'failed') {
              for (const test of suite.assertionResults || []) {
                if (test.status === 'failed') {
                  issues.push({
                    id: `test-${this.sanitizeId(suite.name)}-${this.sanitizeId(test.title || test.fullName)}`,
                    type: 'error',
                    severity: 'high',
                    category: 'test',
                    file: suite.name,
                    message: `Test failed: ${test.title || test.fullName}\n${(test.failureMessages || []).join('\n').substring(0, 500)}`,
                    autoFixable: false,
                    timestamp: new Date(),
                  });
                }
              }
            }
          }
          return issues;
        }
      }
    } catch {
      // Fall through to regex parsing
    }

    // Fallback: regex parsing for non-JSON output
    const failureRegex = /FAIL\s+(.+)/g;
    let match;

    while ((match = failureRegex.exec(output)) !== null) {
      const failedFile = match[1];
      if (!failedFile) continue;
      issues.push({
        id: `test-fail-${this.sanitizeId(failedFile)}`,
        type: 'error',
        severity: 'high',
        category: 'test',
        file: failedFile.trim(),
        message: `Test suite failed: ${failedFile.trim()}`,
        autoFixable: false,
        timestamp: new Date(),
      });
    }

    // Also check for specific test failures
    const testFailRegex = /×\s+(.+?)\s+\((\d+)\s*ms\)/g;
    while ((match = testFailRegex.exec(output)) !== null) {
      const testName = match[1];
      if (!testName) continue;
      const trimmedName = testName.trim();
      if (!issues.some(i => i.message.includes(trimmedName))) {
        issues.push({
          id: `test-${this.sanitizeId(trimmedName)}`,
          type: 'error',
          severity: 'high',
          category: 'test',
          message: `Test failed: ${trimmedName}`,
          autoFixable: false,
          timestamp: new Date(),
        });
      }
    }

    return issues;
  }

  private sanitizeId(str: string): string {
    return str.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
  }

  async getTestCount(): Promise<{ total: number; passing: number; failing: number }> {
    try {
      const output = await this.runTests();
      
      // Parse Vitest summary
      const summaryMatch = output.match(/Tests\s+(\d+)\s+passed.*?(\d+)\s+failed/);
      if (summaryMatch && summaryMatch[1] && summaryMatch[2]) {
        const passing = parseInt(summaryMatch[1], 10);
        const failing = parseInt(summaryMatch[2], 10);
        return { total: passing + failing, passing, failing };
      }

      // Alternative format
      const altMatch = output.match(/(\d+)\s+passing.*?(\d+)\s+failing/);
      if (altMatch && altMatch[1] && altMatch[2]) {
        const passing = parseInt(altMatch[1], 10);
        const failing = parseInt(altMatch[2], 10);
        return { total: passing + failing, passing, failing };
      }

      return { total: 0, passing: 0, failing: 0 };
    } catch {
      return { total: 0, passing: 0, failing: 0 };
    }
  }
}
