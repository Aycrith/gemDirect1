/**
 * Tests for Prompt Scheduling Service (Phase 5 - Temporal Coherence Enhancement)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    isPromptSchedulingEnabled,
    getScheduleConfig,
    createTransitionSchedule,
    createBookendSchedule,
    createConstantSchedule,
    toComfyUIScheduleFormat,
    formatAsScheduledPrompt,
    calculateEasedWeight,
    getWeightsAtFrame,
    validateSchedule,
    DEFAULT_SCHEDULE_CONFIG,
    type PromptScheduleConfig,
    type PromptSchedule,
} from '../promptSchedulingService';
import type { LocalGenerationSettings } from '../../types';
import { DEFAULT_FEATURE_FLAGS } from '../../utils/featureFlags';

// Mock console to avoid noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});

// Helper to create test settings
function createTestSettings(overrides: Partial<LocalGenerationSettings> = {}): LocalGenerationSettings {
    return {
        comfyUIUrl: 'http://localhost:8188',
        comfyUIClientId: 'test-client',
        workflowJson: '{}',
        mapping: {},
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
        ...overrides,
    };
}

describe('Prompt Scheduling Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isPromptSchedulingEnabled', () => {
        it('should return false when scheduling is disabled (default)', () => {
            const settings = createTestSettings();
            expect(isPromptSchedulingEnabled(settings)).toBe(false);
        });

        it('should return true when scheduling is enabled', () => {
            const settings = createTestSettings({
                featureFlags: { ...DEFAULT_FEATURE_FLAGS, promptScheduling: true },
            });
            expect(isPromptSchedulingEnabled(settings)).toBe(true);
        });
    });

    describe('getScheduleConfig', () => {
        it('should return default config when scheduling is disabled', () => {
            const settings = createTestSettings();
            const config = getScheduleConfig(settings);
            
            expect(config.enabled).toBe(false);
            expect(config.transitionFrames).toBe(DEFAULT_SCHEDULE_CONFIG.transitionFrames);
            expect(config.easing).toBe('ease_in_out');
        });

        it('should return custom transition frames when set', () => {
            const settings = createTestSettings({
                featureFlags: {
                    ...DEFAULT_FEATURE_FLAGS,
                    promptScheduling: true,
                    promptTransitionFrames: 12,
                },
            });
            const config = getScheduleConfig(settings);
            
            expect(config.enabled).toBe(true);
            expect(config.transitionFrames).toBe(12);
        });
    });

    describe('createTransitionSchedule', () => {
        it('should create three-segment transition schedule', () => {
            const config: PromptScheduleConfig = {
                enabled: true,
                transitionFrames: 8,
                easing: 'ease_in_out',
            };
            const schedule = createTransitionSchedule(
                'Starting scene',
                'Ending scene',
                81,
                config
            );

            expect(schedule.totalFrames).toBe(81);
            expect(schedule.segments.length).toBe(3);
            
            // First segment: start prompt
            expect(schedule.segments[0]?.prompt).toContain('Starting scene');
            
            // Middle segment: transition
            expect(schedule.segments[1]?.prompt).toContain('transitioning');
            
            // Last segment: end prompt
            expect(schedule.segments[2]?.prompt).toContain('Ending scene');
        });
    });

    describe('createBookendSchedule', () => {
        it('should create bookend schedule with three phases', () => {
            const config: PromptScheduleConfig = {
                enabled: true,
                transitionFrames: 8,
                easing: 'ease_in_out',
            };
            const schedule = createBookendSchedule(
                'Character stands still',
                'Character has moved across room',
                'Character walks slowly',
                81,
                config
            );

            expect(schedule.totalFrames).toBe(81);
            expect(schedule.segments.length).toBe(3);
            
            // Phase 1: Focus on start
            expect(schedule.segments[0]?.prompt).toContain('beginning');
            
            // Phase 2: Focus on motion
            expect(schedule.segments[1]?.prompt).toBe('Character walks slowly');
            
            // Phase 3: Focus on end
            expect(schedule.segments[2]?.prompt).toContain('reaching');
        });
    });

    describe('createConstantSchedule', () => {
        it('should create single-segment constant schedule', () => {
            const schedule = createConstantSchedule('Test prompt', 81, 'Bad quality');

            expect(schedule.totalFrames).toBe(81);
            expect(schedule.segments.length).toBe(1);
            expect(schedule.segments[0]?.prompt).toBe('Test prompt');
            expect(schedule.segments[0]?.startFrame).toBe(0);
            expect(schedule.segments[0]?.endFrame).toBe(81);
            expect(schedule.negativePrompt).toBe('Bad quality');
        });
    });

    describe('toComfyUIScheduleFormat', () => {
        it('should convert schedule to ComfyUI format', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [
                    { startFrame: 0, endFrame: 40, prompt: 'First', weight: 1.0, transitionType: 'cut' },
                    { startFrame: 40, endFrame: 81, prompt: 'Second', weight: 0.8, transitionType: 'cut' },
                ],
            };
            
            const result = toComfyUIScheduleFormat(schedule);
            
            expect(result.length).toBe(2);
            expect(result[0]).toEqual({
                text: 'First',
                frameRange: [0, 40],
                weight: 1.0,
            });
            expect(result[1]).toEqual({
                text: 'Second',
                frameRange: [40, 81],
                weight: 0.8,
            });
        });
    });

    describe('formatAsScheduledPrompt', () => {
        it('should format schedule as inline prompt string', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [
                    { startFrame: 0, endFrame: 40, prompt: 'First', transitionType: 'cut' },
                    { startFrame: 40, endFrame: 81, prompt: 'Second', transitionType: 'cut' },
                ],
            };
            
            const result = formatAsScheduledPrompt(schedule);
            
            expect(result).toBe('"First" :0-39 AND "Second" :40-80');
        });
    });

    describe('calculateEasedWeight', () => {
        it('should return linear interpolation for linear easing', () => {
            expect(calculateEasedWeight(0, 'linear')).toBe(0);
            expect(calculateEasedWeight(0.5, 'linear')).toBe(0.5);
            expect(calculateEasedWeight(1, 'linear')).toBe(1);
        });

        it('should return ease-in curve', () => {
            expect(calculateEasedWeight(0.5, 'ease_in')).toBe(0.25); // 0.5^2
        });

        it('should return ease-out curve', () => {
            expect(calculateEasedWeight(0.5, 'ease_out')).toBe(0.75); // 1 - (0.5)^2
        });

        it('should clamp values outside [0, 1]', () => {
            expect(calculateEasedWeight(-0.5, 'linear')).toBe(0);
            expect(calculateEasedWeight(1.5, 'linear')).toBe(1);
        });
    });

    describe('getWeightsAtFrame', () => {
        it('should return weight for active segment', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [
                    { startFrame: 0, endFrame: 40, prompt: 'First', weight: 1.0, transitionType: 'cut' },
                    { startFrame: 40, endFrame: 81, prompt: 'Second', weight: 0.8, transitionType: 'cut' },
                ],
            };
            const config: PromptScheduleConfig = {
                enabled: true,
                transitionFrames: 8,
                easing: 'linear',
            };

            const weights20 = getWeightsAtFrame(schedule, 20, config);
            expect(weights20.get(0)).toBe(1.0);
            expect(weights20.has(1)).toBe(false);

            const weights50 = getWeightsAtFrame(schedule, 50, config);
            expect(weights50.has(0)).toBe(false);
            expect(weights50.get(1)).toBe(0.8);
        });
    });

    describe('validateSchedule', () => {
        it('should return valid for proper schedule', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [
                    { startFrame: 0, endFrame: 40, prompt: 'First', transitionType: 'cut' },
                    { startFrame: 40, endFrame: 81, prompt: 'Second', transitionType: 'cut' },
                ],
            };

            const result = validateSchedule(schedule);
            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        it('should report error for empty schedule', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [],
            };

            const result = validateSchedule(schedule);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Schedule has no segments');
        });

        it('should warn about gaps between segments', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [
                    { startFrame: 0, endFrame: 30, prompt: 'First', transitionType: 'cut' },
                    { startFrame: 50, endFrame: 81, prompt: 'Second', transitionType: 'cut' },
                ],
            };

            const result = validateSchedule(schedule);
            expect(result.valid).toBe(true); // Gaps are warnings, not errors
            expect(result.warnings.some(w => w.includes('Gap'))).toBe(true);
        });

        it('should error on invalid frame range', () => {
            const schedule: PromptSchedule = {
                totalFrames: 81,
                defaultTransitionFrames: 8,
                segments: [
                    { startFrame: 40, endFrame: 20, prompt: 'Invalid', transitionType: 'cut' },
                ],
            };

            const result = validateSchedule(schedule);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('invalid frame range'))).toBe(true);
        });
    });
});
