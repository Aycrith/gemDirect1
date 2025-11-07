import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CoDirectorResult, Shot, StoryBible, Scene, TimelineData, CreativeEnhancers, ContinuityResult, BatchShotTask, BatchShotResult, ApiCallLog, Suggestion } from "../types";
import { ApiStatus } from "../contexts/ApiStatusContext";

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const model = 'gemini-2.5-flash';
const proModel = 'gemini-2.5-pro';
const imageModel = 'gemini-2.5-flash-image';

const commonError = "An error occurred. Please check the console for details. If the error persists, the model may be overloaded.";

// Define a callback type for state changes
export type ApiStateChangeCallback = (status: ApiStatus, message: string) => void;
export type ApiLogCallback = (log: Omit<ApiCallLog, 'id' | 'timestamp'>) => void;


// Centralized API error handler
export const handleApiError = (error: unknown, context: string): Error => {
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

export const withRetry = async <T>(
    apiCall: () => Promise<{ result: T, tokens: number }>, 
    context: string, 
    modelName: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<T> => {
    let lastError: unknown = new Error(`API call failed for ${context}`);
    onStateChange?.('loading', `Requesting: ${context}...`);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const { result, tokens } = await apiCall();
            onStateChange?.('success', `${context} successful!`);
            logApiCall({ context, model: modelName, tokens, status: 'success' });
            return result;
        } catch (error) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
            const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('resource_exhausted');
            
            if (isRateLimitError && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000; // add jitter
                const delayInSeconds = Math.round(delay/1000);
                const retryMessage = `Rate limit hit on "${context}". Retrying in ${delayInSeconds}s... (Attempt ${attempt + 1}/${MAX_RETRIES})`;
                console.warn(retryMessage);
                onStateChange?.('retrying', retryMessage);
                await new Promise(res => setTimeout(res, delay));
            } else {
                // Not a rate-limit error, or this was the final attempt. Break and throw.
                break;
            }
        }
    }
    const finalError = handleApiError(lastError, context);
    onStateChange?.('error', finalError.message);
    logApiCall({ context, model: modelName, tokens: 0, status: 'error' });
    throw finalError;
};

// --- Context Pruning & Summarization ---

const getPrunedContext = async (prompt: string, context: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel, // Use the more powerful model for summarization
            contents: prompt,
            config: {
                temperature: 0.2, // Low temperature for factual, consistent summarization
            }
        });
        const text = response.text;
        if (!text) {
            throw new Error(`The model returned an empty response for ${context}.`);
        }
        const result = text.trim();
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const getPrunedContextForShotGeneration = async (
    storyBible: StoryBible,
    narrativeContext: string,
    sceneSummary: string,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const prompt = `You are a script supervisor. Your job is to create a concise "Creative Brief" for an AI Cinematographer. Distill the following information into a single, focused paragraph (under 150 words).

    **CRITICAL INFORMATION TO INCLUDE:**
    1.  **Scene's Core Purpose:** What is the main point of this scene in the story's overall journey (e.g., "The hero's lowest point," "Meeting the mentor").
    2.  **Key Visuals & Mood:** What are the most important elements of the Director's Vision that apply here? (e.g., "gritty neo-noir lighting," "Ghibli-style nature").
    3.  **Emotional Arc:** What is the emotional shift that should happen from the beginning to the end of the scene?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context (Current Act of the Hero's Journey): ${narrativeContext}
    - Scene Summary: ${sceneSummary}
    - Director's Vision: ${directorsVision}

    **Your Output:** A single paragraph creative brief.`;
    return getPrunedContext(prompt, 'prune context for shot generation', logApiCall, onStateChange);
};

