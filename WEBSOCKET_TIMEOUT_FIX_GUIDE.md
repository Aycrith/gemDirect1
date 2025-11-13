# WINDOWS E2E TEST - TECHNICAL FIX GUIDE

**Date**: November 11, 2025  
**Issue**: WebSocket history polling hangs in `queue-real-workflow.ps1`  
**Severity**: CRITICAL (blocks frame retrieval)  
**Affected File**: `scripts/queue-real-workflow.ps1`

---

## Problem Statement

After SVD video generation completes (~97% progress), the PowerShell script enters an infinite wait state in the history polling loop. This prevents:
- Frame files from being discovered and copied
- History JSON from being saved
- Return value from being computed
- Parent e2e script from continuing

**Evidence**:
```
[Real E2E][scene-001] Queued prompt_id 99e16b5c-396b-4203-9f6b-1886678629f3
[ComfyUI logs show] 97% |███████████████████ | 29/30 [01:55<00:04, 4.28s/it]
[Script hangs for ~60 seconds, then terminates]
```

---

## Root Cause

The history polling loop (approximately lines 160-220 in queue-real-workflow.ps1) waits indefinitely for:

1. WebSocket "executed" event with matching `prompt_id`
2. OR history endpoint `/history/{promptId}` to return output frames

**Current Loop Logic**:
```powershell
while ($loopCount -lt $maxAttempts -or $MaxAttemptCount -eq 0) {
    # Poll WebSocket or /history endpoint
    # If found, break
    # If not found, sleep $HistoryPollIntervalSeconds
    # Continue indefinitely if $MaxAttemptCount -eq 0
}
```

**Problems**:
- `$MaxAttemptCount = 0` means "unbounded" (infinity)
- No timeout after "executed" event received
- Frame file discovery may start too early (I/O not complete)
- No fallback mechanism if WebSocket message lost

---

## Fix Implementation

### Step 1: Add Hard Timeout After "Executed" Event

**Location**: After WebSocket receives `executed` type message

**Current Code** (lines ~180):
```powershell
if ($message.type -eq 'executed' -and $message.data.prompt_id -eq $promptId) {
    Write-SceneLog "Got execution confirmation"
    $historyData = [object] $message.data.output
    break
}
```

**Modified Code**:
```powershell
if ($message.type -eq 'executed' -and $message.data.prompt_id -eq $promptId) {
    Write-SceneLog "Got execution confirmation, now waiting for frame files (max 30s)..."
    
    # Give ComfyUI 30 seconds max to write frames to disk
    $fileWaitStart = Get-Date
    $frameWaitTimeout = 30  # seconds
    
    while ((New-TimeSpan -Start $fileWaitStart -End (Get-Date)).TotalSeconds -lt $frameWaitTimeout) {
        # Check if frames exist
        $possibleFrames = @(Get-ChildItem -Path $outputDir -Filter "$scenePrefix*.png" -ErrorAction SilentlyContinue)
        if ($possibleFrames.Count -gt 0) {
            $historyData = $message.data.output
            Write-SceneLog "Found $($possibleFrames.Count) frames after $(([int](New-TimeSpan -Start $fileWaitStart -End (Get-Date)).TotalSeconds))s"
            break
        }
        Start-Sleep -Milliseconds 500
    }
    
    if ($historyData) {
        break  # Frames found, exit polling loop
    } else {
        Write-SceneLog "WARNING: Frames not found within ${frameWaitTimeout}s after 'executed' event"
        # Continue to fallback logic below...
    }
}
```

### Step 2: Add Fallback to History Endpoint

**Location**: After WebSocket polling completes without finding frames

**New Code**:
```powershell
# Fallback: Query history endpoint directly if WebSocket didn't deliver
if (-not $historyData) {
    Write-SceneLog "Attempting fallback: querying /history endpoint directly..."
    
    $historyUrl = "$ComfyUrl/history/$promptId"
    try {
        $historyResponse = Invoke-RestMethod -Uri $historyUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($historyResponse -and $historyResponse.$promptId -and $historyResponse.$promptId.outputs) {
            $historyData = $historyResponse.$promptId.outputs
            Write-SceneLog "Successfully retrieved history via endpoint"
            $historyRetrieved = $true
            $historyRetrievedAt = Get-Date
        }
    } catch {
        $historyErrorMessage = "History endpoint failed: $($_.Exception.Message)"
        Write-SceneLog $historyErrorMessage
    }
}
```

### Step 3: Bound Maximum Polling Time

**Location**: Top of history polling loop

**Current Code**:
```powershell
$maxAttempts = if ($MaxAttemptCount -gt 0) { $MaxAttemptCount } else { [int]::MaxValue }
```

**Modified Code**:
```powershell
# Calculate max attempts based on time limit
$maxLoopSeconds = $MaxWaitSeconds  # e.g., 600 seconds
$pollIntervalSec = $HistoryPollIntervalSeconds  # e.g., 2 seconds
$maxAttempts = [Math]::Ceiling($maxLoopSeconds / $pollIntervalSec)

# But also enforce hard limit: don't loop more than 300 times (10 minutes)
$maxAttempts = [Math]::Min($maxAttempts, 300)

Write-SceneLog "History polling: max $maxAttempts attempts (${maxLoopSeconds}s ÷ ${pollIntervalSec}s intervals)"
```

