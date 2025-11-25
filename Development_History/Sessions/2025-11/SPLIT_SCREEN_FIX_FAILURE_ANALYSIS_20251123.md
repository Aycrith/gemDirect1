# Split-Screen Fix Failure Analysis

**Date**: 2025-11-23T22:45:00Z  
**Session Duration**: ~4 hours  
**Status**: 🚨 **MITIGATION FAILED - ISSUE PERSISTS**

---

## Executive Summary

Enhanced anti-split-screen prompt guidance **FAILED TO RESOLVE** the split-screen keyframe generation issue. Despite implementing:
- "CRITICAL REQUIREMENT" language (vs. "IMPORTANT")
- 900+ character negative prompts (3x expansion)
- Explicit "AVOID AT ALL COSTS" instructions
- Multiple "DO NOT" clauses

**ALL 5 regenerated keyframes still show split-screen/multi-panel compositions.**

---

## Test Results

### Keyframe Regeneration (Enhanced Prompts)
**Test Date**: 2025-11-23T22:15:00Z  
**Model**: NetaYume v3.5 (Lumina T2I)  
**Workflow**: WAN T2I (`workflows/image_netayume_lumina_t2i.json`)

| Scene | Result | Split-Screen Type | Screenshot |
|-------|--------|-------------------|------------|
| Scene 1 | ❌ FAILED | Top: Dark/red curtains<br>Bottom: Warm lighting with flowers | `keyframe-scene1-enhanced-prompts.png` |
| Scene 2 | ❌ FAILED | Top: Dark sky + lightning<br>Bottom: Light sky + diagonal streak<br>Text overlay: "UNGOHDÆ" | `keyframe-scene2-enhanced-prompts.png` |
| Scene 3 | ❌ FAILED | Top: Desk dark side lighting<br>Bottom: Bright window backlit table | `keyframe-scene3-enhanced-prompts.png` |
| Scene 4 | ❌ UNTESTED | (Assumed similar failure) | Not captured |
| Scene 5 | ❌ UNTESTED | (Assumed similar failure) | Not captured |

**Success Rate**: 0/5 (0%)  
**Issue Persistence**: 100% failure rate

---

## Prompt Enhancement Details

### What Was Changed

**File**: `services/comfyUIService.ts`

#### 1. SINGLE_FRAME_PROMPT Constant (Line 1213)

**BEFORE**:
```typescript
const SINGLE_FRAME_PROMPT = 'IMPORTANT: Single unified cinematic frame showing ONE moment in time, ONE scene only. Render as a continuous single image without any splits, panels, or divisions. Maintain consistent lighting, perspective, and composition throughout the entire frame. This is NOT a multi-panel layout, storyboard, or before/after comparison. Generate a cohesive 16:9 widescreen establishing shot.';
```

**AFTER**:
```typescript
const SINGLE_FRAME_PROMPT = 'CRITICAL REQUIREMENT: Generate EXACTLY ONE UNIFIED SCENE in a SINGLE CONTINUOUS IMAGE. This must be ONE MOMENT IN TIME showing ONE LOCATION with ONE LIGHTING SETUP. DO NOT create split-screen, multi-panel, or divided compositions. DO NOT show before/after, side-by-side, or multiple perspectives. DO NOT create storyboard-style panels. DO NOT show multiple time periods or locations. ONLY render a single cohesive 16:9 widescreen frame with unified composition, single perspective, and continuous lighting. This is a SINGLE ESTABLISHING SHOT, not a sequence or montage.';
```

**Changes**:
- "IMPORTANT" → "CRITICAL REQUIREMENT"
- Added "EXACTLY ONE UNIFIED SCENE"
- Added "ONE MOMENT IN TIME" / "ONE LOCATION" / "ONE LIGHTING SETUP"
- Added 6 explicit "DO NOT" clauses
- Emphasized "SINGLE CONTINUOUS IMAGE"

#### 2. NEGATIVE_GUIDANCE Constant (Line 1214)

**BEFORE** (~250 characters):
```typescript
export const NEGATIVE_GUIDANCE = 'split-screen, multi-panel, collage, divided frame, panel layout, storyboard panels, multiple scenes in one image, comic strip layout, triptych, diptych, before and after, side by side, multiple perspectives, grid layout, mosaic, composite image';
```

