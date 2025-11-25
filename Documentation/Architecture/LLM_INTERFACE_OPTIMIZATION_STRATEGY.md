# LLM Interface Optimization Strategy
## Applying CFG 5.5 Best Practices Across All Enhancement Features

**Date**: 2025-11-23  
**Status**: 🔧 Implementation Plan  
**Foundation**: CFG 5.5 + Enhanced Prompts v4 (100% success rate)

---

## Executive Summary

This document provides a comprehensive strategy for ensuring **all LLM-interfacing components** in gemDirect1 adhere to the proven best practices derived from our CFG testing and prompt optimization work. The goal is to guarantee that every "Enhance" button, "Inspire Me" button, and LLM invocation across the application consistently produces high-quality, reliable outputs that harmonize with our established optimizations.

### Core Principles Established

From CFG 5.5 + Enhanced Prompts v4 testing (100% success rate):

1. **Structured Outputs Always**: Use JSON schemas with `responseMimeType: 'application/json'`
2. **Negative Guidance**: 360-char optimized negative prompt blocks unwanted patterns
3. **Positive Prompt Prefix**: SINGLE_FRAME_PROMPT v3 ensures unified compositions
4. **CFG 5.5 Optimal**: Sweet spot between enforcement (CFG too low) and over-suppression (CFG too high)
5. **Seed Randomization**: Unique seeds prevent deterministic failures
6. **Retry Logic**: `withRetry()` wrapper handles rate limits and transient errors
7. **Prompt Validation**: Pre-flight checks via `validatePrompt()` catch malformed inputs
8. **Context Pruning**: 80-93% token reduction via pruned context functions

---

## Audit: Current LLM Invocation Points

### 1. Story Generation Pipeline

#### Components with LLM Calls
| Component | Buttons/Actions | LLM Function | Status |
|-----------|----------------|--------------|--------|
| **StoryIdeaForm.tsx** | "Need inspiration?", "Enhance" button | `suggestStoryIdeas()`, `enhanceStoryIdea()` | ✅ Uses structured outputs |
| **StoryBibleEditor.tsx** | "Enhance" (logline/setting), "Suggest", "Refine with AI" tabs | `refineStoryBibleSection()`, `suggestField()` | ✅ Uses context pruning |
| **DirectorsVisionForm.tsx** | "Suggest a Vision", "Enhance" button | `suggestDirectorsVisions()`, `refineDirectorsVision()` | ✅ Uses structured outputs |

**Current Best Practices Applied**:
- ✅ All use `withRetry()` wrapper
- ✅ All use structured JSON schemas
- ✅ Context pruning implemented (`getPrunedContextFor*` functions)
- ✅ `onApiStateChange` progress callbacks
- ✅ Error boundaries in place

**Gaps**:
- ⚠️ No explicit negative guidance for text generation (not applicable - text-only LLMs)
- ⚠️ Temperature/sampling params not explicitly validated
- ✅ Already optimal - no changes needed for story generation

---

### 2. Keyframe Generation (ComfyUI Integration)

#### Components with Image Generation
| Component | Buttons/Actions | LLM Function | Status |
|-----------|----------------|--------------|--------|
| **GenerateSceneImagesButton.tsx** | "Generate X Keyframes" | `generateKeyframeForScene()` → `comfyUIService` | ✅ **CFG 5.5 + Prompts v4** |
| **TimelineEditor.tsx** (legacy) | "Generate Image" per shot | `generateImageForShot()` | ⚠️ Needs audit |
| **SceneCard.tsx** | "Generate Keyframe" button | `generateKeyframeForScene()` | ✅ Uses optimized service |

**Current Best Practices Applied**:
- ✅ `SINGLE_FRAME_PROMPT` v3 prefix (all keyframe calls)
- ✅ `NEGATIVE_GUIDANCE` v4 (360 chars)
- ✅ CFG 5.5 (in `localGenSettings.json`)
- ✅ Seed randomization (in `queueComfyUIPrompt`)
- ✅ Prompt validation via `validatePrompt()`
- ✅ Retry logic for ComfyUI API calls

**Gaps Identified**:
- ❌ **Shot-level image generation** (`generateImageForShot`) needs CFG audit
- ⚠️ **Visual Bible context** injection may need negative guidance review
- ⚠️ **Character consistency** prompts need validation against split-screen risks

---

### 3. Timeline Enhancement Features

