/**
 * LM Studio Model Manager Service
 * 
 * Manages automatic model loading/unloading to prevent VRAM conflicts
 * between LLM inference and ComfyUI image/video generation.
 * 
 * LM Studio models must be ejected before ComfyUI can use VRAM for generation.
 * 
 * @module services/lmStudioModelManager
 */

import { generateCorrelationId, logCorrelation } from '../utils/correlation';

// ============================================================================
// Types
// ============================================================================

export interface LMStudioModelState {
    /** Whether any models are currently loaded */
    hasLoadedModels: boolean;
    /** IDs of currently loaded models */
    loadedModelIds: string[];
    /** Error message if state check failed */
    error?: string;
}

export interface UnloadResult {
    /** Whether unload was successful */
    success: boolean;
    /** Number of models that were unloaded */
    unloadedCount: number;
    /** Error message if unload failed */
    error?: string;
    /** Time taken in milliseconds */
    durationMs: number;
}

export interface LMStudioConfig {
    /** Base URL for LM Studio API (without path) */
    baseUrl: string;
    /** Timeout for unload operation in ms */
    unloadTimeoutMs: number;
    /** Polling interval when waiting for unload confirmation */
    pollIntervalMs: number;
    /** Maximum retries for unload verification */
    maxRetries: number;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: LMStudioConfig = {
    baseUrl: import.meta.env.VITE_LMSTUDIO_BASE_URL || 
             import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL?.replace('/v1/chat/completions', '') ||
             'http://192.168.50.192:1234',
    unloadTimeoutMs: 30000,  // 30 seconds max wait
    pollIntervalMs: 1000,    // Check every second
    maxRetries: 30,          // 30 retries at 1s = 30s max
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the current state of loaded models in LM Studio
 */
export async function getLMStudioModelState(
    config: Partial<LMStudioConfig> = {}
): Promise<LMStudioModelState> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    try {
        // Try native LM Studio API first (more detailed)
        const response = await fetch(`${cfg.baseUrl}/api/v0/models`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            const data = await response.json();
            const loadedModels = (data.data || []).filter(
                (m: any) => m.state === 'loaded' || m.state === 'loading'
            );
            
            return {
                hasLoadedModels: loadedModels.length > 0,
                loadedModelIds: loadedModels.map((m: any) => m.id || m.path)
            };
        }
        
        // Fallback to OpenAI-compatible endpoint
        const fallbackResponse = await fetch(`${cfg.baseUrl}/v1/models`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        
        if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            const models = data.data || [];
            
            // OpenAI endpoint doesn't show load state, assume loaded if listed
            return {
                hasLoadedModels: models.length > 0,
                loadedModelIds: models.map((m: any) => m.id)
            };
        }
        
        return {
            hasLoadedModels: false,
            loadedModelIds: [],
            error: `LM Studio returned ${fallbackResponse.status}`
        };
        
    } catch (error) {
        // Connection refused likely means LM Studio isn't running or no models loaded
        const isConnectionError = error instanceof Error && 
            (error.message.includes('fetch') || error.message.includes('ECONNREFUSED'));
        
        return {
            hasLoadedModels: false,
            loadedModelIds: [],
            error: isConnectionError ? undefined : String(error)
        };
    }
}

/**
 * Unload all models from LM Studio via REST API
 * 
 * Uses the undocumented /api/v0/models endpoint with DELETE method
 * or falls back to model-specific unload if available.
 */
export async function unloadAllModels(
    config: Partial<LMStudioConfig> = {}
): Promise<UnloadResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    logCorrelation(
        { correlationId, timestamp: startTime, source: 'lmstudio' as any },
        'unload-models-start',
        { baseUrl: cfg.baseUrl }
    );
    
    try {
        // Get current state
        const initialState = await getLMStudioModelState(cfg);
        
        if (!initialState.hasLoadedModels) {
            return {
                success: true,
                unloadedCount: 0,
                durationMs: Date.now() - startTime
            };
        }
        
        const modelsToUnload = initialState.loadedModelIds;
        console.log(`[LMStudioManager] Unloading ${modelsToUnload.length} models for VRAM...`);
        
        // Try to unload each model via the API
        for (const modelId of modelsToUnload) {
            try {
                // Try DELETE on model endpoint (LM Studio >= 0.3.0)
                await fetch(`${cfg.baseUrl}/api/v0/models/${encodeURIComponent(modelId)}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(10000)
                });
            } catch {
                // Ignore individual model unload errors
            }
        }
        
        // Try bulk unload endpoint if available
        try {
            await fetch(`${cfg.baseUrl}/api/v0/models`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000)
            });
        } catch {
            // Bulk unload may not be supported
        }
        
        // Poll until models are unloaded or timeout
        let retries = 0;
        while (retries < cfg.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, cfg.pollIntervalMs));
            
            const currentState = await getLMStudioModelState(cfg);
            
            if (!currentState.hasLoadedModels) {
                const durationMs = Date.now() - startTime;
                
                logCorrelation(
                    { correlationId, timestamp: Date.now(), source: 'lmstudio' as any },
                    'unload-models-success',
                    { unloadedCount: modelsToUnload.length, durationMs }
                );
                
                console.log(`[LMStudioManager] ✓ Models unloaded in ${durationMs}ms`);
                
                return {
                    success: true,
                    unloadedCount: modelsToUnload.length,
                    durationMs
                };
            }
            
            retries++;
        }
        
        // Timeout - models still loaded
        const durationMs = Date.now() - startTime;
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'lmstudio' as any },
            'unload-models-timeout',
            { remainingModels: (await getLMStudioModelState(cfg)).loadedModelIds }
        );
        
        return {
            success: false,
            unloadedCount: 0,
            error: `Timeout waiting for models to unload after ${durationMs}ms. Please manually unload models in LM Studio.`,
            durationMs
        };
        
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'lmstudio' as any },
            'unload-models-error',
            { error: errorMessage }
        );
        
        return {
            success: false,
            unloadedCount: 0,
            error: errorMessage,
            durationMs
        };
    }
}

/**
 * Ensure all LM Studio models are unloaded before proceeding
 * 
 * This should be called before ComfyUI generation to free VRAM.
 * 
 * @throws Error if models cannot be unloaded within timeout
 */
export async function ensureModelsUnloaded(
    config: Partial<LMStudioConfig> = {},
    throwOnFailure: boolean = false
): Promise<boolean> {
    const state = await getLMStudioModelState(config);
    
    if (!state.hasLoadedModels) {
        return true; // Already clear
    }
    
    console.log(`[LMStudioManager] Models loaded (${state.loadedModelIds.join(', ')}), unloading for ComfyUI...`);
    
    const result = await unloadAllModels(config);
    
    if (!result.success && throwOnFailure) {
        throw new Error(result.error || 'Failed to unload LM Studio models');
    }
    
    return result.success;
}

/**
 * Check if LM Studio is reachable
 */
export async function isLMStudioReachable(
    config: Partial<LMStudioConfig> = {}
): Promise<boolean> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    try {
        const response = await fetch(`${cfg.baseUrl}/v1/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Get the configured LM Studio base URL
 */
export function getLMStudioBaseUrl(): string {
    return DEFAULT_CONFIG.baseUrl;
}
