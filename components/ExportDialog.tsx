import React, { useMemo, useState } from 'react';
import ExportService, { type ExportFormat } from '../services/exportService';
import type { Recommendation, TelemetrySnapshot } from '../services/recommendationEngine';

interface ExportDialogProps {
    data: TelemetrySnapshot[];
    recommendations: Recommendation[];
    isOpen: boolean;
    onClose: () => void;
    onExportComplete?: () => void;
}

const ExportDialog: React.FC<ExportDialogProps> = ({ data, recommendations, isOpen, onClose, onExportComplete }) => {
    const [format, setFormat] = useState<ExportFormat>('json');
    const [status, setStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);

    const summary = useMemo(() => {
        if (data.length === 0) {
            return null;
        }

        const safeNumber = (value?: number): number => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            return 0;
        };

        const normalized = data.map((snapshot) => ({
            durationSeconds: safeNumber(snapshot.durationSeconds),
            successRate: Math.min(1, Math.max(0, safeNumber(snapshot.successRate))),
            retries: safeNumber(snapshot.retries),
            gpuUsageGb: safeNumber(snapshot.gpuUsageGb),
        }));

        const totalDuration = normalized.reduce((sum, snapshot) => sum + snapshot.durationSeconds, 0);
        const avgSuccess =
            normalized.reduce((sum, snapshot) => sum + snapshot.successRate, 0) / Math.max(normalized.length, 1);
        const maxRetries = Math.max(...normalized.map((snapshot) => snapshot.retries), 0);
        const avgGpu = normalized.reduce((sum, snapshot) => sum + snapshot.gpuUsageGb, 0) / Math.max(normalized.length, 1);

        return {
            totalDuration,
            avgSuccess,
            maxRetries,
            avgGpu,
        };
    }, [data]);

    const handleExport = async () => {
        try {
            setStatus('exporting');
            setError(null);
            await ExportService.exportTelemetryReport(data, recommendations, {
                format,
                filename: `telemetry-${new Date().toISOString()}.${format === 'json' ? 'json' : 'csv'}`,
            });
            setStatus('success');
            onExportComplete?.();
        } catch (err) {
            setStatus('error');
            setError(err instanceof Error ? err.message : 'Failed to export telemetry data');
        }
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-900/95 p-6 text-sm text-gray-200">
                <h3 className="text-xl font-semibold text-white">Export telemetry report</h3>
                <p className="mt-1 text-xs text-gray-400">
                    Bundle the current snapshot and recommendation set into a shareable JSON or CSV file.
                </p>

                <div className="mt-4 space-y-3 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                    {summary ? (
                        <>
                            <p className="text-xs uppercase tracking-wide text-gray-500">Snapshot summary</p>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-400">Total duration</p>
                                    <p className="text-lg font-semibold text-white">{summary.totalDuration.toFixed(1)}s</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Avg success rate</p>
                                    <p className="text-lg font-semibold text-white">{(summary.avgSuccess * 100).toFixed(1)}%</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Max retries</p>
                                    <p className="text-lg font-semibold text-white">{summary.maxRetries}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Avg GPU</p>
                                    <p className="text-lg font-semibold text-white">{summary.avgGpu.toFixed(1)} GB</p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="text-gray-400">No telemetry snapshots available to export.</p>
                    )}
                </div>

                <div className="mt-4">
                    <label className="text-xs uppercase tracking-wide text-gray-500">Format</label>
                    <div className="mt-2 flex gap-3">
                        {(['json', 'csv'] as ExportFormat[]).map((option) => (
                            <button
                                key={option}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                    format === option
                                        ? 'border-amber-500 bg-amber-600/20 text-amber-200'
                                        : 'border-gray-700 text-gray-300 hover:bg-gray-800'
                                }`}
                                onClick={() => setFormat(option)}
                            >
                                {option.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

                <div className="mt-6 flex justify-end gap-3 text-sm">
                    <button
                        className="rounded-full border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="rounded-full bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleExport}
                        disabled={status === 'exporting' || data.length === 0}
                    >
                        {status === 'exporting' ? 'Exporting…' : 'Export report'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export { ExportDialog, type ExportDialogProps };

export default ExportDialog;
