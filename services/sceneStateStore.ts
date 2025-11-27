/**
 * Scene State Store - Unified State Management for DirectScenes
 * 
 * Provides a centralized Zustand store for all scene-related state,
 * solving the state persistence issues caused by scattered usePersistentState hooks.
 * 
 * ## Key Features
 * - Unified state for scenes, timelines, images, and generation jobs
 * - IndexedDB persistence with automatic hydration
 * - Generation job tracking that survives page refresh
 * - Feature-flagged for gradual migration
 * 
 * ## Usage
 * ```typescript
 * import { useSceneStateStore } from './services/sceneStateStore';
 * 
 * // In component
 * const scenes = useSceneStateStore(state => state.scenes);
 * const addScene = useSceneStateStore(state => state.addScene);
 * ```
 * 
 * @module services/sceneStateStore
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
    Scene,
    TimelineData,
    KeyframeData,
    GenerationJob,
    GenerationJobStatus,
    VideoData,
    SceneImageGenerationStatus,
} from '../types';
import { createIndexedDBStorage } from '../utils/zustandIndexedDBStorage';

// ============================================================================
// Store State Interface
// ============================================================================

/**
 * Complete state interface for the scene state store
 */
export interface SceneStateStoreState {
    // ========================================================================
    // Core Scene Data
    // ========================================================================
    
    /** All scenes in the project */
    scenes: Scene[];
    
    /** Timelines keyed by scene ID (for quick lookup) */
    timelines: Record<string, TimelineData>;
    
    // ========================================================================
    // Generated Assets
    // ========================================================================
    
    /** Generated keyframe images keyed by scene ID */
    generatedImages: Record<string, KeyframeData>;
    
    /** Generated shot images keyed by shot ID */
    generatedShotImages: Record<string, string>;
    
    /** Generated videos keyed by scene/shot ID */
    generatedVideos: Record<string, VideoData>;
    
    // ========================================================================
    // Generation State
    // ========================================================================
    
    /** Active and historical generation jobs */
    generationJobs: Record<string, GenerationJob>;
    
    /** Scene-level image generation status (legacy compatibility) */
    sceneImageStatuses: Record<string, SceneImageGenerationStatus>;
    
    // ========================================================================
    // UI State (Persisted)
    // ========================================================================
    
    /** Currently selected scene ID */
    selectedSceneId: string | null;
    
    /** Set of expanded shot IDs in the timeline editor */
    expandedShots: string[];
    
    // ========================================================================
    // Sync Metadata
    // ========================================================================
    
    /** Last successful sync timestamp */
    lastSyncTimestamp: number;
    
    /** Whether the store has been hydrated from storage */
    _hasHydrated: boolean;
}

/**
 * Store actions interface
 */
export interface SceneStateStoreActions {
    // ========================================================================
    // Scene CRUD
    // ========================================================================
    
    /** Add a new scene */
    addScene: (scene: Scene) => void;
    
    /** Update an existing scene by ID */
    updateScene: (sceneId: string, updates: Partial<Scene>) => void;
    
    /** Delete a scene by ID */
    deleteScene: (sceneId: string) => void;
    
    /** Replace all scenes (bulk update) */
    setScenes: (scenes: Scene[]) => void;
    
    /** Get a scene by ID */
    getScene: (sceneId: string) => Scene | undefined;
    
    // ========================================================================
    // Timeline Management
    // ========================================================================
    
    /** Set timeline for a scene */
    setTimeline: (sceneId: string, timeline: TimelineData) => void;
    
    /** Get timeline for a scene */
    getTimeline: (sceneId: string) => TimelineData | undefined;
    
    // ========================================================================
    // Generated Assets
    // ========================================================================
    
    /** Set keyframe image for a scene */
    setGeneratedImage: (sceneId: string, image: KeyframeData) => void;
    
    /** Set shot image */
    setShotImage: (shotId: string, image: string) => void;
    
    /** Set video data */
    setVideo: (key: string, video: VideoData) => void;
    
    /** Clear all generated assets for a scene */
    clearSceneAssets: (sceneId: string) => void;
    
    // ========================================================================
    // Generation Job Tracking
    // ========================================================================
    
    /** Add a new generation job */
    addGenerationJob: (job: GenerationJob) => void;
    
    /** Update a generation job */
    updateGenerationJob: (jobId: string, updates: Partial<GenerationJob>) => void;
    
    /** Update job progress */
    updateJobProgress: (jobId: string, progress: number, currentNode?: string) => void;
    
    /** Complete a job (success or failure) */
    completeJob: (jobId: string, status: 'completed' | 'failed', result?: string, error?: string) => void;
    
