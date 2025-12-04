# Fix: SERVICE-LAYER Issue

## Problem
Direct fetch() call in component. Should use service layer.

## Location
- **File**: `components\AiConfigurator.tsx`
- **Line**: N/A
- **Severity**: medium

## Source Context
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


## Project Conventions
- Components must NOT call APIs directly
- Use services in `services/` directory
- Gemini calls go through `geminiService.ts`
- ComfyUI calls go through `comfyUIService.ts`

## Task
Please fix this issue following the project conventions. The fix should:
1. Address the root cause, not just the symptom
2. Maintain type safety (TypeScript strict mode)
3. Include any necessary imports
4. Preserve existing functionality

## Suggested Approach
Move API call to appropriate service in services/

## Expected Outcome
- The service-layer error/warning should be resolved
- No new issues should be introduced
- Code should pass `npm run typecheck` and `npm test`
