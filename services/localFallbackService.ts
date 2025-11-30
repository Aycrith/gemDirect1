import { StoryBible, StoryBibleV2, CharacterProfile, PlotScene, Scene, TimelineData, CreativeEnhancers, BatchShotTask, BatchShotResult, DetailedShotResult, Shot, WorkflowMapping, CoDirectorResult, ContinuityResult, HeroArc } from '../types';
import { estimateTokens } from './promptRegistry';
import { validateStoryBibleHard } from './storyBibleValidator';

const TITLE_LENGTH_LIMIT = 48;
const BODY_LENGTH_LIMIT = 140;

const DEFAULT_NEGATIVE_PROMPTS = [
    'blurry details',
    'distorted anatomy',
    'washed out colors',
    'overexposed lighting',
    'low contrast',
    'duplicate subjects',
    'text artifacts'
];

const DEFAULT_OBJECTIVES = [
    'Heighten emotional stakes with a character-driven beat.',
    'Introduce a visual motif that foreshadows conflict.',
    'Refine pacing to build momentum into the climax.'
];

const DEFAULT_IDEAS = [
    'A worn-out courier discovers their messages are rewriting history.',
    'Two rivals must choreograph a dance to avert a political coup.',
    'An archivist protects sentient memories from being erased.'
];

const fallbackEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {
    framing: ['Wide establishing', 'Medium portrait', 'Close-up focus'],
    movement: ['Slow dolly forward', 'Handheld sway', 'Static with breathing zoom'],
    lens: ['35mm natural', '50mm storytelling', 'Telephoto compression'],
    lighting: ['Soft rim light', 'Warm key light', 'Practical motivated glow'],
    mood: ['Pensive', 'Hopeful', 'Charged'],
    pacing: ['Lingering', 'Measured', 'Urgent'],
    vfx: ['Subtle film grain'],
    plotEnhancements: ['Foreshadow upcoming twist']
};

const truncate = (value: string, limit: number): string => {
    // Type safety: ensure value is actually a string
    if (typeof value !== 'string') {
        console.warn('[localFallbackService] truncate received non-string value:', typeof value, value);
        return String(value || '').slice(0, limit);
    }
    if (value.length <= limit) return value;
    return `${value.slice(0, limit - 1).trim()}…`;
};

