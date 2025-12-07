/**
 * useRunHistory Hook
 * 
 * React hook for fetching and managing run history in the UI.
 * Polls public/run-history.json for recent pipeline runs.
 * 
 * @module hooks/useRunHistory
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RunHistoryFile, RunHistoryEntry } from '../types/runRegistry';

// ============================================================================
// Types
// ============================================================================

export interface UseRunHistoryResult {
    /** Run history entries */
    runs: RunHistoryEntry[];
    /** Total count in registry */
    totalCount: number;
    /** Whether currently loading */
    loading: boolean;
    /** Error message if any */
    error: string | null;
    /** Last fetch timestamp */
    lastFetchedAt: number | null;
    /** Manually trigger a refresh */
    refresh: () => Promise<void>;
}

export interface UseRunHistoryOptions {
    /** Auto-refresh interval in ms (0 to disable, default: 30000) */
    autoRefreshMs?: number;
    /** Whether to fetch on mount (default: true) */
    fetchOnMount?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const RUN_HISTORY_URL = '/run-history.json';
const DEFAULT_AUTO_REFRESH_MS = 30000; // 30 seconds

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch and manage run history
 */
export function useRunHistory(options: UseRunHistoryOptions = {}): UseRunHistoryResult {
    const {
        autoRefreshMs = DEFAULT_AUTO_REFRESH_MS,
        fetchOnMount = true,
    } = options;
    
    const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
    
    const isMountedRef = useRef(true);
    
    const fetchHistory = useCallback(async () => {
        if (!isMountedRef.current) return;
        
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch(RUN_HISTORY_URL, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                },
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    // No history file yet, not an error
                    setRuns([]);
                    setTotalCount(0);
                    setLastFetchedAt(Date.now());
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data: RunHistoryFile = await response.json();
            
            if (!isMountedRef.current) return;
            
            setRuns(data.runs || []);
            setTotalCount(data.totalCount || 0);
            setLastFetchedAt(Date.now());
        } catch (err) {
            if (!isMountedRef.current) return;
            
            const message = err instanceof Error ? err.message : 'Failed to fetch run history';
            setError(message);
            console.warn('[useRunHistory] Fetch error:', message);
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, []);
    
    // Fetch on mount
    useEffect(() => {
        isMountedRef.current = true;
        
        if (fetchOnMount) {
            fetchHistory();
        }
        
        return () => {
            isMountedRef.current = false;
        };
    }, [fetchOnMount, fetchHistory]);
    
    // Auto-refresh
    useEffect(() => {
        if (autoRefreshMs <= 0) return;
        
        const intervalId = setInterval(() => {
            if (isMountedRef.current) {
                fetchHistory();
            }
        }, autoRefreshMs);
        
        return () => {
            clearInterval(intervalId);
        };
    }, [autoRefreshMs, fetchHistory]);
    
    return {
        runs,
        totalCount,
        loading,
        error,
        lastFetchedAt,
        refresh: fetchHistory,
    };
}
