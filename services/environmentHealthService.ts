/**
 * Environment Health Service
 * 
 * Provides comprehensive health checks for the application environment.
 * Checks ComfyUI, VLM/LM Studio, ffmpeg availability, and writable directories.
 * 
 * Part of G1 - Self-Diagnostics & Environment Health Panel
 * 
 * @module services/environmentHealthService
 */

import { testLLMConnection, testComfyUIConnection } from './comfyUIService';

// ============================================================================
// Types
// ============================================================================

/**
 * Health status for a single dependency
 */
export type HealthStatus = 'healthy' | 'warning' | 'error' | 'checking' | 'unknown';

/**
 * Health check result for a single dependency
 */
export interface HealthCheckResult {
    /** Name of the dependency */
    name: string;
    /** Current status */
    status: HealthStatus;
    /** Human-readable status message */
    message: string;
    /** Additional details (e.g., version, GPU name) */
    details?: string;
    /** Path or URL being checked */
    path?: string;
    /** Timestamp of last check */
    checkedAt: number;
}

/**
 * Complete environment health report
 */
export interface EnvironmentHealthReport {
    /** Overall environment status (worst of all checks) */
    overall: HealthStatus;
    /** Individual check results */
    checks: {
        comfyUI: HealthCheckResult;
        vlm: HealthCheckResult;
        ffmpeg: HealthCheckResult;
        directories: HealthCheckResult;
    };
    /** Timestamp of report generation */
    timestamp: number;
    /** Human-readable summary */
    summary: string;
}

/**
 * Options for running health checks
 */
export interface HealthCheckOptions {
    /** ComfyUI server URL */
    comfyUIUrl?: string;
    /** VLM/LM Studio URL */
    vlmUrl?: string;
    /** Skip directory checks (browser environment) */
    skipDirectoryChecks?: boolean;
    /** Timeout for network checks in ms */
    timeoutMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default URLs to check if not provided */
const DEFAULT_COMFYUI_URL = 'http://127.0.0.1:8188';
const DEFAULT_VLM_URL = 'http://127.0.0.1:1234';

/** Directories to verify (relative to project root) */
const REQUIRED_DIRECTORIES = [
    'test-results/bookend-regression',
    'data/benchmarks',
    'data/manifests',
    'logs',
];

// ============================================================================
// Health Check Functions
// ============================================================================

/**
 * Check ComfyUI server availability
 */
export async function checkComfyUIHealth(
    url: string = DEFAULT_COMFYUI_URL,
    _timeoutMs: number = 5000  // Reserved for future timeout customization
): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
        name: 'ComfyUI Server',
        status: 'checking',
        message: 'Checking...',
        path: url,
        checkedAt: Date.now(),
    };

    try {
        const testResult = await testComfyUIConnection(url);
        if (testResult.success) {
            result.status = 'healthy';
            result.message = 'Connected and responsive';
            result.details = testResult.gpu;
        } else {
            result.status = 'error';
            result.message = 'Connection test failed';
        }
    } catch (error) {
        result.status = 'error';
        result.message = error instanceof Error ? error.message : 'Connection failed';
        
        // Provide actionable suggestions
        if (result.message.includes('NetworkError') || result.message.includes('Failed to fetch')) {
            result.details = 'Server not running. Start via VS Code task: "Start ComfyUI Server (Patched - Recommended)"';
        } else if (result.message.includes('CORS')) {
            result.details = 'CORS issue. Ensure ComfyUI started with --enable-cors-header flag';
        }
    }

    return result;
}

/**
 * Check VLM/LM Studio availability
 */
export async function checkVLMHealth(
    url: string = DEFAULT_VLM_URL,
    _timeoutMs: number = 5000  // Reserved for future timeout customization
): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
        name: 'Vision LLM (LM Studio)',
        status: 'checking',
        message: 'Checking...',
        path: url,
        checkedAt: Date.now(),
    };

    try {
        const testResult = await testLLMConnection(url);
        if (testResult.success) {
            result.status = 'healthy';
            result.message = `${testResult.modelCount} model(s) available`;
            result.details = testResult.models.length > 0 
                ? `Models: ${testResult.models.join(', ')}`
                : undefined;
        } else {
            result.status = 'warning';
            result.message = 'Connected but no models loaded';
            result.details = 'Load a vision-capable model in LM Studio for Vision QA';
        }
    } catch {
        // VLM is optional, so treat connection failure as warning, not error
        result.status = 'warning';
        result.message = 'Not available (optional)';
        result.details = 'Vision QA features require LM Studio running with a vision model';
    }

    return result;
}

