import { LocalGenerationSettings, LocalGenerationStatus, TimelineData, Shot, CreativeEnhancers, WorkflowMapping, MappableData, LocalGenerationAsset } from '../types';
import { base64ToBlob } from '../utils/videoUtils';

export const DEFAULT_NEGATIVE_PROMPT = 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur';

// A list of common URLs to try for auto-discovery.
const DISCOVERY_CANDIDATES = [
    'http://127.0.0.1:8000',  // ComfyUI Desktop default
    'http://localhost:8000',
    'http://127.0.0.1:8188',  // ComfyUI standalone default
    'http://localhost:8188',
];

/**
 * Attempts to find a running ComfyUI server by checking a list of common addresses.
 * @returns The URL of the found server, or null if no server is found.
 */
export const discoverComfyUIServer = async (): Promise<string | null> => {
  for (const baseUrl of DISCOVERY_CANDIDATES) {
    try {
      // Use a short timeout to avoid long waits for unresponsive addresses.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

      // Fetch a simple, known endpoint. /system_stats is lightweight and ideal for this check.
      const url = baseUrl.endsWith('/') ? `${baseUrl}system_stats` : `${baseUrl}/system_stats`;
      
      const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
      clearTimeout(timeoutId);

      // A successful response (even if not JSON, just getting a response is enough for discovery)
      if (response.ok) {
        const data = await response.json();
        // A simple check to see if the response looks like ComfyUI's stats
        if (data && data.system && data.devices) {
             return baseUrl;
        }
      }
    } catch (error) {
      // This will catch network errors (server not running), CORS errors (server running but not configured for this origin), and timeouts.
      // We ignore them and proceed to the next candidate.
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout for checks
        const response = await fetch(`${url}/system_stats`, { signal: controller.signal, mode: 'cors' });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}.`);
        }
        const data = await response.json();
        if (!data || !data.system || !data.devices) {
            throw new Error("Connected, but the response doesn't look like a valid ComfyUI server.");
        }
    } catch (error) {
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${url}/system_stats`, { signal: controller.signal, mode: 'cors' });
        clearTimeout(timeoutId);
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
export const getQueueInfo = async (url: string): Promise<{ queue_running: number, queue_pending: number }> => {
    if (!url) {
        throw new Error("Server address is not configured.");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/queue`, { signal: controller.signal, mode: 'cors' });
    clearTimeout(timeoutId);
    if (!response.ok) {
        throw new Error(`Could not retrieve queue info (status: ${response.status}).`);
    }
    const data = await response.json();
    return {
        queue_running: data.queue_running.length,
        queue_pending: data.queue_pending.length,
    };
};

export interface WorkflowProfile {
    workflowJson: string;
    mapping: WorkflowMapping;
}

const resolveWorkflowProfile = (
    settings: LocalGenerationSettings,
    override?: WorkflowProfile
): WorkflowProfile => {
    const workflowJson = override?.workflowJson ?? settings.workflowJson;
    const mapping = override?.mapping ?? settings.mapping ?? {};

    if (!workflowJson) {
        throw new Error("No workflow has been synced from the server.");
    }

    return {
        workflowJson,
        mapping,
    };
};

/**
 * Validates the synced workflow and the consistency of the data mappings.
 * @param settings The current local generation settings.
 * @returns A promise that resolves if validation passes, and rejects with an array of specific error messages otherwise.
 */
export const validateWorkflowAndMappings = (settings: LocalGenerationSettings): void => {
    if (!settings.workflowJson) {
        throw new Error("No workflow has been synced from the server.");
    }

    let workflowApi;
    try {
        workflowApi = JSON.parse(settings.workflowJson);
    } catch (e) {
        throw new Error("The synced workflow is not valid JSON. Please re-sync.");
    }

    const promptPayloadTemplate = workflowApi.prompt || workflowApi;
    if (typeof promptPayloadTemplate !== 'object' || promptPayloadTemplate === null) {
        throw new Error("Synced workflow has an invalid structure. Please re-sync.");
    }

    const mapping = settings.mapping ?? {};
    const mappingErrors: string[] = [];
    const mappedDataTypes = new Set(Object.values(mapping));

    // Stricter checks for essential mappings
    if (!mappedDataTypes.has('human_readable_prompt') && !mappedDataTypes.has('full_timeline_json')) {
        mappingErrors.push("Workflow is missing a mapping for the main text prompt. Please map either 'Human-Readable Prompt' or 'Full Timeline JSON' to a text input in your workflow.");
    }
    if (!mappedDataTypes.has('keyframe_image')) {
        mappingErrors.push("Workflow is missing a mapping for the keyframe image. Please map 'Keyframe Image' to a 'LoadImage' node's 'image' input.");
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
        throw new Error(`Mapping Consistency Errors:\n- ${mappingErrors.join('\n- ')}\nPlease re-sync your workflow or adjust mappings.`);
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
    const baseUrl = url.endsWith('/') ? url : `${url}/`;
    const response = await fetch(`${baseUrl}view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch asset from ComfyUI server. Status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
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
    profileOverride?: WorkflowProfile
): Promise<any> => {
    const profile = resolveWorkflowProfile(settings, profileOverride);

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
        validateWorkflowAndMappings(runtimeSettings);
    } catch(error) {
        // Re-throw the specific error from the checks to be displayed to the user.
        throw error;
    }
    
    // --- ALL CHECKS PASSED, PROCEED WITH GENERATION ---
    try {
        const promptPayload = JSON.parse(JSON.stringify(promptPayloadTemplate));
        const baseUrl = runtimeSettings.comfyUIUrl.endsWith('/') ? runtimeSettings.comfyUIUrl : `${runtimeSettings.comfyUIUrl}/`;
        
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
                
                const uploadResponse = await fetch(`${baseUrl}upload/image`, {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadResponse.ok) throw new Error(`Failed to upload image to ComfyUI. Status: ${uploadResponse.status}`);
                const uploadResult = await uploadResponse.json();
                uploadedImageFilename = uploadResult.name;
            }
        }

        // --- STEP 2: INJECT DATA INTO WORKFLOW BASED ON MAPPING ---
        for (const [key, dataType] of Object.entries(runtimeSettings.mapping)) {
            if (dataType === 'none') continue;

            const [nodeId, inputName] = key.split(':');
            const node = promptPayload[nodeId];
            
            if (node && node.inputs) {
                let dataToInject: any = null;
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
        const body = JSON.stringify({ prompt: promptPayload, client_id: runtimeSettings.comfyUIClientId || `csg_${Date.now()}` });
        const response = await fetch(`${baseUrl}prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        if (!response.ok) {
            let errorMessage = `ComfyUI server responded with status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage += ` - ${errorData.error?.message || JSON.stringify(errorData)}`;
            } catch (e) { /* ignore json parse error */ }
            throw new Error(errorMessage);
        }
        const result = await response.json();
        return {
            ...result,
            systemResources: systemResourcesMessage,
        };

    } catch (error) {
        console.error("Error processing ComfyUI request:", error);
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

    const normalizedUrl = comfyUIUrl.replace(/\/+$/, '');
    const protocol = normalizedUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const wsUrl = `${protocol}${normalizedUrl.replace(/^https?:\/\//, '')}/ws?clientId=${comfyUIClientId}`;
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
                    const outputs = msg.data.output || {};
                    const assetSources: Array<{ entries?: any[]; resultType: LocalGenerationAsset['type'] }> = [
                        { entries: outputs.videos, resultType: 'video' },
                        { entries: outputs.images, resultType: 'image' },
                        { entries: outputs.gifs, resultType: 'video' },
                        { entries: outputs.output, resultType: 'image' },
                    ];

                    const fetchAssetCollection = async (
                        entries: any[] | undefined,
                        resultType: LocalGenerationAsset['type']
                    ): Promise<LocalGenerationAsset[]> => {
                        if (!Array.isArray(entries) || entries.length === 0) {
                            return [];
                        }
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

                    try {
                        onProgress({ message: 'Fetching final output...', progress: 100 });
                        const downloadedAssets: LocalGenerationAsset[] = [];

                        for (const source of assetSources) {
                            const assets = await fetchAssetCollection(source.entries, source.resultType);
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

                            onProgress({
                                status: 'complete',
                                message: 'Generation complete!',
                                final_output: finalOutput,
                            });
                        } else {
                            onProgress({ status: 'complete', message: 'Generation complete! No visual output found in final node.' });
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to fetch final output.";
                        onProgress({ status: 'error', message });
                    }
                    ws.close();
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
): Promise<{ videoPath: string; duration: number; filename: string; frames?: string[] }> => {
    
    const reportProgress = (update: Partial<LocalGenerationStatus>) => {
        if (onProgress) onProgress(update);
        console.log(`[Video Generation] ${update.message}`);
    };

    const {
        queuePrompt = queueComfyUIPrompt,
        trackExecution = trackPromptExecution,
        pollQueueInfo = getQueueInfo,
    } = dependencies ?? {};

    try {
        reportProgress({ status: 'running', message: 'Building video generation prompt...' });
        
        // Step 1: Build human-readable prompt
        const humanPrompt = buildShotPrompt(shot, enhancers, directorsVision);
        
        reportProgress({ status: 'running', message: `Prompt: ${humanPrompt.substring(0, 80)}...` });

        // Step 2: Build payload with shot-specific data
        const appliedNegativePrompt = overrides?.negativePrompt?.trim()?.length
            ? overrides.negativePrompt
            : DEFAULT_NEGATIVE_PROMPT;

        const payloads = {
            json: JSON.stringify({ shot_id: shot.id, description: shot.description }),
            text: humanPrompt,
            structured: [],
            negativePrompt: appliedNegativePrompt
        };

        // Step 3: Queue prompt in ComfyUI
        reportProgress({ status: 'running', message: 'Queuing prompt in ComfyUI...' });
        const promptResponse = await queuePrompt(settings, payloads, keyframeImage || '');
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
            throw new Error('Failed to queue prompt: No prompt_id returned');
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
                reject(new Error('Video generation timeout (5 minutes exceeded)'));
            }, 5 * 60 * 1000);

            // Poll for completion (alternative to WebSocket-only tracking)
            const pollInterval = setInterval(async () => {
                try {
                    const queueInfo = await pollQueueInfo(settings.comfyUIUrl);
                    // If queue is empty and we have output, we're done
                    if (queueInfo.queue_running === 0 && queueInfo.queue_pending === 0 && outputData) {
                        clearInterval(pollInterval);
                        clearTimeout(timeout);
                        
                        // Calculate duration: 25 frames @ 24fps = ~1.04 seconds
                        const frameDuration = frameSequence.length > 0 ? frameSequence.length / 24 : 1.04;
                        
                        resolve({
                            videoPath: outputData.data || `gemdirect1_shot_${shot.id}`,
                            duration: frameDuration,
                            filename: outputData.filename || `gemdirect1_shot_${shot.id}.mp4`,
                            frames: frameSequence.length > 0 ? frameSequence : undefined
                        });
                    }
                } catch (e) {
                    clearInterval(pollInterval);
                    clearTimeout(timeout);
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    reportProgress({ status: 'error', message: `Queue polling failed: ${errorMessage}` });
                    reject(new Error(errorMessage));
                }
            }, 2000);
        });

    } catch (error) {
        reportProgress({
            status: 'error',
            message: `Video generation failed: ${error instanceof Error ? error.message : String(error)}`
        });
        throw error;
    }
};

