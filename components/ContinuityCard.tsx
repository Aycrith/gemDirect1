import React from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage, Suggestion, KeyframeData, LocalGenerationStatus, isBookendKeyframe, getActiveKeyframeImage, isVersionedKeyframe, ApiCallLog } from '../types';
import { ApiStatus } from '../contexts/ApiStatusContext';
import { extractFramesFromVideo } from '../utils/videoUtils';
import { extractVideoFromLocalStatus } from '../utils/videoValidation';

import FileUpload from './FileUpload';
import VideoPlayer from './VideoPlayer';
import FeedbackCard from './FeedbackCard';
import SparklesIcon from './icons/SparklesIcon';
import FilmIcon from './icons/FilmIcon';
import ImageIcon from './icons/ImageIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';
import KeyframeVersionSelector from './KeyframeVersionSelector';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { useVisualBible } from '../utils/hooks';
import { getSceneVisualBibleContext, computeSceneContinuityScore, CharacterContinuityIssue } from '../services/continuityVisualContext';

interface ContinuityCardProps {
  scene: Scene;
  sceneNumber: number;
  storyBible: StoryBible;
  narrativeContext: string;
  directorsVision: string;
  generatedImage?: KeyframeData;
  data: SceneContinuityData;
  setContinuityData: (updater: (prev: SceneContinuityData | undefined) => SceneContinuityData | SceneContinuityData) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onApiStateChange: (status: ApiStatus, message: string) => void;
  onApiLog: (log: Omit<ApiCallLog, 'id' | 'timestamp'>) => void;
  onApplySuggestion: (suggestion: Suggestion, sceneId: string) => void;
  isRefined: boolean;
  onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
  onExtendTimeline: (sceneId: string, lastFrame: string) => void;
  allSceneIds: string[];
  allScenes: Scene[];
  onRerunScene?: (sceneId: string) => void;
  characterContinuityIssues?: CharacterContinuityIssue[];
  /** Optional: Local generation status for this scene (for displaying generated videos) */
  localGenStatus?: LocalGenerationStatus;
  /** Optional: Callback for selecting a keyframe version from history */
  onSelectKeyframeVersion?: (sceneId: string, versionIndex: number) => void;
}

const ScoreCircle: React.FC<{ score: number; label: string }> = ({ score, label }) => {
    const colorClass = score >= 7 ? 'text-green-400' : score >= 4 ? 'text-yellow-400' : 'text-red-400';
    return (
        <div className="text-center">
            <div className={`relative w-20 h-20 mx-auto`}>
                <svg className="w-full h-full" viewBox="0 0 36 36">
                    <path className="text-gray-700" strokeWidth="2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className={`${colorClass} transition-all duration-500`} strokeWidth="2" strokeDasharray={`${score * 10}, 100`} strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${colorClass}`}>{score}</span>
                </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">{label}</p>
        </div>
    );
};

const AnalysisLoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
        <div className="relative mb-4">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-amber-400"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <FilmIcon className="w-8 h-8 text-amber-400" />
            </div>
        </div>
        <p className="text-lg font-semibold text-gray-200">Analyzing Video...</p>
        <p className="text-sm text-gray-400 mt-2 max-w-xs">Extracting frames and evaluating content. This may take a moment for longer videos.</p>
    </div>
);


