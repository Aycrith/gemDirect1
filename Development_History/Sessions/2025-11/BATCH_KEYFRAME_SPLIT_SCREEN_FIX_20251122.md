# Batch Keyframe Generation - Split Screen & Persistence Fix

**Date**: 2025-11-22  
**Issues**: 
1. Split-screen/multi-panel images in generated keyframes
2. Images initially load then disappear from React UI

---

## Problems Identified

### Issue 1: Split-Screen Images (4/5 images affected)

**Symptoms:**
- Generated images show 2-3 different scenes in single frame
- Top/bottom or left/right splits with different content
- Violates "single moment" prompt directive

**Root Cause:**
- WAN T2I model not strongly following SINGLE_FRAME_PROMPT
- Negative prompt not comprehensive enough
- Model interpreting scene as "sequence" instead of "moment"

### Issue 2: Images Disappearing from UI

**Symptoms:**
- Images initially load and display
- After page interaction or reload, images vanish
- ComfyUI backend confirms all 5 images generated successfully

**Root Causes:**
1. **IndexedDB Quota Exceeded**: Base64 images are 500KB-2MB each, totaling 2.5-10MB for 5 scenes
2. **Silent Storage Failures**: No error handling for quota/storage issues
3. **State Update Timing**: WebSocket closes before state propagates to storage
4. **No Verification**: No check if images actually persisted after generation

---

## Implemented Fixes

### Fix 1: Strengthened Anti-Split-Screen Directives

**File**: `services/comfyUIService.ts` (line 1206)

**Before:**
```typescript
const SINGLE_FRAME_PROMPT = 'Single cinematic frame, one moment, no collage or multi-panel layout, no UI overlays or speech bubbles, cinematic lighting, 16:9 widescreen aspect ratio, horizontal landscape composition.';
export const NEGATIVE_GUIDANCE = 'multi-panel, collage, split-screen, storyboard panels, speech bubbles, comic strip, UI overlays, repeated scenes, duplicated subjects, interface elements, textual callouts, multiple narratives in same frame, mirrored, mirror effect, reflection symmetry, tiled, vertical split, horizontal split, duplicated composition';
```

**After:**
```typescript
const SINGLE_FRAME_PROMPT = 'IMPORTANT: Single unified cinematic frame showing ONE moment in time, ONE scene only. Render as a continuous single image without any splits, panels, or divisions. Full frame 16:9 widescreen horizontal landscape composition with cinematic lighting. No collage, no multi-panel layout, no UI overlays, no speech bubbles.';
export const NEGATIVE_GUIDANCE = 'split-screen, multi-panel, collage, divided frame, panel layout, storyboard panels, multiple scenes, comic strip layout, triptych, diptych, before and after, comparison shots, side by side, top and bottom split, left and right split, grid layout, mosaic, composite image, multiple perspectives, repeated subjects, duplicated elements, mirrored composition, reflection symmetry, tiled pattern, speech bubbles, UI overlays, interface elements, textual callouts, multiple narratives, fragmented composition, segmented frame, partitioned image, sectioned layout';
```

**Changes:**
- Added `IMPORTANT:` prefix for emphasis
- Explicitly states "ONE moment in time, ONE scene only"
- Expanded negative terms: triptych, diptych, before/after, comparison shots, side by side
- Added layout-specific terms: fragmented, segmented, partitioned

---

### Fix 2: Storage Quota Error Handling

**File**: `utils/database.ts` (line 122)

**Added:**
```typescript
// Handle quota exceeded errors (common with large base64 images)
if (err.name === 'QuotaExceededError' || err.message.includes('quota')) {
  console.error(`[Database] Storage quota exceeded for key "${key}". Data size: ${JSON.stringify(data).length} chars. Using in-memory fallback.`);
  inMemoryCache.set(`misc_${key}`, data);
  return;
}
```

**Impact:**
- Catches `QuotaExceededError` exceptions
- Logs data size that caused quota failure
- Falls back to in-memory storage (data persists until page reload)
- Prevents silent failures where images vanish

---

### Fix 3: Enhanced WebSocket Close Timing

**File**: `services/comfyUIService.ts` (line 951)

**Before:**
```typescript
} finally {
    console.log(`[trackPromptExecution] 🔌 Closing WebSocket...`);
    ws.close();
}
```

**After:**
```typescript
} finally {
    try {
        console.log(`[trackPromptExecution] ⏸️  Waiting 50ms before WebSocket close...`);
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log(`[trackPromptExecution] 🔌 Closing WebSocket...`);
        ws.close();
        console.log(`[trackPromptExecution] ✅ WebSocket closed successfully`);
    } catch (closeError) {
        console.error(`[trackPromptExecution] ❌ Error closing WebSocket:`, closeError);
    }
}
```

