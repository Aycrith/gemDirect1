/**
 * Model Sanity Check Utility
 * 
 * Validates that the correct models and profiles are configured for video generation.
 * This utility helps catch configuration issues before running expensive pipelines.
 * 
 * @module utils/modelSanityCheck
 */

import type { LocalGenerationSettings, WorkflowProfile } from '../types';

// ============================================================================
// Expected Defaults and Constants
// ============================================================================

/**
 * Expected WAN 2.2 5B video model profiles
 */
export const EXPECTED_VIDEO_PROFILES = {
    'wan-flf2v': {
        label: 'WAN 2.2 First-Last-Frame',
        description: 'Designed for bookend video generation with start/end keyframes',
        expectedNodeTypes: ['WanFunInpaintToVideo', 'LoadImage'],
    },
    'wan-fun-inpaint': {
        label: 'WAN 2.2 Fun Inpaint',
        description: 'Smooth interpolation between keyframes',
        expectedNodeTypes: ['WanFunInpaintToVideo', 'LoadImage'],
    },
    'wan-i2v': {
        label: 'WAN 2.2 Image-to-Video',
        description: 'Standard single-keyframe video generation',
        expectedNodeTypes: ['WAN12_I2VModelLoader', 'LoadImage'],
    },
} as const;

/**
 * Expected LLM model patterns
 */
export const EXPECTED_LLM_DEFAULTS = {
    text: {
        modelPattern: /qwen.*3.*14b|qwen3-14b|mistral.*7b|mistral-7b/i,
        recommendedModel: 'qwen/qwen3-14b',
        description: 'Recommended: Qwen3-14B for story generation',
    },
    vision: {
        modelPattern: /qwen.*vl|qwen3-vl|llava|cogvlm/i,
        recommendedModel: 'qwen/qwen3-vl-8b',
        description: 'Recommended: Qwen3-VL-8B for image analysis',
    },
} as const;

// ============================================================================
// Types
// ============================================================================

export interface ModelValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
}

export interface ProfileValidationResult {
    profileId: string;
    valid: boolean;
    hasWorkflow: boolean;
    hasMappings: boolean;
    errors: string[];
    warnings: string[];
}

export interface SanityCheckResult {
    overall: {
        valid: boolean;
        score: number; // 0-100
    };
    llm: {
        textModel: ModelValidationResult;
        visionModel: ModelValidationResult;
    };
    profiles: {
        bookendProfile: ProfileValidationResult;
        videoProfile: ProfileValidationResult;
        imageProfile: ProfileValidationResult;
    };
    summary: string[];
}

/**
 * Options for model validation with enforcement
 */
export interface ModelValidationOptions {
    /** If true, strictly enforces required models and blocks generation if not met */
    enforce?: boolean;
    /** Require specific text LLM model pattern (default: qwen3-14b) */
    requiredTextModel?: RegExp;
    /** Require specific vision LLM model pattern (default: qwen3-vl-8b) */
    requiredVisionModel?: RegExp;
    /** Require specific bookend workflow profile (default: wan-flf2v) */
    requiredBookendProfile?: string;
}

/**
 * Enforcement result when validation fails with enforce:true
 */
export interface EnforcementResult {
    /** Whether generation is blocked */
    blocked: boolean;
    /** Human-readable reason for blocking */
    reason: string;
    /** Detailed list of violations */
    violations: string[];
    /** The full sanity check result */
    sanityCheck: SanityCheckResult;
}

/**
 * Default enforcement requirements for bookend video generation
 */