const titleCase = (value: string): string => {
    return value
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

const detectSetting = (idea: string): string => {
    const lower = idea.toLowerCase();
    if (lower.includes('space') || lower.includes('galaxy')) return 'the vastness of deep space aboard a frontier vessel';
    if (lower.includes('city') || lower.includes('urban')) return 'a neon-soaked mega-city thrumming with life';
    if (lower.includes('forest') || lower.includes('wild')) return 'a mysterious forest where nature feels almost sentient';
    if (lower.includes('desert')) return 'sun-scorched dunes hiding ancient relics';
    if (lower.includes('ocean') || lower.includes('sea')) return 'isolated research platforms floating across restless seas';
    return 'a world where familiar routines are tilting toward the extraordinary';
};

const pickKeywords = (idea: string): string[] => {
    return idea
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .map(titleCase);
};

const enhanceSentence = (sentence: string): string => {
    const trimmed = sentence.trim();
    if (!trimmed) return 'A moment that still needs definition.';
    const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return capitalized.endsWith('.') ? capitalized : `${capitalized}.`;
};

const createPlaceholderImage = (title: string, body: string): string => {
    const safeTitle = truncate(title.replace(/"/g, '\\"'), TITLE_LENGTH_LIMIT);
    const safeBody = truncate(body.replace(/"/g, '\\"'), BODY_LENGTH_LIMIT);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="432" viewBox="0 0 768 432">\n` +
        `  <defs>\n` +
        `    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">\n` +
        `      <stop offset="0%" stop-color="#1f2937" />\n` +
        `      <stop offset="100%" stop-color="#111827" />\n` +
        `    </linearGradient>\n` +
        `  </defs>\n` +
        `  <rect width="768" height="432" fill="url(#bg)" />\n` +
        `  <text x="40" y="120" font-family="'Segoe UI', sans-serif" font-size="42" fill="#fbbf24">${safeTitle}</text>\n` +
        `  <text x="40" y="200" font-family="'Segoe UI', sans-serif" font-size="22" fill="#e5e7eb" opacity="0.85">${safeBody}</text>\n` +
        `  <text x="40" y="360" font-family="'Segoe UI', sans-serif" font-size="18" fill="#9ca3af" opacity="0.7">Generated via local fallback</text>\n` +
        `</svg>`;
    return Buffer.from(svg, 'utf-8').toString('base64');
};

const deriveActs = (plotOutline: string): string[] => {
    const sections = plotOutline.split(/Act\s*[I1V]+:?/i).map(section => section.trim()).filter(Boolean);
    if (sections.length >= 3) return sections.slice(0, 3);
    if (sections.length === 0) return [plotOutline.trim()];
    return sections;
};

const buildSceneTitle = (base: string, index: number): string => {
    const clean = base.split('\n')[0]?.trim() || 'Key Beat';
    return `${titleCase(clean) || 'Key Beat'} Scene ${index + 1}`;
};

const generateTemporalContext = (summary: string): { startMoment: string; endMoment: string } => {
    const sentences = summary.split('.').filter(s => s.trim().length > 0);
    const start = sentences[0] ? sentences[0].trim() : 'Scene begins';
    const lastSentence = sentences[sentences.length - 1];
    const end = lastSentence ? lastSentence.trim() : 'Scene concludes';
    return {
        startMoment: start,
        endMoment: end
    };
};

const extractProtagonist = (idea: string): string => {
    const keywords = pickKeywords(idea);
    return keywords[0] || 'The Protagonist';
};

const FALLBACK_HERO_ARC_NAMES = [
    'Ordinary World',
    'Call to Adventure',
    'Refusal of the Call',
    'Meeting the Mentor',
    'Crossing the Threshold',
    'Tests, Allies, Enemies',
    'Approach to the Inmost Cave',
    'Ordeal',
    'Reward',
    'The Road Back',
    'Resurrection',
    'Return with the Elixir',
];

const buildFallbackHeroArcs = (): HeroArc[] =>
    FALLBACK_HERO_ARC_NAMES.map((name, index) => ({
        id: `arc-${String(index + 1).padStart(2, '0')}`,
        name,
        summary: `${name} stage of the hero's journey.`,
        emotionalShift: 'Shifting emotional stakes across the journey.',
        importance: 6,
    }));

/**
 * Builds structured character profiles for V2 Story Bible.
 * Creates 3 profiles: protagonist, antagonist, and supporting character.
 */
const buildCharacterProfiles = (idea: string): CharacterProfile[] => {
    const protagonist = extractProtagonist(idea);
    const keywords = pickKeywords(idea);
    const antagonist = keywords[1] || 'The Opposition';
    const supporter = keywords[2] || 'The Guide';
    
    return [
        {
            id: 'char-1',
            name: protagonist,
            age: '35',
            appearance: {
                height: 'average height',
                build: 'determined posture',
                hair: 'practical hairstyle',
                eyes: 'observant eyes',
            },
            personality: ['driven', 'resourceful', 'complex'],
            backstory: `The central figure of the narrative, shaped by the events that led to: ${truncate(idea, 120)}`,
            motivations: ['resolve the central conflict', 'protect what matters'],
            relationships: [],
            visualDescriptor: `${protagonist}, determined individual with practical appearance and observant eyes`,
            role: 'protagonist',
        },
        {
            id: 'char-2',
            name: antagonist,
            age: 'indeterminate',
            appearance: {
                build: 'imposing presence',
                eyes: 'calculating gaze',
            },
            personality: ['formidable', 'driven', 'complex motivations'],
            backstory: `A force of opposition that embodies the story's central tension.`,
            motivations: ['achieve their own goals', 'challenge the protagonist'],
            relationships: [{
                characterId: 'char-1',
                characterName: protagonist,
                relationshipType: 'enemy',
                description: 'Primary adversarial relationship',
            }],
            visualDescriptor: `${antagonist}, imposing figure with calculating presence`,
            role: 'antagonist',
        },
        {
            id: 'char-3',
            name: supporter,
            age: 'experienced',
            appearance: {
                build: 'composed demeanor',
                eyes: 'knowing expression',
            },
            personality: ['wise', 'supportive', 'mysterious'],
            backstory: `An ally who provides crucial support during the protagonist's journey.`,
            motivations: ['guide the protagonist', 'share wisdom'],
            relationships: [{
                characterId: 'char-1',
                characterName: protagonist,
                relationshipType: 'ally',
                description: 'Mentor and guide relationship',
            }],
            visualDescriptor: `${supporter}, composed individual with knowing expression`,
            role: 'supporting',
        },
    ];
};

/**
 * Builds structured plot scenes for V2 Story Bible.
 * Creates 6-9 scenes across three acts.
 */
const buildPlotScenes = (idea: string, protagonist: string): PlotScene[] => {
    return [
        // Act I
        {
            actNumber: 1,
            sceneNumber: 1,
            summary: `${protagonist} is introduced in their ordinary world, establishing the status quo.`,
            visualCues: ['establishing shot', 'normal routine', 'environmental detail'],
            characterArcs: [`${protagonist}'s ordinary life`],
            pacing: 'slow',
            location: 'Familiar environment',
            timeOfDay: 'day',
            emotionalTone: 'contemplative',
        },
        {
            actNumber: 1,
            sceneNumber: 2,
            summary: `An inciting incident disrupts ${protagonist}'s world, sparked by: ${truncate(idea, 80)}`,
            visualCues: ['disruption', 'tension building', 'new element introduced'],
            characterArcs: [`${protagonist} faces new challenge`],
            pacing: 'medium',
            emotionalTone: 'unsettling',
        },
        {
            actNumber: 1,
            sceneNumber: 3,
            summary: `${protagonist} makes a decisive choice that commits them to the journey ahead.`,
            visualCues: ['threshold moment', 'departure', 'point of no return'],
            characterArcs: [`${protagonist} commits to change`],
            pacing: 'medium',
            emotionalTone: 'determined',
        },
        // Act II
        {
            actNumber: 2,
            sceneNumber: 1,
            summary: `${protagonist} navigates new challenges, meeting allies and facing tests.`,
            visualCues: ['new environment', 'obstacles', 'alliance forming'],
            characterArcs: [`${protagonist} adapts and grows`],
            pacing: 'medium',
            emotionalTone: 'building tension',
        },
        {
            actNumber: 2,
            sceneNumber: 2,
            summary: `A midpoint revelation changes everything ${protagonist} thought they knew.`,
            visualCues: ['revelation moment', 'reframed stakes', 'turning point'],
            characterArcs: [`${protagonist}'s understanding deepens`],
            pacing: 'fast',
            emotionalTone: 'shocking',
        },
        {
            actNumber: 2,
            sceneNumber: 3,
            summary: `${protagonist} faces their darkest moment, seemingly all is lost.`,
            visualCues: ['dark imagery', 'isolation', 'lowest point'],
            characterArcs: [`${protagonist} confronts inner demons`],
            pacing: 'slow',
            emotionalTone: 'despair',
        },
        // Act III
        {
            actNumber: 3,
            sceneNumber: 1,
            summary: `${protagonist} rises with new resolve, ready to face the final challenge.`,
            visualCues: ['rebirth imagery', 'renewed determination', 'preparation'],
            characterArcs: [`${protagonist} transforms`],
            pacing: 'medium',
            emotionalTone: 'hopeful',
        },
        {
            actNumber: 3,
            sceneNumber: 2,
            summary: `The climactic confrontation tests everything ${protagonist} has learned.`,
            visualCues: ['climax setting', 'confrontation', 'stakes at highest'],
            characterArcs: [`${protagonist} applies growth`],
            pacing: 'fast',
            emotionalTone: 'intense',
        },
        {
            actNumber: 3,
            sceneNumber: 3,
            summary: `Resolution brings ${protagonist} to a new equilibrium, transformed by the journey.`,
            visualCues: ['resolution imagery', 'new normal', 'echoes of opening'],
            characterArcs: [`${protagonist}'s transformation complete`],
            pacing: 'slow',
            emotionalTone: 'cathartic',
        },
    ];
};

/**
 * Generates a Story Bible V2 from a user's idea.
 * This is the primary local LLM generation function.
 * 
 * @param idea - User's story idea
 * @param genre - Genre for template selection (default: 'sci-fi')
 * @returns StoryBibleV2 with structured characters and plot scenes
 */
export const generateStoryBible = async (idea: string, genre: string = 'sci-fi'): Promise<StoryBibleV2> => {
    const trimmedIdea = idea.trim();
    const protagonist = extractProtagonist(trimmedIdea);
    const logline = trimmedIdea.endsWith('.') ? trimmedIdea : `${trimmedIdea}.`;

    // Build structured character profiles
    const characterProfiles = buildCharacterProfiles(trimmedIdea);
    
    // Build markdown characters for backward compatibility
    const characters = characterProfiles.map(p => {
        const roleLabel = p.role === 'protagonist' ? '(Protagonist)' : 
                          p.role === 'antagonist' ? '(Antagonist)' : '';
        return `**${p.name}** ${roleLabel}: ${p.backstory} Driven by ${p.motivations.join(' and ')}.`;
    }).join('\n\n');
    
    const setting = `Set amid ${detectSetting(trimmedIdea)}, where everyday details feel heightened and cinematic. The atmosphere pulses with the tension of the central conflict, reflecting the emotional journey of the characters.`;

    // Build structured plot scenes
    const plotScenes = buildPlotScenes(trimmedIdea, protagonist);
    
    // Build markdown plot outline for backward compatibility
    const acts = [
        `**Act I**\n- Introduce ${protagonist} and the central pressure sparked by: ${truncate(trimmedIdea, 120)}\n- End Act I with an inciting incident that forces a decisive choice.`,
        `**Act II**\n- Escalate complications as allies and rivals test ${protagonist}.\n- Midpoint twist reframes the core stakes, revealing hidden costs.\n- Darkest moment pushes the hero toward transformation.`,
        `**Act III**\n- Execute a bold plan that reflects the protagonist's growth.\n- Conclude with a resonant image tying back to the opening promise.`
    ].join('\n\n');

    // Calculate token metadata
    const loglineTokens = estimateTokens(logline);
    const charactersTokens = estimateTokens(characters);
    const settingTokens = estimateTokens(setting);
    const plotOutlineTokens = estimateTokens(acts);

    const storyBibleV2: StoryBibleV2 = {
        version: '2.0',
        logline,
        characters,
        setting,
        plotOutline: acts,
        heroArcs: buildFallbackHeroArcs(),
        characterProfiles,
        plotScenes,
        tokenMetadata: {
            loglineTokens,
            charactersTokens,
            settingTokens,
            plotOutlineTokens,
            totalTokens: loglineTokens + charactersTokens + settingTokens + plotOutlineTokens,
            lastUpdated: Date.now(),
        },
        genre,
        themes: detectThemes(trimmedIdea),
    };

    // Validate the generated Story Bible
    const validation = validateStoryBibleHard(storyBibleV2);
    if (!validation.valid) {
        console.warn('[localFallbackService] Generated Story Bible has validation issues:', validation.issues);
        // Continue anyway - local fallback prioritizes availability over perfection
    }

    return storyBibleV2;
};

/**
 * Detects themes from the story idea
 */
const detectThemes = (idea: string): string[] => {
    const lower = idea.toLowerCase();
    const themes: string[] = [];
    
    if (/love|heart|romance|relationship/i.test(lower)) themes.push('love');
    if (/power|control|domination|rule/i.test(lower)) themes.push('power');
    if (/freedom|escape|liberty|free\b/i.test(lower)) themes.push('freedom');
    if (/identity|self|who am i|discover/i.test(lower)) themes.push('identity');
    if (/revenge|vengeance|retribution/i.test(lower)) themes.push('revenge');
    if (/redemption|forgive|second chance/i.test(lower)) themes.push('redemption');
    if (/survival|survive|endure/i.test(lower)) themes.push('survival');
    if (/justice|right|wrong|moral/i.test(lower)) themes.push('justice');
    
    return themes.length > 0 ? themes : ['transformation', 'conflict'];
};

export const generateSceneList = async (plotOutline: string, directorsVision: string): Promise<Array<{ title: string; summary: string; temporalContext: { startMoment: string; endMoment: string } }>> => {
    const acts = deriveActs(plotOutline);
    const scenes: Array<{ title: string; summary: string; temporalContext: { startMoment: string; endMoment: string } }> = [];
    acts.forEach((act, index) => {
        const segments = act.split(/\n-/).map(segment => segment.replace(/^-/, '').trim()).filter(Boolean);
        const baseSummary = segments[0] || `Key developments escalate in act ${index + 1}.`;
        const summary1 = `${enhanceSentence(baseSummary)} Visual tone leans into ${directorsVision.split('.')[0] || 'the director\'s guidance'}.`;
        scenes.push({
            title: `Act ${index + 1}: ${buildSceneTitle(baseSummary, index)}`,
            summary: summary1,
            temporalContext: generateTemporalContext(summary1)
        });
        if (segments[1]) {
            const summary2 = `${enhanceSentence(segments[1])} Build connective tissue toward the upcoming reversal.`;
            scenes.push({
                title: `Act ${index + 1}: Secondary Beat ${index + 1}`,
                summary: summary2,
                temporalContext: generateTemporalContext(summary2)
            });
        }
    });
    return scenes.slice(0, 6);
};

export const getPrunedContextForShotGeneration = async (
    storyBible: StoryBible,
    narrativeContext: string,
    sceneSummary: string,
    directorsVision: string
): Promise<string> => {
    return [
        `Story Focus: ${storyBible.logline}`,
        `Narrative Context: ${narrativeContext}`,
        `Scene Purpose: ${sceneSummary}`,
        `Visual Priorities: ${directorsVision}`
    ].join('\n');
};

export const getPrunedContextForCoDirector = async (
    storyBible: StoryBible,
    narrativeContext: string,
    scene: Scene,
    directorsVision: string
): Promise<string> => {
    return [
        `Logline: ${storyBible.logline}`,
        `Context: ${narrativeContext}`,
        `Scene Summary: ${scene.summary}`,
        `Director's Vision Touchpoints: ${directorsVision}`
    ].join('\n');
};

export const getPrunedContextForBatchProcessing = async (
    narrativeContext: string,
    directorsVision: string
): Promise<string> => {
    return `Maintain cohesion with context "${narrativeContext}" while honoring the aesthetic of ${directorsVision}.`;
};

export const generateAndDetailInitialShots = async (prunedContext: string): Promise<DetailedShotResult[]> => {
    const baseDescriptions = [
        'Slow aerial establishing shot orienting the audience to the environment.',
        'Measured medium shot focusing on the protagonist grappling with the turning point.',
        'Intimate close-up capturing the emotional shift that propels the climax.'
    ];
    return baseDescriptions.map(description => ({
        description: `${description} (${truncate(prunedContext, 90)})`,
        suggested_enhancers: fallbackEnhancers
    }));
};

export const suggestStoryIdeas = async (): Promise<string[]> => {
    return DEFAULT_IDEAS;
};

export const suggestDirectorsVisions = async (storyBible: StoryBible): Promise<string[]> => {
    const base = storyBible.setting.split('.')[0] || 'the story world';
    return [
        `Naturalistic cinematic approach—handheld camerawork, warm diffusion, and emphasis on organic textures drawn from ${base}.`,
        `Stylized neo-noir palette—contrasting pools of light and shadow, reflective surfaces, and bold negative space to echo ${base}.`,
        `Illustrative animation style—painterly brushstrokes, dynamic parallax movement, and fluid transitions that celebrate ${base}.`
    ];
};

export const suggestNegativePrompts = async (): Promise<string[]> => {
    return DEFAULT_NEGATIVE_PROMPTS;
};

export const refineDirectorsVision = async (vision: string, storyBible: StoryBible): Promise<string> => {
    const trimmed = vision.trim();
    const loglineTouchpoint = storyBible.logline ? ` Ground this look and feel in the promise of "${truncate(storyBible.logline, 80)}".` : '';
    return `${enhanceSentence(trimmed)} Emphasize consistent visual motifs, controlled color language, and intentional lensing to reinforce theme.${loglineTouchpoint}`;
};

export const refineStoryBibleSection = async (section: 'characters' | 'plotOutline' | 'logline' | 'setting', content: string, prunedContext: string): Promise<string> => {
    const base = content.trim();
    const contextReference = prunedContext ? ` (Context: ${truncate(prunedContext, 80)})` : '';
    
    if (section === 'logline') {
        return `${base} ${contextReference}`.slice(0, 140);
    } else if (section === 'setting') {
        return `${base} The atmosphere pulses with tangible energy and visual detail.${contextReference}`;
    } else if (section === 'characters') {
        return `${base}\n\nEach character now has a clear internal drive, external obstacle, and evolving relationship arc.${contextReference}`;
    } else { // plotOutline
        return `${base}\n\nHighlight the emotional stakes at each turn and ensure scene transitions carry deliberate momentum.${contextReference}`;
    }
};

export const suggestCoDirectorObjectives = async (
    _logline: string,
    sceneSummary: string,
    directorsVision: string
): Promise<string[]> => {
    return [
        `Amplify the dramatic tension hinted at in the logline by sharpening conflict in the moment where ${truncate(sceneSummary, 80)}.`,
        `Layer visual callbacks from the director's vision—use lighting and framing to echo ${truncate(directorsVision, 70)}.`,
        DEFAULT_OBJECTIVES[2] || 'Refine pacing to build momentum into the climax.'
    ];
};

export const getCoDirectorSuggestions = async (
    prunedContext: string,
    timelineSummary: string,
    objective: string
): Promise<CoDirectorResult> => {
    const shots = timelineSummary.split('\n').filter(Boolean);
    const firstShot = shots[0] || 'Shot 1: establish the central tension.';
    const suggestionShotId = /Shot\s(\d+)/.exec(firstShot)?.[1] || '1';

    return {
        thematic_concept: 'Local Creative Pass',
        reasoning: `Objective focus: ${objective}. Proposed changes align the scene with the brief while maintaining cohesion:\n- ${truncate(prunedContext, 120)}\n- Surface emotional continuity across the timeline.`,
        suggested_changes: [
            {
                type: 'UPDATE_SHOT',
                shot_id: suggestionShotId,
                payload: {
                    description: enhanceSentence(`Reframe ${firstShot.replace(/Shot\s\d+:\s*/, '')} with a bolder emotional beat to satisfy the objective.`),
                    enhancers: fallbackEnhancers
                },
                description: 'Intensify opening shot to mirror stated objective.'
            },
            {
                type: 'UPDATE_TRANSITION',
                transition_index: 0,
                payload: { type: 'Dissolve' },
                description: 'Add a dissolve transition to smooth the tonal shift into the climax.'
            }
        ]
    };
};

export const batchProcessShotEnhancements = async (tasks: BatchShotTask[]): Promise<BatchShotResult[]> => {
    // Try to use local LLM if configured
    const localLLMUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOCAL_STORY_PROVIDER_URL) ||
                        (typeof process !== 'undefined' && process.env?.VITE_LOCAL_STORY_PROVIDER_URL);
    const localLLMModel = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOCAL_LLM_MODEL) ||
                          (typeof process !== 'undefined' && process.env?.VITE_LOCAL_LLM_MODEL) ||
                          'mistralai/mistral-7b-instruct-v0.3';
    
    if (localLLMUrl) {
        try {
            console.log('[localFallbackService] Attempting local LLM for batch processing');
            
            const results: BatchShotResult[] = [];
            
            for (const task of tasks) {
                const result: BatchShotResult = { shot_id: task.shot_id };
                
                if (task.actions.includes('REFINE_DESCRIPTION')) {
                    // Build prompt for description refinement
                    const prompt = `You are a cinematic description writer. Refine this shot description to be more vivid and actionable for video production.

Original: "${task.description}"

Provide ONLY the refined description, no explanations. Keep it under 150 words. Focus on visual details, camera movement, and emotional tone.`;

                    try {
                        const response = await fetch(localLLMUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: localLLMModel,
                                messages: [{ role: 'user', content: prompt }],
                                temperature: 0.35,
                                max_tokens: 200,
                            }),
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            const content = data.choices?.[0]?.message?.content?.trim();
                            if (content) {
                                result.refined_description = content;
                            }
                        }
                    } catch (llmError) {
                        console.warn('[localFallbackService] LLM call failed for shot', task.shot_id, llmError);
                    }
                    
                    // Fall back to basic enhancement if LLM failed
                    if (!result.refined_description) {
                        result.refined_description = enhanceSentence(task.description);
                    }
                }
                
                if (task.actions.includes('SUGGEST_ENHANCERS')) {
                    // Build prompt for enhancer suggestions
                    const prompt = `You are a cinematography advisor. Based on this shot description, suggest creative enhancers.

Shot: "${task.description}"

Return a JSON object with these arrays (3-5 items each):
- framing: camera framing options (e.g., "Wide establishing", "Medium portrait")
- movement: camera movement options (e.g., "Slow dolly forward", "Static")
- lighting: lighting styles (e.g., "Soft rim light", "High contrast")
- mood: emotional tones (e.g., "Pensive", "Hopeful")

Return ONLY valid JSON, no markdown.`;

                    try {
                        const response = await fetch(localLLMUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: localLLMModel,
                                messages: [{ role: 'user', content: prompt }],
                                temperature: 0.35,
                                max_tokens: 300,
                            }),
                        });
                        
                        if (response.ok) {
                            const data = await response.json();
                            const content = data.choices?.[0]?.message?.content?.trim();
                            if (content) {
                                try {
                                    // Try to parse JSON from response
                                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                                    if (jsonMatch) {
                                        const enhancers = JSON.parse(jsonMatch[0]);
                                        result.suggested_enhancers = enhancers;
                                    }
                                } catch {
                                    console.warn('[localFallbackService] Failed to parse enhancer JSON for shot', task.shot_id);
                                }
                            }
                        }
                    } catch (llmError) {
                        console.warn('[localFallbackService] LLM call failed for enhancers', task.shot_id, llmError);
                    }
                    
                    // Fall back to static enhancers if LLM failed
                    if (!result.suggested_enhancers) {
                        result.suggested_enhancers = fallbackEnhancers;
                    }
                }
                
                results.push(result);
            }
            
            console.log('[localFallbackService] Local LLM batch processing complete:', results.length, 'shots');
            return results;
            
        } catch (error) {
            console.warn('[localFallbackService] Local LLM batch processing failed, using static fallback:', error);
        }
    } else {
        console.info('[localFallbackService] No local LLM configured (VITE_LOCAL_STORY_PROVIDER_URL not set). Using static fallback.');
    }
    
    // Static fallback when no local LLM is available
    return tasks.map(task => {
        const result: BatchShotResult = { shot_id: task.shot_id };
        if (task.actions.includes('REFINE_DESCRIPTION')) {
            result.refined_description = enhanceSentence(task.description);
        }
        if (task.actions.includes('SUGGEST_ENHANCERS')) {
            result.suggested_enhancers = fallbackEnhancers;
        }
        return result;
    });
};

