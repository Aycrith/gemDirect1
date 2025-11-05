import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CoDirectorResult, Shot, StoryBible, Scene, TimelineData } from "../types";
import { FRAMING_OPTIONS, MOVEMENT_OPTIONS, LENS_OPTIONS, PACING_OPTIONS, LIGHTING_OPTIONS, MOOD_OPTIONS, VFX_OPTIONS, PLOT_ENHANCEMENTS_OPTIONS } from "../utils/cinematicTerms";

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const model = 'gemini-2.5-flash';

const commonError = "An error occurred. Please check the console for details. If the error persists, the model may be overloaded.";

export const generateStoryBible = async (idea: string): Promise<StoryBible> => {
    const prompt = `You are a master storyteller and screenwriter. Based on the following user idea, generate a compelling "Story Bible" that establishes a strong narrative foundation. The tone should be cinematic and evocative.

    User Idea: "${idea}"

    Your task is to create a JSON object containing:
    1.  **logline**: A single, concise sentence that captures the essence of the story (protagonist, goal, conflict).
    2.  **characters**: A markdown-formatted list of 2-3 key characters with a brief, compelling description for each.
    3.  **setting**: A paragraph describing the world, time, and atmosphere of the story.
    4.  **plotOutline**: A markdown-formatted, 3-act structure (Act I, Act II, Act III) outlining the main plot points.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            logline: { type: Type.STRING },
            characters: { type: Type.STRING },
            setting: { type: Type.STRING },
            plotOutline: { type: Type.STRING },
        },
        required: ['logline', 'characters', 'setting', 'plotOutline'],
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        return JSON.parse(response.text.trim()) as StoryBible;
    } catch (error) {
        console.error("Error generating Story Bible:", error);
        throw new Error(`Failed to generate Story Bible. ${commonError}`);
    }
};

export const generateSceneList = async (plotOutline: string): Promise<Array<{ title: string; summary: string }>> => {
    const prompt = `You are an expert film director. Your task is to break down the following plot outline into a series of distinct, actionable scenes. Each scene should represent a specific event or moment in the story.

    Plot Outline:
    ${plotOutline}

    Generate a JSON array where each object has:
    1.  **title**: A short, evocative title for the scene (e.g., "The Rooftop Chase," "A Desperate Bargain").
    2.  **summary**: A one-sentence description of what happens in this scene.`;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
            },
            required: ['title', 'summary'],
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error generating scene list:", error);
        throw new Error(`Failed to generate scene list. ${commonError}`);
    }
};

export const generateInitialShotsForScene = async (storyBible: StoryBible, scene: { title: string; summary: string }, previousSceneSummary?: string): Promise<string[]> => {
    const prompt = `You are a visionary cinematographer. Your task is to create an initial shot list for a scene. The shot descriptions should be concise and focused on the visual action.

    **Overall Story Context:**
    - Logline: ${storyBible.logline}
    - Setting: ${storyBible.setting}
    ${previousSceneSummary ? `
    **Previous Scene Summary (for context):**
    - ${previousSceneSummary}` : ''}

    **Current Scene:**
    - Title: ${scene.title}
    - Summary: ${scene.summary}

    Based on the context, generate a JSON array of 3-5 strings. Each string is a description for a single cinematic shot that visually tells the story of this scene. Make sure the shots logically follow from the previous scene if provided.`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING },
    };
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', // Use a more powerful model for creative shot generation
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("Error generating initial shots:", error);
        throw new Error(`Failed to generate shots for scene. ${commonError}`);
    }
};

export const getCoDirectorSuggestions = async (storyBible: StoryBible, activeScene: Scene, objective: string): Promise<CoDirectorResult> => {
    const timelineString = activeScene.timeline.shots.map((shot, index) => {
        const transition = activeScene.timeline.transitions[index] ? `\n--[${activeScene.timeline.transitions[index]}]-->\n` : '';
        return `Shot ${index + 1} (${shot.id}): ${shot.description}${transition}`;
    }).join('');

    const prompt = `
You are an expert AI Film Co-Director. Your task is to analyze a cinematic timeline within the context of the larger story and a creative objective, then provide creative and actionable suggestions.

**Overall Story Bible:**
- Logline: ${storyBible.logline}
- Key Plot Points: ${storyBible.plotOutline}

**Current Scene Context:**
- Scene: ${activeScene.title} - ${activeScene.summary}
- This scene is a crucial part of the story. Your suggestions must align with the overall narrative arc.

**Current Shot-List for this Scene:**
${timelineString}

**Creative Objective:**
"${objective}"

**Your Task & CRITICAL JSON FORMATTING INSTRUCTIONS:**
Your ENTIRE output MUST be a single, valid JSON object that perfectly adheres to the provided schema.
- **The most critical rule is handling quotation marks inside JSON strings.** If you need to include a double quote character (") inside any string value (like in the 'reasoning' or 'description' fields), you MUST escape it with a backslash (e.g., "The character yelled, \\"Stop!\\""). Failure to do this will result in an invalid JSON.
- Do not add any text or markdown formatting before or after the JSON object.
- **Thematic Concept (thematic_concept)**: A short, evocative theme (2-5 words).
- **Reasoning (reasoning)**: Explain your strategy. How do the changes serve the objective and the overall story?
- **Suggested Changes (suggested_changes)**: Provide a list of 5-8 specific, cohesive changes. Use the provided cinematic vocabulary. Be bold and transformative.
- **Vocabulary (for 'enhancers' payload)**: Use exact string values from these lists:
    *   framing: [${FRAMING_OPTIONS.join(', ')}]
    *   movement: [${MOVEMENT_OPTIONS.join(', ')}]
    *   lens: [${LENS_OPTIONS.join(', ')}]
    *   pacing: [${PACING_OPTIONS.join(', ')}]
    *   lighting: [${LIGHTING_OPTIONS.join(', ')}]
    *   mood: [${MOOD_OPTIONS.join(', ')}]
    *   vfx: [${VFX_OPTIONS.join(', ')}]
    *   plotEnhancements: [${PLOT_ENHANCEMENTS_OPTIONS.join(', ')}]
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            thematic_concept: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            suggested_changes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, description: "'UPDATE_SHOT', 'ADD_SHOT_AFTER', 'UPDATE_TRANSITION'." },
                        shot_id: { type: Type.STRING },
                        after_shot_id: { type: Type.STRING },
                        transition_index: { type: Type.INTEGER },
                        payload: {
                            type: Type.OBJECT,
                            properties: {
                                description: { type: Type.STRING },
                                title: { type: Type.STRING },
                                enhancers: { 
                                    type: Type.OBJECT,
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
                                type: { type: Type.STRING }
                            }
                        },
                        description: { type: Type.STRING }
                    },
                    required: ['type', 'payload', 'description']
                }
            }
        },
        required: ['thematic_concept', 'reasoning', 'suggested_changes']
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        return JSON.parse(response.text.trim()) as CoDirectorResult;
    } catch (error) {
        console.error("Error getting co-director suggestions:", error);
        throw new Error(`Failed to get suggestions. ${commonError}`);
    }
};

