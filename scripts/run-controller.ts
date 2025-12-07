#!/usr/bin/env npx tsx
/**
 * Run Controller Script
 * 
 * Orchestrates pipeline runs from the React UI. This script:
 * - Accepts run requests via command-line arguments
 * - Spawns the appropriate pipeline script (run-pipeline.ts or run-narrative.ts)
 * - Writes progress updates to public/run-status.json for UI polling
 * - Captures stdout/stderr and logs events
 * 
 * Usage:
 *   # Production pipeline
 *   npx tsx scripts/run-controller.ts --type production --pipeline production-qa-golden --sample sample-001-geometric
 *   
 *   # Narrative pipeline
 *   npx tsx scripts/run-controller.ts --type narrative --script config/narrative/demo-three-shot.json
 *   
 *   # With options
 *   npx tsx scripts/run-controller.ts --type production --pipeline production-qa-golden --sample sample-001-geometric --temporal on --verbose
 *   
 *   # List available options
 *   npx tsx scripts/run-controller.ts --list
 *   
 *   # Check current run status
 *   npx tsx scripts/run-controller.ts --status
 *   
 *   # Cancel running run
 *   npx tsx scripts/run-controller.ts --cancel
 * 
 * Output:
 *   Writes to public/run-status.json with current run state
 *   UI polls this file to display progress
 * 
 * @module scripts/run-controller
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import type {
    RunRequest,
    RunState,
    RunStatusFile,
    RunProgressEvent,
    SampleInfo,
    NarrativeScriptInfo,
    ListOptionsResponse,
    PipelineType,
    TemporalMode,
} from '../types/pipelineRun';
import { isProductionRunRequest, isNarrativeRunRequest } from '../types/pipelineRun';
import type { RunOptions } from '../types/runRegistry';
import {
    createRegistryEntry,
    addRunToRegistry,
    updateRunInRegistry,
    extractProductionArtifacts,
    extractNarrativeArtifacts,
    extractWarnings,
} from './utils/runRegistry';
import {
    validateComfyUIOutputDir,
    validateProductionInputs,
    validateNarrativeInputs,
    formatValidationErrors,
} from './utils/runControllerUtils';

// ============================================================================
// Local Types
// ============================================================================

/**
 * Step timing for tracking execution duration
 */
interface StepTiming {
    stepId: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    status: 'running' | 'complete' | 'failed';
}

// ============================================================================
// Constants
// ============================================================================

