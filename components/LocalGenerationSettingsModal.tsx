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
    const [activeTab, setActiveTab] = useState<'llm' | 'video' | 'comfyui' | 'advanced'>('llm');
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
                videoProvider: 'comfyui-local',
                comfyUIUrl: 'http://127.0.0.1:8188',
                comfyUIClientId: crypto.randomUUID(),
                comfyUIWebSocketUrl: 'ws://127.0.0.1:8188/ws',
                workflowJson: '',
                mapping: {},
                workflowProfiles: formData.workflowProfiles || {},
                fastVideo: {
                    endpointUrl: 'http://127.0.0.1:8055',
                    modelId: 'FastVideo/FastWan2.2-TI2V-5B-Diffusers',
                    fps: 16,
                    numFrames: 121,
                    height: 544,
                    width: 1280,
                    outputDir: 'artifacts/fastvideo',
                    attentionBackend: 'VIDEO_SPARSE_ATTN'
                },
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
                        onClick={() => setActiveTab('video')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'video' 
                                ? 'text-amber-400 border-b-2 border-amber-400' 
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        🎬 Video Provider
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

                    {activeTab === 'video' && (
                        <div className="space-y-6">
                            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mb-4">
                                <h4 className="text-sm font-medium text-blue-300 mb-2">📹 Video Generation Provider</h4>
                                <p className="text-xs text-gray-400">
                                    Choose between ComfyUI (default, local workflows) or FastVideo (alternate local TI2V engine). 
                                    ComfyUI requires workflow configuration below. FastVideo requires separate server setup.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Video Provider <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={formData.videoProvider || 'comfyui-local'}
                                    onChange={(e) => handleInputChange('videoProvider', e.target.value as 'comfyui-local' | 'fastvideo-local')}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                >
                                    <option value="comfyui-local">ComfyUI (Default)</option>
                                    <option value="fastvideo-local">FastVideo (Experimental)</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.videoProvider === 'fastvideo-local' 
                                        ? 'FastVideo: Direct Python adapter for FastWan2.2-TI2V-5B'
                                        : 'ComfyUI: Flexible workflow-based generation'}
                                </p>
                            </div>

                            {formData.videoProvider === 'fastvideo-local' && (
                                <div className="space-y-4 border-l-4 border-purple-500 pl-4">
                                    <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3">
                                        <p className="text-xs text-purple-300">
                                            ⚠️ <strong>FastVideo Requirements:</strong> Conda environment 'fastvideo', NVIDIA GPU (16GB+ VRAM), 
                                            FastWan2.2-TI2V-5B model downloaded. Start server with: <code className="text-purple-200">scripts/run-fastvideo-server.ps1</code>
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Server Endpoint URL <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.fastVideo?.endpointUrl || 'http://127.0.0.1:8055'}
                                            onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), endpointUrl: e.target.value })}
                                            placeholder="http://127.0.0.1:8055"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">FastVideo adapter HTTP endpoint</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Model ID
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.fastVideo?.modelId || 'FastVideo/FastWan2.2-TI2V-5B-Diffusers'}
                                            onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), modelId: e.target.value })}
                                            placeholder="FastVideo/FastWan2.2-TI2V-5B-Diffusers"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">HuggingFace model identifier</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                FPS (8-30)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.fastVideo?.fps || 16}
                                                onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), fps: Number(e.target.value) })}
                                                min="8"
                                                max="30"
                                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                Frames (8-300)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.fastVideo?.numFrames || 121}
                                                onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), numFrames: Number(e.target.value) })}
                                                min="8"
                                                max="300"
                                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                Width (256-1920)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.fastVideo?.width || 1280}
                                                onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), width: Number(e.target.value) })}
                                                min="256"
                                                max="1920"
                                                step="64"
                                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                Height (256-1080)
                                            </label>
                                            <input
                                                type="number"
                                                value={formData.fastVideo?.height || 544}
                                                onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), height: Number(e.target.value) })}
                                                min="256"
                                                max="1080"
                                                step="64"
                                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Output Directory
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.fastVideo?.outputDir || 'artifacts/fastvideo'}
                                            onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), outputDir: e.target.value })}
                                            placeholder="artifacts/fastvideo"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Relative path for generated videos</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Attention Backend
                                        </label>
                                        <select
                                            value={formData.fastVideo?.attentionBackend || 'VIDEO_SPARSE_ATTN'}
                                            onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), attentionBackend: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        >
                                            <option value="VIDEO_SPARSE_ATTN">VIDEO_SPARSE_ATTN (Recommended)</option>
                                            <option value="FLASH_ATTN">FLASH_ATTN</option>
                                            <option value="XFORMERS">XFORMERS</option>
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">Memory optimization strategy</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Seed (optional)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.fastVideo?.seed || ''}
                                            onChange={(e) => handleInputChange('fastVideo', { ...(formData.fastVideo || {}), seed: e.target.value ? Number(e.target.value) : undefined })}
                                            placeholder="Leave empty for random"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Reproducible generation</p>
                                    </div>

                                    <div className="pt-4">
                                        <button
                                            onClick={async () => {
                                                setConnectionStatus(prev => ({ ...prev, comfyui: { status: 'testing', message: 'Testing FastVideo...' } }));
                                                try {
                                                    const { checkFastVideoHealth } = await import('../services/fastVideoService');
                                                    const health = await checkFastVideoHealth(formData);
                                                    setConnectionStatus(prev => ({ 
                                                        ...prev, 
                                                        comfyui: { 
                                                            status: 'success', 
                                                            message: `Connected! Model: ${health.modelId.split('/').pop()} (${health.modelLoaded ? 'loaded' : 'not loaded'})` 
                                                        } 
                                                    }));
                                                    addToast('FastVideo connection successful', 'success');
                                                } catch (error: any) {
                                                    setConnectionStatus(prev => ({ 
                                                        ...prev, 
                                                        comfyui: { 
                                                            status: 'error', 
                                                            message: error.message || 'Connection failed' 
                                                        } 
                                                    }));
                                                    addToast('FastVideo connection failed', 'error');
                                                }
                                            }}
                                            disabled={connectionStatus.comfyui.status === 'testing'}
                                            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            {connectionStatus.comfyui.status === 'testing' ? 'Testing...' : 'Test FastVideo Connection'}
                                        </button>
                                        {connectionStatus.comfyui.message && connectionStatus.comfyui.message.includes('FastVideo') && (
                                            <div className={`mt-2 text-sm flex items-center gap-2 ${getStatusColor(connectionStatus.comfyui.status)}`}>
                                                <span>{getStatusIcon(connectionStatus.comfyui.status)}</span>
                                                <span>{connectionStatus.comfyui.message}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-semibold text-gray-300">Workflow Profiles</h4>
                                    <button
                                        onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = '.json';
                                            input.onchange = async (e) => {
                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                if (!file) return;
                                                try {
                                                    const text = await file.text();
                                                    const data = JSON.parse(text);
                                                    if (data.workflowProfiles) {
                                                        handleInputChange('workflowProfiles', data.workflowProfiles);
                                                        addToast('Workflow profiles imported successfully', 'success');
                                                    } else {
                                                        addToast('Invalid file: no workflowProfiles found', 'error');
                                                    }
                                                } catch (error) {
                                                    addToast('Failed to import workflows: ' + (error as Error).message, 'error');
                                                }
                                            };
                                            input.click();
                                        }}
                                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                    >
                                        Import from File
                                    </button>
                                </div>
                                <div className="space-y-2 text-sm text-gray-400">
                                    {formData.workflowProfiles && Object.keys(formData.workflowProfiles).length > 0 ? (
                                        Object.entries(formData.workflowProfiles).map(([id, profile]) => {
                                            const readiness = (() => {
                                                if (!profile.workflowJson) return null;
                                                const mapping = profile.mapping || {};
                                                const mappedTypes = new Set(Object.values(mapping));
                                                const hasText = mappedTypes.has('human_readable_prompt') || mappedTypes.has('full_timeline_json');
                                                const hasKeyframe = mappedTypes.has('keyframe_image');
                                                const isReady = id === 'wan-t2i' ? hasText : (hasText && hasKeyframe);
                                                return { isReady, hasText, hasKeyframe };
                                            })();

                                            return (
                                                <div key={id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                                                    <div>
                                                        <span className="font-medium text-gray-300">{profile.label || id}</span>
                                                        <span className="text-xs text-gray-500 ml-2">({id})</span>
                                                        {readiness && (
                                                            <div className="flex gap-1 mt-1" data-testid={`wan-readiness-${id}`}>
                                                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                    readiness.hasText ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                }`} title="CLIP text mapping for prompts">
                                                                    {readiness.hasText ? '✓' : '✗'} CLIP
                                                                </span>
                                                                {id === 'wan-i2v' && (
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                        readiness.hasKeyframe ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                    }`} title="LoadImage mapping for keyframe_image">
                                                                        {readiness.hasKeyframe ? '✓' : '✗'} Keyframe
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        readiness?.isReady ? 'bg-green-900/30 text-green-400' : 
                                                        profile.workflowJson ? 'bg-amber-900/30 text-amber-400' : 'bg-gray-700 text-gray-400'
                                                    }`}>
                                                        {readiness?.isReady ? '✓ Ready' : profile.workflowJson ? '⚠ Incomplete' : '○ Not configured'}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-gray-500">No workflow profiles configured</p>
                                    )}
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                    <p className="text-xs text-gray-500">
                                        💡 To load workflows: Use "Import from File" button above to load from localGenSettings.json, 
                                        or paste workflow JSON directly into the Advanced tab's mapping editor.
                                    </p>
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
