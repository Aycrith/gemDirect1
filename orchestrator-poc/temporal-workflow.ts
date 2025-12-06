/**
 * Temporal Workflow PoC
 * 
 * This is a proof-of-concept showing how gemDirect1 pipeline runs
 * could be orchestrated using Temporal.io.
 * 
 * REQUIREMENTS (not installed):
 * - @temporalio/workflow
 * - @temporalio/activity
 * - @temporalio/client
 * 
 * This file demonstrates the architecture but cannot run without
 * installing Temporal dependencies and setting up a Temporal server.
 */

// ============================================================================
// Types (matching gemDirect1 pipeline types)
// ============================================================================

export interface PipelineConfig {
    sampleId: string;
    pipelineConfigId: string;
    seed?: number;
    temporalRegularization?: 'none' | 'fixed' | 'adaptive';
    cameraPathType?: 'static' | 'bezier' | 'smooth';
}

export interface PipelineResult {
    success: boolean;
    runDir: string;
    videoPath?: string;
    benchmarkPath?: string;
    visionQaPath?: string;
    metrics?: {
        overallScore?: number;
        flickerFrameCount?: number;
        identityScore?: number;
    };
    error?: string;
}

export interface GoldenSetWorkflowInput {
    scenarios: PipelineConfig[];
    priority?: number;
    parallelism?: number;
}

export interface GoldenSetWorkflowOutput {
    reportId: string;
    passed: number;
    failed: number;
    total: number;
    results: PipelineResult[];
}

// ============================================================================
// Activities (would be registered with Temporal)
// ============================================================================

/**
 * Activities are the actual work units that interact with ComfyUI,
 * file system, etc. They're defined separately and called from workflows.
 */
export interface PipelineActivities {
    /**
     * Validate ComfyUI server is ready
     */
    checkComfyUIHealth(): Promise<boolean>;

    /**
     * Run a single pipeline scenario
     */
    runPipelineScenario(config: PipelineConfig): Promise<PipelineResult>;

    /**
     * Run benchmark on completed video
     */
    runBenchmark(videoPath: string): Promise<{ score: number; flickerCount: number }>;

    /**
     * Run Vision QA on completed video
     */
    runVisionQA(videoPath: string): Promise<{ verdict: 'PASS' | 'WARN' | 'FAIL'; score: number }>;

    /**
     * Save report to file system
     */
    saveReport(reportId: string, results: PipelineResult[]): Promise<string>;

    /**
     * Send notification (Slack, email, etc.)
     */
    sendNotification(channel: string, message: string): Promise<void>;
}

// ============================================================================
// Workflow Definition (Temporal-style)
// ============================================================================

/**
 * Golden Set Regression Workflow
 * 
 * This workflow orchestrates running the golden set scenarios,
 * collecting results, and generating a report.
 * 
 * With Temporal, this would be:
 * - Durable: survives server restarts
 * - Retriable: automatic retries on failure
 * - Observable: full history visible in Temporal UI
 * 
 * Example usage with Temporal Client:
 * ```typescript
 * import { Client } from '@temporalio/client';
 * 
 * const client = new Client();
 * const handle = await client.workflow.start(goldenSetRegressionWorkflow, {
 *   taskQueue: 'gemDirect-pipelines',
 *   workflowId: `golden-set-${Date.now()}`,
 *   args: [{
 *     scenarios: [
 *       { sampleId: 'geometric-baseline', pipelineConfigId: 'production-qa' },
 *       { sampleId: 'character-consistency', pipelineConfigId: 'production-qa-cinematic-gold' },
 *     ],
 *     parallelism: 2,
 *   }],
 * });
 * 
 * const result = await handle.result();
 * console.log(`Golden set completed: ${result.passed}/${result.total} passed`);
 * ```
 */
