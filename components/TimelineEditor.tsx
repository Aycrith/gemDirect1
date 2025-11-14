import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Scene, Shot, TimelineData, CreativeEnhancers, BatchShotTask, ShotEnhancers, Suggestion, LocalGenerationSettings, LocalGenerationStatus, DetailedShotResult, StoryBible } from '../types';

const formatVramValue = (value?: number | string | null): string => {
    if (value == null) return 'n/a';
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(numeric)) return 'n/a';
    return `${Math.round(numeric / 1048576)}MB`;
};

const formatVramDelta = (value?: number | string | null): string => {
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
import CreativeControls from './CreativeControls';
import TransitionSelector from './TransitionSelector';
import CoDirector from './CoDirector';
import PlusIcon from './icons/PlusIcon';
import TrashIcon from './icons/TrashIcon';
import SparklesIcon from './icons/SparklesIcon';
import ImageIcon from './icons/ImageIcon';
import { generateVideoRequestPayloads } from '../services/payloadService';
import { generateTimelineVideos, stripDataUrlPrefix } from '../services/comfyUIService';
import FinalPromptModal from './FinalPromptModal';
import LocalGenerationStatusComponent from './LocalGenerationStatus';
import TimelineIcon from './icons/TimelineIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';
import Tooltip from './Tooltip';
import SaveIcon from './icons/SaveIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import { useInteractiveSpotlight, useArtifactMetadata, type SceneTelemetryMetadata } from '../utils/hooks';
import GuidedAction from './GuidedAction';
import GuideCard from './GuideCard';
import CompassIcon from './icons/CompassIcon';
import NegativePromptSuggestions from './NegativePromptSuggestions';
import TemplateGuidancePanel from './TemplateGuidancePanel';
import MandatoryElementsChecklist from './MandatoryElementsChecklist';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { useMediaGenerationActions } from '../contexts/MediaGenerationProviderContext';
import { useTemplateContext } from '../contexts/TemplateContext';
import type { ApiStateChangeCallback, ApiLogCallback } from '../services/planExpansionService';

interface TimelineEditorProps {
    scene: Scene;
    onUpdateScene: (scene: Scene) => void;
    directorsVision: string;
    storyBible: StoryBible;
    onApiStateChange: ApiStateChangeCallback;
    onApiLog: ApiLogCallback;
    scenes: Scene[];
    onApplySuggestion: (suggestion: Suggestion, sceneId: string) => void;
    generatedImages: Record<string, string>;
    generatedShotImages: Record<string, string>;
    setGeneratedShotImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    onSceneKeyframeGenerated?: (sceneId: string, base64Image: string) => void;
    localGenSettings: LocalGenerationSettings;
    localGenStatus: Record<string, LocalGenerationStatus>;
    setLocalGenStatus: React.Dispatch<React.SetStateAction<Record<string, LocalGenerationStatus>>>;
    isRefined: boolean;
    onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
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
    isDragging: boolean;
}> = ({ shot, index, enhancers, imageUrl, isGeneratingImage, onDescriptionChange, onEnhancersChange, onDeleteShot, onGenerateImage, isDragging }) => {
    const [isControlsVisible, setIsControlsVisible] = useState(false);
    const spotlightRef = useInteractiveSpotlight<HTMLDivElement>();

    return (
        <div 
            ref={spotlightRef} 
            draggable
            className={`bg-gray-800/50 p-4 rounded-lg border border-gray-700/80 transition-all duration-200 flex gap-4 interactive-spotlight ${isDragging ? 'dragging' : 'hover:shadow-lg hover:shadow-amber-500/10'}`}
        >
            {imageUrl && (
                <div className="w-1/4 flex-shrink-0">
                    <img src={`data:image/jpeg;base64,${imageUrl}`} alt={`Preview for shot ${index + 1}`} className="rounded-md aspect-video object-cover" />
                </div>
            )}
            <div className="flex-grow">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex-grow">
                        <label className="block text-sm font-bold text-gray-300 mb-2 cursor-grab">Shot {index + 1}</label>
                        <textarea
                            value={shot.description}
                            onChange={(e) => onDescriptionChange(shot.id, e.target.value)}
                            rows={3}
                            className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 sm:text-sm text-gray-200 p-2"
                            placeholder="Describe the shot..."
                        />
                    </div>
                    <div className="flex flex-col items-end gap-2 mt-8">
                        <button
                            onClick={() => setIsControlsVisible(!isControlsVisible)}
                            className={`p-2 rounded-full transition-colors ${isControlsVisible ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                            aria-label="Toggle creative controls"
                        >
                            <SparklesIcon className="w-5 h-5" />
                        </button>
                         <button onClick={() => onGenerateImage(shot.id)} disabled={isGeneratingImage} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-wait" aria-label="Generate shot preview">
                            {isGeneratingImage ? <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ImageIcon className="w-5 h-5" />}
                        </button>
                        <button onClick={() => onDeleteShot(shot.id)} className="p-2 rounded-full bg-red-800/50 hover:bg-red-700 text-red-300 transition-colors" aria-label="Delete shot">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {isControlsVisible && (
                    <div className="mt-4 pt-4 border-t border-gray-700/50 fade-in">
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
    onUpdateSceneSummary
}) => {
    const [timeline, setTimeline] = useState<TimelineData>(scene.timeline);
    const [coDirectorResult, setCoDirectorResult] = useState<any | null>(null);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
    const [promptsToExport, setPromptsToExport] = useState<{ json: string; text: string; structured: any[]; negativePrompt: string } | null>(null);
    const [isGeneratingShotImage, setIsGeneratingShotImage] = useState<Record<string, boolean>>({});
    const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [isBatchProcessing, setIsBatchProcessing] = useState<false | 'description' | 'enhancers'>(false);
    const [isTemplateGuidanceOpen, setIsTemplateGuidanceOpen] = useState(false);
    
    const templateContext = useTemplateContext();
    const { updateCoveredElements } = templateContext;
    const latestArtifact = undefined; // No artifact in this context
    const queuePolicy = latestArtifact?.QueueConfig;
    const llmMetadata = latestArtifact?.Story.LLM as
        | {
              providerUrl?: string;
              model?: string;
              requestFormat?: string;
              seed?: string;
              durationMs?: number;
              error?: string;
          }
        | undefined;
    const healthCheck = latestArtifact?.Story.HealthCheck;
    const latestSceneSnapshot = useMemo(
        () => (latestArtifact ? latestArtifact.Scenes.find((meta) => meta.SceneId === scene.id) ?? null : null),
        [latestArtifact, scene.id],
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
    
    // Auto-save state
    const saveTimeoutRef = useRef<number | null>(null);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');

    // Drag and drop state
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const sceneKeyframe = generatedImages[scene.id];
    const planActions = usePlanExpansionActions();
    const mediaActions = useMediaGenerationActions();

    const ensureSceneAssets = useCallback(async () => {
        let resolvedSceneKeyframe = sceneKeyframe;
        const shotImages: Record<string, string> = { ...generatedShotImages };

        if (!resolvedSceneKeyframe) {
            onApiStateChange('loading', 'Generating base scene keyframe...');
            const generated = await mediaActions.generateKeyframeForScene(
                directorsVision,
                scene.summary,
                onApiLog,
                onApiStateChange
            );
            resolvedSceneKeyframe = stripDataUrlPrefix(generated);
            onSceneKeyframeGenerated?.(scene.id, resolvedSceneKeyframe);
        }

        const missingShots = timeline.shots.filter((shot) => !shotImages[shot.id]);
        if (missingShots.length > 0) {
            const newlyGenerated: Record<string, string> = {};
            for (const shot of missingShots) {
                const enhancers = timeline.shotEnhancers[shot.id];
                const generated = await mediaActions.generateImageForShot(
                    shot,
                    enhancers,
                    directorsVision,
                    scene.summary,
                    onApiLog,
                    onApiStateChange
                );
                const normalized = stripDataUrlPrefix(generated);
                shotImages[shot.id] = normalized;
                newlyGenerated[shot.id] = normalized;
            }
            if (Object.keys(newlyGenerated).length > 0) {
                setGeneratedShotImages((prev) => ({ ...prev, ...newlyGenerated }));
            }
        }

        if (!resolvedSceneKeyframe) {
            throw new Error('Unable to generate a scene keyframe. Please try again.');
        }

        return {
            sceneKeyframe: resolvedSceneKeyframe,
            shotImages,
        };
    }, [
        sceneKeyframe,
        generatedShotImages,
        timeline.shots,
        timeline.shotEnhancers,
        directorsVision,
        scene.summary,
        mediaActions,
        onApiLog,
        onApiStateChange,
        setGeneratedShotImages,
        onSceneKeyframeGenerated,
        scene.id,
    ]);
    
    useEffect(() => {
        setTimeline(scene.timeline);
        setHasChanges(false);
        setSaveStatus('saved');
    }, [scene]);

    // Update template coverage when scene content changes
    useEffect(() => {
        if (templateContext.selectedTemplate) {
            const sceneContent = [
                scene.title,
                scene.summary,
                ...timeline.shots.map(s => s.description),
                timeline.transitions.join(' '),
            ].join(' ');
            
            templateContext.updateCoveredElements(sceneContent);
        }
    }, [scene, timeline, templateContext]);

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

    const getNarrativeContext = useCallback((sceneId: string): string => {
        const sceneIndex = scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex === -1) return "No context found.";
        
        const actBreakdown = storyBible.plotOutline.split(/act [iI]+/);
        let actContext = "General Plot";
        if (sceneIndex / scenes.length > 0.66 && actBreakdown[3]) actContext = "Act III: " + actBreakdown[3];
        else if (sceneIndex / scenes.length > 0.33 && actBreakdown[2]) actContext = "Act II: " + actBreakdown[2];
        else if (actBreakdown[1]) actContext = "Act I: " + actBreakdown[1];

        return `This scene occurs in: ${actContext.trim()}`;
    }, [scenes, storyBible]);


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
                const enhancerKeys = Object.keys(enhancers).filter(k => (enhancers as any)[k]?.length > 0);
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
        const tasks: BatchShotTask[] = timeline.shots.map(shot => ({
            shot_id: shot.id,
            description: shot.description,
            actions: actions,
        }));

        if (tasks.length === 0) return;

        setIsBatchProcessing(actions.includes('REFINE_DESCRIPTION') ? 'description' : 'enhancers');
        try {
            const narrativeContext = getNarrativeContext(scene.id);
            const prunedContext = await planActions.getPrunedContextForBatchProcessing(narrativeContext, directorsVision, onApiLog, onApiStateChange);
            const results = await planActions.batchProcessShotEnhancements(tasks, prunedContext, onApiLog, onApiStateChange);

            const newShots = [...timeline.shots];
            const newEnhancers: ShotEnhancers = JSON.parse(JSON.stringify(timeline.shotEnhancers));

            results.forEach(result => {
                const shotIndex = newShots.findIndex(s => s.id === result.shot_id);
                if (shotIndex !== -1) {
                    if (result.refined_description) {
                        newShots[shotIndex] = { ...newShots[shotIndex], description: result.refined_description };
                    }
                    if (result.suggested_enhancers) {
                        newEnhancers[result.shot_id] = { ...newEnhancers[result.shot_id], ...result.suggested_enhancers };
                    }
                }
            });
            updateTimeline({ shots: newShots, shotEnhancers: newEnhancers });

        } catch (error) {
            console.error("Batch processing failed: ", error);
        } finally {
            setIsBatchProcessing(false);
        }
    };
    
    const handleGenerateShotImage = async (shotId: string) => {
        const shot = timeline.shots.find(s => s.id === shotId);
        if (!shot) return;

        setIsGeneratingShotImage(prev => ({ ...prev, [shotId]: true }));
        try {
            const enhancers = timeline.shotEnhancers[shotId] || {};
            const image = await mediaActions.generateImageForShot(shot, enhancers, directorsVision, scene.summary, onApiLog, onApiStateChange);
            setGeneratedShotImages(prev => ({ ...prev, [shotId]: stripDataUrlPrefix(image) }));
        } catch (error) {
            console.error(`Failed to generate image for shot ${shotId}:`, error);
        } finally {
            setIsGeneratingShotImage(prev => ({ ...prev, [shotId]: false }));
        }
    };

    const handleExportPrompts = () => {
        const payloads = generateVideoRequestPayloads(timeline, directorsVision, scene.summary, generatedShotImages);
        onUpdateScene({ ...scene, generatedPayload: payloads });
        setPromptsToExport(payloads);
        setIsPromptModalOpen(true);
    };

    const handleGenerateLocally = async () => {
        const payloads = generateVideoRequestPayloads(timeline, directorsVision, scene.summary, generatedShotImages);
        onUpdateScene({ ...scene, generatedPayload: payloads });

        const totalShots = timeline.shots.length;
        const shotIndexMap = timeline.shots.reduce<Record<string, number>>((acc, shot, index) => {
            acc[shot.id] = index;
            return acc;
        }, {});

        const updateStatus = (update: Partial<LocalGenerationStatus>) => {
            setLocalGenStatus(prev => ({
                ...prev,
                [scene.id]: {
                    ...(prev[scene.id] || { status: 'idle', message: '', progress: 0 }),
                    ...update
                }
            }));
        };

        if (totalShots === 0) {
            updateStatus({ status: 'error', message: 'No shots available to generate.', progress: 0 });
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
                }
            );

            const lastShotId = timeline.shots[totalShots - 1]?.id;
            const finalResult = lastShotId ? results[lastShotId] : undefined;
            const finalOutput = finalResult && finalResult.videoPath ? {
                type: 'video' as const,
                data: finalResult.videoPath,
                filename: finalResult.filename
            } : undefined;

            updateStatus({
                status: 'complete',
                message: `Generated ${totalShots} ${totalShots === 1 ? 'shot' : 'shots'} locally.`,
                progress: 100,
                final_output: finalOutput
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during local generation.';
            updateStatus({ status: 'error', message, progress: 0 });
        }
    };
    
    const handleUpdateSummaryClick = async () => {
        setIsSummaryUpdating(true);
        await onUpdateSceneSummary(scene.id);
        setIsSummaryUpdating(false);
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
        const [removedShot] = newShots.splice(draggedItemIndex, 1);
        newShots.splice(dragOverIndex, 0, removedShot);

        // Adjust transitions as well. A transition belongs to the shot *before* it.
        const newTransitions = [...timeline.transitions];
        if(draggedItemIndex > 0) { // If we are moving a shot that has a preceding transition
            const [removedTransition] = newTransitions.splice(draggedItemIndex - 1, 1);
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
    
    const isLocalGenConfigured = localGenSettings.comfyUIUrl && localGenSettings.workflowJson;

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
                        <img src={`data:image/jpeg;base64,${sceneKeyframe}`} alt={`Keyframe for ${scene.title}`} className="rounded-md aspect-video object-cover" />
                    </div>
                )}
                <div className="flex-grow">
                    <h2 className="text-2xl font-bold text-white">{scene.title}</h2>
                    <p className="text-gray-400 mt-1">{scene.summary}</p>
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
                            Queue policy: retry budget {queuePolicy.SceneRetryBudget}, wait {queuePolicy.HistoryMaxWaitSeconds}s, poll interval {queuePolicy.HistoryPollIntervalSeconds}s, attempts{' '}
                            {queuePolicy.HistoryMaxAttempts > 0 ? queuePolicy.HistoryMaxAttempts : 'unbounded'}, post-exec {queuePolicy.PostExecutionTimeoutSeconds}s
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
                    {latestSceneSnapshot.Warnings?.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2 text-[11px] text-amber-200 space-y-1">
                            {latestSceneSnapshot.Warnings.map((warning) => (
                                <div key={warning}>⚠ {warning}</div>
                            ))}
                        </div>
                    )}
                    {latestSceneSnapshot.Errors?.length > 0 && (
                        <div className="bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2 text-[11px] text-red-200 space-y-1">
                            {latestSceneSnapshot.Errors.map((err) => (
                                <div key={err}>⛔ {err}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {timeline.shots.length === 0 && (
                <GuidedAction
                    title="Your Scene is an Empty Canvas"
                    description="Let's bring it to life. Use the AI to generate an initial, detailed shot list based on your Story Bible and Director's Vision."
                    buttonText="Generate & Detail Initial Shots"
                    onClick={handleGenerateAndDetailInitialShots}
                    icon={<TimelineIcon className="w-12 h-12" />}
                />
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
                        <div key={shot.id} 
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
                                imageUrl={generatedShotImages[shot.id]}
                                isGeneratingImage={isGeneratingShotImage[shot.id] || false}
                                onDescriptionChange={(shotId, desc) => updateTimeline({ shots: timeline.shots.map(s => s.id === shotId ? { ...s, description: desc } : s) })}
                                onEnhancersChange={(shotId, enh) => updateTimeline({ shotEnhancers: { ...timeline.shotEnhancers, [shotId]: enh } })}
                                onDeleteShot={handleDeleteShot}
                                onGenerateImage={handleGenerateShotImage}
                                isDragging={draggedItemIndex === index}
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
                    />
                </>
            )}
            
            <div className="space-y-6 pt-6 border-t border-gray-700/50">
                 <LocalGenerationStatusComponent 
                    status={localGenStatus[scene.id] || { status: 'idle', message: '', progress: 0 }}
                    onClear={() => setLocalGenStatus(prev => ({ ...prev, [scene.id]: { status: 'idle', message: '', progress: 0 }}))}
                 />
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex gap-4">
                        <button onClick={handleExportPrompts} className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-full shadow-lg hover:bg-gray-700 transition-colors">
                            Export Prompts
                        </button>
                        <Tooltip text={!isLocalGenConfigured ? "Please configure ComfyUI server and sync workflow in Settings." : "Generate video using your local ComfyUI server"}>
                            <button
                                onClick={handleGenerateLocally}
                                disabled={!isLocalGenConfigured}
                                className="px-6 py-3 bg-amber-600 text-white font-semibold rounded-full shadow-lg hover:bg-amber-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                            >
                               Generate Locally
                            </button>
                        </Tooltip>
                    </div>
                     <div className="px-4 py-2 text-sm font-semibold rounded-full bg-gray-800/60 border border-gray-700 w-40 text-center">
                        {renderSaveStatus()}
                    </div>
                </div>
                 <GuideCard title="Next Step: Local Generation">
                    <p>Once your timeline is complete and saved, it's time to bring it to life! Use the <strong>Export Prompts</strong> or <strong>Generate Locally</strong> buttons. This will create the necessary data to feed into an external video generation model (like a local ComfyUI instance) to create your cinematic scene.</p>
                </GuideCard>
            </div>

             <FinalPromptModal 
                isOpen={isPromptModalOpen}
                onClose={() => setIsPromptModalOpen(false)}
                payloads={promptsToExport}
             />
            
            {isTemplateGuidanceOpen && templateContext.selectedTemplate && (
                <TemplateGuidancePanel 
                    template={templateContext.selectedTemplate}
                    coveredElements={templateContext.coveredElements}
                    onClose={() => setIsTemplateGuidanceOpen(false)}
                />
            )}
        </div>
    );
};

export default TimelineEditor;
