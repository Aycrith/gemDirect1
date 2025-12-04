/**
 * FileWatcher - Monitors file system changes using chokidar
 * Triggers scans when source files change
 */

import { watch, type FSWatcher } from 'chokidar';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { AgentConfig } from '../core/types.js';
import { getLogger } from '../core/Logger.js';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs = 500; // Debounce rapid changes

  constructor(private config: AgentConfig) {
    super();
  }

  start(): void {
    const logger = getLogger();
    
    const watchPaths = [
      path.join(this.config.projectRoot, 'src'),
      path.join(this.config.projectRoot, 'services'),
      path.join(this.config.projectRoot, 'components'),
      path.join(this.config.projectRoot, 'utils'),
      path.join(this.config.projectRoot, 'hooks'),
      path.join(this.config.projectRoot, 'types'),
    ];

    const validPaths = watchPaths.filter(p => {
      try {
        require('fs').accessSync(p);
        return true;
      } catch {
        return false;
      }
    });

    if (validPaths.length === 0) {
      logger.warn('No valid paths to watch');
      return;
    }

    logger.info(`Starting file watcher on ${validPaths.length} directories`);

    this.watcher = watch(validPaths, {
      persistent: true,
      ignoreInitial: true,
      ignored: [
        /node_modules/,
        /\.git/,
        /\.guardian-lock/,
        /\.playwright-lock/,
        /\.state/,
        /\.test\./,
        /\.spec\./,
        /__tests__/,
        /\.d\.ts$/,
      ],
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.handleChange('add', filePath));
    this.watcher.on('change', (filePath) => this.handleChange('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleChange('unlink', filePath));

    this.watcher.on('error', (error) => {
      logger.error('File watcher error', error);
      this.emit('error', error);
    });

    this.watcher.on('ready', () => {
      logger.success('File watcher ready');
      this.emit('ready');
    });
  }

  private handleChange(type: FileChangeEvent['type'], filePath: string): void {
    // Only watch TypeScript/React files
    if (!this.isRelevantFile(filePath)) {
      return;
    }

    // Debounce rapid changes to the same file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      
      const event: FileChangeEvent = {
        type,
        path: filePath,
        timestamp: new Date(),
      };

      getLogger().debug(`File ${type}: ${path.basename(filePath)}`);
      this.emit('change', event);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private isRelevantFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    
    if (!relevantExtensions.includes(ext)) {
      return false;
    }

    // Exclude test files and type definitions
    const basename = path.basename(filePath);
    if (
      basename.includes('.test.') ||
      basename.includes('.spec.') ||
      basename.endsWith('.d.ts')
    ) {
      return false;
    }

    return true;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      getLogger().info('File watcher stopped');
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  isRunning(): boolean {
    return this.watcher !== null;
  }
}
