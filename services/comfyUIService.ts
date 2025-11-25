import { LocalGenerationSettings, LocalGenerationStatus, TimelineData, Shot, Scene, CreativeEnhancers, WorkflowMapping, MappableData, LocalGenerationAsset, WorkflowProfile, WorkflowProfileMappingHighlight } from '../types';
import { base64ToBlob } from '../utils/videoUtils';
import { getVisualBible } from './visualBibleContext';
import { generateCorrelationId, logCorrelation, networkTap } from '../utils/correlation';
import { validatePromptGuardrails } from './promptValidator';
import { SceneTransitionContext, formatTransitionContextForPrompt } from './sceneTransitionService';
import { ApiLogCallback } from './geminiService';
// TODO: Visual Bible integration not yet implemented
// import { getPromptConfigForModel, applyPromptTemplate, type PromptTarget, getDefaultNegativePromptForModel } from './promptTemplates';
import { getVisualContextForShot, getCharacterContextForShot, getVisualContextForScene, getCharacterContextForScene } from './visualBiblePromptHelpers';

// Stub implementations until Visual Bible services are implemented
const getPromptConfigForModel = (modelId: string, target: PromptTarget) => ({ template: '{prompt}' });
const applyPromptTemplate = (prompt: string, vbSegment: string, config: { template: string }) => vbSegment ? `${prompt} ${vbSegment}` : prompt;
const getDefaultNegativePromptForModel = (modelId: string, target: string) => DEFAULT_NEGATIVE_PROMPT;

// Type for prompt targets (keyframe or video generation)
type PromptTarget = 'shotImage' | 'sceneKeyframe' | 'sceneVideo';

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

export interface WorkflowGenerationMetadata {
    highlightMappings: WorkflowProfileMappingHighlight[];
    mappingEntries: Array<{ key: string; dataType: string }>;
    missingMappings: MappableData[];
    warnings: string[];
    referencesCanonical: boolean;
    hasTextMapping: boolean;
    hasKeyframeMapping: boolean;
    mapping: WorkflowMapping;
}

const DEFAULT_FETCH_TIMEOUT_MS = 12000;

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
    const [nodeId, inputName] = key.split(':');
    const node = prompt?.[nodeId];
    const nodeTitle = node?._meta?.title || node?.label || `Node ${nodeId}`;
    return [{ type: type as MappableData, nodeId, inputName: inputName ?? '', nodeTitle }];
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
    modelId?: string,
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

        const [nodeId, inputName] = key.split(':');
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


