/**
 * Unit Tests for Model Sanity Check Utility
 * 
 * Tests validateActiveModels(), isBookendGenerationReady(), and
 * getConfigurationRecommendations() functions.
 */

import { describe, it, expect } from 'vitest';
import {
    validateActiveModels,
    isBookendGenerationReady,
    getConfigurationRecommendations,
    EXPECTED_VIDEO_PROFILES,
    EXPECTED_LLM_DEFAULTS,
} from '../modelSanityCheck';
import type { LocalGenerationSettings, WorkflowProfile } from '../../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockProfile = (id: string, hasWorkflow: boolean = true, hasMapping: boolean = true): WorkflowProfile => ({
    id,
    label: `Mock ${id}`,
    // Workflow JSON needs to be > 100 chars for validation
    workflowJson: hasWorkflow ? JSON.stringify({ 
        "1": { class_type: 'TestNode', inputs: { text: 'test prompt for validation' } },
        "2": { class_type: 'LoadImage', inputs: { image: 'test.png' } },
        "3": { class_type: 'SaveImage', inputs: { filename_prefix: 'output' } },
    }) : '',
    mapping: hasMapping ? { '1:text': 'human_readable_prompt' as const } : {},
    metadata: {
        lastSyncedAt: Date.now(),
        highlightMappings: [],
        missingMappings: [],
        warnings: [],
    },
});

const createMockSettings = (overrides: Partial<LocalGenerationSettings> = {}): LocalGenerationSettings => ({
    comfyUIUrl: 'http://localhost:8188',
    comfyUIClientId: 'test-client',
    workflowJson: '',
    mapping: {},
    llmProviderUrl: 'http://localhost:1234/v1/chat/completions',
    llmModel: 'qwen/qwen3-14b',
    visionLLMProviderUrl: 'http://localhost:1234/v1/chat/completions',
    visionLLMModel: 'qwen/qwen3-vl-8b',
    workflowProfiles: {
        'wan-flf2v': createMockProfile('wan-flf2v'),
        'wan-i2v': createMockProfile('wan-i2v'),
        'wan-t2i': createMockProfile('wan-t2i'),
    },
    sceneBookendWorkflowProfile: 'wan-flf2v',
    videoWorkflowProfile: 'wan-i2v',
    imageWorkflowProfile: 'wan-t2i',
    ...overrides,
});

// ============================================================================
// Tests: validateActiveModels
// ============================================================================

describe('validateActiveModels', () => {
    it('should return valid result with properly configured settings', () => {
        const settings = createMockSettings();
        const result = validateActiveModels(settings);

        expect(result.overall.valid).toBe(true);
        expect(result.overall.score).toBeGreaterThanOrEqual(80);
        expect(result.llm.textModel.valid).toBe(true);
        expect(result.llm.visionModel.valid).toBe(true);
    });

    it('should fail when text LLM is not configured', () => {
        const settings = createMockSettings({
            llmModel: undefined,
            llmProviderUrl: undefined,
        });
        const result = validateActiveModels(settings);

        expect(result.llm.textModel.valid).toBe(false);
        expect(result.llm.textModel.errors.length).toBeGreaterThan(0);
        expect(result.overall.score).toBeLessThan(100);
    });

    it('should fail when vision LLM is not configured and no fallback available', () => {
        const settings = createMockSettings({
            // Clear both vision LLM AND text LLM to test failure
            visionLLMModel: undefined,
            visionLLMProviderUrl: undefined,
            llmModel: undefined,  // No fallback either
            llmProviderUrl: undefined,
        });
        const result = validateActiveModels(settings);

        expect(result.llm.visionModel.valid).toBe(false);
        expect(result.llm.visionModel.errors.length).toBeGreaterThan(0);
    });

    it('should warn when using non-recommended LLM model', () => {
        const settings = createMockSettings({
            llmModel: 'some-random-model',
        });
        const result = validateActiveModels(settings);

        expect(result.llm.textModel.valid).toBe(true); // Still valid, just warning
        expect(result.llm.textModel.warnings.length).toBeGreaterThan(0);
        expect(result.llm.textModel.recommendations.length).toBeGreaterThan(0);
    });

    it('should validate bookend profile correctly', () => {
        const settings = createMockSettings();
        const result = validateActiveModels(settings);

        expect(result.profiles.bookendProfile.valid).toBe(true);
        expect(result.profiles.bookendProfile.hasWorkflow).toBe(true);
    });

    it('should fail bookend profile when workflow is missing', () => {
        const settings = createMockSettings({
            workflowProfiles: {
                'wan-flf2v': createMockProfile('wan-flf2v', false), // No workflow
                'wan-i2v': createMockProfile('wan-i2v'),
                'wan-t2i': createMockProfile('wan-t2i'),
            },
        });
        const result = validateActiveModels(settings);

        expect(result.profiles.bookendProfile.valid).toBe(false);
        expect(result.profiles.bookendProfile.errors.length).toBeGreaterThan(0);
    });

    it('should fail when no workflow profiles exist', () => {
        const settings = createMockSettings({
            workflowProfiles: {},
        });
        const result = validateActiveModels(settings);

        expect(result.profiles.bookendProfile.valid).toBe(false);
        expect(result.profiles.bookendProfile.errors).toContain(
            'No workflow profiles loaded. Import localGenSettings.json first.'
        );
    });

    it('should calculate overall score correctly', () => {
        // Fully configured
        const goodSettings = createMockSettings();
        const goodResult = validateActiveModels(goodSettings);
        expect(goodResult.overall.score).toBe(100);

        // Missing some optional profiles
        const partialSettings = createMockSettings({
            videoWorkflowProfile: undefined,
        });
        const partialResult = validateActiveModels(partialSettings);
        expect(partialResult.overall.score).toBeLessThan(100);
        expect(partialResult.overall.score).toBeGreaterThan(50);
    });

    it('should generate helpful summary messages', () => {
        const settings = createMockSettings();
        const result = validateActiveModels(settings);

        expect(result.summary.length).toBeGreaterThan(0);
        expect(result.summary.some(s => s.includes('✅'))).toBe(true);
    });
});

