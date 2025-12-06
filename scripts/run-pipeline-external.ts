#!/usr/bin/env ts-node
/**
 * run-pipeline-external.ts
 * 
 * Bridge script for external orchestrator (Temporal) PoC integration.
 * Falls back gracefully to direct execution when Temporal is not available.
 * 
 * Usage:
 *   npx ts-node scripts/run-pipeline-external.ts --check
 *   npx ts-node scripts/run-pipeline-external.ts --pipeline production-qa-preview --sample geometric-baseline
 *   npx ts-node scripts/run-pipeline-external.ts --golden-set --parallel 2
 * 
 * Environment Variables:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 *   TEMPORAL_NAMESPACE - Temporal namespace (default: default)
 *   TEMPORAL_TASK_QUEUE - Task queue name (default: gemDirect-pipelines)
 * 
 * If Temporal is not configured or unavailable, runs pipelines directly
 * using the local orchestrator (scripts/run-golden-set.ts).
 */

import * as path from 'path';
import { spawn } from 'child_process';

// ============================================================================
// Configuration
// ============================================================================

interface ExternalConfig {
    temporalAddress: string;
    temporalNamespace: string;
    taskQueue: string;
    enabled: boolean;
}

interface PipelineRunArgs {
    pipelineConfigId?: string;
    sampleId?: string;
    seed?: number;
    goldenSet?: boolean;
    parallel?: number;
    dryRun?: boolean;
    check?: boolean;
}

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
};

// ============================================================================
// Helpers
// ============================================================================

function log(msg: string, level: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
    const colors = {
        info: COLORS.blue,
        warn: COLORS.yellow,
        error: COLORS.red,
        success: COLORS.green,
    };
    const prefix = {
        info: 'ℹ',
        warn: '⚠',
        error: '✗',
        success: '✓',
    };
    console.log(`${colors[level]}${prefix[level]} ${msg}${COLORS.reset}`);
}

function parseArgs(): PipelineRunArgs {
    const args = process.argv.slice(2);
    const result: PipelineRunArgs = {};
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        switch (arg) {
            case '--pipeline':
            case '-p':
                result.pipelineConfigId = args[++i];
                break;
            case '--sample':
            case '-s':
                result.sampleId = args[++i];
                break;
            case '--seed':
                result.seed = parseInt(args[++i]!, 10);
                break;
            case '--golden-set':
            case '--golden':
                result.goldenSet = true;
                break;
            case '--parallel':
                result.parallel = parseInt(args[++i]!, 10);
                break;
            case '--dry-run':
                result.dryRun = true;
                break;
            case '--check':
                result.check = true;
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
        }
    }
    
    return result;
}

function printHelp(): void {
    console.log(`
${COLORS.blue}run-pipeline-external.ts${COLORS.reset} - External Orchestrator Bridge

${COLORS.yellow}USAGE:${COLORS.reset}
  npx ts-node scripts/run-pipeline-external.ts [options]

${COLORS.yellow}OPTIONS:${COLORS.reset}
  --check              Check if Temporal is available
  --pipeline, -p ID    Pipeline config ID (e.g., production-qa-preview)
  --sample, -s ID      Sample ID (e.g., geometric-baseline)
  --seed N             Seed for reproducibility
  --golden-set         Run the full golden set regression
  --parallel N         Number of parallel workers (default: 1)
  --dry-run            Show what would run without executing
  --help, -h           Show this help message

${COLORS.yellow}EXAMPLES:${COLORS.reset}
  # Check Temporal availability
  npx ts-node scripts/run-pipeline-external.ts --check

  # Run a single pipeline
  npx ts-node scripts/run-pipeline-external.ts -p production-qa-preview -s geometric-baseline

  # Run golden set with parallelism
  npx ts-node scripts/run-pipeline-external.ts --golden-set --parallel 2

${COLORS.yellow}ENVIRONMENT:${COLORS.reset}
  TEMPORAL_ADDRESS     Temporal server (default: localhost:7233)
  TEMPORAL_NAMESPACE   Temporal namespace (default: default)
  TEMPORAL_TASK_QUEUE  Task queue (default: gemDirect-pipelines)

${COLORS.gray}If Temporal is not available, falls back to direct execution.${COLORS.reset}
`);
}

function getExternalConfig(): ExternalConfig {
    return {
        temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
        temporalNamespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
        taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'gemDirect-pipelines',
        enabled: process.env.TEMPORAL_ENABLED === 'true',
    };
}

// ============================================================================
// Temporal Availability Check
// ============================================================================

interface TemporalStatus {
    available: boolean;
    version?: string;
    error?: string;
    fallbackReason?: string;
}

async function checkTemporalAvailability(config: ExternalConfig): Promise<TemporalStatus> {
    // First, check if Temporal SDK is installed
    try {
        // We're not actually importing - just checking if the module exists
        require.resolve('@temporalio/client');
    } catch {
        return {
            available: false,
            fallbackReason: 'Temporal SDK not installed. Install with: npm install @temporalio/client @temporalio/worker',
        };
    }
    
    // Check if we can connect to Temporal server
    // This is a simplified check - actual implementation would try to connect
    try {
        // Attempt a basic TCP connection check to the Temporal address
        const [host, portStr] = config.temporalAddress.split(':');
        const port = parseInt(portStr ?? '7233', 10);
        
        await new Promise<void>((resolve, reject) => {
            const net = require('net');
            const socket = net.createConnection({ host, port, timeout: 3000 });
            socket.on('connect', () => {
                socket.destroy();
                resolve();
            });
            socket.on('error', reject);
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
        });
        
        return {
            available: true,
            version: 'connected',
        };
    } catch (err) {
        return {
            available: false,
            error: err instanceof Error ? err.message : String(err),
            fallbackReason: `Cannot connect to Temporal server at ${config.temporalAddress}`,
        };
    }
}

