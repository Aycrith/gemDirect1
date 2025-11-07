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
        
        // ComfyUI API format wraps the workflow in a "prompt" object
        const nodes = workflow.prompt || workflow;

        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            if (node.class_type === 'CLIPTextEncode' && node.inputs?.text !== undefined) {
                 inputs.push({
                    nodeId,
                    nodeType: node.class_type,
                    nodeTitle: node._meta?.title || `Node ${nodeId}`,
                    inputName: 'text',
                    inputType: 'STRING',
                });
            }
            // A common custom node for Base64 image input
            if (node.class_type === 'LoadImageBase64' && node.inputs?.base64 !== undefined) {
                inputs.push({
                    nodeId,
                    nodeType: node.class_type,
                    nodeTitle: node._meta?.title || `Node ${nodeId}`,
                    inputName: 'base64',
                    inputType: 'IMAGE',
                });
            }
            // Generic detection for any node with a string widget that isn't a filename
            if (node.inputs) {
                 for (const inputName in node.inputs) {
                    const inputVal = node.inputs[inputName];
                    if (Array.isArray(inputVal) && inputVal.length === 2 && typeof inputVal[1] === 'object' && inputVal[1].input === 'string') {
                         inputs.push({
                            nodeId,
                            nodeType: node.class_type,
                            nodeTitle: node._meta?.title || `Node ${nodeId}`,
                            inputName: inputName,
                            inputType: 'STRING',
                        });
                    }
                 }
            }
        }
        return inputs;
    } catch (e) {
        return [];
    }
};


const LocalGenerationSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
    const [comfyUIUrl, setComfyUIUrl] = useState(settings.comfyUIUrl);
    const [workflowJson, setWorkflowJson] = useState(settings.workflowJson);
    const [mapping, setMapping] = useState<WorkflowMapping>(settings.mapping);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

    const parsedInputs = useMemo(() => parseWorkflowForInputs(workflowJson), [workflowJson]);
    
    useEffect(() => {
        // Reset mapping if workflow changes
        setMapping({});
    }, [workflowJson]);
    
    const handleSave = () => {
        onSave({ comfyUIUrl, workflowJson, mapping });
        onClose();
    };

    const handleTestConnection = useCallback(async () => {
        setConnectionStatus('testing');
        try {
            // A simple GET request to the root of the server should suffice to check if it's running.
            // Using '/object_info' as it's a common, lightweight endpoint.
            const testUrl = new URL('/object_info', comfyUIUrl.replace('/prompt', ''));
            const response = await fetch(testUrl.toString(), { method: 'GET', mode: 'cors' });
            if (response.ok) {
                setConnectionStatus('success');
            } else {
                throw new Error(`Server responded with status ${response.status}`);
            }
        } catch (error) {
            setConnectionStatus('error');
            console.error('Connection test failed:', error);
        }
        setTimeout(() => setConnectionStatus('idle'), 3000);
    }, [comfyUIUrl]);
    
    const handleMappingChange = (key: string, value: MappableData) => {
        setMapping(prev => ({...prev, [key]: value}));
    };

    if (!isOpen) return null;
    
    const getMappingKey = (input: WorkflowInput) => `${input.nodeId}:${input.inputName}`;
    const dataOptions: {value: MappableData; label: string}[] = [
        { value: 'none', label: 'Do Not Map' },
        { value: 'human_readable_prompt', label: 'Human-Readable Prompt' },
        { value: 'full_timeline_json', label: 'Full Timeline JSON' },
        { value: 'keyframe_image', label: 'Keyframe Image (Base64)' },
    ];

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
                        <label htmlFor="comfyui-url" className="font-medium text-gray-200 block text-sm mb-1">Local Server URL</label>
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
                        <label htmlFor="workflow-json" className="font-medium text-gray-200 block text-sm mb-1">ComfyUI Workflow (API Format)</label>
                        <textarea
                            id="workflow-json"
                            rows={6}
                            value={workflowJson}
                            onChange={(e) => setWorkflowJson(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-3 font-mono text-xs"
                            placeholder="Paste your workflow JSON here (use 'Save API Format' in ComfyUI)..."
                        />
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
                                            <p className="font-semibold text-gray-300 truncate" title={`${input.nodeTitle} (${input.nodeType})`}>{input.nodeTitle} ({input.nodeType})</p>
                                            <p className="text-xs text-gray-500 font-mono" title={`Input: ${input.inputName}`}>Input: {input.inputName}</p>
                                        </div>
                                        <select 
                                            value={mapping[key] || 'none'} 
                                            onChange={(e) => handleMappingChange(key, e.target.value as MappableData)}
                                            className="bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-2"
                                        >
                                            {dataOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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