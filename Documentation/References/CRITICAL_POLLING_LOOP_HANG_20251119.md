# CRITICAL ISSUE: Polling Loop Hang - November 19, 2025

## Executive Summary

**Status**: Process isolation implemented but **FAILED** - deeper issue in polling loop

**Critical Finding**: Video files generate successfully, but the WAN script polling loop fails to detect them and hangs indefinitely (~8+ minutes instead of exiting after finding the file).

## Test Evidence

### Run: 20251119-192607 (Process Isolation Test)

**Timeline**:
- 19:26:06: WAN isolated process started (PID: 21988)
- 19:26:10: Prompt queued successfully (ID: d79cde79-aaa8-4fb5-96c8-87674b23fd28)
- 19:26:10: Polling started
- **19:29:38-19:29:40: VIDEO CREATED** (`scene-001_00001_.mp4`, 0.33 MB)
- 19:34:06: Process STILL RUNNING (8 minutes, 464 seconds)
- Process eventually completed/terminated but never logged video detection

**Critical observations**:
1. ✅ Video file created successfully after ~3.5 minutes
2. ✅ File pattern matches correctly: `video\scene-001_*.mp4` finds `scene-001_00001_.mp4`
3. ❌ Polling loop never detected the file
4. ❌ Process ran for 8+ minutes (should exit immediately after finding video)
5. ❌ No error messages logged

## Root Cause Analysis

### What's Working ✅
- Story generation
- Keyframe generation and upload
- Prompt queuing to ComfyUI
- **Video generation in ComfyUI** (confirmed multiple times)
- File pattern matching (verified manually)
- Process isolation architecture

### What's Broken ❌

**The polling loop in `generate-scene-videos-wan2.ps1` (lines 456-540)** has a critical bug that prevents video detection even though:
- The file exists
- The pattern matches
- The file size is valid (> 10KB)

**Suspected causes** (in order of likelihood):

1. **`Check-PromptStatus` blocking indefinitely**
   - Line 520: `$status = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $promptId`
   - Function has 5-second timeout, but might be called in a way that blocks
   - PowerShell's `Invoke-RestMethod` can sometimes ignore timeouts in certain conditions

2. **Silent exception in try-catch block**
   - Lines 468-506: Large try-catch block
   - Exception message logged with `Write-Warning` but script continues
   - If exception happens on every iteration, file never gets detected

3. **Variable scope issue with `$videoFound`**
   - Set inside nested loops/try-catch
   - Might not propagate correctly to outer while condition

4. **Race condition with file system**
   - File created but not immediately readable
   - `Get-ChildItem` returns file but `Copy-Item` fails silently
   - Validation checks fail unexpectedly

## Evidence Supporting Cause #1 (Check-PromptStatus)

When I manually tested the file pattern:
```powershell
$pattern = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-001_*.mp4"
Get-ChildItem -Path $pattern  # Returns 1 file immediately
```

This proves the `Get-ChildItem` call works. So the issue must be AFTER this check or in the `Check-PromptStatus` function that's called on EVERY iteration (line 520).

## Failed Attempts

### Attempt 1: Disable Background VRAM Job
**Result**: No change - issue persists

### Attempt 2: Process Isolation
**Implementation**:
- Added `-SceneFilter` parameter to WAN script
- Modified E2E to call WAN separately for each scene with fresh process
- Added garbage collection between scenes

**Result**: No change - polling loop still hangs within isolated process

### Attempt 3: Verbose Logging
**Implementation**:
- Added progress logging every 30 seconds (line 449-451)
- Logged "Polling elapsed: Xs / 360s"

**Result**: Only shows "0s / 360s" - loop never progresses past first iteration

## Recommended Fix

### Option A: Remove Check-PromptStatus from polling loop (Quick Fix - 15 min)

The `Check-PromptStatus` call is defensive (detecting errors early) but not critical for basic functionality. The video file check is sufficient.

