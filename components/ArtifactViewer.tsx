import { useState, useMemo } from 'react';
import { useArtifactMetadata, type ArtifactMetadata, type ArtifactSceneMetadata, type StoryLLMMetadata } from '../utils/hooks';

type ArtifactScene = ArtifactSceneMetadata;

const formatVramValue = (value?: number | string | null): string => {
    if (value == null) return 'n/a';
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(numeric)) return 'n/a';
    return `${Math.round(numeric / 1048576)}MB`;
};

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

const ArtifactViewer: React.FC = () => {
    const { artifact, error, loading, refresh } = useArtifactMetadata();
    const [showWarningsOnly, setShowWarningsOnly] = useState(false);
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
    const historyAttemptsLabel =
        queuePolicy && queuePolicy.HistoryMaxAttempts && queuePolicy.HistoryMaxAttempts > 0
            ? queuePolicy.HistoryMaxAttempts
            : 'unbounded';

    return (
        <section className="mt-6 bg-gray-900 border border-emerald-500/20 rounded-2xl p-5 shadow-xl shadow-emerald-900/10 text-sm text-gray-200 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-300">Latest artifact snapshot</p>
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
                        {showWarningsOnly ? 'Show all scenes' : 'Show warnings only'}
                    </button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Logline</p>
                    <p className="text-sm text-gray-100">{artifact.Story.Logline}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Director's vision</p>
                    <p className="text-sm text-gray-100">{artifact.Story.DirectorsVision}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">LLM status</p>
                    {storyLLM ? (
                        <div className="text-sm text-gray-200 space-y-0.5">
                            <p className="text-emerald-300 font-semibold">{storyLLM.status ?? 'unknown'}</p>
                            {storyLLM.providerUrl && <p className="text-[11px] text-gray-400 truncate">{storyLLM.providerUrl}</p>}
                            <p className="text-[11px] text-gray-500">
                                seed: {storyLLM.seed ?? 'n/a'} · duration: {storyLLM.durationMs ? `${storyLLM.durationMs}ms` : 'n/a'}
                            </p>
                            {storyLLM.error && <p className="text-[11px] text-amber-300">error: {storyLLM.error}</p>}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">No LLM metadata</p>
                    )}
                </div>
            </div>
            {artifact.Story.Warnings && artifact.Story.Warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-400/30 rounded-lg p-3 text-xs text-amber-100 space-y-1">
                    {artifact.Story.Warnings.map((warning) => (
                        <p key={warning}>⚠ {warning}</p>
                    ))}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-gray-950/60 border border-emerald-500/30 rounded-lg p-4 space-y-1 text-xs text-gray-300">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-300">Queue policy</p>
                    <div className="text-sm text-gray-100">Scene retry budget: {queuePolicy?.SceneRetryBudget ?? 'n/a'}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                        <div>History wait: {queuePolicy?.HistoryMaxWaitSeconds ?? 'n/a'}s</div>
                        <div>Poll interval: {queuePolicy?.HistoryPollIntervalSeconds ?? 'n/a'}s</div>
                        <div>History attempts: {historyAttemptsLabel}</div>
                        <div>Post-exec timeout: {queuePolicy?.PostExecutionTimeoutSeconds ?? 'n/a'}s</div>
                    </div>
                </div>
                <div className="bg-gray-950/60 border border-cyan-500/30 rounded-lg p-4 space-y-1 text-xs text-gray-300">
                    <p className="text-[11px] uppercase tracking-wide text-cyan-300">LLM & run artifacts</p>
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
                        <div className="space-y-1 text-[11px]">
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
                                    Endpoint:&nbsp;
                                    <span className="text-gray-100">{artifact.Story.HealthCheck.Url}</span>
                                </div>
                            )}
                            {artifact.Story.HealthCheck.Override && (
                                <div className="text-gray-400">
                                    Override: <span className="text-gray-100">{artifact.Story.HealthCheck.Override}</span>
                                </div>
                            )}
                            {artifact.Story.HealthCheck.Models != null && (
                                <div className="text-gray-400">Models: {artifact.Story.HealthCheck.Models}</div>
                            )}
                            {artifact.Story.HealthCheck.SkipReason && (
                                <div className="text-gray-400">Skip reason: {artifact.Story.HealthCheck.SkipReason}</div>
                            )}
                            {artifact.Story.HealthCheck.Error && (
                                <div className="text-amber-300 text-[11px]">Health error: {artifact.Story.HealthCheck.Error}</div>
                            )}
                        </div>
                    )}
                    <div className="text-[11px] text-gray-500">
                        Run: {artifact.RunId}
                    </div>
                    <div className="text-[11px] text-gray-500">
                        Directory: {artifact.RunDir}
                    </div>
                    <div className="text-[11px] text-gray-500">
                        Archive: {artifact.Archive}
                    </div>
                    {artifact.Story.StoryDir && (
                        <div className="text-[11px] text-gray-500">Story dir: {artifact.Story.StoryDir}</div>
                    )}
                </div>
            </div>

            <div className="overflow-auto text-xs">
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
                            const fallbackNotes = scene.Telemetry?.System?.FallbackNotes?.filter(Boolean) ?? [];
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
                                    <td className="px-2 py-1 text-xs text-gray-300 space-y-1">
                                        {telemetrySummary.length > 0 ? (
                                            telemetrySummary.map((line, index) => (
                                                <div key={`${scene.SceneId}-telemetry-${index}`}>{line}</div>
                                            ))
                                        ) : (
                                            <div className="text-gray-500">n/a</div>
                                        )}
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

            <div className="space-y-3 text-xs text-gray-300">
                {artifact.Scenes.map((scene) => (
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
                                <div className="text-gray-400 space-y-0.5">
                                    <span className="text-gray-500 block">Telemetry</span>
                                    <div>Duration: {scene.Telemetry.DurationSeconds?.toFixed(1) ?? 'n/a'}s</div>
                                    {scene.Telemetry.GPU?.Name && (
                                        <div>
                                            GPU: {scene.Telemetry.GPU.Name}
                                            {scene.Telemetry.GPU.VramTotal != null && (
                                                <span className="text-gray-500"> · total {formatVramValue(scene.Telemetry.GPU.VramTotal)}</span>
                                            )}
                                        </div>
                                    )}
                                    {scene.Telemetry.GPU?.VramFreeBefore != null && (
                                        <div>
                                            VRAM free: {formatVramValue(scene.Telemetry.GPU.VramFreeBefore)} / {formatVramValue(scene.Telemetry.GPU.VramFreeAfter)}
                                        </div>
                                    )}
                                    {scene.Telemetry.GPU?.VramDelta != null && (
                                        <div>VRAM delta: {formatVramDelta(scene.Telemetry.GPU.VramDelta)}</div>
                                    )}
                                    {scene.Telemetry.QueueStart && (
                                        <div>Queue start: {new Date(scene.Telemetry.QueueStart).toLocaleTimeString()}</div>
                                    )}
                                    {scene.Telemetry.QueueEnd && (
                                        <div>Queue end: {new Date(scene.Telemetry.QueueEnd).toLocaleTimeString()}</div>
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
                        </div>
                    </details>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-xs text-gray-400">
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
        </section>
    );
};

export default ArtifactViewer;
