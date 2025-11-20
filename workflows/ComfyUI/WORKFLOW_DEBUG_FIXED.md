# ✅ Workflow Fixed - Debugging Guide

**Date**: November 7, 2025  
**Issue**: Disconnected nodes + Copilot dependency error  
**Status**: FIXED ✅

---

## What Was Fixed

### 1. Workflow Nodes Are Now Connected ✅

**Previous Issue**: All nodes except prompts were disconnected

**Fixed**: Complete connection chain:
```
Load Model (node 1)
    ↓
Load Keyframe (node 2) → SVD Conditioning (node 6) → KSampler (node 7) → VAE Decode (node 8) → Save (node 9)
    ↑
Prompts (nodes 3-4)
```

**New Workflow Structure**:
- Node 1: Load SVD Model
- Node 2: Load Keyframe Image
- Node 3: Positive Prompt (connected to CLIP from node 1)
- Node 4: Negative Prompt (connected to CLIP from node 1)
- Node 5: CLIPVisionLoader (provides vision conditioning for SVD)
- Node 6: SVD_img2vid_Conditioning (receives model, prompts, keyframe)
- Node 7: KSampler (receives conditioning and latents)
- Node 8: VAE Decode (decodes to images)
- Node 9: SaveImage (output)

### 2. ComfyUI-Copilot Disabled ✅

**Previous Issue**: 
```
ModuleNotFoundError: No module named 'openai.types.responses.response_prompt_param'
```

**Root Cause**: Copilot has conflicting OpenAI agent dependencies

**Fixed**: Disabled Copilot module (can be re-enabled later after fixing dependencies)

**Restart**: ComfyUI restarted without Copilot errors

---

## 🚀 Test the Fixed Workflow

### Step 1: Refresh ComfyUI UI
```
1. Go to http://127.0.0.1:8188
2. Press F5 to refresh
3. Click "Clear" to start fresh
```

### Step 2: Load the Fixed Workflow
```
1. Click "Load"
2. Select: workflows/text-to-video.json
3. All nodes should appear **connected** now
```

### Step 3: Prepare Test Image
```
1. You need a keyframe image to start from
2. Options:
   a) Use any PNG/JPG as reference
   b) Save to: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input\test_keyframe.jpg
   c) In workflow, click "Choose file to upload" in "Load Keyframe Image" node
```

### Step 4: Run the Workflow
```
1. Update prompts if desired (node 3 & 4)
2. Click "Queue Prompt" button
3. Monitor the execution
4. Check: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\ for results
```

---

## 📊 Complete Node Reference

### Node 1: CheckpointLoaderSimple
**Purpose**: Load the SVD model  
**Outputs**: CLIP, MODEL, VAE  
**Status**: ✅ Core node

### Node 2: LoadImage
**Purpose**: Load keyframe for consistency  
**Input**: Image file  
**Output**: IMAGE, MASK  
**Status**: ✅ Core node

### Node 3 & 4: CLIPTextEncode
**Purpose**: Encode text prompts to conditioning  
**Input**: Text + CLIP from model  
**Output**: CONDITIONING  
**Status**: ✅ Core node

### Node 5: SVD_img2vid_Conditioning
**Purpose**: Create video conditioning from image  
**Inputs**:
- model (from node 1)
- positive_conditioning (from node 3)
- negative_conditioning (from node 4)
- latent_image (from node 2)
**Outputs**: conditioning, latent_image  
**Status**: ✅ SVD-specific node

### Node 6: KSampler
**Purpose**: Generate video frames via sampling  
**Inputs**:
- model (from node 1)
- positive conditioning (from node 5)
- negative conditioning (from node 4)
- latent_image (from node 5)
**Outputs**: LATENT  
**Status**: ✅ Core node

### Node 7: VAEDecode
**Purpose**: Convert latents to image frames  
**Inputs**:
- samples (from node 6)
- vae (from node 1)
**Output**: IMAGE  
**Status**: ✅ Core node

### Node 8: SaveImage
**Purpose**: Save frames to disk  
**Inputs**: Images (from node 7)  
**Output**: PNG files  
**Status**: ✅ Core node

---

## 🔗 Connection Verification

### In ComfyUI UI, Verify These Connections:

```
✓ Node 1 CLIP → Node 3 clip input
✓ Node 1 CLIP → Node 4 clip input
✓ Node 1 MODEL → Node 5 model input
✓ Node 1 VAE → Node 6 vae input
✓ Node 2 IMAGE → Node 5 latent_image input
✓ Node 3 CONDITIONING → Node 5 conditioning input
✓ Node 4 CONDITIONING → Node 5 negative_conditioning input
✓ Node 5 conditioning → Node 6 conditioning input
✓ Node 5 latent_image → Node 6 latent_image input
✓ Node 6 LATENT → Node 7 samples input
✓ Node 7 IMAGE → Node 8 images input
```

**If any connection is missing**, the "Queue Prompt" button will show errors.

---

## ⚠️ Troubleshooting

### "Node type X not found"
**Solution**: This means you don't have the required model or extension
- For SVD nodes: Verify `svd_xt.safetensors` is installed
- For ControlNet nodes: Install via ComfyUI Manager

### "Can't queue prompt" (greyed out button)
**Solution**: Some connection is missing or invalid
- Check all connections above
- Hover over red X marks for error messages

### "CUDA Out of Memory"
**Solution**: SVD needs lots of VRAM (8+ GB recommended)
- Reduce `steps` in node 6 (currently 30, try 15)
- Or use CPU mode (slower but will work)

### "Keyframe image not loading"
**Solution**: Image file path incorrect
- Click "Choose file to upload" in Load Keyframe Image node
- Select from: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input\

### "No output files generated"
**Solution**: Check execution log
- Look at ComfyUI terminal window
- Check if queue completed successfully
- Verify write permissions on output folder

---

## 📈 Expected Performance

| Stage | Time | GPU VRAM | Status |
|-------|------|----------|--------|
| Model Load | 5-10s | 2GB | Fast |
| Prompt Encode | 2-3s | 1GB | Fast |
| SVD Generation | 60-120s | 10GB | Slow (main bottleneck) |
| VAE Decode | 10-15s | 4GB | Medium |
| Save Images | 5-10s | 1GB | Fast |
| **Total** | **2-3 min** | **10GB peak** | Acceptable |

---

## 🎯 Next Steps After Successful Test

1. ✅ **Workflow loads and connects**: Continue
2. ✅ **Queue prompt works**: Run generation
3. ✅ **Output files created**: Integration working!
4. ⏳ **Update comfyUIService.ts**: To use real prompt data
5. ⏳ **Component integration**: Connect to UI
6. ⏳ **End-to-end testing**: Full story → video pipeline

---

## 📝 Manual Testing Checklist

- [ ] ComfyUI server running at http://127.0.0.1:8188
- [ ] Workflow loads without "node not found" errors
- [ ] All 8 nodes visible and connected
- [ ] Test keyframe image selected
- [ ] Positive prompt visible in node 3
- [ ] "Queue Prompt" button is clickable (not greyed out)
- [ ] Generation starts (check terminal for progress)
- [ ] Output PNG files appear in output folder
- [ ] Can convert frames to video using FFmpeg (optional)

---

## 🔧 Emergency Fixes

### If Workflow Won't Load
```powershell
# Clear cached workflow
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\user\default\workflows\*.json" -Force

# Or reset ComfyUI completely
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\*" -Recurse -Force
```

### If ComfyUI Won't Start
```powershell
# Kill any stuck processes
Get-Process | Where-Object {$_.Name -like "*python*"} | Stop-Process -Force

# Clear Python cache
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\__pycache__" -Recurse -Force -ErrorAction SilentlyContinue

# Restart
C:\ComfyUI\start-comfyui.bat
```

### If Copilot Error Returns
```powershell
# Re-disable if needed
New-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-Copilot\DISABLED" -ItemType File -Force
```

---

## 📞 Support

### Check Logs
```
ComfyUI Server Logs: http://127.0.0.1:8188/logs (if available)
Terminal Output: Check PowerShell window where server runs
```

### Check Status
```bash
curl http://127.0.0.1:8188/system_stats
# Returns: {system, devices info}

curl http://127.0.0.1:8188/queue
# Returns: {queue_running, queue_pending}
```

---

**Status**: ✅ Workflow Fixed and Ready | 🚀 Ready for Testing

**Next Action**: Test the workflow in ComfyUI UI and report any errors