export const DEFAULT_ENFORCEMENT_REQUIREMENTS = {
    textModel: /qwen.*3.*14b|qwen3-14b/i,
    visionModel: /qwen.*3.*vl.*8b|qwen3-vl-8b/i,
    bookendProfile: 'wan-flf2v',
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate an LLM model configuration
 */
function validateLLMModel(
    modelName: string | undefined,
    providerUrl: string | undefined,
    type: 'text' | 'vision'
): ModelValidationResult {
    const result: ModelValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        recommendations: [],
    };

    const expected = EXPECTED_LLM_DEFAULTS[type];

    // Check if model is configured
    if (!modelName || modelName.trim() === '') {
        result.errors.push(`No ${type} LLM model configured`);
        result.valid = false;
        result.recommendations.push(`Set ${type} model to ${expected.recommendedModel}`);
        return result;
    }

    // Check if provider URL is configured
    if (!providerUrl || providerUrl.trim() === '') {
        result.errors.push(`No ${type} LLM provider URL configured`);
        result.valid = false;
        return result;
    }

    // Check if model matches expected pattern
    if (!expected.modelPattern.test(modelName)) {
        result.warnings.push(
            `${type} model "${modelName}" may not be optimal. ${expected.description}`
        );
        result.recommendations.push(`Consider using ${expected.recommendedModel}`);
    }

    return result;
}

/**
 * Validate a workflow profile
 */
function validateWorkflowProfile(
    profileId: string | undefined,
    profiles: Record<string, WorkflowProfile> | undefined,
    purpose: string
): ProfileValidationResult {
    const result: ProfileValidationResult = {
        profileId: profileId || '',
        valid: false,
        hasWorkflow: false,
        hasMappings: false,
        errors: [],
        warnings: [],
    };

    // Check if profile ID is configured
    if (!profileId) {
        result.errors.push(`No ${purpose} workflow profile configured`);
        return result;
    }

    // Check if profiles exist
    if (!profiles || Object.keys(profiles).length === 0) {
        result.errors.push('No workflow profiles loaded. Import localGenSettings.json first.');
        return result;
    }

    // Get the profile
    const profile = profiles[profileId];
    if (!profile) {
        result.errors.push(
            `Profile "${profileId}" not found. Available: ${Object.keys(profiles).join(', ')}`
        );
        return result;
    }

    // Check workflow JSON
    if (profile.workflowJson && profile.workflowJson.length > 100) {
        result.hasWorkflow = true;
    } else {
        result.errors.push(`Profile "${profileId}" has no workflow JSON loaded`);
    }

    // Check mappings
    if (profile.mapping && Object.keys(profile.mapping).length > 0) {
        result.hasMappings = true;
    } else {
        result.warnings.push(`Profile "${profileId}" has no node mappings configured`);
    }

    // Valid if has workflow (mappings are optional warning)
    result.valid = result.hasWorkflow;

    return result;
}

/**
 * Validate all active models and profiles
 * 
 * @param settings - The current LocalGenerationSettings
 * @returns SanityCheckResult with validation details
 */
