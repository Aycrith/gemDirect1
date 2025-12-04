/**
 * CopilotQueue - Queue complex issues for GitHub Copilot CLI processing
 * Generates prompts and manages the queue of issues requiring AI assistance
 * 
 * Features:
 * - Individual and batch prompt generation
 * - Clipboard integration for easy copy/paste
 * - Semi-automated mode with user confirmation
 * - VS Code Copilot Chat compatible prompts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawn, execSync } from 'child_process';
import type { Issue, CopilotQueueItem, AgentConfig } from '../core/types.js';
import { StateManager } from '../core/StateManager.js';
import { getLogger } from '../core/Logger.js';

export interface ProcessOptions {
  /** Mode: 'auto' = process all, 'confirm' = ask before each, 'generate' = only generate prompts */
  mode: 'auto' | 'confirm' | 'generate';
  /** Copy prompts to clipboard */
  clipboard: boolean;
  /** Target: 'cli' for gh copilot, 'chat' for VS Code Copilot Chat */
  target: 'cli' | 'chat';
}

const DEFAULT_PROCESS_OPTIONS: ProcessOptions = {
  mode: 'generate',
  clipboard: true,
  target: 'chat',
};

export class CopilotQueue {
  private hasCopilotCli: boolean | null = null;

  constructor(
    private config: AgentConfig,
    private stateManager: StateManager
  ) {}

  async queueIssue(issue: Issue): Promise<void> {
    const logger = getLogger();
    const prompt = this.generatePrompt(issue);

    const item: CopilotQueueItem = {
      issue,
      requestedAt: new Date(),
      prompt,
    };

    this.stateManager.addToQueue(item);
    logger.info(`Queued issue for Copilot: ${issue.id}`);
  }

