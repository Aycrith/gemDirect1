/**
 * Video Feedback Service
 * 
 * Provides vision-language model analysis of generated videos.
 * Uses Qwen3-VL (local via LM Studio) to:
 * - Compare video first/last frames against input keyframes (bookend matching)
 * - Analyze motion quality and temporal coherence
 * - Detect visual artifacts and generation issues
 * - Score overall video quality against the intended prompt
 * 
 * This service mirrors the structure of visionFeedbackService.ts for consistency.
 * 
 * @module services/videoFeedbackService
 */

import type { Scene, StoryBible, LocalGenerationSettings } from '../types';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';
import { getVisionConfigFromSettings, type VisionServiceConfig } from './visionFeedbackService';

// ============================================================================
// Types
// ============================================================================

/** Video-specific suggestion for display in VideoAnalysisCard */
export interface VideoSuggestion {
    id: string;
    type: 'video-feedback';
    description: string;
    rationale: string;
    impact: 'low' | 'medium' | 'high';
    confidence: number;
    sceneId: string;
    shotId?: string;
}

export interface VideoFeedbackResult {
    /** Scene or shot ID this feedback relates to */
    sceneId: string;
    shotId?: string;
    
    /** Quality scores (0-100) */
    scores: {
        /** How well the video's first frame matches the start keyframe */
        startFrameMatch: number;
        /** How well the video's last frame matches the end keyframe */
        endFrameMatch: number;
        /** Smoothness and quality of motion between frames */
        motionQuality: number;
        /** How well the video matches the prompt description */
        promptAdherence: number;
        /** Overall quality score (weighted average) */
        overall: number;
    };
    
    /** Detected issues in the generated video */
    issues: VideoIssue[];
    
    /** Suggested improvements (video-specific suggestions) */
    suggestions: VideoSuggestion[];
    
    /** Human-readable analysis summary */
    summary: string;
    
    /** Refined prompt suggestion for regeneration */
    refinedPrompt?: string;
    
    /** Frame analysis details */
    frameAnalysis?: {
        /** Extracted first frame as base64 (for display) */
        firstFrameBase64?: string;
        /** Extracted last frame as base64 (for display) */
        lastFrameBase64?: string;
        /** Total frames analyzed for motion */
        framesAnalyzed: number;
    };
    
    /** Raw model response for debugging */
    rawAnalysis?: string;
    
    /** Metadata */
    modelUsed: string;
    analyzedAt: number;
    responseTimeMs: number;
}

export interface VideoIssue {
    /** Severity of the issue */
    severity: 'error' | 'warning' | 'info';
    /** Category of the issue */
    category: 'frame-match' | 'motion' | 'artifact' | 'temporal' | 'prompt' | 'technical';
    /** Human-readable description */
    message: string;
    /** Optional: time range affected (normalized 0-1) */
    timeRange?: { start: number; end: number };
    /** Optional: specific frame number affected */
    frameNumber?: number;
}

export interface VideoAnalysisRequest {
    /** Base64-encoded video as data URL or raw base64 */
    videoBase64: string;
    /** Original start keyframe image (base64, without data URL prefix) */
    startKeyframeBase64?: string;
    /** Original end keyframe image (base64, without data URL prefix) - for bookend mode */
    endKeyframeBase64?: string;
    /** Original prompt used to generate this video */
    originalPrompt: string;
    /** Director's vision statement */
    directorsVision: string;
    /** Scene context for analysis */
    scene: Scene;
    /** Story bible for character/setting reference */
    storyBible: StoryBible;
    /** Whether this is a bookend (first-last frame) video */
    isBookendVideo: boolean;
    /** Optional shot ID for targeted suggestions */
    shotId?: string;
}

export interface FrameComparisonResult {
    /** Similarity score 0-100 */
    similarityScore: number;
    /** Detailed comparison notes */
    notes: string;
    /** Detected differences */
    differences: string[];
}

