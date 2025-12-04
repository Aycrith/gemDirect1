import { DEFAULT_GEMINI_NEGATIVES } from './geminiService';

export type ProviderId = 'gemini' | 'comfyui';
export type QualityPrefixVariant = 'legacy' | 'optimized';

export interface QualityPrefixConfig {
    id: QualityPrefixVariant;
    /** Positive prompt tokens that bias toward higher quality */
    positivePrefix: string[];
    /** Negative prompt tokens paired with the prefix to suppress artifacts */
    negativePrefix: string[];
    /** Technical camera or rendering directives appended after style */
    technicalDirectives: string[];
    /** Quality-oriented suffix applied at the end of the prompt */
    qualitySuffix: string[];
}

/**
 * Enhanced negative prompt set grouped by failure mode.
 * Used to compose provider-specific presets without duplicating strings.
 * 
 * Categories:
 * - quality: General quality issues (lowres, blurry, etc.)
 * - anatomy: Human body/face deformities
 * - composition: Framing and layout issues
 * - text_artifacts: Unwanted text, watermarks, logos
 * - depth: Perspective and depth issues
 * - motion: Video/animation artifacts
 * - style_contamination: Unwanted art styles (use selectively)
 * - quality_tiers: SD training data quality markers
 */
export const ENHANCED_NEGATIVE_SET = {
    quality: [
        'lowres',
        'worst quality',
        'bad quality',
        'low quality',
        'blurry',
        'grainy',
        'washed out',
        'overexposed',
        'underexposed',
        'desaturated',
        'oversaturated',
        'flat lighting',
        'muted colors',
    ],
    anatomy: [
        'bad anatomy',
        'deformed',
        'disfigured',
        'mangled hands',
        'mutated hands',
        'poorly drawn hands',
        'poorly drawn face',
        'extra limbs',
        'extra fingers',
        'missing fingers',
        'long neck',
        'cross-eye',
    ],
    composition: [
        'cropped',
        'cut off',
        'out of frame',
        'duplicate subject',
        'busy background',
        'text overlay',
        'logo',
        'watermark',
        'frame',
        'border',
        'tiling',
        'centered composition',
    ],
    // NEW: Text artifacts (critical for clean images)
    text_artifacts: [
        'text',
        'watermark',
        'logo',
        'signature',
        'username',
        'copyright',
        'caption',
        'subtitle',
        'credits',
        'stock photo',
    ],
    // NEW: Depth and perspective issues
    depth: [
        'flat composition',
        'no depth',
        'incorrect perspective',
        'fisheye distortion',
        'lens distortion',
        'flat lighting',
    ],
    // NEW: Motion artifacts (critical for video)
    motion: [
        'static pose',
        'frozen movement',
        'motion blur artifacts',
        'ghosting',
        'stuttering',
        'temporal inconsistency',
        'flickering',
    ],
    // NEW: Style contamination (use selectively - may conflict with desired style)
    style_contamination: [
        'cartoon',
        'anime',
        'illustration',
        'sketch',
        'drawing',
        'painting',
        'abstract',
        'surreal',
        'CGI',
    ],
    // NEW: Quality tiers from SD training data
    quality_tiers: [
        'worst quality',
        'low quality',
        'normal quality',
        'jpeg artifacts',
        'compression artifacts',
        'pixelated',
        'noise',
        'banding',
    ],
} as const;

/**
 * Get all terms from specified categories, with deduplication.
 * @param categories - Array of category keys to include
 * @returns Deduplicated array of negative terms
 */
export function getNegativeTermsFromCategories(
    categories: (keyof typeof ENHANCED_NEGATIVE_SET)[]
): string[] {
    const allTerms: string[] = [];
    for (const cat of categories) {
        if (ENHANCED_NEGATIVE_SET[cat]) {
            allTerms.push(...ENHANCED_NEGATIVE_SET[cat]);
        }
    }
    // Deduplicate using Set (first occurrence wins)
    return Array.from(new Set(allTerms));
}

