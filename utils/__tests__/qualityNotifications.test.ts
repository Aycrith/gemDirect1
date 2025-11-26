/**
 * Quality Notifications Unit Tests
 * 
 * Tests for toast notification utilities including:
 * - Validation result notifications
 * - Quality threshold notifications
 * - Coherence gate notifications
 * - Rate limiting
 * 
 * @module utils/__tests__/qualityNotifications.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    notifyValidationResult,
    notifyQualityThreshold,
    notifyCoherenceGate,
    notifyStageEnter,
    notifyStageGateBlocked,
    notifyStageComplete,
    notifyProviderHealth,
    notifyProviderFallback,
    notifyGenerationStart,
    notifyGenerationComplete,
    notifyGenerationFailed,
    createRateLimitedToast,
    AddToastFn,
} from '../qualityNotifications';
import { ValidationResult, validationSuccess, validationFailure, createValidationError } from '../../types/validation';
import { CoherenceCheckResult } from '../coherenceGate';

describe('qualityNotifications', () => {
    let mockAddToast: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockAddToast = vi.fn();
    });

    describe('notifyValidationResult', () => {
        it('should show success toast for passed validation', () => {
            const result: ValidationResult = validationSuccess(undefined, 'All checks passed');
            
            notifyValidationResult(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('All checks passed'),
                'success'
            );
        });

        it('should include quality score in success message', () => {
            const result: ValidationResult = {
                success: true,
                message: 'Passed',
                qualityScore: {
                    overall: 0.85,
                    threshold: 0.7,
                    passed: true,
                },
            };
            
            notifyValidationResult(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('85%'),
                'success'
            );
        });

        it('should show error toast for failed validation', () => {
            const result: ValidationResult = validationFailure([
                createValidationError('TEST_ERROR', 'Something went wrong')
            ]);
            
            notifyValidationResult(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Something went wrong'),
                'error'
            );
        });

        it('should show error count for multiple errors', () => {
            const result: ValidationResult = validationFailure([
                createValidationError('ERR_1', 'Error 1'),
                createValidationError('ERR_2', 'Error 2'),
                createValidationError('ERR_3', 'Error 3'),
            ]);
            
            notifyValidationResult(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('3 errors'),
                'error'
            );
        });

        it('should include suggestions when available', () => {
            const result: ValidationResult = validationFailure(
                [createValidationError('ERR', 'Error')],
                {
                    suggestions: [
                        { id: 's1', type: 'fix', description: 'Try restarting', action: 'restart', autoApplicable: false },
                    ],
                }
            );
            
            notifyValidationResult(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Try restarting'),
                'error'
            );
        });

        it('should respect maxSuggestions option', () => {
            const result: ValidationResult = validationFailure(
                [createValidationError('ERR', 'Error')],
                {
                    suggestions: [
                        { id: 's1', type: 'fix', description: 'Fix 1', action: 'a', autoApplicable: false },
                        { id: 's2', type: 'fix', description: 'Fix 2', action: 'b', autoApplicable: false },
                        { id: 's3', type: 'fix', description: 'Fix 3', action: 'c', autoApplicable: false },
                    ],
                }
            );
            
            notifyValidationResult(mockAddToast, result, { maxSuggestions: 1 });
            
            const callArg = mockAddToast.mock.calls[0][0];
            expect(callArg).toContain('Fix 1');
            expect(callArg).not.toContain('Fix 3');
        });

        it('should include context prefix when provided', () => {
            const result: ValidationResult = validationSuccess(undefined, 'Passed');
            
            notifyValidationResult(mockAddToast, result, { context: 'Scene 1' });
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('[Scene 1]'),
                'success'
            );
        });
    });

    describe('notifyQualityThreshold', () => {
        it('should show success for passed quality check', () => {
            const score = { overall: 0.85, threshold: 0.7, passed: true };
            
            notifyQualityThreshold(mockAddToast, score);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('85%'),
                'success'
            );
        });

        it('should show warning for failed quality check', () => {
            const score = { overall: 0.55, threshold: 0.7, passed: false };
            
            notifyQualityThreshold(mockAddToast, score);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('55%'),
                'warning'
            );
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('70%'),
                'warning'
            );
        });

        it('should show breakdown details when requested', () => {
            const score = {
                overall: 0.8,
                threshold: 0.7,
                passed: true,
                breakdown: {
                    structuralCompleteness: 0.9,
                    visualSpecificity: 0.7,
                },
            };
            
            notifyQualityThreshold(mockAddToast, score, { showScoreDetails: true });
            
            const callArg = mockAddToast.mock.calls[0][0];
            expect(callArg).toContain('90%');
        });
    });

    describe('notifyCoherenceGate', () => {
        it('should show success for passed coherence gate', () => {
            const result: CoherenceCheckResult = {
                passed: true,
                score: 0.82,
                threshold: 0.7,
                factors: {},
            };
            
            notifyCoherenceGate(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('82%'),
                'success'
            );
        });

        it('should show warning with suggestions for failed gate', () => {
            const result: CoherenceCheckResult = {
                passed: false,
                score: 0.55,
                threshold: 0.7,
                factors: {},
                suggestions: [
                    { id: 's1', type: 'fix', description: 'Add more detail', action: 'enhance', autoApplicable: false },
                ],
            };
            
            notifyCoherenceGate(mockAddToast, result);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('55%'),
                'warning'
            );
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Add more detail'),
                'warning'
            );
        });
    });

    describe('notifyStageEnter', () => {
        it('should show error when prerequisites not met', () => {
            notifyStageEnter(mockAddToast, 'Generation', false);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('prerequisites not met'),
                'error'
            );
        });

        it('should not show toast when prerequisites are met', () => {
            notifyStageEnter(mockAddToast, 'Generation', true);
            
            expect(mockAddToast).not.toHaveBeenCalled();
        });
    });

    describe('notifyStageGateBlocked', () => {
        it('should show warning with reason', () => {
            notifyStageGateBlocked(
                mockAddToast,
                'Keyframe',
                'Video',
                'No keyframe generated'
            );
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Video'),
                'warning'
            );
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('No keyframe generated'),
                'warning'
            );
        });
    });

    describe('notifyStageComplete', () => {
        it('should show success message', () => {
            notifyStageComplete(mockAddToast, 'Keyframe Generation');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('complete'),
                'success'
            );
        });

        it('should include next stage when provided', () => {
            notifyStageComplete(mockAddToast, 'Keyframe', 'Video Generation');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Video Generation'),
                'success'
            );
        });
    });

    describe('notifyProviderHealth', () => {
        it('should show success for healthy provider', () => {
            notifyProviderHealth(mockAddToast, 'ComfyUI', true);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('ready'),
                'success'
            );
        });

        it('should show error for unhealthy provider', () => {
            notifyProviderHealth(mockAddToast, 'ComfyUI', false, 'Connection refused');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('unavailable'),
                'error'
            );
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Connection refused'),
                'error'
            );
        });
    });

    describe('notifyProviderFallback', () => {
        it('should show info message for fallback', () => {
            notifyProviderFallback(mockAddToast, 'ComfyUI-local', 'FastVideo');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('ComfyUI-local'),
                'info'
            );
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('FastVideo'),
                'info'
            );
        });
    });

    describe('notifyGenerationStart', () => {
        it('should show info message', () => {
            notifyGenerationStart(mockAddToast, 'keyframe');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Generating keyframe'),
                'info'
            );
        });

        it('should include item name when provided', () => {
            notifyGenerationStart(mockAddToast, 'video', 'Scene 1');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Scene 1'),
                'info'
            );
        });
    });

    describe('notifyGenerationComplete', () => {
        it('should show success message', () => {
            notifyGenerationComplete(mockAddToast, 'Video');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('successfully'),
                'success'
            );
        });

        it('should include quality score when provided', () => {
            notifyGenerationComplete(mockAddToast, 'Video', 0.92);
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('92%'),
                'success'
            );
        });

        it('should include item name when provided', () => {
            notifyGenerationComplete(mockAddToast, 'Keyframe', undefined, 'Opening Shot');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Opening Shot'),
                'success'
            );
        });
    });

    describe('notifyGenerationFailed', () => {
        it('should show error message with details', () => {
            notifyGenerationFailed(mockAddToast, 'video', 'GPU out of memory');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Failed'),
                'error'
            );
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('GPU out of memory'),
                'error'
            );
        });

        it('should include item name when provided', () => {
            notifyGenerationFailed(mockAddToast, 'keyframe', 'Timeout', 'Scene 3');
            
            expect(mockAddToast).toHaveBeenCalledWith(
                expect.stringContaining('Scene 3'),
                'error'
            );
        });
    });

    describe('createRateLimitedToast', () => {
        it('should allow immediate first toast', () => {
            const rateLimited = createRateLimitedToast(mockAddToast, 1000);
            
            rateLimited('Message 1', 'info');
            
            expect(mockAddToast).toHaveBeenCalledTimes(1);
        });

        it('should queue rapid consecutive toasts', async () => {
            vi.useFakeTimers();
            const rateLimited = createRateLimitedToast(mockAddToast, 100);
            
            rateLimited('Message 1', 'info');
            rateLimited('Message 2', 'info');
            rateLimited('Message 3', 'info');
            
            // First should be immediate
            expect(mockAddToast).toHaveBeenCalledTimes(1);
            
            // Advance timers to process queued toasts (each queued toast schedules its own setTimeout)
            await vi.advanceTimersByTimeAsync(200);
            
            // After 200ms both queued toasts should have fired (each had 100ms timeout)
            expect(mockAddToast).toHaveBeenCalledTimes(3);
            
            vi.useRealTimers();
        });

        it('should use default interval of 1000ms', () => {
            const rateLimited = createRateLimitedToast(mockAddToast);
            
            // Should not throw
            rateLimited('Test', 'info');
            expect(mockAddToast).toHaveBeenCalled();
        });
    });
});
