# E2E Testing - Complete Artifact Index

**Test Execution Date**: November 12, 2025  
**Test Run ID**: `20251112-050747`  
**Status**: ✅ **COMPLETE SUCCESS**

---

## 📋 Documentation

### Primary Reports
1. **[E2E_TEST_EXECUTION_REPORT_20251112.md](./E2E_TEST_EXECUTION_REPORT_20251112.md)** 
   - Comprehensive 400+ line analysis
   - All 9 phases detailed breakdown
   - Queue policy compliance verification
   - GPU telemetry analysis
   - Issues and resolutions
   - Command reference

2. **[E2E_TEST_QUICK_SUMMARY.md](./E2E_TEST_QUICK_SUMMARY.md)**
   - One-page executive overview
   - Key facts at a glance
   - Quick reproduction commands
   - Artifact locations
   - Verification steps

---

## 📁 Run Artifacts

### Run Directory Structure
```
logs/20251112-050747/
├── run-summary.txt                    # Main execution log (all phases)
├── artifact-metadata.json             # Structured run metadata
├── story/
│   ├── story.json                     # Story with LLM provenance
│   └── keyframes/
│       ├── scene-001.png
│       ├── scene-002.png
│       └── scene-003.png
├── scene-001/
│   ├── scene.json                     # Scene definition
│   ├── keyframe.png
│   ├── history.json                   # Complete /history endpoint response
│   └── generated-frames/              # 25 PNG files
├── scene-002/                         # (Similar structure)
├── scene-003/                         # (Similar structure)
├── vitest-comfyui.log                 # ComfyUI service test output
├── vitest-e2e.log                     # E2E test output
├── vitest-scripts.log                 # Helper script test output
└── vitest-results.json                # Vitest telemetry (exit codes, durations)
```

### Quick Access Commands

```powershell
# Navigate to run directory
cd C:\Dev\gemDirect1\logs\20251112-050747

# View summary
Get-Content run-summary.txt

# View metadata
Get-Content artifact-metadata.json | ConvertFrom-Json

# List all files
Get-ChildItem -Recurse | Measure-Object -Property Length -Sum

# View Vitest results
Get-Content vitest-results.json | ConvertFrom-Json
```

---

## 🎬 Video Output Details

### Scene Generation Summary
| Scene | Generated | Duration | Frames | Status | GPU Impact |
|-------|-----------|----------|--------|--------|-----------|
| scene-001 | "The Call" | 128.9s | 25 ✓ | ✅ SUCCESS | -4,461 MB |
| scene-002 | "The Artifact" | 124.8s | 25 ✓ | ✅ SUCCESS | 0 MB |
| scene-003 | "The Revelation" | 124.8s | 25 ✓ | ✅ SUCCESS | 0 MB |
| **TOTAL** | **3 scenes** | **378.5s** | **75** | **100%** | **Efficient** |

### Frame Locations
- Scene 001: `scene-001/generated-frames/gemdirect1_scene-001_*.png` (25 files)
- Scene 002: `scene-002/generated-frames/gemdirect1_scene-002_*.png` (25 files)
- Scene 003: `scene-003/generated-frames/gemdirect1_scene-003_*.png` (25 files)

---

## 📊 Test Results

### Vitest Suites (All Passing)
```
Suite               Exit Code   Duration     Status
────────────────────────────────────────────────────
ComfyUI Service     0           1,362 ms     ✅ PASS
E2E Pipeline        0           1,152 ms     ✅ PASS
Helper Scripts      0           2,349 ms     ✅ PASS
────────────────────────────────────────────────────
TOTAL               0           4,863 ms     ✅ PASS
```

### Validation Results
```
✅ run-summary.txt compliance      PASS
✅ artifact-metadata.json          PASS
✅ Telemetry completeness          PASS (all fields)
✅ GPU metrics captured            PASS
✅ Queue policy adherence          PASS
✅ History polling success         PASS
✅ Scene frame counts              PASS (25 each)
✅ Archive integrity               PASS (17.11 MB)
```

---

## 🎨 Queue Policy Configuration

### Used Settings
```json
{
  "MaxSceneRetries": 1,
  "HistoryMaxWaitSeconds": 600,
  "HistoryPollIntervalSeconds": 2,
  "HistoryMaxAttempts": 0,
  "PostExecutionTimeoutSeconds": 30
}
```

### Compliance Verification
- ✅ Max wait: Scenes polled within 600s budget
- ✅ Poll interval: 2s intervals throughout
- ✅ Unbounded attempts: Polled until execution_success
- ✅ Post-exec timeout: 30s honored after success
- ✅ Retry logic: 0/3 scenes needed requeue

---

## 💾 Archive

### Download
**Location**: `artifacts/comfyui-e2e-20251112-050747.zip`  
**Size**: 17.11 MB  
**Format**: ZIP (entire `logs/20251112-050747` directory)

### Archive Contents
- ✅ Story metadata + LLM logs
- ✅ 3 scene definitions + keyframes
- ✅ 75 generated video frames (PNG)
- ✅ 3 history.json files (ComfyUI polling records)
- ✅ Complete run-summary.txt
- ✅ artifact-metadata.json
- ✅ All Vitest logs and results

### Extract Commands
```powershell
# Extract to current directory
Expand-Archive -Path artifacts/comfyui-e2e-20251112-050747.zip -DestinationPath ./extracted

# Extract specific scene frames
$zip = New-Object System.IO.Compression.ZipFile
$zip.ExtractToDirectory(
  'artifacts/comfyui-e2e-20251112-050747.zip',
  './extracted'
)
# Then access: ./extracted/scene-001/generated-frames/*.png
```

