/**
 * Temporal Context Service
 * 
 * Auto-generates start/end moment descriptions for the bookend workflow.
 * Uses LLM to extract narrative-significant moments from scene descriptions.
 * 
 * @module services/temporalContextService
 */

import { Scene, LocalGenerationSettings } from '../types';
import { sendLLMRequest, LLMRequest } from './llmTransportAdapter';

/**
 * Temporal context for bookend keyframe generation.
 * Describes the start and end moments of a scene.
 */
export interface TemporalContext {
    /** Description of the scene's opening moment */
    startMoment: string;
    /** Description of the scene's closing moment */
    endMoment: string;
    /** Estimated scene duration in seconds (optional) */
    duration?: number;
}

/**
 * Result from temporal context generation
 */
export interface TemporalContextResult {
    success: boolean;
    context?: TemporalContext;
    error?: string;
}

/**
 * Prompt template for generating temporal context from scene summary.
 * Optimized for extracting visually distinct start/end moments.
 */
const TEMPORAL_CONTEXT_PROMPT = `You are analyzing a scene description to identify the START and END moments for video generation.

The START moment should capture the scene's initial state - what we see at the beginning.
The END moment should capture the scene's resolution or transition point - what changes by the end.

Both moments must be:
1. Visually distinct (not just emotional changes)
2. Concrete and specific (describe what we SEE, not what characters FEEL)
3. Brief (15-25 words each)
4. Present-tense descriptions

Scene Description:
{SCENE_SUMMARY}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "startMoment": "Description of the opening visual moment",
  "endMoment": "Description of the closing visual moment",
  "duration": 5
}`;

/**
 * Generate temporal context from a scene's summary.
 * Uses LLM to extract visually significant start/end moments.
 * 
 * @param scene - The scene to analyze
 * @param settings - Local generation settings for LLM configuration
 * @returns TemporalContextResult with generated context or error
 */
export async function generateTemporalContext(
    scene: Scene,
    settings: LocalGenerationSettings
): Promise<TemporalContextResult> {
    console.log(`[TemporalContext] Generating for scene ${scene.id}: "${scene.summary.slice(0, 50)}..."`);
    
    if (!scene.summary || scene.summary.trim().length === 0) {
        return {
            success: false,
            error: 'Scene summary is empty. Cannot generate temporal context.',
        };
    }
    
    // Build prompt
    const prompt = TEMPORAL_CONTEXT_PROMPT.replace('{SCENE_SUMMARY}', scene.summary);
    
    try {
        // Use LLM transport adapter for consistent provider handling
        const request: LLMRequest = {
            model: settings.llmModel || 'default',
            messages: [
                { role: 'system', content: 'You are a video production assistant that analyzes scenes for keyframe generation.' },
                { role: 'user', content: prompt }
            ],
            responseFormat: 'json',
            temperature: 0.3, // Low temperature for consistent extraction
            maxTokens: 200,   // Response should be short
            metadata: {
                context: `temporal-context-${scene.id}`,
            }
        };
        
        const response = await sendLLMRequest(request);
        
        // Parse JSON response
        const content = response.text?.trim();
        if (!content) {
            return {
                success: false,
                error: 'Empty response from LLM',
            };
        }
        
        // Extract JSON from response (handle potential markdown wrapping)
        let jsonContent = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonContent = jsonMatch[1] || content;
        }
        
        // Try to find JSON object in response
        const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (!jsonObjectMatch) {
            console.error(`[TemporalContext] No JSON object found in response:`, content.slice(0, 200));
            return {
                success: false,
                error: 'Failed to parse temporal context: No JSON found in response',
            };
        }
        
        const parsed = JSON.parse(jsonObjectMatch[0]);
        
        // Validate required fields
        if (!parsed.startMoment || typeof parsed.startMoment !== 'string') {
            return {
                success: false,
                error: 'Missing or invalid startMoment in response',
            };
        }
        
        if (!parsed.endMoment || typeof parsed.endMoment !== 'string') {
            return {
                success: false,
                error: 'Missing or invalid endMoment in response',
            };
        }
        
        const context: TemporalContext = {
            startMoment: parsed.startMoment.trim(),
            endMoment: parsed.endMoment.trim(),
            duration: typeof parsed.duration === 'number' ? parsed.duration : 5,
        };
        
        console.log(`[TemporalContext] Generated for scene ${scene.id}:`);
        console.log(`  Start: "${context.startMoment}"`);
        console.log(`  End: "${context.endMoment}"`);
        console.log(`  Duration: ${context.duration}s`);
        
        return {
            success: true,
            context,
        };
        
    } catch (error) {
        console.error(`[TemporalContext] Error generating context:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error generating temporal context',
        };
    }
}

/**
 * Generate temporal context for multiple scenes in batch.
 * Processes sequentially to avoid overwhelming the LLM.
 * 
 * @param scenes - Array of scenes to process
 * @param settings - Local generation settings
 * @returns Map of scene ID to TemporalContextResult
 */
export async function generateTemporalContextBatch(
    scenes: Scene[],
    settings: LocalGenerationSettings
): Promise<Map<string, TemporalContextResult>> {
    const results = new Map<string, TemporalContextResult>();
    
    for (const scene of scenes) {
        // Skip scenes that already have temporal context
        if (scene.temporalContext?.startMoment && scene.temporalContext?.endMoment) {
            console.log(`[TemporalContext] Scene ${scene.id} already has context, skipping`);
            results.set(scene.id, {
                success: true,
                context: scene.temporalContext,
            });
            continue;
        }
        
        const result = await generateTemporalContext(scene, settings);
        results.set(scene.id, result);
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
}

/**
 * Extract temporal context from scene description using simple heuristics.
 * Fallback when LLM is unavailable or for quick testing.
 * 
 * @param scene - Scene to extract context from
 * @returns TemporalContext with heuristically generated moments
 */
export function extractTemporalContextHeuristic(scene: Scene): TemporalContext {
    const summary = scene.summary || '';
    
    // Simple heuristic: use first sentence for start, last sentence for end
    const sentences = summary
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10);
    
    const startMoment = sentences[0] 
        ? `Opening: ${sentences[0].slice(0, 60)}`
        : 'Scene begins';
    
    const endMoment = sentences.length > 1 
        ? `Closing: ${sentences[sentences.length - 1]?.slice(0, 60)}`
        : 'Scene ends';
    
    return {
        startMoment,
        endMoment,
        duration: 5, // Default duration
    };
}
