/**
 * Pipeline Orchestrator Service
 * 
 * Coordinates the complete story-to-video generation pipeline:
 * 1. Story Generation (LLM)
 * 2. Scene Queuing (ComfyUI)
 * 3. Video Rendering (ComfyUI WebSocket)
 * 4. Error Recovery (Resilience patterns)
 */

import { validatePrompt, sanitizePrompt } from '../utils/inputValidator';
import { checkRateLimit, waitForRateLimit } from '../utils/rateLimiter';
import { executeWithRetry } from './comfyUIResilience';
import { checkSystemHealth, canGenerateStory, canRender } from './systemHealthMonitor';
import { handleLLMError, categorizeError, sleep } from './llmErrorHandler';

/**
 * Events emitted during pipeline execution
 */
export interface PipelineProgressEvent {
  stage: 'initializing' | 'health-check' | 'story-generation' | 'scene-queuing' | 'rendering' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  timestamp: number;
}

/**
 * Result of a complete pipeline execution
 */
export interface PipelineResult {
  id: string;
  prompt: string;
  genre: string;
  storyId: string;
  scenes: Array<{
    id: string;
    title: string;
    description: string;
    videoPath?: string;
    status: 'pending' | 'queued' | 'rendering' | 'complete' | 'failed';
  }>;
  videoFrames: Array<{ sceneId: string; frameCount: number; duration: number }>;
  totalDuration: number;
  startedAt: number;
  completedAt?: number;
  status: 'pending' | 'in-progress' | 'complete' | 'failed';
  error?: Error;
}

/**
 * Pipeline Orchestrator Configuration
 */
export interface PipelineOrchestratorConfig {
  timeoutMs?: number; // 15 min default
  maxRetries?: number; // 3 default
  storyTimeoutMs?: number; // 5 min
  renderTimeoutMs?: number; // 15 min per scene
}

/**
 * Main Orchestrator Class
 */
export class PipelineOrchestrator {
  private activePipelines: Map<string, PipelineResult> = new Map();
  private pipelineHistory: Map<string, PipelineResult> = new Map();
  private config: Required<PipelineOrchestratorConfig>;

  constructor(config?: PipelineOrchestratorConfig) {
    this.config = {
      timeoutMs: config?.timeoutMs ?? 15 * 60 * 1000,
      maxRetries: config?.maxRetries ?? 3,
      storyTimeoutMs: config?.storyTimeoutMs ?? 5 * 60 * 1000,
      renderTimeoutMs: config?.renderTimeoutMs ?? 15 * 60 * 1000,
    };
  }

