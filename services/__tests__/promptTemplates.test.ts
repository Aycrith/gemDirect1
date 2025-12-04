/**
 * Tests for Prompt Template Service
 */

import { describe, it, expect } from 'vitest';
import {
    getPromptConfigForModel,
    applyPromptTemplate,
    getDefaultNegativePromptForModel,
    getMaxTokensForModel,
    supportsVisualBible,
    formatVisualBibleSegment,
    getRegisteredModelKeys,
} from '../promptTemplates';

describe('promptTemplates', () => {
    describe('getPromptConfigForModel', () => {
        it('should return FLUX config for flux model', () => {
            const config = getPromptConfigForModel('flux1-dev', 'shotImage');
            expect(config.includeVisualBible).toBe(true);
            expect(config.prefix).toContain('cinematic');
        });

        it('should return WAN config for wan model', () => {
            const config = getPromptConfigForModel('wan2-i2v', 'sceneVideo');
            expect(config.includeVisualBible).toBe(false);
            expect(config.maxTokens).toBe(300);
            expect(config.prefix).toContain('cinematic video');
        });

        it('should return WAN keyframe config with prefix/suffix', () => {
            const config = getPromptConfigForModel('wan2-5B', 'sceneKeyframe');
            expect(config.includeVisualBible).toBe(true);
            expect(config.maxTokens).toBe(450);
            expect(config.prefix).toContain('cinematic keyframe');
            expect(config.suffix).toContain('filmic lighting');
        });

        it('should return WAN shotImage config with single frame suffix', () => {
            const config = getPromptConfigForModel('wan-flf2v', 'shotImage');
            expect(config.prefix).toContain('cinematic still frame');
            expect(config.suffix).toContain('single coherent frame');
        });

        it('should return default config for unknown model', () => {
            const config = getPromptConfigForModel('unknown-model', 'shotImage');
            expect(config.template).toBe('{prompt}');
            expect(config.includeVisualBible).toBe(true);
        });

        it('should be case-insensitive', () => {
            const config1 = getPromptConfigForModel('FLUX', 'shotImage');
            const config2 = getPromptConfigForModel('flux', 'shotImage');
            expect(config1.prefix).toBe(config2.prefix);
        });
    });

    describe('applyPromptTemplate', () => {
        it('should add prefix and suffix from config', () => {
            const config = {
                template: '{prompt}',
                includeVisualBible: true,
                prefix: 'PREFIX: ',
                suffix: ' :SUFFIX',
            };
            const result = applyPromptTemplate('test prompt', undefined, config);
            expect(result).toBe('PREFIX: test prompt :SUFFIX');
        });

        it('should include Visual Bible segment when enabled', () => {
            const config = {
                template: '{prompt}',
                includeVisualBible: true,
            };
            const result = applyPromptTemplate('test prompt', 'style: cinematic', config);
            expect(result).toBe('test prompt style: cinematic');
        });

        it('should skip Visual Bible segment when disabled', () => {
            const config = {
                template: '{prompt}',
                includeVisualBible: false,
            };
            const result = applyPromptTemplate('test prompt', 'style: cinematic', config);
            expect(result).toBe('test prompt');
        });

        it('should handle empty Visual Bible segment', () => {
            const config = {
                template: '{prompt}',
                includeVisualBible: true,
            };
            const result = applyPromptTemplate('test prompt', '', config);
            expect(result).toBe('test prompt');
        });

        it('should handle undefined Visual Bible segment', () => {
            const config = {
                template: '{prompt}',
                includeVisualBible: true,
            };
            const result = applyPromptTemplate('test prompt', undefined, config);
            expect(result).toBe('test prompt');
        });
    });

    describe('getDefaultNegativePromptForModel', () => {
        it('should return FLUX-specific negative prompt', () => {
            const negative = getDefaultNegativePromptForModel('flux1-dev');
            expect(negative).toContain('split screen');
        });

        it('should return WAN-specific negative prompt', () => {
            const negative = getDefaultNegativePromptForModel('wan2-2.5B');
            expect(negative).toContain('multi-panel');
            expect(negative).toContain('flicker');
            expect(negative).toContain('grid layout');
            expect(negative).toContain('duplicated frames');
        });

        it('should return default negative prompt for unknown model', () => {
            const negative = getDefaultNegativePromptForModel('unknown-model');
            expect(negative).toContain('blurry');
        });
    });

    describe('getMaxTokensForModel', () => {
        it('should return max tokens for known model/target', () => {
            const tokens = getMaxTokensForModel('flux', 'shotImage');
            expect(tokens).toBe(500);
        });

        it('should return undefined for unknown model', () => {
            const tokens = getMaxTokensForModel('unknown', 'shotImage');
            expect(tokens).toBeUndefined();
        });

        it('should return different tokens for different targets', () => {
            const shotTokens = getMaxTokensForModel('wan', 'shotImage');
            const videoTokens = getMaxTokensForModel('wan', 'sceneVideo');
            expect(shotTokens).toBe(450);
            expect(videoTokens).toBe(300);
        });
    });

    describe('supportsVisualBible', () => {
        it('should return true for models that support VB', () => {
            expect(supportsVisualBible('flux', 'shotImage')).toBe(true);
            expect(supportsVisualBible('lumina', 'sceneKeyframe')).toBe(true);
        });

        it('should return false for video models with limited context', () => {
            expect(supportsVisualBible('wan', 'sceneVideo')).toBe(false);
        });
    });

    describe('formatVisualBibleSegment', () => {
        it('should format style tags', () => {
            const segment = formatVisualBibleSegment(['cinematic', 'noir'], undefined, undefined);
            expect(segment).toBe('Style: cinematic, noir');
        });

        it('should format character traits', () => {
            const segment = formatVisualBibleSegment(undefined, ['tall hero', 'blue eyes'], undefined);
            expect(segment).toBe('Characters: tall hero, blue eyes');
        });

        it('should combine all parts', () => {
            const segment = formatVisualBibleSegment(
                ['cinematic'],
                ['hero'],
                'additional context'
            );
            expect(segment).toBe('Style: cinematic. Characters: hero. additional context');
        });

        it('should handle empty inputs', () => {
            const segment = formatVisualBibleSegment([], [], '');
            expect(segment).toBe('');
        });

        it('should handle undefined inputs', () => {
            const segment = formatVisualBibleSegment(undefined, undefined, undefined);
            expect(segment).toBe('');
        });
    });

    describe('getRegisteredModelKeys', () => {
        it('should return array of registered model keys', () => {
            const keys = getRegisteredModelKeys();
            expect(keys).toContain('flux');
            expect(keys).toContain('wan');
            expect(keys).toContain('lumina');
            expect(keys).toContain('ipadapter');
        });
    });
});
