<div align="center>
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# gemDirect1 - AI Cinematic Story Generator

[![Status](https://img.shields.io/badge/status-production--ready-brightgreen)](Documentation/CURRENT_STATUS.md)
[![Tests](https://img.shields.io/badge/tests-88%25-yellowgreen)](Testing/)
[![WAN2](https://img.shields.io/badge/WAN2-working-brightgreen)](logs/20251119-205415/)

## 🎬 What is gemDirect1?

**gemDirect1** is an AI-powered cinematic story generator that transforms text prompts into complete video production timelines. The system combines:

- **Gemini AI / Local LLM** (LM Studio) for story, scene, and shot generation
- **ComfyUI + WAN2 workflows** for keyframe image and video rendering
- **Strong QA pipelines** with Vision QA, temporal coherence benchmarks, and quality gates
- **Configurable presets** (Safe Defaults, Production QA, Cinematic) for different VRAM/quality tradeoffs
- **Reproducible pipelines** via pipeline configs and generation manifests

**Primary Goals**:
- 🎥 Cinematic quality output with temporal stability
- 📊 Automated QA and regression testing
- 🔄 Reproducible generation with versioned manifests

---

## 📊 Current Status (Updated 2025-12-05)

| Metric | Value | Status |
|--------|-------|--------|
| **Keyframe Quality** | CFG 5.5 + Enhanced Prompts v4 | ✅ **PRODUCTION-READY** (100% success) |
| **Batch Generation** | Polling fallback deployed | ✅ **100% RELIABLE** (5/5 scenes) |
| **React Integration** | Keyframes validated | ✅ **WORKING** (videos pending) |
| **WAN2 Video Generation** | 3/3 scenes (CLI) | ✅ **WORKING** |
| **E2E Tests** | 105/153 (100% runnable) | ✅ **PASSING** |
| **Unit Tests** | 158/158 (100%) | ✅ **PASSING** |
| **LLM Token Reduction** | 80-93% | ✅ **OPTIMIZED** |
| **React Mount Time** | 1236ms | ✅ **Good** (20.9% improvement) |
| **Build Time** | 2.13s | ✅ Excellent |
| **TypeScript Errors** | 0 | ✅ Perfect |

**Validation Evidence**:
- **CLI Video Generation** (`logs/20251119-205415/`): 3 MP4s (0.33-8.17 MB) ✅
- **React Batch Keyframes** (2025-11-23): 5/5 scenes (70-73s each, 1.2-1.6 MB PNGs) ✅
- **Polling Fallback**: Dual-path completion detection (WebSocket + REST API) ✅

📖 **Full Status**: See [`Documentation/PROJECT_STATUS_CONSOLIDATED.md`](Documentation/PROJECT_STATUS_CONSOLIDATED.md) for complete project status (single source of truth).

---

## 📚 Key Concepts

Before diving in, familiarize yourself with these core concepts (detailed guides linked):

| Concept | Description | Guide |
|---------|-------------|-------|
| **Presets & VRAM** | Stability profiles (Fast/Standard/Cinematic) and feature flag presets (Safe Defaults, Production QA) control VRAM usage and quality | [`PRESETS_AND_VRAM.md`](Documentation/Guides/PRESETS_AND_VRAM.md) |
| **Pipeline Configs** | JSON files that define reproducible generation pipelines (workflow, flags, QA expectations) | [`PIPELINE_CONFIGS.md`](Documentation/Guides/PIPELINE_CONFIGS.md) |
| **QA & Thresholds** | Unified threshold logic (PASS/WARN/FAIL) for Vision QA and video quality gates | [`QA_SEMANTICS.md`](Documentation/QA_SEMANTICS.md) |
| **Manifests & Versioning** | Generation manifests capture codebase, workflow, model versions, and seeds for reproducibility | [`VERSIONING_AND_MANIFESTS.md`](Documentation/Guides/VERSIONING_AND_MANIFESTS.md) |
| **Video Benchmarks** | Temporal coherence, motion consistency, and identity stability metrics | [`VIDEO_QUALITY_BENCHMARK_GUIDE.md`](Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md) |
| **Multi-Agent Strategy** | How to use VS Code Agent HQ, Background Agents, and Custom Agents for parallel development | [`MULTI_AGENT_STRATEGY.md`](Documentation/MULTI_AGENT_STRATEGY.md) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js ≥22.19.0** (enforced by scripts)
- **Git LFS** installed (`git lfs install`)
- **ComfyUI** running on `localhost:8188` with WAN2 workflows
- **LM Studio** (optional) for local LLM story generation

### Installation

```powershell
# 1. Clone and setup
git clone https://github.com/Aycrith/gemDirect1.git
cd gemDirect1
git lfs pull              # Pull large files (models, workflows)
npm install               # Install dependencies

# 2. Configure environment
# Create .env.local with your Gemini API key (optional if using LM Studio)
echo "GEMINI_API_KEY=your-key-here" > .env.local

# 3. Verify ComfyUI is ready
npm run check:health-helper   # Validates ComfyUI + workflows

# 4. Start the app
npm run dev                   # Starts on http://localhost:3000
```

### First Generation (Safe Defaults Mode)

1. Open http://localhost:3000
2. Go to **Settings (⚙️)** → **Features** tab → Click **"Apply Safe Defaults"**
3. Enter a story prompt (e.g., "A robot explores an abandoned city")
4. Click **Generate Story** → then **Generate Scenes**
5. In the Timeline Editor, click **Generate Keyframes**
6. Output videos appear in `logs/<timestamp>/` and ComfyUI output folder

### Validation Commands

```powershell
npm run build                 # Should complete with 0 TypeScript errors
npm test                      # Unit tests (2400+ passing)
npx playwright test           # E2E tests (100+ passing)
npm run check:health-helper   # Verify ComfyUI integration
```

📘 **New Here?** Read [`Documentation/Guides/GETTING_STARTED.md`](Documentation/Guides/GETTING_STARTED.md) for the complete onboarding guide, or [`START_HERE.md`](START_HERE.md) for a 5-minute overview.

---

## 🧪 Testing

### Test Status (Updated 2025-11-22)
- **✅ 100% pass rate** among runnable tests (146 passing, 0 failing)
- **48 skipped tests** (properly categorized - manual, real-service, feature-gaps)
- **New**: 49 LLM optimization tests added (41 unit + 8 E2E)
- **Coverage**: Context pruning, Story Bible validation, progressive feedback, error recovery
- **Latest improvements**: See [`Development_History/Sessions/LLM_OPTIMIZATION_IMPLEMENTATION_20251122.md`](Development_History/Sessions/LLM_OPTIMIZATION_IMPLEMENTATION_20251122.md)

### Quick Test Commands

```powershell
# Standard test run (1-2 min, no real services)
npm test                    # Unit tests (158/158 passing)
npx playwright test         # E2E tests (105 passing, 48 skipped)

# With real LLM/ComfyUI integration (~10-30 min)
$env:RUN_REAL_WORKFLOWS = '1'
npx playwright test         # Includes 16 real-service tests

# Performance testing (production build)
$env:PLAYWRIGHT_PROD_BUILD = 'true'
npx playwright test tests/e2e/prod-perf.spec.ts
```

### Test Modes & Environment Flags

The test suite uses environment flags to prevent overwhelming infrastructure. See [`Testing/TEST_ENVIRONMENT_FLAGS.md`](Testing/TEST_ENVIRONMENT_FLAGS.md) for complete reference.

| Flag | Purpose | Duration | LLM Calls |
|------|---------|----------|-----------|
| None (default) | Fast CI tests | 1-2 min | Zero |
| `RUN_REAL_WORKFLOWS=1` | Real LLM/ComfyUI tests | 10-30 min | 10-20 |
| `RUN_MANUAL_E2E=1` | Manual validation | 5-20 min | Varies |
| All flags | Complete validation | 30-60+ min | Many |

**⚠️ Important**: Real service tests are **opt-in** to prevent overwhelming your LLM server. See documentation for details.

### Test Documentation

- **Environment Flags**: [`Testing/TEST_ENVIRONMENT_FLAGS.md`](Testing/TEST_ENVIRONMENT_FLAGS.md)
- **Troubleshooting**: [`Testing/TEST_TROUBLESHOOTING_GUIDE.md`](Testing/TEST_TROUBLESHOOTING_GUIDE.md)
- **Test Checklist**: [`Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md`](Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md)

## ⚠️ Current Limitations (v1.0.0 - Production Release)

### Video Generation (Coming Week 1)
**Status**: Service layer complete, UI wiring in progress  
**Impact**: "Generate Video" button in Timeline Editor is not yet functional  
**Workaround**: 
1. Generate story and keyframes as normal
2. Click "Export Prompts" button
3. Import prompts into ComfyUI manually (http://localhost:8188)
4. Use wan-i2v workflow for video generation
**Timeline**: UI wiring scheduled for Week 1 post-deployment (2-4 hours dev work)

### Processing Times
Users should expect the following generation times:
- **Story generation**: 30-60 seconds (LM Studio / Gemini)
- **Scene generation**: 10-20 seconds per batch
- **Keyframe generation**: 5-15 minutes per image (ComfyUI WAN T2I, 30 diffusion steps)
- **Video generation**: 3-8 minutes per scene (when UI complete)

**Note**: Long processing times are expected for high-quality AI generation. UI shows progress indicators. **Do not refresh browser during generation** - state is preserved in IndexedDB.

### Setup Notes
- **Workflow Settings**: Import `localGenSettings.json` to configure workflows. Settings now auto-save on import! CFG optimization testing in progress.
- **CFG Recommendation**: DO NOT use CFG 6.0 (causes 40% black-image failures). Testing CFG 5.0-5.5 range next. CFG 4.0 has 80% split-screen rate. See [`CFG_6_0_SPLIT_SCREEN_TEST_RESULTS_20251123.md`](CFG_6_0_SPLIT_SCREEN_TEST_RESULTS_20251123.md) for details.
- **ComfyUI**: Must be running on localhost:8188 before generating keyframes/videos
- **LM Studio**: Optional local LLM, falls back to Gemini if not available

📋 **Known Issues**: See [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) for complete list and workarounds

## 🏗️ Architecture

### Production Workflows
- **WAN T2I**: `workflows/image_netayume_lumina_t2i.json` (keyframe generation)
- **WAN I2V**: `workflows/video_wan2_2_5B_ti2v.json` (video generation)
- **SVD**: Experimental only (not integrated with UI)

## 🔗 Bookend QA Infrastructure (2025-12)

**Complete regression testing infrastructure for FLF2V (First-Last-Frame to Video) workflows**:

### ★ Production Video Preview (UI)
The easiest way to test the production pipeline is the **Production Video Preview** panel in the app:
1. Open **Usage Dashboard** (bar chart icon)
2. Expand **★ Production Video Preview** panel
3. Click **Generate Preview Clip** → generates a ~3s video with production defaults (`wan-fun-inpaint` + Standard)

Requires: ComfyUI running with ~8GB VRAM. See `AGENT_HANDOFF_CURRENT.md` for details.

### Golden Samples & Baselines
- **Location**: `data/bookend-golden-samples/` (3 samples: geometric, character, environment)
- **Baselines**: `data/bookend-golden-samples/baselines.json` (reference quality metrics)
- **Frame Similarity**: 0-100 scale with 90+ excellent, 70-79 degradation threshold

### Quick Start (Bookend QA)

```powershell
# 1. Generate test videos with frame similarity analysis
npm run bookend:e2e              # Generate videos + compute similarity scores
npm run bookend:e2e -- -Seed 42  # With fixed seed for reproducibility

# 2. Full regression test (compares against baselines)
npm run bookend:regression       # All samples pass/warn/fail verdict
npm run bookend:regression -- -FailThreshold 65  # Custom thresholds

# 3. Optimize WAN 2.2 5B parameters
npm run bookend:sweep            # Full config matrix
npm run bookend:sweep -- -QuickMode  # Fast resolution tuning only

# 4. Direct frame similarity analysis
npm run bookend:similarity -- --video <mp4> --start <png> --end <png>
```

### Key Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `scripts/bookend-frame-similarity.ts` | CLI tool for pixel-level RGB matching | JSON with startSimilarity, endSimilarity |
| `scripts/test-bookend-e2e.ps1` | Generate & analyze FLF2V videos | test-results/bookend-e2e/run-*/results.json |
| `scripts/test-bookend-regression.ps1` | Full regression harness with baselines | test-results/bookend-regression/run-*/results.json |
| `scripts/wan-parameter-sweep.ps1` | Optimize resolution/CFG/steps/frames | test-results/wan-tuning/sweep-*.json |

### Configuration

**Bookend QA Mode** (`localGenSettings.json`):
```json
{
  "bookendQAMode": {
    "enabled": false,
    "enforceKeyframePassthrough": false,
    "overrideAISuggestions": false
  }
}
```

When enabled, forces keyframe passthrough and disables AI suggestions for consistency testing.

### Documentation

- **Complete Guide**: [`Testing/E2E/BOOKEND_GOLDEN_README.md`](Testing/E2E/BOOKEND_GOLDEN_README.md)
- **Sample Details**: [`data/bookend-golden-samples/README.md`](data/bookend-golden-samples/README.md)
- **Phase Status**: Phase 0-5 complete (Phase 6 docs finalizing)

---

### Experimental Features
- **Bookend Workflow (Sequential Generation)**: 
  - Generates video from START keyframe + END keyframe
  - Uses sequential WAN I2V generation (2x duration)
  - Splices videos with ffmpeg crossfade
  - Enable via Settings → ComfyUI Settings → Keyframe Mode

---

## Temporary Change Log (please read before coding)

- `scripts/comfyui-status.ts` is now required reading before every generation or test run. It validates the dual WAN profiles (`wan-t2i` for keyframes + `wan-i2v` for videos), confirms the `human_readable_prompt`/`full_timeline_json`/`keyframe_image` mappings use CLIPTextEncode/LoadImage nodes, and records queue/system telemetry (VRAM, latency, warnings) along with the workflow file paths. Point it at your exported `localGenSettings` JSON (or `LOCAL_PROJECT_STATE_PATH`) and keep an eye on the log stored in `test-results/comfyui-status/`.
- We assume the WAN workflow bundles live at `workflows/image_netayume_lumina_t2i.json` and `workflows/video_wan2_2_5B_ti2v.json`; change the helper's `KNOWN_WAN_WORKFLOWS` list if you override the filenames, and keep the `LOCAL_*`/`VITE_LOCAL_*` environment variables in sync between the helper, React UI, and Playwright suites. The helper is the single source of truth for system telemetry and queue policy before you queue any shots.
- This temporary change log doubles as a checklist: before touching code, re-read `README.md`, every `docs/STORY_TO_VIDEO_PIPELINE_PHASE_*.md`, `WORKFLOW_ARCHITECTURE_REFERENCE.md`, the QA/testing guides, and `scripts/comfyui-status.ts` so the helper, dual WAN workflows, LM Studio wiring, and QA expectations stay aligned.
- Story outputs now follow an explicit 12-arc hero's journey schema (see `docs/STORY_TO_VIDEO_PIPELINE_PHASE_1.md` for the JSON shape) so the LLM returns structured `heroArcs` plus scene-to-arc mappings; future agents must keep that schema in mind when editing prompts or timeline tooling.
- `services/localStoryService.ts` now prompts LM Studio for JSON hero arcs and story metadata (per `docs/STORY_TO_VIDEO_PIPELINE_PHASE_1.md`), falling back to deterministic data when the LLM is unavailable, and the new `services/storyToVideoPipeline.ts` simulates the story→scene→timeline path so Quick Generate runs can bootstrap Director Mode states without another service call.
- ⚠️ The helper scripts/components that many passages mention (`scripts/comfyui-status.ts`, `scripts/generate-scene-videos-wan2.ps1`, `scripts/update-scene-video-metadata.ps1`, `contexts/PipelineContext.tsx`, `components/VisualBiblePanel.tsx`, `components/E2EQACard.tsx`, `tests/e2e/svd-capture.spec.ts`, `tests/e2e/comfyHelper.ts`, `services/__tests__/localStoryService.test.ts`, `services/__tests__/comfyUIService.test.ts`) are not present in this branch yet; restore them before trusting the expanded QA narrative.
- The canonical WAN video workflow is `video_wan2_2_5B_ti2v.json`—all docs, helpers, and UI prompts should reference this 5B path and the lower-VRAM, 3–8 minute runtime targets for RTX 3090. **SVD is NOT integrated**: The `text-to-video.json` workflow and `queue-real-workflow.ps1` script are experimental research code with no UI or pipeline integration.

## Docs-First Discipline (2025-11)
- Read the meta-docs before changing code: WORKFLOW_ARCHITECTURE_REFERENCE.md, COMFYUI_WORKFLOW_INDEX.md, COMFYUI_INTEGRATION*.md, TESTING_* and VALIDATION_* guides.
- Keep docs and tests in sync with code changes; record decisions under "Decisions & Rationale (2025-11)".

### Validation Checklist (WAN-First)
- WAN e2e runs and progress are tracked via `scripts/run-comfyui-e2e.ps1` (pipeline + generation) and `scripts/validation-metrics.ts` (metrics).
- Run `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration` followed by `npm run validation:metrics`. The latest metrics live in `test-results/validation-metrics/latest.json` and include `totalScenes`, `videosDetected`, `videosMissing`, and `uploadsFailed` for the WAN video path.
- Treat validation as milestone-based: Milestone 1 = at least one WAN video (`videosDetected >= 1`), Milestone 2 = all scenes yield videos (`videosDetected === totalScenes`, `videosMissing === 0`), Milestone 3 = robust runs (`uploadsFailed === 0`), as detailed in `VALIDATION_PROGRESS.md`.
- **WAN workflows only**: The application uses `wan-t2i` and `wan-i2v` exclusively. SVD workflow (`text-to-video.json`) is not integrated and exists only as experimental research code.

## Local WAN Usage
- Keyframes: WAN T2I (`workflows/image_netayume_lumina_t2i.json`)
- Video: WAN 2.2 5B ti2v (`workflows/video_wan2_2_5B_ti2v.json`)
- Mapping rules: wan-t2i requires CLIP only; wan-i2v requires CLIP + `LoadImage` mapped to `keyframe_image`.
- Guardrails: single-frame instruction + multi-panel negative guidance are applied to all prompts.
- Scripts: Use `scripts/generate-scene-videos-wan2.ps1` (HttpClient-based upload + prompt injection) followed by `scripts/update-scene-video-metadata.ps1` so each MP4 file and metadata entry is captured with forward slashes and audit-friendly warnings.
- RTX 3090 guidance:
  - Target 24 FPS; keep scene shots around 16–24 frames for fast iterations.
  - Preferred resolutions: 1024×576 or 1280×720 (balance VRAM/use).
  - Steps: 12–20 (titrate up when quality demands it); watch VRAM/latency badges printed by `comfyui-status`.
  - The helper logs VRAM before/after values so the UI and artifact snapshots share the same telemetry; avoid stacking multiple high-step shots back-to-back if free VRAM drops below ~2 GB.

### Helper: ComfyUI Status
Run `npm run check:health-helper` to write a summary in `test-results/comfyui-status/` (set `LOCAL_COMFY_URL` if needed).

## FastVideo (Optional Alternative Provider)

**NEW**: FastVideo provides an alternate local video generation path using `FastWan2.2-TI2V-5B` without ComfyUI workflows.

### When to Use FastVideo
- **Simpler setup**: No workflow JSON configuration needed
- **Direct Python control**: Faster iteration for parameter tuning
- **Research/experimentation**: Test different FastVideo model variants
- **ComfyUI alternatives**: Backup when ComfyUI workflows need updates

### Requirements
- **Windows 10/11** with PowerShell 5.1+
- **NVIDIA GPU**: 16GB+ VRAM (RTX 4090/3090 recommended)
- **Python 3.12** with Conda
- **CUDA 12.x** drivers installed
- **Disk Space**: ~10GB for FastWan2.2-TI2V-5B model

### Setup (One-Time)

```powershell
# 1. Create Conda environment
conda create -n fastvideo python=3.12 -y
conda activate fastvideo

# 2. Install PyTorch with CUDA support
pip install torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cu121

# 3. Install FastVideo and dependencies
pip install fastvideo fastapi uvicorn[standard] huggingface_hub pillow

# 4. Download model (requires HuggingFace token if gated)
huggingface-cli login  # If required
$env:FASTVIDEO_HOME = "$env:USERPROFILE\fastvideo"
mkdir -Force $env:FASTVIDEO_HOME\models

huggingface-cli download FastVideo/FastWan2.2-TI2V-5B-Diffusers `
  --local-dir $env:FASTVIDEO_HOME\models\FastWan2.2-TI2V-5B-Diffusers `
  --cache-dir $env:FASTVIDEO_HOME\hf-cache `
  --resume-download

# 5. Validate setup (dry-run)
pwsh scripts\run-fastvideo-server.ps1 -DryRun
```

### Usage

```powershell
# 1. Start FastVideo server (separate terminal)
pwsh scripts\run-fastvideo-server.ps1
# Server starts on http://127.0.0.1:8055
# Health check: http://127.0.0.1:8055/health
# API docs: http://127.0.0.1:8055/docs

# 2. In React UI: Settings → Video Provider tab
# - Select "FastVideo (Experimental)" from provider dropdown
# - Configure: FPS (16), Frames (121), Resolution (1280x544)
# - Test connection (validates server + model)

# 3. Generate videos normally via UI
# - System auto-routes to FastVideo when selected
# - Progress tracked in browser console + sessionStorage
```

### Testing

```powershell
# Smoke test (8-frame clip, validates end-to-end)
pwsh scripts\test-fastvideo-smoke.ps1

# Integration tests (requires server running)
npm test -- tests/integration/fastvideo.test.ts

# Or skip if server not available
SKIP_FASTVIDEO_TESTS=true npm test
```

### Performance Guidelines (RTX 3090)
- **Frames**: Start with 8-16 for testing, up to 121 for production
- **FPS**: 12-16 (balance quality/speed)
- **Resolution**: 720x480 (fast), 1280x544 (default), 1280x720 (high quality)
- **Generation time**: ~30-60s for 8 frames, 3-8 minutes for 121 frames
- **VRAM usage**: Peaks at 14-16GB during generation

### Troubleshooting

**Server won't start:**
- Check conda environment: `conda env list` (must see 'fastvideo')
- Verify CUDA: `nvidia-smi` (should show GPU)
- Model cache: Run with `-DryRun` flag to validate paths

**CUDA OOM during generation:**
- Reduce `numFrames` (e.g., 121 → 64)
- Lower resolution (e.g., 1280x544 → 720x480)
- Close other GPU processes (including LM Studio with GPU layers)
- Use `attentionBackend: VIDEO_SPARSE_ATTN` (default)

**Generation timeout:**
- Normal for first run (model loading takes 1-2 minutes)
- Subsequent runs much faster (model cached in VRAM)
- Check server logs for Python errors

**Network errors ("Cannot connect"):**
- Verify server running: `curl http://127.0.0.1:8055/health`
- Check firewall/antivirus not blocking port 8055
- Try different port: `pwsh scripts\run-fastvideo-server.ps1 -Port 8056`

---

## 🛡️ Resource Safety & VRAM Management

### Generation Queue System

All video generation is routed through a **serial GenerationQueue** to prevent VRAM exhaustion from concurrent GPU operations. This ensures:

- **No OOM errors** from multiple simultaneous generations
- **Automatic VRAM gating** - waits for sufficient memory before starting
- **Circuit breaker** - stops queue after 3 consecutive failures
- **Priority support** - user-initiated tasks process before background

### Preflight Checks

Before queueing any video generation, the system runs resource preflight checks:

1. **VRAM availability** - Queries GPU free memory via ComfyUI `/system_stats`
2. **Node dependencies** - Verifies required workflow nodes are installed
3. **Workflow validation** - Confirms mappings are correct for the profile

### Stability Presets & VRAM Requirements

| Preset | VRAM Required | Features | Generation Time |
|--------|---------------|----------|-----------------|
| **Fast** | 8GB + 2GB headroom | No temporal processing | ~30s/shot |
| **Standard** | 12GB + 2GB headroom | Deflicker enabled | ~45s/shot |
| **Cinematic** | 16GB + 2GB headroom | Deflicker + IP-Adapter + Prompt Scheduling | ~60s/shot |

### Automatic Fallback

When VRAM is insufficient for the requested preset, the system automatically downgrades:

```
Cinematic → Standard → Fast
```

The UI displays a warning when downgrade occurs:
> ⚠️ Preset downgraded from cinematic to standard: VRAM insufficient (12000MB free)

### Queue State & Monitoring

```typescript
// Get queue state programmatically
import { getGenerationQueue } from './services/generationQueue';

const queue = getGenerationQueue();
const state = queue.getState();
// {
//   size: 2,              // Tasks waiting
//   isRunning: true,      // Currently executing
//   currentTaskId: '...',
//   isCircuitOpen: false, // True if circuit breaker tripped
//   consecutiveFailures: 0
// }

// Subscribe to state changes
const unsubscribe = queue.subscribe((state) => {
  console.log('Queue updated:', state);
});
```

### Feature Flags

The queue system is controlled by feature flags:

```json
{
  "featureFlags": {
    "useGenerationQueue": true,        // Route through queue (default: true)
    "autoEjectLMStudioModels": true    // Unload LLM before generation
  }
}
```

### Troubleshooting

**"Circuit breaker tripped":**
- Wait 30 seconds for automatic reset, or
- Call `queue.resetCircuitBreaker()` manually

**"VRAM insufficient" with plenty free:**
- Check that ComfyUI reports accurate VRAM via `/system_stats`
- Headroom (2GB) is reserved for system overhead

**Jobs stuck in queue:**
- Check if current task is hung: `queue.getState().currentTaskId`
- Force cancel: `queue.cancelAll()`

### Provider Comparison

| Feature | ComfyUI (Default) | FastVideo (Experimental) |
|---------|-------------------|-------------------------|
| **Setup complexity** | Medium (workflows) | Low (pip install) |
| **Flexibility** | High (node graphs) | Medium (Python API) |
| **Model support** | Multiple (WAN, SVD, etc.) | FastWan2.2 only |
| **UI integration** | Full (keyframe + video) | Video only |
| **Debugging** | Workflow JSON | Python logs |
| **VRAM efficiency** | Good (optimized nodes) | Good (VIDEO_SPARSE_ATTN) |
| **Community support** | Extensive | Growing |

**Recommendation**: Use **ComfyUI** for production. Use **FastVideo** for experimentation or when ComfyUI workflows need updates.

## Run Locally

**Prerequisites:**  Node.js >= 22.19.0 (the helper scripts now enforce this at runtime and will exit early if `node -v` reports an older version).

### Local LLM (LM Studio) requirements

- Install [LM Studio](https://lmstudio.ai/) with the **mistralai/mistral-7b-instruct-v0.3** GGUF (Q4_K_M) model and launch the HTTP server (`http://192.168.50.192:1234/v1/chat/completions` is the validated address).
- **CRITICAL Chat Template Constraint**: Mistral 7B Instruct v0.3's Jinja template **only supports `user` and `assistant` roles**. Messages with `{"role": "system"}` will fail with "Only user and assistant roles are supported!" The service layer (`localStoryService.ts`) automatically combines system instructions with user content into a single user message.
- **CRITICAL**: Configure LM Studio with **0/32 GPU layers (CPU-only mode)** to free VRAM for ComfyUI video generation. This prevents VAE decode stalls and provides optimal performance:
  - Story generation: ~58s (faster than GPU mode!)
  - ComfyUI VRAM available: 21.74 GB (vs 16 GB with GPU mode)
  - No VAE decode bottlenecks
- See `LM_STUDIO_CPU_VALIDATION.md` for performance benchmarks and validation results.
- Export the following variables (or place them in your PowerShell profile) before running `scripts/run-comfyui-e2e.ps1`:
  ```powershell
  $env:LOCAL_STORY_PROVIDER_URL = 'http://192.168.50.192:1234/v1/chat/completions'
  $env:LOCAL_LLM_MODEL = 'mistralai/mistral-7b-instruct-v0.3'
  $env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'
  $env:LOCAL_LLM_SEED = '42'
  $env:LOCAL_LLM_TEMPERATURE = '0.35'
  $env:LOCAL_LLM_TIMEOUT_MS = '120000'   # ~90s generation time
  ```
 - To ensure the React UI talks directly to LM Studio you also need to surface those settings via Vite. Set the `VITE_LOCAL_*` variants before running `npm run dev` or `npx playwright test`:
   ```bash
   export VITE_LOCAL_STORY_PROVIDER_URL='http://192.168.50.192:1234/v1/chat/completions'
   export VITE_LOCAL_LLM_MODEL='mistralai/mistral-7b-instruct-v0.3'
   export VITE_LOCAL_LLM_REQUEST_FORMAT='openai-chat'
   export VITE_LOCAL_LLM_TEMPERATURE=0.35
   export VITE_LOCAL_LLM_TIMEOUT_MS=120000
   export VITE_LOCAL_LLM_SEED=42
   ```
   These values are read by the new `localStoryService` so the story bible form uses LM Studio instead of fallback templates.
- The helper now performs a `/v1/models` probe before ComfyUI spins up so we never waste a run on a dead LLM instance. Override the probe target with `LOCAL_LLM_HEALTHCHECK_URL` or skip the check (not recommended) with `LOCAL_LLM_SKIP_HEALTHCHECK=1`.
- When the probe hits a non-responsive LM Studio instance it raises an error immediately, so you can gracefully fall back to another provider or set [`LOCAL_LLM_SKIP_HEALTHCHECK=1`](https://lmstudio.ai/docs/api#health-checks) if the endpoint intentionally blocks `/models` entirely; the override is handy when the default `/v1/models` path is behind a proxy or you want to hit a different host than the story generator’s prompts.
- Verify the endpoint before a headless run: `Invoke-WebRequest http://192.168.50.192:1234/v1/models`.
- If LM Studio is offline, fall back to Ollama by swapping `LOCAL_STORY_PROVIDER_URL`/`LOCAL_LLM_MODEL` (keep `LOCAL_LLM_REQUEST_FORMAT=openai-chat`). Note the fallback in `run-summary.txt`.
- Mirror the `LOCAL_*` env vars with their `VITE_LOCAL_*` cousins so React/Playwright/`localStoryService` share the same LM Studio endpoint, timeout, seed, and request format. The helper also expects `LOCAL_PROJECT_STATE_PATH` to point at the exported JSON that holds `localGenSettings`, which must contain dual WAN workflows and the required CLIP/LoadImage mappings for `human_readable_prompt`, `full_timeline_json`, and `keyframe_image`. Structured metadata (seed, durationMs, warning) follows the LM Studio guidance at [https://lmstudio.ai/docs/api#chat-completions](https://lmstudio.ai/docs/api#chat-completions).

### ComfyUI Health Helper

Before you queue text-to-video generation, run the helper to confirm the WAN workflows, node mappings, and Comfy queue health:

```bash
npx ts-node scripts/comfyui-status.ts --project ./path/to/your-exported-project.json
```

The helper now also accepts `--summary-dir`/`--log-path` so each run writes a JSON summary plus an optional verbose log under `test-results/comfyui-status/`. It checks both `wan-t2i` and `wan-i2v` profiles, ensures the canonical workflow JSON files exist, enforces CLIPTextEncode + LoadImage mappings for `human_readable_prompt`, `full_timeline_json`, and `keyframe_image`, and records whether Visual Bible keyframes are placeholders or real base64 payloads. Queue/system telemetry (devices, VRAM, running/pending counts) is captured per run, and the helper prints the summary path for QA to link to Visual Bible prompts and Playwright traces.

Wrap helper runs with `node scripts/comfyui-status.ts --project <exported state> --summary-dir test-results/comfyui-status --log-path test-results/comfyui-status/comfyui-status.log` before queuing work or triggering Playwright suites so the logged CLIP/LoadImage mappings and telemetry are available for every downstream test and artifact.

> Self-check: Did I verify dual workflows map through `comfyui-status.ts`, and did the LM Studio metadata (seed/duration/warning) get logged alongside every plan expansion action?

The script reads the `localGenSettings` block (exported via the app's **Save Project** action or stored under `LOCAL_PROJECT_STATE_PATH`), hits `/system_stats` and `/queue` on `LOCAL_COMFY_URL`/`VITE_LOCAL_COMFY_URL` (defaults to `http://127.0.0.1:8188`), logs latency, warns if the queue is busy, and prints the mapped node IDs for `human_readable_prompt`, `full_timeline_json`, and `keyframe_image`. It also reports whether the canonical WAN workflows (`image_netayume_lumina_t2i.json` and `video_wan2_2_5B_ti2v.json`) are available before you push any shots.

## Docs-first guardrail for future agents

Before editing code, scripts, or workflows in this repo, re-read:

- `README.md`
- `WORKFLOW_ARCHITECTURE_REFERENCE.md`
- `COMFYUI_WORKFLOW_INDEX.md`
- All `docs/STORY_TO_VIDEO_PIPELINE_PHASE_*.md`
- The QA + testing guides (`TESTING_*`, `VALIDATION_*`, `QA_VALIDATION_REPORT_*`)
- `DOCUMENTATION_INDEX_20251111.md` and `notes/codex-agent-notes-20251111.md`

Treat these documents as the source of truth for LM Studio configuration, dual WAN workflow expectations (wan-t2i for keyframes, wan-i2v 5B ti2v for videos), queue/telemetry contracts, and helper usage. Update them whenever you change behavior so the next agent can safely pick up the system from documentation alone.

Use this helper interactively and in CI/Playwright runs so you never hit the generation queue with stale or unmapped workflows.

Capture each helper execution under `test-results/comfyui-status/<timestamp>.log` (or the path your automation framework prefers) so QA cards can reference the VRAM warnings, queue position, and node mappings that correspond to any Visual Bible run. The helper mirrors the telemetry fields exposed by ComfyUI's WebSocket example (https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py), so the queue/polling metadata can be stitched into Artifact Snapshot cards without extra parsing.

### Mapping Preflight & Helper Telemetry
- Step 0: run `node scripts/preflight-mappings.ts --project ./exported-project.json --summary-dir test-results/comfyui-status` before you queue work. The helper enforces the WAN mapping contract (CLIPTextEncode.text + human_readable_prompt/full_timeline_json for `wan-t2i`, and the `keyframe_image` → `LoadImage.image` pair that `wan-i2v` needs), auto-infers inline mappings, writes normalized JSON plus a `unit/comfyui-status.json` mirror, and exits `3` when the wan-i2v prerequisites are still missing so that automation aborts before wasting GPU time.
- Follow up with `node scripts/comfyui-status.ts --project ./exported-project.json --summary-dir test-results/comfyui-status --log-path test-results/comfyui-status/comfyui-status.log`. It probes `/system_stats` and `/queue`, records the same `QueueConfig`/`HistoryConfig` knobs the UI shows, and surfaces VRAM before/after/delta, poll limits, History exit reasons, and mapping status for artifact snapshots and QA cards. The generated `test-results/comfyui-status/comfyui-status.json` and the mapping preflight summary feed the new `HelperSummaries` object in `artifact-metadata.json`, so both the Artifact Snapshot UI and Playwright cards can link back to the exact JSON telemetry the helper just recorded.
- Mapping rules recap: `wan-t2i` needs CLIP text conditioning only, `wan-i2v` needs CLIP plus the `keyframe_image` → `LoadImage.image` mapping. Guardrails (`SINGLE_FRAME_PROMPT`, `NEGATIVE_GUIDANCE`) stay attached to every still prompt the services build so the queue always sees a single cinematic moment.
- Helper outputs: every helper run writes both the JSON summary and verbose log into `test-results/comfyui-status/<timestamp>/` (mirrors kept in `HelperSummaries.MappingPreflight` and `HelperSummaries.ComfyUIStatus` inside `artifact-metadata.json` and `public/artifacts/latest-run.json`). Keep telemetry field names (DurationSeconds, PollIntervalSeconds, MaxWaitSeconds, HistoryExitReason, GPU/VRAM stats, queue knobs) synchronized with the validator, UI chips, and Playwright tests so future runs can verify the same traceable data end-to-end.

#### LLM Foundation & Health Checks

**Mistral 7B Checkpoint Verification**

The pipeline requires **mistralai/mistral-7b-instruct-v0.3** (GGUF Q4_K_M quantization) loaded in LM Studio before any story generation runs. Verify the checkpoint and endpoint health with:

```powershell
# 1. Check that LM Studio is responding to model list requests
$response = Invoke-WebRequest -Uri 'http://192.168.50.192:1234/v1/models' -TimeoutSec 5
$models = $response.Content | ConvertFrom-Json
$mistral = $models.data | Where-Object { $_.id -like '*mistral*' }

if ($mistral) {
    Write-Host "✅ Mistral found: $($mistral.id)" -ForegroundColor Green
} else {
    Write-Host "❌ Mistral not loaded. Load via LM Studio UI or CLI." -ForegroundColor Red
    exit 1
}

# 2. Test a chat completion request (validates server readiness)
$testPayload = @{
    model = 'mistralai/mistral-7b-instruct-v0.3'
    messages = @(
        @{ role = 'system'; content = 'You are a cinematic story assistant.' },
        @{ role = 'user'; content = 'Describe a single-sentence story idea.' }
    )
    max_tokens = 100
    temperature = 0.35
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri 'http://192.168.50.192:1234/v1/chat/completions' `
    -Method Post `
    -ContentType 'application/json' `
    -Body $testPayload `
    -TimeoutSec 120 `
    -ErrorAction Stop

$result = $response.Content | ConvertFrom-Json
if ($result.choices -and $result.choices[0].message.content) {
    Write-Host "✅ Chat completion successful: $($result.choices[0].message.content.Substring(0, 80))..." -ForegroundColor Green
} else {
    Write-Host "❌ Chat completion returned empty response." -ForegroundColor Red
    exit 1
}

# 3. Log server metadata (optional)
Write-Host "Server metadata:"
Write-Host "- Model: mistralai/mistral-7b-instruct-v0.3"
Write-Host "- Endpoint: http://192.168.50.192:1234/v1/chat/completions"
Write-Host "- Health check: http://192.168.50.192:1234/v1/models"
Write-Host "- Request format: openai-chat"
Write-Host "- Temperature: 0.35 (deterministic, storytelling-optimized)"
Write-Host "- Timeout: 120000 ms (~90s generation time typical)"
```

**Override Health Check Targets**

If your LM Studio instance is behind a proxy or on a different host:

```powershell
# Override both request and health check endpoints
$env:LOCAL_STORY_PROVIDER_URL = 'http://<custom-host>:<port>/v1/chat/completions'
$env:LOCAL_LLM_HEALTHCHECK_URL = 'http://<custom-host>:<port>/v1/models'

# Or skip health checks entirely (NOT recommended for production)
$env:LOCAL_LLM_SKIP_HEALTHCHECK = '1'
```

**Fallback to Ollama**

If LM Studio becomes unavailable, switch to Ollama while maintaining API compatibility:

```powershell
# Ollama endpoint (assumes `ollama serve` running on localhost:11434)
$env:LOCAL_STORY_PROVIDER_URL = 'http://localhost:11434/v1/chat/completions'
$env:LOCAL_LLM_MODEL = 'mistral'  # or 'neural-chat', 'dolphin-mixtral', etc.
$env:LOCAL_LLM_REQUEST_FORMAT = 'openai-chat'  # Ollama OpenAI compatibility mode
$env:LOCAL_LLM_TEMPERATURE = '0.35'
$env:LOCAL_LLM_TIMEOUT_MS = '120000'

# Verify Ollama health check
$response = Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -TimeoutSec 5
$models = $response.Content | ConvertFrom-Json
Write-Host "Available Ollama models: $($models.models.name -join ', ')"
```

**Quality Validators & Prompt Templates**

After story generation, the pipeline automatically runs three quality checks:

- **Coherence Check** (`scripts/quality-checks/coherence-check.py`): Validates narrative flow via named-entity and pronoun-resolution tracking. Threshold ≥4.0/5.
- **Diversity Check** (`scripts/quality-checks/diversity-check.py`): Measures thematic richness using Shannon entropy. Threshold ≥2.0.
- **Similarity Check** (`scripts/quality-checks/similarity-check.py`): Verifies semantic alignment between prompt intent and generated scenes using BERT. Threshold ≥0.75.

Prompt templates are loaded from `docs/prompts/v1.0/` based on selected genre:
- `story-sci-fi.txt`: Science fiction (futuristic tone, advanced tech, non-human characters)
- `story-drama.txt`: Character-driven drama (emotional authenticity, relationships, vulnerability)
- `story-thriller.txt`: High-stakes thriller (immediate threat, time pressure, forced choices)

See `docs/prompts/PROMPT_LIBRARY.md` for template structure, integration points, and extending with new genres.

### Queue knobs, telemetry enforcement, and artifact snapshots
- The helper resolves every queue knob (`SceneMaxWaitSeconds`, `SceneHistoryPollIntervalSeconds`, `SceneHistoryMaxAttempts`, `ScenePostExecutionTimeoutSeconds`, `SceneRetryBudget`, plus the CLI flags/`SCENE_*` env vars that mirror them) before ComfyUI spins up, surfaces them as `QueueConfig`, per-scene `HistoryConfig`, and `SceneRetryBudget` in `run-summary.txt`, `artifact-metadata.json`, and the React viewers so downstream agents know exactly how aggressively the poller was configured.
- Telemetry enforcement now insists on the same fields every scene attempt emits: `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, `pollLimit` (text and metadata value must match), `HistoryExitReason` (maxWait/attemptLimit/postExecution/success), `ExecutionSuccessDetected`, `ExecutionSuccessAt`, `PostExecutionTimeoutSeconds` (and `postExecTimeoutReached`), GPU `Name`, `VRAMBeforeMB`, `VRAMAfterMB`, `VRAMDeltaMB`, plus any fallback notes (e.g., `/system_stats` failure or `nvidia-smi` fallback). We treat `execution_success` from ComfyUI's `/history` sequence as the success signal for every attempt, so the validator, Vitest harness, and UI look for that event before closing a scene (following the `/history` message structure from [`websocket_api_example.py`][2]). Missing telemetry lines, mismatched `pollLimit`, or absent GPU/VRAM numbers fail validation before the run archives, and the queue policy card/Timeline badges use the same metadata to explain retry budgets, poll pacing, and GPU usage for reviewers.
- Artifact snapshots must now display the queue policy card, telemetry badges (DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, `pollLimit`, `HistoryExitReason`, `postExec` timeout flag, `ExecutionSuccessAt`), poll log counts, GPU info with name and VRAM delta plus fallback warnings, archive links (Vitest logs, zip), and LLM metadata (provider, model, request format, seed, duration, errors). These badges/reference links mirror the logs, show history warnings or fallback notes, and keep the telemetry/poll limit text synchronized with the metadata so the UI and run artifacts tell the same story about failures or successes. Assumed behavior: LM Studio’s `/v1/models` probe (configurable via `LOCAL_LLM_HEALTHCHECK_URL` or skipped with `LOCAL_LLM_SKIP_HEALTHCHECK=1` per [LM Studio health checks][1]) stays available before ComfyUI launches, and we fallback only after logging the warning so downstream agents can retrace the attempt.
- **Documentation-first discipline**: Before editing scripts or UI, read `DOCUMENTATION_INDEX_20251111.md` (especially the “Required Telemetry & Queue Policy Orientation” block), `STORY_TO_VIDEO_PIPELINE_PLAN.md`, `STORY_TO_VIDEO_TEST_CHECKLIST.md`, `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `QUICK_START_E2E_TODAY.md`, `REFERENCE_CARD_QUICK.md`, `WINDOWS_AGENT_TEST_ITERATION_PLAN.md`, and `notes/codex-agent-notes-20251111.md` so the LM Studio health check, queue knobs, telemetry requirements, and artifact expectations are obvious.

Producer done-marker semantics
-----------------------------
To avoid races between ComfyUI's SaveImage node and the consumer poller, the helper relies on a producer-side "done" marker file. Producer sentinels (or in-workflow script nodes) write a temporary file and atomically rename it into place (e.g. `<prefix>.done.tmp` → `<prefix>.done`). This prevents consumers from copying partially-written JSON marker files. The repository includes `scripts/generate-done-markers.ps1` which creates these markers when sequences appear stable or when ComfyUI history reports `execution_success` and lists output filenames. The atomic-write pattern follows common Windows file-replace semantics (write temp → move/replace) to minimize observers seeing partial content. See `scripts/generate-done-markers.ps1` and `workflows/text-to-video.json` (Write Done Marker node) for details.
The consumer (`scripts/queue-real-workflow.ps1`) waits for the canonical `<prefix>.done` file (the `-WaitForDoneMarker` flag is true by default) and records `DoneMarkerWaitSeconds`, `DoneMarkerDetected`, `DoneMarkerPath`, `ForcedCopyTriggered`, and `ForcedCopyDebugPath` inside each `[Scene ...] Telemetry:` line plus `artifact-metadata.json`. When a marker never appears the script falls back to the stability/retry loop, emits a forced-copy warning into `System.FallbackNotes`, drops a `forced-copy-debug-<ts>.txt` dump beside the frames, and copies the images anyway so the rest of the run remains auditable. The telemetry contract in `TELEMETRY_CONTRACT.md` embeds these fields (plus the fallback notes) so validators, Vitest, and the UI can show whether each run completed via a sentinel marker or the forced-copy fallback.
These fields are required in `run-summary.txt` so each `[Scene ...] Telemetry:` line clearly shows whether the run hit the marker in time (`DoneMarkerDetected=true`, `DoneMarkerWaitSeconds=0s`) or used the forced-copy fallback (`ForcedCopyTriggered=true`, `ForcedCopyDebugPath=...`). When forced-copy is not triggered the telemetry line still records `ForcedCopyTriggered=false`, and the fallback notes only list actual warnings. Use `run-summary.txt` or `logs/<ts>/artifact-metadata.json` to trace forced-copy dumps and confirm the sentinel telemetry before archiving the artifacts.
In-workflow node and sentinel-as-service
---------------------------------------

If you prefer the workflow itself to emit the done marker (rather than relying on the external sentinel), you can use the provided helper `comfyui_nodes/write_done_marker.py`.

- To use inside ComfyUI:
  1. Copy `comfyui_nodes/write_done_marker.py` into your ComfyUI installation under `custom_nodes/` and call `write_done_marker(output_dir, prefix, frame_count)` from a Script node, or
  2. Use a Shell/Run node to invoke the helper directly (example shown below).

Example CLI invocation (safe for Script/Shell nodes):

```powershell
# from the host where ComfyUI runs
python C:\path\to\comfyui_nodes\write_done_marker.py --output-dir "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" --prefix gemdirect1_scene-001 --frames 25
```

Need to stage the helper? Run `pwsh scripts/deploy-write-done-marker.ps1` and it will copy `write_done_marker.py` into ComfyUI's `custom_nodes/` folder (creating directories if needed) so you can call the helper from Script/Shell nodes without manual copying.

Sentinel as a Scheduled Task (Windows)
-------------------------------------

You can keep the external sentinel running across logins by registering it as a Scheduled Task instead of manually starting it each session. A helper script is provided at `scripts/install-sentinel-scheduledtask.ps1` (install/uninstall modes). Example:

```powershell
# Install the scheduled task for the current user (no admin required)
pwsh ./scripts/install-sentinel-scheduledtask.ps1 -Action install -ScriptPath 'C:\Dev\gemDirect1\scripts\generate-done-markers.ps1'

# Uninstall
pwsh ./scripts/install-sentinel-scheduledtask.ps1 -Action uninstall
```

Notes:
- The scheduled task registers a per-user logon trigger (no admin rights), which runs the sentinel in the background whenever the user logs in. For a system-level task you can adapt the script to use a service account and require elevation.
- If you need atomic semantics across different filesystems or network shares, prefer using a native replace (e.g., .NET File.Replace) or ensure the tmp and final file live on the same filesystem — os.replace / os.rename / Move-Item semantics only guarantee atomicity on the same mount.

Sentinel as a Windows Service (NSSM)
------------------------------------

`scripts/install-sentinel-service.ps1` prints the NSSM command you need to run as Administrator after downloading NSSM from https://nssm.cc/download. NSSM (the Non-Sucking Service Manager) lets you capture stdout/stderr, define restart policies, and keep the sentinel running even when no user is logged in. Run the printed command (which by default installs a `gemDirect1-Sentinel` service pointing at `generate-done-markers.ps1`), configure the Application/I/O tabs if you want custom logging, and start it with `nssm start gemDirect1-Sentinel` whenever you need a continuously running sentinel.

References: https://learn.microsoft.com/dotnet/api/system.io.file.replace (atomic replace guidance), https://github.com/comfyanonymous/ComfyUI (history API examples)
- **UI metadata handshake**: The Artifact Snapshot and Timeline panels mirror the same data stored in `logs/<ts>/artifact-metadata.json` and `public/artifacts/latest-run.json`, so the queue policy card, telemetry chips, GPU stats, fallback warnings, Vitest logs, and archive references must always agree with what the helper logs and the validator enforces.

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## React Browser Testing

**Test Coverage**: 50 Playwright E2E tests (**36/36 passing = 100% active**, 14 intentional skips)

**Testing Strategy**: Prioritize server-side E2E tests (`run-comfyui-e2e.ps1`) for LLM integration, use browser tests for UI/error handling. 

**Latest Validation**: See [`SYSTEM_VALIDATION_REPORT_20251119.md`](./SYSTEM_VALIDATION_REPORT_20251119.md) for complete verification including:
- ✅ All 36 active browser tests passing (100%)
- ✅ All 3 server-side E2E scenes generated videos (100%)
- ✅ Browser functionality fully verified at http://localhost:3001
- ✅ System status: 🟢 Production Ready

| Phase | Active Tests | Passing | Pass Rate | Status |
|-------|--------------|---------|-----------|--------|
| **Phase 1: App Loading** | 4 | 4 | 100% | ✅ Perfect |
| **Phase 2: Story Generation** | 3 | 3 | 100% | ✅ Perfect |
| **Phase 3: Scene/Timeline** | 2 | 2 | 100% | ✅ Perfect |
| **Phase 4: ComfyUI Integration** | 5 | 5 | 100% | ✅ Perfect |
| **Phase 5: Data Persistence** | 7 | 7 | 100% | ✅ Perfect |
| **Phase 6: Error Handling** | 8 | 8 | 100% | ✅ Perfect |
| **Performance & Pipeline** | 7 | 7 | 100% | ✅ Perfect |
| **TOTAL** | **36** | **36** | **100%** | ✅ **All Active Tests Passing** |

### Running Tests

```bash
# Start dev server (required for tests)
npm run dev

# Run all E2E tests
npx playwright test

# Run specific phase
npx playwright test tests/e2e/app-loading.spec.ts --reporter=list

# Generate HTML report
npx playwright test --reporter=html
npx playwright show-report

# Debug mode
npx playwright test --debug
```

### Test Organization

Tests are organized by application phase:
- **Phase 1** (`app-loading.spec.ts`): Basic infrastructure, IndexedDB, mode switching
- **Phase 2** (`story-generation.spec.ts`): Story bible generation via local LLM
- **Phase 3** (`scene-generation.spec.ts`, `timeline-editing.spec.ts`): Scene navigator, timeline editor
- **Phase 4** (`video-generation.spec.ts`): ComfyUI integration, keyframe generation
- **Phase 5** (`data-persistence.spec.ts`): IndexedDB persistence, project export/import
- **Phase 6** (`error-handling.spec.ts`): Error recovery, validation, resilience

### Test Skips & Limitations (12 skipped tests - intentional)

1. **Phase 3 (6 tests skipped - ASYNC STATE HYDRATION)**: Fixture-based tests fail due to `usePersistentState` timing unpredictability. React component mounting depends on IndexedDB → useState → render chain completing, timing varies 10ms-2000ms. **Solution**: Use server-side E2E tests (`run-comfyui-e2e.ps1`) that generate real data instead of fixtures.

2. **Phase 4 (2 tests skipped - CORS/UI)**: 
   - `wan-full-journey`: Browser fetch to LM Studio blocked by missing CORS headers (`Access-Control-Allow-Origin`)
   - `wan-basic`: UI regression - "Load WAN Workflow" button no longer exists in settings modal

3. **Other (4 tests skipped)**: API rate limit (test design), settings modal (UI regression), SVD workflow (optional, requires `RUN_SVD_E2E=1`), import/load (investigating)

4. **Recommended Testing Approach**: 
   - **Primary**: Server-side E2E tests (`pwsh scripts/run-comfyui-e2e.ps1 -FastIteration`) for complete LM Studio → ComfyUI pipeline validation
   - **Secondary**: Browser Playwright tests for UI, error handling, performance benchmarks
   - See [`TESTING_STRATEGY_UPDATED_20251119.md`](./TESTING_STRATEGY_UPDATED_20251119.md) for complete strategy

2. **Phase 3 (UI Rendering - 6 tests skipped)**: Scene navigator and timeline editor tests require full workflow execution to render components properly. Tests are documented with correct selectors (`[data-testid="scene-row"]`, `[data-testid="shot-row"]`) from actual components but skip execution due to state hydration complexity.

3. **Phase 4 (ComfyUI Settings - 1 test skipped)**: Settings modal verification pending UI structure inspection.

4. **Phase 5 (Import Timeout - 1 test skipped)**: IndexedDB import/export occasionally times out with large payloads.

See `REACT_BROWSER_TESTING_PROGRESS_REPORT.md` for detailed test status and `REACT_BROWSER_TESTING_DEVELOPER_GUIDE.md` for extending tests.

### Testing Strategy

**Real Integration Testing**: Tests use actual local services (Mistral LLM via LM Studio) instead of SDK mocking because:
- The Google Generative AI SDK bypasses Playwright's `page.route()` interception
- Response mocking at the fetch level doesn't work for SDK-wrapped requests
- Real local LLM integration provides more realistic test scenarios

**Environment Variables**: Tests automatically configure:
```powershell
VITE_PLAYWRIGHT_SKIP_WELCOME=true           # Bypass welcome dialog
VITE_LOCAL_STORY_PROVIDER_URL=http://192.168.50.192:1234/v1/chat/completions
VITE_LOCAL_LLM_MODEL=mistralai/mistral-7b-instruct-v0.3
VITE_LOCAL_LLM_REQUEST_FORMAT=openai-chat
VITE_LOCAL_LLM_TEMPERATURE=0.35
```

These are set automatically in `playwright.config.ts` when running tests.

### Local Testing Notes

- Node **22.19.0 or newer** is required. On Linux/macOS install Node 22.19.0 and add `/usr/local/node-v22.19.0/bin` to `PATH`; on Windows install Node 22.19.0 to `C:\Tools\node-v22.19.0-win-x64` and prepend that folder to your user `PATH` so `node -v` reports `v22.19.0`.
- The ComfyUI service tests currently need the `vmThreads` pool to avoid fork/thread timeouts. Run the targeted suite with:

  ```
  node ./node_modules/vitest/vitest.mjs run --pool=vmThreads services/comfyUIService.test.ts
  ```

  This command matches the validated workflow from both Linux and Windows environments.
- Before running the helper, read `STORY_TO_VIDEO_PIPELINE_PLAN.md` and `STORY_TO_VIDEO_TEST_CHECKLIST.md` to understand the story/keyframe → ComfyUI flow and the structured `run-summary.txt` template that the helper emits.

### Automated ComfyUI E2E

- Run `scripts/run-comfyui-e2e.ps1` from PowerShell with `-ExecutionPolicy Bypass` (optionally pass `-MaxSceneRetries <n>` to control the auto-requeue floor). The helper now verifies `node -v` (≥ 22.19.0) before doing any work and drives the entire story ➜ video loop:
1. **Story + keyframes**: `scripts/generate-story-scenes.ts` synthesizes a three-scene story, writes `logs/<ts>/story/story.json`, and copies per-scene keyframes (defaults to `sample_frame_start.png`). When `LOCAL_STORY_PROVIDER_URL` is set, the helper automatically routes the request through your local LLM, records the provider URL/seed/duration/error data, and captures those details (plus any fallback warnings) inside `story.json`, `run-summary.txt`, and `artifact-metadata.json`.
  2. **Scene loop + retries**: `scripts/queue-real-workflow.ps1` patches placeholders inside `workflows/text-to-video.json`, posts to `/prompt`, polls `/history/<promptId>`, and copies `gemdirect1_<sceneId>*` frames into `logs/<ts>/<sceneId>/generated-frames`. Each queue attempt logs a history-poll timeline, collects REST errors, and the runner automatically requeues once when history retrieval fails, no frames were copied, or the frame count falls below the floor defined on the scene payload.
  3. **Validation & failure protocol**: For every attempt the helper writes `[Scene ...][Attempt ...]` lines plus explicit `[Scene ...] HISTORY WARNING/ERROR` and `WARNING: Frame count below floor (...)` entries into `run-summary.txt`. The `validate-run-summary.ps1` script (called automatically) cross-references `artifact-metadata.json` to ensure those lines exist for any scene that degraded.
  4. **Tests**: After the scene loop finishes the helper runs three Vitest suites via `scripts/run-vitests.ps1` (`services/comfyUIService.test.ts`, `services/e2e.test.ts`, and everything under `scripts/__tests__`). The helper now invokes the local Vitest CLI directly (`node ./node_modules/vitest/vitest.mjs …`) to avoid npm shim issues, so logs are reliable (`vitest-comfyui.log`, `vitest-e2e.log`, `vitest-scripts.log`, plus `vitest-results.json`).
- **Queue policy knobs**: pass `-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, or `-SceneHistoryPollIntervalSeconds` (or set `SCENE_MAX_WAIT_SECONDS`, `SCENE_HISTORY_MAX_ATTEMPTS`, `SCENE_HISTORY_POLL_INTERVAL_SECONDS`) to tune history polling budgets without editing scripts. The helper records the resolved policy (and your `-MaxSceneRetries` value) inside `run-summary.txt`, `artifact-metadata.json`, and the React viewers so downstream agents know exactly how aggressively the poller was configured.
- **Queue policy knobs**: pass `-SceneMaxWaitSeconds`, `-SceneHistoryMaxAttempts`, `-SceneHistoryPollIntervalSeconds`, or `-ScenePostExecutionTimeoutSeconds` (or set the matching `SCENE_*` env vars) to tune how long we wait for `/history` messages and how long we continue polling after the `execution_success` flag appears. These knobs flow through every run artifact: `QueueConfig`/`HistoryConfig` in `artifact-metadata.json`, the Artifact Snapshot policy card, and the Timeline editor’s per-scene banner. The validator at `scripts/validate-run-summary.ps1` now asserts that each scene’s telemetry contains `DurationSeconds`, `MaxWaitSeconds`, `PollIntervalSeconds`, `HistoryAttempts`, `HistoryAttemptLimit`, GPU name, and VRAM (before/after) plus the poll-limit text inside `[Scene ...] Telemetry` lines, so missing GPU telemetry or pollLimit values surface as hard failures before archiving a run.
  The history poller mirrors the status ladder shown in ComfyUI’s [`websockets_api_example.py`](https://github.com/comfyanonymous/ComfyUI/blob/master/websockets_api_example.py) so every `[Scene ...] HISTORY WARNING/ERROR` line cites the same reason (`maxWait`, `attemptLimit`, `postExecution`, etc.), and `System.FallbackNotes` captures the `/system_stats` failures that trigger the `nvidia-smi` fallback.
5. **Artifact snapshot + telemetry**: The helper builds `logs/<ts>/artifact-metadata.json` (story metadata, LLM provenance, moods, per-scene prompts, frame counts, GPU telemetry, warnings, history poll attempts, requeue summaries, Vitest logs, archive path) and mirrors it to `public/artifacts/latest-run.json`. The React **Artifact Snapshot** panel now surfaces these details with a warnings-only filter, duration/GPU summaries, and per-scene storyline context so you can audit runs without leaving the app. The Artifact Snapshot and Timeline editor now render the `QueueConfig`/`HistoryConfig` knobs alongside GPU/VRAM deltas, pollLimit badges, exit reasons, fallback notes, and archive references so you can trace every warning without opening raw JSON.
  - Helper summary paths: `artifact-metadata.json` now exposes `HelperSummaries` (mapping preflight + ComfyUI status) so Playwright cards and the Artifact Snapshot UI can link directly to the JSON telemetry the README, QA guides, and Timeline banners point reviewers to.
  6. **Archival**: ComfyUI shuts down after the suites complete and `artifacts/comfyui-e2e-<ts>.zip` is generated. The archive mirrors the entire `logs/<ts>` directory (story folder, scenes, history files, generated frames, vitest logs, and run summary).

  7. **Step 11b/11c (WAN video automation)**: After the helper finishes the queued scenes, `scripts/generate-scene-videos-wan2.ps1` (HttpClient upload, deterministic `LoadImage`/`SaveVideo` wiring, mp4/libx264 defaults, and configurable `-MaxWaitSeconds`/`-PollIntervalSeconds`) uploads each scene keyframe, patches the first `LoadImage`, queues the wan-i2v workflow, and polls for `logs/<ts>/video/<sceneId>/<sceneId>.mp4` until the timeout while writing `[Scene ...] Wan2 ...` telemetry lines to `run-summary.txt`. Follow it with `scripts/update-scene-video-metadata.ps1 -RunDir logs/<ts> -VideoSubDir video` so the artifact metadata contains normalized forward-slash `Video.Path` entries plus optional `DurationSeconds` (via `ffprobe` if installed), `Status`, `UpdatedAt`, and `Error` for every scene so the Artifact Snapshot and UI can surface the MP4s consistently.

- Post-run checklist:
  - Read `logs/<ts>/run-summary.txt`, confirming `## Story`, `[Scene ...][Attempt ...]`, `[Scene ...] HISTORY WARNING/ERROR`, `Requeue requested`, and `## Artifact Index` entries match what you observed on the console (frame counts, durations, Vitest exit codes, zip path, vitest-scripts log).
  - Run the lightweight unit suites with `node ./node_modules/vitest/vitest.mjs run scripts/__tests__` (or the bundled `scripts/run-vitests.ps1`) before launching the heavy helper. These tests cover the story generator helpers and workflow patcher edge cases (missing keyframes, LLM fallback, placeholder safety).
  - Inspect each `logs/<ts>/<sceneId>/` folder: make sure `scene.json`, `keyframe.png`, `history.json`, and `generated-frames/*.png` exist and that frame counts align with the summary/metadata warnings.
- Open the **Artifact Snapshot** panel or `public/artifacts/latest-run.json` to confirm prompts, moods, keyframe paths, history poll timestamps, telemetry (duration + GPU + VRAM), warnings, Vitest log paths, and archive references are surfaced. Use the new warnings-only filter in the UI to highlight degraded scenes.
  - Confirm `artifacts/comfyui-e2e-<ts>.zip` mirrors the `logs/<ts>` tree before attaching it to a PR or handoff. Reviewers can validate the upload by downloading `comfyui-e2e-logs` from the workflow run.
  - Use `STORY_TO_VIDEO_TEST_CHECKLIST.md` for the expected `run-summary.txt` template, validation commands, and new failure protocol (requeue guidance, history warning requirements).
  - If you manually tweak `run-summary.txt`, rerun `scripts/validate-run-summary.ps1 -RunDir logs/<ts>` so the `[Scene ...] HISTORY WARNING/ERROR` and `WARNING: Frame count below floor` entries continue to line up with `artifact-metadata.json` after telemetry or sentinel changes.

### Capturing the full testing log

`scripts/run-comfyui-e2e.ps1` already drives the story → video run, executes the three Vitest suites, and invokes `validate-run-summary`, so every `logs/<ts>` folder now contains the `run-summary.txt` (with FastIteration and sentinel lines), `artifact-metadata.json`, `vitest-comfyui.log`, `vitest-e2e.log`, `vitest-scripts.log`, `vitest-results.json`, and the `artifacts/comfyui-e2e-<ts>.zip` archive. That run summary explicitly lists the sentinel handshake (`DoneMarker*`/`ForcedCopy*`), GPU telemetry, and the `FastIteration mode enabled: ...` banner you need to review before sharing results.

When you need to rerun only the suites, call `pwsh ./scripts/run-vitests.ps1` (add `-Quick` for the telemetry-shape-only pathway) to regenerate the Vitest logs and `vitest-results.json`. Re-running `pwsh ./scripts/validate-run-summary.ps1 -RunDir logs/<ts>` afterwards double-checks that the textual summary still matches `artifact-metadata.json` after telemetry or sentinel changes.

After batching several runs, call `pwsh ./scripts/generate-sweep-report.ps1` to scan `logs/` and emit `logs/stability-sweep-<timestamp>/report.json`. That “sweep” JSON aggregates scene/frame counts, fallback notes (including forced-copy warnings), GPU/VRAM deltas, and warning flags from every run so reviewers can consume the full Vitest/ComfyUI/Validate/Sweep trace before approving artifacts.

- Failure triage tips:
  - If frame counts stay at 0, verify `ComfyUI/models/checkpoints/SVD/` contains `svd_xt*.safetensors` (see [thecooltechguy/ComfyUI-Stable-Video-Diffusion](https://github.com/thecooltechguy/ComfyUI-Stable-Video-Diffusion)) and ensure `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output` is writable. The helper will requeue once automatically and stamp `[Scene ...] ERROR: No frames copied`.
  - History timeouts now surface via `[Scene ...] HISTORY WARNING` entries and the per-attempt poll timeline embedded in `artifact-metadata.json`. The poller now keeps retrying until `MaxWaitSeconds`, so if a scene eventually succeeds you will still see the final `[Scene ...] Frames=##` line without needing to restart. Investigate `logs/<ts>/<sceneId>/history.json` plus the `HistoryPollLog` array rendered by the Artifact Snapshot when history never resolves.
  - Alternate SVD prompt wiring examples (e.g., [ComfyUI Txt2Video with SVD on Civitai](https://civitai.com/models/211703/comfyui-txt2video-with-svd)) are referenced in `STORY_TO_VIDEO_PIPELINE_PLAN.md` if you need to adjust node mappings.
- CI automation:
  . `.github/workflows/pr-vitest.yml` (Windows, Node 22.19.0) runs `npm exec vitest -- run --reporter json --outputFile vitest-report.json` on every PR and uploads the JSON report for reviewers. Trigger the workflow manually with `runFullE2E = true` to run the helper on a workstation that already has ComfyUI installed—the resulting `comfyui-e2e-<ts>.zip` is published as the `comfyui-e2e-logs` artifact for inspection.
- Fast iteration mode: pass `-FastIteration` to `scripts/run-comfyui-e2e.ps1` to shrink the poll interval to 1 s, cut the post-execution wait, tighten the sentinel scan/stability heuristics, and log a `FastIteration mode enabled: historyPollInterval=... postExecTimeout=... sentinelScan=... sentinelStable=... queueStability=...` line in `run-summary.txt` so you can instantly tell whether a quick-turn run used those heuristics. That same summary line makes it easy to distinguish the fast-iteration telemetry (with its shorter poll interval and sentinel scan timeout) from a standard run while validators/Vitest check the paired `[Scene ...] Telemetry:` lines for the required `DoneMarker*` and `ForcedCopy*` fields.
[1]: https://lmstudio.ai/docs/api#health-checks
[2]: https://github.com/comfyanonymous/ComfyUI/blob/master/examples/websocket_api_example.py