/**
 * Quality prefix presets used to append or suffix quality/technical hints.
 * The optimized variant leans cinematic; legacy matches current defaults.
 */
export const QUALITY_PREFIX_CONFIGS: Record<QualityPrefixVariant, QualityPrefixConfig> = {
    legacy: {
        id: 'legacy',
        positivePrefix: ['masterpiece', 'highly detailed', 'sharp focus'],
        negativePrefix: ['lowres', 'worst quality', 'jpeg artifacts'],
        technicalDirectives: ['16:9 aspect ratio', 'studio lighting'],
        qualitySuffix: ['8k uhd', 'depth of field'],
    },
    optimized: {
        id: 'optimized',
        positivePrefix: [
            'cinematic lighting',
            'photorealistic',
            'award-winning composition',
            'rich color grading',
        ],
        negativePrefix: ['lowres', 'motion blur', 'bad anatomy'],
        technicalDirectives: [
            'sharp focus',
            'global illumination',
            'high dynamic range',
            'volumetric lighting',
            '16:9 aspect ratio',
        ],
        qualitySuffix: ['shot on arri alexa 35', 'pro cinematic still', 'depth of field'],
    },
};

export interface ProviderConfig {
    id: ProviderId;
    negatives: {
        legacy: string[];
        enhanced: string[];
    };
    qualityPreset: QualityPrefixVariant;
    supportsPromptWeighting: boolean;
}

const COMFYUI_BASE_NEGATIVES = [
    'blurry',
    'low-resolution',
    'watermark',
    'text',
    'bad anatomy',
    'distorted',
    'unrealistic',
    'oversaturated',
    'undersaturated',
    'motion blur',
];

/**
 * Create enhanced negative set by merging base negatives with all ENHANCED_NEGATIVE_SET categories.
 * Uses Set for deduplication (first occurrence wins, preserves base negatives priority).
 * 
 * IMPORTANT: Motion artifacts are included by default for video pipeline quality.
 */
const makeEnhanced = (base: string[]): string[] => {
    const merged = [
        ...base,
        ...ENHANCED_NEGATIVE_SET.quality,
        ...ENHANCED_NEGATIVE_SET.anatomy,
        ...ENHANCED_NEGATIVE_SET.composition,
        ...ENHANCED_NEGATIVE_SET.text_artifacts,
        ...ENHANCED_NEGATIVE_SET.depth,
        ...ENHANCED_NEGATIVE_SET.motion, // CRITICAL: Always include motion artifacts for video quality
        // Note: style_contamination excluded by default (may conflict with desired styles)
        // Note: quality_tiers has overlap with quality category (deduplicated below)
        ...ENHANCED_NEGATIVE_SET.quality_tiers,
    ];
    return Array.from(new Set(merged));
};

export const PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
    gemini: {
        id: 'gemini',
        negatives: {
            legacy: DEFAULT_GEMINI_NEGATIVES,
            enhanced: makeEnhanced(DEFAULT_GEMINI_NEGATIVES),
        },
        qualityPreset: 'legacy',
        supportsPromptWeighting: false,
    },
    comfyui: {
        id: 'comfyui',
        negatives: {
            legacy: COMFYUI_BASE_NEGATIVES,
            enhanced: Array.from(
                new Set([
                    ...makeEnhanced(COMFYUI_BASE_NEGATIVES),
                    'embedding:EasyNegative',
                    'embedding:bad-hands-5',
                ])
            ),
        },
        qualityPreset: 'optimized',
        supportsPromptWeighting: true,
    },
};

export const getNegativePreset = (provider: ProviderId, useEnhanced: boolean): string[] => {
    const config = PROVIDER_CONFIGS[provider];
    return useEnhanced ? config.negatives.enhanced : config.negatives.legacy;
};

export const getQualityConfig = (
    variant: QualityPrefixVariant = 'legacy'
): QualityPrefixConfig => QUALITY_PREFIX_CONFIGS[variant];
