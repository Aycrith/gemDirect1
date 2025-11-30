/**
 * Bayesian A/B Testing Analytics Panel
 * 
 * Collapsible panel displaying Bayesian comparison of prompt variants.
 * Shows probability bars, credible intervals, and statistical significance.
 * 
 * Feature flag controlled via `showBayesianAnalytics` for toggle-off near release.
 * 
 * @module components/BayesianAnalyticsPanel
 */

import React, { useState, useMemo } from 'react';
import {
    summarizeMetricsByVariant,
    bayesianCompareVariants,
    MIN_BAYESIAN_SAMPLE_SIZE,
    type GenerationMetrics,
    type MetricsSummary,
    type BayesianComparison,
} from '../services/generationMetrics';
import BarChartIcon from './icons/BarChartIcon';

// ============================================================================
// Types
// ============================================================================

interface BayesianAnalyticsPanelProps {
    /** Generation metrics to analyze */
    metrics: GenerationMetrics[];
    /** Whether the panel is initially collapsed */
    defaultCollapsed?: boolean;
    /** Callback when panel collapse state changes */
    onCollapseChange?: (collapsed: boolean) => void;
}

interface VariantCardProps {
    summary: MetricsSummary;
    credibleInterval?: [number, number];
    isControl?: boolean;
    isBetter?: boolean;
}

