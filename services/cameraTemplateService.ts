/**
 * Camera Template Service
 * 
 * Provides access to pre-defined camera motion templates (Camera-as-Code).
 * Templates define reusable camera movements like pans, dollies, orbits, etc.
 * 
 * Part of H2 - Camera Motion Templates & Profiles
 * 
 * @module services/cameraTemplateService
 */

import type { CameraPath } from '../types/cameraPath';

// ============================================================================
// Types
// ============================================================================

/**
 * Camera template info for display in UI
 */
export interface CameraTemplateInfo {
    /** Template ID (matches CameraPath.id) */
    id: string;
    
    /** Human-readable name */
    name: string;
    
    /** Template description */
    description?: string;
    
    /** Motion type (pan, dolly, orbit, static, etc.) */
    motionType?: string;
    
    /** Motion intensity (0-1) */
    motionIntensity?: number;
    
    /** Tags for categorization */
    tags?: string[];
    
    /** Full CameraPath object */
    path: CameraPath;
}

/**
 * Template index structure
 */
interface TemplateIndex {
    version: string;
    templates: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Base paths for template files
 */
const TEMPLATES_BASE_PATH = '/config/camera-templates';
const NODE_TEMPLATES_PATH = 'config/camera-templates';

/**
 * Known template IDs (fallback if index is not available)
 */
const KNOWN_TEMPLATE_IDS = [
    'static-center',
    'slow-pan-left-to-right',
    'slow-dolly-in',
    'orbit-around-center',
    'gentle-float-down',
];

// ============================================================================
// Internal State
// ============================================================================

/** Cache of loaded templates */
const templateCache: Map<string, CameraTemplateInfo> = new Map();

/** Whether templates have been loaded */
let templatesLoaded = false;

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
 * Convert template ID to human-readable name
 */
function idToName(id: string): string {
    return id
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Convert CameraPath to CameraTemplateInfo
 */
function pathToTemplateInfo(path: CameraPath): CameraTemplateInfo {
    return {
        id: path.id,
        name: idToName(path.id),
        description: path.description,
        motionType: path.motionType,
        motionIntensity: path.motionIntensity,
        tags: path.metadata?.tags,
        path,
    };
}

/**
 * Load a single template file
 */
async function loadTemplateFile(id: string): Promise<CameraPath | null> {
    if (isNodeContext()) {
        try {
            const fs = await import('fs');
            const pathModule = await import('path');
            
            const filePath = pathModule.resolve(process.cwd(), NODE_TEMPLATES_PATH, `${id}.json`);
            
            if (!fs.existsSync(filePath)) {
                return null;
            }
            
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content) as CameraPath;
        } catch (err) {
            console.warn(`[CameraTemplates] Failed to load template ${id}:`, err);
            return null;
        }
    } else {
        try {
            const response = await fetch(`${TEMPLATES_BASE_PATH}/${id}.json`);
            if (!response.ok) {
                return null;
            }
            return await response.json() as CameraPath;
        } catch (err) {
            console.warn(`[CameraTemplates] Failed to load template ${id}:`, err);
            return null;
        }
    }
}

/**
 * Load all templates into cache
 */
async function loadAllTemplates(): Promise<void> {
    if (templatesLoaded) return;
    
    const idsToLoad = [...KNOWN_TEMPLATE_IDS];
    
    // Try to load index for additional templates
    if (!isNodeContext()) {
        try {
            const indexResponse = await fetch(`${TEMPLATES_BASE_PATH}/index.json`);
            if (indexResponse.ok) {
                const index = await indexResponse.json() as TemplateIndex;
                for (const id of index.templates) {
                    if (!idsToLoad.includes(id)) {
                        idsToLoad.push(id);
                    }
                }
            }
        } catch {
            // Index not available, use known IDs
        }
    }
    
    // Load all templates in parallel
    const loadPromises = idsToLoad.map(async (id) => {
        const path = await loadTemplateFile(id);
        if (path) {
            templateCache.set(id, pathToTemplateInfo(path));
        }
    });
    
    await Promise.all(loadPromises);
    templatesLoaded = true;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * List all available camera templates
 * 
 * @returns Array of template info objects
 */
export async function listCameraTemplates(): Promise<CameraTemplateInfo[]> {
    await loadAllTemplates();
    return Array.from(templateCache.values());
}

/**
 * Get a specific camera template by ID
 * 
 * @param id Template ID
 * @returns Template info or undefined if not found
 */
export async function getCameraTemplate(id: string): Promise<CameraTemplateInfo | undefined> {
    // Check cache first
    if (templateCache.has(id)) {
        return templateCache.get(id);
    }
    
    // Try loading if not cached
    const path = await loadTemplateFile(id);
    if (path) {
        const info = pathToTemplateInfo(path);
        templateCache.set(id, info);
        return info;
    }
    
    return undefined;
}

/**
 * Get camera templates by motion type
 * 
 * @param motionType Motion type to filter by (pan, dolly, orbit, static, etc.)
 * @returns Array of matching template info objects
 */
export async function getCameraTemplatesByMotionType(motionType: string): Promise<CameraTemplateInfo[]> {
    await loadAllTemplates();
    return Array.from(templateCache.values()).filter(
        t => t.motionType?.toLowerCase() === motionType.toLowerCase()
    );
}

/**
 * Get camera templates by tag
 * 
 * @param tag Tag to filter by
 * @returns Array of matching template info objects
 */
export async function getCameraTemplatesByTag(tag: string): Promise<CameraTemplateInfo[]> {
    await loadAllTemplates();
    const tagLower = tag.toLowerCase();
    return Array.from(templateCache.values()).filter(
        t => t.tags?.some(t => t.toLowerCase() === tagLower)
    );
}

/**
 * Get camera template options for UI dropdown
 * 
 * @returns Array of {id, name} pairs suitable for dropdown options
 */
export async function getCameraTemplateOptions(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const templates = await listCameraTemplates();
    return templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
    }));
}

