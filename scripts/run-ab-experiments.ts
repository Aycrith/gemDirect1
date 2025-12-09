#!/usr/bin/env ts-node
/**
 * run-ab-experiments.ts
 * 
 * Automated A/B experiment runner for multi-seed, multi-scenario testing.
 * Compares different pipeline configurations systematically.
 * 
 * Usage:
 *   npx ts-node scripts/run-ab-experiments.ts --config experiments.json
 *   npx ts-node scripts/run-ab-experiments.ts --quick   # Quick preset (3 seeds × 2 scenarios)
 *   npx ts-node scripts/run-ab-experiments.ts --full    # Full preset (5 seeds × all scenarios)
 *   npx ts-node scripts/run-ab-experiments.ts --dry-run # Show what would run
 * 
 * Output:
 *   reports/ab-experiments-<timestamp>.json
 *   reports/ab-experiments-<timestamp>.md
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
import type { QAVerdict } from '../types/narrativeScript';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for an A/B variant to test
 */
export interface ABVariant {
    /** Unique identifier for this variant */
    id: string;
    
    /** Human-readable name */
    name: string;
    
    /** Pipeline config ID to use */
    pipelineConfigId: string;
    
    /** Optional parameter overrides */
    parameterOverrides?: Record<string, unknown>;
}

/**
 * Configuration for a single A/B experiment
 */
export interface ABExperimentConfig {
    /** Experiment identifier */
    id: string;
    
    /** Human-readable name */
    name: string;
    
    /** Description of what this experiment tests */
    description: string;
    
    /** Variant A configuration */
    variantA: ABVariant;
    
    /** Variant B configuration */
    variantB: ABVariant;
    
    /** Scenario IDs to run this experiment on */
    scenarioIds: string[];
    
    /** Seeds to use for reproducibility */
    seeds: number[];
    
    /** Priority (1 = high, lower runs first) */
    priority?: number;
}

/**
 * Full experiment suite configuration
 */
export interface ExperimentSuiteConfig {
    /** Suite identifier */
    suiteId: string;
    
    /** Suite name */
    suiteName: string;
    
    /** Description */
    description: string;
    
    /** Individual experiments */
    experiments: ABExperimentConfig[];
    
    /** Default seeds if not specified per-experiment */
    defaultSeeds?: number[];
    
    /** Default scenarios if not specified per-experiment */
    defaultScenarioIds?: string[];
}

/**
 * Result of a single variant run
 */
export interface VariantRunResult {
    /** Variant ID */
    variantId: string;
    
    /** Scenario ID */
    scenarioId: string;
    
    /** Seed used */
    seed: number;
    
    /** Run status */
    status: 'passed' | 'failed' | 'error';
    
    /** QA verdict */
    verdict: QAVerdict;
    
    /** Run directory path */
    runDir?: string;
    
    /** Duration in seconds */
    durationSeconds?: number;
    
    /** Metrics collected */
    metrics: {
        flickerFrameCount?: number;
        identityScore?: number;
        jitterScore?: number;
        overallScore?: number;
        visionQaScore?: number;
    };
    
    /** Error message if failed */
    errorMessage?: string;
}

/**
 * Comparison result between variants A and B for a scenario+seed
 */
export interface VariantComparison {
    /** Scenario ID */
    scenarioId: string;
    
    /** Seed used */
    seed: number;
    
    /** Variant A result */
    variantA: VariantRunResult;
    
    /** Variant B result */
    variantB: VariantRunResult;
    
    /** Which variant won (null = tie or both failed) */
    winner: 'A' | 'B' | null;
    
    /** Reason for winner selection */
    winnerReason?: string;
    
    /** Delta between variants */
    deltas: {
        flickerDelta?: number;
        identityDelta?: number;
        jitterDelta?: number;
        overallDelta?: number;
        visionDelta?: number;
    };
}

/**
 * Result of a full A/B experiment
 */
export interface ABExperimentResult {
    /** Experiment ID */
    experimentId: string;
    
    /** Start time ISO */
    startTime: string;
    
    /** End time ISO */
    endTime: string;
    
    /** Duration in seconds */
    durationSeconds: number;
    
    /** Individual comparisons */
    comparisons: VariantComparison[];
    
