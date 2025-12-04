/**
 * TypeScriptWatcher - Monitors TypeScript compilation errors
 * Runs tsc --noEmit and parses output for errors
 */

import { spawn } from 'child_process';
import type { Issue, ScanResult, AgentConfig } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

export class TypeScriptWatcher {
  constructor(private config: AgentConfig) {}

  async scan(): Promise<ScanResult> {
    const logger = getLogger();
    const startTime = Date.now();
    const issues: Issue[] = [];

    logger.info('Running TypeScript check...');

    try {
      const output = await this.runTsc();
      const parsed = this.parseOutput(output);
      issues.push(...parsed);
    } catch (error) {
      const errorOutput = error instanceof Error ? error.message : String(error);
      const parsed = this.parseOutput(errorOutput);
      issues.push(...parsed);
    }

    const duration = Date.now() - startTime;
    
    if (issues.length > 0) {
      logger.warn(`TypeScript: Found ${issues.length} errors`);
    } else {
      logger.success('TypeScript: No errors');
    }

    return {
      scanner: 'typescript',
      timestamp: new Date(),
      duration,
      issuesFound: issues,
    };
  }

  async scanFile(filePath: string): Promise<Issue[]> {
    const logger = getLogger();
    logger.debug(`TypeScript check on: ${filePath}`);

    try {
      const output = await this.runTsc(['--noEmit', filePath]);
      return this.parseOutput(output);
    } catch (error) {
      const errorOutput = error instanceof Error ? error.message : String(error);
      return this.parseOutput(errorOutput);
    }
  }

  private runTsc(args: string[] = []): Promise<string> {
    return new Promise((resolve, reject) => {
      const tscArgs = ['--noEmit', '--pretty', 'false', ...args];
      
      const child = spawn('npx', ['tsc', ...tscArgs], {
        cwd: this.config.projectRoot,
        shell: true,
        timeout: 120000, // 2 minute timeout
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
          // TypeScript exits with code 2 on errors, but output is still valid
          resolve(stdout + stderr);
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  private parseOutput(output: string): Issue[] {
    const issues: Issue[] = [];
    
    // TypeScript error format: file(line,col): error TSxxxx: message
    const errorRegex = /(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/g;
    let match;

    while ((match = errorRegex.exec(output)) !== null) {
      const file = match[1];
      const line = match[2];
      const col = match[3];
      const code = match[4];
      const message = match[5];
      
      if (!file || !line || !col || !code || !message) continue;
      
      issues.push({
        id: `ts-${file.replace(/[\\/:]/g, '-')}-${line}-${code}`,
        type: 'error',
        severity: this.getSeverity(code),
        category: 'typescript',
        file: file.trim(),
        line: parseInt(line, 10),
        column: parseInt(col, 10),
        message: `${code}: ${message.trim()}`,
        autoFixable: this.isAutoFixable(code),
        timestamp: new Date(),
      });
    }

    return issues;
  }

  private getSeverity(code: string): Issue['severity'] {
    // Critical errors that break builds
    const critical = ['TS2304', 'TS2307']; // Cannot find name, Cannot find module
    const high = ['TS2345', 'TS2322', 'TS2339']; // Type mismatch errors
    
    if (critical.includes(code)) return 'critical';
    if (high.includes(code)) return 'high';
    return 'medium';
  }

  private isAutoFixable(code: string): boolean {
    // These can potentially be auto-fixed
    const fixable = [
      'TS7006', // Parameter implicitly has 'any' type
      'TS2307', // Cannot find module (can suggest install)
      'TS6133', // Unused variable
    ];
    return fixable.includes(code);
  }
}
