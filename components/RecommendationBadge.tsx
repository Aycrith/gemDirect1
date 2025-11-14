/**
 * RecommendationBadge Component
 * 
 * Displays AI-generated performance recommendations with severity indicators
 * and dismissal functionality. Supports multiple recommendation types with
 * color-coded severity levels.
 */

import React, { useState } from 'react';
import { StoredRecommendation } from '../services/runHistoryService';

interface RecommendationBadgeProps {
  recommendation: StoredRecommendation;
  onDismiss?: (id: string) => void;
  compact?: boolean;
}

const RecommendationBadge: React.FC<RecommendationBadgeProps> = ({
  recommendation,
  onDismiss,
  compact = false
}) => {
  const [isDismissing, setIsDismissing] = useState(false);

  const getSeverityColor = (): string => {
    switch (recommendation.severity) {
      case 'critical':
        return 'bg-red-500/20 border-red-500/50 text-red-300';
      case 'warning':
        return 'bg-amber-500/20 border-amber-500/50 text-amber-300';
      case 'info':
      default:
        return 'bg-blue-500/20 border-blue-500/50 text-blue-300';
    }
  };

  const getSeverityIcon = (): string => {
    switch (recommendation.severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const getTypeIcon = (): string => {
    switch (recommendation.type) {
      case 'gpu':
        return '🖥️';
      case 'performance':
        return '⚡';
      case 'success_rate':
        return '✓';
      case 'retry':
        return '🔄';
      case 'timeout':
        return '⏱️';
      case 'memory':
        return '💾';
      default:
        return '📋';
    }
  };

  const handleDismiss = async () => {
    if (!onDismiss) return;
    setIsDismissing(true);
    try {
      onDismiss(recommendation.id);
    } finally {
      setIsDismissing(false);
    }
  };

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${getSeverityColor()}`}
      >
        <span>{getSeverityIcon()}</span>
        <span>{getTypeIcon()}</span>
        <span className="truncate max-w-xs">{recommendation.message}</span>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            disabled={isDismissing}
            className="ml-1 hover:opacity-70 disabled:opacity-50"
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`p-3 rounded border space-y-2 ${getSeverityColor()}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-lg flex-shrink-0">{getSeverityIcon()}</span>
          <div className="flex-1">
            <div className="font-semibold text-sm capitalize">
              {recommendation.type}
            </div>
            <p className="text-xs mt-1 opacity-90">
              {recommendation.message}
            </p>
            {recommendation.suggestedAction && (
              <p className="text-xs mt-2 opacity-80">
                <strong>Action:</strong> {recommendation.suggestedAction}
              </p>
            )}
            {recommendation.confidence > 0 && (
              <div className="text-xs mt-2 opacity-75">
                <strong>Confidence:</strong> {recommendation.confidence.toFixed(0)}%
              </div>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            disabled={isDismissing}
            className="ml-2 px-2 py-1 text-xs rounded hover:opacity-70 disabled:opacity-50 transition-opacity"
            title="Dismiss this recommendation"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default RecommendationBadge;
