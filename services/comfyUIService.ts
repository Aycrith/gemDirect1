import { LocalGenerationSettings, LocalGenerationStatus, TimelineData, Shot, Scene, CreativeEnhancers, WorkflowMapping, MappableData, LocalGenerationAsset, WorkflowProfile, WorkflowProfileMappingHighlight, StoryBible, VisualBible } from '../types';
import { base64ToBlob } from '../utils/videoUtils';
import { getVisualBible } from './visualBibleContext';
import { generateCorrelationId, logCorrelation, networkTap } from '../utils/correlation';
import { validatePromptGuardrails } from './promptValidator';
import { SceneTransitionContext, ShotTransitionContext, formatTransitionContextForPrompt, formatShotTransitionContextForPrompt, buildShotTransitionContext } from './sceneTransitionService';
import { isFeatureEnabled, FeatureFlags } from '../utils/featureFlags';
import { ApiLogCallback } from './geminiService';
// LM Studio model manager - ensures VRAM is freed before ComfyUI generation
import { ensureModelsUnloaded } from './lmStudioModelManager';
import {
    ValidationResult,
    validationSuccess,
    validationFailure,
    createValidationError,
    createValidationWarning,
    ValidationErrorCodes,
    ValidationErrorCode,
} from '../types/validation';
import { estimateTokens, truncateToTokenLimit, DEFAULT_TOKEN_BUDGETS } from './promptRegistry';
import { getPromptConfigForModel, applyPromptTemplate, getDefaultNegativePromptForModel, type PromptTarget } from './promptTemplates';
import { getVisualContextForShot, getCharacterContextForShot, getVisualContextForScene, getCharacterContextForScene } from './visualBiblePromptHelpers';
// Phase 7: Narrative Coherence - track story elements across generations
import {
    NarrativeState,
    createInitialNarrativeState,
    updateNarrativeStateForScene,
    updateNarrativeStateForShot,
    generateNarrativeStateSummary,
    formatNarrativeStateForPrompt,
} from './narrativeCoherenceService';
// Phase 7: IP-Adapter for character consistency
import { 
    prepareIPAdapterPayload, 
    applyUploadedImagesToWorkflow,
    type IPAdapterPayload,
} from './ipAdapterService';
// Phase 7: Video upscaling post-processing (imported when needed)
// Generation Queue for serial VRAM-safe execution
import { getGenerationQueue, createVideoTask, GenerationStatus } from './generationQueue';
// Error types for queue error extraction
import { CSGError } from '../types/errors';
// Endpoint snapping post-processor for bookend video quality
import { snapEndpointsToKeyframes, isEndpointSnappingSupported, type EndpointSnappingOptions } from '../utils/videoEndpointSnapper';

// Interface for ComfyUI workflow nodes
interface WorkflowNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
  label?: string;
}

export const DEFAULT_NEGATIVE_PROMPT = 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur';

// A list of common URLs to try for auto-discovery.
const DISCOVERY_CANDIDATES = [
    'http://127.0.0.1:8000',  // ComfyUI Desktop default
    'http://localhost:8000',
    'http://127.0.0.1:8188',  // ComfyUI standalone default
    'http://localhost:8188',
];

const shouldInjectCharacterContinuity = (
    shot: Shot,
    visualBible?: VisualBible | null,
    sceneId?: string
): boolean => {
    if (shot.heroMoment) return true;

    const ctx = getCharacterContextForShot(visualBible, sceneId, shot.id);
    if (!ctx.characterNames.length) return false;

    const descLower = (shot.description || '').toLowerCase();
    const purposeLower = (shot.purpose || '').toLowerCase();
    return ctx.characterNames.some(name => {
        const n = name.toLowerCase();
        return descLower.includes(n) || purposeLower.includes(n);
    });
};

const logPromptDebug = (tag: string, data: Record<string, unknown>) => {
    try {
        logCorrelation(
            { correlationId: generateCorrelationId(), timestamp: Date.now(), source: 'comfyui' },
            tag,
            data
        );
    } catch {
        // Best-effort debug logging; do not break pipeline
    }
};

export interface WorkflowGenerationMetadata {
    highlightMappings: WorkflowProfileMappingHighlight[];
    mappingEntries: Array<{ key: string; dataType: string }>;
    missingMappings: MappableData[];
    warnings: string[];
    referencesCanonical: boolean;
    hasTextMapping: boolean;
    hasKeyframeMapping: boolean;
    mapping: WorkflowMapping;
    promptVariantId?: string;
    promptVariantLabel?: string;
}

/**
 * Result from queueComfyUIPrompt containing all generation context
 */
export interface ComfyUIPromptResult {
    /** Prompt ID returned by ComfyUI server */
    prompt_id: string;
    /** Any additional properties from ComfyUI response */
    [key: string]: unknown;
    /** System resources message from pre-flight check */
    systemResources?: string;
    /** The workflow profile ID used for generation */
    workflowProfileId: string;
    /** Path to workflow file */
    workflowPath: string;
    /** Client ID used for WebSocket tracking */
    clientId: string;
    /** Queue snapshot at time of submission */
    queueSnapshot?: { queue_running: number; queue_pending: number };
    /** Workflow metadata including mappings and warnings */
    workflowMeta: WorkflowGenerationMetadata;
}

// ============================================================================
// CENTRALIZED TIMEOUT CONFIGURATION
// ============================================================================
// All timeout values in one place for easy adjustment and testing.
// Test environments can override these via the TEST_TIMEOUT_OVERRIDE object.
// ============================================================================

export const COMFYUI_TIMEOUTS = {
    /** Timeout for HTTP fetch requests (ms) */
    FETCH: 12000,
    /** Grace period after queue empties before checking history fallback (ms) */
    QUEUE_GRACE_PERIOD: 60_000,
    /** Interval between queue status polls (ms) */
    QUEUE_POLL_INTERVAL: 2_000,
    /** WebSocket connection timeout (ms) */
    WEBSOCKET_CONNECT: 10_000,
    /** Generation timeout for waitForComfyCompletion (ms) */
    GENERATION: 10 * 60 * 1000, // 10 minutes
    /** Extended timeout for video generation (ms) */
    VIDEO_GENERATION: 15 * 60 * 1000, // 15 minutes
    /** Keyframe generation timeout (ms) */
    KEYFRAME_GENERATION: 5 * 60 * 1000, // 5 minutes
    /** History API polling timeout (ms) */
    HISTORY_POLL: 5000,
    /** Server discovery timeout (ms) */
    DISCOVERY: 2000,
} as const;

/**
 * Test timeout overrides - set by test harness to speed up tests.
 * Example: In tests, set TEST_TIMEOUT_OVERRIDE.GENERATION = 1000 for 1s timeout.
 */
export const TEST_TIMEOUT_OVERRIDE: Partial<typeof COMFYUI_TIMEOUTS> = {};

/**
 * Get a timeout value, respecting test overrides
 */
export const getTimeout = (key: keyof typeof COMFYUI_TIMEOUTS): number => {
    return TEST_TIMEOUT_OVERRIDE[key] ?? COMFYUI_TIMEOUTS[key];
};

const DEFAULT_FETCH_TIMEOUT_MS = COMFYUI_TIMEOUTS.FETCH;

// ============================================================================
// GRACE PERIOD CONFIGURATION - Video Pipeline Race Condition Fix
// ============================================================================
// When ComfyUI queue empties, we wait this long for WebSocket to deliver assets.
// This accommodates variable generation times across different GPUs/systems.
// Adjust these values based on your hardware:
//   - RTX 3090: 30-60s typical, 60s grace is safe
//   - RTX 4090: 20-40s typical, 60s grace is safe  
//   - Slower GPUs: May need 120s+ grace period
const GRACE_PERIOD_MS = COMFYUI_TIMEOUTS.QUEUE_GRACE_PERIOD;
const POLL_INTERVAL_MS = COMFYUI_TIMEOUTS.QUEUE_POLL_INTERVAL;
const FALLBACK_FETCH_ENABLED = true;   // If grace period expires, try fetching from history API
const DEBUG_VIDEO_PIPELINE = false;    // Set to true for verbose pipeline debugging

/**
 * Parse ComfyUI/GPU errors into user-friendly messages
 */
export function parseComfyUIError(rawError: string): string {
    const lowerError = rawError.toLowerCase();
    
    // CUDA Out of Memory errors
    if (lowerError.includes('cuda') && (lowerError.includes('out of memory') || lowerError.includes('oom'))) {
        return 'GPU ran out of memory. Try: (1) Close other GPU apps, (2) Reduce image/video size, (3) Restart ComfyUI.';
    }
    
    // General OOM / Torch memory errors
    if (lowerError.includes('out of memory') || lowerError.includes('oom') || lowerError.includes('torch.cuda.outofmemory')) {
        return 'Out of memory. Close other applications and try again with smaller settings.';
    }
    
    // CUDA device errors
    if (lowerError.includes('cuda error') || lowerError.includes('cudnn')) {
        return 'GPU error occurred. Try restarting ComfyUI and your GPU drivers.';
    }
    
    // Model loading errors
    if (lowerError.includes('failed to load') || lowerError.includes('model not found') || lowerError.includes('safetensors')) {
        return 'Model failed to load. Check that required models are installed in ComfyUI.';
    }
    
    // Workflow errors
    if (lowerError.includes('required input') || lowerError.includes('missing node')) {
        return 'Workflow error: missing required input. Check workflow configuration.';
    }
    
    // NaN/tensor errors (often from bad inputs)
    if (lowerError.includes('nan') || lowerError.includes('tensor')) {
        return 'Invalid input caused generation to fail. Try with different settings.';
    }
    
    // Return trimmed version of original for other errors
    return rawError.length > 200 ? rawError.slice(0, 200) + '...' : rawError;
}

/**
 * Normalize ComfyUI URLs for DEV mode proxy routing.
 * In development, routes all ComfyUI requests through Vite proxy to avoid CORS issues.
 * In production, uses direct URLs.
 * 
 * @param url - The ComfyUI URL from settings (e.g., http://127.0.0.1:8188)
 * @returns Proxy path in DEV mode (/api/comfyui) or original URL in production
 */
const getComfyUIBaseUrl = (url: string): string => {
    // In development, use Vite proxy to avoid CORS issues with localhost/127.0.0.1
    // Check if running in browser/Vite environment
    if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV) {
        return '/api/comfyui';
    }
    // In production, use direct URL without trailing slash to avoid double slashes in constructed paths
    const finalUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    console.log(`[getComfyUIBaseUrl] Input: ${url}, Output: ${finalUrl}`);
    return finalUrl;
};

const fetchWithTimeout = async (
    resource: RequestInfo,
    init: RequestInit = {},
    timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const options = {
            signal: controller.signal,
            mode: 'cors',
            credentials: 'omit',
            ...init,
        };
        console.log(`[fetchWithTimeout] Fetching ${resource} with options:`, JSON.stringify(options, (key, value) => key === 'signal' ? '[Signal]' : value));
        return await fetch(resource, options as RequestInit);
    } finally {
        clearTimeout(timeoutId);
    }
};

/**
 * Attempts to find a running ComfyUI server by checking a list of common addresses.
 * @returns The URL of the found server, or null if no server is found.
 */
export const discoverComfyUIServer = async (): Promise<string | null> => {
  for (const baseUrl of DISCOVERY_CANDIDATES) {
    try {
      const url = baseUrl.endsWith('/') ? `${baseUrl}system_stats` : `${baseUrl}/system_stats`;
      const response = await fetchWithTimeout(url, undefined, 2000);

      if (response.ok) {
        const data = await response.json();
        if (data && data.system && data.devices) {
             return baseUrl;
        }
      }
    } catch (error) {
      console.log(`Discovery attempt failed for ${baseUrl}:`, error);
    }
  }
  return null; // No servers found from the candidate list.
};


// --- Intelligent Pre-flight Check Functions ---

/**
 * Checks if the ComfyUI server is running and accessible.
 * @param url The server URL to check.
 * @returns A promise that resolves if the connection is successful, and rejects with an error message otherwise.
 */
export const checkServerConnection = async (url: string): Promise<void> => {
    if (!url) {
        throw new Error("Server address is not configured.");
    }
    try {
        const baseUrl = getComfyUIBaseUrl(url);
        const response = await fetchWithTimeout(`${baseUrl}/system_stats`, undefined, 3000);
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}.`);
        }
        const data = await response.json();
        if (!data || !data.system || !data.devices) {
            throw new Error("Connected, but the response doesn't look like a valid ComfyUI server.");
        }
    } catch (error) {
        console.error('Connection check error:', error);
        if (error instanceof Error && error.name === 'AbortError') {
             throw new Error("Connection timed out. The server might be slow or unresponsive.");
        }
        throw new Error(`Failed to connect to server at '${url}'. Please ensure it is running and accessible.`);
    }
};

/**
 * Checks the ComfyUI server's system resources, like GPU VRAM.
 * @param url The server URL to check.
 * @returns A promise that resolves to a status message string.
 */
export const checkSystemResources = async (url: string): Promise<string> => {
    if (!url) {
        return "Server address is not configured.";
    }
    try {
        const baseUrl = getComfyUIBaseUrl(url);
        const response = await fetchWithTimeout(`${baseUrl}/system_stats`, undefined, 3000);
        if (!response.ok) {
            return `Could not retrieve system stats (status: ${response.status}).`;
        }
        const stats = await response.json();
        const gpuDevice = stats.devices?.find((d: any) => ['cuda', 'dml', 'mps', 'xpu', 'rocm'].includes(d.type.toLowerCase()));

        if (gpuDevice) {
            const vramTotalGB = gpuDevice.vram_total / (1024 ** 3);
            const vramFreeGB = gpuDevice.vram_free / (1024 ** 3);
            const VRAM_WARNING_THRESHOLD_GB = 2.0;

            let message = `GPU: ${gpuDevice.name} | Total VRAM: ${vramTotalGB.toFixed(1)} GB | Free VRAM: ${vramFreeGB.toFixed(1)} GB.`;
            if (vramFreeGB < VRAM_WARNING_THRESHOLD_GB) {
                message += `\nWarning: Low VRAM detected. Generations requiring >${VRAM_WARNING_THRESHOLD_GB.toFixed(1)}GB may fail.`;
            }
            return message;
        } else {
            return "Info: No dedicated GPU detected. Generation will run on CPU and may be very slow.";
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
             return "Failed to check system resources: Connection timed out.";
        }
        return "Failed to check system resources. Is the server running?";
    }
};

/**
 * Fetches the current queue status from the ComfyUI server.
 * @param url The server URL to check.
 * @returns A promise that resolves to an object containing running and pending queue counts.
 */
const DEFAULT_WORKFLOW_PROFILE_ID = 'wan-i2v';

// Known workflow file names for canonical detection
// These are used only for friendly logging/metadata, not as hard-coded paths.
const KNOWN_WAN_WORKFLOWS = [
  'image_netayume_lumina_t2i.json',
  'video_wan2_2_5B_ti2v.json',
];

// Constants for workflow mapping types
const TEXT_MAPPING_TYPES = ['human_readable_prompt', 'full_timeline_json'];
const KEYFRAME_MAPPING_TYPE = 'keyframe_image';
const HIGHLIGHT_TYPES = ['human_readable_prompt', 'full_timeline_json', 'keyframe_image'];

// Helper functions for workflow mapping analysis
const getPromptPayload = (workflowJson?: string): Record<string, any> | null => {
  if (!workflowJson) {
    return null;
  }
  try {
    const parsed = JSON.parse(workflowJson);
    return parsed.prompt ?? parsed;
  } catch {
    return null;
  }
};

const hasTextMapping = (mapping: WorkflowMapping): boolean =>
  Object.values(mapping).some(value => TEXT_MAPPING_TYPES.includes(value));

const hasKeyframeMapping = (mapping: WorkflowMapping): boolean =>
  Object.values(mapping).includes(KEYFRAME_MAPPING_TYPE);

const computeHighlightMappings = (workflowJson: string | undefined, mapping: WorkflowMapping): WorkflowProfileMappingHighlight[] => {
  const prompt = getPromptPayload(workflowJson);
  return HIGHLIGHT_TYPES.flatMap(type => {
    const entry = Object.entries(mapping).find(([, dataType]) => dataType === type);
    if (!entry) {
      return [];
    }
    const [key] = entry;
    const parts = key.split(':');
    const nodeId = parts[0] ?? '';
    const inputName = parts[1] ?? '';
    if (!nodeId) return [];
    const node = prompt?.[nodeId];
    const nodeTitle = node?._meta?.title || node?.label || `Node ${nodeId}`;
    return [{ type: type as MappableData, nodeId, inputName, nodeTitle }];
  });
};

export const getQueueInfo = async (url: string): Promise<{ queue_running: number, queue_pending: number }> => {
    if (!url) {
        throw new Error("Server address is not configured.");
    }
    const baseUrl = getComfyUIBaseUrl(url);
    const response = await fetchWithTimeout(`${baseUrl}/queue`, undefined, 3000);
    if (!response.ok) {
        throw new Error(`Could not retrieve queue info (status: ${response.status}).`);
    }
    const data = await response.json();
    return {
        queue_running: data.queue_running.length,
        queue_pending: data.queue_pending.length,
    };
};

const resolveWorkflowProfile = (
    settings: LocalGenerationSettings,
    _modelId?: string,
    override?: WorkflowProfile,
    profileId?: string
): WorkflowProfile => {
    if (override) {
        return override;
    }
    const resolvedProfileId = profileId || DEFAULT_WORKFLOW_PROFILE_ID;
    const profileFromSettings = profileId ? settings.workflowProfiles?.[profileId] : undefined;
    const primaryProfile = settings.workflowProfiles?.[DEFAULT_WORKFLOW_PROFILE_ID];
    const workflowJson =
        profileFromSettings?.workflowJson ??
        primaryProfile?.workflowJson ??
        settings.workflowJson;
    const mapping =
        profileFromSettings?.mapping ??
        primaryProfile?.mapping ??
        settings.mapping ??
        {};

    if (!workflowJson) {
        throw new Error("No workflow has been synced from the server.");
    }

    return {
        id: profileFromSettings?.id ?? primaryProfile?.id ?? resolvedProfileId,
        label: profileFromSettings?.label ?? primaryProfile?.label ?? 'Resolved Workflow Profile',
        workflowJson,
        mapping,
    };
};

function resolveModelIdFromSettings(settings: LocalGenerationSettings): string {
  return settings.modelId || 'comfy-svd';
}

const friendlyMappingLabel = (type: string): string => {
  switch (type) {
    case 'human_readable_prompt':
      return 'Human-Readable Prompt (CLIP)';
    case 'full_timeline_json':
      return 'Full Timeline JSON (CLIP)';
    case 'keyframe_image':
      return 'Keyframe Image (LoadImage)';
    default:
      return type;
  }
};

/**
 * Validates the active workflow JSON and mapping for a given profile.
 *
 * The rules are profile-specific:
 * - wan-t2i (text → image keyframes):
 *   - Requires at least one CLIPTextEncode.text node.
 *   - Requires a text mapping (human_readable_prompt or full_timeline_json).
 *   - Does NOT require a keyframe_image mapping because this profile produces
 *     keyframes instead of consuming them.
 * - wan-i2v (text+image → video):
 *   - Requires CLIPTextEncode.text AND LoadImage.image nodes.
 *   - Requires both a text mapping and a keyframe_image → LoadImage.image mapping.
 *
 * @param settings Local generation settings. If root workflowJson is empty,
 *                 the function will resolve the workflow from workflowProfiles[profileId].
 * @param profileId Active workflow profile id ('wan-t2i' or 'wan-i2v').
 */
export const validateWorkflowAndMappings = (
    settings: LocalGenerationSettings,
    profileId: string = 'wan-i2v',
): void => {
    // Resolve workflow from profiles if root workflowJson is empty
    let workflowJson = settings.workflowJson;
    let mapping = settings.mapping ?? {};
    
    if (!workflowJson && settings.workflowProfiles?.[profileId]) {
        const profile = settings.workflowProfiles[profileId];
        workflowJson = profile.workflowJson;
        mapping = profile.mapping ?? {};
    }
    
    if (!workflowJson) {
        throw new Error("No workflow has been synced from the server.");
    }

    let workflowApi: Record<string, any>;
    try {
        workflowApi = JSON.parse(workflowJson);
    } catch {
        throw new Error("The synced workflow is not valid JSON. Please re-sync.");
    }

    const promptPayloadTemplate = workflowApi.prompt || workflowApi;
    if (typeof promptPayloadTemplate !== 'object' || promptPayloadTemplate === null) {
        throw new Error("Synced workflow has an invalid structure. Please re-sync.");
    }

    const workflowNodes = Object.values(promptPayloadTemplate ?? {}) as Array<Record<string, any>>;
    const mappingErrors: string[] = [];
    const mappedDataTypes = new Set(Object.values(mapping));

    // Check for required node types in the workflow.
    const hasClipTextEncode = workflowNodes.some(
        (node) => node?.class_type === 'CLIPTextEncode' && node.inputs?.text !== undefined,
    );
    const hasLoadImage = workflowNodes.some(
        (node) => node?.class_type === 'LoadImage' && node.inputs?.image !== undefined,
    );

    // Blocking errors for core workflow requirements.
    // For wan-t2i (text-to-image keyframes) we only require CLIP text conditioning.
    // For wan-i2v (image-to-video) we require both CLIP and LoadImage so keyframe
    // images can be injected into the graph.
    if (!hasClipTextEncode) {
        mappingErrors.push(
            "Workflow requires at least one CLIPTextEncode node with a 'text' input for text conditioning. This workflow appears to be image-only and cannot process text prompts.",
        );
    }
    if (profileId === 'wan-i2v' && !hasLoadImage) {
        mappingErrors.push(
            "Workflow requires at least one LoadImage node with an 'image' input for keyframe conditioning.",
        );
    }

    // Stricter checks for essential mappings.
    // Both profiles must have a text prompt mapping, but only wan-i2v requires
    // a keyframe_image mapping (wan-t2i produces keyframes instead of consuming them).
    if (!mappedDataTypes.has('human_readable_prompt') && !mappedDataTypes.has('full_timeline_json')) {
        mappingErrors.push(
            "Workflow is missing a mapping for the main text prompt. Please map either 'Human-Readable Prompt' or 'Full Timeline JSON' to a CLIPTextEncode node's 'text' input.",
        );
    }
    if (profileId === 'wan-i2v' && !mappedDataTypes.has('keyframe_image')) {
        mappingErrors.push(
            "Workflow is missing a mapping for the keyframe image. Please map 'Keyframe Image' to a LoadImage node's 'image' input.",
        );
    }
    
    // Check individual mappings for consistency and type compatibility
    for (const [key, dataType] of Object.entries(mapping)) {
        if (dataType === 'none') continue;

        const parts = key.split(':');
        const nodeId = parts[0];
        const inputName = parts[1];
        if (!nodeId || !inputName) continue;
        const node = promptPayloadTemplate[nodeId];
        const nodeTitle = node?._meta?.title || `Node ${nodeId}`;

        if (!node) {
            mappingErrors.push(`Mapped node '${nodeTitle}' no longer exists in your workflow. Please re-sync and update mappings.`);
            continue;
        }
        if (!node.inputs || typeof node.inputs[inputName] === 'undefined') {
            mappingErrors.push(`Mapped input '${inputName}' not found on node '${nodeTitle}'. The workflow may have changed.`);
            continue;
        }

        // Add type-specific validation
        if (dataType === 'keyframe_image' && node.class_type !== 'LoadImage') {
             mappingErrors.push(`'Keyframe Image' is mapped to node '${nodeTitle}', which is not a 'LoadImage' node. This will cause an error.`);
        }
        if ((dataType === 'human_readable_prompt' || dataType === 'full_timeline_json' || dataType === 'negative_prompt') && !node.class_type.includes('Text')) {
             mappingErrors.push(`Warning: Text data ('${dataType}') is mapped to '${nodeTitle}', which isn't a standard text input node (e.g., CLIPTextEncode). This might not work as expected with custom nodes.`);
        }
    }

    if (mappingErrors.length > 0) {
        throw new Error(`Workflow Validation Errors:\n- ${mappingErrors.join('\n- ')}\nPlease update your ComfyUI workflow to include text conditioning nodes and ensure proper mappings.`);
    }
};

