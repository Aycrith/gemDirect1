/**
 * ComfyUI Callback Integration Service
 * 
 * Handles webhook callbacks from ComfyUI workflow completions,
 * extracts telemetry data, and automatically populates historical data into IndexedDB.
 * 
 * Features:
 * - Captures workflow completion events
 * - Extracts frame count, duration, GPU metrics
 * - Generates performance recommendations
 * - Persists data to IndexedDB via runHistoryService
 * - Supports batch processing of multiple workflow runs
 */

import {
  HistoricalRun,
  HistoricalSceneMetrics,
  HistoricalRunMetadata,
  StoredRecommendation,
  RunHistoryDatabase
} from './runHistoryService';
import { ComfyUIQueueMonitor } from './comfyUIQueueMonitor';

export interface ComfyUIWorkflowEvent {
  runId: string;
  timestamp: number;
  workflowName?: string;
  storyTitle?: string;
  storyId?: string;
  
  // Scene metrics
  scenes: ComfyUISceneData[];
  
  // GPU telemetry
  gpuModel?: string;
  gpuMemoryBefore?: number;
  gpuMemoryAfter?: number;
  gpuMemoryPeak?: number;
  
  // Timing
  totalDurationMs: number;
  startTime: number;
  endTime: number;
  
  // Status
  status: 'success' | 'failed' | 'timeout' | 'partial';
  errorMessage?: string;
}

export interface ComfyUISceneData {
  sceneId: string;
  sceneName?: string;
  description?: string;
  frameCount: number;
  durationMs: number;
  attempts: number;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  exitReason?: string;
  gpuVramBefore?: number;
  gpuVramAfter?: number;
  timestamp: number;
}

/**
 * Initializes the ComfyUI callback service and sets up event listeners
 */
export class ComfyUICallbackManager {
  private db: RunHistoryDatabase | null = null;
  private webhookCallbacks: Map<string, (event: ComfyUIWorkflowEvent) => void> = new Map();
  private queueMonitor: ComfyUIQueueMonitor | null = null;

  async initialize(database: RunHistoryDatabase): Promise<void> {
    this.db = database;
    this.setupComfyUIWebhooks();
  }

  /**
   * Sets up ComfyUI webhooks and event listeners
   * This would integrate with your actual ComfyUI server
   */
  private setupComfyUIWebhooks(): void {
    // Listen for ComfyUI workflow completion events
    if (typeof window !== 'undefined') {
      // Register a global callback for ComfyUI
      (window as any).__comfyUICallback = this.handleWorkflowCompletion.bind(this);
      
      // Also set up polling for batch processing if webhooks aren't available
      this.startBatchProcessor();
    }
  }

  /**
   * Handles workflow completion events from ComfyUI
   * Extracts metrics and saves to IndexedDB
   */
  private async handleWorkflowCompletion(event: ComfyUIWorkflowEvent): Promise<void> {
    try {
      if (!this.db) {
        console.warn('ComfyUICallbackManager: Database not initialized');
        return;
      }

      // Transform ComfyUI event into HistoricalRun format
      const historicalRun = this.transformEventToHistoricalRun(event);

      // Save to IndexedDB
      await this.db.saveRun(historicalRun);

      // Generate and save recommendations
      const recommendations = this.generateRecommendations(historicalRun);
      for (const rec of recommendations) {
        await this.db.saveRecommendation(rec);
      }

      // Emit callback for UI updates
      this.notifySubscribers(event);

      console.log(`✓ Workflow ${event.runId} saved to historical data`);
    } catch (error) {
      console.error('Failed to process workflow completion:', error);
    }
  }

