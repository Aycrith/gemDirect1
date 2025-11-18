import type { Recommendation, TelemetrySnapshot } from './recommendationEngine';

export type ExportFormat = 'json' | 'csv';

export interface ExportOptions {
    format?: ExportFormat;
    filename?: string;
}

function createBlobUrl(data: Blob): string {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(data);
    }
    throw new Error('Blob URLs are not supported in this environment');
}

function triggerDownload(url: string, filename: string): void {
    if (typeof document === 'undefined') {
        throw new Error('Cannot trigger downloads outside the browser');
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
    }
}

function toCsv(snapshots: TelemetrySnapshot[], recommendations: Recommendation[]): string {
    const encodeRow = (columns: string[]): string =>
        columns.map((value) => `"${value.replace(/"/g, '""')}"`).join(',');

    const rows: string[] = [];
    rows.push(
        encodeRow(['timestamp', 'storyId', 'scenes', 'successRate', 'durationSeconds', 'gpuUsageGb', 'retries', 'timeouts'])
    );
    snapshots.forEach((snapshot) => {
        rows.push(
            encodeRow([
                snapshot.timestamp.toISOString(),
                snapshot.storyId,
                snapshot.scenes.toString(),
                (snapshot.successRate * 100).toFixed(2),
                snapshot.durationSeconds.toFixed(2),
                snapshot.gpuUsageGb.toFixed(2),
                snapshot.retries.toString(),
                snapshot.timeouts.toString(),
            ])
        );
    });

    if (recommendations.length > 0) {
        rows.push('');
        rows.push(encodeRow(['type', 'severity', 'message', 'confidence']));
        recommendations.forEach((rec) => {
            rows.push(encodeRow([rec.type, rec.severity, rec.message, rec.confidence.toString()]));
        });
    }

    return rows.join('\n');
}

export default class ExportService {
    static async exportTelemetryReport(
        snapshots: TelemetrySnapshot[],
        recommendations: Recommendation[],
        options?: ExportOptions
    ): Promise<string> {
        const format = options?.format ?? 'json';
        const filename = options?.filename ?? `telemetry-report.${format === 'json' ? 'json' : 'csv'}`;

        const payload = {
            generatedAt: new Date().toISOString(),
            snapshotCount: snapshots.length,
            snapshots: snapshots.map((snapshot) => ({
                ...snapshot,
                timestamp: snapshot.timestamp.toISOString(),
            })),
            recommendations,
        };

        let blob: Blob;
        if (format === 'json') {
            blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        } else {
            blob = new Blob([toCsv(snapshots, recommendations)], { type: 'text/csv' });
        }

        const url = createBlobUrl(blob);
        triggerDownload(url, filename);
        return filename;
    }
}
