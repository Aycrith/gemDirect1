import { TimelineData, LocalGenerationSettings } from '../types';
import { base64ToBlob } from '../utils/videoUtils';

/**
 * Generates a structured JSON payload and a human-readable text prompt from timeline data.
 * @param timeline The scene's timeline data.
 * @param directorsVision The overall visual style guide.
 * @param sceneSummary A brief summary of the scene's purpose.
 * @returns An object containing both the JSON payload and a human-readable text prompt.
 */
export const generateVideoRequestPayloads = (
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string
): { json: string; text: string } => {

    const interleavedTimeline = timeline.shots.reduce((acc: any[], shot, index) => {
        const shotData = {
            type: 'shot',
            shot_number: index + 1,
            description: shot.description,
            enhancers: timeline.shotEnhancers[shot.id] || {}
        };
        acc.push(shotData);

        if (index < timeline.transitions.length) {
            const transitionData = {
                type: 'transition',
                transition_type: timeline.transitions[index]
            };
            acc.push(transitionData);
        }

        return acc;
    }, []);

    const payload = {
        request_metadata: {
            tool: "Cinematic Story Generator",
            timestamp: new Date().toISOString(),
            description: "This payload is designed for use with an external video generation model (e.g., via LM Studio, ComfyUI, or another API)."
        },
        generation_config: {
            scene_summary: sceneSummary,
            directors_vision: directorsVision,
            global_negative_prompt: timeline.negativePrompt
        },
        timeline: interleavedTimeline
    };

    const json = JSON.stringify(payload, null, 2);
    const text = generateHumanReadablePrompt(timeline, directorsVision, sceneSummary);

    return { json, text };
};

/**
 * Creates a human-readable, narrative prompt from the timeline data.
 * @param timeline The scene's timeline data.
 * @param directorsVision The overall visual style guide.
 * @param sceneSummary A brief summary of the scene's purpose.
 * @returns A formatted string suitable for use as a descriptive prompt.
 */
export const generateHumanReadablePrompt = (
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string
): string => {
    let prompt = `Create a cinematic sequence. The scene is about: "${sceneSummary}". The overall visual style should be "${directorsVision}".\n\n`;

    timeline.shots.forEach((shot, index) => {
        prompt += `Shot ${index + 1}: ${shot.description}`;
        const enhancers = timeline.shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            const enhancerText = Object.entries(enhancers)
                .map(([key, value]) => {
                    if (Array.isArray(value) && value.length > 0) {
                        return `${key}: ${value.join(', ')}`;
                    }
                    return null;
                })
                .filter(Boolean)
                .join('; ');
            if (enhancerText) {
                prompt += ` (Style: ${enhancerText})`;
            }
        }
        prompt += '.\n';

        if (index < timeline.transitions.length) {
            prompt += `\n--[${timeline.transitions[index]}]-->\n\n`;
        }
    });

    if (timeline.negativePrompt) {
        prompt += `\nGlobal Style & Negative Prompt: ${timeline.negativePrompt}`;
    }

    return prompt.trim();
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
    payloads: { json: string; text: string },
    base64Image: string,
): Promise<any> => {
    
    // --- PRE-FLIGHT CHECK 1: Basic Configuration ---
    if (!settings.comfyUIUrl) {
        throw new Error("ComfyUI server address is not configured. Please set it in Settings.");
    }
    if (!settings.workflowJson) {
        throw new Error("Workflow not synced. Please configure and sync it in Settings.");
    }

    // --- PRE-FLIGHT CHECK 2: Workflow & Mapping Validity ---
    let workflowApi;
    try {
        workflowApi = JSON.parse(settings.workflowJson);
    } catch (e) {
        throw new Error("The synced workflow is not valid JSON. Please re-sync your workflow in Settings.");
    }

    const promptPayloadTemplate = workflowApi.prompt || workflowApi;
    if (typeof promptPayloadTemplate !== 'object' || promptPayloadTemplate === null) {
        throw new Error("Synced workflow has an invalid structure. Please re-sync.");
    }

    // Verify that all mapped inputs still exist in the workflow.
    for (const [key, dataType] of Object.entries(settings.mapping)) {
        if (dataType === 'none') continue;

        const [nodeId, inputName] = key.split(':');
        const node = promptPayloadTemplate[nodeId];

        if (!node) {
            throw new Error(`Configuration Mismatch: Mapped node ID '${nodeId}' not found in your workflow. Please re-sync your workflow in Settings.`);
        }
        if (!node.inputs || typeof node.inputs[inputName] === 'undefined') {
            const nodeTitle = node._meta?.title || `Node ${nodeId}`;
            throw new Error(`Configuration Mismatch: Mapped input '${inputName}' not found on node '${nodeTitle}'. Please re-sync your workflow in Settings.`);
        }
    }
    
    // --- ALL CHECKS PASSED, PROCEED WITH GENERATION ---
    try {
        // Deep copy the prompt object to avoid modifying the stored settings object.
        const promptPayload = JSON.parse(JSON.stringify(promptPayloadTemplate));
        const baseUrl = settings.comfyUIUrl.endsWith('/') ? settings.comfyUIUrl : `${settings.comfyUIUrl}/`;
        
        let uploadedImageFilename: string | null = null;
        
        // --- STEP 1: UPLOAD ASSETS (IF MAPPED) ---
        const imageMappingKey = Object.keys(settings.mapping).find(key => settings.mapping[key] === 'keyframe_image');
        if (imageMappingKey) {
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
        for (const [key, dataType] of Object.entries(settings.mapping)) {
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
                    case 'keyframe_image':
                        if (uploadedImageFilename && node.class_type === 'LoadImage') {
                             dataToInject = uploadedImageFilename;
                        } else {
                            dataToInject = base64Image;
                        }
                        break;
                }
                if (dataToInject !== null) {
                    node.inputs[inputName] = dataToInject;
                }
            }
        }
        
        // --- STEP 3: QUEUE THE PROMPT ---
        const body = JSON.stringify({ prompt: promptPayload, client_id: settings.comfyUIClientId });
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
        return response.json();

    } catch (error) {
        console.error("Error processing ComfyUI request:", error);
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error(`Failed to connect to ComfyUI at '${settings.comfyUIUrl}'. Please check if the server is running and accessible.`);
        }
        throw new Error(`Failed to process ComfyUI workflow. Error: ${error instanceof Error ? error.message : String(error)}`);
    }
};