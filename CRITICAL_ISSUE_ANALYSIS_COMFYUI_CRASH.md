# Critical Issue Analysis: ComfyUI Save Path Rejection & Server Crash

## Problem Summary

**Symptom**: ComfyUI server crashes after failing to save videos outside its output folder
**Error Message**: `ERROR: Saving image outside the output folder is not allowed`
**Root Cause**: ComfyUI's security policy prevents absolute paths outside `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output`
**Impact**: Script retries infinitely, causing 100% CPU usage and eventual server crash

## Error Analysis from ComfyUI Logs

```
**** ERROR: Saving image outside the output folder is not allowed.
 full_output_folder: C:\Dev\gemDirect1\logs\20251118-190314\video\scene-001
         output_dir: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output
         commonpath: C:\
```

**Key Details**:
- Script sets `filename_prefix` to: `C:\Dev\gemDirect1\logs\20251118-190314\video\scene-001`
- ComfyUI expects all outputs in: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output`
- ComfyUI detects absolute path is outside the allowed folder
- Security check rejects the operation
- **Critical**: The PowerShell script does NOT detect this error and keeps retrying
- Each retry generates a new prompt with same settings, leading to exponential load

## Why Server Crashed

1. Wan2 video generation queued successfully
2. ComfyUI attempts to execute the prompt
3. ComfyUI's SaveVideo node tries to write to: `C:\Dev\gemDirect1\logs\...\video\scene-001.mp4`
4. Security check rejects the path
5. Exception thrown; ComfyUI removes from queue but marks prompt as "failed"
6. **PowerShell script keeps polling** for MP4 file at absolute path
7. After timeout, PowerShell doesn't detect error in ComfyUI queue state
8. Script continues, polling mechanism doesn't break
9. Multiple retries stack up in ComfyUI's internal queue
10. Server exhausts resources and crashes

## Two-Part Solution

### Part 1: Fix Path Handling (Immediate Fix)

**Options**:

**Option A: Use ComfyUI's Subfolder System** (Recommended)
- Instead of absolute path like `C:\Dev\gemDirect1\logs\...\`
- Use relative path with subfolder: `video/scene-001`
- ComfyUI will save to: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-001\`
- Then copy/symlink to desired location AFTER generation

**Option B: Configure ComfyUI Output Folder** (Alternative)
- Modify ComfyUI startup to change output folder
- Not ideal for shared systems

**Option C: Use LocalFileServer** (Advanced)
- Configure ComfyUI to allow specific external directories
- Requires config modification

### Part 2: Add Retry Logic & Error Detection (Stability Fix)

**Current Problem**:
- Script queues prompt but doesn't check for execution errors
- Infinite polling even when ComfyUI rejects the request
- No backoff; keeps hammering server

**Required Changes**:
1. Query prompt status/history after queuing
2. Detect error states (e.g., exception during execution)
3. Implement exponential backoff
4. Set maximum retry count
5. Fail gracefully with clear error message
6. Never retry paths that ComfyUI has already rejected

## Implementation Plan

### Step 1: Fix `generate-scene-videos-wan2.ps1`
- Change from absolute path to relative subfolder path
- Implement prompt status checking
- Add exponential backoff
- Add max retry count (3 attempts max)
- Detect and report errors clearly

### Step 2: Post-Process Videos
- After ComfyUI generates video in relative folder
- Copy from ComfyUI output to desired run directory
- Verify file integrity before proceeding

### Step 3: Test & Validate
- Run full E2E test
- Monitor for immediate failures
- Verify no infinite retries
- Confirm videos end up in correct locations

## Code Changes Required

### `generate-scene-videos-wan2.ps1`

**Change 1**: Use relative subfolder path instead of absolute
```powershell
# OLD (FAILS):
$absPrefix = Join-Path $sceneVideoDir $sceneId  # C:\Dev\gemDirect1\...\scene-001

