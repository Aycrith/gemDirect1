/**
 * Generation Metrics Context
 * 
 * Provides centralized tracking of generation metrics for A/B testing.
 * Metrics are stored in session storage and persist across page navigations.
 * 
 * @module contexts/GenerationMetricsContext
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { HydrationGate } from './HydrationContext';
import {
    createMetrics,
    type GenerationMetrics,
} from '../services/generationMetrics';

// ============================================================================
// Types
// ============================================================================

interface GenerationMetricsContextValue {
    /** All collected metrics for this session */
    metrics: GenerationMetrics[];
    
    /** Add a new metrics entry */
    addMetrics: (partial: Partial<GenerationMetrics> & Pick<GenerationMetrics, 'promptVariantId' | 'provider'>) => GenerationMetrics;
    
    /** Update an existing metrics entry by ID */
    updateMetrics: (generationId: string, updates: Partial<GenerationMetrics>) => void;
    
    /** Clear all metrics */
    clearMetrics: () => void;
    
    /** Get metrics filtered by variant */
    getMetricsByVariant: (variantId: string) => GenerationMetrics[];
    
    /** Total count of metrics */
    totalCount: number;
}

// ============================================================================
// Storage Key
// ============================================================================

const STORAGE_KEY = 'gemDirect_generationMetrics';

// ============================================================================
// Context
// ============================================================================

const GenerationMetricsContext = createContext<GenerationMetricsContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export const GenerationMetricsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [metrics, setMetrics] = useState<GenerationMetrics[]>(() => {
        // Load from session storage on mount
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('[GenerationMetricsContext] Failed to load from session storage:', e);
        }
        return [];
    });
    
    // Persist to session storage on change
    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
        } catch (e) {
            console.warn('[GenerationMetricsContext] Failed to save to session storage:', e);
        }
    }, [metrics]);
    
    // Add new metrics
    const addMetrics = useCallback((
        partial: Partial<GenerationMetrics> & Pick<GenerationMetrics, 'promptVariantId' | 'provider'>
    ): GenerationMetrics => {
        const entry = createMetrics(partial);
        setMetrics(prev => [...prev, entry]);
        return entry;
    }, []);
    
    // Update existing metrics
    const updateMetrics = useCallback((
        generationId: string,
        updates: Partial<GenerationMetrics>
    ) => {
        setMetrics(prev => prev.map(m => 
            m.generationId === generationId 
                ? { ...m, ...updates }
                : m
        ));
    }, []);
    
    // Clear all metrics
    const clearMetrics = useCallback(() => {
        setMetrics([]);
        try {
            sessionStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            // Ignore
        }
    }, []);
    
    // Get metrics by variant
    const getMetricsByVariant = useCallback((variantId: string): GenerationMetrics[] => {
        return metrics.filter(m => m.promptVariantId === variantId);
    }, [metrics]);
    
    const value = useMemo<GenerationMetricsContextValue>(() => ({
        metrics,
        addMetrics,
        updateMetrics,
        clearMetrics,
        getMetricsByVariant,
        totalCount: metrics.length,
    }), [metrics, addMetrics, updateMetrics, clearMetrics, getMetricsByVariant]);
    
    return (
        <GenerationMetricsContext.Provider value={value}>
            <HydrationGate>
                {children}
            </HydrationGate>
        </GenerationMetricsContext.Provider>
    );
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Use generation metrics context.
 * @throws Error if used outside of GenerationMetricsProvider
 */
export const useGenerationMetrics = (): GenerationMetricsContextValue => {
    const context = useContext(GenerationMetricsContext);
    if (!context) {
        throw new Error('useGenerationMetrics must be used within a GenerationMetricsProvider');
    }
    return context;
};

/**
 * Optional hook that returns null if outside provider (for optional usage).
 */
export const useGenerationMetricsOptional = (): GenerationMetricsContextValue | null => {
    return useContext(GenerationMetricsContext);
};

export default GenerationMetricsContext;