type GenerateVideoFromShotFn = typeof generateVideoFromShot;


/**
 * Builds a human-readable prompt for a shot with creative enhancers.
 * This format is optimized for video generation models.
 */
export const buildShotPrompt = (
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string
): string => {
    let prompt = `${shot.description}`;

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
            prompt += ` (${enhancerParts.join('; ')})`;
        }
    }

    // Add directors vision context
    if (directorsVision) {
        prompt += ` Style: ${directorsVision}.`;
    }

    return prompt.trim();
};

export interface TimelineGenerationOptions {
    dependencies?: VideoGenerationDependencies;
    shotGenerator?: GenerateVideoFromShotFn;
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
): Promise<Record<string, { videoPath: string; duration: number; filename: string }>> => {
    
    const results: Record<string, { videoPath: string; duration: number; filename: string }> = {};
    const shotExecutor = options?.shotGenerator ?? generateVideoFromShot;
    const shotDependencies = options?.dependencies;
    
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
        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                reject(new Error('ComfyUI generation timeout (3 minutes exceeded).'));
            }
        }, 3 * 60 * 1000);

        trackPromptExecution(settings, promptId, (update) => {
            onProgress?.(update);
            if (!finished && update.status === 'complete' && update.final_output) {
                finished = true;
                clearTimeout(timeout);
                resolve(update.final_output);
            } else if (!finished && update.status === 'error') {
                finished = true;
                clearTimeout(timeout);
                reject(new Error(update.message || 'ComfyUI generation failed.'));
            }
        });
    });
};

