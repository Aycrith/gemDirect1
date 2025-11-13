# Windows-Agent E2E Test Execution Checklist

**Session Date**: November 11, 2025  
**Agent**: Windows-Agent Testing Iteration  
**Environment**: Node v22.19.0 | PowerShell 7.5.3 | ComfyUI v0.3.68 (running)

---

## Pre-Execution Validation

### ✓ Environment Checks (COMPLETE)
- [x] Node.js v22.19.0 verified
- [x] PowerShell 7.5.3 (Core) verified
- [x] ComfyUI server running (PID 7388, port 8188 open)
- [x] Input/output directories writable
- [ ] **SVD Model Present** ← **BLOCKER** (see below)

### 🔴 Critical Blocker: SVD Model

**Status**: Missing (~2.5 GB)  
**Location**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors`  
**Resolution**: Download using provided helper script

#### Option A: Quick Check (No Download)
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1
```

**Output** (expected):
```
[HH:mm:ss] ⚠️  SVD model NOT found at: C:\ComfyUI\...
[HH:mm:ss] ⚠️  Download flag is OFF. To download SVD model, run:
  pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

#### Option B: Download SVD Model (REQUIRED Before Tests)
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
```

**Expected Duration**: 15-30 minutes (depends on network speed)

**Output** (expected on success):
```
[HH:mm:ss] ✓ SVD model downloaded successfully!
[HH:mm:ss] ✓ Location: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors
[HH:mm:ss] ✓ Size: 2.45 GB
[HH:mm:ss] ✓ Ready to run E2E tests. Execute:
  pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

---

## Main E2E Test Execution

### Pre-Run Final Checks
```powershell
# 1. Verify SVD is in place
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"
# Expected: True

# 2. Verify ComfyUI is still running
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188
# Expected: TcpTestSucceeded = True

# 3. Clean old logs (optional, to reduce clutter)
Remove-Item -Path "logs/*" -Recurse -Force -ErrorAction SilentlyContinue -Confirm:$false
```

### Execute Full E2E Suite
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

**Expected Duration**: 10-20 minutes  
- Story generation: ~30-60 seconds
- Scene 1 inference: ~3-5 minutes (25 frames)
- Scene 2 inference: ~3-5 minutes (25 frames)
- Scene 3 inference: ~3-5 minutes (25 frames)
- Vitest suites: ~1-2 minutes
- Archiving: ~30 seconds

**Expected Success Criteria**:
- Exit code = 0
- No red "ERROR" lines in terminal
- Log files created in `logs/{timestamp}/`

---

## Post-Execution Analysis

### Step 1: Capture Latest Run Timestamp
```powershell
$timestamp = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Write-Host "Latest run timestamp: $timestamp"
```

### Step 2: Review Run Summary
```powershell
$summaryFile = "logs/$timestamp/run-summary.txt"
Write-Host "=== Run Summary (first 50 lines) ==="
Get-Content $summaryFile | Select-Object -First 50

Write-Host ""
Write-Host "=== Run Summary (last 30 lines) ==="
Get-Content $summaryFile | Select-Object -Last 30
```

**Look for**:
- ✓ `Story ready: ... (scenes=3)` → Story generation succeeded
- ✓ `ComfyUI ready after X seconds` → Server initialization time
- ✓ `[Scene scene_1][Attempt 1] Frames=25 Duration=...` → Per-scene results
- ⚠️ `HISTORY WARNING` → History polling issues (non-fatal if frames present)
- ❌ `ERROR` → Critical failures (fatal if present)
- ✓ `[Validation] run-summary validation passed` → All checks passed

### Step 3: Verify Frame Generation
```powershell
$totalFrames = 0
for ($i = 1; $i -le 3; $i++) {
    $frameDir = "logs/$timestamp/scene_$i/generated-frames"
    $frameCount = @(Get-ChildItem $frameDir -File 2>/dev/null).Count
    Write-Host "Scene $i: $frameCount frames"
    $totalFrames += $frameCount
}
Write-Host ""
Write-Host "Total frames generated: $totalFrames / 75 expected"
```

**Expected Output**:
```
Scene 1: 25 frames
Scene 2: 25 frames
Scene 3: 25 frames

