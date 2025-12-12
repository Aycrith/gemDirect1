
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeVideoGeneration } from '../pipelineTaskRegistry';
import * as videoUtils from '../../utils/videoUtils';
import * as comfyUIService from '../comfyUIService';

// Mock dependencies
vi.mock('../settingsStore', () => ({
    useSettingsStore: {
        getState: vi.fn().mockReturnValue({
            featureFlags: { enableFLF2V: true },
            comfyUIUrl: 'http://localhost:8188',
            workflowProfiles: {}
        })
    }
}));
vi.mock('../comfyUIService', () => ({
    queueComfyUIPromptWithQueue: vi.fn(),
    waitForComfyCompletion: vi.fn(),
    stripDataUrlPrefix: (value: string) => {
        const parts = value.split(',');
        return parts.length > 1 ? parts.slice(1).join(',') : value;
    },
    ComfyUIPromptPayloads: {}
}));
vi.mock('../../utils/videoUtils');


// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(['mock-video-data'])),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
} as any);

describe('FLF2V Robustness', () => {
    const mockTask: any = {
        id: 'task-1',
        type: 'generate_video',
        payload: {
            prompt: 'test prompt',
            keyframeImage: 'data:image/png;base64,initial-keyframe',
            sceneId: 'scene-1',
            shotId: 'shot-1'
        }
    };

    const mockContext: any = {
        dependencies: {
            'dep-1': {
                id: 'dep-1',
                type: 'generate_video',
                output: {
                    videos: ['http://comfyui/video.mp4']
                }
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // useSettingsStore mock is already set up in vi.mock
        (comfyUIService.queueComfyUIPromptWithQueue as any).mockResolvedValue({
            type: 'video',
            data: 'mock-result'
        });
    });

    it('should use browser extraction when window is defined', async () => {
        // Simulate browser environment
        global.window = {} as any;
        
        (videoUtils.extractFramesFromVideo as any).mockResolvedValue(['frame-1', 'frame-2']);

        const result = await executeVideoGeneration(mockTask, mockContext);

        expect(videoUtils.extractFramesFromVideo).toHaveBeenCalled();
        const meta = (result.metadata as any) || {};
        expect(meta.flf2vSource).toBe('last-frame');
        expect(meta.flf2vFallback).toBe(false);
        
        // Cleanup
        delete (global as any).window;
    });

    it('should fall back to Node extraction when window is undefined', async () => {
        // Simulate Node environment (window undefined)
        delete (global as any).window;

        (globalThis as any).__flf2vNodeFrameExtractor = {
            extractLastFrameBase64FromVideoUrl: vi.fn().mockResolvedValue('node-frame-1')
        };

        const result = await executeVideoGeneration(mockTask, mockContext);

        expect(result).toBeDefined();
        expect((result as any).metadata.flf2vSource).toBe('last-frame');
        expect((result as any).metadata.flf2vFallback).toBe(false);

        delete (globalThis as any).__flf2vNodeFrameExtractor;
    });

    it('should fall back to keyframe if extraction fails', async () => {
        global.window = {} as any;
        (videoUtils.extractFramesFromVideo as any).mockRejectedValue(new Error('Extraction failed'));

        const result = await executeVideoGeneration(mockTask, mockContext);

        const meta = (result.metadata as any) || {};
        expect(meta.flf2vFallback).toBe(true);
        expect(meta.flf2vSource).toBe('keyframe');
        
        delete (global as any).window;
    });
});
