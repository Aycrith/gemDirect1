# Agent Handoff: QualityDirector Queue Guardrail Fix

**Date**: 2025-12-12  
**Agent**: QualityDirector (autonomous audit + surgical fix)  
**Status**: Complete

## Summary
During audit against `plan.md` guardrails, found that chain-of-frames (scene‑chained FLF2V) video generation bypassed `GenerationQueue` even when `useGenerationQueue` was enabled. This risked VRAM exhaustion and violated the queue‑only GPU entry policy.

## Fix
- Updated `generateSceneVideoChained` to call `queueVideoGenerationWithQueue` instead of `queueVideoGeneration`, so ComfyUI jobs route through `GenerationQueue` whenever the `useGenerationQueue` feature flag is on.
- No schema changes; telemetry/UI remain backward‑compatible.

## Files Changed
- `services/videoGenerationService.ts`

## Validation
- `npx tsc --noEmit`
- `npx vitest run services/__tests__/videoGenerationService.test.ts --reporter=verbose`

## Notes
- This preserves existing provider routing (FastVideo vs ComfyUI) and async behavior (`pending:<promptId>` results) while aligning chained generation with canonical queue policy.

