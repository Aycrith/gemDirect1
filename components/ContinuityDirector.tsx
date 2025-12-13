import React, { useCallback, useMemo } from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage, Suggestion, KeyframeData, LocalGenerationStatus, LocalGenerationSettings } from '../types';
import { isStoryBibleV2 } from '../types';
import ContinuityCard from './ContinuityCard';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';
import GuideCard from './GuideCard';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import E2EQACard from './E2EQACard';
import { ApiStateChangeCallback, ApiLogCallback } from '../services/planExpansionService';
import { useVisualBible } from '../utils/hooks';
import { validateContinuityPrerequisites, getPrerequisiteSummary } from '../services/continuityPrerequisites';
import { analyzeCharacterTimeline, type CharacterContinuityWarning } from '../services/characterTracker';
import { findCharacterContinuityIssues } from '../services/continuityVisualContext';
// Phase 1C: Unified scene store integration
import { useUnifiedSceneStoreEnabled } from '../hooks/useSceneStore';
import { useSceneStateStore } from '../services/sceneStateStore';
// Phase 1D: Generation status Zustand store integration
import { useAllGenStatuses, DEFAULT_GENERATION_STATUS } from '../services/generationStatusStore';
import { isFeatureEnabled } from '../utils/featureFlags';
import { usePipelineStore } from '../services/pipelineStore';
import { createExportPipeline } from '../services/pipelineFactory';

interface ContinuityDirectorProps {
  scenes: Scene[];
  storyBible: StoryBible;
  directorsVision: string;
  generatedImages: Record<string, KeyframeData>;
  continuityData: Record<string, SceneContinuityData>;
  setContinuityData: React.Dispatch<React.SetStateAction<Record<string, SceneContinuityData>>>;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onApiStateChange: ApiStateChangeCallback;
  onApiLog: ApiLogCallback;
  onApplySuggestion: (suggestion: Suggestion, sceneId: string) => void;
  refinedSceneIds: Set<string>;
  onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
  onExtendTimeline: (sceneId: string, lastFrame: string) => void;
  onRerunScene?: (sceneId: string) => void;
  /** Optional: Local generation status for all scenes (for displaying generated videos) */
  localGenStatus?: Record<string, LocalGenerationStatus>;
  /** Optional: Callback to navigate to Director Mode */
  onNavigateToDirector?: () => void;
  /** Optional: Local generation settings for feature flag access */
  localGenSettings?: LocalGenerationSettings | null;
}

