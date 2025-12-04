# Bookend Video Quality Gate

This guide explains how to configure and use the bookend video generation and quality gate features in gemDirect1.

## Overview

The bookend video generation feature uses **first-last-frame (FLF)** workflows to create videos that start and end at specific keyframes. The quality gate ensures generated videos meet quality thresholds before being accepted.

## Quick Setup

1. **Import Workflow Profiles**
   - Open Settings → ComfyUI Settings → Workflow Profiles
   - Click "Import from File" and select `localGenSettings.json`
   - Verify `wan-flf2v` profile shows "✓ Ready"

2. **Configure Bookend Workflow**
   - In ComfyUI Settings, scroll to "Workflow Profile Selection"
   - Select `wan-flf2v` for Bookend Video Workflow
   - Save settings

3. **Enable Quality Gate** (Optional)
   - Go to Settings → Features
   - Enable `videoQualityGateEnabled`
   - Enable `videoAnalysisFeedback`

## Configuration Reference

### Workflow Profiles

| Profile | Purpose | Required Nodes |
|---------|---------|----------------|
| `wan-flf2v` | First-Last-Frame video generation | `WanFunInpaintToVideo`, `LoadImage` |
| `wan-fun-inpaint` | Smooth interpolation (alternative) | `WanFunInpaintToVideo`, `LoadImage` |
| `wan-i2v` | Standard single-keyframe video | `WAN12_I2VModelLoader`, `LoadImage` |

### Settings Fields

```typescript
// In LocalGenerationSettings
sceneBookendWorkflowProfile?: string  // Default: 'wan-flf2v'
```

### Quality Thresholds

| Threshold | Default | Description |
|-----------|---------|-------------|
| `minVideoOverallScore` | 70 | Overall quality score (0-100) |
| `minStartFrameMatch` | 75 | How well video start matches keyframe |
| `minEndFrameMatch` | 75 | How well video end matches keyframe |
| `minMotionQuality` | 60 | Smoothness of motion between frames |
| `minPromptAdherence` | 60 | How well video matches the prompt |

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `videoQualityGateEnabled` | true | Enable quality gate enforcement |
| `videoAnalysisFeedback` | true | Show video analysis UI |
| `autoVideoAnalysis` | true | Auto-analyze videos after generation |
| `minVideoQualityScore` | 60 | Feature flag threshold (overrides default) |

## LLM Configuration

### Recommended Models

| Purpose | Model | Provider URL |
|---------|-------|--------------|
| Text (story generation) | `qwen/qwen3-14b` | `http://localhost:1234/v1/chat/completions` |
| Vision (video analysis) | `qwen/qwen3-vl-8b` | `http://localhost:1234/v1/chat/completions` |

### LM Studio Setup

1. Download and install [LM Studio](https://lmstudio.ai/)
2. Load `qwen/qwen3-14b` for text generation
3. Load `qwen/qwen3-vl-8b` for vision analysis
4. Start the local server on port 1234
5. Configure gemDirect1 settings:
   - LLM Provider URL: `http://localhost:1234/v1/chat/completions`
   - LLM Model: `qwen/qwen3-14b`
   - Vision LLM Model: `qwen/qwen3-vl-8b`

## Usage

### Generating Bookend Videos

1. Navigate to a scene in Director mode
2. Generate start and end keyframes:
   - Click "Generate Start Keyframe"
   - Click "Generate End Keyframe"
3. Click "Generate Video" (uses configured bookend profile)
4. Video analysis runs automatically if enabled

### Quality Gate Results

The quality gate returns one of three decisions:

- **✅ Pass**: All scores exceed thresholds. Video is accepted.
- **⚠️ Warning**: Scores are close to thresholds. Manual review suggested.
- **❌ Fail**: Scores significantly below thresholds. Regeneration recommended.

### Viewing Analysis Results

1. Find the "Video Quality Analysis" section below "Latest Render"
2. Click "Analyze Video" to run analysis on existing video
3. View scores and suggestions in the VideoAnalysisCard

## Troubleshooting

### "Bookend profile not found"

**Cause**: `wan-flf2v` profile not loaded in browser storage.

**Solution**:
1. Open Settings → ComfyUI Settings
2. Click "Import from File"
3. Select `localGenSettings.json`
4. Verify profiles show as "✓ Ready"

### "Video generation failed - wrong profile"

**Cause**: Hardcoded profile was overriding settings.

**Solution**: This is now fixed. The `sceneBookendWorkflowProfile` setting controls which profile is used. Default is `wan-flf2v`.

### "Quality gate failing on good videos"

**Cause**: Thresholds may be too strict for your use case.

**Solution**:
1. Open Settings → Features
2. Lower `minVideoQualityScore` (e.g., from 70 to 60)
3. Or disable `videoQualityGateEnabled` to skip enforcement

### "Video analysis not showing"

**Cause**: Feature flag disabled.

**Solution**:
1. Open Settings → Features
2. Enable `videoAnalysisFeedback`
3. Optionally enable `autoVideoAnalysis`

## API Reference

### Model Sanity Check

```typescript
import { validateActiveModels, isBookendGenerationReady } from './utils/modelSanityCheck';

// Validate all models and profiles
const result = validateActiveModels(settings);
console.log(result.overall.score); // 0-100
console.log(result.summary); // Human-readable summary

// Quick check for bookend readiness
const { ready, reason } = isBookendGenerationReady(settings);
if (!ready) console.error(reason);
```

### Video Quality Gate

```typescript
import { 
  evaluateVideoQuality, 
  isQualityGateEnabled,
  getQualityGateStatusMessage 
} from './services/videoQualityGateService';

// Check if quality gate is enabled
if (isQualityGateEnabled(settings)) {
  // Evaluate video quality
  const result = await evaluateVideoQuality(videoBase64, request, settings);
  
  // Get status message
  console.log(getQualityGateStatusMessage(result));
  // "✅ Quality gate passed (score: 85/100)"
  
  // Handle decision
  if (result.decision === 'fail') {
    console.log('Suggested action:', result.suggestedAction);
    // 'regenerate' or 'manual-review'
  }
}
```

## Related Files

| File | Purpose |
|------|---------|
| `types.ts` | `LocalGenerationSettings` type definition |
| `services/settingsStore.ts` | Zustand settings store |
| `components/LocalGenerationSettingsModal.tsx` | Settings UI |
| `components/TimelineEditor.tsx` | Video generation integration |
| `utils/modelSanityCheck.ts` | Model validation utilities |
| `services/videoQualityGateService.ts` | Quality gate logic |
| `services/videoFeedbackService.ts` | Video analysis with vision LLM |
| `components/VideoAnalysisCard.tsx` | Analysis results display |

## Changelog

### 2025-12-02

- Added `sceneBookendWorkflowProfile` to settings
- Fixed hardcoded `'wan-fun-inpaint'` in TimelineEditor
- Created `modelSanityCheck.ts` utility
- Created `videoQualityGateService.ts`
- Integrated VideoAnalysisCard into TimelineEditor
- Added unit tests and E2E tests
