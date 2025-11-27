/**
 * @fileoverview Unit tests for prompt constants and negative prompt utilities.
 * Tests category coverage, deduplication, and flag-gated behavior.
 */

import { describe, it, expect } from 'vitest';
import { 
    ENHANCED_NEGATIVE_SET, 
    getNegativeTermsFromCategories,
    PROVIDER_CONFIGS,
    QUALITY_PREFIX_CONFIGS,
    getNegativePreset,
    getQualityConfig,
} from '../promptConstants';

describe('ENHANCED_NEGATIVE_SET', () => {
    describe('category coverage', () => {
        it('has all 8 required categories', () => {
            const expectedCategories = [
                'quality',
                'anatomy',
                'composition',
                'text_artifacts',
                'depth',
                'motion',
                'style_contamination',
                'quality_tiers',
            ];
            
            const actualCategories = Object.keys(ENHANCED_NEGATIVE_SET);
            
            for (const cat of expectedCategories) {
                expect(actualCategories).toContain(cat);
            }
            expect(actualCategories).toHaveLength(expectedCategories.length);
        });

        it('each category has at least 5 terms', () => {
            for (const [category, terms] of Object.entries(ENHANCED_NEGATIVE_SET)) {
                expect(terms.length, `${category} should have at least 5 terms`).toBeGreaterThanOrEqual(5);
            }
        });

        it('all terms are non-empty strings', () => {
            for (const [category, terms] of Object.entries(ENHANCED_NEGATIVE_SET)) {
                for (const term of terms) {
                    expect(typeof term).toBe('string');
                    expect(term.trim().length, `Empty term in ${category}`).toBeGreaterThan(0);
                }
            }
        });

        it('no duplicate terms within a category', () => {
            for (const [category, terms] of Object.entries(ENHANCED_NEGATIVE_SET)) {
                const uniqueTerms = new Set(terms.map((t: string) => t.toLowerCase()));
                expect(uniqueTerms.size, `Duplicates in ${category}`).toBe(terms.length);
            }
        });
    });

    describe('critical category content', () => {
        it('quality category contains essential terms', () => {
            const quality = ENHANCED_NEGATIVE_SET.quality;
            expect(quality).toContain('lowres');
            expect(quality).toContain('blurry');
            expect(quality).toContain('worst quality');
        });

        it('anatomy category contains hand terms (common AI failure)', () => {
            const anatomy = ENHANCED_NEGATIVE_SET.anatomy;
            expect(anatomy.some((t: string) => t.includes('hand'))).toBe(true);
            expect(anatomy.some((t: string) => t.includes('finger'))).toBe(true);
        });

        it('text_artifacts category contains watermark terms', () => {
            const textArtifacts = ENHANCED_NEGATIVE_SET.text_artifacts;
            expect(textArtifacts).toContain('watermark');
            expect(textArtifacts).toContain('logo');
            expect(textArtifacts).toContain('text');
        });

        it('motion category contains video-relevant terms', () => {
            const motion = ENHANCED_NEGATIVE_SET.motion;
            expect(motion).toContain('flickering');
            expect(motion.some((t: string) => t.includes('temporal'))).toBe(true);
        });
    });
});

