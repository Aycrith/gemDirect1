import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { Scene, Shot, TimelineData, CreativeEnhancers, BatchShotTask, ShotEnhancers, Suggestion, LocalGenerationSettings, LocalGenerationStatus, DetailedShotResult, StoryBible, VisualBible } from '../types';
import CreativeControls from './CreativeControls';
import TransitionSelector from './TransitionSelector';
// P2 Performance: Lazy load CoDirector (only shown when user requests suggestions)
const CoDirector = lazy(() => import('./CoDirector'));
import PlusIcon from './icons/PlusIcon';
import TrashIcon from './icons/TrashIcon';
import SparklesIcon from './icons/SparklesIcon';
import ImageIcon from './icons/ImageIcon';
import StatusChip from './StatusChip';
import ShotCardSkeleton from './ShotCardSkeleton';
import { generateVideoRequestPayloads, VideoPayloadItem } from '../services/payloadService';
import { generateTimelineVideos, stripDataUrlPrefix, validateWorkflowAndMappings, generateVideoFromBookendsNative, generateSceneBookendsLocally, generateSingleBookendLocally, checkNodeDependencies } from '../services/comfyUIService';
import { generateSceneVideoChained } from '../services/videoGenerationService';
import { generateSceneTransitionContext } from '../services/sceneTransitionService';
import { isBookendKeyframe, isSingleKeyframe, getActiveKeyframeImage, type KeyframeData } from '../types';
import FinalPromptModal from './FinalPromptModal';
import VisualBibleLinkModal from './VisualBibleLinkModal';
import LocalGenerationStatusComponent from './LocalGenerationStatus';
import TimelineIcon from './icons/TimelineIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';
import Tooltip from './Tooltip';
import SaveIcon from './icons/SaveIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import { useInteractiveSpotlight, useArtifactMetadata, type SceneTelemetryMetadata, useVisualBible, useNarrativeState } from '../utils/hooks';
import { getVideoSourceWithFallback } from '../utils/videoValidation';
import GuidedAction from './GuidedAction';
import GuideCard from './GuideCard';
import CompassIcon from './icons/CompassIcon';
import NegativePromptSuggestions from './NegativePromptSuggestions';
import TemplateGuidancePanel from './TemplateGuidancePanel';
import MandatoryElementsChecklist from './MandatoryElementsChecklist';
import { usePlanExpansionActions, usePlanExpansionStrategy } from '../contexts/PlanExpansionStrategyContext';
import { useMediaGenerationActions } from '../contexts/MediaGenerationProviderContext';
import { useTemplateContext } from '../contexts/TemplateContext';
import type { ApiStateChangeCallback, ApiLogCallback } from '../services/planExpansionService';
import { getSceneVisualBibleContext } from '../services/continuityVisualContext';
import { validateShotDescription } from '../services/shotValidator';
import { generateCorrelationId, logCorrelation } from '../utils/correlation';
// Local fallback service for batch operations when Gemini fails
import * as localFallbackService from '../services/localFallbackService';
// Phase 7: Feature flag integration for UI indicators
import { isFeatureEnabled, getFeatureFlag, getEffectiveFlagsForQAMode } from '../utils/featureFlags';
// Phase 7: Video upscaling service
import { isUpscalingSupported, upscaleVideo, DEFAULT_UPSCALE_CONFIG } from '../services/videoUpscalingService';
// Temporal context auto-generation for bookend workflow
import { generateTemporalContext, extractTemporalContextHeuristic } from '../services/temporalContextService';
// Phase 1C: Unified scene store integration
import { useUnifiedSceneStoreEnabled } from '../hooks/useSceneStore';
import { useSceneStateStore } from '../services/sceneStateStore';
// Generation queue for VRAM-safe serial execution
import { getGenerationQueue, createVideoTask, GenerationStatus } from '../services/generationQueue';
// Phase 6: Global WebSocket event manager for ComfyUI progress
import { comfyEventManager, type ComfyEvent } from '../services/comfyUIEventManager';
// Phase 1D: Generation status Zustand store integration
import { 
    useSceneGenStatus, 
    updateSceneStatus as storeUpdateSceneStatus,
    useGenerationStatusStore,
    DEFAULT_GENERATION_STATUS
} from '../services/generationStatusStore';
// Vision LLM Feedback Integration
import VisionFeedbackPanel from './VisionFeedbackPanel';
import { analyzeKeyframe, getVisionConfigFromSettings, type VisionFeedbackResult, type VisionAnalysisRequest } from '../services/visionFeedbackService';
// Video Analysis Feedback Integration
import VideoAnalysisCard from './VideoAnalysisCard';
import type { VideoFeedbackResult, VideoAnalysisRequest as VideoAnalysisRequestType } from '../services/videoFeedbackService';
import { analyzeVideo as analyzeVideoQuality } from '../services/videoFeedbackService';
import { evaluateVideoQuality, isQualityGateEnabled, getQualityGateStatusMessage, type QualityGateResult } from '../services/videoQualityGateService';
// Keyframe Pair Analysis Preflight (Phase 8: Bookend QA)
import { analyzeKeyframePair, keyframePairMeetsThresholds, getBlockingMessage, type KeyframePairRequest } from '../services/keyframePairAnalysisService';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore - Kept for future VRAM monitoring feature
const _formatVramValue = (value?: number | string | null): string => {
    if (value == null) return 'n/a';
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(numeric)) return 'n/a';
    return `${Math.round(numeric / 1048576)}MB`;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore - Kept for future VRAM monitoring feature
const _formatVramDelta = (value?: number | string | null): string => {
    if (value == null) return 'n/a';
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(numeric)) return 'n/a';
    const sign = numeric >= 0 ? '+' : '-';
    return `${sign}${Math.round(Math.abs(numeric) / 1048576)}MB`;
};

const buildTimelineTelemetryChips = (telemetry?: SceneTelemetryMetadata): string[] => {
    if (!telemetry) {
        return [];
    }
    const chips: string[] = [];
    if (typeof telemetry.DurationSeconds === 'number') {
        chips.push(`DurationSeconds=${telemetry.DurationSeconds.toFixed(1)}s`);
    }
    if (typeof telemetry.MaxWaitSeconds === 'number') {
        chips.push(`MaxWaitSeconds=${telemetry.MaxWaitSeconds}s`);
    }
    if (typeof telemetry.PollIntervalSeconds === 'number') {
        chips.push(`PollIntervalSeconds=${telemetry.PollIntervalSeconds}s`);
    }
    if (typeof telemetry.HistoryAttempts === 'number') {
        chips.push(`HistoryAttempts=${telemetry.HistoryAttempts}`);
    }
    const pollLimitLabel = telemetry.HistoryAttemptLimit != null ? telemetry.HistoryAttemptLimit : 'unbounded';
    chips.push(`pollLimit=${pollLimitLabel}`);
    const retryBudgetLabel =
        telemetry.SceneRetryBudget != null && telemetry.SceneRetryBudget > 0 ? telemetry.SceneRetryBudget : 'unbounded';
    chips.push(`SceneRetryBudget=${retryBudgetLabel}`);
    if (typeof telemetry.PostExecutionTimeoutSeconds === 'number') {
        chips.push(`PostExecutionTimeoutSeconds=${telemetry.PostExecutionTimeoutSeconds}s`);
    }
    if (telemetry.ExecutionSuccessDetected) {
        chips.push('ExecutionSuccessDetected=true');
    }
    if (telemetry.ExecutionSuccessAt) {
        try {
            const resolved = new Date(telemetry.ExecutionSuccessAt);
            if (!Number.isNaN(resolved.getTime())) {
                chips.push(`ExecutionSuccessAt=${resolved.toLocaleTimeString()}`);
            } else {
                chips.push(`ExecutionSuccessAt=${telemetry.ExecutionSuccessAt}`);
            }
        } catch {
            chips.push(`ExecutionSuccessAt=${telemetry.ExecutionSuccessAt}`);
        }
    }
    if (telemetry.HistoryExitReason) {
        chips.push(`HistoryExitReason=${telemetry.HistoryExitReason}`);
    }
    if (telemetry.HistoryPostExecutionTimeoutReached) {
        chips.push('HistoryPostExecutionTimeoutReached=true');
    }
    if (telemetry.GPU?.Name) {
        chips.push(`GPU=${telemetry.GPU.Name}`);
        if (telemetry.GPU.VramBeforeMB != null) {
            chips.push(`VRAMBeforeMB=${telemetry.GPU.VramBeforeMB}MB`);
        }
        if (telemetry.GPU.VramAfterMB != null) {
            chips.push(`VRAMAfterMB=${telemetry.GPU.VramAfterMB}MB`);
        }
        if (telemetry.GPU.VramDeltaMB != null) {
            chips.push(`VRAMDeltaMB=${telemetry.GPU.VramDeltaMB}MB`);
        }
    }
    if (telemetry.System?.FallbackNotes?.length) {
        const notes = telemetry.System.FallbackNotes.filter(Boolean);
        if (notes.length > 0) {
            chips.push(`fallback ${notes.join('; ')}`);
        }
    }
    return chips;
};

