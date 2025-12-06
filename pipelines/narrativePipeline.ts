/**
 * Narrative Pipeline
 * 
 * Multi-shot pipeline that orchestrates:
 * 1. Parsing a narrative script
 * 2. Generating videos for each shot (using per-shot pipeline configs)
 * 3. Running QA and benchmarks per shot
 * 4. Writing manifests per shot
 * 5. Concatenating shot videos into a final narrative video
 * 
 * Part of N1 - Story-to-Shot Narrative Pipeline (first pass)
 * 
 * @module pipelines/narrativePipeline
 */

import * as path from 'path';
import * as fs from 'fs';
import type {
    PipelineDefinition,
    PipelineStep,
    PipelineStepContext,
    PipelineStepResult,
} from '../services/pipelineOrchestrator';
import type {
    NarrativeScript,
    NarrativeShotRef,
    NarrativeRunContext,
    NarrativeRunSummary,
    NarrativeShotMetrics,
    QAVerdict,
    ShotQASummary,
    NarrativeQASummary,
} from '../types/narrativeScript';
import { isNarrativeScript } from '../types/narrativeScript';
import { 
    WARNING_MARGIN, 
    DEFAULT_COHERENCE_THRESHOLDS,
} from '../services/visionThresholdConfig';

// ============================================================================
// Constants
// ============================================================================

/** Default output directory for narrative runs */
export const NARRATIVE_OUTPUT_DIR = 'output/narratives';

/** Default data directory for narrative summaries */
export const NARRATIVE_DATA_DIR = 'data/narratives';

/** Default reports directory */
export const NARRATIVE_REPORTS_DIR = 'reports';

/** Default sample ID when not specified */
export const DEFAULT_SAMPLE_ID = 'sample-001-geometric';

// ============================================================================
// QA Verdict Computation (N2)
// ============================================================================

/**
 * Threshold configuration for shot-level QA verdict calculation.
 * These are derived from visionThresholdConfig and benchmark heuristics.
 * 
 * Vision QA thresholds use globalDefaults from vision-thresholds.json:
 * - minOverall: 80, minFocusStability: 85, maxArtifactSeverity: 40, minObjectConsistency: 85
 * 
 * Benchmark metric thresholds are soft heuristics (WARN not hard FAIL):
 * - flickerFrameCount: >5 → WARN, >15 → FAIL (relative to typical 60-90 frame videos)
 * - jitterScore: >20 → WARN, >40 → FAIL (lower is better)
 * - identityScore: <70 → WARN, <50 → FAIL (0-100, higher is better)
 * 
 * Camera path thresholds are informational signals:
 * - pathAdherenceMeanError: >0.15 → WARN, >0.30 → FAIL (normalized units)
 * - pathDirectionConsistency: <0.5 → WARN, <0.2 → FAIL (0-1, higher is better)
 */
const QA_THRESHOLDS = {
    // Vision QA (aligned with DEFAULT_COHERENCE_THRESHOLDS)
    vision: {
        minOverall: DEFAULT_COHERENCE_THRESHOLDS.minOverall,       // 80
        minFocusStability: DEFAULT_COHERENCE_THRESHOLDS.minFocusStability, // 85
        maxArtifactSeverity: DEFAULT_COHERENCE_THRESHOLDS.maxArtifactSeverity, // 40
        minObjectConsistency: DEFAULT_COHERENCE_THRESHOLDS.minObjectConsistency, // 85
    },
    // Benchmark temporal metrics (soft heuristics)
    benchmark: {
        flickerWarn: 5,
        flickerFail: 15,
        jitterWarn: 20,
        jitterFail: 40,
        identityWarn: 70,
        identityFail: 50,
        overallQualityWarn: 65,
        overallQualityFail: 45,
    },
    // Camera path adherence (informational)
    cameraPath: {
        adherenceWarn: 0.15,
        adherenceFail: 0.30,
        directionWarn: 0.5,
        directionFail: 0.2,
    },
    // Warning margin (consistent with visionThresholdConfig)
    warnMargin: WARNING_MARGIN,
};

/**
 * Compute QA verdict for a single shot based on its metrics.
 * 
 * Semantics (aligned with QA_SEMANTICS.md):
 * - FAIL: Any hard failure (Vision QA fail, extreme flicker/jitter, low identity)
 * - WARN: Passing but within warning zone (marginal Vision QA, mild issues)
 * - PASS: All metrics comfortable above thresholds
 * 
 * Vision QA is the primary signal; benchmark/camera metrics are secondary.
 * 
 * @param _shotId Shot identifier (reserved for future logging/tracing)
 * @param metrics Shot metrics from benchmark and Vision QA
 * @returns Object with verdict and array of human-readable reasons
 */
