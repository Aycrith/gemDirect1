import React, { useState, useEffect } from 'react';
import { LocalGenerationSettings, WorkflowProfile } from '../types';
import { 
    validateWorkflows, 
    validateWorkflowProfile, 
    parseError, 
    HELP_DOCS,
    type ValidationResult,
    type SystemValidation 
} from '../utils/settingsValidation';

interface LocalGenerationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: LocalGenerationSettings;
    onSave: (newSettings: LocalGenerationSettings) => void;
    addToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface ConnectionStatus {
    llm: { 
        status: 'idle' | 'testing' | 'success' | 'error'; 
        message: string;
        models?: string[];
        details?: string;
    };
    comfyui: { 
        status: 'idle' | 'testing' | 'success' | 'error'; 
        message: string;
        gpu?: string;
        details?: string;
    };
}

interface ValidationState {
    llm: ValidationResult;
    comfyui: ValidationResult;
    workflows: ValidationResult;
    overall: ValidationResult;
    lastValidated?: Date;
}

const LocalGenerationSettingsModal: React.FC<LocalGenerationSettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    settings, 
    onSave,
    addToast = () => {}
}) => {
    const [activeTab, setActiveTab] = useState<'llm' | 'video' | 'comfyui' | 'advanced'>('llm');
    // Ensure videoProvider has a default value to prevent validation issues
    const [formData, setFormData] = useState<LocalGenerationSettings>({
        ...settings,
        videoProvider: settings.videoProvider || 'comfyui-local'
    });
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        llm: { status: 'idle', message: '' },
        comfyui: { status: 'idle', message: '' }
    });
    const [validationState, setValidationState] = useState<ValidationState>({
        llm: { valid: false, message: 'Not tested' },
        comfyui: { valid: false, message: 'Not tested' },
        workflows: { valid: false, message: 'Not tested' },
        overall: { valid: false, message: 'Validation incomplete' },
    });
    const [hasChanges, setHasChanges] = useState(false);
    const [showValidationPanel, setShowValidationPanel] = useState(false);

    // Sync form data when settings prop changes, ensuring defaults are set
    useEffect(() => {
        setFormData({
            ...settings,
            videoProvider: settings.videoProvider || 'comfyui-local'
        });
        setHasChanges(false);
    }, [settings]);

    // Handle Escape key to close modal
    useEffect(() => {
        if (!isOpen) return;
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                // If there are unsaved changes, show confirmation dialog
                if (hasChanges) {
                    const confirmed = window.confirm(
                        'You have unsaved changes. Close without saving?\n\n' +
                        'Any imported workflows or configuration changes will be lost.'
                    );
                    if (!confirmed) return;
                }
                setFormData(settings); // Revert changes
                setHasChanges(false);
                onClose();
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, hasChanges, settings, onClose]);

    if (!isOpen) return null;

    const handleInputChange = (field: keyof LocalGenerationSettings, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
        
        // Clear validation state when critical fields change to force re-test
        if (field === 'llmProviderUrl' || field === 'llmModel') {
            setValidationState(prev => ({
                ...prev,
                llm: { valid: false, message: 'Configuration changed - please re-test' },
                overall: { valid: false, message: 'Configuration changed - validation required' }
            }));
            setConnectionStatus(prev => ({ ...prev, llm: { status: 'idle', message: 'Please test connection after URL/model change' } }));
        }
        
        if (field === 'comfyUIUrl' || field === 'videoProvider') {
            setValidationState(prev => ({
                ...prev,
                comfyui: { valid: false, message: 'Configuration changed - please re-test' },
                overall: { valid: false, message: 'Configuration changed - validation required' }
            }));
            setConnectionStatus(prev => ({ ...prev, comfyui: { status: 'idle', message: 'Please test connection after URL change' } }));
        }
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
                // In production, construct /v1/models endpoint properly
                const url = formData.llmProviderUrl || 
                           import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                           (typeof window !== 'undefined' && (window as any).LOCAL_STORY_PROVIDER_URL) || 
                           'http://192.168.50.192:1234/v1/chat/completions';
                
                // Robust URL normalization: handle varied input formats
                // Accept: http://host:port, http://host:port/, http://host:port/v1, http://host:port/v1/chat/completions
                // Output: Always http://host:port/v1/models (never /v1/chat/completions-models)
                let baseUrl = url.trim();
                
                // Strip trailing slash
                if (baseUrl.endsWith('/')) {
                    baseUrl = baseUrl.slice(0, -1);
                }
                
                // Remove any existing /v1/* path segments
                if (baseUrl.includes('/v1/')) {
                    baseUrl = baseUrl.substring(0, baseUrl.indexOf('/v1'));
                } else if (baseUrl.endsWith('/v1')) {
                    baseUrl = baseUrl.slice(0, -3);
                }
                
                // Construct the /v1/models endpoint
                testUrl = `${baseUrl}/v1/models`;
            }
            
            const response = await fetch(testUrl, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                const models = data.data || [];
                const modelCount = models.length;
                const modelNames = models.slice(0, 3).map((m: any) => m.id || m.name).filter(Boolean);
                
                if (modelCount === 0) {
                    // Connected but no models - ALLOW SAVING with warning
                    setConnectionStatus(prev => ({ 
                        ...prev, 
                        llm: { 
                            status: 'success',
                            message: 'Connection successful, but no models detected. You can save settings and load models later.',
                            models: [],
                            details: 'Load a model in LM Studio before generating stories'
                        } 
                    }));
                    setValidationState(prev => ({
                        ...prev,
                        llm: {
                            valid: true,
                            message: 'Connected (no models loaded)',
                            warnings: ['No models currently loaded - load a model before generating'],
                            fixes: [
                                'Load a model in LM Studio (File → Load Model)',
                                'Verify model download completed successfully',
                            ],
                            helpUrl: HELP_DOCS.LLM_NO_MODELS
                        }
                    }));
                    addToast('LM Studio connected (no models loaded yet)', 'info');
                } else {
                    // Success with models
                    const modelList = modelNames.length > 0 
                        ? ` (${modelNames.join(', ')}${modelCount > 3 ? ` +${modelCount - 3} more` : ''})` 
                        : '';
                    setConnectionStatus(prev => ({ 
                        ...prev, 
                        llm: { 
                            status: 'success', 
                            message: `Connection successful. Found ${modelCount} model(s)${modelList}. Ready to proceed.`,
                            models: modelNames,
                            details: `Available models: ${modelCount}`
                        } 
                    }));
                    setValidationState(prev => ({
                        ...prev,
                        llm: {
                            valid: true,
                            message: `${modelCount} model(s) available`
                        }
                    }));
                    addToast(`LM Studio connected: ${modelCount} model(s) ready`, 'success');
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error: any) {
            const errorInfo = parseError(error);
            setConnectionStatus(prev => ({ 
                ...prev, 
                llm: { 
                    status: 'error', 
                    message: `Connection failed. Error: ${errorInfo.title}`,
                    details: errorInfo.description
                } 
            }));
            setValidationState(prev => ({
                ...prev,
                llm: {
                    valid: false,
                    message: errorInfo.title,
                    issues: [errorInfo.description],
                    fixes: errorInfo.fixes,
                    helpUrl: errorInfo.helpUrl
                }
            }));
            addToast(`LM Studio error: ${errorInfo.title}`, 'error');
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
                const device = data.devices?.[0];
                const deviceInfo = device?.name || 'Unknown GPU';
                const vramTotal = device?.vram_total ? ` (${(device.vram_total / 1024 / 1024 / 1024).toFixed(1)} GB VRAM)` : '';
                
                setConnectionStatus(prev => ({ 
                    ...prev, 
                    comfyui: { 
                        status: 'success', 
                        message: `Connection successful. GPU: ${deviceInfo}${vramTotal}. Ready to proceed.`,
                        gpu: deviceInfo,
                        details: `System ready for workflow execution`
                    } 
                }));
                setValidationState(prev => ({
                    ...prev,
                    comfyui: {
                        valid: true,
                        message: `Connected (GPU: ${deviceInfo})`
                    }
                }));
                addToast(`ComfyUI connected: ${deviceInfo}`, 'success');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error: any) {
            const errorInfo = parseError(error);
            setConnectionStatus(prev => ({ 
                ...prev, 
                comfyui: { 
                    status: 'error', 
                    message: `Connection failed. Error: ${errorInfo.title}`,
                    details: errorInfo.description
                } 
            }));
            setValidationState(prev => ({
                ...prev,
                comfyui: {
                    valid: false,
                    message: errorInfo.title,
                    issues: [errorInfo.description],
                    fixes: errorInfo.fixes,
                    helpUrl: HELP_DOCS.COMFYUI_CONNECTION_FAILED
                }
            }));
            addToast(`ComfyUI error: ${errorInfo.title}`, 'error');
        }
    };

    const validateAllSettings = () => {
        const issues: string[] = [];
        const fixes: string[] = [];
        const warnings: string[] = [];

        // Validate required fields - check effective URL (including fallbacks)
        const effectiveLLMUrl = formData.llmProviderUrl || 
                               import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                               (typeof window !== 'undefined' && (window as any).LOCAL_STORY_PROVIDER_URL) || 
                               '';
        
        if (!effectiveLLMUrl) {
            issues.push('LLM Provider URL is required');
            fixes.push('Enter a valid LLM provider URL');
        } else if (!effectiveLLMUrl.startsWith('http')) {
            issues.push('LLM Provider URL must start with http:// or https://');
            fixes.push('Update URL to include http:// or https:// protocol');
        }

        // ComfyUI fields are optional - only validate if user is actively setting it up
        if (formData.videoProvider === 'comfyui-local' && formData.comfyUIUrl) {
            // User has started ComfyUI setup - validate URL format
            if (!formData.comfyUIUrl.startsWith('http')) {
                issues.push('ComfyUI URL must start with http:// or https://');
                fixes.push('Update URL to include http:// or https:// protocol');
            }

            if (!formData.comfyUIClientId) {
                // Auto-generate if missing
                console.info('Auto-generating ComfyUI Client ID');
                formData.comfyUIClientId = crypto.randomUUID();
            }
        }

        // Check connection test status - treat as warning, not blocking error
        if (!validationState.llm.valid) {
            warnings.push('LLM connection not validated - story generation may not work');
            warnings.push('Fix: Click "Test LLM Connection" button and ensure it succeeds');
            if (validationState.llm.fixes) {
                warnings.push(...validationState.llm.fixes);
            }
        } else if (validationState.llm.warnings) {
            // Connection valid but has warnings (e.g., no models) - don't block saving
            warnings.push(...validationState.llm.warnings);
            console.info('LLM validation warnings:', validationState.llm.warnings);
        }

        // ComfyUI validation is OPTIONAL - only required if user wants video generation
        // Allow saving with just LLM configured for story-only generation
        if (formData.videoProvider === 'comfyui-local') {
            // User wants ComfyUI - validate if they've tested the connection
            if (formData.comfyUIUrl && !validationState.comfyui.valid) {
                // Only show as warning, not blocking error - user may set up later
                warnings.push('ComfyUI not validated - video generation will be unavailable');
                console.info('ComfyUI not validated yet - video generation will not be available until configured');
            }
            
            // Validate workflows only if connection is already valid
            if (validationState.comfyui.valid) {
                const workflowValidation = validateWorkflows(formData);
                if (!workflowValidation.valid) {
                    warnings.push('Workflow validation incomplete - video generation may not work');
                    if (workflowValidation.issues) {
                        warnings.push(...workflowValidation.issues);
                    }
                    if (workflowValidation.fixes) {
                        fixes.push(...workflowValidation.fixes);
                    }
                }
                setValidationState(prev => ({ ...prev, workflows: workflowValidation }));
            }
        }

        // Update overall validation state
        const allValid = issues.length === 0;
        const hasWarnings = warnings.length > 0;
        
        setValidationState(prev => ({
            ...prev,
            overall: allValid
                ? { 
                    valid: true, 
                    message: hasWarnings ? `Settings validated with ${warnings.length} warning(s)` : 'All settings validated and ready',
                    warnings: hasWarnings ? warnings : undefined
                }
                : {
                    valid: false,
                    message: `Settings cannot be saved. ${issues.length} issue(s) found.`,
                    issues,
                    fixes,
                    warnings: hasWarnings ? warnings : undefined,
                    helpUrl: HELP_DOCS.GENERAL_SETUP
                },
            lastValidated: new Date()
        }));

        return allValid;
    };

    const handleSave = () => {
        console.log('[LocalGenSettings] handleSave called');
        console.log('[LocalGenSettings] Current formData:', formData);
        console.log('[LocalGenSettings] Validation state:', validationState);
        
        // Run comprehensive validation to show warnings, but don't block save
        const isValid = validateAllSettings();
        console.log('[LocalGenSettings] Validation result:', isValid);
        
        // Show validation panel if there are warnings, but allow save to proceed
        if (!isValid) {
            console.warn('[LocalGenSettings] Validation warnings present, showing panel but allowing save');
            setShowValidationPanel(true);
            addToast('Settings saved with warnings. Some features may not work until configured.', 'info');
        }

        // Compute workflow validation synchronously for the snapshot
        // (React state updates are async, so we can't rely on validationState.workflows being updated yet)
        const workflowValidation = validationState.comfyui.valid ? validateWorkflows(formData) : { valid: false };
        
        // Store validation state in localStorage for runtime checks (with graceful fallback)
        const validationSnapshot = {
            llmValid: validationState.llm.valid,
            comfyUIValid: validationState.comfyui.valid,
            // Use synchronously computed workflow validation result
            workflowsValid: workflowValidation.valid,
            timestamp: new Date().toISOString(),
            llmHasModels: (connectionStatus.llm.models?.length ?? 0) > 0,
            comfyUIGPU: connectionStatus.comfyui.gpu,
            // Store warnings separately so runtime can check
            llmWarnings: validationState.llm.warnings || []
        };
        
        console.log('[LocalGenSettings] Validation snapshot:', validationSnapshot);
        
        try {
            localStorage.setItem('gemDirect_validationState', JSON.stringify(validationSnapshot));
            console.log('[LocalGenSettings] Validation snapshot saved to localStorage');
        } catch (error) {
            console.warn('[LocalGenSettings] Failed to save validation state to localStorage (browser storage blocked):', error);
            // Continue anyway - validation state is supplementary
        }

        console.log('[LocalGenSettings] Calling onSave with formData');
        onSave(formData);
        setHasChanges(false);
        
        // Provide appropriate feedback based on validation state
        if (validationState.llm.warnings && validationState.llm.warnings.length > 0) {
            addToast('Settings saved. Note: ' + validationState.llm.warnings[0], 'info');
        } else {
            addToast('Settings validated and saved. Local generation is configured.', 'success');
        }
        console.log('[LocalGenSettings] Closing modal');
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
                llmModel: 'mistralai/mistral-nemo-instruct-2407',
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
        if (hasChanges) {
            const confirmed = window.confirm(
                'You have unsaved changes. Close without saving?\n\n' +
                'Any imported workflows or configuration changes will be lost.'
            );
            if (!confirmed) return;
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
                                        value={formData.llmModel || import.meta.env.VITE_LOCAL_LLM_MODEL || 'mistralai/mistral-nemo-instruct-2407'}
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
                                        <div className={`mt-3 p-3 rounded-lg border ${
                                            connectionStatus.llm.status === 'success' 
                                                ? 'bg-green-900/20 border-green-700/30' 
                                                : connectionStatus.llm.status === 'error'
                                                ? 'bg-red-900/20 border-red-700/30'
                                                : 'bg-blue-900/20 border-blue-700/30'
                                        }`}>
                                            <div className={`flex items-start gap-2 text-sm ${getStatusColor(connectionStatus.llm.status)}`}>
                                                <span className="text-lg">{getStatusIcon(connectionStatus.llm.status)}</span>
                                                <div className="flex-1">
                                                    <p className="font-medium">{connectionStatus.llm.message}</p>
                                                    {connectionStatus.llm.details && (
                                                        <p className="text-xs mt-1 text-gray-400">{connectionStatus.llm.details}</p>
                                                    )}
                                                    {validationState.llm.fixes && validationState.llm.fixes.length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            <p className="text-xs font-semibold text-amber-300">Suggested fixes:</p>
                                                            <ul className="text-xs text-gray-300 list-disc list-inside space-y-0.5">
                                                                {validationState.llm.fixes.map((fix, i) => (
                                                                    <li key={i}>{fix}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {validationState.llm.helpUrl && (
                                                        <a 
                                                            href={validationState.llm.helpUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                                                        >
                                                            📚 View troubleshooting guide →
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
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
                                        <div className={`mt-3 p-3 rounded-lg border ${
                                            connectionStatus.comfyui.status === 'success' 
                                                ? 'bg-green-900/20 border-green-700/30' 
                                                : connectionStatus.comfyui.status === 'error'
                                                ? 'bg-red-900/20 border-red-700/30'
                                                : 'bg-purple-900/20 border-purple-700/30'
                                        }`}>
                                            <div className={`flex items-start gap-2 text-sm ${getStatusColor(connectionStatus.comfyui.status)}`}>
                                                <span className="text-lg">{getStatusIcon(connectionStatus.comfyui.status)}</span>
                                                <div className="flex-1">
                                                    <p className="font-medium">{connectionStatus.comfyui.message}</p>
                                                    {connectionStatus.comfyui.details && (
                                                        <p className="text-xs mt-1 text-gray-400">{connectionStatus.comfyui.details}</p>
                                                    )}
                                                    {validationState.comfyui.fixes && validationState.comfyui.fixes.length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            <p className="text-xs font-semibold text-amber-300">Suggested fixes:</p>
                                                            <ul className="text-xs text-gray-300 list-disc list-inside space-y-0.5">
                                                                {validationState.comfyui.fixes.map((fix, i) => (
                                                                    <li key={i}>{fix}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {validationState.comfyui.helpUrl && (
                                                        <a 
                                                            href={validationState.comfyui.helpUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                                                        >
                                                            📚 View troubleshooting guide →
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                        <h4 className="text-sm font-semibold text-gray-300 mb-1">Workflow Profiles</h4>
                                        <p className="text-xs text-gray-500">
                                            Import <code className="px-1 bg-gray-800 rounded">localGenSettings.json</code> (all profiles) or individual workflow JSON files
                                        </p>
                                    </div>
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
                                                    
                                                    console.log('[Workflow Import] File loaded:', file.name);
                                                    console.log('[Workflow Import] Data keys:', Object.keys(data));
                                                    console.log('[Workflow Import] Has workflowProfiles?', 'workflowProfiles' in data);
                                                    
                                    // Case 1: File has workflowProfiles property (localGenSettings.json format)
                                    if (data.workflowProfiles && typeof data.workflowProfiles === 'object') {
                                        console.log('[Workflow Import] Importing settings file with profiles:', Object.keys(data.workflowProfiles));
                                        
                                        // Import workflow profiles AND the active profile selections
                                        const updatedFormData = { 
                                            ...formData, 
                                            workflowProfiles: data.workflowProfiles,
                                            // Also import profile selections if present
                                            ...(data.imageWorkflowProfile && { imageWorkflowProfile: data.imageWorkflowProfile }),
                                            ...(data.videoWorkflowProfile && { videoWorkflowProfile: data.videoWorkflowProfile }),
                                        };
                                        console.log('[Workflow Import] imageWorkflowProfile:', updatedFormData.imageWorkflowProfile);
                                        console.log('[Workflow Import] videoWorkflowProfile:', updatedFormData.videoWorkflowProfile);
                                        setFormData(updatedFormData);
                                        
                                        // Auto-persist imported workflows immediately
                                        console.log('[Workflow Import] Auto-saving to IndexedDB...');
                                        onSave(updatedFormData);
                                        setHasChanges(false);
                                        
                                        const count = Object.keys(data.workflowProfiles).length;
                                        console.log('[Workflow Import] Import complete and persisted to storage!');
                                        addToast(`Imported and saved ${count} workflow profile(s)`, 'success');
                                        return;
                                    }                                                    // Case 2: Raw ComfyUI workflow file (needs to be wrapped in profile)
                                                    // Check if it looks like a ComfyUI workflow:
                                                    // - Has numeric string keys like "3", "6", "7" (ComfyUI node IDs)
                                                    // - OR has a "prompt" property
                                                    // - AND doesn't look like a settings file (no comfyUIUrl, workflowProfiles, etc.)
                                                    const keys = Object.keys(data);
                                                    const hasNumericKeys = keys.some(k => /^\d+$/.test(k) && typeof data[k] === 'object' && data[k].class_type);
                                                    const hasPromptStructure = 'prompt' in data && typeof data.prompt === 'object';
                                                    const looksLikeSettingsFile = 'comfyUIUrl' in data || 'workflowProfiles' in data || 'mapping' in data;
                                                    
                                                    const isComfyUIWorkflow = (hasNumericKeys || hasPromptStructure) && !looksLikeSettingsFile;
                                                    
                                                    console.log('[Workflow Import] Detection:', { hasNumericKeys, hasPromptStructure, looksLikeSettingsFile, isComfyUIWorkflow });
                                                    
                                                    if (isComfyUIWorkflow) {
                                                        console.log('[Workflow Import] Prompting for profile ID...');
                                                        // Prompt user for profile ID and label
                                                        const profileId = prompt('Enter a profile ID (e.g., "wan-t2i", "wan-i2v", "custom-workflow"):');
                                                        console.log('[Workflow Import] Profile ID entered:', profileId);
                                                        if (!profileId || !profileId.trim()) {
                                                            console.log('[Workflow Import] No profile ID - cancelling');
                                                            addToast('Import cancelled - profile ID required', 'info');
                                                            return;
                                                        }
                                                        
                                                        console.log('[Workflow Import] Prompting for profile label...');
                                                        const profileLabel = prompt('Enter a descriptive label for this workflow:', profileId);
                                                        console.log('[Workflow Import] Profile label entered:', profileLabel);
                                                        if (!profileLabel || !profileLabel.trim()) {
                                                            console.log('[Workflow Import] No profile label - cancelling');
                                                            addToast('Import cancelled - profile label required', 'info');
                                                            return;
                                                        }
                                                        
                                                        // Create profile with empty mapping (user will configure via UI)
                                                        const newProfile: WorkflowProfile = {
                                                            id: profileId.trim(),
                                                            label: profileLabel.trim(),
                                                            workflowJson: JSON.stringify(data),
                                                            mapping: {},
                                                            metadata: {
                                                                lastSyncedAt: Date.now(),
                                                                highlightMappings: [],
                                                                missingMappings: [],
                                                                warnings: ['Workflow imported from raw file - configure mappings in Workflow Mapping section']
                                                            }
                                                        };
                                                        
                                                        // Merge with existing profiles
                                                        console.log('[Workflow Import] Creating profile:', profileId.trim());
                                                        const updatedProfiles = {
                                                            ...(formData.workflowProfiles || {}),
                                                            [profileId.trim()]: newProfile
                                                        };
                                                        
                                                        console.log('[Workflow Import] Saving profiles...', Object.keys(updatedProfiles));
                                                        handleInputChange('workflowProfiles', updatedProfiles);
                                                        console.log('[Workflow Import] Import complete!');
                                                        addToast(`Created workflow profile "${profileLabel}" - configure mappings below`, 'success');
                                                        return;
                                                    }
                                                    
                                                    // Case 3: Unrecognized format
                                                    console.error('[Workflow Import] Unrecognized format. Data structure:', data);
                                                    const topKeys = Object.keys(data).slice(0, 5).join(', ');
                                                    addToast(`Invalid file format. File has keys: ${topKeys}\n\nExpected:\n1) Settings file with "workflowProfiles" property, or\n2) Raw ComfyUI workflow with numbered nodes`, 'error');
                                                    
                                                } catch (error) {
                                                    console.error('[Workflow Import] Error:', error);
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
                                                // Text-to-image profiles (wan-t2i, flux-t2i) only need text mapping
                                                // Image-to-video profiles (wan-i2v) need both text and keyframe
                                                const isTextToImageProfile = id === 'wan-t2i' || id === 'flux-t2i' || id.includes('-t2i');
                                                const isReady = isTextToImageProfile ? hasText : (hasText && hasKeyframe);
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

                            {/* Keyframe Generation Mode */}
                            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-3">Keyframe Generation Mode</h4>
                                <div className="space-y-3">
                                    <label className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg cursor-pointer hover:border-amber-500/50 transition-colors">
                                        <input
                                            type="radio"
                                            name="keyframeMode"
                                            value="single"
                                            checked={(formData.keyframeMode || 'single') === 'single'}
                                            onChange={(e) => handleInputChange('keyframeMode', e.target.value)}
                                            className="mt-1 text-amber-400 focus:ring-amber-400"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-200 mb-1">Single Keyframe (Current)</div>
                                            <div className="text-xs text-gray-400">
                                                Generate one representative frame per scene. Fast, proven 100% success rate with CFG 5.5.
                                            </div>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg cursor-pointer hover:border-amber-500/50 transition-colors">
                                        <input
                                            type="radio"
                                            name="keyframeMode"
                                            value="bookend"
                                            checked={formData.keyframeMode === 'bookend'}
                                            onChange={(e) => handleInputChange('keyframeMode', e.target.value)}
                                            className="mt-1 text-amber-400 focus:ring-amber-400"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-200 mb-1 flex items-center gap-2">
                                                Dual Keyframes (Bookend) 
                                                <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-300 border border-purple-700 rounded">EXPERIMENTAL</span>
                                            </div>
                                            <div className="text-xs text-gray-400 space-y-1">
                                                <div>Generate start + end frames per scene. Improves video temporal consistency.</div>
                                                <div className="text-amber-400/70">⚠️ Requires compatible workflow profile (wan-t2i-bookends/wan-i2v-bookends)</div>
                                            </div>
                                        </div>
                                    </label>
                                </div>
                                
                                {formData.keyframeMode === 'bookend' && (
                                    <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                                        <div className="text-xs text-blue-300 space-y-1">
                                            <div className="font-semibold">📋 Bookend Mode Requirements:</div>
                                            <ul className="list-disc list-inside pl-2 space-y-0.5">
                                                <li>Each scene needs <code className="px-1 bg-gray-800 rounded">temporalContext</code> (start/end moments)</li>
                                                <li>Workflow profiles: <code className="px-1 bg-gray-800 rounded">wan-t2i-bookends</code> and <code className="px-1 bg-gray-800 rounded">wan-i2v-bookends</code></li>
                                                <li>Generation time: ~2× longer (10 keyframes vs 5)</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}
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

                {/* Validation Summary Panel */}
                {showValidationPanel && !validationState.overall.valid && (
                    <div className="px-6 pb-4">
                        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <span className="text-2xl">❌</span>
                                <div className="flex-1">
                                    <h4 className="text-red-300 font-bold text-sm mb-2">{validationState.overall.message}</h4>
                                    {validationState.overall.issues && validationState.overall.issues.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold text-red-200 mb-1">Issues found:</p>
                                            <ul className="text-xs text-red-100 space-y-1 list-disc list-inside">
                                                {validationState.overall.issues.map((issue, i) => (
                                                    <li key={i}>{issue}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {validationState.overall.fixes && validationState.overall.fixes.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-xs font-semibold text-amber-300 mb-1">How to fix:</p>
                                            <ul className="text-xs text-gray-200 space-y-1 list-decimal list-inside">
                                                {validationState.overall.fixes.map((fix, i) => (
                                                    <li key={i}>{fix}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {validationState.overall.helpUrl && (
                                        <a 
                                            href={validationState.overall.helpUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="inline-block text-xs text-blue-300 hover:text-blue-200 underline"
                                        >
                                            📚 View complete setup guide →
                                        </a>
                                    )}
                                    <button
                                        onClick={() => setShowValidationPanel(false)}
                                        className="mt-3 text-xs text-gray-400 hover:text-gray-200 underline"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <footer className="flex justify-between items-center p-4 border-t border-gray-700">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            Reset to Defaults
                        </button>
                        <button
                            onClick={async () => {
                                addToast('Running comprehensive validation...', 'info');
                                // Run actual connection tests
                                await handleTestLLMConnection();
                                if (formData.videoProvider === 'comfyui-local' && formData.comfyUIUrl) {
                                    await handleTestComfyUIConnection();
                                }
                                // Then validate all settings
                                validateAllSettings();
                                setShowValidationPanel(true);
                                addToast('Validation complete. Review results below.', 'info');
                            }}
                            disabled={connectionStatus.llm.status === 'testing' || connectionStatus.comfyui.status === 'testing'}
                            className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300 disabled:text-gray-500 transition-colors"
                            title="Run connection tests and validate all settings"
                        >
                            {connectionStatus.llm.status === 'testing' || connectionStatus.comfyui.status === 'testing' ? '⏳ Testing...' : '✓ Validate All'}
                        </button>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleClose}
                            data-testid="close-settings"
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                        >
                            {hasChanges ? 'Discard Changes' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleSave}
                            data-testid="save-settings"
                            disabled={false}
                            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium relative group"
                            title="Save settings (validation recommended but not required)"
                        >
                            Save Settings
                            {!validationState.llm.valid && !validationState.comfyui.valid && (
                                <span className="absolute hidden group-hover:block bottom-full mb-2 right-0 w-64 p-2 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 shadow-lg z-10">
                                    ⚠️ Validation recommended: Test connections to ensure settings work correctly.
                                </span>
                            )}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default LocalGenerationSettingsModal;
