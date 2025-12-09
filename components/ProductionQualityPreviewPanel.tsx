/**
 * ProductionQualityPreviewPanel - Preview the production default video pipeline
 * 
 * Phase 9: Provides an in-app way to test the production pipeline configuration
 * (wan-fun-inpaint + Standard stability profile) on a sample scene.
 * 
 * Features:
 * - Shows current production default configuration
 * - Supports selecting alternative pipelines for comparison (Cinematic, Character-stable, Fast)
 * - Runs preview generation using real golden sample keyframes
 * - Displays generated video inline
 * - Links to Vision QA panel for deeper analysis
 * - Config-driven pipeline configuration (C2 - Modular Pipeline Refactor)
 * 
 * Note: This is a diagnostic/preview tool that does not modify user project data.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { LocalGenerationSettings, Scene, TimelineData, Shot } from '../types';
import { applyStabilityProfile, type StabilityProfileId } from '../utils/stabilityProfiles';
import { mergeFeatureFlags } from '../utils/featureFlags';
import { generateVideoFromBookendsWithPreflight, getAvailablePresets } from '../services/comfyUIService';
import type { PreflightResult } from '../services/resourcePreflight';
import {
    loadPipelineConfigById,
    resolvePipelineRuntimeConfig,
    mergePipelineIntoSettings,
    getDefaultPipelineIdForPreset,
} from '../services/pipelineConfigService';
import type { ResolvedPipelineConfig } from '../types/pipelineConfig';
import { listCameraTemplates, type CameraTemplateInfo } from '../services/cameraTemplateService';
import { loadImageAsBase64, checkComfyUIAvailable } from '../services/staticDataService';

interface ProductionQualityPreviewPanelProps {
    settings: LocalGenerationSettings | null;
    defaultCollapsed?: boolean;
    onScrollToVisionQA?: () => void;
}

type PreviewStatus = 'idle' | 'loading-keyframes' | 'checking' | 'generating' | 'completed' | 'error';

/**
 * Pipeline preset configuration for the preview panel
 * 
 * Simplified preset structure (B2 - Resource Safety):
 * - Fast: 6-8 GB VRAM, no temporal processing
 * - Production: 8-12 GB VRAM, balanced quality/speed (default)
 * - Cinematic: 12-16 GB VRAM, full temporal stack
 * 
 * Character-stable is merged into Cinematic as an opt-in via IP-Adapter toggle.
 * 
 * VRAM requirements are displayed to help users choose appropriate presets.
 */
interface PipelinePreset {
    id: string;
    label: string;
    shortLabel: string;
    workflowProfile: string;
    stabilityProfile: StabilityProfileId;
    vramHint: string;
    vramLevel: 'low' | 'medium' | 'high';
    vramMinGB: number;
    vramRecommendedGB: number;
    isDefault: boolean;
    description: string;
    /** Whether this preset is advanced (shown under expandable section) */
    isAdvanced?: boolean;
}

/**
 * Available pipeline presets for preview generation
 * 
 * Pipeline presets from simplest to most feature-rich:
 * - Fast: Quick iteration, low VRAM
 * - Production: Balanced, recommended default
 * - Cinematic: Maximum quality, high VRAM
 * - Cinematic Gold: Hero configuration, best-of-breed features
 */
