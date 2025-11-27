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
    VisualBible,
    isStoryBibleV2,
} from '../types';
import { 
    estimateTokens, 
    truncateToTokenLimit,
    DEFAULT_TOKEN_BUDGETS,
    type CharacterPromptConfig,
} from './promptRegistry';
import {
    getFeatureFlagValue,
    loadFeatureFlags,
    type FeatureFlags,
} from '../utils/featureFlags';
import {
    getNegativePreset,
    getQualityConfig,
    type ProviderId,
    type QualityPrefixVariant,
} from './promptConstants';
import { applyWeight, WEIGHTING_PRESETS, isWeightingSupported, getWeightingPreset, DEFAULT_WEIGHTING_PRESET, type WeightingPresetName } from './promptWeighting';
import {
    validateTokenBudget as validateTokenBudgetGuard,
    type TokenValidationResult,
} from '../utils/pipelineContext';
import {
    guardTokenBudget,
    heuristicTokenEstimate,
    getTokenProviderFromId,
    type TokenCountApi,
    type ApiLogCallback,
} from './tokenValidator';

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
 * Assembled prompt ready for provider-specific consumption.
 * Supports both inline (Gemini) and separate (ComfyUI) formats.
 */
export interface AssembledPrompt {
    /** Combined format: "${positive}\n\nNEGATIVE PROMPT:\n${negative}" */
    inlineFormat: string;
    /** Separate positive/negative for ComfyUI workflows */
    separateFormat: {
        positive: string;
        negative: string;
    };
    /** Merged and deduplicated negative prompt */
    mergedNegative: string;
    /** Token counts for budget tracking */
    tokens: {
        positive: number;
        negative: number;
        total: number;
    };
    /** Token budget validation result (if guard enabled) */
    tokenValidation?: TokenValidationResult;
    /** Token budget warning (if validateTokens was enabled and budget exceeded) */
    tokenWarning?: string;
    /** Assembly warnings (non-blocking) */
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
    /** Characters skipped due to user edits (descriptorSource='userEdit') */
    skippedUserEdits: string[];
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
 * Extract top character descriptors for a scene summary.
 * Prioritizes protagonist/supporting roles and limits to two entries.
 */
function getCharacterDescriptorsForScene(
    scene: Scene,
    storyBible: StoryBible,
    perCharacterBudget: number
): string[] {
    if (!isStoryBibleV2(storyBible)) {
        return [];
    }

    const bible = storyBible as StoryBibleV2;
    const sceneText = (scene.summary || '').toLowerCase();

    const relevant = (bible.characterProfiles || [])
        .filter(profile => profile.visualDescriptor && sceneText.includes(profile.name.toLowerCase()))
        .sort((a, b) => {
            const order = { protagonist: 0, supporting: 1, antagonist: 2, background: 3 } as const;
            const aOrder = order[a.role as keyof typeof order] ?? 3;
            const bOrder = order[b.role as keyof typeof order] ?? 3;
            return aOrder - bOrder;
        })
        .slice(0, 2)
        .map(profile =>
            truncateToTokenLimit(profile.visualDescriptor!, perCharacterBudget).text
        )
        .filter(Boolean);

    return relevant;
}

const optionsQualityVariant = (
    flags: Partial<FeatureFlags> | FeatureFlags
): QualityPrefixVariant => getFeatureFlagValue(flags, 'qualityPrefixVariant');

/**
 * Deduplicates negative prompts using case-insensitive, first-wins strategy.
 * Preserves original casing of first occurrence.
 */
function deduplicateNegatives(negatives: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    
    for (const neg of negatives) {
        const normalized = neg.toLowerCase().trim();
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            result.push(neg.trim()); // Preserve original casing
        }
    }
    
    return result;
}

