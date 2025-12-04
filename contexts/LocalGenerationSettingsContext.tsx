import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { LocalGenerationSettings } from '../types';
import { usePersistentState } from '../utils/hooks';
import { getFeatureFlag } from '../utils/featureFlags';
import { 
    WORKFLOW_PROFILE_DEFINITIONS, 
    PRIMARY_WORKFLOW_PROFILE_ID, 
    normalizeWorkflowProfiles, 
    DEFAULT_LOCAL_GENERATION_SETTINGS 
} from '../utils/contextConstants';
import { 
    useSettingsStore, 
    useSettingsHydrated 
} from '../services/settingsStore';

type LocalGenerationSettingsContextValue = {
    settings: LocalGenerationSettings;
    setSettings: React.Dispatch<React.SetStateAction<LocalGenerationSettings>>;
};

const LocalGenerationSettingsContext = createContext<LocalGenerationSettingsContextValue | undefined>(undefined);

/**
 * Settings Provider with Zustand backing store (new implementation)
 * 
 * This version uses the Zustand settingsStore as the source of truth,
 * providing the same API for backward compatibility.
 */
const ZustandBackedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const isHydrated = useSettingsHydrated();
    
    // Get stable action references from store
    const getSettings = useSettingsStore(state => state.getSettings);
    const setStoreSettings = useSettingsStore(state => state.setSettings);
    
    // Subscribe to timestamp to trigger re-render on state changes
    const lastSync = useSettingsStore(state => state._lastSyncTimestamp);
    
    // Memoize settings object - recompute only when store changes
    const settings = useMemo(() => {
        return isHydrated ? getSettings() : DEFAULT_LOCAL_GENERATION_SETTINGS;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastSync, isHydrated, getSettings]);
    
    // Create a setState-compatible setter for backward compatibility
    const setSettings: React.Dispatch<React.SetStateAction<LocalGenerationSettings>> = useCallback(
        (action) => {
            if (typeof action === 'function') {
                // Handle functional updates
                const currentSettings = useSettingsStore.getState().getSettings();
                const newSettings = action(currentSettings);
                setStoreSettings(newSettings);
            } else {
                // Handle direct value updates
                setStoreSettings(action);
            }
        },
        [setStoreSettings]
    );
    
    // Make settings globally available for services (backward compat)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).__localGenSettings = settings;
        }
    }, [settings]);
    
    // Memoize context value
    const contextValue = useMemo(
        () => ({ settings, setSettings }), 
        [settings, setSettings]
    );
    
    // Wait for hydration before rendering children
    if (!isHydrated) {
        return null;
    }
    
    return (
        <LocalGenerationSettingsContext.Provider value={contextValue}>
            {children}
        </LocalGenerationSettingsContext.Provider>
    );
};

interface LegacyProviderProps {
    children: React.ReactNode;
    settings: LocalGenerationSettings;
    setSettings: React.Dispatch<React.SetStateAction<LocalGenerationSettings>>;
}

/**
 * Legacy Settings Provider (uses usePersistentState via parent)
 * 
 * Kept for feature flag rollback capability.
 */
const LegacyProvider: React.FC<LegacyProviderProps> = ({ children, settings, setSettings }) => {
    const [isInitialized, setIsInitialized] = useState(false);

    // ONE-TIME normalization on mount (Phase 1 Fix: 2025-11-23)
    // Previous issue: useEffect with [settings, setSettings] dependencies caused race condition
    // where imported profiles were overwritten by normalization before persistence.
    // Solution: Run normalization only once on mount, not on every settings change.
    useEffect(() => {
        if (isInitialized) {
            console.log('[LocalGenSettings] ✅ Already initialized - skipping normalization check');
            return; // Only run once
        }
        
        console.log('[LocalGenSettings] 🔍 One-time initialization check triggered');
        console.log('[LocalGenSettings]    Profile keys:', Object.keys(settings.workflowProfiles || {}));
        
        const hasAllProfiles = WORKFLOW_PROFILE_DEFINITIONS.every(def => Boolean(settings.workflowProfiles?.[def.id]));
        console.log('[LocalGenSettings]    hasAllProfiles:', hasAllProfiles);
        
        if (!hasAllProfiles) {
            // Only normalize if profiles are actually missing/incomplete
            // Check if any existing profile has actual workflow data
            const hasRealWorkflows = settings.workflowProfiles && 
                Object.values(settings.workflowProfiles).some(p => {
                    const hasData = p?.workflowJson && p.workflowJson.length > 100;
                    console.log('[LocalGenSettings]      Profile:', p?.id, 'hasData:', hasData, 'jsonLength:', p?.workflowJson?.length);
                    return hasData;
                });
            
            console.log('[LocalGenSettings]    hasRealWorkflows:', hasRealWorkflows);
            
            if (hasRealWorkflows) {
                // Profiles have real data but structure is incomplete - don't normalize
                console.info('[LocalGenSettings] ✅ SKIP normalization - profiles have workflow data');
                setIsInitialized(true);
                return;
            }
            
            console.warn('[LocalGenSettings] ⚠️  NORMALIZING - initializing with empty defaults');
            const normalized = normalizeWorkflowProfiles(settings);
            setSettings(prev => ({
                ...prev,
                workflowProfiles: normalized,
                workflowJson: normalized[PRIMARY_WORKFLOW_PROFILE_ID]?.workflowJson ?? prev.workflowJson,
                mapping: normalized[PRIMARY_WORKFLOW_PROFILE_ID]?.mapping ?? prev.mapping,
            }));
        } else {
            console.log('[LocalGenSettings] ✅ All profiles present on mount - no normalization needed');
        }
        
        setIsInitialized(true);
    }, [isInitialized, settings, setSettings]);

    // Make settings globally available for services
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).__localGenSettings = settings;
        }
    }, [settings]);

    // P2 Optimization (2025-11-20): Memoize context value to prevent unnecessary re-renders
    const contextValue = React.useMemo(() => ({ settings, setSettings }), [settings, setSettings]);

    return (
        <LocalGenerationSettingsContext.Provider value={contextValue}>
            {children}
        </LocalGenerationSettingsContext.Provider>
    );
};

/**
 * Main Provider - selects implementation based on runtime feature flag
 * 
 * Feature flag 'useSettingsStore' controls which implementation to use:
 * - true: Use Zustand-backed store (new, stable)
 * - false: Use legacy usePersistentState (old, fragile)
 */
export const LocalGenerationSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Legacy settings (IndexedDB / sessionStorage) for rollback path and flag source
    const [legacySettings, setLegacySettings] = usePersistentState<LocalGenerationSettings>(
        'localGenSettings',
        DEFAULT_LOCAL_GENERATION_SETTINGS
    );

    // Runtime feature flags from Zustand settings store (if it has been used)
    const storeFeatureFlags = useSettingsStore(state => state.featureFlags);

    // Prefer flags from settings store when present, otherwise fall back to legacy-persisted flags
    const flagSource = storeFeatureFlags ?? legacySettings.featureFlags;

    const useZustandStore = getFeatureFlag(flagSource, 'useSettingsStore');
    
    if (useZustandStore) {
        return <ZustandBackedProvider>{children}</ZustandBackedProvider>;
    }
    
    return (
        <LegacyProvider settings={legacySettings} setSettings={setLegacySettings}>
            {children}
        </LegacyProvider>
    );
};

export const useLocalGenerationSettings = (): LocalGenerationSettingsContextValue => {
    const context = useContext(LocalGenerationSettingsContext);
    if (!context) {
        throw new Error('useLocalGenerationSettings must be used within a LocalGenerationSettingsProvider');
    }
    return context;
};
