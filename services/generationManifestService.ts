/**
 * Generation Manifest Service
 * 
 * Captures versioning metadata for reproducible video generation.
 * Each generation run emits a manifest containing:
 * - Git commit hash (for codebase versioning)
 * - Workflow profile details and version
 * - Stability profile / feature flags snapshot
 * - Seeds and deterministic parameters
 * - Input/output asset paths
 * - Timestamps and duration
 * - Camera path metadata (E1 - Camera-as-Code)
 * 
 * @module services/generationManifestService
 */

import type { LocalGenerationSettings, WorkflowProfile } from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import type { CameraPath, CameraPathSummary } from '../types/cameraPath';
import { createCameraPathSummary } from '../types/cameraPath';

// ============================================================================
// Manifest Schema Types
// ============================================================================

/**
 * Semantic version structure for workflow/asset versioning
 */
export interface SemanticVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
    raw: string;
}

/**
 * Git repository state at generation time
 */
export interface GitState {
    /** Short commit hash (7 chars) */
    commitHash: string;
    /** Full commit hash (40 chars) */
    commitHashFull?: string;
    /** Branch name */
    branch?: string;
    /** Whether there are uncommitted changes */
    dirty?: boolean;
    /** Commit timestamp ISO string */
    commitDate?: string;
}

/**
 * Workflow versioning metadata
 */
export interface WorkflowVersionInfo {
    /** Workflow profile ID (e.g., 'wan-flf2v') */
    profileId: string;
    /** Workflow label for display */
    label: string;
    /** Workflow JSON source path */
    sourcePath?: string;
    /** Embedded version from workflow JSON _meta */
    version?: string;
    /** Revision number from workflow JSON */
    revision?: number;
    /** Last sync timestamp */
    syncedAt?: number;
    /** Category (keyframe, video, upscaler, etc.) */
    category?: string;
}

/**
 * Model/asset versioning metadata
 */
export interface ModelVersionInfo {
    /** Model identifier */
    modelId: string;
    /** Model filename (safetensors, ckpt, etc.) */
    filename?: string;
    /** Model version if known */
    version?: string;
    /** Model category (unet, clip, vae, etc.) */
    category?: 'unet' | 'clip' | 'vae' | 'controlnet' | 'lora' | 'other';
}

/**
 * Seed and determinism parameters
 */
export interface DeterminismParams {
    /** Random seed used for generation */
    seed: number;
    /** Whether seed was explicitly set or random */
    seedExplicit: boolean;
    /** CFG scale / guidance */
    cfgScale?: number;
    /** Sampler name */
    sampler?: string;
    /** Scheduler name */
    scheduler?: string;
    /** Number of inference steps */
    steps?: number;
    /** Denoise strength */
    denoise?: number;
}

/**
 * Input assets for the generation
 */
export interface GenerationInputs {
    /** Prompt text used */
    prompt?: string;
    /** Negative prompt */
    negativePrompt?: string;
    /** Start keyframe image path or base64 hash */
    startKeyframePath?: string;
    /** End keyframe image path or base64 hash */
    endKeyframePath?: string;
    /** Additional input references */
    additionalInputs?: Record<string, string>;
}

/**
 * Output assets from the generation
 */
export interface GenerationOutputs {
    /** Primary output video path */
    videoPath?: string;
    /** Output video filename */
    videoFilename?: string;
    /** Output frame count */
    frameCount?: number;
    /** Output resolution */
    resolution?: { width: number; height: number };
    /** Output duration in seconds */
    durationSeconds?: number;
    /** Output FPS */
    fps?: number;
    /** Additional outputs (intermediates, previews, etc.) */
    additionalOutputs?: Record<string, string>;
}

/**
 * Timing metadata
 */
export interface GenerationTiming {
    /** When generation was queued (ISO string) */
    queuedAt: string;
    /** When generation started processing */
    startedAt?: string;
    /** When generation completed */
    completedAt?: string;
    /** Total duration in milliseconds */
    durationMs?: number;
    /** Queue wait time in milliseconds */
    queueWaitMs?: number;
}

/**
 * Complete generation manifest for reproducibility
 */
export interface GenerationManifest {
    /** Manifest schema version */
    manifestVersion: '1.0.0';
    
