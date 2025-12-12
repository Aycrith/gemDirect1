
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueComfyUIPromptWithQueue } from '../../../services/comfyUIService';
import { getGenerationQueue } from '../../../services/generationQueue';
import { LocalGenerationSettings, WorkflowProfile } from '../../../types';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('GenerationQueue Integration', () => {
    const mockWorkflowJson = JSON.stringify({
        '1': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'prompt' }
        },
        '2': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'negative' }
        },
        '3': {
            class_type: 'LoadImage',
            inputs: { image: 'image.png' }
        }
    });

    const mockWorkflowProfile: WorkflowProfile = {
        id: 'profile-id',
        label: 'Test Profile',
        workflowJson: mockWorkflowJson,
        mapping: {
            '1:text': 'human_readable_prompt',
            '2:text': 'negative_prompt',
            '3:image': 'keyframe_image'
        }
    };

    const mockSettings: LocalGenerationSettings = {
        comfyUIUrl: 'http://localhost:8188',
        featureFlags: {
            useGenerationQueue: true
        },
        workflowProfiles: {
            'profile-id': mockWorkflowProfile,
            'p1': { ...mockWorkflowProfile, id: 'p1' },
            'p2': { ...mockWorkflowProfile, id: 'p2' }
        }
    } as any;

    const mockPayloads = {
        json: JSON.stringify({ prompt: {} }),
        text: 'prompt',
        structured: [],
        negativePrompt: 'negative'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        getGenerationQueue().clear();
        getGenerationQueue().resetCircuitBreaker();

        // Default mock implementation
        fetchMock.mockImplementation(async (url, _options) => {
            const urlStr = url.toString();
            
            if (urlStr.includes('/system_stats')) {
                return {
                    ok: true,
                    json: async () => ({
                        system: { os: 'windows', python_version: '3.10' },
                        devices: [{ name: 'NVIDIA GeForce RTX 3090', vram_total: 24576, vram_free: 20000 }]
                    })
                };
            }
            
            if (urlStr.includes('/upload/image')) {
                return {
                    ok: true,
                    json: async () => ({
                        name: 'uploaded_image.png',
                        subfolder: '',
                        type: 'input'
                    })
                };
            }

            if (urlStr.includes('/prompt')) {
                return {
                    ok: true,
                    json: async () => ({ prompt_id: 'test-prompt-id', number: 1 })
                };
            }

            if (urlStr.includes('/history')) {
                return {
                    ok: true,
                    json: async () => ({
                        'test-prompt-id': {
                            status: { completed: true },
                            outputs: { '9': { images: [{ filename: 'test.png' }] } }
                        }
                    })
                };
            }

            return { ok: false, status: 404, statusText: 'Not Found' };
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should enqueue a task and execute it', async () => {
        // We can use waitForCompletion: false to avoid the polling loop in the test
        const result = await queueComfyUIPromptWithQueue(
            mockSettings,
            mockPayloads,
            'base64image',
            'profile-id',
            { waitForCompletion: false }
        );

        expect(result).toBeDefined();
        // The result should be the prompt response
        expect((result as any).prompt_id).toBe('test-prompt-id');

        // Verify fetch was called for prompt
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/prompt'),
            expect.objectContaining({
                method: 'POST'
            })
        );

        // Verify queue is empty (task finished)
        expect(getGenerationQueue().getState().size).toBe(0);
    });

    it('should handle queue concurrency', async () => {
        
        // Queue multiple tasks
        const p1 = queueComfyUIPromptWithQueue(mockSettings, mockPayloads, 'img1', 'p1', { waitForCompletion: false });
        const p2 = queueComfyUIPromptWithQueue(mockSettings, mockPayloads, 'img2', 'p2', { waitForCompletion: false });
        
        // Wait for both to finish
        await Promise.all([p1, p2]);
        
        // Should call system_stats (maybe cached?) and prompt twice
        // Actually checkServerConnection might be called multiple times
        expect(fetchMock).toHaveBeenCalled();
        
        // Verify at least 2 prompt calls
        const promptCalls = fetchMock.mock.calls.filter(call => call[0].toString().includes('/prompt'));
        expect(promptCalls.length).toBe(2);
    });
});

