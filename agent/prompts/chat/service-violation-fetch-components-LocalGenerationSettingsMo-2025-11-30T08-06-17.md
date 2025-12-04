# Fix: SERVICE-LAYER Issue

## Problem
Direct fetch() call in component. Should use service layer.

## Location
- **File**: `components\LocalGenerationSettingsModal.tsx`
- **Line**: N/A
- **Severity**: medium

## Source Context
```tsx
import React, { useState, useEffect } from 'react';
import { LocalGenerationSettings, WorkflowProfile } from '../types';
import { 
    validateWorkflows, 
    parseError, 
    HELP_DOCS,
    type ValidationResult
} from '../utils/settingsValidation';
import {
    FEATURE_FLAG_META,
    DEFAULT_FEATURE_FLAGS,
    mergeFeatureFlags,
    getFlagsByCategory,
    checkFlagDependencies,
    validateFlagCombination,
} from '../utils/featureFlags';

interface LocalGenerationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (newSettings: LocalGenerationSettings) => void;
    addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface ConnectionStatus {
    llm: { 
        status: 'idle' | 'testing' | 'success' | 'error'; 
        message: string;
        models?: string[];
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
