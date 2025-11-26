import React, { useState, useCallback } from 'react';
import { Scene, SceneImageGenerationStatus, KeyframeData } from '../types';
import ImageIcon from './icons/ImageIcon';
import { useMediaGenerationActions } from '../contexts/MediaGenerationProviderContext';
import { useLocalGenerationSettings } from '../contexts/LocalGenerationSettingsContext';
import { useQualityGate } from '../hooks/useQualityGate';
import { isFeatureEnabled } from '../utils/featureFlags';
import type { ApiLogCallback, ApiStateChangeCallback } from '../services/planExpansionService';

interface GenerateSceneImagesButtonProps {
    scenes: Scene[];
    directorsVision: string;
    generatedImages: Record<string, KeyframeData>;
    onImagesGenerated: React.Dispatch<React.SetStateAction<Record<string, KeyframeData>>>;
    onApiLog: ApiLogCallback;
    onApiStateChange: ApiStateChangeCallback;
    setGenerationProgress: React.Dispatch<React.SetStateAction<{ current: number; total: number; task: string }>>;
    updateSceneImageStatus?: (sceneId: string, update: Partial<SceneImageGenerationStatus>) => void;
    sceneImageStatuses?: Record<string, SceneImageGenerationStatus>;
    addToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    className?: string;
}

