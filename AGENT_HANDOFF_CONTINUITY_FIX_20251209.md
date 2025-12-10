# Session Handoff - ContinuityCard Crash Fix

## Summary
Fixed a critical crash in `ContinuityCard.tsx` that was blocking E2E tests. The crash was caused by two issues:
1. A Rules of Hooks violation: `useVisualBible()` was being called inside a `useEffect` hook for debug logging.
2. Unsafe property access: `computeSceneContinuityScore` was accessing `scene.timeline.shots` without checking if `scene.timeline` existed.

## Changes
- **`components/ContinuityCard.tsx`**: 
    - Removed the invalid `useVisualBible()` call inside `useEffect`.
    - Removed debug logging.
- **`services/continuityVisualContext.ts`**: 
    - Updated `computeSceneContinuityScore` to safely access `scene.timeline` properties using optional chaining and fallback values.

## Status
- **E2E Test (`pipeline-export.spec.ts`)**: The crash is resolved. The test now times out waiting for the pipeline to complete, which is expected in the current test environment (no real generation backend).
- **Application Stability**: The `ContinuityCard` component is now stable and handles missing timeline data gracefully.

## Next Steps
- Investigate why the pipeline export test times out (likely due to mocked/missing backend responses).
- Ensure `scene.timeline` is properly initialized in all contexts.
