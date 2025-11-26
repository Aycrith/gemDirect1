/**
 * Prompt Registry Tests
 * 
 * Tests for token estimation, truncation, budget validation,
 * and character prompt configuration.
 * 
 * @module services/__tests__/promptRegistry.test
 */

import { describe, it, expect } from 'vitest';
import {
    estimateTokens,
    tokensToChars,
    charsToTokens,
    truncateToTokenLimit,
    validateTokenBudget,
    validateTokenBudgets,
    buildCharacterPromptSegment,
    extractControlNetMetadata,
    countWords,
    isWithinWordRange,
    getTokenUsageSummary,
    DEFAULT_TOKEN_BUDGETS,
    type CharacterPromptConfig,
    type PromptSection,
} from '../promptRegistry';

describe('Token Estimation', () => {
    describe('estimateTokens', () => {
        it('should return 0 for empty string', () => {
            expect(estimateTokens('')).toBe(0);
        });

        it('should return 0 for null/undefined', () => {
            expect(estimateTokens(null as unknown as string)).toBe(0);
            expect(estimateTokens(undefined as unknown as string)).toBe(0);
        });

        it('should estimate tokens at 4 chars per token', () => {
            expect(estimateTokens('test')).toBe(1); // 4 chars = 1 token
            expect(estimateTokens('testing1')).toBe(2); // 8 chars = 2 tokens
            expect(estimateTokens('a'.repeat(100))).toBe(25); // 100 chars = 25 tokens
        });

        it('should round up for partial tokens', () => {
            expect(estimateTokens('abc')).toBe(1); // 3 chars rounds up to 1 token
            expect(estimateTokens('abcde')).toBe(2); // 5 chars rounds up to 2 tokens
        });

        it('should handle typical prompt lengths', () => {
            const shortPrompt = 'A detective investigates a murder.'; // 35 chars
            const mediumPrompt = 'A grizzled detective returns to investigate a mysterious murder in a small coastal town, uncovering secrets from the past.'; // 123 chars
            const longPrompt = 'A'.repeat(2000); // 2000 chars
            
            expect(estimateTokens(shortPrompt)).toBe(9); // 35/4 = 8.75 → 9
            expect(estimateTokens(mediumPrompt)).toBe(31); // 123/4 = 30.75 → 31
            expect(estimateTokens(longPrompt)).toBe(500); // 2000/4 = 500
        });
    });

    describe('tokensToChars / charsToTokens', () => {
        it('should convert tokens to chars (multiply by 4)', () => {
            expect(tokensToChars(1)).toBe(4);
            expect(tokensToChars(100)).toBe(400);
            expect(tokensToChars(500)).toBe(2000);
        });

        it('should convert chars to tokens (divide by 4, round up)', () => {
            expect(charsToTokens(4)).toBe(1);
            expect(charsToTokens(5)).toBe(2); // rounds up
            expect(charsToTokens(100)).toBe(25);
            expect(charsToTokens(2000)).toBe(500);
        });

        it('should be inverse operations (within rounding)', () => {
            expect(tokensToChars(charsToTokens(100))).toBeGreaterThanOrEqual(100);
            expect(charsToTokens(tokensToChars(50))).toBe(50);
        });
    });
});

