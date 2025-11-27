import React, { useState, useEffect } from 'react';
import { useUsage, RATE_LIMITS } from '../contexts/UsageContext';
import { useGenerationMetricsOptional } from '../contexts/GenerationMetricsContext';
import { useLocalGenerationSettings } from '../contexts/LocalGenerationSettingsContext';
import { getFeatureFlag } from '../utils/featureFlags';
import { ApiCallLog } from '../types';
import BarChartIcon from './icons/BarChartIcon';
import TrashIcon from './icons/TrashIcon';
import BayesianAnalyticsPanel from './BayesianAnalyticsPanel';

const RateLimitMeter: React.FC<{ model: keyof typeof RATE_LIMITS; logs: ApiCallLog[] }> = ({ model, logs }) => {
    const [rpm, setRpm] = useState(0);
    const limitInfo = RATE_LIMITS[model];
    if (!limitInfo) return null; // In case an unknown model is logged
    const { rpm: limit, name } = limitInfo;

    useEffect(() => {
        const calculateRpm = () => {
            const oneMinuteAgo = Date.now() - 60000;
            const recentRequests = logs.filter(log => log.model === model && log.timestamp > oneMinuteAgo).length;
            setRpm(recentRequests);
        };
        
        calculateRpm();
        const interval = setInterval(calculateRpm, 5000); // Recalculate every 5s
        return () => clearInterval(interval);
    }, [logs, model]);
    
    const percentage = Math.min(100, (rpm / limit) * 100);
    let barColor = 'bg-green-500';
    if (percentage > 50) barColor = 'bg-yellow-500';
    if (percentage > 80) barColor = 'bg-red-500';

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium text-gray-300">{name}</span>
                <span className="text-xs font-mono text-gray-400">{rpm} / {limit} RPM</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div className={`${barColor} h-2.5 rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
            </div>
        </div>
    );
};

const UsageDashboard: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { usage, clearUsage } = useUsage();
  const { logs, totalRequests, totalTokens, estimatedCost } = usage;
  
  // Optional metrics context (may not be available if provider missing)
  const metricsContext = useGenerationMetricsOptional();
  const { localGenSettings } = useLocalGenerationSettings();
  
  // Feature flag for Bayesian analytics
  const showBayesianAnalytics = getFeatureFlag(localGenSettings?.featureFlags, 'showBayesianAnalytics');

  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-dashboard-title"
    >
        <div 
            className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" 
            onClick={(e) => e.stopPropagation()}
        >
            <header className="flex justify-between items-center p-4 border-b border-gray-700">
                <h3 id="usage-dashboard-title" className="flex items-center text-lg font-bold text-amber-400">
                    <BarChartIcon className="w-5 h-5 mr-2" />
                    API Usage & Cost Analysis
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
            </header>
            
            <div className="p-6 overflow-y-auto">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-900/50 p-4 rounded-lg text-center ring-1 ring-gray-700/80">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Total Requests</p>
                        <p className="text-3xl font-bold text-white mt-1">{totalRequests}</p>
                    </div>
                     <div className="bg-gray-900/50 p-4 rounded-lg text-center ring-1 ring-gray-700/80">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Total Tokens</p>
                        <p className="text-3xl font-bold text-white mt-1">{totalTokens.toLocaleString()}</p>
                    </div>
                     <div className="bg-gray-900/50 p-4 rounded-lg text-center ring-1 ring-gray-700/80">
                        <p className="text-xs text-gray-400 uppercase tracking-wider">Est. Session Cost</p>
                        <p className="text-3xl font-bold text-white mt-1">${estimatedCost.toFixed(4)}</p>
                    </div>
                </div>

                {/* Rate Limit Analysis */}
                <div className="bg-gray-900/50 p-4 rounded-lg mb-6 ring-1 ring-gray-700/80">
                     <h4 className="text-md font-semibold text-gray-200 mb-3">Rate Limit Analysis (Requests Per Minute)</h4>
                     <div className="space-y-4">
                        <RateLimitMeter model="gemini-2.5-flash" logs={logs} />
                        <RateLimitMeter model="gemini-2.5-pro" logs={logs} />
                        <RateLimitMeter model="gemini-2.5-flash-image" logs={logs} />
                     </div>
                </div>

                {/* Bayesian A/B Testing Analytics - Feature Flag Controlled */}
                {showBayesianAnalytics && metricsContext && (
                    <div className="mb-6">
                        <BayesianAnalyticsPanel 
                            metrics={metricsContext.metrics}
                            defaultCollapsed={true}
                        />
                    </div>
                )}

                {/* API Call Log */}
                <div>
                     <h4 className="text-md font-semibold text-gray-200 mb-3">API Call Log</h4>
                     <div className="max-h-80 overflow-y-auto bg-gray-900/50 rounded-lg ring-1 ring-gray-700/80">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700/50 sticky top-0 backdrop-blur-sm">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Time</th>
                                    <th scope="col" className="px-4 py-2">Context</th>
                                    <th scope="col" className="px-4 py-2">Model</th>
                                    <th scope="col" className="px-4 py-2">Tokens</th>
                                    <th scope="col" className="px-4 py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center p-4 text-gray-500">No API calls logged yet.</td></tr>
                                ) : logs.map((log, index) => (
                                    <tr key={log.id} className={`border-b border-gray-700 ${index % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/40'}`}>
                                        <td className="px-4 py-2 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                        <td className="px-4 py-2">{log.context}</td>
                                        <td className="px-4 py-2 font-mono">{log.model.replace('gemini-2.5-', '')}</td>
                                        <td className="px-4 py-2 font-mono">{log.tokens.toLocaleString()}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${log.status === 'success' ? 'bg-green-800/70 text-green-300' : 'bg-red-800/70 text-red-300'}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     </div>
                </div>
            </div>

            <footer className="p-4 border-t border-gray-700 mt-auto flex justify-between items-center bg-gray-900/50 rounded-b-lg">
                <p className="text-xs text-gray-500">Costs are estimates for educational purposes.</p>
                <button 
                    onClick={clearUsage}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-all duration-200 bg-red-800/50 border-red-700 text-red-300 hover:bg-red-800 hover:border-red-600"
                >
                    <TrashIcon className="w-3 h-3" />
                    Clear Log
                </button>
            </footer>
        </div>
    </div>
  );
};

export default UsageDashboard;