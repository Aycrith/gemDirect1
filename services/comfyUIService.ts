import { LocalGenerationSettings, LocalGenerationStatus } from '../types';
import { base64ToBlob } from '../utils/videoUtils';

// Fetches an image from the ComfyUI server and converts it to a data URL.
const fetchImageAsDataURL = async (url: string, filename: string, subfolder: string, type: string): Promise<string> => {
    const response = await fetch(`${url}view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(type)}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ComfyUI server. Status: ${response.status}`);
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
    payloads: { json: string; text: string; structured: any[] },
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

    const promptPayloadTemplate = workflowApi.prompt || workflowApi; // Handle both API and embedded formats
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
                        }
                        break;
                }
                if (dataToInject !== null) {
                    node.inputs[inputName] = dataToInject;
                }
            }
        }
        
        // --- STEP 3: QUEUE THE PROMPT ---
        const body = JSON.stringify({ prompt: promptPayload, client_id: settings.comfyUIClientId || `csg_${Date.now()}` });
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

    const wsUrl = `ws://${comfyUIUrl.replace(/^https?:\/\//, '')}/ws?clientId=${comfyUIClientId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('ComfyUI WebSocket connection established.');
    };

    ws.onmessage = async (event) => {
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

            case 'executed':
                if (msg.data.prompt_id === promptId) {
                    const outputs = msg.data.output;
                    // Check for common output types
                    const imageOutput = outputs.images?.[0] || outputs.gifs?.[0]; 

                    if (imageOutput) {
                        try {
                            onProgress({ message: 'Fetching final output...', progress: 100 });
                            const outputUrl = await fetchImageAsDataURL(
                                comfyUIUrl.endsWith('/') ? comfyUIUrl : `${comfyUIUrl}/`,
                                imageOutput.filename,
                                imageOutput.subfolder,
                                imageOutput.type
                            );
                            onProgress({
                                status: 'complete',
                                message: 'Generation complete!',
                                final_output: {
                                    type: imageOutput.type === 'output' ? 'image' : 'video', // 'output' is typically image, 'temp' can be video previews
                                    data: outputUrl,
                                    filename: imageOutput.filename,
                                },
                            });
                        } catch (error) {
                             const message = error instanceof Error ? error.message : "Failed to fetch final output.";
                             onProgress({ status: 'error', message });
                        }
                    } else {
                         // If no image output, but execution finished, it's complete.
                        onProgress({ status: 'complete', message: 'Generation complete! No visual output found in final node.' });
                    }
                    ws.close(); // Close connection after completion
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