export function computeShotQAVerdict(
    _shotId: string,
    metrics: ShotQASummary['metrics']
): { verdict: QAVerdict; reasons: string[] } {
    const reasons: string[] = [];
    let hasFail = false;
    let hasWarn = false;

    // ---- Vision QA (primary signal) ----
    // Check Vision QA status first if available
    if (metrics.visionStatus) {
        const status = metrics.visionStatus.toUpperCase();
        if (status === 'FAIL') {
            hasFail = true;
            reasons.push('Vision QA: FAIL');
        } else if (status === 'WARN') {
            hasWarn = true;
            reasons.push('Vision QA: marginal');
        }
    }

    // Check Vision QA overall score
    if (metrics.visionOverall !== undefined) {
        const threshold = QA_THRESHOLDS.vision.minOverall;
        const margin = QA_THRESHOLDS.warnMargin;
        if (metrics.visionOverall < threshold) {
            hasFail = true;
            reasons.push(`Vision overall: ${metrics.visionOverall} (< ${threshold})`);
        } else if (metrics.visionOverall < threshold + margin) {
            hasWarn = true;
            reasons.push(`Vision overall: ${metrics.visionOverall} (marginal)`);
        }
    }

    // Check Vision artifacts (if high severity → problem)
    if (metrics.visionArtifacts !== undefined) {
        const threshold = QA_THRESHOLDS.vision.maxArtifactSeverity;
        const margin = QA_THRESHOLDS.warnMargin;
        if (metrics.visionArtifacts > threshold) {
            hasFail = true;
            reasons.push(`Vision artifacts: ${metrics.visionArtifacts} (> ${threshold})`);
        } else if (metrics.visionArtifacts > threshold - margin) {
            hasWarn = true;
            reasons.push(`Vision artifacts: ${metrics.visionArtifacts} (marginal)`);
        }
    }

    // ---- Benchmark metrics (secondary signals) ----
    // Flicker frame count
    if (metrics.flickerFrameCount !== undefined) {
        if (metrics.flickerFrameCount > QA_THRESHOLDS.benchmark.flickerFail) {
            hasFail = true;
            reasons.push(`High flicker: ${metrics.flickerFrameCount} frames`);
        } else if (metrics.flickerFrameCount > QA_THRESHOLDS.benchmark.flickerWarn) {
            hasWarn = true;
            reasons.push(`Mild flicker: ${metrics.flickerFrameCount} frames`);
        }
    }

    // Jitter score
    if (metrics.jitterScore !== undefined) {
        if (metrics.jitterScore > QA_THRESHOLDS.benchmark.jitterFail) {
            hasFail = true;
            reasons.push(`High jitter: ${metrics.jitterScore.toFixed(1)}`);
        } else if (metrics.jitterScore > QA_THRESHOLDS.benchmark.jitterWarn) {
            hasWarn = true;
            reasons.push(`Mild jitter: ${metrics.jitterScore.toFixed(1)}`);
        }
    }

    // Identity score (lower is worse)
    if (metrics.identityScore !== undefined) {
        if (metrics.identityScore < QA_THRESHOLDS.benchmark.identityFail) {
            hasFail = true;
            reasons.push(`Low identity: ${metrics.identityScore}`);
        } else if (metrics.identityScore < QA_THRESHOLDS.benchmark.identityWarn) {
            hasWarn = true;
            reasons.push(`Marginal identity: ${metrics.identityScore}`);
        }
    }

    // Overall quality from benchmark
    if (metrics.overallQuality !== undefined) {
        if (metrics.overallQuality < QA_THRESHOLDS.benchmark.overallQualityFail) {
            hasFail = true;
            reasons.push(`Low quality: ${metrics.overallQuality}`);
        } else if (metrics.overallQuality < QA_THRESHOLDS.benchmark.overallQualityWarn) {
            hasWarn = true;
            reasons.push(`Marginal quality: ${metrics.overallQuality}`);
        }
    }

    // ---- Camera path metrics (soft signals) ----
    if (metrics.pathAdherenceMeanError !== undefined) {
        if (metrics.pathAdherenceMeanError > QA_THRESHOLDS.cameraPath.adherenceFail) {
            hasWarn = true; // Path adherence is a soft signal, not hard fail
            reasons.push(`Path adherence error: ${metrics.pathAdherenceMeanError.toFixed(3)}`);
        } else if (metrics.pathAdherenceMeanError > QA_THRESHOLDS.cameraPath.adherenceWarn) {
            hasWarn = true;
            reasons.push(`Slight path deviation: ${metrics.pathAdherenceMeanError.toFixed(3)}`);
        }
    }

    if (metrics.pathDirectionConsistency !== undefined) {
        if (metrics.pathDirectionConsistency < QA_THRESHOLDS.cameraPath.directionFail) {
            hasWarn = true; // Soft signal
            reasons.push(`Low direction consistency: ${(metrics.pathDirectionConsistency * 100).toFixed(0)}%`);
        } else if (metrics.pathDirectionConsistency < QA_THRESHOLDS.cameraPath.directionWarn) {
            hasWarn = true;
            reasons.push(`Marginal direction: ${(metrics.pathDirectionConsistency * 100).toFixed(0)}%`);
        }
    }

    // Determine final verdict
    let verdict: QAVerdict = 'PASS';
    if (hasFail) {
        verdict = 'FAIL';
    } else if (hasWarn) {
        verdict = 'WARN';
    }

    return { verdict, reasons };
}

/**
 * Compute overall narrative verdict from per-shot QA summaries.
 * 
 * Simple aggregation:
 * - If any shot is FAIL → overall FAIL
 * - Else if any shot is WARN → overall WARN
 * - Else → PASS
 * 
 * @param shots Array of per-shot QA summaries
 * @returns Overall verdict for the narrative
 */
export function computeNarrativeOverallVerdict(
    shots: ShotQASummary[]
): { verdict: QAVerdict; reasons: string[] } {
    if (shots.length === 0) {
        return { verdict: 'PASS', reasons: ['No shots to evaluate'] };
    }

    const failedShots = shots.filter(s => s.verdict === 'FAIL');
    const warnShots = shots.filter(s => s.verdict === 'WARN');
    
    if (failedShots.length > 0) {
        const reasons = failedShots.map(s => `${s.shotId}: FAIL`);
        return { 
            verdict: 'FAIL', 
            reasons: [`${failedShots.length}/${shots.length} shots failed`, ...reasons.slice(0, 3)]
        };
    }
    
    if (warnShots.length > 0) {
        const reasons = warnShots.map(s => `${s.shotId}: WARN`);
        return { 
            verdict: 'WARN', 
            reasons: [`${warnShots.length}/${shots.length} shots have warnings`, ...reasons.slice(0, 3)]
        };
    }
    
    return { verdict: 'PASS', reasons: ['All shots passed QA'] };
}

