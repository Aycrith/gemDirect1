import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    actionTimeout: 60_000,
    trace: 'on-first-retry',
  },
  webServer: {
    // Start Vite dev server so import.meta.env variables can be injected via env.
    // Vite proxy configured in vite.config.ts will handle CORS for /api/local-llm
    command: 'npm run dev -- --host 0.0.0.0 --port 4173',
    port: 4173,
    reuseExistingServer: true, // Allow reusing existing dev server
    timeout: 120_000,
    env: {
      VITE_PLAYWRIGHT_SKIP_WELCOME: 'true',
      NODE_ENV: 'development',
      // Local LM Studio (Mistral) configuration for tests
      // Note: In DEV mode, localStoryService.ts will use '/api/local-llm' proxy to avoid CORS
      VITE_LOCAL_STORY_PROVIDER_URL: 'http://192.168.50.192:1234/v1/chat/completions',
      VITE_LOCAL_LLM_MODEL: 'mistralai/mistral-7b-instruct-v0.3',
      VITE_LOCAL_LLM_REQUEST_FORMAT: 'openai-chat',
      VITE_LOCAL_LLM_TEMPERATURE: '0.35',
      VITE_LOCAL_LLM_TIMEOUT_MS: '120000',
      VITE_LOCAL_LLM_SEED: '42',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