export const generateImagePrompt = async (timelineData: TimelineData): Promise<string> => {
    const { shots, shotEnhancers, negativePrompt } = timelineData;

    let detailedTimeline = shots.map((shot) => {
        let shotString = `Shot: ${shot.description}\n`;
        const enhancers = shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            const styleElements = Object.entries(enhancers)
                .map(([key, value]) => Array.isArray(value) && value.length > 0 ? `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value.join(', ')}` : null)
                .filter(Boolean);
            if(styleElements.length > 0) shotString += '  Style: ' + styleElements.join('; ') + '\n';
        }
        return shotString;
    }).join('');

    const prompt = `
        You are an expert prompt engineer for a state-of-the-art generative image AI. Your task is to synthesize the provided cinematic timeline into a single, cohesive, and powerful generative prompt. The goal is to create a photorealistic, cinematic still image that captures the key moment of the scene with impeccable quality.

        **CRITICAL INSTRUCTIONS FOR PROMPT CREATION:**
        - **Synthesize, Don't List:** Do not just list the shots. Weave the descriptions and styles into a fluid, descriptive narrative for a single, powerful image.
        - **Ground the Scene:** Ensure all characters and objects are physically grounded. Explicitly describe their interaction with the environment (e.g., "feet firmly on the muddy ground," "hand resting on the stone wall"). Avoid any sense of floating or illogical placement.
        - **Perspective and Composition:** Create a clear and believable camera perspective. Use compositional rules (like the rule of thirds) to create a visually appealing and dramatic image. Avoid bizarre or physically impossible camera angles.
        - **Realism is Key:** Emphasize photorealism, detailed textures, and realistic lighting.

        **Provided Cinematic Timeline:**
        ${detailedTimeline}

        **Global Style Notes / Negative Prompt (AVOID THESE):**
        "${negativePrompt || 'None'}"

        **Your Task:**
        Combine all shot descriptions, styles, and global notes into one single paragraph. This prompt should be a fluid, descriptive narrative for a single, powerful image representing the scene.
        - Focus on the most visually striking moment or the emotional core of the scene.
        - The final output MUST be a single block of raw prompt text. Do not include transitions.
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating image prompt:", error);
        throw new Error("Failed to generate the final image prompt.");
    }
};

export const generateSceneImage = async (
    timelineData: TimelineData,
    previousImageBase64?: string
): Promise<string> => {
    const prompt = await generateImagePrompt(timelineData);
    
    const imagePart = previousImageBase64 ? {
        inlineData: {
            mimeType: 'image/jpeg',
            data: previousImageBase64,
        },
    } : null;

    const textPart = {
        text: `Based on the previous image (if provided) for visual continuity, and the following prompt, generate a new cinematic image that continues the story. Prompt: "${prompt}"`
    };

    const parts = imagePart ? [imagePart, textPart] : [textPart];

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return part.inlineData.data;
            }
        }
        throw new Error("No image was generated in the response.");

    } catch (error) {
        console.error("Error generating scene image:", error);
        throw new Error(`Failed to generate scene image. ${commonError}`);
    }
};

export const analyzeVideoFrames = async (frames: string[]): Promise<string> => {
    const prompt = `You are a professional film analyst and editor. Your task is to analyze the following sequence of video frames and provide a detailed, scene-by-scene breakdown.

    For each distinct scene you identify, describe:
    - **Setting:** Where and when is the scene taking place?
    - **Characters:** Who is in the scene and what are they doing?
    - **Key Events:** What are the crucial actions or plot points that occur?
    - **Cinematic Feel:** What is the mood or tone (e.g., tense, fast-paced, dramatic)?

    Provide a cohesive summary of the entire video clip at the end. Format your entire output as well-structured markdown.`;

    const imageParts = frames.map(frame => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame,
        },
    }));

    const contents = { parts: [{ text: prompt }, ...imageParts] };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', // Using a powerful model for better analysis
            contents: contents,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error analyzing video frames:", error);
        throw new Error(`Failed to analyze video. ${commonError}`);
    }
};