/**
 * Check ffmpeg availability (browser-based check via test endpoint)
 * Note: In browser context, we can't directly check ffmpeg.
 * This attempts to infer availability from ComfyUI or a test endpoint.
 */
export async function checkFFmpegHealth(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
        name: 'FFmpeg (Video Processing)',
        status: 'checking',
        message: 'Checking...',
        checkedAt: Date.now(),
    };

    // In browser context, we can't directly check ffmpeg
    // We assume it's available if ComfyUI is running (since ComfyUI needs it)
    // For Node.js context, we could spawn `ffmpeg -version`
    
    try {
        // Try to check via a health endpoint if available
        const response = await fetch('/api/health/ffmpeg', { method: 'GET' });
        if (response.ok) {
            const data = await response.json();
            result.status = data.available ? 'healthy' : 'warning';
            result.message = data.available ? 'Available' : 'Not detected';
            result.details = data.version || undefined;
        } else {
            // No dedicated endpoint, assume available if in browser
            result.status = 'unknown';
            result.message = 'Cannot verify from browser';
            result.details = 'FFmpeg is typically bundled with ComfyUI. Temporal regularization requires ffmpeg in PATH.';
        }
    } catch {
        // No endpoint available, provide guidance
        result.status = 'unknown';
        result.message = 'Cannot verify from browser';
        result.details = 'Install ffmpeg and ensure it\'s in PATH for temporal regularization features';
    }

    return result;
}

/**
 * Check writable directories (browser-based estimation)
 * Note: In browser context, we can't directly check filesystem.
 * We provide guidance on expected directories.
 */
export async function checkDirectoriesHealth(): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
        name: 'Output Directories',
        status: 'checking',
        message: 'Checking...',
        checkedAt: Date.now(),
    };

    // In browser context, we can't check filesystem directly
    // We provide information about required directories
    
    try {
        // Try to check via a health endpoint if available
        const response = await fetch('/api/health/directories', { method: 'GET' });
        if (response.ok) {
            const data = await response.json();
            const missingDirs = data.missing || [];
            const writableDirs = data.writable || [];
            
            if (missingDirs.length === 0) {
                result.status = 'healthy';
                result.message = `All ${writableDirs.length} directories ready`;
            } else {
                result.status = 'warning';
                result.message = `${missingDirs.length} directory issue(s)`;
                result.details = `Missing/not writable: ${missingDirs.join(', ')}`;
            }
        } else {
            // No dedicated endpoint
            result.status = 'unknown';
            result.message = 'Cannot verify from browser';
            result.details = `Required: ${REQUIRED_DIRECTORIES.join(', ')}`;
        }
    } catch {
        result.status = 'unknown';
        result.message = 'Cannot verify from browser';
        result.details = `Ensure these exist and are writable: ${REQUIRED_DIRECTORIES.join(', ')}`;
    }

    return result;
}

// ============================================================================
// Full Health Report
// ============================================================================

/**
 * Run all health checks and generate a complete report
 */
