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
    // Note: bookendKeyframes has been removed - use LocalGenerationSettings.keyframeMode instead
    // This provides a single unified control for keyframe generation mode ('single' | 'bookend')

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

    /**
     * Use Zustand settings store instead of usePersistentState for LocalGenerationSettings.
     * When enabled, settings flow through the centralized settingsStore with IndexedDB persistence.
     * This prevents infinite loops from object reference changes in useEffect dependencies.
     * @default false
     * @stability experimental
     * @expires 2026-03-31
     */
    useSettingsStore: boolean;

    /**
     * Use Zustand generation status store instead of prop-drilling localGenStatus.
     * When enabled, generation status flows through generationStatusStore.
     * This prevents infinite loops in TimelineEditor during ComfyUI progress updates.
     * @default false
     * @stability experimental
     * @expires 2026-03-31
     */
    useGenerationStatusStore: boolean;

    /**
     * Enable Quick Generate mode in the UI.
     * This feature is currently a stub and does not generate real content.
     * Hidden by default to avoid confusing users.
     * @default false
     * @stability experimental
     */
    enableQuickGenerate: boolean;

    // ============================================================================
    // Generation Queue Flags (Infrastructure Integration)
    // ============================================================================

    /**
     * Route video/keyframe generation through serial GenerationQueue.
     * Prevents VRAM exhaustion by serializing GPU-intensive operations
     * with automatic retry and circuit breaker patterns.
     * @default true
     * @stability beta
     * @expires 2026-03-31
     */
    useGenerationQueue: boolean;

    /**
     * Route LLM calls through the LLMTransportAdapter abstraction layer.
     * Enables consistent error handling, mock injection for testing,
     * and seamless provider switching (Gemini, LM Studio, etc.).
     * @default false
     * @stability experimental
     * @expires 2026-03-31
     */
    useLLMTransportAdapter: boolean;

    // ============================================================================
    // Vision LLM Integration Flags
    // ============================================================================

    /**
     * Enable vision LLM feedback on generated keyframes.
     * Uses a vision-language model to analyze keyframe images and suggest
     * prompt improvements based on visual quality assessment.
     * @default false
     * @stability experimental
     */
    visionLLMFeedback: boolean;

    /**
     * Vision LLM provider to use for keyframe analysis.
     * - 'disabled': Vision feedback disabled
     * - 'local-qwen': Use local Qwen VL model via LM Studio
     * - 'gemini': Use Gemini Pro Vision (requires API key)
     * @default 'disabled'
     * @stability experimental
     */
    visionFeedbackProvider: 'disabled' | 'local-qwen' | 'gemini';

    /**
     * Auto-analyze keyframes after generation.
     * When enabled, vision analysis runs automatically after each keyframe.
     * When disabled, user must manually trigger analysis.
     * @default false
     * @stability experimental
     */
    autoVisionAnalysis: boolean;

    // ============================================================================
    // Video Analysis Flags
    // ============================================================================

    /**
     * Enable video analysis feedback after video generation.
     * Uses vision-language model to compare video frames against keyframes
     * and analyze motion quality.
     * @default false
     * @stability experimental
     */
    videoAnalysisFeedback: boolean;

    /**
     * Auto-analyze videos after generation completes.
     * When enabled, video analysis runs automatically after each video.
     * When disabled, user must manually trigger analysis.
     * @default false
     * @stability experimental
     */
    autoVideoAnalysis: boolean;

    /**
     * Enable video quality gate enforcement.
     * When enabled, videos are evaluated against quality thresholds and
     * flagged for regeneration if they don't meet the quality bar.
     * @default false
     * @stability experimental
     */
    videoQualityGateEnabled: boolean;

    /**
     * Minimum overall score threshold for video quality acceptance.
     * Videos below this score will be flagged for regeneration.
     * @default 60
     * @stability experimental
     */
    videoQualityThreshold: number;

    // ============================================================================
    // Bookend QA Flags (Phase 8)
    // ============================================================================

    /**
     * Enable keyframe pair analysis preflight check before bookend video generation.
     * Uses vision LLM to analyze start/end keyframes for visual continuity.
     * Blocks generation if continuity thresholds are not met.
     * @default false
     * @stability experimental
     */
    keyframePairAnalysis: boolean;

    /**
     * Master switch for Bookend QA Mode.
     * When enabled, forces the following flags to be treated as true:
     * - keyframePairAnalysis
     * - videoQualityGateEnabled
     * - autoVideoAnalysis
     * Use getEffectiveFlagsForQAMode() to apply these overrides.
     * @default false
     * @stability beta
     */
    bookendQAMode: boolean;

    // ============================================================================
    // VRAM Management Flags
    // ============================================================================

    /**
     * Automatically eject LM Studio models before ComfyUI generation.
     * When enabled, sends unload request to LM Studio to free VRAM before
     * queueing ComfyUI prompts. This prevents VRAM contention between LLM
     * and image/video generation workloads.
     * @default true
     * @stability stable
     */
    autoEjectLMStudioModels: boolean;

    // ============================================================================
    // Keyframe Generation Enhancement Flags
    // ============================================================================

    /**
     * Enable keyframe version history.
     * When enabled, regenerations are stored as versions instead of overwriting.
     * Users can browse and select from previous versions.
     * @default true
     * @stability beta
     */
    keyframeVersionHistory: boolean;

    /**
     * Auto-generate temporal context for bookend workflow.
     * When enabled, start/end moments are automatically generated from scene
     * description using LLM. When disabled, user must provide them manually.
     * @default true
     * @stability beta
     */
    autoGenerateTemporalContext: boolean;

    // ============================================================================
    // Temporal Coherence Enhancement Flags (Phase 5)
    // ============================================================================

    /**
     * Enable deflicker post-processing step after video generation.
     * Applies frame blending to reduce temporal flicker and improve smoothness.
     * Uses configurable window size and blend strength.
     * @default false
     * @stability experimental
     */
    videoDeflicker: boolean;

    /**
     * Deflicker blend strength (0.0-1.0).
     * Higher values = stronger smoothing but may reduce sharpness.
     * Recommended range: 0.3-0.5
     * @default 0.35
     * @stability experimental
     */
    deflickerStrength: number;

    /**
     * Deflicker temporal window size in frames.
     * Larger windows = more smoothing but higher latency.
     * Recommended: 3-5 frames.
     * @default 3
     * @stability experimental
     */
    deflickerWindowSize: number;

    /**
     * Enable IP-Adapter reference conditioning for style/identity stability.
     * Uses a reference image to guide video generation and reduce drift.
     * Works with Visual Bible character references when available.
     * @default false
     * @stability experimental
     */
    ipAdapterReferenceConditioning: boolean;

    /**
     * IP-Adapter reference weight (0.0-1.0).
     * Higher values = stronger adherence to reference but may reduce prompt responsiveness.
     * Recommended range: 0.3-0.6
     * @default 0.4
     * @stability experimental
     */
    ipAdapterWeight: number;

    /**
     * Enable prompt scheduling for smooth scene transitions.
     * Allows gradual prompt blending over a sequence of frames.
     * @default false
     * @stability experimental
     */
    promptScheduling: boolean;

    /**
     * Prompt transition blend duration in frames.
     * Number of frames over which to blend from one prompt to another.
     * @default 8
     * @stability experimental
     */
    promptTransitionFrames: number;

    // ============================================================================
    // Anti-Flicker Enhancement Flags (Phase 6 - Video Quality)
    // ============================================================================

    /**
     * Enable Enhance-A-Video (FETA) for temporal consistency.
     * Requires WanVideoSampler workflow (not compatible with standard KSampler).
     * Applies cross-frame attention during diffusion for smoother motion.
     * @default false
     * @stability experimental
     */
    enhanceAVideoEnabled: boolean;

    /**
     * FETA weight for temporal consistency (0.0-100.0).
     * Higher values = stronger temporal coherence but may reduce prompt adherence.
     * Recommended range: 1.5-3.0
     * @default 2.0
     * @stability experimental
     */
    fetaWeight: number;

    /**
     * Enable frame interpolation post-processing.
     * Uses TopazVideoEnhance or similar to smooth frame transitions.
     * Helps reduce visible frame jumps and temporal artifacts.
     * @default false
     * @stability experimental
     */
    frameInterpolationEnabled: boolean;

    /**
     * Target frame rate for interpolation.
     * Higher values = smoother motion but larger output files.
     * @default 60
     * @stability experimental
     */
    interpolationTargetFps: number;
}

