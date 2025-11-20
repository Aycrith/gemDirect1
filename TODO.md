# Next actions for the story-to-video pipeline

## Recently Completed (2025-11-20)
- [x] **CRITICAL FIX**: Workflow loading mechanism - Added "Import from File" button to Settings modal (LocalGenerationSettingsModal.tsx)
  - Identified missing feature: `localGenSettings.json` was never read by browser
  - Implemented file import UI with validation and error handling
  - Created comprehensive user guide: `Documentation/Guides/WORKFLOW_LOADING_GUIDE.md`
  - Updated agent instructions: `.github/copilot-instructions.md`
  - Validated end-to-end in browser: wan-t2i and wan-i2v profiles now load successfully
  - **Status**: ✅ COMPLETE - Ready for production use
  - **Session Summary**: `Development_History/Sessions/SESSION_WORKFLOW_LOADING_FIX_20251120.md`

## Previous Completed Tasks
- [x] **High priority**: Replace the deterministic sample story generator with a real local LLM or Gemini-powered service. Add a configurable provider URL (`LOCAL_STORY_PROVIDER_URL`) and a CLI toggle so the helper can request cinematic loglines/moods directly from the local LLM before writing `story/story.json`.
- [x] **Failure handling**: Extend `scripts/queue-real-workflow.ps1` and `scripts/run-comfyui-e2e.ps1` so they surface REST failures, ComfyUI timeouts, or scenes that never hit the frame floor. Log explicit `ERROR` lines in `run-summary.txt`, archive the `history.json`, and consider a retry/backoff loop (done via history retries and log warnings).
- [x] **Artifact enrichment**: Surface `story/story.json`, `scene-xxx/history.json`, and the frame count metadata inside the web UI/services so users can inspect the generated context without navigating the filesystem. Document the inspection steps in `STORY_TO_VIDEO_TEST_CHECKLIST.md`.
- [x] **Testing coverage**: Cover the placeholder patching logic and story generator output with Vitest/unit tests so regression is caught before running the heavy E2E helper. Use the new `scripts/run-vitests.ps1` helper to execute those suites locally and in CI.
- [x] **CI improvements**: Keep the `pr-vitest.yml` workflow running the unit suites; add an artifact upload for the `vitest-report.json` and consider a gated workflow that runs the full E2E helper on a machine with ComfyUI installed.
- [x] **Documentation lockstep**: Whenever workflows, placeholders, or logging format changes, update `WORKFLOW_FIX_GUIDE.md`, `HANDOFF_SESSION_NOTES.md`, `NEXT_SESSION_ACTION_PLAN.md`, and `STORY_TO_VIDEO_PIPELINE_PLAN.md` so future agents know what changed.

## 🚀 COMPREHENSIVE EXECUTION PLAN AVAILABLE

**See**: `NEXT_AGENT_COMPREHENSIVE_EXECUTION_PLAN.md`

A complete, self-contained execution plan for the next AI Coding Agent has been created with:
- **3-5 day implementation timeline**
- **7 detailed phases** (mandatory + optional)
- **Complete documentation review requirements**
- **Step-by-step implementation guides**
- **Validation checkpoints and success criteria**
- **Debugging guides and common pitfalls**
- **Research resources and examples**

**Next agent should start there for complete context and execution plan.**

---

## Next Recommended Work (Priority Order)

### P1: Performance Optimization (CRITICAL - from Comprehensive Plan Phase 2)
**Goal**: Reduce React mount time from 1630ms to <900ms
- Implement additional lazy loading (CoDirector, ExportDialog, etc.)
- Optimize context providers with memoization
- Defer non-critical initialization to useEffect
- Measure and document results
- **Estimated**: 4-8 hours
- **See**: NEXT_AGENT_COMPREHENSIVE_EXECUTION_PLAN.md Phase 2

### P2: Documentation Consolidation (HIGH - from Comprehensive Plan Phase 3)
**Goal**: Create single source of truth, eliminate contradictions
- Archive outdated handoff documents (pre-2025-11-20)
- Update all status references to current state
- Create PROJECT_STATUS_CONSOLIDATED.md
- Remove duplicate content
- **Estimated**: 2-4 hours
- **See**: NEXT_AGENT_COMPREHENSIVE_EXECUTION_PLAN.md Phase 3

### P3: Test Cleanup (OPTIONAL - from Comprehensive Plan Phase 4)
**Goal**: Fix remaining 6 Playwright test failures (88% → 100%)
- Fix selector-related failures
- Apply deterministic helpers (waitForStateHydration, etc.)
- Document test reliability patterns
- **Estimated**: 4-6 hours
- **Note**: All failures are minor UI/timing issues, no functional bugs
- **See**: NEXT_AGENT_COMPREHENSIVE_EXECUTION_PLAN.md Phase 4

### Immediate Testing (Unblocked by Workflow Loading Fix)
4. **Test keyframe generation end-to-end** - Now that wan-t2i workflow is loaded
   - Create story idea → Generate story bible → Create scene → Generate keyframe
   - Verify wan-t2i workflow submits to ComfyUI correctly
   - Monitor ComfyUI console for successful workflow execution
   - Validate keyframe image appears in UI

5. **Test video generation end-to-end** - Now that wan-i2v workflow is loaded
   - After keyframe generation succeeds → Generate video
   - Verify wan-i2v workflow receives keyframe image correctly
   - Monitor video generation progress
   - Validate video playback in UI

### UI/UX Improvements
6. Feed `artifact-metadata.json` into additional UI components (timeline/history explorer) so prompts + warnings are visible outside the Artifact Snapshot.

7. **Workflow import enhancements** (P2)
   - Add import preview with diff view before applying
   - Auto-detect `localGenSettings.json` in project root
   - Add export current profiles to file feature

### CI/Testing
8. Extend the CI workflow to automatically download and validate the `comfyui-e2e-logs` artifact when `runFullE2E=true`, or document the manual review steps reviewers should follow today.

### Documentation
9. **Add screenshots to WORKFLOW_LOADING_GUIDE.md**
   - Settings modal showing import button
   - File picker dialog
   - Success toast notifications
   - Profile status badges changing

## Notes
- Track each task via GitHub issues or project board later; this file is a temporary capture of the current backlog.
