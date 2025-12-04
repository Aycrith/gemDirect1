/**
 * Pipeline Metrics Service Tests
 * 
 * Tests for the chain-of-frames pipeline metrics tracking system.
 * Validates timing calculations, aggregation functions, and metric storage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    startPipeline,
    recordShotQueued,
    recordShotStarted,
    recordShotCompleted,
    recordShotValidation,
    completePipeline,
    getActivePipeline,
    getPipelineHistory,
    getGlobalStats,
    clearMetricsHistory,
    exportMetrics,
    generateRunId,
} from '../pipelineMetrics';

describe('pipelineMetrics', () => {
    beforeEach(() => {
        clearMetricsHistory();
    });

    describe('generateRunId', () => {
        it('should generate unique run IDs', () => {
            const id1 = generateRunId();
            const id2 = generateRunId();
            
            expect(id1).toMatch(/^run_\d+_[a-z0-9]+$/);
            expect(id2).toMatch(/^run_\d+_[a-z0-9]+$/);
            expect(id1).not.toBe(id2);
        });
    });

    describe('startPipeline', () => {
        it('should create a new pipeline with correct initial state', () => {
            const metrics = startPipeline('scene-123', 3, 'wan-i2v');
            
            expect(metrics.runId).toMatch(/^run_\d+_/);
            expect(metrics.sceneId).toBe('scene-123');
            expect(metrics.totalShots).toBe(3);
            expect(metrics.workflowProfile).toBe('wan-i2v');
            expect(metrics.successfulShots).toBe(0);
            expect(metrics.failedShots).toBe(0);
            expect(metrics.startedAt).toBeGreaterThan(0);
            expect(metrics.shots).toEqual([]);
        });

        it('should track pipeline in active pipelines', () => {
            const metrics = startPipeline('scene-123', 3, 'wan-i2v');
            
            const active = getActivePipeline(metrics.runId);
            expect(active).toBeDefined();
            expect(active?.runId).toBe(metrics.runId);
        });
    });

    describe('recordShotQueued', () => {
        it('should add shot metrics to pipeline', () => {
            const pipeline = startPipeline('scene-123', 3, 'wan-i2v');
            
            const shotMetrics = recordShotQueued(pipeline.runId, 'shot-1', 0, 'prompt-abc', 4000000000);
            
            expect(shotMetrics).not.toBeNull();
            expect(shotMetrics?.shotId).toBe('shot-1');
            expect(shotMetrics?.shotIndex).toBe(0);
            expect(shotMetrics?.promptId).toBe('prompt-abc');
            expect(shotMetrics?.queuedAt).toBeGreaterThan(0);
            expect(shotMetrics?.vramBeforeBytes).toBe(4000000000);
        });

        it('should return null for non-existent pipeline', () => {
            const shotMetrics = recordShotQueued('non-existent', 'shot-1', 0);
            expect(shotMetrics).toBeNull();
        });
    });

    describe('recordShotStarted', () => {
        it('should record start time and calculate queue wait', async () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-1', 0);
            
            // Simulate queue wait
            await new Promise(resolve => setTimeout(resolve, 10));
            
            recordShotStarted(pipeline.runId, 'shot-1');
            
            const active = getActivePipeline(pipeline.runId);
            const shot = active?.shots[0];
            
            expect(shot?.startedAt).toBeGreaterThan(shot?.queuedAt ?? 0);
            expect(shot?.queueWaitMs).toBeGreaterThan(0);
        });
    });

    describe('recordShotCompleted', () => {
        it('should record completion for successful shot', () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-1', 0, undefined, 4000000000);
            recordShotCompleted(pipeline.runId, 'shot-1', true, 3500000000, 4500000000);
            
            const active = getActivePipeline(pipeline.runId);
            const shot = active?.shots[0];
            
            expect(shot?.completedAt).toBeGreaterThan(0);
            expect(shot?.totalDurationMs).toBeGreaterThanOrEqual(0);
            expect(shot?.vramAfterBytes).toBe(3500000000);
            expect(shot?.vramPeakBytes).toBe(4500000000);
            expect(active?.successfulShots).toBe(1);
            expect(active?.failedShots).toBe(0);
        });

        it('should record completion for failed shot', () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-1', 0);
            recordShotCompleted(pipeline.runId, 'shot-1', false, undefined, undefined, 'Out of VRAM');
            
            const active = getActivePipeline(pipeline.runId);
            const shot = active?.shots[0];
            
            expect(shot?.error).toBe('Out of VRAM');
            expect(active?.successfulShots).toBe(0);
            expect(active?.failedShots).toBe(1);
        });
    });

    describe('recordShotValidation', () => {
        it('should record validation results', () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-1', 0);
            recordShotValidation(
                pipeline.runId, 
                'shot-1', 
                false, 
                ['Duration too short'], 
                ['Low bitrate']
            );
            
            const active = getActivePipeline(pipeline.runId);
            const shot = active?.shots[0];
            
            expect(shot?.validationPassed).toBe(false);
            expect(shot?.validationErrors).toEqual(['Duration too short']);
            expect(shot?.validationWarnings).toEqual(['Low bitrate']);
        });
    });

    describe('completePipeline', () => {
        it('should calculate aggregates on completion', async () => {
            const pipeline = startPipeline('scene-123', 3, 'wan-i2v');
            
            // Simulate 3 shots with different durations
            for (let i = 0; i < 3; i++) {
                recordShotQueued(pipeline.runId, `shot-${i}`, i);
                await new Promise(resolve => setTimeout(resolve, 5 + i * 5)); // 5, 10, 15ms
                recordShotCompleted(pipeline.runId, `shot-${i}`, true);
            }
            
            const completed = completePipeline(pipeline.runId);
            
            expect(completed).not.toBeNull();
            expect(completed?.completedAt).toBeGreaterThan(completed?.startedAt ?? 0);
            expect(completed?.totalDurationMs).toBeGreaterThan(0);
            expect(completed?.aggregates).toBeDefined();
            expect(completed?.aggregates?.avgShotDurationMs).toBeGreaterThan(0);
            expect(completed?.aggregates?.p50ShotDurationMs).toBeGreaterThan(0);
            expect(completed?.aggregates?.p95ShotDurationMs).toBeGreaterThan(0);
        });

        it('should move pipeline to history', () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-1', 0);
            recordShotCompleted(pipeline.runId, 'shot-1', true);
            
            completePipeline(pipeline.runId);
            
            expect(getActivePipeline(pipeline.runId)).toBeUndefined();
            expect(getPipelineHistory(1)[0]?.runId).toBe(pipeline.runId);
        });

        it('should calculate validation pass rate', () => {
            const pipeline = startPipeline('scene-123', 3, 'wan-i2v');
            
            recordShotQueued(pipeline.runId, 'shot-0', 0);
            recordShotCompleted(pipeline.runId, 'shot-0', true);
            recordShotValidation(pipeline.runId, 'shot-0', true);
            
            recordShotQueued(pipeline.runId, 'shot-1', 1);
            recordShotCompleted(pipeline.runId, 'shot-1', true);
            recordShotValidation(pipeline.runId, 'shot-1', true);
            
            recordShotQueued(pipeline.runId, 'shot-2', 2);
            recordShotCompleted(pipeline.runId, 'shot-2', true);
            recordShotValidation(pipeline.runId, 'shot-2', false, ['Error']);
            
            const completed = completePipeline(pipeline.runId);
            
            expect(completed?.aggregates?.validationPassRate).toBeCloseTo(2/3, 2);
        });
    });

    describe('getGlobalStats', () => {
        it('should return zeros when no history', () => {
            const stats = getGlobalStats();
            
            expect(stats.totalRuns).toBe(0);
            expect(stats.totalShots).toBe(0);
            expect(stats.overallSuccessRate).toBe(0);
        });

        it('should aggregate across multiple runs', async () => {
            // Run 1: 2 shots, 1 success, 1 fail
            const p1 = startPipeline('scene-1', 2, 'wan-i2v');
            recordShotQueued(p1.runId, 'shot-0', 0);
            await new Promise(r => setTimeout(r, 5));
            recordShotCompleted(p1.runId, 'shot-0', true);
            recordShotQueued(p1.runId, 'shot-1', 1);
            recordShotCompleted(p1.runId, 'shot-1', false, undefined, undefined, 'Error');
            completePipeline(p1.runId);
            
            // Run 2: 3 shots, 3 success
            const p2 = startPipeline('scene-2', 3, 'wan-i2v');
            for (let i = 0; i < 3; i++) {
                recordShotQueued(p2.runId, `shot-${i}`, i);
                await new Promise(r => setTimeout(r, 5));
                recordShotCompleted(p2.runId, `shot-${i}`, true);
            }
            completePipeline(p2.runId);
            
            const stats = getGlobalStats();
            
            expect(stats.totalRuns).toBe(2);
            expect(stats.totalShots).toBe(5);
            expect(stats.overallSuccessRate).toBe(4/5); // 4 successful out of 5
        });
    });

    describe('exportMetrics', () => {
        it('should export all metrics data', () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-1', 0);
            recordShotCompleted(pipeline.runId, 'shot-1', true);
            completePipeline(pipeline.runId);
            
            const exported = exportMetrics();
            
            expect(exported.activePipelines).toEqual([]);
            expect(exported.history.length).toBe(1);
            expect(exported.globalStats.totalRuns).toBe(1);
        });
    });

    describe('percentile calculations', () => {
        it('should calculate P50 correctly for odd number of values', async () => {
            const pipeline = startPipeline('scene-123', 5, 'wan-i2v');
            
            // Shots with durations roughly: 10, 20, 30, 40, 50ms
            for (let i = 0; i < 5; i++) {
                recordShotQueued(pipeline.runId, `shot-${i}`, i);
                await new Promise(r => setTimeout(r, 10 * (i + 1)));
                recordShotCompleted(pipeline.runId, `shot-${i}`, true);
            }
            
            const completed = completePipeline(pipeline.runId);
            
            // P50 should be around the middle value
            expect(completed?.aggregates?.p50ShotDurationMs).toBeGreaterThan(0);
            // P95 should be near the max
            expect(completed?.aggregates?.p95ShotDurationMs).toBeGreaterThanOrEqual(
                completed?.aggregates?.p50ShotDurationMs ?? 0
            );
        });

        it('should handle single shot correctly', () => {
            const pipeline = startPipeline('scene-123', 1, 'wan-i2v');
            recordShotQueued(pipeline.runId, 'shot-0', 0);
            recordShotCompleted(pipeline.runId, 'shot-0', true);
            
            const completed = completePipeline(pipeline.runId);
            
            expect(completed?.aggregates?.p50ShotDurationMs).toBeGreaterThanOrEqual(0);
            expect(completed?.aggregates?.p95ShotDurationMs).toBeGreaterThanOrEqual(0);
            expect(completed?.aggregates?.avgShotDurationMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('history limits', () => {
        it('should limit history to MAX_HISTORY_SIZE', () => {
            // Create 55 pipelines (more than MAX_HISTORY_SIZE of 50)
            for (let i = 0; i < 55; i++) {
                const p = startPipeline(`scene-${i}`, 1, 'wan-i2v');
                recordShotQueued(p.runId, 'shot-0', 0);
                recordShotCompleted(p.runId, 'shot-0', true);
                completePipeline(p.runId);
            }
            
            const history = getPipelineHistory(100);
            expect(history.length).toBe(50);
        });
    });
});
