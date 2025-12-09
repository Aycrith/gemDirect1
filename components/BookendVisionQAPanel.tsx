/**
 * BookendVisionQAPanel - Displays bookend vision QA status in the app UI.
 * 
 * Shows a summary of the latest vision QA run, including:
 * - Overall pass/warn/fail counts
 * - Per-sample status table
 * - Aggregated metrics indicator
 * 
 * Data Source:
 * This component expects vision QA results to be copied to public/vision-qa-latest.json
 * after running the bookend:vision-qa pipeline. In dev mode, you can use:
 *   npm run bookend:vision-qa
 *   cp temp/vision-qa-<timestamp>/vision-qa-results.json public/vision-qa-latest.json
 * 
 * For production, this panel will show "No results found" if no data is available,
 * which is expected since vision QA is a development/QA-only pipeline.
 * 
 * Threshold Logic:
 * Uses calculateSampleVerdict() from services/visionThresholdConfig.ts for UI verdicts.
 * This function has a WARN zone for passing values that are close to thresholds.
 * 
 * IMPORTANT: Do NOT replace with checkCoherenceThresholds() — the semantic difference
 * is intentional. See Documentation/QA_SEMANTICS.md for full explanation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
    calculateSampleVerdict, 
    WARNING_MARGIN,
    type Verdict
} from '../services/visionThresholdConfig';
import {
    fetchVisionQAResults,
    fetchVisionThresholds,
    fetchVisionQAHistory,
    type VisionQAResults,
    type VisionQASample,
} from '../services/staticDataService';

// Threshold interface (simplified for display)
interface VisionThresholds {
    version: string;
    globalDefaults: {
        minOverall: number;
        minFocusStability: number;
        maxArtifactSeverity: number;
        minObjectConsistency: number;
    };
    perSampleOverrides?: Record<string, {
        minOverall?: number;
        minFocusStability?: number;
        maxArtifactSeverity?: number;
        minObjectConsistency?: number;
        warnMargin?: number;  // Optional per-sample warn margin
        aggregatedMedian?: {  // Optional reference to calibration data
            overall?: number;
            focus?: number;
            artifacts?: number;
            objConsist?: number;
        };
    }>;
    thresholdStrategy?: {
        bandStrategy?: string;
        description?: string;
        warnMargin?: number;
    };
}

// Sample verdict data (extends shared SampleVerdictResult with UI-specific fields)
interface SampleVerdictData {
    sampleId: string;
    shortId: string;
    verdict: Verdict;
    overall: number;
    focusStability: number;
    artifactSeverity: number;
    objectConsistency: number;
    isAggregated: boolean;
    hasBlackFrames: boolean;
    hasHardFlicker: boolean;
    warnings: string[];
    failures: string[];
    // Variance data from aggregatedMetrics (if available)
    variance?: {
        overallStdDev?: number;
        overallMin?: number;
        overallMax?: number;
        focusStdDev?: number;
        artifactStdDev?: number;
        objConsistStdDev?: number;
    };
    // Thresholds used for this sample
    thresholds: {
        minOverall: number;
        minFocusStability: number;
        maxArtifactSeverity: number;
        minObjectConsistency: number;
    };
}

interface BookendVisionQAPanelProps {
    defaultCollapsed?: boolean;
}

/**
 * Calculate verdict for a sample using unified threshold logic.
 * Wraps the shared calculateSampleVerdict to add UI-specific metadata.
 */
