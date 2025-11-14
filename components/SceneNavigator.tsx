import React from 'react';
import { Scene, SceneStatus } from '../types';
import ClapperboardIcon from './icons/ClapperboardIcon';
import FilmIcon from './icons/FilmIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import SceneStatusIndicator from './SceneStatusIndicator';

interface SceneNavigatorProps {
    scenes: Scene[];
    activeSceneId: string | null;
    onSelectScene: (sceneId: string) => void;
    scenesToReview: Set<string>;
    sceneStatuses?: Record<string, SceneStatus>;
}

const SceneNavigator: React.FC<SceneNavigatorProps> = ({ scenes, activeSceneId, onSelectScene, scenesToReview, sceneStatuses = {} }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/80 rounded-lg p-4 sticky top-24">
            <h3 className="flex items-center text-lg font-bold text-gray-100 mb-4">
                <ClapperboardIcon className="w-5 h-5 mr-2 text-amber-400" />
                Scenes
            </h3>
            {scenes.length > 0 ? (
                <ul className="space-y-3 max-h-[75vh] overflow-y-auto pr-2 -mr-2">
                    {scenes.map((scene, index) => {
                        const needsReview = scenesToReview.has(scene.id);
                        const status = sceneStatuses[scene.id];
                        return (
                            <li 
                                key={scene.id} 
                                className="animate-fade-in-right" 
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <button
                                    onClick={() => onSelectScene(scene.id)}
                                    className={`relative w-full text-left p-3 rounded-md transition-all duration-200 text-sm ring-1 flex items-start gap-3 ${
                                        activeSceneId === scene.id 
                                            ? 'bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20 ring-transparent' 
                                            : `bg-gray-700/50 hover:bg-gray-700/80 text-gray-300 ${needsReview ? 'ring-yellow-500/80 hover:ring-yellow-500' : 'ring-transparent hover:ring-amber-500/50'}`
                                    }`}
                                >
                                    {needsReview && (
                                        <div className="absolute top-2 right-2" title="This scene is flagged for review based on changes elsewhere.">
                                            <AlertTriangleIcon className="w-4 h-4 text-yellow-400" />
                                        </div>
                                    )}
                                    <FilmIcon className={`w-5 h-5 mt-0.5 shrink-0 ${activeSceneId === scene.id ? 'text-amber-200' : 'text-gray-400'}`} />
                                    <div className="flex-1 min-w-0">
                                        <span className="font-bold">Scene {index + 1}: {scene.title}</span>
                                        <p className="text-xs mt-1 opacity-80">{scene.summary}</p>
                                        {status && (
                                            <div className="mt-2">
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