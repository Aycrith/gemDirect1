/**
 * ComfyUI Event Manager - Global WebSocket Manager
 * 
 * Provides a centralized WebSocket connection to ComfyUI that:
 * - Maintains a persistent connection across navigation
 * - Dispatches progress events to subscribers (by job ID)
 * - Updates the global sceneStateStore regardless of current view
 * - Handles reconnection and connection state
 * 
 * This solves the problem where component-scoped WebSocket subscriptions
 * lose progress tracking when navigating between scenes.
 * 
 * ## Usage
 * ```typescript
 * import { comfyEventManager } from './services/comfyUIEventManager';
 * 
 * // Initialize connection (once, at app startup)
 * comfyEventManager.connect(settings);
 * 
 * // Subscribe to a specific job's events
 * const unsubscribe = comfyEventManager.subscribe(jobId, (event) => {
 *   console.log('Job progress:', event);
 * });
 * 
 * // Clean up when done
 * unsubscribe();
 * ```
 * 
 * @module services/comfyUIEventManager
 */

import { useSceneStateStore } from './sceneStateStore';
import type { LocalGenerationSettings } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types from ComfyUI WebSocket
 */
export type ComfyEventType = 
  | 'status'
  | 'execution_start'
  | 'executing'
  | 'progress'
  | 'execution_cached'
  | 'execution_error'
  | 'execution_interrupted'
  | 'executed';

/**
 * Parsed ComfyUI event with typed data
 */
export interface ComfyEvent {
  type: ComfyEventType;
  promptId?: string;
  data: {
    queue_remaining?: number;
    node?: string;
    value?: number;
    max?: number;
    exception_message?: string;
    exception_type?: string;
    [key: string]: unknown;
  };
  raw: unknown;
}

/**
 * Subscriber callback type
 */
export type ComfyEventSubscriber = (event: ComfyEvent) => void;

/**
 * Connection status
 */
export type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Connection status listener
 */
export type ConnectionStatusListener = (status: ConnectionStatus, error?: string) => void;

// ============================================================================
// Configuration
// ============================================================================

/** Maximum reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 5;

/** Base delay between reconnection attempts (exponential backoff) */
const RECONNECT_BASE_DELAY_MS = 1000;

/** Maximum delay between reconnection attempts */
const RECONNECT_MAX_DELAY_MS = 30000;

// ============================================================================
// ComfyUIEventManager Class
// ============================================================================

/**
 * Global WebSocket manager for ComfyUI events
 * 
 * Singleton pattern - use the exported `comfyEventManager` instance
 */
export class ComfyUIEventManager {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<ComfyEventSubscriber>> = new Map();
  private globalSubscribers: Set<ComfyEventSubscriber> = new Set();
  private statusListeners: Set<ConnectionStatusListener> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentSettings: LocalGenerationSettings | null = null;
  private _status: ConnectionStatus = 'disconnected';
  
  /**
   * Get current connection status
   */
  get status(): ConnectionStatus {
    return this._status;
  }
  
  /**
   * Set status and notify listeners
   */
  private setStatus(status: ConnectionStatus, error?: string): void {
    this._status = status;
    this.statusListeners.forEach(listener => listener(status, error));
  }
  
  /**
   * Build WebSocket URL from settings
   */
  private buildWsUrl(settings: LocalGenerationSettings): string | null {
    const { comfyUIUrl, comfyUIClientId } = settings;
    if (!comfyUIUrl || !comfyUIClientId) {
      return null;
    }
    
    // Check for custom WebSocket URL
    if (settings.comfyUIWebSocketUrl) {
      return settings.comfyUIWebSocketUrl.replace(/\/+$/, '') + `?clientId=${comfyUIClientId}`;
    }
    
    // Auto-derive from HTTP URL
    const normalizedUrl = comfyUIUrl.replace(/\/+$/, '');
    const protocol = normalizedUrl.startsWith('https://') ? 'wss://' : 'ws://';
    return `${protocol}${normalizedUrl.replace(/^https?:\/\//, '')}/ws?clientId=${comfyUIClientId}`;
  }
  
