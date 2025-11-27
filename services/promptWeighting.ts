import { PROVIDER_CONFIGS, type ProviderId } from './promptConstants';

export type WeightedTerm = { term: string; weight: number };

/** Type for weighting preset names */
export type WeightingPresetName = keyof typeof WEIGHTING_PRESETS;

/** Default weighting preset when none specified */
export const DEFAULT_WEIGHTING_PRESET: WeightingPresetName = 'balanced';

/**
 * Weighting presets for common emphasis patterns.
 * 
 * Available presets:
 * - balanced: No emphasis (all weights = 1.0), for baseline A/B testing
 * - subjectEmphasis: Prioritize subject and characters over background
 * - styleEmphasis: Prioritize style consistency and technical quality
 */
export const WEIGHTING_PRESETS = {
    /** Balanced preset: No weighting applied (baseline for A/B testing) */
    balanced: {
        summary: 1.0,
        characters: 1.0,
        subject: 1.0,
        character: 1.0,
        style: 1.0,
        technical: 1.0,
        background: 1.0,
    },
    /** Subject emphasis: Prioritize scene summary and characters */
    subjectEmphasis: {
        summary: 1.2,
        characters: 1.1,
        subject: 1.3,
        character: 1.2,
        style: 1.0,
        technical: 1.0,
        background: 0.8,
    },
    /** Style emphasis: Prioritize visual style consistency */
    styleEmphasis: {
        summary: 1.0,
        characters: 1.0,
        subject: 1.0,
        character: 1.0,
        style: 1.1,
        technical: 1.05,
        background: 0.9,
    },
};

/** Safe weight range for ComfyUI/SD models */
export const WEIGHT_MIN = 0.1;
export const WEIGHT_MAX = 2.0;

/**
 * Apply ComfyUI-style weighting syntax to a term.
 * Returns the original term when weight is falsy or equal to 1.
 * Clamps weights to safe range [0.1, 2.0] to prevent model instability.
 */
export const applyWeight = (term: string, weight: number): string => {
    if (!term.trim()) return term;
    if (!Number.isFinite(weight) || weight === 1) return term.trim();
    
    // Clamp to safe range
    let normalized = Number.parseFloat(weight.toFixed(2));
    if (normalized < WEIGHT_MIN || normalized > WEIGHT_MAX) {
        console.warn(
            `[promptWeighting] Weight ${weight} outside safe range [${WEIGHT_MIN}, ${WEIGHT_MAX}], clamping`
        );
        normalized = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, normalized));
    }
    
    return `(${term.trim()}:${normalized.toFixed(2)})`;
};

/**
 * Parse weighted terms from a prompt string.
 * Extracts (term:1.20) segments into structured data.
 */
export const parseWeightedTerms = (prompt: string): WeightedTerm[] => {
    const matches = Array.from(prompt.matchAll(/\(([^:()]+):\s*([0-9]*\.?[0-9]+)\)/g));
    return matches
        .map(match => ({
            term: match[1].trim(),
            weight: Number.parseFloat(match[2]),
        }))
        .filter(entry => entry.term.length > 0 && Number.isFinite(entry.weight));
};

export const isWeightingSupported = (provider: ProviderId): boolean =>
    PROVIDER_CONFIGS[provider]?.supportsPromptWeighting === true;

/**
 * Validates and retrieves a weighting preset by name.
 * Falls back to DEFAULT_WEIGHTING_PRESET if the requested preset doesn't exist.
 * 
 * @param presetName - Name of the preset to retrieve
 * @returns The preset weights (never undefined)
 */
export function getWeightingPreset(presetName?: WeightingPresetName): typeof WEIGHTING_PRESETS.balanced {
    if (!presetName) {
        return WEIGHTING_PRESETS[DEFAULT_WEIGHTING_PRESET];
    }
    
    if (!(presetName in WEIGHTING_PRESETS)) {
        console.warn(
            `[promptWeighting] Unknown preset "${presetName}", falling back to "${DEFAULT_WEIGHTING_PRESET}"`
        );
        return WEIGHTING_PRESETS[DEFAULT_WEIGHTING_PRESET];
    }
    
    return WEIGHTING_PRESETS[presetName];
}
