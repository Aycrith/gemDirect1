import React, { useState, useEffect, useRef } from 'react';
import {
    LocalGenerationSettings,
    WorkflowInput,
    MappableData,
    WorkflowMapping,
    ToastMessage,
    WorkflowProfile,
    WorkflowProfileMetadata,
    WorkflowProfileMappingHighlight
} from '../types';
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

const HIGHLIGHT_TYPES: MappableData[] = ['human_readable_prompt', 'full_timeline_json', 'keyframe_image'];
const TEXT_MAPPING_TYPES: MappableData[] = ['human_readable_prompt', 'full_timeline_json'];
const KEYFRAME_MAPPING_TYPE: MappableData = 'keyframe_image';

const getPromptPayload = (workflowJson: string): Record<string, any> | null => {
    if (!workflowJson) return null;
    try {
        const parsed = JSON.parse(workflowJson);
        return parsed.prompt ?? parsed;
    } catch {
        return null;
    }
};

const hasTextMapping = (mapping: WorkflowMapping): boolean =>
    Object.values(mapping).some(value => TEXT_MAPPING_TYPES.includes(value));

const hasKeyframeMapping = (mapping: WorkflowMapping): boolean =>
    Object.values(mapping).includes(KEYFRAME_MAPPING_TYPE);

const METADATA_STALE_THRESHOLD_MS = 1000 * 60 * 60; // 60 minutes
const STALE_METADATA_WARNING =
    'Workflow metadata is stale. Run the helper, refresh mappings, and save settings before queuing work.';

const buildProfileMetadata = (
    workflowJson: string,
    mapping: WorkflowMapping,
    previous: WorkflowProfileMetadata | undefined,
    profileId: string,
    options?: { overrideLastSyncedAt?: number }
): WorkflowProfileMetadata => {
    const highlightMappings: WorkflowProfileMappingHighlight[] = [];
    const missingMappings: MappableData[] = [];
    const warnings: string[] = [];

    const prompt = getPromptPayload(workflowJson);
    if (!prompt && workflowJson) {
        warnings.push('Failed to parse workflow JSON; highlight data is unavailable.');
    }

    HIGHLIGHT_TYPES.forEach(type => {
        const entry = Object.entries(mapping).find(([, dataType]) => dataType === type);
        if (!entry) return;
        const [key] = entry;
        const [nodeId, inputName] = key.split(':');
        const node = prompt?.[nodeId];
        const nodeTitle = node?._meta?.title || node?.label || `Node ${nodeId}`;
        highlightMappings.push({
            type,
            nodeId,
            inputName: inputName ?? '',
            nodeTitle,
        });
    });

    if (!hasTextMapping(mapping)) {
        // Mark text mappings as missing when neither human_readable_prompt nor
        // full_timeline_json has been mapped. validateProfileMappings() will
        // treat either as sufficient.
        missingMappings.push('human_readable_prompt');
    }
    // Only require keyframe_image mapping for image-to-video workflows (wan-i2v).
    // The wan-t2i profile is text-to-image and produces keyframes instead of consuming them,
    // so keyframe_image is optional there.
    if (profileId === 'wan-i2v' && !hasKeyframeMapping(mapping)) {
        missingMappings.push('keyframe_image');
    }

    const lastSyncedAt = options?.overrideLastSyncedAt ?? previous?.lastSyncedAt ?? Date.now();
    if (lastSyncedAt && Date.now() - lastSyncedAt > METADATA_STALE_THRESHOLD_MS) {
        warnings.push(STALE_METADATA_WARNING);
    }

    return {
        lastSyncedAt,
        highlightMappings,
        missingMappings,
        warnings,
    };
};

const getHighlightLabel = (type: MappableData): string => {
    switch (type) {
        case 'human_readable_prompt':
            return 'Human-Readable Prompt';
        case 'full_timeline_json':
            return 'Full Timeline JSON';
        case 'keyframe_image':
            return 'Keyframe Image';
        default:
            return type;
    }
};

const getMissingDescription = (type: MappableData): string => {
    if (type === 'human_readable_prompt') {
        return 'CLIP text input (Human-Readable Prompt / Full Timeline JSON)';
    }
    if (type === 'keyframe_image') {
        return 'LoadImage keyframe input';
    }
    return type;
};

type WorkflowProfileDefinition = {
    id: string;
    label: string;
    description: string;
    bundlePath: string;
};

