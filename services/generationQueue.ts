/**
 * GenerationQueue - Serial queue for resource-intensive generation operations
 * 
 * Problem Solved:
 * - Concurrent ComfyUI generations exhaust VRAM causing failures
 * - Multiple parallel video generations compete for GPU resources
 * - No coordination between different generation operations (keyframes, videos)
 * - Race conditions when multiple scenes are queued simultaneously
 * 
 * Solution:
 * - FIFO queue with single active operation guarantee
 * - Priority support for user-initiated vs. background generation
 * - VRAM gating before dispatching (optional, requires system info endpoint)
 * - Circuit breaker for repeated failures
 * - Progress callbacks for each queued item
 * - Cancellation support for pending items
 */

import { ErrorCodes, CSGError } from '../types/errors';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default timeout for a single generation operation (10 minutes) */
const DEFAULT_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

/** Maximum queue size to prevent memory exhaustion */
const MAX_QUEUE_SIZE = 50;

/** Circuit breaker: max consecutive failures before blocking queue */
const CIRCUIT_BREAKER_THRESHOLD = 3;

/** Circuit breaker: time to wait before attempting to close circuit (30 seconds) */
const CIRCUIT_BREAKER_RESET_MS = 30 * 1000;

/** Minimum VRAM required to start a generation (in MB) - optional gate */
const MIN_VRAM_MB = 4096;

/** Debug mode */
const DEBUG_QUEUE = ((globalThis as unknown as { import?: { meta?: { env?: Record<string, string> } } }).import?.meta?.env?.VITE_DEBUG_GENERATION_QUEUE ?? 'false') === 'true';

// ============================================================================
// TYPES
// ============================================================================

export type GenerationType = 'keyframe' | 'video' | 'image' | 'text';
export type GenerationPriority = 'high' | 'normal' | 'low';
export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

export interface GenerationTask<T = unknown> {
    /** Unique identifier for this task */
    id: string;
    /** Type of generation (affects resource allocation) */
    type: GenerationType;
    /** Priority for queue ordering */
    priority: GenerationPriority;
    /** The async work to perform */
    execute: () => Promise<T>;
    /** Timeout for this specific task (overrides default) */
    timeoutMs?: number;
    /** Metadata for logging/debugging */
    metadata?: {
        sceneId?: string;
        shotId?: string;
        description?: string;
    };
    /** Callback for progress updates */
    onProgress?: (progress: number, message?: string) => void;
    /** Callback when status changes */
    onStatusChange?: (status: GenerationStatus) => void;
}

export interface QueuedTask<T = unknown> extends GenerationTask<T> {
    /** When the task was added to queue */
    queuedAt: number;
    /** When the task started executing */
    startedAt?: number;
    /** When the task completed/failed */
    completedAt?: number;
    /** Current status */
    status: GenerationStatus;
    /** Error if failed */
    error?: CSGError;
    /** Promise that resolves when task completes */
    promise: Promise<T>;
    /** Internal resolver for the promise */
    resolve: (value: T) => void;
    /** Internal rejector for the promise */
    reject: (error: Error) => void;
    /** AbortSignal for cancellation support */
    abortSignal?: AbortSignal;
}

export interface QueueState {
    /** Number of tasks currently in queue (including running) */
    size: number;
    /** Whether a task is currently running */
    isRunning: boolean;
    /** The ID of the currently running task */
    currentTaskId: string | null;
    /** Whether circuit breaker has tripped */
    isCircuitOpen: boolean;
    /** Number of consecutive failures */
    consecutiveFailures: number;
    /** Queue statistics */
    stats: {
        totalQueued: number;
        totalCompleted: number;
        totalFailed: number;
        totalCancelled: number;
        averageWaitTimeMs: number;
        averageExecutionTimeMs: number;
    };
}

export interface VRAMStatus {
    available: boolean;
    freeMB: number;
    totalMB: number;
    utilizationPercent: number;
}

export interface PreflightConfig {
    /** Minimum free VRAM required (MB) before starting a task */
    minVRAMMB?: number;
    /** Maximum wait time for VRAM availability (ms) */
    vramWaitTimeoutMs?: number;
    /** ComfyUI server URL for preflight checks */
    comfyUIUrl?: string;
    /** Skip preflight checks (for testing or fallback) */
    skipPreflight?: boolean;
}

// ============================================================================
// GENERATION QUEUE CLASS
// ============================================================================

