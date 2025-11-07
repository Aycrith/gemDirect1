import React, { useCallback, useState } from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage, ContinuityResult } from '../types';
import { extractFramesFromVideo } from '../utils/videoUtils';
import { analyzeVideoFrames, scoreContinuity, getPrunedContextForContinuity, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import FileUpload from './FileUpload';
import VideoPlayer from './VideoPlayer';
import { marked } from 'marked';

interface ContinuityCardProps {
  scene: Scene;
  sceneNumber: number;
  storyBible: StoryBible;
  narrativeContext: string;
  directorsVision: string;
  generatedImage: string;
  data: SceneContinuityData;
  setContinuityData: (updater: React.SetStateAction<SceneContinuityData>) => void;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onApiStateChange: ApiStateChangeCallback;
  onApiLog: ApiLogCallback;
  onApplyRefinement: (directive: ContinuityResult['refinement_directives'][0], context: { scene: Scene }) => Promise<boolean>;
}

const ScoreCircle: React.FC<{ label: string; score: number }> = ({ label, score }) => {
  const percentage = score * 10;
  const circumference = 2 * Math.PI * 20; // 2 * pi * r
  const offset = circumference - (percentage / 100) * circumference;
  
  let colorClass = 'text-green-400';
  if (score < 7) colorClass = 'text-yellow-400';
  if (score < 4) colorClass = 'text-red-400';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full" viewBox="0 0 44 44">
          <circle className="text-gray-700" strokeWidth="4" stroke="currentColor" fill="transparent" r="20" cx="22" cy="22" />
          <circle
            className={colorClass}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="20"
            cx="22"
            cy="22"
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${colorClass}`}>{score}</span>
          <span className={`text-sm ${colorClass}`}>/10</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-gray-400 mt-2">{label}</span>
    </div>
  );
};

const ResultDisplay: React.FC<{ 
    result: ContinuityResult;
    onApplyRefinement: (directive: ContinuityResult['refinement_directives'][0]) => Promise<boolean>;
}> = ({ result, onApplyRefinement }) => {
    const [applyingStatus, setApplyingStatus] = useState<Record<number, 'idle' | 'loading' | 'applied'>>({});

    const handleApply = async (directive: ContinuityResult['refinement_directives'][0], index: number) => {
        setApplyingStatus(prev => ({ ...prev, [index]: 'loading' }));
        const success = await onApplyRefinement(directive);
        if (success) {
            setApplyingStatus(prev => ({ ...prev, [index]: 'applied' }));
        } else {
            setApplyingStatus(prev => ({ ...prev, [index]: 'idle' })); // Reset on failure
        }
    };

    const createMarkup = (markdown: string) => {
        const rawMarkup = marked(markdown);
        return { __html: rawMarkup };
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-around p-4 bg-gray-900/50 rounded-lg">
                <ScoreCircle label="Narrative Coherence" score={result.scores.narrative_coherence} />
                <ScoreCircle label="Aesthetic Alignment" score={result.scores.aesthetic_alignment} />
                <ScoreCircle label="Thematic Resonance" score={result.scores.thematic_resonance} />
            </div>
            <div>
                 <h4 className="font-semibold text-indigo-400 mb-2">Overall Feedback</h4>
                 <div className="prose prose-invert prose-sm max-w-none text-gray-300 bg-gray-900/50 p-3 rounded-md" dangerouslySetInnerHTML={createMarkup(result.overall_feedback)} />
            </div>
            <div>
                <h4 className="font-semibold text-yellow-400 mb-2">Actionable Refinement Directives</h4>
                 <div className="space-y-3">
                    {result.refinement_directives.map((dir, index) => {
                        const status = applyingStatus[index] || 'idle';
                        return (
                        <div key={index} className="bg-gray-900/50 p-3 rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                                <p className="text-sm text-gray-300">{dir.suggestion}</p>
                                <p className="text-xs text-yellow-500 mt-1">Target: <span className="font-mono bg-black/30 px-1 rounded">{dir.target} {dir.target_field && `-> ${dir.target_field}`}</span></p>
                            </div>
                            <button
                                onClick={() => handleApply(dir, index)}
                                disabled={status !== 'idle'}
                                className="w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-md transition-colors bg-yellow-600 text-white hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                {status === 'loading' && (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Applying...
                                    </>
                                )}
                                {status === 'applied' && 'Applied ✓'}
                                {status === 'idle' && 'Apply Refinement'}
                            </button>
                        </div>
                    )})}
                </div>
            </div>
        </div>
    );
};


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
  onApplyRefinement
}) => {

  const handleFileSelect = useCallback(async (file: File) => {
    setContinuityData({ videoFile: file, videoSrc: URL.createObjectURL(file), status: 'analyzing', error: undefined });

    try {
        const frames = await extractFramesFromVideo(file);
        if (frames.length === 0) throw new Error("Could not extract frames from video.");
        
        const analysis = await analyzeVideoFrames(frames, onApiLog, onApiStateChange);
        setContinuityData(prev => ({ ...prev!, videoAnalysis: analysis, status: 'scoring' }));

        const prunedContext = await getPrunedContextForContinuity(storyBible, narrativeContext, scene, directorsVision, onApiLog, onApiStateChange);
        const result = await scoreContinuity(prunedContext, scene, analysis, onApiLog, onApiStateChange);
        setContinuityData(prev => ({ ...prev!, continuityResult: result, status: 'complete' }));

        addToast(`Analysis complete for Scene ${sceneNumber}`, 'success');

    } catch (err) {
        const error = err instanceof Error ? err.message : 'An unknown error occurred.';
        setContinuityData(prev => ({ ...prev!, status: 'error', error }));
        addToast(`Analysis failed for Scene ${sceneNumber}: ${error}`, 'error');
    }
  }, [scene, sceneNumber, storyBible, narrativeContext, directorsVision, setContinuityData, addToast, onApiStateChange, onApiLog]);
  
  const handleApplyRefinementWrapper = (directive: ContinuityResult['refinement_directives'][0]) => {
      return onApplyRefinement(directive, { scene });
  };


  const renderStatus = () => {
      if (data.status === 'idle') {
          return <FileUpload onFileSelect={handleFileSelect} />;
      }
      if (data.status === 'analyzing') {
          return <div className="text-center p-8"><p className="text-gray-400 animate-pulse">Analyzing video frames...</p></div>;
      }
      if (data.status === 'scoring') {
          return <div className="text-center p-8"><p className="text-gray-400 animate-pulse">AI is scoring cinematic continuity...</p></div>;
      }
      if (data.status === 'error') {
          return <div className="text-center p-8"><p className="text-red-400">{data.error}</p></div>
      }
      if (data.status === 'complete' && data.continuityResult) {
          return <ResultDisplay result={data.continuityResult} onApplyRefinement={handleApplyRefinementWrapper} />;
      }
      return null;
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg shadow-lg">
        <header className="p-4 bg-gray-900/30 border-b border-gray-700 rounded-t-lg">
            <h3 className="font-bold text-xl text-white">
                <span className="text-indigo-400">Scene {sceneNumber}:</span> {scene.title}
            </h3>
            <p className="text-sm text-gray-400 mt-1">{scene.summary}</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-gray-700">
            {/* Left Column: Intent */}
            <div className="bg-gray-800 p-4 space-y-4">
                <h4 className="font-semibold text-gray-300">Creative Intent</h4>
                <div>
                    <p className="text-xs text-gray-500 mb-2">Last known keyframe for this scene</p>
                    {generatedImage ? (
                        <img src={`data:image/jpeg;base64,${generatedImage}`} alt={`Keyframe for ${scene.title}`} className="rounded-lg w-full aspect-video object-cover" />
                    ) : (
                        <div className="aspect-video bg-gray-900/50 flex items-center justify-center rounded-lg">
                            <p className="text-xs text-gray-500">No keyframe generated</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Result */}
            <div className="bg-gray-800 p-4 flex flex-col">
                 <h4 className="font-semibold text-gray-300 mb-4">Actual Output & Analysis</h4>
                 {data.videoSrc && (
                     <div className="mb-4">
                        <VideoPlayer src={data.videoSrc} />
                     </div>
                 )}
                 <div className="flex-grow flex flex-col justify-center">
                    {renderStatus()}
                 </div>
            </div>
        </div>
    </div>
  );
};

export default React.memo(ContinuityCard);