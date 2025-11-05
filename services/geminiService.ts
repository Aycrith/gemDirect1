import { GoogleGenAI, Type, Modality } from "@google/genai";
// FIX: Import ContinuityResult type to support new functions.
import { CoDirectorResult, Shot, StoryBible, Scene, TimelineData, CreativeEnhancers, ContinuityResult, BatchShotTask, BatchShotResult, ApiCallLog } from "../types";
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

const withRetry = async <T>(
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
    
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };

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

export const suggestCoDirectorObjectives = async (logline: string, sceneSummary: string, directorsVision: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string[]> => {
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
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for co-director objectives.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const refineEntireStoryBible = async (storyBible: StoryBible, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<StoryBible> => {
    const context = 'refine entire Story Bible';
    const prompt = `You are an expert editor and screenwriter. A user is working on a story bible and wants to holistically refine the entire document. Based on the full story context provided, revise **every field** (logline, characters, setting, plotOutline) to be more compelling, concise, and cinematic. Ensure the parts all work together harmoniously.

    **Current Story Bible to Refine:**
    ${JSON.stringify(storyBible, null, 2)}

    **Your Task & CRITICAL JSON FORMATTING:**
    Your ENTIRE output must be a single, valid JSON object with the exact same structure as the input ('logline', 'characters', 'setting', 'plotOutline').
    - **CRITICAL:** All double quotes (") inside any string value must be properly escaped with a backslash (\\").
    - Ensure the 'plotOutline' and 'characters' fields remain valid markdown.`;

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
            model: proModel, // Use the more powerful model for this holistic task
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error(`The model returned an empty response when refining the story bible.`);
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const batchProcessShotEnhancements = async (
    tasks: BatchShotTask[],
    narrativeContext: string,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<BatchShotResult[]> => {
    const context = 'batch process shot enhancements';

    const taskDescriptions = tasks.map(task => {
        return `{
            "shot_id": "${task.shot_id}",
            "description": "${task.description.replace(/"/g, '\\"')}",
            "actions": ["${task.actions.join('", "')}"]
        }`;
    }).join(',\n');

    const prompt = `You are an expert AI screenwriter and cinematographer. I have a batch of tasks to improve several cinematic shots. Please process all of them and return a single JSON array with the results.

    **Director's Vision / Cinematic Style (applies to all shots):**
    "${directorsVision}"

    **Narrative Context (applies to all shots):**
    "${narrativeContext}"

    **Tasks to Perform (JSON Array):**
    [
        ${taskDescriptions}
    ]

    **Your Task & CRITICAL JSON FORMATTING:**
    Your ENTIRE output must be a single, valid JSON array of objects. Each object in the array must correspond to one of the input tasks and have a matching "shot_id".
    - For each task with an action of "REFINE_DESCRIPTION", add a "refined_description" key with a more vivid, detailed, and cinematic description.
    - For each task with an action of "SUGGEST_ENHANCERS", add a "suggested_enhancers" key with a JSON object of relevant cinematic terms (framing, movement, etc.).
    - If a task has both actions, include both "refined_description" and "suggested_enhancers" in its result object.
    - **CRITICAL:** Ensure all double quotes within string values in your final JSON output are properly escaped with a backslash (\\").
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                shot_id: { type: Type.STRING },
                refined_description: { type: Type.STRING, description: "The refined shot description. CRITICAL: All double quotes must be escaped." },
                suggested_enhancers: {
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
                }
            },
            required: ['shot_id']
        }
    };

    const apiCall = async (): Promise<{ result: BatchShotResult[], tokens: number }> => {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for batch processing.");
        }
        const result = JSON.parse(text.trim()) as BatchShotResult[];
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

// FIX: Add missing functions for video analysis and continuity scoring.
export const analyzeVideoFrames = async (frames: string[], logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
    const context = 'analyze video frames';
    const prompt = `You are a film critic and shot analyst. Based on the following sequence of frames from a video, provide a detailed analysis. Describe the cinematic techniques used, the narrative action, and the overall mood. Structure your analysis in markdown.
    
    Key aspects to cover:
    - **Shot Composition & Framing:** Describe how subjects are framed (e.g., close-ups, wide shots).
    - **Camera Movement:** Infer camera movement based on frame changes (e.g., pan, tilt, tracking).
    - **Lighting & Color:** Analyze the lighting style and color palette.
    - **Narrative Events:** Describe the sequence of events unfolding in the frames.
    - **Emotional Tone:** What is the overall mood or feeling conveyed?
    `;

    const imageParts = frames.map(frame => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame,
        },
    }));

    const apiCall = async () => {
        const response = await ai.models.generateContent({
            model: proModel, // Use pro model for better analysis
            contents: { parts: [{ text: prompt }, ...imageParts] },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for video frame analysis.");
        }
        const result = text.trim();
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const getPrunedContextForContinuity = async (
    storyBible: StoryBible,
    narrativeContext: string,
    scene: Scene,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const prompt = `You are a script supervisor. Your job is to create a concise "Continuity Brief" (under 200 words) for an AI continuity checker. This brief will be used to judge if a generated video matches the original creative intent.

    **CRITICAL INFORMATION TO SUMMARIZE:**
    1.  **Scene's Core Purpose:** What is the main point of this scene in the story's overall journey?
    2.  **Key Visuals & Mood:** What are the most important visual and tonal elements from the Director's Vision that MUST appear in the final video?
    3.  **Essential Action:** What is the single most important action or event that must occur in this scene?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context (Current Act): ${narrativeContext}
    - Scene: "${scene.title}" - ${scene.summary}
    - Director's Vision: ${directorsVision}

    **Your Output:** A single paragraph continuity brief.`;
    return getPrunedContext(prompt, 'prune context for continuity check', logApiCall, onStateChange);
};

export const scoreContinuity = async (
    prunedContext: string,
    scene: Scene,
    videoAnalysis: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<ContinuityResult> => {
    const context = 'score cinematic continuity';
    const shotListString = scene.timeline.shots.map((shot, i) => `Shot ${i + 1}: ${shot.description}`).join('\n');

    const prompt = `
You are a meticulous AI Continuity Supervisor. Your task is to analyze a generated video (represented by a textual analysis of its frames) and score its adherence to the original creative intent.

**Continuity Brief (The Creative Intent):**
${prunedContext}

**Original Shot List for this Scene:**
${shotListString}

**Analysis of the Generated Video's Content:**
${videoAnalysis}

**Your Task & CRITICAL JSON FORMATTING:**
Your ENTIRE output must be a single, valid JSON object that perfectly adheres to the provided schema. You must evaluate the video's analysis against the creative brief and shot list.
- **CRITICAL RULE #1: Your entire response must be a single JSON object. Do not add any text, markdown, or code fences before or after the JSON.**
- **CRITICAL RULE #2: This is the most important rule. Any time you include a double quote character (") inside of a JSON string value, you MUST escape it with a backslash (\\").** Failure to do this will break the application.

**Evaluation Criteria:**
- **Narrative Coherence:** Does the video's action match the scene's purpose and shot list?
- **Aesthetic Alignment:** Does the video's visual style (lighting, color, mood) match the Director's Vision described in the brief?
- **Thematic Resonance:** Does the video successfully convey the core emotional arc and theme of the scene?
`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            scores: {
                type: Type.OBJECT,
                properties: {
                    narrative_coherence: { type: Type.INTEGER, description: "Score from 1-10 on how well the video's plot matches the script." },
                    aesthetic_alignment: { type: Type.INTEGER, description: "Score from 1-10 on how well the visuals match the director's vision." },
                    thematic_resonance: { type: Type.INTEGER, description: "Score from 1-10 on how well the video captures the scene's emotional core." },
                },
                required: ['narrative_coherence', 'aesthetic_alignment', 'thematic_resonance']
            },
            overall_feedback: { type: Type.STRING, description: "A markdown-formatted paragraph summarizing your findings. CRITICAL: Escape all double quotes (\\\")." },
            refinement_directives: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        target: { type: Type.STRING, description: "Which creative document to edit: 'Story Bible', 'Director\\'s Vision', or 'Scene [Number] Timeline'." },
                        target_field: { type: Type.STRING, description: "Optional specific field to edit, e.g., 'logline', 'description'." },
                        suggestion: { type: Type.STRING, description: "A specific, actionable suggestion for improvement. CRITICAL: Escape all double quotes (\\\")." },
                    },
                    required: ['target', 'suggestion']
                }
            }
        },
        required: ['scores', 'overall_feedback', 'refinement_directives']
    };

    const apiCall = async (): Promise<{ result: ContinuityResult, tokens: number }> => {
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

// --- Co-Director & Generation ---
export const generateSceneImage = async (timelineData: TimelineData, directorsVision: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback, previousImageBase64?: string): Promise<string> => {
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
            model: imageModel,
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
            const result = part.inlineData.data;
            // Image models don't return token usage, so we log 0 tokens but the call is still tracked.
            const tokens = response.usageMetadata?.totalTokenCount || 0;
            return { result, tokens };
        }
        throw new Error("Image generation failed: No image data in response.");
    };

    return withRetry(apiCall, context, imageModel, logApiCall, onStateChange);
};

export const getCoDirectorSuggestions = async (
    prunedContext: string,
    activeScene: Scene, 
    objective: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
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

**Co-Director's Brief (The Creative Sandbox & Goals):**
"${prunedContext}"

**Current Shot-List & Style for this Scene:**
${timelineString}

**User's Creative Objective for this Scene:**
"${objective}"

**Your Task & CRITICAL JSON FORMATTING INSTRUCTIONS:**
Your ENTIRE output MUST be a single, valid JSON object that perfectly adheres to the provided schema. Your suggestions must improve the current timeline to better align with the Director's Vision, the user's objective, and **the scene's structural purpose as outlined in the brief.**
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
        const result = JSON.parse(text.trim()) as CoDirectorResult;
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };
    
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

export const generateVideoPrompt = async (timelineData: TimelineData, directorsVision: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
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
        const result = text.trim();
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};