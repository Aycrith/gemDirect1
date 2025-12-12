# Implementation Plan: Next Steps

**Date**: 2025-12-12  
**Status**: Active

## What’s Now True (Recent Completions)

- E2E runner produces validator + UI-consumable artifacts (“effective results”): `scripts/run-comfyui-e2e.ps1`
- Validator integrated at end of the run: `scripts/validate-run-summary.ps1`
- UI mirror paths updated per run: `public/artifacts/latest-run.json` and `public/artifact-metadata.json`
- Playwright smoke stabilized for degraded mode: `tests/e2e/landing-page-visibility.spec.ts`

## Immediate Priorities (Next Agent / Next Session)

### 1) Fresh Live E2E Artifact Run (ComfyUI + LLM available)
**Priority**: Highest  
**Goal**: Produce a clean run dir + validator pass + UI verification with services reachable.

**Tasks**:
- [ ] Start/confirm ComfyUI is reachable.
- [ ] Configure LLM (Gemini key or LM Studio) if needed for story generation.
- [ ] Run: `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration`
- [ ] Validate: `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/validate-run-summary.ps1 -RunDir logs/<timestamp>`
- [ ] UI check: verify the app reads `public/artifacts/latest-run.json` and `public/artifact-metadata.json` correctly (Artifacts / Run Viewer).

### 2) Close Documentation Drift
**Priority**: High  
**Goal**: Keep entrypoints and inventories aligned with the new “effective results” workflow.

**Tasks**:
- [ ] Ensure `START_HERE.md`, `Documentation/CURRENT_STATUS.md`, and `Documentation/PROJECT_STATUS_CONSOLIDATED.md` agree on current status and the E2E command/validator.
- [ ] Update `DOCUMENTATION_INVENTORY.md` to reflect the current entrypoints and filenames (`plan.md`, runbooks).

## Deferred / Longer-Horizon

- Advanced features (SVI, ControlNet, premium keyframes) are intentionally deferred until the live E2E artifact run is repeatably green.

