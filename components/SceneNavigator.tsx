import React from 'react';
import { Scene } from '../types';
import ClapperboardIcon from './icons/ClapperboardIcon';

interface SceneNavigatorProps {
    scenes: Scene[];
    activeSceneId: string | null;
    onSelectScene: (sceneId: string) => void;
}

const SceneNavigator: React.FC<SceneNavigatorProps> = ({ scenes, activeSceneId, onSelectScene }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/80 rounded-lg p-4 sticky top-6">
            <h3 className="flex items-center text-lg font-bold text-gray-100 mb-4">
                <ClapperboardIcon className="w-5 h-5 mr-2 text-indigo-400" />
                Scenes
            </h3>
            {scenes.length > 0 ? (
                <ul className="space-y-2 max-h-[75vh] overflow-y-auto pr-2 -mr-2">
                    {scenes.map((scene, index) => (
                        <li key={scene.id}>
                            <button
                                onClick={() => onSelectScene(scene.id)}
                                className={`w-full text-left p-3 rounded-md transition-all duration-200 text-sm ring-1 ring-transparent ${
                                    activeSceneId === scene.id 
                                        ? 'bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/20' 
                                        : 'bg-gray-700/50 hover:bg-gray-700/80 hover:ring-indigo-500/50 text-gray-300'
                                }`}
                            >
                                <span className="font-bold">Scene {index + 1}: {scene.title}</span>
                                <p className="text-xs mt-1 opacity-80">{scene.summary}</p>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-500">Your scenes will appear here once generated from the plot outline.</p>
            )}
        </div>
    );
};

export default SceneNavigator;