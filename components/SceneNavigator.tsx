import React, { useEffect, useRef } from 'react';
import { Scene, SceneStatus, SceneImageGenerationStatus, isBookendKeyframe, type KeyframeData } from '../types';
import ClapperboardIcon from './icons/ClapperboardIcon';
import FilmIcon from './icons/FilmIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import SceneStatusIndicator from './SceneStatusIndicator';
import { useVisualBible } from '../utils/hooks';
// TODO: import { getSceneVisualBibleContext } from '../services/continuityVisualContext'; // Not yet implemented

interface SceneNavigatorProps {
    scenes: Scene[];
    activeSceneId: string | null;
    onSelectScene: (sceneId: string) => void;
    onDeleteScene?: (sceneId: string) => void;
    scenesToReview: Set<string>;
    sceneStatuses?: Record<string, SceneStatus>;
    generatedImages?: Record<string, KeyframeData>;
    sceneImageStatuses?: Record<string, SceneImageGenerationStatus>;
}

const SceneNavigator: React.FC<SceneNavigatorProps> = ({ scenes, activeSceneId, onSelectScene, onDeleteScene, scenesToReview, sceneStatuses = {}, generatedImages = {}, sceneImageStatuses = {} }) => {
    const { visualBible } = useVisualBible();
    const renderCountRef = useRef(0);
    const prevImagesRef = useRef<Record<string, KeyframeData>>({});
    
    // DEBUG: Track re-renders and image updates (development only)
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        
        renderCountRef.current++;
        const imageCount = Object.keys(generatedImages).length;
        const imageIds = Object.keys(generatedImages).sort().join(', ');
        const prevCount = Object.keys(prevImagesRef.current).length;
        
        if (imageCount !== prevCount) {
            console.log(`🔄 [SceneNavigator] Re-render #${renderCountRef.current}: Images changed from ${prevCount} to ${imageCount}`);
            console.log(`   Current image IDs: [${imageIds}]`);
            
            // Log which images were added
            const newIds = Object.keys(generatedImages).filter(id => !prevImagesRef.current[id]);
            if (newIds.length > 0) {
                console.log(`   ➕ New images added: [${newIds.join(', ')}]`);
            }
        }
        
        prevImagesRef.current = generatedImages;
    }, [generatedImages]);
    return (
        <div className="bg-gray-800/50 border border-gray-700/80 rounded-lg p-4 sticky top-24">
            <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center text-lg font-bold text-gray-100">
                    <ClapperboardIcon className="w-5 h-5 mr-2 text-amber-400" />
                    Scenes
                </h3>
                <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">
                    {scenes.length} total
                </span>
            </div>
            {scenes.length > 0 ? (
                <ul className="space-y-2 max-h-[75vh] overflow-y-auto pr-2 -mr-2 custom-scrollbar">
                    {scenes.map((scene, index) => {
                        const needsReview = scenesToReview.has(scene.id);
                        const status = sceneStatuses[scene.id];
                        // TODO: Implement getSceneVisualBibleContext
                        const visualBibleInfo = null; // getSceneVisualBibleContext(visualBible, scene.id);
                        const hasVisualBibleLinks = false; // visualBibleInfo && (visualBibleInfo.styleBoards.length > 0 || visualBibleInfo.tags.length > 0);
                        return (
                            <li 
                                key={scene.id} 
                                data-testid="scene-row"
                                data-scene-id={scene.id}
                                data-scene-index={index}
                                className="animate-fade-in-right relative group" 
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <button
                                    onClick={() => onSelectScene(scene.id)}
                                    className={`scene-nav-item relative w-full text-left p-3 rounded-md transition-all duration-200 text-sm ring-1 flex items-start gap-3 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
                                            activeSceneId === scene.id 
                                                ? 'bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20 ring-transparent' 
                                                : `bg-gray-700/50 hover:bg-gray-700/80 text-gray-300 ${needsReview ? 'ring-yellow-500/80 hover:ring-yellow-500' : 'ring-transparent hover:ring-amber-500/50'}`
                                        }`}
                                    aria-current={activeSceneId === scene.id ? 'true' : undefined}
                                    >
                                        {needsReview && (
                                        <div className="absolute top-2 right-2" title="This scene is flagged for review based on changes elsewhere.">
                                            <AlertTriangleIcon className="w-4 h-4 text-yellow-400" />
                                        </div>
                                    )}
                                    <div className="relative">
                                        {(() => {
                                            const keyframeData = generatedImages[scene.id];
                                            
                                            if (!keyframeData) {
                                                return (
                                                    <div className="w-12 h-12 bg-gray-700/50 rounded shrink-0 border border-gray-600 flex items-center justify-center" title="No keyframe generated">
                                                        <FilmIcon className="w-6 h-6 text-gray-500" />
                                                    </div>
                                                );
                                            }
                                            
                                            // Bookend mode: side-by-side thumbnails
                                            if (isBookendKeyframe(keyframeData)) {
                                                return (
                                                    <div className="flex gap-0.5" title="Bookend keyframes (start → end)">
                                                        <div className="relative">
                                                            <img 
                                                                src={`data:image/png;base64,${keyframeData.start}`} 
                                                                alt={`Scene ${index + 1} start`}
                                                                className="w-6 h-12 object-cover rounded-l border border-gray-600"
                                                            />
                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] text-center py-0.5">
                                                                START
                                                            </div>
                                                        </div>
                                                        <div className="relative">
                                                            <img 
                                                                src={`data:image/png;base64,${keyframeData.end}`} 
                                                                alt={`Scene ${index + 1} end`}
                                                                className="w-6 h-12 object-cover rounded-r border border-gray-600"
                                                            />
                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] text-center py-0.5">
                                                                END
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            
                                            // Single keyframe mode (standard)
                                            return (
                                                <img 
                                                    src={`data:image/png;base64,${keyframeData}`} 
                                                    alt={`Scene ${index + 1} keyframe`}
                                                    className="w-12 h-12 object-cover rounded shrink-0 border border-gray-600"
                                                />
                                            );
                                        })()}
                                        {sceneImageStatuses[scene.id] && (
                                            <div className="absolute -top-1 -right-1">
                                                {sceneImageStatuses[scene.id].status === 'generating' && (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-[10px] rounded-full border border-gray-800">
                                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                        </svg>
                                                    </span>
                                                )}
                                                {sceneImageStatuses[scene.id].status === 'complete' && (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 bg-green-600 text-white text-[10px] rounded-full border border-gray-800">✓</span>
                                                )}
                                                {sceneImageStatuses[scene.id].status === 'error' && (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 bg-red-600 text-white text-[10px] rounded-full border border-gray-800">✗</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold">Scene {index + 1}: {scene.title}</span>
                                            {hasVisualBibleLinks && (
                                                <span className="px-1.5 py-0.5 bg-amber-600/20 text-amber-300 text-xs rounded border border-amber-600/30" title={`Visual Bible: ${visualBibleInfo.styleBoards.join(', ')} ${visualBibleInfo.tags.length > 0 ? '(' + visualBibleInfo.tags.join(', ') + ')' : ''}`}>
                                                    VB
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs opacity-75 line-clamp-2 leading-relaxed">{scene.summary}</p>
                                        {status && (
                                            <div className="mt-1.5">
                                                <SceneStatusIndicator 
                                                    status={status.status}
                                                    progress={status.progress}
                                                    error={status.error}
                                                    title={status.title}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </button>
                                {onDeleteScene && scenes.length > 1 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Delete scene "${scene.title}"? This cannot be undone.`)) {
                                                onDeleteScene(scene.id);
                                            }
                                        }}
                                        className="absolute top-2 right-2 p-1 rounded-full bg-red-800/70 hover:bg-red-700 text-red-200 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        aria-label="Delete scene"
                                        title="Delete scene"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="text-sm text-gray-500">Your scenes will appear here once generated from the plot outline.</p>
            )}
        </div>
    );
};

export default SceneNavigator;
