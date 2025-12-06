#!/usr/bin/env npx tsx
/**
 * Golden Set Runner Script
 * 
 * Runs all scenarios from config/golden-scenarios.json through the pipeline
 * orchestrator, executes Vision QA and benchmarks, and generates a consolidated
 * report.
 * 
 * Usage:
 *   npx tsx scripts/run-golden-set.ts [options]
 * 
 * Options:
 *   --priority <n>     Only run scenarios with priority <= n (default: 1)
 *   --parallel <n>     Number of scenarios to run in parallel (default: 1)
 *   --scenario <id>    Run a specific scenario only
 *   --dry-run          Print what would be run without executing
 *   --verbose          Enable verbose logging
 * 
 * Part of Q1 - Golden Set Runner & Regression Harness
 * 
 * @module scripts/run-golden-set
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { QAVerdict } from '../types/narrativeScript';
import {
    getScenariosByPriority,
    getScenario,
    saveGoldenSetReport,
    determineVerdict,
    type GoldenScenario,
    type GoldenSetReport,
    type ScenarioRunResult,
    type ScenarioRunMetrics,
} from '../services/goldenSetService';

// ============================================================================
// CLI Arguments
// ============================================================================

interface CliArgs {
    priority: number;
    scenario?: string;
    dryRun: boolean;
    verbose: boolean;
    parallel: number;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {
        priority: 1,
        dryRun: false,
        verbose: false,
        parallel: 1,
    };
    
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === '--priority' && process.argv[i + 1]) {
            args.priority = parseInt(process.argv[++i] as string, 10);
        } else if (arg === '--scenario' && process.argv[i + 1]) {
            args.scenario = process.argv[++i] as string;
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--verbose') {
            args.verbose = true;
        } else if (arg === '--parallel' && process.argv[i + 1]) {
            const parsed = parseInt(process.argv[++i] as string, 10);
            args.parallel = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        }
    }
    
    return args;
}

// ============================================================================
// Helpers
// ============================================================================

const PROJECT_ROOT = process.cwd();

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const prefix = {
        info: '  ',
        warn: '⚠️',
        error: '❌',
    }[level];
    console.log(`${prefix} ${message}`);
}

function getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Run a PowerShell script and capture output
 */
async function runPowerShell(
    script: string,
    args: string[],
    verbose: boolean
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const fullArgs = [
            '-NoLogo',
            '-ExecutionPolicy', 'Bypass',
            '-File', script,
            ...args,
        ];
        
        if (verbose) {
            log(`Running: pwsh ${fullArgs.join(' ')}`);
        }
        
        const proc = spawn('pwsh', fullArgs, {
            cwd: PROJECT_ROOT,
            env: process.env,
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
            if (verbose) {
                process.stdout.write(data);
            }
        });
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
            if (verbose) {
                process.stderr.write(data);
            }
        });
        
        proc.on('close', (code) => {
            resolve({ exitCode: code ?? 1, stdout, stderr });
        });
        
        proc.on('error', (err) => {
            resolve({ exitCode: 1, stdout, stderr: err.message });
        });
    });
}

/**
 * Extract run directory from script output
 */
function extractRunDir(stdout: string): string | undefined {
    const match = stdout.match(/RunDir:\s*(.+)/);
    return match?.[1]?.trim();
}

/**
 * Load benchmark results from a run directory
 */
function loadBenchmarkResults(runDir: string): ScenarioRunMetrics | null {
    const benchmarkFiles = fs.readdirSync(runDir)
        .filter(f => f.includes('benchmark') && f.endsWith('.json'));
    
    if (benchmarkFiles.length === 0) {
        return null;
    }
    
    const firstBenchmarkFile = benchmarkFiles[0];
    if (!firstBenchmarkFile) {
        return null;
    }
    
    try {
        const benchmarkPath = path.join(runDir, firstBenchmarkFile);
        const content = fs.readFileSync(benchmarkPath, 'utf-8');
        const benchmark = JSON.parse(content);
        
        return {
            flickerFrameCount: benchmark.temporal?.flickerFrameCount ?? benchmark.flickerMetric,
            identityScore: benchmark.quality?.identityScore ?? benchmark.identityScore,
            jitterScore: benchmark.temporal?.jitterScore ?? benchmark.jitterScore,
            overallScore: benchmark.overall?.score ?? benchmark.overallQuality,
            pathAdherenceMeanError: benchmark.cameraPath?.adherenceMeanError,
            pathDirectionConsistency: benchmark.cameraPath?.directionConsistency,
        };
    } catch {
        return null;
    }
}

