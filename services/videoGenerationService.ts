import { TimelineData, LocalGenerationSettings } from '../types';

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
const generateHumanReadablePrompt = (
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
 * Sends a prompt and an image to a local ComfyUI server.
 * Can operate in a simple mode or an advanced mode with a full workflow.
 * @param url The endpoint URL of the ComfyUI server.
 * @param payloads The generated JSON and text prompts.
 * @param base64Image The base64-encoded keyframe image.
 * @param settings Optional settings for advanced mode, including workflow JSON and mapping.
 */
export const sendToComfyUI = async (
    url: string,
    payloads: { json: string; text: string },
    base64Image: string,
    settings?: LocalGenerationSettings
): Promise<any> => {
    
    // --- Advanced Path ---
    if (settings && settings.workflowJson && settings.mapping && Object.keys(settings.mapping).length > 0) {
        try {
            const workflow = JSON.parse(settings.workflowJson);
            // Deep copy the prompt part of the workflow to avoid modifying any original object
            const promptPayload = JSON.parse(JSON.stringify(workflow.prompt));

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
                             // This assumes the user has a custom node that accepts a base64 string.
                             // Comfy's default `LoadImage` node requires a pre-uploaded filename.
                            dataToInject = base64Image;
                            break;
                    }
                    if (dataToInject !== null) {
                        node.inputs[inputName] = dataToInject;
                    }
                }
            }

            const body = JSON.stringify({ prompt: promptPayload, client_id: `csg_${Date.now()}` });
            const response = await fetch(url, {
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
            console.error("Error processing advanced ComfyUI request:", error);
            throw new Error(`Failed to process advanced ComfyUI workflow. Check workflow JSON and mapping. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // --- Simple Path (Fallback) ---
    const simplePayload = {
        prompt: payloads.text,
        image: base64Image,
    };
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: simplePayload, client_id: `csg_${Date.now()}` }),
    });

    if (!response.ok) {
        let errorMessage = `ComfyUI server responded with status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage += ` - ${errorData.error || errorData.message || JSON.stringify(errorData)}`;
        } catch (e) {
            errorMessage += ` - ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }

    return response.json();
};