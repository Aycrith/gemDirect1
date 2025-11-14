/**
 * Real-Time Telemetry Service
 * 
 * Manages WebSocket connection to ComfyUI telemetry endpoint and handles
 * real-time telemetry updates during scene generation.
 */

export interface RealtimeTelemetryUpdate {
    sceneId: string;
    timestamp: number;
    duration?: number;
    attempts?: number;
    gpuVramFree?: number;
    gpuUtilization?: number;
    status: 'queued' | 'executing' | 'completed' | 'failed';
    gpuName?: string;
    vramDelta?: number;
}

export interface TelemetryStreamOptions {
    baseUrl?: string;
    bufferMs?: number;
    reconnectAttempts?: number;
    reconnectDelay?: number;
    debug?: boolean;
}

export interface TelemetryStreamCallbacks {
    onUpdate?: (telemetry: RealtimeTelemetryUpdate) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
}

/**
 * TelemetryStreamManager handles WebSocket connection and message parsing
 */
export class TelemetryStreamManager {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private reconnectCount: number = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private options: Required<TelemetryStreamOptions>;
    private callbacks: TelemetryStreamCallbacks;
    private bufferedUpdate: RealtimeTelemetryUpdate | null = null;
    private bufferTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: TelemetryStreamOptions = {}, callbacks: TelemetryStreamCallbacks = {}) {
        this.options = {
            baseUrl: options.baseUrl || this.detectBaseUrl(),
            bufferMs: options.bufferMs ?? 200,
            reconnectAttempts: options.reconnectAttempts ?? 5,
            reconnectDelay: options.reconnectDelay ?? 1000,
            debug: options.debug ?? false
        };
        this.callbacks = callbacks;
    }

    /**
     * Detect the base URL for the ComfyUI server
     */
    private detectBaseUrl(): string {
        if (typeof window === 'undefined') {
            return 'http://127.0.0.1:8188';
        }

        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const host = window.location.host;

        // Try current host first, then fall back to local ComfyUI
        return `${protocol}//${host}` || `${protocol}//127.0.0.1:8188`;
    }

    /**
     * Get WebSocket URL from base HTTP URL
     */
    private getWebSocketUrl(): string {
        const baseUrl = this.options.baseUrl;
        const protocol = baseUrl.startsWith('https:') ? 'wss:' : 'ws:';
        const host = baseUrl.replace(/^https?:\/\//, '');
        return `${protocol}//${host}/telemetry`;
    }

    /**
     * Log debug messages if debug mode enabled
     */
    private debug(message: string, data?: unknown): void {
        if (this.options.debug) {
            console.log(`[TelemetryStreamManager] ${message}`, data);
        }
    }

    /**
     * Connect to telemetry WebSocket
     */
    public connect(): void {
        if (this.isConnected || this.ws?.readyState === WebSocket.CONNECTING) {
            this.debug('Already connected or connecting');
            return;
        }

        this.debug('Connecting to telemetry stream');

        try {
            const wsUrl = this.getWebSocketUrl();
            this.debug('WebSocket URL', wsUrl);

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.debug('Connected to telemetry stream');
                this.isConnected = true;
                this.reconnectCount = 0;
                this.callbacks.onConnect?.();
            };

            this.ws.onmessage = (event) => {
                try {
                    const update: RealtimeTelemetryUpdate = JSON.parse(event.data);
                    this.debug('Received telemetry update', update);
                    this.handleUpdate(update);
                } catch (error) {
                    this.debug('Error parsing message', error);
                    const err = new Error(`Failed to parse telemetry message: ${error}`);
                    this.callbacks.onError?.(err);
                }
            };

            this.ws.onerror = (event) => {
                this.debug('WebSocket error', event);
                const error = new Error('WebSocket connection error');
                this.callbacks.onError?.(error);
            };

            this.ws.onclose = () => {
                this.debug('Disconnected from telemetry stream');
                this.isConnected = false;
                this.callbacks.onDisconnect?.();

                // Attempt reconnection with exponential backoff
                if (this.reconnectCount < this.options.reconnectAttempts) {
                    this.reconnectCount += 1;
                    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectCount - 1);
                    this.debug(`Reconnecting in ${delay}ms (attempt ${this.reconnectCount}/${this.options.reconnectAttempts})`);

                    this.reconnectTimer = setTimeout(() => {
                        this.connect();
                    }, delay);
                } else {
                    const error = new Error(`Failed to connect after ${this.options.reconnectAttempts} attempts`);
                    this.callbacks.onError?.(error);
                }
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.debug('Error creating WebSocket', err);
            this.callbacks.onError?.(err);
        }
    }

    /**
     * Handle incoming telemetry update with buffering
     */
    private handleUpdate(update: RealtimeTelemetryUpdate): void {
        this.bufferedUpdate = update;

        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
        }

        this.bufferTimer = setTimeout(() => {
            if (this.bufferedUpdate) {
                this.callbacks.onUpdate?.(this.bufferedUpdate);
                this.bufferedUpdate = null;
            }
        }, this.options.bufferMs);
    }

    /**
     * Disconnect from telemetry WebSocket
     */
    public disconnect(): void {
        this.debug('Disconnecting from telemetry stream');

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.bufferTimer) {
            clearTimeout(this.bufferTimer);
            this.bufferTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.reconnectCount = 0;
    }

    /**
     * Check if currently connected
     */
    public getIsConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Check if WebSocket is in a connecting state
     */
    public getIsConnecting(): boolean {
        return this.ws?.readyState === WebSocket.CONNECTING;
    }

    /**
     * Get current reconnect attempt count
     */
    public getReconnectCount(): number {
        return this.reconnectCount;
    }
}

// Singleton instance
let telemetryStreamManager: TelemetryStreamManager | null = null;

/**
 * Get or create telemetry stream manager singleton
 */
export function getTelemetryStreamManager(
    options?: TelemetryStreamOptions,
    callbacks?: TelemetryStreamCallbacks
): TelemetryStreamManager {
    if (!telemetryStreamManager) {
        telemetryStreamManager = new TelemetryStreamManager(options, callbacks);
    }
    return telemetryStreamManager;
}

/**
 * Reset telemetry stream manager singleton (useful for testing)
 */
export function resetTelemetryStreamManager(): void {
    if (telemetryStreamManager) {
        telemetryStreamManager.disconnect();
        telemetryStreamManager = null;
    }
}
