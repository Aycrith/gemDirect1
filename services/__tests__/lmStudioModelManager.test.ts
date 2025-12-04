/**
 * LM Studio Model Manager Tests
 * 
 * Tests for automatic model unloading to free VRAM before ComfyUI generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getLMStudioModelState,
    unloadAllModels,
    ensureModelsUnloaded,
    isLMStudioReachable,
    getLMStudioBaseUrl,
} from '../lmStudioModelManager';

describe('lmStudioModelManager', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    describe('getLMStudioModelState', () => {
        it('should return no models when LM Studio returns empty list', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [] }),
            });

            const state = await getLMStudioModelState();

            expect(state.hasLoadedModels).toBe(false);
            expect(state.loadedModelIds).toEqual([]);
            expect(state.error).toBeUndefined();
        });

        it('should return loaded models when LM Studio has models', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'qwen-32b', state: 'loaded' },
                        { id: 'mistral-7b', state: 'loaded' },
                    ],
                }),
            });

            const state = await getLMStudioModelState();

            expect(state.hasLoadedModels).toBe(true);
            expect(state.loadedModelIds).toEqual(['qwen-32b', 'mistral-7b']);
        });

        it('should filter out unloaded models', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'qwen-32b', state: 'loaded' },
                        { id: 'mistral-7b', state: 'unloaded' },
                    ],
                }),
            });

            const state = await getLMStudioModelState();

            expect(state.hasLoadedModels).toBe(true);
            expect(state.loadedModelIds).toEqual(['qwen-32b']);
        });

        it('should handle connection errors gracefully', async () => {
            fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

            const state = await getLMStudioModelState();

            expect(state.hasLoadedModels).toBe(false);
            expect(state.loadedModelIds).toEqual([]);
            // Connection errors don't set error for fetch failures
            expect(state.error).toBeUndefined();
        });

        it('should fallback to OpenAI endpoint if native fails', async () => {
            // First call (native API) fails
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 404,
            });
            // Second call (OpenAI API) succeeds
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [{ id: 'model-a' }],
                }),
            });

            const state = await getLMStudioModelState();

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(state.hasLoadedModels).toBe(true);
            expect(state.loadedModelIds).toEqual(['model-a']);
        });
    });

    describe('unloadAllModels', () => {
        it('should return success with 0 count when no models loaded', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [] }),
            });

            const result = await unloadAllModels();

            expect(result.success).toBe(true);
            expect(result.unloadedCount).toBe(0);
            expect(result.error).toBeUndefined();
        });

        it('should attempt to unload each loaded model', async () => {
            let callCount = 0;
            fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => {
                callCount++;
                // First call: get state, returns models
                if (callCount === 1) {
                    return {
                        ok: true,
                        json: async () => ({
                            data: [
                                { id: 'model-a', state: 'loaded' },
                                { id: 'model-b', state: 'loaded' },
                            ],
                        }),
                    };
                }
                // Subsequent DELETE calls for unloading
                if (options?.method === 'DELETE') {
                    return { ok: true, json: async () => ({}) };
                }
                // Polling calls: return empty (unloaded)
                return {
                    ok: true,
                    json: async () => ({ data: [] }),
                };
            });

            const result = await unloadAllModels({
                pollIntervalMs: 10,
                maxRetries: 3,
            });

            expect(result.success).toBe(true);
            expect(result.unloadedCount).toBe(2);
        });
    });

    describe('ensureModelsUnloaded', () => {
        it('should return true immediately if no models loaded', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ data: [] }),
            });

            const result = await ensureModelsUnloaded();

            expect(result).toBe(true);
        });

        it('should unload models and return true on success', async () => {
            let callCount = 0;
            fetchMock.mockImplementation(async () => {
                callCount++;
                // First 2 calls: models loaded
                if (callCount <= 2) {
                    return {
                        ok: true,
                        json: async () => ({
                            data: [{ id: 'model', state: 'loaded' }],
                        }),
                    };
                }
                // Later calls: models unloaded
                return {
                    ok: true,
                    json: async () => ({ data: [] }),
                };
            });

            const result = await ensureModelsUnloaded({
                pollIntervalMs: 10,
                maxRetries: 5,
            });

            expect(result).toBe(true);
        });
    });

    describe('isLMStudioReachable', () => {
        it('should return true when LM Studio responds', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true });

            const result = await isLMStudioReachable();

            expect(result).toBe(true);
        });

        it('should return false when LM Studio is unreachable', async () => {
            fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            const result = await isLMStudioReachable();

            expect(result).toBe(false);
        });
    });

    describe('getLMStudioBaseUrl', () => {
        it('should return the configured base URL', () => {
            const url = getLMStudioBaseUrl();

            expect(url).toMatch(/^https?:\/\//);
        });
    });
});
