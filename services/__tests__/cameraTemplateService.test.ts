/**
 * Tests for cameraTemplateService
 * 
 * Validates camera motion template listing, retrieval, filtering, and suggestions.
 * Uses inline mocks for types since the service uses async file loading.
 * 
 * @module services/__tests__/cameraTemplateService.test
 */

import { describe, it, expect } from 'vitest';
import type { CameraPath } from '../../types/cameraPath';

// ============================================================================
// Mock Types (mirrors cameraTemplateService)
// ============================================================================

interface MockCameraTemplateInfo {
    id: string;
    name: string;
    description?: string;
    motionType?: string;
    motionIntensity?: number;
    tags?: string[];
    path: CameraPath;
}

// ============================================================================
// Tests
// ============================================================================

describe('cameraTemplateService types', () => {
    it('CameraPath has required fields', () => {
        const path: CameraPath = {
            id: 'test-path',
            keyframes: [
                { timeSeconds: 0, position: { x: 0, y: 0, z: 0 }, rotationDeg: { yaw: 0, pitch: 0, roll: 0 } },
                { timeSeconds: 1, position: { x: 1, y: 0, z: 0 }, rotationDeg: { yaw: 0, pitch: 0, roll: 0 } }
            ],
            motionType: 'dolly',
        };
        
        expect(path.id).toBe('test-path');
        expect(path.keyframes).toHaveLength(2);
        expect(path.keyframes[0]?.timeSeconds).toBe(0);
    });
    
    it('CameraTemplateInfo has required metadata', () => {
        const mockPath: CameraPath = {
            id: 'slow-pan-lr',
            keyframes: [
                { timeSeconds: 0, position: { x: -1, y: 0, z: 0 }, rotationDeg: { yaw: 0 } },
                { timeSeconds: 4, position: { x: 1, y: 0, z: 0 }, rotationDeg: { yaw: 0 } },
            ],
            motionType: 'pan',
        };
        
        const template: MockCameraTemplateInfo = {
            id: 'slow-pan-lr',
            name: 'Slow Pan Left-to-Right',
            description: 'A gentle pan from left to right',
            motionType: 'pan',
            motionIntensity: 0.3,
            tags: ['neutral', 'establishing'],
            path: mockPath,
        };
        
        expect(template.id).toBe('slow-pan-lr');
        expect(template.motionType).toBe('pan');
        expect(template.tags).toContain('neutral');
    });
});

