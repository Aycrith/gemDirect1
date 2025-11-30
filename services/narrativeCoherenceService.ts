/**
 * Narrative Coherence Service
 * 
 * Maintains a narrative state machine that tracks story elements across generations.
 * Ensures consistency in characters, locations, temporal position, and emotional arc
 * throughout the segmented video generation pipeline.
 * 
 * @module services/narrativeCoherenceService
 */

import { Scene, Shot, StoryBible, VisualBible } from '../types';

/**
 * Character appearance state
 */
export interface CharacterState {
  id: string;
  name: string;
  /** Last scene where character appeared */
  lastSeenSceneId: string | null;
  /** Last shot where character appeared */
  lastSeenShotId: string | null;
  /** Number of scenes character has appeared in */
  appearanceCount: number;
  /** Scenes since last appearance */
  scenesSinceLastAppearance: number;
  /** Current emotional state (if tracked) */
  emotionalState?: string;
  /** Last known physical state/position */
  lastKnownState?: string;
}

/**
 * Location/environment state
 */
export interface LocationState {
  id: string;
  name: string;
  /** Last scene where location was used */
  lastUsedSceneId: string | null;
  /** Visual characteristics established */
  establishedCharacteristics: string[];
  /** Time of day last shown */
  lastTimeOfDay?: string;
  /** Weather/atmosphere last shown */
  lastAtmosphere?: string;
}

/**
 * Temporal position in narrative
 */
export interface TemporalState {
  /** Current position in story time */
  storyTimePosition: string;
  /** Time elapsed since story start (narrative time) */
  narrativeTimeElapsed?: string;
  /** Time of day in current scene */
  currentTimeOfDay?: string;
  /** Day/night cycle position */
  dayNightCycle?: 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'evening' | 'night';
}

/**
 * Emotional arc state
 */
export interface EmotionalArcState {
  /** Current arc phase (e.g., "Rising Action", "Climax", "Resolution") */
  currentPhase: string;
  /** Hero's Journey beat number (1-12) */
  heroJourneyBeat?: number;
  /** Emotional intensity (0-1) */
  intensity: number;
  /** Dominant emotion */
  dominantEmotion?: string;
  /** Tension level */
  tensionLevel: 'low' | 'medium' | 'high' | 'peak';
}

/**
 * Active plot threads
 */
export interface PlotThread {
  id: string;
  name: string;
  /** Thread status */
  status: 'introduced' | 'developing' | 'climaxing' | 'resolved' | 'dormant';
  /** Scenes where this thread is active */
  activeInScenes: string[];
  /** Key elements of this thread */
  keyElements: string[];
}

/**
 * Complete narrative state machine state
 */
export interface NarrativeState {
  /** Version for state serialization */
  version: number;
  /** Last update timestamp */
  lastUpdatedAt: number;
  /** Scene ID when state was last updated */
  lastUpdatedForScene: string | null;
  /** Character states */
  characters: Record<string, CharacterState>;
  /** Location states */
  locations: Record<string, LocationState>;
  /** Current temporal state */
  temporal: TemporalState;
  /** Emotional arc state */
  emotionalArc: EmotionalArcState;
  /** Active plot threads */
  plotThreads: Record<string, PlotThread>;
  /** Custom state extensions */
  extensions?: Record<string, unknown>;
}

/**
 * Narrative state summary for prompt injection
 */
