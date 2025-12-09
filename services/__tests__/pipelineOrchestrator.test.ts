/**
 * Pipeline Orchestrator Tests
 * 
 * Tests for the internal pipeline orchestration layer.
 * 
 * Part of D1 - Pipeline Orchestration & Workflow Management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    runPipeline,
    topologicalSort,
    createNoOpStep,
    type PipelineDefinition,
    type PipelineStep,
} from '../pipelineOrchestrator';
import {
    getProductionQaGoldenPipeline,
    AVAILABLE_PIPELINES,
    DEFAULT_GOLDEN_SAMPLE,
} from '../../pipelines/productionQaGoldenPipeline';

// ============================================================================
// Topological Sort Tests
// ============================================================================

describe('topologicalSort', () => {
    it('returns steps in order when no dependencies', () => {
        const steps: PipelineStep[] = [
            createNoOpStep('a', 'Step A'),
            createNoOpStep('b', 'Step B'),
            createNoOpStep('c', 'Step C'),
        ];

        const sorted = topologicalSort(steps);
        expect(sorted.map(s => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('respects dependency order', () => {
        const steps: PipelineStep[] = [
            { id: 'c', description: 'Step C', dependsOn: ['b'], run: async () => ({ status: 'succeeded' }) },
            { id: 'a', description: 'Step A', run: async () => ({ status: 'succeeded' }) },
            { id: 'b', description: 'Step B', dependsOn: ['a'], run: async () => ({ status: 'succeeded' }) },
        ];

        const sorted = topologicalSort(steps);
        const order = sorted.map(s => s.id);
        
        // a must come before b, b must come before c
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('handles diamond dependencies', () => {
        // A -> B -> D
        //  \-> C -/
        const steps: PipelineStep[] = [
            { id: 'd', description: 'Step D', dependsOn: ['b', 'c'], run: async () => ({ status: 'succeeded' }) },
            { id: 'b', description: 'Step B', dependsOn: ['a'], run: async () => ({ status: 'succeeded' }) },
            { id: 'c', description: 'Step C', dependsOn: ['a'], run: async () => ({ status: 'succeeded' }) },
            { id: 'a', description: 'Step A', run: async () => ({ status: 'succeeded' }) },
        ];

        const sorted = topologicalSort(steps);
        const order = sorted.map(s => s.id);
        
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
        expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    });

    it('throws on circular dependency', () => {
        const steps: PipelineStep[] = [
            { id: 'a', description: 'Step A', dependsOn: ['b'], run: async () => ({ status: 'succeeded' }) },
            { id: 'b', description: 'Step B', dependsOn: ['a'], run: async () => ({ status: 'succeeded' }) },
        ];

        expect(() => topologicalSort(steps)).toThrow(/Circular dependency/);
    });

    it('throws on unknown dependency', () => {
        const steps: PipelineStep[] = [
            { id: 'a', description: 'Step A', dependsOn: ['unknown'], run: async () => ({ status: 'succeeded' }) },
        ];

        expect(() => topologicalSort(steps)).toThrow(/unknown step/);
    });
});

// ============================================================================
// Pipeline Runner Tests
// ============================================================================

describe('runPipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('runs a simple 3-step pipeline with context updates', async () => {
        const pipeline: PipelineDefinition = {
            id: 'test-pipeline',
            description: 'Test pipeline',
            steps: [
                {
                    id: 'step1',
                    description: 'Step 1',
                    run: async (ctx) => ({
                        status: 'succeeded',
                        contextUpdates: { counter: ((ctx.counter as number) || 0) + 1 },
                    }),
                },
                {
                    id: 'step2',
                    description: 'Step 2',
                    run: async (ctx) => ({
                        status: 'succeeded',
                        contextUpdates: { counter: ((ctx.counter as number) || 0) + 10 },
                    }),
                },
                {
                    id: 'step3',
                    description: 'Step 3',
                    run: async (ctx) => ({
                        status: 'succeeded',
                        contextUpdates: { counter: ((ctx.counter as number) || 0) + 100 },
                    }),
                },
            ],
        };

        const result = await runPipeline(pipeline, {}, { logger: () => {} });

        expect(result.status).toBe('succeeded');
        expect(result.pipelineId).toBe('test-pipeline');
        expect(result.stepResults['step1']!.status).toBe('succeeded');
        expect(result.stepResults['step2']!.status).toBe('succeeded');
        expect(result.stepResults['step3']!.status).toBe('succeeded');
        // 0 + 1 = 1, 1 + 10 = 11, 11 + 100 = 111
        expect(result.finalContext.counter).toBe(111);
    });

    it('marks dependent steps as skipped when dependency fails', async () => {
        const pipeline: PipelineDefinition = {
            id: 'test-failure',
            description: 'Test failure handling',
            steps: [
                {
                    id: 'step-a',
                    description: 'Step A',
                    run: async () => ({ status: 'succeeded' }),
                },
                {
                    id: 'step-b',
                    description: 'Step B (fails)',
                    dependsOn: ['step-a'],
                    run: async () => ({
                        status: 'failed',
                        errorMessage: 'Intentional failure',
                    }),
                },
                {
                    id: 'step-c',
                    description: 'Step C (depends on B)',
                    dependsOn: ['step-b'],
                    run: async () => ({ status: 'succeeded' }),
                },
            ],
        };

        const result = await runPipeline(pipeline, {}, { logger: () => {} });

        expect(result.status).toBe('failed');
        expect(result.stepResults['step-a']!.status).toBe('succeeded');
        expect(result.stepResults['step-b']!.status).toBe('failed');
        expect(result.stepResults['step-b']!.errorMessage).toBe('Intentional failure');
        expect(result.stepResults['step-c']!.status).toBe('skipped');
    });

    it('handles step throwing an exception', async () => {
        const pipeline: PipelineDefinition = {
            id: 'test-exception',
            description: 'Test exception handling',
            steps: [
                {
                    id: 'thrower',
                    description: 'Throws an error',
                    run: async () => {
                        throw new Error('Unexpected error');
                    },
                },
            ],
        };

        const result = await runPipeline(pipeline, {}, { logger: () => {} });

        expect(result.status).toBe('failed');
        expect(result.stepResults['thrower']!.status).toBe('failed');
        expect(result.stepResults['thrower']!.errorMessage).toBe('Unexpected error');
    });

    it('supports dry-run mode without executing steps', async () => {
        const runFn = vi.fn().mockResolvedValue({ status: 'succeeded' });
        
        const pipeline: PipelineDefinition = {
            id: 'test-dry-run',
            description: 'Test dry run',
            steps: [
                { id: 'step1', description: 'Step 1', run: runFn },
                { id: 'step2', description: 'Step 2', run: runFn },
            ],
        };

        const result = await runPipeline(pipeline, {}, { dryRun: true, logger: () => {} });

        expect(result.status).toBe('succeeded');
        expect(runFn).not.toHaveBeenCalled();
    });

    it('includes timing information', async () => {
        const pipeline: PipelineDefinition = {
            id: 'test-timing',
            description: 'Test timing',
            steps: [
                {
                    id: 'slow-step',
                    description: 'Slow step',
                    run: async () => {
                        await new Promise(resolve => setTimeout(resolve, 50));
                        return { status: 'succeeded' };
                    },
                },
            ],
        };

        const result = await runPipeline(pipeline, {}, { logger: () => {} });

        expect(result.startedAt).toBeDefined();
        expect(result.finishedAt).toBeDefined();
        expect(result.totalDurationMs).toBeGreaterThanOrEqual(50);
        expect(result.stepResults['slow-step']!.durationMs).toBeGreaterThanOrEqual(50);
    });

    it('preserves initial context', async () => {
        const pipeline: PipelineDefinition = {
            id: 'test-initial-context',
            description: 'Test initial context',
            steps: [
                {
                    id: 'reader',
                    description: 'Reads initial context',
                    run: async (ctx) => ({
                        status: 'succeeded',
                        contextUpdates: { foundValue: ctx.initialValue },
                    }),
                },
            ],
        };

        const result = await runPipeline(
            pipeline,
            { initialValue: 'hello' },
            { logger: () => {} }
        );

        expect(result.finalContext.initialValue).toBe('hello');
        expect(result.finalContext.foundValue).toBe('hello');
    });

    it('handles invalid pipeline definition (circular dependency)', async () => {
        const pipeline: PipelineDefinition = {
            id: 'test-invalid',
            description: 'Invalid pipeline',
            steps: [
                { id: 'a', description: 'A', dependsOn: ['b'], run: async () => ({ status: 'succeeded' }) },
                { id: 'b', description: 'B', dependsOn: ['a'], run: async () => ({ status: 'succeeded' }) },
            ],
        };

        const result = await runPipeline(pipeline, {}, { logger: () => {} });

        expect(result.status).toBe('failed');
        expect(result.stepResults['a']!.errorMessage).toContain('Circular dependency');
    });
});

// ============================================================================
// Production QA Golden Pipeline Structure Tests
// ============================================================================

describe('getProductionQaGoldenPipeline', () => {
    it('returns a valid pipeline definition', () => {
        const pipeline = getProductionQaGoldenPipeline();

        expect(pipeline.id).toBe('production-qa-golden');
        expect(pipeline.description).toContain('golden sample');
        expect(pipeline.steps).toBeDefined();
        expect(pipeline.steps.length).toBeGreaterThan(0);
    });

    it('has expected step IDs', () => {
        const pipeline = getProductionQaGoldenPipeline();
        const stepIds = pipeline.steps.map(s => s.id);

        expect(stepIds).toContain('generate-golden-video');
        expect(stepIds).toContain('run-vision-qa');
        expect(stepIds).toContain('run-video-benchmark');
        expect(stepIds).toContain('verify-manifest');
    });

    it('has correct dependency structure', () => {
        const pipeline = getProductionQaGoldenPipeline();
        const stepMap = new Map(pipeline.steps.map(s => [s.id, s]));

        // Generate step should have no dependencies
        const generateStep = stepMap.get('generate-golden-video');
        expect(generateStep).toBeDefined();
        expect(generateStep!.dependsOn).toBeUndefined();

        // Temporal regularization depends on generation
        const temporalStep = stepMap.get('temporal-regularization');
        expect(temporalStep).toBeDefined();
        expect(temporalStep!.dependsOn).toContain('generate-golden-video');

        // Vision QA depends on temporal-regularization (which depends on generation)
        const visionStep = stepMap.get('run-vision-qa');
        expect(visionStep).toBeDefined();
        expect(visionStep!.dependsOn).toContain('temporal-regularization');

        // Benchmark depends on temporal-regularization
        const benchmarkStep = stepMap.get('run-video-benchmark');
        expect(benchmarkStep).toBeDefined();
        expect(benchmarkStep!.dependsOn).toContain('temporal-regularization');

        // Manifest depends on generation
        const manifestStep = stepMap.get('verify-manifest');
        expect(manifestStep).toBeDefined();
        expect(manifestStep!.dependsOn).toContain('generate-golden-video');
    });

    it('all steps have run functions', () => {
        const pipeline = getProductionQaGoldenPipeline();

        for (const step of pipeline.steps) {
            expect(typeof step.run).toBe('function');
        }
    });

    it('supports custom sample option', () => {
        const pipeline = getProductionQaGoldenPipeline({ sample: 'sample-002-character' });

        expect(pipeline.description).toContain('sample-002-character');
    });

    it('can be topologically sorted without error', () => {
        const pipeline = getProductionQaGoldenPipeline();
        
        // Should not throw
        const sorted = topologicalSort(pipeline.steps);
        expect(sorted.length).toBe(pipeline.steps.length);
        
        // Preflight check should come first, then generate step
        expect(sorted[0]!.id).toBe('preflight-check');
        expect(sorted[1]!.id).toBe('generate-golden-video');
    });
});

// ============================================================================
// Available Pipelines Tests
// ============================================================================

describe('AVAILABLE_PIPELINES', () => {
    it('includes production-qa-golden', () => {
        expect(AVAILABLE_PIPELINES).toContain('production-qa-golden');
    });

    it('exports DEFAULT_GOLDEN_SAMPLE', () => {
        expect(DEFAULT_GOLDEN_SAMPLE).toBe('sample-001-geometric');
    });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('createNoOpStep', () => {
    it('creates a step that succeeds', async () => {
        const step = createNoOpStep('test', 'Test step');
        
        expect(step.id).toBe('test');
        expect(step.description).toBe('Test step');
        
        const result = await step.run({});
        expect(result.status).toBe('succeeded');
    });
});
