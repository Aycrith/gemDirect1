/**
 * Tests for Generation Manifest Service
 * 
 * Tests the manifest building, camera path summary, and completion functionality.
 * 
 * Part of E1 - Camera-as-Code Infrastructure testing
 * 
 * @module services/__tests__/generationManifestService.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { LocalGenerationSettings, WorkflowProfile } from '../../types';
import type { CameraPath } from '../../types/cameraPath';
import { DEFAULT_FEATURE_FLAGS, PRODUCTION_QA_FLAGS } from '../../utils/featureFlags';
import {
    generateManifestId,
    parseVersion,
    extractWorkflowVersionInfo,
    hashImageReference,
    buildManifest,
    completeManifest,
    markManifestStarted,
    serializeManifest,
    parseManifest,
    getManifestFilename,
    type BuildManifestOptions,
} from '../generationManifestService';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockSettings = (): LocalGenerationSettings => ({
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: 'test-client',
    workflowJson: '{}',
    mapping: {},
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
});

const createMockWorkflowProfile = (): WorkflowProfile => ({
    id: 'wan-fun-inpaint',
    label: 'WAN Fun Inpaint',
    workflowJson: JSON.stringify({
        _meta: { version: '1.2.0' },
        revision: 5,
        nodes: {
            '1': {
                class_type: 'UNETLoader',
                inputs: { unet_name: 'wan21-unet.safetensors' },
            },
        },
    }),
    mapping: {},
    category: 'video',
});

const createMockCameraPath = (): CameraPath => ({
    id: 'test-camera-path',
    description: 'Test pan from left to right',
    coordinateSpace: 'screen',
    motionType: 'pan',
    motionIntensity: 0.3,
    keyframes: [
        { timeSeconds: 0, position: { x: 0, y: 0.5 }, fovDegrees: 50 },
        { timeSeconds: 1.5, position: { x: 0.5, y: 0.5 }, easing: 'easeInOut' },
        { timeSeconds: 3, position: { x: 1, y: 0.5 }, easing: 'easeOut' },
    ],
});

// ============================================================================
// TESTS: generateManifestId
// ============================================================================

describe('generationManifestService', () => {
    describe('generateManifestId', () => {
        it('should generate unique IDs with gm_ prefix', () => {
            const id1 = generateManifestId();
            const id2 = generateManifestId();

            expect(id1).toMatch(/^gm_[a-z0-9]+_[a-z0-9]+$/);
            expect(id2).toMatch(/^gm_[a-z0-9]+_[a-z0-9]+$/);
            expect(id1).not.toBe(id2);
        });
    });

    // ============================================================================
    // TESTS: parseVersion
    // ============================================================================

    describe('parseVersion', () => {
        it('should parse standard semver', () => {
            const result = parseVersion('1.2.3');
            expect(result).toEqual({
                major: 1,
                minor: 2,
                patch: 3,
                raw: '1.2.3',
            });
        });

        it('should parse version with v prefix', () => {
            const result = parseVersion('v2.0.1');
            expect(result).toEqual({
                major: 2,
                minor: 0,
                patch: 1,
                raw: 'v2.0.1',
            });
        });

        it('should parse prerelease version', () => {
            const result = parseVersion('1.0.0-beta.1');
            expect(result).toEqual({
                major: 1,
                minor: 0,
                patch: 0,
                prerelease: 'beta.1',
                raw: '1.0.0-beta.1',
            });
        });

        it('should return null for invalid version', () => {
            expect(parseVersion('invalid')).toBeNull();
            expect(parseVersion('1.2')).toBeNull();
        });
    });

    // ============================================================================
    // TESTS: extractWorkflowVersionInfo
    // ============================================================================

    describe('extractWorkflowVersionInfo', () => {
        it('should extract version info from workflow profile', () => {
            const profile = createMockWorkflowProfile();
            const info = extractWorkflowVersionInfo(profile);

            expect(info.profileId).toBe('wan-fun-inpaint');
            expect(info.label).toBe('WAN Fun Inpaint');
            expect(info.version).toBe('1.2.0');
            expect(info.revision).toBe(5);
            expect(info.category).toBe('video');
        });

        it('should handle profile without embedded version', () => {
            const profile: WorkflowProfile = {
                id: 'simple-profile',
                label: 'Simple',
                workflowJson: '{}',
                mapping: {},
            };

            const info = extractWorkflowVersionInfo(profile);

            expect(info.profileId).toBe('simple-profile');
            expect(info.version).toBeUndefined();
            expect(info.revision).toBeUndefined();
        });
    });

    // ============================================================================
    // TESTS: hashImageReference
    // ============================================================================

    describe('hashImageReference', () => {
        it('should generate consistent hash for same input', () => {
            const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
            const hash1 = hashImageReference(base64);
            const hash2 = hashImageReference(base64);

            expect(hash1).toBe(hash2);
            expect(hash1).toMatch(/^img_[0-9a-f]{8}$/);
        });

        it('should generate different hashes for different inputs', () => {
            const hash1 = hashImageReference('base64ImageData1');
            const hash2 = hashImageReference('base64ImageData2');

            expect(hash1).not.toBe(hash2);
        });
    });

    // ============================================================================
    // TESTS: buildManifest - Basic functionality
    // ============================================================================

    describe('buildManifest', () => {
        it('should build manifest with required fields', () => {
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                sceneId: 'scene-1',
                shotId: 'shot-1',
            };

            const manifest = buildManifest(options);

            expect(manifest.manifestVersion).toBe('1.0.0');
            expect(manifest.manifestId).toMatch(/^gm_/);
            expect(manifest.generationType).toBe('video');
            expect(manifest.sceneId).toBe('scene-1');
            expect(manifest.shotId).toBe('shot-1');
            expect(manifest.comfyUIUrl).toBe('http://127.0.0.1:8188');
            expect(manifest.workflow.profileId).toBe('wan-fun-inpaint');
        });

        it('should include prompt and negative prompt', () => {
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                prompt: 'A beautiful sunset',
                negativePrompt: 'blurry, low quality',
            };

            const manifest = buildManifest(options);

            expect(manifest.inputs.prompt).toBe('A beautiful sunset');
            expect(manifest.inputs.negativePrompt).toBe('blurry, low quality');
        });

        it('should hash keyframe references', () => {
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                startKeyframe: 'base64StartKeyframeData',
                endKeyframe: 'base64EndKeyframeData',
            };

            const manifest = buildManifest(options);

            expect(manifest.inputs.startKeyframePath).toMatch(/^img_/);
            expect(manifest.inputs.endKeyframePath).toMatch(/^img_/);
        });

        it('should use explicit seed when provided', () => {
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                seed: 12345,
                seedExplicit: true,
            };

            const manifest = buildManifest(options);

            expect(manifest.determinism.seed).toBe(12345);
            expect(manifest.determinism.seedExplicit).toBe(true);
        });

        it('should detect production-qa stability profile', () => {
            const settings = createMockSettings();
            // Use PRODUCTION_QA_FLAGS which has the correct structure
            settings.featureFlags = { ...PRODUCTION_QA_FLAGS };

            const options: BuildManifestOptions = {
                generationType: 'video',
                settings,
                workflowProfile: createMockWorkflowProfile(),
            };

            const manifest = buildManifest(options);

            expect(manifest.stabilityProfile).toBe('production-qa');
        });

        // =========================================================================
        // Camera Path Tests (E1 - Camera-as-Code)
        // =========================================================================

        it('should include camera path ID and summary when provided', () => {
            const cameraPath = createMockCameraPath();
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                cameraPath,
            };

            const manifest = buildManifest(options);

            expect(manifest.cameraPathId).toBe('test-camera-path');
            expect(manifest.cameraPathSummary).toBeDefined();
            expect(manifest.cameraPathSummary?.keyframeCount).toBe(3);
            expect(manifest.cameraPathSummary?.durationSeconds).toBe(3);
            expect(manifest.cameraPathSummary?.coordinateSpace).toBe('screen');
            expect(manifest.cameraPathSummary?.motionType).toBe('pan');
            expect(manifest.cameraPathSummary?.motionIntensity).toBe(0.3);
        });

        it('should not include camera path fields when not provided', () => {
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
            };

            const manifest = buildManifest(options);

            expect(manifest.cameraPathId).toBeUndefined();
            expect(manifest.cameraPathSummary).toBeUndefined();
        });

        it('should handle camera path with minimal keyframes', () => {
            const minimalPath: CameraPath = {
                id: 'minimal-path',
                keyframes: [
                    { timeSeconds: 0, position: { x: 0.5, y: 0.5 } },
                ],
            };

            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                cameraPath: minimalPath,
            };

            const manifest = buildManifest(options);

            expect(manifest.cameraPathId).toBe('minimal-path');
            expect(manifest.cameraPathSummary?.keyframeCount).toBe(1);
            expect(manifest.cameraPathSummary?.durationSeconds).toBeUndefined(); // 0 is falsy
            expect(manifest.cameraPathSummary?.coordinateSpace).toBeUndefined();
        });
    });

    // ============================================================================
    // TESTS: completeManifest
    // ============================================================================

    describe('completeManifest', () => {
        it('should add completion data to manifest', () => {
            const options: BuildManifestOptions = {
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
            };
            const manifest = buildManifest(options);

            const completed = completeManifest(manifest, {
                videoPath: '/output/video.mp4',
                frameCount: 81,
                resolution: { width: 1280, height: 720 },
                durationSeconds: 3.0,
                fps: 27,
            });

            expect(completed.outputs.videoPath).toBe('/output/video.mp4');
            expect(completed.outputs.frameCount).toBe(81);
            expect(completed.outputs.resolution).toEqual({ width: 1280, height: 720 });
            expect(completed.timing.completedAt).toBeDefined();
            expect(completed.timing.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('should add quality scores when provided', () => {
            const manifest = buildManifest({
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
            });

            const completed = completeManifest(
                manifest,
                {},
                { visionQA: 85, coherence: 90, motionQuality: 78 }
            );

            expect(completed.qualityScores?.visionQA).toBe(85);
            expect(completed.qualityScores?.coherence).toBe(90);
            expect(completed.qualityScores?.motionQuality).toBe(78);
        });
    });

    // ============================================================================
    // TESTS: markManifestStarted
    // ============================================================================

    describe('markManifestStarted', () => {
        it('should mark manifest as started with timing', () => {
            const manifest = buildManifest({
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
            });

            const started = markManifestStarted(manifest);

            expect(started.timing.startedAt).toBeDefined();
            expect(started.timing.queueWaitMs).toBeGreaterThanOrEqual(0);
        });
    });

    // ============================================================================
    // TESTS: serializeManifest / parseManifest
    // ============================================================================

    describe('serializeManifest / parseManifest', () => {
        it('should serialize and parse manifest correctly', () => {
            const manifest = buildManifest({
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                cameraPath: createMockCameraPath(),
            });

            const serialized = serializeManifest(manifest);
            const parsed = parseManifest(serialized);

            expect(parsed).not.toBeNull();
            expect(parsed?.manifestId).toBe(manifest.manifestId);
            expect(parsed?.cameraPathId).toBe('test-camera-path');
            expect(parsed?.cameraPathSummary?.keyframeCount).toBe(3);
        });

        it('should return null for invalid JSON', () => {
            expect(parseManifest('not json')).toBeNull();
            expect(parseManifest('{}')).toBeNull(); // Missing required fields
        });
    });

    // ============================================================================
    // TESTS: getManifestFilename
    // ============================================================================

    describe('getManifestFilename', () => {
        it('should generate filename with type and timestamp', () => {
            const manifest = buildManifest({
                generationType: 'video',
                settings: createMockSettings(),
                workflowProfile: createMockWorkflowProfile(),
                sceneId: 'scene-1',
                shotId: 'shot-a',
            });

            const filename = getManifestFilename(manifest);

            expect(filename).toMatch(/^manifest_video_scene-1_shot-a_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
        });
    });
});
