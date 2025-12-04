/**
 * Guardian - Main orchestrator for Project Guardian autonomous agent
 * Coordinates watchers, task runners, and reporting
 */

import { EventEmitter } from 'events';
import type { AgentConfig, AgentState, Issue, ScanResult } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { Logger, initLogger } from './Logger.js';
import { StateManager } from './StateManager.js';
import { TaskRunner } from './TaskRunner.js';
import { TypeScriptWatcher } from '../watchers/TypeScriptWatcher.js';
import { TestWatcher } from '../watchers/TestWatcher.js';
import { FileWatcher, type FileChangeEvent } from '../watchers/FileWatcher.js';
import { GapAnalyzer } from '../watchers/GapAnalyzer.js';
import { AutoFix } from '../tasks/AutoFix.js';
import { CopilotQueue } from '../tasks/CopilotQueue.js';
import { ReportGenerator } from '../tasks/ReportGenerator.js';

export class Guardian extends EventEmitter {
  private config: AgentConfig;
  private state: AgentState;
  private logger: Logger;
  private stateManager: StateManager;
  private taskRunner: TaskRunner;

  // Watchers
  private tsWatcher: TypeScriptWatcher;
  private testWatcher: TestWatcher;
  private fileWatcher: FileWatcher;
  private gapAnalyzer: GapAnalyzer;

  // Tasks
  private autoFix: AutoFix;
  private copilotQueue: CopilotQueue;
  private reportGenerator: ReportGenerator;

