# ComfyUI Integration Guide - Complete Implementation

**Date**: November 7, 2025  
**Status**: Implementation Ready  
**Last Updated**: Post Model Download

---

## Part 1: Architecture Overview

### Data Flow

```
gemDirect1 Story Generation
    ↓
Timeline Data + Creative Enhancers + Keyframe Images
    ↓
Payload Service (builds prompts)
    ↓
ComfyUI Service (queues workflow)
    ↓
ComfyUI Server (processes SVD workflow)
    ↓
Video Output (MP4 files)
    ↓
gemDirect1 Timeline Editor
```

### Key Components

1. **Workflow** (`workflows/text-to-video.json`)
   - Blueprint of nodes and connections
   - Maps story data to ComfyUI nodes
   - Handles SVD video generation + upscaling

2. **Services**
   - `comfyUIService.ts`: Connection, queuing, tracking
   - `payloadService.ts`: Transform story data to prompts
   - New: `generateVideoFromShot()` - Main integration function

3. **Configuration** (`comfyui-config.json`)
   - Server URL and settings
   - Model names and paths
   - Video output parameters
   - Quality presets

### Preflight Mapping & Telemetry Handshake
+- Run `node scripts/preflight-mappings.ts --project ./exported-project.json --summary-dir test-results/comfyui-status` before queuing scenes so the helper validates the wan-t2i/wan-i2v mapping contract, infers missing inline nodes, writes a normalized `mapping-preflight.json` plus a `unit` mirror, and exits code `3` if the required CLIP+LoadImage wiring is missing for the video workflow. The run script now records that summary path inside `HelperSummaries.MappingPreflight`.
- Mirror the same telemetry via `node scripts/comfyui-status.ts --project ./exported-project.json --summary-dir test-results/comfyui-status --log-path test-results/comfyui-status/comfyui-status.log` to capture VRAM/queue data, mapping status, and workflow availability for the UI telemetry cards, Artifact Snapshot badge, and QA artifacts. The helper writes both a JSON summary and verbose log, and `HelperSummaries.ComfyUIStatus` exposes those paths (plus the earlier mapping preflight summary) so downstream automation, the Artifact Snapshot UI, and Playwright tests can reopen the exact telemetry the UI links to.

---

## Part 2: Workflow Architecture

### Recommended Workflow: Text-to-Video with Upscaling

**Node Flow:**
```
[Load SVD Model] (node 1)
    ├─→ [Positive Prompt] (node 3) ──┐
    ├─→ [Negative Prompt] (node 4) ──┤
    ├─→ [Load Keyframe] (node 5) ────┤
    └─→ [CLIP Encoder] ────────────────┤
                                       ↓
                        [SVD Image-to-Video] (node 6)
                                       ↓
                        [KSampler] (node 7)
                                       ↓
                        [VAE Decode] (node 8)
                                       ↓
                        [Upscaler] (node 11)
                                       ↓
                        [Video Output] (node 14)
```

### Node Details

| Node | Type | Purpose | Input | Output |
|------|------|---------|-------|--------|
| 1 | CheckpointLoader | Load SVD model | `svd_xt.safetensors` | Model |
| 3 | CLIPTextEncode | Encode shot description | Prompt text | Conditioning |
| 4 | CLIPTextEncode | Encode negative prompt | Negative text | Conditioning |
| 5 | LoadImage | Load keyframe for consistency | Image file | Latent |
| 6 | SVD_img2vid | Generate video | Cond + Image | Video frames |
| 7 | KSampler | Refine generation | Model + Cond | Latents |
| 8 | VAEDecode | Decode to pixels | Latents | Video |
| 11 | ImageUpscale | 4x resolution | Video frames | Upscaled video |
| 14 | SaveVideo | Export MP4 | Video | File |

---

## Part 3: Data Mapping

### Shot → Workflow Node Mapping