/**
 * Build a complete NarrativeQASummary from shot metrics and artifacts.
 * 
 * @param shotMetrics Array of per-shot metrics from benchmark/Vision QA
 * @param shotArtifacts Array of per-shot artifacts with config info
 * @returns Complete QA summary with per-shot and overall verdicts
 */
export function buildNarrativeQASummary(
    shotMetrics: NarrativeShotMetrics[],
    shotArtifacts: import('../types/narrativeScript').NarrativeShotArtifacts[]
): NarrativeQASummary {
    const shots: ShotQASummary[] = [];

    for (const metrics of shotMetrics) {
        const artifact = shotArtifacts.find(a => a.shotId === metrics.shotId);
        
        // Build metrics object for verdict computation
        const qaMetrics: ShotQASummary['metrics'] = {
            flickerFrameCount: metrics.flickerFrameCount,
            jitterScore: metrics.jitterScore,
            identityScore: metrics.identityScore,
            overallQuality: metrics.overallQuality,
            pathAdherenceMeanError: metrics.pathAdherenceMeanError,
            pathDirectionConsistency: metrics.pathDirectionConsistency,
            visionOverall: metrics.visionQaOverall,
            visionArtifacts: metrics.visionQaArtifacts,
            visionStatus: metrics.visionQaStatus,
        };

        const { verdict, reasons } = computeShotQAVerdict(metrics.shotId, qaMetrics);

        shots.push({
            shotId: metrics.shotId,
            pipelineConfigId: artifact?.pipelineConfigId || 'unknown',
            cameraPathId: artifact?.cameraPathId,
            temporalRegularizationApplied: artifact?.temporalRegularizationApplied,
            metrics: qaMetrics,
            verdict,
            verdictReasons: reasons,
        });
    }

    const { verdict: overallVerdict, reasons: overallReasons } = computeNarrativeOverallVerdict(shots);

    return {
        overallVerdict,
        overallReasons,
        shots,
    };
}

// ============================================================================
// Helper: Project Root Detection
// ============================================================================

function getProjectRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return process.cwd();
}

// ============================================================================
// Script Loading & Validation
// ============================================================================

/**
 * Load and validate a narrative script from a JSON file.
 * 
 * @param scriptPath Path to the narrative script JSON file
 * @returns Parsed and validated NarrativeScript
 * @throws Error if file not found or invalid
 */
export function loadNarrativeScript(scriptPath: string): NarrativeScript {
    const projectRoot = getProjectRoot();
    const absolutePath = path.isAbsolute(scriptPath)
        ? scriptPath
        : path.join(projectRoot, scriptPath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Narrative script not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    let parsed: unknown;
    
    try {
        parsed = JSON.parse(content);
    } catch (err) {
        throw new Error(`Failed to parse narrative script JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!isNarrativeScript(parsed)) {
        throw new Error('Invalid narrative script: missing required fields (id, shots)');
    }

    // Validate shots reference valid pipeline configs
    for (const shot of parsed.shots) {
        const configPath = path.join(projectRoot, 'config', 'pipelines', `${shot.pipelineConfigId}.json`);
        if (!fs.existsSync(configPath)) {
            throw new Error(`Shot "${shot.id}" references unknown pipeline config: ${shot.pipelineConfigId}`);
        }
    }

    return parsed;
}

/**
 * Initialize a NarrativeRunContext for a script.
 * 
 * @param script Parsed narrative script
 * @param scriptPath Original script path
 * @param outputDir Base output directory
 * @returns Initialized run context
 */
export function initializeRunContext(
    script: NarrativeScript,
    scriptPath: string,
    outputDir: string
): NarrativeRunContext {
    const projectRoot = getProjectRoot();
    const timestamp = new Date().toISOString();
    
    // Create narrative-specific output directory
    const narrativeOutputDir = path.join(projectRoot, outputDir, script.id);
    
    return {
        narrativeId: script.id,
        scriptPath,
        outputDir: narrativeOutputDir,
        startedAt: timestamp,
        shots: script.shots.map(shot => ({
            shotId: shot.id,
            pipelineConfigId: shot.pipelineConfigId,
            cameraPathId: shot.cameraPathId,
            status: 'pending' as const,
        })),
        status: 'running',
    };
}

// ============================================================================
// Per-Shot Pipeline Steps
// ============================================================================

/**
 * Create a step that generates video for a single shot.
 * Uses the regression test script with shot-specific configuration.
 */
function createShotGenerateStep(shot: NarrativeShotRef, shotIndex: number): PipelineStep {
    return {
        id: `generate-shot-${shot.id}`,
        description: `Generate video for shot ${shot.id} (${shot.name || shot.pipelineConfigId})`,
        dependsOn: shotIndex > 0 ? [`generate-shot-${shot.id}`] : undefined, // Shots generate sequentially
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const sample = shot.sampleId || DEFAULT_SAMPLE_ID;
            
            // Use the regression test script
            const scriptPath = path.join(projectRoot, 'scripts', 'test-bookend-regression.ps1');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Script not found: ${scriptPath}`,
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '-NoLogo',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', scriptPath,
                    '-Sample', sample,
                    '-ConfigId', shot.pipelineConfigId,
                ];

                const child = spawn('pwsh', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stdout = '';
                let stderr = '';

                child.stdout?.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                child.stderr?.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });

                child.on('close', (code) => {
                    if (code !== 0) {
                        // Update narrative context with failure
                        const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
                        if (narrativeContext) {
                            const shotArtifact = narrativeContext.shots.find(s => s.shotId === shot.id);
                            if (shotArtifact) {
                                shotArtifact.status = 'failed';
                                shotArtifact.errorMessage = `Generation failed with code ${code}`;
                            }
                        }
                        
                        resolve({
                            status: 'failed',
                            errorMessage: `Shot ${shot.id} generation failed (exit ${code}): ${stderr.slice(0, 300)}`,
                        });
                        return;
                    }

                    // Parse run directory from output
                    const runDirMatch = stdout.match(/(?:RunDir|Output directory):\s*(.+)/i);
                    let runDir = runDirMatch?.[1]?.trim();

                    // Fallback: find latest run directory
                    if (!runDir) {
                        const regressionDir = path.join(projectRoot, 'test-results', 'bookend-regression');
                        if (fs.existsSync(regressionDir)) {
                            const runs = fs.readdirSync(regressionDir)
                                .filter(d => d.startsWith('run-'))
                                .sort()
                                .reverse();
                            if (runs[0]) {
                                runDir = path.join(regressionDir, runs[0]);
                            }
                        }
                    }

                    if (!runDir) {
                        resolve({
                            status: 'failed',
                            errorMessage: 'Could not determine run directory from script output',
                        });
                        return;
                    }

                    // Find video file in run directory
                    const absoluteRunDir = path.isAbsolute(runDir) ? runDir : path.join(projectRoot, runDir);
                    let videoPath: string | undefined;
                    const sampleDir = path.join(absoluteRunDir, sample);
                    
                    if (fs.existsSync(sampleDir)) {
                        const files = fs.readdirSync(sampleDir);
                        const videoFile = files.find(f => f.endsWith('.mp4'));
                        if (videoFile) {
                            videoPath = path.join(sampleDir, videoFile);
                        }
                    }

                    // Update narrative context with artifacts
                    const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
                    if (narrativeContext) {
                        const shotArtifact = narrativeContext.shots.find(s => s.shotId === shot.id);
                        if (shotArtifact) {
                            shotArtifact.status = 'succeeded';
                            shotArtifact.runDir = absoluteRunDir;
                            shotArtifact.videoPath = videoPath;
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`shot_${shot.id}_runDir`]: absoluteRunDir,
                            [`shot_${shot.id}_videoPath`]: videoPath,
                            [`shot_${shot.id}_sample`]: sample,
                        },
                    });
                });

                child.on('error', (error) => {
                    resolve({
                        status: 'failed',
                        errorMessage: `Failed to spawn process: ${error.message}`,
                    });
                });
            });
        },
    };
}

