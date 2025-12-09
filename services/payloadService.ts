
import { TimelineData, Shot, CreativeEnhancers, Scene, StoryBible } from '../types';
import { assemblePromptForProvider, buildSceneKeyframePrompt, buildComfyUIPrompt, type AssembledPrompt } from './promptPipeline';
import { createLogger } from '../utils/logger';

const logger = createLogger('Payload');

// ============================================================================
// Payload Validation
// ============================================================================

/**
 * Payload shape expected by ComfyUI integration.
 * 
 * The `structured` field can contain different payload shapes depending on
 * the generation type (keyframe, shot, video). Each payload type has its own
 * structure but all are arrays of objects.
 */
export interface ComfyUIPayloads {
    json: string;
    text: string;
    /** Structured payload data - shape varies by generation type */
    structured: Record<string, unknown>[];
    negativePrompt: string;
}

/**
 * Shot data in the interleaved timeline
 */
interface TimelineShotEntry {
    type: 'shot';
    shot_number: number;
    description: string;
    enhancers: Record<string, unknown>;
}

/**
 * Transition data in the interleaved timeline
 */
interface TimelineTransitionEntry {
    type: 'transition';
    transition_type: string;
}

/**
 * Union type for interleaved timeline entries
 */
type InterleavedTimelineEntry = TimelineShotEntry | TimelineTransitionEntry;

/**
 * Validation result for payload shape checking.
 */
export interface PayloadValidationResult {
    valid: boolean;
    issues: string[];
}

/**
 * Validate that a payload object has all required fields with correct types.
 * Logs warnings but does not throw - allows graceful degradation.
 * 
 * @param payload - Object to validate
 * @param context - Optional context for logging (e.g., "generateKeyframePayloads")
 * @returns Validation result with any issues found
 */
export function validatePayloadShape(
    payload: unknown,
    context?: string
): PayloadValidationResult {
    const issues: string[] = [];
    const prefix = context ? `[${context}] ` : '';

    if (!payload || typeof payload !== 'object') {
        issues.push('Payload must be a non-null object');
        logger.warn(`${prefix}Invalid payload: not an object`);
        return { valid: false, issues };
    }

    const obj = payload as Record<string, unknown>;

    // Required: json (string)
    if (typeof obj.json !== 'string') {
        issues.push('Payload.json must be a string');
    } else if (obj.json.trim() === '') {
        issues.push('Payload.json must not be empty');
    }

    // Required: text (string)
    if (typeof obj.text !== 'string') {
        issues.push('Payload.text must be a string');
    } else if (obj.text.trim() === '') {
        issues.push('Payload.text must not be empty');
    }

    // Required: structured (array)
    if (!Array.isArray(obj.structured)) {
        issues.push('Payload.structured must be an array');
    }

    // Required: negativePrompt (string, can be empty)
    if (typeof obj.negativePrompt !== 'string') {
        issues.push('Payload.negativePrompt must be a string');
    }

    if (issues.length > 0) {
        logger.warn(`${prefix}Payload validation failed`, { issues });
        return { valid: false, issues };
    }

    return { valid: true, issues: [] };
}

/**
 * Assert payload is valid, logging detailed warnings if not.
 * Does NOT throw - returns the payload unchanged for graceful degradation.
 * 
 * @param payload - Payload to validate
 * @param context - Context for logging
 * @returns Same payload, unchanged
 */
function assertValidPayload<T extends ComfyUIPayloads>(payload: T, context: string): T {
    const result = validatePayloadShape(payload, context);
    if (!result.valid) {
        logger.error(`Payload contract violation in ${context}`, { 
            issues: result.issues,
            payloadKeys: Object.keys(payload),
        });
    }
    return payload;
}

const generateHumanReadablePromptForShot = (
    shot: Shot, 
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>,
    index: number
): string => {
    let prompt = `Shot ${index + 1}: ${shot.description}`;
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
            prompt += ` (Style: ${enhancerText})`;
        }
    }
    return prompt.trim() + '.';
};


/**
 * Structured payload item for video generation
 * Index signature allows compatibility with ComfyUIPayloads.structured
 */
