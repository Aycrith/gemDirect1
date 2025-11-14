import React from 'react';

interface FallbackWarning {
  type: 'exit_reason' | 'execution_success' | 'timeout' | 'unknown';
  reason: string;
  severity: 'error' | 'warning' | 'info';
  description?: string;
  details?: string;
}

interface FallbackWarningsCardProps {
  exitReason?: string | null;
  executionSuccessDetected?: boolean;
  postExecutionTimeoutReached?: boolean;
  title?: string;
}

/**
 * Maps fallback reasons to severity levels and descriptions
 */
const getWarningInfo = (exitReason?: string | null): FallbackWarning[] => {
  const warnings: FallbackWarning[] = [];

  // Exit Reason Warnings
  if (exitReason) {
    const exitReasonUpper = exitReason.toUpperCase();
    
    if (exitReasonUpper.includes('TIMEOUT') || exitReasonUpper.includes('DEADLINE')) {
      warnings.push({
        type: 'exit_reason',
        reason: 'Execution Timeout',
        severity: 'error',
        description: 'Scene generation exceeded maximum execution time',
        details: `Exit reason: ${exitReason}`
      });
    } else if (exitReasonUpper.includes('QUEUE') || exitReasonUpper.includes('FAILED')) {
      warnings.push({
        type: 'exit_reason',
        reason: 'Queue Error',
        severity: 'error',
        description: 'Scene failed in processing queue',
        details: `Exit reason: ${exitReason}`
      });
    } else if (exitReasonUpper.includes('MEMORY') || exitReasonUpper.includes('OOM')) {
      warnings.push({
        type: 'exit_reason',
        reason: 'Memory Error',
        severity: 'error',
        description: 'Insufficient GPU or system memory',
        details: `Exit reason: ${exitReason}`
      });
    } else if (exitReasonUpper.includes('CANCEL')) {
      warnings.push({
        type: 'exit_reason',
        reason: 'Cancelled',
        severity: 'warning',
        description: 'Scene generation was cancelled',
        details: `Exit reason: ${exitReason}`
      });
    } else if (exitReasonUpper.includes('SKIP') || exitReasonUpper.includes('RETRY')) {
      warnings.push({
        type: 'exit_reason',
        reason: 'Retried/Skipped',
        severity: 'info',
        description: 'Scene was retried or skipped in processing',
        details: `Exit reason: ${exitReason}`
      });
    } else {
      warnings.push({
        type: 'exit_reason',
        reason: 'Unknown Exit',
        severity: 'warning',
        description: 'Scene exited with unknown reason',
        details: `Exit reason: ${exitReason}`
      });
    }
  }

  return warnings;
};

/**
 * Maps severity to color classes
 */
const getSeverityClasses = (severity: 'error' | 'warning' | 'info'): { bg: string; border: string; badge: string; text: string } => {
  switch (severity) {
    case 'error':
      return {
        bg: 'bg-red-900/20',
        border: 'border-red-700/50',
        badge: 'bg-red-900 text-red-300',
        text: 'text-red-300'
      };
    case 'warning':
      return {
        bg: 'bg-yellow-900/20',
        border: 'border-yellow-700/50',
        badge: 'bg-yellow-900 text-yellow-300',
        text: 'text-yellow-300'
      };
    case 'info':
      return {
        bg: 'bg-blue-900/20',
        border: 'border-blue-700/50',
        badge: 'bg-blue-900 text-blue-300',
        text: 'text-blue-300'
      };
  }
};

const FallbackWarningsCard: React.FC<FallbackWarningsCardProps> = ({
  exitReason,
  executionSuccessDetected,
  postExecutionTimeoutReached,
  title = 'Fallback Warnings & Diagnostics'
}) => {
  const exitReasonWarnings = getWarningInfo(exitReason);
  
  const allWarnings = [
    ...exitReasonWarnings,
    ...(postExecutionTimeoutReached ? [{
      type: 'timeout' as const,
      reason: 'Post-Execution Timeout',
      severity: 'warning' as const,
      description: 'Timeout occurred after execution was detected',
      details: 'Generation may have been interrupted after completion detection'
    }] : [])
  ];

  // If no warnings but execution detected, show success info
  const showSuccess = executionSuccessDetected && allWarnings.length === 0;

  if (!exitReason && !postExecutionTimeoutReached && !executionSuccessDetected) {
    return (
      <div className="text-sm text-gray-400">
        No fallback warnings or diagnostics available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">{title}</h3>

      {showSuccess && (
        <div className="p-3 rounded border border-green-700/50 bg-green-900/20">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-900 text-green-300 text-xs font-bold">✓</span>
            <span className="text-sm font-semibold text-green-300">Execution Success Detected</span>
          </div>
          <p className="text-xs text-green-300/70 mt-1">No fallback mechanisms were required</p>
        </div>
      )}

      {allWarnings.length > 0 && (
        <div className="space-y-2">
          {allWarnings.map((warning, idx) => {
            const classes = getSeverityClasses(warning.severity);
            return (
              <div
                key={idx}
                className={`p-3 rounded border ${classes.border} ${classes.bg} space-y-2`}
              >
                <div className="flex items-start gap-2">
                  <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold ${classes.badge}`}>
                    {warning.severity.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${classes.text}`}>
                      {warning.reason}
                    </div>
                    {warning.description && (
                      <div className="text-xs text-gray-300 mt-0.5">
                        {warning.description}
                      </div>
                    )}
                  </div>
                </div>

                {warning.details && (
                  <div className="pl-6 pt-1 border-l border-gray-600/50 text-xs text-gray-400 font-mono">
                    {warning.details}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      {allWarnings.length > 0 && (
        <div className="mt-4 p-3 rounded border border-indigo-700/50 bg-indigo-900/20 space-y-2">
          <h4 className="text-xs font-semibold text-indigo-300">Recommendations</h4>
          
          <ul className="text-xs text-indigo-200 space-y-1 list-disc list-inside">
            {allWarnings.some(w => w.severity === 'error') && (
              <li>Review GPU memory and system resources before retrying</li>
            )}
            {allWarnings.some(w => w.type === 'timeout') && (
              <li>Consider increasing timeout thresholds for complex scenes</li>
            )}
            {allWarnings.some(w => w.type === 'exit_reason' && w.reason === 'Cancelled') && (
              <li>Check if scene was manually cancelled or if resources were exhausted</li>
            )}
            {allWarnings.length > 0 && (
              <li>Enable detailed logging to diagnose root cause</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FallbackWarningsCard;
