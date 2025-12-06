/**
 * Production QA Golden Pipeline
 * 
 * Canonical pipeline that chains:
 * 1. Generate golden video (using Production QA preset)
 * 2. Apply temporal regularization (optional, E2 prototype)
 * 3. Run Vision QA analysis
 * 4. Run video quality benchmark
 * 5. Verify/write generation manifest
 * 
 * This pipeline uses a known golden sample (sample-001-geometric) for
 * repeatable validation of the full generation → QA flow.
 * 
 * Part of D1 - Pipeline Orchestration & Workflow Management
 * 
 * @module pipelines/productionQaGoldenPipeline
 */

import * as path from 'path';
import * as fs from 'fs';
import type {
    PipelineDefinition,
    PipelineStep,
    PipelineStepContext,
    PipelineStepResult,
} from '../services/pipelineOrchestrator';

// ============================================================================
// Constants
// ============================================================================

/** Default sample for golden pipeline */
export const DEFAULT_GOLDEN_SAMPLE = 'sample-001-geometric';

/** Path to golden samples directory (relative to project root) */
export const GOLDEN_SAMPLES_DIR = 'data/bookend-golden-samples';

/** Path to manifests directory (relative to project root) */
export const MANIFESTS_DIR = 'data/manifests';

/** Default temporal regularization settings */
export const DEFAULT_TEMPORAL_REGULARIZATION = {
    enabled: false,
    strength: 0.3,
    windowFrames: 3,
};

// ============================================================================
// Helper: Project Root Detection
// ============================================================================

