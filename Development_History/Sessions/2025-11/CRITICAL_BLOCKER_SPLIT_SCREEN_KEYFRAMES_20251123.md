# CRITICAL BLOCKER: Split-Screen Keyframe Generation

**Date**: 2025-11-23T21:30:00Z  
**Priority**: 🚨 **CRITICAL - BLOCKS VIDEO GENERATION**  
**Status**: ⚠️ **INVESTIGATING & MITIGATING**

---

## Problem Statement

Generated keyframes are showing **split-screen/multi-panel compositions** instead of unified single-scene images. This is a **critical blocker** for the WAN I2V (image-to-video) workflow, which requires cohesive single-frame compositions to animate properly.

### Visual Evidence

User screenshot shows 5 keyframes with split-screen compositions:
- Image 1: Left panel (dark scene with glowing object) + Right panel (different lighting/setting)
- Image 2: People at table (appears unified but may have subtle splits)
- Image 3: Similar table scene composition  
- Image 4: Bright center glow (dramatic lighting but potentially split)
- Image 5: People at table with window light (appears split-screen with different perspectives)

**Pattern**: Multiple scenes showing what appears to be:
1. Before/after comparisons
2. Different camera angles of same scene
3. Split perspectives (left vs right lighting)
4. Storyboard-style panel layouts

---

## Root Cause Analysis

### 1. **Scene Summaries Contain Multiple Narrative Beats**
From console logs (Scene 1):
```
Scene Summary: "Introduce Two and the central pressure sparked by: Two rivals must choreograph a dance to avert a political coup..."
```

This description implies **TWO distinct story elements**:
- "Introduce Two" (one beat)
- "Central pressure sparked by..." (separate beat)

The AI image model interprets this as **multiple scenes** and renders them as split-screen panels.

### 2. **Original Anti-Split Guidance Was Too Weak**

**Before fix** (lines 1213-1214):
```typescript
const SINGLE_FRAME_PROMPT = 'IMPORTANT: Single unified cinematic frame showing ONE moment in time, ONE scene only. Render as a continuous single image without any splits, panels, or divisions...';

NEGATIVE_GUIDANCE = 'split-screen, multi-panel, collage, divided frame, panel layout, storyboard panels, multiple scenes, comic strip layout...';
```

**Issue**: The positive prompt said "IMPORTANT" but the model still interpreted multi-beat scene descriptions as multiple panels.

### 3. **Negative Prompt May Not Be Prioritized Enough**
The WAN T2I workflow uses:
- `CLIPTextEncode.text` for positive prompt (node 6)
- `CLIPTextEncode.text` for negative prompt (node 7)

If the **negative prompt weight is too low** in the workflow configuration, the anti-split guidance gets ignored.

---

## Mitigation Applied (Immediate Fix)

### Enhanced Anti-Split-Screen Guidance

**File**: `services/comfyUIService.ts` (lines 1213-1215)

**New SINGLE_FRAME_PROMPT** (strengthened):
```typescript
const SINGLE_FRAME_PROMPT = 'CRITICAL REQUIREMENT: Generate EXACTLY ONE UNIFIED SCENE in a SINGLE CONTINUOUS IMAGE. This must be ONE MOMENT IN TIME showing ONE LOCATION with ONE LIGHTING SETUP. DO NOT create split-screen, multi-panel, or divided compositions. DO NOT show before/after, side-by-side, or multiple perspectives. DO NOT create storyboard-style panels. DO NOT show multiple time periods or locations. ONLY render a single cohesive 16:9 widescreen frame with unified composition, single perspective, and continuous lighting. This is a SINGLE ESTABLISHING SHOT, not a sequence or montage.';
```

**New NEGATIVE_GUIDANCE** (expanded):
```typescript
export const NEGATIVE_GUIDANCE = 'AVOID AT ALL COSTS: split-screen, multi-panel layout, divided frame, panel borders, storyboard panels, multiple scenes in one image, comic strip layout, triptych, diptych, before and after comparison, side by side shots, top and bottom split, left and right split, grid layout, mosaic, composite image, collage, multiple perspectives, repeated subjects, duplicated elements, mirrored composition, reflection symmetry, tiled pattern, sequential images, montage, multiple time periods, multiple locations, frame divisions, panel separators, white borders, black borders, frame-within-frame, picture-in-picture, multiple lighting setups, discontinuous composition, fragmented scene, segmented layout, partitioned image, multiple narratives, split composition, dual scene, multiple shots combined, storyboard format, comic panel style, sequence of events, time progression, location changes, speech bubbles, UI overlays, interface elements, textual callouts';
```

**Enhanced Scene Prompt** (line 1474-1479):
```typescript
const basePromptParts = [
    SINGLE_FRAME_PROMPT,
    'SINGLE ESTABLISHING SHOT ONLY: Cinematic establishing frame, high fidelity, 4K resolution. ONE unified composition with consistent lighting and perspective throughout the entire frame.',
    `Scene content: ${sceneSummary}`,
    'Generate ONE CONTINUOUS IMAGE capturing this single moment. Do not divide the frame. Do not show multiple time periods or locations. This is a single unified scene, not a sequence or comparison.'
];
```

