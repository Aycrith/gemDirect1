/**
 * Pipeline Telemetry Panel
 * 
 * Read-only UI component that displays production and narrative pipeline summaries.
 * Shows status, preflight info, video paths, warnings, and a Sources table for narratives.
 * 
 * Phase 1: Read-only consumption of existing summary files.
 * Phase 2: Run launcher buttons.
 * Phase 3: Preflight gating & temporal UX.
 * 
 * @module components/PipelineTelemetryPanel
 */

import React, { useState, useCallback } from 'react';
import { usePipelineSummaries } from '../hooks/usePipelineSummaries';
import { useRunController } from '../hooks/useRunController';
import { useRunHistory } from '../hooks/useRunHistory';
import { PipelineRunLauncher } from './PipelineRunLauncher';
import {
    clusterWarnings,
    getQaSignal,
    getQaBadgeClass,
    extractProductionArtifactLinks,
    countShotWarnings,
} from '../utils/qualitySignals';
import {
    NarrativeShotLite,
    NarrativeShotArtifact,
    ShotQaSummary,
    NarrativeQaSummary,
    PreflightInfo,
    ProductionSummary,
    NarrativeSummary,
    formatAge,
} from '../types/pipelineSummary';
import type { RunState } from '../types/pipelineRun';
import type { RunHistoryEntry } from '../types/runRegistry';

// ============================================================================
// Types
// ============================================================================

interface PipelineTelemetryPanelProps {
    /** Whether the panel is collapsed by default */
    defaultCollapsed?: boolean;
    /** Auto-refresh interval in ms (0 to disable, default: 5 minutes) */
    autoRefreshMs?: number;
    /** Staleness threshold in ms (default: 24 hours) */
    stalenessThresholdMs?: number;
    /** Whether to show the run launcher section (default: true for Phase 2) */
    showLauncher?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Status badge with color coding
 */
const StatusBadge: React.FC<{ status?: string; stale?: boolean }> = ({ status, stale }) => {
    const getStatusStyle = () => {
        if (stale) return 'bg-gray-700 text-gray-400';
        switch (status) {
            case 'succeeded':
                return 'bg-green-900/50 text-green-300 border-green-600/50';
            case 'failed':
                return 'bg-red-900/50 text-red-300 border-red-600/50';
            case 'running':
                return 'bg-blue-900/50 text-blue-300 border-blue-600/50';
            case 'pending':
                return 'bg-amber-900/50 text-amber-300 border-amber-600/50';
            default:
                return 'bg-gray-700 text-gray-400';
        }
    };
    
    const getStatusIcon = () => {
        if (stale) return '⏳';
        switch (status) {
            case 'succeeded':
                return '✅';
            case 'failed':
                return '❌';
            case 'running':
                return '🔄';
            case 'pending':
                return '⏳';
            default:
                return '❓';
        }
    };
    
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle()}`}>
            <span>{getStatusIcon()}</span>
            <span>{stale ? 'stale' : (status || 'unknown')}</span>
        </span>
    );
};

/**
 * QA status badge with verdict normalization
 */
const QaBadge: React.FC<{ status?: string; compact?: boolean }> = ({ status, compact = false }) => {
    const signal = getQaSignal(status);
    const badgeClass = getQaBadgeClass(signal.verdict);
    
    if (compact) {
        return (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeClass}`}>
                {signal.icon}
            </span>
        );
    }
    
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${badgeClass}`}>
            <span>{signal.icon}</span>
            <span>QA: {signal.label}</span>
        </span>
    );
};

/**
 * "Not available" placeholder badge
 */
const NotAvailableBadge: React.FC<{ label?: string }> = ({ label = 'Not available' }) => (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] text-gray-500 bg-gray-800/50 border border-gray-700/30">
        {label}
    </span>
);

/**
 * Compact verdict badge for shot tables
 */
const VerdictBadge: React.FC<{ verdict?: string }> = ({ verdict }) => {
    const signal = getQaSignal(verdict);
    const badgeClass = getQaBadgeClass(signal.verdict);
    
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeClass}`}>
            <span>{signal.icon}</span>
            <span>{signal.label}</span>
        </span>
    );
};

