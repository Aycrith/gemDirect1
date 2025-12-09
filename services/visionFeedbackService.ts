/**
 * Vision Feedback Service
 * 
 * Provides vision-language model analysis of generated keyframe images.
 * Uses Qwen3-VL (local via LM Studio) or Gemini Pro Vision to:
 * - Analyze keyframe quality and composition
 * - Compare generated images against director's vision
 * - Suggest prompt improvements for better results
 * 
 * @module services/visionFeedbackService
 */

import type { Scene, StoryBible, Suggestion, LocalGenerationSettings } from '../types';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';

// ============================================================================
// Types
// ============================================================================

export interface VisionFeedbackResult {
    /** Scene or shot ID this feedback relates to */
    sceneId: string;
    shotId?: string;
    
    /** Quality scores (0-100) */
    scores: {
        /** Overall composition and framing quality */
        composition: number;
        /** Lighting quality and consistency */
        lighting: number;
        /** How well characters match descriptions */
        characterAccuracy: number;
        /** Alignment with director's vision aesthetic */
        styleAdherence: number;
        /** Overall quality score */
        overall: number;
    };
    
    /** Detected issues in the generated image */
    issues: VisionIssue[];
    
    /** Suggested improvements (compatible with existing Suggestion type) */
    suggestions: Suggestion[];
    
    /** Human-readable analysis summary */
    summary: string;
    
    /** Refined prompt suggestion for regeneration */
    refinedPrompt?: string;
    
    /** Raw model response for debugging */
    rawAnalysis?: string;
    
    /** Metadata */
    modelUsed: string;
    analyzedAt: number;
    responseTimeMs: number;
}

export interface VisionIssue {
    /** Severity of the issue */
    severity: 'error' | 'warning' | 'info';
    /** Category of the issue */
    category: 'composition' | 'lighting' | 'character' | 'style' | 'technical' | 'prompt';
    /** Human-readable description */
    message: string;
    /** Optional: region of image affected (normalized 0-1 coordinates) */
    region?: { x: number; y: number; width: number; height: number };
}

export interface VisionAnalysisRequest {
    /** Base64-encoded keyframe image (without data URL prefix) */
    imageBase64: string;
    /** Original prompt used to generate this image */
    originalPrompt: string;
    /** Director's vision statement */
    directorsVision: string;
    /** Scene context for analysis */
    scene: Scene;
    /** Story bible for character/setting reference */
    storyBible: StoryBible;
}

