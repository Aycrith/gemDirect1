import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CoDirectorResult, Shot, StoryBible, StoryBibleV2, CharacterProfile, CharacterAppearance, PlotScene, StoryBibleTokenMetadata, Scene, TimelineData, CreativeEnhancers, ContinuityResult, BatchShotTask, BatchShotResult, ApiCallLog, Suggestion, DetailedShotResult, WorkflowMapping, isStoryBibleV2 } from "../types";
import { ApiStatus } from "../contexts/ApiStatusContext";
import { loadTemplate } from "./templateLoader";
import { generateCorrelationId, logCorrelation, networkTap } from "../utils/correlation";
import { estimateTokens } from "./promptRegistry";
import { convertToStoryBibleV2 } from "./storyBibleConverter";

// P2.6 Optimization (2025-11-20): Defer Gemini SDK initialization until first API call
// Instead of creating GoogleGenAI instance at module load, use lazy initialization
let ai: GoogleGenAI | null = null;
const getAI = () => {
  if (!ai) {
    ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  }
  return ai;
};

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
    // Generate correlation ID for this request chain
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    logCorrelation(
        { correlationId, timestamp: startTime, source: 'frontend' },
        `Starting ${context}`,
        { model: modelName, attempt: 1 }
    );

    let lastError: unknown = new Error(`API call failed for ${context}`);
    onStateChange?.('loading', `Requesting: ${context}...`);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const { result, tokens } = await apiCall();
            
            // Log successful correlation
            const duration = Date.now() - startTime;
            logCorrelation(
                { correlationId, timestamp: Date.now(), source: 'frontend' },
                `Completed ${context}`,
                { model: modelName, tokens, duration, attempt: attempt + 1 }
            );
            
            // Add to network tap for correlation tracking
            networkTap.add({
                correlationId,
                url: 'gemini-api',
                method: 'POST',
                status: 200,
                duration,
                timestamp: startTime,
            });

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
                const retryMessage = `Model is busy (rate limit). Automatically retrying in ${delayInSeconds}s... (Attempt ${attempt + 1}/${MAX_RETRIES})`;
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

const summarizationSystemInstruction = "You are an expert script supervisor. Your sole task is to distill the provided information into a concise, actionable brief according to the user's instructions. Be as efficient and direct as possible.";

