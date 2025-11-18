export interface TelemetrySnapshot {
    storyId: string;
    scenes: number;
    successRate: number; // 0-1
    durationSeconds: number;
    gpuUsageGb: number;
    retries: number;
    timeouts: number;
    timestamp: Date;
}

export interface Recommendation {
    id: string;
    type: 'timeout' | 'memory' | 'performance' | 'gpu' | 'retry';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    suggestedAction?: string;
    confidence: number; // 0-100
}

function uuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `rec-${Math.random().toString(36).slice(2, 10)}`;
}

export class RecommendationEngine {
    static analyzeTelemetry(snapshots: TelemetrySnapshot[]): Recommendation[] {
        if (!snapshots || snapshots.length === 0) {
            return [];
        }

        const recommendations: Recommendation[] = [];

        snapshots.forEach((snapshot) => {
            if (snapshot.successRate < 0.8) {
                recommendations.push({
                    id: uuid(),
                    type: 'performance',
                    severity: snapshot.successRate < 0.6 ? 'critical' : 'warning',
                    message: `Success rate ${Math.round(snapshot.successRate * 100)}% is below target for story ${snapshot.storyId}.`,
                    suggestedAction: 'Increase retry budget or review failing scenes.',
                    confidence: Math.round((1 - snapshot.successRate) * 100),
                });
            }

            if (snapshot.timeouts > 0) {
                recommendations.push({
                    id: uuid(),
                    type: 'timeout',
                    severity: snapshot.timeouts > 2 ? 'critical' : 'warning',
                    message: `${snapshot.timeouts} timeout(s) detected during the latest run.`,
                    suggestedAction: 'Shorten scene batches or increase poll timeout.',
                    confidence: Math.min(100, snapshot.timeouts * 20),
                });
            }

            if (snapshot.gpuUsageGb > 18) {
                recommendations.push({
                    id: uuid(),
                    type: 'gpu',
                    severity: 'warning',
                    message: `GPU usage peaked at ${snapshot.gpuUsageGb.toFixed(1)} GB.`,
                    suggestedAction: 'Lower resolution or run on a card with more VRAM.',
                    confidence: Math.min(100, snapshot.gpuUsageGb * 5),
                });
            }

            if (snapshot.retries > snapshot.scenes * 0.5) {
                recommendations.push({
                    id: uuid(),
                    type: 'retry',
                    severity: 'info',
                    message: `High retry volume (${snapshot.retries}) relative to scenes.`,
                    suggestedAction: 'Inspect scene history logs for persistent failures.',
                    confidence: 60,
                });
            }

            if (snapshot.durationSeconds > snapshot.scenes * 120) {
                recommendations.push({
                    id: uuid(),
                    type: 'memory',
                    severity: 'warning',
                    message: 'Generation duration is trending longer than expected.',
                    suggestedAction: 'Verify workflow nodes and consider pruning negative prompts.',
                    confidence: 55,
                });
            }
        });

        // Deduplicate by type to avoid noisy cards
        const seen = new Set<string>();
        return recommendations.filter((rec) => {
            const key = rec.type;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
}
