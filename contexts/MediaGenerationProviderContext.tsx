import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { MediaGenerationProvider } from '../types';
import { usePersistentState } from '../utils/hooks';
import { createMediaGenerationActions, MediaGenerationActions } from '../services/mediaGenerationService';
import { useLocalGenerationSettings } from './LocalGenerationSettingsContext';

const DEFAULT_MEDIA_PROVIDERS: MediaGenerationProvider[] = [
    {
        id: 'gemini-image',
        label: 'Gemini Image (Default)',
        description: 'Use Google Gemini Flash Image for remote keyframes and concept art.',
        isAvailable: true,
        isDefault: true,
        capabilities: { images: true, video: false },
    },
    {
        id: 'comfyui-local',
        label: 'Local ComfyUI',
        description: 'Leverage the configured ComfyUI server for local renders.',
        isAvailable: true,
        capabilities: { images: true, video: true },
    },
    {
        id: 'flux-pro',
        label: 'Flux Pro',
        description: 'Third-party diffusion model integration (coming soon).',
        isAvailable: false,
        disabledReason: 'Pending API integration work.',
        capabilities: { images: true, video: false },
    },
];

const FALLBACK_PROVIDER = DEFAULT_MEDIA_PROVIDERS.find(provider => provider.isDefault && provider.isAvailable)
    ?? DEFAULT_MEDIA_PROVIDERS.find(provider => provider.isAvailable)
    ?? DEFAULT_MEDIA_PROVIDERS[0];

const STORAGE_KEY = 'mediaGeneration.provider.selected';

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
    const [selectedProviderId, setSelectedProviderId] = usePersistentState<string>(STORAGE_KEY, FALLBACK_PROVIDER.id);
    const { settings: localGenerationSettings } = useLocalGenerationSettings();

    const providers = DEFAULT_MEDIA_PROVIDERS;

    const availableProviders = useMemo(
        () => providers.filter(provider => provider.isAvailable),
        [providers]
    );

    const fallbackProvider = useMemo(() => {
        // If local ComfyUI settings are configured, prefer comfyui-local
        if (localGenerationSettings?.comfyUIUrl && localGenerationSettings?.workflowJson) {
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
    }, [providers, localGenerationSettings]);

    useEffect(() => {
        const selected = providers.find(provider => provider.id === selectedProviderId);
        if (!fallbackProvider) {
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
