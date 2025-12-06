# Presets and VRAM Requirements

**Last Updated**: 2025-12-07  
**Status**: Production Reference

This guide documents the stability profiles, feature flag presets, and VRAM requirements for gemDirect1's video generation pipeline.

## Quick Reference

| Profile | Min VRAM | Recommended | Use Case |
|---------|----------|-------------|----------|
| Safe Defaults | 6 GB | 8 GB | Conservative, troubleshooting |
| Fast | 6 GB | 8 GB | Quick iteration, testing |
| **Production QA** | 8 GB | 10-12 GB | **QA-enabled production** |
| Standard | 8 GB | 10 GB | Production quality (default) |
| Cinematic | 12 GB | 16 GB | Maximum quality |

## Configuration Presets (Feature Flags)

### Safe Defaults Mode
- **VRAM**: ~6-8 GB
- **QA Features**: ❌ Disabled
- **Temporal Processing**: ❌ Disabled
- **Best For**: First-time setup, troubleshooting OOM errors, VRAM-constrained systems

This is the most conservative configuration. All VRAM-intensive and experimental features are disabled.

**To Apply**: Settings → Features → Click "Apply Safe Defaults"

### Production QA Mode ⭐ NEW
- **VRAM**: ~10-12 GB recommended
- **QA Features**: ✅ Enabled (aligned with A1/A3 thresholds)
- **Temporal Processing**: ✅ Standard deflicker enabled
- **Best For**: Production workflows with quality validation

This mode enables key QA features without requiring high-end GPU:
- **keyframePairAnalysis**: Pre-flight continuity check before video generation
- **bookendQAMode**: Master switch for bookend QA validation
- **videoQualityGateEnabled**: Quality gate enforcement with thresholds

VRAM-heavy features (FETA, IP-Adapter, upscaling) remain disabled for moderate VRAM compatibility.

**To Apply**: Settings → Features → Click "Apply Production QA"

**Threshold Alignment**: Uses thresholds from A1/A3 Vision QA system:
- minOverall: 80% (from visionThresholdConfig.ts)
- videoQualityThreshold: 70% (default quality gate)

### Cinematic Mode
- **VRAM**: ~12-16 GB
- **QA Features**: Optional (can enable manually)
- **Temporal Processing**: ✅ Full suite (FETA, IP-Adapter)
- **Best For**: Maximum quality output, high-end GPUs

This mode enables all temporal coherence features for professional-quality output.

## Preset Comparison

| Feature | Safe Defaults | Production QA | Standard | Cinematic |
|---------|---------------|---------------|----------|-----------|
| **QA Features** | | | | |
| keyframePairAnalysis | ❌ | ✅ | ❌ | ❌ |
| bookendQAMode | ❌ | ✅ | ❌ | ❌ |
| videoQualityGateEnabled | ❌ | ✅ | ❌ | ❌ |
| autoVideoAnalysis | ❌ | ✅ | ❌ | ❌ |
| **Temporal** | | | | |
| videoDeflicker | ❌ | ✅ (0.45) | ✅ (0.45) | ✅ (0.55) |
| enhanceAVideoEnabled | ❌ | ❌ | ❌ | ✅ |
| ipAdapterConditioning | ❌ | ❌ | ❌ | ✅ |
| **VRAM Impact** | Minimal | Moderate | Moderate | High |

## Stability Profiles

### Fast Profile
- **VRAM**: ~6 GB minimum, 8 GB recommended
- **Temporal Processing**: Disabled
- **Best For**: Quick iteration, prompt testing, VRAM-constrained systems

Features disabled:
- Video deflicker
- IP-Adapter conditioning
- Prompt scheduling

### Standard Profile (Default)
- **VRAM**: ~8 GB minimum, 10 GB recommended
- **Temporal Processing**: Basic deflicker enabled
- **Best For**: Production video generation

Features enabled:
- Video deflicker (strength: 0.45)
- Basic temporal smoothing (window: 5)

### Cinematic Profile
- **VRAM**: ~12 GB minimum, 16 GB recommended
- **Temporal Processing**: Full suite
- **Best For**: Maximum quality output

Features enabled:
- Enhanced deflicker (strength: 0.55)
- Extended temporal window (window: 7)
- IP-Adapter reference conditioning
- Prompt scheduling
- Temporal regularization (ffmpeg post-processing, E2 prototype)

## Temporal Regularization (E2 Prototype)

Temporal regularization is an **optional ffmpeg-based post-processing step** that applies frame blending (tmix filter) to reduce flicker/jitter. This is in addition to any in-workflow deflicker.

**Status**: Evaluated in E2.1 - see [`reports/TEMPORAL_REGULARIZATION_EVAL_2025-12-05.md`](../../reports/TEMPORAL_REGULARIZATION_EVAL_2025-12-05.md).

### Configuration

| Flag | Description | Default |
|------|-------------|---------|
| `temporalRegularizationEnabled` | Enable post-processing step | false |
| `temporalRegularizationStrength` | Smoothing intensity (0-1) | 0.3 |
| `temporalRegularizationWindowFrames` | Frames to blend (2-7) | 3 |