export const generateKeyframeForScene = async (vision: string, sceneSummary: string): Promise<string> => {
    return createPlaceholderImage('Scene Keyframe', `${truncate(sceneSummary, 90)} | ${truncate(vision, 90)}`);
};

export const generateImageForShot = async (
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    sceneSummary: string
): Promise<string> => {
    const enhancerSummary = enhancers ? Object.entries(enhancers)
        .filter(([, value]) => Array.isArray(value) && value.length > 0)
        .map(([key, value]) => `${titleCase(key)}: ${(value as string[]).join(', ')}`)
        .join(' | ') : 'Minimal styling';
    return createPlaceholderImage(shot.description || 'Shot Preview', `${truncate(enhancerSummary, 110)} • Vision: ${truncate(directorsVision, 60)} • Context: ${truncate(sceneSummary, 60)}`);
};

export const analyzeVideoFrames = async (frames: string[]): Promise<string> => {
    if (!frames || frames.length === 0) {
        return 'No frames analyzed. Provide at least one frame to summarize visuals.';
    }
    return `Analyzed ${frames.length} ${frames.length === 1 ? 'frame' : 'frames'}. Visual rhythm trends toward lingering holds with muted contrast. Local fallback suggests verifying key storytelling beats manually.`;
};

export const getPrunedContextForContinuity = async (
    storyBible: StoryBible,
    narrativeContext: string,
    scene: Scene,
    directorsVision: string
): Promise<string> => {
    return [
        `Story Intent: ${storyBible.logline}`,
        `Narrative Placement: ${narrativeContext}`,
        `Scene Purpose: ${scene.summary}`,
        `Visual Benchmarks: ${directorsVision}`
    ].join('\n');
};

