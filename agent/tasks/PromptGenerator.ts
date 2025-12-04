/**
 * PromptGenerator - Creates Copilot-ready prompts from issues
 * 
 * Generates individual, actionable prompts that can be:
 * - Copy/pasted to GitHub Copilot Chat in VS Code
 * - Piped to GitHub Copilot CLI
 * - Used with cloud-based AI agents
 * 
 * Each prompt includes:
 * - Issue context and location
 * - Relevant file content snippets
 * - Project conventions to follow
 * - Expected outcome and success criteria
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Issue, AgentConfig } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

export interface PromptConfig {
  /** Maximum lines of source code to include */
  maxSourceLines: number;
  /** Include related files (imports, tests) */
  includeRelatedFiles: boolean;
  /** Include project conventions */
  includeConventions: boolean;
  /** Target format: 'chat' for VS Code, 'cli' for terminal */
  targetFormat: 'chat' | 'cli' | 'both';
}

export interface GeneratedPrompt {
  issueId: string;
  issue: Issue;
  prompt: string;
  filename: string;
  category: string;
  severity: string;
  generatedAt: Date;
  targetFormat: 'chat' | 'cli';
}

const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  maxSourceLines: 80,
  includeRelatedFiles: true,
  includeConventions: true,
  targetFormat: 'both',
};

export class PromptGenerator {
  private promptsDir: string;
  private config: AgentConfig;
  private promptConfig: PromptConfig;

  constructor(config: AgentConfig, promptConfig: Partial<PromptConfig> = {}) {
    this.config = config;
    this.promptConfig = { ...DEFAULT_PROMPT_CONFIG, ...promptConfig };
    this.promptsDir = path.join(config.projectRoot, 'agent', 'prompts');
    
    // Ensure directory exists
    fs.mkdirSync(this.promptsDir, { recursive: true });
    fs.mkdirSync(path.join(this.promptsDir, 'chat'), { recursive: true });
    fs.mkdirSync(path.join(this.promptsDir, 'cli'), { recursive: true });
    fs.mkdirSync(path.join(this.promptsDir, 'batch'), { recursive: true });
  }

  /**
   * Generate prompts for a single issue
   */
  generatePrompt(issue: Issue): GeneratedPrompt[] {
    const prompts: GeneratedPrompt[] = [];
    const formats = this.promptConfig.targetFormat === 'both' 
      ? ['chat', 'cli'] as const
      : [this.promptConfig.targetFormat] as const;

    for (const format of formats) {
      const prompt = format === 'chat' 
        ? this.buildChatPrompt(issue)
        : this.buildCliPrompt(issue);

      const filename = this.generateFilename(issue, format);
      const fullPath = path.join(this.promptsDir, format, filename);

      fs.writeFileSync(fullPath, prompt, 'utf-8');

      prompts.push({
        issueId: issue.id,
        issue,
        prompt,
        filename,
        category: issue.category,
        severity: issue.severity,
        generatedAt: new Date(),
        targetFormat: format,
      });
    }

    return prompts;
  }

  /**
   * Generate prompts for multiple issues
   */
  generatePrompts(issues: Issue[]): GeneratedPrompt[] {
    const logger = getLogger();
    const allPrompts: GeneratedPrompt[] = [];

    for (const issue of issues) {
      try {
        const prompts = this.generatePrompt(issue);
        allPrompts.push(...prompts);
      } catch (error) {
        logger.error(`Failed to generate prompt for ${issue.id}:`, error);
      }
    }

    // Generate index file
    this.generateIndex(allPrompts);

    logger.info(`Generated ${allPrompts.length} prompts for ${issues.length} issues`);
    return allPrompts;
  }

  /**
   * Build a prompt optimized for VS Code Copilot Chat
   */
  private buildChatPrompt(issue: Issue): string {
    const sourceContext = this.getSourceContext(issue);
    const conventions = this.promptConfig.includeConventions ? this.getProjectConventions(issue) : '';
    const relatedFiles = this.promptConfig.includeRelatedFiles ? this.getRelatedFiles(issue) : '';

    return `# Fix: ${issue.category.toUpperCase()} Issue

## Problem
${this.formatIssueDescription(issue)}

## Location
- **File**: \`${issue.file || 'N/A'}\`
- **Line**: ${issue.line || 'N/A'}
- **Severity**: ${issue.severity}

## Source Context
${sourceContext}

${relatedFiles ? `## Related Files\n${relatedFiles}\n` : ''}
${conventions ? `## Project Conventions\n${conventions}\n` : ''}
## Task
Please fix this issue following the project conventions. The fix should:
1. Address the root cause, not just the symptom
2. Maintain type safety (TypeScript strict mode)
3. Include any necessary imports
4. Preserve existing functionality

${issue.suggestedFix ? `## Suggested Approach\n${issue.suggestedFix}\n` : ''}
## Expected Outcome
- The ${issue.category} error/warning should be resolved
- No new issues should be introduced
- Code should pass \`npm run typecheck\` and \`npm test\`
`;
  }