/**
 * Preflight info row - displays ffmpeg, tmix, and VLM status
 */
const PreflightRow: React.FC<{ preflight?: PreflightInfo }> = ({ preflight }) => {
    if (!preflight) return null;
    
    return (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
            <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] text-gray-500 font-medium">Preflight:</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
                <span className="px-1.5 py-0.5 bg-gray-700/50 rounded text-gray-300">
                    ffmpeg {preflight.ffmpegVersion || 'n/a'}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${preflight.tmixNormalizeSupported ? 'bg-green-900/30 text-green-300' : 'bg-amber-900/30 text-amber-300'}`}>
                    tmix: {preflight.tmixNormalizeSupported ? 'supported' : 'fallback'}
                </span>
                <span className={`px-1.5 py-0.5 rounded ${preflight.vlmReachable ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                    VLM: {preflight.vlmReachable ? 'reachable' : 'unreachable'}
                </span>
            </div>
        </div>
    );
};

/**
 * Clickable file path link
 * Opens in file explorer via file:// protocol
 * NOTE: file:// links may be blocked by browser security. 
 * Phase 2 could add a backend endpoint to serve files.
 */
const FilePathLink: React.FC<{ path?: string; label?: string }> = ({ path, label }) => {
    if (!path) return <span className="text-gray-500 text-xs">—</span>;
    
    // Convert Windows path to file:// URL
    const fileUrl = `file:///${path.replace(/\\/g, '/')}`;
    
    // Extract filename for display
    const filename = path.split(/[/\\]/).pop() || path;
    
    return (
        <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs truncate max-w-xs inline-block hover:underline"
            title={path}
        >
            {label || filename}
        </a>
    );
};

/**
 * Categorized warnings list with clustering by type
 */
