import { usePipelineStore } from './pipelineStore';
import type { PipelineTask, PipelineTaskType } from '../types/pipeline';
import { TaskRegistry } from './pipelineTaskRegistry';
import { getGenerationQueue, GenerationType } from './generationQueue';

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
    
    // Check for completion
    const allComplete = allTasks.every(t => t.status === 'completed' || t.status === 'skipped');
    if (allComplete) {
      store.updatePipelineStatus(pipeline.id, 'completed');
      store.setActivePipeline(null);
      console.log(`[PipelineEngine] Pipeline ${pipeline.id} completed`);
      return;
    }

    // Check for failure/stuck state
    const anyFailed = allTasks.some(t => t.status === 'failed');
    const pendingTasks = allTasks.filter(t => t.status === 'pending');
    const runningTasks = allTasks.filter(t => t.status === 'running');

    // If we have failures and no tasks are running, check if we can proceed
    if (anyFailed && runningTasks.length === 0) {
        const canRunAny = pendingTasks.some(task => {
             const deps = task.dependencies.map(depId => pipeline.tasks[depId]);
             return deps.every(d => d && (d.status === 'completed' || d.status === 'skipped'));
        });

        if (!canRunAny) {
             store.updatePipelineStatus(pipeline.id, 'failed');
             store.setActivePipeline(null);
             console.log(`[PipelineEngine] Pipeline ${pipeline.id} failed due to task failures`);
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
      const executor = TaskRegistry[task.type];
      if (!executor) {
        throw new Error(`No executor found for task type: ${task.type}`);
      }

      let result;
      
      // Determine if this task needs the GenerationQueue
      if (this.requiresGenerationQueue(task.type)) {
         const queue = getGenerationQueue();
         const genType = this.mapTaskTypeToGenType(task.type);
         
         result = await queue.enqueue({
             id: task.id,
             type: genType,
             priority: 'normal',
             execute: () => executor(task, { dependencies }),
             metadata: { description: task.label }
         });
      } else {
         // Run directly
         result = await executor(task, { dependencies });
      }
      
      store.updateTaskStatus(pipelineId, task.id, 'completed', result);
    } catch (error: any) {
      console.error(`[PipelineEngine] Task ${task.id} failed:`, error);
      store.updateTaskStatus(pipelineId, task.id, 'failed', undefined, error.message);
      
      // Optional: Fail pipeline on error
      // store.updatePipelineStatus(pipelineId, 'failed');
    }
  }

  private requiresGenerationQueue(type: PipelineTaskType): boolean {
      return ['generate_keyframe', 'generate_video', 'upscale_video'].includes(type);
  }

  private mapTaskTypeToGenType(type: PipelineTaskType): GenerationType {
      switch (type) {
          case 'generate_keyframe': return 'keyframe';
          case 'generate_video': return 'video';
          case 'upscale_video': return 'video'; // Upscaling is video work
          default: return 'text';
      }
  }
}

export const pipelineEngine = PipelineEngine.getInstance();
