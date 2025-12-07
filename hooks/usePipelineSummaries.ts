/**
 * Pipeline Summaries Hook
 * 
 * Fetches and manages production and narrative pipeline summaries from public JSON files.
 * Provides staleness detection, auto-refresh, and error handling.
 * 
 * Phase 1: Read-only consumption of existing summary files.
 * Phase 2 (future): Add run launcher triggers.
 * 
 * @module hooks/usePipelineSummaries
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ProductionSummaryLite,
    NarrativeSummaryLite,
    PipelineSummariesState,
    PreflightStatusFile,
    PreflightInfo,
    calculateSummaryAge,
    isSummaryStale,
    DEFAULT_STALENESS_THRESHOLD_MS,
} from '../types/pipelineSummary';

// ============================================================================
// Configuration
// ============================================================================

/**
 * URLs for summary files
 */
const PRODUCTION_SUMMARY_LITE_URL = '/latest-run-summary-lite.json';
const NARRATIVE_SUMMARY_LITE_URL = '/latest-narrative-summary-lite.json';

/**
 * Standalone preflight status URL
 */
const PREFLIGHT_STATUS_URL = '/preflight-status.json';

/**
 * Full summary URLs (for future use when more detail is needed)
 */
export const PRODUCTION_SUMMARY_FULL_URL = '/latest-run-summary.json';
export const NARRATIVE_SUMMARY_FULL_URL = '/latest-narrative-summary.json';

/**
 * Default auto-refresh interval (5 minutes)
 * 
 * NOTE: Phase 2 may want to make this configurable.
 * For development, 5 minutes balances freshness vs. network traffic.
 */
const DEFAULT_AUTO_REFRESH_MS = 5 * 60 * 1000;

// ============================================================================
// Hook Options
// ============================================================================

export interface UsePipelineSummariesOptions {
    /** Enable auto-refresh (default: true) */
    autoRefresh?: boolean;
    /** Auto-refresh interval in ms (default: 5 minutes) */
    refreshIntervalMs?: number;
    /** Staleness threshold in ms (default: 24 hours) */
    stalenessThresholdMs?: number;
    /** Fetch full summaries instead of lite (includes preflight info, default: false) */
    fetchFull?: boolean;
    /** Callback when summaries are updated */
    onUpdate?: (state: PipelineSummariesState) => void;
    /** Callback on fetch error */
    onError?: (error: string) => void;
}

// ============================================================================
// Fetch Helpers
// ============================================================================

/**
 * Fetch a summary file with error handling
 */
