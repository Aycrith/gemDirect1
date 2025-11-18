/**
 * System Health Monitor Service
 * 
 * Monitors LLM and ComfyUI health, tracks metrics, and provides
 * pre-flight checks before expensive operations.
 */

export interface HealthCheckResult {
    healthy: boolean;
    timestamp: number;
    components: {
        llm: HealthStatus;
        comfyUI: HealthStatus;
    };
    metrics: SystemMetrics;
}

export interface HealthStatus {
    online: boolean;
    responseTimeMs?: number;
    lastCheckTime: number;
    consecutiveFailures: number;
    lastError?: string;
}

export interface SystemMetrics {
    llmAvgResponseTimeMs: number;
    comfyUIAvgResponseTimeMs: number;
    llmSuccessRate: number;
    comfyUISuccessRate: number;
    uptimeMs: number;
}

interface HealthMetrics {
    llm: {
        checks: number;
        successes: number;
        failures: number;
        responseTimes: number[];
        lastError?: string;
        consecutiveFailures?: number;
    };
    comfyUI: {
        checks: number;
        successes: number;
        failures: number;
        responseTimes: number[];
        lastError?: string;
        consecutiveFailures?: number;
    };
}

const HEALTH_CHECK_TIMEOUT = 5000;
const MAX_RESPONSE_TIME_SAMPLES = 100;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const LLM_HEALTH_ENDPOINT = 'http://192.168.50.192:1234/v1/models';
const COMFYUI_HEALTH_ENDPOINT = 'http://localhost:8188/system_stats';

class SystemHealthMonitor {
    private metrics: HealthMetrics = {
        llm: {
            checks: 0,
            successes: 0,
            failures: 0,
            responseTimes: [],
            lastError: undefined
        },
        comfyUI: {
            checks: 0,
            successes: 0,
            failures: 0,
            responseTimes: [],
            lastError: undefined
        }
    };

    private status: {
        llm: HealthStatus;
        comfyUI: HealthStatus;
    } = {
        llm: {
            online: false,
            lastCheckTime: 0,
            consecutiveFailures: 0
        },
        comfyUI: {
            online: false,
            lastCheckTime: 0,
            consecutiveFailures: 0
        }
    };

    private startTime = Date.now();

    /**
     * Run full health check on all components
     */
    async checkHealth(): Promise<HealthCheckResult> {
        const [llmStatus, comfyUIStatus] = await Promise.all([
            this.checkLLMHealth(),
            this.checkComfyUIHealth()
        ]);

        this.status.llm = llmStatus;
        this.status.comfyUI = comfyUIStatus;

        return {
            healthy: llmStatus.online && comfyUIStatus.online,
            timestamp: Date.now(),
            components: {
                llm: llmStatus,
                comfyUI: comfyUIStatus
            },
            metrics: this.getMetrics()
        };
    }

