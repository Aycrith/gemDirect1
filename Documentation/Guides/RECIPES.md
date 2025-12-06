# Configuration Recipes

**Last Updated**: December 5, 2025  
**Status**: ✅ Active  
**Purpose**: Step-by-step workflow recipes with explicit commands

This document provides concrete recipes for common gemDirect1 workflows. Each recipe includes explicit commands, expected outputs, and troubleshooting tips.

---

## Table of Contents

1. [Recipe 1: Production QA Preview + QA Validation](#recipe-1-production-qa-preview--qa-validation)
2. [Recipe 2: Safe Defaults on 8GB VRAM](#recipe-2-safe-defaults-on-8gb-vram)
3. [Recipe 3: Manifest-Aware Generation](#recipe-3-manifest-aware-generation)
4. [Recipe 4: Full Benchmark Suite](#recipe-4-full-benchmark-suite)
5. [Recipe 5: Quick Iteration with Fast Profile](#recipe-5-quick-iteration-with-fast-profile)
6. [Recipe 6: Multi-Shot Narrative Pipeline (N1)](#recipe-6-multi-shot-narrative-pipeline-n1)
7. [Recipe 7: Replay a Shot from Manifest (C1.2)](#recipe-7-replay-a-shot-from-manifest-c12)
8. [Recipe 8: In-App A/B QA Comparison (F1)](#recipe-8-in-app-ab-qa-comparison-f1)
9. [Recipe 9: Narrative UI (F2)](#recipe-9-narrative-ui-f2)

---

## Recipe 1: Production QA Preview + QA Validation

**Goal**: Generate a production-quality video preview with full QA validation.

**VRAM Required**: ~10-12 GB  
**Time Estimate**: 15-30 minutes

### Prerequisites

- ComfyUI running on `localhost:8188`
- Workflow profiles imported (see [GETTING_STARTED.md](./GETTING_STARTED.md))
- Node.js ≥22.19.0

### Step 1: Start the Application

```powershell
# Verify ComfyUI is running
pwsh -File scripts/check-server-running.ps1 -Port 8188

# Start the dev server
npm run dev
```

### Step 2: Apply Production QA Mode

1. Open http://localhost:3000
2. Click **Settings (⚙️)**
3. Go to **Features** tab
4. Click **"Apply Production QA"**
5. Verify these features are enabled:
   - ✅ keyframePairAnalysis
   - ✅ bookendQAMode
   - ✅ videoQualityGateEnabled
   - ✅ autoVideoAnalysis
   - ✅ videoDeflicker

### Step 3: Generate a Preview Video

1. Open the **Production Video Preview** panel (Usage Dashboard → Production Video Preview)
2. Verify preflight status shows "✓ Ready"
3. Click **Generate Preview Clip**
4. Wait for generation to complete (3-8 minutes depending on VRAM)

### Step 4: Run Vision QA Analysis

```powershell
# Run frame similarity analysis on the generated video
npm run bookend:e2e

# Or run full regression against baselines
npm run bookend:regression
```

### Step 5: Run Video Quality Benchmark

```powershell
# Benchmark the latest regression run
.\scripts\benchmarks\run-video-quality-benchmark.ps1 -Verbose

# Or run for the production preset specifically
.\scripts\benchmarks\run-video-quality-benchmark.ps1 -Preset production -Verbose
```

### Step 6: Inspect Results

**UI Results**:
- Vision QA scores appear in the timeline panel
- Quality gate status shows in the preflight panel

**File Results**:
| Output | Location |
|--------|----------|
| Vision QA Scores | `test-results/bookend-e2e/run-*/results.json` |
| Benchmark Report | `reports/VIDEO_QUALITY_BENCHMARK_<date>.md` |
| Benchmark JSON | `data/benchmarks/video-quality-*.json` |

### Expected Thresholds

From [`QA_SEMANTICS.md`](../QA_SEMANTICS.md):
- **minOverall**: ≥80% (WARN if 80-84, PASS if ≥85)
- **minFocusStability**: ≥85%
- **maxArtifactSeverity**: ≤40%
- **videoQualityThreshold**: ≥70%

### Troubleshooting

**"Preflight failed: VRAM insufficient"**:
- Close LM Studio or set to CPU-only mode
- Apply Safe Defaults temporarily, then switch back

**"Vision QA returned low scores"**:
- Check CFG scale (recommended: 5.0-5.5, NOT 6.0)
- Verify negative prompt includes multi-panel rejection

---

## Recipe 2: Safe Defaults on 8GB VRAM

**Goal**: Run video generation on a VRAM-constrained GPU without OOM errors.

**VRAM Required**: 6-8 GB  
**Time Estimate**: 10-20 minutes per video

### Prerequisites

- ComfyUI running
- 6-8 GB GPU (e.g., RTX 3060, RTX 4060)

### Step 1: Verify VRAM Availability

```powershell
# Check current VRAM via ComfyUI
npm run check:health-helper

# Or via nvidia-smi
nvidia-smi --query-gpu=memory.free --format=csv
```

### Step 2: Configure LM Studio for CPU-Only (Optional)

If using LM Studio, configure it for CPU-only inference:
1. Open LM Studio settings
2. Set GPU layers to **0**
3. This frees ~6GB VRAM for ComfyUI

### Step 3: Apply Safe Defaults Mode

1. Open http://localhost:3000
2. Click **Settings (⚙️)** → **Features** tab
3. Click **"Apply Safe Defaults"**
4. Verify the VRAM-Safe Configuration banner shows "Safe Defaults Applied"

### Step 4: Select Fast Stability Profile

1. Go to **Settings (⚙️)** → **ComfyUI Settings** tab
2. Set **Stability Profile** to **Fast**
3. This disables temporal processing features that consume extra VRAM

### Step 5: Generate Content

1. Create or open a story
2. Generate scenes as normal
3. In Timeline Editor, click **Generate Keyframes**
4. Monitor the console for VRAM warnings

### Step 6: Verify No Downgrade Warnings

Check the console/logs for this message:
```
⚠️ Preset downgraded from cinematic to standard: VRAM insufficient
```

If this appears, your generation was auto-downgraded. With Safe Defaults + Fast profile, this should NOT happen.

### Feature Flags Disabled in Safe Defaults

From [`PRESETS_AND_VRAM.md`](./PRESETS_AND_VRAM.md):
- ❌ Video upscaling
- ❌ Character consistency (IP-Adapter)
- ❌ Enhanced video post-processing
- ❌ Frame interpolation
- ❌ Video deflicker
- ❌ Vision LLM feedback
- ❌ Auto video analysis
- ❌ Keyframe pair analysis

### Troubleshooting

**Still getting OOM errors?**:
1. Close all other GPU applications
2. Reduce resolution in workflow settings
3. Use fewer frames per video

**Generation very slow?**:
- Safe Defaults prioritizes stability over speed
- Fast profile already minimizes processing time
- Consider upgrading GPU for Production QA workflows

---

## Recipe 3: Manifest-Aware Generation

**Goal**: Generate videos with full manifest tracking for reproducibility.

**VRAM Required**: 8-10 GB (Standard profile)  
**Time Estimate**: 20-40 minutes

### Understanding Manifests

Generation manifests capture:
- Git commit hash and branch
- Workflow profile ID and version
- Model filenames (UNET, CLIP, VAE)
- Feature flags snapshot
- Seed and determinism parameters
- Input/output references

See [`VERSIONING_AND_MANIFESTS.md`](./VERSIONING_AND_MANIFESTS.md) for full schema.

### Step 1: Enable Debug Mode for Manifest Logging

In your browser console:
```javascript
window.DEBUG_MANIFESTS = true;
```

This logs the complete JSON manifest after each generation.

### Step 2: Run a Generation

Use either UI or CLI:

**Via UI**:
1. Open the app, generate a story and scenes
2. Generate keyframes/videos as normal
3. Check browser console for manifest JSON

**Via CLI** (recommended for reproducibility):
```powershell
# Run the full E2E pipeline
pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
```

### Step 3: Persist Manifests to Disk

```powershell
# Determine the latest run directory
$runDir = Get-ChildItem -Path logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# Write manifests from that run
npx tsx scripts/write-manifest.ts --build --run-dir $runDir.FullName
```

### Step 4: Inspect the Manifest

```powershell
# List manifest files
Get-ChildItem data/manifests/*.json

# View a specific manifest
Get-Content data/manifests/gm_*.json | ConvertFrom-Json | Format-List
```

### Step 5: Reproduce a Generation

To reproduce from a manifest:

1. **Checkout the same git commit**:
   ```powershell
   git checkout <commitHash from manifest>
   ```

2. **Load the same workflow profile**:
   - Match `workflow.profileId` and `workflow.version`

3. **Set the same seed**:
   ```powershell
   $env:SCENE_SEED = <seed from manifest>
   ```

4. **Apply the same feature flags**:
   - Restore `featureFlags` from manifest in Settings

### Manifest File Locations

| File | Purpose |
|------|---------|
| `data/manifests/*.json` | Persisted manifests (Git LFS) |
| `logs/<ts>/artifact-metadata.json` | Run-specific metadata |
| In-memory (browser) | Session manifests via `getAllManifests()` |

### Troubleshooting

**"Manifest not capturing model versions"**:
- Ensure workflow JSON includes model filenames in nodes
- Check `models` array in manifest output

**"Cannot reproduce exact output"**:
- Float precision varies by GPU architecture
- External API responses (LLM) are not cached
- Ensure same checkpoint files are loaded

---

## Recipe 4: Full Benchmark Suite

**Goal**: Run complete QA benchmarks across all presets and generate consolidated reports.

**VRAM Required**: Varies by preset (8-16 GB)  
**Time Estimate**: 1-2 hours for all presets

### Step 1: Generate Baseline Videos

First, generate regression test videos:

```powershell
# Generate with fixed seed for reproducibility
npm run bookend:e2e -- -Seed 42
```

### Step 2: Run Vision QA Regression

```powershell
# Full regression against baselines
npm run bookend:regression

# With custom thresholds
npm run bookend:regression -- -FailThreshold 65 -WarnThreshold 75
```

### Step 3: Run Video Quality Benchmark (All Presets)

```powershell
# Benchmark all four presets: Production, Cinematic, Character, Fast
.\scripts\benchmarks\run-video-quality-all-presets.ps1
```

### Step 4: Collect Output Reports

After running all benchmarks:

| Report | Location |
|--------|----------|
| Vision QA Results | `test-results/bookend-regression/run-*/results.json` |
| Single Preset Report | `reports/VIDEO_QUALITY_BENCHMARK_<date>.md` |
| All Presets Report | `reports/VIDEO_QUALITY_BENCHMARK_ALL_PRESETS_<date>.md` |
| Raw Metrics (JSON) | `data/benchmarks/video-quality-*.json` |
| Raw Metrics (CSV) | `data/benchmarks/video-quality-*.csv` |

### Step 5: Interpret Results

**Temporal Coherence Metrics**:
- Brightness Variance: Lower = better
- Color Consistency: ≥95% is good
- Flicker Frame Count: 0 is ideal

**Motion Consistency Metrics**:
- Transition Smoothness: ≥90% is good
- Jitter Score: Lower = better
- Has Consistent Motion: Should be `true`

**Identity Stability Metrics**:
- Identity Score: ≥80% is good
- Regions Stable: Should be `true`
- Identity Break Count: 0 is ideal

See [`VIDEO_QUALITY_BENCHMARK_GUIDE.md`](../../Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md) for complete metric definitions.

### Troubleshooting

**"ffprobe not found"**:
```powershell
choco install ffmpeg   # Windows via Chocolatey
```

**"No videos found in runDir"**:
- Ensure regression test completed successfully
- Check `test-results/bookend-regression/` for run directories

---

## Recipe 5: Quick Iteration with Fast Profile

**Goal**: Rapidly iterate on prompts and settings with minimal generation time.

**VRAM Required**: 6-8 GB  
**Time Estimate**: 30-60 seconds per keyframe

### Step 1: Configure for Speed

1. Open **Settings (⚙️)** → **Features** tab
2. Click **"Apply Safe Defaults"**
3. Go to **ComfyUI Settings** tab
4. Set **Stability Profile** to **Fast**

### Step 2: Use Short Durations

In pipeline config or UI settings:
- Set `durationSeconds: 1.5` (or shorter)
- Reduce frame count if configurable

### Step 3: Use the CLI for Fastest Iteration

```powershell
# Fast iteration mode shrinks poll intervals
pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
```

### Step 4: Review Generated Content Quickly

```powershell
# Open the latest run directory
$runDir = Get-ChildItem -Path logs -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
explorer $runDir.FullName

# View run summary
Get-Content "$($runDir.FullName)/run-summary.txt"
```

### Fast Profile Characteristics

From [`PRESETS_AND_VRAM.md`](./PRESETS_AND_VRAM.md):
- **VRAM**: ~6 GB minimum, 8 GB recommended
- **Temporal Processing**: Disabled
- **Deflicker**: Disabled
- **Generation Time**: ~30s/shot

### When to Upgrade to Standard/Cinematic

Switch to higher profiles when:
- Testing temporal coherence (requires deflicker)
- Preparing for production (requires quality gates)
- Final renders (requires full temporal suite)

---

## Summary: Which Recipe to Use?

| Scenario | Recipe | Profile |
|----------|--------|---------|
| First-time setup | Recipe 2 | Safe Defaults + Fast |
| Production workflow | Recipe 1 | Production QA |
| Reproducibility research | Recipe 3 | Any + Manifests |
| QA validation | Recipe 4 | All Presets |
| Prompt iteration | Recipe 5 | Fast |
| Temporal smoothing A/B | Recipe 6 | Any (Production QA recommended) |
| Replay from manifest | Recipe 7 | Same as original |

---

## Recipe 6: Temporal Regularization A/B Comparison

**Goal**: Compare video quality with and without temporal regularization (E2 prototype).

**VRAM Required**: 8-12 GB (depends on base workflow)  
**Time Estimate**: 30-60 minutes (two pipeline runs)  
**Requires**: ffmpeg installed and in PATH

### What is Temporal Regularization?

Temporal regularization is an **optional ffmpeg-based post-processing step** that applies frame blending (tmix filter) to reduce frame-to-frame flicker and jitter. This is in addition to any in-workflow deflicker processing.

**Trade-offs**:
- ✅ Reduces visible flicker/jitter artifacts
- ⚠️ May introduce motion blur at higher strengths
- ⚠️ Adds ~5-10s processing time per video

**Evaluation Report**: See [`reports/TEMPORAL_REGULARIZATION_EVAL_2025-12-05.md`](../../reports/TEMPORAL_REGULARIZATION_EVAL_2025-12-05.md) for detailed findings.

### Step 1: Automated A/B Comparison (Recommended)

Use the dedicated comparison script for a complete evaluation:

```powershell
# Run full A/B comparison with default sample
npx tsx scripts/benchmarks/compare-temporal-regularization.ts --verbose

# Or specify a different sample
npx tsx scripts/benchmarks/compare-temporal-regularization.ts --sample sample-002-character --verbose

# Dry run to see what commands would execute
npx tsx scripts/benchmarks/compare-temporal-regularization.ts --dry-run
```

This script:
1. Runs the pipeline with temporal regularization OFF (baseline)
2. Runs the pipeline with temporal regularization ON
3. Executes benchmarks on both outputs
4. Generates comparison JSON: `data/benchmarks/temporal-regularization-comparison-<timestamp>.json`
5. Generates evaluation report: `reports/TEMPORAL_REGULARIZATION_EVAL_<timestamp>.md`

### Step 2: Manual Comparison (Alternative)

For manual control, run each step separately:

```powershell
# Check ffmpeg installation
ffmpeg -version

# If not installed, get it from https://ffmpeg.org/download.html
# Or via winget: winget install ffmpeg
```

#### Run Pipeline WITHOUT Temporal Regularization (Baseline)

```powershell
# Run production QA pipeline with temporal regularization OFF
npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --temporal-regularization off --verbose

# Note the run directory output (e.g., test-results/bookend-regression/run-20251205-120000)
$baselineDir = "test-results/bookend-regression/run-<timestamp>"
```

#### Run Pipeline WITH Temporal Regularization

```powershell
# Run production QA pipeline with temporal regularization ON
npx tsx scripts/run-pipeline.ts --pipeline production-qa-golden --temporal-regularization on --verbose

# Note the run directory output
$smoothedDir = "test-results/bookend-regression/run-<timestamp>"
```

### Step 3: Compare Vision QA Results

```powershell
# Run Vision QA on baseline
pwsh -File scripts/run-bookend-vision-qa.ps1 -Sample sample-001-geometric -Runs 3

# Compare the vision-qa-latest.json results
# Look for changes in:
# - Flicker/jitter detection
# - Overall temporal coherence
# - Motion quality scores
```

### Step 4: Compare Benchmark Results

```powershell
# Compare benchmark JSON outputs
$baselineBenchmark = Get-Content "data/benchmarks/video-quality-baseline-*.json" | ConvertFrom-Json
$smoothedBenchmark = Get-Content "data/benchmarks/video-quality-smoothed-*.json" | ConvertFrom-Json

# Key metrics to compare:
# - temporalConsistency
# - flickerScore (lower is better)
# - motionQuality
```

### Step 6: Visual Comparison

1. Open both videos side-by-side
2. Look for:
   - Reduced frame jitter in smoothed version
   - Potential motion blur at edges
   - Overall perceived quality difference

### Adjusting Regularization Settings

For direct use of the temporal regularizer:

```powershell
# Light smoothing (subtle, preserves sharpness)
npm run temporal:regularize -- --input video.mp4 --strength 0.2 --window-frames 3

# Moderate smoothing (default)
npm run temporal:regularize -- --input video.mp4 --strength 0.3 --window-frames 3

# Strong smoothing (for heavily flickering content)
npm run temporal:regularize -- --input video.mp4 --strength 0.5 --window-frames 5

# Preview command without running
npm run temporal:regularize -- --input video.mp4 --dry-run --verbose
```

### Interpreting Results

| Scenario | Recommendation |
|----------|----------------|
| Visible flicker reduced, no blur | ✅ Enable for production |
| Minimal change | ⚠️ May not be needed |
| Noticeable motion blur | ⚠️ Reduce strength/window |
| Artifacts or quality loss | ❌ Disable, investigate |

### Pipeline Integration

The temporal regularization step is automatically included in the production-qa-golden pipeline. Control it via:

- `--temporal-regularization on` - Force enable
- `--temporal-regularization off` - Force disable (baseline)
- `--temporal-regularization auto` - Use feature flag defaults (currently off for Production QA)

To enable by default for Cinematic profile, the flag `temporalRegularizationEnabled` is automatically set to `true` in the Cinematic stability profile.

### Camera-Path-Aware Metrics (E3)

When evaluating temporal regularization, you can now include **camera path metrics** in the A/B comparison. These metrics measure how well the observed video motion aligns with the planned camera path:

- **pathAdherenceMeanError**: Average deviation from expected camera position
- **pathDirectionConsistency**: Alignment between observed and expected motion vectors

To include these metrics:

```powershell
# Run benchmark with manifest context
npx tsx scripts/benchmarks/video-quality-benchmark.ts --run-dir <runDir> --manifest-dir data/manifests --verbose
```

If temporal regularization improves `pathDirectionConsistency`, it suggests the smoothing helps the video better follow the intended camera motion. See [VIDEO_QUALITY_BENCHMARK_GUIDE.md](../../Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md) for detailed documentation.

---

## Recipe 6: Multi-Shot Narrative Pipeline (N1)

**Goal**: Generate a multi-shot narrative video from a structured script.

**VRAM Required**: Varies by shot (6-16 GB depending on pipeline configs)  
**Time Estimate**: 5-10 minutes per shot + concatenation

### Prerequisites

- ComfyUI running on `localhost:8188`
- ffmpeg installed and in PATH
- LM Studio or Gemini API configured (for Vision QA)

### Step 1: Review the Demo Script

```powershell
# List available narrative scripts
npm run narrative:list

# View the demo script
cat config/narrative/demo-three-shot.json
```

The demo script uses three shots with different quality tiers:
1. **shot-001**: Fast Preview (no temporal processing)
2. **shot-002**: Production QA (balanced quality)
3. **shot-003**: Cinematic (full temporal coherence)

### Step 2: Dry Run to Preview Steps

```powershell
# Preview the pipeline structure without execution
npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --dry-run
```

This shows all steps that would be executed:
- Per-shot: generate, temporal, vision-qa, benchmark, manifest
- Final: concat-shots, generate-summary

### Step 3: Run the Narrative Pipeline

```powershell
# Run with verbose output
npm run narrative:demo

# Or with full verbose logging
npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --verbose
```

### Step 4: Inspect Results

After the pipeline completes:

| Output | Location |
|--------|----------|
| Final narrative video | `output/narratives/demo-three-shot/demo-three-shot_final.mp4` |
| Per-shot videos | `test-results/bookend-regression/run-*/sample-001-geometric/*.mp4` |
| Summary JSON | `data/narratives/demo-three-shot/narrative-run-*.json` |
| Summary Markdown | `reports/NARRATIVE_RUN_demo-three-shot_*.md` |

### Step 5: Review Summary Report

```powershell
# Open the latest Markdown report
ls reports/NARRATIVE_RUN_*.md | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
```

The report includes:
- **Narrative QA Summary (N2)**: Overall verdict + per-shot verdicts
- Shot summary table (pipeline, temporal, quality, QA status)
- Camera path metrics (E3 adherence, direction consistency)
- Artifact locations per shot

### Step 6: Check QA Summary (N2)

The narrative pipeline provides an aggregated QA health check:

1. **Overall Verdict**: Quick answer to "Is this output probably OK?"
   - `✅ PASS` — All shots passed QA with comfortable margins
   - `⚠️ WARN` — Some shots have marginal metrics (review recommended)
   - `❌ FAIL` — One or more shots have hard failures (rework needed)

2. **Per-Shot Verdicts**: Each shot is individually assessed based on:
   - Vision QA (overall score, artifact severity)
   - Benchmark metrics (flicker, jitter, identity, quality)
   - Camera path adherence (soft signal)

3. **CLI Output**: The CLI prints a concise QA summary at the end:
   ```
   ──────────────────────────────────────────────────────────────────────
   Narrative QA Summary (N2):
   ──────────────────────────────────────────────────────────────────────
     Overall Verdict: ⚠️ WARN
     Reason: 1/3 shots have warnings

     Per-Shot Verdicts:
       ✅ shot-001: PASS - OK
       ⚠️ shot-002: WARN - Vision overall: 82 (marginal)
       ✅ shot-003: PASS - OK
   ```

See [QA_SEMANTICS.md](../QA_SEMANTICS.md) and [NARRATIVE_PIPELINE.md](./NARRATIVE_PIPELINE.md#narrative-qa-summary-n2) for threshold details.

### Creating a Custom Script

Create `config/narrative/my-narrative.json`:

```json
{
  "id": "my-narrative",
  "title": "My Custom Narrative",
  "shots": [
    {
      "id": "shot-001",
      "name": "Opening Shot",
      "pipelineConfigId": "production-qa-preview",
      "sampleId": "sample-001-geometric",
      "temporalRegularization": "auto"
    },
    {
      "id": "shot-002",
      "name": "Closing Shot",
      "pipelineConfigId": "cinematic-preview",
      "sampleId": "sample-001-geometric",
      "temporalRegularization": "on"
    }
  ]
}
```

Run it:
```powershell
npx tsx scripts/run-narrative.ts --script config/narrative/my-narrative.json
```

### Troubleshooting

**"Pipeline config not found"**:
- Check that `pipelineConfigId` matches a file in `config/pipelines/`
- Valid IDs: `fast-preview`, `production-qa-preview`, `cinematic-preview`

**"ffmpeg not found"**:
- Install ffmpeg: `winget install FFmpeg` or download from https://ffmpeg.org
- Verify: `ffmpeg -version`

**Only one video in final output**:
- Check console for step failures
- Inspect per-shot videos in `test-results/bookend-regression/`
- Check summary report for shot status

---

## Recipe 7: Replay a Shot from Manifest (C1.2)

**Goal**: Regenerate a video from an existing generation manifest, useful for reproducibility, debugging, and targeted iteration.

**VRAM Required**: Same as original generation  
**Time Estimate**: Same as original generation

### Understanding Replay

The manifest replay system:
- Loads a previously saved generation manifest
- Reconstructs the same settings (workflow, flags, seed, prompts)
- Re-runs the generation with those settings
- Outputs to a new location (preserves original)

**Not guaranteed to be pixel-identical** due to:
- Different GPU/driver/CUDA versions
- Model file updates
- Float precision differences across runs

### Step 1: Find a Manifest to Replay

After running a pipeline or narrative, manifests are stored in:

```powershell
# List all manifests
Get-ChildItem data/manifests/*.json

# Filter by scene
Get-ChildItem data/manifests/*.json | Where-Object { $_.Name -match 'scene-001' }

# Filter by type (video, keyframe)
Get-ChildItem data/manifests/*.json | Where-Object { $_.Name -match 'manifest_video' }
```

Example manifest filename:
```
manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json
```

### Step 2: Inspect the Manifest (Dry-Run)

Before replaying, inspect what the replay will do:

```powershell
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json --dry-run
```

Output shows:
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
```

### Step 3: Execute the Replay

```powershell
# Replay with default output location (adjacent to original)
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json

# Replay with custom output directory
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json --output-dir ./replay-output

# Verbose mode for debugging
npm run replay:from-manifest -- --manifest data/manifests/manifest_video_scene-001_shot-001_2025-12-05T12-30-00.json --verbose
```

### Step 4: Compare Original vs Replay

After replay completes, compare the outputs:

```powershell
# Open both directories
explorer /output/scene-001/
explorer ./replay-output/

# Run benchmark comparison
npm run benchmark:video-quality -- --input1 /output/scene-001/shot-001.mp4 --input2 ./replay-output/replay_*.mp4
```

### Step 5: Run Vision QA on Replayed Video (Optional)

```powershell
# Analyze the replayed video
npm run bookend:vision-last -- -VideoPath ./replay-output/replay_*.mp4
```

### Use Cases for Replay

| Scenario | How to Use |
|----------|------------|
| **Reproduce a bug** | Replay with `--verbose`, compare console output |
| **Test workflow changes** | Modify workflow, replay same manifest, compare |
| **Seed verification** | Replay same manifest, verify seed reproducibility |
| **A/B testing** | Replay with modified flags, compare outputs |
| **Batch regeneration** | Script replay of multiple manifests |

### Troubleshooting

**"Workflow profile not found"**:
- The workflow from the manifest may have been removed
- Re-sync workflows in Settings before replaying
- Alternatively, provide workflow profiles via options

**"Generation failed: ComfyUI not responding"**:
```powershell
# Check ComfyUI status
pwsh -File scripts/check-server-running.ps1 -Port 8188

# Start ComfyUI if needed (via task)
# VS Code → Terminal → Run Task → Start ComfyUI Server
```

**"Replay output differs significantly"**:
- This is expected due to float precision and GPU differences
- For exact reproducibility, use same hardware and driver version
- Consider seeding CUDA RNG if available in workflow

**"Feature flag warning: unknown flags"**:
- Manifest may be from a newer/older version of the app
- Unknown flags are ignored; known flags are applied
- Check the warnings in dry-run output

### Programmatic Replay

For scripting or integration:

```typescript
import { loadReplayPlan, executeReplay } from './services/manifestReplayService';

// Load plan
const plan = await loadReplayPlan('./data/manifests/manifest.json', {
    workflowProfiles: mySettings.workflowProfiles,
});

// Dry-run first
await executeReplay(plan, { dryRun: true });

// Execute
const result = await executeReplay(plan, { dryRun: false });
console.log(`Replayed to: ${result.outputVideoPath}`);
```

See [`VERSIONING_AND_MANIFESTS.md`](./VERSIONING_AND_MANIFESTS.md#replaying-from-a-manifest-c12) for API details.

### Replay from the UI (R1)

Starting with R1, you can also trigger replays directly from the React UI:

**From the A/B Dashboard:**
1. Run an A/B comparison (see [Recipe 8](#recipe-8-in-app-ab-qa-comparison-f1))
2. In the results panel for Target A or B, click **🔄 Replay**
3. Wait for replay to complete (same duration as original generation)
4. Click **👁 View** to open the Replay Viewer modal
5. Compare original and replayed videos side-by-side

**From the Narrative Dashboard:**
1. Run a narrative pipeline (see [Recipe 9](#recipe-9-narrative-ui-f2))
2. In the per-shot QA results, expand a shot row
3. Click **🔄 Replay** for that specific shot
4. Wait for replay to complete
5. Click **👁 View** to open the Replay Viewer modal
6. Compare original and replayed videos

**Replay Viewer Features:**
- Side-by-side video display (original left, replayed right)
- Synchronized playback controls
- Manifest path display with copy button
- Works for both single-shot and narrative workflows

**UI Replay Service:**
For programmatic use from React components:

```typescript
import { replayFromManifestForUi } from './services/replayUiService';

const result = await replayFromManifestForUi({
    manifestPath: '/path/to/manifest.json',
    outputDirOverride: '/optional/custom/output',
});

if (result.success) {
    console.log(`Original: ${result.originalVideoPath}`);
    console.log(`Replayed: ${result.replayedVideoPath}`);
} else {
    console.error(`Failed: ${result.errorMessage}`);
}
```

---

## Recipe 8: In-App A/B QA Comparison (F1)

**Goal**: Compare two pipeline configurations side-by-side in the UI to evaluate quality differences.

**VRAM Required**: 10-16 GB (depends on presets)  
**Time Estimate**: 10-30 minutes

### Overview

The A/B QA Dashboard allows you to:
- Select two presets/pipelines (e.g., Production QA vs Cinematic)
- Run both on the same golden sample
- See side-by-side QA/benchmark metrics
- Compare Vision QA verdicts, flicker, jitter, and identity scores

### Step 1: Open the A/B Dashboard

1. Open the app at http://localhost:3000
2. Click the **Usage Dashboard** (📊 icon in header)
3. Scroll to find **A/B QA Comparison** panel
4. Click to expand

### Step 2: Select Comparison Targets

**Target A** (e.g., your current production preset):
- Select "Production QA" from the dropdown

**Target B** (e.g., what you want to compare):
- Select "Cinematic" or "Production QA + Temporal ON"

**Golden Sample**:
- Choose the sample to use for comparison (default: `sample-001-geometric`)

### Step 3: Run the Comparison

1. Verify A and B are different presets
2. Click **Run A/B Comparison**
3. Wait for both runs to complete (progress shown)

### Step 4: Interpret Results

The results panel shows:

| Column | Meaning |
|--------|---------|
| **Vision QA** | PASS/WARN/FAIL verdict based on coherence thresholds |
| **Vision Overall** | Overall quality score (0-100, higher is better) |
| **Flicker Frames** | Number of anomalous brightness frames (lower is better) |
| **Jitter Score** | Motion stability metric (lower is better) |
| **Identity Score** | Subject consistency (0-100, higher is better) |
| **Better** | ✓ indicates which target performed better |

### Step 5: Use Results for Decision-Making

Common comparison scenarios:

| Scenario | Target A | Target B | Look For |
|----------|----------|----------|----------|
| Temporal ON vs OFF | Prod QA + Temporal ON | Prod QA + Temporal OFF | Lower flicker/jitter with ON |
| Fast vs Production | Fast | Production QA | Better quality with Production |
| Production vs Cinematic | Production QA | Cinematic | Highest quality for final output |

### Available Presets

| Preset ID | Label | Key Features |
|-----------|-------|--------------|
| `fast` | Fast (Low VRAM) | No temporal processing, fastest |
| `production-qa` | Production QA | Balanced with QA gates |
| `production-qa-temporal-on` | Prod + Temporal | Forced temporal smoothing |
| `production-qa-temporal-off` | Prod - Temporal | Temporal disabled |
| `cinematic` | Cinematic | Full temporal stack |

### Troubleshooting

**"Same preset selected for A and B"**:
- Select different presets to enable comparison
- The button is disabled when A = B

**Comparison taking too long**:
- Each run generates a full video
- Cinematic preset takes longer than Fast
- Consider using Fast vs Production for quick comparisons

**No metrics shown**:
- Ensure ComfyUI is running and accessible
- Check that benchmark scripts are available
- Review console for error messages

### Replay and Viewer (R1)

After a comparison completes, you can replay either target:

1. In the results panel, each target (A/B) has replay controls
2. Click **🔄 Replay** to regenerate that configuration
3. Wait for replay to complete (status shows "Replaying...")
4. Once complete, a **✅ Replayed** badge appears
5. Click **👁 View** to open the Replay Viewer modal

The Replay Viewer shows:
- Original video (left/top)
- Replayed video (right/bottom)
- Synchronized playback controls
- Manifest path with copy button

This is useful for:
- Verifying reproducibility
- Debugging quality differences
- A/B testing workflow modifications

### F1/F2 Polish Features (UX Improvements)

The A/B Dashboard includes several UX enhancements for better feedback:

#### Per-Target Loading States

During a comparison run:
- Each target (A/B) shows its individual status (Pending/Running/Succeeded/Failed)
- Animated spinner appears for the currently running target
- Error messages display inline if a target fails

#### Deep Links (Quick Links)

Each result panel includes clickable links:
- **📹 Video** - Copy path to generated video file
- **📋 Manifest** - Copy path to generation manifest
- **📊 Benchmark** - Copy path to benchmark JSON
- **👁 Vision QA** - Copy path to Vision QA results
- **📁 Folder** - Copy path to output directory

Click any link to copy the path to your clipboard.

#### Staleness Warning

If results are older than 24 hours, a warning appears:
```
⚠️ Results from 2 days ago - consider re-running
```

This helps remind you to regenerate if workflow or model changes have occurred since the last run.

### Multi-Scenario A/B from the UI

For more rigorous A/B testing with statistical confidence, use the **Multi-Scenario A/B** feature:

1. In the A/B QA Comparison panel, click **🔬 Run Multi-Scenario A/B**
2. A modal appears with CLI commands you can copy and run in a terminal

**Available Modes**:

| Mode | Command | Scope |
|------|---------|-------|
| Quick | `npx ts-node scripts/run-ab-experiments.ts --quick` | 3 seeds × 2 scenarios |
| Full | `npx ts-node scripts/run-ab-experiments.ts --full` | 5 seeds × all scenarios |
| Dry Run | `npx ts-node scripts/run-ab-experiments.ts --dry-run` | Preview what would run |

**Output**:
- Reports saved to `reports/ab-experiments-<timestamp>.md` and `.json`
- Includes win/loss ratios across all runs
- Statistical comparison of metrics between variants

**When to Use**:
- Validating quality improvements across diverse inputs
- Preparing evidence for production deployment decisions
- Regression testing after workflow or model changes

---

## Recipe 9: Narrative UI (F2)

**Goal**: Run multi-shot narrative pipelines and view QA summaries directly from the UI.

**VRAM Required**: 8-16 GB (depends on shot presets)  
**Time Estimate**: 5-20 minutes per narrative

### Overview

The Narrative Dashboard allows you to:
- Browse available narrative scripts
- Start narrative runs without CLI
- Monitor per-shot progress
- View aggregated QA summaries

### Step 1: Open the Narrative Dashboard

1. Open the app at http://localhost:3000
2. Click the **Usage Dashboard** (📊 icon in header)
3. Scroll to find **Narrative Pipeline** panel
4. Click to expand

### Step 2: Browse Available Scripts

The script list shows:
- Script title and description
- Number of shots
- Tags (e.g., demo, three-shot)

Click a script to select it.

### Step 3: Start a Narrative Run

1. Select a narrative script (e.g., "Three-Shot Demo")
2. Click **Run Narrative: [script name]**
3. Wait for progress updates

### Step 4: Monitor Progress

During the run:
- Progress bar shows percentage complete
- Current shot being processed
- Count of completed/failed shots

### Step 5: View QA Summary

After completion, the results show:

**Overall Verdict**: PASS/WARN/FAIL for the entire narrative

**Per-Shot Breakdown**:
- Click each shot row to expand details
- See individual Vision QA scores
- View flicker, jitter, identity metrics
- Check temporal regularization status

### Narrative Script Format

Scripts are defined in `config/narrative/*.json`:

```json
{
  "id": "my-narrative",
  "title": "My Custom Narrative",
  "shots": [
    { "id": "shot-001", "pipelineConfigId": "fast-preview" },
    { "id": "shot-002", "pipelineConfigId": "production-qa-preview" },
    { "id": "shot-003", "pipelineConfigId": "cinematic-preview" }
  ]
}
```

### Adding New Narrative Scripts

1. Create a new JSON file in `config/narrative/`
2. Follow the `NarrativeScript` schema (see `types/narrativeScript.ts`)
3. Refresh the Narrative Dashboard to see it

### Troubleshooting

**"No scripts found"**:
- Check that `config/narrative/` contains `.json` files
- Verify script format matches the schema
- Click "Refresh" to reload the list

**Run stuck at 0%**:
- Check ComfyUI is running
- Verify network connectivity
- Review browser console for errors

**Per-shot failures**:
- Some shots may fail due to VRAM limits
- Consider using lower-VRAM presets for problematic shots
- Check individual shot configs in the script

### Per-Shot Replay (R1)

After a narrative run completes, you can replay individual shots:

1. In the **Per-Shot QA Results** section, expand a shot row
2. View the shot's QA metrics and verdict
3. Click **🔄 Replay** to regenerate that specific shot
4. Wait for replay to complete
5. Once complete, a **🔄** badge appears next to the shot
6. Click **👁 View** to open the Replay Viewer modal

The Replay Viewer shows:
- Original shot video
- Replayed shot video
- Synchronized playback
- Manifest path

This is useful for:
- Re-testing specific shots that failed QA
- Debugging inconsistent results
- Iterating on problem shots without re-running the full narrative

### F1/F2 Polish Features (UX Improvements)

The Narrative Dashboard includes several UX enhancements for better feedback:

#### Per-Shot Progress Tracking

During a narrative run, the **Shot Progress** panel shows:
- Each shot's current status: ○ Queued / ⏳ Running / ✅ Succeeded / ❌ Failed / ⏭ Skipped
- Animated spinner for the currently processing shot
- Progress percentage for long-running shots
- Error messages inline for failed shots

This gives visibility into exactly which shot is being processed without having to watch the console.

#### Deep Links (Quick Links)

In the **Per-Shot QA Results** section, expand any shot to see quick links:
- **📹 Video** - Copy path to shot video file
- **📋 Manifest** - Copy path to shot manifest
- **📊 Benchmark** - Copy path to shot benchmark JSON
- **👁 Vision QA** - Copy path to shot Vision QA results
- **📁 Folder** - Copy path to shot output directory

Click any link to copy the path to your clipboard.

#### Staleness Warning

If results are older than 24 hours, a warning appears in the summary header:
```
⚠️ Results from 2 days ago - consider re-running
```

This helps remind you to regenerate if workflow or model changes have occurred since the last run.

### CLI Alternative

For command-line usage, see [Recipe 6](#recipe-6-multi-shot-narrative-pipeline-n1):

```powershell
npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --verbose
```

---

## Cross-References

| Topic | Document |
|-------|----------|
| Preset details | [`PRESETS_AND_VRAM.md`](./PRESETS_AND_VRAM.md) |
| QA thresholds | [`QA_SEMANTICS.md`](../QA_SEMANTICS.md) |
| Pipeline config schema | [`PIPELINE_CONFIGS.md`](./PIPELINE_CONFIGS.md) |
| Manifest schema | [`VERSIONING_AND_MANIFESTS.md`](./VERSIONING_AND_MANIFESTS.md) |
| Benchmark metrics | [`VIDEO_QUALITY_BENCHMARK_GUIDE.md`](../../Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md) |
| Narrative pipeline | [`NARRATIVE_PIPELINE.md`](./NARRATIVE_PIPELINE.md) |

---

*For onboarding, see [`GETTING_STARTED.md`](./GETTING_STARTED.md). For project overview, see [`README.md`](../../README.md).*

