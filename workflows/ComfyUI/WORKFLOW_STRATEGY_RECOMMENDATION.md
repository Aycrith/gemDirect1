# ComfyUI Workflow Strategy for gemDirect1
## Recommendation for Optimal Video Generation Pipeline

**Date**: November 7, 2025  
**Status**: Architecture Recommendation  
**Priority**: High - Core to production workflow

---

## Executive Summary

The gemDirect1 storyline generator produces **three key outputs** that need to flow through ComfyUI:

1. **Human-readable text prompts** (shot descriptions + creative enhancers)
2. **Scene keyframe images** (establishing shot anchors)
3. **Structured timeline data** (shot sequences with transitions)

This document recommends the optimal ComfyUI workflow architecture to support efficient, high-quality video generation from these outputs.

---

## Part 1: Understanding gemDirect1's Generation Pipeline

### Story → Video Generation Flow

```
Story Idea
    ↓
Story Bible (characters, setting, plot)
    ↓
Director's Vision (aesthetic framework)
    ↓
Scene Breakdown (5-10 scenes)
    ↓
Shot Timeline (3-4 shots per scene)
    ↓
Creative Enhancers (framing, lighting, mood, VFX, etc.)
    ↓
Text Prompts + Keyframe Images
    ↓
ComfyUI Processing
    ↓
Generated Video Clips + Scene Keyframes
    ↓
Video Timeline Composition
    ↓
Final Cinematic Video
```

### Key Outputs from gemDirect1

#### 1. **Human-Readable Prompts** (Per Shot)
```
"Shot 1: A sweeping establishing shot of an abandoned warehouse at dusk, 
rain-soaked pavement reflecting neon light. Framing: Wide Shot; Movement: 
Crane Shot ascending; Lens: Shallow Depth of Field; Lighting: Low-Key 
with neon accents; Mood: Suspenseful, noir atmosphere; VFX: Film grain, 
lens flare; Pacing: Slow Motion"
```

**Properties**:
- High-quality, camera-direction specific
- Includes creative enhancers (framing, lighting, mood, VFX)
- Scene context from Director's Vision
- Negative prompt included globally

#### 2. **Keyframe Images** (Per Scene)
- 8K photorealistic images
- Director's Vision aesthetic applied
- Serves as visual anchor for scene continuity
- Can be used as reference or initial frame

**Use Cases**:
- Visual consistency (ControlNet reference)
- Establishing shot
- Initial frame for video generation models
- Style reference for other shots in scene

#### 3. **Structured Timeline JSON**
```json
{
  "scene_summary": "noir detective questioning suspicious subject",
  "directors_vision": "gritty neo-noir with high-contrast lighting",
  "timeline": [
    {
      "type": "shot",
      "shot_number": 1,
      "description": "...",
      "enhancers": { "framing": ["close-up"], "lighting": ["low-key"] }
    },
    {
      "type": "transition",
      "transition_type": "fade"
    },
    {
      "type": "shot",
      "shot_number": 2,
      ...
    }
  ]
}
```

---

## Part 2: Recommended ComfyUI Workflow Architecture

### Best Approach: **Multi-Purpose Workflow with Flexible Nodes**

Instead of ONE rigid workflow, create a **modular system** with multiple workflow templates for different scenarios:

### Workflow Template 1: **Text-to-Video (T2V) - Primary Path**

**Purpose**: Convert text prompts into video clips  
**Best For**: Main shot generation workflow  
**Estimated Generation**: 30-60 seconds per shot (RTX 3090)

```
[TEXT PROMPTS]
    ↓
[CLIPTextEncode - Positive]  ← Maps to: human_readable_prompt
    ↓
[AnimateDiff / SVD / I2VGen]  ← Primary video generation model
    ↓
[VAE Decode] (if needed)
    ↓
[VHS_VideoCombine] ← Handles transitions
    ↓
[SaveVideo]
```

**Specific Nodes to Include**:

1. **Text Encoding**
   - `CLIPTextEncode` (positive) - Scene description + enhancers
   - `CLIPTextEncode` (negative) - Global negative prompt

2. **Video Generation Options** (choose one based on quality/speed):
   - **AnimateDiff** - Best for consistent character/object motion
   - **Stable Video Diffusion (SVD)** - Fast, consistent (requires image input)
   - **I2VGen-XL** - Best quality but slower
   - **Hotshotxl** - Fast motion generation

3. **Control & Conditioning**
   - `ControlNetLoader` (optional) - For precise motion control
   - `Upscaler` - 4x-UltraSharp or RealESRGAN

