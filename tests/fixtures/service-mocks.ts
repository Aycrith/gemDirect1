/**
 * Service Mocking Utilities for E2E Tests
 * 
 * Provides mock responses for external services (LLM, ComfyUI) so that
 * E2E tests can run without requiring real service instances.
 * 
 * Usage:
 *   import { setupLLMRoutes, setupComfyUIRoutes } from '../fixtures/service-mocks';
 *   
 *   test.beforeEach(async ({ page }) => {
 *     await setupLLMRoutes(page);
 *     await setupComfyUIRoutes(page);
 *   });
 */

import { Page, Route, Request } from '@playwright/test';
import { mockStoryBible, mockScenes } from './mock-data';

// =========================================================================
// LLM Mock Responses
// =========================================================================

/**
 * Mock OpenAI-compatible chat completion response
 */
export const createChatCompletionResponse = (content: string, finishReason: string = 'stop') => ({
  id: `chatcmpl-mock-${Date.now()}`,
  object: 'chat.completion',
  created: Math.floor(Date.now() / 1000),
  model: 'mistral-7b-instruct',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content
      },
      finish_reason: finishReason
    }
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150
  }
});

/**
 * Mock story bible generation response
 */
export const mockStoryBibleResponse = createChatCompletionResponse(
  JSON.stringify({
    logline: mockStoryBible.logline,
    characters: mockStoryBible.characters,
    setting: mockStoryBible.setting,
    plotOutline: mockStoryBible.plotOutline
  })
);

/**
 * Mock scene generation response
 */
export const mockSceneGenerationResponse = createChatCompletionResponse(
  JSON.stringify({
    scenes: mockScenes.map(s => ({
      title: s.title,
      summary: s.summary
    }))
  })
);

/**
 * Mock director's vision response
 */
export const mockDirectorsVisionResponse = createChatCompletionResponse(
  `Cinematic noir with cyberpunk influence. Blade Runner meets Mr. Robot aesthetic.
Rain and neon throughout. Close-ups on faces and screens.
Color palette: blues, whites, neon pinks.`
);

/**
 * Mock shot timeline generation response
 */
export const mockTimelineResponse = createChatCompletionResponse(
  JSON.stringify({
    shots: [
      { id: 'shot-1', description: 'Wide establishing shot', duration: 3, cameraAngle: 'wide', movement: 'static' },
      { id: 'shot-2', description: 'Medium shot of protagonist', duration: 4, cameraAngle: 'medium', movement: 'pan' },
      { id: 'shot-3', description: 'Close-up reaction shot', duration: 2, cameraAngle: 'close-up', movement: 'static' }
    ]
  })
);

// =========================================================================
// ComfyUI Mock Responses
// =========================================================================

/**
 * Mock ComfyUI system stats response
 */
export const mockSystemStats = {
  system: {
    os: 'nt',
    python_version: '3.10.0',
    comfyui_version: 'v0.2.7',
    pytorch_version: '2.1.0+cu121',
    embedded_python: false
  },
  devices: [
    {
      name: 'NVIDIA GeForce RTX 4090',
      type: 'cuda',
      index: 0,
      vram_total: 25769803776,
      vram_free: 20000000000,
      torch_vram_total: 25769803776,
      torch_vram_free: 20000000000
    }
  ]
};

/**
 * Mock ComfyUI queue state (empty)
 */
export const mockQueueEmpty = {
  queue_running: [],
  queue_pending: []
};

/**
 * Mock ComfyUI queue state (running)
 */
export const mockQueueRunning = {
  queue_running: [['prompt-123', 0, { client_id: 'test-client' }]],
  queue_pending: []
};

/**
 * Mock ComfyUI history entry
 */
export const createMockHistoryEntry = (promptId: string, status: 'success' | 'error' = 'success') => ({
  [promptId]: {
    prompt: [0, promptId, { client_id: 'test-client' }, {}],
    outputs: status === 'success' ? {
      '9': { // SaveImage node
        images: [{ filename: `output_${promptId}.png`, subfolder: '', type: 'output' }]
      },
      '12': { // VHS_VideoCombine node  
        gifs: [{ filename: `output_${promptId}.mp4`, subfolder: '', type: 'output' }]
      }
    } : {},
    status: { 
      status_str: status === 'success' ? 'success' : 'error',
      completed: status === 'success'
    }
  }
});

/**
 * Mock ComfyUI prompt submission response
 */
export const createPromptResponse = (promptId: string = `prompt-${Date.now()}`) => ({
  prompt_id: promptId,
  number: 1,
  node_errors: {}
});

// =========================================================================
// Route Setup Functions
// =========================================================================

/**
 * Setup mock routes for LLM API (OpenAI-compatible)
 * Uses the Vite proxy path /api/local-llm which proxies to LM Studio
 */
