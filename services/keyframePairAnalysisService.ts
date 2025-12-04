/**
 * Keyframe Pair Analysis Service
 * 
 * Pre-flight QA service for bookend video generation.
 * Analyzes start/end keyframe pairs using vision LLM to ensure:
 * - Character continuity between frames
 * - Environment consistency
 * - Camera movement coherence
 * 
 * Blocks video generation if pairs are too inconsistent for safe interpolation.
 * 
 * @module services/keyframePairAnalysisService
 */

import type { LocalGenerationSettings } from '../types';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';
import { getVisionConfigFromSettings, type VisionServiceConfig } from './visionFeedbackService';

// ============================================================================
// Types
// ============================================================================

/**
 * Keyframe pair analysis result with continuity scores
 */
export interface KeyframePairAnalysisResult {
    /** How well characters maintain position, appearance, and pose (0-100) */
    characterMatch: number;
    /** How well environment/setting remains consistent (0-100) */
    environmentMatch: number;
    /** How well camera angle/framing suggests smooth transition (0-100) */
    cameraMatch: number;
    /** Weighted average of the above (0-100) */
    overallContinuity: number;
    
    /** Specific issues found in the pair */
    issues: KeyframePairIssue[];
    /** Suggestions for improving the pair */
    suggestions: string[];
    
    /** Whether pair passes threshold for video generation */
    passesThreshold: boolean;
    /** Human-readable summary */
    summary: string;
    
    /** Metadata */
    modelUsed: string;
    analyzedAt: number;
    responseTimeMs: number;
}

export interface KeyframePairIssue {
    severity: 'error' | 'warning' | 'info';
    category: 'character' | 'environment' | 'camera' | 'lighting' | 'composition';
    message: string;
}

export interface KeyframePairRequest {
    /** Base64-encoded start keyframe (scene opening) */
    startImageBase64: string;
    /** Base64-encoded end keyframe (scene closing) */
    endImageBase64: string;
    /** Scene description for context */
    sceneDescription?: string;
    /** Director's vision for style context */
    directorsVision?: string;
}

// ============================================================================
// Thresholds
// ============================================================================

/**
 * Quality thresholds for keyframe pair analysis
 * Pairs below these thresholds will block video generation
 */
export const KEYFRAME_PAIR_THRESHOLDS = {
    /** Minimum overall continuity score */
    minOverallContinuity: 70,
    /** Minimum character match score */
    minCharacterMatch: 75,
    /** Minimum environment match score */
    minEnvironmentMatch: 70,
    /** Minimum camera match score */
    minCameraMatch: 65,
} as const;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: VisionServiceConfig = {
    providerUrl: import.meta.env.VITE_VISION_LLM_URL || 
                 import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                 'http://192.168.50.192:1234/v1/chat/completions',
    modelId: import.meta.env.VITE_VISION_LLM_MODEL || 'qwen/qwen3-vl-8b',
    timeoutMs: Number(import.meta.env.VITE_VISION_LLM_TIMEOUT_MS || 120000), // 2 minutes
    temperature: 0.3,
};

// ============================================================================
// Prompt Template
// ============================================================================