export interface VisionServiceConfig {
    /** LM Studio server URL */
    providerUrl: string;
    /** Vision model ID (e.g., 'huihui-qwen3-vl-32b-instruct-abliterated') */
    modelId: string;
    /** Request timeout in milliseconds */
    timeoutMs: number;
    /** Temperature for analysis (lower = more deterministic) */
    temperature: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: VisionServiceConfig = {
    providerUrl: import.meta.env.VITE_VISION_LLM_URL || 
                 import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                 'http://192.168.50.192:1234/v1/chat/completions',
    modelId: import.meta.env.VITE_VISION_LLM_MODEL || 'huihui-qwen3-vl-32b-instruct-abliterated',
    timeoutMs: Number(import.meta.env.VITE_VISION_LLM_TIMEOUT_MS || 300000), // 5 minutes default
    temperature: 0.3, // Lower temp for more consistent analysis
};

/**
 * Extract vision LLM configuration from LocalGenerationSettings
 * Supports both unified model mode (same model for text + vision) and separate models
 */
export function getVisionConfigFromSettings(settings: LocalGenerationSettings): VisionServiceConfig {
    const useUnified = settings.useUnifiedVisionModel ?? true;
    
    if (useUnified) {
        // Use the main LLM settings for vision as well
        return {
            providerUrl: settings.llmProviderUrl || DEFAULT_CONFIG.providerUrl,
            modelId: settings.llmModel || DEFAULT_CONFIG.modelId,
            timeoutMs: settings.llmTimeoutMs || DEFAULT_CONFIG.timeoutMs,
            temperature: settings.llmTemperature ?? DEFAULT_CONFIG.temperature,
        };
    } else {
        // Use separate vision LLM settings
        return {
            providerUrl: settings.visionLLMProviderUrl || settings.llmProviderUrl || DEFAULT_CONFIG.providerUrl,
            modelId: settings.visionLLMModel || DEFAULT_CONFIG.modelId,
            timeoutMs: settings.visionLLMTimeoutMs || settings.llmTimeoutMs || DEFAULT_CONFIG.timeoutMs,
            temperature: settings.visionLLMTemperature ?? DEFAULT_CONFIG.temperature,
        };
    }
}

// ============================================================================
// Prompt Templates
// ============================================================================

const buildAnalysisPrompt = (request: VisionAnalysisRequest): string => {
    const { originalPrompt, directorsVision, scene, storyBible } = request;
    
    return `You are a professional cinematographer and visual director analyzing a generated keyframe image for a cinematic story project.

## CONTEXT

**Story Logline:** ${storyBible.logline || 'Not provided'}

**Scene:** ${scene.summary || scene.title || 'Scene context not provided'}

**Director's Vision:** ${directorsVision || 'Not provided'}

**Original Generation Prompt:**
"${originalPrompt}"

## YOUR TASK

Analyze the provided keyframe image and respond with ONLY a JSON object (no markdown, no explanation) containing:

{
  "scores": {
    "composition": <0-100>,
    "lighting": <0-100>,
    "characterAccuracy": <0-100>,
    "styleAdherence": <0-100>,
    "overall": <0-100>
  },
  "issues": [
    {
      "severity": "error|warning|info",
      "category": "composition|lighting|character|style|technical|prompt",
      "message": "description of the issue"
    }
  ],
  "summary": "2-3 sentence summary of the image quality and alignment with vision",
  "refinedPrompt": "improved version of the original prompt that would generate a better image"
}

## SCORING GUIDELINES

- **composition** (0-100): Framing, rule of thirds, visual balance, focal point clarity
- **lighting** (0-100): Light quality, shadows, contrast, mood-appropriate lighting
- **characterAccuracy** (0-100): How well characters match story descriptions, expressions, poses
- **styleAdherence** (0-100): Alignment with director's vision aesthetic, color palette, visual style
- **overall** (0-100): Holistic quality assessment

## CRITICAL RULES

1. Output ONLY valid JSON, no markdown fences
2. Be specific in issues - vague feedback is not helpful
3. The refinedPrompt should address identified issues while maintaining scene intent
4. Score fairly - most professional images score 60-80, exceptional ones 80-95
5. Focus on what would make the next generation better`;
};

// ============================================================================
// Core Service Functions
// ============================================================================

/**
 * Analyze a keyframe image using vision LLM
 */
export async function analyzeKeyframe(
    request: VisionAnalysisRequest,
    config: Partial<VisionServiceConfig> = {}
): Promise<VisionFeedbackResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    logCorrelation(
        { correlationId, timestamp: startTime, source: 'vision-llm' as const },
        'vision-analysis-start',
        { sceneId: request.scene.id, model: cfg.modelId }
    );
    
