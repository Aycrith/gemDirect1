/**
 * LLMTransportAdapter - Abstraction layer for LLM communication
 * 
 * Problem Solved:
 * - Gemini SDK bypasses Playwright route interception making mocking impossible
 * - No testable abstraction for LLM calls
 * - Different LLM providers (Gemini, LM Studio) require different request formats
 * - No way to inject mock responses for deterministic testing
 * 
 * Solution:
 * - Abstract transport layer that can be swapped for testing
 * - Mock transport returns predefined responses
 * - Real transports wrap Gemini SDK or OpenAI-compatible APIs
 * - Single interface regardless of backend
 */

import { ErrorCodes, CSGError } from '../types/errors';

// ============================================================================
// TYPES
// ============================================================================

export interface LLMRequest {
    /** Model to use for generation */
    model: string;
    /** The prompt/messages to send */
    messages: LLMMessage[];
    /** Expected response format */
    responseFormat?: 'text' | 'json';
    /** JSON schema for structured output (when responseFormat is 'json') */
    schema?: Record<string, unknown>;
    /** Temperature for generation */
    temperature?: number;
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Request metadata for logging */
    metadata?: {
        context?: string;
        correlationId?: string;
    };
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    /** The generated text */
    text: string;
    /** Parsed JSON if responseFormat was 'json' */
    json?: unknown;
    /** Token usage */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    /** Model that was actually used */
    model: string;
    /** Time taken for the request in ms */
    durationMs: number;
}

export interface LLMTransport {
    /** Unique identifier for this transport */
    id: string;
    /** Human-readable name */
    name: string;
    /** Send a request and get a response */
    send(request: LLMRequest): Promise<LLMResponse>;
    /** Check if the transport is available/configured */
    isAvailable(): Promise<boolean>;
    /** Get transport status for debugging */
    getStatus(): TransportStatus;
}

export interface TransportStatus {
    available: boolean;
    lastError?: string;
    lastRequestTime?: number;
    requestCount: number;
}

// ============================================================================
// MOCK TRANSPORT - For testing
// ============================================================================

export interface MockResponse {
    /** Pattern to match against request (regex or function) */
    match: RegExp | ((request: LLMRequest) => boolean);
    /** Response to return */
    response: Partial<LLMResponse> & { text: string };
    /** Delay before responding (simulates network latency) */
    delayMs?: number;
    /** Should this mock be consumed after use (one-shot) */
    once?: boolean;
}

export class MockLLMTransport implements LLMTransport {
    readonly id = 'mock';
    readonly name = 'Mock Transport (Testing)';
    
    private responses: MockResponse[] = [];
    private defaultResponse: LLMResponse = {
        text: '{}',
        json: {},
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'mock-model',
        durationMs: 50,
    };
    private status: TransportStatus = {
        available: true,
        requestCount: 0,
    };
    private requestLog: LLMRequest[] = [];

    /**
     * Add a mock response
     */
    addResponse(mock: MockResponse): this {
        this.responses.push(mock);
        return this;
    }

    /**
     * Set the default response when no mock matches
     */
    setDefaultResponse(response: LLMResponse): this {
        this.defaultResponse = response;
        return this;
    }

    /**
     * Clear all mocks
     */
    clearResponses(): this {
        this.responses = [];
        return this;
    }

    /**
     * Get all requests made to this transport
     */
    getRequestLog(): LLMRequest[] {
        return [...this.requestLog];
    }

    /**
     * Clear request log
     */
    clearRequestLog(): this {
        this.requestLog = [];
        return this;
    }

    async send(request: LLMRequest): Promise<LLMResponse> {
        const startTime = Date.now();
        this.requestLog.push(request);
        this.status.requestCount++;
        this.status.lastRequestTime = startTime;

        // Find matching mock
        let matchedMock: MockResponse | undefined;
        let matchIndex = -1;
        for (let i = 0; i < this.responses.length; i++) {
            const mock = this.responses[i];
            if (!mock) continue;
            
            const matches = typeof mock.match === 'function'
                ? mock.match(request)
                : mock.match.test(JSON.stringify(request.messages));
            
            if (matches) {
                matchedMock = mock;
                matchIndex = i;
                break;
            }
        }

        // Use matched mock or default
        let response: LLMResponse;
        if (matchedMock) {
            // Simulate delay
            if (matchedMock.delayMs) {
                await new Promise(resolve => setTimeout(resolve, matchedMock.delayMs));
            }

            response = {
                ...this.defaultResponse,
                ...matchedMock.response,
                durationMs: Date.now() - startTime,
            };

            // Remove if one-shot
            if (matchedMock.once && matchIndex >= 0) {
                this.responses.splice(matchIndex, 1);
            }
        } else {
            response = {
                ...this.defaultResponse,
                durationMs: Date.now() - startTime,
            };
        }

        // Parse JSON if requested
        if (request.responseFormat === 'json' && !response.json) {
            try {
                response.json = JSON.parse(response.text);
            } catch {
                // Leave json undefined if parsing fails
            }
        }

        return response;
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }

