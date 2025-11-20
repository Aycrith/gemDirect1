# Next-Agent Playbook & Documentation Reading Order

**Version**: 1.0  
**Date**: November 12, 2025  
**Status**: Active Implementation  
**Purpose**: Ensure every new agent understands the telemetry contract, queue policy enforcement, and LM Studio health checks before editing code.

---

## Quick Start for Next Agent

You're about to work on gemDirect1 (AI story → ComfyUI video helper). Before editing **any script or UI component**, read these docs **in this exact order**:

### Phase 1: Foundation (Telemetry & Queue Contract) - 30 minutes
1. **TELEMETRY_CONTRACT.md** ← START HERE
   - Defines every telemetry field (DurationSeconds, MaxWaitSeconds, HistoryExitReason, GPU VRAM deltas, etc.)
   - Maps queue policy knobs to CLI params, env vars, metadata fields, and UI display
   - Explains exit reason values, fallback handling, and LM Studio health check contract
   - External references (ComfyUI /history API, LM Studio /v1/models)

2. **README.md** (Lines 1-86, especially sections on "Local LLM requirements", "Queue knobs", and "Automated ComfyUI E2E")
   - Overview of the entire system
   - How to set up local LLM (LM Studio) with health checks and fallbacks
   - CLI invocation with queue knob parameters

### Phase 2: Architecture & Implementation (Story-to-Video Flow) - 20 minutes
3. **STORY_TO_VIDEO_PIPELINE_PLAN.md**
   - How story generation integrates with ComfyUI
   - Workflow placeholder injection (keyframes, prompts)
   - History polling state machine (follows ComfyUI /history spec)
   - Telemetry capture points and structure
   - Lessons learned on telemetry field consistency

4. **WORKFLOW_FIX_GUIDE.md**
   - Workflow node structure and what each node does
   - How prompts and keyframes are wired into the pipeline
   - If you need to modify workflows or add new models

### Phase 3: Testing & Validation (Verification Strategy) - 20 minutes
5. **STORY_TO_VIDEO_TEST_CHECKLIST.md**
   - Expected `run-summary.txt` structure
   - Validation commands (running the helper, checking artifacts)
   - Failure protocols (requeue guidance, history warning requirements)
   - How to interpret error messages

6. **WINDOWS_AGENT_TEST_ITERATION_PLAN.md** (if on Windows)
   - Environment verification checklist
   - Queue policy + telemetry enforcement requirements
   - Common issues and troubleshooting

### Phase 4: Handoff & Session Context - 15 minutes
7. **HANDOFF_SESSION_NOTES.md**
   - What decisions were made and why
   - Current implementation status (✅ vs ⚠️)
   - Links to key sections covering health checks, queue knobs, telemetry

8. **notes/codex-agent-notes-20251111.md**
   - Agent-specific context and findings
   - Known gotchas and workarounds

---

## What You'll Do After Reading

### If Adding a New Feature
1. Identify which telemetry field(s) need capturing
2. Add collection in `scripts/queue-real-workflow.ps1` 
3. Log the value to `run-summary.txt` in `scripts/run-comfyui-e2e.ps1`
4. Add validator checks in `scripts/validate-run-summary.ps1`
5. Add Vitest test coverage in `scripts/__tests__/validateRunSummary.test.ts`
6. Create/update UI component to display the value
7. Update TELEMETRY_CONTRACT.md with the new field definition
8. Update this playbook if the reading order changes

### If Fixing a Bug
1. Check TELEMETRY_CONTRACT.md to understand the affected field's source and purpose
2. Verify your fix doesn't break telemetry field consistency (ensure summary line matches metadata JSON)
3. Run validator: `pwsh scripts/validate-run-summary.ps1 -RunDir logs/<latest>`
4. Run Vitest: `pwsh scripts/run-vitests.ps1` (with --pool=vmThreads on Windows)
5. Manually verify UI displays the corrected value
6. Document your fix in the TELEMETRY_CONTRACT.md external references or assumptions

### If Integrating UI Components
1. Read about metadata structure in TELEMETRY_CONTRACT.md (Artifact Metadata Structure section)
2. Use the new `useArtifactMetadata()` hook (when available) to fetch both artifact files
3. Display queue policy card with knobs (SceneRetryBudget, HistoryMaxWaitSeconds, etc.)
4. Display telemetry badges (DurationSeconds, MaxWaitSeconds, pollLimit, HistoryExitReason, GPU VRAM delta, etc.)
5. Show fallback notes as warnings if System.FallbackNotes array is not empty
6. Link to archive and Vitest logs
7. Test by opening http://localhost:3000 after a test run and verifying values match `public/artifacts/latest-run.json`

---

## Key Concepts to Remember

