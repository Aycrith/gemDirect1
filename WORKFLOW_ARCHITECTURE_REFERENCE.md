# ComfyUI Workflow Reference Architecture

## Complete Data Flow Diagram

```
╔════════════════════════════════════════════════════════════════════════════╗
║                          GEMDIRECT1 STORYLINE GENERATOR                    ║
╚════════════════════════════════════════════════════════════════════════════╝

                                INPUTS
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
            Story Idea    Characters &    Director's
              (1 line)     Setting        Vision
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                         ┌────────▼────────┐
                         │  Story Bible    │
                         │  Generation     │
                         │  (Gemini Pro)   │
                         └────────┬────────┘
                                  │
                    Story Bible (chars, setting, plot)
                                  │
                         ┌────────▼────────┐
                         │  Scene Breakdown│
                         │  Timeline Builder
                         │  (Gemini)       │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼──────────────────┐
                    │             │                  │
            Scenes (5-10)   Shots per Scene    Transitions
                    │             │                  │
                    └─────────────┼──────────────────┘
                                  │
                         ┌────────▼────────┐
                         │  Creative       │
                         │  Enhancers      │
                         │  + Polishing    │
                         │  (Gemini)       │
                         └────────┬────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
            ┌───────▼────────┐      ┌───────────▼──────┐
            │  Keyframe Image│      │ Human-Readable   │
            │  Generation    │      │ Prompts + Text   │
            │  (Gemini       │      │ Timeline JSON    │
            │   Image Gen)   │      │ (payloadService) │
            └───────┬────────┘      └───────────┬──────┘
                    │                           │
                    │   8K Reference Image      │ Detailed Shot Description
                    │   + Scene Aesthetics      │ + Creative Enhancers
                    │                           │
                    └───────────────┬───────────┘
                                    │
                ╔═══════════════════▼════════════════════╗
                ║     ComfyUI Integration Point          ║
                ║  (Mapping Configuration Required)      ║
                ╚═══════════════════╤════════════════════╝
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
            Human Prompt     Keyframe Image   Negative Prompt
                    │               │                │
                    │   ┌───────────┼────────────┐   │
                    │   │                        │   │
                    └───►│   COMFYUI WORKFLOW    │◄──┘
                        │                        │
                ┌───────►│  ┌─────────────────┐  │
                │       │  │ CLIPTextEncode  │  │
                │       │  │ (Positive)      │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
    Checkpoint  │       │  ┌────────▼────────┐  │
    + CLIP      │       │  │ CLIPTextEncode  │  │
                │       │  │ (Negative)      │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                │       │  ┌────────▼────────┐  │
                │       │  │ LoadImage       │  │
                │       │  │ (Keyframe)      │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                │       │  ┌────────┴────────┐  │
                │       │  │ SVD Video Gen   │  │
                │       │  │ (Image→Video)   │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                │       │  ┌────────▼────────┐  │
                │       │  │ VAE Decode      │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                │       │  ┌────────▼────────┐  │
                │       │  │ 4x Upscaler     │  │
                │       │  │ (Quality)       │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                │       │  ┌────────▼────────┐  │
                │       │  │ VHS_VideoCombine│  │
                │       │  │ (Transitions)   │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                │       │  ┌────────▼────────┐  │
                │       │  │ SaveVideo       │  │
                │       │  │ (MP4 Export)    │  │
                │       │  └────────┬────────┘  │
                │       │           │           │
                └───────┤  OUTPUT: Video MP4   │
                        │                        │
                        └────────────┬───────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │   Generated Video Clip         │
                    │   (1920x1080, 24fps, ~1-2s)  │
                    │   Per Shot                     │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │  Combine All Shots            │
                    │  + Transitions                │
                    │  + Audio (optional)           │
                    └────────────────┬──────────────┘
                                     │
                    ┌────────────────▼──────────────┐
                    │  Final Scene Video            │
                    │  (Full cinematic timeline)    │
                    └────────────────┬──────────────┘
                                     │
                              ┌──────▼──────┐
                              │   OUTPUT    │
                              │   MP4 Video │
                              │   Ready for │
                              │  Publishing │
                              └─────────────┘
```

---

## Workflow Node Connections (Detailed)

