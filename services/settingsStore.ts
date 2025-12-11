/**
 * Settings Store - Zustand-based State Management for LocalGenerationSettings
 * 
 * This store replaces the fragile usePersistentState + Context pattern for settings.
 * It provides stable selector-based subscriptions that won't cause infinite loops.
 * 
 * ## Why This Exists (Tech Debt Fix)
 * 
 * The previous architecture had these issues:
 * 1. usePersistentState returns new object references on every update
 * 2. Components using context would re-render on ANY settings change
 * 3. useEffect deps on settings object caused infinite loops
 * 4. Required ref workarounds (settingsHashRef, etc.) that were fragile
 * 
 * Zustand solves this by:
 * 1. External state (not React state) - no re-render cascades
 * 2. Selector-based subscriptions - only re-render on relevant changes
 * 3. Built-in persist middleware - consistent IndexedDB behavior
 * 4. Stable references - no need for ref workarounds
 * 
 * ## Usage
 * 
 * ```typescript
 * // Select specific primitives (recommended - prevents unnecessary re-renders)
 * const comfyUIUrl = useSettingsStore(state => state.comfyUIUrl);
 * const isEnabled = useSettingsStore(state => !!state.comfyUIUrl);
 * 
 * // Select actions (stable references)
 * const updateSettings = useSettingsStore(state => state.updateSettings);
 * 
 * // For components that need full settings (rare)
 * const settings = useSettingsStore(state => state.getSettings());
 * ```
 * 
 * @module services/settingsStore
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { LocalGenerationSettings, WorkflowProfile, WorkflowMapping } from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import { DEFAULT_FEATURE_FLAGS } from '../utils/featureFlags';
import { createIndexedDBStorage } from '../utils/zustandIndexedDBStorage';
import { 
    WORKFLOW_PROFILE_DEFINITIONS, 
    PRIMARY_WORKFLOW_PROFILE_ID,
    DEFAULT_LOCAL_GENERATION_SETTINGS 
} from '../utils/contextConstants';

// ============================================================================
// Store Types
// ============================================================================

/**
 * Settings store state - mirrors LocalGenerationSettings structure
 */
export interface SettingsStoreState {
    // ========================================================================
    // Video Provider Selection
    // ========================================================================
    videoProvider: 'comfyui-local' | 'fastvideo-local';
    
    // ========================================================================
    // ComfyUI Configuration
    // ========================================================================
    comfyUIUrl: string;
    comfyUIClientId: string;
    comfyUIWebSocketUrl?: string;
    workflowJson: string;
    mapping: WorkflowMapping;
    modelId?: string;
    workflowProfiles: Record<string, WorkflowProfile>;
    
    // ========================================================================
    // Keyframe Generation Mode
    // ========================================================================
    keyframeMode: 'single' | 'bookend';
    imageWorkflowProfile?: string;
    videoWorkflowProfile?: string;
    sceneChainedWorkflowProfile?: string;
    sceneBookendWorkflowProfile?: string;
    
    // ========================================================================
    // FastVideo Configuration
    // ========================================================================
    fastVideo?: {
        endpointUrl: string;
        modelId: string;
        fps: number;
        numFrames: number;
        height: number;
        width: number;
        seed?: number;
        outputDir: string;
        attentionBackend: string;
    };
    
    // ========================================================================
    // LLM Configuration
    // ========================================================================
    llmProviderUrl?: string;
    llmModel?: string;
    llmTemperature?: number;
    llmTimeoutMs?: number;
    llmRequestFormat?: string;
    llmSeed?: number;
    useMockLLM?: boolean;
    
    // ========================================================================
    // Vision LLM Configuration
    // ========================================================================
    visionLLMProviderUrl?: string;
    visionLLMModel?: string;
    visionLLMTemperature?: number;
    visionLLMTimeoutMs?: number;
    useUnifiedVisionModel?: boolean;
    
    // ========================================================================
    // Feature Flags
    // ========================================================================
    featureFlags?: FeatureFlags;
    
    // ========================================================================
    // Provider Health Configuration
    // ========================================================================
    healthCheckIntervalMs?: number;
    
    // ========================================================================
    // Prompt Configuration
    // ========================================================================
    promptVersion?: string;
    promptVariantId?: string;
    promptVariantLabel?: string;
    
    // ========================================================================
    // Quality Enhancement
    // ========================================================================
    upscalerWorkflowProfile?: string;
    characterWorkflowProfile?: string;
    
    // ========================================================================
    // ComfyUI Fetch Settings
    // ========================================================================
    comfyUIFetchMaxRetries?: number;
    comfyUIFetchTimeoutMs?: number;
    comfyUIFetchRetryDelayMs?: number;
    
    // ========================================================================
    // Store Metadata
    // ========================================================================
    _hasHydrated: boolean;
    _lastSyncTimestamp: number;
    _isInitialized: boolean;
}

/**
 * Settings store actions
 */
export interface SettingsStoreActions {
    // ========================================================================
    // Core Settings Operations
    // ========================================================================
    
    /**
     * Get complete settings object (for compatibility with existing code)
     * Use selectors for specific values when possible.
     */
    getSettings: () => LocalGenerationSettings;
    
    /**
     * Update multiple settings at once (partial update)
     */
    updateSettings: (updates: Partial<LocalGenerationSettings>) => void;
    
    /**
     * Replace all settings (full replace, e.g., from import)
     */
    setSettings: (settings: LocalGenerationSettings) => void;
    
    /**
     * Reset to default settings
     */
    resetSettings: () => void;
    
    // ========================================================================
    // Workflow Profile Operations
    // ========================================================================
    
    /**
     * Update a specific workflow profile
     */
    updateWorkflowProfile: (profileId: string, updates: Partial<WorkflowProfile>) => void;
    
    /**
     * Get a specific workflow profile
     */
    getWorkflowProfile: (profileId: string) => WorkflowProfile | undefined;
    
    /**
     * Import workflow profiles from file/config
     */
    importWorkflowProfiles: (profiles: Record<string, WorkflowProfile>) => void;
    
    // ========================================================================
    // Feature Flag Operations
    // ========================================================================
    
    /**
     * Update a specific feature flag
     */
    setFeatureFlag: <K extends keyof FeatureFlags>(flag: K, value: FeatureFlags[K]) => void;
    
    /**
     * Check if a feature is enabled (returns the flag value, handles mixed types)
     */
    isFeatureEnabled: <K extends keyof FeatureFlags>(flag: K) => FeatureFlags[K];
    
    // ========================================================================
    // Store Management
    // ========================================================================
    
    /**
     * Mark store as hydrated from storage
     */
    setHasHydrated: (value: boolean) => void;
    
    /**
     * Mark store as initialized (normalization complete)
     */
    setIsInitialized: (value: boolean) => void;
    
    /**
     * Force sync to storage
     */
    forceSync: () => void;
}

/**
 * Combined store type
 */
export type SettingsStore = SettingsStoreState & SettingsStoreActions;

// ============================================================================
// Initial State
// ============================================================================

/**
 * Convert DEFAULT_LOCAL_GENERATION_SETTINGS to initial store state
 */
