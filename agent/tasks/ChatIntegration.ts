/**
 * ChatIntegration - Generate prompts optimized for VS Code Copilot Chat
 * 
 * Creates prompts that:
 * - Use @workspace context for file awareness
 * - Include proper markdown formatting
 * - Can be saved as .prompt.md files for easy access
 * - Support batch operations across multiple issues
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Issue, AgentConfig } from '../core/types.js';
import { StateManager } from '../core/StateManager.js';
import { getLogger } from '../core/Logger.js';

export interface ChatPromptOptions {
  /** Include @workspace context reference */
  includeWorkspaceContext: boolean;
  /** Include file content preview */
  includeFilePreview: boolean;
  /** Maximum lines of code to include */
  maxCodeLines: number;
  /** Generate as .prompt.md for VS Code prompt files */
  asPromptFile: boolean;
}

const DEFAULT_OPTIONS: ChatPromptOptions = {
  includeWorkspaceContext: true,
  includeFilePreview: true,
  maxCodeLines: 60,
  asPromptFile: false,
};

export class ChatIntegration {
  private chatPromptsDir: string;
  
  constructor(
    private config: AgentConfig,
    _stateManager: StateManager
  ) {
    this.chatPromptsDir = path.join(config.projectRoot, 'agent', 'prompts', 'chat');
    fs.mkdirSync(this.chatPromptsDir, { recursive: true });
  }

  /**
   * Generate a prompt optimized for VS Code Copilot Chat
   */
  generateChatPrompt(issue: Issue, options: Partial<ChatPromptOptions> = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const parts: string[] = [];

    // Title
    parts.push(`# Fix: ${this.getCategoryEmoji(issue.category)} ${issue.category.toUpperCase()} Issue`);
    parts.push('');

    // Workspace context hint
    if (opts.includeWorkspaceContext && issue.file) {
      parts.push(`> Use \`@workspace\` to help Copilot understand the project context`);
      parts.push('');
    }

    // Problem section
    parts.push('## Problem');
    parts.push('');
    parts.push(this.formatMessage(issue));
    parts.push('');

    // Location
    parts.push('## Location');
    parts.push('');
    parts.push(`- **File**: \`${issue.file || 'N/A'}\``);
    if (issue.line) {
      parts.push(`- **Line**: ${issue.line}${issue.column ? `:${issue.column}` : ''}`);
    }
    parts.push(`- **Severity**: ${this.getSeverityBadge(issue.severity)}`);
    parts.push('');

    // Code context
    if (opts.includeFilePreview && issue.file) {
      const preview = this.getCodePreview(issue, opts.maxCodeLines);
      if (preview) {
        parts.push('## Code Context');
        parts.push('');
        parts.push(preview);
        parts.push('');
      }
    }

    // Task description
    parts.push('## Task');
    parts.push('');
    parts.push('Please fix this issue. Your fix should:');
    parts.push('');
    parts.push('1. Address the root cause, not just the symptom');
    parts.push('2. Maintain TypeScript strict mode compliance');
    parts.push('3. Follow existing code patterns in the project');
    parts.push('4. Include any necessary imports');
    parts.push('');

    // Suggested approach if available
    if (issue.suggestedFix) {
      parts.push('## Suggested Approach');
      parts.push('');
      parts.push(issue.suggestedFix);
      parts.push('');
    }

    // Project conventions
    parts.push('## Project Conventions');
    parts.push('');
    parts.push(this.getConventions(issue.category));
    parts.push('');

    // Expected outcome
    parts.push('## Expected Outcome');
    parts.push('');
    parts.push('After fixing:');
    parts.push('- `npm run typecheck` should pass');
    parts.push('- `npm test` should pass');
    parts.push('- No new issues should be introduced');

    return parts.join('\n');
  }

  /**
   * Generate a .prompt.md file for VS Code
   */
  generatePromptFile(issue: Issue): string {
    const prompt = this.generateChatPrompt(issue, { asPromptFile: true });
    
    // Add VS Code prompt file metadata
    const metadata = `---
name: "Fix ${issue.category} issue"
description: "Automated fix for ${issue.id}"
authors: ["Project Guardian"]
model: "copilot-chat"
---

`;

    return metadata + prompt;
  }

