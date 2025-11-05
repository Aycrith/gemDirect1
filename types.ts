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
