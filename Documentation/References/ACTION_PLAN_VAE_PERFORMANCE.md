# Action Plan: VAE Decode Performance & Next Steps
**Date**: November 19, 2024  
**Issue**: WAN2 video generation stuck at VAE decode  
**Status**: 🔍 INVESTIGATING

---

## Issue Analysis

### What Happened
- Last test run (20251119-174327) showed "0s" generation times for all 3 videos
- **Root Cause**: Videos were served from ComfyUI cache (pre-existing outputs)
- **Real Issue**: When ComfyUI generates fresh videos, VAE decode stage becomes bottleneck
- **User Action**: Had to restart ComfyUI server to resolve

### Why VAE Decode Is Slow

**VAE (Variational AutoEncoder)** converts latent space representations back to pixel space:
```
Latent (compressed) → VAE Decode → Pixel Video (MP4)
```

**Bottlenecks**:
1. **VRAM Pressure**: RTX 3090 has 24GB, but:
   - LM Studio using GPU (32/32 layers = ~4-6GB)
   - WAN2 model loaded (~8-10GB)
   - VAE decode needs ~4-6GB
   - **Total**: 16-22GB (near capacity)

2. **Tiling**: When VRAM is tight, ComfyUI tiles the VAE decode:
   - Processes image in smaller chunks
   - Slower but prevents OOM errors
   - Can get stuck if memory fragmentation occurs

3. **Memory Leaks**: Long-running ComfyUI sessions can accumulate:
   - Cached tensors
   - Intermediate buffers
   - Requires periodic restart

---

## Immediate Fixes

### 1. Move LM Studio to CPU-Only Mode ✅ **PRIORITY**

**Current**: LM Studio using GPU (32/32 layers)  
**Target**: LM Studio CPU-only (0/32 layers)

**Why**: Free up 4-6GB VRAM for ComfyUI VAE decode

**Steps**:
1. Open LM Studio
2. Go to model settings (Mistral 7B Instruct v0.3)
3. Set **GPU Offload: 0 / 32** (slider to left)
4. Reload model

**Impact**:
- Story generation: 90s → ~120-150s (acceptable, only runs once)
- Video generation: No more VAE decode stalls
- ComfyUI VRAM: 24GB → ~18GB free (plenty of headroom)

### 2. Add VAE Tiling to WAN2 Workflow

**Edit**: `workflows/video_wan2_2_5B_ti2v.json`

**Add VAEDecodeTiled node** instead of standard VAEDecode:
```json
{
  "inputs": {
    "samples": ["3", 0],
    "vae": ["48", 2],
    "tile_size": 512  // Process in 512x512 chunks
  },
  "class_type": "VAEDecodeTiled"
}
```

**Benefits**:
- Handles VRAM pressure gracefully
- Prevents OOM crashes
- Minimal quality impact (barely noticeable)

### 3. Periodic ComfyUI Restart

**Add to run script** (`run-comfyui-e2e.ps1`):

```powershell
# Every N scenes, restart ComfyUI to clear memory
if ($sceneIndex % 10 -eq 0) {
    Write-Summary "Restarting ComfyUI to clear memory..."
    Restart-Service ComfyUI  # Or Stop-Process + Start
    Start-Sleep -Seconds 5
}
```

**Trigger**: After every 10 scenes (for large batches)

---

## Next Steps (Immediate)

### Step 1: LM Studio CPU-Only ⚠️ **DO THIS FIRST**

**Action**: Move LM Studio GPU offload from 32/32 → 0/32

**Verification**:
```powershell
# Check GPU memory before
nvidia-smi

# Move LM Studio to CPU

# Check GPU memory after (should free ~4-6GB)
nvidia-smi
```

### Step 2: Test WAN2 Generation with Fresh Videos

**Action**: Clear ComfyUI output cache and run fresh generation

```powershell
# Clear cached videos
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\*" -Recurse -Force

# Run E2E with fresh generation
pwsh -ExecutionPolicy Bypass -File scripts\run-comfyui-e2e.ps1 -FastIteration

# Monitor VRAM during generation
while ($true) {
    $stats = Invoke-RestMethod "http://127.0.0.1:8188/system_stats"
    Write-Host "VRAM Free: $($stats.devices[0].free_mem_mb) MB" -ForegroundColor Cyan
    Start-Sleep -Seconds 2
}
```

**Expected Result**: Generation completes without VAE decode stall

### Step 3: Add VAE Tiling (If Step 2 Still Slow)

**Action**: Modify WAN2 workflow to use tiled VAE decode

**Script**: Create `scripts/add-vae-tiling.ps1`

