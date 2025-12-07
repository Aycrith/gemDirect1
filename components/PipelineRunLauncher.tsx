/**
 * Pipeline Run Launcher Component
 * 
 * UI component for configuring and launching pipeline runs.
 * Provides selectors for pipeline type, sample/script, and options.
 * Shows current run status and provides command generation.
 * 
 * Phase 2: Run Launchers & Orchestration
 * Phase 3: Preflight Gating & Temporal UX
 * 
 * NOTE: This component cannot directly spawn processes (browser limitation).
 * Instead, it generates commands and provides copy-to-clipboard functionality.
 * Users run commands via terminal or VS Code tasks.
 * 
 * @module components/PipelineRunLauncher
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
    useRunController,
    formatRunStatus,
    formatDuration,
    calculateProgress,
} from '../hooks/useRunController';
import {
    evaluatePreflight,
    getPreflightStatusColor,
    getPreflightStatusBg,
    getPreflightStatusEmoji,
    type PreflightEvaluation,
    type PreflightCheckResult,
} from '../utils/preflightUtils';
import type {
    RunRequest,
    ProductionRunRequest,
    NarrativeRunRequest,
    PipelineType,
    TemporalMode,
    RunState,
} from '../types/pipelineRun';
import type { PreflightInfo } from '../types/pipelineSummary';

// ============================================================================
// Types
// ============================================================================

interface PipelineRunLauncherProps {
    /** Available samples for production runs */
    samples?: Array<{ id: string; name: string; description?: string }>;
    /** Available narrative scripts */
    scripts?: Array<{ path: string; id: string; title?: string; shotCount: number }>;
    /** Callback when a run completes */
    onRunComplete?: (run: RunState) => void;
    /** Callback to trigger summary refresh (from parent) */
    onRequestSummaryRefresh?: () => void;
    /** Whether to show the command preview */
    showCommandPreview?: boolean;
    /** Whether the launcher is collapsed by default */
    defaultCollapsed?: boolean;
    /** External preflight info (from usePipelineSummaries) */
    preflight?: PreflightInfo | null;
}

// ============================================================================
// Default Data
// ============================================================================

const DEFAULT_SAMPLES = [
    { id: 'sample-001-geometric', name: '001 Geometric', description: 'Geometric shapes scene' },
    { id: 'sample-002-character', name: '002 Character', description: 'Character-based scene' },
    { id: 'sample-003-nature', name: '003 Nature', description: 'Nature scene' },
];

const DEFAULT_SCRIPTS = [
    { path: 'config/narrative/demo-three-shot.json', id: 'demo-three-shot', title: 'Demo Three Shot', shotCount: 3 },
];

const PIPELINES = [
    { id: 'production-qa-golden', name: 'Production QA Golden', description: 'Full pipeline with QA' },
];

const TEMPORAL_MODES: Array<{ value: TemporalMode; label: string; description: string }> = [
    { value: 'auto', label: 'Auto', description: 'Use default settings' },
    { value: 'on', label: 'On', description: 'Enable temporal smoothing' },
    { value: 'off', label: 'Off', description: 'Disable temporal smoothing' },
];

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Run status indicator with progress
 */