```
INPUTS LAYER
═════════════════════════════════════════════════════════════════

[User Text Prompt]  [User Negative Prompt]  [Keyframe Image]
         │                    │                     │
         │                    │                     │
PROCESSING LAYER
═════════════════════════════════════════════════════════════════

[CLIPTextEncode+]◄──────────────────────────────┐
         │                                        │ Uses checkpoint
         │                                        │ CLIP model
[CLIPTextEncode-]◄──────────────────────────────┤
         │                                        │
         └────────────────┬──────────────────────┘
                          │
                [SVD Video Generator]
                          │
                   [Embedding] (latent space representation)
                          │
                [Image Input]◄────────┐
                          │           │ Optional: Keyframe
                          │           │ for consistency
         ┌────────────────┴───────────┴─────────────┐
         │  SVD Model (Stable Video Diffusion)      │
         │                                           │
         │  • 25 frames @ 24fps = 1 second          │
         │  • Resolution: 512x768 (default)         │
         │  • Quality: Professional cinematic       │
         │  • Time: ~40 seconds (RTX 3090)         │
         └────────────────┬───────────────────────┘
                          │
                    [Latent Video]
                          │
                  [VAE Decode]
                          │
                 [Video Frames]
                          │
                   [Upscaler 4x]
                          │
              [4x Resolution Frames]
                          │
             [VHS_VideoCombine]
                          │
          (Handles transitions between shots)
                          │

OUTPUT LAYER
═════════════════════════════════════════════════════════════════

                    [SaveVideo]
                          │
                    [MP4 File]
                          │
         ┌──────────────────────────────┐
         │   Final Video Output         │
         │   1920x1080 @ 24fps          │
         │   ~60-90 seconds per shot    │
         └──────────────────────────────┘
```

---

## Model Dependencies & Pipeline

```
Text Prompt
    │
    ▼
┌─────────────────────────────────────┐
│ CLIP Text Tokenizer & Encoder       │
│ (Built-in to Checkpoint Model)      │
│ Output: Embedding (77, 768)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ SVD_XT_Image2Video Model            │
│ Input: Text Embedding + Optional    │
│        Image                         │
│ Processing:                         │
│  • Condition frame generation       │
│  • 25-frame video synthesis         │
│  • Temporal consistency             │
│ Output: Latent Video (4, 8, 64, 40)│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ VAE Decoder                         │
│ Input: Latent Video                 │
│ Output: RGB Video Frames (4D tensor)│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Upscaler (4x-UltraSharp)            │
│ Input: Video Frames (512x768)       │
│ Output: Upscaled (2048x3072)        │
│ Quality: Sharpened, detail enhanced │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ VHS_VideoCombine                    │
│ Input: Multiple Video Clips         │
│ Actions:                            │
│  • Interleave shots                 │
│  • Apply transitions (fade, etc.)   │
│  • Set framerate (24fps)            │
│ Output: Combined Video Sequence     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Video Encoder (H.264/MP4)           │
│ Input: Combined Video Sequence      │
│ Output: MP4 File                    │
│ Compression: Lossy H.264            │
│ Bitrate: 25Mbps (quality)           │
└──────────────┬──────────────────────┘
               │
               ▼
          Final MP4 Video
        Ready for Distribution
```

---

## Processing Timeline (per shot)

```
START
  │
  ├─ Text Encoding:              2-3 seconds
  │  └─ Tokenize prompt
  │  └─ Embed via CLIP
  │
  ├─ Video Generation (SVD):    35-45 seconds
  │  └─ Initialize noise latent
  │  └─ Denoising steps (25-30)
  │  └─ Output: Latent tensor
  │
  ├─ VAE Decode:                 3-5 seconds
  │  └─ Convert latent to RGB
  │  └─ Output: Frame tensors
  │
  ├─ Upscaling:                 25-35 seconds
  │  └─ Apply super-resolution
  │  └─ Output: 4x resolution
  │
  └─ Saving & Combining:         5-10 seconds
     └─ Encode to MP4
     └─ Apply transitions
     └─ Write to disk
     
  TOTAL: 70-100 seconds per shot
  ╔════════════════════════════════════╗
  ║ WITH 3-SHOT SCENE:                 ║
  ║ 210-300 seconds (3.5-5 min)       ║
  ║ WITH 10-SHOT SCENE:                ║
  ║ 700-1000 seconds (11-16 min)       ║
  ╚════════════════════════════════════╝
```

---

## Quality Settings Reference

### SVD Configuration Parameters

