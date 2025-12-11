export type PipelineTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export type PipelineTaskType = 
  | 'generate_keyframe' 
  | 'generate_video' 
  | 'upscale_video' 
  | 'interpolate_video'
  | 'export_timeline'
  | 'generic_action';

export interface PipelineTask {
  id: string;
  type: PipelineTaskType;
  label: string;
  status: PipelineTaskStatus;
  dependencies: string[]; // IDs of tasks that must complete first
  payload: any; // Data required for the task
  output?: any; // Result of the task
  error?: string;
  retryCount: number;
  maxRetries?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type PipelineStatus = 'active' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface Pipeline {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: PipelineStatus;
  tasks: Record<string, PipelineTask>;
  metadata?: Record<string, any>;
}

export interface PipelineState {
  pipelines: Record<string, Pipeline>;
  activePipelineId: string | null;
}
