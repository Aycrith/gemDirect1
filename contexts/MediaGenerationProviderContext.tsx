import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { HydrationGate } from './HydrationContext';
import { MediaGenerationProvider } from '../types';
import { usePersistentState } from '../utils/hooks';
import { createMediaGenerationActions, MediaGenerationActions } from '../services/mediaGenerationService';
import { useLocalGenerationSettings } from './LocalGenerationSettingsContext';
import { DEFAULT_MEDIA_PROVIDERS, FALLBACK_MEDIA_PROVIDER, MEDIA_PROVIDER_STORAGE_KEY } from '../utils/contextConstants';

type MediaGenerationProviderContextValue = {
    providers: MediaGenerationProvider[];
    availableProviders: MediaGenerationProvider[];
    activeProvider: MediaGenerationProvider;
    activeProviderId: string;
    selectProvider: (id: string) => void;
    actions: MediaGenerationActions;
};

const MediaGenerationProviderContext = createContext<MediaGenerationProviderContextValue | undefined>(undefined);

export const MediaGenerationProviderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    console.error('[MediaGenerationProvider] Rendering...');
    const initialProviderId = FALLBACK_MEDIA_PROVIDER?.id ?? DEFAULT_MEDIA_PROVIDERS[0]?.id ?? 'default';
    const [selectedProviderId, setSelectedProviderId] = usePersistentState<string>(MEDIA_PROVIDER_STORAGE_KEY, initialProviderId);
    const { settings: localGenerationSettings } = useLocalGenerationSettings();

    // Debug logging
    console.error(`[MediaGenerationProvider] Render. Settings ref: ${localGenerationSettings === undefined ? 'undefined' : 'defined'}`);
    
    useEffect(() => {
        const profileCount = localGenerationSettings?.workflowProfiles ? Object.keys(localGenerationSettings.workflowProfiles).length : 0;
        const hasJson = localGenerationSettings?.workflowProfiles && Object.values(localGenerationSettings.workflowProfiles).some(p => p.workflowJson?.length > 0);
        console.error(`[MediaGenerationProvider] Effect: Received settings update. Profiles: ${profileCount}, HasJSON: ${hasJson}`);
    }, [localGenerationSettings]);

    const providers = DEFAULT_MEDIA_PROVIDERS;

    const availableProviders = useMemo(
        () => providers.filter(provider => provider.isAvailable),
        [providers]
    );

    // CRITICAL FIX (2025-12-01): Extract PRIMITIVE values to use as stable useMemo dependencies
    // Previously this useMemo depended on the entire localGenerationSettings object.
    // Because usePersistentState returns a new object reference on every hydration/update,
    // this caused the useMemo to recalculate on EVERY render, causing infinite loops.
    // Solution: Extract the specific primitive values we need, and use those as dependencies.
    const comfyUIUrl = localGenerationSettings?.comfyUIUrl ?? '';
    const directWorkflowJson = localGenerationSettings?.workflowJson ?? '';
    
    // Compute a stable primitive representing whether any workflow profile has a workflow
    const hasValidWorkflowProfile = useMemo(() => {
        if (!localGenerationSettings?.workflowProfiles) return false;
        const profiles = Object.values(localGenerationSettings.workflowProfiles);
        return profiles.length > 0 && profiles.some(profile => Boolean(profile?.workflowJson));
    }, [localGenerationSettings?.workflowProfiles]);
    
    // Track logged state to prevent console spam
    const prevLoggedConfigRef = useRef<string | null>(null);

    const fallbackProvider = useMemo(() => {
        // CRITICAL: If local ComfyUI settings are configured, prefer comfyui-local
        // This prevents "API rate limit exceeded" errors when using local generation
        const hasDirectWorkflow = directWorkflowJson.length > 0;
        const isComfyUIConfigured = comfyUIUrl.length > 0 && (hasDirectWorkflow || hasValidWorkflowProfile);
        
        // Log only when configuration actually changes
        const configKey = `${comfyUIUrl}|${hasDirectWorkflow}|${hasValidWorkflowProfile}`;
        if (configKey !== prevLoggedConfigRef.current) {
            if (isComfyUIConfigured) {
                console.log('[MediaGenerationProvider] Local ComfyUI configured - preferring local generation');
            }
            prevLoggedConfigRef.current = configKey;
        }
        
        if (isComfyUIConfigured) {
            const localProvider = providers.find(provider => provider.id === 'comfyui-local');
            if (localProvider && localProvider.isAvailable) {
                return localProvider;
            }
        }
        
        // Otherwise fall back to the default available provider
        const defaultAvailable = providers.find(provider => provider.isDefault && provider.isAvailable);
        if (defaultAvailable) {
            return defaultAvailable;
        }
        const firstAvailable = providers.find(provider => provider.isAvailable);
        return firstAvailable ?? providers[0];
    }, [providers, comfyUIUrl, directWorkflowJson, hasValidWorkflowProfile]);

    // Ref to track if we've already auto-switched to prevent infinite loop
    // When setSelectedProviderId is called, it triggers a re-render, which could
    // re-trigger this effect if we compare object references instead of IDs
    const hasAutoSwitchedRef = useRef(false);
    
    // Compute comfyUIConfigured from the primitives we already extracted (no object refs)
    const comfyUIConfigured = comfyUIUrl.length > 0 && (directWorkflowJson.length > 0 || hasValidWorkflowProfile);
    const prevComfyUIConfiguredRef = useRef(comfyUIConfigured);
    
    useEffect(() => {
        // Reset auto-switch when ComfyUI config changes from false to true
        if (comfyUIConfigured && !prevComfyUIConfiguredRef.current) {
            hasAutoSwitchedRef.current = false;
        }
        prevComfyUIConfiguredRef.current = comfyUIConfigured;
    }, [comfyUIConfigured]);

    useEffect(() => {
        const selected = providers.find(provider => provider.id === selectedProviderId);
        if (!fallbackProvider) {
            return;
        }
        
        // Use fallbackProvider.id to avoid object reference comparison issues
        const fallbackId = fallbackProvider.id;
        
        // Auto-switch to local provider when ComfyUI becomes available (only once)
        // This prevents users from being stuck on Gemini and getting rate limit errors
        if (!hasAutoSwitchedRef.current && fallbackId === 'comfyui-local' && selectedProviderId === 'gemini-image') {
            hasAutoSwitchedRef.current = true;
            console.log('[MediaGenerationProvider] ComfyUI now configured - auto-switching from Gemini to local generation');
            setSelectedProviderId(fallbackId);
            return;
        }
        
        // Fallback for unavailable provider (always check this)
        if (!selected || !selected.isAvailable) {
            if (selectedProviderId !== fallbackId) {
                setSelectedProviderId(fallbackId);
            }
        }
    }, [selectedProviderId, providers, fallbackProvider?.id, setSelectedProviderId]);

    const activeProvider = useMemo(() => {
        const match = providers.find(provider => provider.id === selectedProviderId && provider.isAvailable);
        return match ?? fallbackProvider;
    }, [providers, selectedProviderId, fallbackProvider]);

    const selectProvider = useCallback(
        (id: string) => {
            const target = providers.find(provider => provider.id === id);
            if (!target) {
                console.warn(`[MediaGenerationProvider] Unknown provider requested: ${id}`);
                return;
            }
            if (!target.isAvailable) {
                console.warn(`[MediaGenerationProvider] Provider ${id} is not available yet.`);
                return;
            }
            setSelectedProviderId(id);
        },
        [providers, setSelectedProviderId]
    );

    // FIX (2025-12-01): Create a stable key for localGenerationSettings to prevent infinite loops
    // The localGenerationSettings object gets a new reference on every render from usePersistentState,
    // which was causing the actions useMemo to recompute infinitely.
    // Solution: Use a ref to cache the settings and only update when content actually changes.
    
    // Compute a content hash from the settings (no object refs in dependency array!)
    const computeSettingsHash = (): string => {
        if (!localGenerationSettings) return '';
        const mappingKeys = localGenerationSettings.mapping 
            ? Object.keys(localGenerationSettings.mapping).sort().join(',') 
            : '';
        
        // Include profile keys AND a content checksum (e.g. length of workflowJson)
        // This ensures we detect when profiles are populated with actual workflow data
        const profileKeys = localGenerationSettings.workflowProfiles 
            ? Object.keys(localGenerationSettings.workflowProfiles).sort().map(key => {
                const profile = localGenerationSettings.workflowProfiles![key];
                const jsonLen = profile?.workflowJson?.length ?? 0;
                return `${key}:${jsonLen}`;
            }).join(',') 
            : '';
            
        return `${localGenerationSettings.comfyUIUrl ?? ''}|${localGenerationSettings.comfyUIClientId ?? ''}|${(localGenerationSettings.workflowJson ?? '').substring(0, 50)}|${mappingKeys}|${profileKeys}`;
    };
    
    // Use refs to cache settings and avoid infinite loops
    const settingsHashRef = useRef<string>(computeSettingsHash());
    const settingsCacheRef = useRef(localGenerationSettings);
    
    // Log initialization
    useEffect(() => {
        console.log('[MediaGenerationProvider] Mounted. Initial hash:', settingsHashRef.current);
    }, []);

    // Update cache when content actually changes
    const currentHash = computeSettingsHash();
    
    // Debug logging for profiles specifically
    const profileDebug = localGenerationSettings?.workflowProfiles 
        ? Object.entries(localGenerationSettings.workflowProfiles).map(([k, v]) => `${k}:${v?.workflowJson?.length ?? 0}`).join(', ')
        : 'undefined';
    console.error(`[MediaGenerationProvider] Profiles Debug: ${profileDebug}`);
    
    if (currentHash !== settingsHashRef.current) {
        console.error('[MediaGenerationProvider] Settings hash changed:', currentHash);
        console.error('[MediaGenerationProvider] Profiles count:', localGenerationSettings?.workflowProfiles ? Object.keys(localGenerationSettings.workflowProfiles).length : 0);
        settingsHashRef.current = currentHash;
        settingsCacheRef.current = localGenerationSettings;
    }
    
    // Now use the cached ref value (stable reference) for actions
    const stableSettings = settingsCacheRef.current;

    const actions = useMemo(() => {
        if (!activeProvider) {
            throw new Error('[MediaGenerationProvider] No active provider available');
        }
        return createMediaGenerationActions(activeProvider.id, stableSettings);
    // settingsHashRef.current provides stable dependency - only changes when content changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProvider?.id, settingsHashRef.current]);

    const value = useMemo<MediaGenerationProviderContextValue>(() => {
        if (!activeProvider) {
            throw new Error('[MediaGenerationProvider] No active provider available');
        }
        return {
            providers,
            availableProviders,
            activeProvider,
            activeProviderId: activeProvider.id,
            selectProvider,
            actions,
        };
    }, [providers, availableProviders, activeProvider, selectProvider, actions]);

    return (
        <MediaGenerationProviderContext.Provider value={value}>
            <HydrationGate>
                {children}
            </HydrationGate>
        </MediaGenerationProviderContext.Provider>
    );
};

export const useMediaGenerationProvider = (): MediaGenerationProviderContextValue => {
    const context = useContext(MediaGenerationProviderContext);
    if (!context) {
        throw new Error('useMediaGenerationProvider must be used within a MediaGenerationProviderProvider');
    }
    return context;
};

export const useMediaGenerationActions = (): MediaGenerationActions => {
    return useMediaGenerationProvider().actions;
};