  /**
   * Build a prompt optimized for GitHub Copilot CLI
   */
  private buildCliPrompt(issue: Issue): string {
    const sourceContext = this.getSourceContext(issue);
    
    return `Fix this ${issue.category} issue in ${issue.file || 'the project'}:

ISSUE: ${issue.message}
${issue.line ? `LINE: ${issue.line}` : ''}
SEVERITY: ${issue.severity}

CONTEXT:
${sourceContext}

${issue.suggestedFix ? `SUGGESTED FIX: ${issue.suggestedFix}\n` : ''}
REQUIREMENTS:
- Fix must be TypeScript-safe
- Must not break existing functionality
- Should follow project patterns

Provide the exact code change needed.`;
  }

  /**
   * Get source code context around the issue
   */
  private getSourceContext(issue: Issue): string {
    if (!issue.file) {
      return '_No source file associated with this issue._';
    }

    const fullPath = path.isAbsolute(issue.file) 
      ? issue.file 
      : path.join(this.config.projectRoot, issue.file);

    try {
      if (!fs.existsSync(fullPath)) {
        return `_File not found: ${issue.file}_`;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      
      if (!issue.line) {
        // Return first N lines if no specific line
        const preview = lines.slice(0, Math.min(30, this.promptConfig.maxSourceLines));
        return this.formatCodeBlock(preview.join('\n'), issue.file);
      }

      // Get context around the specific line
      const lineNum = issue.line - 1; // 0-indexed
      const contextBefore = 10;
      const contextAfter = 15;
      const start = Math.max(0, lineNum - contextBefore);
      const end = Math.min(lines.length, lineNum + contextAfter);
      
      const contextLines = lines.slice(start, end);
      const highlightLine = lineNum - start;
      
      // Add line numbers and highlight the issue line
      const numbered = contextLines.map((line, i) => {
        const num = start + i + 1;
        const prefix = i === highlightLine ? '>>> ' : '    ';
        return `${prefix}${num.toString().padStart(4)}: ${line}`;
      });

      return '```typescript\n' + numbered.join('\n') + '\n```';
    } catch (error) {
      return `_Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}_`;
    }
  }

  /**
   * Get project conventions relevant to the issue category
   */
  private getProjectConventions(issue: Issue): string {
    const conventions: Record<string, string> = {
      typescript: `- Use TypeScript strict mode
- All API calls must go through service layer (never direct from components)
- Use \`withRetry\` wrapper for Gemini API calls
- Prefer \`import type\` for type-only imports`,

      test: `- Use Vitest for unit tests
- Test files named \`*.test.ts\` or \`*.spec.ts\`
- Use \`describe\`, \`it\`, \`expect\` from vitest
- Mock external dependencies with \`vi.mock()\``,

      'service-layer': `- Components must NOT call APIs directly
- Use services in \`services/\` directory
- Gemini calls go through \`geminiService.ts\`
- ComfyUI calls go through \`comfyUIService.ts\``,

      lint: `- Follow ESLint configuration
- No unused variables (prefix with _ if intentional)
- Consistent formatting via Prettier`,

      gap: `- All services should have corresponding tests
- Use \`usePersistentState\` for data persistence
- Document public APIs with JSDoc comments`,
    };

    return conventions[issue.category] || conventions['typescript'] || '';
  }

  /**
   * Get related files that might need modification
   */
  private getRelatedFiles(issue: Issue): string {
    if (!issue.file) return '';

    const relatedPaths: string[] = [];
    const dirName = path.dirname(issue.file);

    // Look for test file
    const testFile = issue.file.replace(/\.(ts|tsx)$/, '.test.$1');
    if (fs.existsSync(path.join(this.config.projectRoot, testFile))) {
      relatedPaths.push(testFile);
    }

    // Look for types file
    const typesFile = path.join(dirName, 'types.ts');
    if (fs.existsSync(path.join(this.config.projectRoot, typesFile))) {
      relatedPaths.push(typesFile);
    }

    // Look for index file
    const indexFile = path.join(dirName, 'index.ts');
    if (fs.existsSync(path.join(this.config.projectRoot, indexFile))) {
      relatedPaths.push(indexFile);
    }

    if (relatedPaths.length === 0) return '';

    return relatedPaths.map(p => `- \`${p}\``).join('\n');
  }

  /**
   * Format issue description for readability
   */
  private formatIssueDescription(issue: Issue): string {
    let desc = issue.message;

    // Extract TypeScript error code if present
    const tsMatch = desc.match(/^(TS\d+):\s*(.+)$/);
    if (tsMatch) {
      const code = tsMatch[1];
      const msg = tsMatch[2];
      return `**${code}**: ${msg}`;
    }

    return desc;
  }

  /**
   * Format code as a markdown code block
   */
  private formatCodeBlock(code: string, filename?: string): string {
    const lang = filename?.endsWith('.tsx') ? 'tsx' 
      : filename?.endsWith('.ts') ? 'typescript'
      : filename?.endsWith('.json') ? 'json'
      : 'typescript';
    
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }

  /**
   * Generate a unique filename for the prompt
   */
  private generateFilename(issue: Issue, _format: 'chat' | 'cli'): string {
    const sanitized = issue.id.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 60);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    return `${sanitized}-${timestamp}.md`;
  }