export interface MotionAnalysisResult {
    /** Motion quality score 0-100 */
    qualityScore: number;
    /** Smoothness rating */
    smoothness: 'excellent' | 'good' | 'fair' | 'poor';
    /** Detected motion issues */
    issues: string[];
    /** Motion description */
    description: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: VisionServiceConfig = {
    providerUrl: import.meta.env.VITE_VISION_LLM_URL || 
                 import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                 'http://192.168.50.192:1234/v1/chat/completions',
    modelId: import.meta.env.VITE_VISION_LLM_MODEL || 'qwen/qwen3-vl-8b',
    timeoutMs: Number(import.meta.env.VITE_VISION_LLM_TIMEOUT_MS || 300000), // 5 minutes default
    temperature: 0.3, // Lower temp for more consistent analysis
};

/** Number of frames to extract for motion analysis (evenly spaced) */
const MOTION_ANALYSIS_FRAME_COUNT = 5;

// ============================================================================
// Frame Extraction Utilities
// ============================================================================

/**
 * Extract frames from a video data URL using HTML5 Video API
 * @param videoDataUrl - Video as data URL (data:video/mp4;base64,...)
 * @param frameCount - Number of frames to extract (evenly spaced)
 * @returns Array of base64-encoded frame images (JPEG)
 */
export async function extractFramesFromVideo(
    videoDataUrl: string,
    frameCount: number = MOTION_ANALYSIS_FRAME_COUNT
): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        
        const frames: string[] = [];
        let currentFrameIndex = 0;
        
        video.onloadedmetadata = () => {
            const duration = video.duration;
            if (!duration || duration === 0) {
                reject(new Error('Video has no duration or failed to load metadata'));
                return;
            }
            
            // Calculate timestamps for evenly spaced frames
            const timestamps: number[] = [];
            for (let i = 0; i < frameCount; i++) {
                // Use 0.1 offset from start/end to avoid edge artifacts
                const progress = frameCount === 1 ? 0.5 : i / (frameCount - 1);
                const timestamp = Math.max(0.1, Math.min(duration - 0.1, duration * progress));
                timestamps.push(timestamp);
            }
            
            const captureFrame = () => {
                if (currentFrameIndex >= timestamps.length) {
                    // All frames captured
                    resolve(frames);
                    return;
                }
                
                const timestamp = timestamps[currentFrameIndex];
                if (timestamp !== undefined) {
                    video.currentTime = timestamp;
                }
            };
            
            video.onseeked = () => {
                try {
                    // Create canvas and capture frame
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }
                    
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    // Convert to base64 JPEG (without data URL prefix)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
                    frames.push(base64);
                    
                    currentFrameIndex++;
                    captureFrame();
                } catch (error) {
                    reject(new Error(`Failed to capture frame: ${error}`));
                }
            };
            
            // Start capturing
            captureFrame();
        };
        
        video.onerror = () => {
            reject(new Error('Failed to load video for frame extraction'));
        };
        
        // Set source and load
        video.src = videoDataUrl;
        video.load();
    });
}

/**
 * Extract just the first and last frames from a video
 */
export async function extractBookendFrames(
    videoDataUrl: string
): Promise<{ firstFrame: string; lastFrame: string }> {
    const frames = await extractFramesFromVideo(videoDataUrl, 2);
    const firstFrame = frames[0];
    const lastFrame = frames[frames.length - 1];
    if (frames.length < 2 || !firstFrame || !lastFrame) {
        throw new Error('Failed to extract both first and last frames');
    }
    return {
        firstFrame,
        lastFrame,
    };
}

// ============================================================================
// Prompt Templates
// ============================================================================

