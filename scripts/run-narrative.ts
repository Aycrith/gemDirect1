#!/usr/bin/env npx tsx
/**
 * Narrative Pipeline Runner CLI
 * 
 * Command-line interface for running multi-shot narrative pipelines.
 * Executes a narrative script that defines a sequence of shots, generating
 * videos, running QA/benchmarks, and concatenating into a final narrative.
 * 
 * Usage:
 *   npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json
 *   npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --verbose
 *   npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --dry-run
 *   npx tsx scripts/run-narrative.ts --list
 * 
 * Arguments:
 *   --script <path>      Path to narrative script JSON (required unless --list)
 *   --verbose            Enable verbose logging
 *   --dry-run            Print steps without executing
 *   --list               List available narrative scripts
 *   --help               Show this help message
 * 
 * Part of N1 - Story-to-Shot Narrative Pipeline (first pass)
 * 
 * @module scripts/run-narrative
 */

import * as path from 'path';
import * as fs from 'fs';
import { runPipeline, type PipelineRunResult } from '../services/pipelineOrchestrator';
import {
    getNarrativePipeline,
    getNarrativeScriptInfo,
    listNarrativeScripts,
    initializeRunContext,
    loadNarrativeScript,
    NARRATIVE_OUTPUT_DIR,
} from '../pipelines/narrativePipeline';
import type { NarrativeRunSummary } from '../types/narrativeScript';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
    script?: string;
    verbose?: boolean;
    dryRun?: boolean;
    list?: boolean;
    help?: boolean;
    temporalRegularization?: 'on' | 'off' | 'auto';
}