/**
 * Create a step that applies temporal regularization for a shot (optional).
 */
function createShotTemporalStep(shot: NarrativeShotRef): PipelineStep {
    return {
        id: `temporal-shot-${shot.id}`,
        description: `Apply temporal regularization for shot ${shot.id}`,
        dependsOn: [`generate-shot-${shot.id}`],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const videoPath = ctx[`shot_${shot.id}_videoPath`] as string | undefined;
            
            // Determine if we should run based on shot config
            const temporalMode = shot.temporalRegularization || 'auto';
            const shouldRun = temporalMode === 'on';
            
            if (temporalMode === 'off' || (temporalMode === 'auto' && shot.pipelineConfigId === 'fast-preview')) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_temporalApplied`]: false,
                    },
                };
            }
            
            if (!videoPath || !fs.existsSync(videoPath)) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_temporalApplied`]: false,
                        [`shot_${shot.id}_temporalSkipReason`]: 'No video available',
                    },
                };
            }
            
            if (!shouldRun) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_temporalApplied`]: false,
                    },
                };
            }
            
            // Apply temporal regularization
            const parsed = path.parse(videoPath);
            const smoothedPath = path.join(parsed.dir, `${parsed.name}-smoothed${parsed.ext}`);
            const scriptPath = path.join(projectRoot, 'scripts', 'temporal-regularizer.ts');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_temporalApplied`]: false,
                        [`shot_${shot.id}_temporalSkipReason`]: 'Temporal regularizer script not found',
                    },
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '--import', 'tsx',
                    scriptPath,
                    '--input', videoPath,
                    '--output', smoothedPath,
                    '--strength', '0.3',
                    '--window-frames', '3',
                ];

                const child = spawn('node', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                child.on('close', (code) => {
                    if (code !== 0 || !fs.existsSync(smoothedPath)) {
                        resolve({
                            status: 'succeeded', // Non-critical
                            contextUpdates: {
                                [`shot_${shot.id}_temporalApplied`]: false,
                            },
                        });
                        return;
                    }

                    // Update video path to smoothed version
                    const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
                    if (narrativeContext) {
                        const shotArtifact = narrativeContext.shots.find(s => s.shotId === shot.id);
                        if (shotArtifact) {
                            shotArtifact.videoPath = smoothedPath;
                            shotArtifact.temporalRegularizationApplied = true;
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`shot_${shot.id}_originalVideoPath`]: videoPath,
                            [`shot_${shot.id}_videoPath`]: smoothedPath,
                            [`shot_${shot.id}_temporalApplied`]: true,
                        },
                    });
                });

                child.on('error', () => {
                    resolve({
                        status: 'succeeded', // Non-critical
                        contextUpdates: {
                            [`shot_${shot.id}_temporalApplied`]: false,
                        },
                    });
                });
            });
        },
    };
}

/**
 * Create a step that runs Vision QA for a shot.
 */
