# ComfyUI Integration Quick Reference

## Overview
The gemDirect1 app integrates with ComfyUI to generate videos/images locally based on your cinematic stories. The integration is intelligent and flexible, supporting various workflow configurations.

## Connection Flow

```
gemDirect1 App → ComfyUI Server (HTTP/WebSocket) → Generated Video/Image → App Display
```

## Auto-Discovery Feature

The app automatically checks these URLs when "Auto-Discover" is clicked:
- `http://127.0.0.1:8188`
- `http://localhost:8188`

### Manual Configuration
If auto-discovery fails:
1. Check your ComfyUI startup logs for the actual port
2. Manually enter the URL in settings
3. Click "Test Connection"

## Data Mapping System

### What Gets Mapped?

| App Data Type | Description | Typical ComfyUI Node |
|--------------|-------------|---------------------|
| **Human-Readable Prompt** | Natural language scene description | CLIPTextEncode (positive) |
| **Full Timeline JSON** | Structured shot-by-shot data | CLIPTextEncode or custom nodes |
| **Keyframe Image** | Scene establishing shot | LoadImage |
| **Negative Prompt** | Things to avoid in generation | CLIPTextEncode (negative) |

### Example Workflow Mapping

```json
{
  "3:text": "human_readable_prompt",    // Node 3 CLIPTextEncode (positive)
  "4:image": "keyframe_image",          // Node 4 LoadImage
  "7:text": "negative_prompt"            // Node 7 CLIPTextEncode (negative)
}
```

### How to Find Node IDs

#### Method 1: Use ComfyUI's "API View"
1. Open your workflow in ComfyUI
2. Click "View" → "API View" (or right-click → "View API")
3. Note the node IDs and their input names

#### Method 2: Export Workflow as API
1. In ComfyUI, click "Save (API Format)"
2. Open the JSON file
3. Look for nodes like:
```json
"3": {
  "class_type": "CLIPTextEncode",
  "inputs": {
    "text": "your prompt here",
    "clip": ["4", 0]
  }
}
```
The number `"3"` is the node ID, `"text"` is the input name.

## Workflow Requirements

### Minimum Required Nodes
For basic compatibility, your ComfyUI workflow should have:

1. **Text Input Node** (for prompts)
   - Type: `CLIPTextEncode`
   - Input name: typically `text`

2. **Image Input Node** (for keyframes)
   - Type: `LoadImage`
   - Input name: typically `image`

3. **Output Node** (to save results)
   - Type: `SaveImage` or `VHS_VideoCombine` (for videos)

### Example Minimal Workflow Structure

```
LoadImage (keyframe) ──┐
                       ├──> KSampler ──> SaveImage
CLIPTextEncode (+) ────┤
CLIPTextEncode (-) ────┘
```

### Advanced Workflow Support

The app supports complex workflows with:
- ✅ Multiple text inputs
- ✅ Image-to-Video nodes (AnimateDiff, SVD, etc.)
- ✅ ControlNet nodes
- ✅ Custom nodes
- ✅ LoRA loaders
- ✅ Upscalers
- ✅ Video combiners (VHS nodes)

## Data Injection Details

### Human-Readable Prompt Format
```
SCENE: "The hero confronts the villain"

SHOT 1: Wide establishing shot of a dimly lit warehouse. Low-key lighting creates dramatic shadows. The hero stands in silhouette at the entrance.
Enhancers: [Low-Key Lighting], [Wide Shot], [Cinematic Color Grading]

SHOT 2: Close-up of the hero's determined face. Shallow depth of field. Warm key light from the side creates definition.
Enhancers: [Close-Up], [Shallow Depth of Field], [Warm Lighting]

...

Director's Vision: "Gritty neo-noir aesthetic with high-contrast chiaroscuro lighting, constant rain, urban decay."
```

### Full Timeline JSON Format
```json
{
  "scene_title": "Confrontation in the Warehouse",
  "scene_summary": "The hero confronts the villain...",
  "shots": [
    {
      "id": "shot_1",
      "description": "Wide establishing shot...",
      "enhancers": {
        "framing": ["Wide Shot"],
        "lighting": ["Low-Key"],
        "mood": ["Suspenseful"]
      }
    }
  ],
  "directors_vision": "Gritty neo-noir aesthetic...",
  "negative_prompt": "blurry, low quality, cartoon"
}
```

### Keyframe Image
- Format: JPEG (base64 encoded)
- Automatically uploaded to ComfyUI's input folder
- Filename: `csg_keyframe_[timestamp].jpg`
- Can be used with LoadImage or as ControlNet input

## Pre-flight Checks

Before each generation, the app validates:

### 1. Server Connection
```javascript
GET /system_stats
// Expects: { system: {...}, devices: [...] }
```

### 2. System Resources
```javascript
// Checks VRAM on GPU devices
// Warns if free VRAM < 2GB
```

### 3. Queue Status
```javascript
GET /queue
// Returns: { queue_running: 0, queue_pending: 2 }
// Shows position in queue to user
```

### 4. Workflow Validity
- Verifies mapped nodes exist
- Checks input types match
- Validates node connections

## Generation Process

### Step 1: Preparation
```javascript
1. Generate prompts from timeline
2. Create keyframe image (if needed)
3. Load workflow JSON from settings
```

