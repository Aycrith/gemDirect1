/**
 * Resource Preflight Module
 * 
 * Provides comprehensive preflight checks for video generation resources:
 * - VRAM availability and requirements per preset
 * - Required ComfyUI nodes per workflow type
 * - Model availability verification
 * - Automatic preset fallback when resources are insufficient
 * 
 * This module integrates with GenerationQueue to prevent OOM errors
 * and ensure graceful degradation when resources are constrained.
 * 
 * @module services/resourcePreflight
 */

import type { LocalGenerationSettings } from '../types';
import { checkSystemResources, getInstalledNodes } from './comfyUIService';
import { getAvailableDeflickerNode } from './deflickerService';
import { checkIPAdapterAvailability } from './ipAdapterService';
import type { StabilityProfileId } from '../utils/stabilityProfiles';
import { STABILITY_PROFILES } from '../utils/stabilityProfiles';

// ============================================================================
// VRAM REQUIREMENTS BY PRESET
// ============================================================================

/**
 * VRAM requirements for each stability preset (in MB)
 * 
 * Updated for B2 (Resource Safety & Defaults Hardening):
 * - Fast: 6-8 GB - Basic WAN workflow, no temporal processing
 * - Standard: 8-12 GB - WAN + deflicker post-processing
 * - Cinematic: 12-16 GB - WAN + deflicker + IP-Adapter + FETA
 * 
 * Based on empirical testing with RTX 3060/3070/3090/4090 cards.
 * Values represent minimum VRAM to start generation without OOM.
 */
export const PRESET_VRAM_REQUIREMENTS: Record<StabilityProfileId, number> = {
    fast: 6144,      // 6GB - Basic WAN 2.5B workflow only
    standard: 8192,  // 8GB - WAN 2.5B + deflicker post-processing
    cinematic: 12288, // 12GB - WAN 2.5B + deflicker + IP-Adapter + FETA
    custom: 8192,    // 8GB - Assume standard as baseline
};

/**
 * Recommended VRAM for comfortable operation (in MB)
 * Includes headroom for system overhead and unexpected spikes.
 */
export const PRESET_VRAM_RECOMMENDED: Record<StabilityProfileId, number> = {
    fast: 8192,      // 8GB recommended for Fast
    standard: 12288, // 12GB recommended for Standard
    cinematic: 16384, // 16GB recommended for Cinematic
    custom: 12288,   // 12GB baseline for Custom
};

/**
 * Recommended headroom above minimum VRAM (in MB)
 * Leaves room for system overhead and unexpected spikes
 */
export const VRAM_HEADROOM_MB = 2048; // 2GB

/**
 * Maximum acceptable VRAM for any preset (to warn about overkill)
 */
export const MAX_RECOMMENDED_VRAM_MB = 24576; // 24GB

// ============================================================================
// REQUIRED NODES BY WORKFLOW TYPE
// ============================================================================

/**
 * Required nodes for each workflow profile type
 */
export const WORKFLOW_REQUIRED_NODES: Record<string, string[]> = {
    // Text-to-image keyframe generation
    'wan-t2i': ['CLIPTextEncode', 'KSampler', 'VAEDecode', 'SaveImage'],
    
    // Image-to-video generation
    'wan-i2v': ['CLIPTextEncode', 'LoadImage', 'KSampler', 'VAEDecode', 'VHS_VideoCombine'],
    
    // First-last-frame-to-video (bookend workflow)
    'wan-flf2v': ['WanFirstLastFrameToVideo', 'CLIPTextEncode', 'LoadImage'],
    
    // First-last-frame-to-video with FETA enhancement
    'wan-flf2v-feta': ['Wan22FirstLastFrameToVideoLatentEnhanced', 'CLIPTextEncode', 'LoadImage', 'FETA_Enhance'],
    
    // Fun inpaint control workflow
    'wan-fun-inpaint': ['WanFunInpaintToVideo', 'CLIPTextEncode', 'LoadImage'],
    
    // IP-Adapter enhanced workflow
    'wan-ipadapter': ['IPAdapterApply', 'CLIPVisionEncode', 'CLIPTextEncode', 'LoadImage'],
    
    // Scene chained workflow
    'scene-chained': ['CLIPTextEncode', 'LoadImage', 'KSampler', 'VAEDecode'],
};

/**
 * Optional enhancement nodes (warn if missing but don't block)
 */