const getPrunedContext = async (prompt: string, context: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel, // Use the more powerful model for summarization
            contents: prompt,
            config: {
                systemInstruction: summarizationSystemInstruction,
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
    const prompt = `You are a script supervisor. Your job is to create a concise "Cinematographer's Brief" for an AI Director of Photography. Distill the following information into a single, focused paragraph that will guide the creation of a shot list.

    **CRITICAL INFORMATION TO INCLUDE:**
    1.  **Scene's Core Purpose:** What is the main point of this scene in the story's journey (e.g., "The hero's lowest point," "Meeting the mentor").
    2.  **Key Visuals & Mood:** What are the most important elements of the Director's Vision that apply here? (e.g., "gritty neo-noir lighting," "Ghibli-style nature").
    3.  **Emotional Arc:** What is the emotional shift that must occur from the scene's beginning to its end?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context (Current Story Act): ${narrativeContext}
    - Scene Summary: ${sceneSummary}
    - Director's Vision: ${directorsVision}

    **OUTPUT:** A single, dense paragraph (under 150 words). Do not include any preamble or explanation.`;
    return getPrunedContext(prompt, 'prune context for shot generation', logApiCall, onStateChange);
};

// --- Context Pruning Functions for Story Bible Refinement ---

/**
 * Extracts minimal context for enhancing a Logline.
 * Context: Only character names + setting essence (50-75 words max)
 * Reduces token usage by ~90% compared to passing full Story Bible
 */
export const getPrunedContextForLogline = (storyBible: StoryBible): string => {
    // Type safety: ensure fields are strings
    const characters = typeof storyBible.characters === 'string' ? storyBible.characters : '';
    const setting = typeof storyBible.setting === 'string' ? storyBible.setting : '';
    
    // Extract character names from markdown formatted characters section
    const characterNames = characters
        .split('\n')
        .filter(line => line.trim().startsWith('**') || line.trim().startsWith('-'))
        .map(line => {
            const match = line.match(/\*\*(.*?)\*\*/);
            return match ? match[1] : null;
        })
        .filter(Boolean)
        .slice(0, 3); // Limit to 3 main characters
    
    // Extract first 100 chars of setting for genre/atmosphere hints
    const settingHint = setting.slice(0, 100).replace(/\n/g, ' ').trim();
    
    return `Characters: ${characterNames.join(', ')}. Setting: ${settingHint}...`;
};

/**
 * Extracts minimal context for enhancing Setting.
 * Context: Logline + genre themes from plot outline (75-100 words max)
 * Reduces token usage by ~85% compared to passing full Story Bible
 */
export const getPrunedContextForSetting = (storyBible: StoryBible): string => {
    // Type safety: ensure fields are strings
    const logline = typeof storyBible.logline === 'string' ? storyBible.logline : '';
    const plotOutline = typeof storyBible.plotOutline === 'string' ? storyBible.plotOutline : '';
    
    // Extract Act I from plot outline to infer themes
    const actIMatch = plotOutline.match(/Act I[:\-\s]+(.*?)(?=Act II|$)/is);
    const actISummary = actIMatch ? actIMatch[1].slice(0, 150).replace(/\n/g, ' ').trim() : '';
    
    return `Story: ${logline}. Key themes: ${actISummary}...`;
};

/**
 * Extracts minimal context for refining Characters.
 * Context: Logline + setting essence + plot Act I (100-150 words max)
 * Reduces token usage by ~80% compared to passing full Story Bible
 */
export const getPrunedContextForCharacters = (storyBible: StoryBible): string => {
    // Type safety: ensure fields are strings
    const logline = typeof storyBible.logline === 'string' ? storyBible.logline : '';
    const setting = typeof storyBible.setting === 'string' ? storyBible.setting : '';
    const plotOutline = typeof storyBible.plotOutline === 'string' ? storyBible.plotOutline : '';
    
    // Setting summary (first 80 chars)
    const settingSummary = setting.slice(0, 80).replace(/\n/g, ' ').trim();
    
    // Act I from plot outline (first 120 chars)
    const actIMatch = plotOutline.match(/Act I[:\-\s]+(.*?)(?=Act II|$)/is);
    const actISummary = actIMatch ? actIMatch[1].slice(0, 120).replace(/\n/g, ' ').trim() : '';
    
    return `Story: ${logline}. Setting: ${settingSummary}... Key plot: ${actISummary}...`;
};

/**
 * Extracts minimal context for refining Plot Outline.
 * Context: Logline + character roles only (75-100 words max)
 * Reduces token usage by ~85% compared to passing full Story Bible
 */
export const getPrunedContextForPlotOutline = (storyBible: StoryBible): string => {
    // Type safety: ensure fields are strings
    const logline = typeof storyBible.logline === 'string' ? storyBible.logline : '';
    const characters = typeof storyBible.characters === 'string' ? storyBible.characters : '';
    
    // Extract just character names and first descriptor
    const characterRoles = characters
        .split('\n')
        .filter(line => line.trim().startsWith('**') || line.trim().startsWith('-'))
        .map(line => {
            const match = line.match(/\*\*(.*?)\*\*[:\-\s]+(.*?)(?:\.|$)/);
            if (match) {
                return `${match[1]}: ${match[2].slice(0, 30)}`;
            }
            return null;
        })
        .filter(Boolean)
        .slice(0, 3)
        .join('. ');
    
    return `Story: ${logline}. Characters: ${characterRoles}.`;
}

export const getPrunedContextForCoDirector = async (
    storyBible: StoryBible,
    narrativeContext: string,
    scene: Scene,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const prompt = `You are an expert script analyst. Your job is to create a concise "Co-Director's Brief" that summarizes the creative sandbox for the current scene. The brief should focus on the *goals and constraints* for making creative suggestions.

    **CRITICAL INFORMATION TO SUMMARIZE:**
    1.  **Narrative Function:** What is this scene's specific job within the plot's current act (based on the story's structure)?
    2.  **Aesthetic Guardrails:** What are the key visual and tonal rules from the Director's Vision that MUST be followed?
    3.  **Character/Plot Development:** What key character change or plot point must be accomplished in this scene?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context (Current Story Act): ${narrativeContext}
    - Scene: "${scene.title}" - ${scene.summary}
    - Director's Vision: ${directorsVision}

    **OUTPUT:** A single, dense paragraph (under 200 words). Do not include any preamble or explanation.`;
    return getPrunedContext(prompt, 'prune context for co-director', logApiCall, onStateChange);
};

export const getPrunedContextForBatchProcessing = async (
    narrativeContext: string,
    directorsVision: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const prompt = `You are a script supervisor. Distill the following creative guidelines into a single, concise "Cinematographer's Brief". This brief will be used to guide an AI assistant in refining multiple shots within a single scene. Focus on the core rules and feeling.

    **SOURCE MATERIAL:**
    - Narrative Context (Current Story Stage/Goal): ${narrativeContext}
    - Director's Vision (Aesthetic & Tone): ${directorsVision}

    **OUTPUT:** A single, dense paragraph (under 100 words). Do not include any preamble or explanation.`;
    return getPrunedContext(prompt, 'prune context for batch processing', logApiCall, onStateChange);
};

// --- Core Story Generation ---

export const generateStoryBible = async (idea: string, genre: string = 'sci-fi', logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<StoryBibleV2> => {
    const context = 'generate Story Bible';
    
    // Load and apply template enhancement
    let templateGuidance = '';
    try {
        const template = await loadTemplate(genre);
        templateGuidance = `

**Template Guidance (${genre.charAt(0).toUpperCase() + genre.slice(1)} Genre):**
The following template has been selected to enhance narrative coherence and thematic consistency. Use these elements to guide your story generation:

${template.content}`;
    } catch (e) {
        console.warn(`[generateStoryBible] Failed to load template for genre "${genre}":`, e);
        // Continue without template guidance if loading fails
    }
    
    const prompt = `You are a master storyteller and screenwriter with a deep understanding of multiple narrative structures. Your task is to analyze a user's idea and generate a "Story Bible" using the most fitting narrative framework.

    **CRITICAL TOKEN BUDGET RULES (HARD LIMITS):**
    1. **Logline**: 50-100 words MAX (single compelling sentence)
    2. **Characters**: 3-5 character profiles, 80 words each MAX
    3. **Setting**: 200-300 words MAX
    4. **Plot Outline**: 8-12 scenes per act MAX
    
    **CRITICAL RULES FOR SECTION UNIQUENESS:**
    1. **Logline**: Extract ONLY the core concept, protagonist goal, and conflict. Max 100 words. DO NOT repeat the full story idea verbatim.
    2. **Characters**: Focus ONLY on roles, motivations, and relationships. DO NOT include plot events or setting descriptions.
    3. **Setting**: Describe ONLY the world, time period, and atmosphere. DO NOT mention character names or plot points.
    4. **Plot Outline**: Structure the narrative beats. DO NOT rehash the logline or character descriptions.

    Each section must contain NEW, complementary information that builds on previous sections WITHOUT repetition.

    **Narrative Frameworks Available:**
    - **Three-Act Structure:** A classic model with Setup, Confrontation, and Resolution.
    - **The Hero's Journey:** A mythic quest pattern (Ordinary World, Call to Adventure, Ordeal, etc.). Ideal for epic adventures.
    - **Seven-Point Story Structure:** A plot-focused model (Hook, Midpoint, Resolution, etc.). Great for thrillers and mysteries.
    - **Save the Cat:** A detailed beat sheet for commercial screenplays.
    - **Kishōtenketsu:** A four-act structure from East Asian narratives (Introduction, Development, Twist, Conclusion). Excellent for reflective stories or those with major twists.

    **User Idea:** "${idea}"${templateGuidance}

    **Your Task:**
    1.  Analyze the user's idea to determine its genre, length, and core conflict.
    2.  Select the **single most appropriate framework** from the list above that best serves the idea.
    3.  **If none of the frameworks fit well** (e.g., for experimental concepts, character studies, or very short stories), create a logical, **custom plot structure** with a clear beginning, middle, and end. Do not force a framework where it doesn't belong.
    4.  Generate a JSON object with DISTINCT, NON-REPETITIVE sections:
        a. **logline**: A single, concise sentence capturing the story's essence (protagonist, goal, conflict). 50-100 words MAX.
        b. **characters**: Markdown summary of key characters for backward compatibility.
        c. **characterProfiles**: Array of 3-5 structured character profiles with:
           - id: Unique identifier (e.g., "char-1")
           - name: Full character name
           - age: Character's age
           - appearance: Object with height, build, hair, eyes, distinguishingFeatures array, typicalAttire
           - personality: Array of 3-5 trait adjectives
           - backstory: Brief background (max 80 words)
           - motivations: Array of 2-3 primary goals
           - role: One of "protagonist", "antagonist", "supporting", or "background"
           - visualDescriptor: Compact visual description for AI image generation (max 50 words)
        d. **setting**: A paragraph describing the world's visual/atmospheric identity (200-300 words). Do NOT mention character names.
        e. **plotOutline**: Markdown-formatted three-act structure for backward compatibility.
        f. **plotScenes**: Array of 8-12 structured scene objects per act with:
           - actNumber: 1, 2, or 3
           - sceneNumber: Sequential number within act
           - summary: Brief scene description (max 50 words)
           - visualCues: Array of 2-4 key visual elements for image generation
           - characterArcs: Which character arcs advance in this scene
           - pacing: "slow", "medium", or "fast"
           - location: Primary location
           - timeOfDay: Time context
           - emotionalTone: Dominant emotion
    
    **Example of GOOD Character Profile:**
    {
      "id": "char-1",
      "name": "Detective Marcus Holt",
      "age": "45",
      "appearance": {
        "height": "6'1\"",
        "build": "lean and weathered",
        "hair": "salt-and-pepper, cropped short",
        "eyes": "steel gray, tired but sharp",
        "distinguishingFeatures": ["old scar across left cheek", "perpetual stubble"],
        "typicalAttire": "worn leather jacket over rumpled shirt"
      },
      "personality": ["cynical", "determined", "secretly compassionate"],
      "backstory": "Former homicide detective who left the force after a case went wrong. Lives alone in a downtown apartment, haunted by past failures.",
      "motivations": ["redemption for past mistakes", "protecting the innocent"],
      "role": "protagonist",
      "visualDescriptor": "Weathered 45yo detective, gray eyes, salt-pepper hair, leather jacket, stubbled face with cheek scar, urban noir aesthetic"
    }
    
    **Example of GOOD Plot Scene:**
    {
      "actNumber": 1,
      "sceneNumber": 2,
      "summary": "Marcus receives an anonymous letter at his apartment, containing a photo from his old case",
      "visualCues": ["dimly lit apartment", "scattered newspapers", "mysterious envelope", "faded photograph"],
      "characterArcs": ["Marcus forced to confront past"],
      "pacing": "slow",
      "location": "Marcus's downtown apartment",
      "timeOfDay": "late evening",
      "emotionalTone": "unsettling"
    }
    
    This approach ensures narrative depth while maintaining the required format for downstream video generation.`;

    // V2 Response Schema with structured character profiles and plot scenes
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            logline: { type: Type.STRING },
            characters: { type: Type.STRING },
            characterProfiles: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.STRING },
                        name: { type: Type.STRING },
                        age: { type: Type.STRING },
                        appearance: {
                            type: Type.OBJECT,
                            properties: {
                                height: { type: Type.STRING },
                                build: { type: Type.STRING },
                                hair: { type: Type.STRING },
                                eyes: { type: Type.STRING },
                                distinguishingFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
                                typicalAttire: { type: Type.STRING },
                            },
                        },
                        personality: { type: Type.ARRAY, items: { type: Type.STRING } },
                        backstory: { type: Type.STRING },
                        motivations: { type: Type.ARRAY, items: { type: Type.STRING } },
                        role: { type: Type.STRING },
                        visualDescriptor: { type: Type.STRING },
                    },
                    required: ['id', 'name', 'role', 'visualDescriptor'],
                },
            },
            setting: { type: Type.STRING },
            plotOutline: { type: Type.STRING },
            plotScenes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        actNumber: { type: Type.NUMBER },
                        sceneNumber: { type: Type.NUMBER },
                        summary: { type: Type.STRING },
                        visualCues: { type: Type.ARRAY, items: { type: Type.STRING } },
                        characterArcs: { type: Type.ARRAY, items: { type: Type.STRING } },
                        pacing: { type: Type.STRING },
                        location: { type: Type.STRING },
                        timeOfDay: { type: Type.STRING },
                        emotionalTone: { type: Type.STRING },
                    },
                    required: ['actNumber', 'sceneNumber', 'summary', 'visualCues', 'pacing'],
                },
            },
        },
        required: ['logline', 'characters', 'setting', 'plotOutline', 'characterProfiles', 'plotScenes'],
    };
    
    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for Story Bible.");
        }
        const parsed = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        
        // If Gemini returned V1 format (missing structured data), convert it
        if (!parsed.characterProfiles || parsed.characterProfiles.length === 0 ||
            !parsed.plotScenes || parsed.plotScenes.length === 0) {
            console.info('[generateStoryBible] Gemini returned incomplete V2 data, converting from markdown');
            const v2 = convertToStoryBibleV2(parsed as StoryBible);
            v2.genre = genre;
            return { result: v2, tokens };
        }
        
        // Build full V2 result with token metadata
        const result: StoryBibleV2 = {
            logline: parsed.logline,
            characters: parsed.characters,
            setting: parsed.setting,
            plotOutline: parsed.plotOutline,
            version: '2.0',
            characterProfiles: (parsed.characterProfiles || []).map((p: Partial<CharacterProfile>, i: number) => ({
                id: p.id || `char-${i + 1}`,
                name: p.name || 'Unknown',
                age: p.age,
                appearance: p.appearance || {},
                personality: p.personality || [],
                backstory: p.backstory || '',
                motivations: p.motivations || [],
                relationships: [],
                role: (p.role as CharacterProfile['role']) || 'supporting',
                visualDescriptor: p.visualDescriptor || p.name || 'Unknown character',
            })),
            plotScenes: (parsed.plotScenes || []).map((s: Partial<PlotScene>, i: number) => ({
                actNumber: (s.actNumber || 1) as 1 | 2 | 3,
                sceneNumber: s.sceneNumber || i + 1,
                summary: s.summary || '',
                visualCues: s.visualCues || [],
                characterArcs: s.characterArcs || [],
                pacing: (s.pacing as PlotScene['pacing']) || 'medium',
                location: s.location,
                timeOfDay: s.timeOfDay,
                emotionalTone: s.emotionalTone,
            })),
            tokenMetadata: {
                loglineTokens: estimateTokens(parsed.logline || ''),
                charactersTokens: estimateTokens(parsed.characters || ''),
                settingTokens: estimateTokens(parsed.setting || ''),
                plotOutlineTokens: estimateTokens(parsed.plotOutline || ''),
                totalTokens: 0,
                lastUpdated: Date.now(),
            },
            genre,
        };
        
        // Calculate total tokens
        if (result.tokenMetadata) {
            result.tokenMetadata.totalTokens = 
                result.tokenMetadata.loglineTokens + 
                result.tokenMetadata.charactersTokens + 
                result.tokenMetadata.settingTokens + 
                result.tokenMetadata.plotOutlineTokens;
        }
        
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