/**
 * Assembles prompts into provider-specific formats.
 * 
 * For Gemini: Returns inline format with positive and negative combined
 * For ComfyUI: Returns separate format with distinct positive/negative fields
 * 
 * @param positive - The positive prompt text
 * @param negatives - Array of negative prompt terms
 * @param options - Assembly options (provider, style, validation)
 */
export function assemblePromptForProvider(
    positive: string,
    negatives: string[],
    options: {
        provider: 'gemini' | 'comfyui';
        styleDirectives?: string;
        validateTokens?: boolean;
        maxTokens?: number;
    } = { provider: 'comfyui' }
): AssembledPrompt {
    // Deduplicate negatives (case-insensitive, first-wins)
    const dedupedNegatives = deduplicateNegatives(negatives);
    const negativeText = dedupedNegatives.join(', ');
    
    // Append style directives to positive if provided
    const finalPositive = options.styleDirectives
        ? `${positive}, ${options.styleDirectives}`
        : positive;
    
    // Build inline format (for Gemini/text-based models)
    const inlineFormat = negativeText
        ? `${finalPositive}\n\nNEGATIVE PROMPT:\n${negativeText}`
        : finalPositive;
    
    // Build separate format (for ComfyUI/structured workflows)
    const separateFormat = {
        positive: finalPositive,
        negative: negativeText,
    };
    
    // Token counting - use authoritative heuristicTokenEstimate from tokenValidator
    // Maps provider to correct ratio: comfyui → clip (3.5), gemini → gemini (4.0)
    const tokenProvider = getTokenProviderFromId(options.provider);
    const positiveTokens = heuristicTokenEstimate(finalPositive, tokenProvider);
    const negativeTokens = heuristicTokenEstimate(negativeText, tokenProvider);
    const totalTokens = positiveTokens + negativeTokens;
    
    // Token validation if requested
    let tokenWarning: string | undefined;
    const warnings: string[] = [];
    
    if (options.validateTokens && options.maxTokens) {
        if (positiveTokens > options.maxTokens) {
            tokenWarning = `Prompt may exceed token budget: ~${positiveTokens} tokens (max: ${options.maxTokens})`;
            warnings.push(tokenWarning);
        }
    }
    
    return {
        inlineFormat,
        separateFormat,
        mergedNegative: negativeText,
        tokens: {
            positive: positiveTokens,
            negative: negativeTokens,
            total: totalTokens,
        },
        tokenWarning,
        warnings,
    };
}

/**
 * Builds a scene keyframe prompt optimized for image generation.
 * 
 * This prompt is designed for generating keyframe images that establish
 * the visual foundation for a scene, including:
 * - Primary scene setting and mood
 * - Key character appearances (top 2 by prominence)
 * - Director's style directives
 * 
 * Token budget: sceneKeyframe (600 tokens)
 * 
 * When `subjectFirstPrompts` is enabled, routes to buildSceneKeyframePromptV2.
 */
export function buildSceneKeyframePrompt(
    scene: Scene,
    storyBible: StoryBible,
    directorsVision: string,
    negativePrompts: string[] = [],
    options: {
        flags?: Partial<FeatureFlags>;
        provider?: ProviderId;
        qualityVariant?: QualityPrefixVariant;
        technicalTags?: string[];
    } = {}
): AssembledPrompt {
    const mergedFlags = options.flags
        ? loadFeatureFlags(options.flags)
        : loadFeatureFlags();

    if (getFeatureFlagValue(mergedFlags, 'subjectFirstPrompts') === true) {
        return buildSceneKeyframePromptV2(
            scene,
            storyBible,
            directorsVision,
            negativePrompts,
            { ...options, flags: mergedFlags }
        );
    }

    return buildSceneKeyframePromptLegacy(
        scene,
        storyBible,
        directorsVision,
        negativePrompts,
        mergedFlags,
        options.provider
    );
}

/**
 * Legacy keyframe prompt builder (pre subject-first).
 */
