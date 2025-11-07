import React from 'react';
import LightbulbIcon from './icons/LightbulbIcon';
import BookOpenIcon from './icons/BookOpenIcon';
import ClapperboardIcon from './icons/ClapperboardIcon';
import TimelineIcon from './icons/TimelineIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import PaintBrushIcon from './icons/PaintBrushIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';

export type WorkflowStage = 'idea' | 'bible' | 'vision' | 'director' | 'continuity';

const STAGES = [
    { id: 'idea', name: 'Story Idea', icon: <LightbulbIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'bible', name: 'Story Bible', icon: <BookOpenIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'vision', name: 'Set Vision', icon: <PaintBrushIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'director', name: 'Direct Scenes', icon: <TimelineIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'continuity', name: 'Continuity Review', icon: <ClipboardCheckIcon className="w-6 h-6 text-gray-300" /> },
];

const FlowingLine: React.FC<{ completed: boolean }> = ({ completed }) => (
    <div className="flex-1 h-1.5 rounded-full bg-gray-700 relative overflow-hidden">
        <div
            className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out ${completed ? 'w-full' : 'w-0'}`}
        />
        {completed && (
            <div
                className="absolute top-0 left-0 h-full rounded-full w-full bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent animate-flow"
                style={{
                    animation: 'flow 2.5s linear infinite',
                    backgroundSize: '200% 100%'
                }}
            />
        )}
        <style>{`
            @keyframes flow {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        `}</style>
    </div>
);

interface WorkflowTrackerProps {
  currentStage: WorkflowStage;
  onStageClick: (stage: WorkflowStage) => void;
}

const WorkflowTracker: React.FC<WorkflowTrackerProps> = ({ currentStage, onStageClick }) => {
    const currentStageIndex = STAGES.findIndex(s => s.id === currentStage);

    return (
        <div className="w-full max-w-5xl mx-auto mb-12">
            <style>
                {`
                    @keyframes pop-in {
                        0% { transform: scale(0.8); opacity: 0; }
                        50% { transform: scale(1.1); opacity: 1; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    .animate-pop-in {
                        animation: pop-in 0.4s ease-out forwards;
                    }
                `}
            </style>
            <div className="flex items-center">
                {STAGES.map((stage, index) => {
                    const stageId = stage.id as WorkflowStage;
                    const isCompleted = currentStageIndex > index;
                    const isCurrent = currentStageIndex === index;

                    const isDirectorStageOrLater = currentStageIndex >= STAGES.findIndex(s => s.id === 'director');
                    const canClickContinuity = stageId === 'continuity' && isDirectorStageOrLater;
                    const isClickable = isCompleted || isCurrent || canClickContinuity;

                    return (
                        <React.Fragment key={stage.id}>
                             <button
                                onClick={() => isClickable && onStageClick(stageId)}
                                disabled={!isClickable}
                                className={`flex flex-col items-center text-center w-36 group transition-transform duration-200 ${isClickable ? 'cursor-pointer hover:scale-105' : 'disabled:cursor-not-allowed'}`}
                            >
                                <div className={`relative flex items-center justify-center w-14 h-14 rounded-full border-2 transition-all duration-300 ${
                                    isCurrent ? 'bg-indigo-600 border-indigo-400 shadow-lg shadow-indigo-500/50' : 
                                    isCompleted ? 'bg-indigo-500 border-indigo-500 group-hover:bg-indigo-400' : 
                                    'bg-gray-800 border-gray-700 group-hover:border-gray-500'
                                }`}>
                                    <div className={isCurrent ? 'animate-pop-in' : ''}>
                                        {isCompleted && !isCurrent ? <CheckCircleIcon className="w-7 h-7 text-white" /> : stage.icon}
                                    </div>
                                    {isCurrent && <span className="absolute -inset-1.5 border-2 border-indigo-500 rounded-full animate-pulse"></span>}
                                </div>
                                <p className={`mt-3 text-xs font-semibold tracking-wide transition-colors duration-300 ${
                                    isCurrent ? 'text-indigo-300' : isCompleted ? 'text-gray-200' : 'text-gray-500'
                                }`}>
                                    {stage.name}
                                </p>
                            </button>
                            {index < STAGES.length - 1 && (
                                <FlowingLine completed={isCompleted} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(WorkflowTracker);