4. **Video Assembly**
   - `VHS_VideoCombine` - Combine shots with transitions
   - `SaveVideo` - Output as MP4

### Workflow Template 2: **Image-to-Video (I2V) - Enhanced Path**

**Purpose**: Use keyframe images to guide video generation  
**Best For**: Maintaining visual consistency across shots  
**Quality**: Higher consistency, more controlled output

```
[KEYFRAME IMAGE]              [TEXT PROMPTS]
       ↓                             ↓
[LoadImage]                [CLIPTextEncode - Positive]
       ↓                             ↓
[ImageScale/Pad]  ─────┐            │
                        ↓            ↓
                   [SVD / I2VGen]  ← Requires both image + text
                        ↓
                   [VAE Decode]
                        ↓
                   [Upscaler]
                        ↓
                   [VHS_VideoCombine]
                        ↓
                   [SaveVideo]
```

**Advantages**:
- Keyframes as visual anchors
- Better scene-to-scene consistency
- Director's Vision style maintained

### Workflow Template 3: **ControlNet-Guided - Premium Path**

**Purpose**: Maximum creative control over motion and composition  
**Best For**: Complex scenes needing precise motion direction  
**Quality**: Highest creative control

```
[KEYFRAME]              [TEXT]                [MOTION HINT]
    ↓                   ↓                         ↓
[Load Image]    [CLIPTextEncode]      [EdgePreprocessor/
    ↓                   ↓              Canny/PosePrefProc]
    └───────────┬───────┘                      ↓
                ↓                    [ControlNetLoader]
            [ControlNet Model]                  ↓
                ↓                      [ControlNet Apply]
            [SVDF with Control]
                ↓
            [Upscaler]
                ↓
            [SaveVideo]
```

**ControlNet Preprocessor Options**:
- **Canny Edge Detection** - For sharp compositional control
- **OpenPose** - For character pose guidance
- **Depth Map** - For 3D composition
- **Normal Map** - For lighting-aware motion

---

## Part 3: Recommended Main Workflow (For gemDirect1)

### Optimal Setup: **Hybrid T2V + I2V with Transitions**

This single workflow handles the majority of use cases:

```
┌─────────────────────────────────────────────────────────────┐
│                    RECOMMENDED WORKFLOW                      │
└─────────────────────────────────────────────────────────────┘

[INPUTS]
├─ Positive Prompt Text  ──→ node_3 (CLIPTextEncode positive)
├─ Negative Prompt Text  ──→ node_4 (CLIPTextEncode negative)
├─ Optional keyframe image ──→ node_2 (LoadImage)
└─ SVD Checkpoint Loader ──→ node_1 (CheckpointLoaderSimple)

        ↓

[TEXT & VISION PROCESSING]
├─ CLIPTextEncode (positive) ─ node_3
├─ CLIPTextEncode (negative) ─ node_4
└─ CLIPVisionLoader (ViT-L-14) ─ node_5

        ↓

[VIDEO GENERATION STACK]
├─ SVD_img2vid_Conditioning ─ node_6 ← consumes nodes 1–5
├─ VAEDecode              ─ node_7
└─ SaveImage              ─ node_8 → writes PNG frames

[OUTPUT]
└─ `gemdirect1_shot_*.png` files in the ComfyUI output directory
```

### Node-by-Node Configuration

#### **Node 2: LoadImage (Optional Keyframe)**
- **Input**: Base64 or uploaded keyframe image from gemDirect1
- **Mapping**: `2:image` → `keyframe_image`
- **Purpose**: Visual anchor for the video generator; skip the input for text-only shots.

#### **Node 3: CLIPTextEncode (Positive)**
- **Input**: Human-readable prompt from gemDirect1
- **Mapping**: `3:text` → `human_readable_prompt`
- **Function**: Encodes the shot description + creative enhancers into latent space (~150-200 tokens)

#### **Node 4: CLIPTextEncode (Negative)**
- **Input**: Global negative prompt
- **Mapping**: `4:text` → `negative_prompt`
- **Purpose**: Suppresses artifacts (`blurry`, `low-res`, `watermark`, etc.)

#### **Node 5: CLIPVisionLoader**
- **Model**: `ViT-L-14-BEST-smooth-GmP-HF-format.safetensors`
- **Mapping**: `5:clip_name` → `clip_vision`
- **Role**: Provides the vision encoder path so the SVD node can compare the keyframe with the prompt lenses.

