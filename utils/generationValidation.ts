/**
 * Runtime validation utilities for story, image, and video generation
 * Ensures users meet all prerequisites before attempting generation operations
 */

import { LocalGenerationSettings } from '../types';

export interface GenerationCapabilities {
    canGenerateStory: boolean;
    canGenerateImages: boolean;
    canGenerateVideos: boolean;
    storyValidation: ValidationCheck;
    imageValidation: ValidationCheck;
    videoValidation: ValidationCheck;
}

export interface ValidationCheck {
    valid: boolean;
    reason?: string;
    blockers: string[];
    recommendations: string[];
}

/**
 * Get stored validation state from localStorage (with graceful fallback)
 */
function getStoredValidationState(): { llmValid: boolean; comfyUIValid: boolean; workflowsValid: boolean; llmHasModels: boolean } | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem('gemDirect_validationState');
        if (!stored) return null;
        return JSON.parse(stored);
    } catch {
        // localStorage access denied - return null to trigger manual validation
        return null;
    }
}

/**
 * Validates if story generation is possible with current configuration
 * Requires: Valid LLM connection with loaded models (or at least connection)
 */
export function validateStoryGenerationCapability(
    localGenSettings?: LocalGenerationSettings,
    llmConnectionValid?: boolean,
    hasModelsLoaded?: boolean
): ValidationCheck {
    const blockers: string[] = [];
    const recommendations: string[] = [];

    // Try to get validation state from storage if not explicitly provided
    const stored = getStoredValidationState();
    const effectiveLLMValid = llmConnectionValid ?? stored?.llmValid ?? false;
    const effectiveModelsLoaded = hasModelsLoaded ?? stored?.llmHasModels ?? false;

    // Check LLM configuration
    const effectiveLLMUrl = localGenSettings?.llmProviderUrl || 
                           (typeof window !== 'undefined' && (window as Window & { LOCAL_STORY_PROVIDER_URL?: string }).LOCAL_STORY_PROVIDER_URL);

    if (!effectiveLLMUrl) {
        blockers.push('LLM Provider URL not configured');
        recommendations.push('Open Settings → LLM Settings and configure your local LLM server URL');
    }

    if (!effectiveLLMValid) {
        blockers.push('LLM connection not validated');
        recommendations.push('Open Settings → LLM Settings and click "Test LLM Connection"');
        recommendations.push('Ensure your LLM server (e.g., LM Studio) is running');
    }

    if (effectiveLLMValid && !effectiveModelsLoaded) {
        // IMPORTANT: This is a WARNING, not a blocker
        // Connection is valid, user just needs to load models in their LLM server
        recommendations.push('⚠️ No models detected in LM Studio - load a model to enable generation');
        recommendations.push('Recommended models: mistralai/mistral-7b-instruct, mistral-nemo-instruct, or similar');
        recommendations.push('LM Studio: File → Load Model, then try generation again');
    }

    return {
        valid: blockers.length === 0,
        reason: blockers.length > 0 ? blockers[0] : undefined,
        blockers,
        recommendations
    };
}

/**
 * Validates if image generation (keyframes) is possible with current configuration
 * Requires: Valid LLM connection + Gemini API access
 */
export function validateImageGenerationCapability(
    localGenSettings?: LocalGenerationSettings,
    llmConnectionValid?: boolean,
    hasGeminiAccess?: boolean
): ValidationCheck {
    const blockers: string[] = [];
    const recommendations: string[] = [];

    // Image generation requires LLM for prompt enhancement
    const storyCheck = validateStoryGenerationCapability(localGenSettings, llmConnectionValid, true);
    if (!storyCheck.valid) {
        blockers.push('Story generation not configured (required for image prompts)');
        recommendations.push(...storyCheck.recommendations);
    }

    // Check Gemini API access for image generation
    if (!hasGeminiAccess) {
        blockers.push('Gemini API access not available');
        recommendations.push('Configure GEMINI_API_KEY in your environment');
        recommendations.push('Gemini is used for AI-powered image generation');
    }

    return {
        valid: blockers.length === 0,
        reason: blockers.length > 0 ? blockers[0] : undefined,
        blockers,
        recommendations
    };
}

/**
 * Validates if video generation is possible with current configuration
 * Requires: Valid LLM + ComfyUI connection + Workflow configuration + Image keyframes
 */