async function fetchSummary<T>(url: string): Promise<T | null> {
    try {
        const response = await fetch(url, {
            cache: 'no-store', // Always get fresh data
            headers: {
                'Accept': 'application/json',
            },
        });
        
        if (!response.ok) {
            // 404 is expected if no runs have occurred yet
            if (response.status === 404) {
                return null;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data as T;
    } catch (error) {
        // Network errors or JSON parse errors
        if (error instanceof Error && error.message.includes('404')) {
            return null;
        }
        throw error;
    }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for fetching and managing pipeline summaries
 * 
 * @param options - Configuration options
 * @returns State and control functions
 * 
 * @example
 * ```tsx
 * const { state, refresh, isReady } = usePipelineSummaries({
 *   autoRefresh: true,
 *   stalenessThresholdMs: 12 * 60 * 60 * 1000, // 12 hours
 * });
 * 
 * if (state.loading) return <Spinner />;
 * if (state.error) return <Error message={state.error} />;
 * if (!isReady) return <NoData />;
 * 
 * return <TelemetryPanel production={state.production} narrative={state.narrative} />;
 * ```
 */
export function usePipelineSummaries(options: UsePipelineSummariesOptions = {}) {
    const {
        autoRefresh = true,
        refreshIntervalMs = DEFAULT_AUTO_REFRESH_MS,
        stalenessThresholdMs = DEFAULT_STALENESS_THRESHOLD_MS,
        fetchFull = false,
        onUpdate,
        onError,
    } = options;
    
    // Determine which URLs to use based on fetchFull option
    const productionUrl = fetchFull ? PRODUCTION_SUMMARY_FULL_URL : PRODUCTION_SUMMARY_LITE_URL;
    const narrativeUrl = fetchFull ? NARRATIVE_SUMMARY_FULL_URL : NARRATIVE_SUMMARY_LITE_URL;
    
    // State
    const [state, setState] = useState<PipelineSummariesState>({
        production: null,
        narrative: null,
        standalonePreflight: null,
        mergedPreflight: null,
        loading: true,
        error: null,
        lastFetchedAt: null,
        productionStale: true,
        narrativeStale: true,
        productionAgeMs: null,
        narrativeAgeMs: null,
    });
    
    // Refs for callbacks (to avoid stale closures)
    const onUpdateRef = useRef(onUpdate);
    const onErrorRef = useRef(onError);
    onUpdateRef.current = onUpdate;
    onErrorRef.current = onError;
    
    // Fetch function
    const fetchSummaries = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        
        try {
            // Fetch all summaries and preflight in parallel
            const [production, narrative, preflightStatus] = await Promise.all([
                fetchSummary<ProductionSummaryLite>(productionUrl),
                fetchSummary<NarrativeSummaryLite>(narrativeUrl),
                fetchSummary<PreflightStatusFile>(PREFLIGHT_STATUS_URL),
            ]);
            
            // Extract standalone preflight from preflight-status.json
            const standalonePreflight: PreflightInfo | null = preflightStatus?.result ?? null;
            
            // Merge preflight: prefer standalone, fall back to production summary preflight
            const mergedPreflight: PreflightInfo | null = standalonePreflight ?? production?.preflight ?? null;
            
            // Calculate ages and staleness
            const productionAgeMs = calculateSummaryAge(production?.finishedAt);
            const narrativeAgeMs = calculateSummaryAge(narrative?.finishedAt);
            const productionStale = isSummaryStale(production?.finishedAt, stalenessThresholdMs);
            const narrativeStale = isSummaryStale(narrative?.finishedAt, stalenessThresholdMs);
            
            const newState: PipelineSummariesState = {
                production,
                narrative,
                standalonePreflight,
                mergedPreflight,
                loading: false,
                error: null,
                lastFetchedAt: Date.now(),
                productionStale,
                narrativeStale,
                productionAgeMs,
                narrativeAgeMs,
            };
            
            setState(newState);
            onUpdateRef.current?.(newState);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch summaries';
            setState(prev => ({
                ...prev,
                loading: false,
                error: errorMessage,
            }));
            onErrorRef.current?.(errorMessage);
        }
    }, [stalenessThresholdMs, productionUrl, narrativeUrl]);
    
    // Initial fetch
    useEffect(() => {
        fetchSummaries();
    }, [fetchSummaries]);
    
    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh || refreshIntervalMs <= 0) {
            return undefined;
        }
        
        const interval = setInterval(fetchSummaries, refreshIntervalMs);
        return () => clearInterval(interval);
    }, [autoRefresh, refreshIntervalMs, fetchSummaries]);
    
    // Computed values
    const hasProduction = state.production !== null;
    const hasNarrative = state.narrative !== null;
    const hasPreflight = state.mergedPreflight !== null;
    const isReady = !state.loading && (hasProduction || hasNarrative || hasPreflight);
    const hasBoth = hasProduction && hasNarrative;
    const hasNeither = !hasProduction && !hasNarrative && !hasPreflight;
    
    return {
        /** Current state */
        state,
        /** Manually trigger a refresh */
        refresh: fetchSummaries,
        /** Whether any data is available */
        isReady,
        /** Whether production summary is available */
        hasProduction,
        /** Whether narrative summary is available */
        hasNarrative,
        /** Whether both summaries are available */
        hasBoth,
        /** Whether neither summary is available (including no preflight) */
        hasNeither,
        /** Whether preflight data is available (from any source) */
        hasPreflight,
    };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to fetch full production summary (larger payload)
 * Use when detailed preflight/artifact info is needed.
 */
export function useProductionSummaryFull() {
    const [data, setData] = useState<ProductionSummaryLite | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchSummary<ProductionSummaryLite>(PRODUCTION_SUMMARY_FULL_URL);
            setData(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        fetch();
    }, [fetch]);
    
    return { data, loading, error, refresh: fetch };
}

/**
 * Hook to fetch full narrative summary (larger payload)
 * Use when detailed shot artifacts/QA info is needed.
 */
export function useNarrativeSummaryFull() {
    const [data, setData] = useState<NarrativeSummaryLite | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const fetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetchSummary<NarrativeSummaryLite>(NARRATIVE_SUMMARY_FULL_URL);
            setData(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        fetch();
    }, [fetch]);
    
    return { data, loading, error, refresh: fetch };
}

export default usePipelineSummaries;
