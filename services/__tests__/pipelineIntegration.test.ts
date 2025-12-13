import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineEngine } from '../pipelineEngine';
import { usePipelineStore } from '../pipelineStore';
import { createExportPipeline } from '../pipelineFactory';
import { executeVideoGeneration, TaskRegistry } from '../pipelineTaskRegistry';
import { useGenerationStatusStore } from '../generationStatusStore';
import { Scene, LocalGenerationSettings } from '../../types';
import * as comfyUIService from '../comfyUIService';
import * as videoUtils from '../../utils/videoUtils';

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

// Mock ComfyUI Service
vi.mock('../comfyUIService', () => ({
    queueComfyUIPromptWithQueue: vi.fn(),
    waitForComfyCompletion: vi.fn(),
    stripDataUrlPrefix: (value: string) => {
        if (typeof value !== 'string') return value as unknown as string;
        // Handle generic data URLs, not just images.
        const parts = value.split(',');
        return parts.length > 1 ? parts.slice(1).join(',') : value;
    },
    ComfyUIPromptPayloads: {}
}));

// Mock Video Utils
vi.mock('../../utils/videoUtils', () => ({
    extractFramesFromVideo: vi.fn(),
    base64ToBlob: vi.fn()
}));

// Mock global fetch
global.fetch = vi.fn();

const { mockGetState } = vi.hoisted(() => {
    return { mockGetState: vi.fn() };
});

// Mock Settings Store
vi.mock('../settingsStore', () => ({
    useSettingsStore: {
        getState: mockGetState,
        setState: vi.fn()
    }
}));

const defaultWorkflowProfiles = {
    'wan-t2i': {
        id: 'wan-t2i',
        workflowJson: '{"valid": "json", "length": "sufficient"}',
        mapping: { '1:text': 'human_readable_prompt' }
    },
    'wan-i2v': {
        id: 'wan-i2v',
        workflowJson: '{"valid": "json", "length": "sufficient"}',
        mapping: { '1:text': 'human_readable_prompt', '2:image': 'keyframe_image' }
    },
    'video-upscaler': {
        id: 'video-upscaler',
        workflowJson: '{"valid": "json", "length": "sufficient"}',
        mapping: { '1:file': 'input_video' }
    },
    'rife-interpolation': {
        id: 'rife-interpolation',
        workflowJson: '{"valid": "json", "length": "sufficient"}',
        mapping: { '1:file': 'input_video' }
    }
};

const createMockState = (overrides: any = {}) => {
    const base = {
        comfyUIUrl: 'http://localhost:8188',
        workflowProfile: 'wan-t2i',
        videoWorkflowProfile: 'wan-i2v',

        // Defaults aligned with support helpers (explicitly include both flags)
        featureFlags: { enableFLF2V: false, videoUpscaling: true, frameInterpolationEnabled: true },

        // Defaults aligned with configurable profile selectors
        upscalerWorkflowProfile: 'video-upscaler',
        interpolationWorkflowProfile: 'rife-interpolation',

        workflowProfiles: { ...defaultWorkflowProfiles },
    };

    return {
        ...base,
        ...overrides,
        featureFlags: { ...(base.featureFlags || {}), ...(overrides.featureFlags || {}) },
        workflowProfiles: { ...(base.workflowProfiles || {}), ...(overrides.workflowProfiles || {}) },
    };
};

