/**
 * Prompt Pipeline Service
 * 
 * Orchestrates prompt generation for the Story → Video pipeline.
 * Ensures token budget compliance, character descriptor synchronization,
 * and structured output for ComfyUI workflows.
 * 
 * Key responsibilities:
 * - Build ComfyUI-compatible prompts from Story Bible + timeline data
 * - Synchronize character visual descriptors across scenes
 * - Validate entire prompt chain before execution
 * - Apply token truncation with priority preservation
 */

import { 
    StoryBible, 
    StoryBibleV2, 
    Scene, 
    Shot, 
    ShotEnhancers,
    CharacterProfile,
    VisualBibleCharacter,
    isStoryBibleV2,
} from '../types';
import { 
    estimateTokens, 
    truncateToTokenLimit,
    DEFAULT_TOKEN_BUDGETS,
    type CharacterPromptConfig,
} from './promptRegistry';

/**
 * Prompt components used to build the final ComfyUI prompt
 */
export interface PromptComponents {
    /** Scene context and mood */
    sceneContext: string;
    /** Character visual descriptors present in the shot */
    characterDescriptors: string[];
    /** Shot-specific visual direction */
    shotDirection: string;
    /** Director's vision styling */
    styleDirectives: string;
    /** Negative prompts to avoid */
    negativePrompts: string[];
}

/**
 * Assembled prompt ready for ComfyUI injection
 */
export interface ComfyUIPrompt {
    /** Primary positive prompt */
    positive: string;
    /** Negative prompt */
    negative: string;
    /** Token counts */
    tokens: {
        positive: number;
        negative: number;
        total: number;
    };
    /** Whether the prompt passed token budget validation */
    withinBudget: boolean;
    /** Validation warnings (non-blocking) */
    warnings: string[];
}

/**
 * Character descriptor synchronization result
 */
export interface SyncResult {
    /** Updated visual descriptors by character ID */
    descriptors: Map<string, string>;
    /** Characters that were synchronized */
    synchronized: string[];
    /** Characters missing descriptors */
    missing: string[];
}

/**
 * Prompt chain validation result
 */
export interface PromptChainValidation {
    /** Whether the entire chain is valid */
    valid: boolean;
    /** Total tokens across all shots */
    totalTokens: number;
    /** Maximum tokens in a single shot */
    maxShotTokens: number;
    /** Shots exceeding budget */
    oversizedShots: string[];
    /** Validation messages */
    messages: string[];
}

/**
 * Builds a ComfyUI-compatible prompt from scene and shot data.
 * 
 * @param storyBible - The story bible containing narrative context
 * @param scene - The current scene being processed
 * @param shot - The specific shot to generate prompt for
 * @param directorsVision - Director's visual styling guidance
 * @param negativePrompts - List of elements to avoid
 * @param maxTokens - Maximum tokens for the positive prompt (default: 500)
 */
export function buildComfyUIPrompt(
    storyBible: StoryBible,
    scene: Scene,
    shot: Shot,
    directorsVision: string,
    negativePrompts: string[] = [],
    maxTokens: number = DEFAULT_TOKEN_BUDGETS.comfyuiShot,
    shotEnhancers?: ShotEnhancers
): ComfyUIPrompt {
    const warnings: string[] = [];
    
    // Extract character descriptors if available
    const characterDescriptors = getCharacterDescriptorsForShot(storyBible, shot);
    
    // Build components
    const components = buildPromptComponents(
        scene,
        shot,
        directorsVision,
        negativePrompts,
        characterDescriptors,
        shotEnhancers
    );
    
    // Assemble positive prompt with priority ordering
    // Priority: Shot direction > Character descriptors > Style > Scene context
    const positiveSegments = [
        components.shotDirection,
        ...components.characterDescriptors,
        components.styleDirectives,
        components.sceneContext,
    ].filter(Boolean);
    
    let positivePrompt = positiveSegments.join(', ');
    
    // Check token budget and truncate if needed
    const positiveTokens = estimateTokens(positivePrompt);
    if (positiveTokens > maxTokens) {
        warnings.push(`Positive prompt exceeded budget (${positiveTokens}/${maxTokens} tokens). Truncated.`);
        const truncated = truncateToTokenLimit(positivePrompt, maxTokens);
        positivePrompt = truncated.text;
    }
    
    // Build negative prompt
    const negativePrompt = components.negativePrompts.join(', ');
    const negativeTokens = estimateTokens(negativePrompt);
    
    const finalPositiveTokens = estimateTokens(positivePrompt);
    
    return {
        positive: positivePrompt,
        negative: negativePrompt,
        tokens: {
            positive: finalPositiveTokens,
            negative: negativeTokens,
            total: finalPositiveTokens + negativeTokens,
        },
        withinBudget: finalPositiveTokens <= maxTokens,
        warnings,
    };
}

/**
 * Builds the individual prompt components before assembly.
 */
