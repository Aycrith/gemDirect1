/**
 * Data Integrity Validator
 * 
 * Runtime validation for critical data structures to catch malformed
 * Gemini responses or data corruption before it propagates.
 * 
 * Design principles:
 * - Validators log warnings but don't throw (graceful degradation)
 * - Returns validated data or null for filtering
 * - Provides detailed validation results for debugging
 * 
 * @module services/dataIntegrityValidator
 */

import { Scene, Shot, TimelineData, ShotEnhancers } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('DataIntegrity');

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationIssue {
    field: string;
    message: string;
    severity: 'error' | 'warning';
    value?: unknown;
}

export interface ValidationResult<T> {
    valid: boolean;
    data: T | null;
    issues: ValidationIssue[];
}

// ============================================================================
// Shot Validation
// ============================================================================

/**
 * Validate a Shot object has all required fields with correct types.
 * 
 * @param data - Unknown data to validate as Shot
 * @param context - Optional context for logging (e.g., "Scene 1, Shot 3")
 * @returns ValidationResult with validated Shot or null if invalid
 */
export function validateShot(data: unknown, context?: string): ValidationResult<Shot> {
    const issues: ValidationIssue[] = [];
    const prefix = context ? `[${context}] ` : '';

    // Basic object check
    if (!data || typeof data !== 'object') {
        issues.push({
            field: 'root',
            message: 'Shot must be a non-null object',
            severity: 'error',
            value: data,
        });
        logger.warn(`${prefix}Invalid shot: not an object`, { type: typeof data });
        return { valid: false, data: null, issues };
    }

    const obj = data as Record<string, unknown>;

    // Required: id (string)
    if (typeof obj.id !== 'string' || obj.id.trim() === '') {
        issues.push({
            field: 'id',
            message: 'Shot.id must be a non-empty string',
            severity: 'error',
            value: obj.id,
        });
    }

    // Required: description (string)
    if (typeof obj.description !== 'string') {
        issues.push({
            field: 'description',
            message: 'Shot.description must be a string',
            severity: 'error',
            value: obj.description,
        });
    }

    // Optional: title (string if present)
    if (obj.title !== undefined && typeof obj.title !== 'string') {
        issues.push({
            field: 'title',
            message: 'Shot.title must be a string if present',
            severity: 'warning',
            value: obj.title,
        });
    }

    // Optional: purpose (string if present)
    if (obj.purpose !== undefined && typeof obj.purpose !== 'string') {
        issues.push({
            field: 'purpose',
            message: 'Shot.purpose must be a string if present',
            severity: 'warning',
            value: obj.purpose,
        });
    }

    const hasErrors = issues.some(i => i.severity === 'error');

    if (hasErrors) {
        logger.warn(`${prefix}Shot validation failed`, { 
            issues: issues.filter(i => i.severity === 'error').map(i => i.message) 
        });
        return { valid: false, data: null, issues };
    }

    // Construct validated shot with type coercion for warnings
    const validatedShot: Shot = {
        id: obj.id as string,
        description: obj.description as string,
        title: typeof obj.title === 'string' ? obj.title : undefined,
        purpose: typeof obj.purpose === 'string' ? obj.purpose : undefined,
        arcId: typeof obj.arcId === 'string' ? obj.arcId : undefined,
        arcName: typeof obj.arcName === 'string' ? obj.arcName : undefined,
        heroMoment: typeof obj.heroMoment === 'boolean' ? obj.heroMoment : undefined,
        keyframeStart: typeof obj.keyframeStart === 'string' ? obj.keyframeStart : undefined,
        keyframeEnd: typeof obj.keyframeEnd === 'string' ? obj.keyframeEnd : undefined,
        generatedVideo: typeof obj.generatedVideo === 'string' ? obj.generatedVideo : undefined,
    };

    if (issues.length > 0) {
        logger.info(`${prefix}Shot validated with warnings`, { 
            warnings: issues.map(i => i.message) 
        });
    }

    return { valid: true, data: validatedShot, issues };
}

// ============================================================================
// Timeline Validation
// ============================================================================

/**
 * Validate a TimelineData object has correct structure.
 * 
 * @param data - Unknown data to validate as TimelineData
 * @param context - Optional context for logging
 * @returns ValidationResult with validated TimelineData or null if invalid
 */