export const getPrunedContextForCoDirector = async (
    storyBible: StoryBible,
    narrativeContext: string,
    scene: Scene,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const prompt = `You are an expert script analyst. Your job is to create a concise "Co-Director's Brief" (under 200 words) that summarizes the creative sandbox for the current scene. The brief should focus on the *goals and constraints* for making creative suggestions.

    **CRITICAL INFORMATION TO SUMMARIZE:**
    1.  **Narrative Function:** What is this scene's specific job within the plot's current act (based on The Hero's Journey)?
    2.  **Aesthetic Guardrails:** What are the key visual and tonal rules from the Director's Vision that MUST be followed?
    3.  **Character/Plot Development:** What key character change or plot point must be accomplished in this scene?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context (Current Act): ${narrativeContext}
    - Scene: "${scene.title}" - ${scene.summary}
    - Director's Vision: ${directorsVision}

    **Your Output:** A single paragraph co-director's brief.`;
    return getPrunedContext(prompt, 'prune context for co-director', logApiCall, onStateChange);
};

// --- Core Story Generation ---

export const generateStoryBible = async (idea: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<StoryBible> => {
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
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for Story Bible.");
        }
        const result = JSON.parse(text.trim()) as StoryBible;
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const generateSceneList = async (plotOutline: string, directorsVision: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<Array<{ title: string; summary: string }>> => {
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
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for scene list.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const generateInitialShotsForScene = async (
    prunedContext: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string[]> => {
    const context = 'generate shots for scene';
    const prompt = `You are a visionary cinematographer who understands that every shot must serve the story. Based on the following focused Creative Brief, create an initial shot list for the scene.

    **Creative Brief:**
    "${prunedContext}"

    **Your Task:**
    Generate a JSON array of 3-5 strings. Each string is a description for a single cinematic shot that visually tells the story of this scene, perfectly aligning with the provided brief. Ensure the shots create a cohesive and emotionally resonant sequence.`;
    
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
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

// --- AI-Assisted Guidance & Suggestions ---

export const suggestStoryIdeas = async (logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string[]> => {
    const context = 'suggest ideas';
    const prompt = "You are a creative muse. Generate 3 diverse and compelling one-sentence story ideas for a cinematic experience. Return a JSON array of strings.";
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for story ideas.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };
    
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const suggestDirectorsVisions = async (storyBible: StoryBible, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string[]> => {
    const context = 'suggest visions';
    const prompt = `You are a film theorist and animation historian. Based on this story bible, suggest 3 distinct and evocative "Director's Visions". These can be live-action cinematic styles or animation art styles. Each should be a short paragraph that describes the visual language.

    **Story Bible:**
    - Logline: ${storyBible.logline}
    - Plot: ${storyBible.plotOutline}

    Return a JSON array of strings.

    Example cinematic style: "A gritty, neo-noir aesthetic with high-contrast, low-key lighting (chiaroscuro), constant rain, and a sense of urban decay. Camera work is mostly handheld and claustrophobic."
    Example animation style: "A dynamic, comic-book visual language like 'Into the Spider-Verse', using Ben-Day dots, expressive text on-screen, and variable frame rates to heighten the action."`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.STRING
        }
    };

     const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for director's visions.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const refineEntireStoryBible = async (storyBible: StoryBible, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<StoryBible> => {
    const context = 'refine Story Bible';
    const prompt = `You are a master screenwriter and editor. Your task is to refine the following Story Bible. Enhance the clarity, emotional impact, and narrative cohesion of each section without fundamentally changing the core concepts. Make the logline punchier, the characters more compelling, the setting more evocative, and the plot outline more tightly structured around The Hero's Journey.

    **Original Story Bible:**
    ${JSON.stringify(storyBible, null, 2)}

    **Your Output:** Return a JSON object with the refined Story Bible, following the exact same schema.`;

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
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for refining Story Bible.");
        }
        const result = JSON.parse(text.trim()) as StoryBible;
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const suggestCoDirectorObjectives = async (logline: string, sceneSummary: string, directorsVision: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string[]> => {
    const context = 'suggest Co-Director objectives';
    const prompt = `You are a creative film producer. Based on the following context, generate 3 diverse, actionable objectives for an AI Co-Director to improve a scene. The objectives should be phrased as commands or requests.

    **Story Logline:** "${logline}"
    **Scene Summary:** "${sceneSummary}"
    **Director's Vision:** "${directorsVision}"

    Return a JSON array of 3 strings.

    Example objectives:
    - "Inject more visual tension and a sense of impending dread."
    - "Give this scene a more surreal, dreamlike quality."
    - "Heighten the emotional vulnerability of the main character."
    `;

    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for Co-Director objectives.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
}

// --- Reusable Schemas for Suggestions and Enhancers ---
const enhancersSchema = {
    type: Type.OBJECT,
    properties: {
        framing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Close-Up', 'Wide Shot'" },
        movement: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Tracking Shot', 'Handheld'" },
        lens: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Shallow Depth of Field', 'Lens Flare'" },
        pacing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Slow Motion', 'Fast-Paced'" },
        lighting: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'High-Key', 'Low-Key (Chiaroscuro)'" },
        mood: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Suspenseful', 'Dreamlike'" },
        vfx: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Film Grain', 'Glitch Effect'" },
        plotEnhancements: { type: Type.ARRAY, items: { type: Type.STRING }, description: "e.g., 'Foreshadowing Moment', 'Introduce Conflict'" },
    },
};

const suggestedChangesSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            type: { type: Type.STRING, description: "One of 'UPDATE_SHOT', 'ADD_SHOT_AFTER', or 'UPDATE_TRANSITION'." },
            shot_id: { type: Type.STRING, description: "Required for 'UPDATE_SHOT'. The ID of the shot to modify." },
            after_shot_id: { type: Type.STRING, description: "Required for 'ADD_SHOT_AFTER'. The ID of the shot to add a new shot after." },
            transition_index: { type: Type.INTEGER, description: "Required for 'UPDATE_TRANSITION'. The index of the transition to modify." },
            payload: {
                type: Type.OBJECT,
                description: "The data for the change.",
                properties: {
                    description: { type: Type.STRING, description: "The new shot description." },
                    title: { type: Type.STRING, description: "The title for a new shot." },
                    type: { type: Type.STRING, description: "The new transition type, e.g., 'Dissolve'." },
                    enhancers: enhancersSchema
                }
            },
            description: { type: Type.STRING, description: "A human-readable summary of the proposed change." }
        },
        required: ['type', 'payload', 'description']
    }
};

export const getCoDirectorSuggestions = async (prunedContext: string, scene: Scene, objective: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<CoDirectorResult> => {
    const context = 'get Co-Director suggestions';
    const prompt = `You are an AI Co-Director. Your task is to analyze the provided scene context and timeline, then suggest specific, creative changes to achieve the user's stated objective. You must be bold and imaginative, but your suggestions must respect the established narrative and aesthetic.

    **Co-Director's Brief (Key Context):**
    ${prunedContext}

    **User's Creative Objective:**
    "${objective}"

    **Current Scene Timeline (as JSON):**
    ${JSON.stringify(scene.timeline, null, 2)}

    **Your Task:**
    Return a single JSON object with the following structure. **Crucially, ensure the output is a single, valid JSON object and nothing else. All string values, especially multi-line markdown in 'reasoning' or any 'description' fields, must have properly escaped characters (like \\" for double quotes and \\n for newlines).**
    1.  **thematic_concept**: A short, evocative phrase (3-5 words) that encapsulates your new creative direction for the scene. (e.g., "Echoes of a Fading Memory", "The Walls Close In", "A Dance of Shadows").
    2.  **reasoning**: A markdown-formatted paragraph explaining how your suggestions will achieve the user's objective and align with the thematic concept.
    3.  **suggested_changes**: A JSON array of 2-4 specific, actionable suggestions. Each suggestion object must have:
        *   **type**: (string) One of 'UPDATE_SHOT', 'ADD_SHOT_AFTER', or 'UPDATE_TRANSITION'.
        *   **shot_id** or **after_shot_id** or **transition_index**: (string or number) The identifier for where the change should occur. Use 'shot_id' for 'UPDATE_SHOT', 'after_shot_id' for 'ADD_SHOT_AFTER', 'transition_index' for 'UPDATE_TRANSITION'.
        *   **payload**: (object) The data for the change. For 'UPDATE_SHOT', this can include a new 'description' and/or 'enhancers'. For 'ADD_SHOT_AFTER', it should be a full shot object. For 'UPDATE_TRANSITION', it should include a 'type' like 'Dissolve'.
        *   **description**: (string) A user-friendly description of the change you are proposing.
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            thematic_concept: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            suggested_changes: suggestedChangesSchema,
        },
        required: ['thematic_concept', 'reasoning', 'suggested_changes']
    };
    
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.7 },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for Co-Director suggestions.");
        }
        
        // Add cleanup logic just in case the model wraps the output in markdown.
        let jsonString = text.trim();
        if (jsonString.startsWith('```json')) {
            jsonString = jsonString.substring(7);
            if (jsonString.endsWith('```')) {
                jsonString = jsonString.substring(0, jsonString.length - 3);
            }
        }
        jsonString = jsonString.trim();
        
        try {
            const result = JSON.parse(jsonString) as CoDirectorResult;
            const tokens = response.usageMetadata?.totalTokenCount || 0;
            return { result, tokens };
        } catch (parseError) {
            console.error("Failed to parse JSON from Co-Director suggestions:", jsonString);
            console.error("Original parse error:", parseError);
            throw new Error(`The model returned a malformed JSON response. Check the console for the invalid string. Error: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
        }
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
}


// --- Batch Shot Processing ---

export const batchProcessShotEnhancements = async (
    tasks: BatchShotTask[],
    narrativeContext: string,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<BatchShotResult[]> => {
    const context = 'batch process shots';
    const prompt = `You are an AI Cinematographer's assistant. You will receive a batch of tasks for different shots within the same scene. For each task, perform the requested actions based on the provided creative context.

    **Overall Creative Context:**
    - Narrative Focus: ${narrativeContext}
    - Director's Vision: ${directorsVision}

    **Tasks (JSON Array):**
    ${JSON.stringify(tasks, null, 2)}

    **Your Task:**
    Process all tasks and return a JSON array of results. Each result object in the array must correspond to a task and contain:
    1.  **shot_id**: (string) The ID of the shot that was processed.
    2.  **refined_description**: (string, optional) If 'REFINE_DESCRIPTION' was requested, provide a more vivid, cinematic, and detailed description for the shot.
    3.  **suggested_enhancers**: (object, optional) If 'SUGGEST_ENHANCERS' was requested, provide a JSON object with suggested creative enhancers (like 'framing', 'movement', 'lighting', 'vfx', etc.) that align with the shot's description and the overall vision. Be creative and specific.
    `;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                shot_id: { type: Type.STRING },
                refined_description: { type: Type.STRING },
                suggested_enhancers: enhancersSchema
            },
            required: ['shot_id']
        }
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for batch shot processing.");
        }
        const result = JSON.parse(text.trim()) as BatchShotResult[];
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    // FIX: Explicitly specify the generic type for `withRetry` to ensure correct type inference.
    return withRetry<BatchShotResult[]>(apiCall, context, proModel, logApiCall, onStateChange);
};

// --- Image and Video Analysis ---

export const generateKeyframeForScene = async (prompt: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
    const context = 'generate scene keyframe';
    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: imageModel,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes: string = part.inlineData.data;
                    const tokens = response.usageMetadata?.totalTokenCount || 0;
                    return { result: base64ImageBytes, tokens };
                }
            }
        }

        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`Image generation failed with reason: ${candidate.finishReason}. This could be due to safety filters or an invalid prompt.`);
        }
        
        throw new Error("The model did not return an image for the scene keyframe.");
    };

    return withRetry(apiCall, context, imageModel, logApiCall, onStateChange);
};

export const generateImageForShot = async (
    shot: Shot, 
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>, 
    directorsVision: string,
    sceneSummary: string,
    logApiCall: ApiLogCallback, 
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const context = 'generate shot preview';

    let prompt = `Generate a single, cinematic keyframe image for a specific shot within a scene.
    
**Overall Scene Summary:** ${sceneSummary}
**Director's Vision / Cinematic Style:** ${directorsVision}

**Specific Shot Description:**
${shot.description}
`;

    if (enhancers && Object.keys(enhancers).length > 0) {
        const enhancerText = Object.entries(enhancers)
            .map(([key, value]) => {
                if (Array.isArray(value) && value.length > 0) {
                    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
                    return `${formattedKey}: ${value.join(', ')}`;
                }
                return null;
            })
            .filter(Boolean)
            .join('; ');
        if (enhancerText) {
            prompt += `\n**Creative Enhancers for this Shot:** ${enhancerText}`;
        }
    }

    prompt += "\n\n**Task:** Create a photorealistic, high-quality image that captures this shot perfectly, adhering to all the specified styles and descriptions."

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: imageModel,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes: string = part.inlineData.data;
                    const tokens = response.usageMetadata?.totalTokenCount || 0;
                    return { result: base64ImageBytes, tokens };
                }
            }
        }

        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`Image generation failed with reason: ${candidate.finishReason}. This could be due to safety filters or an invalid prompt.`);
        }
        
        throw new Error("The model did not return an image for the shot preview.");
    };

    return withRetry(apiCall, context, imageModel, logApiCall, onStateChange);
};


export const analyzeVideoFrames = async (frames: string[], logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
    const context = 'analyze video frames';
    const contents = [
        { text: "Analyze this sequence of video frames. Describe the key visual elements, characters, actions, and overall cinematic style (camera movement, lighting, color). Provide your analysis as a concise markdown-formatted summary." },
        ...frames.map(frame => ({
            inlineData: {
                mimeType: 'image/jpeg',
                data: frame,
            },
        }))
    ];
    
     const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model, // Using flash for faster analysis
            contents: { parts: contents },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for video analysis.");
        }
        const result = text.trim();
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, model, logApiCall, onStateChange);
};

export const getPrunedContextForContinuity = async (
    storyBible: StoryBible,
    narrativeContext: string,
    scene: Scene,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
     const prompt = `You are a script supervisor preparing for a continuity check. Distill the following information into a concise "Continuity Brief" (under 200 words). The brief should focus on the *intended* creative and narrative goals against which a generated video will be judged.

    **CRITICAL INFORMATION TO SUMMARIZE:**
    1.  **Core Narrative Purpose:** What is the primary goal of this scene in the plot?
    2.  **Aesthetic Blueprint:** What are the key visual and tonal mandates from the Director's Vision?
    3.  **Key Moments & Visuals:** What are the most important beats or shots described in the timeline that MUST be present?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context: ${narrativeContext}
    - Scene: "${scene.title}" - ${scene.summary}
    - Director's Vision: ${directorsVision}
    - Scene Shot List Summary: ${scene.timeline.shots.map(s => `- ${s.description}`).join('\n')}

    **Your Output:** A single paragraph continuity brief.`;
    return getPrunedContext(prompt, 'prune context for continuity', logApiCall, onStateChange);
};


export const scoreContinuity = async (prunedContext: string, scene: Scene, videoAnalysis: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<ContinuityResult> => {
    const context = 'score continuity';
    const prompt = `You are an expert film critic and continuity supervisor. Your task is to analyze a generated video's summary and score its alignment with the original creative intent. Then, you must provide structured, actionable suggestions to fix any deviations.

    **Continuity Brief (The Intention):**
    ${prunedContext}

    **Original Scene Timeline (The Blueprint):**
    ${JSON.stringify(scene.timeline, null, 2)}

    **AI's Analysis of the Generated Video (The Result):**
    ${videoAnalysis}

    **Your Task:**
    Provide a detailed critique as a JSON object. Your analysis must be strict and constructive.
    1.  **scores**: A JSON object with three scores, each from 1-10 (integer):
        *   **narrative_coherence**: How well does the video's action match the scene's plot purpose?
        *   **aesthetic_alignment**: How well does the video's visual style match the Director's Vision?
        *   **thematic_resonance**: How well does the video capture the intended mood and emotional core of the scene?
    2.  **overall_feedback**: A markdown-formatted paragraph summarizing your assessment. What worked well, and what were the biggest deviations from the plan?
    3.  **suggested_changes**: A JSON array of 2-3 specific, actionable suggestions to fix the timeline. **This is crucial.** The suggestions must follow the same structured format as the Co-Director's tool, referencing 'shot_id's from the provided timeline. The goal is to correct the blueprint so a future generation will be more accurate.
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            scores: {
                type: Type.OBJECT,
                properties: {
                    narrative_coherence: { type: Type.INTEGER },
                    aesthetic_alignment: { type: Type.INTEGER },
                    thematic_resonance: { type: Type.INTEGER },
                },
                required: ['narrative_coherence', 'aesthetic_alignment', 'thematic_resonance'],
            },
            overall_feedback: { type: Type.STRING },
            suggested_changes: suggestedChangesSchema,
        },
        required: ['scores', 'overall_feedback', 'suggested_changes'],
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
        const result = JSON.parse(text.trim()) as ContinuityResult;
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const generateNextSceneFromContinuity = async (
    storyBible: StoryBible,
    directorsVision: string,
    lastSceneSummary: string,
    userDirection: string,
    lastFrame: string, // base64 string
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<{ title: string; summary: string }> => {
    const context = 'generate next scene from continuity';
    
    const textPart = {
        text: `You are an expert screenwriter continuing a story. Based on the project's Story Bible, the Director's Vision, the summary of the last scene, and the user's direction for what happens next, create a compelling title and a concise one-sentence summary for the *next* scene. The new scene must logically and visually follow from the provided final frame of the previous scene.

        **SOURCE MATERIAL:**
        - Story Logline: ${storyBible.logline}
        - Director's Vision: ${directorsVision}
        - Previous Scene Summary: "${lastSceneSummary}"
        - User's Direction for Next Scene: "${userDirection}"

        **Your Task:**
        Return a single JSON object with two keys:
        1.  "title": A short, evocative title for the new scene.
        2.  "summary": A one-sentence description of the new scene's main action and purpose.`
    };

    const imagePart = {
        inlineData: {
            mimeType: 'image/jpeg',
            data: lastFrame
        }
    };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING }
        },
        required: ['title', 'summary']
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: model, // gemini-2.5-flash
            contents: { parts: [textPart, imagePart] },
            config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.6 }
        });
        const text = response.text;
        if (!text) throw new Error("The model returned an empty response for next scene generation.");
        
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, model, logApiCall, onStateChange);
};

export const updateSceneSummaryWithRefinements = async (
    originalSummary: string,
    refinedTimeline: TimelineData,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const context = 'update scene summary';
    const prompt = `You are a concise script editor. A scene's detailed shot list has been updated. Your task is to rewrite the scene's high-level, one-sentence summary to reflect these changes.

    **Original One-Sentence Summary:**
    "${originalSummary}"

    **New, Refined Shot List:**
    ${refinedTimeline.shots.map((s, i) => `Shot ${i+1}: ${s.description}`).join('\n')}

    **Your Task:**
    Generate a new, improved one-sentence summary that accurately captures the essence of the refined shot list. Return a single JSON object with the key "new_summary".`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            new_summary: { type: Type.STRING, description: "The new, one-sentence scene summary." }
        },
        required: ['new_summary']
    };

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.5 },
        });
        const text = response.text;
        if (!text) throw new Error("The model returned an empty response for updating the scene summary.");
        
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result: result.new_summary, tokens };
    };
    
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
}