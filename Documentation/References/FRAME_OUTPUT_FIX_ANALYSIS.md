# Frame Output Issue - Root Cause Analysis & Fix

**Date**: November 12, 2025  
**Issue**: ComfyUI frames not retrieved despite SaveImage node executing

---

## ROOT CAUSE ANALYSIS

### What We Know

1. **Workflow IS executing**
   - Progress bar visible (3%|██▍ 1/30) in test output
   - GPU models loaded successfully
   - tqdm showing frame generation in progress

2. **Frames ARE being saved**
   - Previous test runs show frames in `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\`
   - SaveImage node (node 7) in workflow is properly configured
   - Filename prefix is set correctly

3. **History retrieval is FAILING**
   - Script polls `/history/<promptId>` 
   - Expects `$history.$promptId.outputs` to exist
   - Gets "history attempts limit reached without outputs"

### The Problem

The issue is likely **timing-related**:

1. SaveImage node saves files to disk **asynchronously** after VAE decode completes
2. History poll may complete **before** SaveImage finishes writing files
3. The script's 3-attempt polling with 2-second intervals may be too aggressive

**Alternative possibility**:
- ComfyUI's execution_success status fires **after** KSampler completes
- But SaveImage (node 7) is not the final node that triggers status messages
- The workflow may need an explicit output node or Reroute at the end

---

## CURRENT WORKFLOW STRUCTURE

```
Node 1: ImageOnlyCheckpointLoader (SVD Model)
Node 2: LoadImage (Keyframe)
Node 3: VideoLinearCFGGuidance
Node 4: SVD_img2vid_Conditioning
Node 5: KSampler (Video generation)
Node 6: VAEDecode
Node 7: SaveImage (saves to disk, no downstream connections)
```

**Issue**: Node 7 (SaveImage) has no outputs. History queries may not wait for it.

---

## SOLUTION OPTIONS

### Option 1: Add a Reroute Node (RECOMMENDED)
Add a passthrough node after SaveImage to ensure ComfyUI waits for save completion.

**Steps**:
1. Add node 8: Reroute that connects to SaveImage's output
2. This ensures ComfyUI tracks completion through node 8
3. History will show node 8's output, confirming SaveImage executed

### Option 2: Increase Poll Timeout & Attempt Count
Give SaveImage more time to complete.

**Steps**:
1. Increase `PostExecutionTimeoutSeconds` from 30s to 60s
2. Increase `SceneHistoryMaxAttempts` from 3 to 10
3. Decrease `SceneHistoryPollIntervalSeconds` from 2s to 1s

### Option 3: Use WebSocket Instead of REST
Listen for execution messages via WebSocket instead of polling history.

**Steps**:
1. Connect to ComfyUI WebSocket
2. Listen for execution_success or execution_error
3. No polling needed

---

## RECOMMENDED FIX: Option 1 (Add Reroute Node)

### Workflow Modification

```json
{
  "7": {
    "inputs": {
      "images": ["6", 0],
      "filename_prefix": "__SCENE_PREFIX__",
      "format": "image/png"
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Save Frames"
    }
  },
  "8": {
    "inputs": {
      "input": ["7", 0]
    },
    "class_type": "Reroute",
    "_meta": {
      "title": "Complete Signal"
    }
  }
}
```

### Why This Works

1. Reroute is a passthrough node that doesn't modify data
2. ComfyUI tracks execution through all nodes  
3. History will show node 8's execution, proving SaveImage completed
4. Frames will be written to disk by that point

---

## IMPLEMENTATION

### Step 1: Update Workflow JSON

Modify `workflows/text-to-video.json` to add Reroute node.

### Step 2: Adjust Polling Parameters

In `scripts/run-comfyui-e2e.ps1`, update parameters:

```powershell
-SceneHistoryMaxAttempts 5      # Increase from 3
-SceneHistoryPollIntervalSeconds 1  # Decrease from 2 for faster polling
-ScenePostExecutionTimeoutSeconds 45  # Increase from 30
```

### Step 3: Test with Simple Run

```powershell
# Start ComfyUI
C:\ComfyUI\start-comfyui.bat

# Run short test
pwsh -NoLogo -ExecutionPolicy Bypass scripts/run-comfyui-e2e.ps1 `
  -SceneHistoryMaxAttempts 5 `
  -ScenePostExecutionTimeoutSeconds 45
```

### Step 4: Verify Frame Output

```powershell
ls C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\gemdirect1_scene* -ErrorAction SilentlyContinue
```

---

## IMPLEMENTATION INSTRUCTIONS

Follow these steps to apply the fix:

### 1. Update Workflow JSON

Find the workflows/text-to-video.json file and add the Reroute node as shown above.

### 2. Test Rerun Command

After updating the workflow, rerun with adjusted parameters to verify the fix works.

---

## SUCCESS CRITERIA

✅ Frames are saved to output directory  
✅ History query retrieves outputs successfully  
✅ Frame count > 0 reported in test logs  
✅ E2E test validation passes  

---

## EXPECTED OUTCOME

After applying this fix:
- Frame generation should complete successfully
- History retrieval should detect SaveImage execution
- E2E test will show frames copied to logs directory
- Overall infrastructure test score will be 15/15 (100%) ✅