```
┌────────────────────────────────────┐
│ STEPS (Denoising Iterations)       │
├────────────────────────────────────┤
│ 20  │ ████░ │ Fast,     rough     │
│ 25  │ █████░│ Good,    balanced   │
│ 30  │ ██████│ Better,  preferred  │
│ 40+ │ ██████│ Quality, slow       │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ CFG SCALE (Text Guidance)          │
├────────────────────────────────────┤
│ 5.0 │ Low     │ More creative      │
│ 7.5 │ Medium  │ Balanced (best)    │
│ 9.0 │ High    │ Follows prompt     │
│ 12+ │ Very Hi │ Rigid, artifacts   │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ MOTION BUCKET ID (Motion Intensity)│
├────────────────────────────────────┤
│ 0-64   │ Still/Subtle motion      │
│ 64-127 │ Normal motion (default)  │
│ 127+   │ Aggressive motion        │
└────────────────────────────────────┘
```

---

## Recommended Presets

```
FAST GENERATION
─────────────────────────────────────
SVD Steps: 20
CFG Scale: 7.0
Motion ID: 100
Upscale: OFF
ETA: 25 seconds
Use For: Testing, previews, rapid iteration

BALANCED (RECOMMENDED)
─────────────────────────────────────
SVD Steps: 30
CFG Scale: 7.5
Motion ID: 127
Upscale: 2x
ETA: 70 seconds
Use For: Production, most workflows

QUALITY
─────────────────────────────────────
SVD Steps: 40
CFG Scale: 8.0
Motion ID: 127
Upscale: 4x
ETA: 120 seconds
Use For: Final shots, hero content

ULTRA QUALITY (ADVANCED)
─────────────────────────────────────
SVD Steps: 50
CFG Scale: 8.5
Motion ID: 127
Upscale: 4x
ControlNet: Enabled
ETA: 180 seconds
Use For: Cinematic sequences, VFX heavy
```

---

## Mapping Configuration Example

```json
{
  "workflow_id": "text_to_video_primary",
  "comfyui_version": "0.3.68",
  "models_required": {
    "checkpoint": "sd_xl_base_1.0",
    "video_generator": "svd_xt.safetensors",
    "upscaler": "4x-UltraSharp"
  },
}
```

## Dual WAN Helper & Mapping Telemetry

