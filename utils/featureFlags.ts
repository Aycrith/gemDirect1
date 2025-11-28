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
     * Show Bayesian A/B testing analytics panel
     * Displays probability comparisons between prompt variants
     * Can be disabled near release to simplify UI
     * @default false
     */
    showBayesianAnalytics: boolean;

    /**
     * Enable expanded, provider-specific negative prompt sets
     * @default false
     */
    enhancedNegativePrompts: boolean;

    /**
     * Use subject-first ordering when assembling prompts
     * @default false
     */
    subjectFirstPrompts: boolean;

    /**
     * Enable weighting syntax for providers that support it
     * @default false
     */
    promptWeighting: boolean;

    /**
     * Quality prefix preset to use when assembling prompts
     * @default 'legacy'
     */
    qualityPrefixVariant: 'legacy' | 'optimized';

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

    // ============================================================================
    // Pipeline Integration Flags (Phase 0 - Prompt Engineering Framework)
    // ============================================================================

    /**
     * Use V2 context assembly in scene list generation
     * @default false
     * @stability beta
     * @expires 2026-02-28
     */
    sceneListContextV2: boolean;

    /**
     * Use plotScene.actNumber for act mapping instead of heuristic
     * @default false
     * @stability beta
     * @expires 2026-02-28
     */
    actContextV2: boolean;

    /**
     * Use buildSceneKeyframePrompt assembler for keyframe generation
     * @default false
     * @stability beta
     * @expires 2026-02-28
     */
    keyframePromptPipeline: boolean;

    /**
     * Use assembler for video generation paths
     * @default false
     * @stability beta
     * @expires 2026-02-28
     */
    videoPromptPipeline: boolean;

    /**
     * Auto-sync Visual Bible descriptors on Story Bible save
     * @default false
     * @stability beta
     * @expires 2026-02-28
     */
    bibleV2SaveSync: boolean;

    /**
     * Scene summary validation enforcement mode
     * - 'off': No validation
     * - 'warn': Log warnings but don't block
     * - 'block': Block generation on validation failure
     * @default 'off'
     * @stability beta
     * @expires 2026-02-28
     */
    sceneListValidationMode: 'off' | 'warn' | 'block';

    /**
     * Token budget enforcement mode
     * - 'off': No enforcement
     * - 'warn': Log warnings but don't block
     * - 'block': Block generation on budget overflow
     * @default 'off'
     * @stability beta
     * @expires 2026-02-28
     */
    promptTokenGuard: 'off' | 'warn' | 'block';

    // ============================================================================
    // State Management Migration Flags (Phase 1 - State Overhaul)
    // ============================================================================

    /**
     * Use unified Zustand scene state store instead of scattered usePersistentState hooks.
     * When enabled, scene data flows through the centralized store with IndexedDB persistence.
     * @default false
     * @stability experimental
     * @expires 2026-03-31
     */
    useUnifiedSceneStore: boolean;

    /**
     * Run parallel store validation during migration period.
     * Compares old usePersistentState state with new Zustand store for consistency.
     * Only active when useUnifiedSceneStore is true.
     * @default false
     * @stability experimental
     * @expires 2026-03-31
     */
    sceneStoreParallelValidation: boolean;
}

