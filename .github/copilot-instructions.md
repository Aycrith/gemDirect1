# Copilot Instructions for gemDirect1

## Project Overview
This is an AI-powered cinematic story generator that creates production-ready video timelines. It integrates Gemini AI for content generation and ComfyUI for local video/image rendering.

## Architecture

### Service Layer Pattern
All external API interactions go through dedicated service modules:
- `services/geminiService.ts` - Gemini API with retry logic, context pruning, structured outputs
- `services/comfyUIService.ts` - ComfyUI integration with pre-flight checks, WebSocket tracking
- `services/payloadService.ts` - Transform timeline data into various prompt formats

**Critical**: Never call APIs directly from components. Always use service functions with proper error handling.

### State Management Strategy
- **React Context**: Use `ApiStatusContext` and `UsageContext` for cross-cutting concerns (API status, usage tracking)
- **Custom Hooks**: Use `useProjectData` for orchestrating complex workflows with API calls
- **Persistent State**: Use `usePersistentState` hook (wraps IndexedDB via `utils/database.ts`) for all user data that should persist
- **Local State**: Only for UI-only concerns (modals, dropdowns)

### Data Flow
```
User Input → Component → useProjectData hook → Service Layer → External API
                                ↓
                         IndexedDB (auto-persist)
```

## Key Conventions

### API Calls with Retry Logic
Always use `withRetry` wrapper from geminiService:
```typescript
const result = await withRetry(
  () => apiCall(), 
  'context description',
  modelName,
  logApiCall,
  onStateChange
);
```
This handles rate limiting (429), exponential backoff (1s, 2s, 4s), and usage logging automatically.

### Structured JSON Outputs
All Gemini API calls MUST use JSON schemas via `responseMimeType: "application/json"` and `responseSchema`. Never parse markdown-formatted responses.

Example pattern:
```typescript
const response = await ai.models.generateContent({
  model: proModel,
  contents: prompt,

  Short, actionable guidance for AI agents working in this repository. For the full canonical archive, see `docs/archived/copilot-instructions.legacy.cleaned.md`.

  Key rules (must-follow):

  - Use the service layer for all external calls:
    - `services/geminiService.ts` (withRetry, pruning, schemas)
    - `services/comfyUIService.ts` (pre-flight, validation, WS progress)
    - `services/payloadService.ts`

  - Always wrap Gemini API calls with `withRetry` to handle 429/backoff and log usage.

  ```typescript
  // Example
  const result = await withRetry(() => ai.models.generateContent(...), 'shot-gen', model, logApiCall, onStateChange);
  ```

  - Request structured JSON responses with `responseMimeType: "application/json"` and `responseSchema` (do not parse freeform markdown).
  - Prune large context with `getPrunedContext*` helpers before multi-step calls.
  - Validate ComfyUI mappings with `comfyUIService.validateWorkflowAndMappings()` before queuing.
  - NEVER run process-killing shell commands in shared terminals. Use the safe wrapper:

  ```powershell
  & 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'Invoke-RestMethod http://127.0.0.1:8188/system_stats'
  ```

  Quick local steps:

  ```powershell
  npm install
  # set GEMINI_API_KEY in .env.local
  npm run dev
  ```

  Files to look at first:
  - `services/geminiService.ts` — withRetry, pruning, schema usage
  - `services/comfyUIService.ts` — server checks, mapping validation
  - `utils/hooks.ts` — `applySuggestions()`

  If you want me to expand any examples (detailed response schemas, withRetry implementation, or full ComfyUI mapping example), tell me which and I will add it to the canonical archive.

  ---
  Backup: `.github/copilot-instructions.legacy.md` (full original guidance preserved).
### Running Locally
