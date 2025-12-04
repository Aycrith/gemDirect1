/**
 * TaskRunner - Priority queue task execution for Project Guardian
 * Manages concurrent task execution with priority ordering
 */

import type { Issue, FixResult, AgentConfig, IssueSeverity } from './types.js';
import { SEVERITY_ORDER } from './types.js';
import { getLogger } from './Logger.js';
import { StateManager } from './StateManager.js';

export type TaskHandler = (issue: Issue) => Promise<FixResult>;

interface QueuedTask {
  issue: Issue;
  handler: TaskHandler;
  priority: number;
  enqueuedAt: Date;
}

export class TaskRunner {
  private queue: QueuedTask[] = [];
  private running = 0;
  private handlers: Map<string, TaskHandler> = new Map();
  private isProcessing = false;

  constructor(
    private config: AgentConfig,
    private stateManager: StateManager
  ) {}

  registerHandler(category: string, handler: TaskHandler): void {
    this.handlers.set(category, handler);
    getLogger().debug(`Registered handler for category: ${category}`);
  }

  enqueue(issue: Issue): void {
    const handler = this.handlers.get(issue.category);
    if (!handler) {
      getLogger().warn(`No handler registered for category: ${issue.category}`);
      return;
    }

    // Check if already in queue
    if (this.queue.some(t => t.issue.id === issue.id)) {
      return;
    }

    // Check severity threshold
    if (SEVERITY_ORDER[issue.severity] > SEVERITY_ORDER[this.config.priorityThreshold]) {
      getLogger().debug(`Skipping low-priority issue: ${issue.id} (${issue.severity})`);
      return;
    }

    const task: QueuedTask = {
      issue,
      handler,
      priority: SEVERITY_ORDER[issue.severity],
      enqueuedAt: new Date(),
    };

    this.queue.push(task);
    this.sortQueue();
    
    getLogger().info(`Enqueued task: ${issue.id} (${issue.severity})`);
    
    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by priority (lower = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by age (older = higher priority)
      return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.running < this.config.maxConcurrentFixes) {
      const task = this.queue.shift();
      if (!task) break;

      this.running++;
      
      // Process task without blocking the queue
      this.executeTask(task).finally(() => {
        this.running--;
        // Continue processing if more tasks
        if (this.queue.length > 0) {
          this.processQueue();
        }
      });
    }

    this.isProcessing = false;
  }

  private async executeTask(task: QueuedTask): Promise<void> {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      logger.info(`Executing task: ${task.issue.id}`);
      
      const result = await task.handler(task.issue);
      
      const duration = Date.now() - startTime;
      logger.info(`Task completed: ${task.issue.id} (${result.action}) in ${duration}ms`);
      
      // Record the result
      this.stateManager.addFixResult(result);
      
      // Mark issue as resolved if successfully fixed
      if (result.success && (result.action === 'auto-fixed' || result.action === 'staged')) {
        this.stateManager.resolveIssue(task.issue.id);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Task failed: ${task.issue.id} after ${duration}ms`, error);
      
      // Record failure
      this.stateManager.addFixResult({
        issueId: task.issue.id,
        success: false,
        action: 'skipped',
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      });
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getRunningCount(): number {
    return this.running;
  }

  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];
    getLogger().info(`Cleared ${count} tasks from queue`);
  }

  getPendingTasks(): { id: string; severity: IssueSeverity; category: string }[] {
    return this.queue.map(t => ({
      id: t.issue.id,
      severity: t.issue.severity,
      category: t.issue.category,
    }));
  }
}
