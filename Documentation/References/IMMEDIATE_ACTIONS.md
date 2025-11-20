# Immediate Actions: Resolve VAE Decode Performance Issue
**Date**: November 19, 2024  
**Priority**: 🔴 HIGH  
**Estimated Time**: 15-20 minutes

---

## Quick Summary

**Problem**: WAN2 video generation getting stuck at VAE decode stage  
**Root Cause**: GPU VRAM contention between LM Studio (32/32 layers) and ComfyUI  
**Solution**: Move LM Studio to CPU-only mode to free up 4-6GB VRAM

---

## Step-by-Step Instructions

### ✅ Step 1: Move LM Studio to CPU-Only Mode (5 minutes)

**Current State**: LM Studio using GPU (32/32 layers = ~4-6GB VRAM)  
**Target State**: LM Studio CPU-only (0/32 layers = 0GB VRAM)

**Instructions**:
1. Open LM Studio application
2. Navigate to the model settings for **Mistral 7B Instruct v0.3**
3. Find the **GPU Offload** slider (currently at 32/32)
4. Move slider all the way to the **left** (0/32)
5. Click **Reload Model** or restart LM Studio

**Verification**:
```powershell
# Check VRAM before and after
nvidia-smi --query-gpu=memory.used --format=csv,noheader
```

**Expected Impact**:
- Story generation: 90s → ~120-150s (acceptable tradeoff)
- ComfyUI VRAM: 4-6GB freed for VAE decode
- No more stuck generations

---

### 🧪 Step 2: Test with Fresh Video Generation (5 minutes)

**Purpose**: Verify VAE decode works without stalling

**Instructions**:

```powershell
# 1. Clear ComfyUI output cache to force fresh generation
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\*" -Recurse -Force -ErrorAction SilentlyContinue

# 2. Run E2E test with monitoring
pwsh -ExecutionPolicy Bypass -File scripts\run-comfyui-e2e.ps1 -FastIteration

# 3. In another terminal, monitor VRAM in real-time
while ($true) {
    $stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" -ErrorAction SilentlyContinue
    if ($stats) {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') - VRAM Free: $($stats.devices[0].free_mem_mb) MB" -ForegroundColor Cyan
    }
    Start-Sleep -Seconds 2
}
```

**Expected Result**:
- All 3 videos generate without stalling
- VAE decode completes within 10-20 seconds per scene
- VRAM free stays above 4GB during generation

**If It Fails**: Proceed to Step 3 (VAE Tiling)

---

### ⚙️ Step 3: Add VAE Tiling (If Needed) (5 minutes)

**Purpose**: Use tiled VAE decode to reduce memory pressure

**Instructions**:

```powershell
# Run the VAE tiling script
pwsh -ExecutionPolicy Bypass -File scripts\add-vae-tiling.ps1

# Restart ComfyUI (use VS Code task)
# Task: "Start ComfyUI Server (Patched - Recommended)"

# Re-run test
pwsh -ExecutionPolicy Bypass -File scripts\run-comfyui-e2e.ps1 -FastIteration
```

**What This Does**:
- Changes `VAEDecode` → `VAEDecodeTiled` in workflow
- Processes video in 512×512 pixel chunks
- Reduces peak VRAM usage by ~30-40%
- Minimal quality impact (barely noticeable)

---

### 📊 Step 4: Document New Baseline (5 minutes)

**Purpose**: Record performance metrics with new configuration

**Instructions**:

```powershell
# Create performance report
$report = @"
## WAN2 Performance Baseline (Post-LM Studio Migration)

**Date**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

**Configuration**:
- LM Studio: CPU-only (0/32 GPU layers)
- ComfyUI: Full GPU access
- VAE: $(if (Test-Path "workflows\video_wan2_2_5B_ti2v.json.backup*") { "Tiled (512px)" } else { "Standard" })

**Test Run**: $(Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty Name)

**Results**:
"@

# Get last run summary
$lastRun = Get-ChildItem logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$summary = Get-Content "$($lastRun.FullName)\run-summary.txt" -ErrorAction SilentlyContinue

if ($summary) {
    $sceneTimings = $summary | Select-String "Wan2 video generation succeeded" | ForEach-Object {
        if ($_ -match "scene-(\d+).*total time: ([\d.]+)s") {
            "- Scene $($matches[1]): $($matches[2])s"
        }
    }
    $report += "`n" + ($sceneTimings -join "`n")
}

# Get VRAM stats
$stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats" -ErrorAction SilentlyContinue
if ($stats) {
    $report += @"
    
**VRAM Usage**:
- Total: $($stats.devices[0].total_mem_mb) MB
- Free: $($stats.devices[0].free_mem_mb) MB
- Used: $($stats.devices[0].used_mem_mb) MB
"@
}

$report | Out-File "PERFORMANCE_BASELINE_$(Get-Date -Format 'yyyyMMdd-HHmmss').md"
Write-Host "✓ Performance baseline documented" -ForegroundColor Green
```

---

## Troubleshooting

### Issue: ComfyUI Still Stalls at VAE Decode

**Try**:
1. Restart ComfyUI server completely
2. Check VRAM: `nvidia-smi` (should show >10GB free)
3. Enable VAE tiling (Step 3)
4. Reduce video resolution in workflow (1024×576 → 768×432)

### Issue: LM Studio Won't Start After CPU Migration

**Try**:
1. Close LM Studio completely
2. Restart application
3. Model should load automatically in CPU-only mode
4. Verify with task manager (LM Studio using CPU, not GPU)

### Issue: Videos Generate But Look Lower Quality

**Check**:
1. Ensure VAE tiling tile_size is 512 (not smaller)
2. Compare before/after side-by-side (difference should be minimal)
3. If quality matters, revert to standard VAE and use LM Studio partial offload (16/32)

---

## Quick Reference Commands

```powershell
# Check GPU memory
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader

# Check ComfyUI queue
Invoke-RestMethod "http://127.0.0.1:8188/queue" | ConvertTo-Json -Depth 2

# Clear video cache
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\*" -Recurse -Force

# Run E2E test
pwsh scripts\run-comfyui-e2e.ps1 -FastIteration

# Add VAE tiling
pwsh scripts\add-vae-tiling.ps1

# Revert VAE tiling
$backup = Get-ChildItem "workflows\video_wan2_2_5B_ti2v.json.backup*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $backup.FullName "workflows\video_wan2_2_5B_ti2v.json" -Force
```

---

## Success Criteria

✅ **Immediate Goal**: 3 videos generate without VAE decode stall  
✅ **Performance**: < 60 seconds per scene (fresh generation)  
✅ **Stability**: No ComfyUI restarts required during generation  
✅ **VRAM**: > 4GB free during peak usage  

---

## Next Steps After This Is Working

1. **Document baseline** performance metrics
2. **Optimize LM Studio** with partial GPU offload (16/32 layers)
3. **Test larger batches** (10+ scenes)
4. **Explore model quantization** (FP16 → INT8 for WAN2)
5. **Add telemetry** to track VRAM usage over time

---

**Status**: Ready to execute  
**Blocker**: None  
**Dependencies**: LM Studio application access  
**Time**: 15-20 minutes

---

## Checklist

- [ ] Step 1: Move LM Studio to CPU-only (0/32 layers)
- [ ] Step 2: Clear video cache and run fresh E2E test
- [ ] Step 3: (If needed) Add VAE tiling to workflow
- [ ] Step 4: Document new performance baseline
- [ ] Verify: 3/3 videos generate successfully
- [ ] Verify: No VAE decode stalls or hangs
- [ ] Verify: VRAM free > 4GB during generation

**Once complete**, report back with:
- Performance metrics (seconds per scene)
- VRAM usage stats
- Any issues encountered