// ESM-compatible path resolution (replaces __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATUS_FILE_PATH = path.join(PROJECT_ROOT, 'public', 'run-status.json');
const SAMPLES_DIR = path.join(PROJECT_ROOT, 'data', 'bookend-golden-samples');
const NARRATIVE_CONFIG_DIR = path.join(PROJECT_ROOT, 'config', 'narrative');

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
    type?: PipelineType;
    pipeline?: string;
    sample?: string;
    script?: string;
    temporal?: TemporalMode;
    verbose?: boolean;
    dryRun?: boolean;
    timeout?: number;
    list?: boolean;
    status?: boolean;
    cancel?: boolean;
    help?: boolean;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {};
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        
        switch (arg) {
            case '--type':
            case '-t':
                if (next === 'production' || next === 'narrative') {
                    args.type = next;
                }
                i++;
                break;
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
            case '--script':
                args.script = next;
                i++;
                break;
            case '--temporal':
                if (next === 'on' || next === 'off' || next === 'auto') {
                    args.temporal = next;
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
            case '--timeout':
                if (next && !isNaN(parseInt(next, 10))) {
                    args.timeout = parseInt(next, 10);
                    i++;
                } else {
                    console.error('❌ --timeout requires a number (seconds)');
                    process.exit(1);
                }
                break;
            case '--list':
            case '-l':
                args.list = true;
                break;
            case '--status':
                args.status = true;
                break;
            case '--cancel':
                args.cancel = true;
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
// Status File Management
// ============================================================================

function readStatusFile(): RunStatusFile {
    try {
        if (fs.existsSync(STATUS_FILE_PATH)) {
            const content = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
            return JSON.parse(content);
        }
    } catch {
        // Ignore errors, return empty state
    }
    return {
        version: '1.0',
        run: null,
        lastUpdated: new Date().toISOString(),
    };
}

function writeStatusFile(status: RunStatusFile): void {
    const dir = path.dirname(STATUS_FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // Write atomically via temp file
    const tempPath = `${STATUS_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(status, null, 2));
    fs.renameSync(tempPath, STATUS_FILE_PATH);
}

function updateRunState(updates: Partial<RunState>): void {
    const status = readStatusFile();
    if (status.run) {
        Object.assign(status.run, updates);
    }
    status.lastUpdated = new Date().toISOString();
    writeStatusFile(status);
}

function addProgressEvent(event: Omit<RunProgressEvent, 'timestamp'>): void {
    const status = readStatusFile();
    if (status.run) {
        status.run.events.push({
            ...event,
            timestamp: new Date().toISOString(),
        });
    }
    status.lastUpdated = new Date().toISOString();
    writeStatusFile(status);
}

// ============================================================================
// Discovery Functions
// ============================================================================

function listSamples(): SampleInfo[] {
    const samples: SampleInfo[] = [];
    try {
        if (fs.existsSync(SAMPLES_DIR)) {
            const entries = fs.readdirSync(SAMPLES_DIR, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.startsWith('sample-')) {
                    // Try to read sample info from sample.json if exists
                    const sampleJsonPath = path.join(SAMPLES_DIR, entry.name, 'sample.json');
                    let description: string | undefined;
                    if (fs.existsSync(sampleJsonPath)) {
                        try {
                            const info = JSON.parse(fs.readFileSync(sampleJsonPath, 'utf-8'));
                            description = info.description;
                        } catch {
                            // Ignore
                        }
                    }
                    samples.push({
                        id: entry.name,
                        name: entry.name.replace('sample-', '').replace(/-/g, ' '),
                        description,
                    });
                }
            }
        }
    } catch {
        // Ignore errors
    }
    return samples;
}

function listNarrativeScripts(): NarrativeScriptInfo[] {
    const scripts: NarrativeScriptInfo[] = [];
    try {
        if (fs.existsSync(NARRATIVE_CONFIG_DIR)) {
            const entries = fs.readdirSync(NARRATIVE_CONFIG_DIR);
            for (const entry of entries) {
                if (entry.endsWith('.json')) {
                    const scriptPath = path.join(NARRATIVE_CONFIG_DIR, entry);
                    try {
                        const content = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
                        scripts.push({
                            path: `config/narrative/${entry}`,
                            id: content.id || entry.replace('.json', ''),
                            title: content.title,
                            description: content.description,
                            shotCount: Array.isArray(content.shots) ? content.shots.length : 0,
                        });
                    } catch {
                        // Ignore invalid JSON
                    }
                }
            }
        }
    } catch {
        // Ignore errors
    }
    return scripts;
}

function listPipelines(): { id: string; description: string }[] {
    // Currently only one pipeline is available
    return [
        {
            id: 'production-qa-golden',
            description: 'Full generation → temporal regularization → Vision QA → benchmark → manifest',
        },
    ];
}

// ============================================================================
// Run Execution
// ============================================================================

let activeProcess: ChildProcess | null = null;

function generateRunId(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const random = Math.random().toString(36).substring(2, 8);
    return `run-${timestamp}-${random}`;
}

async function startRun(request: RunRequest, timeoutMs?: number): Promise<void> {
    // Check if a run is already in progress
    const currentStatus = readStatusFile();
    if (currentStatus.run && (currentStatus.run.status === 'running' || currentStatus.run.status === 'queued')) {
        console.error('❌ A run is already in progress. Use --cancel to stop it first.');
        process.exit(1);
    }
    
    // === Input Validation ===
    const validationWarnings: string[] = [];
    
    // Validate ComfyUI output directory (non-blocking warning)
    const comfyOutputResult = validateComfyUIOutputDir();
    if (!comfyOutputResult.valid) {
        validationWarnings.push(`ComfyUI output: ${comfyOutputResult.error}`);
        console.warn(`⚠️  ${comfyOutputResult.error}`);
        if (comfyOutputResult.suggestion) {
            console.warn(`   ${comfyOutputResult.suggestion}`);
        }
    } else {
        console.log(`✓ ComfyUI output: ${comfyOutputResult.resolvedPath} (${comfyOutputResult.source})`);
    }
    
    // Validate type-specific inputs
    if (isProductionRunRequest(request)) {
        const validation = validateProductionInputs(PROJECT_ROOT, SAMPLES_DIR, request.sampleId);
        if (!validation.valid) {
            console.error(formatValidationErrors(validation));
            process.exit(1);
        }
        validationWarnings.push(...validation.warnings);
    } else if (isNarrativeRunRequest(request)) {
        const validation = validateNarrativeInputs(PROJECT_ROOT, request.scriptPath);
        if (!validation.valid) {
            console.error(formatValidationErrors(validation));
            process.exit(1);
        }
        validationWarnings.push(...validation.warnings);
    }
    
    const runId = generateRunId();
    const startedAt = new Date().toISOString();
    
    // Determine script and arguments
    let scriptPath: string;
    let scriptArgs: string[];
    let identifier: string;
    let pipelineType: PipelineType;
    
    if (isProductionRunRequest(request)) {
        pipelineType = 'production';
        scriptPath = path.join(PROJECT_ROOT, 'scripts', 'run-pipeline.ts');
        identifier = `${request.pipelineId} (${request.sampleId})`;
        scriptArgs = [
            '--pipeline', request.pipelineId,
            '--sample', request.sampleId,
        ];
        if (request.temporalMode) {
            scriptArgs.push('--temporal-regularization', request.temporalMode);
        }
    } else if (isNarrativeRunRequest(request)) {
        pipelineType = 'narrative';
        scriptPath = path.join(PROJECT_ROOT, 'scripts', 'run-narrative.ts');
        identifier = request.scriptPath;
        scriptArgs = ['--script', request.scriptPath];
        if (request.temporalMode) {
            scriptArgs.push('--temporal', request.temporalMode);
        }
    } else {
        console.error('❌ Invalid run request type');
        process.exit(1);
    }
    
    // Add common options
    if (request.verbose) {
        scriptArgs.push('--verbose');
    }
    if (request.dryRun) {
        scriptArgs.push('--dry-run');
    }
    
    // Initialize run state
    const initialState: RunState = {
        runId,
        pipelineType,
        status: 'running',
        identifier,
        startedAt,
        events: [],
    };
    
    writeStatusFile({
        version: '1.0',
        run: initialState,
        lastUpdated: startedAt,
    });
    
    // Add to run registry
    const runOptions: RunOptions = {
        sample: isProductionRunRequest(request) ? request.sampleId : undefined,
        script: isNarrativeRunRequest(request) ? request.scriptPath : undefined,
        temporal: request.temporalMode,
        verbose: request.verbose,
        dryRun: request.dryRun,
    };
    const registryEntry = createRegistryEntry(
        runId,
        pipelineType,
        identifier,
        runOptions,
        isProductionRunRequest(request) ? request.pipelineId : undefined
    );
    addRunToRegistry(registryEntry);
    
    addProgressEvent({
        eventType: 'log',
        message: `Starting ${pipelineType} pipeline: ${identifier}`,
    });
    
    console.log(`🚀 Starting run: ${runId}`);
    console.log(`   Type: ${pipelineType}`);
    console.log(`   Identifier: ${identifier}`);
    console.log(`   Script: ${scriptPath}`);
    console.log(`   Args: ${scriptArgs.join(' ')}`);
    
    // Spawn the pipeline script
    const npxPath = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    activeProcess = spawn(npxPath, ['tsx', scriptPath, ...scriptArgs], {
        cwd: PROJECT_ROOT,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1' },
        shell: process.platform === 'win32', // Use shell on Windows to avoid EINVAL
    });
    
    // === Timeout Handling ===
    let timeoutTimer: NodeJS.Timeout | null = null;
    if (timeoutMs && timeoutMs > 0) {
        console.log(`⏱️  Timeout set: ${Math.round(timeoutMs / 1000)}s`);
        timeoutTimer = setTimeout(() => {
            console.error(`\n⏱️  Run timed out after ${Math.round(timeoutMs / 1000)} seconds`);
            addProgressEvent({
                eventType: 'error',
                message: `Run timed out after ${Math.round(timeoutMs / 1000)} seconds`,
            });
            updateRunState({
                status: 'failed',
                errorMessage: `Timeout after ${Math.round(timeoutMs / 1000)}s`,
            });
            if (activeProcess) {
                activeProcess.kill('SIGTERM');
            }
        }, timeoutMs);
    }
    
    // === Step Timing Tracking ===
    const stepTimings: StepTiming[] = [];
    let currentStepTiming: StepTiming | null = null;
    
    // Handle stdout
    activeProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
            console.log(line);
            
            // Parse progress from output
            if (line.includes('[PIPELINE]')) {
                // Extract step information
                const stepMatch = line.match(/Step (\d+)\/(\d+)/);
                if (stepMatch && stepMatch[1] && stepMatch[2]) {
                    updateRunState({
                        completedSteps: parseInt(stepMatch[1], 10),
                        totalSteps: parseInt(stepMatch[2], 10),
                    });
                }
                
                // Extract step ID
                const stepIdMatch = line.match(/Starting step: (\S+)/);
                if (stepIdMatch && stepIdMatch[1]) {
                    // Complete previous step timing if exists
                    if (currentStepTiming) {
                        currentStepTiming.endTime = Date.now();
                        currentStepTiming.durationMs = currentStepTiming.endTime - currentStepTiming.startTime;
                        currentStepTiming.status = 'complete';
                    }
                    // Start new step timing
                    currentStepTiming = {
                        stepId: stepIdMatch[1],
                        startTime: Date.now(),
                        status: 'running',
                    };
                    stepTimings.push(currentStepTiming);
                    
                    updateRunState({ currentStep: stepIdMatch[1] });
                    addProgressEvent({
                        eventType: 'step-start',
                        stepId: stepIdMatch[1],
                        message: line,
                    });
                }
                
                // Extract step completion
                const completeMatch = line.match(/Step (\S+) completed/);
                if (completeMatch && completeMatch[1]) {
                    // Find and complete the step timing
                    const stepTiming = stepTimings.find(st => st.stepId === completeMatch[1]);
                    if (stepTiming) {
                        stepTiming.endTime = Date.now();
                        stepTiming.durationMs = stepTiming.endTime - stepTiming.startTime;
                        stepTiming.status = 'complete';
                    }
                    if (currentStepTiming?.stepId === completeMatch[1]) {
                        currentStepTiming = null;
                    }
                    
                    addProgressEvent({
                        eventType: 'step-complete',
                        stepId: completeMatch[1],
                        message: line,
                    });
                }
            } else if (line.includes('✅')) {
                addProgressEvent({
                    eventType: 'log',
                    message: line,
                });
            } else if (line.includes('⚠️') || line.includes('Warning')) {
                addProgressEvent({
                    eventType: 'warning',
                    message: line,
                });
            }
        }
    });
    
    // Handle stderr
    activeProcess.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
            console.error(line);
            addProgressEvent({
                eventType: 'error',
                message: line,
            });
        }
    });
    
    // Handle stream errors (EPIPE, etc.)
    activeProcess.stdout?.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
            console.warn('⚠️  stdout stream closed (EPIPE) - process may have terminated');
        } else {
            console.error(`stdout error: ${err.message}`);
        }
    });
    
    activeProcess.stderr?.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
            console.warn('⚠️  stderr stream closed (EPIPE) - process may have terminated');
        } else {
            console.error(`stderr error: ${err.message}`);
        }
    });
    
    // Handle process exit
    activeProcess.on('close', (code: number | null) => {
        // Clear timeout if set
        if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
        }
        
        // Complete any running step timing
        if (currentStepTiming) {
            currentStepTiming.endTime = Date.now();
            currentStepTiming.durationMs = currentStepTiming.endTime - currentStepTiming.startTime;
            currentStepTiming.status = code === 0 ? 'complete' : 'failed';
        }
        
        const finishedAt = new Date().toISOString();
        const startTime = new Date(startedAt).getTime();
        const durationMs = Date.now() - startTime;
        
        const status = code === 0 ? 'succeeded' : 'failed';
        const message = code === 0
            ? `Pipeline completed successfully in ${formatDuration(durationMs)}`
            : `Pipeline failed with exit code ${code}`;
        
        // Include step timings in run state
        const stepTimingSummary = stepTimings.map(st => ({
            stepId: st.stepId,
            durationMs: st.durationMs ?? 0,
            status: st.status,
        }));
        
        updateRunState({
            status,
            finishedAt,
            durationMs,
            errorMessage: code !== 0 ? `Exit code: ${code}` : undefined,
            stepTimings: stepTimingSummary,
            validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
        });
        
        // Update run registry with completion status
        // Try to read summary file and extract artifacts/warnings
        try {
            const summaryPath = pipelineType === 'production'
                ? path.join(PROJECT_ROOT, 'public', 'latest-run-summary.json')
                : path.join(PROJECT_ROOT, 'public', 'latest-narrative-summary.json');
            
            if (fs.existsSync(summaryPath)) {
                const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
                const summary = JSON.parse(summaryContent);
                
                const artifacts = pipelineType === 'production'
                    ? extractProductionArtifacts(summary)
                    : extractNarrativeArtifacts(summary);
                
                const warnings = extractWarnings(summary);
                
                updateRunInRegistry(runId, {
                    status,
                    finishedAt,
                    durationMs,
                    artifacts,
                    warnings,
                    validationWarnings,
                    stepTimings: stepTimingSummary,
                    visionQaStatus: summary.visionQaStatus,
                    benchmarkStatus: summary.benchmarkJsonPath ? 'available' : 'missing',
                });
            } else {
                // No summary file, just update status
                updateRunInRegistry(runId, {
                    status,
                    finishedAt,
                    durationMs,
                    validationWarnings,
                    stepTimings: stepTimingSummary,
                });
            }
        } catch (error) {
            console.warn(`[RunRegistry] Failed to update registry with artifacts: ${error}`);
            // Still update status even if artifact extraction failed
            updateRunInRegistry(runId, {
                status,
                finishedAt,
                durationMs,
                validationWarnings,
                stepTimings: stepTimingSummary,
            });
        }
        
        addProgressEvent({
            eventType: code === 0 ? 'log' : 'error',
            message,
        });
        
        console.log(code === 0 ? `✅ ${message}` : `❌ ${message}`);
        activeProcess = null;
        
        process.exit(code ?? 0);
    });
    
    // Handle signals
    process.on('SIGINT', () => {
        console.log('\n⚠️ Received SIGINT, cancelling run...');
        cancelRun();
    });
    
    process.on('SIGTERM', () => {
        console.log('\n⚠️ Received SIGTERM, cancelling run...');
        cancelRun();
    });
}

function cancelRun(): void {
    // Get current run ID for registry update
    const currentStatus = readStatusFile();
    const runId = currentStatus.run?.runId;
    const finishedAt = new Date().toISOString();
    
    if (activeProcess) {
        activeProcess.kill('SIGTERM');
        updateRunState({
            status: 'cancelled',
            finishedAt,
        });
        // Update registry
        if (runId) {
            updateRunInRegistry(runId, {
                status: 'cancelled',
                finishedAt,
            });
        }
        addProgressEvent({
            eventType: 'log',
            message: 'Run cancelled by user',
        });
        console.log('🛑 Run cancelled');
    } else {
        // Check if there's a stale running status
        if (currentStatus.run && (currentStatus.run.status === 'running' || currentStatus.run.status === 'queued')) {
            updateRunState({
                status: 'cancelled',
                finishedAt,
            });
            // Update registry
            if (runId) {
                updateRunInRegistry(runId, {
                    status: 'cancelled',
                    finishedAt,
                });
            }
            addProgressEvent({
                eventType: 'log',
                message: 'Run marked as cancelled (process not found)',
            });
            console.log('🛑 Marked run as cancelled');
        } else {
            console.log('ℹ️ No active run to cancel');
        }
    }
}

// ============================================================================
// Utilities
// ============================================================================

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function printHelp(): void {
    console.log(`
Run Controller CLI
==================

Orchestrates pipeline runs from the React UI.

Usage:
  npx tsx scripts/run-controller.ts --type <type> [options]
  npx tsx scripts/run-controller.ts --list
  npx tsx scripts/run-controller.ts --status
  npx tsx scripts/run-controller.ts --cancel

Run Options:
  --type, -t <type>      Pipeline type: 'production' or 'narrative' (required for runs)
  --pipeline, -p <id>    Pipeline ID for production runs (default: production-qa-golden)
  --sample, -s <id>      Sample ID for production runs (default: sample-001-geometric)
  --script <path>        Script path for narrative runs (required for narrative type)
  --temporal <mode>      Temporal regularization: on, off, auto (default: auto)
  --verbose, -v          Enable verbose output
  --dry-run, -d          Simulate run without executing

Other Commands:
  --list, -l             List available samples, scripts, and pipelines
  --status               Show current run status
  --cancel               Cancel any active run
  --help, -h             Show this help message

Examples:
  # Run production pipeline with default sample
  npx tsx scripts/run-controller.ts --type production --pipeline production-qa-golden

  # Run production with specific sample and verbose output
  npx tsx scripts/run-controller.ts -t production -p production-qa-golden -s sample-002-character -v

  # Run narrative pipeline
  npx tsx scripts/run-controller.ts --type narrative --script config/narrative/demo-three-shot.json

  # List all available options
  npx tsx scripts/run-controller.ts --list

  # Check current run status
  npx tsx scripts/run-controller.ts --status

  # Cancel active run
  npx tsx scripts/run-controller.ts --cancel

Output:
  Writes progress to public/run-status.json for UI polling.
  UI can fetch /run-status.json to track run progress.
`);
}

function printList(): void {
    const samples = listSamples();
    const scripts = listNarrativeScripts();
    const pipelines = listPipelines();
    
    const response: ListOptionsResponse = { samples, scripts, pipelines };
    
    console.log('\nAvailable Options:');
    console.log('==================\n');
    
    console.log('Pipelines:');
    for (const p of pipelines) {
        console.log(`  ${p.id}`);
        console.log(`    ${p.description}`);
    }
    console.log('');
    
    console.log('Samples:');
    for (const s of samples) {
        console.log(`  ${s.id}`);
        if (s.description) {
            console.log(`    ${s.description}`);
        }
    }
    console.log('');
    
    console.log('Narrative Scripts:');
    for (const n of scripts) {
        console.log(`  ${n.path}`);
        console.log(`    ID: ${n.id}, Shots: ${n.shotCount}`);
        if (n.title) {
            console.log(`    Title: ${n.title}`);
        }
    }
    console.log('');
    
    // Also output JSON for programmatic use
    console.log('JSON Output:');
    console.log(JSON.stringify(response, null, 2));
}

function printStatus(): void {
    const status = readStatusFile();
    
    console.log('\nRun Status:');
    console.log('===========\n');
    
    if (!status.run) {
        console.log('No active or recent run.');
        return;
    }
    
    const run = status.run;
    const statusEmoji = {
        queued: '⏳',
        running: '🔄',
        succeeded: '✅',
        failed: '❌',
        cancelled: '🛑',
    }[run.status];
    
    console.log(`Run ID: ${run.runId}`);
    console.log(`Status: ${statusEmoji} ${run.status}`);
    console.log(`Type: ${run.pipelineType}`);
    console.log(`Identifier: ${run.identifier}`);
    console.log(`Started: ${run.startedAt}`);
    
    if (run.finishedAt) {
        console.log(`Finished: ${run.finishedAt}`);
    }
    if (run.durationMs) {
        console.log(`Duration: ${formatDuration(run.durationMs)}`);
    }
    if (run.currentStep) {
        console.log(`Current Step: ${run.currentStep}`);
    }
    if (run.completedSteps !== undefined && run.totalSteps !== undefined) {
        console.log(`Progress: ${run.completedSteps}/${run.totalSteps} steps`);
    }
    if (run.errorMessage) {
        console.log(`Error: ${run.errorMessage}`);
    }
    
    if (run.events.length > 0) {
        console.log('\nRecent Events:');
        const recentEvents = run.events.slice(-5);
        for (const event of recentEvents) {
            const time = new Date(event.timestamp).toLocaleTimeString();
            console.log(`  [${time}] ${event.eventType}: ${event.message || event.stepId || ''}`);
        }
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
        return;
    }
    
    if (args.list) {
        printList();
        return;
    }
    
    if (args.status) {
        printStatus();
        return;
    }
    
    if (args.cancel) {
        cancelRun();
        return;
    }
    
    // Validate run request
    if (!args.type) {
        console.error('❌ Missing --type argument. Use --type production or --type narrative');
        console.error('   Use --help for usage information.');
        process.exit(1);
    }
    
    let request: RunRequest;
    
    if (args.type === 'production') {
        request = {
            type: 'production',
            pipelineId: args.pipeline || 'production-qa-golden',
            sampleId: args.sample || 'sample-001-geometric',
            temporalMode: args.temporal,
            verbose: args.verbose,
            dryRun: args.dryRun,
        };
    } else if (args.type === 'narrative') {
        if (!args.script) {
            console.error('❌ Missing --script argument for narrative pipeline');
            console.error('   Example: --script config/narrative/demo-three-shot.json');
            process.exit(1);
        }
        request = {
            type: 'narrative',
            scriptPath: args.script,
            temporalMode: args.temporal,
            verbose: args.verbose,
            dryRun: args.dryRun,
        };
    } else {
        console.error('❌ Invalid --type argument. Use --type production or --type narrative');
        process.exit(1);
    }
    
    await startRun(request, args.timeout ? args.timeout * 1000 : undefined);
}

main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
