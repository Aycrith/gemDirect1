# Bookend Workflow Proposal: Dual-Keyframe Video Generation

**Status**: 🔵 Proposed (Research Phase)  
**Created**: 2025-11-23  
**Dependencies**: Current CFG 5.5 pipeline (100% success rate)  
**Compatibility**: Backward compatible - additive feature, non-breaking

---

## Executive Summary

Extend the current single-keyframe video generation workflow to support **start/end keyframe pairs** (bookends) for improved temporal consistency and narrative control. This modular enhancement builds on top of the existing, fully functional CFG 5.5 pipeline without impacting current functionality.

**Key Benefits**:
- **Temporal Consistency**: Model interpolates between known start/end states vs. extrapolating from single frame
- **Narrative Control**: Explicit visual progression per shot (beginning → end)
- **Reduced Hallucination**: Bounded interpolation reduces drift from intended scene direction

**Implementation Strategy**: Feature flag approach - users choose single-keyframe (current) or dual-keyframe (new) profiles in Settings UI.

---

## Current Architecture (Baseline)

### Data Flow
```
Story Idea → Story Bible → Scenes → [Single Keyframe (T2I)] → Video (I2V from one frame)
                                           ↓
                                   wan-t2i workflow
                                   (NetaYume Lumina 3.5)
                                           ↓
                                   wan-i2v workflow
                                   (WAN2 2.5B I2V)
```

### Key Components
- **Data Model**: `Scene` interface with single `keyframe` field
- **State Management**: `generatedImages: Record<string, string>` (sceneId → base64)
- **UI**: `GenerateSceneImagesButton` → "Generate 5 Keyframes" (1 per scene)
- **ComfyUI**: `wan-t2i` (text→image), `wan-i2v` (image→video)
- **Service Layer**: `comfyUIService.ts`, `payloadService.ts`

### Success Metrics (CFG 5.5)
- ✅ 100% usable keyframes (5/5)
- ✅ Zero failure modes (grid/split-screen/black eliminated)
- ✅ Seed randomization working
- ✅ Production-ready prompt engineering

---

## Proposed Architecture (Bookend Extension)

### Enhanced Data Flow
```
Story Idea → Story Bible → Scenes → [Start Keyframe + End Keyframe (T2I × 2)] → Video (I2V from bookends)
                                                    ↓
                                    wan-t2i-bookends workflow
                                    (Generate 2 images per scene with temporal prompts)
                                                    ↓
                                    wan-i2v-bookends workflow
                                    (WAN2 dual-frame conditioning or AnimateDiff IP-Adapter)
```

### Data Model Changes

#### 1. Scene Interface Extension (`types.ts`)
```typescript
// CURRENT
interface Scene {
  id: string;
  title: string;
  summary: string;
  // ... existing fields
}

// PROPOSED (additive, non-breaking)
interface Scene {
  id: string;
  title: string;
  summary: string;
  // ... existing fields
  
  // NEW: Bookend support (optional for backward compatibility)
  keyframeMode?: 'single' | 'bookend'; // Default: 'single'
  keyframeStart?: string;  // Base64 image data
  keyframeEnd?: string;    // Base64 image data
  temporalContext?: {      // Temporal metadata for bookends
    startMoment: string;   // E.g., "Explorer approaches artifact"
    endMoment: string;     // E.g., "Artifact begins glowing"
    duration?: number;     // Shot duration in seconds (optional)
  };
}
```

**Migration Strategy**: Existing projects remain `keyframeMode: 'single'` (implicit default), new projects can opt-in to `'bookend'`.

#### 2. Generated Images State (`useProjectData`)
```typescript
// CURRENT
const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});

// PROPOSED (backward compatible via union type)
type KeyframeData = string | { start: string; end: string };
const [generatedImages, setGeneratedImages] = useState<Record<string, KeyframeData>>({});

// Helper functions for type safety
function isSingleKeyframe(data: KeyframeData): data is string {
  return typeof data === 'string';
}

function isBookendKeyframe(data: KeyframeData): data is { start: string; end: string } {
  return typeof data === 'object' && 'start' in data && 'end' in data;
}
```

---

## UI/UX Changes

### 1. Settings UI Extension (`Settings.tsx`)
**New Section**: "Keyframe Generation Mode" in ComfyUI Settings tab