#### **Node 6: SVD_img2vid_Conditioning**
- **Model**: `svd_xt.safetensors`
- **Inputs**:
  - Positive CLIP embedding (node 3)
  - Negative CLIP embedding (node 4)
  - Optional keyframe image (node 2)
  - CLIP vision encoding (node 5)
- **Parameters**:
  - **Steps**: 25–30 (higher → smoother)
  - **CFG Scale**: 7.5
  - **Motion Bucket ID**: 127
  - **Video Frames**: 25 @ 24fps (576×1024)
- **Output**: Latent video frames (1 second) ready for decoding.

#### **Node 7: VAEDecode**
- **Function**: Transforms latents from node 6 into pixel-space frames.
- **Inputs**: Latents + VAE from node 1
- **Output**: PNG-ready tensors fed into SaveImage.

#### **Node 8: SaveImage**
- **Purpose**: Persists frames as `gemdirect1_shot_#.png`.
- **Configuration**: Output directory defined in `comfyui-config.json`.

> **Advanced nodes (upscalers, VHS combine, SaveVideo) are part of larger pipelines**—the canonical gemDirect1 deployment focuses on nodes 1–8 listed above to keep the workflow deterministic. Additional nodes can be appended later if upscaling or MP4 output is required.

---

## Part 4: Data Flow from gemDirect1 → ComfyUI

### Mapping Configuration (JSON)

```json
{
  "workflow_name": "gemDirect1_VideoGeneration",
  "workflow_type": "text_to_video_with_keyframe",
  "comfyui_url": "http://127.0.0.1:8188",
  "node_mappings": {
    "3:text": "human_readable_prompt",
    "4:text": "negative_prompt",
    "2:image": "keyframe_image",
    "5:clip_name": "clip_vision",
    "6": "video_generator",
    "7": "vae_decode",
    "8:images": "video_output"
  },
  "settings": {
    "video_model": "svd_xt.safetensors",
    "steps": 30,
    "cfg_scale": 7.5,
    "motion_bucket": 127,
    "upscale_factor": 4,
    "output_format": "mp4",
    "framerate": 24
  }
}
```

### Processing Pipeline

**For Each Shot:**

1. **gemDirect1 Generates**:
   ```
   {
     "shot_id": "shot_001",
     "description": "...",
     "enhancers": { framing: [...], lighting: [...], ... },
     "human_readable_prompt": "Shot 1: A sweeping crane shot...",
     "negative_prompt": "blurry, low-res, ...",
     "keyframe_image": "base64_image_data"
   }
   ```

2. **Service Prepares**:
   - Convert enhancers to text format
   - Merge with Director's Vision context
   - Create full positive prompt
   - Encode negative prompt
   - Convert keyframe to tensor

3. **ComfyUI Processes**:
   - Text → CLIP embeddings (nodes 3-4)
   - Keyframe image → LoadImage + CLIPVision (nodes 2 & 5)
   - Generate conditioning (node 6)
   - Sample latents via KSampler (node 7)
   - Decode latents (node 8)
   - Persist PNG frames (node 9)

4. **Result Returned**:
   ```
   {
     "shot_id": "shot_001",
     "video_file": "outputs/gemdirect1/scene_1/shot_001.mp4",
     "duration": 1.04,
     "resolution": "3840x2160",
     "status": "complete"
   }
   ```

**For Scene Composition:**

5. **Combine Videos**:
   - Load all shot videos
   - Apply transitions between them
   - Combine with audio (if available)
   - Output final scene video

### gemDirect1 Canonical Workflow (current)

- **File**: `workflows/text-to-video.json` (vaulted in this repo).
- **Node inventory** (IDs are the same as the JSON file):
  1. `CheckpointLoaderSimple` – loads `SVD\svd_xt.safetensors`.
  2. `LoadImage` – accepts the mapped `keyframe_image`.
  3. `CLIPTextEncode` (positive prompt).
  4. `CLIPTextEncode` (negative prompt).
  5. `CLIPVisionLoader` – loads `ViT-L-14-BEST-smooth-GmP-HF-format.safetensors`.
  6. `SVD_img2vid_Conditioning` – consumes the checkpoint, CLIP embeddings, and keyframe.
  7. `VAEDecode` – decodes latents back to pixels.
  8. `SaveImage` – dumps `gemdirect1_shot_*` PNG outputs.

