/**
 * StateManager - File-based state persistence for Project Guardian
 * Uses JSON files instead of IndexedDB (Node.js environment)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AgentState, Issue, FixResult, CopilotQueueItem, AgentConfig } from './types.js';
import { getLogger } from './Logger.js';

export class StateManager {
  private stateDir: string;
  private issuesPath: string;
  private fixesPath: string;
  private statePath: string;
  private queuePath: string;

  constructor(private config: AgentConfig) {
    this.stateDir = path.join(config.projectRoot, 'agent', '.state');
    this.issuesPath = path.join(this.stateDir, 'issues.json');
    this.fixesPath = path.join(this.stateDir, 'fixes.json');
    this.statePath = path.join(this.stateDir, 'agent-state.json');
    this.queuePath = path.join(config.projectRoot, config.queueDir);

    // Ensure directories exist
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.mkdirSync(this.queuePath, { recursive: true });
  }

  // ============ Agent State ============

  saveAgentState(state: AgentState): void {
    const serializable = {
      ...state,
      startedAt: state.startedAt?.toISOString(),
      lastScan: state.lastScan?.toISOString(),
      lastReport: state.lastReport?.toISOString(),
    };
    fs.writeFileSync(this.statePath, JSON.stringify(serializable, null, 2), 'utf-8');
  }

  loadAgentState(): AgentState | null {
    try {
      if (!fs.existsSync(this.statePath)) return null;
      const data = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
      return {
        ...data,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        lastScan: data.lastScan ? new Date(data.lastScan) : undefined,
        lastReport: data.lastReport ? new Date(data.lastReport) : undefined,
      };
    } catch {
      return null;
    }
  }

  // ============ Issues ============

  private loadIssuesRaw(): Record<string, Issue> {
    try {
      if (!fs.existsSync(this.issuesPath)) return {};
      const data = JSON.parse(fs.readFileSync(this.issuesPath, 'utf-8'));
      // Convert date strings back to Date objects
      for (const id in data) {
        data[id].timestamp = new Date(data[id].timestamp);
        if (data[id].resolvedAt) {
          data[id].resolvedAt = new Date(data[id].resolvedAt);
        }
      }
      return data;
    } catch {
      return {};
    }
  }

  private saveIssuesRaw(issues: Record<string, Issue>): void {
    fs.writeFileSync(this.issuesPath, JSON.stringify(issues, null, 2), 'utf-8');
  }

  addIssue(issue: Issue): boolean {
    const issues = this.loadIssuesRaw();
    if (issues[issue.id]) {
      return false; // Already exists
    }
    issues[issue.id] = issue;
    this.saveIssuesRaw(issues);
    return true;
  }

  getIssue(id: string): Issue | null {
    const issues = this.loadIssuesRaw();
    return issues[id] || null;
  }

  getAllIssues(): Issue[] {
    const issues = this.loadIssuesRaw();
    return Object.values(issues);
  }

  getUnresolvedIssues(): Issue[] {
    return this.getAllIssues().filter(i => !i.resolved);
  }

  resolveIssue(id: string): boolean {
    const issues = this.loadIssuesRaw();
    if (!issues[id]) return false;
    issues[id].resolved = true;
    issues[id].resolvedAt = new Date();
    this.saveIssuesRaw(issues);
    return true;
  }

  removeIssue(id: string): boolean {
    const issues = this.loadIssuesRaw();
    if (!issues[id]) return false;
    delete issues[id];
    this.saveIssuesRaw(issues);
    return true;
  }

  clearResolvedIssues(): number {
    const issues = this.loadIssuesRaw();
    let count = 0;
    for (const id in issues) {
      const issue = issues[id];
      if (issue?.resolved) {
        delete issues[id];
        count++;
      }
    }
    this.saveIssuesRaw(issues);
    return count;
  }

  // ============ Fix Results ============

  private loadFixesRaw(): FixResult[] {
    try {
      if (!fs.existsSync(this.fixesPath)) return [];
      const data = JSON.parse(fs.readFileSync(this.fixesPath, 'utf-8'));
      return data.map((f: FixResult) => ({
        ...f,
        timestamp: new Date(f.timestamp),
      }));
    } catch {
      return [];
    }
  }

  private saveFixesRaw(fixes: FixResult[]): void {
    fs.writeFileSync(this.fixesPath, JSON.stringify(fixes, null, 2), 'utf-8');
  }

  addFixResult(result: FixResult): void {
    const fixes = this.loadFixesRaw();
    fixes.push(result);
    // Keep only last 1000 fixes
    if (fixes.length > 1000) {
      fixes.splice(0, fixes.length - 1000);
    }
    this.saveFixesRaw(fixes);
  }

  getRecentFixes(limit = 50): FixResult[] {
    const fixes = this.loadFixesRaw();
    return fixes.slice(-limit);
  }

  // ============ Copilot Queue ============

  addToQueue(item: CopilotQueueItem): void {
    const filename = `${item.issue.id}.json`;
    const filePath = path.join(this.queuePath, filename);
    const serializable = {
      ...item,
      requestedAt: item.requestedAt.toISOString(),
      issue: {
        ...item.issue,
        timestamp: item.issue.timestamp.toISOString(),
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
    getLogger().info(`Queued for Copilot: ${item.issue.id}`);
  }

  getQueueItems(): CopilotQueueItem[] {
    const items: CopilotQueueItem[] = [];
    try {
      const files = fs.readdirSync(this.queuePath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(this.queuePath, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        items.push({
          ...data,
          requestedAt: new Date(data.requestedAt),
          issue: {
            ...data.issue,
            timestamp: new Date(data.issue.timestamp),
          },
        });
      }
    } catch (e) {
      getLogger().error('Failed to read queue', e);
    }
    return items;
  }

  markQueueItemProcessed(issueId: string, result: string): void {
    const filename = `${issueId}.json`;
    const sourcePath = path.join(this.queuePath, filename);
    const processedDir = path.join(this.queuePath, 'processed');
    
    fs.mkdirSync(processedDir, { recursive: true });
    
    if (fs.existsSync(sourcePath)) {
      const data = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
      data.processed = true;
      data.processedAt = new Date().toISOString();
      data.result = result;
      
      const destPath = path.join(processedDir, filename);
      fs.writeFileSync(destPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.unlinkSync(sourcePath);
    }
  }

  // ============ Lock Files ============

  acquireLock(): boolean {
    const lockPath = path.join(this.config.projectRoot, this.config.lockFile);
    
    // Check if lock exists and is stale
    if (fs.existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const lockAge = Date.now() - new Date(lockData.timestamp).getTime();
        
        // If lock is older than 1 hour, consider it stale
        if (lockAge > 3600000) {
          getLogger().warn(`Removing stale lock (${Math.round(lockAge / 60000)} minutes old)`);
          fs.unlinkSync(lockPath);
        } else {
          // Check if PID is still running (Windows-compatible)
          try {
            process.kill(lockData.pid, 0); // Signal 0 = check if exists
            getLogger().warn(`Another guardian instance running (PID: ${lockData.pid})`);
            return false;
          } catch {
            // Process not running, remove stale lock
            getLogger().warn(`Removing orphaned lock (PID ${lockData.pid} not running)`);
            fs.unlinkSync(lockPath);
          }
        }
      } catch {
        fs.unlinkSync(lockPath);
      }
    }

    // Create new lock
    const lockData = {
      pid: process.pid,
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf-8');
    return true;
  }

  releaseLock(): void {
    const lockPath = path.join(this.config.projectRoot, this.config.lockFile);
    if (fs.existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        if (lockData.pid === process.pid) {
          fs.unlinkSync(lockPath);
          getLogger().info('Lock released');
        }
      } catch {
        // Ignore errors when releasing lock
      }
    }
  }

  isPlaywrightRunning(): boolean {
    const playwrightLock = path.join(this.config.projectRoot, this.config.playwrightLockFile);
    if (!fs.existsSync(playwrightLock)) {
      return false;
    }

    try {
      const lockData = JSON.parse(fs.readFileSync(playwrightLock, 'utf-8'));
      // Check if process is still running
      try {
        process.kill(lockData.pid, 0);
        return true; // Playwright is running
      } catch {
        return false; // Lock exists but process is dead
      }
    } catch {
      return false;
    }
  }

  // ============ Cleanup ============

  cleanup(): void {
    this.releaseLock();
  }
}
