
import { describe, it, expect } from 'vitest';

interface FrameStats {
    frameIndex: number;
    yAvg: number;
    yVar: number;
    uAvg: number;
    vAvg: number;
}

function parseFFmpegSignalStats(output: string): FrameStats[] {
    const stats: FrameStats[] = [];
    const lines = output.split('\n');
    let currentFrame: Partial<FrameStats> = {};
    let frameIndex = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('frame:')) {
            if (Object.keys(currentFrame).length > 0) {
                stats.push(currentFrame as FrameStats);
                currentFrame = {};
            }
            // frame:0    pts:0       pts_time:0
            // We can just increment frameIndex or parse it
            currentFrame.frameIndex = frameIndex++;
        }
        
        // lavfi.signalstats.YAVG=123.45
        if (trimmed.startsWith('lavfi.signalstats.YAVG=')) {
            currentFrame.yAvg = parseFloat(trimmed.split('=')[1] || '0');
        }
        if (trimmed.startsWith('lavfi.signalstats.YVAR=')) {
            currentFrame.yVar = parseFloat(trimmed.split('=')[1] || '0');
        }
        if (trimmed.startsWith('lavfi.signalstats.UAVG=')) {
            currentFrame.uAvg = parseFloat(trimmed.split('=')[1] || '0');
        }
        if (trimmed.startsWith('lavfi.signalstats.VAVG=')) {
            currentFrame.vAvg = parseFloat(trimmed.split('=')[1] || '0');
        }
    }
    
    // Push last frame
    if (Object.keys(currentFrame).length >= 4) { // Ensure we have data
        stats.push(currentFrame as FrameStats);
    }

    return stats;
}

describe('FFmpeg Stats Parser', () => {
    it('should parse signalstats output correctly', () => {
        const mockOutput = `
frame:0    pts:0       pts_time:0
lavfi.signalstats.YAVG=100.5
lavfi.signalstats.YVAR=500.2
lavfi.signalstats.UAVG=128.0
lavfi.signalstats.VAVG=128.0
frame:1    pts:1       pts_time:0.041667
lavfi.signalstats.YAVG=102.0
lavfi.signalstats.YVAR=510.0
lavfi.signalstats.UAVG=129.0
lavfi.signalstats.VAVG=127.0
`;
        const stats = parseFFmpegSignalStats(mockOutput);
        expect(stats).toHaveLength(2);
        expect(stats[0]).toEqual({
            frameIndex: 0,
            yAvg: 100.5,
            yVar: 500.2,
            uAvg: 128.0,
            vAvg: 128.0
        });
        expect(stats[1]).toEqual({
            frameIndex: 1,
            yAvg: 102.0,
            yVar: 510.0,
            uAvg: 129.0,
            vAvg: 127.0
        });
    });
});
