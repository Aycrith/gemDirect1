/**
 * Token API Mock
 * 
 * Provides mock implementations for the Google GenAI countTokens API.
 * Enables testing of token budget validation without making actual API calls.
 * 
 * @module tests/mocks/tokenApiMock
 */

import { vi } from 'vitest';

/**
 * Response structure from countTokens API.
 */
export interface CountTokensResponse {
    totalTokens: number;
    promptTokens?: number;
    cachedContentTokens?: number;
}

/**
 * Mock configuration options.
 */
export interface TokenApiMockOptions {
    /** Fixed token count to return (overrides estimation) */
    fixedTokenCount?: number;
    /** Multiplier to apply to estimated tokens (e.g., 1.1 for +10%) */
    estimationMultiplier?: number;
    /** Simulate API latency in milliseconds */
    latencyMs?: number;
    /** Simulate API timeout after this duration */
    timeoutMs?: number;
    /** Force API error with this message */
    errorMessage?: string;
    /** Enable verbose logging */
    verbose?: boolean;
}

/**
 * Creates a mock countTokens function that simulates the Google GenAI API.
 * 
 * @param options - Mock configuration
 * @returns Mock function compatible with ai.models.countTokens
 * 
 * @example
 * ```typescript
 * const mockCountTokens = createTokenApiMock({ fixedTokenCount: 150 });
 * vi.stubGlobal('countTokens', mockCountTokens);
 * 
 * const result = await mockCountTokens({ text: 'Hello world' });
 * expect(result.totalTokens).toBe(150);
 * ```
 */
export function createTokenApiMock(options: TokenApiMockOptions = {}): 
    (input: { model?: string; contents?: any; text?: string }) => Promise<CountTokensResponse> {
    
    const callLog: Array<{ input: any; result: CountTokensResponse; timestamp: number }> = [];
    
    const mockFn = async (input: { model?: string; contents?: any; text?: string }): Promise<CountTokensResponse> => {
        // Simulate latency
        if (options.latencyMs && options.latencyMs > 0) {
            await new Promise(resolve => setTimeout(resolve, options.latencyMs));
        }
        
        // Simulate timeout
        if (options.timeoutMs && options.timeoutMs > 0) {
            await new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Token API timeout')), options.timeoutMs)
            );
        }
        
        // Simulate error
        if (options.errorMessage) {
            throw new Error(options.errorMessage);
        }
        
        // Calculate token count
        let tokenCount: number;
        
        if (options.fixedTokenCount !== undefined) {
            tokenCount = options.fixedTokenCount;
        } else {
            // Estimate based on text content (4 chars per token)
            const text = extractText(input);
            const estimated = Math.ceil(text.length / 4);
            tokenCount = options.estimationMultiplier 
                ? Math.ceil(estimated * options.estimationMultiplier)
                : estimated;
        }
        
        const result: CountTokensResponse = {
            totalTokens: tokenCount,
            promptTokens: tokenCount,
        };
        
        callLog.push({ input, result, timestamp: Date.now() });
        
        if (options.verbose) {
            console.log('[TokenApiMock]', { input, result });
        }
        
        return result;
    };
    
    // Attach call log for assertions
    (mockFn as any).getCallLog = () => [...callLog];
    (mockFn as any).clearCallLog = () => { callLog.length = 0; };
    
    return mockFn;
}

/**
 * Extracts text content from various input formats.
 */
function extractText(input: { model?: string; contents?: any; text?: string }): string {
    if (input.text) {
        return input.text;
    }
    
    if (input.contents) {
        if (typeof input.contents === 'string') {
            return input.contents;
        }
        if (Array.isArray(input.contents)) {
            return input.contents
                .map(c => {
                    if (typeof c === 'string') return c;
                    if (c.text) return c.text;
                    if (c.parts) {
                        return c.parts.map((p: any) => p.text || '').join(' ');
                    }
                    return JSON.stringify(c);
                })
                .join(' ');
        }
    }
    
    return '';
}

/**
 * Creates a mock that simulates the heuristic fallback behavior.
 * Returns 3.5 chars/token estimation when API fails.
 * 
 * @param text - Text to estimate
 * @returns Estimated token count using fallback heuristic
 */
export function heuristicTokenEstimate(text: string): number {
    return Math.ceil(text.length / 3.5);
}

/**
 * Creates a mock countTokens that uses heuristic estimation.
 * Simulates the fallback path when actual API is unavailable.
 */
export function createHeuristicMock(): 
    (input: { text?: string; contents?: any }) => Promise<CountTokensResponse> {
    
    return async (input) => {
        const text = extractText(input);
        const tokens = heuristicTokenEstimate(text);
        return { totalTokens: tokens, promptTokens: tokens };
    };
}

/**
 * Spy for tracking countTokens calls in tests.
 */
export function createCountTokensSpy() {
    const calls: Array<{ input: any; timestamp: number }> = [];
    
    const spy = vi.fn(async (input: any) => {
        calls.push({ input, timestamp: Date.now() });
        const text = extractText(input);
        const tokens = Math.ceil(text.length / 4);
        return { totalTokens: tokens, promptTokens: tokens };
    });
    
    return {
        spy,
        getCalls: () => [...calls],
        reset: () => {
            calls.length = 0;
            spy.mockClear();
        },
    };
}

/**
 * Test fixture: Sample texts with known token counts.
 */
export const TOKEN_TEST_FIXTURES = {
    /** ~25 tokens (100 chars) */
    short: 'A lone explorer ventures into the ancient ruins, their torch casting dancing shadows on weathered stone.',
    
    /** ~125 tokens (500 chars) */
    medium: `The explorer descended deeper into the forgotten temple, each step echoing through 
corridors that hadn't seen light in centuries. Ancient murals depicted a civilization 
long lost to time, their warnings inscribed in symbols no modern scholar could decipher. 
As she rounded the final corner, her breath caught - before her stood the legendary 
artifact, pulsing with an otherworldly glow that promised power beyond imagination.`,
    
    /** ~500 tokens (2000 chars) */
    long: `In the twilight of a dying empire, three unlikely heroes emerged from the ashes of 
a world transformed. Maya, once a palace scholar, now wandered the broken highways with 
ancient texts strapped to her back - the last repository of forbidden knowledge. By her 
side walked Kael, the disgraced knight whose mechanical arm hummed with salvaged technology 
from the Before Times. And leading them both was Cipher, the enigmatic child who spoke 
in riddles and could see the threads of fate that bound all living things.

Together, they sought the Resonance Engine - a mythical device said to have the power to 
rewrite reality itself. The corrupt Council feared its discovery, sending their chrome-plated 
Enforcers to hunt the trio across continents. But with each narrow escape, Maya decoded 
another fragment of the map hidden in her texts. Kael's arm grew stronger, interfacing with 
ancient terminals that revealed forgotten paths. And Cipher's visions grew clearer, pointing 
toward a destiny none of them could have imagined.

The journey would take them through poisoned forests where trees wept mercury, across bridges 
spanning chasms of pure void, and into the heart of the Singing Mountain where crystals 
hummed with the memories of a million extinct species. Each step brought them closer to 
the truth - and to the terrible choice that awaited at the end of their quest.`,
};
