/**
 * Replay UI Service
 * 
 * Provides a simplified API for triggering manifest replays from React UI components.
 * Wraps manifestReplayService to provide a clean, UI-friendly interface.
 * 
 * Part of R1 - Replay Integration in UI
 * 
 * Usage:
 * ```typescript
 * import { replayFromManifestForUi } from './replayUiService';
 * 
 * const result = await replayFromManifestForUi({
 *     manifestPath: '/path/to/manifest.json',
 * });
 * 
 * if (result.success) {
 *     console.log(`Replayed video at: ${result.replayedVideoPath}`);
 * } else {
 *     console.error(`Replay failed: ${result.errorMessage}`);
 * }
 * ```
 * 
 * @module services/replayUiService
 */

import {
    loadReplayPlan,
    executeReplay,
    readManifestFile,
    type ReplayPlan,
} from './manifestReplayService';

// ============================================================================
// Types
// ============================================================================

/**
 * Request to replay a manifest from UI
 */
export interface ReplayUiRequest {
    /** Path to the manifest JSON file */
    manifestPath: string;
    /** Optional output directory override */
    outputDirOverride?: string;
}

/**
 * Result of a UI-initiated replay
 */
export interface ReplayUiResult {
    /** Path to the manifest that was replayed */
    manifestPath: string;
    /** Path to the original video (from manifest outputs) */
    originalVideoPath?: string;
    /** Path to the newly replayed video */
    replayedVideoPath?: string;
    /** Whether the replay succeeded */
    success: boolean;
    /** Error message if replay failed */
    errorMessage?: string;
    /** Warnings from the replay process */
    warnings?: string[];
    /** Duration of replay in milliseconds (if executed) */
    durationMs?: number;
    /** The replay plan (for inspection/debugging) */
    plan?: ReplayPlan;
}

/**
 * Status of a replay operation
 */
export type ReplayStatus = 'idle' | 'pending' | 'running' | 'succeeded' | 'failed';

/**
 * State for tracking replay in UI components
 */
export interface ReplayState {
    status: ReplayStatus;
    manifestPath?: string;
    result?: ReplayUiResult;
    startedAt?: string;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Execute a replay from a manifest file for UI consumption.
 * 
 * This is the main entry point for UI components to trigger replays.
 * It handles all error cases and returns a unified ReplayUiResult.
 * 
 * @param request The replay request
 * @returns A ReplayUiResult with success/failure and paths
 */
export async function replayFromManifestForUi(
    request: ReplayUiRequest
): Promise<ReplayUiResult> {
    const { manifestPath, outputDirOverride } = request;
    
    try {
        // 1. Load the replay plan
        const plan = await loadReplayPlan(manifestPath);
        
        // 2. Extract original video path from manifest
        const originalVideoPath = plan.manifest.outputs.videoPath;
        
        // 3. Execute the replay
        const replayResult = await executeReplay(plan, {
            dryRun: false,
            outputDir: outputDirOverride,
        });
        
        // 4. Return success result
        return {
            manifestPath,
            originalVideoPath,
            replayedVideoPath: replayResult.outputVideoPath || undefined,
            success: true,
            warnings: replayResult.warnings.length > 0 ? replayResult.warnings : undefined,
            durationMs: replayResult.durationMs,
            plan,
        };
    } catch (error) {
        // Handle known error types
        const errorMessage = error instanceof Error ? error.message : 'Unknown replay error';
        
        return {
            manifestPath,
            success: false,
            errorMessage,
        };
    }
}

/**
 * Get a dry-run preview of what a replay would do.
 * 
 * Useful for showing users what settings will be used before executing.
 * 
 * @param manifestPath Path to the manifest file
 * @returns ReplayUiResult with plan info but no actual execution
 */
export async function getReplayPreview(
    manifestPath: string
): Promise<ReplayUiResult> {
    try {
        const plan = await loadReplayPlan(manifestPath);
        const originalVideoPath = plan.manifest.outputs.videoPath;
        
        return {
            manifestPath,
            originalVideoPath,
            success: true,
            warnings: plan.warnings.length > 0 ? plan.warnings : undefined,
            plan,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load replay plan';
        
        return {
            manifestPath,
            success: false,
            errorMessage,
        };
    }
}

/**
 * Extract original video path from a manifest without full plan resolution.
 * 
 * Lightweight helper for displaying original video links.
 * 
 * @param manifestPath Path to the manifest file
 * @returns Original video path or undefined
 */
export function getOriginalVideoPath(manifestPath: string): string | undefined {
    try {
        const manifest = readManifestFile(manifestPath);
        return manifest.outputs.videoPath;
    } catch {
        return undefined;
    }
}

/**
 * Check if a manifest file exists and is valid for replay.
 * 
 * @param manifestPath Path to the manifest file
 * @returns True if the manifest exists and can be parsed
 */
export function isManifestValidForReplay(manifestPath: string): boolean {
    try {
        readManifestFile(manifestPath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create initial replay state for UI components.
 * 
 * @returns Initial ReplayState with idle status
 */
export function createInitialReplayState(): ReplayState {
    return {
        status: 'idle',
    };
}

// ============================================================================
// Exports
// ============================================================================

export default {
    replayFromManifestForUi,
    getReplayPreview,
    getOriginalVideoPath,
    isManifestValidForReplay,
    createInitialReplayState,
};
