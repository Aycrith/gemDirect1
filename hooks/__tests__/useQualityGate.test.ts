/**
 * @file useQualityGate.test.ts
 * Unit tests for the Quality Gate hook
 */

import { describe, it, expect } from 'vitest';
import { checkPromptQuality, validatePromptQuality } from '../../hooks/useQualityGate';
import { ValidationErrorCodes } from '../../types/validation';

describe('useQualityGate', () => {
    describe('checkPromptQuality', () => {
        it('should return zero score for empty prompt', () => {
            const result = checkPromptQuality('');
            expect(result.overall).toBe(0);
            expect(result.passed).toBe(false);
        });

        it('should return zero score for whitespace-only prompt', () => {
            const result = checkPromptQuality('   \n\t  ');
            expect(result.overall).toBe(0);
            expect(result.passed).toBe(false);
        });

        it('should pass for high-quality cinematic prompt', () => {
            const prompt = `
                A dramatic wide shot of a rugged hero standing on a cliff edge at golden hour.
                The warm light illuminates his weathered face, casting long shadows across the 
                rocky terrain. His posture is tense, fists clenched, as he looks out over the 
                misty valley below. The camera captures his silhouette against the crimson sunset,
                framed by ancient pine trees on either side.
            `;
            const result = checkPromptQuality(prompt);
            expect(result.overall).toBeGreaterThan(0.6);
            expect(result.passed).toBe(true);
        });

        it('should fail for low-quality minimal prompt', () => {
            const result = checkPromptQuality('A person.');
            expect(result.overall).toBeLessThan(0.6);
            expect(result.passed).toBe(false);
        });

        it('should provide breakdown scores', () => {
            const prompt = 'A cinematic wide shot with dramatic lighting shows a character.';
            const result = checkPromptQuality(prompt);
            
            expect(result.breakdown).toBeDefined();
            expect(result.breakdown?.structuralCompleteness).toBeGreaterThanOrEqual(0);
            expect(result.breakdown?.structuralCompleteness).toBeLessThanOrEqual(1);
            expect(result.breakdown?.visualSpecificity).toBeGreaterThanOrEqual(0);
            expect(result.breakdown?.narrativeClarity).toBeGreaterThanOrEqual(0);
        });

        it('should score visual terms higher', () => {
            const visualPrompt = 'Dramatic lighting, cinematic framing, golden hour, wide angle shot, vivid colors.';
            const boringPrompt = 'There is a thing in a place doing stuff.';
            
            const visualResult = checkPromptQuality(visualPrompt);
            const boringResult = checkPromptQuality(boringPrompt);
            
            expect(visualResult.breakdown?.visualSpecificity).toBeGreaterThan(boringResult.breakdown?.visualSpecificity || 0);
        });

        it('should score narrative clarity terms', () => {
            const narrativePrompt = 'A woman stands in the doorway, holding a letter. She looks at the rain falling outside.';
            const result = checkPromptQuality(narrativePrompt);
            
            expect(result.breakdown?.narrativeClarity).toBeGreaterThan(0);
        });

        it('should allow custom threshold', () => {
            const prompt = 'A person in a room.';
            
            const strictResult = checkPromptQuality(prompt, 0.9);
            const lenientResult = checkPromptQuality(prompt, 0.1);
            
            expect(strictResult.threshold).toBe(0.9);
            expect(lenientResult.threshold).toBe(0.1);
            expect(strictResult.passed).toBe(false);
            expect(lenientResult.passed).toBe(true);
        });

        it('should score character references', () => {
            const withCharacter = 'The protagonist faces the camera, his expression tense.';
            const withoutCharacter = 'The building is tall with many windows.';
            
            const charResult = checkPromptQuality(withCharacter);
            const noCharResult = checkPromptQuality(withoutCharacter);
            
            expect(charResult.breakdown?.characterReferenceDensity).toBeGreaterThan(
                noCharResult.breakdown?.characterReferenceDensity || 0
            );
        });

        it('should score temporal markers', () => {
            const withTemporal = 'In this moment of transition, the dynamic movement captures the action.';
            const withoutTemporal = 'A building with a red roof.';
            
            const temporalResult = checkPromptQuality(withTemporal);
            const noTemporalResult = checkPromptQuality(withoutTemporal);
            
            expect(temporalResult.breakdown?.temporalMarkers).toBeGreaterThan(
                noTemporalResult.breakdown?.temporalMarkers || 0
            );
        });
    });

    describe('validatePromptQuality', () => {
        it('should return success for passing prompt', () => {
            const prompt = `
                A cinematic wide shot of a dramatic scene with warm golden lighting.
                The hero stands tall, his silhouette framed against the sunset.
                Dynamic camera movement captures the emotional moment.
            `;
            const result = validatePromptQuality(prompt);
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data?.passed).toBe(true);
        });

        it('should return failure with error for failing prompt', () => {
            const result = validatePromptQuality('A thing.');
            
            expect(result.success).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            expect(result.errors![0]!.code).toBe(ValidationErrorCodes.PROMPT_LOW_QUALITY_SCORE);
        });

        it('should include quality score data on failure', () => {
            const result = validatePromptQuality('A thing.');
            
            expect(result.data).toBeDefined();
            expect(result.data!.overall).toBeDefined();
            expect(result.data!.threshold).toBeDefined();
        });

        it('should include fix suggestion in error', () => {
            const result = validatePromptQuality('A thing.');
            
            expect(result.errors![0]!.fix).toBeDefined();
            expect(result.errors![0]!.fix).toContain('visual');
        });

        it('should respect custom threshold', () => {
            const prompt = 'A person standing in a room with a chair.';
            
            const strictResult = validatePromptQuality(prompt, { minQualityScore: 0.9 });
            const lenientResult = validatePromptQuality(prompt, { minQualityScore: 0.1 });
            
            expect(strictResult.success).toBe(false);
            expect(lenientResult.success).toBe(true);
        });

        it('should include context in error when provided', () => {
            const result = validatePromptQuality('A thing.', { context: 'Scene 1' });
            
            expect(result.errors?.[0]?.context).toBe('Scene 1');
        });

        it('should include message with percentage', () => {
            const result = validatePromptQuality('A thing.', { minQualityScore: 0.6 });
            
            expect(result.message).toContain('%');
        });
    });

    describe('quality score edge cases', () => {
        it('should handle very long prompts', () => {
            const longPrompt = `
                A sweeping cinematic wide shot captures the vast expanse of the desert landscape
                at the golden hour. The warm amber light bathes the sand dunes in a rich glow,
                casting dramatic shadows that stretch across the terrain. In the foreground,
                a lone figure stands resolute, their silhouette framed against the crimson sky.
                The camera slowly pans to reveal ancient ruins in the distance, their weathered
                stone walls telling stories of civilizations long past. A gentle breeze stirs
                the sand, creating ephemeral patterns that dance in the fading light. The
                protagonist's expression is one of determination mixed with wonder as they
                gaze upon the mysterious structures that have stood for millennia. The scene
                captures a pivotal moment of discovery, the transition from uncertainty to
                purpose evident in their stance. Dynamic shadows play across their face as
                clouds drift overhead, the ever-changing light adding depth to the emotional
                landscape of the scene.
            `.repeat(3);
            
            const result = checkPromptQuality(longPrompt);
            expect(result.overall).toBeGreaterThan(0);
            expect(result.breakdown?.structuralCompleteness).toBeLessThanOrEqual(1);
        });

        it('should handle prompts with special characters', () => {
            const prompt = 'A hero\'s journey — the "chosen one" faces their destiny! (dramatic pause)';
            const result = checkPromptQuality(prompt);
            expect(result.overall).toBeGreaterThan(0);
        });

        it('should handle prompts with numbers', () => {
            const prompt = 'Scene 1: A character walks 100 meters through the 3rd district.';
            const result = checkPromptQuality(prompt);
            expect(result.overall).toBeGreaterThan(0);
        });

        it('should cap all breakdown scores at 1.0', () => {
            const overloadedPrompt = `
                cinematic dramatic wide shot close-up angle perspective camera framing
                lighting shadows bright dark warm cool golden silver crimson azure emerald
                character person man woman protagonist hero face expression eyes
                stands walks runs looks holds reveals captures displays features
                moment transition movement action dynamic
            `.repeat(5);
            
            const result = checkPromptQuality(overloadedPrompt);
            
            Object.values(result.breakdown || {}).forEach(score => {
                expect(score).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('quality thresholds', () => {
        it('should use default threshold of 0.6', () => {
            const result = checkPromptQuality('Test prompt');
            expect(result.threshold).toBe(0.6);
        });

        it('should reject scores below threshold', () => {
            const lowScore = checkPromptQuality('A.', 0.5);
            expect(lowScore.passed).toBe(false);
        });

        it('should accept scores at exactly threshold', () => {
            // Find a prompt that scores close to 0.3, then test at that threshold
            const prompt = 'A cinematic shot shows a character.';
            const result = checkPromptQuality(prompt);
            
            // Re-test with threshold exactly at the score
            const atThreshold = checkPromptQuality(prompt, result.overall);
            expect(atThreshold.passed).toBe(true);
        });

        it('should accept scores above threshold', () => {
            const prompt = `
                Dramatic cinematic wide shot of a hero standing in golden light.
                The camera captures their determined expression against the sunset.
            `;
            const result = checkPromptQuality(prompt, 0.3);
            expect(result.passed).toBe(true);
        });
    });
});
