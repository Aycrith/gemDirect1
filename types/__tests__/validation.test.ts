/**
 * Validation Types Unit Tests
 * 
 * Tests for unified validation types and helper functions including:
 * - ValidationResult creation
 * - Error/Warning creation
 * - Result merging
 * - Legacy validation conversion
 * 
 * @module types/__tests__/validation.test
 */

import { describe, it, expect } from 'vitest';
import {
    ValidationResult,
    ValidationError,
    ValidationWarning,
    AutoSuggestion,
    QualityScore,
    BatchValidationResult,
    validationSuccess,
    validationFailure,
    createValidationError,
    createValidationWarning,
    mergeValidationResults,
    fromLegacyValidation,
    ValidationErrorCodes,
} from '../validation';

describe('validation types', () => {
    describe('validationSuccess', () => {
        it('should create success result without data', () => {
            const result = validationSuccess();
            
            expect(result.success).toBe(true);
            expect(result.data).toBeUndefined();
            expect(result.errors).toBeUndefined();
            expect(result.timestamp).toBeDefined();
        });

        it('should create success result with data', () => {
            const result = validationSuccess({ foo: 'bar' });
            
            expect(result.success).toBe(true);
            expect(result.data).toEqual({ foo: 'bar' });
        });

        it('should create success result with message', () => {
            const result = validationSuccess(undefined, 'All good!');
            
            expect(result.message).toBe('All good!');
        });

        it('should include timestamp', () => {
            const before = Date.now();
            const result = validationSuccess();
            const after = Date.now();
            
            expect(result.timestamp).toBeGreaterThanOrEqual(before);
            expect(result.timestamp).toBeLessThanOrEqual(after);
        });
    });

    describe('validationFailure', () => {
        it('should create failure result with errors', () => {
            const errors = [
                createValidationError('ERR_1', 'Error 1'),
                createValidationError('ERR_2', 'Error 2'),
            ];
            const result = validationFailure(errors);
            
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(2);
            expect(result.errors![0].code).toBe('ERR_1');
        });

        it('should use first error message as default message', () => {
            const errors = [createValidationError('ERR', 'First error')];
            const result = validationFailure(errors);
            
            expect(result.message).toBe('First error');
        });

        it('should accept custom message', () => {
            const errors = [createValidationError('ERR', 'Error')];
            const result = validationFailure(errors, { message: 'Custom message' });
            
            expect(result.message).toBe('Custom message');
        });

        it('should accept warnings', () => {
            const errors = [createValidationError('ERR', 'Error')];
            const warnings = [createValidationWarning('WARN', 'Warning')];
            const result = validationFailure(errors, { warnings });
            
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings![0].code).toBe('WARN');
        });

        it('should accept suggestions', () => {
            const errors = [createValidationError('ERR', 'Error')];
            const suggestions: AutoSuggestion[] = [
                { id: 's1', type: 'fix', description: 'Fix it', action: 'fix', autoApplicable: true },
            ];
            const result = validationFailure(errors, { suggestions });
            
            expect(result.suggestions).toHaveLength(1);
            expect(result.suggestions![0].id).toBe('s1');
        });

        it('should accept context', () => {
            const errors = [createValidationError('ERR', 'Error')];
            const result = validationFailure(errors, { context: 'validation-test' });
            
            expect(result.context).toBe('validation-test');
        });

        it('should accept partial data', () => {
            const errors = [createValidationError('ERR', 'Error')];
            const result = validationFailure<{ partial: boolean }>(errors, { 
                data: { partial: true } 
            });
            
            expect(result.data).toEqual({ partial: true });
        });
    });

    describe('createValidationError', () => {
        it('should create error with required fields', () => {
            const error = createValidationError('TEST_ERROR', 'Test error message');
            
            expect(error.code).toBe('TEST_ERROR');
            expect(error.message).toBe('Test error message');
            expect(error.severity).toBe('error');
        });

        it('should include optional context', () => {
            const error = createValidationError('ERR', 'Msg', { context: 'scene-1' });
            expect(error.context).toBe('scene-1');
        });

        it('should include optional field', () => {
            const error = createValidationError('ERR', 'Msg', { field: 'title' });
            expect(error.field).toBe('title');
        });

        it('should include optional fix', () => {
            const error = createValidationError('ERR', 'Msg', { fix: 'Try this' });
            expect(error.fix).toBe('Try this');
        });

        it('should include optional helpUrl', () => {
            const error = createValidationError('ERR', 'Msg', { helpUrl: 'https://docs.example.com' });
            expect(error.helpUrl).toBe('https://docs.example.com');
        });
    });

    describe('createValidationWarning', () => {
        it('should create warning with required fields', () => {
            const warning = createValidationWarning('TEST_WARN', 'Test warning');
            
            expect(warning.code).toBe('TEST_WARN');
            expect(warning.message).toBe('Test warning');
            expect(warning.severity).toBe('warning');
        });

        it('should include optional suggestion', () => {
            const warning = createValidationWarning('WARN', 'Msg', { suggestion: 'Consider this' });
            expect(warning.suggestion).toBe('Consider this');
        });
    });

    describe('mergeValidationResults', () => {
        it('should return success when all results pass', () => {
            const results: ValidationResult<string>[] = [
                validationSuccess('a'),
                validationSuccess('b'),
            ];
            
            const merged = mergeValidationResults(results);
            
            expect(merged.success).toBe(true);
            expect(merged.data).toEqual(['a', 'b']);
        });

        it('should return failure when any result fails', () => {
            const results: ValidationResult<string>[] = [
                validationSuccess('a'),
                validationFailure([createValidationError('ERR', 'Error')]),
            ];
            
            const merged = mergeValidationResults(results);
            
            expect(merged.success).toBe(false);
        });

        it('should aggregate all errors', () => {
            const results: ValidationResult[] = [
                validationFailure([createValidationError('ERR_1', 'Error 1')]),
                validationFailure([createValidationError('ERR_2', 'Error 2')]),
            ];
            
            const merged = mergeValidationResults(results);
            
            expect(merged.errors).toHaveLength(2);
        });

        it('should aggregate all warnings', () => {
            const results: ValidationResult[] = [
                validationFailure([createValidationError('ERR', 'Error')], {
                    warnings: [createValidationWarning('WARN_1', 'Warning 1')],
                }),
                validationSuccess(undefined),
            ];
            // Add warnings to success result manually
            results[1].warnings = [createValidationWarning('WARN_2', 'Warning 2')];
            
            const merged = mergeValidationResults(results);
            
            expect(merged.warnings).toHaveLength(2);
        });

        it('should deduplicate suggestions by id', () => {
            const suggestion: AutoSuggestion = {
                id: 'same-id',
                type: 'fix',
                description: 'Fix',
                action: 'fix',
                autoApplicable: true,
            };
            
            const results: ValidationResult[] = [
                { success: false, errors: [], suggestions: [suggestion] },
                { success: false, errors: [], suggestions: [suggestion] },
            ];
            
            const merged = mergeValidationResults(results);
            
            expect(merged.suggestions).toHaveLength(1);
        });

        it('should handle empty results array', () => {
            const merged = mergeValidationResults([]);
            
            expect(merged.success).toBe(true);
            expect(merged.data).toBeUndefined();
        });
    });

    describe('fromLegacyValidation', () => {
        it('should convert valid=true to success', () => {
            const result = fromLegacyValidation({ valid: true });
            expect(result.success).toBe(true);
        });

        it('should convert isValid=true to success', () => {
            const result = fromLegacyValidation({ isValid: true });
            expect(result.success).toBe(true);
        });

        it('should convert valid=false to failure', () => {
            const result = fromLegacyValidation({ valid: false, errors: ['Error'] });
            expect(result.success).toBe(false);
        });

        it('should convert errors array', () => {
            const result = fromLegacyValidation({ 
                valid: false, 
                errors: ['Error 1', 'Error 2'] 
            });
            
            expect(result.errors).toHaveLength(2);
            expect(result.errors![0].message).toBe('Error 1');
        });

        it('should convert issues array', () => {
            const result = fromLegacyValidation({ 
                valid: false, 
                issues: ['Issue 1'] 
            });
            
            expect(result.errors).toHaveLength(1);
            expect(result.errors![0].message).toBe('Issue 1');
        });

        it('should convert warnings array', () => {
            const result = fromLegacyValidation({ 
                valid: false, 
                errors: ['Error'],
                warnings: ['Warning 1'] 
            });
            
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings![0].message).toBe('Warning 1');
        });

        it('should convert fixes to suggestions', () => {
            const result = fromLegacyValidation({ 
                valid: false, 
                errors: ['Error'],
                fixes: ['Try restarting', 'Check config'] 
            });
            
            expect(result.suggestions).toHaveLength(2);
            expect(result.suggestions![0].type).toBe('fix');
            expect(result.suggestions![0].description).toBe('Try restarting');
        });

        it('should preserve message', () => {
            const result = fromLegacyValidation({ 
                valid: true, 
                message: 'All checks passed' 
            });
            
            expect(result.message).toBe('All checks passed');
        });

        it('should preserve context', () => {
            const result = fromLegacyValidation({ 
                valid: false, 
                errors: ['Error'],
                context: 'workflow-validation' 
            });
            
            expect(result.context).toBe('workflow-validation');
        });

        it('should default to valid when no valid/isValid provided', () => {
            const result = fromLegacyValidation({});
            expect(result.success).toBe(true);
        });
    });

    describe('ValidationErrorCodes', () => {
        it('should have prompt validation codes', () => {
            expect(ValidationErrorCodes.PROMPT_MISSING_SINGLE_FRAME).toBeDefined();
            expect(ValidationErrorCodes.PROMPT_TOO_SHORT).toBeDefined();
            expect(ValidationErrorCodes.PROMPT_LOW_QUALITY_SCORE).toBeDefined();
        });

        it('should have workflow validation codes', () => {
            expect(ValidationErrorCodes.WORKFLOW_MISSING_JSON).toBeDefined();
            expect(ValidationErrorCodes.WORKFLOW_MISSING_CLIP_MAPPING).toBeDefined();
            expect(ValidationErrorCodes.WORKFLOW_PROFILE_NOT_FOUND).toBeDefined();
        });

        it('should have provider validation codes', () => {
            expect(ValidationErrorCodes.PROVIDER_CONNECTION_FAILED).toBeDefined();
            expect(ValidationErrorCodes.PROVIDER_TIMEOUT).toBeDefined();
            expect(ValidationErrorCodes.PROVIDER_UNHEALTHY).toBeDefined();
        });

        it('should have continuity validation codes', () => {
            expect(ValidationErrorCodes.CONTINUITY_BELOW_THRESHOLD).toBeDefined();
            expect(ValidationErrorCodes.CONTINUITY_CHARACTER_GAP).toBeDefined();
        });

        it('should have project validation codes', () => {
            expect(ValidationErrorCodes.PROJECT_INVALID_VERSION).toBeDefined();
            expect(ValidationErrorCodes.PROJECT_CORRUPTED_DATA).toBeDefined();
        });

        it('should have unique code values', () => {
            const codes = Object.values(ValidationErrorCodes);
            const uniqueCodes = new Set(codes);
            expect(uniqueCodes.size).toBe(codes.length);
        });
    });

    describe('QualityScore interface', () => {
        it('should support basic quality score', () => {
            const score: QualityScore = {
                overall: 0.85,
                threshold: 0.7,
                passed: true,
            };
            
            expect(score.overall).toBe(0.85);
            expect(score.passed).toBe(true);
        });

        it('should support breakdown', () => {
            const score: QualityScore = {
                overall: 0.75,
                threshold: 0.7,
                passed: true,
                breakdown: {
                    structuralCompleteness: 0.9,
                    characterReferenceDensity: 0.6,
                    temporalMarkers: 0.8,
                    visualSpecificity: 0.7,
                    narrativeClarity: 0.75,
                },
            };
            
            expect(score.breakdown?.structuralCompleteness).toBe(0.9);
        });
    });

    describe('BatchValidationResult interface', () => {
        it('should aggregate validation results', () => {
            const batch: BatchValidationResult<string> = {
                allValid: false,
                totalErrors: 3,
                totalWarnings: 1,
                results: [
                    validationSuccess('a'),
                    validationFailure([createValidationError('ERR', 'Error')]),
                ],
            };
            
            expect(batch.allValid).toBe(false);
            expect(batch.totalErrors).toBe(3);
        });

        it('should support average quality score', () => {
            const batch: BatchValidationResult = {
                allValid: true,
                totalErrors: 0,
                totalWarnings: 0,
                results: [],
                averageQualityScore: 0.82,
            };
            
            expect(batch.averageQualityScore).toBe(0.82);
        });
    });
});
