/**
 * Narrative Dashboard
 * 
 * React component for managing and monitoring narrative pipeline runs.
 * Allows users to browse available scripts, start runs, and view QA summaries.
 * 
 * Part of F2 - Narrative UI Integration
 * 
 * @module components/NarrativeDashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { NarrativeScriptInfo } from '../services/narrativeScriptService';
import { listNarrativeScripts } from '../services/narrativeScriptService';
import type { 
    NarrativeRunHandle, 
    NarrativeRunProgress,
} from '../services/narrativeRunService';
import { 
    startNarrativeRun, 
    getNarrativeRunProgress, 
    getNarrativeRunSummary,
} from '../services/narrativeRunService';
import type { NarrativeRunSummary, QAVerdict, ShotQASummary, NarrativeShotArtifacts } from '../types/narrativeScript';
import ReplayViewerModal from './ReplayViewerModal';
import type { ReplayUiResult, ReplayStatus } from '../services/replayUiService';
import { replayFromManifestForUi } from '../services/replayUiService';

// ============================================================================
// Types
// ============================================================================

interface NarrativeDashboardProps {
    /** Whether the panel is collapsed by default */
    defaultCollapsed?: boolean;
}

type DashboardView = 'scripts' | 'running' | 'results';

/**
 * Per-shot run status during a narrative run
 */
type ShotRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

interface ShotRunState {
    status: ShotRunStatus;
    error?: string;
    /** Progress percentage for this specific shot (0-100) */
    progressPercent?: number;
}

/**
 * State for tracking replay per shot
 */
interface ShotReplayState {
    status: ReplayStatus;
    result?: ReplayUiResult;
    error?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Clickable file path link that copies path to clipboard
 * Note: In a real Electron app, this would call shell.showItemInFolder()
 * For web, we show a copyable path with tooltip
 */
const FileLink: React.FC<{
    path: string;
    label?: string;
    icon?: string;
}> = ({ path, label, icon = '📄' }) => {
    const [copied, setCopied] = useState(false);
    
    const fileName = path.split(/[/\\]/).pop() || path;
    const displayLabel = label || fileName;
    
    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(path);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.log('Path:', path);
        }
    };
    
    return (
        <button
            onClick={handleClick}
            className="group flex items-center gap-1 text-xs text-gray-400 hover:text-blue-400 transition-colors"
            title={copied ? 'Copied!' : `Click to copy path: ${path}`}
        >
            <span>{icon}</span>
            <span className="truncate max-w-[120px] group-hover:underline">
                {displayLabel}
            </span>
            {copied && (
                <span className="text-green-400 text-[10px]">✓</span>
            )}
        </button>
    );
};

/**
 * Staleness warning indicator
 * Shows a warning when results are older than a threshold
 */
const StalenessWarning: React.FC<{
    finishedAt?: string;
    thresholdHours?: number;
}> = ({ finishedAt, thresholdHours = 24 }) => {
    if (!finishedAt) return null;
    
    const finishedDate = new Date(finishedAt);
    const now = new Date();
    const ageMs = now.getTime() - finishedDate.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    
    if (ageHours < thresholdHours) return null;
    
    const ageDays = Math.floor(ageHours / 24);
    const ageText = ageDays > 0 
        ? `${ageDays} day${ageDays > 1 ? 's' : ''} ago`
        : `${Math.floor(ageHours)} hours ago`;
    
    return (
        <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded">
            <span>⚠️</span>
            <span>Results from {ageText} - consider re-running</span>
        </div>
    );
};

/**
 * Render a QA verdict badge
 */
const VerdictBadge: React.FC<{ verdict?: QAVerdict; size?: 'sm' | 'md' }> = ({ 
    verdict, 
    size = 'sm' 
}) => {
    if (!verdict) {
        return <span className="text-gray-500 text-xs">—</span>;
    }
    
    const baseStyles = 'inline-flex items-center gap-1 rounded-full font-semibold ring-1';
    const sizeStyles = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
    
    const colorStyles: Record<QAVerdict, string> = {
        'PASS': 'bg-green-800/70 text-green-300 ring-green-700/50',
        'WARN': 'bg-amber-800/70 text-amber-300 ring-amber-700/50',
        'FAIL': 'bg-red-800/70 text-red-300 ring-red-700/50',
    };
    
    const icons: Record<QAVerdict, string> = {
        'PASS': '✅',
        'WARN': '⚠️',
        'FAIL': '❌',
    };
    
    return (
        <span className={`${baseStyles} ${sizeStyles} ${colorStyles[verdict]}`}>
            {icons[verdict]} {verdict}
        </span>
    );
};

