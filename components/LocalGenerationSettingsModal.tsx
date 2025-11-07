
import React, { useState, useEffect, useCallback } from 'react';
import { LocalGenerationSettings, WorkflowInput, MappableData, WorkflowMapping } from '../types';
import ServerIcon from './icons/ServerIcon';
import SettingsIcon from './icons/SettingsIcon';
import FileTextIcon from './icons/FileTextIcon';
import ImageIcon from './icons/ImageIcon';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (settings: LocalGenerationSettings) => void;
}

const parseWorkflowForInputs = (workflowJson: string): WorkflowInput[] => {
    try {
        const workflow = JSON.parse(workflowJson);
        const prompt = workflow.prompt || workflow; // Handle both API and embedded formats
        const inputs: WorkflowInput[] = [];
        
        Object.entries(prompt).forEach(([nodeId, node]: [string, any]) => {
            if (node.inputs) {
                const nodeTitle = node._meta?.title || `Node ${nodeId}`;
                
                // Specifically look for text/string inputs in common nodes
                if (node.class_type.includes("Text") || node.class_type.includes("Prompt")) {
                    Object.entries(node.inputs).forEach(([inputName, value]) => {
                        if (typeof value === 'string' && (inputName.includes('text') || inputName.includes('prompt'))) {
                            inputs.push({ nodeId, nodeType: node.class_type, nodeTitle, inputName, inputType: 'STRING' });
                        }
                    });
                }
                // Look for image inputs in LoadImage nodes
                if (node.class_type === 'LoadImage' && node.inputs.image) {
                     inputs.push({ nodeId, nodeType: node.class_type, nodeTitle, inputName: 'image', inputType: 'IMAGE' });
                }
            }
        });
        return inputs;
    } catch (e) {
        console.error("Failed to parse workflow:", e);
        return [];
    }
};

const LocalGenerationSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState<LocalGenerationSettings>(settings);
    const [workflowInputs, setWorkflowInputs] = useState<WorkflowInput[]>([]);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [syncError, setSyncError] = useState('');

    useEffect(() => {
        setLocalSettings(settings);
        if (settings.workflowJson) {
            setWorkflowInputs(parseWorkflowForInputs(settings.workflowJson));
        }
    }, [settings, isOpen]);

    const handleSyncWorkflow = useCallback(async () => {
        if (!localSettings.comfyUIUrl) {
            setSyncError("Please enter a valid ComfyUI server address.");
            setSyncStatus('error');
            return;
        }
        setSyncStatus('syncing');
        setSyncError('');
        try {
            const url = localSettings.comfyUIUrl.endsWith('/') ? `${localSettings.comfyUIUrl}workflow` : `${localSettings.comfyUIUrl}/workflow`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const workflowJson = await response.text();

            // Reset mapping when syncing a new workflow
            const newMapping: WorkflowMapping = {};
            setLocalSettings(prev => ({...prev, workflowJson, mapping: newMapping }));
            setWorkflowInputs(parseWorkflowForInputs(workflowJson));
            setSyncStatus('success');
        } catch (error) {
            console.error(error);
            const errorMsg = error instanceof Error ? error.message : "An unknown error occurred.";
            setSyncError(`Failed to sync workflow. Is the server running and accessible? Error: ${errorMsg}`);
            setSyncStatus('error');
        }
    }, [localSettings.comfyUIUrl]);

    const handleMappingChange = (key: string, value: MappableData) => {
        setLocalSettings(prev => ({
            ...prev,
            mapping: { ...prev.mapping, [key]: value }
        }));
    };

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700">
                    <h3 className="flex items-center text-lg font-bold text-indigo-400">
                        <SettingsIcon className="w-5 h-5 mr-2" />
                        Local Generation Settings
                    </h3>
                </header>
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Server Config */}
                    <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg ring-1 ring-gray-700/50">
                        <h4 className="font-semibold text-gray-200 flex items-center"><ServerIcon className="w-5 h-5 mr-2 text-gray-400"/>ComfyUI Server</h4>
                        <div>
                            <label htmlFor="comfy-url" className="text-sm font-medium text-gray-300">Server Address</label>
                            <input id="comfy-url" type="text" value={localSettings.comfyUIUrl} onChange={e => setLocalSettings(p => ({...p, comfyUIUrl: e.target.value}))} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md p-2 text-sm" placeholder="http://127.0.0.1:8188"/>
                        </div>
                         <div>
                            <label htmlFor="client-id" className="text-sm font-medium text-gray-300">Client ID</label>
                            <input id="client-id" type="text" value={localSettings.comfyUIClientId} onChange={e => setLocalSettings(p => ({...p, comfyUIClientId: e.target.value}))} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md p-2 text-sm" placeholder="unique_client_id"/>
                        </div>
                    </div>

                    {/* Workflow Sync & Mapping */}
                    <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg ring-1 ring-gray-700/50">
                        <h4 className="font-semibold text-gray-200">Workflow Configuration</h4>
                        <button onClick={handleSyncWorkflow} disabled={syncStatus === 'syncing'} className="w-full text-center px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500">
                            {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Workflow from Server'}
                        </button>
                        {syncStatus === 'error' && <p className="text-xs text-red-400">{syncError}</p>}
                        {syncStatus === 'success' && <p className="text-xs text-green-400">Workflow synced successfully! Parsed {workflowInputs.length} potential inputs.</p>}
                        
                        {workflowInputs.length > 0 && (
                            <div className="space-y-3 pt-4 border-t border-gray-600">
                                <h5 className="text-md font-semibold text-gray-300">Map Timeline Data to Workflow Inputs</h5>
                                {workflowInputs.map(input => {
                                    const key = `${input.nodeId}:${input.inputName}`;
                                    const Icon = input.inputType === 'IMAGE' ? ImageIcon : FileTextIcon;
                                    return (
                                        <div key={key} className="flex items-center justify-between gap-4 p-2 bg-gray-800/50 rounded-md">
                                            <div className="flex items-center gap-2 text-sm text-gray-300">
                                                <Icon className="w-4 h-4 text-gray-400" />
                                                <div>
                                                    <span className="font-bold">{input.nodeTitle}</span>
                                                    <span className="text-gray-400"> &rarr; {input.inputName}</span>
                                                </div>
                                            </div>
                                            <select value={localSettings.mapping[key] || 'none'} onChange={e => handleMappingChange(key, e.target.value as MappableData)} className="bg-gray-700 border-gray-600 rounded-md p-1.5 text-xs">
                                                <option value="none">-- Don't Map --</option>
                                                {input.inputType === 'STRING' && <>
                                                    <option value="human_readable_prompt">Human-Readable Prompt</option>
                                                    <option value="full_timeline_json">Full Timeline JSON</option>
                                                </>}
                                                {input.inputType === 'IMAGE' && <>
                                                    <option value="keyframe_image">Keyframe Image</option>
                                                </>}
                                            </select>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <footer className="p-4 mt-auto border-t border-gray-700 flex justify-end gap-4 bg-gray-900/50 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold rounded-md bg-green-600 text-white hover:bg-green-700">Save Settings</button>
                </footer>
            </div>
        </div>
    );
};

export default LocalGenerationSettingsModal;
