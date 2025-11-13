Title: e2e: add robust vitest runner, emit JSON results, and validate run-summary

Summary

This PR improves the local Windows story→ComfyUI E2E runner and associated helpers. It makes Vitest results machine-readable, prefers those JSON results when determining test exit codes, and adds a validation step for the generated run-summary and artifacts. I verified a complete local run (ComfyUI + queue + tests) and produced a zipped artifact and validated run-summary.

Files changed (high level)

- scripts/run-vitests.ps1
  - New: writes `vitest-results.json` into the run directory with fields { comfyExit, e2eExit, comfyLog, e2eLog, runDir, timestamp }
- scripts/run-comfyui-e2e.ps1
  - Prefer reading `vitest-results.json` for test exit codes and log paths; fallback to legacy summary parsing
  - Added better error reporting in the run-summary
- scripts/queue-real-workflow.ps1
  - Exposed `-MaxWaitSeconds` to allow longer SVD runs (default increased to 600s)
- scripts/validate-run-summary.ps1
  - Validator that checks the run-summary contains required sections (story header, per-scene lines, artifact index, vitest exit codes, total frames > 0)
- scripts/inspect-zip.ps1
  - Small helper to list zip contents for verification
- README / checklist docs updated to reference the new helpers

What I tested locally

- Ran a full end-to-end helper (`scripts/run-comfyui-e2e.ps1`) that:
  - Generated a 3-scene story
  - Started ComfyUI locally and queued each scene
  - Produced 25 frames per scene (total ~75 frames)
  - Ran vitest suites via `scripts/run-vitests.ps1` and wrote `vitest-results.json`
  - Zipped `logs/<ts>` into `artifacts/comfyui-e2e-<ts>.zip`
  - `scripts/validate-run-summary.ps1` passed and the run-summary contained the expected sections

How to run locally

Prereqs:
- ComfyUI available at `C:\ComfyUI\ComfyUI_windows_portable` (see project docs)
- Node dependencies installed (`npm ci`)

From a PowerShell prompt (pwsh.exe):

    pwsh -NoLogo -ExecutionPolicy Bypass -File .\scripts\run-comfyui-e2e.ps1

This will create `logs/<timestamp>/` and `artifacts/comfyui-e2e-<timestamp>.zip`.

Notes / Next steps

- CI: I will add a lightweight GitHub Actions workflow that runs `scripts/run-vitests.ps1` on PRs (unit tests only) in a follow-up commit. The JSON output will make that check machine-parseable.
- Gemini integration: `scripts/generate-story-scenes.ts` remains a stub; wiring the real story generator (Gemini/TypeScript service) is the planned next integration work.

If you'd like, I can finish the CI job in this PR as well (it requires adding a GitHub action file and a small runner step).

Verified-by: automated local run + run-summary validator