/**
 * Default feature flag values
 * All disabled by default for backward compatibility
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    bookendKeyframes: true,  // Enabled: Native dual-keyframe workflows (WanFirstLastFrameToVideo, WanFunInpaintToVideo)
    videoUpscaling: false,
    characterConsistency: false,
    shotLevelContinuity: true,  // Enable shot-level continuity (Phase 7 integration complete)
    autoSuggestions: false,
    narrativeStateTracking: true,  // Enable narrative state tracking (Phase 7 integration complete)
    promptABTesting: false,
    showBayesianAnalytics: true,  // Enable Bayesian analytics panel (toggle off near release)
    enhancedNegativePrompts: true,  // Enable enhanced negative prompts (Phase 7 complete)
    subjectFirstPrompts: true,      // Enable subject-first prompt ordering (Phase 7 complete)
    promptWeighting: false,
    qualityPrefixVariant: 'legacy',
    providerHealthPolling: false,
    promptQualityGate: true,     // Enable prompt quality gating (Phase 1 Prompt Optimization)
    characterAppearanceTracking: false,
    // Pipeline Integration Flags (enabled for validation)
    sceneListContextV2: false,
    actContextV2: false,
    keyframePromptPipeline: true,  // Enable new keyframe pipeline
    videoPromptPipeline: true,     // Enable video prompt pipeline (Phase 1 Prompt Optimization)
    bibleV2SaveSync: true,         // Enable Visual Bible sync
    sceneListValidationMode: 'warn', // Log validation warnings
    promptTokenGuard: 'warn',      // Log token budget warnings
    // State Management Migration Flags (Phase 1C activation)
    useUnifiedSceneStore: true,    // Enable unified Zustand store (Phase 1C)
    sceneStoreParallelValidation: true, // Enable parallel store validation
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
    /** If true, flag is defined but implementation is not yet complete (Phase 7) */
    comingSoon?: boolean;
}

/**
 * Metadata for all feature flags
 */