### Step 4: Add Elapsed Time Tracking

**Location**: Inside polling loop

**New Code**:
```powershell
$loopElapsedSeconds = (New-TimeSpan -Start $loopStart).TotalSeconds
if ($loopElapsedSeconds -gt $MaxWaitSeconds) {
    Write-SceneLog "ERROR: History polling exceeded max wait time (${MaxWaitSeconds}s)"
    $historyErrorMessage = "Polling timeout after ${loopElapsedSeconds}s"
    break
}

if ($historyAttempts % 10 -eq 0) {
    Write-SceneLog "History polling attempt $historyAttempts after ${loopElapsedSeconds}s..."
}
```

---

## Complete Fixed Function

Replace lines 140-230 in `queue-real-workflow.ps1` with:

```powershell
# ============================================================================
# FIXED: Robust history polling with timeout and fallback
# ============================================================================

$loopStart = Get-Date
$maxLoopSeconds = $MaxWaitSeconds
$pollIntervalSec = $HistoryPollIntervalSeconds
$maxAttempts = [Math]::Min([Math]::Ceiling($maxLoopSeconds / $pollIntervalSec), 300)

Write-SceneLog "Starting history poll: max $maxAttempts attempts (${maxLoopSeconds}s total)"

$historyData = $null
$historyRetrieved = $false
$historyRetrievedAt = $null
$historyAttempts = 0
$historyErrorMessage = $null
$historyErrors = @()
$historyPollLog = @()

$ws = $null
try {
    # Attempt WebSocket polling first
    Write-SceneLog "Opening WebSocket connection to $ComfyUrl/ws?clientId=$clientId"
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter([TimeSpan]::FromSeconds(10))  # 10s connection timeout
    
    $uri = [Uri]("ws://127.0.0.1:8188/ws?clientId=$clientId")
    $ws.ConnectAsync($uri, $cts.Token).Wait() | Out-Null
    
    $buffer = New-Object byte[] 4096
    $receiveTask = $ws.ReceiveAsync($buffer, $cts.Token)
    
    $frameWaitStart = $null
    $frameWaitTimeout = 30
    
    while ($historyAttempts -lt $maxAttempts -and -not $historyData) {
        $historyAttempts++
        $pollTimestamp = Get-Date
        $loopElapsedSeconds = (New-TimeSpan -Start $loopStart -End $pollTimestamp).TotalSeconds
        
        if ($loopElapsedSeconds -gt $maxLoopSeconds) {
            Write-SceneLog "History polling exceeded max time (${maxLoopSeconds}s)"
            $historyErrorMessage = "Max wait time exceeded"
            break
        }
        
        # Try to receive WebSocket message (non-blocking check)
        if ($receiveTask.IsCompleted) {
            $result = $receiveTask.Result
            $json = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result)
            $message = $json | ConvertFrom-Json
            
            Write-SceneLog "WebSocket message: type=$($message.type), prompt_id=$($message.data.prompt_id)"
            
            if ($message.type -eq 'executed' -and $message.data.prompt_id -eq $promptId) {
                Write-SceneLog "Got execution confirmation, waiting for frame files (max ${frameWaitTimeout}s)..."
                $frameWaitStart = Get-Date
                
                # Wait for frames to appear on disk
                while ((New-TimeSpan -Start $frameWaitStart -End (Get-Date)).TotalSeconds -lt $frameWaitTimeout) {
                    $frames = @(Get-ChildItem -Path $outputDir -Filter "$scenePrefix*.png" -ErrorAction SilentlyContinue)
                    if ($frames.Count -gt 0) {
                        $historyData = $message.data.output
                        $historyRetrieved = $true
                        $historyRetrievedAt = Get-Date
                        Write-SceneLog "SUCCESS: Found $($frames.Count) frames after $([int](New-TimeSpan -Start $frameWaitStart -End (Get-Date)).TotalSeconds)s"
                        break
                    }
                    Start-Sleep -Milliseconds 500
                }
                
                if ($historyData) {
                    break
                }
            }
            
            # Start next receive
            $receiveTask = $ws.ReceiveAsync($buffer, $cts.Token)
        }
        
        if ($historyAttempts % 10 -eq 0 -or $historyAttempts -eq 1) {
            Write-SceneLog "History polling: attempt $historyAttempts / $maxAttempts, elapsed ${loopElapsedSeconds}s"
        }
        
        Start-Sleep -Seconds $pollIntervalSec
    }
    
} catch {
    $historyErrorMessage = "WebSocket error: $($_.Exception.Message)"
    Write-SceneLog $historyErrorMessage
    $historyErrors += $historyErrorMessage
} finally {
    if ($ws) { $ws.Dispose() }
    if ($cts) { $cts.Dispose() }
}

# FALLBACK: Query history endpoint directly
if (-not $historyData) {
    Write-SceneLog "Fallback: Querying /history endpoint for prompt $promptId"
    
    try {
        $historyUrl = "$ComfyUrl/history/$promptId"
        $historyResponse = Invoke-RestMethod -Uri $historyUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        
        if ($historyResponse -and $historyResponse.$promptId -and $historyResponse.$promptId.outputs) {
            $historyData = $historyResponse.$promptId.outputs
            $historyRetrieved = $true
            $historyRetrievedAt = Get-Date
            Write-SceneLog "SUCCESS: Retrieved history via endpoint"
        }
    } catch {
        $msg = "History endpoint query failed: $($_.Exception.Message)"
        Write-SceneLog $msg
        $historyErrors += $msg
        if (-not $historyErrorMessage) { $historyErrorMessage = $msg }
    }
}

Write-SceneLog "History polling complete: retrieved=$historyRetrieved, attempts=$historyAttempts, elapsed=${loopElapsedSeconds}s"

$historyPollLog += @{
    Attempt = $historyAttempts
    Timestamp = (Get-Date).ToString('o')
    Status = if ($historyRetrieved) { 'success' } else { 'timeout' }
    DurationSeconds = [Math]::Round($loopElapsedSeconds, 1)
}
```