/**
 * Validated version of validateWorkflowAndMappings that returns ValidationResult.
 * 
 * Unlike the throwing version, this returns a structured result with errors,
 * warnings, and suggestions for fixing issues. Use this for UI validation
 * where you want to display all errors at once rather than stopping at the first.
 * 
 * @param settings Local generation settings
 * @param profileId Active workflow profile id ('wan-t2i' or 'wan-i2v')
 * @returns ValidationResult with success status, errors, and suggestions
 */
export const validateWorkflowAndMappingsResult = (
    settings: LocalGenerationSettings,
    profileId: string = 'wan-i2v',
): ValidationResult<{ profileId: string; hasTextMapping: boolean; hasKeyframeMapping: boolean }> => {
    // Resolve workflow from profiles if root workflowJson is empty
    let workflowJson = settings.workflowJson;
    let mapping = settings.mapping ?? {};
    
    if (!workflowJson && settings.workflowProfiles?.[profileId]) {
        const profile = settings.workflowProfiles[profileId];
        workflowJson = profile.workflowJson;
        mapping = profile.mapping ?? {};
    }
    
    if (!workflowJson) {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.WORKFLOW_MISSING_JSON,
                'No workflow has been synced from the server',
                { fix: 'Sync a workflow from ComfyUI in Settings > Workflow Profiles' }
            )
        ]);
    }

    let workflowApi: Record<string, any>;
    try {
        workflowApi = JSON.parse(workflowJson);
    } catch {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.WORKFLOW_INVALID_JSON,
                'The synced workflow is not valid JSON',
                { fix: 'Re-sync the workflow from ComfyUI' }
            )
        ]);
    }

    const promptPayloadTemplate = workflowApi.prompt || workflowApi;
    if (typeof promptPayloadTemplate !== 'object' || promptPayloadTemplate === null) {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.WORKFLOW_INVALID_JSON,
                'Synced workflow has an invalid structure',
                { fix: 'Re-sync the workflow from ComfyUI' }
            )
        ]);
    }

    const workflowNodes = Object.values(promptPayloadTemplate ?? {}) as Array<Record<string, any>>;
    const errors: ReturnType<typeof createValidationError>[] = [];
    const warnings: ReturnType<typeof createValidationWarning>[] = [];
    const mappedDataTypes = new Set(Object.values(mapping));

    // Check for required node types
    const hasClipTextEncode = workflowNodes.some(
        (node) => node?.class_type === 'CLIPTextEncode' && node.inputs?.text !== undefined,
    );
    const hasLoadImage = workflowNodes.some(
        (node) => node?.class_type === 'LoadImage' && node.inputs?.image !== undefined,
    );

    // Check text mapping
    const hasTextMapping = mappedDataTypes.has('human_readable_prompt') || mappedDataTypes.has('full_timeline_json');
    const hasKeyframeMapping = mappedDataTypes.has('keyframe_image');

    // Core errors
    if (!hasClipTextEncode) {
        errors.push(createValidationError(
            ValidationErrorCodes.WORKFLOW_MISSING_CLIP_MAPPING,
            'Workflow requires at least one CLIPTextEncode node with a text input',
            { fix: 'Add a CLIPTextEncode node to your workflow or use a different workflow' }
        ));
    }
    
    if (profileId === 'wan-i2v' && !hasLoadImage) {
        errors.push(createValidationError(
            ValidationErrorCodes.WORKFLOW_MISSING_KEYFRAME_MAPPING,
            'Video workflow requires a LoadImage node for keyframe conditioning',
            { fix: 'Add a LoadImage node to your workflow for keyframe input' }
        ));
    }

    // Mapping errors
    if (!hasTextMapping) {
        errors.push(createValidationError(
            ValidationErrorCodes.WORKFLOW_MISSING_CLIP_MAPPING,
            'No text prompt mapping configured',
            { 
                field: 'mapping',
                fix: 'Map Human-Readable Prompt or Full Timeline JSON to a CLIPTextEncode text input' 
            }
        ));
    }
    
    if (profileId === 'wan-i2v' && !hasKeyframeMapping) {
        errors.push(createValidationError(
            ValidationErrorCodes.WORKFLOW_MISSING_KEYFRAME_MAPPING,
            'No keyframe image mapping configured for video profile',
            { 
                field: 'mapping',
                fix: 'Map Keyframe Image to a LoadImage image input' 
            }
        ));
    }

    // Check individual mapping consistency
    for (const [key, dataType] of Object.entries(mapping)) {
        if (dataType === 'none') continue;

        const parts = key.split(':');
        const nodeId = parts[0];
        const inputName = parts[1];
        if (!nodeId || !inputName) continue;
        const node = promptPayloadTemplate[nodeId];
        const nodeTitle = node?._meta?.title || `Node ${nodeId}`;

        if (!node) {
            errors.push(createValidationError(
                ValidationErrorCodes.WORKFLOW_NODE_NOT_FOUND,
                `Mapped node '${nodeTitle}' no longer exists in workflow`,
                { field: key, fix: 'Re-sync workflow and update mappings' }
            ));
            continue;
        }
        
        if (!node.inputs || typeof node.inputs[inputName] === 'undefined') {
            errors.push(createValidationError(
                ValidationErrorCodes.WORKFLOW_NODE_NOT_FOUND,
                `Mapped input '${inputName}' not found on node '${nodeTitle}'`,
                { field: key, fix: 'Check workflow structure and update mappings' }
            ));
            continue;
        }

        // Type-specific warnings (not blocking)
        if (dataType === 'keyframe_image' && node.class_type !== 'LoadImage') {
            warnings.push(createValidationWarning(
                'MAPPING_TYPE_MISMATCH',
                `Keyframe Image mapped to '${nodeTitle}' which is not a LoadImage node`,
                { field: key, suggestion: 'Map Keyframe Image to a LoadImage node' }
            ));
        }
    }

    if (errors.length > 0) {
        return validationFailure(errors, {
            warnings: warnings.length > 0 ? warnings : undefined,
            message: `Workflow validation failed with ${errors.length} error(s)`,
            context: profileId,
        });
    }

    return validationSuccess(
        { profileId, hasTextMapping, hasKeyframeMapping },
        'Workflow validation passed'
    );
};

// ============================================================================
// Node Dependency Pre-flight Check
// ============================================================================

export interface NodeDependencyCheckResult {
    success: boolean;
    availableNodes: string[];
    missingNodes: string[];
    errors: string[];
}

/**
 * Cache for installed ComfyUI nodes to avoid repeated /object_info calls.
 * The cache is invalidated after 5 minutes.
 */
