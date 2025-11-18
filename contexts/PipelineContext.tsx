/**
 * Pipeline Context
 * 
 * React Context for managing story-to-video generation pipeline state
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PipelineProgressEvent, PipelineResult } from '../services/pipelineOrchestrator';
import { generateStoryToVideo, StoryToVideoResult } from '../services/storyToVideoPipeline';
import { useMediaGenerationActions } from './MediaGenerationProviderContext';
import { useLocalGenerationSettings } from './LocalGenerationSettingsContext';

/**
 * Context state interface
 */
export interface PipelineContextType {
  // State
  isGenerating: boolean;
  progress: PipelineProgressEvent | null;
  result: PipelineResult | null;
  error: Error | null;
  history: PipelineResult[];

  // Actions
  generateStoryToVideo: (prompt: string, genre: string) => Promise<void>;
  cancelGeneration: () => void;
  clearError: () => void;
  clearHistory: () => void;
  clearResult: () => void;
}

/**
 * Create context
 */
const PipelineContext = createContext<PipelineContextType | null>(null);

/**
 * Provider component
 */
export const PipelineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [history, setHistory] = useState<PipelineResult[]>([]);
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null);

  const generateStoryToVideo = async (prompt: string, genre: string) => {
    if (isGenerating) {
      console.warn('Generation already in progress');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      const mediaActions = useMediaGenerationActions();
      const { settings: localSettings } = useLocalGenerationSettings();

      const result = await generateStoryToVideo(prompt, genre, {
        mediaActions,
        localSettings,
        logApiCall: () => {}, // TODO: Wire up proper logging
        onStateChange: (status, message) => {
          setProgress({
            stage: status === 'loading' ? 'story-generation' : 'rendering',
            progress: status === 'loading' ? 20 : 60,
            message,
            timestamp: Date.now(),
          });
        },
        onProgress: (sceneId, update) => {
          setProgress({
            stage: 'rendering',
            progress: update.progress,
            message: update.message,
            timestamp: Date.now(),
          });
        }
      });

      // Convert StoryToVideoResult to PipelineResult format
      const pipelineResult: PipelineResult = {
        id: result.storyId,
        prompt,
        genre,
        storyId: result.storyId,
        scenes: result.scenes.map(scene => ({
          id: scene.id,
          title: scene.title,
          description: scene.summary,
          videoPath: scene.videoPath,
          status: scene.status === 'complete' ? 'complete' : scene.status === 'failed' ? 'failed' : 'pending'
        })),
        videoFrames: result.scenes.map(scene => ({
          sceneId: scene.id,
          frameCount: 25, // Default assumption
          duration: 1000 // Default 1 second
        })),
        totalDuration: result.totalDuration,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        status: result.status === 'complete' ? 'complete' : result.status === 'failed' ? 'failed' : 'in-progress'
      };

      setCurrentPipelineId(result.storyId);
      setResult(pipelineResult);
      setHistory((prev) => [pipelineResult, ...prev]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setProgress({
        stage: 'error',
        progress: 0,
        message: error.message,
        timestamp: Date.now(),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const cancelGeneration = () => {
    if (currentPipelineId) {
      const orchestrator = getPipelineOrchestrator();
      orchestrator.cancelPipeline(currentPipelineId);
      setIsGenerating(false);
      setCurrentPipelineId(null);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const clearResult = () => {
    setResult(null);
  };

  const value: PipelineContextType = {
    isGenerating,
    progress,
    result,
    error,
    history,
    generateStoryToVideo,
    cancelGeneration,
    clearError,
    clearHistory,
    clearResult,
  };

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
};

/**
 * Hook to use pipeline context
 */
export const usePipeline = (): PipelineContextType => {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipeline must be used within PipelineProvider');
  }
  return context;
};
