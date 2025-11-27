/**
 * useSceneStore - Feature-Flagged Scene State Hook
 * 
 * Provides a unified interface for scene state management that works
 * with both the new Zustand store (when enabled) and the existing
 * usePersistentState hooks (for backward compatibility).
 * 
 * This hook enables gradual migration by:
 * 1. Reading from the appropriate store based on feature flag
 * 2. Maintaining the same API regardless of underlying store
 * 3. Supporting parallel validation during migration
 * 
 * @module hooks/useSceneStore
 */

import { useCallback, useMemo } from 'react';
import {
    useSceneStateStore,
    useSceneStoreHydrated,
} from '../services/sceneStateStore';
import { getFeatureFlag } from '../utils/featureFlags';
import type {
    Scene,
    TimelineData,
    KeyframeData,
    GenerationJob,
    SceneImageGenerationStatus,
    LocalGenerationSettings,
} from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Scene store interface for components
 * This is the stable API that components use regardless of underlying store
 */
export interface SceneStoreInterface {
    // State
    scenes: Scene[];
    selectedSceneId: string | null;
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
    generationJobs: Record<string, GenerationJob>;
    isHydrated: boolean;
    
    // Scene Actions
    addScene: (scene: Scene) => void;
    updateScene: (sceneId: string, updates: Partial<Scene>) => void;
    deleteScene: (sceneId: string) => void;
    setScenes: (scenes: Scene[]) => void;
    
    // Selection
    setSelectedSceneId: (sceneId: string | null) => void;
    
    // Timeline
    setTimeline: (sceneId: string, timeline: TimelineData) => void;
    
    // Images
    setGeneratedImage: (sceneId: string, image: KeyframeData) => void;
    setShotImage: (shotId: string, image: string) => void;
    updateSceneImageStatus: (sceneId: string, status: Partial<SceneImageGenerationStatus>) => void;
    
    // Generation Jobs
    addGenerationJob: (job: GenerationJob) => void;
    updateJobProgress: (jobId: string, progress: number, currentNode?: string) => void;
    completeJob: (jobId: string, status: 'completed' | 'failed', result?: string, error?: string) => void;
    getActiveJobsForScene: (sceneId: string) => GenerationJob[];
}

/**
 * Props for the legacy fallback (when feature flag is disabled)
 */
