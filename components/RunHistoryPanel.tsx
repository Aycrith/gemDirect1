/**
 * Run History Panel
 * 
 * Displays a unified view of all generation experiments:
 * - Single-shot generations
 * - A/B comparison runs
 * - Narrative pipeline runs
 * 
 * Features:
 * - Sortable table of runs with key metadata
 * - Filter by type, QA verdict, date, and features
 * - Search by label, preset, or script ID
 * - Actions: Open in Replay Viewer, A/B Compare, or Narrative Dashboard
 * - Deep links to manifests, reports, and videos
 * 
 * Part of H1 - Run History & Experiment Browser
 * 
 * @module components/RunHistoryPanel
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    loadExperimentHistory,
    filterExperiments,
    sortExperiments,
    type ExperimentEntry,
    type ExperimentType,
    type ExperimentFilter,
} from '../services/experimentHistoryService';
import {
    getGoldenSetQuickSummary,
    type GoldenSetQuickSummary,
} from '../services/goldenSetService';
import {
    loadRunTags,
    toggleTag,
    toggleStarred,
    type RunTagEntry,
    type TagUsageSummary,
    getTagUsageSummary,
} from '../services/runTagsService';

// ============================================================================
// Types
// ============================================================================

interface RunHistoryPanelProps {
    /** Whether the panel starts collapsed */
    defaultCollapsed?: boolean;
    /** Callback when user wants to open Replay Viewer */
    onOpenReplay?: (entry: ExperimentEntry) => void;
    /** Callback when user wants to open A/B Compare dashboard */
    onOpenAbCompare?: (entry: ExperimentEntry) => void;
    /** Callback when user wants to open Narrative dashboard */
    onOpenNarrative?: (entry: ExperimentEntry) => void;
}

type SortField = 'date' | 'type' | 'label' | 'qaVerdict';
type SortDirection = 'asc' | 'desc';

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Badge component for run type
 */
const TypeBadge: React.FC<{ type: ExperimentType }> = ({ type }) => {
    const config = {
        'single-shot': { label: 'Single', color: 'bg-blue-600/50 text-blue-200', icon: '🎬' },
        'ab-compare': { label: 'A/B', color: 'bg-purple-600/50 text-purple-200', icon: '⚖️' },
        'narrative': { label: 'Narrative', color: 'bg-green-600/50 text-green-200', icon: '📜' },
    }[type];

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
            <span>{config.icon}</span>
            {config.label}
        </span>
    );
};

/**
 * Badge component for QA verdict
 */
const VerdictBadge: React.FC<{ verdict: 'pass' | 'warn' | 'fail' | 'unknown' }> = ({ verdict }) => {
    const config = {
        pass: { label: 'PASS', color: 'bg-green-600/50 text-green-200', icon: '✅' },
        warn: { label: 'WARN', color: 'bg-amber-600/50 text-amber-200', icon: '⚠️' },
        fail: { label: 'FAIL', color: 'bg-red-600/50 text-red-200', icon: '❌' },
        unknown: { label: '—', color: 'bg-gray-600/50 text-gray-400', icon: '?' },
    }[verdict];

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
            <span>{config.icon}</span>
            {config.label}
        </span>
    );
};

/**
 * Feature flags badges (camera, temporal reg)
 */
