# Agent Handoff: Prompt Engineering Framework Integration

**Date**: November 26, 2025  
**Status**: ✅ APPROVED FOR IMPLEMENTATION  
**Plan Document**: `Documentation/PROMPT_ENGINEERING_FRAMEWORK_INTEGRATION_PLAN.md`  
**Estimated Duration**: 22-27 days (3 sprints)

---

## Executive Summary

You are implementing a unified prompt engineering framework for gemDirect1's Story-to-Video pipeline. The comprehensive plan has been reviewed, refined, and approved. Your task is to execute the 8-phase implementation that consolidates prompt assembly, token budgeting, negative prompt management, and feature flag controls into a single, testable architecture.

---

## Critical Context

### What This Project Does
gemDirect1 is an AI-powered cinematic story generator that:
1. Uses **Gemini AI** for content generation (story, scenes, shots)
2. Uses **ComfyUI** for local video/image rendering via WAN workflows
3. Maintains a **Story Bible** and **Visual Bible** for consistency

### Why This Integration Matters
Currently, prompt assembly is scattered across 4+ code paths with inconsistent token handling and negative prompt management. This integration:
- Centralizes all prompt assembly into `assemblePromptForProvider()`
- Adds token budget enforcement with configurable warn/block modes
- Implements automatic negative prompt deduplication
- Enables instant rollback via feature flags (<1 minute vs 10-30 minutes)

---

## Implementation Phases Overview

| Phase | Name | Duration | Owner | Key Deliverable |
|-------|------|----------|-------|-----------------|
| 0 | Infrastructure | 2 days | @lead-dev | 7 feature flags, `pipelineContext.ts`, `descriptorSource` migration |
| 1 | Assembler Functions | 3 days | @backend-dev | `assemblePromptForProvider()`, `buildSceneKeyframePrompt()` |
| 2 | Scene List Validation | 3 days | @qa-lead | `validateSceneSummary()`, `generateSceneListWithFeedback()` |
| 3 | Narrative Context | 2 days | @lead-dev | Shared `getNarrativeContext()` utility |
| 4 | Service Signatures | 3-4 days | @backend-dev | Update `geminiService.ts`, `comfyUIService.ts` |
| 5 | Caller Updates | 2-3 days | @frontend-dev | Update `App.tsx`, `TimelineEditor.tsx`, etc. |
| 6 | Visual Bible UI | 2-3 days | @frontend-dev | `useVisualBible` hook, resync UI |
| 7 | Testing | 4-5 days | @qa-lead | Unit, integration, E2E tests (parallel) |
| 8 | Documentation | 1-2 days | @lead-dev | README, FEATURE_FLAGS.md updates |

---

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `utils/pipelineContext.ts` | 0 | `ensureLogApiCall()`, `assertPipelineContext()` |
| `utils/narrativeContext.ts` | 3 | Shared `getNarrativeContext()` utility |
| `services/sceneListValidator.ts` | 2 | Scene summary validation with retry logic |
| `services/__tests__/generateVideoFromBookendsSequential.test.ts` | 7 | Bookend pipeline integration tests |
| `tests/mocks/comfyui.ts` | 7 | ComfyUI mock server stubs |
| `tests/mocks/gemini.ts` | 7 | Token API stubbing |
| `tests/fixtures/scenes-validation.json` | 7 | 100 labeled scenes for validation testing |

## Files to Modify

| File | Phases | Key Changes |
|------|--------|-------------|
| `utils/featureFlags.ts` | 0 | Add 7 new flags, `loadFeatureFlags()` |
| `services/promptRegistry.ts` | 0 | Add `sceneKeyframe` budget (600 tokens) |
| `types.ts` | 0 | Add `descriptorSource: 'storyBible' \| 'userEdit'` |
| `utils/migrations.ts` | 0 | Add `migrateDescriptorSource()` |
| `services/promptPipeline.ts` | 1 | Add `assemblePromptForProvider()`, `buildSceneKeyframePrompt()` |
| `services/planExpansionService.ts` | 2 | Add `generateSceneListWithFeedback()` |
| `services/geminiService.ts` | 4 | Use assembler when `keyframePromptPipeline` enabled |
| `services/comfyUIService.ts` | 4 | Use assembler when `videoPromptPipeline` enabled |
| `components/TimelineEditor.tsx` | 3, 5 | Use shared `getNarrativeContext`, pass `storyBible` |
| `components/ContinuityDirector.tsx` | 3 | Use shared `getNarrativeContext` |
| `App.tsx` | 5 | Pass `storyBible` to generation functions |
| `utils/hooks.ts` | 6 | Add `migrateDescriptorSource` on load, `useVisualBible` updates |

---

## Feature Flags to Implement

```typescript
interface FeatureFlags {
  // Existing flags...
  
  // NEW: Pipeline flags
  sceneListContextV2: boolean;           // Use V2 context in scene generation
  actContextV2: boolean;                 // Use plotScene.actNumber for act mapping
  sceneListValidationMode: 'off' | 'warn' | 'block';  // Scene validation enforcement
  keyframePromptPipeline: boolean;       // Use buildSceneKeyframePrompt for keyframes
  videoPromptPipeline: boolean;          // Use assembler for video generation
  promptTokenGuard: 'off' | 'warn' | 'block';  // Token budget enforcement
  bibleV2SaveSync: boolean;              // Auto-sync Visual Bible on Story Bible save
}
```