  /**
   * Generate an index file listing all prompts
   */
  private generateIndex(prompts: GeneratedPrompt[]): void {
    const byCategory: Record<string, GeneratedPrompt[]> = {};
    
    for (const prompt of prompts) {
      if (!byCategory[prompt.category]) {
        byCategory[prompt.category] = [];
      }
      byCategory[prompt.category]!.push(prompt);
    }

    const indexContent = `# Generated Prompts

Generated: ${new Date().toISOString()}
Total Prompts: ${prompts.length}

## Quick Actions

### Copy to Clipboard (PowerShell)
\`\`\`powershell
# Copy a specific prompt to clipboard
Get-Content "agent/prompts/chat/<filename>.md" | Set-Clipboard

# Or use the CLI version
Get-Content "agent/prompts/cli/<filename>.md" | Set-Clipboard
\`\`\`

### Pipe to Copilot CLI
\`\`\`powershell
# Process with GitHub Copilot CLI
Get-Content "agent/prompts/cli/<filename>.md" | gh copilot suggest
\`\`\`

## Prompts by Category

${Object.entries(byCategory).map(([category, categoryPrompts]) => `
### ${category.toUpperCase()} (${categoryPrompts.length})

| Severity | File | Prompt |
|----------|------|--------|
${categoryPrompts.map(p => `| ${p.severity} | \`${p.issue.file || 'N/A'}\` | [${p.filename}](./${p.targetFormat}/${p.filename}) |`).join('\n')}
`).join('\n')}

## Usage Tips

1. **VS Code Copilot Chat**: Open a prompt from \`chat/\` and copy its contents to Copilot Chat
2. **CLI Processing**: Use prompts from \`cli/\` for terminal-based workflows
3. **Batch Processing**: Check \`batch/\` for combined prompts by category
`;

    fs.writeFileSync(path.join(this.promptsDir, 'INDEX.md'), indexContent, 'utf-8');
  }

  /**
   * Generate a batch prompt for all issues in a category
   */
  generateBatchPrompt(issues: Issue[], category: string): string {
    const filename = `batch-${category}-${Date.now()}.md`;
    
    const prompt = `# Batch Fix: ${category.toUpperCase()} Issues

## Overview
There are ${issues.length} ${category} issues to fix.

## Issues

${issues.map((issue, i) => `
### Issue ${i + 1}: ${issue.file || 'Unknown file'}
${this.formatIssueDescription(issue)}
- Line: ${issue.line || 'N/A'}
- Severity: ${issue.severity}

${this.getSourceContext(issue)}
`).join('\n---\n')}

## Instructions
Please fix all the above issues. For each fix:
1. Show the file path
2. Show the exact change needed
3. Explain briefly why this fixes the issue
`;

    fs.writeFileSync(path.join(this.promptsDir, 'batch', filename), prompt, 'utf-8');
    return prompt;
  }

  /**
   * Get all generated prompts
   */
  getGeneratedPrompts(): { chat: string[]; cli: string[]; batch: string[] } {
    const result = { chat: [] as string[], cli: [] as string[], batch: [] as string[] };

    for (const format of ['chat', 'cli', 'batch'] as const) {
      const dir = path.join(this.promptsDir, format);
      if (fs.existsSync(dir)) {
        result[format] = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      }
    }

    return result;
  }

  /**
   * Read a specific prompt by filename
   */
  readPrompt(filename: string, format: 'chat' | 'cli' | 'batch' = 'chat'): string | null {
    const filePath = path.join(this.promptsDir, format, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  }

  /**
   * Clear all generated prompts
   */
  clearPrompts(): void {
    for (const format of ['chat', 'cli', 'batch']) {
      const dir = path.join(this.promptsDir, format);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    }
    getLogger().info('Cleared all generated prompts');
  }
}
