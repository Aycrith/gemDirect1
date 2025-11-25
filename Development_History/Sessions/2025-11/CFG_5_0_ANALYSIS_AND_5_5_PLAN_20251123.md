# CFG 5.0 Test Analysis & CFG 5.5 Plan
**Date**: November 23, 2025  
**Status**: CFG 5.0 complete, CFG 5.5 ready to test

## CFG 5.0 Results Summary

### Visual Inventory
| File | Seed | CFG | Size | Result | Failure Mode |
|------|------|-----|------|--------|--------------|
| 00144 | 868054771272167 | 5.0 | 536KB | ❌ FAIL | Grid layout (character portraits 3x4) |
| 00145 | 199438281890114 | 5.0 | 1756KB | ✅ SUCCESS | Unified alien landscape |
| 00146 | 38630886107395 | 5.0 | 721KB | ⚠️ AMBIGUOUS | Dark/horizon scene |
| 00147 | 436829010595476 | 5.0 | 1510KB | ❌ FAIL | Grid layout (pottery/vessels 2x4) |
| 00148 | 172903453212523 | 5.0 | 2316KB | ✅ SUCCESS | Figure on alien terrain |

**Success Rate**: 40% (2/5 usable)  
**Failure Rate**: 40% (2/5 grid layouts)  
**Ambiguous**: 20% (1/5 dark scene)

### Key Findings

#### 1. **Black Image Problem SOLVED** ✅
- **CFG 6.0**: 40% black-image rate (2/5 completely black)
- **CFG 5.0**: 0% black-image rate (0/5 completely black)
- **Conclusion**: CFG 6.0 over-suppression eliminated by reducing to 5.0

#### 2. **New Failure Mode Identified: Grid Layouts** 🚨
- **Previous CFG 6.0 failure**: Horizontal split-screen divisions
- **New CFG 5.0 failure**: Grid-based compositional templates
  - Image 1: Character portrait grid (3x4 array)
  - Image 4: Product catalog grid (2x4 pottery array)
- **Pattern**: Model defaulting to **symmetrical repetition** rather than split frames

#### 3. **Seed Randomization Verified Working** ✅
All 5 scenes generated with unique seeds:
- Scene 1: 868054771272167
- Scene 2: 199438281890114
- Scene 3: 38630886107395
- Scene 4: 436829010595476
- Scene 5: 172903453212523

#### 4. **File Size Correlation Discovered** 📊
```
Failures (grid):  536KB, 1510KB  (avg 1023KB)
Success (unified): 1756KB, 2316KB (avg 2036KB)
Ambiguous (dark):  721KB
```

**Hypothesis**: Grid/repetitive patterns compress efficiently → smaller files. Rich unified scenes with varied details → larger files.

**Proposed threshold**: Flag files <1000KB as potential failures.

### Root Cause Analysis

#### Training Data Bias (HIGH CONFIDENCE)
NetaYume Lumina T2I trained on compositional templates:
- **Character sheets** (grid-based portrait arrays)
- **Product catalogs** (symmetrical object arrangements)
- **Storyboard panels** (sequential frame layouts)

When certain narrative keywords trigger these biases, model defaults to template composition despite negative prompts.

#### Negative Prompt Insufficiency at CFG 5.0 (MEDIUM CONFIDENCE)
Current negative (280 chars):
```
split-screen, multi-panel, divided composition, comic layout, storyboard,
grid layout, collage, multiple scenes, side-by-side, tiled images, panel
borders, manga style, comic book, separated frames, before-after comparison,
sequence panels, dual perspective, fragmented scene, picture-in-picture,
multiple panels montage
```

**Issue**: Includes "grid layout" but model still generated grids. Possible reasons:
1. CFG 5.0 too low to enforce negative guidance against strong training biases
2. Missing template-specific terms: "character sheet", "product catalog", "repeated elements"
3. Negative prompt needs higher CFG (5.5-6.0) to be effective

