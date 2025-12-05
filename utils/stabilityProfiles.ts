/**
 * Stability Profiles for Temporal Coherence Features
 * 
 * Provides named presets that bundle temporal coherence feature flags into
 * easy-to-select configurations. Users can pick a profile for their use case
 * without manually configuring individual flags.
 * 
 * Profile Philosophy:
 * - Fast: Maximum speed, no temporal processing (quick iteration)
 * - Standard: Balanced quality with modest deflicker (production default)
 * - Cinematic: Full temporal coherence stack for highest quality output
 * 
 * Based on Phase 5-6 temporal coherence validation results and Vision QA baselines.
 * 
 * @module utils/stabilityProfiles
 */

import type { FeatureFlags } from './featureFlags';

/**
 * Stability profile identifier
 */
export type StabilityProfileId = 'fast' | 'standard' | 'cinematic' | 'custom';

/**
 * Stability profile definition
 */
export interface StabilityProfile {
    /** Unique profile identifier */
    id: StabilityProfileId;
    /** Human-readable label for UI */
    label: string;
    /** Description of the profile's intended use */
    description: string;
    /** Feature flags to apply when this profile is selected */
    featureFlags: Partial<FeatureFlags>;
    /** Performance characteristics */
    performance: {
        /** Estimated generation time multiplier (1.0 = baseline) */
        timeMultiplier: number;
        /** Estimated VRAM usage category */
        vramUsage: 'low' | 'medium' | 'high';
    };
    /** Quality characteristics from Vision QA validation */
    quality: {
        /** Temporal consistency improvement estimate */
        temporalConsistency: 'baseline' | 'improved' | 'best';
        /** Identity drift mitigation */
        identityStability: 'baseline' | 'improved' | 'best';
    };
}

/**
 * Fast profile: Maximum speed, no temporal processing
 * 
 * Use when:
 * - Quick iteration during development
 * - Testing prompt/keyframe variations
 * - VRAM-constrained environments
 * 
 * Vision QA Baseline: 7 PASS, 1 WARN, 0 FAIL (2025-12-04)
 */
export const FAST_PROFILE: StabilityProfile = {
    id: 'fast',
    label: 'Fast',
    description: 'Maximum speed, no temporal processing. Best for quick iteration.',
    featureFlags: {
        videoDeflicker: false,
        deflickerStrength: 0.35,
        deflickerWindowSize: 3,
        ipAdapterReferenceConditioning: false,
        ipAdapterWeight: 0.4,
        promptScheduling: false,
        promptTransitionFrames: 8,
    },
    performance: {
        timeMultiplier: 1.0,
        vramUsage: 'low',
    },
    quality: {
        temporalConsistency: 'baseline',
        identityStability: 'baseline',
    },
};

/**
 * Standard profile: Balanced quality with deflicker
 * 
 * Use when:
 * - Production-ready output with reasonable generation time
 * - General-purpose video generation
 * - Moderate VRAM availability
 * 
 * Enables deflicker post-processing for smoother output without
 * the overhead of IP-Adapter or prompt scheduling.
 */
export const STANDARD_PROFILE: StabilityProfile = {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced quality with deflicker. Good for general production.',
    featureFlags: {
        videoDeflicker: true,
        deflickerStrength: 0.35,
        deflickerWindowSize: 3,
        ipAdapterReferenceConditioning: false,
        ipAdapterWeight: 0.4,
        promptScheduling: false,
        promptTransitionFrames: 8,
    },
    performance: {
        timeMultiplier: 1.1,
        vramUsage: 'medium',
    },
    quality: {
        temporalConsistency: 'improved',
        identityStability: 'baseline',
    },
};

/**
 * Cinematic profile: Full temporal coherence stack
 * 
 * Use when:
 * - Maximum quality output is priority
 * - Identity/character consistency is critical
 * - Scene transitions need smooth blending
 * - Adequate VRAM and generation time are available
 * 
 * Enables all temporal coherence features:
 * - Deflicker for frame smoothness
 * - IP-Adapter for identity/style stability
 * - Prompt scheduling for transition blending
 */
