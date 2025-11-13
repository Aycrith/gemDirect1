# Frame Output Fix - Retest Instructions

**Date**: November 12, 2025  
**Status**: Workflow updated with Reroute node - Ready for validation

---

## CHANGES APPLIED

### Workflow Modification
- **File**: `workflows/text-to-video.json`
- **Change**: Added node 8 (Reroute) as completion signal after SaveImage
- **Reason**: Ensures ComfyUI history tracks SaveImage execution completion

### Updated Workflow Flow
```
Node 1: ImageOnlyCheckpointLoader
Node 2: LoadImage
Node 3: VideoLinearCFGGuidance
Node 4: SVD_img2vid_Conditioning
Node 5: KSampler
Node 6: VAEDecode
Node 7: SaveImage (saves frames)
Node 8: Reroute (completion signal) ← NEW
```

---

## RETEST PROCEDURE

### Step 1: Verify ComfyUI Server
```powershell
# Check if running
Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 5

# If not running, start it
C:\ComfyUI\start-comfyui.bat
```

### Step 2: Run E2E Test with Adjusted Parameters
```powershell
cd c:\Dev\gemDirect1

# Set environment variables
$env:LOCAL_STORY_PROVIDER_URL = 'http://127.0.0.1:1234/v1/chat/completions'
$env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
$env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
$env:LOCAL_LLM_SEED = '42'
$env:LOCAL_LLM_TEMPERATURE = '0.35'
$env:LOCAL_LLM_TIMEOUT_MS = '120000'

# Run E2E test with adjusted polling parameters
pwsh -NoLogo -ExecutionPolicy Bypass scripts/run-comfyui-e2e.ps1 `
  -SceneMaxWaitSeconds 600 `
  -SceneHistoryPollIntervalSeconds 1 `
  -SceneHistoryMaxAttempts 10 `
  -ScenePostExecutionTimeoutSeconds 60 `
  -SceneRetryBudget 1 `
  -UseLocalLLM `
  -LocalLLMProviderUrl 'http://127.0.0.1:1234/v1/chat/completions' `
  -LocalLLMModel 'mistralai/mistral-7b-instruct-v0.3' `
  -LocalLLMRequestFormat 'openai-chat'
```

### Step 3: Monitor Test Execution
Watch for:
- ✅ Story generation starting
- ✅ ComfyUI server starting
- ✅ Scene processing beginning
- ✅ Frame generation progress visible
- ✅ History retrieval succeeding (should see "success" status)
- ✅ Frames copied message

### Step 4: Verify Frame Output
```powershell
# Check if frames were created
Get-ChildItem "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" -Filter "gemdirect1_scene*" | Select-Object Name

# Check latest run logs
Get-ChildItem "C:\Dev\gemDirect1\logs" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1 -ExpandProperty Name
```

### Step 5: Check Test Results
```powershell
# Find latest run directory
$latestRun = (Get-ChildItem "C:\Dev\gemDirect1\logs" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1).FullName

# Check run summary
Get-Content "$latestRun\run-summary.txt" | tail -30

# Verify frames were copied
if ((Get-ChildItem "$latestRun" -Recurse -Filter "*.png" -ErrorAction SilentlyContinue).Count -gt 0) {
  Write-Host "✅ Frames successfully copied to test output"
} else {
  Write-Host "❌ No frames found in test output"
}
```

---

## EXPECTED RESULTS AFTER FIX

### Positive Indicators
- ✅ History retrieval status changes from "attemptLimit" to "success"
- ✅ Frame count shows 25 frames per scene (SVD generates 25 frames)
- ✅ "Frames=25" in scene processing log
- ✅ PNG files copied to logs/<timestamp>/ directory
- ✅ Test validation passes with "PASS" status

### Success Criteria
```
[Scene scene-001][Attempt 1] Frames=25 Duration=~30s Prefix=gemdirect1_scene-001
[Scene scene-002][Attempt 1] Frames=25 Duration=~30s Prefix=gemdirect1_scene-002
[Scene scene-003][Attempt 1] Frames=25 Duration=~30s Prefix=gemdirect1_scene-003
Scene summary: 3/3 succeeded | total frames=75
run-summary validation: PASS
```

---

## TROUBLESHOOTING

### If Frames Still Not Generated
1. **Check ComfyUI output directory exists**:
   ```powershell
   Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
   ```

2. **Check ComfyUI logs for errors**:
   ```powershell
   Get-Content "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\user\comfyui.log" -Tail 50
   ```

3. **Verify workflow JSON syntax**:
   ```powershell
   $json = Get-Content "c:\Dev\gemDirect1\workflows\text-to-video.json" | ConvertFrom-Json
   $json | ConvertTo-Json  # Should not error
   ```

4. **Try manual ComfyUI workflow**:
   - Open ComfyUI in browser
   - Manually load text-to-video.json
   - Test with a simple image

### If History Still Times Out
1. Increase `SceneHistoryMaxAttempts` to 20
2. Decrease `SceneHistoryPollIntervalSeconds` to 0.5
3. Increase `ScenePostExecutionTimeoutSeconds` to 120

### If Test Still Fails
Revert to previous workflow and try Option 2 or 3 from analysis doc.

---

## PARAMETERS EXPLAINED

| Parameter | Value | Reason |
|-----------|-------|--------|
| SceneHistoryMaxAttempts | 10 | More attempts to find completion (was 3) |
| SceneHistoryPollIntervalSeconds | 1 | Poll faster for quicker detection (was 2) |
| ScenePostExecutionTimeoutSeconds | 60 | More time for SaveImage to complete (was 30) |
| SceneRetryBudget | 1 | Automatic retry if first attempt fails |

---

## AFTER SUCCESSFUL RETEST

1. Run full Windows test suite again
2. Update test results document
3. Mark infrastructure as 15/15 (100%) ✅
4. Archive final test results
5. Complete test submission package

---

**Next**: Execute Step 2 to begin retest with fixed workflow.