export const OPTIONAL_ENHANCEMENT_NODES: Record<string, string[]> = {
    deflicker: ['TemporalSmoothing', 'VHS_VideoDeflicker', 'VideoDeflicker'],
    ipadapter: ['IPAdapterApply', 'CLIPVisionEncode', 'IPAdapterUnifiedLoader'],
    upscaler: ['VideoUpscaler', 'RealESRGAN', 'Upscale'],
};

// ============================================================================
// TYPES
// ============================================================================

export interface VRAMStatus {
    /** Whether VRAM is available (server responded) */
    available: boolean;
    /** Free VRAM in MB */
    freeMB: number;
    /** Total VRAM in MB */
    totalMB: number;
    /** Utilization percentage (0-100) */
    utilizationPercent: number;
    /** GPU name/model */
    gpuName?: string;
}

export interface PreflightResult {
    /** Overall preflight status */
    status: 'ready' | 'warning' | 'blocked';
    /** Detailed status messages */
    messages: PreflightMessage[];
    /** VRAM status from ComfyUI */
    vramStatus?: VRAMStatus;
    /** Recommended preset based on resources */
    recommendedPreset?: StabilityProfileId;
    /** Whether preset was downgraded from requested */
    wasDowngraded: boolean;
    /** Original requested preset (if downgraded) */
    originalPreset?: StabilityProfileId;
    /** Available nodes that were checked */
    availableNodes: string[];
    /** Missing required nodes */
    missingNodes: string[];
    /** Available optional enhancement nodes */
    availableEnhancements: string[];
    /** Missing optional nodes (warnings) */
    missingEnhancements: string[];
}

export interface PreflightMessage {
    level: 'info' | 'warn' | 'error';
    code: PreflightMessageCode;
    message: string;
    details?: Record<string, unknown>;
}

export type PreflightMessageCode = 
    | 'VRAM_OK'
    | 'VRAM_LOW'
    | 'VRAM_CRITICAL'
    | 'VRAM_CHECK_FAILED'
    | 'NODES_OK'
    | 'NODES_MISSING'
    | 'NODES_OPTIONAL_MISSING'
    | 'PRESET_DOWNGRADED'
    | 'PRESET_BLOCKED'
    | 'SERVER_UNREACHABLE'
    | 'DEFLICKER_UNAVAILABLE'
    | 'IPADAPTER_UNAVAILABLE';

