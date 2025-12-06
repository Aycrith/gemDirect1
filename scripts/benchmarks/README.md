# Benchmarks Directory

**Location**: `scripts/benchmarks/`  
**Purpose**: Video quality and performance benchmarking tools for QA validation  
**E3 Update**: Camera-path-aware metrics added

## Available Tools

| Script | Purpose | Usage |
|--------|---------|-------|
| `video-quality-benchmark.ts` | Compute temporal coherence, motion consistency, identity stability, camera path adherence | `npx tsx video-quality-benchmark.ts --run-dir <path>` |
| `run-video-quality-benchmark.ps1` | Wrapper for single-preset benchmark | `.\run-video-quality-benchmark.ps1 -Preset production` |
| `run-video-quality-all-presets.ps1` | Multi-preset convenience wrapper | `.\run-video-quality-all-presets.ps1` |
| `compare-temporal-regularization.ts` | A/B comparison for temporal regularization | `npx tsx compare-temporal-regularization.ts --verbose` |

## Quick Start

### Single Preset Benchmark
```powershell
# Run on latest regression
.\scripts\benchmarks\run-video-quality-benchmark.ps1

# Run for specific preset
.\scripts\benchmarks\run-video-quality-benchmark.ps1 -Preset production -Verbose
```

### All Presets Benchmark
```powershell
# Benchmark all four presets (Production, Cinematic, Character, Fast)
.\scripts\benchmarks\run-video-quality-all-presets.ps1
```

### Temporal Regularization A/B Comparison (E2.1)
```powershell
# Run automated A/B comparison
npx tsx scripts/benchmarks/compare-temporal-regularization.ts --verbose

# Specify a sample
npx tsx scripts/benchmarks/compare-temporal-regularization.ts --sample sample-002-character

# Dry run to preview commands
npx tsx scripts/benchmarks/compare-temporal-regularization.ts --dry-run
```

## Output Locations

| Output | Location |
|--------|----------|
| JSON Reports | `data/benchmarks/video-quality-*.json` |
| CSV Reports | `data/benchmarks/video-quality-*.csv` |
| Markdown (Single) | `reports/VIDEO_QUALITY_BENCHMARK_*.md` |
| Markdown (All Presets) | `reports/VIDEO_QUALITY_BENCHMARK_ALL_PRESETS_*.md` |
| Temporal Regularization Comparison | `data/benchmarks/temporal-regularization-comparison-*.json` |
| Temporal Regularization Report | `reports/TEMPORAL_REGULARIZATION_EVAL_*.md` |

## Camera-Path-Aware Metrics (E3)

As of E3, the benchmark harness can consume manifest files with camera path metadata to compute additional metrics:

- **pathAdherenceMeanError**: Average deviation from expected camera position (0-1, lower = better)
- **pathAdherenceMaxError**: Maximum deviation from expected position
- **pathDirectionConsistency**: Motion vector alignment (0-1, higher = better)

### Usage with Camera Paths

```powershell
# With manifest directory
npx tsx scripts/benchmarks/video-quality-benchmark.ts --manifest-dir data/manifests --verbose

# With specific manifest file
npx tsx scripts/benchmarks/video-quality-benchmark.ts --manifest data/manifests/sample-001-manifest.json
```

### Requirements

- Manifests with `cameraPathId` and `cameraPathSummary` fields
- Camera path keyframes for interpolation
- Metrics are observational (no pass/fail thresholds yet)

## Relationship to Vision QA

The Video Quality Benchmark (Task A2) provides **technical/signal-level metrics**, while Vision QA (Task A1) provides **semantic/VLM-based metrics**.

| Aspect | Video Quality (A2) | Vision QA (A1) |
|--------|-------------------|----------------|
| Metrics | Temporal coherence, motion smoothness, camera path adherence (E3) | Motion quality, prompt adherence |
| Method | Frame analysis via ffmpeg | VLM analysis via qwen3-vl |
| Baselines | `data/benchmarks/` | `data/vision-qa-baselines/` |

For complete documentation, see:
- `Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md`
- `reports/VISION_QA_BASELINES_20251205.md`
- `reports/TEMPORAL_REGULARIZATION_EVAL_2025-12-05.md`

## Prerequisites

- ffmpeg/ffprobe in PATH
- Node.js ≥22.19.0
- Regression run with video files in `test-results/bookend-regression/`
- (Optional for E3) Manifest files with camera path data in `data/manifests/`

---

*Part of Workstream A: QA & Quality Signal Alignment*
