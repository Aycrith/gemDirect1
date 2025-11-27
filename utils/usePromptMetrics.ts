/**
 * usePromptMetrics Hook
 * 
 * React hook for collecting and analyzing prompt optimization metrics.
 * Persists metrics to IndexedDB via the database utility.
 * 
 * @module utils/usePromptMetrics
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { saveData, getData } from './database';
import {
    type GenerationMetrics,
    type MetricsSummary,
    type VariantComparison,
    createMetrics,
    summarizeMetricsByVariant,
    generateComparisonReport,
    exportMetricsToJson,
    exportMetricsToCsv,
    getSessionId,
    resetSessionId,
} from '../services/generationMetrics';

// ============================================================================
// Constants
// ============================================================================

const METRICS_STORAGE_KEY = 'promptMetrics';
const MAX_STORED_METRICS = 1000; // Prevent unbounded growth

// ============================================================================
// Types
// ============================================================================

export interface UsePromptMetricsReturn {
    /** All collected metrics */
    metrics: GenerationMetrics[];
    /** Aggregated summaries by variant */
    summaries: Map<string, MetricsSummary>;
    /** Loading state for initial hydration */
    isLoading: boolean;
    /** Current session ID */
    sessionId: string;
    /** Log a new metric entry */
    logMetric: (metric: Omit<GenerationMetrics, 'generationId' | 'timestamp' | 'sessionId'>) => void;
    /** Update an existing metric (e.g., add user rating) */
    updateMetric: (generationId: string, updates: Partial<GenerationMetrics>) => void;
    /** Clear all metrics */
    clearMetrics: () => void;
    /** Reset session (start new session ID) */
    resetSession: () => void;
    /** Export metrics as JSON */
    exportJson: () => string;
    /** Export metrics as CSV */
    exportCsv: () => string;
    /** Compare two variants */
    compareVariants: (controlId: string, treatmentId: string) => {
        control: MetricsSummary | null;
        treatment: MetricsSummary | null;
        comparisons: VariantComparison[];
        overallWinner: string | null;
        confidence: 'low' | 'medium' | 'high';
    };
    /** Get metrics for current session only */
    sessionMetrics: GenerationMetrics[];
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePromptMetrics(): UsePromptMetricsReturn {
    const [metrics, setMetrics] = useState<GenerationMetrics[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionId] = useState(() => getSessionId());

    // Load metrics from storage on mount
    useEffect(() => {
        const loadMetrics = async () => {
            try {
                const stored = await getData(METRICS_STORAGE_KEY);
                if (Array.isArray(stored)) {
                    setMetrics(stored);
                }
            } catch (error) {
                console.warn('[usePromptMetrics] Failed to load stored metrics:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadMetrics();
    }, []);

    // Save metrics to storage when changed
    const saveMetrics = useCallback(async (newMetrics: GenerationMetrics[]) => {
        try {
            // Trim to max size, keeping most recent
            const trimmed = newMetrics.length > MAX_STORED_METRICS
                ? newMetrics.slice(-MAX_STORED_METRICS)
                : newMetrics;
            await saveData(METRICS_STORAGE_KEY, trimmed);
        } catch (error) {
            console.warn('[usePromptMetrics] Failed to save metrics:', error);
        }
    }, []);

    // Log a new metric
    const logMetric = useCallback((
        partial: Omit<GenerationMetrics, 'generationId' | 'timestamp' | 'sessionId'>
    ) => {
        const fullMetric = createMetrics({
            ...partial,
            sessionId,
        } as Parameters<typeof createMetrics>[0]);

        setMetrics(prev => {
            const updated = [...prev, fullMetric];
            saveMetrics(updated);
            return updated;
        });
    }, [sessionId, saveMetrics]);

    // Update an existing metric
    const updateMetric = useCallback((
        generationId: string,
        updates: Partial<Pick<GenerationMetrics, 'regenerationCount' | 'userRating' | 'userFeedback'>>
    ) => {
        setMetrics(prev => {
            const index = prev.findIndex(m => m.generationId === generationId);
            if (index === -1) {
                console.warn(`[usePromptMetrics] Metric ${generationId} not found`);
                return prev;
            }
            const updated = [...prev];
            const existing = updated[index]!;
            updated[index] = {
                ...existing,
                ...updates,
            };
            saveMetrics(updated);
            return updated;
        });
    }, [saveMetrics]);

    // Clear all metrics
    const clearMetrics = useCallback(() => {
        setMetrics([]);
        saveMetrics([]);
    }, [saveMetrics]);

    // Reset session
    const resetSession = useCallback(() => {
        resetSessionId();
        // Session ID will be regenerated on next logMetric call
    }, []);

    // Export functions
    const exportJson = useCallback(() => {
        return exportMetricsToJson(metrics);
    }, [metrics]);

    const exportCsv = useCallback(() => {
        return exportMetricsToCsv(metrics);
    }, [metrics]);

    // Compare variants
    const compareVariantsCallback = useCallback((
        controlId: string,
        treatmentId: string
    ) => {
        return generateComparisonReport(metrics, controlId, treatmentId);
    }, [metrics]);

    // Computed values
    const summaries = useMemo(() => {
        return summarizeMetricsByVariant(metrics);
    }, [metrics]);

    const sessionMetrics = useMemo(() => {
        return metrics.filter(m => m.sessionId === sessionId);
    }, [metrics, sessionId]);

    return {
        metrics,
        summaries,
        isLoading,
        sessionId,
        logMetric,
        updateMetric,
        clearMetrics,
        resetSession,
        exportJson,
        exportCsv,
        compareVariants: compareVariantsCallback,
        sessionMetrics,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a metrics logger that can be passed to generation functions.
 * Returns a function that wraps async operations with timing and logging.
 */
export function createMetricsLogger(
    logMetric: UsePromptMetricsReturn['logMetric']
) {
    return async function loggedGeneration<T>(
        promptVariantId: string,
        provider: string,
        promptLength: number,
        positiveTokens: number,
        negativeTokens: number,
        generateFn: () => Promise<T>,
        options?: {
            promptVariantLabel?: string;
            queueWaitTimeMs?: number;
        }
    ): Promise<{ result: T; metrics: Partial<GenerationMetrics> }> {
        const startTime = performance.now();
        let success = false;
        let finishReason = 'error';
        let safetyFilterTriggered = false;

        try {
            const result = await generateFn();
            success = true;
            finishReason = 'success';
            return {
                result,
                metrics: {
                    promptVariantId,
                    promptVariantLabel: options?.promptVariantLabel,
                    promptLength,
                    positiveTokens,
                    negativeTokens,
                    generationTimeMs: Math.round(performance.now() - startTime),
                    queueWaitTimeMs: options?.queueWaitTimeMs,
                    provider,
                    success,
                    finishReason,
                    safetyFilterTriggered,
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            
            // Detect safety filter
            if (message.includes('safety') || message.includes('blocked')) {
                safetyFilterTriggered = true;
                finishReason = 'safety_filter';
            } else {
                finishReason = 'error';
            }

            // Log the failed attempt
            logMetric({
                promptVariantId,
                promptVariantLabel: options?.promptVariantLabel,
                promptLength,
                positiveTokens,
                negativeTokens,
                generationTimeMs: Math.round(performance.now() - startTime),
                queueWaitTimeMs: options?.queueWaitTimeMs,
                provider,
                success: false,
                finishReason,
                safetyFilterTriggered,
            });

            throw error;
        }
    };
}

export default usePromptMetrics;
