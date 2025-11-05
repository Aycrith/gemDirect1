import React, { useState, createContext, useContext, ReactNode } from 'react';

export type ApiStatus = 'idle' | 'bundling' | 'loading' | 'retrying' | 'error' | 'success';

export interface ApiStatusState {
  status: ApiStatus;
  message: string;
}

interface ApiStatusContextValue {
  apiStatus: ApiStatusState;
  setApiStatus: React.Dispatch<React.SetStateAction<ApiStatusState>>;
  // A helper to make setting status easier
  updateApiStatus: (status: ApiStatus, message: string) => void;
}

const ApiStatusContext = createContext<ApiStatusContextValue | undefined>(undefined);

export const ApiStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [apiStatus, setApiStatus] = useState<ApiStatusState>({ status: 'idle', message: '' });

  const updateApiStatus = (status: ApiStatus, message: string) => {
    setApiStatus({ status, message });
  };
  
  return (
    <ApiStatusContext.Provider value={{ apiStatus, setApiStatus, updateApiStatus }}>
      {children}
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