function getProjectRoot(): string {
    // Start from current working directory
    let dir = process.cwd();
    
    // Walk up to find package.json
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
// Step 1: Generate Golden Video
// ============================================================================

/**
 * Step that generates a video for the golden sample using the regression test script.
 * Uses scripts/test-bookend-regression.ps1 which:
 * - Loads pipeline config (production-qa-preview.json)
 * - Generates keyframes and videos for specified sample
 * - Writes outputs to test-results/bookend-regression/run-<timestamp>/
 */
function createGenerateStep(): PipelineStep {
    return {
        id: 'generate-golden-video',
        description: 'Generate video for golden sample using Production QA preset',
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const sample = (ctx.sample as string) || DEFAULT_GOLDEN_SAMPLE;
            
            // Use the regression test script with sample filter
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
                        resolve({
                            status: 'failed',
                            errorMessage: `Script exited with code ${code}. Stderr: ${stderr.slice(0, 500)}`,
                        });
                        return;
                    }

                    // Parse run directory from output
                    // Expected format: "RunDir: test-results/bookend-regression/run-20251205-123456"
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
                            const latestRun = runs[0];
                            if (latestRun) {
                                runDir = path.join(regressionDir, latestRun);
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
                    const resolvedRunDir = runDir; // Capture for type narrowing
                    const absoluteRunDir = path.isAbsolute(resolvedRunDir)
                        ? resolvedRunDir
                        : path.join(projectRoot, resolvedRunDir);

                    let videoPath: string | undefined;
                    const sampleDir = path.join(absoluteRunDir, sample);
                    if (fs.existsSync(sampleDir)) {
                        const files = fs.readdirSync(sampleDir);
                        const videoFile = files.find(f => f.endsWith('.mp4'));
                        if (videoFile) {
                            videoPath = path.join(sampleDir, videoFile);
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            runDir: absoluteRunDir,
                            videoPath,
                            sample,
                            generateOutput: stdout,
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

// ============================================================================
// Step 1.5: Apply Temporal Regularization (Optional - E2 Prototype)
// ============================================================================

/**
 * Step that applies temporal regularization (ffmpeg-based smoothing) to the generated video.
 * This is an optional post-processing step controlled by:
 * - context.temporalRegularization: 'on' | 'off' | 'auto'
 * - When 'auto', respects feature flags (temporalRegularizationEnabled)
 * 
 * Uses scripts/temporal-regularizer.ts which:
 * - Applies ffmpeg tmix filter for frame blending
 * - Produces a *-smoothed.mp4 output file
 * - Updates context.videoPath to point to smoothed file
 * 
 * E2 Prototype: This step is for A/B comparison testing of temporal smoothing.
 */
function createTemporalRegularizationStep(): PipelineStep {
    return {
        id: 'temporal-regularization',
        description: 'Apply temporal regularization (optional ffmpeg smoothing)',
        dependsOn: ['generate-golden-video'],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const videoPath = ctx.videoPath as string | undefined;
            
            // Check if temporal regularization is enabled
            const temporalRegularization = ctx.temporalRegularization as string | undefined;
            
            // Determine if we should run based on flag
            // 'on' = always run
            // 'off' = skip
            // 'auto' or undefined = use feature flag defaults (currently off for Production QA)
            const shouldRun = temporalRegularization === 'on';
            const isAuto = !temporalRegularization || temporalRegularization === 'auto';
            
            if (temporalRegularization === 'off' || (isAuto && !DEFAULT_TEMPORAL_REGULARIZATION.enabled)) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        temporalRegularizationApplied: false,
                        temporalRegularizationSkipReason: isAuto 
                            ? 'Disabled by default (use --temporal-regularization on to enable)'
                            : 'Disabled via CLI flag',
                    },
                };
            }
            
            if (!shouldRun && !DEFAULT_TEMPORAL_REGULARIZATION.enabled) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        temporalRegularizationApplied: false,
                        temporalRegularizationSkipReason: 'Temporal regularization not enabled',
                    },
                };
            }
            
            if (!videoPath) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        temporalRegularizationApplied: false,
                        temporalRegularizationSkipReason: 'No video path available from previous step',
                    },
                };
            }
            
            if (!fs.existsSync(videoPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Video file not found: ${videoPath}`,
                };
            }
            
            // Determine output path (same dir, add -smoothed suffix)
            const parsed = path.parse(videoPath);
            const smoothedPath = path.join(parsed.dir, `${parsed.name}-smoothed${parsed.ext}`);
            
            // Get strength/window from context or defaults
            const strength = (ctx.temporalRegularizationStrength as number) || DEFAULT_TEMPORAL_REGULARIZATION.strength;
            const windowFrames = (ctx.temporalRegularizationWindowFrames as number) || DEFAULT_TEMPORAL_REGULARIZATION.windowFrames;
            
            const scriptPath = path.join(projectRoot, 'scripts', 'temporal-regularizer.ts');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Script not found: ${scriptPath}`,
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '--import', 'tsx',
                    scriptPath,
                    '--input', videoPath,
                    '--output', smoothedPath,
                    '--strength', strength.toString(),
                    '--window-frames', windowFrames.toString(),
                    '--verbose',
                ];

                const child = spawn('node', args, {
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
                        // Temporal regularization failure is non-critical - warn but continue
                        resolve({
                            status: 'succeeded',
                            contextUpdates: {
                                temporalRegularizationApplied: false,
                                temporalRegularizationWarning: `Temporal regularization failed (exit code ${code}): ${stderr.slice(0, 300)}`,
                                // Keep original videoPath
                            },
                        });
                        return;
                    }

                    // Verify output was created
                    if (!fs.existsSync(smoothedPath)) {
                        resolve({
                            status: 'succeeded',
                            contextUpdates: {
                                temporalRegularizationApplied: false,
                                temporalRegularizationWarning: 'Temporal regularization completed but output file not found',
                            },
                        });
                        return;
                    }

                    // Success - update video path to smoothed version
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            originalVideoPath: videoPath,
                            videoPath: smoothedPath,  // Subsequent steps use smoothed video
                            temporalRegularizationApplied: true,
                            temporalRegularizationStrength: strength,
                            temporalRegularizationWindowFrames: windowFrames,
                            temporalRegularizationOutput: stdout,
                        },
                    });
                });

                child.on('error', (error) => {
                    // Non-critical failure
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            temporalRegularizationApplied: false,
                            temporalRegularizationWarning: `Failed to spawn process: ${error.message}`,
                        },
                    });
                });
            });
        },
    };
}

// ============================================================================
// Step 2: Run Vision QA
// ============================================================================

