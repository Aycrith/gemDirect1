/**
 * Narrative Run Service
 * 
 * Provides launching and monitoring of narrative pipeline runs.
 * Used by the Narrative Dashboard to start runs and fetch summaries.
 * 
 * Part of F2 - Narrative UI Integration
 * 
 * @module services/narrativeRunService
 */

import type { NarrativeRunSummary, NarrativeQASummary, QAVerdict } from '../types/narrativeScript';
import type { NarrativeScriptInfo } from './narrativeScriptService';
import { getScriptInfo } from './narrativeScriptService';

// ============================================================================
// Types
// ============================================================================

/**
 * Request to start a narrative run.
 */
export interface NarrativeRunRequest {
    /** Path to the narrative script file */
    scriptPath: string;
    /** Optional sample ID override (applies to all shots if specified) */
    sampleId?: string;
    /** Optional preset override */
    presetOverride?: string;
    /** Optional temporal regularization override */
    temporalRegularizationOverride?: 'on' | 'off' | 'auto';
}

/**
 * Handle returned when a narrative run is started.
 */
export interface NarrativeRunHandle {
    /** Unique run identifier */
    runId: string;
    /** Script information */
    scriptInfo: NarrativeScriptInfo;
    /** Timestamp when run was started */
    startedAt: string;
    /** Expected completion estimate (if available) */
    estimatedCompletionAt?: string;
}

/**
 * Status of a narrative run.
 */
export type NarrativeRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/**
 * Progress information for a running narrative.
 */
export interface NarrativeRunProgress {
    /** Run identifier */
    runId: string;
    /** Current status */
    status: NarrativeRunStatus;
    /** Total number of shots */
    totalShots: number;
    /** Number of completed shots */
    completedShots: number;
    /** Number of failed shots */
    failedShots: number;
    /** Current shot being processed (if any) */
    currentShot?: string;
    /** Progress percentage for current shot (0-100) */
    currentShotProgress?: number;
    /** Progress percentage (0-100) */
    progressPercent: number;
    /** Status message */
    message: string;
}

// ============================================================================
// In-Memory Run Tracking
// ============================================================================

/** In-memory store for run progress and results */
interface RunStore {
    progress: NarrativeRunProgress;
    summary?: NarrativeRunSummary;
    scriptInfo: NarrativeScriptInfo;
}

const runStore = new Map<string, RunStore>();

// ============================================================================
// Run Management
// ============================================================================

/**
 * Start a new narrative run.
 * 
 * In the browser context, this initiates the run via an API call or worker.
 * For the first pass, we simulate the run with mock progress updates.
 * 
 * @param request Run request configuration
 * @returns Promise resolving to run handle
 */
export async function startNarrativeRun(request: NarrativeRunRequest): Promise<NarrativeRunHandle> {
    // Generate run ID
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    
    // Get script info
    const scriptPath = request.scriptPath;
    const scriptId = scriptPath.split('/').pop()?.replace('.json', '') || 'unknown';
    
    // Try to get detailed info, fall back to basic
    let scriptInfo = await getScriptInfo(scriptId);
    if (!scriptInfo) {
        scriptInfo = {
            id: scriptId,
            path: scriptPath,
            shotCount: 3, // Default assumption
        };
    }
    
    // Initialize progress
    const progress: NarrativeRunProgress = {
        runId,
        status: 'pending',
        totalShots: scriptInfo.shotCount,
        completedShots: 0,
        failedShots: 0,
        progressPercent: 0,
        message: 'Initializing narrative run...',
    };
    
    // Store initial state
    runStore.set(runId, {
        progress,
        scriptInfo,
    });
    
    // Start simulated run (in production, this would call the actual pipeline)
    simulateNarrativeRun(runId, scriptInfo);
    
    return {
        runId,
        scriptInfo,
        startedAt,
    };
}

/**
 * Simulate a narrative run with mock progress updates.
 * This is a placeholder for the actual pipeline integration.
 * 
 * @param runId Run identifier
 * @param scriptInfo Script information
 */
async function simulateNarrativeRun(runId: string, scriptInfo: NarrativeScriptInfo): Promise<void> {
    const store = runStore.get(runId);
    if (!store) return;
    
    // Update to running
    store.progress.status = 'running';
    store.progress.message = 'Starting narrative pipeline...';
    
    const totalShots = scriptInfo.shotCount;
    const shotIds = Array.from({ length: totalShots }, (_, i) => `shot-${String(i + 1).padStart(3, '0')}`);
    
    // Simulate processing each shot
    for (let i = 0; i < totalShots; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing time
        
        const shotId = shotIds[i] || `shot-${i + 1}`;
        store.progress.currentShot = shotId;
        store.progress.message = `Processing ${shotId} (${i + 1}/${totalShots})...`;
        
        // Simulate success (90% chance) or failure (10% chance)
        const succeeded = Math.random() > 0.1;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (succeeded) {
            store.progress.completedShots++;
        } else {
            store.progress.failedShots++;
        }
        
        store.progress.progressPercent = Math.round(((i + 1) / totalShots) * 100);
    }
    
    // Create mock summary
    const qaSummary = createMockQASummary(shotIds);
    
    store.summary = {
        narrativeId: scriptInfo.id,
        title: scriptInfo.title,
        scriptPath: scriptInfo.path,
        startedAt: new Date(Date.now() - totalShots * 2000).toISOString(),
        finishedAt: new Date().toISOString(),
        totalDurationMs: totalShots * 2000,
        shotCount: totalShots,
        successfulShots: store.progress.completedShots,
        failedShots: store.progress.failedShots,
        shotMetrics: [],
        shotArtifacts: [],
        status: store.progress.failedShots === 0 ? 'succeeded' : 'failed',
        qaSummary,
    };
    
    store.progress.status = store.summary.status === 'succeeded' ? 'succeeded' : 'failed';
    store.progress.currentShot = undefined;
    store.progress.message = store.summary.status === 'succeeded' 
        ? 'Narrative run completed successfully' 
        : `Narrative run completed with ${store.progress.failedShots} failed shots`;
}

