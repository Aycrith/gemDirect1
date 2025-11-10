import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as db from './database';
import { StoryBible, Scene, WorkflowStage, ToastMessage, Suggestion, TimelineData, Shot } from '../types';
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

    const handleGenerateStoryBible = useCallback(async (idea: string, addToast: (message: string, type: ToastMessage['type']) => void) => {
        setIsLoading(true);
        try {
            const bible = await planActions.generateStoryBible(idea, logApiCall, updateApiStatus);
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

    const handleGenerateScenes = useCallback(async (vision: string, addToast: (message: string, type: ToastMessage['type']) => void, setGeneratedImages: React.Dispatch<React.SetStateAction<Record<string, string>>>) => {
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
            addToast(`${newScenes.length} scenes generated! Now generating keyframe images.`, 'info');
            
            setGenerationProgress({ current: 0, total: newScenes.length, task: 'Generating Scene Keyframes...' });

            let successes = 0;
            for (let i = 0; i < newScenes.length; i++) {
                const scene = newScenes[i];
                try {
                    const taskMessage = `Generating keyframe for scene: "${scene.title}"`;
                    setGenerationProgress(prev => ({ ...prev, current: i + 1, task: taskMessage }));
                    
                    const image = await mediaActions.generateKeyframeForScene(vision, scene.summary, logApiCall, updateApiStatus);
                    
                    setGeneratedImages(prev => ({ ...prev, [scene.id]: image }));
                    successes++;
                } catch (e) {
                    console.error(`Failed to generate keyframe for scene "${scene.title}":`, e);
                }

                // Add a delay after each request (except the last) to stay well under RPM limits.
                if (i < newScenes.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1100)); // ~55 RPM max
                }
            }
            
            setGenerationProgress({ current: 0, total: 0, task: '' }); // Reset progress bar

            setWorkflowStage('director');
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