Total frames generated: 75 / 75 expected
```

### Step 4: Review Artifact Metadata
```powershell
$metadataFile = "logs/$timestamp/artifact-metadata.json"
$metadata = Get-Content $metadataFile | ConvertFrom-Json

Write-Host "=== Story Info ==="
Write-Host "Story ID: $($metadata.Story.Id)"
Write-Host "Logline: $($metadata.Story.Logline)"
Write-Host "Scenes in story: $($metadata.Story.SceneCount)"

Write-Host ""
Write-Host "=== Scene Results ==="
$metadata.Scenes | ForEach-Object {
    $status = if ($_.Success) { "✓" } else { "❌" }
    $history = if ($_.HistoryRetrieved) { "✓" } else { "❌" }
    Write-Host "$status Scene $($_.SceneId): Frames=$($_.FrameCount)/25 | History=$history | Attempts=$($_.AttemptsRun)"
}

Write-Host ""
Write-Host "=== Vitest Results ==="
$vitestResults = Get-Content "logs/$timestamp/vitest-results.json" | ConvertFrom-Json
Write-Host "ComfyUI Tests: $($vitestResults.comfyExit)"
Write-Host "E2E Tests: $($vitestResults.e2eExit)"
Write-Host "Scripts Tests: $($vitestResults.scriptsExit)"
```

**Expected Output**:
```
=== Story Info ===
Story ID: story-20251111-HHMMSS
Logline: A cinematic narrative exploring...
Scenes in story: 3

=== Scene Results ===
✓ Scene scene_1: Frames=25/25 | History=✓ | Attempts=1
✓ Scene scene_2: Frames=25/25 | History=✓ | Attempts=1
✓ Scene scene_3: Frames=25/25 | History=✓ | Attempts=1

