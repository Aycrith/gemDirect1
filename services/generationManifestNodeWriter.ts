/**
 * Generation Manifest Node Writer
 * 
 * Node.js-only adapter for persisting generation manifests to disk.
 * This module is imported ONLY from Node/CLI scripts, never from browser code.
 * 
 * Usage:
 * ```typescript
 * import { writeManifest, writeManifestSync } from './services/generationManifestNodeWriter';
 * 
 * // Async write
 * const path = await writeManifest(manifest);
 * 
 * // Sync write
 * const path = writeManifestSync(manifest);
 * ```
 * 
 * @module services/generationManifestNodeWriter
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { GenerationManifest } from './generationManifestService';
import { serializeManifest, getManifestFilename } from './generationManifestService';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default manifest storage directory (relative to project root).
 * Manifests are stored at: data/manifests/<filename>.json
 */
export const DEFAULT_MANIFESTS_DIR = 'data/manifests';

/**
 * Manifest file naming pattern:
 * manifest_<type>_<scene>_<shot>_<timestamp>.json
 * 
 * Examples:
 * - manifest_keyframe_scene-001__2025-12-05T12-30-00.json
 * - manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json
 * - manifest_batch__2025-12-05T12-30-00.json
 */

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the current file's directory (ESM-compatible).
 */
function getCurrentDir(): string {
    try {
        // ESM: use import.meta.url
        const __filename = fileURLToPath(import.meta.url);
        return path.dirname(__filename);
    } catch {
        // Fallback: use process.cwd()
        return process.cwd();
    }
}

/**
 * Get the project root directory.
 * Walks up from current file location to find package.json.
 */
export function getProjectRoot(): string {
    let dir = getCurrentDir();
    
    // Walk up to find package.json
    for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    
    // Fallback to current working directory
    return process.cwd();
}

/**
 * Get the manifests directory path.
 * Creates the directory if it doesn't exist.
 * 
 * @param projectRoot Optional project root override
 * @returns Absolute path to manifests directory
 */
export function getManifestsDir(projectRoot?: string): string {
    const root = projectRoot || getProjectRoot();
    const manifestsDir = path.join(root, DEFAULT_MANIFESTS_DIR);
    
    if (!fs.existsSync(manifestsDir)) {
        fs.mkdirSync(manifestsDir, { recursive: true });
    }
    
    return manifestsDir;
}

/**
 * Generate the full path for a manifest file.
 * 
 * @param manifest The manifest to generate path for
 * @param projectRoot Optional project root override
 * @returns Absolute path to manifest file
 */
export function getManifestPath(manifest: GenerationManifest, projectRoot?: string): string {
    const manifestsDir = getManifestsDir(projectRoot);
    const filename = getManifestFilename(manifest);
    return path.join(manifestsDir, filename);
}

// ============================================================================
// Write Functions
// ============================================================================

/**
 * Result from writing a manifest to disk.
 */
export interface WriteManifestResult {
    /** Whether the write succeeded */
    success: boolean;
    /** Absolute path to the written manifest file */
    path?: string;
    /** Filename of the manifest (without directory) */
    filename?: string;
    /** Error message if write failed */
    error?: string;
}

/**
 * Write a generation manifest to disk (async).
 * 
 * @param manifest The manifest to write
 * @param options Optional configuration
 * @returns Promise with write result
 */
export async function writeManifest(
    manifest: GenerationManifest,
    options?: {
        /** Override the output directory */
        outputDir?: string;
        /** Override the filename */
        filename?: string;
        /** Project root for resolving default paths */
        projectRoot?: string;
    }
): Promise<WriteManifestResult> {
    try {
        const outputDir = options?.outputDir || getManifestsDir(options?.projectRoot);
        const filename = options?.filename || getManifestFilename(manifest);
        const filePath = path.join(outputDir, filename);
        
        // Ensure directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Serialize and write
        const json = serializeManifest(manifest);
        await fs.promises.writeFile(filePath, json, 'utf-8');
        
        console.log(`[ManifestWriter] Wrote manifest to: ${filePath}`);
        
        return {
            success: true,
            path: filePath,
            filename,
        };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[ManifestWriter] Failed to write manifest: ${error}`);
        return {
            success: false,
            error,
        };
    }
}

/**
 * Write a generation manifest to disk (sync).
 * 
 * @param manifest The manifest to write
 * @param options Optional configuration
 * @returns Write result
 */
export function writeManifestSync(
    manifest: GenerationManifest,
    options?: {
        /** Override the output directory */
        outputDir?: string;
        /** Override the filename */
        filename?: string;
        /** Project root for resolving default paths */
        projectRoot?: string;
    }
): WriteManifestResult {
    try {
        const outputDir = options?.outputDir || getManifestsDir(options?.projectRoot);
        const filename = options?.filename || getManifestFilename(manifest);
        const filePath = path.join(outputDir, filename);
        
        // Ensure directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Serialize and write
        const json = serializeManifest(manifest);
        fs.writeFileSync(filePath, json, 'utf-8');
        
        console.log(`[ManifestWriter] Wrote manifest to: ${filePath}`);
        
        return {
            success: true,
            path: filePath,
            filename,
        };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[ManifestWriter] Failed to write manifest: ${error}`);
        return {
            success: false,
            error,
        };
    }
}

// ============================================================================
// Read Functions (for completeness)
// ============================================================================

/**
 * Read a manifest from disk.
 * 
 * @param filePath Path to the manifest file
 * @returns The parsed manifest or null if invalid
 */
export function readManifest(filePath: string): GenerationManifest | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        
        // Validate it's a manifest
        if (parsed.manifestVersion === '1.0.0' && parsed.manifestId) {
            return parsed as GenerationManifest;
        }
        
        console.warn(`[ManifestWriter] File is not a valid manifest: ${filePath}`);
        return null;
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[ManifestWriter] Failed to read manifest: ${error}`);
        return null;
    }
}

/**
 * List all manifests in the manifests directory.
 * 
 * @param options Optional configuration
 * @returns Array of manifest file paths
 */
export function listManifests(options?: {
    /** Project root for resolving default paths */
    projectRoot?: string;
    /** Filter by generation type */
    type?: GenerationManifest['generationType'];
    /** Filter by scene ID */
    sceneId?: string;
}): string[] {
    const manifestsDir = getManifestsDir(options?.projectRoot);
    
    if (!fs.existsSync(manifestsDir)) {
        return [];
    }
    
    let files = fs.readdirSync(manifestsDir)
        .filter(f => f.endsWith('.json') && f.startsWith('manifest_'))
        .map(f => path.join(manifestsDir, f));
    
    // Apply filters by parsing filename patterns
    if (options?.type) {
        files = files.filter(f => path.basename(f).includes(`_${options.type}_`));
    }
    
    if (options?.sceneId) {
        files = files.filter(f => path.basename(f).includes(`_${options.sceneId}_`));
    }
    
    return files.sort();
}

// ============================================================================
// Exports
// ============================================================================

export default {
    getProjectRoot,
    getManifestsDir,
    getManifestPath,
    writeManifest,
    writeManifestSync,
    readManifest,
    listManifests,
    DEFAULT_MANIFESTS_DIR,
};