describe('Pipeline Integration', () => {
    const engine = PipelineEngine.getInstance();

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        usePipelineStore.setState({ pipelines: {}, activePipelineId: null });
        useGenerationStatusStore.getState().clearAllStatuses();
        vi.useFakeTimers();
        
        // Default fetch mock
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            blob: () => Promise.resolve(new Blob(['fake-video-data'], { type: 'video/mp4' }))
        });

        // Default extractFramesFromVideo mock
        (videoUtils.extractFramesFromVideo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(['data:image/jpeg;base64,frame1', 'data:image/jpeg;base64,frame2']);

        // Default settings mock
        mockGetState.mockReturnValue(createMockState());
    });


    afterEach(() => {
        engine.stop();
        vi.useRealTimers();
    });

    const mockScenes: Scene[] = [
        {
            id: 'scene-1',
            title: 'Scene 1',
            summary: 'Summary 1',
            timeline: {
                shots: [
                    { id: 'shot-1', description: 'Shot 1 description' }
                ],
                shotEnhancers: {},
                transitions: [],
                negativePrompt: 'negative'
            }
        } as unknown as Scene
    ];

    const mockSettings: LocalGenerationSettings = {
        imageWorkflowProfile: 'wan-t2i',
        videoWorkflowProfile: 'wan-i2v'
    } as unknown as LocalGenerationSettings;

    it('should execute a full export pipeline successfully', async () => {
        // Setup mocks
        const mockKeyframeResult = { success: true, images: ['data:image/png;base64,fake-image'] };
        const mockVideoResult = { success: true, videos: ['output.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(mockKeyframeResult) // Keyframe
            .mockResolvedValueOnce(mockVideoResult);   // Video

        // 1. Create Pipeline
        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true,
            upscale: false
        });

        expect(pipelineId).toBeDefined();
        const store = usePipelineStore.getState();
        expect(store.activePipelineId).toBe(pipelineId);
        expect(store.pipelines[pipelineId]?.status).toBe('active');

        // 2. Start Engine
        engine.start();

        // 3. Advance time to trigger polling and execution
        // Iteration 1: Keyframe task starts
        await vi.advanceTimersByTimeAsync(1100); 
        
        // Verify Keyframe execution
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(1);
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ text: 'Shot 1 description' }),
            '',
            'wan-t2i',
            expect.objectContaining({ waitForCompletion: true })
        );

        // Iteration 2: Keyframe completes (mock resolved), Video task starts
        await vi.advanceTimersByTimeAsync(1100);

        // Verify Video execution
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(2);
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ text: 'Shot 1 description' }),
            'fake-image', // Stripped prefix
            'wan-i2v',
            expect.objectContaining({ waitForCompletion: true })
        );

        // Iteration 3: Video completes, Pipeline completes
        await vi.advanceTimersByTimeAsync(1100);

        // 4. Verify Final State
        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline).toBeDefined();
        expect(finalPipeline!.status).toBe('completed');
        
        const tasks = Object.values(finalPipeline!.tasks);
        expect(tasks.every(t => t.status === 'completed')).toBe(true);
    });

    it('should handle task failures and stop pipeline', async () => {
        // Setup mocks to fail on keyframe (including retry)
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('ComfyUI Error'))
            .mockRejectedValueOnce(new Error('ComfyUI Error'));

        // 1. Create Pipeline
        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId); // Ensure active pipeline

        // 2. Start Engine
        engine.start();

        // 3. Advance time (attempt + retry + terminal evaluation)
        await vi.advanceTimersByTimeAsync(4500);

        // 4. Verify Failure
        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline!.status).toBe('failed');
        
        const keyframeTask = Object.values(finalPipeline!.tasks).find(t => t.type === 'generate_keyframe');
        expect(keyframeTask?.status).toBe('failed');
        expect(keyframeTask?.retryCount).toBe(1);
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(2);
    });

    it('should retry transient failures and eventually complete', async () => {
        const mockKeyframeResult = { success: true, images: ['data:image/png;base64,fake-image'] };
        const mockVideoResult = { success: true, videos: ['output.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('Transient ComfyUI Error'))
            .mockResolvedValueOnce(mockKeyframeResult)
            .mockResolvedValueOnce(mockVideoResult);

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // Tick 1: keyframe fails -> task returns to pending (retryCount=1)
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 2: keyframe retry succeeds
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 3: video runs
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 4: pipeline resolves terminal state
        await vi.advanceTimersByTimeAsync(1100);

        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(3);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('completed');

        const keyframeTask = Object.values(finalPipeline!.tasks).find(t => t.type === 'generate_keyframe');
        expect(keyframeTask?.retryCount).toBe(1);
    });

    it('should forward progress updates from ComfyUI callbacks to generationStatusStore', async () => {
        const updateSpy = vi.spyOn(useGenerationStatusStore.getState(), 'updateSceneStatus');
        const mockKeyframeResult = { success: true, images: ['data:image/png;base64,fake-image'] };
        const mockVideoResult = { success: true, videos: ['output.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (_settings: any, _payloads: any, _input: any, profileId: any, queueOptions: any) => {
                if (profileId === 'wan-i2v' && typeof queueOptions?.onProgress === 'function') {
                    queueOptions.onProgress({ status: 'running', progress: 55, message: 'Generating...' });
                }
                return profileId === 'wan-t2i' ? mockKeyframeResult : mockVideoResult;
            }
        );

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        await vi.advanceTimersByTimeAsync(1100); // keyframe
        await vi.advanceTimersByTimeAsync(1100); // video + progress callback

        expect(updateSpy).toHaveBeenCalledWith(
            'scene-1',
            expect.objectContaining({ progress: 55, status: 'running' })
        );
    });

    it('should chain video generation when FLF2V is enabled', async () => {
        // Enable FLF2V
        mockGetState.mockReturnValue(createMockState({
            featureFlags: { enableFLF2V: true }
        }));

        const multiShotScenes = [{
            ...mockScenes[0],
            timeline: {
                ...(mockScenes[0] as any).timeline,
                shots: [
                    { id: 'shot-1', description: 'Shot 1' },
                    { id: 'shot-2', description: 'Shot 2' }
                ]
            }
        }];

        // Mock outputs dynamically
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mockImplementation((_settings: any, _payload: any, _inputImage: any, profile: any, options: any) => {
            if (profile === 'wan-t2i') {
                return Promise.resolve({ success: true, images: [`img-${options.shotId}`], videos: [] });
            } else {
                // Video generation
                return Promise.resolve({ success: true, images: [`img-${options.shotId}`], videos: [`vid-${options.shotId}.mp4`] });
            }
        });

        // Mock extractFramesFromVideo to return a specific frame for verification
        (videoUtils.extractFramesFromVideo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(['data:image/jpeg;base64,last-frame-of-shot-1']);

        const flf2vSettings = {
            ...mockSettings,
            featureFlags: { enableFLF2V: true }
        };

        const pipelineId = createExportPipeline(multiShotScenes as unknown as Scene[], flf2vSettings as unknown as LocalGenerationSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // Wait for all tasks
        // 1. Shot 1 Keyframe & Shot 2 Keyframe (parallel)
        await vi.advanceTimersByTimeAsync(1100);
        // 2. Shot 1 Video
        await vi.advanceTimersByTimeAsync(1100);
        // 3. Shot 2 Video
        await vi.advanceTimersByTimeAsync(1100);

        // Verify Shot 2 Video call
        // It should have been called with the last frame of Shot 1
        const calls = (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const shot2VideoCall = calls.find((call: any) => call[1].text === 'Shot 2' && call[3] === 'wan-i2v');
        
        expect(shot2VideoCall).toBeDefined();
        if (shot2VideoCall) {
            expect(shot2VideoCall[2]).toBe('last-frame-of-shot-1');
        }
    });

    it('should execute an export-all pipeline across multiple scenes', async () => {
        const multiSceneData: Scene[] = [
            {
                id: 'scene-1',
                title: 'Scene 1',
                summary: 'Summary 1',
                timeline: { shots: [{ id: 'shot-1', description: 'Shot 1' }], shotEnhancers: {}, transitions: [], negativePrompt: '' },
            } as unknown as Scene,
            {
                id: 'scene-2',
                title: 'Scene 2',
                summary: 'Summary 2',
                timeline: { shots: [{ id: 'shot-2', description: 'Shot 2' }], shotEnhancers: {}, transitions: [], negativePrompt: '' },
            } as unknown as Scene,
        ];

        const mockKeyframeResult = { success: true, images: ['data:image/png;base64,fake-image'] };
        const mockVideoResult = { success: true, videos: ['output.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (_settings: any, _payload: any, _input: any, profile: any) => {
                return profile === 'wan-t2i' ? mockKeyframeResult : mockVideoResult;
            }
        );

        const pipelineId = createExportPipeline(multiSceneData, mockSettings, {
            generateKeyframes: true,
            generateVideos: true,
        });

        const store = usePipelineStore.getState();
        expect(store.pipelines[pipelineId]).toBeDefined();
        expect(Object.keys(store.pipelines[pipelineId]!.tasks)).toHaveLength(4);

        engine.start();

        // Tick 1: both keyframes start + complete
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 2: both videos start + complete
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 3: pipeline terminal evaluation
        await vi.advanceTimersByTimeAsync(1100);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('completed');
        expect(Object.values(finalPipeline!.tasks).every((t) => t.status === 'completed')).toBe(true);
    });

    it('should NOT chain video generation across scenes even if FLF2V is enabled', async () => {
        // Enable FLF2V
        mockGetState.mockReturnValue(createMockState({
            featureFlags: { enableFLF2V: true }
        }));

        const multiSceneData = [
            {
                id: 'scene-1',
                title: 'Scene 1',
                timeline: { shots: [{ id: 'shot-1', description: 'Shot 1' }] }
            },
            {
                id: 'scene-2',
                title: 'Scene 2',
                timeline: { shots: [{ id: 'shot-2', description: 'Shot 2' }] }
            }
        ];

        const flf2vSettings = {
            ...mockSettings,
            featureFlags: { enableFLF2V: true }
        };

        const pipelineId = createExportPipeline(multiSceneData as unknown as Scene[], flf2vSettings as unknown as LocalGenerationSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        const pipeline = usePipelineStore.getState().pipelines[pipelineId];
        if (!pipeline) throw new Error('Pipeline not found');
        
        // Find video task for Scene 2 Shot 2
        const scene2VideoTask = Object.values(pipeline.tasks).find(t => t.id === 'video-scene-2-shot-2');
        
        // It should NOT depend on Scene 1 Shot 1 video
        const dependsOnScene1 = scene2VideoTask?.dependencies.some(depId => depId === 'video-scene-1-shot-1');
        expect(dependsOnScene1).toBe(false);
    });

    it('should execute interpolation task correctly', async () => {
        // Setup mocks
        const mockVideoResult = { success: true, videos: ['output.mp4'] };
        // const mockInterpolationResult = { success: true, videos: ['output_interpolated.mp4'] }; // Removed duplicate

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(mockVideoResult) // Video
            // .mockResolvedValueOnce(mockInterpolationResult); // Interpolation - wait, I need to fix this call too if I remove the variable

        // Mock keyframe image in payload since we skip keyframe generation
        // const scenesWithKeyframe = [{ ... }]; // Unused

        // Actually, let's just enable keyframe generation to satisfy the dependency
        const mockKeyframeResult = { success: true, images: ['data:image/png;base64,fake-image'] };
        const mockInterpolationResult = { 
            type: 'video', 
            data: 'output_interpolated.mp4', 
            filename: 'output_interpolated.mp4',
            assets: [] 
        };
        
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mockReset();
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(mockKeyframeResult) // Keyframe
            .mockResolvedValueOnce(mockVideoResult)    // Video
            .mockResolvedValueOnce(mockInterpolationResult); // Interpolation

        // Mock profile existence
        mockGetState.mockReturnValue(createMockState({
            featureFlags: { enableFLF2V: false }
        }));

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true,
            interpolate: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // 1. Keyframe
        await vi.advanceTimersByTimeAsync(1100);
        // 2. Video
        await vi.advanceTimersByTimeAsync(1100);
        // 3. Interpolate
        await vi.advanceTimersByTimeAsync(1100);

        const pipeline = usePipelineStore.getState().pipelines[pipelineId];
        if (!pipeline) throw new Error('Pipeline not found');
        const interpolateTask = Object.values(pipeline.tasks).find(t => t.type === 'interpolate_video');
        
        expect(interpolateTask?.status).toBe('completed');
        expect(interpolateTask?.output?.videos?.[0]).toBe('output_interpolated.mp4');
        const meta = (interpolateTask?.output?.metadata as any) || {};
        expect(meta.upscaleMethod).toBe('RIFE');
        expect(meta.finalFps).toBeDefined();
        expect(meta.interpolationElapsed).toBeDefined();
    });

    it('should exhaust retries and fail the pipeline', async () => {
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('ComfyUI Error'))
            .mockRejectedValueOnce(new Error('ComfyUI Error'))
            .mockRejectedValueOnce(new Error('ComfyUI Error'));

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: false,
            maxRetries: 2,
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // Tick 1: attempt 1 fails -> pending (retryCount=1)
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 2: attempt 2 fails -> pending (retryCount=2)
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 3: attempt 3 fails -> failed
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 4: pipeline resolves terminal failure state
        await vi.advanceTimersByTimeAsync(1100);

        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(3);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('failed');
        expect(usePipelineStore.getState().activePipelineId).toBeNull();

        const keyframeTask = Object.values(finalPipeline!.tasks).find(t => t.type === 'generate_keyframe');
        expect(keyframeTask?.status).toBe('failed');
        expect(keyframeTask?.retryCount).toBe(2);
    });

    it('should mark blocked dependents as skipped when a task fails (skip propagation)', async () => {
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('ComfyUI Error'))
            .mockRejectedValueOnce(new Error('ComfyUI Error'));

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true,
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // Allow attempt + retry + terminal evaluation.
        await vi.advanceTimersByTimeAsync(4500);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('failed');

        expect(finalPipeline!.tasks['keyframe-scene-1-shot-1']?.status).toBe('failed');
        expect(finalPipeline!.tasks['video-scene-1-shot-1']?.status).toBe('skipped');
    });

    it('should cancel a pipeline when a cancelled dependency blocks all pending work', async () => {
        const pipelineId = usePipelineStore.getState().createPipeline('cancel-blocks-dependents', [
            {
                id: 'a',
                type: 'generic_action',
                label: 'A',
                status: 'pending',
                dependencies: [],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
            {
                id: 'b',
                type: 'generic_action',
                label: 'B',
                status: 'pending',
                dependencies: ['a'],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
        ]);

        usePipelineStore.getState().updateTaskStatus(pipelineId, 'a', 'cancelled');

        engine.start();

        // Tick 1: should determine pipeline cannot proceed.
        await vi.advanceTimersByTimeAsync(1100);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('cancelled');
        expect(usePipelineStore.getState().activePipelineId).toBeNull();

        expect(finalPipeline!.tasks['a']?.status).toBe('cancelled');
        expect(finalPipeline!.tasks['b']?.status).toBe('skipped');
    });

    it('should exhaust retries on a non-keyframe task and fail the pipeline', async () => {
        const executor = vi
            .spyOn(TaskRegistry, 'generic_action')
            .mockRejectedValueOnce(new Error('Boom'))
            .mockRejectedValueOnce(new Error('Boom'))
            .mockRejectedValueOnce(new Error('Boom'));

        const pipelineId = usePipelineStore.getState().createPipeline('retry-exhaust-non-keyframe', [
            {
                id: 'a',
                type: 'generic_action',
                label: 'A',
                status: 'pending',
                dependencies: [],
                payload: {},
                retryCount: 0,
                maxRetries: 2,
                createdAt: Date.now(),
            } as any,
        ]);

        engine.start();

        await vi.advanceTimersByTimeAsync(1100); // attempt 1
        await vi.advanceTimersByTimeAsync(1100); // attempt 2
        await vi.advanceTimersByTimeAsync(1100); // attempt 3 -> failed
        await vi.advanceTimersByTimeAsync(1100); // pipeline terminal evaluation

        expect(executor).toHaveBeenCalledTimes(3);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('failed');

        const taskA = finalPipeline!.tasks['a'];
        expect(taskA?.status).toBe('failed');
        expect(taskA?.retryCount).toBe(2);
    });

    it('should treat cancelled tasks as terminal and mark pipeline cancelled', async () => {
        const pipelineId = usePipelineStore.getState().createPipeline('cancelled-pipeline', [
            {
                id: 'a',
                type: 'generic_action',
                label: 'A',
                status: 'pending',
                dependencies: [],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
            {
                id: 'b',
                type: 'generic_action',
                label: 'B',
                status: 'pending',
                dependencies: [],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
        ]);

        usePipelineStore.getState().updateTaskStatus(pipelineId, 'a', 'cancelled');

        engine.start();

        // Tick 1: schedules and completes task b.
        await vi.advanceTimersByTimeAsync(1100);
        // Tick 2: terminal evaluation should mark pipeline cancelled.
        await vi.advanceTimersByTimeAsync(1100);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('cancelled');
        expect(usePipelineStore.getState().activePipelineId).toBeNull();

        expect(finalPipeline!.tasks['a']?.status).toBe('cancelled');
        expect(finalPipeline!.tasks['b']?.status).toBe('completed');
    });

    it('should block dependent tasks until dependencies complete', async () => {
        const deferredKeyframe = createDeferred<{ success: true; images: string[] }>();
        const mockVideoResult = { success: true, videos: ['output.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockImplementationOnce(() => deferredKeyframe.promise)
            .mockResolvedValueOnce(mockVideoResult);

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true,
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // Tick 1: keyframe starts (promise pending)
        await vi.advanceTimersByTimeAsync(1100);
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(1);

        // Tick 2: keyframe still running, so video must NOT start yet.
        await vi.advanceTimersByTimeAsync(1100);
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(1);

        deferredKeyframe.resolve({ success: true, images: ['data:image/png;base64,fake-image'] });
        await vi.advanceTimersByTimeAsync(1);

        // Tick 3: video should run now that keyframe is completed.
        await vi.advanceTimersByTimeAsync(1100);
        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledTimes(2);
    });

    it('should pause and resume scheduling (without double-scheduling)', async () => {
        const deferredA = createDeferred<undefined>();
        const executorSpy = vi.spyOn(TaskRegistry, 'generic_action').mockImplementation(async (task) => {
            if (task.id === 'a') {
                return deferredA.promise;
            }
            return undefined;
        });

        const pipelineId = usePipelineStore.getState().createPipeline('pause-resume', [
            {
                id: 'a',
                type: 'generic_action',
                label: 'A',
                status: 'pending',
                dependencies: [],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
            {
                id: 'b',
                type: 'generic_action',
                label: 'B',
                status: 'pending',
                dependencies: ['a'],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
        ]);

        engine.start();

        // Tick 1: schedules A (running, blocked)
        await vi.advanceTimersByTimeAsync(1100);
        expect(executorSpy).toHaveBeenCalledTimes(1);

        // Pause while A is running; B should not start even after A completes.
        usePipelineStore.getState().updatePipelineStatus(pipelineId, 'paused');
        deferredA.resolve(undefined);
        await vi.advanceTimersByTimeAsync(1);

        // Multiple ticks while paused should not schedule B.
        await vi.advanceTimersByTimeAsync(2500);
        expect(executorSpy).toHaveBeenCalledTimes(1);

        // Resume; B should schedule and pipeline should complete.
        usePipelineStore.getState().updatePipelineStatus(pipelineId, 'active');
        await vi.advanceTimersByTimeAsync(1100);
        expect(executorSpy).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1100);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('completed');
        expect(finalPipeline!.tasks['a']?.status).toBe('completed');
        expect(finalPipeline!.tasks['b']?.status).toBe('completed');
    });

    it('should not double-schedule a running task across polling ticks', async () => {
        const deferred = createDeferred<undefined>();
        const executorSpy = vi.spyOn(TaskRegistry, 'generic_action').mockImplementation(async () => deferred.promise);

        const pipelineId = usePipelineStore.getState().createPipeline('no-double-schedule', [
            {
                id: 'a',
                type: 'generic_action',
                label: 'A',
                status: 'pending',
                dependencies: [],
                payload: {},
                retryCount: 0,
                createdAt: Date.now(),
            } as any,
        ]);

        engine.start();

        // Tick 1: schedules task A; it remains running.
        await vi.advanceTimersByTimeAsync(1100);
        expect(executorSpy).toHaveBeenCalledTimes(1);

        // Further polling ticks should NOT reschedule A while it is running.
        await vi.advanceTimersByTimeAsync(5000);
        expect(executorSpy).toHaveBeenCalledTimes(1);

        // Complete task and allow engine to evaluate terminal state.
        deferred.resolve(undefined);
        await vi.advanceTimersByTimeAsync(1);
        await vi.advanceTimersByTimeAsync(1100);

        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline?.status).toBe('completed');
    });

    it('should build FLF2V chains per scene in multi-scene export-all graphs', async () => {
        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            featureFlags: { enableFLF2V: true },
        });

        const multiSceneData: Scene[] = [
            {
                id: 'scene-1',
                title: 'Scene 1',
                summary: 'Summary 1',
                timeline: {
                    shots: [
                        { id: 'shot-1', description: 'Shot 1' },
                        { id: 'shot-2', description: 'Shot 2' },
                    ],
                    shotEnhancers: {},
                    transitions: [],
                    negativePrompt: '',
                },
            } as unknown as Scene,
            {
                id: 'scene-2',
                title: 'Scene 2',
                summary: 'Summary 2',
                timeline: {
                    shots: [
                        { id: 'shot-1', description: 'Shot 1' },
                        { id: 'shot-2', description: 'Shot 2' },
                    ],
                    shotEnhancers: {},
                    transitions: [],
                    negativePrompt: '',
                },
            } as unknown as Scene,
        ];

        const flf2vSettings = {
            ...mockSettings,
            featureFlags: { enableFLF2V: true },
        };

        const pipelineId = createExportPipeline(multiSceneData, flf2vSettings as unknown as LocalGenerationSettings, {
            generateKeyframes: true,
            generateVideos: true,
        });

        const pipeline = usePipelineStore.getState().pipelines[pipelineId];
        if (!pipeline) throw new Error('Pipeline not found');

        expect(Object.keys(pipeline.tasks)).toHaveLength(8);

        const s1Shot2 = pipeline.tasks['video-scene-1-shot-2'];
        const s2Shot2 = pipeline.tasks['video-scene-2-shot-2'];

        expect(s1Shot2?.dependencies).toEqual(expect.arrayContaining(['keyframe-scene-1-shot-2', 'video-scene-1-shot-1']));
        expect(s2Shot2?.dependencies).toEqual(expect.arrayContaining(['keyframe-scene-2-shot-2', 'video-scene-2-shot-1']));

        expect(s1Shot2?.dependencies).not.toEqual(expect.arrayContaining(['video-scene-2-shot-1', 'video-scene-2-shot-2']));
        expect(s2Shot2?.dependencies).not.toEqual(expect.arrayContaining(['video-scene-1-shot-1', 'video-scene-1-shot-2']));
    });

    it('should only attach onProgress for video generation', async () => {
        const updateSpy = vi.spyOn(useGenerationStatusStore.getState(), 'updateSceneStatus');

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            async (_settings: any, _payloads: any, _input: any, profileId: any, queueOptions: any) => {
                if (profileId === 'wan-t2i') {
                    expect(queueOptions?.onProgress).toBeUndefined();
                    return { success: true, images: ['data:image/png;base64,fake-image'] };
                }

                expect(typeof queueOptions?.onProgress).toBe('function');
                queueOptions.onProgress({ status: 'running', progress: 25, message: 'Working...' });
                return { success: true, videos: ['output.mp4'] };
            }
        );

        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true,
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        await vi.advanceTimersByTimeAsync(1100); // keyframe
        await vi.advanceTimersByTimeAsync(1100); // video

        expect(updateSpy).toHaveBeenCalledWith(
            'scene-1',
            expect.objectContaining({ progress: 25, status: 'running' })
        );
    });

    it('should use Node fallback for FLF2V when window is undefined', async () => {
        // Simulate Node environment
        const originalWindow = global.window;
        // @ts-ignore
        delete global.window;

        // Inject a deterministic Node-only extractor (avoids pulling in ffmpeg / Node builtins)
        (globalThis as any).__flf2vNodeFrameExtractor = {
            extractLastFrameBase64FromVideoUrl: vi.fn().mockResolvedValue('fake-node-last-frame')
        };

        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            featureFlags: { enableFLF2V: true }
        });

        // Directly exercise the executor to avoid timing flakiness from the polling engine.
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            success: true,
            videos: ['next_video.mp4']
        });

        const result = await executeVideoGeneration(
            {
                id: 'video-scene-1-shot-2',
                type: 'generate_video',
                label: 'Video: shot-2',
                status: 'pending',
                dependencies: ['video-scene-1-shot-1'],
                payload: {
                    sceneId: 'scene-1',
                    shotId: 'shot-2',
                    prompt: 'Shot 2',
                    negativePrompt: '',
                    workflowProfileId: 'wan-i2v',
                    keyframeImage: 'data:image/png;base64,fake-image'
                },
                retryCount: 0,
                createdAt: Date.now()
            } as any,
            {
                dependencies: {
                    'video-scene-1-shot-1': {
                        id: 'video-scene-1-shot-1',
                        type: 'generate_video',
                        label: 'Video: shot-1',
                        status: 'completed',
                        dependencies: [],
                        payload: { prompt: 'Shot 1' },
                        output: { videos: ['prev_video.mp4'] },
                        retryCount: 0,
                        createdAt: Date.now()
                    } as any
                }
            }
        );

        expect(comfyUIService.queueComfyUIPromptWithQueue).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ text: 'Shot 2' }),
            'fake-node-last-frame',
            'wan-i2v',
            expect.objectContaining({ waitForCompletion: true })
        );

        const meta = (result.metadata as any) || {};
        expect(meta.flf2vEnabled).toBe(true);
        expect(meta.flf2vSource).toBe('last-frame');
        
        // Restore window
        global.window = originalWindow;

        // Cleanup injected extractor
        delete (globalThis as any).__flf2vNodeFrameExtractor;
    });
});
