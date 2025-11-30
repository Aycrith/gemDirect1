/**
 * Structured Error Codes for Cinematic Story Generator
 * 
 * Provides categorized error codes for:
 * - Consistent error identification across the application
 * - Smart retry logic based on error type
 * - Better debugging and logging
 * - User-friendly error messages
 * 
 * Error Code Format: {CATEGORY}_{SUBCATEGORY}_{SPECIFIC}
 * Example: COMFYUI_TIMEOUT_GENERATION
 */

// ============================================================================
// ERROR CODE DEFINITIONS
// ============================================================================

export const ErrorCodes = {
    // -------------------------------------------------------------------------
    // HYDRATION ERRORS - State initialization issues
    // -------------------------------------------------------------------------
    HYDRATION_TIMEOUT: 'HYDRATION_TIMEOUT',
    HYDRATION_INDEXEDDB_FAILED: 'HYDRATION_INDEXEDDB_FAILED',
    HYDRATION_SESSION_STORAGE_FAILED: 'HYDRATION_SESSION_STORAGE_FAILED',
    HYDRATION_RACE_CONDITION: 'HYDRATION_RACE_CONDITION',
    HYDRATION_STORE_MISMATCH: 'HYDRATION_STORE_MISMATCH',

    // -------------------------------------------------------------------------
    // COMFYUI ERRORS - ComfyUI integration issues
    // -------------------------------------------------------------------------
    COMFYUI_TIMEOUT_GENERATION: 'COMFYUI_TIMEOUT_GENERATION',
    COMFYUI_TIMEOUT_FETCH: 'COMFYUI_TIMEOUT_FETCH',
    COMFYUI_TIMEOUT_WEBSOCKET: 'COMFYUI_TIMEOUT_WEBSOCKET',
    COMFYUI_CONNECTION_FAILED: 'COMFYUI_CONNECTION_FAILED',
    COMFYUI_CONNECTION_LOST: 'COMFYUI_CONNECTION_LOST',
    COMFYUI_WORKFLOW_INVALID: 'COMFYUI_WORKFLOW_INVALID',
    COMFYUI_WORKFLOW_NOT_FOUND: 'COMFYUI_WORKFLOW_NOT_FOUND',
    COMFYUI_QUEUE_FULL: 'COMFYUI_QUEUE_FULL',
    COMFYUI_ASSET_DOWNLOAD_FAILED: 'COMFYUI_ASSET_DOWNLOAD_FAILED',
    COMFYUI_PROMPT_REJECTED: 'COMFYUI_PROMPT_REJECTED',
    COMFYUI_NODE_ERROR: 'COMFYUI_NODE_ERROR',
    COMFYUI_VRAM_EXHAUSTED: 'COMFYUI_VRAM_EXHAUSTED',
    COMFYUI_CUDA_OOM: 'COMFYUI_CUDA_OOM',

    // -------------------------------------------------------------------------
    // LLM ERRORS - Gemini/LM Studio integration issues
    // -------------------------------------------------------------------------
    LLM_RATE_LIMIT: 'LLM_RATE_LIMIT',
    LLM_TIMEOUT: 'LLM_TIMEOUT',
    LLM_CONNECTION_FAILED: 'LLM_CONNECTION_FAILED',
    LLM_INVALID_RESPONSE: 'LLM_INVALID_RESPONSE',
    LLM_PARSE_ERROR: 'LLM_PARSE_ERROR',
    LLM_CONTEXT_TOO_LONG: 'LLM_CONTEXT_TOO_LONG',
    LLM_API_KEY_INVALID: 'LLM_API_KEY_INVALID',
    LLM_MODEL_NOT_FOUND: 'LLM_MODEL_NOT_FOUND',
    LLM_SERVICE_UNAVAILABLE: 'LLM_SERVICE_UNAVAILABLE',

    // -------------------------------------------------------------------------
    // GENERATION ERRORS - Story/Scene/Timeline generation issues
    // -------------------------------------------------------------------------
    GENERATION_STORY_BIBLE_FAILED: 'GENERATION_STORY_BIBLE_FAILED',
    GENERATION_SCENE_FAILED: 'GENERATION_SCENE_FAILED',
    GENERATION_TIMELINE_FAILED: 'GENERATION_TIMELINE_FAILED',
    GENERATION_KEYFRAME_FAILED: 'GENERATION_KEYFRAME_FAILED',
    GENERATION_VIDEO_FAILED: 'GENERATION_VIDEO_FAILED',
    GENERATION_CANCELLED: 'GENERATION_CANCELLED',
    GENERATION_QUEUE_BUSY: 'GENERATION_QUEUE_BUSY',
    GENERATION_QUEUE_FULL: 'GENERATION_QUEUE_FULL',
    GENERATION_FAILED: 'GENERATION_FAILED',
    GENERATION_VALIDATION_FAILED: 'GENERATION_VALIDATION_FAILED',

    // -------------------------------------------------------------------------
    // RESOURCE ERRORS - System resource issues
    // -------------------------------------------------------------------------
    RESOURCE_VRAM_LOW: 'RESOURCE_VRAM_LOW',
    RESOURCE_MEMORY_LOW: 'RESOURCE_MEMORY_LOW',
    RESOURCE_DISK_FULL: 'RESOURCE_DISK_FULL',
    RESOURCE_GPU_BUSY: 'RESOURCE_GPU_BUSY',
    RESOURCE_QUEUE_FULL: 'RESOURCE_QUEUE_FULL',

    // -------------------------------------------------------------------------
    // PERSISTENCE ERRORS - Storage issues
    // -------------------------------------------------------------------------
    PERSISTENCE_SAVE_FAILED: 'PERSISTENCE_SAVE_FAILED',
    PERSISTENCE_LOAD_FAILED: 'PERSISTENCE_LOAD_FAILED',
    PERSISTENCE_QUOTA_EXCEEDED: 'PERSISTENCE_QUOTA_EXCEEDED',
    PERSISTENCE_CORRUPT_DATA: 'PERSISTENCE_CORRUPT_DATA',

    // -------------------------------------------------------------------------
    // VALIDATION ERRORS - Input/data validation issues
    // -------------------------------------------------------------------------
    VALIDATION_STORY_IDEA_TOO_SHORT: 'VALIDATION_STORY_IDEA_TOO_SHORT',
    VALIDATION_VISION_TOO_SHORT: 'VALIDATION_VISION_TOO_SHORT',
    VALIDATION_MISSING_KEYFRAME: 'VALIDATION_MISSING_KEYFRAME',
    VALIDATION_SCENE_INCOMPLETE: 'VALIDATION_SCENE_INCOMPLETE',
    VALIDATION_WORKFLOW_MAPPING: 'VALIDATION_WORKFLOW_MAPPING',

    // -------------------------------------------------------------------------
    // NETWORK ERRORS - General network issues
    // -------------------------------------------------------------------------
    NETWORK_OFFLINE: 'NETWORK_OFFLINE',
    NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
    NETWORK_CORS_BLOCKED: 'NETWORK_CORS_BLOCKED',

    // -------------------------------------------------------------------------
    // UNKNOWN ERRORS - Catch-all
    // -------------------------------------------------------------------------
    UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ============================================================================
// ERROR METADATA
// ============================================================================

export interface ErrorMetadata {
    /** Human-readable error message */
    message: string;
    /** Whether this error is retryable */
    retryable: boolean;
    /** Suggested retry delay in ms (if retryable) */
    retryDelayMs?: number;
    /** Maximum retry attempts (if retryable) */
    maxRetries?: number;
    /** Whether this error should be shown to the user */
    userFacing: boolean;
    /** Suggested user action */
    userAction?: string;
    /** Error severity for logging */
    severity: 'info' | 'warning' | 'error' | 'critical';
    /** Category for grouping */
    category: 'hydration' | 'comfyui' | 'llm' | 'generation' | 'resource' | 'persistence' | 'validation' | 'network' | 'unknown';
}

export const ErrorMetadataMap: Record<ErrorCode, ErrorMetadata> = {
    // Hydration errors
    [ErrorCodes.HYDRATION_TIMEOUT]: {
        message: 'Application state failed to load in time',
        retryable: true,
        retryDelayMs: 1000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Refresh the page to try again',
        severity: 'error',
        category: 'hydration',
    },
    [ErrorCodes.HYDRATION_INDEXEDDB_FAILED]: {
        message: 'Failed to load saved data from browser storage',
        retryable: true,
        retryDelayMs: 500,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Your data may not have loaded correctly. Try refreshing.',
        severity: 'error',
        category: 'hydration',
    },
    [ErrorCodes.HYDRATION_SESSION_STORAGE_FAILED]: {
        message: 'Session storage access failed',
        retryable: false,
        userFacing: false,
        severity: 'warning',
        category: 'hydration',
    },
    [ErrorCodes.HYDRATION_RACE_CONDITION]: {
        message: 'State initialization race condition detected',
        retryable: true,
        retryDelayMs: 100,
        maxRetries: 5,
        userFacing: false,
        severity: 'warning',
        category: 'hydration',
    },
    [ErrorCodes.HYDRATION_STORE_MISMATCH]: {
        message: 'State store consistency check failed',
        retryable: false,
        userFacing: true,
        userAction: 'Some data may be out of sync. Consider refreshing.',
        severity: 'warning',
        category: 'hydration',
    },

    // ComfyUI errors
    [ErrorCodes.COMFYUI_TIMEOUT_GENERATION]: {
        message: 'Video generation took too long',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Generation timed out. Try again or check ComfyUI server.',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_TIMEOUT_FETCH]: {
        message: 'ComfyUI server request timed out',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Connection to ComfyUI is slow. Check your server.',
        severity: 'warning',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_TIMEOUT_WEBSOCKET]: {
        message: 'WebSocket connection to ComfyUI timed out',
        retryable: true,
        retryDelayMs: 3000,
        maxRetries: 3,
        userFacing: false,
        severity: 'warning',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_CONNECTION_FAILED]: {
        message: 'Could not connect to ComfyUI server',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Check that ComfyUI is running at the configured URL.',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_CONNECTION_LOST]: {
        message: 'Lost connection to ComfyUI server',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 5,
        userFacing: true,
        userAction: 'Connection lost. Will attempt to reconnect.',
        severity: 'warning',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_WORKFLOW_INVALID]: {
        message: 'Workflow configuration is invalid',
        retryable: false,
        userFacing: true,
        userAction: 'Check workflow mappings in Settings.',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_WORKFLOW_NOT_FOUND]: {
        message: 'Workflow file not found',
        retryable: false,
        userFacing: true,
        userAction: 'The workflow file is missing. Re-configure in Settings.',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_QUEUE_FULL]: {
        message: 'ComfyUI queue is at capacity',
        retryable: true,
        retryDelayMs: 10000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Queue is busy. Will retry automatically.',
        severity: 'warning',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_ASSET_DOWNLOAD_FAILED]: {
        message: 'Failed to download generated asset',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Asset download failed. Retrying...',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_PROMPT_REJECTED]: {
        message: 'ComfyUI rejected the generation prompt',
        retryable: false,
        userFacing: true,
        userAction: 'The workflow may have invalid settings.',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_NODE_ERROR]: {
        message: 'A ComfyUI node encountered an error',
        retryable: true,
        retryDelayMs: 3000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Workflow node error. Check ComfyUI console.',
        severity: 'error',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_VRAM_EXHAUSTED]: {
        message: 'GPU memory exhausted',
        retryable: true,
        retryDelayMs: 10000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'GPU memory full. Wait for current job to finish.',
        severity: 'critical',
        category: 'comfyui',
    },
    [ErrorCodes.COMFYUI_CUDA_OOM]: {
        message: 'CUDA out of memory error',
        retryable: true,
        retryDelayMs: 15000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'GPU memory error. Close other GPU apps and retry.',
        severity: 'critical',
        category: 'comfyui',
    },

    // LLM errors
    [ErrorCodes.LLM_RATE_LIMIT]: {
        message: 'API rate limit exceeded',
        retryable: true,
        retryDelayMs: 60000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Too many requests. Waiting before retry.',
        severity: 'warning',
        category: 'llm',
    },
    [ErrorCodes.LLM_TIMEOUT]: {
        message: 'LLM request timed out',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'AI response took too long. Retrying...',
        severity: 'warning',
        category: 'llm',
    },
    [ErrorCodes.LLM_CONNECTION_FAILED]: {
        message: 'Could not connect to LLM service',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Check your internet connection or LLM server.',
        severity: 'error',
        category: 'llm',
    },
    [ErrorCodes.LLM_INVALID_RESPONSE]: {
        message: 'Received invalid response from LLM',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'AI returned unexpected data. Retrying...',
        severity: 'warning',
        category: 'llm',
    },
    [ErrorCodes.LLM_PARSE_ERROR]: {
        message: 'Could not parse LLM response',
        retryable: true,
        retryDelayMs: 1000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'AI response format error. Retrying...',
        severity: 'warning',
        category: 'llm',
    },
    [ErrorCodes.LLM_CONTEXT_TOO_LONG]: {
        message: 'Input context exceeds model limit',
        retryable: false,
        userFacing: true,
        userAction: 'Story content is too long. Try shortening.',
        severity: 'error',
        category: 'llm',
    },
    [ErrorCodes.LLM_API_KEY_INVALID]: {
        message: 'API key is invalid or expired',
        retryable: false,
        userFacing: true,
        userAction: 'Check your API key in settings.',
        severity: 'error',
        category: 'llm',
    },
    [ErrorCodes.LLM_MODEL_NOT_FOUND]: {
        message: 'Requested model not available',
        retryable: false,
        userFacing: true,
        userAction: 'The AI model is not available. Check settings.',
        severity: 'error',
        category: 'llm',
    },
    [ErrorCodes.LLM_SERVICE_UNAVAILABLE]: {
        message: 'LLM service is temporarily unavailable',
        retryable: true,
        retryDelayMs: 30000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'AI service is down. Will retry shortly.',
        severity: 'error',
        category: 'llm',
    },

    // Generation errors
    [ErrorCodes.GENERATION_STORY_BIBLE_FAILED]: {
        message: 'Failed to generate story bible',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Story generation failed. Try again.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_SCENE_FAILED]: {
        message: 'Failed to generate scene',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Scene generation failed. Try again.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_TIMELINE_FAILED]: {
        message: 'Failed to generate timeline',
        retryable: true,
        retryDelayMs: 2000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Timeline generation failed. Try again.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_KEYFRAME_FAILED]: {
        message: 'Failed to generate keyframe',
        retryable: true,
        retryDelayMs: 3000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Keyframe generation failed. Try again.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_VIDEO_FAILED]: {
        message: 'Failed to generate video',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Video generation failed. Try again.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_CANCELLED]: {
        message: 'Generation was cancelled',
        retryable: false,
        userFacing: true,
        userAction: 'Generation cancelled.',
        severity: 'info',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_QUEUE_BUSY]: {
        message: 'Generation queue is busy',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Another generation is in progress. Please wait.',
        severity: 'warning',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_QUEUE_FULL]: {
        message: 'Generation queue is full',
        retryable: false,
        userFacing: true,
        userAction: 'Queue is at maximum capacity. Cancel some pending operations.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_FAILED]: {
        message: 'Generation failed',
        retryable: true,
        retryDelayMs: 3000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Generation failed. Please try again.',
        severity: 'error',
        category: 'generation',
    },
    [ErrorCodes.GENERATION_VALIDATION_FAILED]: {
        message: 'Generation prerequisites not met',
        retryable: false,
        userFacing: true,
        userAction: 'Check that all required fields are filled.',
        severity: 'warning',
        category: 'generation',
    },

    // Resource errors
    [ErrorCodes.RESOURCE_VRAM_LOW]: {
        message: 'GPU memory is running low',
        retryable: true,
        retryDelayMs: 10000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Low GPU memory. Close other apps to free resources.',
        severity: 'warning',
        category: 'resource',
    },
    [ErrorCodes.RESOURCE_MEMORY_LOW]: {
        message: 'System memory is running low',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 2,
        userFacing: true,
        userAction: 'Low system memory. Close browser tabs.',
        severity: 'warning',
        category: 'resource',
    },
    [ErrorCodes.RESOURCE_DISK_FULL]: {
        message: 'Disk space is full',
        retryable: false,
        userFacing: true,
        userAction: 'Free up disk space and try again.',
        severity: 'critical',
        category: 'resource',
    },
    [ErrorCodes.RESOURCE_GPU_BUSY]: {
        message: 'GPU is busy with another task',
        retryable: true,
        retryDelayMs: 10000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'GPU is busy. Will retry when available.',
        severity: 'warning',
        category: 'resource',
    },
    [ErrorCodes.RESOURCE_QUEUE_FULL]: {
        message: 'Processing queue is full',
        retryable: true,
        retryDelayMs: 15000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Queue is at capacity. Will retry shortly.',
        severity: 'warning',
        category: 'resource',
    },

    // Persistence errors
    [ErrorCodes.PERSISTENCE_SAVE_FAILED]: {
        message: 'Failed to save data',
        retryable: true,
        retryDelayMs: 1000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Changes may not be saved. Try again.',
        severity: 'error',
        category: 'persistence',
    },
    [ErrorCodes.PERSISTENCE_LOAD_FAILED]: {
        message: 'Failed to load saved data',
        retryable: true,
        retryDelayMs: 1000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Could not load your data. Refresh to try again.',
        severity: 'error',
        category: 'persistence',
    },
    [ErrorCodes.PERSISTENCE_QUOTA_EXCEEDED]: {
        message: 'Storage quota exceeded',
        retryable: false,
        userFacing: true,
        userAction: 'Browser storage is full. Export your project.',
        severity: 'error',
        category: 'persistence',
    },
    [ErrorCodes.PERSISTENCE_CORRUPT_DATA]: {
        message: 'Stored data appears corrupt',
        retryable: false,
        userFacing: true,
        userAction: 'Data corruption detected. Some data may be lost.',
        severity: 'critical',
        category: 'persistence',
    },

    // Validation errors
    [ErrorCodes.VALIDATION_STORY_IDEA_TOO_SHORT]: {
        message: 'Story idea is too short',
        retryable: false,
        userFacing: true,
        userAction: 'Add more detail to your story idea (15+ words).',
        severity: 'warning',
        category: 'validation',
    },
    [ErrorCodes.VALIDATION_VISION_TOO_SHORT]: {
        message: 'Director\'s vision is too short',
        retryable: false,
        userFacing: true,
        userAction: 'Add more detail to your vision (20+ words).',
        severity: 'warning',
        category: 'validation',
    },
    [ErrorCodes.VALIDATION_MISSING_KEYFRAME]: {
        message: 'Keyframe image is required',
        retryable: false,
        userFacing: true,
        userAction: 'Generate a keyframe before creating video.',
        severity: 'warning',
        category: 'validation',
    },
    [ErrorCodes.VALIDATION_SCENE_INCOMPLETE]: {
        message: 'Scene data is incomplete',
        retryable: false,
        userFacing: true,
        userAction: 'Complete all scene fields before proceeding.',
        severity: 'warning',
        category: 'validation',
    },
    [ErrorCodes.VALIDATION_WORKFLOW_MAPPING]: {
        message: 'Workflow mapping is incomplete',
        retryable: false,
        userFacing: true,
        userAction: 'Configure workflow mappings in Settings.',
        severity: 'warning',
        category: 'validation',
    },

    // Network errors
    [ErrorCodes.NETWORK_OFFLINE]: {
        message: 'No internet connection',
        retryable: true,
        retryDelayMs: 5000,
        maxRetries: 10,
        userFacing: true,
        userAction: 'Check your internet connection.',
        severity: 'error',
        category: 'network',
    },
    [ErrorCodes.NETWORK_TIMEOUT]: {
        message: 'Network request timed out',
        retryable: true,
        retryDelayMs: 3000,
        maxRetries: 3,
        userFacing: true,
        userAction: 'Request timed out. Retrying...',
        severity: 'warning',
        category: 'network',
    },
    [ErrorCodes.NETWORK_CORS_BLOCKED]: {
        message: 'Request blocked by CORS policy',
        retryable: false,
        userFacing: true,
        userAction: 'Cross-origin request blocked. Check server config.',
        severity: 'error',
        category: 'network',
    },

    // Unknown
    [ErrorCodes.UNKNOWN]: {
        message: 'An unexpected error occurred',
        retryable: false,
        userFacing: true,
        userAction: 'Try again or refresh the page.',
        severity: 'error',
        category: 'unknown',
    },
};

// ============================================================================
// STRUCTURED ERROR CLASS
// ============================================================================

export class CSGError extends Error {
    public readonly code: ErrorCode;
    public readonly metadata: ErrorMetadata;
    public readonly timestamp: number;
    public readonly context?: Record<string, unknown>;
    public readonly originalError?: Error;

    constructor(
        code: ErrorCode,
        context?: Record<string, unknown>,
        originalError?: Error
    ) {
        const metadata = ErrorMetadataMap[code];
        super(metadata.message);
        
        this.name = 'CSGError';
        this.code = code;
        this.metadata = metadata;
        this.timestamp = Date.now();
        this.context = context;
        this.originalError = originalError;

        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CSGError);
        }
    }

    /**
     * Check if error is retryable
     */
    get isRetryable(): boolean {
        return this.metadata.retryable;
    }

    /**
     * Get retry delay in milliseconds
     */
    get retryDelay(): number {
        return this.metadata.retryDelayMs ?? 1000;
    }

    /**
     * Get max retry attempts
     */
    get maxRetries(): number {
        return this.metadata.maxRetries ?? 1;
    }

    /**
     * Get user-facing message
     */
    get userMessage(): string {
        return this.metadata.userAction ?? this.metadata.message;
    }

    /**
     * Serialize error for logging
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            category: this.metadata.category,
            severity: this.metadata.severity,
            retryable: this.isRetryable,
            timestamp: this.timestamp,
            context: this.context,
            stack: this.stack,
            originalError: this.originalError ? {
                name: this.originalError.name,
                message: this.originalError.message,
                stack: this.originalError.stack,
            } : undefined,
        };
    }

    /**
     * Create structured log entry
     */
    toLogEntry(): string {
        const ctx = this.context ? ` | Context: ${JSON.stringify(this.context)}` : '';
        return `[${this.metadata.severity.toUpperCase()}] [${this.code}] ${this.message}${ctx}`;
    }
}