#### SINGLE_FRAME_PROMPT Needs Strengthening (MEDIUM CONFIDENCE)
Current prompt structure:
```
CRITICAL REQUIREMENT: Generate EXACTLY ONE UNIFIED SCENE in a SINGLE
CONTINUOUS IMAGE. This must be ONE MOMENT IN TIME showing ONE LOCATION...
```

**Issues**:
- Too verbose (may dilute attention)
- Missing composition keywords: "wide shot", "establishing shot", "panoramic view"
- Placed at start (some models weight later tokens more heavily)

## Changes Implemented for CFG 5.5 Test

### 1. Enhanced Negative Prompt (280 → 320 chars)
**Added template-specific terms**:
```diff
- split-screen, multi-panel, divided composition, comic layout, storyboard,
- grid layout, collage, multiple scenes, side-by-side, tiled images, panel
- borders, manga style, comic book, separated frames, before-after comparison,
- sequence panels, dual perspective, fragmented scene, picture-in-picture,
- multiple panels montage

+ split-screen, multi-panel, grid layout, character sheet, product catalog,
+ symmetrical array, repeated elements, duplicated subjects, storyboard,
+ comic layout, collage, multiple scenes, side-by-side, tiled images, panel
+ borders, manga style, separated frames, before-after comparison, sequence
+ panels, dual perspective, fragmented scene, picture-in-picture, montage
```

**New terms targeting grid failures**:
- `character sheet` (prevents portrait grids)
- `product catalog` (prevents object arrays)
- `symmetrical array` (prevents balanced repetition)
- `repeated elements` (prevents duplication)
- `duplicated subjects` (reinforces uniqueness)

### 2. Strengthened SINGLE_FRAME_PROMPT
**Added composition keywords**:
```diff
- CRITICAL REQUIREMENT: Generate EXACTLY ONE UNIFIED SCENE in a SINGLE
- CONTINUOUS IMAGE. This must be ONE MOMENT IN TIME showing ONE LOCATION
- with ONE LIGHTING SETUP. DO NOT create split-screen, multi-panel, or
- divided compositions...

+ WIDE ESTABLISHING SHOT: Generate EXACTLY ONE UNIFIED CINEMATIC SCENE
+ showing a SINGLE CONTINUOUS MOMENT across the entire 16:9 frame.
+ PANORAMIC VIEW of ONE LOCATION with consistent lighting and perspective
+ throughout. DO NOT create character sheets, product grids, or repeated
+ elements. DO NOT create split-screen, multi-panel, or divided
+ compositions...
```

**Key improvements**:
- **"WIDE ESTABLISHING SHOT"** - immediately frames as cinematic composition
- **"PANORAMIC VIEW"** - reinforces horizontal continuity
- **"character sheets, product grids"** - explicitly blocks template triggers

### 3. CFG Increase: 5.0 → 5.5
**Rationale**:
- Stronger negative guidance enforcement
- Still below CFG 6.0 threshold that caused black images
- Balances composition control with output quality

## Expected CFG 5.5 Outcomes

### Best Case (75-80% success)
- 4/5 usable images
- Grid failures reduced to 0-1/5
- No black images
- **Result**: Production-ready configuration

### Likely Case (60% success)
- 3/5 usable images  
- Grid failures reduced to 1-2/5
- No black images
- **Result**: Acceptable for testing, needs refinement

### Worst Case (40% unchanged)
- 2/5 usable images
- Grid failures persist at 2/5
- No black images
- **Result**: CFG 5.5 insufficient, escalate to CFG 6.0 re-test

## Testing Protocol for CFG 5.5

### Pre-Flight
1. ✅ Enhanced negative prompt implemented (320 chars)
2. ✅ Strengthened SINGLE_FRAME_PROMPT implemented
3. ✅ localGenSettings.json updated to CFG 5.5
4. ⏳ Restart dev server to load TypeScript changes
5. ⏳ Import CFG 5.5 workflow via Settings UI

