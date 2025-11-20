# VRAM Monitoring Improvements - November 19, 2025

## Summary

Implemented two critical improvements to the E2E testing pipeline:
1. **Increased timeout** from 240s to 360s for FastIteration mode
2. **Background VRAM monitoring** with periodic sampling every 5 seconds

## Changes Made

### 1. Timeout Extension (scripts/run-comfyui-e2e.ps1)

**Problem**: Fresh video generation takes ~3.5 minutes per scene, but FastIteration timeout was only 240s (4 minutes).

**Solution**:
```powershell
# Before:
if ($FastIteration) {
    $MaxWaitSeconds = 240  # 4 minutes
}

# After:
if ($FastIteration) {
    $MaxWaitSeconds = 360  # 6 minutes (3.5 min/scene + buffer)
}
```

**Impact**: Allows fresh video generation to complete without timeout errors.

### 2. Background VRAM Monitoring

**Problem**: Previous VRAM monitoring only sampled 4 fixed points (start, before WAN, after WAN, end). ComfyUI unloads models immediately after generation, so peak VRAM was never captured.

**Solution**: Added background PowerShell job that samples VRAM every 5 seconds throughout the entire test run.

```powershell
# Start background monitoring job
$vramMonitorJob = Start-Job -ScriptBlock {
    param($vramLogPath)
    while ($true) {
        try {
            $stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" -TimeoutSec 2
            if ($stats.devices -and $stats.devices[0]) {
                $dev = $stats.devices[0]
                # Handle both byte and MB formats from ComfyUI API
                $usedMB = if ($dev.vram_used) { [math]::Round($dev.vram_used / 1MB, 0) } 
                         elseif ($dev.used_mem_mb) { $dev.used_mem_mb } else { 0 }
                $freeMB = if ($dev.vram_free) { [math]::Round($dev.vram_free / 1MB, 0) } 
                         elseif ($dev.free_mem_mb) { $dev.free_mem_mb } else { 0 }
                $timestamp = Get-Date -Format 'HH:mm:ss'
                $logLine = "$timestamp,Used=${usedMB}MB,Free=${freeMB}MB"
                Add-Content -Path $vramLogPath -Value $logLine -Encoding UTF8
            }
        } catch {
            # Silent fail if ComfyUI not responding
        }
        Start-Sleep -Seconds 5
    }
} -ArgumentList $vramLog

# ... test runs ...

# Stop background job at end of test
if ($vramMonitorJob) {
    Stop-Job $vramMonitorJob -ErrorAction SilentlyContinue
    Remove-Job $vramMonitorJob -Force -ErrorAction SilentlyContinue
}
```

**Impact**: 
- Captures peak VRAM during active generation
- Provides continuous VRAM timeline in `vram-usage.log`
- Calculates accurate peak/average/minimum from all samples

### 3. Improved VRAM API Parsing

**Problem**: ComfyUI API returns VRAM in bytes (`vram_used`, `vram_free`) but code expected MB (`used_mem_mb`, `free_mem_mb`).

**Solution**: Updated `Get-VRAMUsage` function to handle both formats:

```powershell
function Get-VRAMUsage {
    try {
        $stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" -TimeoutSec 2
        if ($stats.devices -and $stats.devices[0]) {
            $dev = $stats.devices[0]
            
            # Handle both MB and byte formats
            $usedMB = if ($dev.vram_used) { [math]::Round($dev.vram_used / 1MB, 0) } 
                     elseif ($dev.used_mem_mb) { $dev.used_mem_mb } 
                     else { 0 }
            $freeMB = if ($dev.vram_free) { [math]::Round($dev.vram_free / 1MB, 0) } 
                     elseif ($dev.free_mem_mb) { $dev.free_mem_mb } 
                     else { 0 }
            $totalMB = if ($dev.vram_total) { [math]::Round($dev.vram_total / 1MB, 0) } 
                      elseif ($dev.total_mem_mb) { $dev.total_mem_mb } 
                      else { 24576 }
            
            return @{
                Used = $usedMB
                Free = $freeMB
                Total = $totalMB
                Timestamp = Get-Date -Format 'HH:mm:ss'
            }
        }
    } catch {
        # Silent fail if ComfyUI not responding
    }
    return $null
}
```

