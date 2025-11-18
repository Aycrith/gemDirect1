import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as db from './database';
import { StoryBible, Scene, WorkflowStage, ToastMessage, Suggestion, TimelineData, Shot, SceneStatus, SceneGenerationStatus, VisualBible, ComfyUIStatusSummary } from '../types';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useUsage } from '../contexts/UsageContext';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { useMediaGenerationActions } from '../contexts/MediaGenerationProviderContext';

const persistentStateDebugEnabled = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_DEBUG_PERSISTENT_STATE ?? 'false') === 'true';
const debugPersistentState = (...args: unknown[]) => {
    if (persistentStateDebugEnabled) {
        console.debug(...args);
    }
};

/**
 * A custom hook that syncs a state with IndexedDB.
 * @param key The key to use for storing the value in the database.
 * @param initialValue The initial value of the state.
 * @returns A state and a setter function, similar to useState.
 */
export function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(initialValue);
    const [isLoaded, setIsLoaded] = useState(false);
    const prevStateRef = useRef<T>(initialValue);

    // Load initial data from DB on mount
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            const data = await db.getData(key);
            if (isMounted && data !== undefined && data !== null) {
                // Handle Set deserialization
                if (initialValue instanceof Set && Array.isArray(data)) {
                    const newSet = new Set(data) as T;
                    setState(newSet);
                    prevStateRef.current = newSet;
                } else {
                    setState(data);
                    prevStateRef.current = data;
                }
            }
            setIsLoaded(true);
        };
        load();
        return () => { isMounted = false; };
    }, [key, initialValue]);

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
            debugPersistentState(`[usePersistentState(${key})] Save effect triggered. isLoaded:`, isLoaded, 'state:', JSON.stringify(state));
        }
        
        // Handle Set serialization
        if (state instanceof Set) {
            if (persistentStateDebugEnabled) {
                debugPersistentState(`[usePersistentState(${key})] Saving Set to DB:`, Array.from(state));
            }
            db.saveData(key, Array.from(state));
        } else {
            if (persistentStateDebugEnabled) {
                debugPersistentState(`[usePersistentState(${key})] Saving to DB:`, JSON.stringify(state));
            }
            db.saveData(key, state);
        }

        prevStateRef.current = state;
    }, [key, state, isLoaded]);

    return [state, setState];
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
        setSceneStatuses(prev => ({
            ...prev,
            [sceneId]: {
                ...prev[sceneId],
                sceneId,
                status,
                progress: progress ?? prev[sceneId]?.progress ?? 0,
                error,
                startTime: prev[sceneId]?.startTime || Date.now(),
                endTime: (status === 'complete' || status === 'failed') ? Date.now() : undefined,
            }
        }));
    }, []);
    
    return { sceneStatuses, updateSceneStatus };
}

/**
 * A custom hook to manage the core project data lifecycle.
 */