/**
 * Create a mock QA summary for demonstration purposes.
 */
function createMockQASummary(shotIds: string[]): NarrativeQASummary {
    const shots = shotIds.map(shotId => {
        // Generate random metrics
        const verdict: QAVerdict = Math.random() > 0.2 
            ? (Math.random() > 0.3 ? 'PASS' : 'WARN')
            : 'FAIL';
        
        return {
            shotId,
            pipelineConfigId: 'production-qa-preview',
            verdict,
            verdictReasons: verdict === 'FAIL' 
                ? ['Vision QA: FAIL', 'Low identity score'] 
                : verdict === 'WARN'
                    ? ['Mild flicker detected']
                    : [],
            metrics: {
                flickerFrameCount: Math.floor(Math.random() * 10),
                jitterScore: Math.random() * 30,
                identityScore: 60 + Math.random() * 40,
                overallQuality: 50 + Math.random() * 50,
                visionOverall: 70 + Math.random() * 30,
                visionStatus: verdict === 'PASS' ? 'PASS' : verdict === 'WARN' ? 'WARN' : 'FAIL',
            },
        };
    });
    
    // Compute overall verdict
    const failedShots = shots.filter(s => s.verdict === 'FAIL');
    const warnShots = shots.filter(s => s.verdict === 'WARN');
    
    let overallVerdict: QAVerdict = 'PASS';
    let overallReasons: string[] = ['All shots passed QA'];
    
    if (failedShots.length > 0) {
        overallVerdict = 'FAIL';
        overallReasons = [`${failedShots.length}/${shots.length} shots failed`];
    } else if (warnShots.length > 0) {
        overallVerdict = 'WARN';
        overallReasons = [`${warnShots.length}/${shots.length} shots have warnings`];
    }
    
    return {
        overallVerdict,
        overallReasons,
        shots,
    };
}

/**
 * Get the current progress of a narrative run.
 * 
 * @param runId Run identifier
 * @returns Progress info or null if run not found
 */
export function getNarrativeRunProgress(runId: string): NarrativeRunProgress | null {
    const store = runStore.get(runId);
    return store?.progress || null;
}

/**
 * Get the summary of a completed narrative run.
 * 
 * @param runId Run identifier
 * @returns Run summary or null if not found/completed
 */
export async function getNarrativeRunSummary(runId: string): Promise<NarrativeRunSummary | null> {
    const store = runStore.get(runId);
    return store?.summary || null;
}

/**
 * Get all active/recent runs.
 * 
 * @returns Array of run progress info
 */
export function listNarrativeRuns(): NarrativeRunProgress[] {
    return Array.from(runStore.values()).map(s => s.progress);
}

/**
 * Cancel a running narrative.
 * 
 * @param runId Run identifier
 * @returns True if cancelled, false if not found or already completed
 */
export function cancelNarrativeRun(runId: string): boolean {
    const store = runStore.get(runId);
    if (!store || store.progress.status !== 'running') {
        return false;
    }
    
    store.progress.status = 'failed';
    store.progress.message = 'Run cancelled by user';
    return true;
}

/**
 * Clear completed runs from the store.
 */
export function clearCompletedRuns(): void {
    for (const [runId, store] of runStore.entries()) {
        if (store.progress.status === 'succeeded' || store.progress.status === 'failed') {
            runStore.delete(runId);
        }
    }
}

/**
 * Clear all runs from the store.
 * @internal For testing purposes only.
 */
export function clearAllRuns(): void {
    runStore.clear();
}

// ============================================================================
// Node.js Compatible Functions (for CLI/pipeline use)
// ============================================================================

/**
 * Start a narrative run using the actual pipeline.
 * Use this in Node.js contexts (scripts, CLI) instead of the browser version.
 * 
 * @param scriptPath Absolute path to the script file
 * @param projectRoot Project root directory
 * @returns Promise resolving to run summary
 */
export async function runNarrativePipelineNode(
    scriptPath: string,
    projectRoot: string
): Promise<NarrativeRunSummary> {
    // Dynamic imports for Node.js modules
    const { getNarrativePipeline, generateNarrativeSummary, writeJsonSummary } = await import('../pipelines/narrativePipeline');
    const { runPipeline } = await import('./pipelineOrchestrator');
    const fs = await import('fs');
    
    // Load script to get the NarrativeScript object for summary generation
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    const script = JSON.parse(scriptContent);
    
    // Capture start time
    const startedAt = new Date().toISOString();
    
    // Build and run the pipeline
    const pipeline = await getNarrativePipeline(scriptPath);
    const result = await runPipeline(pipeline, { projectRoot }, { verbose: true });
    
    // Generate summary from result (requires script, context, and start time)
    const summary = generateNarrativeSummary(script, result.finalContext, startedAt);
    
    // Write summary to disk
    await writeJsonSummary(summary, projectRoot);
    
    return summary;
}
