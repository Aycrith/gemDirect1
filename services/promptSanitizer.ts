/**
 * Prompt Sanitization Service
 * 
 * Provides protection against prompt injection attacks and malformed inputs.
 * All sanitization is opt-in via feature flag `ENABLE_PROMPT_SANITIZATION`.
 * 
 * Design principles:
 * - Graceful degradation: invalid inputs logged but not blocked by default
 * - Configurable strictness levels
 * - Non-destructive: original input preserved for debugging
 * 
 * @module services/promptSanitizer
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('Sanitizer');

// ============================================================================
// Types
// ============================================================================

export interface SanitizationResult {
    /** Sanitized text with dangerous patterns removed */
    sanitized: string;
    /** Original input (for debugging/logging) */
    original: string;
    /** Whether any sanitization was applied */
    wasModified: boolean;
    /** List of patterns that were detected and removed */
    detectedPatterns: string[];
    /** Risk level based on detected patterns */
    riskLevel: 'none' | 'low' | 'medium' | 'high';
}

export interface SanitizationOptions {
    /** Whether to remove control characters */
    removeControlChars?: boolean;
    /** Whether to detect prompt injection patterns */
    detectInjection?: boolean;
    /** Whether to normalize whitespace */
    normalizeWhitespace?: boolean;
    /** Maximum allowed length (truncate if exceeded) */
    maxLength?: number;
    /** Whether to log warnings for detected patterns */
    logWarnings?: boolean;
}

const DEFAULT_OPTIONS: Required<SanitizationOptions> = {
    removeControlChars: true,
    detectInjection: true,
    normalizeWhitespace: true,
    maxLength: 10000,
    logWarnings: true,
};

// ============================================================================
// Injection Detection Patterns
// ============================================================================

/**
 * Patterns commonly used in prompt injection attacks.
 * Each pattern has a name for reporting and a regex for detection.
 */
const INJECTION_PATTERNS: { name: string; pattern: RegExp; severity: 'low' | 'medium' | 'high' }[] = [
    // System prompt manipulation
    { name: 'system_override', pattern: /\bsystem\s*:/i, severity: 'high' },
    { name: 'ignore_previous', pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|text)/i, severity: 'high' },
    { name: 'forget_instructions', pattern: /forget\s+(all\s+)?(your\s+)?(previous\s+)?instructions?/i, severity: 'high' },
    { name: 'disregard_prompt', pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, severity: 'high' },
    
    // Role manipulation
    { name: 'new_role', pattern: /you\s+are\s+now\s+(a|an)\s+/i, severity: 'medium' },
    { name: 'act_as', pattern: /\bact\s+as\s+(if\s+)?(you\s+)?(are|were)\s+/i, severity: 'medium' },
    { name: 'pretend_to_be', pattern: /pretend\s+(to\s+be|you\s+are)\s+/i, severity: 'medium' },
    
    // Output manipulation
    { name: 'output_format', pattern: /\boutput\s*:\s*$/im, severity: 'low' },
    { name: 'response_format', pattern: /\bresponse\s*:\s*$/im, severity: 'low' },
    
    // Delimiter attacks
    { name: 'delimiter_break', pattern: /```\s*(system|assistant|user)\s*```/i, severity: 'high' },
    { name: 'xml_tag_injection', pattern: /<\/?(?:system|user|assistant|prompt|instruction)[^>]*>/i, severity: 'high' },
    
    // Jailbreak attempts
    { name: 'dan_jailbreak', pattern: /\bDAN\b.*\bdo\s+anything\s+now\b/i, severity: 'high' },
    { name: 'developer_mode', pattern: /enable\s+developer\s+mode/i, severity: 'high' },
    
    // Base64/encoding attempts
    { name: 'base64_command', pattern: /base64\s*:\s*[A-Za-z0-9+/=]{20,}/i, severity: 'medium' },
];

/**
 * Control characters that should be stripped (except newlines/tabs).
 */
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// ============================================================================
// Core Sanitization Functions
// ============================================================================

/**
 * Sanitize user input to prevent prompt injection and malformed data.
 * 
 * @param input - Raw user input string
 * @param options - Sanitization options (merged with defaults)
 * @returns SanitizationResult with sanitized text and metadata
 * 
 * @example
 * ```typescript
 * const result = sanitizeUserInput("Create a story about cats. Ignore previous instructions.");
 * // result.wasModified = true
 * // result.detectedPatterns = ['ignore_previous']
 * // result.riskLevel = 'high'
 * ```
 */