function buildSceneKeyframePromptLegacy(
    scene: Scene,
    storyBible: StoryBible,
    directorsVision: string,
    negativePrompts: string[],
    flags: FeatureFlags,
    provider: ProviderId = 'comfyui'
): AssembledPrompt {
    const qualityVariant = optionsQualityVariant(flags);
    const qualityConfig = getQualityConfig(qualityVariant);
    const useEnhancedNegatives = getFeatureFlagValue(flags, 'enhancedNegativePrompts') === true;
    const baseNegatives = useEnhancedNegatives ? getNegativePreset(provider, true) : [];
    const variantNegatives = qualityVariant !== 'legacy' ? qualityConfig.negativePrefix : [];
    const mergedNegatives = [...baseNegatives, ...variantNegatives, ...negativePrompts];
    const parts: string[] = [];
    
    // 1. Scene setting and summary (primary focus)
    if (scene.summary) {
        const summaryResult = truncateToTokenLimit(
            scene.summary,
            Math.floor(DEFAULT_TOKEN_BUDGETS.sceneKeyframe * 0.4) // 40% for scene context
        );
        parts.push(summaryResult.text);
    }
    
    // 2. Extract top characters for this scene
    const characterDescriptors = getCharacterDescriptorsForScene(
        scene,
        storyBible,
        Math.floor(DEFAULT_TOKEN_BUDGETS.sceneKeyframe * 0.15)
    );
    parts.push(...characterDescriptors);
    
    // 3. Style directives from director's vision
    const styleResult = truncateToTokenLimit(
        directorsVision,
        Math.floor(DEFAULT_TOKEN_BUDGETS.sceneKeyframe * 0.25) // 25% for style
    );
    if (styleResult.text) {
        parts.push(styleResult.text);
    }

    // Optional quality tokens when variant is optimized
    const qualityTokens = qualityVariant !== 'legacy'
        ? [...qualityConfig.positivePrefix, ...qualityConfig.qualitySuffix].join(', ')
        : '';
    
    // Combine positive prompt
    const positivePrompt = parts
        .concat(qualityTokens ? [qualityTokens] : [])
        .filter(Boolean)
        .join(', ');
    
    // Assemble with provider formatting
    return assemblePromptForProvider(positivePrompt, mergedNegatives, {
        provider,
        validateTokens: true,
        maxTokens: DEFAULT_TOKEN_BUDGETS.sceneKeyframe,
    });
}

/**
 * Subject-first keyframe prompt builder (Phase 0+).
 * Ordering: scene summary → characters → style → technical → quality suffix.
 * 
 * @param weightingPreset - Weighting preset to use (default: 'balanced')
 */