export async function runFullHealthCheck(
    options: HealthCheckOptions = {}
): Promise<EnvironmentHealthReport> {
    const { 
        comfyUIUrl = DEFAULT_COMFYUI_URL,
        vlmUrl = DEFAULT_VLM_URL,
        skipDirectoryChecks = false,
    } = options;

    // Run checks in parallel for speed
    const [comfyUI, vlm, ffmpeg, directories] = await Promise.all([
        checkComfyUIHealth(comfyUIUrl),
        checkVLMHealth(vlmUrl),
        checkFFmpegHealth(),
        skipDirectoryChecks 
            ? Promise.resolve<HealthCheckResult>({ 
                name: 'Output Directories', 
                status: 'unknown', 
                message: 'Skipped',
                checkedAt: Date.now(),
            })
            : checkDirectoriesHealth(),
    ]);

    // Determine overall status (worst case)
    const statuses = [comfyUI.status, vlm.status, ffmpeg.status, directories.status];
    let overall: HealthStatus = 'healthy';
    
    if (statuses.includes('error')) {
        overall = 'error';
    } else if (statuses.includes('warning')) {
        overall = 'warning';
    } else if (statuses.includes('unknown')) {
        overall = statuses.every(s => s === 'unknown') ? 'unknown' : 'warning';
    }

    // Generate summary based on status counts
    const errorCount = statuses.filter(s => s === 'error').length;
    const warnCount = statuses.filter(s => s === 'warning').length;
    
    let summary: string;
    if (overall === 'healthy') {
        summary = 'All systems operational';
    } else if (overall === 'error') {
        summary = `${errorCount} critical issue(s) detected`;
    } else if (overall === 'warning') {
        summary = `${warnCount} warning(s) - some features may be limited`;
    } else {
        summary = 'Unable to verify some dependencies';
    }

    return {
        overall,
        checks: { comfyUI, vlm, ffmpeg, directories },
        timestamp: Date.now(),
        summary,
    };
}

// ============================================================================
// Diagnostics Export
// ============================================================================

/**
 * Format health report as a copyable diagnostics string
 */
export function formatDiagnostics(report: EnvironmentHealthReport): string {
    const lines: string[] = [
        '# Environment Health Diagnostics',
        `Generated: ${new Date(report.timestamp).toISOString()}`,
        `Overall Status: ${report.overall.toUpperCase()}`,
        '',
        '## Checks',
        '',
    ];

    const checks = Object.values(report.checks);
    for (const check of checks) {
        const statusIcon = getStatusIcon(check.status);
        lines.push(`### ${check.name}`);
        lines.push(`- Status: ${statusIcon} ${check.status.toUpperCase()}`);
        lines.push(`- Message: ${check.message}`);
        if (check.path) lines.push(`- Path: ${check.path}`);
        if (check.details) lines.push(`- Details: ${check.details}`);
        lines.push('');
    }

    lines.push('## Required Directories');
    for (const dir of REQUIRED_DIRECTORIES) {
        lines.push(`- ${dir}`);
    }

    return lines.join('\n');
}

/**
 * Format health report as JSON for machine consumption
 */
export function formatDiagnosticsJSON(report: EnvironmentHealthReport): string {
    return JSON.stringify({
        ...report,
        generatedAt: new Date(report.timestamp).toISOString(),
        requiredDirectories: REQUIRED_DIRECTORIES,
    }, null, 2);
}

/**
 * Get status icon for display
 */
export function getStatusIcon(status: HealthStatus): string {
    switch (status) {
        case 'healthy': return '🟢';
        case 'warning': return '🟡';
        case 'error': return '🔴';
        case 'checking': return '⏳';
        case 'unknown': return '⚪';
        default: return '❓';
    }
}

/**
 * Get CSS class for status
 */
export function getStatusColorClass(status: HealthStatus): string {
    switch (status) {
        case 'healthy': return 'text-green-400';
        case 'warning': return 'text-amber-400';
        case 'error': return 'text-red-400';
        case 'checking': return 'text-blue-400 animate-pulse';
        case 'unknown': return 'text-gray-400';
        default: return 'text-gray-500';
    }
}

/**
 * Get background CSS class for status
 */
export function getStatusBgClass(status: HealthStatus): string {
    switch (status) {
        case 'healthy': return 'bg-green-900/30 ring-green-700/50';
        case 'warning': return 'bg-amber-900/30 ring-amber-700/50';
        case 'error': return 'bg-red-900/30 ring-red-700/50';
        case 'checking': return 'bg-blue-900/30 ring-blue-700/50';
        case 'unknown': return 'bg-gray-900/30 ring-gray-700/50';
        default: return 'bg-gray-900/30 ring-gray-700/50';
    }
}
