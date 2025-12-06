#!/usr/bin/env npx tsx
/**
 * Temporal Regularizer Script (E2 - Temporal Post-Processing Prototype)
 * 
 * Applies FFmpeg-based temporal smoothing to video files to reduce flicker
 * and frame-to-frame jitter. Uses the tmix filter for multi-frame blending.
 * 
 * This is an optional post-processing step that can be enabled via:
 * - Feature flags: temporalRegularizationEnabled, temporalRegularizationStrength
 * - CLI flags: --strength, --window-frames
 * 
 * Usage:
 *   npx tsx scripts/temporal-regularizer.ts --input <video> --output <output>
 *   npx tsx scripts/temporal-regularizer.ts --input video.mp4 --output smooth.mp4 --strength 0.4
 *   npx tsx scripts/temporal-regularizer.ts --input video.mp4 --dry-run --verbose
 * 
 * Options:
 *   --input <path>          Input video file path (required)
 *   --output <path>         Output video file path (default: <input>-smoothed.mp4)
 *   --strength <0.0-1.0>    Smoothing strength (default: 0.3)
 *   --window-frames <N>     Number of frames to blend (default: 3, range: 2-7)
 *   --dry-run               Print ffmpeg command without executing
 *   --verbose               Enable verbose logging
 *   --help                  Show this help message
 * 
 * Filter Details:
 *   Uses ffmpeg's tmix filter for temporal frame averaging:
 *   - tmix=frames=N:weights='...':normalize=1
 *   - Strength controls weight distribution (center vs neighbors)
 *   - Higher strength = more smoothing but potential blur
 * 
 * @module scripts/temporal-regularizer
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * CLI arguments for temporal regularizer
 */
export interface TemporalRegularizerArgs {
    input?: string;
    output?: string;
    strength: number;
    windowFrames: number;
    dryRun: boolean;
    verbose: boolean;
    help: boolean;
}

/**
 * Result of temporal regularization operation
 */
export interface TemporalRegularizerResult {
    success: boolean;
    inputPath: string;
    outputPath?: string;
    command: string[];
    durationMs?: number;
    error?: string;
}

/** Default smoothing strength (0.0-1.0) */
const DEFAULT_STRENGTH = 0.3;

/** Default number of frames for temporal window */
const DEFAULT_WINDOW_FRAMES = 3;

/** Minimum window size */
const MIN_WINDOW_FRAMES = 2;

/** Maximum window size */
const MAX_WINDOW_FRAMES = 7;

// ============================================================================
// FFmpeg Command Builder
// ============================================================================

/**
 * Compute tmix weights based on strength and window size.
 * 
 * Strength affects weight distribution:
 * - Low strength (0.1): Heavy center weight, minimal neighbor contribution
 * - High strength (0.8): More even weights, stronger smoothing
 * 
 * @param strength Smoothing strength (0.0-1.0)
 * @param windowFrames Number of frames in temporal window
 * @returns Weight string for tmix filter (e.g., "0.5 1 0.5")
 */
export function computeTmixWeights(strength: number, windowFrames: number): string {
    // Clamp strength to valid range
    const clampedStrength = Math.max(0, Math.min(1, strength));
    
    // Center frame gets highest weight, neighbors get proportionally less
    // At strength=0, center gets ~1.0 and edges get ~0.1
    // At strength=1, all frames get equal weight
    const centerWeight = 1.0;
    const edgeWeight = 0.1 + (clampedStrength * 0.9); // Range: 0.1 to 1.0
    
    const weights: number[] = [];
    const midpoint = Math.floor(windowFrames / 2);
    
    for (let i = 0; i < windowFrames; i++) {
        const distanceFromCenter = Math.abs(i - midpoint);
        // Linear interpolation from center to edge weight
        const weight = centerWeight - (distanceFromCenter / midpoint) * (centerWeight - edgeWeight);
        weights.push(Math.round(weight * 100) / 100);
    }
    
    return weights.join(' ');
}

/**
 * Build the ffmpeg command for temporal regularization.
 * 
 * @param input Input video path
 * @param output Output video path
 * @param strength Smoothing strength
 * @param windowFrames Temporal window size
 * @returns Array of ffmpeg command arguments
 */
