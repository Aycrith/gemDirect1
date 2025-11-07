

import React from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage, Suggestion } from '../types';
import { extractFramesFromVideo } from '../utils/videoUtils';
import { analyzeVideoFrames, getPrunedContextForContinuity, scoreContinuity } from '../services/geminiService';

import FileUpload from './FileUpload';
import VideoPlayer from './VideoPlayer';
import FeedbackCard from './FeedbackCard';
import { marked } from 'marked';
import SparklesIcon from './icons/SparklesIcon';
import FilmIcon from './icons/FilmIcon';
import ImageIcon from './icons/ImageIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';

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
  onApplyTimelineSuggestion: (suggestion: Suggestion, sceneId: string) => void;
  isRefined: boolean;
  onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
  onExtendTimeline: (sceneId: string, lastFrame: string) => void;
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
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-400"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <FilmIcon className="w-8 h-8 text-indigo-400" />
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
  onApplyTimelineSuggestion,
  isRefined,
  onUpdateSceneSummary,
  onExtendTimeline
}) => {
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

      const context = await getPrunedContextForContinuity(storyBible, narrativeContext, scene, directorsVision, onApiLog, onApiStateChange);
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

  return (
    <div className="bg-gray-800/50 backdrop-blur-md border border-gray-700/80 rounded-xl shadow-lg overflow-hidden">
        <header className="p-6 bg-gray-900/40 border-b border-gray-700/80">
            <h3 className="text-xl font-bold text-white">Scene {sceneNumber}: {scene.title}</h3>
            <p className="text-sm text-gray-400 mt-1">{scene.summary}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-700/80">
            {/* Left Column: Upload & Video */}
            <div className="p-6 bg-gray-800/80 min-h-[400px] flex flex-col justify-center space-y-4">
                {generatedImage && (
                    <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center"><ImageIcon className="w-4 h-4 mr-2 text-indigo-400" />Scene Keyframe</h4>
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
                            <h4 className="text-lg font-semibold text-indigo-400 mb-4">Continuity Scores</h4>
                            <div className="grid grid-cols-3 gap-4">
                               <ScoreCircle score={data.continuityResult.scores.narrative_coherence} label="Narrative" />
                               <ScoreCircle score={data.continuityResult.scores.aesthetic_alignment} label="Aesthetic" />
                               <ScoreCircle score={data.continuityResult.scores.thematic_resonance} label="Thematic" />
                            </div>
                        </div>
                        <FeedbackCard title="Overall Feedback" content={data.continuityResult.overall_feedback} isLoading={false} />
                        <div>
                            <h4 className="flex items-center text-lg font-semibold text-indigo-400 mb-4"><SparklesIcon className="w-5 h-5 mr-2" /> Suggested Refinements</h4>
                            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 -mr-2">
                                {data.continuityResult.suggested_changes.map((s, i) => (
                                    <div key={i} className="bg-gray-900/70 p-3 rounded-md flex items-center justify-between gap-4">
                                        <p className="text-sm text-gray-300 flex-1">{s.description}</p>
                                        <button onClick={() => onApplyTimelineSuggestion(s, scene.id)} className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-indigo-600 text-white hover:bg-indigo-700">Apply</button>
                                    </div>
                                ))}
                            </div>
                             {isRefined && <button onClick={() => onUpdateSceneSummary(scene.id)} className="text-sm text-yellow-400 mt-4">Update Scene Summary with Refinements</button>}
                        </div>
                        {data.frames && data.frames.length > 0 && (
                             <button onClick={() => onExtendTimeline(scene.id, data.frames![data.frames!.length - 1])} className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-yellow-300 bg-gray-700/50 border border-gray-600 rounded-full hover:bg-gray-700 transition-colors">
                               <FilmIcon className="w-4 h-4" /> Extend Timeline from this Scene
                            </button>
                        )}
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