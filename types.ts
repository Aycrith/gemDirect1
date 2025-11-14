import { ReactNode } from "react";

export interface Shot {
  id: string;
  title?: string;
  description: string;
}

export interface CreativeEnhancers {
  framing: string[];
  movement: string[];
  lens: string[];
  pacing: string[];
  lighting: string[];
  mood: string[];
  vfx: string[];
  plotEnhancements: string[];
  transitions: string[];
}

export type ShotEnhancers = Record<string, Partial<Omit<CreativeEnhancers, 'transitions'>>>;

export interface TimelineData {
    shots: Shot[];
    shotEnhancers: ShotEnhancers;
    transitions: string[];
    negativePrompt: string;
}

export interface Scene {
    id: string;
    title: string;
    summary: string;
    timeline: TimelineData;
    generatedPayload?: { json: string; text: string; structured: any[]; negativePrompt: string };
}

export interface StoryBible {
    logline: string;
    characters: string;
    setting: string;
    plotOutline: string;
}

export type WorkflowStage = 'idea' | 'bible' | 'vision' | 'director' | 'continuity';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

export interface PlanExpansionStrategy {
  id: string;
  label: string;
  description?: string;
  isAvailable: boolean;
  isDefault?: boolean;
  disabledReason?: string;
}

export interface MediaGenerationProviderCapabilities {
  images: boolean;
  video: boolean;
}

export interface MediaGenerationProvider {
  id: string;
  label: string;
  description?: string;
  isAvailable: boolean;
  isDefault?: boolean;
  disabledReason?: string;
  capabilities: MediaGenerationProviderCapabilities;
}

export interface ControlSectionConfig {
    id: keyof Omit<CreativeEnhancers, 'transitions' | 'plotEnhancements'>;
    title: string;
    icon: ReactNode;
    options: string[];
}

export type SuggestionPayload = Partial<Shot> & { enhancers?: ShotEnhancers[string] } & { type?: string };

// --- Discriminated Union for Suggestions ---
export interface UpdateShotSuggestion { type: 'UPDATE_SHOT'; shot_id: string; payload: SuggestionPayload; description: string; }
export interface AddShotAfterSuggestion { type: 'ADD_SHOT_AFTER'; after_shot_id: string; payload: SuggestionPayload; description: string; }
export interface UpdateTransitionSuggestion { type: 'UPDATE_TRANSITION'; transition_index: number; payload: SuggestionPayload; description: string; }
export interface UpdateStoryBibleSuggestion { type: 'UPDATE_STORY_BIBLE'; payload: { field: keyof StoryBible; new_content: string }; description: string; }
export interface UpdateDirectorsVisionSuggestion { type: 'UPDATE_DIRECTORS_VISION'; payload: { new_content: string }; description: string; }
export interface FlagSceneForReviewSuggestion { type: 'FLAG_SCENE_FOR_REVIEW'; payload: { scene_id: string; reason: string }; description: string; }

export type Suggestion =
    | UpdateShotSuggestion
    | AddShotAfterSuggestion
    | UpdateTransitionSuggestion
    | UpdateStoryBibleSuggestion
    | UpdateDirectorsVisionSuggestion
    | FlagSceneForReviewSuggestion;
// --- End Discriminated Union ---


export interface CoDirectorResult {
  thematic_concept: string;
  reasoning: string;
  suggested_changes: Suggestion[];
}

export interface ContinuityResult {
  scores: {
    narrative_coherence: number;
    aesthetic_alignment: number;
    thematic_resonance: number;
  };
  overall_feedback: string;
  suggested_changes: Suggestion[];
}

export interface SceneContinuityData {
  videoFile?: File;
  videoSrc?: string;
  status: 'idle' | 'analyzing' | 'scoring' | 'complete' | 'error';
  error?: string;
  videoAnalysis?: string;
  continuityResult?: ContinuityResult;
  frames?: string[];
}

export interface BatchShotTask {
    shot_id: string;
    description: string;
    actions: Array<'REFINE_DESCRIPTION' | 'SUGGEST_ENHANCERS'>;
}

export interface BatchShotResult {
    shot_id: string;
    refined_description?: string;
    suggested_enhancers?: Partial<Omit<CreativeEnhancers, 'transitions'>>;
}

export interface DetailedShotResult {
    description: string;
    suggested_enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
}

export interface ApiCallLog {
    id: number;
    timestamp: number;
    context: string;
    model: string;
    tokens: number;
    status: 'success' | 'error';
}

export interface WorkflowInput {
    nodeId: string;
    nodeType: string;
    nodeTitle?: string;
    inputName: string;
    inputType: string; // e.g., 'STRING', 'IMAGE'
}

export type MappableData = 'none' | 'human_readable_prompt' | 'full_timeline_json' | 'keyframe_image' | 'negative_prompt';

// Key is `${nodeId}:${inputName}`
export type WorkflowMapping = Record<string, MappableData>; 

export interface LocalGenerationSettings {
    comfyUIUrl: string;
    comfyUIClientId: string;
    workflowJson: string; // Will store the FETCHED workflow
    mapping: WorkflowMapping;
}

export interface LocalGenerationAsset {
    type: 'image' | 'video';
    data: string;
    filename: string;
}

export interface LocalGenerationOutput extends LocalGenerationAsset {
    images?: string[];
    videos?: string[];
    assets?: LocalGenerationAsset[];
}

export interface LocalGenerationStatus {
    status: 'idle' | 'queued' | 'running' | 'complete' | 'error';
    message: string;
    progress: number; // 0-100
    queue_position?: number;
    node_title?: string;
    final_output?: LocalGenerationOutput;
}

export type SceneGenerationStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface SceneStatus {
  sceneId: string;
  title: string;
  status: SceneGenerationStatus;
  progress: number; // 0-100
  error?: string;
  startTime?: number;
  endTime?: number;
}