function parseArgs(): CliArgs {
    const args: CliArgs = {};
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        
        switch (arg) {
            case '--script':
            case '-s':
                args.script = next;
                i++;
                break;
            case '--temporal':
            case '--temporal-regularization':
                if (next === 'on' || next === 'off' || next === 'auto') {
                    args.temporalRegularization = next;
                    i++;
                }
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
Narrative Pipeline Runner CLI
=============================

Run multi-shot narrative pipelines that generate, process, and concatenate videos.

Usage:
  npx tsx scripts/run-narrative.ts --script <path> [options]
  npm run narrative:demo

Options:
  --script, -s <path>      Path to narrative script JSON (required unless --list)
  --temporal <mode>        Force temporal regularization: on | off | auto (default: auto per shot)
  --verbose, -v            Enable verbose logging
  --dry-run, -d            Print steps without executing
  --list, -l               List available narrative scripts
  --help, -h               Show this help message

Examples:
  # Run the demo three-shot narrative
  npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json

  # Run with verbose output
  npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --verbose

  # Dry run to see pipeline structure
  npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --dry-run

  # List available narrative scripts
  npx tsx scripts/run-narrative.ts --list

Pipeline Steps (per shot):
  1. generate-shot-<id>     Generate video using regression test script
  2. temporal-shot-<id>     Apply temporal regularization (optional)
  3. vision-qa-shot-<id>    Run Vision QA analysis
  4. benchmark-shot-<id>    Run video quality benchmark
  5. manifest-shot-<id>     Verify/write generation manifest

Final Steps:
  6. concat-shots           Concatenate all shot videos with ffmpeg
  7. generate-summary       Create JSON + Markdown run summary

Output Locations:
  - Per-shot videos:    test-results/bookend-regression/run-<timestamp>/<sample>/
  - Final narrative:    output/narratives/<scriptId>/<scriptId>_final.mp4
  - Run summary JSON:   data/narratives/<scriptId>/narrative-run-<timestamp>.json
  - Run summary MD:     reports/NARRATIVE_RUN_<scriptId>_<date>.md

Environment:
  Requires ComfyUI server running on port 8188 (for generation).
  Requires LM Studio or Gemini API configured (for Vision QA).
  Requires ffmpeg in PATH (for video concatenation).
  See Documentation/Guides/NARRATIVE_PIPELINE.md for setup.
`);
}

function printScriptList(): void {
    console.log('\nAvailable Narrative Scripts:');
    console.log('============================\n');
    
    const scripts = listNarrativeScripts();
    
    if (scripts.length === 0) {
        console.log('  No narrative scripts found in config/narrative/');
        console.log('  Create a script using the format in config/narrative/demo-three-shot.json');
        return;
    }
    
    for (const scriptPath of scripts) {
        try {
            const info = getNarrativeScriptInfo(scriptPath);
            console.log(`  ${scriptPath}`);
            console.log(`    ID: ${info.id}`);
            if (info.title) {
                console.log(`    Title: ${info.title}`);
            }
            if (info.description) {
                console.log(`    Description: ${info.description}`);
            }
            console.log(`    Shots: ${info.shotCount}`);
            console.log('');
        } catch (error) {
            console.log(`  ${scriptPath}`);
            console.log(`    ⚠️  Error loading: ${error instanceof Error ? error.message : String(error)}`);
            console.log('');
        }
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
    console.log(`${statusEmoji} Narrative Pipeline: ${result.pipelineId}`);
    console.log('═'.repeat(70));
    
    console.log(`\nStarted:  ${result.startedAt}`);
    console.log(`Finished: ${result.finishedAt}`);
    console.log(`Duration: ${formatDuration(result.totalDurationMs)}`);
    
    console.log('\n' + '─'.repeat(70));
    console.log('Step Results:');
    console.log('─'.repeat(70));
    
    // Group steps by shot
    const stepsByGroup: Record<string, Array<{ id: string; result: typeof result.stepResults[string] }>> = {
        'per-shot': [],
        'final': [],
    };
    
    for (const [stepId, stepResult] of Object.entries(result.stepResults)) {
        const group = stepId.startsWith('concat') || stepId.startsWith('generate-summary') 
            ? 'final' 
            : 'per-shot';
        stepsByGroup[group]!.push({ id: stepId, result: stepResult });
    }
    
    // Print per-shot steps
    for (const { id, result: stepResult } of stepsByGroup['per-shot']!) {
        const emoji = stepResult.status === 'succeeded' ? '✓' 
                    : stepResult.status === 'skipped' ? '⏭️' 
                    : stepResult.status === 'failed' ? '✗' 
                    : '○';
        const duration = stepResult.durationMs ? ` (${formatDuration(stepResult.durationMs)})` : '';
        console.log(`  ${emoji} ${id}${duration}`);
        
        if (stepResult.status === 'failed' && stepResult.errorMessage) {
            console.log(`     └─ Error: ${stepResult.errorMessage.slice(0, 100)}`);
        }
    }
    
    // Print final steps
    console.log('\n  Final Steps:');
    for (const { id, result: stepResult } of stepsByGroup['final']!) {
        const emoji = stepResult.status === 'succeeded' ? '✓' 
                    : stepResult.status === 'skipped' ? '⏭️' 
                    : stepResult.status === 'failed' ? '✗' 
                    : '○';
        const duration = stepResult.durationMs ? ` (${formatDuration(stepResult.durationMs)})` : '';
        console.log(`  ${emoji} ${id}${duration}`);
        
        if (stepResult.status === 'failed' && stepResult.errorMessage) {
            console.log(`     └─ Error: ${stepResult.errorMessage.slice(0, 100)}`);
        }
    }
    
    // Print summary info
    const summary = result.finalContext.narrativeSummary as NarrativeRunSummary | undefined;
    if (summary) {
        console.log('\n' + '─'.repeat(70));
        console.log('Summary:');
        console.log('─'.repeat(70));
        console.log(`  Shots: ${summary.successfulShots}/${summary.shotCount} successful`);
        
        if (summary.finalVideoPath) {
            console.log(`  Final Video: ${summary.finalVideoPath}`);
        }
        
        const jsonPath = result.finalContext.summaryJsonPath as string | undefined;
        const mdPath = result.finalContext.summaryMdPath as string | undefined;
        
        if (jsonPath) {
            console.log(`  Summary JSON: ${jsonPath}`);
        }
        if (mdPath) {
            console.log(`  Summary Report: ${mdPath}`);
        }
        
        // ---- N2: Print QA Summary ----
        if (summary.qaSummary) {
            const qa = summary.qaSummary;
            const verdictEmoji = (v: string): string => {
                switch (v) {
                    case 'PASS': return '✅';
                    case 'WARN': return '⚠️';
                    case 'FAIL': return '❌';
                    default: return '—';
                }
            };
            
            console.log('\n' + '─'.repeat(70));
            console.log('Narrative QA Summary (N2):');
            console.log('─'.repeat(70));
            console.log(`  Overall Verdict: ${verdictEmoji(qa.overallVerdict)} ${qa.overallVerdict}`);
            
            if (qa.overallReasons.length > 0) {
                console.log(`  Reason: ${qa.overallReasons[0]}`);
            }
            
            console.log('\n  Per-Shot Verdicts:');
            for (const shotQa of qa.shots) {
                const reasons = shotQa.verdictReasons.length > 0 
                    ? shotQa.verdictReasons.slice(0, 2).join('; ')
                    : 'OK';
                console.log(`    ${verdictEmoji(shotQa.verdict)} ${shotQa.shotId}: ${shotQa.verdict} - ${reasons}`);
            }
        }
    }
    
    console.log('\n' + '═'.repeat(70));
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs();
    
    // Handle help
    if (args.help) {
        printHelp();
        process.exit(0);
    }
    
    // Handle list
    if (args.list) {
        printScriptList();
        process.exit(0);
    }
    
    // Require script path
    if (!args.script) {
        console.error('Error: --script is required');
        console.error('Use --help for usage information or --list to see available scripts');
        process.exit(1);
    }
    
    // Get project root
    let projectRoot = process.cwd();
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(projectRoot, 'package.json'))) break;
        const parent = path.dirname(projectRoot);
        if (parent === projectRoot) break;
        projectRoot = parent;
    }
    
    // Load and validate script
    console.log(`\n📜 Loading narrative script: ${args.script}`);
    
    let script;
    try {
        script = loadNarrativeScript(args.script);
        console.log(`   ID: ${script.id}`);
        console.log(`   Title: ${script.title || 'Untitled'}`);
        console.log(`   Shots: ${script.shots.length}`);

        // Optional override: force temporal regularization mode for all shots
        if (args.temporalRegularization) {
            for (const shot of script.shots) {
                shot.temporalRegularization = args.temporalRegularization;
            }
            console.log(`   Temporal override: ${args.temporalRegularization}`);
        }
    } catch (error) {
        console.error(`\n❌ Failed to load script: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    
    // Build pipeline
    console.log('\n🔧 Building pipeline...');
    
    let pipeline;
    try {
        pipeline = getNarrativePipeline(args.script);
        console.log(`   Pipeline ID: ${pipeline.id}`);
        console.log(`   Steps: ${pipeline.steps.length}`);
    } catch (error) {
        console.error(`\n❌ Failed to build pipeline: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
    
    // Initialize context
    const narrativeContext = initializeRunContext(script, args.script, NARRATIVE_OUTPUT_DIR);
    
    const initialContext = {
        projectRoot,
        narrativeContext,
        narrativeStartedAt: narrativeContext.startedAt,
    };
    
    // Run pipeline
    console.log('\n🚀 Running narrative pipeline...\n');
    
    if (args.dryRun) {
        console.log('DRY RUN MODE - steps will not be executed\n');
    }
    
    const result = await runPipeline(pipeline, initialContext, {
        verbose: args.verbose,
        dryRun: args.dryRun,
    });
    
    // Print results
    printResult(result);
    
    // Exit with appropriate code
    process.exit(result.status === 'succeeded' ? 0 : 1);
}

// Only run main when executed directly
const isMainModule = process.argv[1]?.includes('run-narrative');
if (isMainModule) {
    main().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

// Export for testing
export { parseArgs, printHelp, printScriptList };
