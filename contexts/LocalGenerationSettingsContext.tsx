import React, { createContext, useContext } from 'react';
import { LocalGenerationSettings } from '../types';
import { usePersistentState } from '../utils/hooks';

export const DEFAULT_LOCAL_GENERATION_SETTINGS: LocalGenerationSettings = {
    comfyUIUrl: '',
    comfyUIClientId: '',
    workflowJson: '',
    mapping: {},
};

type LocalGenerationSettingsContextValue = {
    settings: LocalGenerationSettings;
    setSettings: React.Dispatch<React.SetStateAction<LocalGenerationSettings>>;
};

const LocalGenerationSettingsContext = createContext<LocalGenerationSettingsContextValue | undefined>(undefined);

export const LocalGenerationSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = usePersistentState<LocalGenerationSettings>('localGenSettings', DEFAULT_LOCAL_GENERATION_SETTINGS);

    return (
        <LocalGenerationSettingsContext.Provider value={{ settings, setSettings }}>
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
