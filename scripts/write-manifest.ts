#!/usr/bin/env npx tsx
/**
 * Write Manifest CLI
 * 
 * Command-line utility to write generation manifests to disk.
 * Called from PowerShell scripts after successful video generation.
 * 
 * Usage:
 *   npx tsx scripts/write-manifest.ts --manifest <json-string>
 *   npx tsx scripts/write-manifest.ts --file <manifest.json>
 *   npx tsx scripts/write-manifest.ts --build --type video --scene scene-001 --shot shot-001 \
 *       --workflow-id wan-i2v --prompt "A cinematic scene..." --seed 42 --output-dir ./logs/run-123
 * 
 * Arguments:
 *   --manifest <json>     Manifest JSON as a string (for inline data)
 *   --file <path>         Path to a manifest JSON file to read and persist
 *   --build               Build a new manifest from parameters
 *   --type                Generation type: keyframe, video, upscale, batch
 *   --scene <id>          Scene ID
 *   --shot <id>           Shot ID
 *   --workflow-id <id>    Workflow profile ID
 *   --prompt <text>       Positive prompt text
 *   --negative <text>     Negative prompt text
 *   --seed <number>       Random seed used
 *   --output-dir <path>   Directory where video output was written
 *   --video-file <name>   Video filename (e.g., scene-001.mp4)
 *   --comfyui-url <url>   ComfyUI server URL (default: http://127.0.0.1:8188)
 *   --prompt-id <id>      ComfyUI prompt ID
 *   --project-root <path> Project root override
 *   --dry-run             Print manifest without writing to disk
 *   --help                Show this help message
 * 
 * @module scripts/write-manifest
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    type GenerationManifest,
    buildManifest,
    completeManifest,
    serializeManifest,
    getManifestFilename,
} from '../services/generationManifestService';
import {
    writeManifestSync,
    getManifestsDir,
} from '../services/generationManifestNodeWriter';
import type { LocalGenerationSettings, WorkflowProfile } from '../types';

// ============================================================================
// Argument Parsing
// ============================================================================

interface CliArgs {
    manifest?: string;
    file?: string;
    build?: boolean;
    type?: 'keyframe' | 'video' | 'upscale' | 'batch';
    scene?: string;
    shot?: string;
    workflowId?: string;
    prompt?: string;
    negative?: string;
    seed?: number;
    outputDir?: string;
    videoFile?: string;
    comfyuiUrl?: string;
    promptId?: string;
    projectRoot?: string;
    dryRun?: boolean;
    help?: boolean;
    // Telemetry
    flf2vEnabled?: boolean;
    flf2vSource?: 'keyframe' | 'last-frame';
    flf2vFallback?: boolean;
    interpolationElapsed?: number;
    upscaleMethod?: string;
    finalFps?: number;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {};
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        
        switch (arg) {
            case '--manifest':
                args.manifest = next;
                i++;
                break;
            case '--file':
                args.file = next;
                i++;
                break;
            case '--build':
                args.build = true;
                break;
            case '--type':
                args.type = next as CliArgs['type'];
                i++;
                break;
            case '--scene':
                args.scene = next;
                i++;
                break;
            case '--shot':
                args.shot = next;
                i++;
                break;
            case '--workflow-id':
                args.workflowId = next;
                i++;
                break;
            case '--prompt':
                args.prompt = next;
                i++;
                break;
            case '--negative':
                args.negative = next;
                i++;
                break;
            case '--seed':
                args.seed = next ? parseInt(next, 10) : undefined;
                i++;
                break;
            case '--output-dir':
                args.outputDir = next;
                i++;
                break;
            case '--video-file':
                args.videoFile = next;
                i++;
                break;
            case '--comfyui-url':
                args.comfyuiUrl = next;
                i++;
                break;
            case '--prompt-id':
                args.promptId = next;
                i++;
                break;
            case '--project-root':
                args.projectRoot = next;
                i++;
                break;
            case '--dry-run':
                args.dryRun = true;
                break;
            case '--help':
            case '-h':
                args.help = true;
                break;
            // Telemetry
            case '--flf2v-enabled':
                args.flf2vEnabled = next === 'true';
                i++;
                break;
            case '--flf2v-source':
                args.flf2vSource = next as 'keyframe' | 'last-frame';
                i++;
                break;
            case '--flf2v-fallback':
                args.flf2vFallback = next === 'true';
                i++;
                break;
            case '--interpolation-elapsed':
                args.interpolationElapsed = next ? parseInt(next, 10) : undefined;
                i++;
                break;
            case '--upscale-method':
                args.upscaleMethod = next;
                i++;
                break;
            case '--final-fps':
                args.finalFps = next ? parseInt(next, 10) : undefined;
                i++;
                break;
        }
    }
    
    return args;
}

function showHelp(): void {
    console.log(`
Write Manifest CLI - Persist generation manifests to disk

USAGE:
  npx tsx scripts/write-manifest.ts [options]

OPTIONS:
  --manifest <json>     Manifest JSON as a string (for inline data)
  --file <path>         Path to a manifest JSON file to read and persist
  --build               Build a new manifest from parameters:
    --type <type>       Generation type: keyframe, video, upscale, batch
    --scene <id>        Scene ID
    --shot <id>         Shot ID
    --workflow-id <id>  Workflow profile ID (e.g., wan-i2v)
    --prompt <text>     Positive prompt text
    --negative <text>   Negative prompt text
    --seed <number>     Random seed used
    --output-dir <path> Directory where video output was written
    --video-file <name> Video filename (e.g., scene-001.mp4)
    --comfyui-url <url> ComfyUI server URL (default: http://127.0.0.1:8188)
    --prompt-id <id>    ComfyUI prompt ID
  --project-root <path> Project root override
  --dry-run             Print manifest without writing to disk
  --help                Show this help message

EXAMPLES:
  # Write a pre-built manifest from JSON
  npx tsx scripts/write-manifest.ts --manifest '{"manifestVersion":"1.0.0",...}'

  # Build and write a video manifest
  npx tsx scripts/write-manifest.ts --build --type video --scene scene-001 \\
      --workflow-id wan-i2v --prompt "A cinematic scene" --seed 42

OUTPUT:
  Manifests are written to: data/manifests/manifest_<type>_<scene>_<shot>_<timestamp>.json
`);
}

// ============================================================================
// Manifest Building
// ============================================================================

function buildMinimalSettings(comfyUIUrl: string): LocalGenerationSettings {
    // Minimal settings for manifest building - only required fields
    return {
        comfyUIUrl: comfyUIUrl || 'http://127.0.0.1:8188',
        comfyUIClientId: 'manifest-cli',
        workflowJson: '{}',
        mapping: {},
        videoProvider: 'comfyui-local',
        workflowProfiles: {},
    };
}

function buildMinimalProfile(workflowId: string): WorkflowProfile {
    return {
        id: workflowId,
        label: workflowId,
        workflowJson: '{}',
        mapping: {},
        category: 'video',
        status: 'complete',
    };
}

function buildManifestFromArgs(args: CliArgs): GenerationManifest {
    const settings = buildMinimalSettings(args.comfyuiUrl || 'http://127.0.0.1:8188');
    const profile = buildMinimalProfile(args.workflowId || 'unknown');
    
    let manifest = buildManifest({
        generationType: args.type || 'video',
        sceneId: args.scene,
        shotId: args.shot,
        settings,
        workflowProfile: profile,
        prompt: args.prompt,
        negativePrompt: args.negative,
        seed: args.seed,
        seedExplicit: args.seed !== undefined,
        promptId: args.promptId,
        flf2v: args.flf2vEnabled !== undefined ? {
            enabled: args.flf2vEnabled,
            source: args.flf2vSource || 'keyframe',
            fallback: args.flf2vFallback || false,
        } : undefined,
        postProcessingStats: (args.interpolationElapsed !== undefined || args.upscaleMethod !== undefined || args.finalFps !== undefined) ? {
            interpolationElapsed: args.interpolationElapsed,
            upscaleMethod: args.upscaleMethod,
            finalFps: args.finalFps,
        } : undefined,
    });
    
    // If video file is provided, complete the manifest with output info
    if (args.videoFile) {
        manifest = completeManifest(manifest, {
            videoFilename: args.videoFile,
            videoPath: args.outputDir ? path.join(args.outputDir, args.videoFile) : args.videoFile,
        });
    }
    
    return manifest;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs();
    
    if (args.help) {
        showHelp();
        process.exit(0);
    }
    
    let manifest: GenerationManifest | null = null;
    
    // Mode 1: Parse manifest from JSON string
    if (args.manifest) {
        try {
            manifest = JSON.parse(args.manifest) as GenerationManifest;
        } catch (err) {
            console.error('ERROR: Failed to parse manifest JSON:', err);
            process.exit(1);
        }
    }
    
    // Mode 2: Read manifest from file
    else if (args.file) {
        try {
            const content = fs.readFileSync(args.file, 'utf-8');
            manifest = JSON.parse(content) as GenerationManifest;
        } catch (err) {
            console.error('ERROR: Failed to read manifest file:', err);
            process.exit(1);
        }
    }
    
    // Mode 3: Build manifest from arguments
    else if (args.build) {
        if (!args.type) {
            console.error('ERROR: --type is required when using --build');
            process.exit(1);
        }
        manifest = buildManifestFromArgs(args);
    }
    
    // No mode specified
    else {
        console.error('ERROR: Must specify --manifest, --file, or --build');
        showHelp();
        process.exit(1);
    }
    
    // Validate manifest
    if (!manifest || !manifest.manifestId) {
        console.error('ERROR: Invalid manifest (missing manifestId)');
        process.exit(1);
    }
    
    // Dry run - just print
    if (args.dryRun) {
        console.log('=== DRY RUN - Manifest content ===');
        console.log(serializeManifest(manifest));
        console.log('');
        console.log(`Filename: ${getManifestFilename(manifest)}`);
        console.log(`Would write to: ${getManifestsDir(args.projectRoot)}`);
        process.exit(0);
    }
    
    // Write manifest to disk
    const result = writeManifestSync(manifest, {
        projectRoot: args.projectRoot,
        outputDir: args.outputDir ? path.join(args.outputDir, 'manifests') : undefined,
    });
    
    if (result.success) {
        console.log('SUCCESS: Manifest written');
        console.log(`  Path: ${result.path}`);
        console.log(`  Filename: ${result.filename}`);
        console.log(`  Manifest ID: ${manifest.manifestId}`);
        process.exit(0);
    } else {
        console.error('ERROR: Failed to write manifest:', result.error);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
