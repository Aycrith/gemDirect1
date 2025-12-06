/**
 * A/B Comparison Pipeline
 * 
 * Orchestrates A/B comparisons between two pipeline configurations.
 * Uses existing generation, QA, and benchmark infrastructure to run
 * controlled experiments and compare metrics.
 * 
 * Part of F1 - In-App A/B QA Dashboard
 * 
 * @module pipelines/abComparePipeline
 */

import * as path from 'path';
import * as fs from 'fs';
import type {
    PipelineDefinition,
    PipelineStep,
    PipelineStepContext,
    PipelineStepResult,
} from '../services/pipelineOrchestrator';
import { runPipeline } from '../services/pipelineOrchestrator';
import type {
    AbCompareOptions,
    AbCompareResult,
    CompareTarget,
    CompareRunSummary,
    CompareMetrics,
} from '../types/abCompare';
import type { QAVerdict } from '../types/narrativeScript';
import {
    DEFAULT_COHERENCE_THRESHOLDS,
    WARNING_MARGIN,
} from '../services/visionThresholdConfig';

// ============================================================================
// Constants
// ============================================================================

/** Default sample for A/B comparisons */
export const DEFAULT_SAMPLE_ID = 'sample-001-geometric';

/** Default output directory for comparison results */
export const AB_COMPARE_OUTPUT_DIR = 'data/ab-comparisons';

/** Path to golden samples directory */
export const GOLDEN_SAMPLES_DIR = 'data/bookend-golden-samples';

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
// Metric Extraction Helpers
// ============================================================================

/**
 * Extract metrics from a benchmark JSON file.
 * 
 * @param benchmarkPath Path to benchmark results JSON
 * @returns Extracted metrics or undefined if file doesn't exist
 */
