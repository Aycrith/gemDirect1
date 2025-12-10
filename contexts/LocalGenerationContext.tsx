/**
 * Local Generation Context
 * 
 * Provides global access to local video generation status across all React components.
 * This enables any component in the tree to access and display video generation results
 * without prop drilling.
 * 
 * This context bridges with the existing usePersistentState in App.tsx to maintain
 * backward compatibility while providing easier access to components.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { HydrationGate } from './HydrationContext';
import type { LocalGenerationStatus } from '../types';

/**
 * State shape for local generation status across all scenes
 */
export type LocalGenerationState = Record<string, LocalGenerationStatus>;

/**
 * Context value interface
 */
interface LocalGenerationContextValue {
    /** Map of scene ID to generation status */
    generationStatus: LocalGenerationState;
    
    /** Get status for a specific scene */
    getStatus: (sceneId: string) => LocalGenerationStatus | undefined;
    
    /** Update status for a specific scene */
    updateStatus: (sceneId: string, update: Partial<LocalGenerationStatus>) => void;
    
    /** Set complete status for a scene (replaces existing) */
    setStatus: (sceneId: string, status: LocalGenerationStatus) => void;
    
    /** Clear status for a specific scene (reset to idle) */
    clearStatus: (sceneId: string) => void;
    
    /** Clear all generation status */
    clearAll: () => void;
    
    /** Check if any scene is currently generating */
    isAnyGenerating: boolean;
    
    /** Get list of scene IDs with completed videos */
    completedSceneIds: string[];
}

const defaultStatus: LocalGenerationStatus = {
    status: 'idle',
    message: '',
    progress: 0
};

const LocalGenerationContext = createContext<LocalGenerationContextValue | undefined>(undefined);

interface LocalGenerationProviderProps {
    children: React.ReactNode;
    /** Optional: External state from usePersistentState for backward compatibility */
    externalState?: LocalGenerationState;
    /** Optional: External setState from usePersistentState for backward compatibility */
    onExternalStateChange?: React.Dispatch<React.SetStateAction<LocalGenerationState>>;
}

/**
 * Provider component for local generation status
 * Can optionally sync with external persistent state for backward compatibility
 */
export const LocalGenerationProvider: React.FC<LocalGenerationProviderProps> = ({ 
    children,
    externalState,
    onExternalStateChange
}) => {
    // Use external state if provided, otherwise use internal state
    const [internalState, setInternalState] = useState<LocalGenerationState>({});
    
    const generationStatus = externalState ?? internalState;
    const setGenerationStatus = onExternalStateChange ?? setInternalState;
    
    const getStatus = useCallback((sceneId: string): LocalGenerationStatus | undefined => {
        return generationStatus[sceneId];
    }, [generationStatus]);
    
    const updateStatus = useCallback((sceneId: string, update: Partial<LocalGenerationStatus>) => {
        setGenerationStatus(prev => ({
            ...prev,
            [sceneId]: {
                ...(prev[sceneId] || defaultStatus),
                ...update
            }
        }));
    }, [setGenerationStatus]);
    
    const setStatus = useCallback((sceneId: string, status: LocalGenerationStatus) => {
        setGenerationStatus(prev => ({
            ...prev,
            [sceneId]: status
        }));
    }, [setGenerationStatus]);
    
    const clearStatus = useCallback((sceneId: string) => {
        setGenerationStatus(prev => ({
            ...prev,
            [sceneId]: defaultStatus
        }));
    }, [setGenerationStatus]);
    
    const clearAll = useCallback(() => {
        setGenerationStatus({});
    }, [setGenerationStatus]);
    
    const isAnyGenerating = useMemo(() => {
        return Object.values(generationStatus).some(
            status => status.status === 'queued' || status.status === 'running'
        );
    }, [generationStatus]);
    
    const completedSceneIds = useMemo(() => {
        return Object.entries(generationStatus)
            .filter(([_, status]) => 
                status.status === 'complete' && 
                status.final_output?.type === 'video' &&
                status.final_output?.data?.startsWith('data:video/')
            )
            .map(([sceneId]) => sceneId);
    }, [generationStatus]);
    
    const value = useMemo<LocalGenerationContextValue>(() => ({
        generationStatus,
        getStatus,
        updateStatus,
        setStatus,
        clearStatus,
        clearAll,
        isAnyGenerating,
        completedSceneIds
    }), [generationStatus, getStatus, updateStatus, setStatus, clearStatus, clearAll, isAnyGenerating, completedSceneIds]);
    
    return (
        <LocalGenerationContext.Provider value={value}>
            <HydrationGate>
                {children}
            </HydrationGate>
        </LocalGenerationContext.Provider>
    );
};

/**
 * Hook to access local generation context
 * @throws Error if used outside of LocalGenerationProvider
 */
export const useLocalGeneration = (): LocalGenerationContextValue => {
    const context = useContext(LocalGenerationContext);
    if (!context) {
        throw new Error('useLocalGeneration must be used within a LocalGenerationProvider');
    }
    return context;
};

/**
 * Hook to get generation status for a specific scene
 * @param sceneId - The scene ID to get status for
 * @returns The generation status or undefined if not available
 */
export const useSceneGenerationStatus = (sceneId: string | undefined): LocalGenerationStatus | undefined => {
    const { getStatus } = useLocalGeneration();
    return sceneId ? getStatus(sceneId) : undefined;
};

/**
 * Optional hook that returns undefined if context is not available
 * Useful for components that may be used outside the provider
 */
export const useLocalGenerationOptional = (): LocalGenerationContextValue | undefined => {
    return useContext(LocalGenerationContext);
};
