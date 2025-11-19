import React, { createContext, ReactNode } from 'react';

export const PipelineContext = createContext<any>(null);

export const PipelineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <PipelineContext.Provider value={{}}>{children}</PipelineContext.Provider>;
};
