/**
 * ProgressContext - Unified progress tracking for all generation operations
 * 
 * This context provides a centralized way to track progress across:
 * - LLM text generation (indeterminate with status text)
 * - Batch operations (determinate with current/total)
 * - ComfyUI image/video generation (determinate with percentage)
 * - Vision analysis (indeterminate with status)
 * 
 * Features:
 * - Prominent visual feedback during long operations
 * - Stacked progress for concurrent operations
 * - Cancellation support (where underlying service allows)
 * - Error state display with user-friendly messages
 * 
 * @created 2025-11-30
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { HydrationGate } from './HydrationContext';

export type ProgressType = 
  | 'llm'           // LLM text generation (indeterminate)
  | 'vision'        // Vision analysis (indeterminate)
  | 'batch'         // Batch operations (determinate)
  | 'comfyui'       // ComfyUI generation (determinate with percentage)
  | 'general';      // General operation (indeterminate)

export type ProgressStatus = 
  | 'idle'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface ProgressOperation {
  /** Unique identifier for this operation */
  id: string;
  /** Type of operation (determines display style) */
  type: ProgressType;
  /** Current status */
  status: ProgressStatus;
  /** User-visible task description (e.g., "Generating story bible...") */
  task: string;
  /** Optional detailed message (e.g., "Processing shot 2 of 5") */
  message?: string;
  /** Progress percentage (0-100) for determinate progress */
  percentage?: number;
  /** Current item number for batch operations */
  current?: number;
  /** Total items for batch operations */
  total?: number;
  /** Start timestamp */
  startedAt: number;
  /** Error message if status is 'error' */
  error?: string;
  /** Whether this operation can be cancelled */
  cancellable?: boolean;
}

interface ProgressContextValue {
  /** Active operations (most recent first) */
  operations: ProgressOperation[];
  
  /** Start a new operation */
  startOperation: (
    id: string, 
    type: ProgressType, 
    task: string, 
    options?: { 
      total?: number; 
      cancellable?: boolean;
      message?: string;
    }
  ) => void;
  
  /** Update an operation's progress */
  updateOperation: (
    id: string, 
    updates: Partial<Pick<ProgressOperation, 'status' | 'message' | 'percentage' | 'current' | 'task' | 'error'>>
  ) => void;
  
  /** Complete an operation successfully */
  completeOperation: (id: string, message?: string) => void;
  
  /** Mark an operation as failed */
  failOperation: (id: string, error: string) => void;
  
  /** Cancel an operation */
  cancelOperation: (id: string) => void;
  
  /** Clear a completed/failed operation */
  clearOperation: (id: string) => void;
  
  /** Clear all completed operations */
  clearCompleted: () => void;
  
  /** Check if any operation is active */
  hasActiveOperations: boolean;
  
  /** Get the most prominent operation to display */
  primaryOperation: ProgressOperation | null;
}

const ProgressContext = createContext<ProgressContextValue | undefined>(undefined);

