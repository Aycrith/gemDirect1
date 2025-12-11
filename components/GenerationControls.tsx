/**
 * GenerationControls Component
 *
 * Provides UI controls for generating videos from timeline shots.
 * Integrates with ComfyUI video generation via generateVideoFromShot().
 *
 * Features:
 * - Generate single shot video
 * - Generate all timeline videos (batch)
 * - Progress tracking per shot
 * - Error handling and recovery
 * - Keyframe image selection
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Shot,
  TimelineData,
  LocalGenerationSettings,
  LocalGenerationStatus as LocalGenerationStatusType,
} from "../types";
import {
  generateVideoFromShot,
  generateTimelineVideos,
} from "../services/comfyUIService";
import LocalGenerationStatus from "./LocalGenerationStatus";
import ClapperboardIcon from "./icons/ClapperboardIcon";
import CheckCircleIcon from "./icons/CheckCircleIcon";
import AlertTriangleIcon from "./icons/AlertTriangleIcon";
import QueueStatusIndicator from "./QueueStatusIndicator";
import { getFeatureFlag } from "../utils/featureFlags";

interface Props {
  timeline: TimelineData;
  directorsVision: string;
  settings: LocalGenerationSettings;
  keyframeImages?: Record<string, string>;
  onGenerationStart?: () => void;
  onGenerationComplete?: (results: Record<string, any>) => void;
  onError?: (error: Error) => void;
  generateShotVideo?: typeof generateVideoFromShot;
  generateTimelineVideo?: typeof generateTimelineVideos;
}

interface GenerationState {
  [shotId: string]: LocalGenerationStatusType;
}

/**
 * GenerationControls - Main component for video generation UI
 */
