import { TimelineData } from '../types';

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
