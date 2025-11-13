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
  config: {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        field: { type: Type.STRING }
      },
      required: ["field"]
    }
  }
});
const result = JSON.parse(response.text);
```

### Context Pruning for Token Efficiency
Before complex operations, create summarized "briefs" using `getPrunedContext*` functions in geminiService. This reduces token usage by 70-80%.

Pattern:
```typescript
const brief = await getPrunedContextForShotGeneration(
  storyBible, 
  directorsVision, 
  scene,
  logApiCall,
  updateApiStatus
);
// Use brief instead of full context in subsequent calls
```

### ComfyUI Workflow Mapping
ComfyUI integration uses node-based mapping. The app data maps to workflow nodes like:
```json
{
  "3:text": "human_readable_prompt",     // Node 3's text input
  "7:text": "negative_prompt",           // Node 7's text input  
  "10:image": "keyframe_image"           // Node 10's image input
}
```

Always validate mappings before queuing prompts. See `comfyUIService.validateWorkflowAndMappings()`.

## Development Workflows

### Running Locally
```powershell
npm install
# Set GEMINI_API_KEY in .env.local
npm run dev  # Starts Vite dev server on port 3000
```

**Quick Setup Verification**: Run `.\scripts\diagnose.ps1` to check your environment and verify all dependencies are properly configured.

### ComfyUI Installation
ComfyUI is installed as a portable Windows application at `C:\ComfyUI\ComfyUI_windows_portable\`. This installation includes:
- Python embedded runtime (no separate Python installation needed)
- All required dependencies pre-configured
- Proper CORS headers for browser integration
- Default port: 8188

### Starting ComfyUI
Use the VS Code task "Start ComfyUI Server" or run directly:
```powershell
# Using the provided batch file
C:\ComfyUI\start-comfyui.bat

# Or using the official NVIDIA GPU script
C:\ComfyUI\ComfyUI_windows_portable\run_nvidia_gpu.bat

# Or using VS Code task (recommended)
# Press Ctrl+Shift+P → Tasks: Run Task → Start ComfyUI Server
```

The server will start on `http://127.0.0.1:8188` (or `http://0.0.0.0:8188`) with CORS enabled for all origins.

**Important**: CORS is configured via command-line arguments `--enable-cors-header "*"` in the startup script. Do not modify server.py manually.

### Environment Variables
- `GEMINI_API_KEY` - Required for all AI features
- Exposed to client via Vite's `define` in `vite.config.ts` as `process.env.API_KEY`

### API Rate Limits
Be mindful of Gemini API rate limits:
- **Gemini Flash**: 60 requests per minute
- **Gemini Pro**: 15 requests per minute
- **Gemini Flash Image**: (Check current quota)

The `withRetry` function handles rate limiting automatically, but for batch operations, consider implementing request throttling to stay within limits.

### Terminal Safety (CRITICAL FOR AI AGENTS)
**IMPORTANT**: This project runs background processes (ComfyUI server, Dev server) that must NOT be interrupted by terminal commands.

⚠️ **NEVER use these commands directly**:
- `Stop-Process` or any process termination
- `Get-Process | Where { ... } | Stop-Process`
- Commands that might kill background tasks

**Why**: Each terminal command execution can kill the background ComfyUI/Dev server if not isolated properly.

**SAFE APPROACH** for all agent terminal interactions:
```powershell
# Use isolated script execution that won't affect background processes
# Example 1: Simple status check
& 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'Invoke-RestMethod http://127.0.0.1:8188/system_stats'

# Example 2: Run tests (won't kill background server)
& 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'npm run test' -WorkingDirectory 'C:\Dev\gemDirect1'

# Example 3: Multiple commands
& 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'Get-ChildItem; Write-Host "Done"'
```

**Key Rules**:
1. ✅ DO: Use `safe-terminal.ps1` wrapper for ALL terminal commands in agent sessions
2. ✅ DO: Keep `ComfyUI Server` task running in background (never stop it via terminal)
3. ✅ DO: Let background tasks run continuously during testing
4. ❌ DON'T: Use `Stop-Process` or similar commands without explicit isolation
5. ❌ DON'T: Run process management commands in regular terminal sessions

**Implementation** (`safe-terminal.ps1`):
- Executes all commands in isolated PowerShell process
- Creates temporary script files
- Cleans up automatically
- Returns exit codes properly
- Prevents interference with background tasks

