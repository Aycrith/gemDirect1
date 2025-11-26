import React, { useCallback } from 'react';
import { useProviderHealth, ProviderHealthStatus } from '../hooks/useProviderHealth';
import { useLocalGenerationSettings } from '../contexts/LocalGenerationSettingsContext';
import { isFeatureEnabled } from '../utils/featureFlags';
import { notifyProviderHealth } from '../utils/qualityNotifications';

interface ProviderHealthIndicatorProps {
    /** Optional toast function */
    addToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    /** Show compact indicator only */
    compact?: boolean;
    /** Optional class name */
    className?: string;
}

/**
 * ProviderHealthIndicator - Shows real-time ComfyUI health status
 * 
 * Features:
 * - Shows health status when providerHealthPolling feature flag is enabled
 * - Auto-polls ComfyUI at configured interval
 * - Displays server, workflow, and queue status
 * - Manual check button for on-demand health checks
 * 
 * @example
 * ```tsx
 * <ProviderHealthIndicator addToast={addToast} />
 * ```
 */
const ProviderHealthIndicator: React.FC<ProviderHealthIndicatorProps> = ({
    addToast,
    compact = false,
    className = '',
}) => {
    const { settings } = useLocalGenerationSettings();

    // Only render if providerHealthPolling is enabled
    const isEnabled = isFeatureEnabled(settings?.featureFlags, 'providerHealthPolling');

    const handleHealthChange = useCallback((newStatus: ProviderHealthStatus) => {
        // Only notify on actual health changes (transitions), not initial load
        if (newStatus.lastCheckedAt && addToast) {
            // Call notifyProviderHealth with the correct signature
            notifyProviderHealth(
                addToast,
                'ComfyUI',
                newStatus.ready,
                newStatus.error || undefined
            );
        }
    }, [addToast]);

    const handleUnhealthy = useCallback((error: string) => {
        if (addToast) {
            addToast(`ComfyUI: ${error}`, 'error');
        }
    }, [addToast]);

    const { status, checkNow, isPolling, startPolling, stopPolling } = useProviderHealth({
        settings,
        enablePolling: isEnabled,
        onHealthChange: handleHealthChange,
        onUnhealthy: handleUnhealthy,
    });

    // Don't render if feature is disabled or no settings
    if (!isEnabled || !settings) {
        return null;
    }

    const getStatusIcon = () => {
        if (status.checking) {
            return (
                <svg
                    className="animate-spin h-4 w-4 text-blue-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            );
        }
        if (status.ready) {
            return <span className="text-green-400">●</span>;
        }
        if (status.error) {
            return <span className="text-red-400">●</span>;
        }
        return <span className="text-gray-400">○</span>;
    };

    const getStatusText = () => {
        if (status.checking) return 'Checking...';
        if (status.ready) return 'Ready';
        if (status.error) return 'Offline';
        return 'Unknown';
    };

    const getStatusColor = () => {
        if (status.checking) return 'text-blue-400 border-blue-500/50';
        if (status.ready) return 'text-green-400 border-green-500/50';
        if (status.error) return 'text-red-400 border-red-500/50';
        return 'text-gray-400 border-gray-500/50';
    };

    const formatNextCheck = () => {
        if (!status.nextCheckIn || !isPolling) return null;
        const seconds = Math.ceil(status.nextCheckIn / 1000);
        return `${seconds}s`;
    };

    if (compact) {
        return (
            <button
                onClick={() => checkNow()}
                disabled={status.checking}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border bg-gray-800/50 hover:bg-gray-700/50 transition-colors ${getStatusColor()} ${className}`}
                title={`ComfyUI: ${getStatusText()}${status.error ? ` - ${status.error}` : ''}`}
            >
                {getStatusIcon()}
                <span className="hidden sm:inline">ComfyUI</span>
            </button>
        );
    }

    return (
        <div
            data-testid="provider-health-indicator"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-gray-800/50 ${getStatusColor()} ${className}`}
        >
            {/* Status Icon */}
            <div className="flex items-center gap-2">
                {getStatusIcon()}
                <span className="text-sm font-medium">{getStatusText()}</span>
            </div>

            {/* Queue Info */}
            {status.queueInfo && status.ready && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 border-l border-gray-600 pl-3">
                    <span title="Running jobs">🔄 {status.queueInfo.queue_running}</span>
                    <span title="Pending jobs">⏳ {status.queueInfo.queue_pending}</span>
                </div>
            )}

            {/* Warnings */}
            {status.warnings.length > 0 && (
                <div className="hidden md:flex items-center gap-1 text-xs text-amber-400" title={status.warnings.join('\n')}>
                    <span>⚠️</span>
                    <span>{status.warnings.length}</span>
                </div>
            )}

            {/* Error */}
            {status.error && (
                <div className="hidden md:block text-xs text-red-400 truncate max-w-[150px]" title={status.error}>
                    {status.error}
                </div>
            )}

            {/* Next Check */}
            {isPolling && formatNextCheck() && (
                <div className="text-xs text-gray-500" title="Time until next health check">
                    {formatNextCheck()}
                </div>
            )}

            {/* Manual Check Button */}
            <button
                onClick={() => checkNow()}
                disabled={status.checking}
                className="text-xs text-gray-400 hover:text-gray-200 disabled:text-gray-600 transition-colors"
                title="Check now"
            >
                ↻
            </button>

            {/* Polling Toggle */}
            <button
                onClick={() => isPolling ? stopPolling() : startPolling()}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    isPolling 
                        ? 'border-green-500/50 text-green-400 hover:bg-green-900/30' 
                        : 'border-gray-600 text-gray-400 hover:bg-gray-700/50'
                }`}
                title={isPolling ? 'Stop auto-polling' : 'Start auto-polling'}
            >
                {isPolling ? '⏸' : '▶'}
            </button>
        </div>
    );
};

export default React.memo(ProviderHealthIndicator);