export const CINEMATIC_PROFILE: StabilityProfile = {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Full temporal coherence stack. Best quality for final output.',
    featureFlags: {
        videoDeflicker: true,
        deflickerStrength: 0.4,
        deflickerWindowSize: 5,
        ipAdapterReferenceConditioning: true,
        ipAdapterWeight: 0.5,
        promptScheduling: true,
        promptTransitionFrames: 12,
    },
    performance: {
        timeMultiplier: 1.4,
        vramUsage: 'high',
    },
    quality: {
        temporalConsistency: 'best',
        identityStability: 'best',
    },
};

/**
 * Custom profile placeholder (user has manually modified flags)
 */
export const CUSTOM_PROFILE: StabilityProfile = {
    id: 'custom',
    label: 'Custom',
    description: 'User-configured settings. Modified from a preset.',
    featureFlags: {},
    performance: {
        timeMultiplier: 1.0,
        vramUsage: 'medium',
    },
    quality: {
        temporalConsistency: 'baseline',
        identityStability: 'baseline',
    },
};

/**
 * All available stability profiles
 */
export const STABILITY_PROFILES: Record<StabilityProfileId, StabilityProfile> = {
    fast: FAST_PROFILE,
    standard: STANDARD_PROFILE,
    cinematic: CINEMATIC_PROFILE,
    custom: CUSTOM_PROFILE,
};

/**
 * Ordered list for UI rendering
 */
export const STABILITY_PROFILE_LIST: StabilityProfile[] = [
    FAST_PROFILE,
    STANDARD_PROFILE,
    CINEMATIC_PROFILE,
];

/**
 * Temporal coherence flag keys that are controlled by stability profiles
 */
export const TEMPORAL_COHERENCE_FLAGS: (keyof FeatureFlags)[] = [
    'videoDeflicker',
    'deflickerStrength',
    'deflickerWindowSize',
    'ipAdapterReferenceConditioning',
    'ipAdapterWeight',
    'promptScheduling',
    'promptTransitionFrames',
];

/**
 * Apply a stability profile to existing feature flags
 * 
 * Merges the profile's temporal coherence flags into the existing flags,
 * preserving any non-temporal flags that were previously set.
 * 
 * @param existingFlags Current feature flags
 * @param profileId Profile to apply
 * @returns Merged feature flags with profile applied
 */
export function applyStabilityProfile(
    existingFlags: Partial<FeatureFlags>,
    profileId: StabilityProfileId
): Partial<FeatureFlags> {
    const profile = STABILITY_PROFILES[profileId];
    if (!profile || profileId === 'custom') {
        // Custom profile doesn't modify flags
        return existingFlags;
    }
    
    return {
        ...existingFlags,
        ...profile.featureFlags,
    };
}

/**
 * Detect which stability profile matches the current flag configuration
 * 
 * Compares current temporal coherence flags against each profile's
 * settings to determine if a preset matches exactly.
 * 
 * @param currentFlags Current feature flags
 * @returns The matching profile ID, or 'custom' if no preset matches
 */
export function detectCurrentProfile(
    currentFlags: Partial<FeatureFlags>
): StabilityProfileId {
    // Check each preset profile (not custom)
    for (const profile of STABILITY_PROFILE_LIST) {
        if (profileMatchesFlags(profile, currentFlags)) {
            return profile.id;
        }
    }
    
    // No preset matches - user has customized settings
    return 'custom';
}

/**
 * Check if a profile's flags match the current configuration
 */
function profileMatchesFlags(
    profile: StabilityProfile,
    currentFlags: Partial<FeatureFlags>
): boolean {
    for (const flagKey of TEMPORAL_COHERENCE_FLAGS) {
        const profileValue = profile.featureFlags[flagKey];
        const currentValue = currentFlags[flagKey];
        
        // If the profile specifies this flag, it must match
        if (profileValue !== undefined && profileValue !== currentValue) {
            return false;
        }
    }
    
    return true;
}

/**
 * Get a human-readable summary of what a profile enables
 */
export function getProfileSummary(profileId: StabilityProfileId): string {
    const profile = STABILITY_PROFILES[profileId];
    if (!profile) return 'Unknown profile';
    
    const features: string[] = [];
    
    if (profile.featureFlags.videoDeflicker) {
        features.push('Deflicker');
    }
    if (profile.featureFlags.ipAdapterReferenceConditioning) {
        features.push('IP-Adapter');
    }
    if (profile.featureFlags.promptScheduling) {
        features.push('Prompt Scheduling');
    }
    
    if (features.length === 0) {
        return 'No temporal processing';
    }
    
    return features.join(' + ');
}
