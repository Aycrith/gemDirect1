import React from 'react';
import LightbulbIcon from './icons/LightbulbIcon';
import BookOpenIcon from './icons/BookOpenIcon';
import ClapperboardIcon from './icons/ClapperboardIcon';
import TimelineIcon from './icons/TimelineIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import PaintBrushIcon from './icons/PaintBrushIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';

export type WorkflowStage = 'idea' | 'bible' | 'vision' | 'scenes' | 'director' | 'continuity';

const STAGES = [
    { id: 'idea', name: 'Story Idea', icon: <LightbulbIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'bible', name: 'Story Bible', icon: <BookOpenIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'vision', name: 'Set Vision', icon: <PaintBrushIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'scenes', name: 'Scene List', icon: <ClapperboardIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'director', name: 'Direct Scene', icon: <TimelineIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'continuity', name: 'Continuity Review', icon: <ClipboardCheckIcon className="w-6 h-6 text-gray-300" /> },
];

const WorkflowTracker: React.FC<{ currentStage: WorkflowStage }> = ({ currentStage }) => {
    const currentStageIndex = STAGES.findIndex(s => s.id === currentStage);

    return (
        <div className="w-full max-w-5xl mx-auto mb-12">
            <div className="flex items-center">
                {STAGES.map((stage, index) => {
                    const isCompleted = currentStageIndex > index;
                    const isCurrent = currentStageIndex === index;

                    return (
                        <React.Fragment key={stage.id}>
                            <div className="flex flex-col items-center text-center w-32">
                                <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-500 ${
                                    isCurrent ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-500/30' : 
                                    isCompleted ? 'bg-indigo-500 border-indigo-500' : 
                                    'bg-gray-700 border-gray-600'
                                }`}>
                                    {isCompleted ? <CheckCircleIcon className="w-6 h-6 text-white" /> : stage.icon}
                                </div>
                                <p className={`mt-2 text-xs font-semibold transition-colors duration-500 ${
                                    isCurrent ? 'text-indigo-300' : isCompleted ? 'text-gray-300' : 'text-gray-500'
                                }`}>
                                    {stage.name}
                                </p>
                            </div>
                            {index < STAGES.length - 1 && (
                                <div className={`flex-1 h-1 transition-colors duration-500 rounded-full ${isCompleted ? 'bg-indigo-500' : 'bg-gray-700'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(WorkflowTracker);