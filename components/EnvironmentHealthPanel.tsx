/**
 * Environment Health Panel
 * 
 * Displays environment health status for ComfyUI, VLM, ffmpeg, and directories.
 * Shows green/amber/red indicators with actionable error messages.
 * Includes "copy diagnostics" functionality for troubleshooting.
 * 
 * Now also fetches narrative summary for additional preflight context.
 * 
 * Part of G1 - Self-Diagnostics & Environment Health Panel
 * 
 * @module components/EnvironmentHealthPanel
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocalGenerationSettings } from '../contexts/LocalGenerationSettingsContext';
import {
    runFullHealthCheck,
    formatDiagnostics,
    formatDiagnosticsJSON,
    getStatusIcon,
    getStatusColorClass,
    getStatusBgClass,
    type EnvironmentHealthReport,
    type HealthCheckResult,
    type HealthStatus,
} from '../services/environmentHealthService';
import {
    ProductionSummary,
    NarrativeSummary,
    formatAge,
    calculateSummaryAge,
    isSummaryStale,
    DEFAULT_STALENESS_THRESHOLD_MS,
} from '../types/pipelineSummary';
import { fetchAllRunSummaries } from '../services/staticDataService';

type RunSummary = ProductionSummary;

type NarrativeSummaryState = NarrativeSummary | null;

// ============================================================================
// Types
// ============================================================================

interface EnvironmentHealthPanelProps {
    /** Whether the panel is collapsed by default */
    defaultCollapsed?: boolean;
    /** Compact mode - smaller layout for embedding */
    compact?: boolean;
    /** Auto-refresh interval in milliseconds (0 to disable) */
    autoRefreshMs?: number;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Individual health check row
 */
