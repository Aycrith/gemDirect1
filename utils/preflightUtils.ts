/**
 * Preflight Check Utilities
 * 
 * Utilities for evaluating preflight status and generating user-facing messages.
 * Used by PipelineRunLauncher to gate runs based on environment readiness.
 * 
 * Phase 3: Preflight Gating & Temporal UX
 * 
 * @module utils/preflightUtils
 */

import type { PreflightInfo } from '../types/pipelineSummary';

// ============================================================================
// Types
// ============================================================================

/**
 * Overall preflight status
 */
export type PreflightStatus = 'ready' | 'warning' | 'error' | 'unknown';

/**
 * Individual check result
 */
export interface PreflightCheckResult {
    /** Check identifier */
    id: 'ffmpeg' | 'tmix' | 'vlm';
    /** Human-readable label */
    label: string;
    /** Check passed */
    passed: boolean;
    /** Is this check blocking (error) or just a warning */
    blocking: boolean;
    /** Status message */
    message: string;
    /** Value (version, URL, etc.) */
    value?: string;
    /** Suggested fix */
    suggestion?: string;
}

/**
 * Aggregated preflight evaluation
 */
export interface PreflightEvaluation {
    /** Overall status */
    status: PreflightStatus;
    /** Individual check results */
    checks: PreflightCheckResult[];
    /** Whether temporal should be force-disabled */
    temporalBlocked: boolean;
    /** Whether VLM QA will be skipped */
    vlmUnavailable: boolean;
    /** Whether any blocking issues exist */
    hasBlockingIssues: boolean;
    /** Summary message for the user */
    summaryMessage: string;
    /** Temporal mode helper text based on preflight */
    temporalHelperText: string;
}

// ============================================================================
// Evaluation Functions
// ============================================================================

/**
 * Evaluate preflight info and generate check results
 */
export function evaluatePreflight(preflight: PreflightInfo | null | undefined): PreflightEvaluation {
    if (!preflight) {
        return {
            status: 'unknown',
            checks: [],
            temporalBlocked: false,
            vlmUnavailable: true,
            hasBlockingIssues: false,
            summaryMessage: 'Preflight status unknown. Run a preflight check to verify environment.',
            temporalHelperText: 'Status unknown. Run preflight to check tmix support.',
        };
    }

    const checks: PreflightCheckResult[] = [];

    // FFmpeg check
    const ffmpegCheck: PreflightCheckResult = {
        id: 'ffmpeg',
        label: 'FFmpeg',
        passed: !!preflight.ffmpegVersion,
        blocking: !preflight.ffmpegVersion, // Blocking if no ffmpeg
        value: preflight.ffmpegVersion || undefined,
        message: preflight.ffmpegVersion
            ? `Version ${preflight.ffmpegVersion}`
            : 'Not found in PATH',
        suggestion: preflight.ffmpegVersion
            ? undefined
            : 'Install FFmpeg and ensure it is in PATH.',
    };
    checks.push(ffmpegCheck);

    // TMix normalize check
    const tmixCheck: PreflightCheckResult = {
        id: 'tmix',
        label: 'TMix Normalize',
        passed: !!preflight.tmixNormalizeSupported,
        blocking: false, // Not blocking - will fall back
        value: preflight.tmixNormalizeSupported ? 'Supported' : 'Unsupported',
        message: preflight.tmixNormalizeSupported
            ? 'normalize=1 supported'
            : 'normalize=1 unsupported → will use fallback',
        suggestion: preflight.tmixNormalizeSupported
            ? undefined
            : 'Temporal smoothing will use alternate filter. Output may differ from reference.',
    };
    checks.push(tmixCheck);

    // VLM reachability check
    const vlmCheck: PreflightCheckResult = {
        id: 'vlm',
        label: 'Vision LLM',
        passed: !!preflight.vlmReachable,
        blocking: false, // Not blocking - can skip QA
        value: preflight.vlmEndpoint || undefined,
        message: preflight.vlmReachable
            ? `Reachable at ${preflight.vlmEndpoint || 'endpoint'}`
            : 'Unreachable',
        suggestion: preflight.vlmReachable
            ? undefined
            : 'Vision QA will be skipped. Start LM Studio or configure Gemini API.',
    };
    checks.push(vlmCheck);

    // Determine overall status
    const hasError = checks.some(c => !c.passed && c.blocking);
    const hasWarning = checks.some(c => !c.passed && !c.blocking);
    const status: PreflightStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ready';

    // Temporal blocked if no ffmpeg or tmix unsupported and temporal was requested
    const temporalBlocked = !preflight.ffmpegVersion;
    const vlmUnavailable = !preflight.vlmReachable;
    const hasBlockingIssues = hasError;

    // Summary message
    let summaryMessage: string;
    if (status === 'ready') {
        summaryMessage = 'Environment ready. All checks passed.';
    } else if (status === 'error') {
        const blockers = checks.filter(c => !c.passed && c.blocking).map(c => c.label);
        summaryMessage = `Blocking issues: ${blockers.join(', ')}. Fix before running.`;
    } else {
        const warnings = checks.filter(c => !c.passed && !c.blocking).map(c => c.label);
        summaryMessage = `Warnings: ${warnings.join(', ')}. Run may proceed with limitations.`;
    }

    // Temporal helper text
    let temporalHelperText: string;
    if (!preflight.ffmpegVersion) {
        temporalHelperText = 'FFmpeg not found. Temporal smoothing unavailable.';
    } else if (!preflight.tmixNormalizeSupported) {
        temporalHelperText = 'normalize=1 unsupported → fallback filter used. Output may differ.';
    } else {
        temporalHelperText = 'Full temporal smoothing available.';
    }

    return {
        status,
        checks,
        temporalBlocked,
        vlmUnavailable,
        hasBlockingIssues,
        summaryMessage,
        temporalHelperText,
    };
}

