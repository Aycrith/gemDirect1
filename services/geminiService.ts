import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CoDirectorResult, Shot, StoryBible, Scene, TimelineData, CreativeEnhancers, ContinuityResult } from "../types";

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const model = 'gemini-2.5-flash';
const proModel = 'gemini-2.5-pro';

const commonError = "An error occurred. Please check the console for details. If the error persists, the model may be overloaded.";

// Centralized API error handler
const handleApiError = (error: unknown, context: string): Error => {
    console.error(`Error during ${context}:`, error);
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Check for specific markers of a rate limit or quota error
        if (message.includes('429') || message.includes('quota') || message.includes('resource_exhausted')) {
            return new Error(`API rate limit exceeded during ${context}. Please check your plan and billing details, or wait and try again.`);
        }
    }
    // Fallback to a generic error if the specific check fails
    return new Error(`Failed to ${context}. ${commonError}`);
};

// --- Exponential Backoff Retry Logic ---
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

const withRetry = async <T>(apiCall: () => Promise<T>, context: string): Promise<T> => {
    let lastError: unknown = new Error(`API call failed for ${context}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await apiCall();
        } catch (error) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
            const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('resource_exhausted');
            
            if (isRateLimitError && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000; // add jitter
                console.warn(`Rate limit hit on "${context}". Retrying in ${Math.round(delay/1000)}s... (Attempt ${attempt + 1})`);
                await new Promise(res => setTimeout(res, delay));
            } else {
                // Not a rate-limit error, or this was the final attempt. Break and throw.
                break;
            }
        }
    }
    throw handleApiError(lastError, context);
};


// --- Core Story Generation ---

export const generateStoryBible = async (idea: string): Promise<StoryBible> => {
    const context = 'generate Story Bible';
    const prompt = `You are a master storyteller and screenwriter, deeply familiar with literary principles. Based on the following user idea, generate a compelling "Story Bible" that establishes a strong, plot-driven narrative foundation.

    User Idea: "${idea}"

    Your task is to create a JSON object containing:
    1.  **logline**: A single, concise sentence that captures the essence of the story (protagonist, goal, conflict).
    2.  **characters**: A markdown-formatted list of 2-3 key characters with a brief, compelling description for each.
    3.  **setting**: A paragraph describing the world, time, and atmosphere of the story.
    4.  **plotOutline**: A markdown-formatted, 3-act structure (Act I, Act II, Act III). **Crucially, you must structure this plot using archetypal stages of 'The Hero's Journey' as a guide.** For example, Act I should contain 'The Ordinary World' and 'The Call to Adventure'. Act II should build through 'Tests, Allies, and Enemies' to 'The Ordeal'. Act III should cover 'The Road Back' and 'The Resurrection'. This structure is essential for producing a high-quality, resonant story.`;

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
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for Story Bible.");
        }
        return JSON.parse(text.trim()) as StoryBible;
    };

    return withRetry(apiCall, context);
};

export const generateSceneList = async (plotOutline: string, directorsVision: string): Promise<Array<{ title: string; summary: string }>> => {
    const context = 'generate scene list';
    const prompt = `You are an expert film director with a strong understanding of narrative pacing. Your task is to break down the following plot outline into a series of distinct, actionable scenes, keeping the overall cinematic vision in mind.

    **Plot Outline (Structured on The Hero's Journey):**
    ${plotOutline}

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    Based on the above context, generate a JSON array of scenes. For each scene, consider its function within the broader narrative structure. Each scene object should have:
    1.  **title**: A short, evocative title for the scene that aligns with the Director's Vision.
    2.  **summary**: A one-sentence description of what happens in this scene and its primary narrative purpose (e.g., "The hero meets their mentor and receives a crucial tool," or "The hero faces their first major test, revealing their core weakness.").`;

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

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for scene list.");
        }
        return JSON.parse(text.trim());
    };

    return withRetry(apiCall, context);
};