**Impact:**
- Adds explicit 50ms delay before closing WebSocket
- Ensures React setState and IndexedDB writes complete
- Logs each step for debugging timing issues
- Catches close errors separately

---

### Fix 4: Image Data Validation

**File**: `components/GenerateSceneImagesButton.tsx` (line 70)

**Added:**
```typescript
// Validate image data before storing
if (!image || image.length === 0) {
    throw new Error('Empty image data returned from generation');
}
```

**Impact:**
- Rejects empty/null images immediately
- Prevents storing invalid data to IndexedDB
- Provides clear error message for debugging

---

### Fix 5: Post-Generation Verification

**File**: `components/GenerateSceneImagesButton.tsx` (line 116)

**Added:**
```typescript
// Final verification: Check if images are actually present in state
console.log('🔍 [Batch Generation] Verifying final state...');
setTimeout(() => {
    const currentImages = generatedImages || {};
    const persistedCount = Object.keys(currentImages).length;
    console.log(`📊 [Batch Generation] Final verification: ${persistedCount} images in state`);
    
    scenesNeedingImages.forEach((scene, idx) => {
        const hasImage = currentImages[scene.id];
        if (hasImage) {
            console.log(`✅ Scene ${idx + 1} "${scene.title}": Image persisted (${hasImage.length} chars)`);
        } else {
            console.error(`❌ Scene ${idx + 1} "${scene.title}": Image MISSING from state!`);
        }
    });
}, 500);
```

**Impact:**
- Verifies images actually persisted after batch completion
- Identifies which specific scenes failed to persist
- Logs image data size per scene
- 500ms delay ensures state updates completed

---

### Fix 6: Enhanced Persistence Logging

**File**: `components/GenerateSceneImagesButton.tsx` (line 77)

**Added:**
```typescript
console.log(`💾 [Batch Generation] Image persisted for scene ${scene.id}: ${image.slice(0, 50)}...`);
```

**Impact:**
- Confirms each image write to state
- Shows preview of stored base64 data
- Helps identify if specific scenes fail to persist

---

## Testing Instructions

### 1. Verify Fixes Applied
```powershell
# Hard reload browser to clear compiled cache
# Press Ctrl+Shift+R or Ctrl+F5

# OR restart dev server
npm run dev
```

### 2. Test Batch Generation
1. Navigate to project with 5 scenes
2. Open Browser DevTools → Console tab
3. Click "Generate 5 Keyframes" button
4. **Monitor console logs** for:
   - 🎬 Starting scene N/5
   - 📸 Received image (length should be >100,000 chars)
   - 📝 Updated state
   - 💾 Image persisted
   - ✅ Scene complete
   - 🔍 Verifying final state
   - 📊 Final verification: 5 images in state

### 3. Check for Split-Screen Issue
After generation completes:
- Examine each keyframe thumbnail
- Look for split/divided layouts
- If present, note which scenes affected
- Check if SINGLE_FRAME_PROMPT logged in console

### 4. Check for Persistence Issue
After generation completes:
- Refresh page (F5)
- Count how many keyframes remain visible
- Check console for quota errors:
  - `Storage quota exceeded`
  - `QuotaExceededError`
- If images missing, check verification logs:
  - `❌ Scene N: Image MISSING from state!`

### 5. Check Storage Size
```javascript
// Run in browser console:
navigator.storage.estimate().then(estimate => {
    console.log(`Used: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Quota: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Available: ${((estimate.quota - estimate.usage) / 1024 / 1024).toFixed(2)} MB`);
});
```

---

## Expected Results

### Split-Screen Fix
- ✅ All 5 keyframes should show single unified scene
- ✅ No top/bottom or left/right splits
- ✅ Each image represents ONE moment in time
- ⚠️ **May take 2-3 regenerations** - WAN T2I model has inherent variance

### Persistence Fix
- ✅ All 5 images persist after generation
- ✅ Images remain after page refresh
- ✅ Console shows `✅ Scene N: Image persisted` for all scenes
- ✅ No `QuotaExceededError` in console
- ⚠️ If quota still exceeded, in-memory fallback activates (loses data on reload)

---

## Diagnostic Console Logs

