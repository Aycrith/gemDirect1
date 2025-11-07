import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LocalGenerationSettings, WorkflowInput, WorkflowMapping, MappableData } from '../types';
import ServerIcon from './icons/ServerIcon';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (settings: LocalGenerationSettings) => void;
}

const parseWorkflowForInputs = (workflowJson: string): WorkflowInput[] => {
    try {
        const workflow = JSON.parse(workflowJson);
        const inputs: WorkflowInput[] = [];
        
        const nodes = workflow.prompt || workflow;

        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            if (!node.inputs) continue;
            
            // Specifically identify LoadImage nodes for image mapping
            if (node.class_type === 'LoadImage' && node.inputs.image !== undefined) {
                 inputs.push({
                    nodeId,
                    nodeType: node.class_type,
                    nodeTitle: node._meta?.title || `Node ${nodeId}`,
                    inputName: 'image',
                    inputType: 'IMAGE',
                });
            }
            
            // Generic detection for any primitive input (not linked from another node)
            for (const inputName in node.inputs) {
                const inputVal = node.inputs[inputName];
                // A linked input is an array like `["node_id", output_index]`
                const isLinked = Array.isArray(inputVal) && inputVal.length === 2 && typeof inputVal[0] === 'string' && !isNaN(parseInt(inputVal[0], 10));

                if (!isLinked) {
                    // Avoid adding the 'image' input again if it's already caught
                    if (node.class_type === 'LoadImage' && inputName === 'image') continue;
                    
                    inputs.push({
                        nodeId,
                        nodeType: node.class_type,
                        nodeTitle: node._meta?.title || `Node ${nodeId}`,
                        inputName: inputName,
                        inputType: 'STRING', // Treat all other mappable primitives as string-injectable
                    });
                }
            }
        }
        return inputs.sort((a, b) => a.nodeTitle!.localeCompare(b.nodeTitle!));
    } catch (e) {
        return [];
    }
};


const LocalGenerationSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
    const [comfyUIUrl, setComfyUIUrl] = useState(settings.comfyUIUrl);
    const [comfyUIClientId] = useState(settings.comfyUIClientId);
    const [workflowJson, setWorkflowJson] = useState(settings.workflowJson);
    const [mapping, setMapping] = useState<WorkflowMapping>(settings.mapping);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

    const parsedInputs = useMemo(() => parseWorkflowForInputs(workflowJson), [workflowJson]);
    
    useEffect(() => {
        // When the modal opens, if a workflow is already loaded, mark it as success
        if (isOpen && settings.workflowJson) {
            setSyncStatus('success');
        } else if (!isOpen) {
            setSyncStatus('idle');
        }
    }, [isOpen, settings.workflowJson]);
    
    const handleSave = () => {
        onSave({ comfyUIUrl, workflowJson, mapping, comfyUIClientId });
        onClose();
    };

    const handleTestConnection = useCallback(async () => {
        setConnectionStatus('testing');
        try {
            const testUrl = new URL(comfyUIUrl);
            const response = await fetch(testUrl.toString(), { method: 'GET', mode: 'cors' });
            if (response.ok) {
                setConnectionStatus('success');
            } else { throw new Error(`Server responded with status ${response.status}`); }
        } catch (error) {
            setConnectionStatus('error'); console.error('Connection test failed:', error);
        }
        setTimeout(() => setConnectionStatus('idle'), 3000);
    }, [comfyUIUrl]);

    const handleSyncWorkflow = useCallback(async () => {
        setSyncStatus('syncing');
        setMapping({}); // Clear old mapping
        try {
            const url = comfyUIUrl.endsWith('/') ? `${comfyUIUrl}prompt` : `${comfyUIUrl}/prompt`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const data = await response.json();
            setWorkflowJson(JSON.stringify(data.prompt, null, 2));
            setSyncStatus('success');
        } catch (error) {
            setSyncStatus('error');
            setWorkflowJson('');
            console.error('Workflow sync failed:', error);
        }
    }, [comfyUIUrl]);
    
    const handleMappingChange = (key: string, value: MappableData) => {
        setMapping(prev => ({...prev, [key]: value}));
    };

    if (!isOpen) return null;
    
    const getMappingKey = (input: WorkflowInput) => `${input.nodeId}:${input.inputName}`;
    // FIX: Explicitly typed the arrays to ensure their values are compatible with the `MappableData` type, resolving a TypeScript inference error.
    const dataOptions = (inputType: string): {value: MappableData; label: string}[] => {
        const baseOptions: { value: MappableData; label: string }[] = [
            { value: 'none', label: 'Do Not Map' },
            { value: 'human_readable_prompt', label: 'Human-Readable Prompt' },
            { value: 'full_timeline_json', label: 'Full Timeline JSON' },
        ];
        if (inputType === 'IMAGE') {
            const imageOptions: { value: MappableData; label: string }[] = [
                { value: 'none', label: 'Do Not Map' },
                { value: 'keyframe_image', label: 'Keyframe Image' },
            ];
            return imageOptions;
        }
        return baseOptions;
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="flex items-center text-lg font-bold text-indigo-400">
                        <ServerIcon className="w-5 h-5 mr-2" />
                        Local Generation Settings
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </header>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                    <div>
                        <label htmlFor="comfyui-url" className="font-medium text-gray-200 block text-sm mb-1">ComfyUI Server Address</label>
                        <div className="flex gap-2">
                             <input 
                                id="comfyui-url"
                                type="text"
                                value={comfyUIUrl}
                                onChange={(e) => setComfyUIUrl(e.target.value)}
                                placeholder="http://127.0.0.1:8188"
                                className="flex-grow bg-gray-900 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-2"
                            />
                            <button onClick={handleTestConnection} disabled={connectionStatus !== 'idle'} className="px-4 py-2 text-sm font-semibold rounded-md border transition-colors bg-gray-700/50 border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-wait">
                                {connectionStatus === 'testing' && 'Testing...'}
                                {connectionStatus === 'success' && 'Success!'}
                                {connectionStatus === 'error' && 'Failed!'}
                                {connectionStatus === 'idle' && 'Test Connection'}
                            </button>
                        </div>
                    </div>
                    
                     <div>
                        <label className="font-medium text-gray-200 block text-sm mb-1">ComfyUI Workflow</label>
                         <button onClick={handleSyncWorkflow} disabled={syncStatus === 'syncing' || !comfyUIUrl} className="w-full px-4 py-2 text-sm font-semibold rounded-md border transition-colors bg-indigo-600/80 border-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-wait">
                            {syncStatus === 'syncing' && 'Syncing...'}
                            {syncStatus === 'success' && 'Workflow Synced ✓ (Click to Re-Sync)'}
                            {syncStatus === 'error' && 'Sync Failed! (Click to Retry)'}
                            {syncStatus === 'idle' && 'Connect & Sync Active Workflow'}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">Load your desired workflow in ComfyUI first, then click this button to fetch it.</p>
                    </div>
                    
                    {parsedInputs.length > 0 && (
                        <div>
                            <h4 className="text-md font-semibold text-gray-200 mb-3">Workflow Input Mapping</h4>
                            <div className="space-y-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700 max-h-60 overflow-y-auto">
                               {parsedInputs.map(input => {
                                    const key = getMappingKey(input);
                                    return (
                                     <div key={key} className="grid grid-cols-2 gap-4 items-center">
                                        <div className="text-sm">
                                            <p className="font-semibold text-gray-300 truncate" title={`${input.nodeTitle} (${input.nodeType})`}>{input.nodeTitle}</p>
                                            <p className="text-xs text-gray-500 font-mono" title={`Input: ${input.inputName} (${input.nodeType})`}>{input.inputName} ({input.nodeType})</p>
                                        </div>
                                        <select 
                                            value={mapping[key] || 'none'} 
                                            onChange={(e) => handleMappingChange(key, e.target.value as MappableData)}
                                            className="bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-2"
                                        >
                                            {dataOptions(input.inputType).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                     </div>
                                )})}
                            </div>
                        </div>
                    )}

                </div>

                <footer className="p-4 border-t border-gray-700 mt-auto flex justify-end items-center gap-4">
                     <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md bg-gray-600 text-white hover:bg-gray-700 transition-colors">
                        Cancel
                    </button>
                     <button onClick={handleSave} className="px-6 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                        Save Settings
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default LocalGenerationSettingsModal;