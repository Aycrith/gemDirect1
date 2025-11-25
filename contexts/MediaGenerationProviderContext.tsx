import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
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
    const [selectedProviderId, setSelectedProviderId] = usePersistentState<string>(MEDIA_PROVIDER_STORAGE_KEY, FALLBACK_MEDIA_PROVIDER.id);
    const { settings: localGenerationSettings } = useLocalGenerationSettings();

    const providers = DEFAULT_MEDIA_PROVIDERS;

    const availableProviders = useMemo(
        () => providers.filter(provider => provider.isAvailable),
        [providers]
    );

    const fallbackProvider = useMemo(() => {
        // CRITICAL: If local ComfyUI settings are configured, prefer comfyui-local
        // This prevents "API rate limit exceeded" errors when using local generation
        const hasDirectWorkflow = Boolean(localGenerationSettings?.workflowJson);
        const hasWorkflowProfiles = Boolean(
            localGenerationSettings?.workflowProfiles && 
            Object.keys(localGenerationSettings.workflowProfiles).length > 0 &&
            Object.values(localGenerationSettings.workflowProfiles).some(profile => profile.workflowJson)
        );
        const isComfyUIConfigured = localGenerationSettings?.comfyUIUrl && (hasDirectWorkflow || hasWorkflowProfiles);
        
        if (isComfyUIConfigured) {
            const localProvider = providers.find(provider => provider.id === 'comfyui-local');
            if (localProvider && localProvider.isAvailable) {
                console.log('[MediaGenerationProvider] Local ComfyUI configured - preferring local generation');
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
    }, [providers, localGenerationSettings]);

    useEffect(() => {
        const selected = providers.find(provider => provider.id === selectedProviderId);
        if (!fallbackProvider) {
            return;
        }
        
        // CRITICAL FIX: Auto-switch to local provider when ComfyUI becomes available
        // This prevents users from being stuck on Gemini and getting rate limit errors
        if (fallbackProvider.id === 'comfyui-local' && selectedProviderId === 'gemini-image') {
            console.log('[MediaGenerationProvider] ComfyUI now configured - auto-switching from Gemini to local generation');
            setSelectedProviderId(fallbackProvider.id);
            return;
        }
        
        if (!selected || !selected.isAvailable) {
            if (selectedProviderId !== fallbackProvider.id) {
                setSelectedProviderId(fallbackProvider.id);
            }
        }
    }, [selectedProviderId, providers, fallbackProvider, setSelectedProviderId]);

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

    const actions = useMemo(
        () => createMediaGenerationActions(activeProvider.id, localGenerationSettings),
        [activeProvider.id, localGenerationSettings]
    );

    const value = useMemo<MediaGenerationProviderContextValue>(() => ({
        providers,
        availableProviders,
        activeProvider,
        activeProviderId: activeProvider.id,
        selectProvider,
        actions,
    }), [providers, availableProviders, activeProvider, selectProvider, actions]);

    return (
        <MediaGenerationProviderContext.Provider value={value}>
            {children}
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
