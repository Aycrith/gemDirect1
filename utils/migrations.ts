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
import { Migration, MigrationState, MigrationResult } from '../types/migrations';

/**
 * Current project schema version
 * Increment this when making breaking changes to project structure
 */
export const CURRENT_PROJECT_VERSION = 2;


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
        up: (state: MigrationState) => {
            const migrated = { ...state, version: 2 };
            
            // Initialize featureFlags if not present
            if (migrated.localGenSettings && !migrated.localGenSettings.featureFlags) {
                migrated.localGenSettings.featureFlags = {
                    // Note: bookendKeyframes removed - use localGenSettings.keyframeMode instead
                    videoUpscaling: false,
                    characterConsistency: false,
                    shotLevelContinuity: false,
                    autoSuggestions: false,
                    narrativeStateTracking: false,
                    promptABTesting: false,
                    providerHealthPolling: false,
                    promptQualityGate: false,
                    characterAppearanceTracking: false,
                } as any;
            }
            
            // Remove legacy bookendKeyframes from featureFlags if present (migrated to keyframeMode)
            const flags = migrated.localGenSettings?.featureFlags as Record<string, unknown> | undefined;
            if (flags?.bookendKeyframes !== undefined) {
                delete flags.bookendKeyframes;
            }
            
            // Add healthCheckIntervalMs default if not present
            if (migrated.localGenSettings && !migrated.localGenSettings.healthCheckIntervalMs) {
                migrated.localGenSettings.healthCheckIntervalMs = 30000;
            }
            
            // Add category to existing workflow profiles
            if (migrated.localGenSettings?.workflowProfiles) {
                for (const [profileId, profile] of Object.entries(migrated.localGenSettings.workflowProfiles)) {
                    if (!profile.category) {
                        // Infer category from profile ID
                        if (profileId.includes('t2i') || profileId.includes('text-to-image')) {
                            profile.category = 'keyframe';
                        } else if (profileId.includes('i2v') || profileId.includes('video')) {
                            profile.category = 'video';
                        } else if (profileId.includes('upscale')) {
                            profile.category = 'upscaler';
                        } else if (profileId.includes('character') || profileId.includes('ccc')) {
                            profile.category = 'character';
                        } else {
                            profile.category = 'video'; // Default
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
            
            // Add descriptorSource to Visual Bible characters for provenance tracking
            if (migrated.visualBible?.characters && Array.isArray(migrated.visualBible.characters)) {
                for (const character of migrated.visualBible.characters) {
                    if (!character.descriptorSource) {
                        // Conservative default: assume all existing descriptors came from Story Bible
                        // This prevents auto-sync from overwriting until user explicitly edits
                        character.descriptorSource = 'storyBible';
                    }
                }
            }
            
            // Add new pipeline flags to existing featureFlags
            if (migrated.localGenSettings?.featureFlags) {
                const flags = migrated.localGenSettings.featureFlags as any;
                if (typeof flags.sceneListContextV2 === 'undefined') flags.sceneListContextV2 = false;
                if (typeof flags.actContextV2 === 'undefined') flags.actContextV2 = false;
                if (typeof flags.keyframePromptPipeline === 'undefined') flags.keyframePromptPipeline = false;
                if (typeof flags.videoPromptPipeline === 'undefined') flags.videoPromptPipeline = false;
                if (typeof flags.bibleV2SaveSync === 'undefined') flags.bibleV2SaveSync = false;
                if (typeof flags.sceneListValidationMode === 'undefined') flags.sceneListValidationMode = 'off';
                if (typeof flags.promptTokenGuard === 'undefined') flags.promptTokenGuard = 'off';
            }
            
            return migrated;
        },
        down: (state: MigrationState) => {
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
            
            // Remove descriptorSource from Visual Bible characters
            if (migrated.visualBible?.characters && Array.isArray(migrated.visualBible.characters)) {
                for (const character of migrated.visualBible.characters) {
                    delete character.descriptorSource;
                }
            }
            
            // Remove new pipeline flags
            if (migrated.localGenSettings?.featureFlags) {
                const flags = migrated.localGenSettings.featureFlags as any;
                delete flags.sceneListContextV2;
                delete flags.actContextV2;
                delete flags.keyframePromptPipeline;
                delete flags.videoPromptPipeline;
                delete flags.bibleV2SaveSync;
                delete flags.sceneListValidationMode;
                delete flags.promptTokenGuard;
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
    state: MigrationState,
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
export function needsMigration(state: MigrationState): boolean {
    const version = state.version ?? 1;
    return version !== CURRENT_PROJECT_VERSION;
}

/**
 * Get version info for display
 * 
 * @param state - Project state
 * @returns Version info object
 */
export function getVersionInfo(state: MigrationState): {
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
export function preserveUnknownFields<T extends MigrationState>(state: T, migratedState: T): T {
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
export function validateMigratedProject(state: MigrationState): ValidationResult {
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
            if (!scene) continue;
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
