/**
 * Correlation ID Utilities
 * Implements end-to-end request tracking per AI_AGENT_PROMPT.md
 */

export interface CorrelationContext {
  correlationId: string;
  parentId?: string;
  timestamp: number;
  source: 'frontend' | 'lm-studio' | 'comfyui' | 'story-bible' | 'refine-field' | 'set-vision' | 'story-idea' | 'local-story';
}

export interface NetworkMetadata {
  correlationId: string;
  url: string;
  method: string;
  status?: number;
  duration?: number;
  timestamp: number;
}

/**
 * Ring buffer for network request metadata (browser-side tap)
 * Capped at 100 entries to prevent memory bloat per AI_AGENT_PROMPT.md
 */
class NetworkTapBuffer {
  private buffer: NetworkMetadata[] = [];
  private readonly maxSize = 100;

  add(metadata: NetworkMetadata): void {
    this.buffer.push(metadata);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift(); // Remove oldest
    }
  }

  get(correlationId: string): NetworkMetadata[] {
    return this.buffer.filter(m => m.correlationId === correlationId);
  }

  getAll(): NetworkMetadata[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
  }

  getLast(count: number): NetworkMetadata[] {
    return this.buffer.slice(-count);
  }
}

// Global instance
export const networkTap = new NetworkTapBuffer();

/**
 * Generates a new correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  // Use native crypto.randomUUID() (Node 14.17+, all modern browsers)
  return crypto.randomUUID();
}

/**
 * Creates correlation context for a new request chain
 */
export function createCorrelationContext(
  source: CorrelationContext['source'],
  parentId?: string
): CorrelationContext {
  return {
    correlationId: generateCorrelationId(),
    parentId,
    timestamp: Date.now(),
    source,
  };
}

/**
 * Extracts correlation ID from response headers
 */
export function extractCorrelationId(headers: Headers | Record<string, string>): string | null {
  if (headers instanceof Headers) {
    return headers.get('x-correlation-id') || headers.get('x-request-id');
  }
  return headers['x-correlation-id'] || headers['x-request-id'] || null;
}

/**
 * Adds correlation headers to fetch options
 */
export function withCorrelationHeaders(
  options: RequestInit,
  correlationId: string
): RequestInit {
  return {
    ...options,
    headers: {
      ...options.headers,
      'X-Correlation-ID': correlationId,
      'X-Request-ID': correlationId,
    },
  };
}

/**
 * Logs correlation context (context-efficient per AI_AGENT_PROMPT.md)
 * ASCII-only output
 */
export function logCorrelation(
  context: CorrelationContext,
  message: string,
  data?: Record<string, unknown>
): void {
  const logEntry = {
    corr: context.correlationId.slice(0, 8), // Short ID for logs
    src: context.source,
    msg: message,
    ...(data ? { data } : {}),
  };
  // ASCII-only: no emoji or special chars
  console.log('[CORR]', JSON.stringify(logEntry));
}

/**
 * Validates correlation ID presence in response (tolerant - logs warnings instead of throwing)
 * Per AI_AGENT_PROMPT.md: don't break when backends don't echo headers
 */
export function assertCorrelationId(
  response: Response | { headers?: Record<string, string> },
  expectedId: string
): void {
  const headers = 'headers' in response && response.headers instanceof Headers
    ? response.headers
    : ('headers' in response ? response.headers : {});
    
  const actualId = extractCorrelationId(headers as any);
  
  if (!actualId) {
    console.warn(
      `[CORR] Missing correlation ID in response. Expected: ${expectedId.slice(0, 8)}`
    );
    return; // Don't throw - backend may not support headers
  }
  
  if (actualId !== expectedId) {
    console.warn(
      `[CORR] Correlation ID mismatch. Expected: ${expectedId.slice(0, 8)}, Got: ${actualId.slice(0, 8)}`
    );
  }
}

/**
 * Network tap interceptor for browser requests
 * Captures metadata for correlation analysis
 */
export function interceptRequest(
  url: string,
  method: string,
  correlationId: string
): () => void {
  const startTime = Date.now();
  const metadata: NetworkMetadata = {
    correlationId,
    url,
    method,
    timestamp: startTime,
  };

  // Return completion callback
  return (status?: number) => {
    metadata.status = status;
    metadata.duration = Date.now() - startTime;
    networkTap.add(metadata);
  };
}