describe('Smart Truncation', () => {
    describe('truncateToTokenLimit', () => {
        it('should not truncate text within limit', () => {
            const text = 'This is a short sentence.';
            const result = truncateToTokenLimit(text, 100);
            
            expect(result.truncated).toBe(false);
            expect(result.text).toBe(text);
            expect(result.originalTokens).toBe(result.finalTokens);
        });

        it('should truncate at sentence boundary when possible', () => {
            const text = 'First sentence. Second sentence. Third sentence.';
            // 48 chars = 12 tokens, limit to 10 tokens = 40 chars
            const result = truncateToTokenLimit(text, 10);
            
            expect(result.truncated).toBe(true);
            expect(result.text).toContain('First sentence.');
            expect(result.text).toMatch(/\.\.\.$/);
        });

        it('should do hard truncation when no sentence boundaries', () => {
            const text = 'This is one very long sentence without any breaks that goes on and on';
            const result = truncateToTokenLimit(text, 5); // 20 chars max
            
            expect(result.truncated).toBe(true);
            expect(result.text.length).toBeLessThanOrEqual(20);
            expect(result.text).toMatch(/\.\.\.$/);
        });

        it('should preserve end when preserveEnd=true', () => {
            const text = 'First sentence. Second sentence. Third sentence.';
            const result = truncateToTokenLimit(text, 10, true);
            
            expect(result.truncated).toBe(true);
            expect(result.text).toMatch(/^\.\.\./);
            expect(result.text).toContain('Third sentence.');
        });

        it('should handle empty string', () => {
            const result = truncateToTokenLimit('', 100);
            
            expect(result.truncated).toBe(false);
            expect(result.text).toBe('');
            expect(result.originalTokens).toBe(0);
        });

        it('should track original and final token counts', () => {
            const text = 'A'.repeat(200); // 200 chars = 50 tokens
            const result = truncateToTokenLimit(text, 20);
            
            expect(result.originalTokens).toBe(50);
            expect(result.finalTokens).toBeLessThanOrEqual(20);
            expect(result.truncated).toBe(true);
        });

        it('should handle multiple sentence endings', () => {
            const text = 'Question? Exclamation! Statement. More text here.';
            const result = truncateToTokenLimit(text, 10);
            
            expect(result.truncated).toBe(true);
            // Should find sentence boundary
            expect(result.text).toMatch(/[.!?]/);
        });
    });
});

describe('Token Budget Validation', () => {
    describe('validateTokenBudget', () => {
        it('should validate text within budget', () => {
            const text = 'A short logline for testing.'; // ~28 chars = 7 tokens
            const result = validateTokenBudget('logline', text);
            
            expect(result.valid).toBe(true);
            expect(result.tokens).toBe(7);
            expect(result.budget).toBe(DEFAULT_TOKEN_BUDGETS.logline);
            expect(result.overflow).toBe(0);
        });

        it('should detect overflow', () => {
            const text = 'A'.repeat(2500); // 625 tokens, budget is 500
            const result = validateTokenBudget('logline', text);
            
            expect(result.valid).toBe(false);
            expect(result.overflow).toBe(125);
            expect(result.warning).toContain('exceeds');
        });

        it('should warn at 80% usage', () => {
            // logline budget is 500 tokens = 2000 chars
            // 80% = 1600 chars = 400 tokens
            const text = 'A'.repeat(1700); // 425 tokens = 85%
            const result = validateTokenBudget('logline', text);
            
            expect(result.valid).toBe(true);
            expect(result.percentUsed).toBeGreaterThan(80);
            expect(result.warning).toContain('85%');
        });

        it('should not warn below 80%', () => {
            const text = 'A'.repeat(1000); // 250 tokens = 50%
            const result = validateTokenBudget('logline', text);
            
            expect(result.valid).toBe(true);
            expect(result.warning).toBeUndefined();
        });

        it('should accept custom budgets', () => {
            const text = 'A'.repeat(200); // 50 tokens
            const result = validateTokenBudget('logline', text, { logline: 40 });
            
            expect(result.valid).toBe(false);
            expect(result.budget).toBe(40);
            expect(result.overflow).toBe(10);
        });

        it('should validate all section types', () => {
            const sections: PromptSection[] = [
                'logline', 'characterProfile', 'setting', 
                'plotScene', 'comfyuiShot', 'plotOutline'
            ];
            
            for (const section of sections) {
                const result = validateTokenBudget(section, 'test');
                expect(result.budget).toBe(DEFAULT_TOKEN_BUDGETS[section]);
            }
        });
    });

    describe('validateTokenBudgets', () => {
        it('should validate multiple sections', () => {
            const result = validateTokenBudgets([
                { section: 'logline', text: 'A short logline.' },
                { section: 'setting', text: 'A detailed setting description.' },
            ]);
            
            expect(result.allValid).toBe(true);
            expect(Object.keys(result.results)).toHaveLength(2);
            expect(result.errors).toHaveLength(0);
        });

        it('should aggregate total tokens', () => {
            const result = validateTokenBudgets([
                { section: 'logline', text: 'A'.repeat(100) }, // 25 tokens
                { section: 'setting', text: 'B'.repeat(200) }, // 50 tokens
            ]);
            
            expect(result.totalTokens).toBe(75);
        });

        it('should collect warnings and errors', () => {
            const result = validateTokenBudgets([
                { section: 'logline', text: 'A'.repeat(2500) }, // Over budget
                { section: 'setting', text: 'B'.repeat(2000) }, // At 83%
            ]);
            
            expect(result.allValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.warnings.length).toBeGreaterThan(0);
        });
    });
});