/**
 * Step that runs Vision QA analysis on the generated video.
 * Uses scripts/run-bookend-vision-qa.ps1 which:
 * - Analyzes video samples using multi-run VLM evaluation
 * - Validates against coherence thresholds
 * - Outputs results to public/vision-qa-latest.json
 * 
 * Note: Depends on temporal-regularization step so it analyzes the smoothed
 * video when temporal regularization is enabled, or the original otherwise.
 */
function createVisionQAStep(): PipelineStep {
    return {
        id: 'run-vision-qa',
        description: 'Run Vision QA analysis on generated video',
        dependsOn: ['temporal-regularization'],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const sample = (ctx.sample as string) || DEFAULT_GOLDEN_SAMPLE;
            
            const scriptPath = path.join(projectRoot, 'scripts', 'run-bookend-vision-qa.ps1');
            
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
                    '-Runs', '3',  // Use 3 runs for stable metrics
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
                    // Vision QA returns 0 for PASS/WARN, 1 for FAIL
                    // We treat both as success for pipeline purposes (results are captured)
                    const visionQaResultsPath = path.join(projectRoot, 'public', 'vision-qa-latest.json');
                    const visionQaExists = fs.existsSync(visionQaResultsPath);

                    // Determine if this was a PASS/WARN/FAIL
                    const statusMatch = stdout.match(/Overall Status:\s*(PASS|WARN|FAIL)/i);
                    const visionQaStatus = statusMatch?.[1]?.toUpperCase() || (code === 0 ? 'PASS' : 'FAIL');

                    if (code !== 0 && !statusMatch) {
                        resolve({
                            status: 'failed',
                            errorMessage: `Vision QA exited with code ${code}. Stderr: ${stderr.slice(0, 500)}`,
                        });
                        return;
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            visionQaResultsPath: visionQaExists ? visionQaResultsPath : undefined,
                            visionQaStatus,
                            visionQaOutput: stdout,
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

// ============================================================================
// Step 3: Run Video Quality Benchmark
// ============================================================================

/**
 * Step that runs video quality benchmark on the run directory.
 * Uses scripts/benchmarks/run-video-quality-benchmark.ps1 which:
 * - Computes temporal coherence, motion consistency, identity stability
 * - Outputs to data/benchmarks/video-quality-*.{json,csv}
 * 
 * Note: Depends on temporal-regularization step to benchmark the final
 * (potentially smoothed) video output.
 */
function createBenchmarkStep(): PipelineStep {
    return {
        id: 'run-video-benchmark',
        description: 'Run video quality benchmark on generated output',
        dependsOn: ['temporal-regularization'],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const runDir = ctx.runDir as string | undefined;
            const sample = (ctx.sample as string) || DEFAULT_GOLDEN_SAMPLE;
            
            const scriptPath = path.join(projectRoot, 'scripts', 'benchmarks', 'run-video-quality-benchmark.ps1');
            
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
                ];

                // Add run directory if available
                if (runDir) {
                    args.push('-RunDir', runDir);
                }

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
                        resolve({
                            status: 'failed',
                            errorMessage: `Benchmark exited with code ${code}. Stderr: ${stderr.slice(0, 500)}`,
                        });
                        return;
                    }

                    // Find benchmark output files
                    const benchmarkDir = path.join(projectRoot, 'data', 'benchmarks');
                    let benchmarkJsonPath: string | undefined;
                    let benchmarkReportPath: string | undefined;

                    if (fs.existsSync(benchmarkDir)) {
                        const files = fs.readdirSync(benchmarkDir);
                        const jsonFile = files
                            .filter(f => f.startsWith('video-quality-') && f.endsWith('.json'))
                            .sort()
                            .reverse()[0];
                        if (jsonFile) {
                            benchmarkJsonPath = path.join(benchmarkDir, jsonFile);
                        }
                    }

                    const reportsDir = path.join(projectRoot, 'reports');
                    if (fs.existsSync(reportsDir)) {
                        const files = fs.readdirSync(reportsDir);
                        const reportFile = files
                            .filter(f => f.startsWith('VIDEO_QUALITY_BENCHMARK_') && f.endsWith('.md'))
                            .sort()
                            .reverse()[0];
                        if (reportFile) {
                            benchmarkReportPath = path.join(reportsDir, reportFile);
                        }
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            benchmarkJsonPath,
                            benchmarkReportPath,
                            benchmarkOutput: stdout,
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

// ============================================================================
// Step 4: Verify/Write Manifest
// ============================================================================

/**
 * Step that verifies manifest presence or writes one if missing.
 * Uses scripts/write-manifest.ts for manifest creation.
 */
function createManifestStep(): PipelineStep {
    return {
        id: 'verify-manifest',
        description: 'Verify generation manifest exists or write one',
        dependsOn: ['generate-golden-video'],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const sample = (ctx.sample as string) || DEFAULT_GOLDEN_SAMPLE;
            const videoPath = ctx.videoPath as string | undefined;
            
            const manifestsDir = path.join(projectRoot, MANIFESTS_DIR);
            
            // First, check if a manifest already exists for this video
            if (fs.existsSync(manifestsDir)) {
                const files = fs.readdirSync(manifestsDir);
                const recentManifest = files
                    .filter(f => f.startsWith('manifest_') && f.endsWith('.json'))
                    .sort()
                    .reverse()[0];
                
                if (recentManifest) {
                    const manifestPath = path.join(manifestsDir, recentManifest);
                    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                    const manifest = JSON.parse(manifestContent);
                    
                    // Check if manifest is recent (within last 5 minutes)
                    const manifestTime = new Date(manifest.timing?.queuedAt || 0);
                    const now = new Date();
                    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
                    
                    if (manifestTime > fiveMinutesAgo) {
                        return {
                            status: 'succeeded',
                            contextUpdates: {
                                manifestPath,
                                manifestExists: true,
                            },
                        };
                    }
                }
            }

            // No recent manifest found, write one using the CLI
            const scriptPath = path.join(projectRoot, 'scripts', 'write-manifest.ts');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Script not found: ${scriptPath}`,
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '--import', 'tsx',
                    scriptPath,
                    '--build',
                    '--type', 'video',
                    '--scene', sample,
                    '--workflow-id', 'wan-i2v',
                ];

                if (videoPath) {
                    args.push('--video-file', path.basename(videoPath));
                    args.push('--output-dir', path.dirname(videoPath));
                }

                const child = spawn('node', args, {
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
                        // Manifest writing is not critical - warn but don't fail
                        resolve({
                            status: 'succeeded',
                            contextUpdates: {
                                manifestPath: undefined,
                                manifestExists: false,
                                manifestWarning: `Manifest write exited with code ${code}: ${stderr.slice(0, 200)}`,
                            },
                        });
                        return;
                    }

                    // Parse manifest path from output
                    const pathMatch = stdout.match(/Wrote manifest to:\s*(.+)/i);
                    const manifestPath = pathMatch?.[1]?.trim();

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            manifestPath,
                            manifestExists: true,
                        },
                    });
                });

                child.on('error', (error) => {
                    // Manifest writing is not critical
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            manifestPath: undefined,
                            manifestExists: false,
                            manifestWarning: `Failed to spawn process: ${error.message}`,
                        },
                    });
                });
            });
        },
    };
}

// ============================================================================
// Pipeline Factory
// ============================================================================

// ============================================================================
// Step 5: Adaptive Temporal Regularization (E2.2)
// ============================================================================

/**
 * Step that computes adaptive temporal regularization settings based on benchmark metrics.
 * This step runs AFTER the initial benchmark to analyze metrics and suggest optimal settings.
 * 
 * Uses services/temporalPolicyService.ts which:
 * - Analyzes motion coherence metrics (path adherence, jitter, flicker)
 * - Suggests strength/window adjustments based on rule-based policy
 * - Logs the suggestion for comparison evaluation
 * 
 * Part of E2.2 - Path-Guided Temporal Regularization Tuning
 * 
 * When context.temporalRegularization === 'adaptive':
 * 1. Load benchmark metrics from previous step
 * 2. Compute adaptive settings via temporalPolicyService
 * 3. Apply temporal regularization with adaptive settings
 * 4. Re-run benchmark for comparison
 */
function createAdaptiveTemporalRegularizationStep(): PipelineStep {
    return {
        id: 'adaptive-temporal-regularization',
        description: 'Compute and apply adaptive temporal regularization based on benchmark metrics (E2.2)',
        dependsOn: ['run-video-benchmark'],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const videoPath = (ctx.originalVideoPath as string) || (ctx.videoPath as string | undefined);
            const benchmarkJsonPath = ctx.benchmarkJsonPath as string | undefined;
            
            // Check if adaptive mode is enabled
            const temporalRegularization = ctx.temporalRegularization as string | undefined;
            if (temporalRegularization !== 'adaptive') {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        adaptiveTemporalApplied: false,
                        adaptiveTemporalSkipReason: 'Adaptive mode not enabled (use --temporal-regularization adaptive)',
                    },
                };
            }
            
            if (!videoPath) {
                return {
                    status: 'skipped',
                    contextUpdates: {
                        adaptiveTemporalApplied: false,
                        adaptiveTemporalSkipReason: 'No video path available',
                    },
                };
            }
            
            if (!fs.existsSync(videoPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Video file not found: ${videoPath}`,
                };
            }
            
            // Load benchmark metrics
            let benchmarkMetrics: Record<string, unknown> = {};
            if (benchmarkJsonPath && fs.existsSync(benchmarkJsonPath)) {
                try {
                    const benchmarkData = JSON.parse(fs.readFileSync(benchmarkJsonPath, 'utf-8'));
                    // Extract metrics from the first result (or aggregate)
                    const firstResult = benchmarkData.results?.[0];
                    if (firstResult) {
                        benchmarkMetrics = {
                            pathAdherenceMeanError: firstResult.cameraPathMetrics?.pathAdherenceMeanError,
                            pathDirectionConsistency: firstResult.cameraPathMetrics?.pathDirectionConsistency,
                            jitterScore: firstResult.motionConsistency?.jitterScore,
                            flickerFrameCount: firstResult.temporalCoherence?.flickerFrameCount,
                            brightnessVariance: firstResult.temporalCoherence?.brightnessVariance,
                            overallQuality: firstResult.overallQuality,
                        };
                    }
                } catch (err) {
                    console.warn(`[adaptive-temporal] Failed to load benchmark metrics: ${err}`);
                }
            }
            
            // Import and use temporal policy service
            let adaptiveSuggestion: { enabled: boolean; strength: number; windowFrames: number };
            let adaptiveReason: string;
            let adaptiveConfidence: number;
            try {
                const { suggestTemporalRegularization, generateAdaptiveSummary } = await import('../services/temporalPolicyService');
                
                const baseSettings = {
                    enabled: true,
                    strength: DEFAULT_TEMPORAL_REGULARIZATION.strength,
                    windowFrames: DEFAULT_TEMPORAL_REGULARIZATION.windowFrames,
                };
                
                const suggestion = suggestTemporalRegularization(benchmarkMetrics, baseSettings);
                adaptiveSuggestion = suggestion.suggested;
                adaptiveReason = suggestion.reason;
                adaptiveConfidence = suggestion.confidence;
                
                // Log the adaptive summary
                const summary = generateAdaptiveSummary(benchmarkMetrics, baseSettings);
                console.log(`[adaptive-temporal] Motion analysis: ${summary.analysis.quality}`);
                console.log(`[adaptive-temporal] Issues: ${summary.analysis.issues.join(', ') || 'none'}`);
                console.log(`[adaptive-temporal] Suggestion: enabled=${suggestion.suggested.enabled}, strength=${suggestion.suggested.strength}, window=${suggestion.suggested.windowFrames}`);
                console.log(`[adaptive-temporal] Reason: ${suggestion.reason}`);
                console.log(`[adaptive-temporal] Confidence: ${suggestion.confidence.toFixed(0)}%`);
                console.log(`[adaptive-temporal] Delta: ${summary.delta}`);
                
            } catch (err) {
                return {
                    status: 'failed',
                    errorMessage: `Failed to compute adaptive settings: ${err}`,
                };
            }

            // Skip temporal regularization if not recommended
            if (!adaptiveSuggestion.enabled) {
                console.log('[adaptive-temporal] Skipping temporal regularization (not recommended for this content)');
                return {
                    status: 'skipped',
                    contextUpdates: {
                        adaptiveTemporalResult: {
                            skipped: true,
                            reason: adaptiveReason,
                            confidence: adaptiveConfidence,
                        },
                    },
                };
            }
            
            // Apply temporal regularization with adaptive settings
            const parsed = path.parse(videoPath);
            const adaptiveSmoothedPath = path.join(parsed.dir, `${parsed.name}-adaptive${parsed.ext}`);
            
            const scriptPath = path.join(projectRoot, 'scripts', 'temporal-regularizer.ts');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Script not found: ${scriptPath}`,
                };
            }

            return new Promise((resolve) => {
                const args = [
                    '--import', 'tsx',
                    scriptPath,
                    '--input', videoPath,
                    '--output', adaptiveSmoothedPath,
                    '--strength', adaptiveSuggestion.strength.toString(),
                    '--window-frames', adaptiveSuggestion.windowFrames.toString(),
                    '--verbose',
                ];

                const child = spawn('node', args, {
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
                        resolve({
                            status: 'succeeded',
                            contextUpdates: {
                                adaptiveTemporalApplied: false,
                                adaptiveTemporalWarning: `Adaptive temporal regularization failed (exit code ${code}): ${stderr.slice(0, 300)}`,
                                adaptiveSuggestion,
                            },
                        });
                        return;
                    }

                    if (!fs.existsSync(adaptiveSmoothedPath)) {
                        resolve({
                            status: 'succeeded',
                            contextUpdates: {
                                adaptiveTemporalApplied: false,
                                adaptiveTemporalWarning: 'Adaptive temporal regularization completed but output file not found',
                                adaptiveSuggestion,
                            },
                        });
                        return;
                    }

                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            adaptiveTemporalApplied: true,
                            adaptiveVideoPath: adaptiveSmoothedPath,
                            adaptiveSuggestion,
                            adaptiveTemporalOutput: stdout,
                            benchmarkMetricsUsed: benchmarkMetrics,
                        },
                    });
                });

                child.on('error', (error) => {
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            adaptiveTemporalApplied: false,
                            adaptiveTemporalWarning: `Failed to spawn process: ${error.message}`,
                            adaptiveSuggestion,
                        },
                    });
                });
            });
        },
    };
}

/**
 * Get the Production QA Golden pipeline definition.
 * 
 * This pipeline validates the full generation → QA → benchmark → manifest flow
 * using a known golden sample for repeatable results.
 * 
 * Steps:
 * 1. generate-golden-video: Generate video using regression test script
 * 2. temporal-regularization: Apply optional ffmpeg smoothing (E2 prototype)
 * 3. run-vision-qa: Analyze video with Vision QA (depends on step 2)
 * 4. run-video-benchmark: Run quality benchmark (depends on step 2)
 * 5. adaptive-temporal-regularization: Compute and apply adaptive settings (E2.2, depends on step 4)
 * 6. verify-manifest: Verify or write generation manifest (depends on step 1)
 * 
 * @param options Optional configuration
 * @returns Pipeline definition
 */
export function getProductionQaGoldenPipeline(options?: {
    sample?: string;
}): PipelineDefinition {
    return {
        id: 'production-qa-golden',
        description: `Full generation → temporal regularization → Vision QA → benchmark → adaptive temporal → manifest pipeline for golden sample (${options?.sample || DEFAULT_GOLDEN_SAMPLE})`,
        steps: [
            createGenerateStep(),
            createTemporalRegularizationStep(),
            createVisionQAStep(),
            createBenchmarkStep(),
            createAdaptiveTemporalRegularizationStep(),
            createManifestStep(),
        ],
    };
}

/**
 * List of available pipeline IDs in this module
 */
export const AVAILABLE_PIPELINES = ['production-qa-golden'] as const;

export type AvailablePipelineId = typeof AVAILABLE_PIPELINES[number];
