import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, CoDirectorResult, Shot } from "../types";

// Note: API key is automatically sourced from process.env.API_KEY
// FIX: Initialize GoogleGenAI with a named apiKey parameter as per guidelines.
const ai = new GoogleGenAI({apiKey: process.env.API_KEY as string});

/**
 * Analyzes video frames to identify shots and suggest improvements.
 */
export const analyzeVideoFrames = async (frames: string[]): Promise<AnalysisResult> => {

    // FIX: Use a recommended model for complex text and image tasks.
    const model = 'gemini-2.5-pro'; 

    const prompt = `
        You are an expert film editor. Your task is to analyze a sequence of video frames and break it down into distinct cinematic shots.

        1.  **Identify Every Distinct Shot**: Meticulously analyze the frames to identify every single shot change. A new shot is defined by a clear cut, a significant change in camera angle, or a major shift in subject or location.
        2.  **Format the Output Strictly**: For the 'feedback' field, you MUST list each shot on a new line. Each line must start with the prefix "Shot <number>: " followed by a concise description of the action in that shot.
            Example format:
            "Shot 1: A wide establishing shot of a futuristic city skyline at dusk.
            Shot 2: Close-up on a character's face looking out a window.
            Shot 3: A fast-paced tracking shot following a flying vehicle through canyons of buildings."
        3.  **Create a Generative Prompt**: For the 'improvement_prompt' field, synthesize all the identified shots into a single, cohesive prompt for a generative video AI. This prompt should aim to recreate the sequence with enhanced cinematic quality, incorporating dynamic camera work, lighting, and pacing.

        Interpret the cinematic intent, do not just describe the frames literally.
    `;

    const imageParts = frames.map((frame) => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame,
        },
    }));

    const contents = {
        parts: [
            { text: prompt },
            ...imageParts,
        ],
    };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            feedback: {
                type: Type.STRING,
                description: "A description of all distinct cinematic shots. CRITICAL: Each shot MUST be on a new line and MUST start with 'Shot <number>: ' (e.g., 'Shot 1: ...')."
            },
            improvement_prompt: {
                type: Type.STRING,
                description: "A generative AI prompt to recreate the scene with cinematic enhancements. Use markdown for techniques and '--[Transition]-->' for shot changes."
            }
        },
        required: ['feedback', 'improvement_prompt'],
    };

    try {
        // FIX: Use ai.models.generateContent to generate content as per guidelines.
        const response = await ai.models.generateContent({
            model: model,
            contents: contents,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            },
        });
        
        // FIX: Extract text from response using the .text property as per guidelines.
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);

        return result as AnalysisResult;

    } catch (error) {
        console.error("Error analyzing video frames with Gemini:", error);
        throw new Error("Failed to analyze video. Please check the console for details.");
    }
};


/**
 * Generates co-director suggestions based on a timeline and a creative objective.
 */
export const getCoDirectorSuggestions = async (shots: Shot[], transitions: string[], objective: string): Promise<CoDirectorResult> => {
    
    // FIX: Use a recommended model for complex text tasks.
    const model = 'gemini-2.5-pro';

    const timelineString = shots.map((shot, index) => {
        const transition = transitions[index] ? `\n--[${transitions[index]}]-->\n` : '';
        return `Shot ${index + 1} (${shot.id}): ${shot.description}${transition}`;
    }).join('');

    const prompt = `
        You are an expert AI Film Co-Director. Your task is to analyze a cinematic timeline and a creative objective, then provide actionable suggestions to enhance the final video.

        **Current Timeline:**
        ${timelineString}

        **Creative Objective:**
        "${objective}"

        **Your Task:**
        1.  **Thematic Concept**: Come up with a short, catchy thematic concept (2-5 words) that encapsulates the creative objective for this timeline.
        2.  **Reasoning**: Briefly explain your overall strategy for achieving the objective, based on the provided timeline.
        3.  **Suggested Changes**: Provide a list of 3-5 specific, actionable changes that are creative and diverse. For each change, specify the type of action ('UPDATE_SHOT', 'ADD_SHOT_AFTER', 'UPDATE_TRANSITION'), the target shot ID or transition index, a payload with the new data, and a human-readable description. Suggestions can include completely new shot ideas, combining enhancers, or altering transitions to fit the new theme.
    `;
    
    // This defines the structure of the JSON we expect back from the model.
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            thematic_concept: {
                type: Type.STRING,
                description: "A short, catchy thematic concept (2-5 words) that encapsulates the creative objective."
            },
            reasoning: {
                type: Type.STRING,
                description: "A brief explanation of the overall strategy for achieving the objective."
            },
            suggested_changes: {
                type: Type.ARRAY,
                description: "A list of specific, actionable changes to the timeline.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: { 
                            type: Type.STRING,
                            description: "The type of change: 'UPDATE_SHOT', 'ADD_SHOT_AFTER', or 'UPDATE_TRANSITION'."
                        },
                        shot_id: { 
                            type: Type.STRING,
                            description: "The ID of the shot to update. Required for 'UPDATE_SHOT'."
                        },
                        after_shot_id: { 
                            type: Type.STRING,
                            description: "The ID of the shot after which to add a new shot. Required for 'ADD_SHOT_AFTER'."
                        },
                        transition_index: {
                            type: Type.INTEGER,
                            description: "The zero-based index of the transition to update. Required for 'UPDATE_TRANSITION'."
                        },
                        payload: {
                            type: Type.OBJECT,
                            description: "An object containing the new data for the shot or transition.",
                            properties: {
                                description: { type: Type.STRING },
                                title: { type: Type.STRING },
                                enhancers: { 
                                    type: Type.OBJECT,
                                    description: "Cinematic style enhancers for the shot. All properties are optional.",
                                    properties: {
                                        framing: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        movement: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        lens: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        pacing: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        lighting: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        mood: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        vfx: { type: Type.ARRAY, items: { type: Type.STRING } },
                                        plotEnhancements: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    }
                                },
                                type: { type: Type.STRING } // For transitions
                            }
                        },
                        description: {
                            type: Type.STRING,
                            description: "A human-readable description of the suggested change."
                        }
                    },
                    required: ['type', 'payload', 'description']
                }
            }
        },
        required: ['thematic_concept', 'reasoning', 'suggested_changes']
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            },
        });
        
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);

        return result as CoDirectorResult;

    } catch (error) {
        console.error("Error getting co-director suggestions from Gemini:", error);
        throw new Error("Failed to get suggestions. Please check the console for details.");
    }
};