const buildFrameComparisonPrompt = (
    _originalKeyframe: string,
    _extractedFrame: string,
    framePosition: 'start' | 'end',
    context: { directorsVision: string; sceneSummary: string }
): string => {
    return `You are a professional cinematographer and VFX supervisor comparing two images for visual consistency.

## TASK
Compare the ORIGINAL KEYFRAME (reference image) with the EXTRACTED FRAME (from generated video) and evaluate how well they match.

## CONTEXT
- **Frame Position**: This is the ${framePosition === 'start' ? 'FIRST' : 'LAST'} frame of a generated video
- **Director's Vision**: ${context.directorsVision || 'Not provided'}
- **Scene**: ${context.sceneSummary || 'Scene context not provided'}

## IMAGES
1. **Original Keyframe** (Reference): [First image attached]
2. **Extracted Frame** (From Video): [Second image attached]

## EVALUATION CRITERIA
Score each category from 0-100:

1. **Composition Match**: Do camera angle, framing, and layout match?
2. **Character Consistency**: Do characters maintain appearance, pose, and position?
3. **Lighting Match**: Is lighting direction, intensity, and mood consistent?
4. **Background Consistency**: Do environment and background elements match?
5. **Overall Similarity**: Holistic visual similarity score

## OUTPUT FORMAT
Respond with ONLY a valid JSON object (no markdown, no explanation):
{
    "similarityScore": <0-100 overall score>,
    "compositionMatch": <0-100>,
    "characterConsistency": <0-100>,
    "lightingMatch": <0-100>,
    "backgroundConsistency": <0-100>,
    "differences": ["<specific difference 1>", "<specific difference 2>", ...],
    "notes": "<brief explanation of the comparison>"
}`;
};

const buildMotionAnalysisPrompt = (
    prompt: string,
    context: { directorsVision: string; sceneSummary: string }
): string => {
    return `You are a professional film editor and motion graphics expert analyzing video motion quality.

## TASK
Analyze this sequence of frames extracted from a generated video. Evaluate motion quality, temporal coherence, and visual artifacts.

## CONTEXT
- **Original Prompt**: ${prompt}
- **Director's Vision**: ${context.directorsVision || 'Not provided'}
- **Scene**: ${context.sceneSummary || 'Scene context not provided'}

## EVALUATION CRITERIA
Analyze the frame sequence for:

1. **Motion Smoothness**: Are transitions between frames smooth or jerky?
2. **Temporal Coherence**: Do objects/characters maintain consistent appearance across frames?
3. **Artifact Detection**: Look for:
   - Morphing/warping artifacts
   - Flickering or inconsistent lighting
   - Ghosting or trailing effects
   - Unnatural deformations
   - Scene/composition jumps
4. **Prompt Adherence**: Does the motion match what was described in the prompt?

## FRAMES
${Array.from({ length: MOTION_ANALYSIS_FRAME_COUNT }, (_, i) => `- Frame ${i + 1}: [Image ${i + 1} attached]`).join('\n')}

## OUTPUT FORMAT
Respond with ONLY a valid JSON object (no markdown, no explanation):
{
    "qualityScore": <0-100 overall motion quality>,
    "smoothness": "<excellent|good|fair|poor>",
    "temporalCoherence": <0-100>,
    "promptAdherence": <0-100>,
    "issues": ["<detected issue 1>", "<detected issue 2>", ...],
    "description": "<brief description of the motion and any problems>",
    "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>", ...]
}`;
};

// ============================================================================
// Vision LLM API Calls
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
        { correlationId, timestamp: startTime, source: 'video-feedback' },
        'Starting vision LLM call',
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
            { correlationId, timestamp: Date.now(), source: 'video-feedback' },
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
// Core Analysis Functions
// ============================================================================

/**
 * Compare an extracted video frame against the original keyframe
 */
export async function compareFrameToKeyframe(
    originalKeyframe: string,
    extractedFrame: string,
    framePosition: 'start' | 'end',
    context: { directorsVision: string; sceneSummary: string },
    config: VisionServiceConfig = DEFAULT_CONFIG
): Promise<FrameComparisonResult> {
    const correlationId = generateCorrelationId();
    
    const prompt = buildFrameComparisonPrompt(
        originalKeyframe,
        extractedFrame,
        framePosition,
        context
    );
    
    try {
        const response = await callVisionLLM(
            config,
            prompt,
            [originalKeyframe, extractedFrame],
            correlationId
        );
        
        // Parse JSON response
        const parsed = JSON.parse(response);
        
        return {
            similarityScore: parsed.similarityScore ?? 50,
            notes: parsed.notes ?? 'No notes provided',
            differences: parsed.differences ?? [],
        };
    } catch (error) {
        console.error('[VideoFeedback] Frame comparison failed:', error);
        throw error;
    }
}