function buildPromptComponents(
    scene: Scene,
    shot: Shot,
    directorsVision: string,
    negativePrompts: string[],
    characterDescriptors: string[],
    shotEnhancers?: ShotEnhancers
): PromptComponents {
    // Extract scene context (truncate to fit budget)
    const sceneContextResult = truncateToTokenLimit(
        `${scene.summary}`,
        DEFAULT_TOKEN_BUDGETS.plotScene
    );
    const sceneContext = sceneContextResult.text;
    
    // Get enhancers for this specific shot
    const enhancers = shotEnhancers?.[shot.id];
    
    // Build shot direction from description and enhancers
    let shotDirection = shot.description || '';
    if (enhancers) {
        const enhancerParts: string[] = [];
        if (enhancers.framing?.length) {
            enhancerParts.push(enhancers.framing.join(', '));
        }
        if (enhancers.lighting?.length) {
            enhancerParts.push(enhancers.lighting.join(', '));
        }
        if (enhancers.movement?.length) {
            enhancerParts.push(enhancers.movement.join(', '));
        }
        if (enhancers.mood?.length) {
            enhancerParts.push(enhancers.mood.join(', '));
        }
        if (enhancerParts.length > 0) {
            shotDirection = `${shotDirection}, ${enhancerParts.join(', ')}`;
        }
    }
    
    // Extract style directives from director's vision
    const styleResult = truncateToTokenLimit(
        directorsVision,
        Math.floor(DEFAULT_TOKEN_BUDGETS.comfyuiShot / 4) // Allocate ~25% of budget to style
    );
    const styleDirectives = styleResult.text;
    
    // Add default negative prompts if none provided
    const defaultNegatives = [
        'blurry',
        'low quality',
        'distorted',
        'watermark',
        'text overlay',
    ];
    const finalNegatives = negativePrompts.length > 0 
        ? negativePrompts 
        : defaultNegatives;
    
    return {
        sceneContext,
        characterDescriptors,
        shotDirection,
        styleDirectives,
        negativePrompts: finalNegatives,
    };
}

/**
 * Extracts character visual descriptors relevant to a shot.
 * Looks for character mentions in shot description and maps to visual descriptors.
 */
function getCharacterDescriptorsForShot(
    storyBible: StoryBible,
    shot: Shot
): string[] {
    const descriptors: string[] = [];
    
    if (!isStoryBibleV2(storyBible)) {
        // For V1 bibles, we can't extract structured descriptors
        // Return empty array - shot will rely on scene context
        return descriptors;
    }
    
    const bible = storyBible as StoryBibleV2;
    if (!bible.characterProfiles?.length) {
        return descriptors;
    }
    
    // Look for character names in the shot description
    const shotText = (shot.description || '').toLowerCase();
    
    for (const profile of bible.characterProfiles) {
        if (!profile.visualDescriptor) continue;
        
        const nameLower = profile.name.toLowerCase();
        // Check if character name appears in shot description
        if (shotText.includes(nameLower)) {
            descriptors.push(profile.visualDescriptor);
        }
    }
    
    // If no specific characters found, include protagonist descriptor for consistency
    if (descriptors.length === 0) {
        const protagonist = bible.characterProfiles.find(p => p.role === 'protagonist');
        if (protagonist?.visualDescriptor) {
            descriptors.push(protagonist.visualDescriptor);
        }
    }
    
    return descriptors;
}

/**
 * Synchronizes character descriptors between Story Bible and Visual Bible.
 * 
 * This ensures that VisualBibleCharacter entries are linked to their
 * corresponding CharacterProfile entries via storyBibleCharacterId.
 * 
 * @param storyBible - The Story Bible with character profiles
 * @param visualCharacters - The visual bible characters to sync
 */
export function syncCharacterDescriptors(
    storyBible: StoryBible,
    visualCharacters: VisualBibleCharacter[]
): SyncResult {
    const descriptors = new Map<string, string>();
    const synchronized: string[] = [];
    const missing: string[] = [];
    
    if (!isStoryBibleV2(storyBible)) {
        // For V1 bibles, we can't sync structured character data
        return { descriptors, synchronized, missing };
    }
    
    const bible = storyBible as StoryBibleV2;
    if (!bible.characterProfiles?.length) {
        return { descriptors, synchronized, missing };
    }
    
    // Build lookup map for story bible characters
    const profileMap = new Map<string, CharacterProfile>();
    for (const profile of bible.characterProfiles) {
        profileMap.set(profile.id, profile);
        profileMap.set(profile.name.toLowerCase(), profile);
    }
    
    // Sync each visual character
    for (const visual of visualCharacters) {
        let matched = false;
        
        // Try to match by storyBibleCharacterId first
        if (visual.storyBibleCharacterId) {
            const profile = profileMap.get(visual.storyBibleCharacterId);
            if (profile?.visualDescriptor) {
                descriptors.set(visual.id, profile.visualDescriptor);
                synchronized.push(visual.name);
                matched = true;
            }
        }
        
        // Fall back to name matching
        if (!matched) {
            const profile = profileMap.get(visual.name.toLowerCase());
            if (profile?.visualDescriptor) {
                descriptors.set(visual.id, profile.visualDescriptor);
                synchronized.push(visual.name);
                matched = true;
            }
        }
        
        if (!matched) {
            missing.push(visual.name);
        }
    }
    
    return { descriptors, synchronized, missing };
}