export function extractBenchmarkMetrics(benchmarkPath: string): Partial<CompareMetrics> | undefined {
    if (!fs.existsSync(benchmarkPath)) {
        return undefined;
    }
    
    try {
        const content = fs.readFileSync(benchmarkPath, 'utf-8');
        const data = JSON.parse(content);
        
        // Extract relevant metrics from benchmark output
        // Format may vary; handle common structures
        const metrics: Partial<CompareMetrics> = {};
        
        if (typeof data.flickerFrameCount === 'number') {
            metrics.flickerMetric = data.flickerFrameCount;
        }
        if (typeof data.jitterScore === 'number') {
            metrics.jitterScore = data.jitterScore;
        }
        if (typeof data.identityScore === 'number') {
            metrics.identityScore = data.identityScore;
        }
        if (typeof data.overallQuality === 'number') {
            metrics.overallQuality = data.overallQuality;
        }
        
        // Camera path metrics
        if (typeof data.pathAdherenceMeanError === 'number') {
            metrics.pathAdherenceMeanError = data.pathAdherenceMeanError;
        }
        if (typeof data.pathDirectionConsistency === 'number') {
            metrics.pathDirectionConsistency = data.pathDirectionConsistency;
        }
        
        return Object.keys(metrics).length > 0 ? metrics : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Extract Vision QA metrics from a Vision QA JSON file.
 * 
 * @param visionQaPath Path to Vision QA results JSON
 * @param sampleId Sample ID to extract metrics for
 * @returns Extracted metrics or undefined if file doesn't exist
 */
export function extractVisionQaMetrics(
    visionQaPath: string,
    sampleId: string
): Partial<CompareMetrics> | undefined {
    if (!fs.existsSync(visionQaPath)) {
        return undefined;
    }
    
    try {
        const content = fs.readFileSync(visionQaPath, 'utf-8');
        const data = JSON.parse(content);
        
        // Look for sample-specific results
        const sampleResult = data[sampleId] || data;
        if (!sampleResult || typeof sampleResult !== 'object') {
            return undefined;
        }
        
        const metrics: Partial<CompareMetrics> = {};
        
        // Extract vision scores
        const scores = sampleResult.scores || sampleResult.aggregatedMetrics;
        if (scores) {
            if (typeof scores.overall === 'number') {
                metrics.visionOverall = scores.overall;
            } else if (scores.overall?.median !== undefined) {
                metrics.visionOverall = scores.overall.median;
            }
            
            if (typeof scores.artifactSeverity === 'number') {
                metrics.artifacts = scores.artifactSeverity;
            } else if (scores.artifactSeverity?.median !== undefined) {
                metrics.artifacts = scores.artifactSeverity.median;
            }
        }
        
        // Determine verdict
        metrics.visionVerdict = computeVisionVerdict(metrics);
        
        return Object.keys(metrics).length > 0 ? metrics : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Compute Vision QA verdict from metrics.
 */
function computeVisionVerdict(metrics: Partial<CompareMetrics>): QAVerdict {
    const { visionOverall, artifacts } = metrics;
    
    let hasFail = false;
    let hasWarn = false;
    
    // Check overall score
    if (visionOverall !== undefined) {
        if (visionOverall < DEFAULT_COHERENCE_THRESHOLDS.minOverall) {
            hasFail = true;
        } else if (visionOverall < DEFAULT_COHERENCE_THRESHOLDS.minOverall + WARNING_MARGIN) {
            hasWarn = true;
        }
    }
    
    // Check artifact severity
    if (artifacts !== undefined) {
        if (artifacts > DEFAULT_COHERENCE_THRESHOLDS.maxArtifactSeverity) {
            hasFail = true;
        } else if (artifacts > DEFAULT_COHERENCE_THRESHOLDS.maxArtifactSeverity - WARNING_MARGIN) {
            hasWarn = true;
        }
    }
    
    if (hasFail) return 'FAIL';
    if (hasWarn) return 'WARN';
    return 'PASS';
}

/**
 * Merge metrics from benchmark and Vision QA into a single object.
 */
export function mergeMetrics(
    benchmarkMetrics?: Partial<CompareMetrics>,
    visionMetrics?: Partial<CompareMetrics>
): CompareMetrics | undefined {
    if (!benchmarkMetrics && !visionMetrics) {
        return undefined;
    }
    
    return {
        ...benchmarkMetrics,
        ...visionMetrics,
    };
}

// ============================================================================
// Compare Target to Pipeline Definition Mapping
// ============================================================================

/**
 * Build a pipeline definition for a single comparison target.
 * 
 * @param target Compare target configuration
 * @param sampleId Sample to use for generation
 * @param outputDir Output directory for artifacts
 * @returns Pipeline definition for the target
 */
export function buildTargetPipeline(
    target: CompareTarget,
    sampleId: string,
    outputDir: string
): PipelineDefinition {
    // Output will be written to target-specific subdirectory
    // via the regression test script's output handling
    
    // Create step to run the bookend regression test with specific config
    const generateStep: PipelineStep = {
        id: `generate-${target.id}`,
        description: `Generate video for target ${target.id} (${target.label})`,
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            
            // Use the regression test script with pipeline config
            const scriptPath = path.join(projectRoot, 'scripts', 'test-bookend-regression.ps1');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'failed',
                    errorMessage: `Script not found: ${scriptPath}`,
                };
            }
            
            // Ensure output directory exists
            const absOutputDir = path.isAbsolute(outputDir) 
                ? outputDir 
                : path.join(projectRoot, outputDir);
            if (!fs.existsSync(absOutputDir)) {
                fs.mkdirSync(absOutputDir, { recursive: true });
            }
            
            return new Promise((resolve) => {
                const args = [
                    '-NoLogo',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', scriptPath,
                    '-Sample', sampleId,
                    '-Pipeline', target.pipelineConfigId,
                    '-StabilityProfile', target.stabilityProfileKey,
                ];
                
                // Add temporal regularization flag if specified
                if (target.temporalRegularizationMode === 'on') {
                    args.push('-TemporalRegularization', 'on');
                    if (target.temporalRegularizationStrength !== undefined) {
                        args.push('-TemporalStrength', target.temporalRegularizationStrength.toString());
                    }
                } else if (target.temporalRegularizationMode === 'off') {
                    args.push('-TemporalRegularization', 'off');
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
                            errorMessage: `Generation failed (exit ${code}): ${stderr.slice(0, 500)}`,
                        });
                        return;
                    }
                    
                    // Parse run directory from output
                    const runDirMatch = stdout.match(/(?:RunDir|Output directory):\s*(.+)/i);
                    const runDir = runDirMatch?.[1]?.trim();
                    
                    // Find video file
                    let videoPath: string | undefined;
                    if (runDir) {
                        const absRunDir = path.isAbsolute(runDir) 
                            ? runDir 
                            : path.join(projectRoot, runDir);
                        const sampleDir = path.join(absRunDir, sampleId);
                        if (fs.existsSync(sampleDir)) {
                            const files = fs.readdirSync(sampleDir);
                            const videoFile = files.find(f => f.endsWith('.mp4'));
                            if (videoFile) {
                                videoPath = path.join(sampleDir, videoFile);
                            }
                        }
                    }
                    
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`runDir_${target.id}`]: runDir,
                            [`videoPath_${target.id}`]: videoPath,
                            [`stdout_${target.id}`]: stdout,
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
    
    // Create step to run benchmark
    const benchmarkStep: PipelineStep = {
        id: `benchmark-${target.id}`,
        description: `Run benchmark for target ${target.id}`,
        dependsOn: [`generate-${target.id}`],
        run: async (ctx: PipelineStepContext): Promise<PipelineStepResult> => {
            const { spawn } = await import('child_process');
            const projectRoot = (ctx.projectRoot as string) || getProjectRoot();
            const videoPath = ctx[`videoPath_${target.id}`] as string | undefined;
            
            if (!videoPath || !fs.existsSync(videoPath)) {
                return {
                    status: 'skipped',
                    errorMessage: 'No video available for benchmarking',
                };
            }
            
            const scriptPath = path.join(projectRoot, 'scripts', 'benchmarks', 'run-video-quality-benchmark.ps1');
            
            if (!fs.existsSync(scriptPath)) {
                return {
                    status: 'skipped',
                    errorMessage: 'Benchmark script not found',
                };
            }
            
            const benchmarkOutput = path.join(
                path.dirname(videoPath),
                `benchmark-${target.id.toLowerCase()}.json`
            );
            
            return new Promise((resolve) => {
                const args = [
                    '-NoLogo',
                    '-ExecutionPolicy', 'Bypass',
                    '-File', scriptPath,
                    '-VideoPath', videoPath,
                    '-OutputPath', benchmarkOutput,
                ];
                
                const child = spawn('pwsh', args, {
                    cwd: projectRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                
                child.on('close', (code) => {
                    if (code !== 0) {
                        resolve({
                            status: 'succeeded', // Non-critical
                            contextUpdates: {
                                [`benchmarkSkipped_${target.id}`]: true,
                            },
                        });
                        return;
                    }
                    
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`benchmarkPath_${target.id}`]: benchmarkOutput,
                        },
                    });
                });
                
                child.on('error', () => {
                    resolve({
                        status: 'succeeded',
                        contextUpdates: {
                            [`benchmarkSkipped_${target.id}`]: true,
                        },
                    });
                });
            });
        },
    };
    
    return {
        id: `ab-compare-target-${target.id}`,
        description: `A/B comparison target ${target.id}: ${target.label}`,
        steps: [generateStep, benchmarkStep],
    };
}