**Impact**: VRAM monitoring works regardless of ComfyUI API format changes.

### 4. Enhanced VRAM Statistics Reporting

**Problem**: Previous statistics only used manual samples (4 points).

**Solution**: Parse all samples from VRAM log for comprehensive statistics:

```powershell
# Parse VRAM log for peak/average/minimum (includes background samples)
if (Test-Path $vramLog) {
    $vramSamples = Get-Content $vramLog | Where-Object { $_ -match 'Used=(\d+)MB' } | ForEach-Object {
        if ($_ -match 'Used=(\d+)MB') { [int]$Matches[1] }
    }
    if ($vramSamples.Count -gt 0) {
        $peakVRAM = ($vramSamples | Measure-Object -Maximum).Maximum
        $avgVRAM = [math]::Round(($vramSamples | Measure-Object -Average).Average, 0)
        $minVRAM = ($vramSamples | Measure-Object -Minimum).Minimum
        
        Write-Summary "=== VRAM Usage Statistics ==="
        Write-Summary "Peak VRAM: $peakVRAM MB (from $($vramSamples.Count) samples)"
        Write-Summary "Average VRAM: $avgVRAM MB"
        Write-Summary "Minimum VRAM: $minVRAM MB"
    }
}
```

**Impact**: Accurate peak VRAM from continuous monitoring instead of sparse samples.

## Testing Status

### Validated ✅
- Timeout increase (360s allows 3.5 min generation + buffer)
- Background job starts correctly
- VRAM log receives periodic samples (every 5 seconds)
- Job cleanup at script end

### Needs Testing ⚠️
- Peak VRAM capture during active generation
- VRAM statistics accuracy with full generation run
- Memory cleanup effectiveness at scale (10+ scenes)

## Known Limitations

1. **ComfyUI Model Unloading**: Models unload immediately after generation, so spot checks miss peak usage. Background monitoring solves this.

2. **Cached Generation**: When videos are cached, ComfyUI doesn't load models and VRAM stays at 0. Testing requires clearing cache first.

3. **Sampling Interval**: 5-second sampling might miss very brief VRAM spikes. Could be reduced to 2-3 seconds if needed.

## Next Steps

1. Run full fresh generation test with new monitoring
2. Validate peak VRAM capture during active generation
3. Test with larger batches (10+ scenes) to validate memory cleanup
4. Consider adding `nvidia-smi` as fallback if ComfyUI API fails

## Files Modified

- `scripts/run-comfyui-e2e.ps1` (57 lines changed)
  - Lines 98-100: Increased FastIteration timeout to 360s
  - Lines 52-75: Enhanced Get-VRAMUsage with byte/MB format handling
  - Lines 93-112: Added background VRAM monitoring job
  - Lines 250-282: Stop job and parse all samples for statistics

## Commands for Testing

```powershell
# Clear cache and run fresh test
Remove-Item 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-*' -Force
pwsh scripts\run-comfyui-e2e.ps1 -FastIteration -SkipLLMHealthCheck

# Check VRAM log
Get-Content logs\<timestamp>\vram-usage.log | Measure-Object -Line  # Should show many samples
Get-Content logs\<timestamp>\vram-usage.log | Select-Object -Last 20  # Recent samples

# Verify peak capture
$samples = Get-Content logs\<timestamp>\vram-usage.log | Where-Object { $_ -match 'Used=(\d+)MB' } | 
           ForEach-Object { if ($_ -match 'Used=(\d+)MB') { [int]$Matches[1] } }
Write-Host "Peak: $(($samples | Measure-Object -Maximum).Maximum) MB"
Write-Host "Average: $([math]::Round(($samples | Measure-Object -Average).Average, 0)) MB"
Write-Host "Samples: $($samples.Count)"
```
