/**
 * Unit tests for ComfyUI Event Manager
 * 
 * Tests the global WebSocket manager for ComfyUI events.
 * These tests focus on subscription API and singleton behavior.
 * WebSocket connection tests require real network which is covered in E2E tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the sceneStateStore BEFORE importing the module under test
vi.mock('../sceneStateStore', () => ({
  useSceneStateStore: {
    getState: () => ({
      generationJobs: {},
      updateGenerationJob: vi.fn(),
    }),
  },
}));

// Import after mocks are set up
import { ComfyUIEventManager, comfyEventManager } from '../comfyUIEventManager';

describe('ComfyUIEventManager', () => {
  let manager: ComfyUIEventManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ComfyUIEventManager();
  });
  
  afterEach(() => {
    manager.disconnect();
  });
  
  describe('Initial State', () => {
    it('should have initial status as disconnected', () => {
      expect(manager.status).toBe('disconnected');
    });
    
    it('should have isConnected as false initially', () => {
      expect(manager.isConnected).toBe(false);
    });
    
    it('should have zero subscriptions initially', () => {
      expect(manager.subscriptionCount).toBe(0);
    });
  });
  
  describe('Event Subscription API', () => {
    it('should allow subscribing to job events', () => {
      const handler = vi.fn();
      const unsubscribe = manager.subscribe('job-123', handler);
      
      expect(typeof unsubscribe).toBe('function');
      expect(manager.subscriptionCount).toBe(1);
    });
    
    it('should allow multiple subscriptions to different jobs', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      manager.subscribe('job-1', handler1);
      manager.subscribe('job-2', handler2);
      
      expect(manager.subscriptionCount).toBe(2);
    });
    
    it('should allow multiple handlers for same job', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      manager.subscribe('job-1', handler1);
      manager.subscribe('job-1', handler2);
      
      expect(manager.subscriptionCount).toBe(2);
    });
    
    it('should decrease count when unsubscribing', () => {
      const handler = vi.fn();
      const unsubscribe = manager.subscribe('job-123', handler);
      
      expect(manager.subscriptionCount).toBe(1);
      
      unsubscribe();
      
      expect(manager.subscriptionCount).toBe(0);
    });
    
    it('should handle unsubscribing multiple times gracefully', () => {
      const handler = vi.fn();
      const unsubscribe = manager.subscribe('job-123', handler);
      
      unsubscribe();
      unsubscribe(); // Second call should not throw
      
      expect(manager.subscriptionCount).toBe(0);
    });
  });
  
  describe('Global Subscription API', () => {
    it('should allow global event subscription', () => {
      const handler = vi.fn();
      const unsubscribe = manager.subscribeAll(handler);
      
      expect(typeof unsubscribe).toBe('function');
      expect(manager.subscriptionCount).toBe(1);
    });
    
    it('should decrease count when unsubscribing global handler', () => {
      const handler = vi.fn();
      const unsubscribe = manager.subscribeAll(handler);
      
      expect(manager.subscriptionCount).toBe(1);
      
      unsubscribe();
      
      expect(manager.subscriptionCount).toBe(0);
    });
    
    it('should track both job and global subscriptions', () => {
      manager.subscribeAll(vi.fn());
      manager.subscribe('job-1', vi.fn());
      manager.subscribe('job-2', vi.fn());
      
      expect(manager.subscriptionCount).toBe(3);
    });
  });
  
  describe('Status Listener API', () => {
    it('should allow adding status listeners', () => {
      const listener = vi.fn();
      const unsubscribe = manager.onStatusChange(listener);
      
      expect(typeof unsubscribe).toBe('function');
    });
    
    it('should immediately call listener with current status', () => {
      const listener = vi.fn();
      manager.onStatusChange(listener);
      
      expect(listener).toHaveBeenCalledWith('disconnected');
    });
    
    it('should allow removing status listeners', () => {
      const listener = vi.fn();
      const unsubscribe = manager.onStatusChange(listener);
      
      // Called once immediately
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      // Disconnect should not call the listener
      manager.disconnect();
      
      // Still only called once
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(comfyEventManager).toBeInstanceOf(ComfyUIEventManager);
    });
    
    it('should be the same instance on multiple imports', async () => {
      const { comfyEventManager: instance1 } = await import('../comfyUIEventManager');
      const { comfyEventManager: instance2 } = await import('../comfyUIEventManager');
      
      expect(instance1).toBe(instance2);
    });
  });
  
  describe('Disconnect Behavior', () => {
    it('should set status to disconnected after disconnect', () => {
      manager.disconnect();
      
      expect(manager.status).toBe('disconnected');
    });
    
    it('should handle multiple disconnects gracefully', () => {
      manager.disconnect();
      manager.disconnect();
      
      expect(manager.status).toBe('disconnected');
    });
  });
  
  describe('Invalid Settings Handling', () => {
    it('should set error status with missing URL', () => {
      manager.connect({ comfyUIUrl: '', comfyUIClientId: 'test' } as never);
      
      expect(manager.status).toBe('error');
    });
    
    it('should set error status with missing clientId', () => {
      manager.connect({ comfyUIUrl: 'http://localhost:8188', comfyUIClientId: '' } as never);
      
      expect(manager.status).toBe('error');
    });
    
    it('should remain disconnected with completely invalid settings', () => {
      manager.connect({} as never);
      
      expect(manager.status).toBe('error');
    });
  });
});

describe('trackPromptViaEventManager', () => {
  let trackPromptViaEventManager: typeof import('../comfyUIEventManager').trackPromptViaEventManager;
  let eventManager: typeof import('../comfyUIEventManager').comfyEventManager;

  beforeEach(async () => {
    const module = await import('../comfyUIEventManager');
    trackPromptViaEventManager = module.trackPromptViaEventManager;
    eventManager = module.comfyEventManager;
  });

  it('should subscribe to the event manager', () => {
    const callback = vi.fn();
    const unsubscribe = trackPromptViaEventManager('test-prompt-123', callback);
    
    // Verify subscription was added
    expect(eventManager.subscriptionCount).toBeGreaterThan(0);
    
    // Clean up
    unsubscribe();
  });

  it('should unsubscribe when called', () => {
    const callback = vi.fn();
    const initialCount = eventManager.subscriptionCount;
    
    const unsubscribe = trackPromptViaEventManager('test-prompt-456', callback);
    expect(eventManager.subscriptionCount).toBe(initialCount + 1);
    
    unsubscribe();
    expect(eventManager.subscriptionCount).toBe(initialCount);
  });
});
