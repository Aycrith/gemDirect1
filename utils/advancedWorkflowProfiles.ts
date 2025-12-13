/**
 * Advanced Workflow Profile Templates
 * 
 * Pre-configured workflow profiles for specialized ComfyUI workflows:
 * - CCC (Character Consistency Control) - VAE-based character tracking
 * - Video Upscaler - Quality enhancement via upscaling
 * - Scene Builder - Multi-element scene composition
 * 
 * These templates define the required mappings and metadata for each workflow
 * type, enabling automatic configuration when the workflow JSON is imported.
 * 
 * @module utils/advancedWorkflowProfiles
 */

import { WorkflowProfile, WorkflowMapping, MappableData, WorkflowCategory } from '../types';

/**
 * Minimal interface for a workflow node during category detection.
 * This captures the subset of properties we inspect.
 */
interface WorkflowNode {
    type?: string;
    [key: string]: unknown;
}

/**
 * Template for CCC (Character Consistency Control) workflow profiles
 * 
 * The CCC workflow uses VAE embeddings to maintain character consistency
 * across multiple generations. It requires:
 * - Reference character images
 * - Text prompts for the scene
 * - Optional negative prompts
 */
export interface CCCWorkflowConfig {
    /** Profile ID (e.g., 'ccc-character') */
    profileId: string;
    /** Source workflow JSON path */
    sourcePath: string;
    /** Display name */
    displayName: string;
    /** Reference image node mappings */
    referenceImageNodeIds: string[];
    /** CLIP text encode node ID for positive prompt */
    positiveClipNodeId: string;
    /** CLIP text encode node ID for negative prompt */
    negativeClipNodeId?: string;
    /** Character name/label for tracking */
    characterLabel?: string;
}

/**
 * Template for Video Upscaler workflow profiles
 * 
 * The upscaler workflow takes generated videos and enhances them
 * at higher resolution. It requires:
 * - Input video/frames
 * - Upscale factor configuration
 * - Optional prompt guidance
 */
export interface UpscalerWorkflowConfig {
    /** Profile ID (e.g., 'video-upscaler') */
    profileId: string;
    /** Source workflow JSON path */
    sourcePath: string;
    /** Display name */
    displayName: string;
    /** Video load node ID */
    videoLoadNodeId: string;
    /** Upscale factor (e.g., 2x, 4x) */
    upscaleFactor: number;
    /** Optional CLIP node for guided upscaling */
    clipNodeId?: string;
}

/**
 * Default CCC profile template
 */
export const CCC_PROFILE_TEMPLATE: Partial<WorkflowProfile> = {
    category: 'character',
    displayName: 'CCC Character Consistency',
    description: 'VAE-based character tracking for consistent appearance across shots',
    status: 'incomplete',
    mapping: {},
    metadata: {
        requiredNodes: ['LoadImage', 'CLIPTextEncode', 'VAEEncode'],
        requiredMappings: ['reference_image', 'human_readable_prompt'] as MappableData[],
        missingMappings: ['reference_image', 'human_readable_prompt'] as MappableData[],
        warnings: [
            'CCC workflow requires reference character images to be mapped',
            'Character consistency depends on high-quality reference images',
        ],
        highlightMappings: [],
    },
};

/**
 * Default Upscaler profile template
 */
export const UPSCALER_PROFILE_TEMPLATE: Partial<WorkflowProfile> = {
    category: 'upscaler',
    displayName: 'Video Upscaler',
    description: 'Enhance video quality and resolution',
    status: 'incomplete',
    mapping: {},
    metadata: {
        requiredNodes: ['LoadVideo', 'GetVideoComponents', 'ImageUpscaleWithModel', 'SaveVideo'],
        requiredMappings: ['input_video'] as MappableData[],
        missingMappings: ['input_video'] as MappableData[],
        warnings: [
            'Upscaler requires input video to be mapped',
            'Processing time increases significantly with higher upscale factors',
        ],
        highlightMappings: [],
    },
};

/**
 * Create a CCC workflow profile from configuration
 */
