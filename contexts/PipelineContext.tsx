import React, { createContext, ReactNode } from 'react';
import { HydrationGate } from './HydrationContext';

export const PipelineContext = createContext<any>(null);

export const PipelineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <PipelineContext.Provider value={{}}>
        <HydrationGate>
            {children}
        </HydrationGate>
    </PipelineContext.Provider>
  );
};