export async function setupLLMRoutes(page: Page, options?: {
  baseUrl?: string;
  customResponses?: Record<string, unknown>;
}) {
  // Mock the Vite proxy path used by the app
  await page.route('**/api/local-llm', async (route: Route, request: Request) => {
    const body = request.postDataJSON() as { messages?: Array<{ content: string }> };
    const prompt = body?.messages?.map(m => m.content).join(' ') || '';
    
    let response: unknown;
    
    // Determine response based on prompt content
    if (prompt.includes('story bible') || prompt.includes('logline')) {
      response = mockStoryBibleResponse;
    } else if (prompt.includes('scene') && prompt.includes('generate')) {
      response = mockSceneGenerationResponse;
    } else if (prompt.includes('director') || prompt.includes('vision')) {
      response = mockDirectorsVisionResponse;
    } else if (prompt.includes('shot') || prompt.includes('timeline')) {
      response = mockTimelineResponse;
    } else {
      // Generic response
      response = createChatCompletionResponse('Generated content based on your request.');
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
  
  // Also mock direct LM Studio URL in case app uses it directly
  const baseUrl = options?.baseUrl || 'http://192.168.50.192:1234';
  await page.route(`${baseUrl}/v1/chat/completions`, async (route: Route, request: Request) => {
    const body = request.postDataJSON() as { messages?: Array<{ content: string }> };
    const prompt = body?.messages?.map(m => m.content).join(' ') || '';
    
    let response: unknown;
    
    if (prompt.includes('story bible') || prompt.includes('logline')) {
      response = mockStoryBibleResponse;
    } else if (prompt.includes('scene') && prompt.includes('generate')) {
      response = mockSceneGenerationResponse;
    } else if (prompt.includes('director') || prompt.includes('vision')) {
      response = mockDirectorsVisionResponse;
    } else if (prompt.includes('shot') || prompt.includes('timeline')) {
      response = mockTimelineResponse;
    } else {
      response = createChatCompletionResponse('Generated content based on your request.');
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
  
  // Mock /v1/models endpoint (both proxy and direct)
  await page.route('**/api/local-llm-models', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'list',
        data: [
          { id: 'mistral-7b-instruct', object: 'model', owned_by: 'local' }
        ]
      })
    });
  });
  
  await page.route(`${baseUrl}/v1/models`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'list',
        data: [
          { id: 'mistral-7b-instruct', object: 'model', owned_by: 'local' }
        ]
      })
    });
  });
  
  console.log(`✅ LLM routes mocked for /api/local-llm and ${baseUrl}`);
}

/**
 * Setup mock routes for ComfyUI API
 */
export async function setupComfyUIRoutes(page: Page, options?: {
  baseUrl?: string;
  autoComplete?: boolean;
  completionDelay?: number;
}) {
  const baseUrl = options?.baseUrl || 'http://127.0.0.1:8188';
  const autoComplete = options?.autoComplete ?? true;
  const completionDelay = options?.completionDelay ?? 1000;
  
  // Track submitted prompts for history lookup
  const submittedPrompts: string[] = [];
  
  // Mock /system_stats
  await page.route(`${baseUrl}/system_stats`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSystemStats)
    });
  });
  
  // Mock /queue
  await page.route(`${baseUrl}/queue`, async (route: Route) => {
    const hasRunning = submittedPrompts.length > 0 && !autoComplete;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(hasRunning ? mockQueueRunning : mockQueueEmpty)
    });
  });
  
  // Mock /prompt (submission)
  await page.route(`${baseUrl}/prompt`, async (route: Route) => {
    const promptId = `prompt-${Date.now()}`;
    submittedPrompts.push(promptId);
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createPromptResponse(promptId))
    });
    
    // Auto-complete after delay
    if (autoComplete) {
      setTimeout(() => {
        const idx = submittedPrompts.indexOf(promptId);
        if (idx > -1) submittedPrompts.splice(idx, 1);
      }, completionDelay);
    }
  });
  
  // Mock /history/{prompt_id}
  await page.route(`${baseUrl}/history/**`, async (route: Route) => {
    const url = route.request().url();
    const promptId = url.split('/history/')[1]?.split('?')[0];
    
    if (promptId && !submittedPrompts.includes(promptId)) {
      // Prompt completed
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockHistoryEntry(promptId, 'success'))
      });
    } else {
      // Still running
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({})
      });
    }
  });
  
  // Mock /view (image/video fetch)
  await page.route(`${baseUrl}/view**`, async (route: Route) => {
    const url = route.request().url();
    
    if (url.includes('.mp4')) {
      // Return mock video (tiny valid mp4)
      await route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAA==', 'base64')
      });
    } else {
      // Return mock image (1x1 transparent PNG)
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
      });
    }
  });
  
  // Mock /upload/image
  await page.route(`${baseUrl}/upload/image`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'uploaded_image.png', subfolder: 'input', type: 'input' })
    });
  });
  
  // Mock /object_info (workflow nodes)
  await page.route(`${baseUrl}/object_info`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        CLIPTextEncode: { input: { required: { text: ['STRING'], clip: ['CLIP'] } } },
        LoadImage: { input: { required: { image: ['STRING'] } } },
        SaveImage: { input: { required: { images: ['IMAGE'] } } }
      })
    });
  });
  
  console.log(`✅ ComfyUI routes mocked for ${baseUrl}`);
}

/**
 * Setup all service mocks (convenience function)
 */
export async function setupAllServiceMocks(page: Page, options?: {
  llmBaseUrl?: string;
  comfyUIBaseUrl?: string;
  comfyUIAutoComplete?: boolean;
}) {
  await setupLLMRoutes(page, { baseUrl: options?.llmBaseUrl });
  await setupComfyUIRoutes(page, { 
    baseUrl: options?.comfyUIBaseUrl,
    autoComplete: options?.comfyUIAutoComplete 
  });
}

/**
 * Create WebSocket mock for ComfyUI progress events
 * Note: Playwright doesn't mock WebSockets directly, so this is for reference
 */
export const mockComfyUIWebSocketEvents = {
  executing: (nodeId: string) => ({ type: 'executing', data: { node: nodeId } }),
  progress: (value: number, max: number) => ({ type: 'progress', data: { value, max } }),
  executed: (nodeId: string, output: unknown) => ({ type: 'executed', data: { node: nodeId, output } }),
  executionComplete: () => ({ type: 'execution_complete', data: {} }),
  executionError: (message: string) => ({ type: 'execution_error', data: { exception_message: message } })
};