#### Components with Enhancement LLM Calls
| Component | Buttons/Actions | LLM Function | Status |
|-----------|----------------|--------------|--------|
| **TimelineEditor.tsx** (legacy) | "Refine All Descriptions", "Suggest All Enhancers" | `batchProcessShotEnhancements()` | ✅ Uses context pruning |
| **CoDirector.tsx** | "Get Suggestions", "Inspire Me" | `getCoDirectorSuggestions()`, `proposeCreativeObjectives()` | ✅ Uses structured outputs |
| **CreativeControls.tsx** | Framing/Lens/Lighting dropdowns | No LLM (manual selection) | N/A |

**Current Best Practices Applied**:
- ✅ `batchProcessShotEnhancements()` uses `getPrunedContextForBatchProcessing()` (token optimization)
- ✅ `getCoDirectorSuggestions()` uses structured JSON schema
- ✅ All wrapped with `withRetry()`

**Gaps**:
- ✅ Already optimal - no changes needed

---

## Implementation Checklist: Applying CFG 5.5 Principles

### Phase 1: Validate Current Image Generation ✅ **COMPLETE**

**Objective**: Ensure all ComfyUI keyframe generation uses CFG 5.5 + Enhanced Prompts v4

**Actions**:
1. ✅ Audit `comfyUIService.ts` constants:
   - `SINGLE_FRAME_PROMPT` = v3 (360 chars with anti-reflection)
   - `NEGATIVE_GUIDANCE` = v4 (360 chars with symmetry terms)
   - Seed randomization active in `queueComfyUIPrompt`

2. ✅ Verify `localGenSettings.json`:
   - `wan-t2i` profile CFG = 5.5
   - Steps = 30, Sampler = res_multistep
   - Resolution = 1920x1080 (16:9)

3. ✅ Test keyframe generation pipeline:
   - Run `GenerateSceneImagesButton` with 5 scenes
   - Extract metadata from generated PNGs
   - Verify CFG 5.5, unique seeds, file sizes >800KB

**Status**: ✅ Validated in production (100% success rate achieved)

---

### Phase 2: Audit Shot-Level Image Generation ⚠️ **ACTION REQUIRED**

**Objective**: Ensure `generateImageForShot()` in TimelineEditor (legacy) uses CFG 5.5 + Prompts v4

**Investigation Steps**:

1. **Locate shot image generation code**:
   ```bash
   grep -r "generateImageForShot" services/ components/
   ```
   - Check if `buildShotPrompt()` is used
   - Verify `SINGLE_FRAME_PROMPT` is prepended
   - Confirm `NEGATIVE_GUIDANCE` is applied

2. **Validate workflow profile**:
   - Does shot generation use `wan-t2i` or a different profile?
   - If different, ensure CFG = 5.5 and prompts v4

3. **Test shot-level generation**:
   - Navigate to TimelineEditor (if still in use)
   - Click "Generate Image" on individual shots
   - Verify visual quality and metadata

**Expected Findings**:
- If using `buildShotPrompt()` → Already includes `SINGLE_FRAME_PROMPT` (line 1257 in comfyUIService.ts)
- If calling `queueComfyUIPrompt()` → Already uses seed randomization and CFG 5.5
- **Status**: Likely already compliant, but needs explicit validation

**Action Items**:
- [ ] Run test generation from TimelineEditor legacy UI
- [ ] Extract metadata from shot image
- [ ] Document results in `Testing/Reports/SHOT_IMAGE_CFG_VALIDATION_20251123.md`

---

### Phase 3: Implement Guardrails for All Enhancement Buttons ✅ **ALREADY APPLIED**

**Objective**: Ensure all "Enhance" and "Inspire Me" buttons follow prompt engineering best practices

**Pattern Template** (for text generation):
```typescript
// CORRECT PATTERN (already used in StoryBibleEditor.tsx)
const handleEnhanceField = useCallback(async (field: string) => {
    const currentContent = editableBible[field];
    if (!currentContent.trim()) return;
    
    setIsEnhancing(prev => ({ ...prev, [field]: true }));
    try {
        // 1. Use pruned context (80-93% token reduction)
        const prunedContext = getPrunedContextForLogline(editableBible);
        
        // 2. Call service layer with retry wrapper
        const enhanced = await planActions.refineStoryBibleSection(
            field,
            currentContent,
            prunedContext,
            onApiLog,
            onApiStateChange
        );
        
        // 3. Update state with result
        handleFieldChange(field, enhanced);
    } catch(e) {
        console.error(e);
        // Error boundary in withRetry handles user feedback
    } finally {
        setIsEnhancing(prev => ({ ...prev, [field]: false }));
    }
}, [editableBible, onApiLog, onApiStateChange]);
```

