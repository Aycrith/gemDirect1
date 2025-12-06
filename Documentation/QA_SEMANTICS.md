# QA Semantics: Unified Threshold Logic

**Version**: 1.0.0  
**Last Updated**: 2025-12-05  
**Status**: ✅ Production

This document defines the unified threshold and verdict semantics used across all QA systems in gemDirect1. Following these semantics ensures consistent quality gating in CI, runtime, and UI.

## Overview

The QA system uses a three-tier verdict model:
- **PASS** ✅ - All metrics meet thresholds with comfortable margin
- **WARN** ⚠️ - All metrics pass thresholds but one or more are in the "warning zone"
- **FAIL** ❌ - One or more metrics violate thresholds

## Critical Constants

### WARNING_MARGIN = 5

This constant defines the warning zone around thresholds:

```typescript
// From services/visionThresholdConfig.ts
export const WARNING_MARGIN = 5;
```

**This value MUST remain consistent across:**
| Location | Value | Purpose |
|----------|-------|---------|
| `services/visionThresholdConfig.ts` | `WARNING_MARGIN = 5` | Runtime threshold checks |
| `data/bookend-golden-samples/vision-thresholds.json` | `thresholdStrategy.warnMargin: 5` | CI golden sample tests |
| `scripts/test-bookend-vision-regression.ps1` | `$warnMargin = 5` | CI gating script |
| `services/videoQualityGateService.ts` | Imports from visionThresholdConfig | Video quality gate |
| `components/BookendVisionQAPanel.tsx` | Imports from visionThresholdConfig | UI display |
| `components/UsageDashboard.tsx` | Imports from visionThresholdConfig | Header status widget |

## Threshold Types

### Minimum Thresholds (Higher is Better)

For metrics like `overall`, `focusStability`, `objectConsistency`:

```
FAIL zone │ WARN zone │ PASS zone
──────────┼───────────┼──────────→
          threshold   threshold + margin
          (e.g. 80)   (e.g. 85)
```

| Condition | Verdict |
|-----------|---------|
| `value < threshold` | FAIL |
| `value >= threshold AND value < threshold + margin` | WARN |
| `value >= threshold + margin` | PASS |

**Example with minOverall = 80, margin = 5:**
- 79 → FAIL (below threshold)
- 80 → WARN (at threshold, within margin)
- 84 → WARN (within margin)
- 85 → PASS (at margin boundary)
- 90 → PASS (above margin)

### Maximum Thresholds (Lower is Better)

For metrics like `artifactSeverity`:

```
PASS zone │ WARN zone │ FAIL zone
──────────┼───────────┼──────────→
          threshold   threshold + margin
          - margin    (e.g. 40)
          (e.g. 35)
```

| Condition | Verdict |
|-----------|---------|
| `value > threshold` | FAIL |
| `value <= threshold AND value > threshold - margin` | WARN |
| `value <= threshold - margin` | PASS |

**Example with maxArtifactSeverity = 40, margin = 5:**
- 41 → FAIL (above threshold)
- 40 → WARN (at threshold, within margin)
- 36 → WARN (within margin)
- 35 → PASS (at margin boundary)
- 20 → PASS (below margin)

### Boolean Thresholds (Hard Failures)

For `hasBlackFrames` and `hasHardFlicker`:
- `true` → FAIL (unconditional)
- `false` → PASS (no impact on verdict)

## Default Thresholds

From `vision-thresholds.json` globalDefaults:

```json
{
  "minOverall": 80,
  "minFocusStability": 85,
  "maxArtifactSeverity": 40,
  "minObjectConsistency": 85,
  "disallowBlackFrames": true,
  "disallowHardFlicker": true
}
```

## Semantic Differences: WARN Zone Behavior

### ⚠️ CRITICAL: Dual API Semantics — DO NOT UNIFY

The QA system exposes two distinct APIs for threshold checking. They have **intentionally different** WARN zone semantics. Future developers should **not** attempt to unify these functions.

### `calculateSampleVerdict()` — UI Verdicts

**Purpose**: Display per-sample PASS/WARN/FAIL verdicts in UI components.

**WARN Zone Behavior**: Warns when metric is **ABOVE threshold but within margin** of it.

```
Score:    0 ──────── 75 ─── 80 ─── 85 ─── 100
          │         │       │      │       │
          │   FAIL  │ (fail)│ WARN │ PASS  │
          │         │       │      │       │
          ▼         ▼       ▼      ▼       ▼
                threshold=80    +WARNING_MARGIN(5)
```

A score of 82 (above 80, but below 85) produces **WARN verdict** because it "passed but barely."

**Rationale**: Users benefit from seeing "close to failing" warnings to understand quality trends.

### `checkCoherenceThresholds()` — Violation Detection

**Purpose**: Runtime quality gating and CI pipeline checks.

**Violation Behavior**: Only produces violations when metric is **BELOW threshold**. Violations have severity based on how far below.

