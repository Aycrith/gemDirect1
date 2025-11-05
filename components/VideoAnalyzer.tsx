import React, { useState, useCallback } from 'react';
// FIX: Import `ApiLogCallback` and `ApiStateChangeCallback` types to satisfy function signature.
import { analyzeVideoFrames, ApiLogCallback, ApiStateChangeCallback } from '../services/geminiService';
import { extractFramesFromVideo } from '../utils/videoUtils';
import FileUpload from './FileUpload';
import VideoPlayer from './VideoPlayer';
import FeedbackCard from './FeedbackCard';

const VideoAnalyzer: React.FC = () => {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [frames, setFrames] = useState<string[]>([]);
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);

    // FIX: Add dummy callbacks to satisfy the analyzeVideoFrames function signature.
    // In a fully integrated app, these would typically come from a context provider.
    const dummyApiLogCallback: ApiLogCallback = (log) => { console.log('API call logged (dummy):', log); };
    const dummyApiStateChangeCallback: ApiStateChangeCallback = (status, message) => { console.log(`API state changed (dummy): ${status} - ${message}`); };

    const handleFileSelect = useCallback(async (file: File) => {
        // Reset state for new analysis
        setVideoFile(file);
        setVideoSrc(URL.createObjectURL(file));
        setFrames([]);
        setAnalysis(null);
        setError(null);
        setIsLoading(true);

        try {
            setLoadingMessage('Extracting frames from video (this may take a moment)...');
            const extractedFrames = await extractFramesFromVideo(file);
            if (extractedFrames.length === 0) {
                throw new Error("Could not extract any frames from the video. The file might be corrupted or in an unsupported format.");
            }
            setFrames(extractedFrames);
            
            setLoadingMessage('Analyzing video content with AI...');
            // FIX: Pass the required callbacks to the `analyzeVideoFrames` function.
            const videoAnalysis = await analyzeVideoFrames(extractedFrames, dummyApiLogCallback, dummyApiStateChangeCallback);
            setAnalysis(videoAnalysis);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during analysis.";
            console.error(err);
            setError(errorMessage);
            setAnalysis(`**Analysis Failed:**\n\n${errorMessage}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, []);

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {!videoFile && <FileUpload onFileSelect={handleFileSelect} />}

            {videoFile && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Video and Frames */}
                    <div className="space-y-6">
                        {videoSrc && <VideoPlayer src={videoSrc} />}
                        <div>
                            <h3 className="text-lg font-semibold text-gray-300 mb-3">Extracted Frames</h3>
                            {frames.length > 0 ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 bg-gray-800/50 p-2 rounded-lg">
                                    {frames.map((frame, index) => (
                                        <img
                                            key={index}
                                            src={`data:image/jpeg;base64,${frame}`}
                                            alt={`Frame ${index + 1}`}
                                            className="w-full aspect-video object-cover rounded"
                                        />
                                    ))}
                                </div>
                            ) : isLoading ? (
                                <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                                    <p className="text-sm text-gray-400">{loadingMessage}</p>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Right Column: Analysis */}
                    <div className="h-full">
                        <FeedbackCard 
                            title="AI Video Analysis"
                            content={analysis}
                            isLoading={isLoading}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoAnalyzer;