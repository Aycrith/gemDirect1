/**
 * Project Migration Framework
 * 
 * Provides versioned schema migrations for project files.
 * Ensures backward compatibility when loading older projects
 * and forward compatibility by preserving unknown fields.
 * 
 * @module utils/migrations
 */

import { ValidationResult, validationSuccess, validationFailure, createValidationError, createValidationWarning } from '../types/validation';

/**
 * Current project schema version
 * Increment this when making breaking changes to project structure
 */
export const CURRENT_PROJECT_VERSION = 2;

/**
 * Migration definition
 */
export interface Migration {
    /** Target version after migration */
    version: number;
    /** Human-readable name */
    name: string;
    /** Description of changes */
    description: string;
    /** Migrate from previous version to this version */
    up: (state: any) => any;
    /** Rollback from this version to previous version */
    down: (state: any) => any;
}

/**
 * Migration result with details
 */
export interface MigrationResult {
    /** Original version */
    fromVersion: number;
    /** Final version */
    toVersion: number;
    /** Migrations applied */
    migrationsApplied: string[];
    /** Warnings during migration */
    warnings: string[];
    /** Migrated state */
    state: any;
}

/**
 * Registered migrations (ordered by version)
 */
const migrations: Migration[] = [
    // ============================================================================
    // Migration v1 → v2: Add feature flags and enhanced workflow profiles
    // ============================================================================
    {
        version: 2,
        name: 'add-feature-flags-and-enhanced-profiles',
        description: 'Adds featureFlags to LocalGenerationSettings, extends WorkflowProfile with category/chainPosition, adds character tracking fields to VisualBibleCharacter',
        up: (state: any) => {
            const migrated = { ...state, version: 2 };
            
            // Initialize featureFlags if not present
            if (migrated.localGenSettings && !migrated.localGenSettings.featureFlags) {
                migrated.localGenSettings.featureFlags = {
                    bookendKeyframes: false,
                    videoUpscaling: false,
                    characterConsistency: false,
                    shotLevelContinuity: false,
                    autoSuggestions: false,
                    narrativeStateTracking: false,
                    promptABTesting: false,
                    providerHealthPolling: false,
                    promptQualityGate: false,
                    characterAppearanceTracking: false,
                };
            }
            
            // Add healthCheckIntervalMs default if not present
            if (migrated.localGenSettings && !migrated.localGenSettings.healthCheckIntervalMs) {
                migrated.localGenSettings.healthCheckIntervalMs = 30000;
            }
            
            // Add category to existing workflow profiles
            if (migrated.localGenSettings?.workflowProfiles) {
                for (const [profileId, profile] of Object.entries(migrated.localGenSettings.workflowProfiles)) {
                    const p = profile as any;
                    if (!p.category) {
                        // Infer category from profile ID
                        if (profileId.includes('t2i') || profileId.includes('text-to-image')) {
                            p.category = 'keyframe';
                        } else if (profileId.includes('i2v') || profileId.includes('video')) {
                            p.category = 'video';
                        } else if (profileId.includes('upscale')) {
                            p.category = 'upscaler';
                        } else if (profileId.includes('character') || profileId.includes('ccc')) {
                            p.category = 'character';
                        } else {
                            p.category = 'video'; // Default
                        }
                    }
                }
            }
            
            // Add autoGenerateSuggestions to continuityData entries
            if (migrated.continuityData) {
                for (const sceneId of Object.keys(migrated.continuityData)) {
                    const data = migrated.continuityData[sceneId];
                    if (data && typeof data.autoGenerateSuggestions === 'undefined') {
                        data.autoGenerateSuggestions = false;
                    }
                }
            }
            
            // Add keyframeMode to scenes if not present
            if (migrated.scenes && Array.isArray(migrated.scenes)) {
                for (const scene of migrated.scenes) {
                    if (!scene.keyframeMode) {
                        scene.keyframeMode = 'single';
                    }
                }
            }
            
            return migrated;
        },
        down: (state: any) => {
            const migrated = { ...state, version: 1 };
            
            // Remove featureFlags
            if (migrated.localGenSettings) {
                delete migrated.localGenSettings.featureFlags;
                delete migrated.localGenSettings.healthCheckIntervalMs;
                delete migrated.localGenSettings.promptVersion;
                delete migrated.localGenSettings.upscalerWorkflowProfile;
                delete migrated.localGenSettings.characterWorkflowProfile;
            }
            
            // Remove category from workflow profiles
            if (migrated.localGenSettings?.workflowProfiles) {
                for (const profile of Object.values(migrated.localGenSettings.workflowProfiles)) {
                    const p = profile as any;
                    delete p.category;
                    delete p.chainPosition;
                    delete p.inputProfiles;
                }
            }
            
            // Remove autoGenerateSuggestions from continuityData
            if (migrated.continuityData) {
                for (const data of Object.values(migrated.continuityData)) {
                    const d = data as any;
                    delete d.autoGenerateSuggestions;
                    delete d.lastSuggestionTimestamp;
                    delete d.regenerationAttempts;
                }
            }
            
            // Remove keyframeMode from scenes
            if (migrated.scenes && Array.isArray(migrated.scenes)) {
                for (const scene of migrated.scenes) {
                    delete scene.keyframeMode;
                }
            }
            
            return migrated;
        },
    },
];

/**
 * Get migrations needed to reach target version
 * 
 * @param fromVersion - Starting version
 * @param toVersion - Target version
 * @returns Array of migrations to apply (in order)
 */
export function getMigrationsToApply(fromVersion: number, toVersion: number): Migration[] {
    if (fromVersion === toVersion) {
        return [];
    }
    
    if (fromVersion < toVersion) {
        // Upgrading: return migrations in ascending order
        return migrations
            .filter(m => m.version > fromVersion && m.version <= toVersion)
            .sort((a, b) => a.version - b.version);
    } else {
        // Downgrading: return migrations in descending order (for rollback)
        return migrations
            .filter(m => m.version <= fromVersion && m.version > toVersion)
            .sort((a, b) => b.version - a.version);
    }
}

/**
 * Apply migrations to project state
 * 
 * @param state - Project state to migrate
 * @param targetVersion - Target version (default: CURRENT_PROJECT_VERSION)
 * @returns Validation result with migrated state
 */
export function migrateProject(
    state: any,
    targetVersion: number = CURRENT_PROJECT_VERSION
): ValidationResult<MigrationResult> {
    const fromVersion = state.version ?? 1;
    const warnings: string[] = [];
    const migrationsApplied: string[] = [];
    
    // Already at target version
    if (fromVersion === targetVersion) {
        return validationSuccess({
            fromVersion,
            toVersion: targetVersion,
            migrationsApplied: [],
            warnings: [],
            state,
        }, 'No migration needed');
    }
    
    // Get migrations to apply
    const migrationsToApply = getMigrationsToApply(fromVersion, targetVersion);
    
    if (migrationsToApply.length === 0) {
        warnings.push(`No migrations found for version ${fromVersion} → ${targetVersion}`);
        return validationSuccess({
            fromVersion,
            toVersion: fromVersion, // Stay at current version
            migrationsApplied: [],
            warnings,
            state,
        }, 'No applicable migrations');
    }
    
    // Apply migrations
    let migratedState = { ...state };
    const isUpgrade = fromVersion < targetVersion;
    
    for (const migration of migrationsToApply) {
        try {
            console.log(`[Migration] Applying ${migration.name} (v${migration.version})`);
            
            if (isUpgrade) {
                migratedState = migration.up(migratedState);
            } else {
                migratedState = migration.down(migratedState);
            }
            
            migrationsApplied.push(migration.name);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return validationFailure([
                createValidationError(
                    'MIGRATION_FAILED',
                    `Migration "${migration.name}" failed: ${errorMsg}`,
                    { fix: 'Try loading the project without migration or restore from backup' }
                )
            ], {
                warnings: warnings.map((w, i) => createValidationWarning(`WARN_${i}`, w)),
                message: `Migration failed at ${migration.name}`,
            });
        }
    }
    
    // Ensure version is set correctly
    migratedState.version = targetVersion;
    
    console.log(`[Migration] Successfully migrated from v${fromVersion} to v${targetVersion}`);
    console.log(`[Migration] Applied: ${migrationsApplied.join(', ')}`);
    
    return validationSuccess({
        fromVersion,
        toVersion: targetVersion,
        migrationsApplied,
        warnings,
        state: migratedState,
    }, `Migrated from v${fromVersion} to v${targetVersion}`);
}