export interface NarrativeStateSummary {
  /** Active characters in current scene */
  activeCharacters: string[];
  /** Characters who should maintain consistency */
  characterConsistencyNotes: string[];
  /** Current location description */
  currentLocation: string | null;
  /** Temporal markers */
  temporalMarkers: string[];
  /** Emotional guidance */
  emotionalGuidance: string;
  /** Continuity warnings */
  warnings: string[];
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Create initial narrative state from story bible
 */
export function createInitialNarrativeState(
  storyBible: StoryBible,
  visualBible?: VisualBible
): NarrativeState {
  const characters: Record<string, CharacterState> = {};
  
  // Extract characters from visual bible if available
  if (visualBible?.characters) {
    for (const char of visualBible.characters) {
      characters[char.id] = {
        id: char.id,
        name: char.name,
        lastSeenSceneId: null,
        lastSeenShotId: null,
        appearanceCount: 0,
        scenesSinceLastAppearance: 0,
      };
    }
  }

  // Parse characters from story bible text
  const characterMentions = extractCharacterMentions(storyBible.characters || '');
  for (const name of characterMentions) {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    if (!characters[id]) {
      characters[id] = {
        id,
        name,
        lastSeenSceneId: null,
        lastSeenShotId: null,
        appearanceCount: 0,
        scenesSinceLastAppearance: 0,
      };
    }
  }

  return {
    version: 1,
    lastUpdatedAt: Date.now(),
    lastUpdatedForScene: null,
    characters,
    locations: {},
    temporal: {
      storyTimePosition: 'Beginning of story',
      currentTimeOfDay: undefined,
      dayNightCycle: undefined,
    },
    emotionalArc: {
      currentPhase: 'Setup',
      heroJourneyBeat: 1,
      intensity: 0.2,
      tensionLevel: 'low',
    },
    plotThreads: {},
  };
}

/**
 * Update narrative state after processing a scene
 */
export function updateNarrativeStateForScene(
  state: NarrativeState,
  scene: Scene,
  visualBible?: VisualBible
): NarrativeState {
  const updated = { ...state };
  updated.lastUpdatedAt = Date.now();
  updated.lastUpdatedForScene = scene.id;

  // Update character appearances
  const sceneCharacterIds = visualBible?.sceneCharacters?.[scene.id] || [];
  const mentionedCharacters = extractCharacterMentions(scene.summary || '');
  
  for (const charId of Object.keys(updated.characters)) {
    const char = updated.characters[charId];
    if (!char) continue;
    const isInScene = sceneCharacterIds.includes(charId) || 
      mentionedCharacters.some(name => name.toLowerCase().includes(char.name?.toLowerCase() ?? ''));
    
    if (isInScene) {
      updated.characters[charId] = {
        ...char,
        lastSeenSceneId: scene.id,
        appearanceCount: (char.appearanceCount ?? 0) + 1,
        scenesSinceLastAppearance: 0,
      } as CharacterState;
    } else {
      updated.characters[charId] = {
        ...char,
        scenesSinceLastAppearance: (char.scenesSinceLastAppearance ?? 0) + 1,
      } as CharacterState;
    }
  }

  // Update emotional arc based on hero's journey position
  if (typeof scene.heroArcOrder === 'number') {
    updated.emotionalArc = updateEmotionalArc(updated.emotionalArc, scene.heroArcOrder);
  }

  // Update temporal state
  if (scene.temporalContext) {
    updated.temporal = {
      ...updated.temporal,
      storyTimePosition: scene.temporalContext.startMoment || updated.temporal.storyTimePosition,
    };
  }

  // Extract and update location
  const locationName = extractLocationFromScene(scene);
  if (locationName) {
    const locationId = locationName.toLowerCase().replace(/\s+/g, '-');
    updated.locations[locationId] = {
      id: locationId,
      name: locationName,
      lastUsedSceneId: scene.id,
      establishedCharacteristics: extractLocationCharacteristics(scene),
    };
  }

  return updated;
}

/**
 * Update narrative state after processing a shot
 */
export function updateNarrativeStateForShot(
  state: NarrativeState,
  shot: Shot,
  sceneId: string,
  visualBible?: VisualBible
): NarrativeState {
  const updated = { ...state };
  updated.lastUpdatedAt = Date.now();

  // Update character states based on shot
  const shotCharacterIds = visualBible?.shotCharacters?.[shot.id] || [];
  const mentionedCharacters = extractCharacterMentions(shot.description || '');

  for (const charId of Object.keys(updated.characters)) {
    const char = updated.characters[charId];
    if (!char) continue;
    const isInShot = shotCharacterIds.includes(charId) ||
      mentionedCharacters.some(name => name.toLowerCase().includes(char.name?.toLowerCase() ?? ''));

    if (isInShot) {
      updated.characters[charId] = {
        ...char,
        lastSeenSceneId: sceneId,
        lastSeenShotId: shot.id,
        lastKnownState: extractCharacterState(shot.description, char.name ?? ''),
      } as CharacterState;
    }
  }

  return updated;
}

/**
 * Generate narrative state summary for prompt injection
 */
export function generateNarrativeStateSummary(
  state: NarrativeState,
  currentSceneId: string,
  visualBible?: VisualBible
): NarrativeStateSummary {
  const warnings: string[] = [];
  const characterConsistencyNotes: string[] = [];
  const activeCharacters: string[] = [];

  // Identify characters who should be in this scene
  const sceneCharacterIds = visualBible?.sceneCharacters?.[currentSceneId] || [];
  
  for (const charId of sceneCharacterIds) {
    const char = state.characters[charId];
    if (char) {
      activeCharacters.push(char.name);
      
      // Check for long absence
      if (char.scenesSinceLastAppearance >= 5) {
        warnings.push(
          `Character "${char.name}" reappearing after ${char.scenesSinceLastAppearance} scenes - ensure consistent appearance`
        );
      }
      
      // Add consistency notes
      if (char.lastKnownState) {
        characterConsistencyNotes.push(`${char.name}: Last seen ${char.lastKnownState}`);
      }
    }
  }

  // Get current location
  const currentLocation = Object.values(state.locations)
    .find(loc => loc.lastUsedSceneId === currentSceneId)
    ?.name || null;

  // Build temporal markers
  const temporalMarkers: string[] = [];
  if (state.temporal.storyTimePosition) {
    temporalMarkers.push(`Story position: ${state.temporal.storyTimePosition}`);
  }
  if (state.temporal.dayNightCycle) {
    temporalMarkers.push(`Time: ${state.temporal.dayNightCycle}`);
  }

  // Build emotional guidance
  const emotionalGuidance = buildEmotionalGuidance(state.emotionalArc);

  return {
    activeCharacters,
    characterConsistencyNotes,
    currentLocation,
    temporalMarkers,
    emotionalGuidance,
    warnings,
  };
}

/**
 * Format narrative state summary for prompt injection
 */
export function formatNarrativeStateForPrompt(summary: NarrativeStateSummary): string {
  const parts: string[] = [];

  if (summary.activeCharacters.length > 0) {
    parts.push(`ACTIVE CHARACTERS: ${summary.activeCharacters.join(', ')}`);
  }

  if (summary.characterConsistencyNotes.length > 0) {
    parts.push(`CHARACTER NOTES: ${summary.characterConsistencyNotes.join('; ')}`);
  }

  if (summary.currentLocation) {
    parts.push(`LOCATION: ${summary.currentLocation}`);
  }

  if (summary.temporalMarkers.length > 0) {
    parts.push(`TEMPORAL: ${summary.temporalMarkers.join('; ')}`);
  }

  if (summary.emotionalGuidance) {
    parts.push(`EMOTIONAL ARC: ${summary.emotionalGuidance}`);
  }

  if (summary.warnings.length > 0) {
    parts.push(`⚠️ CONTINUITY WARNINGS: ${summary.warnings.join('; ')}`);
  }

  return parts.join('\n');
}

/**
 * Track character appearance and return warnings
 */
export function trackCharacterAppearance(
  state: NarrativeState,
  sceneId: string,
  characterIds: string[]
): { warnings: string[]; updatedState: NarrativeState } {
  const warnings: string[] = [];
  let updatedState = { ...state };

  for (const charId of characterIds) {
    const char = updatedState.characters[charId];
    if (!char) continue;

    // Check for long absence
    if (char.scenesSinceLastAppearance >= 5) {
      warnings.push(
        `Character "${char.name}" is reappearing after being absent for ${char.scenesSinceLastAppearance} scenes. ` +
        `Ensure visual consistency with their last appearance.`
      );
    }

    // Update character state
    updatedState.characters[charId] = {
      ...char,
      lastSeenSceneId: sceneId,
      appearanceCount: char.appearanceCount + 1,
      scenesSinceLastAppearance: 0,
    };
  }

  // Increment absence count for characters not in this scene
  for (const charId of Object.keys(updatedState.characters)) {
    if (!characterIds.includes(charId)) {
      const char = updatedState.characters[charId];
      if (!char) continue;
      updatedState.characters[charId] = {
        ...char,
        scenesSinceLastAppearance: (char.scenesSinceLastAppearance ?? 0) + 1,
      } as CharacterState;
    }
  }

  return { warnings, updatedState };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract character names from text
 */
function extractCharacterMentions(text: string): string[] {
  const names: string[] = [];
  
  // Look for capitalized names (simple heuristic)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match;
  
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    if (!name) continue;
    // Filter out common non-name words
    const excluded = ['The', 'This', 'That', 'Scene', 'Shot', 'Act', 'Story', 'Chapter'];
    if (!excluded.includes(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  
  return names;
}

/**
 * Extract location name from scene
 */
function extractLocationFromScene(scene: Scene): string | null {
  const summary = scene.summary || '';
  
  // Common location patterns
  const locationPatterns = [
    /(?:in|at|inside|outside)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
    /(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:room|hall|chamber|forest|city|building)/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = summary.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Extract location characteristics from scene
 */
function extractLocationCharacteristics(scene: Scene): string[] {
  const characteristics: string[] = [];
  const summary = scene.summary || '';
  
  // Extract lighting
  const lightingPatterns = /\b(dark|bright|dim|glowing|shadowy|lit|illuminated)\b/gi;
  const lightingMatches = summary.match(lightingPatterns);
  if (lightingMatches) {
    characteristics.push(...lightingMatches.map(l => l.toLowerCase()));
  }
  
  // Extract atmosphere
  const atmospherePatterns = /\b(misty|foggy|rainy|sunny|stormy|peaceful|tense)\b/gi;
  const atmosphereMatches = summary.match(atmospherePatterns);
  if (atmosphereMatches) {
    characteristics.push(...atmosphereMatches.map(a => a.toLowerCase()));
  }
  
  // Deduplicate using Set and Array.from for ES5 compatibility
  return Array.from(new Set(characteristics));
}

/**
 * Extract character state from shot description
 */
function extractCharacterState(description: string, characterName: string): string | null {
  const lowerName = characterName.toLowerCase();
  
  // Find sentences containing the character name
  const sentences = description.split(/[.!?]/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(lowerName)) {
      return sentence.trim().slice(0, 100);
    }
  }
  
  return null;
}

/**
 * Update emotional arc based on hero's journey beat
 */
function updateEmotionalArc(current: EmotionalArcState, heroArcOrder: number): EmotionalArcState {
  const phases: Record<number, { phase: string; intensity: number; tensionLevel: EmotionalArcState['tensionLevel'] }> = {
    1: { phase: 'Ordinary World', intensity: 0.2, tensionLevel: 'low' },
    2: { phase: 'Call to Adventure', intensity: 0.3, tensionLevel: 'low' },
    3: { phase: 'Refusal of the Call', intensity: 0.4, tensionLevel: 'medium' },
    4: { phase: 'Meeting the Mentor', intensity: 0.4, tensionLevel: 'medium' },
    5: { phase: 'Crossing the Threshold', intensity: 0.5, tensionLevel: 'medium' },
    6: { phase: 'Tests, Allies, Enemies', intensity: 0.6, tensionLevel: 'medium' },
    7: { phase: 'Approach to Inmost Cave', intensity: 0.7, tensionLevel: 'high' },
    8: { phase: 'The Ordeal', intensity: 0.95, tensionLevel: 'peak' },
    9: { phase: 'Reward', intensity: 0.7, tensionLevel: 'high' },
    10: { phase: 'The Road Back', intensity: 0.6, tensionLevel: 'medium' },
    11: { phase: 'Resurrection', intensity: 0.85, tensionLevel: 'high' },
    12: { phase: 'Return with Elixir', intensity: 0.4, tensionLevel: 'low' },
  };

  const config = phases[heroArcOrder];
  
  // If no matching phase, return current state with updated beat number
  if (!config) {
    return {
      ...current,
      heroJourneyBeat: heroArcOrder,
    };
  }
  
  return {
    ...current,
    currentPhase: config.phase,
    heroJourneyBeat: heroArcOrder,
    intensity: config.intensity,
    tensionLevel: config.tensionLevel,
  };
}

/**
 * Build emotional guidance string from arc state
 */
function buildEmotionalGuidance(arc: EmotionalArcState): string {
  const parts: string[] = [];
  
  parts.push(`Phase: ${arc.currentPhase}`);
  
  const intensityDesc = arc.intensity < 0.3 ? 'calm' : 
    arc.intensity < 0.6 ? 'building' :
    arc.intensity < 0.85 ? 'intense' : 'climactic';
  parts.push(`Intensity: ${intensityDesc}`);
  
  parts.push(`Tension: ${arc.tensionLevel}`);
  
  if (arc.dominantEmotion) {
    parts.push(`Emotion: ${arc.dominantEmotion}`);
  }
  
  return parts.join(' | ');
}

/**
 * Serialize narrative state to JSON
 */
export function serializeNarrativeState(state: NarrativeState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize narrative state from JSON
 */
export function deserializeNarrativeState(json: string): NarrativeState | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.version && parsed.characters && parsed.temporal && parsed.emotionalArc) {
      return parsed as NarrativeState;
    }
    return null;
  } catch {
    return null;
  }
}