    /** Summary statistics */
    summary: {
        totalComparisons: number;
        variantAWins: number;
        variantBWins: number;
        ties: number;
        errors: number;
        averageDeltas: {
            flicker?: number;
            identity?: number;
            jitter?: number;
            overall?: number;
            vision?: number;
        };
        confidenceScore: number; // 0-1 confidence in winner
        recommendedVariant: 'A' | 'B' | 'inconclusive';
    };
}

/**
 * Full experiment suite report
 */
export interface ABExperimentReport {
    /** Report ID */
    reportId: string;
    
    /** Suite configuration used */
    suiteConfig: ExperimentSuiteConfig;
    
    /** Timestamp */
    timestamp: string;
    
    /** Individual experiment results */
    results: ABExperimentResult[];
    
    /** Overall summary */
    summary: {
        totalExperiments: number;
        completedExperiments: number;
        experimentResults: Array<{
            experimentId: string;
            winner: 'A' | 'B' | 'inconclusive';
            confidence: number;
        }>;
    };
    
    /** Host info */
    hostInfo: {
        hostname: string;
        platform: string;
        nodeVersion: string;
    };
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
    configPath?: string;
    preset?: 'quick' | 'full' | 'smoke';
    dryRun: boolean;
    verbose: boolean;
    experimentId?: string;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {
        dryRun: false,
        verbose: false,
    };
    
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === '--config' && process.argv[i + 1]) {
            args.configPath = process.argv[++i] as string;
        } else if (arg === '--quick') {
            args.preset = 'quick';
        } else if (arg === '--full') {
            args.preset = 'full';
        } else if (arg === '--smoke') {
            args.preset = 'smoke';
        } else if (arg === '--experiment' && process.argv[i + 1]) {
            args.experimentId = process.argv[++i] as string;
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--verbose') {
            args.verbose = true;
        }
    }
    
    return args;
}

// ============================================================================
// Preset Configurations
// ============================================================================

function createPresetConfig(preset: 'quick' | 'full' | 'smoke'): ExperimentSuiteConfig {
    const baseSeeds = {
        smoke: [42],
        quick: [42, 123, 456],
        full: [42, 123, 456, 789, 1024],
    };
    
    const baseScenarios = {
        smoke: ['geometric-baseline'],
        quick: ['geometric-baseline', 'character-consistency'],
        full: [
            'geometric-baseline',
            'character-consistency', 
            'environment-stability',
            'motion-trajectory',
            'complex-combined',
            'lighting-transition',
        ],
    };
    
    return {
        suiteId: `${preset}-suite-${Date.now()}`,
        suiteName: `${preset.charAt(0).toUpperCase() + preset.slice(1)} A/B Suite`,
        description: `Preset ${preset} A/B experiment suite`,
        defaultSeeds: baseSeeds[preset],
        defaultScenarioIds: baseScenarios[preset],
        experiments: [
            {
                id: 'temporal-reg-comparison',
                name: 'Temporal Regularization: None vs Adaptive',
                description: 'Compare video stability with different temporal regularization modes',
                variantA: {
                    id: 'no-temporal-reg',
                    name: 'No Temporal Regularization',
                    pipelineConfigId: 'production-qa',
                    parameterOverrides: { temporalRegularization: 'none' },
                },
                variantB: {
                    id: 'adaptive-temporal-reg',
                    name: 'Adaptive Temporal Regularization',
                    pipelineConfigId: 'production-qa-cinematic-gold',
                    parameterOverrides: { temporalRegularization: 'adaptive' },
                },
                scenarioIds: baseScenarios[preset],
                seeds: baseSeeds[preset],
            },
            {
                id: 'camera-path-comparison',
                name: 'Camera Path: Static vs Bezier',
                description: 'Compare output quality with different camera path types',
                variantA: {
                    id: 'static-camera',
                    name: 'Static Camera',
                    pipelineConfigId: 'production-qa',
                    parameterOverrides: { cameraPathType: 'static' },
                },
                variantB: {
                    id: 'bezier-camera',
                    name: 'Bezier Camera Path',
                    pipelineConfigId: 'production-qa',
                    parameterOverrides: { cameraPathType: 'bezier' },
                },
                scenarioIds: baseScenarios[preset],
                seeds: baseSeeds[preset],
            },
        ],
    };
}