export const scoreContinuity = async (
    prunedContext: string,
    scene: Scene,
    videoAnalysis: string
): Promise<ContinuityResult> => {
    const issues = videoAnalysis.includes('deviation') ? 'Address noted deviations by aligning blocking and lighting with the vision.' : 'Fine-tune pacing and shot transitions to maximize resonance.';
    return {
        scores: {
            narrative_coherence: 7,
            aesthetic_alignment: 6,
            thematic_resonance: 7
        },
        overall_feedback: `Local continuity review summary:\n- Intent: ${truncate(prunedContext, 120)}\n- Result: ${truncate(videoAnalysis, 120)}\nFocus on ${issues}`,
        suggested_changes: [
            {
                type: 'UPDATE_SHOT',
                shot_id: scene.timeline.shots[0]?.id || 'shot_1',
                payload: {
                    description: enhanceSentence('Clarify the opening shot to establish stakes immediately.'),
                    enhancers: fallbackEnhancers
                },
                description: 'Sharpen opening shot to reinforce narrative clarity.'
            }
        ]
    };
};

export const generateNextSceneFromContinuity = async (
    storyBible: StoryBible,
    directorsVision: string,
    lastSceneSummary: string,
    userDirection: string,
    _lastFrame: string
): Promise<{ title: string; summary: string }> => {
    const protagonist = extractProtagonist(storyBible.logline);
    return {
        title: `Aftermath: ${protagonist.split(' ')[0] || 'Next Steps'}`,
        summary: enhanceSentence(`Guided by ${directorsVision.split('.')[0] || 'the established vision'}, the story advances as ${protagonist} responds to ${truncate(userDirection || lastSceneSummary, 80)}.`)
    };
};

