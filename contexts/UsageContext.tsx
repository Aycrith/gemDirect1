import React, { useState, createContext, useContext, ReactNode, useCallback } from 'react';
import { ApiCallLog } from '../types';

// Constants for cost estimation and rate limits
const GEMINI_PRO_COST_PER_1K_TOKENS = 0.003; // Blended rate for simplicity
const GEMINI_FLASH_COST_PER_1K_TOKENS = 0.0004; // Blended rate for simplicity
const IMAGE_MODEL_COST_PER_IMAGE = 0.0025; // Cost per image generation

export const RATE_LIMITS: Record<string, { rpm: number, name: string }> = {
    'gemini-2.5-pro': { rpm: 15, name: 'Gemini Pro' },
    'gemini-2.5-flash': { rpm: 60, name: 'Gemini Flash' },
    'gemini-2.5-flash-image': { rpm: 60, name: 'Gemini Flash Image' },
};

interface UsageState {
  logs: ApiCallLog[];
  totalTokens: number;
  totalRequests: number;
  estimatedCost: number;
}

interface UsageContextValue {
  usage: UsageState;
  logApiCall: (log: Omit<ApiCallLog, 'id' | 'timestamp'>) => void;
  clearUsage: () => void;
}

const UsageContext = createContext<UsageContextValue | undefined>(undefined);

const initialState: UsageState = {
    logs: [],
    totalTokens: 0,
    totalRequests: 0,
    estimatedCost: 0,
};

export const UsageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [usage, setUsage] = useState<UsageState>(initialState);

  const logApiCall = useCallback((log: Omit<ApiCallLog, 'id' | 'timestamp'>) => {
    setUsage(prev => {
        const newLog: ApiCallLog = { ...log, id: Date.now(), timestamp: Date.now() };
        
        const newTotalTokens = prev.totalTokens + log.tokens;
        const newTotalRequests = prev.totalRequests + 1;
        
        let costIncrement = 0;
        if (log.model.includes('pro')) {
            costIncrement = (log.tokens / 1000) * GEMINI_PRO_COST_PER_1K_TOKENS;
        } else if (log.model.includes('flash-image')) {
            costIncrement = IMAGE_MODEL_COST_PER_IMAGE;
        }
        else {
            costIncrement = (log.tokens / 1000) * GEMINI_FLASH_COST_PER_1K_TOKENS;
        }

        const newEstimatedCost = prev.estimatedCost + costIncrement;
        
        return {
            logs: [newLog, ...prev.logs],
            totalTokens: newTotalTokens,
            totalRequests: newTotalRequests,
            estimatedCost: newEstimatedCost,
        };
    });
  }, []);
  
  const clearUsage = useCallback(() => {
      setUsage(initialState);
  }, []);

  return (
    <UsageContext.Provider value={{ usage, logApiCall, clearUsage }}>
      {children}
    </UsageContext.Provider>
  );
};

export const useUsage = (): UsageContextValue => {
  const context = useContext(UsageContext);
  if (context === undefined) {
    throw new Error('useUsage must be used within a UsageProvider');
  }
  return context;
};