**Implementation**:
```powershell
# COMMENT OUT lines 519-532 (Check-PromptStatus logic)
# OR move it outside the inner while loop (check every 30s instead of every 1s)

# Keep only:
while ($elapsed -lt $MaxWaitSeconds -and -not $videoFound) {
    # Check for video file
    $generatedVideos = @(Get-ChildItem -Path $sceneVideoSourcePattern -ErrorAction SilentlyContinue)
    if ($generatedVideos.Count -gt 0) {
        # Copy and validate (existing logic)
        ...
    }
    
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval
}
```

**Time estimate**: 15 minutes  
**Success probability**: 70%

### Option B: Add comprehensive error trapping (Diagnostic Fix - 1 hour)

Add detailed logging and error handling to identify exact failure point:

**Implementation**:
```powershell
while ($elapsed -lt $MaxWaitSeconds -and -not $videoFound) {
    try {
        Write-Host "[$sceneId] [DEBUG] Iteration start: elapsed=${elapsed}s" -ForegroundColor Magenta
        
        # File check with verbose logging
        Write-Host "[$sceneId] [DEBUG] Checking pattern: $sceneVideoSourcePattern" -ForegroundColor Magenta
        $generatedVideos = @(Get-ChildItem -Path $sceneVideoSourcePattern -ErrorAction Stop)
        Write-Host "[$sceneId] [DEBUG] Found $($generatedVideos.Count) videos" -ForegroundColor Magenta
        
        if ($generatedVideos.Count -gt 0) {
            Write-Host "[$sceneId] [DEBUG] Starting copy process..." -ForegroundColor Magenta
            # ... existing copy logic with more logging ...
        }
        
        # Status check with error handling
        Write-Host "[$sceneId] [DEBUG] Checking prompt status..." -ForegroundColor Magenta
        try {
            $status = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $promptId
            Write-Host "[$sceneId] [DEBUG] Status: $($status.status)" -ForegroundColor Magenta
        } catch {
            Write-Warning "[$sceneId] [DEBUG] Check-PromptStatus failed: $_"
            # Continue anyway - don't let status check break polling
        }
        
        Write-Host "[$sceneId] [DEBUG] Sleeping ${pollInterval}s..." -ForegroundColor Magenta
        Start-Sleep -Seconds $pollInterval
        $elapsed += $pollInterval
        Write-Host "[$sceneId] [DEBUG] Iteration end: elapsed=${elapsed}s" -ForegroundColor Magenta
        
    } catch {
        Write-Error "[$sceneId] [DEBUG] FATAL ERROR in polling loop: $_"
        Write-Error "[$sceneId] [DEBUG] Stack trace: $($_.ScriptStackTrace)"
        throw
    }
}
```

**Time estimate**: 1 hour  
**Success probability**: 90%

### Option C: Simplified polling with periodic checks (Robust Fix - 30 min)

Replace complex polling logic with simpler approach:

**Implementation**:
```powershell
$pollStart = Get-Date
$checkInterval = 5  # Check every 5 seconds instead of 1

Write-Host "[$sceneId] Polling for video (timeout=${MaxWaitSeconds}s, check every ${checkInterval}s)"
Add-RunSummaryLine "[Scene $sceneId] Wan2 polling started"

while (((Get-Date) - $pollStart).TotalSeconds -lt $MaxWaitSeconds) {
    $elapsed = [math]::Round(((Get-Date) - $pollStart).TotalSeconds, 1)
    
    # Simple file check - no complex error handling
    $videos = Get-ChildItem -Path "$comfyOutputRoot\video\${sceneId}_*.mp4" -ErrorAction SilentlyContinue
    
    if ($videos -and $videos.Count -gt 0) {
        $sourceVideo = $videos[0]
        $targetPath = Join-Path $sceneVideoDir "$sceneId.mp4"
        
        try {
            Copy-Item -Path $sourceVideo.FullName -Destination $targetPath -Force
            $size = (Get-Item $targetPath).Length
            
            if ($size -gt 10240) {
                Write-Host "[$sceneId] ✓ Video found and copied: $($sourceVideo.Name) (${elapsed}s)"
                Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation succeeded (${elapsed}s)"
                $videoFound = $true
                break
            }
        } catch {
            Write-Warning "[$sceneId] Copy failed (${elapsed}s): $_"
        }
    }
    
    if ($elapsed % 30 -eq 0) {
        Write-Host "[$sceneId] Still polling... (${elapsed}s / ${MaxWaitSeconds}s)"
    }
    
    Start-Sleep -Seconds $checkInterval
}

if (-not $videoFound) {
    Write-Warning "[$sceneId] Timeout after ${MaxWaitSeconds}s - no video found"
    Add-RunSummaryLine "[Scene $sceneId] Wan2 video generation failed: timeout"
}
```