  /**
   * Save prompt to file and return the path
   */
  savePrompt(issue: Issue, asPromptFile = false): string {
    const content = asPromptFile 
      ? this.generatePromptFile(issue)
      : this.generateChatPrompt(issue);

    const extension = asPromptFile ? '.prompt.md' : '.md';
    const sanitizedId = issue.id.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
    const filename = `${sanitizedId}-${Date.now()}${extension}`;
    const filepath = path.join(this.chatPromptsDir, filename);

    fs.writeFileSync(filepath, content, 'utf-8');
    getLogger().info(`Saved chat prompt: ${filename}`);

    return filepath;
  }

  /**
   * Generate prompts for multiple issues
   */
  generateBatchPrompts(issues: Issue[]): { prompts: Map<string, string>; saved: string[] } {
    const prompts = new Map<string, string>();
    const saved: string[] = [];

    for (const issue of issues) {
      const prompt = this.generateChatPrompt(issue);
      prompts.set(issue.id, prompt);
      
      const filepath = this.savePrompt(issue);
      saved.push(filepath);
    }

    // Generate index
    this.generateBatchIndex(issues, saved);

    return { prompts, saved };
  }

  /**
   * Generate a combined prompt for multiple related issues
   */
  generateCombinedPrompt(issues: Issue[], title: string): string {
    const parts: string[] = [];

    parts.push(`# Batch Fix: ${title}`);
    parts.push('');
    parts.push(`> There are ${issues.length} related issues to fix`);
    parts.push('');

    // Summary table
    parts.push('## Issues Summary');
    parts.push('');
    parts.push('| # | File | Issue |');
    parts.push('|---|------|-------|');
    issues.forEach((issue, i) => {
      const shortMsg = issue.message.substring(0, 40) + (issue.message.length > 40 ? '...' : '');
      parts.push(`| ${i + 1} | \`${issue.file || 'N/A'}\` | ${shortMsg} |`);
    });
    parts.push('');

    // Individual issues
    issues.forEach((issue, i) => {
      parts.push(`## Issue ${i + 1}: ${issue.file || 'Unknown file'}`);
      parts.push('');
      parts.push(this.formatMessage(issue));
      parts.push('');
      
      const preview = this.getCodePreview(issue, 30);
      if (preview) {
        parts.push(preview);
        parts.push('');
      }
      
      parts.push('---');
      parts.push('');
    });

    // Combined task
    parts.push('## Task');
    parts.push('');
    parts.push('Please fix all the issues listed above. For each fix:');
    parts.push('1. Show the file path');
    parts.push('2. Provide the exact code change');
    parts.push('3. Briefly explain why this fixes the issue');
    parts.push('');
    parts.push('Use `@workspace` to reference project files as needed.');

    return parts.join('\n');
  }

