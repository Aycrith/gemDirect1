# Bookend QA CI Integration Notes

**Date**: December 4, 2025 (Updated PM)  
**Baselines Version**: v2.1.0  
**Vision Thresholds Version**: v2.0.0 (strict)  
**Golden Samples**: 8 (001–008)

## Overview

This document describes how to integrate Bookend QA (video quality regression testing) into a CI/CD pipeline. Bookend QA validates that FLF2V (First-Last-Frame to Video) generation maintains quality standards by comparing generated videos against golden sample baselines.

**Reference Files**:
- `data/bookend-golden-samples/baselines.json` - Golden baselines (v2.1.0)
- `data/bookend-golden-samples/vision-thresholds.json` - Coherence thresholds for vision gating (v2.0.0, strict)
- `Testing/Reports/BOOKEND_QA_VISION_METRICS_20251202.md` - Detailed vision metrics

---

## Prerequisites

### Required (Core CI)
- Node.js ≥22.19.0
- TypeScript toolchain (`npm install`)
- ComfyUI server running on port 8188
- WAN 2.2 5B models loaded in ComfyUI
- ffmpeg in PATH
- ImageMagick (optional, for enhanced brightness detection)

### Optional (Vision QA)
- LM Studio running at http://192.168.50.192:1234 (or configured endpoint)
- VLM model loaded (e.g., `qwen/qwen3-vl-8b`)

---

## CI Scripts

Three npm scripts provide CI entrypoints:

### `npm run bookend:ci:core` (Recommended for all CI)

Runs TypeScript compilation, unit tests, and pixel-based regression testing.

```bash
npm run bookend:ci:core
```

**What it executes:**
1. `npx tsc --noEmit` - TypeScript compilation (strict mode)
2. `npx vitest run --reporter=verbose` - Full unit test suite
3. `npm run bookend:regression` - Pixel-based video regression test

**Failure conditions:**
- TypeScript compilation errors (any)
- Unit test failures (any)
- Regression FAIL verdict (pixel avg drop > `regressionDelta` threshold)
- Multi-regression (2+ samples drop > `multiRegressionDelta`)

**Exit code**: 0 = PASS, 1 = FAIL

### `npm run bookend:ci:vision` (Optional, requires VLM)

Runs VLM-based vision quality analysis **with strict coherence threshold gating**.

```bash
npm run bookend:ci:vision
```

**What it executes:**
1. `npm run bookend:vision` - VLM analysis via `scripts/analyze-bookend-vision.ps1`
   - Tightened VLM prompt with explicit artifact/consistency rules
   - Frame-level black-frame and flicker detection
2. `pwsh -File scripts/test-bookend-vision-regression.ps1` - Apply coherence thresholds

**Coherence metrics produced:**
- `overall` (0-100) - weighted quality score
- `focusStability` (0-100) - subject focus clarity
- `artifactSeverity` (0-100, lower is better) - visual artifacts
- `objectConsistency` (0-100) - object persistence
- `hasBlackFrames` (boolean) - model-free black frame detection
- `hasHardFlicker` (boolean) - model-free brightness spike detection

**Failure conditions (from `vision-thresholds.json` v2.0.0):**

| Sample | minOverall | minFocusStability | maxArtifactSeverity | minObjectConsistency |
|--------|------------|-------------------|---------------------|----------------------|
| **001/002/004** | **98** | **100** | **0** | **100** |
| 003-environment | 85 | 75 | 20 | 90 |
| 005-complex | 70 | 80 | 65 | 80 |
| 006-multichar | 94 | 95 | 5 | 95 |
| 007-occlusion | 88 | 85 | 15 | 90 |
| 008-lighting | 90 | 90 | 10 | 92 |
| **Global default** | 80 | 85 | 40 | 85 |

**Hard artifact rules (global):**
- `disallowBlackFrames: true` - Any black frame = FAIL
- `disallowHardFlicker: true` - Any hard flicker = FAIL

**Exit code**: 0 = all PASS/WARN, 1 = any FAIL

**Note**: With strict thresholds (v2.0.0), some current goldens may FAIL. This is intentional—it flags which samples need further prompt/scene refinement.

### `npm run bookend:vision-regression` (Standalone vision gating)

Runs vision QA and applies coherence thresholds. Same as `bookend:ci:vision`.

```bash
npm run bookend:vision-regression
```

---

## Coherence Thresholds

From `data/bookend-golden-samples/vision-thresholds.json`:

