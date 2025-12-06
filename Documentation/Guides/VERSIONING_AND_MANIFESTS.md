# Versioning and Generation Manifests

**Last Updated**: 2025-12-05  
**Status**: Phase C1.1 Complete (Disk Persistence + Git LFS)  
**Module**: `services/generationManifestService.ts`

This document describes the versioning and manifest system for reproducible video generation in gemDirect1.

## Overview

Every video generation emits a **Generation Manifest** that captures:

1. **Codebase Version** - Git commit hash and branch
2. **Workflow Version** - ComfyUI workflow profile details, embedded version metadata
3. **Model Versions** - UNET, CLIP, VAE model filenames extracted from workflow
4. **Configuration Snapshot** - Feature flags, stability profile, provider settings
5. **Determinism Parameters** - Seed, CFG scale, sampler, steps
6. **Input/Output References** - Keyframe hashes, output paths
7. **Timing Metadata** - Queue time, processing duration

## Manifest Schema

```typescript
interface GenerationManifest {
    manifestVersion: '1.0.0';
    manifestId: string;        // Unique ID: gm_<timestamp>_<random>
    generationType: 'keyframe' | 'video' | 'upscale' | 'batch';
    
    // Scene/Shot identification
    sceneId?: string;
    shotId?: string;
    
    // Versioning
    git?: GitState;            // Commit hash, branch, dirty flag
    workflow: WorkflowVersionInfo;
    models?: ModelVersionInfo[];
    
    // Configuration
    featureFlags?: Partial<FeatureFlags>;
    stabilityProfile?: 'safe-defaults' | 'production-qa' | 'custom';
    determinism: DeterminismParams;
    comfyUIUrl: string;
    videoProvider?: 'comfyui-local' | 'fastvideo-local';
    
    // Assets
    inputs: GenerationInputs;  // Prompt, keyframe hashes
    outputs: GenerationOutputs; // Video path, resolution, duration
    
    // Timing
    timing: GenerationTiming;  // Queued, started, completed timestamps
    promptId?: string;
    
    // Quality
    qualityScores?: { visionQA?: number; coherence?: number };
    warnings?: string[];
    
    // Camera Path (E1 - Camera-as-Code)
    cameraPathId?: string;           // Camera path ID from pipeline config
    cameraPathSummary?: {            // Summary for QA/context
        keyframeCount: number;
        durationSeconds?: number;
        coordinateSpace?: 'world' | 'screen' | 'relative';
        motionType?: string;
        motionIntensity?: number;
    };
}
```

## Reproducibility Guarantees

With a manifest, you can reproduce a generation by:

1. **Checking out the git commit**: `git checkout <commitHash>`
2. **Loading the same workflow profile**: Match `workflow.profileId` and `workflow.version`
3. **Using the same models**: Verify `models[].filename` are loaded
4. **Setting the same seed**: `determinism.seed` with `seedExplicit: true`
5. **Applying the same flags**: Restore `featureFlags` snapshot

### What's NOT Captured

- **Full input images**: Only hashes are stored (privacy/size constraint)
- **Transient VRAM state**: GPU memory layout may affect float precision
- **External API responses**: LLM responses are not cached

## Using Manifests

### Accessing Stored Manifests

```typescript
import { 
    getManifestById, 
    getAllManifests, 
    clearManifests 
} from './services/comfyUIService';

// Get all manifests from current session
const manifests = getAllManifests();

// Find manifest by ID
const manifest = getManifestById('gm_abc123_xyz789');

// Clear session manifests
clearManifests();
```

### Debug Mode

Enable full manifest logging:

```javascript
// In browser console
window.DEBUG_MANIFESTS = true;
```

This logs the complete JSON manifest after each generation.

### Building Custom Manifests

```typescript
import { 
    buildManifest, 
    completeManifest, 
    markManifestStarted,
    serializeManifest 
} from './services/generationManifestService';

// Build initial manifest (optionally include camera path from resolved pipeline config)
let manifest = buildManifest({
    generationType: 'video',
    sceneId: 'scene-001',
    settings: localGenSettings,
    workflowProfile: profile,
    prompt: 'A cinematic scene...',
    negativePrompt: 'blurry, low quality...',
    startKeyframe: base64Start,
    endKeyframe: base64End,
    seed: 42,
    seedExplicit: true,
    cameraPath: resolvedPipelineConfig?.cameraPath,  // E1 - Camera path from pipeline config
});

// Mark when processing starts
manifest = markManifestStarted(manifest);

// Complete with output info
manifest = completeManifest(manifest, {
    videoFilename: 'output.mp4',
    frameCount: 49,
    resolution: { width: 832, height: 480 },
    durationSeconds: 3.0,
    fps: 16,
});

// Serialize for storage
const json = serializeManifest(manifest);
```

## Workflow Version Extraction

Workflow profiles include embedded version metadata:

```json
{
  "id": "wan2-5b-flf2v",
  "revision": 1,
  "_meta": {
    "title": "WAN 2.2 5B First-Last-Frame to Video",
    "version": "1.0.0"
  }
}
```

The manifest service extracts:
- `version` from `_meta.version`
- `revision` from the root `revision` field

## Model Version Extraction

Models are extracted from workflow loader nodes:

| Node Type | Field | Category |
|-----------|-------|----------|
| `UNETLoader` | `unet_name` | `unet` |
| `CLIPLoader` | `clip_name` | `clip` |
| `VAELoader` | `vae_name` | `vae` |
| `ControlNetLoader` | `control_net_name` | `controlnet` |
| `LoraLoader` | `lora_name` | `lora` |

Example extraction:
```json
{
  "models": [
    { "modelId": "unet_3", "filename": "wan2.2_ti2v_5B_fp16.safetensors", "category": "unet" },
    { "modelId": "clip_1", "filename": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "category": "clip" },
    { "modelId": "vae_2", "filename": "wan2.2_vae.safetensors", "category": "vae" }
  ]
}
```

## Stability Profiles

The manifest detects which stability profile was active:

| Profile | Detection Logic |
|---------|-----------------|
| `safe-defaults` | VRAM-conservative flags OFF, QA flags OFF |
| `production-qa` | VRAM-conservative flags OFF, QA flags ON |
| `custom` | Any other configuration |

## Integration Points

Manifests are emitted by:

1. **`generateVideoFromBookendsNative()`** - Bookend video generation
2. Future: `generateTimelineVideos()`, `generateKeyframe()`, etc.

Each function:
1. Builds manifest at start
2. Updates with `promptId` after queue
3. Marks started when ComfyUI begins processing
4. Completes with output info on success
5. Emits via `emitManifest()` which stores in memory and logs

---

## Disk Persistence (Node/CLI Flows)

In Node.js/CLI contexts (e.g., E2E test scripts), manifests are persisted to disk.

### Storage Location

Manifests are written to: `data/manifests/`

**Naming scheme:**
```
manifest_<type>_<scene>_<shot>_<timestamp>.json
```

**Examples:**
```bash
$ ls data/manifests/
manifest_video_scene-001__2025-12-05T12-30-00.json
manifest_video_scene-002__2025-12-05T12-35-00.json
manifest_keyframe_scene-001__2025-12-05T12-28-00.json
```

### Node Writer Service

```typescript
import { 
    writeManifest, 
    writeManifestSync,
    readManifest,
    listManifests 
} from './services/generationManifestNodeWriter';

// Write manifest (async)
const result = await writeManifest(manifest);
console.log(result.path); // data/manifests/manifest_video_scene-001__2025-12-05T12-30-00.json

// Write manifest (sync)
const result = writeManifestSync(manifest, {
    outputDir: './logs/run-123/manifests' // Optional override
});

// List manifests by type
const videoManifests = listManifests({ type: 'video' });

// Read a manifest
const manifest = readManifest(videoManifests[0]);
```

### CLI Tool

Write manifests from command line (used by PowerShell scripts):

```bash
# Build and write a manifest
npx tsx scripts/write-manifest.ts --build \
    --type video \
    --scene scene-001 \
    --workflow-id wan-i2v \
    --prompt "A cinematic scene..." \
    --seed 42 \
    --video-file scene-001.mp4 \
    --output-dir ./logs/run-123

# Dry run (preview without writing)
npx tsx scripts/write-manifest.ts --build --type video --scene scene-001 --dry-run
```

### E2E Pipeline Integration

The `generate-scene-videos-wan2.ps1` script automatically writes manifests after successful video generation:

```powershell
# After video copy succeeds:
# [Scene scene-001] ✓ Video copied successfully
# [Scene scene-001] Writing generation manifest...
# [Scene scene-001] ✓ Manifest written
```

Manifests are written to two locations:
1. **Per-run location**: `<run-dir>/video/<scene-id>/manifests/`
2. **Central repository**: `data/manifests/`

---

## Asset Versioning with Git LFS

Large binary assets are tracked with Git LFS to avoid bloating the repository.

### Setup

```bash
# Install Git LFS (one-time)
# Windows: winget install GitHub.GitLFS
# macOS: brew install git-lfs
# Linux: apt install git-lfs

# Initialize in repository (after clone)
git lfs install

# Clone with LFS
git lfs clone <repo-url>

# Or pull LFS files after regular clone
git lfs pull
```

### Tracked Files

The `.gitattributes` file configures LFS tracking:

| Pattern | Description |
|---------|-------------|
| `data/bookend-golden-samples/**/*.{png,jpg,mp4}` | QA baseline images/videos |
| `data/vision-qa-baselines/**/*.{png,jpg}` | Vision QA references |
| `artifacts/**/*.{mp4,png,zip}` | Generated test artifacts |
| `*.safetensors`, `*.ckpt`, `*.pth` | Model files (if committed) |

### NOT Tracked by LFS

