/**
 * Generation Queue Status Indicator
 * 
 * Displays the current state of the generation queue including:
 * - Queue depth (pending/running items)
 * - Circuit breaker status
 * - Health indicator
 * - Basic stats (success rate, avg times)
 * 
 * @module components/QueueStatusIndicator
 */

import React from 'react';
import { useGenerationQueue } from '../hooks/useGenerationQueueState';
import { FeatureFlags } from '../utils/featureFlags';
import './QueueStatusIndicator.css';

interface Props {
    featureFlags?: Partial<FeatureFlags>;
    /** Show detailed stats panel */
    showDetails?: boolean;
    /** Compact mode for inline display */
    compact?: boolean;
}

/**
 * Health status colors
 */
const healthColors: Record<string, string> = {
    'healthy': '#22c55e',      // Green
    'degraded': '#f59e0b',     // Amber
    'failing': '#ef4444',      // Red
    'circuit-open': '#dc2626', // Dark red
};

/**
 * Health status icons
 */
const healthIcons: Record<string, string> = {
    'healthy': '✓',
    'degraded': '⚠',
    'failing': '✗',
    'circuit-open': '🔒',
};

/**
 * Queue Status Indicator Component
 */
export const QueueStatusIndicator: React.FC<Props> = ({
    featureFlags,
    showDetails = false,
    compact = false,
}) => {
    const {
        isEnabled,
        size,
        pendingCount,
        isRunning,
        isCircuitOpen,
        consecutiveFailures,
        healthStatus,
        successRate,
        avgWaitTimeFormatted,
        avgExecTimeFormatted,
        stats,
        cancelAll,
        resetCircuitBreaker,
    } = useGenerationQueue(featureFlags);

    // Don't render if queue is disabled
    if (!isEnabled) {
        return null;
    }

    const statusColor = healthColors[healthStatus];
    const statusIcon = healthIcons[healthStatus];

    // Compact mode - just an indicator badge
    if (compact) {
        return (
            <span 
                className="queue-indicator-compact"
                style={{ color: statusColor }}
                title={`Queue: ${size} items, ${healthStatus}`}
            >
                <span className="queue-indicator-icon">{statusIcon}</span>
                {size > 0 && <span className="queue-indicator-count">{size}</span>}
            </span>
        );
    }

    return (
        <div className="queue-status-container">
            {/* Header with status */}
            <div className="queue-status-header">
                <span 
                    className="queue-status-badge"
                    style={{ backgroundColor: statusColor }}
                >
                    {statusIcon}
                </span>
                <span className="queue-status-title">Generation Queue</span>
            </div>

            {/* Queue depth */}
            <div className="queue-status-row">
                <span className="queue-status-label">Queue</span>
                <span className="queue-status-value">
                    {size === 0 ? (
                        'Empty'
                    ) : (
                        <>
                            {isRunning && <span className="queue-running-dot">●</span>}
                            {isRunning ? 1 : 0} running, {pendingCount} pending
                        </>
                    )}
                </span>
            </div>

            {/* Circuit breaker status */}
            {(isCircuitOpen || consecutiveFailures > 0) && (
                <div className="queue-status-row queue-status-warning">
                    <span className="queue-status-label">
                        {isCircuitOpen ? 'Circuit Open' : 'Failures'}
                    </span>
                    <span className="queue-status-value">
                        {isCircuitOpen ? (
                            <button 
                                className="queue-action-btn"
                                onClick={resetCircuitBreaker}
                                title="Reset circuit breaker to allow new tasks"
                            >
                                Reset
                            </button>
                        ) : (
                            `${consecutiveFailures} consecutive`
                        )}
                    </span>
                </div>
            )}

            {/* Detailed stats */}
            {showDetails && (
                <div className="queue-status-details">
                    <div className="queue-status-row">
                        <span className="queue-status-label">Success Rate</span>
                        <span className="queue-status-value">
                            {successRate.toFixed(1)}%
                        </span>
                    </div>
                    <div className="queue-status-row">
                        <span className="queue-status-label">Completed</span>
                        <span className="queue-status-value">
                            {stats.totalCompleted} / {stats.totalQueued}
                        </span>
                    </div>
                    <div className="queue-status-row">
                        <span className="queue-status-label">Avg Wait</span>
                        <span className="queue-status-value">
                            {avgWaitTimeFormatted}
                        </span>
                    </div>
                    <div className="queue-status-row">
                        <span className="queue-status-label">Avg Exec</span>
                        <span className="queue-status-value">
                            {avgExecTimeFormatted}
                        </span>
                    </div>
                </div>
            )}

            {/* Actions */}
            {size > 1 && (
                <div className="queue-status-actions">
                    <button 
                        className="queue-action-btn queue-action-danger"
                        onClick={cancelAll}
                        title="Cancel all pending tasks"
                    >
                        Cancel All ({pendingCount})
                    </button>
                </div>
            )}
        </div>
    );
};

export default QueueStatusIndicator;
