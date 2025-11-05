import React from 'react';
import UploadCloudIcon from './icons/UploadCloudIcon';
import SparklesIcon from './icons/SparklesIcon';
import LightbulbIcon from './icons/LightbulbIcon';
import TimelineIcon from './icons/TimelineIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';

export type WorkflowStage = 'upload' | 'analyze' | 'direct' | 'refine';

const STAGES = [
    { id: 'upload', name: 'Upload Video', icon: <UploadCloudIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'analyze', name: 'Analyze Action', icon: <SparklesIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'direct', name: 'Co-Direct Remix', icon: <LightbulbIcon className="w-6 h-6 text-gray-300" /> },
    { id: 'refine', name: 'Fine-Tune Shots', icon: <TimelineIcon className="w-6 h-6 text-gray-300" /> },
];

const WorkflowTracker: React.FC<{ currentStage: WorkflowStage }> = ({ currentStage }) => {
    const currentStageIndex = STAGES.findIndex(s => s.id === currentStage);

    return (
        <div className="w-full max-w-2xl mx-auto mb-12">
            <div className="flex items-center">
                {STAGES.map((stage, index) => {
                    const isCompleted = currentStageIndex > index;
                    const isCurrent = currentStageIndex === index;

                    return (
                        <React.Fragment key={stage.id}>
                            <div className="flex flex-col items-center text-center w-24">
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
