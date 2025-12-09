/**
 * Pipeline Orchestrator
 * 
 * Lightweight internal orchestration layer for defining and running multi-step
 * pipelines. Pipelines are DAG-like sequences that compose existing scripts and
 * services into declarative, repeatable runs.
 * 
 * Part of D1 - Pipeline Orchestration & Workflow Management
 * 
 * @module services/pipelineOrchestrator
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Status of an individual pipeline step
 */
export type PipelineStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

/**
 * Context passed between pipeline steps.
 * Each step can read from and write to this shared context.
 */
export interface PipelineStepContext {
    [key: string]: unknown;
}

/**
 * Result of executing a single pipeline step
 */
export interface PipelineStepResult {
    /** Final status of the step */
    status: PipelineStepStatus;
    /** Updates to merge into the shared context */
    contextUpdates?: PipelineStepContext;
    /** Error message if status is 'failed' */
    errorMessage?: string;
    /** Duration of step execution in milliseconds */
    durationMs?: number;
}

/**
 * Definition of a single step in a pipeline
 */
export interface PipelineStep {
    /** Unique identifier for the step */
    id: string;
    /** Human-readable description of what the step does */
    description: string;
    /** Async function that executes the step */
    run: (ctx: PipelineStepContext) => Promise<PipelineStepResult>;
    /** IDs of steps that must complete successfully before this step runs */
    dependsOn?: string[];
}

/**
 * Definition of a complete pipeline
 */
export interface PipelineDefinition {
    /** Unique identifier for the pipeline */
    id: string;
    /** Human-readable description of the pipeline */
    description: string;
    /** Steps to execute in the pipeline */
    steps: PipelineStep[];
}

/**
 * Result of a complete pipeline run
 */
export interface PipelineRunResult {
    /** ID of the executed pipeline */
    pipelineId: string;
    /** Overall status of the pipeline run */
    status: 'succeeded' | 'failed';
    /** Results for each step, keyed by step ID */
    stepResults: Record<string, PipelineStepResult>;
    /** ISO timestamp when pipeline started */
    startedAt: string;
    /** ISO timestamp when pipeline finished */
    finishedAt: string;
    /** Total duration in milliseconds */
    totalDurationMs: number;
    /** Final merged context after all steps */
    finalContext: PipelineStepContext;
}

/**
 * Options for running a pipeline
 */
export interface PipelineRunOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Dry run - log steps but don't execute */
    dryRun?: boolean;
    /** Custom logger function */
    logger?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Default console logger
 */
