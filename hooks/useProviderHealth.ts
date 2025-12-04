/**
 * Provider Health Hook
 * 
 * Provides real-time health monitoring for ComfyUI and other video generation providers.
 * Supports configurable polling intervals and automatic fallback logic.
 * 
 * @module hooks/useProviderHealth
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { LocalGenerationSettings } from '../types';
import { checkServerConnection, checkSystemResources, validateWorkflowAndMappings, getQueueInfo } from '../services/comfyUIService';
import { isFeatureEnabled } from '../utils/featureFlags';
import {
    ValidationResult,
    validationSuccess,
    validationFailure,
    createValidationError,
    createValidationWarning,
    ValidationErrorCodes,
} from '../types/validation';

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
    /** Provider is ready for generation */
    ready: boolean;
    /** Health check is in progress */
    checking: boolean;
    /** Last successful check timestamp */
    lastCheckedAt: number | null;
    /** Time until next check (ms) */
    nextCheckIn: number | null;
    /** Server connection status */
    serverConnected: boolean;
    /** GPU/system resources status */
    systemResources: string | null;
    /** Workflow validation status */
    workflowsValid: boolean;
    /** Current queue status */
    queueInfo: { queue_running: number; queue_pending: number } | null;
    /** Error message if unhealthy */
    error: string | null;
    /** Warnings (non-blocking issues) */
    warnings: string[];
}

/**
 * Provider health hook options
 */
export interface UseProviderHealthOptions {
    /** Settings containing ComfyUI URL and workflow profiles */
    settings: LocalGenerationSettings | null;
    /** Enable automatic polling (default: based on featureFlags.providerHealthPolling) */
    enablePolling?: boolean;
    /** Polling interval in ms (default: settings.healthCheckIntervalMs or 30000) */
    pollingIntervalMs?: number;
    /** Minimum polling interval (default: 5000ms) */
    minPollingIntervalMs?: number;
    /** Profile ID to validate (default: based on videoWorkflowProfile) */
    profileId?: string;
    /** Callback when health status changes */
    onHealthChange?: (status: ProviderHealthStatus) => void;
    /** Callback when provider becomes unhealthy */
    onUnhealthy?: (error: string) => void;
}

/**
 * Default health status
 */
const DEFAULT_HEALTH_STATUS: ProviderHealthStatus = {
    ready: false,
    checking: false,
    lastCheckedAt: null,
    nextCheckIn: null,
    serverConnected: false,
    systemResources: null,
    workflowsValid: false,
    queueInfo: null,
    error: null,
    warnings: [],
};

/**
 * Default polling interval (30 seconds)
 */
const DEFAULT_POLLING_INTERVAL_MS = 30000;

/**
 * Minimum polling interval (5 seconds)
 */
const MIN_POLLING_INTERVAL_MS = 5000;

/**
 * Hook for monitoring provider health
 * 
 * @param options - Configuration options
 * @returns Health status and control functions
 * 
 * @example
 * ```tsx
 * const { status, checkNow, startPolling, stopPolling } = useProviderHealth({
 *   settings: localGenSettings,
 *   enablePolling: true,
 *   onUnhealthy: (error) => showToast({ type: 'error', message: error })
 * });
 * 
 * if (!status.ready) {
 *   return <div>Provider unavailable: {status.error}</div>;
 * }
 * ```
 */
