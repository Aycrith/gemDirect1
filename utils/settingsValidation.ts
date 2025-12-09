/**
 * Settings validation utilities for Local Generation Settings
 * Provides comprehensive validation checks and troubleshooting guidance
 */

import { LocalGenerationSettings, WorkflowProfile } from '../types';

export interface ValidationResult {
    valid: boolean;
    message: string;
    issues?: string[];
    warnings?: string[];
    fixes?: string[];
    helpUrl?: string;
}

export interface SystemValidation {
    llm: ValidationResult;
    comfyui: ValidationResult;
    workflows: ValidationResult;
    overall: ValidationResult;
}

/**
 * Documentation and troubleshooting links
 */
export const HELP_DOCS = {
    LLM_NO_MODELS: 'https://github.com/lmstudio-ai/lmstudio.js/wiki/Loading-Models',
    LLM_CONNECTION_FAILED: 'https://lmstudio.ai/docs/basics/server',
    COMFYUI_CONNECTION_FAILED: 'https://github.com/comfyanonymous/ComfyUI#troubleshooting',
    COMFYUI_NO_GPU: 'https://github.com/comfyanonymous/ComfyUI#manual-install-windows-linux',
    WORKFLOW_SETUP: './Documentation/Guides/COMFYUI_WORKFLOW_SETUP.md',
    GENERAL_SETUP: './Documentation/Guides/LOCAL_GENERATION_SETTINGS_VALIDATION.md',
};

/**
 * Common error messages and their user-friendly explanations
 */
export const ERROR_MESSAGES = {
    NETWORK_TIMEOUT: {
        title: 'Connection Timeout',
        description: 'The server did not respond within 5 seconds.',
        fixes: [
            'Verify the server is running',
            'Check the URL is correct',
            'Ensure no firewall is blocking the connection',
        ],
    },
    FETCH_FAILED: {
        title: 'Network Request Failed',
        description: 'Unable to reach the server.',
        fixes: [
            'Check if the server is running',
            'Verify the URL starts with http:// or https://',
            'Try accessing the URL directly in your browser',
        ],
    },
    HTTP_404: {
        title: 'Endpoint Not Found',
        description: 'The server responded but the endpoint does not exist.',
        fixes: [
            'Verify the server URL is correct',
            'Check if the server supports the OpenAI API format',
            'Try accessing /v1/models endpoint manually',
        ],
    },
    HTTP_401: {
        title: 'Authentication Failed',
        description: 'The server requires valid credentials.',
        fixes: [
            'Check if an API key is required',
            'Verify the API key is correct and active',
            'Review server authentication settings',
        ],
    },
    HTTP_500: {
        title: 'Server Error',
        description: 'The server encountered an internal error.',
        fixes: [
            'Check server logs for details',
            'Restart the server',
            'Verify the server configuration',
        ],
    },
    NO_MODELS: {
        title: 'No Models Available',
        description: 'Connection successful but no models are loaded.',
        fixes: [
            'Load a model in LM Studio (File → Load Model)',
            'Verify model download completed successfully',
            'Check model compatibility with your system',
        ],
    },
    INVALID_RESPONSE: {
        title: 'Invalid Response Format',
        description: 'Server response does not match expected format.',
        fixes: [
            'Verify the server is OpenAI-compatible',
            'Check server version compatibility',
            'Try a different request format in settings',
        ],
    },
    COMFYUI_NO_GPU: {
        title: 'No GPU Detected',
        description: 'ComfyUI is running but no GPU was found.',
        fixes: [
            'Ensure NVIDIA GPU drivers are installed',
            'Check CUDA installation',
            'Verify ComfyUI detected your GPU on startup',
        ],
    },
};

/**
 * Parse error into user-friendly message with fixes
 */
