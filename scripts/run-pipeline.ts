#!/usr/bin/env npx tsx
/**
 * Pipeline Runner CLI
 * 
 * Command-line interface for running defined pipelines.
 * Executes multi-step pipelines (generation → QA → benchmarks → manifests)
 * in a declarative, repeatable way.
 * 
 * Usage:
 *   npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden
 *   npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --verbose
 *   npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --dry-run
 *   npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --temporal-regularization on
 *   npx tsx scripts/run-pipeline.ts --list
 * 
 * Arguments:
 *   --pipeline <id>              Pipeline ID to run (required unless --list)
 *   --sample <id>                Sample ID to use (default: sample-001-geometric)
 *   --temporal-regularization    Temporal regularization mode: on, off, auto (default: auto)
 *   --verbose                    Enable verbose logging
 *   --dry-run                    Print steps without executing
 *   --list                       List available pipelines
 *   --help                       Show this help message
 * 
 * Available Pipelines:
 *   production-qa-golden    Full generation → Vision QA → benchmark → manifest
 * 
 * Part of D1 - Pipeline Orchestration & Workflow Management
 * 
 * @module scripts/run-pipeline
 */

import * as path from 'path';
import { runPipeline, type PipelineDefinition, type PipelineRunResult } from '../services/pipelineOrchestrator';
import { getProductionQaGoldenPipeline, AVAILABLE_PIPELINES, DEFAULT_GOLDEN_SAMPLE } from '../pipelines/productionQaGoldenPipeline';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
    pipeline?: string;
    sample?: string;
    temporalRegularization?: 'on' | 'off' | 'auto';
    verbose?: boolean;
    dryRun?: boolean;
    list?: boolean;
    help?: boolean;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {};
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        
        switch (arg) {
            case '--pipeline':
            case '-p':
                args.pipeline = next;
                i++;
                break;
            case '--sample':
            case '-s':
                args.sample = next;
                i++;
                break;
            case '--temporal-regularization':
            case '-t':
                if (next === 'on' || next === 'off' || next === 'auto') {
                    args.temporalRegularization = next;
                } else {
                    args.temporalRegularization = 'auto';
                }
                i++;
                break;
            case '--verbose':
            case '-v':
                args.verbose = true;
                break;
            case '--dry-run':
            case '-d':
                args.dryRun = true;
                break;
            case '--list':
            case '-l':
                args.list = true;
                break;
            case '--help':
            case '-h':
                args.help = true;
                break;
        }
    }
    
    return args;
}

// ============================================================================
// Help and List
// ============================================================================

function printHelp(): void {
    console.log(`
Pipeline Runner CLI
===================

Run defined pipelines for generation, QA, benchmarks, and manifests.

Usage:
  npx tsx scripts/run-pipeline.ts --pipeline <id> [options]
  npm run pipeline:<id>

Options:
  --pipeline, -p <id>              Pipeline ID to run (required unless --list)
  --sample, -s <id>                Sample ID to use (default: ${DEFAULT_GOLDEN_SAMPLE})
  --temporal-regularization, -t    Temporal smoothing: on, off, auto (default: auto)
                                   'on' enables ffmpeg-based smoothing (E2 prototype)
                                   'off' skips smoothing step
                                   'auto' uses feature flag defaults
  --verbose, -v                    Enable verbose logging
  --dry-run, -d                    Print steps without executing
  --list, -l                       List available pipelines
  --help, -h                       Show this help message

Available Pipelines:
  production-qa-golden   Full generation → temporal regularization → Vision QA → benchmark → manifest
                         Validates the complete pipeline using a golden sample.

Examples:
  # Run the production QA golden pipeline
  npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden

  # Run with temporal regularization enabled for A/B comparison
  npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --temporal-regularization on

  # Run with verbose output
  npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --verbose

  # Dry run to see what would happen
  npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --dry-run

  # Use a different sample
  npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --sample sample-002-character

Environment:
  Requires ComfyUI server running on port 8188 (for generation).
  Requires LM Studio or Gemini API configured (for Vision QA).
  Requires ffmpeg in PATH (for temporal regularization).
  See Documentation/Guides/GETTING_STARTED.md for setup.
`);
}

function printPipelineList(): void {
    console.log('\nAvailable Pipelines:');
    console.log('====================\n');
    
    for (const pipelineId of AVAILABLE_PIPELINES) {
        const pipeline = getPipelineById(pipelineId);
        if (pipeline) {
            console.log(`  ${pipelineId}`);
            console.log(`    ${pipeline.description}`);
            console.log(`    Steps: ${pipeline.steps.map(s => s.id).join(' → ')}`);
            console.log('');
        }
    }
}

