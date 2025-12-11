import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExportPipeline } from '../pipelineFactory';
import { usePipelineStore } from '../pipelineStore';
import { Scene, LocalGenerationSettings } from '../../types';

// Mock dependencies
vi.mock('../pipelineStore');

describe('pipelineFactory', () => {
    const mockCreatePipeline = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (usePipelineStore.getState as any) = vi.fn().mockReturnValue({
            createPipeline: mockCreatePipeline
        });
    });

    const mockScenes: Scene[] = [
        {
            id: 'scene-1',
            title: 'Scene 1',
            summary: 'Summary 1',
            timeline: {
                shots: [
                    { id: 'shot-1', description: 'Shot 1 description' },
                    { id: 'shot-2', description: 'Shot 2 description' }
                ],
                shotEnhancers: {},
                transitions: [],
                negativePrompt: 'negative'
            }
        } as any
    ];

    const mockSettings: LocalGenerationSettings = {
        imageWorkflowProfile: 'custom-t2i',
        videoWorkflowProfile: 'custom-i2v'
    } as any;

    it('should create a pipeline with keyframe and video tasks for each shot', () => {
        createExportPipeline(mockScenes, mockSettings);

        expect(mockCreatePipeline).toHaveBeenCalledTimes(1);
        const call = mockCreatePipeline.mock.calls[0] as any[];
        expect(call).toBeDefined();
        const [name, tasks] = call;
        
        expect(name).toContain('Export All');
        expect(tasks).toHaveLength(4); // 2 shots * 2 tasks (keyframe + video)

        // Verify Keyframe Task 1
        const k1 = tasks.find((t: any) => t.id === 'keyframe-scene-1-shot-1');
        expect(k1).toBeDefined();
        expect(k1.type).toBe('generate_keyframe');
        expect(k1.payload.workflowProfileId).toBe('custom-t2i');
        expect(k1.payload.prompt).toBe('Shot 1 description');

        // Verify Video Task 1
        const v1 = tasks.find((t: any) => t.id === 'video-scene-1-shot-1');
        expect(v1).toBeDefined();
        expect(v1.type).toBe('generate_video');
        expect(v1.dependencies).toContain('keyframe-scene-1-shot-1');
        expect(v1.payload.workflowProfileId).toBe('custom-i2v');
    });

    it('should respect options to skip keyframes', () => {
        createExportPipeline(mockScenes, mockSettings, { generateKeyframes: false, generateVideos: true });

        const call = mockCreatePipeline.mock.calls[0] as any[];
        expect(call).toBeDefined();
        const [, tasks] = call;
        expect(tasks).toHaveLength(2); // Only video tasks

        const v1 = tasks.find((t: any) => t.id === 'video-scene-1-shot-1');
        expect(v1.dependencies).toHaveLength(0); // No dependency on keyframe task since it's not created
    });
});
