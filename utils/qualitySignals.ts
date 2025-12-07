/**
 * Quality Signals Utilities
 * 
 * Helpers for categorizing warnings and extracting QA/benchmark signals
 * from pipeline summaries.
 * 
 * @module utils/qualitySignals
 */

// ============================================================================
// Types
// ============================================================================

export type WarningCategory = 'temporal' | 'preflight' | 'qa' | 'benchmark' | 'other';

export interface CategorizedWarning {
    category: WarningCategory;
    label: string;
    message: string;
    original: string;
}

export interface WarningCluster {
    category: WarningCategory;
    label: string;
    icon: string;
    color: string;
    warnings: CategorizedWarning[];
}

export type QaVerdict = 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | 'UNKNOWN';

export interface QaSignal {
    verdict: QaVerdict;
    label: string;
    icon: string;
    color: string;
    bgColor: string;
}

// ============================================================================
// Warning Categorization
// ============================================================================

/**
 * Patterns for categorizing warnings
 */
const CATEGORY_PATTERNS: Record<WarningCategory, RegExp[]> = {
    temporal: [
        /temporal/i,
        /tmix/i,
        /smoothing/i,
        /deflicker/i,
        /frame.*stability/i,
        /zero-byte/i,
        /normalize/i,
    ],
    preflight: [
        /preflight/i,
        /ffmpeg/i,
        /vlm/i,
        /reachable/i,
        /endpoint/i,
        /connection/i,
    ],
    qa: [
        /qa\s*(status|check|fail|pass|warn)/i,
        /vision.*qa/i,
        /quality.*check/i,
        /frame.*match/i,
        /coherence/i,
    ],
    benchmark: [
        /benchmark/i,
        /jitter/i,
        /flicker/i,
        /score/i,
        /metric/i,
        /threshold/i,
    ],
    other: [],
};

/**
 * Category display metadata
 */
const CATEGORY_META: Record<WarningCategory, { icon: string; label: string; color: string }> = {
    temporal: { icon: '⏱️', label: 'Temporal', color: 'amber' },
    preflight: { icon: '🔧', label: 'Preflight', color: 'blue' },
    qa: { icon: '🔍', label: 'QA', color: 'purple' },
    benchmark: { icon: '📊', label: 'Benchmark', color: 'cyan' },
    other: { icon: '⚠️', label: 'Other', color: 'gray' },
};

/**
 * Categorize a single warning string
 */
export function categorizeWarning(warning: string): CategorizedWarning {
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS) as [WarningCategory, RegExp[]][]) {
        if (category === 'other') continue;
        
        for (const pattern of patterns) {
            if (pattern.test(warning)) {
                const meta = CATEGORY_META[category];
                return {
                    category,
                    label: meta.label,
                    message: warning,
                    original: warning,
                };
            }
        }
    }
    
    return {
        category: 'other',
        label: CATEGORY_META.other.label,
        message: warning,
        original: warning,
    };
}

/**
 * Categorize multiple warnings and cluster by category
 */
export function clusterWarnings(warnings: string[] | undefined): WarningCluster[] {
    if (!warnings || warnings.length === 0) return [];
    
    const categorized = warnings.map(categorizeWarning);
    const clusters = new Map<WarningCategory, CategorizedWarning[]>();
    
    for (const warning of categorized) {
        const existing = clusters.get(warning.category) || [];
        existing.push(warning);
        clusters.set(warning.category, existing);
    }
    
    // Build ordered clusters (temporal, preflight, qa, benchmark, other)
    const order: WarningCategory[] = ['temporal', 'preflight', 'qa', 'benchmark', 'other'];
    const result: WarningCluster[] = [];
    
    for (const category of order) {
        const clusterWarnings = clusters.get(category);
        if (clusterWarnings && clusterWarnings.length > 0) {
            const meta = CATEGORY_META[category];
            result.push({
                category,
                label: meta.label,
                icon: meta.icon,
                color: meta.color,
                warnings: clusterWarnings,
            });
        }
    }
    
    return result;
}

/**
 * Get warning counts by category
 */
export function getWarningCounts(warnings: string[] | undefined): Record<WarningCategory, number> {
    const counts: Record<WarningCategory, number> = {
        temporal: 0,
        preflight: 0,
        qa: 0,
        benchmark: 0,
        other: 0,
    };
    
    if (!warnings) return counts;
    
    for (const warning of warnings) {
        const categorized = categorizeWarning(warning);
        counts[categorized.category]++;
    }
    
    return counts;
}

// ============================================================================
// QA Signal Helpers
// ============================================================================

/**
 * Normalize QA status string to QaVerdict
 */