---

## 🔍 Telemetry Data

### Available in artifact-metadata.json
- **Story**: ID, logline, director's vision, generator
- **LLM Metadata**: Provider URL, model, seed, temperature, status, duration
- **Per-Scene Telemetry**:
  - Duration (seconds)
  - Frame count
  - GPU name and VRAM (before/after/delta)
  - History polling (attempts, intervals)
  - Queue policy parameters
  - Execution success detection
  - Exit reasons
  - Post-execution timeout tracking
  - Fallback notes

### GPU Stats Captured
```json
{
  "GPU": {
    "Name": "NVIDIA GeForce RTX 3090",
    "VramFreeBefore": 20870000000,    // bytes
    "VramFreeAfter": 16409000000,     // bytes
    "VramDelta": -4461000000          // bytes (scene-001 only)
  }
}
```

---

## 🔗 Related Files in Repository

### Configuration & Setup
- `README.md` - Environment setup and LLM provider configuration
- `vite.config.ts` - Build configuration (includes API key exposure)
- `package.json` - Dependencies and scripts

### Key Scripts Used
- `scripts/run-comfyui-e2e.ps1` - Main E2E orchestrator
- `scripts/generate-story-scenes.ts` - Story generation entry point
- `scripts/storyGenerator.ts` - Core story generation logic
- `scripts/localStoryProvider.ts` - LLM request handler
- `scripts/queue-real-workflow.ps1` - ComfyUI workflow queuing
- `scripts/run-vitests.ps1` - Vitest suite runner
- `scripts/validate-run-summary.ps1` - Post-run validation

### Generated Assets
- `public/artifacts/latest-run.json` - Snapshot mirrored for React UI
- `dist/` - Built frontend (updated with TimelineEditor fix)

---

## 🚀 How to Use This Artifact

### For Code Review
1. Read: `E2E_TEST_QUICK_SUMMARY.md` (overview)
2. Review: `E2E_TEST_EXECUTION_REPORT_20251112.md` (details)
3. Check: `logs/20251112-050747/run-summary.txt` (actual logs)

### For Reproduction
1. Follow: "How to Reproduce" in Quick Summary
2. Set environment variables (LLM provider, timeout, etc.)
3. Run: `.\scripts\run-comfyui-e2e.ps1` with queue policy knobs

### For Performance Analysis
1. Open: `logs/20251112-050747/artifact-metadata.json`
2. Extract: Per-scene timing and GPU metrics
3. Compare: Against baseline or previous runs

### For Debugging
1. Check: `run-summary.txt` for [Scene ...][Attempt ...] entries
2. Review: `scene-{001,002,003}/history.json` for polling details
3. Inspect: `vitest-*.log` files for test failures (if any)

### For Visualization
1. Open: React app at `http://localhost:3000`
2. Navigate: Artifact Snapshot panel
3. Select: Run `20251112-050747`
4. Filter: Warnings-only view, GPU metrics card, Queue policy card

---

## 📝 Metadata Summary

**Story Generated**:
- ID: gemDirect1-001
- Scene Count: 3
- Logline: "In a dystopian future, a lone hacker fights against an oppressive regime to uncover the truth about a mysterious artifact."
- Director's Vision: "A visually stunning and emotionally gripping sci-fi short film..."

**LLM Execution**:
- Provider: mistralai/mistral-7b-instruct-v0.3
- Endpoint: http://192.168.50.192:1234/v1/chat/completions
- Generation Time: 81.9 seconds
- Seed: 42 (deterministic)
- Temperature: 0.35 (low variance)

**Video Generation**:
- Total Duration: 378.5 seconds GPU work
- Frames Generated: 75 (25 per scene)
- GPU Device: NVIDIA GeForce RTX 3090
- VRAM Efficiency: Models cached after scene 1
- Status: 100% success, no requeues

---

## ✅ Verification Checklist

Use this to validate the run artifacts:

- [ ] `run-summary.txt` exists and contains all phases
- [ ] `artifact-metadata.json` valid JSON with complete schema
- [ ] 3 scene directories present (scene-001, scene-002, scene-003)
- [ ] Each scene has `keyframe.png`, `scene.json`, `history.json`
- [ ] Each scene has `generated-frames/` with 25 PNG files
- [ ] All 3 Vitest logs present (comfyui, e2e, scripts)
- [ ] `vitest-results.json` shows all exit codes = 0
- [ ] Archive file `comfyui-e2e-20251112-050747.zip` (17.11 MB)
- [ ] `latest-run.json` mirrored in `public/artifacts/`
- [ ] Run Summary includes all policy knobs
- [ ] All scene telemetry includes GPU metrics
- [ ] History polling data captured per scene
- [ ] Validation reported PASS

---

## 🔧 Reproduction with Different Settings

### Test with Aggressive Retry
```powershell
& ".\scripts\run-comfyui-e2e.ps1" -MaxSceneRetries 3
```

### Test with Shorter Polling Timeout
```powershell
& ".\scripts\run-comfyui-e2e.ps1" -SceneMaxWaitSeconds 300 -SceneHistoryPollIntervalSeconds 1
```

### Test with Ollama (Alternative LLM)
```powershell
$env:LOCAL_STORY_PROVIDER_URL = "http://localhost:11434/api/generate"
$env:LOCAL_LLM_MODEL = "mistral"
$env:LOCAL_LLM_REQUEST_FORMAT = "ollama"
& ".\scripts\run-comfyui-e2e.ps1"
```

---

**Ready for distribution, review, and analysis.**  
All requirements met. All telemetry captured. Production ready. ✅

