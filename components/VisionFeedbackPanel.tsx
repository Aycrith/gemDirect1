/**
 * VisionFeedbackPanel Component
 * 
 * Displays vision analysis results for generated keyframes.
 * Shows quality scores, detected issues, and refined prompts.
 * Allows users to apply suggestions or regenerate with improvements.
 * 
 * @module components/VisionFeedbackPanel
 */

import React, { useState, useCallback } from 'react';
import type { VisionFeedbackResult, VisionIssue } from '../services/visionFeedbackService';

// ============================================================================
// Types
// ============================================================================

interface VisionFeedbackPanelProps {
    /** Analysis result to display */
    result: VisionFeedbackResult | null;
    /** Whether analysis is in progress */
    isAnalyzing: boolean;
    /** Error message if analysis failed */
    error?: string;
    /** Callback when user clicks "Analyze Keyframe" */
    onAnalyze: () => void;
    /** Callback when user clicks "Apply Refined Prompt" */
    onApplyRefinedPrompt: (refinedPrompt: string) => void;
    /** Callback when user clicks "Regenerate with Improvements" */
    onRegenerate?: (refinedPrompt: string) => void;
    /** Whether the keyframe image is available for analysis */
    hasKeyframe: boolean;
    /** Optional: compact mode for inline display */
    compact?: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

const ScoreBar: React.FC<{ label: string; score: number; color?: string }> = ({ 
    label, 
    score, 
    color: _color = 'amber' 
}) => {
    const getScoreColor = (s: number) => {
        if (s >= 80) return 'bg-green-500';
        if (s >= 60) return 'bg-amber-500';
        if (s >= 40) return 'bg-orange-500';
        return 'bg-red-500';
    };
    
    const getScoreText = (s: number) => {
        if (s >= 80) return 'text-green-400';
        if (s >= 60) return 'text-amber-400';
        if (s >= 40) return 'text-orange-400';
        return 'text-red-400';
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${getScoreColor(score)} transition-all duration-500`}
                    style={{ width: `${score}%` }}
                />
            </div>
            <span className={`text-xs font-medium w-8 text-right ${getScoreText(score)}`}>
                {score}
            </span>
        </div>
    );
};

const IssueBadge: React.FC<{ issue: VisionIssue }> = ({ issue }) => {
    const severityColors = {
        error: 'bg-red-900/50 border-red-700 text-red-300',
        warning: 'bg-amber-900/50 border-amber-700 text-amber-300',
        info: 'bg-blue-900/50 border-blue-700 text-blue-300'
    };
    
    const severityIcons = {
        error: '⚠️',
        warning: '⚡',
        info: 'ℹ️'
    };
    
    const categoryLabels = {
        composition: '🎬 Composition',
        lighting: '💡 Lighting',
        character: '👤 Character',
        style: '🎨 Style',
        technical: '⚙️ Technical',
        prompt: '✏️ Prompt'
    };

    return (
        <div className={`px-2 py-1 rounded border text-xs ${severityColors[issue.severity]}`}>
            <span className="mr-1">{severityIcons[issue.severity]}</span>
            <span className="opacity-75 mr-1">[{categoryLabels[issue.category] || issue.category}]</span>
            {issue.message}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const VisionFeedbackPanel: React.FC<VisionFeedbackPanelProps> = ({
    result,
    isAnalyzing,
    error,
    onAnalyze,
    onApplyRefinedPrompt,
    onRegenerate,
    hasKeyframe,
    compact = false
}) => {
    const [showRawAnalysis, setShowRawAnalysis] = useState(false);
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    const handleCopyPrompt = useCallback(() => {
        if (result?.refinedPrompt) {
            navigator.clipboard.writeText(result.refinedPrompt);
            setCopiedPrompt(true);
            setTimeout(() => setCopiedPrompt(false), 2000);
        }
    }, [result?.refinedPrompt]);

    // No keyframe available
    if (!hasKeyframe) {
        return (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <div className="text-center text-gray-400 text-sm">
                    <span className="text-2xl block mb-2">🖼️</span>
                    Generate a keyframe first to enable vision analysis
                </div>
            </div>
        );
    }

    // Compact mode - just show analyze button and basic status
    if (compact && !result && !isAnalyzing) {
        return (
            <button
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 
                           text-white text-xs rounded-lg transition-colors flex items-center gap-1.5"
            >
                👁️ Analyze
            </button>
        );
    }

    return (
        <div className={`bg-gray-800/50 rounded-lg border border-gray-700 ${compact ? 'p-3' : 'p-4'}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h4 className={`font-medium text-gray-200 flex items-center gap-2 ${compact ? 'text-sm' : ''}`}>
                    👁️ Vision Analysis
                    {result && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                            result.scores.overall >= 70 
                                ? 'bg-green-900/50 text-green-300' 
                                : result.scores.overall >= 50 
                                ? 'bg-amber-900/50 text-amber-300'
                                : 'bg-red-900/50 text-red-300'
                        }`}>
                            {result.scores.overall >= 70 ? 'Good' : result.scores.overall >= 50 ? 'Fair' : 'Needs Work'}
                        </span>
                    )}
                </h4>
                
                <button
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 
                               text-white text-xs rounded transition-colors"
                >
                    {isAnalyzing ? '⏳ Analyzing...' : result ? '🔄 Re-analyze' : '▶️ Analyze'}
                </button>
            </div>

            {/* Loading State */}
            {isAnalyzing && (
                <div className="flex items-center justify-center py-6">
                    <div className="flex items-center gap-3 text-purple-400">
                        <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Analyzing keyframe with vision model...</span>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && !isAnalyzing && (
                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-3">
                    <p className="text-red-400 text-sm">⚠️ {error}</p>
                </div>
            )}

            {/* Results */}
            {result && !isAnalyzing && (
                <div className="space-y-4">
                    {/* Quality Scores */}
                    <div className="space-y-2">
                        <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Quality Scores</h5>
                        <div className="space-y-1.5">
                            <ScoreBar label="Composition" score={result.scores.composition} />
                            <ScoreBar label="Lighting" score={result.scores.lighting} />
                            <ScoreBar label="Character" score={result.scores.characterAccuracy} />
                            <ScoreBar label="Style" score={result.scores.styleAdherence} />
                            <div className="pt-1 border-t border-gray-700">
                                <ScoreBar label="Overall" score={result.scores.overall} />
                            </div>
                        </div>
                    </div>

                    {/* Summary */}
                    {result.summary && (
                        <div>
                            <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Analysis</h5>
                            <p className="text-sm text-gray-300">{result.summary}</p>
                        </div>
                    )}

                    {/* Issues */}
                    {result.issues.length > 0 && (
                        <div>
                            <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                                Issues ({result.issues.length})
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                                {result.issues.map((issue, idx) => (
                                    <IssueBadge key={idx} issue={issue} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Refined Prompt */}
                    {result.refinedPrompt && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Refined Prompt
                                </h5>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopyPrompt}
                                        className="text-xs text-gray-400 hover:text-white transition-colors"
                                    >
                                        {copiedPrompt ? '✓ Copied' : '📋 Copy'}
                                    </button>
                                </div>
                            </div>
                            <div className="bg-gray-900/50 rounded p-3 border border-gray-700">
                                <p className="text-sm text-gray-300 whitespace-pre-wrap">{result.refinedPrompt}</p>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => onApplyRefinedPrompt(result.refinedPrompt!)}
                                    className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 
                                               text-white text-sm rounded-lg transition-colors"
                                >
                                    ✏️ Apply to Scene
                                </button>
                                {onRegenerate && (
                                    <button
                                        onClick={() => onRegenerate(result.refinedPrompt!)}
                                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 
                                                   text-white text-sm rounded-lg transition-colors"
                                    >
                                        🔄 Regenerate
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-700">
                        <span>Model: {result.modelUsed.split('/').pop()}</span>
                        <span>{(result.responseTimeMs / 1000).toFixed(1)}s</span>
                        {result.rawAnalysis && (
                            <button
                                onClick={() => setShowRawAnalysis(!showRawAnalysis)}
                                className="text-purple-400 hover:text-purple-300"
                            >
                                {showRawAnalysis ? 'Hide raw' : 'Show raw'}
                            </button>
                        )}
                    </div>

                    {/* Raw Analysis (collapsible) */}
                    {showRawAnalysis && result.rawAnalysis && (
                        <div className="bg-gray-900/70 rounded p-3 text-xs text-gray-400 font-mono overflow-auto max-h-48">
                            <pre className="whitespace-pre-wrap">{result.rawAnalysis}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default VisionFeedbackPanel;