describe('Character Prompt Configuration', () => {
    describe('buildCharacterPromptSegment', () => {
        it('should build segment with visual descriptor only', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: 'tall woman with red hair, wearing a blue coat',
            };
            
            const result = buildCharacterPromptSegment(config);
            expect(result).toBe('tall woman with red hair, wearing a blue coat');
        });

        it('should prepend trigger words', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: 'woman in formal attire',
                triggerWords: ['elena_lora', 'custom_style'],
            };
            
            const result = buildCharacterPromptSegment(config);
            expect(result).toBe('elena_lora, custom_style, woman in formal attire');
        });

        it('should handle empty descriptor', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: '',
                triggerWords: ['trigger1'],
            };
            
            const result = buildCharacterPromptSegment(config);
            expect(result).toBe('trigger1');
        });
    });

    describe('extractControlNetMetadata', () => {
        it('should detect embedding presence', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: 'test',
                identityEmbedding: 'path/to/embedding.safetensors',
            };
            
            const result = extractControlNetMetadata(config);
            expect(result.hasEmbedding).toBe(true);
            expect(result.hasIPAdapter).toBe(false);
            expect(result.hasFaceEncoding).toBe(false);
        });

        it('should detect IP-Adapter config', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: 'test',
                ipAdapterWeight: 0.7,
            };
            
            const result = extractControlNetMetadata(config);
            expect(result.hasIPAdapter).toBe(true);
            expect(result.metadata.ipAdapterWeight).toBe(0.7);
        });

        it('should detect face encoding', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: 'test',
                faceEncodingRef: 'path/to/face.npy',
            };
            
            const result = extractControlNetMetadata(config);
            expect(result.hasFaceEncoding).toBe(true);
        });

        it('should include all metadata in output', () => {
            const config: CharacterPromptConfig = {
                characterId: 'char-1',
                visualDescriptor: 'test',
                identityEmbedding: 'embed.safetensors',
                ipAdapterWeight: 0.5,
                faceEncodingRef: 'face.npy',
                triggerWords: ['trigger1', 'trigger2'],
            };
            
            const result = extractControlNetMetadata(config);
            expect(result.metadata).toEqual({
                embeddingRef: 'embed.safetensors',
                ipAdapterWeight: 0.5,
                faceEncodingRef: 'face.npy',
                triggerWords: ['trigger1', 'trigger2'],
            });
        });
    });
});

describe('Utility Functions', () => {
    describe('countWords', () => {
        it('should count words correctly', () => {
            expect(countWords('one two three')).toBe(3);
            expect(countWords('  spaced   out  ')).toBe(2);
            expect(countWords('')).toBe(0);
        });

        it('should handle null/undefined', () => {
            expect(countWords(null as unknown as string)).toBe(0);
            expect(countWords(undefined as unknown as string)).toBe(0);
        });
    });

    describe('isWithinWordRange', () => {
        it('should validate word range', () => {
            const text = 'one two three four five'; // 5 words
            
            expect(isWithinWordRange(text, 3, 7)).toBe(true);
            expect(isWithinWordRange(text, 5, 5)).toBe(true);
            expect(isWithinWordRange(text, 6, 10)).toBe(false);
            expect(isWithinWordRange(text, 1, 4)).toBe(false);
        });
    });

    describe('getTokenUsageSummary', () => {
        it('should generate readable summary', () => {
            const summary = getTokenUsageSummary([
                { section: 'logline', text: 'A short logline.' },
                { section: 'setting', text: 'A detailed setting.' },
            ]);
            
            expect(summary).toContain('Total tokens:');
            expect(summary).toContain('logline');
            expect(summary).toContain('setting');
            expect(summary).toContain('✓');
        });

        it('should show errors for overflows', () => {
            const summary = getTokenUsageSummary([
                { section: 'logline', text: 'A'.repeat(3000) }, // Over budget
            ]);
            
            expect(summary).toContain('✗');
            expect(summary).toContain('Errors:');
        });
    });
});