/**
 * Check if a camera template exists
 * 
 * @param id Template ID
 * @returns True if template exists
 */
export async function cameraTemplateExists(id: string): Promise<boolean> {
    const template = await getCameraTemplate(id);
    return template !== undefined;
}

/**
 * Clear the template cache (useful for testing)
 */
export function clearCameraTemplateCache(): void {
    templateCache.clear();
    templatesLoaded = false;
}

/**
 * Get suggested camera template for a given shot/scene context
 * 
 * This is a simple heuristic-based suggestion. Can be enhanced with
 * more sophisticated logic or ML in the future.
 * 
 * @param context Context hints like shot type, mood, etc.
 * @returns Suggested template ID or undefined if no clear match
 */
export async function suggestCameraTemplate(context: {
    shotType?: string;
    mood?: string;
    isEstablishing?: boolean;
    isDialogue?: boolean;
    isAction?: boolean;
}): Promise<string | undefined> {
    // Simple heuristics for template suggestion
    if (context.isDialogue) {
        return 'static-center';
    }
    
    if (context.isEstablishing) {
        return 'slow-pan-left-to-right';
    }
    
    if (context.isAction) {
        return 'orbit-around-center';
    }
    
    if (context.mood === 'intimate' || context.mood === 'dramatic') {
        return 'slow-dolly-in';
    }
    
    if (context.mood === 'dreamy' || context.mood === 'ethereal') {
        return 'gentle-float-down';
    }
    
    // Default: subtle pan for general scenes
    return 'slow-pan-left-to-right';
}

// ============================================================================
// Export
// ============================================================================

export default {
    listCameraTemplates,
    getCameraTemplate,
    getCameraTemplatesByMotionType,
    getCameraTemplatesByTag,
    getCameraTemplateOptions,
    cameraTemplateExists,
    clearCameraTemplateCache,
    suggestCameraTemplate,
};