/**
 * Validates Story Bible for content uniqueness and quality.
 * Detects repetitive content across sections and checks minimum lengths.
 * @returns {valid: boolean, issues: string[]} - Validation result with issues list
 */
export const validateStoryBible = (bible: StoryBible): { valid: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    // Normalize text for comparison (lowercase, remove punctuation, split into words)
    const normalize = (text: string): Set<string> => {
        return new Set(
            text
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3) // Ignore short words like "the", "and"
        );
    };
    
    const loglineWords = normalize(bible.logline);
    const charWords = normalize(bible.characters);
    const settingWords = normalize(bible.setting);
    
    // Check for verbatim repetition between logline and other sections
    const charOverlap = Array.from(charWords).filter(w => loglineWords.has(w)).length;
    const charOverlapPercent = loglineWords.size > 0 ? (charOverlap / loglineWords.size) * 100 : 0;
    
    if (charOverlapPercent > 60) {
        issues.push(`Characters section repeats ${charOverlapPercent.toFixed(0)}%+ of Logline words`);
    }
    
    const settingOverlap = Array.from(settingWords).filter(w => loglineWords.has(w)).length;
    const settingOverlapPercent = loglineWords.size > 0 ? (settingOverlap / loglineWords.size) * 100 : 0;
    
    if (settingOverlapPercent > 60) {
        issues.push(`Setting section repeats ${settingOverlapPercent.toFixed(0)}%+ of Logline words`);
    }
    
    // Check section lengths
    if (bible.logline.length < 20) {
        issues.push('Logline too brief (< 20 chars)');
    }
    
    if (bible.logline.length > 160) {
        issues.push('Logline too long (> 160 chars)');
    }
    
    if (bible.characters.length < 50) {
        issues.push('Characters section too brief (< 50 chars)');
    }
    
    if (bible.setting.length < 50) {
        issues.push('Setting section too brief (< 50 chars)');
    }
    
    if (bible.plotOutline.length < 100) {
        issues.push('Plot Outline too brief (< 100 chars)');
    }
    
    // Check if logline appears verbatim in other sections
    if (bible.characters.includes(bible.logline)) {
        issues.push('Logline appears verbatim in Characters section');
    }
    
    if (bible.setting.includes(bible.logline)) {
        issues.push('Logline appears verbatim in Setting section');
    }
    
    if (bible.plotOutline.includes(bible.logline)) {
        issues.push('Logline appears verbatim in Plot Outline section');
    }
    
    return {
        valid: issues.length === 0,
        issues
    };
};