export function buildFfmpegCommand(
    input: string,
    output: string,
    strength: number,
    windowFrames: number
): string[] {
    const weights = computeTmixWeights(strength, windowFrames);
    
    // Build the tmix filter string
    const tmixFilter = `tmix=frames=${windowFrames}:weights='${weights}':normalize=1`;
    
    return [
        '-i', input,
        '-vf', tmixFilter,
        '-c:a', 'copy',  // Copy audio without re-encoding
        '-y',            // Overwrite output file
        output,
    ];
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

/**
 * Parse command-line arguments
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): TemporalRegularizerArgs {
    const args: TemporalRegularizerArgs = {
        strength: DEFAULT_STRENGTH,
        windowFrames: DEFAULT_WINDOW_FRAMES,
        dryRun: false,
        verbose: false,
        help: false,
    };
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        
        switch (arg) {
            case '--input':
            case '-i':
                args.input = next;
                i++;
                break;
            case '--output':
            case '-o':
                args.output = next;
                i++;
                break;
            case '--strength':
            case '-s':
                args.strength = parseFloat(next ?? '') || DEFAULT_STRENGTH;
                i++;
                break;
            case '--window-frames':
            case '-w':
                args.windowFrames = parseInt(next ?? '', 10) || DEFAULT_WINDOW_FRAMES;
                i++;
                break;
            case '--dry-run':
            case '-d':
                args.dryRun = true;
                break;
            case '--verbose':
            case '-v':
                args.verbose = true;
                break;
            case '--help':
            case '-h':
                args.help = true;
                break;
        }
    }
    
    // Clamp window frames to valid range
    args.windowFrames = Math.max(MIN_WINDOW_FRAMES, Math.min(MAX_WINDOW_FRAMES, args.windowFrames));
    
    // Clamp strength to valid range
    args.strength = Math.max(0, Math.min(1, args.strength));
    
    return args;
}

// ============================================================================
// Help
// ============================================================================

function printHelp(): void {
    console.log(`
Temporal Regularizer - FFmpeg-based Temporal Smoothing
=======================================================

Applies temporal frame blending to reduce flicker and jitter in video files.
Uses the ffmpeg tmix filter for multi-frame averaging.

Usage:
  npx tsx scripts/temporal-regularizer.ts --input <video> [options]
  npm run temporal:regularize -- --input <video> [options]

Options:
  --input, -i <path>           Input video file path (required)
  --output, -o <path>          Output video file path
                               Default: <input-basename>-smoothed.mp4
  --strength, -s <0.0-1.0>     Smoothing strength (default: ${DEFAULT_STRENGTH})
                               Lower = preserves sharpness, Higher = more smoothing
  --window-frames, -w <N>      Temporal window size (default: ${DEFAULT_WINDOW_FRAMES})
                               Range: ${MIN_WINDOW_FRAMES}-${MAX_WINDOW_FRAMES} frames
  --dry-run, -d                Print ffmpeg command without executing
  --verbose, -v                Enable verbose logging
  --help, -h                   Show this help message

Examples:
  # Basic smoothing with defaults
  npx tsx scripts/temporal-regularizer.ts --input video.mp4

  # Stronger smoothing for heavily flickering video
  npx tsx scripts/temporal-regularizer.ts --input video.mp4 --strength 0.5 --window-frames 5

  # Preview command without running
  npx tsx scripts/temporal-regularizer.ts --input video.mp4 --dry-run --verbose

Recommended Settings:
  - Light flicker:  --strength 0.2 --window-frames 3
  - Moderate flicker: --strength 0.3 --window-frames 3 (default)
  - Heavy flicker: --strength 0.5 --window-frames 5
  - Very heavy flicker: --strength 0.6 --window-frames 7

Note: Higher settings may introduce motion blur. Experiment to find the
optimal balance for your content. Use with A/B comparison to evaluate.
`);
}

// ============================================================================
// FFmpeg Execution
// ============================================================================

/**
 * Check if ffmpeg is available
 */
async function checkFfmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ['-version'], { stdio: 'pipe' });
        proc.on('close', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
    });
}

/**
 * Run temporal regularization on a video file
 */
