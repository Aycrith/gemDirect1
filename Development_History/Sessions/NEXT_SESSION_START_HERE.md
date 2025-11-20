# 🎬 gemDirect1 - Next Session Starter Guide

**Date**: November 9, 2025  
**Status**: Phase 2 in progress – expanding coverage (UI regression under investigation)  
**Time to Next Milestone**: ~2 hours

---

> **Update (Nov 9, 2025)**: The service harness now covers uploads, prompt injection, WebSocket progress, and UI lifecycle rendering. The UI regression suite uses a controlled generator stub documented in TESTING_GUIDE.md.

- Confirm `components/__tests__/GenerationControls.test.tsx` now asserts `local-status-queued` before `status="running"`, rerun `npm run test -- --run components/__tests__/GenerationControls.test.tsx`, and document the stabilized lifecycle (including controlled generator sequences) in `TESTING_GUIDE.md`, `COMFYUI_LOCAL_RUNBOOK.md` Section 7, and `DOCUMENTATION_INDEX.md`.
- Review the integration coverage in `services/__tests__/generateVideoFlow.integration.test.ts`, `services/__tests__/queueComfyUIPrompt.integration.test.ts`, and `components/__tests__/GenerationControls.test.tsx`; refresh `TESTING_GUIDE.md` whenever you extend those scenarios.
- Expand fixtures to cover optional transition metadata and timeline variations, reusing them across future suites.
- Extend the `/upload/image + /prompt + /queue + /ws` harness for timeout and error cases referenced in `COMPREHENSIVE_ANALYSIS_AND_PLAN.md` and keep the patterns documented in `TESTING_GUIDE.md`.
- After wiring queue/poll delays, rerun the paired regression commands (`npx vitest run services/__tests__/generateVideoFlow.integration.test.ts components/__tests__/GenerationControls.test.tsx` and `npx vitest run components/__tests__/GenerationControls.test.tsx`) with `queueResponses`, `queueDelayMs`, and `progressDelayMs` so the busy queue scenario and the `local-status-queued` guard stay locked down and mirror the controlled generator sequence.
- Use `createComfyUIHarness` with `queueError`, `promptFailure`, `lowVram`, and custom `websocketEvents` (status → execution_start → queued → progress → executed, as shown in ComfyUI's `websockets_api_example.py`) for service coverage, keep `queueResponses`, `queueDelayMs`, and `progressDelayMs` aligned with the new busy queue test, and mirror the event ordering in the controlled generator stub before touching the UI harness again; note any new knobs in `TESTING_GUIDE.md`, this runbook, and `COMPREHENSIVE_ANALYSIS_AND_PLAN.md`.
- Pair the new queue polling failure scenario with the `queueError` knob so the guard keeps `local-status-queued` visible until explicit queue info arrives, and document that knob stack plus the `websockets_api_example.py` ordering in `TESTING_GUIDE.md`, `COMFYUI_LOCAL_RUNBOOK.md` Section 7, and `DOCUMENTATION_INDEX.md` before modifying the lifecycle again.
- Re-run `npm run test -- --run` frequently and follow the payload-inspection steps from `COMFYUI_LOCAL_RUNBOOK.md` Section 6 each time you resync a workflow.
- Capture any new VRAM or queue diagnostics by reusing `createComfyUIHarness({ lowVram: true })` so UI and service tests stay in lockstep.
- Before touching the UI harness again, re-read `COMPREHENSIVE_ANALYSIS_AND_PLAN.md` Sections 9-11, this file, `COMFYUI_LOCAL_RUNBOOK.md` Section 7, `TESTING_GUIDE.md` Section 2, and `DOCUMENTATION_INDEX.md`, and inspect `components/GenerationControls.tsx`, `components/__tests__/GenerationControls.test.tsx`, `components/LocalGenerationStatus.tsx`, and `services/__tests__/mocks/comfyUIHarness.ts` to understand the queued→running lifecycle.

---

## 📍 Where We Are

- ✅ Workflow fixtures now include positive, negative, timeline JSON, keyframe mappings, plus metadata/audio nodes for regression safety.
- ✅ Integration coverage proves `queueComfyUIPrompt` injects all payloads before calling `/prompt` **and** returns `systemResources` for VRAM diagnostics.
- ✅ UI regression test exercises queued → running → complete states via the controlled generator stub (progress bar + final output assertions).
- ✅ Combined `/upload/image + /prompt + /queue + /ws` harness lives in `services/__tests__/generateVideoFlow.integration.test.ts` and is documented in `TESTING_GUIDE.md`.

Warning: The UI now preserves `local-status-queued` before transitioning to running, so keep `components/__tests__/GenerationControls.test.tsx`, `TESTING_GUIDE.md`, and this runbook aligned whenever you touch the lifecycle expectations; the controlled stub and service harness should both emit queued before running updates.

**Remaining Gaps (Nov 10, 2025)**:

- Queue wait regression: `services/__tests__/generateVideoFlow.integration.test.ts` still passes when `/queue` responds immediately. Add a busy queue scenario using `queueResponses`, longer `queueDelayMs`, and assert the guard holds `local-status-queued` until the harness emits a queued event.
- Lifecycle guard dependency: `handleShotProgress` now blocks the running state until a queued event arrives. Document every lifecycle tweak across this file, `TESTING_GUIDE.md` Section 2, `COMFYUI_LOCAL_RUNBOOK.md` Section 7, and `DOCUMENTATION_INDEX.md` (including controlled stub sequencing) before modifying the guard.
- Timing knob coverage: UI tests cover low VRAM and queue/prompt failures, but they do not yet assert queue status HTTP errors and WebSocket stalls in the service suite. Mirror the UI scenarios in `generateVideoFlow.integration.test.ts` using the same harness knobs so both layers fail together.
- Queue polling failure parity: we now have a stub + harness scenario that uses `queueError` to show the queue guard holding `local-status-queued` until explicit queue info arrives; whenever you touch similar flows, repeat the same knob set, reference `websockets_api_example.py`, and update `TESTING_GUIDE.md`, this runbook, and `DOCUMENTATION_INDEX.md`.
- Documentation sync: whenever you add harness knobs or change sequencing, cite the upstream ComfyUI reference (for example `websockets_api_example.py`) directly in the docs and tests so the payload order stays traceable.

**Immediate Plan**:

1. Extend `createComfyUIHarness` usage across service and UI tests for queue timeout, reject, and stall cases (`queueError`, `queueStatusError`, `promptFailure`, `lowVram`, `queueResponses`, `websocketEvents`, `queueDelayMs`, `progressDelayMs`).
2. Add assertions that explicitly check the queued guard in `components/__tests__/GenerationControls.test.tsx` and `services/__tests__/generateVideoFlow.integration.test.ts` for both fast and delayed queue responses.
3. Document each new harness configuration in `TESTING_GUIDE.md` Section 2, this runbook, and `DOCUMENTATION_INDEX.md`, and note the required verification commands: `npx vitest run services/__tests__/generateVideoFlow.integration.test.ts` followed by `npx vitest run components/__tests__/GenerationControls.test.tsx`.
4. Use MCP/web tooling to pull current ComfyUI queue/poll ordering docs; cite the URL where you paste payload shapes or sequences so the next agent can validate updates quickly.

---

> The reference material below captures the original Phase 1 walkthrough. Keep it handy if you need to revisit the quick-fix rationale or coach new contributors.

## 🚀 Start Here (5-10 minutes)

### 1. Read These Documents (In Order)

1. **THIS FILE** (you're reading it)
2. `PROJECT_STATE_SNAPSHOT.md` (2-3 minutes) - Current state overview
3. `SESSION_HANDOFF_IMMEDIATE.md` (3-5 minutes) - Your immediate task
4. `COMPREHENSIVE_ANALYSIS_AND_PLAN.md` (10-15 minutes, optional but recommended) - Full strategy

### 2. Understand the Problem (2 minutes)

**The Issue (Resolved)**:

```
Your task today: Make 4 failing tests pass
These tests use empty workflow data → validation rejects → tests fail before mocks execute
```

**The Fix (Implemented)**:

```
Use REAL (minimal) workflow data with proper mappings → validation passes → mocks work
```

**Time to Fix**: 1 hour max

### 3. Your Mission

```
Phase 1 (Immediate - 1 hour):
  ✅ Replace empty test settings with valid workflow
  ✅ Run tests: npm run test -- --run
  ✅ Verify: All 8 tests pass

Phase 2 (After Phase 1 - 2-3 hours):
  ✅ Add test suites for validation, WebSocket, pre-flight checks
  ✅ Add integration test for full video generation
  ✅ Achieve >80% code coverage

Phase 3 (After Phase 2 - 1 hour):
  ✅ Write testing guide
  ✅ Document patterns for future development
  ✅ Create fixture library
```

---

## 📋 Pre-Work Checklist

Before you start, verify setup:

```powershell
# 1. Confirm Node/npm working
npm --version  # Should be v8+

# 2. Confirm dependencies installed
npm ls @vitest/ui vitest react  # Should show versions

# 3. Confirm dev server can start
npm run dev  # Should start on localhost:3000 (use Ctrl+C to stop)

# 4. Confirm tests can run
npm run test -- --run services/comfyUIService.test.ts
# Expected: 8 tests total (4 pass, 4 fail)
```

If all checks pass, you're ready. ✅

---

## 🎯 Phase 1: The Quick Fix (Historical Reference)

**File to Edit**: `services/comfyUIService.test.ts`

### Step 1: Understand the Problem (5 minutes)

**Current Code** (lines 6-12):

```typescript
const createSettings = (): LocalGenerationSettings => ({
  comfyUIUrl: "http://127.0.0.1:8188",
  comfyUIClientId: "test-client",
  workflowJson: JSON.stringify({ prompt: {} }), // ← Empty!
  mapping: {}, // ← No mappings!
});
```

**Why It Fails**:

1. Test calls `generateVideoFromShot(settings, ...)`
2. `generateVideoFromShot()` internally calls `queueComfyUIPrompt()`
3. `queueComfyUIPrompt()` calls `validateWorkflowAndMappings()`
4. Validator checks: "Does workflow have a text prompt mapping?" → NO
5. Validator throws error → Test fails
6. Mock never executes because validation happened first

### Step 2: Replace with Valid Settings (20 minutes)

Open `services/comfyUIService.test.ts` and find the `createSettings` function around line 6.

**Replace this entire function**:

```typescript
const createSettings = (): LocalGenerationSettings => ({
  comfyUIUrl: "http://127.0.0.1:8188",
  comfyUIClientId: "test-client",
  workflowJson: JSON.stringify({ prompt: {} }),
  mapping: {},
});
```

**With this**:

```typescript
const createValidTestSettings = (): LocalGenerationSettings => {
  const workflow = {
    prompt: {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "", clip: ["2", 0] },
        _meta: { title: "Positive Prompt" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: { clip_name: "model" },
        _meta: { title: "CLIP" },
      },
      "3": {
        class_type: "LoadImage",
        inputs: { image: "" },
        _meta: { title: "Load Image" },
      },
    },
  };
  return {
    comfyUIUrl: "http://127.0.0.1:8188",
    comfyUIClientId: "test-client",
    workflowJson: JSON.stringify(workflow),
    mapping: {
      "1:text": "human_readable_prompt",
      "3:image": "keyframe_image",
    },
  };
};
```

### Step 3: Update Test Cases (30 minutes)

**Search for**: `createSettings()` in the file (should find 5 instances)

**Replace all 5 instances** with `createValidTestSettings()`

Locations to check:

- Line ~85: generateVideoFromShot describe block
- Line ~90: First test in generateVideoFromShot
- Line ~145: Second test in generateVideoFromShot
- Line ~185: generateTimelineVideos describe block
- Line ~200: Tests in generateTimelineVideos

**How to do it**:

1. Open `services/comfyUIService.test.ts`
2. Use Ctrl+H (Find and Replace)
3. Find: `const settings = createSettings()`
4. Replace: `const settings = createValidTestSettings()`
5. Replace All

### Step 4: Run Tests (5 minutes)

```powershell
npm run test -- --run services/comfyUIService.test.ts
```

**Expected Output**:

```
✓ buildShotPrompt (4)
  ✓ returns the shot description when no enhancers or vision are provided
  ✓ appends creative enhancers in a readable format
  ✓ appends the director's vision at the end
  ✓ orders description, enhancers, then director vision

✓ generateVideoFromShot (2)
  ✓ queues a prompt and resolves with frame metadata
  ✓ propagates queueing errors and reports failure

✓ generateTimelineVideos (2)
  ✓ processes each shot sequentially and returns results
  ✓ continues after a shot fails and records an error placeholder

Test Files  1 passed (1)
Tests  8 passed (8)
```

**If tests still fail**:

- Read the error message carefully
- It will tell you exactly what's wrong
- Most likely: mapping is still missing or node structure is wrong
- Reference: `services/comfyUIService.ts` lines 165-204 to see what validator expects

### Step 5: Commit Your Work

```powershell
git add services/comfyUIService.test.ts
git commit -m "fix: provide valid workflow settings for comfyUIService tests"
```

✅ **Phase 1 Complete!**

---

## 📚 Understanding the Architecture

### Why Workflows Need This Structure

The validation function checks for:

1. **At least one text input node** to receive the prompt
2. **Mapping from that node to 'human_readable_prompt'**
3. **At least one LoadImage node** for keyframe
4. **Mapping from that node to 'keyframe_image'**

Your test workflow provides:

- Node "1" (CLIPTextEncode) → receives prompt text
- Node "3" (LoadImage) → receives keyframe image
- Mappings connect these nodes to data types

This satisfies validation. ✅

### Why This Matters

In production:

- Real workflows are complex (10+ nodes)
- Validation ensures all required inputs are mapped
- Prevents "node not found" errors during generation

In testing:

- We use a minimal but valid workflow
- Passes validation → can test actual logic
- Realistic enough to exercise real code paths

---

## 🔧 If Things Go Wrong

### Tests Still Fail After Phase 1

**Check**:

1. Did you rename the function to `createValidTestSettings`? (Case-sensitive!)
2. Did you replace ALL 5 instances?
3. Is the workflow JSON valid? (No syntax errors)
4. Are the node IDs strings: `"1"`, `"2"`, `"3"`? (Not numbers)

**Debug**:

```powershell
# See the exact error
npm run test -- --run services/comfyUIService.test.ts 2>&1 | head -50
```

### Dev Server Won't Start

```powershell
# Clear cache
rm -r node_modules/.vite
# Restart
npm run dev
```

### Can't Find the Test File

```powershell
# Verify file exists
ls -la services/comfyUIService.test.ts
# Should show the file with proper size
```

---

## 📖 For Reference

### What Happens When Tests Run

```
1. Vitest loads the test file
2. Creates test settings with valid workflow
3. Calls generateVideoFromShot(settings, ...)
4. generateVideoFromShot() calls queueComfyUIPrompt()
5. queueComfyUIPrompt() runs validateWorkflowAndMappings()
6. Validation PASSES (workflow has required mappings)
7. queueComfyUIPrompt() runs normally
8. vi.spyOn() mock intercepts and returns mock data
9. Test verifies the result
10. Test PASSES ✅
```

### Key Files You're Working With

- `services/comfyUIService.test.ts` - Where you make changes
- `services/comfyUIService.ts` - The code being tested (don't change for Phase 1)
- `types.ts` - Type definitions (don't need to change)

---

## ✅ Success Criteria

**Phase 1 Was Complete When**:

1. ✅ `createValidTestSettings()` function exists
2. ✅ All `createSettings()` calls replaced with `createValidTestSettings()`
3. ✅ `npm run test -- --run` shows 8/8 tests passing
4. ✅ No validation errors in output
5. ✅ Can run tests multiple times without flakiness
6. ✅ Code changes committed to git

---

## 🎓 What You're Learning

By doing this, you'll understand:

- How test fixtures work
- Why validation matters
- How mocks intercept function calls
- How to debug test failures
- The importance of realistic test data

---

## 🔜 After Phase 1

Current roadmap after Phase 1:

1. **Phase 2**: Expand service-layer harnesses (≈2 hours)

- Add Vitest suites for WebSocket tracking (`trackPromptExecution`) covering queued → executing → executed → error
- Mock `/system_stats` pre-flight helpers (`checkServerConnection`, `checkSystemResources`) for success and failure cases
- Combine `/upload/image`, `/prompt`, and `/ws` mocks so frame-sequence and mp4 outputs are both validated

2. **Phase 3**: Document and scale fixtures (≈1 hour)

- Publish a testing/fixtures guide summarizing patterns and commands
- Extend fixtures for workflows expecting metadata JSON or optional transitions
- Append new suites to `DOCUMENTATION_INDEX.md` and note regression steps in the runbook

3. **Outcome**: Service layer >80% coverage, reproducible manual verification, and clear onboarding guidance for the next agent

---

## 💡 Pro Tips

1. **Use VS Code Find/Replace** (Ctrl+H) to replace all instances at once
2. **Keep the test file open** while making changes to see real-time feedback
3. **Run tests frequently** - after each change to verify progress
4. **Read error messages carefully** - they tell you exactly what's wrong
5. **Ask yourself**: "Why does validation reject this data?"

---

## 📞 Questions?

If you get stuck:

1. **Read the error message** - it's usually telling you the answer
2. **Check `validateWorkflowAndMappings()`** - understand what it expects
3. **Look at test failure details** - shows which test, what failed, why
4. **Review `COMPREHENSIVE_ANALYSIS_AND_PLAN.md`** - deeper explanation

---

## 🏁 Final Checklist Before Starting

- [ ] Read and understood the problem
- [ ] Pre-work checklist passed (npm, dev server, tests run)
- [ ] Have `services/comfyUIService.test.ts` open
- [ ] Ready to replace `createSettings()`
- [ ] Ready to replace all 5 calls

**You're ready! Let's go! 🚀**

---

**Time Estimate**: 1 hour to completion  
**Difficulty**: Low (configuration, not logic)  
**Success Rate**: 95% (straightforward fix)  
**Next Steps After**: Start Phase 2 implementation

Good luck! Feel free to reference these docs as needed. 📚
