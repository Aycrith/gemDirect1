import React, { createContext, useContext, useEffect, useState } from 'react';
import { LocalGenerationSettings } from '../types';
import { usePersistentState } from '../utils/hooks';
import { 
    WORKFLOW_PROFILE_DEFINITIONS, 
    PRIMARY_WORKFLOW_PROFILE_ID, 
    normalizeWorkflowProfiles, 
    DEFAULT_LOCAL_GENERATION_SETTINGS 
} from '../utils/contextConstants';

type LocalGenerationSettingsContextValue = {
    settings: LocalGenerationSettings;
    setSettings: React.Dispatch<React.SetStateAction<LocalGenerationSettings>>;
};

const LocalGenerationSettingsContext = createContext<LocalGenerationSettingsContextValue | undefined>(undefined);

export const LocalGenerationSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = usePersistentState<LocalGenerationSettings>('localGenSettings', DEFAULT_LOCAL_GENERATION_SETTINGS);
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
    }, [isInitialized]); // CRITICAL FIX: Only depends on init flag, not settings

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

export const useLocalGenerationSettings = (): LocalGenerationSettingsContextValue => {
    const context = useContext(LocalGenerationSettingsContext);
    if (!context) {
        throw new Error('useLocalGenerationSettings must be used within a LocalGenerationSettingsProvider');
    }
    return context;
};
