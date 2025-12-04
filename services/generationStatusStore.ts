/**
 * Generation Status Store - Zustand-based State Management for LocalGenerationStatus
 * 
 * This store replaces the fragile prop-drilling + usePersistentState pattern for
 * tracking generation status. It provides stable subscriptions that won't cause
 * infinite loops when status updates rapidly during ComfyUI generation.
 * 
 * ## Why This Exists (Tech Debt Fix)
 * 
 * The previous architecture had these issues:
 * 1. localGenStatus was managed via usePersistentState in App.tsx
 * 2. Passed as props through multiple layers (App → TimelineEditor → etc.)
 * 3. TimelineEditor had localGenStatus in useEffect deps, causing loops
 * 4. Every status update triggered component re-renders cascade
 * 
 * The fix in TimelineEditor used localGenStatusRef as a workaround, but this
 * is fragile. Zustand provides a proper solution:
 * 
 * 1. External state - no React render cascades
 * 2. Selector-based subscriptions - only re-render on relevant changes
 * 3. Status updates don't trigger effect re-runs
 * 4. Built-in persistence via IndexedDB middleware
 * 
 * ## Usage
 * 
 * ```typescript
 * // Get status for a specific scene (subscribes to just that scene's status)
 * const sceneStatus = useSceneGenStatus(sceneId);
 * 
 * // Update status (doesn't trigger React re-renders in unrelated components)
 * const updateStatus = useGenerationStatusStore(state => state.updateSceneStatus);
 * updateStatus(sceneId, { status: 'running', progress: 50 });
 * 
 * // For ComfyUI callbacks (non-React context)
 * getGenerationStatusStore().updateSceneStatus(sceneId, { status: 'complete' });
 * ```
 * 
 * @module services/generationStatusStore
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { LocalGenerationStatus, GenerationJob } from '../types';
import { createIndexedDBStorage } from '../utils/zustandIndexedDBStorage';

// ============================================================================
// Store Types
// ============================================================================

/**
 * Default status for a new/idle scene
 */
export const DEFAULT_GENERATION_STATUS: LocalGenerationStatus = {
    status: 'idle',
    message: '',
    progress: 0,
};

/**
 * Generation status store state
 */
export interface GenerationStatusStoreState {
    /**
     * Status by scene ID
     */
    statusByScene: Record<string, LocalGenerationStatus>;
    
    /**
     * Active generation jobs (for job-based tracking)
     */
    activeJobs: Record<string, GenerationJob>;
    
    /**
     * Store hydration status
     */
    _hasHydrated: boolean;
    
    /**
     * Last sync timestamp for debugging
     */
    _lastSyncTimestamp: number;
}

/**
 * Generation status store actions
 */
export interface GenerationStatusStoreActions {
    // ========================================================================
    // Scene Status Operations
    // ========================================================================
    
    /**
     * Get status for a specific scene
     */
    getSceneStatus: (sceneId: string) => LocalGenerationStatus;
    
    /**
     * Update status for a specific scene (partial update)
     */
    updateSceneStatus: (sceneId: string, updates: Partial<LocalGenerationStatus>) => void;
    
    /**
     * Set complete status for a scene (full replace)
     */
    setSceneStatus: (sceneId: string, status: LocalGenerationStatus) => void;
    
    /**
     * Clear status for a scene (reset to idle)
     */
    clearSceneStatus: (sceneId: string) => void;
    
    /**
     * Get all scene statuses (for bulk operations)
     */
    getAllStatuses: () => Record<string, LocalGenerationStatus>;
    
    /**
     * Set all statuses at once (for import/reset)
     */
    setAllStatuses: (statuses: Record<string, LocalGenerationStatus>) => void;
    
    /**
     * Clear all statuses
     */
    clearAllStatuses: () => void;
    
    // ========================================================================
    // Job-Based Tracking (for GenerationQueue integration)
    // ========================================================================
    
    /**
     * Register a new generation job
     */
    registerJob: (job: GenerationJob) => void;
    
    /**
     * Update an existing job
     */
    updateJob: (jobId: string, updates: Partial<GenerationJob>) => void;
    
    /**
     * Complete a job (sets status to completed or failed)
     */
    completeJob: (jobId: string, result?: string, error?: string) => void;
    
    /**
     * Get a job by ID
     */
    getJob: (jobId: string) => GenerationJob | undefined;
    
    /**
     * Get all jobs for a scene
     */
    getSceneJobs: (sceneId: string) => GenerationJob[];
    
    /**
     * Clear completed/failed jobs older than threshold
     */
    pruneOldJobs: (maxAgeMs?: number) => void;
    
