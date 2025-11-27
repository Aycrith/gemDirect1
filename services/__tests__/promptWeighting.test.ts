/**
 * Tests for promptWeighting service
 * Validates weighting syntax generation, parsing, and preset application
 */
import { describe, it, expect, vi } from 'vitest';
import { 
    applyWeight, 
    parseWeightedTerms, 
    WEIGHTING_PRESETS,
    WEIGHT_MIN,
    WEIGHT_MAX,
    isWeightingSupported,
    getWeightingPreset,
    DEFAULT_WEIGHTING_PRESET,
} from '../promptWeighting';

describe('promptWeighting', () => {
    describe('applyWeight', () => {
        it('should return unweighted term when weight is 1.0', () => {
            expect(applyWeight('subject', 1)).toBe('subject');
            expect(applyWeight('subject', 1.0)).toBe('subject');
        });

        it('should apply weighting syntax for non-1.0 weights', () => {
            expect(applyWeight('subject', 1.2)).toBe('(subject:1.20)');
            expect(applyWeight('subject', 0.8)).toBe('(subject:0.80)');
        });

        it('should clamp weights to safe range [0.1, 2.0]', () => {
            expect(applyWeight('term', 0.05)).toBe('(term:0.10)');
            expect(applyWeight('term', 3.0)).toBe('(term:2.00)');
        });

        it('should handle empty strings', () => {
            expect(applyWeight('', 1.2)).toBe('');
        });

        it('should trim whitespace', () => {
            expect(applyWeight('  subject  ', 1.2)).toBe('(subject:1.20)');
        });

        it('should handle NaN and Infinity gracefully', () => {
            expect(applyWeight('term', NaN)).toBe('term');
            // Infinity returns unchanged term (not clamped) per implementation
            expect(applyWeight('term', Infinity)).toBe('term');
        });
    });

    describe('parseWeightedTerms', () => {
        it('should extract weighted terms from prompt', () => {
            const result = parseWeightedTerms('(subject:1.20), style, (background:0.80)');
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ term: 'subject', weight: 1.20 });
            expect(result[1]).toEqual({ term: 'background', weight: 0.80 });
        });

        it('should return empty array for prompts without weights', () => {
            expect(parseWeightedTerms('subject, style, background')).toEqual([]);
        });

        it('should handle various weight formats', () => {
            const result = parseWeightedTerms('(a:1), (b:1.0), (c:0.5), (d:1.25)');
            expect(result).toHaveLength(4);
            expect(result[0]?.weight).toBe(1);
            expect(result[1]?.weight).toBe(1.0);
            expect(result[2]?.weight).toBe(0.5);
            expect(result[3]?.weight).toBe(1.25);
        });
    });

    describe('WEIGHTING_PRESETS', () => {
        it('should have balanced preset with all weights = 1.0', () => {
            expect(WEIGHTING_PRESETS.balanced).toBeDefined();
            expect(WEIGHTING_PRESETS.balanced.subject).toBe(1.0);
            expect(WEIGHTING_PRESETS.balanced.character).toBe(1.0);
            expect(WEIGHTING_PRESETS.balanced.style).toBe(1.0);
            expect(WEIGHTING_PRESETS.balanced.background).toBe(1.0);
        });

        it('should have subjectEmphasis preset with elevated subject/character weights', () => {
            expect(WEIGHTING_PRESETS.subjectEmphasis).toBeDefined();
            expect(WEIGHTING_PRESETS.subjectEmphasis.summary).toBeGreaterThan(1);
            expect(WEIGHTING_PRESETS.subjectEmphasis.characters).toBeGreaterThan(1);
            expect(WEIGHTING_PRESETS.subjectEmphasis.background).toBeLessThan(1);
        });

        it('should have styleEmphasis preset with elevated style weights', () => {
            expect(WEIGHTING_PRESETS.styleEmphasis).toBeDefined();
            expect(WEIGHTING_PRESETS.styleEmphasis.style).toBeGreaterThan(1);
            expect(WEIGHTING_PRESETS.styleEmphasis.technical).toBeGreaterThan(1);
        });

        it('should have background weight in all presets', () => {
            expect(WEIGHTING_PRESETS.balanced.background).toBeDefined();
            expect(WEIGHTING_PRESETS.subjectEmphasis.background).toBeDefined();
            expect(WEIGHTING_PRESETS.styleEmphasis.background).toBeDefined();
        });
    });

    describe('isWeightingSupported', () => {
        it('should return true for comfyui provider', () => {
            expect(isWeightingSupported('comfyui')).toBe(true);
        });

        it('should return false for gemini provider', () => {
            expect(isWeightingSupported('gemini')).toBe(false);
        });
    });

    describe('Weight constants', () => {
        it('should define safe weight range', () => {
            expect(WEIGHT_MIN).toBe(0.1);
            expect(WEIGHT_MAX).toBe(2.0);
        });
    });

    describe('getWeightingPreset', () => {
        it('should return balanced preset by default when no name provided', () => {
            const preset = getWeightingPreset();
            expect(preset).toEqual(WEIGHTING_PRESETS.balanced);
        });

        it('should return balanced preset for undefined input', () => {
            const preset = getWeightingPreset(undefined);
            expect(preset).toEqual(WEIGHTING_PRESETS.balanced);
        });

        it('should return requested preset when valid', () => {
            expect(getWeightingPreset('balanced')).toEqual(WEIGHTING_PRESETS.balanced);
            expect(getWeightingPreset('subjectEmphasis')).toEqual(WEIGHTING_PRESETS.subjectEmphasis);
            expect(getWeightingPreset('styleEmphasis')).toEqual(WEIGHTING_PRESETS.styleEmphasis);
        });

        it('should fall back to balanced and warn for unknown preset', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            // @ts-expect-error - testing invalid input
            const preset = getWeightingPreset('unknownPreset');
            
            expect(preset).toEqual(WEIGHTING_PRESETS.balanced);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unknown preset "unknownPreset"')
            );
            
            warnSpy.mockRestore();
        });
    });

    describe('DEFAULT_WEIGHTING_PRESET', () => {
        it('should be balanced', () => {
            expect(DEFAULT_WEIGHTING_PRESET).toBe('balanced');
        });
    });
});