// ============================================================================
// Helpers
// ============================================================================

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✓';
    const timestamp = new Date().toISOString().substring(11, 19);
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

/**
 * Run a PowerShell script and capture output
 */
async function runPowerShell(
    scriptPath: string,
    args: string[],
    verbose: boolean
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const fullArgs = [
            '-NoLogo',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            scriptPath,
            ...args,
        ];
        
        const proc = spawn('pwsh', fullArgs, {
            cwd: path.resolve(__dirname, '..'),
            shell: false,
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            if (verbose) {
                process.stdout.write(text);
            }
        });
        
        proc.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            if (verbose) {
                process.stderr.write(text);
            }
        });
        
        proc.on('close', (code) => {
            resolve({ exitCode: code ?? 1, stdout, stderr });
        });
        
        proc.on('error', (err) => {
            stderr += err.message;
            resolve({ exitCode: 1, stdout, stderr });
        });
    });
}

/**
 * Extract run directory from script output
 */
function extractRunDir(stdout: string): string | undefined {
    const match = stdout.match(/__RUN_DIR=([^\r\n]+)/);
    return match ? match[1]?.trim() : undefined;
}

/**
 * Load benchmark results from a run directory
 */
function loadBenchmarkResults(runDir: string): VariantRunResult['metrics'] {
    const files = fs.readdirSync(runDir)
        .filter(f => f.includes('benchmark') && f.endsWith('.json'));
    
    const firstFile = files[0];
    if (!firstFile) {
        return {};
    }
    
    try {
        const content = fs.readFileSync(path.join(runDir, firstFile), 'utf-8');
        const benchmark = JSON.parse(content);
        
        return {
            flickerFrameCount: benchmark.temporal?.flickerFrameCount ?? benchmark.flickerMetric,
            identityScore: benchmark.quality?.identityScore ?? benchmark.identityScore,
            jitterScore: benchmark.temporal?.jitterScore ?? benchmark.jitterScore,
            overallScore: benchmark.overall?.score ?? benchmark.overallQuality,
        };
    } catch {
        return {};
    }
}

/**
 * Load Vision QA results from a run directory
 */
function loadVisionQaResults(runDir: string): { score?: number; verdict?: QAVerdict } {
    const files = fs.readdirSync(runDir)
        .filter(f => f.includes('vision') && f.endsWith('.json'));
    
    const firstFile = files[0];
    if (!firstFile) {
        return {};
    }
    
    try {
        const content = fs.readFileSync(path.join(runDir, firstFile), 'utf-8');
        const vision = JSON.parse(content);
        
        return {
            score: vision.overallScore ?? vision.visionScore,
            verdict: vision.verdict ?? vision.qaVerdict,
        };
    } catch {
        return {};
    }
}

/**
 * Calculate which variant won based on metrics
 */
