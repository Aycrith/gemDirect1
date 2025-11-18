/**
 * Prompt Template Configuration & Guardrails
 *
 * Provides model-aware prompt templates with length caps and Visual Bible integration limits.
 * Ensures prompts remain structured and stable regardless of VB additions.
 */

export type PromptTarget = 'sceneKeyframe' | 'shotImage' | 'shotVideo';

export interface PromptTemplateConfig {
  maxPromptLength: number;         // hard cap on total prompt chars
  maxVisualTags: number;           // cap on VB tags
  prepend?: string;                // static intro text
  append?: string;                 // static suffix
  defaultNegativePrompt?: string;  // model-specific negative prompt override
}

export interface ModelPromptConfig {
  modelId: string;                 // e.g. 'comfy-svd-local', 'wan-video'
  targets: Record<PromptTarget, PromptTemplateConfig>;
}

// Default configuration for unknown models
const DEFAULT_CONFIG: PromptTemplateConfig = {
  maxPromptLength: 1000,
  maxVisualTags: 5,
  prepend: '',
  append: '',
};

// Model-specific configurations
const MODEL_CONFIGS: Record<string, ModelPromptConfig> = {
  'comfy-local': {
    modelId: 'comfy-local',
    targets: {
      sceneKeyframe: {
        maxPromptLength: 800,
        maxVisualTags: 4,
        prepend: 'Scene keyframe: ',
        append: ' --ar 16:9 --q 2',
      },
      shotImage: {
        maxPromptLength: 600,
        maxVisualTags: 3,
        prepend: '',
        append: ' --ar 16:9 --q 2',
      },
      shotVideo: {
        maxPromptLength: 500,
        maxVisualTags: 2,
        prepend: 'Video generation: ',
        append: ' --ar 16:9 --q 2',
      },
    },
  },
  'comfy-svd': {
    modelId: 'comfy-svd',
    targets: {
      sceneKeyframe: {
        maxPromptLength: 700,
        maxVisualTags: 3,
        prepend: 'Keyframe: ',
        append: '',
      },
      shotImage: {
        maxPromptLength: 600,
        maxVisualTags: 3,
        prepend: '',
        append: '',
      },
      shotVideo: {
        maxPromptLength: 500,
        maxVisualTags: 2,
        prepend: 'Video: ',
        append: '',
      },
    },
  },
  'wan-video': {
    modelId: 'wan-video',
    targets: {
      sceneKeyframe: {
        maxPromptLength: 1000,
        maxVisualTags: 5,
        prepend: 'Cinematic WAN keyframe: ',
        append: '',
        defaultNegativePrompt: 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur, static, frozen',
      },
      shotImage: {
        maxPromptLength: 800,
        maxVisualTags: 4,
        prepend: '',
        append: '',
        defaultNegativePrompt: 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur, static, frozen',
      },
      shotVideo: {
        maxPromptLength: 600,
        maxVisualTags: 3,
        prepend: 'Cinematic WAN video: ',
        append: '',
        defaultNegativePrompt: 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur, static, frozen, jerky movement',
      },
    },
  },
  'comfy-svd-local': {
    modelId: 'comfy-svd-local',
    targets: {
      sceneKeyframe: {
        maxPromptLength: 700,
        maxVisualTags: 3,
        prepend: 'Keyframe: ',
        append: '',
      },
      shotImage: {
        maxPromptLength: 600,
        maxVisualTags: 3,
        prepend: '',
        append: '',
      },
      shotVideo: {
        maxPromptLength: 500,
        maxVisualTags: 2,
        prepend: 'Video: ',
        append: '',
      },
    },
  },
  // Add more models as needed
};

export function getPromptConfigForModel(
  modelId: string,
  target: PromptTarget
): PromptTemplateConfig {
  const modelConfig = MODEL_CONFIGS[modelId];
  if (modelConfig && modelConfig.targets[target]) {
    return modelConfig.targets[target];
  }
  return DEFAULT_CONFIG;
}

/**
 * Gets the default negative prompt for a model and target, falling back to global default.
 */
export function getDefaultNegativePromptForModel(
  modelId: string,
  target: PromptTarget
): string {
  const config = getPromptConfigForModel(modelId, target);
  return config.defaultNegativePrompt || 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, oversaturated, undersaturated, motion blur';
}

/**
 * Applies prompt template with guardrails
 *
 * @param basePrompt - Core prompt without VB context
 * @param visualBibleSegment - VB context string (may be truncated)
 * @param config - Template configuration
 * @returns Final prompt respecting all caps
 */
export function applyPromptTemplate(
  basePrompt: string,
  visualBibleSegment: string | null,
  config: PromptTemplateConfig
): string {
  let prompt = basePrompt;

  // Apply prepend
  if (config.prepend) {
    prompt = config.prepend + prompt;
  }

  // Add VB segment if provided
  if (visualBibleSegment && visualBibleSegment.trim()) {
    // Cap VB tags if needed (assume tags are comma-separated)
    let vbSegment = visualBibleSegment.trim();
    const tags = vbSegment.split(',').map(t => t.trim());
    if (tags.length > config.maxVisualTags) {
      vbSegment = tags.slice(0, config.maxVisualTags).join(', ');
    }

    prompt += ' ' + vbSegment;
  }

  // Apply append
  if (config.append) {
    prompt += ' ' + config.append;
  }

  // Hard cap length, preferring to keep base prompt intact
  if (prompt.length > config.maxPromptLength) {
    const baseWithPrepend = (config.prepend || '') + basePrompt;
    const appendPart = config.append || '';

    if (baseWithPrepend.length + appendPart.length + 3 <= config.maxPromptLength) {
      // Can fit base + append, truncate VB
      const remainingForVB = config.maxPromptLength - baseWithPrepend.length - appendPart.length - 3;
      if (visualBibleSegment && remainingForVB > 0) {
        const truncatedVB = visualBibleSegment.substring(0, remainingForVB);
        prompt = baseWithPrepend + ' ' + truncatedVB + ' ' + appendPart;
      } else {
        prompt = baseWithPrepend + ' ' + appendPart;
      }
    } else {
      // Can't fit everything, truncate from end
      prompt = prompt.substring(0, config.maxPromptLength - 3) + '...';
    }
  }

  // Clean up whitespace
  return prompt.trim().replace(/\s+/g, ' ').replace(/\n+/g, ' ');
}