/**
 * Prompt Version Manager Unit Tests
 * 
 * Tests for prompt template management including:
 * - Template loading and retrieval
 * - Genre-based template selection
 * - Template registration
 * - Template application to prompts
 * - A/B testing support
 * 
 * @module services/__tests__/promptVersionManager.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getTemplate,
    getTemplateByGenre,
    getDefaultTemplate,
    getAvailableTemplates,
    getManifest,
    registerTemplate,
    applyTemplate,
    getTemplateVersionHistory,
    compareTemplates,
    resetToDefaults,
    PromptTemplate,
    PromptTemplateMetadata,
    DEFAULT_SINGLE_FRAME_PREFIX,
    DEFAULT_NEGATIVE_PROMPT_BASE,
} from '../promptVersionManager';

describe('promptVersionManager', () => {
    // Reset state before each test to ensure isolation
    beforeEach(() => {
        resetToDefaults();
    });

    describe('DEFAULT_SINGLE_FRAME_PREFIX', () => {
        it('should contain single shot instruction', () => {
            expect(DEFAULT_SINGLE_FRAME_PREFIX).toContain('SINGLE');
            expect(DEFAULT_SINGLE_FRAME_PREFIX).toContain('CONTINUOUS');
        });

        it('should mention 16:9 aspect ratio', () => {
            expect(DEFAULT_SINGLE_FRAME_PREFIX).toContain('16:9');
        });

        it('should prohibit divisions', () => {
            expect(DEFAULT_SINGLE_FRAME_PREFIX).toContain('WITHOUT ANY DIVISIONS');
        });
    });

    describe('DEFAULT_NEGATIVE_PROMPT_BASE', () => {
        it('should include split-screen prevention', () => {
            expect(DEFAULT_NEGATIVE_PROMPT_BASE).toContain('split-screen');
            expect(DEFAULT_NEGATIVE_PROMPT_BASE).toContain('multi-panel');
        });

        it('should include collage prevention', () => {
            expect(DEFAULT_NEGATIVE_PROMPT_BASE).toContain('collage');
            expect(DEFAULT_NEGATIVE_PROMPT_BASE).toContain('montage');
        });

        it('should include text/watermark prevention', () => {
            expect(DEFAULT_NEGATIVE_PROMPT_BASE).toContain('watermark');
            expect(DEFAULT_NEGATIVE_PROMPT_BASE).toContain('text');
        });
    });

    describe('getTemplate', () => {
        it('should return default-cinematic template', () => {
            const result = getTemplate('default-cinematic');
            
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data!.metadata.id).toBe('default-cinematic');
        });

        it('should return sci-fi-epic template', () => {
            const result = getTemplate('sci-fi-epic');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.genre).toBe('sci-fi');
        });

        it('should return drama-intimate template', () => {
            const result = getTemplate('drama-intimate');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.tone).toBe('intimate');
        });

        it('should return thriller-tense template', () => {
            const result = getTemplate('thriller-tense');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.genre).toBe('thriller');
        });

        it('should fail for non-existent template', () => {
            const result = getTemplate('non-existent');
            
            expect(result.success).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors![0]!.code).toBe('TEMPLATE_NOT_FOUND');
        });

        it('should suggest available templates on failure', () => {
            const result = getTemplate('non-existent');
            
            expect(result.errors![0]!.fix).toContain('default-cinematic');
        });
    });

    describe('getTemplateByGenre', () => {
        it('should return sci-fi template for sci-fi genre', () => {
            const result = getTemplateByGenre('sci-fi');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.id).toBe('sci-fi-epic');
        });

        it('should return drama template for drama genre', () => {
            const result = getTemplateByGenre('drama');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.id).toBe('drama-intimate');
        });

        it('should return thriller template for thriller genre', () => {
            const result = getTemplateByGenre('thriller');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.id).toBe('thriller-tense');
        });

        it('should be case-insensitive', () => {
            const result = getTemplateByGenre('SCI-FI');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.genre).toBe('sci-fi');
        });

        it('should fall back to default for unknown genre', () => {
            const result = getTemplateByGenre('western');
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.id).toBe('default-cinematic');
        });
    });

    describe('getDefaultTemplate', () => {
        it('should return default-cinematic template', () => {
            const result = getDefaultTemplate();
            
            expect(result.success).toBe(true);
            expect(result.data!.metadata.id).toBe('default-cinematic');
        });

        it('should have general genre', () => {
            const result = getDefaultTemplate();
            
            expect(result.data!.metadata.genre).toBe('general');
        });
    });

    describe('getAvailableTemplates', () => {
        it('should return metadata for all templates', () => {
            const templates = getAvailableTemplates();
            
            expect(templates.length).toBeGreaterThanOrEqual(4);
        });

        it('should include default-cinematic', () => {
            const templates = getAvailableTemplates();
            const defaultTemplate = templates.find(t => t.id === 'default-cinematic');
            
            expect(defaultTemplate).toBeDefined();
        });

        it('should only return metadata, not full templates', () => {
            const templates = getAvailableTemplates();
            
            templates.forEach(meta => {
                expect(meta).toHaveProperty('id');
                expect(meta).toHaveProperty('version');
                expect(meta).toHaveProperty('genre');
                // Should not have template content
                expect(meta).not.toHaveProperty('singleFramePrefix');
                expect(meta).not.toHaveProperty('styleGuidance');
            });
        });
    });

    describe('getManifest', () => {
        it('should return manifest with version', () => {
            const manifest = getManifest();
            
            expect(manifest.version).toBeDefined();
            expect(typeof manifest.version).toBe('string');
        });

        it('should have lastUpdated timestamp', () => {
            const manifest = getManifest();
            
            expect(manifest.lastUpdated).toBeDefined();
            expect(manifest.lastUpdated).toBeLessThanOrEqual(Date.now());
        });

        it('should have defaultTemplateId', () => {
            const manifest = getManifest();
            
            expect(manifest.defaultTemplateId).toBe('default-cinematic');
        });

        it('should list all template IDs', () => {
            const manifest = getManifest();
            
            expect(manifest.templateIds).toContain('default-cinematic');
            expect(manifest.templateIds).toContain('sci-fi-epic');
            expect(manifest.templateIds.length).toBeGreaterThanOrEqual(4);
        });

        it('should have genre mapping', () => {
            const manifest = getManifest();
            
            expect(manifest.genreMapping['general']).toBe('default-cinematic');
            expect(manifest.genreMapping['sci-fi']).toBe('sci-fi-epic');
        });
    });

    describe('registerTemplate', () => {
        it('should register a new template', () => {
            const customTemplate: PromptTemplate = {
                metadata: {
                    id: 'custom-test',
                    version: '1.0.0',
                    genre: 'custom',
                    tone: 'test',
                    visualDensity: 'LOW',
                    mandatoryElements: [],
                    characterArchetypes: [],
                    qualityThresholds: {
                        coherenceMin: 0.5,
                        diversityEntropyMin: 1.0,
                        similarityAlignmentMin: 0.5,
                    },
                },
                singleFramePrefix: 'Test prefix',
                negativePromptBase: 'Test negative',
                styleGuidance: 'Test style',
                characterTemplate: 'Test char',
                sceneTemplate: 'Test scene',
                transitionGuidance: 'Test transition',
            };
            
            const result = registerTemplate(customTemplate);
            
            expect(result.success).toBe(true);
            
            // Should be retrievable
            const retrieved = getTemplate('custom-test');
            expect(retrieved.success).toBe(true);
            expect(retrieved.data!.metadata.id).toBe('custom-test');
        });

        it('should update manifest with new template', () => {
            const customTemplate: PromptTemplate = {
                metadata: {
                    id: 'custom-registered',
                    version: '1.0.0',
                    genre: 'new-genre',
                    tone: 'test',
                    visualDensity: 'MEDIUM',
                    mandatoryElements: [],
                    characterArchetypes: [],
                    qualityThresholds: {
                        coherenceMin: 0.5,
                        diversityEntropyMin: 1.0,
                        similarityAlignmentMin: 0.5,
                    },
                },
                singleFramePrefix: '',
                negativePromptBase: '',
                styleGuidance: '',
                characterTemplate: '',
                sceneTemplate: '',
                transitionGuidance: '',
            };
            
            registerTemplate(customTemplate);
            
            const manifest = getManifest();
            expect(manifest.templateIds).toContain('custom-registered');
            expect(manifest.genreMapping['new-genre']).toBe('custom-registered');
        });

        it('should fail without metadata.id', () => {
            const invalidTemplate = {
                metadata: {} as PromptTemplateMetadata,
            } as PromptTemplate;
            
            const result = registerTemplate(invalidTemplate);
            
            expect(result.success).toBe(false);
            expect(result.errors![0]!.code).toBe('INVALID_TEMPLATE');
        });

        it('should update existing template', () => {
            const original = getTemplate('default-cinematic');
            expect(original.data!.styleGuidance).toContain('Cinematic');
            
            const updated: PromptTemplate = {
                ...original.data!,
                styleGuidance: 'Updated style guidance',
            };
            
            registerTemplate(updated);
            
            const retrieved = getTemplate('default-cinematic');
            expect(retrieved.data!.styleGuidance).toBe('Updated style guidance');
        });
    });

    describe('applyTemplate', () => {
        it('should enhance prompt with template prefix', () => {
            const result = applyTemplate('A hero walks through the forest');
            
            expect(result.success).toBe(true);
            expect(result.data!.prompt).toContain('SINGLE CONTINUOUS');
            expect(result.data!.prompt).toContain('A hero walks through the forest');
        });

        it('should include style guidance', () => {
            const result = applyTemplate('Test prompt', 'default-cinematic');
            
            expect(result.data!.prompt).toContain('Style guidance:');
            expect(result.data!.prompt).toContain('Cinematic composition');
        });

        it('should return negative prompt', () => {
            const result = applyTemplate('Test prompt');
            
            expect(result.data!.negativePrompt).toContain('split-screen');
            expect(result.data!.negativePrompt).toContain('collage');
        });

        it('should apply specific template', () => {
            const result = applyTemplate('Space explorer', 'sci-fi-epic');
            
            expect(result.data!.prompt).toContain('High-tech aesthetic');
            expect(result.data!.negativePrompt).toContain('low-tech');
        });

        it('should fall back to default for invalid template', () => {
            const result = applyTemplate('Test prompt', 'non-existent');
            
            expect(result.success).toBe(true);
            expect(result.data!.prompt).toContain('Cinematic composition');
        });
    });

    describe('getTemplateVersionHistory', () => {
        it('should return version history for default template', () => {
            const history = getTemplateVersionHistory('default-cinematic');
            
            expect(history.length).toBeGreaterThan(0);
            expect(history[0]!.version).toBe('1.0.0');
            expect(history[0]!.stable).toBe(true);
        });

        it('should return empty array for template without history', () => {
            const history = getTemplateVersionHistory('sci-fi-epic');
            
            // sci-fi-epic might not have explicit versions array
            expect(Array.isArray(history)).toBe(true);
        });

        it('should return empty array for non-existent template', () => {
            const history = getTemplateVersionHistory('non-existent');
            
            expect(history).toEqual([]);
        });
    });

    describe('compareTemplates', () => {
        it('should compare two different templates', () => {
            const result = compareTemplates('default-cinematic', 'sci-fi-epic');
            
            expect(result.success).toBe(true);
            expect(result.data!.differences.length).toBeGreaterThan(0);
        });

        it('should identify genre difference', () => {
            const result = compareTemplates('default-cinematic', 'sci-fi-epic');
            
            const genreDiff = result.data!.differences.find(d => d.includes('Genre'));
            expect(genreDiff).toBeDefined();
            expect(genreDiff).toContain('general');
            expect(genreDiff).toContain('sci-fi');
        });

        it('should return threshold comparison', () => {
            const result = compareTemplates('default-cinematic', 'drama-intimate');
            
            expect(result.data!.thresholdComparison.a).toBeDefined();
            expect(result.data!.thresholdComparison.b).toBeDefined();
            expect(result.data!.thresholdComparison.a.coherenceMin).toBe(0.7);
            expect(result.data!.thresholdComparison.b.coherenceMin).toBe(0.8);
        });

        it('should fail if template A not found', () => {
            const result = compareTemplates('non-existent', 'default-cinematic');
            
            expect(result.success).toBe(false);
            expect(result.errors![0]!.code).toBe('TEMPLATE_A_NOT_FOUND');
        });

        it('should fail if template B not found', () => {
            const result = compareTemplates('default-cinematic', 'non-existent');
            
            expect(result.success).toBe(false);
            expect(result.errors![0]!.code).toBe('TEMPLATE_B_NOT_FOUND');
        });

        it('should have zero differences for same template', () => {
            const result = compareTemplates('default-cinematic', 'default-cinematic');
            
            expect(result.success).toBe(true);
            expect(result.data!.differences).toHaveLength(0);
        });
    });

    describe('resetToDefaults', () => {
        it('should restore built-in templates', () => {
            // Register custom template
            registerTemplate({
                metadata: {
                    id: 'temporary',
                    version: '1.0.0',
                    genre: 'temp',
                    tone: 'temp',
                    visualDensity: 'LOW',
                    mandatoryElements: [],
                    characterArchetypes: [],
                    qualityThresholds: {
                        coherenceMin: 0.5,
                        diversityEntropyMin: 1.0,
                        similarityAlignmentMin: 0.5,
                    },
                },
                singleFramePrefix: '',
                negativePromptBase: '',
                styleGuidance: '',
                characterTemplate: '',
                sceneTemplate: '',
                transitionGuidance: '',
            });
            
            // Verify it was added
            expect(getTemplate('temporary').success).toBe(true);
            
            // Reset
            resetToDefaults();
            
            // Verify it was removed
            expect(getTemplate('temporary').success).toBe(false);
        });

        it('should restore default manifest', () => {
            // Modify manifest by registering template
            registerTemplate({
                metadata: {
                    id: 'modifier',
                    version: '1.0.0',
                    genre: 'modifier-genre',
                    tone: 'test',
                    visualDensity: 'LOW',
                    mandatoryElements: [],
                    characterArchetypes: [],
                    qualityThresholds: {
                        coherenceMin: 0.5,
                        diversityEntropyMin: 1.0,
                        similarityAlignmentMin: 0.5,
                    },
                },
                singleFramePrefix: '',
                negativePromptBase: '',
                styleGuidance: '',
                characterTemplate: '',
                sceneTemplate: '',
                transitionGuidance: '',
            });
            
            resetToDefaults();
            
            const manifest = getManifest();
            expect(manifest.templateIds).not.toContain('modifier');
            expect(manifest.genreMapping).not.toHaveProperty('modifier-genre');
        });
    });

    describe('QualityThresholds', () => {
        it('should have coherenceMin in all templates', () => {
            const templates = getAvailableTemplates();
            
            templates.forEach(meta => {
                expect(meta.qualityThresholds.coherenceMin).toBeDefined();
                expect(meta.qualityThresholds.coherenceMin).toBeGreaterThanOrEqual(0);
                expect(meta.qualityThresholds.coherenceMin).toBeLessThanOrEqual(1);
            });
        });

        it('should have diversityEntropyMin in all templates', () => {
            const templates = getAvailableTemplates();
            
            templates.forEach(meta => {
                expect(meta.qualityThresholds.diversityEntropyMin).toBeDefined();
                expect(meta.qualityThresholds.diversityEntropyMin).toBeGreaterThan(0);
            });
        });

        it('should have similarityAlignmentMin in all templates', () => {
            const templates = getAvailableTemplates();
            
            templates.forEach(meta => {
                expect(meta.qualityThresholds.similarityAlignmentMin).toBeDefined();
                expect(meta.qualityThresholds.similarityAlignmentMin).toBeGreaterThanOrEqual(0);
                expect(meta.qualityThresholds.similarityAlignmentMin).toBeLessThanOrEqual(1);
            });
        });
    });
});