function createShotVisionQAStep(shot: NarrativeShotRef): PipelineStep {
    return {
        id: `vision-qa-shot-${shot.id}`,
        description: `Run Vision QA for shot ${shot.id}`,
        dependsOn: [`temporal-shot-${shot.id}`],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const sample = ctx[`shot_${shot.id}_sample`] as string || shot.sampleId || DEFAULT_SAMPLE_ID;
            
            const scriptPath = path.join(projectRoot, 'scripts', 'run-bookend-vision-qa.ps1');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_visionQaSkipped`]: true,
                    },
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '-NoLogo',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', scriptPath,
                    '-Sample', sample,
                    '-Runs', '2', // Use 2 runs for faster narrative testing
                ];

                const child = spawn('pwsh', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stdout = '';

                child.stdout?.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                child.on('close', (code) => {
                    const visionQaResultsPath = path.join(projectRoot, 'public', 'vision-qa-latest.json');
                    const statusMatch = stdout.match(/Overall Status:\s*(PASS|WARN|FAIL)/i);
                    const visionQaStatus = statusMatch?.[1]?.toUpperCase() || (code === 0 ? 'PASS' : 'UNKNOWN');

                    // Update narrative context
                    const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
                    if (narrativeContext && fs.existsSync(visionQaResultsPath)) {
                        const shotArtifact = narrativeContext.shots.find(s => s.shotId === shot.id);
                        if (shotArtifact) {
                            shotArtifact.visionQaPath = visionQaResultsPath;
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`shot_${shot.id}_visionQaStatus`]: visionQaStatus,
                            [`shot_${shot.id}_visionQaPath`]: fs.existsSync(visionQaResultsPath) ? visionQaResultsPath : undefined,
                        },
                    });
                });

                child.on('error', () => {
                    resolve({
                        status: 'succeeded', // Non-critical
                        contextUpdates: {
                            [`shot_${shot.id}_visionQaSkipped`]: true,
                        },
                    });
                });
            });
        },
    };
}

/**
 * Create a step that runs video quality benchmark for a shot.
 */
function createShotBenchmarkStep(shot: NarrativeShotRef): PipelineStep {
    return {
        id: `benchmark-shot-${shot.id}`,
        description: `Run video quality benchmark for shot ${shot.id}`,
        dependsOn: [`temporal-shot-${shot.id}`],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const runDir = ctx[`shot_${shot.id}_runDir`] as string | undefined;
            
            const scriptPath = path.join(projectRoot, 'scripts', 'benchmarks', 'run-video-quality-benchmark.ps1');
            
            if (!fs.existsSync(scriptPath) || !runDir) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_benchmarkSkipped`]: true,
                    },
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '-NoLogo',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', scriptPath,
                    '-RunDir', runDir,
                ];

                const child = spawn('pwsh', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stdout = '';

                child.stdout?.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                child.on('close', (_code) => {
                    // Find benchmark output
                    const benchmarkDir = path.join(projectRoot, 'data', 'benchmarks');
                    let benchmarkPath: string | undefined;
                    
                    if (fs.existsSync(benchmarkDir)) {
                        const files = fs.readdirSync(benchmarkDir)
                            .filter(f => f.startsWith('video-quality-') && f.endsWith('.json'))
                            .sort()
                            .reverse();
                        if (files[0]) {
                            benchmarkPath = path.join(benchmarkDir, files[0]);
                        }
                    }

                    // Update narrative context
                    const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
                    if (narrativeContext && benchmarkPath) {
                        const shotArtifact = narrativeContext.shots.find(s => s.shotId === shot.id);
                        if (shotArtifact) {
                            shotArtifact.benchmarkPath = benchmarkPath;
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`shot_${shot.id}_benchmarkPath`]: benchmarkPath,
                        },
                    });
                });

                child.on('error', () => {
                    resolve({
                        status: 'succeeded', // Non-critical
                        contextUpdates: {
                            [`shot_${shot.id}_benchmarkSkipped`]: true,
                        },
                    });
                });
            });
        },
    };
}

/**
 * Create a step that verifies/writes manifest for a shot.
 */
function createShotManifestStep(shot: NarrativeShotRef): PipelineStep {
    return {
        id: `manifest-shot-${shot.id}`,
        description: `Verify/write manifest for shot ${shot.id}`,
        dependsOn: [`generate-shot-${shot.id}`],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const runDir = ctx[`shot_${shot.id}_runDir`] as string | undefined;
            const sample = ctx[`shot_${shot.id}_sample`] as string || shot.sampleId || DEFAULT_SAMPLE_ID;
            
            const scriptPath = path.join(projectRoot, 'scripts', 'write-manifest.ts');
            
            if (!fs.existsSync(scriptPath) || !runDir) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        [`shot_${shot.id}_manifestSkipped`]: true,
                    },
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '--import', 'tsx',
                    scriptPath,
                    '--run-dir', runDir,
                    '--sample', sample,
                ];

                const child = spawn('node', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stdout = '';

                child.stdout?.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });

                child.on('close', (_code) => {
                    // Find manifest output
                    const manifestDir = path.join(projectRoot, 'data', 'manifests');
                    let manifestPath: string | undefined;
                    
                    if (fs.existsSync(manifestDir)) {
                        const files = fs.readdirSync(manifestDir)
                            .filter(f => f.endsWith('.json'))
                            .sort()
                            .reverse();
                        if (files[0]) {
                            manifestPath = path.join(manifestDir, files[0]);
                        }
                    }

                    // Update narrative context
                    const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
                    if (narrativeContext && manifestPath) {
                        const shotArtifact = narrativeContext.shots.find(s => s.shotId === shot.id);
                        if (shotArtifact) {
                            shotArtifact.manifestPath = manifestPath;
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`shot_${shot.id}_manifestPath`]: manifestPath,
                        },
                    });
                });

                child.on('error', () => {
                    resolve({
                        status: 'succeeded', // Non-critical
                        contextUpdates: {
                            [`shot_${shot.id}_manifestSkipped`]: true,
                        },
                    });
                });
            });
        },
    };
}

