# E2E Testing Guide

This directory contains End-to-End (E2E) tests using Playwright. These tests verify the application's functionality from the user's perspective, including integration with local AI services.

## Prerequisites

Before running the E2E tests, ensure the following requirements are met:

### 1. Node.js Environment
- **Node.js Version**: >= 22.19.0
- **Dependencies**: Install via `npm install`

### 2. Local AI Services
The tests require real local services to be running. Mocking is minimized to ensure true integration testing.

- **ComfyUI Server**:
  - Must be running on **port 8188**
  - Must have CORS enabled (`--enable-cors-header '*'`)
  - Use the VS Code task: `Start ComfyUI Server (Patched - Recommended)`

- **LM Studio (LLM Provider)**:
  - Must be running and accessible (default: `http://192.168.50.192:1234` or `localhost`)
  - Must have a model loaded (e.g., `mistralai/mistral-nemo-instruct-2407`)
  - Ensure the server is compatible with OpenAI Chat format

- **FastVideo Server (Optional)**:
  - Required for specific video generation tests
  - Use the VS Code task: `Start FastVideo Server`

## Environment Configuration

The test environment is configured via `playwright.config.ts` and environment variables.

### Key Environment Variables
These are automatically set in `playwright.config.ts` for local development but can be overridden:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PLAYWRIGHT_SKIP_WELCOME` | `true` | Skips the initial welcome modal to speed up tests |
| `VITE_LOCAL_STORY_PROVIDER_URL` | `http://192.168.50.192:1234...` | URL for the local LLM provider (LM Studio) |
| `VITE_LOCAL_LLM_MODEL` | `mistralai/mistral-nemo...` | Model ID to use for generation |
| `VITE_LOCAL_LLM_REQUEST_FORMAT` | `openai-chat` | API format for LLM requests |

## Running Tests

### Via VS Code Tasks (Recommended)
- **Run Playwright Tests**: Runs the full suite with list reporter
- **playwright:svd**: Runs SVD-specific tests
- **playwright:list**: Lists all available tests

### Via Command Line
```powershell
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/story-generation.spec.ts

# Run with UI mode (great for debugging)
npx playwright test --ui

# Run with debug mode
npx playwright test --debug
```

## Test Categories

- **UI Tests**: Verify rendering, navigation, and state management (e.g., `app-loading.spec.ts`, `landing-page-visibility.spec.ts`)
- **Integration Tests**: Verify interaction with ComfyUI and LM Studio (e.g., `comfyui-integration.spec.ts`, `lm-studio-integration.spec.ts`)
- **Pipeline Tests**: Verify full workflows from story to video (e.g., `full-pipeline.spec.ts`, `wan-full-journey.spec.ts`)

## Troubleshooting

### Common Issues

1. **Timeouts**:
   - E2E tests involving AI generation can be slow.
   - Default timeout is set to 120s in `playwright.config.ts`.
   - Ensure your local services (ComfyUI, LM Studio) are responsive.

2. **Server Not Running**:
   - Ensure the Dev Server (`npm run dev`) is running (Playwright will try to start it if not, but pre-starting is faster).
   - Ensure ComfyUI is running.

3. **"No frames copied" / Generation Failures**:
   - Check ComfyUI console for errors.
   - Verify that the correct workflow profiles are loaded.

### Skipped Tests
Some tests may be skipped if:
- Feature flags are disabled (e.g., `useSettingsStore`).
- Required services are not detected.
- Specific hardware requirements are not met.
