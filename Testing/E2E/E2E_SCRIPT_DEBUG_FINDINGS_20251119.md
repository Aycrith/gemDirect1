# E2E Script Debug Findings - November 19, 2025

## Executive Summary

**Issue**: E2E test script (`run-comfyui-e2e.ps1`) fails to generate all 3 scenes. Only scene-001 completes successfully.

**Root Cause**: The WAN video generation script (`generate-scene-videos-wan2.ps1`) terminates prematurely with exit code 1 during the polling loop for scene-002 and scene-003. This is NOT caused by the background VRAM monitoring job.

**Status**: Issue isolated but not yet resolved. Requires deeper PowerShell debugging or architectural change.

## Detailed Findings

### Test Results

| Test Run | Background Job | Scene-001 | Scene-002 | Scene-003 | Exit Code | Duration |
|----------|----------------|-----------|-----------|-----------|-----------|----------|
| 20251119-185544 | Enabled | ✅ Generated | ❌ Not queued | ❌ Not queued | Unknown | ~213s (hung) |
| 20251119-191607 | **Disabled** | ✅ Generated | ❌ Not queued | ❌ Not queued | 1 | ~0s (immediate fail) |
| Direct WAN script | N/A | ✅ Generated | ❌ Exit code 1 | ❌ Not reached | 1 | ~185s (hung during scene-002 polling) |

### Key Observations

1. **Background VRAM job is NOT the issue**
   - Disabling the job did not fix the problem
   - Issue persists with or without background monitoring

2. **WAN script works perfectly when generating ONLY scene-001**
   - Scene-001 always generates successfully (~185-213 seconds)
   - Video file is created and detected correctly
   - Polling loop works as expected

3. **WAN script fails silently during scene-002+ polling**
   - Script exits with code 1
   - No error messages logged
   - No PowerShell exceptions caught
   - Logs stop at "Polling started" message

4. **Pattern suggests resource/timeout issue**
   - Scene-001: Always works
   - Scene-002+: Always fails
   - Each video takes 3-4 minutes to generate
   - Cumulative time ~6-8 minutes before failure

### Technical Evidence

#### Video Generation Times
- Scene-001 (test 1): 213.6 seconds (created at 18:59:19 from start at 18:55:46)
- Scene-001 (test 2): ~185 seconds (created at 19:19:57 from start at 19:16:07)

#### File Patterns
```powershell
# Correct pattern (used in polling loop - line 450)
$sceneVideoSourcePattern = Join-Path $comfyOutputRoot "video\${sceneId}_*.mp4"
# Example: C:\ComfyUI\...\output\video\scene-001_00001_.mp4

# Incorrect pattern (in unused Copy-VideoFromComfyUI function - line 114)
$sceneVideoSourcePattern = Join-Path $comfyOutputRoot (Join-Path 'video' $sceneId) '*.mp4'
# Example: C:\ComfyUI\...\output\video\scene-001\*.mp4 (wrong - looks for subfolder)
```

#### Polling Loop Logic
- Max wait: 360 seconds per scene
- Poll interval: 1 second
- Retries: 3 attempts with exponential backoff
- Pattern lookup: Uses `Get-ChildItem` with wildcard pattern
- Error handling: Try-catch blocks present

### Hypothesis: PowerShell Session Timeout

**Theory**: PowerShell has implicit timeout or resource limits when running nested scripts that accumulate over time.

**Evidence**:
1. Scene-001 works (3-4 min runtime)
2. Scene-002 fails (would need 6-8 min cumulative)
3. Direct script run fails at same point (scene-002 polling)
4. No explicit timeout configured in scripts
5. Exit code 1 suggests abnormal termination

**Possible causes**:
- PowerShell execution policy timeout
- Process memory limit reached
- File handle leaks
- COM object references not released
- WebRequest/.NET HttpClient resource exhaustion

## Attempted Fixes

### ✅ Completed
1. Disabled background VRAM monitoring job
2. Added verbose logging to polling loop
3. Verified file patterns are correct
4. Confirmed ComfyUI server is healthy
5. Verified video files are being created

### ❌ Not Yet Attempted
1. Add explicit `[GC]::Collect()` calls between scenes
2. Use `Invoke-Expression` instead of `&` operator
3. Split script into separate processes per scene
4. Add PowerShell transcript logging
5. Test with `-NoProfile` flag
6. Monitor PowerShell process metrics during execution

## Recommended Path Forward

### Option 1: Quick Fix (Process Isolation)
**Time estimate**: 1-2 hours

Modify E2E script to call WAN script separately for each scene:

```powershell
foreach ($sceneId in $sceneIds) {
    Write-Host "Generating video for $sceneId..." -ForegroundColor Cyan
    
    # Call WAN script with single scene filter
    $singleSceneArgs = @(
        '-RunDir', $runDir,
        '-ComfyUrl', 'http://127.0.0.1:8188',
        '-MaxWaitSeconds', $MaxWaitSeconds,
        '-PollIntervalSeconds', $PollIntervalSeconds,
        '-SceneFilter', $sceneId  # NEW: Only process this scene
    )
    
    Start-Process -FilePath 'pwsh' -ArgumentList ("-NoLogo", "-ExecutionPolicy", "Bypass", "-File", $wanScript, $singleSceneArgs) -Wait -NoNewWindow
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Scene $sceneId failed with exit code $LASTEXITCODE"
    }
    
    # Force garbage collection between scenes
    [GC]::Collect()
    Start-Sleep -Seconds 5
}
```

**Pros**:
- Clean process separation
- No resource accumulation
- Easy to implement

**Cons**:
- Requires WAN script modification (add `-SceneFilter` parameter)
- Slightly slower (process overhead)

### Option 2: Add Explicit Resource Cleanup
**Time estimate**: 30 minutes

Add cleanup between scenes in WAN script:

```powershell
foreach ($sceneData in $scenes) {
    # ... existing scene processing ...
    
    # AFTER scene completes (end of foreach iteration):
    
    # Force garbage collection
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    [GC]::Collect()
    
    # Clear variables
    Remove-Variable -Name workflow, promptPayload -ErrorAction SilentlyContinue
    
    # Brief pause
    Start-Sleep -Milliseconds 500
}
```

**Pros**:
- Simple implementation
- No architectural changes

**Cons**:
- May not solve underlying issue
- Still vulnerable to accumulation

### Option 3: Deep Diagnostic Session
**Time estimate**: 2-3 hours

Enable comprehensive logging to identify exact failure point:

1. Add PowerShell transcript:
```powershell
Start-Transcript -Path "$runDir\wan-transcript.log" -Force
```

2. Enable verbose output:
```powershell
$VerbosePreference = 'Continue'
$DebugPreference = 'Continue'
```

3. Monitor process metrics:
```powershell
$process = Get-Process -Id $PID
while ($true) {
    $mem = [math]::Round($process.WorkingSet64 / 1MB, 2)
    $handles = $process.HandleCount
    Write-Host "[METRICS] Memory: ${mem}MB Handles: $handles"
    Start-Sleep -Seconds 5
}
```

4. Test with single-scene isolation

**Pros**:
- Will identify root cause
- Permanent solution possible

**Cons**:
- Time-consuming
- May reveal complex architectural issues

## Current Code Changes

### Modified Files
1. `scripts/run-comfyui-e2e.ps1`
   - Disabled background VRAM monitoring job (lines 101-122 commented out)

2. `scripts/generate-scene-videos-wan2.ps1`
   - Added polling progress logging (line 446)

### Unchanged Files (Still Need Updates)
- VRAM statistics calculation (still references background job samples)
- Documentation (needs update with these findings)

## Next Steps

### Immediate (Next Session)
1. **Implement Option 1** (Process Isolation) - Most reliable path
   - Add `-SceneFilter` parameter to WAN script
   - Modify E2E script to call WAN once per scene
   - Test with all 3 scenes

2. **If Option 1 fails, try Option 2** (Resource Cleanup)
   - Add explicit GC calls between scenes
   - Monitor memory usage

3. **If both fail, execute Option 3** (Deep Diagnostic)
   - Enable transcript logging
   - Monitor process metrics
   - Identify exact failure point

### Long-term (Future Sessions)
1. Re-enable background VRAM monitoring (it's not the issue)
2. Validate VRAM statistics calculations
3. Run extended batch testing (10-20 scenes)
4. Document final architecture

## Files for Reference

### Test Run Logs
- `C:\Dev\gemDirect1\logs\20251119-185544\` - First test (with background job)
- `C:\Dev\gemDirect1\logs\20251119-191607\` - Second test (without background job)

### Key Scripts
- `scripts\run-comfyui-e2e.ps1` - Main E2E orchestrator
- `scripts\generate-scene-videos-wan2.ps1` - WAN I2V video generation
- `scripts\validate-run-summary.ps1` - Post-run validation

### Documentation
- `QUICK_DEBUG_GUIDE_E2E_ISSUE.md` - Debug commands
- `SESSION_FINAL_SUMMARY_20251119.md` - Previous session handoff
- `VRAM_MONITORING_VALIDATION_20251119.md` - VRAM monitoring findings

## Success Criteria

E2E test is considered **fixed** when:
1. ✅ All 3 scenes process without errors
2. ✅ 3 video files generated (scene-001.mp4, scene-002.mp4, scene-003.mp4)
3. ✅ Run summary shows completion for all scenes
4. ✅ No exit code errors
5. ✅ Total runtime ~10-15 minutes (3-5 min per scene)
6. ✅ VRAM monitoring captures samples throughout
7. ✅ Peak VRAM calculated correctly

---

**Session completed**: 2025-11-19 19:30
**Next agent**: Implement Option 1 (Process Isolation) as primary fix strategy
