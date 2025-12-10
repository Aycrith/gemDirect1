import { ReactNode } from "react";

// ============================================================================
// Keyframe Version History Support
// ============================================================================

/**
 * Individual keyframe version with metadata.
 * Used for version history tracking and best-of-N selection.
 */
export interface KeyframeVersion {
  /** Base64 image data */
  image: string;
  /** Timestamp when generated */
  timestamp: number;
  /** Vision analysis score (if analyzed) */
  score?: {
    composition: number;
    lighting: number;
    characterAccuracy: number;
    styleConsistency: number;
    overall: number;
  };
  /** Prompt used to generate this version (for debugging/refinement) */
  prompt?: string;
  /** Whether this version was selected as "best" by user */
  isSelected?: boolean;
}

/**
 * Keyframe data with version history.
 * Extends single/bookend mode with optional version tracking.
 */
export interface KeyframeVersionedData {
  /** Currently active keyframe */
  current: string;
  /** Version history (most recent first, max 5 stored) */
  versions: KeyframeVersion[];
  /** Active selection index in versions array (if using version history) */
  selectedVersionIndex?: number;
}

// Keyframe data types for bookend workflow support
// Extended to support: single string | bookend pair | versioned with history
export type KeyframeData = 
  | string 
  | { start: string; end: string }
  | KeyframeVersionedData;

// Type guard functions for KeyframeData
export function isSingleKeyframe(data: KeyframeData): data is string {
  return typeof data === 'string';
}

export function isBookendKeyframe(data: KeyframeData): data is { start: string; end: string } {
  return typeof data === 'object' && 'start' in data && 'end' in data && !('current' in data);
}

export function isVersionedKeyframe(data: KeyframeData): data is KeyframeVersionedData {
  return typeof data === 'object' && 'current' in data && 'versions' in data;
}

/**
 * Get the currently active image from any KeyframeData type.
 * Utility function for consistent access across all keyframe modes.
 */
export function getActiveKeyframeImage(data: KeyframeData | undefined): string | undefined {
  if (!data) return undefined;
  if (isSingleKeyframe(data)) return data;
  if (isBookendKeyframe(data)) return data.start; // Use start frame as preview
  if (isVersionedKeyframe(data)) return data.current;
  return undefined;
}

/**
 * Structured response for video generation operations.
 * Provides explicit success/error states with typed error codes.
 */
export interface VideoGenerationResponse {
  /** Whether the generation succeeded */
  ok: boolean;
  /** Generated video data (only present when ok=true) */
  video?: {
    /** Base64 data URL (data:video/mp4;base64,...) */
    data: string;
    /** Suggested filename */
    filename: string;
    /** Video duration in seconds */
    duration: number;
    /** Frame count if available */
    frameCount?: number;
  };
  /** Error code for programmatic handling (only present when ok=false) */
  errorCode?: 'PROFILE_NOT_FOUND' | 'WORKFLOW_INVALID' | 'COMFYUI_ERROR' | 'FETCH_FAILED' | 'TIMEOUT' | 'INVALID_OUTPUT';
  /** Human-readable error message (only present when ok=false) */
  errorMessage?: string;
  /** Additional diagnostic details */
  details?: Record<string, unknown>;
}

export interface Shot {
  id: string;
  title?: string;
  description: string;
  purpose?: string;
  arcId?: string;
  arcName?: string;
  heroMoment?: boolean;
  /**
   * Keyframe for this shot (single mode) or start keyframe (bookend mode).
   * If undefined, falls back to scene-level keyframe.
   */
  keyframeStart?: string;
  /**
   * End keyframe for bookend mode.
   * Only used when LocalGenerationSettings.keyframeMode === 'bookend'.
   */
  keyframeEnd?: string;
  /**
   * Generated video for this shot as base64 data URL.
   */
  generatedVideo?: string;
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
    
