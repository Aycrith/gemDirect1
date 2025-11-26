/**
 * Scene Transition Prompt Service
 * 
 * Generates scene transition context that references the previous scene's end state.
 * This creates narrative coherence across video segments by bridging scenes together.
 * 
 * DESIGN PRINCIPLE: Keep LLM requests modular and separate from video generation.
 * LLM spins up for text-based requests, then goes offline to free GPU for video gen.
 * 
 * Workflow:
 * 1. Pre-generation phase: Call generateSceneTransitionContext() for all scenes (LLM-intensive)
 * 2. Cache the transition contexts
 * 3. Video generation phase: Use cached contexts (no LLM required)
 * 
 * EXTENDED (Phase 5): Now supports shot-level transition context for fine-grained
 * visual continuity between shots within a scene, not just between scenes.
 */

import { Scene, StoryBible, Shot, CreativeEnhancers } from '../types';

export interface SceneTransitionContext {
  sceneId: string;
  previousSceneEndState: string | null;  // null for first scene
  transitionBridge: string;              // How this scene connects to previous
  narrativeMomentum: string;            // What carries forward
  visualContinuity: string[];           // Visual elements to maintain
}

/**
 * Shot-level transition context for fine-grained continuity
 * Used to bridge individual shots within a scene
 */
export interface ShotTransitionContext {
  shotId: string;
  sceneId: string;
  /** Position in scene (0-indexed) */
  shotIndex: number;
  /** Previous shot's description (null for first shot) */
  previousShotDescription: string | null;
  /** Previous shot's enhancers */
  previousShotEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | null;
  /** Visual elements to maintain from previous shot */
  visualContinuity: string[];
  /** Transition type from previous shot */
  transitionType: string | null;
  /** Reference keyframe from scene (if available) */
  sceneKeyframeRef: string | null;
  /** Narrative position in scene (opening, middle, climax, closing) */
  narrativePosition: 'opening' | 'middle' | 'climax' | 'closing';
}

export interface TransitionContextBatch {
  contexts: SceneTransitionContext[];
  generatedAt: number;
  storyBibleHash: string;  // To detect if story changed
}

/**
 * Batch of shot transition contexts for a scene
 */
export interface ShotTransitionContextBatch {
  sceneId: string;
  contexts: ShotTransitionContext[];
  generatedAt: number;
}

/**
 * Generate transition context for a single scene based on previous scene
 * This is a pure function that doesn't require LLM - uses existing scene data
 * 
 * @param currentScene - The scene to generate transition for
 * @param previousScene - The previous scene (null for first scene)
 * @param storyBible - Story context for narrative understanding
 * @returns Scene transition context
 */
export function generateSceneTransitionContext(
  currentScene: Scene,
  previousScene: Scene | null,
  storyBible: StoryBible
): SceneTransitionContext {
  // First scene has no previous context
  if (!previousScene) {
    return {
      sceneId: currentScene.id,
      previousSceneEndState: null,
      transitionBridge: 'Opening scene - establish story world and initial state.',
      narrativeMomentum: extractNarrativeMomentum(currentScene, storyBible),
      visualContinuity: [],
    };
  }

  // Extract end state from previous scene's temporal context or summary
  const previousEndState = previousScene.temporalContext?.endMoment 
    || `Scene concluded: ${previousScene.summary?.slice(0, 100)}...`;

  // Determine transition bridge based on arc progression
  const transitionBridge = buildTransitionBridge(previousScene, currentScene);

  // Identify visual elements that should carry forward
  const visualContinuity = extractVisualContinuityElements(previousScene, currentScene);

  return {
    sceneId: currentScene.id,
    previousSceneEndState: previousEndState,
    transitionBridge,
    narrativeMomentum: extractNarrativeMomentum(currentScene, storyBible),
    visualContinuity,
  };
}

/**
 * Generate transition contexts for all scenes in a batch
 * Call this BEFORE video generation to prepare all context (LLM-free operation)
 * 
 * @param scenes - All scenes in order
 * @param storyBible - Story context
 * @returns Batch of transition contexts ready for video generation
 */
export function generateAllTransitionContexts(
  scenes: Scene[],
  storyBible: StoryBible
): TransitionContextBatch {
  const contexts: SceneTransitionContext[] = [];
  
  for (let i = 0; i < scenes.length; i++) {
    const currentScene = scenes[i];
    if (!currentScene) continue;
    const previousScene = i > 0 ? scenes[i - 1] ?? null : null;
    
    contexts.push(generateSceneTransitionContext(currentScene, previousScene, storyBible));
  }

  return {
    contexts,
    generatedAt: Date.now(),
    storyBibleHash: hashStoryBible(storyBible),
  };
}

