# TODO (Active)

This file tracks *current* work only. Historical notes live in `Development_History/` and root-level `AGENT_HANDOFF_*.md`.

## Canonical References
- `plan.md` (guardrails + execution tracks; source of truth)
- `IMPLEMENTATION_PLAN_NEXT.md` (near-term checklist; keep in sync)
- Latest `PROJECT_STATUS_REPORT_*EOD*.md` (current reality)

## Current Priorities (Ordered)

- [ ] Close P4.4 orchestration hardening
  - Add integration tests around `services/pipelineEngine.ts` + `services/pipelineFactory.ts` covering:
    - retries (task/pipeline retry behavior)
    - progress (task progress -> UI/store wiring)
    - export-all (multi-scene task graph correctness)
  - Enforce via Guardian rules (see `plan.md`).

- [ ] Improve CI gates (PR workflows)
  - Keep full ComfyUI E2E manual/runner-gated.
  - Ensure PR runs a Playwright smoke subset + a telemetry/run-summary validator against fixtures.

- [ ] Finish TypeScript strictness cleanup
  - Remove remaining `any` hotspots (notably `services/comfyUIService.ts`, `utils/migrations.ts`).
  - Add a regression gate (lint/CI) to prevent new `any` from landing.

- [ ] Performance/UX polish (optional, valuable)
  - React mount target `<900ms`.
  - Lazy-load heavy panels and defer non-critical startup work.

- [ ] Next feature track (when foundations are locked)
  - FLF2V + post-processing promotion (RIFE/ESRGAN) with telemetry + tests + UI toggles.

## Last Verified “Effective Results”
- `logs/20251212-121424` (3/3 scenes, validator PASS, UI snapshot updated)