let installedNodesCache: { nodes: Set<string>; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the list of installed ComfyUI nodes from the /object_info endpoint.
 * Results are cached for performance.
 * 
 * @param baseUrl ComfyUI server URL
 * @param forceRefresh If true, ignores cache and fetches fresh data
 * @returns Set of installed node class_types
 */
export const getInstalledNodes = async (
    baseUrl: string,
    forceRefresh: boolean = false
): Promise<Set<string>> => {
    // Check cache validity
    if (!forceRefresh && installedNodesCache) {
        const cacheAge = Date.now() - installedNodesCache.timestamp;
        if (cacheAge < CACHE_TTL_MS) {
            return installedNodesCache.nodes;
        }
    }
    
    const url = baseUrl.endsWith('/') ? `${baseUrl}object_info` : `${baseUrl}/object_info`;
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(getTimeout('DISCOVERY')),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch object_info: ${response.status} ${response.statusText}`);
        }
        
        const objectInfo = await response.json();
        const nodes = new Set<string>(Object.keys(objectInfo));
        
        // Update cache
        installedNodesCache = { nodes, timestamp: Date.now() };
        
        return nodes;
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            throw new Error(`Timeout fetching ComfyUI node info from ${url}`);
        }
        throw error;
    }
};

/**
 * Clears the installed nodes cache. Call this when ComfyUI restarts or
 * custom nodes are installed/uninstalled.
 */
export const clearInstalledNodesCache = (): void => {
    installedNodesCache = null;
};

/**
 * Checks if required ComfyUI nodes are installed before executing a workflow.
 * This prevents cryptic runtime errors when a workflow requires nodes that
 * are not installed in the user's ComfyUI setup.
 * 
 * @param settings Local generation settings containing ComfyUI URL
 * @param requiredNodes Array of required node class_types (e.g., ['WanFirstLastFrameToVideo', 'CLIPLoader'])
 * @returns NodeDependencyCheckResult with success status and details
 */
export const checkNodeDependencies = async (
    settings: LocalGenerationSettings,
    requiredNodes: string[]
): Promise<NodeDependencyCheckResult> => {
    const result: NodeDependencyCheckResult = {
        success: true,
        availableNodes: [],
        missingNodes: [],
        errors: []
    };
    
    if (!requiredNodes || requiredNodes.length === 0) {
        return result;
    }
    
    if (!settings.comfyUIUrl) {
        result.success = false;
        result.errors.push('ComfyUI URL not configured');
        return result;
    }
    
    try {
        const installedNodes = await getInstalledNodes(settings.comfyUIUrl);
        
        for (const nodeType of requiredNodes) {
            if (installedNodes.has(nodeType)) {
                result.availableNodes.push(nodeType);
            } else {
                result.missingNodes.push(nodeType);
            }
        }
        
        result.success = result.missingNodes.length === 0;
        
        if (!result.success) {
            result.errors.push(
                `Missing required ComfyUI nodes: ${result.missingNodes.join(', ')}. ` +
                `Please install the required custom nodes in ComfyUI.`
            );
        }
        
    } catch (error) {
        result.success = false;
        result.errors.push(
            `Failed to check node dependencies: ${error instanceof Error ? error.message : String(error)}`
        );
    }
    
    return result;
};

/**
 * Pre-flight check for chained scene video generation.
 * Validates that all required nodes for the chain-of-frames workflow are available.
 * 
 * @param settings Local generation settings
 * @returns NodeDependencyCheckResult
 */
export const checkChainedVideoNodeDependencies = async (
    settings: LocalGenerationSettings
): Promise<NodeDependencyCheckResult> => {
    const chainedProfile = settings.workflowProfiles?.[settings.sceneChainedWorkflowProfile || 'wan-i2v'];
    
    // Default required nodes for chained video generation
    // Note: We don't require a specific FLF2V node since multiple variants are valid
    // (WanFirstLastFrameToVideo for 14B, Wan22FirstLastFrameToVideoLatent* for 5B)
    const defaultRequiredNodes = [
        'CLIPLoader',
        'VAELoader',
        'UNETLoader',
        'CLIPTextEncode',
        'LoadImage',
        'KSampler',
        'VAEDecode',
        'SaveVideo'
    ];
    
    // If profile has metadata with required nodes, use those instead
    const requiredNodes = chainedProfile?.metadata?.requiredNodes || defaultRequiredNodes;
    
    return await checkNodeDependencies(settings, requiredNodes);
};


const ensureWorkflowMappingDefaults = (workflowNodes: Record<string, any>, existingMapping: WorkflowMapping): WorkflowMapping => {
    if (!workflowNodes || typeof workflowNodes !== 'object') {
        return existingMapping;
    }

    const baseMapping = existingMapping ?? {};
    const mergedMapping: WorkflowMapping = { ...baseMapping };
    const mappedTypes = new Set(Object.values(baseMapping));

    const assignMapping = (nodeId: string, inputName: string, dataType: MappableData) => {
        if (mappedTypes.has(dataType)) return;
        const key = `${nodeId}:${inputName}`;
        // Don't overwrite existing mappings (e.g., start_image/end_image shouldn't be overwritten by keyframe_image auto-detection)
        if (mergedMapping[key]) return;
        const node = workflowNodes[nodeId];
        if (!node || !node.inputs || typeof node.inputs[inputName] === 'undefined') return;
        mergedMapping[key] = dataType;
        mappedTypes.add(dataType);
    };

    const clipEntries = Object.entries(workflowNodes).filter(
        ([, node]) => node?.class_type === 'CLIPTextEncode' && node.inputs?.text !== undefined
    );
    const findClipEntry = (predicate: (node: any) => boolean, excludeNodeId?: string) =>
        clipEntries.find(([nodeId, node]) => nodeId !== excludeNodeId && predicate(node));

    const positiveEntry = findClipEntry(node => /positive/i.test(node._meta?.title || '')) || clipEntries[0];
    if (positiveEntry) {
        assignMapping(positiveEntry[0], 'text', 'human_readable_prompt');
    }

    const negativeEntry = findClipEntry(node => /negative/i.test(node._meta?.title || ''), positiveEntry?.[0]) ||
        clipEntries.find(([nodeId]) => nodeId !== positiveEntry?.[0]);
    if (negativeEntry) {
        assignMapping(negativeEntry[0], 'text', 'negative_prompt');
    }

    const loadImageEntry = Object.entries(workflowNodes).find(
        ([, node]) => node?.class_type === 'LoadImage' && node.inputs?.image !== undefined
    );
    if (loadImageEntry) {
        assignMapping(loadImageEntry[0], 'image', 'keyframe_image');
    }

    return mergedMapping;
};

/**
 * Default fetch configuration values for ComfyUI asset retrieval.
 * These can be overridden via LocalGenerationSettings.
 */
const DEFAULT_FETCH_CONFIG = {
    maxRetries: 3,
    timeoutMs: 15000,
    retryDelayMs: 1000,
};

/**
 * Configuration for fetchAssetAsDataURL, allowing per-call customization.
 */
interface FetchAssetConfig {
    maxRetries?: number;
    timeoutMs?: number;
    retryDelayMs?: number;
}

/**
 * Fetches an asset from the ComfyUI server and converts it to a data URL.
 * Includes configurable retry logic for transient failures.
 * 
 * @param url - ComfyUI server URL
 * @param filename - Asset filename to fetch
 * @param subfolder - Subfolder path on the server
 * @param type - Asset type (output, input, etc.)
 * @param config - Optional configuration for retries and timeouts
 * @param retryCount - Internal retry counter (do not set manually)
 * @returns Data URL string (data:mime/type;base64,...)
 * @throws Error with actionable message including filename for debugging
 */
const fetchAssetAsDataURL = async (
    url: string, 
    filename: string, 
    subfolder: string, 
    type: string, 
    config: FetchAssetConfig = {},
    retryCount: number = 0
): Promise<string> => {
    const maxRetries = config.maxRetries ?? DEFAULT_FETCH_CONFIG.maxRetries;
    const timeoutMs = config.timeoutMs ?? DEFAULT_FETCH_CONFIG.timeoutMs;
    const retryDelayMs = config.retryDelayMs ?? DEFAULT_FETCH_CONFIG.retryDelayMs;
    
    const baseUrl = getComfyUIBaseUrl(url);
    const fetchUrl = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`;
    
    console.log(`[fetchAssetAsDataURL] Fetching: ${fetchUrl}${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ''}`);
    
    try {
        const response = await fetchWithTimeout(fetchUrl, undefined, timeoutMs);
        if (!response.ok) {
            console.error(`[fetchAssetAsDataURL] HTTP error: ${response.status} for ${filename}`);
            
            // Retry on server errors (5xx) or specific client errors
            if (response.status >= 500 || response.status === 408) {
                if (retryCount < maxRetries) {
                    console.log(`[fetchAssetAsDataURL] Retrying in ${retryDelayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                    return fetchAssetAsDataURL(url, filename, subfolder, type, config, retryCount + 1);
                }
            }
            
            throw new Error(`Failed to fetch asset "${filename}" from ComfyUI server. Status: ${response.status}. URL: ${fetchUrl}. Try increasing fetch timeout in Settings > ComfyUI Settings > Advanced.`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        console.log(`[fetchAssetAsDataURL] Response content-type: ${contentType}, status: ${response.status}`);
        
        const blob = await response.blob();
        console.log(`[fetchAssetAsDataURL] Blob size: ${blob.size} bytes, type: ${blob.type}`);
        
        if (blob.size === 0) {
            // Retry for empty blobs (file not finished writing)
            if (retryCount < maxRetries) {
                console.log(`[fetchAssetAsDataURL] Empty blob, retrying in ${retryDelayMs * 2}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs * 2));
                return fetchAssetAsDataURL(url, filename, subfolder, type, config, retryCount + 1);
            }
            throw new Error(`Empty blob received for "${filename}". ComfyUI may not have finished writing the file. Try increasing retry delay in Settings > ComfyUI Settings > Advanced.`);
        }
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                
                // Validate data URL format
                if (!dataUrl || !dataUrl.startsWith('data:')) {
                    console.error(`[fetchAssetAsDataURL] Invalid data URL for ${filename}: ${dataUrl?.slice(0, 100)}`);
                    reject(new Error(`Failed to convert blob to data URL for "${filename}". FileReader returned: ${typeof dataUrl === 'string' ? dataUrl.slice(0, 50) : typeof dataUrl}. This is unexpected - please report this issue.`));
                    return;
                }
                
                console.log(`[fetchAssetAsDataURL] ✅ Successfully converted ${filename} to data URL (${dataUrl.length} chars)`);
                
                // Micro-instrumentation: emit a short, deterministic anchor so E2E traces
                // can correlate the inline data: URI with GEMDIRECT console diagnostics.
                try {
                    // Console anchor (visible in Playwright traces)
                    console.info('GEMDIRECT-KEYFRAME:' + (dataUrl ? dataUrl.slice(0, 200) : ''));

                    // Also push a compact diagnostic into a global so tests can read it from the page
                    const g: any = globalThis as any;
                    g.__gemDirectClientDiagnostics = g.__gemDirectClientDiagnostics || [];
                    g.__gemDirectClientDiagnostics.push({
                        event: 'keyframe-fetched',
                        filename,
                        subfolder,
                        type,
                        prefix: (dataUrl ? dataUrl.slice(0, 200) : ''),
                        ts: Date.now(),
                    });
                } catch (e) {
                    // ignore instrumentation errors
                }

                resolve(dataUrl);
            };
            reader.onerror = (e) => {
                console.error(`[fetchAssetAsDataURL] FileReader error for ${filename}:`, e);
                reject(new Error(`FileReader failed for "${filename}". Browser may be out of memory or the blob is corrupted. Try reducing video resolution or closing other tabs.`));
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`[fetchAssetAsDataURL] Failed to fetch ${filename}:`, error);
        
        // Retry on network errors
        if (retryCount < maxRetries && error instanceof Error && 
            (error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ECONNREFUSED'))) {
            console.log(`[fetchAssetAsDataURL] Network error, retrying in ${retryDelayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            return fetchAssetAsDataURL(url, filename, subfolder, type, config, retryCount + 1);
        }
        
        // Re-throw with actionable context if not already an Error with our message
        if (error instanceof Error) {
            // If error already has actionable info (from our throws above), re-throw as-is
            if (error.message.includes('Settings >') || error.message.includes('report this issue')) {
                throw error;
            }
            // Add context for other errors
            throw new Error(`Failed to fetch "${filename}" after ${retryCount + 1} attempt(s): ${error.message}. Check ComfyUI server status and network connection.`);
        }
        throw new Error(`Failed to fetch "${filename}": Unknown error. Check ComfyUI server status.`);
    }
};


/**
 * Constructs and sends a generation request to a ComfyUI server based on a synced workflow.
 * This function includes robust pre-flight checks to ensure configuration is valid before queuing.
 * @param settings The local generation settings, including URL, workflow, and mapping.
 * @param payloads The generated JSON and text prompts.
 * @param base64Image The base64-encoded keyframe image.
 * @returns The server's response after queueing the prompt.
 */
/**
 * Optional configuration for queueComfyUIPrompt
 */
export interface QueuePromptOptions {
    /** IP-Adapter payload for character consistency */
    ipAdapter?: IPAdapterPayload;
}

export const queueComfyUIPrompt = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string; structured: any[]; negativePrompt: string },
    base64Image: string,
    profileId: string = DEFAULT_WORKFLOW_PROFILE_ID,
    profileOverride?: WorkflowProfile,
    options?: QueuePromptOptions
): Promise<any> => {
    // ========================================================================
    // Entry Diagnostics - helps identify why requests never reach ComfyUI
    // ========================================================================
    const workflowProfileCount = Object.keys(settings.workflowProfiles || {}).length;
    const hasRootWorkflowJson = !!settings.workflowJson;
    const hasProfileWorkflowJson = !!settings.workflowProfiles?.[profileId]?.workflowJson;
    console.log('[queueComfyUIPrompt] Entry diagnostics:', {
        comfyUIUrl: settings.comfyUIUrl,
        profileId,
        workflowProfileCount,
        hasRootWorkflowJson,
        hasProfileWorkflowJson,
        hasProfileOverride: !!profileOverride,
        hasImage: !!base64Image && base64Image.length > 0
    });
    
    // ========================================================================
    // LM Studio VRAM Release - Unload LLM models to free VRAM for ComfyUI
    // ========================================================================
    const autoEjectEnabled = settings.featureFlags?.autoEjectLMStudioModels ?? true;
    if (autoEjectEnabled) {
        try {
            await ensureModelsUnloaded();
        } catch (lmError) {
            // Non-blocking: Log warning but continue with generation
            // LM Studio might not be running, which is fine
            console.warn('[queueComfyUIPrompt] LM Studio model unload failed (non-blocking):', lmError);
        }
    }
    
    // Early validation: Check if we have any workflow configured
    if (workflowProfileCount === 0 && !hasRootWorkflowJson && !profileOverride) {
        const errorMsg = 'No workflow profiles configured. Please import a workflow in Settings → ComfyUI Settings → Workflow Profiles.';
        console.error('[queueComfyUIPrompt]', errorMsg);
        throw new Error(errorMsg);
    }
    
    // ========================================================================
    // Token Validation Gate
    // ========================================================================
    const MAX_PROMPT_CHARS = 2500;
    const WARN_THRESHOLD = 0.8;
    
    const textTokens = estimateTokens(payloads.text);
    const textLength = payloads.text.length;
    
    // Hard-fail if prompt exceeds absolute limit after potential truncation
    if (textLength > MAX_PROMPT_CHARS) {
        console.error(`[queueComfyUIPrompt] Prompt too long: ${textLength} chars (max ${MAX_PROMPT_CHARS})`);
        
        // Attempt truncation
        const truncated = truncateToTokenLimit(payloads.text, Math.floor(MAX_PROMPT_CHARS / 4));
        if (truncated.text.length > MAX_PROMPT_CHARS) {
            throw new Error(`Prompt exceeds maximum length (${textLength} chars > ${MAX_PROMPT_CHARS}). Please shorten your prompt or scene description.`);
        }
        
        console.warn(`[queueComfyUIPrompt] Truncated prompt from ${textLength} to ${truncated.text.length} chars`);
        payloads = {
            ...payloads,
            text: truncated.text,
        };
    }
    
    // Soft warning at 80% capacity
    if (textLength > MAX_PROMPT_CHARS * WARN_THRESHOLD) {
        console.warn(`[queueComfyUIPrompt] Prompt approaching limit: ${textLength}/${MAX_PROMPT_CHARS} chars (${Math.round((textLength / MAX_PROMPT_CHARS) * 100)}%)`);
    }
    
    // Log token estimate for debugging
    console.log(`[queueComfyUIPrompt] Prompt tokens: ~${textTokens} (${textLength} chars)`);
    
    // Lightweight in-browser diagnostic recorder so E2E tests can read a deterministic
    // list of events describing attempted uploads/prompts. We avoid writing large
    // binary blobs and only record summaries/snippets to keep payloads small.
    const pushDiagnostic = (entry: Record<string, unknown>) => {
        try {
            const g = globalThis as unknown as { __gemDirectComfyDiagnostics?: Record<string, unknown>[] };
            g.__gemDirectComfyDiagnostics = g.__gemDirectComfyDiagnostics || [];
            const safe: Record<string, unknown> = { ts: new Date().toISOString(), ...entry };
            // truncate large fields
            if (typeof safe.body === 'string' && (safe.body as string).length > 1000) safe.body = (safe.body as string).slice(0, 1000) + '...';
            if (typeof safe.bodySnippet === 'string' && (safe.bodySnippet as string).length > 1000) safe.bodySnippet = (safe.bodySnippet as string).slice(0, 1000) + '...';
            g.__gemDirectComfyDiagnostics.push(safe);
        } catch {
            // ignore any diagnostic errors
        }
    };
    const modelId = resolveModelIdFromSettings(settings);
    const profile = resolveWorkflowProfile(settings, modelId, profileOverride, profileId);
    const profileConfig = settings.workflowProfiles?.[profileId];
    const workflowPath = profileConfig?.sourcePath || 'inline workflow';
    const highlightEntries =
        profileConfig?.metadata?.highlightMappings ?? computeHighlightMappings(profile.workflowJson, profile.mapping);
    const hasText = hasTextMapping(profile.mapping);
    const hasKeyframe = hasKeyframeMapping(profile.mapping);
    const missingMappingsSet = new Set<MappableData>(profileConfig?.metadata?.missingMappings ?? []);
    if (!hasText) {
        missingMappingsSet.add('human_readable_prompt');
        missingMappingsSet.add('full_timeline_json');
    }
      if (profileId === 'wan-i2v' && !hasKeyframe) {
          missingMappingsSet.add('keyframe_image');
      }
    const missingMappings = Array.from(missingMappingsSet);
    const warningSet = new Set(profileConfig?.metadata?.warnings ?? []);
    if (!hasText) {
        warningSet.add('Missing CLIP text input mapping (Human-Readable Prompt / Full Timeline JSON).');
    }
      if (profileId === 'wan-i2v' && !hasKeyframe) {
          warningSet.add('Missing LoadImage keyframe mapping.');
      }
    const warnings = Array.from(warningSet);
    const mappingEntries = Object.entries(profile.mapping).map(([key, dataType]) => ({ key, dataType }));
    const referencesCanonical = Boolean(
        profile.workflowJson &&
        KNOWN_WAN_WORKFLOWS.some(workflowFile =>
            profile.workflowJson.toLowerCase().includes(workflowFile.toLowerCase())
        )
    );
    const workflowMeta = {
        highlightMappings: highlightEntries,
        mappingEntries,
        missingMappings,
        warnings,
        referencesCanonical,
        hasTextMapping: hasText,
        hasKeyframeMapping: hasKeyframe,
        mapping: profile.mapping,
        promptVariantId: settings.promptVariantId,
        promptVariantLabel: settings.promptVariantLabel,
    };
    console.log(`[${profileId}] Workflow path: ${workflowPath} | Canonical workflow: ${referencesCanonical ? 'detected' : 'not detected'}`);
    if (highlightEntries.length > 0) {
        highlightEntries.forEach(entry => {
            console.log(
                `[${profileId}] ${friendlyMappingLabel(entry.type)} -> ${entry.nodeId}:${entry.inputName} (${entry.nodeTitle})`
            );
        });
    } else {
        console.log(`[${profileId}] Mapping entries: ${mappingEntries.map(entry => `${entry.dataType}:${entry.key}`).join(', ') || 'none'}`);
    }
    if (missingMappings.length > 0) {
        console.warn(`[${profileId}] Missing mappings: ${missingMappings.join(', ')}`);
    }

    let workflowApi: Record<string, any>;
    try {
        workflowApi = JSON.parse(profile.workflowJson);
    } catch (error) {
        throw new Error("The synced workflow is not valid JSON. Please re-sync.");
    }

    const promptPayloadTemplate = workflowApi.prompt || workflowApi;
    const mergedMapping = ensureWorkflowMappingDefaults(promptPayloadTemplate, profile.mapping);
    const runtimeSettings: LocalGenerationSettings = {
        ...settings,
        workflowJson: profile.workflowJson,
        mapping: mergedMapping,
    };

    // --- Run final pre-flight checks before queuing ---
    let systemResourcesMessage: string | undefined;
    try {
        await checkServerConnection(runtimeSettings.comfyUIUrl);
        systemResourcesMessage = await checkSystemResources(runtimeSettings.comfyUIUrl);
        // Validate using the active profile so wan-t2i (text->image) is not
        // incorrectly forced to have a LoadImage/keyframe mapping.
        validateWorkflowAndMappings(runtimeSettings, profileId);
    } catch(error) {
        // Re-throw the specific error from the checks to be displayed to the user.
        throw error;
    }
    
    // --- ALL CHECKS PASSED, PROCEED WITH GENERATION ---
    try {
        const promptPayload = JSON.parse(JSON.stringify(promptPayloadTemplate));
        const baseUrl = getComfyUIBaseUrl(runtimeSettings.comfyUIUrl);
        const clientId = runtimeSettings.comfyUIClientId || `csg_${Date.now()}`;
        console.log(`[${profileId}] Using Comfy client ID: ${clientId}`);
        pushDiagnostic({ profileId, action: 'prepare', clientId, workflowPath });
        
        let uploadedImageFilename: string | null = null;
        
        // --- STEP 1: UPLOAD ASSETS (IF MAPPED) ---
        const imageMappingKey = Object.keys(runtimeSettings.mapping).find(key => runtimeSettings.mapping[key] === 'keyframe_image');
        if (imageMappingKey && base64Image) {
            const nodeId = imageMappingKey.split(':')[0];
            if (!nodeId) throw new Error('Invalid mapping key: missing nodeId');
            const node = promptPayload[nodeId];

            if (node && node.class_type === 'LoadImage') {
                const blob = base64ToBlob(base64Image, 'image/jpeg');
                const formData = new FormData();
                formData.append('image', blob, `csg_keyframe_${Date.now()}.jpg`);
                formData.append('overwrite', 'true');
                
                const uploadResponse = await fetchWithTimeout(`${baseUrl}/upload/image`, {
                    method: 'POST',
                    body: formData,
                }, 45000);
                pushDiagnostic({ profileId, action: 'uploadImage:attempt', uploadFormFields: Array.from((formData as any).keys ? (formData as any).keys() : []), base64Length: base64Image.length });

                if (!uploadResponse.ok) throw new Error(`Failed to upload image to ComfyUI. Status: ${uploadResponse.status}`);
                const uploadResult = await uploadResponse.json();
                pushDiagnostic({ profileId, action: 'uploadImage:result', uploadResult: { name: uploadResult?.name, status: uploadResponse.status } });
                uploadedImageFilename = uploadResult.name;
            }
        }

        // --- STEP 1.1: UPLOAD DUAL-KEYFRAME ASSETS (start_image / end_image) ---
        // For profiles like wan-fun-inpaint that require both start and end images
        let uploadedStartImageFilename: string | null = null;
        let uploadedEndImageFilename: string | null = null;
        
        const startImageKey = Object.keys(runtimeSettings.mapping).find(key => runtimeSettings.mapping[key] === 'start_image');
        const endImageKey = Object.keys(runtimeSettings.mapping).find(key => runtimeSettings.mapping[key] === 'end_image');
        
        if (startImageKey && base64Image) {
            const nodeId = startImageKey.split(':')[0];
            if (nodeId) {
                const node = promptPayload[nodeId];
                if (node && node.class_type === 'LoadImage') {
                    const blob = base64ToBlob(base64Image, 'image/jpeg');
                    const formData = new FormData();
                    formData.append('image', blob, `csg_start_${Date.now()}.jpg`);
                    formData.append('overwrite', 'true');
                    
                    const uploadResponse = await fetchWithTimeout(`${baseUrl}/upload/image`, {
                        method: 'POST',
                        body: formData,
                    }, 45000);
                    
                    if (uploadResponse.ok) {
                        const uploadResult = await uploadResponse.json();
                        uploadedStartImageFilename = uploadResult.name;
                        console.log(`[${profileId}] start_image -> ${uploadedStartImageFilename} (node ${nodeId})`);
                    } else {
                        console.warn(`[${profileId}] Failed to upload start_image: ${uploadResponse.status}`);
                    }
                }
            }
        }
        
        if (endImageKey && base64Image) {
            const nodeId = endImageKey.split(':')[0];
            console.log(`[${profileId}] end_image upload: nodeId=${nodeId}`);
            if (nodeId) {
                const node = promptPayload[nodeId];
                console.log(`[${profileId}] end_image node check: node exists=${!!node}, class_type=${node?.class_type}`);
                if (node && node.class_type === 'LoadImage') {
                    // For dual-keyframe workflow: use the same image for both if only one provided
                    // In a real dual-keyframe scenario, caller should pass both images
                    const blob = base64ToBlob(base64Image, 'image/jpeg');
                    const formData = new FormData();
                    formData.append('image', blob, `csg_end_${Date.now()}.jpg`);
                    formData.append('overwrite', 'true');
                    
                    const uploadResponse = await fetchWithTimeout(`${baseUrl}/upload/image`, {
                        method: 'POST',
                        body: formData,
                    }, 45000);
                    
                    if (uploadResponse.ok) {
                        const uploadResult = await uploadResponse.json();
                        uploadedEndImageFilename = uploadResult.name;
                        console.log(`[${profileId}] end_image -> ${uploadedEndImageFilename} (node ${nodeId})`);
                    } else {
                        console.warn(`[${profileId}] Failed to upload end_image: ${uploadResponse.status}`);
                    }
                }
            }
        }

        // --- STEP 1.2: IP-ADAPTER CHARACTER CONSISTENCY (if provided) ---
        let ipAdapterUploadedFilenames: Record<string, string> = {};
        if (options?.ipAdapter?.isActive && Object.keys(options.ipAdapter.uploadedImages).length > 0) {
            console.log(`[${profileId}] IP-Adapter: Uploading ${Object.keys(options.ipAdapter.uploadedImages).length} character reference images...`);
            pushDiagnostic({ profileId, action: 'ipAdapter:uploadStart', referenceCount: Object.keys(options.ipAdapter.uploadedImages).length });
            
            for (const [refId, imageRef] of Object.entries(options.ipAdapter.uploadedImages)) {
                try {
                    // Handle both base64 and data URL formats
                    const base64Data = imageRef.startsWith('data:') 
                        ? imageRef.split(',')[1] 
                        : imageRef;
                    
                    if (!base64Data) {
                        console.warn(`[${profileId}] IP-Adapter: Empty base64 data for reference ${refId}, skipping`);
                        continue;
                    }
                    const blob = base64ToBlob(base64Data, 'image/png');
                    const formData = new FormData();
                    formData.append('image', blob, `ipadapter_${refId}_${Date.now()}.png`);
                    formData.append('overwrite', 'true');
                    
                    const uploadResponse = await fetchWithTimeout(`${baseUrl}/upload/image`, {
                        method: 'POST',
                        body: formData,
                    }, 45000);
                    
                    if (!uploadResponse.ok) {
                        console.warn(`[${profileId}] IP-Adapter: Failed to upload reference ${refId}, status: ${uploadResponse.status}`);
                        continue;
                    }
                    
                    const uploadResult = await uploadResponse.json();
                    ipAdapterUploadedFilenames[refId] = uploadResult.name;
                    console.log(`[${profileId}] IP-Adapter: Uploaded ${refId} as ${uploadResult.name}`);
                } catch (uploadError) {
                    console.warn(`[${profileId}] IP-Adapter: Error uploading reference ${refId}:`, uploadError);
                }
            }
            
            // Apply uploaded filenames to IP-Adapter workflow nodes
            if (Object.keys(ipAdapterUploadedFilenames).length > 0 && Object.keys(options.ipAdapter.nodeInjections).length > 0) {
                console.log(`[${profileId}] IP-Adapter: Applying ${Object.keys(ipAdapterUploadedFilenames).length} uploaded images to workflow...`);
                
                // Merge IP-Adapter nodes into the prompt payload
                const ipAdapterWorkflow = applyUploadedImagesToWorkflow(
                    options.ipAdapter.nodeInjections,
                    ipAdapterUploadedFilenames
                );
                
                // Merge IP-Adapter nodes into main workflow
                for (const [nodeId, node] of Object.entries(ipAdapterWorkflow)) {
                    promptPayload[nodeId] = node;
                }
                
                pushDiagnostic({ 
                    profileId, 
                    action: 'ipAdapter:nodesInjected', 
                    nodeCount: Object.keys(ipAdapterWorkflow).length,
                    uploadedCount: Object.keys(ipAdapterUploadedFilenames).length
                });
            }
        }

        // --- STEP 1.5: RANDOMIZE SEEDS IN KSAMPLER NODES ---
        // Generate a random seed for this generation to avoid deterministic failures
        const randomSeed = Math.floor(Math.random() * 1e15);
        console.log(`[${profileId}] Randomizing workflow seeds to: ${randomSeed}`);
        
        for (const [nodeId, nodeEntry] of Object.entries(promptPayload)) {
            const node = nodeEntry as WorkflowNode;
            if (typeof node === 'object' && node !== null && node.class_type === 'KSampler' && node.inputs && 'seed' in node.inputs) {
                const originalSeed = node.inputs.seed;
                node.inputs.seed = randomSeed;
                console.log(`[${profileId}] Randomized seed in node ${nodeId}: ${originalSeed} → ${randomSeed}`);
            }
        }

        // --- STEP 2: INJECT DATA INTO WORKFLOW BASED ON MAPPING ---
        for (const [key, dataType] of Object.entries(runtimeSettings.mapping)) {
            if (dataType === 'none') continue;

            const parts = key.split(':');
            const nodeId = parts[0];
            const inputName = parts[1];
            if (!nodeId || !inputName) continue;
            const node = promptPayload[nodeId] as WorkflowNode | undefined;
            
            if (node && node.inputs) {
                let dataToInject: unknown = null;
                switch (dataType) {
                    case 'human_readable_prompt':
                        dataToInject = payloads.text;
                        break;
                    case 'full_timeline_json':
                        dataToInject = payloads.json;
                        break;
                    case 'negative_prompt':
                        dataToInject = payloads.negativePrompt;
                        break;
                    case 'keyframe_image':
                        if (uploadedImageFilename && node.class_type === 'LoadImage') {
                             dataToInject = uploadedImageFilename;
                        }
                        break;
                    case 'start_image':
                        if (uploadedStartImageFilename && node.class_type === 'LoadImage') {
                            dataToInject = uploadedStartImageFilename;
                        }
                        break;
                    case 'end_image':
                        if (uploadedEndImageFilename && node.class_type === 'LoadImage') {
                            dataToInject = uploadedEndImageFilename;
                        }
                        break;
                }
                if (dataToInject !== null) {
                    node.inputs[inputName] = dataToInject;
                }
            }
        }
        
        // --- STEP 3: QUEUE THE PROMPT ---
        // Generate correlation ID for request tracking
        const correlationId = generateCorrelationId();
        const startTime = Date.now();
        
        logCorrelation(
            { correlationId, timestamp: startTime, source: 'comfyui' },
            `Queueing ComfyUI prompt`,
            { profileId, clientId }
        );

        const body = JSON.stringify({ prompt: promptPayload, client_id: clientId });
        pushDiagnostic({ profileId, action: 'prompt:posting', bodySnippet: body?.slice ? body.slice(0, 1000) : undefined, correlationId });
        const response = await fetchWithTimeout(`${baseUrl}/prompt`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
                'X-Request-ID': correlationId,
            },
            body,
        }, 60000);

        // Track request in network tap
        const duration = Date.now() - startTime;
        networkTap.add({
            correlationId,
            url: `${baseUrl}prompt`,
            method: 'POST',
            status: response.status,
            duration,
            timestamp: startTime,
        });
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'comfyui' },
            `ComfyUI prompt queued`,
            { status: response.status, duration }
        );

        if (!response.ok) {
            let errorMessage = `ComfyUI server responded with status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage += ` - ${errorData.error?.message || JSON.stringify(errorData)}`;
            } catch (e) { /* ignore json parse error */ }
            throw new Error(errorMessage);
        }
        const result = await response.json();
        try { pushDiagnostic({ profileId, action: 'prompt:result', promptId: result?.prompt_id, resultSnippet: JSON.stringify(result).slice(0, 1000) }); } catch(e) { console.debug('[comfyUIService] Diagnostic push failed:', e); }

        let queueSnapshot;
        try {
            queueSnapshot = await getQueueInfo(runtimeSettings.comfyUIUrl);
            console.log(
                `[${profileId}] Queue snapshot: Running=${queueSnapshot.queue_running}, Pending=${queueSnapshot.queue_pending}`
            );
            pushDiagnostic({ profileId, action: 'queue:snapshot', queueSnapshot });
        } catch (queueError) {
            const message = queueError instanceof Error ? queueError.message : String(queueError);
            console.warn(`[${profileId}] Queue snapshot unavailable: ${message}`);
            pushDiagnostic({ profileId, action: 'queue:snapshot-unavailable', message });
        }

        return {
            ...result,
            systemResources: systemResourcesMessage,
            workflowProfileId: profileId,
            workflowPath,
            clientId,
            queueSnapshot,
            workflowMeta,
        };

    } catch (error) {
        console.error("Error processing ComfyUI request:", error);
        try { pushDiagnostic({ profileId, action: 'error', message: error instanceof Error ? error.message : String(error) }); } catch(e) { console.debug('[comfyUIService] Diagnostic push failed:', e); }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('ComfyUI request timed out. The server may be slow or unresponsive.');
        }
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error(`Failed to connect to ComfyUI at '${runtimeSettings.comfyUIUrl}'. Please check if the server is running and accessible.`);
        }
        throw new Error(`Failed to process ComfyUI workflow. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Validated version of queueComfyUIPrompt that returns ValidationResult instead of throwing.
 * 
 * This function wraps queueComfyUIPrompt with proper error handling and returns a unified
 * ValidationResult<ComfyUIPromptResult> that includes:
 * - success: true with data on successful queue
 * - success: false with errors and suggestions on failure
 * 
 * @param settings The local generation settings
 * @param payloads The generated prompts (json, text, structured, negativePrompt)
 * @param base64Image The keyframe image (required for wan-i2v)
 * @param profileId The workflow profile ID (default: wan-i2v)
 * @param profileOverride Optional explicit workflow profile
 * @returns ValidationResult with prompt result or detailed errors
 * 
 * @example
 * const result = await queueComfyUIPromptValidated(settings, payloads, image);
 * if (!result.success) {
 *   console.error('Failed to queue:', result.errors);
 *   if (result.suggestions?.length) {
 *     console.log('Suggestions:', result.suggestions);
 *   }
 *   return;
 * }
 * // Use result.data.prompt_id for tracking
 */
export const queueComfyUIPromptValidated = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string; structured: any[]; negativePrompt: string },
    base64Image: string,
    profileId: string = DEFAULT_WORKFLOW_PROFILE_ID,
    profileOverride?: WorkflowProfile
): Promise<ValidationResult<ComfyUIPromptResult>> => {
    // Pre-validation checks that can be caught before the main function
    if (!settings.comfyUIUrl) {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.PROVIDER_CONNECTION_FAILED,
                'ComfyUI URL is not configured',
                { fix: 'Configure ComfyUI URL in Settings > Local Generation' }
            )
        ]);
    }

    // For video workflows, require keyframe image
    if (profileId === 'wan-i2v' && !base64Image) {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.WORKFLOW_MISSING_KEYFRAME_MAPPING,
                'Keyframe image is required for video generation (wan-i2v profile)',
                { fix: 'Generate a keyframe image for the scene before generating video' }
            )
        ]);
    }

    try {
        const result = await queueComfyUIPrompt(
            settings,
            payloads,
            base64Image,
            profileId,
            profileOverride
        );

        // Convert warnings from metadata to validation warnings (kept for future use)
        // Note: Currently unused but preserved for potential future integration
        void (result.workflowMeta?.warnings || []).map((w: string, i: number) =>
            createValidationWarning(`WORKFLOW_WARN_${i}`, w)
        );

        return validationSuccess(result as ComfyUIPromptResult, 'Prompt queued successfully');
        
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        // Categorize error and provide suggestions
        let errorCode: ValidationErrorCode = ValidationErrorCodes.PROVIDER_CONNECTION_FAILED;
        let suggestions: Array<{ id: string; type: 'fix'; description: string; action: string; autoApplicable: boolean }> = [];
        
        if (message.includes('not valid JSON') || message.includes('re-sync')) {
            errorCode = ValidationErrorCodes.WORKFLOW_INVALID_JSON;
            suggestions.push({
                id: 'sync_workflow',
                type: 'fix',
                description: 'Re-sync the workflow from ComfyUI',
                action: 'open_settings',
                autoApplicable: false,
            });
        } else if (message.includes('timeout') || message.includes('timed out')) {
            errorCode = ValidationErrorCodes.PROVIDER_TIMEOUT;
            suggestions.push({
                id: 'check_server',
                type: 'fix',
                description: 'Check if ComfyUI server is running and responsive',
                action: 'check_connection',
                autoApplicable: true,
            });
        } else if (message.includes('CLIP') || message.includes('mapping')) {
            errorCode = ValidationErrorCodes.WORKFLOW_MISSING_CLIP_MAPPING;
            suggestions.push({
                id: 'configure_mapping',
                type: 'fix',
                description: 'Configure workflow mappings in Settings > Workflow Profiles',
                action: 'open_settings',
                autoApplicable: false,
            });
        } else if (message.includes('connect') || message.includes('fetch')) {
            errorCode = ValidationErrorCodes.PROVIDER_CONNECTION_FAILED;
            suggestions.push({
                id: 'verify_url',
                type: 'fix',
                description: 'Verify ComfyUI URL and ensure server is accessible',
                action: 'check_connection',
                autoApplicable: true,
            });
        }
        
        return validationFailure([
            createValidationError(errorCode, message, {
                context: `Profile: ${profileId}`,
            })
        ], {
            suggestions,
            message,
            context: 'queueComfyUIPrompt',
        });
    }
};


/**
 * Tracks the execution of a ComfyUI prompt via WebSocket.
 * @param settings The local generation settings.
 * @param promptId The ID of the prompt to track.
 * @param onProgress A callback function to report progress updates.
 */
export const trackPromptExecution = (
    settings: LocalGenerationSettings,
    promptId: string,
    onProgress: (statusUpdate: Partial<LocalGenerationStatus>) => void
) => {
    const dispatchProgress = (update: Partial<LocalGenerationStatus>) => {
        onProgress({ promptId, ...update });
    };

    const { comfyUIUrl, comfyUIClientId } = settings;
    if (!comfyUIUrl || !comfyUIClientId) {
        dispatchProgress({ status: 'error', message: 'ComfyUI URL or Client ID is not configured.' });
        return;
    }

    // Check if custom WebSocket URL is configured in settings (use provided settings directly)
    let wsUrl: string;
    
    if (settings.comfyUIWebSocketUrl) {
        // Use configured WebSocket URL
        wsUrl = settings.comfyUIWebSocketUrl.replace(/\/+$/, '') + `?clientId=${comfyUIClientId}`;
    } else if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV) {
        // In DEV mode, use Vite proxy for WebSocket (ws:true configured in vite.config.ts)
        // Guard against window.location being undefined in test environments
        if (typeof window !== 'undefined' && window.location) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/api/comfyui/ws?clientId=${comfyUIClientId}`;
        } else {
            // Test/SSR environment - use direct local connection
            wsUrl = `ws://127.0.0.1:8188/ws?clientId=${comfyUIClientId}`;
        }
    } else {
        // Auto-derive from HTTP URL (production mode)
        const normalizedUrl = comfyUIUrl.replace(/\/+$/, '');
        const protocol = normalizedUrl.startsWith('https://') ? 'wss://' : 'ws://';
        wsUrl = `${protocol}${normalizedUrl.replace(/^https?:\/\//, '')}/ws?clientId=${comfyUIClientId}`;
    }
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('ComfyUI WebSocket connection established.');
    };

    ws.onmessage = async (event) => {
        if (typeof event.data !== 'string') return; // Ignore binary data
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
            case 'status':
                if (msg.data.queue_remaining !== undefined) {
                    dispatchProgress({ 
                        status: 'queued', 
                        message: `In queue... Position: ${msg.data.queue_remaining}`,
                        queue_position: msg.data.queue_remaining
                    });
                }
                break;
            
            case 'execution_start':
                if (msg.data.prompt_id === promptId) {
                    dispatchProgress({ status: 'running', message: 'Execution started.' });
                }
                break;
                
            case 'executing':
                 if (msg.data.prompt_id === promptId && msg.data.node) {
                     // Try to get node title from workflow
                     let nodeTitle = `Node ${msg.data.node}`;
                     try {
                        const workflow = JSON.parse(settings.workflowJson);
                        const prompt = workflow.prompt || workflow;
                        if(prompt[msg.data.node]?._meta?.title) {
                            nodeTitle = prompt[msg.data.node]._meta.title;
                        }
                     } catch(e) {/* ignore */}

                    dispatchProgress({
                        status: 'running',
                        message: `Executing: ${nodeTitle}`,
                        node_title: nodeTitle,
                    });
                }
                break;

            case 'progress':
                 if (msg.data.prompt_id === promptId) {
                    const progress = (msg.data.value / msg.data.max) * 100;
                    dispatchProgress({
                        status: 'running',
                        progress: Math.round(progress),
                    });
                }
                break;
            
            case 'execution_error':
                if (msg.data.prompt_id === promptId) {
                    const errorDetails = msg.data;
                    const rawError = errorDetails.exception_message || 'Unknown execution error';
                    const userFriendlyError = parseComfyUIError(rawError);
                    const errorMessage = `ComfyUI error (node ${errorDetails.node_id}): ${userFriendlyError}`;
                    console.error(`[trackPromptExecution] Execution error:`, errorDetails);
                    dispatchProgress({ status: 'error', message: errorMessage });
                    ws.close();
                }
                break;

            case 'executed':
                if (msg.data.prompt_id === promptId) {
                    console.log(`[trackPromptExecution] ✓ Execution complete for promptId=${promptId.slice(0,8)}...`);
                    const outputs = msg.data.output || {};
                    
                    // FIXED: Iterate through node outputs like polling handler does
                    // ComfyUI executed event has outputs keyed by node ID, not flat videos/images
                    const assetSources: Array<{ entries?: any[]; resultType: LocalGenerationAsset['type'] }> = [];
                    
                    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
                        const output = nodeOutput as any;
                        if (output.videos && Array.isArray(output.videos)) {
                            console.log(`[trackPromptExecution] Found ${output.videos.length} videos in node ${nodeId}`);
                            assetSources.push({ entries: output.videos, resultType: 'video' });
                        }
                        if (output.images && Array.isArray(output.images)) {
                            console.log(`[trackPromptExecution] Found ${output.images.length} images in node ${nodeId}`);
                            assetSources.push({ entries: output.images, resultType: 'image' });
                        }
                        if (output.gifs && Array.isArray(output.gifs)) {
                            console.log(`[trackPromptExecution] Found ${output.gifs.length} gifs in node ${nodeId}`);
                            assetSources.push({ entries: output.gifs, resultType: 'video' });
                        }
                    }

                    const fetchAssetCollection = async (
                        entries: any[],
                        resultType: LocalGenerationAsset['type']
                    ): Promise<LocalGenerationAsset[]> => {
                        return Promise.all(
                            entries.map(async (entry) => ({
                                type: resultType,
                                data: await fetchAssetAsDataURL(
                                    comfyUIUrl,
                                    entry.filename,
                                    entry.subfolder,
                                    entry.type || 'output'
                                ),
                                filename: entry.filename,
                            }))
                        );
                    };

                    // If there are no declared output entries at all, report completion synchronously
                    // so callers/tests do not race on the async fetch logic.
                    const hasDeclaredEntries = assetSources.some(s => Array.isArray(s.entries) && s.entries.length > 0);
                    if (!hasDeclaredEntries) {
                        console.log(`[trackPromptExecution] ⚠️ No output entries for promptId=${promptId.slice(0,8)}...`);
                        dispatchProgress({ status: 'complete', message: 'Generation complete! No visual output found in final node.' });
                        ws.close();
                        return;
                    }

                    try {
                        console.log(`[trackPromptExecution] 📥 Fetching assets for promptId=${promptId.slice(0,8)}...`);
                        dispatchProgress({ message: 'Fetching final output...', progress: 100 });
                        const downloadedAssets: LocalGenerationAsset[] = [];

                        for (const source of assetSources) {
                            const entries = source.entries;
                            if (!Array.isArray(entries)) {
                                continue;
                            }
                            if (entries.length === 0) {
                                continue;
                            }
                            console.log(`[trackPromptExecution] Fetching ${entries.length} ${source.resultType} assets for promptId=${promptId.slice(0,8)}...`);
                            const assets = await fetchAssetCollection(entries, source.resultType);
                            downloadedAssets.push(...assets);
                            console.log(`[trackPromptExecution] ✓ Fetched ${assets.length} ${source.resultType} assets`);
                        }

                        if (downloadedAssets.length > 0) {
                            const primaryAsset = downloadedAssets[0];
                            if (!primaryAsset) {
                                console.error(`[trackPromptExecution] ❌ Primary asset is undefined despite array length > 0`);
                                dispatchProgress({ status: 'error', message: 'Asset download failed - empty result' });
                                ws.close();
                                return;
                            }
                            const imageAssets = downloadedAssets.filter(asset => asset.type === 'image');
                            const videoAssets = downloadedAssets.filter(asset => asset.type === 'video');
                            
                            // CRITICAL: Validate first asset has valid data URL
                            const primaryData = primaryAsset.data;
                            const isValidDataUrl = typeof primaryData === 'string' && 
                                (primaryData.startsWith('data:video/') || primaryData.startsWith('data:image/'));
                            
                            if (!isValidDataUrl) {
                                console.error(`[trackPromptExecution] ❌ Invalid data URL for promptId=${promptId.slice(0,8)}... Type: ${typeof primaryData}, Preview: ${typeof primaryData === 'string' ? primaryData.slice(0, 100) : 'N/A'}`);
                                dispatchProgress({ 
                                    status: 'error', 
                                    message: `Asset data invalid: expected data URL, received ${typeof primaryData === 'string' ? primaryData.slice(0, 50) : typeof primaryData}` 
                                });
                                ws.close();
                                return;
                            }
                            
                            const finalOutput: LocalGenerationStatus['final_output'] = {
                                type: primaryAsset.type,
                                data: primaryAsset.data,
                                filename: primaryAsset.filename,
                                assets: downloadedAssets,
                            };

                            if (imageAssets.length > 0) {
                                finalOutput.images = imageAssets.map(asset => asset.data);
                            }
                            if (videoAssets.length > 0) {
                                finalOutput.videos = videoAssets.map(asset => asset.data);
                            }

                            console.log(`[trackPromptExecution] ✅ Downloaded ${downloadedAssets.length} assets for promptId=${promptId.slice(0,8)}..., sending complete status`);
                            // CRITICAL: Send completion signal SYNCHRONOUSLY before closing WebSocket
                            // This ensures the promise resolver receives the data
                            dispatchProgress({
                                status: 'complete',
                                message: 'Generation complete!',
                                final_output: finalOutput,
                            });
                            
                            // Small delay to ensure state updates propagate
                            await new Promise(resolve => setTimeout(resolve, 50));
                        } else {
                            console.log(`[trackPromptExecution] ⚠️ No assets downloaded for promptId=${promptId.slice(0,8)}...`);
                            dispatchProgress({ status: 'complete', message: 'Generation complete! No visual output found in final node.' });
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to fetch final output.";
                        console.error(`[trackPromptExecution] ❌ Asset fetch error for promptId=${promptId.slice(0,8)}...:`, error);
                        dispatchProgress({ status: 'error', message });
                    } finally {
                        // Ensure WebSocket closes after all processing with explicit logging
                        try {
                            console.log(`[trackPromptExecution] ⏸️  Waiting 50ms before WebSocket close for promptId=${promptId.slice(0,8)}...`);
                            await new Promise(resolve => setTimeout(resolve, 50));
                            console.log(`[trackPromptExecution] 🔌 Closing WebSocket for promptId=${promptId.slice(0,8)}...`);
                            ws.close();
                            console.log(`[trackPromptExecution] ✅ WebSocket closed successfully for promptId=${promptId.slice(0,8)}`);
                        } catch (closeError) {
                            console.error(`[trackPromptExecution] ❌ Error closing WebSocket for promptId=${promptId.slice(0,8)}:`, closeError);
                        }
                    }
                }
                break;
        }
    };

    ws.onerror = (error) => {
        console.error('ComfyUI WebSocket error:', error);
        dispatchProgress({ status: 'error', message: `WebSocket connection error. Check if ComfyUI is running at ${comfyUIUrl}.` });
    };

    ws.onclose = () => {
        console.log('ComfyUI WebSocket connection closed.');
    };
};