interface ComparisonDisplayProps {
    comparison: BayesianComparison;
    controlLabel?: string;
    treatmentLabel?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format probability as percentage with indicator
 */
const formatProbability = (p: number): string => {
    return `${(p * 100).toFixed(1)}%`;
};

/**
 * Get color class based on probability value
 */
const getProbabilityColor = (p: number): string => {
    if (p >= 0.95) return 'text-green-400';
    if (p >= 0.80) return 'text-emerald-400';
    if (p >= 0.60) return 'text-yellow-400';
    if (p >= 0.40) return 'text-gray-400';
    return 'text-red-400';
};

/**
 * Get confidence level label
 */
const getConfidenceLabel = (p: number): string => {
    if (p >= 0.95) return 'Very High';
    if (p >= 0.80) return 'High';
    if (p >= 0.60) return 'Moderate';
    if (p >= 0.40) return 'Uncertain';
    return 'Low';
};

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Displays a single variant's summary with optional credible interval
 */
const VariantCard: React.FC<VariantCardProps> = ({
    summary,
    credibleInterval,
    isControl = false,
    isBetter = false,
}) => {
    const successPercent = summary.successRate * 100;
    
    return (
        <div className={`
            p-3 rounded-lg border transition-all
            ${isBetter 
                ? 'bg-green-900/20 border-green-600/50' 
                : 'bg-gray-800/50 border-gray-700/50'}
        `}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className={`
                        text-xs font-medium px-2 py-0.5 rounded
                        ${isControl 
                            ? 'bg-blue-900/50 text-blue-300' 
                            : 'bg-purple-900/50 text-purple-300'}
                    `}>
                        {isControl ? 'Control' : 'Treatment'}
                    </span>
                    {isBetter && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-900/50 text-green-300">
                            ★ Winner
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-400">
                    n = {summary.sampleSize}
                </span>
            </div>
            
            <div className="mb-2">
                <p className="text-sm font-medium text-gray-200 truncate">
                    {summary.variantLabel || summary.variantId}
                </p>
            </div>
            
            {/* Success Rate */}
            <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Success Rate</span>
                    <span className="text-white font-mono">{successPercent.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all ${isBetter ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${successPercent}%` }}
                    />
                </div>
            </div>
            
            {/* Credible Interval */}
            {credibleInterval && (
                <div className="text-xs text-gray-400">
                    <span>95% CI: </span>
                    <span className="font-mono text-gray-300">
                        [{(credibleInterval[0] * 100).toFixed(1)}%, {(credibleInterval[1] * 100).toFixed(1)}%]
                    </span>
                </div>
            )}
            
            {/* Additional Metrics */}
            <div className="mt-3 pt-2 border-t border-gray-700/50 grid grid-cols-2 gap-2 text-xs">
                <div>
                    <span className="text-gray-500">Avg Time</span>
                    <p className="text-gray-300 font-mono">{(summary.avgGenerationTimeMs / 1000).toFixed(1)}s</p>
                </div>
                <div>
                    <span className="text-gray-500">Safety Filter</span>
                    <p className="text-gray-300 font-mono">{(summary.safetyFilterRate * 100).toFixed(1)}%</p>
                </div>
            </div>
        </div>
    );
};

/**
 * Displays Bayesian comparison with probability visualization
 */
const ComparisonDisplay: React.FC<ComparisonDisplayProps> = ({
    comparison,
    controlLabel,
    treatmentLabel,
}) => {
    const probability = comparison.probabilityTreatmentBetter;
    const controlWins = probability < 0.5;
    const winnerLabel = controlWins 
        ? (controlLabel || comparison.controlId)
        : (treatmentLabel || comparison.treatmentId);
    const winProbability = controlWins ? (1 - probability) : probability;
    
    return (
        <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
            <h4 className="text-sm font-medium text-gray-300 mb-3">
                Bayesian Comparison Result
            </h4>
            
            {/* Main Probability Display */}
            <div className="mb-4">
                <div className="flex items-baseline gap-2 mb-2">
                    <span className={`text-3xl font-bold ${getProbabilityColor(winProbability)}`}>
                        {formatProbability(winProbability)}
                    </span>
                    <span className="text-sm text-gray-400">
                        probability that
                    </span>
                </div>
                <p className="text-sm text-gray-200">
                    <span className="font-medium text-white">{winnerLabel}</span>
                    {' '}is the better variant
                </p>
            </div>
            
            {/* Probability Bar */}
            <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-blue-400">{controlLabel || 'Control'}</span>
                    <span className="text-purple-400">{treatmentLabel || 'Treatment'}</span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
                    <div 
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${(1 - probability) * 100}%` }}
                    />
                    <div 
                        className="h-full bg-purple-500 transition-all"
                        style={{ width: `${probability * 100}%` }}
                    />
                </div>
            </div>
            
            {/* Confidence Level */}
            <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Confidence Level:</span>
                <span className={`font-medium ${getProbabilityColor(winProbability)}`}>
                    {getConfidenceLabel(winProbability)}
                </span>
            </div>
            
            {/* Sample Size Warning */}
            {!comparison.hasMinSamples && (
                <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-300">
                    ⚠️ Low sample size. Need ≥{MIN_BAYESIAN_SAMPLE_SIZE} samples per variant for reliable results.
                </div>
            )}
        </div>
    );
};

/**
 * Empty state when no metrics available
 */
const EmptyState: React.FC = () => (
    <div className="p-6 text-center">
        <BarChartIcon className="w-12 h-12 mx-auto text-gray-600 mb-3" />
        <p className="text-gray-400 text-sm">
            No generation metrics available yet.
        </p>
        <p className="text-gray-500 text-xs mt-1">
            Generate content with different prompt variants to see Bayesian A/B comparisons.
        </p>
    </div>
);

/**
 * Insufficient variants state
 */
const InsufficientVariantsState: React.FC<{ variantCount: number }> = ({ variantCount }) => (
    <div className="p-6 text-center">
        <div className="w-12 h-12 mx-auto bg-gray-700 rounded-full flex items-center justify-center mb-3">
            <span className="text-2xl">📊</span>
        </div>
        <p className="text-gray-400 text-sm">
            {variantCount === 0 
                ? 'No variants detected in metrics.'
                : 'Only one variant detected.'}
        </p>
        <p className="text-gray-500 text-xs mt-1">
            A/B comparison requires at least 2 different prompt variants.
        </p>
    </div>
);

// ============================================================================
// Main Component
// ============================================================================

/**
 * Collapsible panel for Bayesian A/B testing analytics.
 * 
 * Displays:
 * - Variant summaries with success rates and credible intervals
 * - Bayesian probability comparison
 * - Confidence level indicators
 * - Sample size warnings
 */
export const BayesianAnalyticsPanel: React.FC<BayesianAnalyticsPanelProps> = ({
    metrics,
    defaultCollapsed = true,
    onCollapseChange,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    
    // Compute variant summaries
    const variantSummaries = useMemo(() => {
        if (metrics.length === 0) return new Map<string, MetricsSummary>();
        return summarizeMetricsByVariant(metrics);
    }, [metrics]);
    
    // Get sorted variant list (most samples first)
    const sortedVariants = useMemo(() => {
        return Array.from(variantSummaries.values())
            .sort((a, b) => b.sampleSize - a.sampleSize);
    }, [variantSummaries]);
    
    // Compute Bayesian comparison (first two variants with most samples)
    const comparison = useMemo((): BayesianComparison | null => {
        if (sortedVariants.length < 2) return null;
        
        const control = sortedVariants[0]!;
        const treatment = sortedVariants[1]!;
        
        return bayesianCompareVariants(control, treatment);
    }, [sortedVariants]);
    
    // Determine winner
    const winnerIndex = useMemo(() => {
        if (!comparison) return -1;
        return comparison.probabilityTreatmentBetter > 0.5 ? 1 : 0;
    }, [comparison]);
    
    // Handle collapse toggle
    const handleToggle = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        onCollapseChange?.(newState);
    };
    
    // Calculate alert indicator (show when we have a significant winner)
    const hasSignificantWinner = comparison && 
        comparison.hasMinSamples && 
        (comparison.probabilityTreatmentBetter > 0.9 || comparison.probabilityTreatmentBetter < 0.1);
    
    return (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
            {/* Header - Always Visible */}
            <button
                onClick={handleToggle}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                aria-expanded={!isCollapsed}
                aria-controls="bayesian-analytics-content"
            >
                <div className="flex items-center gap-3">
                    <BarChartIcon className="w-5 h-5 text-amber-400" />
                    <span className="font-medium text-gray-200">A/B Testing Analytics</span>
                    
                    {/* Alert Badge */}
                    {hasSignificantWinner && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-900/50 text-green-300 border border-green-700/50">
                            Winner Found
                        </span>
                    )}
                    
                    {/* Sample Count Badge */}
                    {metrics.length > 0 && (
                        <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400">
                            {metrics.length} samples
                        </span>
                    )}
                </div>
                
                {/* Collapse Indicator */}
                <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            {/* Content - Collapsible */}
            {!isCollapsed && (
                <div id="bayesian-analytics-content" className="px-4 pb-4 space-y-4">
                    {/* Empty State */}
                    {metrics.length === 0 && <EmptyState />}
                    
                    {/* Insufficient Variants */}
                    {metrics.length > 0 && sortedVariants.length < 2 && (
                        <InsufficientVariantsState variantCount={sortedVariants.length} />
                    )}
                    
                    {/* Comparison Display */}
                    {comparison && (
                        <ComparisonDisplay 
                            comparison={comparison}
                            controlLabel={sortedVariants[0]?.variantLabel || sortedVariants[0]?.variantId}
                            treatmentLabel={sortedVariants[1]?.variantLabel || sortedVariants[1]?.variantId}
                        />
                    )}
                    
                    {/* Variant Cards */}
                    {sortedVariants.length >= 2 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <VariantCard 
                                summary={sortedVariants[0]!}
                                credibleInterval={comparison?.credibleIntervalControl}
                                isControl
                                isBetter={winnerIndex === 0}
                            />
                            <VariantCard 
                                summary={sortedVariants[1]!}
                                credibleInterval={comparison?.credibleIntervalTreatment}
                                isBetter={winnerIndex === 1}
                            />
                        </div>
                    )}
                    
                    {/* Additional Variants */}
                    {sortedVariants.length > 2 && (
                        <div className="pt-3 border-t border-gray-700/50">
                            <p className="text-xs text-gray-500 mb-2">
                                Additional variants ({sortedVariants.length - 2} more)
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {sortedVariants.slice(2).map(variant => (
                                    <div 
                                        key={variant.variantId}
                                        className="px-2 py-1 bg-gray-800 rounded text-xs"
                                    >
                                        <span className="text-gray-400">{variant.variantLabel || variant.variantId}</span>
                                        <span className="ml-2 text-gray-500">n={variant.sampleSize}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Legend/Help */}
                    {comparison && (
                        <div className="pt-3 border-t border-gray-700/50 text-xs text-gray-500">
                            <p>
                                Using Bayesian Beta-Binomial model with Jeffrey's prior.
                                Requires ≥{MIN_BAYESIAN_SAMPLE_SIZE} samples for reliable inference.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BayesianAnalyticsPanel;