    // Build multimodal request
    const messages = [
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: buildAnalysisPrompt(request)
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/png;base64,${request.imageBase64}`
                    }
                }
            ]
        }
    ];
    
    const requestBody = {
        model: cfg.modelId,
        messages,
        max_tokens: 1000,
        temperature: cfg.temperature,
        stream: false
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);
    
    try {
        const response = await fetch(cfg.providerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        if (!response.ok) {
            throw new Error(`Vision LLM request failed: ${response.status} ${response.statusText}`);
        }
        
        const payload = await response.json();
        const rawContent = payload?.choices?.[0]?.message?.content || '';
        const responseTimeMs = Date.now() - startTime;
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'vision-llm' as const },
            'vision-analysis-complete',
            { responseTimeMs, contentLength: rawContent.length }
        );
        
        // Parse response
        const parsed = parseVisionResponse(rawContent, request.scene.id, cfg.modelId, responseTimeMs);
        return parsed;
        
    } catch (error) {
        const rawError = error instanceof Error ? error.message : 'Unknown error';
        const errorMessage = parseGpuError(rawError);
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'vision-llm' as const },
            'vision-analysis-error',
            { error: rawError, userMessage: errorMessage }
        );
        
        // Return a failure result instead of throwing
        return createErrorResult(request.scene.id, cfg.modelId, Date.now() - startTime, errorMessage);
        
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Parse GPU/CUDA errors into user-friendly messages
 */
function parseGpuError(rawError: string): string {
    const lowerError = rawError.toLowerCase();
    
    // CUDA Out of Memory errors
    if (lowerError.includes('cuda') && (lowerError.includes('out of memory') || lowerError.includes('oom'))) {
        return 'GPU ran out of memory. Try: (1) Close other GPU-using apps, (2) Use a smaller image, or (3) Restart LM Studio.';
    }
    
    // General OOM
    if (lowerError.includes('out of memory') || lowerError.includes('oom') || lowerError.includes('memory allocation')) {
        return 'System ran out of memory. Try closing other applications or using a smaller image.';
    }
    
    // CUDA errors (device, driver, etc.)
    if (lowerError.includes('cuda error') || lowerError.includes('cudnn')) {
        return 'GPU error occurred. Try restarting LM Studio or your computer.';
    }
    
    // Model loading errors
    if (lowerError.includes('failed to load model') || lowerError.includes('model not found')) {
        return 'Vision model failed to load. Check that a vision-capable model is selected in LM Studio.';
    }
    
    // Timeout errors
    if (lowerError.includes('timeout') || lowerError.includes('aborted')) {
        return 'Request timed out. The model may be overloaded or the image too complex.';
    }
    
    // Connection errors
    if (lowerError.includes('fetch') || lowerError.includes('network') || lowerError.includes('econnrefused')) {
        return 'Cannot connect to vision server. Check that LM Studio is running.';
    }
    
    // Return cleaned version of original error
    return rawError.length > 150 ? rawError.slice(0, 150) + '...' : rawError;
}

/**
 * Parse the vision LLM response into structured feedback
 */
function parseVisionResponse(
    rawContent: string,
    sceneId: string,
    modelUsed: string,
    responseTimeMs: number
): VisionFeedbackResult {
    // Strip any markdown fences or thinking blocks
    let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const fenceMatch = /```(?:json)?\r?\n([\s\S]*?)\r?\n```/i.exec(cleaned);
    if (fenceMatch && fenceMatch[1]) {
        cleaned = fenceMatch[1];
    }
    
    // Extract JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    
    try {
        const parsed = JSON.parse(cleaned);
        
        return {
            sceneId,
            scores: {
                composition: Number(parsed.scores?.composition) || 50,
                lighting: Number(parsed.scores?.lighting) || 50,
                characterAccuracy: Number(parsed.scores?.characterAccuracy) || 50,
                styleAdherence: Number(parsed.scores?.styleAdherence) || 50,
                overall: Number(parsed.scores?.overall) || 50
            },
            issues: Array.isArray(parsed.issues) 
                ? parsed.issues.map((issue: { severity?: string; category?: string; message?: string }) => ({
                    severity: issue.severity || 'info',
                    category: issue.category || 'technical',
                    message: String(issue.message || '')
                }))
                : [],
            suggestions: generateSuggestionsFromIssues(parsed.issues || [], sceneId),
            summary: String(parsed.summary || 'Analysis complete'),
            refinedPrompt: parsed.refinedPrompt ? String(parsed.refinedPrompt) : undefined,
            rawAnalysis: rawContent,
            modelUsed,
            analyzedAt: Date.now(),
            responseTimeMs
        };
        
    } catch (parseError) {
        console.warn('[visionFeedbackService] Failed to parse vision response:', parseError);
        
        // Return partial result with raw content
        return {
            sceneId,
            scores: {
                composition: 50,
                lighting: 50,
                characterAccuracy: 50,
                styleAdherence: 50,
                overall: 50
            },
            issues: [{
                severity: 'warning',
                category: 'technical',
                message: 'Failed to parse vision analysis response'
            }],
            suggestions: [],
            summary: 'Analysis partially complete - response parsing failed',
            rawAnalysis: rawContent,
            modelUsed,
            analyzedAt: Date.now(),
            responseTimeMs
        };
    }
}

/**
 * Generate Suggestion objects from vision issues (compatible with applySuggestions)
 */
function generateSuggestionsFromIssues(issues: VisionIssue[], sceneId: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    for (const issue of issues) {
        if (issue.severity === 'error' || issue.severity === 'warning') {
            suggestions.push({
                type: 'FLAG_SCENE_FOR_REVIEW',
                payload: {
                    scene_id: sceneId,
                    reason: `[Vision Analysis] ${issue.category}: ${issue.message}`
                },
                description: `Vision feedback: ${issue.message}`
            });
        }
    }
    
    return suggestions;
}

/**
 * Create an error result when analysis fails
 */
function createErrorResult(
    sceneId: string,
    modelUsed: string,
    responseTimeMs: number,
    errorMessage: string
): VisionFeedbackResult {
    return {
        sceneId,
        scores: {
            composition: 0,
            lighting: 0,
            characterAccuracy: 0,
            styleAdherence: 0,
            overall: 0
        },
        issues: [{
            severity: 'error',
            category: 'technical',
            message: `Vision analysis failed: ${errorMessage}`
        }],
        suggestions: [],
        summary: `Analysis failed: ${errorMessage}`,
        modelUsed,
        analyzedAt: Date.now(),
        responseTimeMs
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if vision LLM is available
 */
export async function checkVisionLLMHealth(
    config: Partial<VisionServiceConfig> = {}
): Promise<{ available: boolean; model?: string; error?: string }> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    // Extract base URL (remove /v1/chat/completions)
    const baseUrl = cfg.providerUrl.replace(/\/v1\/chat\/completions$/, '');
    
    try {
        const response = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            return { available: false, error: `Server returned ${response.status}` };
        }
        
        const data = await response.json();
        const models = data?.data?.map((m: { id: string }) => m.id) || [];
        
        // Check if our target model is available
        const hasVisionModel = models.some((m: string) => 
            m.toLowerCase().includes('vl') || 
            m.toLowerCase().includes('vision') ||
            m === cfg.modelId
        );
        
        return {
            available: hasVisionModel,
            model: models.find((m: string) => m === cfg.modelId) || models[0],
            error: hasVisionModel ? undefined : 'No vision model loaded'
        };
        
    } catch (error) {
        return {
            available: false,
            error: error instanceof Error ? error.message : 'Connection failed'
        };
    }
}

/**
 * Get the current vision service configuration
 */
export function getVisionConfig(): VisionServiceConfig {
    return { ...DEFAULT_CONFIG };
}

/**
 * Format vision feedback for display
 */
export function formatVisionFeedback(result: VisionFeedbackResult): string {
    const { scores, issues, summary, refinedPrompt } = result;
    
    let output = `## Vision Analysis\n\n`;
    output += `**Overall Score:** ${scores.overall}/100\n\n`;
    output += `| Aspect | Score |\n|--------|-------|\n`;
    output += `| Composition | ${scores.composition}/100 |\n`;
    output += `| Lighting | ${scores.lighting}/100 |\n`;
    output += `| Character Accuracy | ${scores.characterAccuracy}/100 |\n`;
    output += `| Style Adherence | ${scores.styleAdherence}/100 |\n\n`;
    
    output += `**Summary:** ${summary}\n\n`;
    
    if (issues.length > 0) {
        output += `### Issues\n\n`;
        for (const issue of issues) {
            const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
            output += `- ${icon} **${issue.category}:** ${issue.message}\n`;
        }
        output += '\n';
    }
    
    if (refinedPrompt) {
        output += `### Suggested Refined Prompt\n\n`;
        output += `\`\`\`\n${refinedPrompt}\n\`\`\`\n`;
    }
    
    return output;
}
