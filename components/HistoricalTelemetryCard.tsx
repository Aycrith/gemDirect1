/**
 * HistoricalTelemetryCard Component
 * 
 * Displays aggregated historical telemetry from IndexedDB.
 * Shows statistics, trends, and comparisons across multiple runs.
 * Integrates with useRunHistory hook for real-time data updates.
 */

import React, { useState, useEffect } from 'react';
import { useRunHistory } from '../utils/hooks';

interface HistoricalTelemetryCardProps {
  storyId?: string;
  title?: string;
  compact?: boolean;
  onRefresh?: () => void;
}

const HistoricalTelemetryCard: React.FC<HistoricalTelemetryCardProps> = ({
  storyId,
  title = 'Historical Telemetry',
  compact = false,
  onRefresh
}) => {
  const { runs, loading, error, stats, refresh } = useRunHistory({
    storyId,
    limit: 50
  });

  const [localRefreshTime, setLocalRefreshTime] = useState<number>(Date.now());

  // Handle refresh
  const handleRefresh = async () => {
    await refresh();
    setLocalRefreshTime(Date.now());
    onRefresh?.();
  };

  // Calculate trend based on most recent runs
  const calculateTrend = (): { trend: 'improving' | 'degrading' | 'stable'; confidence: number } => {
    if (runs.length < 2) return { trend: 'stable', confidence: 0 };

    const recentRuns = runs.slice(-5); // Last 5 runs
    const successRates = recentRuns.map(r => r.metadata?.successRate || 0);
    
    const firstHalf = successRates.slice(0, Math.floor(successRates.length / 2)).reduce((a, b) => a + b) / Math.ceil(successRates.length / 2);
    const secondHalf = successRates.slice(Math.floor(successRates.length / 2)).reduce((a, b) => a + b) / Math.floor(successRates.length / 2);

    const delta = secondHalf - firstHalf;
    const confidence = Math.min(100, Math.abs(delta) * 10 * runs.length);

    if (Math.abs(delta) < 5) return { trend: 'stable', confidence: Math.min(confidence, 50) };
    return {
      trend: delta > 0 ? 'improving' : 'degrading',
      confidence
    };
  };

  const { trend, confidence: trendConfidence } = calculateTrend();

  // Color utilities
  const getTrendIcon = (): string => {
    if (trend === 'improving') return '📈';
    if (trend === 'degrading') return '📉';
    return '➡️';
  };

  const getStatColor = (value: number, max: number): string => {
    if (value < 0) return 'text-gray-400';
    const percentage = (value / max) * 100;
    if (percentage >= 80) return 'text-green-400';
    if (percentage >= 60) return 'text-yellow-400';
    if (percentage >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  // Loading state
  if (loading && runs.length === 0) {
    return (
      <div className="p-4 rounded border border-gray-600/50 bg-gray-900/20">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-300">{title}</h4>
          <div className="animate-spin">⟳</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Loading telemetry data...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 rounded border border-red-600/50 bg-red-900/10">
        <h4 className="text-sm font-semibold text-red-300 mb-2">{title}</h4>
        <p className="text-xs text-red-400">{error}</p>
        <button
          onClick={handleRefresh}
          className="mt-2 px-2 py-1 text-xs bg-red-600/30 hover:bg-red-600/50 rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (runs.length === 0) {
    return (
      <div className="p-4 rounded border border-gray-600/50 bg-gray-900/20">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-300">{title}</h4>
          <button
            onClick={handleRefresh}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          No historical data yet. Run workflows to see telemetry.
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="p-3 rounded border border-cyan-600/30 bg-cyan-900/10 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-cyan-300">{title}</h4>
          <div className="flex items-center gap-2">
            <span className="text-lg">{getTrendIcon()}</span>
            <span className="text-xs text-gray-400">{stats.totalRuns} runs</span>
            <button
              onClick={handleRefresh}
              className="text-xs px-1 py-0 rounded hover:bg-cyan-600/20 transition-colors"
              disabled={loading}
            >
              ⟳
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="text-gray-400">Success Rate</div>
            <div className="text-green-400 font-semibold">{stats.successRate.toFixed(1)}%</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-gray-400">Avg Duration</div>
            <div className="text-blue-400 font-semibold">{(stats.averageDuration / 1000).toFixed(1)}s</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded border border-cyan-600/30 bg-cyan-900/10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-cyan-300">{title}</h4>
          <p className="text-xs text-gray-400 mt-1">Last updated {new Date(localRefreshTime).toLocaleTimeString()}</p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-3 py-2 rounded bg-cyan-600/30 hover:bg-cyan-600/50 transition-colors text-xs font-medium text-cyan-300"
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Runs */}
        <div className="p-3 rounded bg-gray-800/50 border border-gray-700/50 space-y-1">
          <div className="text-xs text-gray-400">Total Runs</div>
          <div className="text-2xl font-bold text-cyan-400">{stats.totalRuns}</div>
        </div>

        {/* Success Rate */}
        <div className="p-3 rounded bg-gray-800/50 border border-gray-700/50 space-y-1">
          <div className="text-xs text-gray-400">Success Rate</div>
          <div className={`text-2xl font-bold ${getStatColor(stats.successRate, 100)}`}>
            {stats.successRate.toFixed(1)}%
          </div>
        </div>

        {/* Total Frames */}
        <div className="p-3 rounded bg-gray-800/50 border border-gray-700/50 space-y-1">
          <div className="text-xs text-gray-400">Total Frames</div>
          <div className="text-2xl font-bold text-blue-400">{stats.totalFrames}</div>
        </div>

        {/* Avg Duration */}
        <div className="p-3 rounded bg-gray-800/50 border border-gray-700/50 space-y-1">
          <div className="text-xs text-gray-400">Avg Duration</div>
          <div className="text-lg font-bold text-yellow-400">{(stats.averageDuration / 1000).toFixed(2)}s</div>
        </div>
      </div>

      {/* Duration Range */}
      <div className="space-y-2 pt-2 border-t border-cyan-600/20">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Duration Range</span>
          <span className="text-xs text-gray-500">
            {(stats.minDuration / 1000).toFixed(1)}s - {(stats.maxDuration / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full"
            style={{
              width: stats.maxDuration > 0 ? `${(stats.averageDuration / stats.maxDuration) * 100}%` : '0%'
            }}
          />
        </div>
      </div>

      {/* Trend */}
      <div className="space-y-2 pt-2 border-t border-cyan-600/20">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Performance Trend</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{getTrendIcon()}</span>
            <span className="text-xs font-semibold text-cyan-300 capitalize">{trend}</span>
          </div>
        </div>
        <div className="w-full bg-gray-800 rounded h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all ${
              trend === 'improving' ? 'bg-green-500' : trend === 'degrading' ? 'bg-red-500' : 'bg-gray-500'
            }`}
            style={{ width: `${Math.min(100, trendConfidence)}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">
          Confidence: {trendConfidence.toFixed(0)}%
        </span>
      </div>

      {/* Recent Runs Summary */}
      {runs.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-cyan-600/20">
          <div className="text-xs font-semibold text-cyan-300">Recent Runs</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {runs.slice(-5).reverse().map((run) => (
              <div
                key={run.runId}
                className="text-xs p-2 rounded bg-gray-800/30 border border-gray-700/30 flex justify-between items-center"
              >
                <div className="flex-1">
                  <div className="text-gray-300 font-medium truncate">
                    {new Date(run.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-gray-400">
                    {run.scenes?.length || 0} scenes · {(run.metadata?.totalDuration / 1000).toFixed(1)}s
                  </div>
                </div>
                <div className={`text-xs font-semibold ${run.metadata?.successRate === 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {run.metadata?.successRate?.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoricalTelemetryCard;