export function validateActiveModels(settings: LocalGenerationSettings): SanityCheckResult {
    const result: SanityCheckResult = {
        overall: {
            valid: true,
            score: 100,
        },
        llm: {
            textModel: validateLLMModel(
                settings.llmModel,
                settings.llmProviderUrl,
                'text'
            ),
            visionModel: validateLLMModel(
                settings.visionLLMModel || settings.llmModel,
                settings.visionLLMProviderUrl || settings.llmProviderUrl,
                'vision'
            ),
        },
        profiles: {
            bookendProfile: validateWorkflowProfile(
                settings.sceneBookendWorkflowProfile || 'wan-flf2v',
                settings.workflowProfiles,
                'bookend video'
            ),
            videoProfile: validateWorkflowProfile(
                settings.videoWorkflowProfile,
                settings.workflowProfiles,
                'standard video'
            ),
            imageProfile: validateWorkflowProfile(
                settings.imageWorkflowProfile,
                settings.workflowProfiles,
                'keyframe image'
            ),
        },
        summary: [],
    };

    // Calculate score and collect summary
    let deductions = 0;

    // LLM validation
    if (!result.llm.textModel.valid) {
        result.overall.valid = false;
        deductions += 20;
        result.summary.push('❌ Text LLM not configured');
    } else if (result.llm.textModel.warnings.length > 0) {
        deductions += 5;
        result.summary.push('⚠️ Text LLM may not be optimal');
    } else {
        result.summary.push('✅ Text LLM configured');
    }

    if (!result.llm.visionModel.valid) {
        result.overall.valid = false;
        deductions += 20;
        result.summary.push('❌ Vision LLM not configured');
    } else if (result.llm.visionModel.warnings.length > 0) {
        deductions += 5;
        result.summary.push('⚠️ Vision LLM may not be optimal');
    } else {
        result.summary.push('✅ Vision LLM configured');
    }

    // Profile validation
    if (!result.profiles.bookendProfile.valid) {
        // Bookend profile is optional but important for bookend mode
        deductions += 15;
        result.summary.push('⚠️ Bookend workflow profile not ready');
    } else {
        result.summary.push('✅ Bookend workflow profile ready');
    }

    if (!result.profiles.videoProfile.valid) {
        deductions += 15;
        result.summary.push('⚠️ Video workflow profile not ready');
    } else {
        result.summary.push('✅ Video workflow profile ready');
    }

    if (!result.profiles.imageProfile.valid) {
        deductions += 15;
        result.summary.push('⚠️ Image workflow profile not ready');
    } else {
        result.summary.push('✅ Image workflow profile ready');
    }

    result.overall.score = Math.max(0, 100 - deductions);
    result.overall.valid = deductions < 40; // Allow up to 40 points of deductions

    return result;
}

/**
 * Quick check if bookend video generation is ready
 * 
 * @param settings - The current LocalGenerationSettings
 * @returns Object with ready status and reason if not ready
 */
export function isBookendGenerationReady(settings: LocalGenerationSettings): {
    ready: boolean;
    reason?: string;
} {
    const profileId = settings.sceneBookendWorkflowProfile || 'wan-flf2v';
    const profile = settings.workflowProfiles?.[profileId];

    if (!profile) {
        return {
            ready: false,
            reason: `Bookend profile "${profileId}" not found. Import localGenSettings.json first.`,
        };
    }

    if (!profile.workflowJson || profile.workflowJson.length < 100) {
        return {
            ready: false,
            reason: `Bookend profile "${profileId}" has no workflow loaded.`,
        };
    }

    return { ready: true };
}

/**
 * Get configuration recommendations based on current settings
 * 
 * @param settings - The current LocalGenerationSettings
 * @returns Array of recommendation strings
 */
export function getConfigurationRecommendations(settings: LocalGenerationSettings): string[] {
    const recommendations: string[] = [];
    const validation = validateActiveModels(settings);

    // Collect all recommendations
    recommendations.push(...validation.llm.textModel.recommendations);
    recommendations.push(...validation.llm.visionModel.recommendations);

    // Add profile-specific recommendations
    if (!validation.profiles.bookendProfile.valid) {
        recommendations.push(
            'Load bookend workflow profile (wan-flf2v) for bookend video generation'
        );
    }

    if (!validation.profiles.videoProfile.valid) {
        recommendations.push('Configure video workflow profile (wan-i2v) in settings');
    }

    if (!validation.profiles.imageProfile.valid) {
        recommendations.push('Configure image workflow profile (wan-t2i) in settings');
    }

    // Add quality recommendations
    if (settings.keyframeMode === 'bookend') {
        if (settings.sceneBookendWorkflowProfile === 'wan-fun-inpaint') {
            recommendations.push(
                'Consider using wan-flf2v instead of wan-fun-inpaint for better bookend results'
            );
        }
    }

    return recommendations;
}

/**
 * Validate models with enforcement mode
 * 
 * When enforce:true, this function strictly validates that the required models
 * are configured and returns a blocked status if not. Use this before video
 * generation to ensure quality standards are met.
 * 
 * @param settings - The current LocalGenerationSettings
 * @param options - Validation options including enforcement flag
 * @returns EnforcementResult with blocked status and violations
 */
