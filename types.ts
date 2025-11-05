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
    positiveEnhancers?: string;
}

export interface Scene {
    id: string;
    title: string;
    summary: string;
    timeline: TimelineData;
}

export interface StoryBible {
    logline: string;
    characters: string;
    setting: string;
    plotOutline: string;
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

export type SuggestionPayload = Partial<Shot> & { enhancers?: ShotEnhancers[string] } & { type?: string };

export interface Suggestion {
  type: 'UPDATE_SHOT' | 'ADD_SHOT_AFTER' | 'UPDATE_TRANSITION';
  shot_id?: string;
  after_shot_id?: string;
  transition_index?: number;
  payload: SuggestionPayload;
  description: string;
}

export interface CoDirectorResult {
  thematic_concept: string;
  reasoning: string;
  suggested_changes: Suggestion[];
}