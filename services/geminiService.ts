import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, Shot, ShotEnhancers } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Constants for available options to guide the AI suggestions
const FRAMING_OPTIONS = ["Bird's-Eye View", "Close-Up", "Cowboy Shot", "Establishing Shot", "Extreme Close-Up", "Full Shot", "High Angle", "Low Angle", "Medium Shot", "Over-the-Shoulder", "Point of View", "Two Shot", "Wide Shot", "Worm's-Eye View"];
const MOVEMENT_OPTIONS = ["Arc Shot", "Crane/Jib Shot", "Dolly Zoom", "Dutch Tilt", "Follow Shot", "Handheld", "Pan", "Pull Out", "Push In", "Static Shot", "Steadicam", "Tilt", "Tracking Shot", "Whip Pan", "Zoom In/Out"];
const LENS_OPTIONS = ["Anamorphic", "Bokeh", "Deep Focus", "Fisheye Lens", "Lens Flare", "Rack Focus", "Shallow Depth of Field", "Soft Focus", "Split Diopter", "Telephoto", "Tilt-Shift", "Wide-Angle"];
const PACING_OPTIONS = ["Bullet Time", "Chaotic", "Cross-Cutting", "Fast-Paced", "Freeze Frame", "Graceful", "Jump Cut", "Long Take", "Montage", "Slow Motion", "Smash Cut", "Speed Ramp"];
const LIGHTING_OPTIONS = ["Low-Key (Chiaroscuro)", "High-Key", "Backlight / Rim Light", "Golden Hour", "Neon Glow", "Hard Lighting"];
const MOOD_OPTIONS = ["Suspenseful", "Epic", "Gritty", "Dreamlike", "Tense", "Energetic", "Nostalgic"];
const VFX_OPTIONS = ["Bleach Bypass", "Chromatic Aberration", "Color Grading (Teal & Orange)", "Day-for-Night", "Desaturated", "Film Grain", "Glitch Effect", "Glow/Bloom", "High Contrast", "Lens Dirt/Smudges", "Light Leaks", "Motion Blur", "Particle Effects", "Scanlines", "VHS Look", "Vignette"];
const PLOT_ENHANCEMENTS_OPTIONS = ["Add Character Action", "Introduce Conflict", "Foreshadowing Moment", "Heighten Emotion", "Add Dialogue Snippet", "Reveal a Detail"];
const TRANSITION_OPTIONS = ["Cut", "Dissolve", "Wipe", "Match Cut", "J-Cut", "L-Cut", "Whip Pan", "Glitch Effect", "Fade to Black"];

const imagePartsFromFrames = (frames: string[]) => {
    return frames.map(frame => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: frame.split(',')[1], // remove base64 prefix
        },
    }));
}

const generateWithTimeout = <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    const timeoutPromise = new Promise<T>((_, reject) => {
        setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
};


export const generateShotList = async (frames: string[]): Promise<Shot[]> => {
    const model = 'gemini-2.5-flash'; // Switched to a faster model for multimodal input
    const prompt = `Analyze these sequential frames from a 10-second video clip. Break the action down into distinct shots or beats (ideally 2-3 for a short clip). For each shot, provide a concise, cinematic description and a short, catchy title.
    Respond with a valid JSON array, where each object has an "id" (e.g., "shot_1"), a "title" (e.g., "The Alley Chase"), and a "description". Do not include any other text.
    Example: [{"id": "shot_1", "title": "The Reveal", "description": "A wide shot of a car drifting around a dusty corner."}]`;

    try {
        const apiCall = ai.models.generateContent({
            model,
            contents: { parts: [...imagePartsFromFrames(frames), { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            title: { type: Type.STRING },
                            description: { type: Type.STRING },
                        },
                    },
                },
            },
        });

        const response: GenerateContentResponse = await generateWithTimeout(
            apiCall, 
            60000, 
            'AI shot detection timed out. The model may be busy or the video is too complex. Please try again.'
        );

        const result = JSON.parse(response.text);
        if (Array.isArray(result) && result.length > 0) {
            return result.map((shot, index) => ({ ...shot, id: shot.id || `shot_${index + 1}` })); // Ensure ID exists
        }
        // Fallback for unexpected but valid JSON
        return [{ id: 'shot_1', title: 'Full Scene', description: 'The AI could not split the video into shots. Please describe the entire sequence here.' }];
    } catch (error) {
        console.error("Error generating shot list:", error);
        if (error instanceof Error) {
            throw error; // Re-throw the specific error (e.g., timeout)
        }
        throw new Error("AI failed to generate a shot list for the video.");
    }
}

