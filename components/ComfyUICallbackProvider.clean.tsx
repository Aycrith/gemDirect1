import React, { useEffect } from 'react';
import { useComfyUICallbackManager } from '../utils/hooks';

interface ComfyUICallbackProviderProps {
  children: React.ReactNode;
  onWorkflowComplete?: (workflowId: string) => void;
}

const ComfyUICallbackProvider: React.FC<ComfyUICallbackProviderProps> = ({
  children,
  onWorkflowComplete,
}) => {
  const { isInitialized, lastWorkflow } = useComfyUICallbackManager();

  useEffect(() => {
    if (lastWorkflow && onWorkflowComplete) {
      onWorkflowComplete(lastWorkflow.runId);
    }
  }, [lastWorkflow, onWorkflowComplete]);

  useEffect(() => {
    if (isInitialized) {
      console.log('✓ ComfyUI Callback Manager initialized - Historical data auto-ingestion active');
    }
  }, [isInitialized]);

  return <>{children}</>;
};

export default ComfyUICallbackProvider;
