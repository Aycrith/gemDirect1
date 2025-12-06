import React, { useState, useEffect } from 'react';
import { LocalGenerationSettings, WorkflowProfile, WorkflowPostProcessingOptions } from '../types';
import { 
    validateWorkflows, 
    parseError, 
    HELP_DOCS,
    type ValidationResult
} from '../utils/settingsValidation';
import {
    FEATURE_FLAG_META,
    DEFAULT_FEATURE_FLAGS,
    SAFE_DEFAULTS_FLAGS,
    SAFE_DEFAULTS_MODE_CONFIG,
    PRODUCTION_QA_FLAGS,
    PRODUCTION_QA_MODE_CONFIG,
    checkSafeDefaults,
    checkProductionQA,
    mergeFeatureFlags,
    getFlagsByCategory,
    checkFlagDependencies,
    validateFlagCombination,
} from '../utils/featureFlags';
import {
    STABILITY_PROFILE_LIST,
    STABILITY_PROFILES,
    detectCurrentProfile,
    applyStabilityProfile,
    getProfileSummary,
} from '../utils/stabilityProfiles';
import {
    validateActiveModelsWithEnforcement,
    formatEnforcementResult,
    type EnforcementResult,
} from '../utils/modelSanityCheck';
import { testLLMConnection, testComfyUIConnection } from '../services/comfyUIService';

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
    visionLlm: {
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
    const [activeTab, setActiveTab] = useState<'llm' | 'video' | 'comfyui' | 'advanced' | 'features'>('llm');
    // Ensure videoProvider has a default value to prevent validation issues
    const [formData, setFormData] = useState<LocalGenerationSettings>({
        ...settings,
        videoProvider: settings.videoProvider || 'comfyui-local'
    });
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        llm: { status: 'idle', message: '' },
        visionLlm: { status: 'idle', message: '' },
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
    const [modelSanityResult, setModelSanityResult] = useState<EnforcementResult | null>(null);
    const [isRunningModelCheck, setIsRunningModelCheck] = useState(false);

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

    // Helper to update post-processing options for the selected bookend workflow profile
    const handlePostProcessingChange = (field: keyof WorkflowPostProcessingOptions, value: any) => {
        const profileId = formData.sceneBookendWorkflowProfile || 'wan-flf2v';
        setFormData(prev => {
            const currentProfile = prev.workflowProfiles?.[profileId];
            if (!currentProfile) return prev;
            
            return {
                ...prev,
                workflowProfiles: {
                    ...prev.workflowProfiles,
                    [profileId]: {
                        ...currentProfile,
                        postProcessing: {
                            ...(currentProfile.postProcessing || {}),
                            [field]: value
                        }
                    }
                }
            };
        });
        setHasChanges(true);
    };

    // Get current post-processing settings for the selected bookend workflow
    const getPostProcessingSettings = (): WorkflowPostProcessingOptions => {
        const profileId = formData.sceneBookendWorkflowProfile || 'wan-flf2v';
        const profile = formData.workflowProfiles?.[profileId];
        return profile?.postProcessing || {
            snapEndpointsToKeyframes: true,
            startFrameCount: 1,
            endFrameCount: 1,
            blendMode: 'hard',
            fadeFrames: 3
        };
    };

    const handleTestLLMConnection = async () => {
        setConnectionStatus(prev => ({ ...prev, llm: { status: 'testing', message: 'Connecting...' } }));
        
        try {
            // Use proxy in DEV mode to avoid CORS issues (same as localStoryService)
            let providerUrl: string;
            if (import.meta.env.DEV) {
                // In development, use Vite proxy endpoint for /v1/models
                providerUrl = '/api/local-llm-models';
            } else {
                // In production, use the configured URL or default
                providerUrl = formData.llmProviderUrl || 
                           import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 
                           (typeof window !== 'undefined' && (window as any).LOCAL_STORY_PROVIDER_URL) || 
                           'http://192.168.50.192:1234/v1/chat/completions';
            }
            
            // Use service layer for connection testing
            const result = await testLLMConnection(providerUrl);
            
            if (result.modelCount === 0) {
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
                const modelList = result.models.length > 0 
                    ? ` (${result.models.join(', ')}${result.modelCount > 3 ? ` +${result.modelCount - 3} more` : ''})` 
                    : '';
                setConnectionStatus(prev => ({ 
                    ...prev, 
                    llm: { 
                        status: 'success', 
                        message: `Connection successful. Found ${result.modelCount} model(s)${modelList}. Ready to proceed.`,
                        models: result.models,
                        details: `Available models: ${result.modelCount}`
                    } 
                }));
                setValidationState(prev => ({
                    ...prev,
                    llm: {
                        valid: true,
                        message: `${result.modelCount} model(s) available`
                    }
                }));
                addToast(`LM Studio connected: ${result.modelCount} model(s) ready`, 'success');
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

    const handleTestVisionLLMConnection = async () => {
        setConnectionStatus(prev => ({ ...prev, visionLlm: { status: 'testing', message: 'Connecting to Vision LLM...' } }));
        
        try {
            // Determine which URL to use: vision-specific or fall back to main LLM
            const useUnified = formData.useUnifiedVisionModel ?? true;
            const providerUrl = useUnified 
                ? (formData.llmProviderUrl || import.meta.env.VITE_LOCAL_STORY_PROVIDER_URL || 'http://192.168.50.192:1234/v1/chat/completions')
                : (formData.visionLLMProviderUrl || formData.llmProviderUrl || 'http://192.168.50.192:1234/v1/chat/completions');
            
            // Use dev proxy URL or the actual URL
            const testUrl = import.meta.env.DEV ? '/api/local-llm-models' : providerUrl;
            
            // Use service layer for connection testing
            const result = await testLLMConnection(testUrl);
            
            const expectedModel = useUnified
                ? (formData.llmModel || import.meta.env.VITE_LOCAL_LLM_MODEL || '')
                : (formData.visionLLMModel || '');
            
            // Check if the expected model is loaded
            const modelLoaded = expectedModel && result.models.some(modelName => 
                modelName.toLowerCase().includes(expectedModel.toLowerCase().split('/').pop() || '')
            );
            
            if (result.modelCount === 0) {
                setConnectionStatus(prev => ({
                    ...prev,
                    visionLlm: {
                        status: 'success',
                        message: 'Connected, but no models loaded. Load a vision model (e.g., Qwen3-VL) in LM Studio.',
                        models: [],
                        details: 'Vision analysis will not work without a loaded model'
                    }
                }));
                addToast('Vision LLM connected (no models loaded)', 'info');
            } else if (modelLoaded) {
                setConnectionStatus(prev => ({
                    ...prev,
                    visionLlm: {
                        status: 'success',
                        message: `✓ Vision model ready: ${expectedModel.split('/').pop()}`,
                        models: result.models,
                        details: `Found ${result.modelCount} model(s)`
                    }
                }));
                addToast('Vision LLM connected and model loaded', 'success');
            } else {
                const loadedNames = result.models.slice(0, 2);
                setConnectionStatus(prev => ({
                    ...prev,
                    visionLlm: {
                        status: 'success',
                        message: `Connected. Models available: ${loadedNames.join(', ')}${result.modelCount > 2 ? '...' : ''}`,
                        models: loadedNames,
                        details: expectedModel ? `Expected model "${expectedModel}" not found` : 'Configure a vision model name'
                    }
                }));
                addToast(`Vision LLM connected (${result.modelCount} models)`, 'success');
            }
        } catch (error: any) {
            const errorInfo = parseError(error);
            setConnectionStatus(prev => ({
                ...prev,
                visionLlm: {
                    status: 'error',
                    message: `Vision LLM connection failed: ${errorInfo.title}`,
                    details: errorInfo.description
                }
            }));
            addToast(`Vision LLM error: ${errorInfo.title}`, 'error');
        }
    };

    const handleTestComfyUIConnection = async () => {
        setConnectionStatus(prev => ({ ...prev, comfyui: { status: 'testing', message: 'Connecting...' } }));
        
        try {
            // Use proxy in DEV mode to avoid CORS issues
            let comfyUIUrl: string;
            if (import.meta.env.DEV) {
                comfyUIUrl = 'http://127.0.0.1:8188';  // Will route through Vite proxy
            } else {
                comfyUIUrl = formData.comfyUIUrl || 'http://127.0.0.1:8188';
            }
            
            // Use service layer for connection testing
            const result = await testComfyUIConnection(comfyUIUrl);
            
            setConnectionStatus(prev => ({ 
                ...prev, 
                comfyui: { 
                    status: 'success', 
                    message: `Connection successful. GPU: ${result.gpu}. Ready to proceed.`,
                    gpu: result.gpu,
                    details: `System ready for workflow execution`
                } 
            }));
            setValidationState(prev => ({
                ...prev,
                comfyui: {
                    valid: true,
                    message: `Connected (GPU: ${result.gpu})`
                }
            }));
            addToast(`ComfyUI connected: ${result.gpu}`, 'success');
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
                    <button
                        onClick={() => setActiveTab('features')}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === 'features' 
                                ? 'text-amber-400 border-b-2 border-amber-400' 
                                : 'text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        🧪 Features
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

                            {/* Vision LLM Configuration Section */}
                            <div className="mt-8 pt-6 border-t border-gray-700">
                                <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-4 mb-4">
                                    <h4 className="text-sm font-medium text-purple-300 mb-2">👁️ Vision LLM (Image Analysis)</h4>
                                    <p className="text-xs text-gray-400">
                                        Vision-enabled LLM for analyzing generated keyframes and providing prompt feedback. 
                                        Used to improve image quality through iterative refinement.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    {/* Unified Model Toggle */}
                                    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                                        <input
                                            type="checkbox"
                                            id="useUnifiedVisionModel"
                                            checked={formData.useUnifiedVisionModel ?? true}
                                            onChange={(e) => handleInputChange('useUnifiedVisionModel', e.target.checked)}
                                            className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500"
                                        />
                                        <label htmlFor="useUnifiedVisionModel" className="text-sm text-gray-300">
                                            <span className="font-medium">Use same model for text and vision</span>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Recommended for abliterated vision models like Qwen3-VL that handle both tasks
                                            </p>
                                        </label>
                                    </div>

                                    {/* Separate Vision LLM Config (only shown when not unified) */}
                                    {!(formData.useUnifiedVisionModel ?? true) && (
                                        <div className="space-y-4 border-l-4 border-purple-500 pl-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                                    Vision LLM Provider URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.visionLLMProviderUrl || formData.llmProviderUrl || ''}
                                                    onChange={(e) => handleInputChange('visionLLMProviderUrl', e.target.value)}
                                                    placeholder="http://192.168.50.192:1234/v1/chat/completions"
                                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Leave empty to use main LLM URL</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                                    Vision Model Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formData.visionLLMModel || ''}
                                                    onChange={(e) => handleInputChange('visionLLMModel', e.target.value)}
                                                    placeholder="huihui-qwen3-vl-32b-instruct-abliterated"
                                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Vision-capable model for image analysis</p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                                    Vision Temperature: {(formData.visionLLMTemperature ?? 0.3).toFixed(2)}
                                                </label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={formData.visionLLMTemperature ?? 0.3}
                                                    onChange={(e) => handleInputChange('visionLLMTemperature', Number(e.target.value))}
                                                    className="w-full"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Lower = more precise analysis</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Test Vision Connection Button */}
                                    <div className="pt-2">
                                        <button
                                            onClick={handleTestVisionLLMConnection}
                                            disabled={connectionStatus.visionLlm.status === 'testing'}
                                            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            {connectionStatus.visionLlm.status === 'testing' ? 'Testing...' : '👁️ Test Vision LLM Connection'}
                                        </button>
                                        {connectionStatus.visionLlm.message && (
                                            <div className={`mt-3 p-3 rounded-lg border ${
                                                connectionStatus.visionLlm.status === 'success'
                                                    ? 'bg-green-900/20 border-green-700/30'
                                                    : connectionStatus.visionLlm.status === 'error'
                                                    ? 'bg-red-900/20 border-red-700/30'
                                                    : 'bg-purple-900/20 border-purple-700/30'
                                            }`}>
                                                <div className={`flex items-start gap-2 text-sm ${getStatusColor(connectionStatus.visionLlm.status)}`}>
                                                    <span className="text-lg">{getStatusIcon(connectionStatus.visionLlm.status)}</span>
                                                    <div className="flex-1">
                                                        <p className="font-medium">{connectionStatus.visionLlm.message}</p>
                                                        {connectionStatus.visionLlm.details && (
                                                            <p className="text-xs mt-1 text-gray-400">{connectionStatus.visionLlm.details}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Vision Feature Info */}
                                    <div className="bg-gray-800/30 rounded-lg p-3 text-xs text-gray-400">
                                        <p className="font-medium text-gray-300 mb-1">📋 How Vision Analysis Works:</p>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            <li>After keyframe generation, analyze the image for quality issues</li>
                                            <li>Get composition, lighting, and coherence scores</li>
                                            <li>Receive refined prompts to improve regeneration</li>
                                            <li>Enable auto-analysis in Features tab for automatic feedback</li>
                                        </ul>
                                    </div>
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
                                            ...(data.sceneChainedWorkflowProfile && { sceneChainedWorkflowProfile: data.sceneChainedWorkflowProfile }),
                                            ...(data.sceneBookendWorkflowProfile && { sceneBookendWorkflowProfile: data.sceneBookendWorkflowProfile }),
                                        };
                                        console.log('[Workflow Import] imageWorkflowProfile:', updatedFormData.imageWorkflowProfile);
                                        console.log('[Workflow Import] videoWorkflowProfile:', updatedFormData.videoWorkflowProfile);
                                        console.log('[Workflow Import] sceneChainedWorkflowProfile:', updatedFormData.sceneChainedWorkflowProfile);
                                        console.log('[Workflow Import] sceneBookendWorkflowProfile:', updatedFormData.sceneBookendWorkflowProfile);
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
                                                    // - OR has "nodes" as object with numeric keys (enhanced format like flf2v)
                                                    // - OR has "nodes" as array (GUI export format)
                                                    // - AND doesn't look like a settings file (no comfyUIUrl, workflowProfiles, etc.)
                                                    const keys = Object.keys(data);
                                                    const hasNumericKeys = keys.some(k => /^\d+$/.test(k) && typeof data[k] === 'object' && data[k].class_type);
                                                    const hasPromptStructure = 'prompt' in data && typeof data.prompt === 'object';
                                                    
                                                    // Enhanced format: nodes as object with numeric keys (e.g., video_wan2_2_5B_flf2v.json)
                                                    const hasEnhancedFormat = 'nodes' in data && 
                                                        typeof data.nodes === 'object' && 
                                                        !Array.isArray(data.nodes) &&
                                                        Object.keys(data.nodes || {}).some((k: string) => /^\d+$/.test(k) && data.nodes[k]?.class_type);
                                                    
                                                    // GUI export format: nodes as array (e.g., exported from ComfyUI GUI)
                                                    const hasGUIExportFormat = 'nodes' in data && 
                                                        Array.isArray(data.nodes) &&
                                                        data.nodes.some((n: any) => n?.type || n?.class_type);
                                                    
                                                    const looksLikeSettingsFile = 'comfyUIUrl' in data || 'workflowProfiles' in data || 'mapping' in data;
                                                    
                                                    const isComfyUIWorkflow = (hasNumericKeys || hasPromptStructure || hasEnhancedFormat || hasGUIExportFormat) && !looksLikeSettingsFile;
                                                    
                                                    console.log('[Workflow Import] Detection:', { hasNumericKeys, hasPromptStructure, hasEnhancedFormat, hasGUIExportFormat, looksLikeSettingsFile, isComfyUIWorkflow });
                                                    
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
                                                        
                                                        // Build updated form data with new profile
                                                        const updatedFormData = {
                                                            ...formData,
                                                            workflowProfiles: updatedProfiles
                                                        };
                                                        
                                                        console.log('[Workflow Import] Saving profiles...', Object.keys(updatedProfiles));
                                                        setFormData(updatedFormData);
                                                        
                                                        // CRITICAL: Auto-persist to IndexedDB immediately (like settings file import does)
                                                        console.log('[Workflow Import] Auto-saving to IndexedDB...');
                                                        onSave(updatedFormData);
                                                        setHasChanges(false);
                                                        
                                                        console.log('[Workflow Import] Import complete and persisted!');
                                                        addToast(`Created and saved workflow profile "${profileLabel}" - configure mappings below`, 'success');
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
                                            // Determine workflow source and mappings
                                            const hasWorkflow = !!(profile.workflowJson && profile.workflowJson.trim().length > 10);
                                            const mapping = profile.mapping || {};
                                            const mappedTypes = new Set(Object.values(mapping));
                                            
                                            // Check various mapping requirements
                                            const hasText = mappedTypes.has('human_readable_prompt') || mappedTypes.has('full_timeline_json');
                                            const hasKeyframe = mappedTypes.has('keyframe_image');
                                            const hasStartEnd = mappedTypes.has('start_image') && mappedTypes.has('end_image');
                                            const hasRefImage = mappedTypes.has('ref_image');
                                            const hasControlVideo = mappedTypes.has('control_video');
                                            const hasInputVideo = mappedTypes.has('input_video');
                                            
                                            // Profile-specific readiness logic
                                            const isTextToImageProfile = id.includes('-t2i');
                                            const isImageToVideoProfile = id === 'wan-i2v';
                                            const isBookendProfile = id === 'wan-flf2v' || id === 'wan-fun-inpaint';
                                            const isControlProfile = id === 'wan-fun-control';
                                            const isUpscalerProfile = id === 'video-upscaler';
                                            
                                            let isReady = false;
                                            if (!hasWorkflow) {
                                                isReady = false;
                                            } else if (isUpscalerProfile) {
                                                isReady = hasInputVideo;
                                            } else if (isTextToImageProfile) {
                                                isReady = hasText;
                                            } else if (isImageToVideoProfile) {
                                                isReady = hasText && hasKeyframe;
                                            } else if (isBookendProfile) {
                                                isReady = hasText && hasStartEnd;
                                            } else if (isControlProfile) {
                                                isReady = hasText && hasRefImage && hasControlVideo;
                                            } else {
                                                // Default: text mapping required
                                                isReady = hasText;
                                            }

                                            const readiness = hasWorkflow ? { isReady, hasText, hasKeyframe, hasStartEnd, hasRefImage, hasControlVideo, hasInputVideo } : null;

                                            return (
                                                <div key={id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                                                    <div>
                                                        <span className="font-medium text-gray-300">{profile.label || id}</span>
                                                        <span className="text-xs text-gray-500 ml-2">({id})</span>
                                                        {readiness && (
                                                            <div className="flex gap-1 mt-1 flex-wrap" data-testid={`wan-readiness-${id}`}>
                                                                {/* Show CLIP for non-upscaler profiles */}
                                                                {!isUpscalerProfile && (
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                        readiness.hasText ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                    }`} title="CLIP text mapping for prompts">
                                                                        {readiness.hasText ? '✓' : '✗'} CLIP
                                                                    </span>
                                                                )}
                                                                {/* Show Keyframe for wan-i2v */}
                                                                {isImageToVideoProfile && (
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                        readiness.hasKeyframe ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                    }`} title="LoadImage mapping for keyframe_image">
                                                                        {readiness.hasKeyframe ? '✓' : '✗'} Keyframe
                                                                    </span>
                                                                )}
                                                                {/* Show Start/End for bookend profiles */}
                                                                {isBookendProfile && (
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                        readiness.hasStartEnd ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                    }`} title="LoadImage mappings for start_image and end_image">
                                                                        {readiness.hasStartEnd ? '✓' : '✗'} Start/End
                                                                    </span>
                                                                )}
                                                                {/* Show Ref/Control for control profiles */}
                                                                {isControlProfile && (
                                                                    <>
                                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                            readiness.hasRefImage ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                        }`} title="LoadImage mapping for ref_image">
                                                                            {readiness.hasRefImage ? '✓' : '✗'} RefImg
                                                                        </span>
                                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                            readiness.hasControlVideo ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                        }`} title="LoadVideo mapping for control_video">
                                                                            {readiness.hasControlVideo ? '✓' : '✗'} CtrlVid
                                                                        </span>
                                                                    </>
                                                                )}
                                                                {/* Show Input Video for upscaler */}
                                                                {isUpscalerProfile && (
                                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                        readiness.hasInputVideo ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                                                                    }`} title="LoadVideo mapping for input_video">
                                                                        {readiness.hasInputVideo ? '✓' : '✗'} Input
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        readiness?.isReady ? 'bg-green-900/30 text-green-400' : 
                                                        hasWorkflow ? 'bg-amber-900/30 text-amber-400' : 'bg-gray-700 text-gray-400'
                                                    }`}>
                                                        {readiness?.isReady ? '✓ Ready' : hasWorkflow ? '⚠ Incomplete' : '○ Not configured'}
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

                            {/* Workflow Profile Selection */}
                            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-3">Workflow Profile Selection</h4>
                                <p className="text-xs text-gray-500 mb-4">
                                    Select which workflow profiles to use for different generation tasks.
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">
                                            Bookend Video Workflow
                                        </label>
                                        <select
                                            value={formData.sceneBookendWorkflowProfile || 'wan-flf2v'}
                                            onChange={(e) => handleInputChange('sceneBookendWorkflowProfile', e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        >
                                            {Object.keys(formData.workflowProfiles || {}).length > 0 ? (
                                                Object.entries(formData.workflowProfiles || {}).map(([id, profile]) => (
                                                    <option key={id} value={id}>{profile.label || id}</option>
                                                ))
                                            ) : (
                                                <>
                                                    <option value="wan-flf2v">WAN 2.2 First-Last-Frame (wan-flf2v)</option>
                                                    <option value="wan-fun-inpaint">WAN 2.2 Fun Inpaint (wan-fun-inpaint) ★ Recommended</option>
                                                    <option value="wan-flf2v-feta">WAN FLF2V + FETA (Temporal Coherence)</option>
                                                    <option value="wan-ipadapter">WAN IP-Adapter (Character Consistency)</option>
                                                </>
                                            )}
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">
                                            <strong className="text-amber-400">★ Production Default:</strong> <code className="px-1 bg-gray-800 rounded">wan-fun-inpaint</code> + Standard stability profile (deflicker ON). Best balance of quality and performance.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Video Post-Processing Options */}
                            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    🎬 Video Post-Processing
                                    <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-300 border border-purple-700 rounded">QA Pipeline</span>
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">
                                    Post-processing applied after video generation to improve endpoint consistency.
                                </p>
                                
                                <div className="space-y-4">
                                    {/* Endpoint Snapping Toggle */}
                                    <label className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg cursor-pointer hover:border-amber-500/50 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={getPostProcessingSettings().snapEndpointsToKeyframes !== false}
                                            onChange={(e) => handlePostProcessingChange('snapEndpointsToKeyframes', e.target.checked)}
                                            className="mt-1 text-amber-400 focus:ring-amber-400 rounded"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-200 mb-1">Snap Endpoints to Keyframes</div>
                                            <div className="text-xs text-gray-400">
                                                Replace the first and last frames of generated videos with their corresponding keyframe images. 
                                                Ensures visual consistency at video boundaries.
                                            </div>
                                        </div>
                                    </label>

                                    {/* Conditional: Frame count & blend options (only when snapping enabled) */}
                                    {getPostProcessingSettings().snapEndpointsToKeyframes !== false && (
                                        <div className="ml-6 space-y-3 border-l-2 border-gray-700 pl-4">
                                            {/* Blend Mode */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1">Blend Mode</label>
                                                <select
                                                    value={getPostProcessingSettings().blendMode || 'hard'}
                                                    onChange={(e) => handlePostProcessingChange('blendMode', e.target.value)}
                                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                >
                                                    <option value="hard">Hard Replace (instant cut)</option>
                                                    <option value="fade">Fade Blend (smooth transition)</option>
                                                </select>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    <strong>Hard:</strong> Directly replace frames. <strong>Fade:</strong> Blend over multiple frames.
                                                </p>
                                            </div>

                                            {/* Frame Counts */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Frames</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="10"
                                                        value={getPostProcessingSettings().startFrameCount || 1}
                                                        onChange={(e) => handlePostProcessingChange('startFrameCount', Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Frames to replace at start</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-300 mb-1">End Frames</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="10"
                                                        value={getPostProcessingSettings().endFrameCount || 1}
                                                        onChange={(e) => handlePostProcessingChange('endFrameCount', Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Frames to replace at end</p>
                                                </div>
                                            </div>

                                            {/* Fade Frames (only for fade mode) */}
                                            {getPostProcessingSettings().blendMode === 'fade' && (
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-300 mb-1">Fade Duration (frames)</label>
                                                    <input
                                                        type="number"
                                                        min="2"
                                                        max="15"
                                                        value={getPostProcessingSettings().fadeFrames || 3}
                                                        onChange={(e) => handlePostProcessingChange('fadeFrames', Math.max(2, parseInt(e.target.value) || 3))}
                                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Number of frames over which to blend the transition</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-700">
                                    <p className="text-xs text-gray-500">
                                        💡 Post-processing settings apply to the selected bookend video workflow (<code className="px-1 bg-gray-800 rounded">{formData.sceneBookendWorkflowProfile || 'wan-flf2v'}</code>).
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

                            {/* Model Sanity Check Section */}
                            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
                                            🔍 Model Sanity Check
                                        </h4>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Verify that text LLM, vision LLM, and video workflow are correctly configured for bookend generation.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setIsRunningModelCheck(true);
                                            // Small delay to show loading state
                                            setTimeout(() => {
                                                const result = validateActiveModelsWithEnforcement(formData, { enforce: false });
                                                setModelSanityResult(result);
                                                setIsRunningModelCheck(false);
                                            }, 100);
                                        }}
                                        disabled={isRunningModelCheck}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-wait text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        {isRunningModelCheck ? (
                                            <>
                                                <span className="animate-spin">⏳</span>
                                                Checking...
                                            </>
                                        ) : (
                                            <>Run Model Sanity Check</>
                                        )}
                                    </button>
                                </div>
                                
                                {modelSanityResult && (() => {
                                    const formatted = formatEnforcementResult(modelSanityResult);
                                    const bgColor = formatted.status === 'success' 
                                        ? 'bg-green-900/30 border-green-700' 
                                        : formatted.status === 'warning'
                                            ? 'bg-yellow-900/30 border-yellow-700'
                                            : 'bg-red-900/30 border-red-700';
                                    const textColor = formatted.status === 'success'
                                        ? 'text-green-300'
                                        : formatted.status === 'warning'
                                            ? 'text-yellow-300'
                                            : 'text-red-300';
                                    
                                    return (
                                        <div className={`mt-3 p-3 rounded-lg border ${bgColor}`}>
                                            <div className={`text-sm font-medium ${textColor} mb-2`}>
                                                {formatted.title}
                                            </div>
                                            <ul className="text-xs text-gray-300 space-y-1">
                                                {formatted.details.map((detail, idx) => (
                                                    <li key={idx} className="flex items-start gap-2">
                                                        <span className="text-gray-500">•</span>
                                                        <span>{detail}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            {modelSanityResult.blocked && (
                                                <div className="mt-2 text-xs text-red-400 font-medium">
                                                    ⛔ Video generation will be blocked until issues are resolved.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                <div className="mt-3 text-xs text-gray-500">
                                    <strong>Expected configuration:</strong>
                                    <ul className="mt-1 space-y-1">
                                        <li>• Text LLM: <code className="text-blue-400">qwen/qwen3-14b</code></li>
                                        <li>• Vision LLM: <code className="text-blue-400">qwen/qwen3-vl-8b</code></li>
                                        <li>• Bookend Profile: <code className="text-blue-400">wan-flf2v</code></li>
                                        <li>• VAE: <code className="text-blue-400">wan2.2_vae.safetensors</code></li>
                                    </ul>
                                </div>
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

                                {/* ComfyUI Fetch Settings */}
                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                    <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                        🔄 ComfyUI Asset Fetch Settings
                                        <span className="text-xs text-gray-500 font-normal">(for video/image retrieval)</span>
                                    </h4>
                                    <p className="text-xs text-gray-400 mb-4">
                                        Adjust these settings if you're experiencing "received filename instead of data URL" errors or timeout issues when generating videos.
                                    </p>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                                Max Retries
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    value={formData.comfyUIFetchMaxRetries ?? 3}
                                                    onChange={(e) => handleInputChange('comfyUIFetchMaxRetries', parseInt(e.target.value) || 3)}
                                                    className="w-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                />
                                                <span className="text-xs text-gray-500">attempts (default: 3)</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">Number of retry attempts if asset fetch fails</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                                Fetch Timeout
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min="5000"
                                                    max="120000"
                                                    step="1000"
                                                    value={formData.comfyUIFetchTimeoutMs ?? 15000}
                                                    onChange={(e) => handleInputChange('comfyUIFetchTimeoutMs', parseInt(e.target.value) || 15000)}
                                                    className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                />
                                                <span className="text-xs text-gray-500">ms (default: 15000 = 15s)</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">Timeout for each fetch attempt. Increase for large videos or slow networks.</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                                Retry Delay
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    min="500"
                                                    max="10000"
                                                    step="500"
                                                    value={formData.comfyUIFetchRetryDelayMs ?? 1000}
                                                    onChange={(e) => handleInputChange('comfyUIFetchRetryDelayMs', parseInt(e.target.value) || 1000)}
                                                    className="w-28 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                />
                                                <span className="text-xs text-gray-500">ms (default: 1000 = 1s)</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">Delay between retry attempts. Increase if ComfyUI needs more time to write files.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'features' && (
                        <div className="space-y-6">
                            <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-4 mb-4">
                                <h4 className="text-sm font-medium text-purple-300 mb-2">🧪 Feature Flags</h4>
                                <p className="text-xs text-gray-400">
                                    Enable experimental features to enhance video generation quality. 
                                    Features are grouped by category. Some features may have dependencies on others.
                                </p>
                            </div>

                            {/* Safe Defaults Banner */}
                            {(() => {
                                const safeCheck = checkSafeDefaults(formData.featureFlags || {});
                                return (
                                    <div className={`rounded-lg p-4 border ${
                                        safeCheck.isSafe 
                                            ? 'bg-green-900/20 border-green-700/50' 
                                            : 'bg-amber-900/20 border-amber-700/50'
                                    }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-lg ${safeCheck.isSafe ? 'text-green-400' : 'text-amber-400'}`}>
                                                    {safeCheck.isSafe ? '✅' : '⚠️'}
                                                </span>
                                                <h4 className={`text-sm font-medium ${safeCheck.isSafe ? 'text-green-300' : 'text-amber-300'}`}>
                                                    {safeCheck.isSafe ? 'VRAM-Safe Configuration' : 'VRAM-Intensive Features Enabled'}
                                                </h4>
                                            </div>
                                            {!safeCheck.isSafe && (
                                                <button
                                                    onClick={() => {
                                                        handleInputChange('featureFlags', SAFE_DEFAULTS_FLAGS);
                                                        addToast('Applied safe defaults for ~8 GB GPUs', 'success');
                                                    }}
                                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded transition-colors"
                                                >
                                                    Apply Safe Defaults
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">
                                            {safeCheck.recommendation}
                                        </p>
                                        {!safeCheck.isSafe && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {safeCheck.unsafeFlags.map(flag => (
                                                    <span key={flag} className="px-2 py-0.5 text-xs bg-amber-900/50 text-amber-200 rounded">
                                                        {FEATURE_FLAG_META[flag]?.label || flag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
                                            💡 <strong>Tip:</strong> {SAFE_DEFAULTS_MODE_CONFIG.description}. {SAFE_DEFAULTS_MODE_CONFIG.recommendation}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Production QA Banner */}
                            {(() => {
                                const qaCheck = checkProductionQA(formData.featureFlags || {});
                                const safeCheck = checkSafeDefaults(formData.featureFlags || {});
                                // Only show if not in Safe Defaults mode (would conflict)
                                if (safeCheck.isSafe) return null;
                                
                                return (
                                    <div className={`rounded-lg p-4 border ${
                                        qaCheck.isProductionQA 
                                            ? 'bg-blue-900/20 border-blue-700/50' 
                                            : 'bg-gray-800/50 border-gray-700/50'
                                    }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-lg ${qaCheck.isProductionQA ? 'text-blue-400' : 'text-gray-400'}`}>
                                                    {qaCheck.isProductionQA ? '🔬' : '🔧'}
                                                </span>
                                                <h4 className={`text-sm font-medium ${qaCheck.isProductionQA ? 'text-blue-300' : 'text-gray-300'}`}>
                                                    {qaCheck.isProductionQA ? 'Production QA Mode Active' : 'Production QA Mode'}
                                                </h4>
                                            </div>
                                            {!qaCheck.isProductionQA && (
                                                <button
                                                    onClick={() => {
                                                        handleInputChange('featureFlags', PRODUCTION_QA_FLAGS);
                                                        addToast('Applied Production QA mode for ~10-12 GB GPUs', 'success');
                                                    }}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                                                >
                                                    Apply Production QA
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">
                                            {qaCheck.isProductionQA 
                                                ? 'QA features enabled with VRAM-conscious settings. Aligned with A1/A3 Vision QA thresholds.'
                                                : qaCheck.recommendation}
                                        </p>
                                        {qaCheck.missingQAFlags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                <span className="text-xs text-gray-500">Missing QA:</span>
                                                {qaCheck.missingQAFlags.map(flag => (
                                                    <span key={flag} className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-200 rounded">
                                                        {FEATURE_FLAG_META[flag]?.label || flag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {qaCheck.extraVRAMFlags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                <span className="text-xs text-gray-500">VRAM-heavy (not in QA preset):</span>
                                                {qaCheck.extraVRAMFlags.map(flag => (
                                                    <span key={flag} className="px-2 py-0.5 text-xs bg-amber-900/50 text-amber-200 rounded">
                                                        {FEATURE_FLAG_META[flag]?.label || flag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
                                            💡 <strong>Tip:</strong> {PRODUCTION_QA_MODE_CONFIG.description}. {PRODUCTION_QA_MODE_CONFIG.recommendation}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Flag validation warnings */}
                            {(() => {
                                const validation = validateFlagCombination(formData.featureFlags);
                                if (validation.warnings.length > 0) {
                                    return (
                                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4">
                                            <h4 className="text-sm font-medium text-amber-300 mb-2">⚠️ Configuration Warnings</h4>
                                            <ul className="text-xs text-amber-200 space-y-1">
                                                {validation.warnings.map((warning, i) => (
                                                    <li key={i}>• {warning}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {/* Quality Category */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <span className="w-6 h-6 flex items-center justify-center bg-green-900/50 text-green-400 rounded text-xs">Q</span>
                                    Quality Enhancement
                                </h4>
                                <div className="space-y-2 pl-8">
                                    {getFlagsByCategory('quality').map(meta => {
                                        const currentFlags = mergeFeatureFlags(formData.featureFlags);
                                        const currentValue = currentFlags[meta.id];
                                        const deps = checkFlagDependencies(formData.featureFlags, meta.id);
                                        
                                        // Special handling for non-boolean flags
                                        const isDropdownFlag = ['qualityPrefixVariant', 'sceneListValidationMode', 'promptTokenGuard', 'visionFeedbackProvider'].includes(meta.id);
                                        
                                        if (isDropdownFlag) {
                                            // Render dropdown for multi-value flags
                                            return (
                                                <div key={meta.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                                    currentValue !== 'off' && currentValue !== 'legacy' && currentValue !== 'disabled'
                                                        ? 'bg-green-900/20 border-green-700/50' 
                                                        : 'bg-gray-800/50 border-gray-700'
                                                }`}>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-medium text-gray-200">{meta.label}</span>
                                                            <span className={`px-2 py-0.5 text-xs rounded ${
                                                                meta.stability === 'stable' 
                                                                    ? 'bg-green-900/50 text-green-300 border border-green-700'
                                                                    : meta.stability === 'beta'
                                                                    ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                                                                    : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                                            }`}>
                                                                {meta.stability.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-400 mb-2">{meta.description}</p>
                                                        <select
                                                            value={currentValue as string}
                                                            onChange={(e) => {
                                                                const newFlags = {
                                                                    ...mergeFeatureFlags(formData.featureFlags),
                                                                    [meta.id]: e.target.value
                                                                };
                                                                handleInputChange('featureFlags', newFlags);
                                                            }}
                                                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 focus:ring-green-400 focus:border-green-400"
                                                        >
                                                            {meta.id === 'qualityPrefixVariant' ? (
                                                                <>
                                                                    <option value="legacy">Legacy (original prompts)</option>
                                                                    <option value="optimized">Optimized (enhanced quality)</option>
                                                                </>
                                                            ) : meta.id === 'visionFeedbackProvider' ? (
                                                                <>
                                                                    <option value="disabled">Disabled (no vision analysis)</option>
                                                                    <option value="local-qwen">Local Qwen3-VL (via LM Studio)</option>
                                                                    <option value="gemini">Gemini Pro Vision (requires API key)</option>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <option value="off">Off (disabled)</option>
                                                                    <option value="warn">Warn (log warnings)</option>
                                                                    <option value="block">Block (prevent generation)</option>
                                                                </>
                                                            )}
                                                        </select>
                                                        {!deps.satisfied && (
                                                            <p className="text-xs text-amber-400 mt-1">
                                                                ⚠️ Requires: {deps.missingDeps.map(d => FEATURE_FLAG_META[d].label).join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        
                                        // Standard boolean checkbox
                                        const isEnabled = currentValue === true;
                                        const isComingSoon = meta.comingSoon === true;
                                        return (
                                            <label key={meta.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                                                isEnabled && !isComingSoon
                                                    ? 'bg-green-900/20 border-green-700/50' 
                                                    : isComingSoon
                                                    ? 'bg-gray-800/30 border-gray-600/50'
                                                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                            }`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    disabled={isComingSoon}
                                                    onChange={(e) => {
                                                        if (isComingSoon) return;
                                                        const newFlags = {
                                                            ...mergeFeatureFlags(formData.featureFlags),
                                                            [meta.id]: e.target.checked
                                                        };
                                                        handleInputChange('featureFlags', newFlags);
                                                    }}
                                                    className={`mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-green-400 ${isComingSoon ? 'opacity-50' : 'text-green-500'}`}
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`font-medium ${isComingSoon ? 'text-gray-400' : 'text-gray-200'}`}>{meta.label}</span>
                                                        {isComingSoon && (
                                                            <span className="px-2 py-0.5 text-xs rounded bg-orange-900/50 text-orange-300 border border-orange-700">
                                                                COMING SOON
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-0.5 text-xs rounded ${
                                                            meta.stability === 'stable' 
                                                                ? 'bg-green-900/50 text-green-300 border border-green-700'
                                                                : meta.stability === 'beta'
                                                                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                                                                : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                                        }`}>
                                                            {meta.stability.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-400">{meta.description}</p>
                                                    {isComingSoon && (
                                                        <p className="text-xs text-orange-400 mt-1">
                                                            🚧 Implementation pending Phase 7
                                                        </p>
                                                    )}
                                                    {!deps.satisfied && !isComingSoon && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            ⚠️ Requires: {deps.missingDeps.map(d => FEATURE_FLAG_META[d].label).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Workflow Category */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <span className="w-6 h-6 flex items-center justify-center bg-blue-900/50 text-blue-400 rounded text-xs">W</span>
                                    Workflow
                                </h4>
                                <div className="space-y-2 pl-8">
                                    {getFlagsByCategory('workflow').map(meta => {
                                        const currentFlags = mergeFeatureFlags(formData.featureFlags);
                                        const isEnabled = currentFlags[meta.id] === true || (typeof currentFlags[meta.id] === 'string' && currentFlags[meta.id] !== 'off');
                                        const deps = checkFlagDependencies(formData.featureFlags, meta.id);
                                        const isComingSoon = meta.comingSoon === true;
                                        
                                        return (
                                            <label key={meta.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                                                isEnabled && !isComingSoon
                                                    ? 'bg-blue-900/20 border-blue-700/50' 
                                                    : isComingSoon
                                                    ? 'bg-gray-800/30 border-gray-600/50'
                                                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                            }`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    disabled={isComingSoon}
                                                    onChange={(e) => {
                                                        if (isComingSoon) return;
                                                        const newFlags = {
                                                            ...mergeFeatureFlags(formData.featureFlags),
                                                            [meta.id]: e.target.checked
                                                        };
                                                        handleInputChange('featureFlags', newFlags);
                                                    }}
                                                    className={`mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-blue-400 ${isComingSoon ? 'opacity-50' : 'text-blue-500'}`}
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`font-medium ${isComingSoon ? 'text-gray-400' : 'text-gray-200'}`}>{meta.label}</span>
                                                        {isComingSoon && (
                                                            <span className="px-2 py-0.5 text-xs rounded bg-orange-900/50 text-orange-300 border border-orange-700">
                                                                COMING SOON
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-0.5 text-xs rounded ${
                                                            meta.stability === 'stable' 
                                                                ? 'bg-green-900/50 text-green-300 border border-green-700'
                                                                : meta.stability === 'beta'
                                                                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                                                                : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                                        }`}>
                                                            {meta.stability.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-400">{meta.description}</p>
                                                    {isComingSoon && (
                                                        <p className="text-xs text-orange-400 mt-1">
                                                            🚧 Implementation pending Phase 7
                                                        </p>
                                                    )}
                                                    {!deps.satisfied && !isComingSoon && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            ⚠️ Requires: {deps.missingDeps.map(d => FEATURE_FLAG_META[d].label).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Continuity Category */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <span className="w-6 h-6 flex items-center justify-center bg-amber-900/50 text-amber-400 rounded text-xs">C</span>
                                    Continuity
                                </h4>
                                <div className="space-y-2 pl-8">
                                    {getFlagsByCategory('continuity').map(meta => {
                                        const currentFlags = mergeFeatureFlags(formData.featureFlags);
                                        const isEnabled = currentFlags[meta.id] === true || (typeof currentFlags[meta.id] === 'string' && currentFlags[meta.id] !== 'off');
                                        const deps = checkFlagDependencies(formData.featureFlags, meta.id);
                                        const isComingSoon = meta.comingSoon === true;
                                        
                                        return (
                                            <label key={meta.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                                                isEnabled && !isComingSoon
                                                    ? 'bg-amber-900/20 border-amber-700/50' 
                                                    : isComingSoon
                                                    ? 'bg-gray-800/30 border-gray-600/50'
                                                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                            }`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    disabled={isComingSoon}
                                                    onChange={(e) => {
                                                        if (isComingSoon) return;
                                                        const newFlags = {
                                                            ...mergeFeatureFlags(formData.featureFlags),
                                                            [meta.id]: e.target.checked
                                                        };
                                                        handleInputChange('featureFlags', newFlags);
                                                    }}
                                                    className={`mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-amber-400 ${isComingSoon ? 'opacity-50' : 'text-amber-500'}`}
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`font-medium ${isComingSoon ? 'text-gray-400' : 'text-gray-200'}`}>{meta.label}</span>
                                                        {isComingSoon && (
                                                            <span className="px-2 py-0.5 text-xs rounded bg-orange-900/50 text-orange-300 border border-orange-700">
                                                                COMING SOON
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-0.5 text-xs rounded ${
                                                            meta.stability === 'stable' 
                                                                ? 'bg-green-900/50 text-green-300 border border-green-700'
                                                                : meta.stability === 'beta'
                                                                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                                                                : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                                        }`}>
                                                            {meta.stability.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-400">{meta.description}</p>
                                                    {isComingSoon && (
                                                        <p className="text-xs text-orange-400 mt-1">
                                                            🚧 Implementation pending Phase 7
                                                        </p>
                                                    )}
                                                    {!deps.satisfied && !isComingSoon && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            ⚠️ Requires: {deps.missingDeps.map(d => FEATURE_FLAG_META[d].label).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Experimental Category */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <span className="w-6 h-6 flex items-center justify-center bg-purple-900/50 text-purple-400 rounded text-xs">E</span>
                                    Experimental
                                </h4>
                                <div className="space-y-2 pl-8">
                                    {getFlagsByCategory('experimental').map(meta => {
                                        const currentFlags = mergeFeatureFlags(formData.featureFlags);
                                        const isEnabled = currentFlags[meta.id] === true || (typeof currentFlags[meta.id] === 'string' && currentFlags[meta.id] !== 'off');
                                        const deps = checkFlagDependencies(formData.featureFlags, meta.id);
                                        const isComingSoon = meta.comingSoon === true;
                                        
                                        return (
                                            <label key={meta.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
                                                isEnabled && !isComingSoon
                                                    ? 'bg-purple-900/20 border-purple-700/50' 
                                                    : isComingSoon
                                                    ? 'bg-gray-800/30 border-gray-600/50'
                                                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                            }`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    disabled={isComingSoon}
                                                    onChange={(e) => {
                                                        if (isComingSoon) return;
                                                        const newFlags = {
                                                            ...mergeFeatureFlags(formData.featureFlags),
                                                            [meta.id]: e.target.checked
                                                        };
                                                        handleInputChange('featureFlags', newFlags);
                                                    }}
                                                    className={`mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-purple-400 ${isComingSoon ? 'opacity-50' : 'text-purple-500'}`}
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`font-medium ${isComingSoon ? 'text-gray-400' : 'text-gray-200'}`}>{meta.label}</span>
                                                        {isComingSoon && (
                                                            <span className="px-2 py-0.5 text-xs rounded bg-orange-900/50 text-orange-300 border border-orange-700">
                                                                COMING SOON
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-0.5 text-xs rounded ${
                                                            meta.stability === 'stable' 
                                                                ? 'bg-green-900/50 text-green-300 border border-green-700'
                                                                : meta.stability === 'beta'
                                                                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                                                                : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                                        }`}>
                                                            {meta.stability.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-400">{meta.description}</p>
                                                    {isComingSoon && (
                                                        <p className="text-xs text-orange-400 mt-1">
                                                            🚧 Implementation pending Phase 7
                                                        </p>
                                                    )}
                                                    {!deps.satisfied && !isComingSoon && (
                                                        <p className="text-xs text-amber-400 mt-1">
                                                            ⚠️ Requires: {deps.missingDeps.map(d => FEATURE_FLAG_META[d].label).join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Temporal Coherence Enhancement Section (Phase 5) */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <span className="w-6 h-6 flex items-center justify-center bg-cyan-900/50 text-cyan-400 rounded text-xs">T</span>
                                    Temporal Coherence
                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                                        EXPERIMENTAL
                                    </span>
                                </h4>
                                <p className="text-xs text-gray-400 pl-8 -mt-1">
                                    Advanced features for improving video temporal consistency and smooth transitions.
                                </p>
                                
                                {/* Stability Profile Selector */}
                                <div className="pl-8">
                                    <div className="p-4 rounded-lg border bg-gray-800/70 border-gray-600">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm font-medium text-gray-200">
                                                Stability Profile
                                            </label>
                                            <span className="text-xs text-gray-400">
                                                {getProfileSummary(detectCurrentProfile(mergeFeatureFlags(formData.featureFlags)))}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {STABILITY_PROFILE_LIST.map((profile) => {
                                                const currentProfileId = detectCurrentProfile(mergeFeatureFlags(formData.featureFlags));
                                                const isSelected = currentProfileId === profile.id;
                                                const isDefault = profile.id === 'standard';
                                                const vramGB = profile.performance?.vramRecommendedGB ?? profile.performance?.vramMinGB ?? 8;
                                                return (
                                                    <button
                                                        key={profile.id}
                                                        type="button"
                                                        onClick={() => {
                                                            const newFlags = applyStabilityProfile(
                                                                mergeFeatureFlags(formData.featureFlags),
                                                                profile.id
                                                            );
                                                            handleInputChange('featureFlags', newFlags);
                                                        }}
                                                        className={`p-3 rounded-lg border text-center transition-all ${
                                                            isSelected
                                                                ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300'
                                                                : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-700'
                                                        }`}
                                                    >
                                                        <div className="font-medium text-sm">
                                                            {profile.label}
                                                            {isDefault && <span className="ml-1 text-amber-400">★</span>}
                                                        </div>
                                                        <div className="text-xs mt-1 opacity-70">
                                                            ~{vramGB} GB VRAM
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            {/* Custom indicator */}
                                            <button
                                                type="button"
                                                disabled
                                                className={`p-3 rounded-lg border text-center transition-all ${
                                                    detectCurrentProfile(mergeFeatureFlags(formData.featureFlags)) === 'custom'
                                                        ? 'bg-amber-900/30 border-amber-600 text-amber-300'
                                                        : 'bg-gray-800/30 border-gray-700 text-gray-500'
                                                }`}
                                            >
                                                <div className="font-medium text-sm">Custom</div>
                                                <div className="text-xs mt-1 opacity-70">
                                                    Modified
                                                </div>
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-3">
                                            {STABILITY_PROFILES[detectCurrentProfile(mergeFeatureFlags(formData.featureFlags))]?.description || 'Select a profile to apply preset temporal coherence settings.'}
                                        </p>
                                        {/* VRAM usage hint - Phase 9 */}
                                        <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
                                            <span>⚠</span>
                                            Standard/Cinematic profiles may increase VRAM usage; use Fast profile if you experience memory issues.
                                        </p>
                                        
                                        {/* Reset to Production Default - Phase 9 */}
                                        {detectCurrentProfile(mergeFeatureFlags(formData.featureFlags)) !== 'standard' && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Apply standard profile (production default)
                                                    const newFlags = applyStabilityProfile(
                                                        mergeFeatureFlags(formData.featureFlags),
                                                        'standard'
                                                    );
                                                    handleInputChange('featureFlags', newFlags);
                                                    // Also reset workflow profiles to production default
                                                    handleInputChange('videoWorkflowProfile', 'wan-fun-inpaint');
                                                    handleInputChange('sceneBookendWorkflowProfile', 'wan-fun-inpaint');
                                                }}
                                                className="mt-3 w-full px-3 py-2 text-xs font-medium rounded-lg transition-all bg-amber-800/30 border border-amber-600/50 text-amber-300 hover:bg-amber-800/50 hover:border-amber-500 flex items-center justify-center gap-2"
                                            >
                                                <span>★</span>
                                                Reset to Production Default
                                                <span className="text-amber-400/70">(wan-fun-inpaint + Standard)</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Video Deflicker */}
                                <div className="pl-8 space-y-3">
                                    <div className={`p-4 rounded-lg border transition-colors ${
                                        mergeFeatureFlags(formData.featureFlags).videoDeflicker
                                            ? 'bg-cyan-900/20 border-cyan-700/50'
                                            : 'bg-gray-800/50 border-gray-700'
                                    }`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={mergeFeatureFlags(formData.featureFlags).videoDeflicker}
                                                onChange={(e) => {
                                                    const newFlags = {
                                                        ...mergeFeatureFlags(formData.featureFlags),
                                                        videoDeflicker: e.target.checked
                                                    };
                                                    handleInputChange('featureFlags', newFlags);
                                                }}
                                                className="mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-cyan-400 text-cyan-500"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-gray-200">Video Deflicker</span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                                                        EXPERIMENTAL
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400">
                                                    Apply temporal deflicker post-processing to reduce flicker and improve video smoothness.
                                                </p>
                                            </div>
                                        </label>
                                        
                                        {/* Deflicker parameters - show when enabled */}
                                        {mergeFeatureFlags(formData.featureFlags).videoDeflicker && (
                                            <div className="mt-4 pl-7 space-y-4 border-l-2 border-cyan-700/30">
                                                <div>
                                                    <label className="block text-xs text-gray-300 mb-1">
                                                        Blend Strength: {(mergeFeatureFlags(formData.featureFlags).deflickerStrength ?? 0.35).toFixed(2)}
                                                    </label>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1"
                                                        step="0.05"
                                                        value={mergeFeatureFlags(formData.featureFlags).deflickerStrength ?? 0.35}
                                                        onChange={(e) => {
                                                            const newFlags = {
                                                                ...mergeFeatureFlags(formData.featureFlags),
                                                                deflickerStrength: parseFloat(e.target.value)
                                                            };
                                                            handleInputChange('featureFlags', newFlags);
                                                        }}
                                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Higher = smoother but may reduce sharpness</p>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-300 mb-1">
                                                        Window Size: {mergeFeatureFlags(formData.featureFlags).deflickerWindowSize ?? 3} frames
                                                    </label>
                                                    <input
                                                        type="range"
                                                        min="2"
                                                        max="7"
                                                        step="1"
                                                        value={mergeFeatureFlags(formData.featureFlags).deflickerWindowSize ?? 3}
                                                        onChange={(e) => {
                                                            const newFlags = {
                                                                ...mergeFeatureFlags(formData.featureFlags),
                                                                deflickerWindowSize: parseInt(e.target.value)
                                                            };
                                                            handleInputChange('featureFlags', newFlags);
                                                        }}
                                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Larger = smoother but higher latency</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* IP-Adapter Reference Conditioning */}
                                    <div className={`p-4 rounded-lg border transition-colors ${
                                        mergeFeatureFlags(formData.featureFlags).ipAdapterReferenceConditioning
                                            ? 'bg-cyan-900/20 border-cyan-700/50'
                                            : 'bg-gray-800/50 border-gray-700'
                                    }`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={mergeFeatureFlags(formData.featureFlags).ipAdapterReferenceConditioning}
                                                onChange={(e) => {
                                                    const newFlags = {
                                                        ...mergeFeatureFlags(formData.featureFlags),
                                                        ipAdapterReferenceConditioning: e.target.checked
                                                    };
                                                    handleInputChange('featureFlags', newFlags);
                                                }}
                                                className="mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-cyan-400 text-cyan-500"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-gray-200">IP-Adapter Reference Conditioning</span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                                                        EXPERIMENTAL
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400">
                                                    Use reference images from Visual Bible to guide video generation for style/identity stability.
                                                </p>
                                                {!mergeFeatureFlags(formData.featureFlags).characterConsistency && (
                                                    <p className="text-xs text-amber-400 mt-1">
                                                        ⚠️ Requires: Character Consistency
                                                    </p>
                                                )}
                                            </div>
                                        </label>
                                        
                                        {/* IP-Adapter weight - show when enabled */}
                                        {mergeFeatureFlags(formData.featureFlags).ipAdapterReferenceConditioning && (
                                            <div className="mt-4 pl-7 border-l-2 border-cyan-700/30">
                                                <label className="block text-xs text-gray-300 mb-1">
                                                    Reference Weight: {(mergeFeatureFlags(formData.featureFlags).ipAdapterWeight ?? 0.4).toFixed(2)}
                                                </label>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    value={mergeFeatureFlags(formData.featureFlags).ipAdapterWeight ?? 0.4}
                                                    onChange={(e) => {
                                                        const newFlags = {
                                                            ...mergeFeatureFlags(formData.featureFlags),
                                                            ipAdapterWeight: parseFloat(e.target.value)
                                                        };
                                                        handleInputChange('featureFlags', newFlags);
                                                    }}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Higher = more adherence to reference (may reduce prompt responsiveness)</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Prompt Scheduling */}
                                    <div className={`p-4 rounded-lg border transition-colors ${
                                        mergeFeatureFlags(formData.featureFlags).promptScheduling
                                            ? 'bg-cyan-900/20 border-cyan-700/50'
                                            : 'bg-gray-800/50 border-gray-700'
                                    }`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={mergeFeatureFlags(formData.featureFlags).promptScheduling}
                                                onChange={(e) => {
                                                    const newFlags = {
                                                        ...mergeFeatureFlags(formData.featureFlags),
                                                        promptScheduling: e.target.checked
                                                    };
                                                    handleInputChange('featureFlags', newFlags);
                                                }}
                                                className="mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-cyan-400 text-cyan-500"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-gray-200">Prompt Scheduling</span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                                                        EXPERIMENTAL
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400">
                                                    Enable gradual prompt blending for smooth scene transitions over multiple frames.
                                                </p>
                                            </div>
                                        </label>
                                        
                                        {/* Transition frames - show when enabled */}
                                        {mergeFeatureFlags(formData.featureFlags).promptScheduling && (
                                            <div className="mt-4 pl-7 border-l-2 border-cyan-700/30">
                                                <label className="block text-xs text-gray-300 mb-1">
                                                    Transition Duration: {mergeFeatureFlags(formData.featureFlags).promptTransitionFrames ?? 8} frames
                                                </label>
                                                <input
                                                    type="range"
                                                    min="4"
                                                    max="24"
                                                    step="2"
                                                    value={mergeFeatureFlags(formData.featureFlags).promptTransitionFrames ?? 8}
                                                    onChange={(e) => {
                                                        const newFlags = {
                                                            ...mergeFeatureFlags(formData.featureFlags),
                                                            promptTransitionFrames: parseInt(e.target.value)
                                                        };
                                                        handleInputChange('featureFlags', newFlags);
                                                    }}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">Number of frames over which to blend prompts during transitions</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Camera Path-Driven Generation (G3 Advanced Control) */}
                                    <div className={`p-4 rounded-lg border transition-colors ${
                                        mergeFeatureFlags(formData.featureFlags).cameraPathDrivenGenerationEnabled
                                            ? 'bg-indigo-900/20 border-indigo-700/50'
                                            : 'bg-gray-800/50 border-gray-700'
                                    }`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={mergeFeatureFlags(formData.featureFlags).cameraPathDrivenGenerationEnabled}
                                                onChange={(e) => {
                                                    const newFlags = {
                                                        ...mergeFeatureFlags(formData.featureFlags),
                                                        cameraPathDrivenGenerationEnabled: e.target.checked
                                                    };
                                                    handleInputChange('featureFlags', newFlags);
                                                }}
                                                className="mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-indigo-400 text-indigo-500"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-medium text-gray-200">Camera Path-Driven Generation</span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                                                        EXPERIMENTAL
                                                    </span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700">
                                                        ADVANCED
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400">
                                                    Use cameraPath from pipeline config to drive ComfyUI camera/motion nodes. 
                                                    Enables reproducible camera movements and path-based QA metrics.
                                                </p>
                                                <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
                                                    <span>⚠</span>
                                                    May increase generation time. Requires pipeline configs with cameraPath defined.
                                                </p>
                                                <a 
                                                    href="#"
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                    className="inline-block text-xs text-blue-400 hover:text-blue-300 mt-1"
                                                    title="See Documentation/Guides/PIPELINE_CONFIGS.md"
                                                >
                                                    📖 See PIPELINE_CONFIGS.md for camera path setup
                                                </a>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Adaptive Temporal Regularization (G3 Advanced Control) */}
                                    <div className={`p-4 rounded-lg border transition-colors ${
                                        mergeFeatureFlags(formData.featureFlags).temporalRegularizationAdaptiveMode
                                            ? 'bg-indigo-900/20 border-indigo-700/50'
                                            : 'bg-gray-800/50 border-gray-700'
                                    }`}>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={mergeFeatureFlags(formData.featureFlags).temporalRegularizationAdaptiveMode}
                                                disabled={!mergeFeatureFlags(formData.featureFlags).temporalRegularizationEnabled}
                                                onChange={(e) => {
                                                    const newFlags = {
                                                        ...mergeFeatureFlags(formData.featureFlags),
                                                        temporalRegularizationAdaptiveMode: e.target.checked
                                                    };
                                                    handleInputChange('featureFlags', newFlags);
                                                }}
                                                className={`mt-1 w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-indigo-400 ${
                                                    mergeFeatureFlags(formData.featureFlags).temporalRegularizationEnabled 
                                                        ? 'text-indigo-500' 
                                                        : 'text-gray-600 opacity-50'
                                                }`}
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className={`font-medium ${
                                                        mergeFeatureFlags(formData.featureFlags).temporalRegularizationEnabled 
                                                            ? 'text-gray-200' 
                                                            : 'text-gray-400'
                                                    }`}>Adaptive Temporal Regularization</span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300 border border-purple-700">
                                                        EXPERIMENTAL
                                                    </span>
                                                    <span className="px-2 py-0.5 text-xs rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700">
                                                        ADVANCED
                                                    </span>
                                                </div>
                                                <p className={`text-xs ${
                                                    mergeFeatureFlags(formData.featureFlags).temporalRegularizationEnabled 
                                                        ? 'text-gray-400' 
                                                        : 'text-gray-500'
                                                }`}>
                                                    Automatically adjust temporal regularization strength/window based on motion coherence 
                                                    metrics (path adherence, jitter, flicker). Optimizes smoothing per-shot.
                                                </p>
                                                {!mergeFeatureFlags(formData.featureFlags).temporalRegularizationEnabled && (
                                                    <p className="text-xs text-amber-400 mt-1">
                                                        ⚠️ Requires: Temporal Regularization Enabled
                                                    </p>
                                                )}
                                                {mergeFeatureFlags(formData.featureFlags).temporalRegularizationEnabled && (
                                                    <a 
                                                        href="#"
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                                        className="inline-block text-xs text-blue-400 hover:text-blue-300 mt-1"
                                                        title="See Documentation/Guides/VIDEO_QUALITY_BENCHMARK_GUIDE.md"
                                                    >
                                                        📖 See VIDEO_QUALITY_BENCHMARK_GUIDE.md for temporal metrics
                                                    </a>
                                                )}
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Reset to defaults button */}
                            <div className="pt-4 border-t border-gray-700">
                                <button
                                    onClick={() => handleInputChange('featureFlags', { ...DEFAULT_FEATURE_FLAGS })}
                                    className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                                >
                                    Reset all features to defaults
                                </button>
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
