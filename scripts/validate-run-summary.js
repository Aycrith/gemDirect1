import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HISTORY_EXIT_REASONS = new Set(['success', 'maxWait', 'attemptLimit', 'postExecution', 'unknown']);

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatResult(errors, warnings) {
    const status = errors.length > 0 ? 1 : 0;
    const lines = [];
    if (status === 1) {
        lines.push('run-summary validation: FAIL');
        for (const error of errors) {
            lines.push(`ERROR: ${error}`);
        }
    } else {
        lines.push('run-summary validation: PASS');
    }
    for (const warning of warnings) {
        lines.push(`WARNING: ${warning}`);
    }
    return {
        status,
        stdout: lines.join(os.EOL),
        stderr: '',
    };
}

function requireInt(value) {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return null;
}

export function runValidation(runDir) {
    const errors = [];
    const warnings = [];
    const summaryPath = path.join(runDir, 'run-summary.txt');
    let text = '';
    if (!fs.existsSync(summaryPath)) {
        errors.push(`run-summary.txt not found at ${summaryPath}`);
    } else {
        text = fs.readFileSync(summaryPath, 'utf8');
    }

    if (text) {
        if (!text.includes('Story ready:')) {
            errors.push("Missing 'Story ready:' line in run-summary.txt");
        }
        if (!text.includes('Story logline:')) {
            errors.push("Missing 'Story logline:' line in run-summary.txt");
        }
        if (!/\[Scene\s+scene-/.test(text)) {
            errors.push("No '[Scene ' entries found in run-summary.txt");
        }
        if (!text.includes('Vitest comfyUI exitCode=')) {
            errors.push("Missing 'Vitest comfyUI exitCode' entry in run-summary.txt");
        }
        if (!text.includes('Vitest e2e exitCode=')) {
            errors.push("Missing 'Vitest e2e exitCode' entry in run-summary.txt");
        }
        if (!text.includes('Vitest scripts exitCode=')) {
            errors.push("Missing 'Vitest scripts exitCode' entry in run-summary.txt");
        }
        if (!text.includes('## Artifact Index')) {
            errors.push("Missing '## Artifact Index' block in run-summary.txt");
        }
        const totalFramesMatch = text.match(/Total frames copied:\s*(\d+)/);
        if (totalFramesMatch) {
            const totalFrames = Number(totalFramesMatch[1]);
            if (totalFrames === 0) {
                errors.push("Total frames copied reported as 0. Expected > 0 for a successful run.");
            }
        } else {
            errors.push("Missing 'Total frames copied' entry in run-summary.txt");
        }
    }

    const artifactPath = path.join(runDir, 'artifact-metadata.json');
    let artifact;
    if (!fs.existsSync(artifactPath)) {
        errors.push('Missing artifact-metadata.json in run directory.');
    } else {
        try {
            artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        } catch (err) {
            errors.push(`Failed to parse artifact metadata: ${err.message}`);
        }
    }

    if (artifact) {
        if (!artifact.Story || !artifact.Story.Id) {
            errors.push('Artifact metadata story id is missing.');
        }
        if (!artifact.Scenes || !Array.isArray(artifact.Scenes) || artifact.Scenes.length === 0) {
            errors.push('Artifact metadata does not list any scenes.');
        }
        if (
            !artifact.VitestLogs ||
            !artifact.VitestLogs.ComfyUI ||
            !artifact.VitestLogs.E2E ||
            !artifact.VitestLogs.Scripts
        ) {
            errors.push('Artifact metadata missing Vitest log paths.');
        }

        if (!artifact.QueueConfig) {
            errors.push('Artifact metadata missing QueueConfig.');
        } else {
            if (!('SceneRetryBudget' in artifact.QueueConfig)) {
                errors.push('QueueConfig missing SceneRetryBudget.');
            }
            const queuePattern = /Queue policy:\s*sceneRetries=(\d+),\s*historyMaxWait=(\d+)s,\s*historyPollInterval=(\d+)s,\s*historyMaxAttempts=(\d+|unbounded),\s*postExecutionTimeout=(\d+)s/;
            const queueMatch = text.match(queuePattern);
            if (!queueMatch) {
                errors.push('Run summary missing Queue policy line.');
            } else {
                const [, sceneRetries, historyMaxWait, historyPollInterval, historyMaxAttempts, postExecutionTimeout] = queueMatch;
                const parsedSceneRetries = Number(sceneRetries);
                if (artifact.QueueConfig.SceneRetryBudget !== parsedSceneRetries) {
                    errors.push(
                        `Queue policy sceneRetries (${parsedSceneRetries}) does not match QueueConfig (${artifact.QueueConfig.SceneRetryBudget}).`
                    );
                }
                const parsedHistoryWait = Number(historyMaxWait);
                if (artifact.QueueConfig.HistoryMaxWaitSeconds !== parsedHistoryWait) {
                    errors.push(
                        `Queue policy historyMaxWait (${parsedHistoryWait}) does not match QueueConfig (${artifact.QueueConfig.HistoryMaxWaitSeconds}).`
                    );
                }
                const parsedPollInterval = Number(historyPollInterval);
                if (artifact.QueueConfig.HistoryPollIntervalSeconds !== parsedPollInterval) {
                    errors.push(
                        `Queue policy historyPollInterval (${parsedPollInterval}) does not match QueueConfig (${artifact.QueueConfig.HistoryPollIntervalSeconds}).`
                    );
                }
                if (historyMaxAttempts === 'unbounded') {
                    if (artifact.QueueConfig.HistoryMaxAttempts !== 0) {
                        errors.push(
                            `Queue policy historyMaxAttempts 'unbounded' does not match QueueConfig (${artifact.QueueConfig.HistoryMaxAttempts}).`
                        );
                    }
                } else if (Number(historyMaxAttempts) !== artifact.QueueConfig.HistoryMaxAttempts) {
                    errors.push(
                        `Queue policy historyMaxAttempts (${historyMaxAttempts}) does not match QueueConfig (${artifact.QueueConfig.HistoryMaxAttempts}).`
                    );
                }
                const parsedPostExec = Number(postExecutionTimeout);
                if (artifact.QueueConfig.PostExecutionTimeoutSeconds !== parsedPostExec) {
                    errors.push(
                        `Queue policy postExecutionTimeout (${parsedPostExec}) does not match QueueConfig (${artifact.QueueConfig.PostExecutionTimeoutSeconds}).`
                    );
                }
            }
        }

        if (artifact.Scenes && Array.isArray(artifact.Scenes)) {
            for (const scene of artifact.Scenes) {
                const sceneId = scene.SceneId;
                if (!sceneId) {
                    continue;
                }
                const escapedSceneId = escapeRegex(sceneId);
                const scenePattern = new RegExp(`\\[Scene\\s+${escapedSceneId}`);
                if (!scenePattern.test(text)) {
                    warnings.push(`Summary missing main line for ${sceneId}`);
                }
                if (scene.MeetsFrameFloor === false) {
                    const frameWarnPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*WARNING: Frame count below floor`);
                    if (!frameWarnPattern.test(text)) {
                        errors.push(`Scene ${sceneId} fell below frame floor but summary lacks WARNING line.`);
                    }
                }
                const historyNeedsLine = scene.HistoryRetrieved === false || (scene.HistoryErrors && scene.HistoryErrors.length > 0);
                if (historyNeedsLine) {
                    const historyPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*HISTORY`);
                    if (!historyPattern.test(text)) {
                        errors.push(`Scene ${sceneId} had history issues but no HISTORY WARNING/ERROR entry.`);
                    }
                }
                if (scene.Success === false) {
                    const errorPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*ERROR`);
                    if (!errorPattern.test(text)) {
                        errors.push(`Scene ${sceneId} failed but summary lacks ERROR line.`);
                    }
                }
                if (!('SceneRetryBudget' in scene)) {
                    errors.push(`Scene ${sceneId} metadata missing SceneRetryBudget.`);
                }
                if (!scene.Telemetry) {
                    errors.push(`Scene ${sceneId} telemetry payload missing from artifact metadata.`);
                    continue;
                }

                const telemetryPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*Telemetry:`);
                if (!telemetryPattern.test(text)) {
                    errors.push(`Scene ${sceneId} telemetry missing from run-summary.`);
                }
                const requiredTelemetryProps = [
                    'DurationSeconds',
                    'MaxWaitSeconds',
                    'PollIntervalSeconds',
                    'HistoryAttempts',
                    'HistoryAttemptLimit',
                    'PostExecutionTimeoutSeconds',
                    'HistoryExitReason',
                ];
                for (const prop of requiredTelemetryProps) {
                    if (scene.Telemetry[prop] === undefined || scene.Telemetry[prop] === null) {
                        errors.push(`Scene ${sceneId} telemetry missing ${prop}.`);
                    }
                }
                if (scene.Telemetry.HistoryExitReason && !HISTORY_EXIT_REASONS.has(scene.Telemetry.HistoryExitReason)) {
                    errors.push(
                        `Scene ${sceneId} telemetry HistoryExitReason '${scene.Telemetry.HistoryExitReason}' is not a recognized value (expected: success, maxWait, attemptLimit, postExecution, or unknown).`
                    );
                }
                const requiredProps = [
                    'HistoryPostExecutionTimeoutReached',
                    'ExecutionSuccessDetected',
                    'ExecutionSuccessAt',
                    'SceneRetryBudget',
                    'DoneMarkerWaitSeconds',
                    'DoneMarkerDetected',
                    'ForcedCopyTriggered',
                    'ForcedCopyDebugPath',
                ];
                for (const prop of requiredProps) {
                    if (scene.Telemetry[prop] === undefined) {
                        errors.push(`Scene ${sceneId} telemetry missing ${prop}.`);
                    }
                }
                if (scene.Telemetry.ExecutionSuccessDetected && !scene.Telemetry.ExecutionSuccessAt) {
                    errors.push(`Scene ${sceneId} telemetry signals ExecutionSuccessDetected but lacks ExecutionSuccessAt.`);
                }

                const pollLimitPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*Telemetry:.*pollLimit=([^|\\s]+)`);
                const pollMatch = text.match(pollLimitPattern);
                if (!pollMatch) {
                    errors.push(`Scene ${sceneId} telemetry summary missing pollLimit entry.`);
                } else {
                    const reported = pollMatch[1];
                    const expected =
                        typeof scene.Telemetry.HistoryAttemptLimit === 'number' && scene.Telemetry.HistoryAttemptLimit > 0
                            ? scene.Telemetry.HistoryAttemptLimit.toString()
                            : 'unbounded';
                    if (reported !== expected) {
                        errors.push(`Scene ${sceneId} telemetry pollLimit (${reported}) does not match metadata (${expected}).`);
                    }
                }

                const retryPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*SceneRetryBudget=([^|\\s]+)`);
                const retryMatch = text.match(retryPattern);
                if (!retryMatch) {
                    errors.push(`Scene ${sceneId} telemetry summary missing SceneRetryBudget entry.`);
                } else {
                    const reported = retryMatch[1];
                    const expected =
                        typeof scene.Telemetry.SceneRetryBudget === 'number' && scene.Telemetry.SceneRetryBudget > 0
                            ? scene.Telemetry.SceneRetryBudget.toString()
                            : 'unbounded';
                    if (reported !== expected) {
                        errors.push(`Scene ${sceneId} telemetry SceneRetryBudget (${reported}) does not match metadata (${expected}).`);
                    }
                }

                if (!scene.Telemetry.GPU || !scene.Telemetry.GPU.Name || String(scene.Telemetry.GPU.Name).trim().length === 0) {
                    errors.push(`Scene ${sceneId} telemetry missing GPU name.`);
                } else {
                    const gpu = scene.Telemetry.GPU;
                    const checkGpuProp = (prop, message) => {
                        if (gpu[prop] === undefined || gpu[prop] === null) {
                            errors.push(`Scene ${sceneId} telemetry GPU missing ${message}.`);
                        }
                    };
                    checkGpuProp('VramBeforeMB', 'VramBeforeMB (converted MB value)');
                    checkGpuProp('VramAfterMB', 'VramAfterMB (converted MB value)');
                    checkGpuProp('VramDeltaMB', 'VramDeltaMB (delta in MB)');
                    if (
                        typeof gpu.VramBeforeMB === 'number' &&
                        typeof gpu.VramAfterMB === 'number' &&
                        typeof gpu.VramDeltaMB === 'number'
                    ) {
                        const expectedDelta = gpu.VramAfterMB - gpu.VramBeforeMB;
                        const discrepancy = Math.abs(gpu.VramDeltaMB - expectedDelta);
                        if (discrepancy > 0.01) {
                            errors.push(
                                `Scene ${sceneId} telemetry GPU VramDeltaMB (${gpu.VramDeltaMB}) does not match VramAfterMB - VramBeforeMB (${expectedDelta.toFixed(
                                    3
                                )}).`
                            );
                        }
                    }
                }

                if (!scene.Telemetry.System) {
                    errors.push(`Scene ${sceneId} telemetry missing System diagnostics.`);
                } else if (!('FallbackNotes' in scene.Telemetry.System)) {
                    errors.push(`Scene ${sceneId} telemetry System diagnostics missing FallbackNotes entry.`);
                } else {
                    const fallbackNotes = Array.isArray(scene.Telemetry.System.FallbackNotes)
                        ? scene.Telemetry.System.FallbackNotes
                        : [];
                    for (const note of fallbackNotes) {
                        const escapedNote = escapeRegex(note);
                        const fallbackPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*${escapedNote}`);
                        if (!fallbackPattern.test(text)) {
                            errors.push(`Scene ${sceneId} telemetry fallback note '${note}' missing from run-summary.`);
                        }
                    }
                    const doneMarkerPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*DoneMarkerWaitSeconds=([\\d\\.]+)s`);
                    const doneMarkerMatch = text.match(doneMarkerPattern);
                    if (!doneMarkerMatch) {
                        errors.push(`Scene ${sceneId} telemetry summary missing DoneMarkerWaitSeconds entry.`);
                    } else {
                        const reportedDone = Number(doneMarkerMatch[1]);
                        const expectedDone = typeof scene.Telemetry.DoneMarkerWaitSeconds === 'number'
                            ? scene.Telemetry.DoneMarkerWaitSeconds
                            : null;
                        if (expectedDone !== null && Math.abs(reportedDone - expectedDone) > 0.1) {
                            errors.push(
                                `Scene ${sceneId} telemetry DoneMarkerWaitSeconds summary (${reportedDone}) does not match metadata (${expectedDone}).`
                            );
                        }
                    }
                    const doneMarkerDetectedPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*DoneMarkerDetected=(true|false)`);
                    if (!doneMarkerDetectedPattern.test(text)) {
                        errors.push(`Scene ${sceneId} telemetry summary missing DoneMarkerDetected entry.`);
                    }
                    const forcedCopyPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*ForcedCopyTriggered=(true|false)`);
                    if (!forcedCopyPattern.test(text)) {
                        errors.push(`Scene ${sceneId} telemetry summary missing ForcedCopyTriggered entry.`);
                    }
                    if (scene.Telemetry.ForcedCopyTriggered && scene.Telemetry.ForcedCopyDebugPath) {
                        const forcedCopyDebugPattern = new RegExp(
                            `\\[Scene\\s+${escapedSceneId}].*ForcedCopyDebugPath=`
                        );
                        if (!forcedCopyDebugPattern.test(text)) {
                            errors.push(`Scene ${sceneId} telemetry triggered forced copy but summary lacks ForcedCopyDebugPath.`);
                        }
                    }
                }

                const vramBeforePattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*VRAMBeforeMB=([^|\\s]+)MB`);
                if (scene.Telemetry.GPU && typeof scene.Telemetry.GPU.VramBeforeMB === 'number') {
                    if (!vramBeforePattern.test(text)) {
                        errors.push(`Scene ${sceneId} telemetry summary missing VRAMBeforeMB entry.`);
                    }
                }
                const vramAfterPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*VRAMAfterMB=([^|\\s]+)MB`);
                if (scene.Telemetry.GPU && typeof scene.Telemetry.GPU.VramAfterMB === 'number') {
                    if (!vramAfterPattern.test(text)) {
                        errors.push(`Scene ${sceneId} telemetry summary missing VRAMAfterMB entry.`);
                    }
                }
                const vramDeltaPattern = new RegExp(`\\[Scene\\s+${escapedSceneId}].*VRAMDeltaMB=([^|\\s]+)MB`);
                if (scene.Telemetry.GPU && typeof scene.Telemetry.GPU.VramDeltaMB === 'number') {
                    if (!vramDeltaPattern.test(text)) {
                        errors.push(`Scene ${sceneId} telemetry summary missing VRAMDeltaMB entry.`);
                    }
                }
            }
        }
    }

    return formatResult(errors, warnings);
}

function parseCommandLine() {
    const args = process.argv.slice(2);
    const runDirIndex = args.findIndex((arg) => arg === '-RunDir');
    if (runDirIndex === -1 || args.length <= runDirIndex + 1) {
        console.error('RunDir is required. Example: -RunDir C:\\Dev\\gemDirect1\\logs\\20251111-122115');
        process.exit(2);
    }
    const runDir = args[runDirIndex + 1];
    const result = runValidation(runDir);
    if (result.stdout) {
        console.log(result.stdout);
    }
    process.exit(result.status);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'validate-run-summary.js') {
    parseCommandLine();
}
