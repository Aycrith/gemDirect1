import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as db from './database';
import { StoryBible, Scene, WorkflowStage, ToastMessage, Suggestion, TimelineData, Shot, SceneStatus, SceneGenerationStatus, VisualBible, ComfyUIStatusSummary, KeyframeData } from '../types';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useUsage } from '../contexts/UsageContext';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { validateSceneProgression } from '../services/sceneProgressionValidator';
import { convertToStoryBibleV2, needsUpgrade } from '../services/storyBibleConverter';
import { syncCharacterDescriptors } from '../services/promptPipeline';
import { validateShotDescription } from '../services/shotValidator';
import { generateCorrelationId, logCorrelation } from './correlation';
import { 
    NarrativeState, 
    createInitialNarrativeState, 
    serializeNarrativeState, 
    deserializeNarrativeState 
} from '../services/narrativeCoherenceService';
import { useOptionalHydration } from '../contexts/HydrationContext';

const persistentStateDebugEnabled = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_DEBUG_PERSISTENT_STATE ?? 'false') === 'true';
const debugPersistentState = (...args: unknown[]) => {
    if (persistentStateDebugEnabled) {
        console.debug(...args);
    }
};

/**
 * A custom hook that syncs a state with IndexedDB and sessionStorage.
 * sessionStorage provides immediate synchronous access during hot reloads,
 * while IndexedDB provides long-term persistence.
 * 
 * Integration with HydrationContext:
 * - Registers key with hydration coordinator on mount
 * - Marks key as hydrated once IndexedDB load completes
 * - Enables coordinated hydration across all persistent states
 * 
 * @param key The key to use for storing the value in the database.
 * @param initialValue The initial value of the state.
 * @returns A state and a setter function, similar to useState.
 */
export function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    // Get optional hydration context (may not be available if outside provider)
    const hydration = useOptionalHydration();

    // Try to load from sessionStorage synchronously BEFORE first render
    // This prevents flash of empty state during Vite HMR
    const getInitialState = (): T => {
        try {
            const sessionData = sessionStorage.getItem(`gemDirect_${key}`);
            if (sessionData) {
                const parsed = JSON.parse(sessionData);
                debugPersistentState(`[usePersistentState(${key})] Loaded from sessionStorage:`, parsed);
                // Handle Set deserialization
                if (initialValue instanceof Set && Array.isArray(parsed)) {
                    return new Set(parsed) as T;
                }
                return parsed;
            }
        } catch (error) {
            debugPersistentState(`[usePersistentState(${key})] Failed to load from sessionStorage:`, error);
        }
        return initialValue;
    };

    const [state, setState] = useState<T>(getInitialState);
    const [isLoaded, setIsLoaded] = useState(false);
    const prevStateRef = useRef<T>(state);
    const loadedFromSession = useRef(false);
    const registeredRef = useRef(false);
    
    // FIX (2025-12-01): Use ref for hydration callbacks to prevent infinite loops.
    // The hydration context value changes when any key is hydrated (new Map created).
    // Using hydration directly in useEffect deps causes re-runs on every context update.
    // Solution: Store callbacks in ref that updates on every render but doesn't trigger effects.
    const hydrationRef = useRef(hydration);
    hydrationRef.current = hydration;

    // Register with hydration context on mount
    useEffect(() => {
        const h = hydrationRef.current;
        if (h && !registeredRef.current) {
            h.registerKey(key);
            registeredRef.current = true;
        }
    }, [key]); // Note: hydration removed from deps, using ref instead

    // Check if we loaded from sessionStorage (has data)
    useEffect(() => {
        try {
            const sessionData = sessionStorage.getItem(`gemDirect_${key}`);
            if (sessionData) {
                loadedFromSession.current = true;
                debugPersistentState(`[usePersistentState(${key})] Detected sessionStorage data, will skip IndexedDB load`);
                
                // Mark as hydrated immediately if loaded from sessionStorage
                const h = hydrationRef.current;
                if (h) {
                    h.markKeyHydrated(key);
                }
            }
        } catch (error) {
            // Ignore sessionStorage errors
        }
    }, [key]); // Note: hydration removed from deps, using ref instead

    // Load initial data from IndexedDB on mount ONLY if sessionStorage was empty
    // FIX (2025-12-01): Removed initialValue from deps array.
    // If caller passes a literal like [] or {}, it creates a new reference each render,
    // causing this effect to run infinitely. We only need initialValue for the first load,
    // which is captured in the closure.
    const initialValueRef = useRef(initialValue);
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            const h = hydrationRef.current;
            try {
                // CRITICAL FIX: Don't overwrite sessionStorage data with IndexedDB data
                // This prevents race condition during Vite HMR where IndexedDB has stale data
                if (loadedFromSession.current) {
                    debugPersistentState(`[usePersistentState(${key})] Skipping IndexedDB load - using sessionStorage data`);
                    setIsLoaded(true);
                    return;
                }

                const data = await db.getData(key);
                if (isMounted && data !== undefined && data !== null) {
                    // Handle Set deserialization
                    if (initialValueRef.current instanceof Set && Array.isArray(data)) {
                        const newSet = new Set(data) as T;
                        setState(newSet);
                        prevStateRef.current = newSet;
                    } else {
                        setState(data);
                        prevStateRef.current = data;
                    }
                    debugPersistentState(`[usePersistentState(${key})] Loaded from IndexedDB (no sessionStorage data)`);
                }
            } catch (error) {
                // Silently handle storage errors - use sessionStorage/initialValue as fallback
                if (persistentStateDebugEnabled) {
                    console.warn(`[usePersistentState(${key})] Failed to load from IndexedDB:`, error);
                }
                // Still mark as failed in hydration context
                if (h) {
                    h.markKeyFailed(key, error instanceof Error ? error : undefined);
                }
            } finally {
                if (isMounted) {
                    setIsLoaded(true);
                    // Mark as hydrated in hydration context
                    if (h) {
                        h.markKeyHydrated(key);
                    }
                }
            }
        };
        load();
        return () => { isMounted = false; };
    }, [key]); // Note: initialValue and hydration removed from deps, using refs instead

    // Save data to DB whenever state changes (with Set-aware comparison)
    useEffect(() => {
        if (!isLoaded) {
            debugPersistentState(`[usePersistentState(${key})] NOT saving because isLoaded is false`);
            return;
        }

        // For Sets, compare contents to avoid infinite loops
        if (state instanceof Set && prevStateRef.current instanceof Set) {
            const stateArray = Array.from(state).sort();
            const prevArray = Array.from(prevStateRef.current as Set<any>).sort();
            const isSame = stateArray.length === prevArray.length && 
                          stateArray.every((val, idx) => val === prevArray[idx]);
            
            if (isSame) {
                debugPersistentState(`[usePersistentState(${key})] Set unchanged, skipping save`);
                return;
            }
        } else if (state === prevStateRef.current) {
            debugPersistentState(`[usePersistentState(${key})] State unchanged, skipping save`);
            return;
        }

        if (persistentStateDebugEnabled) {
            debugPersistentState(`[usePersistentState(${key})] Save effect triggered. isLoaded:`, isLoaded);
        }
        
        // Save to BOTH sessionStorage (synchronous) and IndexedDB (async)
        // sessionStorage ensures immediate availability during hot reloads
        try {
            const dataToSave = state instanceof Set ? Array.from(state) : state;
            sessionStorage.setItem(`gemDirect_${key}`, JSON.stringify(dataToSave));
            debugPersistentState(`[usePersistentState(${key})] Saved to sessionStorage`);
        } catch (sessionError) {
            if (persistentStateDebugEnabled) {
                console.warn(`[usePersistentState(${key})] Failed to save to sessionStorage:`, sessionError);
            }
        }

        // Handle Set serialization for IndexedDB
        if (state instanceof Set) {
            if (persistentStateDebugEnabled) {
                debugPersistentState(`[usePersistentState(${key})] Saving Set to IndexedDB:`, Array.from(state));
            }
            db.saveData(key, Array.from(state)).catch(err => {
                if (persistentStateDebugEnabled) {
                    console.warn(`[usePersistentState(${key})] Failed to save Set to IndexedDB:`, err);
                }
            });
        } else {
            if (persistentStateDebugEnabled) {
                debugPersistentState(`[usePersistentState(${key})] Saving to IndexedDB`);
            }
            db.saveData(key, state).catch(err => {
                if (persistentStateDebugEnabled) {
                    console.warn(`[usePersistentState(${key})] Failed to save to IndexedDB:`, err);
                }
            });
        }

        prevStateRef.current = state;
    }, [key, state, isLoaded]);

    return [state, setState];
}

