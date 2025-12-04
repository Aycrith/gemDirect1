# Bookend QA Quick Reference - Developer Card

**Last Updated**: December 4, 2025 (PM - Strict Coherence Update)  
**Status**: ✅ Production Ready  
**Baselines Version**: v2.1.0  
**Vision Thresholds Version**: v2.0.0 (strict)

## 30-Second Start

```powershell
# Run all bookend tests
npm run bookend:regression        # Pixel-based regression test
npm run bookend:vision-regression # Vision QA with strict coherence gating
npm run bookend:sweep -- -QuickMode  # Optimize parameters
```

## One-Page Cheat Sheet

### What is Bookend QA?
Automated regression testing for FLF2V (First-Last-Frame to Video) video generation. Tests ensure generated videos match golden keyframe samples at start/end frames.

### Key Files
| File | What It Does |
|------|--------------|
| `scripts/bookend-frame-similarity.ts` | Measures if video matches keyframes (0-100 scale) |
| `scripts/test-bookend-e2e.ps1` | Generate videos + compute similarity |
| `scripts/test-bookend-regression.ps1` | Compare against baselines, PASS/WARN/FAIL |
| `scripts/analyze-bookend-vision.ps1` | VLM analysis + frame-level artifact detection |
| `scripts/test-bookend-vision-regression.ps1` | Apply strict coherence thresholds |
| `scripts/wan-parameter-sweep.ps1` | Find best WAN 2.2 5B settings |
| `data/bookend-golden-samples/` | Reference keyframe pairs (8 samples) |
| `data/bookend-golden-samples/vision-thresholds.json` | Strict coherence thresholds (v2.0.0) |
| `localGenSettings.json` | Configuration (bookendQAMode flag) |

### npm Commands

**Quick Test** (5 min):
```powershell
npm run bookend:e2e
```

**Full Regression** (15 min):
```powershell
npm run bookend:regression
```

**Vision QA with Strict Gating** (10 min):
```powershell
npm run bookend:vision-regression
```

**Optimize Settings** (30+ min):
```powershell
npm run bookend:sweep -- -QuickMode
```

**Direct Frame Analysis**:
```powershell
npm run bookend:similarity -- --video output.mp4 --start start.png --end end.png
```

### Similarity Scores (0-100)
- **90+**: Perfect match ✅
- **80-89**: Good (production OK) ✅
- **70-79**: Degraded (warning) ⚠️
- **<70**: Failed (regression) ❌

### Vision Thresholds (v2.0.0 - Strict)

| Sample | minOverall | Focus | maxArtifacts | ObjConsist |
|--------|------------|-------|--------------|------------|
| 001/002/004 | **98** | **100** | **0** | **100** |
| 003-environment | 85 | 75 | 20 | 90 |
| 005-complex | 70 | 80 | 65 | 80 |
| 006-multichar | 94 | 95 | 5 | 95 |
| 007-occlusion | 88 | 85 | 15 | 90 |
| 008-lighting | 90 | 90 | 10 | 92 |

**Hard Artifact Rules (global):**
- Black frames detected = **FAIL**
- Hard flicker detected = **FAIL**

### Results Location
- **E2E**: `test-results/bookend-e2e/run-<timestamp>/results.json`
- **Regression**: `test-results/bookend-regression/run-<timestamp>/results.json`
- **Vision QA**: `temp/vision-qa-<timestamp>/vision-qa-results.json`
- **Sweep**: `test-results/wan-tuning/sweep-<timestamp>.json`

### Troubleshooting

**"Cannot connect to ComfyUI"**
- Check ComfyUI running: http://localhost:8188
- Verify port 8188 is open

**"No frames copied from video"**
- Check video generated successfully
- Verify ffmpeg installed (`ffmpeg -version`)

**"Timeout waiting for video"**
- Check ComfyUI logs for errors
- Try smaller resolution or fewer frames

**"Seed parameter not working"**
- Must use `-Seed` with E2E script
- Seed = `-1` means random

**"Vision gating FAIL"**
- Check which thresholds were violated
- Simple samples (001/002/004) require near-perfect scores
- Consider relaxing thresholds or improving prompts

### Configuration

**Enable Bookend QA Mode** (optional):
```json
// localGenSettings.json
{
  "bookendQAMode": {
    "enabled": true,
    "enforceKeyframePassthrough": true,
    "overrideAISuggestions": true
  }
}
```

### Advanced Usage

**Fixed seed for reproducibility**:
```powershell
npm run bookend:e2e -- -Seed 42
```