**Model usage**:
  - The workflow loads `SVD\svd_xt.safetensors`; keep that file in `models/checkpoints/SVD/`.
  - CLIP Vision relies on `clip_vision\ViT-L-14-BEST-smooth-GmP-HF-format.safetensors`.
  - Upscaling happens post-process (the generated PNGs can be fed into `4x-UltraSharp.pth` or other upscalers as needed).

Keeping this reference in sync ensures the gemDirect1 service, documentation, and ComfyUI deployment all point at the same nodes and models.

---

## Part 5: Implementation Recommendations

### Phase 1: Core Video Generation (Immediate)

**Priority 1 - Essential:**
- ✅ SVD (Stable Video Diffusion) workflow
- ✅ Text encoding (CLIPTextEncode)
- ✅ Upscaling node
- ✅ Video save/export

**Implementation**:
```typescript
// In comfyUIService.ts - Add this function:
export const generateVideoFromPrompt = async (
  shot: Shot,
  enhancers: ShotEnhancers,
  directorsVision: string,
  keyframeImage?: string,
  onProgress?: (status: LocalGenerationStatus) => void
): Promise<{ videoPath: string; duration: number }> => {
  
  // 1. Build human-readable prompt
  const humanPrompt = buildShotPrompt(shot, enhancers, directorsVision);
  
  // 2. Map to workflow nodes
  const payload = {
    "3": { "inputs": { "text": humanPrompt } },
    "4": { "inputs": { "text": negativePrompt } },
    "5": { "inputs": { "image": keyframeImage } },
    // ... other nodes
  };
  
  // 3. Queue prompt in ComfyUI
  const prompt_id = await queuePrompt(payload);
  
  // 4. Monitor progress via WebSocket
  return await monitorGeneration(prompt_id, onProgress);
};
```

### Phase 2: Advanced Features (Next)

**Priority 2 - Enhancement:**
- ControlNet-guided generation
- AnimateDiff for character consistency
- Batch video generation
- Transition effects

**Priority 3 - Polish:**
- Audio sync
- Motion interpolation
- Advanced upscaling
- Real-time preview

### Phase 3: Optimization (Future)

**Priority 4 - Performance:**
- Model caching
- Parallel shot generation
- GPU memory optimization
- Progressive encoding

---

## Part 6: Models to Install (via ComfyUI Manager)

### Essential Models

```
1. Video Generation
   ├─ svd_xt.safetensors (≈9.6GB)
   ├─ animateDiff_v1.pth (2.3GB)
   └─ [Optional] i2vgen_xl.safetensors (10GB)

2. Text Encoding
   ├─ clip-vit-large-patch14 (auto-download)
   └─ clip-vit-large-patch14-336 (auto-download)

3. Upscaling
   ├─ 4x-UltraSharp.pth (65MB)
   ├─ RealESRGAN_x4plus.pth (65MB)
   └─ [Optional] BSRGAN_x4.pth (120MB)

4. Control (Optional)
   ├─ control_canny-fp16.safetensors (1.4GB)
   ├─ control_openpose-fp16.safetensors (1.3GB)
   └─ control_depth-fp16.safetensors (1.5GB)

Total Download: ~20-40GB (depending on optional models)
```

**Installation Method:**
1. Open ComfyUI at http://127.0.0.1:8188
2. Click "Manager" → "Install Models"
3. Search for each model and install
4. Total time: ~30 minutes (depends on connection)

---

## Part 7: Workflow vs. gemDirect1 Integration Strategy

### Option A: Prebuilt Workflow (Recommended)

**Advantages**:
- ✅ Simple to setup
- ✅ User doesn't need to build in ComfyUI
- ✅ Consistent output format
- ✅ Easier to optimize

**Implementation**:
1. Create single reference workflow in ComfyUI UI
2. Export as JSON (API format)
3. Store in project as `workflows/text-to-video.json`
4. gemDirect1 app fetches and uses it
5. User just maps their data

**Setup**:
```
C:\Dev\gemDirect1\
  workflows/
    ├─ text-to-video.json (main workflow)
    ├─ image-to-video.json (optional)
    ├─ controlnet-guided.json (advanced)
    └─ README.md (instructions)
```

### Option B: User-Defined Workflows (Advanced)

**Advantages**:
- ✅ Ultimate flexibility
- ✅ Supports advanced use cases
- ✅ User can optimize for their GPU
- ❌ More complex setup

**Implementation**:
1. User builds workflow in ComfyUI UI
2. Exports workflow JSON
3. Uploads/configures in gemDirect1 app
4. App auto-detects nodes and suggests mappings
5. User confirms/adjusts mappings