### Step 2: Upload Assets
```javascript
POST /upload/image
Body: FormData with image blob
Response: { name: "csg_keyframe_123.jpg" }
```

### Step 3: Inject Data
```javascript
// Clone workflow template
const workflow = JSON.parse(workflowJson);

// Apply mappings
workflow["3"].inputs.text = humanReadablePrompt;
workflow["4"].inputs.image = uploadedFilename;
workflow["7"].inputs.text = negativePrompt;
```

### Step 4: Queue Prompt
```javascript
POST /prompt
Body: {
  prompt: workflow,
  client_id: "csg_12345"
}
Response: { prompt_id: "abc-123" }
```

### Step 5: Track Progress (WebSocket)
```javascript
ws://localhost:8188/ws?clientId=csg_12345

Messages:
- "status" → Queue position
- "execution_start" → Generation begins
- "executing" → Current node
- "progress" → % complete
- "executed" → Final output ready
- "execution_error" → Error occurred
```

### Step 6: Fetch Result
```javascript
GET /view?filename=output.mp4&subfolder=&type=output
// Convert to data URL and display
```

## Troubleshooting

### Issue: "No workflow synced"
**Solution**: Click "Sync Workflow from Server" in settings

### Issue: "Failed to upload image"
**Cause**: ComfyUI's input directory is not writable
**Solution**: Check ComfyUI permissions, try running as admin

### Issue: "Node X not found"
**Cause**: Workflow changed since last sync
**Solution**: Re-sync workflow and update mappings

### Issue: "Generation stuck at 0%"
**Cause**: WebSocket not connected or wrong client ID
**Solution**: Check browser console for WS errors, try new client ID

### Issue: "Out of memory" error
**Cause**: Not enough VRAM for the workflow
**Solution**: 
- Reduce image resolution
- Disable certain nodes (upscalers, etc.)
- Use CPU-only mode in ComfyUI

### Issue: "CORS error"
**Cause**: Browser blocking cross-origin requests
**Solution**: ComfyUI should allow CORS by default, but you can add:
```bash
python main.py --enable-cors-header "*"
```

## Best Practices

### 1. Workflow Design
- **Keep it simple** for initial testing (just SD base + sampler)
- **Test manually** in ComfyUI before syncing to app
- **Use descriptive node titles** (helps with debugging)
- **Save workflows** with API format for easier inspection

### 2. Performance
- **Batch size**: Keep at 1 for video generation
- **Steps**: 20-30 is usually enough (more = slower)
- **Resolution**: Start with 512x512, increase after confirming it works
- **Keyframe quality**: Higher quality inputs = better outputs

### 3. Mapping Strategy
- **Map essential inputs first**: positive prompt, image, negative prompt
- **Test incrementally**: Map one input, generate, verify, repeat
- **Use "none"** for optional inputs until you need them

### 4. Error Handling
- **Check logs**: Both browser console and ComfyUI terminal
- **Validate workflow**: Use ComfyUI's "Queue Prompt" button first
- **Test connections**: Use pre-flight check before every session

## Example Workflows

### Basic Text-to-Image
```
Checkpoint Loader ──> CLIP ──> CLIPTextEncode(+) ──┐
                                                    ├──> KSampler ──> VAE Decode ──> SaveImage
Empty Latent ──────────────────────────────────────┤
                            CLIPTextEncode(-) ──────┘
```
**Mappings**: 
- `6:text` → `human_readable_prompt` (positive)
- `7:text` → `negative_prompt` (negative)

### Image-to-Video (AnimateDiff)
```
LoadImage (keyframe) ──> AnimateDiff ──> VAEEncode ──> KSampler ──> VAEDecode ──> SaveVideo
CLIPTextEncode(+) ──────────────────────────────────────────┘
```
**Mappings**:
- `4:image` → `keyframe_image`
- `6:text` → `human_readable_prompt`

### Img2Img with ControlNet
```
LoadImage (keyframe) ──┬──> ControlNet ──┐
                       │                 ├──> KSampler ──> SaveImage
CLIPTextEncode(+) ─────┼─────────────────┤
VAEEncode ────────────>┘                 │
CLIPTextEncode(-) ───────────────────────┘
```
**Mappings**:
- `3:image` → `keyframe_image` (for LoadImage)
- `6:text` → `human_readable_prompt`
- `7:text` → `negative_prompt`

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/system_stats` | GET | Check server health, VRAM |
| `/queue` | GET | Get queue status |
| `/prompt` | POST | Queue a workflow |
| `/upload/image` | POST | Upload keyframe image |
| `/view` | GET | Fetch generated output |
| `/ws?clientId=X` | WebSocket | Track generation progress |

## Advanced: Custom Workflow Nodes

If you're using custom nodes that need specific data:

1. **Identify the input name** in the node's code or ComfyUI interface
2. **Add a custom mapping** in the settings modal
3. **Format your data** to match what the node expects
4. **Test thoroughly** before relying on it

Example for a hypothetical "SceneAnalyzer" custom node:
```json
{
  "15:scene_data": "full_timeline_json"
}
```

---

**Remember**: The app is flexible and can adapt to most ComfyUI workflows. Start simple, test often, and gradually add complexity!