    /**
     * Check LLM health
     */
    private async checkLLMHealth(): Promise<HealthStatus> {
        const startTime = Date.now();
        this.metrics.llm.checks++;

        try {
            const response = await Promise.race([
                fetch(LLM_HEALTH_ENDPOINT),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('LLM health check timeout')), HEALTH_CHECK_TIMEOUT)
                )
            ]);

            if (!response.ok) {
                throw new Error(`LLM returned ${response.status}`);
            }

            const responseTime = Date.now() - startTime;
            this.metrics.llm.successes++;
            this.metrics.llm.consecutiveFailures = 0;
            this.recordResponseTime('llm', responseTime);

            return {
                online: true,
                responseTimeMs: responseTime,
                lastCheckTime: Date.now(),
                consecutiveFailures: 0
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.metrics.llm.failures++;
            this.metrics.llm.lastError = errorMessage;
            this.metrics.llm.consecutiveFailures = (this.metrics.llm.consecutiveFailures || 0) + 1;

            return {
                online: false,
                lastCheckTime: Date.now(),
                consecutiveFailures: this.metrics.llm.consecutiveFailures || 1,
                lastError: errorMessage
            };
        }
    }

    /**
     * Check ComfyUI health
     */
    private async checkComfyUIHealth(): Promise<HealthStatus> {
        const startTime = Date.now();
        this.metrics.comfyUI.checks++;

        try {
            const response = await Promise.race([
                fetch(COMFYUI_HEALTH_ENDPOINT),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('ComfyUI health check timeout')), HEALTH_CHECK_TIMEOUT)
                )
            ]);

            if (!response.ok) {
                throw new Error(`ComfyUI returned ${response.status}`);
            }

            const responseTime = Date.now() - startTime;
            this.metrics.comfyUI.successes++;
            this.metrics.comfyUI.consecutiveFailures = 0;
            this.recordResponseTime('comfyUI', responseTime);

            return {
                online: true,
                responseTimeMs: responseTime,
                lastCheckTime: Date.now(),
                consecutiveFailures: 0
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.metrics.comfyUI.failures++;
            this.metrics.comfyUI.lastError = errorMessage;
            this.metrics.comfyUI.consecutiveFailures = (this.metrics.comfyUI.consecutiveFailures || 0) + 1;

            return {
                online: false,
                lastCheckTime: Date.now(),
                consecutiveFailures: this.metrics.comfyUI.consecutiveFailures || 1,
                lastError: errorMessage
            };
        }
    }

    /**
     * Record response time for metrics
     */
    private recordResponseTime(component: 'llm' | 'comfyUI', timeMs: number): void {
        const metrics = this.metrics[component];
        metrics.responseTimes.push(timeMs);
        
        // Keep only recent samples
        if (metrics.responseTimes.length > MAX_RESPONSE_TIME_SAMPLES) {
            metrics.responseTimes.shift();
        }
    }

    /**
     * Get current metrics
     */
    getMetrics(): SystemMetrics {
        const llmTimes = this.metrics.llm.responseTimes;
        const comfyTimes = this.metrics.comfyUI.responseTimes;

        return {
            llmAvgResponseTimeMs: llmTimes.length > 0
                ? Math.round(llmTimes.reduce((a, b) => a + b, 0) / llmTimes.length)
                : 0,
            comfyUIAvgResponseTimeMs: comfyTimes.length > 0
                ? Math.round(comfyTimes.reduce((a, b) => a + b, 0) / comfyTimes.length)
                : 0,
            llmSuccessRate: this.metrics.llm.checks > 0
                ? (this.metrics.llm.successes / this.metrics.llm.checks)
                : 0,
            comfyUISuccessRate: this.metrics.comfyUI.checks > 0
                ? (this.metrics.comfyUI.successes / this.metrics.comfyUI.checks)
                : 0,
            uptimeMs: Date.now() - this.startTime
        };
    }

    /**
     * Get current status (no additional checks)
     */
    getStatus(): { llm: HealthStatus; comfyUI: HealthStatus } {
        return this.status;
    }

    /**
     * Check if system is healthy enough for video generation
     */
    canGenerateVideo(): boolean {
        const status = this.getStatus();
        
        // Need both LLM and ComfyUI online
        if (!status.llm.online || !status.comfyUI.online) {
            return false;
        }
        
        // Check for too many consecutive failures
        if (status.llm.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD ||
            status.comfyUI.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
            return false;
        }
        
        return true;
    }

    /**
     * Check if LLM is available for story generation
     */
    canGenerateStory(): boolean {
        const status = this.getStatus();
        return status.llm.online && status.llm.consecutiveFailures < CONSECUTIVE_FAILURE_THRESHOLD;
    }

    /**
     * Check if ComfyUI is available for rendering
     */
    canRender(): boolean {
        const status = this.getStatus();
        return status.comfyUI.online && status.comfyUI.consecutiveFailures < CONSECUTIVE_FAILURE_THRESHOLD;
    }

    /**
     * Get detailed health report
     */
    getHealthReport(): string {
        const status = this.getStatus();
        const metrics = this.getMetrics();

        return `
System Health Report (${new Date().toISOString()})
================================================

LLM Status:
  Online: ${status.llm.online}
  Last Check: ${new Date(status.llm.lastCheckTime).toISOString()}
  Response Time: ${status.llm.responseTimeMs}ms
  Consecutive Failures: ${status.llm.consecutiveFailures}
  Error: ${status.llm.lastError || 'None'}

ComfyUI Status:
  Online: ${status.comfyUI.online}
  Last Check: ${new Date(status.comfyUI.lastCheckTime).toISOString()}
  Response Time: ${status.comfyUI.responseTimeMs}ms
  Consecutive Failures: ${status.comfyUI.consecutiveFailures}
  Error: ${status.comfyUI.lastError || 'None'}

Metrics:
  LLM Avg Response Time: ${metrics.llmAvgResponseTimeMs}ms
  ComfyUI Avg Response Time: ${metrics.comfyUIAvgResponseTimeMs}ms
  LLM Success Rate: ${(metrics.llmSuccessRate * 100).toFixed(1)}%
  ComfyUI Success Rate: ${(metrics.comfyUISuccessRate * 100).toFixed(1)}%
  Uptime: ${(metrics.uptimeMs / 1000).toFixed(0)}s

System Ready:
  Can Generate Story: ${this.canGenerateStory()}
  Can Render Video: ${this.canRender()}
  Can Generate Full Video: ${this.canGenerateVideo()}
        `.trim();
    }

    /**
     * Reset metrics (useful for testing)
     */
    reset(): void {
        this.metrics = {
            llm: {
                checks: 0,
                successes: 0,
                failures: 0,
                responseTimes: [],
                lastError: undefined
            },
            comfyUI: {
                checks: 0,
                successes: 0,
                failures: 0,
                responseTimes: [],
                lastError: undefined
            }
        };
        this.startTime = Date.now();
    }
}

// Singleton instance
let instance: SystemHealthMonitor | null = null;

/**
 * Get health monitor instance
 */
export const getHealthMonitor = (): SystemHealthMonitor => {
    if (!instance) {
        instance = new SystemHealthMonitor();
    }
    return instance;
};

/**
 * Check system health
 */
export const checkSystemHealth = async (): Promise<HealthCheckResult> => {
    return getHealthMonitor().checkHealth();
};

/**
 * Get health status without new checks
 */
export const getHealthStatus = () => {
    return getHealthMonitor().getStatus();
};

/**
 * Get system metrics
 */
export const getSystemMetrics = (): SystemMetrics => {
    return getHealthMonitor().getMetrics();
};

/**
 * Check if system is ready for operations
 */
export const canGenerateVideo = (): boolean => {
    return getHealthMonitor().canGenerateVideo();
};

/**
 * Check if LLM is available
 */
export const canGenerateStory = (): boolean => {
    return getHealthMonitor().canGenerateStory();
};

/**
 * Check if ComfyUI is available
 */
export const canRender = (): boolean => {
    return getHealthMonitor().canRender();
};

/**
 * Get formatted health report
 */
export const getHealthReport = (): string => {
    return getHealthMonitor().getHealthReport();
};

/**
 * Reset for testing
 */
export const resetHealthMonitor = (): void => {
    getHealthMonitor().reset();
};
