import React from 'react';
import LightbulbIcon from './icons/LightbulbIcon';
import BookOpenIcon from './icons/BookOpenIcon';
import TimelineIcon from './icons/TimelineIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import PaintBrushIcon from './icons/PaintBrushIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';
import { WorkflowStage } from '../types';

const STAGES: { id: WorkflowStage; name: string; icon: React.ReactNode }[] = [
    { id: 'idea', name: 'Story Idea', icon: <LightbulbIcon className="w-7 h-7" /> },
    { id: 'bible', name: 'Story Bible', icon: <BookOpenIcon className="w-7 h-7" /> },
    { id: 'vision', name: 'Set Vision', icon: <PaintBrushIcon className="w-7 h-7" /> },
    { id: 'director', name: 'Direct Scenes', icon: <TimelineIcon className="w-7 h-7" /> },
    { id: 'continuity', name: 'Continuity Review', icon: <ClipboardCheckIcon className="w-7 h-7" /> },
];

// Mapping of stage IDs to their corresponding test IDs
const STAGE_TEST_IDS: Partial<Record<WorkflowStage, string>> = {
    'idea': 'step-story-idea',
    'director': 'step-direct-scenes',
};

const FlowingLine: React.FC<{ completed: boolean }> = ({ completed }) => (
    <div className="flex-1 h-1 rounded-full bg-gray-700 relative overflow-hidden mx-2">
        <div
            className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700 ease-out ${completed ? 'w-full' : 'w-0'}`}
        />
        {completed && (
            <div
                className="absolute top-0 left-0 h-full rounded-full w-full bg-gradient-to-r from-transparent via-amber-300/40 to-transparent animate-flow"
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
        <div className="w-full max-w-5xl mx-auto mb-16">
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
            <div className="flex items-start">
                {STAGES.map((stage, index) => {
                    const stageId = stage.id;
                    const isCompleted = currentStageIndex > index;
                    const isCurrent = currentStageIndex === index;

                    const isDirectorStageOrLater = currentStageIndex >= STAGES.findIndex(s => s.id === 'director');
                    const canClickContinuity = stageId === 'continuity' && isDirectorStageOrLater;
                    const isClickable = isCompleted || isCurrent || canClickContinuity;

                    return (
                        <React.Fragment key={stage.id}>
                            <div className="flex flex-col items-center text-center w-36">
                                <button
                                    data-testid={STAGE_TEST_IDS[stage.id]}
                                    onClick={() => isClickable && onStageClick(stageId)}
                                    disabled={!isClickable}
                                    className={`relative flex items-center justify-center w-16 h-16 rounded-full border-2 transition-all duration-300 group ${
                                        isCurrent ? 'bg-amber-600 border-amber-400 animate-breathing-glow' : 
                                        isCompleted ? 'bg-amber-500 border-amber-500' : 
                                        'bg-gray-800 border-gray-700'
                                    } ${isClickable ? 'cursor-pointer hover:border-amber-500' : 'disabled:cursor-not-allowed'}`}
                                >
                                    <div className={`${isCurrent ? 'animate-pop-in' : ''} ${isCompleted && !isCurrent ? 'text-white' : 'text-gray-300'}`}>
                                        {isCompleted && !isCurrent ? <CheckCircleIcon className="w-8 h-8" /> : stage.icon}
                                    </div>
                                </button>
                                <p className={`mt-3 text-sm font-semibold tracking-wide transition-colors duration-300 ${
                                    isCurrent ? 'text-amber-300' : isCompleted ? 'text-gray-200' : 'text-gray-500'
                                }`}>
                                    {stage.name}
                                </p>
                            </div>
                            {index < STAGES.length - 1 && (
                                <div className="flex-1 pt-8">
                                    <FlowingLine completed={isCompleted} />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(WorkflowTracker);
