/**
 * Feature Flags System
 * 
 * Provides runtime feature toggling for gradual rollout of new capabilities.
 * All flags default to `false` for backward compatibility - existing projects
 * continue working unchanged.
 * 
 * Flags are stored in LocalGenerationSettings.featureFlags and persist to IndexedDB.
 * 
 * @module utils/featureFlags
 */

/**
 * Available feature flags
 * 
 * All flags are optional and default to false for backward compatibility.
 */
export interface FeatureFlags {
    /**
     * Enable bookend keyframe mode (start + end keyframes per scene)
     * Improves temporal consistency for longer shots
     * @default false
     */
    bookendKeyframes: boolean;

    /**
     * Enable video upscaling post-processing step
     * Uses WAN21_Video_Upscaler workflow after generation
     * @default false
     */
    videoUpscaling: boolean;

    /**
     * Enable character consistency cascade (CCC) workflow
     * Maintains character identity across scenes using embeddings
     * @default false
     */
    characterConsistency: boolean;

    /**
     * Enable shot-level transition context
     * Propagates visual continuity cues between shots (not just scenes)
     * @default false
     */
    shotLevelContinuity: boolean;

    /**
     * Auto-generate suggestions when continuity score drops below threshold
     * Triggers generateContinuitySuggestions automatically
     * @default false
     */
    autoSuggestions: boolean;

    /**
     * Enable narrative state machine tracking
     * Maintains character/location/arc state across generations
     * @default false
     */
    narrativeStateTracking: boolean;

    /**
     * Enable prompt template A/B testing
     * Allows comparing different prompt versions
     * @default false
     */
    promptABTesting: boolean;

    /**
     * Enable provider health polling
     * Periodically checks ComfyUI health and auto-fallback
     * @default false
     */
    providerHealthPolling: boolean;

    /**
     * Enable prompt quality gating
     * Blocks generation when prompt quality score is below threshold
     * @default false
     */
    promptQualityGate: boolean;

    /**
     * Enable character appearance tracking
     * Warns when characters are absent for extended periods
     * @default false
     */
    characterAppearanceTracking: boolean;
}

/**
 * Default feature flag values
 * All disabled by default for backward compatibility
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    bookendKeyframes: false,
    videoUpscaling: false,
    characterConsistency: false,
    shotLevelContinuity: false,
    autoSuggestions: false,
    narrativeStateTracking: false,
    promptABTesting: false,
    providerHealthPolling: false,
    promptQualityGate: false,
    characterAppearanceTracking: false,
};

/**
 * Feature flag metadata for UI display
 */
export interface FeatureFlagMeta {
    id: keyof FeatureFlags;
    label: string;
    description: string;
    category: 'quality' | 'workflow' | 'continuity' | 'experimental';
    stability: 'stable' | 'beta' | 'experimental';
    dependencies?: (keyof FeatureFlags)[];
}

/**
 * Metadata for all feature flags
 */
export const FEATURE_FLAG_META: Record<keyof FeatureFlags, FeatureFlagMeta> = {
    bookendKeyframes: {
        id: 'bookendKeyframes',
        label: 'Bookend Keyframes',
        description: 'Generate start and end keyframes for each scene to improve temporal consistency',
        category: 'workflow',
        stability: 'beta',
    },
    videoUpscaling: {
        id: 'videoUpscaling',
        label: 'Video Upscaling',
        description: 'Apply upscaler workflow as post-processing step after video generation',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['characterConsistency'], // May conflict if not sequenced properly
    },
    characterConsistency: {
        id: 'characterConsistency',
        label: 'Character Consistency',
        description: 'Use CCC workflow to maintain character identity across scenes',
        category: 'continuity',
        stability: 'experimental',
    },
    shotLevelContinuity: {
        id: 'shotLevelContinuity',
        label: 'Shot-Level Continuity',
        description: 'Propagate visual continuity cues between shots, not just scenes',
        category: 'continuity',
        stability: 'beta',
    },
    autoSuggestions: {
        id: 'autoSuggestions',
        label: 'Auto-Generate Suggestions',
        description: 'Automatically generate improvement suggestions when quality drops',
        category: 'quality',
        stability: 'stable',
    },
    narrativeStateTracking: {
        id: 'narrativeStateTracking',
        label: 'Narrative State Tracking',
        description: 'Track active characters, locations, and arc position across generations',
        category: 'continuity',
        stability: 'beta',
    },
    promptABTesting: {
        id: 'promptABTesting',
        label: 'Prompt A/B Testing',
        description: 'Compare different prompt template versions for quality optimization',
        category: 'experimental',
        stability: 'experimental',
    },
    providerHealthPolling: {
        id: 'providerHealthPolling',
        label: 'Provider Health Polling',
        description: 'Periodically check ComfyUI health and auto-fallback on failure',
        category: 'workflow',
        stability: 'stable',
    },
    promptQualityGate: {
        id: 'promptQualityGate',
        label: 'Prompt Quality Gate',
        description: 'Block generation when prompt quality score is below threshold',
        category: 'quality',
        stability: 'stable',
    },
    characterAppearanceTracking: {
        id: 'characterAppearanceTracking',
        label: 'Character Appearance Tracking',
        description: 'Warn when characters are absent from storyline for extended periods',
        category: 'continuity',
        stability: 'beta',
    },
};

