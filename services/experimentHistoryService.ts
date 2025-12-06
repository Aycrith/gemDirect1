/**
 * Experiment History Service
 * 
 * Provides unified access to generation experiment history across:
 * - Single-shot generations (from data/manifests/*.json)
 * - A/B comparison runs (detected via manifest naming or tags)
 * - Narrative pipeline runs (from reports/narrative/*.json)
 * 
 * Enables the Run History panel to browse, filter, and re-enter past experiments.
 * 
 * Part of H1 - Run History & Experiment Browser
 * 
 * @module services/experimentHistoryService
 */

import type { GenerationManifest } from './generationManifestService';
import { parseManifest } from './generationManifestService';
import type { NarrativeRunSummary, QAVerdict } from '../types/narrativeScript';

// ============================================================================
// Types
// ============================================================================

/**
 * Type of generation run
 */
export type ExperimentType = 'single-shot' | 'ab-compare' | 'narrative';

/**
 * Unified experiment history entry for display in the Run History panel
 */
export interface ExperimentEntry {
    /** Unique identifier (manifest filename or narrative summary ID) */
    id: string;
    
    /** Type of run */
    type: ExperimentType;
    
    /** Human-readable label (pipeline name, A/B pair ID, or narrative title) */
    label: string;
    
    /** ISO date string when the run was created */
    date: string;
    
    /** Preset/profile used (e.g., 'production-qa', 'cinematic', 'fast') */
    preset?: string;
    
    /** Stability profile used */
    stabilityProfile?: string;
    
    /** Aggregated QA verdict */
    qaVerdict: 'pass' | 'warn' | 'fail' | 'unknown';
    
    /** Whether a camera path was used */
    hasCameraPath: boolean;
    
    /** Camera path ID if available */
    cameraPathId?: string;
    
    /** Temporal regularization mode */
    temporalRegularization: 'none' | 'fixed' | 'adaptive';
    
    /** Path to manifest file (for single-shot and A/B runs) */
    manifestPath?: string;
    
    /** Path to benchmark report */
    benchmarkReportPath?: string;
    
    /** Path to Vision QA report */
    visionQaPath?: string;
    
    /** Path to output video */
    videoPath?: string;
    
    /** Narrative script ID (for narrative runs) */
    narrativeScriptId?: string;
    
    /** Shot count (for narrative runs) */
    narrativeShotCount?: number;
    
    /** Duration in seconds (if available) */
    durationSeconds?: number;
    
    /** Scene ID (if applicable) */
    sceneId?: string;
    
    /** Shot ID (if applicable) */
    shotId?: string;
    
    /** Workflow profile ID */
    workflowProfileId?: string;
    
    /** Additional metadata tags */
    tags?: string[];
    
    /** User notes about this run */
    notes?: string;
    
    /** Whether this run is starred/favorited */
    starred?: boolean;
    
    /** Custom labels (key-value pairs) */
    labels?: Record<string, string>;
    
    /** Raw manifest for advanced operations */
    rawManifest?: GenerationManifest;
    
    /** Raw narrative summary for advanced operations */
    rawNarrativeSummary?: NarrativeRunSummary;
}

/**
 * Filter options for experiment history queries
 */
export interface ExperimentFilter {
    /** Filter by run type(s) */
    types?: ExperimentType[];
    
    /** Search text (matches label, preset, scriptId) */
    searchText?: string;
    
    /** Filter by QA verdict */
    qaVerdicts?: ('pass' | 'warn' | 'fail' | 'unknown')[];
    
    /** Filter by date range (ISO strings) */
    dateFrom?: string;
    dateTo?: string;
    
    /** Filter by camera path presence */
    hasCameraPath?: boolean;
    
    /** Filter by temporal regularization mode */
    temporalRegularization?: ('none' | 'fixed' | 'adaptive')[];
    
    /** Filter by tags (all specified tags must be present) */
    tags?: string[];
    
    /** Filter by starred status */
    starred?: boolean;
    
    /** Filter by label key-value pairs */
    labels?: Record<string, string>;
}

