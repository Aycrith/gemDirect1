# Bookend Golden Samples

This directory contains reference keyframe pairs and expected quality baselines for regression testing the bookend video generation pipeline.

## Directory Structure

```
bookend-golden-samples/
├── README.md                    # This file
├── baselines.json               # Expected quality scores for each sample (v2.0.0)
├── sample-001-geometric/        # Simple geometric shapes test ✅ READY
│   ├── start.png                # Start keyframe image
│   ├── end.png                  # End keyframe image
│   ├── context.json             # Shot/scene context for generation
│   └── expected-scores.json     # Expected quality thresholds
├── sample-002-character/        # Character consistency test ✅ READY
│   ├── start.png
│   ├── end.png
│   ├── context.json
│   └── expected-scores.json
├── sample-003-environment/      # Environment/background test ✅ READY
│   ├── start.png
│   ├── end.png
│   ├── context.json
│   └── expected-scores.json
├── sample-004-motion/           # Motion trajectory test ✅ READY
│   ├── start.png
│   ├── end.png
│   ├── context.json
│   └── expected-scores.json
├── sample-005-complex/          # Combined character + environment + motion ✅ READY (hardened 2025-12-03)
│   ├── start.png
│   ├── end.png
│   ├── context.json
│   └── expected-scores.json
├── sample-006-multichar/        # Depth motion test ✅ READY
│   ├── start.png
│   ├── end.png
│   ├── context.json
│   └── expected-scores.json
├── sample-007-occlusion/        # Identity through occlusion test ✅ READY (added 2025-12-03)
│   ├── start.png
│   ├── end.png
│   ├── context.json
│   └── expected-scores.json
└── sample-008-lighting/         # Lighting transition test ✅ READY (added 2025-12-03)
    ├── start.png
    ├── end.png
    ├── context.json
    └── expected-scores.json
```

## Sample Types

### 1. Geometric (sample-001)
- **Purpose**: Test basic frame matching with simple rotation motion
- **Content**: Colorful spinning top toy rotating on wooden table
- **Baseline**: avg=49.0%, vision=98%

### 2. Character (sample-002)
- **Purpose**: Test character identity preservation
- **Content**: Single character with distinctive features (red hair, green eyes)
- **Baseline**: avg=51.4%, vision=100%

### 3. Environment (sample-003)
- **Purpose**: Test background/setting consistency during camera pan
- **Content**: Detailed cafe interior with slow horizontal pan
- **Baseline**: avg=54.2%, vision=89%

### 4. Motion (sample-004)
- **Purpose**: Test motion fluidity and temporal consistency
- **Content**: Person walking across frame (simple outdoor path)
- **Baseline**: avg=50.0%, vision=100%

### 5. Complex (sample-005)
- **Purpose**: Full integration test with multiple elements
- **Content**: Kitchen scene with time-lapse style lighting transition
- **Baseline**: avg=49.3%, vision=83%
- **Note**: Hardened 2025-12-03 with explicit object descriptions

### 6. Multichar (sample-006)
- **Purpose**: Test depth motion with foreground/background separation
- **Content**: Coffee cup in focus with barista moving in background
- **Baseline**: avg=55.3%, vision=97%

### 7. Occlusion (sample-007) ⭐ NEW
- **Purpose**: Test identity consistency through occlusion
- **Content**: Person walks behind lamppost and re-emerges
- **Baseline**: avg=51.5%, vision=91%

### 8. Lighting (sample-008) ⭐ NEW
- **Purpose**: Test stability under dramatic lighting changes
- **Content**: Daylight fades as desk lamp becomes dominant
- **Baseline**: avg=53.0%, vision=89%

## Creating New Samples

1. Generate keyframe pair using the keyframe generation workflow
2. Save as PNG in new sample directory
3. Create `context.json` with scene/shot metadata
4. Define `expected-scores.json` with quality thresholds
5. Run regression suite with `-UpdateBaselines` to establish baseline
6. Entry auto-added to `baselines.json`

## Usage

```powershell
# Run regression suite (compares against existing baselines)
npm run bookend:regression

# Or directly:
pwsh -File scripts/test-bookend-regression.ps1

# Update baselines after confirmed improvements (creates new baseline values)
pwsh -File scripts/test-bookend-regression.ps1 -UpdateBaselines
```

## Quality Thresholds

Current thresholds (calibrated for FLF2V model characteristics):

| Metric | Pass | Warn | Fail |
|--------|------|------|------|
| Start Frame Match | ≥35% | ≥25% | <25% |
| End Frame Match | ≥35% | ≥25% | <25% |

**Note**: FLF2V produces ~35-55% pixel similarity even with correct endpoint preservation due to model characteristics. Thresholds are calibrated accordingly.

## Regression Detection

A regression is detected when:
1. Any score drops below its "Fail" threshold (25% for frame match)
2. Any score drops more than 10 points from baseline (`regressionDelta`)
3. Multiple scores (≥2) drop more than 5 points from baseline (`multiRegressionDelta`)

Regressions block merges until investigated and resolved.
