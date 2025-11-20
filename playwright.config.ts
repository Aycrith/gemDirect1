import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: true,
  globalSetup: './tests/helpers/globalSetup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_PROD_BUILD ? 'http://127.0.0.1:8080' : (process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'),
    actionTimeout: 60_000,
    // Context-efficient: Only trace on retry, no video unless failure
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_PROD_BUILD ? {
    // Production build server for performance testing
    command: 'serve dist -p 8080 --no-clipboard',
    port: 8080,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  } : {
    // Start Vite dev server (default port 3000)
    // VITE env vars injected to configure LM Studio (welcome dialog removed from code)
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      // Local LM Studio (Mistral) configuration for tests - use env-driven or localhost default
      VITE_LOCAL_STORY_PROVIDER_URL: process.env.VITE_LOCAL_STORY_PROVIDER_URL || 'http://127.0.0.1:1234/v1/chat/completions',
      VITE_LOCAL_LLM_MODEL: process.env.VITE_LOCAL_LLM_MODEL || 'mistralai/mistral-7b-instruct-v0.3',
      VITE_LOCAL_LLM_REQUEST_FORMAT: process.env.VITE_LOCAL_LLM_REQUEST_FORMAT || 'openai-chat',
      VITE_LOCAL_LLM_TEMPERATURE: process.env.VITE_LOCAL_LLM_TEMPERATURE || '0.35',
      VITE_LOCAL_LLM_TIMEOUT_MS: process.env.VITE_LOCAL_LLM_TIMEOUT_MS || '120000',
      VITE_LOCAL_LLM_SEED: process.env.VITE_LOCAL_LLM_SEED || '42',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
