/**
 * Run Controller Utilities
 * 
 * Helper functions for input validation, path resolution, and error handling.
 * 
 * @module scripts/utils/runControllerUtils
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Default ComfyUI output directory (Windows portable installation)
 */
const DEFAULT_COMFYUI_OUTPUT_DIR = 'C:\\ComfyUI\\ComfyUI_windows_portable\\ComfyUI\\output';

/**
 * Resolve ComfyUI output directory from environment or default
 */
export function resolveComfyUIOutputDir(): { path: string; source: 'env' | 'default' } {
    const envPath = process.env.COMFYUI_OUTPUT_DIR;
    if (envPath) {
        return { path: envPath, source: 'env' };
    }
    return { path: DEFAULT_COMFYUI_OUTPUT_DIR, source: 'default' };
}

/**
 * Check if ComfyUI output directory exists and is accessible
 */
export function validateComfyUIOutputDir(): ValidationResult {
    const { path: outputPath, source } = resolveComfyUIOutputDir();
    
    if (!fs.existsSync(outputPath)) {
        return {
            valid: false,
            error: `ComfyUI output directory not found: ${outputPath}`,
            suggestion: source === 'default'
                ? 'Set COMFYUI_OUTPUT_DIR environment variable to your ComfyUI output path'
                : `Check that the path exists: ${outputPath}`,
            resolvedPath: outputPath,
            source,
        };
    }
    
    // Check if directory is writable
    try {
        const testFile = path.join(outputPath, '.write-test');
        fs.writeFileSync(testFile, '');
        fs.unlinkSync(testFile);
    } catch {
        return {
            valid: false,
            error: `ComfyUI output directory is not writable: ${outputPath}`,
            suggestion: 'Check directory permissions',
            resolvedPath: outputPath,
            source,
        };
    }
    
    return {
        valid: true,
        resolvedPath: outputPath,
        source,
    };
}

// ============================================================================
// Input Validation
// ============================================================================

export interface ValidationResult {
    valid: boolean;
    error?: string;
    suggestion?: string;
    resolvedPath?: string;
    source?: 'env' | 'default';
}

export interface InputValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate sample directory exists
 */
export function validateSamplePath(samplesDir: string, sampleId: string): ValidationResult {
    const samplePath = path.join(samplesDir, sampleId);
    
    if (!fs.existsSync(samplePath)) {
        return {
            valid: false,
            error: `Sample directory not found: ${sampleId}`,
            suggestion: `Expected path: ${samplePath}. Run --list to see available samples.`,
        };
    }
    
    // Check for sample.json or context.json (legacy format)
    const sampleJsonPath = path.join(samplePath, 'sample.json');
    const contextJsonPath = path.join(samplePath, 'context.json');
    if (!fs.existsSync(sampleJsonPath) && !fs.existsSync(contextJsonPath)) {
        return {
            valid: false,
            error: `Sample config not found: ${sampleId}/sample.json or context.json`,
            suggestion: `The sample directory exists but is missing sample.json or context.json`,
        };
    }
    
    return { valid: true, resolvedPath: samplePath };
}

/**
 * Validate narrative script file exists
 */
export function validateScriptPath(projectRoot: string, scriptPath: string): ValidationResult {
    const fullPath = path.isAbsolute(scriptPath) 
        ? scriptPath 
        : path.join(projectRoot, scriptPath);
    
    if (!fs.existsSync(fullPath)) {
        return {
            valid: false,
            error: `Narrative script not found: ${scriptPath}`,
            suggestion: `Expected path: ${fullPath}. Run --list to see available scripts.`,
        };
    }
    
    // Try to parse JSON
    try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(content);
        
        // Basic validation
        if (!parsed.shots || !Array.isArray(parsed.shots)) {
            return {
                valid: false,
                error: `Invalid narrative script: missing 'shots' array`,
                suggestion: 'Check the script format matches the expected schema',
            };
        }
    } catch (e) {
        return {
            valid: false,
            error: `Failed to parse narrative script: ${e instanceof Error ? e.message : String(e)}`,
            suggestion: 'Check that the file contains valid JSON',
        };
    }
    
    return { valid: true, resolvedPath: fullPath };
}

/**
 * Validate pipeline script exists
 */
export function validatePipelineScript(projectRoot: string, pipelineType: 'production' | 'narrative'): ValidationResult {
    const scriptName = pipelineType === 'production' ? 'run-pipeline.ts' : 'run-narrative.ts';
    const scriptPath = path.join(projectRoot, 'scripts', scriptName);
    
    if (!fs.existsSync(scriptPath)) {
        return {
            valid: false,
            error: `Pipeline script not found: ${scriptName}`,
            suggestion: 'The project may be corrupted. Try re-installing dependencies.',
        };
    }
    
    return { valid: true, resolvedPath: scriptPath };
}

