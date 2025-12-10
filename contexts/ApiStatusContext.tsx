import React, { useState, createContext, useContext, ReactNode } from 'react';
import { HydrationGate } from './HydrationContext';

export type ApiStatus = 'idle' | 'bundling' | 'loading' | 'retrying' | 'error' | 'success';

export interface ApiStatusState {
  status: ApiStatus;
  message: string;
}

interface ApiStatusContextValue {
  apiStatus: ApiStatusState;
  setApiStatus: React.Dispatch<React.SetStateAction<ApiStatusState>>;
  // A helper to make setting status easier - accepts either object form or two arguments
  updateApiStatus: (statusOrState: ApiStatus | Partial<ApiStatusState>, message?: string) => void;
}

const ApiStatusContext = createContext<ApiStatusContextValue | undefined>(undefined);

export const ApiStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [apiStatus, setApiStatus] = useState<ApiStatusState>({ status: 'idle', message: '' });

  const updateApiStatus = React.useCallback((statusOrState: ApiStatus | Partial<ApiStatusState>, message?: string) => {
    if (typeof statusOrState === 'object') {
      setApiStatus(prev => ({ ...prev, ...statusOrState }));
    } else {
      setApiStatus({ status: statusOrState, message: message ?? '' });
    }
  }, []);
  
  // P2 Optimization (2025-11-20): Memoize context value to prevent unnecessary re-renders
  const contextValue = React.useMemo(() => ({ 
    apiStatus, 
    setApiStatus, 
    updateApiStatus 
  }), [apiStatus, updateApiStatus]);
  
  return (
    <ApiStatusContext.Provider value={contextValue}>
      <HydrationGate>
        {children}
      </HydrationGate>
    </ApiStatusContext.Provider>
  );
};

export const useApiStatus = (): ApiStatusContextValue => {
  const context = useContext(ApiStatusContext);
  if (context === undefined) {
    throw new Error('useApiStatus must be used within an ApiStatusProvider');
  }
  return context;
};
