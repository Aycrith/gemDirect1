import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { TemplateMetadata } from '../services/templateLoader';

export interface TemplateContextValue {
  selectedTemplate: TemplateMetadata | null;
  mandatoryElements: string[];
  coveredElements: Set<string>;
  elementCoverage: Record<string, boolean>;
  coveragePercentage: number;
  
  setSelectedTemplate: (template: TemplateMetadata | null) => void;
  updateCoveredElements: (sceneContent: string) => void;
  resetCoverage: () => void;
}

const TemplateContext = createContext<TemplateContextValue | undefined>(undefined);

interface TemplateContextProviderProps {
  children: ReactNode;
}

export const TemplateContextProvider: React.FC<TemplateContextProviderProps> = ({ children }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMetadata | null>(null);
  const [coveredElements, setCoveredElements] = useState<Set<string>>(new Set());
  
  const mandatoryElements = useMemo(() => {
    return selectedTemplate?.mandatory_elements ?? [];
  }, [selectedTemplate]);
  
  const elementCoverage = useMemo(() => {
    const coverage: Record<string, boolean> = {};
    mandatoryElements.forEach(element => {
      coverage[element] = coveredElements.has(element);
    });
    return coverage;
  }, [mandatoryElements, coveredElements]);
  
  const coveragePercentage = useMemo(() => {
    if (mandatoryElements.length === 0) return 0;
    const covered = mandatoryElements.filter(elem => coveredElements.has(elem)).length;
    return Math.round((covered / mandatoryElements.length) * 100);
  }, [mandatoryElements, coveredElements]);
  
  const updateCoveredElements = useCallback((sceneContent: string) => {
    const newCovered = new Set(coveredElements);
    
    mandatoryElements.forEach(element => {
      // Check if element keywords appear in scene content
      const keywords = element.toLowerCase().split(/\s+/);
      const contentLower = sceneContent.toLowerCase();
      
      // Simple keyword matching: check if all significant keywords appear
      const allKeywordsPresent = keywords.every(keyword => {
        if (keyword.length < 3) return true; // Skip very short words
        return contentLower.includes(keyword);
      });
      
      if (allKeywordsPresent) {
        newCovered.add(element);
      } else {
        newCovered.delete(element);
      }
    });
    
    setCoveredElements(newCovered);
  }, [mandatoryElements, coveredElements]);
  
  const resetCoverage = useCallback(() => {
    setCoveredElements(new Set());
  }, []);
  
  const value: TemplateContextValue = {
    selectedTemplate,
    mandatoryElements,
    coveredElements,
    elementCoverage,
    coveragePercentage,
    setSelectedTemplate,
    updateCoveredElements,
    resetCoverage,
  };
  
  return (
    <TemplateContext.Provider value={value}>
      {children}
    </TemplateContext.Provider>
  );
};

export const useTemplateContext = (): TemplateContextValue => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplateContext must be used within TemplateContextProvider');
  }
  return context;
};
