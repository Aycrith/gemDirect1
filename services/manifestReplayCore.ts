/**
 * Manifest Replay Core Logic
 * 
 * Pure functional core for manifest replay.
 * Contains types and logic for resolving settings from a manifest
 * without any filesystem or environment dependencies.
 * 
 * Shared by:
 * - manifestReplayService.ts (Node.js/CLI)
 * - browserReplayService.ts (Browser/UI)
 */

import type { GenerationManifest, WorkflowVersionInfo } from './generationManifestService';
import type { LocalGenerationSettings, WorkflowProfile } from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import { DEFAULT_FEATURE_FLAGS, mergeFeatureFlags } from '../utils/featureFlags';
import type { StabilityProfileId } from '../utils/stabilityProfiles';

// ============================================================================
// Types
// ============================================================================

export interface ReplayPlan {
    /** The original manifest */
    manifest: GenerationManifest;
    /** The resolved workflow profile to use */
    workflowProfile: WorkflowProfile;
    /** The resolved feature flags */
    featureFlags: FeatureFlags;
    /** The resolved stability profile ID */
    stabilityProfileId: StabilityProfileId;
    
    /** Camera path ID if present */
    cameraPathId?: string;
    /** Whether temporal regularization was applied */
    temporalRegularizationApplied: boolean;
    /** Seed to use (from manifest) */
    seed?: number;
    /** Prompt text */
    prompt?: string;
    /** Negative prompt text */
    negativePrompt?: string;
    
    /** Warnings generated during plan creation */
    warnings: string[];
}

export interface WorkflowProfileResolutionOptions {
    /** Explicitly override the profile ID */
    overrideProfileId?: string;
    /** Available profiles to resolve against */
    availableProfiles?: Record<string, WorkflowProfile>;
}

// ============================================================================
// Pure Logic Functions
// ============================================================================

/**
 * Resolve the workflow profile to use for replay.
 */
export function resolveWorkflowProfile(
    manifestWorkflow: WorkflowVersionInfo,
    options?: WorkflowProfileResolutionOptions
): { profile: WorkflowProfile; warning?: string } {
    const profileId = options?.overrideProfileId || manifestWorkflow.profileId;
    
    // In a pure context, we rely on options.availableProfiles.
    // If not provided, we construct a minimal profile from the manifest data.
    // This is a fallback for when we don't have the full environment context.
    
    let profile: WorkflowProfile | undefined;
    
    if (options?.availableProfiles) {
        profile = options.availableProfiles[profileId];
    }
    
    if (!profile) {
        // Fallback: Construct from manifest
        // The manifest stores the snapshot of the workflow JSON!
        // Wait, does it? Let's check GenerationManifest type.
        // It has 'workflowJson' (string) in WorkflowVersionInfo.
        
        const manifestWorkflowAny = manifestWorkflow as any;
        if (!manifestWorkflowAny.workflowJson) {
            throw new Error(`Workflow profile '${profileId}' not found and manifest lacks workflow snapshot.`);
        }
        
        profile = {
            id: profileId,
            label: manifestWorkflow.label || profileId,
            description: 'Restored from manifest',
            workflowJson: manifestWorkflowAny.workflowJson,
            mapping: manifestWorkflowAny.mapping || {}, // Mapping might be missing in older manifests
            // Defaults for other fields
            category: 'video',
        };
        
        return { 
            profile, 
            warning: options?.availableProfiles 
                ? `Profile '${profileId}' not found in environment. Using snapshot from manifest.` 
                : undefined 
        };
    }
    
    return { profile: profile! };
}

/**
 * Resolve feature flags for replay.
 */
export function resolveFeatureFlags(
    manifestFlags?: Partial<FeatureFlags>
): { flags: FeatureFlags; warnings: string[] } {
    const warnings: string[] = [];
    
    if (!manifestFlags) {
        return { flags: { ...DEFAULT_FEATURE_FLAGS }, warnings };
    }
    
    // Merge manifest flags on top of defaults
    const flags = mergeFeatureFlags(manifestFlags);
    
    return { flags, warnings };
}

/**
 * Resolve stability profile ID.
 */
export function resolveStabilityProfileId(
    manifestProfileId?: string
): StabilityProfileId {
    // Default to 'balanced' if missing or unknown
    // In a real implementation, we might validate against known IDs
    return (manifestProfileId as StabilityProfileId) || 'balanced';
}

/**
 * Build a ReplayPlan from a manifest and environment context.
 */
export function createReplayPlan(
    manifest: GenerationManifest,
    options?: WorkflowProfileResolutionOptions
): ReplayPlan {
    const warnings: string[] = [];
    
    // 1. Resolve workflow profile
    const { profile: workflowProfile, warning: workflowWarning } = resolveWorkflowProfile(
        manifest.workflow,
        options
    );
    if (workflowWarning) {
        warnings.push(workflowWarning);
    }
    
    // 2. Resolve feature flags
    const { flags: featureFlags, warnings: flagWarnings } = resolveFeatureFlags(
        manifest.featureFlags
    );
    warnings.push(...flagWarnings);
    
    // 3. Resolve stability profile
    const stabilityProfileId = resolveStabilityProfileId(manifest.stabilityProfile);
    
    return {
        manifest,
        workflowProfile,
        featureFlags,
        stabilityProfileId,
        cameraPathId: manifest.cameraPathId,
        temporalRegularizationApplied: !!manifest.temporalRegularizationApplied,
        seed: manifest.determinism.seed,
        prompt: manifest.inputs.prompt,
        negativePrompt: manifest.inputs.negativePrompt,
        warnings,
    };
}

/**
 * Build LocalGenerationSettings from a ReplayPlan.
 */
export function buildSettingsFromPlan(
    plan: ReplayPlan,
    baseSettings: Partial<LocalGenerationSettings>
): LocalGenerationSettings {
    const { manifest, workflowProfile, featureFlags } = plan;
    
    // Build settings object matching what comfyUIService expects
    // We merge with baseSettings to get environment-specifics (URL, etc.)
    
    const settings: LocalGenerationSettings = {
        // Defaults
        comfyUIUrl: 'http://127.0.0.1:8188',
        comfyUIClientId: `replay-${Date.now()}`,
        
        // Overrides from baseSettings
        ...baseSettings,
        
        // Enforced from Plan (override baseSettings if manifest specifies provider)
        videoProvider: manifest.videoProvider || baseSettings.videoProvider || 'comfyui-local',
        
        // Workflow (from resolved profile)
        workflowJson: workflowProfile.workflowJson,
        mapping: workflowProfile.mapping,
        
        // Profiles
        workflowProfiles: {
            ...(baseSettings.workflowProfiles || {}),
            [workflowProfile.id]: workflowProfile,
        },
        videoWorkflowProfile: workflowProfile.id,
        
        // Feature flags
        featureFlags,
    };
    
    return settings;
}