function calculateVerdictForSample(
    sample: VisionQASample,
    thresholds: VisionThresholds,
    sampleId: string
): SampleVerdictData {
    const aggregated = sample.aggregatedMetrics;
    const useAggregated = !!(aggregated?.overall?.median !== undefined);
    
    // Get effective thresholds
    const defaults = thresholds.globalDefaults;
    const override = thresholds.perSampleOverrides?.[sampleId];
    
    const minOverall = override?.minOverall ?? defaults.minOverall;
    const minFocusStability = override?.minFocusStability ?? defaults.minFocusStability;
    const maxArtifactSeverity = override?.maxArtifactSeverity ?? defaults.maxArtifactSeverity;
    const minObjectConsistency = override?.minObjectConsistency ?? defaults.minObjectConsistency;
    
    // Get warn margin (per-sample, threshold-level, or default from shared config)
    const warnMargin = override?.warnMargin ?? thresholds.thresholdStrategy?.warnMargin ?? WARNING_MARGIN;
    
    // Get metrics
    const overall = useAggregated ? (aggregated?.overall?.median ?? 0) : (sample.scores?.overall ?? 0);
    const focusStability = useAggregated ? (aggregated?.focusStability?.median ?? 0) : (sample.scores?.focusStability ?? 0);
    const artifactSeverity = useAggregated ? (aggregated?.artifactSeverity?.median ?? 100) : (sample.scores?.artifactSeverity ?? 100);
    const objectConsistency = useAggregated ? (aggregated?.objectConsistency?.median ?? 0) : (sample.scores?.objectConsistency ?? 0);
    
    const hasBlackFrames = sample.frameAnalysis?.hasBlackFrames ?? false;
    const hasHardFlicker = sample.frameAnalysis?.hasHardFlicker ?? false;
    
    // Use shared verdict calculation
    const verdictResult = calculateSampleVerdict(
        {
            overall,
            focusStability,
            artifactSeverity,
            objectConsistency,
            hasBlackFrames,
            hasHardFlicker,
        },
        {
            minOverall,
            minFocusStability,
            maxArtifactSeverity,
            minObjectConsistency,
            disallowBlackFrames: true,
            disallowHardFlicker: true,
        },
        warnMargin
    );
    
    // Extract variance data if available
    const variance = useAggregated ? {
        overallStdDev: aggregated?.overall?.stdDev,
        overallMin: aggregated?.overall?.min,
        overallMax: aggregated?.overall?.max,
        focusStdDev: aggregated?.focusStability?.stdDev,
        artifactStdDev: aggregated?.artifactSeverity?.stdDev,
        objConsistStdDev: aggregated?.objectConsistency?.stdDev,
    } : undefined;
    
    return {
        sampleId,
        shortId: sampleId.replace('sample-', ''),
        verdict: verdictResult.verdict,
        overall,
        focusStability,
        artifactSeverity,
        objectConsistency,
        isAggregated: useAggregated,
        hasBlackFrames,
        hasHardFlicker,
        warnings: verdictResult.warnings,
        failures: verdictResult.failures,
        variance,
        thresholds: {
            minOverall,
            minFocusStability,
            maxArtifactSeverity,
            minObjectConsistency,
        },
    };
}