// ============================================================================
// Tests: isBookendGenerationReady
// ============================================================================

describe('isBookendGenerationReady', () => {
    it('should return ready when bookend profile is configured', () => {
        const settings = createMockSettings();
        const result = isBookendGenerationReady(settings);

        expect(result.ready).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('should return not ready when bookend profile is missing', () => {
        const settings = createMockSettings({
            workflowProfiles: {
                'wan-i2v': createMockProfile('wan-i2v'),
                // Missing wan-flf2v
            },
            sceneBookendWorkflowProfile: 'wan-flf2v',
        });
        const result = isBookendGenerationReady(settings);

        expect(result.ready).toBe(false);
        expect(result.reason).toContain('not found');
    });

    it('should return not ready when profile has no workflow', () => {
        const settings = createMockSettings({
            workflowProfiles: {
                'wan-flf2v': createMockProfile('wan-flf2v', false),
            },
        });
        const result = isBookendGenerationReady(settings);

        expect(result.ready).toBe(false);
        expect(result.reason).toContain('no workflow loaded');
    });

    it('should use default profile (wan-flf2v) when not specified', () => {
        const settings = createMockSettings({
            sceneBookendWorkflowProfile: undefined,
        });
        const result = isBookendGenerationReady(settings);

        expect(result.ready).toBe(true);
    });
});

// ============================================================================
// Tests: getConfigurationRecommendations
// ============================================================================

describe('getConfigurationRecommendations', () => {
    it('should return empty array for fully configured settings', () => {
        const settings = createMockSettings();
        const recommendations = getConfigurationRecommendations(settings);

        // May have optimization recommendations but no critical ones
        expect(recommendations.every(r => !r.includes('Configure'))).toBe(true);
    });

    it('should recommend loading bookend profile when missing', () => {
        const settings = createMockSettings({
            workflowProfiles: {},
        });
        const recommendations = getConfigurationRecommendations(settings);

        expect(recommendations.some(r => r.toLowerCase().includes('bookend'))).toBe(true);
    });

    it('should recommend better model when using wan-fun-inpaint for bookends', () => {
        const settings = createMockSettings({
            keyframeMode: 'bookend',
            sceneBookendWorkflowProfile: 'wan-fun-inpaint',
            workflowProfiles: {
                'wan-fun-inpaint': createMockProfile('wan-fun-inpaint'),
                'wan-flf2v': createMockProfile('wan-flf2v'),
            },
        });
        const recommendations = getConfigurationRecommendations(settings);

        expect(recommendations.some(r => r.includes('wan-flf2v'))).toBe(true);
    });
});

// ============================================================================
// Tests: Constants
// ============================================================================

describe('Constants', () => {
    it('should have expected video profile definitions', () => {
        expect(EXPECTED_VIDEO_PROFILES['wan-flf2v']).toBeDefined();
        expect(EXPECTED_VIDEO_PROFILES['wan-fun-inpaint']).toBeDefined();
        expect(EXPECTED_VIDEO_PROFILES['wan-i2v']).toBeDefined();
    });

    it('should have expected LLM defaults', () => {
        expect(EXPECTED_LLM_DEFAULTS.text.recommendedModel).toBe('qwen/qwen3-14b');
        expect(EXPECTED_LLM_DEFAULTS.vision.recommendedModel).toBe('qwen/qwen3-vl-8b');
    });
});
