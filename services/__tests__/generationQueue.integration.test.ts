import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueComfyUIPromptSafe } from '../videoGenerationService';
import { getGenerationQueue, resetGlobalQueue } from '../generationQueue';
import * as featureFlags from '../../utils/featureFlags';
import { LocalGenerationSettings } from '../../types';

describe('GenerationQueue Integration', () => {
    const mockSettings = {
        comfyUIUrl: 'http://localhost:8188',
        workflowJson: '{}',
        mapping: {},
    } as LocalGenerationSettings;
    
    const mockPayloads = { json: '{}', text: 'prompt' };
    const mockImage = 'base64image';

    beforeEach(() => {
        resetGlobalQueue();
        vi.clearAllMocks();
        // Enable queue feature flag
        vi.spyOn(featureFlags, 'isFeatureEnabled').mockReturnValue(true);
        
        // Mock global fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ prompt_id: 'mock-prompt-id' }),
        });
    });

    afterEach(() => {
        resetGlobalQueue();
        vi.restoreAllMocks();
    });

    it('should enqueue video generation task when queue is enabled', async () => {
        const queue = getGenerationQueue();

        const resultPromise = queueComfyUIPromptSafe(mockSettings, mockPayloads, mockImage, {
            sceneId: 'scene-1',
        });

        // Verify task is in queue (or running immediately)
        const state = queue.getState();
        expect(state.size + (state.isRunning ? 1 : 0)).toBeGreaterThan(0);

        const result = await resultPromise;
        expect(result).toEqual({ prompt_id: 'mock-prompt-id' });
        
        // Verify fetch was called (proving queueComfyUIPrompt executed)
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('http://localhost:8188'),
            expect.anything()
        );
    });

    it('should bypass queue when feature flag is disabled', async () => {
        vi.spyOn(featureFlags, 'isFeatureEnabled').mockReturnValue(false);

        const result = await queueComfyUIPromptSafe(mockSettings, mockPayloads, mockImage);

        expect(result).toEqual({ prompt_id: 'mock-prompt-id' });
        expect(global.fetch).toHaveBeenCalled();
        
        // Queue should be empty
        const queue = getGenerationQueue();
        expect(queue.getState().size).toBe(0);
        expect(queue.getState().isRunning).toBe(false);
    });

    it('should process tasks sequentially', async () => {
        const queue = getGenerationQueue();
        
        // Mock fetch to take some time
        global.fetch = vi.fn()
            .mockImplementationOnce(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { ok: true, json: async () => ({ prompt_id: '1' }) };
            })
            .mockImplementationOnce(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return { ok: true, json: async () => ({ prompt_id: '2' }) };
            });

        const p1 = queueComfyUIPromptSafe(mockSettings, mockPayloads, mockImage, { sceneId: '1' });
        const p2 = queueComfyUIPromptSafe(mockSettings, mockPayloads, mockImage, { sceneId: '2' });

        // Both should be tracked
        expect(queue.getState().size).toBeGreaterThan(0);

        const [r1, r2] = await Promise.all([p1, p2]);
        
        expect(r1).toEqual({ prompt_id: '1' });
        expect(r2).toEqual({ prompt_id: '2' });
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});
