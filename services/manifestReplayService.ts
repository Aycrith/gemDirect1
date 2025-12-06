/**
 * Manifest Replay Service (C1.2)
 * 
 * Provides the ability to regenerate videos from existing GenerationManifest JSON files.
 * This enables reproducibility, debugging, and targeted re-generation workflows.
 * 
 * Key capabilities:
 * - Load and parse manifest JSON files
 * - Reconstruct effective generation settings (workflow profile, feature flags, stability profile)
 * - Execute replay to regenerate video with same core parameters
 * - Dry-run mode for inspection without generation
 * 
 * Usage:
 * ```typescript
 * import { loadReplayPlan, executeReplay } from './manifestReplayService';
 * 
 * // Load and inspect
 * const plan = await loadReplayPlan('/path/to/manifest.json');
 * console.log(plan.workflowProfile.id, plan.stabilityProfileId);
 * 
 * // Execute replay
 * const result = await executeReplay(plan, { dryRun: false });
 * console.log(`Replayed video at: ${result.outputVideoPath}`);
 * ```
 * 
 * @module services/manifestReplayService
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GenerationManifest, WorkflowVersionInfo } from './generationManifestService';
import { parseManifest } from './generationManifestService';
import type { LocalGenerationSettings, WorkflowProfile } from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import { DEFAULT_FEATURE_FLAGS, mergeFeatureFlags } from '../utils/featureFlags';
import type { StabilityProfileId } from '../utils/stabilityProfiles';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for replay operations
 */
export interface ReplayConfig {
    /** Path to the manifest JSON file */
    manifestPath: string;
    /** Override output directory (if not provided, uses replay-<timestamp> adjacent to original) */
    outputDirOverride?: string;
    /** Whether to keep the original output path reference in the plan */
    keepOriginalOutput?: boolean;
    /** If true, do not execute generation, only return the plan */
    dryRun?: boolean;
}

/**
 * Resolved replay plan from a manifest
 */
export interface ReplayPlan {
    /** The original manifest */
    manifest: GenerationManifest;
    /** Resolved workflow profile for generation */
    workflowProfile: WorkflowProfile;
    /** Merged feature flags (manifest snapshot + defaults) */
    featureFlags: FeatureFlags;
    /** Stability profile ID (fast, standard, cinematic, custom) */
    stabilityProfileId: StabilityProfileId;
    /** Camera path ID if defined in manifest */
    cameraPathId?: string;
    /** Whether temporal regularization was applied in original generation */
    temporalRegularizationApplied?: boolean;
    /** Original seed from manifest */
    seed?: number;
    /** Original prompt from manifest */
    prompt?: string;
    /** Original negative prompt from manifest */
    negativePrompt?: string;
    /** Warnings encountered during plan resolution */
    warnings: string[];
}

/**
 * Result of replay execution
 */
export interface ReplayResult {
    /** Path to the regenerated video (empty if dry-run) */
    outputVideoPath: string;
    /** Whether this was a dry-run (no actual generation) */
    dryRun: boolean;
    /** Duration in ms if generation was executed */
    durationMs?: number;
    /** Any warnings from execution */
    warnings: string[];
}

/**
 * Error thrown when replay fails
 */
export class ReplayError extends Error {
    constructor(
        message: string,
        public readonly code: 'MANIFEST_NOT_FOUND' | 'MANIFEST_INVALID' | 'WORKFLOW_NOT_FOUND' | 'GENERATION_FAILED' | 'UNKNOWN',
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'ReplayError';
    }
}

// ============================================================================
// Manifest Loading
// ============================================================================

/**
 * Read and parse a manifest file from disk.
 * 
 * @param manifestPath Absolute or relative path to manifest JSON
 * @returns Parsed GenerationManifest
 * @throws ReplayError if file not found or invalid
 */
export function readManifestFile(manifestPath: string): GenerationManifest {
    const resolvedPath = path.resolve(manifestPath);
    
    if (!fs.existsSync(resolvedPath)) {
        throw new ReplayError(
            `Manifest file not found: ${resolvedPath}`,
            'MANIFEST_NOT_FOUND',
            { path: resolvedPath }
        );
    }
    
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const manifest = parseManifest(content);
    
    if (!manifest) {
        throw new ReplayError(
            `Invalid manifest format: ${resolvedPath}`,
            'MANIFEST_INVALID',
            { path: resolvedPath }
        );
    }
    
    return manifest;
}

// ============================================================================
// Workflow Profile Resolution
// ============================================================================

/**
 * Options for resolving a workflow profile
 */
export interface WorkflowProfileResolutionOptions {
    /** Workflow profiles from current settings (if available) */
    workflowProfiles?: Record<string, WorkflowProfile>;
    /** Project root for loading workflow JSON from disk */
    projectRoot?: string;
}