export interface VideoPayloadItem {
    shotNumber: number;
    text: string;
    image: string | null;
    transition: string | null;
    [key: string]: unknown;  // Index signature for Record compatibility
}

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
    sceneSummary: string,
    generatedShotImages: Record<string, string>
): { json: string; text: string; structured: VideoPayloadItem[]; negativePrompt: string } => {

    const interleavedTimeline = timeline.shots.reduce<InterleavedTimelineEntry[]>((acc, shot, index) => {
        const shotData: TimelineShotEntry = {
            type: 'shot',
            shot_number: index + 1,
            description: shot.description,
            enhancers: timeline.shotEnhancers[shot.id] || {}
        };
        acc.push(shotData);

        if (index < timeline.transitions.length) {
            const transitionValue = timeline.transitions[index];
            if (transitionValue !== undefined) {
                const transitionData: TimelineTransitionEntry = {
                    type: 'transition',
                    transition_type: transitionValue
                };
                acc.push(transitionData);
            }
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
    
    let fullTextPrompt = `Create a cinematic sequence. The scene is about: "${sceneSummary}". The overall visual style should be "${directorsVision}".\n\n`;
    const structuredPayload: VideoPayloadItem[] = timeline.shots.map((shot, index) => {
        const text = generateHumanReadablePromptForShot(shot, timeline.shotEnhancers[shot.id] || {}, index);
        const image = generatedShotImages[shot.id] || null;
        const transition = index < timeline.transitions.length ? timeline.transitions[index] : null;

        fullTextPrompt += text;
        if(transition) {
            fullTextPrompt += `\n\n--[${transition}]-->\n\n`;
        }

        return {
            shotNumber: index + 1,
            text,
            image,
            transition: transition ?? null,
        };
    });
    
     if (timeline.negativePrompt) {
        fullTextPrompt += `\n\nGlobal Style & Negative Prompt: ${timeline.negativePrompt}`;
    }

    const result = { json, text: fullTextPrompt.trim(), structured: structuredPayload, negativePrompt: timeline.negativePrompt || '' };
    return assertValidPayload(result, 'generateVideoRequestPayloads');
};

/**
 * Bookend workflow: Prompts for temporal start/end keyframes
 */
const BOOKEND_START_PREFIX = 
  'OPENING FRAME: Generate the FIRST MOMENT of this scene. ' +
  'Show the INITIAL STATE before action begins. ' +
  'WIDE ESTABLISHING SHOT: EXACTLY ONE UNIFIED CINEMATIC SCENE...';

const BOOKEND_END_PREFIX = 
  'CLOSING FRAME: Generate the FINAL MOMENT of this scene. ' +
  'Show the CONCLUDING STATE after action completes. ' +
  'WIDE ESTABLISHING SHOT: EXACTLY ONE UNIFIED CINEMATIC SCENE...';

/**
 * Bookend payloads for start/end keyframe generation.
 * Each bookend payload matches the ComfyUIPayloads structure.
 */
export interface BookendPayloads {
  start: ComfyUIPayloads;
  end: ComfyUIPayloads;
}

/**
 * Generates start and end keyframe prompts for bookend workflow
 * @param sceneSummary Brief summary of the scene
 * @param storyContext Story bible or narrative context
 * @param directorsVision Visual style guide
 * @param temporalContext Start and end moments for the scene
 * @param negativePrompt Negative prompt to apply
 * @returns Separate payloads for start and end keyframes
 */
export function generateBookendPayloads(
  sceneSummary: string,
  storyContext: string,
  directorsVision: string,
  temporalContext: { startMoment: string; endMoment: string },
  negativePrompt: string
): BookendPayloads {
  const baseContext = `${storyContext}\n\nVisual Style: ${directorsVision}`;
  
  const startPrompt = `${BOOKEND_START_PREFIX}

SCENE OPENING: ${temporalContext.startMoment}

${sceneSummary}

${baseContext}`;

  const endPrompt = `${BOOKEND_END_PREFIX}

SCENE CONCLUSION: ${temporalContext.endMoment}

${sceneSummary}

${baseContext}`;

  return {
    start: {
      json: JSON.stringify({ 
        prompt: startPrompt,
        metadata: {
          type: 'bookend_start',
          scene: sceneSummary,
          moment: temporalContext.startMoment
        }
      }),
      text: startPrompt,
      structured: [{ 
        prompt: startPrompt,
        type: 'bookend_start',
        moment: temporalContext.startMoment
      }],
      negativePrompt
    },
    end: {
      json: JSON.stringify({ 
        prompt: endPrompt,
        metadata: {
          type: 'bookend_end',
          scene: sceneSummary,
          moment: temporalContext.endMoment
        }
      }),
      text: endPrompt,
      structured: [{ 
        prompt: endPrompt,
        type: 'bookend_end',
        moment: temporalContext.endMoment
      }],
      negativePrompt
    }
  };
}

// ============================================================================
// Pipeline-Integrated Payload Generators (Phase 3)
// ============================================================================

/**
 * Generates keyframe payloads using the prompt pipeline.
 * 
 * This function uses `buildSceneKeyframePrompt` to create a prompt optimized
 * for keyframe generation, then formats it for ComfyUI consumption.
 * 
 * @param scene - The scene to generate a keyframe for
 * @param storyBible - Story bible with character profiles
 * @param directorsVision - Director's visual styling notes
 * @param negativePrompts - Negative prompts to include
 * @returns Payloads formatted for queueComfyUIPrompt
 */
export function generateKeyframePayloads(
    scene: Scene,
    storyBible: StoryBible,
    directorsVision: string,
    negativePrompts: string[] = []
): ComfyUIPayloads {
    // Use the prompt pipeline to build the keyframe prompt
    const assembled = buildSceneKeyframePrompt(scene, storyBible, directorsVision, negativePrompts);
    
    // Format for ComfyUI consumption
    const jsonPayload = {
        prompt: assembled.separateFormat.positive,
        negative: assembled.separateFormat.negative,
        metadata: {
            type: 'scene_keyframe',
            sceneId: scene.id,
            sceneTitle: scene.title || 'Untitled Scene',
            timestamp: new Date().toISOString(),
            pipelineVersion: '2.0',
        }
    };
    
    const result: ComfyUIPayloads = {
        json: JSON.stringify(jsonPayload, null, 2),
        text: assembled.separateFormat.positive,
        structured: [{
            type: 'keyframe',
            sceneId: scene.id,
            prompt: assembled.separateFormat.positive,
            negative: assembled.separateFormat.negative,
        }],
        negativePrompt: assembled.separateFormat.negative,
    };
    return assertValidPayload(result, 'generateKeyframePayloads');
}

/**
 * Generates payloads for a single shot using the prompt pipeline.
 * 
 * @param shot - The shot to generate
 * @param scene - The scene containing the shot
 * @param storyBible - Story bible with character profiles
 * @param directorsVision - Director's visual styling notes
 * @param enhancers - Shot-specific enhancers
 * @param negativePrompts - Negative prompts to include
 * @returns Payloads formatted for queueComfyUIPrompt
 */
export function generateShotPayloads(
    shot: Shot,
    scene: Scene,
    storyBible: StoryBible,
    directorsVision: string,
    enhancers?: Partial<Omit<CreativeEnhancers, 'transitions'>>,
    negativePrompts: string[] = []
): ComfyUIPayloads {
    const timelineEnhancers = scene.timeline?.shotEnhancers ?? {};
    const shotEnhancerMap = enhancers
        ? { ...timelineEnhancers, [shot.id]: enhancers }
        : timelineEnhancers;

    const comfyPrompt = buildComfyUIPrompt(
        storyBible,
        scene,
        shot,
        directorsVision,
        negativePrompts,
        undefined,
        shotEnhancerMap
    );

    const jsonPayload = {
        prompt: comfyPrompt.positive,
        negative: comfyPrompt.negative,
        metadata: {
            type: 'shot',
            shotId: shot.id,
            sceneId: scene.id,
            timestamp: new Date().toISOString(),
            pipelineVersion: '2.0',
        }
    };
    
    const result: ComfyUIPayloads = {
        json: JSON.stringify(jsonPayload, null, 2),
        text: comfyPrompt.positive,
        structured: [{
            type: 'shot',
            shotId: shot.id,
            prompt: comfyPrompt.positive,
            negative: comfyPrompt.negative,
        }],
        negativePrompt: comfyPrompt.negative,
    };
    return assertValidPayload(result, 'generateShotPayloads');
}

/**
 * Utility to extract assembled prompt from existing payloads.
 * Useful for debugging and logging.
 */
export function getAssembledPromptFromPayloads(
    payloads: ComfyUIPayloads
): AssembledPrompt {
    return assemblePromptForProvider(payloads.text, [], { provider: 'comfyui' });
}