  /**
   * Get quick action snippets for common operations
   */
  getQuickActions(): { name: string; command: string; description: string }[] {
    return [
      {
        name: 'Copy first prompt',
        command: 'Get-Content (Get-ChildItem "agent/prompts/chat/*.md" | Select-Object -First 1) | Set-Clipboard',
        description: 'Copy the first available prompt to clipboard',
      },
      {
        name: 'List all prompts',
        command: 'Get-ChildItem "agent/prompts/chat/*.md" | Format-Table Name, Length, LastWriteTime',
        description: 'Show all generated chat prompts',
      },
      {
        name: 'Open prompt in VS Code',
        command: 'code (Get-ChildItem "agent/prompts/chat/*.md" | Select-Object -First 1)',
        description: 'Open the first prompt in VS Code',
      },
      {
        name: 'Generate fresh prompts',
        command: 'npm run guardian -- --generate-prompts',
        description: 'Generate new prompts for all current issues',
      },
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private formatMessage(issue: Issue): string {
    let msg = issue.message;

    // Format TypeScript error codes
    const tsMatch = msg.match(/^(TS\d+):\s*(.+)$/);
    if (tsMatch) {
      return `**${tsMatch[1]}**: ${tsMatch[2]}`;
    }

    return msg;
  }

  private getCodePreview(issue: Issue, maxLines: number): string | null {
    if (!issue.file) return null;

    const fullPath = path.isAbsolute(issue.file)
      ? issue.file
      : path.join(this.config.projectRoot, issue.file);

    try {
      if (!fs.existsSync(fullPath)) return null;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const lang = this.getLanguage(issue.file);

      if (!issue.line) {
        // No specific line - show first N lines
        const preview = lines.slice(0, Math.min(maxLines, lines.length));
        return `\`\`\`${lang}\n${preview.join('\n')}\n\`\`\``;
      }

      // Show context around the issue line
      const lineNum = issue.line - 1;
      const contextBefore = 8;
      const contextAfter = 12;
      const start = Math.max(0, lineNum - contextBefore);
      const end = Math.min(lines.length, lineNum + contextAfter);

      const contextLines = lines.slice(start, end);
      const highlightIdx = lineNum - start;

      // Add line numbers and highlight
      const numbered = contextLines.map((line, i) => {
        const num = (start + i + 1).toString().padStart(4);
        const marker = i === highlightIdx ? '>>>' : '   ';
        return `${marker} ${num} │ ${line}`;
      });

      return `\`\`\`${lang}\n${numbered.join('\n')}\n\`\`\``;
    } catch {
      return null;
    }
  }

  private getLanguage(file: string): string {
    if (file.endsWith('.tsx')) return 'tsx';
    if (file.endsWith('.ts')) return 'typescript';
    if (file.endsWith('.jsx')) return 'jsx';
    if (file.endsWith('.js')) return 'javascript';
    if (file.endsWith('.json')) return 'json';
    if (file.endsWith('.css')) return 'css';
    if (file.endsWith('.scss')) return 'scss';
    if (file.endsWith('.md')) return 'markdown';
    return 'typescript';
  }

  private getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      typescript: '🔷',
      test: '🧪',
      lint: '📝',
      build: '🏗️',
      doc: '📚',
      perf: '⚡',
      security: '🔒',
      'service-layer': '🔌',
      gap: '🕳️',
    };
    return emojis[category] || '❓';
  }

  private getSeverityBadge(severity: string): string {
    const badges: Record<string, string> = {
      critical: '🚨 Critical',
      high: '⚠️ High',
      medium: '📝 Medium',
      low: 'ℹ️ Low',
    };
    return badges[severity] || severity;
  }

  private getConventions(category: string): string {
    const conventions: Record<string, string> = {
      typescript: `- Use TypeScript strict mode
- All API calls go through service layer (never direct from components)
- Use \`withRetry\` wrapper for Gemini API calls
- Prefer \`import type\` for type-only imports`,

      test: `- Use Vitest for unit tests
- Test files: \`*.test.ts\` or \`*.spec.ts\`
- Use \`describe\`, \`it\`, \`expect\` from vitest
- Mock external deps with \`vi.mock()\``,

      'service-layer': `- Components must NOT call APIs directly
- Use services in \`services/\` directory
- Gemini calls: \`geminiService.ts\`
- ComfyUI calls: \`comfyUIService.ts\``,

      lint: `- Follow ESLint configuration
- No unused variables (prefix with _ if intentional)
- Consistent formatting`,

      gap: `- All services should have tests
- Use \`usePersistentState\` for data persistence
- Document public APIs with JSDoc`,
    };

    return conventions[category] || conventions['typescript'] || '';
  }

  private generateBatchIndex(issues: Issue[], savedPaths: string[]): void {
    const indexPath = path.join(this.chatPromptsDir, 'BATCH-INDEX.md');
    
    const parts: string[] = [];
    parts.push('# Batch Prompts Index');
    parts.push('');
    parts.push(`Generated: ${new Date().toISOString()}`);
    parts.push(`Total: ${issues.length} prompts`);
    parts.push('');
    parts.push('## Prompts');
    parts.push('');
    parts.push('| Category | File | Prompt |');
    parts.push('|----------|------|--------|');
    
    issues.forEach((issue, i) => {
      const filename = path.basename(savedPaths[i] || '');
      parts.push(`| ${issue.category} | \`${issue.file || 'N/A'}\` | [${filename}](./${filename}) |`);
    });

    parts.push('');
    parts.push('## Quick Actions');
    parts.push('');
    parts.push('```powershell');
    parts.push('# Copy first prompt to clipboard');
    parts.push('Get-Content (Get-ChildItem "agent/prompts/chat/*.md" -Exclude "*.INDEX.md" | Select-Object -First 1) | Set-Clipboard');
    parts.push('```');

    fs.writeFileSync(indexPath, parts.join('\n'), 'utf-8');
  }
}