export class GenerationQueue {
    private queue: QueuedTask[] = [];
    private currentTask: QueuedTask | null = null;
    private consecutiveFailures = 0;
    private circuitOpenUntil: number | null = null;
    private stats = {
        totalQueued: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalCancelled: 0,
        totalWaitTimeMs: 0,
        totalExecutionTimeMs: 0,
    };
    
    private listeners: Set<(state: QueueState) => void> = new Set();
    private vramCheckFn?: (url?: string) => Promise<VRAMStatus>;
    private _preflightConfig: PreflightConfig = {};
    
    /** AbortControllers for running tasks - enables cancellation of in-flight operations */
    private abortControllers: Map<string, AbortController> = new Map();

    constructor(options?: {
        vramCheck?: (url?: string) => Promise<VRAMStatus>;
        preflight?: PreflightConfig;
    }) {
        this.vramCheckFn = options?.vramCheck;
        this._preflightConfig = options?.preflight ?? {};
        
        if (DEBUG_QUEUE) {
            console.debug('[GenerationQueue] Initialized', { hasPreflight: !!options?.preflight });
        }
    }

    /**
     * Set the VRAM check function
     */
    setVRAMCheck(fn: (url?: string) => Promise<VRAMStatus>): void {
        this.vramCheckFn = fn;
    }

    /**
     * Get the current preflight configuration
     */
    getPreflightConfig(): PreflightConfig {
        return this._preflightConfig;
    }

    /**
     * Update preflight configuration
     */
    setPreflightConfig(config: Partial<PreflightConfig>): void {
        this._preflightConfig = { ...this._preflightConfig, ...config };
    }

    // -------------------------------------------------------------------------
    // PUBLIC API
    // -------------------------------------------------------------------------

    /**
     * Add a task to the queue
     * @returns Promise that resolves when the task completes
     */
    enqueue<T>(task: GenerationTask<T>): Promise<T> {
        // Check queue size limit
        if (this.queue.length >= MAX_QUEUE_SIZE) {
            const error = new CSGError(ErrorCodes.GENERATION_QUEUE_FULL, {
                queueSize: this.queue.length,
                maxSize: MAX_QUEUE_SIZE,
            });
            return Promise.reject(error);
        }

        // Create promise for task completion
        let resolve: (value: T) => void;
        let reject: (error: Error) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        const queuedTask: QueuedTask<T> = {
            ...task,
            queuedAt: Date.now(),
            status: 'pending',
            promise,
            resolve: resolve!,
            reject: reject!,
        };

        // Insert based on priority
        const insertIndex = this.findInsertIndex(task.priority);
        this.queue.splice(insertIndex, 0, queuedTask as QueuedTask);
        
        this.stats.totalQueued++;
        task.onStatusChange?.('pending');
        
        if (DEBUG_QUEUE) {
            console.debug(`[GenerationQueue] Enqueued task ${task.id} (${task.type}) at position ${insertIndex}. Queue size: ${this.queue.length}`);
        }

        this.notifyListeners();
        this.processQueue();

        return promise;
    }

    /**
     * Cancel a pending task
     * @returns true if task was cancelled, false if not found
     */
    cancel(taskId: string): boolean {
        const taskIndex = this.queue.findIndex(t => t.id === taskId);
        
        if (taskIndex === -1) {
            return false;
        }

        const task = this.queue[taskIndex];
        if (!task) {
            return false;
        }
        
        // If task is running, abort it using the AbortController
        if (task.status === 'running') {
            const abortController = this.abortControllers.get(taskId);
            if (abortController) {
                if (DEBUG_QUEUE) {
                    console.debug(`[GenerationQueue] Aborting running task ${taskId}`);
                }
                abortController.abort();
                this.abortControllers.delete(taskId);
            }
            // Note: The task will be cleaned up in processQueue when the abort signal triggers
            // We still mark it as cancelled here for immediate state update
            task.status = 'cancelled';
            task.completedAt = Date.now();
            task.onStatusChange?.('cancelled');
            this.stats.totalCancelled++;
            
            if (DEBUG_QUEUE) {
                console.debug(`[GenerationQueue] Cancelled running task ${taskId}`);
            }
            this.notifyListeners();
            return true;
        }

        // Remove from queue and reject promise
        this.queue.splice(taskIndex, 1);
        task.status = 'cancelled';
        task.completedAt = Date.now();
        task.onStatusChange?.('cancelled');
        task.reject(new CSGError(ErrorCodes.GENERATION_CANCELLED, { taskId }));
        
        this.stats.totalCancelled++;
        
        if (DEBUG_QUEUE) {
            console.debug(`[GenerationQueue] Cancelled task ${taskId}`);
        }

        this.notifyListeners();
        return true;
    }

