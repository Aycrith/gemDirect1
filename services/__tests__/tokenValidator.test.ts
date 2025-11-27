/**
 * Tests for tokenValidator service
 * Validates token counting, fallback behavior, and guard modes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    heuristicTokenEstimate,
    countTokensWithFallback,
    guardTokenBudget,
    validatePromptTokens,
    getTokenApiConfig,
    summarizeTokenBudgets,
    TokenCountApi,
} from '../tokenValidator';
import { FeatureFlags } from '../../utils/featureFlags';

// Mock feature flags
const createMockFlags = (promptTokenGuard: 'off' | 'warn' | 'block' = 'off'): Partial<FeatureFlags> => ({
    promptTokenGuard,
});

// Mock API that returns a fixed token count
const createMockApi = (tokenCount: number): TokenCountApi => ({
    countTokens: vi.fn().mockResolvedValue({ totalTokens: tokenCount }),
});

// Mock API that throws an error
const createErrorApi = (error: string = 'API Error'): TokenCountApi => ({
    countTokens: vi.fn().mockRejectedValue(new Error(error)),
});

// Mock API that times out
const createTimeoutApi = (): TokenCountApi => ({
    countTokens: vi.fn().mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
    ),
});

describe('tokenValidator', () => {
    describe('heuristicTokenEstimate', () => {
        it('should return 0 for empty string', () => {
            expect(heuristicTokenEstimate('')).toBe(0);
        });

        it('should estimate tokens based on character count', () => {
            // 35 chars / 3.5 chars per token = 10 tokens
            const text = 'a'.repeat(35);
            expect(heuristicTokenEstimate(text)).toBe(10);
        });

        it('should round up fractional tokens', () => {
            // 10 chars / 3.5 = 2.86, should round to 3
            const text = 'a'.repeat(10);
            expect(heuristicTokenEstimate(text)).toBe(3);
        });

        it('should handle realistic prompt text', () => {
            const prompt = 'A beautiful sunset over the mountains, cinematic lighting, 4k quality';
            const tokens = heuristicTokenEstimate(prompt);
            // 70 chars / 3.5 = 20 tokens
            expect(tokens).toBe(20);
        });
    });

    describe('countTokensWithFallback', () => {
        it('should return 0 tokens for empty text', async () => {
            const result = await countTokensWithFallback('');
            expect(result.tokens).toBe(0);
            expect(result.source).toBe('heuristic');
        });

        it('should use heuristic when no API provided', async () => {
            const result = await countTokensWithFallback('Hello world');
            expect(result.source).toBe('heuristic');
            expect(result.tokens).toBeGreaterThan(0);
        });

        it('should use API when available', async () => {
            const api = createMockApi(42);
            const result = await countTokensWithFallback('Test prompt', api);
            
            expect(result.tokens).toBe(42);
            expect(result.source).toBe('api');
            expect(api.countTokens).toHaveBeenCalledWith({
                model: 'gemini-2.0-flash',
                contents: 'Test prompt',
            });
        });

        it('should fall back to heuristic on API error', async () => {
            const api = createErrorApi('Network error');
            const text = 'Some test text for counting';
            const result = await countTokensWithFallback(text, api);
            
            expect(result.source).toBe('heuristic');
            expect(result.error).toBe('Network error');
            expect(result.tokens).toBe(heuristicTokenEstimate(text));
        });

        it('should use custom model when specified', async () => {
            const api = createMockApi(100);
            await countTokensWithFallback('Test', api, 'gemini-1.5-pro');
            
            expect(api.countTokens).toHaveBeenCalledWith({
                model: 'gemini-1.5-pro',
                contents: 'Test',
            });
        });
    });

    describe('guardTokenBudget', () => {
        it('should always allow when guard mode is off', async () => {
            const flags = createMockFlags('off');
            const result = await guardTokenBudget(
                'a'.repeat(1000), // Would be ~286 tokens
                100, // Budget
                flags
            );
            
            expect(result.allowed).toBe(true);
            expect(result.overBudget).toBe(true);
        });

        it('should allow with warning when guard mode is warn', async () => {
            const flags = createMockFlags('warn');
            const api = createMockApi(150);
            const result = await guardTokenBudget(
                'a'.repeat(400), // Heuristic: ~114 tokens (near budget)
                100,
                flags,
                api
            );
            
            expect(result.allowed).toBe(true);
            expect(result.overBudget).toBe(true);
            expect(result.warning).toContain('exceeds token budget');
        });

        it('should block when guard mode is block and over budget', async () => {
            const flags = createMockFlags('block');
            const api = createMockApi(150);
            const result = await guardTokenBudget(
                'a'.repeat(400),
                100,
                flags,
                api
            );
            
            expect(result.allowed).toBe(false);
            expect(result.overBudget).toBe(true);
        });

        it('should allow when under budget in block mode', async () => {
            const flags = createMockFlags('block');
            const api = createMockApi(50);
            const result = await guardTokenBudget(
                'Short prompt',
                100,
                flags,
                api
            );
            
            expect(result.allowed).toBe(true);
            expect(result.overBudget).toBe(false);
        });

        it('should use fast path for prompts well under budget', async () => {
            const flags = createMockFlags('warn');
            const api = createMockApi(999); // Should NOT be called
            const logApiCall = vi.fn();
            
            // Very short prompt - definitely under 80% of budget
            const result = await guardTokenBudget(
                'Hi',
                1000,
                flags,
                api,
                logApiCall
            );
            
            expect(result.source).toBe('heuristic');
            expect(api.countTokens).not.toHaveBeenCalled();
            expect(logApiCall).toHaveBeenCalledWith('token_guard', 'fast_path', expect.any(Object));
        });

        it('should call API for prompts near budget', async () => {
            const flags = createMockFlags('warn');
            const api = createMockApi(95);
            const logApiCall = vi.fn();
            
            // Prompt that heuristically is near 100 token budget
            const result = await guardTokenBudget(
                'a'.repeat(320), // ~91 tokens, over 80% of 100
                100,
                flags,
                api,
                logApiCall
            );
            
            expect(api.countTokens).toHaveBeenCalled();
            expect(logApiCall).toHaveBeenCalledWith('token_guard', 'check', expect.any(Object));
        });
    });

    describe('validatePromptTokens', () => {
        it('should return valid for prompts under budget', async () => {
            const api = createMockApi(50);
            const result = await validatePromptTokens('Short prompt', 100, api);
            
            expect(result.valid).toBe(true);
            expect(result.tokens).toBe(50);
            expect(result.budget).toBe(100);
        });

        it('should return invalid for prompts over budget', async () => {
            const api = createMockApi(150);
            const result = await validatePromptTokens('Long prompt', 100, api);
            
            expect(result.valid).toBe(false);
            expect(result.tokens).toBe(150);
        });

        it('should use heuristic when no API provided', async () => {
            const result = await validatePromptTokens('Test prompt', 1000);
            
            expect(result.source).toBe('heuristic');
            expect(result.valid).toBe(true);
        });
    });

    describe('getTokenApiConfig', () => {
        it('should return configuration values', () => {
            const config = getTokenApiConfig();
            
            expect(config).toHaveProperty('enabled');
            expect(config).toHaveProperty('timeoutMs');
            expect(config).toHaveProperty('charsPerToken');
            expect(config).toHaveProperty('fastPathThreshold');
            expect(config.charsPerToken).toBe(3.5);
            expect(config.fastPathThreshold).toBe(0.8);
        });
    });

    describe('summarizeTokenBudgets', () => {
        it('should return zeros for empty array', () => {
            const result = summarizeTokenBudgets([], 100);
            
            expect(result.totalTokens).toBe(0);
            expect(result.maxTokens).toBe(0);
            expect(result.minTokens).toBe(0);
            expect(result.overBudgetCount).toBe(0);
            expect(result.withinBudgetPercent).toBe(100);
        });

        it('should calculate statistics for multiple prompts', () => {
            const prompts = [
                'Short',           // ~2 tokens
                'Medium length',   // ~4 tokens
                'A bit longer one', // ~5 tokens
            ];
            
            const result = summarizeTokenBudgets(prompts, 100);
            
            expect(result.totalTokens).toBeGreaterThan(0);
            expect(result.maxTokens).toBeGreaterThanOrEqual(result.minTokens);
            expect(result.avgTokens).toBeGreaterThan(0);
            expect(result.overBudgetCount).toBe(0);
            expect(result.withinBudgetPercent).toBe(100);
        });

        it('should count over-budget prompts', () => {
            const prompts = [
                'a'.repeat(35),  // 10 tokens
                'a'.repeat(350), // 100 tokens
                'a'.repeat(700), // 200 tokens
            ];
            
            const result = summarizeTokenBudgets(prompts, 50);
            
            expect(result.overBudgetCount).toBe(2);
            expect(result.withinBudgetPercent).toBe(33); // 1 of 3 within budget
        });
    });
});
