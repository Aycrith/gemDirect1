# Frame Output Issue - Root Cause & Fix Applied

## Date: November 12, 2025
## Status: FIX APPLIED - AWAITING RETEST

---

## Problem Statement

E2E tests showed **0 frames retrieved** from ComfyUI despite:
- ✅ Workflow executing successfully (GPU VRAM consumed, progress bar advancing)
- ✅ Execution success event detected in ComfyUI history
- ✅ SaveImage node completing (based on execution_success message)
- ❌ **No frames found in output directory**

### Infrastructure Impact
- **Score**: 14/15 (93%) passing
- **Blocker**: Frame retrieval mechanism
- **Root Issue**: History API frame detection logic incompatible with SaveImage node behavior

---

## Root Cause Analysis

### What We Discovered

1. **SaveImage Node Behavior**
   - SaveImage executes successfully (files written to disk in previous sessions)
   - But does NOT populate `history.$promptId.outputs` field
   - ComfyUI history API shows workflow completed but no outputs recorded
   - This breaks the waiting logic: `if ($history -and $history.$promptId -and $history.$promptId.outputs)`

2. **Frame Detection Issue**  
   - Previous script waits for `.outputs` to exist before checking for files
   - With SaveImage, `.outputs` may never populate
   - Timeline: execution_success detected (correct) → post-execution timeout begins → files searched but exit condition not reached

3. **Why It Worked Before**
   - Old workflows used "gemdirect1_shot" prefix successfully
   - These may have used different output node or connection pattern
   - Or had different history.outputs behavior

### Evidence

```
[Real E2E][scene-001] History attempt limit of 10 reached
[Real E2E][scene-001] WARNING: History attempts limit (10) reached without outputs
[Real E2E][scene-001] No frames found for prefix gemdirect1_scene-001
```

- History polling exits without detecting outputs
- Frame scanning finds nothing with expected prefix
- GPU VRAM delta proves computation occurred (VRAM freed after SVD model inference)

---

## Fix Applied

### Change: Modified History Completion Detection

**File**: `scripts/queue-real-workflow.ps1` (line ~267)

**Before**:
```powershell
if ($history -and $history.$promptId -and $history.$promptId.outputs) {
    # Workflow complete
}
```

**After**:
```powershell
# For SaveImage nodes, outputs may not populate in history. Instead, check for actual files.
if ($history -and $history.$promptId -and ($history.$promptId.outputs -or $executionSuccessDetected)) {
    # Workflow complete
}
```

### Logic Change
- **Before**: Waits for history.outputs field to populate (never happens with SaveImage)
- **After**: Uses `executionSuccessDetected` flag from execution_success event as completion signal
- **Result**: Script continues to frame scanning immediately after execution_success, doesn't waste time waiting for non-existent outputs

### Why This Works
1. ComfyUI sends `execution_success` message when workflow finishes
2. Our code detects this message via `Get-ExecutionSuccessTimestamp()` function
3. Rather than wait indefinitely for outputs, we proceed to frame scanning
4. Post-execution timeout (60s) gives SaveImage time to write frames
5. Frame detection scans for files with our expected prefix in output directory

---

## Testing & Validation

### Next Test Run
Execute with fixed logic:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass scripts/run-comfyui-e2e.ps1 `
  -SceneMaxWaitSeconds 600 `
  -SceneHistoryPollIntervalSeconds 1 `
  -SceneHistoryMaxAttempts 10 `
  -ScenePostExecutionTimeoutSeconds 60 `
  -SceneRetryBudget 1 `
  -UseLocalLLM `
  -LocalLLMProviderUrl 'http://127.0.0.1:1234/v1/chat/completions' `
  -LocalLLMModel 'mistralai/mistral-7b-instruct-v0.3' `
  -LocalLLMRequestFormat 'openai-chat'
```

