/**
 * Prompt Scheduling Service (Phase 5 - Temporal Coherence Enhancement)
 * 
 * Provides prompt scheduling for smooth scene transitions in video generation.
 * Allows gradual blending between prompts over multiple frames to create
 * smoother visual transitions.
 * 
 * This is an experimental feature that can be enabled via feature flags:
 * - promptScheduling: boolean - Master enable switch
 * - promptTransitionFrames: number - Number of frames to blend prompts
 * 
 * ComfyUI supports prompt scheduling via:
 * - Weighted prompts at specific frame ranges
 * - Prompt interpolation nodes
 * - Conditioning blend nodes
 * 
 * @module services/promptSchedulingService
 */

import type { LocalGenerationSettings } from '../types';
import { getFeatureFlag } from '../utils/featureFlags';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A scheduled prompt segment
 */
export interface PromptSegment {
    /** Frame index where this prompt starts (0-indexed) */
    startFrame: number;
    
    /** Frame index where this prompt ends (exclusive) */
    endFrame: number;
    
    /** The prompt text for this segment */
    prompt: string;
    
    /** Optional weight for this segment (0.0-1.0) */
    weight?: number;
    
    /** Transition type to next segment */
    transitionType?: 'cut' | 'blend' | 'fade';
}

/**
 * Prompt schedule for a video generation
 */
export interface PromptSchedule {
    /** Total frame count for the video */
    totalFrames: number;
    
    /** Ordered list of prompt segments */
    segments: PromptSegment[];
    
    /** Default transition duration in frames */
    defaultTransitionFrames: number;
    
    /** Base/fallback prompt used throughout */
    basePrompt?: string;
    
    /** Negative prompt (constant throughout) */
    negativePrompt?: string;
}

/**
 * Configuration for prompt scheduling
 */
export interface PromptScheduleConfig {
    /** Whether prompt scheduling is enabled */
    enabled: boolean;
    
    /** Number of frames for transitions between prompts */
    transitionFrames: number;
    
    /** Transition easing type */
    easing: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
}

/**
 * Default prompt schedule configuration
 */
export const DEFAULT_SCHEDULE_CONFIG: PromptScheduleConfig = {
    enabled: false,
    transitionFrames: 8,
    easing: 'ease_in_out',
};

/**
 * ComfyUI prompt schedule format
 * Format: "prompt text :frameStart-frameEnd"
 */