export function createCCCProfile(
    config: CCCWorkflowConfig,
    workflowJson: string
): WorkflowProfile {
    const mapping: WorkflowMapping = {};
    
    // Map reference images
    config.referenceImageNodeIds.forEach((nodeId, _index) => {
        mapping[`${nodeId}:image`] = 'keyframe_image' as MappableData;
    });
    
    // Map positive prompt
    if (config.positiveClipNodeId) {
        mapping[`${config.positiveClipNodeId}:text`] = 'human_readable_prompt';
    }
    
    // Map negative prompt
    if (config.negativeClipNodeId) {
        mapping[`${config.negativeClipNodeId}:text`] = 'negative_prompt';
    }

    const hasReferenceMapping = config.referenceImageNodeIds.length > 0;
    const hasPromptMapping = !!config.positiveClipNodeId;
    
    return {
        ...CCC_PROFILE_TEMPLATE,
        workflowJson,
        mapping,
        sourcePath: config.sourcePath,
        displayName: config.displayName,
        status: hasReferenceMapping && hasPromptMapping ? 'ready' : 'incomplete',
        metadata: {
            ...CCC_PROFILE_TEMPLATE.metadata,
            missingMappings: [
                ...(!hasReferenceMapping ? ['keyframe_image'] : []),
                ...(!hasPromptMapping ? ['human_readable_prompt'] : []),
            ] as MappableData[],
            warnings: hasReferenceMapping && hasPromptMapping 
                ? [] 
                : CCC_PROFILE_TEMPLATE.metadata?.warnings || [],
            highlightMappings: [
                ...config.referenceImageNodeIds.map(nodeId => ({
                    type: 'keyframe_image' as MappableData,
                    nodeId,
                    inputName: 'image',
                    nodeTitle: `Reference Image ${nodeId}`,
                })),
                ...(config.positiveClipNodeId ? [{
                    type: 'human_readable_prompt' as MappableData,
                    nodeId: config.positiveClipNodeId,
                    inputName: 'text',
                    nodeTitle: 'Positive Prompt',
                }] : []),
            ],
        },
    } as WorkflowProfile;
}

/**
 * Create an Upscaler workflow profile from configuration
 */
export function createUpscalerProfile(
    config: UpscalerWorkflowConfig,
    workflowJson: string
): WorkflowProfile {
    const mapping: WorkflowMapping = {};
    
    // Map video input
    if (config.videoLoadNodeId) {
        mapping[`${config.videoLoadNodeId}:file`] = 'input_video' as MappableData;
    }
    
    // Map optional CLIP prompt
    if (config.clipNodeId) {
        mapping[`${config.clipNodeId}:text`] = 'human_readable_prompt';
    }

    const hasVideoMapping = !!config.videoLoadNodeId;
    
    return {
        ...UPSCALER_PROFILE_TEMPLATE,
        workflowJson,
        mapping,
        sourcePath: config.sourcePath,
        displayName: config.displayName,
        description: `${config.upscaleFactor}x video upscaling`,
        status: hasVideoMapping ? 'ready' : 'incomplete',
        metadata: {
            ...UPSCALER_PROFILE_TEMPLATE.metadata,
            missingMappings: hasVideoMapping ? [] : ['input_video'] as MappableData[],
            warnings: hasVideoMapping 
                ? [`Upscale factor: ${config.upscaleFactor}x`]
                : UPSCALER_PROFILE_TEMPLATE.metadata?.warnings || [],
            highlightMappings: [
                ...(config.videoLoadNodeId ? [{
                    type: 'input_video' as MappableData,
                    nodeId: config.videoLoadNodeId,
                    inputName: 'file',
                    nodeTitle: 'Input Video',
                }] : []),
            ],
        },
    } as WorkflowProfile;
}

/**
 * Detect workflow category from workflow JSON content
 */
