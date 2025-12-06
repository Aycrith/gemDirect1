/**
 * Unit Tests for Temporal Regularization Comparison Script (E2.1)
 * 
 * Tests the pure helper functions used for metric extraction and comparison.
 * Does NOT test process execution (no ffmpeg/PowerShell calls).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for fs module
const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

// Mock fs module
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: fsMocks.existsSync,
        readFileSync: fsMocks.readFileSync,
        default: { ...actual, existsSync: fsMocks.existsSync, readFileSync: fsMocks.readFileSync }
    };
});

import {
    extractBenchmarkMetrics,
    extractVisionQaSummary,
    calculateSummary,
    generateMarkdownReport,
    type RunResult,
    type BenchmarkMetrics,
    type ComparisonResult,
} from '../compare-temporal-regularization';

describe('compare-temporal-regularization helpers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('extractBenchmarkMetrics', () => {
        const sampleBenchmarkJson = {
            version: '1.0.0',
            results: [
                {
                    sampleId: 'sample-001-geometric',
                    temporalCoherence: {
                        brightnessVariance: 0.05,
                        colorConsistency: 98.5,
                        maxBrightnessJump: 2,
                        flickerFrameCount: 3,
                        frameDifferenceScore: 0.1,
                    },
                    motionConsistency: {
                        transitionSmoothness: 95.0,
                        jitterScore: 0.15,
                    },
                    identityStability: {
                        identityScore: 89.2,
                        centerRegionVariance: 25000,
                    },
                    overallQuality: 96.5,
                },
                {
                    sampleId: 'sample-002-character',
                    temporalCoherence: {
                        brightnessVariance: 0.1,
                        colorConsistency: 97.0,
                        maxBrightnessJump: 5,
                        flickerFrameCount: 1,
                        frameDifferenceScore: 0.2,
                    },
                    motionConsistency: {
                        transitionSmoothness: 92.0,
                        jitterScore: 0.25,
                    },
                    identityStability: {
                        identityScore: 94.0,
                        centerRegionVariance: 15000,
                    },
                    overallQuality: 94.0,
                },
            ],
        };

        it('extracts metrics for existing sample', () => {
            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(sampleBenchmarkJson));

            const metrics = extractBenchmarkMetrics('/path/to/benchmark.json', 'sample-001-geometric');

            expect(metrics).not.toBeNull();
            expect(metrics!.flickerFrameCount).toBe(3);
            expect(metrics!.brightnessVariance).toBe(0.05);
            expect(metrics!.colorConsistency).toBe(98.5);
            expect(metrics!.jitterScore).toBe(0.15);
            expect(metrics!.identityScore).toBe(89.2);
            expect(metrics!.overallQuality).toBe(96.5);
        });

        it('returns null for non-existent sample', () => {
            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(sampleBenchmarkJson));

            const metrics = extractBenchmarkMetrics('/path/to/benchmark.json', 'sample-999-nonexistent');

            expect(metrics).toBeNull();
        });

        it('returns null for non-existent file', () => {
            fsMocks.existsSync.mockReturnValue(false);

            const metrics = extractBenchmarkMetrics('/path/to/missing.json', 'sample-001-geometric');

            expect(metrics).toBeNull();
        });

        it('handles malformed JSON gracefully', () => {
            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue('not valid json');

            const metrics = extractBenchmarkMetrics('/path/to/bad.json', 'sample-001-geometric');

            expect(metrics).toBeNull();
        });

        it('handles missing nested fields with defaults', () => {
            const partialJson = {
                results: [
                    {
                        sampleId: 'sample-001-geometric',
                        temporalCoherence: {
                            flickerFrameCount: 5,
                            // other fields missing
                        },
                        overallQuality: 90,
                        // motionConsistency and identityStability missing
                    },
                ],
            };

            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(partialJson));

            const metrics = extractBenchmarkMetrics('/path/to/partial.json', 'sample-001-geometric');

            expect(metrics).not.toBeNull();
            expect(metrics!.flickerFrameCount).toBe(5);
            expect(metrics!.brightnessVariance).toBe(0); // Default
            expect(metrics!.jitterScore).toBe(0); // Default
            expect(metrics!.identityScore).toBe(100); // Default
            expect(metrics!.overallQuality).toBe(90);
        });

        it('extracts camera path metrics when present (E3)', () => {
            const jsonWithCameraPath = {
                results: [
                    {
                        sampleId: 'sample-001-geometric',
                        temporalCoherence: {
                            brightnessVariance: 0.05,
                            colorConsistency: 98.5,
                            maxBrightnessJump: 2,
                            flickerFrameCount: 3,
                            frameDifferenceScore: 0.1,
                        },
                        motionConsistency: {
                            transitionSmoothness: 95.0,
                            jitterScore: 0.15,
                        },
                        identityStability: {
                            identityScore: 89.2,
                            centerRegionVariance: 25000,
                        },
                        overallQuality: 96.5,
                        cameraPathId: 'slow-zoom',
                        cameraPathMetrics: {
                            hasCameraPath: true,
                            pathAdherenceMeanError: 0.0234,
                            pathAdherenceMaxError: 0.0567,
                            pathDirectionConsistency: 0.892,
                        },
                    },
                ],
            };

            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(jsonWithCameraPath));

            const metrics = extractBenchmarkMetrics('/path/to/benchmark.json', 'sample-001-geometric');

            expect(metrics).not.toBeNull();
            expect(metrics!.cameraPathId).toBe('slow-zoom');
            expect(metrics!.pathAdherenceMeanError).toBe(0.0234);
            expect(metrics!.pathAdherenceMaxError).toBe(0.0567);
            expect(metrics!.pathDirectionConsistency).toBe(0.892);
        });

        it('handles missing camera path metrics gracefully (E3)', () => {
            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(sampleBenchmarkJson));

            const metrics = extractBenchmarkMetrics('/path/to/benchmark.json', 'sample-001-geometric');

            expect(metrics).not.toBeNull();
            expect(metrics!.cameraPathId).toBeUndefined();
            expect(metrics!.pathAdherenceMeanError).toBeUndefined();
        });
    });

    describe('extractVisionQaSummary', () => {
        const sampleHistory = {
            'sample-001-geometric': [
                { overall: 92, focusStability: 90, artifactSeverity: 5, objectConsistency: 95, status: 'PASS' },
                { overall: 97, focusStability: 95, artifactSeverity: 0, objectConsistency: 100, status: 'PASS' },
            ],
            'sample-002-character': [
                { overall: 100, focusStability: 100, artifactSeverity: 0, objectConsistency: 100, status: 'PASS' },
            ],
        };

        it('extracts most recent Vision QA result', () => {
            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(sampleHistory));

            const summary = extractVisionQaSummary('sample-001-geometric');

            expect(summary).not.toBeNull();
            expect(summary!.overall).toBe(97); // Most recent
            expect(summary!.focusStability).toBe(95);
            expect(summary!.artifactSeverity).toBe(0);
            expect(summary!.objectConsistency).toBe(100);
            expect(summary!.status).toBe('PASS');
        });

        it('returns null for unknown sample', () => {
            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(sampleHistory));

            const summary = extractVisionQaSummary('sample-999-unknown');

            expect(summary).toBeNull();
        });

        it('returns null when history file missing', () => {
            fsMocks.existsSync.mockReturnValue(false);

            const summary = extractVisionQaSummary('sample-001-geometric');

            expect(summary).toBeNull();
        });

        it('returns null for empty sample history', () => {
            const emptyHistory = {
                'sample-001-geometric': [],
            };

            fsMocks.existsSync.mockReturnValue(true);
            fsMocks.readFileSync.mockReturnValue(JSON.stringify(emptyHistory));

            const summary = extractVisionQaSummary('sample-001-geometric');

            expect(summary).toBeNull();
        });
    });

    describe('calculateSummary', () => {
        const baselineMetrics: BenchmarkMetrics = {
            brightnessVariance: 0.1,
            colorConsistency: 95,
            maxBrightnessJump: 5,
            flickerFrameCount: 4,
            frameDifferenceScore: 0.2,
            transitionSmoothness: 90,
            jitterScore: 0.3,
            identityScore: 88,
            centerRegionVariance: 30000,
            overallQuality: 95,
        };

        const improvedMetrics: BenchmarkMetrics = {
            brightnessVariance: 0.05,
            colorConsistency: 98,
            maxBrightnessJump: 2,
            flickerFrameCount: 1, // Reduced from 4
            frameDifferenceScore: 0.1,
            transitionSmoothness: 95,
            jitterScore: 0.15, // Reduced from 0.3
            identityScore: 87, // Slightly reduced
            centerRegionVariance: 25000,
            overallQuality: 94, // Slightly reduced but acceptable
        };

        const degradedMetrics: BenchmarkMetrics = {
            brightnessVariance: 0.02,
            colorConsistency: 99,
            maxBrightnessJump: 1,
            flickerFrameCount: 0,
            frameDifferenceScore: 0.05,
            transitionSmoothness: 98,
            jitterScore: 0.05,
            identityScore: 75, // Significantly reduced
            centerRegionVariance: 50000,
            overallQuality: 85, // Significantly reduced
        };

        it('identifies improved configuration as best', () => {
            const runs: RunResult[] = [
                {
                    mode: 'baseline',
                    temporalRegularizationEnabled: false,
                    runDir: '/run/baseline',
                    benchmarkMetrics: baselineMetrics,
                    errors: [],
                },
                {
                    mode: 'temporal-0.35',
                    temporalRegularizationEnabled: true,
                    temporalRegularizationStrength: 0.35,
                    runDir: '/run/temporal',
                    benchmarkMetrics: improvedMetrics,
                    errors: [],
                },
            ];

            const summary = calculateSummary(runs);

            expect(summary.bestConfiguration).toBe('temporal-0.35');
            expect(summary.flickerReduction).toBe(3); // 4 - 1
            expect(summary.jitterReduction).toBeCloseTo(0.15, 2); // 0.3 - 0.15
            expect(summary.qualityDelta).toBeCloseTo(-1, 1); // 94 - 95
            expect(summary.recommendation).toContain('Temporal regularization reduces flicker');
        });

        it('keeps baseline as best when regularization degrades quality', () => {
            const runs: RunResult[] = [
                {
                    mode: 'baseline',
                    temporalRegularizationEnabled: false,
                    runDir: '/run/baseline',
                    benchmarkMetrics: baselineMetrics,
                    errors: [],
                },
                {
                    mode: 'temporal-0.5',
                    temporalRegularizationEnabled: true,
                    temporalRegularizationStrength: 0.5,
                    runDir: '/run/temporal',
                    benchmarkMetrics: degradedMetrics,
                    errors: [],
                },
            ];

            const summary = calculateSummary(runs);

            expect(summary.bestConfiguration).toBe('baseline');
            expect(summary.recommendation).toContain('optional advanced feature');
        });

        it('handles runs without benchmark metrics', () => {
            const runs: RunResult[] = [
                {
                    mode: 'baseline',
                    temporalRegularizationEnabled: false,
                    runDir: '/run/baseline',
                    errors: ['Benchmark failed'],
                },
                {
                    mode: 'temporal-0.3',
                    temporalRegularizationEnabled: true,
                    runDir: '/run/temporal',
                    errors: ['Benchmark failed'],
                },
            ];

            const summary = calculateSummary(runs);

            expect(summary.bestConfiguration).toBe('baseline');
            expect(summary.baselineMetrics).toBeNull();
            expect(summary.flickerReduction).toBeNull();
        });

        it('handles empty runs array', () => {
            const summary = calculateSummary([]);

            expect(summary.bestConfiguration).toBe('baseline');
            expect(summary.baselineMetrics).toBeNull();
        });
    });

    describe('generateMarkdownReport', () => {
        it('generates valid Markdown structure', () => {
            const result: ComparisonResult = {
                version: '1.0.0',
                generatedAt: '2025-12-05T10:00:00Z',
                sampleId: 'sample-001-geometric',
                preset: 'production-qa-golden',
                runs: [
                    {
                        mode: 'baseline',
                        temporalRegularizationEnabled: false,
                        runDir: '/run/baseline',
                        benchmarkMetrics: {
                            brightnessVariance: 0.1,
                            colorConsistency: 95,
                            maxBrightnessJump: 5,
                            flickerFrameCount: 4,
                            frameDifferenceScore: 0.2,
                            transitionSmoothness: 90,
                            jitterScore: 0.3,
                            identityScore: 88,
                            centerRegionVariance: 30000,
                            overallQuality: 95,
                        },
                        errors: [],
                    },
                    {
                        mode: 'temporal-0.35',
                        temporalRegularizationEnabled: true,
                        temporalRegularizationStrength: 0.35,
                        temporalRegularizationWindowFrames: 3,
                        runDir: '/run/temporal',
                        benchmarkMetrics: {
                            brightnessVariance: 0.05,
                            colorConsistency: 98,
                            maxBrightnessJump: 2,
                            flickerFrameCount: 1,
                            frameDifferenceScore: 0.1,
                            transitionSmoothness: 95,
                            jitterScore: 0.15,
                            identityScore: 87,
                            centerRegionVariance: 25000,
                            overallQuality: 94,
                        },
                        errors: [],
                    },
                ],
                summary: {
                    baselineMetrics: null,
                    bestConfiguration: 'temporal-0.35',
                    flickerReduction: 3,
                    jitterReduction: 0.15,
                    qualityDelta: -1,
                    recommendation: 'Temporal regularization reduces flicker with minimal quality impact.',
                },
            };

            const md = generateMarkdownReport(result);

            // Check structure
            expect(md).toContain('# Temporal Regularization Evaluation Report');
            expect(md).toContain('## Summary');
            expect(md).toContain('## Detailed Results');
            expect(md).toContain('### baseline');
            expect(md).toContain('### temporal-0.35');
            expect(md).toContain('## Recommendation');
            expect(md).toContain('## Reproduction');

            // Check content
            expect(md).toContain('sample-001-geometric');
            expect(md).toContain('production-qa-golden');
            expect(md).toContain('Flicker Frames');
            expect(md).toContain('Jitter Score');
            expect(md).toContain('Overall Quality');
        });

        it('handles runs with errors', () => {
            const result: ComparisonResult = {
                version: '1.0.0',
                generatedAt: '2025-12-05T10:00:00Z',
                sampleId: 'sample-001-geometric',
                preset: 'production-qa-golden',
                runs: [
                    {
                        mode: 'baseline',
                        temporalRegularizationEnabled: false,
                        runDir: '/run/baseline',
                        errors: ['Pipeline failed', 'Benchmark timeout'],
                    },
                ],
                summary: {
                    baselineMetrics: null,
                    bestConfiguration: 'baseline',
                    flickerReduction: null,
                    jitterReduction: null,
                    qualityDelta: null,
                    recommendation: 'Unable to complete comparison.',
                },
            };

            const md = generateMarkdownReport(result);

            expect(md).toContain('**Errors**:');
            expect(md).toContain('Pipeline failed');
            expect(md).toContain('Benchmark timeout');
        });

        it('includes Vision QA summary when available', () => {
            const result: ComparisonResult = {
                version: '1.0.0',
                generatedAt: '2025-12-05T10:00:00Z',
                sampleId: 'sample-001-geometric',
                preset: 'production-qa-golden',
                runs: [
                    {
                        mode: 'baseline',
                        temporalRegularizationEnabled: false,
                        runDir: '/run/baseline',
                        visionQaSummary: {
                            overall: 97,
                            focusStability: 95,
                            artifactSeverity: 0,
                            objectConsistency: 100,
                            status: 'PASS',
                        },
                        errors: [],
                    },
                ],
                summary: {
                    baselineMetrics: null,
                    bestConfiguration: 'baseline',
                    flickerReduction: null,
                    jitterReduction: null,
                    qualityDelta: null,
                    recommendation: 'Test recommendation.',
                },
            };

            const md = generateMarkdownReport(result);

            expect(md).toContain('**Vision QA Summary**:');
            expect(md).toContain('Overall | 97');
            expect(md).toContain('Focus Stability | 95');
            expect(md).toContain('Status | PASS');
        });
    });
});
