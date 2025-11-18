import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runValidation } from '../../scripts/validate-run-summary.js';

const projectRoot = path.resolve(__dirname, '..', '..');
const validatorScript = path.resolve(projectRoot, 'scripts', 'validate-run-summary.ps1');
const tempDirs: string[] = [];

const createRunSummary = (includeTelemetryLine: boolean, pollLimitValue = 'unbounded', fallbackNotes: string[] = []) => {
    const fallbackDescriptor = fallbackNotes.length > 0 ? fallbackNotes[0] : null;
    const telemetryLine = includeTelemetryLine
        ? `[12:00:05] [Scene scene-001] Telemetry: DurationSeconds=10s | MaxWaitSeconds=600s | PollIntervalSeconds=2s | HistoryAttempts=3 | pollLimit=${pollLimitValue} | SceneRetryBudget=1 | PostExecutionTimeoutSeconds=30s | ExecutionSuccessDetected=true | ExecutionSuccessAt=12:00:05 | HistoryExitReason=success | VRAMBeforeMB=10240MB | VRAMAfterMB=9664MB | VRAMDeltaMB=-576MB | gpu=NVIDIA GeForce RTX 3090 | DoneMarkerWaitSeconds=0s | DoneMarkerDetected=false | ForcedCopyTriggered=false${fallbackDescriptor ? ` | fallback=${fallbackDescriptor}` : ''}`
        : '';
    const fallbackLines = fallbackNotes.map((note) => `[12:00:04] [Scene scene-001] WARNING: ${note}`);
    return [
        'E2E Story-to-Video Run: test',
        '[12:00:00] Story ready: story-123 (scenes=1)',
        "[12:00:00] Director's vision: Vision",
        '[12:00:00] Story logline: Logline',
        '[12:00:01] Queue policy: sceneRetries=1, historyMaxWait=600s, historyPollInterval=2s, historyMaxAttempts=unbounded, postExecutionTimeout=30s',
        '[12:00:05] [Scene scene-001][Attempt 1] Frames=25 Duration=10s Prefix=gemdirect1_scene-001',
        telemetryLine,
        ...fallbackLines,
        '[12:00:05] Vitest comfyUI exitCode=0',
        '[12:00:05] Vitest e2e exitCode=0',
        '[12:00:05] Vitest scripts exitCode=0',
        '## Artifact Index',
        'Total frames copied: 25',
    ]
        .filter(Boolean)
        .join(os.EOL);
};

const createArtifactMetadata = (includeTelemetry = true, fallbackNotes: string[] = []) => {
    const telemetry = includeTelemetry
        ? {
              DurationSeconds: 10,
              MaxWaitSeconds: 600,
              PollIntervalSeconds: 2,
              HistoryAttempts: 3,
              HistoryAttemptLimit: 0,
              HistoryExitReason: 'success',
              PostExecutionTimeoutSeconds: 30,
              ExecutionSuccessDetected: true,
              ExecutionSuccessAt: new Date('2025-11-12T12:00:05Z').toISOString(),
              HistoryPostExecutionTimeoutReached: false,
              SceneRetryBudget: 1,
              DoneMarkerDetected: false,
              DoneMarkerWaitSeconds: 0,
              DoneMarkerPath: null,
              ForcedCopyTriggered: false,
              ForcedCopyDebugPath: null,
              GPU: {
                  Name: 'NVIDIA GeForce RTX 3090',
                  VramFreeBefore: 10737418240,
                  VramFreeAfter: 10133438464,
                  VramDelta: -603979776,
                  VramBeforeMB: 10240,
                  VramAfterMB: 9664,
                  VramDeltaMB: -576,
              },
              System: {
                  FallbackNotes: fallbackNotes,
              },
          }
        : undefined;
    return {
        RunId: 'test',
        Timestamp: new Date().toISOString(),
        RunDir: 'C:\\Dev\\gemDirect1\\logs\\test',
        Story: {
            Id: 'story-123',
            Logline: 'Logline',
            DirectorsVision: 'Vision',
            Generator: 'local-llm',
            File: 'story.json',
            StoryDir: 'story',
        },
        Scenes: [
            {
                SceneId: 'scene-001',
                Prompt: 'Prompt',
                NegativePrompt: 'neg',
                FrameFloor: 25,
                FrameCount: 25,
                DurationSeconds: 10,
                FramePrefix: 'gemdirect1_scene-001',
                HistoryPath: 'history.json',
                HistoryRetrievedAt: new Date().toISOString(),
                HistoryPollLog: [],
                HistoryErrors: [],
                Success: true,
                MeetsFrameFloor: true,
                HistoryRetrieved: true,
                HistoryAttempts: 3,
                Warnings: [],
                Errors: [],
                AttemptsRun: 1,
                Requeued: false,
                AttemptSummaries: [],
                GeneratedFramesDir: 'frames',
                KeyframeSource: 'keyframe.png',
                Telemetry: telemetry,
                SceneRetryBudget: 1,
            },
        ],
        QueueConfig: {
            SceneRetryBudget: 1,
            HistoryMaxWaitSeconds: 600,
            HistoryPollIntervalSeconds: 2,
            HistoryMaxAttempts: 0,
            PostExecutionTimeoutSeconds: 30,
        },
        LLMHealthInfo: {
            Url: null,
            Status: 'not-requested',
            Models: null,
            Skipped: true,
        },
        VitestLogs: {
            ComfyUI: 'vitest-comfyui.log',
            E2E: 'vitest-e2e.log',
            Scripts: 'vitest-scripts.log',
            ResultsJson: 'vitest-results.json',
        },
        Archive: 'artifact.zip',
    };
};