### Queue Policy Knobs
- **SceneMaxWaitSeconds** (600s default) - how long to keep polling /history
- **SceneHistoryMaxAttempts** (0 = unbounded) - max polls; 0 means no limit
- **SceneHistoryPollIntervalSeconds** (2s default) - sleep between polls
- **ScenePostExecutionTimeoutSeconds** (30s default) - wait after execution_success flag
- **SceneRetryBudget** (1 default) - auto-retry allowance (1 = try twice total)

All flow through: CLI → script param → artifact metadata → UI display

### Telemetry Exit Reasons
Per ComfyUI `/history` API spec:
- **"success"** - Got results from /history
- **"maxWait"** - Time budget exhausted
- **"attemptLimit"** - Poll attempts exhausted
- **"postExecution"** - Hit post-exec timeout
- **"unknown"** - Unexpected (shouldn't happen)

Validator checks HistoryExitReason is one of these values.

### GPU/VRAM Telemetry
- Fetched from `/system_stats` response (devices[*].vram_free)
- Converted to MB: `bytes / 1048576`
- Delta computed: `after_mb - before_mb` (negative = memory used)
- If `/system_stats` fails → fallback to `nvidia-smi` → record in System.FallbackNotes
- Validator allows null VRAM if fallback is documented

### LM Studio Health Check
- URL: `/v1/models` (configurable via LOCAL_LLM_HEALTHCHECK_URL)
- Runs before ComfyUI launches
- 5-second timeout
- Can skip with LOCAL_LLM_SKIP_HEALTHCHECK=1
- Failure causes immediate exit (unless skipped)
- Success/failure logged in run-summary.txt and artifact-metadata.json

### Validator Enforcement
Run: `pwsh scripts/validate-run-summary.ps1 -RunDir logs/<timestamp>`
Checks:
- All telemetry fields present in metadata
- Exit reason is valid enum value
- pollLimit text matches metadata HistoryAttemptLimit
- SceneRetryBudget appears in telemetry line
- Fallback notes in metadata appear in summary line
- GPU VRAM before/after/delta all present

### Vitest Test Pool
Windows ComfyUI tests MUST use `--pool=vmThreads` (avoids fork/thread timeouts):
```powershell
node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/comfyUIService.test.ts
```

---

## External References (Cited in Code)

| Resource | URL | Why It Matters | Where Cited |
|----------|-----|---|---|
| ComfyUI WebSocket API Example | https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py | Defines /history response, execution_success signal, status flow | queue-real-workflow.ps1:106, TELEMETRY_CONTRACT.md |
| LM Studio API Health Checks | https://lmstudio.ai/docs/api#health-checks | `/v1/models` endpoint, override patterns | run-comfyui-e2e.ps1:61-62, TELEMETRY_CONTRACT.md |
| NVIDIA nvidia-smi | Official docs | Fallback GPU stats when /system_stats unavailable | queue-real-workflow.ps1:257 |

---

## File Dependency Graph

```
TELEMETRY_CONTRACT.md (spec)
    ↓
[scripts/queue-real-workflow.ps1] (capture telemetry)
    ↓ 
[scripts/run-comfyui-e2e.ps1] (log to summary + metadata)
    ↓
├── run-summary.txt (human readable)
├── artifact-metadata.json (machine readable)
└── public/artifacts/latest-run.json (UI snapshot)
    ↓
[scripts/validate-run-summary.ps1] (cross-check)
[scripts/__tests__/validateRunSummary.test.ts] (Vitest coverage)
[UI components] (display metadata)
```

---

## Common Workflows

### Run a Full E2E Test
```powershell
# Set LM Studio env vars (optional, for local story generation)
$env:LOCAL_STORY_PROVIDER_URL = 'http://192.168.50.192:1234/v1/chat/completions'
$env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
$env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'

# Run the helper with queue knob overrides
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 `
  -SceneMaxWaitSeconds 600 `
  -SceneHistoryPollIntervalSeconds 2 `
  -SceneHistoryMaxAttempts 300 `
  -ScenePostExecutionTimeoutSeconds 30 `
  -SceneRetryBudget 1

# Check results
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$ts/run-summary.txt" | Select-Object -Last 50
```

### Validate a Run
```powershell
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/validate-run-summary.ps1 -RunDir "logs/$ts"
```

### Run Unit Tests
```powershell
# Test suite with vmThreads pool (Windows)
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-vitests.ps1

# Or manually
node ./node_modules/vitest/vitest.mjs run --pool=vmThreads scripts/__tests__
```

### Check Latest Artifacts
```powershell
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
$metadata = Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json
$metadata.Scenes | Select-Object SceneId, FrameCount, Success, Telemetry | Format-Table
```

---

## Debugging Guide

### Telemetry Fields Missing from run-summary.txt

**Symptom**: Validator fails with "Scene X telemetry missing DurationSeconds"

**Root Cause**: The telemetry object in queue script isn't being populated

**Fix**:
1. Check `scripts/queue-real-workflow.ps1` lines 265-295 for $telemetry object creation
2. Verify all field names match TELEMETRY_CONTRACT.md exactly
3. Run one scene manually to debug: inspect `logs/<ts>/<sceneId>/scene.json` and `artifact-metadata.json`
4. If field is missing entirely, add it to queue script AND to runner's telemetry logging code (run-comfyui-e2e.ps1:488-543)

### pollLimit Mismatch

**Symptom**: Validator fails with "Scene X telemetry pollLimit (150) does not match metadata (unbounded)"

**Root Cause**: run-comfyui-e2e.ps1 telemetry logging doesn't match metadata value

**Fix**:
1. Check run-comfyui-e2e.ps1 lines 501-502 where pollLimit is computed:
   ```powershell
   $pollLimitValue = if ($result.Telemetry.HistoryAttemptLimit -gt 0) { $result.Telemetry.HistoryAttemptLimit } else { 'unbounded' }
   ```
2. Verify HistoryAttemptLimit in metadata matches the CLI param passed to queue script
3. Ensure queue script got the correct MaxAttemptCount parameter from runner

### GPU/VRAM Telemetry Empty

**Symptom**: Validator fails with "Scene X telemetry missing GPU name"

**Root Cause**: /system_stats call failed and no fallback occurred

**Fix**:
1. Verify ComfyUI is running: `Invoke-RestMethod http://127.0.0.1:8188/system_stats`
2. Check if System.FallbackNotes has the error message
3. If fallback to nvidia-smi needed, ensure nvidia-smi is in PATH on your system
4. If no nvidia-smi available, validator should pass if fallback notes document the issue

### History Never Retrieved

**Symptom**: HistoryRetrieved = false, scene has 0 frames

**Root Cause**: /history calls never returned results

**Debug Steps**:
1. Check `logs/<ts>/<sceneId>/history.json` - should exist and contain results
2. If empty, /history never populated - check ComfyUI logs for errors
3. Review HistoryPollLog in artifact metadata to see each poll attempt's status
4. If MaxWaitSeconds is too short, increase it: `-SceneMaxWaitSeconds 900`
5. Check HistoryExitReason - if "maxWait", poll timeout was hit

---

## Success Checklist for Any Change

Before submitting code:
- [ ] All telemetry fields are consistent (metadata JSON = run-summary.txt = UI display)
- [ ] Validator passes: `pwsh scripts/validate-run-summary.ps1 -RunDir logs/<latest>`
- [ ] Vitest passes: `pwsh scripts/run-vitests.ps1` (with --pool=vmThreads if on Windows)
- [ ] Updated TELEMETRY_CONTRACT.md if adding new telemetry field
- [ ] Updated relevant docs (README.md, HANDOFF_SESSION_NOTES.md, etc.)
- [ ] UI displays the new data correctly (if applicable)
- [ ] External reference URLs are cited in comments and docs (if using new APIs)
- [ ] Fallback behavior is documented (what happens when primary method fails?)

---

## Quick Reference Card

**Queue Policy Knob Defaults**:
```powershell
SceneMaxWaitSeconds = 600          # 10 min timeout
SceneHistoryMaxAttempts = 0        # unbounded polls
SceneHistoryPollIntervalSeconds = 2 # poll every 2s
ScenePostExecutionTimeoutSeconds = 30 # wait 30s after success
SceneRetryBudget = 1               # try twice total
```

**Required Telemetry Fields**:
```
DurationSeconds | MaxWaitSeconds | PollIntervalSeconds | HistoryAttempts | 
HistoryAttemptLimit | pollLimit (text) | HistoryExitReason | ExecutionSuccessDetected | 
ExecutionSuccessAt | PostExecutionTimeoutSeconds | SceneRetryBudget | 
GPU.Name | GPU.VramBeforeMB | GPU.VramAfterMB | GPU.VramDeltaMB | 
System.FallbackNotes (array)
```

**LM Studio Health Check**:
```
URL: {BASE_URL}/v1/models
Timeout: 5 seconds
Override: LOCAL_LLM_HEALTHCHECK_URL
Skip: LOCAL_LLM_SKIP_HEALTHCHECK=1
```

**Validator Command**:
```powershell
pwsh scripts/validate-run-summary.ps1 -RunDir logs/{LATEST_TIMESTAMP}
```

**Vitest Command**:
```powershell
pwsh scripts/run-vitests.ps1  # Uses --pool=vmThreads automatically
```

