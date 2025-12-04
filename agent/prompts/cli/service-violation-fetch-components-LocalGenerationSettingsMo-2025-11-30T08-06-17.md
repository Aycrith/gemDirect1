Fix this service-layer issue in components\LocalGenerationSettingsModal.tsx:

ISSUE: Direct fetch() call in component. Should use service layer.

SEVERITY: medium

CONTEXT:
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

SUGGESTED FIX: Move API call to appropriate service in services/

REQUIREMENTS:
- Fix must be TypeScript-safe
- Must not break existing functionality
- Should follow project patterns

Provide the exact code change needed.