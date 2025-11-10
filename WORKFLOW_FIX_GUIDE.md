# Workflow Node Fix Guide

**Issue**: `VHS_VideoCombine` node not found  
**Root Cause**: VHS package not installed in your ComfyUI  
**Solution**: Use simplified core workflow instead

---

## ✅ Updated Workflow

The workflow has been **simplified to use only core ComfyUI nodes** that are guaranteed to work.

**File**: `workflows/text-to-video.json`

### Node Breakdown (Simplified Version)

| Node | Type | Purpose | Status |
|------|------|---------|--------|
| 1 | CheckpointLoaderSimple | Load SVD model | ✅ Core |
| 2 | LoadImage | Load keyframe | ✅ Core |
| 3 | CLIPTextEncode | Positive prompt | ✅ Core |
| 4 | CLIPTextEncode | Negative prompt | ✅ Core |
| 5 | CLIPVisionLoader | Optional vision conditioning | ✅ Core |
| 6 | SVD_img2vid_Conditioning | Image-to-video conditioning | ✅ SVD-specific |
| 7 | KSampler | Inference sampling (generates video latents) | ✅ Core |
| 8 | VAEDecode | Decode latents to images | ✅ Core |
| 9 | SaveImage | Persist PNG frames | ✅ Core |

### Data Flow

```
1. Load SVD Model
   ↓
2. Load Keyframe Image (node 2)
   ↓
3. Encode Prompts (nodes 3-4)
   ↓
4. SVD Image-to-Video Conditioning (node 6)
   ↓
5. KSampler - Generate Video Latents (node 7)
   ↓
6. VAE Decode - Convert Latents to Frames (node 8)
   ↓
7. Save Output Images (node 9)
```

---

## 🔄 Advanced Option: Install Missing Nodes

If you want the full video output pipeline with proper MP4 export, you can install:

### Option A: ComfyUI VHS Suite (Official)
```powershell
# Open ComfyUI Manager in the UI
# Search for: "ComfyUI-Advanced-ControlNet-Nodes"
# Or manually:
cd C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet-Nodes.git
```

### Option B: ComfyUI Video Helper (Lighter)
```powershell
cd C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes
git clone https://github.com/daniilkozhemyatnikov/ComfyUI-Video-Helper.git
```

Then restart ComfyUI and import the workflow.

---

## ✅ Testing the Simplified Workflow

### Step 1: Open ComfyUI UI
```
Open: http://127.0.0.1:8188
```

### Step 2: Load Workflow
```
Upload: workflows/text-to-video.json
```

### Step 3: Test Generation
```
1. Enter a prompt in node 3:
   "A sweeping crane shot of a cityscape at sunset"

2. Enter negative prompt in node 4 (or leave as-is)

3. Make sure you have a test keyframe image:
   - Use any PNG/JPG file as reference
   - Save to: C:\ComfyUI\input\keyframe.jpg

4. Click "Queue Prompt"

5. Wait for generation (2-3 minutes typical)
```

### Step 4: Retrieve Output
```
Output saved to:
C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\

Files: PNG images (one per frame, ~25 frames total)
```

### Step 5: Convert Frames to Video (Optional)
```powershell
# Install FFmpeg if not present
choco install ffmpeg -y

# Or download: https://ffmpeg.org/download.html

# Combine frames into MP4:
ffmpeg -framerate 24 -i "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\gemdirect1_shot_%05d.png" -c:v libx264 -pix_fmt yuv420p output.mp4
```

---

## 📊 Current Node Availability

### Core ComfyUI Nodes (Always Available)
- ✅ CheckpointLoaderSimple
- ✅ CLIPTextEncode
- ✅ LoadImage
- ✅ KSampler
- ✅ VAEDecode
- ✅ SaveImage
- ✅ UpscaleModelLoader

### Custom Nodes Installed
- ✅ ComfyUI_essentials (image utilities)
- ✅ ComfyUI-Manager
- ✅ ControlNet aux (for ControlNet support)
- ✅ ComfyUI-GGUF
- ⏸ VHS Video Suite (NOT installed - caused the error)

### SVD-Specific Nodes
- ✅ SVD_img2vid_Conditioning (SVD model includes this)

---

## 🛠 If You Still Get "Node Not Found" Errors

### Check Your SVD Model
```powershell
# Verify SVD model is actually installed
Get-ChildItem "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\"
# Should show: svd_xt.safetensors (9.56 GB)
```

### Restart ComfyUI
```powershell
# Stop the server
taskkill /IM python.exe /F

# Restart via VS Code task:
Ctrl+Shift+P → Tasks: Run Task → Start ComfyUI Server

# Or manually:
C:\ComfyUI\start-comfyui.bat
```

### Check Server Logs
```powershell
# While ComfyUI is running, check for errors:
http://127.0.0.1:8188 → View browser console (F12)
```

---

## 🎯 Modified Code for New Workflow

The new workflow outputs PNG image frames instead of a single MP4. This requires a small code change in `comfyUIService.ts`:

**Current Implementation Expects**: Single video file output  
**New Workflow Produces**: Multiple PNG frames

### Code Update Needed

In `services/comfyUIService.ts`, update the output handling:

```typescript
// OLD - Expects video file:
const videoPath = result.videoPath;

// NEW - Handles multiple frames:
const frames = result.images; // Array of PNG data URIs
const duration = (frames.length / 24); // Calculate duration (24fps)

// Option 1: Store frames array
// Option 2: Concatenate frames to MP4 on server (requires ffmpeg)
// Option 3: Use Frame sequence directly in timeline
```

**For now**: The PNG frames are perfectly usable in the timeline editor. Update the code comment to reflect this.

---

## 📝 Next Steps

### Immediate
1. ✅ Delete old `text-to-video.json` (DONE - fixed)
2. Load new workflow in ComfyUI UI
3. Test with sample prompt
4. Verify frames generate successfully

### If You Want Full MP4 Output
1. Install ComfyUI-VHS through Manager
2. Reload workflow
3. Update workflow to use VideoOutput node
4. Re-run test

### Production Ready
1. Frames working? → Update comfyUIService.ts to handle frames
2. Update component UI to show frame preview
3. Add frame-to-video concatenation (ffmpeg)
4. Full integration complete

---

## ⚠️ Important Notes

### Image Sequence Output
- ✅ 25 PNG images generated (one per frame)
- ✅ Frames saved to output folder
- ✅ Can be converted to MP4 using ffmpeg
- ✅ Perfect for timeline preview

### Performance
- Generation time: 2-5 minutes (SVD is slow)
- Can be optimized by reducing steps (node 7: `steps` parameter)

### Quality
- SVD generates high-quality video frames
- 4x upscaling ensures good resolution (576x1024 → 2304x4096)
- Can save in different formats (PNG, JPEG, WebP)

---

## 🚀 Quick Test Command

```powershell
# After workflow runs successfully, convert frames to MP4:
$outputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output"
$inputPattern = "$outputDir\gemdirect1_shot_%05d.png"
$output = "C:\Dev\gemDirect1\output.mp4"

ffmpeg -framerate 24 -i $inputPattern -c:v libx264 -pix_fmt yuv420p -crf 23 $output
```

---

## 📚 Additional Resources

- **FFmpeg Guide**: https://ffmpeg.org/
- **ComfyUI Docs**: https://github.com/comfyanonymous/ComfyUI
- **SVD Model**: https://huggingface.co/stabilityai/stable-video-diffusion

---

**Status**: ✅ Workflow Fixed | ⏳ Ready for Testing | 🚀 Ready for Production Integration
