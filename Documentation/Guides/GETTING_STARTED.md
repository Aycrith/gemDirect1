# Getting Started with gemDirect1

**Last Updated**: December 5, 2025  
**Status**: ✅ Production Ready  
**Audience**: New developers and users

This guide walks you through setting up gemDirect1, running your first video generation, and understanding the key workflows.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [ComfyUI Setup](#comfyui-setup)
4. [LM Studio Setup (Optional)](#lm-studio-setup-optional)
5. [First Generation Flow (Safe Defaults)](#first-generation-flow-safe-defaults)
6. [Second Flow (Production QA Preview)](#second-flow-production-qa-preview)
7. [QA & Benchmarks Flow](#qa--benchmarks-flow)
8. [Manifests Flow](#manifests-flow)
9. [Common Workflows](#common-workflows)
10. [Troubleshooting](#troubleshooting)
11. [Next Steps](#next-steps)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Node.js** | ≥22.19.0 | Runtime (enforced by scripts) |
| **Git** | Any recent | Version control |
| **Git LFS** | Any recent | Large file storage (models, workflows) |
| **ComfyUI** | Latest | Video/image generation backend |
| **ffmpeg** | Any recent | Video processing (benchmarks) |

### Hardware Requirements

| Configuration | VRAM | Suitable Presets |
|---------------|------|------------------|
| **Minimum** | 6 GB | Safe Defaults, Fast |
| **Recommended** | 8-10 GB | Production QA, Standard |
| **Optimal** | 12-16 GB | Cinematic (full temporal processing) |

For detailed VRAM requirements per preset, see [`PRESETS_AND_VRAM.md`](./PRESETS_AND_VRAM.md).

---

## Installation

### 1. Clone the Repository

```powershell
git clone https://github.com/Aycrith/gemDirect1.git
cd gemDirect1
```

### 2. Install Git LFS and Pull Large Files

```powershell
git lfs install
git lfs pull
```

This downloads workflow JSON files and any large assets tracked by Git LFS.

### 3. Install Node.js Dependencies

```powershell
npm install
```

### 4. Configure Environment (Optional)

Create `.env.local` for Gemini API access (optional if using LM Studio):

```powershell
echo "GEMINI_API_KEY=your-api-key-here" > .env.local
```

### 5. Verify Installation

```powershell
# Check Node version
node -v   # Should be ≥22.19.0

# Build to verify TypeScript compiles
npm run build   # Should complete with 0 errors

# Run unit tests
npm test            # Should pass 2400+ tests
```

---

## ComfyUI Setup

gemDirect1 uses ComfyUI as the video generation backend with WAN2 workflows.

### Required Workflows

The following workflow files must be installed in ComfyUI:

| Workflow | File | Purpose |
|----------|------|---------|
| **WAN T2I** | `workflows/image_netayume_lumina_t2i.json` | Keyframe generation |
| **WAN I2V** | `workflows/video_wan2_2_5B_ti2v.json` | Video generation |

### Starting ComfyUI

```powershell
# From ComfyUI installation directory
cd C:\ComfyUI\ComfyUI_windows_portable
.\python_embeded\python.exe -s ComfyUI\main.py --listen 0.0.0.0 --port 8188 --enable-cors-header '*'
```

Or use the VS Code task: **Start ComfyUI Server (Patched - Recommended)**

### Verifying ComfyUI Connection

```powershell
# Check health and workflows
npm run check:health-helper
```

This script validates:
- ComfyUI server is responding on `localhost:8188`
- WAN workflows are installed
- Required node mappings are configured
- System VRAM is available

### Loading Workflow Profiles

1. Open the app at http://localhost:3000
2. Go to **Settings (⚙️)** → **ComfyUI Settings** tab
3. Click **"Import from File"** in Workflow Profiles section
4. Select `localGenSettings.json` from the project root
5. Verify profiles show status: **"✓ Ready"**

---

## LM Studio Setup (Optional)

LM Studio provides local LLM story generation as an alternative to Gemini API.

### Installation

1. Download [LM Studio](https://lmstudio.ai/)
2. Install the **mistralai/mistral-7b-instruct-v0.3** model (Q4_K_M quantization)
3. Start the HTTP server on port 1234

### Configuration

Set environment variables before running the app:

```powershell
$env:VITE_LOCAL_STORY_PROVIDER_URL = 'http://localhost:1234/v1/chat/completions'
$env:VITE_LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
$env:VITE_LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
$env:VITE_LOCAL_LLM_TEMPERATURE = '0.35'
```

### CPU-Only Mode (Recommended)

For optimal VRAM availability, configure LM Studio with **0 GPU layers**:
- Story generation: ~58s (faster than GPU mode!)
- ComfyUI VRAM available: 21.74 GB (vs 16 GB with GPU mode)

---

## First Generation Flow (Safe Defaults)

This workflow is optimized for first-time users and VRAM-constrained systems.

### Step 1: Enable Safe Defaults

1. Open http://localhost:3000
2. Click **Settings (⚙️)**
3. Go to **Features** tab
4. Click **"Apply Safe Defaults"** in the VRAM-Safe Configuration banner

This disables all VRAM-intensive features while keeping the core pipeline functional.

### Step 2: Generate a Story

1. Click **Story Bible** in the sidebar
2. Enter a story prompt, e.g., *"A lone astronaut discovers an ancient alien artifact on Mars"*
3. Click **Generate Story**
4. Wait for story bible generation (30-60 seconds)

### Step 3: Generate Scenes

1. After story generation completes, click **Generate Scenes**
2. Review the generated scene list
3. Each scene includes setting, characters, and narrative context

### Step 4: Generate Keyframes

1. Open the **Timeline Editor** for a scene
2. Click **Generate Keyframes**
3. Wait 5-15 minutes per keyframe (ComfyUI WAN T2I)
4. Keyframes appear as thumbnails in the timeline

### Step 5: View Outputs

- **Keyframes**: Stored in `logs/<timestamp>/` and ComfyUI output folder
- **Settings**: Auto-saved to browser IndexedDB
- **Export**: Use **Export Prompts** button for manual ComfyUI import

---

## Second Flow (Production QA Preview)

This workflow enables QA features for quality-validated generation.

### Step 1: Apply Production QA Mode

1. Open **Settings (⚙️)** → **Features** tab
2. Click **"Apply Production QA"**
3. Verify the following are enabled:
   - ✅ keyframePairAnalysis
   - ✅ bookendQAMode
   - ✅ videoQualityGateEnabled
   - ✅ autoVideoAnalysis

### Step 2: Use Production QA Pipeline Config

The `production-qa-preview.json` pipeline config is automatically applied when Production QA mode is active. This config:
- Sets `workflowProfileId: "wan-fun-inpaint"`
- Enables all QA features with aligned thresholds
- Requires ~10-12 GB VRAM

For details on pipeline configs, see [`PIPELINE_CONFIGS.md`](./PIPELINE_CONFIGS.md).

### Step 3: Generate with QA

1. Open the **Production Video Preview** panel (in Settings or Testing area)
2. Click **Generate Preview Clip**
3. The system runs preflight checks (VRAM, workflow validation)
4. Generation includes automatic QA analysis

### Step 4: Inspect QA Results

- **UI**: QA scores appear in the timeline and preview panels
- **JSON**: Vision QA results in `data/vision-qa-baselines/`
- **Benchmark Reports**: `reports/VIDEO_QUALITY_BENCHMARK_*.md`

---

## QA & Benchmarks Flow

### Running Vision QA Baseline

Vision QA analyzes generated videos using a VLM (qwen3-vl):

```powershell
# Generate test videos with frame similarity analysis
npm run bookend:e2e

# Full regression test against baselines
npm run bookend:regression

# View results
cat test-results/bookend-regression/run-*/results.json
```

### Running Video Quality Benchmarks

The benchmark harness computes temporal coherence, motion consistency, and identity stability:

```powershell
# Run on latest regression
.\scripts\benchmarks\run-video-quality-benchmark.ps1

# Run for specific preset
.\scripts\benchmarks\run-video-quality-benchmark.ps1 -Preset production -Verbose

# Benchmark all four presets
.\scripts\benchmarks\run-video-quality-all-presets.ps1
```

### Output Locations

| Output | Location |
|--------|----------|
| Vision QA Results | `data/vision-qa-baselines/*.json` |
| Benchmark JSON | `data/benchmarks/video-quality-*.json` |
| Benchmark Reports | `reports/VIDEO_QUALITY_BENCHMARK_*.md` |
| Regression Results | `test-results/bookend-regression/run-*/` |

For complete benchmark documentation, see:
- [`VIDEO_QUALITY_BENCHMARK_GUIDE.md`](../../Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md)
- [`scripts/benchmarks/README.md`](../../scripts/benchmarks/README.md)

---

## Manifests Flow

Generation manifests capture all parameters needed for reproducibility.

### Viewing Manifests

After any generation, manifests are stored in-memory and can be persisted:

```typescript
import { getAllManifests } from './services/comfyUIService';
const manifests = getAllManifests();
console.log(manifests);
```

### Persisting Manifests to Disk

Use the CLI tool to write manifests:

```powershell
# Build manifest from latest generation
npx tsx scripts/write-manifest.ts --build --run-dir logs/latest

# View manifest
cat data/manifests/*.json
```

### Manifest Contents

Each manifest includes:
- **Git state**: Commit hash, branch, dirty flag
- **Workflow version**: Profile ID, embedded version
- **Model versions**: UNET, CLIP, VAE filenames
- **Configuration**: Feature flags, stability profile
- **Determinism**: Seed, CFG scale, sampler, steps
- **Timing**: Queue time, processing duration

For complete manifest documentation, see [`VERSIONING_AND_MANIFESTS.md`](./VERSIONING_AND_MANIFESTS.md).

---

## Common Workflows

### Workflow 1: Quick Preview (Fast Profile)

```powershell
# Start app with Safe Defaults
npm run dev
# In UI: Settings → Features → Apply Safe Defaults
# Generate story → scenes → keyframes
```

### Workflow 2: Production Quality with QA

```powershell
# Start app with Production QA
npm run dev
# In UI: Settings → Features → Apply Production QA
# Use Production Video Preview panel
# Run benchmarks after generation
.\scripts\benchmarks\run-video-quality-benchmark.ps1
```

### Workflow 3: Full E2E Pipeline (CLI)

```powershell
# Run complete story → video pipeline
pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration

# Validate results
.\scripts\validate-run-summary.ps1 -RunDir logs/latest
```

For more detailed recipes with step-by-step commands, see [`RECIPES.md`](./RECIPES.md).

---

## Troubleshooting

### "ComfyUI not responding"

```powershell
# Check server status
pwsh -File scripts/check-server-running.ps1 -Port 8188

# Verify with health helper
npm run check:health-helper
```

### "VRAM insufficient"

1. Apply Safe Defaults mode (Settings → Features → Apply Safe Defaults)
2. Close other GPU applications (LM Studio with GPU layers, games, etc.)
3. Use Fast stability profile instead of Standard/Cinematic

### "Workflow mapping validation failed"

1. Import workflow profiles: Settings → ComfyUI Settings → Import from File
2. Select `localGenSettings.json`
3. Verify profiles show "✓ Ready" status

### "Node version too old"

```powershell
# Check version
node -v   # Must be ≥22.19.0

# Install Node 22.19.0+ and update PATH
```

### Test Failures

```powershell
# Run all tests (already includes --run and verbose)
npm test

# Run specific test file
npm test services/comfyUIService.test.ts

# Alternatively, use the wrapper script
pwsh -File scripts/run-tests.ps1
```

---

## Next Steps

### Essential Documentation

| Document | Purpose |
|----------|---------|
| [`PRESETS_AND_VRAM.md`](./PRESETS_AND_VRAM.md) | Stability profiles and VRAM requirements |
| [`PIPELINE_CONFIGS.md`](./PIPELINE_CONFIGS.md) | Pipeline configuration schema and usage |
| [`VERSIONING_AND_MANIFESTS.md`](./VERSIONING_AND_MANIFESTS.md) | Reproducibility via manifests |
| [`QA_SEMANTICS.md`](../QA_SEMANTICS.md) | QA threshold logic |
| [`RECIPES.md`](./RECIPES.md) | Step-by-step workflow recipes |

### Architecture Reference

| Document | Purpose |
|----------|---------|
| [`WORKFLOW_ARCHITECTURE_REFERENCE.md`](../Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md) | ComfyUI node mappings |
| [`PROJECT_STATUS_CONSOLIDATED.md`](../PROJECT_STATUS_CONSOLIDATED.md) | Single source of truth |

### Testing

| Document | Purpose |
|----------|---------|
| [`VIDEO_QUALITY_BENCHMARK_GUIDE.md`](../../Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md) | Benchmark harness usage |
| [`STORY_TO_VIDEO_TEST_CHECKLIST.md`](../../Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md) | E2E testing protocols |

---

*For quick reference, see also [`START_HERE.md`](../../START_HERE.md) (5-minute overview) and [`README.md`](../../README.md) (project hub).*
