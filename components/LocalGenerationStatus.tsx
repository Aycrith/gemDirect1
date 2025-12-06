import React, { useState, useEffect } from 'react';
import { LocalGenerationStatus as LocalGenerationStatusType } from '../types';
import { isValidMediaDataUrl } from '../utils/videoValidation';
import ServerIcon from './icons/ServerIcon';
import ArrowUpIcon from './icons/ArrowUpIcon';

interface Props {
    status: LocalGenerationStatusType;
    onClear: () => void;
    /** Whether video upscaling is available/enabled */
    upscalingEnabled?: boolean;
    /** Callback to trigger video upscaling */
    onUpscale?: (videoData: string) => Promise<void>;
    /** Whether upscaling is currently in progress */
    isUpscaling?: boolean;
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

/**
 * Preflight status badge - shows keyframe pair analysis result
 */
const PreflightBadge: React.FC<{ result?: LocalGenerationStatusType['preflightResult'] }> = ({ result }) => {
    if (!result) return null;
    
    const { ran, passed, reason, scores } = result;
    
    // Determine badge appearance based on status
    let icon: string;
    let colorClass: string;
    let label: string;
    let tooltip: string;
    
    if (!ran) {
        icon = '○';
        colorClass = 'text-gray-400 bg-gray-800/50';
        label = 'Preflight Skipped';
        tooltip = reason || 'Keyframe analysis was not run';
    } else if (passed) {
        icon = '✓';
        colorClass = 'text-green-400 bg-green-900/30';
        label = 'Preflight Passed';
        tooltip = scores 
            ? `Continuity: ${scores.overallContinuity?.toFixed(0)}%, Character: ${scores.characterMatch?.toFixed(0)}%, Environment: ${scores.environmentMatch?.toFixed(0)}%`
            : 'Keyframe pair analysis passed';
    } else {
        icon = '✗';
        colorClass = 'text-red-400 bg-red-900/30';
        label = 'Preflight Failed';
        tooltip = reason || 'Keyframe pair analysis failed thresholds';
    }
    
    return (
        <div 
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}
            title={tooltip}
            data-testid="preflight-status-badge"
        >
            <span>{icon}</span>
            <span>{label}</span>
            {scores?.overallContinuity !== undefined && (
                <span className="text-gray-400">({scores.overallContinuity.toFixed(0)}%)</span>
            )}
        </div>
    );
};

const LocalGenerationStatus: React.FC<Props> = ({ 
    status, 
    onClear,
    upscalingEnabled = false,
    onUpscale,
    isUpscaling = false
}) => {
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
                        {/* Preflight badge inline with title */}
                        {status.preflightResult && (
                            <span className="ml-3">
                                <PreflightBadge result={status.preflightResult} />
                            </span>
                        )}
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
                            {/* Video Upscale Button - shown when video is complete and upscaling is enabled */}
                            {status.final_output.type === 'video' && hasValidData && upscalingEnabled && onUpscale && (
                                <div className="mt-3 flex justify-center">
                                    <button
                                        onClick={() => onUpscale(status.final_output!.data)}
                                        disabled={isUpscaling}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors
                                            ${isUpscaling 
                                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                                            }`}
                                        data-testid="upscale-video-button"
                                    >
                                        <ArrowUpIcon className={`w-4 h-4 ${isUpscaling ? 'animate-pulse' : ''}`} />
                                        {isUpscaling ? 'Upscaling...' : 'Upscale Video (2x)'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(LocalGenerationStatus);