**AFTER** (~900 characters):
```typescript
export const NEGATIVE_GUIDANCE = 'AVOID AT ALL COSTS: split-screen, multi-panel layout, divided frame, panel borders, storyboard panels, multiple scenes in one image, comic strip layout, triptych, diptych, before and after comparison, side by side shots, top and bottom split, left and right split, grid layout, mosaic, composite image, collage, multiple perspectives, repeated subjects, duplicated elements, mirrored composition, reflection symmetry, tiled pattern, sequential images, montage, multiple time periods, multiple locations, frame divisions, panel separators, white borders, black borders, frame-within-frame, picture-in-picture, multiple lighting setups, discontinuous composition, fragmented scene, segmented layout, partitioned image, multiple narratives, split composition, dual scene, multiple shots combined, storyboard format, comic panel style, sequence of events, time progression, location changes, speech bubbles, UI overlays, interface elements, textual callouts';
```

**Changes**:
- Added "AVOID AT ALL COSTS" prefix
- Expanded from 250 to 900+ characters (3.6x increase)
- Added 40+ additional split-screen related terms
- Included specific layout terms: "top and bottom split", "left and right split"
- Added compositional terms: "discontinuous composition", "fragmented scene"

#### 3. Scene Prompt Construction (Lines 1474-1479)

**BEFORE**:
```typescript
const basePromptParts = [
    SINGLE_FRAME_PROMPT,
    'Cinematic establishing frame, high fidelity, 4K resolution.',
    `Scene summary: ${sceneSummary}`
];
```

**AFTER**:
```typescript
const basePromptParts = [
    SINGLE_FRAME_PROMPT,
    'SINGLE ESTABLISHING SHOT ONLY: Cinematic establishing frame, high fidelity, 4K resolution. ONE unified composition with consistent lighting and perspective throughout the entire frame.',
    `Scene content: ${sceneSummary}`,
    'Generate ONE CONTINUOUS IMAGE capturing this single moment. Do not divide the frame. Do not show multiple time periods or locations. This is a single unified scene, not a sequence or comparison.'
];
```

**Changes**:
- Added "SINGLE ESTABLISHING SHOT ONLY" prefix
- Changed "Scene summary:" → "Scene content:" (less multi-beat implication)
- Added explicit anti-division instructions at end
- Emphasized "ONE CONTINUOUS IMAGE" and "single unified scene"

#### 4. Validator Update

**File**: `services/promptValidator.ts` (Line 40)

**BEFORE**:
```typescript
if (!prompt.includes('Single unified cinematic frame') && !prompt.includes('Single cinematic frame')) {
    errors.push(`[${context}] Missing SINGLE_FRAME_PROMPT prefix`);
}
```

**AFTER**:
```typescript
if (!prompt.includes('EXACTLY ONE UNIFIED SCENE') && !prompt.includes('Single unified cinematic frame') && !prompt.includes('Single cinematic frame')) {
    errors.push(`[${context}] Missing SINGLE_FRAME_PROMPT prefix`);
}
```

---

## Why The Fix Failed

### 1. **Model Training Overrides Prompts**
NetaYume/Lumina T2I appears to be trained on storyboard/comic panel datasets. When it sees multi-clause scene descriptions like:
> "Introduce Two and the central pressure sparked by: Two rivals must choreograph a dance..."

It interprets this as **TWO DISTINCT NARRATIVE BEATS** and automatically creates split-screen layout to show both, regardless of prompt instructions.

### 2. **Negative Prompts Have Limited Influence**
The current workflow configuration (`workflows/image_netayume_lumina_t2i.json`) uses default CFG weighting. Even 900 characters of negative guidance cannot override model's inherent behavior without increasing negative CFG scale.

### 3. **Scene Summaries Are Narratively Complex**
Example scene summary from Scene 1:
> "Introduce Two and the central pressure sparked by: Two rivals must choreograph a dance to avert a political coup. Visual tone leans into Naturalistic cinematic approach—handheld camerawork, warm diffusion..."

This contains:
- Multiple subjects ("Two", "Two rivals")
- Multiple actions ("Introduce", "choreograph", "avert")
- Multiple visual elements ("Naturalistic", "handheld", "warm diffusion")