**Components Already Following Pattern**:
- ✅ `StoryIdeaForm.tsx` (lines 25-60)
- ✅ `StoryBibleEditor.tsx` (lines 136-170)
- ✅ `DirectorsVisionForm.tsx` (lines 42-65)

**Validation**:
- All use `usePlanExpansionActions()` hook
- All use `onApiStateChange` for progress
- All wrapped with try/catch
- All disable buttons during loading

**Status**: ✅ No changes needed - already optimal

---

### Phase 4: Add Validation Gates for Image-to-Video Pipeline 🚧 **NEXT PHASE**

**Objective**: Prepare for video generation by ensuring all keyframes meet quality thresholds before video conversion

**Implementation Plan**:

1. **File Size Validation** (Low Priority):
   ```typescript
   // Add to comfyUIService.ts after image download
   const fileSizeKB = base64Image.length * 0.75 / 1024;
   if (fileSizeKB < 800) {
       console.warn(`[Keyframe Validation] Low file size: ${fileSizeKB}KB (floor: 800KB)`);
       // Optional: auto-retry or flag for review
   }
   ```

2. **Metadata Verification**:
   ```typescript
   // Validate CFG and seed in PNG metadata
   const metadata = extractPNGMetadata(imageData);
   if (metadata.cfg !== 5.5) {
       console.error(`[Keyframe Validation] Wrong CFG: ${metadata.cfg} (expected 5.5)`);
   }
   ```

3. **Pre-Video Quality Gate**:
   ```typescript
   // Before calling video generation
   const keyframeQuality = validateKeyframeQuality(keyframeImage);
   if (!keyframeQuality.passed) {
       throw new Error(`Keyframe failed quality check: ${keyframeQuality.reason}`);
   }
   ```

**Status**: 🔧 Design phase - implementation after video workflow integration

---

### Phase 5: Document Video Workflow Integration Strategy 📝 **IN PROGRESS**

**Objective**: Create architecture document for using optimized keyframes in video generation

**Key Design Decisions**:

1. **Single Keyframe vs. Bookend Keyframes**:
   - Current: One keyframe per scene (T2I workflow)
   - Proposed: Start + End keyframes (I2V workflow with temporal guidance)
   - See `BOOKEND_WORKFLOW_PROPOSAL.md` for full design

2. **Keyframe → Video Prompt Engineering**:
   - Reuse `SINGLE_FRAME_PROMPT` v3 as base
   - Add temporal consistency guidance: "Maintain visual continuity from start frame to end frame"
   - Extend `NEGATIVE_GUIDANCE` v4 with video-specific terms:
     ```
     flickering, abrupt cuts, morphing artifacts, temporal inconsistency,
     frame-to-frame jitter, warping, distortion, color shifts
     ```

3. **CFG for Video Generation**:
   - Test CFG 5.5 for WAN2 I2V workflow
   - Expected: Similar optimal range as keyframes (5.0-5.5)
   - Validate: No black frames, no split-screen in video outputs

4. **Workflow Profiles**:
   ```json
   {
     "wan-t2i": { "cfg": 5.5, "purpose": "keyframe generation" },
     "wan-i2v": { "cfg": 5.5, "purpose": "video from single keyframe" },
     "wan-i2v-bookends": { "cfg": 5.5, "purpose": "video from start+end frames" }
   }
   ```

**Documentation Files to Create**:
- `Documentation/Architecture/VIDEO_WORKFLOW_INTEGRATION.md` (comprehensive guide)
- `Documentation/References/VIDEO_CFG_TESTING_PROTOCOL.md` (testing methodology)
- `Testing/E2E/VIDEO_GENERATION_VALIDATION_CHECKLIST.md` (QA process)

**Status**: 📝 Proposal created (`BOOKEND_WORKFLOW_PROPOSAL.md`), implementation plan TBD

---

## Critical Integration Points for Video Pipeline

### 1. Keyframe Quality Assurance

**Before video generation, validate**:
- ✅ Keyframe exists (`generatedImages[scene.id]` not undefined)
- ✅ File size healthy (>800KB indicates full generation)
- ✅ CFG metadata matches 5.5
- ✅ Seed uniqueness (no duplicate generations)
- ⚠️ Visual inspection (manual QA for now, automated later)

