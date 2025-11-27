/**
 * Tests for pipelineErrors
 * Validates error classification, recovery types, and flag-gated handling
 */

import { describe, it, expect } from 'vitest';
import {
    PipelineError,
    classifyError,
    getRecoveryType,
    toPipelineError,
    handleTokenOverflow,
    handleValidationError,
    getUserFriendlyMessage,
    getRecoveryInstructions,
} from '../pipelineErrors';
import { FeatureFlags } from '../featureFlags';

describe('pipelineErrors', () => {
    describe('PipelineError', () => {
        it('should create error with all properties', () => {
            const error = new PipelineError(
                'Token limit exceeded',
                'token_overflow',
                'user_action',
                { tokens: 700, budget: 600 }
            );
            
            expect(error.message).toBe('Token limit exceeded');
            expect(error.category).toBe('token_overflow');
            expect(error.recovery).toBe('user_action');
            expect(error.details?.tokens).toBe(700);
            expect(error.timestamp).toBeGreaterThan(0);
        });

        it('should correctly identify retryable errors', () => {
            const retryable = new PipelineError('Timeout', 'api_timeout', 'retry');
            const userAction = new PipelineError('Too long', 'token_overflow', 'user_action');
            const fatal = new PipelineError('Quota exhausted', 'api_quota', 'fatal');
            
            expect(retryable.isRetryable).toBe(true);
            expect(userAction.isRetryable).toBe(false);
            expect(fatal.isRetryable).toBe(false);
        });

        it('should correctly identify fatal errors', () => {
            const fatal = new PipelineError('Quota exhausted', 'api_quota', 'fatal');
            const nonFatal = new PipelineError('Timeout', 'api_timeout', 'retry');
            
            expect(fatal.isFatal).toBe(true);
            expect(nonFatal.isFatal).toBe(false);
        });

        it('should serialize to JSON', () => {
            const error = new PipelineError('Test', 'unknown', 'user_action', { foo: 'bar' });
            const json = error.toJSON();
            
            expect(json.name).toBe('PipelineError');
            expect(json.message).toBe('Test');
            expect(json.category).toBe('unknown');
            expect(json.details).toEqual({ foo: 'bar' });
        });
    });

    describe('classifyError', () => {
        it('should classify token overflow errors', () => {
            expect(classifyError('Token budget exceeded: 700/600')).toBe('token_overflow');
            expect(classifyError('Prompt tokens overflow detected')).toBe('token_overflow');
        });

        it('should classify rate limit errors', () => {
            expect(classifyError('Error 429: Rate limit exceeded')).toBe('api_rate_limit');
            expect(classifyError('Too many requests, please slow down')).toBe('api_rate_limit');
        });

        it('should classify quota errors', () => {
            expect(classifyError('API quota exhausted')).toBe('api_quota');
            expect(classifyError('RESOURCE_EXHAUSTED: Quota exceeded')).toBe('api_quota');
        });

        it('should classify timeout errors', () => {
            expect(classifyError('Request timed out after 30s')).toBe('api_timeout');
            expect(classifyError('ETIMEDOUT: Connection timeout')).toBe('api_timeout');
        });

        it('should classify service unavailable errors', () => {
            expect(classifyError('Error 503: Service unavailable')).toBe('api_unavailable');
            expect(classifyError('ECONNREFUSED: Connection refused')).toBe('api_unavailable');
        });

        it('should classify validation errors', () => {
            expect(classifyError('Scene validation failed')).toBe('validation_failed');
        });

        it('should classify workflow errors', () => {
            expect(classifyError('Workflow JSON is invalid')).toBe('workflow_invalid');
            expect(classifyError('Required mapping missing for LoadImage')).toBe('mapping_missing');
        });

        it('should classify upload errors', () => {
            expect(classifyError('Failed to upload image')).toBe('image_upload_failed');
        });

        it('should classify content filter errors', () => {
            expect(classifyError('Content blocked by safety filter')).toBe('generation_blocked');
        });

        it('should return unknown for unrecognized errors', () => {
            expect(classifyError('Something weird happened')).toBe('unknown');
        });
    });

    describe('getRecoveryType', () => {
        it('should return retry for transient errors', () => {
            expect(getRecoveryType('api_timeout')).toBe('retry');
            expect(getRecoveryType('api_rate_limit')).toBe('retry');
            expect(getRecoveryType('api_unavailable')).toBe('retry');
        });

        it('should return user_action for fixable errors', () => {
            expect(getRecoveryType('token_overflow')).toBe('user_action');
            expect(getRecoveryType('validation_failed')).toBe('user_action');
            expect(getRecoveryType('workflow_invalid')).toBe('user_action');
        });

        it('should return fatal for unrecoverable errors', () => {
            expect(getRecoveryType('api_quota')).toBe('fatal');
        });
    });

    describe('toPipelineError', () => {
        it('should convert Error to PipelineError', () => {
            const original = new Error('Rate limit exceeded (429)');
            const pipelineError = toPipelineError(original);
            
            expect(pipelineError).toBeInstanceOf(PipelineError);
            expect(pipelineError.category).toBe('api_rate_limit');
            expect(pipelineError.recovery).toBe('retry');
        });

        it('should convert string to PipelineError', () => {
            const pipelineError = toPipelineError('Token overflow detected');
            
            expect(pipelineError.category).toBe('token_overflow');
        });

        it('should include additional details', () => {
            const pipelineError = toPipelineError('Error', { sceneId: 'scene-1' });
            
            expect(pipelineError.details?.sceneId).toBe('scene-1');
        });
    });

    describe('handleTokenOverflow', () => {
        it('should continue when guard is off', () => {
            const flags: Partial<FeatureFlags> = { promptTokenGuard: 'off' };
            const result = handleTokenOverflow(700, 600, flags);
            
            expect(result.shouldContinue).toBe(true);
            expect(result.wasWarning).toBe(false);
        });

        it('should warn and continue when guard is warn', () => {
            const flags: Partial<FeatureFlags> = { promptTokenGuard: 'warn' };
            const result = handleTokenOverflow(700, 600, flags);
            
            expect(result.shouldContinue).toBe(true);
            expect(result.wasWarning).toBe(true);
            expect(result.error).toBeDefined();
            expect(result.userMessage).toContain('Warning');
        });

        it('should block when guard is block', () => {
            const flags: Partial<FeatureFlags> = { promptTokenGuard: 'block' };
            const result = handleTokenOverflow(700, 600, flags);
            
            expect(result.shouldContinue).toBe(false);
            expect(result.wasWarning).toBe(false);
            expect(result.error?.category).toBe('token_overflow');
            expect(result.userMessage).toContain('blocked');
        });
    });

    describe('handleValidationError', () => {
        it('should continue when validation mode is off', () => {
            const flags: Partial<FeatureFlags> = { sceneListValidationMode: 'off' };
            const result = handleValidationError(['Scene too complex'], flags);
            
            expect(result.shouldContinue).toBe(true);
        });

        it('should warn when validation mode is warn', () => {
            const flags: Partial<FeatureFlags> = { sceneListValidationMode: 'warn' };
            const result = handleValidationError(['Scene too complex'], flags);
            
            expect(result.shouldContinue).toBe(true);
            expect(result.wasWarning).toBe(true);
        });

        it('should block when validation mode is block', () => {
            const flags: Partial<FeatureFlags> = { sceneListValidationMode: 'block' };
            const result = handleValidationError(['Scene too complex', 'Too many verbs'], flags);
            
            expect(result.shouldContinue).toBe(false);
            expect(result.userMessage).toContain('blocked');
        });
    });

    describe('getUserFriendlyMessage', () => {
        it('should return helpful messages for each category', () => {
            expect(getUserFriendlyMessage('token_overflow')).toContain('too long');
            expect(getUserFriendlyMessage('api_rate_limit')).toContain('wait');
            expect(getUserFriendlyMessage('api_quota')).toContain('quota');
            expect(getUserFriendlyMessage('workflow_invalid')).toContain('workflow');
        });

        it('should have a default message for unknown', () => {
            expect(getUserFriendlyMessage('unknown')).toContain('unexpected');
        });
    });

    describe('getRecoveryInstructions', () => {
        it('should return actionable instructions', () => {
            const tokenInstructions = getRecoveryInstructions('token_overflow');
            expect(tokenInstructions.length).toBeGreaterThan(0);
            expect(tokenInstructions.some(i => i.includes('shorten') || i.includes('Shorten'))).toBe(true);
        });

        it('should return instructions for all categories', () => {
            const categories = [
                'token_overflow', 'validation_failed', 'api_rate_limit',
                'api_quota', 'workflow_invalid', 'generation_blocked', 'unknown'
            ] as const;
            
            for (const category of categories) {
                const instructions = getRecoveryInstructions(category);
                expect(instructions.length).toBeGreaterThan(0);
            }
        });
    });
});