const GenerateSceneImagesButton: React.FC<GenerateSceneImagesButtonProps> = ({
    scenes,
    directorsVision,
    generatedImages,
    onImagesGenerated,
    onApiLog,
    onApiStateChange,
    setGenerationProgress,
    updateSceneImageStatus,
    sceneImageStatuses,
    addToast,
    className = ''
}) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const mediaActions = useMediaGenerationActions();
    const { settings } = useLocalGenerationSettings();
    const { checkQuality, gateEnabled } = useQualityGate(settings);

    const scenesNeedingImages = scenes.filter(s => !generatedImages[s.id]);

    const handleGenerateImages = useCallback(async () => {
        if (scenesNeedingImages.length === 0) return;

        // Quality Gate Check (if enabled)
        if (gateEnabled) {
            console.log('🔍 [Quality Gate] Checking prompt quality before generation...');
            
            // Check the combined prompt quality (directorsVision + scene summaries)
            const combinedPrompt = `${directorsVision}\n\n${scenesNeedingImages.map(s => s.summary).join('\n\n')}`;
            const qualityResult = await checkQuality(combinedPrompt, {
                addToast,
                context: 'Scene Generation',
                blockOnLowQuality: true,
                minQualityScore: 0.5, // Lower threshold for batch generation
            });

            if (!qualityResult.allowed) {
                console.warn(`❌ [Quality Gate] Generation blocked. Score: ${Math.round(qualityResult.qualityScore.overall * 100)}%`);
                onApiStateChange('error', `Generation blocked: Quality score too low (${Math.round(qualityResult.qualityScore.overall * 100)}%)`);
                return;
            }

            console.log(`✅ [Quality Gate] Passed. Score: ${Math.round(qualityResult.qualityScore.overall * 100)}%`);
        }

        setIsGenerating(true);
        setGenerationProgress({ current: 0, total: scenesNeedingImages.length, task: 'Generating Scene Keyframes...' });

        let successes = 0;

        try {
            for (let i = 0; i < scenesNeedingImages.length; i++) {
                const scene = scenesNeedingImages[i];
                try {
                    const taskMessage = `Generating keyframe for scene: "${scene.title}"`;
                    setGenerationProgress(prev => ({ ...prev, current: i + 1, task: taskMessage }));
                    onApiStateChange('loading', taskMessage);

                    // NEW: Mark scene as generating
                    updateSceneImageStatus?.(scene.id, {
                        status: 'generating',
                        startedAt: Date.now(),
                        error: undefined
                    });

                    console.log(`🎬 [Batch Generation] Starting scene ${i + 1}/${scenesNeedingImages.length}: "${scene.title}" (${scene.id})`);
                    
                    const image = await mediaActions.generateKeyframeForScene(
                        directorsVision,
                        scene.summary,
                        scene.id,
                        onApiLog,
                        onApiStateChange
                    );

                    const imageLength = typeof image === 'string' ? image.length : (image.start.length + image.end.length);
                    console.log(`📸 [Batch Generation] Received image for "${scene.title}" (${scene.id}), length: ${imageLength} chars`);

                    // Validate image data before storing
                    if (!image || (typeof image === 'string' && image.length === 0)) {
                        throw new Error('Empty image data returned from generation');
                    }

                    // CRITICAL FIX: Update state immediately after each successful generation
                    // This ensures UI updates even if subsequent generations fail
                    onImagesGenerated(prev => {
                        const prevCount = Object.keys(prev).length;
                        const newState = { ...prev, [scene.id]: image };
                        const newCount = Object.keys(newState).length;
                        
                        console.log(`📝 [Batch Generation] Updated state for "${scene.title}" (${scene.id})`);
                        console.log(`   📊 State transition: ${prevCount} → ${newCount} images`);
                        console.log(`   🔑 All image IDs: [${Object.keys(newState).sort().join(', ')}]`);
                        console.log(`   💾 New image size: ${imageLength} chars, starts with: ${typeof image === 'string' ? image.slice(0, 50) : 'BOOKEND'}...`);
                        
                        // Verify the new state is actually different
                        if (newCount === prevCount) {
                            console.error(`   ⚠️  WARNING: State update didn't increase count! (${scene.id} may have been overwritten)`);
                        }
                        
                        return newState;
                    });
                    successes++;
                    
                    // DEBUG: Verify state propagation with micro-task delay
                    setTimeout(() => {
                        const currentCount = Object.keys(generatedImages).length;
                        console.log(`   ✓ [Batch Generation] Verification: generatedImages prop now has ${currentCount} items (expected: ${i + 1})`);
                        if (currentCount < i + 1) {
                            console.error(`   ❌ [Batch Generation] STATE SYNC ISSUE: Expected ${i + 1} images but only have ${currentCount}!`);
                        }
                    }, 100);

                    // NEW: Mark scene as complete
                    updateSceneImageStatus?.(scene.id, {
                        status: 'complete',
                        completedAt: Date.now(),
                        progress: 100
                    });
                    
                    console.log(`✅ [Batch Generation] Scene "${scene.title}" (${scene.id}): Complete! Progress: ${successes}/${scenesNeedingImages.length}`);
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.error(`❌ [Image Sync] Failed to generate keyframe for scene "${scene.title}" (${scene.id}):`, e);

                    // NEW: Mark scene as error
                    updateSceneImageStatus?.(scene.id, {
                        status: 'error',
                        error: errorMessage,
                        completedAt: Date.now()
                    });

                    onApiStateChange('error', `Failed to generate keyframe for "${scene.title}": ${errorMessage}`);
                }

                // Rate limiting: ~55 RPM max
                if (i < scenesNeedingImages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1100));
                }
            }

            // Final verification: Check if images are actually present in state
            // This helps detect storage/persistence issues
            console.log('🔍 [Batch Generation] Verifying final state...');
            setTimeout(() => {
                // Use a small delay to ensure state updates have propagated
                const currentImages = generatedImages || {};
                const persistedCount = Object.keys(currentImages).length;
                console.log(`📊 [Batch Generation] Final verification: ${persistedCount} images in state`);
                
                scenesNeedingImages.forEach((scene, idx) => {
                    const hasImage = currentImages[scene.id];
                    if (hasImage) {
                        console.log(`✅ [Batch Generation] Scene ${idx + 1} "${scene.title}" (${scene.id}): Image persisted (${hasImage.length} chars)`);
                    } else {
                        console.error(`❌ [Batch Generation] Scene ${idx + 1} "${scene.title}" (${scene.id}): Image MISSING from state!`);
                    }
                });
            }, 500);

            if (successes === scenesNeedingImages.length) {
                onApiStateChange('success', 'All scene keyframes generated successfully!');
            } else if (successes > 0) {
                onApiStateChange('success', `Generated ${successes}/${scenesNeedingImages.length} keyframes. ${scenesNeedingImages.length - successes} failed.`);
            } else {
                onApiStateChange('error', `Failed to generate any keyframes. Check console for errors.`);
            }
        } finally {
            setIsGenerating(false);
            setGenerationProgress({ current: 0, total: 0, task: '' });
        }
    }, [scenesNeedingImages, directorsVision, generatedImages, onImagesGenerated, onApiLog, onApiStateChange, setGenerationProgress, mediaActions, updateSceneImageStatus, gateEnabled, checkQuality, addToast]);

    if (scenes.length === 0) return null;

    const allImagesGenerated = scenesNeedingImages.length === 0;

    return (
        <div className={`glass-card p-6 rounded-lg ${className}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-100 mb-2 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-amber-400" />
                        Scene Keyframe Images
                    </h3>
                    <p className="text-sm text-gray-400">
                        {allImagesGenerated ? (
                            <>✅ All {scenes.length} scene keyframes generated</>
                        ) : (
                            <>
                                {scenes.length - scenesNeedingImages.length} of {scenes.length} keyframes generated.
                                {' '}<strong className="text-amber-400">Optional:</strong> Generate keyframe images if you want to use local ComfyUI video generation. You can skip this and export prompts instead.
                            </>
                        )}
                    </p>
                    {gateEnabled && (
                        <div className="mt-2 text-xs text-purple-400 flex items-center gap-1">
                            <span>🔒</span>
                            <span>Quality Gate enabled - prompts will be validated before generation</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={handleGenerateImages}
                    data-testid="generate-keyframes"
                    disabled={isGenerating || allImagesGenerated}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-purple-500/50 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed transform hover:scale-105"
                >
                    {isGenerating ? (
                        <>
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                        </>
                    ) : (
                        <>
                            <ImageIcon className="w-5 h-5" />
                            {allImagesGenerated ? 'All Images Generated' : `Generate ${scenesNeedingImages.length} Keyframe${scenesNeedingImages.length === 1 ? '' : 's'}`}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default GenerateSceneImagesButton;
