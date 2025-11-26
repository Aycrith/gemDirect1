import { ReactNode } from "react";

// Keyframe data types for bookend workflow support
export type KeyframeData = string | { start: string; end: string };

// Type guard functions for KeyframeData
export function isSingleKeyframe(data: KeyframeData): data is string {
  return typeof data === 'string';
}

export function isBookendKeyframe(data: KeyframeData): data is { start: string; end: string } {
  return typeof data === 'object' && 'start' in data && 'end' in data;
}

export interface Shot {
  id: string;
  title?: string;
  description: string;
  purpose?: string;
  arcId?: string;
  arcName?: string;
  heroMoment?: boolean;
}

export interface CreativeEnhancers {
  framing: string[];
  movement: string[];
  lens: string[];
  pacing: string[];
  lighting: string[];
  mood: string[];
  vfx: string[];
  plotEnhancements: string[];
  transitions: string[];
}

export type ShotEnhancers = Record<string, Partial<Omit<CreativeEnhancers, 'transitions'>>>;

export interface TimelineData {
    shots: Shot[];
    shotEnhancers: ShotEnhancers;
    transitions: string[];
    negativePrompt: string;
}

export interface Scene {
    id: string;
    title: string;
    summary: string;
    timeline: TimelineData;
    generatedPayload?: { json: string; text: string; structured: any[]; negativePrompt: string };
    heroArcId?: string;
    heroArcName?: string;
    heroArcSummary?: string;
    heroArcOrder?: number;
    shotPurpose?: string;
    heroMoment?: boolean;
    
    // Bookend workflow support (optional for backward compatibility)
    keyframeMode?: 'single' | 'bookend'; // Default: 'single'
    keyframeStart?: string;  // Base64 image data for start keyframe
    keyframeEnd?: string;    // Base64 image data for end keyframe
    temporalContext?: {      // Temporal metadata for bookends
        startMoment: string;   // E.g., "Explorer approaches artifact"
        endMoment: string;     // E.g., "Artifact begins glowing"
        duration?: number;     // Shot duration in seconds (optional)
    };
}

export interface SceneImageGenerationStatus {
    status: 'idle' | 'generating' | 'complete' | 'error';
    progress?: number; // 0-100
    error?: string;
    startedAt?: number; // Unix timestamp
    completedAt?: number; // Unix timestamp
    promptLength?: number; // For debugging
}

export interface StoryBible {
    logline: string;
    characters: string;
    setting: string;
    plotOutline: string;
    heroArcs?: HeroArc[];
}

// ============================================================================
// Story Bible V2 - Structured Character Profiles & Plot Scenes
// ============================================================================

/**
 * Character appearance details for visual consistency
 */
export interface CharacterAppearance {
    /** Height description (e.g., "tall", "5'8\"", "average") */
    height?: string;
    /** Body type (e.g., "athletic", "slim", "stocky") */
    build?: string;
    /** Hair description (color, length, style) */
    hair?: string;
    /** Eye color and notable features */
    eyes?: string;
    /** Age range or specific age */
    age?: string;
    /** Unique identifying features (scars, tattoos, etc.) */
    distinguishingFeatures?: string[];
    /** Default or signature outfit */
    typicalAttire?: string;
}

/**
 * Character relationship for story coherence
 */
export interface CharacterRelationship {
    /** ID of related character */
    characterId: string;
    /** Name of related character (for display) */
    characterName: string;
    /** Nature of relationship */
    relationshipType: 'ally' | 'enemy' | 'family' | 'romantic' | 'mentor' | 'rival' | 'neutral';
    /** Brief description of the relationship */
    description?: string;
}

/**
 * Structured character profile for Story Bible V2.
 * Designed for downstream VAE/ControlNet integration.
 */
export interface CharacterProfile {
    /** Unique identifier */
    id: string;
    /** Character's full name */
    name: string;
    /** Character's age (number or description) */
    age?: string | number;
    /** Visual appearance details for image generation */
    appearance: CharacterAppearance;
    /** Core personality traits (3-5 adjectives) */
    personality: string[];
    /** Background and history (concise, max 80 words) */
    backstory: string;
    /** Primary motivations driving the character */
    motivations: string[];
    /** Relationships with other characters */
    relationships: CharacterRelationship[];
    /** Compact visual descriptor for prompt injection (max 50 words) */
    visualDescriptor: string;
    /** Role in the story */
    role: 'protagonist' | 'antagonist' | 'supporting' | 'background';
    /** Link to VisualBibleCharacter for consistency workflow */
    visualBibleCharacterId?: string;
}