    /** Cancel a job */
    cancelJob: (jobId: string) => void;
    
    /** Get all active jobs for a scene */
    getActiveJobsForScene: (sceneId: string) => GenerationJob[];
    
    /** Clean up completed/failed jobs older than a threshold */
    cleanupOldJobs: (maxAgeMs?: number) => void;
    
    // ========================================================================
    // Scene Image Status (Legacy Compatibility)
    // ========================================================================
    
    /** Update scene image generation status */
    updateSceneImageStatus: (sceneId: string, status: Partial<SceneImageGenerationStatus>) => void;
    
    // ========================================================================
    // UI State
    // ========================================================================
    
    /** Set selected scene */
    setSelectedSceneId: (sceneId: string | null) => void;
    
    /** Toggle shot expansion */
    toggleShotExpanded: (shotId: string) => void;
    
    /** Set multiple shots expanded state */
    setExpandedShots: (shotIds: string[]) => void;
    
    // ========================================================================
    // Store Management
    // ========================================================================
    
    /** Reset store to initial state */
    resetStore: () => void;
    
    /** Force sync to storage */
    forceSync: () => void;
    
    /** Set hydration status */
    setHasHydrated: (value: boolean) => void;
}

/**
 * Combined store type
 */
export type SceneStateStore = SceneStateStoreState & SceneStateStoreActions;

// ============================================================================
// Initial State
// ============================================================================

const INITIAL_STATE: SceneStateStoreState = {
    scenes: [],
    timelines: {},
    generatedImages: {},
    generatedShotImages: {},
    generatedVideos: {},
    generationJobs: {},
    sceneImageStatuses: {},
    selectedSceneId: null,
    expandedShots: [],
    lastSyncTimestamp: 0,
    _hasHydrated: false,
};

// ============================================================================
// Store Creation
// ============================================================================

/**
 * Scene state store name for persistence
 */
export const SCENE_STORE_NAME = 'gemDirect-scene-store';

/**
 * Default max age for job cleanup (24 hours)
 */
const DEFAULT_JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Create the scene state store with persistence
 */
