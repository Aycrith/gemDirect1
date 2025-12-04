import React, { useState, useMemo, useEffect } from 'react';
import { useArtifactMetadata, type ArtifactSceneMetadata, type StoryLLMMetadata, useRunHistory } from '../utils/hooks';
import TelemetryBadges from './TelemetryBadges';
import QueuePolicyCard from './QueuePolicyCard';
import FallbackWarningsCard from './FallbackWarningsCard';
import HistoricalTelemetryCard from './HistoricalTelemetryCard';
import TelemetryComparisonChart from './TelemetryComparisonChart';
import ScenePlayer from './ScenePlayer';
import { RecommendationEngine, type TelemetrySnapshot, type Recommendation } from '../services/recommendationEngine';
import { getSceneVideoManager } from '../services/videoGenerationService';
import { getGlobalStats, getHistory, type GlobalPipelineStats, type PipelineMetrics } from '../services/pipelineMetrics';
import type { ToastMessage } from '../types';

type ArtifactScene = ArtifactSceneMetadata;

const formatVramDelta = (value?: number | string | null): string => {
    if (value == null) return 'n/a';
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(numeric)) return 'n/a';
    const sign = numeric >= 0 ? '+' : '-';
    return `${sign}${Math.round(Math.abs(numeric) / 1048576)}MB`;
};

const getHealthBadgeClass = (status?: string) => {
    switch (status) {
        case 'success':
            return 'bg-emerald-500/10 text-emerald-200 border border-emerald-400/30';
        case 'failed':
            return 'bg-amber-500/10 text-amber-300 border border-amber-400/30';
        case 'skipped':
            return 'bg-gray-700/40 text-gray-200 border border-gray-600/40';
        default:
            return 'bg-gray-700/40 text-gray-200 border border-gray-600/40';
    }
};

const buildTelemetrySummary = (scene: ArtifactScene): string[] => {
    const telemetry = scene.Telemetry;
    if (!telemetry) {
        return [];
    }
    const summary: string[] = [];
    if (typeof telemetry.DurationSeconds === 'number') {
        summary.push(`DurationSeconds=${telemetry.DurationSeconds.toFixed(1)}s`);
    }
    if (typeof telemetry.MaxWaitSeconds === 'number') {
        summary.push(`MaxWaitSeconds=${telemetry.MaxWaitSeconds}s`);
    }
    if (typeof telemetry.PollIntervalSeconds === 'number') {
        summary.push(`PollIntervalSeconds=${telemetry.PollIntervalSeconds}s`);
    }
    if (typeof telemetry.HistoryAttempts === 'number') {
        summary.push(`HistoryAttempts=${telemetry.HistoryAttempts}`);
    }
    const pollLimitLabel = telemetry.HistoryAttemptLimit != null ? telemetry.HistoryAttemptLimit : 'unbounded';
    summary.push(`pollLimit=${pollLimitLabel}`);
    const retryBudgetLabel = telemetry.SceneRetryBudget != null && telemetry.SceneRetryBudget > 0 ? telemetry.SceneRetryBudget : 'unbounded';
    summary.push(`SceneRetryBudget=${retryBudgetLabel}`);
    if (typeof telemetry.PostExecutionTimeoutSeconds === 'number') {
        summary.push(`PostExecutionTimeoutSeconds=${telemetry.PostExecutionTimeoutSeconds}s`);
    }
    if (telemetry.ExecutionSuccessDetected) {
        summary.push('ExecutionSuccessDetected=true');
    }
    if (telemetry.ExecutionSuccessAt) {
        try {
            const resolved = new Date(telemetry.ExecutionSuccessAt);
            if (!Number.isNaN(resolved.getTime())) {
                summary.push(`ExecutionSuccessAt=${resolved.toLocaleTimeString()}`);
            } else {
                summary.push(`ExecutionSuccessAt=${telemetry.ExecutionSuccessAt}`);
            }
        } catch {
            summary.push(`ExecutionSuccessAt=${telemetry.ExecutionSuccessAt}`);
        }
    }
    if (telemetry.HistoryExitReason) {
        summary.push(`HistoryExitReason=${telemetry.HistoryExitReason}`);
    }
    if (telemetry.HistoryPostExecutionTimeoutReached) {
        summary.push('HistoryPostExecutionTimeoutReached=true');
    }
    if (telemetry.GPU?.Name) {
        summary.push(`GPU=${telemetry.GPU.Name}`);
        if (telemetry.GPU.VramBeforeMB != null) {
            summary.push(`VRAMBeforeMB=${telemetry.GPU.VramBeforeMB}MB`);
        }
        if (telemetry.GPU.VramAfterMB != null) {
            summary.push(`VRAMAfterMB=${telemetry.GPU.VramAfterMB}MB`);
        }
        if (telemetry.GPU.VramDeltaMB != null) {
            summary.push(`VRAMDeltaMB=${telemetry.GPU.VramDeltaMB}MB`);
        }
        if (telemetry.GPU.VramDelta != null && telemetry.GPU.VramDeltaMB == null) {
            const delta = formatVramDelta(telemetry.GPU.VramDelta);
            summary.push(`vramDelta ${delta}`);
        }
    }
    if (telemetry.System?.FallbackNotes?.length) {
        const notes = telemetry.System.FallbackNotes.filter(Boolean);
        if (notes.length > 0) {
            summary.push(`fallback ${notes.join('; ')}`);
        }
    }
    return summary;
};