/**
 * Build a transition bridge description between two scenes
 */
function buildTransitionBridge(previousScene: Scene, currentScene: Scene): string {
  const prevArc = previousScene.heroArcName || 'previous beat';
  const currArc = currentScene.heroArcName || 'next beat';
  const prevEnd = previousScene.temporalContext?.endMoment || previousScene.summary?.slice(0, 80);
  const currStart = currentScene.temporalContext?.startMoment || currentScene.summary?.slice(0, 80);

  // Detect act transitions
  const prevArcOrder = previousScene.heroArcOrder || 0;
  const currArcOrder = currentScene.heroArcOrder || 0;
  
  let transitionType = 'Scene continuation';
  if (currArcOrder > prevArcOrder) {
    if (currArcOrder <= 4) {
      transitionType = 'Act I progression';
    } else if (currArcOrder <= 8) {
      transitionType = 'Act II development';
    } else {
      transitionType = 'Act III resolution';
    }
  }

  return `${transitionType}: From "${prevEnd}" to "${currStart}". Bridge ${prevArc} into ${currArc}.`;
}

/**
 * Extract narrative momentum - what emotional/story thread carries forward
 */
function extractNarrativeMomentum(scene: Scene, _storyBible: StoryBible): string {
  const parts: string[] = [];

  if (scene.heroArcName) {
    parts.push(`Hero's Journey: ${scene.heroArcName}`);
  }
  
  if (scene.heroArcSummary) {
    parts.push(scene.heroArcSummary.slice(0, 100));
  }

  // Add emotional beat from hero arc order
  if (typeof scene.heroArcOrder === 'number') {
    const emotionalBeats: Record<number, string> = {
      1: 'Establish ordinary world',
      2: 'Call disrupts the norm',
      3: 'Internal resistance',
      4: 'Guidance appears',
      5: 'Point of no return',
      6: 'Alliances and obstacles',
      7: 'Approaching the crisis',
      8: 'Supreme ordeal',
      9: 'Transformation reward',
      10: 'Journey homeward',
      11: 'Final transformation',
      12: 'Return with wisdom',
    };
    const beat = emotionalBeats[scene.heroArcOrder];
    if (beat) {
      parts.push(`Emotional beat: ${beat}`);
    }
  }

  return parts.join('. ') || 'Continue narrative flow';
}

/**
 * Extract visual elements that should maintain continuity between scenes
 */
function extractVisualContinuityElements(previousScene: Scene, currentScene: Scene): string[] {
  const elements: string[] = [];

  // Check timeline for recurring elements
  const prevShots = previousScene.timeline?.shots || [];
  const currShots = currentScene.timeline?.shots || [];

  // Look for character mentions in both scenes
  const prevDescriptions = prevShots.map(s => s.description.toLowerCase()).join(' ');
  const currDescriptions = currShots.map(s => s.description.toLowerCase()).join(' ');

  // Common character indicators
  const characterPatterns = [
    /protagonist/gi,
    /hero(?:ine)?/gi,
    /character/gi,
    /they|he|she/gi,
  ];

  for (const pattern of characterPatterns) {
    if (pattern.test(prevDescriptions) && pattern.test(currDescriptions)) {
      elements.push('Maintain character appearance consistency');
      break;
    }
  }

  // Check for location continuity
  const locationPatterns = [
    /room|hall|space/gi,
    /forest|woods|nature/gi,
    /city|urban|street/gi,
    /sky|horizon|landscape/gi,
  ];

  for (const pattern of locationPatterns) {
    if (pattern.test(prevDescriptions) && pattern.test(currDescriptions)) {
      elements.push('Maintain environmental consistency');
      break;
    }
  }

  // Check lighting/mood continuity from enhancers
  const prevEnhancers = Object.values(previousScene.timeline?.shotEnhancers || {});
  const currEnhancers = Object.values(currentScene.timeline?.shotEnhancers || {});

  const prevLighting = prevEnhancers.flatMap(e => e.lighting || []);
  const currLighting = currEnhancers.flatMap(e => e.lighting || []);

  if (prevLighting.length > 0 && currLighting.length > 0) {
    const commonLighting = prevLighting.filter(l => currLighting.includes(l));
    if (commonLighting.length > 0) {
      elements.push(`Maintain lighting: ${commonLighting.join(', ')}`);
    }
  }

  return elements;
}

/**
 * Create a simple hash of story bible for change detection
 */