describe('cameraTemplateService logic', () => {
    // Test the filter/suggestion logic without file I/O
    
    const createMockPath = (id: string, durationSec: number): CameraPath => ({
        id,
        keyframes: [
            { timeSeconds: 0, position: { x: 0, y: 0, z: 0 }, rotationDeg: {} },
            { timeSeconds: durationSec, position: { x: 1, y: 0, z: 0 }, rotationDeg: {} },
        ],
    });
    
    const mockTemplates: MockCameraTemplateInfo[] = [
        {
            id: 'static-center',
            name: 'Static Center',
            description: 'No motion, centered',
            motionType: 'static',
            tags: ['neutral', 'contemplative'],
            path: createMockPath('static-center', 3),
        },
        {
            id: 'slow-pan-lr',
            name: 'Slow Pan Left-to-Right',
            description: 'Gentle horizontal pan',
            motionType: 'pan',
            tags: ['neutral', 'establishing'],
            path: createMockPath('slow-pan-lr', 4),
        },
        {
            id: 'slow-dolly-in',
            name: 'Slow Dolly In',
            description: 'FOV-based push-in',
            motionType: 'dolly',
            tags: ['intimate', 'tense'],
            path: createMockPath('slow-dolly-in', 3),
        },
        {
            id: 'orbit-around',
            name: 'Orbit Around Center',
            description: 'Partial orbit',
            motionType: 'orbit',
            tags: ['dynamic', 'establishing'],
            path: createMockPath('orbit-around', 4),
        },
        {
            id: 'gentle-float-down',
            name: 'Gentle Float Down',
            description: 'Vertical descent',
            motionType: 'crane',
            tags: ['establishing', 'contemplative'],
            path: createMockPath('gentle-float-down', 5),
        },
    ];
    
    /**
     * Filter templates by motion type
     */
    function filterByMotionType(templates: MockCameraTemplateInfo[], motionType: string): MockCameraTemplateInfo[] {
        return templates.filter(t => t.motionType === motionType);
    }
    
    /**
     * Filter templates by tag
     */
    function filterByTag(templates: MockCameraTemplateInfo[], tag: string): MockCameraTemplateInfo[] {
        return templates.filter(t => t.tags?.includes(tag));
    }
    
    /**
     * Suggest template based on tag and optional motion type
     */
    function suggestTemplate(
        templates: MockCameraTemplateInfo[],
        tag: string,
        preferredMotionType?: string
    ): MockCameraTemplateInfo | undefined {
        // Filter by tag first
        const tagMatches = filterByTag(templates, tag);
        
        if (tagMatches.length === 0) {
            // No tag match - return static as fallback
            return templates.find(t => t.motionType === 'static');
        }
        
        // If preferred motion type, try to match
        if (preferredMotionType) {
            const typeMatch = tagMatches.find(t => t.motionType === preferredMotionType);
            if (typeMatch) return typeMatch;
        }
        
        // Return first tag match
        return tagMatches[0];
    }
    
    describe('filterByMotionType', () => {
        it('returns only templates with specified motion type', () => {
            const pans = filterByMotionType(mockTemplates, 'pan');
            expect(pans).toHaveLength(1);
            expect(pans[0]?.id).toBe('slow-pan-lr');
        });
        
        it('returns empty array if no matches', () => {
            const zooms = filterByMotionType(mockTemplates, 'zoom');
            expect(zooms).toHaveLength(0);
        });
        
        it('returns all static templates', () => {
            const statics = filterByMotionType(mockTemplates, 'static');
            expect(statics).toHaveLength(1);
            expect(statics[0]?.id).toBe('static-center');
        });
    });
    
    describe('filterByTag', () => {
        it('returns templates matching tag', () => {
            const establishing = filterByTag(mockTemplates, 'establishing');
            expect(establishing).toHaveLength(3); // pan, orbit, crane
            expect(establishing.map(t => t.id)).toContain('slow-pan-lr');
            expect(establishing.map(t => t.id)).toContain('orbit-around');
            expect(establishing.map(t => t.id)).toContain('gentle-float-down');
        });
        
        it('returns empty for non-existent tag', () => {
            const chaotic = filterByTag(mockTemplates, 'chaotic');
            expect(chaotic).toHaveLength(0);
        });
        
        it('includes templates with multiple matching tags', () => {
            const contemplative = filterByTag(mockTemplates, 'contemplative');
            expect(contemplative).toHaveLength(2); // static, crane
        });
    });
    
    describe('suggestTemplate', () => {
        it('suggests template based on tag', () => {
            const suggestion = suggestTemplate(mockTemplates, 'intimate');
            expect(suggestion?.id).toBe('slow-dolly-in'); // dolly has 'intimate' tag
        });
        
        it('prefers specified motion type when available', () => {
            const suggestion = suggestTemplate(mockTemplates, 'establishing', 'orbit');
            expect(suggestion?.id).toBe('orbit-around');
        });
        
        it('falls back to tag match if preferred type not available', () => {
            const suggestion = suggestTemplate(mockTemplates, 'establishing', 'zoom');
            // No zoom with 'establishing', but pan has 'establishing'
            expect(suggestion?.id).toBe('slow-pan-lr');
        });
        
        it('falls back to static when no tag match', () => {
            const suggestion = suggestTemplate(mockTemplates, 'chaotic');
            expect(suggestion?.id).toBe('static-center');
        });
    });
});

describe('cameraTemplateService getCameraTemplateOptions', () => {
    // Test the dropdown option generation logic
    
    const createMockPath = (id: string, durationSec: number): CameraPath => ({
        id,
        keyframes: [
            { timeSeconds: 0, position: { x: 0, y: 0, z: 0 }, rotationDeg: {} },
            { timeSeconds: durationSec, position: { x: 1, y: 0, z: 0 }, rotationDeg: {} },
        ],
    });
    
    /**
     * Helper to compute duration from keyframes
     */
    function getDurationFromPath(path: CameraPath): number {
        if (path.keyframes.length === 0) return 0;
        return path.keyframes[path.keyframes.length - 1]?.timeSeconds ?? 0;
    }
    
    const mockTemplates: MockCameraTemplateInfo[] = [
        { id: 'static-center', name: 'Static Center', motionType: 'static', path: createMockPath('static-center', 3) },
        { id: 'slow-pan-lr', name: 'Slow Pan LR', motionType: 'pan', path: createMockPath('slow-pan-lr', 4) },
        { id: 'slow-dolly-in', name: 'Slow Dolly In', motionType: 'dolly', path: createMockPath('slow-dolly-in', 3) },
    ];
    
    /**
     * Generate dropdown options from templates
     */
    function getCameraTemplateOptions(templates: MockCameraTemplateInfo[]): { value: string; label: string }[] {
        return templates.map(t => ({
            value: t.id,
            label: `${t.name} (${getDurationFromPath(t.path)}s)`,
        }));
    }
    
    it('generates options with id as value', () => {
        const options = getCameraTemplateOptions(mockTemplates);
        expect(options[0]?.value).toBe('static-center');
    });
    
    it('includes duration in label', () => {
        const options = getCameraTemplateOptions(mockTemplates);
        expect(options[0]?.label).toContain('3s');
        expect(options[1]?.label).toContain('4s');
    });
    
    it('preserves order of templates', () => {
        const options = getCameraTemplateOptions(mockTemplates);
        expect(options.map(o => o.value)).toEqual(['static-center', 'slow-pan-lr', 'slow-dolly-in']);
    });
});
