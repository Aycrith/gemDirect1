/**
 * Narrative Script Service
 * 
 * Provides discovery and loading of narrative scripts from the config/narrative directory.
 * Used by the Narrative Dashboard to display available scripts and load their contents.
 * 
 * Part of F2 - Narrative UI Integration
 * 
 * @module services/narrativeScriptService
 */

import type { NarrativeScript } from '../types/narrativeScript';
import { isNarrativeScript } from '../types/narrativeScript';

// ============================================================================
// Types
// ============================================================================

/**
 * Basic info about a narrative script (for listing).
 */
export interface NarrativeScriptInfo {
    /** Unique script identifier */
    id: string;
    /** Human-readable title */
    title?: string;
    /** Description of the narrative */
    description?: string;
    /** Path to the script file */
    path: string;
    /** Number of shots in the script */
    shotCount: number;
    /** List of shot IDs (for per-shot status tracking) */
    shotIds?: string[];
    /** Script version */
    version?: string;
    /** Creation timestamp (if available) */
    createdAt?: string;
    /** Author (if available) */
    author?: string;
    /** Tags for categorization */
    tags?: string[];
}

/**
 * Result of loading a narrative script
 */
export interface NarrativeScriptLoadResult {
    success: boolean;
    script?: NarrativeScript;
    error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Base path for narrative scripts (relative to public folder for browser access) */
const NARRATIVE_SCRIPTS_PATH = '/config/narrative';

/** 
 * Known narrative script files (fallback if directory listing isn't available)
 * Add new scripts here to make them discoverable in the UI.
 * 
 * Scripts should be placed in:
 * - public/config/narrative/ (for browser access)
 * - config/narrative/ (for Node.js access)
 */
const KNOWN_NARRATIVE_SCRIPTS = [
    'demo-three-shot.json',
    // Add additional scripts here as they're created:
    // 'my-custom-narrative.json',
    // 'cinematic-showcase.json',
];

// ============================================================================
// Script Discovery (Browser-Compatible)
// ============================================================================

/**
 * List available narrative scripts.
 * 
 * In the browser environment, we fetch script files from known paths
 * since we can't do directory listing. The scripts are served from
 * the public folder.
 * 
 * @returns Promise resolving to array of script info
 */
export async function listNarrativeScripts(): Promise<NarrativeScriptInfo[]> {
    const scripts: NarrativeScriptInfo[] = [];
    
    for (const filename of KNOWN_NARRATIVE_SCRIPTS) {
        const scriptPath = `${NARRATIVE_SCRIPTS_PATH}/${filename}`;
        
        try {
            const response = await fetch(scriptPath);
            if (!response.ok) {
                console.warn(`[NarrativeScriptService] Failed to fetch ${scriptPath}: ${response.status}`);
                continue;
            }
            
            const data = await response.json();
            
            if (!isNarrativeScript(data)) {
                console.warn(`[NarrativeScriptService] Invalid script format: ${scriptPath}`);
                continue;
            }
            
            scripts.push({
                id: data.id,
                title: data.title,
                description: data.description,
                path: scriptPath,
                shotCount: data.shots.length,
                shotIds: data.shots.map((s: { id: string }) => s.id),
                version: data.version,
                createdAt: data.metadata?.createdAt,
                author: data.metadata?.author,
                tags: data.metadata?.tags,
            });
        } catch (error) {
            console.warn(`[NarrativeScriptService] Error loading ${scriptPath}:`, error);
        }
    }
    
    return scripts;
}

/**
 * Load a complete narrative script from a path.
 * 
 * @param scriptPath Path to the script file (relative to public folder)
 * @returns Promise resolving to load result with script or error
 */
export async function loadNarrativeScript(scriptPath: string): Promise<NarrativeScriptLoadResult> {
    try {
        const response = await fetch(scriptPath);
        
        if (!response.ok) {
            return {
                success: false,
                error: `Failed to fetch script: ${response.status} ${response.statusText}`,
            };
        }
        
        const data = await response.json();
        
        if (!isNarrativeScript(data)) {
            return {
                success: false,
                error: 'Invalid narrative script format',
            };
        }
        
        return {
            success: true,
            script: data,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error loading script',
        };
    }
}

/**
 * Get script info without loading full content.
 * Lighter weight version for displaying in lists.
 * 
 * @param scriptId Script ID to look up
 * @returns Promise resolving to script info or null
 */
export async function getScriptInfo(scriptId: string): Promise<NarrativeScriptInfo | null> {
    const scripts = await listNarrativeScripts();
    return scripts.find(s => s.id === scriptId) || null;
}

// ============================================================================
// Node.js Compatible Functions (for pipeline use)
// ============================================================================

/**
 * List narrative scripts using Node.js filesystem APIs.
 * Use this in Node.js contexts (pipelines, scripts) instead of the browser version.
 * 
 * @param projectRoot Project root directory
 * @returns Promise resolving to array of script info
 */
export async function listNarrativeScriptsNode(projectRoot: string): Promise<NarrativeScriptInfo[]> {
    // Dynamic import for Node.js modules
    const fs = await import('fs');
    const path = await import('path');
    
    const narrativeDir = path.join(projectRoot, 'config', 'narrative');
    const scripts: NarrativeScriptInfo[] = [];
    
    if (!fs.existsSync(narrativeDir)) {
        console.warn(`[NarrativeScriptService] Narrative directory not found: ${narrativeDir}`);
        return scripts;
    }
    
    const files = fs.readdirSync(narrativeDir).filter(f => f.endsWith('.json'));
    
    for (const filename of files) {
        const filePath = path.join(narrativeDir, filename);
        
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            
            if (!isNarrativeScript(data)) {
                console.warn(`[NarrativeScriptService] Invalid script format: ${filePath}`);
                continue;
            }
            
            scripts.push({
                id: data.id,
                title: data.title,
                description: data.description,
                path: filePath,
                shotCount: data.shots.length,
                shotIds: data.shots.map((s: { id: string }) => s.id),
                version: data.version,
                createdAt: data.metadata?.createdAt,
                author: data.metadata?.author,
                tags: data.metadata?.tags,
            });
        } catch (error) {
            console.warn(`[NarrativeScriptService] Error loading ${filePath}:`, error);
        }
    }
    
    return scripts;
}

/**
 * Load a narrative script using Node.js filesystem APIs.
 * Use this in Node.js contexts (pipelines, scripts) instead of the browser version.
 * 
 * @param scriptPath Absolute path to the script file
 * @returns Promise resolving to load result with script or error
 */
export async function loadNarrativeScriptNode(scriptPath: string): Promise<NarrativeScriptLoadResult> {
    const fs = await import('fs');
    
    try {
        if (!fs.existsSync(scriptPath)) {
            return {
                success: false,
                error: `Script file not found: ${scriptPath}`,
            };
        }
        
        const content = fs.readFileSync(scriptPath, 'utf-8');
        const data = JSON.parse(content);
        
        if (!isNarrativeScript(data)) {
            return {
                success: false,
                error: 'Invalid narrative script format',
            };
        }
        
        return {
            success: true,
            script: data,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error loading script',
        };
    }
}
