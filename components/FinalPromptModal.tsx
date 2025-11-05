import React from 'react';
import SparklesIcon from './icons/SparklesIcon';
import VideoPlayer from './VideoPlayer';
import FilmIcon from './icons/FilmIcon';

interface VideoResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    status: string;
    videoUrl: string | null;
    error: string | null;
    nextSceneTitle?: string | null;
    onContinue: () => void;
}

const VideoResultModal: React.FC<VideoResultModalProps> = ({
    isOpen,
    onClose,
    status,
    videoUrl,
    error,
    nextSceneTitle,
    onContinue
}) => {
    if (!isOpen) return null;

    const isGenerating = status !== 'idle' && status !== 'success' && status !== 'error';

    const renderContent = () => {
        if (error) {
            return (
                <div className="text-center">
                    <h4 className="font-bold text-red-400 mb-2">Generation Failed</h4>
                    <p className="text-sm text-gray-400 bg-gray-900/50 p-3 rounded-md">{error}</p>
                </div>
            );
        }

        if (videoUrl) {
            return <VideoPlayer src={videoUrl} />;
        }
        
        return (
            <div className="text-center p-8">
                 <svg className="animate-spin h-10 w-10 text-indigo-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-lg font-semibold text-gray-200 mt-4">{status}</p>
                <p className="text-sm text-gray-500 mt-2">This may take several minutes. Please don't close this tab.</p>
            </div>
        );
    };

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-dialog-title"
        >
            <div 
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <h3 id="video-dialog-title" className="flex items-center text-lg font-bold text-green-400 mb-4">
                        <SparklesIcon className="w-5 h-5 mr-2" />
                        {status === 'success' ? 'Scene Generation Complete!' : 'Generating Scene Video...'}
                    </h3>
                    
                    <div className="bg-gray-900/70 rounded-md border border-gray-600 min-h-[200px] flex items-center justify-center">
                       {renderContent()}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end items-center gap-4 p-4 bg-gray-800/50 border-t border-gray-700 rounded-b-lg">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors w-full sm:w-auto">
                        Close
                    </button>
                    {nextSceneTitle && videoUrl && (
                        <button 
                            type="button" 
                            onClick={onContinue}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <FilmIcon className="mr-2 h-5 w-5" />
                            Continue to: {nextSceneTitle}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoResultModal;