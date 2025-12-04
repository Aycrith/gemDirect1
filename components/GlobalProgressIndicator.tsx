/**
 * GlobalProgressIndicator - Prominent progress display for long operations
 * 
 * Shows at top of viewport during any active generation operation.
 * Displays either:
 * - Indeterminate spinner with status text (LLM calls)
 * - Progress bar with percentage (ComfyUI, batch operations)
 * 
 * Positioned below the header bar for maximum visibility.
 * 
 * @created 2025-11-30
 */

import React from 'react';
import { useProgress, ProgressOperation, ProgressStatus } from '../contexts/ProgressContext';

const getStatusStyles = (status: ProgressStatus): { bg: string; border: string; text: string; iconColor: string } => {
  switch (status) {
    case 'queued':
      return { bg: 'bg-gray-800/95', border: 'border-gray-600', text: 'text-gray-300', iconColor: 'text-gray-400' };
    case 'processing':
      return { bg: 'bg-gray-800/95', border: 'border-amber-500', text: 'text-amber-100', iconColor: 'text-amber-400' };
    case 'complete':
      return { bg: 'bg-gray-800/95', border: 'border-green-500', text: 'text-green-100', iconColor: 'text-green-400' };
    case 'error':
      return { bg: 'bg-gray-800/95', border: 'border-red-500', text: 'text-red-100', iconColor: 'text-red-400' };
    case 'cancelled':
      return { bg: 'bg-gray-800/95', border: 'border-gray-500', text: 'text-gray-300', iconColor: 'text-gray-400' };
    default:
      return { bg: 'bg-gray-800/95', border: 'border-gray-600', text: 'text-gray-300', iconColor: 'text-gray-400' };
  }
};

const SpinnerIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle 
      className="opacity-25" 
      cx="12" 
      cy="12" 
      r="10" 
      stroke="currentColor" 
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ErrorIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const getStatusIcon = (status: ProgressStatus, iconColor: string) => {
  switch (status) {
    case 'queued':
    case 'processing':
      return <SpinnerIcon className={`h-5 w-5 ${iconColor}`} />;
    case 'complete':
      return <CheckIcon className={`h-5 w-5 ${iconColor}`} />;
    case 'error':
      return <ErrorIcon className={`h-5 w-5 ${iconColor}`} />;
    case 'cancelled':
      return null;
    default:
      return null;
  }
};

const formatDuration = (startedAt: number): string => {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const OperationDisplay: React.FC<{ operation: ProgressOperation; onClear: () => void }> = ({ 
  operation, 
  onClear 
}) => {
  const styles = getStatusStyles(operation.status);
  const isDeterminate = operation.total !== undefined || operation.percentage !== undefined;
  const showProgressBar = isDeterminate && (operation.status === 'processing' || operation.status === 'queued');
  
  // Calculate percentage
  let percentage = operation.percentage ?? 0;
  if (operation.total && operation.current !== undefined) {
    percentage = Math.round((operation.current / operation.total) * 100);
  }

  return (
    <div 
      className={`
        ${styles.bg} ${styles.border} ${styles.text}
        border rounded-lg shadow-xl p-4 
        transition-all duration-300 ease-out
        animate-slide-down
      `}
      role="status"
      aria-live="polite"
      data-testid="progress-indicator"
    >
      <div className="flex items-center gap-3">
        {/* Status Icon */}
        <div className="flex-shrink-0">
          {getStatusIcon(operation.status, styles.iconColor)}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Task title */}
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-sm truncate">
              {operation.task}
            </h4>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatDuration(operation.startedAt)}
            </span>
          </div>
          
          {/* Message or progress details */}
          {operation.message && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {operation.message}
            </p>
          )}
          
          {/* Error message */}
          {operation.error && (
            <p className="text-xs text-red-300 mt-1">
              {operation.error}
            </p>
          )}
          
          {/* Progress bar for determinate operations */}
          {showProgressBar && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                {operation.current !== undefined && operation.total !== undefined && (
                  <span>{operation.current} / {operation.total}</span>
                )}
                <span>{percentage}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Indeterminate progress bar */}
          {!showProgressBar && operation.status === 'processing' && (
            <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div 
                className="h-1.5 rounded-full bg-gradient-to-r from-transparent via-amber-500 to-transparent"
                style={{
                  width: '30%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                }}
              />
            </div>
          )}
        </div>
        
        {/* Clear button for completed/error states */}
        {(operation.status === 'complete' || operation.status === 'error' || operation.status === 'cancelled') && (
          <button
            onClick={onClear}
            className="flex-shrink-0 p-1 hover:bg-gray-700 rounded transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

const GlobalProgressIndicator: React.FC = () => {
  const { operations, clearOperation } = useProgress();
  
  // Only show operations that should be visible
  const visibleOperations = operations.filter(
    op => op.status !== 'idle'
  );
  
  if (visibleOperations.length === 0) {
    return null;
  }

  return (
    <div 
      className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4"
      aria-label="Generation progress"
    >
      <div className="flex flex-col gap-2">
        {visibleOperations.slice(0, 3).map(operation => (
          <OperationDisplay 
            key={operation.id} 
            operation={operation} 
            onClear={() => clearOperation(operation.id)}
          />
        ))}
        {visibleOperations.length > 3 && (
          <div className="text-center text-xs text-gray-500">
            +{visibleOperations.length - 3} more operations
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalProgressIndicator;
