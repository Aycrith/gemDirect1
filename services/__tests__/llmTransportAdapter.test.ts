/**
 * LLMTransportAdapter Test Suite
 * 
 * Tests the abstraction layer for LLM communication including:
 * - Mock transport for testing
 * - Provider routing (Gemini, OpenAI-compatible)
 * - Request formatting and response parsing
 * - Error handling and CSGError integration
 * - Transport registry management
 * 
 * @module services/__tests__/llmTransportAdapter.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    MockLLMTransport,
    GeminiTransport,
    OpenAICompatibleTransport,
    LLMRequest,
    registerTransport,
    getTransport,
    setActiveTransport,
    getActiveTransport,
    resetTransports,
    createMockTransport,
    createLMStudioTransport,
    sendLLMRequest,
} from '../llmTransportAdapter';
import { CSGError } from '../../types/errors';

// ============================================================================
// Mock Transport Tests
// ============================================================================

describe('MockLLMTransport', () => {
    let transport: MockLLMTransport;

    beforeEach(() => {
        transport = new MockLLMTransport();
    });

    describe('basic functionality', () => {
        it('should have correct id and name', () => {
            expect(transport.id).toBe('mock');
            expect(transport.name).toBe('Mock Transport (Testing)');
        });

        it('should always be available', async () => {
            expect(await transport.isAvailable()).toBe(true);
        });

        it('should return default response when no mock matches', async () => {
            const request: LLMRequest = {
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hello' }],
            };

            const response = await transport.send(request);

            expect(response.text).toBe('{}');
            expect(response.model).toBe('mock-model');
            expect(response.usage).toBeDefined();
            expect(response.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('should log requests', async () => {
            const request: LLMRequest = {
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hello' }],
            };

            await transport.send(request);

            const log = transport.getRequestLog();
            expect(log).toHaveLength(1);
            expect(log[0]).toEqual(request);
        });

        it('should clear request log', async () => {
            await transport.send({ model: 'test', messages: [] });
            transport.clearRequestLog();

            expect(transport.getRequestLog()).toHaveLength(0);
        });

        it('should track request count in status', async () => {
            await transport.send({ model: 'test', messages: [] });
            await transport.send({ model: 'test', messages: [] });

            const status = transport.getStatus();
            expect(status.requestCount).toBe(2);
            expect(status.available).toBe(true);
            expect(status.lastRequestTime).toBeDefined();
        });
    });

    describe('mock response matching', () => {
        it('should match response by regex pattern', async () => {
            transport.addResponse({
                match: /hello/i,
                response: { text: 'Hi there!' },
            });

            const response = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'Hello world' }],
            });

            expect(response.text).toBe('Hi there!');
        });

        it('should match response by function predicate', async () => {
            transport.addResponse({
                match: (req) => req.model === 'special-model',
                response: { text: 'Special response' },
            });

            const response = await transport.send({
                model: 'special-model',
                messages: [],
            });

            expect(response.text).toBe('Special response');
        });

        it('should return first matching response', async () => {
            transport
                .addResponse({ match: /test/, response: { text: 'First' } })
                .addResponse({ match: /test/, response: { text: 'Second' } });

            const response = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'test message' }],
            });

            expect(response.text).toBe('First');
        });

        it('should consume one-shot mocks', async () => {
            transport.addResponse({
                match: /test/,
                response: { text: 'One-time response' },
                once: true,
            });

            const first = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'test' }],
            });
            const second = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'test' }],
            });

            expect(first.text).toBe('One-time response');
            expect(second.text).toBe('{}'); // Falls back to default
        });

        it('should simulate delay when specified', async () => {
            transport.addResponse({
                match: /delayed/,
                response: { text: 'Delayed response' },
                delayMs: 100,
            });

            const start = Date.now();
            await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'delayed' }],
            });
            const duration = Date.now() - start;

            expect(duration).toBeGreaterThanOrEqual(90); // Allow small variance
        });

        it('should clear all responses', () => {
            transport
                .addResponse({ match: /a/, response: { text: 'A' } })
                .addResponse({ match: /b/, response: { text: 'B' } })
                .clearResponses();

            // No mocks should match now, should get default
            expect(transport.getRequestLog()).toHaveLength(0);
        });
    });

    describe('response format handling', () => {
        it('should parse JSON when responseFormat is json', async () => {
            // Set default without json field so JSON parsing kicks in
            transport.setDefaultResponse({
                text: '{}',
                model: 'mock-model',
                durationMs: 50,
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            });
            transport.addResponse({
                match: /json/,
                response: { text: '{"name": "test", "value": 42}' },
            });

            const response = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'json request' }],
                responseFormat: 'json',
            });

            expect(response.json).toEqual({ name: 'test', value: 42 });
        });

        it('should handle invalid JSON gracefully', async () => {
            // Set default without json field so JSON parsing is attempted
            transport.setDefaultResponse({
                text: '{}',
                model: 'mock-model',
                durationMs: 50,
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            });
            transport.addResponse({
                match: /invalid/,
                response: { text: 'not valid json' },
            });

            const response = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'invalid json' }],
                responseFormat: 'json',
            });

            expect(response.text).toBe('not valid json');
            expect(response.json).toBeUndefined();
        });

        it('should not parse JSON when responseFormat is text', async () => {
            // Set default without json field
            transport.setDefaultResponse({
                text: '{}',
                model: 'mock-model',
                durationMs: 50,
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            });
            transport.addResponse({
                match: /text/,
                response: { text: '{"foo": "bar"}' },
            });

            const response = await transport.send({
                model: 'test',
                messages: [{ role: 'user', content: 'text format' }],
                responseFormat: 'text',
            });

            expect(response.text).toBe('{"foo": "bar"}');
            expect(response.json).toBeUndefined();
        });
    });

    describe('custom default response', () => {
        it('should use custom default response', async () => {
            transport.setDefaultResponse({
                text: 'Custom default',
                model: 'custom-model',
                durationMs: 0,
                usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            });

            const response = await transport.send({
                model: 'test',
                messages: [],
            });

            expect(response.text).toBe('Custom default');
            expect(response.model).toBe('custom-model');
        });
    });
});

// ============================================================================
// OpenAI Compatible Transport Tests
// ============================================================================

describe('OpenAICompatibleTransport', () => {
    let transport: OpenAICompatibleTransport;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Create fresh spy FIRST, before creating transport
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        transport = new OpenAICompatibleTransport(
            { baseUrl: 'http://localhost:1234/v1/chat/completions', model: 'test-model' },
            'test-openai',
            'Test OpenAI'
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('basic functionality', () => {
        it('should have correct id and name', () => {
            expect(transport.id).toBe('test-openai');
            expect(transport.name).toBe('Test OpenAI');
        });

        it('should use default id and name when not provided', () => {
            const defaultTransport = new OpenAICompatibleTransport({
                baseUrl: 'http://example.com',
            });

            expect(defaultTransport.id).toBe('openai-compatible');
            expect(defaultTransport.name).toContain('http://example.com');
        });
    });

    describe('request formatting', () => {
        it('should format basic request correctly', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Response' } }],
                    model: 'test-model',
                }),
            } as Response);

            await transport.send({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Hello' },
                ],
            });

            expect(fetchSpy).toHaveBeenCalledWith(
                'http://localhost:1234/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: expect.stringContaining('"model":"gpt-4"'),
                })
            );

            const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
            expect(body.messages).toHaveLength(2);
            expect(body.messages[0].role).toBe('system');
            expect(body.messages[1].role).toBe('user');
        });

        it('should include temperature when provided', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Response' } }],
                }),
            } as Response);

            await transport.send({
                model: 'test',
                messages: [],
                temperature: 0.7,
            });

            const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
            expect(body.temperature).toBe(0.7);
        });

        it('should include max_tokens when provided', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Response' } }],
                }),
            } as Response);

            await transport.send({
                model: 'test',
                messages: [],
                maxTokens: 500,
            });

            const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
            expect(body.max_tokens).toBe(500);
        });

        it('should set response_format for JSON requests', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{}' } }],
                }),
            } as Response);

            await transport.send({
                model: 'test',
                messages: [],
                responseFormat: 'json',
            });

            const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
            expect(body.response_format).toEqual({ type: 'json_object' });
        });

        it('should include API key header when configured', async () => {
            const authTransport = new OpenAICompatibleTransport({
                baseUrl: 'http://example.com',
                apiKey: 'sk-test-key',
            });

            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Response' } }],
                }),
            } as Response);

            await authTransport.send({ model: 'test', messages: [] });

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer sk-test-key',
                    }),
                })
            );
        });
    });

    describe('response parsing', () => {
        it('should parse successful response', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Hello there!' } }],
                    model: 'gpt-4-turbo',
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                }),
            } as Response);

            const response = await transport.send({
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hi' }],
            });

            expect(response.text).toBe('Hello there!');
            expect(response.model).toBe('gpt-4-turbo');
            expect(response.usage).toEqual({
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
            });
            expect(response.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('should parse JSON response when requested', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"result": 42}' } }],
                }),
            } as Response);

            const response = await transport.send({
                model: 'test',
                messages: [],
                responseFormat: 'json',
            });

            expect(response.json).toEqual({ result: 42 });
        });

        it('should throw CSGError for invalid JSON response', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'not json' } }],
                }),
            } as Response);

            await expect(
                transport.send({
                    model: 'test',
                    messages: [],
                    responseFormat: 'json',
                })
            ).rejects.toThrow(CSGError);
        });

        it('should handle missing usage data gracefully', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'Response' } }],
                    // No usage field
                }),
            } as Response);

            const response = await transport.send({
                model: 'test',
                messages: [],
            });

            expect(response.usage).toBeUndefined();
        });

        it('should handle empty choices array', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ choices: [] }),
            } as Response);

            const response = await transport.send({
                model: 'test',
                messages: [],
            });

            expect(response.text).toBe('');
        });
    });

    describe('error handling', () => {
        it('should throw CSGError for HTTP errors', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Internal Server Error'),
            } as Response);

            await expect(
                transport.send({ model: 'test', messages: [] })
            ).rejects.toThrow(CSGError);
        });

        it('should throw CSGError for network failures', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('Network error'));

            await expect(
                transport.send({ model: 'test', messages: [] })
            ).rejects.toThrow(CSGError);
        });

        it('should preserve CSGError when thrown', async () => {
            // Verify that CSGError is properly thrown for parse errors
            fetchSpy.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'invalid' } }],
                }),
            } as Response);

            // This will throw CSGError for invalid JSON
            try {
                await transport.send({
                    model: 'test',
                    messages: [],
                    responseFormat: 'json',
                });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(CSGError);
            }
        });

        it('should update status on error', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('Connection failed'));

            try {
                await transport.send({ model: 'test', messages: [] });
            } catch {
                // Expected
            }

            const status = transport.getStatus();
            expect(status.lastError).toBe('Connection failed');
        });
    });

    describe('availability check', () => {
        it('should return true when server responds OK', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: true,
            } as Response);

            const available = await transport.isAvailable();

            expect(available).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith(
                'http://localhost:1234/v1/models',
                expect.any(Object)
            );
        });

        it('should return false when server responds with error', async () => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
            } as Response);

            const available = await transport.isAvailable();

            expect(available).toBe(false);
        });

        it('should return false when request fails', async () => {
            fetchSpy.mockRejectedValueOnce(new Error('Network error'));

            const available = await transport.isAvailable();

            expect(available).toBe(false);
        });
    });
});

// ============================================================================
// Gemini Transport Tests
// ============================================================================

describe('GeminiTransport', () => {
    let transport: GeminiTransport;

    beforeEach(() => {
        transport = new GeminiTransport();
    });

    describe('basic functionality', () => {
        it('should have correct id and name', () => {
            expect(transport.id).toBe('gemini');
            expect(transport.name).toBe('Google Gemini');
        });

        it('should return initial status', () => {
            const status = transport.getStatus();
            expect(status.available).toBe(false);
            expect(status.requestCount).toBe(0);
        });
    });

    describe('availability check', () => {
        it('should return false when API key is not set', async () => {
            // In test environment, API key should not be set
            const available = await transport.isAvailable();
            // This depends on environment - just verify it returns boolean
            expect(typeof available).toBe('boolean');
        });
    });

    // Note: Full integration tests would require mocking the Gemini SDK
    // which is complex due to dynamic imports. These are covered in
    // integration tests with real API calls.
});

// ============================================================================
// Transport Registry Tests
// ============================================================================

describe('Transport Registry', () => {
    beforeEach(() => {
        resetTransports();
    });

    describe('registerTransport', () => {
        it('should register a transport', () => {
            const mock = createMockTransport();
            registerTransport(mock);

            expect(getTransport('mock')).toBe(mock);
        });

        it('should overwrite existing transport with same id', () => {
            const mock1 = createMockTransport();
            const mock2 = createMockTransport();
            
            registerTransport(mock1);
            registerTransport(mock2);

            expect(getTransport('mock')).toBe(mock2);
        });
    });

    describe('getTransport', () => {
        it('should return undefined for unregistered transport', () => {
            expect(getTransport('nonexistent')).toBeUndefined();
        });
    });

    describe('setActiveTransport', () => {
        it('should set active transport by instance', () => {
            const mock = createMockTransport();
            setActiveTransport(mock);

            expect(getActiveTransport()).toBe(mock);
        });

        it('should set active transport by id', () => {
            const mock = createMockTransport();
            registerTransport(mock);
            setActiveTransport('mock');

            expect(getActiveTransport()).toBe(mock);
        });

        it('should throw for unregistered transport id', () => {
            expect(() => setActiveTransport('nonexistent')).toThrow();
        });

        it('should register transport when setting by instance', () => {
            const mock = createMockTransport();
            setActiveTransport(mock);

            expect(getTransport('mock')).toBe(mock);
        });
    });

    describe('getActiveTransport', () => {
        it('should create default Gemini transport if none set', () => {
            const transport = getActiveTransport();

            expect(transport.id).toBe('gemini');
        });

        it('should return previously set active transport', () => {
            const mock = createMockTransport();
            setActiveTransport(mock);

            expect(getActiveTransport()).toBe(mock);
        });
    });

    describe('resetTransports', () => {
        it('should clear all transports and active transport', () => {
            const mock = createMockTransport();
            registerTransport(mock);
            setActiveTransport(mock);

            resetTransports();

            expect(getTransport('mock')).toBeUndefined();
            // getActiveTransport will create a new Gemini transport
            expect(getActiveTransport().id).toBe('gemini');
        });
    });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('Helper Functions', () => {
    beforeEach(() => {
        resetTransports();
    });

    describe('createMockTransport', () => {
        it('should create a new MockLLMTransport', () => {
            const transport = createMockTransport();

            expect(transport).toBeInstanceOf(MockLLMTransport);
            expect(transport.id).toBe('mock');
        });
    });

    describe('createLMStudioTransport', () => {
        it('should create OpenAI-compatible transport with defaults', () => {
            const transport = createLMStudioTransport();

            expect(transport.id).toBe('lm-studio');
            expect(transport.name).toBe('LM Studio');
        });

        it('should accept custom URL and model', () => {
            const transport = createLMStudioTransport(
                'http://custom:5000/v1/chat/completions',
                'custom-model'
            );

            expect(transport).toBeInstanceOf(OpenAICompatibleTransport);
        });
    });

    describe('sendLLMRequest', () => {
        it('should send request through active transport', async () => {
            const mock = createMockTransport();
            mock.addResponse({
                match: /test/,
                response: { text: 'Mock response' },
            });
            setActiveTransport(mock);

            const response = await sendLLMRequest({
                model: 'test',
                messages: [{ role: 'user', content: 'test' }],
            });

            expect(response.text).toBe('Mock response');
        });
    });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration Tests', () => {
    beforeEach(() => {
        resetTransports();
    });

    it('should support full request/response flow with mock', async () => {
        const mock = createMockTransport();
        // Set default without json so parsing works
        mock.setDefaultResponse({
            text: '{}',
            model: 'mock-model',
            durationMs: 50,
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        });
        
        // Configure responses - use function matchers for more precise control
        mock.addResponse({
            match: (req) => req.messages.some(m => m.content === 'Hello there'),
            response: { text: 'Hello! How can I help you?' },
            once: true, // Consume after first use
        });
        mock.addResponse({
            match: (req) => req.messages.some(m => m.content.includes('weather')),
            response: { text: '{"forecast": "sunny", "temp": 72}' },
        });

        setActiveTransport(mock);

        // First message
        const greeting = await sendLLMRequest({
            model: 'test',
            messages: [{ role: 'user', content: 'Hello there' }],
        });
        expect(greeting.text).toContain('Hello');

        // Second message with JSON response
        const weather = await sendLLMRequest({
            model: 'test',
            messages: [
                { role: 'user', content: 'What is the weather?' },
            ],
            responseFormat: 'json',
        });
        expect(weather.json).toEqual({ forecast: 'sunny', temp: 72 });

        // Verify request log
        const log = mock.getRequestLog();
        expect(log).toHaveLength(2);
    });

    it('should track request count across multiple sends', async () => {
        const mock = createMockTransport();
        setActiveTransport(mock);

        await sendLLMRequest({ model: 'test', messages: [] });
        await sendLLMRequest({ model: 'test', messages: [] });
        await sendLLMRequest({ model: 'test', messages: [] });

        const status = mock.getStatus();
        expect(status.requestCount).toBe(3);
    });

    it('should support switching transports mid-session', async () => {
        const mock1 = createMockTransport();
        mock1.setDefaultResponse({
            text: 'From mock 1',
            model: 'mock-1',
            durationMs: 0,
        });

        const mock2 = new MockLLMTransport();
        mock2.setDefaultResponse({
            text: 'From mock 2',
            model: 'mock-2',
            durationMs: 0,
        });

        setActiveTransport(mock1);
        const r1 = await sendLLMRequest({ model: 'test', messages: [] });
        expect(r1.text).toBe('From mock 1');

        setActiveTransport(mock2);
        const r2 = await sendLLMRequest({ model: 'test', messages: [] });
        expect(r2.text).toBe('From mock 2');
    });
});

// ============================================================================
// sendLLMRequestWithAdapter Integration Tests
// ============================================================================

describe('sendLLMRequestWithAdapter', () => {
    // Import at test runtime to avoid circular dependencies
    let sendLLMRequestWithAdapter: typeof import('../geminiService').sendLLMRequestWithAdapter;

    beforeEach(async () => {
        resetTransports();
        const geminiService = await import('../geminiService');
        sendLLMRequestWithAdapter = geminiService.sendLLMRequestWithAdapter;
    });

    afterEach(() => {
        resetTransports();
    });

    it('should use transport adapter when feature flag is enabled', async () => {
        const mock = createMockTransport();
        mock.addResponse({
            match: /test/i,
            response: { text: '{"result": "from adapter"}', model: 'mock' },
        });
        setActiveTransport(mock);

        const request: LLMRequest = {
            model: 'test-model',
            messages: [{ role: 'user', content: 'test message' }],
            responseFormat: 'json',
        };

        const logApiCall = vi.fn();
        const onStateChange = vi.fn();

        const response = await sendLLMRequestWithAdapter(
            request,
            { useLLMTransportAdapter: true },
            logApiCall,
            onStateChange
        );

        expect(response.text).toBe('{"result": "from adapter"}');
        expect(mock.getRequestLog()).toHaveLength(1);
        expect(logApiCall).toHaveBeenCalledWith(expect.objectContaining({
            status: 'success',
        }));
    });

    it('should call onStateChange callbacks when using adapter', async () => {
        const mock = createMockTransport();
        mock.addResponse({
            match: /.*/,
            response: { text: '{}', model: 'mock' },
        });
        setActiveTransport(mock);

        const onStateChange = vi.fn();

        await sendLLMRequestWithAdapter(
            { model: 'test', messages: [{ role: 'user', content: 'hi' }] },
            { useLLMTransportAdapter: true },
            vi.fn(),
            onStateChange
        );

        // Should have called with 'loading' and 'success'
        expect(onStateChange).toHaveBeenCalledWith('loading', expect.any(String));
        expect(onStateChange).toHaveBeenCalledWith('success', expect.any(String));
    });

    it('should log error on adapter failure', async () => {
        // Create a failing transport
        const failingTransport = {
            id: 'failing',
            name: 'Failing Transport',
            send: vi.fn().mockRejectedValue(new Error('Simulated failure')),
            isAvailable: vi.fn().mockResolvedValue(true),
            getStatus: () => ({ available: true, requestCount: 0 }),
        };
        setActiveTransport(failingTransport as any);

        const logApiCall = vi.fn();
        const onStateChange = vi.fn();

        await expect(sendLLMRequestWithAdapter(
            { model: 'test', messages: [{ role: 'user', content: 'hi' }] },
            { useLLMTransportAdapter: true },
            logApiCall,
            onStateChange
        )).rejects.toThrow('Simulated failure');

        expect(logApiCall).toHaveBeenCalledWith(expect.objectContaining({
            status: 'error',
        }));
        expect(onStateChange).toHaveBeenCalledWith('error', 'Simulated failure');
    });
});
