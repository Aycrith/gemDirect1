/**
 * Prompt Template Service
 * 
 * Provides model-specific prompt templates and configuration for ComfyUI workflows.
 * Handles Visual Bible integration, negative prompt defaults, and template application.
 * 
 * @module services/promptTemplates
 */

import { DEFAULT_NEGATIVE_PROMPT } from './comfyUIService';

// Type for prompt targets (keyframe or video generation)
export type PromptTarget = 'shotImage' | 'sceneKeyframe' | 'sceneVideo';

/**
 * Configuration for a prompt template
 */
export interface PromptConfig {
    /** Template string with placeholders like {prompt}, {vb_segment}, {style} */
    template: string;
    /** Whether to include Visual Bible segment */
    includeVisualBible: boolean;
    /** Model-specific prompt prefix */
    prefix?: string;
    /** Model-specific prompt suffix */
    suffix?: string;
    /** Maximum token budget for this target */
    maxTokens?: number;
}

/**
 * Model-specific prompt configurations
 */
interface ModelPromptConfig {
    shotImage: PromptConfig;
    sceneKeyframe: PromptConfig;
    sceneVideo: PromptConfig;
    negativePrompt: string;
}

/**
 * Default prompt configuration for unknown models
 */
const DEFAULT_PROMPT_CONFIG: PromptConfig = {
    template: '{prompt}',
    includeVisualBible: true,
};

/**
 * Model-specific configurations for prompt generation
 * 
 * Key patterns:
 * - {prompt} - The main prompt content
 * - {vb_segment} - Visual Bible segment (style, character context)
 * - {style} - Director's vision/style guidance
 */
const MODEL_CONFIGS: Record<string, Partial<ModelPromptConfig>> = {
    // FLUX model configuration
    'flux': {
        shotImage: {
            template: '{prompt}',
            includeVisualBible: true,
            prefix: 'cinematic photograph, ',
            suffix: ', masterpiece, best quality, highly detailed',
            maxTokens: 500,
        },
        sceneKeyframe: {
            template: '{prompt}',
            includeVisualBible: true,
            prefix: 'cinematic wide shot, ',
            suffix: ', professional photography, 8k resolution',
            maxTokens: 500,
        },
        sceneVideo: {
            template: '{prompt}',
            includeVisualBible: true,
            maxTokens: 400,
        },
        negativePrompt: 'blurry, low quality, watermark, text, bad anatomy, distorted, split screen, multi-panel, grid layout, comic style',
    },
    
    // WAN2 model configuration
    'wan': {
        shotImage: {
            template: '{prompt}',
            includeVisualBible: true,
            maxTokens: 500,
        },
        sceneKeyframe: {
            template: '{prompt}',
            includeVisualBible: true,
            maxTokens: 500,
        },
        sceneVideo: {
            template: '{prompt}',
            includeVisualBible: false, // Video models often have shorter context
            maxTokens: 300,
        },
        negativePrompt: 'blurry, low-resolution, watermark, text, bad anatomy, distorted, unrealistic, split-screen, multi-panel',
    },
    
    // Lumina/NetaYume configuration (legacy, may produce comic-style)
    'lumina': {
        shotImage: {
            template: '{prompt}',
            includeVisualBible: true,
            suffix: ', single unified image, no panels, no borders',
            maxTokens: 500,
        },
        sceneKeyframe: {
            template: '{prompt}',
            includeVisualBible: true,
            suffix: ', single cohesive scene, cinematic composition',
            maxTokens: 500,
        },
        sceneVideo: {
            template: '{prompt}',
            includeVisualBible: true,
            maxTokens: 400,
        },
        negativePrompt: 'comic panels, manga style, storyboard, split-screen, multi-panel, grid layout, character sheet, multiple views',
    },

    // IP-Adapter enhanced configuration
    'ipadapter': {
        shotImage: {
            template: '{prompt}',
            includeVisualBible: true,
            prefix: 'consistent character appearance, ',
            maxTokens: 450,
        },
        sceneKeyframe: {
            template: '{prompt}',
            includeVisualBible: true,
            prefix: 'consistent character appearance, ',
            maxTokens: 450,
        },
        sceneVideo: {
            template: '{prompt}',
            includeVisualBible: true,
            maxTokens: 350,
        },
        negativePrompt: 'different person, different face, inconsistent appearance, blurry, distorted',
    },
};