export function validateActiveModelsWithEnforcement(
    settings: LocalGenerationSettings,
    options: ModelValidationOptions = {}
): EnforcementResult {
    const {
        enforce = false,
        requiredTextModel = DEFAULT_ENFORCEMENT_REQUIREMENTS.textModel,
        requiredVisionModel = DEFAULT_ENFORCEMENT_REQUIREMENTS.visionModel,
        requiredBookendProfile = DEFAULT_ENFORCEMENT_REQUIREMENTS.bookendProfile,
    } = options;

    const sanityCheck = validateActiveModels(settings);
    const violations: string[] = [];

    // Check text LLM model
    const textModel = settings.llmModel || '';
    if (!requiredTextModel.test(textModel)) {
        violations.push(
            `Text LLM: Expected model matching ${requiredTextModel.source}, got "${textModel || 'none'}". ` +
            `Recommended: ${EXPECTED_LLM_DEFAULTS.text.recommendedModel}`
        );
    }

    // Check vision LLM model
    const visionModel = settings.visionLLMModel || settings.llmModel || '';
    if (!requiredVisionModel.test(visionModel)) {
        violations.push(
            `Vision LLM: Expected model matching ${requiredVisionModel.source}, got "${visionModel || 'none'}". ` +
            `Recommended: ${EXPECTED_LLM_DEFAULTS.vision.recommendedModel}`
        );
    }

    // Check bookend workflow profile
    const profileId = settings.sceneBookendWorkflowProfile || 'wan-flf2v';
    if (profileId !== requiredBookendProfile) {
        violations.push(
            `Bookend profile: Expected "${requiredBookendProfile}", got "${profileId}"`
        );
    }

    // Check if profile is loaded
    const profile = settings.workflowProfiles?.[profileId];
    if (!profile || !profile.workflowJson || profile.workflowJson.length < 100) {
        violations.push(
            `Bookend workflow "${profileId}" is not loaded. Import localGenSettings.json first.`
        );
    }

    // Check VAE configuration in workflow (if available)
    if (profile?.workflowJson) {
        try {
            const workflow = JSON.parse(profile.workflowJson);
            const vaeNode = Object.values(workflow).find(
                (node: unknown) => 
                    node && typeof node === 'object' && 
                    'class_type' in node && 
                    (node as { class_type: string }).class_type === 'VAELoader'
            ) as { inputs?: { vae_name?: string } } | undefined;
            
            if (vaeNode?.inputs?.vae_name) {
                if (!vaeNode.inputs.vae_name.includes('wan2.2_vae')) {
                    violations.push(
                        `VAE mismatch: Expected "wan2.2_vae.safetensors" for WAN 2.2 5B, ` +
                        `got "${vaeNode.inputs.vae_name}". This may cause tensor dimension errors.`
                    );
                }
            }
        } catch {
            // Unable to parse workflow - not a blocking issue for now
        }
    }

    const blocked = enforce && violations.length > 0;
    const reason = blocked
        ? `Model sanity check failed with ${violations.length} violation(s): ${violations[0]}`
        : violations.length > 0
            ? `Model check passed with ${violations.length} warning(s)`
            : 'All models verified ✓';

    return {
        blocked,
        reason,
        violations,
        sanityCheck,
    };
}

/**
 * Format enforcement result for display in UI
 */
export function formatEnforcementResult(result: EnforcementResult): {
    status: 'success' | 'warning' | 'error';
    title: string;
    details: string[];
} {
    if (result.blocked) {
        return {
            status: 'error',
            title: '❌ Model Sanity Check FAILED',
            details: result.violations,
        };
    }
    
    if (result.violations.length > 0) {
        return {
            status: 'warning',
            title: '⚠️ Model Sanity Check: Warnings',
            details: result.violations,
        };
    }
    
    return {
        status: 'success',
        title: '✅ Model Sanity Check PASSED',
        details: result.sanityCheck.summary,
    };
}