**Time estimate**: 30 minutes  
**Success probability**: 85%

## Recommendation

**Implement Option C (Simplified Polling)** - Best balance of:
- ✅ Removes complex error handling that might be causing issues
- ✅ Simple, readable, maintainable
- ✅ Eliminates `Check-PromptStatus` blocking issue
- ✅ Uses time-based check instead of counter (more reliable)
- ✅ Direct file system checks (no abstractions)
- ✅ Moderate implementation time

If Option C fails, fall back to Option B (Diagnostic) to identify root cause.

## Current Code State

### Modified Files
1. `scripts/run-comfyui-e2e.ps1`
   - ✅ Background VRAM job disabled (lines 101-122)
   - ✅ Process isolation implemented (lines 190-228)
   - Uses `Start-Process` with `-Wait` to call WAN per scene

2. `scripts/generate-scene-videos-wan2.ps1`
   - ✅ Added `-SceneFilter` parameter (line 6)
   - ✅ Added scene filtering logic (lines 177-183)
   - ✅ Added debug logging in polling loop (lines 449-451)
   - ❌ Polling loop still has hang bug (lines 456-540)

## Next Steps (Priority Order)

1. **🔴 CRITICAL: Fix polling loop** (30-60 min)
   - Implement Option C (Simplified Polling)
   - Test with single scene first
   - Then test with all 3 scenes

2. **🟡 Validate multi-scene E2E** (20 min)
   - Run full test with fixed polling
   - Verify all 3 videos generate
   - Check run summary completeness

3. **🟡 Re-enable VRAM monitoring** (15 min)
   - Uncomment background job
   - Test with full workflow
   - Validate sample collection

4. **🟢 Documentation** (30 min)
   - Document final solution
   - Update testing guides
   - Create runbook

## Test Run Logs

- `logs/20251119-185544/` - First test (background job enabled) - Scene-001 only
- `logs/20251119-191607/` - Second test (background job disabled) - Scene-001 only
- `logs/20251119-192607/` - Third test (process isolation) - **CURRENT** - Scene-001 hangs

## Key Files

- `E2E_SCRIPT_DEBUG_FINDINGS_20251119.md` - Previous analysis
- `SESSION_HANDOFF_20251119_CONTINUED.md` - Previous handoff
- **THIS FILE** - Current critical issue analysis

---

**Session Status**: Issue isolated to polling loop, clear fix path identified  
**Confidence**: HIGH - Simplified polling will work  
**Time to resolution**: 30-60 minutes  
**Blocker**: None - ready to implement fix immediately

## Quick Start for Next Session

```powershell
# 1. Open the WAN script polling loop
code scripts/generate-scene-videos-wan2.ps1:456

# 2. Replace lines 456-560 with Option C implementation (Simplified Polling)

# 3. Test with single scene
pwsh scripts/generate-scene-videos-wan2.ps1 -RunDir "logs/test-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -ComfyUrl "http://127.0.0.1:8188" -SceneFilter "scene-001"

# 4. If successful, test full E2E
pwsh scripts/run-comfyui-e2e.ps1 -FastIteration -SkipLLMHealthCheck

# 5. Verify all 3 videos generated
Get-ChildItem logs/*/video/*/*.mp4
```