const ContinuityDirector: React.FC<ContinuityDirectorProps> = ({
  scenes,
  storyBible,
  directorsVision,
  generatedImages,
  continuityData,
  setContinuityData,
  addToast,
  onApiStateChange,
  onApiLog,
  onApplySuggestion,
  refinedSceneIds,
  onUpdateSceneSummary,
  onExtendTimeline,
  onRerunScene,
  localGenStatus,
  onNavigateToDirector,
  localGenSettings,
}) => {
  const sceneRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const { visualBible } = useVisualBible();

  // Phase 1C: Zustand store integration with feature flag
  // When enabled, prefer reading from the new store for consistency
  const sceneStore = useSceneStateStore.getState;
  const selectKeyframeVersion = useSceneStateStore(state => state.selectKeyframeVersion);
  const isStoreEnabled = useUnifiedSceneStoreEnabled(localGenSettings);
  
  // Phase 1D: Generation status store integration with feature flag
  // When enabled, use Zustand store instead of prop-drilled localGenStatus
  const isGenStatusStoreEnabled = isFeatureEnabled(localGenSettings?.featureFlags, 'useGenerationStatusStore');
  const storeGenStatuses = useAllGenStatuses();
  
  // Use store data when enabled, otherwise use existing props (prop drilling)
  // Phase 1C: These variables now route through the unified store when flag is enabled
  const effectiveScenes = isStoreEnabled ? sceneStore().scenes : scenes;
  const effectiveGeneratedImages = isStoreEnabled ? sceneStore().generatedImages : generatedImages;
  
  // Phase 1D: Route to store or props based on feature flag
  const effectiveGenStatuses: Record<string, LocalGenerationStatus> = isGenStatusStoreEnabled 
    ? storeGenStatuses 
    : (localGenStatus ?? {});

  // Keyframe version selection handler
  const handleSelectKeyframeVersion = useCallback((sceneId: string, versionIndex: number) => {
    selectKeyframeVersion(sceneId, versionIndex);
  }, [selectKeyframeVersion]);

  // Phase 2.2: Validate prerequisites before showing content
  const prerequisites = useMemo(() => {
    return validateContinuityPrerequisites(effectiveScenes, effectiveGeneratedImages);
  }, [effectiveScenes, effectiveGeneratedImages]);

  // Phase 4: Character continuity analysis using characterTracker
  const characterContinuityWarnings = useMemo((): CharacterContinuityWarning[] => {
    // Only analyze if we have V2 story bible with character profiles
    if (!storyBible || !isStoryBibleV2(storyBible)) {
      return [];
    }
    
    // Aggregate all scene timelines into a single analysis
    const allWarnings: CharacterContinuityWarning[] = [];
    
    for (const scene of effectiveScenes) {
      if (scene.timeline && scene.timeline.shots.length > 0) {
        const { continuity } = analyzeCharacterTimeline(scene.timeline, storyBible);
        allWarnings.push(...continuity.warnings);
      }
    }
    
    return allWarnings;
  }, [storyBible, effectiveScenes]);

  // Phase 4: Character continuity issues using Visual Bible (for ContinuityCard prop)
  const characterContinuityIssues = useMemo(() => {
    return findCharacterContinuityIssues(visualBible, effectiveScenes);
  }, [visualBible, effectiveScenes]);

  const getNarrativeContext = useCallback((sceneId: string): string => {
      if (!storyBible || !effectiveScenes.length) return '';
      
      const sceneIndex = effectiveScenes.findIndex(s => s.id === sceneId);
      if (sceneIndex === -1) return '';
      
      const scene = effectiveScenes[sceneIndex];
      if (!scene) return ''; // Safety check for TypeScript

      const plotLines = storyBible.plotOutline.split('\n');
      const actStarts: Record<string, number> = {
          'act i': plotLines.findIndex(l => l.trim().toLowerCase().startsWith('act i')),
          'act ii': plotLines.findIndex(l => l.trim().toLowerCase().startsWith('act ii')),
          'act iii': plotLines.findIndex(l => l.trim().toLowerCase().startsWith('act iii')),
      };

      // Heuristic to determine which act the scene falls into based on its sequence order.
      const sceneFraction = effectiveScenes.length > 1 ? sceneIndex / (effectiveScenes.length - 1) : 0;
      let currentActKey: 'act i' | 'act ii' | 'act iii' = 'act i';
      if (actStarts['act iii'] !== -1 && sceneFraction >= 0.7) {
          currentActKey = 'act iii';
      } else if (actStarts['act ii'] !== -1 && sceneFraction >= 0.3) {
          currentActKey = 'act ii';
      }

      let actText = '';
      const start = actStarts[currentActKey];
      if (start !== -1) {
          let end: number | undefined;
          // Find the start of the next act to define the end of the current one
          if (currentActKey === 'act i') end = actStarts['act ii'] !== -1 ? actStarts['act ii'] : actStarts['act iii'];
          if (currentActKey === 'act ii') end = actStarts['act iii'] !== -1 ? actStarts['act iii'] : undefined;
          
          actText = plotLines.slice(start, end).join('\n');
      } else {
          // Fallback if no explicit "Act" markers are found.
          actText = storyBible.plotOutline;
      }

      const prevScene = sceneIndex > 0 ? effectiveScenes[sceneIndex - 1] : undefined;
      const nextScene = sceneIndex < effectiveScenes.length - 1 ? effectiveScenes[sceneIndex + 1] : undefined;
      const prevSceneSummary = prevScene ? `PREVIOUS SCENE: ${prevScene.summary}` : 'This is the opening scene.';
      const nextSceneSummary = nextScene ? `NEXT SCENE: ${nextScene.summary}` : 'This is the final scene.';

      return `
This scene, "${scene.title}", occurs within the following narrative act:
${actText}

CONTEXT FROM ADJACENT SCENES:
- ${prevSceneSummary}
- ${nextSceneSummary}
      `.trim();
  }, [storyBible, effectiveScenes]);

  // Phase 4.4: Pipeline Orchestration
  const activePipelineId = usePipelineStore(state => state.activePipelineId);
  const activePipeline = usePipelineStore(state => 
    state.activePipelineId ? state.pipelines[state.activePipelineId] : null
  );

  const pipelineStats = useMemo(() => {
    if (!activePipeline) return null;
    const tasks = Object.values(activePipeline.tasks);
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const running = tasks.filter(t => t.status === 'running');
    const failed = tasks.filter(t => t.status === 'failed').length;
    
    return {
      total,
      completed,
      running,
      failed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }, [activePipeline]);

  const [exportUpscaleEnabled, setExportUpscaleEnabled] = React.useState(false);
  const [exportInterpolateEnabled, setExportInterpolateEnabled] = React.useState(false);

  const exportUpscalePrereqsMet = useMemo(() => {
    return !!localGenSettings?.comfyUIUrl && !!localGenSettings?.workflowProfiles?.['video-upscaler'];
  }, [localGenSettings]);

  const exportInterpolationPrereqsMet = useMemo(() => {
    return !!localGenSettings?.comfyUIUrl && !!localGenSettings?.workflowProfiles?.['rife-interpolation'];
  }, [localGenSettings]);

  const exportUpscaleFlagEnabled = isFeatureEnabled(localGenSettings?.featureFlags, 'videoUpscaling');
  const exportInterpolationFlagEnabled = isFeatureEnabled(localGenSettings?.featureFlags, 'frameInterpolationEnabled');

  const exportCanUpscale = exportUpscalePrereqsMet && exportUpscaleFlagEnabled;
  const exportCanInterpolate = exportInterpolationPrereqsMet && exportInterpolationFlagEnabled;

  const exportUpscaleToggleTitle = exportCanUpscale
    ? 'Add an upscale step after video generation'
    : !exportUpscaleFlagEnabled && !exportUpscalePrereqsMet
      ? 'Requires Feature Flag: Video Upscaling (Settings → Features) and ComfyUI + a "video-upscaler" workflow profile'
      : !exportUpscaleFlagEnabled
        ? 'Requires Feature Flag: Video Upscaling (enable in Settings → Features)'
        : 'Requires ComfyUI and a "video-upscaler" workflow profile';

  const exportInterpolationToggleTitle = exportCanInterpolate
    ? 'Add a frame interpolation step after video generation'
    : !exportInterpolationFlagEnabled && !exportInterpolationPrereqsMet
      ? 'Requires Feature Flag: Frame Interpolation (Settings → Features) and ComfyUI + a "rife-interpolation" workflow profile'
      : !exportInterpolationFlagEnabled
        ? 'Requires Feature Flag: Frame Interpolation (enable in Settings → Features)'
        : 'Requires ComfyUI and a "rife-interpolation" workflow profile';

  const handleExportAll = useCallback(() => {
    if (!localGenSettings) {
      addToast('Settings not loaded', 'error');
      return;
    }

    const pipelineId = createExportPipeline(effectiveScenes, localGenSettings, {
      generateKeyframes: true,
      generateVideos: true,
      upscale: exportUpscaleEnabled && exportCanUpscale,
      interpolate: exportInterpolateEnabled && exportCanInterpolate,
    });

    if (pipelineId) {
      addToast('Export pipeline started', 'success');
    } else {
      addToast('No shots to export', 'warning');
    }
  }, [effectiveScenes, localGenSettings, addToast, exportUpscaleEnabled, exportInterpolateEnabled, exportCanUpscale, exportCanInterpolate]);


  return (
    <div className="max-w-7xl mx-auto">
      <header className="text-center mb-12">
        <h2 className="flex items-center justify-center text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400">
          <ClipboardCheckIcon className="w-10 h-10 mr-4 text-amber-300" />
          Continuity Director
        </h2>
        <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto">
          Upload your generated videos for each scene. The AI will analyze them, score them against your creative intent, and provide feedback to refine your story.
          {/* NOTE: Future enhancement - Auto-link latest renders from the canonical pipeline instead of requiring manual upload, and integrate Visual Bible continuity scoring. See Phase 4 roadmap. */}
        </p>
        
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-4 text-xs text-gray-300">
            <label
              className={`flex items-center gap-1.5 ${!exportCanUpscale ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={exportUpscaleToggleTitle}
            >
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={exportUpscaleEnabled}
                onChange={(e) => setExportUpscaleEnabled(e.target.checked)}
                disabled={!!activePipelineId || !exportCanUpscale}
              />
              Upscale 2x
            </label>
            <label
              className={`flex items-center gap-1.5 ${!exportCanInterpolate ? 'opacity-60 cursor-not-allowed' : ''}`}
              title={exportInterpolationToggleTitle}
            >
              <input
                type="checkbox"
                className="accent-emerald-500"
                checked={exportInterpolateEnabled}
                onChange={(e) => setExportInterpolateEnabled(e.target.checked)}
                disabled={!!activePipelineId || !exportCanInterpolate}
              />
              Interpolate 2x
            </label>
          </div>

          <button
            onClick={handleExportAll}
            disabled={!!activePipelineId}
            className={`px-6 py-3 rounded-lg font-bold text-white transition-colors shadow-lg flex items-center gap-2 ${
              activePipelineId 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500'
            }`}
          >
            {activePipelineId ? (
               <>
                 <span className="animate-spin">⟳</span> 
                 {pipelineStats ? `Processing... ${pipelineStats.progress}%` : 'Pipeline Active...'}
               </>
            ) : (
               <>
                 <span>🚀</span> Export All Scenes
               </>
            )}
          </button>

          {activePipelineId && pipelineStats && (
            <div className="text-sm text-gray-400 animate-pulse flex flex-col items-center">
              <span>
                {pipelineStats.running.length > 0 
                  ? `Running: ${pipelineStats.running[0]?.type} (${pipelineStats.completed}/${pipelineStats.total})`
                  : `Pending tasks... (${pipelineStats.completed}/${pipelineStats.total})`
                }
              </span>
              {pipelineStats.failed > 0 && (
                <span className="text-red-400 text-xs mt-1">
                  ⚠️ {pipelineStats.failed} task(s) failed
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Phase 2.2: Prerequisite warning panel */}
      {!prerequisites.canProceed && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-6 mb-8">
          <h3 className="flex items-center text-lg font-bold text-yellow-400 mb-4">
            <AlertTriangleIcon className="w-5 h-5 mr-2" />
            Prerequisites Missing
          </h3>
          <p className="text-yellow-200/80 mb-4">
            {getPrerequisiteSummary(prerequisites)}
          </p>
          <ul className="space-y-2 mb-6">
            {prerequisites.missingItems.filter(item => item.severity === 'error').map((item, idx) => (
              <li key={idx} className="flex items-start text-red-300">
                <span className="mr-2">❌</span>
                <span>{item.message}</span>
              </li>
            ))}
            {prerequisites.missingItems.filter(item => item.severity === 'warning').map((item, idx) => (
              <li key={idx} className="flex items-start text-yellow-300">
                <span className="mr-2">⚠️</span>
                <span>{item.message}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-4">
            <button 
              onClick={() => onNavigateToDirector?.()}
              className="px-4 py-2 bg-yellow-600 text-white font-semibold rounded-md hover:bg-yellow-700 transition-colors"
            >
              Go to Director Mode
            </button>
            <div className="text-sm text-gray-400 flex items-center">
              {prerequisites.summary.scenesWithTimelines}/{prerequisites.summary.totalScenes} scenes with timelines • 
              {prerequisites.summary.scenesWithKeyframes}/{prerequisites.summary.totalScenes} with keyframes
            </div>
          </div>
        </div>
      )}

      <E2EQACard 
        scenes={effectiveScenes}
        generatedImages={generatedImages}
        className="mb-8"
      />

      <GuideCard title="Completing the Creative Loop">
          <p>
              This is where your story comes full circle. Generate videos for your scenes using the prompts from the <strong>Direct Scenes</strong> stage (using the "Export" or "Generate Locally" options).
          </p>
            <p className="mt-2">
              Upload them here to get AI feedback on how well they match your vision. Applying the suggestions can refine your original Story Bible, Director's Vision, or scene timelines, creating a powerful feedback loop to improve your story from the ground up.
          </p>
      </GuideCard>

      {/* Phase 4: Character Continuity Analysis Panel */}
      {characterContinuityWarnings.length > 0 && (
        <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-6 mb-8">
          <h3 className="flex items-center text-lg font-bold text-orange-400 mb-4">
            <AlertTriangleIcon className="w-5 h-5 mr-2" />
            Character Continuity Issues ({characterContinuityWarnings.length})
          </h3>
          <p className="text-orange-200/70 mb-4">
            The following character appearance issues were detected across your timeline:
          </p>
          <ul className="space-y-3 max-h-64 overflow-y-auto">
            {characterContinuityWarnings.map((warning, idx) => (
              <li key={`${warning.characterId}-${idx}`} className="flex items-start bg-black/20 rounded p-3">
                <span className="mr-3 text-lg">
                  {warning.warningType === 'gap' ? '⏳' : warning.warningType === 'sudden_appearance' ? '⚡' : '🔄'}
                </span>
                <div className="flex-1">
                  <div className="text-orange-300 font-medium">{warning.characterName}</div>
                  <div className="text-gray-300 text-sm">{warning.details}</div>
                  <div className="text-gray-400 text-xs mt-1 italic">💡 {warning.suggestion}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-12">
        {effectiveScenes.map((scene, index) => (
          <div key={scene.id} ref={(el) => { sceneRefs.current[scene.id] = el; }}>
            <ContinuityCard
              scene={scene}
              sceneNumber={index + 1}
              storyBible={storyBible}
              narrativeContext={getNarrativeContext(scene.id)}
              directorsVision={directorsVision}
              generatedImage={effectiveGeneratedImages[scene.id]}
              data={continuityData[scene.id] || { status: 'idle' }}
              setContinuityData={(updater) => {
                setContinuityData(prev => ({
                  ...prev,
                  [scene.id]: typeof updater === 'function' ? updater(prev[scene.id]) : updater
                }));
              }}
              addToast={addToast}
              onApiStateChange={onApiStateChange}
              onApiLog={onApiLog}
              onApplySuggestion={onApplySuggestion}
              isRefined={refinedSceneIds.has(scene.id)}
              onUpdateSceneSummary={onUpdateSceneSummary}
              onExtendTimeline={onExtendTimeline}
              allSceneIds={effectiveScenes.map(s => s.id)}
              allScenes={effectiveScenes}
              onRerunScene={onRerunScene}
              characterContinuityIssues={characterContinuityIssues.filter(issue => issue.scenes.includes(scene.id))}
              localGenStatus={effectiveGenStatuses[scene.id] ?? DEFAULT_GENERATION_STATUS}
              onSelectKeyframeVersion={isStoreEnabled ? handleSelectKeyframeVersion : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContinuityDirector;