    /**
     * Cancel all pending tasks
     * @returns Number of tasks cancelled
     */
    cancelAll(): number {
        let cancelled = 0;
        
        // Cancel all non-running tasks
        const pendingTasks = this.queue.filter(t => t.status === 'pending');
        
        for (const task of pendingTasks) {
            if (this.cancel(task.id)) {
                cancelled++;
            }
        }

        if (DEBUG_QUEUE) {
            console.debug(`[GenerationQueue] Cancelled ${cancelled} tasks`);
        }

        return cancelled;
    }

    /**
     * Get current queue state
     */
    getState(): QueueState {
        const waitTimes = this.stats.totalCompleted + this.stats.totalFailed;
        const avgWait = waitTimes > 0 ? this.stats.totalWaitTimeMs / waitTimes : 0;
        const avgExec = this.stats.totalCompleted > 0 ? this.stats.totalExecutionTimeMs / this.stats.totalCompleted : 0;

        return {
            size: this.queue.length,
            isRunning: this.currentTask !== null,
            currentTaskId: this.currentTask?.id ?? null,
            isCircuitOpen: this.isCircuitOpen(),
            consecutiveFailures: this.consecutiveFailures,
            stats: {
                totalQueued: this.stats.totalQueued,
                totalCompleted: this.stats.totalCompleted,
                totalFailed: this.stats.totalFailed,
                totalCancelled: this.stats.totalCancelled,
                averageWaitTimeMs: avgWait,
                averageExecutionTimeMs: avgExec,
            },
        };
    }

