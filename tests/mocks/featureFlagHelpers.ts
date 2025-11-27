/**
 * Feature Flag Test Helpers
 * 
 * Provides utilities for testing code paths that depend on feature flags.
 * Enables isolated flag state per test without affecting other tests.
 * 
 * @module tests/mocks/featureFlagHelpers
 */

import { 
    FeatureFlags, 
    DEFAULT_FEATURE_FLAGS, 
    mergeFeatureFlags 
} from '../../utils/featureFlags';

/**
 * Creates a test context with specific feature flags enabled.
 * Automatically restores original flags after test completes.
 * 
 * @param overrides - Partial feature flags to override defaults
 * @returns Object with flags and cleanup function
 * 
 * @example
 * ```typescript
 * describe('keyframe pipeline', () => {
 *   it('uses assembler when flag enabled', async () => {
 *     const { flags, restore } = withFlags({ keyframePromptPipeline: true });
 *     try {
 *       const result = await generateKeyframe(scene, { flags });
 *       expect(result.usedAssembler).toBe(true);
 *     } finally {
 *       restore();
 *     }
 *   });
 * });
 * ```
 */
export function withFlags(overrides: Partial<FeatureFlags>): {
    flags: FeatureFlags;
    restore: () => void;
} {
    const flags = mergeFeatureFlags(overrides);
    
    return {
        flags,
        restore: () => {
            // No global state to restore since we return isolated flags
        },
    };
}

/**
 * Creates a mock LocalGenerationSettings object with specified flags.
 * Useful for testing components and hooks that consume settings.
 * 
 * @param flagOverrides - Partial feature flags to override
 * @param settingsOverrides - Additional settings to merge
 * @returns Complete mock LocalGenerationSettings
 */
export function createMockSettingsWithFlags(
    flagOverrides: Partial<FeatureFlags> = {},
    settingsOverrides: Record<string, any> = {}
): any {
    return {
        comfyUIUrl: 'http://localhost:8188',
        comfyUIClientId: 'test-client',
        workflowJson: '{}',
        mapping: {},
        featureFlags: mergeFeatureFlags(flagOverrides),
        ...settingsOverrides,
    };
}

/**
 * Asserts that a specific flag is enabled in the provided flags object.
 * Throws a helpful error message if not.
 * 
 * @param flags - Feature flags to check
 * @param flag - Flag key to verify
 */
export function assertFlagEnabled(
    flags: Partial<FeatureFlags>,
    flag: keyof FeatureFlags
): void {
    const merged = mergeFeatureFlags(flags);
    const value = merged[flag];
    
    if (typeof value === 'boolean' && !value) {
        throw new Error(`Expected flag "${flag}" to be enabled, but it was false`);
    }
    if (value === 'off') {
        throw new Error(`Expected flag "${flag}" to be enabled, but it was 'off'`);
    }
}

/**
 * Asserts that a specific flag is disabled in the provided flags object.
 * 
 * @param flags - Feature flags to check
 * @param flag - Flag key to verify
 */
export function assertFlagDisabled(
    flags: Partial<FeatureFlags>,
    flag: keyof FeatureFlags
): void {
    const merged = mergeFeatureFlags(flags);
    const value = merged[flag];
    
    if (typeof value === 'boolean' && value) {
        throw new Error(`Expected flag "${flag}" to be disabled, but it was true`);
    }
    if (value !== 'off' && typeof value === 'string') {
        throw new Error(`Expected flag "${flag}" to be 'off', but it was '${value}'`);
    }
}

/**
 * Creates a spy that tracks feature flag access.
 * Useful for verifying that code paths check flags before branching.
 * 
 * @returns Object with spy and accessor functions
 */
export function createFlagAccessSpy(): {
    accessLog: Array<{ flag: keyof FeatureFlags; timestamp: number }>;
    getFlag: <K extends keyof FeatureFlags>(flags: Partial<FeatureFlags>, key: K) => FeatureFlags[K];
    reset: () => void;
} {
    const accessLog: Array<{ flag: keyof FeatureFlags; timestamp: number }> = [];
    
    const getFlag = <K extends keyof FeatureFlags>(
        flags: Partial<FeatureFlags>,
        key: K
    ): FeatureFlags[K] => {
        accessLog.push({ flag: key, timestamp: Date.now() });
        return (flags?.[key] ?? DEFAULT_FEATURE_FLAGS[key]) as FeatureFlags[K];
    };
    
    const reset = () => {
        accessLog.length = 0;
    };
    
    return { accessLog, getFlag, reset };
}

/**
 * Test fixture: All pipeline flags enabled.
 */
export const PIPELINE_FLAGS_ENABLED: Partial<FeatureFlags> = {
    sceneListContextV2: true,
    actContextV2: true,
    keyframePromptPipeline: true,
    videoPromptPipeline: true,
    bibleV2SaveSync: true,
    sceneListValidationMode: 'warn',
    promptTokenGuard: 'warn',
};

/**
 * Test fixture: All pipeline flags disabled (default state).
 */
export const PIPELINE_FLAGS_DISABLED: Partial<FeatureFlags> = {
    sceneListContextV2: false,
    actContextV2: false,
    keyframePromptPipeline: false,
    videoPromptPipeline: false,
    bibleV2SaveSync: false,
    sceneListValidationMode: 'off',
    promptTokenGuard: 'off',
};

/**
 * Test fixture: Strict mode (blocking validation).
 */
export const PIPELINE_FLAGS_STRICT: Partial<FeatureFlags> = {
    ...PIPELINE_FLAGS_ENABLED,
    sceneListValidationMode: 'block',
    promptTokenGuard: 'block',
};