function defaultLogger(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [PIPELINE]`;
    switch (level) {
        case 'warn':
            console.warn(`${prefix} ⚠️  ${message}`);
            break;
        case 'error':
            console.error(`${prefix} ❌ ${message}`);
            break;
        default:
            console.log(`${prefix} ${message}`);
    }
}

/**
 * Perform a topological sort of pipeline steps based on dependencies.
 * Returns steps in execution order.
 * 
 * @param steps Array of pipeline steps
 * @returns Sorted array of steps
 * @throws Error if circular dependency detected
 */
export function topologicalSort(steps: PipelineStep[]): PipelineStep[] {
    const stepMap = new Map<string, PipelineStep>();
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: PipelineStep[] = [];

    // Build step map
    for (const step of steps) {
        stepMap.set(step.id, step);
    }

    // Validate dependencies exist
    for (const step of steps) {
        for (const depId of step.dependsOn ?? []) {
            if (!stepMap.has(depId)) {
                throw new Error(
                    `Step "${step.id}" depends on unknown step "${depId}"`
                );
            }
        }
    }

    // DFS-based topological sort
    function visit(stepId: string): void {
        if (visited.has(stepId)) return;
        if (visiting.has(stepId)) {
            throw new Error(`Circular dependency detected involving step "${stepId}"`);
        }

        visiting.add(stepId);
        const step = stepMap.get(stepId)!;

        for (const depId of step.dependsOn ?? []) {
            visit(depId);
        }

        visiting.delete(stepId);
        visited.add(stepId);
        sorted.push(step);
    }

    // Visit all steps
    for (const step of steps) {
        visit(step.id);
    }

    return sorted;
}

// ============================================================================
// Pipeline Runner
// ============================================================================

/**
 * Execute a pipeline definition, running steps in dependency order.
 * 
 * - Steps are run sequentially in topologically sorted order
 * - Each step receives the accumulated context from previous steps
 * - On step failure, dependent steps are marked as 'skipped'
 * - Returns a comprehensive result with all step outcomes
 * 
 * @param def Pipeline definition to execute
 * @param initialContext Optional initial context values
 * @param options Run options (verbose, dryRun, logger)
 * @returns Promise resolving to pipeline run result
 */
export async function runPipeline(
    def: PipelineDefinition,
    initialContext: PipelineStepContext = {},
    options: PipelineRunOptions = {}
): Promise<PipelineRunResult> {
    const { verbose = false, dryRun = false, logger = defaultLogger } = options;
    
    const startedAt = new Date().toISOString();
    const stepResults: Record<string, PipelineStepResult> = {};
    let context: PipelineStepContext = {
        ...initialContext,
        pipelineStartedAt: initialContext.pipelineStartedAt ?? startedAt,
    };
    const failedSteps = new Set<string>();

    logger(`Starting pipeline: ${def.id}`, 'info');
    logger(`Description: ${def.description}`, 'info');
    logger(`Steps: ${def.steps.length}`, 'info');
    if (dryRun) {
        logger('DRY RUN MODE - steps will not be executed', 'warn');
    }

    // Sort steps by dependencies
    let sortedSteps: PipelineStep[];
    try {
        sortedSteps = topologicalSort(def.steps);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger(`Failed to sort steps: ${errorMessage}`, 'error');
        
        // Mark all steps as failed due to invalid definition
        for (const step of def.steps) {
            stepResults[step.id] = {
                status: 'failed',
                errorMessage: `Pipeline definition error: ${errorMessage}`,
            };
        }

        return {
            pipelineId: def.id,
            status: 'failed',
            stepResults,
            startedAt,
            finishedAt: new Date().toISOString(),
            totalDurationMs: Date.now() - new Date(startedAt).getTime(),
            finalContext: context,
        };
    }

    if (verbose) {
        logger(`Execution order: ${sortedSteps.map(s => s.id).join(' → ')}`, 'info');
    }

    // Execute steps in order
    for (const step of sortedSteps) {
        // Check if any dependencies failed
        const hasFailedDependency = (step.dependsOn ?? []).some(depId => failedSteps.has(depId));
        
        if (hasFailedDependency) {
            logger(`⏭️  Skipping "${step.id}" (dependency failed)`, 'warn');
            stepResults[step.id] = {
                status: 'skipped',
                errorMessage: 'Skipped due to failed dependency',
            };
            // Mark this step as effectively failed so downstream steps also skip
            failedSteps.add(step.id);
            continue;
        }

        logger(`▶️  Running step: ${step.id}`, 'info');
        if (verbose) {
            logger(`   ${step.description}`, 'info');
        }

        if (dryRun) {
            stepResults[step.id] = {
                status: 'succeeded',
                contextUpdates: {},
            };
            continue;
        }

        const stepStart = Date.now();
        
        try {
            const result = await step.run(context);
            const durationMs = Date.now() - stepStart;
            
            stepResults[step.id] = {
                ...result,
                durationMs,
            };

            if (result.status === 'succeeded') {
                logger(`✅ Step "${step.id}" succeeded (${durationMs}ms)`, 'info');
                
                // Merge context updates
                if (result.contextUpdates) {
                    context = { ...context, ...result.contextUpdates };
                    if (verbose) {
                        const keys = Object.keys(result.contextUpdates);
                        logger(`   Context updated: ${keys.join(', ')}`, 'info');
                    }
                }
            } else if (result.status === 'failed') {
                logger(`❌ Step "${step.id}" failed: ${result.errorMessage || 'Unknown error'}`, 'error');
                failedSteps.add(step.id);
            } else {
                // Handle other statuses (skipped, pending)
                logger(`⚠️  Step "${step.id}" ended with status: ${result.status}`, 'warn');
            }
        } catch (error) {
            const durationMs = Date.now() - stepStart;
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            logger(`❌ Step "${step.id}" threw error: ${errorMessage}`, 'error');
            
            stepResults[step.id] = {
                status: 'failed',
                errorMessage,
                durationMs,
            };
            failedSteps.add(step.id);
        }
    }

    const finishedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - new Date(startedAt).getTime();
    const overallStatus = failedSteps.size === 0 ? 'succeeded' : 'failed';

    logger(``, 'info');
    logger(`Pipeline "${def.id}" ${overallStatus === 'succeeded' ? '✅ SUCCEEDED' : '❌ FAILED'}`, 'info');
    logger(`Total duration: ${totalDurationMs}ms`, 'info');

    return {
        pipelineId: def.id,
        status: overallStatus,
        stepResults,
        startedAt,
        finishedAt,
        totalDurationMs,
        finalContext: context,
    };
}

// ============================================================================
// Helper Functions for Step Creation
// ============================================================================

/**
 * Create a simple step that always succeeds.
 * Useful for placeholder steps during development.
 */
export function createNoOpStep(id: string, description: string): PipelineStep {
    return {
        id,
        description,
        run: async () => ({ status: 'succeeded' }),
    };
}

/**
 * Create a step that executes a shell command.
 * Returns failed status if command exits with non-zero code.
 * 
 * @param id Step ID
 * @param description Step description
 * @param command Command to execute
 * @param options Additional options
 */
export function createShellStep(
    id: string,
    description: string,
    command: string,
    options: {
        cwd?: string;
        env?: Record<string, string>;
        contextOutputKey?: string;
        dependsOn?: string[];
    } = {}
): PipelineStep {
    return {
        id,
        description,
        dependsOn: options.dependsOn,
        run: async (ctx) => {
            // Dynamic import for Node.js child_process
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            // Interpolate context values in command
            let interpolatedCommand = command;
            for (const [key, value] of Object.entries(ctx)) {
                if (typeof value === 'string') {
                    interpolatedCommand = interpolatedCommand.replace(
                        new RegExp(`\\$\\{${key}\\}`, 'g'),
                        value
                    );
                }
            }

            try {
                const { stdout } = await execAsync(interpolatedCommand, {
                    cwd: options.cwd,
                    env: { ...process.env, ...options.env },
                    maxBuffer: 10 * 1024 * 1024, // 10MB
                });

                const contextUpdates: PipelineStepContext = {};
                if (options.contextOutputKey) {
                    contextUpdates[options.contextOutputKey] = stdout.trim();
                }

                return {
                    status: 'succeeded',
                    contextUpdates,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    status: 'failed',
                    errorMessage,
                };
            }
        },
    };
}

/**
 * Create a step that runs a PowerShell script.
 * Convenience wrapper around createShellStep for Windows.
 */
export function createPowerShellStep(
    id: string,
    description: string,
    scriptPath: string,
    args: Record<string, string> = {},
    options: {
        cwd?: string;
        contextOutputKey?: string;
        dependsOn?: string[];
    } = {}
): PipelineStep {
    const argString = Object.entries(args)
        .map(([key, value]) => `-${key} "${value}"`)
        .join(' ');
    
    const command = `pwsh -NoLogo -ExecutionPolicy Bypass -File "${scriptPath}" ${argString}`;
    
    return createShellStep(id, description, command, options);
}
