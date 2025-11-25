/**
 * ComfyUI Queue Monitor Service
 * 
 * Monitors the ComfyUI queue for completed workflows and automatically
 * extracts telemetry data for historical record keeping.
 */

import { ComfyUIWorkflowEvent, ComfyUISceneData } from './comfyUICallbackService';

/**
 * Normalize ComfyUI URLs for DEV mode proxy routing.
 * In development, routes all ComfyUI requests through Vite proxy to avoid CORS issues.
 * In production, uses direct URLs.
 * 
 * @param url - The ComfyUI URL from settings (e.g., http://127.0.0.1:8188)
 * @returns Proxy path in DEV mode (/api/comfyui) or original URL in production
 */
const getComfyUIBaseUrl = (url: string): string => {
    // In development, use Vite proxy to avoid CORS issues with localhost/127.0.0.1
    if (import.meta.env.DEV) {
        return '/api/comfyui';
    }
    // In production, use direct URL
    return url.endsWith('/') ? url.slice(0, -1) : url;
};

export interface ComfyUIQueueItem {
  number: number;
  outputs: Record<string, any>;
  status: {
    status: 'success' | 'failed';
    messages?: string[];
  };
}

export interface ComfyUIHistory {
  [key: string]: {
    outputs: Record<string, any>;
    status?: {
      status: string;
      messages?: string[];
    };
  };
}

/**
 * ComfyUI Queue Monitor for polling and event capture
 */
export class ComfyUIQueueMonitor {
  private comfyUIUrl: string | null = null;
  private lastProcessedIds: Set<string> = new Set();
  private isPolling = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(comfyUIUrl?: string) {
    this.comfyUIUrl = comfyUIUrl || null;
  }

  /**
   * Sets the ComfyUI server URL
   */
  public setServerUrl(url: string): void {
    this.comfyUIUrl = url;
  }

  /**
   * Starts polling for ComfyUI queue completions
   */
  public startPolling(
    interval: number = 5000,
    onCompletion?: (event: ComfyUIWorkflowEvent) => void
  ): void {
    if (this.isPolling) {
      console.warn('Queue monitor already polling');
      return;
    }

    this.isPolling = true;

    this.pollInterval = setInterval(async () => {
      try {
        if (onCompletion) {
          const events = await this.checkQueueCompletion();
          for (const event of events) {
            onCompletion(event);
          }
        }
      } catch (error) {
        console.error('Error polling ComfyUI queue:', error);
      }
    }, interval);

    console.log(`✓ ComfyUI Queue Monitor started (interval: ${interval}ms)`);
  }

  /**
   * Stops polling for queue completions
   */
  public stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
    console.log('ComfyUI Queue Monitor stopped');
  }

  /**
   * Checks for newly completed workflows in ComfyUI history
   */
  public async checkQueueCompletion(): Promise<ComfyUIWorkflowEvent[]> {
    if (!this.comfyUIUrl) {
      return [];
    }

    try {
      const history = await this.fetchComfyUIHistory();
      if (!history) return [];

      const events: ComfyUIWorkflowEvent[] = [];

      for (const [runId, entry] of Object.entries(history)) {
        if (this.lastProcessedIds.has(runId)) {
          continue; // Already processed
        }

        // Extract workflow data from ComfyUI history entry
        const event = this.transformHistoryEntryToEvent(runId, entry);
        if (event) {
          events.push(event);
          this.lastProcessedIds.add(runId);
        }
      }

      return events;
    } catch (error) {
      console.error('Error checking queue completion:', error);
      return [];
    }
  }

  /**
   * Fetches ComfyUI workflow history
   */
  private async fetchComfyUIHistory(): Promise<ComfyUIHistory | null> {
    if (!this.comfyUIUrl) return null;

    try {
      const baseUrl = getComfyUIBaseUrl(this.comfyUIUrl);
      const response = await fetch(`${baseUrl}/history`, {
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching ComfyUI history:', error);
      return null;
    }
  }

  /**
   * Transforms ComfyUI history entry into WorkflowEvent format
   */
  private transformHistoryEntryToEvent(
    runId: string,
    entry: any
  ): ComfyUIWorkflowEvent | null {
    try {
      const now = Date.now();

      // Extract frame count from outputs
      let frameCount = 0;
      let status: 'success' | 'failed' | 'timeout' | 'partial' = 'success';

      if (entry.outputs) {
        // Look for typical output keys
        const imageOutputs = Object.entries(entry.outputs).filter(
          ([key, value]: [string, any]) =>
            Array.isArray(value) || (typeof value === 'object' && value.frames)
        );

        for (const [, outputValue] of imageOutputs) {
          if (Array.isArray(outputValue)) {
            frameCount = Math.max(frameCount, outputValue.length);
          } else if (typeof outputValue === 'object' && outputValue !== null && 'frames' in outputValue) {
            const framesData = (outputValue as any).frames;
            frameCount = Math.max(frameCount, Array.isArray(framesData) ? framesData.length : 0);
          }
        }
      }

      if (entry.status?.status === 'failed') {
        status = 'failed';
      }

      // Create a single scene entry representing the entire workflow
      const sceneData: ComfyUISceneData = {
        sceneId: `scene-${runId}`,
        sceneName: 'Generated Scene',
        frameCount,
        durationMs: 0, // Will be calculated from timestamps if available
        attempts: 1,
        status,
        timestamp: now
      };

      const event: ComfyUIWorkflowEvent = {
        runId,
        timestamp: now,
        startTime: now - 60000, // Estimate
        endTime: now,
        totalDurationMs: 60000, // Estimate
        status,
        scenes: [sceneData],
        gpuModel: 'Unknown',
        gpuMemoryBefore: 0,
        gpuMemoryAfter: 0,
        gpuMemoryPeak: 0
      };

      return event;
    } catch (error) {
      console.error('Error transforming history entry:', error);
      return null;
    }
  }

  /**
   * Manually trigger processing of a specific workflow ID
   */
  public async processWorkflowById(runId: string): Promise<ComfyUIWorkflowEvent | null> {
    if (!this.comfyUIUrl) return null;

    try {
      const history = await this.fetchComfyUIHistory();
      if (!history || !history[runId]) {
        console.warn(`Workflow ${runId} not found in history`);
        return null;
      }

      return this.transformHistoryEntryToEvent(runId, history[runId]);
    } catch (error) {
      console.error('Error processing workflow:', error);
      return null;
    }
  }

  /**
   * Gets current queue status from ComfyUI
   */
  public async getQueueStatus(): Promise<{
    running: number;
    pending: number;
  } | null> {
    if (!this.comfyUIUrl) return null;

    try {
      const response = await fetch(`${this.comfyUIUrl}/queue`, {
        mode: 'cors'
      });

      if (!response.ok) return null;

      const data = await response.json();
      return {
        running: data.queue_running?.length || 0,
        pending: data.queue_pending?.length || 0
      };
    } catch (error) {
      console.error('Error getting queue status:', error);
      return null;
    }
  }

  /**
   * Resets the processed IDs to re-process recent workflows
   */
  public resetProcessedIds(): void {
    this.lastProcessedIds.clear();
    console.log('Reset processed workflow IDs');
  }
}

// Singleton instance
let queueMonitorInstance: ComfyUIQueueMonitor | null = null;

export function getQueueMonitor(url?: string): ComfyUIQueueMonitor {
  if (!queueMonitorInstance) {
    queueMonitorInstance = new ComfyUIQueueMonitor(url);
  }
  return queueMonitorInstance;
}
