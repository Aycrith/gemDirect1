/**
 * Run Tags Service
 * 
 * Manages user-defined tags and notes for experiment runs.
 * Tags are stored in a sidecar file (run-tags.json) to avoid
 * modifying the original manifest files.
 * 
 * Part of Q4 - Run History Filtering & Tagging
 * 
 * @module services/runTagsService
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * User-defined metadata for a single run
 */
export interface RunTagEntry {
    /** Run ID (matches ExperimentEntry.id) */
    runId: string;
    
    /** User-assigned tags */
    tags: string[];
    
    /** User notes */
    notes?: string;
    
    /** When this entry was created */
    createdAt: string;
    
    /** When this entry was last modified */
    updatedAt: string;
    
    /** Whether this run is favorited/starred */
    starred?: boolean;
    
    /** Custom labels (key-value pairs) */
    labels?: Record<string, string>;
}

/**
 * Structure of the run-tags.json sidecar file
 */
export interface RunTagsFile {
    /** Schema version for future migrations */
    version: string;
    
    /** Last modified timestamp */
    lastModified: string;
    
    /** Run tag entries keyed by runId */
    entries: Record<string, RunTagEntry>;
    
    /** Predefined tag suggestions */
    suggestedTags?: string[];
    
    /** Predefined label keys */
    suggestedLabels?: string[];
}

/**
 * Summary of tag usage across all runs
 */
export interface TagUsageSummary {
    /** All unique tags with their usage counts */
    tagCounts: Record<string, number>;
    
    /** Tags sorted by usage (most used first) */
    mostUsedTags: string[];
    
    /** Total number of tagged runs */
    taggedRunCount: number;
    
    /** Total number of starred runs */
    starredRunCount: number;
    
    /** All unique labels with their possible values */
    labelValues: Record<string, string[]>;
}

// ============================================================================
// Constants
// ============================================================================

const RUN_TAGS_FILENAME = 'run-tags.json';
const CURRENT_VERSION = '1.0.0';

// Default suggested tags
const DEFAULT_SUGGESTED_TAGS = [
    'baseline',
    'regression',
    'experiment',
    'production',
    'debug',
    'favorite',
    'review-needed',
    'approved',
    'bug',
    'feature-test',
];

// Default suggested labels
const DEFAULT_SUGGESTED_LABELS = [
    'category',
    'priority',
    'status',
    'author',
];

// ============================================================================
// Environment Detection
// ============================================================================

function isNodeEnvironment(): boolean {
    return typeof window === 'undefined' && typeof process !== 'undefined';
}

function getRunTagsPath(): string {
    // In Node, use project root/data directory
    return path.resolve(__dirname, '..', 'data', RUN_TAGS_FILENAME);
}

// ============================================================================
// File Operations (Node.js only)
// ============================================================================

let cachedTagsFile: RunTagsFile | null = null;

/**
 * Load run tags file from disk
 */
function loadTagsFileFromDisk(): RunTagsFile | null {
    if (!isNodeEnvironment()) {
        return null;
    }
    
    const tagsPath = getRunTagsPath();
    
    if (!fs.existsSync(tagsPath)) {
        return null;
    }
    
    try {
        const content = fs.readFileSync(tagsPath, 'utf-8');
        return JSON.parse(content) as RunTagsFile;
    } catch (error) {
        console.error('Failed to load run-tags.json:', error);
        return null;
    }
}

/**
 * Save run tags file to disk
 */