const toFileUri = (filePath?: string): string | undefined => {
    if (!filePath) return undefined;
    if (filePath.startsWith('file://')) return filePath;
    const trimmed = filePath.replace(/^\/+/, '');
    if (/^[a-zA-Z]:/.test(trimmed)) {
        return `file:///${trimmed}`;
    }
    return `file:///${trimmed}`;
};

interface ArtifactViewerProps {
    addToast?: (message: string, type: ToastMessage['type']) => void;
}

const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ addToast }) => {
    const { artifact, error, loading, refresh } = useArtifactMetadata();
    const { historicalRuns, compareWithHistorical, dbInitialized } = useRunHistory();
    const [showWarningsOnly, setShowWarningsOnly] = useState(false);
    const [_comparison, setComparison] = useState<any>(null);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [regeneratingScenes, setRegeneratingScenes] = useState<Set<string>>(new Set());
    const [pipelineStats, setPipelineStats] = useState<GlobalPipelineStats | null>(null);
    const [pipelineHistory, setPipelineHistory] = useState<PipelineMetrics[]>([]);

    // Load pipeline metrics on mount and periodically refresh
    useEffect(() => {
        const loadPipelineMetrics = () => {
            setPipelineStats(getGlobalStats());
            setPipelineHistory(getHistory());
        };
        loadPipelineMetrics();
        const interval = setInterval(loadPipelineMetrics, 5000); // Refresh every 5s
        return () => clearInterval(interval);
    }, []);

    // Generate recommendations from artifact telemetry (aggregated from scenes)
    useEffect(() => {
        if (artifact && artifact.Scenes && artifact.Scenes.length > 0) {
            // Aggregate telemetry from all scenes
            const successCount = artifact.Scenes.filter(s => s.Success).length;
            const totalDuration = artifact.Scenes.reduce((sum, s) => sum + (s.DurationSeconds || 0), 0);
            
            const telemetrySnapshot: TelemetrySnapshot = {
                storyId: artifact.Story.Id,
                scenes: artifact.Scenes.length,
                successRate: artifact.Scenes.length > 0 ? successCount / artifact.Scenes.length : 0,
                durationSeconds: totalDuration,
                gpuUsageGb: 0, // Not available at scene level
                retries: artifact.Scenes.reduce((sum, s) => sum + (s.AttemptsRun || 0), 0),
                timeouts: artifact.Scenes.filter(s => s.Telemetry?.HistoryExitReason === 'timeout').length,
                timestamp: new Date(artifact.Timestamp),
            };
            
            // Generate recommendations from telemetry
            const recs = RecommendationEngine.analyzeTelemetry([telemetrySnapshot]);
            setRecommendations(recs);
        }
    }, [artifact]);

    // Calculate comparison with historical data when artifact or historicalRuns change
    useEffect(() => {
        if (dbInitialized && artifact && historicalRuns.length > 0 && compareWithHistorical) {
            const comp = compareWithHistorical(artifact);
            setComparison(comp);
        } else {
            setComparison(null);
        }
    }, [artifact, historicalRuns, dbInitialized, compareWithHistorical]);

    const scenesToDisplay = useMemo(() => {
        if (!artifact) {
            return [];
        }
        if (!showWarningsOnly) {
            return artifact.Scenes;
        }
        return artifact.Scenes.filter(
            (scene) =>
                (scene.Warnings && scene.Warnings.length > 0) ||
                (scene.Errors && scene.Errors.length > 0) ||
                scene.FrameCount < scene.FrameFloor ||
                !scene.HistoryRetrieved,
        );
    }, [artifact, showWarningsOnly]);

    const handleRegenerateScene = async (sceneId: string, prompt?: string, negativePrompt?: string) => {
        setRegeneratingScenes((prev) => {
            const next = new Set(prev);
            next.add(sceneId);
            return next;
        });
        addToast?.(`Regenerating video for ${sceneId}…`, 'info');
        try {
            const manager = getSceneVideoManager();
            await manager.regenerateScene(sceneId, { prompt, negativePrompt });
            addToast?.(`Scene ${sceneId} video updated.`, 'success');
        } finally {
            refresh();
            setRegeneratingScenes((prev) => {
                const next = new Set(prev);
                next.delete(sceneId);
                return next;
            });
        }
    };

    if (loading) {
        return (
            <section className="mt-6 bg-gray-900 border border-amber-500/20 rounded-2xl p-4 text-sm text-gray-300">
                Loading latest artifact metadata…
            </section>
        );
    }

    if (error) {
        return (
            <section className="mt-6 bg-gray-900 border border-red-500/30 rounded-2xl p-4 text-sm text-red-300">
                Artifact viewer cannot load data: {error}
            </section>
        );
    }

    if (!artifact) {
        return (
            <section className="mt-6 bg-gray-900 border border-dashed border-gray-600 rounded-2xl p-4 text-sm text-gray-400">
                No artifact metadata yet. Run `scripts/run-comfyui-e2e.ps1` to populate the latest artifact deck.
            </section>
        );
    }

    const storyLLM = (artifact.Story?.LLM ?? null) as StoryLLMMetadata | null;
    const runTimestamp = new Date(artifact.Timestamp);
    const queuePolicy = artifact.QueueConfig;
    const helperSummaries = artifact.HelperSummaries;
    const mappingHelper = helperSummaries?.MappingPreflight;
    const comfyHelper = helperSummaries?.ComfyUIStatus;
    const mappingSummaryHref = mappingHelper?.Summary ? toFileUri(mappingHelper.Summary) : undefined;
    const mappingLogHref = mappingHelper?.Log ? toFileUri(mappingHelper.Log) : undefined;
    const comfySummaryHref = comfyHelper?.Summary ? toFileUri(comfyHelper.Summary) : undefined;
    const comfyLogHref = comfyHelper?.Log ? toFileUri(comfyHelper.Log) : undefined;

    return (
        <section className="mt-6 bg-gray-900 border border-emerald-500/20 rounded-2xl p-5 shadow-xl shadow-emerald-900/10 text-sm text-gray-200">
            {/* Compact Header - Always Visible */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-300">Latest Artifact Snapshot</p>
                    <h2 className="text-xl font-semibold text-gray-100">Run {artifact.RunId}</h2>
                    <p className="text-xs text-gray-500">{runTimestamp.toLocaleString()} · {artifact.RunDir}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        className="px-3 py-1 rounded-lg border border-emerald-400/60 text-xs text-emerald-200 hover:bg-emerald-500/10"
                        onClick={refresh}
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="px-3 py-1 rounded-lg border border-cyan-400/60 text-xs text-cyan-200 hover:bg-cyan-500/10"
                        onClick={() => setShowWarningsOnly((prev) => !prev)}
                    >
                        {showWarningsOnly ? 'Show all' : 'Warnings only'}
                    </button>
                </div>
            </div>
            
            {/* Quick Summary - Always Visible */}
            <div className="mt-4 grid gap-3 md:grid-cols-3 text-xs">
                <div className="bg-gray-950/40 border border-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 uppercase tracking-wide mb-1">Story</p>
                    <p className="text-sm text-gray-100 line-clamp-2">{artifact.Story.Logline}</p>
                </div>
                <div className="bg-gray-950/40 border border-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 uppercase tracking-wide mb-1">Scenes</p>
                    <p className="text-sm text-gray-100">{artifact.Scenes.length} total · {artifact.Scenes.filter(s => s.Success).length} successful</p>
                </div>
                <div className="bg-gray-950/40 border border-gray-700 rounded-lg p-3">
                    <p className="text-gray-400 uppercase tracking-wide mb-1">Status</p>
                    <p className="text-sm text-emerald-300">{storyLLM?.status ?? 'Unknown'}</p>
                </div>
            </div>

            
            {/* Collapsible Details Section */}
            <div className="mt-4 space-y-2">
                
                {/* Queue Configuration & Fallback Warnings (Collapsible) */}
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>🔧 Queue Configuration & Policies</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Queue Policy */}
                            <div className="bg-gray-950/60 border border-emerald-500/30 rounded-lg p-4 space-y-1 text-xs text-gray-300">
                                {queuePolicy ? (
                                    <QueuePolicyCard queueConfig={queuePolicy} title="Queue Configuration" />
                                ) : (
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wide text-emerald-300">Queue policy</p>
                                        <p className="text-gray-400">No queue configuration available</p>
                                    </div>
                                )}
                            </div>

                            {/* Fallback Warnings */}
                            <div className="bg-gray-950/60 border border-orange-500/30 rounded-lg p-4 space-y-1 text-xs text-gray-300">
                                {artifact.Scenes && artifact.Scenes.length > 0 ? (
                                    (() => {
                                        const firstScene = artifact.Scenes[0];
                                        if (!firstScene) return null;
                                        return (
                                            <FallbackWarningsCard
                                                exitReason={firstScene.Telemetry?.HistoryExitReason}
                                                executionSuccessDetected={firstScene.Telemetry?.ExecutionSuccessDetected}
                                                postExecutionTimeoutReached={firstScene.Telemetry?.HistoryPostExecutionTimeoutReached}
                                                title="Run Fallback Warnings"
                                            />
                                        );
                                    })()
                                ) : (
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wide text-orange-300">Fallback warnings</p>
                                        <p className="text-gray-400">No scenes available</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </details>

                {/* LLM & Run Artifacts (Collapsible) */}
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>🤖 LLM & Run Artifacts</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4">
                        <div className="bg-gray-950/60 border border-cyan-500/30 rounded-lg p-4 space-y-1 text-xs text-gray-300">
                            <p className="text-[11px] uppercase tracking-wide text-cyan-300">LLM & Run Artifacts</p>
                            <div className="grid gap-0.5">
                                <span className="text-[11px] text-gray-500">Provider</span>
                                <span className="text-sm text-gray-100 truncate">{storyLLM?.providerUrl ?? 'n/a'}</span>
                            </div>
                            <div className="grid gap-0.5">
                                <span className="text-[11px] text-gray-500">Model</span>
                                <span className="text-sm text-gray-100">{storyLLM?.model ?? 'n/a'}</span>
                            </div>
                            <div className="grid gap-0.5 md:grid-cols-2 md:gap-4 text-[11px] text-gray-400">
                                <span>Format: {storyLLM?.requestFormat ?? 'n/a'}</span>
                                <span>Temperature: {storyLLM?.temperature ?? 'auto'}</span>
                            </div>
                            <div className="grid gap-0.5 md:grid-cols-2 md:gap-4 text-[11px] text-gray-400">
                                <span>Seed: {storyLLM?.seed ?? 'n/a'}</span>
                                <span>Duration: {storyLLM?.durationMs ?? 'n/a'}ms</span>
                            </div>
                            <div className="text-[11px] text-gray-400">
                                Scenes requested: {storyLLM?.scenesRequested ?? 'n/a'}
                                {storyLLM?.scenesReceived != null && ` · received ${storyLLM.scenesReceived}`}
                            </div>
                            {storyLLM?.error && (
                                <div className="text-amber-300 text-[11px]">LLM error: {storyLLM.error}</div>
                            )}
                            {artifact.Story.HealthCheck && (
                                <div className="space-y-1 text-[11px] mt-2 pt-2 border-t border-gray-700">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-gray-500 uppercase tracking-wide">Health check</span>
                                        <span
                                            className={`${getHealthBadgeClass(
                                                artifact.Story.HealthCheck.Status?.toLowerCase(),
                                            )} px-2 py-0.5 rounded-full text-[10px] font-semibold`}
                                        >
                                            {artifact.Story.HealthCheck.Status ?? 'unknown'}
                                        </span>
                                    </div>
                                    {artifact.Story.HealthCheck.Url && (
                                        <div className="text-gray-400">
                                            Endpoint: <span className="text-gray-100">{artifact.Story.HealthCheck.Url}</span>
                                        </div>
                                    )}
                                    {artifact.Story.HealthCheck.Models != null && (
                                        <div className="text-gray-400">Models: {artifact.Story.HealthCheck.Models}</div>
                                    )}
                                </div>
                            )}
                            <div className="mt-2 pt-2 border-t border-gray-700 space-y-0.5">
                                <div className="text-[11px] text-gray-500">Run: {artifact.RunId}</div>
                                <div className="text-[11px] text-gray-500">Directory: {artifact.RunDir}</div>
                                {artifact.Story.StoryDir && (
                                    <div className="text-[11px] text-gray-500">Story dir: {artifact.Story.StoryDir}</div>
                                )}
                            </div>
                            {(mappingSummaryHref || mappingLogHref || comfySummaryHref || comfyLogHref) && (
                                <div className="space-y-1 text-[11px] text-emerald-200 mt-2 pt-2 border-t border-gray-700">
                                    <div className="text-emerald-300 font-semibold">Helper Summaries & Logs</div>
                                    {mappingSummaryHref && (
                                        <a
                                            className="block truncate text-emerald-200 underline hover:text-emerald-100"
                                            href={mappingSummaryHref}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={mappingHelper?.Summary}
                                        >
                                            Mapping preflight summary
                                        </a>
                                    )}
                                    {comfySummaryHref && (
                                        <a
                                            className="block truncate text-emerald-200 underline hover:text-emerald-100"
                                            href={comfySummaryHref}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={comfyHelper?.Summary}
                                        >
                                            ComfyUI status summary
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </details>

                {/* Scenes Table (Collapsible) */}
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>📊 Scenes Overview Table</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 overflow-auto text-xs">
                        <table className="min-w-full text-left text-gray-200 border-separate border-spacing-y-2">
                            <thead className="text-emerald-300">
                                <tr>
                                    <th className="px-2 py-1">Scene</th>
                                    <th className="px-2 py-1">Frames</th>
                                    <th className="px-2 py-1">History</th>
                                    <th className="px-2 py-1">Telemetry</th>
                                    <th className="px-2 py-1">Status</th>
                                </tr>
                            </thead>
                    <tbody>
                        {scenesToDisplay.map((scene) => {
                            const telemetrySummary = buildTelemetrySummary(scene);
                            const historyConfig = scene.HistoryConfig;
                            const historyConfigAttemptsLabel =
                                historyConfig && historyConfig.MaxAttempts && historyConfig.MaxAttempts > 0
                                    ? historyConfig.MaxAttempts
                                    : 'unbounded';
                            const pollLogCount = scene.HistoryPollLog?.length ?? 0;
                            const lastPollStatus =
                                pollLogCount > 0 ? scene.HistoryPollLog?.[pollLogCount - 1]?.Status ?? 'n/a' : 'n/a';
                            const videoHref = toFileUri(scene.Video?.Path);
                            return (
                                <tr key={scene.SceneId} className="border-t border-gray-800">
                                    <td className="px-2 py-1 text-sm text-gray-100">
                                        <div className="font-semibold">{scene.SceneTitle ?? scene.SceneId}</div>
                                        <div className="text-[11px] text-gray-400">{scene.SceneId}</div>
                                        {scene.StoryMood && <div className="text-[11px] text-cyan-200">{scene.StoryMood}</div>}
                                    </td>
                                    <td className="px-2 py-1 text-sm">
                                        <span className="text-lg font-semibold text-gray-100">{scene.FrameCount}</span>
                                        <div className="text-[11px] text-gray-400">floor: {scene.FrameFloor}</div>
                                        {scene.StoryExpectedFrames && (
                                            <div className="text-[11px] text-gray-500">target: {scene.StoryExpectedFrames}</div>
                                        )}
                                    </td>
                                    <td className="px-2 py-1 text-sm space-y-1">
                                        {scene.HistoryPath ? (
                                            <span className="text-emerald-300 block truncate">{scene.HistoryPath}</span>
                                        ) : (
                                            <span className="text-yellow-300">missing</span>
                                        )}
                                        {scene.HistoryRetrievedAt && (
                                            <div className="text-[11px] text-gray-400">
                                                retrieved @ {new Date(scene.HistoryRetrievedAt).toLocaleTimeString()}
                                            </div>
                                        )}
                                        {historyConfig && (
                                            <div className="text-[11px] text-gray-500">
                                                Config: wait≤{historyConfig.MaxWaitSeconds ?? 'n/a'}s · interval {historyConfig.PollIntervalSeconds ?? 'n/a'}s ·
                                                attempts {historyConfigAttemptsLabel} · postExec {historyConfig.PostExecutionTimeoutSeconds ?? 'n/a'}s
                                            </div>
                                        )}
                                        {pollLogCount > 0 && (
                                            <div className="text-[11px] text-gray-500">
                                                Poll log entries: {pollLogCount} · last {lastPollStatus}
                                            </div>
                                        )}
                                        {scene.HistoryAttempts && (
                                            <div className="text-[11px] text-gray-500">{scene.HistoryAttempts} poll attempts</div>
                                        )}
                                    </td>
                                    <td className="px-2 py-1 text-xs text-gray-300 space-y-2">
                                        <TelemetryBadges telemetry={scene.Telemetry} title="Scene Telemetry" />
                                        <div className="space-y-1">
                                            {telemetrySummary.length > 0 ? (
                                                telemetrySummary.map((line, index) => (
                                                    <div key={`${scene.SceneId}-telemetry-${index}`}>{line}</div>
                                                ))
                                            ) : (
                                                <div className="text-gray-500">n/a</div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-2 py-1 text-xs space-y-1">
                                        {!scene.Success && <div className="text-red-400">Scene failed</div>}
                                        {scene.HistoryRetrieved && (
                                            <div className="text-emerald-400">
                                                History OK
                                            </div>
                                        )}
                                        {(scene.AttemptsRun ?? 1) > 1 && (
                                            <div className="text-cyan-300">
                                                Requeued {scene.AttemptsRun ?? 1}x
                                            </div>
                                        )}
                                        {scene.HistoryError && (
                                            <div className="text-yellow-300 truncate">Error: {scene.HistoryError}</div>
                                        )}
                                        {scene.Warnings?.map((warning) => (
                                            <div key={warning} className="text-yellow-200">{warning}</div>
                                        ))}
                                        {scene.Errors?.map((err) => (
                                            <div key={err} className="text-red-400">{err}</div>
                                        ))} 
                                        {scene.Video && (
                                            <div className="space-y-0.5 text-[11px] text-cyan-200 mt-1">
                                                {scene.Video.Path && videoHref && (
                                                    <a
                                                        className="block truncate max-w-[20vw] underline hover:text-emerald-100"
                                                        href={videoHref}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title={scene.Video.Path}
                                                    >
                                                        {scene.Video.Path}
                                                    </a>
                                                )}
                                                {typeof scene.Video.DurationSeconds === 'number' && (
                                                    <div className="text-gray-300">Duration: {scene.Video.DurationSeconds}s</div>
                                                )}
                                                {scene.Video.Status && (
                                                    <div className="text-gray-400">Video status: {scene.Video.Status}</div>
                                                )}
                                                {scene.Video.UpdatedAt && (
                                                    <div className="text-gray-400">
                                                        Updated {new Date(scene.Video.UpdatedAt).toLocaleString()}
                                                    </div>
                                                )}
                                                {scene.Video.Error && (
                                                    <div className="text-yellow-200">Video error: {scene.Video.Error}</div>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                        </table>
                        {scenesToDisplay.length === 0 && (
                            <div className="text-center text-xs text-gray-500 py-4">No scenes match the current filter.</div>
                        )}
                    </div>
                </details>

                {/* Scene Details (Collapsible) */}
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>🎬 Detailed Scene Information</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-3 text-xs text-gray-300">
                {artifact.Scenes.map((scene) => {
                    const historyConfig = scene.HistoryConfig;
                    const historyConfigAttemptsLabel =
                        historyConfig && historyConfig.MaxAttempts && historyConfig.MaxAttempts > 0
                            ? historyConfig.MaxAttempts
                            : 'unbounded';
                    const pollLogCount = scene.HistoryPollLog?.length ?? 0;
                    const lastPollStatus =
                        pollLogCount > 0 ? scene.HistoryPollLog?.[pollLogCount - 1]?.Status ?? 'n/a' : 'n/a';
                    const fallbackNotes = scene.Telemetry?.System?.FallbackNotes?.filter(Boolean) ?? [];

                    return (
                    <details key={`${scene.SceneId}-details`} className="bg-gray-950/50 border border-gray-800 rounded-lg p-3">
                        <summary className="cursor-pointer text-sm text-emerald-300">
                            Scene {scene.SceneId} details
                        </summary>
                        <div className="mt-2 space-y-1">
                            {scene.SceneTitle && (
                                <div className="text-base text-gray-100 font-semibold">{scene.SceneTitle}</div>
                            )}
                            {scene.SceneSummary && (
                                <div className="text-gray-400">{scene.SceneSummary}</div>
                            )}
                            {scene.StoryMood && (
                                <div>
                                    <span className="text-gray-500">Mood:</span>{' '}
                                    <span className="text-gray-200">{scene.StoryMood}</span>
                                </div>
                            )}
                            <div>
                                <span className="text-gray-500">Prompt:</span>{' '}
                                <span className="text-gray-100">{scene.Prompt}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Negative:</span>{' '}
                                <span className="text-gray-200">{scene.NegativePrompt}</span>
                            </div>
                            {scene.GeneratedFramesDir && (
                                <div>
                                    <span className="text-gray-500">Frames:</span>{' '}
                                    <span className="text-gray-200">{scene.GeneratedFramesDir}</span>
                                </div>
                            )}
                            {scene.KeyframeSource && (
                                <div>
                                    <span className="text-gray-500">Keyframe:</span>{' '}
                                    <span className="text-gray-200">{scene.KeyframeSource}</span>
                                </div>
                            )}
                            {historyConfig && (
                                <div className="text-[11px] text-gray-400">
                                    History config: wait≤{historyConfig.MaxWaitSeconds ?? 'n/a'}s · interval {historyConfig.PollIntervalSeconds ?? 'n/a'}s · attempts {historyConfigAttemptsLabel} · postExec {historyConfig.PostExecutionTimeoutSeconds ?? 'n/a'}s
                                </div>
                            )}
                            {scene.SceneRetryBudget != null && (
                                <div className="text-[11px] text-gray-400">
                                    Retry budget: {scene.SceneRetryBudget}
                                </div>
                            )}
                            {pollLogCount > 0 && (
                                <div className="text-[11px] text-gray-500">
                                    Poll log entries: {pollLogCount} · last {lastPollStatus}
                                </div>
                            )}
                            {scene.AttemptSummaries && scene.AttemptSummaries.length > 0 && (
                                <div>
                                    <span className="text-gray-500 block">Attempts:</span>
                                    <ol className="list-decimal list-inside space-y-1 text-gray-300">
                                        {scene.AttemptSummaries.map((attempt) => {
                                            const attemptTime = attempt.Timestamp ? new Date(attempt.Timestamp).toLocaleTimeString() : 'n/a';
                                            return (
                                                <li key={`${scene.SceneId}-attempt-${attempt.Attempt}`}>
                                                    Attempt {attempt.Attempt} ({attemptTime}):
                                                    {` frames=${attempt.FrameCount}, history=${attempt.HistoryRetrieved ? 'ok' : 'missing'}`}
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </div>
                            )}
                            {scene.Telemetry && (
                                <div className="space-y-2 border-t border-gray-800 pt-2 mt-2">
                                    <div className="text-gray-500 block font-semibold text-sm">Telemetry Details</div>
                                    <TelemetryBadges
                                        telemetry={scene.Telemetry}
                                    />
                                    {scene.Telemetry.QueueStart && (
                                        <div className="text-xs text-gray-400">Queue start: {new Date(scene.Telemetry.QueueStart).toLocaleTimeString()}</div>
                                    )}
                                    {scene.Telemetry.QueueEnd && (
                                        <div className="text-xs text-gray-400">Queue end: {new Date(scene.Telemetry.QueueEnd).toLocaleTimeString()}</div>
                                    )}
                                </div>
                            )}
                            {scene.HistoryPollLog && scene.HistoryPollLog.length > 0 && (
                                <div>
                                    <span className="text-gray-500 block">History polling timeline:</span>
                                    <ul className="list-disc list-inside text-gray-400">
                                        {scene.HistoryPollLog.map((entry) => {
                                            const timestamp = entry.Timestamp ? new Date(entry.Timestamp).toLocaleTimeString() : 'n/a';
                                            const key = `${scene.SceneId}-poll-${entry.Attempt}-${entry.Timestamp ?? entry.Attempt}`;
                                            return (
                                                <li key={key}>
                                                    Attempt {entry.Attempt} ({timestamp}): {entry.Status}
                                                    {entry.Message ? ` - ${entry.Message}` : ''}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                            {scene.HistoryErrors && scene.HistoryErrors.length > 0 && (
                                <div className="text-yellow-200">
                                    History errors: {scene.HistoryErrors.join('; ')}
                                </div>
                            )}
                            {scene.Telemetry && (
                                <div className="text-[11px] text-gray-400 space-y-1">
                                    <span className="text-gray-500 uppercase tracking-wide">Telemetry alerts</span>
                                    <div className="flex flex-wrap gap-2 text-gray-300">
                                        {scene.Telemetry.HistoryExitReason && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-amber-200">
                                                exit: {scene.Telemetry.HistoryExitReason}
                                            </span>
                                        )}
                                        {scene.Telemetry.HistoryPostExecutionTimeoutReached && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-amber-200">
                                                post-exec timeout
                                            </span>
                                        )}
                                        {scene.Telemetry.ExecutionSuccessDetected && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-emerald-200">
                                                execution success
                                            </span>
                                        )}
                                        {scene.Telemetry.ExecutionSuccessAt && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-200">
                                                at {new Date(scene.Telemetry.ExecutionSuccessAt).toLocaleTimeString()}
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-200">
                                            pollLimit {scene.Telemetry.HistoryAttemptLimit ?? 'unbounded'}
                                        </span>
                                    </div>
                                    {fallbackNotes.length > 0 && (
                                        <div className="text-yellow-200 text-[11px]">
                                            Fallback: {fallbackNotes.join('; ')}
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Scene-level video playback */}
                            <div className="mt-3">
                                <ScenePlayer
                                    scene={scene}
                                    runDir={artifact.Archive}
                                    isRegenerating={regeneratingScenes.has(scene.SceneId)}
                                    onRegenerateScene={handleRegenerateScene}
                                />
                            </div>
                        </div>
                    </details>
                        );
                    })}
                    </div>
                </details>

                {/* Vitest Logs (Collapsible) */}
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>🧪 Test Logs & Results</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 grid gap-4 md:grid-cols-2 text-xs text-gray-400">
                <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wide">Vitest logs</p>
                    <p className="text-gray-200 text-[12px]">{artifact.VitestLogs.ComfyUI}</p>
                    <p className="text-gray-200 text-[12px]">{artifact.VitestLogs.E2E}</p>
                    <p className="text-gray-200 text-[12px]">{artifact.VitestLogs.Scripts}</p>
                    {artifact.VitestLogs.ResultsJson && (
                        <p className="text-gray-200 text-[12px]">{artifact.VitestLogs.ResultsJson}</p>
                    )}
                    {artifact.VitestSummary && (
                        <div className="mt-3 space-y-1">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Vitest summary</p>
                            <p className="text-gray-300 text-[11px]">
                                Exit codes: comfy {artifact.VitestSummary.comfyExit ?? 'n/a'}, e2e {artifact.VitestSummary.e2eExit ?? 'n/a'}, scripts {artifact.VitestSummary.scriptsExit ?? 'n/a'}
                            </p>
                            {artifact.VitestSummary.suites?.map((suite) => (
                                <div key={suite.Suite} className="text-gray-300 text-[11px]">
                                    {suite.Suite}: exit {suite.ExitCode}, {suite.DurationMs}ms
                                    {suite.LogPath && <span className="text-gray-500"> ({suite.LogPath})</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-wide">Story file</p>
                    <p className="text-gray-200 text-[12px]">{artifact.Story.File}</p>
                    {artifact.Story.StoryDir && (
                        <p className="text-gray-500 text-[11px]">Story dir: {artifact.Story.StoryDir}</p>
                    )}
                    </div>
                    </div>
                </details>

            {/* AI Recommendations Section (Collapsible) */}
            {recommendations.length > 0 && (
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>💡 AI Recommendations ({recommendations.length})</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                        {recommendations.map((rec, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-lg border ${
                                    rec.severity === 'critical'
                                        ? 'bg-red-500/10 border-red-400/30 text-red-200'
                                        : rec.severity === 'warning'
                                          ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                                          : 'bg-blue-500/10 border-blue-400/30 text-blue-200'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <span className="font-semibold text-sm">{rec.type.toUpperCase()}</span>
                                    <span className={`text-xs px-2 py-1 rounded ${
                                        rec.severity === 'critical'
                                            ? 'bg-red-500/20'
                                            : rec.severity === 'warning'
                                              ? 'bg-amber-500/20'
                                              : 'bg-blue-500/20'
                                    }`}>
                                        {rec.severity}
                                    </span>
                                </div>
                                <p className="text-xs">{rec.message}</p>
                                {rec.suggestedAction && (
                                    <p className="text-xs mt-2 font-mono text-gray-400">
                                        💡 {rec.suggestedAction}
                                    </p>
                                )}
                                <p className="text-xs mt-2 text-gray-500">
                                    Confidence: {Math.round(rec.confidence)}%
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Pipeline Performance Metrics Section (Collapsible) */}
            {pipelineStats && pipelineStats.totalRuns > 0 && (
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>⚡ Pipeline Performance ({pipelineStats.totalRuns} runs)</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-4">
                        {/* Global Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                <div className="text-gray-500 text-[10px] uppercase tracking-wide">Total Runs</div>
                                <div className="text-xl font-semibold text-gray-200">{pipelineStats.totalRuns}</div>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                <div className="text-gray-500 text-[10px] uppercase tracking-wide">Success Rate</div>
                                <div className={`text-xl font-semibold ${pipelineStats.overallSuccessRate >= 0.9 ? 'text-emerald-400' : pipelineStats.overallSuccessRate >= 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {(pipelineStats.overallSuccessRate * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                <div className="text-gray-500 text-[10px] uppercase tracking-wide">Avg Duration</div>
                                <div className="text-xl font-semibold text-gray-200">
                                    {(pipelineStats.avgPipelineDurationMs / 1000).toFixed(1)}s
                                </div>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                                <div className="text-gray-500 text-[10px] uppercase tracking-wide">Total Shots</div>
                                <div className="text-xl font-semibold text-gray-200">{pipelineStats.totalShots}</div>
                            </div>
                        </div>

                        {/* Latency Percentiles */}
                        <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-2">Shot Latency Percentiles</div>
                            <div className="flex items-center gap-6">
                                <div>
                                    <span className="text-gray-400 text-xs">P50:</span>
                                    <span className="text-gray-200 text-sm ml-1">{(pipelineStats.p50ShotDurationMs / 1000).toFixed(2)}s</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 text-xs">P95:</span>
                                    <span className="text-gray-200 text-sm ml-1">{(pipelineStats.p95ShotDurationMs / 1000).toFixed(2)}s</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 text-xs">Avg Shot:</span>
                                    <span className="text-gray-200 text-sm ml-1">{(pipelineStats.avgShotDurationMs / 1000).toFixed(2)}s</span>
                                </div>
                            </div>
                        </div>

                        {/* Recent Pipeline Runs */}
                        {pipelineHistory.length > 0 && (
                            <div>
                                <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-2">Recent Pipelines</div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {pipelineHistory.slice(-5).reverse().map((run) => {
                                        // Derive status from pipeline state
                                        const status = run.completedAt 
                                            ? (run.failedShots > 0 ? 'failed' : 'completed')
                                            : 'in-progress';
                                        // Calculate VRAM from shots if available
                                        const shotsWithVram = run.shots.filter(s => s.vramBeforeBytes !== undefined);
                                        const gpuVramBeforeMb = shotsWithVram.length > 0 
                                            ? (shotsWithVram[0]?.vramBeforeBytes ?? 0) / (1024 * 1024) 
                                            : undefined;
                                        const gpuVramAfterMb = shotsWithVram.length > 0 
                                            ? (shotsWithVram[shotsWithVram.length - 1]?.vramAfterBytes ?? 0) / (1024 * 1024) 
                                            : undefined;
                                        
                                        return (
                                        <div
                                            key={run.runId}
                                            className={`p-2 rounded-lg border text-xs ${
                                                status === 'completed'
                                                    ? 'bg-emerald-500/10 border-emerald-400/30'
                                                    : status === 'failed'
                                                      ? 'bg-red-500/10 border-red-400/30'
                                                      : 'bg-blue-500/10 border-blue-400/30'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-300 font-medium">
                                                    Scene: {run.sceneId.slice(0, 8)}...
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                    status === 'completed'
                                                        ? 'bg-emerald-500/20 text-emerald-300'
                                                        : status === 'failed'
                                                          ? 'bg-red-500/20 text-red-300'
                                                          : 'bg-blue-500/20 text-blue-300'
                                                }`}>
                                                    {status}
                                                </span>
                                            </div>
                                            <div className="text-gray-500 mt-1">
                                                {run.shots.length} shots • 
                                                {run.totalDurationMs ? ` ${(run.totalDurationMs / 1000).toFixed(1)}s total` : ' in progress'}
                                                {gpuVramBeforeMb !== undefined && gpuVramAfterMb !== undefined && (
                                                    <span className="ml-2">
                                                        • VRAM: {gpuVramBeforeMb.toFixed(0)}→{gpuVramAfterMb.toFixed(0)} MB
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </details>
            )}

            {/* Historical Telemetry Section - Wave 2 (Collapsible) */}
            {dbInitialized && historicalRuns.length > 0 && (
                <details className="bg-gray-950/40 border border-gray-700 rounded-lg">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 flex items-center justify-between">
                        <span>📈 Historical Analysis ({historicalRuns.length} runs)</span>
                        <span className="text-xs text-gray-500">Click to expand</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-4">

                        {/* Run-level Comparison */}
                        <div className="mb-6">
                            <HistoricalTelemetryCard
                                storyId={artifact.Story.Id}
                                title="Run History"
                            />
                        </div>

                        {/* Duration Trend Chart */}
                        <div className="mb-6">
                            <div className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">Duration Trend</div>
                            <TelemetryComparisonChart
                                data={historicalRuns}
                                metric="duration"
                            />
                        </div>

                        {/* Success Rate Trend Chart */}
                        <div className="mb-6">
                            <div className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">Success Rate Trend</div>
                            <TelemetryComparisonChart
                                data={historicalRuns}
                                metric="successRate"
                            />
                        </div>

                        {/* Per-Scene Historical Comparison */}
                        {artifact.Scenes && artifact.Scenes.length > 0 && (
                            <div>
                                <div className="text-gray-500 text-[11px] uppercase tracking-wide mb-3">Per-Scene Historical Metrics</div>
                                <div className="space-y-3">
                                    {artifact.Scenes.map((scene: ArtifactSceneMetadata) => {
                                        const sceneHistory = historicalRuns
                                            .flatMap((run) => run.scenes || [])
                                            .filter((s) => s.sceneId === scene.SceneId);

                                        if (sceneHistory.length === 0) {
                                            return null;
                                        }

                                        const avgDuration =
                                            sceneHistory.reduce((sum, s) => sum + (s.durationMs || 0), 0) / sceneHistory.length;
                                        const currentDuration = (scene.Telemetry as { durationMs?: number } | undefined)?.durationMs;
                                        const delta = currentDuration ? currentDuration - avgDuration : null;

                                        return (
                                            <div
                                                key={scene.SceneId}
                                                className="px-3 py-2 bg-gray-800 rounded text-[11px] text-gray-300"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-semibold text-gray-200">{scene.SceneId}</span>
                                                    {delta !== null && (
                                                        <span
                                                            className={`${
                                                                delta < 0
                                                                    ? 'text-emerald-400'
                                                                    : delta > 0
                                                                      ? 'text-amber-400'
                                                                      : 'text-gray-400'
                                                            }`}
                                                        >
                                                            {delta < 0 ? '📈' : delta > 0 ? '📉' : '➡️'}{' '}
                                                            {Math.abs(delta).toFixed(0)}ms
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-gray-400">
                                                    Current: {currentDuration?.toFixed(0)}ms | Avg: {avgDuration.toFixed(0)}ms | History:
                                                    {sceneHistory.length} runs
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </details>
            )}
            
            </div>{/* End collapsible sections */}
        </section>
    );
};

export default ArtifactViewer;
