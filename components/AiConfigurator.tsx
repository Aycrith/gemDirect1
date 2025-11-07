import React, { useState } from 'react';
import { LocalGenerationSettings, WorkflowMapping } from '../types';
import { generateWorkflowMapping } from '../services/geminiService';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useUsage } from '../contexts/UsageContext';
import SparklesIcon from './icons/SparklesIcon';

interface AiConfiguratorProps {
    settings: LocalGenerationSettings;
    onUpdateSettings: (updater: (prev: LocalGenerationSettings) => LocalGenerationSettings) => void;
    addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const AiConfigurator: React.FC<AiConfiguratorProps> = ({ settings, onUpdateSettings, addToast }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();

    const handleAiConfigure = async () => {
        if (!settings.comfyUIUrl) {
            addToast('Please enter a valid ComfyUI server address first.', 'error');
            return;
        }
        setIsLoading(true);
        try {
            // Step 1: Fetch workflow from server
            updateApiStatus('loading', 'Syncing workflow from server...');
            const url = settings.comfyUIUrl.endsWith('/') ? `${settings.comfyUIUrl}workflow` : `${settings.comfyUIUrl}/workflow`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const workflowJson = await response.text();

            onUpdateSettings(prev => ({ ...prev, workflowJson }));

            // Step 2: Send to Gemini for mapping
            updateApiStatus('loading', 'AI is analyzing your workflow...');
            const mapping: WorkflowMapping = await generateWorkflowMapping(workflowJson, logApiCall, updateApiStatus);

            if (Object.keys(mapping).length === 0) {
                throw new Error("AI analysis could not determine any valid mappings. Please check your workflow.");
            }

            // Step 3: Apply the new settings
            onUpdateSettings(prev => ({ ...prev, workflowJson, mapping }));

            addToast('AI configuration complete! Workflow synced and mapped.', 'success');

        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Configuration failed: ${message}`, 'error');
            updateApiStatus('error', message);
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="p-3 bg-gray-800/50 rounded-lg border border-amber-500/30 text-center">
            <p className="text-sm text-amber-300 mb-3">
                New! Let our AI analyze your live ComfyUI workflow and configure the data mappings
                for you.
            </p>
            <button
                onClick={handleAiConfigure}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 disabled:bg-gray-500 transition-colors animate-glow"
            >
                <SparklesIcon className="w-5 h-5" />
                {isLoading ? 'Configuring...' : 'Configure with AI'}
            </button>
        </div>
    );
};

export default AiConfigurator;