```
Shot Data Structure:
{
  id: "shot_001",
  description: "A sweeping crane shot...",
  enhancers: {
    framing: ["Wide Shot", "Establishing"],
    movement: ["Crane Shot ascending"],
    lens: ["Shallow Depth of Field"],
    lighting: ["Low-Key", "Neon accents"],
    mood: ["Suspenseful", "Noir atmosphere"],
    vfx: ["Film grain", "Lens flare"],
    pacing: ["Slow Motion"]
  },
  keyframe_image: "base64_encoded_image_data"
}

        ↓ (via buildShotPrompt)

Prompt String:
"A sweeping crane shot... (Framing: Wide Shot, Establishing; 
Movement: Crane Shot ascending; ...)"

        ↓ (via queueComfyUIPrompt)

Workflow Node Injection:
{
  "3": { "inputs": { "text": "A sweeping crane shot..." } },     // node 3 text
  "4": { "inputs": { "text": "blurry, low-res, ..." } },          // node 4 text
  "5": { "inputs": { "image": "uploaded_keyframe.jpg" } }          // node 5 image
}
```

### Configuration Mapping (`comfyui-config.json`)

```json
"node_mappings": {
  "positive_prompt": "3:text",        // Where to put shot description
  "negative_prompt": "4:text",         // Where to put negative prompt
  "keyframe_image": "5:image",         // Where to put keyframe
  "video_generator": "6",              // SVD node
  "sampler": "7",                      // KSampler node
  "video_output": "14"                 // Final output node
}
```

---

## Part 4: Integration Functions

### Main Function: `generateVideoFromShot()`

**Location**: `services/comfyUIService.ts`

**Signature**:
```typescript
export const generateVideoFromShot = async (
    settings: LocalGenerationSettings,
    shot: Shot,
    enhancers: Partial<Omit<CreativeEnhancers, 'transitions'>> | undefined,
    directorsVision: string,
    keyframeImage: string | null,
    onProgress?: (statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<{ videoPath: string; duration: number; filename: string }>
```

**Flow**:
1. **Build Prompt**: Combines shot description + enhancers + director's vision
2. **Queue Prompt**: Sends to ComfyUI via `queueComfyUIPrompt()`
3. **Track Execution**: Monitors via WebSocket + polling
4. **Return Output**: MP4 file path and metadata

**Usage**:
```typescript
const result = await generateVideoFromShot(
  settings,
  shot,
  enhancers,
  directorsVision,
  keyframeImage,
  (update) => console.log(update.message)
);

// Result:
// {
//   videoPath: "data:video/mp4;base64,...",
//   duration: 1.04,
//   filename: "gemdirect1_shot_001.mp4"
// }
```

### Batch Function: `generateTimelineVideos()`

**Location**: `services/comfyUIService.ts`

**Signature**:
```typescript
export const generateTimelineVideos = async (
    settings: LocalGenerationSettings,
    timeline: TimelineData,
    directorsVision: string,
    sceneSummary: string,
    keyframeImages: Record<string, string>,
    onProgress?: (shotId: string, statusUpdate: Partial<LocalGenerationStatus>) => void
): Promise<Record<string, { videoPath: string; duration: number; filename: string }>>
```

**Features**:
- Processes all shots sequentially
- Handles individual shot failures without stopping
- Reports per-shot progress
- Implements queue management

**Usage**:
```typescript
const results = await generateTimelineVideos(
  settings,
  timeline,
  directorsVision,
  sceneSummary,
  keyframeImages,
  (shotId, update) => {
    console.log(`Shot ${shotId}: ${update.message}`);
  }
);

// Results: { shot_001: {...}, shot_002: {...}, ... }
```

### Helper Function: `buildShotPrompt()`

**Location**: `services/comfyUIService.ts`

**Generates**: Human-readable prompt from shot data

**Example Output**:
```
"A sweeping crane shot of an abandoned warehouse at dusk... 
(Framing: Wide Shot, Establishing; Movement: Crane Shot ascending; 
Lens: Shallow Depth of Field; Lighting: Low-Key, Neon accents; 
Mood: Suspenseful, Noir atmosphere; VFX: Film grain, Lens flare; 
Pacing: Slow Motion) Style: Gritty neo-noir with high-contrast lighting."
```