export function parseError(error: unknown): { title: string; description: string; fixes: string[]; helpUrl?: string } {
    const errorStr = error instanceof Error ? error.message : String(error);
    
    // Network timeout
    if (errorStr.includes('timeout') || errorStr.includes('aborted')) {
        return { ...ERROR_MESSAGES.NETWORK_TIMEOUT, helpUrl: HELP_DOCS.LLM_CONNECTION_FAILED };
    }
    
    // Fetch failed (network error)
    if (errorStr.includes('fetch') || errorStr.includes('NetworkError')) {
        return { ...ERROR_MESSAGES.FETCH_FAILED, helpUrl: HELP_DOCS.LLM_CONNECTION_FAILED };
    }
    
    // HTTP status codes
    if (errorStr.includes('404')) {
        return { ...ERROR_MESSAGES.HTTP_404 };
    }
    if (errorStr.includes('401') || errorStr.includes('403')) {
        return { ...ERROR_MESSAGES.HTTP_401 };
    }
    if (errorStr.includes('500') || errorStr.includes('502') || errorStr.includes('503')) {
        return { ...ERROR_MESSAGES.HTTP_500 };
    }
    
    // Generic error
    return {
        title: 'Connection Failed',
        description: errorStr,
        fixes: [
            'Check the server is running and accessible',
            'Verify your network connection',
            'Review server logs for more details',
        ],
    };
}

/**
 * Validate workflow profile readiness
 */
export function validateWorkflowProfile(
    profileId: string,
    profile: Partial<WorkflowProfile> | null | undefined
): ValidationResult {
    const issues: string[] = [];
    const fixes: string[] = [];

    if (!profile || !profile.workflowJson) {
        issues.push(`Profile "${profileId}" has no workflow JSON configured`);
        fixes.push('Import workflow JSON from localGenSettings.json or ComfyUI');
        return {
            valid: false,
            message: 'Workflow not configured',
            issues,
            fixes,
            helpUrl: HELP_DOCS.WORKFLOW_SETUP,
        };
    }

    const mapping = profile.mapping || {};
    const mappedTypes = new Set(Object.values(mapping));
    const hasText = mappedTypes.has('human_readable_prompt') || mappedTypes.has('full_timeline_json');
    const hasKeyframe = mappedTypes.has('keyframe_image');

    if (!hasText) {
        issues.push('No CLIP text node mapped (required for prompt injection)');
        fixes.push('Map a CLIPTextEncode node to "human_readable_prompt" or "full_timeline_json"');
    }

    if (profileId === 'wan-i2v' && !hasKeyframe) {
        issues.push('No keyframe image node mapped (required for image-to-video)');
        fixes.push('Map a LoadImage node to "keyframe_image"');
    }

    // Text-to-image profiles (wan-t2i, flux-t2i) only need text mapping
    // Image-to-video profiles (wan-i2v) need both text and keyframe
    const isTextToImageProfile = profileId === 'wan-t2i' || profileId === 'flux-t2i' || profileId.includes('-t2i');
    const isReady = isTextToImageProfile ? hasText : (hasText && hasKeyframe);

    if (!isReady) {
        return {
            valid: false,
            message: 'Incomplete mappings',
            issues,
            fixes,
            helpUrl: HELP_DOCS.WORKFLOW_SETUP,
        };
    }

    return {
        valid: true,
        message: 'Ready',
    };
}

/**
 * Validate all workflows
 */
export function validateWorkflows(settings: LocalGenerationSettings): ValidationResult {
    const profiles = settings.workflowProfiles || {};
    const issues: string[] = [];
    const fixes: string[] = [];

    if (Object.keys(profiles).length === 0) {
        return {
            valid: false,
            message: 'No workflow profiles configured',
            issues: ['No workflow profiles found'],
            fixes: [
                'Import workflow profiles from localGenSettings.json',
                'Configure at least "wan-t2i" profile for keyframe generation',
            ],
            helpUrl: HELP_DOCS.WORKFLOW_SETUP,
        };
    }

    // Check critical profiles
    const criticalProfiles = ['wan-t2i', 'wan-i2v'];
    const missingProfiles = criticalProfiles.filter(id => !profiles[id]);

    if (missingProfiles.length > 0) {
        issues.push(`Missing critical profiles: ${missingProfiles.join(', ')}`);
        fixes.push('Import complete workflow profiles from localGenSettings.json');
    }

    // Validate each profile
    let allValid = true;
    for (const [id, profile] of Object.entries(profiles)) {
        const result = validateWorkflowProfile(id, profile);
        if (!result.valid) {
            allValid = false;
            issues.push(`${id}: ${result.message}`);
            if (result.fixes) {
                fixes.push(...result.fixes);
            }
        }
    }

    if (!allValid || missingProfiles.length > 0) {
        return {
            valid: false,
            message: 'Workflow validation failed',
            issues,
            fixes,
            helpUrl: HELP_DOCS.WORKFLOW_SETUP,
        };
    }

    return {
        valid: true,
        message: `${Object.keys(profiles).length} workflows ready`,
    };
}

