/**
 * Tests for styleExtractor service
 * Validates style keyword extraction from director's vision
 */
import { describe, it, expect } from 'vitest';
import { 
    extractStyleTerms, 
    formatStyleTerms,
    extractAndFormatStyleTerms,
    STYLE_KEYWORDS,
    ALL_STYLE_KEYWORDS,
    MAX_EXTRACTED_TERMS,
} from '../styleExtractor';

describe('styleExtractor', () => {
    describe('extractStyleTerms', () => {
        it('should extract lighting keywords from vision text', () => {
            const result = extractStyleTerms(
                'Use dramatic lighting with rim lighting effects',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.enabled).toBe(true);
            expect(result.categories.lighting).toContain('dramatic lighting');
            expect(result.categories.lighting).toContain('rim lighting');
        });

        it('should extract cinematography keywords', () => {
            const result = extractStyleTerms(
                'Shoot with anamorphic lens, shallow depth of field, cinematic feel',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.categories.cinematography).toContain('anamorphic');
            expect(result.categories.cinematography).toContain('shallow depth of field');
            expect(result.categories.cinematography).toContain('cinematic');
        });

        it('should extract color grading keywords', () => {
            const result = extractStyleTerms(
                'Color grade with warm tones and slightly desaturated look',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.categories.colorGrading).toContain('warm tones');
            expect(result.categories.colorGrading).toContain('desaturated');
        });

        it('should extract style reference keywords', () => {
            const result = extractStyleTerms(
                'Neo-noir aesthetic with cyberpunk elements',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.categories.styleReferences).toContain('neo-noir');
            expect(result.categories.styleReferences).toContain('cyberpunk');
        });

        it('should limit to MAX_EXTRACTED_TERMS by default', () => {
            // Text with many style keywords
            const result = extractStyleTerms(
                'Cinematic anamorphic dramatic lighting golden hour warm tones desaturated noir cyberpunk vintage retro',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.terms.length).toBeLessThanOrEqual(MAX_EXTRACTED_TERMS);
        });

        it('should respect custom maxTerms parameter', () => {
            const result = extractStyleTerms(
                'Cinematic anamorphic dramatic lighting golden hour warm tones',
                { flags: { subjectFirstPrompts: true }, maxTerms: 2 }
            );
            expect(result.terms.length).toBeLessThanOrEqual(2);
        });

        it('should return empty result when flag is disabled', () => {
            const result = extractStyleTerms(
                'Cinematic dramatic lighting',
                { flags: { subjectFirstPrompts: false } }
            );
            expect(result.enabled).toBe(false);
            expect(result.terms).toHaveLength(0);
        });

        it('should handle empty vision text', () => {
            const result = extractStyleTerms('', { flags: { subjectFirstPrompts: true } });
            expect(result.terms).toHaveLength(0);
        });

        it('should handle vision text with no matching keywords', () => {
            const result = extractStyleTerms(
                'A beautiful sunset over the mountains',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.terms).toHaveLength(0);
        });

        it('should use case-insensitive matching', () => {
            const result = extractStyleTerms(
                'CINEMATIC DRAMATIC LIGHTING golden HOUR',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.terms).toContain('cinematic');
            expect(result.terms).toContain('dramatic lighting');
            expect(result.terms).toContain('golden hour');
        });

        it('should use word boundary matching to avoid partial matches', () => {
            // "lukewarm" should not match "warm tones"
            const result = extractStyleTerms(
                'lukewarm tones in the scene',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(result.categories.colorGrading).not.toContain('warm tones');
        });
    });

    describe('formatStyleTerms', () => {
        it('should format styles as comma-separated string', () => {
            const result = {
                terms: ['cinematic', 'dramatic lighting', 'warm tones'],
                enabled: true,
                categories: { cinematography: [], lighting: [], colorGrading: [], styleReferences: [] },
            };
            expect(formatStyleTerms(result)).toBe('cinematic, dramatic lighting, warm tones');
        });

        it('should return empty string when disabled', () => {
            const result = {
                terms: ['cinematic'],
                enabled: false,
                categories: { cinematography: [], lighting: [], colorGrading: [], styleReferences: [] },
            };
            expect(formatStyleTerms(result)).toBe('');
        });

        it('should return empty string for empty terms', () => {
            const result = {
                terms: [],
                enabled: true,
                categories: { cinematography: [], lighting: [], colorGrading: [], styleReferences: [] },
            };
            expect(formatStyleTerms(result)).toBe('');
        });
    });

    describe('extractAndFormatStyleTerms', () => {
        it('should extract and format in one call', () => {
            const formatted = extractAndFormatStyleTerms(
                'Cinematic dramatic lighting',
                { flags: { subjectFirstPrompts: true } }
            );
            expect(formatted).toContain('cinematic');
            expect(formatted).toContain('dramatic lighting');
        });

        it('should return empty string when disabled', () => {
            const formatted = extractAndFormatStyleTerms(
                'Cinematic dramatic lighting',
                { flags: { subjectFirstPrompts: false } }
            );
            expect(formatted).toBe('');
        });
    });

    describe('STYLE_KEYWORDS', () => {
        it('should have cinematography category', () => {
            expect(STYLE_KEYWORDS.cinematography.length).toBeGreaterThan(5);
            expect(STYLE_KEYWORDS.cinematography).toContain('cinematic');
        });

        it('should have lighting category', () => {
            expect(STYLE_KEYWORDS.lighting.length).toBeGreaterThan(5);
            expect(STYLE_KEYWORDS.lighting).toContain('dramatic lighting');
        });

        it('should have colorGrading category', () => {
            expect(STYLE_KEYWORDS.colorGrading.length).toBeGreaterThan(5);
            expect(STYLE_KEYWORDS.colorGrading).toContain('warm tones');
        });

        it('should have styleReferences category', () => {
            expect(STYLE_KEYWORDS.styleReferences.length).toBeGreaterThan(5);
            expect(STYLE_KEYWORDS.styleReferences).toContain('noir');
        });
    });

    describe('ALL_STYLE_KEYWORDS', () => {
        it('should contain all keywords from all categories', () => {
            const totalExpected = 
                STYLE_KEYWORDS.cinematography.length +
                STYLE_KEYWORDS.lighting.length +
                STYLE_KEYWORDS.colorGrading.length +
                STYLE_KEYWORDS.styleReferences.length;
            expect(ALL_STYLE_KEYWORDS.length).toBe(totalExpected);
        });
    });

    describe('MAX_EXTRACTED_TERMS', () => {
        it('should be a reasonable limit', () => {
            expect(MAX_EXTRACTED_TERMS).toBeGreaterThanOrEqual(3);
            expect(MAX_EXTRACTED_TERMS).toBeLessThanOrEqual(10);
        });
    });
});
