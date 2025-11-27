/**
 * Style Extractor Service
 * 
 * Extracts style terms from director's vision and scene descriptions.
 * Used to ensure style consistency across generated images/videos.
 * 
 * Design principles:
 * - Keep keyword list short and deterministic (no ML/fuzzy matching)
 * - Gate output behind feature flags to control token budget impact
 * - Focus on cinematic/photography terms that diffusion models understand
 * 
 * @module services/styleExtractor
 */

import { getFeatureFlagValue, type FeatureFlags, loadFeatureFlags } from '../utils/featureFlags';

// ============================================================================
// Constants
// ============================================================================

/**
 * Core style keywords that diffusion models reliably understand.
 * Kept intentionally short to avoid bloating token counts.
 * 
 * Categories:
 * - Cinematography: Camera and lighting terms
 * - Color grading: Color temperature and mood
 * - Era/Genre: Period and style references
 */
export const STYLE_KEYWORDS = {
    /** Cinematography and camera terms */
    cinematography: [
        'cinematic',
        'anamorphic',
        'wide angle',
        'shallow depth of field',
        'bokeh',
        'lens flare',
        'film grain',
    ],
    /** Lighting styles */
    lighting: [
        'dramatic lighting',
        'natural lighting',
        'golden hour',
        'blue hour',
        'high contrast',
        'low key',
        'high key',
        'rim lighting',
        'volumetric lighting',
    ],
    /** Color grading and mood */
    colorGrading: [
        'warm tones',
        'cool tones',
        'desaturated',
        'vibrant colors',
        'muted colors',
        'sepia',
        'monochrome',
    ],
    /** Visual style references */
    styleReferences: [
        'noir',
        'neo-noir',
        'cyberpunk',
        'steampunk',
        'vintage',
        'retro',
        'minimalist',
        'maximalist',
    ],
} as const;

/** All style keywords flattened for matching (exported for testing) */
export const ALL_STYLE_KEYWORDS = [
    ...STYLE_KEYWORDS.cinematography,
    ...STYLE_KEYWORDS.lighting,
    ...STYLE_KEYWORDS.colorGrading,
    ...STYLE_KEYWORDS.styleReferences,
];

/** Maximum number of style terms to extract (token budget control) */
export const MAX_EXTRACTED_TERMS = 5;

// ============================================================================
// Types
// ============================================================================

export interface StyleExtractionResult {
    /** Extracted style terms (up to MAX_EXTRACTED_TERMS) */
    terms: string[];
    /** Whether extraction was enabled by flags */
    enabled: boolean;
    /** Category breakdown of extracted terms */
    categories: {
        cinematography: string[];
        lighting: string[];
        colorGrading: string[];
        styleReferences: string[];
    };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extracts style terms from text using keyword matching.
 * 
 * Uses case-insensitive exact matching against STYLE_KEYWORDS.
 * Limited to MAX_EXTRACTED_TERMS to control token budget.
 * 
 * @param text - Text to extract style terms from (e.g., director's vision)
 * @param options - Extraction options
 * @returns Extracted style terms and metadata
 */
export function extractStyleTerms(
    text: string,
    options: {
        flags?: Partial<FeatureFlags>;
        /** Override max terms limit */
        maxTerms?: number;
    } = {}
): StyleExtractionResult {
    const mergedFlags = options.flags
        ? loadFeatureFlags(options.flags)
        : loadFeatureFlags();
    
    // Gate behind subjectFirstPrompts flag (style extraction is part of the optimization)
    const enabled = getFeatureFlagValue(mergedFlags, 'subjectFirstPrompts') === true;
    
    if (!enabled || !text?.trim()) {
        return {
            terms: [],
            enabled,
            categories: {
                cinematography: [],
                lighting: [],
                colorGrading: [],
                styleReferences: [],
            },
        };
    }
    
    const maxTerms = options.maxTerms ?? MAX_EXTRACTED_TERMS;
    const lowerText = text.toLowerCase();
    
    // Extract by category for detailed reporting
    const categories = {
        cinematography: matchKeywords(lowerText, STYLE_KEYWORDS.cinematography),
        lighting: matchKeywords(lowerText, STYLE_KEYWORDS.lighting),
        colorGrading: matchKeywords(lowerText, STYLE_KEYWORDS.colorGrading),
        styleReferences: matchKeywords(lowerText, STYLE_KEYWORDS.styleReferences),
    };
    
    // Flatten and limit
    const allMatched = [
        ...categories.cinematography,
        ...categories.lighting,
        ...categories.colorGrading,
        ...categories.styleReferences,
    ];
    
    // Deduplicate and limit
    const uniqueTerms = [...new Set(allMatched)].slice(0, maxTerms);
    
    return {
        terms: uniqueTerms,
        enabled,
        categories,
    };
}

/**
 * Matches keywords in text using case-insensitive word boundary matching.
 * 
 * @param lowerText - Lowercase text to search in
 * @param keywords - Keywords to search for (readonly array)
 * @returns Matched keywords (preserving original casing from STYLE_KEYWORDS)
 */
function matchKeywords(
    lowerText: string,
    keywords: readonly string[]
): string[] {
    const matched: string[] = [];
    
    for (const keyword of keywords) {
        // Use word boundary matching to avoid partial matches
        // e.g., "warm tones" shouldn't match "lukewarm tones"
        const pattern = new RegExp(`\\b${escapeRegex(keyword.toLowerCase())}\\b`);
        if (pattern.test(lowerText)) {
            matched.push(keyword);
        }
    }
    
    return matched;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats extracted style terms for prompt inclusion.
 * Returns empty string if no terms or extraction disabled.
 * 
 * @param result - Style extraction result
 * @returns Comma-separated style terms or empty string
 */
export function formatStyleTerms(result: StyleExtractionResult): string {
    if (!result.enabled || result.terms.length === 0) {
        return '';
    }
    return result.terms.join(', ');
}

/**
 * Convenience function to extract and format style terms in one call.
 * 
 * @param text - Text to extract style terms from
 * @param options - Extraction options
 * @returns Formatted style string (empty if disabled or no matches)
 */
export function extractAndFormatStyleTerms(
    text: string,
    options: { flags?: Partial<FeatureFlags>; maxTerms?: number } = {}
): string {
    const result = extractStyleTerms(text, options);
    return formatStyleTerms(result);
}
