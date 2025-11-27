/**
 * IP-Adapter Service
 * 
 * Provides character consistency through IP-Adapter integration with ComfyUI.
 * Manages reference image processing, IP-Adapter node injection, and
 * weight configuration for maintaining character identity across generations.
 * 
 * IP-Adapter allows using reference images to guide image/video generation
 * while maintaining the subject's appearance characteristics.
 * 
 * @module services/ipAdapterService
 */

import type { 
    VisualBible, 
    VisualBibleCharacter, 
    Shot, 
    Scene 
} from '../types';
import { getFeatureFlag } from '../utils/featureFlags';

// ============================================================================
// TYPES
// ============================================================================

/**
 * IP-Adapter model variants available in ComfyUI
 */
export type IPAdapterModel = 
    | 'ip-adapter_sd15'
    | 'ip-adapter_sd15_light'
    | 'ip-adapter-plus_sd15'
    | 'ip-adapter-plus-face_sd15'
    | 'ip-adapter_sdxl'
    | 'ip-adapter-plus_sdxl'
    | 'ip-adapter-plus-face_sdxl';

/**
 * IP-Adapter weight application types
 */
export type IPAdapterWeightType = 
    | 'standard'      // Fixed weight throughout
    | 'linear_decay'  // Weight decreases over time (for starting reference)
    | 'linear_grow'   // Weight increases over time (for ending reference)
    | 'ease_in_out'   // Smooth S-curve weight transition
    | 'weak_input';   // Lower weight for subtle influence

/**
 * Configuration for a single IP-Adapter reference
 */
export interface IPAdapterReference {
    /** Unique identifier */
    id: string;
    
    /** Reference image (base64 or URL) */
    imageRef: string;
    
    /** Character ID from Visual Bible (optional) */
    characterId?: string;
    
    /** Character name for logging/display */
    characterName?: string;
    
    /** IP-Adapter weight (0.0 - 1.0) */
    weight: number;
    
    /** Weight application type */
    weightType: IPAdapterWeightType;
    
    /** Start frame for reference (0-indexed, for video) */
    startFrame?: number;
    
    /** End frame for reference (-1 = last frame, for video) */
    endFrame?: number;
    
    /** Which IP-Adapter model to use */
    model?: IPAdapterModel;
    
    /** Apply to face region only */
    faceOnly?: boolean;
}

/**
 * Result of preparing IP-Adapter payload for ComfyUI
 */
export interface IPAdapterPayload {
    /** Reference images uploaded to ComfyUI (filename -> characterId) */
    uploadedImages: Record<string, string>;
    
    /** Node modifications to inject into workflow */
    nodeInjections: Record<string, Record<string, unknown>>;
    
    /** Warning messages (non-blocking) */
    warnings: string[];
    
    /** Whether IP-Adapter is active for this generation */
    isActive: boolean;
    
    /** Total number of reference images being used */
    referenceCount: number;
}

/**
 * Options for configuring IP-Adapter behavior
 */
export interface IPAdapterOptions {
    /** Enable/disable IP-Adapter (overrides feature flag for testing) */
    enabled?: boolean;
    
    /** Global weight multiplier (0.0 - 1.0) */
    globalWeight?: number;
    
    /** Model to use if not specified per-reference */
    defaultModel?: IPAdapterModel;
    
    /** Apply face detection for face-specific models */
    useFaceDetection?: boolean;
    
    /** Combine multiple references into single embedding */
    combineReferences?: boolean;
    
    /** Noise injection level for variation (0.0 - 0.5) */
    noiseInjection?: number;
}

/**
 * Default IP-Adapter options
 */