/**
 * Resolve a workflow profile from manifest workflow info.
 * 
 * Attempts resolution in order:
 * 1. From provided workflowProfiles map (settings)
 * 2. From disk at sourcePath (if present in manifest)
 * 3. Creates a minimal stub profile if all else fails
 * 
 * @param workflowInfo Workflow version info from manifest
 * @param options Resolution options
 * @returns Resolved WorkflowProfile or throws if not found
 */
export function resolveWorkflowProfile(
    workflowInfo: WorkflowVersionInfo,
    options?: WorkflowProfileResolutionOptions
): { profile: WorkflowProfile; warning?: string } {
    const { profileId } = workflowInfo;
    
    // 1. Try from provided profiles map
    if (options?.workflowProfiles?.[profileId]) {
        return { profile: options.workflowProfiles[profileId] };
    }
    
    // 2. Try loading from sourcePath on disk
    if (workflowInfo.sourcePath) {
        const sourcePath = options?.projectRoot
            ? path.resolve(options.projectRoot, workflowInfo.sourcePath)
            : path.resolve(workflowInfo.sourcePath);
        
        if (fs.existsSync(sourcePath)) {
            try {
                const workflowJson = fs.readFileSync(sourcePath, 'utf-8');
                // Validate it's valid JSON
                JSON.parse(workflowJson);
                
                const profile: WorkflowProfile = {
                    id: profileId,
                    label: workflowInfo.label,
                    workflowJson,
                    mapping: {}, // Mapping not stored in workflow JSON; caller may need to supply
                    sourcePath: workflowInfo.sourcePath,
                    syncedAt: workflowInfo.syncedAt,
                    category: workflowInfo.category as WorkflowProfile['category'],
                };
                
                return {
                    profile,
                    warning: `Loaded workflow from disk. Mapping may need manual configuration.`,
                };
            } catch (err) {
                // Fall through to stub
            }
        }
    }
    
    // 3. Fail with clear error - we cannot replay without the workflow
    throw new ReplayError(
        `Workflow profile '${profileId}' not found. ` +
        `The workflow used in this manifest is no longer available. ` +
        `Ensure the workflow is synced in Settings before replaying.`,
        'WORKFLOW_NOT_FOUND',
        { profileId, sourcePath: workflowInfo.sourcePath }
    );
}

// ============================================================================
// Feature Flags Resolution
// ============================================================================

/**
 * Resolve effective feature flags from manifest snapshot.
 * 
 * Merges the manifest's flag snapshot onto DEFAULT_FEATURE_FLAGS.
 * Logs warnings for any flags that are no longer valid.
 * 
 * @param manifestFlags Partial flags from manifest
 * @returns Merged FeatureFlags and any warnings
 */
export function resolveFeatureFlags(
    manifestFlags?: Partial<FeatureFlags>
): { flags: FeatureFlags; warnings: string[] } {
    const warnings: string[] = [];
    
    if (!manifestFlags) {
        return { flags: { ...DEFAULT_FEATURE_FLAGS }, warnings };
    }
    
    // Check for unknown flags (from older/newer manifest versions)
    const knownFlags = new Set(Object.keys(DEFAULT_FEATURE_FLAGS));
    const unknownFlags = Object.keys(manifestFlags).filter(k => !knownFlags.has(k));
    
    if (unknownFlags.length > 0) {
        warnings.push(
            `Manifest contains unknown feature flags (possibly from a different version): ${unknownFlags.join(', ')}`
        );
    }
    
    // Merge with defaults
    const merged = mergeFeatureFlags(manifestFlags);
    
    return { flags: merged, warnings };
}

// ============================================================================
// Stability Profile Resolution
// ============================================================================

/**
 * Resolve stability profile ID from manifest.
 * 
 * Maps manifest stabilityProfile field to our profile IDs:
 * - 'safe-defaults' -> 'fast' (conservative, minimal processing)
 * - 'production-qa' -> 'standard' (balanced, QA-enabled)
 * - 'custom' -> 'custom' (user-modified flags)
 * 
 * Falls back to 'custom' if unrecognized.
 * 
 * @param manifestProfile The stability profile from manifest
 * @returns Resolved StabilityProfileId
 */