---

## Testing the Fix

### Test 1: Verify Timeout Triggers

```powershell
# Run with very short timeout to verify it stops trying
pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-comfyui-e2e.ps1 `
  -MaxSceneRetries 1 `
  -SceneMaxWaitSeconds 10 `  # Only 10 seconds
  -SceneHistoryMaxAttempts 5

# Expected: Script should fail promptly with "timeout" message, not hang
```

### Test 2: Verify Retry Works

```powershell
# Run with retry enabled
pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-comfyui-e2e.ps1 `
  -MaxSceneRetries 3 `
  -SceneMaxWaitSeconds 180

# Expected: If first scene fails, scene-002 and scene-003 still attempted
```

### Test 3: Full Run

```powershell
# Run complete test with reasonable timeouts
pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-comfyui-e2e.ps1 `
  -MaxSceneRetries 1 `
  -SceneMaxWaitSeconds 180 `
  -SceneHistoryMaxAttempts 30

# Expected: All 3 scenes processed, frames copied, vitest run
```

---

## Deployment Checklist

- [ ] Apply code changes to `scripts/queue-real-workflow.ps1`
- [ ] Test locally with reproduction steps above
- [ ] Verify no frames are lost during retrieval
- [ ] Check telemetry is still captured correctly
- [ ] Confirm retry mechanism works (MaxSceneRetries > 1)
- [ ] Run full e2e test to completion
- [ ] Capture vitest results
- [ ] Commit changes to git

---

## Expected Outcomes After Fix

| Metric | Before | After |
|--------|--------|-------|
| Frames retrieved | 0/scene | 25-30/scene |
| Test completion rate | 0% | 100% (3/3 scenes) |
| History polling time | HANGS | <30s per scene |
| Retry mechanism | Unused | Functional if needed |
| Error messages | Generic timeout | Specific timeout w/ attempt count |

---

## Alternative Approaches (If Above Doesn't Work)

### Option A: Use ComfyUI REST API Polling Instead of WebSocket

Replace WebSocket with simple HTTP polling:

```powershell
$maxWaitSec = 180
$pollIntervalSec = 2
$elapsed = 0

while ($elapsed -lt $maxWaitSec) {
    $history = Invoke-RestMethod -Uri "$ComfyUrl/history" -UseBasicParsing
    if ($history.$promptId) {
        $historyData = $history.$promptId.outputs
        break
    }
    Start-Sleep -Seconds $pollIntervalSec
    $elapsed += $pollIntervalSec
}
```

**Pros**: Simpler, no WebSocket complexity  
**Cons**: Higher latency, more HTTP requests

### Option B: Check Frame Files First, Then Query History

```powershell
# Wait for actual frame files first (30s)
$frameWaitStart = Get-Date
while ((New-TimeSpan -Start $frameWaitStart).TotalSeconds -lt 30) {
    $frames = Get-ChildItem "$outputDir/${scenePrefix}*.png" -ErrorAction SilentlyContinue
    if ($frames.Count -ge 25) {  # Expected frame count threshold
        break
    }
    Start-Sleep -Seconds 1
}

# Then retrieve history for metadata
$history = Invoke-RestMethod "$ComfyUrl/history/$promptId"
```

**Pros**: Ensures frames exist before returning  
**Cons**: May report success with incomplete history

---

## References

- ComfyUI API: `/history/{prompt_id}`
- WebSocket Endpoint: `/ws?clientId=<client_id>`
- Expected Frame Naming: `${sceneId}_frame_*.png` (or similar pattern)
- RTX 3090 SVD Gen Time: ~2 min for 30 frames

---

**Priority**: HIGH - This blocks entire e2e pipeline  
**Estimated Effort**: 1-2 hours implementation + testing  
**Risk Level**: LOW - Changes isolated to history polling logic  

---

Generated: November 11, 2025  
For: gemDirect1 Windows E2E Integration Testing