const createInitialState = (): SettingsStoreState => {
    const state: SettingsStoreState = {
    // Video Provider
    videoProvider: DEFAULT_LOCAL_GENERATION_SETTINGS.videoProvider ?? 'comfyui-local',
    
    // ComfyUI Configuration
    comfyUIUrl: DEFAULT_LOCAL_GENERATION_SETTINGS.comfyUIUrl,
    comfyUIClientId: DEFAULT_LOCAL_GENERATION_SETTINGS.comfyUIClientId,
    comfyUIWebSocketUrl: DEFAULT_LOCAL_GENERATION_SETTINGS.comfyUIWebSocketUrl,
    workflowJson: DEFAULT_LOCAL_GENERATION_SETTINGS.workflowJson,
    mapping: DEFAULT_LOCAL_GENERATION_SETTINGS.mapping,
    modelId: DEFAULT_LOCAL_GENERATION_SETTINGS.modelId,
    workflowProfiles: DEFAULT_LOCAL_GENERATION_SETTINGS.workflowProfiles ?? {},
    
    // Keyframe Generation Mode
    keyframeMode: DEFAULT_LOCAL_GENERATION_SETTINGS.keyframeMode ?? 'single',
    imageWorkflowProfile: DEFAULT_LOCAL_GENERATION_SETTINGS.imageWorkflowProfile,
    videoWorkflowProfile: DEFAULT_LOCAL_GENERATION_SETTINGS.videoWorkflowProfile,
    sceneChainedWorkflowProfile: DEFAULT_LOCAL_GENERATION_SETTINGS.sceneChainedWorkflowProfile,
    sceneBookendWorkflowProfile: DEFAULT_LOCAL_GENERATION_SETTINGS.sceneBookendWorkflowProfile ?? 'wan-flf2v',
    
    // FastVideo Configuration
    fastVideo: DEFAULT_LOCAL_GENERATION_SETTINGS.fastVideo,
    
    // LLM Configuration
    llmProviderUrl: DEFAULT_LOCAL_GENERATION_SETTINGS.llmProviderUrl,
    llmModel: DEFAULT_LOCAL_GENERATION_SETTINGS.llmModel,
    llmTemperature: DEFAULT_LOCAL_GENERATION_SETTINGS.llmTemperature,
    llmTimeoutMs: DEFAULT_LOCAL_GENERATION_SETTINGS.llmTimeoutMs,
    llmRequestFormat: DEFAULT_LOCAL_GENERATION_SETTINGS.llmRequestFormat,
    llmSeed: DEFAULT_LOCAL_GENERATION_SETTINGS.llmSeed,
    useMockLLM: DEFAULT_LOCAL_GENERATION_SETTINGS.useMockLLM,
    
    // Vision LLM Configuration
    visionLLMProviderUrl: DEFAULT_LOCAL_GENERATION_SETTINGS.visionLLMProviderUrl,
    visionLLMModel: DEFAULT_LOCAL_GENERATION_SETTINGS.visionLLMModel,
    visionLLMTemperature: DEFAULT_LOCAL_GENERATION_SETTINGS.visionLLMTemperature,
    visionLLMTimeoutMs: DEFAULT_LOCAL_GENERATION_SETTINGS.visionLLMTimeoutMs,
    useUnifiedVisionModel: DEFAULT_LOCAL_GENERATION_SETTINGS.useUnifiedVisionModel,
    
    // Feature Flags
    featureFlags: DEFAULT_LOCAL_GENERATION_SETTINGS.featureFlags,
    
    // Provider Health Configuration
    healthCheckIntervalMs: DEFAULT_LOCAL_GENERATION_SETTINGS.healthCheckIntervalMs,
    
    // Prompt Configuration
    promptVersion: DEFAULT_LOCAL_GENERATION_SETTINGS.promptVersion,
    promptVariantId: DEFAULT_LOCAL_GENERATION_SETTINGS.promptVariantId,
    promptVariantLabel: DEFAULT_LOCAL_GENERATION_SETTINGS.promptVariantLabel,
    
    // Quality Enhancement
    upscalerWorkflowProfile: DEFAULT_LOCAL_GENERATION_SETTINGS.upscalerWorkflowProfile,
    characterWorkflowProfile: DEFAULT_LOCAL_GENERATION_SETTINGS.characterWorkflowProfile,
    
    // ComfyUI Fetch Settings
    comfyUIFetchMaxRetries: DEFAULT_LOCAL_GENERATION_SETTINGS.comfyUIFetchMaxRetries,
    comfyUIFetchTimeoutMs: DEFAULT_LOCAL_GENERATION_SETTINGS.comfyUIFetchTimeoutMs,
    comfyUIFetchRetryDelayMs: DEFAULT_LOCAL_GENERATION_SETTINGS.comfyUIFetchRetryDelayMs,
    
    // Store Metadata
    _hasHydrated: false,
    _lastSyncTimestamp: 0,
    _isInitialized: false,
    };

    // Apply injected settings (for testing)
    if (typeof window !== 'undefined' && (window as any).__INJECTED_SETTINGS) {
        console.log('[SettingsStore] Applying injected settings:', (window as any).__INJECTED_SETTINGS);
        // Deep merge feature flags if present
        if ((window as any).__INJECTED_SETTINGS.featureFlags) {
            state.featureFlags = {
                ...state.featureFlags,
                ...(window as any).__INJECTED_SETTINGS.featureFlags
            };
            delete (window as any).__INJECTED_SETTINGS.featureFlags;
        }
        return { ...state, ...(window as any).__INJECTED_SETTINGS };
    }

    return state;
};

