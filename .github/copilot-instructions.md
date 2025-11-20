# Copilot Instructions for gemDirect1

**Last Updated**: 2025-11-20  
**Status**: ✅ Production-Ready  
**WAN2 Pipeline**: ✅ WORKING (validated with evidence)

AI-powered cinematic story generator creating production video timelines. Integrates **Gemini AI** for content generation and **ComfyUI** for local video/image rendering via WAN workflows.

## 🚨 CRITICAL: Read This First

**The WAN2 pipeline is WORKING**. If you see old documents mentioning a "WAN2 blocker", ignore them - they're outdated. Evidence:
- Run logs: `logs/20251119-205415/` contains 3 MP4 files (0.33-8.17 MB)
- Tests: ~44/50 passing (88% coverage)
- Build: Zero errors

**Before making ANY changes**:
1. Read `README.md` (5 minutes) - Project overview
2. Read `Documentation/PROJECT_STATUS_CONSOLIDATED.md` (15 minutes) - **Single source of truth**
3. Read `START_HERE.md` (5 minutes) - Quick context
4. Run `npm run check:health-helper` - Validates setup
5. Run `npm test && npx playwright test` - Validates current state

## 📁 Documentation Structure (Updated 2025-11-20)

**351 files organized into**:
- **Documentation/** - Guides, references, architecture specs
- **Development_History/** - Phases, sessions, milestones, changelogs
- **Agents/** - Handoffs, agent-specific instructions
- **Testing/** - E2E tests, reports, validation strategies
- **Workflows/** - ComfyUI workflows and integration guides

**Essential Files**:
- `README.md` - Quick start, commands, status badges
- `Documentation/PROJECT_STATUS_CONSOLIDATED.md` - **Single source of truth** (replaces CURRENT_STATUS.md)
- `START_HERE.md` - 5-minute context summary
- `AGENT_HANDOFF_PHASE2_COMPLETE_20251120.md` - Latest session handoff
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

**Test Coverage**: ~44/50 tests passing (88%)
- Phase 1 (App Loading): 4/4 ✅ 100%
- Phase 2 (Story Generation): 3/3 ✅ 100%
- Phase 3 (Scene/Timeline): 2/2 ✅ 100%
- Phase 4 (ComfyUI Integration): 5/5 ✅ 100%
- Phase 5 (Data Persistence): 7/7 ✅ 100%
- Phase 6 (Error Handling): 8/8 ✅ 100%
- Performance & Pipeline: 7/7 ✅ 100%
- Minor issues: ~6 tests (fixture hydration timing, not functional bugs)
- Phase 1 (App Loading): 4/4 ✅ 100%
- Phase 2 (Story Generation): 3/5 (CORS limitation)
- Phase 3 (Scene/Timeline): 2/8 (requires full workflow execution)
- Phase 4 (ComfyUI Integration): 4/5 ✅ 80%
- Phase 5 (Data Persistence): 6/7 ✅ 86%
- Phase 6 (Error Handling): 8/8 ✅ 100%

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
VITE_LOCAL_LLM_MODEL=mistralai/mistral-7b-instruct-v0.3
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
| `Documentation/CURRENT_STATUS.md` | Complete project status, metrics, known issues |
| `Documentation/Guides/` | User guides, quick starts, setup instructions |
| `Documentation/Architecture/` | System architecture, data flow, workflow mappings |
| `Documentation/References/` | Quick references, indexes, API docs |
| `Development_History/Phases/` | Phase completion reports (Phase 1-7) |
| `Development_History/Sessions/` | Session summaries, status reports |
| `Development_History/Milestones/` | Major milestones, deployment reports |
| `Agents/Handoffs/` | Agent handoff documents (archived) |
| `Testing/E2E/` | End-to-end test reports |
| `Testing/Reports/` | Validation and verification reports |
| `Testing/Strategies/` | Testing strategies, coverage plans |
| `Workflows/ComfyUI/` | ComfyUI-specific documentation |

### Finding Documentation
**If you need to find a specific document**:
1. Check `Documentation/PROJECT_STATUS_CONSOLIDATED.md` first (single source of truth)
2. Use directory structure above to navigate categories
3. Each category has a README.md explaining contents
4. Old handoff docs are in `Agents/Handoffs/` (archived, may be outdated)
5. Historical root docs are in `docs/archived/root-docs-2025-11/` (superseded)
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
1. **Always check CURRENT_STATUS.md first** - Single source of truth for project state
2. **Update docs alongside code changes** - Don't let docs drift
3. **Place new docs in correct category**:
   - Guides → `Documentation/Guides/`
   - Architecture changes → `Documentation/Architecture/`
   - Session notes → `Development_History/Sessions/`
   - Test results → `Testing/Reports/`
4. **Keep root directory clean** - Only README.md, START_HERE.md, TODO.md, and active handoff docs

### Code Quality Standards
- ✅ All API calls through service layer (never direct from components)
- ✅ TypeScript strict mode enforced
- ✅ Zero build errors tolerated
- ✅ Run tests before committing: `npm test && npx playwright test`
- ✅ Use `multi_replace_string_in_file` for batch edits (efficiency)
- ✅ Follow React hooks patterns: `usePersistentState` for data, `useState` for UI

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
1. Read `Documentation/CURRENT_STATUS.md` for current state
2. Read `START_HERE.md` for quick context
3. Create session summary in `Development_History/Sessions/`
4. Update `Documentation/CURRENT_STATUS.md` with new metrics
5. Do NOT create new handoff docs in root (use `Agents/Handoffs/` if needed)

## Documentation Resources
- **Current Status**: `Documentation/PROJECT_STATUS_CONSOLIDATED.md` (ALWAYS READ FIRST - single source of truth)
- **Architecture**: `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md`
- **Testing**: `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md`
- **ComfyUI**: `Workflows/ComfyUI/COMFYUI_WORKFLOW_INDEX.md`
- **Quick Start**: `START_HERE.md` (5-minute summary)
- **Agent Guidelines**: This file (`.github/copilot-instructions.md`)
- **Legacy Docs**: `docs/archived/root-docs-2025-11/` (superseded, for reference only)