export async function goldenSetRegressionWorkflow(
    input: GoldenSetWorkflowInput,
    // In actual Temporal, activities would be proxied via proxyActivities
    activities: PipelineActivities
): Promise<GoldenSetWorkflowOutput> {
    const reportId = new Date().toISOString().replace(/[:.]/g, '-');
    const results: PipelineResult[] = [];

    // Step 1: Health check
    const isHealthy = await activities.checkComfyUIHealth();
    if (!isHealthy) {
        throw new Error('ComfyUI server not ready');
    }

    // Step 2: Run scenarios (could be parallel with Temporal's promise.all)
    // Temporal handles retries automatically based on retry policy
    for (const scenario of input.scenarios) {
        try {
            const result = await activities.runPipelineScenario(scenario);
            
            // Step 3: Run post-processing if video was generated
            if (result.success && result.videoPath) {
                const [benchmark, _visionQa] = await Promise.all([
                    activities.runBenchmark(result.videoPath),
                    activities.runVisionQA(result.videoPath),
                ]);
                
                result.metrics = {
                    overallScore: benchmark.score,
                    flickerFrameCount: benchmark.flickerCount,
                };
            }
            
            results.push(result);
        } catch (error) {
            // Temporal would automatically retry based on policy
            // After max retries, the error is captured
            results.push({
                success: false,
                runDir: '',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // Step 4: Save report
    await activities.saveReport(reportId, results);

    // Step 5: Send notification
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;
    await activities.sendNotification(
        '#gemDirect-pipeline',
        `🏆 Golden Set ${passed === results.length ? 'PASSED ✅' : 'FAILED ❌'}: ${passed}/${results.length} scenarios`
    );

    return {
        reportId,
        passed,
        failed,
        total: results.length,
        results,
    };
}

// ============================================================================
// A/B Experiment Workflow
// ============================================================================

export interface ABExperimentWorkflowInput {
    experimentId: string;
    variantA: PipelineConfig;
    variantB: PipelineConfig;
    scenarios: string[];
    seeds: number[];
}

export interface ABExperimentWorkflowOutput {
    experimentId: string;
    winner: 'A' | 'B' | 'inconclusive';
    confidence: number;
    comparisons: Array<{
        scenarioId: string;
        seed: number;
        resultA: PipelineResult;
        resultB: PipelineResult;
        winner: 'A' | 'B' | null;
    }>;
}

/**
 * A/B Experiment Workflow
 * 
 * Runs two variants across multiple scenarios and seeds,
 * then determines a winner based on aggregate metrics.
 */
export async function abExperimentWorkflow(
    input: ABExperimentWorkflowInput,
    activities: PipelineActivities
): Promise<ABExperimentWorkflowOutput> {
    const comparisons: ABExperimentWorkflowOutput['comparisons'] = [];

    for (const scenarioId of input.scenarios) {
        for (const seed of input.seeds) {
            // Run both variants
            const configA = { ...input.variantA, sampleId: scenarioId, seed };
            const configB = { ...input.variantB, sampleId: scenarioId, seed };

            const [resultA, resultB] = await Promise.all([
                activities.runPipelineScenario(configA),
                activities.runPipelineScenario(configB),
            ]);

            // Determine winner for this comparison
            let winner: 'A' | 'B' | null = null;
            if (resultA.success && !resultB.success) winner = 'A';
            else if (!resultA.success && resultB.success) winner = 'B';
            else if (resultA.success && resultB.success) {
                const scoreA = resultA.metrics?.overallScore ?? 0;
                const scoreB = resultB.metrics?.overallScore ?? 0;
                if (scoreA > scoreB + 0.05) winner = 'A';
                else if (scoreB > scoreA + 0.05) winner = 'B';
            }

            comparisons.push({ scenarioId, seed, resultA, resultB, winner });
        }
    }

    // Calculate overall winner
    const aWins = comparisons.filter(c => c.winner === 'A').length;
    const bWins = comparisons.filter(c => c.winner === 'B').length;
    const total = aWins + bWins;
    const confidence = total > 0 ? Math.max(aWins, bWins) / total : 0;
    const winner: 'A' | 'B' | 'inconclusive' = 
        confidence >= 0.6 && aWins > bWins ? 'A' :
        confidence >= 0.6 && bWins > aWins ? 'B' : 'inconclusive';

    return {
        experimentId: input.experimentId,
        winner,
        confidence,
        comparisons,
    };
}

// ============================================================================
// Scheduled Workflow (Cron-style)
// ============================================================================

/**
 * Nightly Regression Workflow
 * 
 * With Temporal, you can schedule workflows with cron expressions:
 * 
 * ```typescript
 * await client.schedule.create({
 *   scheduleId: 'nightly-golden-set',
 *   spec: {
 *     cronExpressions: ['0 3 * * *'], // 3 AM daily
 *   },
 *   action: {
 *     type: 'startWorkflow',
 *     workflowType: goldenSetRegressionWorkflow,
 *     taskQueue: 'gemDirect-pipelines',
 *     args: [{
 *       scenarios: allGoldenScenarios,
 *       priority: 1,
 *     }],
 *   },
 * });
 * ```
 */
export const nightlyRegressionSchedule = {
    scheduleId: 'nightly-golden-set',
    cronExpression: '0 3 * * *', // 3 AM daily
    workflowType: 'goldenSetRegressionWorkflow',
    description: 'Run full golden set regression every night at 3 AM',
};

// ============================================================================
// Activity Retry Configuration (Temporal-style)
// ============================================================================

/**
 * Retry policies for different activity types.
 * Temporal allows fine-grained retry control per activity.
 */
export const activityRetryPolicies = {
    checkComfyUIHealth: {
        maximumAttempts: 3,
        initialInterval: '1s',
        backoffCoefficient: 2,
        maximumInterval: '10s',
    },
    runPipelineScenario: {
        maximumAttempts: 2,
        initialInterval: '30s',
        backoffCoefficient: 1.5,
        maximumInterval: '5m',
        nonRetryableErrorTypes: ['InvalidConfigError', 'MissingModelError'],
    },
    runBenchmark: {
        maximumAttempts: 2,
        initialInterval: '5s',
    },
    runVisionQA: {
        maximumAttempts: 2,
        initialInterval: '5s',
    },
    saveReport: {
        maximumAttempts: 3,
        initialInterval: '1s',
    },
    sendNotification: {
        maximumAttempts: 5,
        initialInterval: '5s',
        backoffCoefficient: 2,
    },
};

// ============================================================================
// Implementation Notes
// ============================================================================

/**
 * To fully implement Temporal integration:
 * 
 * 1. Install dependencies:
 *    npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
 * 
 * 2. Start Temporal Dev Server:
 *    npx temporal-dev-server start
 * 
 * 3. Create a worker (worker.ts):
 *    import { Worker } from '@temporalio/worker';
 *    import * as activities from './activities';
 *    
 *    async function run() {
 *      const worker = await Worker.create({
 *        workflowsPath: require.resolve('./temporal-workflow'),
 *        activities,
 *        taskQueue: 'gemDirect-pipelines',
 *      });
 *      await worker.run();
 *    }
 *    run().catch(console.error);
 * 
 * 4. Implement activities (activities.ts):
 *    - Wrap existing pipeline functions as Temporal activities
 *    - Add proper error handling and logging
 * 
 * 5. Create a client to trigger workflows:
 *    import { Client } from '@temporalio/client';
 *    const client = new Client();
 *    // Start workflows programmatically or via API
 * 
 * Benefits over current implementation:
 * - Automatic retry with exponential backoff
 * - Workflow state survives process restarts
 * - Built-in observability and debugging
 * - Easy to add approval steps, notifications
 * - Scalable to multiple workers
 */