These files remain in regular git:
- `workflows/*.json` - ComfyUI workflows (small, diffable)
- `data/manifests/*.json` - Generation manifests (small, diffable)
- All source code (`.ts`, `.tsx`, `.json`, `.md`)

### Common Operations

```bash
# Check LFS status
git lfs status

# List LFS-tracked files
git lfs ls-files

# Pull only LFS files
git lfs pull

# Push LFS files
git lfs push --all origin

# Prune local LFS cache
git lfs prune
```

---

## Future Enhancements

1. ~~**IndexedDB Persistence**: Store manifests across sessions~~ (Browser: in-memory only)
2. ~~**File Export**: Download manifests as JSON~~ (C1.1: Done for CLI)
3. **Git State Capture**: Auto-fetch commit hash at build time
4. **Manifest Comparison**: Diff two manifests to see configuration changes
5. ~~**Replay Generation**: Load manifest and re-run with same settings~~ (C1.2: Done)

---

## Replaying from a Manifest (C1.2)

**Added**: 2025-12-05  
**Module**: `services/manifestReplayService.ts`

The manifest replay system enables regenerating videos from existing manifests, useful for:

- **Reproducibility**: Re-run a generation with the same parameters
- **Debugging**: Inspect what settings were used for a particular output
- **Iteration**: Make targeted modifications and regenerate
- **Comparison**: Generate side-by-side outputs with different settings

### CLI Usage

```powershell
# Inspect a manifest (dry-run mode)
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --dry-run

# Execute replay with same settings
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json

# Specify custom output directory
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --output-dir ./replay-output

# Verbose output for debugging
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_2025-12-05T12-30-00.json --verbose
```

### Programmatic Usage

```typescript
import { loadReplayPlan, executeReplay, formatReplayPlanSummary } from './services/manifestReplayService';

// Load and inspect a replay plan
const plan = await loadReplayPlan('/path/to/manifest.json', {
    workflowProfiles: currentSettings.workflowProfiles, // Optional: provide current profiles
});

// Display the plan summary
console.log(formatReplayPlanSummary(plan));

// Execute the replay (dry-run first)
const dryResult = await executeReplay(plan, { dryRun: true });

// Actually regenerate
const result = await executeReplay(plan, { dryRun: false });
console.log(`Replayed video: ${result.outputVideoPath}`);
```

### What Gets Replayed

The replay system reconstructs:

| Setting | Source |
|---------|--------|
| Workflow Profile | `manifest.workflow.profileId` → resolved from settings or disk |
| Feature Flags | `manifest.featureFlags` → merged onto `DEFAULT_FEATURE_FLAGS` |
| Stability Profile | `manifest.stabilityProfile` → mapped to `fast`/`standard`/`cinematic` |
| Seed | `manifest.determinism.seed` → reused if explicit |
| Prompts | `manifest.inputs.prompt` / `negativePrompt` |
| Camera Path | `manifest.cameraPathId` → referenced for context |
| Temporal Regularization | `manifest.temporalRegularizationApplied` → flag state |

### Limitations

**Replay is "best effort" and not guaranteed to produce pixel-identical output:**

1. **Environment Differences**: Different GPU, drivers, or CUDA version can affect outputs
2. **Model Changes**: If models have been updated/replaced since original generation
3. **Workflow Changes**: If the workflow JSON has been modified
4. **Floating Point Precision**: GPU float operations may differ across runs
5. **Missing Inputs**: Original keyframe images are not stored (only hashes)

**Error Conditions:**

- If the workflow profile referenced in the manifest is missing, replay will fail
- If required mappings are not configured, replay will fail
- Unknown feature flags from older/newer manifests generate warnings but don't block

### Dry-Run Output Example

```
┌─────────────────────────────────────────────────────────────┐
│                     REPLAY PLAN SUMMARY                    │
├─────────────────────────────────────────────────────────────┤
│ Manifest ID:          gm_lz123_abc456                      │
│ Type:                 video                                │
│ Scene:                scene-001                            │
│ Shot:                 shot-001                             │
├─────────────────────────────────────────────────────────────┤
│ Workflow Profile:     wan-flf2v                            │
│ Stability Profile:    standard                             │
│ Seed:                 42                                   │
│ Camera Path:          slow-pan-left                        │
│ Temporal Reg:         Yes                                  │
├─────────────────────────────────────────────────────────────┤
│ Original Output:                                           │
│   /output/scene-001/shot-001.mp4                           │
└─────────────────────────────────────────────────────────────┘

--- DRY RUN MODE ---
No generation will be performed.
Remove --dry-run to execute the replay.
```

---

## Related Documentation

- [Feature Flags](./FEATURE_FLAGS.md) - Flag system and stability profiles
- [ComfyUI Integration](../Workflows/ComfyUI/COMFYUI_WORKFLOW_INDEX.md) - Workflow profiles
- [QA Semantics](../QA_SEMANTICS.md) - Quality scoring integration
- [Manifest Directory README](../../data/manifests/README.md) - Storage details