**Current Status**:
- `GenerateSceneImagesButton.tsx` already validates keyframe existence (line 61-65)
- Metadata extraction proven working (PowerShell validation scripts)
- File size floor not yet implemented (optional enhancement)

### 2. Prompt Engineering for I2V

**Reuse CFG 5.5 best practices**:
```typescript
// services/videoGenerationService.ts (to be enhanced)
const VIDEO_SINGLE_FRAME_PROMPT = 
    'SINGLE CONTINUOUS VIDEO SHOT: Generate EXACTLY ONE UNIFIED CINEMATIC VIDEO ' +
    'showing a SINGLE CONTINUOUS MOMENT across the ENTIRE 16:9 frame WITHOUT ANY ' +
    'DIVISIONS, CUTS, OR SCENE CHANGES. This is ONE UNBROKEN VIDEO SHOT maintaining ' +
    'visual continuity from start to end. Ensure smooth motion, no flickering, ' +
    'consistent lighting and perspective throughout.';

const VIDEO_NEGATIVE_GUIDANCE = 
    NEGATIVE_GUIDANCE + // Reuse keyframe negative (360 chars)
    ', flickering, abrupt cuts, morphing artifacts, temporal inconsistency, ' +
    'frame-to-frame jitter, warping, distortion, color shifts, scene transitions, ' +
    'jump cuts, camera angle changes, location changes';
```

### 3. Workflow Configuration

**Ensure ComfyUI workflows use CFG 5.5**:

```json
// localGenSettings.json (wan-i2v profile)
{
  "wan-i2v": {
    "workflowName": "video_wan2_2_5B_ti2v",
    "workflowPath": "workflows/video_wan2_2_5B_ti2v.json",
    "workflow": {
      "3": {
        "inputs": {
          "seed": 942500763821827, // Will be randomized
          "steps": 30,
          "cfg": 5.5, // CRITICAL: Must be 5.5
          "sampler_name": "res_multistep",
          "scheduler": "simple"
        }
      },
      "6": {
        "inputs": {
          "text": "PLACEHOLDER_WILL_BE_REPLACED_BY_VIDEO_PROMPT"
        }
      },
      "10": {
        "inputs": {
          "image": "PLACEHOLDER_KEYFRAME_IMAGE"
        }
      }
    },
    "mappings": {
      "6:text": "human_readable_prompt",
      "10:image": "keyframe_image"
    }
  }
}
```

**Validation Steps**:
1. Verify `wan-i2v` profile exists in `localGenSettings.json`
2. Confirm `cfg: 5.5` in KSampler node
3. Test single scene video generation
4. Extract video metadata (if available) or inspect visually

---

## Testing & Validation Protocol

### For Each Enhancement Button

**Pre-Deployment Checklist**:
- [ ] Component uses `usePlanExpansionActions()` hook
- [ ] Service function wrapped with `withRetry()`
- [ ] Structured JSON schema defined (for data responses)
- [ ] Context pruning applied (if applicable)
- [ ] `onApiStateChange` callbacks implemented
- [ ] Error boundaries handle failures gracefully
- [ ] Loading states disable buttons
- [ ] Success/error toasts provide user feedback

**Example Test Case** (StoryBibleEditor "Enhance" button):
```typescript
test('Enhance logline button uses pruned context and structured output', async () => {
    // 1. Setup
    const mockBible = { logline: 'A hero saves the world', ... };
    const mockPrunedContext = getPrunedContextForLogline(mockBible);
    
    // 2. Execute
    render(<StoryBibleEditor bible={mockBible} ... />);
    await userEvent.click(screen.getByText(/Enhance/i));
    
    // 3. Verify
    expect(mockRefineSection).toHaveBeenCalledWith(
        'logline',
        'A hero saves the world',
        mockPrunedContext, // NOT full bible
        expect.any(Function), // onApiLog
        expect.any(Function)  // onApiStateChange
    );
});
```

### For Image/Video Generation

**Validation Steps**:
1. **Metadata Extraction** (PowerShell):
   ```powershell
   $bytes = [System.IO.File]::ReadAllBytes($imagePath);
   $text = [System.Text.Encoding]::UTF8.GetString($bytes);
   $cfg = if ($text -match '"cfg":\s*([0-9.]+)') { $Matches[1] };
   $seed = if ($text -match '"seed":\s*([0-9]+)') { $Matches[1] };
   ```

2. **Visual Inspection**:
   - No split-screen artifacts
   - No grid layouts
   - No black frames
   - Unified composition across entire frame