export const generateInitialShotsForScene = async (
    logline: string,
    narrativeContext: string,
    sceneSummary: string,
    directorsVision: string,
): Promise<string[]> => {
    const context = 'generate shots for scene';
    const prompt = `You are a visionary cinematographer who understands that every shot must serve the story. Create an initial shot list for a scene, ensuring it aligns with the Director's Vision and the scene's specific purpose within the overall plot.

    **Director's Vision / Cinematic Style (includes potential Animation Styles):**
    "${directorsVision}"

    **Overall Story Logline:**
    ${logline}

    **Narrative Context (Current Act & Adjacent Scenes):**
    ${narrativeContext}

    **Current Scene Summary & Purpose:**
    ${sceneSummary}

    **Your Task:**
    Based on all the context, especially the scene's place in the provided narrative context, generate a JSON array of 3-5 strings. Each string is a description for a single cinematic shot that visually tells the story of this scene. For example, if this scene is 'The Ordeal', the shots should be tense and climactic. If it's 'Meeting the Mentor', they should establish wisdom and guidance.`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING },
    };
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for initial shots.");
        }
        return JSON.parse(text.trim());
    };

    return withRetry(apiCall, context);
};

// --- AI-Assisted Guidance & Suggestions ---

export const suggestStoryIdeas = async (): Promise<string[]> => {
    const context = 'suggest ideas';
    const prompt = "You are a creative muse. Generate 3 diverse and compelling one-sentence story ideas for a cinematic experience. Return a JSON array of strings.";
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for story ideas.");
        }
        return JSON.parse(text.trim());
    };
    
    return withRetry(apiCall, context);
};

export const suggestDirectorsVisions = async (storyBible: StoryBible): Promise<string[]> => {
    const context = 'suggest visions';
    const prompt = `You are a film theorist and animation historian. Based on this story bible, suggest 3 distinct and evocative "Director's Visions". These can be live-action cinematic styles or animation art styles. Each should be a short paragraph that describes the visual language.

    **Story Bible:**
    - Logline: ${storyBible.logline}
    - Plot: ${storyBible.plotOutline}

    Return a JSON array of strings.

    Example cinematic style: "A gritty, neo-noir aesthetic with high-contrast, low-key lighting (chiaroscuro), constant rain, and a sense of urban decay. Camera work is mostly handheld and claustrophobic."
    Example animation style: "A dynamic, comic-book visual language like 'Into the Spider-Verse', using Ben-Day dots, expressive text on-screen, and variable frame rates to heighten the action."`;
    
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for director's visions.");
        }
        return JSON.parse(text.trim());
    };

    return withRetry(apiCall, context);
};

export const suggestCoDirectorObjectives = async (logline: string, sceneSummary: string, directorsVision: string): Promise<string[]> => {
    const context = 'suggest objectives';
    const prompt = `You are a creative film director's assistant. Based on the provided story logline, scene summary, and director's vision, suggest 3 diverse and actionable creative objectives for the AI Co-Director. The objectives should be concise, starting with a verb, and guide the AI towards a specific creative direction for the scene.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    **Story Logline:**
    - ${logline}

    **Current Scene Summary:**
    - ${sceneSummary}

    Return a JSON array of 3 strings.

    Example objectives:
    - "Inject a sense of paranoia and claustrophobia."
    - "Emphasize the romantic tension between the characters."
    - "Create a fast-paced, high-energy action sequence."`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING },
    };
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for co-director objectives.");
        }
        return JSON.parse(text.trim());
    };

    return withRetry(apiCall, context);
};

