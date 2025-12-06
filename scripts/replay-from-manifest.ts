#!/usr/bin/env node
/**
 * Replay From Manifest CLI (C1.2)
 * 
 * Regenerates a video from an existing generation manifest.
 * 
 * Usage:
 *   npm run replay:from-manifest -- --manifest <path> [options]
 * 
 * Options:
 *   --manifest <path>     Path to the manifest JSON file (required)
 *   --dry-run             Show replay plan without executing generation
 *   --output-dir <path>   Override output directory for regenerated video
 *   --verbose             Enable verbose logging
 *   --help                Show this help message
 * 
 * Examples:
 *   # Inspect a manifest (dry-run)
 *   npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --dry-run
 * 
 *   # Replay with default output location
 *   npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json
 * 
 *   # Replay with custom output directory
 *   npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --output-dir ./replay-output
 * 
 * @module scripts/replay-from-manifest
 */

import * as path from 'path';
import * as fs from 'fs';
import {
    loadReplayPlan,
    executeReplay,
    formatReplayPlanSummary,
    ReplayError,
} from '../services/manifestReplayService';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CLIArgs {
    manifest?: string;
    dryRun: boolean;
    outputDir?: string;
    verbose: boolean;
    help: boolean;
}

function parseArgs(args: string[]): CLIArgs {
    const result: CLIArgs = {
        dryRun: false,
        verbose: false,
        help: false,
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) continue;
        
        switch (arg) {
            case '--manifest':
            case '-m':
                result.manifest = args[++i];
                break;
            case '--dry-run':
            case '-d':
                result.dryRun = true;
                break;
            case '--output-dir':
            case '-o':
                result.outputDir = args[++i];
                break;
            case '--verbose':
            case '-v':
                result.verbose = true;
                break;
            case '--help':
            case '-h':
                result.help = true;
                break;
            default:
                if (arg.startsWith('-')) {
                    console.warn(`Unknown option: ${arg}`);
                }
        }
    }
    
    return result;
}

// ============================================================================
// Help Text
// ============================================================================

const HELP_TEXT = `
Replay From Manifest CLI (C1.2)

Regenerates a video from an existing generation manifest.

USAGE:
  npm run replay:from-manifest -- --manifest <path> [options]

OPTIONS:
  --manifest, -m <path>     Path to the manifest JSON file (required)
  --dry-run, -d             Show replay plan without executing generation
  --output-dir, -o <path>   Override output directory for regenerated video
  --verbose, -v             Enable verbose logging
  --help, -h                Show this help message

EXAMPLES:
  # Inspect a manifest (dry-run)
  npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --dry-run

  # Replay with default output location
  npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json

  # Replay with custom output directory
  npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --output-dir ./replay-output

NOTES:
  - Replay is "best effort" and not guaranteed to produce pixel-identical output.
  - If a workflow profile has been removed or changed, replay may fail.
  - Use --dry-run to inspect the replay plan before executing.
  - Environment and model differences can affect output.

For more information, see Documentation/Guides/VERSIONING_AND_MANIFESTS.md
`;

// ============================================================================
// Logging Utilities
// ============================================================================

let verboseEnabled = false;

function log(message: string): void {
    console.log(message);
}

function logVerbose(message: string): void {
    if (verboseEnabled) {
        console.log(`[verbose] ${message}`);
    }
}

function logError(message: string): void {
    console.error(`[ERROR] ${message}`);
}

function logWarning(message: string): void {
    console.warn(`[WARNING] ${message}`);
}

function logSuccess(message: string): void {
    console.log(`✓ ${message}`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
    // Parse CLI arguments (skip first two: node and script path)
    const args = parseArgs(process.argv.slice(2));
    verboseEnabled = args.verbose;
    
    // Handle help
    if (args.help) {
        console.log(HELP_TEXT);
        process.exit(0);
    }
    
    // Validate required arguments
    if (!args.manifest) {
        logError('Missing required --manifest argument');
        console.log('\nUsage: npm run replay:from-manifest -- --manifest <path> [--dry-run] [--output-dir <path>]');
        console.log('Run with --help for more information.');
        process.exit(1);
    }
    
    // Resolve manifest path
    const manifestPath = path.resolve(args.manifest);
    logVerbose(`Manifest path: ${manifestPath}`);
    
    // Validate manifest exists
    if (!fs.existsSync(manifestPath)) {
        logError(`Manifest file not found: ${manifestPath}`);
        process.exit(1);
    }
    
    try {
        // Load replay plan
        log(`\nLoading manifest: ${path.basename(manifestPath)}`);
        logVerbose(`Full path: ${manifestPath}`);
        
        const plan = await loadReplayPlan(manifestPath);
        
        // Display plan summary
        log('\n' + formatReplayPlanSummary(plan));
        
        // Show warnings
        if (plan.warnings.length > 0) {
            log('\nWarnings:');
            plan.warnings.forEach(w => logWarning(w));
        }
        
        // Execute or dry-run
        if (args.dryRun) {
            log('\n--- DRY RUN MODE ---');
            log('No generation will be performed.');
            log('Remove --dry-run to execute the replay.\n');
            
            // Still call executeReplay with dryRun: true for consistent output
            await executeReplay(plan, { dryRun: true, outputDir: args.outputDir });
            
            process.exit(0);
        }
        
        // Execute replay
        log('\nExecuting replay...');
        const result = await executeReplay(plan, { dryRun: false, outputDir: args.outputDir });
        
        // Report result
        if (result.dryRun) {
            log('\n--- DRY RUN COMPLETE ---');
        } else {
            log('\n--- REPLAY COMPLETE ---');
            logSuccess(`Output video: ${result.outputVideoPath}`);
            if (result.durationMs) {
                log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
            }
        }
        
        // Show execution warnings
        if (result.warnings.length > 0) {
            log('\nExecution warnings:');
            result.warnings.forEach(w => logWarning(w));
        }
        
        // Compare with original
        const originalPath = plan.manifest.outputs.videoPath;
        if (originalPath) {
            log(`\nOriginal video: ${originalPath}`);
            log(`Replayed video: ${result.outputVideoPath}`);
        }
        
        process.exit(0);
        
    } catch (error) {
        if (error instanceof ReplayError) {
            logError(error.message);
            if (args.verbose && error.details) {
                console.error('Details:', JSON.stringify(error.details, null, 2));
            }
            
            // Provide helpful suggestions based on error code
            switch (error.code) {
                case 'MANIFEST_NOT_FOUND':
                    console.log('\nTip: Check that the manifest path is correct.');
                    console.log('     List available manifests with: ls data/manifests/');
                    break;
                case 'MANIFEST_INVALID':
                    console.log('\nTip: The file may be corrupted or not a valid manifest.');
                    console.log('     Manifests should have manifestVersion and manifestId fields.');
                    break;
                case 'WORKFLOW_NOT_FOUND':
                    console.log('\nTip: The workflow profile from this manifest is not available.');
                    console.log('     Sync the workflow in Settings before replaying.');
                    break;
                case 'GENERATION_FAILED':
                    console.log('\nTip: Check that ComfyUI server is running and accessible.');
                    console.log('     Verify workflow and model availability.');
                    break;
            }
            
            process.exit(1);
        }
        
        // Unknown error
        logError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        if (args.verbose && error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run main
main();
