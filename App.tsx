
import React, { useState, useCallback, useEffect, useRef } from 'react';
import VideoPlayer from './components/VideoPlayer';
import FeedbackCard from './components/FeedbackCard';
import AnalyzeButton from './components/AnalyzeButton';
import FileUpload from './components/FileUpload';
import TimelineEditor from './components/TimelineEditor';
import NegativePromptSuggestions from './components/NegativePromptSuggestions';
import ExamplePrompts from './components/ExamplePrompts';
import { analyzeVideoAction, generateShotList, suggestEnhancementsForTimeline } from './services/geminiService';
import { extractFramesFromVideo } from './utils/videoUtils';
import { AnalysisResult, CreativeEnhancers, Shot, ShotEnhancers, TimelineData, ToastMessage } from './types';
import { ProcessingStage } from './components/ProgressBar';
import Toast from './components/Toast';

// Constants for the new loader's mapping logic
const FRAMING_OPTIONS = ["Bird's-Eye View", "Close-Up", "Cowboy Shot", "Establishing Shot", "Extreme Close-Up", "Full Shot", "High Angle", "Low Angle", "Medium Shot", "Over-the-Shoulder", "Point of View", "Two Shot", "Wide Shot", "Worm's-Eye View"];
const MOVEMENT_OPTIONS = ["Arc Shot", "Crane/Jib Shot", "Dolly Zoom", "Dutch Tilt", "Follow Shot", "Handheld", "Pan", "Pull Out", "Push In", "Static Shot", "Steadicam", "Tilt", "Tracking Shot", "Whip Pan", "Zoom In/Out"];
const TRANSITION_OPTIONS = ["Cut", "Dissolve", "Wipe", "Match Cut", "J-Cut", "L-Cut", "Whip Pan", "Glitch Effect", "Fade to Black"];


