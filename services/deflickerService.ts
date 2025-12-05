/**
 * Video Deflicker Service (Phase 5 - Temporal Coherence Enhancement)
 * 
 * Provides temporal deflicker post-processing for video generation.
 * Uses frame blending to reduce flicker and improve temporal consistency.
 * 
 * This is an experimental feature that can be enabled via feature flags:
 * - videoDeflicker: boolean - Master enable switch
 * - deflickerStrength: number - Blend strength (0.0-1.0)
 * - deflickerWindowSize: number - Temporal window in frames
 * 
 * ## Node Availability Status (December 2025)
 * 
 * The following deflicker nodes are checked in order of preference:
 * 1. TemporalSmoothing - Custom node (not available in standard ComfyUI)
 * 2. VHS_VideoCombine - From VideoHelperSuite (has optional deflicker)
 * 3. VideoDeflicker - Custom node (requires installation)
 * 
 * If no deflicker node is available, the feature gracefully degrades to no-op.
 * 
 * @module services/deflickerService
 */

import type { LocalGenerationSettings } from '../types';
import { getFeatureFlag } from '../utils/featureFlags';
import { getInstalledNodes } from './comfyUIService';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Deflicker configuration
 */
export interface DeflickerConfig {
    /** Whether deflicker is enabled */
    enabled: boolean;
    
    /** Blend strength (0.0-1.0). Higher = smoother but may reduce sharpness */
    strength: number;
    
    /** Temporal window size in frames for averaging */
    windowSize: number;
    
    /** Deflicker method */
    method: 'temporal_blend' | 'histogram_match' | 'optical_flow';
}

/**
 * Default deflicker configuration
 */
export const DEFAULT_DEFLICKER_CONFIG: DeflickerConfig = {
    enabled: false,
    strength: 0.35,
    windowSize: 3,
    method: 'temporal_blend',
};

/**
 * Result of deflicker operation
 */
export interface DeflickerResult {
    success: boolean;
    outputPath?: string;
    outputData?: string; // Base64 encoded video
    originalFrameCount?: number;
    processingTimeMs?: number;
    flickerReduction?: number; // Percentage of flicker reduced (0-100)
    error?: string;
}

/**
 * ComfyUI deflicker node configuration
 * Note: This may need to be adjusted based on available ComfyUI nodes
 */
export interface DeflickerNodeConfig {
    /** Node type in ComfyUI */
    class_type: string;
    
    /** Node inputs */
    inputs: {
        images: [string, number]; // Connection from previous node
        window_size?: number;
        strength?: number;
    };
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Check if deflicker is enabled in settings
 */
export function isDeflickerEnabled(settings: LocalGenerationSettings): boolean {
    const flags = settings.featureFlags;
    return getFeatureFlag(flags, 'videoDeflicker');
}

/**
 * Get deflicker configuration from settings
 */
export function getDeflickerConfig(settings: LocalGenerationSettings): DeflickerConfig {
    const flags = settings.featureFlags;
    
    // Get values with proper type coercion
    const strength = flags?.deflickerStrength;
    const windowSize = flags?.deflickerWindowSize;
    
    return {
        enabled: getFeatureFlag(flags, 'videoDeflicker'),
        strength: typeof strength === 'number' ? strength : DEFAULT_DEFLICKER_CONFIG.strength,
        windowSize: typeof windowSize === 'number' ? windowSize : DEFAULT_DEFLICKER_CONFIG.windowSize,
        method: 'temporal_blend', // Currently only temporal_blend is implemented
    };
}

/**
 * Validates deflicker support for current workflow
 * 
 * Note: As of December 2025, common ComfyUI installations do NOT include
 * dedicated deflicker nodes. The feature is implemented but will gracefully
 * skip injection if the required node is not available.
 */
export function isDeflickerSupported(_settings: LocalGenerationSettings): boolean {
    // Deflicker is a post-processing step that can be applied to any video output
    // In the future, we may want to check for specific ComfyUI node availability
    return true;
}

/**
 * Known deflicker node class types in order of preference
 */
export const KNOWN_DEFLICKER_NODES = [
    'TemporalSmoothing',      // Custom node (rare)
    'VHS_VideoDeflicker',     // VideoHelperSuite addon
    'VideoDeflicker',         // Generic custom node
] as const;

/**
 * Check if any deflicker node is available in ComfyUI.
 * Queries the /object_info endpoint to verify node installation.
 * 
 * @param comfyUIUrl ComfyUI server URL
 * @returns The first available deflicker node class_type, or null if none available
 */
export async function getAvailableDeflickerNode(comfyUIUrl: string): Promise<string | null> {
    try {
        const installedNodes = await getInstalledNodes(comfyUIUrl);
        
        for (const nodeType of KNOWN_DEFLICKER_NODES) {
            if (installedNodes.has(nodeType)) {
                console.log(`[DeflickerService] Found available deflicker node: ${nodeType}`);
                return nodeType;
            }
        }
        
        console.log('[DeflickerService] No deflicker nodes available in ComfyUI. Checked:', KNOWN_DEFLICKER_NODES.join(', '));
        return null;
    } catch (error) {
        console.warn('[DeflickerService] Failed to query ComfyUI node availability:', error);
        return null;
    }
}

/**
 * Check if a workflow contains a known deflicker node type
 */
export function hasDeflickerNode(workflow: Record<string, unknown>): boolean {
    const nodes = workflow as Record<string, { class_type?: string }>;
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        if (node?.class_type && KNOWN_DEFLICKER_NODES.includes(node.class_type as typeof KNOWN_DEFLICKER_NODES[number])) {
            return true;
        }
    }
    return false;
}

