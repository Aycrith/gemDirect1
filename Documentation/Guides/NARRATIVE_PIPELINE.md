# Narrative Pipeline Guide

Part of N1 – Story-to-Shot Narrative Pipeline (First Pass)

## Overview

The Narrative Pipeline provides a **multi-shot orchestration system** that:

1. Reads a structured narrative script (JSON) defining 2+ shots
2. Generates video for each shot using per-shot pipeline configs
3. Runs QA and benchmarks per shot
4. Writes manifests per shot
5. Concatenates all shot videos into a single narrative video
6. Produces summary reports (JSON + Markdown)

This is a first-pass prototype focused on structure and workflow validation.

## Quick Start

```bash
# Run the demo three-shot narrative
npm run narrative:demo

# Or specify a custom script
npx tsx scripts/run-narrative.ts --script config/narrative/your-script.json

# List available narrative scripts
npm run narrative:list

# Dry run (preview steps without execution)
npx tsx scripts/run-narrative.ts --script config/narrative/demo-three-shot.json --dry-run
```

## Narrative UI (F2)

You can also run narratives directly from the **React UI** without using the command line.

### Accessing the Narrative Dashboard

1. Open the app at http://localhost:3000
2. Click the **Usage Dashboard** (📊 icon in header)
3. Find and expand the **Narrative Pipeline** panel

### Features

| Feature | Description |
|---------|-------------|
| **Script Browser** | View all available scripts in `config/narrative/` |
| **Run from UI** | Click to start a run without CLI |
| **Progress Tracking** | Real-time per-shot progress updates |
| **QA Summary** | Aggregated PASS/WARN/FAIL verdicts |
| **Per-Shot Details** | Expand to see Vision QA, flicker, jitter metrics |

### UI vs CLI

| Aspect | UI (NarrativeDashboard) | CLI (run-narrative.ts) |
|--------|-------------------------|-------------------------|
| Best For | Quick runs, visual monitoring | Automation, CI/CD |
| Progress | Real-time progress bar | Console streaming |
| QA Display | Color-coded metrics table | JSON/Markdown reports |
| Script Discovery | Auto-lists from config/narrative/ | Manual path required |
| Batch Runs | Single narrative at a time | Scriptable multi-runs |

### Service Architecture

The UI uses two services:

1. **narrativeScriptService** (`services/narrativeScriptService.ts`)
   - Lists scripts from `config/narrative/`
   - Validates script format using type guards
   - Works in both browser (fetch) and Node.js (fs)

2. **narrativeRunService** (`services/narrativeRunService.ts`)
   - Manages run lifecycle (start, progress, complete)
   - Tracks per-shot status and metrics
   - Provides run summaries for display