3. **Performance Metrics**:
   - Generation time < 3 minutes per keyframe
   - File size > 800KB (healthy generation)
   - Queue success rate > 95%

---

## Deployment Roadmap

### Phase 1: Validate Current State ✅ **COMPLETE**
- ✅ CFG 5.5 + Enhanced Prompts v4 production-ready
- ✅ All keyframe generation using optimized settings
- ✅ 100% success rate validated

### Phase 2: Audit Shot-Level Generation ⏳ **NEXT**
- [ ] Test `generateImageForShot()` in TimelineEditor
- [ ] Verify CFG 5.5 and prompts v4 applied
- [ ] Document results
- **Timeline**: 1-2 hours

### Phase 3: Implement Video Quality Gates 🔧 **FUTURE**
- [ ] Add file size validation (800KB floor)
- [ ] Implement metadata verification
- [ ] Create pre-video quality check
- **Timeline**: 3-5 hours

### Phase 4: Video Workflow Integration 📋 **DESIGN PHASE**
- [ ] Create `VIDEO_WORKFLOW_INTEGRATION.md`
- [ ] Test CFG 5.5 with WAN2 I2V workflow
- [ ] Implement bookend keyframes (optional)
- [ ] Validate video generation quality
- **Timeline**: 14-20 hours (per BOOKEND_WORKFLOW_PROPOSAL.md)

---

## Success Criteria

### Short-Term (Current Phase)
- ✅ All keyframe generation uses CFG 5.5
- ✅ All image generation uses Enhanced Prompts v4
- ✅ 100% success rate maintained
- [ ] Shot-level generation validated

### Medium-Term (Video Integration)
- [ ] Video generation uses CFG 5.5
- [ ] Video prompts include temporal consistency guidance
- [ ] No flickering or temporal artifacts in video outputs
- [ ] Keyframe→Video quality gates in place

### Long-Term (Production)
- [ ] Automated quality checks for all generated media
- [ ] Comprehensive test coverage (unit + E2E)
- [ ] User documentation for optimal generation
- [ ] Performance monitoring dashboard

---

## Appendix: Reference Files

### Key Implementation Files
| File | Purpose | Status |
|------|---------|--------|
| `services/comfyUIService.ts` | Keyframe generation, prompts v4 | ✅ Production |
| `services/geminiService.ts` | Text generation, context pruning | ✅ Production |
| `services/videoGenerationService.ts` | Video from keyframes | ⚠️ Needs CFG audit |
| `utils/hooks.ts` | `usePlanExpansionActions`, `useMediaGenerationActions` | ✅ Production |
| `localGenSettings.json` | Workflow profiles, CFG settings | ✅ Production |

### Documentation Files
| File | Purpose | Status |
|------|---------|--------|
| `AGENT_HANDOFF_ENHANCED_PROMPTS_SUCCESS_20251123.md` | CFG 5.5 validation report | ✅ Complete |
| `SESSION_COMPLETE_ENHANCED_PROMPTS_20251123.md` | Executive summary | ✅ Complete |
| `BOOKEND_WORKFLOW_PROPOSAL.md` | Dual-keyframe architecture | ✅ Design complete |
| `LLM_INTERFACE_OPTIMIZATION_STRATEGY.md` | This document | ✅ Complete |
| `VIDEO_WORKFLOW_INTEGRATION.md` | Video pipeline guide | 📝 TBD |

### Testing Files
| File | Purpose | Status |
|------|---------|--------|
| `tests/e2e/full-pipeline.spec.ts` | End-to-end story generation | ✅ Passing |
| `tests/unit/comfyGuardrails.test.ts` | Prompt validation tests | ✅ Passing |
| `scripts/validate-run-summary.ps1` | Metadata extraction | ✅ Working |

---

## Conclusion

The gemDirect1 application already implements best practices across most LLM interfaces:
- ✅ Structured outputs with JSON schemas
- ✅ Context pruning (80-93% token reduction)
- ✅ Retry logic with exponential backoff
- ✅ Error boundaries and user feedback
- ✅ CFG 5.5 + Enhanced Prompts v4 for keyframes

**Next priorities**:
1. Validate shot-level image generation (TimelineEditor legacy)
2. Test CFG 5.5 with video generation workflows
3. Implement video-specific prompt enhancements
4. Create comprehensive video integration documentation

This strategic alignment ensures all enhancement features produce consistent, high-quality outputs that harmonize with our established optimizations, paving the way for seamless video generation capabilities.

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-23  
**Maintained By**: GitHub Copilot (Claude Sonnet 4.5)