This ensures ComfyUI and other critical services remain available throughout testing and development.

### Optimized E2E Testing (Persistent Session)
For faster iterative testing, use persistent ComfyUI session instead of restarting for each test:

```powershell
# Start persistent session (ComfyUI runs once, stays running)
.\scripts\persistent-e2e.ps1 -Action start

# Run multiple tests (each completes in 60-120s instead of 15-20s startup overhead)
.\scripts\persistent-e2e.ps1 -Action run -MaxWaitSeconds 180
.\scripts\persistent-e2e.ps1 -Action run -MaxWaitSeconds 180
.\scripts\persistent-e2e.ps1 -Action run -MaxWaitSeconds 180

# Check status anytime
.\scripts\persistent-e2e.ps1 -Action status

# Stop when done
.\scripts\persistent-e2e.ps1 -Action stop
```

**Benefits**:
- Eliminates 15-20 second ComfyUI startup per test run
- Reuses CUDA model cache (faster subsequent runs)
- Reduces registry fetching overhead
- Better for rapid iteration and debugging

### Coordinated Multi-Test Runs (Prevents Agent Loop)
Use test coordinator to avoid repeated tool calls and track progress:

```powershell
# Initialize coordinated test run for 3 iterations
.\scripts\test-coordinator.ps1 -Operation init -TestCount 3

# For each test:
.\scripts\test-coordinator.ps1 -Operation next
# ... run actual test ...
.\scripts\test-coordinator.ps1 -Operation checkpoint -Result success

# Get summary report
.\scripts\test-coordinator.ps1 -Operation report
```

**Features**:
- Tracks test state persistently (no agent memory needed)
- Circuit breaker stops after 3 consecutive failures
- Prevents infinite retry loops
- Generates summary reports instead of raw output

## Common Patterns

### Adding New Suggestion Types
1. Add discriminated union type to `types.ts` (e.g., `UpdateShotSuggestion`)
2. Update `Suggestion` type union
3. Implement handler in `applySuggestions()` in `utils/hooks.ts`
4. Update JSON schema in relevant geminiService function

### Adding Creative Enhancers
1. Add to `CreativeEnhancers` interface in `types.ts`
2. Add option list to `cinematicTerms.ts`
3. Update `ControlSectionConfig` in components using enhancers
4. Prompt engineering: Update system instructions to include new category

### State Persistence
Any data that should survive page refresh must use `usePersistentState`:
```typescript
const [data, setData] = usePersistentState<MyType>('uniqueKey', defaultValue);
```
This automatically syncs with IndexedDB on every change.

## Critical Integration Points

### Gemini API Models
- `gemini-2.5-flash` - Fast operations (suggestions, analysis)
- `gemini-2.5-pro` - Complex reasoning (story generation, context pruning)
- `gemini-2.5-flash-image` - Image generation (keyframes, shot previews)

**Token Optimization**: Use flash for speed, pro for quality. Always prune context for multi-step operations.

### ComfyUI Pre-flight Checks
Before queuing any prompt, run all checks via `comfyUIService`:
1. `checkServerConnection()` - Verify server is accessible
2. `checkSystemResources()` - Check VRAM (warn if < 2GB)
3. `getQueueInfo()` - Display queue position
4. `validateWorkflowAndMappings()` - Ensure workflow nodes exist

### WebSocket Progress Tracking
ComfyUI uses WebSocket for real-time updates. Pattern:
```typescript
const ws = new WebSocket(`${url}/ws?clientId=${clientId}`);
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'executing') {
    // Update progress
  } else if (msg.type === 'executed') {
    // Fetch output
  }
};
```

## Error Handling

### API Errors
Use centralized `handleApiError()` from geminiService:
- Rate limit (429) → Auto-retry with backoff
- Quota exceeded → Show billing message
- Safety filter → Inform user to rephrase
- Network error → Check connection

### User Feedback
Always update UI state via callbacks:
```typescript
onStateChange?.('loading', 'Generating story...');
// ... API call ...
onStateChange?.('success', 'Story generated!');
```

## Testing Guidelines

### Manual Testing Checklist
1. Story generation (idea → bible → vision → scenes)
2. Shot editing (add, delete, reorder, enhancers)
3. Image generation (keyframes, shot previews)
4. ComfyUI integration (connection, mapping, generation, progress tracking)
5. Continuity system (video upload, analysis, scoring, suggestions)
6. State persistence (refresh page, check data retention)