/**
 * Result of loading experiment history
 */
export interface ExperimentHistoryResult {
    /** Loaded entries (sorted by date descending) */
    entries: ExperimentEntry[];
    
    /** Total count before filtering */
    totalCount: number;
    
    /** Errors encountered during loading */
    errors: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Base paths for manifest and summary files
 * These are relative to the public folder for browser access
 */
const MANIFESTS_BASE_PATH = '/data/manifests';
const NARRATIVE_SUMMARIES_BASE_PATH = '/reports/narrative';

/**
 * Alternative paths for Node.js/script context
 */
const NODE_MANIFESTS_PATH = 'data/manifests';
const NODE_NARRATIVE_PATH = 'reports/narrative';

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Detect if running in Node.js or browser context
 */
function isNodeContext(): boolean {
    return typeof window === 'undefined';
}

/**
 * Convert NarrativeQASummary verdict to our simplified format
 */
function normalizeQAVerdict(verdict?: QAVerdict | string): 'pass' | 'warn' | 'fail' | 'unknown' {
    if (!verdict) return 'unknown';
    const v = verdict.toLowerCase();
    if (v === 'pass') return 'pass';
    if (v === 'warn') return 'warn';
    if (v === 'fail') return 'fail';
    return 'unknown';
}

/**
 * Determine QA verdict from manifest quality scores
 */
function getManifestQAVerdict(manifest: GenerationManifest): 'pass' | 'warn' | 'fail' | 'unknown' {
    const scores = manifest.qualityScores;
    if (!scores) return 'unknown';
    
    // Use Vision QA score as primary indicator
    const visionQA = scores.visionQA ?? 0;
    if (visionQA >= 80) return 'pass';
    if (visionQA >= 60) return 'warn';
    if (visionQA > 0) return 'fail';
    
    return 'unknown';
}

/**
 * Detect if a manifest represents an A/B comparison run
 */
function isAbCompareRun(manifest: GenerationManifest): boolean {
    // Check for A/B tags in metadata
    const tags = (manifest.extra?.tags as string[]) ?? [];
    if (tags.some(t => t.toLowerCase().includes('ab-compare') || t.toLowerCase().includes('a/b'))) {
        return true;
    }
    
    // Check for A/B in workflow profile ID
    if (manifest.workflow.profileId.includes('-ab-') || manifest.workflow.profileId.includes('_ab_')) {
        return true;
    }
    
    // Check for comparison metadata
    if (manifest.extra?.comparisonPairId || manifest.extra?.isAbCompare) {
        return true;
    }
    
    return false;
}

/**
 * Extract temporal regularization mode from manifest
 */
function getTemporalRegularizationMode(manifest: GenerationManifest): 'none' | 'fixed' | 'adaptive' {
    if (!manifest.temporalRegularizationApplied) {
        return 'none';
    }
    
    // Check for adaptive mode (from extra metadata if stored)
    if (manifest.extra?.temporalRegularizationAdaptiveMode === true) {
        return 'adaptive';
    }
    
    // Default to fixed if temporal regularization was applied
    return 'fixed';
}

/**
 * Generate a human-readable label from manifest
 */
function generateManifestLabel(manifest: GenerationManifest): string {
    const parts: string[] = [];
    
    // Add scene/shot info if available
    if (manifest.sceneId) {
        parts.push(`Scene: ${manifest.sceneId}`);
    }
    if (manifest.shotId) {
        parts.push(`Shot: ${manifest.shotId}`);
    }
    
    // Add workflow profile
    if (manifest.workflow.label) {
        parts.push(manifest.workflow.label);
    } else if (manifest.workflow.profileId) {
        parts.push(manifest.workflow.profileId);
    }
    
    // Add stability profile if present
    if (manifest.stabilityProfile) {
        parts.push(`[${manifest.stabilityProfile}]`);
    }
    
    return parts.length > 0 ? parts.join(' - ') : `Run ${manifest.manifestId}`;
}

/**
 * Convert GenerationManifest to ExperimentEntry
 */
function manifestToEntry(manifest: GenerationManifest, filePath: string): ExperimentEntry {
    const isAb = isAbCompareRun(manifest);
    const runType: ExperimentType = isAb ? 'ab-compare' : 'single-shot';
    
    return {
        id: manifest.manifestId,
        type: runType,
        label: generateManifestLabel(manifest),
        date: manifest.timing.queuedAt,
        preset: manifest.stabilityProfile,
        stabilityProfile: manifest.stabilityProfile,
        qaVerdict: getManifestQAVerdict(manifest),
        hasCameraPath: !!manifest.cameraPathId || !!manifest.cameraPathSummary,
        cameraPathId: manifest.cameraPathId,
        temporalRegularization: getTemporalRegularizationMode(manifest),
        manifestPath: filePath,
        videoPath: manifest.outputs.videoPath,
        durationSeconds: manifest.outputs.durationSeconds,
        sceneId: manifest.sceneId,
        shotId: manifest.shotId,
        workflowProfileId: manifest.workflow.profileId,
        tags: (manifest.extra?.tags as string[]) ?? [],
        rawManifest: manifest,
    };
}

/**
 * Convert NarrativeRunSummary to ExperimentEntry
 */
function narrativeSummaryToEntry(summary: NarrativeRunSummary, filePath: string): ExperimentEntry {
    // Get overall QA verdict from narrative summary
    let qaVerdict: 'pass' | 'warn' | 'fail' | 'unknown' = 'unknown';
    if (summary.qaSummary) {
        qaVerdict = normalizeQAVerdict(summary.qaSummary.overallVerdict);
    } else if (summary.status === 'succeeded') {
        qaVerdict = 'pass';
    } else if (summary.status === 'failed') {
        qaVerdict = 'fail';
    }
    
    // Check for camera path usage across shots
    const hasCameraPath = summary.qaSummary?.shots?.some(s => !!s.cameraPathId) ?? false;
    const cameraPathId = summary.qaSummary?.shots?.find(s => !!s.cameraPathId)?.cameraPathId;
    
    // Check for temporal regularization across shots
    const hasTemporalReg = summary.qaSummary?.shots?.some(s => s.temporalRegularizationApplied) ?? false;
    
    return {
        id: summary.narrativeId,
        type: 'narrative',
        label: summary.title || `Narrative: ${summary.narrativeId}`,
        date: summary.startedAt,
        qaVerdict,
        hasCameraPath,
        cameraPathId,
        temporalRegularization: hasTemporalReg ? 'fixed' : 'none',
        manifestPath: filePath,
        videoPath: summary.finalVideoPath,
        narrativeScriptId: summary.narrativeId,
        narrativeShotCount: summary.shotCount,
        durationSeconds: summary.totalDurationMs ? summary.totalDurationMs / 1000 : undefined,
        tags: [],
        rawNarrativeSummary: summary,
    };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load manifest files from the manifests directory
 * Works in both browser and Node.js contexts
 */
export async function loadManifestEntries(): Promise<{ entries: ExperimentEntry[]; errors: string[] }> {
    const entries: ExperimentEntry[] = [];
    const errors: string[] = [];
    
    if (isNodeContext()) {
        // Node.js context: use fs
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            const manifestsDir = path.resolve(process.cwd(), NODE_MANIFESTS_PATH);
            
            if (!fs.existsSync(manifestsDir)) {
                return { entries, errors: [`Manifests directory not found: ${manifestsDir}`] };
            }
            
            const files = fs.readdirSync(manifestsDir).filter(f => f.endsWith('.json') && f !== 'README.md');
            
            for (const file of files) {
                try {
                    const filePath = path.join(manifestsDir, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const manifest = parseManifest(content);
                    
                    if (manifest) {
                        entries.push(manifestToEntry(manifest, filePath));
                    }
                } catch (err) {
                    errors.push(`Failed to parse manifest ${file}: ${err}`);
                }
            }
        } catch (err) {
            errors.push(`Failed to load manifests: ${err}`);
        }
    } else {
        // Browser context: fetch manifest index
        try {
            // Try to fetch a manifest index file first
            const indexResponse = await fetch(`${MANIFESTS_BASE_PATH}/index.json`);
            
            if (indexResponse.ok) {
                const index = await indexResponse.json() as { files: string[] };
                
                for (const file of index.files || []) {
                    try {
                        const manifestResponse = await fetch(`${MANIFESTS_BASE_PATH}/${file}`);
                        if (manifestResponse.ok) {
                            const content = await manifestResponse.text();
                            const manifest = parseManifest(content);
                            
                            if (manifest) {
                                entries.push(manifestToEntry(manifest, `${MANIFESTS_BASE_PATH}/${file}`));
                            }
                        }
                    } catch (err) {
                        errors.push(`Failed to load manifest ${file}: ${err}`);
                    }
                }
            } else {
                // No index file - try to list common manifest names or return empty
                // In browser without server-side listing, we can't enumerate files
                errors.push('No manifest index found. Manifests cannot be enumerated in browser without server support.');
            }
        } catch (err) {
            errors.push(`Failed to load manifest index: ${err}`);
        }
    }
    
    return { entries, errors };
}

/**
 * Load narrative run summaries from the reports directory
 */
export async function loadNarrativeEntries(): Promise<{ entries: ExperimentEntry[]; errors: string[] }> {
    const entries: ExperimentEntry[] = [];
    const errors: string[] = [];
    
    if (isNodeContext()) {
        // Node.js context: use fs
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            const narrativeDir = path.resolve(process.cwd(), NODE_NARRATIVE_PATH);
            
            if (!fs.existsSync(narrativeDir)) {
                return { entries, errors: [] }; // Not an error if no narrative runs exist
            }
            
            const files = fs.readdirSync(narrativeDir).filter(f => f.endsWith('.json'));
            
            for (const file of files) {
                try {
                    const filePath = path.join(narrativeDir, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const summary = JSON.parse(content) as NarrativeRunSummary;
                    
                    // Validate it's a narrative summary
                    if (summary.narrativeId && summary.startedAt) {
                        entries.push(narrativeSummaryToEntry(summary, filePath));
                    }
                } catch (err) {
                    errors.push(`Failed to parse narrative summary ${file}: ${err}`);
                }
            }
        } catch (err) {
            errors.push(`Failed to load narrative summaries: ${err}`);
        }
    } else {
        // Browser context: fetch narrative index
        try {
            const indexResponse = await fetch(`${NARRATIVE_SUMMARIES_BASE_PATH}/index.json`);
            
            if (indexResponse.ok) {
                const index = await indexResponse.json() as { files: string[] };
                
                for (const file of index.files || []) {
                    try {
                        const summaryResponse = await fetch(`${NARRATIVE_SUMMARIES_BASE_PATH}/${file}`);
                        if (summaryResponse.ok) {
                            const summary = await summaryResponse.json() as NarrativeRunSummary;
                            
                            if (summary.narrativeId && summary.startedAt) {
                                entries.push(narrativeSummaryToEntry(summary, `${NARRATIVE_SUMMARIES_BASE_PATH}/${file}`));
                            }
                        }
                    } catch (err) {
                        errors.push(`Failed to load narrative summary ${file}: ${err}`);
                    }
                }
            }
            // If no index, silently return empty (no narrative runs yet)
        } catch (err) {
            // Silently handle - no narrative runs is a valid state
        }
    }
    
    return { entries, errors };
}

/**
 * Apply filters to experiment entries
 */
export function filterExperiments(entries: ExperimentEntry[], filter: ExperimentFilter): ExperimentEntry[] {
    return entries.filter(entry => {
        // Filter by type
        if (filter.types && filter.types.length > 0 && !filter.types.includes(entry.type)) {
            return false;
        }
        
        // Filter by search text
        if (filter.searchText && filter.searchText.trim()) {
            const search = filter.searchText.toLowerCase();
            const matches = 
                entry.label.toLowerCase().includes(search) ||
                (entry.preset?.toLowerCase().includes(search)) ||
                (entry.narrativeScriptId?.toLowerCase().includes(search)) ||
                (entry.sceneId?.toLowerCase().includes(search)) ||
                (entry.shotId?.toLowerCase().includes(search)) ||
                (entry.workflowProfileId?.toLowerCase().includes(search)) ||
                entry.tags?.some(t => t.toLowerCase().includes(search));
            
            if (!matches) return false;
        }
        
        // Filter by QA verdict
        if (filter.qaVerdicts && filter.qaVerdicts.length > 0 && !filter.qaVerdicts.includes(entry.qaVerdict)) {
            return false;
        }
        
        // Filter by date range
        if (filter.dateFrom && entry.date < filter.dateFrom) {
            return false;
        }
        if (filter.dateTo && entry.date > filter.dateTo) {
            return false;
        }
        
        // Filter by camera path
        if (filter.hasCameraPath !== undefined && entry.hasCameraPath !== filter.hasCameraPath) {
            return false;
        }
        
        // Filter by temporal regularization
        if (filter.temporalRegularization && filter.temporalRegularization.length > 0) {
            if (!filter.temporalRegularization.includes(entry.temporalRegularization)) {
                return false;
            }
        }
        
        // Filter by tags (all specified tags must be present)
        if (filter.tags && filter.tags.length > 0) {
            const entryTags = entry.tags ?? [];
            if (!filter.tags.every(t => entryTags.includes(t))) {
                return false;
            }
        }
        
        return true;
    });
}

/**
 * Sort entries by date (descending by default)
 */
export function sortExperiments(entries: ExperimentEntry[], ascending = false): ExperimentEntry[] {
    return [...entries].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return ascending ? dateA - dateB : dateB - dateA;
    });
}