const HealthCheckRow: React.FC<{
    check: HealthCheckResult;
    compact?: boolean;
}> = ({ check, compact }) => {
    const [showDetails, setShowDetails] = useState(false);
    
    return (
        <div 
            className={`
                ${getStatusBgClass(check.status)} 
                ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} 
                rounded-lg ring-1 transition-all
                ${check.details ? 'cursor-pointer hover:ring-gray-600' : ''}
            `}
            onClick={() => check.details && setShowDetails(!showDetails)}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{getStatusIcon(check.status)}</span>
                    <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-gray-200`}>
                        {check.name}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} ${getStatusColorClass(check.status)}`}>
                        {check.message}
                    </span>
                    {check.details && (
                        <span className="text-gray-500 text-xs">
                            {showDetails ? '▼' : '▶'}
                        </span>
                    )}
                </div>
            </div>
            
            {/* Details section (expandable) */}
            {showDetails && check.details && (
                <div className="mt-2 pt-2 border-t border-gray-700/50">
                    <p className="text-xs text-gray-400 leading-relaxed">{check.details}</p>
                    {check.path && (
                        <p className="text-[10px] text-gray-500 mt-1 font-mono truncate">
                            📍 {check.path}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Overall status badge
 */
const OverallStatusBadge: React.FC<{
    status: HealthStatus;
    summary: string;
}> = ({ status, summary }) => {
    const bgClass = {
        healthy: 'bg-green-900/50 border-green-600/50 text-green-300',
        warning: 'bg-amber-900/50 border-amber-600/50 text-amber-300',
        error: 'bg-red-900/50 border-red-600/50 text-red-300',
        checking: 'bg-blue-900/50 border-blue-600/50 text-blue-300',
        unknown: 'bg-gray-900/50 border-gray-600/50 text-gray-300',
    }[status];
    
    return (
        <div className={`px-3 py-1.5 rounded-full border ${bgClass} text-xs font-medium flex items-center gap-2`}>
            <span>{getStatusIcon(status)}</span>
            <span>{summary}</span>
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const EnvironmentHealthPanel: React.FC<EnvironmentHealthPanelProps> = ({
    defaultCollapsed = true,
    compact = false,
    autoRefreshMs = 0,
}) => {
    const { settings } = useLocalGenerationSettings();
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [report, setReport] = useState<EnvironmentHealthReport | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'copied-json'>('idle');
    const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
    const [narrativeSummary, setNarrativeSummary] = useState<NarrativeSummaryState>(null);
    
    // Run health check
    const runCheck = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const result = await runFullHealthCheck({
                comfyUIUrl: settings?.comfyUIUrl,
                vlmUrl: settings?.visionLLMProviderUrl || settings?.llmProviderUrl,
            });
            setReport(result);
        } catch (error) {
            console.error('[EnvironmentHealthPanel] Health check failed:', error);
            // Create an error report
            setReport({
                overall: 'error',
                checks: {
                    comfyUI: { name: 'ComfyUI Server', status: 'error', message: 'Check failed', checkedAt: Date.now() },
                    vlm: { name: 'Vision LLM', status: 'unknown', message: 'Not checked', checkedAt: Date.now() },
                    ffmpeg: { name: 'FFmpeg', status: 'unknown', message: 'Not checked', checkedAt: Date.now() },
                    directories: { name: 'Directories', status: 'unknown', message: 'Not checked', checkedAt: Date.now() },
                },
                timestamp: Date.now(),
                summary: 'Health check failed',
            });
        } finally {
            setIsRefreshing(false);
        }
    }, [settings?.comfyUIUrl, settings?.visionLLMProviderUrl, settings?.llmProviderUrl]);
    
    // Initial check on mount
    useEffect(() => {
        runCheck();
    }, [runCheck]);

    // Fetch latest run summaries for preflight info (both production and narrative)
    useEffect(() => {
        // Use service layer to fetch both summaries in parallel
        fetchAllRunSummaries()
            .then(({ production, narrative }) => {
                if (production) setRunSummary(production);
                if (narrative) setNarrativeSummary(narrative);
            })
            .catch(() => {
                setRunSummary(null);
                setNarrativeSummary(null);
            });
    }, []);
    
    // Determine which summary to use for preflight display
    // Prefer production if available and fresh, else fall back to narrative
    const preflightSource = (() => {
        const prodAge = calculateSummaryAge(runSummary?.finishedAt);
        const narrAge = calculateSummaryAge(narrativeSummary?.finishedAt);
        const prodStale = isSummaryStale(runSummary?.finishedAt, DEFAULT_STALENESS_THRESHOLD_MS);
        const narrStale = isSummaryStale(narrativeSummary?.finishedAt, DEFAULT_STALENESS_THRESHOLD_MS);
        
        // If production has preflight and is not stale, use it
        if (runSummary?.preflight && !prodStale) {
            return { source: 'production' as const, summary: runSummary, age: prodAge };
        }
        // If narrative has preflight and is not stale, use it
        if (narrativeSummary?.preflight && !narrStale) {
            return { source: 'narrative' as const, summary: narrativeSummary, age: narrAge };
        }
        // Fall back to production preflight even if stale
        if (runSummary?.preflight) {
            return { source: 'production' as const, summary: runSummary, age: prodAge, stale: true };
        }
        // Fall back to narrative preflight even if stale
        if (narrativeSummary?.preflight) {
            return { source: 'narrative' as const, summary: narrativeSummary, age: narrAge, stale: true };
        }
        return null;
    })();
    
    // Auto-refresh
    useEffect(() => {
        if (autoRefreshMs > 0) {
            const interval = setInterval(runCheck, autoRefreshMs);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [autoRefreshMs, runCheck]);
    
    // Copy diagnostics handlers
    const handleCopyMarkdown = async () => {
        if (!report) return;
        try {
            await navigator.clipboard.writeText(formatDiagnostics(report));
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        } catch (error) {
            console.error('Failed to copy diagnostics:', error);
        }
    };
    
    const handleCopyJSON = async () => {
        if (!report) return;
        try {
            await navigator.clipboard.writeText(formatDiagnosticsJSON(report));
            setCopyStatus('copied-json');
            setTimeout(() => setCopyStatus('idle'), 2000);
        } catch (error) {
            console.error('Failed to copy diagnostics:', error);
        }
    };
    
    // Render loading state
    if (!report) {
        return (
            <div className="bg-gray-900/50 p-4 rounded-lg ring-1 ring-gray-700/80 mb-6">
                <div className="flex items-center justify-center gap-2 text-gray-400 animate-pulse">
                    <span>⏳</span>
                    <span className="text-sm">Checking environment...</span>
                </div>
            </div>
        );
    }
    
    // Compact mode for embedding in headers
    if (compact) {
        return (
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex items-center gap-2 text-xs"
                title="Click to view Environment Health details"
            >
                <OverallStatusBadge status={report.overall} summary={report.summary} />
            </button>
        );
    }
    
    return (
        <div className="bg-gray-900/50 rounded-lg ring-1 ring-gray-700/80 mb-6 overflow-hidden">
            {/* Header */}
            <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">🏥</span>
                    <h4 className="text-md font-semibold text-gray-200">Environment Health</h4>
                    <OverallStatusBadge status={report.overall} summary={report.summary} />
                </div>
                <div className="flex items-center gap-2">
                    {isRefreshing && (
                        <span className="text-xs text-blue-400 animate-pulse">Refreshing...</span>
                    )}
                    <span className="text-gray-400 text-sm">{isCollapsed ? '▶' : '▼'}</span>
                </div>
            </button>
            
            {/* Content */}
            {!isCollapsed && (
                <div className="px-4 pb-4 space-y-4">
                    {/* Health checks grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <HealthCheckRow check={report.checks.comfyUI} />
                        <HealthCheckRow check={report.checks.vlm} />
                        <HealthCheckRow check={report.checks.ffmpeg} />
                        <HealthCheckRow check={report.checks.directories} />
                    </div>

                    {/* Preflight info from recent pipeline runs */}
                    {preflightSource && preflightSource.summary?.preflight ? (
                        <div className={`bg-gray-800/40 border rounded-lg p-3 space-y-1 ${preflightSource.stale ? 'border-amber-700/60' : 'border-gray-700/60'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-200">Recent Pipeline Preflight</span>
                                    {preflightSource.stale && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded">stale</span>
                                    )}
                                    <span className="text-[10px] text-gray-500">
                                        ({preflightSource.source === 'production' ? '📹 production' : '🎬 narrative'})
                                    </span>
                                </div>
                                <span className="text-[10px] text-gray-500">
                                    {preflightSource.age !== null ? formatAge(preflightSource.age) : ''}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-300">
                                <div>ffmpeg: {preflightSource.summary.preflight.ffmpegVersion || 'n/a'}</div>
                                <div>tmix normalize: {preflightSource.summary.preflight.tmixNormalizeSupported ? 'supported' : 'fallback'}</div>
                                <div>VLM: {preflightSource.summary.preflight.vlmReachable ? 'reachable' : 'unreachable'}{preflightSource.summary.preflight.vlmEndpoint ? ` (${preflightSource.summary.preflight.vlmEndpoint})` : ''}</div>
                            </div>
                            {preflightSource.source === 'production' && (preflightSource.summary as ProductionSummary).videoPath && (
                                <div className="text-[11px] text-gray-400 truncate">Last video: {(preflightSource.summary as ProductionSummary).videoPath}</div>
                            )}
                            {preflightSource.source === 'narrative' && (preflightSource.summary as NarrativeSummary).finalVideoPath && (
                                <div className="text-[11px] text-gray-400 truncate">Last video: {(preflightSource.summary as NarrativeSummary).finalVideoPath}</div>
                            )}
                            {preflightSource.summary.warnings && preflightSource.summary.warnings.length > 0 && (
                                <ul className="text-[11px] text-amber-300 list-disc list-inside">
                                    {preflightSource.summary.warnings.map((w, idx) => (
                                        <li key={idx}>{w}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : (
                        <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-3">
                            <div className="text-sm text-gray-500">
                                No recent pipeline preflight data available.
                                {narrativeSummary && !narrativeSummary.preflight && !runSummary?.preflight && (
                                    <span className="block text-xs text-gray-600 mt-1">
                                        Pipeline runs found, but no preflight data. Preflight is captured during pipeline execution.
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={runCheck}
                                disabled={isRefreshing}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors disabled:opacity-50"
                            >
                                🔄 Refresh
                            </button>
                            <button
                                onClick={handleCopyMarkdown}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                            >
                                {copyStatus === 'copied' ? '✓ Copied!' : '📋 Copy Diagnostics'}
                            </button>
                            <button
                                onClick={handleCopyJSON}
                                className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                            >
                                {copyStatus === 'copied-json' ? '✓ Copied!' : '{ } JSON'}
                            </button>
                        </div>
                        <span className="text-[10px] text-gray-500">
                            Last checked: {new Date(report.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                    
                    {/* Help text for errors */}
                    {report.overall === 'error' && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">
                            <p className="font-medium mb-1">⚠️ Environment Issues Detected</p>
                            <p className="text-red-400/80">
                                Check the items above for details. Common fixes:
                            </p>
                            <ul className="list-disc list-inside mt-1 text-red-400/70 space-y-0.5">
                                <li>Start ComfyUI via VS Code task: "Start ComfyUI Server (Patched - Recommended)"</li>
                                <li>Start LM Studio and load a vision-capable model for Vision QA</li>
                                <li>Ensure ffmpeg is installed and in system PATH</li>
                            </ul>
                        </div>
                    )}
                    
                    {/* Docs link */}
                    <p className="text-[10px] text-gray-500">
                        📖 See <span className="text-blue-400">Documentation/Guides/GETTING_STARTED.md</span> for setup help
                    </p>
                </div>
            )}
        </div>
    );
};

export default EnvironmentHealthPanel;
