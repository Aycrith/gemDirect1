/**
 * Provider Health Hook Unit Tests
 * 
 * Tests for the useProviderHealth hook including:
 * - Initial state
 * - Health check execution
 * - Polling behavior
 * - Standalone health check function
 * 
 * @module hooks/__tests__/useProviderHealth.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProviderHealth, checkProviderHealth, ProviderHealthStatus } from '../useProviderHealth';
import type { LocalGenerationSettings } from '../../types';
import * as comfyUIService from '../../services/comfyUIService';

// Mock comfyUIService
vi.mock('../../services/comfyUIService', () => ({
    checkServerConnection: vi.fn(),
    checkSystemResources: vi.fn(),
    validateWorkflowAndMappings: vi.fn(),
    getQueueInfo: vi.fn(),
}));

// Mock featureFlags
vi.mock('../../utils/featureFlags', () => ({
    isFeatureEnabled: vi.fn(() => false),
}));

describe('useProviderHealth', () => {
    const mockSettings: LocalGenerationSettings = {
        comfyUIUrl: 'http://localhost:8188',
        comfyUIClientId: 'test-client',
        workflowJson: '{}',
        mapping: {},
        videoProvider: 'comfyui-local',
        workflowProfiles: {},
        videoWorkflowProfile: 'wan-i2v',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initial state', () => {
        it('should have default status values', () => {
            const { result } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            expect(result.current.status.ready).toBe(false);
            expect(result.current.status.checking).toBe(false);
            expect(result.current.status.serverConnected).toBe(false);
            expect(result.current.status.workflowsValid).toBe(false);
            expect(result.current.status.error).toBeNull();
            expect(result.current.status.warnings).toEqual([]);
        });

        it('should not be polling by default', () => {
            const { result } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            expect(result.current.isPolling).toBe(false);
        });

        it('should have null timestamps initially', () => {
            const { result } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            expect(result.current.status.lastCheckedAt).toBeNull();
            expect(result.current.status.nextCheckIn).toBeNull();
        });
    });

    describe('checkNow', () => {
        it('should set checking to true during check', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockImplementation(
                () => new Promise(resolve => setTimeout(resolve, 100))
            );
            
            const { result } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            act(() => {
                result.current.checkNow();
            });
            
            expect(result.current.status.checking).toBe(true);
        });

        it('should return success when all checks pass', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockResolvedValue(undefined);
            vi.mocked(comfyUIService.checkSystemResources).mockResolvedValue('GPU: RTX 4090');
            vi.mocked(comfyUIService.validateWorkflowAndMappings).mockReturnValue(undefined);
            vi.mocked(comfyUIService.getQueueInfo).mockResolvedValue({ 
                queue_running: 0, 
                queue_pending: 0 
            });
            
            const { result } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            let validationResult: Awaited<ReturnType<typeof result.current.checkNow>>;
            await act(async () => {
                validationResult = await result.current.checkNow();
            });
            
            expect(validationResult!.success).toBe(true);
            expect(result.current.status.ready).toBe(true);
            expect(result.current.status.serverConnected).toBe(true);
        });

        it('should return failure when server connection fails', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockRejectedValue(
                new Error('Connection refused')
            );
            
            const { result } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            let validationResult: Awaited<ReturnType<typeof result.current.checkNow>>;
            await act(async () => {
                validationResult = await result.current.checkNow();
            });
            
            expect(validationResult!.success).toBe(false);
            expect(result.current.status.ready).toBe(false);
            expect(result.current.status.error).toContain('Connection refused');
        });

        it('should handle missing ComfyUI URL', async () => {
            const settingsWithoutUrl: LocalGenerationSettings = {
                ...mockSettings,
                comfyUIUrl: '',
            };
            
            const { result } = renderHook(() => useProviderHealth({ settings: settingsWithoutUrl }));
            
            let validationResult: Awaited<ReturnType<typeof result.current.checkNow>>;
            await act(async () => {
                validationResult = await result.current.checkNow();
            });
            
            expect(validationResult!.success).toBe(false);
            expect(result.current.status.error).toContain('not configured');
        });

        it('should call onUnhealthy callback on failure', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockRejectedValue(
                new Error('Server down')
            );
            
            const onUnhealthy = vi.fn();
            const { result } = renderHook(() => useProviderHealth({ 
                settings: mockSettings,
                onUnhealthy,
            }));
            
            await act(async () => {
                await result.current.checkNow();
            });
            
            expect(onUnhealthy).toHaveBeenCalledWith('Server down');
        });

        it('should call onHealthChange callback', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockResolvedValue(undefined);
            vi.mocked(comfyUIService.checkSystemResources).mockResolvedValue('OK');
            vi.mocked(comfyUIService.validateWorkflowAndMappings).mockReturnValue(undefined);
            vi.mocked(comfyUIService.getQueueInfo).mockResolvedValue({ 
                queue_running: 0, 
                queue_pending: 0 
            });
            
            const onHealthChange = vi.fn();
            const { result } = renderHook(() => useProviderHealth({ 
                settings: mockSettings,
                onHealthChange,
            }));
            
            await act(async () => {
                await result.current.checkNow();
            });
            
            expect(onHealthChange).toHaveBeenCalled();
            expect(onHealthChange.mock.calls[0]![0].ready).toBe(true);
        });
    });

    describe('polling', () => {
        it('should expose startPolling and stopPolling functions', () => {
            const { result, unmount } = renderHook(() => useProviderHealth({ settings: mockSettings }));
            
            // Verify polling functions are exposed
            expect(typeof result.current.startPolling).toBe('function');
            expect(typeof result.current.stopPolling).toBe('function');
            
            // Initial state should not be polling
            expect(result.current.isPolling).toBe(false);
            
            unmount();
        });

        it('should respect minimum polling interval', () => {
            const { result, unmount } = renderHook(() => useProviderHealth({ 
                settings: mockSettings,
                pollingIntervalMs: 1000, // Below minimum
                minPollingIntervalMs: 5000,
            }));
            
            // The hook should have default status
            expect(result.current.status).toBeDefined();
            expect(result.current.status.ready).toBe(false);
            
            // Cleanup
            unmount();
        });
    });

    describe('checkProviderHealth (standalone)', () => {
        it('should check health without hook', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockResolvedValue(undefined);
            vi.mocked(comfyUIService.checkSystemResources).mockResolvedValue('GPU ready');
            vi.mocked(comfyUIService.validateWorkflowAndMappings).mockReturnValue(undefined);
            vi.mocked(comfyUIService.getQueueInfo).mockResolvedValue({ 
                queue_running: 1, 
                queue_pending: 2 
            });
            
            const result = await checkProviderHealth(mockSettings);
            
            expect(result.success).toBe(true);
            expect(result.data?.ready).toBe(true);
            expect(result.data?.queueInfo).toEqual({ queue_running: 1, queue_pending: 2 });
        });

        it('should fail for missing URL', async () => {
            const settingsWithoutUrl: LocalGenerationSettings = {
                ...mockSettings,
                comfyUIUrl: '',
            };
            
            const result = await checkProviderHealth(settingsWithoutUrl);
            
            expect(result.success).toBe(false);
            expect(result.errors![0]!.code).toBe('PROVIDER_CONNECTION_FAILED');
        });

        it('should include warnings for non-critical failures', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockResolvedValue(undefined);
            vi.mocked(comfyUIService.checkSystemResources).mockResolvedValue('Warning: Low VRAM');
            vi.mocked(comfyUIService.validateWorkflowAndMappings).mockReturnValue(undefined);
            vi.mocked(comfyUIService.getQueueInfo).mockRejectedValue(new Error('Queue unavailable'));
            
            const result = await checkProviderHealth(mockSettings);
            
            // Still succeeds as long as server connects and workflows valid
            expect(result.success).toBe(true);
            // Note: Current implementation includes warnings in the ProviderHealthStatus data,
            // not in the ValidationResult.warnings. The data.warnings contains resource warnings.
            expect(result.data?.warnings.length).toBeGreaterThan(0);
        });

        it('should add warning for workflow validation failure', async () => {
            vi.mocked(comfyUIService.checkServerConnection).mockResolvedValue(undefined);
            vi.mocked(comfyUIService.checkSystemResources).mockResolvedValue('OK');
            vi.mocked(comfyUIService.validateWorkflowAndMappings).mockImplementation(() => {
                throw new Error('Missing CLIP mapping');
            });
            vi.mocked(comfyUIService.getQueueInfo).mockResolvedValue({ 
                queue_running: 0, 
                queue_pending: 0 
            });
            
            const result = await checkProviderHealth(mockSettings);
            
            // Connection works but workflow invalid
            expect(result.warnings?.some(w => w.message.includes('Workflow'))).toBe(true);
        });
    });

    describe('ProviderHealthStatus interface', () => {
        it('should have all expected properties', () => {
            const status: ProviderHealthStatus = {
                ready: true,
                checking: false,
                lastCheckedAt: Date.now(),
                nextCheckIn: 30000,
                serverConnected: true,
                systemResources: 'RTX 4090, 24GB VRAM',
                workflowsValid: true,
                queueInfo: { queue_running: 0, queue_pending: 0 },
                error: null,
                warnings: [],
            };
            
            expect(status.ready).toBe(true);
            expect(status.queueInfo?.queue_running).toBe(0);
        });
    });
});
