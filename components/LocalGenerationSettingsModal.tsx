import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LocalGenerationSettings, WorkflowInput, WorkflowMapping, MappableData } from '../types';
import ServerIcon from './icons/ServerIcon';
import ImageIcon from './icons/ImageIcon';
import FileTextIcon from './icons/FileTextIcon';
import Tooltip from './Tooltip';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (settings: LocalGenerationSettings) => void;
}

const parseWorkflowForInputs = (workflowJson: string): WorkflowInput[] => {
    if (!workflowJson || workflowJson.trim() === '') {
        return [];
    }
    try {
        const workflow = JSON.parse(workflowJson);
        const inputs: WorkflowInput[] = [];
        
        const nodes = workflow.prompt || workflow;

        if (typeof nodes !== 'object' || nodes === null) {
            return [];
        }

        for (const nodeId in nodes) {
            const node = nodes[nodeId];
            if (!node.inputs || typeof node.inputs !== 'object') continue;
            
            if (node.class_type === 'LoadImage' && 'image' in node.inputs) {
                 inputs.push({
                    nodeId,
                    nodeType: node.class_type,
                    nodeTitle: node._meta?.title || `Node ${nodeId}`,
                    inputName: 'image',
                    inputType: 'IMAGE',
                });
            }
            
            for (const inputName in node.inputs) {
                const inputVal = node.inputs[inputName];
                
                const isLinked = Array.isArray(inputVal) && 
                                 inputVal.length === 2 && 
                                 typeof inputVal[0] === 'string' && 
                                 !isNaN(parseInt(inputVal[0], 10));

                if (!isLinked) {
                    if (node.class_type === 'LoadImage' && inputName === 'image') continue;
                    
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
        return inputs.sort((a, b) => (a.nodeTitle || '').localeCompare(b.nodeTitle || ''));
    } catch (e) {
        console.error("Error parsing workflow JSON:", e);
        return [];
    }
};


const LocalGenerationSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
    const [comfyUIUrl, setComfyUIUrl] = useState(settings.comfyUIUrl);
    const [comfyUIClientId] = useState(settings.comfyUIClientId);
    const [workflowJson, setWorkflowJson] = useState(settings.workflowJson);
    const [mapping, setMapping] = useState<WorkflowMapping>(settings.mapping);
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const parsedInputs = useMemo(() => parseWorkflowForInputs(workflowJson), [workflowJson]);
    
    // Automatic health check for ComfyUI URL with debounce
    useEffect(() => {
        if (!isOpen) return;
        setConnectionStatus('checking');
        const handler = setTimeout(async () => {
            if (!comfyUIUrl) {
                setConnectionStatus('idle');
                return;
            }
            try {
                // Use a specific endpoint like /system_stats for a more reliable check
                const healthUrl = new URL('/system_stats', comfyUIUrl);
                const response = await fetch(healthUrl.href, { mode: 'cors' });
                if (response.ok) {
                    setConnectionStatus('ok');
                    setErrorMessage(null);
                } else {
                    throw new Error(`Server responded with status ${response.status}`);
                }
            } catch (error) {
                setConnectionStatus('error');
                if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
                     setErrorMessage("Connection failed. Check URL and ensure ComfyUI server is running with '--enable-cors'.");
                } else {
                    setErrorMessage(`Connection Error: ${error instanceof Error ? error.message : 'Unknown'}`);
                }
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(handler);
    }, [comfyUIUrl, isOpen]);
    
    useEffect(() => {
        if (isOpen && settings.workflowJson) {
            setSyncStatus('success');
        } else if (!isOpen) {
            setSyncStatus('idle');
            setConnectionStatus('idle');
            setErrorMessage(null);
            setComfyUIUrl(settings.comfyUIUrl);
            setWorkflowJson(settings.workflowJson);
            setMapping(settings.mapping);
        }
    }, [isOpen, settings]);
    
    const handleSave = () => {
        onSave({ comfyUIUrl, workflowJson, mapping, comfyUIClientId });
        onClose();
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setComfyUIUrl(e.target.value);
        setSyncStatus('idle');
        setErrorMessage(null);
    };

    const handleSyncWorkflow = useCallback(async () => {
        if (connectionStatus !== 'ok') {
            setErrorMessage("Cannot sync: ComfyUI server is not connected.");
            setSyncStatus('error');
            return;
        }
        setSyncStatus('syncing');
        setErrorMessage(null);
        setMapping({});
        try {
            const url = comfyUIUrl.endsWith('/') ? `${comfyUIUrl}prompt` : `${comfyUIUrl}/prompt`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            
            const responseText = await response.text();
            try {
                // Verify it's valid JSON before setting
                const data = JSON.parse(responseText);
                setWorkflowJson(JSON.stringify(data, null, 2));
                setSyncStatus('success');
            } catch (jsonError) {
                throw new Error("Received invalid JSON from the server's /prompt endpoint.");
            }
        } catch (error) {
            setSyncStatus('error');
            setWorkflowJson('');
            console.error('Workflow sync failed:', error);
            setErrorMessage(error instanceof Error ? error.message : 'An unknown sync error occurred.');
        }
    }, [comfyUIUrl, connectionStatus]);
    
    const handleMappingChange = (key: string, value: MappableData) => {
        setMapping(prev => ({...prev, [key]: value}));
    };

    if (!isOpen) return null;
    
    const getMappingKey = (input: WorkflowInput) => `${input.nodeId}:${input.inputName}`;
    
    const dataOptions = (inputType: string): {value: MappableData; label: string, description: string}[] => {
        const baseOptions: { value: MappableData; label: string, description: string }[] = [
            { value: 'none', label: 'Do Not Map', description: 'This input will not be modified by the application.' },
            { value: 'human_readable_prompt', label: 'Human-Readable Prompt', description: 'Injects a narrative-style prompt combining the scene, vision, and shot details.' },
            { value: 'full_timeline_json', label: 'Full Timeline JSON', description: 'Injects the complete, structured JSON of the scene timeline for advanced workflows.' },
        ];
        if (inputType === 'IMAGE') {
            const imageOptions: { value: MappableData; label: string, description: string }[] = [
                { value: 'none', label: 'Do Not Map', description: 'This input will not be modified. It will use the default image in the workflow.' },
                { value: 'keyframe_image', label: 'Keyframe Image', description: 'Uploads the generated keyframe image and injects its filename into this node.' },
            ];
            return imageOptions;
        }
        return baseOptions;
    };

    const getInputIcon = (inputType: string) => {
        if (inputType === 'IMAGE') return <ImageIcon className="w-4 h-4 text-cyan-400" />;
        return <FileTextIcon className="w-4 h-4 text-amber-400" />;
    };

    const renderConnectionStatus = () => {
        const baseClass = "w-2.5 h-2.5 rounded-full";
        switch (connectionStatus) {
            case 'checking': return { indicator: <div className={`${baseClass} bg-yellow-500 animate-pulse`} />, text: "Checking..." };
            case 'ok': return { indicator: <div className={`${baseClass} bg-green-500`} />, text: "Connected" };
            case 'error': return { indicator: <div className={`${baseClass} bg-red-500`} />, text: "Error" };
            default: return { indicator: <div className={`${baseClass} bg-gray-500`} />, text: "Idle" };
        }
    };
    
    const syncButtonStyles = {
        idle: 'bg-indigo-600/80 border-indigo-500 text-white hover:bg-indigo-600',
        syncing: 'bg-gray-600 border-gray-500 text-white cursor-wait',
        success: 'bg-green-600/80 border-green-500 text-white hover:bg-green-600',
        error: 'bg-red-600/80 border-red-500 text-white hover:bg-red-600',
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4 fade-in" onClick={onClose}>
            <div className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                        <div className="flex items-center gap-2">
                             <input 
                                id="comfyui-url"
                                type="text"
                                value={comfyUIUrl}
                                onChange={handleUrlChange}
                                placeholder="http://127.0.0.1:8188"
                                className="flex-grow bg-gray-900 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-2"
                            />
                            <div className="flex items-center gap-2 p-2 bg-gray-900 border border-gray-600 rounded-md">
                                {renderConnectionStatus().indicator}
                                <span className="text-xs text-gray-400">
                                    {renderConnectionStatus().text}
                                </span>
                            </div>
                        </div>
                    </div>

                    {errorMessage && (
                        <div className="p-3 bg-red-900/50 border border-red-700 rounded-md text-sm text-red-300">
                            <p className="font-semibold">Error:</p>
                            <p>{errorMessage}</p>
                        </div>
                    )}
                    
                     <div>
                        <label className="font-medium text-gray-200 block text-sm mb-1">ComfyUI Workflow</label>
                         <button onClick={handleSyncWorkflow} disabled={syncStatus === 'syncing' || !comfyUIUrl || connectionStatus !== 'ok'} className={`w-full px-4 py-2 text-sm font-semibold rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${syncButtonStyles[syncStatus]}`}>
                            {syncStatus === 'syncing' && 'Syncing...'}
                            {syncStatus === 'success' && 'Workflow Synced ✓ (Click to Re-Sync)'}
                            {syncStatus === 'error' && 'Sync Failed! (Click to Retry)'}
                            {syncStatus === 'idle' && 'Connect & Sync Active Workflow'}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">Load your desired workflow in ComfyUI first, then click this button to fetch its structure.</p>
                    </div>

                    {syncStatus === 'success' && workflowJson && (
                        <details className="bg-gray-900/50 rounded-lg border border-gray-700">
                            <summary className="cursor-pointer p-2 text-xs text-gray-400 font-semibold">Workflow Inspector</summary>
                            <div className="p-2 border-t border-gray-700 max-h-40 overflow-y-auto">
                                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all">
                                    <code>{workflowJson}</code>
                                </pre>
                            </div>
                        </details>
                    )}
                    
                    {parsedInputs.length > 0 && (
                        <div>
                            <h4 className="text-md font-semibold text-gray-200 mb-3">Workflow Input Mapping</h4>
                            <p className="text-xs text-gray-400 mb-3">Connect your story data to the available inputs detected in your workflow.</p>
                            <div className="space-y-1 p-1 bg-gray-900/50 rounded-lg border border-gray-700 max-h-60 overflow-y-auto">
                               {parsedInputs.map((input, index) => {
                                    const key = getMappingKey(input);
                                    return (
                                     <div key={key} className={`grid grid-cols-2 gap-4 items-center p-2 rounded-md ${index % 2 === 0 ? 'bg-black/10' : 'bg-transparent'}`}>
                                        <div className="text-sm flex items-center gap-2">
                                            {getInputIcon(input.inputType)}
                                            <div>
                                                <p className="font-semibold text-gray-300 truncate" title={`${input.nodeTitle} (${input.nodeType})`}>{input.nodeTitle}</p>
                                                <p className="text-xs text-gray-500 font-mono" title={`Input: ${input.inputName}`}>Input: {input.inputName}</p>
                                            </div>
                                        </div>
                                        <select 
                                            value={mapping[key] || 'none'} 
                                            onChange={(e) => handleMappingChange(key, e.target.value as MappableData)}
                                            className="bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-200 p-2"
                                        >
                                            {dataOptions(input.inputType).map(opt => (
                                                <option key={opt.value} value={opt.value} title={opt.description}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                     </div>
                                )})}
                            </div>
                        </div>
                    )}

                </div>

                <footer className="p-4 border-t border-gray-700 mt-auto flex justify-end items-center gap-4 bg-gray-900/50 rounded-b-lg">
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