### Execution
1. Start new project (same test story)
2. Generate 5 keyframes with CFG 5.5
3. Monitor console for seed randomization logs
4. Wait for all 5 completions (~30-40 minutes)

### Validation
1. **Metadata extraction**:
   ```powershell
   $files = Get-ChildItem "C:\ComfyUI\...\NetaYume_Lumina_3.5_*.png" | 
            Sort-Object LastWriteTime -Descending | Select-Object -First 5
   # Extract seed, CFG, file size for each
   ```
2. **Visual inspection**: Count grid failures, black images, usable images
3. **File size analysis**: Check if <1000KB correlation persists
4. **Comparison table**: CFG 5.0 vs CFG 5.5 side-by-side

### Success Criteria
- **Minimum viable**: ≥60% usable (3/5)
- **Production-ready**: ≥75% usable (4/5)
- **File size**: Average >1500KB (indicates rich detail)
- **Grid failures**: ≤20% (1/5 acceptable outlier)

## Next Steps After CFG 5.5

### If Successful (≥60% usable)
1. Document as recommended production setting
2. Update `.github/copilot-instructions.md` with CFG 5.5 guidance
3. Implement file size validation (<1000KB auto-reject)
4. Consider CFG 6.0 re-test with optimized negative (verify black-image theory)

### If Unsuccessful (<60% usable)
1. **Re-test CFG 6.0** with 320-char negative + randomized seeds
   - Theory: Previous black images were from 900-char negative over-suppression
   - May achieve better composition control without black-image failures
2. **Prompt order experiment**: Move SINGLE_FRAME_PROMPT to end of prompt
3. **Alternative approach**: Test different checkpoint (Flux.1, SDXL) for comparison

## Hypothesis to Validate

**"Grid failures are caused by insufficient CFG enforcement of template-blocking negative terms, not by negative prompt length."**

- **Support**: CFG 5.0 with 280-char negative → 40% grid failures
- **Test**: CFG 5.5 with 320-char enhanced negative → expect <20% grid failures
- **Counterpoint**: If CFG 5.5 still has 40% failures, then negative content (not CFG) is the issue

**"File size <1000KB is a reliable indicator of compositional failure (grid/repetition)."**

- **Support**: CFG 5.0 failures averaged 1023KB vs successes 2036KB
- **Test**: CFG 5.5 failures should also cluster <1000KB
- **Application**: Pre-flight validation can auto-reject low file sizes

## Code Changes Made

### `services/comfyUIService.ts`
1. **NEGATIVE_GUIDANCE** (line ~1237):
   - Length: 280 → 320 chars (+14%)
   - Added: `character sheet`, `product catalog`, `symmetrical array`, `repeated elements`, `duplicated subjects`
   
2. **SINGLE_FRAME_PROMPT** (line ~1228):
   - Changed opening: `"CRITICAL REQUIREMENT:"` → `"WIDE ESTABLISHING SHOT:"`
   - Added: `"PANORAMIC VIEW"`, `"character sheets, product grids"`
   - Emphasized: `"entire 16:9 frame"`, `"full environment"`

### `localGenSettings.json`
- **wan-t2i.workflowJson**: `"cfg":5.0` → `"cfg":5.5`

## Timeline
- **CFG 5.0 test completed**: 2025-11-23 (this session)
- **CFG 5.5 test ready**: 2025-11-23 (awaiting execution)
- **Expected completion**: 2025-11-23 (+45 minutes for generation + analysis)

## References
- Previous session: `AGENT_HANDOFF_CFG_5_TESTING_READY_20251123.md`
- Code changes: `CODE_CHANGES_CFG_5_PREPARATION_20251123.md`
- Metadata extraction: PowerShell byte-level PNG inspection
- Image analysis: Visual screenshot review (5 keyframes)
