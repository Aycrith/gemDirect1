/**
 * Advanced Workflow Profiles Unit Tests
 * 
 * Tests for CCC and Upscaler workflow profile templates including:
 * - Profile creation
 * - Category detection
 * - Filename pattern matching
 * 
 * @module utils/__tests__/advancedWorkflowProfiles.test
 */

import { describe, it, expect } from 'vitest';
import {
    CCC_PROFILE_TEMPLATE,
    UPSCALER_PROFILE_TEMPLATE,
    createCCCProfile,
    createUpscalerProfile,
    detectWorkflowCategory,
    autoConfigureWorkflowProfile,
    matchWorkflowFilename,
    KNOWN_WORKFLOW_PATTERNS,
    CCCWorkflowConfig,
    UpscalerWorkflowConfig,
} from '../advancedWorkflowProfiles';

describe('advancedWorkflowProfiles', () => {
    describe('CCC_PROFILE_TEMPLATE', () => {
        it('should have character category', () => {
            expect(CCC_PROFILE_TEMPLATE.category).toBe('character');
        });

        it('should have metadata defined', () => {
            expect(CCC_PROFILE_TEMPLATE.metadata).toBeDefined();
            expect(CCC_PROFILE_TEMPLATE.metadata?.missingMappings).toBeDefined();
            expect(CCC_PROFILE_TEMPLATE.metadata?.warnings).toBeDefined();
        });

        it('should have displayName defined', () => {
            // Cast to any to access extended properties
            const template = CCC_PROFILE_TEMPLATE as any;
            expect(template.displayName).toBeDefined();
        });
    });

    describe('UPSCALER_PROFILE_TEMPLATE', () => {
        it('should have upscaler category', () => {
            expect(UPSCALER_PROFILE_TEMPLATE.category).toBe('upscaler');
        });

        it('should have metadata defined', () => {
            expect(UPSCALER_PROFILE_TEMPLATE.metadata).toBeDefined();
            expect(UPSCALER_PROFILE_TEMPLATE.metadata?.missingMappings).toBeDefined();
        });
    });

    describe('createCCCProfile', () => {
        const baseConfig: CCCWorkflowConfig = {
            profileId: 'test-ccc',
            sourcePath: '/path/to/workflow.json',
            displayName: 'Test CCC Profile',
            referenceImageNodeIds: ['10', '11'],
            positiveClipNodeId: '6',
            negativeClipNodeId: '7',
        };
        const workflowJson = '{"nodes": []}';

        it('should create profile with correct structure', () => {
            const profile = createCCCProfile(baseConfig, workflowJson) as any;
            
            expect(profile.sourcePath).toBe('/path/to/workflow.json');
            expect(profile.workflowJson).toBe(workflowJson);
        });

        it('should map reference images correctly', () => {
            const profile = createCCCProfile(baseConfig, workflowJson);
            
            expect(profile.mapping['10:image']).toBe('keyframe_image');
            expect(profile.mapping['11:image']).toBe('keyframe_image');
        });

        it('should map positive and negative prompts', () => {
            const profile = createCCCProfile(baseConfig, workflowJson);
            
            expect(profile.mapping['6:text']).toBe('human_readable_prompt');
            expect(profile.mapping['7:text']).toBe('negative_prompt');
        });

        it('should have character category', () => {
            const profile = createCCCProfile(baseConfig, workflowJson);
            expect(profile.category).toBe('character');
        });

        it('should have empty missingMappings when complete', () => {
            const profile = createCCCProfile(baseConfig, workflowJson);
            expect(profile.metadata?.missingMappings).toEqual([]);
        });

        it('should populate highlightMappings', () => {
            const profile = createCCCProfile(baseConfig, workflowJson);
            
            expect(profile.metadata?.highlightMappings?.length).toBeGreaterThan(0);
            const refMapping = profile.metadata?.highlightMappings?.find(
                m => m.nodeId === '10'
            );
            expect(refMapping?.type).toBe('keyframe_image');
        });
    });

    describe('createUpscalerProfile', () => {
        const baseConfig: UpscalerWorkflowConfig = {
            profileId: 'test-upscaler',
            sourcePath: '/path/to/upscaler.json',
            displayName: 'Test Upscaler',
            videoLoadNodeId: '5',
            upscaleFactor: 2,
            clipNodeId: '8',
        };
        const workflowJson = '{"nodes": []}';

        it('should create profile with correct structure', () => {
            const profile = createUpscalerProfile(baseConfig, workflowJson) as any;
            
            expect(profile.sourcePath).toBe('/path/to/upscaler.json');
        });

        it('should map video input', () => {
            const profile = createUpscalerProfile(baseConfig, workflowJson);
            expect(profile.mapping['5:file']).toBe('input_video');
        });

        it('should map optional CLIP prompt', () => {
            const profile = createUpscalerProfile(baseConfig, workflowJson);
            expect(profile.mapping['8:text']).toBe('human_readable_prompt');
        });

        it('should have upscaler category', () => {
            const profile = createUpscalerProfile(baseConfig, workflowJson);
            expect(profile.category).toBe('upscaler');
        });
    });

    describe('detectWorkflowCategory', () => {
        it('should detect upscaler workflows', () => {
            const workflow = JSON.stringify({
                nodes: [
                    { type: 'VHS_LoadVideo' },
                    { type: 'ImageUpscaleWithModel' },
                ],
            });
            
            expect(detectWorkflowCategory(workflow)).toBe('upscaler');
        });

        it('should detect character (CCC) workflows', () => {
            const workflow = JSON.stringify({
                nodes: [
                    { type: 'LoadImage' },
                    { type: 'VAEEncode' },
                ],
            });
            
            expect(detectWorkflowCategory(workflow)).toBe('character');
        });

        it('should detect scene-builder workflows', () => {
            const workflow = JSON.stringify({
                nodes: [
                    { type: 'CompositeVideo' },
                    { type: 'BlendLayers' },
                ],
            });
            
            expect(detectWorkflowCategory(workflow)).toBe('scene-builder');
        });

        it('should detect video workflows', () => {
            const workflow = JSON.stringify({
                nodes: [
                    { type: 'VHS_LoadVideo' },
                    { type: 'SomeOtherNode' },
                ],
            });
            
            expect(detectWorkflowCategory(workflow)).toBe('video');
        });

        it('should default to keyframe for unknown workflows', () => {
            const workflow = JSON.stringify({
                nodes: [
                    { type: 'CLIPTextEncode' },
                    { type: 'KSampler' },
                ],
            });
            
            expect(detectWorkflowCategory(workflow)).toBe('keyframe');
        });

        it('should return null for invalid JSON', () => {
            expect(detectWorkflowCategory('not valid json')).toBeNull();
        });

        it('should handle prompt-based workflow format', () => {
            const workflow = JSON.stringify({
                prompt: {
                    '1': { type: 'LoadImage' },
                    '2': { type: 'VAEEncode' },
                },
            });
            
            expect(detectWorkflowCategory(workflow)).toBe('character');
        });
    });

    describe('autoConfigureWorkflowProfile', () => {
        const sampleWorkflow = JSON.stringify({
            nodes: [
                { type: 'LoadImage' },
                { type: 'VAEEncode' },
            ],
        });

        it('should auto-configure based on detected category', () => {
            const profile = autoConfigureWorkflowProfile(
                sampleWorkflow,
                '/test/path.json'
            );
            
            expect(profile.category).toBe('character');
            expect(profile.workflowJson).toBe(sampleWorkflow);
            expect(profile.sourcePath).toBe('/test/path.json');
        });

        it('should return empty object for undetectable workflow', () => {
            const profile = autoConfigureWorkflowProfile(
                'invalid json',
                '/test/path.json'
            );
            
            expect(profile).toEqual({});
        });
    });

    describe('matchWorkflowFilename', () => {
        describe('CCC patterns', () => {
            it('should match CCC in filename', () => {
                expect(matchWorkflowFilename('workflow_CCC_v1.json')).toBe('character');
                expect(matchWorkflowFilename('my_ccc_workflow.json')).toBe('character');
            });

            it('should match character_consistency', () => {
                expect(matchWorkflowFilename('character_consistency.json')).toBe('character');
                expect(matchWorkflowFilename('Character-Consistency-v2.json')).toBe('character');
            });
        });

        describe('Upscaler patterns', () => {
            it('should match upscaler keywords', () => {
                expect(matchWorkflowFilename('video_upscaler.json')).toBe('upscaler');
                expect(matchWorkflowFilename('4x_upscale.json')).toBe('upscaler');
            });

            it('should match ESRGAN patterns', () => {
                expect(matchWorkflowFilename('ESRGAN_4x.json')).toBe('upscaler');
                expect(matchWorkflowFilename('RealESRGAN_video.json')).toBe('upscaler');
            });

            it('should match enhance keyword', () => {
                expect(matchWorkflowFilename('video_enhance.json')).toBe('upscaler');
            });
        });

        describe('Scene builder patterns', () => {
            it('should match scene_builder', () => {
                expect(matchWorkflowFilename('scene_builder_v2.json')).toBe('scene-builder');
                expect(matchWorkflowFilename('scene-builder.json')).toBe('scene-builder');
            });

            it('should match compositor', () => {
                expect(matchWorkflowFilename('video_compositor.json')).toBe('scene-builder');
            });
        });

        describe('Video patterns', () => {
            it('should match video keywords', () => {
                expect(matchWorkflowFilename('text_to_video.json')).toBe('video');
                expect(matchWorkflowFilename('wan_i2v.json')).toBe('video');
                expect(matchWorkflowFilename('animate_diff.json')).toBe('video');
            });
        });

        describe('Keyframe patterns', () => {
            it('should match t2i keywords', () => {
                expect(matchWorkflowFilename('flux_t2i.json')).toBe('keyframe');
                expect(matchWorkflowFilename('text_to_image.json')).toBe('keyframe');
            });

            it('should match keyframe keyword', () => {
                expect(matchWorkflowFilename('scene_keyframe.json')).toBe('keyframe');
            });
        });

        it('should return null for unmatched filenames', () => {
            expect(matchWorkflowFilename('random_workflow.json')).toBeNull();
            expect(matchWorkflowFilename('my_custom_nodes.json')).toBeNull();
        });

        it('should be case insensitive', () => {
            expect(matchWorkflowFilename('VIDEO_UPSCALER.JSON')).toBe('upscaler');
            expect(matchWorkflowFilename('CCC_WORKFLOW.json')).toBe('character');
        });
    });

    describe('KNOWN_WORKFLOW_PATTERNS', () => {
        it('should have patterns for each category', () => {
            expect(KNOWN_WORKFLOW_PATTERNS.ccc.length).toBeGreaterThan(0);
            expect(KNOWN_WORKFLOW_PATTERNS.upscaler.length).toBeGreaterThan(0);
            expect(KNOWN_WORKFLOW_PATTERNS.sceneBuilder.length).toBeGreaterThan(0);
        });
    });
});