const ensureWorkflowMappingDefaults = (workflowNodes: Record<string, any>, existingMapping: WorkflowMapping): WorkflowMapping => {
    if (!workflowNodes || typeof workflowNodes !== 'object') {
        return existingMapping;
    }

    const baseMapping = existingMapping ?? {};
    const mergedMapping: WorkflowMapping = { ...baseMapping };
    const mappedTypes = new Set(Object.values(baseMapping));

    const assignMapping = (nodeId: string, inputName: string, dataType: MappableData) => {
        if (mappedTypes.has(dataType)) return;
        const node = workflowNodes[nodeId];
        if (!node || !node.inputs || typeof node.inputs[inputName] === 'undefined') return;
        mergedMapping[`${nodeId}:${inputName}`] = dataType;
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


// Fetches an asset from the ComfyUI server and converts it to a data URL.
const fetchAssetAsDataURL = async (url: string, filename: string, subfolder: string, type: string): Promise<string> => {
    const baseUrl = getComfyUIBaseUrl(url);
    const response = await fetchWithTimeout(`${baseUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`, undefined, 5000);
    if (!response.ok) {
        throw new Error(`Failed to fetch asset from ComfyUI server. Status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
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
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};


/**
 * Constructs and sends a generation request to a ComfyUI server based on a synced workflow.
 * This function includes robust pre-flight checks to ensure configuration is valid before queuing.
 * @param settings The local generation settings, including URL, workflow, and mapping.
 * @param payloads The generated JSON and text prompts.
 * @param base64Image The base64-encoded keyframe image.
 * @returns The server's response after queueing the prompt.
 */
export const queueComfyUIPrompt = async (
    settings: LocalGenerationSettings,
    payloads: { json: string; text: string; structured: any[]; negativePrompt: string },
    base64Image: string,
    profileId: string = DEFAULT_WORKFLOW_PROFILE_ID,
    profileOverride?: WorkflowProfile
): Promise<any> => {
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
            const [nodeId] = imageMappingKey.split(':');
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

            const [nodeId, inputName] = key.split(':');
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
        try { pushDiagnostic({ profileId, action: 'prompt:result', promptId: result?.prompt_id, resultSnippet: JSON.stringify(result).slice(0, 1000) }); } catch(e){}

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
        try { pushDiagnostic({ profileId, action: 'error', message: error instanceof Error ? error.message : String(error) }); } catch(e){}
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
    const { comfyUIUrl, comfyUIClientId } = settings;
    if (!comfyUIUrl || !comfyUIClientId) {
        onProgress({ status: 'error', message: 'ComfyUI URL or Client ID is not configured.' });
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
                    onProgress({ 
                        status: 'queued', 
                        message: `In queue... Position: ${msg.data.queue_remaining}`,
                        queue_position: msg.data.queue_remaining
                    });
                }
                break;
            
            case 'execution_start':
                if (msg.data.prompt_id === promptId) {
                    onProgress({ status: 'running', message: 'Execution started.' });
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

                    onProgress({
                        status: 'running',
                        message: `Executing: ${nodeTitle}`,
                        node_title: nodeTitle,
                    });
                }
                break;

            case 'progress':
                 if (msg.data.prompt_id === promptId) {
                    const progress = (msg.data.value / msg.data.max) * 100;
                    onProgress({
                        status: 'running',
                        progress: Math.round(progress),
                    });
                }
                break;
            
            case 'execution_error':
                if (msg.data.prompt_id === promptId) {
                    const errorDetails = msg.data;
                    const errorMessage = `Execution error on node ${errorDetails.node_id}: ${errorDetails.exception_message}`;
                    onProgress({ status: 'error', message: errorMessage });
                    ws.close();
                }
                break;

            case 'executed':
                if (msg.data.prompt_id === promptId) {
                    console.log(`[trackPromptExecution] ✓ Execution complete for promptId=${promptId.slice(0,8)}...`);
                    const outputs = msg.data.output || {};
                    const assetSources: Array<{ entries?: any[]; resultType: LocalGenerationAsset['type'] }> = [
                        { entries: outputs.videos, resultType: 'video' },
                        { entries: outputs.images, resultType: 'image' },
                        { entries: outputs.gifs, resultType: 'video' },
                        { entries: outputs.output, resultType: 'image' },
                    ];

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
                        onProgress({ status: 'complete', message: 'Generation complete! No visual output found in final node.' });
                        ws.close();
                        return;
                    }

                    try {
                        console.log(`[trackPromptExecution] 📥 Fetching assets for promptId=${promptId.slice(0,8)}...`);
                        onProgress({ message: 'Fetching final output...', progress: 100 });
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
                            const imageAssets = downloadedAssets.filter(asset => asset.type === 'image');
                            const videoAssets = downloadedAssets.filter(asset => asset.type === 'video');
                            const finalOutput: LocalGenerationStatus['final_output'] = {
                                type: downloadedAssets[0].type,
                                data: downloadedAssets[0].data,
                                filename: downloadedAssets[0].filename,
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
                            onProgress({
                                status: 'complete',
                                message: 'Generation complete!',
                                final_output: finalOutput,
                            });
                            
                            // Small delay to ensure state updates propagate
                            await new Promise(resolve => setTimeout(resolve, 50));
                        } else {
                            console.log(`[trackPromptExecution] ⚠️ No assets downloaded for promptId=${promptId.slice(0,8)}...`);
                            onProgress({ status: 'complete', message: 'Generation complete! No visual output found in final node.' });
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to fetch final output.";
                        console.error(`[trackPromptExecution] ❌ Asset fetch error for promptId=${promptId.slice(0,8)}...:`, error);
                        onProgress({ status: 'error', message });
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
        onProgress({ status: 'error', message: `WebSocket connection error. Check if ComfyUI is running at ${comfyUIUrl}.` });
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
        
        // Step 1: Build human-readable prompt with optional transition context
        const humanPrompt = buildShotPrompt(
            shot,
            enhancers,
            directorsVision,
            settings,
            undefined,
            shot.id,
            'shotVideo',
            overrides?.transitionContext
        );
        
        reportProgress({ status: 'running', message: `Prompt: ${humanPrompt.substring(0, 80)}...` });

        // Step 2: Build payload with shot-specific data
        const modelId = resolveModelIdFromSettings(settings);
        const defaultNegativePrompt = getDefaultNegativePromptForModel(modelId, 'shotVideo');
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

        // Step 3: Queue prompt in ComfyUI
        reportProgress({ status: 'running', message: 'Queuing prompt in ComfyUI...' });
        let promptResponse;
        try {
            promptResponse = await queuePrompt(settings, payloads, keyframeImage || '', 'wan-i2v');
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
        reportProgress({ status: 'queued', message: `Queued with ID: ${promptId}` });

        // Step 4: Track execution via WebSocket
        // NOTE: Updated to handle PNG frame sequence output from simplified SVD workflow
        // The workflow outputs PNG images (one per frame) instead of a single video file
        return new Promise((resolve, reject) => {
            let outputData: any = null;
            let frameSequence: string[] = [];
            
            const wrappedOnProgress = (update: Partial<LocalGenerationStatus>) => {
                reportProgress(update);
                
                // Capture output when generation completes
                if (update.final_output) {
                    outputData = update.final_output;
                    // Handle both video file output and PNG frame sequences
                    if (Array.isArray(outputData.images)) {
                        frameSequence = outputData.images;
                    }
                }
            };

            trackExecution(settings, promptId, wrappedOnProgress);

            // Set timeout for safety (max 5 minutes per shot)
        const timeout = setTimeout(() => {
            const message = `${getSceneContext(promptId)} timed out (5 minutes exceeded) while waiting for output`;
            reject(new Error(message));
        }, 5 * 60 * 1000);

            // Poll for completion (alternative to WebSocket-only tracking)
            const pollInterval = setInterval(async () => {
                try {
                    const queueInfo = await pollQueueInfo(settings.comfyUIUrl);
                    // If queue is empty and we have output, we're done
                    if (queueInfo.queue_running === 0 && queueInfo.queue_pending === 0) {
                        // Hardened validation: ensure we have actual output data
                        if (!outputData) {
                            clearInterval(pollInterval);
                            clearTimeout(timeout);
                            const errorMsg = `${getSceneContext(promptId)} queue completed but no output data was received. Generation may have failed silently.`;
                            reportProgress({ status: 'error', message: errorMsg });
                            reject(new Error(errorMsg));
                            return;
                        }

                        // Validate we have either frames or a filename
                        const hasFrames = frameSequence.length > 0;
                        const hasFilename = outputData.filename && outputData.filename.trim().length > 0;
                        
                        if (!hasFrames && !hasFilename) {
                            clearInterval(pollInterval);
                            clearTimeout(timeout);
                            const errorMsg = `${getSceneContext(promptId)} completed but produced no frames or filename. Output may be empty or invalid.`;
                            reportProgress({ status: 'error', message: errorMsg });
                            reject(new Error(errorMsg));
                            return;
                        }

                        clearInterval(pollInterval);
                        clearTimeout(timeout);
                        
                        // Frame count validation (SVD stability improvement)
                        const MIN_FRAME_COUNT = 5; // Minimum acceptable frames for valid video
                        const actualFrameCount = frameSequence.length;
                        
                        if (actualFrameCount > 0 && actualFrameCount < MIN_FRAME_COUNT) {
                            const warningMsg = `${getSceneContext(promptId)} generated only ${actualFrameCount} frames (minimum ${MIN_FRAME_COUNT}). Video may be too short or generation incomplete.`;
                            console.warn(warningMsg);
                            // Use 'complete' status but include warning in message
                            // (video was generated, just with potential quality issues)
                            reportProgress({ 
                                status: 'complete', 
                                message: `⚠️ ${warningMsg}`,
                                progress: 100 
                            });
                        }
                        
                        // Calculate duration: frames @ 24fps
                        const frameDuration = frameSequence.length > 0 ? frameSequence.length / 24 : 1.04;
                        
                    resolve({
                        videoPath: outputData.data || `gemdirect1_shot_${shot.id}`,
                        duration: frameDuration,
                        filename: outputData.filename || `gemdirect1_shot_${shot.id}.mp4`,
                        frames: frameSequence.length > 0 ? frameSequence : undefined,
                        workflowMeta: (promptResponse as any)?.workflowMeta,
                        queueSnapshot: (promptResponse as any)?.queueSnapshot,
                        systemResources: resourceMessage,
                    });
                }
            } catch (e) {
                clearInterval(pollInterval);
                clearTimeout(timeout);
                const errorMessage = e instanceof Error ? e.message : String(e);
                const contextMessage = `${getSceneContext(promptId)} queue polling failed: ${errorMessage}`;
                reportProgress({ status: 'error', message: contextMessage });
                reject(new Error(contextMessage));
            }
        }, 2000);
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


const SINGLE_FRAME_PROMPT = 'SINGLE CONTINUOUS WIDE-ANGLE SHOT: Generate EXACTLY ONE UNIFIED CINEMATIC SCENE showing a SINGLE MOMENT across the ENTIRE 16:9 frame WITHOUT ANY DIVISIONS, REFLECTIONS, OR LAYERED COMPOSITIONS. PANORAMIC VIEW of ONE LOCATION with consistent lighting and unified perspective from top to bottom, left to right. The entire frame must show ONE CONTINUOUS ENVIRONMENT - no horizontal lines dividing the image, no mirrored sections, no before-after comparisons. DO NOT create character sheets, product grids, split-screens, multi-panel layouts, or storyboard panels. This is ONE UNBROKEN WIDE-ANGLE SHOT capturing the full environment with seamless unified composition. Ensure well-lit scene with visible details and balanced exposure.';

// ORIGINAL (900+ chars) - kept for fallback/comparison
export const NEGATIVE_GUIDANCE_VERBOSE = 'AVOID AT ALL COSTS: split-screen, multi-panel layout, divided frame, panel borders, storyboard panels, multiple scenes in one image, comic strip layout, triptych, diptych, before and after comparison, side by side shots, top and bottom split, left and right split, grid layout, mosaic, composite image, collage, multiple perspectives, repeated subjects, duplicated elements, mirrored composition, reflection symmetry, tiled pattern, sequential images, montage, multiple time periods, multiple locations, frame divisions, panel separators, white borders, black borders, frame-within-frame, picture-in-picture, multiple lighting setups, discontinuous composition, fragmented scene, segmented layout, partitioned image, multiple narratives, split composition, dual scene, multiple shots combined, storyboard format, comic panel style, sequence of events, time progression, location changes, speech bubbles, UI overlays, interface elements, textual callouts';

// OPTIMIZED v4 (360 chars) - added reflection/symmetry terms to eliminate split-screen artifacts
export const NEGATIVE_GUIDANCE = 'split-screen, multi-panel, grid layout, character sheet, product catalog, symmetrical array, repeated elements, duplicated subjects, storyboard, comic layout, collage, multiple scenes, side-by-side, tiled images, panel borders, manga style, separated frames, before-after comparison, sequence panels, dual perspective, fragmented scene, picture-in-picture, montage, reflection, mirrored composition, horizontal symmetry, vertical symmetry, above-below division, sky-ground split';

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
    transitionContext?: SceneTransitionContext | null
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

    const charContext = getCharacterContextForShot(visualBible, sceneId, shotId || shot.id);
    const characterSnippets: string[] = [];
    if (charContext.characterNames.length > 0) {
        characterSnippets.push(`Characters: ${charContext.characterNames.join(', ')}`);
    }
    if (charContext.identityTags.length > 0) {
        characterSnippets.push(`Identity tags: ${charContext.identityTags.join(', ')}`);
    }
    if (charContext.visualTraits.length > 0) {
        characterSnippets.push(`Visual traits: ${charContext.visualTraits.join(', ')}`);
    }
    const characterSegment = characterSnippets.length > 0 ? `Visual bible character cues: ${characterSnippets.join('; ')}.` : '';

    const combinedVBSegment = [styleSegment, characterSegment].filter(Boolean).join(' ');

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
}


/**
 * Batch generates videos for all shots in a timeline.
 * Handles queue management and progress tracking for multiple shots.
 */
export const generateTimelineVideos = async (
    settings: LocalGenerationSettings,
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string,
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
    
    for (let i = 0; i < timeline.shots.length; i++) {
        const shot = timeline.shots[i];
        const enhancers = timeline.shotEnhancers[shot.id];
        const keyframe = keyframeImages[shot.id] || null;

        try {
            console.log(`[Timeline Batch] Processing shot ${i + 1}/${timeline.shots.length}: ${shot.id}`);
            
            if (onProgress) {
                onProgress(shot.id, {
                    status: 'running',
                    message: `Generating shot ${i + 1}/${timeline.shots.length}...`
                });
            }

            const result = await shotExecutor(
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
                }
            );

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
            const errorMsg = error instanceof Error ? error.message : String(error);
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
        let finished = false;
        // Increased timeout to 10 minutes for WAN2 video generation on consumer GPUs
        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                clearInterval(pollingInterval);
                reject(new Error('ComfyUI generation timeout (10 minutes exceeded).'));
            }
        }, 10 * 60 * 1000);

        // Polling fallback: Check history API every 2 seconds if WebSocket doesn't deliver completion
        // This handles cases where multiple WebSocket connections cause event routing issues
        let wsReceivedEvents = false;
        console.log(`[waitForComfyCompletion] 🔄 Starting polling fallback for ${promptId.slice(0,8)}... (checking every 2s)`);
        const pollingInterval = setInterval(async () => {
            if (finished) {
                console.log(`[waitForComfyCompletion] ⏹️  Stopping polling for ${promptId.slice(0,8)}... (finished=true)`);
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
                    // Execution completed! Fetch outputs
                    console.log(`[waitForComfyCompletion] 📊 Polling detected completion for ${promptId.slice(0,8)}... (WebSocket events: ${wsReceivedEvents ? 'received' : 'MISSING'})`);
                    
                    const outputs = promptHistory.outputs || {};
                    const assetSources: Array<{ entries?: any[]; resultType: LocalGenerationAsset['type'] }> = [];
                    
                    // Check all output nodes for images/videos
                    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
                        const output = nodeOutput as any;
                        if (output.images) assetSources.push({ entries: output.images, resultType: 'image' });
                        if (output.videos) assetSources.push({ entries: output.videos, resultType: 'video' });
                        if (output.gifs) assetSources.push({ entries: output.gifs, resultType: 'video' });
                    }

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

                    if (downloadedAssets.length > 0) {
                        const imageAssets = downloadedAssets.filter(asset => asset.type === 'image');
                        const videoAssets = downloadedAssets.filter(asset => asset.type === 'video');
                        const finalOutput: LocalGenerationStatus['final_output'] = {
                            type: downloadedAssets[0].type,
                            data: downloadedAssets[0].data,
                            filename: downloadedAssets[0].filename,
                            assets: downloadedAssets,
                        };

                        if (imageAssets.length > 0) {
                            finalOutput.images = imageAssets.map(asset => asset.data);
                        }
                        if (videoAssets.length > 0) {
                            finalOutput.videos = videoAssets.map(asset => asset.data);
                        }

                        finished = true;
                        clearTimeout(timeout);
                        clearInterval(pollingInterval);
                        onProgress?.({ status: 'complete', message: 'Generation complete!', final_output: finalOutput });
                        resolve(finalOutput);
                    } else {
                        finished = true;
                        clearTimeout(timeout);
                        clearInterval(pollingInterval);
                        reject(new Error('Generation completed but no output files found.'));
                    }
                } else if (status?.status_str === 'error') {
                    finished = true;
                    clearTimeout(timeout);
                    clearInterval(pollingInterval);
                    const errorMessage = status.messages?.find((m: any) => m[0] === 'execution_error')?.[1]?.exception_message || 'ComfyUI generation failed.';
                    reject(new Error(errorMessage));
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
                console.log(`[waitForComfyCompletion] promptId=${promptId.slice(0,8)}... status=${update.status} hasOutput=${!!update.final_output} finished=${finished}`);
            }
            
            onProgress?.(update);
            if (!finished && update.status === 'complete' && update.final_output) {
                finished = true;
                clearTimeout(timeout);
                clearInterval(pollingInterval);
                console.log(`[waitForComfyCompletion] ✓ Resolving Promise for ${promptId.slice(0,8)}... (via WebSocket)`);
                resolve(update.final_output);
            } else if (!finished && update.status === 'error') {
                finished = true;
                clearTimeout(timeout);
                clearInterval(pollingInterval);
                console.log(`[waitForComfyCompletion] ✗ Rejecting Promise for ${promptId.slice(0,8)}...`);
                reject(new Error(update.message || 'ComfyUI generation failed.'));
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
    const basePromptParts = [
        SINGLE_FRAME_PROMPT,
        'SINGLE ESTABLISHING SHOT ONLY: Cinematic establishing frame, high fidelity, 4K resolution. ONE unified composition with consistent lighting and perspective throughout the entire frame.',
        `Scene content: ${sceneSummary}`,
        // Note: Director's vision is already embedded in sceneSummary, so we don't duplicate it here
        'Generate ONE CONTINUOUS IMAGE capturing this single moment. Do not divide the frame. Do not show multiple time periods or locations. This is a single unified scene, not a sequence or comparison.'
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
    logApiCall: ApiLogCallback,
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
 * Bookend Workflow: Generate video from start and end keyframes
 * @param settings ComfyUI configuration
 * @param scene Scene with bookend keyframes
 * @param timeline Timeline data
 * @param bookends Start and end keyframe images
 * @param logApiCall API call logging function
 * @param onStateChange State change callback
 * @returns Video file path or base64
 */
export async function generateVideoFromBookends(
    settings: LocalGenerationSettings,
    scene: Scene,
    timeline: TimelineData,
    bookends: { start: string; end: string },
    logApiCall: ApiLogCallback,
    onStateChange: (state: any) => void
): Promise<string> {
    console.log(`[Bookend Video] Starting video generation with dual keyframes for scene ${scene.id}`);
    
    // Import payload service
    const { generateVideoRequestPayloads } = await import('./payloadService');
    
    const payloads = generateVideoRequestPayloads(
        timeline,
        '', // directorsVision not used for video prompts
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
 * @param logApiCall API call logging function
 * @param onStateChange State change callback with phase tracking
 * @returns Promise<string> - Path to spliced video file
 */
export async function generateVideoFromBookendsSequential(
    settings: LocalGenerationSettings,
    scene: Scene,
    timeline: TimelineData,
    bookends: { start: string; end: string },
    logApiCall: ApiLogCallback,
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
        '', // directorsVision not used for video prompts
        scene.summary,
        {} // generatedShotImages
    );
    
    // Phase 1: Generate video from start keyframe
    console.log(`[Sequential Bookend] Phase 1: Generating video from START keyframe`);
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
        'wan-i2v'
    );

    if (!startPromptResponse?.prompt_id) {
        throw new Error('Failed to queue start video generation');
    }

    const startOutput = await waitForComfyCompletion(
        settings,
        startPromptResponse.prompt_id,
        (state) => {
            onStateChange({
                phase: 'bookend-start-video',
                ...state,
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
        'wan-i2v'
    );

    if (!endPromptResponse?.prompt_id) {
        throw new Error('Failed to queue end video generation');
    }

    const endOutput = await waitForComfyCompletion(
        settings,
        endPromptResponse.prompt_id,
        (state) => {
            onStateChange({
                phase: 'bookend-end-video',
                ...state,
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
        status: 'processing', 
        progress: 0,
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
        return startOutput.data;
    }

    return spliceResult.outputPath!;
}