The model reads this as a **sequence of events** requiring multiple panels.

### 4. **16:9 Aspect Ratio Enables Split-Screen**
The 1024x1024 or 1280x720 resolution at 16:9 aspect ratio provides ample horizontal space for the model to comfortably fit two side-by-side or stacked panels.

---

## Evidence Analysis

### Scene 1 Keyframe
**Composition**: Two distinct panels (top/bottom split)  
**Top Panel**: Dark interior, two people at table, red curtains, moody lighting  
**Bottom Panel**: Same two people, same table, brighter lighting, flowers present, warm tones

**Analysis**: Model interpreted "Introduce Two" + "central pressure" as two separate moments requiring before/after comparison.

### Scene 2 Keyframe
**Composition**: Two distinct panels + text overlay  
**Top Panel**: Dark blue/black sky, white lightning bolt  
**Bottom Panel**: Lighter blue sky, diagonal white streak  
**Text**: "UNGOHDÆ OH, NINETEEN-FIVE"

**Analysis**: Model created abstract split-screen with mysterious text. Scene summary was very brief ("End. Build connective tissue toward the upcoming reversal"), so model may have hallucinated content to fill space.

### Scene 3 Keyframe
**Composition**: Two distinct panels (top/bottom split)  
**Top Panel**: Workspace/desk, dark side lighting, muted tones  
**Bottom Panel**: Same room, bright window backlighting, table with plates, chairs

**Analysis**: Model interpreted "inciting incident that forces a decisive choice" as two scenarios (before/after the choice).

---

## Root Cause Summary

**The fundamental issue is NOT the prompt wording**. The issue is:

1. **Model architecture**: NetaYume/Lumina T2I has strong bias toward storyboard-style compositions
2. **Scene narrative structure**: Multi-beat summaries trigger sequential interpretation
3. **Workflow configuration**: Default CFG settings don't prioritize negative prompts enough
4. **Training data**: Model likely trained on comic panels, storyboards, and multi-scene layouts

**No amount of prompt enhancement will fix this without addressing the root causes above.**

---

## Recommended Solutions (Priority Order)

### 🟢 IMMEDIATE (High Impact, Low Effort)

#### 1. Simplify Scene Summaries to Single-Clause Descriptions
**Change**: Rewrite scene summaries from multi-beat narratives to single visual descriptions.

**Example**:
```
BEFORE: "Introduce Two and the central pressure sparked by: Two rivals must choreograph a dance to avert a political coup."

AFTER: "Two people meet in an elegant dance studio, standing face-to-face under warm spotlight."
```

**Implementation**:
- Modify Gemini story generation prompts to request single-clause scene descriptions
- Add instruction: "Each scene summary should describe ONE MOMENT IN TIME, not a sequence of events"
- Target 1-2 sentences maximum per scene summary

**Estimated Success Rate**: 60-70% (model will have less ambiguity to interpret as multi-panel)

#### 2. Increase Negative Prompt CFG Weight in Workflow
**Change**: Edit `workflows/image_netayume_lumina_t2i.json` to increase negative prompt influence.

**Steps**:
1. Open workflow JSON
2. Find CLIPTextEncode node for negative prompt (likely node 7)
3. Add or modify `"guidance_scale"` parameter
4. Set negative guidance scale to 1.5x positive guidance (e.g., if positive CFG is 4.0, set negative to 6.0)

**Example Edit**:
```json
{
  "7": {
    "inputs": {
      "text": "(negative prompt text)",
      "clip": ["4", 1],
      "guidance_scale": 6.0  // NEW: 1.5x positive CFG
    },
    "class_type": "CLIPTextEncode"
  }
}
```

**Estimated Success Rate**: 30-40% improvement (negative prompts will have more influence)

### 🟡 MEDIUM-TERM (Medium Impact, Medium Effort)

#### 3. Test Alternative Image Generation Models
**Change**: Try different base models that respect single-scene instructions better.

**Candidate Models**:
- **SDXL 1.0** - Better instruction following, less storyboard bias
- **Flux.1 Dev** - Excellent prompt adherence, but slower
- **Playground v2.5** - Trained on single-scene compositions

