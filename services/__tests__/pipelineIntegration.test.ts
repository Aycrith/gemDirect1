import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineEngine } from '../pipelineEngine';
import { usePipelineStore } from '../pipelineStore';
import { createExportPipeline } from '../pipelineFactory';
import { Scene, LocalGenerationSettings } from '../../types';
import * as comfyUIService from '../comfyUIService';
import * as videoUtils from '../../utils/videoUtils';

// Mock Node modules for FLF2V
vi.mock('child_process', () => ({
    exec: (_cmd: string, cb: (error: Error | null, stdout: string, stderr: string) => void) => cb(null, 'stdout', 'stderr')
}));

vi.mock('fs', () => ({
    existsSync: () => true,
    mkdirSync: () => {},
    writeFileSync: () => {},
    readFileSync: () => Buffer.from('fake-frame'),
    unlinkSync: () => {}
}));

// Mock ComfyUI Service
vi.mock('../comfyUIService', () => ({
    queueComfyUIPromptWithQueue: vi.fn(),
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

describe('Pipeline Integration', () => {
    const engine = PipelineEngine.getInstance();

    beforeEach(() => {
        vi.clearAllMocks();
        usePipelineStore.setState({ pipelines: {}, activePipelineId: null });
        vi.useFakeTimers();
        
        // Default fetch mock
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            blob: () => Promise.resolve(new Blob(['fake-video-data'], { type: 'video/mp4' }))
        });

        // Default extractFramesFromVideo mock
        (videoUtils.extractFramesFromVideo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(['data:image/jpeg;base64,frame1', 'data:image/jpeg;base64,frame2']);

        // Default settings mock
        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            featureFlags: { enableFLF2V: false }
        });
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
        // Setup mocks to fail on keyframe
        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new Error('ComfyUI Error'));

        // 1. Create Pipeline
        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId); // Ensure active pipeline

        // 2. Start Engine
        engine.start();

        // 3. Advance time
        await vi.advanceTimersByTimeAsync(2000);

        // 4. Verify Failure
        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline!.status).toBe('failed');
        
        const keyframeTask = Object.values(finalPipeline!.tasks).find(t => t.type === 'generate_keyframe');
        expect(keyframeTask?.status).toBe('failed');
    });

    it('should chain video generation when FLF2V is enabled', async () => {
        // Enable FLF2V
        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            featureFlags: { enableFLF2V: true }
        });

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

        const pipeline = usePipelineStore.getState().pipelines[pipelineId];
        if (!pipeline) throw new Error('Pipeline not found');
        const shot2VideoTask = Object.values(pipeline.tasks).find(t => t.id.includes('video') && t.id.includes('shot-2'));
        console.log('Shot 2 Video Dependencies:', shot2VideoTask?.dependencies);

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

    it('should NOT chain video generation across scenes even if FLF2V is enabled', async () => {
        // Enable FLF2V
        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            featureFlags: { enableFLF2V: true }
        });

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
        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            workflowProfiles: {
                'rife-interpolation': { id: 'rife-interpolation' }
            },
            featureFlags: { enableFLF2V: false }
        });

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
        expect(interpolateTask?.output?.metadata?.upscaleMethod).toBe('RIFE');
        expect(interpolateTask?.output?.metadata?.finalFps).toBeDefined();
        expect(interpolateTask?.output?.metadata?.interpolationElapsed).toBeDefined();
    });

    it('should use Node fallback for FLF2V when window is undefined', async () => {
        // Simulate Node environment
        const originalWindow = global.window;
        // @ts-ignore
        delete global.window;

        mockGetState.mockReturnValue({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v',
            featureFlags: { enableFLF2V: true }
        });

        // Mock previous video output
        const mockVideoResult = { success: true, videos: ['prev_video.mp4'] };
        const mockKeyframeResult = { success: true, images: ['data:image/png;base64,fake-image'] };
        const mockNextVideoResult = { success: true, videos: ['next_video.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(mockKeyframeResult) // Keyframe 1
            .mockResolvedValueOnce(mockKeyframeResult) // Keyframe 2
            .mockResolvedValueOnce(mockVideoResult)    // Video 1
            .mockResolvedValueOnce(mockNextVideoResult); // Video 2

        // Mock fetch for video download
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(10))
        });

        const oneSceneTwoShots = [
            {
                ...mockScenes[0]!,
                timeline: {
                    ...mockScenes[0]!.timeline,
                    shots: [
                        { id: 'shot-1', description: 'Shot 1' },
                        { id: 'shot-2', description: 'Shot 2' }
                    ]
                }
            }
        ];

        const flf2vSettings = {
            ...mockSettings,
            featureFlags: { enableFLF2V: true }
        };

        const pipelineId = createExportPipeline(oneSceneTwoShots as unknown as Scene[], flf2vSettings as unknown as LocalGenerationSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        usePipelineStore.getState().setActivePipeline(pipelineId);
        engine.start();

        // Run through tasks
        // Shot 1 Keyframe
        await vi.advanceTimersByTimeAsync(1100);
        // Shot 1 Video
        await vi.advanceTimersByTimeAsync(1100);
        // Shot 2 Keyframe
        await vi.advanceTimersByTimeAsync(1100);
        // Shot 2 Video (should use FLF2V)
        await vi.advanceTimersByTimeAsync(1100);

        const pipeline = usePipelineStore.getState().pipelines[pipelineId];
        const shot2VideoTask = Object.values(pipeline!.tasks).find(t => t.payload.shotId === 'shot-2' && t.type === 'generate_video');

        expect(shot2VideoTask?.status).toBe('completed');
        expect(shot2VideoTask?.output?.metadata?.flf2vEnabled).toBe(true);
        expect(shot2VideoTask?.output?.metadata?.flf2vSource).toBe('last-frame');
        
        // Restore window
        global.window = originalWindow;
    });
});
