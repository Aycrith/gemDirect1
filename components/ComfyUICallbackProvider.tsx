/**
 * ComfyUI Callback Integration Provider Component
 * 
 * Initializes the ComfyUI callback manager and provides workflow completion
 * event handling throughout the application. Automatically populates historical
 * data into IndexedDB when workflows complete.
 */

import React, { useEffect } from 'react';
import { useComfyUICallbackManager } from '../utils/hooks';

interface ComfyUICallbackProviderProps {
  children: React.ReactNode;
  onWorkflowComplete?: (workflowId: string) => void;
}

export const ComfyUICallbackProvider: React.FC<ComfyUICallbackProviderProps> = ({
  children,
  onWorkflowComplete
}) => {
  const { isInitialized, lastWorkflow } = useComfyUICallbackManager();

  // Trigger callback when workflow completes
  useEffect(() => {
    if (lastWorkflow && onWorkflowComplete) {
      onWorkflowComplete(lastWorkflow.runId);
    }
  }, [lastWorkflow, onWorkflowComplete]);

  // Log initialization status
  useEffect(() => {
    if (isInitialized) {
      console.log('✓ ComfyUI Callback Manager initialized - Historical data auto-ingestion active');
    }
  }, [isInitialized]);

  return <>{children}</>;
};

export default ComfyUICallbackProvider;
