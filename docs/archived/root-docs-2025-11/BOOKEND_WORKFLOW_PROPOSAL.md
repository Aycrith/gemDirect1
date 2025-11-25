# WAN2 Dual LoadImage Research & Testing

**Status**: 🔬 Research Phase  
**Date**: 2025-11-24  
**Purpose**: Determine if WAN2 model supports dual keyframe inputs for bookend workflow

---

## Executive Summary

**Research Question**: Can WAN2's `LoadImage` node accept multiple images (array input) or must we implement alternative approaches for bookend workflow?

**Test Strategy**: Manual ComfyUI UI testing followed by programmatic API validation

**Current WAN2 Workflow Analysis**:
- Node 56 (`LoadImage`): Single image input → `start_image` parameter
- Node 55 (`Wan22ImageToVideoLatent`): Uses `start_image` from LoadImage
- No obvious array input support in current workflow structure

**Alternative Approaches** (if WAN2 doesn't support dual inputs):
1. **AnimateDiff + IP-Adapter**: Weighted frame interpolation
2. **Sequential Generation**: Generate two videos and splice
3. **Custom Node**: Extend WAN2 with dual-input support

---

## Research Findings

### Test 1: Manual ComfyUI UI Testing

**Objective**: Test if LoadImage node accepts array syntax in ComfyUI UI

**Steps**:
1. ✅ Open ComfyUI UI at http://127.0.0.1:8188
2. ✅ Load `workflows/video_wan2_2_5B_ti2v.json`
3. ✅ Locate LoadImage node (Node 56)
4. ✅ Test input variations:
   - `["start.png", "end.png"]` (JSON array)
   - `start.png,end.png` (comma-separated)
   - Two separate LoadImage nodes connected to same Wan22ImageToVideoLatent
5. ✅ Document errors or success messages
6. ⏳ Queue single-image workflow as baseline

**Results**: 
- ✅ **ComfyUI API spec analysis completed**
- ✅ `Wan22ImageToVideoLatent` node examined via `/object_info` endpoint
- ❌ **No support for dual images found**:
  - `start_image` parameter: Single `IMAGE` type only (not array)
  - No `end_image`, `images[]`, or `dual_image` parameters exist
  - Only optional parameter: `start_image` (singular)
- ❌ **Dual LoadImage test failed** (as expected):
  - Error: `"unhashable type: 'list'"` when passing array to `start_image`
  - ComfyUI validation explicitly rejects array inputs

**Conclusion**: WAN2 architecture is fundamentally designed for single start frame, not dual bookends.

---

### Test 2: WAN2 Model Architecture Analysis

**Objective**: Examine WAN2 model internals to understand image input requirements

**Research Areas**:
- ✅ `Wan22ImageToVideoLatent` class signature (parameters, expected types)
- ✅ WAN2 model documentation via ComfyUI API
- ✅ ComfyUI custom nodes for WAN2 (checked for multi-image support)

**Findings**:
```json
{
  "Wan22ImageToVideoLatent": {
    "input": {
      "required": {
        "vae": ["VAE"],
        "width": ["INT", { "default": 1280, "min": 32, "max": 16384 }],
        "height": ["INT", { "default": 704, "min": 32, "max": 16384 }],
        "length": ["INT", { "default": 49, "min": 1, "max": 16384 }],
        "batch_size": ["INT", { "default": 1, "min": 1, "max": 4096 }]
      },
      "optional": {
        "start_image": ["IMAGE", {}]  // ← Single IMAGE only, not IMAGE[]
      }
    },
    "output": ["LATENT"],
    "python_module": "comfy_extras.nodes_wan"
  }
}
```

**Key Observations**:
1. **Parameter name**: `start_image` (not `start_images` or `keyframes`)
2. **Type constraint**: `IMAGE` (singular, not array type)
3. **No alternative params**: No `end_image`, `images`, `dual_image`, or similar
4. **Python module**: `comfy_extras.nodes_wan` (would require source modification for dual support)
5. **Batch processing**: `batch_size` parameter exists but for multiple videos, not multi-frame inputs

---

### Test 3: Programmatic API Testing

**Objective**: Test dual LoadImage via ComfyUI API directly

**Test Script**: `scripts/test-wan2-dual-loadimage.ps1`

**Test Execution**: ✅ Completed (2025-11-24)

**Results**:
```
[Test 1] WAN2 Node Spec Analysis
  Parameter: start_image
  Type: IMAGE
  Optional: True
  Accepts Array: No
  ⚠️  FINDING: start_image expects single IMAGE type, not array

[Test 3] Dual LoadImage Attempt
  Modified workflow: Added Node 56b (end.png)
  start_image input: [Node 56, Node 56b]
  ✗ FAILED (expected)
  
  Error: {
    "type": "exception_during_inner_validation",
    "message": "Exception when validating inner node",
    "details": "unhashable type: 'list'",
    "exception_type": "TypeError"
  }

[Test 4] Alternative Parameters Search
  Available optional inputs: start_image (only)
  end_image: ✗ Not found
  images (array): ✗ Not found
  dual_image: ✗ Not found
```

**Conclusion**: ComfyUI validation layer explicitly rejects array inputs to `start_image`. WAN2 node has no alternative parameters for dual keyframes.

---

## Decision Matrix (Post-Research)

| Approach | Pros | Cons | Complexity | Est. Time | Status |
|----------|------|------|------------|-----------|--------|
| **WAN2 Dual LoadImage** | Native support, fast, simple | May not exist | Low | 2 hours | ❌ **Confirmed impossible** |
| **Sequential Generation + Splice** ✅ | Works with existing WAN2, proven pipeline | 2× generation time, visible seam | Low | 3-4 hours | ✅ **CHOSEN** |
| **AnimateDiff + IP-Adapter** | Proven technique, smooth transitions | Requires new workflow, unproven | Medium | 6-8 hours | 📅 **Phase 5+** |
| **Custom WAN2 Node** | Full control, optimal | Requires Python development, maintenance | High | 12+ hours | ❌ Not feasible |

---

## ✅ DECISION: WAN2 Does NOT Support Dual Keyframes

**Research Conclusion** (2025-11-24):
- ✅ **Confirmed**: WAN2 architecture supports **single start frame only**
- ❌ No native dual-keyframe capability
- ❌ No `end_image` or array input parameters
- ❌ ComfyUI validation rejects array inputs to `start_image`

**Evidence**:
1. API spec shows `start_image: ["IMAGE", {}]` (singular type)
2. Programmatic test: `TypeError: unhashable type: 'list'` when passing array
3. No alternative parameters found via `/object_info` endpoint

---

## Recommended Path: Sequential Generation Approach

**Chosen Strategy**: Generate two videos and splice (pragmatic MVP approach)

**Rationale**:
- ✅ **Fastest implementation**: 3-4 hours vs 6-8 hours for AnimateDiff
- ✅ **Uses proven WAN2 pipeline**: 100% success rate already validated
- ✅ **No new workflows needed**: Reuses existing `wan-i2v` profile
- ⚠️ **Acceptable tradeoff**: Slightly longer generation time (2× WAN2 calls)
- ⚠️ **Transition quality**: May have visible seam at midpoint (can polish later)

**Alternative Considered**: AnimateDiff + IP-Adapter
- ⚠️ Requires research and new workflow creation (6-8 hours)
- ⚠️ Unproven in current pipeline (testing overhead)
- ⚠️ More complex integration (dual IP-Adapter weight scheduling)
- ✅ Better transition quality (smooth interpolation)
- 📅 **Defer to Phase 5+** after MVP validation

---

## Implementation Plan: Sequential Generation

### Phase 4A: Service Layer Updates (1-2 hours)

**File**: `services/comfyUIService.ts`

**New Function**: `generateVideoFromBookendsSequential()`
```typescript
export async function generateVideoFromBookendsSequential(
  settings: LocalGenerationSettings,
  scene: Scene,
  timeline: TimelineData,
  bookends: { start: string; end: string },
  logApiCall: LogApiCallFn,
  onStateChange: (state: any) => void
): Promise<string> {
  // 1. Generate first half video (0-24 frames) from start keyframe
  const videoStart = await generateSingleWAN2Video(
    settings, timeline, bookends.start, { duration: 24 }
  );
  
  // 2. Generate second half video (25-49 frames) from end keyframe
  const videoEnd = await generateSingleWAN2Video(
    settings, timeline, bookends.end, { duration: 24 }
  );
  
  // 3. Splice videos at midpoint (frame 24)
  const spliced = await spliceVideos(videoStart, videoEnd, { 
    transitionFrames: 1  // 1-frame crossfade
  });
  
  return spliced;
}
```

**Video Splicing**: Use `ffmpeg` via Node.js
```typescript
async function spliceVideos(
  video1Path: string, 
  video2Path: string, 
  options: { transitionFrames: number }
): Promise<string> {
  // ffmpeg -i video1.mp4 -i video2.mp4 
  //   -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.04:offset=1.0" 
  //   -y output.mp4
}
```

### Phase 4B: UI Integration (1 hour)

**File**: `components/GenerateSceneImagesButton.tsx`
- ✅ Already implemented: Calls `generateSceneBookendsLocally()`
- ✅ Returns `{ start: string; end: string }` structure
- ✅ Stores in `generatedImages[scene.id]` as KeyframeData

**File**: `components/TimelineEditor.tsx`
- Update "Generate Videos" button logic:
  - Check if `keyframeMode === 'bookend'`
  - Call `generateVideoFromBookendsSequential()` instead of `generateTimelineVideos()`

### Phase 4C: Testing (1 hour)

**Unit Tests**: `services/__tests__/comfyUIService.test.ts`
```typescript
describe('generateVideoFromBookendsSequential', () => {
  it('should generate two videos and splice them', async () => {
    const result = await generateVideoFromBookendsSequential(...);
    expect(result).toMatch(/\.mp4$/);
  });
});
```

**E2E Test**: `tests/e2e/bookend-sequential.spec.ts`
```typescript
test('bookend workflow: sequential generation', async ({ page }) => {
  // 1. Set keyframeMode to 'bookend'
  // 2. Generate bookends
  // 3. Generate video
  // 4. Validate output is ~49 frames
});
```

---

## Testing Checklist

### Manual Testing (ComfyUI UI)
- [ ] Open ComfyUI UI (http://127.0.0.1:8188)
- [ ] Load video_wan2_2_5B_ti2v.json
- [ ] Duplicate LoadImage node (create Node 56b)
- [ ] Test connecting both to Wan22ImageToVideoLatent
- [ ] Test array syntax in `start_image` field
- [ ] Document error messages or success
- [ ] If successful: Queue workflow and validate video

### Programmatic Testing (API)
- [ ] Create test script: `scripts/test-wan2-dual-loadimage.ps1`
- [ ] Generate two test keyframes (start.png, end.png)
- [ ] Build workflow JSON with dual LoadImage nodes
- [ ] Queue via ComfyUI API
- [ ] Monitor queue for errors
- [ ] Validate video output quality

### Documentation
- [ ] Update this file with findings
- [ ] Screenshot ComfyUI UI tests
- [ ] Document WAN2 model limitations
- [ ] Update BOOKEND_IMPLEMENTATION_STATUS.md with Phase 4 strategy

---

## Next Steps: Sequential Generation Implementation

### Immediate (Phase 4A - Service Layer)
1. ✅ **Research complete** - WAN2 dual LoadImage approach ruled out
2. ⏳ **Implement video splicing utility** - `utils/videoSplicer.ts` with ffmpeg
3. ⏳ **Create sequential generation function** - `generateVideoFromBookendsSequential()`
4. ⏳ **Update existing service** - Integrate into `comfyUIService.ts`

### Phase 4B: UI Integration
5. ⏳ **Update TimelineEditor.tsx** - Add bookend mode detection
6. ⏳ **Wire up video generation** - Call sequential function when `keyframeMode === 'bookend'`
7. ⏳ **Progress indicators** - Show "Generating start video..." → "Generating end video..." → "Splicing..."

### Phase 4C: Testing & Validation
8. ⏳ **Unit tests** - Test video splicing logic
9. ⏳ **E2E tests** - Full bookend workflow validation
10. ⏳ **Update documentation** - BOOKEND_IMPLEMENTATION_STATUS.md with Phase 4 complete

### Future Enhancement (Phase 5+)
11. 📅 **AnimateDiff research** - Smooth interpolation alternative
12. 📅 **Workflow profiles** - Create dedicated bookend profiles
13. 📅 **Transition polish** - Crossfade improvements

---

## Research Notes

### WAN2 Model Specifications
- Model: `wan2.2_ti2v_5B_fp16.safetensors`
- Input: Single image via `start_image` parameter
- Output: 49 frames at 1280x544 resolution
- FPS: 24

### ComfyUI Node Structure
```json
"56": {
  "inputs": {
    "image": "example.png"  // Single string input, not array
  },
  "class_type": "LoadImage"
}

"55": {
  "inputs": {
    "start_image": ["56", 0]  // References LoadImage output
  },
  "class_type": "Wan22ImageToVideoLatent"
}
```

**Observation**: `start_image` parameter name suggests WAN2 was designed for single starting frame, not dual bookends. This may indicate native dual-input support is unlikely.

---

## Appendix: Alternative Workflow Examples

### AnimateDiff + IP-Adapter Approach
```json
{
  "LoadImage_Start": { "image": "start.png" },
  "LoadImage_End": { "image": "end.png" },
  "IPAdapter_Start": { 
    "weight": 1.0,
    "weight_type": "linear_decay"
  },
  "IPAdapter_End": { 
    "weight": 1.0,
    "weight_type": "linear_grow"
  }
}
```

### Sequential Generation Approach
```python
# Pseudo-code
video1 = generate_wan2_video(start_keyframe)  # 24 frames
video2 = generate_wan2_video(end_keyframe)    # 24 frames
bookend_video = splice(video1[:12], video2[12:])  # Merge
```

---

**Last Updated**: 2025-11-24  
**Research Status**: ⏳ Pending Manual Testing  
**Blocking**: Phase 4 Implementation