const buildKeyframePairPrompt = (
    sceneDescription?: string,
    directorsVision?: string
): string => {
    return `You are a professional cinematographer and visual continuity supervisor. Your task is to analyze two keyframe images that will be used for video interpolation.

## TASK
Evaluate how suitable these two frames are for generating a smooth video transition. The first image represents the START frame and the second represents the END frame.

## CONTEXT
${sceneDescription ? `**Scene Description**: ${sceneDescription}` : '**Scene**: Context not provided'}
${directorsVision ? `**Director's Vision**: ${directorsVision}` : ''}

## IMAGES
1. **START KEYFRAME**: [First image attached] - This is where the video begins
2. **END KEYFRAME**: [Second image attached] - This is where the video ends

## EVALUATION CRITERIA
Score each category from 0-100:

### 1. Character Continuity (characterMatch)
- Do the same characters appear in both frames?
- Are their proportions, clothing, and key features consistent?
- Is their relative positioning logical for a smooth transition?
- Are there any impossible character movements between frames?

### 2. Environment Continuity (environmentMatch)
- Is it the same setting/location in both frames?
- Are props, furniture, and background elements consistent?
- Is the lighting direction and quality similar?
- Are there any jarring environmental changes?

### 3. Camera Continuity (cameraMatch)
- Is the camera angle change smooth and logical?
- Could a real camera move from the first angle to the second?
- Is the depth of field and focal length consistent?
- Is the frame composition suggesting intentional movement?

## ISSUES TO FLAG
- Hard cuts (completely different scenes)
- Character teleportation or impossible poses
- 180-degree rule violations
- Lighting direction reversals
- Scale/proportion mismatches

## OUTPUT FORMAT
Respond with ONLY a valid JSON object (no markdown, no code fences, no explanation):
{
    "characterMatch": <0-100>,
    "environmentMatch": <0-100>,
    "cameraMatch": <0-100>,
    "overallContinuity": <weighted average 0-100>,
    "issues": [
        {"severity": "error|warning|info", "category": "character|environment|camera|lighting|composition", "message": "<description>"}
    ],
    "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>"],
    "summary": "<2-3 sentence summary of the pair's suitability for video interpolation>"
}`;
};

// ============================================================================
// Vision LLM API Call
// ============================================================================

interface VisionLLMResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

async function callVisionLLM(
    config: VisionServiceConfig,
    systemPrompt: string,
    images: string[],
    correlationId: string
): Promise<string> {
    const startTime = Date.now();
    
    logCorrelation(
        { correlationId, timestamp: startTime, source: 'keyframe-pair-analysis' },
        'Starting vision LLM call for keyframe pair analysis',
        { model: config.modelId, imageCount: images.length }
    );
    
    // Build multimodal message content
    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: systemPrompt }
    ];
    
    // Add images
    for (const imageBase64 of images) {
        content.push({
            type: 'image_url',
            image_url: {
                url: imageBase64.startsWith('data:') 
                    ? imageBase64 
                    : `data:image/jpeg;base64,${imageBase64}`
            }
        });
    }
    
    const requestBody = {
        model: config.modelId,
        messages: [
            {
                role: 'user',
                content
            }
        ],
        temperature: config.temperature,
        max_tokens: 2000,
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    
    try {
        const response = await fetch(config.providerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Vision LLM API error: ${response.status} ${response.statusText}`);
        }
        
        const data: VisionLLMResponse = await response.json();
        const result = data.choices?.[0]?.message?.content;
        
        if (!result) {
            throw new Error('Vision LLM returned empty response');
        }
        
        const duration = Date.now() - startTime;
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'keyframe-pair-analysis' },
            'Vision LLM call completed',
            { duration, responseLength: result.length }
        );
        
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Vision LLM request timed out after ${config.timeoutMs}ms`);
        }
        throw error;
    }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a keyframe pair for continuity and interpolation suitability
 * 
 * @param request - The keyframe pair images and context
 * @param settings - Optional LocalGenerationSettings for vision config
 * @returns KeyframePairAnalysisResult with scores and pass/fail status
 */
export async function analyzeKeyframePair(
    request: KeyframePairRequest,
    settings?: LocalGenerationSettings
): Promise<KeyframePairAnalysisResult> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    logCorrelation(
        { correlationId, timestamp: startTime, source: 'keyframe-pair-analysis' },
        'Starting keyframe pair analysis'
    );
    
    const config = settings 
        ? getVisionConfigFromSettings(settings)
        : DEFAULT_CONFIG;
    
    try {
        const prompt = buildKeyframePairPrompt(
            request.sceneDescription,
            request.directorsVision
        );
        
        const response = await callVisionLLM(
            config,
            prompt,
            [request.startImageBase64, request.endImageBase64],
            correlationId
        );
        
        // Parse JSON response (handle possible markdown wrapper)
        let jsonStr = response.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        
        const parsed = JSON.parse(jsonStr);
        
        // Validate required fields
        const characterMatch = Math.min(100, Math.max(0, Number(parsed.characterMatch) || 0));
        const environmentMatch = Math.min(100, Math.max(0, Number(parsed.environmentMatch) || 0));
        const cameraMatch = Math.min(100, Math.max(0, Number(parsed.cameraMatch) || 0));
        
        // Calculate overall continuity (weighted average)
        const overallContinuity = parsed.overallContinuity 
            ?? Math.round((characterMatch * 0.4 + environmentMatch * 0.35 + cameraMatch * 0.25));
        
        // Check thresholds
        const passesThreshold = 
            overallContinuity >= KEYFRAME_PAIR_THRESHOLDS.minOverallContinuity &&
            characterMatch >= KEYFRAME_PAIR_THRESHOLDS.minCharacterMatch;
        
        // Parse issues
        const issues: KeyframePairIssue[] = (parsed.issues || []).map((issue: unknown) => {
            const i = issue as { severity?: string; category?: string; message?: string };
            return {
                severity: (['error', 'warning', 'info'].includes(i.severity || '') 
                    ? i.severity 
                    : 'warning') as 'error' | 'warning' | 'info',
                category: (['character', 'environment', 'camera', 'lighting', 'composition'].includes(i.category || '')
                    ? i.category
                    : 'composition') as 'character' | 'environment' | 'camera' | 'lighting' | 'composition',
                message: String(i.message || 'Unknown issue'),
            };
        });
        
        // Add threshold-based issues if missing
        if (characterMatch < KEYFRAME_PAIR_THRESHOLDS.minCharacterMatch && 
            !issues.some(i => i.category === 'character' && i.severity === 'error')) {
            issues.push({
                severity: 'error',
                category: 'character',
                message: `Character match score (${characterMatch}) below minimum threshold (${KEYFRAME_PAIR_THRESHOLDS.minCharacterMatch})`,
            });
        }
        
        if (overallContinuity < KEYFRAME_PAIR_THRESHOLDS.minOverallContinuity &&
            !issues.some(i => i.severity === 'error')) {
            issues.push({
                severity: 'error',
                category: 'composition',
                message: `Overall continuity score (${overallContinuity}) below minimum threshold (${KEYFRAME_PAIR_THRESHOLDS.minOverallContinuity})`,
            });
        }
        
        const responseTimeMs = Date.now() - startTime;
        
        const result: KeyframePairAnalysisResult = {
            characterMatch,
            environmentMatch,
            cameraMatch,
            overallContinuity,
            issues,
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
            passesThreshold,
            summary: parsed.summary || (passesThreshold 
                ? 'Keyframe pair is suitable for video interpolation.'
                : 'Keyframe pair has continuity issues that may affect video quality.'),
            modelUsed: config.modelId,
            analyzedAt: Date.now(),
            responseTimeMs,
        };
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'keyframe-pair-analysis' },
            'Keyframe pair analysis completed',
            { 
                overallContinuity, 
                passesThreshold, 
                issueCount: issues.length,
                responseTimeMs 
            }
        );
        
        return result;
        
    } catch (error) {
        const responseTimeMs = Date.now() - startTime;
        
        console.error('[KeyframePairAnalysis] Analysis failed:', error);
        
        // Return error result with zero scores
        return {
            characterMatch: 0,
            environmentMatch: 0,
            cameraMatch: 0,
            overallContinuity: 0,
            issues: [{
                severity: 'error',
                category: 'composition',
                message: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            }],
            suggestions: ['Retry analysis or manually verify keyframe compatibility'],
            passesThreshold: false,
            summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            modelUsed: config.modelId,
            analyzedAt: Date.now(),
            responseTimeMs,
        };
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick check if a keyframe pair meets minimum thresholds
 * Use for gating before expensive video generation
 */
export function keyframePairMeetsThresholds(
    result: KeyframePairAnalysisResult,
    customThresholds?: Partial<typeof KEYFRAME_PAIR_THRESHOLDS>
): { passes: boolean; reason?: string } {
    const thresholds = { ...KEYFRAME_PAIR_THRESHOLDS, ...customThresholds };
    
    if (result.characterMatch < thresholds.minCharacterMatch) {
        return {
            passes: false,
            reason: `Character match (${result.characterMatch}) below threshold (${thresholds.minCharacterMatch})`,
        };
    }
    
    if (result.overallContinuity < thresholds.minOverallContinuity) {
        return {
            passes: false,
            reason: `Overall continuity (${result.overallContinuity}) below threshold (${thresholds.minOverallContinuity})`,
        };
    }
    
    return { passes: true };
}

/**
 * Format keyframe pair result for UI display
 */
export function formatKeyframePairResult(result: KeyframePairAnalysisResult): {
    status: 'pass' | 'warning' | 'fail';
    title: string;
    scores: Array<{ label: string; value: number; threshold: number }>;
    issues: KeyframePairIssue[];
} {
    const hasErrors = result.issues.some(i => i.severity === 'error');
    const hasWarnings = result.issues.some(i => i.severity === 'warning');
    
    let status: 'pass' | 'warning' | 'fail';
    let title: string;
    
    if (!result.passesThreshold || hasErrors) {
        status = 'fail';
        title = '❌ Keyframe pair not suitable for interpolation';
    } else if (hasWarnings) {
        status = 'warning';
        title = '⚠️ Keyframe pair may have continuity issues';
    } else {
        status = 'pass';
        title = '✅ Keyframe pair ready for video generation';
    }
    
    return {
        status,
        title,
        scores: [
            { label: 'Character Match', value: result.characterMatch, threshold: KEYFRAME_PAIR_THRESHOLDS.minCharacterMatch },
            { label: 'Environment Match', value: result.environmentMatch, threshold: KEYFRAME_PAIR_THRESHOLDS.minEnvironmentMatch },
            { label: 'Camera Match', value: result.cameraMatch, threshold: KEYFRAME_PAIR_THRESHOLDS.minCameraMatch },
            { label: 'Overall Continuity', value: result.overallContinuity, threshold: KEYFRAME_PAIR_THRESHOLDS.minOverallContinuity },
        ],
        issues: result.issues,
    };
}

/**
 * Generate blocking message for video generation gate
 */
export function getBlockingMessage(result: KeyframePairAnalysisResult): string | null {
    if (result.passesThreshold) {
        return null;
    }
    
    const criticalIssues = result.issues.filter(i => i.severity === 'error');
    const firstIssue = criticalIssues[0];
    if (firstIssue) {
        return `Video generation blocked: ${firstIssue.message}`;
    }
    
    return `Video generation blocked: Overall continuity score (${result.overallContinuity}) below threshold (${KEYFRAME_PAIR_THRESHOLDS.minOverallContinuity})`;
}