/**
 * Check if project needs migration
 * 
 * @param state - Project state to check
 * @returns True if migration is needed
 */
export function needsMigration(state: any): boolean {
    const version = state.version ?? 1;
    return version !== CURRENT_PROJECT_VERSION;
}

/**
 * Get version info for display
 * 
 * @param state - Project state
 * @returns Version info object
 */
export function getVersionInfo(state: any): {
    currentVersion: number;
    latestVersion: number;
    needsMigration: boolean;
    migrationsAvailable: string[];
} {
    const currentVersion = state.version ?? 1;
    const migrationsToApply = getMigrationsToApply(currentVersion, CURRENT_PROJECT_VERSION);
    
    return {
        currentVersion,
        latestVersion: CURRENT_PROJECT_VERSION,
        needsMigration: currentVersion !== CURRENT_PROJECT_VERSION,
        migrationsAvailable: migrationsToApply.map(m => m.name),
    };
}

/**
 * Preserve unknown fields during migration
 * Call this to ensure forward compatibility when loading projects
 * created by newer versions of the app
 * 
 * @param state - Original state
 * @param migratedState - State after migration
 * @returns State with unknown fields preserved
 */
export function preserveUnknownFields(state: any, migratedState: any): any {
    const result = { ...migratedState };
    
    // Recursively copy unknown fields from original state
    const copyUnknownFields = (original: any, target: any, depth: number = 0) => {
        if (depth > 5 || !original || !target || typeof original !== 'object' || typeof target !== 'object') {
            return;
        }
        
        for (const key of Object.keys(original)) {
            if (!(key in target)) {
                // Unknown field - preserve it
                target[key] = original[key];
            } else if (typeof original[key] === 'object' && typeof target[key] === 'object') {
                // Recurse into nested objects
                copyUnknownFields(original[key], target[key], depth + 1);
            }
        }
    };
    
    copyUnknownFields(state, result);
    
    return result;
}

/**
 * Validate project structure after migration
 * Ensures all required fields are present
 * 
 * @param state - Migrated project state
 * @returns Validation result
 */
export function validateMigratedProject(state: any): ValidationResult {
    const errors = [];
    const warnings = [];
    
    // Required top-level fields
    if (typeof state.version !== 'number') {
        errors.push(createValidationError('MISSING_VERSION', 'Project missing version field'));
    }
    
    // Check scenes array
    if (!Array.isArray(state.scenes)) {
        errors.push(createValidationError('INVALID_SCENES', 'scenes must be an array'));
    } else {
        // Validate each scene
        for (let i = 0; i < state.scenes.length; i++) {
            const scene = state.scenes[i];
            if (!scene.id) {
                warnings.push(createValidationWarning('SCENE_MISSING_ID', `Scene at index ${i} missing id`));
            }
            if (!scene.timeline) {
                warnings.push(createValidationWarning('SCENE_MISSING_TIMELINE', `Scene "${scene.id || i}" missing timeline`));
            }
        }
    }
    
    // Check localGenSettings
    if (state.localGenSettings) {
        if (!state.localGenSettings.comfyUIUrl && state.localGenSettings.videoProvider === 'comfyui-local') {
            warnings.push(createValidationWarning('MISSING_COMFYUI_URL', 'ComfyUI URL not configured'));
        }
    }
    
    if (errors.length > 0) {
        return validationFailure(errors, {
            warnings,
            message: 'Project validation failed after migration',
        });
    }
    
    return validationSuccess(undefined, 'Project validation passed');
}

/**
 * Register a custom migration
 * Useful for plugins or extensions
 * 
 * @param migration - Migration to register
 */
export function registerMigration(migration: Migration): void {
    // Check for duplicate version
    const existing = migrations.find(m => m.version === migration.version);
    if (existing) {
        console.warn(`[Migration] Overwriting existing migration for version ${migration.version}`);
        const index = migrations.indexOf(existing);
        migrations[index] = migration;
    } else {
        migrations.push(migration);
        // Keep sorted by version
        migrations.sort((a, b) => a.version - b.version);
    }
}

/**
 * Get all registered migrations
 * 
 * @returns Array of all migrations
 */
export function getAllMigrations(): Migration[] {
    return [...migrations];
}