export function buildSceneKeyframePromptV2(
    scene: Scene,
    storyBible: StoryBible,
    directorsVision: string,
    negativePrompts: string[] = [],
    options: {
        flags?: Partial<FeatureFlags>;
        provider?: ProviderId;
        qualityVariant?: QualityPrefixVariant;
        technicalTags?: string[];
        /** Weighting preset: 'balanced' (default), 'subjectEmphasis', or 'styleEmphasis' */
        weightingPreset?: WeightingPresetName;
    } = {}
): AssembledPrompt {
    const mergedFlags = options.flags
        ? loadFeatureFlags(options.flags)
        : loadFeatureFlags();
    const provider = options.provider ?? 'comfyui';
    const qualityVariant = options.qualityVariant ?? optionsQualityVariant(mergedFlags);
    const qualityConfig = getQualityConfig(qualityVariant);
    const useEnhancedNegatives = getFeatureFlagValue(mergedFlags, 'enhancedNegativePrompts') === true;
    const useWeighting =
        getFeatureFlagValue(mergedFlags, 'promptWeighting') === true &&
        isWeightingSupported(provider);
    
    // Get weighting preset (defaults to 'balanced' if not specified)
    const presetName = options.weightingPreset ?? DEFAULT_WEIGHTING_PRESET;
    const preset = getWeightingPreset(presetName);

    const perCharacterBudget = Math.floor(DEFAULT_TOKEN_BUDGETS.sceneKeyframe * 0.15);
    const summaryBudget = Math.floor(DEFAULT_TOKEN_BUDGETS.sceneKeyframe * 0.35);
    const styleBudget = Math.floor(DEFAULT_TOKEN_BUDGETS.sceneKeyframe * 0.2);

    const summaryResult = truncateToTokenLimit(scene.summary || '', summaryBudget);
    const summarySegment = useWeighting
        ? applyWeight(summaryResult.text, preset.summary)
        : summaryResult.text;

    const characterDescriptors = getCharacterDescriptorsForScene(
        scene,
        storyBible,
        perCharacterBudget
    );
    const styledCharacters = useWeighting
        ? characterDescriptors.map(desc => applyWeight(desc, preset.characters))
        : characterDescriptors;

    const styleResult = truncateToTokenLimit(directorsVision, styleBudget);
    const styleSegment = useWeighting
        ? applyWeight(styleResult.text, preset.style)
        : styleResult.text;

    const technicalDirectives =
        (options.technicalTags && options.technicalTags.length > 0)
            ? options.technicalTags
            : qualityConfig.technicalDirectives;
    const technicalSegment = useWeighting
        ? technicalDirectives.map(tag => applyWeight(tag, preset.technical)).join(', ')
        : technicalDirectives.join(', ');

    const qualityTokens = qualityVariant !== 'legacy'
        ? [...qualityConfig.positivePrefix, ...qualityConfig.qualitySuffix].join(', ')
        : '';

    const positiveSegments = [
        summarySegment,
        ...styledCharacters,
        styleSegment,
        technicalSegment,
        qualityTokens,
    ].filter(Boolean);

    const baseNegatives = useEnhancedNegatives ? getNegativePreset(provider, true) : [];
    const variantNegatives = qualityVariant !== 'legacy' ? qualityConfig.negativePrefix : [];
    const mergedNegatives = [...baseNegatives, ...variantNegatives, ...negativePrompts];

    return assemblePromptForProvider(positiveSegments.join(', '), mergedNegatives, {
        provider,
        validateTokens: true,
        maxTokens: DEFAULT_TOKEN_BUDGETS.sceneKeyframe,
    });
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
        return { descriptors, synchronized, missing, skippedUserEdits: [] };
    }
    
    const bible = storyBible as StoryBibleV2;
    if (!bible.characterProfiles?.length) {
        return { descriptors, synchronized, missing, skippedUserEdits: [] };
    }
    
    // Build lookup map for story bible characters
    const profileMap = new Map<string, CharacterProfile>();
    for (const profile of bible.characterProfiles) {
        profileMap.set(profile.id, profile);
        profileMap.set(profile.name.toLowerCase(), profile);
    }
    
    const skippedUserEdits: string[] = [];
    
    // Sync each visual character
    for (const visual of visualCharacters) {
        // Skip characters with user-edited descriptors (protected from auto-sync)
        if (visual.descriptorSource === 'userEdit') {
            skippedUserEdits.push(visual.name);
            continue;
        }
        
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
    
    return { descriptors, synchronized, missing, skippedUserEdits };
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
    assemblePromptForProvider,
    buildSceneKeyframePrompt,
    buildSceneKeyframePromptV2,
    buildSceneKeyframePromptWithGuard,
    buildComfyUIPromptWithGuard,
};

// ============================================================================
// Async Prompt Builders with Token Guard Integration
// ============================================================================

/**
 * Options for token-guarded prompt building.
 */
export interface TokenGuardOptions {
    /** Feature flags (uses promptTokenGuard mode) */
    flags: Partial<FeatureFlags>;
    /** Optional token counting API */
    tokenApi?: TokenCountApi;
    /** Optional logging callback */
    logApiCall?: ApiLogCallback;
}

/**
 * Result from token-guarded prompt builder.
 */