const GenerationControls: React.FC<Props> = ({
  timeline,
  directorsVision,
  settings,
  keyframeImages = {},
  onGenerationStart,
  onGenerationComplete,
  onError,
  generateShotVideo = generateVideoFromShot,
  generateTimelineVideo = generateTimelineVideos,
}) => {
  // State management
  const [generationStates, setGenerationStates] = useState<GenerationState>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const shotLifecycleRef = useRef<Record<string, { queuedSeen: boolean }>>({});

  // Memoized shot list with enhancers
  // Optimization: Only recompute when shots array reference or shotEnhancers object reference changes
  // Note: timeline.shots is an array, so we depend on it directly.
  const shotsWithEnhancers = useMemo(
    () =>
      timeline.shots.map((shot) => ({
        shot,
        enhancers: timeline.shotEnhancers[shot.id],
      })),
    [timeline.shots, timeline.shotEnhancers],
  );

  // Update generation status for a shot
  const updateShotStatus = useCallback(
    (shotId: string, status: Partial<LocalGenerationStatusType>) => {
      setGenerationStates((prev) => {
        const nextState: GenerationState = {
          ...prev,
          [shotId]: {
            status: prev[shotId]?.status || "idle",
            message: "",
            progress: 0,
            ...prev[shotId],
            ...status,
          },
        };

        const completedCount = Object.values(nextState).filter(
          (s: LocalGenerationStatusType) => s.status === "complete",
        ).length;
        const totalShots = timeline.shots.length;
        const progressValue =
          totalShots > 0 ? Math.round((completedCount / totalShots) * 100) : 0;
        setBatchProgress(progressValue);

        return nextState;
      });
    },
    [timeline.shots.length],
  );

  const initializeShotLifecycle = useCallback((shotId: string) => {
    shotLifecycleRef.current[shotId] = { queuedSeen: false };
  }, []);

  const resetShotLifecycle = useCallback((shotId: string) => {
    delete shotLifecycleRef.current[shotId];
  }, []);

  const clearAllShotLifecycles = useCallback(() => {
    shotLifecycleRef.current = {};
  }, []);

  const handleShotProgress = useCallback(
    (shotId: string, update: Partial<LocalGenerationStatusType>) => {
      const lifecycle = shotLifecycleRef.current[shotId] ?? {
        queuedSeen: false,
      };
      if (!shotLifecycleRef.current[shotId]) {
        shotLifecycleRef.current[shotId] = lifecycle;
      }

      if (!lifecycle.queuedSeen) {
        if (update.status === "error") {
          updateShotStatus(shotId, update);
          resetShotLifecycle(shotId);
          return;
        }

        if (update.status === "queued") {
          updateShotStatus(shotId, update);
          const unlockByQueuePosition =
            typeof update.queue_position === "number" ||
            (typeof update.message === "string" &&
              /in queue/i.test(update.message));
          if (unlockByQueuePosition) {
            lifecycle.queuedSeen = true;
          }
          return;
        }

        if (
          typeof update.message === "string" &&
          /low vram/i.test(update.message)
        ) {
          updateShotStatus(shotId, {
            ...update,
            status: "queued",
          });
        }
        return;
      }

      if (update.status === "queued") {
        updateShotStatus(shotId, update);
        return;
      }

      updateShotStatus(shotId, update);

      if (update.status === "complete" || update.status === "error") {
        resetShotLifecycle(shotId);
      }
    },
    [resetShotLifecycle, updateShotStatus],
  );

  // Generate video for a single shot
  const handleGenerateShotVideo = useCallback(
    async (shot: Shot) => {
      try {
        // Notify start
        initializeShotLifecycle(shot.id);
        updateShotStatus(shot.id, {
          status: "queued",
          message: "Initializing video generation...",
          progress: 0,
        });
        onGenerationStart?.();

        // Get enhancers for this shot
        const enhancers = timeline.shotEnhancers[shot.id];
        const keyframe = keyframeImages[shot.id] || null;

        // Generate video
        const result = await generateShotVideo(
          settings,
          shot,
          enhancers,
          directorsVision,
          keyframe,
          (progressUpdate) => {
            handleShotProgress(shot.id, progressUpdate);
          },
        );

        // Success
        updateShotStatus(shot.id, {
          status: "complete",
          message: `✅ Video generated: ${result.filename}`,
          progress: 100,
          final_output: {
            type: "video",
            data: result.videoPath,
            filename: result.filename,
          },
        });

        onGenerationComplete?.({ [shot.id]: result });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        updateShotStatus(shot.id, {
          status: "error",
          message: `❌ Generation failed: ${errorMessage}`,
          progress: 0,
        });

        resetShotLifecycle(shot.id);

        onError?.(error as Error);
      }
    },
    [
      timeline.shotEnhancers,
      keyframeImages,
      settings,
      directorsVision,
      updateShotStatus,
      onGenerationStart,
      onGenerationComplete,
      onError,
      generateShotVideo,
      handleShotProgress,
      initializeShotLifecycle,
      resetShotLifecycle,
    ],
  );

  // Generate videos for all shots in timeline
  const handleGenerateAllVideos = useCallback(async () => {
    if (isGeneratingAll) {
      return; // Already generating
    }

    try {
      setIsGeneratingAll(true);
      onGenerationStart?.();

      // Initialize all shots to queued
      timeline.shots.forEach((shot) => {
        initializeShotLifecycle(shot.id);
        updateShotStatus(shot.id, {
          status: "queued",
          message: "Initializing video generation...",
          progress: 0,
        });
      });

      // Generate all videos
      const results = await generateTimelineVideo(
        settings,
        timeline,
        directorsVision,
        "",
        keyframeImages,
        handleShotProgress,
      );

      // All complete
      setIsGeneratingAll(false);
      setBatchProgress(100);
      onGenerationComplete?.(results);
    } catch (error) {
      setIsGeneratingAll(false);
      const errorMessage =
        error instanceof Error ? error.message : "Batch generation failed";

      timeline.shots.forEach((shot) => {
        updateShotStatus(shot.id, {
          status: "error",
          message: `Batch error: ${errorMessage}`,
        });
        resetShotLifecycle(shot.id);
      });

      onError?.(error as Error);
    }
  }, [
    isGeneratingAll,
    timeline,
    settings,
    directorsVision,
    keyframeImages,
    updateShotStatus,
    onGenerationStart,
    onGenerationComplete,
    onError,
    generateTimelineVideo,
    handleShotProgress,
    initializeShotLifecycle,
    resetShotLifecycle,
  ]);

  // Clear status for a shot
  const clearShotStatus = useCallback(
    (shotId: string) => {
      setGenerationStates((prev) => {
        const updated = { ...prev };
        delete updated[shotId];
        return updated;
      });
      resetShotLifecycle(shotId);
    },
    [resetShotLifecycle],
  );

  // Compute UI state
  const hasErrors = Object.values(generationStates).some(
    (state: LocalGenerationStatusType) => state.status === "error",
  );

  return (
    <div className="space-y-4">
      {/* Header with batch controls */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <ClapperboardIcon className="w-5 h-5 text-amber-500" />
          Video Generation
        </h2>

        {settings.useMockLLM && (
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 flex items-center gap-2 text-amber-200 text-sm">
            <AlertTriangleIcon className="w-4 h-4" />
            <span>Mock LLM Mode Active - Stories will be simulated</span>
          </div>
        )}

        {/* Queue Status Indicator - shown when useGenerationQueue flag is enabled */}
        {getFeatureFlag(settings.featureFlags, "useGenerationQueue") && (
          <QueueStatusIndicator />
        )}

        {/* Batch progress bar */}
        {isGeneratingAll && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-300">Batch Progress</span>
              <span className="text-amber-400 font-semibold">
                {batchProgress}%
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-400 h-full transition-all duration-500"
                style={{ width: `${batchProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Control buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleGenerateAllVideos}
            disabled={isGeneratingAll || timeline.shots.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              isGeneratingAll
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white active:scale-95"
            }`}
          >
            <CheckCircleIcon className="w-4 h-4" />
            Generate All ({timeline.shots.length})
          </button>

          {isGeneratingAll && (
            <button
              onClick={() => setIsGeneratingAll(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white transition-all active:scale-95"
            >
              <AlertTriangleIcon className="w-4 h-4" />
              Stop
            </button>
          )}

          {hasErrors && (
            <button
              onClick={() => {
                setGenerationStates({});
                clearAllShotLifecycles();
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-all active:scale-95"
            >
              <AlertTriangleIcon className="w-4 h-4" />
              Clear Errors
            </button>
          )}
        </div>
      </div>

      {/* Shot-by-shot generation UI */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {shotsWithEnhancers.map(({ shot, enhancers }) => {
          const shotStatus = generationStates[shot.id];

          return (
            <div
              key={shot.id}
              className="p-4 border border-gray-700 rounded-lg bg-gray-900/50 hover:border-gray-600 transition-colors"
            >
              {/* Shot info */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-100">
                    {shot.title || `Shot ${shot.id}`}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {shot.description}
                  </p>

                  {/* Enhancers display */}
                  {enhancers && Object.keys(enhancers).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(enhancers).map(([key, values]) => {
                        if (Array.isArray(values) && values.length > 0) {
                          return (
                            <span
                              key={key}
                              className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded"
                            >
                              {key}: {values.slice(0, 2).join(", ")}
                              {values.length > 2 ? "..." : ""}
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>

                {/* Generate button for single shot */}
                {!shotStatus || shotStatus.status === "idle" ? (
                  <button
                    onClick={() => handleGenerateShotVideo(shot)}
                    disabled={isGeneratingAll}
                    className="ml-3 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate
                  </button>
                ) : null}
              </div>

              {/* Status display */}
              {shotStatus && shotStatus.status !== "idle" && (
                <LocalGenerationStatus
                  status={shotStatus}
                  onClear={() => clearShotStatus(shot.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {timeline.shots.length === 0 && (
        <div className="p-6 text-center border border-gray-700 rounded-lg bg-gray-900/50">
          <p className="text-gray-400">
            No shots in timeline. Add shots to generate videos.
          </p>
        </div>
      )}
    </div>
  );
};

export default React.memo(GenerationControls);