    // ========================================================================
    // Store Management
    // ========================================================================
    
    /**
     * Mark store as hydrated
     */
    setHasHydrated: (value: boolean) => void;
    
    /**
     * Force sync to storage
     */
    forceSync: () => void;
}

/**
 * Combined store type
 */
export type GenerationStatusStore = GenerationStatusStoreState & GenerationStatusStoreActions;

// ============================================================================
// Store Name
// ============================================================================

export const GENERATION_STATUS_STORE_NAME = 'gemDirect-generation-status-store';

// ============================================================================
// Store Creation
// ============================================================================

export const useGenerationStatusStore = create<GenerationStatusStore>()(
    subscribeWithSelector(
        persist(
            (set, get) => ({
                // Initial state
                statusByScene: {},
                activeJobs: {},
                _hasHydrated: false,
                _lastSyncTimestamp: Date.now(),
                
                // ============================================================
                // Scene Status Operations
                // ============================================================
                
                getSceneStatus: (sceneId) => {
                    return get().statusByScene[sceneId] ?? { ...DEFAULT_GENERATION_STATUS };
                },
                
                updateSceneStatus: (sceneId, updates) => {
                    set((state) => {
                        const current = state.statusByScene[sceneId] ?? { ...DEFAULT_GENERATION_STATUS };
                        return {
                            statusByScene: {
                                ...state.statusByScene,
                                [sceneId]: { ...current, ...updates },
                            },
                            _lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                setSceneStatus: (sceneId, status) => {
                    set((state) => ({
                        statusByScene: {
                            ...state.statusByScene,
                            [sceneId]: status,
                        },
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                clearSceneStatus: (sceneId) => {
                    set((state) => ({
                        statusByScene: {
                            ...state.statusByScene,
                            [sceneId]: { ...DEFAULT_GENERATION_STATUS },
                        },
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                getAllStatuses: () => {
                    return get().statusByScene;
                },
                
                setAllStatuses: (statuses) => {
                    set(() => ({
                        statusByScene: statuses,
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                clearAllStatuses: () => {
                    set(() => ({
                        statusByScene: {},
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                // ============================================================
                // Job-Based Tracking
                // ============================================================
                
                registerJob: (job) => {
                    set((state) => ({
                        activeJobs: {
                            ...state.activeJobs,
                            [job.id]: job,
                        },
                        _lastSyncTimestamp: Date.now(),
                    }));
                },
                
                updateJob: (jobId, updates) => {
                    set((state) => {
                        const current = state.activeJobs[jobId];
                        if (!current) {
                            console.warn(`[GenerationStatusStore] Job ${jobId} not found`);
                            return state;
                        }
                        
                        return {
                            activeJobs: {
                                ...state.activeJobs,
                                [jobId]: { ...current, ...updates },
                            },
                            _lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                completeJob: (jobId, result, error) => {
                    set((state) => {
                        const current = state.activeJobs[jobId];
                        if (!current) {
                            console.warn(`[GenerationStatusStore] Job ${jobId} not found`);
                            return state;
                        }
                        
                        return {
                            activeJobs: {
                                ...state.activeJobs,
                                [jobId]: {
                                    ...current,
                                    status: error ? 'failed' : 'completed',
                                    completedAt: Date.now(),
                                    result: result,
                                    error: error,
                                    progress: error ? current.progress : 100,
                                },
                            },
                            _lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                getJob: (jobId) => {
                    return get().activeJobs[jobId];
                },
                
                getSceneJobs: (sceneId) => {
                    const jobs = get().activeJobs;
                    return Object.values(jobs).filter(job => job.sceneId === sceneId);
                },
                
                pruneOldJobs: (maxAgeMs = 24 * 60 * 60 * 1000) => { // 24 hours default
                    set((state) => {
                        const now = Date.now();
                        const prunedJobs: Record<string, GenerationJob> = {};
                        
                        for (const [id, job] of Object.entries(state.activeJobs)) {
                            const isActive = job.status === 'pending' || 
                                           job.status === 'queued' || 
                                           job.status === 'in-progress';
                            const isRecent = job.completedAt && (now - job.completedAt) < maxAgeMs;
                            
                            if (isActive || isRecent) {
                                prunedJobs[id] = job;
                            }
                        }
                        
                        return {
                            activeJobs: prunedJobs,
                            _lastSyncTimestamp: Date.now(),
                        };
                    });
                },
                
                // ============================================================
                // Store Management
                // ============================================================
                
                setHasHydrated: (value) => {
                    set(() => ({ _hasHydrated: value }));
                },
                
                forceSync: () => {
                    set((state) => ({
                        _lastSyncTimestamp: Date.now(),
                        // Touch a field to trigger persist
                        statusByScene: state.statusByScene,
                    }));
                },
            }),
            {
                name: GENERATION_STATUS_STORE_NAME,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                storage: createIndexedDBStorage({ keyPrefix: '' }) as any,
                
                // Rehydration callback
                onRehydrateStorage: () => (state) => {
                    if (state) {
                        state.setHasHydrated(true);
                        console.log('[GenerationStatusStore] Rehydrated from IndexedDB');
                    }
                },
                
                // Only persist relevant data, not internal state or action functions
                // CRITICAL: Must explicitly list state fields to avoid serializing functions
                partialize: (state): Partial<GenerationStatusStoreState> => ({
                    statusByScene: state.statusByScene,
                    activeJobs: state.activeJobs,
                    // Don't persist: _hasHydrated, _lastSyncTimestamp, or any action functions
                }),
            }
        )
    )
);

// ============================================================================
// Selector Hooks (Stable Subscriptions)
// ============================================================================

/**
 * Subscribe to a specific scene's generation status
 * Only re-renders when that scene's status changes
 * 
 * NOTE: Returns DEFAULT_GENERATION_STATUS directly (stable reference) instead of
 * spreading to avoid creating new objects on every render which triggers infinite loops
 */
export function useSceneGenStatus(sceneId: string): LocalGenerationStatus {
    return useGenerationStatusStore(
        (state) => state.statusByScene[sceneId] ?? DEFAULT_GENERATION_STATUS
    );
}

/**
 * Subscribe to a specific scene's status primitive (e.g., just 'running'/'complete')
 * Even more granular - only re-renders when the status string changes
 */
export function useSceneGenStatusValue(sceneId: string): LocalGenerationStatus['status'] {
    return useGenerationStatusStore(
        (state) => state.statusByScene[sceneId]?.status ?? 'idle'
    );
}

/**
 * Subscribe to a scene's progress value
 */
export function useSceneGenProgress(sceneId: string): number {
    return useGenerationStatusStore(
        (state) => state.statusByScene[sceneId]?.progress ?? 0
    );
}

/**
 * Subscribe to hydration status
 */
export function useGenerationStatusHydrated(): boolean {
    return useGenerationStatusStore((state) => state._hasHydrated);
}

/**
 * Subscribe to all statuses (use sparingly - causes re-render on any status change)
 */
export function useAllGenStatuses(): Record<string, LocalGenerationStatus> {
    return useGenerationStatusStore((state) => state.statusByScene);
}

/**
 * Get a specific job by ID
 */
export function useGenerationJob(jobId: string): GenerationJob | undefined {
    return useGenerationStatusStore((state) => state.activeJobs[jobId]);
}

/**
 * Get all jobs for a scene
 */
export function useSceneJobs(sceneId: string): GenerationJob[] {
    return useGenerationStatusStore((state) => 
        Object.values(state.activeJobs).filter(job => job.sceneId === sceneId)
    );
}

// ============================================================================
// Non-React Utilities (for services, callbacks, etc.)
// ============================================================================

/**
 * Get the store instance for non-React contexts
 * Use this in ComfyUI callbacks, service functions, etc.
 */
export function getGenerationStatusStore(): GenerationStatusStore {
    return useGenerationStatusStore.getState();
}

/**
 * Update scene status from non-React context
 * Convenience wrapper for ComfyUI progress callbacks
 */
export function updateSceneStatus(sceneId: string, updates: Partial<LocalGenerationStatus>): void {
    useGenerationStatusStore.getState().updateSceneStatus(sceneId, updates);
}

/**
 * Set complete scene status from non-React context
 */
export function setSceneStatus(sceneId: string, status: LocalGenerationStatus): void {
    useGenerationStatusStore.getState().setSceneStatus(sceneId, status);
}

/**
 * Clear scene status from non-React context
 */
export function clearSceneStatus(sceneId: string): void {
    useGenerationStatusStore.getState().clearSceneStatus(sceneId);
}

/**
 * Subscribe to store changes from non-React context
 */
export function subscribeToGenerationStatus(
    listener: (state: GenerationStatusStore) => void
): () => void {
    return useGenerationStatusStore.subscribe(listener);
}

/**
 * Subscribe to a specific scene's status changes
 */
export function subscribeToSceneStatus(
    sceneId: string,
    listener: (status: LocalGenerationStatus) => void
): () => void {
    return useGenerationStatusStore.subscribe(
        (state) => state.statusByScene[sceneId] ?? { ...DEFAULT_GENERATION_STATUS },
        listener,
        { equalityFn: (a, b) => a.status === b.status && a.progress === b.progress }
    );
}