### Expected Results
- ✅ Story generation: 3 scenes in ~90 seconds
- ✅ ComfyUI startup: 8-10 seconds  
- ✅ Execution success detected for each scene
- ✅ Post-execution timeout allows frame writes
- ✅ Frame scanning finds files: `gemdirect1_scene-001_00001_.png` ... `gemdirect1_scene-001_00025_.png`
- ✅ **Total frames**: 75 (25 frames × 3 scenes)
- ✅ **Test result**: PASS ✓
- ✅ **Infrastructure score**: 15/15 (100%)

---

## Related Changes

### Workflow Modification (Additional Safety)
- Added ReroutePrimitive node (node 8) after SaveImage
- Purpose: Ensures ComfyUI tracks completion through all nodes
- Status: Added but not critical to fix (completion detection via execution_success is primary mechanism)

### Why We Don't Need Reroute for This Fix
- New fix relies on execution_success event, not node completion tracking
- Reroute node was exploratory; core fix is the history polling logic
- Can remove node 8 if needed in future refinement

---

## Files Modified
1. `scripts/queue-real-workflow.ps1` - Fixed history polling condition
2. `workflows/text-to-video.json` - Added ReroutePrimitive (optional safety measure)

---

## Why This Fix Is Robust

1. **Aligns with ComfyUI Design**
   - `execution_success` is ComfyUI's official completion signal
   - Documented in ComfyUI websocket_api_example.py

2. **Tolerates Node Variability**
   - Works with SaveImage (no outputs) or other nodes (with outputs)
   - Uses OR condition: accepts either outputs OR execution_success
   - Future-proof: any output node type supported

3. **Maintains Existing Behavior**
   - Still respects max wait times
   - Still respects attempt limits
   - Still has post-execution timeout safety

4. **File-Based Frame Detection**
   - Doesn't rely on history.outputs for frame metadata
   - Uses filesystem to verify frames actually exist
   - Handles timing: waits post-execution time before file scan

---

## Success Criteria for Retest

| Criterion | Target | Status |
|-----------|--------|--------|
| Story generation | 3 scenes | ⏳ Pending |
| Execution success detection | 3/3 scenes | ⏳ Pending |
| Frame detection | 75 total frames | ⏳ Pending |
| No history timeout errors | 0 | ⏳ Pending |
| Infrastructure score | 15/15 | ⏳ Pending |

---

## Timeline

- **14:00-14:05** - Discovered ReroutePrimitive instead of Reroute needed
- **14:05-14:06** - Fixed workflow to use ReroutePrimitive|pysssss
- **14:00-14:10** - First retest with ReroutePrimitive: frames still not detected
- **14:15-14:20** - Root cause analysis: SaveImage doesn't populate history.outputs
- **14:20-14:25** - Diagnosis: history polling waits for non-existent outputs
- **14:25-14:30** - Solution designed: use execution_success instead
- **14:30-14:35** - Fix applied to queue-real-workflow.ps1
- **14:35+** - Awaiting retest execution

---

## Next Actions (Priority Order)

1. **[IMMEDIATE]** Run E2E test with fixed queue-real-workflow.ps1
2. **[VERIFY]** Check for gemdirect1_scene-00X_00NNN_.png files in output directory
3. **[CONFIRM]** Frame count should be >0 (expect 75 total)
4. **[VALIDATE]** Infrastructure score reaches 15/15 (100%)
5. **[DOCUMENT]** Record successful completion in test report
6. **[DELIVER]** Complete submission package with successful test results

---

## Rollback Plan (If Needed)

If retest still fails to retrieve frames:

```powershell
# Revert queue-real-workflow.ps1 to original condition
# OR try alternative: Look for all .png files written after execution_success timestamp
# OR check ComfyUI logs for SaveImage errors
# OR verify output directory has write permissions
```

---

## Technical Debt / Follow-Up

- [ ] Investigate why old "gemdirect1_shot" frames were generated (different workflow?)
- [ ] Document SaveImage output behavior vs other node types
- [ ] Consider WebSocket frame tracking as alternative to history polling
- [ ] Add explicit logging of SaveImage output directory writes
- [ ] Consider fallback to file timestamp-based detection if history unreliable

---

**Status**: Fix applied. Ready for retest. Expected to resolve infrastructure score to 15/15 (100%).