// ============================================================================
// Pipeline Resolution
// ============================================================================

function getPipelineById(id: string, options?: { sample?: string }): PipelineDefinition | null {
    switch (id) {
        case 'production-qa-golden':
            return getProductionQaGoldenPipeline(options);
        default:
            return null;
    }
}

// ============================================================================
// Result Formatting
// ============================================================================

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function printResult(result: PipelineRunResult): void {
    const statusEmoji = result.status === 'succeeded' ? '✅' : '❌';
    
    console.log('\n' + '═'.repeat(70));
    console.log(`${statusEmoji} Pipeline: ${result.pipelineId}`);
    console.log(`   Status: ${result.status.toUpperCase()}`);
    console.log(`   Duration: ${formatDuration(result.totalDurationMs)}`);
    console.log(`   Started: ${result.startedAt}`);
    console.log(`   Finished: ${result.finishedAt}`);
    console.log('═'.repeat(70));
    
    console.log('\nStep Results:');
    console.log('─'.repeat(50));
    
    for (const [stepId, stepResult] of Object.entries(result.stepResults)) {
        const stepEmoji = 
            stepResult.status === 'succeeded' ? '✅' :
            stepResult.status === 'failed' ? '❌' :
            stepResult.status === 'skipped' ? '⏭️' :
            stepResult.status === 'running' ? '🔄' : '⏸️';
        
        const duration = stepResult.durationMs 
            ? ` (${formatDuration(stepResult.durationMs)})`
            : '';
        
        console.log(`  ${stepEmoji} ${stepId}: ${stepResult.status}${duration}`);
        
        if (stepResult.errorMessage) {
            console.log(`      Error: ${stepResult.errorMessage}`);
        }
    }
    
    console.log('\nKey Outputs:');
    console.log('─'.repeat(50));
    
    const { finalContext } = result;
    
    if (finalContext.runDir) {
        console.log(`  Run Directory: ${finalContext.runDir}`);
    }
    if (finalContext.videoPath) {
        console.log(`  Video Path: ${finalContext.videoPath}`);
    }
    if (finalContext.visionQaStatus) {
        console.log(`  Vision QA Status: ${finalContext.visionQaStatus}`);
    }
    if (finalContext.visionQaResultsPath) {
        console.log(`  Vision QA Results: ${finalContext.visionQaResultsPath}`);
    }
    if (finalContext.benchmarkJsonPath) {
        console.log(`  Benchmark JSON: ${finalContext.benchmarkJsonPath}`);
    }
    if (finalContext.benchmarkReportPath) {
        console.log(`  Benchmark Report: ${finalContext.benchmarkReportPath}`);
    }
    if (finalContext.manifestPath) {
        console.log(`  Manifest: ${finalContext.manifestPath}`);
    }
    if (finalContext.manifestWarning) {
        console.log(`  Manifest Warning: ${finalContext.manifestWarning}`);
    }
    
    console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs();
    
    if (args.help) {
        printHelp();
        process.exit(0);
    }
    
    if (args.list) {
        printPipelineList();
        process.exit(0);
    }
    
    if (!args.pipeline) {
        console.error('Error: --pipeline argument is required');
        console.error('Use --list to see available pipelines, or --help for usage.');
        process.exit(1);
    }
    
    const pipeline = getPipelineById(args.pipeline, { sample: args.sample });
    
    if (!pipeline) {
        console.error(`Error: Unknown pipeline "${args.pipeline}"`);
        console.error(`Available pipelines: ${AVAILABLE_PIPELINES.join(', ')}`);
        process.exit(1);
    }
    
    const temporalMode = args.temporalRegularization || 'auto';
    
    console.log('\n' + '═'.repeat(70));
    console.log('Pipeline Orchestrator');
    console.log('═'.repeat(70));
    console.log(`Pipeline: ${args.pipeline}`);
    console.log(`Sample: ${args.sample || DEFAULT_GOLDEN_SAMPLE}`);
    console.log(`Temporal Regularization: ${temporalMode}`);
    console.log(`Verbose: ${args.verbose || false}`);
    console.log(`Dry Run: ${args.dryRun || false}`);
    console.log('═'.repeat(70) + '\n');
    
    const initialContext = {
        projectRoot: path.resolve(path.join(import.meta.dirname || __dirname, '..')),
        sample: args.sample || DEFAULT_GOLDEN_SAMPLE,
        temporalRegularization: temporalMode,
    };
    
    const result = await runPipeline(pipeline, initialContext, {
        verbose: args.verbose,
        dryRun: args.dryRun,
    });
    
    printResult(result);
    
    process.exit(result.status === 'succeeded' ? 0 : 1);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