export function resolveStabilityProfileId(
    manifestProfile?: GenerationManifest['stabilityProfile']
): StabilityProfileId {
    switch (manifestProfile) {
        case 'safe-defaults':
            return 'fast';
        case 'production-qa':
            return 'standard';
        case 'custom':
        default:
            return 'custom';
    }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Load a replay plan from a manifest file.
 * 
 * Reads the manifest, resolves workflow profile, feature flags, and
 * stability profile to create a complete ReplayPlan.
 * 
 * @param manifestPath Path to manifest JSON file
 * @param options Optional workflow profile resolution options
 * @returns ReplayPlan ready for execution
 * @throws ReplayError if manifest cannot be loaded or workflow not found
 */
export async function loadReplayPlan(
    manifestPath: string,
    options?: WorkflowProfileResolutionOptions
): Promise<ReplayPlan> {
    const warnings: string[] = [];
    
    // 1. Load manifest
    const manifest = readManifestFile(manifestPath);
    
    // 2. Resolve workflow profile
    const { profile: workflowProfile, warning: workflowWarning } = resolveWorkflowProfile(
        manifest.workflow,
        options
    );
    if (workflowWarning) {
        warnings.push(workflowWarning);
    }
    
    // 3. Resolve feature flags
    const { flags: featureFlags, warnings: flagWarnings } = resolveFeatureFlags(
        manifest.featureFlags
    );
    warnings.push(...flagWarnings);
    
    // 4. Resolve stability profile
    const stabilityProfileId = resolveStabilityProfileId(manifest.stabilityProfile);
    
    // 5. Extract additional replay-relevant data
    const plan: ReplayPlan = {
        manifest,
        workflowProfile,
        featureFlags,
        stabilityProfileId,
        cameraPathId: manifest.cameraPathId,
        temporalRegularizationApplied: manifest.temporalRegularizationApplied,
        seed: manifest.determinism.seed,
        prompt: manifest.inputs.prompt,
        negativePrompt: manifest.inputs.negativePrompt,
        warnings,
    };
    
    return plan;
}

/**
 * Build LocalGenerationSettings from a ReplayPlan.
 * 
 * This is an internal helper that constructs the settings object
 * needed to invoke generation. Exposed for testing purposes.
 * 
 * @param plan The replay plan
 * @param outputDir Optional output directory override
 * @returns LocalGenerationSettings configured for replay
 */
export function buildSettingsFromPlan(
    plan: ReplayPlan,
    _outputDir?: string
): LocalGenerationSettings {
    const { manifest, workflowProfile, featureFlags } = plan;
    
    // Build settings object matching what comfyUIService expects
    const settings: LocalGenerationSettings = {
        // Provider
        videoProvider: manifest.videoProvider || 'comfyui-local',
        
        // ComfyUI configuration
        comfyUIUrl: manifest.comfyUIUrl,
        comfyUIClientId: `replay-${Date.now()}`,
        
        // Workflow (from resolved profile)
        workflowJson: workflowProfile.workflowJson,
        mapping: workflowProfile.mapping,
        
        // Profiles
        workflowProfiles: {
            [workflowProfile.id]: workflowProfile,
        },
        videoWorkflowProfile: workflowProfile.id,
        
        // Feature flags
        featureFlags,
    };
    
    return settings;
}

/**
 * Execute a replay plan to regenerate a video.
 * 
 * In dry-run mode, logs the settings and returns without generating.
 * In execute mode, invokes the generation pipeline and returns the result.
 * 
 * @param plan The replay plan from loadReplayPlan
 * @param options Execution options
 * @returns ReplayResult with output path (or empty if dry-run)
 */
export async function executeReplay(
    plan: ReplayPlan,
    options?: { dryRun?: boolean; outputDir?: string }
): Promise<ReplayResult> {
    const { dryRun = false, outputDir } = options || {};
    const warnings: string[] = [...plan.warnings];
    
    // Build settings from plan (settings will be used by generation integration)
    // Note: actual generation uses this settings object when integrated
    buildSettingsFromPlan(plan, outputDir);
    
    if (dryRun) {
        // Log what would be done
        console.log('\n=== REPLAY DRY RUN ===');
        console.log(`Manifest ID: ${plan.manifest.manifestId}`);
        console.log(`Generation Type: ${plan.manifest.generationType}`);
        console.log(`Original Output: ${plan.manifest.outputs.videoPath || '(not recorded)'}`);
        console.log(`\nWorkflow Profile: ${plan.workflowProfile.id}`);
        console.log(`Stability Profile: ${plan.stabilityProfileId}`);
        console.log(`\nSeed: ${plan.seed ?? '(random)'}`);
        console.log(`Camera Path: ${plan.cameraPathId || '(none)'}`);
        console.log(`Temporal Regularization: ${plan.temporalRegularizationApplied ? 'Yes' : 'No'}`);
        
        // Show non-default flags
        const nonDefaultFlags = Object.entries(plan.featureFlags)
            .filter(([key, value]) => {
                const defaultValue = DEFAULT_FEATURE_FLAGS[key as keyof FeatureFlags];
                return value !== defaultValue;
            })
            .map(([key, value]) => `  ${key}: ${value}`);
        
        if (nonDefaultFlags.length > 0) {
            console.log(`\nNon-default Feature Flags:`);
            nonDefaultFlags.forEach(f => console.log(f));
        } else {
            console.log(`\nFeature Flags: (all defaults)`);
        }
        
        if (warnings.length > 0) {
            console.log(`\nWarnings:`);
            warnings.forEach(w => console.log(`  ⚠ ${w}`));
        }
        
        console.log('\n=== END DRY RUN ===\n');
        
        return {
            outputVideoPath: '',
            dryRun: true,
            warnings,
        };
    }
    
    // Execute generation
    const startTime = Date.now();
    
    // Determine output directory
    const replayOutputDir = outputDir || generateReplayOutputDir(plan.manifest);
    
    // Ensure output directory exists
    if (!fs.existsSync(replayOutputDir)) {
        fs.mkdirSync(replayOutputDir, { recursive: true });
    }
    
    // TODO: Actually invoke generation
    // For now, this is a placeholder that shows the integration point.
    // Real implementation would call:
    // - queueComfyUIPrompt() for basic generation
    // - generateVideoFromBookendsWithPreflight() for bookend workflows
    // - The appropriate pipeline based on manifest.generationType
    
    warnings.push(
        'Full generation execution is not yet implemented. ' +
        'This is a placeholder showing the replay plan structure. ' +
        'The actual video regeneration requires integration with comfyUIService.'
    );
    
    const outputVideoPath = path.join(replayOutputDir, `replay_${Date.now()}.mp4`);
    
    return {
        outputVideoPath,
        dryRun: false,
        durationMs: Date.now() - startTime,
        warnings,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a replay output directory path adjacent to the original.
 * 
 * @param manifest The source manifest
 * @returns Path like "<original-dir>/replay-<timestamp>/"
 */
export function generateReplayOutputDir(manifest: GenerationManifest): string {
    const originalPath = manifest.outputs.videoPath;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    if (originalPath) {
        const originalDir = path.dirname(originalPath);
        return path.join(originalDir, `replay-${timestamp}`);
    }
    
    // Fallback to current working directory
    return path.join(process.cwd(), 'replay-output', `replay-${timestamp}`);
}

/**
 * Format a ReplayPlan for human-readable display.
 * 
 * @param plan The replay plan to format
 * @returns Multi-line string summary
 */
export function formatReplayPlanSummary(plan: ReplayPlan): string {
    const lines: string[] = [
        '┌─────────────────────────────────────────────────────────────┐',
        '│                     REPLAY PLAN SUMMARY                    │',
        '├─────────────────────────────────────────────────────────────┤',
        `│ Manifest ID:          ${plan.manifest.manifestId.padEnd(37)}│`,
        `│ Type:                 ${plan.manifest.generationType.padEnd(37)}│`,
        `│ Scene:                ${(plan.manifest.sceneId || '-').padEnd(37)}│`,
        `│ Shot:                 ${(plan.manifest.shotId || '-').padEnd(37)}│`,
        '├─────────────────────────────────────────────────────────────┤',
        `│ Workflow Profile:     ${plan.workflowProfile.id.padEnd(37)}│`,
        `│ Stability Profile:    ${plan.stabilityProfileId.padEnd(37)}│`,
        `│ Seed:                 ${String(plan.seed ?? '(random)').padEnd(37)}│`,
        `│ Camera Path:          ${(plan.cameraPathId || '-').padEnd(37)}│`,
        `│ Temporal Reg:         ${(plan.temporalRegularizationApplied ? 'Yes' : 'No').padEnd(37)}│`,
        '├─────────────────────────────────────────────────────────────┤',
        `│ Original Output:                                           │`,
        `│   ${(plan.manifest.outputs.videoPath || '(not recorded)').slice(0, 57).padEnd(57)}│`,
    ];
    
    if (plan.warnings.length > 0) {
        lines.push('├─────────────────────────────────────────────────────────────┤');
        lines.push('│ Warnings:                                                   │');
        plan.warnings.forEach(w => {
            const truncated = w.length > 55 ? w.slice(0, 52) + '...' : w;
            lines.push(`│   ⚠ ${truncated.padEnd(53)}│`);
        });
    }
    
    lines.push('└─────────────────────────────────────────────────────────────┘');
    
    return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export default {
    loadReplayPlan,
    executeReplay,
    readManifestFile,
    resolveWorkflowProfile,
    resolveFeatureFlags,
    resolveStabilityProfileId,
    buildSettingsFromPlan,
    generateReplayOutputDir,
    formatReplayPlanSummary,
    ReplayError,
};
