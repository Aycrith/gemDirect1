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
        it('should have all flags set to false by default', () => {
            const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[];
            
            for (const key of flagKeys) {
                expect(DEFAULT_FEATURE_FLAGS[key]).toBe(false);
            }
        });

        it('should have 10 flags defined', () => {
            const flagCount = Object.keys(DEFAULT_FEATURE_FLAGS).length;
            expect(flagCount).toBe(10);
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
            expect(getFeatureFlag(undefined, 'promptQualityGate')).toBe(false);
        });

        it('should return default value for missing flag in partial object', () => {
            const partialFlags: Partial<FeatureFlags> = { bookendKeyframes: true };
            expect(getFeatureFlag(partialFlags, 'promptQualityGate')).toBe(false);
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
            expect(isFeatureEnabled(flags, 'promptQualityGate')).toBe(false);
        });

        it('should handle empty object', () => {
            expect(isFeatureEnabled({}, 'bookendKeyframes')).toBe(false);
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
            expect(merged.bookendKeyframes).toBe(false); // Default
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
        it('should return empty array when no flags enabled', () => {
            expect(getEnabledFlags(undefined)).toEqual([]);
            expect(getEnabledFlags({})).toEqual([]);
        });

        it('should return array of enabled flag names', () => {
            const flags: Partial<FeatureFlags> = {
                promptQualityGate: true,
                autoSuggestions: true,
                bookendKeyframes: false,
            };
            const enabled = getEnabledFlags(flags);
            
            expect(enabled).toContain('promptQualityGate');
            expect(enabled).toContain('autoSuggestions');
            expect(enabled).not.toContain('bookendKeyframes');
        });

        it('should return all enabled flags', () => {
            const allEnabled: FeatureFlags = {
                bookendKeyframes: true,
                videoUpscaling: true,
                characterConsistency: true,
                shotLevelContinuity: true,
                autoSuggestions: true,
                narrativeStateTracking: true,
                promptABTesting: true,
                providerHealthPolling: true,
                promptQualityGate: true,
                characterAppearanceTracking: true,
            };
            
            const enabled = getEnabledFlags(allEnabled);
            expect(enabled.length).toBe(10);
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
            const event = createFlagChangeEvent('bookendKeyframes', true, false);
            
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