/**
 * Script card for the script list - G4 enhanced with metadata and file link
 */
const ScriptCard: React.FC<{
    script: NarrativeScriptInfo;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ script, isSelected, onSelect }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopyPath = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(script.path);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy path:', error);
        }
    };
    
    return (
        <div
            onClick={onSelect}
            className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                isSelected 
                    ? 'bg-blue-900/50 ring-1 ring-blue-500/50' 
                    : 'bg-gray-800/50 hover:bg-gray-700/50'
            }`}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-gray-200 truncate">
                            {script.title || script.id}
                        </h4>
                        {script.version && (
                            <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                                v{script.version}
                            </span>
                        )}
                    </div>
                    {script.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {script.description}
                        </p>
                    )}
                </div>
                <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                    {script.shotCount} shots
                </span>
            </div>
            
            {/* Metadata row */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/30">
                <div className="flex items-center gap-2 flex-wrap">
                    {script.tags && script.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                            {script.tags.slice(0, 3).map(tag => (
                                <span 
                                    key={tag} 
                                    className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    {script.author && (
                        <span className="text-[10px] text-gray-500">
                            by {script.author}
                        </span>
                    )}
                </div>
                
                {/* File path link */}
                <button
                    onClick={handleCopyPath}
                    className="text-[10px] text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1"
                    title={copied ? 'Copied!' : `Click to copy path: ${script.path}`}
                >
                    📄 {copied ? '✓ Copied' : 'Copy Path'}
                </button>
            </div>
        </div>
    );
};

/**
 * Progress bar with status
 */
const ProgressBar: React.FC<{
    progress: NarrativeRunProgress;
}> = ({ progress }) => {
    const statusColors: Record<string, string> = {
        'pending': 'bg-gray-500',
        'running': 'bg-blue-500',
        'succeeded': 'bg-green-500',
        'failed': 'bg-red-500',
    };
    
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs">
                <span className="text-gray-400">{progress.message}</span>
                <span className="text-gray-300 font-medium">{progress.progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                    className={`h-2 rounded-full transition-all duration-300 ${statusColors[progress.status]}`}
                    style={{ width: `${progress.progressPercent}%` }}
                />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
                <span>
                    {progress.completedShots}/{progress.totalShots} shots
                    {progress.failedShots > 0 && (
                        <span className="text-red-400 ml-2">
                            ({progress.failedShots} failed)
                        </span>
                    )}
                </span>
                {progress.currentShot && (
                    <span>Current: {progress.currentShot}</span>
                )}
            </div>
        </div>
    );
};

/**
 * Per-shot status row during run
 */
const ShotStatusRow: React.FC<{
    shotId: string;
    index: number;
    runState?: ShotRunState;
}> = ({ shotId, index, runState }) => {
    const status = runState?.status || 'queued';
    
    const statusConfig: Record<ShotRunStatus, { icon: string; text: string; color: string }> = {
        queued: { icon: '○', text: 'Queued', color: 'text-gray-500' },
        running: { icon: '⏳', text: 'Running...', color: 'text-blue-400' },
        succeeded: { icon: '✅', text: 'Succeeded', color: 'text-green-400' },
        failed: { icon: '❌', text: 'Failed', color: 'text-red-400' },
        skipped: { icon: '⏭', text: 'Skipped', color: 'text-gray-400' },
    };
    
    const config = statusConfig[status];
    
    return (
        <div className={`flex items-center justify-between py-1.5 px-3 ${
            status === 'running' ? 'bg-blue-900/20' : ''
        } ${status === 'failed' ? 'bg-red-900/10' : ''}`}>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-5">#{index + 1}</span>
                <span className={`text-sm ${status === 'running' ? 'text-blue-300' : 'text-gray-300'}`}>
                    {shotId}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {status === 'running' && runState?.progressPercent !== undefined && (
                    <span className="text-xs text-blue-400 font-mono">
                        {runState.progressPercent}%
                    </span>
                )}
                <span className={`text-xs flex items-center gap-1 ${config.color}`}>
                    <span className={status === 'running' ? 'animate-spin' : ''}>{config.icon}</span>
                    {config.text}
                </span>
            </div>
            {status === 'failed' && runState?.error && (
                <span className="text-xs text-red-400 ml-2 truncate max-w-[150px]" title={runState.error}>
                    {runState.error}
                </span>
            )}
        </div>
    );
};

/**
 * Shot status list during run
 */
const ShotStatusList: React.FC<{
    shotIds: string[];
    shotRunStates: Record<string, ShotRunState>;
}> = ({ shotIds, shotRunStates }) => {
    return (
        <div className="bg-gray-800/30 rounded-lg overflow-hidden">
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider p-3 border-b border-gray-700/50">
                Shot Progress
            </h4>
            <div className="max-h-60 overflow-y-auto">
                {shotIds.map((shotId, index) => (
                    <ShotStatusRow
                        key={shotId}
                        shotId={shotId}
                        index={index}
                        runState={shotRunStates[shotId]}
                    />
                ))}
            </div>
        </div>
    );
};

/**
 * Shot QA summary row with camera path adherence indicators
 */
const ShotQARow: React.FC<{
    shot: ShotQASummary;
    index: number;
    artifact?: NarrativeShotArtifacts;
    replayState?: ShotReplayState;
    onReplay?: () => void;
    onViewReplay?: () => void;
}> = ({ shot, index, artifact, replayState, onReplay, onViewReplay }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const hasManifest = !!artifact?.manifestPath;
    const hasVideo = !!artifact?.videoPath;
    const isReplaying = replayState?.status === 'running' || replayState?.status === 'pending';
    const hasReplayResult = replayState?.status === 'succeeded' && replayState?.result;
    
    // Camera path adherence summary
    const getPathAdherenceLabel = (error?: number): { label: string; color: string } => {
        if (error === undefined) return { label: 'N/A', color: 'text-gray-500' };
        if (error < 0.1) return { label: 'Excellent', color: 'text-green-400' };
        if (error < 0.2) return { label: 'Good', color: 'text-green-300' };
        if (error < 0.3) return { label: 'Minor drift', color: 'text-amber-400' };
        return { label: 'Major drift', color: 'text-red-400' };
    };
    
    const pathStatus = getPathAdherenceLabel(shot.metrics?.pathAdherenceMeanError);
    
    return (
        <div className="border-b border-gray-700/50 last:border-0">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between py-2 px-3 hover:bg-gray-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-6">#{index + 1}</span>
                    <span className="text-sm text-gray-300">{shot.shotId}</span>
                    {shot.pipelineConfigId && (
                        <span className="text-xs text-gray-500">
                            ({shot.pipelineConfigId})
                        </span>
                    )}
                    {/* Camera path adherence indicator */}
                    {shot.cameraPathId && shot.metrics?.pathAdherenceMeanError !== undefined && (
                        <span className={`text-xs px-1.5 py-0.5 rounded bg-gray-800 ${pathStatus.color}`} title="Camera path adherence">
                            🎯 {pathStatus.label}
                        </span>
                    )}
                    {/* Temporal regularization badge */}
                    {shot.temporalRegularizationApplied && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300" title="Temporal regularization applied">
                            🌊 Smoothed
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Replay status indicators */}
                    <span className="text-xs text-gray-500">
                        {hasVideo ? '✅' : '○'}
                    </span>
                    {hasReplayResult && (
                        <span className="text-xs text-green-400">🔄</span>
                    )}
                    <VerdictBadge verdict={shot.verdict} />
                    <span className="text-gray-500 text-xs">
                        {isExpanded ? '▾' : '▸'}
                    </span>
                </div>
            </button>
            
            {isExpanded && (
                <div className="px-3 pb-3 pt-1 bg-gray-800/20">
                    {/* Verdict reasons */}
                    {shot.verdictReasons && shot.verdictReasons.length > 0 && (
                        <div className="mb-2">
                            <p className="text-xs text-gray-500 mb-1">Reasons:</p>
                            <ul className="text-xs text-gray-400 list-disc list-inside">
                                {shot.verdictReasons.map((reason, i) => (
                                    <li key={i}>{reason}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    
                    {/* Metrics grid */}
                    {shot.metrics && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {shot.metrics.visionOverall !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Vision Overall:</span>
                                    <span className="text-gray-300 font-mono">
                                        {shot.metrics.visionOverall.toFixed(1)}
                                    </span>
                                </div>
                            )}
                            {shot.metrics.flickerFrameCount !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Flicker Frames:</span>
                                    <span className={`font-mono ${shot.metrics.flickerFrameCount > 10 ? 'text-red-400' : shot.metrics.flickerFrameCount > 5 ? 'text-amber-400' : 'text-green-400'}`}>
                                        {shot.metrics.flickerFrameCount}
                                    </span>
                                </div>
                            )}
                            {shot.metrics.jitterScore !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Jitter Score:</span>
                                    <span className={`font-mono ${shot.metrics.jitterScore > 30 ? 'text-red-400' : shot.metrics.jitterScore > 15 ? 'text-amber-400' : 'text-green-400'}`}>
                                        {shot.metrics.jitterScore.toFixed(1)}
                                    </span>
                                </div>
                            )}
                            {shot.metrics.identityScore !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Identity Score:</span>
                                    <span className={`font-mono ${shot.metrics.identityScore < 60 ? 'text-red-400' : shot.metrics.identityScore < 80 ? 'text-amber-400' : 'text-green-400'}`}>
                                        {shot.metrics.identityScore.toFixed(1)}%
                                    </span>
                                </div>
                            )}
                            {/* Camera path metrics */}
                            {shot.metrics.pathAdherenceMeanError !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500 cursor-help group relative">
                                        Path Adherence:
                                        <span className="ml-1 text-gray-600 group-hover:text-blue-400">ⓘ</span>
                                        <div className="absolute left-0 bottom-full mb-1 w-48 p-2 bg-gray-900 border border-gray-600 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                            Mean error from expected camera path. Lower is better.
                                        </div>
                                    </span>
                                    <span className={`font-mono ${pathStatus.color}`}>
                                        {shot.metrics.pathAdherenceMeanError.toFixed(3)}
                                    </span>
                                </div>
                            )}
                            {shot.metrics.pathDirectionConsistency !== undefined && (
                                <div className="flex justify-between">
                                    <span className="text-gray-500 cursor-help group relative">
                                        Direction Match:
                                        <span className="ml-1 text-gray-600 group-hover:text-blue-400">ⓘ</span>
                                        <div className="absolute left-0 bottom-full mb-1 w-48 p-2 bg-gray-900 border border-gray-600 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                            How well motion direction matches expected path (0-1). Higher is better.
                                        </div>
                                    </span>
                                    <span className={`font-mono ${shot.metrics.pathDirectionConsistency > 0.7 ? 'text-green-400' : shot.metrics.pathDirectionConsistency > 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                                        {(shot.metrics.pathDirectionConsistency * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Camera path info */}
                    {shot.cameraPathId && (
                        <div className="mt-2 text-xs text-gray-500">
                            Camera Path: {shot.cameraPathId}
                        </div>
                    )}
                    
                    {/* Temporal regularization */}
                    {shot.temporalRegularizationApplied !== undefined && (
                        <div className="mt-1 text-xs text-gray-500">
                            Temporal Regularization: {shot.temporalRegularizationApplied ? '✓ Applied' : '○ Not applied'}
                        </div>
                    )}
                    
                    {/* Deep links section */}
                    {artifact && (artifact.videoPath || artifact.manifestPath || artifact.benchmarkPath || artifact.visionQaPath) && (
                        <div className="mt-3 pt-3 border-t border-gray-700/50">
                            <p className="text-xs text-gray-500 mb-2">📎 Quick Links:</p>
                            <div className="flex flex-wrap gap-2">
                                {artifact.videoPath && (
                                    <FileLink path={artifact.videoPath} icon="📹" label="Video" />
                                )}
                                {artifact.manifestPath && (
                                    <FileLink path={artifact.manifestPath} icon="📋" label="Manifest" />
                                )}
                                {artifact.benchmarkPath && (
                                    <FileLink path={artifact.benchmarkPath} icon="📊" label="Benchmark" />
                                )}
                                {artifact.visionQaPath && (
                                    <FileLink path={artifact.visionQaPath} icon="👁" label="Vision QA" />
                                )}
                                {artifact.runDir && (
                                    <FileLink path={artifact.runDir} icon="📁" label="Folder" />
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Replay controls */}
                    <div className="mt-3 pt-3 border-t border-gray-700/50">
                        {/* Replay error */}
                        {replayState?.status === 'failed' && replayState.error && (
                            <p className="text-xs text-red-400 mb-2">{replayState.error}</p>
                        )}
                        
                        {/* Status indicators */}
                        <div className="flex items-center gap-3 text-xs mb-2">
                            <span className="text-gray-500">
                                {hasVideo ? '✅ Original' : '○ Original'}
                            </span>
                            {hasReplayResult && (
                                <span className="text-green-400">✅ Replayed</span>
                            )}
                        </div>
                        
                        {/* Replay buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); onReplay?.(); }}
                                disabled={!hasManifest || isReplaying}
                                className={`flex-1 text-xs py-1.5 px-2 rounded font-medium transition-colors ${
                                    !hasManifest
                                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        : isReplaying
                                            ? 'bg-blue-900/50 text-blue-400 cursor-wait'
                                            : 'bg-blue-600/80 text-white hover:bg-blue-500'
                                }`}
                                title={!hasManifest ? 'No manifest available' : 'Replay this shot'}
                            >
                                {isReplaying ? '⏳ Replaying...' : '🔄 Replay'}
                            </button>
                            
                            {(hasVideo || hasReplayResult) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onViewReplay?.(); }}
                                    className="text-xs py-1.5 px-2 rounded font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                                    title="View videos"
                                >
                                    👁 View
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * QA Summary panel
 */
const QASummaryPanel: React.FC<{
    summary: NarrativeRunSummary;
    shotReplayStates: Record<string, ShotReplayState>;
    onReplayShot: (shotId: string) => void;
    onViewShotReplay: (shotId: string) => void;
}> = ({ summary, shotReplayStates, onReplayShot, onViewShotReplay }) => {
    const qaSummary = summary.qaSummary;
    
    // Create a map of shot artifacts by shotId for quick lookup
    const artifactMap = new Map<string, NarrativeShotArtifacts>();
    summary.shotArtifacts?.forEach(artifact => {
        artifactMap.set(artifact.shotId, artifact);
    });
    
    if (!qaSummary) {
        return (
            <div className="bg-gray-800/30 rounded-lg p-4">
                <p className="text-sm text-gray-500">No QA data available</p>
            </div>
        );
    }
    
    // Count verdicts
    const passCount = qaSummary.shots.filter(s => s.verdict === 'PASS').length;
    const warnCount = qaSummary.shots.filter(s => s.verdict === 'WARN').length;
    const failCount = qaSummary.shots.filter(s => s.verdict === 'FAIL').length;
    
    return (
        <div className="space-y-4">
            {/* Overall verdict */}
            <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-200">Overall QA Verdict</h4>
                    <VerdictBadge verdict={qaSummary.overallVerdict} size="md" />
                </div>
                
                {qaSummary.overallReasons && qaSummary.overallReasons.length > 0 && (
                    <ul className="text-xs text-gray-400 list-disc list-inside mb-3">
                        {qaSummary.overallReasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                        ))}
                    </ul>
                )}
                
                {/* Verdict distribution */}
                <div className="flex gap-4 text-xs">
                    <span className="text-green-400">✅ {passCount} PASS</span>
                    <span className="text-amber-400">⚠️ {warnCount} WARN</span>
                    <span className="text-red-400">❌ {failCount} FAIL</span>
                </div>
            </div>
            
            {/* Per-shot verdicts */}
            <div className="bg-gray-800/30 rounded-lg overflow-hidden">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider p-3 border-b border-gray-700/50">
                    Per-Shot QA Results
                </h4>
                <div className="max-h-80 overflow-y-auto">
                    {qaSummary.shots.map((shot, index) => (
                        <ShotQARow 
                            key={shot.shotId} 
                            shot={shot} 
                            index={index}
                            artifact={artifactMap.get(shot.shotId)}
                            replayState={shotReplayStates[shot.shotId]}
                            onReplay={() => onReplayShot(shot.shotId)}
                            onViewReplay={() => onViewShotReplay(shot.shotId)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const NarrativeDashboard: React.FC<NarrativeDashboardProps> = ({
    defaultCollapsed = true,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [view, setView] = useState<DashboardView>('scripts');
    const [scripts, setScripts] = useState<NarrativeScriptInfo[]>([]);
    const [selectedScript, setSelectedScript] = useState<NarrativeScriptInfo | null>(null);
    const [isLoadingScripts, setIsLoadingScripts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Run state
    const [currentRun, setCurrentRun] = useState<NarrativeRunHandle | null>(null);
    const [runProgress, setRunProgress] = useState<NarrativeRunProgress | null>(null);
    const [runSummary, setRunSummary] = useState<NarrativeRunSummary | null>(null);
    
    // Per-shot run states (for showing individual status during run)
    const [shotRunStates, setShotRunStates] = useState<Record<string, ShotRunState>>({});
    
    // Replay state per shot
    const [shotReplayStates, setShotReplayStates] = useState<Record<string, ShotReplayState>>({});
    
    // Replay viewer modal state
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [viewerShotId, setViewerShotId] = useState<string | null>(null);
    
    /**
     * Load available scripts on mount
     */
    useEffect(() => {
        if (!isCollapsed && scripts.length === 0) {
            loadScripts();
        }
    }, [isCollapsed, scripts.length]);
    
    /**
     * Poll for run progress while running
     */
    useEffect(() => {
        if (!currentRun || !runProgress || runProgress.status !== 'running') {
            return;
        }
        
        const interval = setInterval(async () => {
            const progress = getNarrativeRunProgress(currentRun.runId);
            if (progress) {
                setRunProgress(progress);
                
                // Update per-shot states based on progress
                if (selectedScript) {
                    const shotIds = selectedScript.shotIds || 
                        Array.from({ length: selectedScript.shotCount }, (_, i) => `shot-${i + 1}`);
                    
                    const newShotStates: Record<string, ShotRunState> = {};
                    
                    shotIds.forEach((shotId, index) => {
                        if (index < progress.completedShots) {
                            // Check if this shot failed
                            const isInFailedRange = index >= (progress.completedShots - progress.failedShots);
                            newShotStates[shotId] = {
                                status: isInFailedRange ? 'failed' : 'succeeded',
                            };
                        } else if (shotId === progress.currentShot) {
                            newShotStates[shotId] = {
                                status: 'running',
                                progressPercent: progress.currentShotProgress,
                            };
                        } else {
                            newShotStates[shotId] = { status: 'queued' };
                        }
                    });
                    
                    setShotRunStates(newShotStates);
                }
                
                if (progress.status === 'succeeded' || progress.status === 'failed') {
                    // Fetch summary when complete
                    const summary = await getNarrativeRunSummary(currentRun.runId);
                    setRunSummary(summary);
                    setView('results');
                }
            }
        }, 500);
        
        return () => clearInterval(interval);
    }, [currentRun, runProgress, selectedScript]);
    
    /**
     * Load available scripts
     */
    const loadScripts = useCallback(async () => {
        setIsLoadingScripts(true);
        setError(null);
        
        try {
            const loadedScripts = await listNarrativeScripts();
            setScripts(loadedScripts);
            
            if (loadedScripts.length > 0 && !selectedScript) {
                setSelectedScript(loadedScripts[0]!);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load scripts');
        } finally {
            setIsLoadingScripts(false);
        }
    }, [selectedScript]);
    
    /**
     * Start a narrative run
     */
    const handleStartRun = useCallback(async () => {
        if (!selectedScript) return;
        
        setError(null);
        setRunSummary(null);
        setShotReplayStates({});
        
        // Initialize per-shot states as queued
        const shotIds = selectedScript.shotIds || 
            Array.from({ length: selectedScript.shotCount }, (_, i) => `shot-${i + 1}`);
        const initialShotStates: Record<string, ShotRunState> = {};
        shotIds.forEach(shotId => {
            initialShotStates[shotId] = { status: 'queued' };
        });
        setShotRunStates(initialShotStates);
        
        try {
            const handle = await startNarrativeRun({
                scriptPath: selectedScript.path,
            });
            
            setCurrentRun(handle);
            setRunProgress({
                runId: handle.runId,
                status: 'pending',
                totalShots: selectedScript.shotCount,
                completedShots: 0,
                failedShots: 0,
                progressPercent: 0,
                message: 'Starting...',
            });
            setView('running');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start run');
        }
    }, [selectedScript]);
    
    /**
     * Reset to script selection
     */
    const handleBackToScripts = useCallback(() => {
        setView('scripts');
        setCurrentRun(null);
        setRunProgress(null);
        setRunSummary(null);
        setShotRunStates({});
        setShotReplayStates({});
    }, []);
    
    /**
     * Handle replay for a specific shot
     */
    const handleReplayShot = useCallback(async (shotId: string) => {
        if (!runSummary) return;
        
        // Find the artifact for this shot
        const artifact = runSummary.shotArtifacts?.find(a => a.shotId === shotId);
        if (!artifact?.manifestPath) {
            setShotReplayStates(prev => ({
                ...prev,
                [shotId]: { status: 'failed', error: 'No manifest available for replay' }
            }));
            return;
        }
        
        setShotReplayStates(prev => ({
            ...prev,
            [shotId]: { status: 'running' }
        }));
        
        try {
            const replayResult = await replayFromManifestForUi({
                manifestPath: artifact.manifestPath,
            });
            
            if (replayResult.success) {
                setShotReplayStates(prev => ({
                    ...prev,
                    [shotId]: { status: 'succeeded', result: replayResult }
                }));
            } else {
                setShotReplayStates(prev => ({
                    ...prev,
                    [shotId]: { 
                        status: 'failed', 
                        error: replayResult.errorMessage || 'Replay failed',
                        result: replayResult,
                    }
                }));
            }
        } catch (err) {
            setShotReplayStates(prev => ({
                ...prev,
                [shotId]: {
                    status: 'failed',
                    error: err instanceof Error ? err.message : 'Unexpected replay error',
                }
            }));
        }
    }, [runSummary]);
    
    /**
     * Open replay viewer for a specific shot
     */
    const handleViewShotReplay = useCallback((shotId: string) => {
        setViewerShotId(shotId);
        setIsViewerOpen(true);
    }, []);
    
    /**
     * Get video paths for the viewer
     */
    const getViewerPaths = useCallback(() => {
        if (!runSummary || !viewerShotId) {
            return { original: undefined, replayed: undefined, manifest: '' };
        }
        
        const artifact = runSummary.shotArtifacts?.find(a => a.shotId === viewerShotId);
        const replayState = shotReplayStates[viewerShotId];
        
        return {
            original: artifact?.videoPath,
            replayed: replayState?.result?.replayedVideoPath,
            manifest: artifact?.manifestPath || '',
        };
    }, [runSummary, viewerShotId, shotReplayStates]);
    
    return (
        <div className="bg-gray-900/50 rounded-lg ring-1 ring-gray-700/80 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">🎬</span>
                    <div className="text-left">
                        <h3 className="text-sm font-semibold text-gray-200">Narrative Pipeline</h3>
                        <p className="text-xs text-gray-400">Run multi-shot narratives and view QA summaries</p>
                    </div>
                </div>
                <span className="text-gray-400 text-lg">
                    {isCollapsed ? '▸' : '▾'}
                </span>
            </button>
            
            {/* Collapsible Content */}
            {!isCollapsed && (
                <div className="border-t border-gray-700/50 p-4 space-y-4">
                    {/* View tabs (when not in scripts view) */}
                    {view !== 'scripts' && (
                        <div className="flex items-center gap-2 mb-4">
                            <button
                                onClick={handleBackToScripts}
                                className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                            >
                                ← Back to Scripts
                            </button>
                            <span className="text-gray-600">|</span>
                            <span className="text-xs text-gray-500">
                                {view === 'running' ? 'Running' : 'Results'}: {selectedScript?.title || selectedScript?.id}
                            </span>
                        </div>
                    )}
                    
                    {/* Error display */}
                    {error && (
                        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}
                    
                    {/* Scripts View */}
                    {view === 'scripts' && (
                        <div className="space-y-4">
                            {/* Script list */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        Available Scripts
                                    </h4>
                                    <button
                                        onClick={loadScripts}
                                        disabled={isLoadingScripts}
                                        className="text-xs text-gray-400 hover:text-gray-200"
                                    >
                                        {isLoadingScripts ? '...' : '↻ Refresh'}
                                    </button>
                                </div>
                                
                                {isLoadingScripts ? (
                                    <div className="text-center py-4">
                                        <span className="text-gray-500 animate-pulse">Loading scripts...</span>
                                    </div>
                                ) : scripts.length === 0 ? (
                                    <div className="text-center py-4">
                                        <span className="text-gray-500">No narrative scripts found</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {scripts.map(script => (
                                            <ScriptCard
                                                key={script.id}
                                                script={script}
                                                isSelected={selectedScript?.id === script.id}
                                                onSelect={() => setSelectedScript(script)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            {/* Run button */}
                            {selectedScript && (
                                <button
                                    onClick={handleStartRun}
                                    className="w-full py-2 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                                >
                                    Run Narrative: {selectedScript.title || selectedScript.id}
                                </button>
                            )}
                        </div>
                    )}
                    
                    {/* Running View */}
                    {view === 'running' && runProgress && (
                        <div className="space-y-4">
                            <div className="bg-gray-800/50 rounded-lg p-4">
                                <h4 className="text-sm font-medium text-gray-200 mb-3">
                                    {selectedScript?.title || 'Narrative Run'}
                                </h4>
                                <ProgressBar progress={runProgress} />
                            </div>
                            
                            {/* Per-shot status list */}
                            {selectedScript && (
                                <ShotStatusList 
                                    shotIds={selectedScript.shotIds || 
                                        Array.from({ length: selectedScript.shotCount }, (_, i) => `shot-${i + 1}`)}
                                    shotRunStates={shotRunStates}
                                />
                            )}
                            
                            {runProgress.status === 'running' && (
                                <p className="text-xs text-gray-500 text-center animate-pulse">
                                    Processing... This may take a few minutes.
                                </p>
                            )}
                        </div>
                    )}
                    
                    {/* Results View */}
                    {view === 'results' && (
                        <div className="space-y-4">
                            {/* Run summary header */}
                            {runSummary && (
                                <>
                                    <div className="bg-gray-800/50 rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-medium text-gray-200">
                                                {runSummary.title || runSummary.narrativeId}
                                            </h4>
                                            <span className={`text-xs font-medium ${
                                                runSummary.status === 'succeeded' ? 'text-green-400' : 'text-red-400'
                                            }`}>
                                                {runSummary.status.toUpperCase()}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-4 text-xs text-gray-400">
                                            <div>
                                                <span className="block text-gray-500">Shots</span>
                                                <span className="text-gray-300 font-medium">
                                                    {runSummary.successfulShots}/{runSummary.shotCount}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-gray-500">Duration</span>
                                                <span className="text-gray-300 font-medium">
                                                    {(runSummary.totalDurationMs / 1000).toFixed(1)}s
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-gray-500">Finished</span>
                                                <span className="text-gray-300 font-medium">
                                                    {new Date(runSummary.finishedAt).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Staleness Warning */}
                                        <div className="mt-3">
                                            <StalenessWarning finishedAt={runSummary.finishedAt} thresholdHours={24} />
                                        </div>
                                    </div>
                                    
                                    {/* QA Summary */}
                                    <QASummaryPanel 
                                        summary={runSummary} 
                                        shotReplayStates={shotReplayStates}
                                        onReplayShot={handleReplayShot}
                                        onViewShotReplay={handleViewShotReplay}
                                    />
                                </>
                            )}
                            
                            {/* Final video link */}
                            {runSummary?.finalVideoPath && (
                                <div className="bg-gray-800/30 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 mb-1">Final Video:</p>
                                    <p className="text-xs text-gray-300 font-mono truncate">
                                        📹 {runSummary.finalVideoPath.split(/[/\\]/).pop()}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            {/* Replay Viewer Modal */}
            <ReplayViewerModal
                isOpen={isViewerOpen}
                onClose={() => setIsViewerOpen(false)}
                originalVideoPath={getViewerPaths().original}
                replayedVideoPath={getViewerPaths().replayed}
                manifestPath={getViewerPaths().manifest}
                title="Shot Replay Viewer"
                shotId={viewerShotId || undefined}
            />
        </div>
    );
};

export default NarrativeDashboard;
