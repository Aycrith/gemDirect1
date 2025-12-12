# Pipeline Configuration Guide

**Last Updated**: 2025-12-05  
**Status**: ✅ Active  
**Phase**: C2 - Modular Pipeline Refactor & Configuration Schema  
**Extended**: E1 - Camera Path Infrastructure (Camera-as-Code), H2 - Camera Motion Templates

This guide explains how to define, configure, and use pipeline configurations in gemDirect1. Pipeline configs allow you to define video generation pipelines as data (JSON files) rather than having pipeline logic scattered across UI and services.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Configuration Schema](#configuration-schema)
4. [Camera Paths (Camera-as-Code)](#camera-paths-camera-as-code)
5. [Camera Motion Templates (H2)](#camera-motion-templates-h2)
6. [Standard Pipeline Configs](#standard-pipeline-configs)
7. [Creating Custom Pipelines](#creating-custom-pipelines)
8. [Integration Points](#integration-points)
9. [Relationship to Existing Features](#relationship-to-existing-features)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What is a Pipeline Configuration?

A pipeline configuration is a JSON file that fully describes how to generate video for a scene. It captures:

- **Workflow selection**: Which ComfyUI workflow profile to use
- **Stability profile**: Temporal coherence settings (Fast/Standard/Cinematic)
- **Feature flags**: Which features are enabled/disabled
- **QA expectations**: Quality gates and thresholds
- **VRAM requirements**: GPU memory hints for preflight checks

### Benefits

- **Reproducibility**: Same config = same output settings
- **Version control**: Track pipeline changes in git
- **Sharing**: Export/import pipeline configurations
- **Testing**: Validate pipelines against known golden samples
- **Debugging**: Clear audit trail of what settings were used

### File Location

Pipeline configs live in:
```
config/pipelines/*.json
```

---

## Quick Start

### Using an Existing Pipeline

1. Open the **Production Video Preview** panel (in Settings or Testing area)
2. Select a pipeline preset (Fast, Production, Cinematic)
3. The panel automatically loads the corresponding config from `config/pipelines/`
4. Click **Generate Preview Clip** to test

### Creating a New Pipeline

1. Copy an existing config from `config/pipelines/`
2. Modify the JSON to match your requirements
3. Save with a unique ID (e.g., `my-custom-pipeline.json`)
4. Reference by ID in code or UI

---

## Configuration Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Schema version (currently `"1.0"`) |
| `id` | string | Unique identifier (used for lookup) |
| `name` | string | Human-readable name |
| `workflowProfileId` | string | ComfyUI workflow profile ID (e.g., `"wan-fun-inpaint"`) |
| `presetMode` | string | One of: `fast`, `production`, `production-qa`, `cinematic`, `safe-defaults`, `custom` |
| `stabilityProfile` | string | One of: `fast`, `standard`, `cinematic`, `custom` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Pipeline description |
| `featureFlags` | object | Feature flags configuration |
| `qa` | object | QA expectations |
| `outputHints` | object | Output resolution, FPS, duration hints |
| `keyframeMode` | string | `"single"` or `"bookend"` (default: `"bookend"`) |
| `vramRequirements` | object | GPU memory requirements |
| `scenes` | array | Scene configurations (for multi-scene pipelines) |
| `metadata` | object | Creation timestamp, author, tags, notes |

### Complete Example

```json
{
  "version": "1.0",
  "id": "production-qa-golden",
  "name": "Production QA Golden Pipeline",
  "workflowProfileId": "wan-fun-inpaint",
  "presetMode": "production-qa",
  "stabilityProfile": "standard",
  "keyframeMode": "bookend",
  "postProcessing": {
    "interpolation": {
      "enabled": true,
      "profileId": "rife-interpolation",
      "multiplier": 2
    }
  },
  "featureFlags": {
    "useGenerationQueue": true,
    "enableFLF2V": true
  }
}
```

### Post-Processing Configuration

Pipelines can configure post-processing steps like interpolation and upscaling.

```json
{
  "postProcessing": {
    "interpolation": {
      "enabled": true,
      "profileId": "rife-interpolation",
      "multiplier": 2
    },
    "upscaling": {
      "enabled": false,
      "profileId": "video-upscaler",
      "scaleFactor": 2
    }
  }
}
```

These settings map to the `videoUpscalingService` and require corresponding workflow profiles in `localGenSettings.json`.

---

## Camera Paths (Camera-as-Code)

```json
{
  "version": "1.0",
  "id": "production-qa-preview",
  "name": "Production QA Preview",
  "description": "Production-quality video generation with QA gates enabled.",
  
  "workflowProfileId": "wan-fun-inpaint",
  "presetMode": "production-qa",
  "stabilityProfile": "standard",
  
  "featureFlags": {
    "base": "production-qa",
    "overrides": {}
  },
  
  "qa": {
    "keyframePairAnalysis": true,
    "bookendQAMode": true,
    "videoQualityGateEnabled": true,
    "videoQualityThreshold": 70,
    "videoAnalysisFeedback": true,
    "autoVideoAnalysis": true
  },
  
  "outputHints": {
    "durationSeconds": 3.0
  },
  
  "keyframeMode": "bookend",
  
  "vramRequirements": {
    "minGB": 10,
    "recommendedGB": 12,
    "category": "medium"
  },
  
  "metadata": {
    "createdAt": "2025-12-05T00:00:00Z",
    "author": "gemDirect1",
    "tags": ["production", "qa", "default"]
  }
}
```

### Feature Flags Configuration

The `featureFlags` object supports:

```typescript
{
  // Base preset to start from
  "base": "default" | "safe-defaults" | "production-qa",
  
  // Explicit overrides (any FeatureFlags property)
  "overrides": {
    "videoUpscaling": true,
    "characterConsistency": true,
    // ... any flag can be overridden
  }
}
```

**Resolution order:**
1. Start with base preset flags
2. Apply explicit overrides
3. Apply stability profile temporal settings

### QA Expectations

The `qa` object controls quality gates:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `keyframePairAnalysis` | boolean | false | Vision LLM preflight check |
| `bookendQAMode` | boolean | false | Master QA switch |
| `videoQualityGateEnabled` | boolean | false | Quality gate enforcement |
| `videoQualityThreshold` | number | 60 | Minimum quality score (0-100) |
| `videoAnalysisFeedback` | boolean | false | Post-gen video analysis |
| `autoVideoAnalysis` | boolean | false | Auto-run analysis |

### VRAM Requirements

```json
{
  "vramRequirements": {
    "minGB": 8,           // Minimum VRAM in GB
    "recommendedGB": 12,  // Recommended VRAM in GB
    "category": "medium"  // "low" | "medium" | "high" for UI display
  }
}
```

---

## Camera Paths (Camera-as-Code)

> **Added in E1 - Camera Path Infrastructure**

Pipeline configs can include camera path definitions that describe camera movement over time. This enables:

- **Reproducible camera movements**: Define once, use consistently
- **Temporal coherence context**: Provide motion hints for generation
- **QA/benchmark metadata**: Track camera motion in manifests
- **Future motion guidance**: Prepare for optical-flow-guided generation

### Camera Path Schema

```typescript
interface CameraPath {
  id: string;                          // Unique identifier
  description?: string;                // Human-readable description
  coordinateSpace?: 'world' | 'screen' | 'relative';  // Default: 'screen'
  motionType?: string;                 // e.g., 'pan', 'dolly', 'zoom', 'static'
  motionIntensity?: number;            // 0-1 normalized
  keyframes: CameraKeyframe[];         // Sequence of camera states
  metadata?: {                         // Optional tracking info
    createdAt?: string;
    author?: string;
    notes?: string;
  };
}

interface CameraKeyframe {
  timeSeconds: number;                 // Time from start of shot
  position?: { x: number; y: number; z?: number };
  rotationDeg?: { yaw?: number; pitch?: number; roll?: number };
  fovDegrees?: number;                 // Field of view (zoom)
  lookAt?: { x: number; y: number; z?: number };
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  label?: string;                      // For debugging
}
```

### Example: Basic Pan

```json
{
  "cameraPath": {
    "id": "production-qa-basic-pan",
    "description": "Basic left-to-right pan over 3 seconds",
    "coordinateSpace": "screen",
    "motionType": "pan",
    "motionIntensity": 0.3,
    "keyframes": [
      { "timeSeconds": 0.0, "position": { "x": 0.0, "y": 0.5 }, "fovDegrees": 50, "label": "Start - left" },
      { "timeSeconds": 1.5, "position": { "x": 0.5, "y": 0.5 }, "easing": "easeInOut", "label": "Mid - center" },
      { "timeSeconds": 3.0, "position": { "x": 1.0, "y": 0.5 }, "easing": "easeOut", "label": "End - right" }
    ]
  }
}
```

### Coordinate Spaces

| Space | Description | Use Case |
|-------|-------------|----------|
| `screen` | Normalized 0-1 coordinates (0,0 = top-left) | 2D pans, simple motion |
| `world` | Absolute 3D coordinates | Full 3D camera paths |
| `relative` | Offsets from initial position | Smooth transitions |

### Current Usage

In this first phase (E1), camera paths are used for:

1. **Metadata capture**: Camera path ID and summary are recorded in generation manifests
2. **Pipeline resolution**: `resolvePipelineRuntimeConfig()` includes camera path in resolved config
3. **Validation**: Keyframe ordering and completeness are validated

Future phases will add:
- Motion guidance for video generation
- Optical flow constraints
- Camera motion QA metrics

### Manifest Integration

When a pipeline with a camera path is used for generation, the manifest includes:

```json
{
  "cameraPathId": "production-qa-basic-pan",
  "cameraPathSummary": {
    "keyframeCount": 3,
    "durationSeconds": 3,
    "coordinateSpace": "screen",
    "motionType": "pan",
    "motionIntensity": 0.3
  }
}
```

### Motion Tracks (Future)

The schema also supports `motionTracks` for subject motion (stubbed for future):

```json
{
  "motionTracks": [
    {
      "id": "subject-1",
      "description": "Main character walking right",
      "motionType": "walking",
      "intensity": 0.5
    }
  ]
}
```

### See Also

- `types/cameraPath.ts` - Full TypeScript definitions
- `types/pipelineConfig.ts` - Integration with pipeline config
- `services/generationManifestService.ts` - Manifest summary generation

---

## Camera Motion Templates (H2)

> **Added in H2 - Camera Motion Templates & Profiles**

Camera motion templates are pre-defined, reusable camera paths stored as JSON files. They provide named, tested camera movements that can be referenced by ID instead of defining inline.

### Template Location

```
config/camera-templates/*.json      # Source files
public/config/camera-templates/     # Served to browser
```

### Available Templates

| Template ID | Motion Type | Duration | Description |
|-------------|-------------|----------|-------------|
| `static-center` | static | 3s | No motion, fixed center position |
| `slow-pan-left-to-right` | pan | 4s | Gentle horizontal pan with easing |
| `slow-dolly-in` | dolly | 3s | FOV-based push-in for intimacy |
| `orbit-around-center` | orbit | 4s | Partial orbit (5 keyframes) |
| `gentle-float-down` | crane | 5s | Vertical descent / crane down |

### Template Schema

Templates extend the CameraPath schema with additional metadata:

```json
{
  "$schema": "./camera-template.schema.json",
  "id": "slow-pan-left-to-right",
  "description": "Gentle horizontal pan from left to right across the frame",
  "coordinateSpace": "screen",
  "motionType": "pan",
  "motionIntensity": 0.3,
  "keyframes": [
    { "timeSeconds": 0.0, "position": { "x": 0.2, "y": 0.5 }, "fovDegrees": 50 },
    { "timeSeconds": 2.0, "position": { "x": 0.5, "y": 0.5 }, "easing": "easeInOut" },
    { "timeSeconds": 4.0, "position": { "x": 0.8, "y": 0.5 }, "easing": "easeOut" }
  ],
  "metadata": {
    "author": "gemDirect1",
    "tags": ["neutral", "establishing", "slow"],
    "notes": "Good for establishing shots or slow reveals"
  }
}
```

### Using Templates in Code

```typescript
import { getCameraTemplate, listCameraTemplates } from './services/cameraTemplateService';

// List all available templates
const templates = await listCameraTemplates();

// Get a specific template by ID
const panTemplate = await getCameraTemplate('slow-pan-left-to-right');

// Use in pipeline config
const pipelineConfig = {
  ...baseConfig,
  cameraPath: panTemplate.path  // CameraPath object
};
```

### Using Templates in UI

The **Production Quality Preview** panel includes a camera template dropdown for Cinematic and Production presets:

1. Select a preset that supports camera motion
2. Choose a template from the dropdown (or "None" for no camera motion)
3. The template's motion type and duration are shown
4. Generate to see the camera movement applied

### Creating Custom Templates

1. Copy an existing template:
   ```bash
   cp config/camera-templates/slow-pan-left-to-right.json config/camera-templates/my-custom-pan.json
   ```

2. Edit the template (use unique ID)

3. Copy to public folder:
   ```bash
   cp config/camera-templates/my-custom-pan.json public/config/camera-templates/
   ```

4. Reload the app - template will appear in dropdowns

### Tag-Based Suggestions

The `cameraTemplateService` can suggest templates based on mood/tags:

```typescript
import { suggestCameraTemplate } from './services/cameraTemplateService';

// Suggest based on mood and optional motion preference
const suggested = await suggestCameraTemplate('establishing', 'orbit');
// Returns orbit-around-center (has 'establishing' tag)

const intimateSuggestion = await suggestCameraTemplate('intimate');
// Returns slow-dolly-in (has 'intimate' tag)
```

---

## Standard Pipeline Configs

Three standard pipelines are shipped with the application:

### fast-preview.json
- **VRAM**: 6-8 GB (Low)
- **Stability**: Fast
- **Features**: No temporal processing
- **Use case**: Quick iteration, development, testing

### production-qa-preview.json (Default)
- **VRAM**: 10-12 GB (Medium)
- **Stability**: Standard
- **Features**: Deflicker ON, QA gates enabled
- **Use case**: Production workflows with quality validation

### cinematic-preview.json
- **VRAM**: 12-16 GB (High)
- **Stability**: Cinematic
- **Features**: Full temporal stack (deflicker + IP-Adapter + prompt scheduling)
- **Use case**: Maximum quality final output

---

## Creating Custom Pipelines

### Step 1: Copy a Base Config

```bash
cp config/pipelines/production-qa-preview.json config/pipelines/my-custom.json
```

### Step 2: Modify Required Fields

```json
{
  "id": "my-custom-pipeline",
  "name": "My Custom Pipeline",
  "description": "Custom configuration for my project",
  // ... rest of config
}
```

### Step 3: Customize Settings

**For lower VRAM usage:**
```json
{
  "stabilityProfile": "fast",
  "featureFlags": {
    "base": "safe-defaults",
    "overrides": {}
  },
  "vramRequirements": {
    "minGB": 6,
    "recommendedGB": 8,
    "category": "low"
  }
}
```

**For maximum quality:**
```json
{
  "stabilityProfile": "cinematic",
  "featureFlags": {
    "base": "default",
    "overrides": {
      "ipAdapterReferenceConditioning": true,
      "promptScheduling": true
    }
  },
  "qa": {
    "keyframePairAnalysis": true,
    "bookendQAMode": true,
    "videoQualityGateEnabled": true,
    "videoQualityThreshold": 80
  }
}
```

### Step 4: Test Your Config

Use the Production Video Preview panel to test your config before using it in production.

---

## Integration Points

### Loading Configs in Code

```typescript
import { 
  loadPipelineConfigById, 
  resolvePipelineRuntimeConfig,
  mergePipelineIntoSettings 
} from '../services/pipelineConfigService';

// Load config by ID
const loadResult = await loadPipelineConfigById('production-qa-preview');
if (!loadResult.success) {
  console.error('Failed to load config:', loadResult.error);
  return;
}

// Resolve to runtime objects
const resolved = resolvePipelineRuntimeConfig(loadResult.config, currentSettings);

// Merge into settings for generation
const pipelineSettings = mergePipelineIntoSettings(currentSettings, resolved);

// Now use pipelineSettings for video generation
await generateVideoFromBookendsWithPreflight(pipelineSettings, ...);
```

### Fallback Pattern

Always implement fallback to legacy behavior when configs fail:

```typescript
let pipelineSettings: LocalGenerationSettings;
let resolvedConfig: ResolvedPipelineConfig | null = null;

// Try config-driven approach
const loadResult = await loadPipelineConfigById('my-pipeline');
if (loadResult.success && loadResult.config) {
  try {
    resolvedConfig = resolvePipelineRuntimeConfig(loadResult.config, settings);
    pipelineSettings = mergePipelineIntoSettings(settings, resolvedConfig);
  } catch (error) {
    console.warn('Config resolution failed, using legacy path:', error);
    resolvedConfig = null;
  }
}

// Fallback: use legacy hard-coded settings
if (!resolvedConfig) {
  pipelineSettings = {
    ...settings,
    videoWorkflowProfile: 'wan-fun-inpaint',
    // ... other legacy settings
  };
}
```

### TypeScript Types

```typescript
import type { 
  PipelineConfig,
  SceneConfig,
  ResolvedPipelineConfig,
  PipelineConfigLoadResult,
} from '../types/pipelineConfig';
```

---

## Relationship to Existing Features

### Presets & Stability Profiles

Pipeline configs **reference** existing stability profiles (`utils/stabilityProfiles.ts`):
- `fast`, `standard`, `cinematic`, `custom`

The config's `stabilityProfile` field maps to these profiles for temporal coherence settings.

### Feature Flags

Pipeline configs **layer on top of** existing flag presets (`utils/featureFlags.ts`):
- `DEFAULT_FEATURE_FLAGS`
- `SAFE_DEFAULTS_FLAGS`
- `PRODUCTION_QA_FLAGS`

The config specifies a `base` and optional `overrides`.

### Resource Preflight

Pipeline configs provide VRAM requirements that integrate with resource preflight:
- `resourcePreflight.ts` checks available VRAM
- Compares against config's `vramRequirements`
- Supports preset downgrade if insufficient VRAM

### Manifests

Generation manifests (`generationManifestService.ts`) already capture runtime configuration. Pipeline configs complement this by:
- Providing **input** configuration (what settings to use)
- While manifests capture **output** (what settings were actually used)

### Vision QA

Pipeline configs can enable QA features via the `qa` section:
- Aligned with thresholds in `visionThresholdConfig.ts`
- Integrates with `videoQualityGateService.ts`

---

## Troubleshooting

### Config Not Loading

1. Check file exists in `config/pipelines/`
2. Verify JSON syntax (use a JSON validator)
3. Check browser console for fetch errors
4. Ensure workflow profile ID matches one in settings

### Workflow Profile Not Found

Error: `Workflow profile 'xxx' not found`

**Solution:**
1. Open Settings → ComfyUI Settings
2. Click "Import from File"
3. Import `localGenSettings.json` to load all profiles

### Config Validation Failed

Check the validation result's `errors` array:
```typescript
const result = validatePipelineConfig(config);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

Common issues:
- Missing required fields
- Invalid `presetMode` or `stabilityProfile` values
- Invalid `featureFlags.base` value
- `videoQualityThreshold` out of range (0-100)

### VRAM Warnings

If you see "VRAM minGB is greater than recommendedGB":
- This is a warning, not an error
- Check your `vramRequirements` values
- Ensure `minGB ≤ recommendedGB`

---

## Related Documentation

- [VERSIONING_AND_MANIFESTS.md](./VERSIONING_AND_MANIFESTS.md) - Generation manifests
- [QA_SEMANTICS.md](../QA_SEMANTICS.md) - QA threshold semantics
- [WORKFLOW_ARCHITECTURE_REFERENCE.md](../Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md) - ComfyUI workflows