/**
 * Analyze motion quality across multiple frames
 */
export async function analyzeMotionQuality(
    frames: string[],
    prompt: string,
    context: { directorsVision: string; sceneSummary: string },
    config: VisionServiceConfig = DEFAULT_CONFIG
): Promise<MotionAnalysisResult> {
    const correlationId = generateCorrelationId();
    
    const analysisPrompt = buildMotionAnalysisPrompt(prompt, context);
    
    try {
        const response = await callVisionLLM(
            config,
            analysisPrompt,
            frames,
            correlationId
        );
        
        // Parse JSON response
        const parsed = JSON.parse(response);
        
        return {
            qualityScore: parsed.qualityScore ?? 50,
            smoothness: parsed.smoothness ?? 'fair',
            issues: parsed.issues ?? [],
            description: parsed.description ?? 'No description provided',
        };
    } catch (error) {
        console.error('[VideoFeedback] Motion analysis failed:', error);
        throw error;
    }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a generated video for quality and keyframe matching
 */
export async function analyzeVideo(
    request: VideoAnalysisRequest,
    settings?: LocalGenerationSettings
): Promise<VideoFeedbackResult> {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    
    logCorrelation(
        { correlationId, timestamp: startTime, source: 'video-feedback' },
        'Starting video analysis',
        { 
            sceneId: request.scene.id,
            isBookend: request.isBookendVideo,
            hasStartKeyframe: !!request.startKeyframeBase64,
            hasEndKeyframe: !!request.endKeyframeBase64,
        }
    );
    
    const config = settings 
        ? getVisionConfigFromSettings(settings)
        : DEFAULT_CONFIG;
    
    const issues: VideoIssue[] = [];
    const suggestions: VideoSuggestion[] = [];
    
    try {
        // Step 1: Extract frames from video
        const allFrames = await extractFramesFromVideo(
            request.videoBase64,
            MOTION_ANALYSIS_FRAME_COUNT
        );
        
        if (allFrames.length === 0) {
            throw new Error('Failed to extract any frames from video');
        }
        
        const firstFrame = allFrames[0]!;
        const lastFrame = allFrames[allFrames.length - 1]!;
        
        // Step 2: Compare start frame if keyframe provided
        let startFrameScore = 100; // Default to perfect if no comparison
        if (request.startKeyframeBase64) {
            try {
                const startComparison = await compareFrameToKeyframe(
                    request.startKeyframeBase64,
                    firstFrame,
                    'start',
                    {
                        directorsVision: request.directorsVision,
                        sceneSummary: request.scene.summary || request.scene.title || '',
                    },
                    config
                );
                startFrameScore = startComparison.similarityScore;
                
                // Add issues for significant differences
                if (startComparison.similarityScore < 70) {
                    issues.push({
                        severity: startComparison.similarityScore < 50 ? 'error' : 'warning',
                        category: 'frame-match',
                        message: `Start frame significantly differs from keyframe: ${startComparison.notes}`,
                        frameNumber: 0,
                    });
                    
                    for (const diff of startComparison.differences) {
                        issues.push({
                            severity: 'info',
                            category: 'frame-match',
                            message: `Start frame: ${diff}`,
                            frameNumber: 0,
                        });
                    }
                }
            } catch (error) {
                console.warn('[VideoFeedback] Start frame comparison failed:', error);
                issues.push({
                    severity: 'warning',
                    category: 'technical',
                    message: 'Could not analyze start frame match',
                });
            }
        }
        
        // Step 3: Compare end frame if bookend keyframe provided
        let endFrameScore = 100; // Default to perfect if no comparison
        if (request.isBookendVideo && request.endKeyframeBase64) {
            try {
                const endComparison = await compareFrameToKeyframe(
                    request.endKeyframeBase64,
                    lastFrame,
                    'end',
                    {
                        directorsVision: request.directorsVision,
                        sceneSummary: request.scene.summary || request.scene.title || '',
                    },
                    config
                );
                endFrameScore = endComparison.similarityScore;
                
                // Add issues for significant differences
                if (endComparison.similarityScore < 70) {
                    issues.push({
                        severity: endComparison.similarityScore < 50 ? 'error' : 'warning',
                        category: 'frame-match',
                        message: `End frame significantly differs from keyframe: ${endComparison.notes}`,
                        frameNumber: allFrames.length - 1,
                    });
                    
                    for (const diff of endComparison.differences) {
                        issues.push({
                            severity: 'info',
                            category: 'frame-match',
                            message: `End frame: ${diff}`,
                            frameNumber: allFrames.length - 1,
                        });
                    }
                }
            } catch (error) {
                console.warn('[VideoFeedback] End frame comparison failed:', error);
                issues.push({
                    severity: 'warning',
                    category: 'technical',
                    message: 'Could not analyze end frame match',
                });
            }
        }
        
        // Step 4: Analyze motion quality
        let motionScore = 70; // Default moderate score
        let promptScore = 70;
        try {
            const motionResult = await analyzeMotionQuality(
                allFrames,
                request.originalPrompt,
                {
                    directorsVision: request.directorsVision,
                    sceneSummary: request.scene.summary || request.scene.title || '',
                },
                config
            );
            motionScore = motionResult.qualityScore;
            promptScore = motionScore; // Use motion analysis prompt adherence
            
            // Add motion issues
            for (const issue of motionResult.issues) {
                issues.push({
                    severity: motionScore < 50 ? 'error' : 'warning',
                    category: 'motion',
                    message: issue,
                });
            }
            
            // Map smoothness to severity
            if (motionResult.smoothness === 'poor') {
                issues.push({
                    severity: 'error',
                    category: 'motion',
                    message: 'Video motion quality is poor - consider regenerating with different settings',
                });
            } else if (motionResult.smoothness === 'fair') {
                issues.push({
                    severity: 'warning',
                    category: 'motion',
                    message: 'Video motion quality is fair - some smoothness issues detected',
                });
            }
        } catch (error) {
            console.warn('[VideoFeedback] Motion analysis failed:', error);
            issues.push({
                severity: 'warning',
                category: 'technical',
                message: 'Could not analyze motion quality',
            });
        }
        
        // Step 5: Calculate overall score
        // Weighted average: frame matches are important for bookend, motion is always important
        const weights = request.isBookendVideo
            ? { start: 0.25, end: 0.25, motion: 0.3, prompt: 0.2 }
            : { start: 0.3, end: 0, motion: 0.4, prompt: 0.3 };
        
        const overallScore = Math.round(
            startFrameScore * weights.start +
            endFrameScore * weights.end +
            motionScore * weights.motion +
            promptScore * weights.prompt
        );
        
        // Step 6: Generate suggestions based on issues
        if (startFrameScore < 70 && request.startKeyframeBase64) {
            suggestions.push({
                id: `video-start-frame-${Date.now()}`,
                type: 'video-feedback',
                sceneId: request.scene.id,
                shotId: request.shotId,
                description: 'Consider adjusting the video generation prompt to better match the starting keyframe composition and character positioning.',
                rationale: `Start frame similarity score is ${startFrameScore}/100, indicating significant deviation from the intended keyframe.`,
                impact: 'medium',
                confidence: 0.75,
            });
        }
        
        if (endFrameScore < 70 && request.endKeyframeBase64) {
            suggestions.push({
                id: `video-end-frame-${Date.now()}`,
                type: 'video-feedback',
                sceneId: request.scene.id,
                shotId: request.shotId,
                description: 'Consider regenerating with an adjusted end keyframe or prompt that better guides the video towards the intended final composition.',
                rationale: `End frame similarity score is ${endFrameScore}/100, indicating the video did not reach the intended destination frame.`,
                impact: 'medium',
                confidence: 0.75,
            });
        }
        
        if (motionScore < 60) {
            suggestions.push({
                id: `video-motion-${Date.now()}`,
                type: 'video-feedback',
                sceneId: request.scene.id,
                shotId: request.shotId,
                description: 'Try regenerating with fewer motion steps or a simpler action description to improve motion quality.',
                rationale: `Motion quality score is ${motionScore}/100, suggesting temporal coherence issues.`,
                impact: 'high',
                confidence: 0.7,
            });
        }
        
        // Build summary
        const summaryParts: string[] = [];
        if (request.isBookendVideo) {
            summaryParts.push(`**Keyframe Matching**: Start frame ${startFrameScore}%, End frame ${endFrameScore}%`);
        } else {
            summaryParts.push(`**Keyframe Matching**: Start frame ${startFrameScore}%`);
        }
        summaryParts.push(`**Motion Quality**: ${motionScore}%`);
        summaryParts.push(`**Overall Score**: ${overallScore}%`);
        
        if (issues.length > 0) {
            const errorCount = issues.filter(i => i.severity === 'error').length;
            const warningCount = issues.filter(i => i.severity === 'warning').length;
            summaryParts.push(`**Issues**: ${errorCount} errors, ${warningCount} warnings`);
        } else {
            summaryParts.push('**Issues**: None detected');
        }
        
        const responseTimeMs = Date.now() - startTime;
        
        logCorrelation(
            { correlationId, timestamp: Date.now(), source: 'video-feedback' },
            'Video analysis completed',
            { overallScore, issueCount: issues.length, responseTimeMs }
        );
        
        return {
            sceneId: request.scene.id,
            shotId: request.shotId,
            scores: {
                startFrameMatch: startFrameScore,
                endFrameMatch: endFrameScore,
                motionQuality: motionScore,
                promptAdherence: promptScore,
                overall: overallScore,
            },
            issues,
            suggestions,
            summary: summaryParts.join('\n'),
            frameAnalysis: {
                firstFrameBase64: firstFrame,
                lastFrameBase64: lastFrame,
                framesAnalyzed: allFrames.length,
            },
            modelUsed: config.modelId,
            analyzedAt: Date.now(),
            responseTimeMs,
        };
        
    } catch (error) {
        const responseTimeMs = Date.now() - startTime;
        
        console.error('[VideoFeedback] Analysis failed:', error);
        
        // Return error result
        return {
            sceneId: request.scene.id,
            shotId: request.shotId,
            scores: {
                startFrameMatch: 0,
                endFrameMatch: 0,
                motionQuality: 0,
                promptAdherence: 0,
                overall: 0,
            },
            issues: [{
                severity: 'error',
                category: 'technical',
                message: `Video analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            }],
            suggestions: [],
            summary: `**Analysis Failed**: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
 * Format video feedback result for display
 */
export function formatVideoFeedback(result: VideoFeedbackResult): string {
    const lines: string[] = [
        `## Video Analysis Results`,
        '',
        result.summary,
        '',
    ];
    
    if (result.issues.length > 0) {
        lines.push('### Issues Detected');
        for (const issue of result.issues) {
            const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
            lines.push(`- ${icon} **${issue.category}**: ${issue.message}`);
        }
        lines.push('');
    }
    
    if (result.suggestions.length > 0) {
        lines.push('### Suggestions');
        for (const suggestion of result.suggestions) {
            lines.push(`- ${suggestion.description}`);
            lines.push(`  _Rationale: ${suggestion.rationale}_`);
        }
        lines.push('');
    }
    
    lines.push(`_Analyzed at ${new Date(result.analyzedAt).toLocaleString()} using ${result.modelUsed} (${result.responseTimeMs}ms)_`);
    
    return lines.join('\n');
}

/**
 * Check if a video analysis result indicates acceptable quality
 */
export function isVideoQualityAcceptable(
    result: VideoFeedbackResult,
    thresholds: {
        minOverall?: number;
        minFrameMatch?: number;
        minMotion?: number;
        maxErrors?: number;
    } = {}
): boolean {
    const {
        minOverall = 60,
        minFrameMatch = 50,
        minMotion = 50,
        maxErrors = 2,
    } = thresholds;
    
    const errorCount = result.issues.filter(i => i.severity === 'error').length;
    
    return (
        result.scores.overall >= minOverall &&
        result.scores.startFrameMatch >= minFrameMatch &&
        result.scores.endFrameMatch >= minFrameMatch &&
        result.scores.motionQuality >= minMotion &&
        errorCount <= maxErrors
    );
}