export const suggestEnhancementsForTimeline = async (shots: Shot[]): Promise<{ shotEnhancers: ShotEnhancers, transitions: string[], negativePrompts: string[] }> => {
    const model = 'gemini-2.5-flash'; // Switched to a faster model for suggestion generation
    const shotDescriptions = shots.map(s => `  - ${s.id} (${s.title}): ${s.description}`).join('\n');
    
    const prompt = `
        Based on the following shot list from a video, suggest a complete creative blueprint to make the scene more impactful.
        
        Shot List:
        ${shotDescriptions}

        Your response MUST be a single, valid JSON object with three keys: "shotEnhancers", "transitions", and "negativePrompts".
        1. "shotEnhancers": An object where each key is a shot id from the list. The value for each shot id should be an object containing suggested creative enhancers. For each category below, choose ONE OR TWO options you feel would best complement that specific shot.
        2. "transitions": An array of strings suggesting a transition between each shot. The number of transitions should be exactly one less than the number of shots.
        3. "negativePrompts": An array of 3-5 strings suggesting things to AVOID (e.g., "shaky camera", "dull colors") based on the overall tone.

        Available Options:
        - framing: ${JSON.stringify(FRAMING_OPTIONS)}
        - movement: ${JSON.stringify(MOVEMENT_OPTIONS)}
        - lens: ${JSON.stringify(LENS_OPTIONS)}
        - pacing: ${JSON.stringify(PACING_OPTIONS)}
        - lighting: ${JSON.stringify(LIGHTING_OPTIONS)}
        - mood: ${JSON.stringify(MOOD_OPTIONS)}
        - vfx: ${JSON.stringify(VFX_OPTIONS)}
        - plotEnhancements: ${JSON.stringify(PLOT_ENHANCEMENTS_OPTIONS)}
        - transitions: ${JSON.stringify(TRANSITION_OPTIONS)}
    `;

    try {
         const apiCall = ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            },
        });

        const response: GenerateContentResponse = await generateWithTimeout(
            apiCall, 
            60000, 
            'AI suggestion generation timed out. The model may be busy. Please try again.'
        );

        const jsonString = response.text.trim().replace(/```json|```/g, '');
        return JSON.parse(jsonString);

    } catch(error) {
        console.error("Error suggesting creative enhancements:", error);
        if (error instanceof Error) {
            throw error; // Re-throw the specific error (e.g., timeout)
        }
        throw new Error("AI failed to generate creative suggestions.");
    }
}


export const analyzeVideoAction = async (shots: Shot[], shotEnhancers: ShotEnhancers, transitions: string[], negativePrompt: string): Promise<AnalysisResult> => {
    const model = 'gemini-2.5-pro'; // Keep Pro model for high-quality final analysis

    const timelineDescription = shots.map((shot, index) => {
        const enhancers = shotEnhancers[shot.id] || {};
        const enhancerStrings = Object.entries(enhancers)
            .map(([key, value]) => {
                if (Array.isArray(value) && value.length > 0) {
                     const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
                    return `**${formattedKey}**: ${value.join(', ')}`;
                }
                return null;
            })
            .filter(Boolean)
            .join('; ');

        let shotBlock = `**Shot ${index + 1} (${shot.title || 'Untitled'}):** "${shot.description}"\n*Creative Direction*: ${enhancerStrings || 'None specified'}.`;

        if (index < transitions.length) {
            shotBlock += `\n\n*--[${transitions[index] || 'Cut'}]-->*\n`;
        }
        return shotBlock;
    }).join('\n');
    
    const prompt = `
    You are a world-class VFX supervisor and cinematographer, tasked with improving a 10-second video clip described by the following timeline.
    
    **Timeline & Creative Direction:**
    ${timelineDescription}
    
    **Overall Guideline / Negative Prompt (apply globally):** ${negativePrompt.trim() ? negativePrompt.trim() : 'None specified'}.

    Based on this timeline, provide two distinct pieces of content in JSON format: 
    1.  **Cinematic Feedback**: A detailed critique of the described action as a whole sequence, covering pacing, flow between shots, and overall impact based on the creative direction provided. Use markdown for formatting.
    2.  **Improvement & Remix Prompt**: A highly specific, creative, and sequential prompt to remix or improve this video. This prompt MUST be technically detailed, narrating the sequence shot-by-shot. Directly incorporate the creative direction for EACH shot and the specified transitions BETWEEN them to create a cohesive and actionable instruction for a video generation AI. Use markdown for formatting.`;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        feedback: {
                            type: Type.STRING,
                            description: "Detailed critique of the cinematic action. Use markdown for lists and emphasis.",
                        },
                        improvement_prompt: {
                            type: Type.STRING,
                            description: "A creative, technical, and specific prompt for remixing the video, incorporating all selected creative direction and suggesting transitions. Use markdown for structure.",
                        },
                    },
                    required: ["feedback", "improvement_prompt"],
                },
            },
        });
        
        const jsonString = response.text;
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("Error analyzing video action:", error);
        throw new Error("Failed to get analysis from AI. Please check the console for more details.");
    }
};