export function validateTimeline(data: unknown, context?: string): ValidationResult<TimelineData> {
    const issues: ValidationIssue[] = [];
    const prefix = context ? `[${context}] ` : '';

    if (!data || typeof data !== 'object') {
        issues.push({
            field: 'root',
            message: 'Timeline must be a non-null object',
            severity: 'error',
        });
        logger.warn(`${prefix}Invalid timeline: not an object`);
        return { valid: false, data: null, issues };
    }

    const obj = data as Record<string, unknown>;

    // Required: shots (array)
    if (!Array.isArray(obj.shots)) {
        issues.push({
            field: 'shots',
            message: 'Timeline.shots must be an array',
            severity: 'error',
            value: obj.shots,
        });
    }

    // Required: transitions (array of strings)
    if (!Array.isArray(obj.transitions)) {
        issues.push({
            field: 'transitions',
            message: 'Timeline.transitions must be an array',
            severity: 'error',
            value: obj.transitions,
        });
    }

    // Required: shotEnhancers (object)
    if (typeof obj.shotEnhancers !== 'object' || obj.shotEnhancers === null) {
        issues.push({
            field: 'shotEnhancers',
            message: 'Timeline.shotEnhancers must be an object',
            severity: 'error',
            value: obj.shotEnhancers,
        });
    }

    // Required: negativePrompt (string)
    if (typeof obj.negativePrompt !== 'string') {
        issues.push({
            field: 'negativePrompt',
            message: 'Timeline.negativePrompt must be a string',
            severity: 'warning', // Can be defaulted
            value: obj.negativePrompt,
        });
    }

    const hasErrors = issues.some(i => i.severity === 'error');

    if (hasErrors) {
        logger.warn(`${prefix}Timeline validation failed`, {
            issues: issues.filter(i => i.severity === 'error').map(i => i.message)
        });
        return { valid: false, data: null, issues };
    }

    // Validate each shot in the array
    const validatedShots: Shot[] = [];
    const shotsArray = obj.shots as unknown[];
    
    for (let i = 0; i < shotsArray.length; i++) {
        const shotResult = validateShot(shotsArray[i], `${prefix}Shot ${i + 1}`);
        if (shotResult.valid && shotResult.data) {
            validatedShots.push(shotResult.data);
        } else {
            // Include shot validation issues
            issues.push(...shotResult.issues.map(issue => ({
                ...issue,
                field: `shots[${i}].${issue.field}`,
            })));
        }
    }

    // Validate transitions are strings
    const validatedTransitions: string[] = [];
    const transitionsArray = obj.transitions as unknown[];
    
    for (let i = 0; i < transitionsArray.length; i++) {
        if (typeof transitionsArray[i] === 'string') {
            validatedTransitions.push(transitionsArray[i] as string);
        } else {
            validatedTransitions.push('Cut'); // Default fallback
            issues.push({
                field: `transitions[${i}]`,
                message: `Transition must be a string, defaulting to 'Cut'`,
                severity: 'warning',
                value: transitionsArray[i],
            });
        }
    }

    const validatedTimeline: TimelineData = {
        shots: validatedShots,
        shotEnhancers: (obj.shotEnhancers as ShotEnhancers) || {},
        transitions: validatedTransitions,
        negativePrompt: typeof obj.negativePrompt === 'string' ? obj.negativePrompt : '',
    };

    if (issues.length > 0) {
        logger.info(`${prefix}Timeline validated with issues`, {
            errorCount: issues.filter(i => i.severity === 'error').length,
            warningCount: issues.filter(i => i.severity === 'warning').length,
        });
    }

    return { valid: true, data: validatedTimeline, issues };
}

// ============================================================================
// Scene Validation
// ============================================================================

/**
 * Validate a Scene object has all required fields.
 * 
 * @param data - Unknown data to validate as Scene
 * @param context - Optional context for logging
 * @returns ValidationResult with validated Scene or null if invalid
 */