export const generateSceneList = async (plotOutline: string, directorsVision: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<Array<{ title: string; summary: string; temporalContext?: { startMoment: string; endMoment: string } }>> => {
    const context = 'generate scene list';
    const prompt = `You are an expert film editor and screenwriter, tasked with breaking a story outline into a series of powerful, cinematic scenes. A new scene should be created for any significant shift in **location, time, or character objective/conflict**. Each scene must serve a clear purpose.

    **Plot Outline (Based on the chosen narrative structure):**
    ${plotOutline}

    **Director's Vision (Aesthetic & Tonal Guide):**
    "${directorsVision}"

    Based on the above, generate a JSON array of scene objects. Each object must contain:
    1.  **title**: A short, evocative title that captures the scene's essence and aligns with the Director's Vision.
    2.  **summary**: CRITICAL - Generate a SINGLE-CLAUSE visual description describing ONE MOMENT IN TIME. Format: "[Subject] [Action Verb] [Location/Context]". Do NOT include multiple actions, narrative purposes, or emotional goals. Focus ONLY on the PRIMARY VISUAL MOMENT.
    3.  **temporalContext**: A JSON object with "startMoment" and "endMoment" strings describing the specific start and end points of the scene's action.
    
    GOOD Examples (Single Moment): 
    - "Two rivals face each other in an elegant dance studio under warm spotlight"
    - "A detective examines evidence in a rain-soaked alley at night"
    - "An elderly woman tends her garden in golden afternoon light"
    
    BAD Examples (Multi-Beat Narratives - AVOID):
    - "The hero confronts the gatekeeper, establishing the stakes of the journey" ❌ (two actions + narrative purpose)
    - "A quiet moment of reflection reveals the hero's inner doubt" ❌ (action + emotional goal)
    - "Two rivals must choreograph a dance to avert a political coup" ❌ (multiple actions + complex objective)`;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                temporalContext: {
                    type: Type.OBJECT,
                    properties: {
                        startMoment: { type: Type.STRING },
                        endMoment: { type: Type.STRING }
                    },
                    required: ['startMoment', 'endMoment']
                }
            },
            required: ['title', 'summary', 'temporalContext'],
        },
    };

    const apiCall = async () => {
        const response = await getAI().models.generateContent({
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

export const generateAndDetailInitialShots = async (
    prunedContext: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<DetailedShotResult[]> => {
    const context = 'generate and detail initial shots';
    const prompt = `You are an AI Director of Photography (DOP). Your task is to interpret a Cinematographer's Brief and create a compelling, initial shot list for a scene. The shots must flow together logically to build narrative and emotional momentum.

    **Cinematographer's Brief:**
    "${prunedContext}"

    **Your Task:**
    Generate a JSON object with a single key: "shots".
    The value should be an array of 3-4 shot objects. For each shot, provide:
    1.  "description": (string) A vivid, actionable description written as a clear instruction for a camera operator. It must be cinematic and concise.
    2.  "suggested_enhancers": (object) A JSON object of specific, synergistic creative enhancers (framing, movement, lighting, etc.) that bring the shot to life and align perfectly with the brief. Ensure the enhancers for each shot contribute to the scene's overall emotional arc, paying special attention to how lighting evolves to match the mood.`;
    
    const detailedShotsSchema = {
        type: Type.OBJECT,
        properties: {
            shots: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING },
                        suggested_enhancers: enhancersSchema,
                    },
                    required: ['description', 'suggested_enhancers'],
                },
            },
        },
        required: ['shots'],
    };
    
    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: detailedShotsSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for initial detailed shots.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result: result.shots, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};

