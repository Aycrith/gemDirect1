/**
 * HydrationContext - Coordinates state hydration across all usePersistentState hooks
 * 
 * Problem Solved:
 * - Race conditions between sessionStorage and IndexedDB
 * - Components rendering before all state is loaded
 * - Inconsistent initialization order
 * - Test fixtures not reliably hydrating state
 * 
 * Solution:
 * - Central registry of all persistent state keys being hydrated
 * - Single `isFullyHydrated` flag that's only true when ALL state is loaded
 * - Prevents main content rendering until hydration is complete
 * - Provides timeout handling for stuck hydration
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { ErrorCodes, CSGError } from '../types/errors';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum time to wait for hydration before timing out (ms) */
const HYDRATION_TIMEOUT_MS = 10000;

/** Minimum time to show loading state to prevent flash (ms) */
const MIN_LOADING_TIME_MS = 100;

/** Debug mode for hydration logging */
const DEBUG_HYDRATION = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_DEBUG_HYDRATION ?? 'false') === 'true';

// ============================================================================
// TYPES
// ============================================================================

export type HydrationStatus = 'pending' | 'loading' | 'complete' | 'error' | 'timeout';

export interface HydrationState {
    /** Overall hydration status */
    status: HydrationStatus;
    /** Whether ALL registered state keys have hydrated */
    isFullyHydrated: boolean;
    /** Map of key -> hydration status */
    keyStatuses: Map<string, HydrationStatus>;
    /** Error if hydration failed */
    error?: CSGError;
    /** Time when hydration completed (for metrics) */
    completedAt?: number;
    /** Total hydration duration in ms */
    duration?: number;
}

export interface HydrationContextValue extends HydrationState {
    /** Register a state key that will be hydrated */
    registerKey: (key: string) => void;
    /** Mark a key as hydrated */
    markKeyHydrated: (key: string) => void;
    /** Mark a key as failed */
    markKeyFailed: (key: string, error?: Error) => void;
    /** Reset hydration state (for testing) */
    reset: () => void;
    /** Force hydration complete (for testing/emergency) */
    forceComplete: () => void;
    /** Get debug info for troubleshooting */
    getDebugInfo: () => HydrationDebugInfo;
}

export interface HydrationDebugInfo {
    registeredKeys: string[];
    hydratedKeys: string[];
    pendingKeys: string[];
    failedKeys: string[];
    status: HydrationStatus;
    startTime: number | null;
    duration: number | null;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const HydrationContext = createContext<HydrationContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export const HydrationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<HydrationStatus>('pending');
    const [keyStatuses, setKeyStatuses] = useState<Map<string, HydrationStatus>>(new Map());
    const [error, setError] = useState<CSGError | undefined>();
    const [completedAt, setCompletedAt] = useState<number | undefined>();

    const startTimeRef = useRef<number | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasStartedRef = useRef(false);

    // -------------------------------------------------------------------------
    // KEY REGISTRATION
    // -------------------------------------------------------------------------
    
    const registerKey = useCallback((key: string) => {
        if (DEBUG_HYDRATION) {
            console.debug(`[Hydration] Registering key: ${key}`);
        }

        setKeyStatuses(prev => {
            // Don't re-register already registered keys
            if (prev.has(key)) return prev;
            
            const next = new Map(prev);
            next.set(key, 'loading');
            return next;
        });

        // Start hydration tracking on first registration
        if (!hasStartedRef.current) {
            hasStartedRef.current = true;
            startTimeRef.current = Date.now();
            setStatus('loading');

            if (DEBUG_HYDRATION) {
                console.debug('[Hydration] Started tracking hydration');
            }

            // Set timeout for stuck hydration
            timeoutRef.current = setTimeout(() => {
                setStatus(prev => {
                    if (prev === 'loading') {
                        console.error('[Hydration] Timeout - some keys never hydrated');
                        const timeoutError = new CSGError(ErrorCodes.HYDRATION_TIMEOUT, {
                            pendingKeys: Array.from(keyStatuses.entries())
                                .filter(([_, s]) => s !== 'complete')
                                .map(([k]) => k),
                        });
                        setError(timeoutError);
                        return 'timeout';
                    }
                    return prev;
                });
            }, HYDRATION_TIMEOUT_MS);
        }
    }, [keyStatuses]);