    /** Unique manifest identifier */
    manifestId: string;
    
    /** Generation type */
    generationType: 'keyframe' | 'video' | 'upscale' | 'batch';
    
    /** Scene identifier */
    sceneId?: string;
    
    /** Shot identifier */
    shotId?: string;
    
    // --- Versioning ---
    
    /** Git repository state */
    git?: GitState;
    
    /** Workflow version info */
    workflow: WorkflowVersionInfo;
    
    /** Models used in generation */
    models?: ModelVersionInfo[];
    
    // --- Configuration ---
    
    /** Feature flags snapshot at generation time */
    featureFlags?: Partial<FeatureFlags>;
    
    /** Stability profile ID if using preset */
    stabilityProfile?: 'safe-defaults' | 'production-qa' | 'custom';
    
    /** Determinism parameters */
    determinism: DeterminismParams;
    
    /** ComfyUI server URL */
    comfyUIUrl: string;
    
    /** Video provider used */
    videoProvider?: 'comfyui-local' | 'fastvideo-local';
    
    // --- Inputs/Outputs ---
    
    /** Input assets */
    inputs: GenerationInputs;
    
    /** Output assets */
    outputs: GenerationOutputs;
    
    // --- Timing ---
    
    /** Timing metadata */
    timing: GenerationTiming;
    
    /** ComfyUI prompt ID */
    promptId?: string;
    
    // --- Telemetry ---
    
    /** Quality scores if available */
    qualityScores?: {
        visionQA?: number;
        coherence?: number;
        motionQuality?: number;
    };
    
    /** Any warnings or notes */
    warnings?: string[];
    
    /** Additional metadata */
    extra?: Record<string, unknown>;

    // --- Camera Path (E1 - Camera-as-Code) ---

    /** Camera path ID if defined in pipeline config */
    cameraPathId?: string;

    /** Summary of the camera path for reference/QA */
    cameraPathSummary?: CameraPathSummary;

    // --- Post-Processing (E2 - Temporal Regularization) ---

    /**
     * Whether temporal regularization (ffmpeg smoothing) was applied.
     * When true, the output video is the smoothed version.
     * @stability experimental
     */
    temporalRegularizationApplied?: boolean;

    /**
     * Temporal regularization settings used, if applied.
     */
    temporalRegularizationSettings?: {
        /** Smoothing strength (0.0-1.0) */
        strength: number;
        /** Temporal window size in frames */
        windowFrames: number;
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique manifest ID
 */
export function generateManifestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `gm_${timestamp}_${random}`;
}

/**
 * Parse semantic version string
 */
export function parseVersion(versionString: string): SemanticVersion | null {
    const match = versionString.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match || !match[1] || !match[2] || !match[3]) return null;
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4],
        raw: versionString,
    };
}

/**
 * Extract version info from workflow profile
 */
export function extractWorkflowVersionInfo(profile: WorkflowProfile): WorkflowVersionInfo {
    let version: string | undefined;
    let revision: number | undefined;
    
    // Try to parse workflow JSON for embedded version
    if (profile.workflowJson) {
        try {
            const workflow = JSON.parse(profile.workflowJson);
            version = workflow._meta?.version;
            revision = workflow.revision;
        } catch {
            // Ignore parse errors
        }
    }
    
    return {
        profileId: profile.id,
        label: profile.label,
        sourcePath: profile.sourcePath,
        version,
        revision,
        syncedAt: profile.syncedAt,
        category: profile.category,
    };
}

/**
 * Extract model info from workflow JSON
 */
