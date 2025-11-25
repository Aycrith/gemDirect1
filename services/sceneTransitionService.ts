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
 */

import { Scene, StoryBible } from '../types';

export interface SceneTransitionContext {
  sceneId: string;
  previousSceneEndState: string | null;  // null for first scene
  transitionBridge: string;              // How this scene connects to previous
  narrativeMomentum: string;            // What carries forward
  visualContinuity: string[];           // Visual elements to maintain
}

export interface TransitionContextBatch {
  contexts: SceneTransitionContext[];
  generatedAt: number;
  storyBibleHash: string;  // To detect if story changed
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
