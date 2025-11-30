import React, { useMemo } from 'react';

interface ChartDataPoint {
  id: string;
  timestamp: number;
  duration?: number;
  successRate?: number;
  gpuUsage?: number;
}

interface TelemetryComparisonChartProps {
  data: ChartDataPoint[];
  metric: 'duration' | 'successRate' | 'gpuUsage';
  title?: string;
  height?: number;
  showValues?: boolean;
}

/**
 * Simple ASCII chart renderer for telemetry data
 * Uses character-based rendering for immediate display without external libraries
 */
const TelemetryComparisonChart: React.FC<TelemetryComparisonChartProps> = ({
  data,
  metric,
  title = 'Telemetry Trend',
  height: _height = 8,
  showValues = true
}) => {
  const { minValue, maxValue, chartPoints, values } = useMemo(() => {
    if (data.length === 0) {
      return { minValue: 0, maxValue: 0, chartPoints: [], values: [] };
    }

    // Extract values based on metric
    const metricData = data
      .map(d => {
        if (metric === 'duration') return d.duration || 0;
        if (metric === 'successRate') return d.successRate || 0;
        if (metric === 'gpuUsage') return d.gpuUsage || 0;
        return 0;
      })
      .filter(v => v !== undefined && v !== null);

    if (metricData.length === 0) {
      return { minValue: 0, maxValue: 0, chartPoints: [], values: [] };
    }

    const min = Math.min(...metricData);
    const max = Math.max(...metricData);
    const range = max - min || 1;

    // Normalize values to chart height (0-1 scale)
    const normalized = metricData.map(v => (v - min) / range);

    return {
      minValue: min,
      maxValue: max,
      chartPoints: normalized,
      values: metricData
    };
  }, [data, metric]);

  // Format unit based on metric
  const getUnit = (): string => {
    if (metric === 'duration') return 'ms';
    if (metric === 'successRate') return '%';
    if (metric === 'gpuUsage') return '%';
    return '';
  };

  // Determine color based on metric and value
  const getValueColor = (_value: number, isMin: boolean, isMax: boolean): string => {
    if (metric === 'duration') {
      // For duration, lower is better (green)
      if (isMin) return 'text-green-400';
      if (isMax) return 'text-red-400';
      return 'text-gray-400';
    } else if (metric === 'successRate') {
      // For success rate, higher is better (green)
      if (isMax) return 'text-green-400';
      if (isMin) return 'text-red-400';
      return 'text-gray-400';
    } else {
      // For GPU usage, lower is better
      if (isMin) return 'text-green-400';
      if (isMax) return 'text-red-400';
      return 'text-gray-400';
    }
  };

  if (data.length === 0) {
    return (
      <div className="p-3 rounded border border-gray-600/50 bg-gray-900/20">
        <p className="text-xs text-gray-400">{title} - No data available</p>
      </div>
    );
  }

  const unit = getUnit();
  const minColor = getValueColor(minValue, true, false);
  const maxColor = getValueColor(maxValue, false, true);
  const lastValue = values[values.length - 1] || 0;
  const lastColor = getValueColor(lastValue, lastValue === minValue, lastValue === maxValue);

  return (
    <div className="p-3 rounded border border-blue-600/30 bg-blue-900/10 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-blue-300">{title}</h4>
        <div className="text-xs text-gray-400 space-x-2">
          {showValues && (
            <>
              <span className={minColor}>
                Min: {minValue.toFixed(1)}{unit}
              </span>
              <span className={lastColor}>
                Latest: {lastValue.toFixed(1)}{unit}
              </span>
              <span className={maxColor}>
                Max: {maxValue.toFixed(1)}{unit}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Mini Sparkline-style visualization */}
      <div className="flex items-end gap-0.5 h-12">
        {chartPoints.map((point, idx) => {
          const barHeight = Math.max(1, Math.round(point * 11)); // 11 character units
          const value = values[idx] ?? 0;
          const isMin = value === minValue;
          const isMax = value === maxValue;
          const color = getValueColor(value, isMin, isMax);

          return (
            <div
              key={idx}
              className={`flex-1 rounded-t transition-all ${color} opacity-70 hover:opacity-100`}
              style={{
                height: `${barHeight * 4}px`,
                backgroundColor: color.includes('green') ? 'rgba(74, 222, 128, 0.3)' : 
                                 color.includes('red') ? 'rgba(248, 113, 113, 0.3)' :
                                 'rgba(156, 163, 175, 0.2)'
              }}
              title={`${(idx + 1)}: ${value.toFixed(2)}${unit}`}
            />
          );
        })}
      </div>

      {/* Stats Footer */}
      <div className="text-xs text-gray-400 space-y-0.5 pt-2 border-t border-blue-600/20">
        <div className="flex justify-between">
          <span>Data Points:</span>
          <span>{data.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Range:</span>
          <span>{(maxValue - minValue).toFixed(1)}{unit}</span>
        </div>
        <div className="flex justify-between">
          <span>Average:</span>
          <span>{(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}{unit}</span>
        </div>
      </div>
    </div>
  );
};

export default TelemetryComparisonChart;