/**
 * Plot scene structure for organized story beats
 */
export interface PlotScene {
    /** Act number (1, 2, or 3) */
    actNumber: 1 | 2 | 3;
    /** Scene number within the act */
    sceneNumber: number;
    /** Brief scene summary (max 50 words) */
    summary: string;
    /** Visual cues for image/video generation */
    visualCues: string[];
    /** Character arcs advanced in this scene */
    characterArcs: string[];
    /** Pacing indicator for editing rhythm */
    pacing: 'slow' | 'medium' | 'fast';
    /** Key location for the scene */
    location?: string;
    /** Time of day or temporal context */
    timeOfDay?: string;
    /** Emotional tone of the scene */
    emotionalTone?: string;
}

/**
 * Token metadata for budget tracking
 */
export interface StoryBibleTokenMetadata {
    loglineTokens: number;
    charactersTokens: number;
    settingTokens: number;
    plotOutlineTokens: number;
    totalTokens: number;
    /** Timestamp of last token count */
    lastUpdated: number;
}

/**
 * Story Bible V2 with structured characters and plot scenes.
 * Extends StoryBible for backward compatibility.
 */
export interface StoryBibleV2 extends StoryBible {
    /** Schema version for migration support */
    version: '2.0';
    /** Structured character profiles (replaces markdown characters) */
    characterProfiles: CharacterProfile[];
    /** Structured plot scenes with visual cues */
    plotScenes: PlotScene[];
    /** Token usage metadata for budget enforcement */
    tokenMetadata?: StoryBibleTokenMetadata;
    /** Genre classification for template selection */
    genre?: string;
    /** Themes for thematic consistency */
    themes?: string[];
}

/**
 * Type guard to check if a StoryBible is V2 format
 */
export function isStoryBibleV2(bible: StoryBible): bible is StoryBibleV2 {
    return 'version' in bible && (bible as StoryBibleV2).version === '2.0';
}

/**
 * Type guard to check if a character profile has complete appearance data
 */
export function hasCompleteAppearance(profile: CharacterProfile): boolean {
    const { appearance } = profile;
    return !!(
        appearance.hair &&
        appearance.eyes &&
        (appearance.height || appearance.build) &&
        profile.visualDescriptor
    );
}

// ============================================================================

export interface HeroArc {
    id: string;
    name: string;
    summary: string;
    emotionalShift: string;
    importance: number;
}

export type WorkflowStage = 'idea' | 'bible' | 'vision' | 'director' | 'continuity';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

export interface PlanExpansionStrategy {
  id: string;
  label: string;
  description?: string;
  isAvailable: boolean;
  isDefault?: boolean;
  disabledReason?: string;
}

export interface MediaGenerationProviderCapabilities {
  images: boolean;
  video: boolean;
}

export interface MediaGenerationProvider {
  id: string;
  label: string;
  description?: string;
  isAvailable: boolean;
  isDefault?: boolean;
  disabledReason?: string;
  capabilities: MediaGenerationProviderCapabilities;
}

export interface ControlSectionConfig {
    id: keyof Omit<CreativeEnhancers, 'transitions' | 'plotEnhancements'>;
    title: string;
    icon: ReactNode;
    options: string[];
}

export type SuggestionPayload = Partial<Shot> & { enhancers?: ShotEnhancers[string] } & { type?: string };

// --- Discriminated Union for Suggestions ---
export interface UpdateShotSuggestion { type: 'UPDATE_SHOT'; shot_id: string; payload: SuggestionPayload; description: string; }
export interface AddShotAfterSuggestion { type: 'ADD_SHOT_AFTER'; after_shot_id: string; payload: SuggestionPayload; description: string; }
export interface UpdateTransitionSuggestion { type: 'UPDATE_TRANSITION'; transition_index: number; payload: SuggestionPayload; description: string; }
export interface UpdateStoryBibleSuggestion { type: 'UPDATE_STORY_BIBLE'; payload: { field: keyof StoryBible; new_content: string }; description: string; }
export interface UpdateDirectorsVisionSuggestion { type: 'UPDATE_DIRECTORS_VISION'; payload: { new_content: string }; description: string; }
export interface FlagSceneForReviewSuggestion { type: 'FLAG_SCENE_FOR_REVIEW'; payload: { scene_id: string; reason: string }; description: string; }