export function useProviderHealth(options: UseProviderHealthOptions): {
    status: ProviderHealthStatus;
    checkNow: () => Promise<ValidationResult<ProviderHealthStatus>>;
    startPolling: () => void;
    stopPolling: () => void;
    isPolling: boolean;
} {
    const {
        settings,
        enablePolling: enablePollingOption,
        pollingIntervalMs: customPollingInterval,
        minPollingIntervalMs = MIN_POLLING_INTERVAL_MS,
        profileId: customProfileId,
        onHealthChange,
        onUnhealthy,
    } = options;

    const [status, setStatus] = useState<ProviderHealthStatus>(DEFAULT_HEALTH_STATUS);
    const [isPolling, setIsPolling] = useState(false);
    
    const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastCheckPromiseRef = useRef<Promise<ValidationResult<ProviderHealthStatus>> | null>(null);
    // FIX (2025-12-01): Use ref for isPolling in checkHealth to avoid dependency cycle
    // The cycle was: isPolling -> checkHealth -> checkNow -> startPolling -> setIsPolling -> loop
    const isPollingRef = useRef(false);

    // Determine effective polling interval
    const effectivePollingInterval = Math.max(
        minPollingIntervalMs,
        customPollingInterval ?? settings?.healthCheckIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS
    );

    // Determine if polling should be enabled
    const shouldEnablePolling = enablePollingOption ?? 
        isFeatureEnabled(settings?.featureFlags, 'providerHealthPolling');

    // Determine profile ID to validate
    const profileId = customProfileId ?? settings?.videoWorkflowProfile ?? 'wan-i2v';

    /**
     * Perform a single health check
     */
    const checkHealth = useCallback(async (): Promise<ValidationResult<ProviderHealthStatus>> => {
        if (!settings?.comfyUIUrl) {
            const errorStatus: ProviderHealthStatus = {
                ...DEFAULT_HEALTH_STATUS,
                error: 'ComfyUI URL not configured',
            };
            setStatus(errorStatus);
            return validationFailure([
                createValidationError(
                    ValidationErrorCodes.PROVIDER_CONNECTION_FAILED,
                    'ComfyUI URL not configured'
                )
            ]);
        }

        // Update status to checking
        setStatus(prev => ({ ...prev, checking: true }));

        const warnings: string[] = [];
        let serverConnected = false;
        let systemResources: string | null = null;
        let workflowsValid = false;
        let queueInfo: { queue_running: number; queue_pending: number } | null = null;
        let error: string | null = null;

        try {
            // Step 1: Check server connection
            await checkServerConnection(settings.comfyUIUrl);
            serverConnected = true;

            // Step 2: Check system resources
            systemResources = await checkSystemResources(settings.comfyUIUrl);
            if (systemResources?.toLowerCase().includes('warning')) {
                warnings.push(systemResources);
            }

            // Step 3: Validate workflows (if video provider is comfyui-local)
            if (settings.videoProvider === 'comfyui-local' || !settings.videoProvider) {
                try {
                    validateWorkflowAndMappings(settings, profileId);
                    workflowsValid = true;
                } catch (validationError) {
                    const msg = validationError instanceof Error ? validationError.message : String(validationError);
                    warnings.push(`Workflow validation: ${msg}`);
                    workflowsValid = false;
                }
            } else {
                // Not using ComfyUI, skip workflow validation
                workflowsValid = true;
            }

            // Step 4: Check queue status
            try {
                queueInfo = await getQueueInfo(settings.comfyUIUrl);
            } catch (queueError) {
                // Non-critical - queue info is optional
                warnings.push('Could not retrieve queue status');
            }

        } catch (connectionError) {
            const msg = connectionError instanceof Error ? connectionError.message : String(connectionError);
            error = msg;
            serverConnected = false;
        }

        // Determine if provider is ready
        const ready = serverConnected && workflowsValid && !error;

        const newStatus: ProviderHealthStatus = {
            ready,
            checking: false,
            lastCheckedAt: Date.now(),
            // FIX (2025-12-01): Use isPollingRef to avoid dependency cycle
            nextCheckIn: isPollingRef.current ? effectivePollingInterval : null,
            serverConnected,
            systemResources,
            workflowsValid,
            queueInfo,
            error,
            warnings,
        };

        setStatus(newStatus);

        // Callbacks
        onHealthChange?.(newStatus);
        if (!ready && error) {
            onUnhealthy?.(error);
        }

        // Return validation result
        if (ready) {
            return validationSuccess(newStatus, 'Provider health check passed');
        } else {
            const errors = [];
            if (!serverConnected) {
                errors.push(createValidationError(
                    ValidationErrorCodes.PROVIDER_CONNECTION_FAILED,
                    error || 'Failed to connect to ComfyUI server'
                ));
            }
            if (!workflowsValid) {
                errors.push(createValidationError(
                    ValidationErrorCodes.WORKFLOW_INVALID_JSON,
                    'Workflow validation failed'
                ));
            }
            return validationFailure(errors, {
                warnings: warnings.map((w, i) => createValidationWarning(`WARN_${i}`, w)),
                message: error || 'Provider health check failed',
            });
        }
    // FIX (2025-12-01): Removed isPolling from dependencies to break the update cycle
    }, [settings, profileId, effectivePollingInterval, onHealthChange, onUnhealthy]);

    /**
     * Check health now (debounced to prevent concurrent checks)
     */
    const checkNow = useCallback(async (): Promise<ValidationResult<ProviderHealthStatus>> => {
        // Return existing promise if check is already in progress
        if (lastCheckPromiseRef.current) {
            return lastCheckPromiseRef.current;
        }

        const promise = checkHealth();
        lastCheckPromiseRef.current = promise;
        
        try {
            return await promise;
        } finally {
            lastCheckPromiseRef.current = null;
        }
    }, [checkHealth]);

    /**
     * Start polling
     */
    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            return; // Already polling
        }

        setIsPolling(true);
        isPollingRef.current = true; // FIX: Update ref for checkHealth
        
        // Immediate check
        checkNow();

        // Start interval
        pollingIntervalRef.current = setInterval(() => {
            checkNow();
        }, effectivePollingInterval);
    }, [checkNow, effectivePollingInterval]);

    /**
     * Stop polling
     */
    const stopPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setIsPolling(false);
        isPollingRef.current = false; // FIX: Update ref for checkHealth
        setStatus(prev => ({ ...prev, nextCheckIn: null }));
    }, []);

    // Auto-start polling if enabled
    useEffect(() => {
        if (shouldEnablePolling && settings?.comfyUIUrl) {
            startPolling();
        }

        return () => {
            stopPolling();
        };
    }, [shouldEnablePolling, settings?.comfyUIUrl, startPolling, stopPolling]);

    // Update countdown timer
    useEffect(() => {
        if (!isPolling || !status.lastCheckedAt) {
            return;
        }

        const countdownInterval = setInterval(() => {
            const elapsed = Date.now() - status.lastCheckedAt!;
            const remaining = Math.max(0, effectivePollingInterval - elapsed);
            setStatus(prev => ({ ...prev, nextCheckIn: remaining }));
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [isPolling, status.lastCheckedAt, effectivePollingInterval]);

    return {
        status,
        checkNow,
        startPolling,
        stopPolling,
        isPolling,
    };
}

/**
 * Standalone health check function (non-hook)
 * Useful for one-off validation before operations
 * 
 * @param settings - Local generation settings
 * @param profileId - Workflow profile ID to validate (default: 'wan-i2v')
 * @returns ValidationResult with health status
 */
export async function checkProviderHealth(
    settings: LocalGenerationSettings,
    profileId: string = 'wan-i2v'
): Promise<ValidationResult<ProviderHealthStatus>> {
    if (!settings.comfyUIUrl) {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.PROVIDER_CONNECTION_FAILED,
                'ComfyUI URL not configured'
            )
        ]);
    }

    const warnings: string[] = [];
    let serverConnected = false;
    let systemResources: string | null = null;
    let workflowsValid = false;
    let queueInfo: { queue_running: number; queue_pending: number } | null = null;

    try {
        // Server connection
        await checkServerConnection(settings.comfyUIUrl);
        serverConnected = true;

        // System resources
        systemResources = await checkSystemResources(settings.comfyUIUrl);
        if (systemResources?.toLowerCase().includes('warning')) {
            warnings.push(systemResources);
        }

        // Workflow validation
        if (settings.videoProvider === 'comfyui-local' || !settings.videoProvider) {
            try {
                validateWorkflowAndMappings(settings, profileId);
                workflowsValid = true;
            } catch (e) {
                warnings.push(`Workflow: ${e instanceof Error ? e.message : String(e)}`);
            }
        } else {
            workflowsValid = true;
        }

        // Queue info
        try {
            queueInfo = await getQueueInfo(settings.comfyUIUrl);
        } catch {
            warnings.push('Queue status unavailable');
        }

    } catch (e) {
        return validationFailure([
            createValidationError(
                ValidationErrorCodes.PROVIDER_CONNECTION_FAILED,
                e instanceof Error ? e.message : String(e)
            )
        ], {
            warnings: warnings.map((w, i) => createValidationWarning(`WARN_${i}`, w)),
        });
    }

    const ready = serverConnected && workflowsValid;
    const healthStatus: ProviderHealthStatus = {
        ready,
        checking: false,
        lastCheckedAt: Date.now(),
        nextCheckIn: null,
        serverConnected,
        systemResources,
        workflowsValid,
        queueInfo,
        error: null,
        warnings,
    };

    if (ready) {
        return validationSuccess(healthStatus, 'Provider healthy');
    }

    return validationFailure([
        createValidationError(
            ValidationErrorCodes.PROVIDER_UNHEALTHY,
            'Provider health check failed'
        )
    ], {
        warnings: warnings.map((w, i) => createValidationWarning(`WARN_${i}`, w)),
    });
}