/**
 * Validates an entire prompt chain (all shots in a timeline).
 * 
 * @param storyBible - The story bible
 * @param scene - The scene containing the timeline
 * @param directorsVision - Director's visual styling
 * @param negativePrompts - Negative prompts to include
 * @param maxTotalTokens - Optional max total tokens across all shots
 */
export function validatePromptChain(
    storyBible: StoryBible,
    scene: Scene,
    directorsVision: string,
    negativePrompts: string[] = [],
    maxTotalTokens?: number
): PromptChainValidation {
    const messages: string[] = [];
    const oversizedShots: string[] = [];
    let totalTokens = 0;
    let maxShotTokens = 0;
    
    const timeline = scene.timeline;
    if (!timeline?.shots?.length) {
        return {
            valid: true,
            totalTokens: 0,
            maxShotTokens: 0,
            oversizedShots: [],
            messages: ['No shots to validate'],
        };
    }
    
    for (const shot of timeline.shots) {
        const prompt = buildComfyUIPrompt(
            storyBible,
            scene,
            shot,
            directorsVision,
            negativePrompts
        );
        
        totalTokens += prompt.tokens.total;
        maxShotTokens = Math.max(maxShotTokens, prompt.tokens.positive);
        
        if (!prompt.withinBudget) {
            oversizedShots.push(shot.id);
            messages.push(`Shot ${shot.id}: Exceeds token budget (${prompt.tokens.positive}/${DEFAULT_TOKEN_BUDGETS.comfyuiShot})`);
        }
        
        if (prompt.warnings.length > 0) {
            messages.push(...prompt.warnings.map(w => `Shot ${shot.id}: ${w}`));
        }
    }
    
    // Check total budget if specified
    if (maxTotalTokens && totalTokens > maxTotalTokens) {
        messages.push(`Total tokens (${totalTokens}) exceeds chain budget (${maxTotalTokens})`);
    }
    
    const valid = oversizedShots.length === 0 && 
                  (!maxTotalTokens || totalTokens <= maxTotalTokens);
    
    return {
        valid,
        totalTokens,
        maxShotTokens,
        oversizedShots,
        messages,
    };
}

/**
 * Builds a character-focused prompt configuration for ControlNet/VAE workflows.
 * 
 * @param profile - The character profile from Story Bible
 */
export function buildCharacterPromptConfig(
    profile: CharacterProfile
): CharacterPromptConfig {
    // Build visual descriptor from structured data if not already provided
    let visualDescriptor = profile.visualDescriptor || '';
    
    if (!visualDescriptor && profile.appearance) {
        const parts: string[] = [];
        if (profile.appearance.height) parts.push(profile.appearance.height);
        if (profile.appearance.build) parts.push(profile.appearance.build);
        if (profile.appearance.hair) parts.push(profile.appearance.hair);
        if (profile.appearance.eyes) parts.push(profile.appearance.eyes);
        visualDescriptor = parts.join(', ');
    }
    
    return {
        characterId: profile.id,
        visualDescriptor,
        identityEmbedding: undefined, // Placeholder for future ControlNet integration
        ipAdapterWeight: undefined,
        faceEncodingRef: undefined,
    };
}

/**
 * Generates a summary of prompt statistics for a scene.
 */
export function getPromptStatistics(
    storyBible: StoryBible,
    scene: Scene,
    directorsVision: string
): {
    shotCount: number;
    avgTokensPerShot: number;
    maxTokens: number;
    minTokens: number;
    budgetCompliance: number; // Percentage of shots within budget
} {
    const timeline = scene.timeline;
    if (!timeline?.shots?.length) {
        return {
            shotCount: 0,
            avgTokensPerShot: 0,
            maxTokens: 0,
            minTokens: 0,
            budgetCompliance: 100,
        };
    }
    
    const tokenCounts: number[] = [];
    let withinBudget = 0;
    
    for (const shot of timeline.shots) {
        const prompt = buildComfyUIPrompt(storyBible, scene, shot, directorsVision);
        tokenCounts.push(prompt.tokens.positive);
        if (prompt.withinBudget) withinBudget++;
    }
    
    const total = tokenCounts.reduce((a, b) => a + b, 0);
    
    return {
        shotCount: timeline.shots.length,
        avgTokensPerShot: Math.round(total / tokenCounts.length),
        maxTokens: Math.max(...tokenCounts),
        minTokens: Math.min(...tokenCounts),
        budgetCompliance: Math.round((withinBudget / tokenCounts.length) * 100),
    };
}

export default {
    buildComfyUIPrompt,
    syncCharacterDescriptors,
    validatePromptChain,
    buildCharacterPromptConfig,
    getPromptStatistics,
};