const ContinuityCard: React.FC<ContinuityCardProps> = ({
  scene,
  sceneNumber,
  storyBible,
  narrativeContext,
  directorsVision,
  generatedImage,
  data,
  setContinuityData,
  addToast,
  onApiStateChange,
  onApiLog,
  // onApplySuggestion, // Unused
  // isRefined, // Unused
  // onUpdateSceneSummary, // Unused
  // onExtendTimeline, // Unused
  allSceneIds: _allSceneIds,
  allScenes,
  onRerunScene,
  characterContinuityIssues = [],
  localGenStatus,
  onSelectKeyframeVersion
}) => {
    if (!scene) {
        console.error('[ContinuityCard] Scene prop is missing');
        return <div className="p-4 text-red-500">Error: Scene data missing</div>;
    }

    const { analyzeVideoFrames, getPrunedContextForContinuity, scoreContinuity } = usePlanExpansionActions();
    const { visualBible } = useVisualBible();
    // const visualBible = { styleBoards: [], characters: [], locations: [], tags: [] } as any; // Dummy visual bible

    // Extract generated video data URL from local generation status (if available)
    const generatedVideoUrl = React.useMemo(() => {
      const output = extractVideoFromLocalStatus(localGenStatus);
      return output?.data;
    }, [localGenStatus]);

    // Compute continuity score
    const continuityScore = React.useMemo(() => {
      return computeSceneContinuityScore(visualBible, scene, allScenes);
    }, [visualBible, scene, allScenes]);

  const handleAnalysis = async (file: File) => {
    try {
      setContinuityData(prev => ({ 
          ...prev, 
          status: 'analyzing', 
          error: undefined,
          videoFile: file, 
          videoSrc: URL.createObjectURL(file),
          videoAnalysis: undefined,
          continuityResult: undefined,
          frames: undefined,
      }));

      const frames = await extractFramesFromVideo(file, 1);
      if (frames.length === 0) throw new Error("Could not extract frames. Video might be invalid or in an unsupported format.");
      setContinuityData(prev => ({ ...(prev ?? { status: 'idle' }), frames }));
    const analysis = await analyzeVideoFrames(frames, onApiLog, onApiStateChange);
      setContinuityData(prev => ({ ...(prev ?? { status: 'idle' }), videoAnalysis: analysis, status: 'scoring' }));

      const visualBibleContext = getSceneVisualBibleContext(visualBible, scene.id);
      const extendedNarrativeContext = narrativeContext + (visualBibleContext.styleBoards.length > 0 ? `\n\nVisual Bible Context:\n- Style Boards: ${visualBibleContext.styleBoards.join(', ')}\n- Tags: ${visualBibleContext.tags.join(', ')}` : '');
      const context = await getPrunedContextForContinuity(storyBible, extendedNarrativeContext, scene, directorsVision, onApiLog, onApiStateChange);
      const result = await scoreContinuity(context, scene, analysis, onApiLog, onApiStateChange);
      setContinuityData(prev => ({ ...(prev ?? { status: 'idle' }), continuityResult: result, status: 'complete' }));

      addToast(`Analysis complete for Scene ${sceneNumber}!`, 'success');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
      setContinuityData(prev => ({ ...prev, status: 'error', error: errorMsg, videoFile: undefined, videoSrc: undefined, frames: [] }));
      addToast(errorMsg, 'error');
    }
  };
  
  const handleReset = () => {
    if (data.videoSrc) {
        URL.revokeObjectURL(data.videoSrc);
    }
    setContinuityData(() => ({ status: 'idle' })); // Reset to initial state
  };

  const isLoading = data.status === 'analyzing' || data.status === 'scoring';

  // const timelineChanges = data.continuityResult?.suggested_changes.filter(s =>
  //   s.type === 'UPDATE_SHOT' || s.type === 'ADD_SHOT_AFTER' || s.type === 'UPDATE_TRANSITION'
  // ) || [];

  // const projectChanges = data.continuityResult?.suggested_changes.filter(s =>
  //   s.type === 'UPDATE_STORY_BIBLE' || s.type === 'UPDATE_DIRECTORS_VISION' || s.type === 'FLAG_SCENE_FOR_REVIEW'
  // ) || [];


  return (
    <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/80 rounded-xl shadow-lg overflow-hidden">
        <header className="p-6 bg-gray-900/40 border-b border-gray-700/80">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white">Scene {sceneNumber}: {scene.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{scene.summary}</p>
                    {/* Visual Bible Context commented out for debugging */}
                    {/* {(() => {
                        const visualBibleContext = getSceneVisualBibleContext(visualBible, scene.id);
                        return visualBibleContext.styleBoards.length > 0 ? (
                            <div className="mt-2 text-xs text-gray-500">
                                <span className="font-medium text-indigo-400">Visual Bible:</span> {visualBibleContext.styleBoards.join(', ')}
                                {visualBibleContext.tags.length > 0 && ` (${visualBibleContext.tags.join(', ')})`}
                            </div>
                        ) : null;
                    })()} */}
                </div>
                {onRerunScene && (
                    <button
                        onClick={() => onRerunScene(scene.id)}
                        className="px-3 py-1.5 text-sm font-medium text-blue-300 bg-blue-900/30 border border-blue-700/50 rounded-md hover:bg-blue-900/50 transition-colors"
                        title="Re-run scene generation"
                    >
                        Re-run Scene
                    </button>
                )}
            </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-700/80">
            {/* Left Column: Upload & Video */}
            <div className="p-6 bg-gray-800/80 min-h-[400px] flex flex-col justify-center space-y-4">
                {generatedImage && (
                    <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center"><ImageIcon className="w-4 h-4 mr-2 text-amber-400" />Scene Keyframe</h4>
                        {onSelectKeyframeVersion && isVersionedKeyframe(generatedImage) && (
                            <KeyframeVersionSelector
                                sceneId={scene.id}
                                keyframeData={generatedImage}
                                onSelectVersion={onSelectKeyframeVersion}
                            />
                        )}
                        {isBookendKeyframe(generatedImage) ? (
                            <div className="flex gap-1">
                                <div className="relative flex-1">
                                    <img src={`data:image/jpeg;base64,${generatedImage.start}`} alt={`Start Keyframe for ${scene.title}`} className="rounded-lg w-full aspect-video object-cover border border-gray-600"/>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-1 rounded-b-lg">Start</div>
                                </div>
                                <div className="relative flex-1">
                                    <img src={`data:image/jpeg;base64,${generatedImage.end}`} alt={`End Keyframe for ${scene.title}`} className="rounded-lg w-full aspect-video object-cover border border-gray-600"/>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-1 rounded-b-lg">End</div>
                                </div>
                            </div>
                        ) : (
                            <img src={`data:image/jpeg;base64,${getActiveKeyframeImage(generatedImage)}`} alt={`Keyframe for ${scene.title}`} className="rounded-lg w-full aspect-video object-cover border border-gray-600"/>
                        )}
                    </div>
                )}
                {generatedVideoUrl ? (
                    <div className="space-y-4">
                        <div className="relative">
                            <div className="absolute top-2 left-2 z-10 px-2 py-1 text-xs font-medium bg-green-600/90 text-white rounded-md shadow-lg">
                                ✓ Generated
                            </div>
                            <VideoPlayer src={generatedVideoUrl} />
                        </div>
                        <p className="text-xs text-gray-400 text-center">Video generated from keyframes via ComfyUI</p>
                    </div>
                ) : data.videoSrc ? (
                    <div className="space-y-4">
                        <VideoPlayer src={data.videoSrc} />
                         <button onClick={handleReset} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-yellow-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors">
                            <RefreshCwIcon className="w-4 h-4" /> Reset Analysis
                        </button>
                    </div>
                ) : isLoading ? (
                    <AnalysisLoadingIndicator />
                ) : (
                    <FileUpload onFileSelect={handleAnalysis} />
                )}
                {data.error && 
                    <div className="text-center mt-4">
                        <p className="text-sm text-red-400">{data.error}</p>
                         <button onClick={handleReset} className="mt-2 text-sm font-semibold text-yellow-400 hover:underline">Try Again</button>
                    </div>
                }
            </div>

            {/* Right Column: Feedback */}
            <div className="p-6 bg-gray-800/80">
                {data.continuityResult ? (
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-lg font-semibold text-amber-400 mb-4">Continuity Scores</h4>
                            <div className="text-center mb-4">
                               <ScoreCircle score={Math.round(continuityScore.overallScore * 100)} label="Overall Continuity" />
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                               <div className="text-center">
                                   <div className="text-gray-400">VB Consistency</div>
                                   <div className="text-lg font-bold text-blue-400">{Math.round(continuityScore.visualBibleConsistency * 100)}%</div>
                               </div>
                               <div className="text-center">
                                   <div className="text-gray-400">Structural</div>
                                   <div className="text-lg font-bold text-green-400">{Math.round(continuityScore.structuralContinuity! * 100)}%</div>
                               </div>
                               <div className="text-center">
                                   <div className="text-gray-400">Transitions</div>
                                   <div className="text-lg font-bold text-purple-400">{Math.round(continuityScore.transitionQuality! * 100)}%</div>
                               </div>
                               <div className="text-center">
                                   <div className="text-gray-400">Duration</div>
                                   <div className="text-lg font-bold text-orange-400">{Math.round(continuityScore.durationConsistency! * 100)}%</div>
                               </div>
                            </div>
                        </div>

                        {characterContinuityIssues.length > 0 && (
                            <div>
                                <h4 className="text-lg font-semibold text-red-400 mb-4">Character Continuity Issues</h4>
                                <div className="space-y-2">
                                    {characterContinuityIssues.map((issue, i) => (
                                        <div key={i} className="text-sm text-red-300 p-2 bg-red-900/20 rounded-md border border-red-800/30">
                                            {issue.message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <FeedbackCard title="Overall Feedback" content={data.continuityResult.overall_feedback} isLoading={false} />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-12">
                        <SparklesIcon className="w-12 h-12 mb-4 opacity-20" />
                        <p>Upload a video or generate one to see continuity analysis</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ContinuityCard;