export function extractModelVersions(workflowJson: string | undefined): ModelVersionInfo[] {
    const models: ModelVersionInfo[] = [];
    
    if (!workflowJson) return models;
    
    try {
        const workflow = JSON.parse(workflowJson);
        const nodes = workflow.nodes || {};
        
        for (const [nodeId, node] of Object.entries(nodes)) {
            const nodeObj = node as Record<string, unknown>;
            const classType = nodeObj.class_type as string;
            const inputs = nodeObj.inputs as Record<string, unknown> | undefined;
            
            if (!inputs) continue;
            
            // Extract model references from common loader nodes
            if (classType === 'UNETLoader' && inputs.unet_name) {
                models.push({
                    modelId: `unet_${nodeId}`,
                    filename: inputs.unet_name as string,
                    category: 'unet',
                });
            } else if (classType === 'CLIPLoader' && inputs.clip_name) {
                models.push({
                    modelId: `clip_${nodeId}`,
                    filename: inputs.clip_name as string,
                    category: 'clip',
                });
            } else if (classType === 'VAELoader' && inputs.vae_name) {
                models.push({
                    modelId: `vae_${nodeId}`,
                    filename: inputs.vae_name as string,
                    category: 'vae',
                });
            } else if (classType === 'ControlNetLoader' && inputs.control_net_name) {
                models.push({
                    modelId: `controlnet_${nodeId}`,
                    filename: inputs.control_net_name as string,
                    category: 'controlnet',
                });
            } else if (classType === 'LoraLoader' && inputs.lora_name) {
                models.push({
                    modelId: `lora_${nodeId}`,
                    filename: inputs.lora_name as string,
                    category: 'lora',
                });
            }
        }
    } catch {
        // Ignore parse errors
    }
    
    return models;
}

/**
 * Create a hash of base64 image data for reference (first 16 chars of sha-like)
 */