export interface LegacySceneStoreProps {
    scenes: Scene[];
    setScenes: (scenes: Scene[] | ((prev: Scene[]) => Scene[])) => void;
    activeSceneId: string | null;
    setActiveSceneId: (id: string | null | ((prev: string | null) => string | null)) => void;
    generatedImages: Record<string, KeyframeData>;
    setGeneratedImages: (images: Record<string, KeyframeData> | ((prev: Record<string, KeyframeData>) => Record<string, KeyframeData>)) => void;
    generatedShotImages: Record<string, string>;
    setGeneratedShotImages: (images: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
    setSceneImageStatuses: (statuses: Record<string, SceneImageGenerationStatus> | ((prev: Record<string, SceneImageGenerationStatus>) => Record<string, SceneImageGenerationStatus>)) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Check if the unified scene store feature flag is enabled
 */
export function useUnifiedSceneStoreEnabled(settings?: LocalGenerationSettings | null): boolean {
    return getFeatureFlag(settings?.featureFlags, 'useUnifiedSceneStore');
}

/**
 * Hook to access scene state with feature flag support.
 * 
 * When `useUnifiedSceneStore` flag is enabled, uses the Zustand store.
 * Otherwise, returns undefined (caller should use legacy props).
 * 
 * @param settings - Local generation settings containing feature flags
 * @returns SceneStoreInterface if flag enabled, undefined otherwise
 */
export function useSceneStore(settings?: LocalGenerationSettings | null): SceneStoreInterface | undefined {
    const isEnabled = useUnifiedSceneStoreEnabled(settings);
    const isHydrated = useSceneStoreHydrated();
    
    // Zustand selectors - only used when flag is enabled
    const scenes = useSceneStateStore((state) => isEnabled ? state.scenes : []);
    const selectedSceneId = useSceneStateStore((state) => isEnabled ? state.selectedSceneId : null);
    const generatedImages = useSceneStateStore((state) => isEnabled ? state.generatedImages : {});
    const generatedShotImages = useSceneStateStore((state) => isEnabled ? state.generatedShotImages : {});
    const sceneImageStatuses = useSceneStateStore((state) => isEnabled ? state.sceneImageStatuses : {});
    const generationJobs = useSceneStateStore((state) => isEnabled ? state.generationJobs : {});
    
    // Actions from store
    const storeActions = useSceneStateStore((state) => ({
        addScene: state.addScene,
        updateScene: state.updateScene,
        deleteScene: state.deleteScene,
        setScenes: state.setScenes,
        setSelectedSceneId: state.setSelectedSceneId,
        setTimeline: state.setTimeline,
        setGeneratedImage: state.setGeneratedImage,
        setShotImage: state.setShotImage,
        updateSceneImageStatus: state.updateSceneImageStatus,
        addGenerationJob: state.addGenerationJob,
        updateJobProgress: state.updateJobProgress,
        completeJob: state.completeJob,
        getActiveJobsForScene: state.getActiveJobsForScene,
    }));
    
    // Memoize the interface to prevent unnecessary re-renders
    const storeInterface = useMemo((): SceneStoreInterface | undefined => {
        if (!isEnabled) {
            return undefined;
        }
        
        return {
            scenes,
            selectedSceneId,
            generatedImages,
            generatedShotImages,
            sceneImageStatuses,
            generationJobs,
            isHydrated,
            ...storeActions,
        };
    }, [
        isEnabled,
        scenes,
        selectedSceneId,
        generatedImages,
        generatedShotImages,
        sceneImageStatuses,
        generationJobs,
        isHydrated,
        storeActions,
    ]);
    
    return storeInterface;
}

/**
 * Hook to create a scene store interface from legacy props.
 * 
 * This allows components to work with the same interface regardless
 * of whether the new store is enabled or legacy props are used.
 * 
 * @param props - Legacy scene state props from App.tsx
 * @returns SceneStoreInterface
 */
export function useLegacySceneStore(props: LegacySceneStoreProps): SceneStoreInterface {
    const {
        scenes,
        setScenes,
        activeSceneId,
        setActiveSceneId,
        generatedImages,
        setGeneratedImages,
        generatedShotImages,
        setGeneratedShotImages,
        sceneImageStatuses,
        setSceneImageStatuses,
    } = props;
    
    // Wrap legacy setters to match store interface
    const addScene = useCallback((scene: Scene) => {
        setScenes((prev) => [...prev, scene]);
    }, [setScenes]);
    
    const updateScene = useCallback((sceneId: string, updates: Partial<Scene>) => {
        setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, ...updates } : s));
    }, [setScenes]);
    
    const deleteScene = useCallback((sceneId: string) => {
        setScenes((prev) => prev.filter((s) => s.id !== sceneId));
        setGeneratedImages((prev) => {
            const next = { ...prev };
            delete next[sceneId];
            return next;
        });
    }, [setScenes, setGeneratedImages]);
    
    const setScenesWrapped = useCallback((newScenes: Scene[]) => {
        setScenes(newScenes);
    }, [setScenes]);
    
    const setSelectedSceneId = useCallback((sceneId: string | null) => {
        setActiveSceneId(sceneId);
    }, [setActiveSceneId]);
    
    const setTimeline = useCallback((sceneId: string, timeline: TimelineData) => {
        setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, timeline } : s));
    }, [setScenes]);
    
    const setGeneratedImage = useCallback((sceneId: string, image: KeyframeData) => {
        setGeneratedImages((prev) => ({ ...prev, [sceneId]: image }));
    }, [setGeneratedImages]);
    
    const setShotImage = useCallback((shotId: string, image: string) => {
        setGeneratedShotImages((prev) => ({ ...prev, [shotId]: image }));
    }, [setGeneratedShotImages]);
    
    const updateSceneImageStatus = useCallback((sceneId: string, status: Partial<SceneImageGenerationStatus>) => {
        setSceneImageStatuses((prev) => ({
            ...prev,
            [sceneId]: { ...(prev[sceneId] ?? { status: 'idle' }), ...status },
        }));
    }, [setSceneImageStatuses]);
    
    // Legacy store doesn't support generation jobs - provide no-ops
    const addGenerationJob = useCallback((_job: GenerationJob) => {
        console.warn('[useLegacySceneStore] Generation jobs not supported in legacy mode');
    }, []);
    
    const updateJobProgress = useCallback((_jobId: string, _progress: number, _currentNode?: string) => {
        // No-op in legacy mode
    }, []);
    
    const completeJob = useCallback((_jobId: string, _status: 'completed' | 'failed', _result?: string, _error?: string) => {
        // No-op in legacy mode
    }, []);
    
    const getActiveJobsForScene = useCallback((_sceneId: string): GenerationJob[] => {
        return []; // No job tracking in legacy mode
    }, []);
    
    return useMemo(() => ({
        scenes,
        selectedSceneId: activeSceneId,
        generatedImages,
        generatedShotImages,
        sceneImageStatuses,
        generationJobs: {},
        isHydrated: true, // Legacy is always "hydrated"
        addScene,
        updateScene,
        deleteScene,
        setScenes: setScenesWrapped,
        setSelectedSceneId,
        setTimeline,
        setGeneratedImage,
        setShotImage,
        updateSceneImageStatus,
        addGenerationJob,
        updateJobProgress,
        completeJob,
        getActiveJobsForScene,
    }), [
        scenes,
        activeSceneId,
        generatedImages,
        generatedShotImages,
        sceneImageStatuses,
        addScene,
        updateScene,
        deleteScene,
        setScenesWrapped,
        setSelectedSceneId,
        setTimeline,
        setGeneratedImage,
        setShotImage,
        updateSceneImageStatus,
        addGenerationJob,
        updateJobProgress,
        completeJob,
        getActiveJobsForScene,
    ]);
}

/**
 * Combined hook that automatically selects the right store implementation.
 * 
 * @param settings - Settings containing feature flags
 * @param legacyProps - Legacy props to use when flag is disabled
 * @returns SceneStoreInterface from either new store or legacy wrapper
 */
export function useSceneStoreWithFallback(
    settings: LocalGenerationSettings | null | undefined,
    legacyProps: LegacySceneStoreProps
): SceneStoreInterface {
    const newStore = useSceneStore(settings);
    const legacyStore = useLegacySceneStore(legacyProps);
    
    // Return new store if enabled, otherwise legacy
    return newStore ?? legacyStore;
}