export function validateVideoGenerationCapability(
    localGenSettings?: LocalGenerationSettings,
    llmConnectionValid?: boolean,
    comfyUIConnectionValid?: boolean,
    hasWorkflowConfigured?: boolean,
    hasKeyframeImages?: boolean
): ValidationCheck {
    const blockers: string[] = [];
    const recommendations: string[] = [];

    // Try to get validation state from storage if not explicitly provided
    const stored = getStoredValidationState();
    const effectiveComfyUIValid = comfyUIConnectionValid ?? stored?.comfyUIValid ?? false;
    const effectiveWorkflowValid = hasWorkflowConfigured ?? stored?.workflowsValid ?? false;

    // Video generation requires story generation capability
    const storyCheck = validateStoryGenerationCapability(localGenSettings, llmConnectionValid, true);
    if (!storyCheck.valid) {
        blockers.push('Story generation not configured (required for video prompts)');
        recommendations.push(...storyCheck.recommendations);
    }

    // Check video provider configuration
    const videoProvider = localGenSettings?.videoProvider;
    if (!videoProvider) {
        blockers.push('Video provider not selected');
        recommendations.push('Open Settings → Video Provider and choose ComfyUI or FastVideo');
    }

    // Check ComfyUI-specific requirements
    if (videoProvider === 'comfyui-local') {
        if (!localGenSettings?.comfyUIUrl) {
            blockers.push('ComfyUI server URL not configured');
            recommendations.push('Open Settings → ComfyUI Settings and enter server URL');
        }

        if (!effectiveComfyUIValid) {
            blockers.push('ComfyUI connection not validated');
            recommendations.push('Open Settings → ComfyUI Settings and click "Test ComfyUI Connection"');
            recommendations.push('Ensure ComfyUI server is running on the configured port');
        }

        if (!effectiveWorkflowValid) {
            blockers.push('ComfyUI workflow not configured');
            recommendations.push('Open Settings → ComfyUI Settings and import workflow profiles');
            recommendations.push('Map required nodes (CLIP text, keyframe image) in workflow profiles');
        }

        if (!localGenSettings?.comfyUIClientId) {
            blockers.push('ComfyUI Client ID not generated');
            recommendations.push('Open Settings → ComfyUI Settings and generate a Client ID');
        }
    }

    // Check if keyframe images are available
    if (!hasKeyframeImages) {
        blockers.push('Scene keyframe images required for video generation');
        recommendations.push('Generate scene keyframes first before attempting video generation');
        recommendations.push('Each scene needs a keyframe image to serve as the base for video');
    }

    return {
        valid: blockers.length === 0,
        reason: blockers.length > 0 ? blockers[0] : undefined,
        blockers,
        recommendations
    };
}

/**
 * Comprehensive validation check for all generation capabilities
 */
export function validateAllGenerationCapabilities(
    localGenSettings?: LocalGenerationSettings,
    llmConnectionValid?: boolean,
    comfyUIConnectionValid?: boolean,
    hasWorkflowConfigured?: boolean,
    hasKeyframeImages?: boolean,
    hasModelsLoaded?: boolean,
    hasGeminiAccess?: boolean
): GenerationCapabilities {
    const storyValidation = validateStoryGenerationCapability(
        localGenSettings,
        llmConnectionValid,
        hasModelsLoaded
    );

    const imageValidation = validateImageGenerationCapability(
        localGenSettings,
        llmConnectionValid,
        hasGeminiAccess
    );

    const videoValidation = validateVideoGenerationCapability(
        localGenSettings,
        llmConnectionValid,
        comfyUIConnectionValid,
        hasWorkflowConfigured,
        hasKeyframeImages
    );

    return {
        canGenerateStory: storyValidation.valid,
        canGenerateImages: imageValidation.valid,
        canGenerateVideos: videoValidation.valid,
        storyValidation,
        imageValidation,
        videoValidation
    };
}

/**
 * Format validation error message for user display
 */
export function formatValidationError(check: ValidationCheck, operationType: 'story' | 'image' | 'video'): string {
    if (check.valid) return '';

    const operation = {
        story: 'Story Generation',
        image: 'Image Generation',
        video: 'Video Generation'
    }[operationType];

    let message = `${operation} Blocked: ${check.reason}\n\n`;
    
    if (check.blockers.length > 0) {
        message += 'Issues:\n';
        check.blockers.forEach(blocker => {
            message += `• ${blocker}\n`;
        });
    }

    if (check.recommendations.length > 0) {
        message += '\nHow to fix:\n';
        check.recommendations.forEach(rec => {
            message += `• ${rec}\n`;
        });
    }

    return message.trim();
}

/**
 * Check if user has completed minimum setup for local generation
 */
export function hasMinimumLocalSetup(localGenSettings?: LocalGenerationSettings): boolean {
    const effectiveLLMUrl = localGenSettings?.llmProviderUrl || 
                           (typeof window !== 'undefined' && (window as Window & { LOCAL_STORY_PROVIDER_URL?: string }).LOCAL_STORY_PROVIDER_URL);
    
    return !!effectiveLLMUrl;
}
