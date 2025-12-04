# Bookend Golden Samples & Regression Testing

This document explains the golden sample assets and regression testing infrastructure for the Bookend video generation pipeline.

## Golden Sample Assets

**Location**: `data/bookend-golden-samples/`

Golden keyframe pairs are stored here as the single source of truth for FLF2V (First-Last-Frame to Video) regression testing. They consist of:

- **sample-001-geometric**: Simple geometric shapes motion test (baseline simplicity)
- **sample-002-character**: Red-haired woman head turn (character identity preservation)
- **sample-003-environment**: Cozy cafe camera pan (background consistency)

**Currently present**: 3 samples (001, 002, 003)  
**Planned**: 2 more samples (004-motion, 005-complex)

## Key Files

| File | Purpose |
|------|---------|
| `data/bookend-golden-samples/README.md` | Detailed guide to sample types, thresholds, and creating new samples |
| `data/bookend-golden-samples/baselines.json` | Manifest with per-sample metadata and quality thresholds |
| `data/bookend-golden-samples/sample-NNN-*/context.json` | Motion description and generation prompts for each sample |
| `data/bookend-golden-samples/sample-NNN-*/expected-scores.json` | Sample-specific quality thresholds |

## Regression Testing Scripts & npm Wrappers

### frame-similarity CLI: Pixel-level frame matching
**Direct call**:
```powershell
node --import tsx scripts/bookend-frame-similarity.ts --video <mp4> --start <png> --end <png>
```

**npm wrapper**:
```powershell
npm run bookend:similarity -- --video <mp4> --start <png> --end <png>
```

Output:
```json
{
  "videoPath": "...",
  "startSimilarity": 91.2,
  "endSimilarity": 88.7,
  "avgSimilarity": 89.95
}
```

### E2E Validation: Quick golden sample video generation + similarity check
**Direct call**:
```powershell
pwsh -File scripts/test-bookend-e2e.ps1 [-Sample <name>] [-Seed <int>]
```

**npm wrapper**:
```powershell
npm run bookend:e2e
```

- Reads golden samples from `data/bookend-golden-samples/`
- Queues videos via WAN 2.2 5B FLF2V workflow
- Extracts first/last frames and computes similarity scores
- Outputs `test-results/bookend-e2e/run-<timestamp>/results.json`
- Supports `-Seed` parameter for reproducible generations

### Parameter Sweep: Optimize WAN 2.2 5B settings
**Direct call**:
```powershell
pwsh -File scripts/wan-parameter-sweep.ps1 [-QuickMode]
```

**npm wrapper**:
```powershell
npm run bookend:sweep
```

- Tests resolution (832×468, 896×504, 960×540), CFG (4.5–6.5), steps (18–32), frame counts (49, 61)
- Deep-clones and patches workflow JSON for each config
- Uses golden samples to evaluate video quality
- Selects best config based on VRAM safety + quality thresholds
- Outputs `test-results/wan-tuning/sweep-<timestamp>.json`
- `-QuickMode` tests only resolutions with defaults for fast iteration

### Regression Harness: Full validation with baseline comparison
**Direct call**:
```powershell
pwsh -File scripts/test-bookend-regression.ps1 [-Sample <name>] [-FailThreshold 70] [-WarnThreshold 85]
```

**npm wrapper**:
```powershell
npm run bookend:regression
```

- Queues FLF2V videos for all golden samples
- Computes frame similarity (start + end vs. golden keyframes)
- Compares against baselines in `data/bookend-golden-samples/baselines.json`
- Outputs verdict (PASS/WARN/FAIL) for each sample
- Exit code `0` = pass, exit code `1` = failure
- Results saved to `test-results/bookend-regression/run-<timestamp>/results.json`

## Frame Similarity Metrics

Computes pixel-level RGB similarity between golden keyframes and extracted video frames.

Similarity scores (0–100):
- **90+**: Excellent match (minimal drift)
- **80-89**: Good match (acceptable for production)
- **70-79**: Fair match (degradation detected)
- **<70**: Poor match (likely regression or configuration issue)

## Running Regression Tests

### Quick E2E validation (single sample, no regression)
```powershell
npm run bookend:e2e
```

Or test specific sample:
```powershell
pwsh -File scripts/test-bookend-e2e.ps1 -Sample sample-001-geometric
```

### Full regression suite (all samples, baseline comparison)
```powershell
npm run bookend:regression
```

### Parameter sweep to find optimal WAN 2.2 5B config
```powershell
npm run bookend:sweep -- -QuickMode
```

### Test with fixed seed for reproducibility
```powershell
pwsh -File scripts/test-bookend-e2e.ps1 -Seed 42
npm run bookend:regression -- -FailThreshold 65
```

## Bookend QA Mode

**Configuration**: `localGenSettings.json` → `bookendQAMode`

When enabled (`enabled: true`), the bookend infrastructure:
- `enforceKeyframePassthrough: true` → Forces use of provided keyframes (skips AI overrides)
- `overrideAISuggestions: true` → Disables AI suggestions for consistency testing
- Uses golden sample thresholds for quality gates

When disabled (default), the system uses normal video generation settings.

## For Test Automation / CI

1. Ensure `data/bookend-golden-samples/` exists with samples 001-003 and their images
2. Run `npm run bookend:regression` as part of CI pipeline
3. Exit code `0` = all samples pass or warn
4. Exit code `1` = regressions detected or samples failed
5. Check `test-results/bookend-regression/run-<timestamp>/results.json` for details

Example GitHub Actions:
```yaml
- name: Run Bookend Regression Tests
  run: npm run bookend:regression
  
- name: Upload Regression Results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: bookend-regression-results
    path: test-results/bookend-regression/
```

## For Manual Development

**See**: `Documentation/Guides/BOOKEND_QA_WORKFLOW_DEVELOPER_GUIDE.md` for complete QA workflow documentation.

## Phase Status (December 2, 2025)

| Phase | Status | Implementation |
|-------|--------|-----------------|
| 0: Golden Asset Alignment | ✅ Complete | baselines.json verified, README updated, cross-link doc created |
| 1: Frame Similarity CLI | ✅ Complete | bookend-frame-similarity.ts (ffmpeg-based, 0-100 scale), wired into E2E script |
| 2: Parameter Sweep | ✅ Complete | wan-parameter-sweep.ps1 with workflow deep-cloning, resolution/CFG/steps patching |
| 3: QA Mode Flag | ✅ Complete | bookendQAMode added to localGenSettings.json with hooks in E2E + sweep |
| 4: Regression Harness | ✅ Complete | test-bookend-regression.ps1 with video queueing, frame similarity, verdict logic |
| 5: Testing Hooks & npm Wrappers | ✅ Complete | npm scripts for similarity/e2e/sweep/regression in package.json |
| 6: Documentation Update | ⏳ In Progress | This document updated, BOOKEND_GOLDEN_README.md v2 created |

---

**Last updated**: December 2, 2025  
**Golden samples location**: `data/bookend-golden-samples/`  
**Scripts location**: `scripts/`  
**npm wrappers**: `bookend:similarity`, `bookend:e2e`, `bookend:sweep`, `bookend:regression`