const CategorizedWarningsList: React.FC<{ warnings?: string[] }> = ({ warnings }) => {
    if (!warnings || warnings.length === 0) return null;
    
    const clusters = clusterWarnings(warnings);
    
    if (clusters.length === 0) return null;
    
    const getClusterStyle = (color: string) => {
        const styles: Record<string, string> = {
            amber: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
            blue: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
            purple: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
            cyan: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
            gray: 'bg-gray-700/40 text-gray-300 border-gray-600/50',
        };
        return styles[color] || styles.gray;
    };
    
    return (
        <div className="mt-2 space-y-2">
            {clusters.map((cluster) => (
                <div key={cluster.category} className="space-y-1">
                    {/* Cluster badge */}
                    <div className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getClusterStyle(cluster.color)}`}>
                            {cluster.icon} {cluster.label} ({cluster.warnings.length})
                        </span>
                    </div>
                    {/* Cluster warnings */}
                    {cluster.warnings.map((warning, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-gray-400 pl-4">
                            <span className="flex-shrink-0 text-gray-500">•</span>
                            <span className="truncate" title={warning.message}>{warning.message}</span>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

/**
 * Artifact links section for production summary
 */
const ArtifactLinksSection: React.FC<{ 
    visionQaPath?: string;
    benchmarkJsonPath?: string;
    benchmarkReportPath?: string;
}> = ({ visionQaPath, benchmarkJsonPath, benchmarkReportPath }) => {
    const hasLinks = visionQaPath || benchmarkJsonPath || benchmarkReportPath;
    
    if (!hasLinks) {
        return (
            <div className="mt-2 pt-2 border-t border-gray-700/50">
                <span className="text-[10px] text-gray-500">Artifacts: </span>
                <NotAvailableBadge />
            </div>
        );
    }
    
    return (
        <div className="mt-2 pt-2 border-t border-gray-700/50">
            <span className="text-[10px] text-gray-500 mb-1 block">Artifacts:</span>
            <div className="flex flex-wrap gap-2">
                {visionQaPath && (
                    <FilePathLink path={visionQaPath} label="🔍 Vision QA" />
                )}
                {benchmarkJsonPath && (
                    <FilePathLink path={benchmarkJsonPath} label="📊 Benchmark JSON" />
                )}
                {benchmarkReportPath && (
                    <FilePathLink path={benchmarkReportPath} label="📄 Benchmark Report" />
                )}
            </div>
        </div>
    );
};

/**
 * Production summary card
 */
const ProductionCard: React.FC<{
    production: ProductionSummary | null;
    stale: boolean;
    ageMs: number | null;
    mergedPreflight?: PreflightInfo | null;
}> = ({ production, stale, ageMs, mergedPreflight }) => {
    if (!production) {
        return (
            <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-gray-200">📹 Production Pipeline</h5>
                    <StatusBadge status={undefined} stale={true} />
                </div>
                <p className="text-xs text-gray-500">No production runs found. Run a pipeline to see results here.</p>
            </div>
        );
    }
    
    // Extract artifact links
    const artifacts = extractProductionArtifactLinks(production);
    
    // Use merged preflight if provided, otherwise fall back to production preflight
    const preflightToShow = mergedPreflight ?? production.preflight;
    
    return (
        <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h5 className="text-sm font-semibold text-gray-200">📹 Production Pipeline</h5>
                    <StatusBadge status={production.status} stale={stale} />
                    {production.visionQaStatus ? (
                        <QaBadge status={production.visionQaStatus} />
                    ) : (
                        <NotAvailableBadge label="QA: N/A" />
                    )}
                </div>
                <span className="text-[10px] text-gray-500">{formatAge(ageMs)}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                    <span className="text-gray-500">Pipeline:</span>{' '}
                    <span className="text-gray-300">{production.pipelineId || 'N/A'}</span>
                </div>
                <div>
                    <span className="text-gray-500">Started:</span>{' '}
                    <span className="text-gray-300">
                        {production.startedAt ? new Date(production.startedAt).toLocaleString() : 'N/A'}
                    </span>
                </div>
                <div className="col-span-2">
                    <span className="text-gray-500">Video:</span>{' '}
                    <FilePathLink path={production.videoPath} />
                </div>
            </div>
            
            <ArtifactLinksSection 
                visionQaPath={artifacts.visionQa}
                benchmarkJsonPath={artifacts.benchmarkJson}
                benchmarkReportPath={artifacts.benchmarkReport}
            />
            
            <PreflightRow preflight={preflightToShow} />
            <CategorizedWarningsList warnings={production.warnings} />
        </div>
    );
};

/**
 * Narrative sources table with QA verdicts
 */
const NarrativeSourcesTable: React.FC<{ 
    shots: NarrativeShotLite[];
    qaSummary?: NarrativeQaSummary;
    shotArtifacts?: NarrativeShotArtifact[];
}> = ({ shots, qaSummary, shotArtifacts }) => {
    if (!shots || shots.length === 0) {
        return <p className="text-xs text-gray-500">No shots in this narrative.</p>;
    }
    
    // Check if any shots have temporal issues (fallback occurred)
    const shotsWithTemporalIssues = shots.filter(s => s.temporalWarning && !s.temporalApplied);
    const hasTemporalFallbacks = shotsWithTemporalIssues.length > 0;
    
    // Build QA verdict map from qaSummary
    const qaVerdictMap = new Map<string, ShotQaSummary>();
    if (qaSummary?.shots) {
        for (const shotQa of qaSummary.shots) {
            qaVerdictMap.set(shotQa.shotId, shotQa);
        }
    }
    
    // Build artifact map for links
    const artifactMap = new Map<string, NarrativeShotArtifact>();
    if (shotArtifacts) {
        for (const artifact of shotArtifacts) {
            artifactMap.set(artifact.shotId, artifact);
        }
    }
    
    const hasQaData = qaVerdictMap.size > 0;
    
    return (
        <div className="mt-3 overflow-x-auto">
            {/* Summary badges */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                {/* Temporal fallback summary */}
                {hasTemporalFallbacks && (
                    <span className="px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded text-[10px] font-medium border border-amber-700/50">
                        ⏱️ {shotsWithTemporalIssues.length}/{shots.length} temporal fallback
                    </span>
                )}
                {/* QA summary badge */}
                {!hasQaData && (
                    <NotAvailableBadge label="QA data: N/A" />
                )}
            </div>
            
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-gray-700">
                        <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Shot</th>
                        {hasQaData && (
                            <th className="text-center py-1.5 px-2 text-gray-400 font-medium">QA</th>
                        )}
                        <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Video</th>
                        <th className="text-center py-1.5 px-2 text-gray-400 font-medium">Temporal</th>
                        <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {shots.map((shot) => {
                        const hasFallback = shot.temporalWarning && !shot.temporalApplied;
                        const shotQa = qaVerdictMap.get(shot.shotId);
                        const artifact = artifactMap.get(shot.shotId);
                        
                        return (
                            <tr 
                                key={shot.shotId} 
                                className={`border-b border-gray-700/50 hover:bg-gray-700/20 ${hasFallback ? 'bg-amber-900/10' : ''}`}
                            >
                                <td className="py-1.5 px-2 text-gray-300 font-mono">{shot.shotId}</td>
                                {hasQaData && (
                                    <td className="py-1.5 px-2 text-center">
                                        <VerdictBadge verdict={shotQa?.verdict} />
                                    </td>
                                )}
                                <td className="py-1.5 px-2">
                                    <FilePathLink path={shot.videoPath || shot.originalVideoPath} />
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                    {shot.temporalApplied ? (
                                        <span className="text-green-400" title="Temporal smoothing applied">✓</span>
                                    ) : hasFallback ? (
                                        <span className="text-amber-400" title="Fell back to original video">⚠️</span>
                                    ) : (
                                        <span className="text-gray-500">—</span>
                                    )}
                                </td>
                                <td className="py-1.5 px-2 text-gray-400 truncate max-w-[200px]" title={shot.temporalWarning || artifact?.temporalSkipReason}>
                                    {hasFallback ? (
                                        <span className="text-amber-400/80">{shot.temporalWarning}</span>
                                    ) : artifact?.temporalSkipReason ? (
                                        <span className="text-gray-500 text-[10px]">{artifact.temporalSkipReason}</span>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

/**
 * Narrative QA summary section
 */
const NarrativeQaSection: React.FC<{ qaSummary?: NarrativeQaSummary }> = ({ qaSummary }) => {
    if (!qaSummary) {
        return (
            <div className="flex items-center gap-2">
                <NotAvailableBadge label="QA: N/A" />
            </div>
        );
    }
    
    return (
        <div className="flex items-center gap-2">
            <QaBadge status={qaSummary.overallVerdict} />
            {qaSummary.overallReasons && qaSummary.overallReasons.length > 0 && (
                <span className="text-[10px] text-gray-500" title={qaSummary.overallReasons.join('; ')}>
                    {qaSummary.overallReasons[0]}
                </span>
            )}
        </div>
    );
};

/**
 * Narrative summary card
 */
const NarrativeCard: React.FC<{
    narrative: NarrativeSummary | null;
    stale: boolean;
    ageMs: number | null;
}> = ({ narrative, stale, ageMs }) => {
    const [showSources, setShowSources] = useState(false);
    
    if (!narrative) {
        return (
            <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-gray-200">🎬 Narrative Pipeline</h5>
                    <StatusBadge status={undefined} stale={true} />
                </div>
                <p className="text-xs text-gray-500">No narrative runs found. Run a multi-shot narrative to see results here.</p>
            </div>
        );
    }
    
    const shotCount = narrative.shots?.length || 0;
    const temporalCount = narrative.shots?.filter(s => s.temporalApplied).length || 0;
    
    // Count shots with warnings
    const shotWarnings = countShotWarnings(narrative.shots);
    
    return (
        <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h5 className="text-sm font-semibold text-gray-200">🎬 Narrative Pipeline</h5>
                    <StatusBadge status={narrative.status} stale={stale} />
                    <NarrativeQaSection qaSummary={narrative.qaSummary} />
                </div>
                <span className="text-[10px] text-gray-500">{formatAge(ageMs)}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="col-span-2">
                    <span className="text-gray-500">Title:</span>{' '}
                    <span className="text-gray-300">{narrative.title || narrative.narrativeId || 'Untitled'}</span>
                </div>
                <div>
                    <span className="text-gray-500">Shots:</span>{' '}
                    <span className="text-gray-300">{shotCount}</span>
                    {shotCount > 0 && (
                        <>
                            <span className="text-gray-500 ml-1">({temporalCount} smoothed)</span>
                            {shotWarnings.shotsWithAnyWarning > 0 && (
                                <span className="ml-2 px-1 py-0.5 bg-amber-900/40 text-amber-300 rounded text-[10px] border border-amber-700/50">
                                    ⚠️ {shotWarnings.shotsWithAnyWarning}
                                </span>
                            )}
                        </>
                    )}
                </div>
                <div>
                    <span className="text-gray-500">Started:</span>{' '}
                    <span className="text-gray-300">
                        {narrative.startedAt ? new Date(narrative.startedAt).toLocaleString() : 'N/A'}
                    </span>
                </div>
                <div className="col-span-2">
                    <span className="text-gray-500">Final Video:</span>{' '}
                    <FilePathLink path={narrative.finalVideoPath} />
                </div>
            </div>
            
            <PreflightRow preflight={narrative.preflight} />
            <CategorizedWarningsList warnings={narrative.warnings} />
            
            {/* Sources toggle */}
            {shotCount > 0 && (
                <div className="mt-3">
                    <button
                        onClick={() => setShowSources(!showSources)}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                        <span>{showSources ? '▼' : '▶'}</span>
                        <span>Sources Table ({shotCount} shots)</span>
                    </button>
                    {showSources && (
                        <NarrativeSourcesTable 
                            shots={narrative.shots || []} 
                            qaSummary={narrative.qaSummary}
                            shotArtifacts={narrative.shotArtifacts}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Empty/error state
 */
const EmptyState: React.FC<{ error?: string | null; loading?: boolean }> = ({ error, loading }) => {
    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 text-gray-400 py-8">
                <span className="animate-spin">⏳</span>
                <span className="text-sm">Loading pipeline summaries...</span>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 text-xs text-red-300">
                <p className="font-medium mb-1">⚠️ Failed to load summaries</p>
                <p className="text-red-400/80">{error}</p>
            </div>
        );
    }
    
    return (
        <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No pipeline runs found.</p>
            <p className="text-xs mt-1">Use the Run Launcher below to start a pipeline.</p>
        </div>
    );
};

/**
 * Run history section showing recent pipeline runs
 */
const RunHistorySection: React.FC<{
    runs: RunHistoryEntry[];
    totalCount: number;
    loading: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    onRefresh: () => void;
}> = ({ runs, totalCount, loading, error, lastFetchedAt, onRefresh }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
    
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'succeeded': return '✅';
            case 'failed': return '❌';
            case 'running': return '🔄';
            case 'cancelled': return '🛑';
            default: return '❓';
        }
    };
    
    const getTypeIcon = (type: string) => {
        return type === 'production' ? '📹' : '🎬';
    };
    
    const formatDuration = (ms: number | null) => {
        if (ms === null) return '—';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    };
    
    if (runs.length === 0 && !loading && !error) {
        return (
            <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-gray-200">📜 Run History</h5>
                </div>
                <p className="text-xs text-gray-500">No runs recorded yet. Run a pipeline to see history here.</p>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-800/40 border border-gray-700/60 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-200 hover:text-gray-100"
                >
                    <span>{isExpanded ? '▼' : '▶'}</span>
                    <span>📜 Run History</span>
                    <span className="text-xs text-gray-500 font-normal">({totalCount} total)</span>
                </button>
                <div className="flex items-center gap-2">
                    {loading && <span className="text-xs text-gray-500">Loading...</span>}
                    {lastFetchedAt && (
                        <span className="text-[10px] text-gray-500">
                            {formatAge(Date.now() - lastFetchedAt)}
                        </span>
                    )}
                    <button
                        onClick={onRefresh}
                        disabled={loading}
                        className="px-2 py-0.5 text-[10px] font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50"
                    >
                        🔄
                    </button>
                </div>
            </div>
            
            {error && (
                <div className="text-xs text-amber-400 mb-2">⚠️ {error}</div>
            )}
            
            {isExpanded && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-gray-700">
                                <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Type</th>
                                <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Status</th>
                                <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Identifier</th>
                                <th className="text-right py-1.5 px-2 text-gray-400 font-medium">Duration</th>
                                <th className="text-right py-1.5 px-2 text-gray-400 font-medium">Age</th>
                                <th className="text-center py-1.5 px-2 text-gray-400 font-medium">QA</th>
                                <th className="text-center py-1.5 px-2 text-gray-400 font-medium">Warnings</th>
                        <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Artifacts</th>
                        <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Steps</th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run) => (
                        <React.Fragment key={run.runId}>
                        <tr 
                            className="border-b border-gray-700/50 hover:bg-gray-700/20"
                        >
                                    <td className="py-1.5 px-2 text-gray-300">
                                        <span title={run.type}>{getTypeIcon(run.type)}</span>
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <span className={`inline-flex items-center gap-1 ${
                                            run.status === 'succeeded' ? 'text-green-400' :
                                            run.status === 'failed' ? 'text-red-400' :
                                            run.status === 'running' ? 'text-blue-400' :
                                            run.status === 'cancelled' ? 'text-gray-400' : 'text-gray-500'
                                        }`}>
                                            {getStatusIcon(run.status)}
                                            <span className="text-[10px]">{run.status}</span>
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-gray-300 truncate max-w-[180px]" title={run.identifier}>
                                        {run.sample || run.identifier}
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-gray-400">
                                        {formatDuration(run.durationMs)}
                                    </td>
                                    <td className="py-1.5 px-2 text-right text-gray-500">
                                        {formatAge(run.ageMs)}
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                        {run.visionQaStatus ? (
                                            <QaBadge status={run.visionQaStatus} compact />
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                        {run.warningCount > 0 ? (
                                            <span 
                                                className="inline-flex items-center px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded text-[10px] border border-amber-700/50"
                                                title={run.keyWarnings.join('\n')}
                                            >
                                                ⚠️ {run.warningCount}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <div className="flex items-center gap-1">
                                            {run.artifacts.video && (
                                                <FilePathLink path={run.artifacts.video} label="🎬" />
                                            )}
                                            {run.artifacts.finalVideo && (
                                                <FilePathLink path={run.artifacts.finalVideo} label="🎬" />
                                            )}
                                            {run.artifacts.visionQa && (
                                                <FilePathLink path={run.artifacts.visionQa} label="🔍" />
                                            )}
                                            {run.artifacts.benchmarkJson && (
                                                <FilePathLink path={run.artifacts.benchmarkJson} label="📊" />
                                            )}
                                            {!run.artifacts.video && !run.artifacts.finalVideo && !run.artifacts.visionQa && !run.artifacts.benchmarkJson && (
                                                <span className="text-gray-600">—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-1.5 px-2 text-gray-400">
                                        {run.stepTimings && run.stepTimings.length > 0 ? (
                                            <div className="flex flex-wrap items-center gap-1">
                                                {run.stepTimings.slice(0, 4).map((step, idx) => (
                                                    <span
                                                        key={`${run.runId}-step-${idx}`}
                                                        className={`px-1.5 py-0.5 rounded text-[10px] border ${
                                                            step.status === 'complete'
                                                                ? 'bg-green-900/30 text-green-300 border-green-700/40'
                                                                : step.status === 'failed'
                                                                ? 'bg-red-900/30 text-red-300 border-red-700/40'
                                                                : 'bg-blue-900/30 text-blue-300 border-blue-700/40'
                                                        }`}
                                                        title={`${step.stepId} — ${Math.round(step.durationMs || 0)} ms`}
                                                    >
                                                        {step.stepId} ({Math.round(step.durationMs || 0)}ms)
                                                    </span>
                                                ))}
                                                {run.stepTimings.length > 4 && (
                                                    <button
                                                        onClick={() => setExpandedRunId(expandedRunId === run.runId ? null : run.runId)}
                                                        className="text-[10px] text-blue-300 underline"
                                                    >
                                                        +{run.stepTimings.length - 4} more
                                                    </button>
                                                )}
                                            </div>
                                        ) : run.validationWarnings && run.validationWarnings.length > 0 ? (
                                            <button
                                                onClick={() => setExpandedRunId(expandedRunId === run.runId ? null : run.runId)}
                                                className="text-[10px] text-amber-300 underline"
                                            >
                                                Validation warnings
                                            </button>
                                        ) : (
                                            <span className="text-gray-600">—</span>
                                        )}
                                    </td>
                                </tr>
                        {expandedRunId === run.runId && (
                            <tr className="bg-gray-800/30 border-b border-gray-700/50">
                                <td colSpan={9} className="py-2 px-3">
                                    <div className="space-y-2 text-[11px] text-gray-300">
                                        {run.stepTimings && run.stepTimings.length > 0 && (
                                            <div>
                                                <div className="text-gray-400 mb-1">Step timings:</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {run.stepTimings.map((step, idx) => (
                                                        <span
                                                            key={`${run.runId}-step-detail-${idx}`}
                                                            className={`px-1.5 py-0.5 rounded border ${
                                                                step.status === 'complete'
                                                                    ? 'bg-green-900/30 text-green-300 border-green-700/40'
                                                                    : step.status === 'failed'
                                                                    ? 'bg-red-900/30 text-red-300 border-red-700/40'
                                                                    : 'bg-blue-900/30 text-blue-300 border-blue-700/40'
                                                            }`}
                                                        >
                                                            {step.stepId}: {Math.round(step.durationMs || 0)} ms ({step.status})
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {run.validationWarnings && run.validationWarnings.length > 0 && (
                                            <div>
                                                <div className="text-gray-400 mb-1">Validation warnings:</div>
                                                <ul className="list-disc list-inside text-amber-300">
                                                    {run.validationWarnings.map((w, idx) => (
                                                        <li key={`${run.runId}-val-${idx}`}>{w}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {!run.stepTimings && !run.validationWarnings && (
                                            <span className="text-gray-500">No additional details.</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
                </div>
            )}
            
            {!isExpanded && runs.length > 0 && (
                <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{runs.filter(r => r.status === 'succeeded').length} succeeded</span>
                    <span>{runs.filter(r => r.status === 'failed').length} failed</span>
                    {runs[0] && (
                        <span>Latest: {formatAge(runs[0].ageMs)}</span>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const PipelineTelemetryPanel: React.FC<PipelineTelemetryPanelProps> = ({
    defaultCollapsed = false,
    autoRefreshMs = 5 * 60 * 1000,
    stalenessThresholdMs,
    showLauncher = true,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    
    const {
        state,
        refresh,
        isReady,
        hasNeither,
    } = usePipelineSummaries({
        autoRefresh: autoRefreshMs > 0,
        refreshIntervalMs: autoRefreshMs,
        stalenessThresholdMs,
        fetchFull: true, // Fetch full summaries to get preflight info
    });
    
    // Run history for showing recent runs
    const {
        runs: historyRuns,
        totalCount: historyTotalCount,
        loading: historyLoading,
        error: historyError,
        lastFetchedAt: historyLastFetchedAt,
        refresh: refreshHistory,
    } = useRunHistory({
        autoRefreshMs: 30000, // 30 second refresh for history
    });
    
    // Run controller for detecting in-flight runs and auto-refreshing on completion
    const { isActive: runIsActive } = useRunController({
        onComplete: useCallback((run: RunState) => {
            // Auto-refresh summaries and history when a run completes
            if (run.status === 'succeeded' || run.status === 'failed') {
                // Small delay to allow summary files to be written
                setTimeout(() => {
                    refresh();
                    refreshHistory();
                }, 2000);
            }
        }, [refresh, refreshHistory]),
    });
    
    // Determine overall status for header
    const getOverallStatus = () => {
        if (runIsActive) return { icon: '🔄', text: 'Running...', class: 'text-blue-400' };
        if (state.loading) return { icon: '⏳', text: 'Loading...', class: 'text-gray-400' };
        if (state.error) return { icon: '❌', text: 'Error', class: 'text-red-400' };
        if (hasNeither) return { icon: '❓', text: 'No runs', class: 'text-gray-400' };
        
        const prodOk = state.production?.status === 'succeeded';
        const narrOk = state.narrative?.status === 'succeeded';
        const bothStale = state.productionStale && state.narrativeStale;
        
        if (bothStale) return { icon: '⏳', text: 'Stale', class: 'text-amber-400' };
        if (prodOk && narrOk) return { icon: '✅', text: 'All passed', class: 'text-green-400' };
        if (prodOk || narrOk) return { icon: '✓', text: 'Partial', class: 'text-amber-400' };
        return { icon: '⚠️', text: 'Issues', class: 'text-amber-400' };
    };
    
    const overallStatus = getOverallStatus();
    
    return (
        <div className="bg-gray-900/50 rounded-lg ring-1 ring-gray-700/80 mb-6 overflow-hidden">
            {/* Header */}
            <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <h4 className="text-md font-semibold text-gray-200">Pipeline Telemetry</h4>
                    <span className={`text-xs ${overallStatus.class}`}>
                        {overallStatus.icon} {overallStatus.text}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {state.lastFetchedAt && (
                        <span className="text-[10px] text-gray-500">
                            Updated {formatAge(Date.now() - state.lastFetchedAt)}
                        </span>
                    )}
                    <span className="text-gray-400 text-sm">{isCollapsed ? '▶' : '▼'}</span>
                </div>
            </button>
            
            {/* Content */}
            {!isCollapsed && (
                <div className="px-4 pb-4 space-y-4">
                    {/* Loading/Error states */}
                    {(state.loading || state.error || hasNeither) && !isReady ? (
                        <EmptyState loading={state.loading} error={state.error} />
                    ) : (
                        <>
                            {/* Production card - uses mergedPreflight for consistency */}
                            <ProductionCard
                                production={state.production}
                                stale={state.productionStale}
                                ageMs={state.productionAgeMs}
                                mergedPreflight={state.mergedPreflight}
                            />
                            
                            {/* Narrative card */}
                            <NarrativeCard
                                narrative={state.narrative}
                                stale={state.narrativeStale}
                                ageMs={state.narrativeAgeMs}
                            />
                            
                            {/* Run History */}
                            <RunHistorySection
                                runs={historyRuns}
                                totalCount={historyTotalCount}
                                loading={historyLoading}
                                error={historyError}
                                lastFetchedAt={historyLastFetchedAt}
                                onRefresh={refreshHistory}
                            />
                        </>
                    )}
                    
                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
                        <button
                            onClick={refresh}
                            disabled={state.loading}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors disabled:opacity-50"
                        >
                            🔄 Refresh
                        </button>
                        <p className="text-[10px] text-gray-500">
                            Auto-refreshes every {Math.round(autoRefreshMs / 60000)}m
                            {runIsActive && ' • Run in progress'}
                        </p>
                    </div>
                    
                    {/* Run Launcher (Phase 2) */}
                    {showLauncher && (
                        <PipelineRunLauncher
                            onRunComplete={() => {
                                // Refresh summaries when a run completes
                                // (useRunController already does this, but this is a fallback)
                                setTimeout(() => refresh(), 2500);
                            }}
                            preflight={state.mergedPreflight ?? null}
                            onRequestSummaryRefresh={refresh}
                            defaultCollapsed={true}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default PipelineTelemetryPanel;