export const useSceneStateStore = create<SceneStateStore>()(
    subscribeWithSelector(
        persist(
            (set, get) => ({
                // Initial state
                ...INITIAL_STATE,
                
                // ============================================================
                // Scene CRUD
                // ============================================================
                
                addScene: (scene) => {
                    set((state) => ({
                        scenes: [...state.scenes, scene],
                        timelines: scene.timeline 
                            ? { ...state.timelines, [scene.id]: scene.timeline }
                            : state.timelines,
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                updateScene: (sceneId, updates) => {
                    set((state) => ({
                        scenes: state.scenes.map((s) =>
                            s.id === sceneId ? { ...s, ...updates } : s
                        ),
                        timelines: updates.timeline
                            ? { ...state.timelines, [sceneId]: updates.timeline }
                            : state.timelines,
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                deleteScene: (sceneId) => {
                    set((state) => {
                        const newTimelines = { ...state.timelines };
                        delete newTimelines[sceneId];
                        
                        const newImages = { ...state.generatedImages };
                        delete newImages[sceneId];
                        
                        const newStatuses = { ...state.sceneImageStatuses };
                        delete newStatuses[sceneId];
                        
                        const newVideos = { ...state.generatedVideos };
                        // Delete videos with matching sceneId
                        Object.keys(newVideos).forEach((key) => {
                            const video = newVideos[key];
                            if (video && video.sceneId === sceneId) {
                                delete newVideos[key];
                            }
                        });
                        
                        return {
                            scenes: state.scenes.filter((s) => s.id !== sceneId),
                            timelines: newTimelines,
                            generatedImages: newImages,
                            sceneImageStatuses: newStatuses,
                            generatedVideos: newVideos,
                            selectedSceneId: state.selectedSceneId === sceneId 
                                ? null 
                                : state.selectedSceneId,
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                setScenes: (scenes) => {
                    set((state) => {
                        // Build timelines map from scenes
                        const timelines: Record<string, TimelineData> = {};
                        scenes.forEach((scene) => {
                            if (scene.timeline) {
                                timelines[scene.id] = scene.timeline;
                            }
                        });
                        
                        return {
                            scenes,
                            timelines: { ...state.timelines, ...timelines },
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                getScene: (sceneId) => {
                    return get().scenes.find((s) => s.id === sceneId);
                },
                
                // ============================================================
                // Timeline Management
                // ============================================================
                
                setTimeline: (sceneId, timeline) => {
                    set((state) => {
                        // Also update the scene's timeline reference
                        const scenes = state.scenes.map((s) =>
                            s.id === sceneId ? { ...s, timeline } : s
                        );
                        
                        return {
                            scenes,
                            timelines: { ...state.timelines, [sceneId]: timeline },
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                getTimeline: (sceneId) => {
                    return get().timelines[sceneId];
                },
                
                // ============================================================
                // Generated Assets
                // ============================================================
                
                setGeneratedImage: (sceneId, image) => {
                    set((state) => ({
                        generatedImages: { ...state.generatedImages, [sceneId]: image },
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                setShotImage: (shotId, image) => {
                    set((state) => ({
                        generatedShotImages: { ...state.generatedShotImages, [shotId]: image },
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                setVideo: (key, video) => {
                    set((state) => ({
                        generatedVideos: { ...state.generatedVideos, [key]: video },
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                clearSceneAssets: (sceneId) => {
                    set((state) => {
                        const newImages = { ...state.generatedImages };
                        delete newImages[sceneId];
                        
                        const newStatuses = { ...state.sceneImageStatuses };
                        delete newStatuses[sceneId];
                        
                        // Clear shot images for this scene
                        const scene = state.scenes.find((s) => s.id === sceneId);
                        const newShotImages = { ...state.generatedShotImages };
                        if (scene?.timeline?.shots) {
                            scene.timeline.shots.forEach((shot) => {
                                delete newShotImages[shot.id];
                            });
                        }
                        
                        return {
                            generatedImages: newImages,
                            generatedShotImages: newShotImages,
                            sceneImageStatuses: newStatuses,
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                // ============================================================
                // Generation Job Tracking
                // ============================================================
                
                addGenerationJob: (job) => {
                    set((state) => ({
                        generationJobs: { ...state.generationJobs, [job.id]: job },
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                updateGenerationJob: (jobId, updates) => {
                    set((state) => {
                        const existingJob = state.generationJobs[jobId];
                        if (!existingJob) return state;
                        
                        return {
                            generationJobs: {
                                ...state.generationJobs,
                                [jobId]: { ...existingJob, ...updates },
                            },
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                updateJobProgress: (jobId, progress, currentNode) => {
                    set((state) => {
                        const existingJob = state.generationJobs[jobId];
                        if (!existingJob) return state;
                        
                        return {
                            generationJobs: {
                                ...state.generationJobs,
                                [jobId]: {
                                    ...existingJob,
                                    progress,
                                    currentNode: currentNode ?? existingJob.currentNode,
                                    status: progress > 0 && existingJob.status === 'queued' 
                                        ? 'in-progress' 
                                        : existingJob.status,
                                    startedAt: existingJob.startedAt ?? (progress > 0 ? Date.now() : undefined),
                                },
                            },
                        };
                    });
                },
                
                completeJob: (jobId, status, result, error) => {
                    set((state) => {
                        const existingJob = state.generationJobs[jobId];
                        if (!existingJob) return state;
                        
                        return {
                            generationJobs: {
                                ...state.generationJobs,
                                [jobId]: {
                                    ...existingJob,
                                    status,
                                    progress: status === 'completed' ? 100 : existingJob.progress,
                                    completedAt: Date.now(),
                                    result,
                                    error,
                                },
                            },
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                cancelJob: (jobId) => {
                    set((state) => {
                        const existingJob = state.generationJobs[jobId];
                        if (!existingJob) return state;
                        
                        return {
                            generationJobs: {
                                ...state.generationJobs,
                                [jobId]: {
                                    ...existingJob,
                                    status: 'cancelled' as GenerationJobStatus,
                                    completedAt: Date.now(),
                                },
                            },
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                getActiveJobsForScene: (sceneId) => {
                    const jobs = get().generationJobs;
                    return Object.values(jobs).filter(
                        (job) => 
                            job.sceneId === sceneId && 
                            (job.status === 'pending' || job.status === 'queued' || job.status === 'in-progress')
                    );
                },
                
                cleanupOldJobs: (maxAgeMs = DEFAULT_JOB_MAX_AGE_MS) => {
                    const now = Date.now();
                    set((state) => {
                        const newJobs: Record<string, GenerationJob> = {};
                        
                        Object.entries(state.generationJobs).forEach(([id, job]) => {
                            // Keep active jobs
                            if (job.status === 'pending' || job.status === 'queued' || job.status === 'in-progress') {
                                newJobs[id] = job;
                                return;
                            }
                            
                            // Keep recent completed/failed jobs
                            const jobAge = now - (job.completedAt ?? job.createdAt);
                            if (jobAge < maxAgeMs) {
                                newJobs[id] = job;
                            }
                        });
                        
                        return {
                            generationJobs: newJobs,
                            lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                // ============================================================
                // Scene Image Status (Legacy Compatibility)
                // ============================================================
                
                updateSceneImageStatus: (sceneId, status) => {
                    set((state) => ({
                        sceneImageStatuses: {
                            ...state.sceneImageStatuses,
                            [sceneId]: {
                                ...(state.sceneImageStatuses[sceneId] ?? { status: 'idle' }),
                                ...status,
                            },
                        },
                        lastSyncTimestamp: Date.now(),
                    }));
                },
                
                // ============================================================
                // UI State
                // ============================================================
                
                setSelectedSceneId: (sceneId) => {
                    set(() => ({
                        selectedSceneId: sceneId,
                    }));
                },
                
                toggleShotExpanded: (shotId) => {
                    set((state) => {
                        const isExpanded = state.expandedShots.includes(shotId);
                        return {
                            expandedShots: isExpanded
                                ? state.expandedShots.filter((id) => id !== shotId)
                                : [...state.expandedShots, shotId],
                        };
                    });
                },
                
                setExpandedShots: (shotIds) => {
                    set(() => ({
                        expandedShots: shotIds,
                    }));
                },
                
                // ============================================================
                // Store Management
                // ============================================================
                
                resetStore: () => {
                    set(() => ({
                        ...INITIAL_STATE,
                        _hasHydrated: true, // Keep hydration status
                    }));
                },
                
                forceSync: () => {
                    set((state) => ({
                        lastSyncTimestamp: Date.now(),
                        // Touch state to trigger persist
                        scenes: [...state.scenes],
                    }));
                },
                
                setHasHydrated: (value) => {
                    set(() => ({
                        _hasHydrated: value,
                    }));
                },
            }),
            {
                name: SCENE_STORE_NAME,
                // Cast to any to satisfy TypeScript - the storage adapter is compatible
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                storage: createIndexedDBStorage({ keyPrefix: '' }) as any,
                partialize: (state): Partial<SceneStateStoreState> => ({
                    // Only persist these fields
                    scenes: state.scenes,
                    timelines: state.timelines,
                    generatedImages: state.generatedImages,
                    generatedShotImages: state.generatedShotImages,
                    generatedVideos: state.generatedVideos,
                    generationJobs: state.generationJobs,
                    sceneImageStatuses: state.sceneImageStatuses,
                    selectedSceneId: state.selectedSceneId,
                    expandedShots: state.expandedShots,
                    lastSyncTimestamp: state.lastSyncTimestamp,
                }),
                onRehydrateStorage: () => (state) => {
                    if (state) {
                        state.setHasHydrated(true);
                        console.log('[SceneStateStore] Hydrated from storage');
                    }
                },
            }
        )
    )
);

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to check if the store has been hydrated from storage
 */
export function useSceneStoreHydrated(): boolean {
    return useSceneStateStore((state) => state._hasHydrated);
}

/**
 * Hook to get scenes with selector
 */
export function useScenes(): Scene[] {
    return useSceneStateStore((state) => state.scenes);
}

/**
 * Hook to get a single scene by ID
 */
export function useScene(sceneId: string | null): Scene | undefined {
    return useSceneStateStore((state) => 
        sceneId ? state.scenes.find((s) => s.id === sceneId) : undefined
    );
}

/**
 * Hook to get active generation jobs for a scene
 */
export function useActiveJobsForScene(sceneId: string): GenerationJob[] {
    return useSceneStateStore((state) => 
        Object.values(state.generationJobs).filter(
            (job) => 
                job.sceneId === sceneId && 
                (job.status === 'pending' || job.status === 'queued' || job.status === 'in-progress')
        )
    );
}

/**
 * Hook to get generated image for a scene
 */
export function useGeneratedImage(sceneId: string | null): KeyframeData | undefined {
    return useSceneStateStore((state) => 
        sceneId ? state.generatedImages[sceneId] : undefined
    );
}

// ============================================================================
// Non-React Utilities
// ============================================================================

/**
 * Get current store state (for non-React contexts)
 */
export function getSceneStoreState(): SceneStateStoreState {
    return useSceneStateStore.getState();
}

/**
 * Subscribe to store changes (for non-React contexts)
 */
export function subscribeToSceneStore(
    listener: (state: SceneStateStore) => void
): () => void {
    return useSceneStateStore.subscribe(listener);
}

/**
 * Create a generation job ID
 */
export function createJobId(type: GenerationJob['type'], sceneId: string, shotId?: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const suffix = shotId ? `-${shotId}` : '';
    return `${type}-${sceneId}${suffix}-${timestamp}-${random}`;
}