/**
 * Get prompt configuration for a specific model and target
 * 
 * @param modelId - The model identifier (e.g., 'flux', 'wan', 'lumina')
 * @param target - The prompt target type
 * @returns The prompt configuration for the model/target combination
 */
export function getPromptConfigForModel(modelId: string, target: PromptTarget): PromptConfig {
    // Normalize model ID to lowercase for matching
    const normalizedId = modelId.toLowerCase();
    
    // Find matching model config by checking if the modelId contains any known model key
    let modelConfig: Partial<ModelPromptConfig> | undefined;
    
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
        if (normalizedId.includes(key)) {
            modelConfig = config;
            break;
        }
    }
    
    // Return target-specific config or default
    if (modelConfig && modelConfig[target]) {
        return modelConfig[target]!;
    }
    
    return DEFAULT_PROMPT_CONFIG;
}

/**
 * Apply a prompt template with Visual Bible segment
 * 
 * @param prompt - The base prompt content
 * @param vbSegment - Visual Bible segment to include (optional)
 * @param config - The prompt configuration
 * @returns The final formatted prompt
 */
export function applyPromptTemplate(
    prompt: string,
    vbSegment: string | undefined,
    config: PromptConfig
): string {
    let result = prompt;
    
    // Add prefix if specified
    if (config.prefix) {
        result = config.prefix + result;
    }
    
    // Add Visual Bible segment if enabled and provided
    if (config.includeVisualBible && vbSegment && vbSegment.trim().length > 0) {
        result = `${result} ${vbSegment}`;
    }
    
    // Add suffix if specified
    if (config.suffix) {
        result = result + config.suffix;
    }
    
    return result;
}

/**
 * Get the default negative prompt for a specific model
 * 
 * @param modelId - The model identifier
 * @param _target - The prompt target type (optional, for future per-target negatives)
 * @returns The default negative prompt for the model
 */
export function getDefaultNegativePromptForModel(modelId: string, _target?: string): string {
    const normalizedId = modelId.toLowerCase();
    
    // Find matching model config
    for (const [key, config] of Object.entries(MODEL_CONFIGS)) {
        if (normalizedId.includes(key) && config.negativePrompt) {
            return config.negativePrompt;
        }
    }
    
    // Return default negative prompt if no model-specific one found
    return DEFAULT_NEGATIVE_PROMPT;
}

/**
 * Get the maximum token budget for a model/target combination
 * 
 * @param modelId - The model identifier
 * @param target - The prompt target type
 * @returns The maximum tokens allowed, or undefined for default
 */
export function getMaxTokensForModel(modelId: string, target: PromptTarget): number | undefined {
    const config = getPromptConfigForModel(modelId, target);
    return config.maxTokens;
}

/**
 * Check if a model supports Visual Bible integration
 * 
 * @param modelId - The model identifier
 * @param target - The prompt target type
 * @returns Whether Visual Bible should be included
 */
export function supportsVisualBible(modelId: string, target: PromptTarget): boolean {
    const config = getPromptConfigForModel(modelId, target);
    return config.includeVisualBible;
}

/**
 * Format a Visual Bible segment for prompt injection
 * 
 * @param styleTags - Style board tags
 * @param characterTraits - Character visual traits
 * @param additionalContext - Any additional context
 * @returns Formatted Visual Bible segment
 */
export function formatVisualBibleSegment(
    styleTags?: string[],
    characterTraits?: string[],
    additionalContext?: string
): string {
    const parts: string[] = [];
    
    if (styleTags && styleTags.length > 0) {
        parts.push(`Style: ${styleTags.join(', ')}`);
    }
    
    if (characterTraits && characterTraits.length > 0) {
        parts.push(`Characters: ${characterTraits.join(', ')}`);
    }
    
    if (additionalContext && additionalContext.trim().length > 0) {
        parts.push(additionalContext.trim());
    }
    
    return parts.join('. ');
}

/**
 * Register a custom model configuration
 * 
 * @param modelKey - The model key to register
 * @param config - The model configuration
 */
export function registerModelConfig(modelKey: string, config: Partial<ModelPromptConfig>): void {
    MODEL_CONFIGS[modelKey.toLowerCase()] = config;
}

/**
 * Get all registered model keys
 * 
 * @returns Array of registered model keys
 */
export function getRegisteredModelKeys(): string[] {
    return Object.keys(MODEL_CONFIGS);
}