const VerdictBadge: React.FC<{ verdict: Verdict }> = ({ verdict }) => {
    const colors: Record<Verdict, string> = {
        PASS: 'bg-green-800/70 text-green-300',
        WARN: 'bg-yellow-800/70 text-yellow-300',
        FAIL: 'bg-red-800/70 text-red-300',
    };
    
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[verdict]}`}>
            {verdict}
        </span>
    );
};

const BookendVisionQAPanel: React.FC<BookendVisionQAPanelProps> = ({ 
    defaultCollapsed = true 
}) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [results, setResults] = useState<VisionQAResults | null>(null);
    const [thresholds, setThresholds] = useState<VisionThresholds | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [usingFallbackThresholds, setUsingFallbackThresholds] = useState(false);
    const [lastBaseline, setLastBaseline] = useState<{ timestamp: string; thresholdVersion: string; runId: string } | null>(null);
    
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        setUsingFallbackThresholds(false);
        setLastBaseline(null);
        
        try {
            // Try to load results from public directory using service layer
            const resultsData = await fetchVisionQAResults();
            if (!resultsData) {
                // Not an error - just no results available
                setResults(null);
                setLoading(false);
                return;
            }
            
            setResults(resultsData);
            setLastUpdate(new Date());
            
            // Load thresholds from published JSON so UI matches gating config
            const { thresholds: thresholdsData, isFallback } = await fetchVisionThresholds();
            setThresholds(thresholdsData);
            setUsingFallbackThresholds(isFallback);
            
            // Try to load history for baseline info
            const historyData = await fetchVisionQAHistory();
            if (historyData?.entries?.length) {
                const lastEntry = historyData.entries[historyData.entries.length - 1];
                if (lastEntry) {
                    setLastBaseline({
                        timestamp: lastEntry.timestamp,
                        thresholdVersion: lastEntry.thresholdVersion ?? 'unknown',
                        runId: lastEntry.runId ?? 'unknown',
                    });
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load vision QA results');
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        loadData();
    }, [loadData]);
    
    // Calculate verdicts for all samples
    const verdicts: SampleVerdictData[] = [];
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    
    if (results && thresholds) {
        for (const [sampleId, sample] of Object.entries(results)) {
            if (!sampleId.startsWith('sample-')) continue;
            
            const verdict = calculateVerdictForSample(sample, thresholds, sampleId);
            verdicts.push(verdict);
            
            if (verdict.verdict === 'PASS') passCount++;
            else if (verdict.verdict === 'WARN') warnCount++;
            else failCount++;
        }
        
        // Sort by sample ID
        verdicts.sort((a, b) => a.sampleId.localeCompare(b.sampleId));
    }
    
    // Summary color
    const summaryColor = failCount > 0 ? 'text-red-400' : warnCount > 0 ? 'text-yellow-400' : 'text-green-400';
    
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg ring-1 ring-gray-700/80" data-testid="vision-qa-panel">
            <div 
                className="flex justify-between items-center cursor-pointer"
                onClick={() => setCollapsed(!collapsed)}
            >
                <h4 className="text-md font-semibold text-gray-200 flex items-center gap-2">
                    <span>🎬</span>
                    Bookend Vision QA
                    {!loading && results && (
                        <span className={`text-sm font-normal ${summaryColor}`}>
                            ({passCount} PASS / {warnCount} WARN / {failCount} FAIL)
                        </span>
                    )}
                </h4>
                <span className="text-gray-400 text-sm">
                    {collapsed ? '▸' : '▾'}
                </span>
            </div>
            
            {!collapsed && (
                <div className="mt-4">
                    {loading && (
                        <p className="text-sm text-gray-500 italic">Loading vision QA results...</p>
                    )}
                    
                    {error && (
                        <p className="text-sm text-red-400">{error}</p>
                    )}
                    
                    {!loading && !results && (
                        <div className="text-sm text-gray-500">
                            <p className="italic mb-2">No vision QA results found yet.</p>
                            <p className="text-xs text-gray-600 mb-1">
                                To generate results, run:
                            </p>
                            <code className="block bg-gray-800 px-2 py-1 rounded text-xs mb-1">
                                npm run bookend:vision-qa
                            </code>
                            <p className="text-xs text-gray-600 mb-1 mt-2">
                                Then publish to UI:
                            </p>
                            <code className="block bg-gray-800 px-2 py-1 rounded text-xs">
                                npm run bookend:vision-qa:publish
                            </code>
                        </div>
                    )}
                    
                    {!loading && results && thresholds && verdicts.length > 0 && (
                        <>
                            {/* Thresholds version and fallback warning */}
                            <div className="flex items-center gap-3 mb-3 text-xs flex-wrap">
                                <span className="text-gray-500">
                                    Thresholds: <span className="text-cyan-400 font-mono">v{thresholds.version}</span>
                                </span>
                                {lastBaseline && (
                                    <span className="text-gray-500">
                                        Baseline: <span className="text-gray-400">{new Date(lastBaseline.timestamp).toLocaleString()}</span>
                                        <span className="text-gray-600 ml-1">(v{lastBaseline.thresholdVersion})</span>
                                    </span>
                                )}
                                {usingFallbackThresholds && (
                                    <span className="bg-yellow-800/40 text-yellow-300 px-2 py-0.5 rounded">
                                        ⚠ Using default thresholds (vision-thresholds.json not found)
                                    </span>
                                )}
                            </div>
                            
                            {/* Summary stats */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-green-800/20 p-2 rounded text-center">
                                    <p className="text-xs text-gray-400">PASS</p>
                                    <p className="text-lg font-bold text-green-400">{passCount}</p>
                                </div>
                                <div className="bg-yellow-800/20 p-2 rounded text-center">
                                    <p className="text-xs text-gray-400">WARN</p>
                                    <p className="text-lg font-bold text-yellow-400">{warnCount}</p>
                                </div>
                                <div className="bg-red-800/20 p-2 rounded text-center">
                                    <p className="text-xs text-gray-400">FAIL</p>
                                    <p className="text-lg font-bold text-red-400">{failCount}</p>
                                </div>
                            </div>
                            
                            {/* Per-sample table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left text-gray-300">
                                    <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                                        <tr>
                                            <th className="px-2 py-1.5">Sample</th>
                                            <th className="px-2 py-1.5 text-right">Overall</th>
                                            <th className="px-2 py-1.5 text-right">Focus</th>
                                            <th className="px-2 py-1.5 text-right">Artifacts</th>
                                            <th className="px-2 py-1.5 text-right">ObjConsist</th>
                                            <th className="px-2 py-1.5 text-center">Verdict</th>
                                            <th className="px-2 py-1.5 text-center">Info</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {verdicts.map((v, idx) => {
                                            // Build tooltip with diagnostic info
                                            const tooltipLines: string[] = [];
                                            if (v.failures.length > 0) {
                                                tooltipLines.push(`Failures: ${v.failures.join(', ')}`);
                                            }
                                            if (v.warnings.length > 0) {
                                                tooltipLines.push(`Warnings: ${v.warnings.join(', ')}`);
                                            }
                                            tooltipLines.push(`Thresholds: overall≥${v.thresholds.minOverall}, focus≥${v.thresholds.minFocusStability}, artifacts≤${v.thresholds.maxArtifactSeverity}, objConsist≥${v.thresholds.minObjectConsistency}`);
                                            if (v.variance?.overallStdDev !== undefined) {
                                                tooltipLines.push(`Variance: overall ±${v.variance.overallStdDev.toFixed(1)} (range ${v.variance.overallMin}-${v.variance.overallMax})`);
                                            }
                                            const tooltip = tooltipLines.join('\n');
                                            
                                            // Determine if this sample is near any threshold
                                            const nearLimit = v.warnings.length > 0;
                                            
                                            return (
                                                <tr 
                                                    key={v.sampleId}
                                                    className={idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20'}
                                                    title={tooltip}
                                                >
                                                    <td className="px-2 py-1 font-mono">
                                                        {v.shortId}
                                                        {v.isAggregated && <span className="text-cyan-400 ml-0.5" title="Aggregated median from multi-run VLM">*</span>}
                                                    </td>
                                                    <td className={`px-2 py-1 text-right font-mono ${v.overall < v.thresholds.minOverall ? 'text-red-400' : nearLimit && v.warnings.some(w => w.includes('overall')) ? 'text-yellow-400' : ''}`}>
                                                        {v.overall}%
                                                        {v.variance?.overallStdDev !== undefined && (
                                                            <span className="text-gray-600 ml-0.5" title={`σ=${v.variance.overallStdDev.toFixed(1)}`}>±</span>
                                                        )}
                                                    </td>
                                                    <td className={`px-2 py-1 text-right font-mono ${v.focusStability < v.thresholds.minFocusStability ? 'text-red-400' : nearLimit && v.warnings.some(w => w.includes('focus')) ? 'text-yellow-400' : ''}`}>
                                                        {v.focusStability}
                                                    </td>
                                                    <td className={`px-2 py-1 text-right font-mono ${v.artifactSeverity > v.thresholds.maxArtifactSeverity ? 'text-red-400' : nearLimit && v.warnings.some(w => w.includes('artifacts')) ? 'text-yellow-400' : ''}`}>
                                                        {v.artifactSeverity}
                                                    </td>
                                                    <td className={`px-2 py-1 text-right font-mono ${v.objectConsistency < v.thresholds.minObjectConsistency ? 'text-red-400' : nearLimit && v.warnings.some(w => w.includes('objConsist')) ? 'text-yellow-400' : ''}`}>
                                                        {v.objectConsistency}
                                                    </td>
                                                    <td className="px-2 py-1 text-center">
                                                        <VerdictBadge verdict={v.verdict} />
                                                    </td>
                                                    <td className="px-2 py-1 text-center">
                                                        {nearLimit && (
                                                            <span className="text-yellow-500 cursor-help" title={`Near limit: ${v.warnings.join(', ')}`}>⚡</span>
                                                        )}
                                                        {v.failures.length > 0 && (
                                                            <span className="text-red-500 cursor-help" title={`Failed: ${v.failures.join(', ')}`}>❌</span>
                                                        )}
                                                        {v.hasBlackFrames && (
                                                            <span className="text-red-500 cursor-help ml-0.5" title="Has black frames">◼</span>
                                                        )}
                                                        {v.hasHardFlicker && (
                                                            <span className="text-red-500 cursor-help ml-0.5" title="Has hard flicker">⚡</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Legend */}
                            <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-4">
                                <span>* = aggregated median (multi-run)</span>
                                <span>± = variance available</span>
                                <span>⚡ = near threshold</span>
                                {lastUpdate && (
                                    <span>Last loaded: {lastUpdate.toLocaleTimeString()}</span>
                                )}
                            </div>
                            
                            {/* Refresh button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); loadData(); }}
                                className="mt-3 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                            >
                                Refresh
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default BookendVisionQAPanel;
