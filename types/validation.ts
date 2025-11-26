/**
 * Unified Validation Result Types
 * 
 * Provides a consistent validation pattern across all validators:
 * - promptValidator
 * - settingsValidation  
 * - comfyUIService workflow validation
 * - coherenceGate
 * - project import/export
 * 
 * All validators should return ValidationResult<T> for unified error handling,
 * aggregated reporting, and suggestion pipelines.
 * 
 * @module types/validation
 */

/**
 * Severity level for validation messages
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Individual validation error with context
 */
export interface ValidationError {
    code: string;
    message: string;
    context?: string;
    field?: string;
    severity: 'error';
    fix?: string;
    helpUrl?: string;
}

/**
 * Individual validation warning
 */
export interface ValidationWarning {
    code: string;
    message: string;
    context?: string;
    field?: string;
    severity: 'warning';
    suggestion?: string;
}

/**
 * Auto-suggestion generated from validation
 */
export interface AutoSuggestion {
    id: string;
    type: 'fix' | 'enhancement' | 'optimization';
    description: string;
    action: string;
    autoApplicable: boolean;
    payload?: Record<string, unknown>;
}

/**
 * Quality score metadata for prompt/generation validation
 */
export interface QualityScore {
    overall: number;  // 0-1
    breakdown?: {
        structuralCompleteness?: number;
        characterReferenceDensity?: number;
        temporalMarkers?: number;
        visualSpecificity?: number;
        narrativeClarity?: number;
    };
    threshold: number;
    passed: boolean;
}

/**
 * Unified validation result type
 * 
 * @template T - Optional data payload type (default: void)
 * 
 * @example
 * // Simple validation
 * const result: ValidationResult = { success: true };
 * 
 * @example
 * // Validation with data
 * const result: ValidationResult<ParsedWorkflow> = {
 *   success: true,
 *   data: { nodes: [...], connections: [...] }
 * };
 * 
 * @example
 * // Failed validation with errors and suggestions
 * const result: ValidationResult = {
 *   success: false,
 *   errors: [{ code: 'MISSING_CLIP', message: '...', severity: 'error' }],
 *   suggestions: [{ id: 's1', type: 'fix', description: '...', action: 'map_node', autoApplicable: true }]
 * };
 */
export interface ValidationResult<T = void> {
    /** Whether validation passed (no errors) */
    success: boolean;
    
    /** Optional data payload when validation succeeds */
    data?: T;
    
    /** Validation errors (prevent operation) */
    errors?: ValidationError[];
    
    /** Validation warnings (allow with caution) */
    warnings?: ValidationWarning[];
    
    /** Auto-generated suggestions for fixing issues */
    suggestions?: AutoSuggestion[];
    
    /** Quality score for prompt/generation validation */
    qualityScore?: QualityScore;
    
    /** Human-readable summary message */
    message?: string;
    
    /** Context identifier for debugging */
    context?: string;
    
    /** Timestamp of validation */
    timestamp?: number;
}

/**
 * Aggregated result from batch validation
 */
export interface BatchValidationResult<T = void> {
    /** All validations passed */
    allValid: boolean;
    
    /** Total error count across all items */
    totalErrors: number;
    
    /** Total warning count across all items */
    totalWarnings: number;
    
    /** Individual validation results */
    results: ValidationResult<T>[];
    
    /** Aggregated suggestions (deduplicated) */
    aggregatedSuggestions?: AutoSuggestion[];
    