**Note**: This project currently has no automated tests. Consider adding:
- Unit tests for service functions (geminiService, comfyUIService)
- Integration tests for ComfyUI workflow mapping
- E2E tests for critical user flows (story generation, timeline editing)

Recommended testing frameworks:
- **Vitest**: Fast unit testing (Vite-native)
- **React Testing Library**: Component testing
- **Playwright**: E2E testing

### Common Issues

#### Gemini API Issues
- **Missing API Key**: Ensure `GEMINI_API_KEY` is set in `.env.local` (not committed to git)
  ```bash
  # .env.local should contain:
  GEMINI_API_KEY=your_api_key_here
  ```
- **Empty API responses**: Check JSON schema matches expected structure
- **Rate limiting**: Verify `withRetry` is being used (Flash: 60 RPM, Pro: 15 RPM)
- **Quota exceeded**: Check your Google AI Studio billing and usage dashboard

#### State/Storage Issues  
- **Missing data after refresh**: Ensure `usePersistentState` is used, not `useState`
- **IndexedDB errors**: Check browser console for quota errors or private browsing mode

#### ComfyUI Integration Issues
- **Connection failures**: 
  1. Verify server is running: `curl http://127.0.0.1:8188/system_stats`
  2. Start the server using VS Code task "Start ComfyUI Server"
  3. Or run: `C:\ComfyUI\start-comfyui.bat`
  4. Verify port 8188 is accessible
  
- **CORS errors**: Should not occur with the new installation. CORS is pre-configured via `--enable-cors-header "*"` in the startup script.

- **Workflow mapping failures**:
  1. Run a workflow in ComfyUI first to populate history
  2. Export workflow as "API Format" and inspect node structure
  3. Verify node IDs in mapping match actual workflow nodes
  
- **No workflow in history**: Generate at least one prompt in ComfyUI before syncing

- **Installation issues**: If problems persist, re-run the clean installation script:
  ```powershell
  .\scripts\setup-comfyui.ps1
  ```

#### Diagnostic Commands
```powershell
# Run comprehensive diagnostics
.\scripts\diagnose.ps1

# Check if ComfyUI is running
curl http://127.0.0.1:8188/system_stats

# Check ComfyUI queue
curl http://127.0.0.1:8188/queue

# Check if .env.local has API key (should show key, not be empty)
cat .env.local

# List ComfyUI processes
Get-Process | Where-Object { $_.Path -like '*ComfyUI*' }

# Restart from clean installation
.\scripts\setup-comfyui.ps1
```

## Code Style

### TypeScript Strictness
- Always define interfaces in `types.ts` for shared data structures
- Use discriminated unions for polymorphic data (e.g., `Suggestion` types)
- Avoid `any` - use `unknown` and type guards if needed

### Component Organization
```
components/
  MyComponent.tsx       # Main component
  icons/
    MyIcon.tsx         # Icon components (SVG)
```

### File Naming
- Components: PascalCase (e.g., `TimelineEditor.tsx`)
- Services/Utils: camelCase (e.g., `geminiService.ts`)
- Types: PascalCase interfaces in `types.ts`

## Performance Considerations

### Large State Updates
When updating arrays/objects in state, always create new instances:
```typescript
// Good
setScenes(prev => [...prev, newScene]);
// Bad
scenes.push(newScene); setScenes(scenes);
```

### Image Handling
Images are stored as base64 in state and IndexedDB. For large projects, consider cleanup/compression.

### Debouncing
Auto-save and search inputs are debounced (see `usePersistentState` and search components).

## Documentation References
- Full architecture: `PROJECT_OVERVIEW.md`
- ComfyUI setup: `COMFYUI_INTEGRATION.md`
- Local setup: `LOCAL_SETUP_GUIDE.md`
- Quick start: `QUICK_START.md`

## Deployment Notes
**Important**: This project was developed in a cloud environment (Google AI Studio) and is newly tested locally. Consider:
- Backend proxy for API key security (currently client-side exposed)
- CORS configuration for production hosting
- ComfyUI server accessibility (currently local-only)
- Static asset hosting for generated images/videos
- Database migration from IndexedDB to server-side storage for multi-device access