export function useProjectData(setGenerationProgress: React.Dispatch<React.SetStateAction<{ current: number, total: number, task: string }>>) {
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [scenesToReview, setScenesToReview] = usePersistentState('scenesToReview', new Set<string>());

    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();
    const planActions = usePlanExpansionActions();
    const mediaActions = useMediaGenerationActions();

    // Initial data load
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const bible = await db.getStoryBible();
            const vision = await db.getData('directorsVision');
            const sceneList = await db.getAllScenes();
            
            if (bible) {
                setStoryBible(bible);
                if (vision) {
                    setDirectorsVision(vision);
                    if (sceneList.length > 0) {
                        setScenes(sceneList);
                        setWorkflowStage('director');
                    } else {
                        setWorkflowStage('vision');
                    }
                } else {
                    setWorkflowStage('bible');
                }
            } else {
                setWorkflowStage('idea');
            }
            setIsLoading(false);
        };
        loadData();
    }, []);

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
        try {
            const bible = await planActions.generateStoryBible(idea, genre, logApiCall, updateApiStatus);
            setStoryBible(bible);
            setWorkflowStage('bible');
            addToast('Story Bible generated successfully!', 'success');
        } catch (e) {
            console.error(e);
            addToast(e instanceof Error ? e.message : 'Failed to generate Story Bible.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [logApiCall, updateApiStatus]);

    const handleGenerateScenes = useCallback(async (
        vision: string, 
        addToast: (message: string, type: ToastMessage['type']) => void, 
        setGeneratedImages: React.Dispatch<React.SetStateAction<Record<string, string>>>,
        updateSceneStatus?: (sceneId: string, status: SceneGenerationStatus, progress?: number, error?: string) => void
    ) => {
        if (!storyBible) return;
        setIsLoading(true);
        setDirectorsVision(vision);
        try {
            const sceneList = await planActions.generateSceneList(storyBible.plotOutline, vision, logApiCall, updateApiStatus);
            const newScenes: Scene[] = sceneList.map(s => ({
                id: `scene_${Date.now()}_${Math.random()}`,
                title: s.title,
                summary: s.summary,
                timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
            }));
            setScenes(newScenes);
            setWorkflowStage('director');
            
            // Mark all scenes as pending
            newScenes.forEach(s => {
                updateSceneStatus?.(s.id, 'pending', 0);
            });
            
            addToast(`${newScenes.length} scenes generated! Now generating keyframe images.`, 'info');
            
            setGenerationProgress({ current: 0, total: newScenes.length, task: 'Generating Scene Keyframes...' });

            let successes = 0;
            for (let i = 0; i < newScenes.length; i++) {
                const scene = newScenes[i];
                try {
                    // Mark as generating
                    updateSceneStatus?.(scene.id, 'generating', 10);
                    
                    const taskMessage = `Generating keyframe for scene: "${scene.title}"`;
                    setGenerationProgress(prev => ({ ...prev, current: i + 1, task: taskMessage }));
                    
                    const image = await mediaActions.generateKeyframeForScene(vision, scene.summary, scene.id, logApiCall, updateApiStatus);
                    
                    setGeneratedImages(prev => ({ ...prev, [scene.id]: image }));
                    
                    // Mark as complete
                    updateSceneStatus?.(scene.id, 'complete', 100);
                    successes++;
                } catch (e) {
                    console.error(`Failed to generate keyframe for scene "${scene.title}":`, e);
                    // Mark as failed
                    updateSceneStatus?.(scene.id, 'failed', 0, e instanceof Error ? e.message : 'Unknown error');
                }

                // Add a delay after each request (except the last) to stay well under RPM limits.
                if (i < newScenes.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1100)); // ~55 RPM max
                }
            }
            
            setGenerationProgress({ current: 0, total: 0, task: '' }); // Reset progress bar

            if (successes === newScenes.length) {
                addToast('All scene keyframes generated successfully!', 'success');
            } else {
                 addToast(`Generated ${successes}/${newScenes.length} keyframes. Some images failed due to API errors.`, successes > 0 ? 'info' : 'error');
            }

        } catch (e) {
            console.error(e);
            addToast(e instanceof Error ? e.message : 'Failed to generate scenes.', 'error');
        } finally {
            setIsLoading(false);
            setGenerationProgress({ current: 0, total: 0, task: '' });
        }
    }, [storyBible, logApiCall, updateApiStatus, setGenerationProgress, planActions, mediaActions]);


    const applySuggestions = useCallback((suggestions: Suggestion[], sceneIdToUpdate?: string, addToast?: (message: string, type: ToastMessage['type']) => void) => {
        let newScenes = [...scenes];
        let newStoryBible = storyBible ? {...storyBible} : null;
        let newDirectorsVision = directorsVision;
        let newScenesToReview = new Set(scenesToReview);
        let changesMade = false;
        let toastMessage = 'Suggestion applied!';
    
        suggestions.forEach(suggestion => {
            switch (suggestion.type) {
                case 'UPDATE_STORY_BIBLE':
                    if (newStoryBible) {
                        newStoryBible[suggestion.payload.field] = suggestion.payload.new_content;
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
                    if (sceneIdToUpdate) {
                        const sceneIndex = newScenes.findIndex(s => s.id === sceneIdToUpdate);
                        if (sceneIndex > -1) {
                            // Deep copy only the scene we're modifying
                            const sceneToUpdate = JSON.parse(JSON.stringify(newScenes[sceneIndex]));
                            const timeline: TimelineData = sceneToUpdate.timeline;
    
                            if (suggestion.type === 'UPDATE_SHOT') {
                                const shot = timeline.shots.find(s => s.id === suggestion.shot_id);
                                if (shot) {
                                    if (suggestion.payload.description) shot.description = suggestion.payload.description;
                                    if (suggestion.payload.enhancers) timeline.shotEnhancers[suggestion.shot_id] = { ...(timeline.shotEnhancers[suggestion.shot_id] || {}), ...suggestion.payload.enhancers };
                                }
                            } else if (suggestion.type === 'ADD_SHOT_AFTER') {
                                const afterShotIndex = timeline.shots.findIndex(s => s.id === suggestion.after_shot_id);
                                if (afterShotIndex > -1) {
                                    const newShot: Shot = {
                                        id: `shot_${Date.now()}_${Math.random()}`,
                                        title: suggestion.payload.title,
                                        description: suggestion.payload.description || '',
                                    };
                                    timeline.shots.splice(afterShotIndex + 1, 0, newShot);
                                    timeline.transitions.splice(afterShotIndex, 0, 'Cut');
                                    if (suggestion.payload.enhancers) timeline.shotEnhancers[newShot.id] = suggestion.payload.enhancers;
                                }
                            } else if (suggestion.type === 'UPDATE_TRANSITION') {
                                if (timeline.transitions[suggestion.transition_index] && suggestion.payload.type) {
                                    timeline.transitions[suggestion.transition_index] = suggestion.payload.type;
                                }
                            }
    
                            newScenes[sceneIndex] = sceneToUpdate;
                            changesMade = true;
                            toastMessage = 'Timeline updated!';
                        }
                    }
                    break;
            }
        });
    
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

/**
 * Hook for managing Visual Bible data (characters, style boards, canonical keyframes).
 * Uses persistent state to store the visual bible across sessions.
 */
export function useVisualBible() {
  const [visualBible, setVisualBibleState] = usePersistentState<VisualBible>('visualBible', {
    characters: [],
    styleBoards: [],
  });

  // TODO: Update the service context whenever visualBible changes - visualBibleContext not yet implemented
  // React.useEffect(() => {
  //   import('../services/visualBibleContext').then(({ setVisualBible }) => {
  //     setVisualBible(visualBible);
  //   });
  // }, [visualBible]);

  return {
    visualBible,
    setVisualBible: setVisualBibleState,
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
