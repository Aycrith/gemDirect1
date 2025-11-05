
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CoDirectorResult, Shot, StoryBible, Scene, TimelineData, CreativeEnhancers, ContinuityResult } from "../types";

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const model = 'gemini-2.5-flash';
const proModel = 'gemini-2.5-pro';

const commonError = "An error occurred. Please check the console for details. If the error persists, the model may be overloaded.";

// --- Core Story Generation ---

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
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for Story Bible.");
        }
        return JSON.parse(text.trim()) as StoryBible;
    } catch (error) {
        console.error("Error generating Story Bible:", error);
        throw new Error(`Failed to generate Story Bible. ${commonError}`);
    }
};

export const generateSceneList = async (storyBible: StoryBible, directorsVision: string): Promise<Array<{ title: string; summary: string }>> => {
    const prompt = `You are an expert film director. Your task is to break down the following plot outline into a series of distinct, actionable scenes, keeping the overall story and cinematic vision in mind.

    **Story Bible:**
    - Logline: ${storyBible.logline}
    - Characters: ${storyBible.characters}
    - Setting: ${storyBible.setting}
    - Plot Outline: ${storyBible.plotOutline}

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    Based on ALL of the above context, generate a JSON array of scenes. Each scene object should have:
    1.  **title**: A short, evocative title for the scene that aligns with the Director's Vision.
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
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for scene list.");
        }
        return JSON.parse(text.trim());
    } catch (error) {
        console.error("Error generating scene list:", error);
        throw new Error(`Failed to generate scene list. ${commonError}`);
    }
};

export const generateInitialShotsForScene = async (storyBible: StoryBible, scene: { title: string; summary: string }, directorsVision: string, previousSceneSummary?: string): Promise<string[]> => {
    const prompt = `You are a visionary cinematographer. Your task is to create an initial shot list for a scene. The shot descriptions should be concise and focused on the visual action, aligning with the established Director's Vision.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    **Overall Story Context:**
    - Logline: ${storyBible.logline}
    - Setting: ${storyBible.setting}
    ${previousSceneSummary ? `
    **Previous Scene Summary (for context):**
    - ${previousSceneSummary}` : ''}

    **Current Scene:**
    - Title: ${scene.title}
    - Summary: ${scene.summary}

    Based on the story, the director's vision, and the scene's summary, generate a JSON array of 3-5 strings. Each string is a description for a single cinematic shot that visually tells the story of this scene. Make sure the shots logically follow from the previous scene if provided.`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING },
    };
    
    try {
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
    } catch (error) {
        console.error("Error generating initial shots:", error);
        throw new Error(`Failed to generate shots for scene. ${commonError}`);
    }
};

// --- AI-Assisted Guidance & Suggestions ---

export const suggestStoryIdeas = async (): Promise<string[]> => {
    const prompt = "You are a creative muse. Generate 3 diverse and compelling one-sentence story ideas for a cinematic experience. Return a JSON array of strings.";
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    try {
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
    } catch (error) {
        console.error("Error suggesting story ideas:", error);
        throw new Error(`Failed to suggest ideas. ${commonError}`);
    }
};

export const suggestDirectorsVisions = async (storyBible: StoryBible): Promise<string[]> => {
    const prompt = `You are a film theorist. Based on this story bible, suggest 3 distinct and evocative "Director's Visions" or cinematic styles. Each should be a short paragraph. Return a JSON array of strings.

    Story Bible:
    - Logline: ${storyBible.logline}
    - Plot Outline: ${storyBible.plotOutline}`;
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    try {
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
    } catch (error) {
        console.error("Error suggesting visions:", error);
        throw new Error(`Failed to suggest visions. ${commonError}`);
    }
};

export const suggestCoDirectorObjectives = async (storyBible: StoryBible, scene: Scene, directorsVision: string): Promise<string[]> => {
    const prompt = `You are a creative film director's assistant. Based on the provided story context, scene summary, and director's vision, suggest 3 diverse and actionable creative objectives for the AI Co-Director. The objectives should be concise, starting with a verb, and guide the AI towards a specific creative direction for the scene.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    **Story Logline:**
    - ${storyBible.logline}

    **Current Scene:**
    - Title: ${scene.title}
    - Summary: ${scene.summary}

    Return a JSON array of 3 strings.

    Example objectives:
    - "Inject a sense of paranoia and claustrophobia."
    - "Emphasize the romantic tension between the characters."
    - "Create a fast-paced, high-energy action sequence."`;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: { type: Type.STRING },
    };
    
    try {
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
    } catch (error) {
        console.error("Error suggesting co-director objectives:", error);
        throw new Error(`Failed to suggest objectives. ${commonError}`);
    }
};


export const refineStoryBibleField = async (field: keyof StoryBible, storyBible: StoryBible): Promise<string> => {
    const currentValue = storyBible[field];
    const prompt = `You are an expert editor. A user is working on a story bible and wants to refine one section. Based on the full story context, revise the following **${field}** to be more compelling, concise, and cinematic.

    **Full Story Bible Context:**
    - Logline: ${storyBible.logline}
    - Characters: ${storyBible.characters}
    - Setting: ${storyBible.setting}
    - Plot Outline: ${storyBible.plotOutline}

    **Current ${field.toUpperCase()} to Refine:**
    "${currentValue}"

    Return a JSON object with a single key "refined_text" containing only the new, improved text.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: { refined_text: { type: Type.STRING } },
        required: ['refined_text'],
    };

    try {
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
    } catch (error) {
        console.error(`Error refining ${field}:`, error);
        throw new Error(`Failed to refine ${field}. ${commonError}`);
    }
};