function determineWinner(
    variantA: VariantRunResult,
    variantB: VariantRunResult
): { winner: 'A' | 'B' | null; reason: string } {
    // Both failed = no winner
    if (variantA.status === 'error' && variantB.status === 'error') {
        return { winner: null, reason: 'Both variants errored' };
    }
    
    // One failed = other wins
    if (variantA.status === 'error') {
        return { winner: 'B', reason: 'Variant A errored' };
    }
    if (variantB.status === 'error') {
        return { winner: 'A', reason: 'Variant B errored' };
    }
    
    // Both succeeded - compare metrics
    let aScore = 0;
    let bScore = 0;
    
    // Higher identity score is better
    if (variantA.metrics.identityScore !== undefined && variantB.metrics.identityScore !== undefined) {
        if (variantA.metrics.identityScore > variantB.metrics.identityScore + 0.01) aScore++;
        else if (variantB.metrics.identityScore > variantA.metrics.identityScore + 0.01) bScore++;
    }
    
    // Lower flicker count is better
    if (variantA.metrics.flickerFrameCount !== undefined && variantB.metrics.flickerFrameCount !== undefined) {
        if (variantA.metrics.flickerFrameCount < variantB.metrics.flickerFrameCount) aScore++;
        else if (variantB.metrics.flickerFrameCount < variantA.metrics.flickerFrameCount) bScore++;
    }
    
    // Lower jitter is better
    if (variantA.metrics.jitterScore !== undefined && variantB.metrics.jitterScore !== undefined) {
        if (variantA.metrics.jitterScore < variantB.metrics.jitterScore + 0.5) aScore++;
        else if (variantB.metrics.jitterScore < variantA.metrics.jitterScore + 0.5) bScore++;
    }
    
    // Higher overall score is better
    if (variantA.metrics.overallScore !== undefined && variantB.metrics.overallScore !== undefined) {
        if (variantA.metrics.overallScore > variantB.metrics.overallScore + 0.05) aScore++;
        else if (variantB.metrics.overallScore > variantA.metrics.overallScore + 0.05) bScore++;
    }
    
    // Higher vision QA score is better
    if (variantA.metrics.visionQaScore !== undefined && variantB.metrics.visionQaScore !== undefined) {
        if (variantA.metrics.visionQaScore > variantB.metrics.visionQaScore + 2) aScore++;
        else if (variantB.metrics.visionQaScore > variantA.metrics.visionQaScore + 2) bScore++;
    }
    
    if (aScore > bScore) {
        return { winner: 'A', reason: `Variant A won ${aScore} vs ${bScore} metric comparisons` };
    } else if (bScore > aScore) {
        return { winner: 'B', reason: `Variant B won ${bScore} vs ${aScore} metric comparisons` };
    }
    
    return { winner: null, reason: 'Tie - metrics too similar' };
}

/**
 * Run a single variant
 */
async function runVariant(
    variant: ABVariant,
    scenarioId: string,
    seed: number,
    verbose: boolean
): Promise<VariantRunResult> {
    const startTime = Date.now();
    log(`Running variant "${variant.name}" on scenario ${scenarioId} with seed ${seed}`);
    
    // Build arguments for the test runner
    const args = [
        '-Sample', scenarioId,
        '-Seed', seed.toString(),
        '-PipelineConfig', variant.pipelineConfigId,
    ];
    
    // Add parameter overrides
    if (variant.parameterOverrides) {
        for (const [key, value] of Object.entries(variant.parameterOverrides)) {
            args.push(`-${key}`, String(value));
        }
    }
    
    const result = await runPowerShell(
        'scripts/test-bookend-regression.ps1',
        args,
        verbose
    );
    
    const durationSeconds = (Date.now() - startTime) / 1000;
    const runDir = extractRunDir(result.stdout);
    
    // Load results
    let metrics: VariantRunResult['metrics'] = {};
    let verdict: QAVerdict = 'FAIL';
    
    if (runDir && fs.existsSync(runDir)) {
        metrics = loadBenchmarkResults(runDir);
        const visionResults = loadVisionQaResults(runDir);
        if (visionResults.score !== undefined) {
            metrics.visionQaScore = visionResults.score;
        }
        if (visionResults.verdict) {
            verdict = visionResults.verdict;
        }
    }
    
    const status: VariantRunResult['status'] = result.exitCode === 0 ? 'passed' : (result.exitCode === 1 ? 'failed' : 'error');
    
    return {
        variantId: variant.id,
        scenarioId,
        seed,
        status,
        verdict,
        runDir,
        durationSeconds,
        metrics,
        errorMessage: status === 'error' ? result.stderr : undefined,
    };
}

/**
 * Run a full A/B experiment
 */
