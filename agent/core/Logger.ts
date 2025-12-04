/**
 * Logger - Structured logging for Project Guardian
 * Follows existing project patterns from scripts/comfyui-status.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LogEntry } from './types.js';

export class Logger {
  private logPath: string | null;
  private entries: LogEntry[] = [];
  private maxEntries: number;

  constructor(logDir?: string, maxEntries = 10000) {
    this.maxEntries = maxEntries;
    
    if (logDir) {
      fs.mkdirSync(logDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      this.logPath = path.join(logDir, `guardian-${timestamp}.log`);
    } else {
      this.logPath = null;
    }
  }

  private log(level: LogEntry['level'], message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
    };

    this.entries.push(entry);
    
    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Format for console
    const icon = this.getIcon(level);
    const timestamp = entry.timestamp.toISOString();
    const formattedMessage = `${icon} [${timestamp}] ${message}`;
    
    // Console output
    switch (level) {
      case 'error':
        console.error(formattedMessage, data ?? '');
        break;
      case 'warn':
        console.warn(formattedMessage, data ?? '');
        break;
      case 'debug':
        if (process.env.DEBUG) {
          console.log(formattedMessage, data ?? '');
        }
        break;
      default:
        console.log(formattedMessage, data ?? '');
    }

    // File output
    if (this.logPath) {
      const fileLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
      fs.appendFileSync(this.logPath, fileLine + os.EOL, 'utf-8');
    }
  }

  private getIcon(level: LogEntry['level']): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'debug': return '🔍';
      default: return 'ℹ️';
    }
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  // Convenience methods with icons
  success(message: string): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message,
    };
    this.entries.push(entry);
    console.log(`✅ [${entry.timestamp.toISOString()}] ${message}`);
    if (this.logPath) {
      fs.appendFileSync(this.logPath, `[${entry.timestamp.toISOString()}] [SUCCESS] ${message}${os.EOL}`, 'utf-8');
    }
  }

  section(title: string): void {
    const separator = '═'.repeat(60);
    console.log(`\n${separator}`);
    console.log(`  ${title}`);
    console.log(`${separator}`);
    
    if (this.logPath) {
      fs.appendFileSync(this.logPath, `\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}\n`, 'utf-8');
    }
  }

  getEntries(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.entries.filter(e => e.level === level);
    }
    return [...this.entries];
  }

  getLogPath(): string | null {
    return this.logPath;
  }

  clear(): void {
    this.entries = [];
  }
}

// Singleton instance for global use
let globalLogger: Logger | null = null;

export function initLogger(logDir?: string): Logger {
  globalLogger = new Logger(logDir);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}