export const refineShotDescription = async (shot: Shot, scene: Scene, storyBible: StoryBible, directorsVision: string): Promise<string> => {
    const prompt = `You are a screenwriter and cinematographer. Refine the following shot description to be more vivid, detailed, and cinematic. Ensure it aligns with the scene's context and the director's overall vision.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"

    **Scene Context:**
    - Title: ${scene.title}
    - Summary: ${scene.summary}
    
    **Story Logline:**
    - ${storyBible.logline}

    **Current Shot Description to Refine:**
    "${shot.description}"

    Return a JSON object with a single key "refined_description" containing the improved text.`;

    const responseSchema = {
        type: Type.OBJECT,
        properties: { refined_description: { type: Type.STRING } },
        required: ['refined_description'],
    };
    try {
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
    } catch (error) {
        console.error("Error refining shot description:", error);
        throw new Error(`Failed to refine description. ${commonError}`);
    }
};

export const suggestShotEnhancers = async (shot: Shot, scene: Scene, storyBible: StoryBible, directorsVision: string): Promise<Partial<Omit<CreativeEnhancers, 'transitions'>>> => {
    const prompt = `You are an expert AI Cinematographer. For the given shot, suggest a cohesive set of creative enhancers that align with the scene's context and the overall Director's Vision.

    **Director's Vision / Cinematic Style:**
    "${directorsVision}"
    
    **Story Logline:**
    - ${storyBible.logline}

    **Scene Summary:**
    "${scene.summary}"

    **Shot Description:**
    "${shot.description}"

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

    try {
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
    } catch (error) {
        console.error("Error suggesting shot enhancers:", error);
        throw new Error(`Failed to suggest enhancers. ${commonError}`);
    }
};


// --- Co-Director & Generation ---
export const generateSceneImage = async (timelineData: TimelineData, directorsVision: string, previousImageBase64?: string): Promise<string> => {
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
        **Objective:** Generate a single, photorealistic, cinematic keyframe image representing a scene.

        **Director's Vision / Style:** ${directorsVision}

        **Scene Timeline (key moments):**
        ${detailedTimeline}

        **Negative Prompt (AVOID):** ${negativePrompt || 'None'}

        **Task:** Synthesize the vision and timeline into a concise, descriptive prompt for an image generator. The prompt should describe the single most impactful, representative moment of the scene as a static image. Focus on composition, lighting, character expression, and mood to create a visually stunning keyframe. This is a prompt for a single image, not a video.
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

    try {
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
    } catch (error) {
        console.error("Error generating scene image:", error);
        throw new Error(`Failed to generate image. ${commonError}`);
    }
};

export const getCoDirectorSuggestions = async (storyBible: StoryBible, activeScene: Scene, objective: string, directorsVision: string): Promise<CoDirectorResult> => {
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
You are an expert AI Film Co-Director. Your task is to analyze a cinematic timeline and provide creative, actionable suggestions that align with a high-level artistic vision and a specific creative objective.

**Director's Vision / Cinematic Style:**
"${directorsVision}"

**Overall Story Bible:**
- Logline: ${storyBible.logline}
- Key Plot Points: ${storyBible.plotOutline}

**Current Scene Context:**
- Scene: ${activeScene.title} - ${activeScene.summary}

**Current Shot-List & Style for this Scene:**
${timelineString}

**User's Creative Objective for this Scene:**
"${objective}"

**Your Task & CRITICAL JSON FORMATTING INSTRUCTIONS:**
Your ENTIRE output MUST be a single, valid JSON object that perfectly adheres to the provided schema. Your suggestions must improve upon the current shot-list and styles to better align with BOTH the Director's Vision and the user's immediate creative objective. You should feel free to change existing styles or add new ones.
- **The most critical rule is handling quotation marks inside JSON strings.** If you need to include a double quote character (") inside any string value (like in the 'reasoning' or 'description' fields), you MUST escape it with a backslash (e.g., "The character yelled, \\"Stop!\\""). Failure to do this will result in an invalid JSON.
- Do not add any text or markdown formatting before or after the JSON object.
- **Thematic Concept (thematic_concept)**: A short, evocative theme (2-5 words) that synthesizes the vision and objective.
- **Reasoning (reasoning)**: Explain your strategy. How do the changes serve the objective, the Director's Vision, and the overall story?
- **Suggested Changes (suggested_changes)**: Provide a list of 5-8 specific, cohesive changes. Be bold and transformative.
- **Vocabulary**: When populating the 'enhancers' payload, use common and appropriate cinematic terms for the following categories: framing, movement, lens, pacing, lighting, mood, vfx, and plotEnhancements. Be creative but realistic.
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
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for co-director suggestions. This could be due to a content safety block.");
        }
        return JSON.parse(text.trim()) as CoDirectorResult;
    } catch (error) {
        console.error("Error getting co-director suggestions:", error);
        throw new Error(`Failed to get suggestions. ${commonError}`);
    }
};

export const generateVideoPrompt = async (timelineData: TimelineData, directorsVision: string): Promise<string> => {
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
        You are an expert prompt engineer for a state-of-the-art generative video AI. Your task is to synthesize the provided cinematic timeline and Director's Vision into a single, cohesive, and powerful generative prompt. The goal is to create a short, photorealistic, cinematic video clip that captures the key moment of the scene with impeccable quality.

        **Director's Vision / Desired Cinematic Style:**
        "${directorsVision}"

        **Provided Cinematic Timeline for the Scene:**
        ${detailedTimeline}

        **Global Style Notes / Negative Prompt (AVOID THESE):**
        "${negativePrompt || 'None'}"

        **Your Task & Prompt Format:**
        Based on ALL the information, create a single, comprehensive paragraph. This paragraph is the final prompt. It should describe the continuous action of a short video clip (3-5 seconds). Start with the most important shot and seamlessly blend details from other shots and enhancers. Describe camera movement, character actions, lighting changes, and the overall mood. Be vivid and concise. This is the only text that will be fed to the video model.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: prompt
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for the video prompt.");
        }
        return text.trim();
    } catch (error) {
        console.error("Error generating video prompt:", error);
        throw new Error(`Failed to generate video prompt. ${commonError}`);
    }
};

// --- Video Analysis ---
export const analyzeVideoFrames = async (frames: string[]): Promise<string> => {
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

    try {
        const response = await ai.models.generateContent({
            model: proModel,
            contents: { parts: [...imageParts, { text: prompt }] },
        });

        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for video analysis.");
        }
        return text;
    } catch (error) {
        console.error("Error analyzing video frames:", error);
        throw new Error(`Failed to analyze video. ${commonError}`);
    }
};


export const scoreContinuity = async (
    storyBible: StoryBible,
    directorsVision: string,
    scene: Scene,
    videoAnalysis: string
): Promise<ContinuityResult> => {
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

**1.1. Overall Story Bible (Thematic Foundation):**
- Logline: ${storyBible.logline}
- Plot Outline: ${storyBible.plotOutline}

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
    - **thematic_resonance**: How well did the video's overall feeling connect with the Story Bible's logline and plot?
2.  **overall_feedback**: A concise markdown paragraph explaining your scores. What worked well? What were the key discrepancies between intent and reality?
3.  **refinement_directives**: An array of 1-3 actionable suggestions to improve the creative intent for future generations. Each object in the array must have:
    - **target**: The area to improve ('story_bible', 'directors_vision', or 'scene_timeline').
    - **suggestion**: A specific, constructive suggestion for the user. (e.g., "The Director's Vision should be more specific about lighting, perhaps adding 'chiaroscuro' to better match the gritty theme.").
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

    try {
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
    } catch (error) {
        console.error("Error scoring continuity:", error);
        throw new Error(`Failed to score continuity. ${commonError}`);
    }
};