**Custom fail threshold**:
```powershell
npm run bookend:regression -- -FailThreshold 65 -WarnThreshold 80
```

**Test one sample only**:
```powershell
pwsh -File scripts/test-bookend-e2e.ps1 -Sample sample-001-geometric
```

**Full parameter sweep** (not quick mode):
```powershell
npm run bookend:sweep  # Tests 27 configs (30-60 min)
```

### Exit Codes
- **0**: Pass or warn (OK for CI/CD)
- **1**: Fail (regression detected)

### CI & Automation

**CI Entrypoints** (updated 2025-12-04):

| Script | Purpose | Requirements |
|--------|---------|--------------|
| `npm run bookend:ci:core` | TypeScript + unit tests + pixel regression | ComfyUI |
| `npm run bookend:ci:vision` | VLM analysis + **coherence threshold gating** | ComfyUI + LM Studio |
| `npm run bookend:vision-regression` | Standalone vision gating (same as ci:vision) | ComfyUI + LM Studio |

**Quick CI check**:
```powershell
npm run bookend:ci:core  # Full core pipeline (~12 min)
```

**Full CI with vision gating**:
```powershell
npm run bookend:ci:core && npm run bookend:ci:vision  # Add ~3 min for VLM
```

**Vision Gating**: The `bookend:ci:vision` script now enforces coherence thresholds:
- Runs VLM analysis via `bookend:vision`
- Applies thresholds from `data/bookend-golden-samples/vision-thresholds.json`
- Fails CI if any sample violates thresholds (exit code 1)
- Coherence metrics: overall, focusStability, artifactSeverity, objectConsistency

**Documentation**: See `Testing/BOOKEND_QA_CI_NOTES.md` for detailed CI integration guide.

**Current state**:
- Golden samples: 001–008 (8 total), baselines v2.1.0
- All samples passing pixel regression (49–57% avg)
- All samples passing vision QA with coherence gating (78–100% overall)
- Coherence thresholds defined in `vision-thresholds.json`

### Golden Samples
1. **sample-001-geometric**: Spinning top (motion test)
2. **sample-002-character**: Head turn (identity check)
3. **sample-003-environment**: Camera pan (background)
4. **sample-004-motion**: Person walking (motion coherence)
5. **sample-005-complex**: Kitchen scene (complex transitions, known artifacts)
6. **sample-006-multichar**: Coffee cup + barista (depth motion, hardened for object consistency)
7. **sample-007-occlusion**: Person + lamppost (identity through occlusion)
8. **sample-008-lighting**: Desk scene (lighting transition, hardened for artifact prevention)

### Key Metrics
- Frame extraction: ffmpeg-based (reliable)
- Similarity algorithm: Per-pixel RGB diff (0-100)
- Threshold: 90+ excellent, 70+ pass
- Seed support: Optional, enables reproducibility

### Documentation
- **Full Guide**: `Testing/E2E/BOOKEND_GOLDEN_README.md`
- **Details**: `data/bookend-golden-samples/README.md`
- **Summary**: `BOOKEND_QA_INFRASTRUCTURE_SUMMARY_20251202.md`

### What Changed (Phase 0-6)
- ✅ Frame similarity CLI (pixel-level matching)
- ✅ E2E script with -Seed parameter
- ✅ Parameter sweep with workflow patching
- ✅ Regression harness (baseline comparison)
- ✅ npm wrappers (easy CI/CD integration)
- ✅ Complete documentation

### Common Tasks

**Run daily regression test**:
```powershell
npm run bookend:regression
```

**Optimize for RTX 3090**:
```powershell
npm run bookend:sweep -- -QuickMode -VRAMCeiling 20000
```

**Test with custom seed**:
```powershell
npm run bookend:e2e -- -Seed 12345
```

**Analyze single video**:
```powershell
npm run bookend:similarity -- --video gen.mp4 --start key1.png --end key2.png
```

### Support

**Issues with scripts?**
- Check logs in `test-results/bookend-*/`
- Verify ComfyUI: `npm run check:health-helper`
- Read full guide: `Testing/E2E/BOOKEND_GOLDEN_README.md`

**Questions about similarity scores?**
- 0-100 scale (100 = identical)
- Uses per-pixel RGB matching
- First + last frames averaged
- See `BOOKEND_QA_INFRASTRUCTURE_SUMMARY_20251202.md`

---

**TL;DR**: Run `npm run bookend:regression` to test FLF2V quality. Exit 0 = pass, exit 1 = fail. That's it!