const WORKFLOW_PROFILE_DEFINITIONS: WorkflowProfileDefinition[] = [
    {
        id: 'wan-t2i',
        label: 'WAN Text→Image (Keyframe)',
        description: 'Scene keyframe workflow (image_netayume_lumina_t2i.json).',
        bundlePath: '../workflows/image_netayume_lumina_t2i.json',
    },
    {
        id: 'wan-i2v',
        label: 'WAN Text+Image→Video',
        description: 'Video workflow (video_wan2_2_14B_i2v-modified.json).',
        bundlePath: '../workflows/video_wan2_2_14B_i2v-modified.json',
    },
];

const PRIMARY_PROFILE_ID = 'wan-i2v';

type WorkflowProfileState = {
    workflowJson: string;
    mapping: WorkflowMapping;
    metadata: WorkflowProfileMetadata;
};

const buildProfileRecords = (settings: LocalGenerationSettings): Record<string, WorkflowProfileState> => {
    const storedProfiles = settings.workflowProfiles ?? {};
    return WORKFLOW_PROFILE_DEFINITIONS.reduce((acc, profile) => {
        const stored = storedProfiles[profile.id];
        const workflowJson = stored?.workflowJson ?? (profile.id === PRIMARY_PROFILE_ID ? settings.workflowJson : '');
        const mapping = stored?.mapping ?? (profile.id === PRIMARY_PROFILE_ID ? settings.mapping : {});
        acc[profile.id] = {
            workflowJson,
            mapping,
            metadata: buildProfileMetadata(workflowJson, mapping, stored?.metadata, profile.id),
        };
        return acc;
    }, {} as Record<string, WorkflowProfileState>);
};

const buildProfileInputs = (profiles: Record<string, WorkflowProfileState>) => {
    const inputs: Record<string, WorkflowInput[]> = {};
    Object.entries(profiles).forEach(([profileId, profile]) => {
        inputs[profileId] = profile.workflowJson ? parseWorkflowForInputs(profile.workflowJson) : [];
    });
    return inputs;
};

const LocalGenerationSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave, addToast }) => {
    const [localSettings, setLocalSettings] = useState<LocalGenerationSettings>(settings);
    const [profiles, setProfiles] = useState<Record<string, WorkflowProfileState>>(() => buildProfileRecords(settings));
    const [profileInputs, setProfileInputs] = useState<Record<string, WorkflowInput[]>>(() => buildProfileInputs(buildProfileRecords(settings)));
    const [discoveryStatus, setDiscoveryStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');
    const [isSyncing, setIsSyncing] = useState(false);
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    
    // Provider contexts
    const { strategies, activeStrategy, activeStrategyId, selectStrategy } = usePlanExpansionStrategy();
    const { providers, activeProvider, activeProviderId, selectProvider } = useMediaGenerationProvider();
    const planActions = usePlanExpansionActions();
    const { updateApiStatus } = useApiStatus();
    const { logApiCall } = useUsage();

    useEffect(() => {
        setLocalSettings(settings);
        const records = buildProfileRecords(settings);
        setProfiles(records);
        setProfileInputs(buildProfileInputs(records));
        setDiscoveryStatus('idle');
    }, [settings, isOpen]);
    
    const updateProfile = (profileId: string, updater: (current: WorkflowProfileState) => WorkflowProfileState) => {
        setProfiles(prev => {
            const current =
                prev[profileId] ?? {
                    workflowJson: '',
                    mapping: {},
                    metadata: buildProfileMetadata('', {}, undefined, profileId),
                };
            const updated = updater(current);
            const next = {
                ...prev,
                [profileId]: {
                    ...updated,
                    metadata: buildProfileMetadata(updated.workflowJson, updated.mapping, current.metadata, profileId),
                },
            };
            if (profileId === PRIMARY_PROFILE_ID) {
                setLocalSettings(prevSettings => ({
                    ...prevSettings,
                    workflowJson: updated.workflowJson,
                    mapping: updated.mapping,
                }));
            }
            return next;
        });
    };

    const applyWorkflowJson = (profileId: string, workflowJson: string) => {
        setProfileInputs(prev => ({
            ...prev,
            [profileId]: workflowJson ? parseWorkflowForInputs(workflowJson) : [],
        }));
        updateProfile(profileId, (current) => ({ ...current, workflowJson }));
    };

    const applyMapping = (profileId: string, mapping: WorkflowMapping) => {
        updateProfile(profileId, (current) => ({ ...current, mapping }));
    };


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
    
    const handleSyncWorkflow = async (profileId: string) => {
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

            applyWorkflowJson(profileId, workflowJson);
            addToast('Workflow synced successfully from ComfyUI history! Please review your mappings.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Sync failed: ${message}. Try running a workflow in ComfyUI first, or paste your workflow JSON manually below.`, 'error');
        } finally {
            setIsSyncing(false);
        }
    };


    const handleLoadBundledWorkflow = async (profileId: string, bundlePath: string) => {
        try {
            const bundledUrl = new URL(bundlePath, import.meta.url);
            const response = await fetch(bundledUrl);
            if (!response.ok) {
                throw new Error(`Failed to load bundled workflow (status ${response.status}).`);
            }
            const workflowJson = await response.text();
            applyWorkflowJson(profileId, workflowJson);
            addToast('Bundled workflow loaded. Review mappings below.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unexpected error loading bundled workflow.';
            addToast(message, 'error');
        }
    };

    const handleWorkflowFileSelected = (profileId: string) => async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        try {
            const text = await file.text();
            applyWorkflowJson(profileId, text);
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

    const handleAutoMapCurrentWorkflow = async (profileId: string) => {
        const targetProfile = profiles[profileId];
        if (!targetProfile?.workflowJson || !targetProfile.workflowJson.trim()) {
            addToast('Please load or paste a workflow JSON first.', 'error');
            return;
        }
        try {
            updateApiStatus('loading', 'Analyzing workflow locally...');
            const mapping: WorkflowMapping = await planActions.generateWorkflowMapping(
                targetProfile.workflowJson,
                logApiCall,
                updateApiStatus
            );
            applyMapping(profileId, mapping);
            addToast('Workflow inputs mapped automatically.', 'success');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to analyze workflow mapping.';
            addToast(message, 'error');
        } finally {
            updateApiStatus('idle', '');
        }
    };

    const handleUploadWorkflowClick = (profileId: string) => {
        fileInputRefs.current[profileId]?.click();
    };

    const handleMappingChange = (profileId: string, key: string, value: MappableData) => {
        updateProfile(profileId, (current) => ({
            ...current,
            mapping: { ...current.mapping, [key]: value }
        }));
    };

    const validateProfileMappings = (): boolean => {
        for (const profileDef of WORKFLOW_PROFILE_DEFINITIONS) {
            const profileState = profiles[profileDef.id];
            const missing = profileState?.metadata?.missingMappings ?? [];
            if (missing.length === 0) {
                continue;
            }

            // For the wan-t2i (text->image) profile we only enforce text mappings;
            // keyframe_image is only required for wan-i2v (image->video).
            const requiresKeyframe = profileDef.id === 'wan-i2v';
            const hasMissingText = missing.includes('human_readable_prompt') || missing.includes('full_timeline_json');
            const hasMissingKeyframe = missing.includes('keyframe_image');

            if (hasMissingText || (requiresKeyframe && hasMissingKeyframe)) {
                const friendly = getMissingDescription(hasMissingText ? 'human_readable_prompt' : 'keyframe_image');
                addToast(`The ${profileDef.label} workflow requires ${friendly} before saving.`, 'error');
                return false;
            }
        }
        return true;
    };

    const handleSave = () => {
        if (!validateProfileMappings()) return;

        const profilePayload: Record<string, WorkflowProfile> = WORKFLOW_PROFILE_DEFINITIONS.reduce((acc, profileDef) => {
            const state = profiles[profileDef.id];
            const metadataSnapshot = {
                ...(state?.metadata ?? {}),
                lastSyncedAt: Date.now(),
            };
            acc[profileDef.id] = {
                id: profileDef.id,
                label: profileDef.label,
                workflowJson: state?.workflowJson ?? '',
                mapping: state?.mapping ?? {},
                metadata: metadataSnapshot,
            };
            return acc;
        }, {} as Record<string, WorkflowProfile>);

        const primaryProfile = profiles[PRIMARY_PROFILE_ID];
        const updatedSettings: LocalGenerationSettings = {
            ...localSettings,
            workflowProfiles: profilePayload,
            workflowJson: primaryProfile?.workflowJson ?? localSettings.workflowJson,
            mapping: primaryProfile?.mapping ?? localSettings.mapping,
        };
        console.log('[LocalGenerationSettingsModal] handleSave called with localSettings:', JSON.stringify(updatedSettings, null, 2));
        onSave(updatedSettings);
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
                        <div>
                            <label htmlFor="model-id" className="text-sm font-medium text-gray-300">Video Model</label>
                            <select id="model-id" value={localSettings.modelId || 'comfy-svd'} onChange={e => setLocalSettings(p => ({...p, modelId: e.target.value}))} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md p-2 text-sm">
                                <option value="comfy-svd">Stable Video Diffusion (SVD)</option>
                                <option value="wan-video">WAN Video (experimental)</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Choose the video generation model. WAN is experimental and may require specific workflows.</p>
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
                        <div className="space-y-5">
                            {WORKFLOW_PROFILE_DEFINITIONS.map(profile => {
                                const inputs = profileInputs[profile.id] ?? [];
                                const mapping = profiles[profile.id]?.mapping ?? {};
                                const metadata = profiles[profile.id]?.metadata;
                                const highlightEntries = metadata?.highlightMappings ?? [];
                                const missingMappings = metadata?.missingMappings ?? [];
                                const metadataWarnings = metadata?.warnings ?? [];
                                return (
                                    <section key={profile.id} className="p-4 bg-gray-900/60 border border-gray-700 rounded-lg space-y-3">
                                        <input
                                            ref={(el) => { fileInputRefs.current[profile.id] = el; }}
                                            type="file"
                                            accept="application/json"
                                            className="hidden"
                                            onChange={handleWorkflowFileSelected(profile.id)}
                                        />
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                            <div>
                                                <h5 className="text-lg font-semibold text-gray-100">{profile.label}</h5>
                                                <p className="text-xs text-gray-400">{profile.description}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => handleLoadBundledWorkflow(profile.id, profile.bundlePath)}
                                                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600/80 text-white hover:bg-indigo-600 transition"
                                                >
                                                    Load WAN Workflow
                                                </button>
                                                <button
                                                    onClick={() => handleUploadWorkflowClick(profile.id)}
                                                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 transition"
                                                >
                                                    Import JSON
                                                </button>
                                                <button
                                                    onClick={() => handleAutoMapCurrentWorkflow(profile.id)}
                                                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600/80 text-white hover:bg-emerald-500 transition"
                                                >
                                                    Auto-map
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-gray-400">
                                            <span>{inputs.length} inputs detected</span>
                                            <button
                                                onClick={() => handleSyncWorkflow(profile.id)}
                                                disabled={isSyncing}
                                                className="inline-flex items-center justify-center gap-1 px-3 py-1 text-[11px] font-semibold rounded-full border border-gray-600 text-gray-200 hover:border-gray-400 disabled:opacity-60"
                                            >
                                                <RefreshCwIcon className="w-3 h-3" />
                                                {isSyncing ? 'Syncing...' : 'Re-sync from Comfy'}
                                            </button>
                                        </div>
                                        {metadata?.lastSyncedAt && (
                                            <p className="text-[11px] text-gray-400">
                                                Last validated: {new Date(metadata.lastSyncedAt).toLocaleString()}
                                            </p>
                                        )}
                                        {inputs.length > 0 ? (
                                            <div className="space-y-2 pt-2 border-t border-gray-700">
                                                {inputs.map(input => {
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
                                                            <select value={mapping[key] || 'none'} onChange={e => handleMappingChange(profile.id, key, e.target.value as MappableData)} className="bg-gray-700 border border-gray-600 rounded-md p-1.5 text-xs">
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
                                                    );
                                                })}
                                                {highlightEntries.length > 0 && (
                                                    <div className="space-y-1 text-xs text-gray-300">
                                                        <p className="text-xs font-semibold text-gray-200">Detected mappings</p>
                                                        <div className="space-y-0.5">
                                                            {highlightEntries.map(entry => (
                                                                <Tooltip key={`${profile.id}-${entry.type}`} text={`${entry.nodeTitle} (${entry.nodeId}:${entry.inputName})`}>
                                                                    <p className="flex flex-wrap items-center gap-1 text-emerald-300">
                                                                        <span className="font-semibold">{getHighlightLabel(entry.type)}</span>
                                                                        <span className="text-gray-400">→ {entry.nodeId}:{entry.inputName}</span>
                                                                    </p>
                                                                </Tooltip>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {missingMappings.length > 0 && (
                                                    <div className="text-xs text-amber-300 space-y-1">
                                                        {missingMappings.map(type => (
                                                            <p key={`${profile.id}-${type}`}>
                                                                Missing {getMissingDescription(type)} for the {profile.label} workflow.
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                                {metadataWarnings.length > 0 && (
                                                    <div className="text-xs text-yellow-300 space-y-1">
                                                        {metadataWarnings.map((warning, index) => (
                                                            <p key={`warn-${profile.id}-${index}`}>{warning}</p>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-500 italic">Load a workflow to preview and map its inputs.</p>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
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