See [Recipe 9: Narrative UI](./RECIPES.md#recipe-9-narrative-ui-f2) for step-by-step usage.

## Narrative Script Format

Narrative scripts are JSON files in `config/narrative/`:

```json
{
  "id": "demo-three-shot",
  "title": "Three-Shot Demo: Fast → Production → Cinematic",
  "description": "Demonstrates multi-shot pipeline with different quality tiers",
  "version": "1.0",
  
  "shots": [
    {
      "id": "shot-001",
      "name": "Opening - Fast Preview",
      "pipelineConfigId": "fast-preview",
      "sampleId": "sample-001-geometric",
      "durationSeconds": 3.0,
      "temporalRegularization": "off"
    },
    {
      "id": "shot-002",
      "name": "Main Action - Production QA",
      "pipelineConfigId": "production-qa-preview",
      "sampleId": "sample-001-geometric",
      "durationSeconds": 3.0,
      "temporalRegularization": "auto"
    },
    {
      "id": "shot-003",
      "name": "Climax - Cinematic",
      "pipelineConfigId": "cinematic-preview",
      "sampleId": "sample-001-geometric",
      "durationSeconds": 3.0,
      "temporalRegularization": "on"
    }
  ],
  
  "metadata": {
    "createdAt": "2025-12-05T00:00:00Z",
    "author": "Your Name"
  }
}
```

### Shot Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✓ | Unique shot identifier (e.g., "shot-001") |
| `name` | | Human-readable shot name |
| `pipelineConfigId` | ✓ | Pipeline config to use (must exist in `config/pipelines/`) |
| `sampleId` | | Golden sample ID (default: `sample-001-geometric`) |
| `cameraPathId` | | Override camera path from pipeline config |
| `durationSeconds` | | Target duration hint (default: 3.0) |
| `temporalRegularization` | | `on`, `off`, or `auto` (default: `auto`) |
| `description` | | Shot description/notes |

### Available Pipeline Configs

| Config ID | Description | VRAM |
|-----------|-------------|------|
| `fast-preview` | Quick iteration, no temporal processing | 6-8 GB |
| `production-qa-preview` | Balanced quality with QA gates | 10-12 GB |
| `cinematic-preview` | Full temporal coherence stack | 12-16 GB |

## Pipeline Steps

For each shot, the narrative pipeline executes:

1. **generate-shot-\<id\>** – Generate video using regression test script
2. **temporal-shot-\<id\>** – Apply temporal regularization (if enabled)
3. **vision-qa-shot-\<id\>** – Run Vision QA analysis
4. **benchmark-shot-\<id\>** – Run video quality benchmark
5. **manifest-shot-\<id\>** – Verify/write generation manifest

After all shots complete:

6. **concat-shots** – Concatenate videos using ffmpeg
7. **generate-summary** – Create JSON + Markdown reports

### Step Dependencies

```
Shot 1:
  generate-shot-001
       ↓
  temporal-shot-001 ──→ vision-qa-shot-001
       ↓                      
       ↓            ──→ benchmark-shot-001
       ↓
  manifest-shot-001

Shot 2 (waits for shot 1's temporal step):
  generate-shot-002
       ↓
  temporal-shot-002 ──→ vision-qa-shot-002
       ↓
       ...

Final:
  concat-shots (waits for all temporal steps)
       ↓
  generate-summary
```

Shots generate sequentially to avoid resource contention. Within each shot, QA and benchmark run in parallel after temporal processing.

## Output Locations

| Output | Location |
|--------|----------|
| Per-shot videos | `test-results/bookend-regression/run-<timestamp>/<sample>/` |
| Final narrative video | `output/narratives/<scriptId>/<scriptId>_final.mp4` |
| Run summary JSON | `data/narratives/<scriptId>/narrative-run-<timestamp>.json` |
| Run summary Markdown | `reports/NARRATIVE_RUN_<scriptId>_<date>.md` |
| Per-shot manifests | `data/manifests/` |
| Per-shot benchmarks | `data/benchmarks/` |

## CLI Options

```bash
npx tsx scripts/run-narrative.ts [options]

Options:
  --script, -s <path>   Path to narrative script JSON (required)
  --verbose, -v         Enable verbose logging
  --dry-run, -d         Preview steps without execution
  --list, -l            List available narrative scripts
  --help, -h            Show help message
```

## Summary Reports

### JSON Summary

The JSON summary includes:

```json
{
  "narrativeId": "demo-three-shot",
  "title": "Three-Shot Demo",
  "scriptPath": "config/narrative/demo-three-shot.json",
  "startedAt": "2025-12-05T10:00:00Z",
  "finishedAt": "2025-12-05T10:15:30Z",
  "totalDurationMs": 930000,
  "shotCount": 3,
  "successfulShots": 3,
  "failedShots": 0,
  "shotMetrics": [
    {
      "shotId": "shot-001",
      "flickerFrameCount": 2,
      "overallQuality": 75,
      "visionQaStatus": "PASS"
    }
  ],
  "shotArtifacts": [...],
  "finalVideoPath": "output/narratives/demo-three-shot/demo-three-shot_final.mp4",
  "status": "succeeded",
  "qaSummary": {
    "overallVerdict": "WARN",
    "overallReasons": ["1/3 shots have warnings"],
    "shots": [...]
  }
}
```

### Narrative QA Summary (N2)

The narrative pipeline now includes an aggregated **QA Summary** that gives each run a clear, scannable health status:

- **Overall Verdict**: `PASS`, `WARN`, or `FAIL` for the entire narrative
- **Per-Shot Verdicts**: Each shot receives its own verdict based on:
  - Vision QA metrics (overall score, artifact severity)
  - Benchmark metrics (flicker, jitter, identity, overall quality)
  - Camera path adherence metrics (path error, direction consistency)

**How Verdicts are Computed:**

| Level | PASS | WARN | FAIL |
|-------|------|------|------|
| Vision QA Overall | ≥85 | 80–84 | <80 |
| Vision Artifacts | ≤35 | 36–40 | >40 |
| Flicker Frames | ≤5 | 6–15 | >15 |
| Jitter Score | ≤20 | 21–40 | >40 |
| Identity Score | ≥70 | 50–69 | <50 |
| Overall Quality | ≥65 | 45–64 | <45 |
| Path Adherence Error | ≤0.15 | 0.15–0.30 | >0.30 (soft) |
| Direction Consistency | ≥0.5 | 0.2–0.5 | <0.2 (soft) |

Camera path metrics are "soft signals" – they can add WARN reasons but don't hard-fail a shot.

The **Narrative Overall Verdict** uses worst-case aggregation:
- If any shot is FAIL → overall FAIL
- Else if any shot is WARN → overall WARN
- Else → PASS

This gives you a quick "is this output probably OK?" answer without inspecting each shot manually.

### Markdown Report

The Markdown report includes:

- Narrative metadata and status
- Shot summary table (pipeline, temporal, quality, QA)
- Camera path metrics table (E3 adherence/direction)
- Artifact locations per shot

## Requirements

- ComfyUI server running on port 8188
- LM Studio or Gemini API configured (for Vision QA)
- ffmpeg in PATH (for video concatenation)

## Related Documentation

- [PIPELINE_CONFIGS.md](./PIPELINE_CONFIGS.md) – Pipeline and camera path configuration
- [VIDEO_QUALITY_BENCHMARK_GUIDE.md](../Testing/Benchmarks/VIDEO_QUALITY_BENCHMARK_GUIDE.md) – Benchmark metrics
- [VERSIONING_AND_MANIFESTS.md](./VERSIONING_AND_MANIFESTS.md) – Manifest format

## Examples

### Minimal Script (2 shots)

```json
{
  "id": "minimal-two-shot",
  "shots": [
    { "id": "shot-001", "pipelineConfigId": "fast-preview" },
    { "id": "shot-002", "pipelineConfigId": "production-qa-preview" }
  ]
}
```

### Custom Camera Paths

```json
{
  "id": "camera-demo",
  "shots": [
    {
      "id": "shot-001",
      "pipelineConfigId": "production-qa-preview",
      "cameraPathId": "slow-pan-left"
    },
    {
      "id": "shot-002",
      "pipelineConfigId": "production-qa-preview",
      "cameraPathId": "zoom-in-center"
    }
  ]
}
```

## Troubleshooting

### "Pipeline config not found"

Ensure the `pipelineConfigId` matches a JSON file in `config/pipelines/`:
- `fast-preview` → `config/pipelines/fast-preview.json`
- `production-qa-preview` → `config/pipelines/production-qa-preview.json`
- `cinematic-preview` → `config/pipelines/cinematic-preview.json`

### "ffmpeg not found"

Ensure ffmpeg is installed and in your PATH:
```bash
ffmpeg -version
```

### "ComfyUI not responding"

Start ComfyUI server before running narrative:
1. Use VS Code task: "Start ComfyUI Server (Patched - Recommended)"
2. Or run manually on port 8188

### Only one video in final output

Check that each shot generated successfully by inspecting:
- Console output for step failures
- `test-results/bookend-regression/` for per-shot videos
- Summary report for shot status