export interface PreflightOptions {
    /** Target workflow profile ID */
    profileId?: string;
    /** Requested stability preset */
    requestedPreset?: StabilityProfileId;
    /** Skip node dependency checks */
    skipNodeCheck?: boolean;
    /** Skip VRAM check */
    skipVRAMCheck?: boolean;
    /** Allow automatic preset downgrade */
    allowDowngrade?: boolean;
    /** Log callback for debugging */
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

// ============================================================================
// PREFLIGHT CHECK FUNCTIONS
// ============================================================================

/**
 * Parse VRAM status from ComfyUI system_stats response message
 */
export function parseVRAMStatus(resourceMessage: string): VRAMStatus {
    const result: VRAMStatus = {
        available: false,
        freeMB: 0,
        totalMB: 0,
        utilizationPercent: 0,
    };
    
    // Parse GPU name
    const gpuMatch = resourceMessage.match(/GPU:\s*([^|]+)/);
    if (gpuMatch?.[1]) {
        result.gpuName = gpuMatch[1].trim();
    }
    
    // Parse total VRAM
    const totalMatch = resourceMessage.match(/Total VRAM:\s*([\d.]+)\s*GB/);
    if (totalMatch?.[1]) {
        result.totalMB = parseFloat(totalMatch[1]) * 1024;
    }
    
    // Parse free VRAM
    const freeMatch = resourceMessage.match(/Free VRAM:\s*([\d.]+)\s*GB/);
    if (freeMatch?.[1]) {
        result.freeMB = parseFloat(freeMatch[1]) * 1024;
        result.available = true;
    }
    
    // Calculate utilization
    if (result.totalMB > 0) {
        result.utilizationPercent = Math.round(((result.totalMB - result.freeMB) / result.totalMB) * 100);
    }
    
    return result;
}

/**
 * Check VRAM availability for a given preset
 */
export async function checkVRAMForPreset(
    comfyUIUrl: string,
    preset: StabilityProfileId,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<{ vramStatus: VRAMStatus; sufficient: boolean; message: string }> {
    const log = logCallback || console.log;
    const requiredMB = PRESET_VRAM_REQUIREMENTS[preset];
    
    try {
        const resourceMessage = await checkSystemResources(comfyUIUrl);
        const vramStatus = parseVRAMStatus(resourceMessage);
        
        if (!vramStatus.available) {
            return {
                vramStatus,
                sufficient: false,
                message: 'Could not determine VRAM status',
            };
        }
        
        const effectiveRequired = requiredMB + VRAM_HEADROOM_MB;
        const sufficient = vramStatus.freeMB >= effectiveRequired;
        
        log(`[Preflight] VRAM check for ${preset}: ${vramStatus.freeMB.toFixed(0)}MB free, need ${effectiveRequired.toFixed(0)}MB (${requiredMB}+${VRAM_HEADROOM_MB} headroom)`, 
            sufficient ? 'info' : 'warn');
        
        return {
            vramStatus,
            sufficient,
            message: sufficient 
                ? `VRAM OK: ${vramStatus.freeMB.toFixed(0)}MB free (need ${effectiveRequired.toFixed(0)}MB for ${preset})`
                : `VRAM insufficient: ${vramStatus.freeMB.toFixed(0)}MB free, need ${effectiveRequired.toFixed(0)}MB for ${preset}`,
        };
    } catch (error) {
        log(`[Preflight] VRAM check failed: ${error}`, 'warn');
        return {
            vramStatus: { available: false, freeMB: 0, totalMB: 0, utilizationPercent: 0 },
            sufficient: false,
            message: `VRAM check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Check if required nodes are installed for a workflow profile
 */
export async function checkNodesForProfile(
    comfyUIUrl: string,
    profileId: string,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<{ available: string[]; missing: string[]; success: boolean }> {
    const log = logCallback || console.log;
    const requiredNodes = WORKFLOW_REQUIRED_NODES[profileId] || [];
    
    if (requiredNodes.length === 0) {
        log(`[Preflight] No known node requirements for profile ${profileId}`, 'info');
        return { available: [], missing: [], success: true };
    }
    
    try {
        const installedNodes = await getInstalledNodes(comfyUIUrl);
        const available: string[] = [];
        const missing: string[] = [];
        
        for (const node of requiredNodes) {
            if (installedNodes.has(node)) {
                available.push(node);
            } else {
                missing.push(node);
            }
        }
        
        const success = missing.length === 0;
        log(`[Preflight] Node check for ${profileId}: ${available.length}/${requiredNodes.length} available${missing.length > 0 ? `, missing: ${missing.join(', ')}` : ''}`,
            success ? 'info' : 'error');
        
        return { available, missing, success };
    } catch (error) {
        log(`[Preflight] Node check failed: ${error}`, 'error');
        return { available: [], missing: requiredNodes, success: false };
    }
}

/**
 * Check if optional enhancement nodes are available
 */
export async function checkEnhancementNodes(
    comfyUIUrl: string,
    preset: StabilityProfileId,
    logCallback?: (message: string, level?: 'info' | 'warn' | 'error') => void
): Promise<{ available: string[]; missing: string[]; warnings: string[] }> {
    const log = logCallback || console.log;
    const profile = STABILITY_PROFILES[preset];
    const available: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];
    
    // Check deflicker nodes if deflicker is enabled
    if (profile.featureFlags.videoDeflicker) {
        const deflickerNode = await getAvailableDeflickerNode(comfyUIUrl);
        if (deflickerNode) {
            available.push(deflickerNode);
            log(`[Preflight] Deflicker node available: ${deflickerNode}`, 'info');
        } else {
            const deflickerNodes = OPTIONAL_ENHANCEMENT_NODES.deflicker ?? [];
            missing.push(...deflickerNodes);
            warnings.push('No deflicker nodes available - deflicker will be skipped');
            log(`[Preflight] No deflicker nodes found`, 'warn');
        }
    }
    
    // Check IP-Adapter nodes if character consistency is enabled
    if (profile.featureFlags.ipAdapterReferenceConditioning) {
        const ipResult = await checkIPAdapterAvailability(comfyUIUrl);
        if (ipResult.available) {
            available.push(...ipResult.availableNodes);
            log(`[Preflight] IP-Adapter nodes available: ${ipResult.availableNodes.join(', ')}`, 'info');
        } else {
            missing.push(...ipResult.missingNodes);
            warnings.push(`IP-Adapter not available: ${ipResult.error || 'missing nodes'}`);
            log(`[Preflight] IP-Adapter unavailable: ${ipResult.error}`, 'warn');
        }
    }
    
    return { available, missing, warnings };
}

/**
 * Determine the best available preset based on VRAM
 */
export function findBestAvailablePreset(
    vramStatus: VRAMStatus,
    requestedPreset: StabilityProfileId
): { preset: StabilityProfileId; wasDowngraded: boolean } {
    const requestedRequirement = PRESET_VRAM_REQUIREMENTS[requestedPreset];
    const effectiveRequired = requestedRequirement + VRAM_HEADROOM_MB;
    
    // If requested preset fits, use it
    if (vramStatus.freeMB >= effectiveRequired) {
        return { preset: requestedPreset, wasDowngraded: false };
    }
    
    // Try progressively lower presets
    const presetOrder: StabilityProfileId[] = ['cinematic', 'standard', 'fast'];
    const requestedIndex = presetOrder.indexOf(requestedPreset);
    
    for (let i = requestedIndex + 1; i < presetOrder.length; i++) {
        const fallbackPreset = presetOrder[i];
        if (!fallbackPreset) continue;
        
        const fallbackRequired = PRESET_VRAM_REQUIREMENTS[fallbackPreset] + VRAM_HEADROOM_MB;
        if (vramStatus.freeMB >= fallbackRequired) {
            return { preset: fallbackPreset, wasDowngraded: true };
        }
    }
    
    // If even fast doesn't fit, still return fast but mark as blocked
    return { preset: 'fast', wasDowngraded: true };
}

/**
 * Run comprehensive preflight checks for video generation
 */
export async function runResourcePreflight(
    settings: LocalGenerationSettings,
    options: PreflightOptions = {}
): Promise<PreflightResult> {
    const {
        profileId = settings.videoWorkflowProfile || 'wan-i2v',
        requestedPreset = 'standard',
        skipNodeCheck = false,
        skipVRAMCheck = false,
        allowDowngrade = true,
        logCallback,
    } = options;
    
    const log = logCallback || console.log;
    const messages: PreflightMessage[] = [];
    let status: PreflightResult['status'] = 'ready';
    let vramStatus: VRAMStatus | undefined;
    let recommendedPreset: StabilityProfileId = requestedPreset;
    let wasDowngraded = false;
    let availableNodes: string[] = [];
    let missingNodes: string[] = [];
    let availableEnhancements: string[] = [];
    let missingEnhancements: string[] = [];
    
    log(`[Preflight] Starting resource preflight for profile=${profileId}, preset=${requestedPreset}`, 'info');
    
    // Check server connectivity first
    if (!settings.comfyUIUrl) {
        messages.push({
            level: 'error',
            code: 'SERVER_UNREACHABLE',
            message: 'ComfyUI URL not configured',
        });
        return {
            status: 'blocked',
            messages,
            wasDowngraded: false,
            availableNodes: [],
            missingNodes: [],
            availableEnhancements: [],
            missingEnhancements: [],
        };
    }
    
    // VRAM check
    if (!skipVRAMCheck) {
        const vramResult = await checkVRAMForPreset(settings.comfyUIUrl, requestedPreset, log);
        vramStatus = vramResult.vramStatus;
        
        if (!vramResult.vramStatus.available) {
            messages.push({
                level: 'warn',
                code: 'VRAM_CHECK_FAILED',
                message: vramResult.message,
            });
            status = 'warning';
        } else if (!vramResult.sufficient) {
            if (allowDowngrade) {
                const fallback = findBestAvailablePreset(vramResult.vramStatus, requestedPreset);
                recommendedPreset = fallback.preset;
                wasDowngraded = fallback.wasDowngraded;
                
                if (wasDowngraded) {
                    const newRequirement = PRESET_VRAM_REQUIREMENTS[recommendedPreset] + VRAM_HEADROOM_MB;
                    const stillInsufficient = vramResult.vramStatus.freeMB < newRequirement;
                    
                    messages.push({
                        level: stillInsufficient ? 'error' : 'warn',
                        code: stillInsufficient ? 'VRAM_CRITICAL' : 'PRESET_DOWNGRADED',
                        message: `Preset downgraded from ${requestedPreset} to ${recommendedPreset} due to VRAM constraints`,
                        details: {
                            originalPreset: requestedPreset,
                            recommendedPreset,
                            freeMB: vramResult.vramStatus.freeMB,
                            requiredMB: PRESET_VRAM_REQUIREMENTS[requestedPreset],
                        },
                    });
                    status = stillInsufficient ? 'blocked' : 'warning';
                }
            } else {
                messages.push({
                    level: 'error',
                    code: 'VRAM_CRITICAL',
                    message: vramResult.message,
                    details: {
                        freeMB: vramResult.vramStatus.freeMB,
                        requiredMB: PRESET_VRAM_REQUIREMENTS[requestedPreset],
                    },
                });
                status = 'blocked';
            }
        } else {
            messages.push({
                level: 'info',
                code: 'VRAM_OK',
                message: vramResult.message,
            });
        }
    }
    
    // Node dependency check
    if (!skipNodeCheck) {
        const nodeResult = await checkNodesForProfile(settings.comfyUIUrl, profileId, log);
        availableNodes = nodeResult.available;
        missingNodes = nodeResult.missing;
        
        if (!nodeResult.success) {
            messages.push({
                level: 'error',
                code: 'NODES_MISSING',
                message: `Missing required nodes for ${profileId}: ${missingNodes.join(', ')}`,
                details: { profileId, missingNodes },
            });
            status = 'blocked';
        } else {
            messages.push({
                level: 'info',
                code: 'NODES_OK',
                message: `All required nodes available for ${profileId}`,
            });
        }
        
        // Check enhancement nodes for the effective preset
        const enhancementResult = await checkEnhancementNodes(settings.comfyUIUrl, recommendedPreset, log);
        availableEnhancements = enhancementResult.available;
        missingEnhancements = enhancementResult.missing;
        
        for (const warning of enhancementResult.warnings) {
            messages.push({
                level: 'warn',
                code: 'NODES_OPTIONAL_MISSING',
                message: warning,
            });
            if (status === 'ready') status = 'warning';
        }
    }
    
    log(`[Preflight] Completed: status=${status}, preset=${recommendedPreset}${wasDowngraded ? ' (downgraded from ' + requestedPreset + ')' : ''}`, 
        status === 'blocked' ? 'error' : status === 'warning' ? 'warn' : 'info');
    
    return {
        status,
        messages,
        vramStatus,
        recommendedPreset,
        wasDowngraded,
        originalPreset: wasDowngraded ? requestedPreset : undefined,
        availableNodes,
        missingNodes,
        availableEnhancements,
        missingEnhancements,
    };
}

/**
 * Quick VRAM check for queue gating
 * Returns true if generation should proceed, false if it should wait
 */
export async function canProceedWithGeneration(
    comfyUIUrl: string,
    minVRAMMB: number = PRESET_VRAM_REQUIREMENTS.fast
): Promise<{ canProceed: boolean; freeMB: number; reason?: string }> {
    try {
        const resourceMessage = await checkSystemResources(comfyUIUrl);
        const vramStatus = parseVRAMStatus(resourceMessage);
        
        if (!vramStatus.available) {
            return { canProceed: true, freeMB: 0, reason: 'VRAM status unavailable - proceeding anyway' };
        }
        
        const canProceed = vramStatus.freeMB >= minVRAMMB;
        return {
            canProceed,
            freeMB: vramStatus.freeMB,
            reason: canProceed 
                ? undefined 
                : `Insufficient VRAM: ${vramStatus.freeMB.toFixed(0)}MB < ${minVRAMMB}MB required`,
        };
    } catch (error) {
        // On error, allow proceeding (fail-open)
        return { canProceed: true, freeMB: 0, reason: 'VRAM check failed - proceeding anyway' };
    }
}

/**
 * Get human-readable description of preflight result
 */
export function formatPreflightSummary(result: PreflightResult): string {
    const lines: string[] = [];
    
    // Status header
    const statusEmoji = result.status === 'ready' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
    lines.push(`${statusEmoji} Preflight Check: ${result.status.toUpperCase()}`);
    
    // VRAM status
    if (result.vramStatus?.available) {
        const vram = result.vramStatus;
        lines.push(`GPU: ${vram.gpuName || 'Unknown'} | VRAM: ${(vram.freeMB / 1024).toFixed(1)}GB free / ${(vram.totalMB / 1024).toFixed(1)}GB total (${vram.utilizationPercent}% used)`);
    }
    
    // Preset recommendation
    if (result.recommendedPreset) {
        if (result.wasDowngraded && result.originalPreset) {
            lines.push(`Preset: ${result.recommendedPreset} (downgraded from ${result.originalPreset} due to VRAM)`);
        } else {
            lines.push(`Preset: ${result.recommendedPreset}`);
        }
    }
    
    // Messages
    const warnings = result.messages.filter(m => m.level === 'warn');
    const errors = result.messages.filter(m => m.level === 'error');
    
    if (errors.length > 0) {
        lines.push(`Errors (${errors.length}):`);
        errors.forEach(e => lines.push(`  - ${e.message}`));
    }
    
    if (warnings.length > 0) {
        lines.push(`Warnings (${warnings.length}):`);
        warnings.forEach(w => lines.push(`  - ${w.message}`));
    }
    
    return lines.join('\n');
}