// --- AI-Assisted Guidance & Suggestions ---

export const suggestStoryIdeas = async (logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string[]> => {
    const context = 'suggest ideas';
    const prompt = "You are a creative muse. Generate 3 diverse and compelling one-sentence story ideas for a cinematic experience. Return a JSON array of strings.";
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    
    const apiCall = async () => {
        const response = await getAI().models.generateContent({
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
        const response = await getAI().models.generateContent({
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

export const suggestNegativePrompts = async (directorsVision: string, sceneSummary: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string[]> => {
    const context = 'suggest negative prompts';
    const prompt = `You are an AI assistant for a prompt engineer. Based on the following creative direction, generate a JSON array of 5-7 useful, common negative prompts for a cinematic image generation task. The prompts should be short phrases.

    **Director's Vision (Style Guide):** "${directorsVision}"
    **Scene Summary (Content Guide):** "${sceneSummary}"

    Return a JSON array of strings. Do not include a preamble. Focus on terms that would prevent common image generation artifacts or styles that clash with the vision. For example, if the vision is "photorealistic," suggest negative prompts like "cartoon, drawing, anime".

    Example output: ["blurry, low-resolution", "text, watermark, signature", "ugly, deformed", "extra limbs", "bad anatomy"]
    `;
    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    
    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for negative prompt suggestions.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };
    
    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};


export const refineDirectorsVision = async (
    vision: string,
    storyBible: StoryBible,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const context = 'refine Director\'s Vision';
    const prompt = `You are a visionary film director and critic. Your task is to refine and expand upon the following "Director's Vision" to make it more evocative, detailed, and actionable for a creative team. Incorporate specific cinematic language and techniques that align with the provided story bible.

    **Story Bible (for context):**
    - Logline: ${storyBible.logline}
    - Characters: ${storyBible.characters}
    - Setting: ${storyBible.setting}
    - Plot Outline: ${storyBible.plotOutline}

    **Original Director's Vision to Refine:**
    ---
    "${vision}"
    ---

    **Your Output:**
    Return a single paragraph of the refined Director's Vision. It should be a more descriptive and professional version of the original idea, rich with cinematic terminology (e.g., mentioning camera work, color palettes, lighting styles, editing pace, sound design).`;

    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel,
            contents: prompt,
            config: { temperature: 0.7 },
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

export const refineStoryBibleSection = async (
    section: 'characters' | 'plotOutline' | 'logline' | 'setting',
    content: string,
    prunedContext: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<string> => {
    const context = `refine Story Bible ${section}`;
    
    // Check if this is a suggestion mode request
    const isSuggestionMode = content.includes('[SUGGESTION MODE]');
    const cleanContent = content.replace('[SUGGESTION MODE]', '').trim();
    
    let instruction = '';
    if (section === 'logline') {
        instruction = isSuggestionMode
            ? "You are a master storyteller. Based on the provided context, generate 3-5 compelling story loglines. Each must be a single sentence (140 characters max). Return ONLY a numbered list (1. 2. 3. etc), no preamble."
            : "You are a master storyteller. Refine this story logline to be a single, powerful sentence (140 characters maximum) that captures the entire story's essence. Make it compelling, concise, and cinematic. Focus on the protagonist's journey and central conflict. Return ONLY the refined logline sentence, no preamble or explanation.";
    } else if (section === 'setting') {
        instruction = isSuggestionMode
            ? "You are a master storyteller. Based on the provided context, generate 3-5 evocative setting descriptions. Each should be 1-2 sentences describing the world. Return ONLY a numbered list (1. 2. 3. etc), no preamble."
            : "You are a master storyteller. Refine this setting description to vividly describe the world, time period, and atmosphere. Add sensory details (sights, sounds, textures) and establish the tone. Focus on the environment and mood, NOT character descriptions. Return ONLY the refined setting description (2-4 sentences), no preamble.";
    } else if (section === 'characters') {
        instruction = "You are a master storyteller. Refine the following character descriptions to be more vivid and compelling. **Crucially, deepen their motivations, clarify their core desires, and introduce an internal or external conflict that drives their actions.** Return only the refined markdown text, without any introductory phrases like 'Here is the refined text:'.";
    } else { // plotOutline
        instruction = "You are a master screenwriter. Refine the following plot outline to enhance its dramatic structure, pacing, and emotional impact. Strengthen the turning points and clarify the stakes, respecting the underlying narrative framework of the original text. **Where appropriate, suggest a compelling plot twist or a moment of foreshadowing that elevates the story.** Return only the refined markdown text, without any introductory phrases like 'Here is the refined text:'.";
    }

    const prompt = isSuggestionMode
        ? `${instruction}

    **Context:**
    ${prunedContext}

    **Task:**
    ${cleanContent}
    `
        : `${instruction}

    **Minimal Context:**
    ${prunedContext}

    **Original Content to Refine:**
    ---
    ${content}
    ---
    `;

    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel,
            contents: prompt,
            config: { temperature: 0.6 },
        });
        const text = response.text;
        if (!text) {
            throw new Error(`The model returned an empty response for ${context}.`);
        }
        // Also remove markdown code fences if the model adds them
        const result = text.trim().replace(/^```markdown\n/, '').replace(/\n```$/, '');
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
    - "Introduce a shocking plot twist that re-contextualizes the scene."
    - "Weave in a subtle moment of foreshadowing for a future event."
    - "Use lighting to create a stronger sense of mystery or isolation."
    - "Heighten the emotional vulnerability of the main character."
    `;

    const responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
    const apiCall = async () => {
        const response = await getAI().models.generateContent({
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

const suggestedChangesSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            type: { type: Type.STRING, description: "One of 'UPDATE_SHOT', 'ADD_SHOT_AFTER', 'UPDATE_TRANSITION', 'UPDATE_STORY_BIBLE', 'UPDATE_DIRECTORS_VISION', 'FLAG_SCENE_FOR_REVIEW'." },
            shot_id: { type: Type.STRING, description: "Required for 'UPDATE_SHOT'." },
            after_shot_id: { type: Type.STRING, description: "Required for 'ADD_SHOT_AFTER'." },
            transition_index: { type: Type.INTEGER, description: "Required for 'UPDATE_TRANSITION'." },
            payload: {
                type: Type.OBJECT,
                description: "The data for the change.",
                properties: {
                    description: { type: Type.STRING, description: "The new shot description." },
                    title: { type: Type.STRING, description: "The title for a new shot." },
                    type: { type: Type.STRING, description: "The new transition type, e.g., 'Dissolve'." },
                    enhancers: enhancersSchema,
                    field: { type: Type.STRING, description: "For UPDATE_STORY_BIBLE, e.g., 'logline', 'characters'." },
                    new_content: { type: Type.STRING, description: "New content for bible or vision update." },
                    scene_id: { type: Type.STRING, description: "For FLAG_SCENE_FOR_REVIEW." },
                    reason: { type: Type.STRING, description: "Reason for flagging a scene." },
                }
            },
            description: { type: Type.STRING, description: "A human-readable summary of the proposed change." }
        },
        required: ['type', 'payload', 'description']
    }
};

export const getCoDirectorSuggestions = async (prunedContext: string, timelineSummary: string, objective: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<CoDirectorResult> => {
    const context = 'get Co-Director suggestions';
    const prompt = `You are an AI Co-Director with a deep understanding of narrative, cinematography, and editing. Your task is to analyze a scene and suggest specific, creative changes to achieve a user's stated objective. Be bold and imaginative, but your suggestions must respect the established creative boundaries. **Consider adding plot twists, moments of foreshadowing, or using advanced cinematic techniques (especially lighting and transitions) to heighten the emotional impact.**

    **Co-Director's Brief (Key Context):**
    ${prunedContext}

    **User's Creative Objective:**
    "${objective}"

    **Current Scene Timeline (Summary with Shot IDs):**
    ${timelineSummary}

    **Your Task:**
    Return a single, valid JSON object.
    1.  **thematic_concept**: A short, evocative phrase (3-5 words) that encapsulates your new creative direction for the scene (e.g., "Echoes of a Fading Memory", "The Walls Close In").
    2.  **reasoning**: A markdown-formatted paragraph. For each suggestion you make, you must explicitly state **why** it helps achieve the user's objective. Explain your creative choices clearly.
    3.  **suggested_changes**: A JSON array of 2-4 diverse, actionable suggestions. **Aim for variety: suggest changes to cinematography (lighting, framing), add a new story beat (like a plot twist or foreshadowing), or alter the pacing and transitions.** Each suggestion object must have:
        *   **type**: (string) One of 'UPDATE_SHOT', 'ADD_SHOT_AFTER', or 'UPDATE_TRANSITION'.
        *   **shot_id** or **after_shot_id** or **transition_index**: The identifier for where the change should occur.
        *   **payload**: (object) The data for the change.
        *   **description**: (string) A user-friendly summary of your proposed change.
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
        const response = await getAI().models.generateContent({
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
    prunedContext: string,
    logApiCall: ApiLogCallback,
    onStateChange?: ApiStateChangeCallback
): Promise<BatchShotResult[]> => {
    const context = 'batch process shots';
    const prompt = `You are an AI Cinematographer's assistant. Your task is to process a batch of shots from a single scene, ensuring your suggestions create a cohesive and dynamic sequence.

    **Cinematographer's Brief (Guiding Principles for the whole scene):**
    ${prunedContext}

    **Tasks (JSON Array):**
    ${JSON.stringify(tasks, null, 2)}

    **Your Task:**
    Process all tasks and return a JSON array of results. For each result:
    1.  **shot_id**: The ID of the processed shot.
    2.  **refined_description**: (optional) If requested, provide a more vivid and cinematic description.
    3.  **suggested_enhancers**: (optional) If requested, provide creative enhancers. **CRITICAL:** Ensure variety across the shots. Avoid repeating the same suggestions (e.g., don't suggest 'Close-Up' for every shot). The enhancers should show progression and work together to tell the scene's story.
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
        const response = await getAI().models.generateContent({
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

    return withRetry<BatchShotResult[]>(apiCall, context, proModel, logApiCall, onStateChange);
};

// --- Image and Video Analysis ---

export const generateKeyframeForScene = async (vision: string, sceneSummary: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<string> => {
    const context = 'generate scene keyframe';
    const prompt = `masterpiece, 8k, photorealistic, cinematic lighting, 16:9 aspect ratio.

Generate a single, cinematic, high-quality keyframe image that encapsulates the essence of an entire scene. This image must be a powerful, evocative representation of the scene's most crucial moment or overall mood, strictly adhering to the specified Director's Vision.

**Director's Vision (Cinematic Style Bible):**
"${vision}"

**Scene to Visualize:**
"${sceneSummary}"

**NEGATIVE PROMPT:**
text, watermarks, logos, blurry, ugly, tiling, poorly drawn hands, poorly drawn faces, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, signature, username, error, jpeg artifacts, low resolution, censorship, amateur, boring, static, centered composition.
`;

    const apiCall = async () => {
        const response = await getAI().models.generateContent({
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

    const prompt = `An award-winning cinematic photograph, masterpiece, 8k, photorealistic.

Generate a single keyframe image for a specific shot. The image must perfectly capture the shot's detailed description and creative enhancers, while strictly adhering to the project's overall Style Bible (Director's Vision).

**Style Bible (Director's Vision):**
This is the absolute rule for the image's aesthetic.
---
${directorsVision}
---

**Overall Scene Context:**
${sceneSummary}

---
**SPECIFIC SHOT DETAILS TO RENDER**

**Description:**
${shot.description}

**Creative Enhancers to Render Precisely:**
- Framing: ${enhancers.framing?.join(', ') || 'N/A'}
- Camera Movement: ${enhancers.movement?.join(', ') || 'N/A'}
- Lens & Focus: ${enhancers.lens?.join(', ') || 'N/A'}
- Lighting Style: ${enhancers.lighting?.join(', ') || 'N/A'} **Lighting is critical: create the exact lighting style described (e.g., 'Low-Key' means dramatic shadows, not just a dark image).**
- Mood & Tone: ${enhancers.mood?.join(', ') || 'N/A'}
- Visual Style & VFX: ${enhancers.vfx?.join(', ') || 'N/A'}

---
**NEGATIVE PROMPT:**
text, watermark, logo, signature, username, error, blurry, jpeg artifacts, low resolution, censorship, ugly, tiling, poorly drawn hands, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, amateur, boring, static composition, split-screen, multi-panel, grid layout, character sheet, product catalog, symmetrical array, repeated elements, duplicated subjects, storyboard, comic layout, collage, multiple scenes, side-by-side, tiled images, panel borders, manga style, separated frames, before-after comparison, sequence panels, dual perspective, fragmented scene, picture-in-picture, montage, reflection, mirrored composition, horizontal symmetry, vertical symmetry, above-below division, sky-ground split.
`;

    const apiCall = async () => {
        const response = await getAI().models.generateContent({
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
        const response = await getAI().models.generateContent({
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
     const prompt = `You are a script supervisor preparing for a continuity check. Distill the following information into a concise "Continuity Brief". The brief should focus on the *intended* creative and narrative goals against which a generated video will be judged.

    **CRITICAL INFORMATION TO SUMMARIZE:**
    1.  **Core Narrative Purpose:** What is the primary goal of this scene in the plot?
    2.  **Aesthetic Blueprint:** What are the key visual and tonal mandates from the Director's Vision?
    3.  **Key Moments & Visuals:** What are the most important beats or shots described in the timeline that MUST be present?

    **SOURCE MATERIAL:**
    - Story Logline: ${storyBible.logline}
    - Narrative Context (Current Story Act): ${narrativeContext}
    - Scene: "${scene.title}" - ${scene.summary}
    - Director's Vision: ${directorsVision}
    - Scene Shot List Summary: ${scene.timeline.shots.map(s => `- ${s.description}`).join('\n')}

    **OUTPUT:** A single, dense paragraph (under 200 words). Do not include any preamble or explanation.`;
    return getPrunedContext(prompt, 'prune context for continuity', logApiCall, onStateChange);
};


export const scoreContinuity = async (prunedContext: string, scene: Scene, videoAnalysis: string, logApiCall: ApiLogCallback, onStateChange?: ApiStateChangeCallback): Promise<ContinuityResult> => {
    const context = 'score continuity';
    const prompt = `You are an expert film critic and continuity supervisor with an extremely critical eye. Your task is to analyze a generated video's summary and score its alignment with the original creative intent. You must be strict and provide structured, actionable suggestions to fix any deviations, prioritizing fixes that address the root cause.

    **Continuity Brief (The Intention):**
    ${prunedContext}

    **Original Scene Timeline (The Blueprint):**
    ${JSON.stringify(scene.timeline, null, 2)}

    **AI's Analysis of the Generated Video (The Result):**
    ${videoAnalysis}
    
    **Critical Analysis:** Before providing suggestions, consider *why* the generated video failed. Does it indicate a flaw in the original shot description? A clash between the director's vision and the scene's content? A misunderstanding of the narrative's core purpose? Your suggestions must aim to fix the root cause, not just the symptom.

    **Your Task:**
    Provide a detailed critique as a JSON object.
    1.  **scores**: A JSON object with three scores, each from 1-10 (integer). Be strict.
        *   **narrative_coherence**: How well does the video's action match the scene's plot purpose?
        *   **aesthetic_alignment**: How well does the video's visual style match the Director's Vision? **Pay close attention to specified lighting and mood.**
        *   **thematic_resonance**: How well does the video capture the intended mood and emotional core?
    2.  **overall_feedback**: A markdown-formatted paragraph summarizing your assessment. What worked, and what were the biggest deviations?
    3.  **suggested_changes**: A JSON array of specific, actionable suggestions. **Prioritize high-level, root-cause fixes.**
        *   **Project-Level Fixes:** If the issue is fundamental, first suggest changes to core documents using **'UPDATE_STORY_BIBLE'** or **'UPDATE_DIRECTORS_VISION'**. If this change affects other scenes, use **'FLAG_SCENE_FOR_REVIEW'**.
        *   **Timeline Fixes:** Then, suggest changes to the current scene's timeline to fix specific issues (using 'UPDATE_SHOT', 'ADD_SHOT_AFTER', etc.).
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
        const response = await getAI().models.generateContent({
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
        const response = await getAI().models.generateContent({
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
        const response = await getAI().models.generateContent({
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

export const generateWorkflowMapping = async (
    workflowJson: string, 
    logApiCall: ApiLogCallback, 
    onStateChange?: ApiStateChangeCallback
): Promise<WorkflowMapping> => {
    const context = 'generate ComfyUI workflow mapping';
    const prompt = `You are an expert system integrator for ComfyUI workflows. Your task is to analyze the provided ComfyUI workflow JSON and determine the optimal data mappings for the "Cinematic Story Generator" application.

    **Application Data Types Available for Mapping:**
    - "human_readable_prompt": The main positive prompt, a detailed text description of the entire scene.
    - "full_timeline_json": A structured JSON payload of the entire scene (alternative to the human-readable prompt).
    - "keyframe_image": The initial input image that serves as the scene's keyframe.
    - "negative_prompt": The scene-wide negative prompt text.

    **Workflow JSON to Analyze:**
    \`\`\`json
    ${workflowJson}
    \`\`\`

    **Your Task:**
    1.  Identify the primary text input node for the positive prompt. This is typically a \`CLIPTextEncode\` node where the input is named "text" or "prompt". Map this to **"human_readable_prompt"**.
    2.  Identify the primary text input node for the negative prompt. This will also be a \`CLIPTextEncode\` node, often connected to the "negative" input of a sampler. Map this to **"negative_prompt"**.
    3.  Identify the initial image input node. This is almost always a \`LoadImage\` node. Map its "image" input to **"keyframe_image"**.
    4.  Return a single, valid JSON object representing the mapping. The keys should be in the format \`"nodeId:inputName"\` and the values should be one of the application data types listed above.

    **Example Output Format:**
    {
      "3:text": "human_readable_prompt",
      "4:image": "keyframe_image",
      "7:text": "negative_prompt"
    }
    
    Do not include any data types that are not present in the workflow. If an input (like a negative prompt) is not found, do not include it in the mapping. Return only the JSON object.`;

    const responseSchema = {
        type: Type.OBJECT,
        description: "A mapping of ComfyUI node inputs to application data types.",
        // We cannot define exact properties as they are dynamic based on the workflow.
        // Let the model generate the key-value pairs freely.
    };

    const apiCall = async () => {
        const response = await getAI().models.generateContent({
            model: proModel, // Use gemini-2.5-pro for this complex reasoning task
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: responseSchema, temperature: 0.1 },
        });
        const text = response.text;
        if (!text) {
            throw new Error("The model returned an empty response for workflow mapping.");
        }
        const result = JSON.parse(text.trim());
        const tokens = response.usageMetadata?.totalTokenCount || 0;
        return { result, tokens };
    };

    return withRetry(apiCall, context, proModel, logApiCall, onStateChange);
};