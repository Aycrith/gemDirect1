export interface LLMScenePayload {
    title: string;
    summary: string;
    prompt: string;
    negativePrompt?: string;
    mood?: string;
    cameraMovement?: string;
    palette?: string;
    expectedFrames?: number;
}

export interface LLMStoryRequest {
    sceneCount: number;
    seed?: string;
}

export interface LLMStoryResponse {
    storyId: string;
    logline: string;
    directorsVision: string;
    scenes: LLMScenePayload[];
    generator?: string;
    metadata?: Record<string, unknown>;
}

export interface LLMProviderMetadata {
    enabled: boolean;
    providerUrl?: string;
    seed?: string;
    status: 'skipped' | 'success' | 'error';
    scenesRequested: number;
    scenesReceived?: number;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    error?: string;
}
