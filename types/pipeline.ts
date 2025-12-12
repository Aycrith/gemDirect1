import type { Scene, VisualBible } from '../types';
import type { InterpolationConfig, UpscaleConfig } from '../services/videoUpscalingService';

export type PipelineTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export type PipelineTaskType =
  | 'generate_keyframe'
  | 'generate_video'
  | 'upscale_video'
  | 'interpolate_video'
  | 'export_timeline'
  | 'generic_action';

export interface PipelineAsset {
  type: 'image' | 'video';
  data: string;
  filename: string;
}

/**
 * Normalized task output used by pipeline tasks.
 *
 * Note: `metadata` is intentionally `unknown` so tasks can attach structured diagnostics
 * without resorting to `any`.
 */
export interface PipelineMediaOutput {
  images?: string[];
  videos?: string[];
  assets?: PipelineAsset[];
  metadata?: unknown;
}

export interface GenerateKeyframeTaskPayload {
  sceneId?: string;
  shotId?: string;
  prompt: string;
  negativePrompt?: string;
  workflowProfileId?: string;
}

export interface GenerateVideoTaskPayload {
  sceneId?: string;
  shotId?: string;
  prompt: string;
  negativePrompt?: string;
  workflowProfileId?: string;
  /** Optional pre-generated keyframe image (data URL or raw base64). */
  keyframeImage?: string;
  /** Optional: Visual Bible/IP-adapter context for character consistency. */
  visualBible?: VisualBible;
  scene?: Scene;
  characterReferenceImages?: Record<string, string>;
}

export interface UpscaleVideoTaskPayload {
  /** Optional explicit input video path/URL; can be resolved from dependencies. */
  videoPath?: string;
  config?: Partial<UpscaleConfig>;
}

export interface InterpolateVideoTaskPayload {
  /** Optional explicit input video path/URL; can be resolved from dependencies. */
  videoPath?: string;
  config?: Partial<InterpolationConfig>;
}

export interface ExportTimelineTaskPayload {
  // reserved
}

export interface GenericActionTaskPayload {
  // reserved
}

export type PipelineTaskPayloadMap = {
  generate_keyframe: GenerateKeyframeTaskPayload;
  generate_video: GenerateVideoTaskPayload;
  upscale_video: UpscaleVideoTaskPayload;
  interpolate_video: InterpolateVideoTaskPayload;
  export_timeline: ExportTimelineTaskPayload;
  generic_action: GenericActionTaskPayload;
};

export type PipelineTaskOutputMap = {
  generate_keyframe: PipelineMediaOutput;
  generate_video: PipelineMediaOutput;
  upscale_video: PipelineMediaOutput;
  interpolate_video: PipelineMediaOutput;
  // Use `undefined` (not `void`) so unions behave well in discriminated task updates.
  export_timeline: undefined;
  generic_action: undefined;
};

/** Union of all possible task outputs stored on tasks. */
export type PipelineTaskOutput = PipelineTaskOutputMap[PipelineTaskType];

export type PipelineTaskOf<TType extends PipelineTaskType> = {
  id: string;
  type: TType;
  label: string;
  status: PipelineTaskStatus;
  dependencies: string[];
  payload: PipelineTaskPayloadMap[TType];
  // Stored output is intentionally a union to keep store updates ergonomic.
  // Executors still return the precise output for their task type.
  output?: PipelineTaskOutput;
  error?: string;
  retryCount: number;
  maxRetries?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
};

export type PipelineTask = {
  [TType in PipelineTaskType]: PipelineTaskOf<TType>;
}[PipelineTaskType];

export type PipelineStatus = 'active' | 'completed' | 'failed' | 'paused' | 'cancelled';

export interface Pipeline {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: PipelineStatus;
  tasks: Record<string, PipelineTask>;
  metadata?: Record<string, unknown>;
}

export interface PipelineState {
  pipelines: Record<string, Pipeline>;
  activePipelineId: string | null;
}