/**
 * Default feature flag values
 * All disabled by default for backward compatibility
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
    // Note: bookendKeyframes removed - use LocalGenerationSettings.keyframeMode instead
    videoUpscaling: false,
    characterConsistency: true,  // Enable IP-Adapter character consistency for identity preservation
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
    useSettingsStore: true,        // Use Zustand settings store (Phase 1D - enabled for testing)
    useGenerationStatusStore: true, // Use Zustand generation status store (Phase 1D - enabled)
    // Quick Generate (hidden - stub feature)
    enableQuickGenerate: false,    // Quick Generate is not implemented - hidden from users
    // Generation Queue Integration
    useGenerationQueue: true,      // Route through serial queue (prevents VRAM exhaustion)
    // LLM Transport Adapter Integration
    useLLMTransportAdapter: true,  // Route through transport abstraction (enables testing/provider switching)
    // Vision LLM Integration
    visionLLMFeedback: true,       // Enable vision feedback on keyframes (enabled for quality diagnosis)
    visionFeedbackProvider: 'local-qwen', // Vision provider - use local Qwen VL
    autoVisionAnalysis: true,      // Auto-analyze keyframes after generation (enabled)
    // Video Analysis Integration
    videoAnalysisFeedback: true,   // Enable video analysis feedback (enabled for quality diagnosis)
    autoVideoAnalysis: true,       // Auto-analyze videos after generation (enabled for quality diagnosis)
    videoQualityGateEnabled: false, // Quality gate enforcement (disabled by default - manual review preferred)
    videoQualityThreshold: 60,     // Minimum acceptable video quality score
    // Bookend QA (Phase 8)
    keyframePairAnalysis: true,    // Enable keyframe pair analysis preflight (uses vision LLM)
    bookendQAMode: false,          // Master switch for Bookend QA Mode (off by default)
    // VRAM Management
    autoEjectLMStudioModels: true, // Auto-eject LM Studio models before ComfyUI generation
    // Keyframe Generation Enhancements
    keyframeVersionHistory: true,        // Enable keyframe version history
    autoGenerateTemporalContext: true,   // Auto-generate bookend temporal context from scene
    // Temporal Coherence Enhancement (Phase 5) - STANDARD PROFILE DEFAULTS (Phase 8)
    // Changed in Phase 8: Default is now "Standard" stability profile with deflicker ON
    videoDeflicker: true,                // Deflicker post-processing (ON by default - Standard profile)
    deflickerStrength: 0.35,             // Deflicker blend strength (Standard profile)
    deflickerWindowSize: 3,              // Deflicker temporal window size (Standard profile)
    ipAdapterReferenceConditioning: false, // IP-Adapter reference conditioning (off - requires character ref images)
    ipAdapterWeight: 0.4,                // IP-Adapter reference weight
    promptScheduling: false,             // Prompt scheduling for transitions (off - Standard profile)
    promptTransitionFrames: 8,           // Prompt transition blend duration
    // Anti-Flicker Enhancement (Phase 6)
    enhanceAVideoEnabled: false,         // FETA enhancement (off by default - requires WanVideoSampler)
    fetaWeight: 2.0,                     // FETA weight for temporal consistency
    frameInterpolationEnabled: false,    // Frame interpolation post-processing
    interpolationTargetFps: 60,          // Target FPS for interpolation
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
    // Note: bookendKeyframes removed - use LocalGenerationSettings.keyframeMode instead
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
    useSettingsStore: {
        id: 'useSettingsStore',
        label: 'Zustand Settings Store',
        description: 'Use centralized Zustand store for LocalGenerationSettings. Prevents infinite loops from object reference changes.',
        category: 'workflow',
        stability: 'experimental',
    },
    useGenerationStatusStore: {
        id: 'useGenerationStatusStore',
        label: 'Zustand Generation Status Store',
        description: 'Use centralized Zustand store for generation status. Prevents infinite loops in TimelineEditor during progress updates.',
        category: 'workflow',
        stability: 'experimental',
    },
    enableQuickGenerate: {
        id: 'enableQuickGenerate',
        label: 'Quick Generate Mode',
        description: 'Enable Quick Generate sandbox for fast one-prompt experiments. Currently not fully implemented.',
        category: 'experimental',
        stability: 'experimental',
        comingSoon: true, // Marks as not yet implemented
    },
    // Generation Queue Integration
    useGenerationQueue: {
        id: 'useGenerationQueue',
        label: 'Generation Queue',
        description: 'Route video/keyframe generation through serial queue to prevent VRAM exhaustion. Includes automatic retry and circuit breaker.',
        category: 'workflow',
        stability: 'beta',
    },
    // LLM Transport Adapter Integration
    useLLMTransportAdapter: {
        id: 'useLLMTransportAdapter',
        label: 'LLM Transport Adapter',
        description: 'Route LLM calls through abstraction layer for consistent error handling, testing support, and provider switching.',
        category: 'experimental',
        stability: 'experimental',
    },
    // Vision LLM Integration
    visionLLMFeedback: {
        id: 'visionLLMFeedback',
        label: 'Vision LLM Feedback',
        description: 'Enable vision-language model analysis of generated keyframes to suggest prompt improvements.',
        category: 'quality',
        stability: 'experimental',
    },
    visionFeedbackProvider: {
        id: 'visionFeedbackProvider',
        label: 'Vision Feedback Provider',
        description: 'Select vision LLM provider: local Qwen VL via LM Studio or Gemini Pro Vision.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['visionLLMFeedback'],
    },
    autoVisionAnalysis: {
        id: 'autoVisionAnalysis',
        label: 'Auto Vision Analysis',
        description: 'Automatically analyze keyframes after generation instead of manual trigger.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['visionLLMFeedback'],
    },
    videoAnalysisFeedback: {
        id: 'videoAnalysisFeedback',
        label: 'Video Analysis Feedback',
        description: 'Enable vision-language model analysis of generated videos to compare frames against keyframes and analyze motion quality.',
        category: 'quality',
        stability: 'experimental',
    },
    autoVideoAnalysis: {
        id: 'autoVideoAnalysis',
        label: 'Auto Video Analysis',
        description: 'Automatically analyze videos after generation completes instead of manual trigger.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['videoAnalysisFeedback'],
    },
    videoQualityGateEnabled: {
        id: 'videoQualityGateEnabled',
        label: 'Video Quality Gate',
        description: 'Enforce quality thresholds on generated videos. Videos below threshold will be flagged for regeneration.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['videoAnalysisFeedback'],
    },
    videoQualityThreshold: {
        id: 'videoQualityThreshold',
        label: 'Video Quality Threshold',
        description: 'Minimum overall score threshold (0-100) for video quality acceptance. Videos below this score will be flagged for regeneration.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['videoAnalysisFeedback'],
    },
    keyframePairAnalysis: {
        id: 'keyframePairAnalysis',
        label: 'Keyframe Pair Analysis',
        description: 'Analyze start/end keyframes for visual continuity before bookend video generation. Uses vision LLM to detect character/environment/camera inconsistencies.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['visionLLMFeedback'],
    },
    bookendQAMode: {
        id: 'bookendQAMode',
        label: 'Bookend QA Mode',
        description: 'Master switch for bookend video quality assurance. When enabled, forces keyframe pair analysis, video quality gate, and auto video analysis to be active.',
        category: 'quality',
        stability: 'beta',
        dependencies: [],
    },
    autoEjectLMStudioModels: {
        id: 'autoEjectLMStudioModels',
        label: 'Auto-Eject LM Studio Models',
        description: 'Automatically unload LM Studio LLM models before ComfyUI generation to free VRAM.',
        category: 'quality',
        stability: 'stable',
        dependencies: [],
    },
    keyframeVersionHistory: {
        id: 'keyframeVersionHistory',
        label: 'Keyframe Version History',
        description: 'Store regenerated keyframes as versions instead of overwriting. Allows browsing and selecting previous versions.',
        category: 'workflow',
        stability: 'beta',
        dependencies: [],
    },
    autoGenerateTemporalContext: {
        id: 'autoGenerateTemporalContext',
        label: 'Auto-Generate Temporal Context',
        description: 'Automatically generate start/end moment descriptions for bookend workflow from scene summary.',
        category: 'workflow',
        stability: 'beta',
        dependencies: [],
    },
    // Temporal Coherence Enhancement (Phase 5)
    videoDeflicker: {
        id: 'videoDeflicker',
        label: 'Video Deflicker',
        description: 'Apply temporal deflicker post-processing to reduce flicker and improve video smoothness.',
        category: 'quality',
        stability: 'experimental',
        dependencies: [],
    },
    deflickerStrength: {
        id: 'deflickerStrength',
        label: 'Deflicker Strength',
        description: 'Blend strength for deflicker processing (0.0-1.0). Higher = smoother but may reduce sharpness.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['videoDeflicker'],
    },
    deflickerWindowSize: {
        id: 'deflickerWindowSize',
        label: 'Deflicker Window Size',
        description: 'Temporal window size in frames for deflicker. Larger = smoother but higher latency.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['videoDeflicker'],
    },
    ipAdapterReferenceConditioning: {
        id: 'ipAdapterReferenceConditioning',
        label: 'IP-Adapter Reference Conditioning',
        description: 'Use reference image (from Visual Bible) to guide video generation for style/identity stability.',
        category: 'continuity',
        stability: 'experimental',
        dependencies: ['characterConsistency'],
    },
    ipAdapterWeight: {
        id: 'ipAdapterWeight',
        label: 'IP-Adapter Weight',
        description: 'Reference image influence strength (0.0-1.0). Higher = more adherence to reference.',
        category: 'continuity',
        stability: 'experimental',
        dependencies: ['ipAdapterReferenceConditioning'],
    },
    promptScheduling: {
        id: 'promptScheduling',
        label: 'Prompt Scheduling',
        description: 'Enable gradual prompt blending for smooth scene transitions over multiple frames.',
        category: 'quality',
        stability: 'experimental',
        dependencies: [],
    },
    promptTransitionFrames: {
        id: 'promptTransitionFrames',
        label: 'Prompt Transition Frames',
        description: 'Number of frames to blend prompts during transitions.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['promptScheduling'],
    },
    enhanceAVideoEnabled: {
        id: 'enhanceAVideoEnabled',
        label: 'Enhance-A-Video (FETA)',
        description: 'Enable FETA temporal consistency enhancement. Requires WanVideoSampler workflow (not compatible with KSampler).',
        category: 'quality',
        stability: 'experimental',
        dependencies: [],
    },
    fetaWeight: {
        id: 'fetaWeight',
        label: 'FETA Weight',
        description: 'Weight for temporal consistency (1.5-3.0 recommended). Higher = smoother but less prompt-adherent.',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['enhanceAVideoEnabled'],
    },
    frameInterpolationEnabled: {
        id: 'frameInterpolationEnabled',
        label: 'Frame Interpolation',
        description: 'Enable post-processing frame interpolation to smooth temporal artifacts.',
        category: 'quality',
        stability: 'experimental',
        dependencies: [],
    },
    interpolationTargetFps: {
        id: 'interpolationTargetFps',
        label: 'Interpolation Target FPS',
        description: 'Target frame rate for interpolation (60 recommended for smooth motion).',
        category: 'quality',
        stability: 'experimental',
        dependencies: ['frameInterpolationEnabled'],
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

/**
 * Get effective feature flags with Bookend QA Mode overrides applied.
 * When bookendQAMode is true, forces the following flags to be treated as enabled:
 * - keyframePairAnalysis: Pre-flight keyframe continuity check
 * - videoQualityGateEnabled: Post-generation quality enforcement
 * - autoVideoAnalysis: Automatic video analysis after generation
 * 
 * @param flags - Partial feature flags from settings
 * @returns Complete FeatureFlags object with QA mode overrides applied
 */
export function getEffectiveFlagsForQAMode(flags: Partial<FeatureFlags> | undefined): FeatureFlags {
    const merged = mergeFeatureFlags(flags);
    
    if (merged.bookendQAMode) {
        return {
            ...merged,
            keyframePairAnalysis: true,
            videoQualityGateEnabled: true,
            autoVideoAnalysis: true,
        };
    }
    
    return merged;
}
