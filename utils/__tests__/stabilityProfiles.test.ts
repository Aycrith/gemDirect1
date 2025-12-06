/**
 * Tests for Stability Profiles module
 */

import { describe, it, expect } from 'vitest';
import {
    STABILITY_PROFILES,
    STABILITY_PROFILE_LIST,
    FAST_PROFILE,
    STANDARD_PROFILE,
    CINEMATIC_PROFILE,
    TEMPORAL_COHERENCE_FLAGS,
    applyStabilityProfile,
    detectCurrentProfile,
    getProfileSummary,
} from '../stabilityProfiles';

describe('stabilityProfiles', () => {
    describe('profile definitions', () => {
        it('defines all expected profiles', () => {
            expect(STABILITY_PROFILES.fast).toBeDefined();
            expect(STABILITY_PROFILES.standard).toBeDefined();
            expect(STABILITY_PROFILES.cinematic).toBeDefined();
            expect(STABILITY_PROFILES.custom).toBeDefined();
        });

        it('provides profile list in correct order', () => {
            expect(STABILITY_PROFILE_LIST).toHaveLength(3);
            expect(STABILITY_PROFILE_LIST[0]?.id).toBe('fast');
            expect(STABILITY_PROFILE_LIST[1]?.id).toBe('standard');
            expect(STABILITY_PROFILE_LIST[2]?.id).toBe('cinematic');
        });

        it('fast profile disables all temporal features', () => {
            expect(FAST_PROFILE.featureFlags.videoDeflicker).toBe(false);
            expect(FAST_PROFILE.featureFlags.ipAdapterReferenceConditioning).toBe(false);
            expect(FAST_PROFILE.featureFlags.promptScheduling).toBe(false);
        });

        it('standard profile enables deflicker only', () => {
            expect(STANDARD_PROFILE.featureFlags.videoDeflicker).toBe(true);
            expect(STANDARD_PROFILE.featureFlags.ipAdapterReferenceConditioning).toBe(false);
            expect(STANDARD_PROFILE.featureFlags.promptScheduling).toBe(false);
        });

        it('cinematic profile enables all temporal features', () => {
            expect(CINEMATIC_PROFILE.featureFlags.videoDeflicker).toBe(true);
            expect(CINEMATIC_PROFILE.featureFlags.ipAdapterReferenceConditioning).toBe(true);
            expect(CINEMATIC_PROFILE.featureFlags.promptScheduling).toBe(true);
        });

        it('all profiles have required metadata', () => {
            for (const profile of STABILITY_PROFILE_LIST) {
                expect(profile.id).toBeDefined();
                expect(profile.label).toBeDefined();
                expect(profile.description).toBeDefined();
                expect(profile.performance).toBeDefined();
                expect(profile.quality).toBeDefined();
            }
        });
    });

    describe('applyStabilityProfile', () => {
        it('applies fast profile flags', () => {
            const existingFlags = { videoUpscaling: true };
            const result = applyStabilityProfile(existingFlags, 'fast');
            
            expect(result.videoDeflicker).toBe(false);
            expect(result.ipAdapterReferenceConditioning).toBe(false);
            expect(result.promptScheduling).toBe(false);
            // Should preserve non-temporal flags
            expect(result.videoUpscaling).toBe(true);
        });

        it('applies cinematic profile flags', () => {
            const existingFlags = { videoUpscaling: true };
            const result = applyStabilityProfile(existingFlags, 'cinematic');
            
            expect(result.videoDeflicker).toBe(true);
            expect(result.ipAdapterReferenceConditioning).toBe(true);
            expect(result.promptScheduling).toBe(true);
            expect(result.deflickerStrength).toBe(0.4);
            expect(result.deflickerWindowSize).toBe(5);
            expect(result.ipAdapterWeight).toBe(0.5);
            expect(result.promptTransitionFrames).toBe(12);
        });

        it('does not modify flags for custom profile', () => {
            const existingFlags = { videoDeflicker: true, ipAdapterReferenceConditioning: false };
            const result = applyStabilityProfile(existingFlags, 'custom');
            
            expect(result).toEqual(existingFlags);
        });

        it('overrides existing temporal flags', () => {
            const existingFlags = { 
                videoDeflicker: true, 
                deflickerStrength: 0.9,
                ipAdapterReferenceConditioning: true 
            };
            const result = applyStabilityProfile(existingFlags, 'fast');
            
            expect(result.videoDeflicker).toBe(false);
            expect(result.deflickerStrength).toBe(0.35);
            expect(result.ipAdapterReferenceConditioning).toBe(false);
        });
    });

    describe('detectCurrentProfile', () => {
        it('detects fast profile', () => {
            const flags = {
                videoDeflicker: false,
                deflickerStrength: 0.35,
                deflickerWindowSize: 3,
                ipAdapterReferenceConditioning: false,
                ipAdapterWeight: 0.4,
                promptScheduling: false,
                promptTransitionFrames: 8,
            };
            expect(detectCurrentProfile(flags)).toBe('fast');
        });

        it('detects standard profile', () => {
            const flags = {
                videoDeflicker: true,
                deflickerStrength: 0.35,
                deflickerWindowSize: 3,
                ipAdapterReferenceConditioning: false,
                ipAdapterWeight: 0.4,
                promptScheduling: false,
                promptTransitionFrames: 8,
            };
            expect(detectCurrentProfile(flags)).toBe('standard');
        });

        it('detects cinematic profile', () => {
            const flags = {
                videoDeflicker: true,
                deflickerStrength: 0.4,
                deflickerWindowSize: 5,
                ipAdapterReferenceConditioning: true,
                ipAdapterWeight: 0.5,
                promptScheduling: true,
                promptTransitionFrames: 12,
                temporalRegularizationEnabled: true,
                temporalRegularizationStrength: 0.35,
                temporalRegularizationWindowFrames: 3, // Matches CINEMATIC_PROFILE
            };
            expect(detectCurrentProfile(flags)).toBe('cinematic');
        });

        it('returns custom for modified settings', () => {
            const flags = {
                videoDeflicker: true,
                deflickerStrength: 0.8, // Non-standard value
                ipAdapterReferenceConditioning: false,
                promptScheduling: false,
            };
            expect(detectCurrentProfile(flags)).toBe('custom');
        });

        it('returns custom when flags partially match', () => {
            const flags = {
                videoDeflicker: true,
                ipAdapterReferenceConditioning: true,
                promptScheduling: false, // Would need to be true for cinematic
            };
            expect(detectCurrentProfile(flags)).toBe('custom');
        });
    });

    describe('getProfileSummary', () => {
        it('returns no temporal processing for fast', () => {
            expect(getProfileSummary('fast')).toBe('No temporal processing');
        });

        it('returns deflicker for standard', () => {
            expect(getProfileSummary('standard')).toBe('Deflicker');
        });

        it('returns all features for cinematic', () => {
            const summary = getProfileSummary('cinematic');
            expect(summary).toContain('Deflicker');
            expect(summary).toContain('IP-Adapter');
            expect(summary).toContain('Prompt Scheduling');
        });

        it('handles unknown profile gracefully', () => {
            // @ts-expect-error Testing invalid input
            expect(getProfileSummary('invalid')).toBe('Unknown profile');
        });
    });

    describe('TEMPORAL_COHERENCE_FLAGS', () => {
        it('includes all expected flag keys', () => {
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('videoDeflicker');
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('deflickerStrength');
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('deflickerWindowSize');
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('ipAdapterReferenceConditioning');
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('ipAdapterWeight');
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('promptScheduling');
            expect(TEMPORAL_COHERENCE_FLAGS).toContain('promptTransitionFrames');
        });
    });
});