// ============================================================================
// Concatenation Step
// ============================================================================

/**
 * Create a step that concatenates all shot videos into a single narrative video.
 * Uses ffmpeg concat demuxer.
 */
function createConcatStep(script: NarrativeScript): PipelineStep {
    return {
        id: 'concat-shots',
        description: 'Concatenate all shot videos into final narrative video',
        dependsOn: script.shots.map(s => `temporal-shot-${s.id}`), // Wait for all temporal steps
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
            
            if (!narrativeContext) {
                return {
                    status: 'failed',
                    errorMessage: 'Narrative context not available',
                };
            }

            // Collect video paths for all successful shots
            const videoPaths: string[] = [];
            for (const shot of script.shots) {
                const videoPath = ctx[`shot_${shot.id}_videoPath`] as string | undefined;
                if (videoPath && fs.existsSync(videoPath)) {
                    videoPaths.push(videoPath);
                }
            }

            if (videoPaths.length === 0) {
                return {
                    status: 'failed',
                    errorMessage: 'No video files available for concatenation',
                };
            }

            if (videoPaths.length === 1) {
                // Only one video - just copy it
                const finalPath = path.join(narrativeContext.outputDir, `${script.id}_final.mp4`);
                fs.mkdirSync(path.dirname(finalPath), { recursive: true });
                fs.copyFileSync(videoPaths[0]!, finalPath);
                
                narrativeContext.finalVideoPath = finalPath;
                
                return {
                    status: 'succeeded',
                    contextUpdates: {
                        finalVideoPath: finalPath,
                    },
                };
            }

            // Create concat list file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const concatListPath = path.join(narrativeContext.outputDir, `concat-list-${timestamp}.txt`);
            fs.mkdirSync(path.dirname(concatListPath), { recursive: true });
            
            const concatContent = videoPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
            fs.writeFileSync(concatListPath, concatContent);

            const finalPath = path.join(narrativeContext.outputDir, `${script.id}_final.mp4`);

            return new Promise((resolve) => {
                const args = [
                    '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', concatListPath,
                    '-c', 'copy',
                    finalPath,
                ];

                const child = spawn('ffmpeg', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stderr = '';

                child.stderr?.on('data', (data: Buffer) => {
                    stderr += data.toString();
                });

                child.on('close', (code) => {
                    // Clean up concat list
                    try {
                        fs.unlinkSync(concatListPath);
                    } catch {
                        // Ignore cleanup errors
                    }

                    if (code !== 0) {
                        resolve({
                            status: 'failed',
                            errorMessage: `ffmpeg concat failed (exit ${code}): ${stderr.slice(0, 300)}`,
                        });
                        return;
                    }

                    if (!fs.existsSync(finalPath)) {
                        resolve({
                            status: 'failed',
                            errorMessage: 'ffmpeg completed but output file not found',
                        });
                        return;
                    }

                    narrativeContext.finalVideoPath = finalPath;

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            finalVideoPath: finalPath,
                        },
                    });
                });

                child.on('error', (error) => {
                    resolve({
                        status: 'failed',
                        errorMessage: `Failed to spawn ffmpeg: ${error.message}`,
                    });
                });
            });
        },
    };
}

// ============================================================================
// Summary Report Generation
// ============================================================================

/**
 * Extract metrics from benchmark JSON file.
 */
function extractBenchmarkMetrics(benchmarkPath: string): Partial<NarrativeShotMetrics> {
    try {
        if (!fs.existsSync(benchmarkPath)) return {};
        const content = JSON.parse(fs.readFileSync(benchmarkPath, 'utf-8'));
        const sample = content.samples?.[0];
        if (!sample?.metrics) return {};
        
        const m = sample.metrics;
        return {
            flickerFrameCount: m.temporalCoherence?.flickerFrameCount,
            jitterScore: m.motionConsistency?.jitterScore,
            identityScore: m.identityStability?.identityScore,
            overallQuality: m.overallQuality,
            pathAdherenceMeanError: m.cameraPathMetrics?.pathAdherenceMeanError,
            pathDirectionConsistency: m.cameraPathMetrics?.pathDirectionConsistency,
        };
    } catch {
        return {};
    }
}

/**
 * Extract metrics from Vision QA JSON file.
 */
function extractVisionQAMetrics(visionQaPath: string): Partial<NarrativeShotMetrics> {
    try {
        if (!fs.existsSync(visionQaPath)) return {};
        const content = JSON.parse(fs.readFileSync(visionQaPath, 'utf-8'));
        
        return {
            visionQaOverall: content.overall?.score,
            visionQaArtifacts: content.artifacts?.score,
            visionQaStatus: content.status,
        };
    } catch {
        return {};
    }
}

/**
 * Generate narrative run summary from context.
 */
