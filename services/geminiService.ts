import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, CoDirectorResult, Shot, TimelineData } from "../types";

// Note: API key is automatically sourced from process.env.API_KEY
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

/**
 * Analyzes video frames to identify shots and suggest improvements.
 */
export const analyzeVideoFrames = async (frames: string[]): Promise<AnalysisResult> => {
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
        const response = await ai.models.generateContent({
            model: model,
            contents: contents,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
            },
        });
        
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
        3.  **Suggested Changes**: Provide a list of 5-8 specific, actionable changes. Your suggestions should work together as a cohesive whole to transform the scene according to the objective. Propose creative changes across different cinematic categories (e.g., add a new shot, change camera movement, adjust lighting, add VFX) to create a unified and impactful result. For each change, specify the type of action ('UPDATE_SHOT', 'ADD_SHOT_AFTER', 'UPDATE_TRANSITION'), the target shot ID or transition index, a payload with the new data, and a human-readable description.
        
        **CRITICAL JSON FORMATTING RULES**:
        - Your entire output MUST be a single, valid JSON object that strictly adheres to the provided schema. Do not include any text, explanations, or markdown formatting (like \`\`\`json) outside of this JSON object.
        - **ESCAPE DOUBLE QUOTES**: This is the most important rule. Any double quote character (") that appears inside a JSON string value MUST be escaped with a backslash (\\). An unescaped quote will break the entire response.
        - **CORRECT EXAMPLE**: If a description is 'Add a "Dutch Tilt" camera angle', the JSON string value must be "Add a \\"Dutch Tilt\\" camera angle".
        - **STRONGLY PREFERRED ALTERNATIVE**: To avoid errors, please try to rephrase sentences to use single quotes (' ') instead of double quotes (" ") whenever possible. Single quotes do not need to be escaped and are much safer. For example, write "Add a 'Dutch Tilt' camera angle" instead of the above.
        - This rule is mandatory for all string fields, especially the 'description' field.
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
                            description: "A human-readable description of the suggested change. IMPORTANT: Any double quotes within this string must be escaped, e.g., \\\"a quote\\\"."
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


/**
 * Generates a final, cohesive remix prompt from the timeline data.
 */
export const generateRemixPrompt = async (timelineData: TimelineData): Promise<string> => {
    const { shots, shotEnhancers, transitions, negativePrompt } = timelineData;
    const model = 'gemini-2.5-pro';

    let detailedTimeline = '';
    shots.forEach((shot, index) => {
        detailedTimeline += `Shot ${index + 1}: ${shot.description}\n`;
        const enhancers = shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            detailedTimeline += '  Style: ';
            const styleElements = Object.entries(enhancers)
                .map(([key, value]) => {
                    if (Array.isArray(value) && value.length > 0) {
                        // A simple way to make the key more readable
                        const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                        return `${formattedKey}: ${value.join(', ')}`;
                    }
                    return null;
                })
                .filter(Boolean);
            detailedTimeline += styleElements.join('; ') + '\n';
        }

        if (index < transitions.length && transitions[index]) {
            detailedTimeline += `\n--[${transitions[index]}]-->\n\n`;
        }
    });

    const prompt = `
        You are an expert prompt engineer for a generative video AI. Your task is to synthesize a detailed cinematic timeline into a single, cohesive, and powerful generative prompt.

        **Provided Cinematic Timeline:**
        ${detailedTimeline}

        **Global Style Notes / Negative Prompt:**
        "${negativePrompt || 'None'}"

        **Your Task:**
        Combine all the shot descriptions, cinematic styles, transitions, and global notes into one single paragraph. This prompt should be a fluid, descriptive narrative that an AI video generator can use to create the entire sequence.
        - Start with the global style notes if any are provided.
        - Describe each shot and its specific style enhancers naturally within the narrative.
        - Use the format "--[Transition Name]-->" to clearly indicate the transition between shots.
        - The final output MUST be a single block of text. Do not use markdown formatting like backticks or lists. Just return the raw prompt text.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating remix prompt:", error);
        throw new Error("Failed to generate the final remix prompt.");
    }
};