export interface ComfyUIPromptScheduleEntry {
    text: string;
    frameRange: [number, number];
    weight: number;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Check if prompt scheduling is enabled in settings
 */
export function isPromptSchedulingEnabled(settings: LocalGenerationSettings): boolean {
    const flags = settings.featureFlags;
    return getFeatureFlag(flags, 'promptScheduling');
}

/**
 * Get prompt scheduling configuration from settings
 */
export function getScheduleConfig(settings: LocalGenerationSettings): PromptScheduleConfig {
    const flags = settings.featureFlags;
    
    // Get transition frames with proper type coercion
    const transitionFrames = flags?.promptTransitionFrames;
    
    return {
        enabled: getFeatureFlag(flags, 'promptScheduling'),
        transitionFrames: typeof transitionFrames === 'number' ? transitionFrames : DEFAULT_SCHEDULE_CONFIG.transitionFrames,
        easing: 'ease_in_out', // Currently fixed; could be made configurable
    };
}

/**
 * Create a simple two-segment schedule for scene transitions
 * 
 * This is the most common use case: transitioning from a start description
 * to an end description over the course of a video.
 * 
 * @param startPrompt - Prompt describing the start state
 * @param endPrompt - Prompt describing the end state
 * @param totalFrames - Total number of frames in the video
 * @param config - Schedule configuration
 */
export function createTransitionSchedule(
    startPrompt: string,
    endPrompt: string,
    totalFrames: number,
    config: PromptScheduleConfig
): PromptSchedule {
    const transitionStart = Math.floor(totalFrames * 0.4);
    const transitionEnd = Math.min(transitionStart + config.transitionFrames, totalFrames);
    
    return {
        totalFrames,
        defaultTransitionFrames: config.transitionFrames,
        segments: [
            {
                startFrame: 0,
                endFrame: transitionStart,
                prompt: startPrompt,
                weight: 1.0,
                transitionType: 'blend',
            },
            {
                startFrame: transitionStart,
                endFrame: transitionEnd,
                prompt: `${startPrompt}, transitioning to ${endPrompt}`,
                weight: 0.5,
                transitionType: 'blend',
            },
            {
                startFrame: transitionEnd,
                endFrame: totalFrames,
                prompt: endPrompt,
                weight: 1.0,
                transitionType: 'cut',
            },
        ],
    };
}

/**
 * Create a bookend schedule for first-last-frame video
 * 
 * For FLF2V workflows, we want the prompt to describe the journey
 * from the start keyframe to the end keyframe.
 * 
 * @param startMoment - Description of the starting moment/state
 * @param endMoment - Description of the ending moment/state
 * @param motionDescription - Description of the motion/action
 * @param totalFrames - Total number of frames
 * @param config - Schedule configuration
 */
export function createBookendSchedule(
    startMoment: string,
    endMoment: string,
    motionDescription: string,
    totalFrames: number,
    config: PromptScheduleConfig
): PromptSchedule {
    // For bookend videos, we typically want:
    // 1. Start: Focus on start state
    // 2. Middle: Focus on motion/action
    // 3. End: Focus on end state
    
    const phase1End = Math.floor(totalFrames * 0.25);
    const phase2End = Math.floor(totalFrames * 0.75);
    
    return {
        totalFrames,
        defaultTransitionFrames: config.transitionFrames,
        segments: [
            {
                startFrame: 0,
                endFrame: phase1End,
                prompt: `${startMoment}, beginning ${motionDescription}`,
                weight: 1.0,
                transitionType: 'blend',
            },
            {
                startFrame: phase1End,
                endFrame: phase2End,
                prompt: motionDescription,
                weight: 1.0,
                transitionType: 'blend',
            },
            {
                startFrame: phase2End,
                endFrame: totalFrames,
                prompt: `${motionDescription}, reaching ${endMoment}`,
                weight: 1.0,
                transitionType: 'cut',
            },
        ],
    };
}

/**
 * Convert schedule to ComfyUI prompt schedule format
 * 
 * ComfyUI uses a specific syntax for prompt scheduling:
 * "prompt text" :frameStart-frameEnd
 * 
 * @param schedule - The prompt schedule to convert
 * @returns Array of ComfyUI-formatted prompt schedule entries
 */
export function toComfyUIScheduleFormat(
    schedule: PromptSchedule
): ComfyUIPromptScheduleEntry[] {
    return schedule.segments.map(segment => ({
        text: segment.prompt,
        frameRange: [segment.startFrame, segment.endFrame],
        weight: segment.weight ?? 1.0,
    }));
}

/**
 * Format schedule as ComfyUI prompt string with frame markers
 * 
 * Some ComfyUI nodes accept prompts with inline frame scheduling:
 * "early content" :0-20 AND "later content" :21-81
 */
export function formatAsScheduledPrompt(schedule: PromptSchedule): string {
    const parts = schedule.segments.map(segment => {
        const frameSpec = `:${segment.startFrame}-${segment.endFrame - 1}`;
        return `"${segment.prompt}" ${frameSpec}`;
    });
    
    return parts.join(' AND ');
}

/**
 * Create a simple constant schedule (no transitions)
 * Used when prompt scheduling is disabled but a schedule object is needed
 */
export function createConstantSchedule(
    prompt: string,
    totalFrames: number,
    negativePrompt?: string
): PromptSchedule {
    return {
        totalFrames,
        defaultTransitionFrames: 0,
        basePrompt: prompt,
        negativePrompt,
        segments: [
            {
                startFrame: 0,
                endFrame: totalFrames,
                prompt,
                weight: 1.0,
                transitionType: 'cut',
            },
        ],
    };
}

/**
 * Calculate eased weight for frame-based blending
 * 
 * @param t - Progress value (0.0-1.0)
 * @param easing - Easing type
 * @returns Eased weight value
 */
export function calculateEasedWeight(
    t: number,
    easing: PromptScheduleConfig['easing']
): number {
    // Clamp t to [0, 1]
    t = Math.max(0, Math.min(1, t));
    
    switch (easing) {
        case 'linear':
            return t;
        case 'ease_in':
            return t * t;
        case 'ease_out':
            return 1 - (1 - t) * (1 - t);
        case 'ease_in_out':
            return t < 0.5 
                ? 2 * t * t 
                : 1 - Math.pow(-2 * t + 2, 2) / 2;
        default:
            return t;
    }
}

/**
 * Get interpolated prompt weights at a specific frame
 * 
 * For blended transitions, this calculates the weights of overlapping prompts
 * at a given frame position.
 * 
 * @param schedule - The prompt schedule
 * @param frame - The frame index to calculate weights for
 * @param config - Schedule configuration
 * @returns Map of segment index to weight
 */
export function getWeightsAtFrame(
    schedule: PromptSchedule,
    frame: number,
    config: PromptScheduleConfig
): Map<number, number> {
    const weights = new Map<number, number>();
    
    for (let i = 0; i < schedule.segments.length; i++) {
        const segment = schedule.segments[i];
        if (!segment) continue;
        
        if (frame >= segment.startFrame && frame < segment.endFrame) {
            weights.set(i, segment.weight ?? 1.0);
        }
        
        // Check for blend transitions
        if (segment.transitionType === 'blend' && i < schedule.segments.length - 1) {
            const nextSegment = schedule.segments[i + 1];
            if (!nextSegment) continue;
            
            const transitionStart = segment.endFrame - config.transitionFrames;
            
            if (frame >= transitionStart && frame < segment.endFrame) {
                const progress = (frame - transitionStart) / config.transitionFrames;
                const easedProgress = calculateEasedWeight(progress, config.easing);
                
                // Blend: current segment fades out, next segment fades in
                weights.set(i, (segment.weight ?? 1.0) * (1 - easedProgress));
                weights.set(i + 1, (nextSegment.weight ?? 1.0) * easedProgress);
            }
        }
    }
    
    return weights;
}

/**
 * Validate a prompt schedule
 */
export function validateSchedule(schedule: PromptSchedule): {
    valid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (schedule.segments.length === 0) {
        errors.push('Schedule has no segments');
    }
    
    // Check for gaps and overlaps
    let lastEnd = 0;
    for (let i = 0; i < schedule.segments.length; i++) {
        const segment = schedule.segments[i];
        if (!segment) continue;
        
        if (segment.startFrame > lastEnd) {
            warnings.push(`Gap between frames ${lastEnd} and ${segment.startFrame}`);
        }
        
        if (segment.startFrame >= segment.endFrame) {
            errors.push(`Segment ${i} has invalid frame range: ${segment.startFrame}-${segment.endFrame}`);
        }
        
        if (segment.endFrame > schedule.totalFrames) {
            warnings.push(`Segment ${i} extends beyond total frames`);
        }
        
        lastEnd = segment.endFrame;
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Log prompt schedule for diagnostics
 */
export function logSchedule(schedule: PromptSchedule, context: string = 'unknown'): void {
    console.log(`[PromptSchedulingService] ${context}: Schedule with ${schedule.segments.length} segments`);
    for (const segment of schedule.segments) {
        console.log(`  [${segment.startFrame}-${segment.endFrame}] ${segment.prompt.substring(0, 50)}...`);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const promptSchedulingService = {
    isPromptSchedulingEnabled,
    getScheduleConfig,
    createTransitionSchedule,
    createBookendSchedule,
    createConstantSchedule,
    toComfyUIScheduleFormat,
    formatAsScheduledPrompt,
    calculateEasedWeight,
    getWeightsAtFrame,
    validateSchedule,
    logSchedule,
};

export default promptSchedulingService;