export function generateNarrativeSummary(
    script: NarrativeScript,
    ctx: PipelineStepContext,
    startedAt: string
): NarrativeRunSummary {
    const finishedAt = new Date().toISOString();
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(finishedAt).getTime();
    
    const narrativeContext = ctx.narrativeContext as NarrativeRunContext | undefined;
    const shotArtifacts = narrativeContext?.shots || [];
    
    const shotMetrics: NarrativeShotMetrics[] = [];
    let successfulShots = 0;
    let failedShots = 0;
    
    for (const shot of script.shots) {
        const artifact = shotArtifacts.find(s => s.shotId === shot.id);
        
        if (artifact?.status === 'succeeded') {
            successfulShots++;
        } else if (artifact?.status === 'failed') {
            failedShots++;
        }
        
        const metrics: NarrativeShotMetrics = { shotId: shot.id };
        
        // Extract benchmark metrics
        if (artifact?.benchmarkPath) {
            Object.assign(metrics, extractBenchmarkMetrics(artifact.benchmarkPath));
        }
        
        // Extract Vision QA metrics
        if (artifact?.visionQaPath) {
            Object.assign(metrics, extractVisionQAMetrics(artifact.visionQaPath));
        }
        
        shotMetrics.push(metrics);
    }
    
    return {
        narrativeId: script.id,
        title: script.title,
        scriptPath: narrativeContext?.scriptPath || '',
        startedAt,
        finishedAt,
        totalDurationMs: endMs - startMs,
        shotCount: script.shots.length,
        successfulShots,
        failedShots,
        shotMetrics,
        shotArtifacts,
        finalVideoPath: narrativeContext?.finalVideoPath || ctx.finalVideoPath as string | undefined,
        status: failedShots === 0 ? 'succeeded' : 'failed',
        // Build QA summary with per-shot and overall verdicts (N2)
        qaSummary: buildNarrativeQASummary(shotMetrics, shotArtifacts),
    };
}

/**
 * Write JSON summary to data directory.
 */
export function writeJsonSummary(summary: NarrativeRunSummary, projectRoot: string): string {
    const timestamp = summary.startedAt.replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.join(projectRoot, NARRATIVE_DATA_DIR, summary.narrativeId);
    const filePath = path.join(dir, `narrative-run-${timestamp}.json`);
    
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
    
    return filePath;
}

/**
 * Write Markdown summary report.
 */
export function writeMarkdownReport(summary: NarrativeRunSummary, projectRoot: string): string {
    const date = summary.startedAt.slice(0, 10);
    const dir = path.join(projectRoot, NARRATIVE_REPORTS_DIR);
    const filePath = path.join(dir, `NARRATIVE_RUN_${summary.narrativeId}_${date}.md`);
    
    const durationStr = summary.totalDurationMs < 60000
        ? `${(summary.totalDurationMs / 1000).toFixed(1)}s`
        : `${Math.floor(summary.totalDurationMs / 60000)}m ${Math.floor((summary.totalDurationMs % 60000) / 1000)}s`;
    
    // Helper for verdict emoji
    const verdictEmoji = (v: string): string => {
        switch (v) {
            case 'PASS': return '✅';
            case 'WARN': return '⚠️';
            case 'FAIL': return '❌';
            default: return '—';
        }
    };
    
    let md = `# Narrative Run Report: ${summary.narrativeId}\n\n`;
    md += `**Title**: ${summary.title || 'Untitled'}\n`;
    md += `**Date**: ${summary.startedAt}\n`;
    md += `**Duration**: ${durationStr}\n`;
    md += `**Status**: ${summary.status === 'succeeded' ? '✅ Succeeded' : '❌ Failed'}\n`;
    md += `**Shots**: ${summary.successfulShots}/${summary.shotCount} successful\n\n`;
    
    if (summary.finalVideoPath) {
        md += `**Final Video**: \`${summary.finalVideoPath}\`\n\n`;
    }
    
    // ---- N2: Narrative QA Summary ----
    if (summary.qaSummary) {
        const qa = summary.qaSummary;
        md += `## Narrative QA Summary (N2)\n\n`;
        md += `**Overall QA Verdict**: ${verdictEmoji(qa.overallVerdict)} ${qa.overallVerdict}\n`;
        if (qa.overallReasons.length > 0) {
            md += `\n> ${qa.overallReasons.join('; ')}\n`;
        }
        md += `\n`;
        
        md += `### Per-Shot QA Verdicts\n\n`;
        md += `| Shot | Pipeline | Camera Path | Temporal | Verdict | Key Reasons |\n`;
        md += `|------|----------|-------------|----------|---------|-------------|\n`;
        
        for (const shotQa of qa.shots) {
            const cameraPath = shotQa.cameraPathId || '—';
            const temporal = shotQa.temporalRegularizationApplied ? '✓' : '—';
            const verdictLabel = `${verdictEmoji(shotQa.verdict)} ${shotQa.verdict}`;
            const reasons = shotQa.verdictReasons.length > 0 
                ? shotQa.verdictReasons.slice(0, 2).join('; ')
                : '—';
            
            md += `| ${shotQa.shotId} | ${shotQa.pipelineConfigId} | ${cameraPath} | ${temporal} | ${verdictLabel} | ${reasons} |\n`;
        }
        
        md += `\n### Shot Metric Details\n\n`;
        md += `| Shot | Vision | Flicker | Jitter | Identity | PathErr | DirConsist |\n`;
        md += `|------|--------|---------|--------|----------|---------|------------|\n`;
        
        for (const shotQa of qa.shots) {
            const m = shotQa.metrics;
            const vision = m.visionOverall !== undefined ? `${m.visionOverall}` : '—';
            const flicker = m.flickerFrameCount !== undefined ? `${m.flickerFrameCount}` : '—';
            const jitter = m.jitterScore !== undefined ? `${m.jitterScore.toFixed(1)}` : '—';
            const identity = m.identityScore !== undefined ? `${m.identityScore}` : '—';
            const pathErr = m.pathAdherenceMeanError !== undefined ? `${m.pathAdherenceMeanError.toFixed(3)}` : '—';
            const dirCons = m.pathDirectionConsistency !== undefined 
                ? `${(m.pathDirectionConsistency * 100).toFixed(0)}%` 
                : '—';
            
            md += `| ${shotQa.shotId} | ${vision} | ${flicker} | ${jitter} | ${identity} | ${pathErr} | ${dirCons} |\n`;
        }
        md += `\n`;
    }
    
    md += `## Shot Summary\n\n`;
    md += `| Shot | Pipeline | Temporal | Quality | Flicker | QA Status |\n`;
    md += `|------|----------|----------|---------|---------|----------|\n`;
    
    for (const artifact of summary.shotArtifacts) {
        const metrics = summary.shotMetrics.find(m => m.shotId === artifact.shotId);
        const temporal = artifact.temporalRegularizationApplied ? '✓' : '—';
        const quality = metrics?.overallQuality !== undefined ? `${metrics.overallQuality}%` : '—';
        const flicker = metrics?.flickerFrameCount !== undefined ? String(metrics.flickerFrameCount) : '—';
        const qaStatus = metrics?.visionQaStatus || '—';
        
        md += `| ${artifact.shotId} | ${artifact.pipelineConfigId} | ${temporal} | ${quality} | ${flicker} | ${qaStatus} |\n`;
    }
    
    md += `\n## Camera Path Metrics (E3)\n\n`;
    md += `| Shot | Path Adherence | Direction Consistency |\n`;
    md += `|------|----------------|----------------------|\n`;
    
    for (const metrics of summary.shotMetrics) {
        const adherence = metrics.pathAdherenceMeanError !== undefined 
            ? metrics.pathAdherenceMeanError.toFixed(4) 
            : '—';
        const direction = metrics.pathDirectionConsistency !== undefined 
            ? `${(metrics.pathDirectionConsistency * 100).toFixed(1)}%`
            : '—';
        
        md += `| ${metrics.shotId} | ${adherence} | ${direction} |\n`;
    }
    
    md += `\n## Artifact Locations\n\n`;
    
    for (const artifact of summary.shotArtifacts) {
        md += `### ${artifact.shotId}\n\n`;
        md += `- **Video**: \`${artifact.videoPath || 'N/A'}\`\n`;
        md += `- **Manifest**: \`${artifact.manifestPath || 'N/A'}\`\n`;
        md += `- **Benchmark**: \`${artifact.benchmarkPath || 'N/A'}\`\n`;
        md += `- **Vision QA**: \`${artifact.visionQaPath || 'N/A'}\`\n\n`;
    }
    
    md += `---\n\n`;
    md += `*Generated by N1/N2 Narrative Pipeline*\n`;
    
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, md);
    
    return filePath;
}