  // Timers
  private scanTimer: NodeJS.Timeout | null = null;
  private reportTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AgentConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isRunning: false,
      issueCount: 0,
      fixedCount: 0,
    };

    // Initialize logger
    this.logger = initLogger(this.config.logDir);

    // Initialize state manager
    this.stateManager = new StateManager(this.config);

    // Initialize task runner
    this.taskRunner = new TaskRunner(this.config, this.stateManager);

    // Initialize watchers
    this.tsWatcher = new TypeScriptWatcher(this.config);
    this.testWatcher = new TestWatcher(this.config);
    this.fileWatcher = new FileWatcher(this.config);
    this.gapAnalyzer = new GapAnalyzer(this.config);

    // Initialize tasks
    this.autoFix = new AutoFix(this.config);
    this.copilotQueue = new CopilotQueue(this.config, this.stateManager);
    this.reportGenerator = new ReportGenerator(this.config, this.stateManager);

    // Register fix handlers
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register auto-fix handler for each category
    const fixHandler = async (issue: Issue) => {
      const result = await this.autoFix.fix(issue);
      
      // If we couldn't auto-fix, queue for Copilot
      if (!result.success && result.action === 'queued') {
        await this.copilotQueue.queueIssue(issue);
      }

      return result;
    };

    this.taskRunner.registerHandler('typescript', fixHandler);
    this.taskRunner.registerHandler('test', fixHandler);
    this.taskRunner.registerHandler('lint', fixHandler);
    this.taskRunner.registerHandler('build', fixHandler);
    this.taskRunner.registerHandler('doc', fixHandler);
    this.taskRunner.registerHandler('service-layer', fixHandler);
  }

  async start(): Promise<boolean> {
    if (this.state.isRunning) {
      this.logger.warn('Guardian is already running');
      return false;
    }

    this.logger.section('PROJECT GUARDIAN STARTING');
    this.logger.info(`Project root: ${this.config.projectRoot}`);
    this.logger.info(`Auto-fix: ${this.config.autoFix}`);
    this.logger.info(`Auto-stage: ${this.config.autoStage}`);

    // Try to acquire lock
    if (!this.stateManager.acquireLock()) {
      this.logger.error('Failed to acquire lock. Another instance may be running.');
      return false;
    }

    // Check for Playwright lock
    if (this.stateManager.isPlaywrightRunning()) {
      this.logger.warn('Playwright is running. Will avoid test-related operations.');
    }

    // Update state
    this.state = {
      isRunning: true,
      startedAt: new Date(),
      issueCount: 0,
      fixedCount: 0,
      pid: process.pid,
    };
    this.stateManager.saveAgentState(this.state);

    // Run initial full scan
    await this.runFullScan();

    // Start file watcher
    this.startFileWatcher();

    // Start periodic scans
    this.startPeriodicScans();

    // Start periodic reports
    this.startPeriodicReports();

    this.logger.success('Guardian is now active');
    this.emit('state:changed', this.state);

    return true;
  }

  async stop(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    this.logger.info('Guardian stopping...');

    // Stop timers
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    // Stop file watcher
    this.fileWatcher.stop();

    // Clear task queue
    this.taskRunner.clearQueue();

    // Generate final report
    await this.reportGenerator.generate();

    // Release lock
    this.stateManager.releaseLock();

    // Update state
    this.state.isRunning = false;
    this.stateManager.saveAgentState(this.state);

    this.logger.success('Guardian stopped');
    this.emit('state:changed', this.state);
  }

  async runFullScan(): Promise<void> {
    this.logger.section('FULL PROJECT SCAN');
    this.state.lastScan = new Date();

    const scanners: Promise<ScanResult>[] = [
      this.tsWatcher.scan(),
      this.gapAnalyzer.scan(),
    ];

    // Only run tests if Playwright isn't running
    if (!this.stateManager.isPlaywrightRunning()) {
      scanners.push(this.testWatcher.scan());
    }

    const results = await Promise.allSettled(scanners);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.processScanResult(result.value);
      } else {
        this.logger.error('Scanner failed', result.reason);
      }
    }

    this.state.issueCount = this.stateManager.getUnresolvedIssues().length;
    this.logger.info(`Total unresolved issues: ${this.state.issueCount}`);
  }

  private processScanResult(result: ScanResult): void {
    this.emit('scan:completed', result);

    for (const issue of result.issuesFound) {
      const isNew = this.stateManager.addIssue(issue);
      
      if (isNew) {
        this.emit('issue:found', issue);
        
        // Queue auto-fixable issues
        if (issue.autoFixable && this.config.autoFix) {
          this.taskRunner.enqueue(issue);
        }
      }
    }
  }

  private startFileWatcher(): void {
    this.fileWatcher.on('change', async (event: FileChangeEvent) => {
      this.logger.info(`File changed: ${event.path}`);
      
      // Run TypeScript check on changed file
      if (event.path.endsWith('.ts') || event.path.endsWith('.tsx')) {
        const issues = await this.tsWatcher.scanFile(event.path);
        
        for (const issue of issues) {
          const isNew = this.stateManager.addIssue(issue);
          if (isNew) {
            this.emit('issue:found', issue);
            if (issue.autoFixable && this.config.autoFix) {
              this.taskRunner.enqueue(issue);
            }
          }
        }
      }
    });

    this.fileWatcher.on('error', (error) => {
      this.logger.error('File watcher error', error);
    });

    this.fileWatcher.start();
  }

  private startPeriodicScans(): void {
    this.scanTimer = setInterval(async () => {
      if (this.state.isRunning) {
        await this.runFullScan();
      }
    }, this.config.scanInterval);
  }

  private startPeriodicReports(): void {
    this.reportTimer = setInterval(async () => {
      if (this.state.isRunning) {
        await this.reportGenerator.generate();
        this.state.lastReport = new Date();
      }
    }, this.config.reportInterval);
  }

  async generateReport(): Promise<void> {
    await this.reportGenerator.generate();
  }

  async processQueue(): Promise<{ processed: number; failed: number }> {
    return this.copilotQueue.processQueue();
  }

  async showStatus(): Promise<void> {
    const state = this.stateManager.loadAgentState();
    const issues = this.stateManager.getUnresolvedIssues();
    const queueLength = this.copilotQueue.getQueueLength();
    const pendingTasks = this.taskRunner.getPendingTasks();

    this.logger.section('GUARDIAN STATUS');

    if (state?.isRunning) {
      console.log(`  🟢 Status: RUNNING (PID: ${state.pid})`);
      console.log(`  ⏱️  Started: ${state.startedAt}`);
      console.log(`  🔍 Last scan: ${state.lastScan || 'Never'}`);
    } else {
      console.log('  🔴 Status: STOPPED');
    }

    console.log('');
    console.log(`  📊 Issues: ${issues.length}`);
    console.log(`     Critical: ${issues.filter(i => i.severity === 'critical').length}`);
    console.log(`     High: ${issues.filter(i => i.severity === 'high').length}`);
    console.log(`     Medium: ${issues.filter(i => i.severity === 'medium').length}`);
    console.log(`     Low: ${issues.filter(i => i.severity === 'low').length}`);
    console.log('');
    console.log(`  📬 Copilot queue: ${queueLength}`);
    console.log(`  ⏳ Pending tasks: ${pendingTasks.length}`);
    console.log('');
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }
}