=== Vitest Results ===
ComfyUI Tests: 0
E2E Tests: 0
Scripts Tests: 0
```

### Step 5: Check Vitest Logs (If Tests Failed)
```powershell
$logFile = "logs/$timestamp/vitest-comfyui.log"  # or vitest-e2e.log or vitest-scripts.log
Write-Host "=== Last 100 lines of test log ==="
Get-Content $logFile | Select-Object -Last 100
```

### Step 6: Verify Artifact Archive
```powershell
$archiveFile = "artifacts/comfyui-e2e-$timestamp.zip"
if (Test-Path $archiveFile) {
    $archiveSize = (Get-Item $archiveFile).Length / 1MB
    Write-Host "✓ Archive created: $archiveFile ($([Math]::Round($archiveSize, 2)) MB)"
} else {
    Write-Host "❌ Archive not found: $archiveFile"
}
```

---

## Success Criteria Validation

Use this table to validate the run meets all success criteria:

| Criterion | Check Command | Expected | Actual | ✓/❌ |
|-----------|---------------|----------|--------|------|
| **Exit Code** | Last line of terminal | `0` | ? | |
| **Scenes Generated** | `$metadata.Story.SceneCount` | `3` | ? | |
| **Total Frames** | Frame count above | `75` | ? | |
| **Scene 1 Success** | `$metadata.Scenes[0].Success` | `True` | ? | |
| **Scene 2 Success** | `$metadata.Scenes[1].Success` | `True` | ? | |
| **Scene 3 Success** | `$metadata.Scenes[2].Success` | `True` | ? | |
| **History Retrieved** | `$metadata.Scenes[*].HistoryRetrieved` | All `True` | ? | |
| **ComfyUI Tests** | `$vitestResults.comfyExit` | `0` | ? | |
| **E2E Tests** | `$vitestResults.e2eExit` | `0` | ? | |
| **Scripts Tests** | `$vitestResults.scriptsExit` | `0` | ? | |
| **Validation Passed** | `run-summary.txt` contains | `validation passed` | ? | |

### Overall Status
- **All ✓**: Run PASSED ✓
- **Any ❌**: Review troubleshooting section below

---

## Troubleshooting Guide

### Issue: Frames < 25 Per Scene

**Symptoms**:
- `Frames=15` or `Frames=20` (less than 25) in artifact metadata
- Video inference incomplete

**Root Causes**:
1. SVD inference timeout (GPU too slow)
2. ComfyUI queue congestion
3. Output directory mismatch

**Investigation**:
```powershell
# Check history poll timeline
$metadata = Get-Content "logs/$timestamp/artifact-metadata.json" | ConvertFrom-Json
$scene1 = $metadata.Scenes[0]
Write-Host "Scene 1 history poll attempts: $($scene1.HistoryAttempts)"
Write-Host "Poll log:"
$scene1.HistoryPollLog | ForEach-Object { Write-Host "  $_" }
```

**Solutions**:
1. If GPU is slow, re-run with patience (allow extra time):
   - Edit `queue-real-workflow.ps1` line ~100: Change `$sceneMaxWait = 600` to `900` (15 minutes)
   
2. Check where ComfyUI saved frames:
   ```powershell
   $scene1 = $metadata.Scenes[0]
   Write-Host "Output directories scanned: $($scene1.OutputDirsScanned -join ', ')"
   
   # Look for frames manually
   ls "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" -Recurse -Filter "*scene_1*" -File
   ```

3. If frames exist but weren't collected:
   - Report issue with output path matching in `queue-real-workflow.ps1`

### Issue: History Retrieval Failed

**Symptoms**:
- `HistoryRetrieved=False` in artifact metadata
- `HistoryError` field contains error message
- Run summary shows `HISTORY WARNING`

**Root Causes**:
1. ComfyUI crashed or stopped responding
2. Prompt ID not found in history
3. Network timeout

**Investigation**:
```powershell
$scene1 = $metadata.Scenes[0]
Write-Host "History error: $($scene1.HistoryError)"
Write-Host "Prompt ID: $($scene1.PromptId)"
Write-Host "History attempts: $($scene1.HistoryAttempts)"
```

**Solutions**:
1. Verify ComfyUI is still running:
   ```powershell
   Test-NetConnection -ComputerName 127.0.0.1 -Port 8188
   Get-Process | Where-Object { $_.ProcessName -eq 'python' }
   ```

2. If ComfyUI crashed, restart it:
   ```powershell
   # Via VS Code task (preferred)
   # Press Ctrl+Shift+P → Tasks: Run Task → Restart ComfyUI Server
   
   # Or via PowerShell
   Get-Process | Where-Object { $_.Path -like '*ComfyUI*' } | Stop-Process -Force
   Start-Sleep -Seconds 3
   # Then start it again using VS Code task or directly
   ```

3. Re-run the E2E suite after ComfyUI restart

### Issue: Vitest Exit Code ≠ 0

**Symptoms**:
- `comfyExit` or `e2eExit` ≠ 0 in vitest-results.json
- Test suite failed

**Investigation**:
```powershell
# Check test logs for actual failures
$testLog = "logs/$timestamp/vitest-comfyui.log"
Get-Content $testLog | Select-Object -Last 50
```

**Common Causes**:
1. Missing test files in `src/tests/`
2. Mock setup incomplete for ComfyUI API
3. Test timeout (scenes took too long)
4. Assertion failure

**Solutions**:
1. Review error message in test log
2. Check if `src/tests/comfyui.test.ts` exists:
   ```powershell
   Test-Path "src/tests/comfyui.test.ts"
   ```
3. If file is missing, tests might be skipped (not a failure)
4. If assertion failed, check test output for expected vs actual

### Issue: ComfyUI Never Ready

**Symptoms**:
- Run stops with error: "ComfyUI never became ready"
- ComfyUI process doesn't start

**Root Causes**:
1. Python not found
2. ComfyUI directory doesn't exist
3. Port 8188 already in use

**Investigation**:
```powershell
# Check Python
"C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe" --version

