import React, { createContext, useContext, useEffect } from 'react';
import { LocalGenerationSettings, WorkflowProfile, WorkflowProfileMetadata } from '../types';
import { usePersistentState } from '../utils/hooks';

const WORKFLOW_PROFILE_DEFINITIONS: Array<{ id: string; label: string }> = [
    { id: 'wan-t2i', label: 'WAN Text→Image (Keyframe)' },
    { id: 'wan-i2v', label: 'WAN Text+Image→Video' },
];
const PRIMARY_WORKFLOW_PROFILE_ID = 'wan-i2v';

const createDefaultProfileMetadata = (): WorkflowProfileMetadata => ({
    lastSyncedAt: Date.now(),
    highlightMappings: [],
    missingMappings: [],
    warnings: [],
});

const createDefaultWorkflowProfiles = (): Record<string, WorkflowProfile> =>
    WORKFLOW_PROFILE_DEFINITIONS.reduce((acc, def) => {
        acc[def.id] = {
            id: def.id,
            label: def.label,
            workflowJson: '',
            mapping: {},
            metadata: createDefaultProfileMetadata(),
        };
        return acc;
    }, {} as Record<string, WorkflowProfile>);

const normalizeWorkflowProfiles = (settings: LocalGenerationSettings): Record<string, WorkflowProfile> => {
    const source = settings.workflowProfiles ?? {};
        const primaryJson = source[PRIMARY_WORKFLOW_PROFILE_ID]?.workflowJson ?? settings.workflowJson ?? '';
        const primaryMapping = source[PRIMARY_WORKFLOW_PROFILE_ID]?.mapping ?? (settings.mapping ?? {});
        const primaryMetadata = source[PRIMARY_WORKFLOW_PROFILE_ID]?.metadata;

        return WORKFLOW_PROFILE_DEFINITIONS.reduce((acc, def) => {
            const previous = source[def.id];
            acc[def.id] = {
                id: def.id,
                label: def.label,
                workflowJson:
                    previous?.workflowJson ??
                    (def.id === PRIMARY_WORKFLOW_PROFILE_ID ? primaryJson : ''),
                mapping:
                    previous?.mapping ??
                    (def.id === PRIMARY_WORKFLOW_PROFILE_ID ? primaryMapping : {}),
                metadata:
                    previous?.metadata ??
                    (def.id === PRIMARY_WORKFLOW_PROFILE_ID
                        ? primaryMetadata ?? createDefaultProfileMetadata()
                        : createDefaultProfileMetadata()),
            };
            return acc;
        }, {} as Record<string, WorkflowProfile>);
};

export const DEFAULT_LOCAL_GENERATION_SETTINGS: LocalGenerationSettings = {
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: typeof crypto !== 'undefined' ? crypto.randomUUID() : '',
    comfyUIWebSocketUrl: 'ws://127.0.0.1:8188/ws',
    workflowJson: '',
    mapping: {},
    workflowProfiles: createDefaultWorkflowProfiles(),
    llmProviderUrl: 'http://192.168.50.192:1234/v1/chat/completions',
    llmModel: 'mistralai/mistral-7b-instruct-v0.3',
    llmTemperature: 0.35,
    llmTimeoutMs: 120000,
    llmRequestFormat: 'openai-chat',
};

type LocalGenerationSettingsContextValue = {
    settings: LocalGenerationSettings;
    setSettings: React.Dispatch<React.SetStateAction<LocalGenerationSettings>>;
};

const LocalGenerationSettingsContext = createContext<LocalGenerationSettingsContextValue | undefined>(undefined);

export const LocalGenerationSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = usePersistentState<LocalGenerationSettings>('localGenSettings', DEFAULT_LOCAL_GENERATION_SETTINGS);

    useEffect(() => {
        const hasAllProfiles = WORKFLOW_PROFILE_DEFINITIONS.every(def => Boolean(settings.workflowProfiles?.[def.id]));
        if (!hasAllProfiles) {
            const normalized = normalizeWorkflowProfiles(settings);
            setSettings(prev => ({
                ...prev,
                workflowProfiles: normalized,
                workflowJson: normalized[PRIMARY_WORKFLOW_PROFILE_ID]?.workflowJson ?? prev.workflowJson,
                mapping: normalized[PRIMARY_WORKFLOW_PROFILE_ID]?.mapping ?? prev.mapping,
            }));
        }
    }, [settings, setSettings]);

    // Make settings globally available for services
    useEffect(() => {
        if (typeof window !== 'undefined') {
            (window as any).__localGenSettings = settings;
        }
    }, [settings]);

    // P2 Optimization (2025-11-20): Memoize context value to prevent unnecessary re-renders
    const contextValue = React.useMemo(() => ({ settings, setSettings }), [settings, setSettings]);

    return (
        <LocalGenerationSettingsContext.Provider value={contextValue}>
            {children}
        </LocalGenerationSettingsContext.Provider>
    );
};

export const useLocalGenerationSettings = (): LocalGenerationSettingsContextValue => {
    const context = useContext(LocalGenerationSettingsContext);
    if (!context) {
        throw new Error('useLocalGenerationSettings must be used within a LocalGenerationSettingsProvider');
    }
    return context;
};