/**
 * LLM model info from connection test
 */
export interface LLMModelInfo {
    id: string;
    [key: string]: unknown;
}

/**
 * Result from LLM connection test
 */
export interface LLMConnectionTestResult {
    success: boolean;
    models?: LLMModelInfo[];
    error?: unknown;
}

/**
 * Result from ComfyUI connection test
 */
export interface ComfyUIConnectionTestResult {
    success: boolean;
    gpu?: string;
    error?: unknown;
}

/**
 * Comprehensive system validation
 */
export async function validateSystem(
    settings: LocalGenerationSettings,
    llmConnectionTest: () => Promise<LLMConnectionTestResult>,
    comfyuiConnectionTest: () => Promise<ComfyUIConnectionTestResult>
): Promise<SystemValidation> {
    const results: SystemValidation = {
        llm: { valid: false, message: 'Not tested' },
        comfyui: { valid: false, message: 'Not tested' },
        workflows: { valid: false, message: 'Not tested' },
        overall: { valid: false, message: 'Validation incomplete' },
    };

    // Validate LLM
    const llmTest = await llmConnectionTest();
    if (!llmTest.success) {
        const errorInfo = parseError(llmTest.error);
        results.llm = {
            valid: false,
            message: errorInfo.title,
            issues: [errorInfo.description],
            fixes: errorInfo.fixes,
            helpUrl: errorInfo.helpUrl,
        };
    } else if (!llmTest.models || llmTest.models.length === 0) {
        results.llm = {
            valid: false,
            message: 'No models available',
            issues: ['Connection successful but no models are loaded'],
            fixes: ERROR_MESSAGES.NO_MODELS.fixes,
            helpUrl: HELP_DOCS.LLM_NO_MODELS,
        };
    } else {
        results.llm = {
            valid: true,
            message: `${llmTest.models.length} model(s) available`,
        };
    }

    // Validate ComfyUI (only if using ComfyUI as video provider)
    if (settings.videoProvider === 'comfyui-local') {
        const comfyTest = await comfyuiConnectionTest();
        if (!comfyTest.success) {
            const errorInfo = parseError(comfyTest.error);
            results.comfyui = {
                valid: false,
                message: errorInfo.title,
                issues: [errorInfo.description],
                fixes: errorInfo.fixes,
                helpUrl: HELP_DOCS.COMFYUI_CONNECTION_FAILED,
            };
        } else {
            results.comfyui = {
                valid: true,
                message: `Connected (GPU: ${comfyTest.gpu || 'Unknown'})`,
            };
        }

        // Validate workflows
        results.workflows = validateWorkflows(settings);
    } else {
        // FastVideo or other provider - skip ComfyUI validation
        results.comfyui = { valid: true, message: 'Not required (using alternate provider)' };
        results.workflows = { valid: true, message: 'Not required for current provider' };
    }

    // Overall validation
    const allValid = results.llm.valid && results.comfyui.valid && results.workflows.valid;
    const issues: string[] = [];
    const fixes: string[] = [];

    if (!results.llm.valid) {
        issues.push('LLM: ' + results.llm.message);
        if (results.llm.fixes) fixes.push(...results.llm.fixes);
    }
    if (!results.comfyui.valid && settings.videoProvider === 'comfyui-local') {
        issues.push('ComfyUI: ' + results.comfyui.message);
        if (results.comfyui.fixes) fixes.push(...results.comfyui.fixes);
    }
    if (!results.workflows.valid && settings.videoProvider === 'comfyui-local') {
        issues.push('Workflows: ' + results.workflows.message);
        if (results.workflows.fixes) fixes.push(...results.workflows.fixes);
    }

    results.overall = allValid
        ? { valid: true, message: 'All systems validated and ready' }
        : {
            valid: false,
            message: 'Validation failed',
            issues,
            fixes,
            helpUrl: HELP_DOCS.GENERAL_SETUP,
        };

    return results;
}