const App: React.FC = () => {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  // Timeline State
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotEnhancers, setShotEnhancers] = useState<ShotEnhancers>({});
  const [transitions, setTransitions] = useState<string[]>([]);
  
  // AI Suggestions State
  const [suggestedNegativePrompts, setSuggestedNegativePrompts] = useState<string[]>([]);
  const [negativePrompt, setNegativePrompt] = useState<string>('');

  // Loading States
  const [isProcessingVideo, setIsProcessingVideo] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');

  // UI State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const loadTimelineInputRef = useRef<HTMLInputElement>(null);

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
        removeToast(id);
    }, 5000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }


  useEffect(() => {
    let objectUrl: string | null = null;
    
    const processVideo = async (file: File) => {
        objectUrl = URL.createObjectURL(file);
        setVideoUrl(objectUrl);
        setIsProcessingVideo(true);
        setError(null);
        setAnalysisResult(null);

        try {
            setProcessingStage('frames');
            setProcessingStatus('Extracting key frames...');
            const frames = await extractFramesFromVideo(objectUrl, 3);
            
            setProcessingStage('shots');
            setProcessingStatus('Detecting shots...');
            const generatedShots = await generateShotList(frames);
            setShots(generatedShots);

            setProcessingStage('suggestions');
            setProcessingStatus('Generating AI creative suggestions...');
            const suggestions = await suggestEnhancementsForTimeline(generatedShots);
            
            // Defensive coding: ensure enhancers object is valid
            const validEnhancers = suggestions.shotEnhancers || {};
            for (const shotId in validEnhancers) {
                if(Object.prototype.hasOwnProperty.call(validEnhancers, shotId)) {
                    validEnhancers[shotId] = {
                        framing: validEnhancers[shotId]?.framing ?? [],
                        movement: validEnhancers[shotId]?.movement ?? [],
                        lens: validEnhancers[shotId]?.lens ?? [],
                        pacing: validEnhancers[shotId]?.pacing ?? [],
                        lighting: validEnhancers[shotId]?.lighting ?? [],
                        mood: validEnhancers[shotId]?.mood ?? [],
                        vfx: validEnhancers[shotId]?.vfx ?? [],
                        plotEnhancements: validEnhancers[shotId]?.plotEnhancements ?? [],
                    };
                }
            }
            setShotEnhancers(validEnhancers);
            setTransitions(suggestions.transitions || []);
            setSuggestedNegativePrompts(suggestions.negativePrompts || []);

        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred while analyzing the video.");
            }
        } finally {
            setIsProcessingVideo(false);
            setProcessingStatus('');
            setProcessingStage('idle');
        }
    };

    if (selectedFile) {
        processVideo(selectedFile);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedFile]);

  const handleFileSelect = (file: File) => {
    setAnalysisResult(null);
    setError(null);
    setShots([]);
    setShotEnhancers({});
    setTransitions([]);
    setNegativePrompt('');
    setSuggestedNegativePrompts([]);
    setSelectedFile(file);
  };
  
  const handleClearVideo = () => {
      setSelectedFile(null);
      setVideoUrl(null);
      setAnalysisResult(null);
      setError(null);
      setShots([]);
  }

  const handleAnalyze = useCallback(async () => {
    if (shots.length === 0) {
        setError("Cannot analyze without video shots.");
        return;
    }
      
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    try {
      const result = await analyzeVideoAction(shots, shotEnhancers, transitions, negativePrompt);
      setAnalysisResult(result);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [shots, shotEnhancers, transitions, negativePrompt]);

  const handleSaveTimeline = () => {
    try {
        const timelineData: TimelineData = {
            shots,
            shotEnhancers,
            transitions,
            negativePrompt,
        };
        const blob = new Blob([JSON.stringify(timelineData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cinematic_timeline_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addToast("Timeline saved successfully!", 'success');
    } catch (e) {
        console.error("Failed to save timeline:", e);
        addToast("Failed to save timeline.", 'error');
    }
  };

  const handleLoadTimeline = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result;
            if (typeof text !== 'string') throw new Error("File is not valid text.");
            
            const data = JSON.parse(text);
            
            // New "Siege of Alesia" format parser
            if (data.scenes && Array.isArray(data.scenes) && data.project_title) {
                const newShots: Shot[] = [];
                const newShotEnhancers: ShotEnhancers = {};

                const findBestMatch = (value: string, options: readonly string[]): string => {
                    if (!value) return '';
                    const cleanValue = value.toLowerCase().replace(/_/g, ' ').trim();
                    const exactMatch = options.find(opt => opt.toLowerCase() === cleanValue);
                    if (exactMatch) return exactMatch;

                    const valueWords = cleanValue.split(' ');
                    for (const option of options) {
                        const lowerOption = option.toLowerCase();
                        if (valueWords.some(word => lowerOption.includes(word))) {
                            return option;
                        }
                    }
                    return value.split(/_|\s/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                };
                
                const transitionTypeMap: Record<string, string> = {
                    crossfade: 'Dissolve', cinematic_dissolve: 'Dissolve', slow_fade_up: 'Dissolve',
                    flash_transition: 'Glitch Effect', fade_to_black: 'Fade to Black',
                };

                for (const scene of data.scenes) {
                    const descriptionParts: string[] = [];
                    if (scene.camera?.path) descriptionParts.push(`Path: ${scene.camera.path}.`);
                    if (scene.visuals?.environment) descriptionParts.push(`Environment: ${scene.visuals.environment}.`);
                    if (scene.visuals?.elements?.length) descriptionParts.push(`Elements: ${scene.visuals.elements.join(', ')}.`);
                    if (scene.visuals?.tone) descriptionParts.push(`Tone: ${scene.visuals.tone}.`);
                    
                    newShots.push({
                        id: scene.id,
                        title: scene.title,
                        description: descriptionParts.join(' ') || 'No description provided.',
                    });

                    const enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> = {};
                    if (scene.camera?.movement) enhancers.movement = [findBestMatch(scene.camera.movement, MOVEMENT_OPTIONS)];
                    if (scene.camera?.angle) enhancers.framing = [findBestMatch(scene.camera.angle, FRAMING_OPTIONS)];
                    if (scene.visuals?.lighting) enhancers.lighting = [scene.visuals.lighting];
                    if (scene.visuals?.fx) enhancers.vfx = Array.isArray(scene.visuals.fx) ? scene.visuals.fx : [scene.visuals.fx];
                    if (scene.visuals?.emotion) enhancers.mood = [scene.visuals.emotion];
                    
                    newShotEnhancers[scene.id] = Object.fromEntries(
                        Object.entries(enhancers).filter(([, v]) => v && v.length > 0 && v[0] !== '')
                    );
                }

                const newTransitions: string[] = [];
                // Fix: Correctly type the transition object from the loaded file and handle cases where transitions might be missing.
                // FIX: Explicitly type the Map to ensure `transition` is correctly typed as `Map.get()` can return `unknown` if types are not inferred.
                const transitionMap = new Map<string, { from: string; to: string; type: string; }>((data.transitions || []).map((t: { from: string; to: string; type: string; }) => [t.from, t]));
                for (let i = 0; i < newShots.length - 1; i++) {
                    const shotId = newShots[i].id;
                    const nextShotId = newShots[i + 1].id;
                    const transition = transitionMap.get(shotId);
                    
                    if (transition && transition.to === nextShotId) {
                        const mappedType = transitionTypeMap[transition.type] || findBestMatch(transition.type, TRANSITION_OPTIONS);
                        newTransitions.push(mappedType || 'Cut');
                    } else {
                        newTransitions.push('Cut');
                    }
                }

                setShots(newShots);
                setShotEnhancers(newShotEnhancers);
                setTransitions(newTransitions);
                setNegativePrompt(data.global_style?.join(', ') || '');
                
                addToast(`Loaded project: "${data.project_title}"`, 'success');

            // Original format parser
            } else if (data.shots && Array.isArray(data.shots) && typeof data.shotEnhancers === 'object') {
                setShots(data.shots);
                setShotEnhancers(data.shotEnhancers as ShotEnhancers);
                setTransitions(data.transitions ?? []);
                setNegativePrompt(data.negativePrompt ?? '');
                addToast("Timeline loaded successfully!", 'success');
            } else {
                 throw new Error("Invalid timeline file structure. The file is not a recognized format.");
            }
            
            setAnalysisResult(null);
            setError(null);

        } catch (err) {
            console.error("Failed to load timeline:", err);
            const message = err instanceof Error ? err.message : "Failed to load timeline. The file may be corrupted.";
            addToast(message, 'error');
        } finally {
             if(loadTimelineInputRef.current) {
                loadTimelineInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
};


  return (
    <div className="min-h-screen bg-gray-900 bg-grid-gray-700/[0.2] relative">
       <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-gray-900 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
        <Toast toasts={toasts} removeToast={removeToast} />
      <main className="container mx-auto px-4 py-8 sm:py-12 relative z-10">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Cinematic <span className="text-indigo-400">Video Analyzer</span>
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-400">
            Upload a short video. Our AI co-director will break it into shots and suggest a creative blueprint for the perfect remix prompt.
          </p>
        </header>

        <div className="max-w-4xl mx-auto">
            {!selectedFile ? (
                <FileUpload onFileSelect={handleFileSelect} />
            ) : videoUrl ? (
                <div>
                    <VideoPlayer src={videoUrl} />
                    <div className="text-center my-4">
                        <button 
                            onClick={handleClearVideo}
                            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                            Upload another video
                        </button>
                    </div>
                </div>
            ) : null}
        </div>

        { (selectedFile || shots.length > 0) && (
            <div className="max-w-4xl mx-auto">
                <input
                    type="file"
                    ref={loadTimelineInputRef}
                    onChange={handleLoadTimeline}
                    accept=".json"
                    className="hidden"
                    id="load-timeline-input"
                />
                <TimelineEditor
                  shots={shots}
                  setShots={setShots}
                  shotEnhancers={shotEnhancers}
                  setShotEnhancers={setShotEnhancers}
                  transitions={transitions}
                  setTransitions={setTransitions}
                  isProcessing={isProcessingVideo}
                  processingStatus={processingStatus}
                  processingStage={processingStage}
                  onSaveTimeline={handleSaveTimeline}
                  onLoadTimeline={() => loadTimelineInputRef.current?.click()}
                />

                <NegativePromptSuggestions
                  suggestions={suggestedNegativePrompts}
                  negativePrompt={negativePrompt}
                  setNegativePrompt={setNegativePrompt}
                />

                <AnalyzeButton 
                    onClick={handleAnalyze} 
                    isLoading={isLoading}
                    disabled={isProcessingVideo || shots.length === 0}
                />
            </div>
        )}
        
        {error && (
            <div className="my-4 p-4 max-w-4xl mx-auto bg-red-900/50 border border-red-700 text-red-200 rounded-lg text-center">
                <p><strong>Error:</strong> {error}</p>
            </div>
        )}
        
        { (analysisResult || isLoading || selectedFile || shots.length > 0) && (
             <div className="max-w-7xl mx-auto mt-8 space-y-8">
                { !analysisResult && !isLoading && (selectedFile || shots.length > 0) && <ExamplePrompts /> }

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <FeedbackCard 
                    title="Cinematic Feedback" 
                    content={analysisResult?.feedback ?? null} 
                    isLoading={isLoading}
                  />
                  <FeedbackCard 
                    title="Improvement & Remix Prompt" 
                    content={analysisResult?.improvement_prompt ?? null} 
                    isLoading={isLoading}
                  />
                </div>
            </div>
        )}
       
        <footer className="text-center mt-12 text-gray-500">
            <p>Powered by Google Gemini</p>
        </footer>
      </main>
    </div>
  );
};

export default App;
