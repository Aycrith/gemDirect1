#!/usr/bin/env markdown
# 📚 START HERE: Quick Context for gemDirect1

**Last Updated**: November 28, 2025  
**For**: Next AI Coding Agent  
**Project**: gemDirect1 – AI Cinematic Story-to-Video Generator  
**Current Status**: ✅ **PRODUCTION-READY** – Phase 7 Complete (~98%)

---

## 🎯 QUICK START (5 Minutes)

### What This Is
**gemDirect1** transforms text story prompts into complete video timelines with:
- **Gemini AI** for story/scene/shot generation
- **ComfyUI + WAN2 workflows** for keyframe images and video rendering
- **React + TypeScript** frontend with IndexedDB persistence

### Current State (November 28, 2025)
| Metric | Status |
|--------|--------|
| **Phase** | 7 - Feature Completion |
| **Completion** | ~98% Production-Ready |
| **Unit Tests** | 1,439/1,439 (100%) ✅ |
| **E2E Tests** | 117/117 runnable (100%) ✅ |
| **Build** | Zero TypeScript errors ✅ |
| **Feature Flags** | 23/23 implemented (0 "Coming Soon") ✅ |
| **Performance** | FCP 188ms (target <900ms) ✅ |

### Essential Commands
```powershell
# Prerequisites
node -v                           # Must be ≥22.19.0
npm run check:health-helper       # Verify ComfyUI ready

# Build & Test
npm run build                     # Should complete with 0 errors
npm test -- --run                 # Should show 1,439 tests passing
npx playwright test               # E2E tests (117 runnable)

# Run Full Pipeline
pwsh -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
```

---

## 📚 KEY DOCUMENTATION

### Single Source of Truth
📄 **`Documentation/PROJECT_STATUS_CONSOLIDATED.md`** - Complete project status, metrics, session history

### Architecture Reference
📄 **`Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md`** - ComfyUI node mappings, workflow structure

### Copilot Instructions
📄 **`.github/copilot-instructions.md`** - Project conventions, patterns, common fixes

### Archived Handoffs
📂 **`docs/archived/root-docs-2025-11/`** - Historical handoff documents (177+ files)

---

## 🏗️ ARCHITECTURE OVERVIEW

### Service Layer (Critical Pattern)
**Never call APIs directly from components.** All external interactions route through:
- `services/geminiService.ts` — Gemini API with retry/backoff
- `services/comfyUIService.ts` — ComfyUI integration + validation
- `services/narrativeCoherenceService.ts` — Narrative state tracking
- `services/ipAdapterService.ts` — Character consistency via IP-Adapter
- `services/videoUpscalingService.ts` — Post-processing upscaling

### State Management
- **Zustand Store** (`useSceneStateStore`) — Unified scene state
- **IndexedDB** (`usePersistentState`) — Auto-persisted user data
- **React Context** — Cross-cutting concerns (API status, usage)

### Feature Flags
22 feature flags control progressive rollout:
- `narrativeStateTracking` (default: true) - Narrative coherence
- `characterConsistency` (default: false) - IP-Adapter integration
- `videoUpscaling` (default: false) - Post-processing upscaler

### Keyframe Mode Setting
- `LocalGenerationSettings.keyframeMode` controls keyframe generation ('single' | 'bookend')
- Default: 'single' - generates one keyframe per scene
- 'bookend' mode generates start+end keyframes for better temporal consistency

---

## ✅ RECENTLY COMPLETED (Phase 7)

### Full Front-to-Back Service Integration
1. **narrativeCoherenceService** ✅ - Tracks narrative state across scenes/shots
2. **ipAdapterService** ✅ - Character reference images flow through pipeline
3. **videoUpscalingService** ✅ - Post-processing ready (opt-in)
4. **sceneTransitionService** ✅ - Shot-level continuity context

### TimelineEditor UI Updates
- Feature indicator badges (📖 Narrative, 👤 Character, 🎬 Continuity, ⬆️ Upscaling)
- Both `generateTimelineVideos` calls pass Phase 7 options

### Dual-Keyframe Workflows
- `workflows/video_wan2_2_5B_flf2v.json` - Native start/end keyframe interpolation
- `workflows/video_wan2_2_5B_fun_inpaint.json` - Smoother motion
- `workflows/video_wan2_2_5B_fun_control.json` - Control-based video

---

## 🔧 OPTIONAL ENHANCEMENTS (Not Started)

### IP-Adapter Full Workflow Injection
**Status**: Payload prep wired, node injection not automatic  
**Work**: Call `prepareIPAdapterPayload()` in `queueComfyUIPrompt()`, merge into workflow

### Video Upscaling Auto-Trigger
**Status**: Service wired, not auto-called (opt-in by design)  
**Work**: Add "Upscale Video" button in UI for finalized videos

### Narrative State Persistence
**Status**: State created per session  
**Enhancement**: Persist to IndexedDB for multi-session continuity

---

## 🚨 CRITICAL CONVENTIONS

### DO ✅
- Read `.github/copilot-instructions.md` first
- Use service layer for all external API calls
- Run tests before/after changes: `npm test -- --run`
- Check `Documentation/PROJECT_STATUS_CONSOLIDATED.md` for current state

### DON'T ❌
- Call APIs directly from React components
- Skip reading copilot-instructions.md
- Use backslashes in ComfyUI paths (use forward slashes)
- Kill ComfyUI without graceful shutdown

---

## 📊 TEST COVERAGE

| Category | Tests | Status |
|----------|-------|--------|
| Unit Tests | 1,439 | 100% ✅ |
| E2E Runnable | 117 | 100% ✅ |
| E2E Skipped | 51 | Documented |
| Component Tests | 67 | 100% ✅ |
| Service Tests | 150+ | 100% ✅ |

---

## 🔗 QUICK LINKS

- 📄 [README.md](README.md) – Project setup
- 📄 [Documentation/PROJECT_STATUS_CONSOLIDATED.md](Documentation/PROJECT_STATUS_CONSOLIDATED.md) – **Single Source of Truth**
- 📄 [.github/copilot-instructions.md](.github/copilot-instructions.md) – Agent guidelines
- 📄 [Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md](Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md) – ComfyUI reference

---

**Phase 7 is complete. The system is production-ready.** 🚀