/**
 * Load complete experiment history from all sources
 * 
 * @returns Unified experiment history result with entries sorted by date (newest first)
 */
export async function loadExperimentHistory(filter?: ExperimentFilter): Promise<ExperimentHistoryResult> {
    const allErrors: string[] = [];
    let allEntries: ExperimentEntry[] = [];
    
    // Load from all sources in parallel
    const [manifestResult, narrativeResult] = await Promise.all([
        loadManifestEntries(),
        loadNarrativeEntries(),
    ]);
    
    allEntries = [...manifestResult.entries, ...narrativeResult.entries];
    allErrors.push(...manifestResult.errors, ...narrativeResult.errors);
    
    const totalCount = allEntries.length;
    
    // Apply filters if provided
    if (filter) {
        allEntries = filterExperiments(allEntries, filter);
    }
    
    // Sort by date descending
    allEntries = sortExperiments(allEntries, false);
    
    return {
        entries: allEntries,
        totalCount,
        errors: allErrors,
    };
}

/**
 * Get a single experiment entry by ID
 */
export async function getExperimentEntry(id: string): Promise<ExperimentEntry | null> {
    const result = await loadExperimentHistory();
    return result.entries.find(e => e.id === id) ?? null;
}

/**
 * Get statistics about experiment history
 */
export async function getExperimentStats(): Promise<{
    total: number;
    byType: Record<ExperimentType, number>;
    byVerdict: Record<string, number>;
    withCameraPath: number;
    withTemporalReg: number;
}> {
    const result = await loadExperimentHistory();
    
    const stats = {
        total: result.entries.length,
        byType: { 'single-shot': 0, 'ab-compare': 0, 'narrative': 0 } as Record<ExperimentType, number>,
        byVerdict: { pass: 0, warn: 0, fail: 0, unknown: 0 },
        withCameraPath: 0,
        withTemporalReg: 0,
    };
    
    for (const entry of result.entries) {
        stats.byType[entry.type]++;
        stats.byVerdict[entry.qaVerdict]++;
        if (entry.hasCameraPath) stats.withCameraPath++;
        if (entry.temporalRegularization !== 'none') stats.withTemporalReg++;
    }
    
    return stats;
}

// ============================================================================
// Export
// ============================================================================

export default {
    loadExperimentHistory,
    loadManifestEntries,
    loadNarrativeEntries,
    filterExperiments,
    sortExperiments,
    getExperimentEntry,
    getExperimentStats,
};