    // Vision LLM feedback metadata
    metadata?: {
        originalSummary?: string;   // Original summary before vision refinement
        refinedByVision?: boolean;  // Whether vision LLM refined this scene
        refinedAt?: number;         // Timestamp of refinement
        [key: string]: unknown;     // Allow other metadata
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

export type ToastType = 'success' | 'error' | 'info' | 'warning';

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

export type SuggestionPayload = Partial<Shot> & { enhancers?: ShotEnhancers[string] } & { type?: string } & { action?: string; priority?: string };

// --- Discriminated Union for Suggestions ---
// Base suggestion properties shared by coherence gate suggestions
interface BaseSuggestionProps { reason?: string; targetId?: string; }

export interface UpdateShotSuggestion extends BaseSuggestionProps { type: 'UPDATE_SHOT'; shot_id: string; payload: SuggestionPayload; description: string; }
export interface AddShotAfterSuggestion extends BaseSuggestionProps { type: 'ADD_SHOT_AFTER'; after_shot_id: string; payload: SuggestionPayload; description: string; }
export interface UpdateTransitionSuggestion extends BaseSuggestionProps { type: 'UPDATE_TRANSITION'; transition_index: number; payload: SuggestionPayload; description: string; }
export interface UpdateStoryBibleSuggestion extends BaseSuggestionProps { type: 'UPDATE_STORY_BIBLE'; payload: { field: keyof StoryBible; new_content: string }; description: string; }
export interface UpdateDirectorsVisionSuggestion extends BaseSuggestionProps { type: 'UPDATE_DIRECTORS_VISION'; payload: { new_content: string }; description: string; }
export interface FlagSceneForReviewSuggestion extends BaseSuggestionProps { type: 'FLAG_SCENE_FOR_REVIEW'; payload: { scene_id: string; reason: string }; description: string; }
export interface UpdateSceneSuggestion extends BaseSuggestionProps { type: 'UPDATE_SCENE'; payload: SuggestionPayload; description: string; }

export type Suggestion =
    | UpdateShotSuggestion
    | AddShotAfterSuggestion
    | UpdateTransitionSuggestion
    | UpdateStoryBibleSuggestion
    | UpdateDirectorsVisionSuggestion
    | FlagSceneForReviewSuggestion
    | UpdateSceneSuggestion;
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
    /** Correlation ID for tracing across services (optional) */
    correlationId?: string;
    /** Structured error code for categorization (optional) */
    errorCode?: string;
    /** Stack trace for debugging (only on errors, optional) */
    stackTrace?: string;
    /** Duration of the API call in milliseconds (optional) */
    durationMs?: number;
}

export interface WorkflowInput {
    nodeId: string;
    nodeType: string;
    nodeTitle?: string;
    inputName: string;
    inputType: string; // e.g., 'STRING', 'IMAGE'
}

export type MappableData = 'none' | 'human_readable_prompt' | 'full_timeline_json' | 'keyframe_image' | 'negative_prompt' | 'start_image' | 'end_image' | 'ref_image' | 'control_video' | 'input_video' | 'chain_start_frame' | 'chain_end_frame' | 'character_reference_image' | 'ipadapter_weight' | 'feta_weight';

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
  /** Required ComfyUI nodes for this workflow */
  requiredNodes?: string[];
  /** Required data mappings for this workflow */
  requiredMappings?: MappableData[];
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
  
  // UI-friendly fields for advanced profile management
  displayName?: string;
  description?: string;
  status?: 'complete' | 'incomplete' | 'error';
  
  // Post-processing options (video workflows)
  postProcessing?: WorkflowPostProcessingOptions;
}

/**
 * Post-processing options applied after video generation
 */
export interface WorkflowPostProcessingOptions {
  /** Enable endpoint snapping: replace first/last frames with keyframes (default: true for bookend) */
  snapEndpointsToKeyframes?: boolean;
  /** Number of frames to snap at video start (default: 1) */
  startFrameCount?: number;
  /** Number of frames to snap at video end (default: 1) */
  endFrameCount?: number;
  /** Blend mode: 'hard' = instant replace, 'fade' = linear blend (default: 'hard') */
  blendMode?: 'hard' | 'fade';
  /** For fade mode: number of frames to blend over (default: 3) */
  fadeFrames?: number;
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
    
    // LLM Configuration (Text Generation - Story Bible, Scenes, etc.)
    llmProviderUrl?: string;
    llmModel?: string;
    llmTemperature?: number;
    llmTimeoutMs?: number;
    llmRequestFormat?: string;
    llmSeed?: number;
    
    // Vision LLM Configuration (Image Analysis & Prompt Feedback)
    // If not specified, falls back to text LLM settings (for unified vision models like Qwen3-VL)
    visionLLMProviderUrl?: string;
    visionLLMModel?: string;
    visionLLMTemperature?: number;
    visionLLMTimeoutMs?: number;
    // Whether to use a single model for both text and vision (abliterated models like Qwen3-VL)
    useUnifiedVisionModel?: boolean;
    
    // Feature Flags (optional for backward compatibility)
    featureFlags?: import('./utils/featureFlags').FeatureFlags;
    
    // Provider Health Configuration
    healthCheckIntervalMs?: number;  // Default: 30000 (30s), min: 5000 (5s)
    
    // Prompt Configuration
    promptVersion?: string;  // Template version for prompt construction
    promptVariantId?: string; // Selected prompt variant for A/B tests
    promptVariantLabel?: string; // Human-friendly variant label for telemetry
    