**Better For**: Advanced users, custom models, experimental workflows

### Recommendation: **Hybrid Approach**

1. **Start with Option A** - Provide prebuilt workflow
2. **Support Option B** - Allow custom workflows
3. **Auto-detect nodes** - Intelligently suggest mappings
4. **Fallback to manual** - User can override if needed

---

## Part 8: Testing Checklist

### Workflow Verification

- [ ] Nodes properly connected in ComfyUI
- [ ] All text inputs accept long prompts (200+ tokens)
- [ ] Image input accepts base64-encoded images
- [ ] SVD model loads without VRAM errors
- [ ] Video generation produces MP4 output
- [ ] Upscaling works on all video frames
- [ ] Transitions render correctly

### Integration Testing

- [ ] gemDirect1 connects to ComfyUI
- [ ] Prompts successfully map to workflow nodes
- [ ] Keyframe images successfully load
- [ ] Video generation starts without errors
- [ ] Progress tracking works via WebSocket
- [ ] Video files save to correct location
- [ ] Output videos have correct resolution/format
- [ ] Transitions between shots work smoothly

### End-to-End Testing

- [ ] Create simple story (3-5 shots)
- [ ] Generate timeline in gemDirect1
- [ ] Trigger video generation
- [ ] Monitor progress in UI
- [ ] Verify output video quality
- [ ] Check video duration matches expectations
- [ ] Verify continuity between shots
- [ ] Test with different Directors Visions

---

## Part 9: Configuration Template

### `comfyui-config.json`

Save in project root for easy reference:

```json
{
  "workflow_presets": {
    "fast": {
      "model": "svd",
      "steps": 20,
      "cfg_scale": 7.0,
      "upscale": false,
      "estimated_time": "25s per shot"
    },
    "balanced": {
      "model": "svd",
      "steps": 30,
      "cfg_scale": 7.5,
      "upscale": true,
      "estimated_time": "70s per shot"
    },
    "quality": {
      "model": "i2vgen_xl",
      "steps": 50,
      "cfg_scale": 8.0,
      "upscale": true,
      "estimated_time": "120s per shot"
    }
  },
  "node_ids": {
    "positive_prompt": 3,
    "negative_prompt": 4,
    "keyframe_image": 5,
    "video_generator": 10,
    "upscaler": 13,
    "video_combiner": 15,
    "save_video": 16
  },
  "video_output_settings": {
    "format": "mp4",
    "codec": "h264",
    "bitrate": "25000k",
    "framerate": 24,
    "resolution": "1920x1080"
  }
}
```

---

## Part 10: Summary & Next Steps

### What gemDirect1 Produces
✅ Rich narrative data (story bible, director's vision)
✅ Detailed shot descriptions with creative enhancers
✅ Human-readable prompts perfect for AI image/video models
✅ Keyframe reference images for visual consistency
✅ Structured timeline data with transitions

### Optimal ComfyUI Setup
✅ **Primary**: Text-to-Video (SVD) workflow with keyframe support
✅ **Secondary**: ControlNet-guided generation for advanced control
✅ **Optional**: AnimateDiff for character consistency

### Recommended First Workflow
```
Text Prompt + Optional Keyframe
         ↓
    SVD Model (video generation)
         ↓
    Upscaler (4x enhancement)
         ↓
    VHS_VideoCombine (transitions)
         ↓
    SaveVideo (MP4 export)
```

### Action Items (Phase 1)
1. [ ] Install SVD model via ComfyUI Manager
2. [ ] Create reference workflow in ComfyUI UI
3. [ ] Test workflow with sample prompts
4. [ ] Export as JSON (API format)
5. [ ] Update `comfyUIService.ts` with video generation function
6. [ ] Test integration with gemDirect1 app
7. [ ] Verify video output quality and format

### Quality Targets
- **Video Resolution**: 1920x1080 minimum (4K preferred)
- **Frame Rate**: 24fps (cinematic standard)
- **Video Duration**: 1-2 seconds per shot (optimal for transitions)
- **Processing Time**: 30-90 seconds per shot (depends on quality preset)
- **Consistency**: 95%+ continuity between shots using keyframes

---

**This workflow architecture provides the optimal balance of:**
- ✅ Quality (photorealistic, cinematic output)
- ✅ Speed (sub-2-minute turnaround per scene)
- ✅ Flexibility (supports advanced user customization)
- ✅ Consistency (visual coherence across shots)
- ✅ Scalability (processes shot-by-shot for efficient VRAM usage)

Ready for implementation! 🎬
