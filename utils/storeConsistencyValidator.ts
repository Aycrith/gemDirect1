/**
 * Store Consistency Validator - Phase 1B Implementation
 * 
 * Provides utilities for validating consistency between the old 
 * usePersistentState-based state and the new Zustand store during 
 * the migration period.
 * 
 * ## Usage
 * ```typescript
 * const oldSnapshot = createOldStoreSnapshot({ scenes, activeSceneId, ... });
 * const newSnapshot = createNewStoreSnapshot({ scenes, selectedSceneId, ... });
 * const result = validateStoreConsistency(oldSnapshot, newSnapshot, { logToConsole: true });
 * if (!result.consistent) {
 *   console.warn('Store inconsistency detected:', result.differences);
 * }
 * ```
 * 
 * @module utils/storeConsistencyValidator
 */

import type {
    Scene,
    KeyframeData,
    SceneImageGenerationStatus,
} from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Difference types for consistency validation
 */
export type DifferenceType = 
    | 'missing_in_new'      // Item exists in old store but not new
    | 'missing_in_old'      // Item exists in new store but not old
    | 'value_mismatch'      // Item exists in both but values differ
    | 'type_mismatch';      // Item exists in both but types differ

/**
 * Single difference record
 */
export interface StateDifference {
    /** Path to the differing value (e.g., "scenes.0.title") */
    path: string;
    
    /** Type of difference */
    type: DifferenceType;
    
    /** Value in old store */
    oldValue?: unknown;
    
    /** Value in new store */
    newValue?: unknown;
    
    /** Severity level */
    severity: 'critical' | 'warning' | 'info';
    
    /** Human-readable description */
    description: string;
}

/**
 * Consistency validation result
 */
export interface ConsistencyResult {
    /** Whether stores are consistent */
    consistent: boolean;
    
    /** List of differences found */
    differences: StateDifference[];
    
    /** Timestamp of validation */
    timestamp: number;
    
    /** Number of critical differences */
    criticalCount: number;
    
    /** Number of warning differences */
    warningCount: number;
    
    /** Total items compared */
    itemsCompared: number;
    
    /** Consistency percentage (0-100) */
    consistencyPercentage: number;
}

/**
 * Old store state snapshot for comparison
 */
export interface OldStoreSnapshot {
    scenes: Scene[];
    activeSceneId: string | null;
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
}

/**
 * New store state snapshot for comparison
 */
export interface NewStoreSnapshot {
    scenes: Scene[];
    selectedSceneId: string | null;
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
}

/**
 * Migration phase for store transition
 * - 'parallel': Both stores active, strict validation
 * - 'zustand-primary': Zustand is source of truth, legacy syncs from it
 * - 'zustand-only': Legacy store deprecated, skip legacy-related warnings
 */
export type MigrationPhase = 'parallel' | 'zustand-primary' | 'zustand-only';

/**
 * Validation options
 */
export interface ValidationOptions {
    /** Log differences to console */
    logToConsole?: boolean;
    
    /** Track metrics for telemetry */
    trackMetrics?: boolean;
    
    /** Ignore specific paths (regex patterns) */
    ignorePaths?: RegExp[];
    
    /** Only compare these paths */
    onlyPaths?: string[];
    
    /**
     * Migration phase - controls how discrepancies are interpreted.
     * - 'parallel': Strict validation, all differences are errors
     * - 'zustand-primary': Zustand is source of truth, missing_in_old is expected
     * - 'zustand-only': Skip validation entirely (legacy deprecated)
     * @default 'zustand-primary'
     */
    migrationPhase?: MigrationPhase;
}

// ============================================================================
// Core Validation Implementation
// ============================================================================

/**
 * Deep compare two values and return whether they are equal.
 * Handles primitives, arrays, objects, null/undefined.
 */
