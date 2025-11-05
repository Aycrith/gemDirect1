import React from 'react';
import CheckCircleIcon from './icons/CheckCircleIcon';

export type ProcessingStage = 'idle' | 'frames' | 'shots' | 'suggestions';

const STAGES = [
    { id: 'frames', name: 'Extract Frames' },
    { id: 'shots', name: 'Detect Shots' },
    { id: 'suggestions', name: 'Get Suggestions' },
];

const ProgressBar: React.FC<{ stage: ProcessingStage }> = ({ stage }) => {
    const currentStageIndex = STAGES.findIndex(s => s.id === stage);

    return (
        <div className="w-full max-w-md">
            <ol className="flex items-center w-full">
                {STAGES.map((s, index) => {
                    const isCompleted = currentStageIndex > index;
                    const isCurrent = currentStageIndex === index;

                    return (
                        <li
                            key={s.id}
                            className={`flex w-full items-center ${
                                index < STAGES.length - 1 ? "after:content-[''] after:w-full after:h-1 after:border-b after:border-4 after:inline-block" : ""
                            } ${isCompleted ? 'after:border-indigo-500' : 'after:border-gray-700'}`}
                        >
                            <span className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-colors duration-300 ${
                                isCompleted ? 'bg-indigo-500' : isCurrent ? 'bg-indigo-700 border-2 border-indigo-400 animate-pulse' : 'bg-gray-700'
                            }`}>
                                {isCompleted ? (
                                    <CheckCircleIcon className="w-5 h-5 text-white" />
                                ) : isCurrent ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <span className="font-bold text-gray-400">{index + 1}</span>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ol>
            <div className="flex justify-between mt-2">
                 {STAGES.map((s, index) => {
                     const isCompleted = currentStageIndex > index;
                     const isCurrent = currentStageIndex === index;
                     return (
                        <span key={s.id} className={`text-xs w-1/3 text-center ${isCurrent ? 'text-indigo-300 font-semibold' : isCompleted ? 'text-gray-400' : 'text-gray-500'}`}>
                            {s.name}
                        </span>
                     )
                 })}
            </div>
        </div>
    );
};

export default React.memo(ProgressBar);
