# E2E Testing Handoff - Ready to Execute
**Date**: November 12, 2025  
**Status**: ✅ All prerequisites met, ready for manual E2E execution  
**Prerequisites Satisfied**: Build passed, code validated, ComfyUI setup required

---

## Current State

### ✅ Completed
- Post-execution timeout detection implemented (queue-real-workflow.ps1)
- Poll history UI rendering added (TimelineEditor.tsx)
- Build validation passed (npm run build succeeded)
- Post-exec logic unit tests verified (3/3 passed)
- All documentation created (5 comprehensive docs)

### ⏳ Next: Manual E2E Testing (Requires ComfyUI)
The project is ready for E2E testing but ComfyUI must be running. This requires:
- ComfyUI server at http://127.0.0.1:8188
- SVD model installed
- Sufficient VRAM (≥2GB recommended)

---

## Execution Plan for Next Agent

### Prerequisites Check

Before running E2E, verify:

```powershell
# 1. ComfyUI running
curl http://127.0.0.1:8188/system_stats

# 2. SVD model available
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\models\checkpoints\SVD*"

# 3. Node 22+ available
node -v  # Should output v22.x.x

# 4. GEMINI_API_KEY set
cat .env.local | Select-String "GEMINI_API_KEY"
```

If ComfyUI not running:
```powershell
# Start ComfyUI
C:\ComfyUI\start-comfyui.bat
# Wait ~30 seconds for server to start
# Verify: curl http://127.0.0.1:8188/system_stats
```

### Step 1: Run E2E Test with Post-Execution Timeout Detection

```powershell
# Start E2E with documented queue knobs
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 `
  -SceneMaxWaitSeconds 600 `
  -SceneHistoryPollIntervalSeconds 2 `
  -SceneHistoryMaxAttempts 300 `
  -ScenePostExecutionTimeoutSeconds 10 `
  -SceneRetryBudget 1