    getStatus(): TransportStatus {
        return { ...this.status };
    }
}

// ============================================================================
// GEMINI TRANSPORT - Real Gemini SDK wrapper
// ============================================================================

export class GeminiTransport implements LLMTransport {
    readonly id = 'gemini';
    readonly name = 'Google Gemini';
    
    private status: TransportStatus = {
        available: false,
        requestCount: 0,
    };

    async send(request: LLMRequest): Promise<LLMResponse> {
        const startTime = Date.now();
        
        try {
            // Dynamic import to avoid loading SDK in tests
            const { GoogleGenAI } = await import('@google/genai');
            
            const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
            if (!apiKey) {
                throw new CSGError(ErrorCodes.LLM_API_KEY_INVALID, {
                    message: 'Gemini API key not configured',
                });
            }

            const ai = new GoogleGenAI({ apiKey });

            // Convert messages to Gemini format
            const contents = request.messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }],
                }));

            // Add system instruction if present
            const systemMessage = request.messages.find(m => m.role === 'system');
            
            const config: Record<string, unknown> = {};
            if (request.temperature !== undefined) {
                config.temperature = request.temperature;
            }
            if (request.maxTokens !== undefined) {
                config.maxOutputTokens = request.maxTokens;
            }
            if (request.responseFormat === 'json') {
                config.responseMimeType = 'application/json';
                if (request.schema) {
                    config.responseSchema = request.schema;
                }
            }
            
            // System instruction goes in config for the Gemini SDK
            if (systemMessage?.content) {
                config.systemInstruction = systemMessage.content;
            }

            const response = await ai.models.generateContent({
                model: request.model,
                contents,
                config,
            });

            const text = response.text || '';
            
            this.status.available = true;
            this.status.requestCount++;
            this.status.lastRequestTime = startTime;

            const result: LLMResponse = {
                text,
                model: request.model,
                durationMs: Date.now() - startTime,
                usage: {
                    promptTokens: response.usageMetadata?.promptTokenCount || 0,
                    completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
                    totalTokens: response.usageMetadata?.totalTokenCount || 0,
                },
            };

            if (request.responseFormat === 'json') {
                try {
                    result.json = JSON.parse(text);
                } catch {
                    throw new CSGError(ErrorCodes.LLM_PARSE_ERROR, {
                        message: 'Failed to parse JSON response from Gemini',
                        text: text.slice(0, 200),
                    });
                }
            }

            return result;

        } catch (error) {
            this.status.lastError = error instanceof Error ? error.message : String(error);
            
            if (error instanceof CSGError) {
                throw error;
            }

            // Map common errors to CSGError
            const message = error instanceof Error ? error.message.toLowerCase() : '';
            if (message.includes('429') || message.includes('quota') || message.includes('resource_exhausted')) {
                throw new CSGError(ErrorCodes.LLM_RATE_LIMIT, {
                    message: 'Gemini API rate limit exceeded',
                    originalError: error instanceof Error ? error.message : String(error),
                });
            }
            if (message.includes('timeout')) {
                throw new CSGError(ErrorCodes.LLM_TIMEOUT, {
                    message: 'Gemini API request timed out',
                });
            }

            throw new CSGError(ErrorCodes.LLM_CONNECTION_FAILED, {
                message: 'Gemini API request failed',
                originalError: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async isAvailable(): Promise<boolean> {
        const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
        return !!apiKey;
    }

    getStatus(): TransportStatus {
        return { ...this.status };
    }
}

// ============================================================================
// OPENAI-COMPATIBLE TRANSPORT - For LM Studio and similar
// ============================================================================

export interface OpenAICompatibleConfig {
    baseUrl: string;
    model?: string;
    apiKey?: string;
}

export class OpenAICompatibleTransport implements LLMTransport {
    readonly id: string;
    readonly name: string;
    
    private config: OpenAICompatibleConfig;
    private status: TransportStatus = {
        available: false,
        requestCount: 0,
    };

    constructor(config: OpenAICompatibleConfig, id?: string, name?: string) {
        this.config = config;
        this.id = id || 'openai-compatible';
        this.name = name || `OpenAI Compatible (${config.baseUrl})`;
    }

    async send(request: LLMRequest): Promise<LLMResponse> {
        const startTime = Date.now();
        
        try {
            const messages = request.messages.map(m => ({
                role: m.role,
                content: m.content,
            }));

            const body: Record<string, unknown> = {
                model: request.model || this.config.model || 'default',
                messages,
            };

            if (request.temperature !== undefined) {
                body.temperature = request.temperature;
            }
            if (request.maxTokens !== undefined) {
                body.max_tokens = request.maxTokens;
            }
            if (request.responseFormat === 'json') {
                body.response_format = { type: 'json_object' };
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (this.config.apiKey) {
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }

            const response = await fetch(this.config.baseUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';

            this.status.available = true;
            this.status.requestCount++;
            this.status.lastRequestTime = startTime;

            const result: LLMResponse = {
                text,
                model: data.model || request.model,
                durationMs: Date.now() - startTime,
                usage: data.usage ? {
                    promptTokens: data.usage.prompt_tokens || 0,
                    completionTokens: data.usage.completion_tokens || 0,
                    totalTokens: data.usage.total_tokens || 0,
                } : undefined,
            };

            if (request.responseFormat === 'json') {
                try {
                    result.json = JSON.parse(text);
                } catch {
                    throw new CSGError(ErrorCodes.LLM_PARSE_ERROR, {
                        message: 'Failed to parse JSON response',
                        text: text.slice(0, 200),
                    });
                }
            }

            return result;

        } catch (error) {
            this.status.lastError = error instanceof Error ? error.message : String(error);
            
            if (error instanceof CSGError) {
                throw error;
            }

            throw new CSGError(ErrorCodes.LLM_CONNECTION_FAILED, {
                message: `${this.name} request failed`,
                originalError: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            // Try a simple health check
            const response = await fetch(this.config.baseUrl.replace('/v1/chat/completions', '/v1/models'), {
                method: 'GET',
                headers: this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {},
            });
            this.status.available = response.ok;
            return response.ok;
        } catch {
            this.status.available = false;
            return false;
        }
    }

    getStatus(): TransportStatus {
        return { ...this.status };
    }
}

// ============================================================================
// TRANSPORT REGISTRY
// ============================================================================

let activeTransport: LLMTransport | null = null;
const transports = new Map<string, LLMTransport>();

/**
 * Register a transport
 */
export function registerTransport(transport: LLMTransport): void {
    transports.set(transport.id, transport);
}

/**
 * Get a transport by ID
 */
export function getTransport(id: string): LLMTransport | undefined {
    return transports.get(id);
}

/**
 * Set the active transport for LLM calls
 */
export function setActiveTransport(transport: LLMTransport | string): void {
    if (typeof transport === 'string') {
        const t = transports.get(transport);
        if (!t) {
            throw new Error(`Transport '${transport}' not registered`);
        }
        activeTransport = t;
    } else {
        activeTransport = transport;
        transports.set(transport.id, transport);
    }
}

/**
 * Get the currently active transport
 */
export function getActiveTransport(): LLMTransport {
    if (!activeTransport) {
        // Default to Gemini if not set
        activeTransport = new GeminiTransport();
        transports.set(activeTransport.id, activeTransport);
    }
    return activeTransport;
}

/**
 * Reset transport registry (for testing)
 */
export function resetTransports(): void {
    transports.clear();
    activeTransport = null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a mock transport for testing
 */
export function createMockTransport(): MockLLMTransport {
    return new MockLLMTransport();
}

/**
 * Create an LM Studio transport
 */
export function createLMStudioTransport(
    baseUrl: string = 'http://localhost:1234/v1/chat/completions',
    model?: string
): OpenAICompatibleTransport {
    return new OpenAICompatibleTransport(
        { baseUrl, model },
        'lm-studio',
        'LM Studio'
    );
}

/**
 * Simple wrapper for sending an LLM request using the active transport
 */
export async function sendLLMRequest(request: LLMRequest): Promise<LLMResponse> {
    return getActiveTransport().send(request);
}
