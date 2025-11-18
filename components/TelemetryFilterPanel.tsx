import React, { useMemo, useState } from 'react';
import type { TelemetrySnapshot } from '../services/recommendationEngine';

interface TelemetryFilterPanelProps {
    data: TelemetrySnapshot[];
    onFilter: (filtered: TelemetrySnapshot[]) => void;
    onExport: () => void;
}

interface FilterState {
    successRateMin: number;
    durationMax: number;
    retriesMax: number;
    gpuUsageMax: number;
}

const defaultFilters: FilterState = {
    successRateMin: 0,
    durationMax: 0,
    retriesMax: 0,
    gpuUsageMax: 0,
};

const TelemetryFilterPanel: React.FC<TelemetryFilterPanelProps> = ({ data, onFilter, onExport }) => {
    const [filters, setFilters] = useState<FilterState>(defaultFilters);

    const filteredData = useMemo(() => {
        return data.filter((snapshot) => {
            if (filters.successRateMin > 0 && snapshot.successRate < filters.successRateMin / 100) {
                return false;
            }
            if (filters.durationMax > 0 && snapshot.durationSeconds > filters.durationMax) {
                return false;
            }
            if (filters.retriesMax > 0 && snapshot.retries > filters.retriesMax) {
                return false;
            }
            if (filters.gpuUsageMax > 0 && snapshot.gpuUsageGb > filters.gpuUsageMax) {
                return false;
            }
            return true;
        });
    }, [data, filters]);

    const handleFilterChange = (key: keyof FilterState, value: number) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    React.useEffect(() => {
        onFilter(filteredData);
    }, [filteredData, onFilter]);

    const handleReset = () => {
        setFilters(defaultFilters);
        onFilter(data);
    };

    return (
        <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4 text-sm text-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h4 className="text-lg font-semibold text-white">Telemetry filters</h4>
                    <p className="text-xs text-gray-400">Narrow the snapshot list before exporting a report.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800"
                        onClick={handleReset}
                    >
                        Reset
                    </button>
                    <button
                        className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500"
                        onClick={onExport}
                    >
                        Export filtered
                    </button>
                </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Min success rate (%)</span>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        value={filters.successRateMin}
                        onChange={(event) => handleFilterChange('successRateMin', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800/70 p-2 text-sm text-gray-100"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Max duration (s)</span>
                    <input
                        type="number"
                        min={0}
                        value={filters.durationMax}
                        onChange={(event) => handleFilterChange('durationMax', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800/70 p-2 text-sm text-gray-100"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Max retries</span>
                    <input
                        type="number"
                        min={0}
                        value={filters.retriesMax}
                        onChange={(event) => handleFilterChange('retriesMax', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800/70 p-2 text-sm text-gray-100"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs uppercase tracking-wide text-gray-400">Max GPU usage (GB)</span>
                    <input
                        type="number"
                        min={0}
                        value={filters.gpuUsageMax}
                        onChange={(event) => handleFilterChange('gpuUsageMax', Number(event.target.value))}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800/70 p-2 text-sm text-gray-100"
                    />
                </label>
            </div>

            <div className="mt-4 text-xs text-gray-400">
                Showing {filteredData.length} of {data.length} snapshot(s)
            </div>
        </div>
    );
};

export default TelemetryFilterPanel;