---

## Part 5: Configuration Files

### `comfyui-config.json`

Controls all ComfyUI behavior:

```json
{
  "comfyui_server": {
    "url": "http://127.0.0.1:8188",
    "client_id": "gemdirect1",
    "connection_timeout_ms": 3000,
    "generation_timeout_ms": 300000
  },
  "workflow": {
    "type": "text_to_video",
    "path": "workflows/text-to-video.json"
  },
  "video_settings": {
    "width": 576,
    "height": 1024,
    "frames": 25,
    "fps": 24,
    "duration_seconds": 1.04
  }
}
```

### `workflows/text-to-video.json`

Complete SVD workflow blueprint with all nodes pre-configured.

---

## Part 6: Integration Checklist

### Pre-Integration Setup

- [x] ComfyUI server running (`http://127.0.0.1:8188`)
- [x] All models downloaded
  - [x] SVD model (9.56GB)
  - [x] AnimateDiff (1.67GB)
  - [x] 4x-UltraSharp upscaler (63MB)
  - [x] RealESRGAN upscaler (63MB)
  - [x] ControlNet models (optional)
- [x] Workflow file created (`workflows/text-to-video.json`)
- [x] Configuration file created (`comfyui-config.json`)
- [x] Service functions implemented (`generateVideoFromShot`, etc.)

### Service Integration

- [ ] Update `components/GenerationControls.tsx` to use `generateVideoFromShot()`
- [ ] Add video generation UI with progress tracking
- [ ] Implement WebSocket connection management
- [ ] Add error handling and user feedback

### Testing

- [ ] Test single shot generation
- [ ] Test with keyframe image
- [ ] Test batch timeline generation
- [ ] Test error scenarios (server down, invalid prompt, etc.)
- [ ] Performance testing (generation time, VRAM usage)

### Deployment

- [ ] Document workflow customization process
- [ ] Create user guide for quality presets
- [ ] Add support for custom models
- [ ] Set up auto-retry logic for failed generations

### WAN Video Automation & Metadata
- Step 11b: Invoke `scripts/generate-scene-videos-wan2.ps1 -RunDir logs/<ts> -ComfyUrl http://127.0.0.1:8188 -MaxWaitSeconds <n> -PollIntervalSeconds <s>` so each `scene_*`/`scene-*` folder uploads its first keyframe, injects it into the first `LoadImage`, forces the first `SaveVideo` node to mp4/libx264, and polls for `logs/<ts>/video/<sceneId>/<sceneId>.mp4` while emitting `[Scene ...] Wan2` telemetry lines into `run-summary.txt`.
- Step 11c: Run `scripts/update-scene-video-metadata.ps1 -RunDir logs/<ts> -VideoSubDir video` to append forward-slash `Video.Path` entries (plus optional `DurationSeconds`, `Status`, `UpdatedAt`, and `Error`) into `artifact-metadata.json` so the Artifact Snapshot and Timeline UI can surface each MP4.

---

## Part 7: Quick Start

### Step 1: Verify Setup

```bash
# Check ComfyUI is running
curl http://127.0.0.1:8188/system_stats

# Should return: { "system": {...}, "devices": [...] }
```

### Step 2: Generate a Single Shot

```typescript
import { generateVideoFromShot } from './services/comfyUIService';

const settings: LocalGenerationSettings = {
  comfyUIUrl: 'http://127.0.0.1:8188',
  comfyUIClientId: 'gemdirect1',
  workflowJson: require('./workflows/text-to-video.json'),
  mapping: {
    '3:text': 'human_readable_prompt',
    '4:text': 'negative_prompt',
    '5:image': 'keyframe_image'
  }
};

const shot: Shot = {
  id: 'shot_001',
  description: 'A cinematic establishing shot of a city at sunset',
  duration: 2.0
};

const enhancers = {
  framing: ['Wide Shot', 'Establishing'],
  lighting: ['Golden Hour', 'Warm tones'],
  mood: ['Cinematic', 'Epic']
};

const result = await generateVideoFromShot(
  settings,
  shot,
  enhancers,
  'Cinematic and dramatic',
  keyframeImage,
  (status) => console.log(status.message)
);

console.log(`Video saved: ${result.filename}`);
```