/**
 * Custom hook to manage narrative state persistence across sessions.
 * Narrative state tracks story elements (characters, locations, temporal position, emotional arc)
 * across video generation to ensure coherence.
 * 
 * @param storyBible - Story bible to initialize narrative state from
 * @param visualBible - Optional visual bible for character tracking
 * @returns Narrative state and update function
 */
export function useNarrativeState(
    storyBible: StoryBible | null,
    visualBible?: VisualBible | null
): {
    narrativeState: NarrativeState | null;
    updateNarrativeState: (newState: NarrativeState) => void;
    resetNarrativeState: () => void;
    isLoaded: boolean;
} {
    const [narrativeState, setNarrativeState] = useState<NarrativeState | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const prevStoryBibleRef = useRef<StoryBible | null>(null);

    // Load narrative state from IndexedDB on mount
    useEffect(() => {
        let isMounted = true;
        const loadState = async () => {
            try {
                const serialized = await db.getData('narrativeState');
                if (isMounted && serialized && typeof serialized === 'string') {
                    const parsed = deserializeNarrativeState(serialized);
                    if (parsed) {
                        setNarrativeState(parsed);
                        debugPersistentState('[useNarrativeState] Loaded from IndexedDB:', {
                            version: parsed.version,
                            characters: Object.keys(parsed.characters).length,
                            lastUpdatedForScene: parsed.lastUpdatedForScene
                        });
                    }
                }
            } catch (error) {
                console.warn('[useNarrativeState] Failed to load from IndexedDB:', error);
            } finally {
                if (isMounted) {
                    setIsLoaded(true);
                }
            }
        };
        loadState();
        return () => { isMounted = false; };
    }, []);

    // Initialize narrative state when story bible changes (new project)
    useEffect(() => {
        if (!isLoaded) return;
        
        // If story bible is new or significantly different, reinitialize
        const storyBibleChanged = storyBible && (
            !prevStoryBibleRef.current ||
            prevStoryBibleRef.current.logline !== storyBible.logline
        );
        
        if (storyBibleChanged && !narrativeState) {
            const initialState = createInitialNarrativeState(storyBible, visualBible || undefined);
            setNarrativeState(initialState);
            debugPersistentState('[useNarrativeState] Initialized from story bible:', {
                characters: Object.keys(initialState.characters).length
            });
        }
        
        prevStoryBibleRef.current = storyBible;
    }, [isLoaded, storyBible, visualBible, narrativeState]);

    // Persist narrative state to IndexedDB when it changes
    useEffect(() => {
        if (!isLoaded || !narrativeState) return;
        
        const saveState = async () => {
            try {
                const serialized = serializeNarrativeState(narrativeState);
                await db.saveData('narrativeState', serialized);
                debugPersistentState('[useNarrativeState] Saved to IndexedDB:', {
                    version: narrativeState.version,
                    lastUpdatedForScene: narrativeState.lastUpdatedForScene
                });
            } catch (error) {
                console.warn('[useNarrativeState] Failed to save to IndexedDB:', error);
            }
        };
        saveState();
    }, [isLoaded, narrativeState]);

    const updateNarrativeState = useCallback((newState: NarrativeState) => {
        setNarrativeState(newState);
    }, []);

    const resetNarrativeState = useCallback(() => {
        if (storyBible) {
            const freshState = createInitialNarrativeState(storyBible, visualBible || undefined);
            setNarrativeState(freshState);
        } else {
            setNarrativeState(null);
        }
        // Also clear from IndexedDB
        db.saveData('narrativeState', null).catch(err => 
            console.warn('[useNarrativeState] Failed to clear from IndexedDB:', err)
        );
    }, [storyBible, visualBible]);

    return {
        narrativeState,
        updateNarrativeState,
        resetNarrativeState,
        isLoaded
    };
}

/**
 * A custom hook to track scene generation status in real-time.
 * Provides per-scene status updates during generation.
 */
export function useSceneGenerationWatcher(scenes: Scene[]) {
    const [sceneStatuses, setSceneStatuses] = useState<Record<string, SceneStatus>>({});
    
    // Initialize statuses when scenes change
    useEffect(() => {
        const newStatuses: Record<string, SceneStatus> = {};
        scenes.forEach(scene => {
            newStatuses[scene.id] = {
                sceneId: scene.id,
                title: scene.title,
                status: 'pending' as SceneGenerationStatus,
                progress: 0,
            };
        });
        setSceneStatuses(newStatuses);
    }, [scenes]);
    
    // Track scene generation lifecycle
    const updateSceneStatus = useCallback((
        sceneId: string, 
        status: SceneGenerationStatus, 
        progress?: number, 
        error?: string
    ) => {
        setSceneStatuses(prev => {
            const existing = prev[sceneId];
            const updated: SceneStatus = {
                sceneId,
                title: existing?.title ?? '',
                status,
                progress: progress ?? existing?.progress ?? 0,
                error,
                startTime: existing?.startTime ?? Date.now(),
                endTime: (status === 'complete' || status === 'failed') ? Date.now() : undefined,
            };
            return { ...prev, [sceneId]: updated };
        });
    }, []);
    
    return { sceneStatuses, updateSceneStatus };
}

/**
 * A custom hook to manage the core project data lifecycle.
 */