**Flag Expiration Policy**: All flags expire within 90 days. See section 10.1 of the plan for specific dates.

---

## Core Function Contracts

### `assemblePromptForProvider()`

**Input**: Base prompt, additional negatives, default negatives  
**Output**: 
```typescript
{
  inlineFormat: string;           // For Gemini: "${positive}\n\nNegative: ${negative}"
  separateFormat: { positive: string; negative: string };  // For ComfyUI
  mergedNegative: string;         // Deduplicated, order preserved
  tokens: { positive: number; negative: number; total: number };
}
```

**Key Behaviors**:
- Negative deduplication is case-insensitive, first-wins
- Uses 4 chars/token heuristic for fast estimation
- When near budget (>80%), calls `countTokensWithFallback()` for accuracy

### `countTokensWithFallback()`

**Timeout**: 500ms staging, 2000ms production  
**Fallback**: 3.5 chars/token heuristic on timeout/error  
**Env Override**: `VITE_TOKEN_API_ENABLED=false` skips API entirely

---

## Test Infrastructure Prerequisites

Before starting Phase 7, ensure these exist:

| Component | Owner | Due | Status |
|-----------|-------|-----|--------|
| ComfyUI mock server | @backend-dev | Day 3 | Create `/prompt`, `/history` stubs |
| Token API stubbing | @backend-dev | Day 5 | Create `mockCountTokens()` |
| Feature flag helpers | @lead-dev | Day 4 | Create `withFlags()` wrapper |
| Labeled scene dataset | @qa-lead | Day 6 | Create 100 scenes with expected validation results |

---

## Rollout Strategy

| Stage | Flags Enabled | Gate Criteria | Duration |
|-------|---------------|---------------|----------|
| 1 | `sceneListContextV2`, `actContextV2` | Smoke test 10 scenes | 1 day |
| 2 | `sceneListValidationMode: 'warn'` | 100+ validations, <10% FP | 3 days |
| 3 | `keyframePromptPipeline` | 10 keyframe QA pass | 2 days |
| 4 | `videoPromptPipeline` | Video output review | 2 days |
| 5 | `promptTokenGuard: 'warn'` | Overflow rate <5% | 3 days |
| 6 | `bibleV2SaveSync` | Resync UX test pass | 1 day |

**Rollback**: Set any flag to `false`/`'off'` in Settings → refresh page. No deployment needed.

---

## Key Risks to Monitor

| Risk | Mitigation |
|------|------------|
| countTokens API latency | Use 500ms timeout + heuristic fallback |
| ComfyUI queue saturation | Monitor queue depth; pause rollout if >10 pending |
| Validation false positives | Default to 'warn' mode; require <3% FP before 'block' |
| User edit sync conflicts | Conservative provenance; skip userEdit entries in auto-sync |

---

## Acceptance Criteria Highlights

| Phase | Key Gate |
|-------|----------|
| Phase 1 | `assemblePromptForProvider` P95 token accuracy ±5% vs `countTokens` |
| Phase 4 | ComfyUI prompt parity: 8/10 keyframe screenshots pass visual rubric |
| Phase 6 | Visual Bible resync: 3 UX scenarios pass (see plan section 15.5) |
| Phase 7 | 95%+ line coverage, all E2E tests green |

---

## Getting Started

1. **Read the full plan**: `Documentation/PROMPT_ENGINEERING_FRAMEWORK_INTEGRATION_PLAN.md` (2,875 lines, 18 sections)

2. **Verify environment**:
   ```powershell
   npm run check:health-helper  # Validates ComfyUI, workflows, mappings
   npm test                     # Current test suite passes
   ```

3. **Start with Phase 0**:
   - Create `utils/pipelineContext.ts` with `assertPipelineContext()`
   - Add 7 flags to `utils/featureFlags.ts`
   - Add `sceneKeyframe` budget to `services/promptRegistry.ts`
   - Add `descriptorSource` field to `types.ts`
   - Create migration in `utils/migrations.ts`

4. **Sprint allocation**:
   - Sprint 1 (Days 1-10): Phases 0-3 + unit tests
   - Sprint 2 (Days 11-20): Phases 4-6 + integration tests
   - Sprint 3 (Days 21-27): Phase 7-8 + E2E + rollout

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| `Documentation/PROMPT_ENGINEERING_FRAMEWORK_INTEGRATION_PLAN.md` | Master plan with all implementation details |
| `Documentation/Architecture/WORKFLOW_ARCHITECTURE_REFERENCE.md` | ComfyUI node mappings |
| `Testing/E2E/STORY_TO_VIDEO_TEST_CHECKLIST.md` | Testing protocols |
| `.github/copilot-instructions.md` | Project coding standards |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Prompt assembly code paths | 4+ → 1 |
| Token overflow incidents | ~5%/week → <1%/month |
| Rollback time | 10-30 min → <1 min |
| Test coverage (prompts) | ~60% → >95% |

---

**Document Status**: ✅ Approved for implementation  
**Prepared By**: GitHub Copilot (Claude Opus 4.5)  
**Approved**: November 26, 2025

---

*Begin implementation with Phase 0. Mark each phase complete in this handoff document as you progress. Good luck!*
