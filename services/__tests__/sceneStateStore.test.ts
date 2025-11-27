/**
 * Scene State Store Tests
 * 
 * Tests for the unified Zustand-based scene state store.
 * Validates scene CRUD operations, IndexedDB persistence,
 * hydration, and feature flag integration.
 * 
 * @module services/__tests__/sceneStateStore.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import {
    useSceneStateStore,
    SCENE_STORE_NAME,
    createJobId,
    getSceneStoreState,
} from '../sceneStateStore';
import type { Scene, TimelineData, GenerationJob } from '../../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestScene = (overrides: Partial<Scene> = {}): Scene => ({
    id: `scene_${Date.now()}_${Math.random().toString(36).substring(2)}`,
    title: 'Test Scene',
    summary: 'A test scene summary',
    timeline: {
        shots: [],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: '',
    },
    ...overrides,
});

const createTestTimeline = (overrides: Partial<TimelineData> = {}): TimelineData => ({
    shots: [
        { id: 'shot_1', description: 'First shot' },
        { id: 'shot_2', description: 'Second shot' },
    ],
    shotEnhancers: {},
    transitions: ['cut'],
    negativePrompt: 'blurry, low quality',
    ...overrides,
});

const createTestJob = (overrides: Partial<GenerationJob> = {}): GenerationJob => ({
    id: createJobId('keyframe', 'scene_1'),
    type: 'keyframe',
    sceneId: 'scene_1',
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
    ...overrides,
});

// ============================================================================
// Store Reset Helper
// ============================================================================

const resetStore = () => {
    const store = useSceneStateStore.getState();
    store.resetStore();
};

// ============================================================================
// Tests
// ============================================================================

describe('sceneStateStore', () => {
    beforeEach(() => {
        // Reset store before each test
        resetStore();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // Test 1: Scene CRUD Operations
    // ========================================================================
    describe('Scene CRUD Operations', () => {
        it('should add a scene', () => {
            const scene = createTestScene({ id: 'scene_add_test', title: 'Added Scene' });
            
            act(() => {
                useSceneStateStore.getState().addScene(scene);
            });
            
            const state = getSceneStoreState();
            expect(state.scenes).toHaveLength(1);
            expect(state.scenes[0]!.id).toBe('scene_add_test');
            expect(state.scenes[0]!.title).toBe('Added Scene');
        });

        it('should update a scene', () => {
            const scene = createTestScene({ id: 'scene_update_test', title: 'Original Title' });
            
            act(() => {
                useSceneStateStore.getState().addScene(scene);
                useSceneStateStore.getState().updateScene('scene_update_test', { title: 'Updated Title' });
            });
            
            const state = getSceneStoreState();
            expect(state.scenes[0]!.title).toBe('Updated Title');
            expect(state.scenes[0]!.summary).toBe(scene.summary); // Other fields unchanged
        });

        it('should delete a scene and clean up related data', () => {
            const scene = createTestScene({ id: 'scene_delete_test' });
            
            act(() => {
                useSceneStateStore.getState().addScene(scene);
                useSceneStateStore.getState().setGeneratedImage('scene_delete_test', 'base64image');
                useSceneStateStore.getState().setSelectedSceneId('scene_delete_test');
            });
            
            // Verify scene and related data exist
            let state = getSceneStoreState();
            expect(state.scenes).toHaveLength(1);
            expect(state.generatedImages['scene_delete_test']).toBe('base64image');
            expect(state.selectedSceneId).toBe('scene_delete_test');
            
            // Delete scene
            act(() => {
                useSceneStateStore.getState().deleteScene('scene_delete_test');
            });
            
            // Verify cleanup
            state = getSceneStoreState();
            expect(state.scenes).toHaveLength(0);
            expect(state.generatedImages['scene_delete_test']).toBeUndefined();
            expect(state.selectedSceneId).toBeNull(); // Auto-cleared
        });

        it('should set multiple scenes', () => {
            const scenes = [
                createTestScene({ id: 'scene_1', title: 'Scene One' }),
                createTestScene({ id: 'scene_2', title: 'Scene Two' }),
                createTestScene({ id: 'scene_3', title: 'Scene Three' }),
            ];
            
            act(() => {
                useSceneStateStore.getState().setScenes(scenes);
            });
            
            const state = getSceneStoreState();
            expect(state.scenes).toHaveLength(3);
            expect(state.scenes.map(s => s.title)).toEqual(['Scene One', 'Scene Two', 'Scene Three']);
        });

        it('should get a scene by ID', () => {
            const scene = createTestScene({ id: 'scene_get_test', title: 'Get Me' });
            
            act(() => {
                useSceneStateStore.getState().addScene(scene);
            });
            
            const foundScene = useSceneStateStore.getState().getScene('scene_get_test');
            expect(foundScene).toBeDefined();
            expect(foundScene?.title).toBe('Get Me');
            
            const notFound = useSceneStateStore.getState().getScene('nonexistent');
            expect(notFound).toBeUndefined();
        });
    });

    // ========================================================================
    // Test 2: Timeline Management
    // ========================================================================
    describe('Timeline Management', () => {
        it('should set and get timeline for a scene', () => {
            const scene = createTestScene({ id: 'scene_timeline_test' });
            const timeline = createTestTimeline();
            
            act(() => {
                useSceneStateStore.getState().addScene(scene);
                useSceneStateStore.getState().setTimeline('scene_timeline_test', timeline);
            });
            
            const state = getSceneStoreState();
            expect(state.timelines['scene_timeline_test']).toEqual(timeline);
            
            // Also verify scene's timeline reference is updated
            expect(state.scenes[0]!.timeline).toEqual(timeline);
            
            // Test getTimeline
            const retrievedTimeline = useSceneStateStore.getState().getTimeline('scene_timeline_test');
            expect(retrievedTimeline).toEqual(timeline);
        });
    });

    // ========================================================================
    // Test 3: Generation Job Tracking
    // ========================================================================
    describe('Generation Job Tracking', () => {
        it('should add and track generation jobs', () => {
            const job = createTestJob({ id: 'job_1', sceneId: 'scene_1' });
            
            act(() => {
                useSceneStateStore.getState().addGenerationJob(job);
            });
            
            const state = getSceneStoreState();
            expect(state.generationJobs['job_1']).toEqual(job);
        });

        it('should update job progress', () => {
            const job = createTestJob({ id: 'job_progress', status: 'queued' });
            
            act(() => {
                useSceneStateStore.getState().addGenerationJob(job);
                useSceneStateStore.getState().updateJobProgress('job_progress', 50, 'KSampler');
            });
            
            const state = getSceneStoreState();
            expect(state.generationJobs['job_progress']!.progress).toBe(50);
            expect(state.generationJobs['job_progress']!.currentNode).toBe('KSampler');
            expect(state.generationJobs['job_progress']!.status).toBe('in-progress'); // Auto-updated
        });

        it('should complete jobs with success or failure', () => {
            const successJob = createTestJob({ id: 'job_success', status: 'in-progress' });
            const failJob = createTestJob({ id: 'job_fail', status: 'in-progress' });
            
            act(() => {
                useSceneStateStore.getState().addGenerationJob(successJob);
                useSceneStateStore.getState().addGenerationJob(failJob);
                useSceneStateStore.getState().completeJob('job_success', 'completed', 'base64result');
                useSceneStateStore.getState().completeJob('job_fail', 'failed', undefined, 'Connection timeout');
            });
            
            const state = getSceneStoreState();
            
            expect(state.generationJobs['job_success']!.status).toBe('completed');
            expect(state.generationJobs['job_success']!.progress).toBe(100);
            expect(state.generationJobs['job_success']!.result).toBe('base64result');
            expect(state.generationJobs['job_success']!.completedAt).toBeDefined();
            
            expect(state.generationJobs['job_fail']!.status).toBe('failed');
            expect(state.generationJobs['job_fail']!.error).toBe('Connection timeout');
        });

        it('should get active jobs for a scene', () => {
            const jobs = [
                createTestJob({ id: 'active_1', sceneId: 'scene_1', status: 'in-progress' }),
                createTestJob({ id: 'active_2', sceneId: 'scene_1', status: 'queued' }),
                createTestJob({ id: 'completed_1', sceneId: 'scene_1', status: 'completed' }),
                createTestJob({ id: 'other_scene', sceneId: 'scene_2', status: 'in-progress' }),
            ];
            
            act(() => {
                jobs.forEach(job => useSceneStateStore.getState().addGenerationJob(job));
            });
            
            const activeJobs = useSceneStateStore.getState().getActiveJobsForScene('scene_1');
            expect(activeJobs).toHaveLength(2);
            expect(activeJobs.map(j => j.id)).toContain('active_1');
            expect(activeJobs.map(j => j.id)).toContain('active_2');
        });

        it('should cleanup old completed jobs', () => {
            const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            const jobs = [
                createTestJob({ id: 'old_completed', status: 'completed', completedAt: oldTimestamp, createdAt: oldTimestamp }),
                createTestJob({ id: 'recent_completed', status: 'completed', completedAt: Date.now() }),
                createTestJob({ id: 'active_job', status: 'in-progress' }),
            ];
            
            act(() => {
                jobs.forEach(job => useSceneStateStore.getState().addGenerationJob(job));
                useSceneStateStore.getState().cleanupOldJobs();
            });
            
            const state = getSceneStoreState();
            expect(state.generationJobs['old_completed']).toBeUndefined(); // Cleaned up
            expect(state.generationJobs['recent_completed']).toBeDefined(); // Kept
            expect(state.generationJobs['active_job']).toBeDefined(); // Active jobs always kept
        });
    });

    // ========================================================================
    // Test 4: Generated Assets
    // ========================================================================
    describe('Generated Assets', () => {
        it('should store and retrieve generated images', () => {
            act(() => {
                useSceneStateStore.getState().setGeneratedImage('scene_1', 'base64imagedata');
            });
            
            const state = getSceneStoreState();
            expect(state.generatedImages['scene_1']).toBe('base64imagedata');
        });

        it('should store bookend keyframes', () => {
            const bookendData = { start: 'start_base64', end: 'end_base64' };
            
            act(() => {
                useSceneStateStore.getState().setGeneratedImage('scene_bookend', bookendData);
            });
            
            const state = getSceneStoreState();
            expect(state.generatedImages['scene_bookend']).toEqual(bookendData);
        });

        it('should store shot images', () => {
            act(() => {
                useSceneStateStore.getState().setShotImage('shot_1', 'shot_image_base64');
            });
            
            const state = getSceneStoreState();
            expect(state.generatedShotImages['shot_1']).toBe('shot_image_base64');
        });

        it('should clear all assets for a scene', () => {
            const scene = createTestScene({ 
                id: 'scene_clear_test',
                timeline: createTestTimeline(),
            });
            
            act(() => {
                useSceneStateStore.getState().addScene(scene);
                useSceneStateStore.getState().setGeneratedImage('scene_clear_test', 'image');
                useSceneStateStore.getState().setShotImage('shot_1', 'shot_image');
                useSceneStateStore.getState().updateSceneImageStatus('scene_clear_test', { status: 'complete' });
            });
            
            // Verify assets exist
            let state = getSceneStoreState();
            expect(state.generatedImages['scene_clear_test']).toBeDefined();
            expect(state.sceneImageStatuses['scene_clear_test']).toBeDefined();
            
            // Clear assets
            act(() => {
                useSceneStateStore.getState().clearSceneAssets('scene_clear_test');
            });
            
            // Verify cleared
            state = getSceneStoreState();
            expect(state.generatedImages['scene_clear_test']).toBeUndefined();
            expect(state.sceneImageStatuses['scene_clear_test']).toBeUndefined();
        });
    });

    // ========================================================================
    // Test 5: UI State
    // ========================================================================
    describe('UI State', () => {
        it('should manage selected scene ID', () => {
            act(() => {
                useSceneStateStore.getState().setSelectedSceneId('scene_1');
            });
            
            expect(getSceneStoreState().selectedSceneId).toBe('scene_1');
            
            act(() => {
                useSceneStateStore.getState().setSelectedSceneId(null);
            });
            
            expect(getSceneStoreState().selectedSceneId).toBeNull();
        });

        it('should toggle shot expansion', () => {
            act(() => {
                useSceneStateStore.getState().toggleShotExpanded('shot_1');
            });
            
            expect(getSceneStoreState().expandedShots).toContain('shot_1');
            
            act(() => {
                useSceneStateStore.getState().toggleShotExpanded('shot_1');
            });
            
            expect(getSceneStoreState().expandedShots).not.toContain('shot_1');
        });

        it('should set multiple expanded shots', () => {
            act(() => {
                useSceneStateStore.getState().setExpandedShots(['shot_1', 'shot_2', 'shot_3']);
            });
            
            const state = getSceneStoreState();
            expect(state.expandedShots).toHaveLength(3);
            expect(state.expandedShots).toEqual(['shot_1', 'shot_2', 'shot_3']);
        });
    });

    // ========================================================================
    // Test 6: Store Management
    // ========================================================================
    describe('Store Management', () => {
        it('should reset store to initial state', () => {
            // Populate store
            act(() => {
                useSceneStateStore.getState().addScene(createTestScene({ id: 'scene_1' }));
                useSceneStateStore.getState().setGeneratedImage('scene_1', 'image');
                useSceneStateStore.getState().setSelectedSceneId('scene_1');
            });
            
            // Verify populated
            let state = getSceneStoreState();
            expect(state.scenes).toHaveLength(1);
            expect(state.generatedImages['scene_1']).toBeDefined();
            
            // Reset
            act(() => {
                useSceneStateStore.getState().resetStore();
            });
            
            // Verify reset
            state = getSceneStoreState();
            expect(state.scenes).toHaveLength(0);
            expect(state.generatedImages).toEqual({});
            expect(state.selectedSceneId).toBeNull();
        });

        it('should update lastSyncTimestamp on mutations', () => {
            const before = getSceneStoreState().lastSyncTimestamp;
            
            act(() => {
                useSceneStateStore.getState().addScene(createTestScene());
            });
            
            const after = getSceneStoreState().lastSyncTimestamp;
            expect(after).toBeGreaterThan(before);
        });
    });

    // ========================================================================
    // Test 7: createJobId Utility
    // ========================================================================
    describe('createJobId', () => {
        it('should create unique job IDs', () => {
            const id1 = createJobId('keyframe', 'scene_1');
            const id2 = createJobId('keyframe', 'scene_1');
            
            expect(id1).not.toBe(id2);
            expect(id1).toContain('keyframe');
            expect(id1).toContain('scene_1');
        });

        it('should include shot ID when provided', () => {
            const id = createJobId('shot-image', 'scene_1', 'shot_abc');
            
            expect(id).toContain('shot-image');
            expect(id).toContain('scene_1');
            expect(id).toContain('shot_abc');
        });
    });

    // ========================================================================
    // Test 8: Persistence Configuration
    // ========================================================================
    describe('Persistence Configuration', () => {
        it('should have correct store name', () => {
            expect(SCENE_STORE_NAME).toBe('gemDirect-scene-store');
        });

        it('should set hydration status', () => {
            act(() => {
                useSceneStateStore.getState().setHasHydrated(true);
            });
            
            expect(getSceneStoreState()._hasHydrated).toBe(true);
        });
    });
});
