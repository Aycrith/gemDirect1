import React, { useState } from 'react';
import { usePipelineStore } from '../services/pipelineStore';
import { PipelineTask } from '../types/pipeline';

export const PipelineStatusPanel: React.FC = () => {
    const activePipelineId = usePipelineStore(state => state.activePipelineId);
    const pipelines = usePipelineStore(state => state.pipelines);
    const [expanded, setExpanded] = useState(false);

    if (!activePipelineId) return null;

    const pipeline = pipelines[activePipelineId];
    if (!pipeline) return null;

    const tasks = Object.values(pipeline.tasks).sort((a, b) => a.createdAt - b.createdAt);
    const completedCount = tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length;
    const totalCount = tasks.length;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 w-80">
            <div 
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700/50"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${pipeline.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                    <span className="text-sm font-medium text-slate-200 truncate max-w-[150px]">
                        {pipeline.name}
                    </span>
                </div>
                <div className="text-xs text-slate-400">
                    {Math.round(progress)}%
                </div>
            </div>

            {expanded && (
                <div className="p-3 border-t border-slate-700 max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                        {tasks.map(task => (
                            <TaskItem key={task.id} task={task} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const TaskItem: React.FC<{ task: PipelineTask }> = ({ task }) => {
    const statusColors = {
        pending: 'text-slate-500',
        running: 'text-blue-400',
        completed: 'text-green-400',
        failed: 'text-red-400',
        skipped: 'text-slate-600',
        cancelled: 'text-slate-600'
    };

    return (
        <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 truncate max-w-[180px]" title={task.label}>
                {task.label}
            </span>
            <span className={`${statusColors[task.status]} capitalize`}>
                {task.status}
            </span>
        </div>
    );
};
