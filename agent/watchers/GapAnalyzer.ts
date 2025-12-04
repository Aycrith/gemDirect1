/**
 * GapAnalyzer - Identifies gaps in the codebase
 * Checks for missing tests, TODO comments, incomplete implementations
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Issue, ScanResult, AgentConfig } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

export class GapAnalyzer {
  constructor(private config: AgentConfig) {}

  async scan(): Promise<ScanResult> {
    const logger = getLogger();
    const startTime = Date.now();
    const issues: Issue[] = [];

    logger.info('Running gap analysis...');

    // Run all checks in parallel
    const [
      todoIssues,
      missingTestIssues,
      incompleteIssues,
      serviceViolationIssues,
    ] = await Promise.all([
      this.findTodoComments(),
      this.findMissingTests(),
      this.findIncompleteImplementations(),
      this.findServiceLayerViolations(),
    ]);

    issues.push(...todoIssues, ...missingTestIssues, ...incompleteIssues, ...serviceViolationIssues);

    const duration = Date.now() - startTime;

    if (issues.length > 0) {
      logger.warn(`Gap analysis: Found ${issues.length} issues`);
    } else {
      logger.success('Gap analysis: No issues');
    }

    return {
      scanner: 'gap-analysis',
      timestamp: new Date(),
      duration,
      issuesFound: issues,
    };
  }

  private async findTodoComments(): Promise<Issue[]> {
    const issues: Issue[] = [];

    try {
      const output = await this.grep('(TODO|FIXME|HACK|XXX):', 'src/');
      const lines = output.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(.+)$/);
        if (match) {
          const file = match[1];
          const lineNum = match[2];
          const content = match[3];
          if (!file || !lineNum || !content) continue;
          const severity = content.includes('FIXME') || content.includes('HACK') ? 'high' : 'medium';
          const type = content.includes('TODO') ? 'TODO' : content.match(/(FIXME|HACK|XXX)/)?.[0] || 'TODO';

          issues.push({
            id: `todo-${this.sanitizePath(file)}-${lineNum}`,
            type: 'gap',
            severity: severity as Issue['severity'],
            category: 'doc',
            file,
            line: parseInt(lineNum, 10),
            message: `${type}: ${content.trim()}`,
            autoFixable: false,
            timestamp: new Date(),
          });
        }
      }
    } catch {
      // grep returns non-zero if no matches, which is fine
    }

    return issues;
  }

  private async findMissingTests(): Promise<Issue[]> {
    const issues: Issue[] = [];
    const srcDirs = ['src', 'services', 'utils', 'hooks'];

    for (const dir of srcDirs) {
      const fullDir = path.join(this.config.projectRoot, dir);
      if (!fs.existsSync(fullDir)) continue;

      const files = this.findFiles(fullDir, /\.(ts|tsx)$/);
      
      for (const file of files) {
        // Skip test files and type definitions
        if (file.includes('.test.') || file.includes('.spec.') || file.endsWith('.d.ts')) {
          continue;
        }

        // Skip index files, types files, and config files
        const basename = path.basename(file);
        if (basename === 'index.ts' || basename === 'types.ts' || basename.includes('config')) {
          continue;
        }

        // Check if corresponding test file exists
        const testFile = file.replace(/\.(ts|tsx)$/, '.test.$1');
        const altTestFile = file.replace(/\.(ts|tsx)$/, '.spec.$1');
        
        if (!fs.existsSync(testFile) && !fs.existsSync(altTestFile)) {
          // Only flag services, utils, and hooks as requiring tests
          const relativePath = path.relative(this.config.projectRoot, file);
          if (this.shouldHaveTests(relativePath)) {
            issues.push({
              id: `missing-test-${this.sanitizePath(relativePath)}`,
              type: 'gap',
              severity: 'medium',
              category: 'test',
              file: relativePath,
              message: `No test file found for: ${relativePath}`,
              suggestedFix: `Create test file: ${relativePath.replace(/\.(ts|tsx)$/, '.test.$1')}`,
              autoFixable: true,
              timestamp: new Date(),
            });
          }
        }
      }
    }

    return issues;
  }

  private shouldHaveTests(filePath: string): boolean {
    // Services, utils, and hooks should definitely have tests
    return (
      filePath.startsWith('services/') ||
      filePath.startsWith('utils/') ||
      filePath.startsWith('hooks/')
    );
  }

  private async findIncompleteImplementations(): Promise<Issue[]> {
    const issues: Issue[] = [];

    try {
      const output = await this.grep('Not implemented|throw new Error.*implement', 'src/');
      const lines = output.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(.+)$/);
        if (match) {
          const file = match[1];
          const lineNum = match[2];
          if (!file || !lineNum) continue;
          issues.push({
            id: `not-implemented-${this.sanitizePath(file)}-${lineNum}`,
            type: 'gap',
            severity: 'high',
            category: 'build',
            file,
            line: parseInt(lineNum, 10),
            message: 'Incomplete implementation: throw new Error or "Not implemented" found',
            autoFixable: false,
            timestamp: new Date(),
          });
        }
      }
    } catch {
      // grep returns non-zero if no matches
    }

    return issues;
  }

  private async findServiceLayerViolations(): Promise<Issue[]> {
    const issues: Issue[] = [];
    const componentsDir = path.join(this.config.projectRoot, 'components');

    if (!fs.existsSync(componentsDir)) {
      return issues;
    }

    const files = this.findFiles(componentsDir, /\.tsx$/);

    for (const file of files) {
      // Skip test files
      if (file.includes('.test.')) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(this.config.projectRoot, file);

      // Check for direct fetch calls
      if (/\bfetch\s*\(/.test(content)) {
        issues.push({
          id: `service-violation-fetch-${this.sanitizePath(relativePath)}`,
          type: 'improvement',
          severity: 'medium',
          category: 'service-layer',
          file: relativePath,
          message: 'Direct fetch() call in component. Should use service layer.',
          suggestedFix: 'Move API call to appropriate service in services/',
          autoFixable: false,
          timestamp: new Date(),
        });
      }

      // Check for direct Gemini API usage
      if (/GoogleGenerativeAI|@google\/generative-ai|@google\/genai/.test(content)) {
        issues.push({
          id: `service-violation-gemini-${this.sanitizePath(relativePath)}`,
          type: 'improvement',
          severity: 'high',
          category: 'service-layer',
          file: relativePath,
          message: 'Direct Gemini API usage in component. Should use geminiService.',
          suggestedFix: 'Use geminiService.ts with withRetry wrapper',
          autoFixable: false,
          timestamp: new Date(),
        });
      }
    }

    return issues;
  }

  private grep(pattern: string, dir: string): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn('grep', ['-rn', '-E', pattern, dir], {
        cwd: this.config.projectRoot,
        shell: true,
        timeout: 30000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', () => {
        // grep returns 1 if no matches found (not an error)
        resolve(stdout);
      });

      child.on('error', () => {
        // Fallback for Windows without grep
        resolve('');
      });
    });
  }

  private findFiles(dir: string, pattern: RegExp): string[] {
    const files: string[] = [];

    const walk = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walk(fullPath);
          } else if (entry.isFile() && pattern.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };

    walk(dir);
    return files;
  }

  private sanitizePath(p: string): string {
    return p.replace(/[\\/:]/g, '-');
  }
}