export const generateSceneKeyframeLocally = async (
    settings: LocalGenerationSettings,
    directorsVision: string,
    sceneSummary: string,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<string> => {
    const prompt = [
        'Cinematic establishing frame, high fidelity, 4K resolution, 16:9 aspect ratio.',
        `Scene summary: ${sceneSummary}`,
        `Director's vision: ${directorsVision}`,
        'Render a single still image that captures the mood, palette, and lighting cues of this scene.'
    ].join('\n');

    const payloads = {
        json: JSON.stringify({ scene_summary: sceneSummary, directors_vision: directorsVision }),
        text: prompt,
        structured: [],
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    };

    const response = await queueComfyUIPrompt(settings, payloads, '');
    if (!response?.prompt_id) {
        throw new Error('Failed to queue prompt: No prompt_id returned.');
    }

    const finalOutput = await waitForComfyCompletion(settings, response.prompt_id, onProgress);
    if (!finalOutput?.data) {
        throw new Error('ComfyUI did not return an image.');
    }

    return stripDataUrlPrefix(finalOutput.data);
};

export const generateShotImageLocally = async (
    settings: LocalGenerationSettings,
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    sceneSummary: string,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<string> => {
    const shotPrompt = buildShotPrompt(shot, enhancers, directorsVision);
    const payloads = {
        json: JSON.stringify({ shot_id: shot.id, scene_summary: sceneSummary }),
        text: shotPrompt,
        structured: [],
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    };

    const response = await queueComfyUIPrompt(settings, payloads, '');
    if (!response?.prompt_id) {
        throw new Error('Failed to queue prompt: No prompt_id returned.');
    }

    const finalOutput = await waitForComfyCompletion(settings, response.prompt_id, onProgress);
    if (!finalOutput?.data) {
        throw new Error('ComfyUI did not return an image.');
    }

    return stripDataUrlPrefix(finalOutput.data);
};