/**
 * Create deflicker node injection for workflow
 * 
 * This injects a deflicker node between VAEDecode and video output nodes.
 * The exact node class depends on available ComfyUI custom nodes.
 * 
 * Common deflicker nodes in ComfyUI ecosystem:
 * - VHS_VideoCombine (has optional deflicker)
 * - VideoDeflicker (custom node)
 * - TemporalSmoothing (custom node)
 * 
 * @param config Deflicker configuration
 * @param sourceNodeId The node ID to connect as input (typically VAEDecode)
 * @param sourceOutputIndex The output index from the source node
 * @param nodeType The ComfyUI node class_type to use for deflicker
 */
export function createDeflickerNodeInjection(
    config: DeflickerConfig,
    sourceNodeId: string,
    sourceOutputIndex: number = 0,
    nodeType: string = 'TemporalSmoothing'
): Record<string, DeflickerNodeConfig> {
    if (!config.enabled) {
        return {};
    }

    // Generate a unique node ID for the deflicker node
    const deflickerNodeId = `deflicker_${Date.now()}`;

    return {
        [deflickerNodeId]: {
            class_type: nodeType,
            inputs: {
                images: [sourceNodeId, sourceOutputIndex],
                window_size: config.windowSize,
                strength: config.strength,
            },
        },
    };
}

/**
 * Apply deflicker configuration to a workflow JSON
 * 
 * This function modifies the workflow to include deflicker post-processing.
 * It finds the video output chain and inserts deflicker processing.
 * 
 * The function queries ComfyUI's /object_info endpoint to verify node
 * availability before injection. If no deflicker node is available,
 * the workflow is returned unchanged (graceful degradation).
 * 
 * @param workflow - The workflow JSON object
 * @param config - Deflicker configuration
 * @param comfyUIUrl - ComfyUI server URL for node availability check
 * @returns Modified workflow with deflicker nodes injected (or unchanged if node unavailable)
 */