// ============================================================================
// Helper Functions
// ============================================================================


/**
 * Convert store state to LocalGenerationSettings interface
 */
function stateToSettings(state: SettingsStoreState): LocalGenerationSettings {
    return {
        videoProvider: state.videoProvider,
        comfyUIUrl: state.comfyUIUrl,
        comfyUIClientId: state.comfyUIClientId,
        comfyUIWebSocketUrl: state.comfyUIWebSocketUrl,
        workflowJson: state.workflowJson,
        mapping: state.mapping,
        modelId: state.modelId,
        workflowProfiles: state.workflowProfiles,
        keyframeMode: state.keyframeMode,
        imageWorkflowProfile: state.imageWorkflowProfile,
        videoWorkflowProfile: state.videoWorkflowProfile,
        sceneChainedWorkflowProfile: state.sceneChainedWorkflowProfile,
        sceneBookendWorkflowProfile: state.sceneBookendWorkflowProfile,
        fastVideo: state.fastVideo,
        llmProviderUrl: state.llmProviderUrl,
        llmModel: state.llmModel,
        llmTemperature: state.llmTemperature,
        llmTimeoutMs: state.llmTimeoutMs,
        llmRequestFormat: state.llmRequestFormat,
        llmSeed: state.llmSeed,
        useMockLLM: state.useMockLLM,
        visionLLMProviderUrl: state.visionLLMProviderUrl,
        visionLLMModel: state.visionLLMModel,
        visionLLMTemperature: state.visionLLMTemperature,
        visionLLMTimeoutMs: state.visionLLMTimeoutMs,
        useUnifiedVisionModel: state.useUnifiedVisionModel,
        featureFlags: state.featureFlags,
        healthCheckIntervalMs: state.healthCheckIntervalMs,
        promptVersion: state.promptVersion,
        promptVariantId: state.promptVariantId,
        promptVariantLabel: state.promptVariantLabel,
        upscalerWorkflowProfile: state.upscalerWorkflowProfile,
        characterWorkflowProfile: state.characterWorkflowProfile,
        comfyUIFetchMaxRetries: state.comfyUIFetchMaxRetries,
        comfyUIFetchTimeoutMs: state.comfyUIFetchTimeoutMs,
        comfyUIFetchRetryDelayMs: state.comfyUIFetchRetryDelayMs,
    };
}

/**
 * Convert LocalGenerationSettings to store state updates
 */
function settingsToState(settings: LocalGenerationSettings): Partial<SettingsStoreState> {
    return {
        videoProvider: settings.videoProvider ?? 'comfyui-local',
        comfyUIUrl: settings.comfyUIUrl,
        comfyUIClientId: settings.comfyUIClientId,
        comfyUIWebSocketUrl: settings.comfyUIWebSocketUrl,
        workflowJson: settings.workflowJson,
        mapping: settings.mapping,
        modelId: settings.modelId,
        workflowProfiles: settings.workflowProfiles ?? {},
        keyframeMode: settings.keyframeMode ?? 'single',
        imageWorkflowProfile: settings.imageWorkflowProfile,
        videoWorkflowProfile: settings.videoWorkflowProfile,
        sceneChainedWorkflowProfile: settings.sceneChainedWorkflowProfile,
        sceneBookendWorkflowProfile: settings.sceneBookendWorkflowProfile ?? 'wan-flf2v',
        fastVideo: settings.fastVideo,
        llmProviderUrl: settings.llmProviderUrl,
        llmModel: settings.llmModel,
        llmTemperature: settings.llmTemperature,
        llmTimeoutMs: settings.llmTimeoutMs,
        llmRequestFormat: settings.llmRequestFormat,
        llmSeed: settings.llmSeed,
        useMockLLM: settings.useMockLLM,
        visionLLMProviderUrl: settings.visionLLMProviderUrl,
        visionLLMModel: settings.visionLLMModel,
        visionLLMTemperature: settings.visionLLMTemperature,
        visionLLMTimeoutMs: settings.visionLLMTimeoutMs,
        useUnifiedVisionModel: settings.useUnifiedVisionModel,
        featureFlags: settings.featureFlags,
        healthCheckIntervalMs: settings.healthCheckIntervalMs,
        promptVersion: settings.promptVersion,
        promptVariantId: settings.promptVariantId,
        promptVariantLabel: settings.promptVariantLabel,
        upscalerWorkflowProfile: settings.upscalerWorkflowProfile,
        characterWorkflowProfile: settings.characterWorkflowProfile,
        comfyUIFetchMaxRetries: settings.comfyUIFetchMaxRetries,
        comfyUIFetchTimeoutMs: settings.comfyUIFetchTimeoutMs,
        comfyUIFetchRetryDelayMs: settings.comfyUIFetchRetryDelayMs,
    };
}