function hashStoryBible(storyBible: StoryBible): string {
  const content = [
    storyBible.logline,
    storyBible.characters?.slice(0, 200),
    storyBible.setting?.slice(0, 200),
    storyBible.plotOutline?.slice(0, 200),
  ].filter(Boolean).join('|');
  
  // Simple hash - not cryptographic, just for change detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Format transition context as a prompt enhancement string
 * Used when building prompts for keyframe/video generation
 * 
 * @param context - The transition context for a scene
 * @returns Formatted string to append to generation prompts
 */
export function formatTransitionContextForPrompt(context: SceneTransitionContext): string {
  const parts: string[] = [];

  if (context.previousSceneEndState) {
    parts.push(`SCENE CONTINUITY: Previous scene ended with: "${context.previousSceneEndState}"`);
  }

  if (context.transitionBridge) {
    parts.push(`TRANSITION: ${context.transitionBridge}`);
  }

  if (context.narrativeMomentum) {
    parts.push(`NARRATIVE MOMENTUM: ${context.narrativeMomentum}`);
  }

  if (context.visualContinuity.length > 0) {
    parts.push(`VISUAL CONTINUITY: ${context.visualContinuity.join('; ')}`);
  }

  return parts.join('\n');
}

// ============================================================================
// SHOT-LEVEL TRANSITION CONTEXT (Phase 5)
// ============================================================================

/**
 * Generate transition context for a single shot based on previous shot
 * Provides fine-grained continuity for shot-to-shot coherence
 * 
 * @param scene - Parent scene
 * @param shotIndex - Index of the current shot in the timeline
 * @param sceneKeyframe - Scene keyframe reference (optional)
 * @returns Shot transition context
 */
export function buildShotTransitionContext(
  scene: Scene,
  shotIndex: number,
  sceneKeyframe?: string | null
): ShotTransitionContext {
  const shots = scene.timeline?.shots || [];
  const currentShot = shots[shotIndex];
  const previousShot = shotIndex > 0 ? shots[shotIndex - 1] : null;
  const transitions = scene.timeline?.transitions || [];
  const shotEnhancers = scene.timeline?.shotEnhancers || {};

  if (!currentShot) {
    throw new Error(`Shot at index ${shotIndex} not found in scene ${scene.id}`);
  }

  // Determine narrative position in scene
  const narrativePosition = determineNarrativePosition(shotIndex, shots.length);

  // Get previous shot's enhancers
  const previousShotEnhancers = previousShot 
    ? shotEnhancers[previousShot.id] || null
    : null;

  // Get transition type (transitions are between shots, so index matches previous shot)
  const transitionType = shotIndex > 0 && transitions[shotIndex - 1]
    ? transitions[shotIndex - 1]
    : null;

  // Extract visual continuity elements from previous shot
  const visualContinuity = previousShot
    ? extractShotVisualContinuity(previousShot, currentShot, previousShotEnhancers)
    : [];

  return {
    shotId: currentShot.id,
    sceneId: scene.id,
    shotIndex,
    previousShotDescription: previousShot?.description || null,
    previousShotEnhancers,
    visualContinuity,
    transitionType,
    sceneKeyframeRef: sceneKeyframe || null,
    narrativePosition,
  };
}

/**
 * Generate transition contexts for all shots in a scene
 * 
 * @param scene - Scene to process
 * @param sceneKeyframe - Scene keyframe reference
 * @returns Batch of shot transition contexts
 */
export function generateAllShotTransitionContexts(
  scene: Scene,
  sceneKeyframe?: string | null
): ShotTransitionContextBatch {
  const shots = scene.timeline?.shots || [];
  const contexts: ShotTransitionContext[] = [];

  for (let i = 0; i < shots.length; i++) {
    contexts.push(buildShotTransitionContext(scene, i, sceneKeyframe));
  }

  return {
    sceneId: scene.id,
    contexts,
    generatedAt: Date.now(),
  };
}

/**
 * Determine the narrative position of a shot within its scene
 */
function determineNarrativePosition(
  shotIndex: number,
  totalShots: number
): 'opening' | 'middle' | 'climax' | 'closing' {
  if (totalShots <= 1) return 'opening';
  
  const position = shotIndex / (totalShots - 1);
  
  if (position === 0) return 'opening';
  if (position >= 0.9) return 'closing';
  if (position >= 0.6 && position < 0.9) return 'climax';
  return 'middle';
}

/**
 * Extract visual continuity elements between two shots
 */
function extractShotVisualContinuity(
  previousShot: Shot,
  currentShot: Shot,
  previousEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | null
): string[] {
  const elements: string[] = [];
  const prevDesc = previousShot.description.toLowerCase();
  const currDesc = currentShot.description.toLowerCase();

  // Check for character references
  const characterPatterns = [
    /(?:the |a )?protagonist/gi,
    /(?:the |a )?hero(?:ine)?/gi,
    /(?:the |a )?character/gi,
    /(?:he|she|they)\s/gi,
    /(?:his|her|their)\s/gi,
  ];

  for (const pattern of characterPatterns) {
    if (pattern.test(prevDesc) && pattern.test(currDesc)) {
      elements.push('Maintain character visual continuity');
      break;
    }
  }

  // Check for object/prop references
  const objectPatterns = [
    /artifact|object|item/gi,
    /weapon|sword|gun/gi,
    /vehicle|car|ship/gi,
    /device|machine|computer/gi,
  ];

  for (const pattern of objectPatterns) {
    if (pattern.test(prevDesc) && pattern.test(currDesc)) {
      elements.push('Maintain prop/object continuity');
      break;
    }
  }

  // Lighting continuity from enhancers
  if (previousEnhancers?.lighting && previousEnhancers.lighting.length > 0) {
    elements.push(`Match lighting: ${previousEnhancers.lighting.slice(0, 2).join(', ')}`);
  }

  // Mood continuity from enhancers
  if (previousEnhancers?.mood && previousEnhancers.mood.length > 0) {
    elements.push(`Maintain mood: ${previousEnhancers.mood[0]}`);
  }

  // Arc continuity
  if (previousShot.arcId && currentShot.arcId && previousShot.arcId === currentShot.arcId) {
    elements.push(`Same story arc: ${previousShot.arcName || previousShot.arcId}`);
  }

  return elements;
}

/**
 * Format shot transition context as prompt enhancement
 * 
 * @param context - Shot transition context
 * @returns Formatted string to append to shot prompt
 */
export function formatShotTransitionContextForPrompt(context: ShotTransitionContext): string {
  const parts: string[] = [];

  // Narrative position guidance
  const positionGuidance: Record<string, string> = {
    opening: 'SHOT POSITION: Opening shot - establish the scene setting and initial character positions.',
    middle: 'SHOT POSITION: Middle sequence - develop action and maintain visual rhythm.',
    climax: 'SHOT POSITION: Climax moment - heighten tension and visual intensity.',
    closing: 'SHOT POSITION: Closing shot - resolve the scene beat and prepare for transition.',
  };
  parts.push(positionGuidance[context.narrativePosition]);

  // Previous shot reference
  if (context.previousShotDescription) {
    parts.push(`PREVIOUS SHOT: "${context.previousShotDescription.slice(0, 150)}..."`);
  }

  // Transition type
  if (context.transitionType) {
    parts.push(`TRANSITION FROM PREVIOUS: ${context.transitionType}`);
  }

  // Visual continuity elements
  if (context.visualContinuity.length > 0) {
    parts.push(`SHOT CONTINUITY: ${context.visualContinuity.join('; ')}`);
  }

  // Scene keyframe reference
  if (context.sceneKeyframeRef) {
    parts.push('REFERENCE: Use scene keyframe for consistent environment and lighting.');
  }

  return parts.join('\n');
}

/**
 * Propagate keyframe from scene to shots
 * First shot gets scene's start keyframe (or single keyframe)
 * Last shot gets scene's end keyframe (if bookend mode)
 * 
 * @param scene - Scene with keyframe data
 * @param generatedImages - Record of scene keyframes by scene ID
 * @returns Record mapping shot ID to keyframe image
 */
export function propagateKeyframesToShots(
  scene: Scene,
  generatedImages: Record<string, string>
): Record<string, string> {
  const shots = scene.timeline?.shots || [];
  const keyframeMap: Record<string, string> = {};

  if (shots.length === 0) return keyframeMap;

  // Get scene's keyframe(s)
  const sceneKeyframe = generatedImages[scene.id];
  const isBookendMode = scene.keyframeMode === 'bookend';
  const startKeyframe = isBookendMode ? scene.keyframeStart : sceneKeyframe;
  const endKeyframe = isBookendMode ? scene.keyframeEnd : sceneKeyframe;

  // Assign keyframes to shots
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    if (!shot) continue;

    if (i === 0 && startKeyframe) {
      // First shot gets start keyframe
      keyframeMap[shot.id] = startKeyframe;
    } else if (i === shots.length - 1 && endKeyframe && isBookendMode) {
      // Last shot gets end keyframe (only in bookend mode)
      keyframeMap[shot.id] = endKeyframe;
    } else if (sceneKeyframe) {
      // Middle shots get scene's general keyframe
      keyframeMap[shot.id] = sceneKeyframe;
    }
  }

  return keyframeMap;
}
