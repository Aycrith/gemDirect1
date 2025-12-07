/**
 * Run Registry Utilities
 * 
 * Functions for managing the run registry and exporting history.
 * Used by run-controller.ts to track runs and by cleanup utilities.
 * 
 * @module scripts/utils/runRegistry
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
    RunRegistry,
    RunRegistryEntry,
    RunHistoryFile,
    RunHistoryEntry,
    RunOptions,
    RunArtifacts,
} from '../../types/runRegistry';
import type { PipelineType } from '../../types/pipelineRun';
import {
    RUN_REGISTRY_PATH,
    RUN_HISTORY_PATH,
    DEFAULT_HISTORY_LIMIT,
} from '../../types/runRegistry';

// ============================================================================
// Constants
// ============================================================================

// ESM-compatible path resolution (replaces __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function getRegistryPath(): string {
    return path.join(PROJECT_ROOT, RUN_REGISTRY_PATH);
}

function getHistoryPath(): string {
    return path.join(PROJECT_ROOT, RUN_HISTORY_PATH);
}

// ============================================================================
// Registry File Operations
// ============================================================================

/**
 * Read the run registry from disk
 */
export function readRegistry(): RunRegistry {
    const registryPath = getRegistryPath();
    try {
        if (fs.existsSync(registryPath)) {
            const content = fs.readFileSync(registryPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.warn(`[RunRegistry] Failed to read registry: ${error}`);
    }
    
    // Return empty registry
    return {
        version: '1.0',
        runs: [],
        lastUpdated: new Date().toISOString(),
    };
}

/**
 * Write the run registry to disk (atomic write)
 */
export function writeRegistry(registry: RunRegistry): void {
    const registryPath = getRegistryPath();
    const dir = path.dirname(registryPath);
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    registry.lastUpdated = new Date().toISOString();
    
    // Atomic write via temp file
    const tempPath = `${registryPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2));
    fs.renameSync(tempPath, registryPath);
}

// ============================================================================
// Registry Entry Operations
// ============================================================================

/**
 * Create a new registry entry for a starting run
 */
export function createRegistryEntry(
    runId: string,
    type: PipelineType,
    identifier: string,
    options: RunOptions,
    pipelineId?: string
): RunRegistryEntry {
    return {
        runId,
        type,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
        options,
        artifacts: {},
        warnings: [],
        validationWarnings: [],
        stepTimings: [],
        identifier,
        pipelineId,
    };
}

/**
 * Add a new run entry to the registry (on run start)
 */
export function addRunToRegistry(entry: RunRegistryEntry): void {
    const registry = readRegistry();
    
    // Add to beginning (newest first)
    registry.runs.unshift(entry);
    
    writeRegistry(registry);
    
    // Export updated history
    exportRunHistory();
    
    console.log(`[RunRegistry] Added run: ${entry.runId}`);
}

/**
 * Update an existing run entry (on run finish or status change)
 */
export function updateRunInRegistry(
    runId: string,
    updates: Partial<Pick<RunRegistryEntry, 'status' | 'finishedAt' | 'durationMs' | 'artifacts' | 'warnings' | 'visionQaStatus' | 'benchmarkStatus' | 'stepTimings' | 'validationWarnings'>>
): void {
    const registry = readRegistry();
    
    const index = registry.runs.findIndex(r => r.runId === runId);
    if (index === -1) {
        console.warn(`[RunRegistry] Run not found: ${runId}`);
        return;
    }
    
    // Apply updates
    const entry = registry.runs[index];
    if (!entry) return;
    
    if (updates.status !== undefined) entry.status = updates.status;
    if (updates.finishedAt !== undefined) entry.finishedAt = updates.finishedAt;
    if (updates.durationMs !== undefined) entry.durationMs = updates.durationMs;
    if (updates.visionQaStatus !== undefined) entry.visionQaStatus = updates.visionQaStatus;
    if (updates.benchmarkStatus !== undefined) entry.benchmarkStatus = updates.benchmarkStatus;
    if (updates.stepTimings !== undefined) entry.stepTimings = updates.stepTimings;
    if (updates.validationWarnings !== undefined) entry.validationWarnings = updates.validationWarnings;
    
    if (updates.artifacts) {
        entry.artifacts = { ...entry.artifacts, ...updates.artifacts };
    }
    
    if (updates.warnings) {
        entry.warnings = [...entry.warnings, ...updates.warnings];
    }
    
    writeRegistry(registry);
    
    // Export updated history
    exportRunHistory();
    
    console.log(`[RunRegistry] Updated run: ${runId} -> ${updates.status || 'update'}`);
}

/**
 * Get a run entry by ID
 */
export function getRunById(runId: string): RunRegistryEntry | null {
    const registry = readRegistry();
    return registry.runs.find(r => r.runId === runId) || null;
}

/**
 * Get the most recent run
 */
export function getLatestRun(): RunRegistryEntry | null {
    const registry = readRegistry();
    return registry.runs[0] || null;
}

/**
 * Get runs by type
 */
export function getRunsByType(type: PipelineType, limit?: number): RunRegistryEntry[] {
    const registry = readRegistry();
    const filtered = registry.runs.filter(r => r.type === type);
    return limit ? filtered.slice(0, limit) : filtered;
}

// ============================================================================
// History Export
// ============================================================================

/**
 * Convert a registry entry to a history entry (for UI)
 */
function toHistoryEntry(entry: RunRegistryEntry): RunHistoryEntry {
    const now = Date.now();
    const finishedTime = entry.finishedAt ? new Date(entry.finishedAt).getTime() : null;
    const ageMs = finishedTime ? now - finishedTime : null;
    
    return {
        runId: entry.runId,
        type: entry.type,
        status: entry.status,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
        durationMs: entry.durationMs,
        identifier: entry.identifier,
        sample: entry.options.sample || entry.options.script,
        temporalApplied: entry.options.temporal === 'on',
        keyWarnings: entry.warnings.slice(0, 3),
        warningCount: entry.warnings.length,
        artifacts: entry.artifacts,
        stepTimings: entry.stepTimings,
        validationWarnings: entry.validationWarnings,
        ageMs,
        visionQaStatus: entry.visionQaStatus,
    };
}

/**
 * Export run history to public/run-history.json for UI consumption
 */
export function exportRunHistory(limit: number = DEFAULT_HISTORY_LIMIT): void {
    const registry = readRegistry();
    const historyPath = getHistoryPath();
    
    const runs = registry.runs.slice(0, limit).map(toHistoryEntry);
    
    const history: RunHistoryFile = {
        version: '1.0',
        runs,
        totalCount: registry.runs.length,
        lastUpdated: new Date().toISOString(),
    };
    
    const dir = path.dirname(historyPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Atomic write
    const tempPath = `${historyPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(history, null, 2));
    fs.renameSync(tempPath, historyPath);
    
    console.log(`[RunRegistry] Exported history: ${runs.length} runs`);
}

// ============================================================================
// Cleanup / Retention
// ============================================================================

/**
 * Get runs older than a cutoff date
 */
export function getRunsOlderThan(cutoffDate: Date): RunRegistryEntry[] {
    const registry = readRegistry();
    const cutoffTime = cutoffDate.getTime();
    
    return registry.runs.filter(r => {
        const finishedAt = r.finishedAt ? new Date(r.finishedAt).getTime() : null;
        return finishedAt && finishedAt < cutoffTime;
    });
}

/**
 * Get runs beyond keep count (for keepLastN policy)
 */
export function getRunsBeyondLimit(keepCount: number): RunRegistryEntry[] {
    const registry = readRegistry();
    return registry.runs.slice(keepCount);
}

/**
 * Remove runs from registry by IDs
 */
export function removeRunsFromRegistry(runIds: string[]): number {
    const registry = readRegistry();
    const originalCount = registry.runs.length;
    
    const idsSet = new Set(runIds);
    registry.runs = registry.runs.filter(r => !idsSet.has(r.runId));
    
    writeRegistry(registry);
    
    const removedCount = originalCount - registry.runs.length;
    if (removedCount > 0) {
        console.log(`[RunRegistry] Removed ${removedCount} runs from registry`);
        exportRunHistory();
    }
    
    return removedCount;
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Extract artifacts from a production run summary
 */
export function extractProductionArtifacts(summary: Record<string, unknown>): RunArtifacts {
    return {
        video: summary.videoPath as string | undefined,
        originalVideo: summary.originalVideoPath as string | undefined,
        visionQa: summary.visionQaResultsPath as string | undefined,
        benchmarkJson: summary.benchmarkJsonPath as string | undefined,
        benchmarkMd: summary.benchmarkReportPath as string | undefined,
        manifest: summary.manifestPath as string | undefined,
        runDir: summary.runDir as string | undefined,
    };
}

/**
 * Extract artifacts from a narrative run summary
 */
export function extractNarrativeArtifacts(summary: Record<string, unknown>): RunArtifacts {
    return {
        finalVideo: summary.finalVideoPath as string | undefined,
        runDir: summary.runDir as string | undefined,
    };
}

/**
 * Parse warnings from a summary
 */
export function extractWarnings(summary: Record<string, unknown>): string[] {
    const warnings: string[] = [];
    
    if (Array.isArray(summary.warnings)) {
        warnings.push(...summary.warnings.filter((w): w is string => typeof w === 'string'));
    }
    
    const preflight = summary.preflight as Record<string, unknown> | undefined;
    if (preflight && Array.isArray(preflight.warnings)) {
        warnings.push(...preflight.warnings.filter((w): w is string => typeof w === 'string'));
    }
    
    return warnings;
}
