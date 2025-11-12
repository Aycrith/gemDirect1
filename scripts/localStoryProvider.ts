import { type LLMStoryRequest, type LLMStoryResponse } from './types/storyTypes';

const DEFAULT_TIMEOUT_MS = 8000;

interface FetchOptions {
    timeoutMs?: number;
}

export const fetchLocalStory = async (
    url: string,
    request: LLMStoryRequest,
    options: FetchOptions = {},
): Promise<LLMStoryResponse> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`LLM service responded with ${response.status}: ${text}`);
        }

        const payload: unknown = await response.json();
        return payload as LLMStoryResponse;
    } finally {
        clearTimeout(timeout);
    }
};
