import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import VideoPlayer from './components/VideoPlayer';
import TimelineEditor from './components/TimelineEditor';
import AnalyzeButton from './components/AnalyzeButton';
import FeedbackCard from './components/FeedbackCard';
import CoDirector from './components/CoDirector';
import ExamplePrompts from './components/ExamplePrompts';
import { extractFramesFromVideo } from './utils/videoUtils';
import { analyzeVideoFrames, getCoDirectorSuggestions } from './services/geminiService';
import { Shot, ShotEnhancers, AnalysisResult, CoDirectorResult, Suggestion, TimelineData, ToastMessage } from './types';
import { ProcessingStage } from './components/ProgressBar';
import Toast from './components/Toast';

const App: React.FC = () => {
    // Video and analysis state
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoSrc, setVideoSrc] = useState<string>('');
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [coDirectorResult, setCoDirectorResult] = useState<CoDirectorResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isCoDirectorLoading, setIsCoDirectorLoading] = useState(false);
    
    // Timeline state
    const [shots, setShots] = useState<Shot[]>([]);
    const [shotEnhancers, setShotEnhancers] = useState<ShotEnhancers>({});
    const [transitions, setTransitions] = useState<string[]>([]);
    const [negativePrompt, setNegativePrompt] = useState('');
    const [suggestedNegativePrompts, setSuggestedNegativePrompts] = useState<string[]>(['shaky camera', 'blurry', 'low quality', 'watermark']);

    // UI State
    const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
    const [processingStatus, setProcessingStatus] = useState('');
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    useEffect(() => {
        if (videoFile) {
            const url = URL.createObjectURL(videoFile);
            setVideoSrc(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [videoFile]);

    const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    };

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    };

    const handleFileSelect = (file: File) => {
        setVideoFile(file);
        // Reset previous results when a new file is selected
        setAnalysisResult(null);
        setCoDirectorResult(null);
        setShots([]);
        setShotEnhancers({});
        setTransitions([]);
        addToast(`Selected video: ${file.name}`, 'info');
    };

    const handleAnalyzeClick = async () => {
        if (!videoFile) return;

        setIsLoading(true);
        setAnalysisResult(null);
        setProcessingStage('frames');
        setProcessingStatus('Extracting representative frames...');
        
        try {
            // Step 1: Extract frames. The function now intelligently decides how many frames to pull.
            const frames = await extractFramesFromVideo(videoFile, 1);
            if (frames.length === 0) {
                throw new Error("No frames were extracted from the video.");
            }
            setProcessingStage('shots');
            setProcessingStatus(`Analyzing ${frames.length} frames with Gemini...`);

            // Step 2: Analyze with Gemini, using all extracted frames.
            const result = await analyzeVideoFrames(frames);
            setAnalysisResult(result);
            setProcessingStage('suggestions');
            setProcessingStatus('Parsing cinematic timeline...');

            // Step 3: Parse the feedback into a timeline
            const shotDescriptions = result.feedback.split('\n').filter(line => line.trim().startsWith('Shot')).map(line => line.replace(/Shot \d+: /,'').trim());
            
            if (shotDescriptions.length === 0 && result.feedback) {
                 // Fallback for when the model doesn't follow the format perfectly but still gives a description.
                shotDescriptions.push(result.feedback);
            }

            const newShots: Shot[] = shotDescriptions.map((desc, index) => ({
                id: `shot_${Date.now()}_${index}`,
                title: `Scene ${index + 1}`,
                description: desc
            }));
            
            setShots(newShots);
            setTransitions(new Array(Math.max(0, newShots.length - 1)).fill('Cut'));
            setShotEnhancers({}); // Reset enhancers

            addToast('Analysis complete!', 'success');

        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Analysis Failed: ${errorMessage}`, 'error');
        } finally {
            setIsLoading(false);
            setProcessingStage('idle');
            setProcessingStatus('');
        }
    };

    const handleGetCoDirectorSuggestions = async (objective: string) => {
        if (shots.length === 0) {
            addToast('Please analyze a video first to create a timeline.', 'error');
            return;
        }
        setIsCoDirectorLoading(true);
        setCoDirectorResult(null);
        try {
            const result = await getCoDirectorSuggestions(shots, transitions, objective);
            setCoDirectorResult(result);
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to get suggestions: ${errorMessage}`, 'error');
        } finally {
            setIsCoDirectorLoading(false);
        }
    };
    
    const handleApplySuggestion = (suggestion: Suggestion) => {
        console.log("Applying suggestion:", suggestion);
        switch (suggestion.type) {
            case 'UPDATE_SHOT':
                if (suggestion.shot_id && suggestion.payload.description) {
                    setShots(prev => prev.map(shot => shot.id === suggestion.shot_id ? { ...shot, description: suggestion.payload.description as string } : shot));
                }
                if (suggestion.shot_id && suggestion.payload.enhancers) {
                     setShotEnhancers(prev => ({...prev, [suggestion.shot_id as string]: { ...prev[suggestion.shot_id as string], ...suggestion.payload.enhancers }}));
                }
                break;
            case 'ADD_SHOT_AFTER':
                if (suggestion.after_shot_id && suggestion.payload.description) {
                    const newShot: Shot = { id: `shot_${Date.now()}`, title: suggestion.payload.title || 'New Scene', description: suggestion.payload.description };
                    const index = shots.findIndex(s => s.id === suggestion.after_shot_id);
                    if (index > -1) {
                        const newShots = [...shots];
                        newShots.splice(index + 1, 0, newShot);
                        setShots(newShots);

                        const newTransitions = [...transitions];
                        newTransitions.splice(index + 1, 0, 'Cut');
                        setTransitions(newTransitions);
                    }
                }
                break;
            case 'UPDATE_TRANSITION':
                if (suggestion.transition_index !== undefined && suggestion.payload.type) {
                    setTransitions(prev => {
                        const newTransitions = [...prev];
                        if(newTransitions[suggestion.transition_index!]) {
                             newTransitions[suggestion.transition_index!] = suggestion.payload.type!;
                        }
                        return newTransitions;
                    });
                }
                break;
        }
         addToast('Suggestion applied!', 'success');
    };

    const handleSaveTimeline = () => {
        const timelineData: TimelineData = { shots, shotEnhancers, transitions, negativePrompt };
        const dataStr = JSON.stringify(timelineData, null, 2);
        const blob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timeline.json';
        a.click();
        URL.revokeObjectURL(url);
        addToast('Timeline saved!', 'success');
    };
    
    const handleLoadTimeline = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target?.result as string) as TimelineData;
                        setShots(data.shots || []);
                        setShotEnhancers(data.shotEnhancers || {});
                        setTransitions(data.transitions || []);
                        setNegativePrompt(data.negativePrompt || '');
                        addToast('Timeline loaded!', 'success');
                    } catch (err) {
                        addToast('Failed to load timeline. Invalid file format.', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Toast toasts={toasts} removeToast={removeToast} />
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
                        Cinematic Action Remixer
                    </h1>
                    <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
                        Upload a video, get an AI-powered cinematic breakdown, and remix it into a masterpiece.
                    </p>
                </header>

                <div className="max-w-4xl mx-auto">
                    {!videoSrc ? (
                         <FileUpload onFileSelect={handleFileSelect} />
                    ) : (
                        <VideoPlayer src={videoSrc} />
                    )}
                </div>

                {videoFile && (
                    <AnalyzeButton onClick={handleAnalyzeClick} isLoading={isLoading} />
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 my-8">
                    <FeedbackCard title="Cinematic Breakdown" content={analysisResult?.feedback || null} isLoading={isLoading} />
                    <FeedbackCard title="Generative Prompt" content={analysisResult ? `\`\`\`\n${analysisResult.improvement_prompt}\n\`\`\`` : null} isLoading={isLoading} />
                </div>
                
                <TimelineEditor
                    shots={shots}
                    setShots={setShots}
                    shotEnhancers={shotEnhancers}
                    setShotEnhancers={setShotEnhancers}
                    transitions={transitions}
                    setTransitions={setTransitions}
                    isProcessing={isLoading}
                    processingStatus={processingStatus}
                    processingStage={processingStage}
                    onSaveTimeline={handleSaveTimeline}
                    onLoadTimeline={handleLoadTimeline}
                    negativePrompt={negativePrompt}
                    setNegativePrompt={setNegativePrompt}
                    suggestedNegativePrompts={suggestedNegativePrompts}
                />
                
                <CoDirector
                    onGetSuggestions={handleGetCoDirectorSuggestions}
                    isLoading={isCoDirectorLoading}
                    result={coDirectorResult}
                    onApplySuggestion={handleApplySuggestion}
                    onClose={() => setCoDirectorResult(null)}
                />

                <div className="mt-12">
                   <ExamplePrompts />
                </div>

            </main>
             <footer className="text-center py-6 text-gray-600 text-sm">
                <p>Powered by Google Gemini. Built for demonstration purposes.</p>
            </footer>
        </div>
    );
};

export default App;