export const refineStoryBibleField = async (field: keyof StoryBible, fullBibleContext: StoryBible): Promise<string> => {
    const context = `refine ${field}`;
    const currentValue = fullBibleContext[field];
    const prompt = `You are an expert editor. A user is working on a story bible and wants to refine one section. Based on the full story context, revise the following **${field}** to be more compelling, concise, and cinematic.

    **Full Story Bible Context:**
    - Logline: ${fullBibleContext.logline}
    - Characters: ${fullBibleContext.characters}
    - Setting: ${fullBibleContext.setting}
    - Plot Outline: ${fullBibleContext.plotOutline}

    **Current ${field.toUpperCase()} to Refine:**
    "${currentValue}"

    **Your Task & CRITICAL JSON FORMATTING:**
    Your ENTIRE output must be a single, valid JSON object with a single key "refined_text".
    - **CRITICAL:** If you use any double quotes (") inside the "refined_text" string, you MUST escape them with a backslash (\\").
    - Do not add any text or markdown formatting before or after the JSON object.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: { refined_text: { type: Type.STRING } },
        required: ['refined_text'],
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error(`The model returned an empty response when refining ${field}.`);
        }
        const parsed = JSON.parse(text.trim());
        return parsed.refined_text;
    };

    return withRetry(apiCall, context);
};

export const refineShotDescription = async (
    shotDescription: string, 
    sceneSummary: string,
    logline: string, 
    directorsVision: string
): Promise<string> => {
    const context = 'refine description';
    const prompt = `You are a screenwriter and cinematographer. Refine the following shot description to be more vivid, detailed, and cinematic. Ensure it aligns with the scene's context and the director's overall vision.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    **Scene Summary:**
    ${sceneSummary}
    
    **Story Logline:**
    ${logline}

    **Current Shot Description to Refine:**
    "${shotDescription}"

    **Your Task & CRITICAL JSON FORMATTING:**
    Your ENTIRE output must be a single, valid JSON object with a single key "refined_description".
    - **CRITICAL:** If you use any double quotes (") inside the "refined_description" string, you MUST escape them with a backslash (\\"). For example: "The hero shouted, \\"Look out!\\" as the ship tilted."
    - Do not add any text or markdown formatting before or after the JSON object.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: { refined_description: { type: Type.STRING } },
        required: ['refined_description'],
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response when refining shot description.");
        }
        const parsed = JSON.parse(text.trim());
        return parsed.refined_description;
    };

    return withRetry(apiCall, context);
};

export const suggestShotEnhancers = async (
    shotDescription: string, 
    sceneSummary: string, 
    logline: string, 
    directorsVision: string
): Promise<Partial<Omit<CreativeEnhancers, 'transitions'>>> => {
    const context = 'suggest enhancers';
    const prompt = `You are an expert AI Cinematographer. For the given shot, suggest a cohesive set of creative enhancers that align with the scene's context and the overall Director's Vision.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"
    
    **Story Logline:**
    ${logline}

    **Scene Summary:**
    "${sceneSummary}"

    **Shot Description:**
    "${shotDescription}"

    **Your Task & CRITICAL JSON FORMATTING:**
    Your ENTIRE output MUST be a single, valid JSON object that perfectly adheres to the provided schema. Select 1-2 appropriate cinematic terms for each relevant category. Only include categories that are highly relevant; do not suggest for every category.

    **Categories to consider:**
    framing, movement, lens, pacing, lighting, mood, vfx, plotEnhancements.
    `;
    
    const responseSchema = {
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
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for shot enhancers.");
        }
        return JSON.parse(text.trim());
    };

    return withRetry(apiCall, context);
};


// --- Co-Director & Generation ---
export const generateSceneImage = async (timelineData: TimelineData, directorsVision: string, previousImageBase64?: string): Promise<string> => {
    const context = 'generate image';
    const { shots, shotEnhancers, negativePrompt } = timelineData;

    const detailedTimeline = shots.map((shot) => {
        let shotString = `- ${shot.description}`;
        const enhancers = shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            const styleElements = Object.entries(enhancers)
                .flatMap(([key, value]) => Array.isArray(value) ? value.map(v => `${key}: ${v}`) : [])
                .filter(Boolean);
            if (styleElements.length > 0) shotString += ` (${styleElements.join(', ')})`;
        }
        return shotString;
    }).join('\n');

    const prompt = `
        **Objective:** Generate a single, cinematic keyframe image representing a scene, strictly adhering to the specified style.

        **Director's Vision / Cinematic or Animation Style:** ${directorsVision}

        **Scene Timeline (key moments):**
        ${detailedTimeline}

        **Negative Prompt (AVOID THESE):** ${negativePrompt || 'None'}

        **Task:** Synthesize the vision and timeline into a concise, descriptive prompt for an image generator. The prompt must describe the single most impactful, representative moment of the scene as a static image. Focus on composition, lighting, character expression, and mood to create a visually stunning keyframe that perfectly matches the Director's Vision. If an animation style is specified, the output must match that style. This is a prompt for a single image, not a video.
    `;

    const imageParts = [];
    if (previousImageBase64) {
        imageParts.push({
            inlineData: {
                data: previousImageBase64.split(',')[1] || previousImageBase64, // handle data URI prefix
                mimeType: 'image/jpeg'
            }
        });
    }

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    ...imageParts,
                    { text: prompt },
                ]
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
            return part.inlineData.data;
        }
        throw new Error("Image generation failed: No image data in response.");
    };

    return withRetry(apiCall, context);
};