# Check ComfyUI directory
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\main.py"

# Check port
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188
netstat -ano | findstr :8188
```

**Solutions**:
1. If Python not found: Re-run ComfyUI installation script
2. If ComfyUI dir missing: Restore from backup or reinstall
3. If port in use: Kill process on 8188
   ```powershell
   Get-Process | Where-Object { $_.Name -eq 'python' } | Stop-Process -Force
   ```

### Issue: "SVD Model Missing" Error

**Symptoms**:
- Run fails immediately with: "Checkpoint not found: SVD/svd_xt.safetensors"
- Workflow load fails

**Solution**:
This is the BLOCKER identified earlier. Download the model:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true
# Wait 15-30 minutes for download to complete
```

---

## Documentation & Reporting

### Create Test Report
After successful run, create markdown report:

```markdown
# E2E Test Execution Report - November 11, 2025

## Run Details
- **Timestamp**: {from logs directory}
- **Duration**: {calculated from run-summary}
- **Node Version**: v22.19.0
- **PowerShell**: 7.5.3
- **ComfyUI**: v0.3.68

## Results Summary
| Metric | Value |
|--------|-------|
| Total Scenes | 3 |
| Scenes Successful | 3/3 ✓ |
| Total Frames | 75/75 ✓ |
| ComfyUI Tests | PASS ✓ |
| E2E Tests | PASS ✓ |
| Overall | SUCCESS ✓ |

## Key Findings
- [List any interesting observations]

## Artifacts
- Run logs: `logs/{timestamp}/`
- Metadata: `logs/{timestamp}/artifact-metadata.json`
- Archive: `artifacts/comfyui-e2e-{timestamp}.zip`
- Public snapshot: `public/artifacts/latest-run.json`
```

### Upload Artifacts
```powershell
$timestamp = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
$archivePath = "artifacts/comfyui-e2e-$timestamp.zip"

Write-Host "Archive ready for download:"
Write-Host "  $archivePath"
Write-Host ""
Write-Host "Latest run snapshot (for dashboard):"
Write-Host "  public/artifacts/latest-run.json"
```

---

## Next Steps After Successful Run

1. **Commit Results** (if using Git):
   ```powershell
   git add logs/$timestamp/artifact-metadata.json public/artifacts/latest-run.json
   git commit -m "E2E test run: $timestamp - 3 scenes, 75 frames generated, all tests passed"
   git push
   ```

2. **Archive Old Logs** (keep workspace clean):
   ```powershell
   $oldLogs = Get-ChildItem -Path "logs" -Directory | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }
   foreach ($log in $oldLogs) {
       Compress-Archive -Path $log.FullName -DestinationPath "archived-logs\$($log.Name).zip" -Force
       Remove-Item -Path $log.FullName -Recurse -Force
   }
   ```

3. **Plan Next Iteration**:
   - Run with LLM enhancement for better story quality
   - Test with different scene count (5-10 scenes)
   - Measure GPU memory and performance metrics
   - Validate video output quality in browser

---

## Quick Reference Commands

```powershell
# Check SVD model status
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1

# Download SVD model (BLOCKING STEP)
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/verify-svd-model.ps1 -Download $true

# Run full E2E test suite (after SVD is in place)
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1

# View latest run summary
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name; Get-Content "logs/$ts/run-summary.txt"

# View latest metadata
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name; Get-Content "logs/$ts/artifact-metadata.json" | ConvertFrom-Json | Format-Table

# Check latest archive
$ts = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name; ls "artifacts/comfyui-e2e-$ts.zip"

# Restart ComfyUI if needed
Get-Process | Where-Object { $_.Path -like '*ComfyUI*python*' } | Stop-Process -Force; Start-Sleep -Seconds 2; & "C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe" -s "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\main.py" --windows-standalone-build --listen 0.0.0.0 --port 8188 --enable-cors-header "*"
```

---

**Checklist Status**: Ready for SVD download and E2E test execution  
**Last Updated**: November 11, 2025 | **Next Review**: After SVD model download completion
