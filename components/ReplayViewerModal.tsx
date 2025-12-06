/**
 * Replay Viewer Modal
 * 
 * A reusable modal component for viewing and comparing original and replayed videos.
 * Shows both videos side-by-side (or stacked on narrow screens) with basic transport
 * controls and manifest information.
 * 
 * Part of R1 - Replay Integration in UI
 * 
 * Usage:
 * ```tsx
 * <ReplayViewerModal
 *     isOpen={isViewerOpen}
 *     onClose={() => setIsViewerOpen(false)}
 *     originalVideoPath="/path/to/original.mp4"
 *     replayedVideoPath="/path/to/replayed.mp4"
 *     manifestPath="/path/to/manifest.json"
 * />
 * ```
 * 
 * @module components/ReplayViewerModal
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ReplayViewerProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback to close the modal */
    onClose: () => void;
    /** Path to the original video file (optional) */
    originalVideoPath?: string;
    /** Path to the replayed video file (optional) */
    replayedVideoPath?: string;
    /** Path to the manifest file */
    manifestPath: string;
    /** Optional title for the modal */
    title?: string;
    /** Optional shot ID for context */
    shotId?: string;
}

interface VideoPlayerProps {
    label: string;
    videoPath?: string;
    isPlaying: boolean;
    onPlayPause: () => void;
    onTimeUpdate: (time: number) => void;
    syncTime?: number;
    enableSync?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Individual video player with controls
 */
const VideoPlayer: React.FC<VideoPlayerProps> = ({
    label,
    videoPath,
    isPlaying,
    onPlayPause,
    onTimeUpdate,
    syncTime,
    enableSync = false,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isVideoReady, setIsVideoReady] = useState(false);
    
    // Handle play/pause state
    useEffect(() => {
        if (!videoRef.current || !isVideoReady) return;
        
        if (isPlaying) {
            videoRef.current.play().catch(() => {
                // Autoplay may be blocked, ignore
            });
        } else {
            videoRef.current.pause();
        }
    }, [isPlaying, isVideoReady]);
    
    // Handle time sync from other player
    useEffect(() => {
        if (!videoRef.current || !enableSync || syncTime === undefined) return;
        
        // Only sync if difference is significant (> 0.5s)
        if (Math.abs(videoRef.current.currentTime - syncTime) > 0.5) {
            videoRef.current.currentTime = syncTime;
        }
    }, [syncTime, enableSync]);
    
    const handleTimeUpdate = useCallback(() => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        setCurrentTime(time);
        onTimeUpdate(time);
    }, [onTimeUpdate]);
    
    const handleLoadedMetadata = useCallback(() => {
        if (!videoRef.current) return;
        setDuration(videoRef.current.duration);
        setIsVideoReady(true);
    }, []);
    
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    // Convert file path to file:// URL for local files
    const videoSrc = videoPath 
        ? (videoPath.startsWith('http') ? videoPath : `file://${videoPath.replace(/\\/g, '/')}`)
        : undefined;
    
    if (!videoPath) {
        return (
            <div className="flex-1 bg-gray-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-300">{label}</h4>
                </div>
                <div className="aspect-video bg-gray-900/50 rounded-lg flex items-center justify-center">
                    <span className="text-gray-500 text-sm">No video available</span>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex-1 bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-300">{label}</h4>
                {isVideoReady && (
                    <span className="text-xs text-gray-500">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                )}
            </div>
            
            {/* Video element */}
            <div className="aspect-video bg-gray-900/50 rounded-lg overflow-hidden relative">
                <video
                    ref={videoRef}
                    src={videoSrc}
                    className="w-full h-full object-contain"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => onPlayPause()}
                    playsInline
                />
                
                {/* Loading indicator */}
                {!isVideoReady && videoPath && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                        <span className="text-gray-400 animate-pulse">Loading...</span>
                    </div>
                )}
            </div>
            
            {/* Controls */}
            <div className="flex items-center justify-center gap-2 mt-2">
                <button
                    onClick={onPlayPause}
                    disabled={!isVideoReady}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        isVideoReady
                            ? 'bg-blue-600 text-white hover:bg-blue-500'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
            </div>
            
            {/* File path */}
            <p className="text-xs text-gray-500 mt-2 truncate" title={videoPath}>
                {videoPath.split(/[/\\]/).pop()}
            </p>
        </div>
    );
};

/**
 * Copy button for paths
 */
const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers or file:// context
            console.log('Copy to clipboard:', text);
        }
    }, [text]);
    
    return (
        <button
            onClick={handleCopy}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            title={`Copy ${label}`}
        >
            {copied ? '✓ Copied' : '📋 Copy'}
        </button>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const ReplayViewerModal: React.FC<ReplayViewerProps> = ({
    isOpen,
    onClose,
    originalVideoPath,
    replayedVideoPath,
    manifestPath,
    title,
    shotId,
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [syncTime, setSyncTime] = useState<number>(0);
    const [syncEnabled, setSyncEnabled] = useState(true);
    
    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setIsPlaying(false);
            setSyncTime(0);
        }
    }, [isOpen]);
    
    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);
    
    const handlePlayPause = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);
    
    const handleTimeUpdate = useCallback((time: number) => {
        setSyncTime(time);
    }, []);
    
    if (!isOpen) return null;
    
    const hasOriginal = !!originalVideoPath;
    const hasReplayed = !!replayedVideoPath;
    const hasBothVideos = hasOriginal && hasReplayed;
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />
            
            {/* Modal */}
            <div className="relative bg-gray-900 rounded-xl shadow-2xl ring-1 ring-gray-700 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <span className="text-lg">🔄</span>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-100">
                                {title || 'Replay Viewer'}
                            </h2>
                            {shotId && (
                                <p className="text-xs text-gray-400">Shot: {shotId}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-200 text-2xl leading-none p-1"
                        title="Close"
                    >
                        ×
                    </button>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {/* Video Players */}
                    <div className={`flex gap-4 ${hasBothVideos ? 'flex-row' : 'flex-col'}`}>
                        {/* Original Video */}
                        {(hasOriginal || !hasReplayed) && (
                            <VideoPlayer
                                label="Original"
                                videoPath={originalVideoPath}
                                isPlaying={isPlaying}
                                onPlayPause={handlePlayPause}
                                onTimeUpdate={handleTimeUpdate}
                            />
                        )}
                        
                        {/* Replayed Video */}
                        {hasReplayed && (
                            <VideoPlayer
                                label="Replayed"
                                videoPath={replayedVideoPath}
                                isPlaying={isPlaying}
                                onPlayPause={handlePlayPause}
                                onTimeUpdate={handleTimeUpdate}
                                syncTime={syncTime}
                                enableSync={syncEnabled}
                            />
                        )}
                    </div>
                    
                    {/* Sync toggle (when both videos present) */}
                    {hasBothVideos && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={syncEnabled}
                                    onChange={(e) => setSyncEnabled(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                                />
                                Sync playback
                            </label>
                        </div>
                    )}
                    
                    {/* Master controls (when both videos present) */}
                    {hasBothVideos && (
                        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-700">
                            <button
                                onClick={handlePlayPause}
                                className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                            >
                                {isPlaying ? '⏸ Pause Both' : '▶ Play Both'}
                            </button>
                        </div>
                    )}
                    
                    {/* Manifest info */}
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-1">Manifest Path:</p>
                                <p className="text-xs text-gray-300 font-mono truncate" title={manifestPath}>
                                    {manifestPath}
                                </p>
                            </div>
                            <CopyButton text={manifestPath} label="manifest path" />
                        </div>
                    </div>
                </div>
                
                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700 bg-gray-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReplayViewerModal;
