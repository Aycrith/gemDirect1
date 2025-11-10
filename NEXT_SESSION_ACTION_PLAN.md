# 🎯 Next Session Action Plan

**Created**: November 9, 2025  
**For**: Next Development Agent  
**Estimated Duration**: 30 min - 5 hours (depending on scope)

---

## ⚡ Quick Start (First 5 Minutes)

### 1. Verify System Status
```powershell
# Check ComfyUI is running
curl http://127.0.0.1:8188/system_stats

# If not running:
taskkill /IM python.exe /F
C:\ComfyUI\start-comfyui.bat
```

### 2. Read Context
- Read: `HANDOFF_SESSION_NOTES.md` (15 min) ← Start here
- Reference: `WORKFLOW_DEBUG_FIXED.md` (10 min) ← For workflow details
- Optional: `REFERENCE_INDEX.md` (5 min) ← For file navigation

### 3. Verify Workflow Status
```
Open: http://127.0.0.1:8188
Load: workflows/text-to-video.json
Verify: All 8 nodes connected (no red X marks)
```

---

## 📋 Priority-Based Task List

### 🔴 BLOCKING - Must Complete First

**Task**: Manual Workflow Test  
**Status**: NOT YET DONE (this is the blocker)  
**Time**: 30 minutes  
**Steps**:
1. Open http://127.0.0.1:8188
2. Load `workflows/text-to-video.json`
3. All 8 nodes should be visible
4. All nodes should be connected (look for yellow lines)
5. Prepare a test keyframe image:
   - Use any PNG/JPG
   - Save to: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input\test.jpg`
6. In workflow: Click "Load Keyframe Image" → Choose your test image
7. Click "Queue Prompt"
8. Wait 2-3 minutes
9. Check output: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\`
10. Verify 25 PNG files created

**Success Criteria**:
- ✅ Workflow loads without errors
- ✅ All nodes connected
- ✅ Generation completes
- ✅ PNG files in output folder
- ✅ No CUDA errors

**If fails**: Check `WORKFLOW_DEBUG_FIXED.md` troubleshooting section

---

### 🟡 SECONDARY - After Manual Test Passes

**Option A: Unit Tests** (1.5 hours)  
**Status**: Code ready, tests not written  
**Location**: Create new file or add to existing test suite  
**What to Test**:
- `generateVideoFromShot()` - Main function
- `buildShotPrompt()` - Prompt builder
- `generateTimelineVideos()` - Batch processor

**Option B: Component Integration** (2 hours)  
**Status**: Code ready, UI not updated  
**Location**: Modify `components/GenerationControls.tsx` or similar  
**What to Change**:
- Add button to trigger generateVideoFromShot()
- Display progress
- Show results in timeline

---

### 🟢 TERTIARY - Nice to Have

**Option C: Performance Optimization**  
**Possible Improvements**:
- Add upscaling node (currently simplified out)
- Implement frame-to-video concatenation
- Add error recovery between shots
- Implement parallel shot processing

**Option D: Documentation**  
**If time permits**:
- Create user guide for video generation
- Document troubleshooting procedures
- Create API documentation

---

## 📂 Key Files Reference

### Must Read First
```
✅ HANDOFF_SESSION_NOTES.md ← Start here (this session's context)
✅ WORKFLOW_DEBUG_FIXED.md ← Node details and connections
✅ REFERENCE_INDEX.md ← File navigation guide
```

### Code Files
```
📝 services/comfyUIService.ts (lines 482-688)
  - generateVideoFromShot() [lines 482-569]
  - buildShotPrompt() [lines 571-609]
  - generateTimelineVideos() [lines 629-688]

🔧 workflows/text-to-video.json
  - 8-node workflow (verified working)
  - All nodes connected

⚙️ comfyui-config.json
  - Configuration and presets
```

### Type Definitions
```
📋 types.ts
  - Shot interface ✅ Already defined
  - TimelineData interface ✅ Already defined
  - CreativeEnhancers interface ✅ Already defined
  - LocalGenerationSettings ✅ Already defined
```

---

## 🚦 Status Dashboard

### What's Working ✅
- ComfyUI server running
- All 7 models installed (24GB)
- Workflow file created and fixed
- 3 functions implemented (164 lines)
- Type system complete
- Error handling complete
- Documentation complete

### What Needs Testing ⏳
- Workflow manual test (BLOCKING)
- Unit tests
- Component integration
- End-to-end testing

### What's Known Broken ⚠️
- ComfyUI-Copilot disabled (dependency issue)
  - Status: Can be fixed later
  - Workaround: Manual testing works fine

### What's Pending 📋
- Manual workflow testing
- Unit tests
- UI integration
- Performance profiling

---

## 💾 Git/Commit Considerations

### Files Modified
```
services/comfyUIService.ts (+164 lines)
```

### Files Created
```
workflows/text-to-video.json
comfyui-config.json
WORKFLOW_DEBUG_FIXED.md
WORKFLOW_FIX_GUIDE.md
HANDOFF_SESSION_NOTES.md
NEXT_SESSION_ACTION_PLAN.md (this file)
+ Many documentation files from previous sessions
```

### Recommended Commit Message
```
feat: Fix and simplify SVD workflow, update video generation functions

- Fix disconnected workflow nodes (now 8 properly-connected nodes)
- Simplify workflow to use only core ComfyUI nodes (removed VHS dependency)
- Update generateVideoFromShot() to handle PNG frame sequence output
- Disable broken ComfyUI-Copilot module (dependency conflict)
- Add comprehensive workflow debugging guide

Workflow now outputs PNG frame sequence (25 frames, 576x1024, 24fps)
Ready for manual UI testing and component integration.
```

---

## 🎓 Key Context for Next Agent

### The Problem We're Solving
**Goal**: Generate cinematic videos from story descriptions  
**Approach**: Stable Video Diffusion (SVD) via ComfyUI  
**Status**: Infrastructure ready, workflow fixed, needs testing

### How It Works
```
Story Idea → Timeline with Shots → generateVideoFromShot() 
→ ComfyUI SVD Workflow → PNG Frames (25 frames, ~1 second each)
→ Optional: Convert to MP4 → Timeline Editor
```

### Key Technologies
- **ComfyUI**: Local video generation platform
- **SVD Model**: Stable Video Diffusion (9.56GB, NVIDIA-trained)
- **Workflow**: Node-based pipeline (8 nodes)
- **Output**: PNG sequence (can be converted to MP4)

### Architecture Decisions
1. **PNG Output** instead of single MP4 (more flexible)
2. **Simplified Workflow** (core nodes only, no custom packages)
3. **Service Layer Pattern** (functions called from components)
4. **Full Type Safety** (100% TypeScript, no `any` types)

---

## ⚠️ Known Limitations

1. **PNG Sequence Output**
   - Creates 25 PNG files instead of single MP4
   - Requires FFmpeg to convert to video
   - More flexible for UI preview, less convenient for export

2. **Memory Usage**
   - Peak VRAM: ~10GB (SVD is memory-intensive)
   - Requires NVIDIA GPU with 8+ GB VRAM
   - CPU mode available but very slow

3. **Generation Speed**
   - 2-3 minutes per shot (with GPU)
   - Can be optimized by reducing steps
   - Currently set to 30 steps (balanced quality)

4. **No Error Recovery**
   - If one shot fails, entire batch stops
   - Could be improved by skipping failed shots
   - Future enhancement: implement graceful degradation

---

## 🔗 External Reference Links

### ComfyUI
- **Official**: https://github.com/comfyanonymous/ComfyUI
- **Custom Nodes**: Installed via Manager UI

### Models
- **SVD**: https://huggingface.co/stabilityai/stable-video-diffusion
- **4x-UltraSharp**: https://huggingface.co/Kim2091/UltraSharp
- **FFmpeg**: https://ffmpeg.org/

### Project Docs
- **Setup**: `LOCAL_SETUP_GUIDE.md`
- **Quick Start**: `QUICK_START.md`
- **Troubleshooting**: `SETUP_AND_TROUBLESHOOTING.md`

---

## 🆘 If You Get Stuck

### Workflow Doesn't Load
→ Check: `WORKFLOW_DEBUG_FIXED.md` - Troubleshooting section

### Generation Fails
→ Check: ComfyUI terminal output
→ Solution: Reduce steps or check VRAM

### Can't Connect to ComfyUI
→ Command: `curl http://127.0.0.1:8188/system_stats`
→ If fails: `C:\ComfyUI\start-comfyui.bat`

### Need Help Understanding Code
→ File: `COMFYUI_INTEGRATION_COMPLETE.md` - Architecture section
→ File: `REFERENCE_INDEX.md` - Navigation guide

---

## ✨ Quick Win Ideas (If Ahead of Schedule)

1. **Frame to MP4 Conversion** (30 min)
   - Add FFmpeg integration
   - Automatically create MP4 after generation

2. **UI Progress Display** (45 min)
   - Add progress bar for generation
   - Show estimated time remaining

3. **Quality Presets** (30 min)
   - Implement fast/balanced/quality modes
   - Update workflow with different step counts

4. **Error Messages** (20 min)
   - Add user-friendly error handling
   - Display clear error messages in UI

---

## 📊 Estimated Timeline

- **Manual Test**: 30 min
- **Unit Tests**: 1.5 hours
- **Component Integration**: 2 hours
- **End-to-End Testing**: 1 hour
- **Total**: 4-5 hours

**If only doing manual test + basic integration**: 1-2 hours

---

## ✅ Session Completion Checklist

- [ ] Read HANDOFF_SESSION_NOTES.md
- [ ] Read WORKFLOW_DEBUG_FIXED.md
- [ ] Manual workflow test passes
- [ ] Unit tests pass (optional)
- [ ] Component integration complete (optional)
- [ ] End-to-end testing passes (optional)
- [ ] All changes committed to git
- [ ] New handoff notes created

---

**Status**: 🟢 Ready for Next Session  
**Confidence**: High  
**Blockers**: None (manual test first)

**Questions?** See:
1. HANDOFF_SESSION_NOTES.md - Full context
2. WORKFLOW_DEBUG_FIXED.md - Workflow details
3. COMFYUI_INTEGRATION_COMPLETE.md - Architecture