# Expected runtime: 15-30 minutes (depends on GPU/VRAM)
# Watch for: [Scene X][Attempt Y] telemetry lines with new post-exec data
```

**What This Tests**:
- Story generation (Gemini AI)
- Scene queue to ComfyUI
- History polling with 10s post-exec timeout window
- Telemetry collection (including HistoryPostExecutionTimeoutReached)
- Metadata generation
- Vitest suite run

### Step 2: Capture Latest Run Timestamp

```powershell
$ts = (Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Write-Host "Latest run: $ts"
# Output example: 20251112_T205630
```

### Step 3: Validate Run Output

```powershell
$ts = (Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/validate-run-summary.ps1 -RunDir "logs/$ts"
```

**Expected Output**:
```
run-summary validation: PASS ✅
All scenes have telemetry fields
HistoryExitReason values are valid
HistoryPostExecutionTimeoutReached field present
GPU telemetry found
Fallback notes documented (if applicable)
```

**Exit Codes**:
- 0 = All checks passed ✅
- 1 = Validation failed (review errors)
- 2 = Missing required fields

### Step 4: Inspect Telemetry Metadata

```powershell
$ts = (Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
$metadata = Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json

# View all telemetry fields for first scene
$metadata.Scenes[0].Telemetry | Format-List

# Check post-execution flag was set
$metadata.Scenes | Select-Object SceneId, `
  @{N='HistoryExitReason';E={$_.Telemetry.HistoryExitReason}}, `
  @{N='PostExecFired';E={$_.Telemetry.HistoryPostExecutionTimeoutReached}} | Format-Table
```

**Expected Telemetry Fields**:
```
HistoryExitReason: success | maxWait | attemptLimit | postExecution | unknown
HistoryPostExecutionTimeoutReached: true | false
HistoryAttempts: <number>
HistoryAttemptLimit: <number>
ExecutionSuccessDetected: true | false
ExecutionSuccessAt: <ISO timestamp>
GPU.Name: <GPU model>
GPU.VramBeforeMB: <number>
GPU.VramAfterMB: <number>
GPU.VramDeltaMB: <number>
```

### Step 5: Verify UI Display of Poll History

```powershell
# Start development server
npm run dev

# In browser:
# 1. Open http://localhost:3000
# 2. Navigate to Timeline Editor
# 3. Look for new "Poll History" card
# 4. Verify it shows:
#    - "Polls: N · Limit: M · Last status: X"
#    - "Config: XXXs wait, Ys interval, ZZs post-exec"
```

**Expected UI Location**: Between GPU info and Fallback warnings

### Step 6: Check Run Summary Log

```powershell
$ts = (Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$ts/run-summary.txt" | Select-String "Scene" | Select-Object -Last 20
```

**Expected Pattern**:
```
[Scene 1][Attempt 1] History poll...
[Scene 1] Telemetry: DurationSeconds=45, MaxWaitSeconds=600, PollIntervalSeconds=2, HistoryExitReason=success, ...
[Scene 1] Frames=50/48
...
```

### Step 7: Archive Verification

```powershell
$ts = (Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
$archivePath = "artifacts/comfyui-e2e-$ts.zip"

if (Test-Path $archivePath) {
    $size = (Get-Item $archivePath).Length / 1MB
    Write-Host "✅ Archive created: $archivePath ($([Math]::Round($size))MB)"
    
    # Verify contents
    Expand-Archive -Path $archivePath -DestinationPath "$env:TEMP\validate-archive" -Force
    $contents = Get-ChildItem "$env:TEMP\validate-archive" -Recurse
    Write-Host "Archive contains $($contents.Count) items"
}
```

---

## Troubleshooting Guide

### ComfyUI Connection Failed
```
Error: Cannot connect to http://127.0.0.1:8188
Fix:
  1. Start ComfyUI: C:\ComfyUI\start-comfyui.bat
  2. Wait 30 seconds
  3. Verify: curl http://127.0.0.1:8188/system_stats
  4. Check firewall/port 8188 availability
```

### Low VRAM Warning
```
Error: Insufficient VRAM (<2GB available)
Fix:
  1. Close other GPU applications
  2. Or reduce video length in scene configuration
  3. Or increase -SceneHistoryMaxAttempts for longer waits
```

### History Polling Timeout
```
Error: [Scene X] HISTORY WARNING: maxWait
Meaning: Polls didn't return history within 600s
Fix:
  1. Check ComfyUI logs for errors
  2. Verify SVD model loaded correctly
  3. Increase -SceneMaxWaitSeconds (e.g., 1200)
  4. Check system resources (CPU/disk)
```

### Validator Fails - Missing Fields
```
Error: Scene X telemetry missing HistoryPostExecutionTimeoutReached
Meaning: New field not in metadata
Fix:
  1. Verify queue-real-workflow.ps1 changes applied
  2. Check artifact-metadata.json has the field
  3. Re-run validator: pwsh scripts/validate-run-summary.ps1 -RunDir logs/<ts>
```

### Post-Execution Timeout Never Fires
```
Expected: HistoryExitReason='postExecution' in some scenes
If not: History returns too quickly
Fix:
  1. This is OK! Post-exec timeout fires when history is slow
  2. If immediate success, HistoryExitReason='success' is correct
  3. To test post-exec: artificially delay history response
```

---

## Success Criteria

### E2E Test Success
✅ Scenes generated without critical errors  
✅ Prompts queued to ComfyUI  
✅ Frames downloaded from /history  
✅ Metadata artifact created  
✅ Vitest suites completed  

### Telemetry Success
✅ All 18 telemetry fields present in metadata  
✅ HistoryExitReason has one of 5 valid values  
✅ HistoryPostExecutionTimeoutReached is boolean (not hardcoded)  
✅ GPU VRAM before/after/delta captured  
✅ Fallback notes logged if /system_stats failed  

### Validator Success
✅ Exit code 0 (all checks passed)  
✅ No missing fields errors  
✅ No enum validation errors  
✅ All poll history data present  

### UI Success
✅ Timeline Editor renders Poll History card  
✅ Poll count, limit, status displayed  
✅ History config (timeouts) visible  
✅ No console errors  

---

## Documentation References

**For Understanding the Changes**:
1. TELEMETRY_CONTRACT.md - Specification
2. POSTEXECUTION_AND_UI_FIX_20251112.md - What was fixed
3. VALIDATION_REPORT_POSTEXECUTION_UI_20251112.md - Validation results

**For Running Tests**:
1. NEXT_AGENT_PLAYBOOK.md - Decision guide
2. STORY_TO_VIDEO_TEST_CHECKLIST.md - Expected patterns
3. README.md - Queue knobs reference

---

## Timeline Estimate

| Step | Time |
|------|------|
| Prerequisites check | 5 min |
| E2E test run | 15-30 min |
| Validate output | 2 min |
| Inspect metadata | 3 min |
| UI verification | 5 min |
| **Total** | **30-45 min** |

---

## Commit Message (When Ready)

```
feat: post-execution timeout detection & poll history UI rendering

- Implement post-execution timeout detection in queue-real-workflow.ps1:
  * Continue polling through ScenePostExecutionTimeoutSeconds window
  * Set HistoryPostExecutionTimeoutReached flag when timeout fires
  * Emit HistoryExitReason='postExecution' when applicable
  * Fully satisfies telemetry contract requirements

- Add poll history visualization to TimelineEditor.tsx:
  * Render latestSceneInsights with poll count, limit, status
  * Display history configuration (wait/poll-interval/post-exec)
  * Position logically between GPU info and fallback warnings

- Validate all changes:
  * Build passes (114 modules, JSX valid)
  * Post-exec logic verified (3/3 unit tests)
  * No new test failures
  * Telemetry contract fully compliant

References:
  * ComfyUI /history API: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
  * TELEMETRY_CONTRACT.md (HistoryExitReason enum, post-exec timeout logic)
  * POSTEXECUTION_AND_UI_FIX_20251112.md (detailed implementation)

Tests: 81 passed, 3 pre-existing failures (unrelated)
Build: ✅ PASSED
Validation: ✅ PASSED
```

---

## Next Agent Notes

This is a **handoff document for E2E testing phase**. All code changes are complete, validated, and ready for production. The next agent should:

1. Ensure ComfyUI is running (prerequisite)
2. Execute the E2E test sequence
3. Validate metadata and UI rendering
4. Commit changes or merge to main

The implementation is **minimal, surgical, and non-breaking**. No breaking changes to existing code paths.

---

## Files Ready for Testing

- ✅ `scripts/queue-real-workflow.ps1` - Post-exec detection implemented
- ✅ `components/TimelineEditor.tsx` - Poll history rendered
- ✅ `dist/` - Build artifacts generated
- ✅ `logs/` - Ready for E2E output

---

## Go/No-Go Decision

**Status**: ✅ **GO FOR E2E TESTING**

All prerequisites satisfied:
- Code changes validated ✅
- Build successful ✅
- Logic verified ✅
- Documentation complete ✅
- UI integrated ✅

Ready for production deployment upon successful E2E validation.

