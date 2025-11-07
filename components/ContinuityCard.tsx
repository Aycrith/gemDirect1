import React, { useCallback } from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage, ContinuityResult, Suggestion } from '../types';
import { extractFramesFromVideo } from '../utils/videoUtils';
import { analyzeVideoFrames, scoreContinuity, getPrunedContextForContinuity, ApiStateChangeCallback, ApiLogCallback } from '../services/geminiService';
import FileUpload from './FileUpload';
import VideoPlayer from './VideoPlayer';
import { marked } from 'marked';
import SparklesIcon from './icons/SparklesIcon';
import FilmIcon from './icons/FilmIcon';

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
  onApplyTimelineSuggestion: (suggestion: Suggestion, sceneId: string) => void;
  isRefined: boolean;
  onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
  onExtendTimeline: (sceneId: string, lastFrame: string) => void;
}

const ScoreCircle: React.FC<{ label: string; score: number }> = ({ label, score }) => {
  const percentage = score * 10;
  const circumference = 2 * Math.PI * 27.5; // 2 * pi * r
  const offset = circumference - (percentage / 100) * circumference;
  
  let colorClass = 'text-green-400';
  let shadowColor = 'shadow-green-500/50';
  if (score < 7) { colorClass = 'text-yellow-400'; shadowColor = 'shadow-yellow-500/50'; }
  if (score < 4) { colorClass = 'text-red-400'; shadowColor = 'shadow-red-500/50'; }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-28 h-28">
         <svg className="w-full h-full" viewBox="0 0 60 60">
            <defs>
                <filter id={`glow-${label.replace(/\s+/g, '-')}`}>
                    <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor={colorClass.includes('green') ? '#34d399' : colorClass.includes('yellow') ? '#fbbf24' : '#f87171'} />
                </filter>
            </defs>
          <circle className="text-gray-700/50" strokeWidth="5" stroke="currentColor" fill="transparent" r="27.5" cx="30" cy="30" />
          <circle
            className={colorClass}
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="27.5"
            cx="30"
            cy="30"
            style={{ 
                transform: 'rotate(-90deg)', 
                transformOrigin: 'center', 
                transition: 'stroke-dashoffset 0.5s ease-out',
                filter: `url(#glow-${label.replace(/\s+/g, '-')})`
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/20 rounded-full">
          <span className={`text-3xl font-bold ${colorClass}`}>{score}</span>
          <span className={`text-sm font-semibold opacity-70 mt-1 ${colorClass}`}>/10</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-gray-400 mt-2 max-w-[80px]">{label}</span>
    </div>
  );
};

const ResultDisplay: React.FC<{ 
    result: ContinuityResult;
    sceneId: string;
    isRefined: boolean;
    onApplyTimelineSuggestion: (suggestion: Suggestion, sceneId: string) => void;
    onUpdateSceneSummary: (sceneId: string) => Promise<boolean>;
    onExtendTimeline: () => void;
}> = ({ result, sceneId, isRefined, onApplyTimelineSuggestion, onUpdateSceneSummary, onExtendTimeline }) => {
    const [applyingStatus, setApplyingStatus] = React.useState<Record<number, 'idle' | 'loading' | 'applied'>>({});
    const [isUpdatingSummary, setIsUpdatingSummary] = React.useState(false);

    const handleApply = (suggestion: Suggestion, index: number) => {
        setApplyingStatus(prev => ({ ...prev, [index]: 'applied' }));
        onApplyTimelineSuggestion(suggestion, sceneId);
    };

    const handleUpdateSummary = async () => {
        setIsUpdatingSummary(true);
        await onUpdateSceneSummary(sceneId);
        setIsUpdatingSummary(false);
    }

    const createMarkup = (markdown: string) => {
        const rawMarkup = marked(markdown, { breaks: true });
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
                    {result.suggested_changes.map((suggestion, index) => {
                        const status = applyingStatus[index] || 'idle';
                        return (
                        <div key={index} className="bg-gray-900/50 p-3 rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <p className="text-sm text-gray-300 flex-grow">{suggestion.description}</p>
                            <button
                                onClick={() => handleApply(suggestion, index)}
                                disabled={status !== 'idle'}
                                className="w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-md transition-colors bg-yellow-600 text-white hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                {status === 'applied' ? 'Applied ✓' : 'Apply Refinement'}
                            </button>
                        </div>
                    )})}
                </div>
            </div>

            {isRefined && (
                 <div className="mt-4 pt-4 border-t border-gray-700 text-center bg-indigo-900/30 p-4 rounded-lg">
                     <h4 className="font-semibold text-indigo-300">Learning & Improvement</h4>
                     <p className="text-sm text-gray-400 my-2">Incorporate these timeline changes back into the high-level scene summary to improve future AI suggestions.</p>
                     <button
                        onClick={handleUpdateSummary}
                        disabled={isUpdatingSummary}
                        className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-full transition-colors bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-wait"
                    >
                        {isUpdatingSummary ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Updating...
                            </>
                        ) : (
                             <>
                                <SparklesIcon className="w-4 h-4 mr-2"/>
                                Update Scene Summary with AI
                             </>
                        )}
                    </button>
                 </div>
            )}
             <div className="mt-4 pt-4 border-t border-gray-700 text-center">
                <button
                    onClick={onExtendTimeline}
                    className="inline-flex items-center justify-center px-6 py-3 bg-green-600 text-white font-semibold rounded-full shadow-lg transition-all duration-300 ease-in-out hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-500 focus:ring-opacity-50 transform hover:scale-105"
                >
                    <FilmIcon className="mr-3 h-5 w-5" />
                    Extend Timeline
                </button>
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
  onApplyTimelineSuggestion,
  isRefined,
  onUpdateSceneSummary,
  onExtendTimeline,
}) => {

  const handleFileSelect = useCallback(async (file: File) => {
    setContinuityData({ videoFile: file, videoSrc: URL.createObjectURL(file), status: 'analyzing', error: undefined, frames: [] });

    try {
        const frames = await extractFramesFromVideo(file);
        if (frames.length === 0) throw new Error("Could not extract frames from video.");
        
        setContinuityData(prev => ({ ...prev!, frames: frames }));

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

  const handleExtend = () => {
    if (data.frames && data.frames.length > 0) {
        onExtendTimeline(scene.id, data.frames[data.frames.length - 1]);
    } else {
        addToast("Cannot extend: no frames available from the last video.", "error");
    }
  }

  const renderStatus = () => {
      if (data.status === 'idle') {
          return (
            <div className="h-full flex flex-col justify-center">
                <FileUpload onFileSelect={handleFileSelect} />
            </div>
          );
      }
      if (data.status === 'analyzing') {
          return <div className="text-center p-8"><p className="text-gray-400 animate-pulse">Analyzing video frames...</p></div>;
      }
      if (data.status === 'scoring') {
          return <div className="text-center p-8"><p className="text-gray-400 animate-pulse">AI is scoring cinematic continuity...</p></div>;
      }
      if (data.status === 'error') {
          return <div className="text-center p-8"><p className="text-red-400">{data.error}</p> <button onClick={() => setContinuityData({ status: 'idle' })} className="mt-2 text-sm text-indigo-400 hover:underline">Try again</button></div>
      }
      if (data.status === 'complete' && data.continuityResult) {
          return <ResultDisplay 
                    result={data.continuityResult} 
                    sceneId={scene.id}
                    onApplyTimelineSuggestion={onApplyTimelineSuggestion}
                    isRefined={isRefined}
                    onUpdateSceneSummary={onUpdateSceneSummary}
                    onExtendTimeline={handleExtend}
                />;
      }
      return null;
  }

  return (
    <div className="bg-gray-900/40 ring-1 ring-gray-700/80 rounded-xl shadow-lg">
        <header className="p-5 border-b border-gray-700/80 rounded-t-xl bg-gray-800/30">
            <h3 className="font-extrabold text-2xl text-white">
                <span className="text-indigo-400">Scene {sceneNumber}:</span> {scene.title}
            </h3>
            <p className="text-sm text-gray-400 mt-1">{scene.summary}</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left Column: Intent */}
            <div className="p-5 space-y-4 border-r-0 lg:border-r border-gray-700/80">
                <h4 className="font-semibold text-gray-200 text-lg">Creative Intent</h4>
                <div>
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider font-semibold">Scene Keyframe</p>
                    {generatedImage ? (
                        <img src={`data:image/jpeg;base64,${generatedImage}`} alt={`Keyframe for ${scene.title}`} className="rounded-lg w-full aspect-video object-cover ring-1 ring-gray-700" />
                    ) : (
                        <div className="aspect-video bg-gray-800/50 flex items-center justify-center rounded-lg">
                            <p className="text-xs text-gray-500">No keyframe generated</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Result */}
            <div className="bg-gray-800/20 p-5 flex flex-col rounded-b-xl lg:rounded-r-xl lg:rounded-bl-none">
                 <h4 className="font-semibold text-gray-200 text-lg mb-4">Actual Output &amp; Analysis</h4>
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