export const FEATURE_FLAG_META: Record<keyof FeatureFlags, FeatureFlagMeta> = {
    bookendKeyframes: {
        id: 'bookendKeyframes',
        label: 'Bookend Keyframes',
        description: 'Generate start and end keyframes for each scene, using native dual-keyframe interpolation (WanFirstLastFrameToVideo) for smooth transitions',
        category: 'workflow',
        stability: 'beta',
        // Implemented: Native dual-keyframe workflows in comfyUIService.ts
    },
    videoUpscaling: {
        id: 'videoUpscaling',
        label: 'Video Upscaling',
        description: 'Apply upscaler workflow as post-processing step after video generation',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['characterConsistency'], // May conflict if not sequenced properly
        // Phase 7: Upscaler workflow implemented in videoUpscalingService.ts
    },
    characterConsistency: {
        id: 'characterConsistency',
        label: 'Character Consistency',
        description: 'Use IP-Adapter workflow to maintain character identity across scenes via Visual Bible reference images',
        category: 'continuity',
        stability: 'beta',
        // IP-Adapter integration implemented in services/ipAdapterService.ts
    },
    shotLevelContinuity: {
        id: 'shotLevelContinuity',
        label: 'Shot-Level Continuity',
        description: 'Propagate visual continuity cues between shots, not just scenes',
        category: 'continuity',
        stability: 'beta',
        // Phase 7: Shot-level continuity implemented in sceneTransitionService.ts + comfyUIService.ts
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
        // Implemented: narrativeCoherenceService.ts with full state machine (550+ lines, 41 tests)
    },
    promptABTesting: {
        id: 'promptABTesting',
        label: 'Prompt A/B Testing',
        description: 'Compare different prompt template versions for quality optimization',
        category: 'experimental',
        stability: 'beta',
        // Implemented: generationMetrics.ts with Bayesian Beta-Binomial model + BayesianAnalyticsPanel.tsx
    },
    showBayesianAnalytics: {
        id: 'showBayesianAnalytics',
        label: 'Bayesian Analytics Panel',
        description: 'Show Bayesian A/B testing analytics with probability comparisons',
        category: 'experimental',
        stability: 'beta',
        dependencies: ['promptABTesting'],
    },
    enhancedNegativePrompts: {
        id: 'enhancedNegativePrompts',
        label: 'Enhanced Negative Prompts',
        description: 'Use expanded provider-specific negative prompts (quality, anatomy, composition)',
        category: 'quality',
        stability: 'beta',
    },
    subjectFirstPrompts: {
        id: 'subjectFirstPrompts',
        label: 'Subject-First Prompts',
        description: 'Order prompts as subject → characters → style → technical details',
        category: 'quality',
        stability: 'beta',
    },
    promptWeighting: {
        id: 'promptWeighting',
        label: 'Prompt Weighting',
        description: 'Enable weighting syntax (e.g., (subject:1.2)) for supported providers',
        category: 'quality',
        stability: 'beta',
        // Implemented: promptWeightingService.ts with ComfyUI provider support
    },
    qualityPrefixVariant: {
        id: 'qualityPrefixVariant',
        label: 'Quality Prefix Variant',
        description: 'Select legacy vs optimized quality prefixes when assembling prompts',
        category: 'quality',
        stability: 'beta',
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
    // Pipeline Integration Flags
    sceneListContextV2: {
        id: 'sceneListContextV2',
        label: 'Scene List Context V2',
        description: 'Use V2 context assembly in scene list generation for improved accuracy',
        category: 'workflow',
        stability: 'beta',
    },
    actContextV2: {
        id: 'actContextV2',
        label: 'Act Context V2',
        description: 'Use plotScene.actNumber for act mapping instead of position heuristic',
        category: 'workflow',
        stability: 'beta',
    },
    keyframePromptPipeline: {
        id: 'keyframePromptPipeline',
        label: 'Keyframe Prompt Pipeline',
        description: 'Use unified prompt assembler for keyframe generation with token budgeting',
        category: 'workflow',
        stability: 'beta',
    },
    videoPromptPipeline: {
        id: 'videoPromptPipeline',
        label: 'Video Prompt Pipeline',
        description: 'Use unified prompt assembler for video generation paths',
        category: 'workflow',
        stability: 'beta',
    },
    bibleV2SaveSync: {
        id: 'bibleV2SaveSync',
        label: 'Bible V2 Save Sync',
        description: 'Auto-sync Visual Bible descriptors when Story Bible is saved',
        category: 'continuity',
        stability: 'beta',
    },
    sceneListValidationMode: {
        id: 'sceneListValidationMode',
        label: 'Scene List Validation',
        description: 'Validate scene summaries for structural issues (off/warn/block)',
        category: 'quality',
        stability: 'beta',
    },
    promptTokenGuard: {
        id: 'promptTokenGuard',
        label: 'Prompt Token Guard',
        description: 'Enforce token budgets on prompts (off/warn/block)',
        category: 'quality',
        stability: 'beta',
    },
    // State Management Migration Flags
    useUnifiedSceneStore: {
        id: 'useUnifiedSceneStore',
        label: 'Unified Scene Store',
        description: 'Use centralized Zustand store for scene state management with IndexedDB persistence',
        category: 'workflow',
        stability: 'experimental',
    },
    sceneStoreParallelValidation: {
        id: 'sceneStoreParallelValidation',
        label: 'Scene Store Parallel Validation',
        description: 'Run consistency checks between old and new state stores during migration',
        category: 'experimental',
        stability: 'experimental',
        dependencies: ['useUnifiedSceneStore'],
    },
};

/**
 * Get feature flag value with fallback to default
 * @deprecated Use getFeatureFlagValue for type-safe access to union-type flags
 */
export function getFeatureFlag(
    flags: Partial<FeatureFlags> | undefined,
    flag: keyof FeatureFlags
): boolean {
    const value = flags?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
    return typeof value === 'boolean' ? value : false;
}

/**
 * Get feature flag value with proper typing for union-type flags.
 * This is the preferred method for accessing flags that may have
 * non-boolean values (e.g., 'off' | 'warn' | 'block').
 * 
 * @param flags - Partial feature flags object
 * @param key - The flag key to retrieve
 * @returns The flag value with proper type
 */
export function getFeatureFlagValue<K extends keyof FeatureFlags>(
    flags: Partial<FeatureFlags> | undefined,
    key: K
): FeatureFlags[K] {
    return (flags?.[key] ?? DEFAULT_FEATURE_FLAGS[key]) as FeatureFlags[K];
}

/**
 * Load and validate feature flags from a partial source.
 * Ensures all flags have valid values and logs validation warnings.
 * 
 * @param source - Partial feature flags to merge with defaults
 * @returns Complete feature flags object
 */
export function loadFeatureFlags(
    source?: Partial<FeatureFlags>
): FeatureFlags {
    const flags = mergeFeatureFlags(source);
    const { warnings } = validateFlagCombination(flags);
    
    if (warnings.length > 0) {
        console.warn('[FeatureFlags] Validation warnings:', warnings);
    }
    
    return flags;
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
