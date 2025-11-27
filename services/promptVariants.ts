import {
    ENHANCED_NEGATIVE_SET,
    QUALITY_PREFIX_CONFIGS,
    type QualityPrefixVariant,
} from './promptConstants';
import { WEIGHTING_PRESETS } from './promptWeighting';

/**
 * Configuration for prompt structure and ordering.
 */
export interface PromptStructureConfig {
    /** Place subject/action first (highest token weight position) */
    subjectFirst: boolean;
    /** Where to place character descriptors */
    characterPlacement: 'early' | 'middle' | 'late';
    /** Where to place quality boosters */
    qualityPlacement: 'prefix' | 'suffix';
    /** Include instructional preamble (legacy behavior) */
    includeInstructions: boolean;
}

/**
 * Full variant configuration for A/B testing.
 */
export interface PromptVariantConfig {
    /** Quality prefix preset to use */
    qualityPreset: QualityPrefixVariant;
    /** Prompt structure configuration */
    structure: PromptStructureConfig;
    /** Negative prompt categories to include */
    negativeCategories: ('quality' | 'anatomy' | 'composition')[];
    /** Enable prompt weighting for compatible providers */
    weightingEnabled: boolean;
    /** Weighting preset to apply */
    weightingPreset: keyof typeof WEIGHTING_PRESETS | 'balanced';
}

export interface PromptVariant {
    id: string;
    label: string;
    description?: string;
    weight?: number;
    /** Full configuration for this variant */
    config?: PromptVariantConfig;
}

// ============================================================================
// Predefined Variants
// ============================================================================

/**
 * Control variant: Current production prompts for baseline comparison.
 * Uses legacy quality prefix, includes instructional preamble, no weighting.
 */
export const CONTROL_VARIANT: PromptVariant = {
    id: 'control',
    label: 'Control (Legacy)',
    description: 'Current production prompts for baseline A/B comparison',
    weight: 1,
    config: {
        qualityPreset: 'legacy',
        structure: {
            subjectFirst: false,
            characterPlacement: 'middle',
            qualityPlacement: 'prefix',
            includeInstructions: true,
        },
        negativeCategories: ['quality'],
        weightingEnabled: false,
        weightingPreset: 'balanced',
    },
};

/**
 * Optimized variant: Research-backed improvements.
 * Uses subject-first ordering, enhanced negatives, optional weighting.
 */
export const OPTIMIZED_VARIANT: PromptVariant = {
    id: 'optimized',
    label: 'Optimized (Subject-First)',
    description: 'Subject-first ordering with enhanced negatives and cinematic quality',
    weight: 1,
    config: {
        qualityPreset: 'optimized',
        structure: {
            subjectFirst: true,
            characterPlacement: 'early',
            qualityPlacement: 'suffix',
            includeInstructions: false,
        },
        negativeCategories: ['quality', 'anatomy', 'composition'],
        weightingEnabled: true,
        weightingPreset: 'subjectEmphasis',
    },
};

/**
 * Style-emphasis variant: Prioritizes style consistency.
 * Good for maintaining director's vision across shots.
 */
export const STYLE_EMPHASIS_VARIANT: PromptVariant = {
    id: 'style-emphasis',
    label: 'Style Emphasis',
    description: 'Prioritizes style consistency across shots',
    weight: 0.5,
    config: {
        qualityPreset: 'optimized',
        structure: {
            subjectFirst: true,
            characterPlacement: 'middle',
            qualityPlacement: 'suffix',
            includeInstructions: false,
        },
        negativeCategories: ['quality', 'anatomy', 'composition'],
        weightingEnabled: true,
        weightingPreset: 'styleEmphasis',
    },
};

/**
 * Predefined prompt variants for A/B testing.
 * Control vs Optimized with 50/50 split by default.
 */
export const PROMPT_VARIANTS: PromptVariant[] = [
    CONTROL_VARIANT,
    OPTIMIZED_VARIANT,
];

/**
 * All available variants including experimental ones.
 */
export const ALL_VARIANTS: PromptVariant[] = [
    CONTROL_VARIANT,
    OPTIMIZED_VARIANT,
    STYLE_EMPHASIS_VARIANT,
];

/**
 * Get negative prompt terms for a variant config.
 */
export const getNegativesForVariant = (config: PromptVariantConfig): string[] => {
    const negatives: string[] = [];
    for (const category of config.negativeCategories) {
        negatives.push(...ENHANCED_NEGATIVE_SET[category]);
    }
    return [...new Set(negatives)];
};

/**
 * Get quality prefix config for a variant.
 */
export const getQualityConfigForVariant = (config: PromptVariantConfig) => {
    return QUALITY_PREFIX_CONFIGS[config.qualityPreset];
};

export interface VariantSelection<T extends PromptVariant = PromptVariant> {
    variant: T;
    variantId: string;
    metadata: { promptVariantId: string; promptVariantLabel?: string };
}

export const getVariantById = <T extends PromptVariant>(
    variants: T[],
    id: string
): T | undefined => variants.find(variant => variant.id === id);

/**
 * Weighted random selection for A/B prompt variants.
 * Default behavior is unbiased Math.random with weight fallback of 1.
 */
export const selectVariant = <T extends PromptVariant>(
    variants: T[],
    options: { rng?: () => number } = {}
): VariantSelection<T> => {
    if (!variants.length) {
        throw new Error('No prompt variants provided');
    }

    const weights = variants.map(v => Math.max(0, v.weight ?? 1));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || variants.length;
    const roll = (options.rng ? options.rng() : Math.random()) * totalWeight;

    let cursor = 0;
    let selected = variants[0];
    for (let i = 0; i < variants.length; i++) {
        cursor += weights[i];
        if (roll <= cursor) {
            selected = variants[i];
            break;
        }
    }

    return {
        variant: selected,
        variantId: selected.id,
        metadata: {
            promptVariantId: selected.id,
            promptVariantLabel: selected.label,
        },
    };
};

export const withVariantMetadata = <T extends Record<string, unknown>>(
    metadata: T | undefined,
    selection: VariantSelection
): T & { promptVariantId: string; promptVariantLabel?: string } => ({
    ...(metadata || ({} as T)),
    promptVariantId: selection.variantId,
    promptVariantLabel: selection.variant.label,
});
