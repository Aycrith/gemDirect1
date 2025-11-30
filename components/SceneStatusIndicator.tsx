import React from 'react';
import { SceneGenerationStatus } from '../types';

interface SceneStatusIndicatorProps {
  status: SceneGenerationStatus;
  progress?: number;
  error?: string;
  title?: string;
}

const SceneStatusIndicator: React.FC<SceneStatusIndicatorProps> = ({ 
  status, 
  progress = 0, 
  error,
  title
}) => {
  const getStatusColor = (): string => {
    switch (status) {
      case 'pending':
        return 'text-gray-400';
      case 'generating':
        return 'text-blue-500';
      case 'complete':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (): React.ReactNode => {
    switch (status) {
      case 'pending':
        return (
          <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.3" />
          </svg>
        );
      case 'generating':
        return (
          <svg className="w-4 h-4 inline animate-spin" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
          </svg>
        );
      case 'complete':
        return (
          <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusLabel = (): string => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'generating':
        return 'Generating...';
      case 'complete':
        return 'Complete';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className={`flex items-center gap-2 ${getStatusColor()}`}>
        <span>{getStatusIcon()}</span>
        <span className="text-sm font-medium">{getStatusLabel()}</span>
        {title && <span className="text-xs opacity-70 ml-auto truncate">{title}</span>}
      </div>
      {status === 'generating' && progress !== undefined && (
        <div className="w-full bg-gray-700 rounded-full h-1">
          <div 
            className="bg-blue-500 h-1 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {status === 'failed' && error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded mt-1 max-w-xs">
          {error}
        </div>
      )}
    </div>
  );
};

export default SceneStatusIndicator;