```
Score:    0 ──────── 75 ─── 80 ─── 85 ─── 100
          │         │       │              │
          │  error  │ warn  │    (no       │
          │ (viol.) │(viol.)│  violation)  │
          ▼         ▼       ▼              ▼
       threshold-WARN    threshold=80
              =75
```

A score of 82 produces **no violation** (passes cleanly). A score of 77 produces a **warning-severity violation**.

**Rationale**: Runtime gating needs clear pass/fail decisions without false-positive violations.

### Summary Comparison

| Aspect | `calculateSampleVerdict()` | `checkCoherenceThresholds()` |
|--------|---------------------------|------------------------------|
| WARN for passing values? | **Yes** (above threshold, within margin) | **No** |
| WARN for failing values? | No (those are FAIL) | **Yes** (below threshold, within margin) |
| Primary consumer | UI components | Runtime services, CI |
| Output | `{ verdict, failures[], warnings[] }` | `{ passes, violations[], decision }` |

### Why Two APIs?

1. **UI verdicts need nuance**: Users benefit from proactive "almost failing" warnings.
2. **Runtime gating needs binary decisions**: The quality gate needs clear pass/fail without false positives.
3. **Test isolation**: Existing tests encode these distinct behaviors; unifying would break semantics.

**Use `calculateSampleVerdict` for:**
- UI verdict display (BookendVisionQAPanel, QualityStatusWidget)
- User-facing quality summaries
- Warning users about "at risk" samples

**Use `checkCoherenceThresholds` for:**
- Runtime video quality gating (videoQualityGateService)
- ComfyUI post-generation validation
- CI pipeline coherence checks
- Detailed violation reporting

## Integration Points

### 1. Vision QA Panel (UI)

```typescript
// components/BookendVisionQAPanel.tsx
import { calculateSampleVerdict, WARNING_MARGIN } from '../services/visionThresholdConfig';

const verdictResult = calculateSampleVerdict(metrics, thresholds, warnMargin);
```

### 2. Quality Status Widget (Header)

```typescript
// components/UsageDashboard.tsx (QualityStatusWidget)
import { calculateSampleVerdict, WARNING_MARGIN } from '../services/visionThresholdConfig';

const verdictResult = calculateSampleVerdict(metrics, thresholds, warnMargin);
```

### 3. Video Quality Gate (Runtime)

```typescript
// services/videoQualityGateService.ts
import { WARNING_MARGIN } from './visionThresholdConfig';
// Uses imported margin for consistency
```

### 4. CI Golden Sample Tests

```powershell
# scripts/test-bookend-vision-regression.ps1
$warnMargin = 5  # Must match WARNING_MARGIN
```

## Preflight Status

The keyframe pair analysis preflight now stores results in `LocalGenerationStatus.preflightResult`:

```typescript
interface PreflightResult {
    ran: boolean;           // Whether analysis ran
    passed?: boolean;       // Pass/Fail (if ran)
    reason?: string;        // Skip or failure reason
    timestamp?: number;     // When analysis ran
    scores?: {
        characterMatch?: number;
        environmentMatch?: number;
        cameraMatch?: number;
        overallContinuity?: number;
    };
}
```

This is displayed in the `LocalGenerationStatus` component as a `PreflightBadge`.

## Testing

Run threshold tests:
```bash
npx vitest run services/visionThresholdConfig.test.ts
```

Tests cover:
- WARNING_MARGIN constant value
- Threshold defaults matching vision-thresholds.json
- PASS/WARN/FAIL edge cases for min thresholds
- PASS/WARN/FAIL edge cases for max thresholds
- Sample verdict calculation with all metrics
- Boolean threshold handling (black frames, flicker)
- Custom warn margin behavior
- Boundary value tests (0, 100, exact threshold)

## Maintenance

When modifying threshold logic:

1. **Update the source of truth first**: `services/visionThresholdConfig.ts`
2. **Run tests**: `npx vitest run services/visionThresholdConfig.test.ts`
3. **Update CI if needed**: `scripts/test-bookend-vision-regression.ps1`
4. **Update this document** with any semantic changes
5. **Consider backward compatibility** - existing QA results should remain valid

## Related Files

| File | Purpose |
|------|---------|
| `services/visionThresholdConfig.ts` | Unified threshold constants and functions |
| `services/videoQualityGateService.ts` | Runtime video quality gate |
| `services/keyframePairAnalysisService.ts` | Keyframe pair continuity analysis |
| `components/BookendVisionQAPanel.tsx` | Vision QA results display |
| `components/UsageDashboard.tsx` | Quality status widget |
| `components/LocalGenerationStatus.tsx` | Preflight badge display |
| `data/bookend-golden-samples/vision-thresholds.json` | CI threshold config |
| `scripts/test-bookend-vision-regression.ps1` | CI gating script |
| `types.ts` | PreflightResult type definition |
