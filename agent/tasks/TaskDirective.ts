/**
 * TaskDirective - User-defined task system for proactive Guardian actions
 * 
 * Allows users to direct the Guardian to perform specific tasks:
 * - fix-issue: Fix a specific issue or category of issues
 * - fill-gap: Create missing tests, documentation, etc.
 * - improve: Refactor, optimize, or enhance code
 * - investigate: Analyze a problem and suggest solutions
 * - implement: Create new functionality based on requirements
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Issue, AgentConfig } from '../core/types.js';
import { StateManager } from '../core/StateManager.js';
import { PromptGenerator, type GeneratedPrompt } from './PromptGenerator.js';
import { getLogger } from '../core/Logger.js';

export type DirectiveType = 
  | 'fix-issue'      // Fix specific issues
  | 'fill-gap'       // Create missing tests, docs
  | 'improve'        // Refactor, optimize
  | 'investigate'    // Analyze and suggest
  | 'implement';     // Create new functionality

export type DirectiveStatus = 
  | 'pending'        // Not yet started
  | 'in-progress'    // Currently being worked on
  | 'prompt-ready'   // Prompt generated, waiting for action
  | 'executing'      // Being processed by Copilot
  | 'completed'      // Successfully completed
  | 'failed';        // Failed to complete

export interface TaskDirective {
  id: string;
  type: DirectiveType;
  title: string;
  description: string;
  target?: {
    files?: string[];           // Specific files to target
    categories?: string[];      // Issue categories (typescript, test, etc.)
    severity?: string[];        // Severity levels to include
    pattern?: string;           // Regex pattern for file matching
  };
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: DirectiveStatus;
  createdAt: Date;
  updatedAt: Date;
  generatedPrompts?: GeneratedPrompt[];
  result?: {
    success: boolean;
    message: string;
    changedFiles?: string[];
  };
}

export class DirectiveManager {
  private directivesDir: string;
  private directivesPath: string;
  private directives: Map<string, TaskDirective> = new Map();
  private promptGenerator: PromptGenerator;
  private stateManager: StateManager;

  constructor(config: AgentConfig) {
    this.directivesDir = path.join(config.projectRoot, 'agent', 'directives');
    this.directivesPath = path.join(this.directivesDir, 'directives.json');
    this.promptGenerator = new PromptGenerator(config);
    this.stateManager = new StateManager(config);

    // Ensure directory exists
    fs.mkdirSync(this.directivesDir, { recursive: true });
    
    // Load existing directives
    this.loadDirectives();
  }

  /**
   * Create a new task directive
   */
  createDirective(
    type: DirectiveType,
    title: string,
    description: string,
    options: Partial<Omit<TaskDirective, 'id' | 'type' | 'title' | 'description' | 'status' | 'createdAt' | 'updatedAt'>> = {}
  ): TaskDirective {
    const id = `dir-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    const directive: TaskDirective = {
      id,
      type,
      title,
      description,
      priority: options.priority || 'medium',
      target: options.target,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.directives.set(id, directive);
    this.saveDirectives();

    getLogger().info(`Created directive: ${id} - ${title}`);
    return directive;
  }

  /**
   * Create directive from command-line input
   */
  createFromCommand(command: string): TaskDirective | null {
    const logger = getLogger();
    
    // Parse command format: "fix typescript errors in services/"
    // or "fill gaps in tests for utils/"
    // or "improve performance in components/Timeline"
    
    const patterns: { regex: RegExp; type: DirectiveType; extract: (m: RegExpMatchArray) => Partial<TaskDirective> }[] = [
      {
        regex: /^fix\s+(?:all\s+)?(\w+)\s+(?:errors?\s+)?(?:in\s+)?(.+)?$/i,
        type: 'fix-issue',
        extract: (m) => ({
          title: `Fix ${m[1]} errors`,
          description: `Fix all ${m[1]} errors${m[2] ? ` in ${m[2]}` : ''}`,
          target: {
            categories: [m[1]?.toLowerCase() || 'typescript'],
            pattern: m[2] ? this.pathToPattern(m[2]) : undefined,
          },
        }),
      },
      {
        regex: /^fill\s+(?:all\s+)?(?:test\s+)?gaps?\s+(?:in\s+|for\s+)?(.+)?$/i,
        type: 'fill-gap',
        extract: (m) => ({
          title: `Fill test gaps`,
          description: `Create missing tests${m[1] ? ` for ${m[1]}` : ''}`,
          target: {
            categories: ['test'],
            pattern: m[1] ? this.pathToPattern(m[1]) : undefined,
          },
        }),
      },
      {
        regex: /^improve\s+(.+?)\s+(?:in\s+)?(.+)?$/i,
        type: 'improve',
        extract: (m) => ({
          title: `Improve ${m[1]}`,
          description: `Improve ${m[1]}${m[2] ? ` in ${m[2]}` : ''}`,
          target: {
            pattern: m[2] ? this.pathToPattern(m[2]) : undefined,
          },
        }),
      },
      {
        regex: /^investigate\s+(.+)$/i,
        type: 'investigate',
        extract: (m) => ({
          title: `Investigate: ${m[1]?.substring(0, 50)}`,
          description: m[1] || 'Investigation task',
        }),
      },
      {
        regex: /^implement\s+(.+)$/i,
        type: 'implement',
        extract: (m) => ({
          title: `Implement: ${m[1]?.substring(0, 50)}`,
          description: m[1] || 'Implementation task',
        }),
      },
    ];

    for (const { regex, type, extract } of patterns) {
      const match = command.match(regex);
      if (match) {
        const extracted = extract(match);
        return this.createDirective(
          type,
          extracted.title || `${type} task`,
          extracted.description || command,
          { target: extracted.target, priority: 'medium' }
        );
      }
    }

    logger.warn(`Could not parse command: "${command}"`);
    return null;
  }

  /**
   * Convert a file path pattern to a regex
   */
  private pathToPattern(pathStr: string): string {
    // Convert glob-like patterns to regex
    return pathStr
      .replace(/\\/g, '/')
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
  }

  /**
   * Process a directive - find matching issues and generate prompts
   */
  async processDirective(directiveId: string): Promise<GeneratedPrompt[]> {
    const directive = this.directives.get(directiveId);
    if (!directive) {
      throw new Error(`Directive not found: ${directiveId}`);
    }

    const logger = getLogger();
    logger.info(`Processing directive: ${directive.title}`);

    directive.status = 'in-progress';
    directive.updatedAt = new Date();
    this.saveDirectives();

    // Find matching issues
    const issues = this.findMatchingIssues(directive);
    logger.info(`Found ${issues.length} matching issues`);

    if (issues.length === 0) {
      directive.status = 'completed';
      directive.result = { success: true, message: 'No matching issues found' };
      this.saveDirectives();
      return [];
    }

    // Generate prompts
    const prompts = this.promptGenerator.generatePrompts(issues);
    directive.generatedPrompts = prompts;
    directive.status = 'prompt-ready';
    directive.updatedAt = new Date();
    this.saveDirectives();

    logger.success(`Generated ${prompts.length} prompts for directive: ${directive.title}`);
    return prompts;
  }

  /**
   * Find issues matching a directive's target criteria
   */
  private findMatchingIssues(directive: TaskDirective): Issue[] {
    const allIssues = this.stateManager.getUnresolvedIssues();
    const target = directive.target;

    if (!target) {
      // No target specified - return all unresolved issues
      return allIssues;
    }

    return allIssues.filter(issue => {
      // Filter by category
      if (target.categories && target.categories.length > 0) {
        if (!target.categories.includes(issue.category)) {
          return false;
        }
      }

      // Filter by severity
      if (target.severity && target.severity.length > 0) {
        if (!target.severity.includes(issue.severity)) {
          return false;
        }
      }

      // Filter by file pattern
      if (target.pattern && issue.file) {
        const regex = new RegExp(target.pattern, 'i');
        if (!regex.test(issue.file)) {
          return false;
        }
      }

      // Filter by specific files
      if (target.files && target.files.length > 0 && issue.file) {
        const matches = target.files.some(f => 
          issue.file?.includes(f) || f.includes(issue.file || '')
        );
        if (!matches) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get all directives
   */
  getAllDirectives(): TaskDirective[] {
    return Array.from(this.directives.values());
  }

  /**
   * Get directives by status
   */
  getDirectivesByStatus(status: DirectiveStatus): TaskDirective[] {
    return this.getAllDirectives().filter(d => d.status === status);
  }

  /**
   * Get a specific directive
   */
  getDirective(id: string): TaskDirective | undefined {
    return this.directives.get(id);
  }

  /**
   * Update directive status
   */
  updateStatus(id: string, status: DirectiveStatus, result?: TaskDirective['result']): void {
    const directive = this.directives.get(id);
    if (directive) {
      directive.status = status;
      directive.updatedAt = new Date();
      if (result) {
        directive.result = result;
      }
      this.saveDirectives();
    }
  }

  /**
   * Delete a directive
   */
  deleteDirective(id: string): boolean {
    const deleted = this.directives.delete(id);
    if (deleted) {
      this.saveDirectives();
    }
    return deleted;
  }

  /**
   * Get quick task suggestions based on current issues
   */
  getSuggestedTasks(): { type: DirectiveType; title: string; command: string; issueCount: number }[] {
    const issues = this.stateManager.getUnresolvedIssues();
    const suggestions: { type: DirectiveType; title: string; command: string; issueCount: number }[] = [];

    // Group issues by category
    const byCategory: Record<string, Issue[]> = {};
    for (const issue of issues) {
      if (!byCategory[issue.category]) {
        byCategory[issue.category] = [];
      }
      byCategory[issue.category]!.push(issue);
    }

    // Generate suggestions
    for (const [category, categoryIssues] of Object.entries(byCategory)) {
      if (categoryIssues.length > 0) {
        suggestions.push({
          type: 'fix-issue',
          title: `Fix ${categoryIssues.length} ${category} issues`,
          command: `fix ${category} errors`,
          issueCount: categoryIssues.length,
        });
      }
    }

    // Sort by issue count (most issues first)
    suggestions.sort((a, b) => b.issueCount - a.issueCount);

    return suggestions;
  }

  /**
   * Load directives from disk
   */
  private loadDirectives(): void {
    try {
      if (fs.existsSync(this.directivesPath)) {
        const data = JSON.parse(fs.readFileSync(this.directivesPath, 'utf-8'));
        for (const d of data) {
          d.createdAt = new Date(d.createdAt);
          d.updatedAt = new Date(d.updatedAt);
          this.directives.set(d.id, d);
        }
      }
    } catch (error) {
      getLogger().warn('Failed to load directives:', error);
    }
  }

  /**
   * Save directives to disk
   */
  private saveDirectives(): void {
    try {
      const data = Array.from(this.directives.values());
      fs.writeFileSync(this.directivesPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      getLogger().error('Failed to save directives:', error);
    }
  }
}
