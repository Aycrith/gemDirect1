import { describe, expect, it } from 'vitest';
import { ENHANCED_NEGATIVE_SET, getNegativePreset } from '../promptConstants';
import { buildSceneKeyframePrompt } from '../promptPipeline';
import { applyWeight, parseWeightedTerms } from '../promptWeighting';
import { getVariantById, selectVariant, withVariantMetadata, type PromptVariant } from '../promptVariants';
import type { Scene, StoryBibleV2 } from '../../types';

const createScene = (): Scene => ({
    id: 'scene-1',
    title: 'Showdown',
    summary: 'Avery confronts Rhea in the neon alley.',
    timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
});

const createBible = (): StoryBibleV2 => ({
    version: '2.0',
    logline: 'A hacker battles a rogue AI in a neon city.',
    characters: '',
    setting: '',
    plotOutline: '',
    characterProfiles: [
        {
            id: 'char-1',
            name: 'Avery',
            age: '29',
            appearance: { height: 'tall', build: 'athletic', hair: 'short', eyes: 'amber' },
            personality: ['determined'],
            backstory: 'Streetwise hacker.',
            motivations: ['protect her city'],
            relationships: [],
            visualDescriptor: 'Avery, athletic hacker in a neon jacket',
            role: 'protagonist',
        },
        {
            id: 'char-2',
            name: 'Rhea',
            age: '32',
            appearance: { build: 'sleek', hair: 'silver bob', eyes: 'blue' },
            personality: ['cold'],
            backstory: 'Rogue AI avatar.',
            motivations: ['control the grid'],
            relationships: [],
            visualDescriptor: 'Rhea, sleek AI avatar with silver bob',
            role: 'antagonist',
        },
    ],
    plotScenes: [],
});

describe('prompt optimization', () => {
    it('builds provider-specific enhanced negatives', () => {
        expect(ENHANCED_NEGATIVE_SET.quality.length).toBeGreaterThan(0);
        expect(ENHANCED_NEGATIVE_SET.anatomy.length).toBeGreaterThan(0);
        expect(ENHANCED_NEGATIVE_SET.composition.length).toBeGreaterThan(0);

        const comfyEnhanced = getNegativePreset('comfyui', true);
        const geminiEnhanced = getNegativePreset('gemini', true);

        expect(comfyEnhanced).toContain('embedding:EasyNegative');
        expect(geminiEnhanced).not.toContain('embedding:EasyNegative');
        expect(ENHANCED_NEGATIVE_SET.anatomy.every(term => comfyEnhanced.includes(term))).toBe(true);
    });

    it('builds subject-first prompts when flag is enabled', () => {
        const prompt = buildSceneKeyframePrompt(
            createScene(),
            createBible(),
            'noir neon lighting',
            [],
            {
                flags: {
                    subjectFirstPrompts: true,
                    enhancedNegativePrompts: true,
                    promptWeighting: true,
                    qualityPrefixVariant: 'optimized',
                },
            }
        );

        const positive = prompt.separateFormat.positive;
        const summaryIndex = positive.indexOf('Avery confronts Rhea in the neon alley.');
        const styleIndex = positive.indexOf('noir neon lighting');
        expect(summaryIndex).toBeGreaterThan(-1);
        expect(styleIndex).toBeGreaterThan(summaryIndex);
        expect(prompt.separateFormat.negative).toContain('bad anatomy');
        expect(prompt.separateFormat.negative).toContain('embedding:EasyNegative');
    });

    it('applies and parses weighting syntax', () => {
        const weighted = applyWeight('hero focus', 1.2);
        expect(weighted).toBe('(hero focus:1.20)');
        const parsed = parseWeightedTerms(`Scene: ${weighted}, (style:0.95)`);
        expect(parsed).toContainEqual({ term: 'hero focus', weight: 1.2 });
        expect(parsed).toContainEqual({ term: 'style', weight: 0.95 });
    });

    it('selects weighted variants and preserves metadata', () => {
        const variants: PromptVariant[] = [
            { id: 'control', label: 'Control', weight: 1 },
            { id: 'optimized', label: 'Optimized', weight: 3 },
        ];
        const rngValues = [0.1, 0.3, 0.6, 0.9];
        let i = 0;
        const rng = (): number => {
            const value = rngValues[i % rngValues.length] ?? 0;
            i += 1;
            return value;
        };

        const counts = { control: 0, optimized: 0 };
        for (let run = 0; run < 100; run++) {
            const selection = selectVariant(variants, { rng });
            counts[selection.variantId as keyof typeof counts] += 1;
            const metadata = withVariantMetadata({}, selection);
            expect(metadata.promptVariantId).toBe(selection.variantId);
        }

        expect(counts.optimized).toBeGreaterThan(counts.control);
        expect(getVariantById(variants, 'optimized')?.label).toBe('Optimized');
    });
});
