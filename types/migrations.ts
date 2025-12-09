import { Scene, LocalGenerationSettings, SceneContinuityData, StoryBible } from '../types';

/**
 * Represents the state of the project data during migration.
 * Includes known fields for type safety and an index signature for flexibility.
 */
export interface MigrationState {
    version: number;
    scenes?: Scene[];
    localGenSettings?: LocalGenerationSettings;
    continuityData?: Record<string, SceneContinuityData>;
    storyBible?: StoryBible;
    visualBible?: StoryBible; // Legacy name support
    [key: string]: unknown;
}

/**
 * Definition of a migration step.
 */
export interface Migration {
    /** Target version after migration */
    version: number;
    /** Human-readable name */
    name: string;
    /** Description of changes */
    description: string;
    /** Migrate from previous version to this version */
    up: (state: MigrationState) => MigrationState;
    /** Rollback from this version to previous version */
    down: (state: MigrationState) => MigrationState;
}

/**
 * Result of a migration operation.
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
    state: MigrationState;
}
