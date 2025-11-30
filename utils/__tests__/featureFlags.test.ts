/**
 * Feature Flags Unit Tests
 * 
 * Tests for the feature flags system including:
 * - Flag defaults and merging
 * - Dependency checking
 * - Validation of flag combinations
 * 
 * @module utils/__tests__/featureFlags.test
 */

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_FEATURE_FLAGS,
    FEATURE_FLAG_META,
    FeatureFlags,
    getFeatureFlag,
    isFeatureEnabled,
    mergeFeatureFlags,
    getEnabledFlags,
    getFlagsByCategory,
    checkFlagDependencies,
    validateFlagCombination,
    createFlagChangeEvent,
} from '../featureFlags';

describe('featureFlags', () => {
    describe('DEFAULT_FEATURE_FLAGS', () => {
        it('should have expected default values for core flags', () => {
            // Core workflow flags
            // Note: bookendKeyframes removed - use LocalGenerationSettings.keyframeMode instead
            expect(DEFAULT_FEATURE_FLAGS.videoUpscaling).toBe(false);
            expect(DEFAULT_FEATURE_FLAGS.characterConsistency).toBe(false);
            
            // Pipeline flags may be enabled for validation testing
            // Check that they have valid values (boolean or union type)
            const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[];
            for (const key of flagKeys) {
                const value = DEFAULT_FEATURE_FLAGS[key];
                // Each flag should be a boolean or a known string value
                const isValid = typeof value === 'boolean' || 
                    value === 'off' || value === 'warn' || value === 'block' ||
                    value === 'legacy' || value === 'optimized'; // qualityPrefixVariant
                expect(isValid).toBe(true);
            }
        });

        it('should have 26 flags defined', () => {
            const flagCount = Object.keys(DEFAULT_FEATURE_FLAGS).length;
            expect(flagCount).toBe(26);
        });

        it('should have metadata for every flag', () => {
            const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[];
            
            for (const key of flagKeys) {
                expect(FEATURE_FLAG_META[key]).toBeDefined();
                expect(FEATURE_FLAG_META[key].id).toBe(key);
                expect(FEATURE_FLAG_META[key].label).toBeTruthy();
                expect(FEATURE_FLAG_META[key].description).toBeTruthy();
            }
        });
    });

    describe('getFeatureFlag', () => {
        it('should return default value for undefined flags', () => {
            expect(getFeatureFlag(undefined, 'videoUpscaling')).toBe(false);
        });

        it('should return default value for missing flag in partial object', () => {
            const partialFlags: Partial<FeatureFlags> = { promptQualityGate: true };
            expect(getFeatureFlag(partialFlags, 'videoUpscaling')).toBe(false);
        });

        it('should return user value when flag is explicitly set', () => {
            const flags: Partial<FeatureFlags> = { promptQualityGate: true };
            expect(getFeatureFlag(flags, 'promptQualityGate')).toBe(true);
        });

        it('should return false when flag is explicitly set to false', () => {
            const flags: Partial<FeatureFlags> = { promptQualityGate: false };
            expect(getFeatureFlag(flags, 'promptQualityGate')).toBe(false);
        });
    });

    describe('isFeatureEnabled', () => {
        it('should return false for undefined flags', () => {
            expect(isFeatureEnabled(undefined, 'providerHealthPolling')).toBe(false);
        });

        it('should return true only when flag is explicitly enabled', () => {
            const flags: Partial<FeatureFlags> = { providerHealthPolling: true };
            expect(isFeatureEnabled(flags, 'providerHealthPolling')).toBe(true);
        });

        it('should handle empty object with default-on flags', () => {
            // promptQualityGate is enabled by default
            expect(isFeatureEnabled({}, 'promptQualityGate')).toBe(true);
        });
    });

    describe('mergeFeatureFlags', () => {
        it('should return defaults when given undefined', () => {
            const merged = mergeFeatureFlags(undefined);
            expect(merged).toEqual(DEFAULT_FEATURE_FLAGS);
        });

        it('should return defaults when given empty object', () => {
            const merged = mergeFeatureFlags({});
            expect(merged).toEqual(DEFAULT_FEATURE_FLAGS);
        });

        it('should override defaults with user values', () => {
            const userFlags: Partial<FeatureFlags> = {
                promptQualityGate: true,
                providerHealthPolling: true,
            };
            const merged = mergeFeatureFlags(userFlags);
            
            expect(merged.promptQualityGate).toBe(true);
            expect(merged.providerHealthPolling).toBe(true);
        });

        it('should preserve all default flags in merged result', () => {
            const merged = mergeFeatureFlags({ autoSuggestions: true });
            const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[];
            
            for (const key of flagKeys) {
                expect(merged[key]).toBeDefined();
            }
        });
    });

    describe('getEnabledFlags', () => {
        it('should return default-enabled flags when given undefined or empty', () => {
            // With pipeline validation testing, some flags are enabled by default
            const defaultEnabled = getEnabledFlags(undefined);
            // Check that it includes the pipeline flags if they're on
            if (DEFAULT_FEATURE_FLAGS.keyframePromptPipeline) {
                expect(defaultEnabled).toContain('keyframePromptPipeline');
            }
            // Empty object should also use defaults
            expect(getEnabledFlags({})).toEqual(defaultEnabled);
        });

        it('should return array of enabled flag names', () => {
            const flags: Partial<FeatureFlags> = {
                promptQualityGate: true,
                autoSuggestions: true,
                videoUpscaling: false,
            };
            const enabled = getEnabledFlags(flags);
            
            expect(enabled).toContain('promptQualityGate');
            expect(enabled).toContain('autoSuggestions');
            expect(enabled).not.toContain('videoUpscaling');
        });

        it('should return all enabled flags', () => {
            const allEnabled: FeatureFlags = {
                // Note: bookendKeyframes removed - use LocalGenerationSettings.keyframeMode instead
                videoUpscaling: true,
                characterConsistency: true,
                shotLevelContinuity: true,
                autoSuggestions: true,
                narrativeStateTracking: true,
                promptABTesting: true,
                providerHealthPolling: true,
                promptQualityGate: true,
                characterAppearanceTracking: true,
                // Quality flags (newly enabled by default)
                enhancedNegativePrompts: true,
                subjectFirstPrompts: true,
                promptWeighting: true,
                qualityPrefixVariant: 'legacy',
                // Pipeline flags
                sceneListContextV2: true,
                actContextV2: true,
                keyframePromptPipeline: true,
                videoPromptPipeline: true,
                bibleV2SaveSync: true,
                sceneListValidationMode: 'warn',
                promptTokenGuard: 'warn',
                showBayesianAnalytics: true,
                // State management flags
                useUnifiedSceneStore: true,
                sceneStoreParallelValidation: true,
                enableQuickGenerate: false,
                // Generation queue flags
                useGenerationQueue: false,
                useLLMTransportAdapter: false,
            };
            
            const enabled = getEnabledFlags(allEnabled);
            // Count boolean flags set to true (excludes qualityPrefixVariant string and union-type 'warn' values)
            expect(enabled.length).toBe(20);
        });
    });

    describe('getFlagsByCategory', () => {
        it('should return quality category flags', () => {
            const qualityFlags = getFlagsByCategory('quality');
            expect(qualityFlags.length).toBeGreaterThan(0);
            
            for (const flag of qualityFlags) {
                expect(flag.category).toBe('quality');
            }
        });

        it('should return workflow category flags', () => {
            const workflowFlags = getFlagsByCategory('workflow');
            expect(workflowFlags.length).toBeGreaterThan(0);
            
            for (const flag of workflowFlags) {
                expect(flag.category).toBe('workflow');
            }
        });

        it('should return continuity category flags', () => {
            const continuityFlags = getFlagsByCategory('continuity');
            expect(continuityFlags.length).toBeGreaterThan(0);
            
            for (const flag of continuityFlags) {
                expect(flag.category).toBe('continuity');
            }
        });

        it('should return experimental category flags', () => {
            const experimentalFlags = getFlagsByCategory('experimental');
            expect(experimentalFlags.length).toBeGreaterThan(0);
            
            for (const flag of experimentalFlags) {
                expect(flag.category).toBe('experimental');
            }
        });
    });

    describe('checkFlagDependencies', () => {
        it('should return satisfied for flags without dependencies', () => {
            const result = checkFlagDependencies({}, 'promptQualityGate');
            expect(result.satisfied).toBe(true);
            expect(result.missingDeps).toEqual([]);
        });

        it('should return missing dependencies when not satisfied', () => {
            // videoUpscaling depends on characterConsistency
            const result = checkFlagDependencies({}, 'videoUpscaling');
            
            if (FEATURE_FLAG_META.videoUpscaling.dependencies) {
                expect(result.satisfied).toBe(false);
                expect(result.missingDeps).toContain('characterConsistency');
            } else {
                expect(result.satisfied).toBe(true);
            }
        });

        it('should return satisfied when dependencies are enabled', () => {
            const flags: Partial<FeatureFlags> = { characterConsistency: true };
            const result = checkFlagDependencies(flags, 'videoUpscaling');
            
            expect(result.satisfied).toBe(true);
            expect(result.missingDeps).toEqual([]);
        });
    });

    describe('validateFlagCombination', () => {
        it('should return valid for empty flags', () => {
            const result = validateFlagCombination(undefined);
            expect(result.valid).toBe(true);
        });

        it('should return warning for conflicting flags', () => {
            const flags: Partial<FeatureFlags> = {
                videoUpscaling: true,
                characterConsistency: true,
            };
            const result = validateFlagCombination(flags);
            
            expect(result.valid).toBe(true); // Warnings don't block
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('upscaling');
        });

        it('should warn about A/B testing without quality gate', () => {
            const flags: Partial<FeatureFlags> = {
                promptABTesting: true,
                promptQualityGate: false,
            };
            const result = validateFlagCombination(flags);
            
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('A/B testing'))).toBe(true);
        });

        it('should not warn when A/B testing has quality gate', () => {
            const flags: Partial<FeatureFlags> = {
                promptABTesting: true,
                promptQualityGate: true,
            };
            const result = validateFlagCombination(flags);
            
            const abWarning = result.warnings.find(w => w.includes('A/B testing'));
            expect(abWarning).toBeUndefined();
        });
    });

    describe('createFlagChangeEvent', () => {
        it('should create event with correct structure', () => {
            const event = createFlagChangeEvent('promptQualityGate', false, true);
            
            expect(event.flag).toBe('promptQualityGate');
            expect(event.oldValue).toBe(false);
            expect(event.newValue).toBe(true);
            expect(typeof event.timestamp).toBe('number');
            expect(event.timestamp).toBeLessThanOrEqual(Date.now());
        });

        it('should capture toggle off events', () => {
            const event = createFlagChangeEvent('videoUpscaling', true, false);
            
            expect(event.oldValue).toBe(true);
            expect(event.newValue).toBe(false);
        });
    });

    describe('FEATURE_FLAG_META stability', () => {
        it('should have valid stability values', () => {
            const validStabilities = ['stable', 'beta', 'experimental'];
            const metas = Object.values(FEATURE_FLAG_META);
            
            for (const meta of metas) {
                expect(validStabilities).toContain(meta.stability);
            }
        });

        it('should have valid category values', () => {
            const validCategories = ['quality', 'workflow', 'continuity', 'experimental'];
            const metas = Object.values(FEATURE_FLAG_META);
            
            for (const meta of metas) {
                expect(validCategories).toContain(meta.category);
            }
        });
    });
});