```
┌─ Keyframe Generation Mode ─────────────────┐
│ ○ Single Keyframe (Current)                │
│   Generate one representative frame per     │
│   scene. Fast, proven 100% success rate.   │
│                                             │
│ ○ Dual Keyframes (Bookend) [EXPERIMENTAL]  │
│   Generate start + end frames per scene.   │
│   Improves video temporal consistency.     │
│   Requires compatible workflow profile.    │
└─────────────────────────────────────────────┘
```

**Implementation**: Add `keyframeMode` field to `localGenSettings.json`, sync to IndexedDB via `usePersistentState`.

### 2. Generate Button Updates (`GenerateSceneImagesButton.tsx`)
```typescript
// Current behavior (single mode)
"Generate 5 Keyframes"

// New behavior (bookend mode)
"Generate 10 Keyframes (5 Start + 5 End)" 
// Status: "Generating start keyframe 1/5..." → "Generating end keyframe 1/5..."
```

**Logic Change**:
```typescript
if (keyframeMode === 'bookend') {
  // Step 1: Generate all start keyframes (5 T2I calls)
  for (const scene of scenes) {
    const startPrompt = generateBookendPrompt(scene, 'start');
    await queueComfyUIPrompt('wan-t2i-bookends', startPrompt, ...);
  }
  
  // Step 2: Generate all end keyframes (5 T2I calls)
  for (const scene of scenes) {
    const endPrompt = generateBookendPrompt(scene, 'end');
    await queueComfyUIPrompt('wan-t2i-bookends', endPrompt, ...);
  }
} else {
  // Current single keyframe logic (unchanged)
}
```

### 3. Scene Card Display (`SceneCard.tsx`)
**Current**: Single keyframe thumbnail  
**Proposed**: Side-by-side bookend display (if `keyframeMode === 'bookend'`)

```
┌────────────────────────────────────┐
│ Scene 1: Space Explorer Discovery  │
├──────────────┬─────────────────────┤
│   START      │       END           │
│ [Thumbnail]  │   [Thumbnail]       │
│ "Approaches  │   "Artifact glows"  │
│  artifact"   │                     │
└──────────────┴─────────────────────┘
```

### 4. Timeline Editor (`TimelineEditor.tsx`)
**Current**: Single keyframe preview per shot  
**Proposed**: Bookend strip showing start/end frames

```
Shot 1: [Start frame] ════════════► [End frame]
        "Opens scene"              "Closes action"
```

---

## ComfyUI Workflow Integration

### Phase 1: Keyframe Generation (T2I)

#### Workflow Profile: `wan-t2i-bookends`
**Based on**: `wan-t2i` (NetaYume Lumina 3.5)  
**Changes**: Prompt engineering only (workflow JSON unchanged)

**Prompt Strategy**:
```typescript
// START KEYFRAME PROMPT
const BOOKEND_START_PREFIX = 
  'OPENING FRAME: Generate the FIRST MOMENT of this scene. ' +
  'Show the INITIAL STATE before action begins. ' +
  'WIDE ESTABLISHING SHOT: EXACTLY ONE UNIFIED CINEMATIC SCENE...';

function generateStartPrompt(scene: Scene, context: string): string {
  return `${BOOKEND_START_PREFIX}

SCENE OPENING: ${scene.temporalContext?.startMoment || 'Scene begins'}

${scene.summary}

${context}`;
}

// END KEYFRAME PROMPT
const BOOKEND_END_PREFIX = 
  'CLOSING FRAME: Generate the FINAL MOMENT of this scene. ' +
  'Show the CONCLUDING STATE after action completes. ' +
  'WIDE ESTABLISHING SHOT: EXACTLY ONE UNIFIED CINEMATIC SCENE...';

function generateEndPrompt(scene: Scene, context: string): string {
  return `${BOOKEND_END_PREFIX}

SCENE CONCLUSION: ${scene.temporalContext?.endMoment || 'Scene ends'}

${scene.summary}

${context}`;
}
```

**Settings**: Identical to `wan-t2i` (CFG 5.5, 320-char negative, seed randomization)

### Phase 2: Video Generation (I2V)

#### Research Requirements (BEFORE IMPLEMENTATION)
1. **WAN2 Multi-Frame Support**:
   - Does `LoadImage` node accept array: `["start.png", "end.png"]`?
   - Does WAN2 model support dual-frame conditioning natively?
   - Check `workflows/video_wan2_2_5B_ti2v.json` for node input types

2. **Alternative: AnimateDiff + ControlNet IP-Adapter**:
   - AnimateDiff I2V as base
   - Dual IP-Adapter conditioning:
     - Start frame: weight=1.0, schedule=[1.0, 0.8, 0.6, ...] (decreasing influence)
     - End frame: weight=1.0, schedule=[0.0, 0.2, 0.4, ...] (increasing influence)
   - Interpolate between weighted influences over video frames

