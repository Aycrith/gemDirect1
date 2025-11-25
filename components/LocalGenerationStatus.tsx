import React, { useState, useEffect } from 'react';
import { LocalGenerationStatus as LocalGenerationStatusType } from '../types';
import ServerIcon from './icons/ServerIcon';

interface Props {
    status: LocalGenerationStatusType;
    onClear: () => void;
}

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full bg-gray-700 rounded-full h-2.5 my-1 relative overflow-hidden">
        <div 
            data-testid="local-generation-progress"
            className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }}
        ></div>
    </div>
);

/** Check if a string is a valid data URL for media */
const isValidMediaDataUrl = (data: string | undefined): boolean => {
    if (!data || typeof data !== 'string') return false;
    return data.startsWith('data:video/') || data.startsWith('data:image/');
};

const LocalGenerationStatus: React.FC<Props> = ({ status, onClear }) => {
    const [videoError, setVideoError] = useState<string | null>(null);
    
    // Reset video error when status changes
    useEffect(() => {
        if (status.status !== 'complete') {
            setVideoError(null);
        }
    }, [status.status]);
    
    if (status.status === 'idle') {
        return null;
    }

    const isLoading = status.status === 'queued' || status.status === 'running';
    
    // Validate data URL for final output
    const hasValidData = status.final_output && isValidMediaDataUrl(status.final_output.data);

    return (
        <div
            className="mb-6 p-4 bg-gray-900/50 border border-gray-700 rounded-lg fade-in"
            data-testid={`local-status-${status.status}`}
        >
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="flex items-center text-lg font-semibold text-gray-200">
                        <ServerIcon className={`w-5 h-5 mr-3 ${isLoading ? 'animate-pulse text-amber-400' : 'text-gray-400'}`} />
                        Local Generation Status
                    </h3>
                    <p className="text-sm text-amber-300 font-mono mt-1" data-testid="local-status-message">{status.message}</p>
                </div>
                {status.status === 'complete' || status.status === 'error' ? (
                     <button onClick={onClear} className="text-sm font-semibold text-gray-400 hover:text-white">Clear</button>
                ): null}
            </div>

            {(status.status === 'running' || (status.status === 'complete' && status.final_output)) && (
                <div className="mt-4">
                    {status.status === 'running' && <ProgressBar progress={status.progress} />}
                    {status.status === 'complete' && status.final_output && (
                        <div data-testid="local-generation-final-output">
                            <h4 className="text-md font-bold text-green-400 mb-2 text-center">Generation Complete</h4>
                            <div className="max-w-md mx-auto bg-black rounded-lg overflow-hidden shadow-lg border border-gray-600">
                                {!hasValidData ? (
                                    /* Error state: Invalid data URL */
                                    <div className="w-full aspect-video flex flex-col items-center justify-center bg-red-900/20 border border-red-500/50 p-4">
                                        <p className="text-red-400 text-sm text-center font-semibold mb-2">
                                            ⚠️ Video Data Invalid
                                        </p>
                                        <p className="text-gray-400 text-xs text-center mb-2">
                                            Expected a data URL but received: {status.final_output.filename || 'unknown'}
                                        </p>
                                        <p className="text-gray-500 text-xs text-center">
                                            Data preview: {status.final_output.data?.slice(0, 40) || 'empty'}...
                                        </p>
                                    </div>
                                ) : videoError ? (
                                    /* Error state: Video load failed */
                                    <div className="w-full aspect-video flex flex-col items-center justify-center bg-red-900/20 border border-red-500/50 p-4">
                                        <p className="text-red-400 text-sm text-center font-semibold mb-2">
                                            ⚠️ Video Failed to Load
                                        </p>
                                        <p className="text-gray-400 text-xs text-center">
                                            {videoError}
                                        </p>
                                    </div>
                                ) : status.final_output.type === 'image' ? (
                                    <img 
                                        src={status.final_output.data} 
                                        alt={status.final_output.filename} 
                                        className="w-full aspect-video object-contain" 
                                    />
                                ) : (
                                    <video 
                                        data-testid="video-player" 
                                        src={status.final_output.data} 
                                        className="w-full aspect-video" 
                                        controls 
                                        autoPlay 
                                        loop 
                                        muted
                                        onError={() => {
                                            setVideoError(`Failed to load video: ${status.final_output?.filename || 'unknown'}`);
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(LocalGenerationStatus);
