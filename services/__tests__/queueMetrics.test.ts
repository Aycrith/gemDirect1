/**
 * Queue Metrics Service Tests
 * 
 * @module services/__tests__/queueMetrics.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { queueMetrics } from '../queueMetrics';

describe('queueMetrics', () => {
    beforeEach(() => {
        queueMetrics.reset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        queueMetrics.stop();
        vi.useRealTimers();
    });

    describe('event recording', () => {
        it('should record enqueue events', () => {
            queueMetrics.recordEnqueue('task-1', 'video', 'normal');
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.totalEnqueued).toBe(1);
            expect(summary.lifetime.totalEnqueued).toBe(1);
        });

        it('should record dequeue events with wait time', () => {
            queueMetrics.recordDequeue('task-1', 1500);
            
            const events = queueMetrics.getRecentEvents();
            const dequeueEvent = events.find(e => e.type === 'dequeue');
            expect(dequeueEvent).toBeDefined();
            expect(dequeueEvent?.data?.waitTimeMs).toBe(1500);
        });

        it('should record complete events with execution time', () => {
            queueMetrics.recordComplete('task-1', 5000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.totalCompleted).toBe(1);
            expect(summary.lifetime.totalCompleted).toBe(1);
        });

        it('should record fail events', () => {
            queueMetrics.recordFail('task-1', 'GPU error');
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.totalFailed).toBe(1);
            expect(summary.lifetime.totalFailed).toBe(1);
        });

        it('should record cancel events', () => {
            queueMetrics.recordCancel('task-1');
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.totalCancelled).toBe(1);
        });

        it('should record timeout events', () => {
            queueMetrics.recordTimeout('task-1', 60000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.totalTimedOut).toBe(1);
        });

        it('should record circuit breaker open events', () => {
            queueMetrics.recordCircuitOpen(3, 30000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.circuitBreakerOpenCount).toBe(1);
            
            const events = queueMetrics.getRecentEvents();
            const circuitEvent = events.find(e => e.type === 'circuit-open');
            expect(circuitEvent?.data?.consecutiveFailures).toBe(3);
        });

        it('should record VRAM gate events', () => {
            queueMetrics.recordVRAMGate(2000, 4096);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.vramGateCount).toBe(1);
        });
    });

    describe('metrics calculation', () => {
        it('should calculate average wait time', () => {
            queueMetrics.recordDequeue('t1', 1000);
            queueMetrics.recordDequeue('t2', 2000);
            queueMetrics.recordDequeue('t3', 3000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.avgQueueWaitMs).toBe(2000);
        });

        it('should calculate average execution time', () => {
            queueMetrics.recordComplete('t1', 5000);
            queueMetrics.recordComplete('t2', 10000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.avgExecutionTimeMs).toBe(7500);
        });

        it('should calculate success rate', () => {
            queueMetrics.recordComplete('t1', 1000);
            queueMetrics.recordComplete('t2', 1000);
            queueMetrics.recordComplete('t3', 1000);
            queueMetrics.recordFail('t4', 'error');
            
            const summary = queueMetrics.getSummary();
            // 3 completed / 4 total = 0.75
            expect(summary.currentWindow.successRate).toBe(0.75);
        });

        it('should calculate lifetime averages', () => {
            queueMetrics.recordEnqueue('t1', 'video', 'normal');
            queueMetrics.recordDequeue('t1', 1000);
            queueMetrics.recordComplete('t1', 5000);
            
            queueMetrics.recordEnqueue('t2', 'video', 'normal');
            queueMetrics.recordDequeue('t2', 2000);
            queueMetrics.recordComplete('t2', 10000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.lifetime.totalEnqueued).toBe(2);
            expect(summary.lifetime.totalCompleted).toBe(2);
            expect(summary.lifetime.avgQueueWaitMs).toBe(1500);
            expect(summary.lifetime.avgExecutionTimeMs).toBe(7500);
        });

        it('should handle empty metrics gracefully', () => {
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.avgQueueWaitMs).toBe(0);
            expect(summary.currentWindow.successRate).toBe(0);
            expect(summary.lifetime.successRate).toBe(0);
        });
    });

    describe('window management', () => {
        it('should track events in current window', () => {
            queueMetrics.recordEnqueue('t1', 'keyframe', 'high');
            queueMetrics.recordEnqueue('t2', 'video', 'normal');
            
            const events = queueMetrics.getRecentEvents();
            expect(events.length).toBe(2);
            expect(events[0]?.type).toBe('enqueue');
        });

        it('should limit recent events', () => {
            for (let i = 0; i < 100; i++) {
                queueMetrics.recordEnqueue(`t${i}`, 'video', 'normal');
            }
            
            const events = queueMetrics.getRecentEvents(50);
            expect(events.length).toBe(50);
        });

        it('should export all metrics data', () => {
            queueMetrics.recordEnqueue('t1', 'video', 'normal');
            queueMetrics.recordComplete('t1', 5000);
            
            const exported = queueMetrics.export();
            expect(exported.exportedAt).toBeGreaterThan(0);
            expect(exported.summary.lifetime.totalCompleted).toBe(1);
            expect(exported.currentWindow.totalEnqueued).toBe(1);
        });
    });

    describe('snapshot collection', () => {
        it('should start collecting snapshots', () => {
            const mockGetState = vi.fn().mockReturnValue({
                size: 2,
                isRunning: true,
                currentTaskId: 'task-1',
                isCircuitOpen: false,
                consecutiveFailures: 0,
                stats: {
                    totalQueued: 5,
                    totalCompleted: 3,
                    totalFailed: 0,
                    totalCancelled: 0,
                    averageWaitTimeMs: 1000,
                    averageExecutionTimeMs: 5000,
                },
            });

            queueMetrics.start(mockGetState);
            
            // Advance time to trigger snapshot
            vi.advanceTimersByTime(5000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.snapshots.length).toBeGreaterThan(0);
        });

        it('should stop collecting snapshots', () => {
            const mockGetState = vi.fn().mockReturnValue({ size: 0, isRunning: false });
            
            queueMetrics.start(mockGetState);
            vi.advanceTimersByTime(5000);
            
            const before = queueMetrics.getSummary().currentWindow.snapshots.length;
            
            queueMetrics.stop();
            vi.advanceTimersByTime(10000);
            
            const after = queueMetrics.getSummary().currentWindow.snapshots.length;
            expect(after).toBe(before);
        });
    });

    describe('reset', () => {
        it('should reset all metrics', () => {
            queueMetrics.recordEnqueue('t1', 'video', 'normal');
            queueMetrics.recordComplete('t1', 5000);
            queueMetrics.recordFail('t2', 'error');
            
            queueMetrics.reset();
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.totalEnqueued).toBe(0);
            expect(summary.currentWindow.totalCompleted).toBe(0);
            expect(summary.lifetime.totalEnqueued).toBe(0);
        });
    });

    describe('event types', () => {
        it('should track all event types correctly', () => {
            queueMetrics.recordEnqueue('t1', 'video', 'high');
            queueMetrics.recordDequeue('t1', 500);
            queueMetrics.recordComplete('t1', 3000);
            queueMetrics.recordEnqueue('t2', 'keyframe', 'normal');
            queueMetrics.recordFail('t2', 'VRAM exhausted');
            queueMetrics.recordCircuitOpen(3, 30000);
            queueMetrics.recordCircuitClose();
            queueMetrics.recordVRAMGate(1000, 4096);
            
            const events = queueMetrics.getRecentEvents();
            const types = events.map(e => e.type);
            
            expect(types).toContain('enqueue');
            expect(types).toContain('dequeue');
            expect(types).toContain('complete');
            expect(types).toContain('fail');
            expect(types).toContain('circuit-open');
            expect(types).toContain('circuit-close');
            expect(types).toContain('vram-gate');
        });

        it('should include task metadata in events', () => {
            queueMetrics.recordEnqueue('my-task-123', 'video', 'high');
            
            const events = queueMetrics.getRecentEvents();
            const enqueueEvent = events.find(e => e.type === 'enqueue');
            
            expect(enqueueEvent?.taskId).toBe('my-task-123');
            expect(enqueueEvent?.taskType).toBe('video');
            expect(enqueueEvent?.priority).toBe('high');
        });
    });

    describe('percentile calculations', () => {
        it('should calculate p95 wait time', () => {
            // Add 100 samples with known distribution
            for (let i = 1; i <= 100; i++) {
                queueMetrics.recordDequeue(`t${i}`, i * 100); // 100, 200, 300, ..., 10000
            }
            
            const summary = queueMetrics.getSummary();
            // P95 should be around 9500ms (95th percentile of 100-10000)
            expect(summary.currentWindow.p95QueueWaitMs).toBeGreaterThanOrEqual(9400);
            expect(summary.currentWindow.p95QueueWaitMs).toBeLessThanOrEqual(9600);
        });

        it('should calculate max wait time', () => {
            queueMetrics.recordDequeue('t1', 1000);
            queueMetrics.recordDequeue('t2', 5000);
            queueMetrics.recordDequeue('t3', 3000);
            
            const summary = queueMetrics.getSummary();
            expect(summary.currentWindow.maxQueueWaitMs).toBe(5000);
        });
    });

    describe('throughput calculation', () => {
        it('should calculate throughput per minute', () => {
            // Simulate 6 completions over a simulated time period
            queueMetrics.recordComplete('t1', 1000);
            queueMetrics.recordComplete('t2', 1000);
            queueMetrics.recordComplete('t3', 1000);
            queueMetrics.recordComplete('t4', 1000);
            queueMetrics.recordComplete('t5', 1000);
            queueMetrics.recordComplete('t6', 1000);
            
            // Advance time by 2 minutes
            vi.advanceTimersByTime(2 * 60 * 1000);
            
            // Force window finalization
            const summary = queueMetrics.getSummary();
            
            // 6 completions in ~2 minutes = ~3 per minute
            // Note: actual calculation depends on window start time
            expect(summary.currentWindow.throughputPerMinute).toBeGreaterThan(0);
        });
    });
});
