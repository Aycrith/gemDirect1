import React from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage, Suggestion } from '../types';
import { extractFramesFromVideo } from '../utils/videoUtils';

import FileUpload from './FileUpload';
import VideoPlayer from './VideoPlayer';
import FeedbackCard from './FeedbackCard';
import { marked } from 'marked';
import SparklesIcon from './icons/SparklesIcon';
import FilmIcon from './icons/FilmIcon';
import ImageIcon from './icons/ImageIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';
import BookOpenIcon from './icons/BookOpenIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';
import { useVisualBible } from '../utils/hooks';
import { getSceneVisualBibleContext, computeSceneContinuityScore, CharacterContinuityIssue } from '../services/continuityVisualContext';
import { checkCoherenceGate } from '../utils/coherenceGate';

interface ContinuityCardProps {
  scene: Scene;
  sceneNumber: number;
  storyBible: StoryBible;
  narrativeContext: string;
  directorsVision: string;
  generatedImage: string;
  data: SceneContinuityData;
  setContinuityData: (updater: (prev: SceneContinuityData) => SceneContinuityData | SceneContinuityData) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onApiStateChange: (status: any, message: string) => void;
  onApiLog: (log: any) => void;
  onApplySuggestion: (suggestion: Suggestion, sceneId: string) => void;
  isRefined: boolean;
  onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
  onExtendTimeline: (sceneId: string, lastFrame: string) => void;
  allSceneIds: string[];
  allScenes: Scene[];
  onRerunScene?: (sceneId: string) => void;
  characterContinuityIssues?: CharacterContinuityIssue[];
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
  onApplySuggestion,
  isRefined,
  onUpdateSceneSummary,
  onExtendTimeline,
  allSceneIds,
  allScenes,
  onRerunScene,
  characterContinuityIssues = []
}) => {
    const { analyzeVideoFrames, getPrunedContextForContinuity, scoreContinuity } = usePlanExpansionActions();
    const { visualBible } = useVisualBible();

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
      setContinuityData(prev => ({ ...prev, frames }));
    const analysis = await analyzeVideoFrames(frames, onApiLog, onApiStateChange);
      setContinuityData(prev => ({ ...prev, videoAnalysis: analysis, status: 'scoring' }));

      const visualBibleContext = getSceneVisualBibleContext(visualBible, scene.id);
      const extendedNarrativeContext = narrativeContext + (visualBibleContext.styleBoards.length > 0 ? `\n\nVisual Bible Context:\n- Style Boards: ${visualBibleContext.styleBoards.join(', ')}\n- Tags: ${visualBibleContext.tags.join(', ')}` : '');
      const context = await getPrunedContextForContinuity(storyBible, extendedNarrativeContext, scene, directorsVision, onApiLog, onApiStateChange);
      const result = await scoreContinuity(context, scene, analysis, onApiLog, onApiStateChange);
      setContinuityData(prev => ({ ...prev, continuityResult: result, status: 'complete' }));

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


  const createMarkup = (markdown: string) => {
    const rawMarkup = marked.parse(markdown);
    return { __html: rawMarkup as string };
  };

  const isLoading = data.status === 'analyzing' || data.status === 'scoring';

  const timelineChanges = data.continuityResult?.suggested_changes.filter(s =>
    s.type === 'UPDATE_SHOT' || s.type === 'ADD_SHOT_AFTER' || s.type === 'UPDATE_TRANSITION'
  ) || [];

  const projectChanges = data.continuityResult?.suggested_changes.filter(s =>
    s.type === 'UPDATE_STORY_BIBLE' || s.type === 'UPDATE_DIRECTORS_VISION' || s.type === 'FLAG_SCENE_FOR_REVIEW'
  ) || [];


  return (
    <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/80 rounded-xl shadow-lg overflow-hidden">
        <header className="p-6 bg-gray-900/40 border-b border-gray-700/80">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white">Scene {sceneNumber}: {scene.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{scene.summary}</p>
                    {(() => {
                        const visualBibleContext = getSceneVisualBibleContext(visualBible, scene.id);
                        return visualBibleContext.styleBoards.length > 0 ? (
                            <div className="mt-2 text-xs text-gray-500">
                                <span className="font-medium text-indigo-400">Visual Bible:</span> {visualBibleContext.styleBoards.join(', ')}
                                {visualBibleContext.tags.length > 0 && ` (${visualBibleContext.tags.join(', ')})`}
                            </div>
                        ) : null;
                    })()}
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
                        <img src={`data:image/jpeg;base64,${generatedImage}`} alt={`Keyframe for ${scene.title}`} className="rounded-lg w-full aspect-video object-cover border border-gray-600"/>
                    </div>
                )}
                {data.videoSrc ? (
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
                        
                        {projectChanges.length > 0 && (
                            <div>
                                <h4 className="flex items-center text-lg font-semibold text-yellow-400 mb-4"><BookOpenIcon className="w-5 h-5 mr-2" /> Project-Wide Refinements</h4>
                                <p className="text-xs text-yellow-500/80 mb-3 p-2 bg-yellow-900/20 rounded-md border border-yellow-800/30">
                                    These high-level suggestions aim to fix the root cause of continuity issues by updating core documents like your Story Bible. Applying them ensures your entire project remains coherent and may flag other scenes for review.
                                </p>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 -mr-2">
                                    {projectChanges.map((s, i) => (
                                        <div key={`proj-${i}`} className="bg-yellow-900/40 border border-yellow-700/50 p-3 rounded-md flex items-center justify-between gap-4">
                                            <p className="text-sm text-yellow-200 flex-1">{s.description}</p>
                                            <button onClick={() => onApplySuggestion(s, scene.id)} className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-yellow-600 text-white hover:bg-yellow-700">Apply</button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4">
                                    <button 
                                        onClick={() => {
                                            // Apply all project-wide changes
                                            projectChanges.forEach(s => onApplySuggestion(s, scene.id));
                                        }} 
                                        className="w-full px-4 py-2 text-sm font-medium text-yellow-300 bg-yellow-900/30 border border-yellow-700/50 rounded-md hover:bg-yellow-900/50 transition-colors"
                                    >
                                        Apply to Story Bible
                                    </button>
                                </div>
                            </div>
                        )}

                        {timelineChanges.length > 0 && (
                             <div>
                                <h4 className="flex items-center text-lg font-semibold text-amber-400 mb-4"><SparklesIcon className="w-5 h-5 mr-2" /> Timeline Refinements</h4>
                                 <p className="text-xs text-amber-400/80 mb-3 p-2 bg-amber-900/20 rounded-md border border-amber-800/30">
                                    These suggestions are specific to this scene's timeline. Apply them to improve the pacing, visuals, and storytelling of this individual scene.
                                 </p>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 -mr-2">
                                    {timelineChanges.map((s, i) => (
                                        <div key={`time-${i}`} className="bg-gray-900/70 p-3 rounded-md flex items-center justify-between gap-4">
                                            <p className="text-sm text-gray-300 flex-1">{s.description}</p>
                                            <button onClick={() => onApplySuggestion(s, scene.id)} className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-amber-600 text-white hover:bg-amber-700">Apply</button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 space-y-2">
                                    <button 
                                        onClick={() => {
                                            // Apply all timeline changes
                                            timelineChanges.forEach(s => onApplySuggestion(s, scene.id));
                                        }} 
                                        className="w-full px-4 py-2 text-sm font-medium text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-md hover:bg-amber-900/50 transition-colors"
                                    >
                                        Apply All Timeline Fixes
                                    </button>
                                    {isRefined && (
                                        <button 
                                            onClick={() => onUpdateSceneSummary(scene.id)} 
                                            className="w-full px-4 py-2 text-sm font-medium text-yellow-300 bg-yellow-900/30 border border-yellow-700/50 rounded-md hover:bg-yellow-900/50 transition-colors"
                                        >
                                            Update Scene Summary with Refinements
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {data.frames && data.frames.length > 0 && (
                             <button onClick={() => onExtendTimeline(scene.id, data.frames![data.frames!.length - 1])} className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-yellow-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors">
                               <FilmIcon className="w-4 h-4" /> Extend Timeline from this Scene
                            </button>
                        )}

                        {/* Coherence Gate: Mark as Final */}
                        {(() => {
                            const coherenceCheck = checkCoherenceGate(data);
                            return (
                                <div className="mt-6 pt-6 border-t border-gray-700" data-testid="coherence-gate">
                                    <div className={`p-4 rounded-lg border ${
                                        coherenceCheck.passed 
                                            ? 'bg-green-900/20 border-green-700/50' 
                                            : 'bg-amber-900/20 border-amber-700/50'
                                    }`}>
                                        <div className="flex items-start gap-3 mb-3">
                                            <CheckCircleIcon className={`w-5 h-5 mt-0.5 ${
                                                coherenceCheck.passed ? 'text-green-400' : 'text-amber-400'
                                            }`} />
                                            <div className="flex-1">
                                                <h5 className={`font-semibold mb-1 ${
                                                    coherenceCheck.passed ? 'text-green-300' : 'text-amber-300'
                                                }`}>
                                                    Coherence Gate: {coherenceCheck.passed ? 'Passed' : 'Not Met'}
                                                </h5>
                                                <p className="text-sm text-gray-300">{coherenceCheck.message}</p>
                                                {!coherenceCheck.passed && (
                                                    <div className="mt-2 text-xs text-gray-400 p-2 bg-gray-900/40 rounded">
                                                        <strong>Threshold:</strong> {(coherenceCheck.threshold * 100).toFixed(0)}% required
                                                        {coherenceCheck.score > 0 && (
                                                            <> | <strong>Current:</strong> {(coherenceCheck.score * 100).toFixed(0)}%</>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (coherenceCheck.passed) {
                                                    setContinuityData(prev => ({ ...prev, isAccepted: true }));
                                                    addToast(`Scene "${scene.title}" marked as final!`, 'success');
                                                } else {
                                                    addToast(coherenceCheck.message, 'error');
                                                }
                                            }}
                                            disabled={!coherenceCheck.passed}
                                            className={`w-full px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                                                coherenceCheck.passed
                                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                            }`}
                                            data-testid="btn-mark-as-final"
                                        >
                                            {data.isAccepted ? '✓ Scene Finalized' : coherenceCheck.passed ? 'Mark Scene as Final' : 'Improve Score to Finalize'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    <FeedbackCard title="Analysis & Feedback" content={data.videoAnalysis} isLoading={isLoading} />
                )}
            </div>
        </div>
    </div>
  );
};

export default ContinuityCard;