export interface VideoGenerationDependencies {
    queuePrompt?: typeof queueComfyUIPrompt;
    trackExecution?: typeof trackPromptExecution;
    pollQueueInfo?: typeof getQueueInfo;
}

export interface VideoGenerationOverrides {
    negativePrompt?: string;
    /** Scene transition context for narrative coherence across video segments */
    transitionContext?: SceneTransitionContext;
    /** Shot-level transition context for fine-grained continuity between shots */
    shotTransitionContext?: ShotTransitionContext;
    // Phase 7: Narrative state tracking
    /** Formatted narrative context for prompt injection */
    narrativeContext?: string;
    // Phase 7: IP-Adapter character consistency
    /** Character reference images for IP-Adapter (characterId -> base64) */
    characterReferenceImages?: Record<string, string>;
    /** Visual Bible for IP-Adapter character lookup */
    visualBible?: VisualBible | null;
    /** Scene context for IP-Adapter character references */
    scene?: Scene;
}


/**
 * Generates video from a storyline shot using SVD (Stable Video Diffusion) in ComfyUI.
 * This is the main integration function for gemDirect1 → ComfyUI.
 * 
 * @param settings ComfyUI server settings with workflow mapping
 * @param shot The shot to generate video for
 * @param enhancers Creative enhancers for the shot
 * @param directorsVision Overall visual style guide
 * @param keyframeImage Base64-encoded keyframe image (optional but recommended)
 * @param onProgress Callback to report generation progress
 * @returns Promise resolving to video output data
 */