// ============================================================================
// Execution Modes
// ============================================================================

async function runWithTemporal(
    args: PipelineRunArgs,
    config: ExternalConfig
): Promise<void> {
    log(`Running with Temporal orchestration`, 'info');
    log(`Server: ${config.temporalAddress}`, 'info');
    log(`Namespace: ${config.temporalNamespace}`, 'info');
    log(`Task Queue: ${config.taskQueue}`, 'info');
    
    if (args.dryRun) {
        log('[DRY RUN] Would start Temporal workflow', 'warn');
        return;
    }
    
    // Dynamic import to avoid error when SDK not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('@temporalio/client');
    
    const client = new Client({
        address: config.temporalAddress,
        namespace: config.temporalNamespace,
    });
    
    try {
        const workflowId = `gemDirect-${Date.now()}`;
        
        if (args.goldenSet) {
            log(`Starting golden set regression workflow: ${workflowId}`, 'info');
            // Would call goldenSetRegressionWorkflow here
            log('Golden set workflow not yet fully implemented for Temporal', 'warn');
        } else if (args.pipelineConfigId && args.sampleId) {
            log(`Starting single pipeline workflow: ${workflowId}`, 'info');
            // Would call single pipeline workflow here
            log('Single pipeline workflow not yet fully implemented for Temporal', 'warn');
        }
    } finally {
        await client.connection.close();
    }
}

async function runDirectFallback(args: PipelineRunArgs): Promise<void> {
    log(`Falling back to direct execution (no Temporal)`, 'warn');
    
    if (args.dryRun) {
        log('[DRY RUN] Would run pipeline directly', 'warn');
        if (args.goldenSet) {
            console.log(`  Command: npx ts-node scripts/run-golden-set.ts --parallel ${args.parallel ?? 1}`);
        } else {
            console.log(`  Pipeline: ${args.pipelineConfigId ?? 'production-qa-preview'}`);
            console.log(`  Sample: ${args.sampleId ?? 'geometric-baseline'}`);
        }
        return;
    }
    
    // Direct execution using existing scripts
    if (args.goldenSet) {
        log('Running golden set regression directly...', 'info');
        const scriptPath = path.resolve(__dirname, 'run-golden-set.ts');
        const parallelArg = args.parallel ? `--parallel ${args.parallel}` : '';
        
        const result = spawn('npx', ['ts-node', scriptPath, parallelArg].filter(Boolean), {
            stdio: 'inherit',
            shell: true,
        });
        
        await new Promise<void>((resolve, reject) => {
            result.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Golden set exited with code ${code}`));
                }
            });
        });
    } else if (args.pipelineConfigId || args.sampleId) {
        log('Single pipeline execution via direct mode...', 'info');
        // For single pipeline, we'd need to implement or call appropriate script
        // For now, provide guidance
        log(`To run a single pipeline, use:`, 'info');
        console.log(`  npx ts-node scripts/run-pipeline.ts --pipeline ${args.pipelineConfigId ?? 'production-qa-preview'} --sample ${args.sampleId ?? 'geometric-baseline'}`);
        log('Single pipeline direct execution not fully wired - use golden set or A/B experiments', 'warn');
    } else {
        log('No action specified. Use --help for usage.', 'error');
    }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const args = parseArgs();
    const config = getExternalConfig();
    
    console.log(`\n${COLORS.blue}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.blue}  External Orchestrator Bridge${COLORS.reset}`);
    console.log(`${COLORS.blue}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);
    
    // Check Temporal availability
    const temporalStatus = await checkTemporalAvailability(config);
    
    if (args.check) {
        // Just report status and exit
        if (temporalStatus.available) {
            log(`Temporal is available at ${config.temporalAddress}`, 'success');
            log(`Namespace: ${config.temporalNamespace}`, 'info');
            log(`Task Queue: ${config.taskQueue}`, 'info');
        } else {
            log(`Temporal is not available`, 'warn');
            log(temporalStatus.fallbackReason ?? temporalStatus.error ?? 'Unknown reason', 'info');
            log('Pipelines will run directly without orchestration', 'info');
        }
        
        console.log(`\n${COLORS.gray}To set up Temporal:${COLORS.reset}`);
        console.log(`  1. Install SDK: npm install @temporalio/client @temporalio/worker`);
        console.log(`  2. Start server: See https://docs.temporal.io/self-hosted-guide`);
        console.log(`  3. Set env: TEMPORAL_ADDRESS=localhost:7233`);
        return;
    }
    
    // No action specified
    if (!args.goldenSet && !args.pipelineConfigId && !args.sampleId) {
        printHelp();
        return;
    }
    
    // Execute with appropriate mode
    if (temporalStatus.available && config.enabled) {
        await runWithTemporal(args, config);
    } else {
        if (temporalStatus.fallbackReason) {
            log(temporalStatus.fallbackReason, 'info');
        }
        await runDirectFallback(args);
    }
    
    log('Execution complete', 'success');
}

main().catch((err) => {
    log(`Fatal error: ${err.message}`, 'error');
    process.exit(1);
});