export async function runTemporalRegularization(
    input: string,
    output: string,
    strength: number,
    windowFrames: number,
    options: { dryRun?: boolean; verbose?: boolean } = {}
): Promise<TemporalRegularizerResult> {
    const startTime = Date.now();
    
    // Validate input exists
    if (!fs.existsSync(input)) {
        return {
            success: false,
            inputPath: input,
            command: [],
            error: `Input file not found: ${input}`,
        };
    }
    
    // Build the command
    const ffmpegArgs = buildFfmpegCommand(input, output, strength, windowFrames);
    const fullCommand = ['ffmpeg', ...ffmpegArgs];
    
    if (options.verbose) {
        console.log(`[temporal-regularizer] Input: ${input}`);
        console.log(`[temporal-regularizer] Output: ${output}`);
        console.log(`[temporal-regularizer] Strength: ${strength}`);
        console.log(`[temporal-regularizer] Window Frames: ${windowFrames}`);
        console.log(`[temporal-regularizer] Command: ${fullCommand.join(' ')}`);
    }
    
    if (options.dryRun) {
        console.log(`[DRY RUN] Would execute: ${fullCommand.join(' ')}`);
        return {
            success: true,
            inputPath: input,
            outputPath: output,
            command: fullCommand,
        };
    }
    
    // Check ffmpeg availability
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
        return {
            success: false,
            inputPath: input,
            command: fullCommand,
            error: 'ffmpeg not found in PATH. Please install ffmpeg: https://ffmpeg.org/download.html',
        };
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Execute ffmpeg
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ffmpegArgs, {
            stdio: options.verbose ? 'inherit' : 'pipe',
        });
        
        let stderr = '';
        
        if (!options.verbose && proc.stderr) {
            proc.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });
        }
        
        proc.on('close', (code) => {
            const durationMs = Date.now() - startTime;
            
            if (code !== 0) {
                resolve({
                    success: false,
                    inputPath: input,
                    command: fullCommand,
                    durationMs,
                    error: `ffmpeg exited with code ${code}${stderr ? `: ${stderr.slice(-500)}` : ''}`,
                });
                return;
            }
            
            // Verify output was created
            if (!fs.existsSync(output)) {
                resolve({
                    success: false,
                    inputPath: input,
                    command: fullCommand,
                    durationMs,
                    error: 'ffmpeg completed but output file was not created',
                });
                return;
            }
            
            resolve({
                success: true,
                inputPath: input,
                outputPath: output,
                command: fullCommand,
                durationMs,
            });
        });
        
        proc.on('error', (error) => {
            resolve({
                success: false,
                inputPath: input,
                command: fullCommand,
                durationMs: Date.now() - startTime,
                error: `Failed to spawn ffmpeg: ${error.message}`,
            });
        });
    });
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
    
    if (!args.input) {
        console.error('Error: --input is required');
        console.error('Use --help for usage information');
        process.exit(1);
    }
    
    // Determine output path
    const output = args.output || (() => {
        const parsed = path.parse(args.input);
        return path.join(parsed.dir, `${parsed.name}-smoothed${parsed.ext}`);
    })();
    
    console.log('Temporal Regularizer');
    console.log('====================');
    console.log(`Input:        ${args.input}`);
    console.log(`Output:       ${output}`);
    console.log(`Strength:     ${args.strength}`);
    console.log(`Window:       ${args.windowFrames} frames`);
    console.log(`Dry Run:      ${args.dryRun}`);
    console.log('');
    
    const result = await runTemporalRegularization(
        args.input,
        output,
        args.strength,
        args.windowFrames,
        { dryRun: args.dryRun, verbose: args.verbose }
    );
    
    if (result.success) {
        console.log(`✅ Temporal regularization complete`);
        if (result.outputPath) {
            console.log(`   Output: ${result.outputPath}`);
        }
        if (result.durationMs) {
            console.log(`   Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
        }
        process.exit(0);
    } else {
        console.error(`❌ Temporal regularization failed`);
        console.error(`   Error: ${result.error}`);
        process.exit(1);
    }
}

// Run if executed directly (not when imported for tests)
const isMainModule = process.argv[1]?.replace(/\\/g, '/').includes('temporal-regularizer');
if (isMainModule) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