- Run `scripts/comfyui-status.ts` (or `node scripts/comfyui-status.ts --summary-dir test-results/comfyui-status --log-path test-results/comfyui-status/comfyui-status.log`) before every batch so you confirm both `wan-t2i` (keyframe) and `wan-i2v` (video) workflows exist, include CLIPTextEncode/LoadImage mappings, and emit queue/system telemetry for later QA comparisons.
- The helper loads the exported `localGenSettings` (via `--project` or `LOCAL_PROJECT_STATE_PATH`), normalizes the workflow JSON, and writes a JSON summary containing queue snapshots, helper warnings, and the canonical workflow paths; keep those summaries as the ground truth when routing Visual Bible prompts or validating Playwright runs.
- Workflow telemetry recorded by the helper includes system stats (device/VRAM), queue counts (running/pending), CVRN warnings, and missing mapping flags, so any Visual Bible prompt or plan expansion logic should log the helper summary path for traceability and avoid placeholder keyframes when base64 data is flagged as absent.
  "node_mappings": {
    "3": {
      "class": "CLIPTextEncode",
      "role": "positive_prompt",
      "input_name": "text",
      "maps_to": "human_readable_prompt",
      "description": "Shot description + creative enhancers"
    },
    "4": {
      "class": "CLIPTextEncode",
      "role": "negative_prompt",
      "input_name": "text",
      "maps_to": "negative_prompt",
      "description": "Things to avoid: blurry, low-res, text, etc."
    },
    "5": {
      "class": "LoadImage",
      "role": "optional_keyframe",
      "input_name": "image",
      "maps_to": "keyframe_image",
      "description": "Establishing shot reference (optional)",
      "optional": true
    },
    "10": {
      "class": "SVD_Xt_Image2Video",
      "role": "video_generator",
      "inputs": {
        "positive": "from_node_3_output",
        "negative": "from_node_4_output",
        "image": "from_node_5_output",
        "steps": 30,
        "cfg": 7.5,
        "motion_bucket_id": 127
      }
    },
    "13": {
      "class": "Upscale",
      "role": "quality_enhancement",
      "model": "4x-UltraSharp",
      "factor": 4
    },
    "15": {
      "class": "VHS_VideoCombine",
      "role": "transition_handler"
    },
    "16": {
      "class": "SaveVideo",
      "role": "output",
      "format": "mp4",
      "fps": 24,
      "codec": "h264"
    }
  }
}
```

---


## WAN Workflow Health Hook

- `scripts/comfyui-status.ts` reads your exported `localGenSettings` (or the file referenced by `LOCAL_PROJECT_STATE_PATH`) and requires both WAN profiles (`wan-t2i` for keyframes, `wan-i2v` for video). It enforces mappings for `human_readable_prompt`, `full_timeline_json`, and `keyframe_image` so CLIPTextEncode/LoadImage inputs are populated before any prompt is queued.
- The helper probes `/system_stats` and `/queue` on `LOCAL_COMFY_URL` (mirrored by `VITE_LOCAL_COMFY_URL` for the UI) and logs VRAM, pending/running counts, and warnings to `test-results/comfyui-status/<timestamp>.log`, matching the telemetry fields described in ComfyUI's WebSocket example (https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py). QA cards reuse these fields, so any queue warning surfaced here appears in the Artifact Snapshot as well.
- If the helper cannot find `workflows/image_netayume_lumina_t2i.json` or `workflows/video_wan2_2_5B_ti2v.json`, it alerts you before queuing anything, ensuring Visual Bible continuity data always references real keyframe base64 assets instead of placeholders.

---

## Decisions & Rationale (2025-11)

- **WAN T2I over SVD for keyframes**
  The SVD text-to-video workflow produced visually noisy, incoherent stills in this app context and consumed significant VRAM on the RTX 3090. The `wan-t2i` text→image workflow (`image_netayume_lumina_t2i.json`) now serves as the canonical keyframe generator for the local pipeline.

- **WAN 2.2 5B ti2v over WAN 14B**
  Full Wan2.2 14B video workflows routinely pushed VRAM usage to the limit when combined with SVD and other models, causing ComfyUI exits during long runs. The pipeline now standardizes on the lighter Wan2.2 5B ti2v workflow (`video_wan2_2_5B_ti2v.json`) for `wan-i2v`, balancing quality with stable runtimes on a 24 GB GPU.

- **Profile-specific keyframe mapping rules**
  Workflow validation and helper UIs treat `wan-t2i` and `wan-i2v` differently:
  - `wan-t2i` (keyframe generator) requires CLIP text conditioning and a text mapping but does **not** require a `keyframe_image` mapping because it produces keyframes.
  - `wan-i2v` (video generator) requires both CLIP text and `LoadImage.image` plus a `keyframe_image → LoadImage.image` mapping so scene keyframes can be consumed reliably.
  The modal, services, and `scripts/comfyui-status.ts` all follow this contract to avoid bogus LoadImage warnings on the keyframe-only profile.

- **Structured hero's journey outputs**
  The story bible and scene payloads now include a `heroArcs` array (12 named arcs with summaries, emotional shifts, and importance) plus explicit `heroArcId` references inside scenes so downstream prompts, timelines, and shot scheduling stay aligned with the intended narrative beats. Update the prompt templates and timeline tooling only if the arc schema remains backwards compatible.


> **Current gemDirect1 deployment:** `workflows/text-to-video.json` defines the active 9-node pipeline (CheckpointLoader → LoadImage → CLIPTextEncode → CLIPVision → `SVD_img2vid_Conditioning` → KSampler → VAE Decode → SaveImage) and loads `SVD\svd_xt.safetensors` along with `clip_vision\ViT-L-14-BEST-smooth-GmP-HF-format.safetensors`.

## Error Handling & Recovery

```
┌─────────────────────────────────┐
│ COMMON ISSUES & SOLUTIONS       │
├─────────────────────────────────┤
│                                 │
│ OUT OF MEMORY                   │
│ └─ Reduce steps (20→15)        │
│ └─ Skip upscaling              │
│ └─ Reduce resolution           │
│                                 │
│ TIMEOUT (>300 sec)             │
│ └─ Check VRAM                  │
│ └─ Reduce complexity           │
│ └─ Restart ComfyUI             │
│                                 │
│ BAD QUALITY                     │
│ └─ Increase steps              │
│ └─ Adjust CFG scale            │
│ └─ Add keyframe image          │
│ └─ Refine text prompt          │
│                                 │
│ INCONSISTENT MOTION            │
│ └─ Add keyframe (I2V mode)     │
│ └─ Lower motion bucket         │
│ └─ Increase CFG scale          │
│                                 │
│ NO AUDIO                        │
│ └─ Process separately          │
│ └─ Add audio track post-prod   │
│                                 │
└─────────────────────────────────┘
```

This architecture ensures:
- ✅ Quality cinematic output
- ✅ Consistent shot-to-shot visuals
- ✅ Scalable processing
- ✅ Flexible customization
- ✅ Production-ready pipeline

