# Agent Handoff: VAE Version Mismatch Fix

**Date**: 2025-12-02  
**Session Type**: Bug Fix  
**Status**: ⚠️ FIX APPLIED - VALIDATION REQUIRED

---

## 🎯 Executive Summary

Fixed critical VAE version mismatch causing bookend video generation to fail with tensor dimension errors. The fix changes the VAE from `wan_2.1_vae.safetensors` to `wan2.2_vae.safetensors` in affected workflow profiles.

**⚠️ CRITICAL: The fix has NOT been tested yet. The next agent must:**
1. Reimport workflow profiles in browser
2. Retest bookend video generation
3. Verify video output is valid

---

## 🐛 Bug Description

### Symptoms
- User waited 44+ minutes for video generation
- Generation failed at VAE decode step
- Error: `Expected tensor to have size 16 at dimension 1, but got size 48`

### Root Cause
**VAE version mismatch** between the UNet model and VAE decoder:

| Component | Version | Channel Size |
|-----------|---------|--------------|
| UNet Model | WAN 2.2 5B | 48 channels |
| VAE (broken) | WAN 2.1 | 16 channels |
| VAE (working) | WAN 2.2 | 48 channels |

The WAN 2.2 UNet outputs 48-channel latents, but the WAN 2.1 VAE expects 16-channel latents. This mismatch causes the tensor dimension error during VAE decode.

### Evidence
The working `wan-i2v` profile uses `wan2.2_vae.safetensors`. The failing `wan-flf2v` profile was using `wan_2.1_vae.safetensors`.

---

## ✅ Changes Made

### 1. TimelineEditor.tsx
**Location**: Line ~1448 in `generateVideoFromBookendsNative` function

```typescript
// BEFORE
const workflowProfile = 'wan-fun-inpaint';

// AFTER
const workflowProfile = 'wan-flf2v';
```

**Reason**: `wan-flf2v` uses `WanFirstLastFrameToVideo` node which natively supports both `start_image` and `end_image` inputs for bookend generation.

### 2. localGenSettings.json
**Profiles Updated**: `wan-flf2v`, `wan-fun-inpaint`, `wan-fun-control`

```json
// BEFORE
"vae_name": "wan_2.1_vae.safetensors"

// AFTER
"vae_name": "wan2.2_vae.safetensors"
```

### 3. Workflow Files
**Files Updated**:
- `workflows/video_wan2_2_5B_flf2v.json` (Node 2)
- `workflows/video_wan2_2_5B_fun_control.json` (Node 2)

Same VAE change: `wan_2.1_vae.safetensors` → `wan2.2_vae.safetensors`

---

## 📋 Next Steps for Validation

### Step 1: Reimport Workflow Profiles
1. Open the app in browser (http://localhost:3000)
2. Click Settings icon (⚙️)
3. Go to **ComfyUI Settings** tab
4. Click **Import from File** in Workflow Profiles section
5. Select `localGenSettings.json`
6. Verify profiles load with green checkmarks

### Step 2: Test Bookend Video Generation
1. Ensure **Bookend mode** is enabled in Settings
2. Navigate to Scene 1 (should have Start and End keyframes)
3. Click **Generate Video**
4. Monitor ComfyUI queue (http://127.0.0.1:8188)

### Step 3: Verify Success
- ✅ Generation completes without tensor errors
- ✅ Video file is created
- ✅ Video plays correctly in browser

### Step 4: If Successful
```bash
git add -A
git commit -m "fix(video): correct VAE version mismatch for WAN 2.2 workflows"
```

---

## 🔧 Environment State

| Service | Status | URL |
|---------|--------|-----|
| ComfyUI | ✅ Running | http://127.0.0.1:8188 |
| Dev Server | ✅ Running | http://localhost:3000 |
| LM Studio | ✅ Running | http://192.168.50.192:1234 |

**LLM Model**: `mistralai/mistral-nemo-instruct-2407`  
**Keyframe Mode**: Dual Keyframes (Bookend) - EXPERIMENTAL  
**Video Workflow**: `wan-flf2v`

---

## 📁 Files Modified This Session

| File | Change |
|------|--------|
| `components/TimelineEditor.tsx` | Changed bookend profile to `wan-flf2v` |
| `localGenSettings.json` | Fixed VAE in 3 profiles |
| `workflows/video_wan2_2_5B_flf2v.json` | Fixed VAE in node 2 |
| `workflows/video_wan2_2_5B_fun_control.json` | Fixed VAE in node 2 |
| `agent/.state/session-handoff.json` | Updated with this session's context |

---

## ⚠️ Known Issues

### 14B Workflow Files
The 14B workflow files (`video_wan2_2_14B_fun_inpaint.json`, `video_wan2_2_14B_fun_control.json`, `video_wan2_2_14B_flf2v.json`) still have references to `wan_2.1_vae.safetensors` in documentation/metadata sections. These are not blocking because:
- The 14B models require more VRAM than available
- The references are in metadata, not active node configs
- Can be fixed later for consistency

### TypeScript Errors
4 unused variable errors (non-blocking):
- `queueMetrics.ts`
- `generation-queue.spec.ts`

---

## 🔗 Related Documentation

- `Documentation/PROJECT_STATUS_CONSOLIDATED.md` - Project overview
- `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md` - ComfyUI mappings
- `Workflows/ComfyUI/COMFYUI_WORKFLOW_INDEX.md` - Workflow profiles
- `agent/.state/session-handoff.json` - Machine-readable handoff

---

## 📝 Session Notes

### Timeline
1. User reported 44+ minute video generation failed
2. Error identified as tensor dimension mismatch at VAE decode
3. Compared working `wan-i2v` profile with failing `wan-flf2v`
4. Root cause: VAE version mismatch (2.1 vs 2.2)
5. Applied fix to config files and workflow JSON files
6. Created handoff for validation

### Key Insight
The working `wan-i2v` profile was the reference for the fix. It correctly uses `wan2.2_vae.safetensors` which matches the WAN 2.2 UNet's 48-channel output.