function saveTagsFileToDisk(tagsFile: RunTagsFile): boolean {
    if (!isNodeEnvironment()) {
        return false;
    }
    
    const tagsPath = getRunTagsPath();
    const tagsDir = path.dirname(tagsPath);
    
    try {
        if (!fs.existsSync(tagsDir)) {
            fs.mkdirSync(tagsDir, { recursive: true });
        }
        
        fs.writeFileSync(tagsPath, JSON.stringify(tagsFile, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save run-tags.json:', error);
        return false;
    }
}

// ============================================================================
// Browser Storage Operations
// ============================================================================

const LOCALSTORAGE_KEY = 'gemDirect_runTags';

/**
 * Load run tags from localStorage (browser)
 */
function loadTagsFromBrowser(): RunTagsFile | null {
    if (isNodeEnvironment()) {
        return null;
    }
    
    try {
        const stored = localStorage.getItem(LOCALSTORAGE_KEY);
        if (!stored) {
            return null;
        }
        return JSON.parse(stored) as RunTagsFile;
    } catch {
        return null;
    }
}

/**
 * Save run tags to localStorage (browser)
 */
function saveTagsToBrowser(tagsFile: RunTagsFile): boolean {
    if (isNodeEnvironment()) {
        return false;
    }
    
    try {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(tagsFile));
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// Unified Load/Save
// ============================================================================

/**
 * Create a new empty tags file
 */
function createEmptyTagsFile(): RunTagsFile {
    return {
        version: CURRENT_VERSION,
        lastModified: new Date().toISOString(),
        entries: {},
        suggestedTags: DEFAULT_SUGGESTED_TAGS,
        suggestedLabels: DEFAULT_SUGGESTED_LABELS,
    };
}

/**
 * Load run tags (from disk or localStorage depending on environment)
 */
export async function loadRunTags(): Promise<RunTagsFile> {
    if (cachedTagsFile) {
        return cachedTagsFile;
    }
    
    let tagsFile: RunTagsFile | null = null;
    
    if (isNodeEnvironment()) {
        tagsFile = loadTagsFileFromDisk();
    } else {
        tagsFile = loadTagsFromBrowser();
    }
    
    if (!tagsFile) {
        tagsFile = createEmptyTagsFile();
    }
    
    cachedTagsFile = tagsFile;
    return tagsFile;
}

/**
 * Save run tags (to disk or localStorage depending on environment)
 */
export async function saveRunTags(tagsFile: RunTagsFile): Promise<boolean> {
    tagsFile.lastModified = new Date().toISOString();
    cachedTagsFile = tagsFile;
    
    if (isNodeEnvironment()) {
        return saveTagsFileToDisk(tagsFile);
    } else {
        return saveTagsToBrowser(tagsFile);
    }
}

/**
 * Invalidate cache (useful after external changes)
 */
export function invalidateCache(): void {
    cachedTagsFile = null;
}

// ============================================================================
// Tag Operations
// ============================================================================

/**
 * Get tags for a specific run
 */
export async function getRunTags(runId: string): Promise<RunTagEntry | null> {
    const tagsFile = await loadRunTags();
    return tagsFile.entries[runId] ?? null;
}

/**
 * Set/update tags for a specific run
 */
export async function setRunTags(
    runId: string,
    update: Partial<Omit<RunTagEntry, 'runId' | 'createdAt' | 'updatedAt'>>
): Promise<RunTagEntry> {
    const tagsFile = await loadRunTags();
    const existing = tagsFile.entries[runId];
    const now = new Date().toISOString();
    
    const entry: RunTagEntry = {
        runId,
        tags: update.tags ?? existing?.tags ?? [],
        notes: update.notes ?? existing?.notes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        starred: update.starred ?? existing?.starred,
        labels: update.labels ?? existing?.labels,
    };
    
    tagsFile.entries[runId] = entry;
    await saveRunTags(tagsFile);
    
    return entry;
}

/**
 * Add tags to a run (without removing existing tags)
 */
export async function addTags(runId: string, newTags: string[]): Promise<RunTagEntry> {
    const existing = await getRunTags(runId);
    const currentTags = existing?.tags ?? [];
    const mergedTags = [...new Set([...currentTags, ...newTags])];
    
    return setRunTags(runId, { tags: mergedTags });
}

/**
 * Remove tags from a run
 */
export async function removeTags(runId: string, tagsToRemove: string[]): Promise<RunTagEntry> {
    const existing = await getRunTags(runId);
    const currentTags = existing?.tags ?? [];
    const filteredTags = currentTags.filter(t => !tagsToRemove.includes(t));
    
    return setRunTags(runId, { tags: filteredTags });
}

/**
 * Toggle a single tag on a run
 */
export async function toggleTag(runId: string, tag: string): Promise<RunTagEntry> {
    const existing = await getRunTags(runId);
    const currentTags = existing?.tags ?? [];
    
    if (currentTags.includes(tag)) {
        return removeTags(runId, [tag]);
    } else {
        return addTags(runId, [tag]);
    }
}

/**
 * Toggle starred status
 */
export async function toggleStarred(runId: string): Promise<RunTagEntry> {
    const existing = await getRunTags(runId);
    return setRunTags(runId, { starred: !existing?.starred });
}

/**
 * Set notes for a run
 */
export async function setNotes(runId: string, notes: string): Promise<RunTagEntry> {
    return setRunTags(runId, { notes: notes || undefined });
}

/**
 * Set a label on a run
 */
export async function setLabel(runId: string, key: string, value: string): Promise<RunTagEntry> {
    const existing = await getRunTags(runId);
    const labels = { ...existing?.labels, [key]: value };
    return setRunTags(runId, { labels });
}

/**
 * Remove a label from a run
 */
export async function removeLabel(runId: string, key: string): Promise<RunTagEntry> {
    const existing = await getRunTags(runId);
    if (!existing?.labels) return existing ?? setRunTags(runId, {});
    
    const labels = { ...existing.labels };
    delete labels[key];
    return setRunTags(runId, { labels });
}

/**
 * Delete all tag data for a run
 */
export async function deleteRunTags(runId: string): Promise<boolean> {
    const tagsFile = await loadRunTags();
    if (!tagsFile.entries[runId]) {
        return false;
    }
    
    delete tagsFile.entries[runId];
    await saveRunTags(tagsFile);
    return true;
}

// ============================================================================
// Query Operations
// ============================================================================

/**
 * Get all runs with a specific tag
 */
export async function getRunsWithTag(tag: string): Promise<string[]> {
    const tagsFile = await loadRunTags();
    return Object.values(tagsFile.entries)
        .filter(entry => entry.tags.includes(tag))
        .map(entry => entry.runId);
}

/**
 * Get all starred runs
 */
export async function getStarredRuns(): Promise<string[]> {
    const tagsFile = await loadRunTags();
    return Object.values(tagsFile.entries)
        .filter(entry => entry.starred)
        .map(entry => entry.runId);
}

/**
 * Get all runs with a specific label value
 */
export async function getRunsWithLabel(key: string, value: string): Promise<string[]> {
    const tagsFile = await loadRunTags();
    return Object.values(tagsFile.entries)
        .filter(entry => entry.labels?.[key] === value)
        .map(entry => entry.runId);
}

/**
 * Get tag usage summary
 */
export async function getTagUsageSummary(): Promise<TagUsageSummary> {
    const tagsFile = await loadRunTags();
    const tagCounts: Record<string, number> = {};
    const labelValues: Record<string, Set<string>> = {};
    let starredCount = 0;
    
    for (const entry of Object.values(tagsFile.entries)) {
        for (const tag of entry.tags) {
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
        
        if (entry.starred) {
            starredCount++;
        }
        
        if (entry.labels) {
            for (const [key, value] of Object.entries(entry.labels)) {
                if (!labelValues[key]) {
                    labelValues[key] = new Set();
                }
                labelValues[key].add(value);
            }
        }
    }
    
    // Sort tags by usage
    const mostUsedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);
    
    // Convert Set to Array for labelValues
    const labelValuesArray: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(labelValues)) {
        labelValuesArray[key] = Array.from(values);
    }
    
    return {
        tagCounts,
        mostUsedTags,
        taggedRunCount: Object.values(tagsFile.entries).filter(e => e.tags.length > 0).length,
        starredRunCount: starredCount,
        labelValues: labelValuesArray,
    };
}

/**
 * Get suggested tags (includes default + user-defined)
 */
export async function getSuggestedTags(): Promise<string[]> {
    const tagsFile = await loadRunTags();
    const summary = await getTagUsageSummary();
    
    // Combine suggested and actually used tags
    const allTags = new Set([
        ...(tagsFile.suggestedTags ?? DEFAULT_SUGGESTED_TAGS),
        ...summary.mostUsedTags,
    ]);
    
    return Array.from(allTags);
}

/**
 * Add a new suggested tag
 */
export async function addSuggestedTag(tag: string): Promise<void> {
    const tagsFile = await loadRunTags();
    const suggested = tagsFile.suggestedTags ?? [...DEFAULT_SUGGESTED_TAGS];
    
    if (!suggested.includes(tag)) {
        suggested.push(tag);
        tagsFile.suggestedTags = suggested;
        await saveRunTags(tagsFile);
    }
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Add tags to multiple runs
 */
export async function bulkAddTags(runIds: string[], tags: string[]): Promise<number> {
    let count = 0;
    for (const runId of runIds) {
        await addTags(runId, tags);
        count++;
    }
    return count;
}

/**
 * Remove tags from multiple runs
 */
export async function bulkRemoveTags(runIds: string[], tags: string[]): Promise<number> {
    let count = 0;
    for (const runId of runIds) {
        await removeTags(runId, tags);
        count++;
    }
    return count;
}

/**
 * Export all tag data (for backup)
 */
export async function exportTagData(): Promise<string> {
    const tagsFile = await loadRunTags();
    return JSON.stringify(tagsFile, null, 2);
}

/**
 * Import tag data (for restore)
 */
export async function importTagData(jsonData: string): Promise<boolean> {
    try {
        const imported = JSON.parse(jsonData) as RunTagsFile;
        
        // Validate structure
        if (!imported.version || !imported.entries) {
            throw new Error('Invalid tag data format');
        }
        
        // Merge with existing (imported data takes precedence)
        const existing = await loadRunTags();
        const merged: RunTagsFile = {
            ...existing,
            ...imported,
            entries: {
                ...existing.entries,
                ...imported.entries,
            },
            suggestedTags: [
                ...new Set([
                    ...(existing.suggestedTags ?? []),
                    ...(imported.suggestedTags ?? []),
                ]),
            ],
            lastModified: new Date().toISOString(),
        };
        
        await saveRunTags(merged);
        return true;
    } catch (error) {
        console.error('Failed to import tag data:', error);
        return false;
    }
}