export const generateVideoFromShot = async (
    settings: LocalGenerationSettings,
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    keyframeImage: string | null,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void,
    dependencies?: VideoGenerationDependencies,
    overrides?: VideoGenerationOverrides
): Promise<{
    videoPath: string;
    duration: number;
    filename: string;
    frames?: string[];
    workflowMeta?: WorkflowGenerationMetadata;
    queueSnapshot?: { queue_running: number; queue_pending: number };
    systemResources?: string;
}> => {
    
        const reportProgress = (update: Partial<LocalGenerationStatus>) => {
            if (onProgress) onProgress(update);
            if (update.message) {
                console.log(`[Video Generation] ${update.message}`);
            }
        };

        const getSceneContext = (promptId?: string): string => {
            const base = `Scene ${shot.id}`;
            return promptId ? `${base} (prompt ${promptId})` : base;
        };

    const {
        queuePrompt = queueComfyUIPrompt,
        trackExecution = trackPromptExecution,
        pollQueueInfo = getQueueInfo,
    } = dependencies ?? {};

    try {
        reportProgress({ status: 'running', message: 'Building video generation prompt...' });
        
        // Step 1: Build human-readable prompt with optional transition context and narrative context
        const humanPrompt = buildShotPrompt(
            shot,
            enhancers,
            directorsVision,
            settings,
            undefined,
            shot.id,
            'sceneVideo', // Use sceneVideo for shot video generation
            overrides?.transitionContext,
            overrides?.shotTransitionContext,
            overrides?.narrativeContext
        );
        logPromptDebug('shot-video-prompt', {
            shotId: shot.id,
            hasKeyframe: !!keyframeImage,
            directorsVisionLength: directorsVision?.length || 0,
            promptPreview: humanPrompt.substring(0, 160),
        });
        
        reportProgress({ status: 'running', message: `Prompt: ${humanPrompt.substring(0, 80)}...` });

        // Step 2: Build payload with shot-specific data
        const modelId = resolveModelIdFromSettings(settings);
        const defaultNegativePrompt = getDefaultNegativePromptForModel(modelId, 'sceneVideo');
        const appliedNegativePrompt = overrides?.negativePrompt?.trim()?.length
            ? overrides.negativePrompt
            : defaultNegativePrompt;
        const finalNegativePrompt = extendNegativePrompt(appliedNegativePrompt);

        const payloads = {
            json: JSON.stringify({ shot_id: shot.id, description: shot.description }),
            text: humanPrompt,
            structured: [],
            negativePrompt: finalNegativePrompt
        };

        // Enforce keyframe image requirement if workflow expects it
        const keyframeMappingExists = Object.values(settings.mapping).includes('keyframe_image');
        if (keyframeMappingExists && !keyframeImage) {
            throw new Error(`${getSceneContext()} requires a keyframe image for this workflow but none was provided.`);
        }

        // Step 2.5: Prepare IP-Adapter payload for character consistency (if available)
        let ipAdapterPayload: IPAdapterPayload | undefined;
        const videoProfileId = settings.videoWorkflowProfile || DEFAULT_WORKFLOW_PROFILE_ID;
        if (overrides?.visualBible && overrides?.scene && overrides?.characterReferenceImages) {
            try {
                const workflowProfile = settings.workflowProfiles?.[videoProfileId];
                if (workflowProfile?.workflowJson) {
                    reportProgress({ status: 'running', message: 'Preparing IP-Adapter character references...' });
                    ipAdapterPayload = await prepareIPAdapterPayload(
                        overrides.visualBible,
                        overrides.scene,
                        shot,
                        workflowProfile.workflowJson,
                        { enabled: true }
                    );
                    
                    if (ipAdapterPayload.isActive) {
                        console.log(`[generateVideoFromShot] IP-Adapter prepared: ${ipAdapterPayload.referenceCount} references`);
                    }
                    
                    if (ipAdapterPayload.warnings.length > 0) {
                        console.warn(`[generateVideoFromShot] IP-Adapter warnings:`, ipAdapterPayload.warnings);
                    }
                }
            } catch (ipError) {
                console.warn(`[generateVideoFromShot] Failed to prepare IP-Adapter payload:`, ipError);
                // Continue without IP-Adapter - don't fail the generation
            }
        }

        // Step 3: Queue prompt in ComfyUI
        reportProgress({ status: 'running', message: 'Queuing prompt in ComfyUI...' });
        let promptResponse;
        try {
            promptResponse = await queuePrompt(
                settings, 
                payloads, 
                keyframeImage || '', 
                videoProfileId,
                undefined, // profileOverride
                ipAdapterPayload ? { ipAdapter: ipAdapterPayload } : undefined
            );
        } catch (queueError) {
            const message = queueError instanceof Error ? queueError.message : String(queueError);
            const contextMessage = `${getSceneContext()} failed to queue prompt: ${message}`;
            reportProgress({ status: 'error', message: contextMessage });
            throw new Error(contextMessage);
        }
        const resourceMessage =
            promptResponse && typeof promptResponse === 'object'
                ? (promptResponse as { systemResources?: string }).systemResources
                : undefined;

        if (resourceMessage && resourceMessage.trim().length > 0) {
            const isWarning = /warning/i.test(resourceMessage);
            reportProgress({
                status: 'running',
                message: isWarning ? resourceMessage : `Resource check: ${resourceMessage}`,
            });
        }

        if (!promptResponse || !promptResponse.prompt_id) {
            const contextMessage = `${getSceneContext()} did not receive a prompt_id after queuing`;
            throw new Error(contextMessage);
        }

        const promptId = promptResponse.prompt_id;
        reportProgress({ status: 'queued', message: `Queued with ID: ${promptId}`, promptId });

        // Step 4: Track execution via WebSocket
        // NOTE: Updated to handle PNG frame sequence output from simplified SVD workflow
        // The workflow outputs PNG images (one per frame) instead of a single video file
        return new Promise((resolve, reject) => {
            // ============================================================================
            // STATE TRACKING - Shared mutable state for WebSocket/Polling coordination
            // ============================================================================
            let outputData: any = null;
            let frameSequence: string[] = [];
            let isAssetDownloadComplete = false;  // Set true when WebSocket delivers valid data URL
            let gracePeriodStartTime: number | null = null;  // Timestamp when grace period started
            let isResolved = false;  // Prevent double resolution
            
            const logPipeline = (tag: string, message: string, data?: any) => {
                if (DEBUG_VIDEO_PIPELINE) {
                    const timestamp = new Date().toISOString().slice(11, 23);
                    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
                    console.log(`[${timestamp}] [PIPELINE:${tag}] ${message}${dataStr}`);
                }
            };
            
            logPipeline('INIT', `Starting video generation for shot ${shot.id}`, { promptId: promptId.slice(0, 8) });
            
            // ============================================================================
            // PROGRESS CALLBACK - Receives updates from WebSocket (trackPromptExecution)
            // ============================================================================
            const wrappedOnProgress = (update: Partial<LocalGenerationStatus>) => {
                logPipeline('PROGRESS', `Received update: status=${update.status}`, {
                    hasOutput: !!update.final_output,
                    message: update.message?.slice(0, 50)
                });
                
                reportProgress(update);
                
                // Capture output when generation completes
                if (update.final_output) {
                    outputData = update.final_output;
                    logPipeline('PROGRESS', 'final_output received', {
                        type: outputData.type,
                        filename: outputData.filename,
                        dataLength: outputData.data?.length,
                        dataPrefix: typeof outputData.data === 'string' ? outputData.data.slice(0, 30) : 'N/A'
                    });
                    
                    // Handle both video file output and PNG frame sequences
                    if (Array.isArray(outputData.images)) {
                        frameSequence = outputData.images;
                        logPipeline('PROGRESS', `Frame sequence captured: ${frameSequence.length} frames`);
                    }
                    
                    // CRITICAL: Validate data URL and set completion flag
                    const dataUrl = outputData.data;
                    const isValidDataUrl = typeof dataUrl === 'string' && 
                        (dataUrl.startsWith('data:video/') || dataUrl.startsWith('data:image/'));
                    
                    if (isValidDataUrl) {
                        isAssetDownloadComplete = true;
                        logPipeline('PROGRESS', '✅ Asset download complete - valid data URL received');
                    } else {
                        logPipeline('PROGRESS', '⚠️ final_output received but data is NOT a valid data URL', {
                            received: typeof dataUrl === 'string' ? dataUrl.slice(0, 50) : typeof dataUrl
                        });
                    }
                }
            };

            trackExecution(settings, promptId, wrappedOnProgress);
            logPipeline('INIT', 'WebSocket tracking started');

            // ============================================================================
            // TIMEOUT - Safety timeout (uses centralized config)
            // ============================================================================
            const keyframeTimeoutMs = getTimeout('KEYFRAME_GENERATION');
            const timeout = setTimeout(() => {
                if (isResolved) return;
                isResolved = true;
                const message = `${getSceneContext(promptId)} timed out (${keyframeTimeoutMs / 60000} minutes exceeded) while waiting for output`;
                logPipeline('TIMEOUT', `❌ ${message}`);
                reject(new Error(message));
            }, keyframeTimeoutMs);

            // ============================================================================
            // FALLBACK FETCH - Retrieve output from ComfyUI history API
            // ============================================================================
            const attemptFallbackFetch = async (): Promise<boolean> => {
                if (!FALLBACK_FETCH_ENABLED) {
                    logPipeline('FALLBACK', 'Fallback fetch disabled');
                    return false;
                }
                
                logPipeline('FALLBACK', `Attempting history API fetch for promptId=${promptId.slice(0, 8)}...`);
                
                try {
                    const baseUrl = getComfyUIBaseUrl(settings.comfyUIUrl);
                    const historyResponse = await fetchWithTimeout(`${baseUrl}/history/${promptId}`, {}, 10000);
                    
                    if (!historyResponse.ok) {
                        logPipeline('FALLBACK', `History API returned ${historyResponse.status}`);
                        return false;
                    }
                    
                    const historyData = await historyResponse.json();
                    const promptHistory = historyData[promptId];
                    
                    if (!promptHistory) {
                        logPipeline('FALLBACK', 'No history entry found for promptId');
                        return false;
                    }
                    
                    const status = promptHistory.status;
                    if (status?.status_str !== 'success' || !status?.completed) {
                        logPipeline('FALLBACK', `History status not complete: ${status?.status_str}`);
                        return false;
                    }
                    
                    // Extract outputs from history
                    const outputs = promptHistory.outputs || {};
                    const assetSources: Array<{ entries?: any[]; resultType: LocalGenerationAsset['type'] }> = [];
                    
                    for (const [_nodeId, nodeOutput] of Object.entries(outputs)) {
                        const output = nodeOutput as any;
                        if (output.images) assetSources.push({ entries: output.images, resultType: 'image' });
                        if (output.videos) assetSources.push({ entries: output.videos, resultType: 'video' });
                        if (output.gifs) assetSources.push({ entries: output.gifs, resultType: 'video' });
                    }
                    
                    if (assetSources.length === 0) {
                        logPipeline('FALLBACK', 'No asset sources found in history');
                        return false;
                    }
                    
                    // Download assets
                    const downloadedAssets: LocalGenerationAsset[] = [];
                    for (const source of assetSources) {
                        const entries = source.entries;
                        if (!Array.isArray(entries) || entries.length === 0) continue;
                        
                        const assets = await Promise.all(
                            entries.map(async (entry) => ({
                                type: source.resultType,
                                data: await fetchAssetAsDataURL(
                                    settings.comfyUIUrl,
                                    entry.filename,
                                    entry.subfolder,
                                    entry.type || 'output'
                                ),
                                filename: entry.filename,
                            }))
                        );
                        downloadedAssets.push(...assets);
                    }
                    
                    if (downloadedAssets.length === 0) {
                        logPipeline('FALLBACK', 'No assets downloaded from history');
                        return false;
                    }
                    
                    const primaryAsset = downloadedAssets[0];
                    if (!primaryAsset) {
                        logPipeline('FALLBACK', 'Primary asset is undefined');
                        return false;
                    }
                    
                    // Validate data URL
                    const primaryData = primaryAsset.data;
                    const isValidDataUrl = typeof primaryData === 'string' && 
                        (primaryData.startsWith('data:video/') || primaryData.startsWith('data:image/'));
                    
                    if (!isValidDataUrl) {
                        logPipeline('FALLBACK', `Downloaded asset has invalid data URL: ${typeof primaryData === 'string' ? primaryData.slice(0, 50) : typeof primaryData}`);
                        return false;
                    }
                    
                    // Success! Populate outputData
                    outputData = {
                        type: primaryAsset.type,
                        data: primaryAsset.data,
                        filename: primaryAsset.filename,
                        assets: downloadedAssets,
                    };
                    
                    if (downloadedAssets.some(a => a.type === 'image')) {
                        outputData.images = downloadedAssets.filter(a => a.type === 'image').map(a => a.data);
                        frameSequence = outputData.images;
                    }
                    
                    isAssetDownloadComplete = true;
                    logPipeline('FALLBACK', `✅ Successfully fetched ${downloadedAssets.length} assets from history`);
                    return true;
                    
                } catch (e) {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    logPipeline('FALLBACK', `❌ Fallback fetch failed: ${errMsg}`);
                    return false;
                }
            };

            // ============================================================================
            // POLLING LOOP - Main completion detection with grace period
            // ============================================================================
            const pollInterval = setInterval(async () => {
                if (isResolved) {
                    clearInterval(pollInterval);
                    return;
                }
                
                try {
                    const queueInfo = await pollQueueInfo(settings.comfyUIUrl);
                    const queueEmpty = queueInfo.queue_running === 0 && queueInfo.queue_pending === 0;
                    
                    logPipeline('POLL', `Queue status: running=${queueInfo.queue_running}, pending=${queueInfo.queue_pending}`, {
                        queueEmpty,
                        hasOutputData: !!outputData,
                        isAssetDownloadComplete,
                        gracePeriodActive: gracePeriodStartTime !== null
                    });
                    
                    // ============================================================================
                    // CASE 1: Asset download complete - resolve immediately
                    // ============================================================================
                    if (isAssetDownloadComplete && outputData) {
                        logPipeline('POLL', '✅ Asset download complete, resolving Promise');
                        
                        clearInterval(pollInterval);
                        clearTimeout(timeout);
                        isResolved = true;
                        
                        // Frame count validation
                        const MIN_FRAME_COUNT = 5;
                        const actualFrameCount = frameSequence.length;
                        if (actualFrameCount > 0 && actualFrameCount < MIN_FRAME_COUNT) {
                            const warningMsg = `${getSceneContext(promptId)} generated only ${actualFrameCount} frames (minimum ${MIN_FRAME_COUNT}). Video may be too short.`;
                            console.warn(warningMsg);
                            reportProgress({ status: 'complete', message: `⚠️ ${warningMsg}`, progress: 100 });
                        }
                        
                        const videoData = outputData.data;
                        const frameDuration = frameSequence.length > 0 ? frameSequence.length / 24 : 1.04;
                        
                        resolve({
                            videoPath: videoData,
                            duration: frameDuration,
                            filename: outputData.filename || `gemdirect1_shot_${shot.id}.mp4`,
                            frames: frameSequence.length > 0 ? frameSequence : undefined,
                            workflowMeta: (promptResponse as any)?.workflowMeta,
                            queueSnapshot: (promptResponse as any)?.queueSnapshot,
                            systemResources: resourceMessage,
                        });
                        return;
                    }
                    
                    // ============================================================================
                    // CASE 2: Queue empty but no data yet - start/continue grace period
                    // ============================================================================
                    if (queueEmpty && !isAssetDownloadComplete) {
                        if (gracePeriodStartTime === null) {
                            gracePeriodStartTime = Date.now();
                            logPipeline('GRACE', `🕐 Queue empty, starting grace period (${GRACE_PERIOD_MS / 1000}s)...`);
                            reportProgress({ 
                                status: 'running', 
                                message: 'Fetching final output...',
                                progress: 95 
                            });
                        }
                        
                        const elapsed = Date.now() - gracePeriodStartTime;
                        const remaining = Math.max(0, GRACE_PERIOD_MS - elapsed);
                        
                        logPipeline('GRACE', `Grace period: ${Math.round(elapsed / 1000)}s elapsed, ${Math.round(remaining / 1000)}s remaining`);
                        
                        // Grace period expired - try fallback then fail
                        if (elapsed >= GRACE_PERIOD_MS) {
                            logPipeline('GRACE', '⏰ Grace period expired, attempting fallback fetch...');
                            
                            const fallbackSuccess = await attemptFallbackFetch();
                            
                            if (fallbackSuccess && outputData && isAssetDownloadComplete) {
                                logPipeline('GRACE', '✅ Fallback fetch successful, resolving Promise');
                                
                                clearInterval(pollInterval);
                                clearTimeout(timeout);
                                isResolved = true;
                                
                                const videoData = outputData.data;
                                const frameDuration = frameSequence.length > 0 ? frameSequence.length / 24 : 1.04;
                                
                                resolve({
                                    videoPath: videoData,
                                    duration: frameDuration,
                                    filename: outputData.filename || `gemdirect1_shot_${shot.id}.mp4`,
                                    frames: frameSequence.length > 0 ? frameSequence : undefined,
                                    workflowMeta: (promptResponse as any)?.workflowMeta,
                                    queueSnapshot: (promptResponse as any)?.queueSnapshot,
                                    systemResources: resourceMessage,
                                });
                                return;
                            }
                            
                            // Fallback failed - reject with detailed error
                            clearInterval(pollInterval);
                            clearTimeout(timeout);
                            isResolved = true;
                            
                            const errorMsg = `${getSceneContext(promptId)} grace period expired (${GRACE_PERIOD_MS / 1000}s) and fallback fetch failed. No valid video data received.`;
                            logPipeline('GRACE', `❌ ${errorMsg}`);
                            reportProgress({ status: 'error', message: errorMsg });
                            reject(new Error(errorMsg));
                            return;
                        }
                    }
                    
                    // ============================================================================
                    // CASE 3: Queue not empty - reset grace period and continue polling
                    // ============================================================================
                    if (!queueEmpty && gracePeriodStartTime !== null) {
                        logPipeline('POLL', 'Queue no longer empty, resetting grace period');
                        gracePeriodStartTime = null;
                    }
                    
                } catch (e) {
                    // Don't fail on transient poll errors during grace period
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    logPipeline('POLL', `⚠️ Poll error (continuing): ${errorMessage}`);
                    
                    // Only fail if we're not in grace period and error persists
                    if (gracePeriodStartTime === null) {
                        // First poll error - be lenient, start a mini grace period
                        gracePeriodStartTime = Date.now();
                        logPipeline('POLL', 'Poll error triggered mini grace period');
                    }
                }
            }, POLL_INTERVAL_MS);
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const contextMessage = `${getSceneContext()} video generation failed: ${message}`;
        reportProgress({
            status: 'error',
            message: contextMessage,
        });
        throw new Error(contextMessage);
    }
};

type GenerateVideoFromShotFn = typeof generateVideoFromShot;

// ============================================================================
// FLUX Prompt Templates
// ============================================================================

/**
 * Original SINGLE_FRAME_PROMPT (500+ chars)
 * Contains cinematography terms that FLUX doesn't understand well.
 * Kept for backward compatibility with video models.
 */
const SINGLE_FRAME_PROMPT = 'SINGLE CONTINUOUS WIDE-ANGLE SHOT: Generate EXACTLY ONE UNIFIED CINEMATIC SCENE showing a SINGLE MOMENT across the ENTIRE 16:9 frame WITHOUT ANY DIVISIONS, REFLECTIONS, OR LAYERED COMPOSITIONS. PANORAMIC VIEW of ONE LOCATION with consistent lighting and unified perspective from top to bottom, left to right. The entire frame must show ONE CONTINUOUS ENVIRONMENT - no horizontal lines dividing the image, no mirrored sections, no before-after comparisons. DO NOT create character sheets, product grids, split-screens, multi-panel layouts, or storyboard panels. This is ONE UNBROKEN WIDE-ANGLE SHOT capturing the full environment with seamless unified composition. Ensure well-lit scene with visible details and balanced exposure.';

/**
 * Simplified FLUX prompt (~200 chars)
 * Optimized for FLUX T2I model:
 * - Removes cinematography terms (Steadicam, low-angle, etc.) that FLUX ignores
 * - Focuses on composition and avoiding grid/split artifacts
 * - More direct, descriptive language
 */
export const FLUX_SIMPLE_PROMPT = 'Single unified scene showing one continuous moment. Wide landscape composition, 16:9 aspect ratio. Natural lighting, detailed environment. One location, consistent perspective throughout the entire frame. No panels, no grid, no split-screen.';

/**
 * Get the appropriate single-frame prompt based on settings/context.
 * Uses simplified FLUX prompt when keyframePromptPipeline flag is enabled.
 */
export const getSingleFramePrompt = (featureFlags?: { keyframePromptPipeline?: boolean }): string => {
    // Use simplified prompt when the new keyframe pipeline is enabled
    if (featureFlags?.keyframePromptPipeline) {
        return FLUX_SIMPLE_PROMPT;
    }
    return SINGLE_FRAME_PROMPT;
};

// ORIGINAL (900+ chars) - kept for fallback/comparison
export const NEGATIVE_GUIDANCE_VERBOSE = 'AVOID AT ALL COSTS: split-screen, multi-panel layout, divided frame, panel borders, storyboard panels, multiple scenes in one image, comic strip layout, triptych, diptych, before and after comparison, side by side shots, top and bottom split, left and right split, grid layout, mosaic, composite image, collage, multiple perspectives, repeated subjects, duplicated elements, mirrored composition, reflection symmetry, tiled pattern, sequential images, montage, multiple time periods, multiple locations, frame divisions, panel separators, white borders, black borders, frame-within-frame, picture-in-picture, multiple lighting setups, discontinuous composition, fragmented scene, segmented layout, partitioned image, multiple narratives, split composition, dual scene, multiple shots combined, storyboard format, comic panel style, sequence of events, time progression, location changes, speech bubbles, UI overlays, interface elements, textual callouts';

// OPTIMIZED v5 (520 chars) - added identity preservation terms to prevent character morphing and face degradation
export const NEGATIVE_GUIDANCE = 'split-screen, multi-panel, grid layout, character sheet, product catalog, symmetrical array, repeated elements, duplicated subjects, storyboard, comic layout, collage, multiple scenes, side-by-side, tiled images, panel borders, manga style, separated frames, before-after comparison, sequence panels, dual perspective, fragmented scene, picture-in-picture, montage, reflection, mirrored composition, horizontal symmetry, vertical symmetry, above-below division, sky-ground split, morphing face, identity shift, changing features, inconsistent appearance, face distortion, melting features, blurry face, smudged details, warped anatomy, drifting identity';

export const extendNegativePrompt = (base: string): string => (base && base.trim().length > 0 ? `${base}, ${NEGATIVE_GUIDANCE}` : NEGATIVE_GUIDANCE);

/**
 * Builds a human-readable prompt for a shot with creative enhancers.
 * This format is optimized for video generation models.
 */
export const buildShotPrompt = (
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    settings: LocalGenerationSettings,
    sceneId?: string,
    shotId?: string,
    target: PromptTarget = 'shotImage',
    transitionContext?: SceneTransitionContext | null,
    shotTransitionContext?: ShotTransitionContext | null,
    narrativeContext?: string | null
): string => {
    const heroArcSegmentParts: string[] = [];
    if (shot.arcId) {
        heroArcSegmentParts.push(`Hero arc reference: ${shot.arcId}`);
    }
    if (shot.arcName) {
        heroArcSegmentParts.push(`Hero arc name: ${shot.arcName}`);
    }
    if (shot.heroMoment) {
        heroArcSegmentParts.push('Heroic focal moment');
    }
    const heroArcSegment = heroArcSegmentParts.filter(Boolean).join('; ');

    const purposeSegment = shot.purpose ? `Shot purpose: ${shot.purpose}` : '';
    const baseParts = [SINGLE_FRAME_PROMPT, shot.description, purposeSegment, heroArcSegment].filter(Boolean);
    let basePrompt = baseParts.join(' ');

    // Add creative enhancers if provided
    if (enhancers && Object.keys(enhancers).length > 0) {
        const enhancerParts: string[] = [];
        
        if (enhancers.framing && enhancers.framing.length > 0) {
            enhancerParts.push(`Framing: ${enhancers.framing.join(', ')}`);
        }
        if (enhancers.movement && enhancers.movement.length > 0) {
            enhancerParts.push(`Movement: ${enhancers.movement.join(', ')}`);
        }
        if (enhancers.lens && enhancers.lens.length > 0) {
            enhancerParts.push(`Lens: ${enhancers.lens.join(', ')}`);
        }
        if (enhancers.lighting && enhancers.lighting.length > 0) {
            enhancerParts.push(`Lighting: ${enhancers.lighting.join(', ')}`);
        }
        if (enhancers.mood && enhancers.mood.length > 0) {
            enhancerParts.push(`Mood: ${enhancers.mood.join(', ')}`);
        }
        if (enhancers.vfx && enhancers.vfx.length > 0) {
            enhancerParts.push(`VFX: ${enhancers.vfx.join(', ')}`);
        }
        if (enhancers.pacing && enhancers.pacing.length > 0) {
            enhancerParts.push(`Pacing: ${enhancers.pacing.join(', ')}`);
        }

        if (enhancerParts.length > 0) {
            basePrompt += ` (${enhancerParts.join('; ')})`;
        }
    }

    // Add scene transition context for narrative coherence (if provided)
    if (transitionContext) {
        const transitionPrompt = formatTransitionContextForPrompt(transitionContext);
        if (transitionPrompt) {
            basePrompt += ` [${transitionPrompt}]`;
        }
    }

    // Add shot-level transition context for fine-grained continuity (if provided)
    if (shotTransitionContext) {
        const shotTransitionPrompt = formatShotTransitionContextForPrompt(shotTransitionContext);
        if (shotTransitionPrompt) {
            basePrompt += ` [${shotTransitionPrompt}]`;
        }
    }
    
    // Phase 7: Add narrative coherence context for character/arc tracking
    if (narrativeContext && narrativeContext.trim().length > 0) {
        basePrompt += ` [NARRATIVE: ${narrativeContext}]`;
    }

    // Add directors vision context
    if (directorsVision) {
        basePrompt += ` Style: ${directorsVision}.`;
    }

    // Get Visual Bible context
    const visualBible = getVisualBible();
    const visualContext = getVisualContextForShot(visualBible, sceneId, shotId || shot.id);
    const styleSnippets: string[] = [];
    if (visualContext.styleBoardTitles.length > 0) {
        styleSnippets.push(visualContext.styleBoardTitles.join(', '));
    }
    if (visualContext.styleBoardTags.length > 0) {
        styleSnippets.push(`tags: ${visualContext.styleBoardTags.join(', ')}`);
    }
    const styleSegment = styleSnippets.length > 0 ? `Visual bible style cues: ${styleSnippets.join('; ')}.` : '';

    // Character context: only inject when this shot explicitly references
    // one of the characters by name in its description. This prevents
    // environment-only shots (e.g., starship fly-throughs) from inheriting
    // random character cues from other scenes.
    const charContext = getCharacterContextForShot(visualBible, sceneId, shotId || shot.id);
    const characterSnippets: string[] = [];
    const descriptionLower = (shot.description || '').toLowerCase();
    const hasExplicitCharacterMatch =
        charContext.characterNames.some(name => descriptionLower.includes(name.toLowerCase()));

    if (hasExplicitCharacterMatch) {
        if (charContext.characterNames.length > 0) {
            characterSnippets.push(`Characters: ${charContext.characterNames.join(', ')}`);
        }
        if (charContext.identityTags.length > 0) {
            characterSnippets.push(`Identity tags: ${charContext.identityTags.join(', ')}`);
        }
        if (charContext.visualTraits.length > 0) {
            characterSnippets.push(`Visual traits: ${charContext.visualTraits.join(', ')}`);
        }
    }
    const characterSegment = characterSnippets.length > 0 ? `Visual bible character cues: ${characterSnippets.join('; ')}.` : '';

    const combinedVBSegment = [styleSegment, characterSegment].filter(Boolean).join(' ');
    logPromptDebug('shot-prompt-components', {
        shotId: shotId || shot.id,
        hasCharacterCues: characterSegment.length > 0,
        hasStyleCues: styleSegment.length > 0,
        target,
    });

    // Apply prompt template with guardrails
    const modelId = resolveModelIdFromSettings(settings);
    const config = getPromptConfigForModel(modelId, target);
    const finalPrompt = applyPromptTemplate(basePrompt, combinedVBSegment, config);

    // NEW: Validate shot prompts
    const negativeBase = getDefaultNegativePromptForModel(resolveModelIdFromSettings(settings), target);
    const extendedNegative = extendNegativePrompt(negativeBase);
    const validation = validatePromptGuardrails(
        finalPrompt,
        extendedNegative,
        `Shot: ${shotId || shot.id}`
    );

    if (!validation.isValid) {
        console.error('[Shot Prompt Guardrails] Validation failed:', validation.errors);
        // For shots, log error but don't throw (allow user override)
    }

    if (validation.warnings.length > 0) {
        console.warn('[Shot Prompt Guardrails] Warnings:', validation.warnings);
    }

    return finalPrompt;
};

export interface TimelineGenerationOptions {
    dependencies?: VideoGenerationDependencies;
    shotGenerator?: GenerateVideoFromShotFn;
    /** Scene transition context for narrative coherence - applies to all shots in this scene */
    transitionContext?: SceneTransitionContext;
    /** Feature flags for enabling experimental features */
    featureFlags?: Partial<FeatureFlags>;
    /** Scene reference for building shot-level transition contexts */
    scene?: Scene;
    /** Scene keyframe reference for shot continuity */
    sceneKeyframe?: string | null;
    // Phase 7: Narrative state tracking
    /** Initial or current narrative state for continuity tracking */
    narrativeState?: NarrativeState;
    /** Story bible for narrative context initialization */
    storyBible?: StoryBible;
    /** Visual bible for character/location tracking */
    visualBible?: VisualBible;
    /** Callback to receive updated narrative state for persistence */
    onNarrativeStateUpdate?: (state: NarrativeState) => void;
    // Phase 7: IP-Adapter character consistency
    /** Character reference images for IP-Adapter injection (characterId -> base64) */
    characterReferenceImages?: Record<string, string>;
    // Bookend video endpoint snapping (post-processing)
    /** Start keyframe image for endpoint snapping (base64 or data URL) */
    startKeyframe?: string;
    /** End keyframe image for endpoint snapping (base64 or data URL) */
    endKeyframe?: string;
}


/**
 * Batch generates videos for all shots in a timeline.
 * Handles queue management and progress tracking for multiple shots.
 */
export const generateTimelineVideos = async (
    settings: LocalGenerationSettings,
    timeline: TimelineData,
    directorsVision: string,
    _sceneSummary: string,
    keyframeImages: Record<string, string>,
    onProgress?: (shotId: string, statusUpdate: Partial<LocalGenerationStatus>) => void,
    options?: TimelineGenerationOptions
): Promise<Record<string, {
    videoPath: string;
    duration: number;
    filename: string;
    frames?: string[];
    workflowMeta?: WorkflowGenerationMetadata;
    queueSnapshot?: { queue_running: number; queue_pending: number };
    systemResources?: string;
}>> => {
    
    const results: Record<string, { videoPath: string; duration: number; filename: string }> = {};
    const shotExecutor = options?.shotGenerator ?? generateVideoFromShot;
    const shotDependencies = options?.dependencies;
    const transitionContext = options?.transitionContext;
    const featureFlags = options?.featureFlags;
    const scene = options?.scene;
    const sceneKeyframe = options?.sceneKeyframe;
    
    // Check if shot-level continuity is enabled
    const useShotLevelContinuity = isFeatureEnabled(featureFlags, 'shotLevelContinuity') && scene;
    
    // Phase 7: IP-Adapter character consistency - use Visual Bible reference images for identity preservation
    const useIpAdapter = isFeatureEnabled(featureFlags, 'characterConsistency');
    
    // Phase 7: Narrative state tracking - track story elements across generations
    const useNarrativeTracking = isFeatureEnabled(featureFlags, 'narrativeStateTracking') && options?.storyBible;
    
    // Log coherence feature status for debugging incoherent video issues
    console.log('[Timeline Batch] Video coherence features status:', {
        shotLevelContinuity: useShotLevelContinuity,
        ipAdapter: useIpAdapter,
        narrativeTracking: useNarrativeTracking,
        hasScene: !!scene,
        hasSceneKeyframe: !!sceneKeyframe,
        hasStoryBible: !!options?.storyBible,
        hasVisualBible: !!options?.visualBible,
        hasCharacterRefs: Object.keys(options?.characterReferenceImages || {}).length,
        keyframeCount: Object.keys(keyframeImages).length,
        shotCount: timeline.shots.length,
        // Flag potential coherence issues
        warnings: [
            !scene && 'No scene context - shot continuity disabled',
            !sceneKeyframe && 'No scene keyframe - visual continuity may be reduced',
            !options?.storyBible && 'No story bible - narrative tracking disabled',
            Object.keys(keyframeImages).length < timeline.shots.length && 'Some shots missing keyframes',
        ].filter(Boolean)
    });
    let narrativeState = options?.narrativeState;
    
    // Check if GenerationQueue is enabled for VRAM-safe serial execution
    const useGenerationQueue = isFeatureEnabled(featureFlags, 'useGenerationQueue');
    if (useGenerationQueue) {
        console.log('[Timeline Batch] GenerationQueue enabled - shots will be queued serially to prevent VRAM exhaustion');
    }
    
    // Initialize narrative state from story bible if not provided
    if (useNarrativeTracking && !narrativeState && options?.storyBible) {
        narrativeState = createInitialNarrativeState(options.storyBible, options.visualBible);
        console.log('[Timeline Batch] Initialized narrative state tracking:', {
            characters: Object.keys(narrativeState.characters).length,
            emotionalPhase: narrativeState.emotionalArc.currentPhase
        });
        // Notify caller of initial state for persistence
        options?.onNarrativeStateUpdate?.(narrativeState);
    }
    
    // Update narrative state for this scene
    if (useNarrativeTracking && narrativeState && scene) {
        narrativeState = updateNarrativeStateForScene(narrativeState, scene, options?.visualBible);
        const summary = generateNarrativeStateSummary(narrativeState, scene.id, options?.visualBible);
        console.log('[Timeline Batch] Scene narrative context:', {
            activeCharacters: summary.activeCharacters.length,
            warnings: summary.warnings.length,
            emotionalGuidance: summary.emotionalGuidance?.slice(0, 50)
        });
        // Notify caller of updated state for persistence
        options?.onNarrativeStateUpdate?.(narrativeState);
    }
    
    for (let i = 0; i < timeline.shots.length; i++) {
        const shot = timeline.shots[i];
        if (!shot) {
            console.warn(`[Timeline Batch] Shot at index ${i} is undefined, skipping`);
            continue;
        }
        const enhancers = timeline.shotEnhancers[shot.id];
        const keyframe = keyframeImages[shot.id] || null;
        const allowCharacterContinuity = shouldInjectCharacterContinuity(shot, options?.visualBible, scene?.id);
        
        // Build shot-level transition context if enabled
        let shotTransitionContext: ShotTransitionContext | undefined;
        if (useShotLevelContinuity && scene) {
            try {
                shotTransitionContext = buildShotTransitionContext(scene, i, sceneKeyframe);
                console.log(`[Timeline Batch] Built shot transition context for shot ${i + 1}:`, {
                    narrativePosition: shotTransitionContext.narrativePosition,
                    hasPreviousShot: !!shotTransitionContext.previousShotDescription,
                    continuityElements: shotTransitionContext.visualContinuity.length
                });
            } catch (e) {
                console.warn(`[Timeline Batch] Failed to build shot transition context for shot ${i}:`, e);
            }
        }
        
        // Phase 7: Build narrative context for prompt injection (only when shot warrants character continuity)
        let narrativePromptContext: string | undefined;
        if (useNarrativeTracking && narrativeState && scene && allowCharacterContinuity) {
            try {
                const narrativeSummary = generateNarrativeStateSummary(narrativeState, scene.id, options?.visualBible);
                narrativePromptContext = formatNarrativeStateForPrompt(narrativeSummary);
                
                // Update narrative state for this shot (tracks character appearances, etc.)
                narrativeState = updateNarrativeStateForShot(narrativeState, shot, scene.id, options?.visualBible);
                // Notify caller of updated state for persistence
                options?.onNarrativeStateUpdate?.(narrativeState);
            } catch (e) {
                console.warn(`[Timeline Batch] Failed to build narrative context for shot ${i}:`, e);
            }
        }

        try {
            console.log(`[Timeline Batch] Processing shot ${i + 1}/${timeline.shots.length}: ${shot.id}`);
            
            if (onProgress) {
                onProgress(shot.id, {
                    status: 'running',
                    message: `Generating shot ${i + 1}/${timeline.shots.length}...`
                });
            }

            // Define the shot execution function
            const executeShotGeneration = () => shotExecutor(
                settings,
                shot,
                enhancers,
                directorsVision,
                keyframe,
                (update) => onProgress?.(shot.id, update),
                shotDependencies,
                {
                    negativePrompt: timeline.negativePrompt,
                    transitionContext: transitionContext,
                    shotTransitionContext: shotTransitionContext,
                    narrativeContext: narrativePromptContext,
                    characterReferenceImages: useIpAdapter && allowCharacterContinuity ? options?.characterReferenceImages : undefined,
                    visualBible: useIpAdapter && allowCharacterContinuity ? options?.visualBible : undefined,
                    scene: useIpAdapter && allowCharacterContinuity ? scene : undefined,
                }
            );

            let result;
            if (useGenerationQueue) {
                // Route through GenerationQueue for VRAM-safe serial execution
                const queue = getGenerationQueue();
                const task = createVideoTask(
                    executeShotGeneration,
                    {
                        sceneId: scene?.id || 'unknown',
                        shotId: shot.id,
                        priority: 'normal',
                        onProgress: (progress, message) => onProgress?.(shot.id, { progress, message }),
                        onStatusChange: (status: GenerationStatus) => {
                            if (status === 'running') {
                                onProgress?.(shot.id, { status: 'running', message: `Queue: executing shot ${i + 1}` });
                            } else if (status === 'pending') {
                                onProgress?.(shot.id, { status: 'queued', message: `Queue: waiting to execute shot ${i + 1}` });
                            }
                        },
                    }
                );
                console.log(`[Timeline Batch] Queueing shot ${shot.id} via GenerationQueue`);
                result = await queue.enqueue(task);
            } else {
                // Direct execution (legacy behavior)
                result = await executeShotGeneration();
            }

            // ============================================================================
            // POST-PROCESSING: Endpoint Snapping (if enabled and supported)
            // ============================================================================
            const videoProfileId = settings.videoWorkflowProfile || 'wan-i2v';
            const workflowProfile = settings.workflowProfiles?.[videoProfileId];
            const postProcessing = workflowProfile?.postProcessing;
            
            // Check if endpoint snapping is enabled (default true for bookend workflows like wan-flf2v)
            const isBookendWorkflow = videoProfileId.includes('flf2v') || videoProfileId.includes('bookend');
            const snapEnabled = postProcessing?.snapEndpointsToKeyframes ?? isBookendWorkflow;
            
            // Get start and end keyframes for snapping
            const startKeyframe = options?.startKeyframe || sceneKeyframe;
            const endKeyframe = options?.endKeyframe;
            
            if (snapEnabled && result.videoPath && startKeyframe && endKeyframe && isEndpointSnappingSupported()) {
                try {
                    console.log(`[Timeline Batch] Applying endpoint snapping for shot ${shot.id}...`);
                    onProgress?.(shot.id, { status: 'running', message: 'Applying endpoint snapping...' });
                    
                    // Convert data URL to blob
                    const videoBlob = base64ToBlob(
                        result.videoPath.replace(/^data:video\/[^;]+;base64,/, ''),
                        'video/mp4'
                    );
                    
                    const snappingOptions: EndpointSnappingOptions = {
                        startFrameCount: postProcessing?.startFrameCount ?? 1,
                        endFrameCount: postProcessing?.endFrameCount ?? 1,
                        blendMode: postProcessing?.blendMode ?? 'hard',
                        fadeFrames: postProcessing?.fadeFrames ?? 3,
                    };
                    
                    const snapResult = await snapEndpointsToKeyframes(
                        videoBlob,
                        startKeyframe,
                        endKeyframe,
                        snappingOptions
                    );
                    
                    if (snapResult.success && snapResult.snappedVideoUrl) {
                        // Replace the video path with the snapped version
                        result.videoPath = snapResult.snappedVideoUrl;
                        console.log(`[Timeline Batch] ✅ Endpoint snapping applied: ${snapResult.startFramesReplaced} start, ${snapResult.endFramesReplaced} end frames replaced (${snapResult.processingTimeMs.toFixed(0)}ms)`);
                    } else {
                        console.warn(`[Timeline Batch] ⚠️ Endpoint snapping failed: ${snapResult.error}`);
                        // Continue with original video - snapping failure is non-fatal
                    }
                } catch (snapError) {
                    const msg = snapError instanceof Error ? snapError.message : String(snapError);
                    console.warn(`[Timeline Batch] ⚠️ Endpoint snapping error (non-fatal): ${msg}`);
                    // Continue with original video
                }
            } else if (snapEnabled && (!startKeyframe || !endKeyframe)) {
                console.log(`[Timeline Batch] ⏭️ Skipping endpoint snapping: missing ${!startKeyframe ? 'start' : 'end'} keyframe`);
            }

            results[shot.id] = result;
            
            if (onProgress) {
                onProgress(shot.id, {
                    status: 'complete',
                    message: `Shot ${i + 1} complete!`
                });
            }

            // Small delay between shots to avoid overwhelming the queue
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            // Extract original error message - CSGError wraps the original in context
            let errorMsg: string;
            if (error instanceof CSGError && error.context?.originalError) {
                errorMsg = String(error.context.originalError);
            } else if (error instanceof Error) {
                errorMsg = error.message;
            } else {
                errorMsg = String(error);
            }
            console.error(`[Timeline Batch] Failed to generate shot ${shot.id}:`, errorMsg);
            
            if (onProgress) {
                onProgress(shot.id, {
                    status: 'error',
                    message: `Failed: ${errorMsg}`
                });
            }

            // Continue with next shot instead of failing entire timeline
            results[shot.id] = {
                videoPath: '',
                duration: 0,
                filename: `ERROR_${shot.id}.mp4`
            };
        }
    }

    return results;
};

export const stripDataUrlPrefix = (value: string): string => {
    if (!value.startsWith('data:')) {
        return value;
    }
    const [, base64] = value.split(',');
    return base64 ?? value;
};

const waitForComfyCompletion = (
    settings: LocalGenerationSettings,
    promptId: string,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<LocalGenerationStatus['final_output']> => {
    return new Promise((resolve, reject) => {
        // ARCHITECTURE FIX: Use a mutex pattern to prevent dual resolution
        // Both WebSocket and polling can detect completion - only the first should resolve
        let resolutionState: 'pending' | 'resolving' | 'resolved' = 'pending';
        
        const tryResolve = (output: LocalGenerationStatus['final_output'], source: 'websocket' | 'polling'): boolean => {
            if (resolutionState !== 'pending') {
                console.log(`[waitForComfyCompletion] ⚠️ Ignoring ${source} resolution - already ${resolutionState} for ${promptId.slice(0,8)}...`);
                return false;
            }
            resolutionState = 'resolving';
            console.log(`[waitForComfyCompletion] ✓ Resolving Promise for ${promptId.slice(0,8)}... (via ${source})`);
            cleanup();
            onProgress?.({ status: 'complete', message: 'Generation complete!', final_output: output });
            resolve(output);
            resolutionState = 'resolved';
            return true;
        };
        
        const tryReject = (error: Error, source: 'websocket' | 'polling' | 'timeout'): boolean => {
            if (resolutionState !== 'pending') {
                console.log(`[waitForComfyCompletion] ⚠️ Ignoring ${source} rejection - already ${resolutionState} for ${promptId.slice(0,8)}...`);
                return false;
            }
            resolutionState = 'resolving';
            console.log(`[waitForComfyCompletion] ✗ Rejecting Promise for ${promptId.slice(0,8)}... (via ${source})`);
            cleanup();
            reject(error);
            resolutionState = 'resolved';
            return true;
        };
        
        const cleanup = () => {
            clearTimeout(timeout);
            clearInterval(pollingInterval);
        };
        
        // Use centralized timeout config - can be overridden for tests
        const generationTimeoutMs = getTimeout('GENERATION');
        const timeout = setTimeout(() => {
            tryReject(new Error(`ComfyUI generation timeout (${generationTimeoutMs / 60000} minutes exceeded).`), 'timeout');
        }, generationTimeoutMs);

        // Polling fallback: Check history API every 2 seconds if WebSocket doesn't deliver completion
        // This handles cases where multiple WebSocket connections cause event routing issues
        let wsReceivedEvents = false;
        console.log(`[waitForComfyCompletion] 🔄 Starting polling fallback for ${promptId.slice(0,8)}... (checking every 2s)`);
        const pollingInterval = setInterval(async () => {
            if (resolutionState !== 'pending') {
                console.log(`[waitForComfyCompletion] ⏹️  Stopping polling for ${promptId.slice(0,8)}... (${resolutionState})`);
                clearInterval(pollingInterval);
                return;
            }

            console.log(`[waitForComfyCompletion] 🔍 Polling history API for ${promptId.slice(0,8)}... (wsEvents=${wsReceivedEvents})`);
            try {
                const baseUrl = getComfyUIBaseUrl(settings.comfyUIUrl);
                const historyResponse = await fetchWithTimeout(`${baseUrl}/history/${promptId}`, {}, 5000);
                
                if (!historyResponse.ok) {
                    // Prompt not in history yet, continue polling
                    return;
                }

                const historyData = await historyResponse.json();
                const promptHistory = historyData[promptId];

                if (!promptHistory) {
                    // No history entry yet
                    return;
                }

                const status = promptHistory.status;
                if (status?.status_str === 'success' && status?.completed) {
                    // Check if already resolved before doing expensive work
                    if (resolutionState !== 'pending') {
                        return;
                    }
                    
                    // Execution completed! Fetch outputs
                    console.log(`[waitForComfyCompletion] 📊 Polling detected completion for ${promptId.slice(0,8)}... (WebSocket events: ${wsReceivedEvents ? 'received' : 'MISSING'})`);
                    
                    const outputs = promptHistory.outputs || {};
                    const assetSources: Array<{ entries?: any[]; resultType: LocalGenerationAsset['type'] }> = [];
                    
                    // Check all output nodes for images/videos
                    for (const [_nodeId, nodeOutput] of Object.entries(outputs)) {
                        const output = nodeOutput as any;
                        if (output.images) assetSources.push({ entries: output.images, resultType: 'image' });
                        if (output.videos) assetSources.push({ entries: output.videos, resultType: 'video' });
                        if (output.gifs) assetSources.push({ entries: output.gifs, resultType: 'video' });
                    }

                    const downloadedAssets: LocalGenerationAsset[] = [];
                    for (const source of assetSources) {
                        const entries = source.entries;
                        if (!Array.isArray(entries) || entries.length === 0) continue;

                        // Build fetch config from settings
                        const fetchConfig: FetchAssetConfig = {
                            maxRetries: settings.comfyUIFetchMaxRetries ?? DEFAULT_FETCH_CONFIG.maxRetries,
                            timeoutMs: settings.comfyUIFetchTimeoutMs ?? DEFAULT_FETCH_CONFIG.timeoutMs,
                            retryDelayMs: settings.comfyUIFetchRetryDelayMs ?? DEFAULT_FETCH_CONFIG.retryDelayMs,
                        };

                        const assets = await Promise.all(
                            entries.map(async (entry) => ({
                                type: source.resultType,
                                data: await fetchAssetAsDataURL(
                                    settings.comfyUIUrl,
                                    entry.filename,
                                    entry.subfolder,
                                    entry.type || 'output',
                                    fetchConfig
                                ),
                                filename: entry.filename,
                            }))
                        );
                        downloadedAssets.push(...assets);
                    }

                    if (downloadedAssets.length > 0) {
                        const primaryAsset = downloadedAssets[0];
                        if (!primaryAsset) {
                            tryReject(new Error('Primary asset is undefined despite array length > 0'), 'polling');
                            return;
                        }
                        const imageAssets = downloadedAssets.filter(asset => asset.type === 'image');
                        const videoAssets = downloadedAssets.filter(asset => asset.type === 'video');
                        
                        // CRITICAL: Validate first asset has valid data URL before proceeding
                        const primaryData = primaryAsset.data;
                        const isValidDataUrl = typeof primaryData === 'string' && 
                            (primaryData.startsWith('data:video/') || primaryData.startsWith('data:image/'));
                        
                        if (!isValidDataUrl) {
                            console.error(`[waitForComfyCompletion] Invalid data URL received. Type: ${typeof primaryData}, Preview: ${typeof primaryData === 'string' ? primaryData.slice(0, 100) : 'N/A'}`);
                            tryReject(
                                new Error(`Asset fetch returned invalid data (not a data URL). Expected 'data:video/...' or 'data:image/...', received: ${typeof primaryData === 'string' ? primaryData.slice(0, 50) : typeof primaryData}`),
                                'polling'
                            );
                            return;
                        }
                        
                        const finalOutput: LocalGenerationStatus['final_output'] = {
                            type: primaryAsset.type,
                            data: primaryAsset.data,
                            filename: primaryAsset.filename,
                            assets: downloadedAssets,
                        };

                        if (imageAssets.length > 0) {
                            finalOutput.images = imageAssets.map(asset => asset.data);
                        }
                        if (videoAssets.length > 0) {
                            finalOutput.videos = videoAssets.map(asset => asset.data);
                        }

                        tryResolve(finalOutput, 'polling');
                    } else {
                        tryReject(new Error('Generation completed but no output files found.'), 'polling');
                    }
                } else if (status?.status_str === 'error') {
                    const rawError = status.messages?.find((m: any) => m[0] === 'execution_error')?.[1]?.exception_message || 'ComfyUI generation failed.';
                    const userFriendlyError = parseComfyUIError(rawError);
                    tryReject(new Error(userFriendlyError), 'polling');
                }
            } catch (error) {
                // Polling error - continue trying (don't fail the whole operation)
                console.warn(`[waitForComfyCompletion] Polling error for ${promptId.slice(0,8)}...:`, error);
            }
        }, 2000);

        trackPromptExecution(settings, promptId, (update) => {
            // Mark that WebSocket is delivering events
            wsReceivedEvents = true;
            
            // Debug logging to trace completion issues
            if (update.status === 'complete' || update.status === 'error') {
                console.log(`[waitForComfyCompletion] promptId=${promptId.slice(0,8)}... status=${update.status} hasOutput=${!!update.final_output} resolutionState=${resolutionState}`);
            }
            
            onProgress?.(update);
            if (update.status === 'complete' && update.final_output) {
                tryResolve(update.final_output, 'websocket');
            } else if (update.status === 'error') {
                tryReject(new Error(update.message || 'ComfyUI generation failed.'), 'websocket');
            }
        });
    });
};

export const generateSceneKeyframeLocally = async (
    settings: LocalGenerationSettings,
    directorsVision: string,
    sceneSummary: string,
    sceneId?: string,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<string> => {
    // Get the appropriate single-frame prompt based on feature flags
    const singleFramePrompt = getSingleFramePrompt(settings.featureFlags);
    
    const basePromptParts = [
        singleFramePrompt,
        `Scene: ${sceneSummary}`,
        // Note: Director's vision is already embedded in sceneSummary, so we don't duplicate it here
    ];
    const heroArcInfo = sceneId ? `Hero arc reference: ${sceneId}` : '';
    if (heroArcInfo) {
        basePromptParts.push(heroArcInfo);
    }
    const basePrompt = basePromptParts.filter(Boolean).join('\n');

    // Get Visual Bible context
    const visualBible = getVisualBible();
    const visualContext = getVisualContextForScene(visualBible, sceneId || '');
    const styleSnippets: string[] = [];
    if (visualContext.styleBoardTitles.length > 0) {
      styleSnippets.push(visualContext.styleBoardTitles.join(', '));
    }
    if (visualContext.styleBoardTags.length > 0) {
      styleSnippets.push(`tags: ${visualContext.styleBoardTags.join(', ')}`);
    }
    const styleSegment = styleSnippets.length > 0 ? `Visual bible style cues: ${styleSnippets.join('; ')}.` : '';

    const characterContext = getCharacterContextForScene(visualBible, sceneId || '');
    const characterSnippets: string[] = [];
    if (characterContext.characterNames.length > 0) {
      characterSnippets.push(`Characters: ${characterContext.characterNames.join(', ')}`);
    }
    if (characterContext.identityTags.length > 0) {
      characterSnippets.push(`Identity tags: ${characterContext.identityTags.join(', ')}`);
    }
    if (characterContext.visualTraits.length > 0) {
      characterSnippets.push(`Visual traits: ${characterContext.visualTraits.join(', ')}`);
    }
    const characterSegment = characterSnippets.length > 0 ? `Visual bible character cues: ${characterSnippets.join('; ')}.` : '';
    const combinedVBSegment = [styleSegment, characterSegment].filter(Boolean).join(' ');

    // Apply prompt template with guardrails
    const modelId = resolveModelIdFromSettings(settings);
    const config = getPromptConfigForModel(modelId, 'sceneKeyframe');
    const finalPrompt = applyPromptTemplate(basePrompt, combinedVBSegment || '', config);

    const negativeBase = getDefaultNegativePromptForModel(resolveModelIdFromSettings(settings), 'sceneKeyframe');
    const extendedNegative = extendNegativePrompt(negativeBase);
    const payloads = {
        json: JSON.stringify({ scene_summary: sceneSummary, directors_vision: directorsVision }),
        text: finalPrompt,
        structured: [],
        negativePrompt: extendedNegative,
    };

    // NEW: Validate prompt guardrails before queuing
    const validation = validatePromptGuardrails(
        finalPrompt,
        extendedNegative,
        `Scene Keyframe: ${sceneId?.slice(0, 20) || 'unknown'}`
    );

    if (!validation.isValid) {
        console.error('[Prompt Guardrails] Validation failed:', validation.errors);
        throw new Error(`Prompt validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
        console.warn('[Prompt Guardrails] Warnings:', validation.warnings);
    }

    // Log validation success
    console.log(`[Prompt Guardrails] ✓ Validation passed for ${validation.context}`);

    // Debug logging to verify unique prompts per scene
    console.log(`[Keyframe Debug] Scene ID: ${sceneId || 'unknown'}`);
    console.log(`[Keyframe Debug] Scene Summary: ${sceneSummary.substring(0, 100)}...`);
    console.log(`[Keyframe Debug] Final Prompt Length: ${finalPrompt.length} chars`);
    console.log(`[Keyframe Debug] Prompt Preview: ${finalPrompt.substring(0, 200)}...`);

    const imageProfile = settings.imageWorkflowProfile || 'wan-t2i';
    console.log(`[generateSceneKeyframeLocally] Using image profile: ${imageProfile}`);
    const response = await queueComfyUIPrompt(settings, payloads, '', imageProfile);
    if (!response?.prompt_id) {
        throw new Error('Failed to queue prompt: No prompt_id returned.');
    }
    console.log(`[generateSceneKeyframeLocally] ✓ Queued promptId=${response.prompt_id.slice(0,8)}... for scene=${sceneId}`);
    
    if (response.systemResources && response.systemResources.trim()) {
        onProgress?.({ status: 'running', message: response.systemResources });
    }

    console.log(`[generateSceneKeyframeLocally] ⏳ Waiting for completion of scene=${sceneId}, promptId=${response.prompt_id.slice(0,8)}...`);
    const finalOutput = await waitForComfyCompletion(settings, response.prompt_id, onProgress);
    
    if (!finalOutput?.data) {
        console.error(`[generateSceneKeyframeLocally] ❌ No image data returned for scene=${sceneId}, promptId=${response.prompt_id.slice(0,8)}...`);
        throw new Error('ComfyUI did not return an image.');
    }
    
    const imageData = stripDataUrlPrefix(finalOutput.data);
    console.log(`[generateSceneKeyframeLocally] ✅ Returning image for scene=${sceneId}, data length=${imageData.length} chars`);
    return imageData;
};

export const generateShotImageLocally = async (
    settings: LocalGenerationSettings,
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    sceneSummary: string,
    sceneId?: string,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<string> => {
    const shotPrompt = buildShotPrompt(shot, enhancers, directorsVision, settings, sceneId, shot.id, 'shotImage');
    const payloads = {
        json: JSON.stringify({ shot_id: shot.id, scene_summary: sceneSummary }),
        text: shotPrompt,
        structured: [],
        negativePrompt: extendNegativePrompt(getDefaultNegativePromptForModel(resolveModelIdFromSettings(settings), 'shotImage')),
    };

    const imageProfile = settings.imageWorkflowProfile || 'wan-t2i';
    console.log(`[generateShotImageLocally] Using image profile: ${imageProfile}`);
    const response = await queueComfyUIPrompt(settings, payloads, '', imageProfile);
    if (!response?.prompt_id) {
        throw new Error('Failed to queue prompt: No prompt_id returned.');
    }
    if (response.systemResources && response.systemResources.trim()) {
        onProgress?.({ status: 'running', message: response.systemResources });
    }

    const finalOutput = await waitForComfyCompletion(settings, response.prompt_id, onProgress);
    if (!finalOutput?.data) {
        throw new Error('ComfyUI did not return an image.');
    }

    return stripDataUrlPrefix(finalOutput.data);
};

/**
 * Bookend Workflow: Generate start and end keyframes for a scene
 * @param settings ComfyUI configuration
 * @param scene Scene with temporalContext
 * @param storyBible Story bible for narrative context
 * @param directorsVision Visual style guide
 * @param negativePrompt Negative prompt to apply
 * @param logApiCall API call logging function
 * @param onStateChange State change callback
 * @returns Object with start and end base64 images
 */
export async function generateSceneBookendsLocally(
    settings: LocalGenerationSettings,
    scene: Scene,
    storyBible: string,
    directorsVision: string,
    negativePrompt: string,
    _logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void
): Promise<{ start: string; end: string }> {
    console.log(`[Bookend Generation] Starting dual keyframe generation for scene ${scene.id}`);
    
    if (!scene.temporalContext) {
        throw new Error(`Scene ${scene.id} requires temporalContext for bookend generation`);
    }

    // Import payload service dynamically to avoid circular dependency
    const { generateBookendPayloads } = await import('./payloadService');
    
    const payloads = generateBookendPayloads(
        scene.summary,
        storyBible,
        directorsVision,
        scene.temporalContext,
        negativePrompt
    );

    // Generate start keyframe
    console.log(`[Bookend Generation] Generating START keyframe (moment: "${scene.temporalContext.startMoment}")`);
    onStateChange({ 
        status: 'running', 
        message: `Generating start keyframe: ${scene.temporalContext.startMoment}` 
    });
    
    const startResponse = await queueComfyUIPrompt(
        settings,
        payloads.start as any,
        '', // No input image for T2I
        settings.imageWorkflowProfile || 'wan-t2i'
    );

    if (!startResponse?.prompt_id) {
        throw new Error('Failed to queue start keyframe generation');
    }

    const startOutput = await waitForComfyCompletion(
        settings,
        startResponse.prompt_id,
        onStateChange
    );

    if (!startOutput?.data) {
        throw new Error('Start keyframe generation failed: No output data');
    }

    const startImage = stripDataUrlPrefix(startOutput.data);
    console.log(`[Bookend Generation] START keyframe generated (${startImage.length} chars)`);

    // Generate end keyframe
    console.log(`[Bookend Generation] Generating END keyframe (moment: "${scene.temporalContext.endMoment}")`);
    onStateChange({ 
        status: 'running', 
        message: `Generating end keyframe: ${scene.temporalContext.endMoment}` 
    });
    
    const endResponse = await queueComfyUIPrompt(
        settings,
        payloads.end as any,
        '', // No input image for T2I
        settings.imageWorkflowProfile || 'wan-t2i'
    );

    if (!endResponse?.prompt_id) {
        throw new Error('Failed to queue end keyframe generation');
    }

    const endOutput = await waitForComfyCompletion(
        settings,
        endResponse.prompt_id,
        onStateChange
    );

    if (!endOutput?.data) {
        throw new Error('End keyframe generation failed: No output data');
    }

    const endImage = stripDataUrlPrefix(endOutput.data);
    console.log(`[Bookend Generation] END keyframe generated (${endImage.length} chars)`);
    console.log(`[Bookend Generation] ✅ Dual keyframe generation complete for scene ${scene.id}`);

    return { 
        start: startImage, 
        end: endImage 
    };
}

/**
 * Bookend Workflow: Generate a single keyframe (start or end) for bookend mode
 * Used when user wants to generate keyframes separately
 * @param settings ComfyUI configuration
 * @param scene Scene with temporalContext
 * @param storyBible Story bible context
 * @param directorsVision Visual style guide
 * @param negativePrompt Negative prompt to apply
 * @param which 'start' or 'end' keyframe to generate
 * @param existingBookend The other keyframe if already generated (for partial update)
 * @param logApiCall API call logging function
 * @param onStateChange State change callback
 * @returns Updated bookend object with start and end base64 images
 */
export async function generateSingleBookendLocally(
    settings: LocalGenerationSettings,
    scene: Scene,
    storyBible: string,
    directorsVision: string,
    negativePrompt: string,
    which: 'start' | 'end',
    existingBookend: { start?: string; end?: string } | null,
    _logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void
): Promise<{ start: string; end: string }> {
    console.log(`[Bookend Generation] Starting ${which.toUpperCase()} keyframe generation for scene ${scene.id}`);
    
    if (!scene.temporalContext) {
        throw new Error(`Scene ${scene.id} requires temporalContext for bookend generation`);
    }

    // Import payload service dynamically to avoid circular dependency
    const { generateBookendPayloads } = await import('./payloadService');
    
    const payloads = generateBookendPayloads(
        scene.summary,
        storyBible,
        directorsVision,
        scene.temporalContext,
        negativePrompt
    );

    const moment = which === 'start' ? scene.temporalContext.startMoment : scene.temporalContext.endMoment;
    console.log(`[Bookend Generation] Generating ${which.toUpperCase()} keyframe (moment: "${moment}")`);
    onStateChange({ 
        status: 'running', 
        message: `Generating ${which} keyframe: ${moment}` 
    });
    
    const payload = which === 'start' ? payloads.start : payloads.end;
    const response = await queueComfyUIPrompt(
        settings,
        payload as any,
        '', // No input image for T2I
        settings.imageWorkflowProfile || 'wan-t2i'
    );

    if (!response?.prompt_id) {
        throw new Error(`Failed to queue ${which} keyframe generation`);
    }

    const output = await waitForComfyCompletion(
        settings,
        response.prompt_id,
        onStateChange
    );

    if (!output?.data) {
        throw new Error(`${which.charAt(0).toUpperCase() + which.slice(1)} keyframe generation failed: No output data`);
    }

    const newImage = stripDataUrlPrefix(output.data);
    console.log(`[Bookend Generation] ${which.toUpperCase()} keyframe generated (${newImage.length} chars)`);
    console.log(`[Bookend Generation] ✅ Single keyframe generation complete for scene ${scene.id}`);

    // Return combined bookend with existing + new keyframe
    if (which === 'start') {
        return { 
            start: newImage, 
            end: existingBookend?.end || '' 
        };
    } else {
        return { 
            start: existingBookend?.start || '', 
            end: newImage 
        };
    }
}

/**
 * Bookend Workflow: Generate video from start and end keyframes
 * @param settings ComfyUI configuration
 * @param scene Scene with bookend keyframes
 * @param timeline Timeline data
 * @param bookends Start and end keyframe images
 * @param directorsVision Director's vision style guide for video generation
 * @param logApiCall API call logging function
 * @param onStateChange State change callback
 * @returns Video file path or base64
 */
export async function generateVideoFromBookends(
    settings: LocalGenerationSettings,
    scene: Scene,
    timeline: TimelineData,
    bookends: { start: string; end: string },
    directorsVision: string,
    _logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void
): Promise<string> {
    console.log(`[Bookend Video] Starting video generation with dual keyframes for scene ${scene.id}`);
    
    // Import payload service
    const { generateVideoRequestPayloads } = await import('./payloadService');
    
    const payloads = generateVideoRequestPayloads(
        timeline,
        directorsVision,
        scene.summary,
        {} // generatedShotImages
    );

    // Note: Requires wan-i2v-bookends profile with dual LoadImage mapping
    // Workflow must accept both start and end images
    // For now, uses single keyframe (start) until bookend workflow is created
    console.warn(`[Bookend Video] Using start keyframe only - bookend video workflow not yet implemented`);
    
    const response = await queueComfyUIPrompt(
        settings,
        payloads,
        bookends.start, // Use start frame for now
        settings.videoWorkflowProfile || 'wan-i2v'
    );

    if (!response?.prompt_id) {
        throw new Error('Failed to queue video generation');
    }

    const output = await waitForComfyCompletion(
        settings,
        response.prompt_id,
        onStateChange
    );

    if (!output?.data) {
        throw new Error('Video generation failed: No output data');
    }

    console.log(`[Bookend Video] ✅ Video generation complete`);
    return output.data;
}

/**
 * Sequential Generation: Generate video from bookends by creating two videos and splicing
 * 
 * This approach generates two separate videos:
 * 1. First video from start keyframe (frames 0-24)
 * 2. Second video from end keyframe (frames 25-49)
 * 3. Splice them together with 1-frame crossfade
 * 
 * Used when WAN2 doesn't support dual keyframes natively.
 * 
 * @param settings ComfyUI configuration
 * @param scene Scene with temporalContext
 * @param timeline Timeline data for shot metadata
 * @param bookends Start and end keyframe images (base64)
 * @param directorsVision Director's vision style guide for video generation
 * @param logApiCall API call logging function
 * @param onStateChange State change callback with phase tracking
 * @returns Promise<string> - Path to spliced video file
 */
export async function generateVideoFromBookendsSequential(
    settings: LocalGenerationSettings,
    scene: Scene,
    timeline: TimelineData,
    bookends: { start: string; end: string },
    directorsVision: string,
    _logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void
): Promise<string> {
    console.log(`[Sequential Bookend] Starting sequential generation for scene ${scene.id}`);
    
    // Validate inputs
    if (!bookends.start || !bookends.end) {
        throw new Error('Both start and end keyframes are required for sequential generation');
    }
    
    // Import dependencies
    const { generateVideoRequestPayloads } = await import('./payloadService');
    
    let spliceVideos: (v1: string, v2: string, out: string) => Promise<{ success: boolean; outputPath?: string; duration?: number; error?: string }>;
    let checkFfmpegAvailable: () => Promise<boolean>;
    
    // Check environment - if browser, use mocks to allow UI testing
    if (typeof window !== 'undefined') {
        console.log('[Sequential Bookend] Browser environment detected, using mock splicer');
        checkFfmpegAvailable = async () => true;
        spliceVideos = async (v1: string, _v2: string, _out: string) => ({ 
            success: true, 
            outputPath: v1, 
            duration: 0 
        });
    } else {
        try {
            const module = await import('../utils/videoSplicer');
            spliceVideos = module.spliceVideos;
            checkFfmpegAvailable = module.checkFfmpegAvailable;
        } catch (e) {
            console.warn('Video splicer module not available:', e);
            checkFfmpegAvailable = async () => false;
            spliceVideos = async () => ({ success: false, error: 'Module not loaded' });
        }
    }
    
    // Check ffmpeg availability
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
        throw new Error('ffmpeg is required for sequential generation. Please install ffmpeg and add it to PATH.');
    }
    
    // Generate payloads for video generation
    const payloads = generateVideoRequestPayloads(
        timeline,
        directorsVision,
        scene.summary,
        {} // generatedShotImages
    );
    
    // Phase 1: Generate video from start keyframe
    const videoProfileId = settings.videoWorkflowProfile || DEFAULT_WORKFLOW_PROFILE_ID;
    console.log(`[Sequential Bookend] Phase 1: Generating video from START keyframe using profile: ${videoProfileId}`);
    onStateChange({ 
        phase: 'bookend-start-video',
        status: 'running', 
        progress: 0,
        message: `Generating start video (${scene.temporalContext?.startMoment || 'opening moment'})` 
    });
    
    const startPromptResponse = await queueComfyUIPrompt(
        settings,
        payloads,
        bookends.start,
        videoProfileId
    );

    if (!startPromptResponse?.prompt_id) {
        throw new Error('Failed to queue start video generation');
    }

    const startOutput = await waitForComfyCompletion(
        settings,
        startPromptResponse.prompt_id,
        (state) => {
            // Only forward progress updates, not completion status (prevents premature UI completion)
            const { status: _status, final_output: _finalOutput, ...progressState } = state;
            onStateChange({
                phase: 'bookend-start-video',
                status: 'running',
                ...progressState,
                message: `Generating start video: ${state.progress || 0}%`
            });
        }
    );

    if (!startOutput?.data) {
        throw new Error('Start video generation failed: No output data');
    }
    
    const videoStartResult = startOutput.filename || 'start_video.mp4';
    
    console.log(`[Sequential Bookend] ✅ Start video generated: ${videoStartResult}`);
    
    // Phase 2: Generate video from end keyframe
    console.log(`[Sequential Bookend] Phase 2: Generating video from END keyframe`);
    onStateChange({ 
        phase: 'bookend-end-video',
        status: 'running', 
        progress: 0,
        message: `Generating end video (${scene.temporalContext?.endMoment || 'closing moment'})` 
    });
    
    const endPromptResponse = await queueComfyUIPrompt(
        settings,
        payloads,
        bookends.end,
        videoProfileId
    );

    if (!endPromptResponse?.prompt_id) {
        throw new Error('Failed to queue end video generation');
    }

    const endOutput = await waitForComfyCompletion(
        settings,
        endPromptResponse.prompt_id,
        (state) => {
            // Only forward progress updates, not completion status (prevents premature UI completion)
            const { status: _status, final_output: _finalOutput, ...progressState } = state;
            onStateChange({
                phase: 'bookend-end-video',
                status: 'running',
                ...progressState,
                message: `Generating end video: ${state.progress || 0}%`
            });
        }
    );

    if (!endOutput?.data) {
        throw new Error('End video generation failed: No output data');
    }

    const videoEndResult = endOutput.filename || 'end_video.mp4';
    
    console.log(`[Sequential Bookend] ✅ End video generated: ${videoEndResult}`);
    
    // Phase 3: Splice videos together
    console.log(`[Sequential Bookend] Phase 3: Splicing videos with crossfade`);
    onStateChange({ 
        phase: 'splicing',
        status: 'running',  // Use 'running' instead of 'processing' to match LocalGenerationStatus type
        progress: 80,
        message: 'Splicing videos with crossfade transition...' 
    });
    
    let video1Path = videoStartResult; 
    let video2Path = videoEndResult;
    const outputPath = `bookend_spliced_${Date.now()}.mp4`;
    
    // Only try to create directory in Node environment
    if (typeof window === 'undefined') {
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            // Save video data to temp files for ffmpeg
            // We use the data URL content we already downloaded
            const tempDir = path.join(process.cwd(), 'temp_videos');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            video1Path = path.join(tempDir, `temp_start_${Date.now()}.mp4`);
            video2Path = path.join(tempDir, `temp_end_${Date.now()}.mp4`);

            const startBase64 = stripDataUrlPrefix(startOutput.data);
            const endBase64 = stripDataUrlPrefix(endOutput.data);

            fs.writeFileSync(video1Path, Buffer.from(startBase64, 'base64'));
            fs.writeFileSync(video2Path, Buffer.from(endBase64, 'base64'));
            
            console.log(`[Sequential Bookend] Saved temp videos to: ${video1Path}, ${video2Path}`);

            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create temp files (likely browser env):', e);
        }
    }
    
    const spliceResult = await spliceVideos(video1Path, video2Path, outputPath);
    
    if (!spliceResult.success) {
        throw new Error(`Video splicing failed: ${spliceResult.error}`);
    }
    
    console.log(`[Sequential Bookend] ✅ Splicing complete: ${spliceResult.outputPath}`);
    
    // If browser mock, return the data URL of the first video so it can be displayed
    if (typeof window !== 'undefined') {
        // CRITICAL: Log what we're returning for debugging video display issues
        const returnValue = startOutput.data;
        console.log(`[Sequential Bookend] 🎬 Returning video data URL (browser mode)`, {
            hasData: !!returnValue,
            dataType: typeof returnValue,
            isDataUrl: typeof returnValue === 'string' && returnValue.startsWith('data:'),
            dataPrefix: typeof returnValue === 'string' ? returnValue.slice(0, 60) : 'N/A'
        });
        return returnValue;
    }

    return spliceResult.outputPath!;
}

/**
 * Native Bookend Workflow: Generate video using FLF2V or FunInpaint nodes
 * 
 * This is the preferred method for bookend video generation as it uses ComfyUI's native
 * dual-keyframe interpolation without requiring FFmpeg post-processing.
 * 
 * Supports multiple workflow variants:
 * - wan-flf2v: Uses WanFirstLastFrameToVideo (14B) or Wan22FirstLastFrameToVideoLatent* (5B)
 * - wan-fun-inpaint: Uses WanFunInpaintToVideo for smoother motion
 * 
 * @param settings ComfyUI configuration
 * @param scene Scene with temporalContext
 * @param timeline Timeline data for shot metadata
 * @param bookends Start and end keyframe images (base64)
 * @param logApiCall API call logging function
 * @param onStateChange State change callback with phase tracking
 * @param profileId Workflow profile ID ('wan-flf2v' or 'wan-fun-inpaint')
 * @returns Promise<string> - Video data URL
 */
export async function generateVideoFromBookendsNative(
    settings: LocalGenerationSettings,
    scene: Scene,
    timeline: TimelineData,
    bookends: { start: string; end: string },
    directorsVision: string,
    _logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void,
    profileId: 'wan-flf2v' | 'wan-fun-inpaint' = 'wan-fun-inpaint'
): Promise<string> {
    console.log(`[Native Bookend] Starting native dual-keyframe generation for scene ${scene.id} using ${profileId}`);
    
    // Validate inputs
    if (!bookends.start || !bookends.end) {
        throw new Error('Both start and end keyframes are required for native bookend generation');
    }
    
    // Import payload service
    const { generateVideoRequestPayloads } = await import('./payloadService');
    
    // Generate payloads for video generation
    const payloads = generateVideoRequestPayloads(
        timeline,
        directorsVision,
        scene.summary,
        {} // generatedShotImages
    );
    
    // Get workflow profile - require explicit configuration, no silent fallback
    const profile = settings.workflowProfiles?.[profileId];
    if (!profile) {
        throw new Error(
            `Workflow profile '${profileId}' not found. ` +
            `Please configure the profile in Settings → ComfyUI Settings → Workflow Profiles. ` +
            `Native bookend generation requires a dual-keyframe workflow with start_image and end_image mappings.`
        );
    }
    
    onStateChange({
        phase: 'native-bookend-video',
        status: 'running',
        progress: 0,
        message: `Generating native dual-keyframe video using ${profileId}...`
    });
    
    // Queue the dual-keyframe prompt
    const response = await queueComfyUIPromptDualImage(
        settings,
        payloads,
        { start: bookends.start, end: bookends.end },
        profileId
    );
    
    if (!response?.prompt_id) {
        throw new Error('Failed to queue native bookend video generation');
    }
    
    // Wait for completion
    const output = await waitForComfyCompletion(
        settings,
        response.prompt_id,
        (state) => {
            onStateChange({
                phase: 'native-bookend-video',
                status: 'running',
                progress: state.progress || 0,
                message: `Generating dual-keyframe video: ${state.progress || 0}%`
            });
        }
    );
    
    if (!output?.data) {
        throw new Error('Native bookend video generation failed: No output data');
    }
    
    console.log(`[Native Bookend] ✅ Video generation complete using ${profileId}`);
    return output.data;
}

/**
 * Queue a ComfyUI prompt with dual image support (start and end keyframes).
 * This is designed for FLF2V workflows (WanFirstLastFrameToVideo, Wan22FirstLastFrameToVideoLatent*)
 * and WanFunInpaintToVideo workflows.
 * 
 * @param settings ComfyUI configuration
 * @param payloads Text/JSON payloads for prompt injection
 * @param images Start and end keyframe images (base64)
 * @param profileId Workflow profile ID with dual image mapping
 * @returns ComfyUI queue response
 */
export const queueComfyUIPromptDualImage = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string; structured: any[]; negativePrompt: string },
    images: { start: string; end: string },
    profileId: string = 'wan-flf2v'
): Promise<any> => {
    console.log(`[${profileId}] Queueing dual-image workflow with start and end keyframes`);
    
    // ========================================================================
    // LM Studio VRAM Release - Unload LLM models to free VRAM for ComfyUI
    // ========================================================================
    const autoEjectEnabled = settings.featureFlags?.autoEjectLMStudioModels ?? true;
    if (autoEjectEnabled) {
        try {
            await ensureModelsUnloaded();
        } catch (lmError) {
            // Non-blocking: Log warning but continue with generation
            console.warn('[queueComfyUIPromptDualImage] LM Studio model unload failed (non-blocking):', lmError);
        }
    }
    
    const modelId = resolveModelIdFromSettings(settings);
    const profile = resolveWorkflowProfile(settings, modelId, undefined, profileId);
    const profileConfig = settings.workflowProfiles?.[profileId];
    
    if (!profileConfig) {
        throw new Error(`Workflow profile '${profileId}' not found. Please configure the profile in Settings.`);
    }
    
    let workflowApi: Record<string, any>;
    try {
        // If sourcePath is specified and workflowJson is empty, attempt to load from file (Node.js only)
        if (profileConfig.sourcePath && !profileConfig.workflowJson) {
            // For browser, we should have the workflow embedded in workflowJson
            if (typeof window === 'undefined') {
                // Node.js environment - read from file
                const fs = await import('fs');
                const path = await import('path');
                const workflowPath = path.join(process.cwd(), profileConfig.sourcePath);
                const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
                workflowApi = JSON.parse(workflowContent);
            } else {
                throw new Error(`Workflow sourcePath '${profileConfig.sourcePath}' specified but workflowJson not embedded. Please sync the workflow.`);
            }
        } else {
            workflowApi = JSON.parse(profile.workflowJson);
        }
    } catch (error) {
        throw new Error(`Failed to parse workflow for profile '${profileId}': ${error}`);
    }
    
    // Validate workflow format and integrity
    const { validateWorkflowIntegrity, getWorkflowCategoryForProfile, isApiFormat } = await import('../utils/workflowValidator');
    
    if (!isApiFormat(workflowApi)) {
        throw new Error(
            `Workflow for profile '${profileId}' is in UI format (contains nodes/links arrays). ` +
            `Please use the API format version (*API.json) or export as "Save (API Format)" from ComfyUI.`
        );
    }
    
      const workflowCategory = getWorkflowCategoryForProfile(profileId);
      if (workflowCategory) {
          const validation = validateWorkflowIntegrity(workflowApi, workflowCategory);

          // Correlation-friendly observability for workflow integrity
          try {
              logCorrelation(
                  { correlationId: generateCorrelationId(), timestamp: Date.now(), source: 'comfyui' },
                  'workflow-validate',
                  {
                      profileId,
                      category: workflowCategory,
                      format: validation.format,
                      valid: validation.valid,
                      missingNodes: validation.missingNodes,
                      nodeTypes: validation.nodeTypes,
                      errorCount: validation.errors.length,
                      warningCount: validation.warnings.length,
                  }
              );
          } catch {
              // Best-effort; do not break on logging failures
          }

          if (!validation.valid) {
              throw new Error(`Workflow validation failed for '${profileId}': ${validation.errors.join(' ')}`);
          }
          if (validation.warnings.length > 0) {
              console.warn(`[${profileId}] Workflow warnings:`, validation.warnings);
          }
      }
    
    const promptPayloadTemplate = workflowApi.nodes || workflowApi.prompt || workflowApi;
    const mapping = profileConfig.mapping || profile.mapping;
    
    // Pre-flight checks
    await checkServerConnection(settings.comfyUIUrl);
    
    const promptPayload = JSON.parse(JSON.stringify(promptPayloadTemplate));
    const baseUrl = getComfyUIBaseUrl(settings.comfyUIUrl);
    const clientId = settings.comfyUIClientId || `csg_dual_${Date.now()}`;
    
    // Upload both images
    const uploadedImages: { start?: string; end?: string } = {};
    
    // Find image mapping keys for start and end
    const startImageKey = Object.keys(mapping).find(k => mapping[k] === 'start_image');
    const endImageKey = Object.keys(mapping).find(k => mapping[k] === 'end_image');
    
    if (!startImageKey || !endImageKey) {
        throw new Error(`Profile '${profileId}' is missing start_image or end_image mappings. Required for dual-keyframe workflows.`);
    }
    
    // Upload start image
    if (images.start) {
        const nodeId = startImageKey.split(':')[0];
        if (!nodeId) throw new Error('Invalid start_image mapping key: missing nodeId');
        const node = promptPayload[nodeId];
        
        if (node && node.class_type === 'LoadImage') {
            const blob = base64ToBlob(images.start, 'image/jpeg');
            const formData = new FormData();
            const filename = `csg_start_keyframe_${Date.now()}.jpg`;
            formData.append('image', blob, filename);
            formData.append('overwrite', 'true');
            
            const uploadResponse = await fetchWithTimeout(`${baseUrl}/upload/image`, {
                method: 'POST',
                body: formData,
            }, 45000);
            
            if (!uploadResponse.ok) {
                throw new Error(`Failed to upload start keyframe to ComfyUI. Status: ${uploadResponse.status}`);
            }
            
            const uploadResult = await uploadResponse.json();
            uploadedImages.start = uploadResult.name;
            console.log(`[${profileId}] Uploaded start keyframe: ${uploadedImages.start}`);
        }
    }
    
    // Upload end image
    if (images.end) {
        const nodeId = endImageKey.split(':')[0];
        if (!nodeId) throw new Error('Invalid end_image mapping key: missing nodeId');
        const node = promptPayload[nodeId];
        
        if (node && node.class_type === 'LoadImage') {
            const blob = base64ToBlob(images.end, 'image/jpeg');
            const formData = new FormData();
            const filename = `csg_end_keyframe_${Date.now()}.jpg`;
            formData.append('image', blob, filename);
            formData.append('overwrite', 'true');
            
            const uploadResponse = await fetchWithTimeout(`${baseUrl}/upload/image`, {
                method: 'POST',
                body: formData,
            }, 45000);
            
            if (!uploadResponse.ok) {
                throw new Error(`Failed to upload end keyframe to ComfyUI. Status: ${uploadResponse.status}`);
            }
            
            const uploadResult = await uploadResponse.json();
            uploadedImages.end = uploadResult.name;
            console.log(`[${profileId}] Uploaded end keyframe: ${uploadedImages.end}`);
        }
    }
    
    // Randomize seeds
    const randomSeed = Math.floor(Math.random() * 1e15);
    for (const [_nodeId, nodeEntry] of Object.entries(promptPayload)) {
        const node = nodeEntry as WorkflowNode;
        if (typeof node === 'object' && node !== null && node.class_type === 'KSampler' && node.inputs && 'seed' in node.inputs) {
            node.inputs.seed = randomSeed;
        }
    }
    
    // Inject data based on mapping
    for (const [key, dataType] of Object.entries(mapping)) {
        if (dataType === 'none') continue;
        
        const parts = key.split(':');
        const nodeId = parts[0];
        const inputName = parts[1];
        if (!nodeId || !inputName) continue;
        const node = promptPayload[nodeId] as WorkflowNode | undefined;
        
        if (node && node.inputs) {
            let dataToInject: unknown = null;
            switch (dataType) {
                case 'human_readable_prompt':
                    dataToInject = payloads.text;
                    break;
                case 'full_timeline_json':
                    dataToInject = payloads.json;
                    break;
                case 'negative_prompt':
                    dataToInject = payloads.negativePrompt;
                    break;
                case 'start_image':
                    if (uploadedImages.start && node.class_type === 'LoadImage') {
                        dataToInject = uploadedImages.start;
                    }
                    break;
                case 'end_image':
                    if (uploadedImages.end && node.class_type === 'LoadImage') {
                        dataToInject = uploadedImages.end;
                    }
                    break;
            }
            if (dataToInject !== null) {
                node.inputs[inputName] = dataToInject;
            }
        }
    }
    
    // Queue the prompt
    const body = JSON.stringify({ prompt: promptPayload, client_id: clientId });
    const response = await fetchWithTimeout(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    }, 60000);
    
    if (!response.ok) {
        let errorMessage = `ComfyUI server responded with status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage += ` - ${errorData.error?.message || JSON.stringify(errorData)}`;
        } catch { /* ignore */ }
        throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log(`[${profileId}] ✅ Dual-image prompt queued: ${result.prompt_id}`);
    
    return result;
};

/**
 * Detects if a workflow profile supports native dual-keyframe generation.
 * Checks for FLF2V or FunInpaint nodes in the workflow:
 * - WanFirstLastFrameToVideo (14B model)
 * - Wan22FirstLastFrameToVideoLatent (5B custom node)
 * - Wan22FirstLastFrameToVideoLatentTiledVAE (5B custom node with tiled VAE)
 * - WanFunInpaintToVideo
 * 
 * @param settings ComfyUI settings
 * @param profileId Workflow profile ID to check
 * @returns True if profile supports native dual-keyframe, false otherwise
 */
export function supportsNativeDualKeyframe(
    settings: LocalGenerationSettings,
    profileId: string
): boolean {
    const profile = settings.workflowProfiles?.[profileId];
    if (!profile) return false;
    
    // Check if mapping has both start_image and end_image
    const mapping = profile.mapping || {};
    const hasStartImage = Object.values(mapping).includes('start_image');
    const hasEndImage = Object.values(mapping).includes('end_image');
    
    if (!hasStartImage || !hasEndImage) {
        return false;
    }
    
    // Try to parse workflow and check for dual-keyframe nodes
    try {
        let workflow: Record<string, any>;
        if (profile.workflowJson) {
            workflow = JSON.parse(profile.workflowJson);
        } else {
            return false;
        }
        
        const nodes = workflow.nodes || workflow.prompt || workflow;
        const dualKeyframeNodeTypes = [
            'WanFirstLastFrameToVideo',           // 14B model node
            'WanFunInpaintToVideo',
            'Wan22FirstLastFrameToVideoLatent',   // 5B model node (custom)
            'Wan22FirstLastFrameToVideoLatentTiledVAE', // 5B model node with tiled VAE (custom)
        ];
        
        for (const [_nodeId, node] of Object.entries(nodes)) {
            if (typeof node === 'object' && node !== null) {
                const nodeEntry = node as WorkflowNode;
                if (dualKeyframeNodeTypes.includes(nodeEntry.class_type || '')) {
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn(`[supportsNativeDualKeyframe] Failed to parse workflow for ${profileId}:`, e);
    }
    
    return false;
}

/**
 * Smart bookend video generation that automatically selects the best method:
 * 1. Native dual-keyframe (preferred) if supported
 * 2. Sequential FFmpeg splicing (fallback)
 * 
 * @param settings ComfyUI configuration
 * @param scene Scene with temporalContext
 * @param timeline Timeline data for shot metadata
 * @param bookends Start and end keyframe images (base64)
 * @param directorsVision Director's vision style guide for video generation
 * @param logApiCall API call logging function
 * @param onStateChange State change callback
 * @returns Promise<string> - Video data URL or file path
 */
export async function generateVideoFromBookendsSmart(
    settings: LocalGenerationSettings,
    scene: Scene,
    timeline: TimelineData,
    bookends: { start: string; end: string },
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void
): Promise<string> {
    // Check for native dual-keyframe support
    const nativeProfiles = ['wan-flf2v', 'wan-fun-inpaint'];
    
    for (const profileId of nativeProfiles) {
        if (supportsNativeDualKeyframe(settings, profileId)) {
            console.log(`[Smart Bookend] Using native dual-keyframe workflow: ${profileId}`);
            try {
                return await generateVideoFromBookendsNative(
                    settings,
                    scene,
                    timeline,
                    bookends,
                    directorsVision,
                    logApiCall,
                    onStateChange,
                    profileId as 'wan-flf2v' | 'wan-fun-inpaint'
                );
            } catch (error) {
                console.warn(`[Smart Bookend] Native generation failed, falling back to sequential:`, error);
                // Fall through to sequential
            }
        }
    }
    
    // Fallback to sequential (FFmpeg) generation
    console.log(`[Smart Bookend] No native dual-keyframe support, using sequential FFmpeg generation`);
    return generateVideoFromBookendsSequential(settings, scene, timeline, bookends, directorsVision, logApiCall, onStateChange);
}

// ============================================================================
// Prompt Length Validation
// ============================================================================

/**
 * Result of prompt length validation
 */
export interface PromptLengthValidation {
    /** Whether the prompt is within budget */
    valid: boolean;
    /** Estimated token count */
    tokens: number;
    /** Maximum allowed tokens */
    maxTokens: number;
    /** Whether truncation was applied */
    truncated: boolean;
    /** Final prompt (may be truncated) */
    prompt: string;
    /** Validation messages */
    messages: string[];
}

/**
 * Validates and optionally truncates a prompt to fit within token budget.
 * 
 * @param prompt - The prompt to validate
 * @param maxTokens - Maximum tokens allowed (default: 500 for ComfyUI shots)
 * @param autoTruncate - Whether to automatically truncate oversized prompts
 * @returns Validation result with optional truncated prompt
 */
export const validatePromptLength = (
    prompt: string,
    maxTokens: number = DEFAULT_TOKEN_BUDGETS.comfyuiShot,
    autoTruncate: boolean = true
): PromptLengthValidation => {
    const tokens = estimateTokens(prompt);
    const messages: string[] = [];
    let valid = tokens <= maxTokens;
    let truncated = false;
    let finalPrompt = prompt;

    if (!valid) {
        messages.push(`Prompt exceeds token budget: ${tokens}/${maxTokens} tokens`);
        
        if (autoTruncate) {
            const result = truncateToTokenLimit(prompt, maxTokens);
            finalPrompt = result.text;
            truncated = result.truncated;
            valid = true; // Now valid after truncation
            messages.push(`Prompt truncated from ${result.originalTokens} to ${result.finalTokens} tokens`);
        }
    }

    return {
        valid,
        tokens: truncated ? estimateTokens(finalPrompt) : tokens,
        maxTokens,
        truncated,
        prompt: finalPrompt,
        messages,
    };
};

/**
 * Builds a shot prompt with automatic token budget enforcement.
 * This is a wrapper around buildShotPrompt that ensures prompts stay within limits.
 * 
 * @param shot - The shot to build prompt for
 * @param enhancers - Creative enhancers for the shot
 * @param directorsVision - Director's visual styling guidance
 * @param settings - Local generation settings
 * @param sceneId - Optional scene ID for Visual Bible context
 * @param shotId - Optional shot ID for Visual Bible context
 * @param target - Target type for prompt generation
 * @param transitionContext - Optional scene transition context
 * @param shotTransitionContext - Optional shot-level transition context
 * @param maxTokens - Maximum tokens allowed (default: 500)
 * @returns Object with prompt and validation info
 */
export const buildShotPromptWithValidation = (
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    settings: LocalGenerationSettings,
    sceneId?: string,
    shotId?: string,
    target: PromptTarget = 'shotImage',
    transitionContext?: SceneTransitionContext | null,
    shotTransitionContext?: ShotTransitionContext | null,
    maxTokens: number = DEFAULT_TOKEN_BUDGETS.comfyuiShot,
    narrativeContext?: string | null
): { prompt: string; validation: PromptLengthValidation } => {
    // Build the base prompt
    const rawPrompt = buildShotPrompt(
        shot,
        enhancers,
        directorsVision,
        settings,
        sceneId,
        shotId,
        target,
        transitionContext,
        shotTransitionContext,
        narrativeContext
    );

    // Validate and truncate if needed
    const validation = validatePromptLength(rawPrompt, maxTokens, true);

    return {
        prompt: validation.prompt,
        validation,
    };
};

/**
 * Gets token budget information for display in UI.
 */
export const getTokenBudgetInfo = () => ({
    comfyuiShot: DEFAULT_TOKEN_BUDGETS.comfyuiShot,
    plotScene: DEFAULT_TOKEN_BUDGETS.plotScene,
    logline: DEFAULT_TOKEN_BUDGETS.logline,
    setting: DEFAULT_TOKEN_BUDGETS.setting,
    characterProfile: DEFAULT_TOKEN_BUDGETS.characterProfile,
});

/**
 * Fetches the latest workflow history from ComfyUI server.
 * Used for AI-assisted workflow configuration.
 * 
 * @param baseUrl - ComfyUI server base URL
 * @returns The latest workflow JSON, or null if none exists
 * @throws Error if server is unreachable or response is invalid
 */
export const fetchLatestWorkflowHistory = async (baseUrl: string): Promise<string | null> => {
    const url = baseUrl.replace(/\/+$/, '') + '/history';
    const response = await fetchWithTimeout(url, {}, 10000);
    
    if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
    }
    
    const history = await response.json() as Record<string, any>;
    const historyEntries = Object.values(history);
    
    if (historyEntries.length === 0) {
        return null;
    }
    
    const latestEntry = historyEntries[historyEntries.length - 1] as any;
    return JSON.stringify(latestEntry.prompt?.[2], null, 2) ?? null;
};

/**
 * Tests LLM provider connection and retrieves available models.
 * Used for validating LM Studio or OpenAI-compatible endpoints.
 * 
 * @param providerUrl - The LLM provider URL (e.g., http://host:port/v1/chat/completions)
 * @returns Object with connection status, model count, and model names
 * @throws Error if connection fails
 */
export const testLLMConnection = async (providerUrl: string): Promise<{ success: boolean; models: string[]; modelCount: number }> => {
    // Normalize the URL to extract base and construct /v1/models endpoint
    let baseUrl = (providerUrl || '').trim();
    
    // Strip trailing slash
    if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }
    
    // Remove any existing /v1/* path segments
    if (baseUrl.includes('/v1/')) {
        baseUrl = baseUrl.substring(0, baseUrl.indexOf('/v1'));
    } else if (baseUrl.endsWith('/v1')) {
        baseUrl = baseUrl.slice(0, -3);
    }
    
    // Construct the /v1/models endpoint
    const modelsUrl = `${baseUrl}/v1/models`;
    
    const response = await fetchWithTimeout(modelsUrl, { method: 'GET' }, 5000);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as { data?: Array<{ id: string; name?: string }> };
    const models = data.data || [];
    const modelNames = models.slice(0, 3).map(m => m.id || m.name || '').filter(Boolean);
    
    return {
        success: true,
        models: modelNames,
        modelCount: models.length,
    };
};

/**
 * Tests ComfyUI connection and retrieves system info.
 * Used for validating ComfyUI server availability.
 * 
 * @param comfyUIUrl - The ComfyUI server URL
 * @returns Object with connection status and GPU info
 * @throws Error if connection fails
 */
export const testComfyUIConnection = async (comfyUIUrl: string): Promise<{ success: boolean; gpu: string }> => {
    const baseUrl = getComfyUIBaseUrl(comfyUIUrl);
    const response = await fetchWithTimeout(`${baseUrl}/system_stats`, {}, 3000);
    
    if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
    }
    
    const data = await response.json() as { system?: { os?: string }; devices?: Array<{ name?: string }> };
    
    if (!data || !data.system || !data.devices) {
        throw new Error("Connected, but the response doesn't look like a valid ComfyUI server");
    }
    
    const gpuName = data.devices?.[0]?.name || 'Unknown GPU';
    
    return {
        success: true,
        gpu: gpuName,
    };
};