    /**
     * Subscribe to queue state changes
     */
    subscribe(listener: (state: QueueState) => void): () => void {
        this.listeners.add(listener);
        // Immediately notify with current state
        listener(this.getState());
        
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Reset circuit breaker (for testing or manual recovery)
     */
    resetCircuitBreaker(): void {
        this.consecutiveFailures = 0;
        this.circuitOpenUntil = null;
        
        if (DEBUG_QUEUE) {
            console.debug('[GenerationQueue] Circuit breaker reset');
        }

        this.notifyListeners();
        this.processQueue();
    }

    /**
     * Clear queue and reset state (for testing)
     */
    clear(): void {
        this.cancelAll();
        this.currentTask = null;
        this.consecutiveFailures = 0;
        this.circuitOpenUntil = null;
        this.stats = {
            totalQueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            totalCancelled: 0,
            totalWaitTimeMs: 0,
            totalExecutionTimeMs: 0,
        };
        
        if (DEBUG_QUEUE) {
            console.debug('[GenerationQueue] Queue cleared');
        }

        this.notifyListeners();
    }

    // -------------------------------------------------------------------------
    // PRIVATE METHODS
    // -------------------------------------------------------------------------

    private findInsertIndex(priority: GenerationPriority): number {
        const priorityOrder: Record<GenerationPriority, number> = {
            high: 0,
            normal: 1,
            low: 2,
        };

        const targetPriority = priorityOrder[priority];
        
        // Find first task with lower priority
        for (let i = 0; i < this.queue.length; i++) {
            const queuedTask = this.queue[i];
            if (queuedTask && priorityOrder[queuedTask.priority] > targetPriority) {
                return i;
            }
        }
        
        return this.queue.length;
    }

    private isCircuitOpen(): boolean {
        if (this.circuitOpenUntil === null) {
            return false;
        }
        
        if (Date.now() > this.circuitOpenUntil) {
            // Circuit can close - try again
            this.circuitOpenUntil = null;
            return false;
        }
        
        return true;
    }

    private async processQueue(): Promise<void> {
        // Already processing
        if (this.currentTask !== null) {
            return;
        }

        // Circuit breaker is open
        if (this.isCircuitOpen()) {
            if (DEBUG_QUEUE) {
                const remaining = this.circuitOpenUntil! - Date.now();
                console.debug(`[GenerationQueue] Circuit breaker open. Retry in ${Math.round(remaining / 1000)}s`);
            }
            return;
        }

        // Get next pending task
        const nextTask = this.queue.find(t => t.status === 'pending');
        if (!nextTask) {
            return;
        }

        // VRAM gating (optional)
        if (this.vramCheckFn) {
            try {
                const vramStatus = await this.vramCheckFn(this._preflightConfig.comfyUIUrl);
                if (vramStatus.freeMB < (this._preflightConfig.minVRAMMB ?? MIN_VRAM_MB)) {
                    if (DEBUG_QUEUE) {
                        console.debug(`[GenerationQueue] VRAM gate: ${vramStatus.freeMB.toFixed(0)}MB free < ${(this._preflightConfig.minVRAMMB ?? MIN_VRAM_MB)}MB required. Waiting...`);
                    }
                    // Retry after a delay
                    setTimeout(() => this.processQueue(), 5000);
                    return;
                }
            } catch (error) {
                // VRAM check failed - proceed anyway (graceful degradation)
                if (DEBUG_QUEUE) {
                    console.warn('[GenerationQueue] VRAM check failed, proceeding anyway:', error);
                }
            }
        }

        // Start the task
        this.currentTask = nextTask;
        nextTask.status = 'running';
        nextTask.startedAt = Date.now();
        nextTask.onStatusChange?.('running');
        
        // Create AbortController for this task
        const abortController = new AbortController();
        this.abortControllers.set(nextTask.id, abortController);
        nextTask.abortSignal = abortController.signal;
        
        const waitTime = nextTask.startedAt - nextTask.queuedAt;
        this.stats.totalWaitTimeMs += waitTime;

        if (DEBUG_QUEUE) {
            console.debug(`[GenerationQueue] Starting task ${nextTask.id}. Wait time: ${waitTime}ms`);
        }

        this.notifyListeners();

        // Execute with timeout
        const timeoutMs = nextTask.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS;
        
        const timeout = this.createTimeout(timeoutMs);

        try {
            const result = await Promise.race([
                nextTask.execute(),
                timeout.promise,
            ]);

            // Success
            nextTask.status = 'completed';
            nextTask.completedAt = Date.now();
            nextTask.onStatusChange?.('completed');
            nextTask.resolve(result);
            
            this.stats.totalCompleted++;
            this.stats.totalExecutionTimeMs += nextTask.completedAt - nextTask.startedAt!;
            this.consecutiveFailures = 0;

            if (DEBUG_QUEUE) {
                console.debug(`[GenerationQueue] Task ${nextTask.id} completed in ${nextTask.completedAt - nextTask.startedAt!}ms`);
            }

        } catch (error) {
            // Failure
            const csError = error instanceof CSGError 
                ? error 
                : new CSGError(ErrorCodes.GENERATION_FAILED, {
                    taskId: nextTask.id,
                    originalError: error instanceof Error ? error.message : String(error),
                });

            nextTask.status = csError.code === ErrorCodes.COMFYUI_TIMEOUT_GENERATION ? 'timeout' : 'failed';
            nextTask.completedAt = Date.now();
            nextTask.error = csError;
            nextTask.onStatusChange?.(nextTask.status);
            nextTask.reject(csError);
            
            this.stats.totalFailed++;
            this.consecutiveFailures++;

            if (DEBUG_QUEUE) {
                console.error(`[GenerationQueue] Task ${nextTask.id} failed:`, csError.message);
            }

            // Check circuit breaker
            if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
                this.circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
                console.warn(`[GenerationQueue] Circuit breaker opened after ${this.consecutiveFailures} consecutive failures. Retry in ${CIRCUIT_BREAKER_RESET_MS / 1000}s`);
            }
        } finally {
            timeout.cancel();
            // Clean up AbortController
            this.abortControllers.delete(nextTask.id);
        }

        // Remove task from queue and continue processing
        const taskIndex = this.queue.findIndex(t => t.id === nextTask.id);
        if (taskIndex !== -1) {
            this.queue.splice(taskIndex, 1);
        }
        
        this.currentTask = null;
        this.notifyListeners();
        
        // Process next task
        this.processQueue();
    }