export const getCoDirectorSuggestions = async (
    logline: string, 
    narrativeContext: string, 
    activeScene: Scene, 
    objective: string, 
    directorsVision: string
): Promise<CoDirectorResult> => {
    const context = 'get co-director suggestions';
    const timelineString = activeScene.timeline.shots.map((shot, index) => {
        let shotSummary = `Shot ${index + 1}: "${shot.description}"`;
        const enhancers = activeScene.timeline.shotEnhancers[shot.id];

        if (enhancers && Object.keys(enhancers).length > 0) {
            const styleElements = Object.entries(enhancers)
                .flatMap(([key, values]) => {
                    if (Array.isArray(values) && values.length > 0) {
                        return `${key}: ${values.join(', ')}`;
                    }
                    return [];
                });
            
            if (styleElements.length > 0) {
                shotSummary += ` (Enhancers: ${styleElements.join('; ')})`;
            }
        }
        
        const transition = activeScene.timeline.transitions[index];
        if (transition && index < activeScene.timeline.shots.length - 1) {
            return shotSummary + ` --[${transition}]-->`;
        }
        return shotSummary;
    }).join('\n');

    const prompt = `
You are an expert AI Film Co-Director. Your task is to analyze a cinematic timeline and provide creative, actionable suggestions that align with a high-level artistic vision, a specific creative objective, and the scene's narrative purpose.

**Director's Vision / Cinematic Style:**
"${directorsVision}"

**Overall Story Context:**
- Logline: ${logline}
- Current Narrative Act & Context: ${narrativeContext}

**Current Scene Context:**
- Scene: ${activeScene.title} - ${activeScene.summary}

**Current Shot-List & Style for this Scene:**
${timelineString}

**User's Creative Objective for this Scene:**
"${objective}"

**Your Task & CRITICAL JSON FORMATTING INSTRUCTIONS:**
Your ENTIRE output MUST be a single, valid JSON object that perfectly adheres to the provided schema. Your suggestions must improve the current timeline to better align with the Director's Vision, the user's objective, and **the scene's structural purpose within the Hero's Journey framework of the plot.**
- **CRITICAL RULE #1: Your entire response must be a single JSON object. Do not add any text, markdown, or code fences before or after the JSON.**
- **CRITICAL RULE #2: This is the most important rule. Any time you include a double quote character (") inside of a JSON string value, you MUST escape it with a backslash (\\").** For example, if you want to write \`The hero shouted, "Look out!"\`, the JSON string value must be \`"The hero shouted, \\"Look out!\\""\`. Failure to do this will break the application.
- **The instructions to escape quotes are also repeated in the descriptions for each field in the JSON schema. You MUST follow them.**
- **Vocabulary**: When populating the 'enhancers' payload, use common and appropriate cinematic terms for the following categories: framing, movement, lens, pacing, lighting, mood, vfx, and plotEnhancements.
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            thematic_concept: { type: Type.STRING, description: "A short, evocative theme (2-5 words). CRITICAL: All double quotes in this string MUST be escaped with a backslash (e.g., \\\"The Hero's Burden\\\")." },
            reasoning: { type: Type.STRING, description: "Detailed reasoning for the suggested changes. CRITICAL: All double quotes in this string MUST be escaped with a backslash (e.g., \\\"This shot enhances the feeling of isolation...\\\")." },
            suggested_changes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING, description: "'UPDATE_SHOT', 'ADD_SHOT_AFTER', or 'UPDATE_TRANSITION'." },
                        shot_id: { type: Type.STRING, description: "The ID of the shot to update. Only for 'UPDATE_SHOT'." },
                        after_shot_id: { type: Type.STRING, description: "The ID of the shot to add a new shot after. Only for 'ADD_SHOT_AFTER'." },
                        transition_index: { type: Type.INTEGER, description: "The index of the transition to update. Only for 'UPDATE_TRANSITION'." },
                        payload: {
                            type: Type.OBJECT,
                            properties: {
                                description: { type: Type.STRING, description: "The new or updated shot description. CRITICAL: All double quotes MUST be escaped (e.g., \\\"A close-up on the hero's face...\\\")." },
                                title: { type: Type.STRING, description: "The title for a new shot. CRITICAL: All double quotes MUST be escaped." },
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
                                type: { type: Type.STRING, description: "The new transition type (e.g., 'Dissolve')." }
                            }
                        },
                        description: { type: Type.STRING, description: "A human-readable summary of the change being suggested. CRITICAL: All double quotes in this string MUST be escaped (e.g., \\\"This change will improve the pacing...\\\")." }
                    },
                    required: ['type', 'payload', 'description']
                }
            }
        },
        required: ['thematic_concept', 'reasoning', 'suggested_changes']
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for co-director suggestions. This could be due to a content safety block.");
        }
        return JSON.parse(text.trim()) as CoDirectorResult;
    };
    
    return withRetry(apiCall, context);
};

export const generateVideoPrompt = async (timelineData: TimelineData, directorsVision: string): Promise<string> => {
    const context = 'generate video prompt';
    const { shots, shotEnhancers, negativePrompt } = timelineData;

    const detailedTimeline = shots.map((shot, index) => {
        let shotSummary = `${index + 1}. ${shot.description}`;
        const enhancers = shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            const styleElements = Object.entries(enhancers)
                .flatMap(([key, values]) => {
                    if (Array.isArray(values) && values.length > 0) {
                        return `${key}: ${values.join(', ')}`;
                    }
                    return [];
                });
            
            if (styleElements.length > 0) {
                shotSummary += ` [Style: ${styleElements.join('; ')}]`;
            }
        }
        return shotSummary;
    }).join('\n');

    const prompt = `
        You are an expert prompt engineer for a state-of-the-art generative video AI. Your task is to synthesize the provided cinematic timeline and Director's Vision into a single, cohesive, and powerful generative prompt. The goal is to create a short, cinematic video clip that captures the key moment of the scene with impeccable quality.

        **Director's Vision / Desired Cinematic or Animation Style:**
        "${directorsVision}"

        **Provided Cinematic Timeline for the Scene:**
        ${detailedTimeline}

        **Global Style Notes / Negative Prompt (AVOID THESE):**
        "${negativePrompt || 'None'}"

        **Your Task & Prompt Format:**
        Based on ALL the information, create a single, comprehensive paragraph. This paragraph is the final prompt. It should describe the continuous action of a short video clip (3-5 seconds), perfectly capturing the specified **Director's Vision (whether cinematic or animated)**. Start with the most important shot and seamlessly blend details from other shots and enhancers. Describe camera movement, character actions, lighting changes, and the overall mood. Be vivid and concise. **This is the only text that will be fed to the video model, so it must be a masterpiece of descriptive language.**
    `;
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for the video prompt.");
        }
        return text.trim();
    };

    return withRetry(apiCall, context);
};

// --- Video Analysis ---
export const analyzeVideoFrames = async (frames: string[]): Promise<string> => {
    const context = 'analyze video';
    const prompt = `You are an expert film analyst. Analyze the following sequence of video frames and provide a detailed breakdown of the cinematic techniques used.

    **Your analysis should cover:**
    1.  **Cinematography:** Describe camera angles (low, high, eye-level), framing (close-up, wide shot), and any camera movement (pan, tilt, tracking).
    2.  **Editing:** Identify the pacing of the cuts. Are they fast and energetic, or slow and deliberate? Mention any specific transitions if they can be inferred.
    3.  **Lighting & Color:** Describe the lighting style (high-key, low-key, natural) and the overall color palette. What mood does it create?
    4.  **Narrative/Action:** Briefly summarize the action or story being told across the frames. What is the subject, and what are they doing?
    5.  **Overall Impression:** Give your overall assessment of the clip's style and potential genre.

    Present your analysis in well-structured markdown.`;

    const imageParts = frames.map(frame => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame,
        },
    }));

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: { parts: [...imageParts, { text: prompt }] },
        });

        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for video analysis.");
        }
        return text;
    };

    return withRetry(apiCall, context);
};


export const scoreContinuity = async (
    logline: string,
    narrativeContext: string,
    directorsVision: string,
    scene: Scene,
    videoAnalysis: string
): Promise<ContinuityResult> => {
    const context = 'score continuity';
    const timelineString = scene.timeline.shots.map((shot, index) => {
        let shotSummary = `${index + 1}. ${shot.description}`;
        const enhancers = scene.timeline.shotEnhancers[shot.id];
        if (enhancers && Object.keys(enhancers).length > 0) {
            const styleElements = Object.entries(enhancers)
                .flatMap(([key, values]) => (Array.isArray(values) && values.length > 0) ? `${key}: ${values.join(', ')}` : [])
                .filter(Boolean);
            if (styleElements.length > 0) {
                shotSummary += ` [Style: ${styleElements.join('; ')}]`;
            }
        }
        return shotSummary;
    }).join('\n');

    const prompt = `
You are an expert film critic and continuity supervisor. Your task is to analyze a generated video by comparing its cinematic analysis against the original creative intent. Provide a quantitative score, qualitative feedback, and actionable suggestions for improvement.

**PART 1: THE CREATIVE INTENT**

**1.1. Overall Story & Thematic Context:**
- Logline: ${logline}
- Current Narrative Act & Context (Hero's Journey): ${narrativeContext}

**1.2. Director's Vision (Aesthetic Guardrail):**
- "${directorsVision}"

**1.3. Scene-Specific Plan (Narrative & Execution):**
- Scene: ${scene.title} - ${scene.summary}
- Shot-by-Shot Timeline:
${timelineString}

**PART 2: THE ACTUAL OUTPUT**

**2.1. Cinematic Analysis of the Generated Video:**
${videoAnalysis}

**PART 3: YOUR TASK (MUST RETURN VALID JSON)**

Based on a critical comparison of PART 1 (Intent) and PART 2 (Output), generate a JSON object with the following structure:
1.  **scores**: An object with three numerical scores from 1 (poor match) to 10 (perfect match).
    - **narrative_coherence**: How well did the video's action match the scene summary and shot descriptions?
    - **aesthetic_alignment**: How well did the video's cinematography, lighting, and mood match the Director's Vision and chosen enhancers?
    - **thematic_resonance**: How well did the video's overall feeling connect with the Story's logline, its narrative context, and its intended function within the Hero's Journey structure?
2.  **overall_feedback**: A concise markdown paragraph explaining your scores. What worked well? What were the key discrepancies between intent and reality?
3.  **refinement_directives**: An array of 1-3 actionable suggestions to improve the creative intent for future generations. Each object in the array must have:
    - **target**: The area to improve ('story_bible', 'directors_vision', or 'scene_timeline').
    - **suggestion**: A specific, constructive suggestion for the user. (e.g., "The video felt more like a victory than 'The Ordeal'. To fix this, consider refining the 'scene_timeline' to include more shots that emphasize struggle and sacrifice before the final triumph.").
    - **target_field**: (Only for 'story_bible' target) Specify which field to edit: 'logline', 'characters', 'setting', or 'plotOutline'.
    - **scene_id**: (Only for 'scene_timeline' target) Include the ID: "${scene.id}".
`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            scores: {
                type: Type.OBJECT,
                properties: {
                    narrative_coherence: { type: Type.NUMBER },
                    aesthetic_alignment: { type: Type.NUMBER },
                    thematic_resonance: { type: Type.NUMBER },
                },
                required: ['narrative_coherence', 'aesthetic_alignment', 'thematic_resonance'],
            },
            overall_feedback: { type: Type.STRING },
            refinement_directives: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        target: { type: Type.STRING },
                        suggestion: { type: Type.STRING },
                        target_field: { type: Type.STRING },
                        scene_id: { type: Type.STRING },
                    },
                    required: ['target', 'suggestion'],
                },
            },
        },
        required: ['scores', 'overall_feedback', 'refinement_directives'],
    };
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for continuity scoring.");
        }
        return JSON.parse(text.trim()) as ContinuityResult;
    };
    
    return withRetry(apiCall, context);
};