/**
 * Get color class for preflight status
 */
export function getPreflightStatusColor(status: PreflightStatus): string {
    switch (status) {
        case 'ready':
            return 'text-green-400';
        case 'warning':
            return 'text-amber-400';
        case 'error':
            return 'text-red-400';
        default:
            return 'text-gray-400';
    }
}

/**
 * Get background class for preflight status
 */
export function getPreflightStatusBg(status: PreflightStatus): string {
    switch (status) {
        case 'ready':
            return 'bg-green-900/30 border-green-700/50';
        case 'warning':
            return 'bg-amber-900/30 border-amber-700/50';
        case 'error':
            return 'bg-red-900/30 border-red-700/50';
        default:
            return 'bg-gray-800/50 border-gray-700/50';
    }
}

/**
 * Get emoji for preflight status
 */
export function getPreflightStatusEmoji(status: PreflightStatus): string {
    switch (status) {
        case 'ready':
            return '✅';
        case 'warning':
            return '⚠️';
        case 'error':
            return '❌';
        default:
            return '❓';
    }
}

/**
 * Check if a warning message indicates temporal fallback
 */
export function isTemporalFallbackWarning(warning: string): boolean {
    const lowerWarning = warning.toLowerCase();
    return (
        lowerWarning.includes('normalize') ||
        lowerWarning.includes('tmix') ||
        lowerWarning.includes('zero-byte') ||
        lowerWarning.includes('fallback') ||
        lowerWarning.includes('temporal') && lowerWarning.includes('skip')
    );
}

/**
 * Extract temporal fallback indicators from warnings array
 */
export function getTemporalFallbackInfo(warnings: string[] | undefined): {
    hasFallback: boolean;
    fallbackReasons: string[];
} {
    if (!warnings || warnings.length === 0) {
        return { hasFallback: false, fallbackReasons: [] };
    }

    const fallbackReasons = warnings.filter(isTemporalFallbackWarning);
    return {
        hasFallback: fallbackReasons.length > 0,
        fallbackReasons,
    };
}
