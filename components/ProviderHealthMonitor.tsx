import React, { useState, useEffect } from 'react';
import { getSystemHealthReport, SystemHealthReport, ProviderHealthStatus } from '../services/providerHealthService';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import HelpCircleIcon from './icons/HelpCircleIcon';
import RefreshCwIcon from './icons/RefreshCwIcon';

// XCircleIcon component (inline since not in icons folder)
const XCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

interface Props {
    comfyUIUrl?: string;
    className?: string;
}

const ProviderHealthMonitor: React.FC<Props> = ({ comfyUIUrl, className = '' }) => {
    const [report, setReport] = useState<SystemHealthReport | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const fetchHealth = async () => {
        setIsLoading(true);
        try {
            const healthReport = await getSystemHealthReport(comfyUIUrl);
            setReport(healthReport);
        } catch (error) {
            console.error('Failed to fetch health report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
        // Auto-refresh every 30 seconds if expanded
        const interval = isExpanded ? setInterval(fetchHealth, 30000) : undefined;
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [comfyUIUrl, isExpanded]);

    const getStatusIcon = (status: ProviderHealthStatus['status']) => {
        switch (status) {
            case 'healthy':
                return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
            case 'degraded':
                return <AlertTriangleIcon className="w-5 h-5 text-yellow-400" />;
            case 'unavailable':
                return <XCircleIcon className="w-5 h-5 text-red-400" />;
            default:
                return <HelpCircleIcon className="w-5 h-5 text-gray-400" />;
        }
    };

    const getStatusColor = (status: ProviderHealthStatus['status']) => {
        switch (status) {
            case 'healthy':
                return 'border-green-500/50 bg-green-900/20';
            case 'degraded':
                return 'border-yellow-500/50 bg-yellow-900/20';
            case 'unavailable':
                return 'border-red-500/50 bg-red-900/20';
            default:
                return 'border-gray-500/50 bg-gray-900/20';
        }
    };

    const overallStatus = report?.providers.some(p => p.status === 'unavailable') 
        ? 'warning' 
        : report?.providers.every(p => p.status === 'healthy') 
        ? 'healthy' 
        : 'degraded';

    return (
        <div className={`${className}`}>
            {/* Compact Status Bar */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700 rounded-lg transition-colors"
            >
                <div className="flex items-center gap-3">
                    {overallStatus === 'healthy' && <CheckCircleIcon className="w-5 h-5 text-green-400" />}
                    {overallStatus === 'degraded' && <AlertTriangleIcon className="w-5 h-5 text-yellow-400" />}
                    {overallStatus === 'warning' && <XCircleIcon className="w-5 h-5 text-red-400" />}
                    <span className="text-sm font-medium text-gray-200">
                        Provider Health Status
                    </span>
                    {isLoading && (
                        <RefreshCwIcon className="w-4 h-4 text-gray-400 animate-spin" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {report && (
                        <span className="text-xs text-gray-400">
                            {report.providers.filter(p => p.status === 'healthy').length}/{report.providers.length} healthy
                        </span>
                    )}
                    <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Expanded Details */}
            {isExpanded && report && (
                <div className="mt-2 space-y-3 p-4 bg-gray-900/50 border border-gray-700 rounded-lg">
                    {/* Provider Status Cards */}
                    <div className="space-y-2">
                        {report.providers.map(provider => (
                            <div
                                key={provider.providerId}
                                className={`flex items-start justify-between p-3 rounded-md border ${getStatusColor(provider.status)}`}
                            >
                                <div className="flex items-start gap-3">
                                    {getStatusIcon(provider.status)}
                                    <div>
                                        <div className="font-semibold text-sm text-gray-200">
                                            {provider.providerName}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {provider.message}
                                        </div>
                                    </div>
                                </div>
                                {provider.responseTime !== undefined && (
                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                        {provider.responseTime}ms
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Recommendations */}
                    {report.recommendations.length > 0 && (
                        <div className="pt-3 border-t border-gray-700">
                            <h5 className="text-xs font-semibold text-gray-400 uppercase mb-2">
                                Recommendations
                            </h5>
                            <ul className="space-y-1">
                                {report.recommendations.map((rec, idx) => (
                                    <li key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                                        <span className="mt-0.5">•</span>
                                        <span>{rec}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Refresh Button */}
                    <div className="pt-3 border-t border-gray-700 flex justify-between items-center">
                        <span className="text-xs text-gray-500">
                            Last checked: {new Date(report.timestamp).toLocaleTimeString()}
                        </span>
                        <button
                            onClick={fetchHealth}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md transition-colors disabled:opacity-50"
                        >
                            <RefreshCwIcon className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProviderHealthMonitor;