export const DEFAULT_IPADAPTER_OPTIONS: Required<IPAdapterOptions> = {
    enabled: true,
    globalWeight: 0.8,
    defaultModel: 'ip-adapter-plus_sd15',
    useFaceDetection: false,
    combineReferences: true,
    noiseInjection: 0.0,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * ComfyUI node types for IP-Adapter Plus
 */
export const IPADAPTER_NODE_TYPES = {
    LOADER: 'IPAdapterModelLoader',
    UNIFIED_LOADER: 'IPAdapterUnifiedLoader',
    APPLY: 'IPAdapterApply',
    APPLY_FACE_ID: 'IPAdapterApplyFaceID',
    ADVANCED: 'IPAdapterAdvanced',
    ENCODER: 'IPAdapterEncoder',
    COMBINE_EMBEDS: 'IPAdapterCombineEmbeds',
    CLIP_VISION: 'CLIPVisionLoader',
    LOAD_IMAGE: 'LoadImage',
} as const;

/**
 * Recommended IP-Adapter weights for different use cases
 */
export const RECOMMENDED_WEIGHTS = {
    /** Strong character consistency */
    high: 0.85,
    /** Balanced consistency with variation */
    medium: 0.65,
    /** Light reference, more creative freedom */
    low: 0.35,
    /** Face-only reference */
    face: 0.75,
    /** Style reference (not character-specific) */
    style: 0.5,
} as const;

/**
 * IP-Adapter model requirements
 */
export const MODEL_REQUIREMENTS: Record<IPAdapterModel, {
    clipVision: string;
    baseModel: 'sd15' | 'sdxl';
    supportsFace: boolean;
}> = {
    'ip-adapter_sd15': {
        clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        baseModel: 'sd15',
        supportsFace: false,
    },
    'ip-adapter_sd15_light': {
        clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        baseModel: 'sd15',
        supportsFace: false,
    },
    'ip-adapter-plus_sd15': {
        clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        baseModel: 'sd15',
        supportsFace: false,
    },
    'ip-adapter-plus-face_sd15': {
        clipVision: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
        baseModel: 'sd15',
        supportsFace: true,
    },
    'ip-adapter_sdxl': {
        clipVision: 'CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors',
        baseModel: 'sdxl',
        supportsFace: false,
    },
    'ip-adapter-plus_sdxl': {
        clipVision: 'CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors',
        baseModel: 'sdxl',
        supportsFace: false,
    },
    'ip-adapter-plus-face_sdxl': {
        clipVision: 'CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors',
        baseModel: 'sdxl',
        supportsFace: true,
    },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if IP-Adapter feature is available
 */
export function isIPAdapterEnabled(options?: IPAdapterOptions): boolean {
    if (options?.enabled !== undefined) {
        return options.enabled;
    }
    // Check feature flag - use default if no user flags provided
    return getFeatureFlag(undefined, 'characterConsistency') === true;
}

/**
 * Get character references from Visual Bible for a scene
 */
export function getCharacterReferencesForScene(
    visualBible: VisualBible | null | undefined,
    scene: Scene,
    options: IPAdapterOptions = {}
): IPAdapterReference[] {
    if (!visualBible?.characters || visualBible.characters.length === 0) {
        return [];
    }
    
    // Get character IDs mentioned in this scene
    const sceneCharacterIds = visualBible.sceneCharacters?.[scene.id] || [];
    
    // Find characters with reference images
    const references: IPAdapterReference[] = [];
    
    for (const characterId of sceneCharacterIds) {
        const character = visualBible.characters.find(c => c.id === characterId);
        if (character && character.imageRefs && character.imageRefs.length > 0) {
            references.push(createReferenceFromCharacter(character, options));
        }
    }
    
    // Also include any characters that have image refs but aren't scene-mapped
    // (fallback for Visual Bible entries not yet linked)
    if (references.length === 0) {
        for (const character of visualBible.characters) {
            if (character.imageRefs && character.imageRefs.length > 0) {
                // Only add if character name appears in scene summary or title
                const sceneText = `${scene.summary || ''} ${scene.title || ''}`.toLowerCase();
                if (character.name && sceneText.includes(character.name.toLowerCase())) {
                    references.push(createReferenceFromCharacter(character, options));
                }
            }
        }
    }
    
    return references;
}

/**
 * Get character references from Visual Bible for a shot
 */
export function getCharacterReferencesForShot(
    visualBible: VisualBible | null | undefined,
    shot: Shot,
    sceneCharacterRefs: IPAdapterReference[] = [],
    options: IPAdapterOptions = {}
): IPAdapterReference[] {
    if (!visualBible) {
        return sceneCharacterRefs;
    }
    
    // Check for shot-specific character mappings
    const shotCharacterIds = visualBible.shotCharacters?.[shot.id] || [];
    
    if (shotCharacterIds.length > 0) {
        // Shot has explicit character mapping - use those
        const references: IPAdapterReference[] = [];
        
        for (const characterId of shotCharacterIds) {
            const character = visualBible.characters.find(c => c.id === characterId);
            if (character && character.imageRefs && character.imageRefs.length > 0) {
                references.push(createReferenceFromCharacter(character, options));
            }
        }
        
        return references;
    }
    
    // No shot-specific mapping - check if shot mentions specific characters from scene
    if (sceneCharacterRefs.length > 0 && shot.description) {
        const shotDesc = shot.description.toLowerCase();
        const mentionedRefs = sceneCharacterRefs.filter(ref => 
            ref.characterName && shotDesc.includes(ref.characterName.toLowerCase())
        );
        
        // If shot mentions specific characters, use only those
        if (mentionedRefs.length > 0) {
            return mentionedRefs;
        }
    }
    
    // Fallback to scene characters
    return sceneCharacterRefs;
}

/**
 * Create an IP-Adapter reference from a Visual Bible character
 */
export function createReferenceFromCharacter(
    character: VisualBibleCharacter,
    options: IPAdapterOptions = {}
): IPAdapterReference {
    // Use first image ref as primary reference
    const imageRef = character.imageRefs?.[0] || '';
    
    // Use character's configured weight or default
    const weight = character.ipAdapterWeight ?? options.globalWeight ?? RECOMMENDED_WEIGHTS.medium;
    
    // Determine weight type based on context
    let weightType: IPAdapterWeightType = 'standard';
    
    // Determine if we should use face-specific model
    const faceOnly = options.useFaceDetection || 
        character.visualTraits?.some(trait => 
            trait.toLowerCase().includes('face') || 
            trait.toLowerCase().includes('portrait')
        );
    
    return {
        id: `char-${character.id}`,
        imageRef,
        characterId: character.id,
        characterName: character.name,
        weight,
        weightType,
        faceOnly,
        model: faceOnly 
            ? 'ip-adapter-plus-face_sd15' 
            : (options.defaultModel || DEFAULT_IPADAPTER_OPTIONS.defaultModel),
    };
}

/**
 * Validate that required IP-Adapter models are available in ComfyUI
 */
export async function validateIPAdapterModels(
    _comfyUIUrl: string, // Reserved for future model validation
    references: IPAdapterReference[]
): Promise<{ valid: boolean; missing: string[]; warnings: string[] }> {
    const warnings: string[] = [];
    const missing: string[] = [];
    
    // Get unique model requirements
    const requiredModels = new Set<string>();
    const requiredClipVisions = new Set<string>();
    
    for (const ref of references) {
        const model = ref.model || DEFAULT_IPADAPTER_OPTIONS.defaultModel;
        const requirements = MODEL_REQUIREMENTS[model];
        
        requiredModels.add(model);
        requiredClipVisions.add(requirements.clipVision);
    }
    
    // TODO: Implement actual model validation by checking ComfyUI's object_info endpoint
    // For now, just return warnings about requirements
    
    if (requiredModels.size > 0) {
        warnings.push(
            `IP-Adapter requires: ${Array.from(requiredModels).join(', ')}. ` +
            `Ensure these models are installed in ComfyUI's models/ipadapter folder.`
        );
    }
    
    if (requiredClipVisions.size > 0) {
        warnings.push(
            `CLIP Vision models required: ${Array.from(requiredClipVisions).join(', ')}. ` +
            `Install in ComfyUI's models/clip_vision folder.`
        );
    }
    
    return {
        valid: true, // Assume valid until we implement actual checking
        missing,
        warnings,
    };
}

// ============================================================================
// WORKFLOW INJECTION
// ============================================================================

/**
 * Generate node ID for injected IP-Adapter nodes
 */
let nodeIdCounter = 1000;
function generateNodeId(): string {
    return String(nodeIdCounter++);
}

/**
 * Reset node ID counter (for testing)
 */
export function resetNodeIdCounter(): void {
    nodeIdCounter = 1000;
}

/**
 * Create IP-Adapter nodes to inject into a workflow
 * 
 * This function generates the ComfyUI node structure needed for IP-Adapter:
 * 1. CLIPVisionLoader - Load CLIP vision model for image encoding
 * 2. IPAdapterModelLoader - Load IP-Adapter model
 * 3. LoadImage - Load reference image
 * 4. IPAdapterApply - Apply IP-Adapter conditioning to model
 * 
 * @param references IP-Adapter references to apply
 * @param modelNodeId The KSampler's model input node ID to intercept
 * @param options Configuration options
 * @returns Node injections and connection updates
 */
export function createIPAdapterNodes(
    references: IPAdapterReference[],
    modelNodeId: string,
    options: IPAdapterOptions = {}
): {
    nodes: Record<string, Record<string, unknown>>;
    connections: Array<{ from: string; to: string; input: string }>;
} {
    const nodes: Record<string, Record<string, unknown>> = {};
    const connections: Array<{ from: string; to: string; input: string }> = [];
    
    if (references.length === 0) {
        return { nodes, connections };
    }
    
    // Get first reference safely (we know it exists after length check)
    const firstRef = references[0]!;
    
    // Determine model to use (use first reference's model as canonical)
    const primaryModel = firstRef.model || options.defaultModel || DEFAULT_IPADAPTER_OPTIONS.defaultModel;
    const modelReqs = MODEL_REQUIREMENTS[primaryModel];
    
    // Create CLIP Vision Loader node
    const clipVisionNodeId = generateNodeId();
    nodes[clipVisionNodeId] = {
        class_type: IPADAPTER_NODE_TYPES.CLIP_VISION,
        inputs: {
            clip_name: modelReqs.clipVision,
        },
        _meta: {
            title: 'CLIP Vision Loader (IP-Adapter)',
        },
    };
    
    // Create IP-Adapter Model Loader node
    const ipAdapterLoaderNodeId = generateNodeId();
    nodes[ipAdapterLoaderNodeId] = {
        class_type: IPADAPTER_NODE_TYPES.UNIFIED_LOADER,
        inputs: {
            preset: primaryModel,
            model: [modelNodeId, 0], // Connect to original model
        },
        _meta: {
            title: 'IP-Adapter Loader',
        },
    };
    
    // Track current model output for chaining
    let currentModelOutput = ipAdapterLoaderNodeId;
    
    // Create nodes for each reference
    for (const ref of references) {
        // Create LoadImage node for reference
        const loadImageNodeId = generateNodeId();
        nodes[loadImageNodeId] = {
            class_type: IPADAPTER_NODE_TYPES.LOAD_IMAGE,
            inputs: {
                // Will be replaced with uploaded filename at runtime
                image: `__IPADAPTER_REF_${ref.id}__`,
            },
            _meta: {
                title: `IP-Adapter Reference: ${ref.characterName || ref.id}`,
            },
        };
        
        // Create IP-Adapter Apply node
        const applyNodeId = generateNodeId();
        const applyNodeType = ref.faceOnly 
            ? IPADAPTER_NODE_TYPES.APPLY_FACE_ID 
            : IPADAPTER_NODE_TYPES.APPLY;
        
        nodes[applyNodeId] = {
            class_type: applyNodeType,
            inputs: {
                weight: ref.weight * (options.globalWeight ?? 1.0),
                weight_type: ref.weightType === 'standard' ? 'standard' : ref.weightType,
                combine_embeds: options.combineReferences ? 'concat' : 'add',
                start_at: 0.0,
                end_at: 1.0,
                noise: options.noiseInjection ?? 0.0,
                model: [currentModelOutput, 0],
                ipadapter: [ipAdapterLoaderNodeId, 1],
                image: [loadImageNodeId, 0],
                clip_vision: [clipVisionNodeId, 0],
            },
            _meta: {
                title: `Apply IP-Adapter: ${ref.characterName || ref.id}`,
            },
        };
        
        // Chain model output
        currentModelOutput = applyNodeId;
    }
    
    // Connection: Final IP-Adapter output replaces original model connection
    connections.push({
        from: currentModelOutput,
        to: 'KSampler', // Will be resolved to actual node ID
        input: 'model',
    });
    
    return { nodes, connections };
}

/**
 * Inject IP-Adapter nodes into an existing workflow
 * 
 * @param workflow Original ComfyUI workflow JSON
 * @param references IP-Adapter references to apply
 * @param options Configuration options
 * @returns Modified workflow with IP-Adapter nodes
 */
export function injectIPAdapterIntoWorkflow(
    workflow: Record<string, Record<string, unknown>>,
    references: IPAdapterReference[],
    options: IPAdapterOptions = {}
): {
    workflow: Record<string, Record<string, unknown>>;
    referenceMapping: Record<string, string>; // ref.id -> placeholder key in workflow
    warnings: string[];
} {
    const warnings: string[] = [];
    
    if (!isIPAdapterEnabled(options)) {
        return { workflow, referenceMapping: {}, warnings: ['IP-Adapter is disabled'] };
    }
    
    if (references.length === 0) {
        return { workflow, referenceMapping: {}, warnings: ['No character references provided'] };
    }
    
    // Find the model loader node (UNETLoader or CheckpointLoader)
    let modelLoaderNodeId: string | null = null;
    
    for (const [nodeId, node] of Object.entries(workflow)) {
        const classType = node.class_type as string | undefined;
        if (classType === 'UNETLoader' || classType === 'CheckpointLoaderSimple') {
            modelLoaderNodeId = nodeId;
            break;
        }
    }
    
    if (!modelLoaderNodeId) {
        warnings.push('Could not find model loader node in workflow');
        return { workflow, referenceMapping: {}, warnings };
    }
    
    // Find KSampler to update its model input
    let kSamplerNodeId: string | null = null;
    for (const [nodeId, node] of Object.entries(workflow)) {
        if (node.class_type === 'KSampler') {
            kSamplerNodeId = nodeId;
            break;
        }
    }
    
    if (!kSamplerNodeId) {
        warnings.push('Could not find KSampler node in workflow');
        return { workflow, referenceMapping: {}, warnings };
    }
    
    // Create IP-Adapter nodes
    const { nodes: ipAdapterNodes, connections } = createIPAdapterNodes(
        references,
        modelLoaderNodeId,
        options
    );
    
    // Clone workflow and inject nodes
    const modifiedWorkflow = { ...workflow };
    
    // Add IP-Adapter nodes
    for (const [nodeId, node] of Object.entries(ipAdapterNodes)) {
        modifiedWorkflow[nodeId] = node;
    }
    
    // Update KSampler model input to use IP-Adapter output
    if (connections.length > 0 && kSamplerNodeId) {
        const lastConnection = connections[connections.length - 1];
        const kSampler = modifiedWorkflow[kSamplerNodeId];
        if (lastConnection && kSampler && kSampler.inputs) {
            (kSampler.inputs as Record<string, unknown>).model = [lastConnection.from, 0];
        }
    }
    
    // Build reference mapping for image upload
    const referenceMapping: Record<string, string> = {};
    for (const ref of references) {
        referenceMapping[ref.id] = `__IPADAPTER_REF_${ref.id}__`;
    }
    
    return { workflow: modifiedWorkflow, referenceMapping, warnings };
}

// ============================================================================
// PAYLOAD PREPARATION
// ============================================================================

/**
 * Prepare IP-Adapter payload for ComfyUI generation
 * 
 * This is the main entry point for integrating IP-Adapter into the generation pipeline.
 * It handles:
 * 1. Extracting character references from Visual Bible
 * 2. Validating model availability
 * 3. Injecting nodes into workflow
 * 4. Preparing image upload mapping
 * 
 * @param visualBible Visual Bible with character data
 * @param scene Current scene being generated
 * @param shot Current shot (optional, for shot-specific references)
 * @param workflowJson Original workflow JSON string
 * @param options Configuration options
 * @returns IP-Adapter payload ready for integration
 */
export async function prepareIPAdapterPayload(
    visualBible: VisualBible | null | undefined,
    scene: Scene,
    shot: Shot | null,
    workflowJson: string,
    options: IPAdapterOptions = {}
): Promise<IPAdapterPayload> {
    const payload: IPAdapterPayload = {
        uploadedImages: {},
        nodeInjections: {},
        warnings: [],
        isActive: false,
        referenceCount: 0,
    };
    
    // Check if feature is enabled
    if (!isIPAdapterEnabled(options)) {
        payload.warnings.push('Character consistency feature is disabled');
        return payload;
    }
    
    // Get character references for this scene
    const sceneRefs = getCharacterReferencesForScene(visualBible, scene, options);
    
    // Get shot-specific references if shot is provided
    const references = shot 
        ? getCharacterReferencesForShot(visualBible, shot, sceneRefs, options)
        : sceneRefs;
    
    if (references.length === 0) {
        payload.warnings.push('No character references found in Visual Bible for this scene');
        return payload;
    }
    
    payload.referenceCount = references.length;
    
    // Parse workflow
    let workflow: Record<string, Record<string, unknown>>;
    try {
        workflow = JSON.parse(workflowJson);
    } catch (error) {
        payload.warnings.push(`Failed to parse workflow JSON: ${error}`);
        return payload;
    }
    
    // Inject IP-Adapter nodes
    const { workflow: modifiedWorkflow, referenceMapping, warnings } = injectIPAdapterIntoWorkflow(
        workflow,
        references,
        options
    );
    
    payload.warnings.push(...warnings);
    
    if (Object.keys(referenceMapping).length === 0) {
        return payload;
    }
    
    // Store modified workflow as node injections
    payload.nodeInjections = modifiedWorkflow;
    
    // Build image upload mapping
    for (const ref of references) {
        if (ref.imageRef) {
            // Map character ID to image ref for upload
            payload.uploadedImages[ref.id] = ref.imageRef;
        }
    }
    
    payload.isActive = true;
    
    return payload;
}

/**
 * Apply IP-Adapter image filenames to workflow after upload
 * 
 * After images are uploaded to ComfyUI, this function replaces the placeholders
 * in the workflow with the actual uploaded filenames.
 * 
 * @param workflow Workflow with IP-Adapter nodes
 * @param uploadedFilenames Mapping of ref.id -> uploaded filename
 * @returns Updated workflow
 */
export function applyUploadedImagesToWorkflow(
    workflow: Record<string, Record<string, unknown>>,
    uploadedFilenames: Record<string, string>
): Record<string, Record<string, unknown>> {
    const result = JSON.parse(JSON.stringify(workflow)) as Record<string, Record<string, unknown>>; // Deep clone
    
    for (const [, nodeValue] of Object.entries(result)) {
        const node = nodeValue as { class_type?: string; inputs?: Record<string, unknown> };
        if (node.class_type === IPADAPTER_NODE_TYPES.LOAD_IMAGE && node.inputs) {
            const inputs = node.inputs;
            const imagePlaceholder = inputs.image as string;
            
            // Check if this is a placeholder we need to replace
            if (imagePlaceholder && imagePlaceholder.startsWith('__IPADAPTER_REF_')) {
                const refId = imagePlaceholder.replace('__IPADAPTER_REF_', '').replace('__', '');
                const uploadedFilename = uploadedFilenames[refId];
                
                if (uploadedFilename) {
                    inputs.image = uploadedFilename;
                }
            }
        }
    }
    
    return result;
}
