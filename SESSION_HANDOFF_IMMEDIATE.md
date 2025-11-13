# SESSION HANDOFF: Immediate Actions for Next Agent

**Status**: � Baseline green — ready to extend coverage  
**Priority**: HIGH – keep stub/harness parity while adding warning/error paths  
**Estimated Time**: 1–2 hours for the next coverage increment

---

## Current Snapshot (30 seconds)

- Service + UI vitest suites pass (`npx vitest run services/__tests__/generateVideoFlow.integration.test.ts components/__tests__/GenerationControls.test.tsx`).
- UI regression suite uses a controlled generator stub (`createControlledGenerator`) to emit queued -> running -> complete events while exercising low-VRAM warnings and queue status errors so the guard stays truthful.
- Documentation (testing guide, runbook, onboarding files) references the stubbed lifecycle and warns that queued must precede running.
- Added a queue polling failure scenario (the `queueError` knob) to both the stub and service harness so the guard stays queued until explicit queue info, and the new documentation callouts now cite `websockets_api_example.py`.
- Outstanding work: add error/warning scenarios to both the stub and the service harness so telemetry remains in sync.
- Keep the queue polling failure pairing aligned with `queueError` and the documented ordering in `websockets_api_example.py` so future regressions can be triaged without guard drift.

---


## Immediate Goals (Phase 2 Kickoff)

1. **Add one new controlled stub sequence**
   - Example targets: queue rejection, queue status error, low-VRAM warning banner, or the guard regression where `execution_start` arrives before the queued update (mirror the ComfyUI `websockets_api_example.py` ordering).
   - Emit events in deterministic order using the stub's `emit(index)` helper and assert the UI message/state.

2. **Mirror the scenario in the service harness**
   - Extend `createComfyUIHarness` options (if necessary) or reuse existing knobs to simulate the same condition.
   - Add/adjust a test in `services/__tests__/generateVideoFlow.integration.test.ts` to assert identical behaviour.

3. **Document the new pairing**
   - Update `TESTING_GUIDE.md` §2 and `COMFYUI_LOCAL_RUNBOOK.md` §7 with the new event sequence + harness knobs.
   - Note manual verification steps if additional tooling is required.

4. **Run regression suites**
   - `npx vitest run components/__tests__/GenerationControls.test.tsx`
   - `npx vitest run services/__tests__/generateVideoFlow.integration.test.ts components/__tests__/GenerationControls.test.tsx`
   - (Optional) `npx vitest run`
   - Ensure existing scenarios stay green alongside the new coverage.

---

## Key Files & References

- `components/__tests__/GenerationControls.test.tsx` → Controlled generator stub + UI assertions.
- `services/__tests__/generateVideoFlow.integration.test.ts` → Service harness scenarios.
- `services/__tests__/mocks/comfyUIHarness.ts` → Harness configuration knobs (`queueResponses`, `queueDelayMs`, `progressDelayMs`, `queueError`, `queueStatusError`, `promptFailure`, `lowVram`, `websocketEvents`).
- `COMFYUI_LOCAL_RUNBOOK.md` §7 → Manual lifecycle verification guidance.
- `TESTING_GUIDE.md` §2–3 → Instructions for using the controlled stub and aligning it with the harness.

---

## Definition of Done

- [ ] At least one new UI stub scenario implemented with clear assertions.
- [ ] Matching service harness coverage added or updated.
- [ ] Both vitest commands above pass without warnings.
- [ ] Documentation updated to describe the new scenario and any manual verification changes.
- [ ] `SESSION_COMPLETION_SUMMARY.md` updated with outcomes and commands run.

---

## Tips & Best Practices

- Keep the queued-before-running contract intact; if a scenario intentionally breaks that order, document it explicitly.
- Wrap every `emit()` call in `await act(async () => emit(n))` to avoid React act warnings.
- When adjusting harness timings, advance fake timers thoughtfully (`vi.advanceTimersByTimeAsync`) and confirm queue drain assertions still hold.
- Record any new external references (e.g., ComfyUI docs) in the updated documentation so future agents can trace payload ordering.

---

### Need a quick refresher?

1. Read: `NEXT_SESSION_START_HERE.md` → high-level roadmap.
2. Skim: `COMPREHENSIVE_ANALYSIS_AND_PLAN.md` → plan context & risks.
3. Review: `TESTING_GUIDE.md` §2–3 → controlled stub usage.
4. Execute: Regression commands listed above before making changes.

---

## Questions to Ask Yourself

When implementing Phase 1:
- [ ] Does the workflow structure match what `validateWorkflowAndMappings()` expects?
- [ ] Are all required mappings present?
- [ ] Can I understand what each node in the workflow does?
- [ ] If tests still fail, what specific error is validation throwing?

---

## Don't Get Stuck

If Phase 1 doesn't work immediately:

1. **Read the error message carefully** - it tells you exactly what's wrong
2. **Look at validateWorkflowAndMappings()** - see what it requires
3. **Check existing workflow** - look at `workflows/text-to-video.json` for real structure
4. **Ask**: "What does the test need to NOT fail validation?"

---

## Success Metrics

✅ **Phase 1 Complete When**:
- 8/8 tests pass
- No validation errors in console
- Can run tests repeatedly without flakiness
- Ready to proceed to Phase 2

---

**Estimated Session Time**: 1-2 hours  
**Success Rate**: 95% (straightforward fix)  
**Complexity**: Low (configuration change, not logic change)  

Good luck! You've got this. 🚀
