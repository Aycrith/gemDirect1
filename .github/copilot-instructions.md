# Copilot Instructions for gemDirect1

**Last Updated**: 2025-11-30  
**Status**: ✅ Production-Ready  
**WAN2 Pipeline**: ✅ WORKING (validated with evidence)

AI-powered cinematic story generator creating production video timelines. Integrates **Gemini AI** for content generation and **ComfyUI** for local video/image rendering via WAN workflows.

## 🚨 CRITICAL: Read This First

**The WAN2 pipeline is WORKING**. If you see old documents mentioning a "WAN2 blocker", ignore them - they're outdated. Evidence:
- Run logs: `logs/20251119-205415/` contains 3 MP4 files (0.33-8.17 MB)
- Tests: 1522/1523 passing (99.9% - 1 skipped)
- Build: Zero errors

**Before making ANY changes**:
1. Read `README.md` (5 minutes) - Project overview
2. Read `Documentation/PROJECT_STATUS_CONSOLIDATED.md` (15 minutes) - **Single source of truth**
3. Read `START_HERE.md` (5 minutes) - Quick context
4. Run `npm run check:health-helper` - Validates setup
5. Run `npm test -- --run` - Validates current state (uses single-run mode)

## 🛑 MANDATORY: Agent Tool Usage Rules

**THESE RULES ARE NON-NEGOTIABLE. Failure to follow them wastes time and resources.**

### Starting Servers (Dev Server, ComfyUI, FastVideo)

**NEVER run server commands directly in a terminal.** Servers MUST be started via VS Code tasks.

| Server | ❌ WRONG (terminal) | ✅ CORRECT (task) |
|--------|---------------------|-------------------|
| Dev Server | `npm run dev` | Use task: `Dev Server` |
| ComfyUI | `python main.py...` | Use task: `Start ComfyUI Server (Patched - Recommended)` |
| FastVideo | `python fastvideo_server.py` | Use task: `Start FastVideo Server` |

**Why?** Terminal commands run in shared context. When you run a follow-up command, you terminate the server. Tasks run in dedicated panels that persist.

**Before starting any server**, check if it's already running:
```powershell
# Check dev server (port 3000)
pwsh -File scripts/check-server-running.ps1 -Port 3000

# Check ComfyUI (port 8188)  
pwsh -File scripts/check-server-running.ps1 -Port 8188
```

### Running Tests

**NEVER run tests without proper flags.** Tests MUST use single-run mode and verbose output.

| Test Type | ❌ WRONG | ✅ CORRECT |
|-----------|----------|------------|
| Unit tests | `npm test` | `npm test -- --run --reporter=verbose` |
| Unit tests | `vitest` | `npm test -- --run --reporter=verbose` |
| Playwright | `npx playwright test` | `npx playwright test --reporter=list` |
| Playwright | `npm run check:playwright-*` | Use task: `Run Playwright Tests` |

**Why?** Without `--run`, vitest enters watch mode and never terminates. Without reporters, you get no logging to verify completion.

**Preferred method - use wrapper scripts:**
```powershell
# Unit tests (enforces --run and verbose)
pwsh -File scripts/run-tests.ps1

# Playwright tests (enforces --reporter=list)
pwsh -File scripts/run-playwright.ps1

# Or use VS Code tasks:
# - "Run Unit Tests (Single Run)"
# - "Run Playwright Tests"
```

### Terminal Safety Checklist

Before running ANY terminal command, ask yourself:

1. **Is this starting a server?** → Use a VS Code task, NOT `run_in_terminal`
2. **Is this running tests?** → Include `--run` flag (vitest) or `--reporter=list` (playwright)
3. **Will this command terminate?** → If not, set `isBackground: true` or use a task
4. **Am I in the right terminal?** → Never reuse a terminal running a server

## 📁 Documentation Structure (Updated 2025-11-20)