| Threshold | Global Default | Description |
|-----------|----------------|-------------|
| `minOverall` | 80 | Below this = FAIL |
| `minFocusStability` | 85 | Below this = FAIL |
| `maxArtifactSeverity` | 40 | Above this = FAIL |
| `minObjectConsistency` | 85 | Below this = FAIL |

**Per-sample overrides** allow relaxing thresholds for samples with known variance:
- `sample-005-complex`: Lower thresholds (75/75/35) due to lens flare artifacts
- `sample-003-environment`: Lower focus (75) due to camera pan
- `sample-007-occlusion`: Lower focus (75) due to occlusion tracking variance

---

## Regression Thresholds

From `baselines.json`:

| Threshold | Value | Description |
|-----------|-------|-------------|
| `fail.startFrameMatch` | 25% | Below this = FAIL |
| `warn.startFrameMatch` | 35% | Below this = WARN |
| `regressionDelta` | 10% | Single-sample drop tolerance |
| `multiRegressionDelta` | 5% | Multi-sample drop tolerance |
| `multiRegressionCount` | 2 | Samples required for multi-regression |

---

## Current Golden Metrics Snapshot

| Sample | Pixel Avg | Vision Overall | Status |
|--------|-----------|----------------|--------|
| 001-geometric | 49.0% | 98% | ✅ PASS |
| 002-character | 51.4% | 98% | ✅ PASS |
| 003-environment | 54.2% | 90% | ✅ PASS |
| 004-motion | 50.0% | 100% | ✅ PASS |
| 005-complex | 54.8% | 82% | ✅ PASS |
| 006-multichar | 55.3% | 90% | ✅ PASS |

**Aggregate Vision Stats:**
- Avg Start Frame Match: 97.5%
- Avg End Frame Match: 94.2%
- Avg Motion Quality: 88.3%
- Avg Prompt Adherence: 92.2%
- Avg Overall: 93%

---

## Sample CI Pipeline (Pseudocode)

```yaml
# Example CI workflow (GitHub Actions style)

jobs:
  bookend-qa-core:
    runs-on: self-hosted  # Requires GPU + ComfyUI
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Start ComfyUI
        run: |
          # Start ComfyUI in background (implementation-specific)
          ./start-comfyui.sh &
          sleep 30  # Wait for startup
      
      - name: Run Bookend QA Core
        run: npm run bookend:ci:core
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: bookend-results
          path: test-results/bookend-regression/

  bookend-qa-vision:
    runs-on: self-hosted  # Requires GPU + LM Studio
    needs: bookend-qa-core
    if: ${{ vars.ENABLE_VISION_QA == 'true' }}  # Optional
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Bookend Vision QA
        run: npm run bookend:ci:vision
        env:
          VLM_ENDPOINT: ${{ secrets.VLM_ENDPOINT }}
```

---

## Troubleshooting

### "Cannot connect to ComfyUI"
- Verify ComfyUI is running: `curl http://localhost:8188/system_stats`
- Check firewall allows port 8188

### "Regression FAIL" verdict
- Check `test-results/bookend-regression/run-*/results.json` for details
- Compare current vs baseline pixel similarity
- Re-run with `npm run bookend:regression` locally to investigate

### "VLM call failed"
- Verify LM Studio is running and VLM model loaded
- Check endpoint: `curl http://192.168.50.192:1234/v1/models`
- VLM crashes under memory pressure; restart LM Studio

### Updating baselines after intentional changes
```bash
pwsh -File scripts/test-bookend-regression.ps1 -UpdateBaselines
```

---

## Related Documentation

- `BOOKEND_QA_DEVELOPER_CARD.md` - Quick reference for developers
- `Testing/E2E/BOOKEND_GOLDEN_README.md` - Full Bookend QA guide
- `Testing/Reports/BOOKEND_QA_VISION_METRICS_20251202.md` - Detailed vision metrics
- `data/bookend-golden-samples/baselines.json` - Baseline definitions

---

## Maintenance

- **Add new sample**: Create `sample-NNN-name/` directory with `context.json`, `expected-scores.json`, then run `pwsh -File scripts/generate-golden-samples.ps1 -Sample sample-NNN-name`
- **Update baseline**: Run `pwsh -File scripts/test-bookend-regression.ps1 -Sample sample-NNN-name -UpdateBaselines`
- **Vision QA thresholds**: Defined in `videoQualityGateService.ts` (do not modify casually)
