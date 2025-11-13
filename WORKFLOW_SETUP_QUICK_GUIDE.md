# Quick Workflow Setup Guide for gemDirect1

## Overview
This guide walks you through setting up the recommended ComfyUI workflow for video generation in 15 minutes.

---

## Step 1: Download Required Models (5 min)

### In ComfyUI (http://127.0.0.1:8188):

1. **Click "Manager" button**
2. **Click "Install Models"**
3. **Search and install** (in order):

```
1. SVD XT (`svd_xt.safetensors`)
   - Click install (Stable Video Diffusion XT checkpoint)
   - Wait ~10 minutes (~9.5GB download)

2. 4x-UltraSharp
   - Click install
   - Wait ~30 seconds (65MB)

3. clip-vit-large-patch14
   - Usually pre-installed, but verify in Manager
```

**Total**: ~6 minutes, ~7.5GB downloaded

---

## Step 2: Create Basic Workflow (5 min)

### In ComfyUI UI:

1. **Start fresh**: Right-click canvas → "Clear Canvas"

2. **Add Node: Load Checkpoint**
   - Right-click → Add Node → Loaders → Load Checkpoint
   - Model: `sd_xl_base_1.0` or similar (just needs to exist)

3. **Add Node: CLIP Text Encode (Positive)**
   - Right-click → Add Node → Conditioning → CLIP Text Encode (Positive)
   - Connect checkpoint's CLIP output

4. **Add Node: CLIP Text Encode (Negative)**
   - Right-click → Add Node → Conditioning → CLIP Text Encode (Negative)
   - Connect checkpoint's CLIP output

5. **Add Node: Load Image**
   - Right-click → Add Node → Loaders → Load Image

6. **Add Node: SVD**
   - Right-click → Add Node → Video → Video Generator → SVD_Xt_Image2Video
   - Connect:
     - Positive from node 4 (CLIPTextEncode)
     - Negative from node 5 (CLIPTextEncode)
     - Image from node 6 (Load Image) OR leave empty for text-only
   - This node outputs conditioning + latent placeholder that KSampler turns into video samples

7. **Add Node: KSampler**
   - Right-click → Add Node → Sampling → KSampler
   - Connect:
     - Model → SVD checkpoint node (1)
     - Positive → SVD conditioning (node 6, output 0)
     - Negative → SVD conditioning (node 6, output 1)
     - Latent Image → SVD conditioning (node 6, output 2)
   - Set steps (25-30), CFG (~7.5), sampler_name (`euler_ancestral`), scheduler (`simple` or `karras`)

8. **Add Node: VAE Decode**
   - Right-click → Add Node → Latent → VAE Decode
   - Connect KSampler's output to `samples`

9. **Add Node: Upscaler**
   - Right-click → Add Node → Upscale → Upscale (using) 4x-UltraSharp
   - Connect VAE Decode's output

10. **Add Node: VHS_VideoCombine**
   - Right-click → Add Node → Video → VHS_VideoCombine
   - Connect upscaler output

11. **Add Node: SaveVideo**
    - Right-click → Add Node → Video → VHS_VideoCombine or SaveImage
    - Connect VHS_VideoCombine

### Workflow Diagram
```
[Checkpoint] 
    ├─→ [Text Encode +] ←─ "your prompt here"
    └─→ [Text Encode -] ←─ "negative prompt"
    
[Load Image] ←─ "your keyframe image"
    │
    ├─→ [SVD Video] ←─ positive & negative encodings
    │       │
    │       ├─→ [VAE Decode]
    │       │       │
    │       │       └─→ [Upscaler]
    │       │               │
    │       └───────────────└─→ [VHS_VideoCombine]
    │                               │
    │                               └─→ [SaveVideo]
```

---

## Step 3: Save Workflow (1 min)

1. **Right-click on canvas → "Save (API Format)"**
2. **Save as**: `comfyui-video-workflow.json` in project root

