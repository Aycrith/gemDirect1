/**
 * Preview Scene Service - Phase 9
 * 
 * Provides a canned demo scene for the Production Quality Preview feature.
 * This is a minimal timeline for testing the production pipeline configuration
 * without requiring a full project setup.
 * 
 * @module services/previewSceneService
 */

import type { TimelineData, Shot } from '../types';

/**
 * Demo scene configuration
 */
export interface PreviewSceneConfig {
    /** Whether to use the simple 1-shot scene or the 2-shot transition scene */
    variant: 'simple' | 'transition';
}

/**
 * Creates a minimal 1-shot demo scene for quick pipeline testing.
 * 
 * This scene tests:
 * - Basic video generation
 * - Keyframe interpolation
 * - Temporal coherence (deflicker)
 */
export function createSimplePreviewScene(): TimelineData {
    const shot: Shot = {
        id: 'preview-shot-001',
        title: 'Sunset Lake',
        description: 'A warm sunset glow illuminates a peaceful lakeside scene. Gentle ripples spread across the water as a lone heron takes flight, its silhouette gliding gracefully against the orange sky.',
    };

    return {
        shots: [shot],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: 'blurry, low quality, artifacts, flickering, unstable, jittery',
    };
}

/**
 * Creates a 2-shot demo scene with transition for more comprehensive testing.
 * 
 * This scene tests:
 * - Multi-shot generation
 * - Shot-to-shot transitions
 * - Prompt scheduling (if enabled)
 * - Character/object consistency across shots
 */
export function createTransitionPreviewScene(): TimelineData {
    const shot1: Shot = {
        id: 'preview-shot-001',
        title: 'Kitchen Wide',
        description: 'Inside a cozy cottage kitchen, morning light streams through the window. An elderly woman with silver-gray hair and a blue apron stands at the wooden counter, rolling fresh dough for bread.',
    };

    const shot2: Shot = {
        id: 'preview-shot-002',
        title: 'Kitchen Close-up',
        description: 'The same elderly woman turns to face the camera, a gentle smile on her face. Her flour-dusted hands rest on the counter. The morning light catches the flour particles floating in the air.',
    };

    return {
        shots: [shot1, shot2],
        shotEnhancers: {
            'preview-shot-001': {
                framing: ['medium shot'],
                movement: ['slow push in'],
                lighting: ['natural window light'],
                mood: ['comforting', 'nostalgic'],
            },
            'preview-shot-002': {
                framing: ['close-up'],
                movement: ['static'],
                lighting: ['natural window light with rim'],
                mood: ['warm', 'loving'],
            },
        },
        transitions: ['dissolve'],
        negativePrompt: 'blurry, low quality, artifacts, flickering, unstable, jittery, different person, wrong character',
    };
}

/**
 * Gets a preview scene based on configuration.
 * 
 * @param config Configuration options (default: simple variant)
 * @returns TimelineData for the preview scene
 */
export function getPreviewScene(config: PreviewSceneConfig = { variant: 'simple' }): TimelineData {
    return config.variant === 'transition' 
        ? createTransitionPreviewScene()
        : createSimplePreviewScene();
}

/**
 * Gets the preview scene description for UI display.
 */
export function getPreviewSceneDescription(variant: 'simple' | 'transition' = 'simple'): string {
    return variant === 'simple'
        ? 'Sunset Lake - A peaceful lakeside scene with gentle motion (1 shot, ~3s)'
        : 'Kitchen Scene - Elderly woman baking with camera transition (2 shots, ~5s)';
}

/**
 * Preview scene metadata for validation
 */
export const PREVIEW_SCENE_INFO = {
    simple: {
        name: 'Sunset Lake',
        shots: 1,
        duration: 3.0,
        tests: ['basic generation', 'keyframe interpolation', 'deflicker'],
    },
    transition: {
        name: 'Kitchen Scene',
        shots: 2,
        duration: 5.5,
        tests: ['multi-shot generation', 'transitions', 'character consistency', 'prompt scheduling'],
    },
};
