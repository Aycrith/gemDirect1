# Agent Handoff: FLUX Keyframe Fix - Nov 24, 2025

## Session Summary

Successfully fixed the FLUX workflow profile selection for keyframe generation. The application was ignoring the `imageWorkflowProfile: flux-t2i` setting and always using `wan-t2i` (Lumina/NetaYume) which produces comic book-style multi-panel images instead of single cohesive scenes.

## Problem Statement

**User Request**: "Ensure that video generation produces seamless, single-scene images without comic book-style presentations. Generate new, high-quality starting and ending images that depict only one cohesive scene each."

**Root Cause**: Hardcoded `'wan-t2i'` profile ID in `comfyUIService.ts` functions:
- Line 1695: `generateSceneKeyframeLocally()` - hardcoded `'wan-t2i'`
- Line 1735: `generateShotImageLocally()` - hardcoded `'wan-t2i'`

These functions ignored `settings.imageWorkflowProfile` entirely, causing FLUX configuration to be bypassed.

## Fix Applied

**File**: `services/comfyUIService.ts`

### Change 1: generateSceneKeyframeLocally (line ~1695)
```typescript
// BEFORE
const response = await queueComfyUIPrompt(settings, payloads, '', 'wan-t2i');

// AFTER
const imageProfile = settings.imageWorkflowProfile || 'wan-t2i';
console.log(`[generateSceneKeyframeLocally] Using image profile: ${imageProfile}`);
const response = await queueComfyUIPrompt(settings, payloads, '', imageProfile);
```

### Change 2: generateShotImageLocally (line ~1735)
```typescript
// BEFORE
const response = await queueComfyUIPrompt(settings, payloads, '', 'wan-t2i');

// AFTER
const imageProfile = settings.imageWorkflowProfile || 'wan-t2i';
console.log(`[generateShotImageLocally] Using image profile: ${imageProfile}`);
const response = await queueComfyUIPrompt(settings, payloads, '', imageProfile);
```

## Validation Results

### Console Output Comparison

**Before Fix**:
```
[wan-t2i] Workflow path: inline workflow | Canonical workflow: not detected
[wan-t2i] Human-Readable Prompt (CLIP) -> 6:text (CLIP Text Encode (Positive Prompt))
```
Output: `NetaYume_Lumina_3.5_00210_.png` (comic-style panels)

**After Fix**:
```
[generateSceneKeyframeLocally] Using image profile: flux-t2i
[flux-t2i] Workflow path: inline workflow | Canonical workflow: not detected
[flux-t2i] Human-Readable Prompt (CLIP) -> 6:text (CLIP Text Encode (Positive Prompt))
```
Output: `FLUX_keyframe_00001_.png` (single cohesive scene)

### Visual Validation

3 keyframes generated with FLUX, all showing single cohesive scenes:
- Scene 1: Astronaut in ancient alien temple corridor
- Scene 4: Figures on foggy plaza with buildings
- Scene 5: Sci-fi corridor/room environment

**No comic book panels or split-screen effects** in any FLUX-generated image.

## Related Changes (Previous Session)

These changes were made in a prior session to support FLUX profiles:

1. **`utils/contextConstants.ts`**: Added `{ id: 'flux-t2i', label: 'FLUX Text→Image (Keyframe)' }` to `WORKFLOW_PROFILE_DEFINITIONS`

2. **`utils/settingsValidation.ts`**: Fixed profile readiness check - T2I profiles only need CLIP text mapping, not keyframe image mapping

3. **`components/LocalGenerationSettingsModal.tsx`**: Fixed import logic to include `imageWorkflowProfile` and `videoWorkflowProfile` fields

## Configuration Required

Users must configure FLUX via Settings → ComfyUI Settings:
1. Import `localGenSettings.json` (contains pre-configured FLUX profile)
2. Or manually set `imageWorkflowProfile: 'flux-t2i'` in workflow profiles

**localGenSettings.json excerpt**:
```json
{
  "imageWorkflowProfile": "flux-t2i",
  "videoWorkflowProfile": "wan-i2v",
  "workflowProfiles": {
    "flux-t2i": {
      "id": "flux-t2i",
      "label": "FLUX Text→Image (Keyframe)",
      "workflowJson": "...",
      "mapping": {
        "human_readable_prompt": "6:text"
      }
    }
  }
}
```

## Status

| Component | Status |
|-----------|--------|
| FLUX profile definition | ✅ Working |
| Profile readiness validation | ✅ Working |
| Settings import | ✅ Working |
| Keyframe generation | ✅ **FIXED** |
| Shot image generation | ✅ **FIXED** |
| Video generation (bookend) | ⏸️ Separate feature - requires start+end keyframes |

## Next Steps for Future Agent

1. **Bookend Video Generation**: The "Generate Locally" button requires both start AND end keyframes for the sequential video generation workflow. This is a separate feature from the keyframe generation fix.

2. **Remaining Keyframes**: Scenes 2-3 failed to generate keyframes due to connection timeouts (transient network issue). Click "Generate 2 Keyframes" to retry.

3. **Test Full Pipeline**: Once bookend keyframes are available, test the complete video generation pipeline with FLUX-generated images.

## Files Modified This Session

- `services/comfyUIService.ts` - Added dynamic profile selection for keyframe generation

## Test Commands

```powershell
# Health check
npm run check:health-helper

# View current settings
Get-Content "C:\Dev\gemDirect1\localGenSettings.json" | ConvertFrom-Json | Select-Object -Property imageWorkflowProfile, videoWorkflowProfile
```

---
**Session Duration**: ~30 minutes
**Agent**: GitHub Copilot (Claude Opus 4.5)
**Date**: November 24, 2025