#### Workflow Profile: `wan-i2v-bookends` (Conceptual)

**Option A: WAN2 Native (if supported)**
```json
{
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "cfg": 6.0,
      "seed": <randomized>,
      // ... other params
    }
  },
  "9": {
    "class_type": "LoadImage",
    "inputs": {
      "image": ["<start_keyframe>", "<end_keyframe>"]  // ← KEY CHANGE
    }
  }
}
```

**Option B: AnimateDiff Fallback (if WAN2 doesn't support)**
```json
{
  "1": { "class_type": "AnimateDiffLoader", ... },
  "2": { 
    "class_type": "IPAdapterApply",
    "inputs": {
      "image": "<start_keyframe>",
      "weight": 1.0,
      "weight_type": "linear_decreasing"  // Custom schedule
    }
  },
  "3": {
    "class_type": "IPAdapterApply",
    "inputs": {
      "image": "<end_keyframe>",
      "weight": 1.0,
      "weight_type": "linear_increasing"  // Custom schedule
    }
  }
}
```

**Mapping Requirements**:
- `start_keyframe_image` → Node 2 (or LoadImage[0])
- `end_keyframe_image` → Node 3 (or LoadImage[1])
- `human_readable_prompt` → CLIP node (unchanged)
- `full_timeline_json` → CLIP node (unchanged)

---

## Service Layer Implementation

### 1. Payload Service Extension (`payloadService.ts`)

```typescript
// NEW: Bookend-specific payload generation
export interface BookendPayloads {
  start: {
    json: string;
    text: string;
    structured: Record<string, any>;
    negativePrompt: string;
  };
  end: {
    json: string;
    text: string;
    structured: Record<string, any>;
    negativePrompt: string;
  };
}

export function generateBookendPayloads(
  scene: Scene,
  storyBible: string,
  directorsVision: string,
  temporalContext: { startMoment: string; endMoment: string }
): BookendPayloads {
  const baseContext = buildPromptContext(storyBible, directorsVision);
  
  const startPrompt = `${BOOKEND_START_PREFIX}

SCENE OPENING: ${temporalContext.startMoment}

${scene.summary}

${baseContext}`;

  const endPrompt = `${BOOKEND_END_PREFIX}

SCENE CONCLUSION: ${temporalContext.endMoment}

${scene.summary}

${baseContext}`;

  return {
    start: {
      json: JSON.stringify({ prompt: startPrompt }),
      text: startPrompt,
      structured: { prompt: startPrompt },
      negativePrompt: NEGATIVE_GUIDANCE // Reuse current 320-char negative
    },
    end: {
      json: JSON.stringify({ prompt: endPrompt }),
      text: endPrompt,
      structured: { prompt: endPrompt },
      negativePrompt: NEGATIVE_GUIDANCE
    }
  };
}
```

### 2. ComfyUI Service Extension (`comfyUIService.ts`)

```typescript
// NEW: Bookend-aware generation function
export async function generateSceneBookendsLocally(
  settings: ComfyUIConfig,
  scene: Scene,
  storyBible: string,
  directorsVision: string,
  temporalContext: { startMoment: string; endMoment: string },
  logApiCall: LogApiCallFn,
  onStateChange: (state: any) => void
): Promise<{ start: string; end: string }> {
  const payloads = generateBookendPayloads(scene, storyBible, directorsVision, temporalContext);
  
  // Generate start keyframe
  const startImage = await queueComfyUIPrompt(
    'wan-t2i-bookends',
    payloads.start,
    scene,
    { /* mappings */ },
    undefined, // No existing keyframe
    logApiCall,
    onStateChange
  );
  
  // Generate end keyframe
  const endImage = await queueComfyUIPrompt(
    'wan-t2i-bookends',
    payloads.end,
    scene,
    { /* mappings */ },
    undefined,
    logApiCall,
    onStateChange
  );
  
  return { start: startImage, end: endImage };
}

// NEW: Video generation with bookends
export async function generateVideoFromBookends(
  settings: ComfyUIConfig,
  scene: Scene,
  timeline: Timeline,
  bookends: { start: string; end: string },
  logApiCall: LogApiCallFn,
  onStateChange: (state: any) => void
): Promise<string> {
  const payloads = generateTimelinePayloads(scene, timeline);
  
  // Pass both keyframes to I2V workflow
  return await queueComfyUIPrompt(
    'wan-i2v-bookends',
    payloads,
    scene,
    { /* mappings including start/end images */ },
    bookends, // NEW: Pass both keyframes
    logApiCall,
    onStateChange
  );
}
```

---

## Migration & Compatibility Strategy

### Backward Compatibility Guarantees
1. **Existing Projects**: Continue using `keyframeMode: 'single'` (implicit default)
2. **API Surface**: All current functions remain unchanged, new functions additive
3. **Data Model**: Optional fields (`keyframeStart?`, `keyframeEnd?`) don't break deserialization
4. **Workflow Profiles**: `wan-t2i` and `wan-i2v` unchanged, new profiles side-by-side

### Feature Detection
```typescript
function supportsBookends(scene: Scene): boolean {
  return scene.keyframeMode === 'bookend' && 
         scene.temporalContext !== undefined;
}

function getKeyframeData(
  sceneId: string, 
  generatedImages: Record<string, KeyframeData>
): { start: string; end?: string } {
  const data = generatedImages[sceneId];
  
  if (!data) return { start: '' };
  
  if (isSingleKeyframe(data)) {
    return { start: data }; // Single keyframe mode
  } else {
    return data; // Bookend mode
  }
}
```

### Settings Migration
```typescript
// localGenSettings.json
{
  "version": "2.0", // Bump version for bookend support
  "keyframeMode": "single", // Default to current behavior
  "workflows": {
    "wan-t2i": { /* existing single keyframe config */ },
    "wan-t2i-bookends": { /* new dual keyframe config (optional) */ },
    "wan-i2v": { /* existing single frame video */ },
    "wan-i2v-bookends": { /* new dual frame video (optional) */ }
  }
}
```

**Import Logic**:
- If `version < 2.0` or no `keyframeMode` field → set `keyframeMode: 'single'`
- If `wan-t2i-bookends` profile missing → disable bookend mode in UI
- Show warning toast: "Bookend workflows not configured. Using single keyframe mode."

---

## Testing & Validation Strategy

### Phase 1: Manual ComfyUI Research (1-2 hours)
**Goal**: Validate WAN2 dual-frame support before implementation

1. **Test WAN2 Multi-Frame Conditioning**:
   - Open `workflows/video_wan2_2_5B_ti2v.json` in ComfyUI UI
   - Inspect `LoadImage` node: Does it accept array of images?
   - Test with 2 manually generated keyframes (same scene, different poses)
   - Check output: Are start/end frames visible in resulting video?

2. **Fallback Research: AnimateDiff**:
   - If WAN2 doesn't support dual frames natively
   - Test AnimateDiff + dual IP-Adapter workflow
   - Validate interpolation quality (smooth transitions vs. jarring jumps)

3. **Document Findings**: Add section to this proposal with test results

### Phase 2: Data Model & Service Layer Tests (Vitest)
```typescript
// services/payloadService.test.ts
describe('generateBookendPayloads', () => {
  it('generates distinct start/end prompts with temporal context', () => {
    const payloads = generateBookendPayloads(scene, bible, vision, {
      startMoment: 'Explorer approaches artifact',
      endMoment: 'Artifact begins glowing'
    });
    
    expect(payloads.start.text).toContain('OPENING FRAME');
    expect(payloads.start.text).toContain('Explorer approaches artifact');
    expect(payloads.end.text).toContain('CLOSING FRAME');
    expect(payloads.end.text).toContain('Artifact begins glowing');
    expect(payloads.start.text).not.toEqual(payloads.end.text);
  });
});
```

### Phase 3: E2E Browser Tests (Playwright)
```typescript
// tests/e2e/bookend-workflow.spec.ts
test('bookend keyframe generation produces start and end images', async ({ page }) => {
  // Enable bookend mode in settings
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Dual Keyframes (Bookend)').check();
  
  // Generate bookends
  await page.getByRole('button', { name: 'Generate 10 Keyframes' }).click();
  
  // Validate start keyframes generated (5)
  await expect(page.getByText('Generating start keyframe 1/5')).toBeVisible();
  // ... wait for completion
  
  // Validate end keyframes generated (5)
  await expect(page.getByText('Generating end keyframe 1/5')).toBeVisible();
  // ... wait for completion
  
  // Check scene cards show bookends
  const sceneCard = page.locator('[data-testid="scene-card-1"]');
  await expect(sceneCard.getByText('START')).toBeVisible();
  await expect(sceneCard.getByText('END')).toBeVisible();
});
```

### Phase 4: PowerShell E2E Test (`scripts/test-bookend-workflow.ps1`)
```powershell
# Generate test story with bookend mode enabled
$storyIdea = "A space explorer discovers an alien artifact"
# ... generate story bible, scenes

# Generate bookends (10 keyframes total)
# Validate: 10 files created, 5 with startMoment metadata, 5 with endMoment metadata

# Queue video with bookend workflow
# Validate: Video output shows distinct start/end frames
# Measure: Temporal consistency (CLIP similarity between keyframes and video frames)
```

---

## Implementation Phases

### Phase 1: Data Model & State Management (1 session, ~2 hours)
**Files Modified**:
- `types.ts`: Add optional bookend fields to `Scene` interface
- `utils/hooks.ts`: Update `generatedImages` state type to union type
- `utils/database.ts`: Test IndexedDB serialization with new fields

**Validation**:
- Existing projects load without errors (backward compatibility)
- New projects can save/load bookend data
- Unit tests pass

### Phase 2: Service Layer Implementation (1 session, ~3 hours)
**Files Modified**:
- `services/payloadService.ts`: Add `generateBookendPayloads` function
- `services/comfyUIService.ts`: Add `generateSceneBookendsLocally` function
- `services/comfyUIService.ts`: Update `queueComfyUIPrompt` to handle dual keyframes

**Validation**:
- Unit tests for payload generation
- Mock ComfyUI calls test dual-image submission
- No regressions in single-keyframe mode

### Phase 3: UI Components (1 session, ~3 hours)
**Files Modified**:
- `Settings.tsx`: Add keyframe mode selector
- `GenerateSceneImagesButton.tsx`: Conditional logic for bookend generation
- `SceneCard.tsx`: Bookend display (side-by-side thumbnails)
- `TimelineEditor.tsx`: Bookend strip visualization (optional)

**Validation**:
- UI switches between single/bookend modes
- Settings persist to IndexedDB
- Visual regression tests (Playwright screenshots)

### Phase 4: ComfyUI Workflow Integration (1-2 sessions, ~4-6 hours)
**Prerequisites**: Phase 1 research (WAN2 multi-frame support) complete

**Files Created**:
- `workflows/image_netayume_lumina_bookends.json` (if needed, or reuse wan-t2i)
- `workflows/video_wan2_bookends.json` (dual-frame I2V workflow)

**Files Modified**:
- `localGenSettings.json`: Add `wan-t2i-bookends` and `wan-i2v-bookends` profiles
- `services/comfyUIService.ts`: Mapping logic for dual keyframes

**Validation**:
- Manual ComfyUI test with workflow JSON
- E2E test: Generate bookends → Queue video → Validate output
- Metadata extraction confirms dual-keyframe usage

### Phase 5: Testing & Documentation (1 session, ~2 hours)
**Files Created**:
- `scripts/test-bookend-workflow.ps1`
- `Testing/E2E/BOOKEND_WORKFLOW_TEST_CHECKLIST.md`
- `Documentation/Guides/BOOKEND_WORKFLOW_USER_GUIDE.md`

**Files Modified**:
- `Documentation/PROJECT_STATUS_CONSOLIDATED.md`: Add bookend feature status
- `README.md`: Update feature list
- `playwright.config.ts`: Add bookend test suite

**Validation**:
- All tests pass (unit, E2E, PowerShell)
- Documentation reviewed
- Ready for user testing

---

## Risk Assessment & Mitigation

### Risk 1: WAN2 Doesn't Support Dual-Frame Conditioning
**Likelihood**: Medium  
**Impact**: High (requires fallback workflow)

**Mitigation**:
1. Research WAN2 documentation BEFORE Phase 4 implementation
2. Prototype dual-frame conditioning manually in ComfyUI UI
3. If unsupported, use AnimateDiff + IP-Adapter fallback (well-documented approach)
4. Document fallback in this proposal after research

### Risk 2: Temporal Consistency Worse Than Expected
**Likelihood**: Low-Medium  
**Impact**: Medium (feature less useful, but not broken)

**Mitigation**:
1. Test with various scene types (action, dialogue, establishing shots)
2. Measure CLIP similarity between keyframes and video frames
3. If poor results, add guidance: "Use bookends for static scenes, single keyframe for dynamic action"
4. Iterate on prompt engineering (start/end phrasing)

### Risk 3: Performance Impact (2× Keyframe Generation Time)
**Likelihood**: High (certain)  
**Impact**: Low (acceptable tradeoff for quality)

**Mitigation**:
1. Document expected time: "10 keyframes (~60-80 min) vs. 5 keyframes (~35-40 min)"
2. Add parallel generation (queue all 10 T2I calls at once vs. sequential)
3. Optional: Batch generation UI ("Generate start keyframes only" vs. "Generate all bookends")

### Risk 4: User Confusion (Two Modes)
**Likelihood**: Medium  
**Impact**: Low (good documentation mitigates)

**Mitigation**:
1. Clear UI labels: "Single Keyframe (Current)" vs. "Dual Keyframes (Experimental)"
2. Tooltips explaining tradeoffs
3. Default to single keyframe mode (users opt-in to bookends)
4. User guide with visual examples

---

## Success Metrics

### Quantitative
- **Temporal Consistency**: CLIP similarity between keyframes and video frames ≥0.75
- **Failure Rate**: ≤5% (maintain current CFG 5.5 quality)
- **Performance**: Bookend generation time ≤2× single keyframe (parallel queuing)
- **Adoption**: ≥30% of projects use bookend mode after 1 month (user preference)

### Qualitative
- Users report improved video coherence vs. single keyframe
- Visual progression matches narrative intent (start → end)
- No regressions in single-keyframe mode
- Documentation clarity: Users can enable feature without support

---

## Open Questions (Research Phase)

### Technical
1. **WAN2 Multi-Frame Support**: Does `LoadImage` accept array of images?
2. **Optimal Interpolation**: Linear schedule or custom easing curves for IP-Adapter?
3. **CLIP Node Behavior**: Does prompt apply equally to both keyframes or split?
4. **File Size**: Do bookend videos increase output size significantly?

### Product
1. **Default Mode**: Should bookend mode be default for new projects (after validation)?
2. **Temporal Context UI**: Auto-generate `startMoment`/`endMoment` from scene summary?
3. **Batch Options**: "Generate start only" → Review → "Generate end" (iterative workflow)?
4. **Export**: How to export bookend data for external tools (2 images + metadata)?

### Workflow
1. **Hybrid Approach**: Allow mix of single/bookend scenes in same project?
2. **Video Transitions**: How do bookends interact with scene transitions (cuts, dissolves)?
3. **Shot-Level Bookends**: Extend to shot-level (currently scene-level proposal)?

**Action**: Document answers to these questions after Phase 1 research.

---

## Next Steps (Immediate)

### Before Implementation
1. **Research WAN2 Dual-Frame Support** (1-2 hours):
   - Read WAN2 ComfyUI documentation
   - Manual test in ComfyUI UI with 2 keyframes
   - Document findings in "Research Results" section below

2. **Prototype Workflow JSON** (30 min):
   - Create `workflows/video_wan2_bookends_prototype.json`
   - Hand-test with CLI: `python ComfyUI/main.py --input-workflow video_wan2_bookends_prototype.json`
   - Validate output quality

3. **Update Proposal** (30 min):
   - Add research findings
   - Refine workflow integration strategy based on results
   - Share with team for feedback

### Implementation Trigger
- Research validates dual-frame approach (WAN2 or AnimateDiff)
- User approval to proceed with Phase 1
- Current CFG testing complete (CFG 6.0 re-test if needed)

---

## Research Results

*[TO BE COMPLETED: Add findings from WAN2 multi-frame testing here]*

### WAN2 Native Support
- **LoadImage Node**: [Supports / Does not support] array input
- **Model Behavior**: [Interpolates between frames / Requires custom nodes]
- **Output Quality**: [Excellent / Good / Poor] temporal consistency
- **Recommendation**: [Use WAN2 native / Use AnimateDiff fallback]

### AnimateDiff Fallback (if needed)
- **Workflow Complexity**: [Simple / Moderate / Complex]
- **Performance**: [Comparable / Slower] than WAN2
- **IP-Adapter Schedule**: [Linear / Ease-in-out / Custom] works best
- **Recommendation**: [Viable fallback / Not recommended]

---

## Related Documentation
- `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md` - Current workflow specs
- `Documentation/Guides/LOCAL_GENERATION_SETTINGS_UI_GUIDE.md` - Settings UI patterns
- `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md` - Testing protocols
- `services/comfyUIService.ts` - Implementation reference (CFG 5.5 prompt engineering)

---

## Revision History
| Date | Version | Changes |
|------|---------|---------|
| 2025-11-23 | 1.0 | Initial proposal created after CFG 5.5 success (100% usable keyframes) |
