import React, { useMemo } from 'react';
import type { Scene, KeyframeData } from '../types';
import { isBookendKeyframe } from '../types';
import CheckCircleIcon from './icons/CheckCircleIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';

interface E2EQAMetrics {
    totalScenes: number;
    scenesWithKeyframes: number;
    scenesWithVideos: number;
    bookendModeScenes: number;
    averageCompletionRate: number;
    pipelineStatus: 'not_started' | 'in_progress' | 'complete' | 'has_issues';
}

interface E2EQACardProps {
    scenes: Scene[];
    generatedImages: Record<string, KeyframeData>;
    generatedVideos?: Record<string, string>;
    className?: string;
}

/**
 * E2EQACard - End-to-End Quality Assurance Card
 * 
 * Displays pipeline completion metrics for the story-to-video workflow:
 * - Scene count and completion status
 * - Keyframe generation progress
 * - Video generation progress
 * - Bookend mode usage
 */
const E2EQACard: React.FC<E2EQACardProps> = ({ 
    scenes, 
    generatedImages, 
    generatedVideos = {},
    className = ''
}) => {
    // Optimization: Memoize metrics calculation to prevent re-computation on every render
    // Dependencies: scenes array, generatedImages object, generatedVideos object
    const metrics = useMemo<E2EQAMetrics>(() => {
        const totalScenes = scenes.length;
        
        // Count scenes with keyframes
        const scenesWithKeyframes = scenes.filter(scene => {
            const keyframe = generatedImages[scene.id];
            return keyframe !== undefined;
        }).length;
        
        // Count scenes with videos
        const scenesWithVideos = scenes.filter(scene => {
            return generatedVideos[scene.id] !== undefined;
        }).length;
        
        // Count scenes using bookend mode
        const bookendModeScenes = scenes.filter(scene => {
            const keyframe = generatedImages[scene.id];
            return keyframe && isBookendKeyframe(keyframe);
        }).length;
        
        // Calculate average completion rate
        const keyframeRate = totalScenes > 0 ? scenesWithKeyframes / totalScenes : 0;
        const videoRate = totalScenes > 0 ? scenesWithVideos / totalScenes : 0;
        const averageCompletionRate = (keyframeRate + videoRate) / 2;
        
        // Determine pipeline status
        let pipelineStatus: E2EQAMetrics['pipelineStatus'] = 'not_started';
        if (scenesWithVideos === totalScenes && totalScenes > 0) {
            pipelineStatus = 'complete';
        } else if (scenesWithKeyframes > 0 || scenesWithVideos > 0) {
            pipelineStatus = 'in_progress';
        }
        
        // Check for issues (keyframes without videos, etc.)
        if (scenesWithKeyframes > scenesWithVideos && scenesWithVideos > 0) {
            pipelineStatus = 'has_issues';
        }
        
        return {
            totalScenes,
            scenesWithKeyframes,
            scenesWithVideos,
            bookendModeScenes,
            averageCompletionRate,
            pipelineStatus,
        };
    }, [scenes, generatedImages, generatedVideos]);

    const getStatusIcon = () => {
        switch (metrics.pipelineStatus) {
            case 'complete':
                return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
            case 'has_issues':
                return <AlertTriangleIcon className="w-5 h-5 text-yellow-400" />;
            case 'in_progress':
                return <ClipboardCheckIcon className="w-5 h-5 text-blue-400" />;
            default:
                return <ClipboardCheckIcon className="w-5 h-5 text-gray-400" />;
        }
    };

    const getStatusText = () => {
        switch (metrics.pipelineStatus) {
            case 'complete':
                return 'Pipeline Complete';
            case 'has_issues':
                return 'Pending Video Generation';
            case 'in_progress':
                return 'Pipeline In Progress';
            default:
                return 'Not Started';
        }
    };

    const getStatusColor = () => {
        switch (metrics.pipelineStatus) {
            case 'complete':
                return 'border-green-700/50 bg-green-900/20';
            case 'has_issues':
                return 'border-yellow-700/50 bg-yellow-900/20';
            case 'in_progress':
                return 'border-blue-700/50 bg-blue-900/20';
            default:
                return 'border-gray-700/50 bg-gray-900/20';
        }
    };

    if (metrics.totalScenes === 0) {
        return null;
    }

    const completionPercent = Math.round(metrics.averageCompletionRate * 100);

    return (
        <div className={`rounded-lg border p-6 ${getStatusColor()} ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center text-lg font-bold text-white">
                    {getStatusIcon()}
                    <span className="ml-2">End-to-End QA</span>
                </h3>
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                    metrics.pipelineStatus === 'complete' ? 'bg-green-600/30 text-green-300' :
                    metrics.pipelineStatus === 'has_issues' ? 'bg-yellow-600/30 text-yellow-300' :
                    metrics.pipelineStatus === 'in_progress' ? 'bg-blue-600/30 text-blue-300' :
                    'bg-gray-600/30 text-gray-300'
                }`}>
                    {getStatusText()}
                </span>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                    <span>Overall Progress</span>
                    <span>{completionPercent}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all duration-500 ${
                            metrics.pipelineStatus === 'complete' ? 'bg-green-500' :
                            metrics.pipelineStatus === 'has_issues' ? 'bg-yellow-500' :
                            'bg-blue-500'
                        }`}
                        style={{ width: `${completionPercent}%` }}
                    />
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Keyframes</div>
                    <div className="text-white font-semibold text-lg">
                        {metrics.scenesWithKeyframes} / {metrics.totalScenes}
                    </div>
                    <div className="text-gray-500 text-xs">
                        {Math.round((metrics.scenesWithKeyframes / metrics.totalScenes) * 100)}% complete
                    </div>
                </div>
                
                <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Videos</div>
                    <div className="text-white font-semibold text-lg">
                        {metrics.scenesWithVideos} / {metrics.totalScenes}
                    </div>
                    <div className="text-gray-500 text-xs">
                        {Math.round((metrics.scenesWithVideos / metrics.totalScenes) * 100)}% complete
                    </div>
                </div>
                
                <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Scenes</div>
                    <div className="text-white font-semibold text-lg">
                        {metrics.totalScenes}
                    </div>
                    <div className="text-gray-500 text-xs">in project</div>
                </div>
                
                <div className="bg-black/20 rounded-lg p-3">
                    <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Bookend Mode</div>
                    <div className="text-white font-semibold text-lg">
                        {metrics.bookendModeScenes}
                    </div>
                    <div className="text-gray-500 text-xs">
                        scenes with dual keyframes
                    </div>
                </div>
            </div>

            {/* Action Hints */}
            {metrics.pipelineStatus === 'has_issues' && (
                <div className="mt-4 text-sm text-yellow-300/80 bg-yellow-900/20 rounded-lg p-3">
                    <strong>Tip:</strong> {metrics.scenesWithKeyframes - metrics.scenesWithVideos} scene(s) have keyframes but no videos. 
                    Generate videos to complete the pipeline.
                </div>
            )}
            
            {metrics.pipelineStatus === 'not_started' && (
                <div className="mt-4 text-sm text-gray-400 bg-gray-800/50 rounded-lg p-3">
                    <strong>Getting Started:</strong> Generate keyframes for your scenes first, 
                    then use them to create videos through ComfyUI.
                </div>
            )}
        </div>
    );
};

export default E2EQACard;
