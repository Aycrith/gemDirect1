import React, { useCallback } from 'react';
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
  // OPTIMIZATION: Implement the same context pruning logic here to ensure
  // the continuity scoring is as efficient as the generation steps.
  const getNarrativeContext = useCallback((sceneId: string): string => {
      if (!storyBible || !scenes.length) return '';
      
      const sceneIndex = scenes.findIndex(s => s.id === sceneId);
      const scene = scenes[sceneIndex];
      if (sceneIndex === -1) return '';

      const plotLines = storyBible.plotOutline.split('\n');
      const actStarts: Record<string, number> = {
          'act i': plotLines.findIndex(l => l.toLowerCase().includes('act i')),
          'act ii': plotLines.findIndex(l => l.toLowerCase().includes('act ii')),
          'act iii': plotLines.findIndex(l => l.toLowerCase().includes('act iii')),
      };

      const sceneFraction = scenes.length > 1 ? sceneIndex / (scenes.length - 1) : 0;
      let currentActKey: 'act i' | 'act ii' | 'act iii' = 'act i';
      if (actStarts['act iii'] !== -1 && sceneFraction >= 0.7) {
          currentActKey = 'act iii';
      } else if (actStarts['act ii'] !== -1 && sceneFraction >= 0.3) {
          currentActKey = 'act ii';
      }

      let actText = '';
      const start = actStarts[currentActKey];
      if (start !== -1) {
          let end: number | undefined;
          if (currentActKey === 'act i') end = actStarts['act ii'] !== -1 ? actStarts['act ii'] : actStarts['act iii'];
          if (currentActKey === 'act ii') end = actStarts['act iii'] !== -1 ? actStarts['act iii'] : undefined;
          actText = plotLines.slice(start, end).join('\n');
      } else {
          actText = storyBible.plotOutline;
      }

      const prevSceneSummary = sceneIndex > 0 ? `PREVIOUS SCENE: ${scenes[sceneIndex - 1].summary}` : 'This is the opening scene.';
      const nextSceneSummary = sceneIndex < scenes.length - 1 ? `NEXT SCENE: ${scenes[sceneIndex + 1].summary}` : 'This is the final scene.';

      return `
This scene, "${scene.title}", occurs within the following narrative act:
${actText}

CONTEXT FROM ADJACENT SCENES:
- ${prevSceneSummary}
- ${nextSceneSummary}
      `.trim();
  }, [storyBible, scenes]);


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
            logline={storyBible.logline}
            narrativeContext={getNarrativeContext(scene.id)}
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