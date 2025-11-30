/**
 * Structured Logging Factory
 * 
 * Provides consistent, prefixed logging across the application.
 * Each logger instance includes:
 * - Timestamp in ISO format
 * - Module prefix for filtering
 * - Log level indication
 * - Optional structured metadata
 * 
 * Usage:
 * ```typescript
 * import { createLogger } from '../utils/logger';
 * const logger = createLogger('ComfyUI');
 * logger.info('Server connected', { port: 8188 });
 * // Output: [2025-11-29T10:30:00.000Z] [ComfyUI] INFO: Server connected {"port":8188}
 * ```
 * 
 * @module utils/logger
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMetadata {
    [key: string]: unknown;
}

export interface Logger {
    debug: (message: string, metadata?: LogMetadata) => void;
    info: (message: string, metadata?: LogMetadata) => void;
    warn: (message: string, metadata?: LogMetadata) => void;
    error: (message: string, metadata?: LogMetadata) => void;
    /** Create a child logger with additional context prefix */
    child: (subPrefix: string) => Logger;
}

/**
 * Global log level threshold.
 * Messages below this level are suppressed.
 * Can be overridden via localStorage for debugging.
 */
let globalLogLevel: LogLevel = 'info';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Check if logging is enabled for a given level
 */
function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[globalLogLevel];
}

/**
 * Format metadata for output
 */
function formatMetadata(metadata?: LogMetadata): string {
    if (!metadata || Object.keys(metadata).length === 0) {
        return '';
    }
    try {
        return ' ' + JSON.stringify(metadata);
    } catch {
        return ' [unserializable metadata]';
    }
}

/**
 * Create a log entry with consistent formatting
 */
function createLogEntry(prefix: string, level: LogLevel, message: string, metadata?: LogMetadata): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase();
    const metaStr = formatMetadata(metadata);
    return `[${timestamp}] [${prefix}] ${levelStr}: ${message}${metaStr}`;
}

/**
 * Create a logger instance for a specific module/component.
 * 
 * @param prefix - The module name to prefix all log messages (e.g., 'ComfyUI', 'Gemini', 'Hooks')
 * @returns Logger instance with debug, info, warn, error methods
 * 
 * @example
 * ```typescript
 * const logger = createLogger('ComfyUI');
 * logger.info('Queue started', { promptId: 'abc123' });
 * logger.error('Generation failed', { error: err.message, code: 'TIMEOUT' });
 * 
 * // Child logger for sub-components
 * const wsLogger = logger.child('WebSocket');
 * wsLogger.debug('Message received', { type: 'progress' });
 * ```
 */
export function createLogger(prefix: string): Logger {
    const log = (level: LogLevel, message: string, metadata?: LogMetadata): void => {
        if (!shouldLog(level)) {
            return;
        }

        const entry = createLogEntry(prefix, level, message, metadata);

        switch (level) {
            case 'debug':
                console.debug(entry);
                break;
            case 'info':
                console.log(entry);
                break;
            case 'warn':
                console.warn(entry);
                break;
            case 'error':
                console.error(entry);
                break;
        }
    };

    return {
        debug: (message: string, metadata?: LogMetadata) => log('debug', message, metadata),
        info: (message: string, metadata?: LogMetadata) => log('info', message, metadata),
        warn: (message: string, metadata?: LogMetadata) => log('warn', message, metadata),
        error: (message: string, metadata?: LogMetadata) => log('error', message, metadata),
        child: (subPrefix: string) => createLogger(`${prefix}:${subPrefix}`),
    };
}

/**
 * Set the global log level threshold.
 * Messages below this level will be suppressed.
 * 
 * @param level - Minimum log level to output
 */
export function setLogLevel(level: LogLevel): void {
    globalLogLevel = level;
}

/**
 * Get the current global log level.
 */
export function getLogLevel(): LogLevel {
    return globalLogLevel;
}

/**
 * Initialize log level from localStorage (for browser debugging).
 * Call this once during app initialization.
 * 
 * Set via: localStorage.setItem('CSG_LOG_LEVEL', 'debug')
 */
export function initLogLevelFromStorage(): void {
    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('CSG_LOG_LEVEL');
        if (stored && stored in LOG_LEVEL_PRIORITY) {
            globalLogLevel = stored as LogLevel;
            console.log(`[Logger] Log level set to '${globalLogLevel}' from localStorage`);
        }
    }
}

/**
 * Pre-configured loggers for common modules.
 * Import directly for convenience:
 * 
 * ```typescript
 * import { comfyLogger } from '../utils/logger';
 * comfyLogger.info('Connected');
 * ```
 */
export const comfyLogger = createLogger('ComfyUI');
export const geminiLogger = createLogger('Gemini');
export const hooksLogger = createLogger('Hooks');
export const pipelineLogger = createLogger('Pipeline');
export const payloadLogger = createLogger('Payload');
export const validationLogger = createLogger('Validation');