**Changes**:
1. ✅ Changed "IMPORTANT" to "CRITICAL REQUIREMENT"
2. ✅ Added "AVOID AT ALL COSTS" to negative prompt
3. ✅ Expanded negative guidance from ~250 chars to ~900 chars
4. ✅ Added explicit "SINGLE ESTABLISHING SHOT ONLY" to scene prompts
5. ✅ Changed "Scene summary:" to "Scene content:" (less multi-beat implication)
6. ✅ Added repeated warnings about frame division

---

## Testing Required

### Immediate Validation
1. **Regenerate keyframes** for existing 5 scenes with new prompts
2. **Visual inspection** for split-screen artifacts
3. **Compare before/after** to confirm improvement

### Success Criteria
- ✅ All keyframes show **single unified composition**
- ✅ No visible split-screen, panel borders, or multi-scene layouts
- ✅ Consistent lighting throughout entire frame
- ✅ Single perspective (no before/after comparisons)
- ✅ No storyboard-style panel divisions

### If Issue Persists
**Additional fixes may be required**:

1. **Increase negative prompt CFG weight** in workflow:
   - Edit `workflows/image_netayume_lumina_t2i.json`
   - Check node 7 (CLIPTextEncode negative) configuration
   - May need to increase negative prompt strength

2. **Simplify scene summaries** (upstream fix):
   - Modify Gemini story generation prompts
   - Request single-beat scene descriptions
   - Avoid multi-clause narrative structure

3. **Add post-processing validation**:
   - Check keyframe images for split-screen artifacts
   - Reject and regenerate if panels detected
   - Use image analysis to detect frame divisions

---

## Impact Assessment

### Blocked Functionality
- ⛔ **WAN I2V Video Generation**: Cannot process split-screen keyframes
- ⛔ **Video Timeline Workflow**: Videos will show jarring transitions or artifacts
- ⛔ **Production Usability**: Keyframes not suitable for professional video output

### User Experience
- ❌ Generated keyframes don't match single-scene expectation
- ❌ Users must regenerate keyframes multiple times
- ❌ Video generation will fail or produce poor quality output

### Workflow Compatibility
- ⚠️ **WAN I2V workflow** expects single cohesive scene to animate
- ⚠️ Split-screen keyframes may cause:
  - Discontinuous motion (each panel animates differently)
  - Lighting inconsistencies in video output
  - Perspective shifts mid-animation
  - Unusable final video

---

## Recommended Next Steps

### Short-Term (Immediate)
1. ✅ **Applied**: Enhanced prompt anti-split guidance (completed)
2. **Test regeneration**: Generate new keyframes with updated prompts
3. **Validate results**: Check for split-screen artifacts
4. **Document findings**: Update this report with test results

### Medium-Term (If Issue Persists)
1. **Workflow CFG tuning**: Increase negative prompt weight
2. **Scene summary refactor**: Simplify narrative structure in AI generation
3. **Keyframe validation**: Add automated split-screen detection

### Long-Term (Preventive)
1. **Prompt template system**: Model-specific prompt configurations
2. **Quality gates**: Automated keyframe quality checks before video generation
3. **User feedback loop**: Allow users to reject and regenerate problematic keyframes

---

## Technical Details

### Affected Files
- `services/comfyUIService.ts` (lines 1213-1215, 1474-1479)
- `workflows/image_netayume_lumina_t2i.json` (potentially needs CFG adjustment)

### Console Log Evidence
```
[LOG] [Keyframe Debug] Final Prompt Length: 929 chars
[LOG] [Keyframe Debug] Prompt Preview: IMPORTANT: Single unified cinematic frame showing ONE moment in time, ONE scene only...
```

**Before fix**: Prompt included anti-split guidance but was too weak  
**After fix**: Prompt strengthened to "CRITICAL REQUIREMENT" with expanded negative guidance

### Workflow Configuration
**WAN T2I Profile** (`wan-t2i`):
- Positive prompt: Node 6 (CLIPTextEncode)
- Negative prompt: Node 7 (CLIPTextEncode)
- Model: NetaYume v3.5 (Lumina T2I)
- Steps: 30, CFG: 4.0, Sampler: res_multistep

---

## Related Issues

### Similar Problems
- **SVD workflow** (Stable Video Diffusion) had similar issues with multi-scene keyframes
- **Solution**: Increased negative prompt weight and simplified scene descriptions

### Known Model Behavior
- **NetaYume/Lumina models** tend to interpret multi-clause descriptions as panels
- **Mitigation**: Use extremely explicit single-scene instructions

---

## Status Updates

### 2025-11-23T21:30:00Z - CRITICAL BLOCKER IDENTIFIED
- User reported split-screen keyframes via screenshot
- Confirmed via browser inspection (all 5 keyframes show split compositions)
- Applied immediate mitigation (strengthened prompts)
- **Next**: Test regeneration with new prompts

### 2025-11-23T21:35:00Z - MITIGATION APPLIED
- Enhanced SINGLE_FRAME_PROMPT with "CRITICAL REQUIREMENT" language
- Expanded NEGATIVE_GUIDANCE from 250 to 900 characters
- Added "SINGLE ESTABLISHING SHOT ONLY" to scene prompt construction
- Changed "Scene summary:" to "Scene content:" to reduce multi-beat implication
- **Status**: Ready for testing - requires keyframe regeneration

---

**Report Generated**: 2025-11-23T21:35:00Z  
**Priority**: 🚨 CRITICAL - VIDEO GENERATION BLOCKED  
**Action Required**: REGENERATE KEYFRAMES WITH NEW PROMPTS