    // Quality Enhancement
    upscalerWorkflowProfile?: string;  // Profile ID for video upscaling (optional)
    characterWorkflowProfile?: string; // Profile ID for character consistency (optional)
    sceneChainedWorkflowProfile?: string; // Profile ID for chain-of-frames scene generation (optional)
    sceneBookendWorkflowProfile?: string; // Profile ID for bookend (first-last-frame) video generation (default: 'wan-flf2v')
    
    // Bookend QA Mode
    bookendQAMode?: {
        enabled: boolean;
        enforceKeyframePassthrough: boolean;
        overrideAISuggestions: boolean;
        notes?: string;
    };
    
    // ComfyUI Fetch Settings (for video/image retrieval robustness)
    comfyUIFetchMaxRetries?: number;   // Max retry attempts for fetching assets (default: 3)
    comfyUIFetchTimeoutMs?: number;    // Timeout in ms for each fetch attempt (default: 15000)
    comfyUIFetchRetryDelayMs?: number; // Delay between retries in ms (default: 1000)
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

/**
 * Result of preflight analysis (keyframe pair continuity check).
 * Stored with generation status to surface in UI.
 */
export interface PreflightResult {
    /** Whether preflight ran at all */
    ran: boolean;
    /** Pass/Fail status */
    passed?: boolean;
    /** Reason for skip or failure */
    reason?: string;
    /** Timestamp of preflight run */
    timestamp?: number;
    /** Detailed scores (if available) */
    scores?: {
        characterMatch?: number;
        environmentMatch?: number;
        cameraMatch?: number;
        overallContinuity?: number;
    };
}

export interface LocalGenerationStatus {
      status: 'idle' | 'queued' | 'running' | 'complete' | 'error' | 'warning';
      message: string;
      progress: number; // 0-100
      promptId?: string;
      queue_position?: number;
      node_title?: string;
      final_output?: LocalGenerationOutput;
      /** Result of last preflight analysis (keyframe pair check) */
      preflightResult?: PreflightResult;
      /** Phase indicator for multi-step operations (bookend generation, preflight) */
      phase?: 'bookend-start-video' | 'bookend-end-video' | 'splicing' | 'native-bookend-video' | 'preflight';
  }

// ============================================================================
// Generation Job Tracking (Phase 1 - State Management Overhaul)
// ============================================================================

/**
 * Generation job type for tracking different generation operations
 */
export type GenerationJobType = 'keyframe' | 'video' | 'shot-image' | 'batch';

/**
 * Generation job status for tracking progress
 */
export type GenerationJobStatus = 'pending' | 'queued' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Tracks a single generation job for state persistence.
 * Used by the unified scene state store to maintain generation
 * tracking across navigation and page refreshes.
 */
export interface GenerationJob {
    /** Unique job identifier */
    id: string;
    
    /** Type of generation operation */
    type: GenerationJobType;
    
    /** Scene this job belongs to */
    sceneId: string;
    
    /** Shot ID if this is a shot-specific job */
    shotId?: string;
    
    /** Current job status */
    status: GenerationJobStatus;
    
    /** Progress percentage (0-100) */
    progress: number;
    
    /** Unix timestamp when job was created */
    createdAt: number;
    
    /** Unix timestamp when job started processing */
    startedAt?: number;
    
    /** Unix timestamp when job completed or failed */
    completedAt?: number;
    
    /** Result data (base64 image, video path, etc.) */
    result?: string;
    
    /** Error message if job failed */
    error?: string;
    
    /** ComfyUI prompt ID for tracking */
    comfyPromptId?: string;
    
    /** Queue position if waiting */
    queuePosition?: number;
    
    /** Current node being processed (for progress display) */
    currentNode?: string;
}

/**
 * Video data structure for generated videos
 */
export interface VideoData {
    /** Video file path or URL */
    videoPath: string;
    
    /** Video duration in seconds */
    duration: number;
    
    /** Original filename */
    filename: string;
    
    /** Extracted frames as base64 (optional) */
    frames?: string[];
    
    /** Generation timestamp */
    generatedAt: number;
    
    /** Scene ID this video belongs to */
    sceneId: string;
    
    /** Shot ID if shot-specific */
    shotId?: string;
}

export type SceneGenerationStatus = 'pending' | 'generating' | 'complete' | 'failed';

/**
 * Full scene generation status object with metadata
 * Used by useSceneGenerationWatcher hook to track per-scene status
 */
export interface SceneStatus {
    sceneId: string;
    title: string;
    status: SceneGenerationStatus;
    progress: number;
    error?: string;
    startTime?: number;
    endTime?: number;
}

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
  
  /**
   * Provenance tracking for descriptor synchronization.
   * - 'storyBible': Descriptor was auto-synced from Story Bible
   * - 'userEdit': User manually edited the descriptor (protected from auto-sync)
   * @default 'storyBible'
   */
  descriptorSource?: 'storyBible' | 'userEdit';
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
