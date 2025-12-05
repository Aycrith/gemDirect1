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
 * 
 * Note: This is a diagnostic/preview tool that does not modify user project data.
 */

import React, { useState, useCallback, useRef } from 'react';
import type { LocalGenerationSettings, Scene, TimelineData, Shot } from '../types';
import { applyStabilityProfile, type StabilityProfileId } from '../utils/stabilityProfiles';
import { mergeFeatureFlags } from '../utils/featureFlags';
import { generateVideoFromBookendsNative } from '../services/comfyUIService';

interface ProductionQualityPreviewPanelProps {
    settings: LocalGenerationSettings | null;
    defaultCollapsed?: boolean;
    onScrollToVisionQA?: () => void;
}

type PreviewStatus = 'idle' | 'loading-keyframes' | 'checking' | 'generating' | 'completed' | 'error';

/**
 * Pipeline preset configuration for the preview panel
 */
interface PipelinePreset {
    id: string;
    label: string;
    shortLabel: string;
    workflowProfile: string;
    stabilityProfile: StabilityProfileId;
    vramHint: string;
    vramLevel: 'low' | 'medium' | 'high';
    isDefault: boolean;
    description: string;
}

/**
 * Available pipeline presets for preview generation
 */
const PIPELINE_PRESETS: PipelinePreset[] = [
    {
        id: 'production',
        label: '★ Production default (balanced)',
        shortLabel: 'Production',
        workflowProfile: 'wan-fun-inpaint',
        stabilityProfile: 'standard',
        vramHint: 'Requires ~8GB VRAM (recommended)',
        vramLevel: 'medium',
        isDefault: true,
        description: 'Deflicker ON, IP-Adapter OFF. Best balance of quality and speed.',
    },
    {
        id: 'cinematic',
        label: 'Cinematic (FETA, higher VRAM)',
        shortLabel: 'Cinematic',
        workflowProfile: 'wan-flf2v-feta',
        stabilityProfile: 'cinematic',
        vramHint: 'May require >10GB VRAM',
        vramLevel: 'high',
        isDefault: false,
        description: 'Full temporal stack: deflicker, IP-Adapter, prompt scheduling.',
    },
    {
        id: 'character',
        label: 'Character-stable (IP-Adapter, higher VRAM)',
        shortLabel: 'Character',
        workflowProfile: 'wan-ipadapter',
        stabilityProfile: 'cinematic',
        vramHint: 'May require >10GB VRAM',
        vramLevel: 'high',
        isDefault: false,
        description: 'IP-Adapter for identity consistency. Requires IP-Adapter models installed.',
    },
    {
        id: 'fast',
        label: 'Fast (no deflicker, low VRAM)',
        shortLabel: 'Fast',
        workflowProfile: 'wan-flf2v',
        stabilityProfile: 'fast',
        vramHint: 'Best for 6–8GB VRAM',
        vramLevel: 'low',
        isDefault: false,
        description: 'No temporal processing. Fastest generation, lowest VRAM.',
    },
];

// Preview sample paths (loaded from public/artifacts/preview-sample/)
const PREVIEW_KEYFRAME_START = '/artifacts/preview-sample/start.png';
const PREVIEW_KEYFRAME_END = '/artifacts/preview-sample/end.png';

// Helper to load an image and convert to base64
async function loadImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load image: ${url}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

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
    const videoRef = useRef<HTMLVideoElement>(null);

    // Get the currently selected pipeline preset - always falls back to production default
    const selectedPipeline: PipelinePreset = PIPELINE_PRESETS.find(p => p.id === selectedPipelineId) ?? PRODUCTION_DEFAULT_PRESET;
    
    // Check if ComfyUI is available
    const checkComfyUIStatus = useCallback(async (): Promise<boolean> => {
        if (!settings?.comfyUIUrl) return false;
        try {
            const response = await fetch(`${settings.comfyUIUrl}/system_stats`, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch {
            return false;
        }
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

            // Step 3: Check workflow profile exists for selected pipeline
            const workflowProfile = settings.workflowProfiles?.[pipeline.workflowProfile];
            if (!workflowProfile) {
                setErrorMessage(
                    `Workflow profile "${pipeline.workflowProfile}" not found. ` +
                    'Import workflow profiles from Settings → ComfyUI Settings → Import from File.'
                );
                setStatus('error');
                return;
            }

            // Step 4: Generate with selected pipeline configuration
            setStatus('generating');
            setStatusMessage(`Generating preview video with ${pipeline.shortLabel} pipeline...`);

            // Create settings with selected pipeline configuration enforced
            // mergeFeatureFlags returns complete FeatureFlags, applyStabilityProfile updates temporal settings
            const baseFlags = mergeFeatureFlags(settings.featureFlags);
            const pipelineFlags = {
                ...baseFlags,
                ...applyStabilityProfile(baseFlags, pipeline.stabilityProfile),
            };
            
            const pipelineSettings: LocalGenerationSettings = {
                ...settings,
                videoWorkflowProfile: pipeline.workflowProfile,
                sceneBookendWorkflowProfile: pipeline.workflowProfile,
                featureFlags: pipelineFlags,
            };

            // Create the preview scene and bookends
            const previewScene = createPreviewScene();
            const bookends = { start: startKeyframe, end: endKeyframe };
            const directorsVision = 'Professional product photography style, soft natural lighting, shallow depth of field';

            // No-op logger and state handler for preview
            const noopLogger = () => {};
            const stateHandler = (state: { progress?: number; message?: string }) => {
                if (state.progress !== undefined) {
                    setStatusMessage(`Generating: ${state.progress}%`);
                }
            };

            // Generate video using selected pipeline
            const videoDataUrl = await generateVideoFromBookendsNative(
                pipelineSettings,
                previewScene,
                previewScene.timeline,
                bookends,
                directorsVision,
                noopLogger,
                stateHandler,
                pipeline.workflowProfile
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
