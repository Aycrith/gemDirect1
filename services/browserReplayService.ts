/**
 * Browser-side Manifest Replay Service
 * 
 * Provides functionality to re-run generations based on existing manifests
 * within the browser environment.
 * 
 * Uses manifestReplayCore for logic and videoGenerationService for execution.
 * 
 * @module services/browserReplayService
 */

import { GenerationManifest } from './generationManifestService';
import { createReplayPlan, buildSettingsFromPlan } from './manifestReplayCore';
import { queueComfyUIPromptSafe } from './videoGenerationService';
import { LocalGenerationSettings } from '../types';

/**
 * Replays a generation manifest in the browser.
 * 
 * @param manifest The generation manifest to replay
 * @param currentSettings The current application settings (for environment context)
 * @param base64Image The source image (required for I2V, optional for T2V)
 * @param onProgress Optional progress callback
 * @returns Promise resolving to the generation result
 */
export const replayManifestInBrowser = async (
    manifest: GenerationManifest,
    currentSettings: LocalGenerationSettings,
    base64Image: string,
    onProgress?: (p: number, m?: string) => void
) => {
    // 1. Create Replay Plan
    // We resolve against the currently loaded workflow profiles in the browser
    const plan = createReplayPlan(manifest, { 
        availableProfiles: currentSettings.workflowProfiles 
    });

    if (plan.warnings.length > 0) {
        console.warn('[BrowserReplay] Plan warnings:', plan.warnings);
    }

    // 2. Build Settings
    // This merges the manifest's requirements with the current environment (URL, etc.)
    const replaySettings = buildSettingsFromPlan(plan, currentSettings);

    // 3. Prepare Payloads
    // queueComfyUIPromptSafe expects { json, text, negativePrompt }
    // - text/negativePrompt come from the manifest
    // - json is usually the workflow template. 
    //   If we pass an empty string, queueComfyUIPrompt will use the profile's workflowJson.
    //   This is preferred as it allows using the *current* version of the workflow
    //   with the *original* parameters.
    
    const payloads = {
        json: '', 
        text: plan.prompt || '',
        negativePrompt: plan.negativePrompt || ''
    };

    // 4. Execute Generation
    // This handles queueing, VRAM checks, image upload, and execution
    return queueComfyUIPromptSafe(replaySettings, payloads, base64Image, {
        onProgress,
        // We can add more options here if needed, like sceneId from manifest
        sceneId: manifest.sceneId,
        shotId: manifest.shotId
    });
};