export const updateSceneSummaryWithRefinements = async (originalSummary: string, refinedTimeline: TimelineData): Promise<string> => {
    if (!refinedTimeline.shots.length) {
        return enhanceSentence(originalSummary);
    }
    const first = refinedTimeline.shots[0]?.description || 'An opening beat';
    const last = refinedTimeline.shots[refinedTimeline.shots.length - 1]?.description || 'A concluding beat';
    return enhanceSentence(`The scene now opens with ${truncate(first, 80)} and resolves as ${truncate(last, 80)}.`);
};

export const generateWorkflowMapping = async (workflowJson: string): Promise<WorkflowMapping> => {
    const mapping: WorkflowMapping = {};
    if (!workflowJson.trim()) return mapping;

    let workflow: any;
    try {
        workflow = JSON.parse(workflowJson);
    } catch {
        return mapping;
    }

    const prompt = workflow.prompt || workflow;
    if (typeof prompt !== 'object') return mapping;

    let positiveAssigned = false;
    let negativeAssigned = false;

    Object.entries(prompt).forEach(([nodeId, node]: [string, any]) => {
        if (!node || typeof node !== 'object') return;
        const classType = String(node.class_type || '').toLowerCase();
        const inputs = node.inputs || {};

        if (classType.includes('cliptextencode') || classType.includes('textencode')) {
            if (inputs.text || inputs.prompt) {
                const key = `${nodeId}:${inputs.text ? 'text' : 'prompt'}`;
                if (!positiveAssigned) {
                    mapping[key] = 'human_readable_prompt';
                    positiveAssigned = true;
                } else if (!negativeAssigned) {
                    mapping[key] = 'negative_prompt';
                    negativeAssigned = true;
                }
            }
        }

        if (classType === 'loadimage' && inputs.image) {
            const key = `${nodeId}:image`;
            mapping[key] = 'keyframe_image';
        }
    });

    return mapping;
};