const PIPELINE_PRESETS: PipelinePreset[] = [
    {
        id: 'fast',
        label: 'Fast (Low VRAM)',
        shortLabel: 'Fast',
        workflowProfile: 'wan-flf2v',
        stabilityProfile: 'fast',
        vramHint: '6-8 GB VRAM',
        vramLevel: 'low',
        vramMinGB: 6,
        vramRecommendedGB: 8,
        isDefault: false,
        description: 'No temporal processing. Fastest generation for quick iteration.',
    },
    {
        id: 'production',
        label: '★ Production (Recommended)',
        shortLabel: 'Production',
        workflowProfile: 'wan-fun-inpaint',
        stabilityProfile: 'standard',
        vramHint: '8-12 GB VRAM',
        vramLevel: 'medium',
        vramMinGB: 8,
        vramRecommendedGB: 12,
        isDefault: true,
        description: 'Deflicker ON for smooth output. Best balance of quality and speed.',
    },
    {
        id: 'cinematic',
        label: 'Cinematic (High Quality)',
        shortLabel: 'Cinematic',
        workflowProfile: 'wan-flf2v-feta',
        stabilityProfile: 'cinematic',
        vramHint: '12-16 GB VRAM',
        vramLevel: 'high',
        vramMinGB: 12,
        vramRecommendedGB: 16,
        isDefault: false,
        description: 'Full temporal stack: deflicker, FETA enhancement. Enable IP-Adapter in settings for character consistency.',
        isAdvanced: true,
    },
    {
        id: 'cinematic-gold',
        label: '🏆 Cinematic Gold (Hero)',
        shortLabel: 'Gold',
        workflowProfile: 'wan-flf2v-feta',
        stabilityProfile: 'cinematic',
        vramHint: '14-16 GB VRAM',
        vramLevel: 'high',
        vramMinGB: 14,
        vramRecommendedGB: 16,
        isDefault: false,
        description: 'Hero configuration: best-of-breed features, strict QA (80+ threshold), optimized camera motion, 4s duration. For final production.',
        isAdvanced: true,
    },
];

// Preview sample paths (loaded from public/artifacts/preview-sample/)
const PREVIEW_KEYFRAME_START = '/artifacts/preview-sample/start.png';
const PREVIEW_KEYFRAME_END = '/artifacts/preview-sample/end.png';

// Create a minimal scene for preview generation
function createPreviewScene(): Scene {
    const shot: Shot = {
        id: 'preview-shot-001',
        title: 'Spinning Top',
        description: 'A colorful wooden spinning top toy resting upright on a polished wooden table. The camera slowly and smoothly pushes in slightly.',
    };

    const timeline: TimelineData = {
        shots: [shot],
        shotEnhancers: {
            'preview-shot-001': {
                framing: ['medium shot'],
                movement: ['slow push in'],
                lighting: ['natural light'],
            },
        },
        transitions: [],
        negativePrompt: 'blurry, low quality, artifacts, flickering, unstable, jittery, motion blur',
    };

    return {
        id: 'preview-scene-001',
        title: 'Preview Scene - Spinning Top',
        summary: 'A colorful wooden spinning top toy sitting still on a wooden table, with camera slowly pushing in slightly',
        timeline,
        keyframeMode: 'bookend',
        temporalContext: {
            startMoment: 'Top resting still, medium shot',
            endMoment: 'Closer view of top with more detail visible',
            duration: 3.0,
        },
    };
}

// Get the production default preset - guaranteed to exist since array is non-empty
// Using assertion here because PIPELINE_PRESETS is a const array defined above with at least one isDefault=true entry
const PRODUCTION_DEFAULT_PRESET: PipelinePreset = PIPELINE_PRESETS.find(p => p.isDefault)!;

