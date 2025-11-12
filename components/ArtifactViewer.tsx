import { useState, useMemo } from 'react';
import { useArtifactMetadata, type ArtifactMetadata, type ArtifactSceneMetadata } from '../utils/hooks';

type ArtifactScene = ArtifactSceneMetadata;
type StoryLLMMetadata = {
    status?: string;
    providerUrl?: string;
    seed?: string;
    durationMs?: number;
    error?: string;
};

const buildTelemetrySummary = (scene: ArtifactScene): string[] => {
    if (!scene.Telemetry) {
        return [];
    }
    const summary: string[] = [];
    if (typeof scene.Telemetry.DurationSeconds === 'number') {
        summary.push(`duration ${scene.Telemetry.DurationSeconds.toFixed(1)}s`);
    }
    if (scene.Telemetry.HistoryAttempts) {
        summary.push(`${scene.Telemetry.HistoryAttempts} polls`);
    }
    if (scene.Telemetry.GPU?.Name) {
        const vramBefore = scene.Telemetry.GPU.VramFreeBefore ?? 'n/a';
        const vramAfter = scene.Telemetry.GPU.VramFreeAfter ?? 'n/a';
        summary.push(`${scene.Telemetry.GPU.Name} VRAM ${vramBefore}/${vramAfter}`);
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
                <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Run details</p>
                    <p className="text-sm text-gray-100">{artifact.RunId}</p>
                    <p className="text-xs text-gray-500">Directory: {artifact.RunDir}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Archive</p>
                    <p className="text-sm text-gray-100 truncate">{artifact.Archive}</p>
                    {artifact.Story.StoryDir && <p className="text-xs text-gray-500">Story dir: {artifact.Story.StoryDir}</p>}
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
                                        {scene.HistoryAttempts && (
                                            <div className="text-[11px] text-gray-500">{scene.HistoryAttempts} poll attempts</div>
                                        )}
                                    </td>
                                    <td className="px-2 py-1 text-xs text-gray-300 space-y-1">
                                        {telemetrySummary.length > 0 ? (
                                            telemetrySummary.map((line) => (
                                                <div key={line}>{line}</div>
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
                                        <div>GPU: {scene.Telemetry.GPU.Name}</div>
                                    )}
                                    {scene.Telemetry.GPU?.VramFreeBefore && (
                                        <div>VRAM before/after: {scene.Telemetry.GPU.VramFreeBefore}/{scene.Telemetry.GPU.VramFreeAfter ?? 'n/a'}</div>
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
