# Resource Management Guide

## Problem: Resource Contention During Video Generation

When running the full E2E pipeline (story generation + video generation), system resources become constrained:

### Resource Requirements

| Component | CPU | RAM | GPU VRAM | Notes |
|-----------|-----|-----|----------|-------|
| **ComfyUI (WAN I2V)** | 16% | ~2GB | 21GB/40GB | GPU-intensive, 85% utilization |
| **Mistral Nemo (CPU mode)** | ~20% | ~4GB | 0GB | CPU-only (no GPU offload) |
| **Dev Server** | <5% | ~500MB | 0GB | Minimal |
| **Total (Concurrent)** | ~40% | ~6.5GB | 21GB | Resource conflict |

### Observed Issues

1. **CPU Contention**: Mistral Nemo on CPU competes with ComfyUI's CPU preprocessing
2. **RAM Pressure**: Combined usage approaches 50% of 32GB
3. **Video Generation Slowdown**: ComfyUI performance degrades when LM Studio active

## Solutions

### Option 1: Sequential Workflow (Recommended)

**Stop LM Studio after story generation, before video generation:**

```powershell
# 1. Generate story with Mistral Nemo
npm run dev
# Generate story in browser, then close browser

# 2. Stop LM Studio
# Close LM Studio app or unload model

# 3. Run video generation
pwsh scripts/run-comfyui-e2e.ps1 -FastIteration -SkipLLMHealthCheck
```

### Option 2: Use Smaller LLM Model (Recommended)

**Configure Mistral 7B instead of larger models:**

1. Open LM Studio → Load **mistralai/mistral-7b-instruct-v0.3**
2. Go to "Advanced Settings"
3. Enable "GPU Offload" → Set to **Auto** or **40/40 layers**
4. Enable "Offload KV Cache to GPU Memory"
5. Reload model

**Benefits:**
- Uses only ~5GB GPU VRAM (vs 10GB for Nemo 12B)
- Still produces quality story generation
- Faster inference: 5-10 tokens/sec on GPU
- More VRAM headroom for ComfyUI

**Updated VRAM Profile** (RTX 3090 40GB):

| Component | GPU VRAM Required |
|-----------|-------------------|
| Mistral 7B (GPU mode) | ~5GB |
| ComfyUI (WAN I2V) | 21GB |
| **Total if concurrent** | **26GB** |
| **Available** | **40GB** |
| **Buffer** | **14GB** ✅ Safe |

**Conclusion**: With Mistral 7B, you have more flexibility, but sequential workflow is still recommended to maximize stability.

### Option 3: Use Smaller Model

**Switch to lighter model during video generation:**

```bash
# In .env.local, use a smaller model
VITE_LOCAL_LLM_MODEL=mistralai/mistral-7b-instruct-v0.3  # ~4GB VRAM
```

Or use Gemini API instead of local LLM:
```bash
# Disable local LLM, use Gemini instead
VITE_LOCAL_STORY_PROVIDER_URL=  # Leave empty to use Gemini
```

### Option 4: Increase System Resources

If running both concurrently is required:
- Add more RAM (32GB → 64GB)
- Upgrade GPU (RTX 3090 24GB → RTX 4090 24GB or A6000 48GB)
- Use separate machines for LLM and ComfyUI

## Automated Script: Stop LM Studio Before Video Gen

Created helper script to automate sequential workflow:

```powershell
# scripts/run-full-pipeline-managed.ps1
# Automatically manages LM Studio lifecycle

.\scripts\run-full-pipeline-managed.ps1
```

This script:
1. Starts LM Studio with Mistral Nemo
2. Generates story
3. **Stops LM Studio** (frees resources)
4. Runs ComfyUI video generation
5. Restarts LM Studio if needed

## Monitoring Resources

### During Video Generation

```powershell
# Watch GPU usage
nvidia-smi -l 1

# Watch system resources
Get-Process | Where-Object {$_.Name -like '*python*' -or $_.Name -like '*LM Studio*'} | 
  Select-Object Name, CPU, WorkingSet64 | Format-Table -AutoSize
```

### ComfyUI Resource Profile

Typical VRAM usage per scene (WAN I2V):
- Model loading: ~18GB baseline
- Generation peak: ~21GB
- With multiple scenes queued: Can spike to ~23GB

## Best Practices

### For Development/Testing
1. ✅ Use sequential workflow (stop LM Studio before video gen)
2. ✅ Enable GPU offload in LM Studio
3. ✅ Use `-FastIteration` flag (MaxWait=360s vs 600s)

### For Production
1. ✅ Separate services on different machines
2. ✅ Use Gemini API for story generation (no local resources)
3. ✅ Dedicated GPU for ComfyUI only

### Resource Allocation Priority

When resources are limited:
1. **ComfyUI** gets priority (GPU-bound, critical path)
2. **LM Studio** can wait or run on separate machine
3. **Dev Server** is lightweight, minimal impact

## Troubleshooting

### Video Generation Stalls/Slows Down
**Symptom**: ComfyUI generation takes >5 minutes per scene
**Solution**: Stop LM Studio to free CPU/RAM

### Out of Memory Errors
**Symptom**: ComfyUI crashes with CUDA OOM
**Solution**: 
- Reduce batch size in ComfyUI
- Close other GPU applications
- Use lighter ComfyUI models

### System Becomes Unresponsive
**Symptom**: CPU at 100%, system lag
**Solution**:
- Enable GPU offload for Mistral Nemo
- Reduce LM Studio context size (128K → 32K)
- Close unnecessary applications

## Metrics from Testing

### E2E Pipeline with Mistral Nemo (CPU mode) - **SLOW**
- Story generation: 744ms (good)
- Scene 1 video: ~68s+ (slow due to contention)
- **Issue**: CPU contention slowed ComfyUI

### E2E Pipeline with LM Studio Stopped - **FAST**
- Story generation: Pre-generated
- Scene 1 video: ~45-60s (normal)
- **Result**: 20-30% faster video generation

### Recommended Configuration
- Story generation: Mistral Nemo on **GPU** (enable offload)
- Video generation: ComfyUI on **GPU** (exclusive when possible)
- Sequential workflow: Best reliability and speed