### Per-Profile Defaults

| Profile | Enabled | Strength | Window | Rationale |
|---------|---------|----------|--------|-----------|
| Safe Defaults | ❌ No | 0.3 | 3 | Conservative, no post-processing |
| Fast | ❌ No | 0.3 | 3 | Prioritize speed |
| Standard | ❌ No | 0.3 | 3 | Baseline quality |
| Production QA | ❌ No | 0.3 | 3 | Preserve raw metrics for QA |
| **Cinematic** | ✅ Yes | 0.35 | 3 | Quality-focused, benefits from smoothing |

### Usage

Temporal regularization can be controlled:

1. **Via Pipeline CLI**:
   ```powershell
   npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --temporal-regularization on
   ```

2. **Via npm script** (direct):
   ```powershell
   npm run temporal:regularize -- --input video.mp4 --output smooth.mp4 --strength 0.3
   ```

3. **Via Feature Flags** (for Cinematic profile, auto-enabled)

4. **Via A/B Comparison Script** (for evaluation):
   ```powershell
   npx tsx scripts/benchmarks/compare-temporal-regularization.ts --verbose
   ```

### Requirements

- **ffmpeg** must be installed and available in PATH
- Adds ~5-10 seconds processing time per video
- Minimal VRAM impact (post-processing, not GPU-intensive)

### Trade-offs

| Benefit | Drawback |
|---------|----------|
| Reduced flicker/jitter | Potential motion blur |
| Smoother transitions | Increased processing time |
| Works with any workflow | Requires ffmpeg installation |

### When to Enable Manually

- Visible flicker/jitter in generated videos
- High-motion content with temporal artifacts
- Final renders where quality is paramount

### When to Keep Disabled

- QA comparisons (preserve raw metrics)
- Speed-critical workflows
- Content where minor flicker is acceptable

See [Recipe 6 in RECIPES.md](./RECIPES.md#recipe-6-temporal-regularization-ab-comparison) for A/B comparison workflow.

## Safe Defaults Mode

For users with **~8 GB GPUs or less**, we provide a "Safe Defaults" configuration that disables all VRAM-intensive features.

### Accessing Safe Defaults

1. Open **Settings** (⚙️ icon)
2. Go to **Features** tab
3. Look for the **VRAM-Safe Configuration** banner
4. If showing "VRAM-Intensive Features Enabled", click **Apply Safe Defaults**

### What Safe Defaults Disables

**VRAM-Intensive Features**:
- Video upscaling
- Character consistency (IP-Adapter)
- Enhanced video post-processing
- Frame interpolation
- Video deflicker

**Analysis Features** (require additional resources):
- Vision LLM feedback
- Auto video analysis
- Keyframe pair analysis
- Bookend QA mode

### What Safe Defaults Keeps Enabled

- Generation queue (prevents VRAM exhaustion)
- Auto-eject LM Studio models (frees VRAM)
- Core generation pipeline

## Feature Flags by Tier

### Essential Tier (Always On)
Core features that cannot be disabled:
- Keyframe prompt pipeline
- Video prompt pipeline
- Subject-first prompts
- Enhanced negative prompts

### Production Tier (Default Settings)
Stable features shown in main settings:
- Video deflicker (adjustable)
- Bible V2 save/sync
- Scene validation mode
- Prompt token guard

### Advanced Tier (Under Toggle)
Higher VRAM features for capable systems:
- Video upscaling
- Character consistency
- IP-Adapter conditioning
- Vision feedback
- Video quality gating

### Experimental Tier (Hidden by Default)
Development/testing features - not for production use.

## VRAM Requirements by Feature

| Feature | Min VRAM | Impact |
|---------|----------|--------|
| Base Generation | 6 GB | — |
| Video Deflicker | +0.5 GB | Medium |
| Vision LLM Feedback | +2 GB | Medium |
| Character Consistency | +2 GB | Medium |
| IP-Adapter | +4 GB | High |
| Video Upscaling | +4 GB | High |
| Frame Interpolation | +4 GB | High |
| Enhance-A-Video | +6 GB | Very High |

## Troubleshooting VRAM Issues

### Symptoms of VRAM Exhaustion
- "CUDA out of memory" errors
- Generation hangs or crashes
- Extremely slow generation
- System becomes unresponsive

### Solutions

1. **Apply Safe Defaults**: Settings → Features → Apply Safe Defaults
2. **Use Fast Profile**: Settings → Video → Stability Profile → Fast
3. **Disable IP-Adapter**: Uncheck "Character Consistency" in Features
4. **Enable Auto-Eject**: Ensure "Auto-Eject LM Studio Models" is checked

### Checking Available VRAM

ComfyUI shows VRAM usage in its status bar. You can also check:

```powershell
# Windows - Check NVIDIA GPU memory
nvidia-smi
```

## Related Documentation

- [Feature Flags](../Architecture/FEATURE_FLAGS.md)
- [Stability Profiles](../Architecture/STABILITY_PROFILES.md)
- [ComfyUI Integration](../Guides/COMFYUI_SETUP.md)
