# Agent Handoff: Pipeline Orchestration (P4.4)

**Date**: 2025-12-11
**Status**: Beta Implementation Complete

## Summary
Implemented the core Pipeline Orchestration system to manage multi-step generation workflows (Keyframe -> Video -> Upscale). This replaces the legacy hardcoded loops with a robust, dependency-aware task execution engine.

## Changes
1.  **Pipeline Engine & Store**:
    -   Verified `services/pipelineEngine.ts` and `services/pipelineStore.ts` are functional and integrated.
    -   Engine supports DAG dependencies, persistence, and concurrency control via `GenerationQueue`.

2.  **Task Registry Updates**:
    -   Updated `services/pipelineTaskRegistry.ts` to support **IP-Adapter** (Character Consistency) by passing `visualBible` and `characterReferenceImages` to `queueComfyUIPromptWithQueue`.
    -   Added integration with `generationStatusStore` so pipeline tasks update the global UI status (progress bars, chips).

3.  **Pipeline Factory**:
    -   Added `createSceneGenerationPipeline` to `services/pipelineFactory.ts`. This factory creates a dependency graph for a scene:
        -   Video Generation (depends on Keyframe).
        -   FLF2V (Video N depends on Video N-1).
        -   Upscaling (depends on Video).
        -   Interpolation (depends on Upscale or Video).

4.  **UI Integration**:
    -   Created `components/PipelineGenerationButton.tsx` as a "Beta" feature.
    -   Added this button to `components/TimelineEditor.tsx` next to the existing "Generate Video" button.
    -   Verified `PipelineStatusPanel` is present in `App.tsx` to visualize pipeline progress.

## Verification
-   **Manual Verification**: Code review of `PipelineEngine`, `TaskRegistry`, and `TimelineEditor` integration points.
-   **Integration**: The "Pipeline Generate (Beta)" button is now available in the Timeline Editor. Clicking it creates a pipeline and starts execution. Status updates are reflected in both the global Pipeline Panel and the local Shot Status chips.

## Next Steps
1.  **User Testing**: Test the "Pipeline Generate (Beta)" button with various workflows (Standard, FLF2V, IP-Adapter).
2.  **Full Migration**: Once validated, replace the legacy `generateTimelineVideos` function with `PipelineEngine` calls entirely.
3.  **Advanced Features**: Enable UI controls for Upscaling and Interpolation in the Pipeline Generation flow (currently hardcoded to false in the button).

## Files Modified
-   `services/pipelineTaskRegistry.ts`
-   `services/pipelineFactory.ts`
-   `components/TimelineEditor.tsx`
-   `components/PipelineGenerationButton.tsx` (New)