export function hashImageReference(base64Data: string): string {
    // Simple hash for reference - not cryptographic
    let hash = 0;
    const sample = base64Data.slice(0, 1000); // Sample first 1000 chars
    for (let i = 0; i < sample.length; i++) {
        const char = sample.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return `img_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// ============================================================================
// Manifest Builder
// ============================================================================

/**
 * Options for building a generation manifest
 */
export interface BuildManifestOptions {
    /** Generation type */
    generationType: GenerationManifest['generationType'];
    
    /** Scene identifier */
    sceneId?: string;
    
    /** Shot identifier */
    shotId?: string;
    
    /** Local generation settings */
    settings: LocalGenerationSettings;
    
    /** Workflow profile used */
    workflowProfile: WorkflowProfile;
    
    /** Prompt text */
    prompt?: string;
    
    /** Negative prompt */
    negativePrompt?: string;
    
    /** Start keyframe (base64 or path) */
    startKeyframe?: string;
    
    /** End keyframe (base64 or path) */
    endKeyframe?: string;
    
    /** Seed used */
    seed?: number;
    
    /** Whether seed was explicitly set */
    seedExplicit?: boolean;
    
    /** ComfyUI prompt ID */
    promptId?: string;
    
    /** Git state (optional, populated by caller or fetched) */
    gitState?: GitState;
    
    /** Any warnings to include */
    warnings?: string[];
    
    /** Extra metadata */
    extra?: Record<string, unknown>;

    /** Camera path from pipeline config (E1 - Camera-as-Code) */
    cameraPath?: CameraPath;
}

/**
 * Build a generation manifest from settings and context
 */
export function buildManifest(options: BuildManifestOptions): GenerationManifest {
    const {
        generationType,
        sceneId,
        shotId,
        settings,
        workflowProfile,
        prompt,
        negativePrompt,
        startKeyframe,
        endKeyframe,
        seed = Math.floor(Math.random() * 2147483647),
        seedExplicit = false,
        promptId,
        gitState,
        warnings,
        extra,
        cameraPath,
    } = options;
    
    const now = new Date().toISOString();
    
    // Determine stability profile
    let stabilityProfile: GenerationManifest['stabilityProfile'] = 'custom';
    if (settings.featureFlags) {
        // Check if using safe defaults or production QA based on flag patterns
        // This is a heuristic - actual detection would require checkSafeDefaults/checkProductionQA
        const flags = settings.featureFlags;
        const isVRAMConservative = flags.videoUpscaling === false && 
            flags.characterConsistency === false &&
            flags.enhanceAVideoEnabled === false;
        const hasQAEnabled = flags.keyframePairAnalysis === true && 
            flags.bookendQAMode === true &&
            flags.videoQualityGateEnabled === true;
        
        if (isVRAMConservative && !hasQAEnabled) {
            stabilityProfile = 'safe-defaults';
        } else if (isVRAMConservative && hasQAEnabled) {
            stabilityProfile = 'production-qa';
        }
    }

    // Build camera path summary if camera path provided (E1 - Camera-as-Code)
    const cameraPathId = cameraPath?.id;
    const cameraPathSummary = cameraPath ? createCameraPathSummary(cameraPath) : undefined;
    
    const manifest: GenerationManifest = {
        manifestVersion: '1.0.0',
        manifestId: generateManifestId(),
        generationType,
        sceneId,
        shotId,
        
        git: gitState,
        
        workflow: extractWorkflowVersionInfo(workflowProfile),
        models: extractModelVersions(workflowProfile.workflowJson),
        
        featureFlags: settings.featureFlags ? { ...settings.featureFlags } : undefined,
        stabilityProfile,
        
        determinism: {
            seed,
            seedExplicit,
        },
        
        comfyUIUrl: settings.comfyUIUrl,
        videoProvider: settings.videoProvider,
        
        inputs: {
            prompt,
            negativePrompt,
            startKeyframePath: startKeyframe ? hashImageReference(startKeyframe) : undefined,
            endKeyframePath: endKeyframe ? hashImageReference(endKeyframe) : undefined,
        },
        
        outputs: {},
        
        timing: {
            queuedAt: now,
        },
        
        promptId,
        warnings,
        extra,

        // Camera path metadata (E1 - Camera-as-Code)
        cameraPathId,
        cameraPathSummary,
    };
    
    return manifest;
}

/**
 * Update manifest with completion data
 */
export function completeManifest(
    manifest: GenerationManifest,
    outputs: Partial<GenerationOutputs>,
    qualityScores?: GenerationManifest['qualityScores']
): GenerationManifest {
    const completedAt = new Date().toISOString();
    const startedAt = manifest.timing.startedAt || manifest.timing.queuedAt;
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    
    return {
        ...manifest,
        outputs: {
            ...manifest.outputs,
            ...outputs,
        },
        timing: {
            ...manifest.timing,
            completedAt,
            durationMs,
        },
        qualityScores,
    };
}

/**
 * Mark manifest as started (when ComfyUI begins processing)
 */
export function markManifestStarted(manifest: GenerationManifest): GenerationManifest {
    const startedAt = new Date().toISOString();
    const queueWaitMs = new Date(startedAt).getTime() - new Date(manifest.timing.queuedAt).getTime();
    
    return {
        ...manifest,
        timing: {
            ...manifest.timing,
            startedAt,
            queueWaitMs,
        },
    };
}

// ============================================================================
// Manifest I/O
// ============================================================================

/**
 * Serialize manifest to JSON string
 */
export function serializeManifest(manifest: GenerationManifest): string {
    return JSON.stringify(manifest, null, 2);
}

/**
 * Parse manifest from JSON string
 */
export function parseManifest(json: string): GenerationManifest | null {
    try {
        const parsed = JSON.parse(json);
        if (parsed.manifestVersion === '1.0.0' && parsed.manifestId) {
            return parsed as GenerationManifest;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Write manifest to a log file (browser-compatible - returns content)
 * In Node.js context, caller can use fs.writeFileSync
 */
export function formatManifestForLog(manifest: GenerationManifest): string {
    const header = `# Generation Manifest: ${manifest.manifestId}
# Generated: ${manifest.timing.queuedAt}
# Type: ${manifest.generationType}
`;
    return header + '\n' + serializeManifest(manifest);
}

/**
 * Generate manifest filename based on content
 */
export function getManifestFilename(manifest: GenerationManifest): string {
    const date = new Date(manifest.timing.queuedAt);
    const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const type = manifest.generationType;
    const scene = manifest.sceneId ? `_${manifest.sceneId}` : '';
    const shot = manifest.shotId ? `_${manifest.shotId}` : '';
    return `manifest_${type}${scene}${shot}_${dateStr}.json`;
}

// ============================================================================
// Exports
// ============================================================================

export default {
    generateManifestId,
    parseVersion,
    extractWorkflowVersionInfo,
    extractModelVersions,
    hashImageReference,
    buildManifest,
    completeManifest,
    markManifestStarted,
    serializeManifest,
    parseManifest,
    formatManifestForLog,
    getManifestFilename,
};
