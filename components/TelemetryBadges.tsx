import React, { useState, useEffect } from 'react';
import { ArtifactSceneMetadata, RealtimeTelemetryUpdate } from '../utils/hooks';

interface TelemetryBadgesProps {
  telemetry?: ArtifactSceneMetadata['Telemetry'];
  realtimeTelemetry?: RealtimeTelemetryUpdate | null;
  isStreaming?: boolean;
  lastUpdate?: number | null;
  title?: string;
}

const TelemetryBadges: React.FC<TelemetryBadgesProps> = ({ 
  telemetry,
  realtimeTelemetry,
  isStreaming = false,
  lastUpdate,
  title = 'Telemetry Metrics'
}) => {
  const [displayDuration, setDisplayDuration] = useState<number | undefined>(telemetry?.DurationSeconds);
  const [displayAttempts, setDisplayAttempts] = useState<number | undefined>(telemetry?.HistoryAttempts);
  const [displayVramFree, setDisplayVramFree] = useState<number | undefined>(telemetry?.GPU?.VramFreeBefore);
  const [lastUpdateTimeAgo, setLastUpdateTimeAgo] = useState<string>('');

  // Update display with real-time data
  useEffect(() => {
    if (realtimeTelemetry) {
      if (realtimeTelemetry.duration !== undefined) {
        setDisplayDuration(realtimeTelemetry.duration);
      }
      if (realtimeTelemetry.attempts !== undefined) {
        setDisplayAttempts(realtimeTelemetry.attempts);
      }
      if (realtimeTelemetry.gpuVramFree !== undefined) {
        setDisplayVramFree(realtimeTelemetry.gpuVramFree);
      }
    }
  }, [realtimeTelemetry]);

  // Update "time ago" display
  useEffect(() => {
    if (!lastUpdate) {
      setLastUpdateTimeAgo('');
      return;
    }

    const updateTimeAgo = () => {
      const nowMs = Date.now();
      const diffMs = nowMs - lastUpdate;
      const diffSecs = Math.floor(diffMs / 1000);
      
      if (diffSecs < 1) {
        setLastUpdateTimeAgo('now');
      } else if (diffSecs < 60) {
        setLastUpdateTimeAgo(`${diffSecs}s ago`);
      } else {
        const mins = Math.floor(diffSecs / 60);
        setLastUpdateTimeAgo(`${mins}m ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Merge real-time and static telemetry for display
  const displayTelemetry = realtimeTelemetry ? {
    ...telemetry,
    DurationSeconds: displayDuration ?? telemetry?.DurationSeconds,
    HistoryAttempts: displayAttempts ?? telemetry?.HistoryAttempts,
    GPU: telemetry?.GPU ? {
      ...telemetry.GPU,
      VramFreeBefore: displayVramFree ?? telemetry.GPU.VramFreeBefore,
    } : undefined,
  } : telemetry;

  if (!displayTelemetry) {
    return (
      <div className="text-sm text-gray-400">
        No telemetry data available
      </div>
    );
  }

  // Helper function to determine status color
  const getStatusColor = (field: string, value: unknown): string => {
    // Errors: red
    if (value === 'error' || value === 'failed' || value === false) {
      return 'bg-red-900/20 text-red-300 border-red-700/50';
    }
    // Fallback warnings: yellow
    if (field === 'FallbackNotes' && value && (Array.isArray(value) ? value.length > 0 : true)) {
      return 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50';
    }
    if (field === 'HistoryPostExecutionTimeoutReached' && value) {
      return 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50';
    }
    // Success: green
    if (value === 'success' || value === true || value === 'true') {
      return 'bg-green-900/20 text-green-300 border-green-700/50';
    }
    // Default: gray
    return 'bg-gray-700/20 text-gray-300 border-gray-600/50';
  };

  const getFeatureColor = (enabled?: boolean): string => {
    if (enabled === true) return 'bg-green-900/20 text-green-300 border-green-700/50';
    if (enabled === false) return 'bg-gray-700/20 text-gray-300 border-gray-600/50';
    return 'bg-gray-700/20 text-gray-300 border-gray-600/50';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        
        {/* Streaming Status Indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-green-400">Streaming</span>
            {lastUpdateTimeAgo && (
              <span className="text-gray-400">({lastUpdateTimeAgo})</span>
            )}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Duration */}
        {displayTelemetry.DurationSeconds !== undefined && (
          <div className={`text-xs p-2 rounded border transition-all ${
            isStreaming ? 'bg-blue-900/30 text-blue-200 border-blue-600 animate-pulse' : 'bg-blue-900/20 text-blue-300 border-blue-700/50'
          }`}>
            <div className="font-semibold">Duration</div>
            <div>{displayTelemetry.DurationSeconds.toFixed(1)}s</div>
          </div>
        )}

        {/* Attempts */}
        {displayTelemetry.HistoryAttempts !== undefined && (
          <div className={`text-xs p-2 rounded border transition-all ${
            isStreaming ? 'bg-gray-700/30 text-gray-200 border-gray-500 animate-pulse' : 'bg-gray-700/20 text-gray-300 border-gray-600/50'
          }`}>
            <div className="font-semibold">Poll Attempts</div>
            <div>{displayTelemetry.HistoryAttempts}</div>
          </div>
        )}

        {/* FLF2V */}
        {displayTelemetry.FLF2VEnabled !== undefined && (
          <div className={`text-xs p-2 rounded border ${getFeatureColor(displayTelemetry.FLF2VEnabled)}`}>
            <div className="font-semibold">FLF2V</div>
            <div>{displayTelemetry.FLF2VEnabled ? 'Enabled' : 'Disabled'}</div>
            {displayTelemetry.FLF2VEnabled && displayTelemetry.FLF2VSource && (
              <div className="text-[10px] text-gray-400">
                source: {displayTelemetry.FLF2VSource}
                {displayTelemetry.FLF2VFallback ? ' (fallback)' : ''}
              </div>
            )}
          </div>
        )}

        {/* Exit Reason */}
        {displayTelemetry.HistoryExitReason && (
          <div className={`text-xs p-2 rounded border ${getStatusColor('HistoryExitReason', displayTelemetry.HistoryExitReason)}`}>
            <div className="font-semibold">Exit Reason</div>
            <div>{displayTelemetry.HistoryExitReason}</div>
          </div>
        )}

        {/* Success Status */}
        {displayTelemetry.ExecutionSuccessDetected !== undefined && (
          <div className={`text-xs p-2 rounded border ${getStatusColor('ExecutionSuccessDetected', displayTelemetry.ExecutionSuccessDetected)}`}>
            <div className="font-semibold">Execution Success</div>
            <div>{displayTelemetry.ExecutionSuccessDetected ? '✓ YES' : '✗ NO'}</div>
          </div>
        )}

        {/* Post-Execution Timeout */}
        {displayTelemetry.HistoryPostExecutionTimeoutReached !== undefined && (
          <div className={`text-xs p-2 rounded border ${getStatusColor('HistoryPostExecutionTimeoutReached', displayTelemetry.HistoryPostExecutionTimeoutReached)}`}>
            <div className="font-semibold">Post-Exec Timeout</div>
            <div>{displayTelemetry.HistoryPostExecutionTimeoutReached ? '⚠ HIT' : '✓ Clear'}</div>
          </div>
        )}

        {/* Max Wait */}
        {displayTelemetry.MaxWaitSeconds !== undefined && (
          <div className="text-xs p-2 rounded border bg-gray-700/20 text-gray-300 border-gray-600/50">
            <div className="font-semibold">Max Wait</div>
            <div>{displayTelemetry.MaxWaitSeconds}s</div>
          </div>
        )}

        {/* Poll Interval */}
        {displayTelemetry.PollIntervalSeconds !== undefined && (
          <div className="text-xs p-2 rounded border bg-gray-700/20 text-gray-300 border-gray-600/50">
            <div className="font-semibold">Poll Interval</div>
            <div>{displayTelemetry.PollIntervalSeconds}s</div>
          </div>
        )}

        {/* Attempt Limit */}
        {displayTelemetry.HistoryAttemptLimit !== undefined && (
          <div className="text-xs p-2 rounded border bg-gray-700/20 text-gray-300 border-gray-600/50">
            <div className="font-semibold">Attempt Limit</div>
            <div>{displayTelemetry.HistoryAttemptLimit > 0 ? displayTelemetry.HistoryAttemptLimit : 'Unlimited'}</div>
          </div>
        )}

        {/* Post-Exec Timeout Setting */}
        {displayTelemetry.PostExecutionTimeoutSeconds !== undefined && (
          <div className="text-xs p-2 rounded border bg-gray-700/20 text-gray-300 border-gray-600/50">
            <div className="font-semibold">Post-Exec Timeout</div>
            <div>{displayTelemetry.PostExecutionTimeoutSeconds}s</div>
          </div>
        )}

        {/* Interpolation Elapsed */}
        {displayTelemetry.InterpolationElapsed !== undefined && (
          <div className="text-xs p-2 rounded border bg-cyan-900/20 text-cyan-200 border-cyan-700/50">
            <div className="font-semibold">Interpolation</div>
            <div>{Math.round(displayTelemetry.InterpolationElapsed)}ms</div>
          </div>
        )}

        {/* Upscale / Interp Method */}
        {displayTelemetry.UpscaleMethod && (
          <div className="text-xs p-2 rounded border bg-cyan-900/20 text-cyan-200 border-cyan-700/50">
            <div className="font-semibold">Upscale Method</div>
            <div>{displayTelemetry.UpscaleMethod}</div>
          </div>
        )}

        {/* Final FPS */}
        {displayTelemetry.FinalFPS !== undefined && (
          <div className="text-xs p-2 rounded border bg-cyan-900/20 text-cyan-200 border-cyan-700/50">
            <div className="font-semibold">Final FPS</div>
            <div>{displayTelemetry.FinalFPS}</div>
          </div>
        )}

        {/* Final Resolution */}
        {displayTelemetry.FinalResolution && (
          <div className="text-xs p-2 rounded border bg-cyan-900/20 text-cyan-200 border-cyan-700/50">
            <div className="font-semibold">Final Resolution</div>
            <div>{displayTelemetry.FinalResolution}</div>
          </div>
        )}
      </div>

      {/* GPU Info */}
      {displayTelemetry.GPU && (
        <div className={`mt-4 p-3 rounded border space-y-2 transition-all ${
          isStreaming ? 'border-purple-600 bg-purple-900/30' : 'border-purple-700/50 bg-purple-900/20'
        }`}>
          <h4 className="text-xs font-semibold text-purple-300">GPU Information</h4>
          <div className="text-xs text-purple-200 space-y-1">
            {displayTelemetry.GPU.Name && <div><span className="font-semibold">GPU:</span> {displayTelemetry.GPU.Name}</div>}
            {displayTelemetry.GPU.VramBeforeMB !== undefined && (
              <div><span className="font-semibold">VRAM Before:</span> {(displayTelemetry.GPU.VramBeforeMB / 1024).toFixed(1)} GB</div>
            )}
            {displayTelemetry.GPU.VramAfterMB !== undefined && (
              <div><span className="font-semibold">VRAM After:</span> {(displayTelemetry.GPU.VramAfterMB / 1024).toFixed(1)} GB</div>
            )}
            {displayTelemetry.GPU.VramDeltaMB !== undefined && (
              <div className={displayTelemetry.GPU.VramDeltaMB < 0 ? 'text-red-300' : 'text-green-300'}>
                <span className="font-semibold">VRAM Delta:</span> {displayTelemetry.GPU.VramDeltaMB > 0 ? '+' : ''}{(displayTelemetry.GPU.VramDeltaMB / 1024).toFixed(1)} GB
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fallback Notes */}
      {displayTelemetry.System?.FallbackNotes && displayTelemetry.System.FallbackNotes.length > 0 && (
        <div className="mt-4 p-3 rounded border border-yellow-700/50 bg-yellow-900/20 space-y-2">
          <h4 className="text-xs font-semibold text-yellow-300">⚠️ Fallback Warnings</h4>
          <div className="text-xs text-yellow-200 space-y-1">
            {displayTelemetry.System.FallbackNotes.filter(Boolean).map((note, idx) => (
              <div key={idx}>• {note}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TelemetryBadges;