  /**
   * Process queue with options for confirmation and clipboard
   */
  async processQueue(options: Partial<ProcessOptions> = {}): Promise<{ processed: number; failed: number; skipped: number }> {
    const logger = getLogger();
    const opts = { ...DEFAULT_PROCESS_OPTIONS, ...options };
    
    const items = this.stateManager.getQueueItems();
    
    if (items.length === 0) {
      logger.info('Queue is empty');
      return { processed: 0, failed: 0, skipped: 0 };
    }

    logger.section(`Processing ${items.length} queued items (mode: ${opts.mode})`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // For confirm mode, set up readline
    let rl: readline.Interface | null = null;
    if (opts.mode === 'confirm') {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }

    for (const item of items) {
      try {
        logger.info(`\nProcessing: ${item.issue.id}`);
        logger.info(`  ${item.issue.category}: ${item.issue.message.substring(0, 60)}...`);
        
        // Generate prompt based on target
        const prompt = opts.target === 'chat' 
          ? this.generateChatPrompt(item.issue)
          : this.generatePrompt(item.issue);

        // In generate mode, just save prompts
        if (opts.mode === 'generate') {
          await this.savePromptFile(item, prompt, opts.target);
          
          if (opts.clipboard && processed === 0) {
            await this.copyToClipboard(prompt);
            logger.success('First prompt copied to clipboard');
          }
          
          processed++;
          continue;
        }

        // In confirm mode, ask user
        if (opts.mode === 'confirm' && rl) {
          console.log('\n' + '─'.repeat(50));
          console.log('Issue:', item.issue.message.substring(0, 100));
          console.log('File:', item.issue.file || 'N/A');
          console.log('─'.repeat(50));
          
          const answer = await this.askQuestion(rl, '\n  [c]opy to clipboard, [s]kip, [a]ll remaining, [q]uit: ');
          
          switch (answer.toLowerCase()) {
            case 'c':
              await this.copyToClipboard(prompt);
              await this.savePromptFile(item, prompt, opts.target);
              logger.success('Prompt copied to clipboard');
              this.stateManager.markQueueItemProcessed(item.issue.id, 'copied');
              processed++;
              break;
            case 's':
              skipped++;
              break;
            case 'a':
              // Process all remaining without asking
              opts.mode = 'generate';
              await this.copyToClipboard(prompt);
              await this.savePromptFile(item, prompt, opts.target);
              processed++;
              break;
            case 'q':
              rl.close();
              return { processed, failed, skipped: items.length - processed - failed - skipped };
            default:
              skipped++;
          }
          continue;
        }

        // Auto mode - try to get Copilot suggestion
        if (opts.mode === 'auto') {
          if (this.hasCopilotCli === null) {
            this.hasCopilotCli = await this.checkCopilotCli();
          }

          if (!this.hasCopilotCli) {
            // Fall back to generate mode
            await this.savePromptFile(item, prompt, opts.target);
            processed++;
            continue;
          }

          const suggestion = await this.getCopilotSuggestion(prompt);
          
          if (suggestion) {
            this.stateManager.markQueueItemProcessed(item.issue.id, suggestion);
            await this.saveSuggestion(item, suggestion);
            logger.success(`Got suggestion for: ${item.issue.id}`);
            processed++;
          } else {
            failed++;
          }
        }
      } catch (error) {
        logger.error(`Failed to process ${item.issue.id}`, error);
        failed++;
      }
    }

    if (rl) {
      rl.close();
    }

    logger.info(`\nQueue processing complete: ${processed} processed, ${failed} failed, ${skipped} skipped`);
    return { processed, failed, skipped };
  }

  /**
   * Generate a prompt optimized for VS Code Copilot Chat
   */
  generateChatPrompt(issue: Issue): string {
    const context = this.getFileContext(issue.file, 80);
    
    return `# Fix Request

## Issue
**${issue.category.toUpperCase()}** - ${issue.severity} severity

${issue.message}

## Location
- File: \`${issue.file || 'N/A'}\`
- Line: ${issue.line || 'N/A'}

## Code Context
${context ? `\`\`\`typescript\n${context}\n\`\`\`` : '_No file context available_'}

## Task
Please provide a fix for this issue. The fix should:
1. Address the root cause
2. Maintain TypeScript strict mode compliance
3. Follow project conventions (service layer for API calls, usePersistentState for data)
4. Include any necessary imports

${issue.suggestedFix ? `## Suggested Approach\n${issue.suggestedFix}` : ''}

Show me the exact code changes needed.`;
  }

  /**
   * Copy text to clipboard (Windows PowerShell)
   */
  async copyToClipboard(text: string): Promise<boolean> {
    try {
      // Write to temp file first (handles multi-line and special chars)
      const tempFile = path.join(this.config.projectRoot, 'agent', '.clipboard-temp.txt');
      fs.writeFileSync(tempFile, text, 'utf-8');
      
      // Use PowerShell to copy
      execSync(`Get-Content "${tempFile}" | Set-Clipboard`, { 
        shell: 'powershell.exe',
        timeout: 5000,
      });
      
      // Clean up
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      return true;
    } catch (error) {
      getLogger().warn('Failed to copy to clipboard:', error);
      return false;
    }
  }

  /**
   * Save prompt to file for later use
   */
  private async savePromptFile(item: CopilotQueueItem, prompt: string, target: 'cli' | 'chat'): Promise<string> {
    const promptsDir = path.join(this.config.projectRoot, 'agent', 'prompts', target);
    fs.mkdirSync(promptsDir, { recursive: true });

    const sanitizedId = item.issue.id.replace(/[^a-zA-Z0-9-]/g, '-').substring(0, 50);
    const filename = `${sanitizedId}-${Date.now()}.md`;
    const filepath = path.join(promptsDir, filename);

    fs.writeFileSync(filepath, prompt, 'utf-8');
    getLogger().debug(`Saved prompt: ${filename}`);
    
    return filepath;
  }

  /**
   * Helper to ask a question and get answer
   */
  private askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  }

  private generatePrompt(issue: Issue): string {
    const context = this.getFileContext(issue.file);
    
    return `You are an expert TypeScript/React developer. Please fix the following issue in this project.

## Issue Details
- **Type**: ${issue.type}
- **Severity**: ${issue.severity}
- **Category**: ${issue.category}
${issue.file ? `- **File**: ${issue.file}` : ''}
${issue.line ? `- **Line**: ${issue.line}` : ''}

## Problem
${issue.message}

${issue.suggestedFix ? `## Suggested Approach\n${issue.suggestedFix}\n` : ''}

${context ? `## Relevant Code Context\n\`\`\`typescript\n${context}\n\`\`\`` : ''}

## Project Conventions
- All API calls go through the service layer (services/*.ts)
- Use \`withRetry\` wrapper for Gemini API calls
- Use \`usePersistentState\` hook for data that should persist
- Follow TypeScript strict mode requirements
- Add JSDoc comments for public APIs

## Your Task
Provide a complete fix for this issue. Include:
1. The exact code changes needed
2. Any new files that need to be created
3. Any imports that need to be added
4. A brief explanation of the fix

If this requires multiple files, provide all changes.`;
  }

  private getFileContext(file?: string, maxLines = 50): string | null {
    if (!file) return null;

    const fullPath = path.isAbsolute(file) 
      ? file 
      : path.join(this.config.projectRoot, file);
    
    try {
      if (!fs.existsSync(fullPath)) return null;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      // If file is small, return all of it
      if (lines.length <= maxLines) {
        return content;
      }

      // Otherwise return first N lines
      return lines.slice(0, maxLines).join('\n') + '\n// ... (truncated)';
    } catch {
      return null;
    }
  }

  private async checkCopilotCli(): Promise<boolean> {
    const logger = getLogger();

    try {
      // Check if gh CLI exists
      await this.runCommand('gh', ['--version']);
      
      // Check if Copilot extension is installed
      const extensions = await this.runCommand('gh', ['extension', 'list']);
      
      if (extensions.includes('copilot')) {
        logger.success('GitHub Copilot CLI available');
        return true;
      }

      logger.warn('GitHub Copilot extension not installed. Install with: gh extension install github/gh-copilot');
      return false;
    } catch {
      logger.warn('GitHub CLI (gh) not found. Install from https://cli.github.com');
      return false;
    }
  }

  private async getCopilotSuggestion(prompt: string): Promise<string | null> {
    const logger = getLogger();

    try {
      // Create a temporary file for the prompt (gh copilot reads from stdin)
      const tempFile = path.join(this.config.projectRoot, 'agent', '.temp-prompt.txt');
      fs.writeFileSync(tempFile, prompt, 'utf-8');

      try {
        // Use gh copilot suggest for code suggestions
        const result = await this.runCommand('gh', ['copilot', 'suggest', '-t', 'code', prompt.substring(0, 500)]);
        return result;
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } catch (error) {
      logger.error('Failed to get Copilot suggestion', error);
      return null;
    }
  }

  private async saveSuggestion(item: CopilotQueueItem, suggestion: string): Promise<void> {
    const suggestionsDir = path.join(this.config.projectRoot, 'agent', 'suggestions');
    fs.mkdirSync(suggestionsDir, { recursive: true });

    const filename = `${item.issue.id}-${Date.now()}.md`;
    const filepath = path.join(suggestionsDir, filename);

    const content = `# Fix Suggestion: ${item.issue.id}

## Original Issue
- **Type**: ${item.issue.type}
- **Severity**: ${item.issue.severity}
- **Category**: ${item.issue.category}
${item.issue.file ? `- **File**: ${item.issue.file}` : ''}
${item.issue.line ? `- **Line**: ${item.issue.line}` : ''}

### Message
${item.issue.message}

## Suggested Fix
${suggestion}

---
*Generated by Project Guardian on ${new Date().toISOString()}*
`;

    fs.writeFileSync(filepath, content, 'utf-8');
    getLogger().info(`Saved suggestion: ${filename}`);
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.config.projectRoot,
        shell: true,
        timeout: 60000,
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
          reject(new Error(stderr || stdout || `Command exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  getQueueLength(): number {
    return this.stateManager.getQueueItems().length;
  }

  /**
   * Get all pending queue items
   */
  getPendingItems(): CopilotQueueItem[] {
    return this.stateManager.getQueueItems();
  }
}