export async function applyDeflickerToWorkflow(
    workflow: Record<string, unknown>,
    config: DeflickerConfig,
    comfyUIUrl?: string
): Promise<Record<string, unknown>> {
    if (!config.enabled) {
        return workflow;
    }

    // Check if deflicker node is available in ComfyUI
    let availableNodeType: string | null = null;
    if (comfyUIUrl) {
        availableNodeType = await getAvailableDeflickerNode(comfyUIUrl);
        if (!availableNodeType) {
            console.log('[DeflickerService] Deflicker enabled but no compatible node installed - skipping injection (graceful degradation).');
            console.log('[DeflickerService] To enable deflicker, install one of:', KNOWN_DEFLICKER_NODES.join(', '));
            return workflow;
        }
    } else {
        // No URL provided - fall back to old behavior with warning
        console.warn('[DeflickerService] No ComfyUI URL provided - cannot verify node availability.');
        console.warn('[DeflickerService] Proceeding with injection attempt - ComfyUI will error if node is missing.');
        availableNodeType = 'TemporalSmoothing'; // Default to first choice
    }

    const nodes = workflow.nodes as Record<string, Record<string, unknown>> | undefined;
    if (!nodes) {
        console.warn('[DeflickerService] Workflow has no nodes, skipping deflicker injection');
        return workflow;
    }

    // Find VAEDecode node (output images before video creation)
    let vaeDecodeNodeId: string | null = null;
    let createVideoNodeId: string | null = null;

    for (const [nodeId, node] of Object.entries(nodes)) {
        const classType = node.class_type as string | undefined;
        if (classType === 'VAEDecode') {
            vaeDecodeNodeId = nodeId;
        }
        if (classType === 'CreateVideo' || classType === 'VHS_VideoCombine') {
            createVideoNodeId = nodeId;
        }
    }

    if (!vaeDecodeNodeId || !createVideoNodeId) {
        console.warn('[DeflickerService] Could not find VAEDecode or CreateVideo nodes');
        return workflow;
    }

    // Create deflicker node using the detected available node type
    const deflickerNodes = createDeflickerNodeInjection(config, vaeDecodeNodeId, 0, availableNodeType);
    const deflickerNodeIds = Object.keys(deflickerNodes);
    
    if (deflickerNodeIds.length === 0) {
        return workflow;
    }

    // Get deflicker node ID
    const deflickerNodeId = deflickerNodeIds[0];
    if (!deflickerNodeId) {
        return workflow;
    }

    // Clone workflow to avoid mutation
    const modifiedWorkflow = JSON.parse(JSON.stringify(workflow));
    const modifiedNodes = modifiedWorkflow.nodes as Record<string, Record<string, unknown>>;

    // Add deflicker node
    const deflickerNodeData = deflickerNodes[deflickerNodeId];
    if (deflickerNodeData) {
        // Convert to plain object for workflow injection
        modifiedNodes[deflickerNodeId] = {
            class_type: deflickerNodeData.class_type,
            inputs: deflickerNodeData.inputs,
        };
    }

    // Update CreateVideo/VHS_VideoCombine to use deflicker output
    const videoNode = modifiedNodes[createVideoNodeId];
    if (videoNode && videoNode.inputs) {
        const inputs = videoNode.inputs as Record<string, unknown>;
        // Change images input to point to deflicker node
        if (inputs.images) {
            inputs.images = [deflickerNodeId, 0];
        }
    }

    console.log('[DeflickerService] Injected deflicker node:', {
        nodeId: deflickerNodeId,
        nodeType: availableNodeType,
        config: {
            strength: config.strength,
            windowSize: config.windowSize,
        },
    });

    return modifiedWorkflow;
}

/**
 * Estimate additional processing time for deflicker
 * @param frameCount - Number of frames in video
 * @param config - Deflicker configuration
 * @returns Estimated additional processing time in milliseconds
 */
export function estimateDeflickerTime(
    frameCount: number,
    config: DeflickerConfig
): number {
    if (!config.enabled) {
        return 0;
    }

    // Rough estimate: ~10ms per frame for temporal blending
    // Larger window sizes increase processing time
    const baseTimePerFrame = 10;
    const windowMultiplier = config.windowSize / 3; // 3 is baseline
    
    return Math.round(frameCount * baseTimePerFrame * windowMultiplier);
}

/**
 * Log deflicker status for diagnostics
 */
export function logDeflickerStatus(
    config: DeflickerConfig,
    context: string = 'unknown'
): void {
    if (config.enabled) {
        console.log(`[DeflickerService] ${context}: Deflicker ENABLED`, {
            strength: config.strength,
            windowSize: config.windowSize,
            method: config.method,
        });
    } else {
        console.log(`[DeflickerService] ${context}: Deflicker disabled`);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const deflickerService = {
    isDeflickerEnabled,
    getDeflickerConfig,
    isDeflickerSupported,
    createDeflickerNodeInjection,
    applyDeflickerToWorkflow,
    estimateDeflickerTime,
    logDeflickerStatus,
};

export default deflickerService;