/**
 * Get feature flag value with fallback to default
 */
export function getFeatureFlag(
    flags: Partial<FeatureFlags> | undefined,
    flag: keyof FeatureFlags
): boolean {
    return flags?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
}

/**
 * Check if a feature flag is enabled
 * Convenience function for common pattern
 */
export function isFeatureEnabled(
    flags: Partial<FeatureFlags> | undefined,
    flag: keyof FeatureFlags
): boolean {
    return getFeatureFlag(flags, flag) === true;
}

/**
 * Merge user flags with defaults
 */
export function mergeFeatureFlags(
    userFlags: Partial<FeatureFlags> | undefined
): FeatureFlags {
    return {
        ...DEFAULT_FEATURE_FLAGS,
        ...userFlags,
    };
}

/**
 * Get all enabled feature flags
 */
export function getEnabledFlags(
    flags: Partial<FeatureFlags> | undefined
): (keyof FeatureFlags)[] {
    const merged = mergeFeatureFlags(flags);
    return (Object.keys(merged) as (keyof FeatureFlags)[]).filter(
        key => merged[key] === true
    );
}

/**
 * Get flags grouped by category
 */
export function getFlagsByCategory(
    category: FeatureFlagMeta['category']
): FeatureFlagMeta[] {
    return Object.values(FEATURE_FLAG_META).filter(meta => meta.category === category);
}

/**
 * Check if flag dependencies are satisfied
 */
export function checkFlagDependencies(
    flags: Partial<FeatureFlags> | undefined,
    flag: keyof FeatureFlags
): { satisfied: boolean; missingDeps: (keyof FeatureFlags)[] } {
    const meta = FEATURE_FLAG_META[flag];
    if (!meta.dependencies || meta.dependencies.length === 0) {
        return { satisfied: true, missingDeps: [] };
    }

    const missingDeps = meta.dependencies.filter(
        dep => !isFeatureEnabled(flags, dep)
    );

    return {
        satisfied: missingDeps.length === 0,
        missingDeps,
    };
}

/**
 * Validate flag combination for conflicts
 */
export function validateFlagCombination(
    flags: Partial<FeatureFlags> | undefined
): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const merged = mergeFeatureFlags(flags);

    // Check for known conflicts
    if (merged.videoUpscaling && merged.characterConsistency) {
        warnings.push(
            'Video upscaling and character consistency are both enabled. ' +
            'Ensure workflow chain is properly sequenced to avoid conflicts.'
        );
    }

    if (merged.promptABTesting && !merged.promptQualityGate) {
        warnings.push(
            'Prompt A/B testing is enabled without quality gate. ' +
            'Consider enabling quality gate to measure improvement.'
        );
    }

    return {
        valid: true, // Warnings don't block, just inform
        warnings,
    };
}

/**
 * Create a feature flag change event for telemetry
 */
export function createFlagChangeEvent(
    flag: keyof FeatureFlags,
    oldValue: boolean,
    newValue: boolean
): {
    flag: string;
    oldValue: boolean;
    newValue: boolean;
    timestamp: number;
} {
    return {
        flag,
        oldValue,
        newValue,
        timestamp: Date.now(),
    };
}