  /**
   * Transforms ComfyUI event format to HistoricalRun format
   */
  private transformEventToHistoricalRun(event: ComfyUIWorkflowEvent): HistoricalRun {
    const successCount = event.scenes.filter(s => s.status === 'success').length;
    const failureCount = event.scenes.filter(s => s.status === 'failed' || s.status === 'timeout').length;
    const skippedCount = event.scenes.filter(s => s.status === 'skipped').length;
    const sceneCount = event.scenes.length;

    const totalFrames = event.scenes.reduce((sum, s) => sum + s.frameCount, 0);
    const averageDurationMs = sceneCount > 0 ? event.totalDurationMs / sceneCount : 0;
    const successRate = sceneCount > 0 ? (successCount / sceneCount) * 100 : 0;

    // Calculate GPU metrics
    const gpuMemoryBefore = event.gpuMemoryBefore || 0;
    const gpuMemoryPeak = event.gpuMemoryPeak || 0;
    const gpuAverageFree = event.scenes.length > 0
      ? event.scenes.reduce((sum, s) => sum + (s.gpuVramBefore || 0), 0) / event.scenes.length
      : gpuMemoryBefore;

    const metadata: HistoricalRunMetadata = {
      runId: event.runId,
      timestamp: event.timestamp,
      storyId: event.storyId,
      sceneCount,
      totalDuration: event.totalDurationMs,
      averageDuration: averageDurationMs,
      successCount,
      failureCount,
      successRate,
      gpuAverageFree,
      gpuPeakUsage: gpuMemoryPeak,
      fallbackCount: event.scenes.filter(s => s.attempts > 1).length,
      archived: false
    };

    const scenes: HistoricalSceneMetrics[] = event.scenes.map(scene => ({
      sceneId: scene.sceneId,
      sceneName: scene.sceneName,
      duration: scene.durationMs,
      attempts: scene.attempts,
      gpuVramFree: scene.gpuVramBefore || 0,
      gpuVramUsed: scene.gpuVramAfter ? (scene.gpuVramBefore || 0) - scene.gpuVramAfter : undefined,
      status: scene.status,
      exitReason: scene.exitReason,
      timestamp: scene.timestamp
    }));

    return {
      runId: event.runId,
      timestamp: event.timestamp,
      storyId: event.storyId,
      storyTitle: event.storyTitle,
      scenes,
      metadata,
      notes: `Workflow: ${event.workflowName || 'unnamed'} | Status: ${event.status}${
        event.errorMessage ? ` | Error: ${event.errorMessage}` : ''
      }`
    };
  }

  /**
   * Generates performance recommendations based on workflow metrics
   */
  private generateRecommendations(run: HistoricalRun): StoredRecommendation[] {
    const recommendations: StoredRecommendation[] = [];
    const { metadata } = run;

    // Low success rate warning
    if (metadata.successRate < 80) {
      recommendations.push({
        id: `${run.runId}-success-rate`,
        runId: run.runId,
        type: 'timeout',
        severity: metadata.successRate < 50 ? 'critical' : 'warning',
        message: `Low success rate detected: ${metadata.successRate.toFixed(1)}%. ${
          metadata.fallbackCount > 0 ? `${metadata.fallbackCount} scenes required retries.` : ''
        }`,
        suggestedAction: 'Consider increasing MaxWaitTime or reducing scene complexity',
        confidence: Math.min(100, metadata.sceneCount * 20),
        timestamp: run.timestamp,
        dismissed: false
      });
    }

    // High GPU usage warning
    if (metadata.gpuPeakUsage > 20000) {
      recommendations.push({
        id: `${run.runId}-gpu-usage`,
        runId: run.runId,
        type: 'gpu',
        severity: metadata.gpuPeakUsage > 23000 ? 'critical' : 'warning',
        message: `High GPU memory usage: ${(metadata.gpuPeakUsage / 1024).toFixed(1)}GB peak detected`,
        suggestedAction: 'Reduce batch size or disable some GPU-intensive features',
        confidence: 95,
        timestamp: run.timestamp,
        dismissed: false
      });
    }

    // Long duration performance hint
    if (metadata.totalDuration > 300000) {
      recommendations.push({
        id: `${run.runId}-duration`,
        runId: run.runId,
        type: 'performance',
        severity: 'info',
        message: `Workflow completed in ${(metadata.totalDuration / 1000).toFixed(1)} seconds. Consider optimization opportunities.`,
        suggestedAction: 'Profile slow scenes and optimize node configurations',
        confidence: 70,
        timestamp: run.timestamp,
        dismissed: false
      });
    }

    // Retry pattern detection
    if (metadata.fallbackCount > metadata.sceneCount * 0.3) {
      recommendations.push({
        id: `${run.runId}-retry-pattern`,
        runId: run.runId,
        type: 'retry',
        severity: 'warning',
        message: `High retry rate detected: ${metadata.fallbackCount} of ${metadata.sceneCount} scenes required retries`,
        suggestedAction: 'Increase MaxWaitTime or investigate scene generation failures',
        confidence: 85,
        timestamp: run.timestamp,
        dismissed: false
      });
    }

    return recommendations;
  }