**351 files organized into**:
- **Documentation/** - Guides, references, architecture specs
- **Development_History/** - Phases, sessions, milestones, changelogs
- **Agents/** - Handoffs, agent-specific instructions
- **Testing/** - E2E tests, reports, validation strategies
- **Workflows/** - ComfyUI workflows and integration guides

**Essential Files**:
- `README.md` - Quick start, commands, status badges
- `Documentation/PROJECT_STATUS_CONSOLIDATED.md` - **Single source of truth** (updated 2025-11-30)
- `START_HERE.md` - 5-minute context summary
- `AGENT_HANDOFF_CURRENT.md` - Latest consolidated handoff (Phase 1D complete)
- `agent/.state/session-handoff.json` - Machine-readable session state
- `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md` - ComfyUI node mappings
- `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md` - Testing protocols

## Architecture Essentials

### Service Layer (Critical)
**Never call APIs directly from components.** All external interactions route through:

- `services/geminiService.ts` — Gemini API with `withRetry` (handles 429/exponential backoff), context pruning (`getPrunedContext*`), structured JSON outputs
- `services/comfyUIService.ts` — ComfyUI integration, pre-flight checks (`validateWorkflowAndMappings`), queue monitoring, WebSocket progress tracking
- `services/payloadService.ts` — Transforms timeline data into prompt formats (JSON/text/structured)

Example:
```typescript
// CORRECT: Always wrap Gemini calls with withRetry
const result = await withRetry(
  () => ai.models.generateContent({ model, contents, config }), 
  'shot-generation',
  modelName,
  logApiCall,
  onStateChange
);

// WRONG: Direct API call without retry/logging
const response = await ai.models.generateContent(...);
```

### State Management
- **Persistent user data**: Use `usePersistentState` hook (auto-syncs to IndexedDB via `utils/database.ts`)
- **Workflow orchestration**: Use `useProjectData` hook (coordinates multi-step generation, applies suggestions via `applySuggestions`)
- **Cross-cutting concerns**: Use React Context (`ApiStatusContext`, `UsageContext`, `PlanExpansionStrategyContext`)
- **Local UI state only**: Standard `useState` (modals, dropdowns, transient form state)

Data flow:
```
User Input → Component → useProjectData → Service Layer → External API
                              ↓
                      IndexedDB (auto-persist via usePersistentState)
```

### Structured Outputs
All Gemini calls MUST use JSON schemas. Never parse markdown responses.

```typescript
const response = await ai.models.generateContent({
  model: proModel,
  contents: prompt,
  config: { 
    responseMimeType: 'application/json', 
    responseSchema: { type: Type.OBJECT, properties: { ... } }
  }
});
const parsed = JSON.parse(response.text);
```

## Critical Workflows

### Local Development
```powershell
npm install
# Set GEMINI_API_KEY in .env.local
npm run dev                    # Start React dev server (port 3000)

# ComfyUI (separate terminal)
# Start via VS Code task: "Start ComfyUI Server (Patched - Recommended)"
# Or manually: C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe -s ComfyUI\main.py --listen 0.0.0.0 --port 8188
```

### Testing Strategy

#### Unit & Service Tests
```powershell
# Unit tests (fast, no external deps)
npm test -- --run                                    # All Vitest suites
node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/comfyUIService.test.ts

# Full E2E pipeline (story → keyframes → videos)
pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration

# Validation
pwsh scripts/validate-run-summary.ps1 -RunDir logs/<timestamp>
```

**Node.js requirement**: ≥22.19.0 (enforced by scripts)

#### React Browser Testing (Playwright E2E)

**Approach**: Real integration testing with local LLM (NOT SDK mocking)
- Use Mistral 7B via LM Studio at http://192.168.50.192:1234
- Set `VITE_PLAYWRIGHT_SKIP_WELCOME=true` to bypass welcome dialog
- Set `VITE_LOCAL_*` environment variables for LLM configuration
- Configure `playwright.config.ts` webServer with these variables

**Why Not Mock Gemini SDK?**
The Google Generative AI SDK bypasses Playwright route interception:
- SDK makes internal HTTP calls that don't route through `page.route()`
- Response mocking at fetch level doesn't work for SDK-wrapped requests
- Solution: Use real local services (LM Studio, ComfyUI) in tests instead

**Test Coverage**: 1488/1489 tests passing (99.9%)
- Unit Tests: 81/81 test files passing ✅
- E2E Tests: 117/117 runnable tests ✅
- 1 test skipped (PreflightCheck mock - not a bug)

**Running Browser Tests**:
```powershell
npm run dev                              # Start dev server
npx playwright test                      # Run all E2E tests
npx playwright test --reporter=html      # Generate HTML report
npx playwright test --debug              # Debug mode
```

**Pattern**: All E2E tests should use real services (with Playwright route interception for mocking specific scenarios)

**Environment Variables**: Automatically configured in `playwright.config.ts`:
```powershell
VITE_PLAYWRIGHT_SKIP_WELCOME=true
VITE_LOCAL_STORY_PROVIDER_URL=http://192.168.50.192:1234/v1/chat/completions
VITE_LOCAL_LLM_MODEL=mistralai/mistral-nemo-instruct-2407
VITE_LOCAL_LLM_REQUEST_FORMAT=openai-chat
VITE_LOCAL_LLM_TEMPERATURE=0.35
```

### ComfyUI Integration
- **Workflows**: WAN T2I (`workflows/image_netayume_lumina_t2i.json`) for keyframes, WAN I2V (`workflows/video_wan2_2_5B_ti2v.json`) for videos
- **Mapping contract**: 
  - `wan-t2i`: Requires `CLIPTextEncode.text` mapped to `human_readable_prompt` and `full_timeline_json`
  - `wan-i2v`: Requires above + `LoadImage.image` mapped to `keyframe_image`
- **Pre-flight validation**: Always call `comfyUIService.validateWorkflowAndMappings()` before queuing
- **Health check helper**: Run `npm run check:health-helper` (or `node scripts/comfyui-status.ts`) to validate server, workflows, mappings, queue status

### Workflow Profile Loading (IMPORTANT)
**The `localGenSettings.json` file is NOT automatically loaded by the browser**. It's a reference/backup file. To load workflows into the browser:

1. **Via Settings UI (Recommended)**:
   - Open Settings (⚙️ icon) → ComfyUI Settings tab
   - Click "Import from File" button in Workflow Profiles section
   - Select `localGenSettings.json` to load all profiles at once
   - Profiles load into browser's IndexedDB storage

2. **Default behavior**:
   - Browser creates empty workflow profiles on first load
   - Profiles persist in IndexedDB via `usePersistentState` hook
   - `localGenSettings.json` serves as configuration template only

3. **Validation**:
   - Workflow profiles show status: "✓ Ready", "⚠ Incomplete", or "○ Not configured"
   - wan-t2i needs: CLIP text mapping
   - wan-i2v needs: CLIP text mapping + Keyframe image mapping
   - Check profile status before attempting keyframe/video generation

### Terminal Safety
**NEVER use process-killing commands in shared terminals.** Use the safe wrapper:

```powershell
# CORRECT: Safe wrapper isolates commands
& 'C:\Dev\gemDirect1\scripts\safe-terminal.ps1' -Command 'Get-Process python'

# WRONG: Can kill background servers
Get-Process | Where-Object { $_.Name -like '*python*' } | Stop-Process -Force
```

## Project-Specific Patterns

### Critical: Keyframe Images Are Required
**All ComfyUI video generation requires a scene keyframe.** Components must:
1. Check `generatedImages[scene.id]` exists before calling `generateTimelineVideos` or `queueComfyUIPrompt`
2. Pass keyframes with data URL prefix stripped: `stripDataUrlPrefix(base64Image)`
3. Map each shot to keyframes: `Record<string, string>` where key is `shot.id`

Example (TimelineEditor):
```typescript
const sceneKeyframe = generatedImages[scene.id];
if (!sceneKeyframe) {
  // Show error: user must generate keyframe first
  return;
}

const keyframeImages: Record<string, string> = {};
timeline.shots.forEach(shot => {
  keyframeImages[shot.id] = sceneKeyframe; // or shot-specific image
});

await generateTimelineVideos(settings, timeline, vision, summary, keyframeImages, ...);
```

### Applying AI Suggestions
Suggestions flow through `applySuggestions` in `useProjectData`:
- Updates story bible, director's vision, scenes, or timelines
- Handles: `UPDATE_STORY_BIBLE`, `UPDATE_DIRECTORS_VISION`, `UPDATE_SCENE`, `UPDATE_SHOT`, `ADD_SHOT_AFTER`, `UPDATE_TRANSITION`
- Auto-persists changes to IndexedDB
- Use `onApplySuggestion(suggestion, sceneId)` from components

### Context Pruning
Before multi-step Gemini calls, reduce token usage:
```typescript
// Import from planExpansionService (routes to geminiService)
const prunedContext = await planActions.getPrunedContextForShotGeneration(
  storyBible, narrativeContext, sceneSummary, directorsVision, logApiCall, onStateChange
);
```

### LM Studio Integration (Optional)
For local story generation fallback:
```powershell
$env:LOCAL_STORY_PROVIDER_URL = 'http://192.168.50.192:1234/v1/chat/completions'
$env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
$env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
$env:LOCAL_LLM_TEMPERATURE = '0.35'
```

Mirror these with `VITE_LOCAL_*` variants for React UI access.

## Key Files Reference

### Core Application
| Path | Purpose |
|------|---------|
| `services/geminiService.ts` | Gemini API, `withRetry`, context pruning, schemas |
| `services/comfyUIService.ts` | ComfyUI server interaction, workflow validation |
| `services/payloadService.ts` | Timeline → prompt transformations |
| `utils/hooks.ts` | `useProjectData`, `usePersistentState`, `applySuggestions` |
| `utils/database.ts` | IndexedDB wrapper (auto-used by `usePersistentState`) |
| `scripts/run-comfyui-e2e.ps1` | Full E2E pipeline orchestrator |

### Documentation (Organized 2025-11-20)
| Path | Purpose |
|------|---------|
| `Documentation/PROJECT_STATUS_CONSOLIDATED.md` | **Single source of truth** - updated 2025-11-22 |
| `Documentation/Guides/` | User guides, quick starts, setup instructions |
| `Documentation/Architecture/` | System architecture, data flow, workflow mappings |
| `Documentation/References/` | Quick references, indexes, API docs |
| `Development_History/Phases/` | Phase completion reports (Phase 1-7) |
| `Development_History/Sessions/` | Session summaries, status reports |
| `Development_History/Milestones/` | Major milestones, deployment reports |
| `Testing/E2E/` | End-to-end test reports |
| `Testing/Reports/` | Validation and verification reports |
| `Testing/Strategies/` | Testing strategies, coverage plans |
| `Workflows/ComfyUI/` | ComfyUI-specific documentation |
| `docs/archived/` | Archived documentation (superseded) |

### Finding Documentation
**If you need to find a specific document**:
1. Check `Documentation/PROJECT_STATUS_CONSOLIDATED.md` first (single source of truth, updated 2025-11-22)
2. Use directory structure above to navigate categories
3. Each category has a README.md explaining contents
4. **Archived docs** are in `docs/archived/` (superseded - for historical reference only):
   - `docs/archived/handoffs-2025-11/` - Early agent handoffs (pre-Nov 19)
   - `docs/archived/root-docs-2025-11/` - Session docs (Nov 19-21, 44 files archived 2025-11-22)
5. **Current handoff**: `AGENT_HANDOFF_TEST_IMPROVEMENTS_20251122.md` (test suite 100% pass rate achievement)
| `scripts/comfyui-status.ts` | Pre-flight health checker |
| `workflows/image_netayume_lumina_t2i.json` | WAN T2I workflow (keyframes) |
| `workflows/video_wan2_2_5B_ti2v.json` | WAN I2V workflow (videos) |

## Common Test Failures & Fixes

### "No frames copied" or "Frame count below floor"
**Root cause**: Missing or invalid keyframe image passed to ComfyUI
- **Fix**: Ensure `generatedImages[scene.id]` exists before calling generation
- **Check**: Verify `stripDataUrlPrefix()` applied to base64 strings
- **Validate**: Confirm `keyframe_image` mapping exists in workflow profile

### "Workflow mapping validation failed"
**Root cause**: Using wrong profile ID (`wan-t2i` vs `wan-i2v`) or missing required mappings
- **Fix**: Use `wan-t2i` for keyframe generation (no `keyframe_image` mapping needed)
- **Fix**: Use `wan-i2v` for video generation (requires both CLIP + `keyframe_image` mappings)
- **Check**: Run `npm run check:health-helper` before queuing

### "Prompt injection not working"
**Root cause**: Using wrong `payloadService` export or missing `negativePrompt` field
- **Fix**: Import from `services/payloadService.ts` (4-param version with `negativePrompt`)
- **Check**: Ensure `payloads` object has `{ json, text, structured, negativePrompt }` structure
- **Validate**: Confirm mapping keys like `"3:text"` match actual workflow node IDs

### E2E test timeout or hanging
**Root cause**: ComfyUI queue stuck or history polling misconfigured
- **Fix**: Check `MaxWaitSeconds` and `PollIntervalSeconds` in `run-comfyui-e2e.ps1`
- **Check**: Verify ComfyUI server is responding: `Invoke-RestMethod http://127.0.0.1:8188/queue`
- **Restart**: Use safe wrapper: `& scripts\safe-terminal.ps1 -Command 'Restart-Service ComfyUI'`

### "Browser fetch fails to LM Studio" (Phase 2 Playwright tests)
**Root cause**: CORS headers missing on LM Studio response
- **Limitation**: Browser fetch blocked, but Node.js fetch works (server-side only)
- **Workaround**: Tests skip browser-based LLM scenarios, validate via unit tests instead
- **Future fix**: Configure LM Studio CORS headers or implement reverse proxy
- **Why it happens**: LM Studio HTTP server doesn't return `Access-Control-Allow-*` headers by default
- **Current approach**: Tests use real local LLM for server-side calls, skip browser-based generation

## Best Practices for Future Development

### Documentation Workflow
1. **Always check PROJECT_STATUS_CONSOLIDATED.md first** - Single source of truth (updated 2025-11-22)
2. **Update docs alongside code changes** - Don't let docs drift
3. **Place new docs in correct category**:
   - Guides → `Documentation/Guides/`
   - Architecture changes → `Documentation/Architecture/`
   - Session notes → `Development_History/Sessions/`
   - Test results → `Testing/Reports/`
4. **Keep root directory clean** - Only README.md, START_HERE.md, TODO.md, and current handoff
   - Archive old handoffs to `docs/archived/root-docs-2025-11/` when superseded

### Code Quality Standards
- ✅ All API calls through service layer (never direct from components)
- ✅ TypeScript strict mode enforced
- ✅ Zero build errors tolerated
- ✅ Run tests before committing: `npm test && npx playwright test`
- ✅ Use `multi_replace_string_in_file` for batch edits (efficiency)
- ✅ Follow React hooks patterns: `usePersistentState` for data, `useState` for UI

### 🚨 CRITICAL: Infinite Loop Prevention (React 18 StrictMode)

React 18 StrictMode runs effects twice to catch side effects. Combined with `useEffect` dependency issues, this can cause infinite loops. **This project has fixed 6 infinite loop bugs** - follow these patterns to avoid creating new ones.

#### Anti-Patterns That Cause Infinite Loops

```typescript
// ❌ WRONG: Object in dependency array - new reference on every render
useEffect(() => {
    console.log(settings.comfyUIUrl);
}, [settings]);  // settings object changes reference even if values are same

// ❌ WRONG: Context value directly in deps
const { localGenStatus, setLocalGenStatus } = useContext(GenStatusContext);
useEffect(() => {
    // Do something with status
}, [localGenStatus]);  // Object ref changes on every context update

// ❌ WRONG: State setter that depends on its own state
useEffect(() => {
    setItems(prev => [...prev, newItem]);  // Creates new array → triggers effect again
}, [items]);  // Infinite loop!
```

#### Safe Patterns to Use

```typescript
// ✅ PATTERN 1: Use refs for unstable values
const localGenStatusRef = useRef(localGenStatus);
localGenStatusRef.current = localGenStatus;

useEffect(() => {
    const status = localGenStatusRef.current;  // Access via ref, not dep
    // ...
}, [sceneId]);  // Only depends on stable primitives

// ✅ PATTERN 2: Extract primitive values from objects
const comfyUIUrl = settings.comfyUIUrl;
const isEnabled = settings.featureFlags?.videoUpscaling;

useEffect(() => {
    console.log(comfyUIUrl);
}, [comfyUIUrl]);  // Primitive string - stable reference

// ✅ PATTERN 3: Use Zustand stores with selectors
const comfyUIUrl = useSettingsStore(state => state.comfyUIUrl);
const updateStatus = useGenerationStatusStore(state => state.updateSceneStatus);

// ✅ PATTERN 4: One-time initialization guard
const [isInitialized, setIsInitialized] = useState(false);
useEffect(() => {
    if (isInitialized) return;
    // Run once
    setIsInitialized(true);
}, [isInitialized]);

// ✅ PATTERN 5: Subscription guard
const isSubscribedRef = useRef(false);
useEffect(() => {
    if (isSubscribedRef.current) return;
    isSubscribedRef.current = true;
    const unsub = subscribe();
    return () => { isSubscribedRef.current = false; unsub(); };
}, []);
```

#### Key Files to Reference

| Store | Purpose | File |
|-------|---------|------|
| Settings | LocalGenerationSettings | `services/settingsStore.ts` |
| Gen Status | LocalGenerationStatus | `services/generationStatusStore.ts` |
| Scene State | Unified scene data | `services/sceneStateStore.ts` |

#### Feature Flags for Store Migration (Updated 2025-11-30)

- `useSettingsStore: true` - ✅ ENABLED - Zustand settings store with IndexedDB persistence
- `useGenerationStatusStore: true` - ✅ ENABLED - Zustand generation status store
- `useUnifiedSceneStore: true` - ✅ ENABLED - Unified scene state

**Migration Status**: TimelineEditor and ContinuityDirector migrated via adapter pattern. After 1 sprint validation, legacy props will be removed.

### Testing Protocol
- Unit tests: Fast, isolated, no external dependencies
- E2E tests: Use real services (LM Studio, ComfyUI) when possible
- Run `npm run check:health-helper` before E2E tests
- Document test skips with clear reasoning
- Update test documentation in `Testing/` directory

### Git Hygiene
- Commit messages: Conventional commits format (`feat:`, `fix:`, `docs:`, `test:`)
- One logical change per commit
- No commented-out code or debug logs
- Update CURRENT_STATUS.md for significant changes

### Agent Handoff Protocol
1. Read `Documentation/PROJECT_STATUS_CONSOLIDATED.md` for current state (updated 2025-11-30)
2. Read `START_HERE.md` for quick context
3. Read latest handoff: `AGENT_HANDOFF_CURRENT.md`
4. Check machine-readable state: `agent/.state/session-handoff.json`
5. Create session summary in `Development_History/Sessions/`
6. Update `Documentation/PROJECT_STATUS_CONSOLIDATED.md` with new metrics
7. Keep root handoff docs minimal - archive old ones to `docs/archived/root-docs-2025-11/` when superseded

## Documentation Resources
- **Current Status**: `Documentation/PROJECT_STATUS_CONSOLIDATED.md` (ALWAYS READ FIRST - updated 2025-11-30)
- **Latest Handoff**: `AGENT_HANDOFF_CURRENT.md` (Phase 1D state management complete)
- **Session State**: `agent/.state/session-handoff.json` (machine-readable)
- **Architecture**: `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md`
- **Testing**: `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md`
- **ComfyUI**: `Workflows/ComfyUI/COMFYUI_WORKFLOW_INDEX.md`
- **Quick Start**: `START_HERE.md` (5-minute summary)
- **Agent Guidelines**: This file (`.github/copilot-instructions.md`)
- **Archived Docs**: `docs/archived/` (historical reference only, 180+ files archived)
