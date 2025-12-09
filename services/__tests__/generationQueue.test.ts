/**
 * Unit tests for GenerationQueue service
 * 
 * Tests the serial queue for resource-intensive generation operations including:
 * - FIFO queue behavior with priority ordering
 * - Circuit breaker pattern for consecutive failures
 * - VRAM gating (optional)
 * - Task cancellation
 * - Timeout handling
 * - State management and listeners
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    GenerationQueue,
    createGenerationQueue,
    getGenerationQueue,
    resetGlobalQueue,
    generateTaskId,
    createKeyframeTask,
    createVideoTask,
    type GenerationTask,
    type GenerationStatus,
    type VRAMStatus,
} from '../generationQueue';
import { ErrorCodes, CSGError } from '../../types/errors';

// Helper to create a simple task
function createTestTask<T>(
    result: T,
    options: Partial<GenerationTask<T>> = {}
): GenerationTask<T> {
    return {
        id: options.id ?? generateTaskId('video'),
        type: options.type ?? 'video',
        priority: options.priority ?? 'normal',
        execute: options.execute ?? (async () => result),
        timeoutMs: options.timeoutMs,
        metadata: options.metadata,
        onProgress: options.onProgress,
        onStatusChange: options.onStatusChange,
    };
}

// Helper to create a delayed task
function createDelayedTask<T>(
    result: T,
    delayMs: number,
    options: Partial<GenerationTask<T>> = {}
): GenerationTask<T> {
    return createTestTask(result, {
        ...options,
        execute: async () => {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return result;
        },
    });
}

// Helper to create a failing task
function createFailingTask(
    error: Error | string,
    options: Partial<GenerationTask<never>> = {}
): GenerationTask<never> {
    return createTestTask(undefined as never, {
        ...options,
        execute: async () => {
            throw typeof error === 'string' ? new Error(error) : error;
        },
    });
}

describe('GenerationQueue', () => {
    let queue: GenerationQueue;
    let pendingPromises: Promise<unknown>[];

    // Helper to enqueue and track promise for cleanup
    const trackEnqueue = <T>(task: GenerationTask<T>): Promise<T> => {
        const promise = queue.enqueue(task);
        pendingPromises.push(promise.catch(() => {})); // Swallow errors for cleanup
        return promise;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        queue = createGenerationQueue();
        pendingPromises = [];
    });

    afterEach(async () => {
        // Run all pending timers to let delayed tasks complete/reject
        await vi.runAllTimersAsync();
        // Then wait for all pending promises to settle
        await Promise.allSettled(pendingPromises);
        pendingPromises = [];
        queue.clear();
        resetGlobalQueue();
        vi.useRealTimers();
    });

    // =========================================================================
    // BASIC ENQUEUE AND EXECUTION
    // =========================================================================

    describe('enqueue', () => {
        it('should execute a single task and return result', async () => {
            const task = createTestTask({ success: true });
            const resultPromise = queue.enqueue(task);
            
            // Allow queue processing
            await vi.runAllTimersAsync();
            
            const result = await resultPromise;
            expect(result).toEqual({ success: true });
        });

        it('should execute tasks in FIFO order', async () => {
            const executionOrder: number[] = [];
            
            const task1 = createTestTask(1, {
                id: 'task-1',
                execute: async () => {
                    executionOrder.push(1);
                    return 1;
                },
            });
            const task2 = createTestTask(2, {
                id: 'task-2',
                execute: async () => {
                    executionOrder.push(2);
                    return 2;
                },
            });
            const task3 = createTestTask(3, {
                id: 'task-3',
                execute: async () => {
                    executionOrder.push(3);
                    return 3;
                },
            });

            const p1 = queue.enqueue(task1);
            const p2 = queue.enqueue(task2);
            const p3 = queue.enqueue(task3);

            await vi.runAllTimersAsync();
            await Promise.all([p1, p2, p3]);

            expect(executionOrder).toEqual([1, 2, 3]);
        });

        it('should only run one task at a time (serial execution)', async () => {
            let concurrentTasks = 0;
            let maxConcurrent = 0;

            const createConcurrencyTask = (id: string) => createTestTask(id, {
                id,
                execute: async () => {
                    concurrentTasks++;
                    maxConcurrent = Math.max(maxConcurrent, concurrentTasks);
                    await new Promise(resolve => setTimeout(resolve, 10));
                    concurrentTasks--;
                    return id;
                },
            });

            const tasks = [
                createConcurrencyTask('a'),
                createConcurrencyTask('b'),
                createConcurrencyTask('c'),
            ];

            const promises = tasks.map(t => queue.enqueue(t));
            await vi.runAllTimersAsync();
            await Promise.all(promises);

            expect(maxConcurrent).toBe(1);
        });

        it('should reject when queue is full', async () => {
            // Create a queue and fill it beyond MAX_QUEUE_SIZE (50)
            // Use a task without timeout to avoid unhandled rejection
            const blockingTask: GenerationTask<string> = {
                id: 'blocking',
                type: 'video',
                priority: 'normal',
                timeoutMs: undefined, // No timeout
                execute: () => new Promise(() => {}), // Never resolves
            };
            const blockingPromise = queue.enqueue(blockingTask);
            pendingPromises.push(blockingPromise.catch(() => {}));

            // Fill the queue
            for (let i = 0; i < 49; i++) {
                const p = queue.enqueue(createTestTask(i, { id: `task-${i}` }));
                pendingPromises.push(p.catch(() => {}));
            }

            // 50th task should be rejected
            const overflowTask = createTestTask('overflow');
            await expect(queue.enqueue(overflowTask)).rejects.toMatchObject({
                code: ErrorCodes.GENERATION_QUEUE_FULL,
            });
        });

        it('should call onStatusChange callbacks', async () => {
            const statusChanges: GenerationStatus[] = [];
            
            const task = createTestTask('result', {
                onStatusChange: (status) => statusChanges.push(status),
            });

            const promise = queue.enqueue(task);
            await vi.runAllTimersAsync();
            await promise;

            expect(statusChanges).toContain('pending');
            expect(statusChanges).toContain('running');
            expect(statusChanges).toContain('completed');
        });
    });

    // =========================================================================
    // PRIORITY ORDERING
    // =========================================================================

    describe('priority ordering', () => {
        it('should execute high priority tasks before normal priority', async () => {
            const executionOrder: string[] = [];

            // First, add a slow task to block the queue
            const slowTask = createDelayedTask('slow', 100, { id: 'slow' });
            trackEnqueue(slowTask);

            // Add tasks in order: normal, normal, high
            const normal1 = createTestTask('n1', {
                id: 'normal-1',
                priority: 'normal',
                execute: async () => { executionOrder.push('normal-1'); return 'n1'; },
            });
            const normal2 = createTestTask('n2', {
                id: 'normal-2',
                priority: 'normal',
                execute: async () => { executionOrder.push('normal-2'); return 'n2'; },
            });
            const high = createTestTask('h', {
                id: 'high-1',
                priority: 'high',
                execute: async () => { executionOrder.push('high-1'); return 'h'; },
            });

            trackEnqueue(normal1);
            trackEnqueue(normal2);
            trackEnqueue(high); // Should jump ahead of normal tasks

            await vi.runAllTimersAsync();

            // High priority should execute before normal priorities
            expect(executionOrder.indexOf('high-1')).toBeLessThan(executionOrder.indexOf('normal-1'));
            expect(executionOrder.indexOf('high-1')).toBeLessThan(executionOrder.indexOf('normal-2'));
        });

        it('should execute normal priority tasks before low priority', async () => {
            const executionOrder: string[] = [];

            // Block queue first
            const slowTask = createDelayedTask('slow', 100, { id: 'slow' });
            trackEnqueue(slowTask);

            const low = createTestTask('l', {
                id: 'low-1',
                priority: 'low',
                execute: async () => { executionOrder.push('low-1'); return 'l'; },
            });
            const normal = createTestTask('n', {
                id: 'normal-1',
                priority: 'normal',
                execute: async () => { executionOrder.push('normal-1'); return 'n'; },
            });

            trackEnqueue(low);
            trackEnqueue(normal); // Should jump ahead of low

            await vi.runAllTimersAsync();

            expect(executionOrder.indexOf('normal-1')).toBeLessThan(executionOrder.indexOf('low-1'));
        });

        it('should maintain FIFO within same priority', async () => {
            const executionOrder: string[] = [];

            // Block queue first
            const slowTask = createDelayedTask('slow', 100, { id: 'slow' });
            trackEnqueue(slowTask);

            for (let i = 1; i <= 3; i++) {
                trackEnqueue(createTestTask(`n${i}`, {
                    id: `normal-${i}`,
                    priority: 'normal',
                    execute: async () => { executionOrder.push(`normal-${i}`); return `n${i}`; },
                }));
            }

            await vi.runAllTimersAsync();

            expect(executionOrder).toEqual(['normal-1', 'normal-2', 'normal-3']);
        });
    });

    // =========================================================================
    // TASK CANCELLATION
    // =========================================================================

    describe('cancel', () => {
        it('should cancel a pending task', async () => {
            // Block queue
            const blockingTask = createDelayedTask('blocking', 1000);
            trackEnqueue(blockingTask);

            const taskToCancel = createTestTask('will-cancel', { id: 'cancel-me' });
            const promise = trackEnqueue(taskToCancel);

            const cancelled = queue.cancel('cancel-me');
            expect(cancelled).toBe(true);

            await expect(promise).rejects.toMatchObject({
                code: ErrorCodes.GENERATION_CANCELLED,
            });
        });

        it('should cancel a running task via AbortController', async () => {
            const runningTask = createDelayedTask('running', 1000, { id: 'running-task' });
            trackEnqueue(runningTask);

            // Let the task start
            await vi.advanceTimersByTimeAsync(10);

            const cancelled = queue.cancel('running-task');
            expect(cancelled).toBe(true);
            
            // Verify the task status was updated to cancelled
            const state = queue.getState();
            expect(state.stats.totalCancelled).toBe(1);
        });

        it('should return false for non-existent task', () => {
            const cancelled = queue.cancel('non-existent');
            expect(cancelled).toBe(false);
        });

        it('should call onStatusChange with cancelled status', async () => {
            const statusChanges: GenerationStatus[] = [];

            // Block queue
            trackEnqueue(createDelayedTask('blocking', 1000));

            const task = createTestTask('cancel-me', {
                id: 'cancel-me',
                onStatusChange: (status) => statusChanges.push(status),
            });
            const promise = trackEnqueue(task);

            queue.cancel('cancel-me');
            await promise.catch(() => {}); // Wait for cancellation

            expect(statusChanges).toContain('pending');
            expect(statusChanges).toContain('cancelled');
        });
    });

    describe('cancelAll', () => {
        it('should cancel all pending tasks', async () => {
            // Block queue
            trackEnqueue(createDelayedTask('blocking', 1000));

            const promises = [
                trackEnqueue(createTestTask('a', { id: 'task-a' })),
                trackEnqueue(createTestTask('b', { id: 'task-b' })),
                trackEnqueue(createTestTask('c', { id: 'task-c' })),
            ];

            const cancelledCount = queue.cancelAll();
            expect(cancelledCount).toBe(3);

            for (const promise of promises) {
                await expect(promise).rejects.toMatchObject({
                    code: ErrorCodes.GENERATION_CANCELLED,
                });
            }
        });

        it('should not cancel the running task', async () => {
            const runningPromise = trackEnqueue(createDelayedTask('running', 1000, { id: 'running' }));
            trackEnqueue(createTestTask('pending', { id: 'pending' }));

            await vi.advanceTimersByTimeAsync(10); // Let first task start

            const cancelledCount = queue.cancelAll();
            expect(cancelledCount).toBe(1); // Only pending task cancelled

            await vi.runAllTimersAsync();
            await expect(runningPromise).resolves.toBe('running');
        });
    });

    // =========================================================================
    // TIMEOUT HANDLING
    // =========================================================================

    describe('timeout', () => {
        it('should timeout a task that takes too long', async () => {
            const longTask = createDelayedTask('never-finishes', 1000000, {
                id: 'long-task',
                timeoutMs: 100,
            });

            const promise = trackEnqueue(longTask);

            await vi.advanceTimersByTimeAsync(150);

            await expect(promise).rejects.toMatchObject({
                code: ErrorCodes.COMFYUI_TIMEOUT_GENERATION,
            });
        });

        it('should call onStatusChange with timeout status', async () => {
            const statusChanges: GenerationStatus[] = [];

            const longTask = createDelayedTask('never-finishes', 1000000, {
                timeoutMs: 100,
                onStatusChange: (status) => statusChanges.push(status),
            });

            trackEnqueue(longTask);
            await vi.advanceTimersByTimeAsync(150);

            expect(statusChanges).toContain('timeout');
        });

        it('should continue processing queue after timeout', async () => {
            const results: string[] = [];

            const longTask = createDelayedTask('timeout', 1000000, {
                id: 'long',
                timeoutMs: 100,
            });
            const shortTask = createTestTask('success', {
                id: 'short',
                execute: async () => { results.push('success'); return 'success'; },
            });

            trackEnqueue(longTask);
            trackEnqueue(shortTask);

            await vi.advanceTimersByTimeAsync(200);

            expect(results).toContain('success');
        });
    });

    // =========================================================================
    // CIRCUIT BREAKER
    // =========================================================================

    describe('circuit breaker', () => {
        it('should open circuit after 3 consecutive failures', async () => {
            for (let i = 0; i < 3; i++) {
                const failingTask = createFailingTask(`Error ${i}`, { id: `fail-${i}` });
                const promise = trackEnqueue(failingTask);
                // Just advance a small amount - failing tasks complete immediately
                await vi.advanceTimersByTimeAsync(10);
                await promise.catch(() => {}); // Wait for rejection
            }

            const state = queue.getState();
            expect(state.isCircuitOpen).toBe(true);
            expect(state.consecutiveFailures).toBe(3);
        });

        it('should not process tasks when circuit is open', async () => {
            // Trigger circuit breaker with 3 failures
            for (let i = 0; i < 3; i++) {
                const promise = trackEnqueue(createFailingTask(`Error ${i}`));
                await vi.advanceTimersByTimeAsync(10);
                await promise.catch(() => {});
            }

            expect(queue.getState().isCircuitOpen).toBe(true);

            // Try to enqueue new task
            const executed = { value: false };
            const newTask = createTestTask('new', {
                id: 'blocked-task',
                execute: async () => { executed.value = true; return 'new'; },
            });
            trackEnqueue(newTask);
            
            // Advance time but not past circuit breaker reset (30s)
            await vi.advanceTimersByTimeAsync(5000);

            expect(executed.value).toBe(false);
            expect(queue.getState().isCircuitOpen).toBe(true);

            // Cancel the blocked task so cleanup doesn't hang
            queue.cancel('blocked-task');
        });

        it('should close circuit after reset time', async () => {
            // Trigger circuit breaker with 3 failures
            for (let i = 0; i < 3; i++) {
                const promise = trackEnqueue(createFailingTask(`Error ${i}`));
                await vi.advanceTimersByTimeAsync(10);
                await promise.catch(() => {});
            }

            expect(queue.getState().isCircuitOpen).toBe(true);

            // Advance past circuit breaker reset time (30s)
            await vi.advanceTimersByTimeAsync(31000);

            expect(queue.getState().isCircuitOpen).toBe(false);
        });

        it('should reset consecutive failures on success', async () => {
            // Cause 2 failures
            let failPromise = trackEnqueue(createFailingTask('Error 1'));
            await vi.advanceTimersByTimeAsync(10);
            await failPromise.catch(() => {});
            
            failPromise = trackEnqueue(createFailingTask('Error 2'));
            await vi.advanceTimersByTimeAsync(10);
            await failPromise.catch(() => {});

            expect(queue.getState().consecutiveFailures).toBe(2);

            // Success should reset
            const successPromise = trackEnqueue(createTestTask('success'));
            await vi.advanceTimersByTimeAsync(10);
            await successPromise;

            expect(queue.getState().consecutiveFailures).toBe(0);
        });

        it('should allow manual circuit breaker reset', async () => {
            // Trigger circuit breaker with 3 failures
            for (let i = 0; i < 3; i++) {
                const promise = trackEnqueue(createFailingTask(`Error ${i}`));
                await vi.advanceTimersByTimeAsync(10);
                await promise.catch(() => {});
            }

            expect(queue.getState().isCircuitOpen).toBe(true);

            queue.resetCircuitBreaker();

            expect(queue.getState().isCircuitOpen).toBe(false);
            expect(queue.getState().consecutiveFailures).toBe(0);
        });
    });

    // =========================================================================
    // VRAM GATING
    // =========================================================================

    describe('VRAM gating', () => {
        it('should wait when VRAM is insufficient', async () => {
            let vramCalls = 0;
            const vramCheck = vi.fn(async (): Promise<VRAMStatus> => {
                vramCalls++;
                // First call: insufficient, second call: sufficient
                return {
                    available: vramCalls > 1,
                    freeMB: vramCalls > 1 ? 5000 : 2000,
                    totalMB: 8000,
                    utilizationPercent: vramCalls > 1 ? 37.5 : 75,
                };
            });

            const queueWithVram = createGenerationQueue({ vramCheck });
            const executed = { value: false };

            const promise = queueWithVram.enqueue(createTestTask('result', {
                execute: async () => { executed.value = true; return 'result'; },
            }));

            // First check - insufficient VRAM
            await vi.advanceTimersByTimeAsync(100);
            expect(executed.value).toBe(false);

            // Advance past VRAM retry delay (5s)
            await vi.advanceTimersByTimeAsync(5000);
            await vi.runAllTimersAsync();
            await promise;

            expect(executed.value).toBe(true);
            expect(vramCheck).toHaveBeenCalledTimes(2);

            queueWithVram.clear();
        });

        it('should proceed if VRAM check fails', async () => {
            const vramCheck = vi.fn(async (): Promise<VRAMStatus> => {
                throw new Error('VRAM check failed');
            });

            const queueWithVram = createGenerationQueue({ vramCheck });
            const executed = { value: false };

            const promise = queueWithVram.enqueue(createTestTask('result', {
                execute: async () => { executed.value = true; return 'result'; },
            }));

            await vi.runAllTimersAsync();
            await promise;

            expect(executed.value).toBe(true);

            queueWithVram.clear();
        });
    });

    // =========================================================================
    // STATE MANAGEMENT
    // =========================================================================

    describe('getState', () => {
        it('should return correct initial state', () => {
            const state = queue.getState();

            expect(state.size).toBe(0);
            expect(state.isRunning).toBe(false);
            expect(state.currentTaskId).toBeNull();
            expect(state.isCircuitOpen).toBe(false);
            expect(state.consecutiveFailures).toBe(0);
            expect(state.stats.totalQueued).toBe(0);
            expect(state.stats.totalCompleted).toBe(0);
            expect(state.stats.totalFailed).toBe(0);
            expect(state.stats.totalCancelled).toBe(0);
        });

        it('should track queue size correctly', async () => {
            // Block queue
            trackEnqueue(createDelayedTask('blocking', 1000));

            trackEnqueue(createTestTask('a'));
            trackEnqueue(createTestTask('b'));

            const state = queue.getState();
            expect(state.size).toBe(3); // including running task
        });

        it('should track running state', async () => {
            const task = createDelayedTask('running', 1000);
            trackEnqueue(task);

            await vi.advanceTimersByTimeAsync(10);

            const state = queue.getState();
            expect(state.isRunning).toBe(true);
            expect(state.currentTaskId).not.toBeNull();
        });

        it('should track statistics correctly', async () => {
            // Complete one
            await trackEnqueue(createTestTask('success'));
            await vi.runAllTimersAsync();

            // Fail one
            trackEnqueue(createFailingTask('error'));
            await vi.runAllTimersAsync();

            // Cancel one
            trackEnqueue(createDelayedTask('blocking', 1000));
            const toCancel = trackEnqueue(createTestTask('cancel', { id: 'cancel-me' }));
            queue.cancel('cancel-me');
            await toCancel.catch(() => {});

            const state = queue.getState();
            expect(state.stats.totalQueued).toBe(4);
            expect(state.stats.totalCompleted).toBe(1);
            expect(state.stats.totalFailed).toBe(1);
            expect(state.stats.totalCancelled).toBe(1);
        });
    });

    describe('subscribe', () => {
        it('should notify listener immediately with current state', () => {
            const listener = vi.fn();
            queue.subscribe(listener);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                size: 0,
                isRunning: false,
            }));
        });

        it('should notify listener on state changes', async () => {
            const listener = vi.fn();
            queue.subscribe(listener);

            trackEnqueue(createTestTask('test'));
            await vi.runAllTimersAsync();

            // Called for: initial, enqueue, start running, completed
            expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);
        });

        it('should allow unsubscribe', async () => {
            const listener = vi.fn();
            const unsubscribe = queue.subscribe(listener);

            unsubscribe();
            listener.mockClear();

            trackEnqueue(createTestTask('test'));
            await vi.runAllTimersAsync();

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should reset all state', async () => {
            // Add some tasks and cause failures
            trackEnqueue(createTestTask('a'));
            trackEnqueue(createFailingTask('error'));
            await vi.runAllTimersAsync();
            
            // Wait for all promises before clear
            await Promise.allSettled(pendingPromises);
            pendingPromises.length = 0;

            queue.clear();

            const state = queue.getState();
            expect(state.size).toBe(0);
            expect(state.isRunning).toBe(false);
            expect(state.isCircuitOpen).toBe(false);
            expect(state.consecutiveFailures).toBe(0);
            expect(state.stats.totalQueued).toBe(0);
        });
    });

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

    describe('generateTaskId', () => {
        it('should generate unique IDs', () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generateTaskId('video'));
            }
            expect(ids.size).toBe(100);
        });

        it('should include type in ID', () => {
            const videoId = generateTaskId('video');
            const keyframeId = generateTaskId('keyframe');

            expect(videoId).toContain('video');
            expect(keyframeId).toContain('keyframe');
        });

        it('should include prefix when provided', () => {
            const id = generateTaskId('video', 'scene-123');
            expect(id).toContain('scene-123');
        });
    });

    describe('createKeyframeTask', () => {
        it('should create a keyframe task with correct defaults', () => {
            const execute = vi.fn(async () => 'result');
            const task = createKeyframeTask(execute, { sceneId: 'scene-1' });

            expect(task.type).toBe('keyframe');
            expect(task.priority).toBe('normal');
            expect(task.id).toContain('keyframe');
            expect(task.id).toContain('scene-1');
            expect(task.metadata?.sceneId).toBe('scene-1');
        });

        it('should respect custom priority', () => {
            const task = createKeyframeTask(async () => 'result', {
                sceneId: 'scene-1',
                priority: 'high',
            });

            expect(task.priority).toBe('high');
        });
    });

    describe('createVideoTask', () => {
        it('should create a video task with correct defaults', () => {
            const execute = vi.fn(async () => 'result');
            const task = createVideoTask(execute, { sceneId: 'scene-1', shotId: 'shot-1' });

            expect(task.type).toBe('video');
            expect(task.priority).toBe('normal');
            expect(task.timeoutMs).toBe(15 * 60 * 1000); // 15 minutes
            expect(task.id).toContain('video');
            expect(task.id).toContain('shot-1');
            expect(task.metadata?.sceneId).toBe('scene-1');
            expect(task.metadata?.shotId).toBe('shot-1');
        });

        it('should use sceneId when shotId not provided', () => {
            const task = createVideoTask(async () => 'result', { sceneId: 'scene-1' });

            expect(task.id).toContain('scene-1');
            expect(task.metadata?.shotId).toBeUndefined();
        });
    });

    // =========================================================================
    // GLOBAL QUEUE
    // =========================================================================

    describe('global queue', () => {
        it('should return same instance on multiple calls', () => {
            const queue1 = getGenerationQueue();
            const queue2 = getGenerationQueue();

            expect(queue1).toBe(queue2);
        });

        it('should reset global queue', () => {
            const queue1 = getGenerationQueue();
            resetGlobalQueue();
            const queue2 = getGenerationQueue();

            expect(queue1).not.toBe(queue2);
        });
    });

    // =========================================================================
    // ERROR HANDLING
    // =========================================================================

    describe('error handling', () => {
        it('should wrap non-CSGError errors', async () => {
            const task = createFailingTask(new Error('Raw error'));

            await expect(trackEnqueue(task)).rejects.toMatchObject({
                code: ErrorCodes.GENERATION_FAILED,
            });
        });

        it('should preserve CSGError errors', async () => {
            const csError = new CSGError(ErrorCodes.COMFYUI_CONNECTION_FAILED, {
                message: 'Connection failed',
            });
            const task = createFailingTask(csError);

            await expect(trackEnqueue(task)).rejects.toMatchObject({
                code: ErrorCodes.COMFYUI_CONNECTION_FAILED,
            });
        });

        it('should not crash on listener errors', async () => {
            // Subscribe a good listener first so we can verify it still gets called
            const goodListener = vi.fn();
            queue.subscribe(goodListener);
            goodListener.mockClear(); // Clear the initial call

            // Subscribe a bad listener - it will throw on initial call and future calls
            let badListenerCalls = 0;
            const badListener = vi.fn(() => {
                badListenerCalls++;
                if (badListenerCalls > 1) {
                    // Only throw on subsequent calls (after subscribe's initial call)
                    throw new Error('Listener error');
                }
            });
            queue.subscribe(badListener);

            // Enqueue a task - this triggers state change notifications
            // The bad listener will throw, but it shouldn't crash the queue
            await expect(trackEnqueue(createTestTask('test'))).resolves.toBe('test');
            
            // Good listener should still have been called
            expect(goodListener.mock.calls.length).toBeGreaterThan(0);
        });
    });
});