interface TimelineEditorProps {
    scene: Scene;
    onUpdateScene: (scene: Scene) => void;
    directorsVision: string;
    storyBible: StoryBible;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
    scenes: Scene[];
    onApplySuggestion: (suggestion: Suggestion, sceneId: string) => void;
    generatedImages: Record<string, KeyframeData>;
    generatedShotImages: Record<string, string>;
    setGeneratedShotImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    onSceneKeyframeGenerated?: (sceneId: string, data: KeyframeData) => void;
    localGenSettings: LocalGenerationSettings;
    localGenStatus: Record<string, LocalGenerationStatus>;
    setLocalGenStatus: React.Dispatch<React.SetStateAction<Record<string, LocalGenerationStatus>>>;
    isRefined: boolean;
    onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
    uiRefreshEnabled?: boolean;
    addToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const TimelineItem: React.FC<{
    shot: Shot;
    index: number;
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>;
    imageUrl?: string;
    isGeneratingImage: boolean;
    onDescriptionChange: (shotId: string, newDescription: string) => void;
    onEnhancersChange: (shotId: string, newEnhancers: Partial<Omit<CreativeEnhancers, 'transitions'>>) => void;
    onDeleteShot: (shotId: string) => void;
    onGenerateImage: (shotId: string) => void;
    onLinkToVisualBible: (shotId: string, imageData: string) => void;
    isDragging: boolean;
    visualBible: VisualBible | null;
}> = ({ shot, index, enhancers, imageUrl, isGeneratingImage, onDescriptionChange, onEnhancersChange, onDeleteShot, onGenerateImage, onLinkToVisualBible, isDragging, visualBible }) => {
    const [isControlsVisible, setIsControlsVisible] = useState(false);
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();
    
    // Local state for textarea to prevent lag during rapid typing
    // Syncs to parent on blur instead of every keystroke
    const [localDescription, setLocalDescription] = useState(shot.description);
    const isTypingRef = useRef(false);
    
    // Sync from parent when shot.description changes externally (e.g., AI suggestions)
    useEffect(() => {
        if (!isTypingRef.current) {
            setLocalDescription(shot.description);
        }
    }, [shot.description]);

    const hasVisualBibleLinks = visualBible?.shotReferences?.[shot.id];
    
    // Show shot-level keyframe status
                    const hasShotKeyframe = !!shot.keyframeStart;
                    const hasBothBookends = !!(shot.keyframeStart && shot.keyframeEnd);
                    
                    // Optimization: Memoize validation result to avoid re-running regex on every render
                    const shotValidation = useMemo(() => validateShotDescription(shot.description), [shot.description]);
                    
                    const shotNeedsAttention = shotValidation.errorCount > 0;
                    const shotHasWarnings = shotValidation.warningCount > 0 && !shotNeedsAttention;
                    const shotStatusLabel = shotNeedsAttention
                        ? 'Needs attention'
                        : shotHasWarnings
                            ? 'Warning'
                            : 'Converged';
                    const shotStatusClasses = shotNeedsAttention
                        ? 'bg-red-600/20 text-red-300 border-red-600/30'
                        : shotHasWarnings
                            ? 'bg-amber-600/20 text-amber-300 border-amber-600/30'
                            : 'bg-emerald-600/20 text-emerald-300 border-emerald-600/30';
                    const shotStatusTitle = shotValidation.issues.length > 0
                        ? shotValidation.issues.map(issue => `${issue.code}: ${issue.message}`).join(' | ')
                        : 'No validation issues detected';
    
    return (
        <div 
            ref={spotlightRef} 
            draggable
            className={`shot-card bg-gray-800/60 p-4 rounded-lg border border-gray-700/60 transition-all duration-200 flex gap-4 interactive-spotlight focus-within:ring-2 focus-within:ring-amber-400 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 ${isDragging ? 'dragging' : 'hover:shadow-lg hover:shadow-amber-500/10 hover:border-gray-600'}`}
            role="article"
            aria-label={`Shot ${index + 1}`}
        >
            {/* Display shot-level keyframe if available, otherwise use imageUrl (legacy) */}
            {(shot.keyframeStart || imageUrl) && (
                <div className="w-1/4 flex-shrink-0 min-w-[80px]">
                    {/* In bookend mode, show start and end side-by-side if both exist */}
                    {hasBothBookends ? (
                        <div className="flex gap-1">
                            <div className="relative flex-1">
                                <img src={`data:image/jpeg;base64,${shot.keyframeStart}`} alt={`Start keyframe for shot ${index + 1}`} className="rounded-md aspect-square object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] text-center py-0.5 rounded-b-md">Start</div>
                            </div>
                            <div className="relative flex-1">
                                <img src={`data:image/jpeg;base64,${shot.keyframeEnd}`} alt={`End keyframe for shot ${index + 1}`} className="rounded-md aspect-square object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] text-center py-0.5 rounded-b-md">End</div>
                            </div>
                        </div>
                    ) : (
                        <img src={`data:image/jpeg;base64,${shot.keyframeStart || imageUrl}`} alt={`Preview for shot ${index + 1}`} className="rounded-md aspect-square object-cover" />
                    )}
                    <button
                        onClick={() => onLinkToVisualBible(shot.id, shot.keyframeStart || imageUrl || '')}
                        className="mt-1 w-full px-2 py-1 bg-amber-600 text-white text-xs rounded-md hover:bg-amber-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[32px]"
                    >
                        Add to Visual Bible
                    </button>
                </div>
            )}
            <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-grow min-w-0">
                        <label className="block text-sm font-bold text-gray-300 mb-2 cursor-grab flex items-center gap-2 flex-wrap">
                            <span>Shot {index + 1}</span>
                            <span
                                title={shotStatusTitle}
                                className={`px-2 py-0.5 ml-1 rounded-full text-[10px] font-semibold tracking-wide border ${shotStatusClasses}`}
                            >
                                {shotStatusLabel}
                            </span>
                            {/* Shot-level keyframe status indicator */}
                            {hasShotKeyframe && (
                                <span 
                                    className={`px-1 py-0.5 text-xs rounded border ${hasBothBookends ? 'bg-green-600/20 text-green-300 border-green-600/30' : 'bg-blue-600/20 text-blue-300 border-blue-600/30'}`} 
                                    title={hasBothBookends ? 'Has start and end keyframes' : 'Has keyframe'}
                                >
                                    {hasBothBookends ? '🖼️⟷🖼️' : '🖼️'}
                                </span>
                            )}
                            {hasVisualBibleLinks && (
                                <span className="px-1 py-0.5 bg-amber-600/20 text-amber-300 text-xs rounded border border-amber-600/30" title="Linked to Visual Bible">
                                    VB
                                </span>
                            )}
                            {isGeneratingImage && (
                                <StatusChip status="generating" label="Generating..." />
                            )}
                        </label>
                        <textarea
                            value={localDescription}
                            onChange={(e) => {
                                isTypingRef.current = true;
                                setLocalDescription(e.target.value);
                            }}
                            onBlur={() => {
                                isTypingRef.current = false;
                                // Only propagate if changed
                                if (localDescription !== shot.description) {
                                    onDescriptionChange(shot.id, localDescription);
                                }
                            }}
                            rows={3}
                            className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                            placeholder="Describe the shot..."
                            aria-label={`Description for shot ${index + 1}`}
                        />
                    </div>
                    {/* Action buttons - grouped for better visual hierarchy */}
                    <div className="action-rail flex flex-col items-end gap-2 mt-8 p-2 bg-gray-800/40 rounded-lg border border-gray-700/40" role="toolbar" aria-label="Shot actions">
                        <button
                            onClick={() => setIsControlsVisible(!isControlsVisible)}
                            className={`p-2 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${isControlsVisible ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                            aria-label="Toggle creative controls"
                            aria-expanded={isControlsVisible}
                        >
                            <SparklesIcon className="w-5 h-5" />
                        </button>
                         <button 
                            onClick={() => onGenerateImage(shot.id)} 
                            disabled={isGeneratingImage} 
                            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-wait min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" 
                            aria-label="Generate shot preview"
                        >
                            {isGeneratingImage ? <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ImageIcon className="w-5 h-5" />}
                        </button>
                        <button 
                            onClick={() => onDeleteShot(shot.id)} 
                            className="p-2 rounded-full bg-red-800/50 hover:bg-red-700 text-red-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400" 
                            aria-label="Delete shot"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {isControlsVisible && (
                    <div className="mt-4 pt-4 border-t border-gray-700/50 fade-in" role="region" aria-label="Creative controls">
                        <CreativeControls value={enhancers} onChange={(newEnhancers) => onEnhancersChange(shot.id, newEnhancers)} />
                    </div>
                )}
            </div>
        </div>
    );
};

const TimelineEditor: React.FC<TimelineEditorProps> = ({ 
    scene, 
    onUpdateScene, 
    directorsVision, 
    storyBible, 
    onApiStateChange, 
    onApiLog, 
    scenes, 
    onApplySuggestion,
    generatedImages,
    generatedShotImages,
    setGeneratedShotImages,
    onSceneKeyframeGenerated,
    localGenSettings,
    localGenStatus,
    setLocalGenStatus,
    isRefined,
    onUpdateSceneSummary,
    uiRefreshEnabled = false,
    addToast
}) => {
    const [timeline, setTimeline] = useState<TimelineData>(scene.timeline);
    const [coDirectorResult, setCoDirectorResult] = useState<any | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [promptsToExport, setPromptsToExport] = useState<{ json: string; text: string; structured: VideoPayloadItem[]; negativePrompt: string } | null>(null);
    const [isGeneratingShotImage, setIsGeneratingShotImage] = useState<Record<string, boolean>>({});
    const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [isBatchProcessing, setIsBatchProcessing] = useState<false | 'description' | 'enhancers'>(false);
    const [batchProgressMessage, setBatchProgressMessage] = useState<string>('');
    const [isGeneratingInitialShots, setIsGeneratingInitialShots] = useState(false);
    const [isTemplateGuidanceOpen, setIsTemplateGuidanceOpen] = useState(false);
    const [linkModalState, setLinkModalState] = useState<{ isOpen: boolean; imageData: string; sceneId?: string; shotId?: string } | null>(null);
    // Phase 7: Video upscaling state
    const [isUpscaling, setIsUpscaling] = useState(false);
    
    // Vision LLM Feedback state
    const [visionFeedback, setVisionFeedback] = useState<VisionFeedbackResult | null>(null);
    const [isAnalyzingVision, setIsAnalyzingVision] = useState(false);
    const [visionError, setVisionError] = useState<string | undefined>(undefined);
    
    // Video Analysis Feedback state
    const [videoFeedback, setVideoFeedback] = useState<VideoFeedbackResult | null>(null);
    const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
    const [qualityGateResult, setQualityGateResult] = useState<QualityGateResult | null>(null);
    
    // Phase 1C: Zustand store integration with feature flag
    // When enabled, prefer reading from the new store for consistency
    // The store returns undefined when flag is disabled (falls back to existing props)
    const isStoreEnabled = useUnifiedSceneStoreEnabled(localGenSettings);

    // Subscribe to store updates (unconditional hooks)
    const storeScenes = useSceneStateStore(state => state.scenes);
    const storeGeneratedImages = useSceneStateStore(state => state.generatedImages);
    const storeGeneratedShotImages = useSceneStateStore(state => state.generatedShotImages);
    
    // Phase 1D: Generation status store integration with feature flag
    // When enabled, use Zustand store instead of prop-drilled localGenStatus
    const isGenStatusStoreEnabled = isFeatureEnabled(localGenSettings?.featureFlags, 'useGenerationStatusStore');
    
    // Get scene status from Zustand store (always call to maintain hook order)
    const storeSceneStatus = useSceneGenStatus(scene.id);
    
    // Adapter: route to store or props based on feature flag
    const effectiveSceneStatus: LocalGenerationStatus = isGenStatusStoreEnabled 
        ? storeSceneStatus 
        : (localGenStatus[scene.id] ?? DEFAULT_GENERATION_STATUS);
    
    // Unified update function that routes to store or props
    const updateSceneGenStatus = useCallback((updates: Partial<LocalGenerationStatus>) => {
        if (isGenStatusStoreEnabled) {
            storeUpdateSceneStatus(scene.id, updates);
        } else {
            setLocalGenStatus(prev => ({
                ...prev,
                [scene.id]: { ...(prev[scene.id] ?? DEFAULT_GENERATION_STATUS), ...updates }
            }));
        }
    }, [isGenStatusStoreEnabled, scene.id, setLocalGenStatus]);
    
    // Use store data when enabled, otherwise use existing props (prop drilling)
    // Phase 1C: These variables now route through the unified store when flag is enabled
    const effectiveScenes = isStoreEnabled ? storeScenes : scenes;
    const effectiveGeneratedImages = isStoreEnabled ? storeGeneratedImages : generatedImages;
    const effectiveGeneratedShotImages = isStoreEnabled ? storeGeneratedShotImages : generatedShotImages;
    
    // Log store usage during development for debugging
    useEffect(() => {
        if (isStoreEnabled && process.env.NODE_ENV === 'development') {
            console.debug('[TimelineEditor] Using unified Zustand store for scene data');
        }
    }, [isStoreEnabled]);
    
    const templateContext = useTemplateContext();
    const { updateCoveredElements: _updateCoveredElements } = templateContext;
    
    // Pipeline artifact context - currently not connected to a real pipeline
    // These are placeholders for future integration with storyToVideoPipeline service
    // Using 'as' casts to allow TypeScript to narrow properly in conditional blocks
    type QueuePolicyType = {
        SceneRetryBudget?: number;
        HistoryMaxWaitSeconds?: number;
        HistoryPollIntervalSeconds?: number;
        HistoryMaxAttempts?: number;
        PostExecutionTimeoutSeconds?: number;
    };
    const queuePolicy = undefined as QueuePolicyType | undefined;
    
    type LlmMetadataType = {
        providerUrl?: string;
        model?: string;
        requestFormat?: string;
        seed?: string;
        durationMs?: number;
        error?: string;
    };
    const llmMetadata = undefined as LlmMetadataType | undefined;
    
    type HealthCheckType = {
        Status?: string;
        Url?: string;
        Override?: string;
        Models?: string | number;
        SkipReason?: string;
        Error?: string;
    };
    const healthCheck = undefined as HealthCheckType | undefined;
    
    // Pipeline artifact - would contain RunId, Archive path, etc.
    type ArtifactType = { RunId?: string; Archive?: string };
    const latestArtifact = undefined as ArtifactType | undefined;
    
    // Scene snapshot type for pipeline integration (future)
    type SceneSnapshot = {
        SceneId: string;
        FrameCount: number;
        FrameFloor: number;
        HistoryPollLog?: Array<{ Status?: string }>;
        HistoryConfig?: {
            MaxWaitSeconds?: number;
            PollIntervalSeconds?: number;
            PostExecutionTimeoutSeconds?: number;
        };
        Telemetry?: SceneTelemetryMetadata;
        Warnings?: string[];
        Errors?: string[];
    } | null;
    
    const latestSceneSnapshot: SceneSnapshot = useMemo<SceneSnapshot>(
        () => null as SceneSnapshot, // Would come from pipeline artifact when implemented
        [scene.id],
    );
    const latestSceneInsights = latestSceneSnapshot
        ? (() => {
              const historyLog = latestSceneSnapshot.HistoryPollLog ?? [];
            return {
                 historyConfig: latestSceneSnapshot.HistoryConfig,
                 pollLogCount: historyLog.length,
                 lastPollStatus: historyLog.length > 0 ? historyLog[historyLog.length - 1]?.Status ?? 'n/a' : 'n/a',
                 pollLimit: latestSceneSnapshot.Telemetry?.HistoryAttemptLimit ?? 'unbounded',
                 fallbackNotes: latestSceneSnapshot.Telemetry?.System?.FallbackNotes?.filter(Boolean) ?? [],
             };
        })()
        : null;
    const latestTelemetryChips = latestSceneSnapshot ? buildTimelineTelemetryChips(latestSceneSnapshot.Telemetry) : [];
    const latestGpu = latestSceneSnapshot?.Telemetry?.GPU;
    const latestFallbackNotes = latestSceneSnapshot?.Telemetry?.System?.FallbackNotes?.filter(Boolean) ?? [];
    
    // Use artifact metadata for scene-level render status
    const { artifact: artifactMetadata } = useArtifactMetadata(5000); // Auto-refresh every 5 seconds
    const sceneArtifactMetadata = useMemo(
        () => artifactMetadata?.Scenes.find((meta) => meta.SceneId === scene.id) ?? null,
        [artifactMetadata, scene.id],
    );
    
    // Visual Bible hook for future integration
    const { visualBible } = useVisualBible();
    
    // Phase 7: Narrative state persistence for coherence tracking across generations
    const { 
        narrativeState, 
        updateNarrativeState 
    } = useNarrativeState(storyBible, visualBible);
    
    // Get Visual Bible context for this scene
    const visualBibleInfo = useMemo(() => getSceneVisualBibleContext(visualBible, scene.id), [scene.id, visualBible]);
    
    // Phase 7: Compute active generation features for UI indicators
    const activeFeatures = useMemo(() => {
        const flags = localGenSettings?.featureFlags;
        const hasCharacterRefs = (visualBible?.characters?.filter(c => c.imageRefs?.length)?.length || 0) > 0;
        
        return {
            narrativeTracking: isFeatureEnabled(flags, 'narrativeStateTracking') && !!storyBible,
            characterConsistency: isFeatureEnabled(flags, 'characterConsistency') && hasCharacterRefs,
            videoUpscaling: isFeatureEnabled(flags, 'videoUpscaling'),
            shotLevelContinuity: isFeatureEnabled(flags, 'shotLevelContinuity'),
        };
    }, [localGenSettings?.featureFlags, storyBible, visualBible]);
    
    // Auto-save state
    const saveTimeoutRef = useRef<number | null>(null);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');

    // Crash recovery - localStorage key for this scene
    const crashRecoveryKey = `gemDirect_crashRecovery_${scene.id}`;
    
    // Save to localStorage for crash recovery (in addition to IndexedDB)
    useEffect(() => {
        if (!hasChanges || saveStatus === 'saved') return;
        
        // Save current timeline state to localStorage for crash recovery
        const recoveryData = {
            timeline,
            timestamp: Date.now(),
            sceneId: scene.id,
        };
        try {
            localStorage.setItem(crashRecoveryKey, JSON.stringify(recoveryData));
        } catch (e) {
            console.warn('[CrashRecovery] Failed to save to localStorage:', e);
        }
    }, [timeline, hasChanges, saveStatus, crashRecoveryKey, scene.id]);
    
    // Clear crash recovery data on successful save
    useEffect(() => {
        if (saveStatus === 'saved') {
            try {
                localStorage.removeItem(crashRecoveryKey);
            } catch (e) {
                // Ignore localStorage errors
            }
        }
    }, [saveStatus, crashRecoveryKey]);
    
    // Check for crash recovery data on mount
    useEffect(() => {
        try {
            const recoveryDataRaw = localStorage.getItem(crashRecoveryKey);
            if (recoveryDataRaw) {
                const recoveryData = JSON.parse(recoveryDataRaw);
                const recoveryAge = Date.now() - recoveryData.timestamp;
                const maxRecoveryAge = 24 * 60 * 60 * 1000; // 24 hours
                
                if (recoveryAge < maxRecoveryAge && recoveryData.sceneId === scene.id) {
                    // Ask user if they want to recover
                    const shouldRecover = window.confirm(
                        `Unsaved changes from a previous session were found for this scene.\n\n` +
                        `Would you like to recover them?\n\n` +
                        `(Changes were made ${Math.round(recoveryAge / 1000 / 60)} minutes ago)`
                    );
                    
                    if (shouldRecover) {
                        setTimeline(recoveryData.timeline);
                        setHasChanges(true);
                        setSaveStatus('unsaved');
                    }
                }
                // Clear the recovery data after handling (accepted or declined)
                localStorage.removeItem(crashRecoveryKey);
            }
        } catch (e) {
            console.warn('[CrashRecovery] Failed to check recovery data:', e);
        }
    }, [scene.id]); // Only run on mount/scene change
    
    // Warn user before leaving with unsaved changes and attempt to flush
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChangesRef.current) {
                // Attempt to flush pending save synchronously
                // Note: This is best-effort as beforeunload has limited time
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = null;
                }
                // Synchronously save to parent state
                onUpdateScene({ ...sceneRef.current, timeline: timelineRef.current });
                
                // Still show warning since the async IndexedDB save may not complete
                e.preventDefault();
                e.returnValue = 'Your changes are being saved. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [onUpdateScene]);

    // Drag and drop state
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const sceneKeyframe = effectiveGeneratedImages[scene.id];
    const planActions = usePlanExpansionActions();
    const { activeStrategyId } = usePlanExpansionStrategy();
    const mediaActions = useMediaGenerationActions();

    const ensureSceneAssets = useCallback(async () => {
        const resolvedSceneKeyframe = sceneKeyframe;
        const shotImages: Record<string, string> = { ...effectiveGeneratedShotImages };
        const keyframeMode = localGenSettings?.keyframeMode ?? 'single';

        // Check if scene keyframe exists
        if (!resolvedSceneKeyframe) {
            throw new Error('Scene keyframe image is required before generating videos. Please generate scene images first using the "Generate Keyframes" button above.');
        }

        // Get the active image from whatever keyframe type we have
        const activeKeyframe = getActiveKeyframeImage(resolvedSceneKeyframe);
        if (!activeKeyframe) {
            throw new Error('Scene keyframe data is invalid. Please regenerate the keyframe.');
        }

        // Resolve keyframes for each shot with priority:
        // 1. Shot-level keyframeStart (if in single mode or as start in bookend mode)
        // 2. Scene-level keyframe/shotImages
        // 3. Scene keyframe as fallback
        timeline.shots.forEach((shot) => {
            // Check for shot-level keyframe first
            if (shot.keyframeStart) {
                shotImages[shot.id] = shot.keyframeStart;
            } else if (!shotImages[shot.id]) {
                // Fall back to scene keyframe
                if (isBookendKeyframe(resolvedSceneKeyframe)) {
                    shotImages[shot.id] = resolvedSceneKeyframe.start;
                } else {
                    shotImages[shot.id] = activeKeyframe;
                }
            }
        });

        return {
            sceneKeyframe: activeKeyframe,
            shotImages,
            keyframeMode,
        };
    }, [
        sceneKeyframe,
        effectiveGeneratedShotImages,
        timeline.shots,
        localGenSettings?.keyframeMode,
    ]);
    
    // Validation helper: ensures a shot ID belongs to the current scene
    const validateShotBelongsToScene = useCallback((shotId: string): boolean => {
        const valid = timeline.shots.some(s => s.id === shotId);
        if (!valid) {
            console.error(`[Validation] Shot ${shotId} does not belong to scene ${scene.id}. This may indicate cross-scene contamination.`);
        }
        return valid;
    }, [timeline.shots, scene.id]);
    
    // Validation helper: ensures keyframe is stored with correct scene/shot context
    const validateKeyframeStorage = useCallback((keyframeData: string, targetId: string, targetType: 'scene' | 'shot'): boolean => {
        if (!keyframeData || keyframeData.length < 100) {
            console.error(`[Validation] Invalid keyframe data for ${targetType} ${targetId}: too short or empty`);
            return false;
        }
        
        if (targetType === 'shot' && !validateShotBelongsToScene(targetId)) {
            return false;
        }
        
        if (targetType === 'scene' && targetId !== scene.id) {
            console.error(`[Validation] Scene ID mismatch: expected ${scene.id}, got ${targetId}`);
            return false;
        }
        
        return true;
    }, [scene.id, validateShotBelongsToScene]);
    
    // Track previous scene ID to detect scene changes and flush pending saves
    const prevSceneIdRef = useRef(scene.id);
    // Track timeline ref for use in flush function during unmount/scene-switch
    const timelineRef = useRef(timeline);
    const hasChangesRef = useRef(hasChanges);
    const sceneRef = useRef(scene);
    // FIX (2025-12-01): Use ref for onUpdateScene to avoid dependency in unmount effect
    // This prevents the infinite loop where onUpdateScene changes → cleanup runs → 
    // parent re-renders → TimelineEditor unmounts/remounts → cleanup runs again
    const onUpdateSceneRef = useRef(onUpdateScene);
    
    // Keep refs in sync (using direct assignment instead of useEffect to avoid re-render cascade)
    timelineRef.current = timeline;
    hasChangesRef.current = hasChanges;
    sceneRef.current = scene;
    onUpdateSceneRef.current = onUpdateScene;
    
    // Flush pending save immediately (for unmount/scene-switch)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // @ts-ignore - Kept for crash recovery feature
    const flushPendingSave = useCallback(() => {
        // Clear any pending debounced save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // If there are unsaved changes, save immediately
        if (hasChangesRef.current && saveStatus !== 'saving') {
            console.log('[TimelineEditor] Flushing pending save for scene:', sceneRef.current.id);
            setSaveStatus('saving');
            onUpdateSceneRef.current({ ...sceneRef.current, timeline: timelineRef.current });
            setHasChanges(false);
            // Clear crash recovery since we're saving
            try {
                localStorage.removeItem(crashRecoveryKey);
            } catch (e) {
                // Ignore localStorage errors
            }
            // Immediately mark as saved (no delay during flush)
            setSaveStatus('saved');
        }
    }, [saveStatus, crashRecoveryKey]); // Removed onUpdateScene - using ref instead
    
    // Flush on unmount
    // FIX (2025-12-01): Empty dependency array - use refs for all values
    // This ensures the cleanup only runs on actual unmount, not on every render
    useEffect(() => {
        return () => {
            // Use refs to get current values during cleanup
            if (hasChangesRef.current) {
                console.log('[TimelineEditor] Component unmounting with unsaved changes, flushing...');
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = null;
                }
                // Synchronously save on unmount using ref
                onUpdateSceneRef.current({ ...sceneRef.current, timeline: timelineRef.current });
            }
        };
    }, []); // Empty deps - cleanup only on actual unmount
    
    // Handle scene changes - flush pending save for old scene before loading new scene
    // FIX (2025-12-01): Only update state when scene ID actually changes
    // Previously, setTimeline/setHasChanges were called on every render, causing infinite loops
    // Also use onUpdateSceneRef to avoid dependency on changing callback
    useEffect(() => {
        if (prevSceneIdRef.current !== scene.id) {
            // Scene is changing - flush any pending saves for the previous scene first
            if (hasChangesRef.current && saveTimeoutRef.current) {
                console.log('[TimelineEditor] Scene changing, flushing pending save for:', prevSceneIdRef.current);
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
                // Note: We save the PREVIOUS scene's data, not the new scene
                // Use the refs which still have the old values
                onUpdateSceneRef.current({ ...sceneRef.current, timeline: timelineRef.current });
            }
            prevSceneIdRef.current = scene.id;
            
            // Now load the new scene's timeline (only when scene ID changes)
            setTimeline(scene.timeline);
            setHasChanges(false);
            setSaveStatus('saved');
        }
    }, [scene.id, scene.timeline]); // Only depend on scene.id and scene.timeline, not entire scene or callback

    // Update template coverage when scene content changes
    // FIX (2025-11-30): Extract stable function reference to prevent infinite loop.
    // Previously, using `templateContext` as a dependency caused infinite re-renders because:
    // 1. updateCoveredElements() modifies coveredElements state
    // 2. This triggers context value to change (new object reference)
    // 3. Which triggers this useEffect again → infinite loop
    // Solution: Use the extracted _updateCoveredElements function reference (stable via useCallback in context)
    // and only depend on selectedTemplate, not the entire context object.
    const selectedTemplate = templateContext.selectedTemplate;
    useEffect(() => {
        if (selectedTemplate) {
            const sceneContent = [
                scene.title,
                scene.summary,
                ...timeline.shots.map(s => s.description),
                timeline.transitions.join(' '),
            ].join(' ');
            
            _updateCoveredElements(sceneContent);
        }
    }, [scene.title, scene.summary, timeline.shots, timeline.transitions, selectedTemplate, _updateCoveredElements]);

    // Auto-save effect
    useEffect(() => {
        if (saveStatus === 'saved' || !hasChanges) return;

        setSaveStatus('unsaved');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = window.setTimeout(() => {
            setSaveStatus('saving');
            onUpdateScene({ ...scene, timeline });
            setHasChanges(false);
            setTimeout(() => setSaveStatus('saved'), 1000);
        }, 1500); // 1.5 second debounce

        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) };
    }, [timeline, scene, onUpdateScene, hasChanges, saveStatus]);

    // ========================================================================
    // Phase 6: Global ComfyUI Event Subscription
    // ========================================================================
    // Subscribe to global ComfyUI events for this scene's generation jobs
    // This provides real-time progress updates that survive navigation
    
    // FIX (2025-12-01): Use refs for localGenStatus to avoid infinite loop
    // Previously, localGenStatus was in the dependency array, so every setLocalGenStatus
    // call would re-run this effect, causing subscribe/unsubscribe cycles that triggered
    // the unmount cleanup effect repeatedly (logging "Component unmounting with unsaved changes")
    const localGenStatusRef = useRef(localGenStatus);
    useEffect(() => {
        localGenStatusRef.current = localGenStatus;
    }, [localGenStatus]);
    
    // Track if subscription is active to avoid double-subscription
    const isSubscribedRef = useRef(false);
    
    useEffect(() => {
        // Only subscribe if there's an active generation job for this scene
        // Use store when enabled, otherwise use ref for legacy mode
        const currentStatus = isGenStatusStoreEnabled 
            ? useGenerationStatusStore.getState().getSceneStatus(scene.id)
            : localGenStatusRef.current[scene.id];
        if (!currentStatus || currentStatus.status === 'complete' || currentStatus.status === 'error') {
            return;
        }

        // Prevent double-subscription
        if (isSubscribedRef.current) {
            return;
        }
        isSubscribedRef.current = true;

        // Subscribe to global events to catch progress updates
        const unsubscribe = comfyEventManager.subscribeAll((event: ComfyEvent) => {
            // Only process progress events
            if (event.type !== 'progress' && event.type !== 'executing') {
                return;
            }

            // Check if this event relates to our scene's current job
            // The promptId from ComfyUI is stored when we queue a job
            const promptId = event.promptId;
            if (!promptId) return;

            // Use store or ref to get current status without triggering re-renders
            const currentPromptId = isGenStatusStoreEnabled
                ? useGenerationStatusStore.getState().getSceneStatus(scene.id)?.promptId
                : localGenStatusRef.current[scene.id]?.promptId;
            if (!currentPromptId || promptId !== currentPromptId) {
                return;
            }

            // Update local status with progress from WebSocket
            if (event.type === 'progress' && event.data.value !== undefined && event.data.max !== undefined) {
                const progressPercent = Math.round((event.data.value / event.data.max) * 100);
                // Use adapter to update status (routes to store or legacy based on flag)
                if (isGenStatusStoreEnabled) {
                    const existing = useGenerationStatusStore.getState().getSceneStatus(scene.id);
                    if (existing && existing.status === 'running') {
                        storeUpdateSceneStatus(scene.id, {
                            progress: progressPercent,
                            message: `Processing node ${event.data.node || 'unknown'}...`,
                        });
                    }
                } else {
                    setLocalGenStatus(prev => {
                        const existing = prev[scene.id];
                        if (!existing || existing.status !== 'running') return prev;
                        return {
                            ...prev,
                            [scene.id]: {
                                ...existing,
                                progress: progressPercent,
                                message: `Processing node ${event.data.node || 'unknown'}...`,
                            }
                        };
                    });
                }
            } else if (event.type === 'executing' && event.data.node) {
                // Use adapter to update status (routes to store or legacy based on flag)
                if (isGenStatusStoreEnabled) {
                    const existing = useGenerationStatusStore.getState().getSceneStatus(scene.id);
                    if (existing && existing.status === 'running') {
                        storeUpdateSceneStatus(scene.id, {
                            message: `Executing node: ${event.data.node}`,
                        });
                    }
                } else {
                    setLocalGenStatus(prev => {
                        const existing = prev[scene.id];
                        if (!existing || existing.status !== 'running') return prev;
                        return {
                            ...prev,
                            [scene.id]: {
                                ...existing,
                                message: `Executing node: ${event.data.node}`,
                            }
                        };
                    });
                }
            }
        });

        console.log('[TimelineEditor] Subscribed to ComfyUI events for scene:', scene.id);

        return () => {
            isSubscribedRef.current = false;
            unsubscribe();
            console.log('[TimelineEditor] Unsubscribed from ComfyUI events for scene:', scene.id);
        };
    }, [scene.id, setLocalGenStatus, isGenStatusStoreEnabled]); // Removed localGenStatus from dependencies

    const getNarrativeContext = useCallback((sceneId: string): string => {
        const sceneIndex = effectiveScenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return "No context found.";
        
        const actBreakdown = storyBible.plotOutline.split(/act [iI]+/);
        let actContext = "General Plot";
        if (sceneIndex / effectiveScenes.length > 0.66 && actBreakdown[3]) actContext = "Act III: " + actBreakdown[3];
        else if (sceneIndex / effectiveScenes.length > 0.33 && actBreakdown[2]) actContext = "Act II: " + actBreakdown[2];
        else if (actBreakdown[1]) actContext = "Act I: " + actBreakdown[1];

        return `This scene occurs in: ${actContext.trim()}`;
    }, [effectiveScenes, storyBible]);


    const handleUpdateSummaryClick = async () => {
        setIsSummaryUpdating(true);
        try {
            await onUpdateSceneSummary(scene.id);
        } catch (error) {
            console.error("Failed to update summary:", error);
        } finally {
            setIsSummaryUpdating(false);
        }
    };

    const updateTimeline = (newTimeline: Partial<TimelineData>) => {
        setTimeline(prev => ({ ...prev, ...newTimeline }));
        setHasChanges(true);
    };

    const handleAddShot = () => {
        const newShot: Shot = { id: `shot_${Date.now()}`, description: '' };
        const newShots = [...timeline.shots, newShot];
        const newTransitions = [...timeline.transitions];
        if (newShots.length > 1) {
            newTransitions.push('Cut');
        }
        updateTimeline({ shots: newShots, transitions: newTransitions });
    };

    const handleDeleteShot = (shotId: string) => {
        const shotIndex = timeline.shots.findIndex(s => s.id === shotId);
        if (shotIndex === -1) return;
        
        const newShots = timeline.shots.filter(s => s.id !== shotId);
        const newEnhancers = { ...timeline.shotEnhancers };
        delete newEnhancers[shotId];

        const newTransitions = [...timeline.transitions];
        if (newShots.length > 0 && shotIndex < newTransitions.length) {
            newTransitions.splice(shotIndex > 0 ? shotIndex -1 : 0, 1);
        } else if (newShots.length === 0) {
            newTransitions.splice(0, newTransitions.length);
        }

        updateTimeline({ shots: newShots, shotEnhancers: newEnhancers, transitions: newTransitions });
    };

    const handleGenerateAndDetailInitialShots = async () => {
        setIsGeneratingInitialShots(true);
        try {
            const narrativeContext = getNarrativeContext(scene.id);
            const prunedContext = await planActions.getPrunedContextForShotGeneration(storyBible, narrativeContext, scene.summary, directorsVision, onApiLog, onApiStateChange);
            const detailedShots: DetailedShotResult[] = await planActions.generateAndDetailInitialShots(prunedContext, onApiLog, onApiStateChange);
            
            const newShots: Shot[] = [];
            const newEnhancers: ShotEnhancers = {};

            detailedShots.forEach(result => {
                const newShot: Shot = { id: `shot_${Date.now()}_${Math.random()}`, description: result.description };
                newShots.push(newShot);
                newEnhancers[newShot.id] = result.suggested_enhancers;
            });
            
            const newTransitions = new Array(Math.max(0, newShots.length - 1)).fill('Cut');

            updateTimeline({ shots: newShots, transitions: newTransitions, shotEnhancers: newEnhancers });
        } catch (error) {
            console.error("Failed to generate and detail initial shots:", error);
        } finally {
            setIsGeneratingInitialShots(false);
        }
    };
    
    const handleGetCoDirectorSuggestions = async (objective: string) => {
        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const narrativeContext = getNarrativeContext(scene.id);
            const prunedContext = await planActions.getPrunedContextForCoDirector(storyBible, narrativeContext, scene, directorsVision, onApiLog, onApiStateChange);
            
            const timelineSummary = timeline.shots.map((shot, index) => {
                const enhancers = timeline.shotEnhancers[shot.id] || {};
                const enhancerKeys = Object.keys(enhancers).filter(k => {
                    const value = enhancers[k as keyof typeof enhancers];
                    return Array.isArray(value) && value.length > 0;
                });
                const enhancerString = enhancerKeys.length > 0 ? ` (Style: ${enhancerKeys.join(', ')})` : '';
                return `Shot ${index + 1} (ID: ${shot.id}): ${shot.description}${enhancerString}`;
            }).join('\n');

            const result = await planActions.getCoDirectorSuggestions(prunedContext, timelineSummary, objective, onApiLog, onApiStateChange);
            setCoDirectorResult(result);
        } catch (error) {
            console.error(error);
        } finally {
            setIsCoDirectorLoading(false);
        }
    };
    
    const handleBatchProcess = async (actions: Array<'REFINE_DESCRIPTION' | 'SUGGEST_ENHANCERS'>) => {
        const actionType = actions.includes('REFINE_DESCRIPTION') ? 'description' : 'enhancers';
        const correlationId = generateCorrelationId();

        console.log('[TimelineEditor] handleBatchProcess starting', {
            actions,
            shotCount: timeline.shots.length,
            hasNarrativeContext: !!scene?.id,
            hasDirectorsVision: !!directorsVision,
            strategy: activeStrategyId
        });

        const tasks: BatchShotTask[] = timeline.shots.map(shot => ({
            shot_id: shot.id,
            description: shot.description,
            actions: actions,
        }));

        const beforeValidation: Record<string, ReturnType<typeof validateShotDescription>> = {};
        if (actions.includes('REFINE_DESCRIPTION')) {
            timeline.shots.forEach(shot => {
                beforeValidation[shot.id] = validateShotDescription(shot.description);
            });
        }

        if (tasks.length === 0) {
            console.warn('[TimelineEditor] No shots to process');
            addToast?.('No shots available to process. Add some shots first.', 'warning');
            return;
        }

        setIsBatchProcessing(actionType);
        setBatchProgressMessage(`Preparing ${tasks.length} shots for AI processing...`);
        
        // Helper function to apply results to timeline
        const applyResults = (results: Array<{ shot_id: string; refined_description?: string; suggested_enhancers?: Partial<Omit<CreativeEnhancers, 'transitions'>> }>) => {
            if (!results || results.length === 0) {
                console.warn('[TimelineEditor] Empty results from batch processing');
                addToast?.('No enhancements were generated. Try adding more context to your scene.', 'warning');
                return 0;
            }

            const newShots = [...timeline.shots];
            const newEnhancers: ShotEnhancers = JSON.parse(JSON.stringify(timeline.shotEnhancers));

            let updatedCount = 0;
            const failedShotIds: string[] = [];
            
            results.forEach((result, idx) => {
                // Update progress for each shot being processed
                setBatchProgressMessage(`Applying results to shot ${idx + 1} of ${results.length}...`);
                const shotIndex = newShots.findIndex(s => s.id === result.shot_id);
                if (shotIndex === -1) {
                    failedShotIds.push(result.shot_id);
                    return;
                }
                
                if (result.refined_description) {
                    const originalShot = timeline.shots[shotIndex];
                    if (!originalShot) {
                        failedShotIds.push(result.shot_id);
                        return;
                    }
                    const originalDescription = originalShot.description;
                    newShots[shotIndex] = {
                        ...newShots[shotIndex]!,
                        description: result.refined_description,
                    };
                    updatedCount++;

                    const before = beforeValidation[result.shot_id] ?? validateShotDescription(originalDescription);
                    const after = validateShotDescription(result.refined_description);

                    logCorrelation(
                        { correlationId, timestamp: Date.now(), source: 'frontend' },
                        'shot-refine',
                        {
                            shotId: result.shot_id,
                            actionType,
                            beforeLength: originalDescription.length,
                            afterLength: result.refined_description.length,
                            beforeWordCount: before.wordCount,
                            afterWordCount: after.wordCount,
                            beforeErrorCount: before.errorCount,
                            afterErrorCount: after.errorCount,
                            beforeWarningCount: before.warningCount,
                            afterWarningCount: after.warningCount,
                        }
                    );
                }
                if (result.suggested_enhancers) {
                    newEnhancers[result.shot_id] = {
                        ...newEnhancers[result.shot_id],
                        ...result.suggested_enhancers,
                    };
                    updatedCount++;
                }
            });

            updateTimeline({ shots: newShots, shotEnhancers: newEnhancers });

            logCorrelation(
                { correlationId, timestamp: Date.now(), source: 'frontend' },
                'shot-batch-refine-summary',
                {
                    actionType,
                    processedShots: results.length,
                    updatedCount,
                    failedShotIds,
                }
            );

            // Report partial failures if any
            if (failedShotIds.length > 0) {
                console.warn('[TimelineEditor] Some shots failed to process:', failedShotIds);
                addToast?.(`Warning: ${failedShotIds.length} shot(s) could not be matched (IDs: ${failedShotIds.slice(0, 3).join(', ')}${failedShotIds.length > 3 ? '...' : ''})`, 'warning');
            }
            
            return updatedCount;
        };
        
        try {
            const narrativeContext = getNarrativeContext(scene.id);
            console.log('[TimelineEditor] Getting pruned context for batch processing');
            setBatchProgressMessage(`Gathering context for ${tasks.length} shots...`);

            let prunedContext: string;
            let results: Awaited<ReturnType<typeof planActions.batchProcessShotEnhancements>> | null = null;
            let usedLocalFallback = false;

            try {
                prunedContext = await planActions.getPrunedContextForBatchProcessing(
                    narrativeContext,
                    directorsVision,
                    onApiLog,
                    onApiStateChange
                );

                setBatchProgressMessage(`Sending ${tasks.length} shots to AI for ${actionType === 'description' ? 'refinement' : 'enhancer suggestions'}...`);
                console.log('[TimelineEditor] Calling batchProcessShotEnhancements with', tasks.length, 'tasks');
                results = await planActions.batchProcessShotEnhancements(
                    tasks,
                    prunedContext,
                    onApiLog,
                    onApiStateChange
                );
            } catch (primaryError) {
                // Primary strategy failed - try explicit local fallback
                console.warn('[TimelineEditor] Primary batch processing failed, attempting local fallback:', primaryError);
                setBatchProgressMessage('AI unavailable, trying local fallback...');
                
                try {
                    // Use local fallback service directly
                    prunedContext = await localFallbackService.getPrunedContextForBatchProcessing(
                        narrativeContext,
                        directorsVision
                    );
                    results = await localFallbackService.batchProcessShotEnhancements(tasks);
                    usedLocalFallback = true;
                    
                    // Warn user that we used fallback
                    addToast?.('AI service unavailable. Used local fallback with basic enhancements.', 'warning');
                } catch (fallbackError) {
                    // Both primary and fallback failed
                    console.error('[TimelineEditor] Local fallback also failed:', fallbackError);
                    throw new Error(`Both AI and local fallback failed. Primary error: ${(primaryError as Error).message}`);
                }
            }

            setBatchProgressMessage('Processing AI response...');
            console.log('[TimelineEditor] batchProcessShotEnhancements results:', {
                resultCount: results?.length || 0,
                hasRefinedDescriptions: results?.some(r => !!r.refined_description),
                hasSuggestedEnhancers: results?.some(r => !!r.suggested_enhancers),
                usedLocalFallback
            });

            const updatedCount = applyResults(results || []);

            console.log('[TimelineEditor] Batch processing complete. Updated', updatedCount, 'items');
            
            if (updatedCount > 0) {
                const suffix = usedLocalFallback ? ' (using local fallback)' : '';
                addToast?.(`Successfully processed ${results?.length || 0} shot(s)${suffix}.`, 'success');
            }

        } catch (error) {
            const err = error as Error;
            console.error('[TimelineEditor] Batch processing failed:', err);
            console.error('[TimelineEditor] Error stack:', err.stack);
            
            // Provide actionable error message
            const errorDetails = err.message.toLowerCase();
            let userMessage = `Batch processing failed: ${err.message}`;
            
            if (errorDetails.includes('api key') || errorDetails.includes('credentials')) {
                userMessage = 'Batch processing failed: API credentials are missing or invalid. Please configure your API key in Settings.';
            } else if (errorDetails.includes('rate limit') || errorDetails.includes('429')) {
                userMessage = 'Batch processing failed: Rate limit exceeded. Please wait a moment and try again.';
            } else if (errorDetails.includes('network') || errorDetails.includes('fetch')) {
                userMessage = 'Batch processing failed: Network error. Please check your connection and try again.';
            }
            
            addToast?.(userMessage, 'error');
        } finally {
            setIsBatchProcessing(false);
            setBatchProgressMessage('');
        }
    };
    
    const handleGenerateShotImage = async (shotId: string) => {
        // Validate image generation capability before proceeding
        const { validateImageGenerationCapability, formatValidationError } = await import('../utils/generationValidation');
        const validation = validateImageGenerationCapability(
            localGenSettings,
            localGenSettings?.llmProviderUrl ? true : false,
            true // Gemini access assumed if we reached this point
        );

        if (!validation.valid) {
            const errorMsg = formatValidationError(validation, 'image');
            alert(errorMsg);
            console.error('Shot image generation blocked:', errorMsg);
            return;
        }

        const shot = timeline.shots.find(s => s.id === shotId);
        if (!shot) return;
        
        // Validate shot belongs to current scene before generating
        if (!validateShotBelongsToScene(shotId)) {
            console.error(`[handleGenerateShotImage] Shot ${shotId} validation failed - aborting`);
            return;
        }

        setIsGeneratingShotImage(prev => ({ ...prev, [shotId]: true }));
        try {
            const enhancers = timeline.shotEnhancers[shotId] || {};
            const image = await mediaActions.generateImageForShot(shot, enhancers, directorsVision, scene.summary, scene.id, onApiLog, onApiStateChange);
            const keyframeData = stripDataUrlPrefix(image);
            
            // Validate keyframe data before storing
            if (!validateKeyframeStorage(keyframeData, shotId, 'shot')) {
                console.error(`[handleGenerateShotImage] Keyframe validation failed for shot ${shotId}`);
                return;
            }
            
            // Update both the legacy shot images state AND the new shot-level keyframe
            setGeneratedShotImages(prev => ({ ...prev, [shotId]: keyframeData }));
            
            // Also update the shot's keyframeStart field for persistence
            updateTimeline({
                shots: timeline.shots.map(s => 
                    s.id === shotId 
                        ? { ...s, keyframeStart: keyframeData }
                        : s
                )
            });
        } catch (error) {
            console.error(`Failed to generate image for shot ${shotId}:`, error);
        } finally {
            setIsGeneratingShotImage(prev => ({ ...prev, [shotId]: false }));
        }
    };

    const handleExportPrompts = () => {
        const payloads = generateVideoRequestPayloads(timeline, directorsVision, scene.summary, effectiveGeneratedShotImages);
        onUpdateScene({ ...scene, generatedPayload: payloads });
        setPromptsToExport(payloads);
        setIsPromptModalOpen(true);
    };

    // Phase 7: Handle video upscaling
    const handleUpscaleVideo = async (videoData: string) => {
        if (!localGenSettings || !isUpscalingSupported(localGenSettings)) {
            console.warn('[Upscale] Upscaling not supported with current settings');
            addToast?.('Video upscaling is not configured. Please check ComfyUI settings.', 'warning');
            return;
        }

        setIsUpscaling(true);
        
        // Update status to show upscaling in progress
        updateSceneGenStatus({
            status: 'running',
            message: 'Upscaling video...',
            progress: 0,
        });

        try {
            // For now, we pass the data URL as the "path" - the upscaler service 
            // should handle converting this to a file upload if needed
            const result = await upscaleVideo(
                localGenSettings,
                videoData, // This is the base64 data URL
                DEFAULT_UPSCALE_CONFIG,
                (progress) => {
                    updateSceneGenStatus({
                        status: 'running',
                        message: progress.message,
                        progress: progress.percent,
                    });
                }
            );

            if (result.success && result.outputData) {
                // Update with upscaled video
                updateSceneGenStatus({
                    status: 'complete' as const,
                    message: 'Video upscaled successfully!',
                    progress: 100,
                    final_output: {
                        type: 'video' as const,
                        data: result.outputData!,
                        filename: 'upscaled_video.mp4'
                    }
                });
                addToast?.('Video upscaled successfully!', 'success');
            } else {
                throw new Error(result.error || 'Upscaling failed');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown upscaling error';
            console.error('[Upscale] Error:', message);
            addToast?.(message, 'error');
            
            // Restore previous complete status without changing the video
            updateSceneGenStatus({
                status: 'complete',
                message: 'Upscaling failed - original video preserved',
            });
        } finally {
            setIsUpscaling(false);
        }
    };

    const handleGenerateLocally = async () => {
        if (!scene) return;

        // Helper to update status - now uses the unified adapter
        const updateStatus = (update: Partial<LocalGenerationStatus>) => {
            updateSceneGenStatus(update);
        };

        // Reset status
        updateStatus({ status: 'running', progress: 0, message: 'Initializing generation...' });

        const keyframeMode = localGenSettings?.keyframeMode ?? 'single';
        console.log('[Local Generation] Mode:', keyframeMode, 'Settings:', JSON.stringify(localGenSettings));

        try {
            const keyframeData = effectiveGeneratedImages[scene.id];
            
            // Check if using bookend mode
            if (keyframeMode === 'bookend') {
                // Bookend mode: require complete bookend keyframes (both start AND end)
                if (!keyframeData) {
                    throw new Error('No keyframes generated yet. Please use the "Generate Start Keyframe" and "Generate End Keyframe" buttons above to create bookend keyframes before generating video.');
                }
                
                if (!isBookendKeyframe(keyframeData)) {
                    // Check if user has a single keyframe but is in bookend mode
                    if (isSingleKeyframe(keyframeData)) {
                        throw new Error('You have a single keyframe but are in Bookend mode. Please switch to Single Keyframe mode in Settings, or regenerate keyframes using the bookend buttons above.');
                    }
                    throw new Error('Bookend keyframes required for video generation. Please use the "Generate Start Keyframe" and "Generate End Keyframe" buttons above, or switch to Single Keyframe mode in Settings.');
                }
                
                // Validate both start and end are present
                if (!keyframeData.start || !keyframeData.end) {
                    const missing = !keyframeData.start && !keyframeData.end 
                        ? 'both start and end keyframes' 
                        : (!keyframeData.start ? 'start keyframe' : 'end keyframe');
                    throw new Error(`Missing ${missing}. Please generate the missing keyframe using the buttons above before generating video.`);
                }

                console.log('[PIPELINE:BOOKEND] Starting native bookend video generation with keyframes:', {
                    hasStart: !!keyframeData.start,
                    hasEnd: !!keyframeData.end,
                    startPrefix: keyframeData.start?.slice(0, 50),
                    endPrefix: keyframeData.end?.slice(0, 50),
                    profile: localGenSettings.sceneBookendWorkflowProfile || 'wan-flf2v'
                });

                // ============================================================================
                // PREFLIGHT: Keyframe Pair Analysis (Phase 8: Bookend QA)
                // Analyzes start/end keyframes for visual continuity before generation
                // Uses getEffectiveFlagsForQAMode to respect bookendQAMode master switch
                // ============================================================================
                const effectiveFlags = getEffectiveFlagsForQAMode(localGenSettings?.featureFlags);
                const keyframePairAnalysisEnabled = effectiveFlags.keyframePairAnalysis;
                if (keyframePairAnalysisEnabled) {
                    try {
                        updateStatus({ 
                            status: 'running', 
                            message: 'Analyzing keyframe pair continuity...',
                            preflightResult: { ran: false } // Will be updated after completion
                        });
                        console.log('[PIPELINE:BOOKEND] Running keyframe pair analysis preflight...');
                        
                        const analysisRequest: KeyframePairRequest = {
                            startImageBase64: keyframeData.start,
                            endImageBase64: keyframeData.end,
                            sceneDescription: scene.summary || '',
                        };
                        
                        const analysisResult = await analyzeKeyframePair(
                            analysisRequest,
                            localGenSettings
                        );
                        
                        console.log('[PIPELINE:BOOKEND] Keyframe pair analysis result:', {
                            characterMatch: analysisResult.characterMatch,
                            environmentMatch: analysisResult.environmentMatch,
                            cameraMatch: analysisResult.cameraMatch,
                            overallContinuity: analysisResult.overallContinuity,
                            passesThreshold: analysisResult.passesThreshold,
                        });
                        
                        const thresholdCheck = keyframePairMeetsThresholds(analysisResult);
                        if (!thresholdCheck.passes) {
                            const blockingMessage = getBlockingMessage(analysisResult) || thresholdCheck.reason || 'Quality check failed';
                            console.warn('[PIPELINE:BOOKEND] ⚠️ Keyframe pair analysis failed thresholds:', blockingMessage);
                            
                            // Block generation with clear guidance - store preflight result for UI display
                            updateStatus({ 
                                status: 'error', 
                                message: `Keyframe continuity check failed: ${blockingMessage}. Consider regenerating keyframes for better consistency.`,
                                preflightResult: {
                                    ran: true,
                                    passed: false,
                                    reason: blockingMessage,
                                    timestamp: Date.now(),
                                    scores: {
                                        characterMatch: analysisResult.characterMatch,
                                        environmentMatch: analysisResult.environmentMatch,
                                        cameraMatch: analysisResult.cameraMatch,
                                        overallContinuity: analysisResult.overallContinuity,
                                    }
                                }
                            });
                            return;
                        }
                        
                        console.log('[PIPELINE:BOOKEND] ✅ Keyframe pair analysis passed');
                        // Store successful preflight result
                        updateStatus({ 
                            status: 'running', 
                            message: 'Preflight passed. Starting video generation...',
                            preflightResult: {
                                ran: true,
                                passed: true,
                                timestamp: Date.now(),
                                scores: {
                                    characterMatch: analysisResult.characterMatch,
                                    environmentMatch: analysisResult.environmentMatch,
                                    cameraMatch: analysisResult.cameraMatch,
                                    overallContinuity: analysisResult.overallContinuity,
                                }
                            }
                        });
                    } catch (analysisError) {
                        // Graceful fallback: log warning but don't block generation
                        const errorMsg = analysisError instanceof Error ? analysisError.message : String(analysisError);
                        console.warn('[PIPELINE:BOOKEND] ⚠️ Keyframe pair analysis unavailable (non-blocking):', errorMsg);
                        // Update status to show we're continuing despite analysis failure - store skip reason
                        updateStatus({ 
                            status: 'running', 
                            message: 'Keyframe analysis skipped (vision LLM unavailable). Proceeding with video generation...',
                            preflightResult: {
                                ran: false,
                                reason: `Skipped: ${errorMsg}`,
                                timestamp: Date.now(),
                            }
                        });
                        // Continue with generation - analysis failure is non-fatal
                    }
                } else {
                    console.log('[PIPELINE:BOOKEND] Keyframe pair analysis disabled, skipping preflight');
                    // Clear or set disabled preflight result
                    updateStatus({
                        preflightResult: {
                            ran: false,
                            reason: 'Disabled in settings',
                            timestamp: Date.now(),
                        }
                    });
                }

                // Use native dual-keyframe generation with configurable bookend workflow profile
                // Default: wan-flf2v (First-Last-Frame) - designed for bookend video generation
                // Alternative: wan-fun-inpaint for smooth interpolation (if configured in settings)
                const bookendProfile = (localGenSettings.sceneBookendWorkflowProfile === 'wan-fun-inpaint' 
                    ? 'wan-fun-inpaint' 
                    : 'wan-flf2v') as 'wan-flf2v' | 'wan-fun-inpaint';
                
                // Define the generation function
                const executeBookendGeneration = () => generateVideoFromBookendsNative(
                    localGenSettings,
                    scene,
                    timeline,
                    keyframeData,
                    directorsVision,
                    onApiLog,
                    updateStatus,
                    bookendProfile
                );

                // Route through GenerationQueue if enabled (prevents VRAM exhaustion)
                let videoPath: string;
                const useQueue = isFeatureEnabled(localGenSettings?.featureFlags, 'useGenerationQueue');
                if (useQueue) {
                    const queue = getGenerationQueue();
                    const task = createVideoTask(
                        executeBookendGeneration,
                        {
                            sceneId: scene.id,
                            priority: 'normal',
                            onStatusChange: (status: GenerationStatus) => {
                                if (status === 'pending') {
                                    updateStatus({ status: 'queued', message: 'Queued for video generation...' });
                                }
                            },
                        }
                    );
                    console.log(`[PIPELINE:BOOKEND] Queueing bookend video via GenerationQueue`);
                    videoPath = await queue.enqueue(task);
                } else {
                    // Direct execution (legacy behavior)
                    videoPath = await executeBookendGeneration();
                }

                console.log('[PIPELINE:BOOKEND] Video generation returned:', {
                    hasVideoPath: !!videoPath,
                    videoPathType: typeof videoPath,
                    videoPathLength: typeof videoPath === 'string' ? videoPath.length : 0,
                    videoPathPrefix: typeof videoPath === 'string' ? videoPath.slice(0, 80) : 'N/A'
                });

                // Validate that videoPath is actually a data URL, not a filename
                const isValidDataUrl = typeof videoPath === 'string' && 
                    (videoPath.startsWith('data:video/') || videoPath.startsWith('data:image/'));
                
                if (videoPath && !isValidDataUrl) {
                    console.error('[PIPELINE:BOOKEND] ❌ videoPath is not a valid data URL:', {
                        type: typeof videoPath,
                        preview: typeof videoPath === 'string' ? videoPath.slice(0, 100) : 'N/A',
                        looksLikeFilename: typeof videoPath === 'string' && (videoPath.endsWith('.mp4') || videoPath.endsWith('.webm'))
                    });
                }

                if (videoPath && isValidDataUrl) {
                    console.log('[PIPELINE:BOOKEND] ✅ Setting complete status with valid video data');
                    updateStatus({ 
                        status: 'complete', 
                        progress: 100, 
                        message: 'Video generation complete!',
                        final_output: {
                            type: 'video',
                            data: videoPath,
                            filename: 'bookend_sequence.mp4'
                        }
                    });
                } else {
                    console.error('[PIPELINE:BOOKEND] ❌ Setting error status - invalid video data');
                    
                    // Provide more helpful error message based on what we received
                    let errorMessage = 'Bookend video generation failed';
                    if (!videoPath) {
                        errorMessage = 'Bookend video generation failed - no output received from ComfyUI. Check if the workflow completed successfully.';
                    } else if (typeof videoPath === 'string' && (videoPath.endsWith('.mp4') || videoPath.endsWith('.webm'))) {
                        errorMessage = `Video generation completed but received filename "${videoPath}" instead of data URL. This may indicate a ComfyUI fetch error.`;
                    } else {
                        errorMessage = `Video data is invalid - expected data URL starting with "data:video/", received: ${typeof videoPath === 'string' ? videoPath.slice(0, 50) : typeof videoPath}`;
                    }
                    
                    updateStatus({
                        status: 'error',
                        progress: 100,
                        message: errorMessage
                    });
                }
            } else {
                // Single keyframe mode: use standard video generation flow
                if (!keyframeData) {
                    throw new Error('Scene keyframe required for video generation. Please generate a keyframe image first.');
                }

                // Resolve keyframe (handle all formats: single, bookend, versioned)
                const resolvedKeyframe = getActiveKeyframeImage(keyframeData);
                if (!resolvedKeyframe) {
                    throw new Error('Invalid keyframe data. Please regenerate the keyframe.');
                }
                
                // Validate workflow before generation
                try {
                    validateWorkflowAndMappings(localGenSettings, 'wan-i2v');
                } catch (validationError) {
                    const errorMsg = validationError instanceof Error ? validationError.message : 'Workflow validation failed';
                    throw new Error(`Workflow validation failed: ${errorMsg}. Please check ComfyUI settings.`);
                }

                const totalShots = timeline.shots.length;
                if (totalShots === 0) {
                    throw new Error('No shots available to generate.');
                }

                const shotIndexMap = timeline.shots.reduce<Record<string, number>>((acc, shot, index) => {
                    acc[shot.id] = index;
                    return acc;
                }, {});

                // Build keyframe mapping for each shot (all use scene keyframe in single mode)
                const keyframeImages: Record<string, string> = {};
                timeline.shots.forEach(shot => {
                    keyframeImages[shot.id] = resolvedKeyframe;
                });

                // Generate scene transition context
                const currentSceneIndex = effectiveScenes.findIndex(s => s.id === scene.id);
                const previousScene: Scene | null = currentSceneIndex > 0 ? (effectiveScenes[currentSceneIndex - 1] ?? null) : null;
                const transitionContext = generateSceneTransitionContext(scene, previousScene, storyBible);

                const results = await generateTimelineVideos(
                    localGenSettings,
                    timeline,
                    directorsVision,
                    scene.summary,
                    keyframeImages,
                    (shotId, statusUpdate) => {
                        const shotIndex = shotIndexMap[shotId] ?? 0;
                        const total = totalShots || 1;
                        const baseProgress = (shotIndex / total) * 100;
                        const incremental = (statusUpdate.progress ?? 0) / total;
                        const aggregatedProgress = Math.min(100, baseProgress + incremental);

                        updateStatus({
                            status: statusUpdate.status ?? 'running',
                            message: `Shot ${shotIndex + 1}/${totalShots}: ${statusUpdate.message || 'Processing...'}`,
                            progress: Math.round(aggregatedProgress)
                        });
                    },
                    { 
                        transitionContext,
                        // Phase 7: Full integration - pass story/visual bible for narrative tracking
                        featureFlags: localGenSettings?.featureFlags,
                        scene,
                        sceneKeyframe: resolvedKeyframe,
                        storyBible: storyBible || undefined,
                        visualBible: visualBible || undefined,
                        // Phase 7: Narrative state persistence - pass current state and update callback
                        narrativeState: narrativeState || undefined,
                        onNarrativeStateUpdate: updateNarrativeState,
                        // Phase 7: Character reference images for IP-Adapter (if available from visual bible)
                        characterReferenceImages: visualBible?.characters?.reduce((acc, char) => {
                            const refImage = char.imageRefs?.[0];
                            if (refImage) {
                                acc[char.id] = refImage;
                            }
                            return acc;
                        }, {} as Record<string, string>),
                    }
                );

                const lastShotId = timeline.shots[totalShots - 1]?.id;
                const finalResult = lastShotId ? results[lastShotId] : undefined;
                
                // Validate that videoPath is actually a data URL, not a filename
                const isValidDataUrl = typeof finalResult?.videoPath === 'string' && 
                    (finalResult.videoPath.startsWith('data:video/') || finalResult.videoPath.startsWith('data:image/'));
                
                if (finalResult?.videoPath && !isValidDataUrl) {
                    console.error('[PIPELINE] videoPath is not a valid data URL:', finalResult.videoPath.slice(0, 100));
                }
                
                const finalOutput = finalResult && finalResult.videoPath && isValidDataUrl ? {
                    type: 'video' as const,
                    data: finalResult.videoPath,
                    filename: finalResult.filename
                } : undefined;

                updateStatus({
                    status: finalOutput ? 'complete' : 'error',
                    message: finalOutput 
                        ? `Generated ${totalShots} ${totalShots === 1 ? 'shot' : 'shots'} successfully.`
                        : `Generation completed but video data is invalid (received filename instead of data URL)`,
                    progress: 100,
                    final_output: finalOutput
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during local generation.';
            console.error('[Local Generation Error]', message, error);
            updateStatus({ status: 'error', message, progress: 0 });
        }
    };

    /**
     * Chain-of-Frames Video Generation
     * 
     * Generates scene videos using ComfyUI's WanFirstLastFrameToVideo node.
     * This produces smoother, more coherent scene videos by ensuring:
     * - Each shot's end frame matches the next shot's start frame
     * - Visual continuity is maintained across cuts
     * - No "amalgam monster" artifacts from FFmpeg pixel-based concatenation
     */
    const handleGenerateChained = async () => {
        if (!scene) return;

        const updateStatus = (update: Partial<LocalGenerationStatus>) => {
            updateSceneGenStatus(update);
        };

        updateStatus({ status: 'running', progress: 0, message: 'Initializing chain-of-frames generation...' });

        try {
            // Validate we have a scene keyframe to start from
            const keyframeData = effectiveGeneratedImages[scene.id];
            if (!keyframeData) {
                throw new Error('Scene keyframe required for chained video generation. Please generate a keyframe image first.');
            }

            // Resolve keyframe (handle all formats: single, bookend, versioned)
            const sceneKeyframe = getActiveKeyframeImage(keyframeData);

            if (!sceneKeyframe) {
                throw new Error('Could not resolve scene keyframe. Please generate a keyframe image first.');
            }

            // Check if WanFirstLastFrameToVideo node is available
            updateStatus({ status: 'running', progress: 5, message: 'Checking ComfyUI node availability...' });
            
            const nodeCheck = await checkNodeDependencies(
                localGenSettings,
                ['WanFirstLastFrameToVideo']
            );

            if (!nodeCheck.success) {
                throw new Error(
                    `Required ComfyUI node not available: WanFirstLastFrameToVideo. ` +
                    `Missing nodes: ${nodeCheck.missingNodes.join(', ')}. ` +
                    `Please install ComfyUI-WAN or the required custom nodes.`
                );
            }

            // Validate timeline has shots
            if (!timeline.shots || timeline.shots.length === 0) {
                throw new Error('No shots available to generate. Please add shots to the timeline first.');
            }

            updateStatus({ 
                status: 'running', 
                progress: 10, 
                message: `Starting chain generation for ${timeline.shots.length} shots...` 
            });

            // Generate chained videos
            const results = await generateSceneVideoChained(
                localGenSettings,
                timeline.shots,
                timeline,
                {
                    sceneId: scene.id,
                    sceneKeyframe: stripDataUrlPrefix(sceneKeyframe),
                    sceneSummary: scene.summary || scene.title || '',
                    directorsVision: directorsVision || '',
                    featureFlags: localGenSettings?.featureFlags,
                    onProgress: (current, total, message) => {
                        const progress = 10 + Math.round((current / total) * 85);
                        updateStatus({ 
                            status: 'running', 
                            progress, 
                            message: `Shot ${current}/${total}: ${message}` 
                        });
                    },
                    logCallback: (msg, level) => {
                        console.log(`[ChainedGen][${level || 'info'}] ${msg}`);
                    }
                }
            );

            // Check results - ChainedVideoResult has videoData or videoPath on success, error on failure
            // Note: In browser context, jobs are queued with pending:promptId and run asynchronously
            const queuedResults = results.filter(r => r.videoPath?.startsWith('pending:') && !r.error);
            const successfulResults = results.filter(r => r.videoData && !r.error);
            const failedResults = results.filter(r => r.error);

            // If we have queued results but no completed results, jobs are running in ComfyUI
            const isAsyncQueued = queuedResults.length > 0 && successfulResults.length === 0;

            if (failedResults.length === results.length) {
                const errorMessages = failedResults.map(r => r.error).filter(Boolean).join('; ');
                throw new Error(`All shot generations failed. Errors: ${errorMessages || 'Unknown error'}`);
            }

            if (isAsyncQueued) {
                // Jobs queued successfully - show queued status
                const promptIds = queuedResults.map(r => r.videoPath?.replace('pending:', '').slice(0, 8)).join(', ');
                console.log('[ChainedGen] Jobs queued to ComfyUI:', promptIds);
                
                updateStatus({
                    status: 'complete',
                    progress: 100,
                    message: `✓ ${queuedResults.length} video jobs queued to ComfyUI. Check ComfyUI UI for progress.`
                });
            } else {
                // Get the last successful result for display
                const lastResult = successfulResults[successfulResults.length - 1];
                const finalVideoData = lastResult?.videoData;

                // Validate video data is a proper data URL
                const isValidDataUrl = typeof finalVideoData === 'string' && 
                    finalVideoData.startsWith('data:video/');

                if (failedResults.length > 0) {
                    console.warn(`[ChainedGen] ${failedResults.length} shots failed:`, 
                        failedResults.map(r => ({ shotId: r.shotId, error: r.error })));
                }

                updateStatus({
                    status: isValidDataUrl ? 'complete' : 'error',
                    progress: 100,
                    message: isValidDataUrl
                        ? `Chain generation complete! ${successfulResults.length}/${results.length} shots succeeded.`
                        : 'Generation completed but video data is invalid.',
                    final_output: isValidDataUrl ? {
                        type: 'video' as const,
                        data: finalVideoData!,
                        filename: `chained_scene_${scene.id}.mp4`
                    } : undefined
                });
            }

            // Log results for debugging
            console.log('[ChainedGen] Generation complete:', {
                total: results.length,
                successful: successfulResults.length,
                failed: failedResults.length,
                queued: queuedResults.length
            });

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during chained generation.';
            console.error('[Chained Generation Error]', message, error);
            updateStatus({ status: 'error', message, progress: 0 });
        }
    };
    
    // Vision LLM Feedback: Analyze keyframe with vision model
    const handleAnalyzeKeyframe = useCallback(async () => {
        const keyframeData = effectiveGeneratedImages[scene.id];
        if (!keyframeData) {
            setVisionError('No keyframe image available to analyze');
            return;
        }
        
        // Check if vision feedback is enabled
        const visionEnabled = isFeatureEnabled(localGenSettings.featureFlags, 'visionLLMFeedback');
        if (!visionEnabled) {
            setVisionError('Vision LLM feedback is not enabled. Enable it in Settings → Features.');
            return;
        }
        
        setIsAnalyzingVision(true);
        setVisionError(undefined);
        
        try {
            const imageBase64 = getActiveKeyframeImage(keyframeData);
            if (!imageBase64) {
                throw new Error('Invalid keyframe data');
            }
            const visionConfig = getVisionConfigFromSettings(localGenSettings);
            
            const request: VisionAnalysisRequest = {
                imageBase64,
                originalPrompt: scene.summary || scene.title || '',
                directorsVision: directorsVision || '',
                scene,
                storyBible
            };
            
            const result = await analyzeKeyframe(request, visionConfig);
            setVisionFeedback(result);
            
            // Update version history with vision score if version history is enabled
            if (getFeatureFlag(localGenSettings.featureFlags, 'keyframeVersionHistory')) {
                // Map VisionFeedbackResult scores to KeyframeVersion score format
                const versionScore = {
                    composition: result.scores.composition,
                    lighting: result.scores.lighting,
                    characterAccuracy: result.scores.characterAccuracy,
                    styleConsistency: result.scores.styleAdherence, // Map styleAdherence -> styleConsistency
                    overall: result.scores.overall,
                };
                useSceneStateStore.getState().updateKeyframeVersionScore(scene.id, versionScore);
                console.log(`📊 [Vision Analysis] Updated version score for scene ${scene.id}:`, versionScore);
            }
            
            // Show toast for auto-analysis
            if (localGenSettings.featureFlags?.autoVisionAnalysis) {
                const scoreLabel = result.scores.overall >= 70 ? 'Good' : result.scores.overall >= 50 ? 'Fair' : 'Needs improvement';
                addToast?.(`Vision analysis complete: ${scoreLabel} (${result.scores.overall}/100)`, 'info');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Vision analysis failed';
            setVisionError(message);
            console.error('[Vision Analysis Error]', error);
        } finally {
            setIsAnalyzingVision(false);
        }
    }, [effectiveGeneratedImages, scene, directorsVision, storyBible, localGenSettings, addToast]);
    
    // Apply refined prompt from vision analysis to scene summary
    const handleApplyRefinedPrompt = useCallback((refinedPrompt: string) => {
        if (!refinedPrompt) return;
        
        // Update the scene with refined prompt as enhanced summary
        const updatedScene: Scene = {
            ...scene,
            summary: refinedPrompt,
            // Optionally store original for comparison
            metadata: {
                ...scene.metadata,
                originalSummary: scene.summary,
                refinedByVision: true,
                refinedAt: Date.now()
            }
        };
        
        onUpdateScene(updatedScene);
        addToast?.('Applied refined prompt to scene summary', 'success');
    }, [scene, onUpdateScene, addToast]);
    
    // Video Quality Analysis: Analyze generated video with vision model
    const handleAnalyzeVideo = useCallback(async () => {
        // Get video data from local generation status
        const localStatus = localGenStatus[scene.id];
        const videoData = localStatus?.final_output?.type === 'video' ? localStatus.final_output.data : undefined;
        
        if (!videoData) {
            addToast?.('No video available to analyze. Generate a video first.', 'error');
            return;
        }
        
        // Check if video analysis is enabled
        const videoAnalysisEnabled = isFeatureEnabled(localGenSettings.featureFlags, 'videoAnalysisFeedback');
        if (!videoAnalysisEnabled) {
            addToast?.('Video analysis is not enabled. Enable it in Settings → Features.', 'info');
            return;
        }
        
        setIsAnalyzingVideo(true);
        setVideoFeedback(null);
        setQualityGateResult(null);
        
        try {
            // Get keyframes for comparison (bookend mode)
            const keyframeData = effectiveGeneratedImages[scene.id];
            let startKeyframe: string | undefined;
            let endKeyframe: string | undefined;
            
            if (keyframeData) {
                if (isBookendKeyframe(keyframeData)) {
                    startKeyframe = keyframeData.start;
                    endKeyframe = keyframeData.end;
                } else if (isSingleKeyframe(keyframeData)) {
                    startKeyframe = keyframeData;
                }
            }
            
            const request: VideoAnalysisRequestType = {
                videoBase64: videoData,
                startKeyframeBase64: startKeyframe,
                endKeyframeBase64: endKeyframe,
                originalPrompt: scene.timeline?.shots?.[0]?.description || scene.summary || '',
                directorsVision: directorsVision || '',
                scene,
                storyBible,
                isBookendVideo: localGenSettings.keyframeMode === 'bookend',
            };
            
            // Check if quality gate is enabled
            if (isQualityGateEnabled(localGenSettings)) {
                // Run full quality gate evaluation
                const gateResult = await evaluateVideoQuality(videoData, request, localGenSettings);
                setQualityGateResult(gateResult);
                setVideoFeedback(gateResult.feedbackResult);
                
                // Show quality gate result
                const statusMessage = getQualityGateStatusMessage(gateResult);
                addToast?.(statusMessage, gateResult.decision === 'fail' ? 'error' : gateResult.decision === 'warning' ? 'info' : 'success');
            } else {
                // Run analysis only (no quality gate enforcement)
                const result = await analyzeVideoQuality(request, localGenSettings);
                setVideoFeedback(result);
                
                const scoreLabel = result.scores.overall >= 70 ? 'Good' : result.scores.overall >= 50 ? 'Fair' : 'Needs improvement';
                addToast?.(`Video analysis complete: ${scoreLabel} (${result.scores.overall}/100)`, 'info');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Video analysis failed';
            addToast?.(message, 'error');
            console.error('[Video Analysis Error]', error);
        } finally {
            setIsAnalyzingVideo(false);
        }
    }, [localGenStatus, scene, effectiveGeneratedImages, directorsVision, storyBible, localGenSettings, addToast]);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // @ts-ignore - Alternative video generation handler (kept for debugging)
    const handleGenerateVideoWithAI = async () => {
        // CRITICAL: Comprehensive validation before video generation
        const { validateVideoGenerationCapability, formatValidationError } = await import('../utils/generationValidation');
        
        const hasKeyframes = !!effectiveGeneratedImages[scene.id];
        const hasWorkflow = localGenSettings?.workflowProfiles?.['wan-i2v']?.workflowJson ? true : false;
        
        // Additional diagnostic: Log workflow profile state for debugging
        const workflowProfileCount = Object.keys(localGenSettings?.workflowProfiles || {}).length;
        console.log('[handleGenerateVideoWithAI] Workflow validation:', {
            hasKeyframes,
            hasWorkflow,
            workflowProfileCount,
            profileIds: Object.keys(localGenSettings?.workflowProfiles || {}),
            hasRootWorkflowJson: !!localGenSettings?.workflowJson
        });
        
        // Early fail-fast if no workflows are loaded at all
        if (workflowProfileCount === 0 && !localGenSettings?.workflowJson) {
            alert('No workflow profiles configured.\n\nPlease go to Settings → ComfyUI Settings → Workflow Profiles and import a workflow file.');
            console.error('[handleGenerateVideoWithAI] No workflow profiles configured');
            return;
        }
        
        // Get stored validation state to check if configuration is up-to-date
        const storedValidation = localStorage.getItem('gemDirect_validationState');
        const validationSnapshot = storedValidation ? JSON.parse(storedValidation) : null;
        
        const validation = validateVideoGenerationCapability(
            localGenSettings,
            validationSnapshot?.llmValid || false,
            validationSnapshot?.comfyUIValid || false,
            hasWorkflow,
            hasKeyframes
        );

        if (!validation.valid) {
            const errorMsg = formatValidationError(validation, 'video');
            
            // Show user-friendly alert with all blockers and fixes
            const alertMessage = `Video Generation Blocked\n\n${errorMsg}\n\nPlease configure settings before attempting video generation.`;
            alert(alertMessage);
            
            // Also log to console for debugging
            console.error('Video generation blocked:', {
                reason: validation.reason,
                blockers: validation.blockers,
                recommendations: validation.recommendations
            });
            return;
        }

        const totalShots = timeline.shots.length;
        const shotIndexMap = timeline.shots.reduce<Record<string, number>>((acc, shot, index) => {
            acc[shot.id] = index;
            return acc;
        }, {});

        // Helper to update status - now uses the unified adapter
        const updateStatus = (update: Partial<LocalGenerationStatus>) => {
            updateSceneGenStatus(update);
        };

        if (totalShots === 0) {
            updateStatus({ status: 'error', message: 'No shots available to generate.', progress: 0 });
            return;
        }

        // CRITICAL: Retrieve scene keyframe before generation
        const sceneKeyframe = effectiveGeneratedImages[scene.id];
        if (!sceneKeyframe) {
            updateStatus({ status: 'error', message: 'Scene keyframe is required. Please generate a keyframe image first.', progress: 0 });
            return;
        }

        // CRITICAL: Validate WAN I2V workflow has required mappings before queueing
        try {
            validateWorkflowAndMappings(localGenSettings, 'wan-i2v');
        } catch (validationError) {
            const errorMsg = validationError instanceof Error ? validationError.message : 'Workflow validation failed';
            updateStatus({ status: 'error', message: `Workflow validation failed: ${errorMsg}. Please check ComfyUI settings.`, progress: 0 });
            return;
        }

        updateStatus({ status: 'queued', message: 'Preparing timeline generation...', progress: 0 });

        let assets: { sceneKeyframe: string; shotImages: Record<string, string> };
        try {
            assets = await ensureSceneAssets();
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Failed to prepare scene assets.';
            updateStatus({ status: 'error', message: reason, progress: 0 });
            return;
        }

        const keyframeImages: Record<string, string> = {};
        timeline.shots.forEach(shot => {
            const keyframeForShot = assets.shotImages[shot.id] || assets.sceneKeyframe;
            if (keyframeForShot) {
                keyframeImages[shot.id] = keyframeForShot;
            }
        });

        // Generate scene transition context for narrative coherence
        // Find the previous scene in the array to create transition context
        const currentSceneIndex = effectiveScenes.findIndex(s => s.id === scene.id);
        const previousScene: Scene | null = currentSceneIndex > 0 ? (effectiveScenes[currentSceneIndex - 1] ?? null) : null;
        const transitionContext = generateSceneTransitionContext(scene, previousScene, storyBible);

        try {
            const results = await generateTimelineVideos(
                localGenSettings,
                timeline,
                directorsVision,
                scene.summary,
                keyframeImages,
                (shotId, statusUpdate) => {
                    const shotIndex = shotIndexMap[shotId] ?? 0;
                    const total = totalShots || 1;
                    const baseProgress = (shotIndex / total) * 100;
                    const incremental = (statusUpdate.progress ?? 0) / total;
                    const aggregatedProgress = Math.min(100, baseProgress + incremental);

                    updateStatus({
                        status: statusUpdate.status ?? 'running',
                        message: `Shot ${shotIndex + 1}/${totalShots}: ${statusUpdate.message || 'Processing...'}`,
                        progress: Math.round(aggregatedProgress)
                    });
                },
                { 
                    transitionContext,
                    // Phase 7: Full integration - pass story/visual bible for narrative tracking
                    featureFlags: localGenSettings?.featureFlags,
                    scene,
                    sceneKeyframe: assets.sceneKeyframe || undefined,
                    storyBible: storyBible || undefined,
                    visualBible: visualBible || undefined,
                    // Phase 7: Narrative state persistence - pass current state and update callback
                    narrativeState: narrativeState || undefined,
                    onNarrativeStateUpdate: updateNarrativeState,
                    // Phase 7: Character reference images for IP-Adapter (if available from visual bible)
                    characterReferenceImages: visualBible?.characters?.reduce((acc, char) => {
                        const refImage = char.imageRefs?.[0];
                        if (refImage) {
                            acc[char.id] = refImage;
                        }
                        return acc;
                    }, {} as Record<string, string>),
                }
            );

            const lastShotId = timeline.shots[totalShots - 1]?.id;
            const finalResult = lastShotId ? results[lastShotId] : undefined;
            
            // Diagnostic logging for video pipeline debugging
            console.log('[handleGenerateVideoWithAI] Final result analysis:', {
                lastShotId,
                hasResult: !!finalResult,
                videoPathType: typeof finalResult?.videoPath,
                videoPathPrefix: finalResult?.videoPath?.slice(0, 50),
                isValidDataUrl: finalResult?.videoPath?.startsWith('data:video/') || finalResult?.videoPath?.startsWith('data:image/'),
                filename: finalResult?.filename
            });
            
            // Validate that videoPath is actually a data URL, not a filename
            const isValidDataUrl = typeof finalResult?.videoPath === 'string' && 
                (finalResult.videoPath.startsWith('data:video/') || finalResult.videoPath.startsWith('data:image/'));
            
            if (finalResult?.videoPath && !isValidDataUrl) {
                console.error('[handleGenerateVideoWithAI] ❌ CRITICAL: videoPath is not a valid data URL!', {
                    received: finalResult.videoPath.slice(0, 100),
                    expected: 'data:video/mp4;base64,... or data:image/...'
                });
            }
            
            const finalOutput = finalResult && finalResult.videoPath && isValidDataUrl ? {
                type: 'video' as const,
                data: finalResult.videoPath,
                filename: finalResult.filename
            } : undefined;

            updateStatus({
                status: finalOutput ? 'complete' : 'error',
                message: finalOutput 
                    ? `Generated ${totalShots} ${totalShots === 1 ? 'shot' : 'shots'} successfully.`
                    : `Generation completed but video data is invalid (received filename instead of data URL)`,
                progress: 100,
                final_output: finalOutput
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during video generation.';
            updateStatus({ status: 'error', message, progress: 0 });
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = () => {
        if (draggedItemIndex === null || dragOverIndex === null || draggedItemIndex === dragOverIndex) {
            return;
        }

        const newShots = [...timeline.shots];
        const removedShot = newShots.splice(draggedItemIndex, 1)[0];
        if (!removedShot) return;
        newShots.splice(dragOverIndex, 0, removedShot);

        // Adjust transitions as well. A transition belongs to the shot *before* it.
        const newTransitions = [...timeline.transitions];
        if(draggedItemIndex > 0) { // If we are moving a shot that has a preceding transition
            const removedTransition = newTransitions.splice(draggedItemIndex - 1, 1)[0] ?? '';
            if(dragOverIndex > 0) {
                 newTransitions.splice(dragOverIndex - 1, 0, removedTransition);
            } else {
                newTransitions.unshift(removedTransition)
            }
        }

        updateTimeline({ shots: newShots, transitions: newTransitions });
    };

    const handleDragEnd = () => {
        setDraggedItemIndex(null);
        setDragOverIndex(null);
    };
    
    // Check if local generation is configured (using new workflowProfiles structure)
    const isLocalGenConfigured = localGenSettings.comfyUIUrl && 
        localGenSettings.workflowProfiles?.['wan-i2v']?.workflowJson &&
        Object.values(localGenSettings.workflowProfiles?.['wan-i2v']?.mapping || {}).includes('keyframe_image');

    const renderSaveStatus = () => {
        switch (saveStatus) {
            case 'unsaved':
                return <span className="flex items-center justify-center text-yellow-300"><SaveIcon className="w-5 h-5 mr-2" /> Unsaved</span>;
            case 'saving':
                return <span className="flex items-center justify-center text-gray-300"><svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Saving...</span>;
            case 'saved':
            default:
                return <span className="flex items-center justify-center text-green-400"><CheckCircleIcon className="w-5 h-5 mr-2" /> Auto-saved</span>;
        }
    };

    return (
        <div className="space-y-6">
            <header className="bg-gray-800/30 p-4 rounded-lg border border-gray-700/50 flex flex-col sm:flex-row gap-6">
                {sceneKeyframe && (
                    <div className="sm:w-1/3 flex-shrink-0">
                        {isBookendKeyframe(sceneKeyframe) ? (
                            <div className="flex gap-1">
                                <div className="relative flex-1">
                                    <img src={`data:image/jpeg;base64,${sceneKeyframe.start}`} alt={`Start Keyframe for ${scene.title}`} className="rounded-md aspect-square object-cover" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-1 rounded-b-md">Start</div>
                                </div>
                                <div className="relative flex-1">
                                    <img src={`data:image/jpeg;base64,${sceneKeyframe.end}`} alt={`End Keyframe for ${scene.title}`} className="rounded-md aspect-square object-cover" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-1 rounded-b-md">End</div>
                                </div>
                            </div>
                        ) : (
                            <img src={`data:image/jpeg;base64,${getActiveKeyframeImage(sceneKeyframe)}`} alt={`Keyframe for ${scene.title}`} className="rounded-md aspect-square object-cover" />
                        )}
                        <div className="mt-2 flex gap-2">
                            <button
                                onClick={() => setLinkModalState({ 
                                    isOpen: true, 
                                    imageData: getActiveKeyframeImage(sceneKeyframe) || '', 
                                    sceneId: scene.id 
                                })}
                                className="flex-1 px-3 py-1 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700 transition-colors"
                            >
                                Add to Visual Bible
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        onApiStateChange('loading', 'Regenerating keyframe...');
                                        const newImage = await mediaActions.generateKeyframeForScene(
                                            directorsVision,
                                            scene.summary,
                                            scene.id,
                                            onApiLog,
                                            onApiStateChange
                                        );
                                        onSceneKeyframeGenerated?.(scene.id, newImage);
                                        onApiStateChange('success', 'Keyframe regenerated!');
                                        
                                        // Push to keyframe version history if feature enabled
                                        if (getFeatureFlag(localGenSettings.featureFlags, 'keyframeVersionHistory')) {
                                            const promptContext = `${scene.title}: ${scene.summary}`;
                                            useSceneStateStore.getState().pushKeyframeVersion(scene.id, newImage, undefined, promptContext);
                                        }
                                        
                                        // Auto-analyze if feature is enabled
                                        if (localGenSettings.featureFlags?.autoVisionAnalysis && 
                                            isFeatureEnabled(localGenSettings.featureFlags, 'visionLLMFeedback')) {
                                            setTimeout(() => handleAnalyzeKeyframe(), 500);
                                        }
                                    } catch (error) {
                                        const message = error instanceof Error ? error.message : 'Failed to regenerate keyframe';
                                        onApiStateChange('error', message);
                                    }
                                }}
                                className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                                title="Regenerate this scene's keyframe"
                            >
                                <RefreshCwIcon className="w-3 h-3" />
                                Regenerate
                            </button>
                        </div>
                        
                        {/* Vision LLM Feedback Panel */}
                        {isFeatureEnabled(localGenSettings.featureFlags, 'visionLLMFeedback') && (
                            <div className="mt-3">
                                <VisionFeedbackPanel
                                    result={visionFeedback}
                                    isAnalyzing={isAnalyzingVision}
                                    error={visionError}
                                    onAnalyze={handleAnalyzeKeyframe}
                                    onApplyRefinedPrompt={handleApplyRefinedPrompt}
                                    onRegenerate={async (refinedPrompt) => {
                                        // Apply refined prompt then regenerate
                                        handleApplyRefinedPrompt(refinedPrompt);
                                        try {
                                            onApiStateChange('loading', 'Regenerating with improved prompt...');
                                            const newImage = await mediaActions.generateKeyframeForScene(
                                                directorsVision,
                                                refinedPrompt,
                                                scene.id,
                                                onApiLog,
                                                onApiStateChange
                                            );
                                            onSceneKeyframeGenerated?.(scene.id, newImage);
                                            onApiStateChange('success', 'Keyframe regenerated with improved prompt!');
                                            
                                            // Push to keyframe version history if feature enabled
                                            if (getFeatureFlag(localGenSettings.featureFlags, 'keyframeVersionHistory')) {
                                                const promptContext = `${scene.title}: ${refinedPrompt}`;
                                                useSceneStateStore.getState().pushKeyframeVersion(scene.id, newImage, undefined, promptContext);
                                            }
                                            
                                            // Re-analyze the new keyframe
                                            if (localGenSettings.featureFlags?.autoVisionAnalysis) {
                                                setTimeout(() => handleAnalyzeKeyframe(), 500);
                                            }
                                        } catch (error) {
                                            const message = error instanceof Error ? error.message : 'Failed to regenerate';
                                            onApiStateChange('error', message);
                                        }
                                    }}
                                    hasKeyframe={!!sceneKeyframe}
                                    compact={true}
                                />
                            </div>
                        )}
                    </div>
                )}
                <div className="flex-grow">
                    <h2 className="text-2xl font-bold text-white">{scene.title}</h2>
                    <p className="text-gray-400 mt-1">{scene.summary}</p>
                    {scene.heroArcName && (
                        <p className="text-xs text-amber-300 mt-1">
                            Hero Arc: <span className="font-semibold text-white">{scene.heroArcName}</span>
                            {scene.heroArcOrder ? ` (#${scene.heroArcOrder})` : ''}
                            {scene.heroArcSummary ? ` · ${scene.heroArcSummary.substring(0, 120)}${scene.heroArcSummary.length > 120 ? '…' : ''}` : ''}
                        </p>
                    )}
                    {visualBibleInfo && (visualBibleInfo.styleBoards.length > 0 || visualBibleInfo.tags.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {visualBibleInfo.styleBoards.map(board => (
                                <span key={board} className="px-2 py-0.5 bg-amber-600/20 text-amber-300 text-xs rounded-full border border-amber-600/30">
                                    {board}
                                </span>
                            ))}
                            {visualBibleInfo.tags.map(tag => (
                                <span key={tag} className="px-2 py-0.5 bg-blue-600/20 text-blue-300 text-xs rounded-full border border-blue-600/30">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    {isRefined && (
                         <button 
                            onClick={handleUpdateSummaryClick} 
                            disabled={isSummaryUpdating}
                            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors bg-yellow-600 text-white hover:bg-yellow-700 disabled:bg-gray-500"
                        >
                            {isSummaryUpdating ? <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <RefreshCwIcon className="w-4 h-4"/>}
                            Update Summary
                        </button>
                    )}
                </div>
            </header>

            {/* Image Generation Status Banner */}
            <div className={`rounded-lg p-4 border ${sceneKeyframe ? 'bg-green-900/20 border-green-500/30' : 'bg-amber-900/20 border-amber-500/30'}`}>
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                        {sceneKeyframe ? (
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        )}
                    </div>
                    <div className="flex-1">
                        {/* Header with mode indicator and status */}
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className={`text-sm font-semibold ${sceneKeyframe ? 'text-green-300' : 'text-amber-300'}`}>
                                Scene Keyframe: {sceneKeyframe ? 'Generated' : 'Not Generated (Optional)'}
                            </h4>
                            {localGenSettings.keyframeMode === 'bookend' && (
                                <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-300 border border-purple-700 rounded">
                                    Bookend Mode
                                </span>
                            )}
                        </div>
                        
                        {/* Bookend status indicator - shows which keyframes are present */}
                        {localGenSettings.keyframeMode === 'bookend' && (
                            <div className="flex items-center gap-3 text-xs mb-2">
                                <span className={`flex items-center gap-1 ${
                                    sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start 
                                        ? 'text-green-400' 
                                        : 'text-gray-500'
                                }`}>
                                    {sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start ? '✓' : '○'} Start Keyframe
                                </span>
                                <span className={`flex items-center gap-1 ${
                                    sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.end 
                                        ? 'text-green-400' 
                                        : 'text-gray-500'
                                }`}>
                                    {sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.end ? '✓' : '○'} End Keyframe
                                </span>
                            </div>
                        )}
                        
                        <p className="text-xs text-gray-400">
                            {sceneKeyframe ? (
                                localGenSettings.keyframeMode === 'bookend' 
                                    ? (isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start && sceneKeyframe.end
                                        ? 'Both bookend keyframes are ready. You can generate videos for this scene.'
                                        : 'Partial bookend keyframes generated. Generate both to enable video creation.')
                                    : 'Scene keyframe is ready. You can generate videos for this scene.'
                            ) : (
                                'Keyframes are only needed for local ComfyUI generation. You can still "Export Prompts" without them.'
                            )}
                        </p>
                        
                        {/* Keyframe generation buttons - split for bookend mode */}
                        {localGenSettings.keyframeMode === 'bookend' ? (
                            // Bookend mode: Show separate Start/End buttons
                            <div className="mt-3 space-y-2">
                                <div className="flex gap-2">
                                    {/* Generate Start Keyframe Button */}
                                    <button
                                        data-testid="generate-start-keyframe"
                                        onClick={async () => {
                                            try {
                                                onApiStateChange('loading', 'Generating start keyframe...');
                                                
                                                // Auto-generate temporal context if enabled and missing
                                                let sceneWithContext = scene;
                                                if (!scene.temporalContext?.startMoment && 
                                                    getFeatureFlag(localGenSettings.featureFlags, 'autoGenerateTemporalContext')) {
                                                    onApiStateChange('loading', 'Auto-generating temporal context...');
                                                    try {
                                                        const result = await generateTemporalContext(scene, localGenSettings);
                                                        if (result.success && result.context) {
                                                            sceneWithContext = { ...scene, temporalContext: result.context };
                                                            onUpdateScene(sceneWithContext);
                                                            console.log(`[Bookend] Auto-generated temporal context for scene ${scene.id}`);
                                                        } else {
                                                            // Fallback to heuristic if LLM fails
                                                            const fallbackContext = extractTemporalContextHeuristic(scene);
                                                            sceneWithContext = { ...scene, temporalContext: fallbackContext };
                                                            onUpdateScene(sceneWithContext);
                                                            console.log(`[Bookend] Using heuristic temporal context for scene ${scene.id}`);
                                                        }
                                                    } catch (err) {
                                                        console.error('[Bookend] Auto-generate temporal context failed:', err);
                                                        // Fallback to heuristic
                                                        const fallbackContext = extractTemporalContextHeuristic(scene);
                                                        sceneWithContext = { ...scene, temporalContext: fallbackContext };
                                                        onUpdateScene(sceneWithContext);
                                                    }
                                                    onApiStateChange('loading', 'Generating start keyframe...');
                                                }
                                                
                                                const existingBookend = sceneKeyframe && isBookendKeyframe(sceneKeyframe) ? sceneKeyframe : null;
                                                const newData = await generateSingleBookendLocally(
                                                    localGenSettings,
                                                    sceneWithContext,
                                                    JSON.stringify(storyBible),
                                                    directorsVision,
                                                    timeline.negativePrompt,
                                                    'start',
                                                    existingBookend,
                                                    onApiLog,
                                                    (state: { message?: string }) => onApiStateChange('loading', state.message ?? '')
                                                );
                                                onSceneKeyframeGenerated?.(scene.id, newData);
                                                onApiStateChange('success', 'Start keyframe generated!');
                                            } catch (error) {
                                                const message = error instanceof Error ? error.message : 'Failed to generate start keyframe';
                                                onApiStateChange('error', message);
                                            }
                                        }}
                                        disabled={!!(sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start)}
                                        className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
                                            sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start
                                                ? 'bg-green-700 hover:bg-green-600 cursor-default'
                                                : 'bg-amber-600 hover:bg-amber-700'
                                        }`}
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        {sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start ? '✓ Start Generated' : 'Generate Start Keyframe'}
                                    </button>
                                    
                                    {/* Generate End Keyframe Button */}
                                    <button
                                        data-testid="generate-end-keyframe"
                                        onClick={async () => {
                                            try {
                                                onApiStateChange('loading', 'Generating end keyframe...');
                                                
                                                // Auto-generate temporal context if enabled and missing
                                                let sceneWithContext = scene;
                                                if (!scene.temporalContext?.endMoment && 
                                                    getFeatureFlag(localGenSettings.featureFlags, 'autoGenerateTemporalContext')) {
                                                    onApiStateChange('loading', 'Auto-generating temporal context...');
                                                    try {
                                                        const result = await generateTemporalContext(scene, localGenSettings);
                                                        if (result.success && result.context) {
                                                            sceneWithContext = { ...scene, temporalContext: result.context };
                                                            onUpdateScene(sceneWithContext);
                                                            console.log(`[Bookend] Auto-generated temporal context for scene ${scene.id}`);
                                                        } else {
                                                            // Fallback to heuristic if LLM fails
                                                            const fallbackContext = extractTemporalContextHeuristic(scene);
                                                            sceneWithContext = { ...scene, temporalContext: fallbackContext };
                                                            onUpdateScene(sceneWithContext);
                                                            console.log(`[Bookend] Using heuristic temporal context for scene ${scene.id}`);
                                                        }
                                                    } catch (err) {
                                                        console.error('[Bookend] Auto-generate temporal context failed:', err);
                                                        // Fallback to heuristic
                                                        const fallbackContext = extractTemporalContextHeuristic(scene);
                                                        sceneWithContext = { ...scene, temporalContext: fallbackContext };
                                                        onUpdateScene(sceneWithContext);
                                                    }
                                                    onApiStateChange('loading', 'Generating end keyframe...');
                                                }
                                                
                                                const existingBookend = sceneKeyframe && isBookendKeyframe(sceneKeyframe) ? sceneKeyframe : null;
                                                const newData = await generateSingleBookendLocally(
                                                    localGenSettings,
                                                    sceneWithContext,
                                                    JSON.stringify(storyBible),
                                                    directorsVision,
                                                    timeline.negativePrompt,
                                                    'end',
                                                    existingBookend,
                                                    onApiLog,
                                                    (state: { message?: string }) => onApiStateChange('loading', state.message ?? '')
                                                );
                                                onSceneKeyframeGenerated?.(scene.id, newData);
                                                onApiStateChange('success', 'End keyframe generated!');
                                            } catch (error) {
                                                const message = error instanceof Error ? error.message : 'Failed to generate end keyframe';
                                                onApiStateChange('error', message);
                                            }
                                        }}
                                        disabled={!!(sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.end)}
                                        className={`flex-1 px-4 py-2 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
                                            sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.end
                                                ? 'bg-green-700 hover:bg-green-600 cursor-default'
                                                : 'bg-amber-600 hover:bg-amber-700'
                                        }`}
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        {sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.end ? '✓ End Generated' : 'Generate End Keyframe'}
                                    </button>
                                </div>
                                
                                {/* Regenerate Both option when both exist */}
                                {sceneKeyframe && isBookendKeyframe(sceneKeyframe) && sceneKeyframe.start && sceneKeyframe.end && (
                                    <button
                                        data-testid="regenerate-bookends"
                                        onClick={async () => {
                                            try {
                                                onApiStateChange('loading', 'Regenerating both bookend keyframes...');
                                                const newData = await generateSceneBookendsLocally(
                                                    localGenSettings,
                                                    scene,
                                                    JSON.stringify(storyBible),
                                                    directorsVision,
                                                    timeline.negativePrompt,
                                                    onApiLog,
                                                    (state: { message?: string }) => onApiStateChange('loading', state.message ?? '')
                                                );
                                                onSceneKeyframeGenerated?.(scene.id, newData);
                                                onApiStateChange('success', 'Bookend keyframes regenerated!');
                                            } catch (error) {
                                                const message = error instanceof Error ? error.message : 'Failed to regenerate keyframes';
                                                onApiStateChange('error', message);
                                            }
                                        }}
                                        className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <RefreshCwIcon className="w-4 h-4" />
                                        Regenerate Both Keyframes
                                    </button>
                                )}
                            </div>
                        ) : (
                            // Single keyframe mode: Original button
                            !sceneKeyframe && (
                                <button
                                    data-testid="generate-keyframes"
                                    onClick={async () => {
                                        try {
                                            onApiStateChange('loading', 'Generating keyframe...');
                                            const newData = await mediaActions.generateKeyframeForScene(
                                                directorsVision,
                                                scene.summary,
                                                scene.id,
                                                onApiLog,
                                                onApiStateChange
                                            );
                                            onSceneKeyframeGenerated?.(scene.id, newData);
                                            onApiStateChange('success', 'Keyframe generated!');
                                        } catch (error) {
                                            const message = error instanceof Error ? error.message : 'Failed to generate keyframe';
                                            onApiStateChange('error', message);
                                        }
                                    }}
                                    className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 transition-colors flex items-center gap-2"
                                >
                                    <ImageIcon className="w-4 h-4" />
                                    Generate Keyframe
                                </button>
                            )
                        )}
                        
                        {sceneKeyframe && timeline.shots.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                {timeline.shots.filter(s => effectiveGeneratedShotImages[s.id]).length} of {timeline.shots.length} shots have specific images.
                                {' '}Shots without images will use the scene keyframe.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Latest Render Section - Displays video from local generation or artifact metadata */}
            {(() => {
                // Use shared utility for consistent video source handling
                // Priority: local generation (most recent) > artifact metadata (E2E pipeline)
                // Use effectiveSceneStatus instead of localGenStatus[scene.id] for Zustand store compatibility
                const videoSource = getVideoSourceWithFallback(effectiveSceneStatus, sceneArtifactMetadata?.Video);
                
                if (videoSource?.isDataUrl) {
                    // Display video from local generation (data URL)
                    return (
                        <div className="bg-gray-800/30 border border-green-500/30 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-green-400 mb-3">Latest Render</h3>
                            <div className="max-w-2xl mx-auto bg-black rounded-lg overflow-hidden shadow-lg border border-gray-600">
                                <video 
                                    data-testid="latest-render-video"
                                    src={videoSource.source} 
                                    className="w-full aspect-video" 
                                    controls 
                                    autoPlay 
                                    loop 
                                    muted
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2 text-center">
                                {videoSource.filename || 'Generated video'}
                                <span className="ml-2 text-green-400/70">(Local)</span>
                            </p>
                        </div>
                    );
                } else if (videoSource) {
                    // Display info for artifact-based video (E2E pipeline - file path, not playable in browser)
                    return (
                        <div className="bg-gray-800/30 border border-indigo-500/30 rounded-lg p-4">
                            <h3 className="text-lg font-semibold text-indigo-400 mb-3">Latest Render</h3>
                            <p className="text-gray-400 text-sm">Video available: {videoSource.filename}</p>
                            <p className="text-gray-500 text-xs mt-1">Generated via E2E pipeline. Run locally to view in browser.</p>
                        </div>
                    );
                } else {
                    // No video available
                    return (
                        <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-4 text-center">
                            <h3 className="text-lg font-semibold text-gray-400 mb-2">Latest Render</h3>
                            <p className="text-gray-500">No video render available yet for this scene.</p>
                            <p className="text-sm text-gray-600 mt-1">Generate locally or use the AI pipeline to create a video.</p>
                        </div>
                    );
                }
            })()}

            {/* Video Quality Analysis Section */}
            {isFeatureEnabled(localGenSettings.featureFlags, 'videoAnalysisFeedback') && (
                <div className="bg-gray-800/30 border border-purple-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-purple-400">Video Quality Analysis</h3>
                        <button
                            onClick={handleAnalyzeVideo}
                            disabled={isAnalyzingVideo || !effectiveSceneStatus?.final_output?.data}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                isAnalyzingVideo 
                                    ? 'bg-purple-900/50 text-purple-300 cursor-wait' 
                                    : effectiveSceneStatus?.final_output?.data
                                        ? 'bg-purple-600 hover:bg-purple-500 text-white'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {isAnalyzingVideo ? 'Analyzing...' : 'Analyze Video'}
                        </button>
                    </div>
                    
                    {qualityGateResult && (
                        <div className={`mb-3 p-2 rounded text-sm ${
                            qualityGateResult.decision === 'pass' 
                                ? 'bg-green-900/30 text-green-300 border border-green-700/50' 
                                : qualityGateResult.decision === 'warning'
                                    ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50'
                                    : 'bg-red-900/30 text-red-300 border border-red-700/50'
                        }`}>
                            {getQualityGateStatusMessage(qualityGateResult)}
                        </div>
                    )}
                    
                    <VideoAnalysisCard
                        result={videoFeedback}
                        qualityGateResult={qualityGateResult}
                        isAnalyzing={isAnalyzingVideo}
                        startKeyframe={(() => {
                            const kf = effectiveGeneratedImages[scene.id];
                            if (!kf) return undefined;
                            if (isBookendKeyframe(kf)) return kf.start;
                            if (isSingleKeyframe(kf)) return kf;
                            return undefined;
                        })()}
                        endKeyframe={(() => {
                            const kf = effectiveGeneratedImages[scene.id];
                            if (!kf) return undefined;
                            if (isBookendKeyframe(kf)) return kf.end;
                            return undefined;
                        })()}
                        onReanalyze={handleAnalyzeVideo}
                        className="mt-3"
                    />
                </div>
            )}

            {latestSceneSnapshot && (
                <div className="bg-gray-800/30 border border-emerald-500/30 rounded-lg p-4 text-xs text-gray-300 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-gray-400 uppercase tracking-wide">
                        <span>Latest ComfyUI run</span>
                        <span>{latestArtifact?.RunId}</span>
                    </div>
                    <div className="text-base text-gray-100 font-semibold">
                        Frames {latestSceneSnapshot.FrameCount}/{latestSceneSnapshot.FrameFloor}
                    </div>
                    {latestTelemetryChips.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {latestTelemetryChips.map((chip) => (
                                <span key={chip} className="px-2 py-0.5 rounded-full bg-gray-900/80 text-[11px] text-gray-200 border border-gray-700/60">
                                    {chip}
                                </span>
                            ))}
                        </div>
                    )}
                    {queuePolicy && (
                        <div className="text-[11px] text-gray-400">
                            Queue policy: retry budget {queuePolicy.SceneRetryBudget ?? 'n/a'}, wait {queuePolicy.HistoryMaxWaitSeconds ?? 'n/a'}s, poll interval {queuePolicy.HistoryPollIntervalSeconds ?? 'n/a'}s, attempts{' '}
                            {(queuePolicy.HistoryMaxAttempts ?? 0) > 0 ? queuePolicy.HistoryMaxAttempts : 'unbounded'}, post-exec {queuePolicy.PostExecutionTimeoutSeconds ?? 'n/a'}s
                        </div>
                    )}
                    {latestSceneSnapshot.HistoryConfig && (
                        <div className="text-[11px] text-gray-500">
                            History config: wait ≤ {latestSceneSnapshot.HistoryConfig.MaxWaitSeconds ?? 'n/a'}s · interval {latestSceneSnapshot.HistoryConfig.PollIntervalSeconds ?? 'n/a'}s · post-exec{' '}
                            {latestSceneSnapshot.HistoryConfig.PostExecutionTimeoutSeconds ?? 'n/a'}s
                        </div>
                    )}
                    {latestGpu && (
                        <div className="text-[11px] text-gray-400">
                            GPU: {latestGpu.Name ?? 'n/a'} · Free before {latestGpu.VramBeforeMB ?? 'n/a'}MB · after {latestGpu.VramAfterMB ?? 'n/a'}MB (Δ {latestGpu.VramDeltaMB ?? 'n/a'}MB)
                        </div>
                    )}
                    {latestSceneInsights && (
                        <div className="text-[11px] text-gray-400 bg-gray-900/40 border border-gray-700/40 rounded px-2 py-1.5 space-y-1">
                            <p className="text-gray-500 uppercase tracking-wide text-[10px]">Poll History</p>
                            <p>Polls: {latestSceneInsights.pollLogCount} · Limit: {latestSceneInsights.pollLimit} · Last status: {latestSceneInsights.lastPollStatus}</p>
                            {latestSceneInsights.historyConfig && (
                                <p className="text-gray-500">
                                    Config: {latestSceneInsights.historyConfig.MaxWaitSeconds}s wait, {latestSceneInsights.historyConfig.PollIntervalSeconds}s interval, {latestSceneInsights.historyConfig.PostExecutionTimeoutSeconds}s post-exec
                                </p>
                            )}
                        </div>
                    )}
                    {latestFallbackNotes.length > 0 && (
                        <div className="text-[11px] text-amber-200">Fallback: {latestFallbackNotes.join('; ')}</div>
                    )}
                    <div className="grid gap-3 text-[11px] text-gray-400 sm:grid-cols-2">
                        <div className="space-y-0.5">
                            <p className="text-gray-500 uppercase tracking-wide text-[10px]">LLM metadata</p>
                            <p className="text-sm text-gray-100 truncate">{llmMetadata?.providerUrl ?? 'n/a'}</p>
                            <p>Model: {llmMetadata?.model ?? 'n/a'} · Format: {llmMetadata?.requestFormat ?? 'n/a'}</p>
                            <p>Seed: {llmMetadata?.seed ?? 'n/a'} · Duration: {llmMetadata?.durationMs ?? 'n/a'}ms</p>
                            {llmMetadata?.error && <p className="text-amber-300">Error: {llmMetadata.error}</p>}
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-gray-500 uppercase tracking-wide text-[10px]">Health check</p>
                            <p className="text-sm text-gray-100">{healthCheck?.Status ?? 'not requested'}</p>
                            {healthCheck?.Url && <p className="text-gray-100">Endpoint: {healthCheck.Url}</p>}
                            {healthCheck?.Override && <p>Override: {healthCheck.Override}</p>}
                            {healthCheck?.Models != null && <p>Models: {healthCheck.Models}</p>}
                            {healthCheck?.SkipReason && <p>Skip reason: {healthCheck.SkipReason}</p>}
                            {healthCheck?.Error && (
                                <p className="text-amber-300 text-[11px]">Health error: {healthCheck.Error}</p>
                            )}
                        </div>
                    </div>
                    {latestArtifact?.Archive && (
                        <div className="text-[11px] text-gray-400">Archive: {latestArtifact.Archive}</div>
                    )}
                    {(latestSceneSnapshot.Warnings?.length ?? 0) > 0 && (
                        <div className="bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2 text-[11px] text-amber-200 space-y-1">
                            {latestSceneSnapshot.Warnings?.map((warning) => (
                                <div key={warning}>⚠ {warning}</div>
                            ))}
                        </div>
                    )}
                    {(latestSceneSnapshot.Errors?.length ?? 0) > 0 && (
                        <div className="bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2 text-[11px] text-red-200 space-y-1">
                            {latestSceneSnapshot.Errors?.map((err) => (
                                <div key={err}>⛔ {err}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {timeline.shots.length === 0 && !isGeneratingInitialShots && (
                <GuidedAction
                    title="Your Scene is an Empty Canvas"
                    description="Let's bring it to life. Use the AI to generate an initial, detailed shot list based on your Story Bible and Director's Vision."
                    buttonText="Generate & Detail Initial Shots"
                    onClick={handleGenerateAndDetailInitialShots}
                    icon={<TimelineIcon className="w-12 h-12" />}
                    buttonProps={{ 'data-testid': 'btn-generate-shots' }}
                />
            )}

            {/* Show skeleton placeholders during initial shot generation */}
            {isGeneratingInitialShots && (
                <div className="space-y-4" data-testid="shot-skeletons">
                    <ShotCardSkeleton />
                    <ShotCardSkeleton />
                    <ShotCardSkeleton />
                </div>
            )}

            {timeline.shots.length > 0 && (
                 <GuideCard title="Refine Your Timeline">
                    <p>Your initial shot list is ready. Now you can bring your creative direction to life:</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                        <li>Drag and drop shots to reorder your sequence.</li>
                        <li>Manually edit shot descriptions and add <strong className="text-amber-300">Creative Controls</strong> for cinematic flair.</li>
                        <li>Use the <strong className="text-amber-300">"Refine All"</strong> buttons for quick, AI-powered improvements.</li>
                        <li>Consult the <strong className="text-amber-300">AI Co-Director</strong> below for bold, creative suggestions.</li>
                    </ul>
                </GuideCard>
            )}

            <div 
                className="space-y-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
            >
                {timeline.shots.length > 0 ? (
                    timeline.shots.map((shot, index) => (
                        <div
                            key={shot.id}
                            data-testid="shot-row"
                            data-shot-id={shot.id}
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                        >
                            {dragOverIndex === index && draggedItemIndex !== null && dragOverIndex !== draggedItemIndex && (
                               <div className="drag-over-indicator"></div>
                            )}
                            <TimelineItem
                                shot={shot}
                                index={index}
                                enhancers={timeline.shotEnhancers[shot.id] || {}}
                                imageUrl={effectiveGeneratedShotImages[shot.id]}
                                isGeneratingImage={isGeneratingShotImage[shot.id] || false}
                                onDescriptionChange={(shotId, desc) => updateTimeline({ shots: timeline.shots.map(s => s.id === shotId ? { ...s, description: desc } : s) })}
                                onEnhancersChange={(shotId, enh) => updateTimeline({ shotEnhancers: { ...timeline.shotEnhancers, [shotId]: enh } })}
                                onDeleteShot={handleDeleteShot}
                                onGenerateImage={handleGenerateShotImage}
                                onLinkToVisualBible={(shotId, imageData) => setLinkModalState({ isOpen: true, imageData, shotId })}
                                isDragging={draggedItemIndex === index}
                                visualBible={visualBible}
                            />
                            {index < timeline.shots.length - 1 && (
                                <TransitionSelector value={timeline.transitions[index] || 'Cut'} onChange={(newVal) => {
                                    const newTransitions = [...timeline.transitions];
                                    newTransitions[index] = newVal;
                                    updateTimeline({ transitions: newTransitions });
                                }} />
                            )}
                        </div>
                    ))
                ) : null}
            </div>

            <div className="flex justify-center">
                <button onClick={handleAddShot} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-300 bg-gray-800/60 border border-gray-700 rounded-full hover:bg-gray-700/80 hover:border-gray-600 transition-colors">
                    <PlusIcon className="w-4 h-4" /> Add Shot
                </button>
            </div>
            
            {timeline.shots.length > 0 && (
                <>
                     <div className="space-y-4 p-4 bg-gray-900/30 rounded-lg ring-1 ring-gray-700/50">
                        {/* Template Guidance Section */}
                        {templateContext.selectedTemplate && (
                            <div className="mb-6 space-y-3 pb-4 border-b border-gray-700/50">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-semibold text-amber-400">Template Guidance</h3>
                                    <button 
                                        onClick={() => setIsTemplateGuidanceOpen(true)}
                                        className="px-3 py-1 text-xs font-medium rounded-full bg-amber-600/30 text-amber-300 hover:bg-amber-600/50 transition-colors border border-amber-600/50"
                                    >
                                        View Details
                                    </button>
                                </div>
                                <MandatoryElementsChecklist 
                                    elements={templateContext.mandatoryElements}
                                    covered={templateContext.coveredElements}
                                    title={`${templateContext.mandatoryElements.length} Mandatory Elements`}
                                />
                            </div>
                        )}
                        
                        <div>
                            <label htmlFor="negative-prompt" className="block text-sm font-semibold text-gray-200 mb-2">Scene-Wide Negative Prompt</label>
                            <textarea
                                id="negative-prompt"
                                value={timeline.negativePrompt}
                                onChange={(e) => updateTimeline({ negativePrompt: e.target.value })}
                                rows={2}
                                className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-2"
                                placeholder="e.g., text, watermark, blurry, low-resolution, ugly, tiling..."
                            />
                            <NegativePromptSuggestions 
                                directorsVision={directorsVision} 
                                sceneSummary={scene.summary} 
                                onSelect={(suggestion) => {
                                    const separator = timeline.negativePrompt ? ', ' : '';
                                    updateTimeline({ negativePrompt: timeline.negativePrompt + separator + suggestion });
                                }} 
                                onApiLog={onApiLog} 
                                onApiStateChange={onApiStateChange} 
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4 border-t border-gray-800">
                             <button
                                onClick={() => handleBatchProcess(['REFINE_DESCRIPTION'])}
                                disabled={isBatchProcessing !== false}
                                className="text-sm font-semibold text-amber-400 hover:text-amber-300 disabled:text-gray-500 flex items-center gap-2 justify-center"
                            >
                                {isBatchProcessing === 'description' ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-4 h-4" />}
                                Refine All Descriptions
                            </button>
                            <button
                                onClick={() => handleBatchProcess(['SUGGEST_ENHANCERS'])}
                                disabled={isBatchProcessing !== false}
                                className="text-sm font-semibold text-amber-400 hover:text-amber-300 disabled:text-gray-500 flex items-center gap-2 justify-center"
                            >
                                {isBatchProcessing === 'enhancers' ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-4 h-4" />}
                                Suggest All Enhancers
                            </button>
                        </div>
                        {/* Batch processing progress indicator */}
                        {isBatchProcessing && batchProgressMessage && (
                            <div className="text-center py-3 px-4 bg-gray-800/50 rounded-lg border border-gray-700 mt-3" role="status" aria-live="polite">
                                <div className="flex items-center justify-center gap-2 text-sm text-amber-300">
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>{batchProgressMessage}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {!coDirectorResult && timeline.shots.length > 0 && (
                         <GuidedAction
                            title="Need a Fresh Perspective?"
                            description="The AI Co-Director can analyze your current timeline and suggest creative changes to enhance the mood, pacing, and visual storytelling."
                            buttonText="Consult the AI Co-Director"
                            onClick={() => {
                                const element = document.getElementById('co-director-objective');
                                element?.focus();
                                element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            icon={<CompassIcon className="w-12 h-12" />}
                        />
                    )}
                    
                    <Suspense fallback={<div className="p-4 text-center text-gray-500">Loading Co-Director...</div>}>
                        <CoDirector
                            onGetSuggestions={handleGetCoDirectorSuggestions}
                            isLoading={isCoDirectorLoading}
                            result={coDirectorResult}
                            onApplySuggestion={(suggestion) => {
                                onApplySuggestion(suggestion, scene.id);
                                setHasChanges(true); // Applying suggestion is a change
                            }}
                            onClose={() => setCoDirectorResult(null)}
                            storyBible={storyBible}
                            scene={scene}
                            directorsVision={directorsVision}
                            onApiLog={onApiLog}
                            onApiStateChange={onApiStateChange}
                            addToast={addToast}
                        />
                    </Suspense>
                </>
            )}
            
            <div className="space-y-6 pt-6 border-t border-gray-700/50">
                 <LocalGenerationStatusComponent 
                    status={effectiveSceneStatus}
                    onClear={() => updateSceneGenStatus({ status: 'idle', message: '', progress: 0 })}
                    upscalingEnabled={localGenSettings ? isUpscalingSupported(localGenSettings) : false}
                    onUpscale={handleUpscaleVideo}
                    isUpscaling={isUpscaling}
                 />
                 
                {/* Phase 7: Active Generation Features Indicator */}
                {Object.values(activeFeatures).some(Boolean) && (
                    <div className="flex flex-wrap gap-2 px-3 py-2 bg-gray-800/40 rounded-lg border border-gray-700/40">
                        <span className="text-xs text-gray-500 uppercase tracking-wide mr-2">Active Features:</span>
                        {activeFeatures.narrativeTracking && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-900/60 text-[11px] text-blue-300 border border-blue-700/50">
                                📖 Narrative Tracking
                            </span>
                        )}
                        {activeFeatures.characterConsistency && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-900/60 text-[11px] text-purple-300 border border-purple-700/50">
                                👤 Character Consistency (IP-Adapter)
                            </span>
                        )}
                        {activeFeatures.shotLevelContinuity && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-[11px] text-emerald-300 border border-emerald-700/50">
                                🎬 Shot Continuity
                            </span>
                        )}
                        {activeFeatures.videoUpscaling && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-900/60 text-[11px] text-amber-300 border border-amber-700/50">
                                ⬆️ Video Upscaling
                            </span>
                        )}
                    </div>
                )}
                 
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex gap-4 flex-wrap">
                        <button onClick={handleExportPrompts} className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-full shadow-lg hover:bg-gray-700 transition-colors">
                            Export Prompts
                        </button>
                        <Tooltip text={!isLocalGenConfigured ? "Please configure ComfyUI server and sync workflow in Settings." : "Generate video using your local ComfyUI server"}>
                            <button
                                data-testid="generate-videos"
                                onClick={handleGenerateLocally}
                                disabled={!isLocalGenConfigured}
                                className="px-6 py-3 bg-amber-600 text-white font-semibold rounded-full shadow-lg hover:bg-amber-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                               Generate Video
                            </button>
                        </Tooltip>
                        <Tooltip text={!isLocalGenConfigured 
                            ? "Please configure ComfyUI server and sync workflow in Settings." 
                            : "Chain-of-frames generation: Each shot's end frame becomes the next shot's start frame for smoother scene continuity. Uses WanFirstLastFrameToVideo node."}>
                            <button
                                data-testid="generate-chained"
                                onClick={handleGenerateChained}
                                disabled={!isLocalGenConfigured}
                                className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-full shadow-lg hover:bg-emerald-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                               🔗 Generate Chained
                            </button>
                        </Tooltip>
                        {/* Phase 2.3: "Generate Video" button removed - was redundant with "Generate Locally" 
                            and caused user confusion. "Generate Locally" renamed to "Generate Video" for clarity.
                            If cloud video generation is needed in future, implement as separate feature with RFC. */}
                    </div>
                     <div className="px-4 py-2 text-sm font-semibold rounded-full bg-gray-800/60 border border-gray-700 w-40 text-center">
                        {renderSaveStatus()}
                    </div>
                </div>
                 <GuideCard title="Next Steps: Export or Generate">
                    <p>Your timeline is ready! <strong>Export Prompts</strong> works immediately (no setup required) - it creates JSON/text prompts for any video generator. Or configure ComfyUI in Settings to use <strong>Generate Video</strong> with keyframes.</p>
                </GuideCard>
            </div>

             <FinalPromptModal 
                isOpen={isPromptModalOpen}
                onClose={() => setIsPromptModalOpen(false)}
                payloads={promptsToExport}
                asDrawer={uiRefreshEnabled}
             />
            
            {isTemplateGuidanceOpen && templateContext.selectedTemplate && (
                <TemplateGuidancePanel 
                    template={templateContext.selectedTemplate}
                    coveredElements={templateContext.coveredElements}
                    onClose={() => setIsTemplateGuidanceOpen(false)}
                />
            )}
            {linkModalState?.isOpen && (
                <VisualBibleLinkModal
                    isOpen={linkModalState.isOpen}
                    onClose={() => setLinkModalState(null)}
                    imageData={linkModalState.imageData}
                    sceneId={linkModalState.sceneId || scene.id}
                    shotId={linkModalState.shotId}
                />
            )}
        </div>
    );
};

export default TimelineEditor;
