import React from 'react';
import { QueueConfig } from '../utils/hooks';

interface QueuePolicyCardProps {
  queueConfig?: QueueConfig;
  title?: string;
}

const QueuePolicyCard: React.FC<QueuePolicyCardProps> = ({ 
  queueConfig,
  title = 'Queue Policy Configuration'
}) => {
  if (!queueConfig) {
    return (
      <div className="text-sm text-gray-400">
        No queue policy data available
      </div>
    );
  }

  const policies = [
    {
      label: 'Max Wait Time',
      value: queueConfig.SceneMaxWaitSeconds,
      unit: 'seconds',
      description: 'Maximum time to wait for scene generation'
    },
    {
      label: 'Max Poll Attempts',
      value: queueConfig.SceneHistoryMaxAttempts,
      unit: 'attempts',
      description: 'Maximum number of history polling attempts (0 = unlimited)'
    },
    {
      label: 'Poll Interval',
      value: queueConfig.SceneHistoryPollIntervalSeconds,
      unit: 'seconds',
      description: 'Time between history polling attempts'
    },
    {
      label: 'Post-Execution Timeout',
      value: queueConfig.ScenePostExecutionTimeoutSeconds,
      unit: 'seconds',
      description: 'Timeout after execution detection'
    },
    {
      label: 'Retry Budget',
      value: queueConfig.SceneRetryBudget,
      unit: 'retries',
      description: 'Number of automatic retries allowed'
    },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {policies.map((policy, idx) => (
          <div 
            key={idx}
            className="p-3 rounded border border-amber-700/50 bg-amber-900/20 space-y-1"
          >
            <div className="flex justify-between items-start">
              <div className="font-semibold text-amber-300 text-sm">{policy.label}</div>
              <div className="text-amber-200 font-mono text-sm">
                {policy.value}
                <span className="text-xs text-amber-400 ml-1">{policy.unit}</span>
              </div>
            </div>
            <div className="text-xs text-amber-300/70">{policy.description}</div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 p-3 rounded border border-blue-700/50 bg-blue-900/20 space-y-2">
        <h4 className="text-xs font-semibold text-blue-300">Queue Configuration Summary</h4>
        
        <div className="text-xs text-blue-200 space-y-2">
          {/* Effective max attempts */}
          <div>
            <span className="font-semibold">Effective Max Attempts:</span>{' '}
            {queueConfig.SceneHistoryMaxAttempts > 0 
              ? `${queueConfig.SceneHistoryMaxAttempts} (${(queueConfig.SceneHistoryMaxAttempts * queueConfig.SceneHistoryPollIntervalSeconds).toFixed(0)}s worst case)`
              : 'Unlimited (until MaxWaitTime)'
            }
          </div>

          {/* Total timeout window */}
          <div>
            <span className="font-semibold">Total Timeout Window:</span>{' '}
            {Math.max(
              queueConfig.SceneMaxWaitSeconds,
              queueConfig.SceneHistoryMaxAttempts > 0
                ? queueConfig.SceneHistoryMaxAttempts * queueConfig.SceneHistoryPollIntervalSeconds
                : 0
            )}s
          </div>

          {/* Retry budget */}
          <div>
            <span className="font-semibold">Retry Budget:</span>{' '}
            {queueConfig.SceneRetryBudget > 0 
              ? `${queueConfig.SceneRetryBudget} automatic requeue${queueConfig.SceneRetryBudget !== 1 ? 's' : ''}`
              : 'No automatic retries'
            }
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueuePolicyCard;
