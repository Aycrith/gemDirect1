import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineEngine } from '../pipelineEngine';
import { usePipelineStore } from '../pipelineStore';
import { createExportPipeline } from '../pipelineFactory';
import { Scene, LocalGenerationSettings } from '../../types';
import * as comfyUIService from '../comfyUIService';

// Mock ComfyUI Service
vi.mock('../comfyUIService', () => ({
    queueComfyUIPromptWithQueue: vi.fn(),
    ComfyUIPromptPayloads: {}
}));

// Mock Settings Store
vi.mock('../settingsStore', () => ({
    useSettingsStore: {
        getState: () => ({
            comfyUIUrl: 'http://localhost:8188',
            workflowProfile: 'wan-t2i',
            videoWorkflowProfile: 'wan-i2v'
        })
    }
}));

describe('Pipeline Integration', () => {
    const engine = PipelineEngine.getInstance();

    beforeEach(() => {
        vi.clearAllMocks();
        usePipelineStore.setState({ pipelines: {}, activePipelineId: null });
        vi.useFakeTimers();
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
        } as any
    ];

    const mockSettings: LocalGenerationSettings = {
        imageWorkflowProfile: 'wan-t2i',
        videoWorkflowProfile: 'wan-i2v'
    } as any;

    it('should execute a full export pipeline successfully', async () => {
        // Setup mocks
        const mockKeyframeResult = { images: ['data:image/png;base64,fake-image'] };
        const mockVideoResult = { videos: ['output.mp4'] };

        (comfyUIService.queueComfyUIPromptWithQueue as any)
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
        (comfyUIService.queueComfyUIPromptWithQueue as any)
            .mockRejectedValueOnce(new Error('ComfyUI Error'));

        // 1. Create Pipeline
        const pipelineId = createExportPipeline(mockScenes, mockSettings, {
            generateKeyframes: true,
            generateVideos: true
        });

        // 2. Start Engine
        engine.start();

        // 3. Advance time
        await vi.advanceTimersByTimeAsync(1100); // Keyframe attempts and fails

        // 4. Verify Failure
        const finalPipeline = usePipelineStore.getState().pipelines[pipelineId];
        expect(finalPipeline).toBeDefined();
        
        const keyframeTask = Object.values(finalPipeline!.tasks).find(t => t.type === 'generate_keyframe');
        expect(keyframeTask?.status).toBe('failed');
        // GenerationQueue wraps errors, so we get a generic message. 
        // Ideally we'd inspect the cause, but for now just checking failure is enough.
        expect(keyframeTask?.error).toBeDefined(); 

        // Video task should still be pending (dependency not met)
        const videoTask = Object.values(finalPipeline!.tasks).find(t => t.type === 'generate_video');
        expect(videoTask?.status).toBe('pending');
    });
});
