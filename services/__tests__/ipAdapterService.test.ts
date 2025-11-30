/**
 * Tests for IP-Adapter Service
 * 
 * Validates character consistency workflow integration including:
 * - Reference image extraction from Visual Bible
 * - IP-Adapter node injection into workflows
 * - Weight configuration and options handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    isIPAdapterEnabled,
    getCharacterReferencesForScene,
    getCharacterReferencesForShot,
    createReferenceFromCharacter,
    createIPAdapterNodes,
    injectIPAdapterIntoWorkflow,
    prepareIPAdapterPayload,
    applyUploadedImagesToWorkflow,
    resetNodeIdCounter,
    validateIPAdapterModels,
    getAvailableIPAdapterModels,
    getAvailableClipVisionModels,
    RECOMMENDED_WEIGHTS,
    IPADAPTER_NODE_TYPES,
    DEFAULT_IPADAPTER_OPTIONS,
    type IPAdapterReference,
} from '../ipAdapterService';
import type { VisualBible, VisualBibleCharacter, Scene, Shot } from '../../types';

// Mock scene for testing
const mockScene: Scene = {
    id: 'scene-1',
    title: 'The Hero Arrives',
    summary: 'A brave warrior named Marcus approaches the ancient temple.',
    timeline: { 
        shots: [],
        shotEnhancers: {},
        transitions: [],
        negativePrompt: '',
    },
};

// Mock shot for testing
const mockShot: Shot = {
    id: 'shot-1',
    description: 'Marcus draws his sword as he enters the temple.',
    purpose: 'Establish hero arrival',
};

// Mock character with reference image
const mockCharacterWithImage: VisualBibleCharacter = {
    id: 'char-marcus',
    name: 'Marcus',
    description: 'A brave warrior with dark hair',
    role: 'protagonist',
    visualTraits: ['tall', 'muscular', 'dark hair'],
    imageRefs: ['data:image/png;base64,mockImageData123'],
    ipAdapterWeight: 0.75,
};

// Mock character without reference image
const mockCharacterWithoutImage: VisualBibleCharacter = {
    id: 'char-villain',
    name: 'Dark Lord',
    description: 'An ancient evil',
    role: 'antagonist',
    visualTraits: ['hooded', 'glowing eyes'],
};

// Mock Visual Bible
const mockVisualBible: VisualBible = {
    characters: [mockCharacterWithImage, mockCharacterWithoutImage],
    styleBoards: [],
    sceneCharacters: {
        'scene-1': ['char-marcus'],
    },
    shotCharacters: {},
};

// Empty Visual Bible
const emptyVisualBible: VisualBible = {
    characters: [],
    styleBoards: [],
};

describe('ipAdapterService', () => {
    beforeEach(() => {
        resetNodeIdCounter();
    });

    describe('isIPAdapterEnabled', () => {
        it('returns true when explicitly enabled via options', () => {
            expect(isIPAdapterEnabled({ enabled: true })).toBe(true);
        });

        it('returns false when explicitly disabled via options', () => {
            expect(isIPAdapterEnabled({ enabled: false })).toBe(false);
        });

        it('checks feature flag when options not provided', () => {
            // Default feature flag is false
            expect(isIPAdapterEnabled()).toBe(false);
        });
    });

    describe('getCharacterReferencesForScene', () => {
        it('returns empty array for null Visual Bible', () => {
            const refs = getCharacterReferencesForScene(null, mockScene);
            expect(refs).toEqual([]);
        });

        it('returns empty array for empty Visual Bible', () => {
            const refs = getCharacterReferencesForScene(emptyVisualBible, mockScene);
            expect(refs).toEqual([]);
        });

        it('returns references for characters mapped to scene', () => {
            const refs = getCharacterReferencesForScene(mockVisualBible, mockScene);
            expect(refs).toHaveLength(1);
            expect(refs[0]!.characterId).toBe('char-marcus');
            expect(refs[0]!.characterName).toBe('Marcus');
            expect(refs[0]!.imageRef).toBe('data:image/png;base64,mockImageData123');
        });

        it('respects character ipAdapterWeight', () => {
            const refs = getCharacterReferencesForScene(mockVisualBible, mockScene);
            expect(refs[0]!.weight).toBe(0.75);
        });

        it('falls back to default weight when not specified', () => {
            const vb: VisualBible = {
                ...mockVisualBible,
                characters: [{
                    ...mockCharacterWithImage,
                    ipAdapterWeight: undefined,
                }],
            };
            const refs = getCharacterReferencesForScene(vb, mockScene);
            expect(refs[0]!.weight).toBe(RECOMMENDED_WEIGHTS.medium);
        });

        it('applies globalWeight from options', () => {
            const refs = getCharacterReferencesForScene(
                mockVisualBible, 
                mockScene, 
                { globalWeight: 0.5 }
            );
            // Character has weight 0.75, which should be used directly
            expect(refs[0]!.weight).toBe(0.75);
        });

        it('falls back to character name matching in scene text', () => {
            const vbWithoutMapping: VisualBible = {
                ...mockVisualBible,
                sceneCharacters: {}, // No explicit mapping
            };
            const refs = getCharacterReferencesForScene(vbWithoutMapping, mockScene);
            // Should find Marcus by name in scene summary
            expect(refs).toHaveLength(1);
            expect(refs[0]!.characterName).toBe('Marcus');
        });

        it('skips characters without reference images in scene mapping', () => {
            const vb: VisualBible = {
                characters: [mockCharacterWithoutImage], // Only villain, no images
                styleBoards: [],
                sceneCharacters: {
                    'scene-1': ['char-villain'], // Villain has no image
                },
            };
            const sceneWithoutMarcus: Scene = {
                ...mockScene,
                summary: 'The Dark Lord rises from the shadows.',
            };
            const refs = getCharacterReferencesForScene(vb, sceneWithoutMarcus);
            expect(refs).toHaveLength(0);
        });
    });

    describe('getCharacterReferencesForShot', () => {
        it('returns scene references when shot has no specific mapping', () => {
            const sceneRefs: IPAdapterReference[] = [{
                id: 'char-marcus',
                imageRef: 'test.png',
                weight: 0.8,
                weightType: 'standard',
            }];
            const refs = getCharacterReferencesForShot(mockVisualBible, mockShot, sceneRefs);
            expect(refs).toEqual(sceneRefs);
        });

        it('uses shot-specific character mapping when available', () => {
            const vbWithShotMapping: VisualBible = {
                ...mockVisualBible,
                shotCharacters: {
                    'shot-1': ['char-marcus'],
                },
            };
            const refs = getCharacterReferencesForShot(vbWithShotMapping, mockShot, []);
            expect(refs).toHaveLength(1);
            expect(refs[0]!.characterId).toBe('char-marcus');
        });

        it('filters scene refs by character mentions in shot description', () => {
            const sceneRefs: IPAdapterReference[] = [
                {
                    id: 'char-marcus',
                    characterName: 'Marcus',
                    imageRef: 'marcus.png',
                    weight: 0.8,
                    weightType: 'standard',
                },
                {
                    id: 'char-other',
                    characterName: 'Elena',
                    imageRef: 'elena.png',
                    weight: 0.8,
                    weightType: 'standard',
                },
            ];
            const refs = getCharacterReferencesForShot(mockVisualBible, mockShot, sceneRefs);
            // Only Marcus mentioned in shot description
            expect(refs).toHaveLength(1);
            expect(refs[0]!.characterName).toBe('Marcus');
        });
    });

    describe('createReferenceFromCharacter', () => {
        it('creates reference with correct properties', () => {
            const ref = createReferenceFromCharacter(mockCharacterWithImage);
            expect(ref.id).toBe('char-char-marcus');
            expect(ref.characterId).toBe('char-marcus');
            expect(ref.characterName).toBe('Marcus');
            expect(ref.imageRef).toBe('data:image/png;base64,mockImageData123');
            expect(ref.weight).toBe(0.75);
            expect(ref.weightType).toBe('standard');
        });

        it('uses face-specific model for face traits', () => {
            const charWithFace: VisualBibleCharacter = {
                ...mockCharacterWithImage,
                visualTraits: ['distinctive face', 'scar'],
            };
            const ref = createReferenceFromCharacter(charWithFace);
            expect(ref.faceOnly).toBe(true);
            expect(ref.model).toBe('ip-adapter-plus-face_sd15');
        });

        it('uses standard model by default', () => {
            const ref = createReferenceFromCharacter(mockCharacterWithImage);
            expect(ref.faceOnly).toBe(false);
            expect(ref.model).toBe(DEFAULT_IPADAPTER_OPTIONS.defaultModel);
        });
    });

    describe('createIPAdapterNodes', () => {
        const mockReferences: IPAdapterReference[] = [{
            id: 'ref-1',
            imageRef: 'char.png',
            characterName: 'Hero',
            weight: 0.8,
            weightType: 'standard',
        }];

        it('returns empty nodes for empty references', () => {
            const { nodes, connections } = createIPAdapterNodes([], 'model-1');
            expect(nodes).toEqual({});
            expect(connections).toEqual([]);
        });

        it('creates CLIP Vision loader node', () => {
            const { nodes } = createIPAdapterNodes(mockReferences, 'model-1');
            const clipVisionNode = Object.values(nodes).find(
                n => n.class_type === IPADAPTER_NODE_TYPES.CLIP_VISION
            );
            expect(clipVisionNode).toBeDefined();
            expect((clipVisionNode?._meta as { title?: string })?.title).toContain('CLIP Vision');
        });

        it('creates IP-Adapter loader node', () => {
            const { nodes } = createIPAdapterNodes(mockReferences, 'model-1');
            const loaderNode = Object.values(nodes).find(
                n => n.class_type === IPADAPTER_NODE_TYPES.UNIFIED_LOADER
            );
            expect(loaderNode).toBeDefined();
        });

        it('creates LoadImage node for each reference', () => {
            const { nodes } = createIPAdapterNodes(mockReferences, 'model-1');
            const loadImageNodes = Object.values(nodes).filter(
                n => n.class_type === IPADAPTER_NODE_TYPES.LOAD_IMAGE
            );
            expect(loadImageNodes).toHaveLength(1);
            expect((loadImageNodes[0]?.inputs as { image?: string })?.image).toBe('__IPADAPTER_REF_ref-1__');
        });

        it('creates Apply node with correct weight', () => {
            const { nodes } = createIPAdapterNodes(mockReferences, 'model-1');
            const applyNode = Object.values(nodes).find(
                n => n.class_type === IPADAPTER_NODE_TYPES.APPLY
            );
            expect(applyNode).toBeDefined();
            expect((applyNode?.inputs as { weight?: number })?.weight).toBe(0.8);
        });

        it('applies globalWeight multiplier', () => {
            const { nodes } = createIPAdapterNodes(
                mockReferences, 
                'model-1', 
                { globalWeight: 0.5 }
            );
            const applyNode = Object.values(nodes).find(
                n => n.class_type === IPADAPTER_NODE_TYPES.APPLY
            );
            expect((applyNode?.inputs as { weight?: number })?.weight).toBe(0.4); // 0.8 * 0.5
        });

        it('creates connection to replace model input', () => {
            const { connections } = createIPAdapterNodes(mockReferences, 'model-1');
            expect(connections).toHaveLength(1);
            expect(connections[0]!.to).toBe('KSampler');
            expect(connections[0]!.input).toBe('model');
        });
    });

    describe('injectIPAdapterIntoWorkflow', () => {
        const mockWorkflow = {
            '37': {
                class_type: 'UNETLoader',
                inputs: { unet_name: 'model.safetensors' },
            },
            '3': {
                class_type: 'KSampler',
                inputs: { model: ['37', 0], seed: 123 },
            },
            '6': {
                class_type: 'CLIPTextEncode',
                inputs: { text: 'test prompt' },
            },
        };

        it('returns original workflow when feature disabled', () => {
            const refs: IPAdapterReference[] = [{
                id: 'ref-1',
                imageRef: 'test.png',
                weight: 0.8,
                weightType: 'standard',
            }];
            const { workflow, warnings } = injectIPAdapterIntoWorkflow(
                mockWorkflow,
                refs,
                { enabled: false }
            );
            expect(workflow).toEqual(mockWorkflow);
            expect(warnings).toContain('IP-Adapter is disabled');
        });

        it('returns original workflow when no references', () => {
            const { workflow, warnings } = injectIPAdapterIntoWorkflow(
                mockWorkflow,
                [],
                { enabled: true }
            );
            expect(workflow).toEqual(mockWorkflow);
            expect(warnings).toContain('No character references provided');
        });

        it('adds IP-Adapter nodes to workflow', () => {
            const refs: IPAdapterReference[] = [{
                id: 'ref-1',
                imageRef: 'test.png',
                weight: 0.8,
                weightType: 'standard',
            }];
            const { workflow } = injectIPAdapterIntoWorkflow(
                mockWorkflow,
                refs,
                { enabled: true }
            );
            
            // Should have more nodes than original
            expect(Object.keys(workflow).length).toBeGreaterThan(
                Object.keys(mockWorkflow).length
            );
            
            // Should contain CLIP Vision loader
            const hasClipVision = Object.values(workflow).some(
                n => n.class_type === IPADAPTER_NODE_TYPES.CLIP_VISION
            );
            expect(hasClipVision).toBe(true);
        });

        it('builds reference mapping for image upload', () => {
            const refs: IPAdapterReference[] = [{
                id: 'ref-1',
                imageRef: 'test.png',
                weight: 0.8,
                weightType: 'standard',
            }];
            const { referenceMapping } = injectIPAdapterIntoWorkflow(
                mockWorkflow,
                refs,
                { enabled: true }
            );
            expect(referenceMapping['ref-1']).toBe('__IPADAPTER_REF_ref-1__');
        });

        it('warns when model loader not found', () => {
            const workflowWithoutLoader = {
                '3': { class_type: 'KSampler', inputs: {} },
            };
            const refs: IPAdapterReference[] = [{
                id: 'ref-1',
                imageRef: 'test.png',
                weight: 0.8,
                weightType: 'standard',
            }];
            const { warnings } = injectIPAdapterIntoWorkflow(
                workflowWithoutLoader,
                refs,
                { enabled: true }
            );
            expect(warnings.some(w => w.includes('model loader'))).toBe(true);
        });
    });

    describe('prepareIPAdapterPayload', () => {
        it('returns inactive payload when feature disabled', async () => {
            const payload = await prepareIPAdapterPayload(
                mockVisualBible,
                mockScene,
                null,
                '{}',
                { enabled: false }
            );
            expect(payload.isActive).toBe(false);
            expect(payload.warnings).toContain('Character consistency feature is disabled');
        });

        it('returns inactive payload when no character refs found', async () => {
            const payload = await prepareIPAdapterPayload(
                emptyVisualBible,
                mockScene,
                null,
                '{}',
                { enabled: true }
            );
            expect(payload.isActive).toBe(false);
            expect(payload.referenceCount).toBe(0);
        });

        it('handles invalid workflow JSON', async () => {
            const payload = await prepareIPAdapterPayload(
                mockVisualBible,
                mockScene,
                null,
                'invalid json',
                { enabled: true }
            );
            expect(payload.isActive).toBe(false);
            expect(payload.warnings.some(w => w.includes('parse'))).toBe(true);
        });
    });

    describe('applyUploadedImagesToWorkflow', () => {
        it('replaces placeholders with uploaded filenames', () => {
            const workflow = {
                '100': {
                    class_type: IPADAPTER_NODE_TYPES.LOAD_IMAGE,
                    inputs: { image: '__IPADAPTER_REF_ref-1__' },
                },
            };
            const uploadedFilenames = { 'ref-1': 'uploaded_character.png' };
            
            const result = applyUploadedImagesToWorkflow(workflow, uploadedFilenames);
            expect((result['100']!.inputs as { image?: string })?.image).toBe('uploaded_character.png');
        });

        it('preserves non-placeholder images', () => {
            const workflow = {
                '100': {
                    class_type: IPADAPTER_NODE_TYPES.LOAD_IMAGE,
                    inputs: { image: 'original.png' },
                },
            };
            
            const result = applyUploadedImagesToWorkflow(workflow, {});
            expect((result['100']!.inputs as { image?: string })?.image).toBe('original.png');
        });

        it('handles multiple references', () => {
            const workflow = {
                '100': {
                    class_type: IPADAPTER_NODE_TYPES.LOAD_IMAGE,
                    inputs: { image: '__IPADAPTER_REF_char-1__' },
                },
                '101': {
                    class_type: IPADAPTER_NODE_TYPES.LOAD_IMAGE,
                    inputs: { image: '__IPADAPTER_REF_char-2__' },
                },
            };
            const uploadedFilenames = {
                'char-1': 'hero.png',
                'char-2': 'sidekick.png',
            };
            
            const result = applyUploadedImagesToWorkflow(workflow, uploadedFilenames);
            expect((result['100']!.inputs as { image?: string })?.image).toBe('hero.png');
            expect((result['101']!.inputs as { image?: string })?.image).toBe('sidekick.png');
        });
    });

    describe('constants', () => {
        it('exports recommended weights', () => {
            expect(RECOMMENDED_WEIGHTS.high).toBe(0.85);
            expect(RECOMMENDED_WEIGHTS.medium).toBe(0.65);
            expect(RECOMMENDED_WEIGHTS.low).toBe(0.35);
        });

        it('exports default options', () => {
            expect(DEFAULT_IPADAPTER_OPTIONS.globalWeight).toBe(0.8);
            expect(DEFAULT_IPADAPTER_OPTIONS.defaultModel).toBe('ip-adapter-plus_sd15');
        });
    });
});

describe('IP-Adapter Model Validation', () => {
    describe('validateIPAdapterModels', () => {
        it('reports missing models when ComfyUI returns empty model lists', async () => {
            const references: IPAdapterReference[] = [{
                id: 'ref-1',
                imageRef: 'test.png',
                weight: 0.8,
                weightType: 'standard',
                model: 'ip-adapter-plus_sd15',
            }];
            
            // When ComfyUI is unreachable or has no models, validation reports them as missing
            const result = await validateIPAdapterModels('http://unreachable:9999', references);
            
            // Should report valid=false since required models weren't found
            expect(result.valid).toBe(false);
            expect(result.missing.length).toBeGreaterThan(0);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('handles empty references array', async () => {
            const result = await validateIPAdapterModels('http://localhost:8188', []);
            
            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
        });
    });

    describe('getAvailableIPAdapterModels', () => {
        it('returns empty array when ComfyUI is unreachable', async () => {
            const result = await getAvailableIPAdapterModels('http://unreachable:9999');
            expect(result).toEqual([]);
        });
    });

    describe('getAvailableClipVisionModels', () => {
        it('returns empty array when ComfyUI is unreachable', async () => {
            const result = await getAvailableClipVisionModels('http://unreachable:9999');
            expect(result).toEqual([]);
        });
    });
});