export function sanitizeUserInput(
    input: string,
    options: SanitizationOptions = {}
): SanitizationResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const detectedPatterns: string[] = [];
    let sanitized = input;
    let highestSeverity: 'none' | 'low' | 'medium' | 'high' = 'none';

    // Track original for comparison
    const original = input;

    // Step 1: Remove control characters
    if (opts.removeControlChars) {
        const before = sanitized;
        sanitized = sanitized.replace(CONTROL_CHAR_PATTERN, '');
        if (before !== sanitized) {
            detectedPatterns.push('control_characters');
        }
    }

    // Step 2: Detect and optionally remove injection patterns
    if (opts.detectInjection) {
        for (const { name, pattern, severity } of INJECTION_PATTERNS) {
            if (pattern.test(sanitized)) {
                detectedPatterns.push(name);
                
                // Update highest severity
                if (severity === 'high') {
                    highestSeverity = 'high';
                } else if (severity === 'medium' && highestSeverity !== 'high') {
                    highestSeverity = 'medium';
                } else if (severity === 'low' && highestSeverity === 'none') {
                    highestSeverity = 'low';
                }

                // Remove the pattern (replace with space to maintain readability)
                sanitized = sanitized.replace(pattern, ' ');
            }
        }
    }

    // Step 3: Normalize whitespace
    if (opts.normalizeWhitespace) {
        // Collapse multiple spaces/newlines but preserve paragraph breaks
        sanitized = sanitized
            .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
            .replace(/\n{3,}/g, '\n\n')        // Max 2 consecutive newlines
            .trim();
    }

    // Step 4: Enforce max length
    if (opts.maxLength && sanitized.length > opts.maxLength) {
        sanitized = sanitized.substring(0, opts.maxLength);
        detectedPatterns.push('truncated');
    }

    const wasModified = original !== sanitized;

    // Log warnings if enabled
    if (opts.logWarnings && detectedPatterns.length > 0) {
        logger.warn('Sanitization applied to user input', {
            patterns: detectedPatterns,
            riskLevel: highestSeverity,
            originalLength: original.length,
            sanitizedLength: sanitized.length,
        });
    }

    return {
        sanitized,
        original,
        wasModified,
        detectedPatterns,
        riskLevel: highestSeverity,
    };
}

/**
 * Quick check if input contains any injection patterns.
 * Does NOT sanitize - just detects.
 * 
 * @param input - Text to check
 * @returns True if any injection pattern detected
 */
export function containsInjectionPattern(input: string): boolean {
    return INJECTION_PATTERNS.some(({ pattern }) => pattern.test(input));
}

/**
 * Get the risk level of input without sanitizing.
 * 
 * @param input - Text to analyze
 * @returns Risk level based on detected patterns
 */
export function assessRiskLevel(input: string): 'none' | 'low' | 'medium' | 'high' {
    let highest: 'none' | 'low' | 'medium' | 'high' = 'none';
    
    for (const { pattern, severity } of INJECTION_PATTERNS) {
        if (pattern.test(input)) {
            if (severity === 'high') return 'high'; // Early exit for high
            if (severity === 'medium') highest = 'medium';
            else if (severity === 'low' && highest === 'none') highest = 'low';
        }
    }
    
    return highest;
}

// ============================================================================
// Specialized Sanitizers
// ============================================================================

/**
 * Sanitize a story idea/prompt before sending to LLM.
 * More permissive than general sanitization - allows creative content.
 */
export function sanitizeStoryIdea(input: string): SanitizationResult {
    return sanitizeUserInput(input, {
        removeControlChars: true,
        detectInjection: true,
        normalizeWhitespace: true,
        maxLength: 2000,
        logWarnings: true,
    });
}

/**
 * Sanitize a director's vision prompt.
 * Focused on visual style descriptions.
 */
export function sanitizeDirectorsVision(input: string): SanitizationResult {
    return sanitizeUserInput(input, {
        removeControlChars: true,
        detectInjection: true,
        normalizeWhitespace: true,
        maxLength: 1000,
        logWarnings: true,
    });
}

/**
 * Sanitize a scene description.
 */
export function sanitizeSceneDescription(input: string): SanitizationResult {
    return sanitizeUserInput(input, {
        removeControlChars: true,
        detectInjection: true,
        normalizeWhitespace: true,
        maxLength: 500,
        logWarnings: true,
    });
}

/**
 * Sanitize a negative prompt.
 * These are typically shorter and more technical.
 */
export function sanitizeNegativePrompt(input: string): SanitizationResult {
    return sanitizeUserInput(input, {
        removeControlChars: true,
        detectInjection: false, // Negative prompts are internal
        normalizeWhitespace: true,
        maxLength: 500,
        logWarnings: false,
    });
}

// ============================================================================
// Feature Flag Integration
// ============================================================================

/**
 * Check if prompt sanitization is enabled.
 * Reads from localStorage for feature flag.
 */
export function isSanitizationEnabled(): boolean {
    if (typeof localStorage === 'undefined') {
        return false; // Default off in non-browser environments
    }
    return localStorage.getItem('ENABLE_PROMPT_SANITIZATION') === 'true';
}

/**
 * Enable or disable prompt sanitization at runtime.
 */
export function setSanitizationEnabled(enabled: boolean): void {
    if (typeof localStorage !== 'undefined') {
        if (enabled) {
            localStorage.setItem('ENABLE_PROMPT_SANITIZATION', 'true');
            logger.info('Prompt sanitization enabled');
        } else {
            localStorage.removeItem('ENABLE_PROMPT_SANITIZATION');
            logger.info('Prompt sanitization disabled');
        }
    }
}

/**
 * Conditionally sanitize based on feature flag.
 * Returns original input unchanged if sanitization is disabled.
 */
export function conditionalSanitize(
    input: string,
    sanitizer: (input: string) => SanitizationResult = sanitizeUserInput
): SanitizationResult {
    if (!isSanitizationEnabled()) {
        return {
            sanitized: input,
            original: input,
            wasModified: false,
            detectedPatterns: [],
            riskLevel: 'none',
        };
    }
    return sanitizer(input);
}