    private createTimeout(ms: number): { promise: Promise<never>; cancel: () => void } {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const promise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new CSGError(ErrorCodes.COMFYUI_TIMEOUT_GENERATION, {
                    timeoutMs: ms,
                    message: `Operation timed out after ${ms}ms`,
                }));
            }, ms);
        });

        return {
            promise,
            cancel: () => {
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
            },
        };
    }

    private notifyListeners(): void {
        const state = this.getState();
        for (const listener of this.listeners) {
            try {
                listener(state);
            } catch (error) {
                console.error('[GenerationQueue] Listener error:', error);
            }
        }
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalQueue: GenerationQueue | null = null;
let globalPreflightConfig: PreflightConfig = {};
let globalVRAMCheck: ((url?: string) => Promise<VRAMStatus>) | undefined;

/**
 * Set the global VRAM check function
 */
export function setGlobalVRAMCheck(fn: (url?: string) => Promise<VRAMStatus>): void {
    globalVRAMCheck = fn;
    if (globalQueue) {
        globalQueue.setVRAMCheck(fn);
    }
}

/**
 * Configure preflight settings for the global queue
 * Call this before getGenerationQueue() to apply settings
 */
export function configureQueuePreflight(config: PreflightConfig): void {
    globalPreflightConfig = { ...globalPreflightConfig, ...config };
    
    // If queue already exists, update its config
    if (globalQueue) {
        globalQueue.setPreflightConfig(globalPreflightConfig);
    }
    
    if (DEBUG_QUEUE) {
        console.debug('[GenerationQueue] Preflight config updated:', config);
    }
}

/**
 * Get or create the global generation queue
 */
export function getGenerationQueue(): GenerationQueue {
    if (!globalQueue) {
        globalQueue = new GenerationQueue({ 
            preflight: globalPreflightConfig,
            vramCheck: globalVRAMCheck
        });
    }
    return globalQueue;
}

/**
 * Create a new queue instance (for testing)
 */
export function createGenerationQueue(options?: {
    vramCheck?: (url?: string) => Promise<VRAMStatus>;
    preflight?: PreflightConfig;
}): GenerationQueue {
    return new GenerationQueue(options);
}

/**
 * Reset the global queue (for testing)
 */
export function resetGlobalQueue(): void {
    if (globalQueue) {
        globalQueue.clear();
    }
    globalQueue = null;
    globalPreflightConfig = {};
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique task ID
 */
export function generateTaskId(type: GenerationType, prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix ? `${prefix}-` : ''}${type}-${timestamp}-${random}`;
}

/**
 * Create a task for keyframe generation
 */
export function createKeyframeTask<T>(
    execute: () => Promise<T>,
    options: {
        sceneId: string;
        priority?: GenerationPriority;
        timeoutMs?: number;
        onProgress?: (progress: number, message?: string) => void;
        onStatusChange?: (status: GenerationStatus) => void;
    }
): GenerationTask<T> {
    return {
        id: generateTaskId('keyframe', options.sceneId),
        type: 'keyframe',
        priority: options.priority ?? 'normal',
        execute,
        timeoutMs: options.timeoutMs,
        metadata: {
            sceneId: options.sceneId,
            description: `Keyframe for scene ${options.sceneId}`,
        },
        onProgress: options.onProgress,
        onStatusChange: options.onStatusChange,
    };
}

/**
 * Create a task for video generation
 */
export function createVideoTask<T>(
    execute: () => Promise<T>,
    options: {
        sceneId: string;
        shotId?: string;
        priority?: GenerationPriority;
        timeoutMs?: number;
        onProgress?: (progress: number, message?: string) => void;
        onStatusChange?: (status: GenerationStatus) => void;
    }
): GenerationTask<T> {
    return {
        id: generateTaskId('video', options.shotId ?? options.sceneId),
        type: 'video',
        priority: options.priority ?? 'normal',
        execute,
        timeoutMs: options.timeoutMs ?? 15 * 60 * 1000, // Videos get longer timeout (15 min)
        metadata: {
            sceneId: options.sceneId,
            shotId: options.shotId,
            description: `Video for ${options.shotId ? `shot ${options.shotId}` : `scene ${options.sceneId}`}`,
        },
        onProgress: options.onProgress,
        onStatusChange: options.onStatusChange,
    };
}

/**
 * Create a task for image generation (shot images, auxiliary images)
 */
export function createImageTask<T>(
    execute: () => Promise<T>,
    options: {
        sceneId: string;
        shotId?: string;
        description?: string;
        priority?: GenerationPriority;
        timeoutMs?: number;
        onProgress?: (progress: number, message?: string) => void;
        onStatusChange?: (status: GenerationStatus) => void;
    }
): GenerationTask<T> {
    return {
        id: generateTaskId('image', options.shotId ?? options.sceneId),
        type: 'image',
        priority: options.priority ?? 'normal',
        execute,
        timeoutMs: options.timeoutMs ?? 5 * 60 * 1000, // Images get 5 min timeout
        metadata: {
            sceneId: options.sceneId,
            shotId: options.shotId,
            description: options.description ?? `Image for ${options.shotId ? `shot ${options.shotId}` : `scene ${options.sceneId}`}`,
        },
        onProgress: options.onProgress,
        onStatusChange: options.onStatusChange,
    };
}