export interface GuardedPromptResult {
    /** The assembled prompt */
    prompt: AssembledPrompt;
    /** Whether generation is allowed (based on flag mode) */
    allowed: boolean;
    /** Token count (actual or estimated) */
    tokens: number;
    /** Token budget that was checked */
    budget: number;
    /** Source of token count */
    source: 'api' | 'heuristic';
    /** Warning message if over budget but allowed */
    warning?: string;
}

/**
 * Builds a scene keyframe prompt with token guard enforcement.
 * 
 * This async version uses the token validator to check the prompt against
 * the budget, respecting the promptTokenGuard feature flag:
 * - 'off': Always returns allowed=true
 * - 'warn': Returns allowed=true with warning if over budget
 * - 'block': Returns allowed=false if over budget
 * 
 * @param scene - The scene to generate a keyframe for
 * @param storyBible - Story bible with character profiles
 * @param directorsVision - Director's visual styling notes
 * @param negativePrompts - Negative prompts to include
 * @param options - Token guard options (flags, api, logger)
 */
export async function buildSceneKeyframePromptWithGuard(
    scene: Scene,
    storyBible: StoryBible,
    directorsVision: string,
    negativePrompts: string[] = [],
    options: TokenGuardOptions
): Promise<GuardedPromptResult> {
    // Build the base prompt
    const prompt = buildSceneKeyframePrompt(scene, storyBible, directorsVision, negativePrompts);
    
    // Check against token guard
    const guardResult = await guardTokenBudget(
        prompt.separateFormat.positive,
        DEFAULT_TOKEN_BUDGETS.sceneKeyframe,
        options.flags,
        options.tokenApi,
        options.logApiCall
    );
    
    return {
        prompt,
        allowed: guardResult.allowed,
        tokens: guardResult.tokens,
        budget: guardResult.budget,
        source: guardResult.source,
        warning: guardResult.warning,
    };
}

/**
 * Builds a ComfyUI prompt with token guard enforcement.
 * 
 * This async version uses the token validator to check the prompt against
 * the budget, respecting the promptTokenGuard feature flag.
 * 
 * @param storyBible - The story bible containing narrative context
 * @param scene - The current scene being processed
 * @param shot - The specific shot to generate prompt for
 * @param directorsVision - Director's visual styling guidance
 * @param negativePrompts - List of elements to avoid
 * @param options - Token guard options (flags, api, logger)
 * @param maxTokens - Maximum tokens for the positive prompt
 * @param shotEnhancers - Optional shot-specific enhancers
 */
export async function buildComfyUIPromptWithGuard(
    storyBible: StoryBible,
    scene: Scene,
    shot: Shot,
    directorsVision: string,
    negativePrompts: string[] = [],
    options: TokenGuardOptions,
    maxTokens: number = DEFAULT_TOKEN_BUDGETS.comfyuiShot,
    shotEnhancers?: ShotEnhancers
): Promise<GuardedPromptResult & { comfyPrompt: ComfyUIPrompt }> {
    // Build the base prompt
    const comfyPrompt = buildComfyUIPrompt(
        storyBible,
        scene,
        shot,
        directorsVision,
        negativePrompts,
        maxTokens,
        shotEnhancers
    );
    
    // Also build assembled format for consistency
    const assembledPrompt = assemblePromptForProvider(
        comfyPrompt.positive,
        comfyPrompt.negative,
        { provider: 'comfyui' }
    );
    
    // Check against token guard
    const guardResult = await guardTokenBudget(
        comfyPrompt.positive,
        maxTokens,
        options.flags,
        options.tokenApi,
        options.logApiCall
    );
    
    return {
        prompt: assembledPrompt,
        comfyPrompt,
        allowed: guardResult.allowed,
        tokens: guardResult.tokens,
        budget: guardResult.budget,
        source: guardResult.source,
        warning: guardResult.warning,
    };
}