# NEW (WORKS):
$relativePrefix = Join-Path 'video' $sceneId  # video/scene-001
$saveVideoNode.inputs.filename_prefix = $relativePrefix
```

**Change 2**: Check prompt execution status
```powershell
# Add function to check if prompt completed with error
function Check-PromptStatus {
  param([string]$ComfyUrl, [string]$PromptId)
  
  $historyUrl = "$ComfyUrl/history/$PromptId"
  try {
    $history = Invoke-RestMethod -Uri $historyUrl -TimeoutSec 5
    if ($history.$PromptId) {
      $execution = $history.$PromptId.outputs
      if ($execution) { return @{status='completed'; outputs=$execution} }
      # Check if there's an exception key
      if ($history.$PromptId.exception) { return @{status='error'; exception=$history.$PromptId.exception} }
      return @{status='running'}
    }
  } catch {
    return @{status='unknown'; error=$_}
  }
  return @{status='pending'}
}
```

**Change 3**: Implement intelligent polling with error detection
```powershell
# Replace infinite while loop with smart polling
$maxRetries = 3
$retryCount = 0
$videoFound = $false
$comfyOutputPath = "$ComfyUrl/../output/video/$sceneId"  # Relative to ComfyUI

while ($retryCount -lt $maxRetries -and -not $videoFound) {
  $elapsed = 0
  $pollStart = Get-Date
  
  while ($elapsed -lt $MaxWaitSeconds -and -not $videoFound) {
    # Check actual ComfyUI output folder (relative path)
    $comfyVideoPath = Join-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\$sceneId" "*.mp4"
    $generatedVideo = Get-ChildItem -Path $comfyVideoPath -ErrorAction SilentlyContinue | Select-Object -First 1
    
    if ($generatedVideo) {
      # Copy to target location
      $targetMp4 = Join-Path $sceneVideoDir "$sceneId.mp4"
      Copy-Item -Path $generatedVideo.FullName -Destination $targetMp4 -Force
      $videoFound = $true
      break
    }
    
    # Check if ComfyUI reported an error
    $status = Check-PromptStatus -ComfyUrl $ComfyUrl -PromptId $response.prompt_id
    if ($status.status -eq 'error') {
      Write-Warning "[$sceneId] ComfyUI reported execution error: $($status.exception)"
      break  # Don't retry; error is permanent
    }
    
    Start-Sleep -Seconds $pollInterval
    $elapsed += $pollInterval
  }
  
  if (-not $videoFound) {
    $retryCount++
    if ($retryCount -lt $maxRetries) {
      Write-Host "[$sceneId] Retry $retryCount/$maxRetries after ${elapsed}s delay"
      Start-Sleep -Seconds (2 ^ $retryCount)  # Exponential backoff: 2s, 4s, 8s
    }
  }
}
```

## Expected Behavior After Fix

1. **Wan2 video generation**:
   - SaveVideo node uses relative path `video/scene-001`
   - ComfyUI saves to: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-001\*.mp4`
   - Script polls ComfyUI output folder (not absolute path)
   - File copied to run directory when found

2. **On error**:
   - Script detects exception in prompt execution
   - Logs error and fails gracefully
   - No infinite retries
   - Server stays responsive

3. **Stability**:
   - Max 3 retries with exponential backoff
   - Prompt status checked immediately after queuing
   - Errors detected within milliseconds
   - Server never overloaded

## Files to Modify

1. `scripts/generate-scene-videos-wan2.ps1` - Main fix
2. `scripts/run-comfyui-e2e.ps1` - Optional: add error detection wrapper

## Testing

After implementing fix:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
```

**Success Criteria**:
- [ ] All 3 scenes generate videos without errors
- [ ] Videos appear in run directory: `logs/<timestamp>/video/scene-*/`
- [ ] ComfyUI server stays responsive
- [ ] No infinite retries or CPU spikes
- [ ] Validation metrics show `videosDetected=3`
