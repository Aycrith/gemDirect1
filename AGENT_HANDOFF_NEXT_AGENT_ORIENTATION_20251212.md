# Agent Handoff: Next-Agent Orientation (Post-Merge)

**Date**: 2025-12-12  
**Branch**: `main` (synced with `origin/main`)  
**Goal for next agent**: run a real end-to-end generation and verify the UI + validator reflect the same artifacts.

## What’s On `main` (now merged)

- **Pipeline core + tests + CI hardening**: `services/pipeline*.ts`, `types/pipeline.ts`, pipeline tests, CI workflows/playwright smoke stabilization.
- **FLF2V + telemetry/UI + validators + queue guardrails**: `services/flf2v/*`, `services/pipelineTaskRegistry.ts`, `scripts/validate-run-summary.*`, `components/TelemetryBadges.tsx`, `components/ArtifactViewer.tsx`, plus queue routing enforcement.
- **Interpolation/upscale UI toggles**: exposed in `components/PipelineGenerationButton.tsx` and `components/ContinuityDirector.tsx`, wired into `services/pipelineFactory.ts`.

Related surgical fix (already documented):
- `AGENT_HANDOFF_QDIRECTOR_20251212.md` (chained FLF2V now respects `GenerationQueue` when enabled).

## Status vs Plans (where to compare)

- `plan.md` is the canonical “guardrails + execution tracks”.
- `IMPLEMENTATION_PLAN_NEXT.md` is partially outdated; treat it as a checklist to mark “done vs still pending”.
- `PROJECT_STATUS_REPORT_2025-12-12.md` is a pre-merge snapshot; use `PROJECT_STATUS_REPORT_2025-12-12_EOD.md` for the post-merge view.

## Fast Health Checks (no external services required)

```powershell
git status -sb
npx tsc --noEmit
npm test
npm run build
```

## Get “Effective Results” (one real artifact run)

Prereqs:
- ComfyUI at `http://127.0.0.1:8188`
- LM Studio (override the script’s default endpoint if needed)

Run:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration
```
If LM Studio is down but ComfyUI is up, add `-UseMockLLM`.

Then validate (copy the printed run directory):
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/validate-run-summary.ps1 -RunDir <runDir>
```  

UI verification:
- `npm run dev` (Vite port is `3000` per `vite.config.ts`)
- Confirm the Artifact Snapshot panel matches `public/artifacts/latest-run.json`.

## Known CI/Local Gotchas

- CI Playwright runs chromium-only by default (see `playwright.config.ts`); firefox is opt-in.
- CI smoke does not require LM Studio/ComfyUI unless explicit env gates are enabled.