/**
 * Load Vision QA results from a run directory
 */
function loadVisionQaResults(runDir: string): { score?: number; verdict?: QAVerdict } {
    const visionFiles = fs.readdirSync(runDir)
        .filter(f => f.includes('vision') && f.endsWith('.json'));
    
    if (visionFiles.length === 0) {
        return {};
    }
    
    const firstVisionFile = visionFiles[0];
    if (!firstVisionFile) {
        return {};
    }
    
    try {
        const visionPath = path.join(runDir, firstVisionFile);
        const content = fs.readFileSync(visionPath, 'utf-8');
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
 * Find output artifacts in run directory
 */
function findArtifacts(runDir: string): {
    videoPath?: string;
    manifestPath?: string;
    benchmarkPath?: string;
    visionQaPath?: string;
} {
    const files = fs.readdirSync(runDir);
    
    return {
        videoPath: files.find(f => f.endsWith('.mp4'))
            ? path.join(runDir, files.find(f => f.endsWith('.mp4'))!)
            : undefined,
        manifestPath: files.find(f => f.includes('manifest') && f.endsWith('.json'))
            ? path.join(runDir, files.find(f => f.includes('manifest') && f.endsWith('.json'))!)
            : undefined,
        benchmarkPath: files.find(f => f.includes('benchmark') && f.endsWith('.json'))
            ? path.join(runDir, files.find(f => f.includes('benchmark') && f.endsWith('.json'))!)
            : undefined,
        visionQaPath: files.find(f => f.includes('vision') && f.endsWith('.json'))
            ? path.join(runDir, files.find(f => f.includes('vision') && f.endsWith('.json'))!)
            : undefined,
    };
}

/**
 * Run a single golden scenario
 */
async function runScenario(
    scenario: GoldenScenario,
    verbose: boolean
): Promise<ScenarioRunResult> {
    const startTime = Date.now();
    
    log(`Running scenario: ${scenario.id} (${scenario.name})`);
    log(`  Sample: ${scenario.sampleId}`);
    log(`  Pipeline: ${scenario.pipelineConfigId}`);
    
    // Run the bookend regression test script with this sample
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'test-bookend-regression.ps1');
    
    if (!fs.existsSync(scriptPath)) {
        return {
            scenarioId: scenario.id,
            status: 'error',
            verdict: 'FAIL',
            metrics: {},
            errorMessage: `Script not found: ${scriptPath}`,
            durationMs: Date.now() - startTime,
        };
    }
    
    const result = await runPowerShell(scriptPath, [
        '-SampleFilter', scenario.sampleId,
        '-PipelineConfigId', scenario.pipelineConfigId,
    ], verbose);
    
    if (result.exitCode !== 0) {
        return {
            scenarioId: scenario.id,
            status: 'error',
            verdict: 'FAIL',
            metrics: {},
            errorMessage: `Script exited with code ${result.exitCode}: ${result.stderr}`,
            durationMs: Date.now() - startTime,
        };
    }
    
    // Extract run directory
    const runDir = extractRunDir(result.stdout);
    if (!runDir || !fs.existsSync(runDir)) {
        return {
            scenarioId: scenario.id,
            status: 'error',
            verdict: 'FAIL',
            metrics: {},
            errorMessage: `Could not find run directory in output`,
            durationMs: Date.now() - startTime,
        };
    }
    
    // Load results
    const benchmarkMetrics = loadBenchmarkResults(runDir);
    const visionResults = loadVisionQaResults(runDir);
    const artifacts = findArtifacts(runDir);
    
    const metrics: ScenarioRunMetrics = {
        ...benchmarkMetrics,
        visionQaScore: visionResults.score,
        visionVerdict: visionResults.verdict,
    };
    
    // Determine verdict
    const { verdict, failureReasons } = determineVerdict(metrics, scenario.expectedOutcome);
    
    const status = verdict === 'FAIL' ? 'failed' : 'passed';
    
    return {
        scenarioId: scenario.id,
        status,
        verdict,
        metrics,
        failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
        ...artifacts,
        runDir,
        durationMs: Date.now() - startTime,
    };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs();
    const timestamp = getTimestamp();
    
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Golden Set Runner - Q1 Regression Harness          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Load scenarios
    let scenarios: GoldenScenario[];
    
    if (args.scenario) {
        const scenario = await getScenario(args.scenario);
        if (!scenario) {
            log(`Scenario not found: ${args.scenario}`, 'error');
            process.exit(1);
        }
        scenarios = [scenario];
    } else {
        scenarios = await getScenariosByPriority(args.priority);
    }
    
    log(`Loaded ${scenarios.length} scenarios (priority <= ${args.priority})`);
    
    if (args.dryRun) {
        console.log('\n[DRY RUN] Would run the following scenarios:\n');
        for (const s of scenarios) {
            console.log(`  - ${s.id}: ${s.name}`);
            console.log(`    Sample: ${s.sampleId}, Pipeline: ${s.pipelineConfigId}`);
        }
        return;
    }
    
    // Run scenarios
    const startTime = Date.now();
    const results = await runScenariosWithConcurrency(scenarios, args.parallel, args.verbose);

    // Compute summary
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const errors = results.filter(r => r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    
    const overallVerdict: QAVerdict = 
        errors > 0 || failed > 0 ? 'FAIL' :
        results.some(r => r.verdict === 'WARN') ? 'WARN' : 'PASS';
    
    // Build report
    const report: GoldenSetReport = {
        reportId: timestamp,
        runDate: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - startTime,
        summary: {
            total: scenarios.length,
            passed,
            failed,
            errors,
            skipped,
            overallVerdict,
        },
        results,
        metadata: {
            runBy: process.env.USER || process.env.USERNAME || 'unknown',
        },
    };
    
    // Try to get git info
    try {
        const { execSync } = await import('child_process');
        report.metadata!.gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
        report.metadata!.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch {
        // Git info not available
    }
    
    // Save report
    const reportPath = await saveGoldenSetReport(report);
    
    // Print summary
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('                       GOLDEN SET SUMMARY');
    console.log('════════════════════════════════════════════════════════════\n');
    
    const verdictEmoji = overallVerdict === 'PASS' ? '✅' : overallVerdict === 'WARN' ? '⚠️' : '❌';
    console.log(`  Overall Verdict: ${verdictEmoji} ${overallVerdict}`);
    console.log(`  Total: ${scenarios.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
    console.log(`  Duration: ${(report.totalDurationMs / 1000).toFixed(1)}s`);
    console.log(`\n  Report: ${reportPath}`);
    console.log(`  Markdown: ${reportPath.replace('.json', '.md')}`);
    
    console.log('\n  Per-Scenario Results:');
    for (const result of results) {
        const emoji = result.verdict === 'PASS' ? '✅' : result.verdict === 'WARN' ? '⚠️' : '❌';
        console.log(`    ${emoji} ${result.scenarioId}`);
    }
    
    console.log('');
    
    // Exit with error code if any failures
    if (overallVerdict === 'FAIL') {
        process.exit(1);
    }
}

/**
 * Run scenarios with a configurable level of concurrency.
 * Default remains sequential (parallel = 1) to preserve behavior.
 */
async function runScenariosWithConcurrency(
    scenarios: GoldenScenario[],
    parallel: number,
    verbose: boolean
): Promise<ScenarioRunResult[]> {
    const clampedParallel = Math.max(1, Math.min(parallel, 4)); // avoid overloading the host
    if (parallel > 4) {
        log(`Parallel ${parallel} requested; capping at 4 to protect resources`, 'warn');
    }
    
    const total = scenarios.length;
    const results: ScenarioRunResult[] = [];
    let nextIndex = 0;
    
    const worker = async () => {
        while (nextIndex < total) {
            const current = nextIndex++;
            const scenario = scenarios[current];
            if (!scenario) break;
            
            console.log(`\n[${current + 1}/${total}] 哪哪哪哪哪哪哪哪哪哪哪哪哪哪哪哪哪哪哪哪`);
            
            try {
                const result = await runScenario(scenario, verbose);
                results.push(result);
                
                const emoji = result.verdict === 'PASS' ? '?' : result.verdict === 'WARN' ? '??' : '?';
                log(`Result: ${emoji} ${result.verdict}`);
                
                if (result.failureReasons) {
                    for (const reason of result.failureReasons) {
                        log(`  - ${reason}`, 'warn');
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                log(`Error running scenario: ${errorMsg}`, 'error');
                results.push({
                    scenarioId: scenario?.id ?? 'unknown',
                    status: 'error',
                    verdict: 'FAIL',
                    metrics: {},
                    errorMessage: errorMsg,
                });
            }
        }
    };
    
    const workers = Array.from({ length: Math.min(clampedParallel, total) }, () => worker());
    await Promise.all(workers);
    
    return results;
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