function deepEqual(a: unknown, b: unknown): boolean {
    // Handle null/undefined
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    
    // Type check
    if (typeof a !== typeof b) return false;
    
    // Primitives
    if (typeof a !== 'object') return a === b;
    
    // Arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, idx) => deepEqual(item, b[idx]));
    }
    
    // One is array, other is not
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    // Objects
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    
    if (aKeys.length !== bKeys.length) return false;
    if (!aKeys.every((key, idx) => key === bKeys[idx])) return false;
    
    return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
}

/**
 * Get a summary string for a value (for logging).
 */
function valueSummary(val: unknown, maxLen: number = 50): string {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') {
        return val.length > maxLen ? `"${val.slice(0, maxLen)}..."` : `"${val}"`;
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
        return String(val);
    }
    if (Array.isArray(val)) {
        return `Array(${val.length})`;
    }
    if (typeof val === 'object') {
        const keys = Object.keys(val);
        return `Object{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }
    return String(val);
}

/**
 * Determine severity based on the path and difference type.
 */
function getSeverity(path: string, type: DifferenceType): 'critical' | 'warning' | 'info' {
    // Critical: scenes data loss
    if (path.startsWith('scenes') && (type === 'missing_in_new' || type === 'missing_in_old')) {
        return 'critical';
    }
    
    // Critical: generated images/videos missing
    if ((path.startsWith('generatedImages') || path.startsWith('generatedShotImages')) && 
        type === 'missing_in_new') {
        return 'critical';
    }
    
    // Warning: value mismatches in important fields
    if (type === 'value_mismatch') {
        if (path.includes('.title') || path.includes('.description') || 
            path.includes('.shots') || path.includes('.timeline')) {
            return 'warning';
        }
    }
    
    // Warning: selected scene ID mismatch
    if (path === 'selectedSceneId' || path === 'activeSceneId') {
        return 'warning';
    }
    
    // Info: everything else
    return 'info';
}

/**
 * Validate consistency between old and new store states.
 * 
 * @param oldState - Snapshot from old usePersistentState hooks
 * @param newState - Snapshot from new Zustand store
 * @param options - Validation options
 * @returns ConsistencyResult
 */
export function validateStoreConsistency(
    oldState: OldStoreSnapshot,
    newState: NewStoreSnapshot,
    options: ValidationOptions = {}
): ConsistencyResult {
    // Default migration phase to 'zustand-primary' - expected behavior during migration
    const migrationPhase = options.migrationPhase ?? 'zustand-primary';
    
    // Skip validation entirely if migration is complete (zustand-only)
    if (migrationPhase === 'zustand-only') {
        return {
            consistent: true,
            differences: [],
            timestamp: Date.now(),
            criticalCount: 0,
            warningCount: 0,
            itemsCompared: 0,
            consistencyPercentage: 100,
        };
    }
    
    const differences: StateDifference[] = [];
    let itemsCompared = 0;
    
    // Compare scenes
    const sceneDiffs = compareScenes(oldState.scenes, newState.scenes);
    differences.push(...sceneDiffs);
    itemsCompared += Math.max(oldState.scenes.length, newState.scenes.length);
    
    // Compare selected scene ID (old uses activeSceneId, new uses selectedSceneId)
    if (oldState.activeSceneId !== newState.selectedSceneId) {
        differences.push({
            path: 'selectedSceneId',
            type: 'value_mismatch',
            oldValue: oldState.activeSceneId,
            newValue: newState.selectedSceneId,
            severity: 'warning',
            description: `Selected scene ID mismatch: old="${oldState.activeSceneId}", new="${newState.selectedSceneId}"`,
        });
    }
    itemsCompared++;
    
    // Compare generated images
    const imageDiffs = compareRecords(
        oldState.generatedImages as Record<string, unknown>, 
        newState.generatedImages as Record<string, unknown>, 
        'generatedImages'
    );
    differences.push(...imageDiffs);
    itemsCompared += Object.keys(oldState.generatedImages).length + 
                     Object.keys(newState.generatedImages).length;
    
    // Compare generated shot images
    const shotImageDiffs = compareRecords(
        oldState.generatedShotImages, 
        newState.generatedShotImages, 
        'generatedShotImages'
    );
    differences.push(...shotImageDiffs);
    itemsCompared += Object.keys(oldState.generatedShotImages).length + 
                     Object.keys(newState.generatedShotImages).length;
    
    // Compare scene image statuses
    const statusDiffs = compareRecords(
        oldState.sceneImageStatuses as Record<string, unknown>, 
        newState.sceneImageStatuses as Record<string, unknown>, 
        'sceneImageStatuses'
    );
    differences.push(...statusDiffs);
    itemsCompared += Object.keys(oldState.sceneImageStatuses).length + 
                     Object.keys(newState.sceneImageStatuses).length;
    
    // Filter by ignorePaths if provided
    let filteredDifferences = differences;
    if (options.ignorePaths && options.ignorePaths.length > 0) {
        filteredDifferences = differences.filter(diff => 
            !options.ignorePaths!.some(pattern => pattern.test(diff.path))
        );
    }
    
    // Filter by onlyPaths if provided
    if (options.onlyPaths && options.onlyPaths.length > 0) {
        filteredDifferences = filteredDifferences.filter(diff =>
            options.onlyPaths!.some(path => diff.path.startsWith(path))
        );
    }
    
    // Migration-phase-aware severity adjustment
    // In 'zustand-primary' mode, items missing in old store are expected (Zustand loaded first)
    if (migrationPhase === 'zustand-primary') {
        filteredDifferences = filteredDifferences.map(diff => {
            // Downgrade 'missing_in_old' from critical to info - expected during migration
            if (diff.type === 'missing_in_old') {
                return {
                    ...diff,
                    severity: 'info' as const,
                    description: `[Migration Expected] ${diff.description}`,
                };
            }
            // Downgrade selectedSceneId mismatch when old is null (initial load race)
            if (diff.path === 'selectedSceneId' && diff.oldValue === null && diff.newValue !== null) {
                return {
                    ...diff,
                    severity: 'info' as const,
                    description: `[Migration Expected] ${diff.description}`,
                };
            }
            return diff;
        });
    }
    
    const criticalCount = filteredDifferences.filter(d => d.severity === 'critical').length;
    const warningCount = filteredDifferences.filter(d => d.severity === 'warning').length;
    
    const result: ConsistencyResult = {
        consistent: filteredDifferences.length === 0,
        differences: filteredDifferences,
        timestamp: Date.now(),
        criticalCount,
        warningCount,
        itemsCompared,
        consistencyPercentage: itemsCompared === 0 
            ? 100 
            : Math.round((1 - filteredDifferences.length / itemsCompared) * 100),
    };
    
    // Logging
    if (options.logToConsole) {
        logConsistencyResult(result);
    }
    
    // Metrics tracking
    if (options.trackMetrics) {
        trackConsistencyMetrics(result);
    }
    
    return result;
}

/**
 * Compare two scene arrays for differences.
 * 
 * @param oldScenes - Scenes from old store
 * @param newScenes - Scenes from new store
 * @returns StateDifference[]
 */
export function compareScenes(
    oldScenes: Scene[],
    newScenes: Scene[]
): StateDifference[] {
    const differences: StateDifference[] = [];
    
    // Create maps by ID for efficient comparison
    const oldMap = new Map(oldScenes.map(s => [s.id, s]));
    const newMap = new Map(newScenes.map(s => [s.id, s]));
    
    // Check for scenes in old but not in new
    for (const [id, oldScene] of oldMap) {
        if (!newMap.has(id)) {
            differences.push({
                path: `scenes.${id}`,
                type: 'missing_in_new',
                oldValue: { id, title: oldScene.title },
                newValue: undefined,
                severity: 'critical',
                description: `Scene "${oldScene.title}" (${id}) exists in old store but missing in new store`,
            });
        }
    }
    
    // Check for scenes in new but not in old
    for (const [id, newScene] of newMap) {
        if (!oldMap.has(id)) {
            differences.push({
                path: `scenes.${id}`,
                type: 'missing_in_old',
                oldValue: undefined,
                newValue: { id, title: newScene.title },
                severity: 'critical',
                description: `Scene "${newScene.title}" (${id}) exists in new store but missing in old store`,
            });
        }
    }
    
    // Compare scenes that exist in both
    for (const [id, oldScene] of oldMap) {
        const newScene = newMap.get(id);
        if (!newScene) continue;
        
        // Compare key fields
        const fieldsToCompare: (keyof Scene)[] = [
            'title', 'summary', 'keyframeMode', 'heroArcId', 'heroArcName'
        ];
        
        for (const field of fieldsToCompare) {
            if (!deepEqual(oldScene[field], newScene[field])) {
                differences.push({
                    path: `scenes.${id}.${field}`,
                    type: 'value_mismatch',
                    oldValue: oldScene[field],
                    newValue: newScene[field],
                    severity: getSeverity(`scenes.${id}.${field}`, 'value_mismatch'),
                    description: `Scene "${oldScene.title}".${field} differs: old=${valueSummary(oldScene[field])}, new=${valueSummary(newScene[field])}`,
                });
            }
        }
        
        // Compare timeline if present
        if (oldScene.timeline || newScene.timeline) {
            if (!oldScene.timeline && newScene.timeline) {
                differences.push({
                    path: `scenes.${id}.timeline`,
                    type: 'missing_in_old',
                    oldValue: undefined,
                    newValue: { shots: newScene.timeline.shots.length },
                    severity: 'warning',
                    description: `Scene "${oldScene.title}" has timeline in new store but not old`,
                });
            } else if (oldScene.timeline && !newScene.timeline) {
                differences.push({
                    path: `scenes.${id}.timeline`,
                    type: 'missing_in_new',
                    oldValue: { shots: oldScene.timeline.shots.length },
                    newValue: undefined,
                    severity: 'critical',
                    description: `Scene "${oldScene.title}" has timeline in old store but not new`,
                });
            } else if (oldScene.timeline && newScene.timeline) {
                // Compare shot counts
                if (oldScene.timeline.shots.length !== newScene.timeline.shots.length) {
                    differences.push({
                        path: `scenes.${id}.timeline.shots.length`,
                        type: 'value_mismatch',
                        oldValue: oldScene.timeline.shots.length,
                        newValue: newScene.timeline.shots.length,
                        severity: 'critical',
                        description: `Scene "${oldScene.title}" shot count differs: old=${oldScene.timeline.shots.length}, new=${newScene.timeline.shots.length}`,
                    });
                }
            }
        }
    }
    
    return differences;
}

/**
 * Compare two record objects for differences.
 * 
 * @param oldRecord - Record from old store
 * @param newRecord - Record from new store
 * @param basePath - Base path for difference reporting
 * @returns StateDifference[]
 */
export function compareRecords<T>(
    oldRecord: Record<string, T>,
    newRecord: Record<string, T>,
    basePath: string
): StateDifference[] {
    const differences: StateDifference[] = [];
    const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);
    
    for (const key of allKeys) {
        const path = `${basePath}.${key}`;
        const oldVal = oldRecord[key];
        const newVal = newRecord[key];
        
        if (oldVal === undefined && newVal !== undefined) {
            differences.push({
                path,
                type: 'missing_in_old',
                oldValue: undefined,
                newValue: valueSummary(newVal),
                severity: getSeverity(path, 'missing_in_old'),
                description: `${path} exists in new store but not old`,
            });
        } else if (oldVal !== undefined && newVal === undefined) {
            differences.push({
                path,
                type: 'missing_in_new',
                oldValue: valueSummary(oldVal),
                newValue: undefined,
                severity: getSeverity(path, 'missing_in_new'),
                description: `${path} exists in old store but not new`,
            });
        } else if (!deepEqual(oldVal, newVal)) {
            differences.push({
                path,
                type: 'value_mismatch',
                oldValue: valueSummary(oldVal),
                newValue: valueSummary(newVal),
                severity: getSeverity(path, 'value_mismatch'),
                description: `${path} values differ`,
            });
        }
    }
    
    return differences;
}

/**
 * Log consistency result to console with formatting.
 * 
 * @param result - ConsistencyResult to log
 */
export function logConsistencyResult(result: ConsistencyResult): void {
    const prefix = '[StoreConsistencyValidator]';
    
    if (result.consistent) {
        console.log(`${prefix} ✅ Stores are consistent (${result.itemsCompared} items compared)`);
        return;
    }
    
    console.group(`${prefix} ⚠️ Store inconsistencies detected`);
    console.log(`Consistency: ${result.consistencyPercentage}%`);
    console.log(`Items compared: ${result.itemsCompared}`);
    console.log(`Differences: ${result.differences.length} (${result.criticalCount} critical, ${result.warningCount} warnings)`);
    
    if (result.criticalCount > 0) {
        console.group('🔴 Critical differences:');
        result.differences
            .filter(d => d.severity === 'critical')
            .forEach(d => console.error(`  ${d.path}: ${d.description}`));
        console.groupEnd();
    }
    
    if (result.warningCount > 0) {
        console.group('🟡 Warnings:');
        result.differences
            .filter(d => d.severity === 'warning')
            .forEach(d => console.warn(`  ${d.path}: ${d.description}`));
        console.groupEnd();
    }
    
    const infoCount = result.differences.filter(d => d.severity === 'info').length;
    if (infoCount > 0) {
        console.log(`ℹ️ ${infoCount} info-level differences (suppressed)`);
    }
    
    console.groupEnd();
}

/**
 * Track consistency metrics for telemetry.
 * 
 * @param result - ConsistencyResult to track
 */
export function trackConsistencyMetrics(result: ConsistencyResult): void {
    // Log structured telemetry event
    console.log('[StoreConsistencyValidator:Telemetry]', JSON.stringify({
        event: 'store_consistency_check',
        timestamp: result.timestamp,
        consistent: result.consistent,
        consistencyPercentage: result.consistencyPercentage,
        itemsCompared: result.itemsCompared,
        criticalCount: result.criticalCount,
        warningCount: result.warningCount,
        totalDifferences: result.differences.length,
    }));
}

// ============================================================================
// Utility Functions (Implemented)
// ============================================================================

/**
 * Create a snapshot of old store state for comparison.
 * 
 * @param state - Object containing old store state values
 * @returns OldStoreSnapshot
 */
export function createOldStoreSnapshot(state: {
    scenes: Scene[];
    activeSceneId: string | null;
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
}): OldStoreSnapshot {
    return {
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
        generatedImages: state.generatedImages,
        generatedShotImages: state.generatedShotImages,
        sceneImageStatuses: state.sceneImageStatuses,
    };
}

/**
 * Create a snapshot of new store state for comparison.
 * 
 * @param state - Object containing new store state values
 * @returns NewStoreSnapshot
 */
export function createNewStoreSnapshot(state: {
    scenes: Scene[];
    selectedSceneId: string | null;
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
}): NewStoreSnapshot {
    return {
        scenes: state.scenes,
        selectedSceneId: state.selectedSceneId,
        generatedImages: state.generatedImages,
        generatedShotImages: state.generatedShotImages,
        sceneImageStatuses: state.sceneImageStatuses,
    };
}

/**
 * Check if parallel validation should be run based on feature flags.
 * 
 * @param featureFlags - Feature flags from settings
 * @returns boolean
 */
export function shouldRunParallelValidation(
    featureFlags?: { useUnifiedSceneStore?: boolean; sceneStoreParallelValidation?: boolean }
): boolean {
    return !!(
        featureFlags?.useUnifiedSceneStore && 
        featureFlags?.sceneStoreParallelValidation
    );
}