  /**
   * Registers a callback for workflow completion notifications
   */
  public subscribe(id: string, callback: (event: ComfyUIWorkflowEvent) => void): void {
    this.webhookCallbacks.set(id, callback);
  }

  /**
   * Unregisters a workflow completion callback
   */
  public unsubscribe(id: string): void {
    this.webhookCallbacks.delete(id);
  }

  /**
   * Notifies all subscribers of workflow completion
   */
  private notifySubscribers(event: ComfyUIWorkflowEvent): void {
    this.webhookCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in callback subscriber:', error);
      }
    });
  }

  /**
   * Batch processor to periodically check for new workflow completions
   * This is a fallback if webhooks aren't available
   */
  private startBatchProcessor(): void {
    // Initialize queue monitor
    this.queueMonitor = new ComfyUIQueueMonitor('http://127.0.0.1:8188');
    
    // Start polling with 5-second interval
    this.queueMonitor.startPolling(5000, (event) => {
      this.handleWorkflowCompletion(event).catch(error => {
        console.error('Error handling workflow completion from queue monitor:', error);
      });
    });
    
    console.log('✓ Queue Monitor polling started (5s interval)');
  }

  /**
   * Processes pending workflows from ComfyUI queue
   */
  private async processPendingWorkflows(): Promise<void> {
    // This method is now handled by the queue monitor's polling mechanism
    // It's kept for backward compatibility but the polling is done in startBatchProcessor
  }

  /**
   * Manually trigger processing of a workflow event (useful for testing)
   */
  public async processWorkflowEvent(event: ComfyUIWorkflowEvent): Promise<void> {
    await this.handleWorkflowCompletion(event);
  }

  /**
   * Query historical data statistics
   */
  public async getStatistics(): Promise<{
    totalRuns: number;
    averageSuccessRate: number;
    totalFramesGenerated: number;
    averageDuration: number;
  } | null> {
    if (!this.db) return null;

    try {
      const stats = await this.db.getStatistics();
      
      // Calculate total frames from statistics
      // For now, estimate based on average duration and scene data
      // This can be improved by storing frame count in metadata
      const totalFrames = stats.totalScenes * 25; // Estimated average frames per scene
      
      return {
        totalRuns: stats.totalRuns,
        averageSuccessRate: stats.avgSuccessRate,
        totalFramesGenerated: totalFrames,
        averageDuration: stats.avgDuration
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return null;
    }
  }
}

/**
 * Creates a workflow event from ComfyUI queue history
 * Helper function to construct events from various data sources
 */
export function createWorkflowEvent(
  runId: string,
  sceneData: any[],
  systemStats: any
): ComfyUIWorkflowEvent {
  const now = Date.now();
  
  return {
    runId,
    timestamp: now,
    startTime: now - 60000, // Assume 1 minute workflow
    endTime: now,
    totalDurationMs: 60000,
    status: 'success',
    scenes: sceneData.map((scene, idx) => ({
      sceneId: scene.sceneId || `scene-${idx}`,
      sceneName: scene.name,
      frameCount: scene.frameCount || 0,
      durationMs: scene.duration || 0,
      attempts: scene.attempts || 1,
      status: scene.status || 'success',
      gpuVramBefore: systemStats?.devices?.[0]?.vram_total || 0,
      timestamp: now
    }))
  };
}

// Export singleton instance
let callbackManagerInstance: ComfyUICallbackManager | null = null;

export async function getCallbackManager(
  database: RunHistoryDatabase
): Promise<ComfyUICallbackManager> {
  if (!callbackManagerInstance) {
    callbackManagerInstance = new ComfyUICallbackManager();
    await callbackManagerInstance.initialize(database);
  }
  return callbackManagerInstance;
}