export function useProjectData(setGenerationProgress: React.Dispatch<React.SetStateAction<{ current: number, total: number, task: string }>>) {
    const [workflowStage, setWorkflowStage] = usePersistentState<WorkflowStage>('workflowStage', 'idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [scenesToReview, setScenesToReview] = usePersistentState('scenesToReview', new Set<string>());

    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();
    const planActions = usePlanExpansionActions();

    // Initial data load
    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const bible = await db.getStoryBible();
                const vision = await db.getData('directorsVision');
                const sceneList = await db.getAllScenes();
                
                if (bible) {
                    // Auto-migrate V1 Story Bible to V2 format
                    if (needsUpgrade(bible)) {
                        console.info('[useProjectData] Auto-upgrading Story Bible from V1 to V2 format');
                        const upgradedBible = convertToStoryBibleV2(bible);
                        setStoryBible(upgradedBible);
                        // Persist the upgraded bible
                        db.saveStoryBible(upgradedBible);
                    } else {
                        setStoryBible(bible);
                    }
                }
                if (vision) setDirectorsVision(vision);
                if (sceneList.length > 0) setScenes(sceneList);
            } catch (error) {
                console.error('[useProjectData] Failed to load initial data from IndexedDB:', error);
                // Continue with empty state - user can still create new project
            } finally {
                // Always clear loading state, even if IndexedDB fails
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Sync workflow stage with loaded data (handles fixtures and manual stage changes)
    useEffect(() => {
        if (isLoading) return; // Don't sync during initial load
        
        // Determine minimum required stage based on current data
        let minRequiredStage: WorkflowStage = 'idea';
        if (storyBible) {
            minRequiredStage = 'bible';
            if (scenes.length > 0) {
                // Once scenes exist, user must have gone through vision stage
                minRequiredStage = 'director';
            }
        }
        
        // Only auto-advance if current stage is behind the minimum required
        // This allows manual navigation forward (e.g., bible -> vision) without auto-reset
        const stageOrder: WorkflowStage[] = ['idea', 'bible', 'vision', 'director', 'continuity'];
        const currentStageIndex = stageOrder.indexOf(workflowStage);
        const minRequiredStageIndex = stageOrder.indexOf(minRequiredStage);
        
        if (currentStageIndex < minRequiredStageIndex) {
            setWorkflowStage(minRequiredStage);
        }
    }, [isLoading, storyBible, scenes.length, workflowStage, setWorkflowStage]);

    // Persist core data on change
    useEffect(() => {
        if (!isLoading && storyBible) db.saveStoryBible(storyBible);
    }, [storyBible, isLoading]);

    useEffect(() => {
        if (!isLoading && directorsVision) db.saveData('directorsVision', directorsVision);
    }, [directorsVision, isLoading]);

    useEffect(() => {
        if (!isLoading) db.saveScenes(scenes);
    }, [scenes, isLoading]);

    const handleGenerateStoryBible = useCallback(async (idea: string, genre: string = 'sci-fi', addToast: (message: string, type: ToastMessage['type']) => void) => {
        setIsLoading(true);
        
        // Safety timeout: ensure loading state clears even if async operation hangs
        const safetyTimeoutMs = 150000; // 150 seconds max wait
        const safetyTimer = setTimeout(() => {
            console.error('[handleGenerateStoryBible] Safety timeout triggered - clearing stuck loading state');
            setIsLoading(false);
            // CRITICAL: Reset API status to clear the global progress indicator
            updateApiStatus('error', 'Story Bible generation timed out');
            addToast('Story Bible generation timed out. Please try again or check your network connection.', 'error');
        }, safetyTimeoutMs);
        
        try {
            const bible = await planActions.generateStoryBible(idea, genre, logApiCall, updateApiStatus);
            clearTimeout(safetyTimer);
            setStoryBible(bible);
            setWorkflowStage('bible');
            addToast('Story Bible generated successfully!', 'success');
        } catch (e) {
            clearTimeout(safetyTimer);
            console.error(e);
            // CRITICAL: Reset API status to clear the global progress indicator
            updateApiStatus('error', e instanceof Error ? e.message : 'Failed to generate Story Bible');
            addToast(e instanceof Error ? e.message : 'Failed to generate Story Bible.', 'error');
        } finally {
            clearTimeout(safetyTimer);
            setIsLoading(false);
        }
    }, [logApiCall, updateApiStatus, planActions, setWorkflowStage]);

    const handleGenerateScenes = useCallback(async (
        vision: string, 
        addToast: (message: string, type: ToastMessage['type']) => void, 
        _setGeneratedImages: React.Dispatch<React.SetStateAction<Record<string, KeyframeData>>>,
        updateSceneStatus?: (sceneId: string, status: SceneGenerationStatus, progress?: number, error?: string) => void
    ) => {
        console.log('[handleGenerateScenes] START - Vision length:', vision?.length || 0);
        console.log('[handleGenerateScenes] Story Bible present:', !!storyBible);
        
        if (!storyBible) {
            console.error('[handleGenerateScenes] ABORT - No story bible available');
            addToast('Story Bible is missing. Please generate a Story Bible first.', 'error');
            return;
        }

        console.log('[handleGenerateScenes] Setting loading state and storing vision');
        setIsLoading(true);
        setDirectorsVision(vision);
        
        // Safety timeout: ensure loading state clears even if async operation hangs
        const safetyTimeoutMs = 180000; // 180 seconds max wait (longer than Story Bible due to scene generation complexity)
        const safetyTimer = setTimeout(() => {
            console.error('[handleGenerateScenes] Safety timeout triggered - clearing stuck loading state');
            setIsLoading(false);
            setGenerationProgress({ current: 0, total: 0, task: '' });
            addToast('Scene generation timed out. Please try again or check your network connection.', 'error');
            updateApiStatus('error', 'Generation timed out');
        }, safetyTimeoutMs);
        
        try {
            // Progressive feedback: Step 1 - Analyzing vision
            console.log('[handleGenerateScenes] Step 1: Analyzing Director\'s Vision');
            updateApiStatus('loading', 'Analyzing your Director\'s Vision...');
            await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause for UX
            
            // Progressive feedback: Step 2 - Generating scene list
            console.log('[handleGenerateScenes] Step 2: Calling generateSceneList');
            updateApiStatus('loading', 'Generating scene list from plot outline...');
            
            const sceneList = await planActions.generateSceneList(
                storyBible.plotOutline, 
                vision, 
                logApiCall, 
                updateApiStatus
            );
            
            console.log('[handleGenerateScenes] Scene list received:', sceneList?.length || 0, 'scenes');
            
            if (!sceneList || sceneList.length === 0) {
                console.warn('[handleGenerateScenes] Empty scene list returned');
                throw new Error('No scenes were generated. Please try again with a different vision.');
            }
            
            // Progressive feedback: Step 3 - Creating scene objects
            console.log('[handleGenerateScenes] Step 3: Creating scene objects');
            updateApiStatus('loading', `Creating ${sceneList.length} scenes...`);
            setGenerationProgress({ current: 0, total: sceneList.length, task: 'Creating scenes' });
            
            const newScenes: Scene[] = sceneList.map((s, idx) => {
                console.log(`[handleGenerateScenes] Creating scene ${idx + 1}/${sceneList.length}: "${s.title}"`);
                setGenerationProgress({ 
                    current: idx + 1, 
                    total: sceneList.length, 
                    task: `Scene: ${s.title.slice(0, 30)}...` 
                });
                
                return {
                    id: `scene_${Date.now()}_${Math.random()}`,
                    title: s.title,
                    summary: s.summary,
                    temporalContext: s.temporalContext,
                    timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
                };
            });
            
            console.log('[handleGenerateScenes] Step 4: Updating state with new scenes');
            setScenes(newScenes);
            
            // NEW: Validate scene progression
            console.log('[handleGenerateScenes] Step 4.5: Validating scene progression');
            const progressionValidation = validateSceneProgression(newScenes, storyBible);
            
            if (!progressionValidation.isValid) {
                console.warn('[Scene Progression] Validation errors:', progressionValidation.errors);
            }
            
            if (progressionValidation.warnings.length > 0) {
                console.warn('[Scene Progression] Validation warnings:', progressionValidation.warnings);
                // Scene progression warnings are logged to console. 
                // Future enhancement: display in UI via toast or dedicated warnings panel.
            }
            
            console.log('[Scene Progression] Metadata:', progressionValidation.metadata);
            
            console.log('[handleGenerateScenes] Step 5: Transitioning workflow stage to "director"');
            setWorkflowStage('director');
            
            // Mark all scenes as ready for review (no auto-generation)
            console.log('[handleGenerateScenes] Step 6: Marking scenes as complete');
            newScenes.forEach((s, idx) => {
                updateSceneStatus?.(s.id, 'complete', 100);
                console.log(`[handleGenerateScenes] Scene ${idx + 1} marked complete: ${s.id}`);
            });
            
            console.log('[handleGenerateScenes] Step 7: Showing success notification');
            updateApiStatus('success', `${newScenes.length} scenes ready for review!`);
            addToast(`${newScenes.length} scenes generated! Review and refine them, then generate images when ready.`, 'success');
            
            console.log('[handleGenerateScenes] SUCCESS - Complete');

        } catch (e) {
            clearTimeout(safetyTimer);
            console.error('[handleGenerateScenes] ERROR caught:', e);
            console.error('[handleGenerateScenes] Error details:', {
                message: e instanceof Error ? e.message : 'Unknown error',
                stack: e instanceof Error ? e.stack : undefined
            });
            
            updateApiStatus('error', e instanceof Error ? e.message : 'Failed to generate scenes');
            addToast(e instanceof Error ? e.message : 'Failed to generate scenes.', 'error');
            
            // Reset to vision stage for retry
            console.log('[handleGenerateScenes] Resetting to "vision" stage for retry');
            setWorkflowStage('vision');
        } finally {
            clearTimeout(safetyTimer);
            console.log('[handleGenerateScenes] FINALLY - Cleaning up');
            setIsLoading(false);
            setGenerationProgress({ current: 0, total: 0, task: '' });
            console.log('[handleGenerateScenes] END');
        }
    }, [storyBible, logApiCall, updateApiStatus, setGenerationProgress, planActions]);


    const applySuggestions = useCallback((suggestions: Suggestion[], sceneIdToUpdate?: string, addToast?: (message: string, type: ToastMessage['type']) => void) => {
        let newScenes = [...scenes];
        let newStoryBible = storyBible ? {...storyBible} : null;
        let newDirectorsVision = directorsVision;
        let newScenesToReview = new Set(scenesToReview);
        let changesMade = false;
        let toastMessage = 'Suggestion applied!';

        const correlationId = generateCorrelationId();
        let refinedShotCount = 0;
        let insertedShotCount = 0;

        suggestions.forEach(suggestion => {
            switch (suggestion.type) {
                case 'UPDATE_STORY_BIBLE':
                    if (newStoryBible) {
                        // Type assertion: UPDATE_STORY_BIBLE suggestions only target string fields (logline, characters, setting, plotOutline)
                        (newStoryBible as Record<string, unknown>)[suggestion.payload.field] = suggestion.payload.new_content;
                        changesMade = true;
                        toastMessage = `Story Bible updated: ${suggestion.payload.field} has been changed.`;
                    }
                    break;
                case 'UPDATE_DIRECTORS_VISION':
                    newDirectorsVision = suggestion.payload.new_content;
                    changesMade = true;
                    toastMessage = 'Director\'s Vision has been updated.';
                    break;
                case 'FLAG_SCENE_FOR_REVIEW':
                    newScenesToReview.add(suggestion.payload.scene_id);
                    changesMade = true;
                    toastMessage = `A scene has been flagged for review: ${suggestion.payload.reason}`;
                    break;
                case 'UPDATE_SHOT':
                case 'ADD_SHOT_AFTER':
                case 'UPDATE_TRANSITION':
                    // FAIL-FAST VALIDATION: Ensure sceneId is provided for timeline operations
                    if (!sceneIdToUpdate) {
                        console.error('[applySuggestions] FAIL-FAST: Timeline suggestion requires sceneId but none provided', { 
                            suggestionType: suggestion.type, 
                            suggestion 
                        });
                        addToast?.('Cannot apply suggestion: Scene context missing. This is a bug - please report it.', 'error');
                        break;
                    }
                    
                    const sceneIndex = newScenes.findIndex(s => s.id === sceneIdToUpdate);
                    if (sceneIndex === -1) {
                        console.error('[applySuggestions] FAIL-FAST: Scene not found', { sceneIdToUpdate });
                        addToast?.(`Cannot apply suggestion: Scene "${sceneIdToUpdate}" not found.`, 'error');
                        break;
                    }
                    
                    // Deep copy only the scene we're modifying (structuredClone preserves undefined/Date types)
                    const sceneToUpdate = structuredClone(newScenes[sceneIndex]);
                    if (!sceneToUpdate) break; // Should never happen since sceneIndex > -1
                    const timeline: TimelineData = sceneToUpdate.timeline;

                    if (suggestion.type === 'UPDATE_SHOT') {
                        // FAIL-FAST: Validate shot_id is present (LLM may omit required fields)
                        const targetShotId = suggestion.shot_id;
                        if (!targetShotId) {
                            console.error('[applySuggestions] FAIL-FAST: shot_id missing for UPDATE_SHOT', {
                                suggestion,
                                availableShots: timeline.shots.map(s => ({ id: s.id, title: s.title }))
                            });
                            addToast?.('Cannot update shot: The AI suggestion is missing a shot ID. Try regenerating suggestions.', 'error');
                            break;
                        }
                        
                        // FAIL-FAST: Validate target shot exists before attempting update
                        const shot = timeline.shots.find(s => s.id === targetShotId);
                        
                        if (!shot) {
                            console.error('[applySuggestions] FAIL-FAST: Target shot not found for UPDATE_SHOT', {
                                targetShotId,
                                availableShots: timeline.shots.map(s => ({ id: s.id, title: s.title })),
                                suggestion
                            });
                            addToast?.(`Cannot update shot: Shot "${targetShotId}" does not exist in this scene. The AI may have referenced a shot that was removed or never existed.`, 'error');
                            break;
                        }
                        
                        if (suggestion.payload.description) {
                            const originalDescription = shot.description || '';
                            const before = validateShotDescription(originalDescription);

                            const updatedDescription = suggestion.payload.description;
                            shot.description = updatedDescription;

                            const after = validateShotDescription(updatedDescription);

                            refinedShotCount++;

                            logCorrelation(
                                { correlationId, timestamp: Date.now(), source: 'frontend' },
                                'shot-refine',
                                {
                                    source: 'suggestion',
                                    sceneId: sceneIdToUpdate,
                                    shotId: targetShotId,
                                    suggestionType: suggestion.type,
                                    beforeLength: originalDescription.length,
                                    afterLength: updatedDescription.length,
                                    beforeWordCount: before.wordCount,
                                    afterWordCount: after.wordCount,
                                    beforeErrorCount: before.errorCount,
                                    afterErrorCount: after.errorCount,
                                    beforeWarningCount: before.warningCount,
                                    afterWarningCount: after.warningCount,
                                }
                            );
                        }
                        if (suggestion.payload.enhancers) {
                            timeline.shotEnhancers[targetShotId] = {
                                ...(timeline.shotEnhancers[targetShotId] || {}),
                                ...suggestion.payload.enhancers,
                            };
                        }
                        
                        newScenes[sceneIndex] = sceneToUpdate;
                        changesMade = true;
                        toastMessage = 'Shot updated successfully!';
                        
                    } else if (suggestion.type === 'ADD_SHOT_AFTER') {
                        // FAIL-FAST: Validate after_shot_id is present (LLM may omit required fields)
                        const afterShotId = suggestion.after_shot_id;
                        if (!afterShotId) {
                            console.error('[applySuggestions] FAIL-FAST: after_shot_id missing for ADD_SHOT_AFTER', {
                                suggestion,
                                availableShots: timeline.shots.map(s => ({ id: s.id, title: s.title }))
                            });
                            addToast?.('Cannot add shot: The AI suggestion is missing a reference shot ID. Try regenerating suggestions.', 'error');
                            break;
                        }
                        
                        // FAIL-FAST: Validate reference shot exists before attempting insert
                        const afterShotIndex = timeline.shots.findIndex(s => s.id === afterShotId);
                        
                        if (afterShotIndex === -1) {
                            console.error('[applySuggestions] FAIL-FAST: Reference shot not found for ADD_SHOT_AFTER', {
                                afterShotId,
                                availableShots: timeline.shots.map(s => ({ id: s.id, title: s.title })),
                                suggestion
                            });
                            addToast?.(`Cannot add shot: Reference shot "${afterShotId}" does not exist. The AI may have referenced a shot that was removed or never existed.`, 'error');
                            break;
                        }
                        
                        const newShot: Shot = {
                            id: `shot-${crypto.randomUUID()}`,
                            title: suggestion.payload.title,
                            description: suggestion.payload.description || '',
                        };
                        timeline.shots.splice(afterShotIndex + 1, 0, newShot);
                        timeline.transitions.splice(afterShotIndex, 0, 'Cut');

                        if (suggestion.payload.description) {
                            const after = validateShotDescription(newShot.description || '');
                            insertedShotCount++;

                            logCorrelation(
                                { correlationId, timestamp: Date.now(), source: 'frontend' },
                                'shot-insert',
                                {
                                    source: 'suggestion',
                                    sceneId: sceneIdToUpdate,
                                    shotId: newShot.id,
                                    suggestionType: suggestion.type,
                                    afterLength: newShot.description.length,
                                    afterWordCount: after.wordCount,
                                    afterErrorCount: after.errorCount,
                                    afterWarningCount: after.warningCount,
                                }
                            );
                        }

                        if (suggestion.payload.enhancers) {
                            timeline.shotEnhancers[newShot.id] = suggestion.payload.enhancers;
                        }
                        
                        newScenes[sceneIndex] = sceneToUpdate;
                        changesMade = true;
                        toastMessage = 'New shot added successfully!';
                        
                    } else if (suggestion.type === 'UPDATE_TRANSITION') {
                        const transitionIndex = suggestion.transition_index;
                        
                        // FAIL-FAST: Validate transition_index is present (LLM may omit required fields)
                        if (transitionIndex === undefined || transitionIndex === null) {
                            console.error('[applySuggestions] FAIL-FAST: transition_index missing for UPDATE_TRANSITION', {
                                suggestion,
                                transitionCount: timeline.transitions.length
                            });
                            addToast?.('Cannot update transition: The AI suggestion is missing a transition index. Try regenerating suggestions.', 'error');
                            break;
                        }
                        
                        // FAIL-FAST: Validate transition index is valid
                        if (transitionIndex < 0 || transitionIndex >= timeline.transitions.length) {
                            console.error('[applySuggestions] FAIL-FAST: Invalid transition index for UPDATE_TRANSITION', {
                                transitionIndex,
                                transitionCount: timeline.transitions.length,
                                suggestion
                            });
                            addToast?.(`Cannot update transition: Index ${transitionIndex} is out of range (0-${timeline.transitions.length - 1}).`, 'error');
                            break;
                        }
                        
                        if (suggestion.payload.type) {
                            timeline.transitions[transitionIndex] = suggestion.payload.type;
                            newScenes[sceneIndex] = sceneToUpdate;
                            changesMade = true;
                            toastMessage = 'Transition updated successfully!';
                        }
                    }
                    break;
            }
        });
    
        if (sceneIdToUpdate && (refinedShotCount > 0 || insertedShotCount > 0)) {
            logCorrelation(
                { correlationId, timestamp: Date.now(), source: 'frontend' },
                'shot-suggestion-summary',
                {
                    sceneId: sceneIdToUpdate,
                    suggestionCount: suggestions.length,
                    refinedShotCount,
                    insertedShotCount,
                }
            );
        }

        if(changesMade) {
            if (newStoryBible) setStoryBible(newStoryBible);
            setDirectorsVision(newDirectorsVision);
            setScenes(newScenes);
            setScenesToReview(newScenesToReview);
            addToast?.(toastMessage, 'success');
        }
    }, [scenes, storyBible, directorsVision, scenesToReview, setStoryBible, setDirectorsVision, setScenes, setScenesToReview]);


    return {
        workflowStage, setWorkflowStage,
        storyBible, setStoryBible,
        directorsVision, setDirectorsVision,
        scenes, setScenes,
        isLoading,
        scenesToReview, setScenesToReview,
        handleGenerateStoryBible,
        handleGenerateScenes,
        applySuggestions,
    };
}

export interface QueueConfig {
    SceneRetryBudget?: number;
    HistoryMaxWaitSeconds?: number;
    HistoryPollIntervalSeconds?: number;
    HistoryMaxAttempts?: number;
    PostExecutionTimeoutSeconds?: number;
}

export interface SceneGPUUsage {
    Name?: string;
    Type?: string;
    Index?: number;
    VramFreeBefore?: number;
    VramFreeAfter?: number;
    VramTotal?: number;
    VramDelta?: number;
    VramBeforeMB?: number;
    VramAfterMB?: number;
    VramDeltaMB?: number;
}

export interface SceneTelemetryMetadata {
    QueueStart?: string;
    QueueEnd?: string;
    DurationSeconds?: number;
    MaxWaitSeconds?: number;
    PollIntervalSeconds?: number;
    PostExecutionTimeoutSeconds?: number;
    ExecutionSuccessDetected?: boolean;
    ExecutionSuccessAt?: string;
    HistoryExitReason?: string;
    HistoryPostExecutionTimeoutReached?: boolean;
    HistoryAttempts?: number;
    HistoryAttemptLimit?: number;
    PollLimit?: number | 'unbounded';
    SceneRetryBudget?: number;
    GPU?: SceneGPUUsage;
    System?: {
        Before?: unknown;
        After?: unknown;
        FallbackNotes?: string[] | null;
    };
}

export interface SceneHistoryLogEntry {
    Attempt: number;
    Timestamp: string;
    Status: string;
    Message?: string;
}

export interface SceneAttemptSummary {
    Attempt: number;
    Timestamp: string;
    FrameCount: number;
    DurationSeconds: number;
    Success: boolean;
    MeetsFrameFloor: boolean;
    HistoryRetrieved: boolean;
    Warnings?: string[];
    Errors?: string[];
}

export interface SceneHistoryConfig {
    MaxWaitSeconds?: number;
    PollIntervalSeconds?: number;
    MaxAttempts?: number;
    PostExecutionTimeoutSeconds?: number;
}

export interface LLMHealthCheckMetadata {
    Url?: string;
    Override?: string;
    Status?: 'success' | 'failed' | 'skipped' | 'not requested';
    Models?: number;
    Error?: string;
    Timestamp?: string;
    Skipped?: boolean;
    SkipReason?: string;
}

export interface StoryLLMMetadata {
    status?: string;
    providerUrl?: string;
    seed?: string;
    durationMs?: number;
    error?: string;
    model?: string;
    requestFormat?: string;
    temperature?: number;
    scenesRequested?: number;
    scenesReceived?: number;
}

export interface VitestSuiteMetadata {
    Suite: string;
    ExitCode: number;
    DurationMs: number;
    LogPath?: string;
    StartedAt?: string;
}

export interface VitestSummaryMetadata {
    comfyExit?: number;
    e2eExit?: number;
    scriptsExit?: number;
    comfyLog?: string;
    e2eLog?: string;
    scriptsLog?: string;
    runDir?: string;
    timestamp?: string;
    suites?: VitestSuiteMetadata[];
}

export interface ArtifactSceneMetadata {
    SceneId: string;
    SceneTitle?: string;
    SceneSummary?: string;
    Prompt: string;
    NegativePrompt: string;
    FrameFloor: number;
    FrameCount: number;
    DurationSeconds: number;
    FramePrefix: string;
    HistoryPath: string;
    HistoryRetrievedAt?: string;
    HistoryPollLog?: SceneHistoryLogEntry[];
    HistoryErrors?: string[];
    Success: boolean;
    MeetsFrameFloor: boolean;
    HistoryRetrieved: boolean;
    HistoryAttempts?: number;
    HistoryError?: string;
    Warnings?: string[];
    Errors?: string[];
    AttemptsRun?: number;
    Requeued?: boolean;
    AttemptSummaries?: SceneAttemptSummary[];
    GeneratedFramesDir?: string;
    KeyframeSource?: string;
    StoryTitle?: string;
    StorySummary?: string;
    StoryMood?: string;
    StoryExpectedFrames?: number;
    StoryCameraMovement?: string;
    Telemetry?: SceneTelemetryMetadata;
    HistoryAttemptLimit?: number;
    SceneRetryBudget?: number;
    HistoryConfig?: SceneHistoryConfig;
    SceneKeyframe?: string;
    // Optional scene-level video metadata (filled once per-scene MP4 exists)
    Video?: SceneVideoMetadata;
}

export interface SceneVideoMetadata {
    Path: string;
    Status: 'processing' | 'ready' | 'error';
    DurationSeconds?: number;
    UpdatedAt?: string;
    Version?: number;
    Notes?: string;
    Error?: string;
}

export interface ArtifactMetadata {
    RunId: string;
    Timestamp: string;
    RunDir: string;
    Story: {
        Id: string;
        Logline: string;
        DirectorsVision: string;
        Generator?: string;
        File?: string;
        StoryDir?: string;
        LLM?: StoryLLMMetadata;
        HealthCheck?: LLMHealthCheckMetadata;
        Warnings?: string[];
    };
    Scenes: ArtifactSceneMetadata[];
    QueueConfig?: QueueConfig;
    VitestLogs: {
        ComfyUI: string;
        E2E: string;
        Scripts: string;
        ResultsJson?: string | null;
    };
    VitestSummary?: VitestSummaryMetadata;
    Archive: string;
    HelperSummaries?: {
        MappingPreflight?: {
            Summary?: string;
            Log?: string;
        };
        ComfyUIStatus?: {
            Summary?: string;
            Log?: string;
        };
    };
}

export interface ArtifactMetadataState {
    artifact: ArtifactMetadata | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

export function useArtifactMetadata(autoRefreshMs = 0): ArtifactMetadataState {
    const [artifact, setArtifact] = useState<ArtifactMetadata | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMetadata = useCallback(async () => {
        const paths = ['/artifact-metadata.json', '/artifacts/latest-run.json'];
        try {
            setLoading(true);
            setError(null);
            let payload: ArtifactMetadata | null = null;
            for (const relativePath of paths) {
                try {
                    const response = await fetch(`${relativePath}?t=${Date.now()}`);
                    if (!response.ok) {
                        continue;
                    }
                    payload = (await response.json()) as ArtifactMetadata;
                    break;
                } catch {
                    continue;
                }
            }
            if (!payload) {
                throw new Error('Unable to load artifact metadata from any known endpoint.');
            }
            setArtifact(payload);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setArtifact(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetadata();
        if (autoRefreshMs > 0) {
            const intervalId = window.setInterval(fetchMetadata, autoRefreshMs);
            return () => window.clearInterval(intervalId);
        }
        return undefined;
    }, [autoRefreshMs, fetchMetadata]);

    return { artifact, loading, error, refresh: fetchMetadata };
}

/**
 * Real-time telemetry update from WebSocket stream
 */
export interface RealtimeTelemetryUpdate {
    sceneId: string;
    timestamp: number;
    duration?: number;
    attempts?: number;
    gpuVramFree?: number;
    gpuUtilization?: number;
    status: 'queued' | 'executing' | 'completed' | 'failed';
    gpuName?: string;
    vramDelta?: number;
}

/**
 * State returned from useRealtimeTelemetry hook
 */
export interface UseRealtimeTelemetryState {
    telemetry: RealtimeTelemetryUpdate | null;
    isConnected: boolean;
    isStreaming: boolean;
    error: string | null;
    lastUpdate: number | null;
    connect: () => void;
    disconnect: () => void;
}

/**
 * Options for configuring real-time telemetry stream
 */
export interface UseRealtimeTelemetryOptions {
    enabled?: boolean;
    bufferMs?: number;
    reconnectAttempts?: number;
    reconnectDelay?: number;
    debug?: boolean;
}

/**
 * Custom hook for real-time telemetry streaming via WebSocket
 * Connects to ComfyUI /telemetry endpoint and streams live telemetry updates
 * 
 * @param options Configuration options for the telemetry stream
 * @returns Telemetry state with connection controls
 */
export function useRealtimeTelemetry(
    options: UseRealtimeTelemetryOptions = {}
): UseRealtimeTelemetryState {
    const {
        enabled = true,
        bufferMs = 200,
        reconnectAttempts = 5,
        reconnectDelay = 1000,
        debug = false
    } = options;

    const [telemetry, setTelemetry] = useState<RealtimeTelemetryUpdate | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<number | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCountRef = useRef(0);
    const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bufferedUpdatesRef = useRef<RealtimeTelemetryUpdate | null>(null);

    const debugLog = useCallback((message: string, data?: unknown) => {
        if (debug) {
            console.log(`[useRealtimeTelemetry] ${message}`, data);
        }
    }, [debug]);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
            debugLog('WebSocket already connecting/connected');
            return;
        }

        debugLog('Attempting to connect to telemetry stream');
        
        try {
            // Determine WebSocket URL based on current location
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            // Try connecting to local ComfyUI first, then fall back to current host
            const wsUrl = `${protocol}//${host}/telemetry` || `${protocol}//127.0.0.1:8188/telemetry`;
            
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                debugLog('WebSocket connected');
                setIsConnected(true);
                setError(null);
                reconnectCountRef.current = 0;
                setIsStreaming(true);
            };

            ws.onmessage = (event) => {
                try {
                    const update: RealtimeTelemetryUpdate = JSON.parse(event.data);
                    debugLog('Received telemetry update', update);

                    // Buffer updates to avoid excessive re-renders
                    bufferedUpdatesRef.current = update;
                    setLastUpdate(Date.now());

                    // Clear existing timeout and set new one
                    if (bufferTimeoutRef.current) {
                        clearTimeout(bufferTimeoutRef.current);
                    }

                    bufferTimeoutRef.current = setTimeout(() => {
                        if (bufferedUpdatesRef.current) {
                            setTelemetry(bufferedUpdatesRef.current);
                            bufferedUpdatesRef.current = null;
                        }
                    }, bufferMs);
                } catch (err) {
                    debugLog('Error parsing telemetry message', err);
                    setError(err instanceof Error ? err.message : 'Failed to parse telemetry');
                }
            };

            ws.onerror = (event) => {
                debugLog('WebSocket error', event);
                setError('WebSocket connection error');
                setIsStreaming(false);
            };

            ws.onclose = () => {
                debugLog('WebSocket disconnected');
                setIsConnected(false);
                setIsStreaming(false);

                // Attempt to reconnect with exponential backoff
                if (reconnectCountRef.current < reconnectAttempts) {
                    reconnectCountRef.current += 1;
                    const delayMs = reconnectDelay * Math.pow(2, reconnectCountRef.current - 1);
                    debugLog(`Reconnecting in ${delayMs}ms (attempt ${reconnectCountRef.current}/${reconnectAttempts})`);
                    
                    setTimeout(() => {
                        connect();
                    }, delayMs);
                } else {
                    setError(`Failed to connect after ${reconnectAttempts} attempts`);
                }
            };

            wsRef.current = ws;
        } catch (err) {
            debugLog('Error creating WebSocket', err);
            setError(err instanceof Error ? err.message : 'Failed to create WebSocket');
            setIsStreaming(false);
        }
    }, [bufferMs, reconnectAttempts, reconnectDelay, debugLog]);

    const disconnect = useCallback(() => {
        debugLog('Disconnecting from telemetry stream');
        
        if (bufferTimeoutRef.current) {
            clearTimeout(bufferTimeoutRef.current);
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setIsConnected(false);
        setIsStreaming(false);
        setTelemetry(null);
        reconnectCountRef.current = 0;
    }, [debugLog]);

    // Auto-connect on mount if enabled
    useEffect(() => {
        if (enabled) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect]);

    return {
        telemetry,
        isConnected,
        isStreaming,
        error,
        lastUpdate,
        connect,
        disconnect
    };
}

/**
 * A custom hook to apply an interactive spotlight effect to an element.
 * @returns A ref to be attached to the target HTML element.
 */
export function useInteractiveSpotlight<T extends HTMLElement>() {
    const ref = useRef<T>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = element.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            element.style.setProperty('--mouse-x-local', `${x}px`);
            element.style.setProperty('--mouse-y-local', `${y}px`);
        };

        element.addEventListener('mousemove', handleMouseMove);

        return () => {
            element.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    return ref;
}

/**
 * Hook for accessing historical run data with filtering and comparison
 */
export function useRunHistory() {
    const [historicalRuns, setHistoricalRuns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dbRef = useRef<any>(null);

    // Initialize database on mount
    useEffect(() => {
        let isMounted = true;

        const initDB = async () => {
            try {
                const { initializeRunHistoryDB } = await import('../services/runHistoryService');
                dbRef.current = await initializeRunHistoryDB();
                if (isMounted) {
                    setError(null);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Failed to initialize database');
                }
            }
        };

        initDB();
        return () => { isMounted = false; };
    }, []);

    // Fetch historical runs
    const fetchRuns = useCallback(async (criteria?: any, limit = 100) => {
        if (!dbRef.current) {
            setError('Database not initialized');
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const runs = await dbRef.current.queryRuns(criteria || {}, limit);
            setHistoricalRuns(runs);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch runs');
            setHistoricalRuns([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Save a new run
    const saveRun = useCallback(async (run: any) => {
        if (!dbRef.current) {
            setError('Database not initialized');
            return;
        }

        try {
            await dbRef.current.saveRun(run);
            // Refresh historical runs
            await fetchRuns();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save run');
        }
    }, [fetchRuns]);

    // Delete a run
    const deleteRun = useCallback(async (runId: string) => {
        if (!dbRef.current) {
            setError('Database not initialized');
            return;
        }

        try {
            await dbRef.current.deleteRun(runId);
            // Refresh historical runs
            await fetchRuns();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete run');
        }
    }, [fetchRuns]);

    // Get statistics
    const getStatistics = useCallback(async () => {
        if (!dbRef.current) {
            setError('Database not initialized');
            return null;
        }

        try {
            return await dbRef.current.getStatistics();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get statistics');
            return null;
        }
    }, []);

    // Clear old runs
    const clearOldRuns = useCallback(async (maxAgeDays: number) => {
        if (!dbRef.current) {
            setError('Database not initialized');
            return 0;
        }

        try {
            const deletedCount = await dbRef.current.clearOldRuns(maxAgeDays);
            // Refresh historical runs
            await fetchRuns();
            return deletedCount;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear old runs');
            return 0;
        }
    }, [fetchRuns]);

    // Calculate comparison metrics
    const compareWithHistorical = useCallback((currentRun: any) => {
        if (historicalRuns.length === 0) return null;

        // Calculate statistics from historical runs
        const durations = historicalRuns.map(r => r.metadata.totalDuration);
        const successRates = historicalRuns.map(r => r.metadata.successRate);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const avgSuccessRate = successRates.reduce((a, b) => a + b, 0) / successRates.length;

        // Calculate deltas
        const durationDelta = currentRun.metadata.totalDuration - avgDuration;
        const durationPercentage = (durationDelta / avgDuration) * 100;
        const successRateDelta = currentRun.metadata.successRate - avgSuccessRate;
        
        // Determine trend (simplified - would need more data for accuracy)
        let trend: 'improving' | 'degrading' | 'stable' = 'stable';
        if (Math.abs(durationPercentage) > 20) {
            trend = durationPercentage < 0 ? 'improving' : 'degrading';
        }

        return {
            currentRun,
            historicalRuns,
            deltas: {
                durationDelta,
                durationPercentage,
                successRateDelta,
                gpuPerformanceDelta: 0,
                trend,
                trendConfidence: Math.min(100, historicalRuns.length * 15)
            },
            statistics: {
                avgDuration,
                minDuration: Math.min(...durations),
                maxDuration: Math.max(...durations),
                stdDevDuration: Math.sqrt(
                    durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length
                ),
                avgSuccessRate,
                avgGpuUsage: 0
            }
        };
    }, [historicalRuns]);

    return {
        historicalRuns,
        loading,
        error,
        fetchRuns,
        saveRun,
        deleteRun,
        getStatistics,
        clearOldRuns,
        compareWithHistorical,
        dbInitialized: dbRef.current !== null
    };
}

/**
 * Hook to manage ComfyUI callback integration and automatic data ingestion
 * Listens for workflow completion events and populates historical data
 */
export function useComfyUICallbackManager() {
    const [isInitialized, setIsInitialized] = useState(false);
    const [subscriptionId] = useState(`subscriber-${Date.now()}`);
    const [lastWorkflow, setLastWorkflow] = useState<any | null>(null);
    const callbackManagerRef = useRef<any>(null);

    // Initialize callback manager on mount
    useEffect(() => {
        let isMounted = true;

        const initializeCallbackManager = async () => {
            try {
                const { initializeRunHistoryDB } = await import('../services/runHistoryService');
                const { getCallbackManager } = await import('../services/comfyUICallbackService');
                
                const db = await initializeRunHistoryDB();
                const manager = await getCallbackManager(db);
                
                if (isMounted) {
                    callbackManagerRef.current = manager;
                    setIsInitialized(true);
                }
            } catch (error) {
                console.error('Failed to initialize ComfyUI callback manager:', error);
            }
        };

        initializeCallbackManager();
        return () => { isMounted = false; };
    }, []);

    // Subscribe to workflow completion events
    useEffect(() => {
        if (!isInitialized || !callbackManagerRef.current) return;

        const handleWorkflowCompletion = (event: any) => {
            setLastWorkflow(event);
            // Trigger a potential UI refresh (useRunHistory will pick up the new data)
            console.log('✓ Workflow completed and saved to historical data:', event.runId);
        };

        callbackManagerRef.current.subscribe(subscriptionId, handleWorkflowCompletion);

        return () => {
            if (callbackManagerRef.current) {
                callbackManagerRef.current.unsubscribe(subscriptionId);
            }
        };
    }, [isInitialized, subscriptionId]);

    // Public method to manually trigger workflow processing (for testing)
    const processWorkflowEvent = useCallback(async (event: any) => {
        if (!callbackManagerRef.current) {
            console.warn('Callback manager not initialized');
            return;
        }
        await callbackManagerRef.current.processWorkflowEvent(event);
    }, []);

    // Get statistics from callback manager
    const getStatistics = useCallback(async () => {
        if (!callbackManagerRef.current) return null;
        return await callbackManagerRef.current.getStatistics();
    }, []);

    return {
        isInitialized,
        lastWorkflow,
        processWorkflowEvent,
        getStatistics,
        callbackManager: callbackManagerRef.current
    };
}

/**
 * useRecommendations Hook
 * 
 * Loads and manages performance recommendations from IndexedDB.
 * Supports filtering, dismissal, and clearing.
 */
export function useRecommendations(options?: {
  storyId?: string;
  severity?: 'critical' | 'warning' | 'info' | 'all';
  limit?: number;
}) {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dbRef = useRef<any>(null);

  // Initialize database on mount
  useEffect(() => {
    let isMounted = true;

    const initDB = async () => {
      try {
        const { RunHistoryDatabase } = await import('../services/runHistoryService');
        const db = new RunHistoryDatabase();
        await db.initialize();
        if (isMounted) {
          dbRef.current = db;
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize database');
        }
      }
    };

    initDB();
    return () => { isMounted = false; };
  }, []);

  // Fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!dbRef.current) {
      setError('Database not initialized');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Query all recommendations
      const allRecs = await dbRef.current.queryRecommendations(
        {},
        options?.limit || 50
      );

      let filtered = Array.isArray(allRecs) ? [...allRecs] : [];

      // Filter by severity
      if (options?.severity && options.severity !== 'all') {
        filtered = filtered.filter(r => r.severity === options.severity);
      }

      // Filter dismissed
      filtered = filtered.filter(r => !r.dismissed);

      setRecommendations(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, [options?.severity, options?.limit]);

  // Fetch recommendations on mount
  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Dismiss a recommendation
  const dismissRecommendation = useCallback(async (id: string) => {
    if (!dbRef.current) {
      setError('Database not initialized');
      return;
    }

    try {
      await dbRef.current.dismissRecommendation(id);
      // Refresh list
      await fetchRecommendations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss recommendation');
    }
  }, [fetchRecommendations]);

  // Clear all recommendations
  const clearAllRecommendations = useCallback(async () => {
    if (!dbRef.current) {
      setError('Database not initialized');
      return;
    }

    try {
      await dbRef.current.clearRecommendations();
      setRecommendations([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear recommendations');
    }
  }, []);

  return {
    recommendations,
    loading,
    error,
    dismissRecommendation,
    clearAllRecommendations,
    refresh: fetchRecommendations,
  };
}

/** Toast state for visual bible sync operations */
export interface VisualBibleSyncToast {
  synced: number;
  skipped: number;
  showResyncAll: boolean;
}

/** Result interface for useVisualBible hook */
export interface UseVisualBibleResult {
  visualBible: VisualBible;
  setVisualBible: React.Dispatch<React.SetStateAction<VisualBible>>;
  handleStoryBibleSave: () => void;
  handleResyncAll: () => void;
  syncToast: VisualBibleSyncToast | null;
  clearSyncToast: () => void;
  getCharacterSyncStatus: (characterId: string) => 'storyBible' | 'userEdit' | 'unlinked';
}

/**
 * Hook for managing Visual Bible data (characters, style boards, canonical keyframes).
 * Uses persistent state to store the visual bible across sessions.
 * 
 * Provides character descriptor synchronization with Story Bible:
 * - Auto-sync on Story Bible save (when bibleV2SaveSync flag enabled)
 * - Respects descriptorSource provenance (userEdit never auto-overwritten)
 * - Manual resync-all option (with confirmation)
 * - Toast notifications for sync results
 * 
 * @param storyBible - Optional Story Bible for character descriptor synchronization
 */
export function useVisualBible(storyBible?: StoryBible | null): UseVisualBibleResult {
  const [visualBible, setVisualBibleState] = usePersistentState<VisualBible>('visualBible', {
    characters: [],
    styleBoards: [],
  });
  const [syncToast, setSyncToast] = useState<VisualBibleSyncToast | null>(null);
  
  // Auto-sync character descriptors when storyBible or visualBible changes
  useEffect(() => {
    if (!storyBible || !visualBible.characters.length) {
      return;
    }
    
    const syncResult = syncCharacterDescriptors(storyBible, visualBible.characters);
    
    if (syncResult.synchronized.length > 0) {
      console.info('[useVisualBible] Synced character descriptors:', syncResult.synchronized);
      
      // Update visual bible characters with synced descriptors
      // Also set descriptorSource to 'storyBible' for synced characters
      const updatedCharacters = visualBible.characters.map(char => {
        const descriptor = syncResult.descriptors.get(char.id);
        if (descriptor) {
          // Convert string descriptor to visualTraits array
          const newTraits = typeof descriptor === 'string' 
            ? descriptor.split(',').map(t => t.trim()).filter(Boolean)
            : descriptor;
          
          if (JSON.stringify(char.visualTraits) !== JSON.stringify(newTraits)) {
            return { 
              ...char, 
              visualTraits: newTraits,
              descriptorSource: 'storyBible' as const,
            };
          }
        }
        return char;
      });
      
      // Only update if there were actual changes
      const hasChanges = updatedCharacters.some(
        (char, i) => {
          const originalChar = visualBible.characters[i];
          if (!originalChar) return true; // New character
          return JSON.stringify(char.visualTraits) !== JSON.stringify(originalChar.visualTraits);
        }
      );
      
      if (hasChanges) {
        setVisualBibleState({
          ...visualBible,
          characters: updatedCharacters,
        });
      }
    }
    
    if (syncResult.missing.length > 0) {
      console.warn('[useVisualBible] Missing character descriptors:', syncResult.missing);
    }
  }, [storyBible, visualBible.characters.length]); // Only trigger on character count change to avoid loops

  /**
   * Manually trigger Story Bible sync (when user saves Story Bible).
   * Respects descriptorSource provenance - userEdit characters are not overwritten.
   * Shows toast with sync results.
   */
  const handleStoryBibleSave = useCallback(() => {
    if (!storyBible || !visualBible.characters.length) {
      return;
    }
    
    const syncResult = syncCharacterDescriptors(storyBible, visualBible.characters);
    
    // Apply sync to visual bible (respecting provenance)
    const updatedCharacters = visualBible.characters.map(char => {
      const descriptor = syncResult.descriptors.get(char.id);
      // Only update if:
      // 1. We have a descriptor from story bible
      // 2. Character is not user-edited (respecting provenance)
      if (descriptor && !syncResult.skippedUserEdits.includes(char.name)) {
        const newTraits = typeof descriptor === 'string' 
          ? descriptor.split(',').map(t => t.trim()).filter(Boolean)
          : descriptor;
        return { 
          ...char, 
          visualTraits: newTraits,
          descriptorSource: 'storyBible' as const,
        };
      }
      return char;
    });
    
    setVisualBibleState({
      ...visualBible,
      characters: updatedCharacters,
    });
    
    // Show toast with sync results
    setSyncToast({
      synced: syncResult.synchronized.length,
      skipped: syncResult.skippedUserEdits.length,
      showResyncAll: syncResult.skippedUserEdits.length > 0,
    });
    
    console.info('[useVisualBible] Manual sync complete:', {
      synced: syncResult.synchronized,
      skipped: syncResult.skippedUserEdits,
    });
  }, [storyBible, visualBible, setVisualBibleState]);

  /**
   * Force resync ALL characters from Story Bible, overriding userEdit provenance.
   * This resets all descriptorSource to 'storyBible'.
   * Use with caution - user customizations will be lost.
   */
  const handleResyncAll = useCallback(() => {
    if (!storyBible || !visualBible.characters.length) {
      return;
    }
    
    // First, reset all characters to storyBible provenance so they can be synced
    const resetCharacters = visualBible.characters.map(char => ({
      ...char,
      descriptorSource: 'storyBible' as const,
    }));
    
    const syncResult = syncCharacterDescriptors(storyBible, resetCharacters);
    
    // Apply all syncs (no provenance protection since we reset)
    const updatedCharacters = resetCharacters.map(char => {
      const descriptor = syncResult.descriptors.get(char.id);
      if (descriptor) {
        const newTraits = typeof descriptor === 'string' 
          ? descriptor.split(',').map(t => t.trim()).filter(Boolean)
          : descriptor;
        return { 
          ...char, 
          visualTraits: newTraits,
          descriptorSource: 'storyBible' as const,
        };
      }
      return char;
    });
    
    setVisualBibleState({
      ...visualBible,
      characters: updatedCharacters,
    });
    
    // Show toast (no skipped since we forced resync)
    setSyncToast({
      synced: syncResult.synchronized.length,
      skipped: 0,
      showResyncAll: false,
    });
    
    console.info('[useVisualBible] Force resync complete:', {
      synced: syncResult.synchronized.length,
    });
  }, [storyBible, visualBible, setVisualBibleState]);

  /** Clear the sync toast notification */
  const clearSyncToast = useCallback(() => {
    setSyncToast(null);
  }, []);

  /**
   * Get the sync status of a character for UI display.
   * @param characterId - The character ID to check
   * @returns 'storyBible' if synced, 'userEdit' if manually edited, 'unlinked' if not linked
   */
  const getCharacterSyncStatus = useCallback((characterId: string): 'storyBible' | 'userEdit' | 'unlinked' => {
    const char = visualBible.characters.find(c => c.id === characterId);
    if (!char) return 'unlinked';
    if (!char.storyBibleCharacterId) return 'unlinked';
    return char.descriptorSource ?? 'storyBible';
  }, [visualBible.characters]);

  return {
    visualBible,
    setVisualBible: setVisualBibleState,
    handleStoryBibleSave,
    handleResyncAll,
    syncToast,
    clearSyncToast,
    getCharacterSyncStatus,
  };
}

export interface E2EQAResult {
  runId: string;
  timestamp: string;
  scenes: Array<{
    sceneId: string;
    frameCount: number;
    avgBrightness: number;
    frameVariance: number;
    flags: string[];
  }>;
  helperSummary?: ComfyUIStatusSummary;
  helperSummaryPath?: string;
}

export function useLastE2EQAResult(): {
  result: E2EQAResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [result, setResult] = useState<E2EQAResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try to fetch from logs/latest-qa.json or similar
      // For now, look in logs directory for qa-report.json files
      const response = await fetch('/logs/latest-qa.json');
      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        setResult(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load E2E QA results');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { result, loading, error, refresh };
}

// ============================================================================
// Story Bible Validation Hook
// ============================================================================

import { validateStoryBibleHard, buildRegenerationFeedback, type StoryBibleValidationResult, type ValidationIssue } from '../services/storyBibleValidator';
import { isStoryBibleV2, StoryBibleV2 } from '../types';

/**
 * Hook result for Story Bible validation state
 */
export interface StoryBibleValidationState {
  /** Whether validation has been performed */
  validated: boolean;
  /** Whether the Story Bible passes hard validation */
  valid: boolean;
  /** All validation issues */
  issues: ValidationIssue[];
  /** Error-level issues only */
  errors: ValidationIssue[];
  /** Warning-level issues only */
  warnings: ValidationIssue[];
  /** Human-readable feedback for regeneration */
  feedback: string;
  /** Whether the Story Bible is V2 format */
  isV2: boolean;
  /** Recalculate validation */
  revalidate: () => void;
}

/**
 * Hook to validate a Story Bible and track validation state.
 * 
 * This hook integrates the storyBibleValidator to provide:
 * - Real-time validation status
 * - Error/warning separation
 * - Regeneration feedback
 * 
 * @param storyBible - The Story Bible to validate (can be null)
 * @returns Validation state including issues, feedback, and revalidate function
 */
export function useStoryBibleValidation(storyBible: StoryBible | StoryBibleV2 | null): StoryBibleValidationState {
  const [validationResult, setValidationResult] = useState<StoryBibleValidationResult | null>(null);

  const revalidate = useCallback(() => {
    if (!storyBible) {
      setValidationResult(null);
      return;
    }

    // Convert to V2 for validation if needed
    const bibleV2: StoryBibleV2 = isStoryBibleV2(storyBible)
      ? storyBible
      : {
          ...storyBible,
          version: '2.0',
          characterProfiles: [],
          plotScenes: [],
        };

    const result = validateStoryBibleHard(bibleV2);
    setValidationResult(result);
  }, [storyBible]);

  // Auto-validate when story bible changes
  useEffect(() => {
    revalidate();
  }, [revalidate]);

  // Compute derived state
  const issues = validationResult?.issues ?? [];
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  
  // Build feedback for each section that has issues
  const buildFeedbackForIssues = (): string => {
    if (!validationResult || issues.length === 0) return '';
    
    const sections = new Set(issues.map(i => i.section.split('.')[0]));
    const feedbackParts: string[] = [];
    
    for (const section of sections) {
      const sectionFeedback = buildRegenerationFeedback(validationResult, section as keyof StoryBible);
      if (sectionFeedback) {
        feedbackParts.push(sectionFeedback);
      }
    }
    
    return feedbackParts.join('\n\n');
  };
  
  const feedback = buildFeedbackForIssues();

  return {
    validated: validationResult !== null,
    valid: validationResult?.valid ?? false,
    issues,
    errors,
    warnings,
    feedback,
    isV2: storyBible ? isStoryBibleV2(storyBible) : false,
    revalidate,
  };
}
