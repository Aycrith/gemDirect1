Fix this service-layer issue in components\AiConfigurator.tsx:

ISSUE: Direct fetch() call in component. Should use service layer.

SEVERITY: medium

CONTEXT:
```tsx
import React, { useState } from 'react';
import { LocalGenerationSettings, WorkflowMapping } from '../types';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useUsage } from '../contexts/UsageContext';
import SparklesIcon from './icons/SparklesIcon';
import { usePlanExpansionActions } from '../contexts/PlanExpansionStrategyContext';

interface AiConfiguratorProps {
    settings: LocalGenerationSettings;
    onUpdateSettings: (updater: (prev: LocalGenerationSettings) => LocalGenerationSettings) => void;
    addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const AiConfigurator: React.FC<AiConfiguratorProps> = ({ settings, onUpdateSettings, addToast }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();
    const planActions = usePlanExpansionActions();

    const handleAiConfigure = async () => {
        if (!settings.comfyUIUrl) {
            addToast('Please enter a valid ComfyUI server address first.', 'error');
            return;
        }
        setIsLoading(true);
        try {
            // Step 1: Fetch workflow from server (using history endpoint)
            updateApiStatus('loading', 'Syncing workflow from server...');
            const baseUrl = settings.comfyUIUrl.replace(/\/+$/, '');
            const historyUrl = `${baseUrl}/history`;
```

SUGGESTED FIX: Move API call to appropriate service in services/

REQUIREMENTS:
- Fix must be TypeScript-safe
- Must not break existing functionality
- Should follow project patterns

Provide the exact code change needed.