export const ProgressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [operations, setOperations] = useState<ProgressOperation[]>([]);

  const startOperation = useCallback((
    id: string, 
    type: ProgressType, 
    task: string, 
    options?: { total?: number; cancellable?: boolean; message?: string }
  ) => {
    const newOp: ProgressOperation = {
      id,
      type,
      status: 'queued',
      task,
      message: options?.message,
      total: options?.total,
      current: options?.total ? 0 : undefined,
      startedAt: Date.now(),
      cancellable: options?.cancellable ?? false,
    };
    
    setOperations(prev => {
      // Remove any existing operation with same ID
      const filtered = prev.filter(op => op.id !== id);
      return [newOp, ...filtered];
    });
    
    // Immediately transition to processing
    setTimeout(() => {
      setOperations(prev => 
        prev.map(op => op.id === id && op.status === 'queued' 
          ? { ...op, status: 'processing' } 
          : op
        )
      );
    }, 100);
  }, []);

  const updateOperation = useCallback((
    id: string, 
    updates: Partial<Pick<ProgressOperation, 'status' | 'message' | 'percentage' | 'current' | 'task' | 'error'>>
  ) => {
    setOperations(prev => 
      prev.map(op => op.id === id ? { ...op, ...updates } : op)
    );
  }, []);

  const completeOperation = useCallback((id: string, message?: string) => {
    setOperations(prev => 
      prev.map(op => op.id === id 
        ? { ...op, status: 'complete', message: message ?? 'Complete', percentage: 100 } 
        : op
      )
    );
    
    // Auto-clear after 3 seconds
    setTimeout(() => {
      setOperations(prev => prev.filter(op => op.id !== id));
    }, 3000);
  }, []);

  const failOperation = useCallback((id: string, error: string) => {
    setOperations(prev => 
      prev.map(op => op.id === id 
        ? { ...op, status: 'error', error } 
        : op
      )
    );
  }, []);

  const cancelOperation = useCallback((id: string) => {
    setOperations(prev => 
      prev.map(op => op.id === id 
        ? { ...op, status: 'cancelled', message: 'Cancelled by user' } 
        : op
      )
    );
    
    // Auto-clear after 2 seconds
    setTimeout(() => {
      setOperations(prev => prev.filter(op => op.id !== id));
    }, 2000);
  }, []);

  const clearOperation = useCallback((id: string) => {
    setOperations(prev => prev.filter(op => op.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setOperations(prev => 
      prev.filter(op => op.status !== 'complete' && op.status !== 'cancelled')
    );
  }, []);

  const hasActiveOperations = useMemo(() => 
    operations.some(op => op.status === 'processing' || op.status === 'queued'),
    [operations]
  );

  const primaryOperation = useMemo(() => {
    // Priority: processing > queued > error > complete
    const statusPriority: Record<ProgressStatus, number> = {
      processing: 4,
      queued: 3,
      error: 2,
      complete: 1,
      cancelled: 0,
      idle: 0,
    };
    
    return operations.reduce<ProgressOperation | null>((primary, op) => {
      if (!primary) return op;
      return statusPriority[op.status] > statusPriority[primary.status] ? op : primary;
    }, null);
  }, [operations]);

  const contextValue = useMemo<ProgressContextValue>(() => ({
    operations,
    startOperation,
    updateOperation,
    completeOperation,
    failOperation,
    cancelOperation,
    clearOperation,
    clearCompleted,
    hasActiveOperations,
    primaryOperation,
  }), [
    operations,
    startOperation,
    updateOperation,
    completeOperation,
    failOperation,
    cancelOperation,
    clearOperation,
    clearCompleted,
    hasActiveOperations,
    primaryOperation,
  ]);

  return (
    <ProgressContext.Provider value={contextValue}>
      <HydrationGate>
        {children}
      </HydrationGate>
    </ProgressContext.Provider>
  );
};

export const useProgress = (): ProgressContextValue => {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};

/**
 * Helper hook for simple operation tracking
 * Automatically generates ID and provides simplified API
 */
export function useOperationProgress(operationName: string) {
  const { startOperation, updateOperation, completeOperation, failOperation } = useProgress();
  const operationId = useMemo(() => `${operationName}-${Date.now()}`, [operationName]);
  
  return {
    start: (task: string, options?: { total?: number; cancellable?: boolean }) => {
      startOperation(operationId, 'general', task, options);
    },
    update: (updates: Partial<Pick<ProgressOperation, 'message' | 'percentage' | 'current' | 'task'>>) => {
      updateOperation(operationId, updates);
    },
    complete: (message?: string) => {
      completeOperation(operationId, message);
    },
    fail: (error: string) => {
      failOperation(operationId, error);
    },
    operationId,
  };
}

/**
 * Bridge hook that syncs ApiStatusContext changes to ProgressContext
 * 
 * This allows existing code using updateApiStatus() to automatically
 * show the new global progress indicator without modification.
 * 
 * Usage: Call this hook once at the app level (e.g., in AppContent)
 */
export function useApiStatusProgressBridge(apiStatus: { status: string; message: string }) {
  const { startOperation, updateOperation, completeOperation, failOperation, clearOperation } = useProgress();
  const operationIdRef = React.useRef<string | null>(null);
  
  React.useEffect(() => {
    const { status, message } = apiStatus;
    
    // Ignore idle status
    if (status === 'idle' && !operationIdRef.current) {
      return;
    }
    
    // Map ApiStatus to ProgressContext operations
    if (status === 'loading' || status === 'bundling') {
      // Start new operation or update existing
      if (!operationIdRef.current) {
        operationIdRef.current = `api-bridge-${Date.now()}`;
        startOperation(operationIdRef.current, 'llm', message || 'Processing...');
      } else {
        updateOperation(operationIdRef.current, { message });
      }
    } else if (status === 'retrying') {
      if (operationIdRef.current) {
        updateOperation(operationIdRef.current, { 
          message: message || 'Retrying...',
          status: 'processing'
        });
      }
    } else if (status === 'success') {
      if (operationIdRef.current) {
        completeOperation(operationIdRef.current, message);
        operationIdRef.current = null;
      }
    } else if (status === 'error') {
      if (operationIdRef.current) {
        failOperation(operationIdRef.current, message || 'An error occurred');
        operationIdRef.current = null;
      }
    } else if (status === 'idle') {
      // Clear any lingering operation
      if (operationIdRef.current) {
        clearOperation(operationIdRef.current);
        operationIdRef.current = null;
      }
    }
  }, [apiStatus, startOperation, updateOperation, completeOperation, failOperation, clearOperation]);
}