async function runExperiment(
    experiment: ABExperimentConfig,
    verbose: boolean,
    dryRun: boolean
): Promise<ABExperimentResult> {
    const startTime = new Date();
    const comparisons: VariantComparison[] = [];
    
    log(`\n${'='.repeat(70)}`);
    log(`Experiment: ${experiment.name}`);
    log(`Description: ${experiment.description}`);
    log(`Scenarios: ${experiment.scenarioIds.join(', ')}`);
    log(`Seeds: ${experiment.seeds.join(', ')}`);
    log(`${'='.repeat(70)}`);
    
    if (dryRun) {
        log('[DRY RUN] Would run:');
        for (const scenarioId of experiment.scenarioIds) {
            for (const seed of experiment.seeds) {
                log(`  - ${experiment.variantA.name} vs ${experiment.variantB.name} on ${scenarioId} (seed=${seed})`);
            }
        }
        return {
            experimentId: experiment.id,
            startTime: startTime.toISOString(),
            endTime: new Date().toISOString(),
            durationSeconds: 0,
            comparisons: [],
            summary: {
                totalComparisons: experiment.scenarioIds.length * experiment.seeds.length,
                variantAWins: 0,
                variantBWins: 0,
                ties: 0,
                errors: 0,
                averageDeltas: {},
                confidenceScore: 0,
                recommendedVariant: 'inconclusive',
            },
        };
    }
    
    // Run all scenario+seed combinations
    for (const scenarioId of experiment.scenarioIds) {
        for (const seed of experiment.seeds) {
            log(`\n--- ${scenarioId} (seed=${seed}) ---`);
            
            // Run variant A
            const resultA = await runVariant(experiment.variantA, scenarioId, seed, verbose);
            
            // Run variant B
            const resultB = await runVariant(experiment.variantB, scenarioId, seed, verbose);
            
            // Compare
            const { winner, reason } = determineWinner(resultA, resultB);
            
            const comparison: VariantComparison = {
                scenarioId,
                seed,
                variantA: resultA,
                variantB: resultB,
                winner,
                winnerReason: reason,
                deltas: {
                    flickerDelta: 
                        resultA.metrics.flickerFrameCount !== undefined && resultB.metrics.flickerFrameCount !== undefined
                            ? resultA.metrics.flickerFrameCount - resultB.metrics.flickerFrameCount
                            : undefined,
                    identityDelta:
                        resultA.metrics.identityScore !== undefined && resultB.metrics.identityScore !== undefined
                            ? resultA.metrics.identityScore - resultB.metrics.identityScore
                            : undefined,
                    jitterDelta:
                        resultA.metrics.jitterScore !== undefined && resultB.metrics.jitterScore !== undefined
                            ? resultA.metrics.jitterScore - resultB.metrics.jitterScore
                            : undefined,
                    overallDelta:
                        resultA.metrics.overallScore !== undefined && resultB.metrics.overallScore !== undefined
                            ? resultA.metrics.overallScore - resultB.metrics.overallScore
                            : undefined,
                    visionDelta:
                        resultA.metrics.visionQaScore !== undefined && resultB.metrics.visionQaScore !== undefined
                            ? resultA.metrics.visionQaScore - resultB.metrics.visionQaScore
                            : undefined,
                },
            };
            
            comparisons.push(comparison);
            
            const winnerEmoji = winner === 'A' ? '🅰️' : winner === 'B' ? '🅱️' : '🔗';
            log(`Result: ${winnerEmoji} ${winner ?? 'TIE'} (${reason})`);
        }
    }
    
    // Calculate summary
    const variantAWins = comparisons.filter(c => c.winner === 'A').length;
    const variantBWins = comparisons.filter(c => c.winner === 'B').length;
    const ties = comparisons.filter(c => c.winner === null && c.variantA.status !== 'error').length;
    const errors = comparisons.filter(c => c.variantA.status === 'error' || c.variantB.status === 'error').length;
    
    // Calculate average deltas (for non-error comparisons)
    const validComparisons = comparisons.filter(c => 
        c.variantA.status !== 'error' && c.variantB.status !== 'error'
    );
    
    const avgDelta = (key: keyof VariantComparison['deltas']) => {
        const values = validComparisons
            .map(c => c.deltas[key])
            .filter((v): v is number => v !== undefined);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
    };
    
    // Calculate confidence: how consistent are the results?
    const totalDecisive = variantAWins + variantBWins;
    const dominantWins = Math.max(variantAWins, variantBWins);
    const confidenceScore = totalDecisive > 0 
        ? dominantWins / totalDecisive
        : 0;
    
    const recommendedVariant: 'A' | 'B' | 'inconclusive' = 
        confidenceScore >= 0.6 && variantAWins > variantBWins ? 'A' :
        confidenceScore >= 0.6 && variantBWins > variantAWins ? 'B' :
        'inconclusive';
    
    const endTime = new Date();
    
    return {
        experimentId: experiment.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationSeconds: (endTime.getTime() - startTime.getTime()) / 1000,
        comparisons,
        summary: {
            totalComparisons: comparisons.length,
            variantAWins,
            variantBWins,
            ties,
            errors,
            averageDeltas: {
                flicker: avgDelta('flickerDelta'),
                identity: avgDelta('identityDelta'),
                jitter: avgDelta('jitterDelta'),
                overall: avgDelta('overallDelta'),
                vision: avgDelta('visionDelta'),
            },
            confidenceScore,
            recommendedVariant,
        },
    };
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: ABExperimentReport): string {
    const lines: string[] = [
        `# A/B Experiment Report`,
        ``,
        `**Suite**: ${report.suiteConfig.suiteName}`,
        `**Timestamp**: ${report.timestamp}`,
        `**Report ID**: ${report.reportId}`,
        ``,
        `## Summary`,
        ``,
        `| Experiment | Winner | Confidence | A Wins | B Wins | Ties |`,
        `|------------|--------|------------|--------|--------|------|`,
    ];
    
    for (const expResult of report.results) {
        const exp = report.suiteConfig.experiments.find(e => e.id === expResult.experimentId);
        const winnerLabel = expResult.summary.recommendedVariant === 'A' 
            ? exp?.variantA.name ?? 'A'
            : expResult.summary.recommendedVariant === 'B'
            ? exp?.variantB.name ?? 'B'
            : 'Inconclusive';
        
        lines.push(
            `| ${exp?.name ?? expResult.experimentId} ` +
            `| ${winnerLabel} ` +
            `| ${(expResult.summary.confidenceScore * 100).toFixed(0)}% ` +
            `| ${expResult.summary.variantAWins} ` +
            `| ${expResult.summary.variantBWins} ` +
            `| ${expResult.summary.ties} |`
        );
    }
    
    lines.push(``);
    lines.push(`## Detailed Results`);
    lines.push(``);
    
    for (const expResult of report.results) {
        const exp = report.suiteConfig.experiments.find(e => e.id === expResult.experimentId);
        
        lines.push(`### ${exp?.name ?? expResult.experimentId}`);
        lines.push(``);
        lines.push(`**Description**: ${exp?.description ?? 'N/A'}`);
        lines.push(``);
        lines.push(`- **Duration**: ${expResult.durationSeconds.toFixed(1)}s`);
        lines.push(`- **Recommended**: ${expResult.summary.recommendedVariant}`);
        lines.push(`- **Confidence**: ${(expResult.summary.confidenceScore * 100).toFixed(0)}%`);
        lines.push(``);
        
        if (expResult.comparisons.length > 0) {
            lines.push(`| Scenario | Seed | Winner | A Score | B Score |`);
            lines.push(`|----------|------|--------|---------|---------|`);
            
            for (const comp of expResult.comparisons) {
                const aScore = comp.variantA.metrics.overallScore?.toFixed(2) ?? 'N/A';
                const bScore = comp.variantB.metrics.overallScore?.toFixed(2) ?? 'N/A';
                const winnerEmoji = comp.winner === 'A' ? '🅰️' : comp.winner === 'B' ? '🅱️' : '🔗';
                
                lines.push(
                    `| ${comp.scenarioId} ` +
                    `| ${comp.seed} ` +
                    `| ${winnerEmoji} ${comp.winner ?? 'TIE'} ` +
                    `| ${aScore} ` +
                    `| ${bScore} |`
                );
            }
            
            lines.push(``);
        }
        
        // Average deltas
        if (Object.values(expResult.summary.averageDeltas).some(v => v !== undefined)) {
            lines.push(`**Average Deltas (A - B):**`);
            const deltas = expResult.summary.averageDeltas;
            if (deltas.overall !== undefined) lines.push(`- Overall: ${deltas.overall > 0 ? '+' : ''}${deltas.overall.toFixed(3)}`);
            if (deltas.identity !== undefined) lines.push(`- Identity: ${deltas.identity > 0 ? '+' : ''}${deltas.identity.toFixed(3)}`);
            if (deltas.flicker !== undefined) lines.push(`- Flicker: ${deltas.flicker > 0 ? '+' : ''}${deltas.flicker.toFixed(1)}`);
            if (deltas.jitter !== undefined) lines.push(`- Jitter: ${deltas.jitter > 0 ? '+' : ''}${deltas.jitter.toFixed(2)}`);
            if (deltas.vision !== undefined) lines.push(`- Vision: ${deltas.vision > 0 ? '+' : ''}${deltas.vision.toFixed(1)}`);
            lines.push(``);
        }
    }
    
    lines.push(`---`);
    lines.push(`*Generated by run-ab-experiments.ts*`);
    
    return lines.join('\n');
}

