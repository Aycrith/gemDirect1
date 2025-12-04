/**
 * AutoFix - Automatic fix implementations for common issues
 * Generates test scaffolds, applies lint fixes, stages changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Issue, FixResult, AgentConfig } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

export class AutoFix {
  constructor(private config: AgentConfig) {}

  async fix(issue: Issue): Promise<FixResult> {
    const logger = getLogger();
    logger.info(`AutoFix attempting: ${issue.id}`);

    switch (issue.category) {
      case 'test':
        if (issue.message.includes('No test file found')) {
          return this.generateTestScaffold(issue);
        }
        break;

      case 'lint':
        if (issue.autoFixable && issue.file) {
          return this.applyLintFix(issue);
        }
        break;

      case 'typescript':
        return this.handleTypeScriptError(issue);

      default:
        break;
    }

    // If we can't auto-fix, queue for Copilot
    return {
      issueId: issue.id,
      success: false,
      action: 'queued',
      message: `Issue queued for manual review: ${issue.category}`,
      timestamp: new Date(),
    };
  }

  private async generateTestScaffold(issue: Issue): Promise<FixResult> {
    const logger = getLogger();
    const srcFile = issue.file;
    
    if (!srcFile) {
      return {
        issueId: issue.id,
        success: false,
        action: 'skipped',
        message: 'No source file specified',
        timestamp: new Date(),
      };
    }

    const fullSrcPath = path.join(this.config.projectRoot, srcFile);
    const testFile = srcFile.replace(/\.(ts|tsx)$/, '.test.$1');
    const fullTestPath = path.join(this.config.projectRoot, testFile);

    // Don't overwrite existing test file
    if (fs.existsSync(fullTestPath)) {
      return {
        issueId: issue.id,
        success: false,
        action: 'skipped',
        message: 'Test file already exists',
        timestamp: new Date(),
      };
    }

    try {
      // Read source to analyze exports
      const sourceContent = fs.readFileSync(fullSrcPath, 'utf-8');
      const exports = this.extractExports(sourceContent);
      const isReact = srcFile.endsWith('.tsx');
      const moduleName = path.basename(srcFile, path.extname(srcFile));
      const relativePath = `./${moduleName}`;

      const testContent = isReact
        ? this.generateReactTestScaffold(moduleName, relativePath, exports)
        : this.generateUnitTestScaffold(moduleName, relativePath, exports);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(fullTestPath), { recursive: true });
      fs.writeFileSync(fullTestPath, testContent, 'utf-8');

      logger.success(`Generated test file: ${testFile}`);

      // Stage the file if configured
      if (this.config.autoStage) {
        await this.gitAdd(testFile);
      }

      return {
        issueId: issue.id,
        success: true,
        action: this.config.autoStage ? 'staged' : 'auto-fixed',
        message: `Generated test scaffold: ${testFile}`,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`Failed to generate test: ${error}`);
      return {
        issueId: issue.id,
        success: false,
        action: 'skipped',
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    
    // Match: export function name
    const funcMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const match of funcMatches) {
      const name = match[1];
      if (name) exports.push(name);
    }

    // Match: export const name
    const constMatches = content.matchAll(/export\s+const\s+(\w+)/g);
    for (const match of constMatches) {
      const name = match[1];
      if (name) exports.push(name);
    }

    // Match: export class name
    const classMatches = content.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g);
    for (const match of classMatches) {
      const name = match[1];
      if (name) exports.push(name);
    }

    // Match: export default function name
    const defaultFuncMatches = content.matchAll(/export\s+default\s+(?:async\s+)?function\s+(\w+)/g);
    for (const match of defaultFuncMatches) {
      const name = match[1];
      if (name) exports.push(name);
    }

    return [...new Set(exports)];
  }

  private generateUnitTestScaffold(moduleName: string, relativePath: string, exports: string[]): string {
    const importStatement = exports.length > 0
      ? `import { ${exports.join(', ')} } from '${relativePath}';`
      : `import * as ${moduleName} from '${relativePath}';`;

    const testCases = exports.length > 0
      ? exports.map(exp => `
  describe('${exp}', () => {
    it('should be defined', () => {
      expect(${exp}).toBeDefined();
    });

    // TODO: Add specific test cases for ${exp}
  });`).join('\n')
      : `
  it('module should be defined', () => {
    expect(${moduleName}).toBeDefined();
  });`;

    return `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
${importStatement}

describe('${moduleName}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
${testCases}
});
`;
  }

  private generateReactTestScaffold(moduleName: string, relativePath: string, exports: string[]): string {
    const componentName = exports.find(e => e.length > 0 && e[0] === e[0]?.toUpperCase()) || moduleName;

    return `import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ${componentName} } from '${relativePath}';

describe('${componentName}', () => {
  it('should render without crashing', () => {
    // TODO: Add required props
    // render(<${componentName} />);
    expect(true).toBe(true); // Placeholder - replace with actual test
  });

  it('should display expected content', () => {
    // TODO: Implement render test
    // render(<${componentName} />);
    // expect(screen.getByText('...')).toBeInTheDocument();
    expect(true).toBe(true); // Placeholder
  });

  // TODO: Add more specific test cases
});
`;
  }

  private async applyLintFix(issue: Issue): Promise<FixResult> {
    const logger = getLogger();
    
    if (!issue.file) {
      return {
        issueId: issue.id,
        success: false,
        action: 'skipped',
        message: 'No file specified for lint fix',
        timestamp: new Date(),
      };
    }

    try {
      await this.runCommand('npx', ['eslint', '--fix', issue.file]);
      logger.success(`Applied lint fix: ${issue.file}`);

      if (this.config.autoStage) {
        await this.gitAdd(issue.file);
      }

      return {
        issueId: issue.id,
        success: true,
        action: this.config.autoStage ? 'staged' : 'auto-fixed',
        message: `Applied ESLint fix to ${issue.file}`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        issueId: issue.id,
        success: false,
        action: 'skipped',
        message: `Lint fix failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      };
    }
  }

  private async handleTypeScriptError(issue: Issue): Promise<FixResult> {
    // Most TypeScript errors need manual fixing, but we can suggest
    const suggestedFix = this.getSuggestedTypescriptFix(issue.message);

    return {
      issueId: issue.id,
      success: false,
      action: 'queued',
      message: suggestedFix || 'TypeScript error needs manual review',
      timestamp: new Date(),
    };
  }

  private getSuggestedTypescriptFix(message: string): string | undefined {
    if (message.includes('TS2307')) {
      // Cannot find module
      const moduleMatch = message.match(/Cannot find module '(.+?)'/);
      if (moduleMatch) {
        return `Install missing module: npm install ${moduleMatch[1]}`;
      }
    }

    if (message.includes('TS7006')) {
      // Parameter implicitly has 'any' type
      return 'Add explicit type annotation to parameter';
    }

    if (message.includes('TS6133')) {
      // Unused variable
      return 'Remove unused variable or prefix with underscore';
    }

    return undefined;
  }

  private async gitAdd(file: string): Promise<void> {
    const logger = getLogger();
    try {
      await this.runCommand('git', ['add', file]);
      logger.info(`Staged: ${file}`);
    } catch (error) {
      logger.warn(`Failed to stage ${file}: ${error}`);
    }
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
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

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }
}