    /** Overall quality score (average) */
    averageQualityScore?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a successful validation result
 */
export function validationSuccess<T = void>(data?: T, message?: string): ValidationResult<T> {
    return {
        success: true,
        data,
        message,
        timestamp: Date.now(),
    };
}

/**
 * Create a failed validation result with errors
 * 
 * @template T - Optional data type (usually void for failures, but can include partial data)
 */
export function validationFailure<T = void>(
    errors: ValidationError[],
    options?: {
        warnings?: ValidationWarning[];
        suggestions?: AutoSuggestion[];
        message?: string;
        context?: string;
        data?: T;
    }
): ValidationResult<T> {
    return {
        success: false,
        data: options?.data,
        errors,
        warnings: options?.warnings,
        suggestions: options?.suggestions,
        message: options?.message || errors[0]?.message || 'Validation failed',
        context: options?.context,
        timestamp: Date.now(),
    };
}

/**
 * Create a validation error object
 */
export function createValidationError(
    code: string,
    message: string,
    options?: {
        context?: string;
        field?: string;
        fix?: string;
        helpUrl?: string;
    }
): ValidationError {
    return {
        code,
        message,
        severity: 'error',
        ...options,
    };
}

/**
 * Create a validation warning object
 */
export function createValidationWarning(
    code: string,
    message: string,
    options?: {
        context?: string;
        field?: string;
        suggestion?: string;
    }
): ValidationWarning {
    return {
        code,
        message,
        severity: 'warning',
        ...options,
    };
}

/**
 * Merge multiple validation results into one
 */
export function mergeValidationResults<T = void>(
    results: ValidationResult<T>[]
): ValidationResult<T[]> {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    const allSuggestions: AutoSuggestion[] = [];
    const allData: T[] = [];

    for (const result of results) {
        if (result.errors) allErrors.push(...result.errors);
        if (result.warnings) allWarnings.push(...result.warnings);
        if (result.suggestions) allSuggestions.push(...result.suggestions);
        if (result.data !== undefined) allData.push(result.data);
    }

    // Deduplicate suggestions by id
    const uniqueSuggestions = allSuggestions.filter(
        (s, i, arr) => arr.findIndex(x => x.id === s.id) === i
    );

    return {
        success: allErrors.length === 0,
        data: allData.length > 0 ? allData : undefined,
        errors: allErrors.length > 0 ? allErrors : undefined,
        warnings: allWarnings.length > 0 ? allWarnings : undefined,
        suggestions: uniqueSuggestions.length > 0 ? uniqueSuggestions : undefined,
        timestamp: Date.now(),
    };
}

/**
 * Convert legacy validation result to unified format
 * 
 * Bridges existing validators (promptValidator, settingsValidation) to new pattern
 */
export function fromLegacyValidation(legacy: {
    valid?: boolean;
    isValid?: boolean;
    message?: string;
    errors?: string[];
    warnings?: string[];
    issues?: string[];
    fixes?: string[];
    helpUrl?: string;
    context?: string;
}): ValidationResult {
    const isValid = legacy.valid ?? legacy.isValid ?? true;
    
    const errors: ValidationError[] = [
        ...(legacy.errors || []).map((msg, i) => createValidationError(`ERR_${i}`, msg)),
        ...(legacy.issues || []).map((msg, i) => createValidationError(`ISSUE_${i}`, msg)),
    ];

    const warnings: ValidationWarning[] = (legacy.warnings || []).map((msg, i) =>
        createValidationWarning(`WARN_${i}`, msg)
    );

    const suggestions: AutoSuggestion[] = (legacy.fixes || []).map((fix, i) => ({
        id: `fix_${i}`,
        type: 'fix' as const,
        description: fix,
        action: 'manual',
        autoApplicable: false,
    }));

    if (isValid) {
        return validationSuccess(undefined, legacy.message);
    }

    return validationFailure(errors, {
        warnings,
        suggestions,
        message: legacy.message,
        context: legacy.context,
    });
}

// ============================================================================
// Validation Error Codes
// ============================================================================

/**
 * Standard validation error codes for consistent handling
 */
export const ValidationErrorCodes = {
    // Prompt validation
    PROMPT_MISSING_SINGLE_FRAME: 'PROMPT_MISSING_SINGLE_FRAME',
    PROMPT_MISSING_ASPECT_RATIO: 'PROMPT_MISSING_ASPECT_RATIO',
    PROMPT_MISSING_NEGATIVE_TERMS: 'PROMPT_MISSING_NEGATIVE_TERMS',
    PROMPT_TOO_SHORT: 'PROMPT_TOO_SHORT',
    PROMPT_TOO_LONG: 'PROMPT_TOO_LONG',
    PROMPT_DUPLICATE_PHRASES: 'PROMPT_DUPLICATE_PHRASES',
    PROMPT_LOW_QUALITY_SCORE: 'PROMPT_LOW_QUALITY_SCORE',
    
    // Workflow validation
    WORKFLOW_MISSING_JSON: 'WORKFLOW_MISSING_JSON',
    WORKFLOW_INVALID_JSON: 'WORKFLOW_INVALID_JSON',
    WORKFLOW_MISSING_CLIP_MAPPING: 'WORKFLOW_MISSING_CLIP_MAPPING',
    WORKFLOW_MISSING_KEYFRAME_MAPPING: 'WORKFLOW_MISSING_KEYFRAME_MAPPING',
    WORKFLOW_PROFILE_NOT_FOUND: 'WORKFLOW_PROFILE_NOT_FOUND',
    WORKFLOW_NODE_NOT_FOUND: 'WORKFLOW_NODE_NOT_FOUND',
    
    // Provider validation
    PROVIDER_CONNECTION_FAILED: 'PROVIDER_CONNECTION_FAILED',
    PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
    PROVIDER_NO_GPU: 'PROVIDER_NO_GPU',
    PROVIDER_UNHEALTHY: 'PROVIDER_UNHEALTHY',
    
    // Continuity validation
    CONTINUITY_BELOW_THRESHOLD: 'CONTINUITY_BELOW_THRESHOLD',
    CONTINUITY_MISSING_DATA: 'CONTINUITY_MISSING_DATA',
    CONTINUITY_CHARACTER_GAP: 'CONTINUITY_CHARACTER_GAP',
    
    // Project validation
    PROJECT_INVALID_VERSION: 'PROJECT_INVALID_VERSION',
    PROJECT_MISSING_REQUIRED_FIELD: 'PROJECT_MISSING_REQUIRED_FIELD',
    PROJECT_CORRUPTED_DATA: 'PROJECT_CORRUPTED_DATA',
    PROJECT_MISSING_WORKFLOW_PROFILE: 'PROJECT_MISSING_WORKFLOW_PROFILE',
} as const;

export type ValidationErrorCode = typeof ValidationErrorCodes[keyof typeof ValidationErrorCodes];
