import React from 'react';
import { Scene, StoryBible, SceneContinuityData, ToastMessage } from '../types';
import ContinuityCard from './ContinuityCard';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';

interface ContinuityDirectorProps {
  scenes: Scene[];
  storyBible: StoryBible;
  directorsVision: string;
  generatedImages: Record<string, string>;
  videoPrompts: Record<string, string>;
  continuityData: Record<string, SceneContinuityData>;
  setContinuityData: React.Dispatch<React.SetStateAction<Record<string, SceneContinuityData>>>;
  addToast: (message: string, type: ToastMessage['type']) => void;
}

const ContinuityDirector: React.FC<ContinuityDirectorProps> = ({
  scenes,
  storyBible,
  directorsVision,
  generatedImages,
  videoPrompts,
  continuityData,
  setContinuityData,
  addToast,
}) => {
  return (
    <div className="max-w-7xl mx-auto">
      <header className="text-center mb-10">
        <h2 className="flex items-center justify-center text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-cyan-400">
          <ClipboardCheckIcon className="w-10 h-10 mr-4 text-green-300" />
          Continuity Director
        </h2>
        <p className="mt-3 text-lg text-gray-400 max-w-3xl mx-auto">
          Upload your generated videos for each scene. The AI will analyze them, score them against your creative intent, and provide feedback to refine your story.
        </p>
      </header>
      <div className="space-y-8">
        {scenes.map((scene, index) => (
          <ContinuityCard
            key={scene.id}
            scene={scene}
            sceneNumber={index + 1}
            storyBible={storyBible}
            directorsVision={directorsVision}
            generatedImage={generatedImages[scene.id]}
            videoPrompt={videoPrompts[scene.id]}
            data={continuityData[scene.id] || { status: 'idle' }}
            setContinuityData={(updater) => {
              setContinuityData(prev => ({
                ...prev,
                [scene.id]: typeof updater === 'function' ? updater(prev[scene.id]) : updater
              }));
            }}
            addToast={addToast}
          />
        ))}
      </div>
    </div>
  );
};

export default ContinuityDirector;