/**
 * Save report to file
 */
function saveReport(report: ABExperimentReport): { jsonPath: string; mdPath: string } {
    const reportsDir = path.resolve(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const baseName = `ab-experiments-${report.reportId}`;
    const jsonPath = path.join(reportsDir, `${baseName}.json`);
    const mdPath = path.join(reportsDir, `${baseName}.md`);
    
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, generateMarkdownReport(report));
    
    // Keep a stable "latest" pointer for UI surfaces
    const latestJsonPath = path.join(reportsDir, 'ab-experiments-latest.json');
    const latestMdPath = path.join(reportsDir, 'ab-experiments-latest.md');
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestMdPath, generateMarkdownReport(report));
    
    return { jsonPath, mdPath };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const args = parseArgs();
    
    log(`A/B Experiment Runner`);
    log(`Timestamp: ${timestamp}`);
    
    // Load or create configuration
    let suiteConfig: ExperimentSuiteConfig;
    
    if (args.configPath) {
        if (!fs.existsSync(args.configPath)) {
            log(`Config file not found: ${args.configPath}`, 'error');
            process.exit(1);
        }
        const content = fs.readFileSync(args.configPath, 'utf-8');
        suiteConfig = JSON.parse(content);
        log(`Loaded config from ${args.configPath}`);
    } else if (args.preset) {
        suiteConfig = createPresetConfig(args.preset);
        log(`Using ${args.preset} preset`);
    } else {
        log('No config or preset specified, using quick preset');
        suiteConfig = createPresetConfig('quick');
    }
    
    // Filter to specific experiment if requested
    if (args.experimentId) {
        suiteConfig.experiments = suiteConfig.experiments.filter(e => e.id === args.experimentId);
        if (suiteConfig.experiments.length === 0) {
            log(`Experiment not found: ${args.experimentId}`, 'error');
            process.exit(1);
        }
    }
    
    log(`Suite: ${suiteConfig.suiteName}`);
    log(`Experiments: ${suiteConfig.experiments.length}`);
    
    if (args.dryRun) {
        log(`[DRY RUN MODE]`);
    }
    
    // Run experiments
    const results: ABExperimentResult[] = [];
    
    for (const experiment of suiteConfig.experiments) {
        const result = await runExperiment(experiment, args.verbose, args.dryRun);
        results.push(result);
    }
    
    // Build final report
    const report: ABExperimentReport = {
        reportId: timestamp,
        suiteConfig,
        timestamp: new Date().toISOString(),
        results,
        summary: {
            totalExperiments: suiteConfig.experiments.length,
            completedExperiments: results.filter(r => r.comparisons.length > 0).length,
            experimentResults: results.map(r => ({
                experimentId: r.experimentId,
                winner: r.summary.recommendedVariant,
                confidence: r.summary.confidenceScore,
            })),
        },
        hostInfo: {
            hostname: os.hostname(),
            platform: process.platform,
            nodeVersion: process.version,
        },
    };
    
    // Save report
    if (!args.dryRun) {
        const { jsonPath, mdPath } = saveReport(report);
        log(`\n${'='.repeat(70)}`);
        log(`Reports saved:`);
        log(`  JSON: ${jsonPath}`);
        log(`  Markdown: ${mdPath}`);
    }
    
    // Print summary
    log(`\n${'='.repeat(70)}`);
    log(`FINAL SUMMARY`);
    log(`${'='.repeat(70)}`);
    
    for (const result of results) {
        const exp = suiteConfig.experiments.find(e => e.id === result.experimentId);
        const emoji = result.summary.recommendedVariant === 'A' ? '🅰️' :
                      result.summary.recommendedVariant === 'B' ? '🅱️' : '❓';
        log(`${emoji} ${exp?.name ?? result.experimentId}: ${result.summary.recommendedVariant} (${(result.summary.confidenceScore * 100).toFixed(0)}% confidence)`);
    }
    
    log(`\nDone.`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
