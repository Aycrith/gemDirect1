# Generation Manifests Directory

This directory stores generation manifest files that capture versioning metadata for reproducible video generation.

## Naming Convention

Manifest files follow this pattern:
```
manifest_<type>_<scene>_<shot>_<timestamp>.json
```

### Examples

| Filename | Description |
|----------|-------------|
| `manifest_video_scene-001__2025-12-05T12-30-00.json` | Video for scene-001, no shot ID |
| `manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json` | Video for specific shot |
| `manifest_keyframe_scene-002__2025-12-05T12-35-00.json` | Keyframe generation |
| `manifest_batch__2025-12-05T13-00-00.json` | Batch generation (no scene/shot) |

## Directory Listing

To list manifests for a specific scene:
```bash
ls data/manifests/ | grep scene-001
```

To list all video manifests:
```bash
ls data/manifests/ | grep manifest_video
```

## Manifest Contents

Each manifest contains:

- **manifestId**: Unique identifier (e.g., `gm_lxyz123_abc456`)
- **generationType**: `keyframe`, `video`, `upscale`, or `batch`
- **workflow**: Workflow profile ID, version, and source path
- **determinism**: Seed, CFG scale, sampler, steps
- **inputs**: Prompt text, keyframe references
- **outputs**: Video path, resolution, duration
- **timing**: Queue time, processing duration

## Usage

### From PowerShell Scripts

Manifests are automatically written by `generate-scene-videos-wan2.ps1` after successful video generation. They're stored in:
- **Per-run manifests**: `<run-dir>/video/<scene-id>/manifests/`
- **Central manifests**: `data/manifests/`

### From Node.js/TypeScript

```typescript
import { writeManifest, listManifests, readManifest } from '../services/generationManifestNodeWriter';

// List all video manifests for scene-001
const manifests = listManifests({ type: 'video', sceneId: 'scene-001' });

// Read a specific manifest
const manifest = readManifest(manifests[0]);
```

## Related Documentation

- [Versioning and Manifests Guide](../Documentation/Guides/VERSIONING_AND_MANIFESTS.md)
- [Generation Manifest Service](../services/generationManifestService.ts)
- [Node Writer](../services/generationManifestNodeWriter.ts)
