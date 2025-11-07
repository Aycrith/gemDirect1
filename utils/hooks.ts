import React, { useState, useEffect, useCallback } from 'react';
import * as db from './database';
import { StoryBible, Scene, WorkflowStage, ToastMessage } from '../types';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useUsage } from '../contexts/UsageContext';
import { generateStoryBible, generateSceneList, generateKeyframeForScene } from '../services/geminiService';

/**
 * A custom hook that syncs a state with IndexedDB.
 * @param key The key to use for storing the value in the database.
 * @param initialValue The initial value of the state.
 * @returns A state and a setter function, similar to useState.
 */
export function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(initialValue);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load initial data from DB on mount
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            const data = await db.getData(key);
            if (isMounted && data !== undefined && data !== null) {
                setState(data);
            }
            setIsLoaded(true);
        };
        load();
        return () => { isMounted = false; };
    }, [key]);

    // Save data to DB whenever state changes
    useEffect(() => {
        if (isLoaded) {
            db.saveData(key, state);
        }
    }, [key, state, isLoaded]);

    return [state, setState];
}

/**
 * A custom hook to manage the core project data lifecycle.
 */
export function useProjectData() {
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('idea');
    const [storyBible, setStoryBible] = useState<StoryBible | null>(null);
    const [directorsVision, setDirectorsVision] = useState<string>('');
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();

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
        if (!isLoading && scenes.length > 0) db.saveScenes(scenes);
    }, [scenes, isLoading]);

    const handleGenerateStoryBible = useCallback(async (idea: string, addToast: (message: string, type: ToastMessage['type']) => void) => {
        setIsLoading(true);
        try {
            const bible = await generateStoryBible(idea, logApiCall, updateApiStatus);
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
            const sceneList = await generateSceneList(storyBible.plotOutline, vision, logApiCall, updateApiStatus);
            const newScenes: Scene[] = sceneList.map(s => ({
                id: `scene_${Date.now()}_${Math.random()}`,
                title: s.title,
                summary: s.summary,
                timeline: { shots: [], shotEnhancers: {}, transitions: [], negativePrompt: '' },
            }));
            setScenes(newScenes);
            addToast(`${newScenes.length} scenes generated! Now generating keyframe images. This may take a moment due to rate limits.`, 'info');

            // Generate images sequentially to respect API rate limits.
            let successes = 0;
            for (let i = 0; i < newScenes.length; i++) {
                const scene = newScenes[i];
                try {
                    // Update UI with progress. The 'withRetry' helper will also show its own messages.
                    updateApiStatus('loading', `Generating keyframe ${i + 1}/${newScenes.length} for scene: "${scene.title}"`);
                    
                    const prompt = `A cinematic keyframe for a scene about: "${scene.summary}". Style: ${vision}`;
                    const image = await generateKeyframeForScene(prompt, logApiCall, updateApiStatus);
                    
                    // Update state incrementally so the user sees images appear one by one.
                    setGeneratedImages(prev => ({ ...prev, [scene.id]: image }));
                    successes++;
                } catch (e) {
                    // The withRetry handler will show a toast, but we can log it here too.
                    console.error(`Failed to generate keyframe for scene "${scene.title}":`, e);
                    // The error toast is already handled by `withRetry`.
                }
            }

            setWorkflowStage('director');
            if (successes === newScenes.length) {
                addToast('All scene keyframes generated successfully!', 'success');
            } else {
                 addToast(`Generated ${successes}/${newScenes.length} keyframes. Some images failed due to API errors.`, successes > 0 ? 'info' : 'error');
            }

        } catch (e) {
            console.error(e);
            // This catches errors from generateSceneList.
            addToast(e instanceof Error ? e.message : 'Failed to generate scenes.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [storyBible, logApiCall, updateApiStatus]);


    return {
        workflowStage, setWorkflowStage,
        storyBible, setStoryBible,
        directorsVision, setDirectorsVision,
        scenes, setScenes,
        isLoading,
        handleGenerateStoryBible,
        handleGenerateScenes
    };
}