describe('getNegativeTermsFromCategories', () => {
    it('returns all terms from a single category', () => {
        const result = getNegativeTermsFromCategories(['quality']);
        expect(result).toEqual(expect.arrayContaining([...ENHANCED_NEGATIVE_SET.quality]));
        expect(result.length).toBe(ENHANCED_NEGATIVE_SET.quality.length);
    });

    it('combines terms from multiple categories', () => {
        const result = getNegativeTermsFromCategories(['quality', 'anatomy']);
        const expectedLength = ENHANCED_NEGATIVE_SET.quality.length + ENHANCED_NEGATIVE_SET.anatomy.length;
        // May be less due to deduplication
        expect(result.length).toBeLessThanOrEqual(expectedLength);
        expect(result.length).toBeGreaterThan(0);
    });

    it('deduplicates cross-category terms', () => {
        // Both quality and quality_tiers have "worst quality" and "low quality"
        const result = getNegativeTermsFromCategories(['quality', 'quality_tiers']);
        const worstQualityCount = result.filter(t => t === 'worst quality').length;
        expect(worstQualityCount).toBe(1);
    });

    it('returns empty array for empty categories input', () => {
        const result = getNegativeTermsFromCategories([]);
        expect(result).toEqual([]);
    });

    it('handles invalid category gracefully', () => {
        // TypeScript should catch this, but runtime safety matters
        const result = getNegativeTermsFromCategories(['nonexistent' as keyof typeof ENHANCED_NEGATIVE_SET]);
        expect(result).toEqual([]);
    });

    it('preserves original term casing', () => {
        const result = getNegativeTermsFromCategories(['motion']);
        // Check that 'flickering' is lowercase as stored
        expect(result).toContain('flickering');
    });
});

describe('PROVIDER_CONFIGS', () => {
    it('has config for comfyui provider', () => {
        expect(PROVIDER_CONFIGS.comfyui).toBeDefined();
        expect(PROVIDER_CONFIGS.comfyui.negatives).toBeDefined();
        expect(PROVIDER_CONFIGS.comfyui.negatives.legacy).toBeDefined();
        expect(PROVIDER_CONFIGS.comfyui.negatives.enhanced).toBeDefined();
    });

    it('has config for gemini provider', () => {
        expect(PROVIDER_CONFIGS.gemini).toBeDefined();
        expect(PROVIDER_CONFIGS.gemini.negatives).toBeDefined();
        expect(PROVIDER_CONFIGS.gemini.negatives.legacy).toBeDefined();
        expect(PROVIDER_CONFIGS.gemini.negatives.enhanced).toBeDefined();
    });

    it('comfyui enhanced negatives include enhanced negative set', () => {
        const comfyNegatives = PROVIDER_CONFIGS.comfyui.negatives.enhanced;
        // Should include at least some terms from ENHANCED_NEGATIVE_SET.quality
        expect(comfyNegatives.some((n: string) => n.includes('lowres') || n.includes('quality'))).toBe(true);
    });

    it('comfyui supports prompt weighting', () => {
        expect(PROVIDER_CONFIGS.comfyui.supportsPromptWeighting).toBe(true);
    });

    it('gemini does not support prompt weighting', () => {
        expect(PROVIDER_CONFIGS.gemini.supportsPromptWeighting).toBe(false);
    });
});

describe('QUALITY_PREFIX_CONFIGS', () => {
    it('has legacy variant', () => {
        expect(QUALITY_PREFIX_CONFIGS.legacy).toBeDefined();
        expect(QUALITY_PREFIX_CONFIGS.legacy.positivePrefix).toBeDefined();
        expect(QUALITY_PREFIX_CONFIGS.legacy.negativePrefix).toBeDefined();
    });

    it('has optimized variant', () => {
        expect(QUALITY_PREFIX_CONFIGS.optimized).toBeDefined();
        expect(QUALITY_PREFIX_CONFIGS.optimized.positivePrefix).toBeDefined();
        expect(QUALITY_PREFIX_CONFIGS.optimized.negativePrefix).toBeDefined();
    });

    it('optimized variant has technical directives', () => {
        expect(QUALITY_PREFIX_CONFIGS.optimized.technicalDirectives).toBeDefined();
        expect(QUALITY_PREFIX_CONFIGS.optimized.technicalDirectives.length).toBeGreaterThan(0);
    });
});

describe('getNegativePreset', () => {
    it('returns legacy negatives when useEnhanced is false', () => {
        const result = getNegativePreset('comfyui', false);
        expect(result).toEqual(PROVIDER_CONFIGS.comfyui.negatives.legacy);
    });

    it('returns enhanced negatives when useEnhanced is true', () => {
        const result = getNegativePreset('comfyui', true);
        expect(result).toEqual(PROVIDER_CONFIGS.comfyui.negatives.enhanced);
    });

    it('enhanced has more terms than legacy', () => {
        const legacy = getNegativePreset('comfyui', false);
        const enhanced = getNegativePreset('comfyui', true);
        expect(enhanced.length).toBeGreaterThan(legacy.length);
    });
});

