
import { TimelineData, Shot, CreativeEnhancers } from '../types';

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
): { json: string; text: string; structured: any[]; negativePrompt: string } => {

    const interleavedTimeline = timeline.shots.reduce((acc: any[], shot, index) => {
        const shotData = {
            type: 'shot',
            shot_number: index + 1,
            description: shot.description,
            enhancers: timeline.shotEnhancers[shot.id] || {}
        };
        acc.push(shotData);

        if (index < timeline.transitions.length) {
            const transitionData = {
                type: 'transition',
                transition_type: timeline.transitions[index]
            };
            acc.push(transitionData);
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
    const structuredPayload = timeline.shots.map((shot, index) => {
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
            transition,
        };
    });
    
     if (timeline.negativePrompt) {
        fullTextPrompt += `\n\nGlobal Style & Negative Prompt: ${timeline.negativePrompt}`;
    }

    return { json, text: fullTextPrompt.trim(), structured: structuredPayload, negativePrompt: timeline.negativePrompt || '' };
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

export interface BookendPayloads {
  start: {
    json: string;
    text: string;
    structured: Record<string, any>;
    negativePrompt: string;
  };
  end: {
    json: string;
    text: string;
    structured: Record<string, any>;
    negativePrompt: string;
  };
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
      structured: { 
        prompt: startPrompt,
        type: 'bookend_start',
        moment: temporalContext.startMoment
      },
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
      structured: { 
        prompt: endPrompt,
        type: 'bookend_end',
        moment: temporalContext.endMoment
      },
      negativePrompt
    }
  };
}