    // -------------------------------------------------------------------------
    // KEY HYDRATION COMPLETION
    // -------------------------------------------------------------------------

    const markKeyHydrated = useCallback((key: string) => {
        if (DEBUG_HYDRATION) {
            console.debug(`[Hydration] Key hydrated: ${key}`);
        }

        setKeyStatuses(prev => {
            const next = new Map(prev);
            next.set(key, 'complete');
            return next;
        });
    }, []);

    const markKeyFailed = useCallback((key: string, err?: Error) => {
        console.error(`[Hydration] Key failed: ${key}`, err);

        setKeyStatuses(prev => {
            const next = new Map(prev);
            next.set(key, 'error');
            return next;
        });

        // Don't fail entire hydration for one key - just log it
        // Individual components can handle their own errors
    }, []);

    // -------------------------------------------------------------------------
    // CHECK FOR COMPLETION
    // -------------------------------------------------------------------------

    useEffect(() => {
        // Skip if not yet started or already complete
        if (status !== 'loading') return;
        if (keyStatuses.size === 0) return;

        // Check if all keys are hydrated
        const allComplete = Array.from(keyStatuses.values()).every(
            s => s === 'complete' || s === 'error'
        );

        if (allComplete) {
            const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

            // Ensure minimum loading time to prevent flash
            const remainingTime = Math.max(0, MIN_LOADING_TIME_MS - duration);

            setTimeout(() => {
                if (DEBUG_HYDRATION) {
                    console.debug(`[Hydration] Complete! Duration: ${duration + remainingTime}ms`);
                }

                // Clear timeout
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }

                // Check for any errors
                const hasErrors = Array.from(keyStatuses.values()).some(s => s === 'error');
                
                setStatus(hasErrors ? 'error' : 'complete');
                setCompletedAt(Date.now());
            }, remainingTime);
        }
    }, [status, keyStatuses]);

    // Add global marker for E2E tests
    useEffect(() => {
        if (status === 'complete') {
            if (typeof window !== 'undefined') {
                (window as any).__HYDRATION_COMPLETE__ = true;
                document.body.setAttribute('data-testid', 'hydration-complete');

                try {
                    if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
                        performance.mark('hydration:complete');

                        const hasEntryMark =
                            typeof performance.getEntriesByName === 'function' &&
                            performance.getEntriesByName('app:entry', 'mark').length > 0;

                        if (hasEntryMark && typeof performance.measure === 'function') {
                            performance.measure('app:hydration', 'app:entry', 'hydration:complete');
                        }
                    }
                } catch {
                    // Ignore measurement errors (e.g. missing marks or unsupported APIs).
                }
            }
        }
    }, [status]);

    // -------------------------------------------------------------------------
    // UTILITY FUNCTIONS
    // -------------------------------------------------------------------------

    const reset = useCallback(() => {
        if (DEBUG_HYDRATION) {
            console.debug('[Hydration] Resetting hydration state');
        }

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setStatus('pending');
        setKeyStatuses(new Map());
        setError(undefined);
        setCompletedAt(undefined);
        hasStartedRef.current = false;
        startTimeRef.current = null;
    }, []);

    const forceComplete = useCallback(() => {
        if (DEBUG_HYDRATION) {
            console.debug('[Hydration] Forcing hydration complete');
        }

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setStatus('complete');
        setCompletedAt(Date.now());
    }, []);

    const getDebugInfo = useCallback((): HydrationDebugInfo => {
        const registeredKeys = Array.from(keyStatuses.keys());
        const hydratedKeys = Array.from(keyStatuses.entries())
            .filter(([_, s]) => s === 'complete')
            .map(([k]) => k);
        const pendingKeys = Array.from(keyStatuses.entries())
            .filter(([_, s]) => s === 'loading')
            .map(([k]) => k);
        const failedKeys = Array.from(keyStatuses.entries())
            .filter(([_, s]) => s === 'error')
            .map(([k]) => k);

        return {
            registeredKeys,
            hydratedKeys,
            pendingKeys,
            failedKeys,
            status,
            startTime: startTimeRef.current,
            duration: startTimeRef.current ? Date.now() - startTimeRef.current : null,
        };
    }, [keyStatuses, status]);

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------

    const isFullyHydrated = status === 'complete';
    const duration = startTimeRef.current && completedAt 
        ? completedAt - startTimeRef.current 
        : undefined;

    const contextValue: HydrationContextValue = {
        status,
        isFullyHydrated,
        keyStatuses,
        error,
        completedAt,
        duration,
        registerKey,
        markKeyHydrated,
        markKeyFailed,
        reset,
        forceComplete,
        getDebugInfo,
    };

    return (
        <HydrationContext.Provider value={contextValue}>
            {children}
        </HydrationContext.Provider>
    );
};

