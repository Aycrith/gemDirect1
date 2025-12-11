/// <reference types="vite/client" />
import { LocalGenerationSettings, WorkflowProfile, WorkflowProfileMetadata, MediaGenerationProvider, PlanExpansionStrategy } from '../types';

// --- LocalGenerationSettingsContext Constants ---

export const WORKFLOW_PROFILE_DEFINITIONS: Array<{ id: string; label: string }> = [
    { id: 'flux-t2i', label: 'FLUX Text→Image (Keyframe)' },
    { id: 'wan-t2i', label: 'WAN Text→Image (Keyframe)' },
    { id: 'wan-i2v', label: 'WAN Text+Image→Video' },
    { id: 'wan-flf2v', label: 'WAN First/Last Frame→Video' },
    { id: 'wan-fun-inpaint', label: 'WAN Fun Inpainting' },
    { id: 'wan-fun-control', label: 'WAN Fun ControlNet' },
    { id: 'wan-flf2v-feta', label: 'WAN First/Last Frame→Video + FETA' },
    { id: 'wan-ipadapter', label: 'WAN IPAdapter' },
    { id: 'video-upscaler', label: 'Video Upscaler' },
];
export const PRIMARY_WORKFLOW_PROFILE_ID = 'wan-i2v';

export const createDefaultProfileMetadata = (): WorkflowProfileMetadata => ({
    lastSyncedAt: Date.now(),
    highlightMappings: [],
    missingMappings: [],
    warnings: [],
});

export const createDefaultWorkflowProfiles = (): Record<string, WorkflowProfile> =>
    WORKFLOW_PROFILE_DEFINITIONS.reduce((acc, def) => {
        acc[def.id] = {
            id: def.id,
            label: def.label,
            workflowJson: '',
            mapping: {},
            metadata: createDefaultProfileMetadata(),
        };
        return acc;
    }, {} as Record<string, WorkflowProfile>);

export const normalizeWorkflowProfiles = (settings: LocalGenerationSettings): Record<string, WorkflowProfile> => {
    const source = settings.workflowProfiles ?? {};
    const primaryJson = source[PRIMARY_WORKFLOW_PROFILE_ID]?.workflowJson ?? settings.workflowJson ?? '';
    const primaryMapping = source[PRIMARY_WORKFLOW_PROFILE_ID]?.mapping ?? (settings.mapping ?? {});
    const primaryMetadata = source[PRIMARY_WORKFLOW_PROFILE_ID]?.metadata;

    return WORKFLOW_PROFILE_DEFINITIONS.reduce((acc, def) => {
        const previous = source[def.id];
        acc[def.id] = {
            id: def.id,
            label: def.label,
            workflowJson:
                previous?.workflowJson ??
                (def.id === PRIMARY_WORKFLOW_PROFILE_ID ? primaryJson : ''),
            mapping:
                previous?.mapping ??
                (def.id === PRIMARY_WORKFLOW_PROFILE_ID ? primaryMapping : {}),
            metadata:
                previous?.metadata ??
                (def.id === PRIMARY_WORKFLOW_PROFILE_ID
                    ? primaryMetadata ?? createDefaultProfileMetadata()
                    : createDefaultProfileMetadata()),
        };
        return acc;
    }, {} as Record<string, WorkflowProfile>);
};

export const DEFAULT_LOCAL_GENERATION_SETTINGS: LocalGenerationSettings = {
    comfyUIUrl: 'http://127.0.0.1:8188',
    comfyUIClientId: typeof crypto !== 'undefined' ? crypto.randomUUID() : '',
    comfyUIWebSocketUrl: 'ws://127.0.0.1:8188/ws',
    workflowJson: '',
    mapping: {},
    workflowProfiles: createDefaultWorkflowProfiles(),
    llmProviderUrl: 'http://192.168.50.192:1234/v1/chat/completions',
    llmModel: 'qwen/qwen3-14b',
    llmTemperature: 0.35,
    llmTimeoutMs: 120000,
    llmRequestFormat: 'openai-chat',
    useMockLLM: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USE_MOCK_LLM === 'true') || false,
    // Vision LLM settings (separate model for image/video analysis)
    visionLLMProviderUrl: 'http://192.168.50.192:1234/v1/chat/completions',
    visionLLMModel: 'qwen/qwen3-vl-8b',
    visionLLMTemperature: 0.3,
    visionLLMTimeoutMs: 300000, // 5 minutes for vision analysis
    useUnifiedVisionModel: false, // Use separate vision model by default
    keyframeMode: 'single', // Explicit default for keyframe generation mode
};

// --- MediaGenerationProviderContext Constants ---

export const DEFAULT_MEDIA_PROVIDERS: MediaGenerationProvider[] = [
    {
        id: 'comfyui-local',
        label: 'Local ComfyUI (Default)',
        description: 'Leverage the configured ComfyUI server for local renders.',
        isAvailable: true,
        isDefault: true,
        capabilities: { images: true, video: true },
    },
    {
        id: 'gemini-image',
        label: 'Gemini Image (Fallback)',
        description: 'Use Google Gemini Flash Image for remote keyframes and concept art.',
        isAvailable: true,
        capabilities: { images: true, video: false },
    },
    {
        id: 'flux-pro',
        label: 'Flux Pro',
        description: 'Third-party diffusion model integration (coming soon).',
        isAvailable: false,
        disabledReason: 'Pending API integration work.',
        capabilities: { images: true, video: false },
    },
];

export const FALLBACK_MEDIA_PROVIDER = DEFAULT_MEDIA_PROVIDERS.find(provider => provider.isDefault && provider.isAvailable)
    ?? DEFAULT_MEDIA_PROVIDERS.find(provider => provider.isAvailable)
    ?? DEFAULT_MEDIA_PROVIDERS[0];

export const MEDIA_PROVIDER_STORAGE_KEY = 'mediaGeneration.provider.selected';

// --- PlanExpansionStrategyContext Constants ---

const getEnv = (key: string) => (import.meta as any).env?.[key] ?? (typeof process !== 'undefined' ? process.env[key] : undefined);

const PREFER_LOCAL_LLM = Boolean(getEnv('VITE_LOCAL_STORY_PROVIDER_URL'));

const LOCAL_STRATEGY: PlanExpansionStrategy = {
    id: 'local-drafter',
    label: 'Local Drafter (LM Studio)',
    description: 'Use your local LM Studio instance for story generation and refinement.',
    isAvailable: true,
    isDefault: PREFER_LOCAL_LLM,
};

const GEMINI_STRATEGY: PlanExpansionStrategy = {
    id: 'gemini-plan',
    label: 'Gemini (Default)',
    description: 'Use Gemini models for story planning and outline expansion.',
    isAvailable: true,
    isDefault: !PREFER_LOCAL_LLM,
};

export const DEFAULT_PLAN_STRATEGIES: PlanExpansionStrategy[] = PREFER_LOCAL_LLM
    ? [LOCAL_STRATEGY, GEMINI_STRATEGY]
    : [GEMINI_STRATEGY, LOCAL_STRATEGY];

export const FALLBACK_PLAN_STRATEGY = DEFAULT_PLAN_STRATEGIES.find(strategy => strategy.isDefault && strategy.isAvailable)
    ?? DEFAULT_PLAN_STRATEGIES.find(strategy => strategy.isAvailable)
    ?? DEFAULT_PLAN_STRATEGIES[0];

export const PLAN_STRATEGY_STORAGE_KEY = 'planExpansion.strategy.selected';