  /**
   * Connect to ComfyUI WebSocket
   * 
   * @param settings - Local generation settings with URL and client ID
   */
  connect(settings: LocalGenerationSettings): void {
    // Store settings for reconnection
    this.currentSettings = settings;
    
    // Close existing connection if any
    this.disconnect();
    
    const wsUrl = this.buildWsUrl(settings);
    if (!wsUrl) {
      console.warn('[ComfyUIEventManager] Cannot connect: missing URL or clientId');
      this.setStatus('error', 'Missing ComfyUI URL or clientId');
      return;
    }
    
    this.setStatus('connecting');
    console.log('[ComfyUIEventManager] Connecting to:', wsUrl);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('[ComfyUIEventManager] Failed to create WebSocket:', error);
      this.setStatus('error', String(error));
    }
  }
  
  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    
    this.setStatus('disconnected');
  }
  
  /**
   * Subscribe to events for a specific job/prompt ID
   * 
   * @param jobId - The ComfyUI prompt ID to track
   * @param callback - Function called when events occur for this job
   * @returns Unsubscribe function
   */
  subscribe(jobId: string, callback: ComfyEventSubscriber): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId)!.add(callback);
    
    console.log(`[ComfyUIEventManager] Subscribed to job: ${jobId}`);
    
    return () => {
      this.subscribers.get(jobId)?.delete(callback);
      if (this.subscribers.get(jobId)?.size === 0) {
        this.subscribers.delete(jobId);
      }
      console.log(`[ComfyUIEventManager] Unsubscribed from job: ${jobId}`);
    };
  }
  
  /**
   * Subscribe to all events (for debugging or global monitoring)
   * 
   * @param callback - Function called for every event
   * @returns Unsubscribe function
   */
  subscribeAll(callback: ComfyEventSubscriber): () => void {
    this.globalSubscribers.add(callback);
    
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }
  
  /**
   * Add a connection status listener
   * 
   * @param listener - Function called when connection status changes
   * @returns Unsubscribe function
   */
  onStatusChange(listener: ConnectionStatusListener): () => void {
    this.statusListeners.add(listener);
    // Immediately notify of current status
    listener(this._status);
    
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  
  // ============================================================================
  // WebSocket Event Handlers
  // ============================================================================
  
  private handleOpen(): void {
    console.log('[ComfyUIEventManager] WebSocket connected');
    this.reconnectAttempts = 0;
    this.setStatus('connected');
  }
  
  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return; // Ignore binary data
    
    try {
      const msg = JSON.parse(event.data);
      const comfyEvent = this.parseMessage(msg);
      
      // Update global store (regardless of current view)
      this.updateGlobalStore(comfyEvent);
      
      // Notify job-specific subscribers
      if (comfyEvent.promptId) {
        this.subscribers.get(comfyEvent.promptId)?.forEach(cb => cb(comfyEvent));
      }
      
      // Notify global subscribers
      this.globalSubscribers.forEach(cb => cb(comfyEvent));
      
    } catch (error) {
      console.error('[ComfyUIEventManager] Failed to parse message:', error);
    }
  }
  
  private handleClose(event: CloseEvent): void {
    console.log(`[ComfyUIEventManager] WebSocket closed: ${event.code} ${event.reason}`);
    
    // Attempt reconnection if we have settings and haven't exceeded attempts
    if (this.currentSettings && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    } else {
      this.setStatus('disconnected');
    }
  }
  
  private handleError(event: Event): void {
    console.error('[ComfyUIEventManager] WebSocket error:', event);
    this.setStatus('error', 'WebSocket error');
  }
  
  // ============================================================================
  // Message Parsing
  // ============================================================================
  
  private parseMessage(msg: Record<string, unknown>): ComfyEvent {
    const type = msg.type as ComfyEventType;
    const data = (msg.data as Record<string, unknown>) || {};
    
    // Extract prompt ID from various message formats
    let promptId: string | undefined;
    if (data.prompt_id) {
      promptId = String(data.prompt_id);
    }
    
    return {
      type,
      promptId,
      data: {
        queue_remaining: data.queue_remaining as number | undefined,
        node: data.node as string | undefined,
        value: data.value as number | undefined,
        max: data.max as number | undefined,
        exception_message: data.exception_message as string | undefined,
        exception_type: data.exception_type as string | undefined,
        ...data,
      },
      raw: msg,
    };
  }
  
  // ============================================================================
  // Global Store Integration
  // ============================================================================
  
  /**
   * Update the global sceneStateStore based on ComfyUI events
   * This ensures job progress is tracked even when navigating away
   */
  private updateGlobalStore(event: ComfyEvent): void {
    const { promptId, type, data } = event;
    if (!promptId) return;
    
    const store = useSceneStateStore.getState();
    
    // Find the job that matches this prompt ID
    const job = Object.values(store.generationJobs).find(
      j => j.comfyPromptId === promptId
    );
    
    if (!job) {
      // No matching job in our store - might be from another client
      return;
    }
    
    switch (type) {
      case 'execution_start':
        store.updateGenerationJob(job.id, {
          status: 'in-progress',
          startedAt: Date.now(),
        });
        break;
        
      case 'progress':
        if (data.value !== undefined && data.max !== undefined) {
          const progress = Math.round((data.value / data.max) * 100);
          store.updateJobProgress(job.id, progress, data.node);
        }
        break;
        
      case 'executing':
        if (data.node) {
          store.updateGenerationJob(job.id, {
            currentNode: String(data.node),
          });
        }
        break;
        
      case 'execution_error':
        store.completeJob(
          job.id,
          'failed',
          undefined,
          data.exception_message || 'ComfyUI execution error'
        );
        break;
        
      case 'execution_interrupted':
        store.completeJob(job.id, 'failed', undefined, 'Execution interrupted');
        break;
    }
  }
  
  // ============================================================================
  // Reconnection Logic
  // ============================================================================
  
  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    this.reconnectAttempts++;
    
    // Exponential backoff with jitter
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000,
      RECONNECT_MAX_DELAY_MS
    );
    
    console.log(`[ComfyUIEventManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.currentSettings) {
        this.connect(this.currentSettings);
      }
    }, delay);
  }
  
  // ============================================================================
  // Utility Methods
  // ============================================================================
  
  /**
   * Check if connected
   */
  get isConnected(): boolean {
    // Handle test environments where WebSocket may not be defined
    if (typeof WebSocket === 'undefined') return false;
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get count of active subscriptions
   */
  get subscriptionCount(): number {
    let count = 0;
    this.subscribers.forEach(set => count += set.size);
    return count + this.globalSubscribers.size;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global ComfyUI event manager instance
 * 
 * Use this singleton to manage WebSocket connections across the application
 */
export const comfyEventManager = new ComfyUIEventManager();

// ============================================================================
// Helper Functions for Migration (P2.2)
// ============================================================================

/**
 * Simple progress callback compatible with existing trackPromptExecution callers
 */
export interface PromptProgressUpdate {
  promptId?: string;
  status: 'queued' | 'running' | 'complete' | 'error';
  message?: string;
  progress?: number;
  queue_position?: number;
  node_title?: string;
}

/**
 * Track a prompt execution via the global WebSocket manager
 * 
 * This is a migration helper that provides a similar interface to trackPromptExecution
 * but uses the centralized comfyEventManager instead of creating a new WebSocket.
 * 
 * Note: This does NOT handle asset fetching on completion - callers should use
 * the history API or fetch assets separately.
 * 
 * @param promptId - The ComfyUI prompt ID to track
 * @param onProgress - Callback for progress updates
 * @returns Unsubscribe function
 */
export function trackPromptViaEventManager(
  promptId: string,
  onProgress: (update: PromptProgressUpdate) => void
): () => void {
  return comfyEventManager.subscribe(promptId, (event) => {
    // Convert ComfyEvent to PromptProgressUpdate
    const update: PromptProgressUpdate = {
      promptId: event.promptId,
      status: 'running',
    };

    switch (event.type) {
      case 'status':
        if (event.data.queue_remaining !== undefined) {
          update.status = 'queued';
          update.message = `In queue... Position: ${event.data.queue_remaining}`;
          update.queue_position = event.data.queue_remaining;
        }
        break;

      case 'execution_start':
        update.status = 'running';
        update.message = 'Execution started.';
        break;

      case 'executing':
        if (event.data.node) {
          update.status = 'running';
          update.message = `Executing: Node ${event.data.node}`;
          update.node_title = String(event.data.node);
        }
        break;

      case 'progress':
        if (event.data.value !== undefined && event.data.max !== undefined) {
          update.status = 'running';
          update.progress = Math.round((event.data.value / event.data.max) * 100);
        }
        break;

      case 'execution_error':
        update.status = 'error';
        update.message = event.data.exception_message || 'Execution error';
        break;

      case 'execution_interrupted':
        update.status = 'error';
        update.message = 'Execution interrupted';
        break;

      case 'execution_cached':
        // Cached execution is still "complete" from user's perspective
        update.status = 'complete';
        update.message = 'Using cached result';
        break;

      default:
        return; // Don't dispatch for unknown event types
    }

    onProgress(update);
  });
}
