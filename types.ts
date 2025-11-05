import { ReactNode } from "react";

export interface AnalysisResult {
  feedback: string;
  improvement_prompt: string;
}

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
  transitions: string[]; // This will now represent the transitions between shots
}

export type ShotEnhancers = Record<string, Partial<Omit<CreativeEnhancers, 'transitions'>>>;

export interface TimelineData {
    shots: Shot[];
    shotEnhancers: ShotEnhancers;
    transitions: string[];
    negativePrompt: string;
    positiveEnhancers?: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

export interface ControlSectionConfig {
    id: keyof Omit<CreativeEnhancers, 'transitions' | 'plotEnhancements'>;
    title: string;
    icon: ReactNode;
    options: string[];
}

// Types for AI Co-Director Suggestions
export type SuggestionPayload = Partial<Shot> & { enhancers?: ShotEnhancers[string] } & { type?: string };

export interface Suggestion {
  type: 'UPDATE_SHOT' | 'ADD_SHOT_AFTER' | 'UPDATE_TRANSITION';
  shot_id?: string;
  after_shot_id?: string;
  transition_index?: number;
  payload: SuggestionPayload;
  description: string; // Human-readable description of the change
}

export interface CoDirectorResult {
  thematic_concept: string;
  reasoning: string;
  suggested_changes: Suggestion[];
}