export function normalizeQaVerdict(status: string | undefined): QaVerdict {
    if (!status) return 'UNKNOWN';
    
    const upper = status.toUpperCase();
    if (upper === 'PASS' || upper === 'PASSED') return 'PASS';
    if (upper === 'FAIL' || upper === 'FAILED') return 'FAIL';
    if (upper === 'WARN' || upper === 'WARNING' || upper === 'PARTIAL') return 'WARN';
    if (upper === 'SKIP' || upper === 'SKIPPED') return 'SKIP';
    
    return 'UNKNOWN';
}

/**
 * Get QA signal display properties
 */
export function getQaSignal(status: string | undefined): QaSignal {
    const verdict = normalizeQaVerdict(status);
    
    switch (verdict) {
        case 'PASS':
            return {
                verdict,
                label: 'PASS',
                icon: '✅',
                color: 'text-green-300',
                bgColor: 'bg-green-900/50',
            };
        case 'FAIL':
            return {
                verdict,
                label: 'FAIL',
                icon: '❌',
                color: 'text-red-300',
                bgColor: 'bg-red-900/50',
            };
        case 'WARN':
            return {
                verdict,
                label: 'WARN',
                icon: '⚠️',
                color: 'text-amber-300',
                bgColor: 'bg-amber-900/50',
            };
        case 'SKIP':
            return {
                verdict,
                label: 'SKIP',
                icon: '⏭️',
                color: 'text-gray-400',
                bgColor: 'bg-gray-700/50',
            };
        default:
            return {
                verdict,
                label: 'N/A',
                icon: '❓',
                color: 'text-gray-400',
                bgColor: 'bg-gray-700/50',
            };
    }
}

/**
 * Get compact QA badge class based on verdict
 */
export function getQaBadgeClass(verdict: QaVerdict): string {
    switch (verdict) {
        case 'PASS':
            return 'bg-green-900/40 text-green-300 border-green-700/50';
        case 'FAIL':
            return 'bg-red-900/40 text-red-300 border-red-700/50';
        case 'WARN':
            return 'bg-amber-900/40 text-amber-300 border-amber-700/50';
        case 'SKIP':
            return 'bg-gray-700/40 text-gray-400 border-gray-600/50';
        default:
            return 'bg-gray-700/40 text-gray-400 border-gray-600/50';
    }
}

// ============================================================================
// Shot Warning Helpers
// ============================================================================

export interface ShotWarningsSummary {
    totalShots: number;
    shotsWithQaWarnings: number;
    shotsWithTemporalWarnings: number;
    shotsWithAnyWarning: number;
}

/**
 * Count shot warnings from narrative shot artifacts
 */
export function countShotWarnings(
    shots: Array<{
        shotId: string;
        temporalSkipReason?: string;
        temporalWarning?: string;
        temporalApplied?: boolean;
    }> | undefined
): ShotWarningsSummary {
    if (!shots || shots.length === 0) {
        return {
            totalShots: 0,
            shotsWithQaWarnings: 0,
            shotsWithTemporalWarnings: 0,
            shotsWithAnyWarning: 0,
        };
    }
    
    let shotsWithTemporalWarnings = 0;
    
    for (const shot of shots) {
        // Check for temporal warnings (skip reason or warning, and not applied)
        const hasTemporalIssue = 
            (shot.temporalSkipReason && !shot.temporalApplied) ||
            (shot.temporalWarning && !shot.temporalApplied);
        
        if (hasTemporalIssue) {
            shotsWithTemporalWarnings++;
        }
    }
    
    return {
        totalShots: shots.length,
        shotsWithQaWarnings: 0, // Would need QA data per shot to track this
        shotsWithTemporalWarnings,
        shotsWithAnyWarning: shotsWithTemporalWarnings,
    };
}

// ============================================================================
// Artifact Link Helpers
// ============================================================================

export interface ArtifactLinks {
    visionQa?: string;
    benchmarkJson?: string;
    benchmarkReport?: string;
    manifest?: string;
}

/**
 * Extract artifact links from production summary
 */
export function extractProductionArtifactLinks(summary: {
    visionQaResultsPath?: string;
    benchmarkJsonPath?: string;
    benchmarkReportPath?: string;
    manifestPath?: string;
} | null | undefined): ArtifactLinks {
    if (!summary) return {};
    
    return {
        visionQa: summary.visionQaResultsPath,
        benchmarkJson: summary.benchmarkJsonPath,
        benchmarkReport: summary.benchmarkReportPath,
        manifest: summary.manifestPath,
    };
}

/**
 * Check if any artifact links are available
 */
export function hasAnyArtifactLinks(links: ArtifactLinks): boolean {
    return !!(links.visionQa || links.benchmarkJson || links.benchmarkReport || links.manifest);
}
