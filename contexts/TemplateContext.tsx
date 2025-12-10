import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useRef } from 'react';
import { HydrationGate } from './HydrationContext';
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
  
  // FIX (2025-11-30): Use a ref to track coveredElements for comparison in updateCoveredElements.
  // This makes the callback reference stable (doesn't change when coveredElements changes),
  // preventing infinite loops when updateCoveredElements is called from a useEffect.
  const coveredElementsRef = useRef(coveredElements);
  coveredElementsRef.current = coveredElements;
  
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
  
  // FIX (2025-11-30): Removed coveredElements from dependencies to make callback stable.
  // Use ref to access current coveredElements without triggering callback recreation.
  // This prevents infinite loops when this callback is used as a useEffect dependency.
  const updateCoveredElements = useCallback((sceneContent: string) => {
    const newCovered = new Set(coveredElementsRef.current);
    
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
    
    // Only update if there's an actual change (compare Set contents)
    const currentCovered = coveredElementsRef.current;
    const hasChanges = newCovered.size !== currentCovered.size ||
      [...newCovered].some(elem => !currentCovered.has(elem)) ||
      [...currentCovered].some(elem => !newCovered.has(elem));
    
    if (hasChanges) {
      setCoveredElements(newCovered);
    }
  }, [mandatoryElements]);
  
  const resetCoverage = useCallback(() => {
    setCoveredElements(new Set());
  }, []);
  
  // P2 Optimization (2025-11-25): Memoize context value to prevent unnecessary re-renders
  const value = useMemo<TemplateContextValue>(() => ({
    selectedTemplate,
    mandatoryElements,
    coveredElements,
    elementCoverage,
    coveragePercentage,
    setSelectedTemplate,
    updateCoveredElements,
    resetCoverage,
  }), [
    selectedTemplate,
    mandatoryElements,
    coveredElements,
    elementCoverage,
    coveragePercentage,
    updateCoveredElements,
    resetCoverage,
  ]);
  
  return (
    <TemplateContext.Provider value={value}>
      <HydrationGate>
        {children}
      </HydrationGate>
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
