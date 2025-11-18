/**
 * Input Validator Service
 * 
 * Validates and sanitizes user input to prevent injection attacks,
 * enforce constraints, and ensure data quality.
 */

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    sanitized?: string;
}

export interface PromptConstraints {
    minLength?: number;
    maxLength?: number;
    allowHtml?: boolean;
    allowSpecialChars?: boolean;
}

const DEFAULT_CONSTRAINTS: PromptConstraints = {
    minLength: 10,
    maxLength: 2000,
    allowHtml: false,
    allowSpecialChars: false
};

/**
 * Dangerous patterns that might indicate injection attempts
 */
const INJECTION_PATTERNS = [
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers (onclick, onload, etc.)
    /<script/gi,
    /<iframe/gi,
    /<object/gi,
    /eval\s*\(/gi,
    /exec\s*\(/gi,
    /prompt\s*\(/gi,
    /alert\s*\(/gi,
    /cmd\s*\/c/gi, // Windows command injection
    /bash\s*-c/gi, // Linux command injection
    /\$\(/gi, // Command substitution
    /`/g, // Backticks for command execution
    /;\s*rm\s+/gi, // Destructive commands
    /drop\s+table/gi, // SQL injection
    /union\s+select/gi, // SQL injection
];

/**
 * Validate prompt text
 */
export const validatePrompt = (
    prompt: string,
    constraints: Partial<PromptConstraints> = {}
): ValidationResult => {
    const finalConstraints = { ...DEFAULT_CONSTRAINTS, ...constraints };
    const errors: string[] = [];

    // Check required
    if (!prompt || prompt.trim().length === 0) {
        errors.push('Prompt is required');
        return { valid: false, errors };
    }

    // Check length
    if (finalConstraints.minLength && prompt.length < finalConstraints.minLength) {
        errors.push(`Prompt must be at least ${finalConstraints.minLength} characters`);
    }
    if (finalConstraints.maxLength && prompt.length > finalConstraints.maxLength) {
        errors.push(`Prompt must not exceed ${finalConstraints.maxLength} characters`);
    }

    // Check for injection patterns
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(prompt)) {
            errors.push(`Prompt contains potentially dangerous pattern: ${pattern.source}`);
        }
    }

    // Check for HTML if not allowed
    if (!finalConstraints.allowHtml && /<[^>]+>/g.test(prompt)) {
        errors.push('HTML tags are not allowed in prompts');
    }

    // Check for excessive special characters
    if (!finalConstraints.allowSpecialChars) {
        const specialCharCount = (prompt.match(/[^a-zA-Z0-9\s.,!?'":-]/g) || []).length;
        const specialCharPercentage = (specialCharCount / prompt.length) * 100;
        
        if (specialCharPercentage > 20) {
            errors.push(`Prompt contains too many special characters (${specialCharPercentage.toFixed(1)}%)`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized: errors.length === 0 ? sanitizePrompt(prompt) : undefined
    };
};

/**
 * Sanitize prompt by removing/escaping potentially dangerous content
 */
export const sanitizePrompt = (prompt: string): string => {
    let sanitized = prompt;

    // Remove script tags and content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Escape backticks
    sanitized = sanitized.replace(/`/g, "'");

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
};

/**
 * Validate story parameters
 */
export const validateStoryParams = (params: unknown): ValidationResult => {
    const errors: string[] = [];

    if (typeof params !== 'object' || params === null) {
        errors.push('Story parameters must be an object');
        return { valid: false, errors };
    }

    const obj = params as Record<string, unknown>;

    // Check required fields
    if (!obj.prompt || typeof obj.prompt !== 'string') {
        errors.push('Prompt is required and must be a string');
    } else {
        const promptValidation = validatePrompt(obj.prompt);
        if (!promptValidation.valid) {
            errors.push(...promptValidation.errors);
        }
    }

    // Optional fields validation
    if (obj.genre && typeof obj.genre !== 'string') {
        errors.push('Genre must be a string');
    }

    if (obj.targetAudience && typeof obj.targetAudience !== 'string') {
        errors.push('Target audience must be a string');
    }

    if (obj.tone && typeof obj.tone !== 'string') {
        errors.push('Tone must be a string');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Validate scene data
 */
export const validateScene = (scene: unknown): ValidationResult => {
    const errors: string[] = [];

    if (typeof scene !== 'object' || scene === null) {
        errors.push('Scene must be an object');
        return { valid: false, errors };
    }

    const sceneObj = scene as Record<string, unknown>;

    // Required fields
    if (!sceneObj.sceneNumber || typeof sceneObj.sceneNumber !== 'number') {
        errors.push('Scene must have a valid sceneNumber');
    }

    if (!sceneObj.description || typeof sceneObj.description !== 'string') {
        errors.push('Scene must have a description');
    } else if (sceneObj.description.length > 5000) {
        errors.push('Scene description must not exceed 5000 characters');
    }

    if (!sceneObj.keyframeDescription || typeof sceneObj.keyframeDescription !== 'string') {
        errors.push('Scene must have a keyframeDescription');
    }

    // Optional fields
    if (sceneObj.cameraMovement && typeof sceneObj.cameraMovement !== 'string') {
        errors.push('Scene cameraMovement must be a string');
    }

    if (sceneObj.lighting && typeof sceneObj.lighting !== 'string') {
        errors.push('Scene lighting must be a string');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Validate API key format
 */
export const validateApiKey = (apiKey: string | undefined): ValidationResult => {
    const errors: string[] = [];

    if (!apiKey) {
        return {
            valid: false,
            errors: ['API key is required']
        };
    }

    if (typeof apiKey !== 'string') {
        errors.push('API key must be a string');
    }

    // Check for minimum length (most API keys are at least 20 chars)
    if (apiKey.length < 20) {
        errors.push('API key appears to be too short');
    }

    // Check for suspicious patterns
    if (apiKey.includes(' ') || apiKey.includes('\n')) {
        errors.push('API key contains invalid whitespace');
    }

    // Check for common placeholder values
    if (apiKey === 'your-api-key' || apiKey === 'YOUR_API_KEY' || apiKey === 'xxx') {
        errors.push('API key appears to be a placeholder');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Validate URL
 */
export const validateUrl = (url: string | undefined): ValidationResult => {
    const errors: string[] = [];

    if (!url) {
        return {
            valid: false,
            errors: ['URL is required']
        };
    }

    try {
        const parsed = new URL(url);
        
        // Check protocol
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors.push(`Invalid protocol: ${parsed.protocol}`);
        }

        // Check for localhost/private addresses (warning, not error)
        const hostname = parsed.hostname;
        if (!hostname) {
            errors.push('URL must have a hostname');
        }
    } catch (error) {
        errors.push(`Invalid URL format: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Validate numeric range
 */
export const validateRange = (
    value: number,
    min: number,
    max: number,
    fieldName: string = 'Value'
): ValidationResult => {
    const errors: string[] = [];

    if (typeof value !== 'number' || isNaN(value)) {
        errors.push(`${fieldName} must be a valid number`);
        return { valid: false, errors };
    }

    if (value < min) {
        errors.push(`${fieldName} must be at least ${min}`);
    }

    if (value > max) {
        errors.push(`${fieldName} must not exceed ${max}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Check for rate limit compliance
 */
export const validateRateLimit = (
    requestCount: number,
    windowMs: number,
    maxRequestsPerWindow: number
): ValidationResult => {
    const errors: string[] = [];

    if (requestCount > maxRequestsPerWindow) {
        errors.push(
            `Rate limit exceeded: ${requestCount} requests in ${windowMs}ms ` +
            `(max ${maxRequestsPerWindow})`
        );
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Format validation errors for display
 */
export const formatValidationErrors = (errors: string[]): string => {
    if (errors.length === 0) {
        return 'No validation errors';
    }
    
    if (errors.length === 1) {
        return errors[0];
    }

    return `${errors.length} validation errors:\n  - ${errors.join('\n  - ')}`;
};

/**
 * Create a validation report
 */
export const createValidationReport = (results: ValidationResult[]): string => {
    const allErrors = results.flatMap(r => r.errors);
    const totalValid = results.filter(r => r.valid).length;

    return `
Validation Report:
  Valid: ${totalValid}/${results.length}
  Total Errors: ${allErrors.length}
${allErrors.length > 0 ? `\nErrors:\n  - ${allErrors.join('\n  - ')}` : '\n✓ All validations passed'}
    `.trim();
};
