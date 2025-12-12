import { usePipelineStore } from './pipelineStore';
import type { PipelineTask } from '../types/pipeline';
import { TaskRegistry } from './pipelineTaskRegistry';

const assertNever = (_value: never): never => {
  throw new Error('Unhandled PipelineTask variant');
};

export class PipelineEngine {
  private static instance: PipelineEngine;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private constructor() {}

  public static getInstance(): PipelineEngine {
    if (!PipelineEngine.instance) {
      PipelineEngine.instance = new PipelineEngine();
    }
    return PipelineEngine.instance;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollingInterval = setInterval(() => this.processPipelines(), 1000);
    console.log('[PipelineEngine] Started');
  }

  public stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
    console.log('[PipelineEngine] Stopped');
  }

  private async processPipelines() {
    const store = usePipelineStore.getState();
    const activePipelineId = store.activePipelineId;

    if (!activePipelineId) return;

    const pipeline = store.pipelines[activePipelineId];
    if (!pipeline || pipeline.status !== 'active') return;

    const allTasks = Object.values(pipeline.tasks);

    const anyFailed = allTasks.some(t => t.status === 'failed');
    const anyCancelled = allTasks.some(t => t.status === 'cancelled');

    // Check for completion (including cancellations as terminal states)
    const allTerminal = allTasks.every(
      t => t.status === 'completed' || t.status === 'skipped' || t.status === 'cancelled'
    );
    if (allTerminal) {
      const finalStatus: 'completed' | 'failed' | 'cancelled' = anyFailed
        ? 'failed'
        : anyCancelled
          ? 'cancelled'
          : 'completed';

      store.updatePipelineStatus(pipeline.id, finalStatus);
      store.setActivePipeline(null);
      console.log(`[PipelineEngine] Pipeline ${pipeline.id} ${finalStatus}`);
      return;
    }

    // Check for failure/stuck state
    const pendingTasks = allTasks.filter(t => t.status === 'pending');
    const runningTasks = allTasks.filter(t => t.status === 'running');

    // If we have failures/cancellations and no tasks are running, check if we can proceed
    const anyFailedOrCancelled = anyFailed || anyCancelled;
    if (anyFailedOrCancelled && runningTasks.length === 0) {
        const canRunAny = pendingTasks.some(task => {
             const deps = task.dependencies.map(depId => pipeline.tasks[depId]);
             return deps.every(d => d && (d.status === 'completed' || d.status === 'skipped'));
        });

        if (!canRunAny) {
             const finalStatus: 'failed' | 'cancelled' = anyFailed ? 'failed' : 'cancelled';
             store.updatePipelineStatus(pipeline.id, finalStatus);
             store.setActivePipeline(null);
             console.log(`[PipelineEngine] Pipeline ${pipeline.id} ${finalStatus} due to task failures/cancellations`);
             return;
        }
    }

    // Find runnable tasks
    const runnableTasks = pendingTasks.filter(task => {
      // Check dependencies
      const deps = task.dependencies.map(depId => pipeline.tasks[depId]);
      const depsMet = deps.every(d => d && (d.status === 'completed' || d.status === 'skipped'));
      return depsMet;
    });

    // Execute tasks in parallel (GenerationQueue handles resource limits)
    for (const task of runnableTasks) {
      // Fire and forget - executeTask handles state updates
      this.executeTask(pipeline.id, task);
    }
  }

  private async executeTask(pipelineId: string, task: PipelineTask) {
    const store = usePipelineStore.getState();
    const pipeline = store.pipelines[pipelineId];
    
    if (!pipeline) {
        console.error(`[PipelineEngine] Pipeline ${pipelineId} not found during task execution`);
        return;
    }
    
    // Resolve dependencies
    const dependencies: Record<string, PipelineTask> = {};
    task.dependencies.forEach(depId => {
        const depTask = pipeline.tasks[depId];
        if (depTask) {
            dependencies[depId] = depTask;
        }
    });
    
    // Mark as running immediately to prevent double-scheduling
    store.updateTaskStatus(pipelineId, task.id, 'running');
    console.log(`[PipelineEngine] Executing task ${task.id} (${task.type})`);

    try {
      let result: PipelineTask['output'];

      // Avoid indexing TaskRegistry with a union key (causes `never` params). Narrow by task type.
      switch (task.type) {
        case 'generate_keyframe':
          result = await TaskRegistry.generate_keyframe(task, { dependencies });
          break;
        case 'generate_video':
          result = await TaskRegistry.generate_video(task, { dependencies });
          break;
        case 'upscale_video':
          result = await TaskRegistry.upscale_video(task, { dependencies });
          break;
        case 'interpolate_video':
          result = await TaskRegistry.interpolate_video(task, { dependencies });
          break;
        case 'export_timeline':
          result = await TaskRegistry.export_timeline(task, { dependencies });
          break;
        case 'generic_action':
          result = await TaskRegistry.generic_action(task, { dependencies });
          break;
        default:
          return assertNever(task);
      }
      
      store.updateTaskStatus(pipelineId, task.id, 'completed', result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PipelineEngine] Task ${task.id} failed:`, error);

      const maxRetries = task.maxRetries ?? 0;
      if (maxRetries > 0 && task.retryCount < maxRetries) {
        console.warn(
          `[PipelineEngine] Retrying task ${task.id} (${task.retryCount + 1}/${maxRetries}): ${message}`
        );
        store.retryTask(pipelineId, task.id, message);
        return;
      }

      store.updateTaskStatus(pipelineId, task.id, 'failed', undefined, message);
      
      // Optional: Fail pipeline on error
      // store.updatePipelineStatus(pipelineId, 'failed');
    }
  }
}

export const pipelineEngine = PipelineEngine.getInstance();