const RunStatusIndicator: React.FC<{ run: RunState | null }> = ({ run }) => {
    if (!run) return null;

    const { text, emoji, color } = formatRunStatus(run.status);
    const progress = calculateProgress(run);

    return (
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    <span className={`font-medium ${color}`}>{text}</span>
                </div>
                <span className="text-xs text-gray-400">
                    {run.durationMs ? formatDuration(run.durationMs) : 'Running...'}
                </span>
            </div>

            {/* Progress bar */}
            {run.status === 'running' && (
                <div className="mb-2">
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    {run.completedSteps !== undefined && run.totalSteps !== undefined && (
                        <div className="text-[10px] text-gray-400 mt-1">
                            Step {run.completedSteps}/{run.totalSteps}
                        </div>
                    )}
                </div>
            )}

            {/* Current step */}
            {run.currentStep && run.status === 'running' && (
                <div className="text-xs text-gray-300">
                    <span className="text-gray-500">Current:</span> {run.currentStep}
                </div>
            )}

            {/* Identifier */}
            <div className="text-xs text-gray-400 mt-1">
                <span className="text-gray-500">Run:</span> {run.identifier}
            </div>

            {/* Error message */}
            {run.errorMessage && (
                <div className="text-xs text-red-400 mt-2 bg-red-900/20 p-2 rounded">
                    {run.errorMessage}
                </div>
            )}

            {/* Recent events */}
            {run.events.length > 0 && (
                <details className="mt-2">
                    <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
                        Recent events ({run.events.length})
                    </summary>
                    <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                        {run.events.slice(-5).map((event, i) => (
                            <div key={i} className="text-[10px] text-gray-400 font-mono">
                                <span className="text-gray-600">
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                </span>{' '}
                                {event.message || event.stepId}
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Step timings */}
            {run.stepTimings && run.stepTimings.length > 0 && (
                <details className="mt-2">
                    <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-400">
                        Step timings ({run.stepTimings.length})
                    </summary>
                    <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                        {run.stepTimings.map((step, i) => (
                            <div key={i} className="text-[10px] font-mono flex items-center gap-2">
                                <span className={step.status === 'complete' ? 'text-green-400' : step.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                                    {step.status === 'complete' ? '✓' : step.status === 'failed' ? '✗' : '⋯'}
                                </span>
                                <span className="text-gray-400 flex-1">{step.stepId}</span>
                                <span className="text-gray-500">{formatDuration(step.durationMs)}</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Validation warnings */}
            {run.validationWarnings && run.validationWarnings.length > 0 && (
                <div className="mt-2 text-[10px] text-yellow-400 bg-yellow-900/20 p-2 rounded">
                    <div className="font-medium mb-1">⚠️ Validation Warnings</div>
                    {run.validationWarnings.map((warning, i) => (
                        <div key={i} className="text-yellow-300/80">• {warning}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Command preview with copy button
 */
const CommandPreview: React.FC<{
    command: string;
    onCopy: () => void;
    copied: boolean;
}> = ({ command, onCopy, copied }) => {
    return (
        <div className="relative">
            <pre className="bg-gray-900 p-2 rounded text-xs font-mono text-gray-300 overflow-x-auto">
                {command}
            </pre>
            <button
                onClick={onCopy}
                className="absolute top-1 right-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-colors"
            >
                {copied ? '✓ Copied' : 'Copy'}
            </button>
        </div>
    );
};

/**
 * Preflight check row display
 */
const PreflightCheckRow: React.FC<{ check: PreflightCheckResult }> = ({ check }) => {
    const statusIcon = check.passed ? '✓' : check.blocking ? '✗' : '⚠';
    const statusColor = check.passed 
        ? 'text-green-400' 
        : check.blocking 
            ? 'text-red-400' 
            : 'text-amber-400';
    
    return (
        <div className="flex items-start gap-2 text-xs">
            <span className={`${statusColor} font-mono w-4`}>{statusIcon}</span>
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-medium">{check.label}</span>
                    {check.value && (
                        <span className="text-gray-500 text-[10px]">{check.value}</span>
                    )}
                </div>
                <div className="text-gray-400 text-[10px]">{check.message}</div>
                {check.suggestion && !check.passed && (
                    <div className="text-amber-400/80 text-[10px] mt-0.5">{check.suggestion}</div>
                )}
            </div>
        </div>
    );
};

/**
 * Preflight status panel
 */
const PreflightPanel: React.FC<{
    evaluation: PreflightEvaluation;
    onRunPreflight?: () => void;
}> = ({ evaluation, onRunPreflight }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showPreflightHelp, setShowPreflightHelp] = useState(false);
    const [copied, setCopied] = useState(false);
    const preflightCommand = 'npx tsx scripts/run-preflight.ts';

    const handlePreflightClick = () => {
        // Toggle help panel instead of alert
        setShowPreflightHelp(prev => !prev);
        onRunPreflight?.();
    };

    const handleCopyPreflight = async () => {
        try {
            await navigator.clipboard.writeText(preflightCommand);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className={`rounded-lg border p-2 ${getPreflightStatusBg(evaluation.status)}`}>
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-left flex-1"
                >
                    <span>{getPreflightStatusEmoji(evaluation.status)}</span>
                    <span className={`text-xs font-medium ${getPreflightStatusColor(evaluation.status)}`}>
                        Preflight: {evaluation.status === 'ready' ? 'Ready' : evaluation.status === 'warning' ? 'Warnings' : evaluation.status === 'error' ? 'Issues' : 'Unknown'}
                    </span>
                    <span className="text-gray-500 text-[10px]">
                        {isExpanded ? '▼' : '▶'}
                    </span>
                </button>
                {onRunPreflight && (
                    <button
                        onClick={handlePreflightClick}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${showPreflightHelp ? 'bg-blue-700 text-blue-100' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                        title="Show preflight check instructions"
                    >
                        {showPreflightHelp ? '✕ Close' : '🔍 How to Check'}
                    </button>
                )}
            </div>
            
            {/* Preflight help panel */}
            {showPreflightHelp && (
                <div className="mt-2 p-2 bg-blue-900/30 border border-blue-700/50 rounded text-[11px] text-gray-300">
                    <div className="font-medium text-blue-300 mb-1">Run Preflight Check</div>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400">
                        <li>Press <kbd className="px-1 py-0.5 bg-gray-700 rounded text-[10px]">Ctrl+Shift+P</kbd></li>
                        <li>Type <code className="px-1 bg-gray-700 rounded">Tasks: Run Task</code></li>
                        <li>Select <code className="px-1 bg-gray-700 rounded">run:helpers-preflight-comfyui-status</code></li>
                    </ol>
                    <div className="mt-2 text-gray-500">
                        Or run in terminal:
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                        <code className="px-1 bg-gray-700 rounded text-gray-200 text-[11px]">{preflightCommand}</code>
                        <button
                            onClick={handleCopyPreflight}
                            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[10px] text-gray-200 transition-colors"
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <div className="mt-1 text-gray-500 text-[10px]">
                        Writes results to public/preflight-status.json
                    </div>
                </div>
            )}
            
            {!isExpanded && !showPreflightHelp && (
                <div className="text-[10px] text-gray-400 mt-1">
                    {evaluation.summaryMessage}
                </div>
            )}
            
            {isExpanded && (
                <div className="mt-2 space-y-2">
                    {evaluation.checks.map((check) => (
                        <PreflightCheckRow key={check.id} check={check} />
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Blocking warning panel for preflight issues
 */
const PreflightWarningPanel: React.FC<{
    evaluation: PreflightEvaluation;
    temporalMode: TemporalMode;
    onForceTemporalOff: () => void;
    acknowledgedWarnings: Set<string>;
    onAcknowledgeWarning: (id: string) => void;
}> = ({ evaluation, temporalMode, onForceTemporalOff, acknowledgedWarnings, onAcknowledgeWarning }) => {
    // Check if we need to show temporal warning
    const showTemporalWarning = evaluation.temporalBlocked && temporalMode !== 'off';
    const showVlmWarning = evaluation.vlmUnavailable && !acknowledgedWarnings.has('vlm');
    
    if (!showTemporalWarning && !showVlmWarning) {
        return null;
    }
    
    return (
        <div className="space-y-2">
            {showTemporalWarning && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-2">
                    <div className="flex items-start gap-2">
                        <span className="text-red-400">⚠️</span>
                        <div className="flex-1">
                            <div className="text-xs text-red-300 font-medium">
                                Temporal Smoothing Unavailable
                            </div>
                            <div className="text-[10px] text-red-400/80 mt-0.5">
                                FFmpeg not found. Temporal regularization cannot run.
                            </div>
                            <button
                                onClick={onForceTemporalOff}
                                className="mt-1.5 px-2 py-0.5 bg-red-800 hover:bg-red-700 text-red-200 text-[10px] rounded transition-colors"
                            >
                                Force Temporal Off
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {showVlmWarning && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-2">
                    <div className="flex items-start gap-2">
                        <span className="text-amber-400">⚠️</span>
                        <div className="flex-1">
                            <div className="text-xs text-amber-300 font-medium">
                                Vision QA Unavailable
                            </div>
                            <div className="text-[10px] text-amber-400/80 mt-0.5">
                                VLM unreachable. Vision QA step will be skipped.
                            </div>
                            <button
                                onClick={() => onAcknowledgeWarning('vlm')}
                                className="mt-1.5 px-2 py-0.5 bg-amber-800 hover:bg-amber-700 text-amber-200 text-[10px] rounded transition-colors"
                            >
                                Proceed Without QA
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const PipelineRunLauncher: React.FC<PipelineRunLauncherProps> = ({
    samples = DEFAULT_SAMPLES,
    scripts = DEFAULT_SCRIPTS,
    onRunComplete,
    onRequestSummaryRefresh,
    showCommandPreview = true,
    defaultCollapsed = false,
    preflight,
}) => {
    // State
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [pipelineType, setPipelineType] = useState<PipelineType>('production');
    const [selectedPipeline, setSelectedPipeline] = useState(PIPELINES[0]?.id || 'production-qa-golden');
    const [selectedSample, setSelectedSample] = useState(samples[0]?.id || '');
    const [selectedScript, setSelectedScript] = useState(scripts[0]?.path || '');
    const [temporalMode, setTemporalMode] = useState<TemporalMode>('auto');
    const [verbose, setVerbose] = useState(false);
    const [dryRun, setDryRun] = useState(false);
    const [copied, setCopied] = useState(false);
    const [acknowledgedWarnings, setAcknowledgedWarnings] = useState<Set<string>>(new Set());

    // Preflight evaluation
    const preflightEvaluation = useMemo(() => evaluatePreflight(preflight), [preflight]);

    // Hook
    const { state, refresh, isActive, generateCommand, copyCommand } = useRunController({
        onComplete: (run) => {
            onRunComplete?.(run);
            // Trigger summary refresh when run completes
            if (run.status === 'succeeded' || run.status === 'failed') {
                setTimeout(() => onRequestSummaryRefresh?.(), 2000);
            }
        },
    });

    // Handle force temporal off
    const handleForceTemporalOff = useCallback(() => {
        setTemporalMode('off');
    }, []);

    // Handle acknowledge warning
    const handleAcknowledgeWarning = useCallback((id: string) => {
        setAcknowledgedWarnings(prev => new Set([...prev, id]));
    }, []);

    // Handle run preflight task - now just a no-op since UI shows inline help
    const handleRunPreflight = useCallback(() => {
        // The PreflightPanel component now shows inline help
        // This callback can be used for tracking/analytics if needed
    }, []);

    // Build run request
    const runRequest = useMemo((): RunRequest => {
        if (pipelineType === 'production') {
            return {
                type: 'production',
                pipelineId: selectedPipeline,
                sampleId: selectedSample,
                temporalMode: temporalMode !== 'auto' ? temporalMode : undefined,
                verbose,
                dryRun,
            } as ProductionRunRequest;
        } else {
            return {
                type: 'narrative',
                scriptPath: selectedScript,
                temporalMode: temporalMode !== 'auto' ? temporalMode : undefined,
                verbose,
                dryRun,
            } as NarrativeRunRequest;
        }
    }, [pipelineType, selectedPipeline, selectedSample, selectedScript, temporalMode, verbose, dryRun]);

    // Generate command string
    const command = useMemo(() => generateCommand(runRequest), [generateCommand, runRequest]);

    // Handle copy
    const handleCopy = useCallback(async () => {
        await copyCommand(runRequest);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [copyCommand, runRequest]);

    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700">
            {/* Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-700/30 transition-colors rounded-t-lg"
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg">🚀</span>
                    <span className="font-medium text-gray-200">Run Launcher</span>
                    {isActive && (
                        <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded-full animate-pulse">
                            Running
                        </span>
                    )}
                </div>
                <span className="text-gray-400 text-sm">
                    {isCollapsed ? '▶' : '▼'}
                </span>
            </button>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-3 pt-0 space-y-3">
                    {/* Preflight status panel */}
                    <PreflightPanel
                        evaluation={preflightEvaluation}
                        onRunPreflight={handleRunPreflight}
                    />

                    {/* Preflight warnings */}
                    <PreflightWarningPanel
                        evaluation={preflightEvaluation}
                        temporalMode={temporalMode}
                        onForceTemporalOff={handleForceTemporalOff}
                        acknowledgedWarnings={acknowledgedWarnings}
                        onAcknowledgeWarning={handleAcknowledgeWarning}
                    />

                    {/* Active run status */}
                    {state.run && <RunStatusIndicator run={state.run} />}

                    {/* Configuration form */}
                    {!isActive && (
                        <div className="space-y-3">
                            {/* Pipeline type selector */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                    Pipeline Type
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPipelineType('production')}
                                        className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                            pipelineType === 'production'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        Production
                                    </button>
                                    <button
                                        onClick={() => setPipelineType('narrative')}
                                        className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                            pipelineType === 'narrative'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        Narrative
                                    </button>
                                </div>
                            </div>

                            {/* Production options */}
                            {pipelineType === 'production' && (
                                <>
                                    {/* Pipeline selector */}
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">
                                            Pipeline
                                        </label>
                                        <select
                                            value={selectedPipeline}
                                            onChange={(e) => setSelectedPipeline(e.target.value)}
                                            className="w-full bg-gray-700 text-gray-200 rounded px-2 py-1.5 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                                        >
                                            {PIPELINES.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Sample selector */}
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">
                                            Sample
                                        </label>
                                        <select
                                            value={selectedSample}
                                            onChange={(e) => setSelectedSample(e.target.value)}
                                            className="w-full bg-gray-700 text-gray-200 rounded px-2 py-1.5 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                                        >
                                            {samples.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} {s.description ? `- ${s.description}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* Narrative options */}
                            {pipelineType === 'narrative' && (
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                        Script
                                    </label>
                                    <select
                                        value={selectedScript}
                                        onChange={(e) => setSelectedScript(e.target.value)}
                                        className="w-full bg-gray-700 text-gray-200 rounded px-2 py-1.5 text-sm border border-gray-600 focus:border-purple-500 focus:outline-none"
                                    >
                                        {scripts.map((s) => (
                                            <option key={s.path} value={s.path}>
                                                {s.title || s.id} ({s.shotCount} shots)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Temporal mode */}
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                    Temporal Regularization
                                </label>
                                <div className="flex gap-1">
                                    {TEMPORAL_MODES.map((mode) => (
                                        <button
                                            key={mode.value}
                                            onClick={() => setTemporalMode(mode.value)}
                                            title={mode.description}
                                            disabled={preflightEvaluation.temporalBlocked && mode.value !== 'off'}
                                            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                                temporalMode === mode.value
                                                    ? 'bg-gray-600 text-white'
                                                    : preflightEvaluation.temporalBlocked && mode.value !== 'off'
                                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                                            }`}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                                {/* Temporal helper text based on preflight */}
                                <div className={`text-[10px] mt-1 ${
                                    preflightEvaluation.temporalBlocked 
                                        ? 'text-red-400' 
                                        : preflightEvaluation.status === 'warning' 
                                            ? 'text-amber-400' 
                                            : 'text-gray-500'
                                }`}>
                                    {preflightEvaluation.temporalHelperText}
                                </div>
                            </div>

                            {/* Options row */}
                            <div className="flex gap-4">
                                <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={verbose}
                                        onChange={(e) => setVerbose(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                                    />
                                    Verbose
                                </label>
                                <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={dryRun}
                                        onChange={(e) => setDryRun(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                                    />
                                    Dry Run
                                </label>
                            </div>

                            {/* Command preview */}
                            {showCommandPreview && (
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                        Command
                                    </label>
                                    <CommandPreview
                                        command={command}
                                        onCopy={handleCopy}
                                        copied={copied}
                                    />
                                </div>
                            )}

                            {/* Instructions */}
                            <div className="text-xs text-gray-500 bg-gray-900/50 p-2 rounded">
                                <p className="mb-1">
                                    <strong>To run:</strong> Copy the command above and run in terminal, or use VS Code tasks.
                                </p>
                                <p>
                                    <strong>VS Code:</strong> Press <code className="bg-gray-800 px-1 rounded">Ctrl+Shift+P</code> → "Tasks: Run Task" → "run:comfyui-e2e-attempt"
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Refresh button when run is active */}
                    {isActive && (
                        <button
                            onClick={refresh}
                            className="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                        >
                            🔄 Refresh Status
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default PipelineRunLauncher;