export function detectWorkflowCategory(workflowJson: string): WorkflowCategory | null {
    try {
        const workflow = JSON.parse(workflowJson);
        const nodes: WorkflowNode[] = workflow.nodes || Object.values(workflow.prompt || workflow);
        
        // Check for CCC-specific nodes
        const hasCCCNodes = nodes.some((node: WorkflowNode) => 
            node.type?.includes('VAE') && 
            nodes.some((n: WorkflowNode) => n.type === 'LoadImage')
        );
        
        // Check for upscaler nodes
        const hasUpscalerNodes = nodes.some((node: WorkflowNode) =>
            node.type?.includes('Upscale') || 
            node.type?.includes('ESRGAN') ||
            node.type?.includes('RealESRGAN')
        );
        
        // Check for video input nodes
        const hasVideoInput = nodes.some((node: WorkflowNode) =>
            node.type?.includes('LoadVideo') ||
            node.type?.includes('VHS_Load')
        );
        
        // Check for scene builder patterns
        const hasSceneBuilder = nodes.some((node: WorkflowNode) =>
            node.type?.includes('Composite') ||
            node.type?.includes('Blend') ||
            node.type?.includes('Layer')
        );
        
        if (hasUpscalerNodes && hasVideoInput) return 'upscaler';
        if (hasCCCNodes) return 'character';
        if (hasSceneBuilder) return 'scene-builder';
        if (hasVideoInput) return 'video';
        
        return 'keyframe'; // Default
    } catch {
        return null;
    }
}

/**
 * Auto-configure workflow profile based on detected category
 */
export function autoConfigureWorkflowProfile(
    workflowJson: string,
    sourcePath: string,
    existingProfile?: Partial<WorkflowProfile>
): Partial<WorkflowProfile> {
    const category = detectWorkflowCategory(workflowJson);
    
    if (!category) {
        return existingProfile || {};
    }
    
    const baseConfig: Partial<WorkflowProfile> = {
        category,
        workflowJson,
        sourcePath,
        status: 'incomplete',
    };
    
    switch (category) {
        case 'character':
            return {
                ...CCC_PROFILE_TEMPLATE,
                ...baseConfig,
                ...existingProfile,
                displayName: existingProfile?.displayName || 'Character Consistency',
            };
        
        case 'upscaler':
            return {
                ...UPSCALER_PROFILE_TEMPLATE,
                ...baseConfig,
                ...existingProfile,
                displayName: existingProfile?.displayName || 'Video Upscaler',
            };
        
        case 'scene-builder':
            return {
                ...baseConfig,
                ...existingProfile,
                displayName: existingProfile?.displayName || 'Scene Builder',
                description: 'Multi-element scene composition workflow',
            };
        
        default:
            return {
                ...baseConfig,
                ...existingProfile,
            };
    }
}

/**
 * Known workflow file patterns for auto-detection
 */
export const KNOWN_WORKFLOW_PATTERNS = {
    ccc: [
        'CCC',
        'character_consistency',
        'character-consistency',
    ],
    upscaler: [
        'upscaler',
        'upscale',
        'ESRGAN',
        'RealESRGAN',
        'enhance',
    ],
    sceneBuilder: [
        'scene_builder',
        'scene-builder',
        'compositor',
    ],
};

/**
 * Match workflow filename to category
 */
export function matchWorkflowFilename(filename: string): WorkflowCategory | null {
    const lower = filename.toLowerCase();
    
    for (const pattern of KNOWN_WORKFLOW_PATTERNS.ccc) {
        if (lower.includes(pattern.toLowerCase())) return 'character';
    }
    
    for (const pattern of KNOWN_WORKFLOW_PATTERNS.upscaler) {
        if (lower.includes(pattern.toLowerCase())) return 'upscaler';
    }
    
    for (const pattern of KNOWN_WORKFLOW_PATTERNS.sceneBuilder) {
        if (lower.includes(pattern.toLowerCase())) return 'scene-builder';
    }
    
    // Check for video patterns
    if (lower.includes('video') || lower.includes('i2v') || lower.includes('animate')) {
        return 'video';
    }
    
    // Check for image/keyframe patterns
    if (lower.includes('t2i') || lower.includes('image') || lower.includes('keyframe')) {
        return 'keyframe';
    }
    
    return null;
}