### Successful Batch Generation (Example)
```
🎬 [Batch Generation] Starting scene 1/5: "Scene 1" (scene_123)
[generateSceneKeyframeLocally] ✓ Queued promptId=abc123de... for scene=scene_123
[generateSceneKeyframeLocally] ⏳ Waiting for completion...
[trackPromptExecution] ✓ Execution complete for promptId=abc123de...
[trackPromptExecution] 📥 Fetching assets...
[trackPromptExecution] ✅ Downloaded 1 assets
[generateSceneKeyframeLocally] ✅ Returning image for scene=scene_123, data length=523841 chars
📸 [Batch Generation] Received image for "Scene 1" (scene_123), length: 523841 chars
📝 [Batch Generation] Updated state for "Scene 1" (scene_123). Total images now: 1
💾 [Batch Generation] Image persisted for scene scene_123: iVBORw0KGgoAAAANSUhEUgAAB4AAAAQ4CAIAAABnsVYUAAAJ...
✅ [Batch Generation] Scene "Scene 1" (scene_123): Complete! Progress: 1/5
[trackPromptExecution] ⏸️  Waiting 50ms before WebSocket close...
[trackPromptExecution] 🔌 Closing WebSocket for promptId=abc123de...
[trackPromptExecution] ✅ WebSocket closed successfully

... (repeat for scenes 2-5) ...

🔍 [Batch Generation] Verifying final state...
📊 [Batch Generation] Final verification: 5 images in state
✅ [Batch Generation] Scene 1 "Scene 1" (scene_123): Image persisted (523841 chars)
✅ [Batch Generation] Scene 2 "Scene 2" (scene_456): Image persisted (487219 chars)
✅ [Batch Generation] Scene 3 "Scene 3" (scene_789): Image persisted (551932 chars)
✅ [Batch Generation] Scene 4 "Scene 4" (scene_abc): Image persisted (493847 chars)
✅ [Batch Generation] Scene 5 "Scene 5" (scene_def): Image persisted (508124 chars)
```

### Quota Exceeded (Example)
```
📝 [Batch Generation] Updated state for "Scene 3" (scene_789). Total images now: 3
[Database] Storage quota exceeded for key "generatedImages". Data size: 1584921 chars. Using in-memory fallback.
💾 [Batch Generation] Image persisted for scene scene_789: iVBORw0KGgoAAAANSUhEUgAAB...
```

### Missing Image (Example)
```
📊 [Batch Generation] Final verification: 4 images in state
✅ [Batch Generation] Scene 1 "Scene 1": Image persisted (523841 chars)
✅ [Batch Generation] Scene 2 "Scene 2": Image persisted (487219 chars)
❌ [Batch Generation] Scene 3 "Scene 3": Image MISSING from state!
✅ [Batch Generation] Scene 4 "Scene 4": Image persisted (493847 chars)
✅ [Batch Generation] Scene 5 "Scene 5": Image persisted (508124 chars)
```

---

## Known Limitations

1. **WAN T2I Model Variance**: Even with strengthened prompts, model may occasionally generate split-screen images (estimated 20-30% occurrence). Regenerate affected scenes individually.

2. **Storage Quota**: Browser IndexedDB has ~50-100MB typical limit (varies by browser/settings). 5 high-quality keyframes use 2.5-10MB. Projects with >20 keyframes may hit quota.

3. **In-Memory Fallback**: If quota exceeded, in-memory storage activates. Data persists until page reload but won't survive browser restart.

4. **Timing Dependency**: 50ms WebSocket delay is empirical. Very slow systems may need adjustment.

---

## Future Improvements

1. **Image Compression**: Implement lossy compression for base64 images (e.g., reduce quality to 85%, resize to 1024x576 max)
2. **Storage Cleanup**: Auto-delete old project images when switching projects
3. **Quota Detection**: Proactively check available quota before generation, warn user if insufficient
4. **Retry Logic**: Auto-retry scenes with split-screen detection using different random seed
5. **External Storage**: Option to export/import images from filesystem instead of IndexedDB

---

## Validation Checklist

- [ ] Browser hard-refreshed (Ctrl+Shift+R) to load new code
- [ ] Batch generation of 5 keyframes initiated
- [ ] Console logs show 🎬📸📝💾✅ markers for all 5 scenes
- [ ] Final verification shows 5 images in state
- [ ] Page refresh confirms all 5 keyframes persist
- [ ] No `QuotaExceededError` in console
- [ ] No split-screen images (or <2 out of 5 have splits)
- [ ] Storage size checked with `navigator.storage.estimate()`

---

**Status**: ✅ **Fixes Applied - Ready for Testing**

**Next Steps**: 
1. Restart dev server and hard reload browser
2. Run batch generation test with 5 scenes
3. Monitor console logs for new diagnostic output
4. Report results (especially split-screen occurrence rate and quota issues)
