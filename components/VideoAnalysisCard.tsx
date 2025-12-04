/**
 * Video Analysis Card Component
 * 
 * Displays video analysis results including:
 * - Frame comparison (start/end keyframes vs video frames)
 * - Quality scores with visual indicators
 * - Coherence metrics (when Bookend QA Mode is active)
 * - Detected issues and suggestions
 * 
 * @module components/VideoAnalysisCard
 */

import React, { useState } from 'react';
import type { VideoFeedbackResult, VideoIssue, VideoSuggestion } from '../services/videoFeedbackService';
import type { QualityGateResult, CoherenceCheckResult } from '../services/videoQualityGateService';

// ============================================================================
// Props
// ============================================================================

export interface VideoAnalysisCardProps {
    /** Analysis result to display */
    result: VideoFeedbackResult | null;
    /** Quality gate result (includes coherence metrics when bookendQAMode is active) */
    qualityGateResult?: QualityGateResult | null;
    /** Whether analysis is currently in progress */
    isAnalyzing?: boolean;
    /** Original start keyframe for comparison display */
    startKeyframe?: string;
    /** Original end keyframe for comparison display (bookend mode) */
    endKeyframe?: string;
    /** Callback when user clicks to apply a suggestion */
    onApplySuggestion?: (suggestion: VideoSuggestion) => void;
    /** Callback to trigger re-analysis */
    onReanalyze?: () => void;
    /** Additional CSS class */
    className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

interface ScoreBarProps {
    label: string;
    score: number;
    maxScore?: number;
}

const ScoreBar: React.FC<ScoreBarProps> = ({ label, score, maxScore = 100 }) => {
    const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100));
    
    // Color based on score
    const getColor = (pct: number): string => {
        if (pct >= 80) return 'bg-green-500';
        if (pct >= 60) return 'bg-yellow-500';
        if (pct >= 40) return 'bg-orange-500';
        return 'bg-red-500';
    };
    
    return (
        <div className="mb-2">
            <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">{label}</span>
                <span className="font-mono text-gray-400">{score}/{maxScore}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${getColor(percentage)} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

interface FrameComparisonProps {
    label: string;
    originalFrame?: string;
    extractedFrame?: string;
    score: number;
}

const FrameComparison: React.FC<FrameComparisonProps> = ({
    label,
    originalFrame,
    extractedFrame,
    score,
}) => {
    const [showOverlay, setShowOverlay] = useState(false);
    
    if (!originalFrame && !extractedFrame) return null;
    
    const getScoreColor = (s: number): string => {
        if (s >= 80) return 'text-green-400';
        if (s >= 60) return 'text-yellow-400';
        if (s >= 40) return 'text-orange-400';
        return 'text-red-400';
    };
    
    return (
        <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-300">{label}</span>
                <span className={`text-sm font-mono ${getScoreColor(score)}`}>
                    {score}% match
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {originalFrame && (
                    <div className="relative">
                        <div className="text-xs text-gray-500 mb-1">Original Keyframe</div>
                        <img 
                            src={originalFrame.startsWith('data:') ? originalFrame : `data:image/jpeg;base64,${originalFrame}`}
                            alt="Original keyframe"
                            className="w-full h-24 object-cover rounded border border-gray-600"
                        />
                    </div>
                )}
                {extractedFrame && (
                    <div className="relative">
                        <div className="text-xs text-gray-500 mb-1">Video Frame</div>
                        <img 
                            src={extractedFrame.startsWith('data:') ? extractedFrame : `data:image/jpeg;base64,${extractedFrame}`}
                            alt="Extracted video frame"
                            className="w-full h-24 object-cover rounded border border-gray-600"
                            onClick={() => setShowOverlay(!showOverlay)}
                            style={{ cursor: 'pointer' }}
                            title="Click to toggle overlay comparison"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

interface IssueListProps {
    issues: VideoIssue[];
}

const IssueList: React.FC<IssueListProps> = ({ issues }) => {
    if (issues.length === 0) return null;
    
    const getSeverityIcon = (severity: VideoIssue['severity']): string => {
        switch (severity) {
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
        }
    };
    
    const getSeverityColor = (severity: VideoIssue['severity']): string => {
        switch (severity) {
            case 'error': return 'bg-red-900/30 border-red-700';
            case 'warning': return 'bg-yellow-900/30 border-yellow-700';
            case 'info': return 'bg-blue-900/30 border-blue-700';
        }
    };
    
    // Group issues by category
    const groupedIssues = issues.reduce((acc, issue) => {
        const cat = issue.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(issue);
        return acc;
    }, {} as Record<string, VideoIssue[]>);
    
    const categoryLabels: Record<string, string> = {
        'frame-match': 'Frame Matching',
        'motion': 'Motion Quality',
        'artifact': 'Visual Artifacts',
        'temporal': 'Temporal Coherence',
        'prompt': 'Prompt Adherence',
        'technical': 'Technical Issues',
    };
    
    return (
        <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Issues Detected</h4>
            {Object.entries(groupedIssues).map(([category, categoryIssues]) => (
                <div key={category} className="mb-2">
                    <div className="text-xs text-gray-500 mb-1">
                        {categoryLabels[category] || category}
                    </div>
                    {categoryIssues.map((issue, idx) => (
                        <div 
                            key={idx}
                            className={`text-sm p-2 rounded border mb-1 ${getSeverityColor(issue.severity)}`}
                        >
                            <span className="mr-2">{getSeverityIcon(issue.severity)}</span>
                            {issue.message}
                            {issue.frameNumber !== undefined && (
                                <span className="text-xs text-gray-500 ml-2">
                                    (Frame {issue.frameNumber})
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

interface SuggestionListProps {
    suggestions: VideoSuggestion[];
    onApply?: (suggestion: VideoSuggestion) => void;
}

const SuggestionList: React.FC<SuggestionListProps> = ({ suggestions, onApply }) => {
    if (suggestions.length === 0) return null;
    
    const getImpactColor = (impact: string): string => {
        switch (impact) {
            case 'high': return 'text-red-400';
            case 'medium': return 'text-yellow-400';
            case 'low': return 'text-green-400';
            default: return 'text-gray-400';
        }
    };
    
    return (
        <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Suggestions</h4>
            {suggestions.map((suggestion, idx) => (
                <div 
                    key={suggestion.id || idx}
                    className="p-3 bg-gray-800/50 rounded border border-gray-700 mb-2"
                >
                    <div className="text-sm text-gray-200 mb-1">
                        {suggestion.description}
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                        {suggestion.rationale}
                    </div>
                    <div className="flex justify-between items-center">
                        <span className={`text-xs ${getImpactColor(suggestion.impact || 'medium')}`}>
                            {suggestion.impact || 'medium'} impact
                        </span>
                        {onApply && (
                            <button
                                onClick={() => onApply(suggestion)}
                                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                            >
                                Apply
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

interface CoherenceMetricsProps {
    coherenceResult: CoherenceCheckResult;
}

/**
 * Displays coherence metrics from Bookend QA Mode analysis
 */
const CoherenceMetrics: React.FC<CoherenceMetricsProps> = ({ coherenceResult }) => {
    const { metrics, decision, violations } = coherenceResult;
    
    const getDecisionColor = (d: string): string => {
        switch (d) {
            case 'pass': return 'text-green-400 bg-green-900/30 border-green-700/50';
            case 'warn': return 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50';
            case 'fail': return 'text-red-400 bg-red-900/30 border-red-700/50';
            default: return 'text-gray-400 bg-gray-900/30 border-gray-700/50';
        }
    };
    
    const getScoreColor = (score: number, threshold: number, isMax: boolean = false): string => {
        const passes = isMax ? score <= threshold : score >= threshold;
        if (passes) return 'text-green-400';
        const margin = isMax ? threshold - score : score - threshold;
        if (Math.abs(margin) <= 5) return 'text-yellow-400';
        return 'text-red-400';
    };
    
    const formatBooleanCheck = (value: boolean | undefined, shouldBeFalse: boolean): string => {
        if (value === undefined) return '—';
        const passes = shouldBeFalse ? !value : value;
        return passes ? '✓ No' : '✗ Yes';
    };
    
    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-300">
                    Coherence Gate
                    <span className="ml-2 text-xs text-gray-500">(Bookend QA Mode)</span>
                </h4>
                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getDecisionColor(decision)}`}>
                    {decision.toUpperCase()}
                </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
                {metrics.overall !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Overall</span>
                        <span className={getScoreColor(metrics.overall, 80)}>
                            {metrics.overall}%
                        </span>
                    </div>
                )}
                {metrics.focusStability !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Focus Stability</span>
                        <span className={getScoreColor(metrics.focusStability, 85)}>
                            {metrics.focusStability}%
                        </span>
                    </div>
                )}
                {metrics.artifactSeverity !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Artifacts</span>
                        <span className={getScoreColor(metrics.artifactSeverity, 40, true)}>
                            {metrics.artifactSeverity}%
                        </span>
                    </div>
                )}
                {metrics.objectConsistency !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Object Consistency</span>
                        <span className={getScoreColor(metrics.objectConsistency, 85)}>
                            {metrics.objectConsistency}%
                        </span>
                    </div>
                )}
                {metrics.hasBlackFrames !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Black Frames</span>
                        <span className={metrics.hasBlackFrames ? 'text-red-400' : 'text-green-400'}>
                            {formatBooleanCheck(metrics.hasBlackFrames, true)}
                        </span>
                    </div>
                )}
                {metrics.hasHardFlicker !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">Hard Flicker</span>
                        <span className={metrics.hasHardFlicker ? 'text-red-400' : 'text-green-400'}>
                            {formatBooleanCheck(metrics.hasHardFlicker, true)}
                        </span>
                    </div>
                )}
            </div>
            
            {violations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-500 mb-1">Violations</div>
                    {violations.map((v, idx) => (
                        <div 
                            key={idx}
                            className={`text-xs p-1 rounded mb-1 ${
                                v.severity === 'error' 
                                    ? 'bg-red-900/30 text-red-300' 
                                    : 'bg-yellow-900/30 text-yellow-300'
                            }`}
                        >
                            {v.message}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const VideoAnalysisCard: React.FC<VideoAnalysisCardProps> = ({
    result,
    qualityGateResult,
    isAnalyzing = false,
    startKeyframe,
    endKeyframe,
    onApplySuggestion,
    onReanalyze,
    className = '',
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
    // Loading state
    if (isAnalyzing) {
        return (
            <div className={`bg-gray-900/80 rounded-lg border border-gray-700 p-4 ${className}`}>
                <div className="flex items-center justify-center space-x-3">
                    <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                    <span className="text-gray-300">Analyzing video...</span>
                </div>
                <div className="text-xs text-gray-500 text-center mt-2">
                    Extracting frames and comparing with keyframes
                </div>
            </div>
        );
    }
    
    // No result state
    if (!result) {
        return (
            <div className={`bg-gray-900/80 rounded-lg border border-gray-700 p-4 ${className}`}>
                <div className="text-center text-gray-500">
                    <p className="mb-2">No video analysis available</p>
                    {onReanalyze && (
                        <button
                            onClick={onReanalyze}
                            className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                        >
                            Analyze Video
                        </button>
                    )}
                </div>
            </div>
        );
    }
    
    // Get overall score color
    const getOverallColor = (score: number): string => {
        if (score >= 80) return 'text-green-400 border-green-500';
        if (score >= 60) return 'text-yellow-400 border-yellow-500';
        if (score >= 40) return 'text-orange-400 border-orange-500';
        return 'text-red-400 border-red-500';
    };
    
    const errorCount = result.issues.filter(i => i.severity === 'error').length;
    const warningCount = result.issues.filter(i => i.severity === 'warning').length;
    
    return (
        <div className={`bg-gray-900/80 rounded-lg border border-gray-700 ${className}`}>
            {/* Header */}
            <div 
                className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center space-x-3">
                    <div className={`text-2xl font-bold ${getOverallColor(result.scores.overall)}`}>
                        {result.scores.overall}%
                    </div>
                    <div>
                        <div className="text-sm font-medium text-gray-200">
                            Video Analysis
                        </div>
                        <div className="text-xs text-gray-500">
                            {errorCount > 0 && <span className="text-red-400">{errorCount} errors</span>}
                            {errorCount > 0 && warningCount > 0 && ', '}
                            {warningCount > 0 && <span className="text-yellow-400">{warningCount} warnings</span>}
                            {errorCount === 0 && warningCount === 0 && <span className="text-green-400">No issues</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {onReanalyze && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onReanalyze();
                            }}
                            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                            title="Re-analyze video"
                        >
                            🔄
                        </button>
                    )}
                    <span className="text-gray-500">
                        {isExpanded ? '▼' : '▶'}
                    </span>
                </div>
            </div>
            
            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-700">
                    {/* Scores */}
                    <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-300 mb-3">Quality Scores</h4>
                        <ScoreBar label="Start Frame Match" score={result.scores.startFrameMatch} />
                        <ScoreBar label="End Frame Match" score={result.scores.endFrameMatch} />
                        <ScoreBar label="Motion Quality" score={result.scores.motionQuality} />
                        <ScoreBar label="Prompt Adherence" score={result.scores.promptAdherence} />
                    </div>
                    
                    {/* Coherence Metrics (Bookend QA Mode) */}
                    {qualityGateResult?.coherenceResult && (
                        <div className="mt-4">
                            <CoherenceMetrics coherenceResult={qualityGateResult.coherenceResult} />
                        </div>
                    )}
                    
                    {/* Frame Comparisons */}
                    {(result.frameAnalysis?.firstFrameBase64 || startKeyframe) && (
                        <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-300 mb-3">Frame Comparison</h4>
                            <FrameComparison
                                label="Start Frame"
                                originalFrame={startKeyframe}
                                extractedFrame={result.frameAnalysis?.firstFrameBase64}
                                score={result.scores.startFrameMatch}
                            />
                            {endKeyframe && (
                                <FrameComparison
                                    label="End Frame"
                                    originalFrame={endKeyframe}
                                    extractedFrame={result.frameAnalysis?.lastFrameBase64}
                                    score={result.scores.endFrameMatch}
                                />
                            )}
                        </div>
                    )}
                    
                    {/* Issues */}
                    <IssueList issues={result.issues} />
                    
                    {/* Suggestions */}
                    <SuggestionList 
                        suggestions={result.suggestions}
                        onApply={onApplySuggestion}
                    />
                    
                    {/* Metadata */}
                    <div className="text-xs text-gray-600 mt-4 pt-2 border-t border-gray-800">
                        Analyzed at {new Date(result.analyzedAt).toLocaleString()} 
                        using {result.modelUsed} 
                        ({result.responseTimeMs}ms)
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoAnalysisCard;
