# Agent Handoff Procedure (Project-Wide)

This project moves fastest when every agent can (1) orient quickly, (2) produce a real artifact run, and (3) leave behind evidence + next steps that map back to the plans.

## Start-Of-Session Checklist (10–15 min)

1. Confirm repo/branch state:
   - `git status -sb`
   - `git log -5 --oneline`
2. Read the current plans (in order):
   - `plan.md` (guardrails + execution tracks)
   - `IMPLEMENTATION_PLAN_NEXT.md` (near-term priorities)
   - `TODO.md` (backlog)
   - Latest `PROJECT_STATUS_REPORT_*.md` (use the most recent “EOD”/post-merge file if present)
3. Check the latest handoffs:
   - Latest root-level `AGENT_HANDOFF_*.md`
   - `agent/.state/session-handoff.json` (machine-readable session baton)
4. Quick health (don’t assume CI mirrors your machine):
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run build`

## “Effective Results” Definition (what counts)

An iteration is “effective” when it produces:
- `logs/<timestamp>/run-summary.txt`
- `logs/<timestamp>/artifact-metadata.json`
- `public/artifacts/latest-run.json` (UI snapshot mirror)
- At least one scene MP4 under `logs/<timestamp>/video/`
- A validator pass: `scripts/validate-run-summary.ps1`

## Produce A Real End-to-End Run (preferred)

Prereqs:
- ComfyUI reachable at `http://127.0.0.1:8188`
- LM Studio reachable at the endpoint used by `scripts/run-comfyui-e2e.ps1` (override via `-LMStudioEndpoint`)

Commands:
1. Run the helper:
   - `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration`
   - If LM Studio is unavailable but ComfyUI is up: add `-UseMockLLM`
2. Validate the run summary (use the printed run directory):
   - `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/validate-run-summary.ps1 -RunDir <runDir>`
3. Verify UI reads the same snapshot:
   - `npm run dev` (Vite serves on `http://localhost:3000`)
   - Open the Artifact Snapshot/Artifact Viewer panel and confirm it matches `public/artifacts/latest-run.json`.

## Optional: Fast UI/CI Smoke Checks

- Playwright smoke:
  - `npx playwright test tests/e2e/app-loading.spec.ts tests/e2e/landing-page-visibility.spec.ts --project=chromium --reporter=list`
- Guardian (contract/guardrail scan):
  - `npm run guardian:scan`
  - `npm run guardian:status`

## End-Of-Session Deliverables (required)

1. Update `agent/.state/session-handoff.json` with:
   - what changed, what was validated, what’s next, blockers.
2. Write a human-readable handoff:
   - `AGENT_HANDOFF_<TOPIC>_YYYYMMDD.md` (root) with file proofs + commands run.
3. If plan/status moved materially, write an updated status report:
   - `PROJECT_STATUS_REPORT_<date>_EOD.md` (or similar) that maps reality to `plan.md` / `IMPLEMENTATION_PLAN_NEXT.md`.
