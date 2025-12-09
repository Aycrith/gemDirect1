/**
 * A/B Comparison Dashboard
 * 
 * React component for running A/B comparisons between pipeline configurations.
 * Allows users to select two presets/pipelines and compare their QA metrics
 * side-by-side.
 * 
 * Part of F1 - In-App A/B QA Dashboard
 * 
 * @module components/AbCompareDashboard
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { 
    CompareTarget, 
    ComparePreset, 
    AbCompareResult,
    CompareMetrics,
    CompareRunSummary,
} from '../types/abCompare';
import { AB_COMPARE_PRESETS } from '../types/abCompare';
import type { QAVerdict } from '../types/narrativeScript';
import ReplayViewerModal from './ReplayViewerModal';
import type { ReplayUiResult, ReplayStatus } from '../services/replayUiService';
import { replayFromManifestForUi } from '../services/replayUiService';
import { findFirstExistingFile } from '../services/staticDataService';

// ============================================================================
// Types
// ============================================================================

interface AbCompareDashboardProps {
    /** Whether the panel is collapsed by default */
    defaultCollapsed?: boolean;
    /** Callback when a comparison completes */
    onComparisonComplete?: (result: AbCompareResult) => void;
}

type CompareStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * Per-target run status for showing individual spinners/errors
 */
type TargetRunStatus = 'idle' | 'pending' | 'running' | 'succeeded' | 'failed';

interface TargetRunState {
    status: TargetRunStatus;
    error?: string;
}

/**
 * State for tracking replay per target
 */
interface TargetReplayState {
    status: ReplayStatus;
    result?: ReplayUiResult;
    error?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Clickable file path link that opens in file explorer
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
    
