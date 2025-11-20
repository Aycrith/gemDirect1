import React, { useState, useEffect } from 'react';
import { LocalGenerationSettings } from '../types';

interface LocalGenerationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (newSettings: LocalGenerationSettings) => void;
    addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface ConnectionStatus {
    llm: { status: 'idle' | 'testing' | 'success' | 'error'; message: string };
    comfyui: { status: 'idle' | 'testing' | 'success' | 'error'; message: string };
}

const LocalGenerationSettingsModal: React.FC<LocalGenerationSettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    settings, 
    onSave,
    addToast = () => {}
}) => {
    const [activeTab, setActiveTab] = useState<'llm' | 'comfyui' | 'advanced'>('llm');
    const [formData, setFormData] = useState<LocalGenerationSettings>(settings);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        llm: { status: 'idle', message: '' },
        comfyui: { status: 'idle', message: '' }
    });
    const [hasChanges, setHasChanges] = useState(false);

    // Sync form data when settings prop changes
    useEffect(() => {
        setFormData(settings);
        setHasChanges(false);
    }, [settings]);

    if (!isOpen) return null;

    const handleInputChange = (field: keyof LocalGenerationSettings, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleTestLLMConnection = async () => {
        setConnectionStatus(prev => ({ ...prev, llm: { status: 'testing', message: 'Connecting...' } }));
        
        try {
            // Use proxy in DEV mode to avoid CORS issues (same as localStoryService)
            let testUrl: string;
            if (import.meta.env.DEV) {
                // In development, use Vite proxy endpoint for /v1/models
                testUrl = '/api/local-llm-models';
            } else {
                // In production, use direct URL
                const url = formData.llmProviderUrl || 
                           import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                           (typeof window !== 'undefined' && (window as any).LOCAL_STORY_PROVIDER_URL) || 
                           'http://192.168.50.192:1234/v1/chat/completions';
                testUrl = url.replace(/\/v1\/chat\/completions$/, '/v1/models');
            }
            
            const response = await fetch(testUrl, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                const modelCount = data.data?.length || 0;
                setConnectionStatus(prev => ({ 
                    ...prev, 
                    llm: { 
                        status: 'success', 
                        message: `Connected! Found ${modelCount} model(s)` 
                    } 
                }));
                addToast('LM Studio connection successful', 'success');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error: any) {
            setConnectionStatus(prev => ({ 
                ...prev, 
                llm: { 
                    status: 'error', 
                    message: `Failed: ${error.message || 'Connection timeout'}` 
                } 
            }));
            addToast('LM Studio connection failed', 'error');
        }
    };

    const handleTestComfyUIConnection = async () => {
        setConnectionStatus(prev => ({ ...prev, comfyui: { status: 'testing', message: 'Connecting...' } }));
        
        try {
            // Use proxy in DEV mode to avoid CORS issues
            let testUrl: string;
            if (import.meta.env.DEV) {
                testUrl = '/api/comfyui-test';
            } else {
                const url = formData.comfyUIUrl || 'http://127.0.0.1:8188';
                testUrl = `${url}/system_stats`;
            }
            
            const response = await fetch(testUrl, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                const deviceInfo = data.devices?.[0]?.name || 'Unknown GPU';
                setConnectionStatus(prev => ({ 
                    ...prev, 
                    comfyui: { 
                        status: 'success', 
                        message: `Connected! GPU: ${deviceInfo}` 
                    } 
                }));
                addToast('ComfyUI connection successful', 'success');
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error: any) {
            setConnectionStatus(prev => ({ 
                ...prev, 
                comfyui: { 
                    status: 'error', 
                    message: `Failed: ${error.message || 'Connection timeout'}` 
                } 
            }));
            addToast('ComfyUI connection failed', 'error');
        }
    };

    const handleSave = () => {
        // Basic validation
        if (formData.comfyUIUrl && !formData.comfyUIUrl.startsWith('http')) {
            addToast('ComfyUI URL must start with http:// or https://', 'error');
            return;
        }

        onSave(formData);
        setHasChanges(false);
        addToast('Settings saved successfully', 'success');
        onClose();
    };

    const handleReset = () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            const defaults: LocalGenerationSettings = {
                comfyUIUrl: 'http://127.0.0.1:8188',
                comfyUIClientId: crypto.randomUUID(),
                comfyUIWebSocketUrl: 'ws://127.0.0.1:8188/ws',
                workflowJson: '',
                mapping: {},
                workflowProfiles: formData.workflowProfiles || {},
                llmProviderUrl: 'http://192.168.50.192:1234/v1/chat/completions',
                llmModel: 'mistralai/mistral-7b-instruct-v0.3',
                llmTemperature: 0.35,
                llmTimeoutMs: 120000,
                llmRequestFormat: 'openai-chat',
            };
            setFormData(defaults);
            setHasChanges(true);
            addToast('Settings reset to defaults', 'info');
        }
    };

    const handleClose = () => {
        if (hasChanges && !confirm('You have unsaved changes. Close without saving?')) {
            return;
        }
        setFormData(settings); // Revert changes
        setHasChanges(false);
        onClose();
    };

    const generateClientId = () => {
        handleInputChange('comfyUIClientId', crypto.randomUUID());
        addToast('New Client ID generated', 'success');
    };

    const getStatusColor = (status: 'idle' | 'testing' | 'success' | 'error') => {
        switch (status) {
            case 'testing': return 'text-blue-400';
            case 'success': return 'text-green-400';
            case 'error': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusIcon = (status: 'idle' | 'testing' | 'success' | 'error') => {
        switch (status) {
            case 'testing': return '🔄';
            case 'success': return '✅';
            case 'error': return '❌';
            default: return '⚪';
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in"
            onClick={handleClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            data-testid="LocalGenerationSettingsModal"
        >
            <div 
                className="bg-gray-800/95 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 id="settings-modal-title" className="text-lg font-bold text-amber-400 flex items-center">
                        ⚙️ Local Generation Settings
                    </h3>
                    <button 
                        onClick={handleClose} 
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                        aria-label="Close settings"
                    >
                        &times;
                    </button>
                </header>

                {/* Tabs */}
                <div className="flex border-b border-gray-700 px-4">
                    <button
                        onClick={() => setActiveTab('llm')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'llm' 
                                ? 'text-amber-400 border-b-2 border-amber-400' 
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        🤖 LLM Settings
                    </button>
                    <button
                        onClick={() => setActiveTab('comfyui')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'comfyui' 
                                ? 'text-amber-400 border-b-2 border-amber-400' 
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        🎨 ComfyUI Settings
                    </button>
                    <button
                        onClick={() => setActiveTab('advanced')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'advanced' 
                                ? 'text-amber-400 border-b-2 border-amber-400' 
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        🔧 Advanced
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'llm' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Provider URL <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.llmProviderUrl || import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 'http://192.168.50.192:1234/v1/chat/completions'}
                                        onChange={(e) => handleInputChange('llmProviderUrl', e.target.value)}
                                        placeholder="http://192.168.50.192:1234/v1/chat/completions"
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">OpenAI-compatible endpoint for story generation</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Model Name
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.llmModel || import.meta.env.VITE_LOCAL_LLM_MODEL || 'mistralai/mistral-7b-instruct-v0.3'}
                                        onChange={(e) => handleInputChange('llmModel', e.target.value)}
                                        placeholder="mistralai/mistral-7b-instruct-v0.3"
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Model identifier (must be loaded in LM Studio)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Temperature: {(formData.llmTemperature !== undefined ? formData.llmTemperature : Number(import.meta.env.VITE_LOCAL_LLM_TEMPERATURE || 0.35)).toFixed(2)}
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={formData.llmTemperature !== undefined ? formData.llmTemperature : Number(import.meta.env.VITE_LOCAL_LLM_TEMPERATURE || 0.35)}
                                        onChange={(e) => handleInputChange('llmTemperature', Number(e.target.value))}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Lower = more deterministic, Higher = more creative</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Timeout (ms)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.llmTimeoutMs !== undefined ? formData.llmTimeoutMs : Number(import.meta.env.VITE_LOCAL_LLM_TIMEOUT_MS || 120000)}
                                            onChange={(e) => handleInputChange('llmTimeoutMs', Number(e.target.value))}
                                            placeholder="120000"
                                            min="10000"
                                            max="600000"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Request timeout (10-600 seconds)</p>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Seed (optional)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.llmSeed !== undefined ? formData.llmSeed : (import.meta.env.VITE_LOCAL_LLM_SEED || '')}
                                            onChange={(e) => handleInputChange('llmSeed', e.target.value ? Number(e.target.value) : undefined)}
                                            placeholder="Leave empty for random"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">For reproducible results</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Request Format
                                    </label>
                                    <select
                                        value={formData.llmRequestFormat || import.meta.env.VITE_LOCAL_LLM_REQUEST_FORMAT || 'openai-chat'}
                                        onChange={(e) => handleInputChange('llmRequestFormat', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    >
                                        <option value="openai-chat">OpenAI Chat</option>
                                        <option value="ollama">Ollama</option>
                                        <option value="raw">Raw</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">API format (most use OpenAI Chat)</p>
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleTestLLMConnection}
                                        disabled={connectionStatus.llm.status === 'testing'}
                                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        {connectionStatus.llm.status === 'testing' ? 'Testing...' : 'Test LLM Connection'}
                                    </button>
                                    {connectionStatus.llm.message && (
                                        <div className={`mt-2 text-sm flex items-center gap-2 ${getStatusColor(connectionStatus.llm.status)}`}>
                                            <span>{getStatusIcon(connectionStatus.llm.status)}</span>
                                            <span>{connectionStatus.llm.message}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'comfyui' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        ComfyUI Server URL <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.comfyUIUrl || ''}
                                        onChange={(e) => handleInputChange('comfyUIUrl', e.target.value)}
                                        placeholder="http://127.0.0.1:8188"
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Base URL for ComfyUI API</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        WebSocket URL
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.comfyUIWebSocketUrl || (formData.comfyUIUrl ? formData.comfyUIUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws' : '')}
                                        onChange={(e) => handleInputChange('comfyUIWebSocketUrl', e.target.value)}
                                        placeholder="ws://127.0.0.1:8188/ws"
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Auto-derived from server URL (edit if needed)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Client ID
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={formData.comfyUIClientId || ''}
                                            onChange={(e) => handleInputChange('comfyUIClientId', e.target.value)}
                                            placeholder="auto-generated UUID"
                                            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <button
                                            onClick={generateClientId}
                                            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors text-sm"
                                        >
                                            Generate
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Unique identifier for WebSocket connection</p>
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleTestComfyUIConnection}
                                        disabled={connectionStatus.comfyui.status === 'testing' || !formData.comfyUIUrl}
                                        className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        {connectionStatus.comfyui.status === 'testing' ? 'Testing...' : 'Test ComfyUI Connection'}
                                    </button>
                                    {connectionStatus.comfyui.message && (
                                        <div className={`mt-2 text-sm flex items-center gap-2 ${getStatusColor(connectionStatus.comfyui.status)}`}>
                                            <span>{getStatusIcon(connectionStatus.comfyui.status)}</span>
                                            <span>{connectionStatus.comfyui.message}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">Workflow Profiles</h4>
                                <div className="space-y-2 text-sm text-gray-400">
                                    {formData.workflowProfiles && Object.keys(formData.workflowProfiles).length > 0 ? (
                                        Object.entries(formData.workflowProfiles).map(([id, profile]) => (
                                            <div key={id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                                                <div>
                                                    <span className="font-medium text-gray-300">{profile.label || id}</span>
                                                    <span className="text-xs text-gray-500 ml-2">({id})</span>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded ${
                                                    profile.workflowJson ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'
                                                }`}>
                                                    {profile.workflowJson ? '✓ Loaded' : '○ Not configured'}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-gray-500">No workflow profiles configured</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'advanced' && (
                        <div className="space-y-6">
                            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4">
                                <p className="text-sm text-yellow-200">
                                    ⚠️ <strong>Advanced Settings:</strong> These settings are managed automatically. 
                                    Manual changes may cause unexpected behavior.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Model ID
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.modelId || 'wan-video'}
                                        onChange={(e) => handleInputChange('modelId', e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Workflow model identifier (wan-video, comfy-svd, etc.)</p>
                                </div>

                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Current Mappings</h4>
                                    <pre className="text-xs text-gray-400 overflow-auto max-h-40 bg-gray-950/50 p-3 rounded">
                                        {JSON.stringify(formData.mapping, null, 2) || '{}'}
                                    </pre>
                                </div>

                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Storage Information</h4>
                                    <div className="space-y-2 text-sm text-gray-400">
                                        <div className="flex justify-between">
                                            <span>Database:</span>
                                            <span className="text-gray-300">IndexedDB (cinematic-story-db)</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Storage Key:</span>
                                            <span className="text-gray-300 font-mono">localGenSettings</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Auto-save:</span>
                                            <span className="text-green-400">✓ Enabled</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <footer className="flex justify-between items-center p-4 border-t border-gray-700">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Reset to Defaults
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges}
                            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                        >
                            Save Settings
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default LocalGenerationSettingsModal;