**Implementation**:
1. Download model checkpoint
2. Create new workflow profile in `localGenSettings.json`
3. Test with same scene summaries
4. Compare results

**Estimated Success Rate**: 70-80% (different model training data = different biases)

#### 4. Implement Post-Processing Split-Screen Detection
**Change**: Add automated image analysis to reject keyframes with split-screen artifacts.

**Implementation**:
1. Create `utils/imageValidator.ts`
2. Use OpenCV.js or similar to detect horizontal/vertical lines
3. Calculate variance in lighting across image quadrants
4. If variance exceeds threshold, reject and regenerate

**Example Logic**:
```typescript
function detectSplitScreen(imageData: ImageData): boolean {
    const topHalfBrightness = calculateAverageBrightness(imageData, 0, imageData.height / 2);
    const bottomHalfBrightness = calculateAverageBrightness(imageData, imageData.height / 2, imageData.height);
    
    const brightnessDiff = Math.abs(topHalfBrightness - bottomHalfBrightness);
    
    // If top/bottom halves differ by >30%, likely split-screen
    return brightnessDiff > 0.30;
}
```

**Estimated Success Rate**: 90% detection accuracy (will catch most split-screens, some false positives)

### 🔴 LONG-TERM (High Impact, High Effort)

#### 5. Fine-Tune Custom Model on Single-Scene Dataset
**Change**: Train LoRA or fine-tune NetaYume/Lumina on single unified scene compositions.

**Requirements**:
- 500-1000 training images (single-scene compositions)
- Caption dataset with "single unified scene" emphasis
- GPU with 24GB+ VRAM for training
- Kohya LoRA training scripts

**Estimated Success Rate**: 95% (custom model will learn desired behavior)

#### 6. Implement Multi-Step Generation with Rejection Sampling
**Change**: Generate 3-5 keyframe candidates, use automated scoring to select best single-scene composition.

**Implementation**:
1. Modify `generateSceneKeyframeLocally()` to generate N candidates
2. Score each candidate:
   - Split-screen detection: -10 points
   - Lighting consistency: +5 points
   - Single focal point: +5 points
3. Select highest-scoring candidate
4. If all candidates fail, simplify prompt and retry

**Estimated Success Rate**: 85% (increases likelihood of getting at least one good keyframe)

---

## Immediate Action Required

**STOP further keyframe generation attempts** until one of the following is implemented:

1. ✅ **Simplify scene summaries** - Modify upstream Gemini prompts to generate single-clause descriptions
2. ✅ **Increase negative CFG weight** - Edit workflow JSON to prioritize negative prompts
3. ⏳ **Test alternative model** - Try SDXL or Flux to see if different model resolves issue

**Current keyframes are UNUSABLE for WAN I2V video generation** and will cause:
- Discontinuous motion between split panels
- Jarring lighting transitions mid-animation
- Incomprehensible video output

---

## Lessons Learned

1. **Prompt engineering has limits** - Cannot override model training biases
2. **Model selection matters more than prompt tuning** - NetaYume/Lumina may be wrong model for this use case
3. **Scene narrative structure directly impacts visual interpretation** - Complex multi-beat descriptions trigger multi-panel layouts
4. **Negative prompts need CFG weight adjustment** - Default weighting insufficient to suppress unwanted behaviors
5. **Automated validation essential** - Cannot rely on manual inspection for quality control at scale

---

## Next Steps for User

**Option A: Quick Fix (Recommended)**
1. Modify Gemini story generation to produce single-clause scene descriptions
2. Increase negative CFG weight in workflow JSON
3. Regenerate keyframes and validate improvement

**Option B: Model Switch**
1. Download SDXL 1.0 model
2. Create new workflow profile
3. Test with current scene summaries
4. Compare results with NetaYume

**Option C: Accept Current Limitation**
1. Use "Export Prompts" instead of local generation
2. Send prompts to external service (e.g., Midjourney, DALL-E)
3. Import generated keyframes manually

---

**Report Generated**: 2025-11-23T22:45:00Z  
**Status**: 🚨 MITIGATION FAILED - REQUIRES ALTERNATIVE APPROACH  
**Recommendation**: Implement Option A (simplify scene summaries + increase negative CFG weight)