/**
 * Validate all inputs for a production run
 */
export function validateProductionInputs(
    projectRoot: string,
    samplesDir: string,
    sampleId: string
): InputValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate sample
    const sampleResult = validateSamplePath(samplesDir, sampleId);
    if (!sampleResult.valid && sampleResult.error) {
        errors.push(sampleResult.error);
        if (sampleResult.suggestion) {
            warnings.push(sampleResult.suggestion);
        }
    }
    
    // Validate pipeline script
    const pipelineResult = validatePipelineScript(projectRoot, 'production');
    if (!pipelineResult.valid && pipelineResult.error) {
        errors.push(pipelineResult.error);
    }
    
    // Validate ComfyUI output (warning only, not blocking)
    const comfyResult = validateComfyUIOutputDir();
    if (!comfyResult.valid && comfyResult.error) {
        warnings.push(`ComfyUI output: ${comfyResult.error}`);
        if (comfyResult.suggestion) {
            warnings.push(comfyResult.suggestion);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validate all inputs for a narrative run
 */
export function validateNarrativeInputs(
    projectRoot: string,
    scriptPath: string
): InputValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate script
    const scriptResult = validateScriptPath(projectRoot, scriptPath);
    if (!scriptResult.valid && scriptResult.error) {
        errors.push(scriptResult.error);
        if (scriptResult.suggestion) {
            warnings.push(scriptResult.suggestion);
        }
    }
    
    // Validate pipeline script
    const pipelineResult = validatePipelineScript(projectRoot, 'narrative');
    if (!pipelineResult.valid && pipelineResult.error) {
        errors.push(pipelineResult.error);
    }
    
    // Validate ComfyUI output (warning only)
    const comfyResult = validateComfyUIOutputDir();
    if (!comfyResult.valid && comfyResult.error) {
        warnings.push(`ComfyUI output: ${comfyResult.error}`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// ============================================================================
// Timeout Handling
// ============================================================================

/**
 * Parse timeout string to milliseconds
 * Supports: "30s", "5m", "1h", "90" (seconds)
 */
export function parseTimeoutMs(timeout: string): number | null {
    const match = timeout.match(/^(\d+)(s|m|h)?$/);
    if (!match) return null;
    
    const value = parseInt(match[1] || '0', 10);
    const unit = match[2] || 's';
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: return value * 1000;
    }
}

/**
 * Format timeout for display
 */
export function formatTimeout(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}

// ============================================================================
// Step Tracking
// ============================================================================

export interface StepInfo {
    stepId: string;
    status: 'running' | 'succeeded' | 'failed' | 'skipped';
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
}

/**
 * Create a step tracker for collecting step timing info
 */
export function createStepTracker() {
    const steps: Map<string, StepInfo> = new Map();
    
    return {
        startStep(stepId: string): void {
            steps.set(stepId, {
                stepId,
                status: 'running',
                startedAt: new Date().toISOString(),
            });
        },
        
        completeStep(stepId: string, status: 'succeeded' | 'failed' | 'skipped' = 'succeeded'): StepInfo | undefined {
            const step = steps.get(stepId);
            if (step) {
                step.status = status;
                step.finishedAt = new Date().toISOString();
                if (step.startedAt) {
                    step.durationMs = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
                }
                return step;
            }
            return undefined;
        },
        
        getSteps(): StepInfo[] {
            return Array.from(steps.values());
        },
        
        getStep(stepId: string): StepInfo | undefined {
            return steps.get(stepId);
        },
    };
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Format validation errors for console output
 */
export function formatValidationErrors(result: InputValidationResult): string {
    const lines: string[] = [];
    
    if (result.errors.length > 0) {
        lines.push('❌ Validation failed:');
        for (const error of result.errors) {
            lines.push(`   • ${error}`);
        }
    }
    
    if (result.warnings.length > 0) {
        lines.push('');
        lines.push('⚠️  Warnings:');
        for (const warning of result.warnings) {
            lines.push(`   • ${warning}`);
        }
    }
    
    return lines.join('\n');
}

/**
 * Create a timeout error message
 */
export function formatTimeoutError(timeoutMs: number): string {
    return `Run timed out after ${formatTimeout(timeoutMs)}. The pipeline may still be running in ComfyUI.`;
}

/**
 * Create a stream closed error message
 */
export function formatStreamClosedWarning(stream: 'stdout' | 'stderr'): string {
    return `Process ${stream} closed unexpectedly. Some output may be missing.`;
}
