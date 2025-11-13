# Next actions for the story-to-video pipeline

## New tasks (drafted from the previous remediation plan)
- [x] **High priority**: Replace the deterministic sample story generator with a real local LLM or Gemini-powered service. Add a configurable provider URL (`LOCAL_STORY_PROVIDER_URL`) and a CLI toggle so the helper can request cinematic loglines/moods directly from the local LLM before writing `story/story.json`.
- [x] **Failure handling**: Extend `scripts/queue-real-workflow.ps1` and `scripts/run-comfyui-e2e.ps1` so they surface REST failures, ComfyUI timeouts, or scenes that never hit the frame floor. Log explicit `ERROR` lines in `run-summary.txt`, archive the `history.json`, and consider a retry/backoff loop (done via history retries and log warnings).
- [x] **Artifact enrichment**: Surface `story/story.json`, `scene-xxx/history.json`, and the frame count metadata inside the web UI/services so users can inspect the generated context without navigating the filesystem. Document the inspection steps in `STORY_TO_VIDEO_TEST_CHECKLIST.md`.
- [x] **Testing coverage**: Cover the placeholder patching logic and story generator output with Vitest/unit tests so regression is caught before running the heavy E2E helper. Use the new `scripts/run-vitests.ps1` helper to execute those suites locally and in CI.
- [x] **CI improvements**: Keep the `pr-vitest.yml` workflow running the unit suites; add an artifact upload for the `vitest-report.json` and consider a gated workflow that runs the full E2E helper on a machine with ComfyUI installed.
- [x] **Documentation lockstep**: Whenever workflows, placeholders, or logging format changes, update `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `NEXT_SESSION_ACTION_PLAN.md`, and `STORY_TO_VIDEO_PIPELINE_PLAN.md` so future agents know what changed.

## Next recommended work (in progress)
1. Feed `artifact-metadata.json` into additional UI components (timeline/history explorer) so prompts + warnings are visible outside the Artifact Snapshot.
2. Extend the CI workflow to automatically download and validate the `comfyui-e2e-logs` artifact when `runFullE2E=true`, or document the manual review steps reviewers should follow today.

## Notes
- Track each task via GitHub issues or project board later; this file is a temporary capture of the current backlog.