const FeatureBadges: React.FC<{ entry: ExperimentEntry }> = ({ entry }) => {
    return (
        <div className="flex items-center gap-1">
            {entry.hasCameraPath && (
                <span 
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-cyan-700/40 text-cyan-300"
                    title={entry.cameraPathId ? `Camera Path: ${entry.cameraPathId}` : 'Camera Path'}
                >
                    📷
                </span>
            )}
            {entry.temporalRegularization !== 'none' && (
                <span 
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${
                        entry.temporalRegularization === 'adaptive' 
                            ? 'bg-purple-700/40 text-purple-300' 
                            : 'bg-indigo-700/40 text-indigo-300'
                    }`}
                    title={`Temporal Reg: ${entry.temporalRegularization}`}
                >
                    {entry.temporalRegularization === 'adaptive' ? '🔄' : '⏱️'}
                </span>
            )}
        </div>
    );
};

/**
 * File link component
 */
const FileLink: React.FC<{ path?: string; label: string; icon?: string }> = ({ path, label, icon = '📄' }) => {
    if (!path) return null;

    const handleClick = () => {
        // Try to open in VS Code or copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(path);
        }
    };

    return (
        <button
            onClick={handleClick}
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline"
            title={`Click to copy path: ${path}`}
        >
            <span>{icon}</span>
            <span>{label}</span>
        </button>
    );
};

// ============================================================================
// Main Component
// ============================================================================

const RunHistoryPanel: React.FC<RunHistoryPanelProps> = ({
    defaultCollapsed = true,
    onOpenReplay,
    onOpenAbCompare,
    onOpenNarrative,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const [isLoading, setIsLoading] = useState(false);
    const [entries, setEntries] = useState<ExperimentEntry[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);

    // Golden Set state
    const [goldenSetSummary, setGoldenSetSummary] = useState<GoldenSetQuickSummary | null>(null);
    const [goldenSetExpanded, setGoldenSetExpanded] = useState(false);

    // Tag state
    const [tagUsage, setTagUsage] = useState<TagUsageSummary | null>(null);
    const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
    const [showStarredOnly, setShowStarredOnly] = useState(false);
    const [tagData, setTagData] = useState<Record<string, RunTagEntry>>({});
    const [showTagDropdown, setShowTagDropdown] = useState(false);

    // Filter state
    const [searchText, setSearchText] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<ExperimentType[]>([]);
    const [selectedVerdicts, setSelectedVerdicts] = useState<('pass' | 'warn' | 'fail' | 'unknown')[]>([]);
    const [showCameraPathOnly, setShowCameraPathOnly] = useState(false);
    const [showTemporalRegOnly, setShowTemporalRegOnly] = useState(false);

    // Sort state
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Load data
    const loadData = useCallback(async () => {
        setIsLoading(true);
        setErrors([]);

        try {
            const [historyResult, goldenSummary, tagSummary, tagsFile] = await Promise.all([
                loadExperimentHistory(),
                getGoldenSetQuickSummary().catch(() => null),
                getTagUsageSummary().catch(() => null),
                loadRunTags().catch(() => ({ entries: {} })),
            ]);
            
            setEntries(historyResult.entries);
            setTotalCount(historyResult.totalCount);
            setGoldenSetSummary(goldenSummary);
            setTagUsage(tagSummary);
            setTagData(tagsFile.entries);
            
            if (historyResult.errors.length > 0) {
                setErrors(historyResult.errors);
            }
        } catch (err) {
            setErrors([`Failed to load run history: ${err}`]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load on mount and when panel is opened
    useEffect(() => {
        if (!isCollapsed) {
            loadData();
        }
    }, [isCollapsed, loadData]);

    // Apply filters and sorting
    const filteredAndSortedEntries = useMemo(() => {
        // First, merge tag data into entries
        const entriesWithTags = entries.map(entry => ({
            ...entry,
            tags: tagData[entry.id]?.tags ?? entry.tags ?? [],
            starred: tagData[entry.id]?.starred ?? false,
            notes: tagData[entry.id]?.notes,
        }));

        const filter: ExperimentFilter = {
            searchText: searchText.trim() || undefined,
            types: selectedTypes.length > 0 ? selectedTypes : undefined,
            qaVerdicts: selectedVerdicts.length > 0 ? selectedVerdicts : undefined,
            hasCameraPath: showCameraPathOnly ? true : undefined,
            temporalRegularization: showTemporalRegOnly ? ['fixed', 'adaptive'] : undefined,
            tags: selectedTagFilters.length > 0 ? selectedTagFilters : undefined,
        };

        let filtered = filterExperiments(entriesWithTags, filter);

        // Additional filtering for starred
        if (showStarredOnly) {
            filtered = filtered.filter(e => e.starred);
        }

        // Custom sorting
        filtered = sortExperiments(filtered, sortDirection === 'asc');

        // Additional sort by field if not date
        if (sortField !== 'date') {
            filtered.sort((a, b) => {
                let comparison = 0;
                switch (sortField) {
                    case 'type':
                        comparison = a.type.localeCompare(b.type);
                        break;
                    case 'label':
                        comparison = a.label.localeCompare(b.label);
                        break;
                    case 'qaVerdict':
                        const verdictOrder = { pass: 0, warn: 1, fail: 2, unknown: 3 };
                        comparison = verdictOrder[a.qaVerdict] - verdictOrder[b.qaVerdict];
                        break;
                }
                return sortDirection === 'asc' ? comparison : -comparison;
            });
        }

        return filtered;
    }, [entries, searchText, selectedTypes, selectedVerdicts, showCameraPathOnly, showTemporalRegOnly, sortField, sortDirection, selectedTagFilters, showStarredOnly, tagData]);

    // Toggle type filter
    const toggleTypeFilter = (type: ExperimentType) => {
        setSelectedTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    // Toggle verdict filter
    const toggleVerdictFilter = (verdict: 'pass' | 'warn' | 'fail' | 'unknown') => {
        setSelectedVerdicts(prev =>
            prev.includes(verdict) ? prev.filter(v => v !== verdict) : [...prev, verdict]
        );
    };

    // Toggle tag filter
    const toggleTagFilter = (tag: string) => {
        setSelectedTagFilters(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // Handle star toggle for a run
    const handleToggleStar = async (runId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const updated = await toggleStarred(runId);
            setTagData(prev => ({ ...prev, [runId]: updated }));
        } catch (err) {
            console.error('Failed to toggle star:', err);
        }
    };

    // Handle tag toggle for a run
    const handleToggleTag = async (runId: string, tag: string) => {
        try {
            const updated = await toggleTag(runId, tag);
            setTagData(prev => ({ ...prev, [runId]: updated }));
        } catch (err) {
            console.error('Failed to toggle tag:', err);
        }
    };

    // Handle sort header click
    const handleSortClick = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Format date for display
    const formatDate = (isoDate: string) => {
        try {
            const date = new Date(isoDate);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return isoDate;
        }
    };

    // Handle action clicks
    const handleOpenReplay = (entry: ExperimentEntry) => {
        if (onOpenReplay) {
            onOpenReplay(entry);
        } else if (entry.manifestPath) {
            // Fallback: copy manifest path
            navigator.clipboard?.writeText(entry.manifestPath);
            alert(`Manifest path copied: ${entry.manifestPath}`);
        }
    };

    const handleOpenAbCompare = (entry: ExperimentEntry) => {
        if (onOpenAbCompare) {
            onOpenAbCompare(entry);
        } else {
            alert('A/B Compare integration coming soon. Entry ID: ' + entry.id);
        }
    };

    const handleOpenNarrative = (entry: ExperimentEntry) => {
        if (onOpenNarrative) {
            onOpenNarrative(entry);
        } else {
            alert('Narrative integration coming soon. Script ID: ' + entry.narrativeScriptId);
        }
    };

    // Sort indicator
    const SortIndicator: React.FC<{ field: SortField }> = ({ field }) => {
        if (sortField !== field) return <span className="text-gray-600 ml-1">↕</span>;
        return <span className="text-amber-400 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="bg-gray-900/50 rounded-lg ring-1 ring-gray-700/80">
            {/* Header */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-800/30 transition-colors rounded-t-lg"
            >
                <div className="flex items-center gap-3">
                    <span className="text-xl">📊</span>
                    <div>
                        <h3 className="text-md font-semibold text-gray-200">Run History</h3>
                        <p className="text-xs text-gray-500">
                            {totalCount > 0 ? `${totalCount} experiments` : 'Browse past experiments'}
                        </p>
                    </div>
                </div>
                <span className="text-gray-400 text-lg">
                    {isCollapsed ? '▶' : '▼'}
                </span>
            </button>

            {/* Content */}
            {!isCollapsed && (
                <div className="p-4 pt-0 space-y-4">
                    {/* Golden Set Summary Section */}
                    {goldenSetSummary && (
                        <div className="bg-gradient-to-r from-amber-900/20 to-yellow-900/10 border border-amber-700/40 rounded-lg overflow-hidden">
                            <button
                                onClick={() => setGoldenSetExpanded(!goldenSetExpanded)}
                                className="w-full flex items-center justify-between p-3 hover:bg-amber-800/10 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">🏆</span>
                                    <div className="text-left">
                                        <span className="font-medium text-amber-200">Golden Set Status</span>
                                        {goldenSetSummary.lastRunDate && (
                                            <span className="ml-2 text-xs text-gray-400">
                                                Last run: {new Date(goldenSetSummary.lastRunDate).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {goldenSetSummary.overallVerdict ? (
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            goldenSetSummary.overallVerdict === 'PASS' 
                                                ? 'bg-green-600/50 text-green-200'
                                                : goldenSetSummary.overallVerdict === 'WARN'
                                                ? 'bg-amber-600/50 text-amber-200'
                                                : 'bg-red-600/50 text-red-200'
                                        }`}>
                                            {goldenSetSummary.overallVerdict === 'PASS' ? '✅' : goldenSetSummary.overallVerdict === 'WARN' ? '⚠️' : '❌'} 
                                            {' '}{goldenSetSummary.passed}/{goldenSetSummary.total} passed
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-500">No runs yet</span>
                                    )}
                                    {goldenSetSummary.hasRegression && (
                                        <span className="px-2 py-0.5 rounded text-xs bg-red-700/50 text-red-200">
                                            ⬇️ Regression
                                        </span>
                                    )}
                                    <span className="text-gray-500">{goldenSetExpanded ? '▼' : '▶'}</span>
                                </div>
                            </button>
                            
                            {goldenSetExpanded && goldenSetSummary.scenarioSummaries.length > 0 && (
                                <div className="border-t border-amber-700/30 p-3 space-y-2">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                        {goldenSetSummary.scenarioSummaries.map(scenario => (
                                            <div 
                                                key={scenario.id}
                                                className={`p-2 rounded text-xs ${
                                                    scenario.verdict === 'PASS' 
                                                        ? 'bg-green-900/30 border border-green-700/40'
                                                        : scenario.verdict === 'WARN'
                                                        ? 'bg-amber-900/30 border border-amber-700/40'
                                                        : 'bg-red-900/30 border border-red-700/40'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-gray-200 truncate" title={scenario.name}>
                                                        {scenario.name}
                                                    </span>
                                                    <span>
                                                        {scenario.verdict === 'PASS' ? '✅' : scenario.verdict === 'WARN' ? '⚠️' : '❌'}
                                                    </span>
                                                </div>
                                                {scenario.delta && scenario.delta !== 'unchanged' && scenario.delta !== 'new' && (
                                                    <span className={`text-[10px] ${
                                                        scenario.delta === 'improved' ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {scenario.delta === 'improved' ? '↑ improved' : '↓ regressed'}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between items-center pt-2 text-xs text-gray-500">
                                        <span>Run: <code className="text-gray-400">npx tsx scripts/run-golden-set.ts</code></span>
                                        <span>Reports: <code className="text-gray-400">reports/GOLDEN_SET_*.md</code></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center bg-gray-800/30 p-3 rounded-lg">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search runs..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm bg-gray-700/50 border border-gray-600 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                            />
                        </div>

                        {/* Type filters */}
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400 mr-1">Type:</span>
                            {(['single-shot', 'ab-compare', 'narrative'] as ExperimentType[]).map(type => (
                                <button
                                    key={type}
                                    onClick={() => toggleTypeFilter(type)}
                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                        selectedTypes.includes(type)
                                            ? 'bg-amber-600/50 text-amber-200'
                                            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50'
                                    }`}
                                >
                                    {type === 'single-shot' ? '🎬' : type === 'ab-compare' ? '⚖️' : '📜'}
                                </button>
                            ))}
                        </div>

                        {/* Verdict filters */}
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400 mr-1">QA:</span>
                            {(['pass', 'warn', 'fail'] as const).map(verdict => (
                                <button
                                    key={verdict}
                                    onClick={() => toggleVerdictFilter(verdict)}
                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                        selectedVerdicts.includes(verdict)
                                            ? verdict === 'pass' ? 'bg-green-600/50 text-green-200'
                                            : verdict === 'warn' ? 'bg-amber-600/50 text-amber-200'
                                            : 'bg-red-600/50 text-red-200'
                                            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50'
                                    }`}
                                >
                                    {verdict === 'pass' ? '✅' : verdict === 'warn' ? '⚠️' : '❌'}
                                </button>
                            ))}
                        </div>

                        {/* Feature toggles */}
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showCameraPathOnly}
                                    onChange={e => setShowCameraPathOnly(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500/50"
                                />
                                📷 Camera
                            </label>
                            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showTemporalRegOnly}
                                    onChange={e => setShowTemporalRegOnly(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500/50"
                                />
                                ⏱️ Temporal
                            </label>
                            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showStarredOnly}
                                    onChange={e => setShowStarredOnly(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500/50"
                                />
                                ⭐ Starred
                            </label>
                        </div>

                        {/* Tag filters */}
                        {tagUsage && tagUsage.mostUsedTags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-gray-400 mr-1">Tags:</span>
                                {tagUsage.mostUsedTags.slice(0, 5).map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTagFilter(tag)}
                                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                                            selectedTagFilters.includes(tag)
                                                ? 'bg-cyan-600/50 text-cyan-200'
                                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50'
                                        }`}
                                    >
                                        🏷️ {tag}
                                    </button>
                                ))}
                                {tagUsage.mostUsedTags.length > 5 && (
                                    <button
                                        onClick={() => setShowTagDropdown(!showTagDropdown)}
                                        className="px-2 py-0.5 text-xs rounded bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
                                    >
                                        +{tagUsage.mostUsedTags.length - 5} more
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Refresh button */}
                        <button
                            onClick={loadData}
                            disabled={isLoading}
                            className="px-3 py-1.5 text-xs bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-md transition-colors disabled:opacity-50"
                        >
                            {isLoading ? '⏳' : '🔄'} Refresh
                        </button>
                    </div>

                    {/* Errors */}
                    {errors.length > 0 && (
                        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                            <p className="text-xs text-red-400 font-medium mb-1">Errors loading run history:</p>
                            {errors.slice(0, 3).map((error, i) => (
                                <p key={i} className="text-xs text-red-300/70">{error}</p>
                            ))}
                            {errors.length > 3 && (
                                <p className="text-xs text-red-300/50 mt-1">...and {errors.length - 3} more</p>
                            )}
                        </div>
                    )}

                    {/* Results count */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                            Showing {filteredAndSortedEntries.length} of {totalCount} runs
                        </span>
                        {selectedTypes.length > 0 || selectedVerdicts.length > 0 || searchText || showCameraPathOnly || showTemporalRegOnly || showStarredOnly || selectedTagFilters.length > 0 ? (
                            <button
                                onClick={() => {
                                    setSearchText('');
                                    setSelectedTypes([]);
                                    setSelectedVerdicts([]);
                                    setShowCameraPathOnly(false);
                                    setShowTemporalRegOnly(false);
                                    setShowStarredOnly(false);
                                    setSelectedTagFilters([]);
                                }}
                                className="text-amber-400 hover:text-amber-300"
                            >
                                Clear filters
                            </button>
                        ) : null}
                    </div>

                    {/* Table */}
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">
                            <span className="animate-pulse">Loading run history...</span>
                        </div>
                    ) : filteredAndSortedEntries.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p className="text-lg mb-2">📭</p>
                            <p>No experiments found</p>
                            <p className="text-xs mt-1">
                                {totalCount === 0
                                    ? 'Run some generations to see them here'
                                    : 'Try adjusting your filters'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-300">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                                    <tr>
                                        <th className="px-2 py-2 w-8">⭐</th>
                                        <th
                                            className="px-3 py-2 cursor-pointer hover:text-gray-200"
                                            onClick={() => handleSortClick('type')}
                                        >
                                            Type<SortIndicator field="type" />
                                        </th>
                                        <th
                                            className="px-3 py-2 cursor-pointer hover:text-gray-200"
                                            onClick={() => handleSortClick('label')}
                                        >
                                            Name / Label<SortIndicator field="label" />
                                        </th>
                                        <th
                                            className="px-3 py-2 cursor-pointer hover:text-gray-200"
                                            onClick={() => handleSortClick('date')}
                                        >
                                            Date<SortIndicator field="date" />
                                        </th>
                                        <th className="px-3 py-2">Preset</th>
                                        <th
                                            className="px-3 py-2 cursor-pointer hover:text-gray-200"
                                            onClick={() => handleSortClick('qaVerdict')}
                                        >
                                            QA<SortIndicator field="qaVerdict" />
                                        </th>
                                        <th className="px-3 py-2">Flags</th>
                                        <th className="px-3 py-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedEntries.map((entry, index) => (
                                        <tr
                                            key={entry.id}
                                            className={`border-b border-gray-700/50 hover:bg-gray-800/30 ${
                                                index % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20'
                                            }`}
                                        >
                                            <td className="px-2 py-2">
                                                <button
                                                    onClick={(e) => handleToggleStar(entry.id, e)}
                                                    className={`text-lg transition-colors ${
                                                        entry.starred 
                                                            ? 'text-amber-400 hover:text-amber-300'
                                                            : 'text-gray-600 hover:text-amber-400'
                                                    }`}
                                                    title={entry.starred ? 'Unstar' : 'Star'}
                                                >
                                                    {entry.starred ? '★' : '☆'}
                                                </button>
                                            </td>
                                            <td className="px-3 py-2">
                                                <TypeBadge type={entry.type} />
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="max-w-xs truncate" title={entry.label}>
                                                    {entry.label}
                                                </div>
                                                {entry.narrativeShotCount && (
                                                    <span className="text-xs text-gray-500">
                                                        {entry.narrativeShotCount} shots
                                                    </span>
                                                )}
                                                {/* Display tags */}
                                                {entry.tags && entry.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {entry.tags.slice(0, 3).map(tag => (
                                                            <span 
                                                                key={tag}
                                                                className="inline-flex items-center px-1.5 py-0 rounded text-[10px] bg-cyan-800/40 text-cyan-300 cursor-pointer hover:bg-cyan-700/50"
                                                                onClick={() => handleToggleTag(entry.id, tag)}
                                                                title={`Click to remove tag: ${tag}`}
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                        {entry.tags.length > 3 && (
                                                            <span className="text-[10px] text-gray-500">
                                                                +{entry.tags.length - 3}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                                                {formatDate(entry.date)}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {entry.preset || entry.workflowProfileId || '—'}
                                            </td>
                                            <td className="px-3 py-2">
                                                <VerdictBadge verdict={entry.qaVerdict} />
                                            </td>
                                            <td className="px-3 py-2">
                                                <FeatureBadges entry={entry} />
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    {entry.type !== 'narrative' && entry.manifestPath && (
                                                        <button
                                                            onClick={() => handleOpenReplay(entry)}
                                                            className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                                                            title="Open in Replay Viewer"
                                                        >
                                                            🔄 Replay
                                                        </button>
                                                    )}
                                                    {entry.type === 'ab-compare' && (
                                                        <button
                                                            onClick={() => handleOpenAbCompare(entry)}
                                                            className="text-xs text-purple-400 hover:text-purple-300 hover:underline"
                                                            title="Open in A/B Compare"
                                                        >
                                                            ⚖️ A/B
                                                        </button>
                                                    )}
                                                    {entry.type === 'narrative' && (
                                                        <button
                                                            onClick={() => handleOpenNarrative(entry)}
                                                            className="text-xs text-green-400 hover:text-green-300 hover:underline"
                                                            title="Open in Narrative Dashboard"
                                                        >
                                                            📜 View
                                                        </button>
                                                    )}
                                                    {entry.videoPath && (
                                                        <FileLink path={entry.videoPath} label="📹" icon="" />
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer with links */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-700/50">
                        <span>
                            Manifests: <code className="text-gray-400">data/manifests/</code> • 
                            Narratives: <code className="text-gray-400">reports/narrative/</code>
                        </span>
                        <a
                            href="https://github.com/Aycrith/gemDirect1/blob/main/Documentation/Guides/RECIPES.md#run-history"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 hover:text-amber-300"
                        >
                            📖 Docs
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RunHistoryPanel;
