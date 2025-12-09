import React, { useEffect, useState, useCallback } from 'react';
import { getGenerationQueue, QueueState, GenerationStatus } from '../services/generationQueue';

/**
 * GenerationQueuePanel - Displays queue status and controls
 * 
 * Shows:
 * - Number of queued tasks
 * - Currently running task with progress
 * - Circuit breaker status
 * - Cancel buttons
 * 
 * @module components/GenerationQueuePanel
 */

interface Props {
    /** Additional CSS classes */
    className?: string;
    /** Position of the panel */
    position?: 'bottom-right' | 'bottom-left' | 'top-right';
}

export const GenerationQueuePanel: React.FC<Props> = ({ 
    className = '',
    position = 'bottom-right',
}) => {
    const [state, setState] = useState<QueueState | null>(null);
    const [expanded, setExpanded] = useState(false);
    
    useEffect(() => {
        const queue = getGenerationQueue();
        const unsubscribe = queue.subscribe(setState);
        return unsubscribe;
    }, []);
    
    const handleCancelAll = useCallback(() => {
        const queue = getGenerationQueue();
        const cancelled = queue.cancelAll();
        console.log(`[GenerationQueuePanel] Cancelled ${cancelled} pending tasks`);
    }, []);
    
    const handleResetCircuitBreaker = useCallback(() => {
        const queue = getGenerationQueue();
        queue.resetCircuitBreaker();
        console.log('[GenerationQueuePanel] Circuit breaker reset');
    }, []);
    
    // Don't render if no tasks
    if (!state || (state.size === 0 && !state.isCircuitOpen)) {
        return null;
    }
    
    const positionClasses = {
        'bottom-right': 'fixed bottom-4 right-4',
        'bottom-left': 'fixed bottom-4 left-4',
        'top-right': 'fixed top-20 right-4',
    };
    
    const pendingCount = state.size - (state.isRunning ? 1 : 0);
    
    return (
        <div 
            className={`
                ${positionClasses[position]}
                bg-slate-800 border border-slate-600 rounded-lg shadow-xl
                z-50 min-w-64 max-w-80
                ${className}
            `}
        >
            {/* Header - always visible */}
            <div 
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700/50 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2">
                    {state.isRunning ? (
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    ) : state.isCircuitOpen ? (
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                    ) : (
                        <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                    )}
                    <span className="text-sm font-medium text-slate-200">
                        Generation Queue
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                        {state.size} task{state.size !== 1 ? 's' : ''}
                    </span>
                    <svg 
                        className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            
            {/* Expanded content */}
            {expanded && (
                <div className="px-3 pb-3 border-t border-slate-700">
                    {/* Circuit breaker warning */}
                    {state.isCircuitOpen && (
                        <div className="mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-xs">
                            <div className="flex items-center gap-2 text-red-300">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Circuit breaker open ({state.consecutiveFailures} failures)</span>
                            </div>
                            <button
                                onClick={handleResetCircuitBreaker}
                                className="mt-2 w-full text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
                            >
                                Reset & Resume
                            </button>
                        </div>
                    )}
                    
                    {/* Running task */}
                    {state.isRunning && state.currentTaskId && (
                        <div className="mt-2 p-2 bg-slate-700/50 rounded">
                            <div className="flex items-center gap-2 text-xs text-slate-300">
                                <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                                <span className="truncate flex-1">{state.currentTaskId}</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Pending count */}
                    {pendingCount > 0 && (
                        <div className="mt-2 text-xs text-slate-400">
                            {pendingCount} task{pendingCount !== 1 ? 's' : ''} waiting
                        </div>
                    )}
                    
                    {/* Stats */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <div>
                            <span className="text-slate-500">Completed:</span> {state.stats.totalCompleted}
                        </div>
                        <div>
                            <span className="text-slate-500">Failed:</span> {state.stats.totalFailed}
                        </div>
                    </div>
                    
                    {/* Cancel button */}
                    {pendingCount > 0 && (
                        <button
                            onClick={handleCancelAll}
                            className="mt-3 w-full text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded transition-colors"
                        >
                            Cancel Pending ({pendingCount})
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Get a human-readable status label
 */
export const getStatusLabel = (status: GenerationStatus): string => {
    switch (status) {
        case 'pending': return 'Waiting';
        case 'running': return 'Running';
        case 'completed': return 'Done';
        case 'failed': return 'Failed';
        case 'cancelled': return 'Cancelled';
        case 'timeout': return 'Timed Out';
        default: return 'Unknown';
    }
};

/**
 * Get status color class
 */
export const getStatusColor = (status: GenerationStatus): string => {
    switch (status) {
        case 'pending': return 'text-yellow-500';
        case 'running': return 'text-green-500';
        case 'completed': return 'text-blue-500';
        case 'failed': return 'text-red-500';
        case 'cancelled': return 'text-slate-500';
        case 'timeout': return 'text-orange-500';
        default: return 'text-slate-400';
    }
};

export default GenerationQueuePanel;
