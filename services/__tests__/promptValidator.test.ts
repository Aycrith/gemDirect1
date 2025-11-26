import { describe, it, expect } from 'vitest';
import { validatePromptGuardrails, validatePromptBatch } from '../promptValidator';

describe('Prompt Guardrail Validation', () => {
    describe('RULE 1: Single-frame instruction', () => {
        it('should pass when SINGLE_FRAME_PROMPT is present', () => {
            const prompt = 'Single cinematic frame, one moment, no collage. A beautiful scene.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.errors).not.toContain(expect.stringContaining('Missing SINGLE_FRAME_PROMPT'));
        });

        it('should fail when SINGLE_FRAME_PROMPT is missing', () => {
            const prompt = 'A beautiful scene without the required prefix.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.errors).toContain('[test] Missing SINGLE_FRAME_PROMPT prefix');
            expect(result.isValid).toBe(false);
        });
    });

    describe('RULE 2: Aspect ratio specification', () => {
        it('should pass when 16:9 is present', () => {
            const prompt = 'Single cinematic frame. 16:9 aspect ratio. A scene.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.errors).not.toContain(expect.stringContaining('Missing aspect ratio'));
        });

        it('should pass when widescreen is present', () => {
            const prompt = 'Single cinematic frame. Widescreen composition. A scene.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.errors).not.toContain(expect.stringContaining('Missing aspect ratio'));
        });

        it('should fail when neither 16:9 nor widescreen is present', () => {
            const prompt = 'Single cinematic frame. A scene without aspect ratio.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.errors).toContain('[test] Missing aspect ratio specification');
            expect(result.isValid).toBe(false);
        });
    });

    describe('RULE 3: Negative prompt multi-panel avoidance', () => {
        it('should pass when all required terms are present', () => {
            const prompt = 'Single cinematic frame. 16:9. A scene.';
            const negative = 'multi-panel, split-screen, collage, storyboard';
            const result = validatePromptGuardrails(prompt, negative, 'test');
            expect(result.errors).not.toContain(expect.stringContaining('Negative prompt missing terms'));
        });

        it('should fail when required terms are missing', () => {
            const prompt = 'Single cinematic frame. 16:9. A scene.';
            const negative = 'bad quality, blurry';
            const result = validatePromptGuardrails(prompt, negative, 'test');
            expect(result.errors).toContain('[test] Negative prompt missing terms: multi-panel, split-screen, collage');
            expect(result.isValid).toBe(false);
        });

        it('should be case-insensitive', () => {
            const prompt = 'Single cinematic frame. 16:9. A scene.';
            const negative = 'MULTI-PANEL, SPLIT-SCREEN, COLLAGE';
            const result = validatePromptGuardrails(prompt, negative, 'test');
            expect(result.isValid).toBe(true);
        });

        it('should detect partial missing terms', () => {
            const prompt = 'Single cinematic frame. 16:9. A scene.';
            const negative = 'multi-panel, split-screen'; // missing 'collage'
            const result = validatePromptGuardrails(prompt, negative, 'test');
            expect(result.errors).toContain('[test] Negative prompt missing terms: collage');
            expect(result.isValid).toBe(false);
        });
    });

    describe('RULE 4: Prompt length validation', () => {
        it('should warn when prompt is too short', () => {
            const prompt = 'Single cinematic frame. 16:9.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.warnings.some(w => w.includes('unusually short'))).toBe(true);
            expect(result.isValid).toBe(true); // warnings don't invalidate
        });

        it('should warn when prompt is too long', () => {
            const prompt = 'Single cinematic frame. 16:9. ' + 'A'.repeat(2600);
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.warnings.some(w => w.includes('very long'))).toBe(true);
            expect(result.isValid).toBe(true);
        });

        it('should pass for reasonable length prompts', () => {
            const prompt = 'Single cinematic frame, one moment, no collage. 16:9 widescreen. A cyberpunk city with neon lights and rain-soaked streets. High detail, cinematic lighting.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.warnings).not.toContain(expect.stringContaining('short'));
            expect(result.warnings).not.toContain(expect.stringContaining('long'));
        });
    });

    describe('RULE 5: Duplicate phrase detection', () => {
        it('should detect duplicate sentences', () => {
            const prompt = 'Single cinematic frame. 16:9. A cyberpunk scene with neon lights and futuristic architecture. A cyberpunk scene with neon lights and futuristic architecture.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.warnings.some(w => w.includes('Duplicate phrases detected'))).toBe(true);
        });

        it('should ignore short sentences in duplicate check', () => {
            const prompt = 'Single cinematic frame. 16:9. A scene. Another scene. Dramatic lighting with high contrast.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.warnings).not.toContain(expect.stringContaining('Duplicate phrases'));
        });

        it('should not warn when no duplicates exist', () => {
            const prompt = 'Single cinematic frame. 16:9. A cyberpunk city with neon lights. Rain-soaked streets reflect the glowing signs. Dramatic lighting creates a moody atmosphere.';
            const result = validatePromptGuardrails(prompt, 'multi-panel, split-screen, collage', 'test');
            expect(result.warnings).not.toContain(expect.stringContaining('Duplicate phrases'));
        });
    });

    describe('Integration scenarios', () => {
        it('should pass a well-formed keyframe prompt', () => {
            const prompt = `Single cinematic frame, one moment, no collage or multi-panel layout, no UI overlays or speech bubbles, cinematic lighting, 16:9 widescreen aspect ratio, horizontal landscape composition.
Cinematic establishing frame, high fidelity, 4K resolution.
Scene summary: With an inciting incident that forces a decisive choice. Visual tone leans into A cyberpunk neo-noir aesthetic with high contrast lighting.
Render a single still image that captures the mood, palette, and lighting cues of this scene.`;
            const negative = 'multi-panel, collage, split-screen, storyboard panels, speech bubbles, blurry, low-resolution';
            const result = validatePromptGuardrails(prompt, negative, 'keyframe-test');
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should fail a prompt with multiple violations', () => {
            const prompt = 'A scene without single frame instruction or aspect ratio.';
            const negative = 'bad quality'; // missing required terms
            const result = validatePromptGuardrails(prompt, negative, 'multi-violation');
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(2);
            expect(result.errors).toContain('[multi-violation] Missing SINGLE_FRAME_PROMPT prefix');
            expect(result.errors).toContain('[multi-violation] Missing aspect ratio specification');
            expect(result.errors.some(e => e.includes('Negative prompt missing terms'))).toBe(true);
        });

        it('should provide clear context in error messages', () => {
            const prompt = 'A bad prompt.';
            const result = validatePromptGuardrails(prompt, 'bad', 'Scene: Act 1 Opening');
            expect(result.errors.every(e => e.includes('[Scene: Act 1 Opening]'))).toBe(true);
        });
    });

    describe('validatePromptBatch', () => {
        it('should validate multiple prompts and aggregate results', () => {
            const prompts = [
                {
                    prompt: 'Single cinematic frame. 16:9. Scene 1.',
                    negativePrompt: 'multi-panel, split-screen, collage',
                    context: 'scene-1'
                },
                {
                    prompt: 'Single cinematic frame. 16:9. Scene 2.',
                    negativePrompt: 'multi-panel, split-screen, collage',
                    context: 'scene-2'
                },
                {
                    prompt: 'Bad prompt without requirements.',
                    negativePrompt: 'bad',
                    context: 'scene-3'
                }
            ];

            const result = validatePromptBatch(prompts);
            expect(result.allValid).toBe(false);
            expect(result.totalErrors).toBeGreaterThan(0);
            expect(result.results).toHaveLength(3);
            // Updated to use unified ValidationResult.success instead of legacy .isValid
            expect(result.results[0].success).toBe(true);
            expect(result.results[1].success).toBe(true);
            expect(result.results[2].success).toBe(false);
        });

        it('should return allValid=true when all prompts pass', () => {
            const prompts = [
                {
                    prompt: 'Single cinematic frame. 16:9. Scene 1.',
                    negativePrompt: 'multi-panel, split-screen, collage',
                    context: 'scene-1'
                },
                {
                    prompt: 'Single cinematic frame. 16:9. Scene 2.',
                    negativePrompt: 'multi-panel, split-screen, collage',
                    context: 'scene-2'
                }
            ];

            const result = validatePromptBatch(prompts);
            expect(result.allValid).toBe(true);
            expect(result.totalErrors).toBe(0);
        });
    });
});