export type Suggestion =
    | UpdateShotSuggestion
    | AddShotAfterSuggestion
    | UpdateTransitionSuggestion
    | UpdateStoryBibleSuggestion
    | UpdateDirectorsVisionSuggestion
    | FlagSceneForReviewSuggestion;
// --- End Discriminated Union ---


export interface CoDirectorResult {
  thematic_concept: string;
  reasoning: string;
  suggested_changes: Suggestion[];
}

export interface ContinuityResult {
  scores: {
    narrative_coherence: number;
    aesthetic_alignment: number;
    thematic_resonance: number;
  };
  overall_feedback: string;
  suggested_changes: Suggestion[];
}

export interface SceneContinuityData {
  videoFile?: File;
  videoSrc?: string;
  status: 'idle' | 'analyzing' | 'scoring' | 'complete' | 'error';
  error?: string;
  videoAnalysis?: string;
  continuityResult?: ContinuityResult;
  frames?: string[];
  continuityScore?: SceneContinuityScore;
  isAccepted?: boolean;  // Scene marked as final after passing coherence gate
  
  // Intelligent feedback loop fields (optional for backward compatibility)
  autoGenerateSuggestions?: boolean;  // Auto-generate suggestions when score drops
  lastSuggestionTimestamp?: number;   // Prevent duplicate suggestion generation
  regenerationAttempts?: number;      // Track retry count for quality issues
}

export interface SceneContinuityScore {
  visualBibleConsistency: number;  // 0–1 or 0–100
  styleBoardReuseCount: number;    // how many scenes share boards
  structuralContinuity?: number;   // new
  transitionQuality?: number;      // new
  durationConsistency?: number;    // new
  overallScore: number;            // composite
}

export interface BatchShotTask {
    shot_id: string;
    description: string;
    actions: Array<'REFINE_DESCRIPTION' | 'SUGGEST_ENHANCERS'>;
}

export interface BatchShotResult {
    shot_id: string;
    refined_description?: string;
    suggested_enhancers?: Partial<Omit<CreativeEnhancers, 'transitions'>>;
}

export interface DetailedShotResult {
    description: string;
    suggested_enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
}

export interface ApiCallLog {
    id: number;
    timestamp: number;
    context: string;
    model: string;
    tokens: number;
    status: 'success' | 'error';
}

export interface WorkflowInput {
    nodeId: string;
    nodeType: string;
    nodeTitle?: string;
    inputName: string;
    inputType: string; // e.g., 'STRING', 'IMAGE'
}

export type MappableData = 'none' | 'human_readable_prompt' | 'full_timeline_json' | 'keyframe_image' | 'negative_prompt';

// Key is `${nodeId}:${inputName}`
export type WorkflowMapping = Record<string, MappableData>; 

export interface WorkflowProfileMappingHighlight {
  type: MappableData;
  nodeId: string;
  inputName: string;
  nodeTitle: string;
}

export interface WorkflowProfileMetadata {
  lastSyncedAt?: number;
  highlightMappings?: WorkflowProfileMappingHighlight[];
  missingMappings?: MappableData[];
  warnings?: string[];
}

/**
 * Workflow profile category for pipeline organization
 */
export type WorkflowCategory = 'keyframe' | 'video' | 'upscaler' | 'character' | 'scene-builder';

export interface WorkflowProfile {
  id: string;
  label: string;
  workflowJson: string;
  mapping: WorkflowMapping;
  sourcePath?: string;
  syncedAt?: number;
  metadata?: WorkflowProfileMetadata;
  
  // Extended fields for pipeline organization (optional for backward compatibility)
  category?: WorkflowCategory;
  chainPosition?: number;  // Order in processing pipeline (1, 2, 3...)
  inputProfiles?: string[];  // Profile IDs this depends on
}

export interface ComfyUIStatusQueueSummary {
  running?: number;
  pending?: number;
  latencyMs?: number;
  error?: string;
}

export interface ComfyUIStatusSystemStats {
  durationMs?: number;
  summary?: string;
  warning?: string;
  devices?: Array<{
    name?: string;
    type?: string;
    free?: number | string;
    total?: number | string;
  }>;
}

export interface ComfyUIStatusProfileSummary {
  id: string;
  label: string;
  sourcePath?: string;
  highlightMappings: WorkflowProfileMappingHighlight[];
  mappingEntries: Array<{ key: string; dataType: MappableData }>;
  missingMappings: MappableData[];
  warnings: string[];
  hasTextMapping: boolean;
  hasKeyframeMapping: boolean;
  referencesCanonical: boolean;
}

