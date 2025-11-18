import { describe, it, expect } from 'vitest';
import {
    validatePrompt,
    sanitizePrompt,
    validateStoryParams,
    validateScene,
    validateApiKey,
    validateUrl,
    validateRange,
    formatValidationErrors
} from '../../utils/inputValidator';

describe('inputValidator', () => {
    describe('validatePrompt', () => {
        it('validates valid prompt', () => {
            const result = validatePrompt('Create a beautiful cinematic scene');

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.sanitized).toBe('Create a beautiful cinematic scene');
        });

        it('rejects empty prompt', () => {
            const result = validatePrompt('');

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('required');
        });

        it('enforces minimum length', () => {
            const result = validatePrompt('short', { minLength: 10 });

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at least 10');
        });

        it('enforces maximum length', () => {
            const longPrompt = 'a'.repeat(3000);
            const result = validatePrompt(longPrompt, { maxLength: 2000 });

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('must not exceed');
        });

        it('detects injection patterns', () => {
            const result = validatePrompt('Create <script>alert("xss")</script> scene');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('dangerous'))).toBe(true);
        });

        it('detects command injection', () => {
            const result = validatePrompt('Generate scene; rm -rf /');

            expect(result.valid).toBe(false);
        });

        it('detects SQL injection', () => {
            const result = validatePrompt('Scene with UNION SELECT * FROM users');

            expect(result.valid).toBe(false);
        });
    });

    describe('sanitizePrompt', () => {
        it('removes script tags', () => {
            const result = sanitizePrompt('Text <script>alert("xss")</script> more text');

            expect(result).not.toContain('<script>');
            expect(result).toContain('Text');
            expect(result).toContain('more text');
        });

        it('removes event handlers', () => {
            const result = sanitizePrompt('Text <img onclick="alert()"> more');

            expect(result).not.toContain('onclick');
        });

        it('escapes backticks', () => {
            const result = sanitizePrompt('Text `with` backticks');

            expect(result).not.toContain('`');
            expect(result).toContain("'with'");
        });

        it('removes null bytes', () => {
            const result = sanitizePrompt('Text\x00with\x00nulls');

            expect(result).not.toContain('\x00');
        });

        it('normalizes whitespace', () => {
            const result = sanitizePrompt('Text    with    multiple    spaces');

            expect(result).toBe('Text with multiple spaces');
        });
    });

    describe('validateStoryParams', () => {
        it('validates valid story params', () => {
            const result = validateStoryParams({
                prompt: 'Create a heroic fantasy scene with dragons and knights',
                genre: 'Fantasy',
                tone: 'Epic'
            });

            expect(result.valid).toBe(true);
        });

        it('rejects non-object params', () => {
            const result = validateStoryParams('not an object');

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('must be an object');
        });

        it('requires prompt field', () => {
            const result = validateStoryParams({ genre: 'Fantasy' });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Prompt'))).toBe(true);
        });

        it('validates optional genre field', () => {
            const result = validateStoryParams({
                prompt: 'Test prompt with enough length',
                genre: 123 // Should be string
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Genre'))).toBe(true);
        });
    });

    describe('validateScene', () => {
        it('validates valid scene', () => {
            const result = validateScene({
                sceneNumber: 1,
                description: 'A hero stands on a mountain overlooking the kingdom',
                keyframeDescription: 'Wide shot of landscape at sunrise'
            });

            expect(result.valid).toBe(true);
        });

        it('requires sceneNumber', () => {
            const result = validateScene({
                description: 'Valid description',
                keyframeDescription: 'Valid keyframe'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('sceneNumber'))).toBe(true);
        });

        it('requires description', () => {
            const result = validateScene({
                sceneNumber: 1,
                keyframeDescription: 'Valid keyframe'
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('description'))).toBe(true);
        });

        it('enforces description max length', () => {
            const result = validateScene({
                sceneNumber: 1,
                description: 'a'.repeat(6000),
                keyframeDescription: 'Valid keyframe'
            });

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('5000');
        });
    });

    describe('validateApiKey', () => {
        it('validates valid API key', () => {
            const result = validateApiKey('sk-1234567890abcdefghijklmnop');

            expect(result.valid).toBe(true);
        });

        it('rejects undefined key', () => {
            const result = validateApiKey(undefined);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('required');
        });

        it('rejects too short key', () => {
            const result = validateApiKey('short');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('too short'))).toBe(true);
        });

        it('rejects keys with whitespace', () => {
            const result = validateApiKey('key with spaces');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('whitespace'))).toBe(true);
        });

        it('rejects placeholder values', () => {
            const result = validateApiKey('your-api-key');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('placeholder'))).toBe(true);
        });
    });

    describe('validateUrl', () => {
        it('validates valid HTTP URL', () => {
            const result = validateUrl('http://localhost:8188');

            expect(result.valid).toBe(true);
        });

        it('validates valid HTTPS URL', () => {
            const result = validateUrl('https://api.example.com');

            expect(result.valid).toBe(true);
        });

        it('rejects undefined URL', () => {
            const result = validateUrl(undefined);

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('required');
        });

        it('rejects invalid protocol', () => {
            const result = validateUrl('ftp://example.com');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('protocol'))).toBe(true);
        });

        it('rejects malformed URL', () => {
            const result = validateUrl('not a url');

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Invalid URL'))).toBe(true);
        });
    });

    describe('validateRange', () => {
        it('validates value in range', () => {
            const result = validateRange(50, 0, 100, 'Temperature');

            expect(result.valid).toBe(true);
        });

        it('rejects value below minimum', () => {
            const result = validateRange(-1, 0, 100, 'Temperature');

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at least 0');
        });

        it('rejects value above maximum', () => {
            const result = validateRange(101, 0, 100, 'Temperature');

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('must not exceed 100');
        });

        it('rejects non-numeric value', () => {
            const result = validateRange(NaN, 0, 100, 'Temperature');

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('valid number');
        });
    });

    describe('formatValidationErrors', () => {
        it('formats no errors', () => {
            const result = formatValidationErrors([]);

            expect(result).toBe('No validation errors');
        });

        it('formats single error', () => {
            const result = formatValidationErrors(['Invalid value']);

            expect(result).toBe('Invalid value');
        });

        it('formats multiple errors', () => {
            const result = formatValidationErrors(['Error 1', 'Error 2', 'Error 3']);

            expect(result).toContain('3 validation errors');
            expect(result).toContain('Error 1');
            expect(result).toContain('Error 2');
            expect(result).toContain('Error 3');
        });
    });
});