export function validateScene(data: unknown, context?: string): ValidationResult<Scene> {
    const issues: ValidationIssue[] = [];
    const prefix = context ? `[${context}] ` : '';

    if (!data || typeof data !== 'object') {
        issues.push({
            field: 'root',
            message: 'Scene must be a non-null object',
            severity: 'error',
        });
        logger.warn(`${prefix}Invalid scene: not an object`);
        return { valid: false, data: null, issues };
    }

    const obj = data as Record<string, unknown>;

    // Required: id (string)
    if (typeof obj.id !== 'string' || obj.id.trim() === '') {
        issues.push({
            field: 'id',
            message: 'Scene.id must be a non-empty string',
            severity: 'error',
            value: obj.id,
        });
    }

    // Required: title (string)
    if (typeof obj.title !== 'string') {
        issues.push({
            field: 'title',
            message: 'Scene.title must be a string',
            severity: 'error',
            value: obj.title,
        });
    }

    // Required: summary (string)
    if (typeof obj.summary !== 'string') {
        issues.push({
            field: 'summary',
            message: 'Scene.summary must be a string',
            severity: 'error',
            value: obj.summary,
        });
    }

    // Required: timeline (object)
    if (!obj.timeline || typeof obj.timeline !== 'object') {
        issues.push({
            field: 'timeline',
            message: 'Scene.timeline must be an object',
            severity: 'error',
            value: obj.timeline,
        });
    }

    const hasErrors = issues.some(i => i.severity === 'error');

    if (hasErrors) {
        logger.warn(`${prefix}Scene validation failed`, {
            issues: issues.filter(i => i.severity === 'error').map(i => i.message)
        });
        return { valid: false, data: null, issues };
    }

    // Validate timeline
    const timelineResult = validateTimeline(obj.timeline, `${prefix}Timeline`);
    if (!timelineResult.valid || !timelineResult.data) {
        issues.push(...timelineResult.issues.map(issue => ({
            ...issue,
            field: `timeline.${issue.field}`,
        })));
        logger.warn(`${prefix}Scene timeline invalid`);
        return { valid: false, data: null, issues };
    }

    // Construct validated scene
    const validatedScene: Scene = {
        id: obj.id as string,
        title: obj.title as string,
        summary: obj.summary as string,
        timeline: timelineResult.data,
        // Optional fields
        generatedPayload: obj.generatedPayload as Scene['generatedPayload'],
        heroArcId: typeof obj.heroArcId === 'string' ? obj.heroArcId : undefined,
        heroArcName: typeof obj.heroArcName === 'string' ? obj.heroArcName : undefined,
        heroArcSummary: typeof obj.heroArcSummary === 'string' ? obj.heroArcSummary : undefined,
        heroArcOrder: typeof obj.heroArcOrder === 'number' ? obj.heroArcOrder : undefined,
        shotPurpose: typeof obj.shotPurpose === 'string' ? obj.shotPurpose : undefined,
        heroMoment: typeof obj.heroMoment === 'boolean' ? obj.heroMoment : undefined,
        keyframeMode: obj.keyframeMode === 'bookend' ? 'bookend' : 'single',
        keyframeStart: typeof obj.keyframeStart === 'string' ? obj.keyframeStart : undefined,
        keyframeEnd: typeof obj.keyframeEnd === 'string' ? obj.keyframeEnd : undefined,
        temporalContext: obj.temporalContext as Scene['temporalContext'],
    };

    if (issues.length > 0) {
        logger.info(`${prefix}Scene validated with warnings`, {
            warningCount: issues.length,
        });
    }

    return { valid: true, data: validatedScene, issues };
}

// ============================================================================
// Batch Validation Helpers
// ============================================================================

/**
 * Validate an array of scenes, filtering out invalid entries.
 * 
 * @param scenes - Array of unknown data to validate
 * @returns Object with valid scenes array and summary of issues
 */
export function validateSceneArray(scenes: unknown[]): {
    validScenes: Scene[];
    invalidCount: number;
    allIssues: ValidationIssue[];
} {
    const validScenes: Scene[] = [];
    const allIssues: ValidationIssue[] = [];
    let invalidCount = 0;

    for (let i = 0; i < scenes.length; i++) {
        const result = validateScene(scenes[i], `Scene ${i + 1}`);
        if (result.valid && result.data) {
            validScenes.push(result.data);
        } else {
            invalidCount++;
        }
        allIssues.push(...result.issues);
    }

    if (invalidCount > 0) {
        logger.warn('Scene array validation completed with invalid entries', {
            total: scenes.length,
            valid: validScenes.length,
            invalid: invalidCount,
        });
    }

    return { validScenes, invalidCount, allIssues };
}

/**
 * Quick check if data is a valid Scene without full validation.
 * Use for guards where detailed error reporting isn't needed.
 */
export function isValidScene(data: unknown): data is Scene {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return (
        typeof obj.id === 'string' &&
        typeof obj.title === 'string' &&
        typeof obj.summary === 'string' &&
        obj.timeline !== null &&
        typeof obj.timeline === 'object'
    );
}

/**
 * Quick check if data is a valid Shot without full validation.
 */
export function isValidShot(data: unknown): data is Shot {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return (
        typeof obj.id === 'string' &&
        typeof obj.description === 'string'
    );
}
