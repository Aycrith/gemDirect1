/**
 * Tests for generationMetrics service
 * Validates A/B testing metrics collection and statistical analysis
 */
import { describe, it, expect } from 'vitest';
import {
    createMetrics,
    generateMetricId,
    getSessionId,
    resetSessionId,
    summarizeMetricsByVariant,
    getVariantSummary,
    isSignificantDifference,
    compareVariants,
    generateComparisonReport,
    exportMetricsToJson,
    exportMetricsToCsv,
    bayesianCompareVariants,
    MIN_SAMPLE_SIZE,
    MIN_BAYESIAN_SAMPLE_SIZE,
    MIN_RELATIVE_DIFF,
    type GenerationMetrics,
    type MetricsSummary,
} from '../generationMetrics';

describe('generationMetrics', () => {
    describe('generateMetricId', () => {
        it('should generate unique IDs', () => {
            const id1 = generateMetricId();
            const id2 = generateMetricId();
            expect(id1).not.toBe(id2);
        });

        it('should generate string IDs', () => {
            const id = generateMetricId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        });
    });

    describe('getSessionId', () => {
        it('should return consistent session ID within same test', () => {
            const id1 = getSessionId();
            const id2 = getSessionId();
            expect(id1).toBe(id2);
        });
    });

    describe('resetSessionId', () => {
        it('should generate new session ID after reset', () => {
            const id1 = getSessionId();
            resetSessionId();
            const id2 = getSessionId();
            expect(id1).not.toBe(id2);
        });
    });

    describe('createMetrics', () => {
        it('should create metrics with required fields', () => {
            const metrics = createMetrics({
                promptVariantId: 'control',
                provider: 'comfyui',
            });
            expect(metrics.promptVariantId).toBe('control');
            expect(metrics.provider).toBe('comfyui');
            expect(metrics.timestamp).toBeDefined();
            expect(metrics.generationId).toBeDefined();
            expect(metrics.sessionId).toBeDefined();
        });

        it('should include default values for optional fields', () => {
            const metrics = createMetrics({
                promptVariantId: 'test',
                provider: 'gemini',
            });
            // Default success is false (must be explicitly set on completion)
            expect(metrics.success).toBe(false);
            expect(metrics.promptLength).toBe(0);
            expect(metrics.positiveTokens).toBe(0);
        });
    });

    describe('summarizeMetricsByVariant', () => {
        it('should aggregate metrics by variant ID', () => {
            const metrics: GenerationMetrics[] = [
                createMetrics({ promptVariantId: 'control', provider: 'comfyui', success: true }),
                createMetrics({ promptVariantId: 'control', provider: 'comfyui', success: false }),
                createMetrics({ promptVariantId: 'optimized', provider: 'comfyui', success: true }),
            ];
            
            const summaries = summarizeMetricsByVariant(metrics);
            expect(summaries.get('control')?.sampleSize).toBe(2);
            expect(summaries.get('optimized')?.sampleSize).toBe(1);
        });

        it('should calculate success rate correctly', () => {
            const metrics: GenerationMetrics[] = [
                createMetrics({ promptVariantId: 'test', provider: 'comfyui', success: true }),
                createMetrics({ promptVariantId: 'test', provider: 'comfyui', success: true }),
                createMetrics({ promptVariantId: 'test', provider: 'comfyui', success: false }),
            ];
            
            const summaries = summarizeMetricsByVariant(metrics);
            const summary = summaries.get('test');
            expect(summary?.successRate).toBeCloseTo(2/3, 2);
        });
    });

    describe('getVariantSummary', () => {
        it('should return summary for existing variant', () => {
            const metrics: GenerationMetrics[] = [
                createMetrics({ promptVariantId: 'test', provider: 'comfyui' }),
            ];
            
            const summary = getVariantSummary(metrics, 'test');
            expect(summary).not.toBeNull();
            expect(summary?.variantId).toBe('test');
        });

        it('should return null for non-existent variant', () => {
            const metrics: GenerationMetrics[] = [
                createMetrics({ promptVariantId: 'test', provider: 'comfyui' }),
            ];
            
            const summary = getVariantSummary(metrics, 'nonexistent');
            expect(summary).toBeNull();
        });
    });

    describe('isSignificantDifference', () => {
        it('should require minimum sample size', () => {
            // Small samples should not be significant
            expect(isSignificantDifference(0.5, 0.6, 10, 10)).toBe(false);
        });

        it('should detect significant difference with adequate samples', () => {
            // 50% vs 60% with n=30 each - 20% relative difference
            expect(isSignificantDifference(0.5, 0.7, 30, 30)).toBe(true);
        });

        it('should require minimum relative difference', () => {
            // 50% vs 52% - only 4% relative difference
            expect(isSignificantDifference(0.5, 0.52, 100, 100)).toBe(false);
        });
    });

    describe('MIN_SAMPLE_SIZE constant', () => {
        it('should be 30 for statistical validity', () => {
            expect(MIN_SAMPLE_SIZE).toBe(30);
        });
    });

    describe('MIN_RELATIVE_DIFF constant', () => {
        it('should be 10% (0.1)', () => {
            expect(MIN_RELATIVE_DIFF).toBe(0.1);
        });
    });

    describe('exportMetricsToJson', () => {
        it('should return valid JSON string', () => {
            const metrics: GenerationMetrics[] = [
                createMetrics({ promptVariantId: 'test', provider: 'comfyui' }),
            ];
            
            const json = exportMetricsToJson(metrics);
            expect(() => JSON.parse(json)).not.toThrow();
        });
    });

    describe('exportMetricsToCsv', () => {
        it('should return CSV with headers', () => {
            const metrics: GenerationMetrics[] = [
                createMetrics({ promptVariantId: 'test', provider: 'comfyui' }),
            ];
            
            const csv = exportMetricsToCsv(metrics);
            expect(csv).toContain('promptVariantId');
            expect(csv).toContain('provider');
            expect(csv).toContain('test');
        });
    });

    describe('Bayesian A/B testing', () => {
        it('should calculate P(treatment > control) using Beta distributions', () => {
            // Treatment has clearly higher success rate
            const control: MetricsSummary = {
                variantId: 'control',
                sampleSize: 20,
                successRate: 0.5,  // 10 successes, 10 failures
                avgGenerationTimeMs: 1000,
                avgPositiveTokens: 80,
                avgNegativeTokens: 20,
                safetyFilterRate: 0.1,
                regenerationRate: 0.2,
                avgUserRating: null,
                ratingCount: 0,
            };
            
            const treatment: MetricsSummary = {
                variantId: 'treatment',
                sampleSize: 20,
                successRate: 0.8,  // 16 successes, 4 failures
                avgGenerationTimeMs: 900,
                avgPositiveTokens: 75,
                avgNegativeTokens: 20,
                safetyFilterRate: 0.05,
                regenerationRate: 0.1,
                avgUserRating: null,
                ratingCount: 0,
            };
            
            const result = bayesianCompareVariants(control, treatment);
            
            // With such a clear difference, P(treatment > control) should be high (>0.9)
            expect(result.probabilityTreatmentBetter).toBeGreaterThan(0.9);
            expect(result.controlId).toBe('control');
            expect(result.treatmentId).toBe('treatment');
        });

        it('should converge with fewer samples than frequentist (target: 10 vs 30)', () => {
            // Test with MIN_BAYESIAN_SAMPLE_SIZE (10) samples
            const control: MetricsSummary = {
                variantId: 'control',
                sampleSize: 10,  // Below frequentist MIN_SAMPLE_SIZE (30)
                successRate: 0.3,  // 3 successes, 7 failures
                avgGenerationTimeMs: 1000,
                avgPositiveTokens: 80,
                avgNegativeTokens: 20,
                safetyFilterRate: 0.1,
                regenerationRate: 0.2,
                avgUserRating: null,
                ratingCount: 0,
            };
            
            const treatment: MetricsSummary = {
                variantId: 'treatment',
                sampleSize: 10,  // Below frequentist MIN_SAMPLE_SIZE (30)
                successRate: 0.7,  // 7 successes, 3 failures
                avgGenerationTimeMs: 900,
                avgPositiveTokens: 75,
                avgNegativeTokens: 20,
                safetyFilterRate: 0.05,
                regenerationRate: 0.1,
                avgUserRating: null,
                ratingCount: 0,
            };
            
            // Frequentist would say "not significant" with n=10
            const frequentistResult = compareVariants(control, treatment, 'successRate');
            expect(frequentistResult?.isSignificant).toBe(false);
            
            // Bayesian can still provide a meaningful probability
            const bayesianResult = bayesianCompareVariants(control, treatment);
            
            // With clear difference (0.3 vs 0.7), Bayesian should show high confidence
            expect(bayesianResult.probabilityTreatmentBetter).toBeGreaterThan(0.9);
            
            // Verify it accepts MIN_BAYESIAN_SAMPLE_SIZE (10)
            expect(bayesianResult.hasMinSamples).toBe(true);
            expect(MIN_BAYESIAN_SAMPLE_SIZE).toBe(10);
            expect(MIN_SAMPLE_SIZE).toBe(30);
        });

        it('should return probability in range [0, 1]', () => {
            // Test various scenarios to ensure probability stays bounded
            const scenarios = [
                { controlRate: 0.1, treatmentRate: 0.9, desc: 'treatment much better' },
                { controlRate: 0.9, treatmentRate: 0.1, desc: 'control much better' },
                { controlRate: 0.5, treatmentRate: 0.5, desc: 'equal' },
                { controlRate: 0.99, treatmentRate: 0.01, desc: 'extreme control' },
                { controlRate: 0.01, treatmentRate: 0.99, desc: 'extreme treatment' },
            ];
            
            for (const scenario of scenarios) {
                const control: MetricsSummary = {
                    variantId: 'control',
                    sampleSize: 15,
                    successRate: scenario.controlRate,
                    avgGenerationTimeMs: 1000,
                    avgPositiveTokens: 80,
                    avgNegativeTokens: 20,
                    safetyFilterRate: 0.1,
                    regenerationRate: 0.2,
                    avgUserRating: null,
                    ratingCount: 0,
                };
                
                const treatment: MetricsSummary = {
                    variantId: 'treatment',
                    sampleSize: 15,
                    successRate: scenario.treatmentRate,
                    avgGenerationTimeMs: 900,
                    avgPositiveTokens: 75,
                    avgNegativeTokens: 20,
                    safetyFilterRate: 0.05,
                    regenerationRate: 0.1,
                    avgUserRating: null,
                    ratingCount: 0,
                };
                
                const result = bayesianCompareVariants(control, treatment);
                
                expect(result.probabilityTreatmentBetter).toBeGreaterThanOrEqual(0);
                expect(result.probabilityTreatmentBetter).toBeLessThanOrEqual(1);
                
                // Also verify credible intervals are valid
                expect(result.credibleIntervalControl[0]).toBeGreaterThanOrEqual(0);
                expect(result.credibleIntervalControl[1]).toBeLessThanOrEqual(1);
                expect(result.credibleIntervalControl[0]).toBeLessThan(result.credibleIntervalControl[1]);
                
                expect(result.credibleIntervalTreatment[0]).toBeGreaterThanOrEqual(0);
                expect(result.credibleIntervalTreatment[1]).toBeLessThanOrEqual(1);
                expect(result.credibleIntervalTreatment[0]).toBeLessThan(result.credibleIntervalTreatment[1]);
            }
        });
    });

    describe('compareVariants', () => {
        it('should return result with isSignificant=false when sample sizes are insufficient', () => {
            const control: MetricsSummary = {
                variantId: 'control',
                sampleSize: 10,  // Below MIN_SAMPLE_SIZE (30)
                successRate: 0.5,
                avgGenerationTimeMs: 1000,
                avgPositiveTokens: 80,
                avgNegativeTokens: 20,
                safetyFilterRate: 0.1,
                regenerationRate: 0.2,
                avgUserRating: null,
                ratingCount: 0,
            };
            
            const treatment: MetricsSummary = {
                variantId: 'treatment',
                sampleSize: 10,  // Below MIN_SAMPLE_SIZE (30)
                successRate: 0.6,
                avgGenerationTimeMs: 900,
                avgPositiveTokens: 75,
                avgNegativeTokens: 20,
                safetyFilterRate: 0.05,
                regenerationRate: 0.1,
                avgUserRating: null,
                ratingCount: 0,
            };
            
            const result = compareVariants(control, treatment, 'successRate');
            // Should return comparison result, but with isSignificant=false due to low sample size
            expect(result).not.toBeNull();
            expect(result?.isSignificant).toBe(false);
        });
    });
});
