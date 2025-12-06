import { describe, it, expect } from 'vitest';

import {
    parseArgs,
    computeTmixWeights,
    buildFfmpegCommand,
} from '../temporal-regularizer';

describe('temporal-regularizer', () => {
    describe('parseArgs', () => {
        it('parses all CLI arguments correctly', () => {
            const args = parseArgs([
                '--input', 'video.mp4',
                '--output', 'smooth.mp4',
                '--strength', '0.5',
                '--window-frames', '5',
                '--dry-run',
                '--verbose',
            ]);

            expect(args.input).toBe('video.mp4');
            expect(args.output).toBe('smooth.mp4');
            expect(args.strength).toBe(0.5);
            expect(args.windowFrames).toBe(5);
            expect(args.dryRun).toBe(true);
            expect(args.verbose).toBe(true);
        });

        it('uses defaults for missing arguments', () => {
            const args = parseArgs(['--input', 'test.mp4']);

            expect(args.input).toBe('test.mp4');
            expect(args.output).toBeUndefined();
            expect(args.strength).toBe(0.3);
            expect(args.windowFrames).toBe(3);
            expect(args.dryRun).toBe(false);
            expect(args.verbose).toBe(false);
        });

        it('clamps strength to valid range [0, 1]', () => {
            const argsHigh = parseArgs(['--strength', '1.5']);
            expect(argsHigh.strength).toBe(1);

            const argsLow = parseArgs(['--strength', '-0.5']);
            expect(argsLow.strength).toBe(0);
        });

        it('clamps window frames to valid range [2, 7]', () => {
            const argsHigh = parseArgs(['--window-frames', '10']);
            expect(argsHigh.windowFrames).toBe(7);

            const argsLow = parseArgs(['--window-frames', '1']);
            expect(argsLow.windowFrames).toBe(2);
        });

        it('handles short form arguments', () => {
            const args = parseArgs(['-i', 'in.mp4', '-o', 'out.mp4', '-s', '0.4', '-w', '4', '-d', '-v']);

            expect(args.input).toBe('in.mp4');
            expect(args.output).toBe('out.mp4');
            expect(args.strength).toBe(0.4);
            expect(args.windowFrames).toBe(4);
            expect(args.dryRun).toBe(true);
            expect(args.verbose).toBe(true);
        });

        it('parses help flag', () => {
            const args1 = parseArgs(['--help']);
            expect(args1.help).toBe(true);

            const args2 = parseArgs(['-h']);
            expect(args2.help).toBe(true);
        });
    });

    describe('computeTmixWeights', () => {
        it('returns weights for 3-frame window at low strength', () => {
            const weights = computeTmixWeights(0.1, 3);
            // At low strength, center should be highest
            const values = weights.split(' ').map(parseFloat);
            expect(values).toHaveLength(3);
            expect(values[1]!).toBeGreaterThan(values[0]!); // center > left
            expect(values[1]!).toBeGreaterThan(values[2]!); // center > right
        });

        it('returns roughly equal weights at high strength', () => {
            const weights = computeTmixWeights(1.0, 3);
            const values = weights.split(' ').map(parseFloat);
            expect(values).toHaveLength(3);
            // At max strength, all weights should be similar
            expect(Math.abs(values[0]! - values[1]!)).toBeLessThan(0.1);
            expect(Math.abs(values[1]! - values[2]!)).toBeLessThan(0.1);
        });

        it('handles 5-frame window', () => {
            const weights = computeTmixWeights(0.3, 5);
            const values = weights.split(' ').map(parseFloat);
            expect(values).toHaveLength(5);
            expect(values[2]!).toBeGreaterThanOrEqual(values[0]!); // center >= edge
            expect(values[2]!).toBeGreaterThanOrEqual(values[4]!); // center >= edge
        });

        it('handles 7-frame window', () => {
            const weights = computeTmixWeights(0.5, 7);
            const values = weights.split(' ').map(parseFloat);
            expect(values).toHaveLength(7);
            // Center frame (index 3) should have highest weight at moderate strength
            const centerWeight = values[3]!;
            expect(centerWeight).toBeGreaterThan(values[0]!);
            expect(centerWeight).toBeGreaterThan(values[6]!);
        });

        it('handles minimum window size (2)', () => {
            const weights = computeTmixWeights(0.3, 2);
            const values = weights.split(' ').map(parseFloat);
            expect(values).toHaveLength(2);
        });
    });

    describe('buildFfmpegCommand', () => {
        it('builds correct ffmpeg command with default settings', () => {
            const cmd = buildFfmpegCommand('input.mp4', 'output.mp4', 0.3, 3);

            expect(cmd).toContain('-i');
            expect(cmd).toContain('input.mp4');
            expect(cmd).toContain('-vf');
            expect(cmd.some(arg => arg.includes('tmix=frames=3'))).toBe(true);
            expect(cmd).toContain('-c:a');
            expect(cmd).toContain('copy');
            expect(cmd).toContain('-y');
            expect(cmd).toContain('output.mp4');
        });

        it('includes correct frame count in filter', () => {
            const cmd = buildFfmpegCommand('test.mp4', 'out.mp4', 0.4, 5);
            const vfArg = cmd.find(arg => arg.includes('tmix='));
            expect(vfArg).toContain('frames=5');
            expect(vfArg).toContain('normalize=1');
        });

        it('includes weights in filter string', () => {
            const cmd = buildFfmpegCommand('test.mp4', 'out.mp4', 0.5, 3);
            const vfArg = cmd.find(arg => arg.includes('tmix='));
            expect(vfArg).toContain('weights=');
        });

        it('handles paths with spaces', () => {
            const cmd = buildFfmpegCommand('path with spaces/input.mp4', 'output path/out.mp4', 0.3, 3);
            expect(cmd).toContain('path with spaces/input.mp4');
            expect(cmd).toContain('output path/out.mp4');
        });
    });
});
