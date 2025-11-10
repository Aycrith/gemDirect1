import React, { useState, useEffect, useRef } from 'react';
import { LocalGenerationSettings, WorkflowInput, MappableData, WorkflowMapping, ToastMessage } from '../types';
import { discoverComfyUIServer } from '../services/comfyUIService';
import { usePlanExpansionActions, usePlanExpansionStrategy } from '../contexts/PlanExpansionStrategyContext';
import { useMediaGenerationProvider } from '../contexts/MediaGenerationProviderContext';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useUsage } from '../contexts/UsageContext';
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
import RefreshCwIcon from './icons/RefreshCwIcon';
import ProviderHealthMonitor from './ProviderHealthMonitor';

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
    const [isSyncing, setIsSyncing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Provider contexts
    const { strategies, activeStrategy, activeStrategyId, selectStrategy } = usePlanExpansionStrategy();
    const { providers, activeProvider, activeProviderId, selectProvider } = useMediaGenerationProvider();
    const planActions = usePlanExpansionActions();
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();

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
    
    const handleSyncWorkflow = async () => {
        if (!localSettings.comfyUIUrl) {
            addToast('Please enter a server address first.', 'error');
            return;
        }
        setIsSyncing(true);
        try {
            // ComfyUI doesn't have a /workflow endpoint. Instead, we need to get it from the prompt history
            // Try to get the most recent workflow from the history
            const baseUrl = localSettings.comfyUIUrl.replace(/\/+$/, ''); // Remove trailing slashes
            const historyUrl = `${baseUrl}/history`;
            const response = await fetch(historyUrl);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const history = await response.json();
            
            // Get the most recent workflow from history
            const historyEntries = Object.values(history);
            if (historyEntries.length === 0) {
                throw new Error('No workflows found in history. Please run a workflow in ComfyUI first, then sync again.');
            }
            
            // Get the most recent entry
            const latestEntry: any = historyEntries[historyEntries.length - 1];
            if (!latestEntry.prompt || !latestEntry.prompt[2]) {
                throw new Error('Latest history entry has no workflow. Please run a workflow in ComfyUI first.');
            }
            
            // The workflow is in prompt[2], which contains the actual node structure
            const workflowJson = JSON.stringify(latestEntry.prompt[2], null, 2);

            setLocalSettings(prev => ({ ...prev, workflowJson }));
            addToast('Workflow synced successfully from ComfyUI history! Please review your mappings.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Sync failed: ${message}. Try running a workflow in ComfyUI first, or paste your workflow JSON manually below.`, 'error');
        } finally {
            setIsSyncing(false);
        }
    };


    const handleLoadBundledWorkflow = async () => {
        try {
            const bundledUrl = new URL('../workflows/text-to-video.json', import.meta.url);
            const response = await fetch(bundledUrl);
            if (!response.ok) {
                throw new Error(`Failed to load bundled workflow (status ${response.status}).`);
            }
            const workflowJson = await response.text();
            setLocalSettings(prev => ({ ...prev, workflowJson }));
            setWorkflowInputs(parseWorkflowForInputs(workflowJson));
            addToast('Bundled workflow loaded. Review mappings below.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unexpected error loading bundled workflow.';
            addToast(message, 'error');
        }
    };

    const handleWorkflowFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        try {
            const text = await file.text();
            setLocalSettings(prev => ({ ...prev, workflowJson: text }));
            setWorkflowInputs(parseWorkflowForInputs(text));
            addToast(`Imported workflow from ${file.name}.`, 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not read workflow file.';
            addToast(message, 'error');
        } finally {
            if (event.target) {
                event.target.value = '';
            }
        }
    };

    const handleAutoMapCurrentWorkflow = async () => {
        if (!localSettings.workflowJson || !localSettings.workflowJson.trim()) {
            addToast('Please load or paste a workflow JSON first.', 'error');
            return;
        }
        try {
            updateApiStatus('loading', 'Analyzing workflow locally...');
            const mapping: WorkflowMapping = await planActions.generateWorkflowMapping(
                localSettings.workflowJson,
                logApiCall,
                updateApiStatus
            );
            setLocalSettings(prev => ({ ...prev, mapping }));
            addToast('Workflow inputs mapped automatically.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to analyze workflow mapping.';
            addToast(message, 'error');
        } finally {
            updateApiStatus('idle', '');
        }
    };

    const handleUploadWorkflowClick = () => {
        fileInputRef.current?.click();
    };

    const handleMappingChange = (key: string, value: MappableData) => {
        setLocalSettings(prev => ({
            ...prev,
            mapping: { ...prev.mapping, [key]: value }
        }));
    };

    const handleSave = () => {
        console.log('[LocalGenerationSettingsModal] handleSave called with localSettings:', JSON.stringify(localSettings, null, 2));
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
                    {/* Health Monitor */}
                    <ProviderHealthMonitor comfyUIUrl={localSettings.comfyUIUrl} />
                    
                    {/* Provider Selection */}
                    <div className="space-y-4 p-4 bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-lg ring-2 ring-purple-500/50 shadow-lg">
                        <h4 className="font-semibold text-purple-200 flex items-center text-lg">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            AI Provider Selection
                        </h4>
                        <p className="text-sm text-gray-300">Choose which AI services power your story generation and media creation.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            {/* Plan Expansion Strategy */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-purple-200 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Story Planning Provider
                                </label>
                                <select 
                                    value={activeStrategyId}
                                    onChange={(e) => {
                                        selectStrategy(e.target.value);
                                        addToast(`Switched to ${strategies.find(s => s.id === e.target.value)?.label}`, 'success');
                                    }}
                                    className="w-full bg-gray-800/80 border-purple-500/50 rounded-md p-2.5 text-sm text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                >
                                    {strategies.map(strategy => (
                                        <option key={strategy.id} value={strategy.id}>
                                            {strategy.label} {!strategy.isAvailable && '(Unavailable)'}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-400 italic">{activeStrategy.description}</p>
                            </div>

                            {/* Media Generation Provider */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-blue-200 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Media Generation Provider
                                </label>
                                <select 
                                    value={activeProviderId}
                                    onChange={(e) => {
                                        selectProvider(e.target.value);
                                        addToast(`Switched to ${providers.find(p => p.id === e.target.value)?.label}`, 'success');
                                    }}
                                    className="w-full bg-gray-800/80 border-blue-500/50 rounded-md p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {providers.map(provider => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.label} {!provider.isAvailable && '(Unavailable)'}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-400 italic">{activeProvider.description}</p>
                            </div>
                        </div>
                    </div>

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
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json"
                            className="hidden"
                            onChange={handleWorkflowFileSelected}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <button
                                onClick={handleLoadBundledWorkflow}
                                className="flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-indigo-600/80 text-white font-semibold hover:bg-indigo-600 transition-colors"
                            >
                                Load Sample Workflow
                            </button>
                            <button
                                onClick={handleUploadWorkflowClick}
                                className="flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-gray-700 text-gray-100 font-semibold hover:bg-gray-600 transition-colors"
                            >
                                Import JSON File
                            </button>
                            <button
                                onClick={handleAutoMapCurrentWorkflow}
                                className="flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-emerald-600/80 text-white font-semibold hover:bg-emerald-600 transition-colors"
                            >
                                Auto-map Current Workflow
                            </button>
                        </div>

                        <div className="text-center">
                             <button
                                onClick={handleSyncWorkflow}
                                disabled={isSyncing}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-600/50 text-gray-300 font-semibold rounded-md hover:bg-gray-600/80 disabled:bg-gray-500 transition-colors text-xs border border-gray-500"
                            >
                                <RefreshCwIcon className="w-4 h-4" />
                                {isSyncing ? 'Syncing...' : 'Re-sync Workflow Only (Manual Mode)'}
                            </button>
                        </div>
                        
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