describe('getQualityConfig', () => {
    it('returns legacy config by default', () => {
        const result = getQualityConfig();
        expect(result.id).toBe('legacy');
    });

    it('returns optimized config when requested', () => {
        const result = getQualityConfig('optimized');
        expect(result.id).toBe('optimized');
    });

    it('optimized config has cinematic terms', () => {
        const result = getQualityConfig('optimized');
        expect(result.positivePrefix.some((t: string) => t.includes('cinematic'))).toBe(true);
    });
});

describe('cross-cutting concerns', () => {
    it('enhanced negatives are deduplicated', () => {
        const enhanced = PROVIDER_CONFIGS.comfyui.negatives.enhanced;
        const uniqueEnhanced = [...new Set(enhanced)];
        expect(enhanced.length).toBe(uniqueEnhanced.length);
    });

    it('no category contains terms that would suppress valid content', () => {
        // Check that style_contamination doesn't include legitimate styles
        const dangerousTerms = ['photorealistic', 'realistic', 'photography', 'cinematic'];
        for (const [category, terms] of Object.entries(ENHANCED_NEGATIVE_SET)) {
            const termsArray = terms as readonly string[];
            for (const dangerous of dangerousTerms) {
                expect(
                    termsArray.includes(dangerous),
                    `${category} contains potentially dangerous term "${dangerous}"`
                ).toBe(false);
            }
        }
    });

    it('comfyui enhanced includes embedding references', () => {
        const enhanced = PROVIDER_CONFIGS.comfyui.negatives.enhanced;
        expect(enhanced.some((t: string) => t.includes('embedding:'))).toBe(true);
    });

    /**
     * GUARD TEST: style_contamination is intentionally excluded from enhanced merge.
     * 
     * Rationale: Terms like "cartoon", "anime", "CGI" in style_contamination may
     * conflict with user's desired style. They must NOT be auto-merged.
     * 
     * This test fails if style_contamination terms start appearing in enhanced
     * negatives without an explicit opt-in mechanism.
     */
    it('style_contamination is NOT merged into enhanced negatives by default', () => {
        const enhanced = PROVIDER_CONFIGS.comfyui.negatives.enhanced;
        const styleContaminationTerms = ENHANCED_NEGATIVE_SET.style_contamination;
        
        // At least one style_contamination term should NOT be in enhanced
        // (If all terms were merged, this would fail)
        const excludedTerms = styleContaminationTerms.filter(
            (term: string) => !enhanced.includes(term)
        );
        
        expect(
            excludedTerms.length,
            'style_contamination should be excluded from enhanced merge. ' +
            'If you intentionally changed this, add an explicit opt-in flag first.'
        ).toBeGreaterThan(0);
    });

    it('documents the 8/8 categories defined, 7 merged behavior', () => {
        // All 8 categories exist
        expect(Object.keys(ENHANCED_NEGATIVE_SET)).toHaveLength(8);
        
        // 7 categories are merged (style_contamination excluded)
        const mergedCategories = [
            'quality', 'anatomy', 'composition', 'text_artifacts',
            'depth', 'motion', 'quality_tiers'
        ];
        const enhanced = PROVIDER_CONFIGS.comfyui.negatives.enhanced;
        
        for (const category of mergedCategories) {
            const categoryTerms = ENHANCED_NEGATIVE_SET[category as keyof typeof ENHANCED_NEGATIVE_SET];
            // At least one term from each merged category should appear
            const hasTermFromCategory = categoryTerms.some((term: string) => enhanced.includes(term));
            expect(hasTermFromCategory, `Category ${category} should be merged into enhanced`).toBe(true);
        }
    });
});
