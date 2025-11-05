import React, { useState, useEffect, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import VideoPlayer from './components/VideoPlayer';
import TimelineEditor from './components/TimelineEditor';
import AnalyzeButton from './components/AnalyzeButton';
import FeedbackCard from './components/FeedbackCard';
import CoDirector from './components/CoDirector';
import ExamplePrompts from './components/ExamplePrompts';
import { extractFramesFromVideo } from './utils/videoUtils';
import { analyzeVideoFrames, getCoDirectorSuggestions, generateRemixPrompt } from './services/geminiService';
import { Shot, ShotEnhancers, AnalysisResult, CoDirectorResult, Suggestion, TimelineData, ToastMessage } from './types';
import { ProcessingStage } from './components/ProgressBar';
import Toast from './components/Toast';
import WorkflowTracker, { WorkflowStage } from './components/WorkflowTracker';

const RemixPromptModal: React.FC<{ prompt: string; onClose: () => void }> = ({ prompt, onClose }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <h3 className="text-lg font-bold text-green-400 mb-4">Final Remix Prompt</h3>
                    <div className="bg-gray-900 p-4 rounded-md max-h-60 overflow-y-auto text-gray-300 text-sm whitespace-pre-wrap font-mono select-all">
                        {prompt}
                    </div>
                    <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
                        <button onClick={handleCopy} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${copied ? 'bg-green-700 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                            {copied ? 'Copied!' : 'Copy to Clipboard'}
                        </button>
                        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

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

    // Final Remix State
    const [finalRemixPrompt, setFinalRemixPrompt] = useState<string | null>(null);
    const [isRemixing, setIsRemixing] = useState(false);

    // UI State
    const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
    const [processingStatus, setProcessingStatus] = useState('');
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [workflowStage, setWorkflowStage] = useState<WorkflowStage>('upload');


    useEffect(() => {
        if (videoFile) {
            const url = URL.createObjectURL(videoFile);
            setVideoSrc(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [videoFile]);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);

    const handleFileSelect = useCallback((file: File) => {
        setVideoFile(file);
        // Reset previous results when a new file is selected
        setAnalysisResult(null);
        setCoDirectorResult(null);
        setShots([]);
        setShotEnhancers({});
        setTransitions([]);
        setWorkflowStage('analyze');
        addToast(`Selected video: ${file.name}`, 'info');
    }, [addToast]);

    const handleAnalyzeClick = useCallback(async () => {
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
            setWorkflowStage('direct');

        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Analysis Failed: ${errorMessage}`, 'error');
            setWorkflowStage('analyze'); // Revert to analyze on failure
        } finally {
            setIsLoading(false);
            setProcessingStage('idle');
            setProcessingStatus('');
        }
    }, [videoFile, addToast]);

    const handleGetCoDirectorSuggestions = useCallback(async (objective: string) => {
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
    }, [shots, transitions, addToast]);
    
    const handleApplySuggestion = useCallback((suggestion: Suggestion) => {
        console.log("Applying suggestion:", suggestion);
        switch (suggestion.type) {
            case 'UPDATE_SHOT':
                if (suggestion.shot_id) {
                    if (suggestion.payload.description) {
                        setShots(prev => prev.map(shot => shot.id === suggestion.shot_id ? { ...shot, description: suggestion.payload.description as string } : shot));
                    }
                    if (suggestion.payload.enhancers) {
                         setShotEnhancers(prev => ({...prev, [suggestion.shot_id as string]: { ...prev[suggestion.shot_id as string], ...suggestion.payload.enhancers }}));
                    }
                }
                break;
            case 'ADD_SHOT_AFTER':
                if (suggestion.after_shot_id && suggestion.payload.description) {
                    const newShot: Shot = { id: `shot_${Date.now()}`, title: suggestion.payload.title || 'New Scene', description: suggestion.payload.description };
                    setShots(prevShots => {
                        const index = prevShots.findIndex(s => s.id === suggestion.after_shot_id);
                        if (index > -1) {
                            const newShots = [...prevShots];
                            newShots.splice(index + 1, 0, newShot);
                            return newShots;
                        }
                        return prevShots;
                    });
                    setTransitions(prevTransitions => {
                         const index = shots.findIndex(s => s.id === suggestion.after_shot_id);
                         if (index > -1) {
                            const newTransitions = [...prevTransitions];
                            newTransitions.splice(index + 1, 0, 'Cut');
                            return newTransitions;
                         }
                         return prevTransitions;
                    });
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
    }, [addToast, shots]);

    const handleSaveTimeline = useCallback(() => {
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
    }, [shots, shotEnhancers, transitions, negativePrompt, addToast]);
    
    const handleLoadTimeline = useCallback(() => {
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
                        setVideoFile(null);
                        setVideoSrc('');
                        setAnalysisResult(null);
                        setCoDirectorResult(null);
                        setWorkflowStage('direct');
                        addToast('Timeline loaded!', 'success');
                    } catch (err) {
                        addToast('Failed to load timeline. Invalid file format.', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }, [addToast]);

    const handleGenerateRemix = useCallback(async () => {
        if (shots.length === 0) {
            addToast('Cannot generate a remix from an empty timeline.', 'error');
            return;
        }
        setIsRemixing(true);
        setFinalRemixPrompt(null);
        try {
            const timelineData: TimelineData = { shots, shotEnhancers, transitions, negativePrompt };
            const prompt = await generateRemixPrompt(timelineData);
            setFinalRemixPrompt(prompt);
            addToast('Remix prompt generated!', 'success');
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Remix Failed: ${errorMessage}`, 'error');
        } finally {
            setIsRemixing(false);
        }
    }, [shots, shotEnhancers, transitions, negativePrompt, addToast]);

    const handleCloseCoDirector = useCallback(() => setCoDirectorResult(null), []);
    const handleCloseRemixModal = useCallback(() => setFinalRemixPrompt(null), []);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Toast toasts={toasts} removeToast={removeToast} />
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
                        Cinematic Action Remixer
                    </h1>
                    <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
                        An AI-powered workflow to break down, enhance, and remix video action sequences.
                    </p>
                </header>
                
                <WorkflowTracker currentStage={workflowStage} />

                {workflowStage === 'upload' && (
                    <div className="max-w-4xl mx-auto mt-12 fade-in">
                        <FileUpload onFileSelect={handleFileSelect} />
                    </div>
                )}
                
                {workflowStage !== 'upload' && (
                    <div className="fade-in">
                        {videoSrc && (
                             <div className="max-w-4xl mx-auto">
                                <VideoPlayer src={videoSrc} />
                            </div>
                        )}
                        
                        {workflowStage === 'analyze' && (
                            <AnalyzeButton onClick={handleAnalyzeClick} isLoading={isLoading} disabled={!videoFile} />
                        )}

                        {(workflowStage === 'direct' || workflowStage === 'refine') && (
                             <div className="mt-8 space-y-12">
                                <section id="analysis-results">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <FeedbackCard title="Cinematic Breakdown" content={analysisResult?.feedback || null} isLoading={isLoading} />
                                        <FeedbackCard title="Generative Prompt" content={analysisResult ? `\`\`\`\n${analysisResult.improvement_prompt}\n\`\`\`` : null} isLoading={isLoading} />
                                    </div>
                                </section>

                                <section id="co-director">
                                     <CoDirector
                                        onGetSuggestions={handleGetCoDirectorSuggestions}
                                        isLoading={isCoDirectorLoading}
                                        result={coDirectorResult}
                                        onApplySuggestion={handleApplySuggestion}
                                        onClose={handleCloseCoDirector}
                                    />
                                </section>
                                
                                <section id="timeline-editor" onFocus={() => setWorkflowStage('refine')} onMouseEnter={() => setWorkflowStage('refine')}>
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
                                        onGenerateRemix={handleGenerateRemix}
                                        isRemixing={isRemixing}
                                    />
                                </section>

                                <section id="examples">
                                    <ExamplePrompts />
                                </section>
                             </div>
                        )}
                    </div>
                )}

                {finalRemixPrompt && (
                    <RemixPromptModal prompt={finalRemixPrompt} onClose={handleCloseRemixModal} />
                )}

            </main>
             <footer className="text-center py-6 text-gray-600 text-sm">
                <p>Powered by Google Gemini. Built for demonstration purposes.</p>
            </footer>
        </div>
    );
};

export default App;