### Step 3: Generate Full Timeline

```typescript
import { generateTimelineVideos } from './services/comfyUIService';

const results = await generateTimelineVideos(
  settings,
  timeline,
  directorsVision,
  sceneSummary,
  keyframeImages,
  (shotId, status) => updateUI(shotId, status)
);

// Results contains all generated videos
```

---

## Part 8: Troubleshooting

### "Connection timed out"
- Verify ComfyUI server is running: `ps aux | grep ComfyUI`
- Check URL in `comfyui-config.json` matches running server
- Ensure firewall allows port 8188

### "No workflow synced"
- Load workflow from `workflows/text-to-video.json` in UI
- Configure node mappings in settings
- Save settings to database

### "Generation timeout"
- Check VRAM: `nvidia-smi`
- Reduce quality preset in settings
- Increase timeout in `comfyui-config.json`

### "Model not found"
- Verify model installed via ComfyUI Manager
- Check model path in workflow matches installed location
- Restart ComfyUI server

---

## Part 9: Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| SVD Generation | 30-60s | TBD |
| Upscaling | 20-30s | TBD |
| Total per shot | 60-90s | TBD |
| Scene (3-5 shots) | 3-7 min | TBD |
| VRAM Usage | <12GB | TBD |
| Output Resolution | 4K (upscaled) | TBD |
| Video Format | MP4 H.264 | ✅ |

---

## Part 10: Next Steps

1. **Integrate UI** - Connect components to `generateVideoFromShot()`
2. **Test End-to-End** - Run full story → video generation
3. **Optimize Quality** - Fine-tune prompts and parameters
4. **Add Features** - Transition handling, audio sync, batch export
5. **Production Ready** - Error handling, logging, monitoring

---

## Files Reference

| File | Purpose |
|------|---------|
| `workflows/text-to-video.json` | SVD workflow blueprint |
| `comfyui-config.json` | Configuration and settings |
| `services/comfyUIService.ts` | Main service with video generation |
| `services/payloadService.ts` | Prompt building |
| `types.ts` | Type definitions |

---

## Support Resources

- **ComfyUI Docs**: https://github.com/comfyanonymous/ComfyUI
- **SVD Model**: https://huggingface.co/stabilityai/stable-video-diffusion
- **4x-UltraSharp**: https://huggingface.co/Kim2091/UltraSharp
- **RealESRGAN**: https://huggingface.co/ai-forever/Real-ESRGAN

---

**Status**: Ready for UI Integration 🚀
Guardrails (2025-11)
- Keyframes and per-shot prompts include a single-frame instruction to discourage storyboard/collage outputs.
- Negative prompts are extended with multi‑panel avoidance. See `SINGLE_FRAME_PROMPT`, `NEGATIVE_GUIDANCE`, and `extendNegativePrompt()` in `services/comfyUIService.ts`.

WAN profiles and mappings
- wan-t2i (keyframes): requires CLIP text mapping; `keyframe_image` is not required.
- wan-i2v (video): requires CLIP + `LoadImage` and a `keyframe_image` mapping.
- Validation logic is centralized in `validateWorkflowAndMappings()`.
- Per-scene WAN 5B videos are uploaded via `scripts/generate-scene-videos-wan2.ps1` (HttpClient + multipart upload + `LoadImage` injection) and cataloged by `scripts/update-scene-video-metadata.ps1` (forward-slash paths, scene IDs, durations). The CLI run script still calls them as Step 11b/11c so Artifact Snapshots, `run-summary.txt`, and `artifact-metadata.json` stay in sync with the same telemetry that the helper exports.