export interface ComfyUIStatusSummary {
  timestamp: string;
  summaryPath?: string;
  helperLogPath?: string;
  comfyUrl: string;
  queue?: ComfyUIStatusQueueSummary;
  systemStats?: ComfyUIStatusSystemStats;
  workflows: ComfyUIStatusProfileSummary[];
  workflowFiles: Array<{ path: string; exists: boolean }>;
  warnings: string[];
}

export interface LocalGenerationSettings {
    // Video Provider Selection
    videoProvider?: 'comfyui-local' | 'fastvideo-local';
    
    // ComfyUI Configuration
    comfyUIUrl: string;
    comfyUIClientId: string;
    comfyUIWebSocketUrl?: string;
    workflowJson: string; // Will store the FETCHED workflow
    mapping: WorkflowMapping;
    modelId?: string; // 'comfy-svd' | 'wan-video' | others later
    workflowProfiles?: Record<string, WorkflowProfile>;
    
    // Keyframe Generation Mode
    keyframeMode?: 'single' | 'bookend'; // Default: 'single'
    imageWorkflowProfile?: string; // Profile ID for keyframe generation (e.g., 'wan-t2i')
    videoWorkflowProfile?: string; // Profile ID for video generation (e.g., 'wan-i2v')
    
    // FastVideo Configuration
    fastVideo?: {
        endpointUrl: string;
        modelId: string;
        fps: number;
        numFrames: number;
        height: number;
        width: number;
        seed?: number;
        outputDir: string;
        attentionBackend: string;
    };
    
    // LLM Configuration
    llmProviderUrl?: string;
    llmModel?: string;
    llmTemperature?: number;
    llmTimeoutMs?: number;
    llmRequestFormat?: string;
    llmSeed?: number;
    
    // Feature Flags (optional for backward compatibility)
    featureFlags?: import('./utils/featureFlags').FeatureFlags;
    
    // Provider Health Configuration
    healthCheckIntervalMs?: number;  // Default: 30000 (30s), min: 5000 (5s)
    
    // Prompt Configuration
    promptVersion?: string;  // Template version for prompt construction
    
    // Quality Enhancement
    upscalerWorkflowProfile?: string;  // Profile ID for video upscaling (optional)
    characterWorkflowProfile?: string; // Profile ID for character consistency (optional)
}

export interface LocalGenerationAsset {
    type: 'image' | 'video';
    data: string;
    filename: string;
}

export interface LocalGenerationOutput extends LocalGenerationAsset {
    images?: string[];
    videos?: string[];
    assets?: LocalGenerationAsset[];
}

export interface LocalGenerationStatus {
    status: 'idle' | 'queued' | 'running' | 'complete' | 'error';
    message: string;
    progress: number; // 0-100
    queue_position?: number;
    node_title?: string;
    final_output?: LocalGenerationOutput;
}

export type SceneGenerationStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface VisualBibleCharacter {
  id: string;
  name: string;
  description?: string;
  // Base64 or URL references to images
  imageRefs?: string[];

  role?: 'protagonist' | 'antagonist' | 'supporting' | 'background';
  visualTraits?: string[];      // e.g., ["short hair", "red jacket"]
  identityTags?: string[];      // e.g., ["Courier-001", "Mirror-Self"]
  
  // Character consistency fields (optional for backward compatibility)
  embeddingRef?: string;        // Path to LoRA/embedding file for CCC workflow
  ipAdapterWeight?: number;     // IP-Adapter strength (0-1) for identity preservation
  faceEncodingRef?: string;     // Face identity vector reference
  appearanceCount?: number;     // Number of scenes character appears in
  lastSeenSceneId?: string;     // Last scene where character appeared
  
  // Story Bible V2 linkage (optional for backward compatibility)
  storyBibleCharacterId?: string; // Links to CharacterProfile.id for guardrail sync
}

export interface VisualBibleStyleBoard {
  id: string;
  title: string;
  description?: string;
  imageRefs?: string[];
  tags?: string[];
}

export interface VisualBible {
  characters: VisualBibleCharacter[];
  styleBoards: VisualBibleStyleBoard[];
  // Optional mapping from story/scene/shot to visual references
  sceneKeyframes?: Record<string, string[]>; // sceneId → imageRefs
  shotReferences?: Record<string, string[]>; // shotId → imageRefs

  sceneCharacters?: Record<string, string[]>; // sceneId -> characterIds
  shotCharacters?: Record<string, string[]>;  // shotId -> characterIds
}