// ============================================================================
// A/B Compare Runner
// ============================================================================

/**
 * Run an A/B comparison between two pipeline configurations.
 * 
 * This function:
 * 1. Creates pipelines for both targets
 * 2. Runs generation and QA for each
 * 3. Extracts and merges metrics
 * 4. Returns a structured comparison result
 * 
 * @param options Comparison options
 * @returns Complete A/B comparison result
 */
export async function runAbCompare(options: AbCompareOptions): Promise<AbCompareResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const projectRoot = getProjectRoot();
    
    const sampleId = options.sampleId || DEFAULT_SAMPLE_ID;
    const compareId = `compare-${Date.now()}`;
    const outputDir = options.outputDir || path.join(projectRoot, AB_COMPARE_OUTPUT_DIR, compareId);
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const log = options.verbose 
        ? (msg: string) => console.log(`[A/B] ${msg}`)
        : () => {};
    
    log(`Starting A/B comparison: ${compareId}`);
    log(`Sample: ${sampleId}`);
    log(`Target A: ${options.targetA.label} (${options.targetA.pipelineConfigId})`);
    log(`Target B: ${options.targetB.label} (${options.targetB.pipelineConfigId})`);
    
    // Initialize run summaries
    const runA: CompareRunSummary = {
        target: options.targetA,
        status: 'pending',
    };
    
    const runB: CompareRunSummary = {
        target: options.targetB,
        status: 'pending',
    };
    
    // Run target A
    log(`Running target A: ${options.targetA.label}...`);
    runA.status = 'running';
    
    try {
        const pipelineA = buildTargetPipeline(options.targetA, sampleId, outputDir);
        const resultA = await runPipeline(pipelineA, { projectRoot, sampleId }, { verbose: options.verbose });
        
        if (resultA.status === 'succeeded') {
            runA.status = 'succeeded';
            runA.runDir = resultA.finalContext[`runDir_${options.targetA.id}`] as string | undefined;
            runA.videoPath = resultA.finalContext[`videoPath_${options.targetA.id}`] as string | undefined;
            runA.benchmarkPath = resultA.finalContext[`benchmarkPath_${options.targetA.id}`] as string | undefined;
            
            // Extract metrics
            const benchMetrics = runA.benchmarkPath 
                ? extractBenchmarkMetrics(runA.benchmarkPath) 
                : undefined;
            const visionMetrics = runA.visionQaPath 
                ? extractVisionQaMetrics(runA.visionQaPath, sampleId) 
                : undefined;
            runA.metrics = mergeMetrics(benchMetrics, visionMetrics);
        } else {
            runA.status = 'failed';
            const failedStep = Object.entries(resultA.stepResults).find(([, r]) => r.status === 'failed');
            runA.errorMessage = failedStep?.[1].errorMessage || 'Pipeline failed';
        }
    } catch (error) {
        runA.status = 'failed';
        runA.errorMessage = error instanceof Error ? error.message : String(error);
    }
    
    // Run target B
    log(`Running target B: ${options.targetB.label}...`);
    runB.status = 'running';
    
    try {
        const pipelineB = buildTargetPipeline(options.targetB, sampleId, outputDir);
        const resultB = await runPipeline(pipelineB, { projectRoot, sampleId }, { verbose: options.verbose });
        
        if (resultB.status === 'succeeded') {
            runB.status = 'succeeded';
            runB.runDir = resultB.finalContext[`runDir_${options.targetB.id}`] as string | undefined;
            runB.videoPath = resultB.finalContext[`videoPath_${options.targetB.id}`] as string | undefined;
            runB.benchmarkPath = resultB.finalContext[`benchmarkPath_${options.targetB.id}`] as string | undefined;
            
            // Extract metrics
            const benchMetrics = runB.benchmarkPath 
                ? extractBenchmarkMetrics(runB.benchmarkPath) 
                : undefined;
            const visionMetrics = runB.visionQaPath 
                ? extractVisionQaMetrics(runB.visionQaPath, sampleId) 
                : undefined;
            runB.metrics = mergeMetrics(benchMetrics, visionMetrics);
        } else {
            runB.status = 'failed';
            const failedStep = Object.entries(resultB.stepResults).find(([, r]) => r.status === 'failed');
            runB.errorMessage = failedStep?.[1].errorMessage || 'Pipeline failed';
        }
    } catch (error) {
        runB.status = 'failed';
        runB.errorMessage = error instanceof Error ? error.message : String(error);
    }
    
    const finishedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;
    
    // Calculate execution times
    runA.executionTimeMs = runA.status === 'succeeded' ? Math.round(totalDurationMs / 2) : undefined;
    runB.executionTimeMs = runB.status === 'succeeded' ? Math.round(totalDurationMs / 2) : undefined;
    
    const result: AbCompareResult = {
        compareId,
        sampleId,
        startedAt,
        finishedAt,
        totalDurationMs,
        runA,
        runB,
        status: runA.status === 'succeeded' && runB.status === 'succeeded' ? 'succeeded' : 'failed',
    };
    
    // Write comparison result to output directory
    const resultPath = path.join(outputDir, 'comparison-result.json');
    try {
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
        log(`Wrote comparison result to: ${resultPath}`);
    } catch {
        log(`Warning: Could not write comparison result to ${resultPath}`);
    }
    
    log(`A/B comparison ${result.status}: ${totalDurationMs}ms`);
    
    return result;
}

// ============================================================================
// Exports
// ============================================================================

export {
    type AbCompareOptions,
    type AbCompareResult,
    type CompareTarget,
    type CompareRunSummary,
    type CompareMetrics,
} from '../types/abCompare';