/**
 * Create summary step that generates JSON and Markdown reports.
 */
function createSummaryStep(script: NarrativeScript): PipelineStep {
    return {
        id: 'generate-summary',
        description: 'Generate narrative run summary (JSON + Markdown)',
        dependsOn: ['concat-shots'],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const startedAt = (ctx.narrativeStartedAt as string) || new Date().toISOString();
            
            try {
                const summary = generateNarrativeSummary(script, ctx, startedAt);
                const jsonPath = writeJsonSummary(summary, projectRoot);
                const mdPath = writeMarkdownReport(summary, projectRoot);
                
                return {
                    status: 'succeeded',
                    contextUpdates: {
                        summaryJsonPath: jsonPath,
                        summaryMdPath: mdPath,
                        narrativeSummary: summary,
                    },
                };
            } catch (error) {
                return {
                    status: 'succeeded', // Non-critical
                    contextUpdates: {
                        summaryError: error instanceof Error ? error.message : String(error),
                    },
                };
            }
        },
    };
}

// ============================================================================
// Pipeline Factory
// ============================================================================

/**
 * Get a narrative pipeline definition from a script file.
 * 
 * This pipeline:
 * 1. For each shot: generate → temporal regularization → QA → benchmark → manifest
 * 2. Concatenate all shot videos into a final narrative video
 * 3. Generate summary report (JSON + Markdown)
 * 
 * @param scriptPath Path to the narrative script JSON file
 * @returns Pipeline definition
 */
export function getNarrativePipeline(scriptPath: string): PipelineDefinition {
    const script = loadNarrativeScript(scriptPath);
    
    const steps: PipelineStep[] = [];
    
    // Add per-shot steps
    for (let i = 0; i < script.shots.length; i++) {
        const shot = script.shots[i]!;
        
        // Generate step (sequential - each shot waits for previous)
        const generateStep = createShotGenerateStep(shot, i);
        if (i > 0) {
            const prevShotId = script.shots[i - 1]!.id;
            generateStep.dependsOn = [`temporal-shot-${prevShotId}`]; // Wait for previous shot to complete
        }
        steps.push(generateStep);
        
        // Post-processing steps (parallel within each shot)
        steps.push(createShotTemporalStep(shot));
        steps.push(createShotVisionQAStep(shot));
        steps.push(createShotBenchmarkStep(shot));
        steps.push(createShotManifestStep(shot));
    }
    
    // Add concat step (waits for all temporal steps)
    steps.push(createConcatStep(script));
    
    // Add summary step
    steps.push(createSummaryStep(script));
    
    return {
        id: `narrative-${script.id}`,
        description: `Multi-shot narrative pipeline: ${script.title || script.id} (${script.shots.length} shots)`,
        steps,
    };
}

/**
 * Get narrative script metadata without building full pipeline.
 * Useful for listing available scripts.
 */
export function getNarrativeScriptInfo(scriptPath: string): {
    id: string;
    title?: string;
    description?: string;
    shotCount: number;
} {
    const script = loadNarrativeScript(scriptPath);
    return {
        id: script.id,
        title: script.title,
        description: script.description,
        shotCount: script.shots.length,
    };
}

/**
 * List available narrative scripts in config/narrative/.
 */
export function listNarrativeScripts(): string[] {
    const projectRoot = getProjectRoot();
    const narrativeDir = path.join(projectRoot, 'config', 'narrative');
    
    if (!fs.existsSync(narrativeDir)) {
        return [];
    }
    
    return fs.readdirSync(narrativeDir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join('config', 'narrative', f));
}
