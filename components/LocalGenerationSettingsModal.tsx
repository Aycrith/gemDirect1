import React, { useState, useEffect, useCallback } from 'react';
import { LocalGenerationSettings, WorkflowInput, MappableData, WorkflowMapping, ToastMessage } from '../types';
import { discoverComfyUIServer } from '../services/comfyUIService';
import ServerIcon from './icons/ServerIcon';
import SettingsIcon from './icons/SettingsIcon';
import FileTextIcon from './icons/FileTextIcon';
import ImageIcon from './icons/ImageIcon';
import SearchIcon from './icons/SearchIcon';
import HelpCircleIcon from './icons/HelpCircleIcon';
import Tooltip from './Tooltip';
import CheckCircleIcon from './icons/CheckCircleIcon';
import PreflightCheck from './PreflightCheck';
import AiConfigurator from './AiConfigurator';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (settings: LocalGenerationSettings) => void;
    addToast: (message: string, type: ToastMessage['type']) => void;
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

const LocalGenerationSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave, addToast }) => {
    const [localSettings, setLocalSettings] = useState<LocalGenerationSettings>(settings);
    const [workflowInputs, setWorkflowInputs] = useState<WorkflowInput[]>([]);
    const [discoveryStatus, setDiscoveryStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');

    useEffect(() => {
        setLocalSettings(settings);
        if (settings.workflowJson) {
            setWorkflowInputs(parseWorkflowForInputs(settings.workflowJson));
        } else {
            setWorkflowInputs([]);
        }
        setDiscoveryStatus('idle');
    }, [settings, isOpen]);
    
    useEffect(() => {
        // When localSettings (which can be updated by AiConfigurator) changes, re-parse the inputs
        if(localSettings.workflowJson) {
            setWorkflowInputs(parseWorkflowForInputs(localSettings.workflowJson));
        }
    }, [localSettings.workflowJson]);


    const handleDiscover = async () => {
        setDiscoveryStatus('searching');
        const foundUrl = await discoverComfyUIServer();
        if (foundUrl) {
            setLocalSettings(prev => ({ ...prev, comfyUIUrl: foundUrl }));
            setDiscoveryStatus('found');
        } else {
            setDiscoveryStatus('not_found');
        }
    };

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
    
    const helpTooltipContent = (
        <div className="text-left">
            <p className="font-bold mb-2">How to find your ComfyUI address:</p>
            <ol className="list-decimal list-inside space-y-1">
                <li>Make sure ComfyUI is running.</li>
                <li>Look at the black command window (terminal) that started ComfyUI.</li>
                <li>Near the end, it will say: <br/><code className="bg-gray-800 text-yellow-300 p-1 rounded text-xs">== Starting server at: http://127.0.0.1:8188 ==</code></li>
                <li>Copy and paste that address into the field.</li>
            </ol>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-800/90 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700">
                    <h3 className="flex items-center text-lg font-bold text-amber-400">
                        <SettingsIcon className="w-5 h-5 mr-2" />
                        Local Generation Settings
                    </h3>
                </header>
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Server Config */}
                    <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg ring-1 ring-gray-700/50">
                        <h4 className="font-semibold text-gray-200 flex items-center"><ServerIcon className="w-5 h-5 mr-2 text-gray-400"/>ComfyUI Server</h4>

                        <div className="p-3 bg-gray-800/50 rounded-lg">
                            <button onClick={handleDiscover} disabled={discoveryStatus === 'searching'} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-semibold rounded-md hover:bg-amber-700 disabled:bg-gray-500 transition-colors">
                                <SearchIcon className="w-5 h-5" />
                                {discoveryStatus === 'searching' ? 'Searching...' : 'Automatically Find My ComfyUI Server'}
                            </button>
                             {discoveryStatus === 'found' && <p className="text-xs text-green-400 text-center mt-2 flex items-center justify-center gap-1"><CheckCircleIcon className="w-4 h-4" />Server found and URL has been filled in below!</p>}
                             {discoveryStatus === 'not_found' && <p className="text-xs text-yellow-400 text-center mt-2">Could not find server automatically. Please ensure ComfyUI is running and enter the address manually below.</p>}
                        </div>

                        <div>
                            <label htmlFor="comfy-url" className="text-sm font-medium text-gray-300 flex items-center gap-1">
                                Server Address (Manual Fallback)
                                <Tooltip text={helpTooltipContent}>
                                    <HelpCircleIcon className="w-4 h-4 text-gray-500" />
                                </Tooltip>
                            </label>
                            <input id="comfy-url" type="text" value={localSettings.comfyUIUrl} onChange={e => setLocalSettings(p => ({...p, comfyUIUrl: e.target.value}))} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md p-2 text-sm" placeholder="http://127.0.0.1:8188"/>
                        </div>
                         <div>
                            <label htmlFor="client-id" className="text-sm font-medium text-gray-300">Client ID (Unique Identifier)</label>
                            <input id="client-id" type="text" value={localSettings.comfyUIClientId} onChange={e => setLocalSettings(p => ({...p, comfyUIClientId: e.target.value}))} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md p-2 text-sm" placeholder="e.g., your_name_here"/>
                             <p className="text-xs text-gray-500 mt-1">Enter any unique name here. This prevents conflicts if multiple browser tabs are open.</p>
                        </div>
                    </div>

                    {/* Workflow Sync & Mapping */}
                    <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg ring-1 ring-gray-700/50">
                        <h4 className="font-semibold text-gray-200">Workflow Configuration</h4>
                        
                        <AiConfigurator 
                           settings={localSettings}
                           onUpdateSettings={setLocalSettings}
                           addToast={addToast}
                        />
                        
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
                                                    <option value="negative_prompt">Negative Prompt</option>
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

                    {/* Pre-flight Check */}
                    <PreflightCheck settings={localSettings} />

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