// ============================================================================
// ERROR DETECTION UTILITIES
// ============================================================================

/**
 * Detect error code from error message or type
 */
export function detectErrorCode(error: Error | string): ErrorCode {
    const message = typeof error === 'string' ? error.toLowerCase() : error.message.toLowerCase();

    // CUDA/GPU errors
    if (message.includes('cuda') && message.includes('out of memory')) {
        return ErrorCodes.COMFYUI_CUDA_OOM;
    }
    if (message.includes('vram') || message.includes('gpu memory')) {
        return ErrorCodes.COMFYUI_VRAM_EXHAUSTED;
    }

    // Timeout errors
    if (message.includes('timeout') && message.includes('comfyui')) {
        return ErrorCodes.COMFYUI_TIMEOUT_GENERATION;
    }
    if (message.includes('timeout')) {
        return ErrorCodes.NETWORK_TIMEOUT;
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
        return ErrorCodes.LLM_RATE_LIMIT;
    }

    // Connection errors
    if (message.includes('failed to fetch') || message.includes('network error')) {
        return ErrorCodes.NETWORK_OFFLINE;
    }
    if (message.includes('cors')) {
        return ErrorCodes.NETWORK_CORS_BLOCKED;
    }

    // ComfyUI specific
    if (message.includes('queue') && (message.includes('full') || message.includes('capacity'))) {
        return ErrorCodes.COMFYUI_QUEUE_FULL;
    }
    if (message.includes('workflow') && (message.includes('invalid') || message.includes('not found'))) {
        return ErrorCodes.COMFYUI_WORKFLOW_INVALID;
    }

    // LLM specific
    if (message.includes('api key') || message.includes('unauthorized') || message.includes('401')) {
        return ErrorCodes.LLM_API_KEY_INVALID;
    }
    if (message.includes('parse') || message.includes('json')) {
        return ErrorCodes.LLM_PARSE_ERROR;
    }

    // Storage errors
    if (message.includes('quota') || message.includes('storage')) {
        return ErrorCodes.PERSISTENCE_QUOTA_EXCEEDED;
    }
    if (message.includes('indexeddb')) {
        return ErrorCodes.HYDRATION_INDEXEDDB_FAILED;
    }

    return ErrorCodes.UNKNOWN;
}

/**
 * Wrap any error in a CSGError with detected code
 */
export function wrapError(
    error: Error | string,
    context?: Record<string, unknown>,
    overrideCode?: ErrorCode
): CSGError {
    if (error instanceof CSGError) {
        return error;
    }

    const originalError = typeof error === 'string' ? new Error(error) : error;
    const code = overrideCode ?? detectErrorCode(originalError);
    
    return new CSGError(code, context, originalError);
}

/**
 * Check if an error should be retried
 */
export function shouldRetry(error: Error, attemptNumber: number): boolean {
    const csgError = error instanceof CSGError ? error : wrapError(error);
    return csgError.isRetryable && attemptNumber < csgError.maxRetries;
}

/**
 * Get retry delay with exponential backoff
 */
export function getRetryDelay(error: Error, attemptNumber: number): number {
    const csgError = error instanceof CSGError ? error : wrapError(error);
    const baseDelay = csgError.retryDelay;
    // Exponential backoff: delay * 2^attempt (capped at 60s)
    return Math.min(baseDelay * Math.pow(2, attemptNumber), 60000);
}