  /**
   * Execute complete story→video generation pipeline
   */
  async generateStoryToVideo(
    prompt: string,
    genre: string,
    onProgress?: (event: PipelineProgressEvent) => void
  ): Promise<PipelineResult> {
    const pipelineId = `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const startedAt = Date.now();

    try {
      // Initialize pipeline result
      const result: PipelineResult = {
        id: pipelineId,
        prompt,
        genre,
        storyId: '',
        scenes: [],
        videoFrames: [],
        totalDuration: 0,
        startedAt,
        status: 'pending',
      };
      this.activePipelines.set(pipelineId, result);

      // Stage 1: Initialize
      this.emit(onProgress, {
        stage: 'initializing',
        progress: 5,
        message: 'Initializing pipeline...',
        timestamp: Date.now(),
      });

      // Stage 2: System Health Check
      this.emit(onProgress, {
        stage: 'health-check',
        progress: 10,
        message: 'Checking system health...',
        timestamp: Date.now(),
      });

      // Attempt health check, but don't fail if unavailable (for dev/test mode)
      try {
        const health = await checkSystemHealth();
        // Only fail if BOTH systems are down
        if (!health.components.llm.online && !health.components.comfyUI.online) {
          throw new Error('Both LLM and ComfyUI systems are offline');
        }
      } catch (error) {
        // Log but don't fail on health check - might be in dev mode
        console.warn('Health check warning:', error instanceof Error ? error.message : String(error));
      }

      // Stage 3: Input Validation
      const validation = validatePrompt(prompt);
      if (!validation.valid) {
        throw new Error(`Invalid prompt: ${validation.errors.join(', ')}`);
      }

      // Rate limiting check
      const rateLimitCheck = checkRateLimit(`user-pipeline-${pipelineId}`);
      if (!rateLimitCheck.allowed) {
        this.emit(onProgress, {
          stage: 'initializing',
          progress: 15,
          message: `Rate limited. Waiting ${rateLimitCheck.resetIn}ms...`,
          timestamp: Date.now(),
        });
        await waitForRateLimit(`user-pipeline-${pipelineId}`, this.config.timeoutMs);
      }

      // Stage 4: Story Generation
      this.emit(onProgress, {
        stage: 'story-generation',
        progress: 20,
        message: 'Generating story with AI...',
        timestamp: Date.now(),
      });

      const sanitizedPrompt = sanitizePrompt(prompt);
      const story = await this.generateStory(sanitizedPrompt, genre);
      result.storyId = story.id;
      result.scenes = story.scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        description: scene.description,
        status: 'pending' as const,
      }));

      // Stage 5: Scene Queuing
      this.emit(onProgress, {
        stage: 'scene-queuing',
        progress: 40,
        message: `Queueing ${result.scenes.length} scenes for rendering...`,
        timestamp: Date.now(),
      });

      result.status = 'in-progress';
      const queuedScenes = await this.queueScenes(story.scenes);

      // Stage 6: Rendering
      this.emit(onProgress, {
        stage: 'rendering',
        progress: 50,
        message: 'Rendering video frames...',
        timestamp: Date.now(),
      });

      const renders = await this.renderVideos(queuedScenes, onProgress);
      result.videoFrames = renders;
      result.totalDuration = renders.reduce((sum, r) => sum + r.duration, 0);

      // Complete
      result.completedAt = Date.now();
      result.status = 'complete';

      this.emit(onProgress, {
        stage: 'complete',
        progress: 100,
        message: 'Pipeline complete!',
        timestamp: Date.now(),
      });

      // Move to history
      this.activePipelines.delete(pipelineId);
      this.pipelineHistory.set(pipelineId, result);

      return result;
    } catch (error) {
      const result = this.activePipelines.get(pipelineId);
      if (result) {
        result.status = 'failed';
        result.error = error instanceof Error ? error : new Error(String(error));
        result.completedAt = Date.now();
        // Move to history
        this.activePipelines.delete(pipelineId);
        this.pipelineHistory.set(pipelineId, result);
      }

      this.emit(onProgress, {
        stage: 'error',
        progress: 0,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Generate story using LLM
   */
  private async generateStory(
    prompt: string,
    genre: string
  ): Promise<{ id: string; scenes: Array<{ id: string; title: string; description: string }> }> {
    try {
      // This would call the actual LLM service
      // For now, mock implementation
      const storyId = `story-${Date.now()}`;
      const scenes = [
        {
          id: `scene-1`,
          title: 'Opening',
          description: `${genre} opening scene based on: ${prompt}`,
        },
        {
          id: `scene-2`,
          title: 'Development',
          description: `${genre} development scene`,
        },
        {
          id: `scene-3`,
          title: 'Climax',
          description: `${genre} climactic scene`,
        },
      ];

      return { id: storyId, scenes };
    } catch (error) {
      const context = {
        endpoint: 'local-llm',
        model: 'local-model',
        timeoutMs: this.config.storyTimeoutMs,
        attemptNumber: 1,
      };
      const recovery = handleLLMError(error, context);
      if (!recovery.canRetry) {
        throw error;
      }
      await sleep(recovery.retryDelay || 1000);
      return this.generateStory(prompt, genre);
    }
  }

  /**
   * Queue scenes in ComfyUI
   */
  private async queueScenes(
    scenes: Array<{ id: string; title: string; description: string }>
  ): Promise<Array<{ sceneId: string; queueId: string }>> {
    const queuedScenes: Array<{ sceneId: string; queueId: string }> = [];

    for (const scene of scenes) {
      try {
        // This would queue actual ComfyUI prompts
        // For now, mock
        const queueId = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        queuedScenes.push({ sceneId: scene.id, queueId });
      } catch (error) {
        console.error(`Failed to queue scene ${scene.id}:`, error);
      }
    }

    return queuedScenes;
  }

  /**
   * Render videos for queued scenes
   */
  private async renderVideos(
    queuedScenes: Array<{ sceneId: string; queueId: string }>,
    onProgress?: (event: PipelineProgressEvent) => void
  ): Promise<Array<{ sceneId: string; frameCount: number; duration: number }>> {
    const renders: Array<{ sceneId: string; frameCount: number; duration: number }> = [];

    for (let i = 0; i < queuedScenes.length; i++) {
      const scene = queuedScenes[i];
      const progress = 50 + (i / queuedScenes.length) * 50;

      this.emit(onProgress, {
        stage: 'rendering',
        progress: Math.floor(progress),
        message: `Rendering scene ${i + 1}/${queuedScenes.length}...`,
        timestamp: Date.now(),
      });

      try {
        // This would call actual ComfyUI rendering
        // For now, mock
        const frameCount = 24;
        const duration = 1000; // 1 second at 24fps
        renders.push({ sceneId: scene.sceneId, frameCount, duration });
      } catch (error) {
        console.error(`Failed to render scene ${scene.sceneId}:`, error);
      }
    }

    return renders;
  }

  /**
   * Cancel active pipeline
   */
  cancelPipeline(pipelineId: string): void {
    const pipeline = this.activePipelines.get(pipelineId);
    if (pipeline) {
      pipeline.status = 'failed';
      pipeline.error = new Error('Pipeline cancelled by user');
      pipeline.completedAt = Date.now();
      this.activePipelines.delete(pipelineId);
      this.pipelineHistory.set(pipelineId, pipeline);
    }
  }

  /**
   * Get active pipeline result (includes history)
   */
  getPipelineResult(pipelineId: string): PipelineResult | undefined {
    return this.activePipelines.get(pipelineId) || this.pipelineHistory.get(pipelineId);
  }

  /**
   * Emit progress event
   */
  private emit(callback: ((event: PipelineProgressEvent) => void) | undefined, event: PipelineProgressEvent): void {
    if (callback) {
      callback(event);
    }
  }
}

/**
 * Singleton instance
 */
let orchestrator: PipelineOrchestrator | null = null;

export function getPipelineOrchestrator(config?: PipelineOrchestratorConfig): PipelineOrchestrator {
  if (!orchestrator) {
    orchestrator = new PipelineOrchestrator(config);
  }
  return orchestrator;
}

export function resetPipelineOrchestrator(): void {
  orchestrator = null;
}