const runValidator = (runDir: string) => {
    const result = spawnSync('pwsh', ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', validatorScript, '-RunDir', runDir], {
        encoding: 'utf8',
    });
    if (result.error && result.error.code === 'ENOENT') {
        const fallback = runValidation(runDir);
        return {
            status: fallback.status,
            stdout: fallback.stdout,
            stderr: fallback.stderr,
        };
    }
    return result;
};

afterAll(() => {
    tempDirs.forEach((dir) => {
        rmSync(dir, { recursive: true, force: true });
    });
});

describe('validate-run-summary.ps1', () => {
    it('passes when telemetry exists for each scene', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-'));
        tempDirs.push(runDir);
        writeFileSync(path.join(runDir, 'run-summary.txt'), createRunSummary(true), 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/run-summary validation: PASS/);
    }, 20000);

    it('fails when telemetry is missing from artifact metadata', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-missing-'));
        tempDirs.push(runDir);
        writeFileSync(path.join(runDir, 'run-summary.txt'), createRunSummary(false), 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(false), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/Scene scene-001 telemetry payload missing/);
    });

    it('fails when pollLimit text does not match metadata', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-poll-'));
        tempDirs.push(runDir);
        writeFileSync(path.join(runDir, 'run-summary.txt'), createRunSummary(true, '10'), 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/telemetry pollLimit.*does not match metadata/);
    });
    it('fails when fallback notes lack matching warnings in run-summary', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-fallback-'));
        tempDirs.push(runDir);
        const fallback = ['nvidia-smi fallback triggered'];
        writeFileSync(path.join(runDir, 'run-summary.txt'), createRunSummary(true), 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true, fallback), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/telemetry fallback note 'nvidia-smi fallback triggered' missing from run-summary/);
    });
    it('passes when fallback warnings are logged alongside metadata notes', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-fallback-pass-'));
        tempDirs.push(runDir);
        const fallback = ['nvidia-smi fallback triggered'];
        writeFileSync(path.join(runDir, 'run-summary.txt'), createRunSummary(true, 'unbounded', fallback), 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true, fallback), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/run-summary validation: PASS/);
    });
    it('fails when SceneRetryBudget text does not match metadata', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-retry-'));
        tempDirs.push(runDir);
        const mismatchedSummary = createRunSummary(true).replace('SceneRetryBudget=1', 'SceneRetryBudget=2');
        writeFileSync(path.join(runDir, 'run-summary.txt'), mismatchedSummary, 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/Scene scene-001 telemetry SceneRetryBudget.*does not match metadata/);
    });
    it('fails when VRAMBeforeMB entry is missing from telemetry summary', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-vram-'));
        tempDirs.push(runDir);
        const modifiedSummary = createRunSummary(true).replace('VRAMBeforeMB=10240MB | ', '');
        writeFileSync(path.join(runDir, 'run-summary.txt'), modifiedSummary, 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/Scene scene-001 telemetry summary missing VRAMBeforeMB entry/);
    });

    it('fails when reported VRAM delta differs from MB before/after difference', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-vram-delta-'));
        tempDirs.push(runDir);
        writeFileSync(path.join(runDir, 'run-summary.txt'), createRunSummary(true), 'utf8');
        const metadata = createArtifactMetadata(true);
        const sceneTelemetry = metadata.Scenes[0].Telemetry!;
        sceneTelemetry.GPU.VramDeltaMB = -500;
        sceneTelemetry.GPU.VramDelta = sceneTelemetry.GPU.VramDeltaMB * 1048576;
        writeFileSync(path.join(runDir, 'artifact-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/telemetry GPU VramDeltaMB .* does not match VramAfterMB - VramBeforeMB/);
    });
    it('fails when queue policy values do not match metadata', () => {
        const runDir = mkdtempSync(path.join(os.tmpdir(), 'validate-run-queue-'));
        tempDirs.push(runDir);
        const mismatchedSummary = createRunSummary(true).replace('sceneRetries=1', 'sceneRetries=2');
        writeFileSync(path.join(runDir, 'run-summary.txt'), mismatchedSummary, 'utf8');
        writeFileSync(
            path.join(runDir, 'artifact-metadata.json'),
            JSON.stringify(createArtifactMetadata(true), null, 2),
            'utf8',
        );

        const result = runValidator(runDir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/Queue policy sceneRetries.*does not match QueueConfig/);
    });
});