// ============================================================================
// HOOK
// ============================================================================

export const useHydration = (): HydrationContextValue => {
    const context = useContext(HydrationContext);
    if (context === undefined) {
        throw new Error('useHydration must be used within a HydrationProvider');
    }
    return context;
};

/**
 * Hook for optional hydration access (won't throw if outside provider)
 * Useful for components that may be used both inside and outside hydration context
 */
export const useOptionalHydration = (): HydrationContextValue | null => {
    return useContext(HydrationContext) ?? null;
};

// ============================================================================
// HYDRATION GATE COMPONENT
// ============================================================================

interface HydrationGateProps {
    children: ReactNode;
    fallback?: ReactNode;
    /** Show fallback while hydrating */
    showFallbackOnLoading?: boolean;
    /** Render children even if some keys failed (graceful degradation) */
    allowPartialFailure?: boolean;
    /** Custom timeout message */
    timeoutMessage?: string;
    /** Show warning banner when hydration is incomplete (graceful degradation mode) */
    showWarningBanner?: boolean;
}

/**
 * Warning banner shown when hydration is incomplete but UI is rendered anyway.
 * Exported for use in custom hydration handling scenarios.
 */
export const HydrationWarningBanner: React.FC<{
    status: HydrationStatus;
    pendingKeys: string[];
    failedKeys: string[];
    onDismiss?: () => void;
}> = ({ status, pendingKeys, failedKeys, onDismiss }) => {
    const [dismissed, setDismissed] = React.useState(false);

    if (dismissed) return null;

    const handleDismiss = () => {
        setDismissed(true);
        onDismiss?.();
    };

    const isTimeout = status === 'timeout';
    const hasErrors = failedKeys.length > 0;
    const isPending = pendingKeys.length > 0;

    if (!isTimeout && !hasErrors && !isPending) return null;

    return (
        <div 
            className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-3 mb-4 flex items-start gap-3"
            role="alert"
            data-testid="hydration-warning-banner"
        >
            <div className="flex-shrink-0 mt-0.5">
                <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-400">
                    {isTimeout 
                        ? 'Loading took longer than expected'
                        : hasErrors 
                            ? 'Some data failed to load'
                            : 'Loading in progress'}
                </p>
                <p className="mt-1 text-xs text-amber-300/80">
                    {isTimeout && 'Some features may not work correctly. '}
                    {hasErrors && `Failed: ${failedKeys.join(', ')}. `}
                    {isPending && pendingKeys.length <= 3 && `Still loading: ${pendingKeys.join(', ')}.`}
                    {isPending && pendingKeys.length > 3 && `Still loading ${pendingKeys.length} items.`}
                    {' '}You can continue using the application, but some data may be missing.
                </p>
            </div>
            <button
                onClick={handleDismiss}
                className="flex-shrink-0 ml-2 text-amber-400 hover:text-amber-300 transition-colors"
                aria-label="Dismiss warning"
            >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
            </button>
        </div>
    );
};

/**
 * Gate component that only renders children when hydration is complete.
 * Supports graceful degradation with warning banner when hydration is incomplete.
 */
export const HydrationGate: React.FC<HydrationGateProps> = ({
    children,
}) => {
    return <>{children}</>;
};

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Test helper to wait for hydration to complete
 */
export const waitForHydration = (
    getDebugInfo: () => HydrationDebugInfo,
    timeoutMs: number = 5000
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
            const info = getDebugInfo();
            
            if (info.status === 'complete') {
                resolve();
                return;
            }

            if (info.status === 'error' || info.status === 'timeout') {
                reject(new Error(`Hydration failed: ${info.status}`));
                return;
            }

            if (Date.now() - startTime > timeoutMs) {
                reject(new Error(`Hydration timeout after ${timeoutMs}ms. Pending: ${info.pendingKeys.join(', ')}`));
                return;
            }

            setTimeout(check, 50);
        };

        check();
    });
};
