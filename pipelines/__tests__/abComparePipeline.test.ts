/**
 * A/B Compare Pipeline Tests
 * 
 * Tests for the A/B comparison pipeline helpers and types.
 * 
 * @module pipelines/__tests__/abComparePipeline.test
 */

import { describe, it, expect } from 'vitest';
import type { CompareMetrics, CompareTarget } from '../../types/abCompare';
import { 
    AB_COMPARE_PRESETS, 
    isComparePipelineId, 
    isCompareTarget,
    isTemporalRegularizationMode,
} from '../../types/abCompare';
import {
    mergeMetrics,
    buildTargetPipeline,
} from '../abComparePipeline';

describe('A/B Compare Types', () => {
    describe('AB_COMPARE_PRESETS', () => {
        it('should have at least 3 presets', () => {
            expect(AB_COMPARE_PRESETS.length).toBeGreaterThanOrEqual(3);
        });

        it('should have required properties on each preset', () => {
            for (const preset of AB_COMPARE_PRESETS) {
                expect(preset.id).toBeDefined();
                expect(preset.label).toBeDefined();
                expect(preset.target).toBeDefined();
                expect(preset.target.pipelineConfigId).toBeDefined();
                expect(preset.target.stabilityProfileKey).toBeDefined();
            }
        });

        it('should include production-qa preset', () => {
            const prodPreset = AB_COMPARE_PRESETS.find(p => p.id === 'production-qa');
            expect(prodPreset).toBeDefined();
            expect(prodPreset?.target.pipelineConfigId).toBe('production-qa-preview');
        });

        it('should include cinematic preset', () => {
            const cinemaPreset = AB_COMPARE_PRESETS.find(p => p.id === 'cinematic');
            expect(cinemaPreset).toBeDefined();
            expect(cinemaPreset?.target.stabilityProfileKey).toBe('cinematic');
        });
    });

    describe('isComparePipelineId', () => {
        it('should return true for valid pipeline IDs', () => {
            expect(isComparePipelineId('fast-preview')).toBe(true);
            expect(isComparePipelineId('production-qa-preview')).toBe(true);
            expect(isComparePipelineId('cinematic-preview')).toBe(true);
        });

        it('should return false for invalid pipeline IDs', () => {
            expect(isComparePipelineId('invalid')).toBe(false);
            expect(isComparePipelineId('')).toBe(false);
            expect(isComparePipelineId('production')).toBe(false);
        });
    });

    describe('isTemporalRegularizationMode', () => {
        it('should return true for valid modes', () => {
            expect(isTemporalRegularizationMode('on')).toBe(true);
            expect(isTemporalRegularizationMode('off')).toBe(true);
            expect(isTemporalRegularizationMode('auto')).toBe(true);
        });

        it('should return false for invalid modes', () => {
            expect(isTemporalRegularizationMode('invalid')).toBe(false);
            expect(isTemporalRegularizationMode('')).toBe(false);
        });
    });

    describe('isCompareTarget', () => {
        it('should return true for valid CompareTarget', () => {
            const target: CompareTarget = {
                id: 'A',
                label: 'Test',
                pipelineConfigId: 'production-qa-preview',
                stabilityProfileKey: 'standard',
            };
            expect(isCompareTarget(target)).toBe(true);
        });

        it('should return false for invalid id', () => {
            const target = {
                id: 'C', // Invalid - must be A or B
                label: 'Test',
                pipelineConfigId: 'production-qa-preview',
                stabilityProfileKey: 'standard',
            };
            expect(isCompareTarget(target)).toBe(false);
        });

        it('should return false for missing properties', () => {
            expect(isCompareTarget(null)).toBe(false);
            expect(isCompareTarget({})).toBe(false);
            expect(isCompareTarget({ id: 'A' })).toBe(false);
        });
    });
});

describe('A/B Compare Metric Extraction', () => {
    describe('mergeMetrics', () => {
        it('should return undefined when both inputs are undefined', () => {
            expect(mergeMetrics(undefined, undefined)).toBeUndefined();
        });

        it('should return benchmark metrics when vision is undefined', () => {
            const benchMetrics: Partial<CompareMetrics> = {
                flickerMetric: 5,
                jitterScore: 15,
            };
            const result = mergeMetrics(benchMetrics, undefined);
            expect(result?.flickerMetric).toBe(5);
            expect(result?.jitterScore).toBe(15);
        });

        it('should return vision metrics when benchmark is undefined', () => {
            const visionMetrics: Partial<CompareMetrics> = {
                visionVerdict: 'PASS',
                visionOverall: 85,
            };
            const result = mergeMetrics(undefined, visionMetrics);
            expect(result?.visionVerdict).toBe('PASS');
            expect(result?.visionOverall).toBe(85);
        });

        it('should merge both metrics sources', () => {
            const benchMetrics: Partial<CompareMetrics> = {
                flickerMetric: 3,
                identityScore: 90,
            };
            const visionMetrics: Partial<CompareMetrics> = {
                visionVerdict: 'PASS',
                visionOverall: 88,
            };
            const result = mergeMetrics(benchMetrics, visionMetrics);
            expect(result?.flickerMetric).toBe(3);
            expect(result?.identityScore).toBe(90);
            expect(result?.visionVerdict).toBe('PASS');
            expect(result?.visionOverall).toBe(88);
        });

        it('should let vision metrics override benchmark when both have same key', () => {
            const benchMetrics: Partial<CompareMetrics> = {
                visionOverall: 70,
            };
            const visionMetrics: Partial<CompareMetrics> = {
                visionOverall: 85,
            };
            const result = mergeMetrics(benchMetrics, visionMetrics);
            expect(result?.visionOverall).toBe(85);
        });
    });
});

describe('A/B Compare Pipeline Building', () => {
    describe('buildTargetPipeline', () => {
        it('should create a pipeline with generate and benchmark steps', () => {
            const target: CompareTarget = {
                id: 'A',
                label: 'Test Target',
                pipelineConfigId: 'production-qa-preview',
                stabilityProfileKey: 'standard',
            };
            
            const pipeline = buildTargetPipeline(target, 'sample-001-geometric', '/tmp/output');
            
            expect(pipeline.id).toBe('ab-compare-target-A');
            expect(pipeline.steps.length).toBe(2);
            expect(pipeline.steps[0]?.id).toBe('generate-A');
            expect(pipeline.steps[1]?.id).toBe('benchmark-A');
        });

        it('should include temporal regularization flag in pipeline', () => {
            const target: CompareTarget = {
                id: 'B',
                label: 'Temporal Test',
                pipelineConfigId: 'production-qa-preview',
                stabilityProfileKey: 'standard',
                temporalRegularizationMode: 'on',
                temporalRegularizationStrength: 0.4,
            };
            
            const pipeline = buildTargetPipeline(target, 'sample-001-geometric', '/tmp/output');
            
            expect(pipeline.id).toBe('ab-compare-target-B');
            expect(pipeline.description).toContain('Temporal Test');
        });
    });
});
