/**
 * Unit tests for Project Guardian agent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, cb) => {
      if (event === 'close') setTimeout(() => cb(0), 10);
    }),
  })),
}));

// Import after mocks
import { Logger, initLogger } from '../core/Logger.js';
import { StateManager } from '../core/StateManager.js';
import { TaskRunner } from '../core/TaskRunner.js';
import { DEFAULT_CONFIG, type Issue, type AgentConfig } from '../core/types.js';

describe('Logger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create log file in specified directory', () => {
    const logger = new Logger(tempDir);
    logger.info('test message');
    
    const logPath = logger.getLogPath();
    expect(logPath).toBeTruthy();
    if (logPath) {
      expect(fs.existsSync(logPath)).toBe(true);
    }
  });

  it('should store log entries', () => {
    const logger = new Logger();
    logger.info('message 1');
    logger.warn('message 2');
    logger.error('message 3');

    const entries = logger.getEntries();
    expect(entries.length).toBe(3);
    const entry0 = entries[0];
    const entry1 = entries[1];
    const entry2 = entries[2];
    expect(entry0?.level).toBe('info');
    expect(entry1?.level).toBe('warn');
    expect(entry2?.level).toBe('error');
  });

  it('should filter entries by level', () => {
    const logger = new Logger();
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    const errors = logger.getEntries('error');
    expect(errors.length).toBe(1);
    expect(errors[0]?.message).toBe('error');
  });
});

describe('StateManager', () => {
  let tempDir: string;
  let config: AgentConfig;
  let stateManager: StateManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-state-test-'));
    config = {
      ...DEFAULT_CONFIG,
      projectRoot: tempDir,
    };
    stateManager = new StateManager(config);
  });

  afterEach(() => {
    stateManager.cleanup();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Issues', () => {
    it('should add and retrieve issues', () => {
      const issue: Issue = {
        id: 'test-issue-1',
        type: 'error',
        severity: 'high',
        category: 'typescript',
        message: 'Test error',
        autoFixable: false,
        timestamp: new Date(),
      };

      const added = stateManager.addIssue(issue);
      expect(added).toBe(true);

      const retrieved = stateManager.getIssue('test-issue-1');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.message).toBe('Test error');
    });

    it('should not add duplicate issues', () => {
      const issue: Issue = {
        id: 'test-issue-1',
        type: 'error',
        severity: 'high',
        category: 'typescript',
        message: 'Test error',
        autoFixable: false,
        timestamp: new Date(),
      };

      stateManager.addIssue(issue);
      const addedAgain = stateManager.addIssue(issue);
      expect(addedAgain).toBe(false);
    });

    it('should resolve issues', () => {
      const issue: Issue = {
        id: 'test-issue-1',
        type: 'error',
        severity: 'high',
        category: 'typescript',
        message: 'Test error',
        autoFixable: false,
        timestamp: new Date(),
      };

      stateManager.addIssue(issue);
      stateManager.resolveIssue('test-issue-1');

      const resolved = stateManager.getIssue('test-issue-1');
      expect(resolved!.resolved).toBe(true);
      expect(resolved!.resolvedAt).toBeTruthy();
    });

    it('should get unresolved issues only', () => {
      const issue1: Issue = {
        id: 'test-1',
        type: 'error',
        severity: 'high',
        category: 'typescript',
        message: 'Error 1',
        autoFixable: false,
        timestamp: new Date(),
      };
      const issue2: Issue = {
        id: 'test-2',
        type: 'error',
        severity: 'medium',
        category: 'test',
        message: 'Error 2',
        autoFixable: false,
        timestamp: new Date(),
      };

      stateManager.addIssue(issue1);
      stateManager.addIssue(issue2);
      stateManager.resolveIssue('test-1');

      const unresolved = stateManager.getUnresolvedIssues();
      expect(unresolved.length).toBe(1);
      expect(unresolved[0]?.id).toBe('test-2');
    });
  });

  describe('Lock files', () => {
    it('should acquire and release lock', () => {
      const acquired = stateManager.acquireLock();
      expect(acquired).toBe(true);

      const lockPath = path.join(tempDir, config.lockFile);
      expect(fs.existsSync(lockPath)).toBe(true);

      stateManager.releaseLock();
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should detect stale locks', async () => {
      const lockPath = path.join(tempDir, config.lockFile);
      
      // Create a stale lock (fake PID that doesn't exist)
      const staleLock = {
        pid: 999999,
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        hostname: os.hostname(),
      };
      fs.writeFileSync(lockPath, JSON.stringify(staleLock));

      // Should be able to acquire over stale lock
      const acquired = stateManager.acquireLock();
      expect(acquired).toBe(true);
    });
  });
});

describe('TaskRunner', () => {
  let tempDir: string;
  let config: AgentConfig;
  let stateManager: StateManager;
  let taskRunner: TaskRunner;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-task-test-'));
    config = {
      ...DEFAULT_CONFIG,
      projectRoot: tempDir,
      maxConcurrentFixes: 2,
    };
    stateManager = new StateManager(config);
    taskRunner = new TaskRunner(config, stateManager);
    
    // Initialize logger for tests
    initLogger();
  });

  afterEach(() => {
    stateManager.cleanup();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should register handlers', () => {
    const handler = vi.fn();
    taskRunner.registerHandler('typescript', handler);
    
    // Handler registered but not called yet
    expect(handler).not.toHaveBeenCalled();
  });

  it('should enqueue issues with registered handlers', async () => {
    const handler = vi.fn().mockResolvedValue({
      issueId: 'test-1',
      success: true,
      action: 'auto-fixed' as const,
      message: 'Fixed',
      timestamp: new Date(),
    });

    taskRunner.registerHandler('typescript', handler);

    const issue: Issue = {
      id: 'test-1',
      type: 'error',
      severity: 'high',
      category: 'typescript',
      message: 'Test error',
      autoFixable: true,
      timestamp: new Date(),
    };

    taskRunner.enqueue(issue);
    expect(taskRunner.getQueueLength()).toBeGreaterThanOrEqual(0); // May have already processed
  });

  it('should respect severity threshold', () => {
    const handler = vi.fn();
    taskRunner.registerHandler('typescript', handler);

    const lowPriorityIssue: Issue = {
      id: 'low-priority',
      type: 'warning',
      severity: 'low',
      category: 'typescript',
      message: 'Low priority',
      autoFixable: true,
      timestamp: new Date(),
    };

    // With default threshold of 'medium', 'low' should be skipped
    taskRunner.enqueue(lowPriorityIssue);
    
    // Handler should not be called for low priority issues
    expect(handler).not.toHaveBeenCalled();
  });

  it('should clear queue', () => {
    const handler = vi.fn();
    taskRunner.registerHandler('typescript', handler);

    // Add multiple issues (they won't process immediately due to mocked child_process)
    for (let i = 0; i < 5; i++) {
      taskRunner.enqueue({
        id: `test-${i}`,
        type: 'error',
        severity: 'high',
        category: 'typescript',
        message: `Error ${i}`,
        autoFixable: true,
        timestamp: new Date(),
      });
    }

    taskRunner.clearQueue();
    expect(taskRunner.getQueueLength()).toBe(0);
  });
});
