# Camera Path-Driven Generation (E1.2) Verification Guide

Part of Workstream E – Cinematic / Temporal Quality Enhancements.

## Overview

This document explains how to verify that camera path-driven video generation is working correctly. The E1.2 feature allows you to define camera movement paths in pipeline configs and have them drive ComfyUI camera/motion nodes during video generation.

## Quick Start

### 1. Enable the Feature Flag

The camera path feature is **OFF by default**. Enable it in one of these ways:

**Via Settings UI:**
1. Open Settings → Advanced Settings
2. Enable "Camera Path-Driven Generation"
3. Save settings

**Via Feature Flags Override:**
```typescript
settings.featureFlags = {
    ...settings.featureFlags,
    cameraPathDrivenGenerationEnabled: true,
};
```

### 2. Use a Pipeline with Camera Path

The `production-qa-preview` pipeline includes a sample camera path:

```json
{
  "cameraPath": {
    "id": "production-qa-basic-pan",
    "description": "Basic left-to-right pan over 3 seconds",
    "coordinateSpace": "screen",
    "motionType": "pan",
    "motionIntensity": 0.3,
    "keyframes": [
      { "timeSeconds": 0.0, "position": { "x": 0.0, "y": 0.5 } },
      { "timeSeconds": 1.5, "position": { "x": 0.5, "y": 0.5 }, "easing": "easeInOut" },
      { "timeSeconds": 3.0, "position": { "x": 1.0, "y": 0.5 }, "easing": "easeOut" }
    ]
  }
}
```

### 3. Generate a Video

1. Load a scene with the Production QA preset
2. Generate bookend keyframes
3. Generate video using the bookend workflow
4. Check console logs for camera path application

## Verification Steps

### Step 1: Check Console Logs

When camera path integration is active, you'll see logs like:

```
[wan-fun-inpaint] Camera path 'production-qa-basic-pan' enabled: 49 frame overrides generated
[wan-fun-inpaint] Injected camera override: 42.motion_x
[wan-fun-inpaint] Injected camera override: 42.motion_y
```

### Step 2: Run the Benchmark Harness

After generating a video with camera path enabled, run the benchmark to see path adherence metrics:

```powershell
npx tsx scripts/benchmarks/video-quality-benchmark.ts --verbose
```

Look for these metrics in the output:
- `pathAdherenceMeanError` - Mean deviation from expected path (lower = better)
- `pathDirectionConsistency` - How well motion follows expected direction (0-1, higher = better)

### Step 3: Visual Inspection

For the left-to-right pan path:
- Frame 1 should show content weighted toward the LEFT of frame
- Middle frames should show centered content
- Final frame should show content weighted toward the RIGHT of frame

The motion should be smooth and follow the easing curve (slow start, fast middle, slow end for easeInOut).

## Interpreting Metrics

### Path Adherence Mean Error

| Value | Interpretation |
|-------|----------------|
| < 0.1 | Excellent - motion closely follows path |
| 0.1 - 0.2 | Good - minor deviations |
| 0.2 - 0.3 | Acceptable - noticeable but not severe |
| > 0.3 | Poor - significant deviation from path |

### Path Direction Consistency

| Value | Interpretation |
|-------|----------------|
| > 0.8 | Excellent - motion direction matches consistently |
| 0.6 - 0.8 | Good - mostly correct direction |
| 0.4 - 0.6 | Mixed - some directional disagreement |
| < 0.4 | Poor - motion frequently opposite to expected |

## Troubleshooting

### "Camera path integration failed (non-blocking)"

This warning appears if the pipeline config cannot be loaded. Check:
1. `config/pipelines/production-qa-preview.json` exists and is valid JSON
2. The config has a valid `cameraPath` object

### "Camera path validation failed"

The camera path has structural issues:
- Ensure keyframes have `timeSeconds` values
- Ensure keyframes are in chronological order
- Ensure at least one keyframe exists

### No Motion Visible

If the video shows no camera-like motion despite enabled flags:
1. The target workflow may not have compatible motion control nodes
2. Check if `motion_x`, `motion_y` inputs exist in your workflow
3. Camera path overrides are only injected if matching node inputs are found

## Creating Custom Camera Paths

You can define your own camera paths in pipeline configs:

```json
{
  "cameraPath": {
    "id": "my-custom-path",
    "description": "Slow zoom with tilt",
    "coordinateSpace": "screen",
    "motionType": "zoom",
    "keyframes": [
      { 
        "timeSeconds": 0, 
        "position": { "x": 0.5, "y": 0.5 },
        "fovDegrees": 60
      },
      { 
        "timeSeconds": 3, 
        "position": { "x": 0.5, "y": 0.3 },
        "fovDegrees": 40,
        "easing": "easeInOut"
      }
    ]
  }
}
```

### Supported Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `description` | string | Human-readable description |
| `coordinateSpace` | 'screen' \| 'world' \| 'relative' | Coordinate system |
| `motionType` | string | Motion hint: 'pan', 'tilt', 'zoom', 'dolly', 'static' |
| `motionIntensity` | number | 0-1 intensity hint |
| `keyframes` | array | Ordered list of keyframe objects |

### Keyframe Properties

| Property | Type | Description |
|----------|------|-------------|
| `timeSeconds` | number | Time in seconds from start |
| `position` | `{x, y, z?}` | Normalized position (0-1) |
| `fovDegrees` | number | Field of view in degrees |
| `easing` | 'linear' \| 'easeIn' \| 'easeOut' \| 'easeInOut' | Transition easing |
| `label` | string | Debug label |

## Technical Details

### Integration Point

Camera path overrides are injected in `services/comfyUIService.ts` within `queueComfyUIPromptDualImage()`:

1. Check if `cameraPathDrivenGenerationEnabled` flag is true
2. Load pipeline config for camera path
3. Validate the camera path structure
4. Build per-frame overrides using `buildCameraNodeOverrides()`
5. Format for ComfyUI nodes using `formatForComfyUINode()`
6. Inject into workflow prompt payload

### Files Involved

| File | Purpose |
|------|---------|
| `services/cameraPathToComfyNodes.ts` | Camera path → ComfyUI node mapping |
| `services/pipelineConfigService.ts` | Camera path resolution from configs |
| `services/comfyUIService.ts` | Integration point for injection |
| `utils/featureFlags.ts` | Feature flag definition |
| `config/pipelines/production-qa-preview.json` | Sample pipeline with camera path |
| `types/cameraPath.ts` | Camera path type definitions |

## Related Documentation

- `Documentation/Guides/PIPELINE_CONFIGS.md` - Pipeline configuration guide
- `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md` - ComfyUI workflow details
- `scripts/benchmarks/video-quality-benchmark.ts` - Benchmark harness with camera metrics