```powershell
$workflowPath = "workflows/video_wan2_2_5B_ti2v.json"
$workflow = Get-Content $workflowPath -Raw | ConvertFrom-Json

# Find VAEDecode node
$vaeNode = $workflow.PSObject.Properties | Where-Object { 
    $_.Value.class_type -eq "VAEDecode" 
}

if ($vaeNode) {
    # Replace with VAEDecodeTiled
    $vaeNode.Value.class_type = "VAEDecodeTiled"
    $vaeNode.Value.inputs | Add-Member -NotePropertyName "tile_size" -NotePropertyValue 512
    
    $workflow | ConvertTo-Json -Depth 20 | Set-Content $workflowPath
    Write-Host "✅ VAE tiling enabled (tile_size: 512)"
} else {
    Write-Host "⚠️ VAEDecode node not found"
}
```

### Step 4: Document Performance Baseline

**Action**: Record generation times with new configuration

**Template**:
```markdown
## WAN2 Performance (LM Studio CPU-Only)

**Configuration**:
- LM Studio: CPU-only (0/32 GPU layers)
- ComfyUI: Full GPU access (~18-20GB VRAM)
- VAE: Standard decode (no tiling)

**Results** (3 scenes):
- Scene 1: X seconds
- Scene 2: Y seconds
- Scene 3: Z seconds
- Average: N seconds/scene

**VRAM Usage**:
- Peak: X GB
- Average: Y GB
- Minimum free: Z GB
```

---

## Long-Term Optimizations (v1.1)

### 1. LM Studio GPU Offload Tuning

**Approach**: Use **partial** GPU offload (16/32 layers instead of 0/32 or 32/32)

**Benefits**:
- Faster story generation than CPU-only (~60s vs 150s)
- Still leaves 12-15GB for ComfyUI
- Best of both worlds

**When**: After confirming CPU-only resolves VAE issue

### 2. ComfyUI Memory Management

**Options**:
- Enable `--lowvram` flag (more aggressive memory management)
- Enable `--normalvram` flag (balanced)
- Add `--disable-cuda-malloc` (use PyTorch memory allocator)

**Test Command**:
```powershell
python -s ComfyUI\main.py --listen 0.0.0.0 --port 8188 --lowvram
```

### 3. Model Quantization

**WAN2 Model**: Consider using quantized version (FP16 → INT8)
- **VRAM**: ~50% reduction (8GB → 4GB)
- **Speed**: Minimal impact (<5% slower)
- **Quality**: Negligible difference for video

### 4. Batch Processing

**Workflow**: Process multiple shots in parallel (if VRAM allows)
- Queue 2-3 shots simultaneously
- Reduces overhead from model loading
- Requires ~12-16GB free VRAM

---

## Monitoring Commands

### GPU Memory (Real-Time)
```powershell
# Continuous monitoring
while ($true) {
    Clear-Host
    nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total --format=csv,noheader
    Start-Sleep -Seconds 2
}
```

### ComfyUI Queue Status
```powershell
# Check for stuck prompts
$queue = Invoke-RestMethod "http://127.0.0.1:8188/queue"
Write-Host "Running: $($queue.queue_running.Count)"
Write-Host "Pending: $($queue.queue_pending.Count)"
```

### Process Memory
```powershell
Get-Process python,lmstudio | Select ProcessName, @{N='Memory(GB)';E={[math]::Round($_.WS/1GB,2)}}
```

---

## Risk Assessment

| Action | Risk | Mitigation |
|--------|------|------------|
| **LM Studio CPU** | Story gen slower | Acceptable (runs once per project) |
| **VAE Tiling** | Slight quality loss | Test with sample first |
| **ComfyUI Restart** | Interrupts workflow | Only between scenes |
| **Clear Cache** | Re-download models | Models are local (no issue) |

---

## Success Criteria

✅ **Immediate Goal**: Generate 3 videos without VAE decode stall  
✅ **Target Time**: < 60 seconds per scene  
✅ **VRAM Headroom**: > 4GB free during generation  
✅ **Stability**: 10 consecutive successful runs  

---

## Next Steps Summary

1. **NOW**: Move LM Studio to CPU-only (0/32 GPU layers)
2. **Test**: Run fresh WAN2 E2E generation (clear cache first)
3. **Monitor**: Watch VRAM usage during VAE decode
4. **Optimize**: Add VAE tiling if still slow
5. **Document**: Record new performance baseline

**Estimated Time**: 15-20 minutes

---

**Status**: Ready to proceed with Step 1 (LM Studio CPU migration)  
**Blocker**: None (all dependencies available)  
**Next Agent**: Follow this action plan, prioritize Step 1