const ProductionQualityPreviewPanel: React.FC<ProductionQualityPreviewPanelProps> = ({
    settings,
    defaultCollapsed = true,
    onScrollToVisionQA,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [status, setStatus] = useState<PreviewStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [generationTime, setGenerationTime] = useState<number | null>(null);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('production');
    const [availableVRAM, setAvailableVRAM] = useState<{ freeMB: number; totalMB: number } | null>(null);
    const [recommendedPreset, setRecommendedPreset] = useState<StabilityProfileId | null>(null);
    const [presetDowngradeWarning, setPresetDowngradeWarning] = useState<string | null>(null);
    const [cameraTemplates, setCameraTemplates] = useState<CameraTemplateInfo[]>([]);
    const [selectedCameraTemplateId, setSelectedCameraTemplateId] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);

    // Get the currently selected pipeline preset - always falls back to production default
    const selectedPipeline: PipelinePreset = PIPELINE_PRESETS.find(p => p.id === selectedPipelineId) ?? PRODUCTION_DEFAULT_PRESET;
    
    // Check VRAM availability on mount and settings change
    useEffect(() => {
        if (!settings) return;
        
        const checkVRAM = async () => {
            try {
                const result = await getAvailablePresets(settings);
                setAvailableVRAM(result.vramStatus);
                setRecommendedPreset(result.recommended);
            } catch {
                // Ignore errors - just means we can't show VRAM info
            }
        };
        
        checkVRAM();
    }, [settings]);

    // Load camera templates on mount
    useEffect(() => {
        const loadTemplates = async () => {
            try {
                const templates = await listCameraTemplates();
                setCameraTemplates(templates);
            } catch (err) {
                console.warn('[ProductionQualityPreview] Failed to load camera templates:', err);
            }
        };
        
        loadTemplates();
    }, []);
    
    // Check if ComfyUI is available
    const checkComfyUIStatus = useCallback(async (): Promise<boolean> => {
        if (!settings?.comfyUIUrl) return false;
        return checkComfyUIAvailable(settings.comfyUIUrl);
    }, [settings?.comfyUIUrl]);

    const handleRunPreview = useCallback(async () => {
        if (!settings) {
            setErrorMessage('Settings not available');
            setStatus('error');
            return;
        }

        const startTime = Date.now();
        setStatus('loading-keyframes');
        setStatusMessage('Loading preview keyframes...');
        setErrorMessage(null);
        setPreviewVideoUrl(null);
        setGenerationTime(null);

        // Get the selected pipeline configuration
        const pipeline = selectedPipeline;

        try {
            // Step 1: Load keyframes from public folder
            let startKeyframe: string;
            let endKeyframe: string;
            try {
                [startKeyframe, endKeyframe] = await Promise.all([
                    loadImageAsBase64(PREVIEW_KEYFRAME_START),
                    loadImageAsBase64(PREVIEW_KEYFRAME_END),
                ]);
            } catch {
                setErrorMessage('Preview keyframes not found. Ensure preview sample files exist in public/artifacts/preview-sample/');
                setStatus('error');
                return;
            }

            // Step 2: Check ComfyUI availability
            setStatus('checking');
            setStatusMessage('Checking ComfyUI connection...');
            const isComfyUIAvailable = await checkComfyUIStatus();
            if (!isComfyUIAvailable) {
                setErrorMessage('ComfyUI is not running. Start it via VS Code task: "Start ComfyUI Server (Patched)"');
                setStatus('error');
                return;
            }

            // Step 3: Try config-driven approach first, with fallback to hard-coded
            let pipelineSettings: LocalGenerationSettings;
            let resolvedConfig: ResolvedPipelineConfig | null = null;
            
            // Attempt to load pipeline config for the selected preset
            const configId = getDefaultPipelineIdForPreset(pipeline.id);
            const loadResult = await loadPipelineConfigById(configId);
            
            if (loadResult.success && loadResult.config) {
                // Config-driven path: resolve and use config
                try {
                    resolvedConfig = resolvePipelineRuntimeConfig(loadResult.config, settings);
                    pipelineSettings = mergePipelineIntoSettings(settings, resolvedConfig);
                    console.debug(`[ProductionQualityPreview] Using config-driven pipeline: ${configId}`);
                } catch (configError) {
                    // Config resolution failed - fall through to legacy path
                    console.warn(
                        `[ProductionQualityPreview] Config resolution failed for ${configId}, using legacy path:`,
                        configError instanceof Error ? configError.message : configError
                    );
                    resolvedConfig = null;
                }
            } else if (loadResult.warnings?.length) {
                console.warn(`[ProductionQualityPreview] Config load warnings for ${configId}:`, loadResult.warnings);
            }
            
            // Fallback: use legacy hard-coded pipeline configuration
            if (!resolvedConfig) {
                // Check workflow profile exists for selected pipeline (legacy check)
                const workflowProfile = settings.workflowProfiles?.[pipeline.workflowProfile];
                if (!workflowProfile) {
                    setErrorMessage(
                        `Workflow profile "${pipeline.workflowProfile}" not found. ` +
                        'Import workflow profiles from Settings → ComfyUI Settings → Import from File.'
                    );
                    setStatus('error');
                    return;
                }

                // Create settings with selected pipeline configuration enforced (legacy path)
                // mergeFeatureFlags returns complete FeatureFlags, applyStabilityProfile updates temporal settings
                const baseFlags = mergeFeatureFlags(settings.featureFlags);
                const pipelineFlags = {
                    ...baseFlags,
                    ...applyStabilityProfile(baseFlags, pipeline.stabilityProfile),
                };
                
                pipelineSettings = {
                    ...settings,
                    videoWorkflowProfile: pipeline.workflowProfile,
                    sceneBookendWorkflowProfile: pipeline.workflowProfile,
                    featureFlags: pipelineFlags,
                };
                console.debug(`[ProductionQualityPreview] Using legacy hard-coded pipeline: ${pipeline.id}`);
            }

            // Step 4: Generate with selected pipeline configuration
            setStatus('generating');
            setStatusMessage(`Generating preview video with ${pipeline.shortLabel} pipeline...`);

            // Create the preview scene and bookends
            const previewScene = createPreviewScene();
            const bookends = { start: startKeyframe, end: endKeyframe };
            const directorsVision = 'Professional product photography style, soft natural lighting, shallow depth of field';

            // No-op logger and state handler for preview
            const noopLogger = () => {};
            const stateHandler = (state: { progress?: number; message?: string; phase?: string }) => {
                if (state.phase === 'preflight') {
                    setStatusMessage(`Preflight: ${state.message || 'checking...'}`);
                } else if (state.progress !== undefined) {
                    setStatusMessage(`Generating: ${state.progress}%`);
                }
            };

            // Clear previous downgrade warning
            setPresetDowngradeWarning(null);

            // Determine workflow profile ID from config or fallback
            const workflowProfileId = resolvedConfig?.workflowProfileId ?? pipeline.workflowProfile;
            const stabilityProfileForPreflight = resolvedConfig?.stabilityProfileId ?? pipeline.stabilityProfile;

            // Generate video using preflight-aware pipeline
            const videoDataUrl = await generateVideoFromBookendsWithPreflight(
                pipelineSettings!,
                previewScene,
                previewScene.timeline,
                bookends,
                directorsVision,
                noopLogger,
                stateHandler,
                workflowProfileId,
                {
                    requestedPreset: stabilityProfileForPreflight,
                    allowDowngrade: true,
                    onPresetDowngrade: (from, to, reason) => {
                        setPresetDowngradeWarning(`Preset downgraded from ${from} to ${to}: ${reason}`);
                    },
                    onPreflightComplete: (result: PreflightResult) => {
                        if (result.vramStatus) {
                            setAvailableVRAM({ freeMB: result.vramStatus.freeMB, totalMB: result.vramStatus.totalMB });
                        }
                    },
                }
            );

            // Success!
            const elapsed = (Date.now() - startTime) / 1000;
            setGenerationTime(elapsed);
            setPreviewVideoUrl(videoDataUrl);
            setStatusMessage(`Generated in ${elapsed.toFixed(1)}s using ${pipeline.shortLabel}`);
            setStatus('completed');

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error occurred';
            console.error('[ProductionQualityPreview] Error:', err);
            setErrorMessage(message);
            setStatus('error');
        }
    }, [settings, checkComfyUIStatus, selectedPipeline]);

    // Handle scrolling to Vision QA panel
    const handleViewVisionQA = useCallback(() => {
        if (onScrollToVisionQA) {
            onScrollToVisionQA();
        } else {
            // Fallback: scroll to BookendVisionQAPanel by finding it in the DOM
            const visionQAPanel = document.querySelector('[data-testid="vision-qa-panel"]');
            if (visionQAPanel) {
                visionQAPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [onScrollToVisionQA]);

    if (!settings) {
        return null;
    }

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg ring-1 ring-gray-700/80">
            {/* Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between text-left"
            >
                <h4 className="text-md font-semibold text-gray-200 flex items-center gap-2">
                    <span>🎬</span>
                    ★ Production Video Preview
                </h4>
                <span className="text-gray-400 text-sm">
                    {isCollapsed ? '▸ Expand' : '▾ Collapse'}
                </span>
            </button>

            {!isCollapsed && (
                <div className="mt-4 space-y-4">
                    {/* Pipeline Selector */}
                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                        <p className="text-sm text-gray-300 mb-3">
                            <strong className="text-amber-400">Select Pipeline to Preview:</strong>
                        </p>
                        
                        {/* Pipeline Options */}
                        <div className="space-y-2">
                            {PIPELINE_PRESETS.map((pipeline) => (
                                <label
                                    key={pipeline.id}
                                    className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                        selectedPipelineId === pipeline.id
                                            ? 'bg-amber-900/30 border border-amber-600/50'
                                            : 'hover:bg-gray-700/30 border border-transparent'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="pipeline-preset"
                                        value={pipeline.id}
                                        checked={selectedPipelineId === pipeline.id}
                                        onChange={() => setSelectedPipelineId(pipeline.id)}
                                        className="mt-1 accent-amber-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-sm font-medium ${
                                                pipeline.isDefault ? 'text-amber-400' : 'text-gray-200'
                                            }`}>
                                                {pipeline.label}
                                            </span>
                                            {/* VRAM indicator */}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                pipeline.vramLevel === 'low' 
                                                    ? 'bg-green-900/50 text-green-400'
                                                    : pipeline.vramLevel === 'medium'
                                                        ? 'bg-amber-900/50 text-amber-400'
                                                        : 'bg-red-900/50 text-red-400'
                                            }`}>
                                                {pipeline.vramHint}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            {pipeline.description}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Selected pipeline details */}
                        <div className="mt-3 pt-3 border-t border-gray-700">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="text-gray-400">Workflow:</div>
                                <div className="text-gray-200 font-mono">{selectedPipeline.workflowProfile}</div>
                                <div className="text-gray-400">Stability Profile:</div>
                                <div className="text-gray-200 font-mono capitalize">{selectedPipeline.stabilityProfile}</div>
                            </div>
                        </div>
                        
                        {/* Camera Motion Template Selector (H2) */}
                        {(selectedPipeline.id === 'cinematic' || selectedPipeline.id === 'production') && cameraTemplates.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-gray-400">📷 Camera Motion:</span>
                                    <select
                                        value={selectedCameraTemplateId}
                                        onChange={(e) => setSelectedCameraTemplateId(e.target.value)}
                                        className="flex-1 px-2 py-1 text-xs bg-gray-700/50 border border-gray-600 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                    >
                                        <option value="">From pipeline config (default)</option>
                                        {cameraTemplates.map((template) => (
                                            <option key={template.id} value={template.id}>
                                                {template.name} ({template.motionType || 'custom'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {selectedCameraTemplateId && cameraTemplates.find(t => t.id === selectedCameraTemplateId) && (
                                    <p className="text-[10px] text-gray-500 ml-16">
                                        {cameraTemplates.find(t => t.id === selectedCameraTemplateId)?.description}
                                    </p>
                                )}
                            </div>
                        )}
                        
                        {/* Live VRAM Status */}
                        {availableVRAM && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400">GPU VRAM:</span>
                                    <span className={`font-mono ${
                                        availableVRAM.freeMB > 12000 ? 'text-green-400' :
                                        availableVRAM.freeMB > 8000 ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                        {(availableVRAM.freeMB / 1024).toFixed(1)}GB free / {(availableVRAM.totalMB / 1024).toFixed(1)}GB total
                                    </span>
                                </div>
                                {recommendedPreset && recommendedPreset !== selectedPipeline.stabilityProfile && (
                                    <p className="text-[10px] text-amber-400 mt-1">
                                        ⚠ Based on VRAM, recommended preset is: <strong className="capitalize">{recommendedPreset}</strong>
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* QA Baseline Info - only shows for Production default */}
                    {selectedPipeline.isDefault && (
                        <div className="bg-cyan-900/20 p-3 rounded-lg border border-cyan-800/50">
                            <p className="text-sm text-cyan-300 mb-1">
                                📊 Vision QA Baseline (Production pipeline only):
                            </p>
                            <p className="text-xs text-gray-300">
                                <span className="text-green-400 font-semibold">7 PASS</span>
                                {' / '}
                                <span className="text-amber-400 font-semibold">1 WARN</span>
                                {' / '}
                                <span className="text-gray-500">0 FAIL</span>
                                <span className="text-gray-500 ml-2">(threshold v3.2.1)</span>
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                8 golden samples: geometric, character, environment, motion, complex, multichar, occlusion, lighting
                            </p>
                            <button
                                onClick={handleViewVisionQA}
                                className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
                            >
                                View full Vision QA results →
                            </button>
                        </div>
                    )}

                    {/* Non-production pipeline note */}
                    {!selectedPipeline.isDefault && (
                        <div className="bg-gray-800/30 p-3 rounded-lg border border-gray-700/50">
                            <p className="text-xs text-gray-400">
                                ℹ Vision QA baselines are only tracked for the Production default pipeline.
                                Preview other pipelines to compare quality before switching your settings.
                            </p>
                        </div>
                    )}

                    {/* Preview Action */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleRunPreview}
                                disabled={status === 'loading-keyframes' || status === 'checking' || status === 'generating'}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                    status === 'loading-keyframes' || status === 'checking' || status === 'generating'
                                        ? 'bg-gray-700 text-gray-400 cursor-wait'
                                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                                }`}
                            >
                                {(status === 'loading-keyframes' || status === 'checking' || status === 'generating') ? (
                                    <>
                                        <span className="animate-spin">⟳</span>
                                        {status === 'loading-keyframes' && 'Loading...'}
                                        {status === 'checking' && 'Checking...'}
                                        {status === 'generating' && 'Generating...'}
                                    </>
                                ) : (
                                    <>
                                        <span>▶</span>
                                        Generate Preview Clip ({selectedPipeline.shortLabel})
                                    </>
                                )}
                            </button>
                            
                            <span className="text-xs text-gray-500 flex-1">
                                {status === 'idle' && `Generates a ~3s clip using ${selectedPipeline.shortLabel} pipeline`}
                                {status === 'loading-keyframes' && statusMessage}
                                {status === 'checking' && statusMessage}
                                {status === 'generating' && statusMessage}
                                {status === 'completed' && (
                                    <span className="text-green-400">{statusMessage}</span>
                                )}
                                {status === 'error' && (
                                    <span className="text-red-400">{errorMessage}</span>
                                )}
                            </span>
                        </div>

                        {/* VRAM hint - dynamic based on selected pipeline */}
                        <p className={`text-[10px] ${
                            selectedPipeline.vramLevel === 'high' 
                                ? 'text-red-400/80' 
                                : selectedPipeline.vramLevel === 'medium'
                                    ? 'text-amber-500/70'
                                    : 'text-green-400/70'
                        }`}>
                            ⚠ {selectedPipeline.vramHint}. 
                            {selectedPipeline.vramLevel === 'high' && ' Consider using Production default if you experience memory issues.'}
                            {selectedPipeline.vramLevel === 'low' && ' Fast profile is ideal for limited VRAM.'}
                        </p>
                        
                        {/* Preset downgrade warning */}
                        {presetDowngradeWarning && (
                            <div className="bg-amber-900/30 text-amber-300 text-xs p-2 rounded-lg border border-amber-600/50">
                                ⚠️ {presetDowngradeWarning}
                            </div>
                        )}
                    </div>

                    {/* Preview Video Player */}
                    {previewVideoUrl && (
                        <div className="bg-gray-800/50 p-3 rounded-lg border border-green-700/50">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-green-400">✓ Preview Generated Successfully</p>
                                {generationTime && (
                                    <p className="text-xs text-gray-500">{generationTime.toFixed(1)}s</p>
                                )}
                            </div>
                            <video 
                                ref={videoRef}
                                src={previewVideoUrl}
                                controls
                                autoPlay
                                loop
                                muted
                                className="w-full max-w-md rounded-lg bg-black"
                            />
                            <p className="text-[10px] text-gray-500 mt-2">
                                Spinning top preview scene (sample-001-geometric)
                            </p>
                        </div>
                    )}

                    {/* Error state with help */}
                    {status === 'error' && (
                        <div className="bg-red-900/20 p-3 rounded-lg border border-red-700/50">
                            <p className="text-xs text-red-400 mb-2">
                                ✗ {errorMessage}
                            </p>
                            <p className="text-[10px] text-gray-400">
                                Troubleshooting:
                            </p>
                            <ul className="text-[10px] text-gray-500 list-disc list-inside mt-1">
                                <li>Ensure ComfyUI is running (VS Code task: "Start ComfyUI Server")</li>
                                <li>Verify workflow profiles are imported in Settings → ComfyUI Settings</li>
                                <li>Check GPU has ≥8GB VRAM available</li>
                                <li>Try Fast profile if experiencing memory issues</li>
                            </ul>
                        </div>
                    )}

                    {/* Footer info */}
                    <div className="text-xs text-gray-500 pt-2 border-t border-gray-700 flex justify-between items-center">
                        <p>
                            Uses the same configuration as Vision QA regression baselines.
                        </p>
                        <span className="text-[10px] text-gray-600">
                            ⓘ Preview only – does not modify project data
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductionQualityPreviewPanel;
