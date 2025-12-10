# Implementation Plan: Next Steps

**Date**: 2025-12-09
**Status**: Active

## Completed Items (Recent)
- **P4.2 Benchmark Harness Integration**: ✅ Complete (2025-12-09). Fixed FFmpeg parser bug and verified pipeline integration.
- **Phase 9B Production Pipeline UI Extensions**: ✅ Complete (2025-12-05).

## Immediate Priorities

### 1. Full Workflow Test (UI Integration)
**Priority**: High
**Goal**: Validate the complete story-to-video workflow in the React UI with the new production settings.

**Tasks**:
- [ ] Configure LLM (Gemini API key OR LM Studio).
- [ ] Import workflow profiles via Settings.
- [ ] Generate: story → scenes → timeline → keyframe → video.
- [ ] Validate progress updates and error handling.
- [ ] Monitor for split-screen artifacts.

### 2. GenerationQueue ComfyUI Integration
**Priority**: High
**Goal**: Prevent GPU OOM in production by routing ComfyUI requests through the `GenerationQueue`.

**Tasks**:
- [ ] Create `queueComfyUIPromptWithQueue` wrapper in `videoGenerationService.ts`.
- [ ] Add integration tests for queue wrapper.
- [ ] Update `generateTimelineVideos` to use queue wrapper.
- [ ] Add GenerationQueuePanel to UI (Settings → ComfyUI tab).

### 3. E2E Test Environment Stabilization
**Priority**: Medium
**Goal**: Reduce flaky tests in CI by handling external service dependencies better.

**Tasks**:
- [ ] Add environment detection to skip tests when services are unavailable.
- [ ] Enhance mocking using `service-mocks.ts`.

## Future Phases

### Phase 3: Advanced Features
- **Stable Video Infinity (SVI)**: Workflow and UI integration.
- **ControlNet Integration**: Pose/depth sequence support.

### Phase 4: Premium Keyframes
- **Z-Image Turbo**: Integration for high-quality keyframes.
- **VACE Transitions**: Clip joiner workflow.