    const handleClick = async () => {
        try {
            await navigator.clipboard.writeText(path);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for browsers without clipboard API
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
            <span className="truncate max-w-[150px] group-hover:underline">
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
 * Render a QA verdict badge with appropriate styling
 */
const VerdictBadge: React.FC<{ verdict?: QAVerdict }> = ({ verdict }) => {
    if (!verdict) {
        return <span className="text-gray-500 text-sm">—</span>;
    }
    
    const styles: Record<QAVerdict, string> = {
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
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${styles[verdict]}`}>
            {icons[verdict]} {verdict}
        </span>
    );
};

/**
 * Render a metric value with formatting
 */
const MetricValue: React.FC<{ 
    value?: number; 
    suffix?: string; 
    higherIsBetter?: boolean;
    threshold?: number;
    warnThreshold?: number;
}> = ({ value, suffix = '', higherIsBetter = true, threshold, warnThreshold }) => {
    if (value === undefined) {
        return <span className="text-gray-500 font-mono">—</span>;
    }
    
    let colorClass = 'text-gray-300';
    if (threshold !== undefined) {
        if (higherIsBetter) {
            if (value < threshold) colorClass = 'text-red-400';
            else if (warnThreshold !== undefined && value < warnThreshold) colorClass = 'text-amber-400';
            else colorClass = 'text-green-400';
        } else {
            if (value > threshold) colorClass = 'text-red-400';
            else if (warnThreshold !== undefined && value > warnThreshold) colorClass = 'text-amber-400';
            else colorClass = 'text-green-400';
        }
    }
    
    const displayValue = typeof value === 'number' && !Number.isInteger(value) 
        ? value.toFixed(2) 
        : value;
    
    return (
        <span className={`font-mono ${colorClass}`}>
            {displayValue}{suffix}
        </span>
    );
};

/**
 * Metric tooltip content for camera and temporal metrics
 */
const METRIC_TOOLTIPS: Record<string, { description: string; interpretation: string }> = {
    'Path Adherence Error': {
        description: 'Mean Euclidean distance between observed camera positions and expected path keyframes.',
        interpretation: 'Lower is better. < 0.1 = Excellent, < 0.2 = Good, > 0.3 = Significant drift',
    },
    'Direction Consistency': {
        description: 'How well the camera motion direction matches the expected path direction (0-1).',
        interpretation: 'Higher is better. > 0.8 = Excellent, > 0.5 = Good, < 0.3 = Poor match',
    },
    'Flicker Frames': {
        description: 'Number of frames with anomalous brightness changes indicating temporal instability.',
        interpretation: 'Lower is better. 0-3 = Excellent, 4-10 = Acceptable, > 15 = Noticeable flicker',
    },
    'Jitter Score': {
        description: 'Motion jitter/shakiness score based on frame-to-frame position variance.',
        interpretation: 'Lower is better. < 10 = Smooth, 10-25 = Mild jitter, > 40 = Significant jitter',
    },
    'Identity Score': {
        description: 'How well subject identity is preserved across frames (0-100).',
        interpretation: 'Higher is better. > 85 = Excellent, > 70 = Good, < 50 = Poor consistency',
    },
};

/**
 * Metric label with tooltip
 */
const MetricLabel: React.FC<{ label: string }> = ({ label }) => {
    const tooltip = METRIC_TOOLTIPS[label];
    
    if (!tooltip) {
        return <span className="text-gray-400">{label}</span>;
    }
    
    return (
        <span className="text-gray-400 cursor-help group relative">
            {label}
            <span className="ml-1 text-gray-500 group-hover:text-blue-400">ⓘ</span>
            <div className="absolute left-0 bottom-full mb-2 w-64 p-3 bg-gray-900 border border-gray-600 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                <p className="text-xs text-gray-300 mb-2">{tooltip.description}</p>
                <p className="text-xs text-gray-400 italic">{tooltip.interpretation}</p>
            </div>
        </span>
    );
};

/**
 * Preset selector dropdown
 */
const PresetSelector: React.FC<{
    selectedId: string;
    onChange: (preset: ComparePreset) => void;
    label: string;
}> = ({ selectedId, onChange, label }) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = AB_COMPARE_PRESETS.find(p => p.id === e.target.value);
        if (preset) {
            onChange(preset);
        }
    };
    
    const selectedPreset = AB_COMPARE_PRESETS.find(p => p.id === selectedId);
    
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            <select
                value={selectedId}
                onChange={handleChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
                {AB_COMPARE_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                        {preset.label}
                    </option>
                ))}
            </select>
            {selectedPreset && (
                <p className="text-xs text-gray-400">{selectedPreset.description}</p>
            )}
        </div>
    );
};

/**
 * Metrics comparison table row with tooltip support
 */
const MetricRow: React.FC<{
    label: string;
    valueA?: number;
    valueB?: number;
    suffix?: string;
    higherIsBetter?: boolean;
    threshold?: number;
    warnThreshold?: number;
}> = ({ label, valueA, valueB, suffix, higherIsBetter, threshold, warnThreshold }) => {
    // Calculate which is better for comparison indicator
    let comparison = '';
    if (valueA !== undefined && valueB !== undefined) {
        const diff = valueA - valueB;
        if (Math.abs(diff) < 0.01) {
            comparison = '=';
        } else if ((higherIsBetter && diff > 0) || (!higherIsBetter && diff < 0)) {
            comparison = 'A';
        } else {
            comparison = 'B';
        }
    }
    
    return (
        <tr className="border-b border-gray-700/50">
            <td className="py-2 text-sm">
                <MetricLabel label={label} />
            </td>
            <td className="py-2 text-center">
                <MetricValue 
                    value={valueA} 
                    suffix={suffix} 
                    higherIsBetter={higherIsBetter}
                    threshold={threshold}
                    warnThreshold={warnThreshold}
                />
            </td>
            <td className="py-2 text-center">
                <MetricValue 
                    value={valueB} 
                    suffix={suffix} 
                    higherIsBetter={higherIsBetter}
                    threshold={threshold}
                    warnThreshold={warnThreshold}
                />
            </td>
            <td className="py-2 text-center text-xs">
                {comparison === '=' && <span className="text-gray-500">≈</span>}
                {comparison === 'A' && <span className="text-green-400 font-bold">A ✓</span>}
                {comparison === 'B' && <span className="text-green-400 font-bold">B ✓</span>}
            </td>
        </tr>
    );
};

/**
 * Results panel for a single comparison target
 */
const ResultPanel: React.FC<{
    label: string;
    targetId: 'A' | 'B';
    summary?: CompareRunSummary;
    runState?: TargetRunState;
    replayState?: TargetReplayState;
    onReplay?: () => void;
    onViewReplay?: () => void;
}> = ({ label, targetId, summary, runState, replayState, onReplay, onViewReplay }) => {
    const isRunning = runState?.status === 'running';
    const isPending = runState?.status === 'pending';
    const hasFailed = runState?.status === 'failed';
    
    // Show loading placeholder during run
    if (isPending || isRunning) {
        return (
            <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-300">Target {targetId}: {label}</h4>
                    <span className={`text-xs font-medium flex items-center gap-1 ${isPending ? 'text-gray-400' : 'text-blue-400'}`}>
                        {isRunning && <span className="animate-spin">⏳</span>}
                        {isRunning ? 'RUNNING...' : 'PENDING'}
                    </span>
                </div>
                <div className="flex items-center justify-center py-6">
                    {isRunning ? (
                        <div className="text-center">
                            <div className="animate-pulse text-4xl mb-2">🎬</div>
                            <p className="text-sm text-blue-300">Generating video...</p>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">Waiting to start...</p>
                    )}
                </div>
            </div>
        );
    }
    
    // Show error state
    if (hasFailed && !summary) {
        return (
            <div className="bg-gray-800/50 rounded-lg p-4 ring-1 ring-red-700/50">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-300">Target {targetId}: {label}</h4>
                    <span className="text-xs font-medium text-red-400 flex items-center gap-1">
                        ❌ FAILED
                    </span>
                </div>
                {runState.error && (
                    <p className="text-xs text-red-400">{runState.error}</p>
                )}
            </div>
        );
    }
    
    if (!summary) {
        return (
            <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Target {targetId}: {label}</h4>
                <p className="text-sm text-gray-500">No results yet</p>
            </div>
        );
    }
    
    const statusColors: Record<string, string> = {
        'pending': 'text-gray-400',
        'running': 'text-blue-400',
        'succeeded': 'text-green-400',
        'failed': 'text-red-400',
    };
    
    const hasManifest = !!summary.manifestPath;
    const isReplaying = replayState?.status === 'running' || replayState?.status === 'pending';
    const hasReplayResult = replayState?.status === 'succeeded' && replayState?.result;
    
    return (
        <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-300">Target {targetId}: {label}</h4>
                <span className={`text-xs font-medium ${statusColors[summary.status] || 'text-gray-400'}`}>
                    {summary.status.toUpperCase()}
                </span>
            </div>
            
            {summary.status === 'failed' && summary.errorMessage && (
                <p className="text-xs text-red-400 mb-2">{summary.errorMessage}</p>
            )}
            
            {summary.metrics && (
                <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Vision QA:</span>
                        <VerdictBadge verdict={summary.metrics.visionVerdict} />
                    </div>
                    {summary.metrics.visionOverall !== undefined && (
                        <div className="flex justify-between">
                            <span className="text-gray-400">Overall Score:</span>
                            <MetricValue value={summary.metrics.visionOverall} threshold={80} />
                        </div>
                    )}
                    {summary.metrics.flickerMetric !== undefined && (
                        <div className="flex justify-between">
                            <span className="text-gray-400">Flicker Frames:</span>
                            <MetricValue value={summary.metrics.flickerMetric} higherIsBetter={false} threshold={15} warnThreshold={5} />
                        </div>
                    )}
                </div>
            )}
            
            {/* Video path */}
            {summary.videoPath && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                    <FileLink path={summary.videoPath} icon="📹" label={summary.videoPath.split(/[/\\]/).pop()} />
                </div>
            )}
            
            {/* Deep links section */}
            {(summary.manifestPath || summary.benchmarkPath || summary.visionQaPath || summary.runDir) && (
                <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                    <p className="text-xs text-gray-500 mb-2">📎 Quick Links:</p>
                    <div className="flex flex-wrap gap-2">
                        {summary.manifestPath && (
                            <FileLink path={summary.manifestPath} icon="📋" label="Manifest" />
                        )}
                        {summary.benchmarkPath && (
                            <FileLink path={summary.benchmarkPath} icon="📊" label="Benchmark" />
                        )}
                        {summary.visionQaPath && (
                            <FileLink path={summary.visionQaPath} icon="👁" label="Vision QA" />
                        )}
                        {summary.runDir && (
                            <FileLink path={summary.runDir} icon="📁" label="Output Folder" />
                        )}
                    </div>
                </div>
            )}
            
            {/* Replay controls */}
            <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                {/* Replay status indicators */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">
                        {summary.videoPath ? '✅ Original' : '○ Original'}
                    </span>
                    {hasReplayResult && (
                        <span className="text-green-400">✅ Replayed</span>
                    )}
                </div>
                
                {/* Replay error */}
                {replayState?.status === 'failed' && replayState.error && (
                    <p className="text-xs text-red-400">{replayState.error}</p>
                )}
                
                {/* Replay buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={onReplay}
                        disabled={!hasManifest || isReplaying}
                        className={`flex-1 text-xs py-1.5 px-2 rounded font-medium transition-colors ${
                            !hasManifest
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : isReplaying
                                    ? 'bg-blue-900/50 text-blue-400 cursor-wait'
                                    : 'bg-blue-600/80 text-white hover:bg-blue-500'
                        }`}
                        title={!hasManifest ? 'No manifest available' : 'Replay this run'}
                    >
                        {isReplaying ? '⏳ Replaying...' : '🔄 Replay'}
                    </button>
                    
                    {(summary.videoPath || hasReplayResult) && (
                        <button
                            onClick={onViewReplay}
                            className="text-xs py-1.5 px-2 rounded font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                            title="View videos"
                        >
                            👁 View
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const AbCompareDashboard: React.FC<AbCompareDashboardProps> = ({
    defaultCollapsed = true,
    onComparisonComplete,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [status, setStatus] = useState<CompareStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [result, setResult] = useState<AbCompareResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    // Selected presets
    const [presetA, setPresetA] = useState<ComparePreset>(
        AB_COMPARE_PRESETS.find(p => p.id === 'production-qa') || AB_COMPARE_PRESETS[0]!
    );
    const [presetB, setPresetB] = useState<ComparePreset>(
        AB_COMPARE_PRESETS.find(p => p.id === 'cinematic') || AB_COMPARE_PRESETS[1]!
    );
    
    // Sample selection
    const [sampleId, setSampleId] = useState('sample-001-geometric');
    
    // Per-target run states (for showing individual spinners/errors)
    const [runStateA, setRunStateA] = useState<TargetRunState>({ status: 'idle' });
    const [runStateB, setRunStateB] = useState<TargetRunState>({ status: 'idle' });
    
    // Replay state per target
    const [replayStateA, setReplayStateA] = useState<TargetReplayState>({ status: 'idle' });
    const [replayStateB, setReplayStateB] = useState<TargetReplayState>({ status: 'idle' });
    
    // Replay viewer modal state
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [viewerTarget, setViewerTarget] = useState<'A' | 'B'>('A');
    
    // Multi-scenario A/B modal state
    const [showMultiScenarioModal, setShowMultiScenarioModal] = useState(false);
    const [latestAbReportPath, setLatestAbReportPath] = useState<string | null>(null);
    const [latestReportState, setLatestReportState] = useState<'idle' | 'loading' | 'not-found'>('idle');
    
    // Locate the latest multi-scenario A/B report written by the CLI
    useEffect(() => {
        let cancelled = false;
        const candidates = [
            'reports/ab-experiments-latest.md',
            'reports/ab-experiments-latest.json',
        ];
        
        const findLatest = async (): Promise<void> => {
            setLatestReportState('loading');
            const foundPath = await findFirstExistingFile(candidates);
            if (!cancelled) {
                if (foundPath) {
                    setLatestAbReportPath(foundPath);
                    setLatestReportState('idle');
                } else {
                    setLatestReportState('not-found');
                }
            }
        };
        
        void findLatest();
        return () => {
            cancelled = true;
        };
    }, []);
    
    /**
     * Handle replay for a target
     */
    const handleReplay = useCallback(async (target: 'A' | 'B') => {
        if (!result) return;
        
        const summary = target === 'A' ? result.runA : result.runB;
        const setReplayState = target === 'A' ? setReplayStateA : setReplayStateB;
        
        if (!summary.manifestPath) {
            setReplayState({ status: 'failed', error: 'No manifest available for replay' });
            return;
        }
        
        setReplayState({ status: 'running' });
        
        try {
            const replayResult = await replayFromManifestForUi({
                manifestPath: summary.manifestPath,
            });
            
            if (replayResult.success) {
                setReplayState({ status: 'succeeded', result: replayResult });
            } else {
                setReplayState({ 
                    status: 'failed', 
                    error: replayResult.errorMessage || 'Replay failed',
                    result: replayResult,
                });
            }
        } catch (err) {
            setReplayState({
                status: 'failed',
                error: err instanceof Error ? err.message : 'Unexpected replay error',
            });
        }
    }, [result]);
    
    /**
     * Open replay viewer for a target
     */
    const handleViewReplay = useCallback((target: 'A' | 'B') => {
        setViewerTarget(target);
        setIsViewerOpen(true);
    }, []);
    
    /**
     * Get video paths for viewer
     */
    const getViewerPaths = useCallback(() => {
        if (!result) return { original: undefined, replayed: undefined, manifest: '' };
        
        const summary = viewerTarget === 'A' ? result.runA : result.runB;
        const replayState = viewerTarget === 'A' ? replayStateA : replayStateB;
        
        return {
            original: summary.videoPath,
            replayed: replayState.result?.replayedVideoPath,
            manifest: summary.manifestPath || '',
        };
    }, [result, viewerTarget, replayStateA, replayStateB]);
    
    /**
     * Run the A/B comparison
     * Note: In a real implementation, this would call an API endpoint or use a worker.
     * For now, we simulate the comparison with placeholder results.
     */
    const runComparison = useCallback(async () => {
        setStatus('running');
        setStatusMessage('Starting A/B comparison...');
        setError(null);
        setResult(null);
        
        // Reset run states
        setRunStateA({ status: 'pending' });
        setRunStateB({ status: 'pending' });
        // Reset replay states when starting new comparison
        setReplayStateA({ status: 'idle' });
        setReplayStateB({ status: 'idle' });
        
        try {
            // Build compare targets from presets
            const targetA: CompareTarget = {
                id: 'A',
                ...presetA.target,
            };
            
            const targetB: CompareTarget = {
                id: 'B',
                ...presetB.target,
            };
            
            // Run target A
            setStatusMessage(`Running target A: ${targetA.label}...`);
            setRunStateA({ status: 'running' });
            
            // Simulate API call delay (in real implementation, this would call the backend)
            // The actual runAbCompare would be invoked via an API endpoint or worker
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            setRunStateA({ status: 'succeeded' });
            
            // Run target B  
            setStatusMessage(`Running target B: ${targetB.label}...`);
            setRunStateB({ status: 'running' });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            setRunStateB({ status: 'succeeded' });
            
            // For demo purposes, create a placeholder result
            // In production, this would come from the actual pipeline run
            const mockResult: AbCompareResult = {
                compareId: `compare-${Date.now()}`,
                sampleId,
                startedAt: new Date(Date.now() - 5000).toISOString(),
                finishedAt: new Date().toISOString(),
                totalDurationMs: 5000,
                runA: {
                    target: targetA,
                    status: 'succeeded',
                    metrics: {
                        visionVerdict: 'PASS',
                        visionOverall: 85,
                        flickerMetric: 3,
                        jitterScore: 12,
                        identityScore: 88,
                    },
                },
                runB: {
                    target: targetB,
                    status: 'succeeded',
                    metrics: {
                        visionVerdict: 'PASS',
                        visionOverall: 92,
                        flickerMetric: 1,
                        jitterScore: 8,
                        identityScore: 94,
                    },
                },
                status: 'succeeded',
            };
            
            setResult(mockResult);
            setStatus('completed');
            setStatusMessage('Comparison complete');
            
            if (onComparisonComplete) {
                onComparisonComplete(mockResult);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Comparison failed';
            setError(errorMessage);
            setStatus('error');
            setStatusMessage('');
            
            // Mark any still-pending/running targets as failed
            setRunStateA(prev => 
                prev.status === 'pending' || prev.status === 'running' 
                    ? { status: 'failed', error: errorMessage } 
                    : prev
            );
            setRunStateB(prev => 
                prev.status === 'pending' || prev.status === 'running' 
                    ? { status: 'failed', error: errorMessage } 
                    : prev
            );
        }
    }, [presetA, presetB, sampleId, onComparisonComplete]);
    
    /**
     * Get metrics from result for comparison table
     */
    const getMetrics = (target: 'A' | 'B'): CompareMetrics | undefined => {
        if (!result) return undefined;
        return target === 'A' ? result.runA.metrics : result.runB.metrics;
    };
    
    const metricsA = getMetrics('A');
    const metricsB = getMetrics('B');
    
    return (
        <div className="bg-gray-900/50 rounded-lg ring-1 ring-gray-700/80 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">⚖️</span>
                    <div className="text-left">
                        <h3 className="text-sm font-semibold text-gray-200">A/B QA Comparison</h3>
                        <p className="text-xs text-gray-400">Compare pipeline configurations side-by-side</p>
                    </div>
                </div>
                <span className="text-gray-400 text-lg">
                    {isCollapsed ? '▸' : '▾'}
                </span>
            </button>
            
            {/* Collapsible Content */}
            {!isCollapsed && (
                <div className="border-t border-gray-700/50 p-4 space-y-4">
                    {/* Target Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <PresetSelector
                            selectedId={presetA.id}
                            onChange={setPresetA}
                            label="Target A"
                        />
                        <PresetSelector
                            selectedId={presetB.id}
                            onChange={setPresetB}
                            label="Target B"
                        />
                    </div>
                    
                    {/* Sample Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Golden Sample
                        </label>
                        <select
                            value={sampleId}
                            onChange={e => setSampleId(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="sample-001-geometric">sample-001-geometric (Spinning Top)</option>
                            <option value="sample-002-organic">sample-002-organic (Flowers)</option>
                            <option value="sample-003-portrait">sample-003-portrait (Face)</option>
                        </select>
                    </div>
                    
                    {/* Run Button */}
                    <button
                        onClick={runComparison}
                        disabled={status === 'running' || presetA.id === presetB.id}
                        className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                            status === 'running' || presetA.id === presetB.id
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-500'
                        }`}
                    >
                        {status === 'running' ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="animate-spin">⏳</span>
                                {statusMessage}
                            </span>
                        ) : (
                            'Run A/B Comparison'
                        )}
                    </button>
                    
                    {presetA.id === presetB.id && (
                        <p className="text-xs text-amber-400 text-center">
                            Please select different presets for A and B
                        </p>
                    )}
                    
                    {/* Multi-Scenario A/B Button */}
                    <button
                        onClick={() => setShowMultiScenarioModal(true)}
                        className="w-full py-2 px-4 rounded-lg font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors border border-gray-600"
                    >
                        🔬 Run Multi-Scenario A/B
                    </button>
                    
                    {/* Multi-Scenario A/B Modal */}
                    {showMultiScenarioModal && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold text-white">Multi-Scenario A/B Experiments</h3>
                                    <button
                                        onClick={() => setShowMultiScenarioModal(false)}
                                        className="text-gray-400 hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>
                                
                                <p className="text-sm text-gray-300 mb-4">
                                    Run automated A/B experiments across multiple scenarios and seeds for statistical rigor.
                                </p>
                                
                                <div className="space-y-4">
                                    <div className="bg-gray-900 rounded-lg p-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs text-gray-400">Quick mode (3 seeds × 2 scenarios)</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText('npx ts-node scripts/run-ab-experiments.ts --quick')}
                                                className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                                            >
                                                📋 Copy
                                            </button>
                                        </div>
                                        <code className="text-sm text-green-400 break-all">
                                            npx ts-node scripts/run-ab-experiments.ts --quick
                                        </code>
                                    </div>
                                    
                                    <div className="bg-gray-900 rounded-lg p-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs text-gray-400">Full mode (5 seeds × all scenarios)</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText('npx ts-node scripts/run-ab-experiments.ts --full')}
                                                className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                                            >
                                                📋 Copy
                                            </button>
                                        </div>
                                        <code className="text-sm text-green-400 break-all">
                                            npx ts-node scripts/run-ab-experiments.ts --full
                                        </code>
                                    </div>
                                    
                                    <div className="bg-gray-900 rounded-lg p-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs text-gray-400">Dry run (preview what would run)</span>
                                            <button
                                                onClick={() => navigator.clipboard.writeText('npx ts-node scripts/run-ab-experiments.ts --dry-run')}
                                                className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded"
                                            >
                                                📋 Copy
                                            </button>
                                        </div>
                                        <code className="text-sm text-green-400 break-all">
                                            npx ts-node scripts/run-ab-experiments.ts --dry-run
                                        </code>
                                    </div>
                                </div>
                                
                                <div className="mt-4 pt-4 border-t border-gray-700">
                                    <p className="text-xs text-gray-400 mb-2">
                                        Reports are saved to <code className="text-gray-300">reports/ab-experiments-*.md</code>
                                    </p>
                                    {latestAbReportPath && (
                                        <div className="flex items-center gap-2 text-xs text-gray-300 mb-2">
                                            <span>Latest report:</span>
                                            <FileLink path={latestAbReportPath} icon="??" label={latestAbReportPath.split(/[/\\]/).pop()} />
                                        </div>
                                    )}
                                    {!latestAbReportPath && latestReportState === 'loading' && (
                                        <p className="text-xs text-gray-500 mb-1">Looking for the most recent A/B report...</p>
                                    )}
                                    {!latestAbReportPath && latestReportState === 'not-found' && (
                                        <p className="text-xs text-gray-500 mb-1">No recent A/B report detected yet.</p>
                                    )}
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            navigator.clipboard.writeText('reports/ab-experiments-*.md');
                                        }}
                                        className="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                        📁 Copy reports path
                                    </a>
                                </div>
                                
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => setShowMultiScenarioModal(false)}
                                        className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}
                    
                    {/* Results - Show during run (with spinners) or after completion */}
                    {(status === 'running' || result) && (
                        <div className="space-y-4 pt-4 border-t border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-200">
                                {status === 'running' ? 'Running Comparison...' : 'Comparison Results'}
                            </h4>
                            
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <ResultPanel
                                    label={presetA.label}
                                    targetId="A"
                                    summary={result?.runA}
                                    runState={runStateA}
                                    replayState={replayStateA}
                                    onReplay={() => handleReplay('A')}
                                    onViewReplay={() => handleViewReplay('A')}
                                />
                                <ResultPanel
                                    label={presetB.label}
                                    targetId="B"
                                    summary={result?.runB}
                                    runState={runStateB}
                                    replayState={replayStateB}
                                    onReplay={() => handleReplay('B')}
                                    onViewReplay={() => handleViewReplay('B')}
                                />
                            </div>
                            
                            {/* Metrics Comparison Table */}
                            {result && (metricsA || metricsB) && (
                                <div className="bg-gray-800/30 rounded-lg p-4">
                                    <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                                        Metrics Comparison
                                    </h5>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-gray-400 text-xs uppercase">
                                                <th className="text-left py-2">Metric</th>
                                                <th className="text-center py-2">A</th>
                                                <th className="text-center py-2">B</th>
                                                <th className="text-center py-2">Better</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <MetricRow
                                                label="Vision Overall"
                                                valueA={metricsA?.visionOverall}
                                                valueB={metricsB?.visionOverall}
                                                higherIsBetter={true}
                                                threshold={80}
                                                warnThreshold={85}
                                            />
                                            <MetricRow
                                                label="Flicker Frames"
                                                valueA={metricsA?.flickerMetric}
                                                valueB={metricsB?.flickerMetric}
                                                higherIsBetter={false}
                                                threshold={15}
                                                warnThreshold={5}
                                            />
                                            <MetricRow
                                                label="Jitter Score"
                                                valueA={metricsA?.jitterScore}
                                                valueB={metricsB?.jitterScore}
                                                higherIsBetter={false}
                                                threshold={40}
                                                warnThreshold={20}
                                            />
                                            <MetricRow
                                                label="Identity Score"
                                                valueA={metricsA?.identityScore}
                                                valueB={metricsB?.identityScore}
                                                suffix="%"
                                                higherIsBetter={true}
                                                threshold={50}
                                                warnThreshold={70}
                                            />
                                            <MetricRow
                                                label="Path Adherence Error"
                                                valueA={metricsA?.pathAdherenceMeanError}
                                                valueB={metricsB?.pathAdherenceMeanError}
                                                higherIsBetter={false}
                                                threshold={0.3}
                                                warnThreshold={0.15}
                                            />
                                            <MetricRow
                                                label="Direction Consistency"
                                                valueA={metricsA?.pathDirectionConsistency}
                                                valueB={metricsB?.pathDirectionConsistency}
                                                higherIsBetter={true}
                                                threshold={0.3}
                                                warnThreshold={0.5}
                                            />
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            
                            {/* Timing Info */}
                            {result && (
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>Comparison ID: {result.compareId}</span>
                                    <span>Duration: {(result.totalDurationMs / 1000).toFixed(1)}s</span>
                                </div>
                            )}
                            
                            {/* Staleness Warning */}
                            {result && (
                                <StalenessWarning finishedAt={result.finishedAt} thresholdHours={24} />
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
                title={`Target ${viewerTarget} - ${viewerTarget === 'A' ? presetA.label : presetB.label}`}
            />
        </div>
    );
};

export default AbCompareDashboard;