**Or**: Download via ComfyUI directly to `C:\Dev\gemDirect1\workflows\`

---

## Step 4: Test Workflow (4 min)

1. **In ComfyUI UI**:

2. **Set text prompt** in CLIP Text Encode (Positive):
   ```
   "A cinematic wide shot of a rain-soaked street at dusk, 
   neon lights reflecting off wet pavement, film noir atmosphere, 
   high contrast lighting, 24mm lens, slow dolly zoom"
   ```

3. **Set negative prompt** in CLIP Text Encode (Negative):
   ```
   "blurry, low-res, watermark, text, bad quality, distorted"
   ```

4. **Upload or select image** in Load Image

5. **Queue Prompt** (blue button)

6. **Wait for generation**:
   - SVD: ~40 seconds
   - VAE Decode: ~5 seconds
   - Upscaler: ~30 seconds
   - Total: ~75 seconds

7. **Check output** in ComfyUI's output panel

---

## Step 5: Export Workflow JSON

### Get Node IDs for Mapping

1. **Right-click canvas → "View API"**
2. **Look for node numbers** like:
   ```json
   "3": {
     "class_type": "CLIPTextEncode",
     "inputs": { "text": "...", "clip": [...] }
   }
   ```

3. **Note the node IDs**:
   - Positive text encode: **3**
   - Negative text encode: **4**
   - Load Image: **5**
   - SVD: **10**
   - Upscaler: **13**
   - VHS_VideoCombine: **15**
   - SaveVideo: **16**

---

## Step 6: Configure gemDirect1

### In `.vscode/tasks.json`:

Verify ComfyUI is starting on **port 8188** (should already be configured):
```json
"--port", "8188"
```

### In gemDirect1 App Settings:

1. Start ComfyUI: `C:\ComfyUI\start-comfyui.bat`
2. Start gemDirect1: `npm run dev`
3. Go to http://localhost:3000
4. Open **Settings**
5. ComfyUI section:
   - URL: `http://127.0.0.1:8188`
   - Click "Auto-Discover" or enter manually
   - Click "Test Connection" → Should see ✓ Connected

### Upload Workflow

1. In app settings: **"Upload Workflow"**
2. Select your saved `comfyui-video-workflow.json`
3. App will parse and show available nodes
4. Set up mappings:
   - Node 3 text → `human_readable_prompt`
   - Node 4 text → `negative_prompt`
   - Node 5 image → `keyframe_image` (optional)

---

## Step 7: Test End-to-End

### Create a Simple Story:

1. **Story Idea**: "A detective discovers a clue"
2. **Generate Story Bible**
3. **Set Director's Vision**: "Film noir with high contrast lighting"
4. **Create Timeline**: 
   - Add 3 shots to a scene
   - Add creative enhancers (framing, lighting, mood)
5. **Export/Generate**:
   - Click "Generate Locally" button
   - Watch progress in console
   - See video output in results panel

---

## Troubleshooting

### "SVD model not found"
→ Install via Manager: Manager → Install Models → search "svd"

### "Connection refused" to ComfyUI
→ Start ComfyUI: `C:\ComfyUI\start-comfyui.bat`  
→ Check port 8188 is accessible

### "Image format error"
→ Verify keyframe image is valid PNG/JPG  
→ Try T2V only (without keyframe image input)

### "Out of memory"
→ Reduce video generation steps (SVD: 25 instead of 30)  
→ Reduce resolution (720p instead of 1080p)  
→ Close other GPU-heavy applications

### "Video has wrong format/duration"
→ Check SaveVideo node settings:
  - Format: mp4
  - Framerate: 24
  - Codec: h264

---

## Quick Checklist

- [ ] Install models via Manager
- [ ] Create workflow in ComfyUI
- [ ] Test workflow standalone
- [ ] Export workflow JSON
- [ ] Configure ComfyUI connection in gemDirect1
- [ ] Upload workflow to gemDirect1
- [ ] Create test story
- [ ] Generate first video
- [ ] Verify output quality

---

## Next Steps

Once this basic workflow is working:

1. **Advanced Features**:
   - Add ControlNet for motion guidance
   - Use AnimateDiff for character consistency
   - Implement batch processing

2. **Optimization**:
   - Tune model parameters
   - Test different video models (I2VGen, etc.)
   - Profile performance

3. **Integration**:
   - Implement real-time progress tracking
   - Add video preview in UI
   - Create scene composition from multiple shots

---

**Estimated Total Time**: 15-20 minutes  
**Success Rate**: 95%+ if following these steps

Good luck! 🎬