/**
 * Normalize workflow profiles to ensure all required profiles exist
 */
function normalizeProfiles(profiles: Record<string, WorkflowProfile>): Record<string, WorkflowProfile> {
    const normalized = { ...profiles };
    
    // Ensure all profile definitions exist
    for (const def of WORKFLOW_PROFILE_DEFINITIONS) {
        if (!normalized[def.id]) {
            normalized[def.id] = {
                id: def.id,
                label: def.label,
                workflowJson: '',
                mapping: {},
                metadata: {
                    lastSyncedAt: Date.now(),
                    highlightMappings: [],
                    missingMappings: [],
                    warnings: [],
                },
            };
        }
    }
    
    return normalized;
}

// ============================================================================
// Store Name
// ============================================================================

export const SETTINGS_STORE_NAME = 'gemDirect-settings-store';

// ============================================================================
// Store Creation
// ============================================================================

export const useSettingsStore = create<SettingsStore>()(
    subscribeWithSelector(
        persist(
            (set, get) => {
                return {
                // Initial state
                ...createInitialState(),
                
                // ============================================================
                // Core Settings Operations
                // ============================================================
                
                getSettings: () => {
                    return stateToSettings(get());
                },
                
                updateSettings: (updates) => {
                    set((state) => ({
                        ...settingsToState({ ...stateToSettings(state), ...updates }),
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                setSettings: (settings) => {
                    set(() => ({
                        ...settingsToState(settings),
                        _lastSyncTimestamp: Date.now(),
                        _isInitialized: true,
                    }));
                },
                
                resetSettings: () => {
                    set(() => ({
                        ...createInitialState(),
                        _hasHydrated: true,
                        _isInitialized: true,
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                // ============================================================
                // Workflow Profile Operations
                // ============================================================
                
                updateWorkflowProfile: (profileId, updates) => {
                    set((state) => {
                        const existingProfile = state.workflowProfiles[profileId];
                        if (!existingProfile) {
                            console.warn(`[SettingsStore] Profile ${profileId} not found`);
                            return state;
                        }
                        
                        return {
                            workflowProfiles: {
                                ...state.workflowProfiles,
                                [profileId]: { ...existingProfile, ...updates },
                            },
                            _lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                getWorkflowProfile: (profileId) => {
                    return get().workflowProfiles[profileId];
                },
                
                importWorkflowProfiles: (profiles) => {
                    set((state) => {
                        const merged = { ...state.workflowProfiles };
                        
                        // Merge imported profiles, preserving existing data where imported is empty
                        for (const [id, profile] of Object.entries(profiles)) {
                            if (profile.workflowJson && profile.workflowJson.length > 100) {
                                merged[id] = profile;
                            } else if (merged[id]) {
                                // Keep existing if imported is empty
                                merged[id] = { ...merged[id], ...profile, workflowJson: merged[id]!.workflowJson };
                            } else {
                                merged[id] = profile;
                            }
                        }
                        
                        // Also update root workflowJson/mapping if primary profile has data
                        const primaryProfile = merged[PRIMARY_WORKFLOW_PROFILE_ID];
                        
                        return {
                            workflowProfiles: merged,
                            workflowJson: primaryProfile?.workflowJson ?? state.workflowJson,
                            mapping: primaryProfile?.mapping ?? state.mapping,
                            _lastSyncTimestamp: Date.now(),
                        };
                    });
                    
                    console.log('[SettingsStore] Imported workflow profiles:', Object.keys(profiles));
                },
                
                // ============================================================
                // Feature Flag Operations
                // ============================================================
                
                setFeatureFlag: <K extends keyof FeatureFlags>(flag: K, value: FeatureFlags[K]) => {
                    set((state) => ({
                        featureFlags: {
                            ...state.featureFlags,
                            [flag]: value,
                        } as FeatureFlags,
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                isFeatureEnabled: <K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] => {
                    const flags = get().featureFlags;
                    return (flags?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag]) as FeatureFlags[K];
                },
                
                // ============================================================
                // Store Management
                // ============================================================
                
                setHasHydrated: (value) => {
                    set(() => ({ _hasHydrated: value }));
                },
                
                setIsInitialized: (value) => {
                    set(() => ({ _isInitialized: value }));
                },
                
                forceSync: () => {
                    set((state) => ({
                        _lastSyncTimestamp: Date.now(),
                        // Touch a field to trigger persist
                        comfyUIClientId: state.comfyUIClientId,
                    }));
                },
            }; },
            {
                name: SETTINGS_STORE_NAME,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                storage: createIndexedDBStorage({ keyPrefix: '', debug: true }) as any,
                partialize: (state): Partial<SettingsStoreState> => {
                    // Extract only serializable state fields, exclude functions and metadata
                    return {
                        videoProvider: state.videoProvider,
                        comfyUIUrl: state.comfyUIUrl,
                        comfyUIClientId: state.comfyUIClientId,
                        comfyUIWebSocketUrl: state.comfyUIWebSocketUrl,
                        workflowJson: state.workflowJson,
                        mapping: state.mapping,
                        modelId: state.modelId,
                        workflowProfiles: state.workflowProfiles,
                        keyframeMode: state.keyframeMode,
                        imageWorkflowProfile: state.imageWorkflowProfile,
                        videoWorkflowProfile: state.videoWorkflowProfile,
                        sceneChainedWorkflowProfile: state.sceneChainedWorkflowProfile,
                        sceneBookendWorkflowProfile: state.sceneBookendWorkflowProfile,
                        fastVideo: state.fastVideo,
                        llmProviderUrl: state.llmProviderUrl,
                        llmModel: state.llmModel,
                        llmTemperature: state.llmTemperature,
                        llmTimeoutMs: state.llmTimeoutMs,
                        llmRequestFormat: state.llmRequestFormat,
                        llmSeed: state.llmSeed,
                        useMockLLM: state.useMockLLM,
                        visionLLMProviderUrl: state.visionLLMProviderUrl,
                        visionLLMModel: state.visionLLMModel,
                        visionLLMTemperature: state.visionLLMTemperature,
                        visionLLMTimeoutMs: state.visionLLMTimeoutMs,
                        useUnifiedVisionModel: state.useUnifiedVisionModel,
                        featureFlags: state.featureFlags,
                        healthCheckIntervalMs: state.healthCheckIntervalMs,
                        promptVersion: state.promptVersion,
                        promptVariantId: state.promptVariantId,
                        promptVariantLabel: state.promptVariantLabel,
                        upscalerWorkflowProfile: state.upscalerWorkflowProfile,
                        characterWorkflowProfile: state.characterWorkflowProfile,
                        comfyUIFetchMaxRetries: state.comfyUIFetchMaxRetries,
                        comfyUIFetchTimeoutMs: state.comfyUIFetchTimeoutMs,
                        comfyUIFetchRetryDelayMs: state.comfyUIFetchRetryDelayMs,
                        // Exclude metadata: _hasHydrated, _lastSyncTimestamp, _isInitialized
                    };
                },
                onRehydrateStorage: () => (state) => {
                    if (state) {
                        console.log('[SettingsStore] Rehydrated state keys:', Object.keys(state));
                        if (state.workflowProfiles) {
                            console.log('[SettingsStore] Rehydrated profiles:', Object.keys(state.workflowProfiles));
                            if (state.workflowProfiles['wan-t2i']) {
                                console.log('[SettingsStore] Rehydrated wan-t2i length:', state.workflowProfiles['wan-t2i'].workflowJson?.length);
                            } else {
                                console.log('[SettingsStore] Rehydrated wan-t2i NOT FOUND');
                            }
                        } else {
                            console.log('[SettingsStore] Rehydrated workflowProfiles is MISSING');
                        }

                        // Normalize workflow profiles on hydration
                        const normalized = normalizeProfiles(state.workflowProfiles || {});
                        
                        // Check if profiles need normalization
                        const needsNormalization = Object.keys(normalized).length !== Object.keys(state.workflowProfiles || {}).length;
                        
                        if (needsNormalization) {
                            state.workflowProfiles = normalized;
                        }
                        
                        // CRITICAL FIX: Re-apply injected settings after hydration
                        // This ensures that test settings override whatever was in IndexedDB
                        if (typeof window !== 'undefined' && (window as any).__INJECTED_SETTINGS) {
                            console.log('[SettingsStore] Re-applying injected settings after hydration');
                            const injected = (window as any).__INJECTED_SETTINGS;
                            
                            // Deep merge feature flags if present
                            if (injected.featureFlags) {
                                state.featureFlags = {
                                    ...state.featureFlags,
                                    ...injected.featureFlags
                                };
                            }
                            
                            // Apply other top-level properties
                            Object.assign(state, injected);
                            
                            // Force sync timestamp to trigger subscribers
                            state._lastSyncTimestamp = Date.now();
                        }
                        
                        state.setHasHydrated(true);
                        state.setIsInitialized(true);
                    }
                },
            }
        )
    )
);

// ============================================================================
// Selector Hooks (Recommended Usage)
// ============================================================================

/**
 * Check if settings store has hydrated
 */
export function useSettingsHydrated(): boolean {
    return useSettingsStore((state) => state._hasHydrated);
}

/**
 * Get ComfyUI URL
 */
export function useComfyUIUrl(): string {
    return useSettingsStore((state) => state.comfyUIUrl);
}

/**
 * Check if ComfyUI is configured
 */
export function useIsComfyUIConfigured(): boolean {
    return useSettingsStore((state) => !!state.comfyUIUrl && !!state.workflowProfiles);
}

/**
 * Get keyframe mode
 */
export function useKeyframeMode(): 'single' | 'bookend' {
    return useSettingsStore((state) => state.keyframeMode);
}

/**
 * Get workflow profiles
 */
export function useWorkflowProfiles(): Record<string, WorkflowProfile> {
    return useSettingsStore((state) => state.workflowProfiles);
}

/**
 * Get a specific workflow profile
 */
export function useWorkflowProfile(profileId: string): WorkflowProfile | undefined {
    return useSettingsStore((state) => state.workflowProfiles[profileId]);
}

/**
 * Get feature flags
 */
export function useFeatureFlags(): FeatureFlags | undefined {
    return useSettingsStore((state) => state.featureFlags);
}

/**
 * Check if a specific feature is enabled (boolean flags only)
 * For union-type flags, use useFeatureFlagValue instead.
 */
export function useIsFeatureEnabled(flag: keyof FeatureFlags): boolean {
    return useSettingsStore((state) => {
        const value = state.featureFlags?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
        return typeof value === 'boolean' ? value : false;
    });
}

/**
 * Get a specific feature flag value with proper typing
 */
export function useFeatureFlagValue<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
    return useSettingsStore((state) => 
        (state.featureFlags?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag]) as FeatureFlags[K]
    );
}

// ============================================================================
// Non-React Utilities
// ============================================================================

/**
 * Get current settings state (for non-React contexts like services)
 */
export function getSettingsState(): LocalGenerationSettings {
    return useSettingsStore.getState().getSettings();
}

/**
 * Subscribe to settings changes (for non-React contexts)
 */
export function subscribeToSettings(
    listener: (settings: LocalGenerationSettings) => void
): () => void {
    return useSettingsStore.subscribe(
        (state) => stateToSettings(state),
        listener
    );
}

/**
 * Update settings from non-React context
 */
export function updateSettings(updates: Partial<LocalGenerationSettings>): void {
    useSettingsStore.getState().updateSettings(updates);
}

// ============================================================================
// DevTools / Testing Exposure
// ============================================================================

if (typeof window !== 'undefined') {
    console.log('[SettingsStore] Exposing store to globalThis');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).useSettingsStore = useSettingsStore;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__TEST_STORE_EXPOSED = true;
}
