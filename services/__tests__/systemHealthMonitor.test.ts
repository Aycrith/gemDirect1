import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getHealthMonitor,
    checkSystemHealth,
    getHealthStatus,
    canGenerateVideo,
    canGenerateStory,
    canRender,
    resetHealthMonitor
} from '../systemHealthMonitor';

describe('systemHealthMonitor', () => {
    beforeEach(() => {
        resetHealthMonitor();
    });

    describe('Health Check', () => {
        it('performs health check', async () => {
            const result = await checkSystemHealth();

            expect(result).toBeDefined();
            expect(result.timestamp).toBeGreaterThan(0);
            expect(result.components.llm).toBeDefined();
            expect(result.components.comfyUI).toBeDefined();
        });

        it('tracks response times', async () => {
            await checkSystemHealth();
            const metrics = getHealthMonitor().getMetrics();

            expect(metrics.llmAvgResponseTimeMs).toBeGreaterThanOrEqual(0);
            expect(metrics.comfyUIAvgResponseTimeMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Health Status', () => {
        it('returns current status', () => {
            const status = getHealthStatus();

            expect(status.llm).toBeDefined();
            expect(status.comfyUI).toBeDefined();
            expect(status.llm.lastCheckTime).toBeGreaterThanOrEqual(0);
        });

        it('tracks consecutive failures after health check', async () => {
            // After a health check, the status will reflect failures if endpoints unavailable
            await checkSystemHealth();
            const status = getHealthStatus();
            
            // Check exists and is numeric
            expect(typeof status.llm.consecutiveFailures).toBe('number');
            expect(status.llm.consecutiveFailures).toBeGreaterThanOrEqual(0);
            expect(typeof status.comfyUI.consecutiveFailures).toBe('number');
            expect(status.comfyUI.consecutiveFailures).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Capability Checks', () => {
        it('checks if can generate story', async () => {
            const monitor = getHealthMonitor();
            const status = monitor.getStatus();

            // Before check, should be false
            expect(canGenerateStory()).toBe(status.llm.online && status.llm.consecutiveFailures < 3);
        });

        it('checks if can render', () => {
            const monitor = getHealthMonitor();
            const status = monitor.getStatus();

            expect(canRender()).toBe(status.comfyUI.online && status.comfyUI.consecutiveFailures < 3);
        });

        it('checks if can generate full video', () => {
            const monitor = getHealthMonitor();
            const status = monitor.getStatus();

            const expected = status.llm.online &&
                status.comfyUI.online &&
                status.llm.consecutiveFailures < 3 &&
                status.comfyUI.consecutiveFailures < 3;

            expect(canGenerateVideo()).toBe(expected);
        });
    });

    describe('Metrics', () => {
        it('tracks success rates', async () => {
            await checkSystemHealth();
            const metrics = getHealthMonitor().getMetrics();

            expect(metrics.llmSuccessRate).toBeGreaterThanOrEqual(0);
            expect(metrics.llmSuccessRate).toBeLessThanOrEqual(1);
            expect(metrics.comfyUISuccessRate).toBeGreaterThanOrEqual(0);
            expect(metrics.comfyUISuccessRate).toBeLessThanOrEqual(1);
        });

        it('tracks uptime', async () => {
            await checkSystemHealth();
            const metrics = getHealthMonitor().getMetrics();

            expect(metrics.uptimeMs).toBeGreaterThan(0);
        });
    });

    describe('Health Report', () => {
        it('generates health report', async () => {
            await checkSystemHealth();
            const report = getHealthMonitor().getHealthReport();

            expect(report).toContain('System Health Report');
            expect(report).toContain('LLM Status');
            expect(report).toContain('ComfyUI Status');
            expect(report).toContain('Metrics');
        });

        it('report includes timestamps', async () => {
            await checkSystemHealth();
            const report = getHealthMonitor().getHealthReport();

            expect(report).toContain('Can Generate Story');
            expect(report).toContain('Can Render Video');
            expect(report).toContain('Can Generate Full Video');
        });
    });

    describe('Singleton Pattern', () => {
        it('returns same instance', () => {
            const monitor1 = getHealthMonitor();
            const monitor2 = getHealthMonitor();

            expect(monitor1).toBe(monitor2);
        });
    });

    describe('State Persistence', () => {
        it('maintains state across calls', async () => {
            await checkSystemHealth();
            const status1 = getHealthStatus();

            const status2 = getHealthStatus();

            expect(status1.llm.lastCheckTime).toBeGreaterThanOrEqual(0);
            expect(status2.llm.lastCheckTime).toBeGreaterThanOrEqual(status1.llm.lastCheckTime);
        });

        it('can be reset', () => {
            resetHealthMonitor();
            const monitor = getHealthMonitor();
            const metrics = monitor.getMetrics();

            expect(metrics.llmSuccessRate).toBe(0);
            expect(metrics.comfyUISuccessRate).toBe(0);
        });
    });
});
