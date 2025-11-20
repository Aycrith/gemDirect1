# 🚀 NEXT AGENT EXECUTION PROMPT
## Complete, Self-Contained Implementation Instructions
**For**: AI Coding Agent (Claude, GPT, or similar)  
**Project**: gemDirect1 – AI-Powered Cinematic Story-to-Video Generator  
**Date Created**: November 19, 2025  
**Urgency**: CRITICAL – Core video generation pipeline blocked  
**Estimated Duration**: 2-4 days to full resolution

---

## PREAMBLE: YOUR MISSION

You are taking over an AI video generation project that is **95% complete but blocked on one critical feature**: the WAN2 (Wanx Image-to-Video) model is queuing workflows successfully but **not producing MP4 files on disk**. Your job is to:

1. **Diagnose** why SaveVideo node outputs aren't appearing in the output directory
2. **Fix** the underlying issue (likely a path, codec, or workflow config problem)
3. **Stabilize** frame generation variability for secondary scenes
4. **Test** exhaustively to ensure production readiness
5. **Handoff** with complete documentation for the next team

This document contains everything you need. **Read it fully before writing any code.**

---

## CRITICAL CONTEXT: DO NOT SKIP THIS SECTION

### What You're Inheriting
- ✅ **Working**: React UI, story generation, SVD frame generation, WAN2 prompt queueing, telemetry collection
- ❌ **Broken**: WAN2 MP4 output (prompts queue but no files generated)
- ⚠️ **Unstable**: Scene-002/003 frame generation (1-8 frames instead of 25)

### The Blocker in One Sentence
**Prompts reach ComfyUI's `/prompt` endpoint successfully (HTTP 200 + valid prompt_id returned), but when you query `/history/<prompt_id>` after waiting 240+ seconds, SaveVideo node outputs never appear, and no `.mp4` files exist in `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-{ID}\`.**

### Why This Matters
Every scene video generation attempt takes **3-8 minutes**. The prompt queues instantly (good), but then the system wastes time polling for outputs that never come (bad). Your diagnostic phase is critical to avoiding wasted GPU time.

### Your First 4 Hours (Critical Path)
1. **0:00 – 0:30**: Read README.md + this handoff document fully
2. **0:30 – 1:00**: Run diagnostic baseline (Section "PHASE 1: DIAGNOSTICS")
3. **1:00 – 2:00**: Manual WAN2 test via ComfyUI UI
4. **2:00 – 3:00**: Query history endpoint + analyze response
5. **3:00 – 4:00**: Document findings + form root cause hypothesis
6. **Decision Point**: Proceed to fix implementation (Section "PHASE 2: IMPLEMENTATION")

**Do NOT skip diagnostics**. A wrong fix wastes 1-2 hours of GPU time per attempt.

---

## PART 0: SETUP & VERIFICATION (15 minutes)

### Step 0.1: Verify Prerequisites
```powershell
# Run these checks immediately
Write-Host "=== PREREQUISITE CHECKS ==="

# 1. Node version >= 22.19.0
node -v  # Must be v22.19.0 or higher

# 2. ComfyUI running on port 8188
$comfyHealthy = Test-NetConnection -ComputerName 127.0.0.1 -Port 8188 -InformationLevel Quiet
if ($comfyHealthy) {
  Write-Host "✓ ComfyUI reachable on 127.0.0.1:8188"
} else {
  Write-Host "✗ ComfyUI NOT reachable. Start it first: run task 'Start ComfyUI Server (Patched - Recommended)'"
  exit 1
}

# 3. LM Studio running (if enabled)
try {
  $lmResponse = Invoke-WebRequest "http://192.168.50.192:1234/v1/models" -TimeoutSec 3
  Write-Host "✓ LM Studio healthy"
} catch {
  Write-Host "⚠ LM Studio not responding (this is OK for diagnostics, but will skip story generation)"
}

# 4. Project dependencies installed
if (-not (Test-Path "C:\Dev\gemDirect1\node_modules")) {
  Write-Host "Installing npm dependencies..."
  npm install
}

Write-Host "=== PREREQUISITES OK ===" -ForegroundColor Green
```

### Step 0.2: Confirm Handoff Document Access
```powershell
# Verify you have the handoff document
$handoffPath = "C:\Dev\gemDirect1\COMPREHENSIVE_AGENT_HANDOFF_20251119.md"
if (Test-Path $handoffPath) {
  Write-Host "✓ Handoff document found"
  Write-Host "Read now: $handoffPath"
} else {
  Write-Host "✗ Handoff not found! Cannot proceed."
  exit 1
}
```

### Step 0.3: Access Latest Run Artifacts
```powershell
# Point to the last failed run
$latestRun = "C:\Dev\gemDirect1\logs\20251119-011556"
Write-Host "Latest run directory: $latestRun"
Write-Host "Key files:"
Write-Host "  - Summary: $latestRun\run-summary.txt"
Write-Host "  - Metadata: $latestRun\artifact-metadata.json"
Write-Host "  - Frames: $latestRun\scene-001\generated-frames\"
Write-Host "  - Empty videos folder: $latestRun\video\"  # ← THE BLOCKER
```

---

## PART 1: UNDERSTANDING THE CURRENT STATE (30 minutes)

### Section 1.1: Read Required Documentation

**In this exact order:**
1. `C:\Dev\gemDirect1\README.md` – Read sections 1-3 (setup, local WAN usage, ComfyUI health helper)
2. `C:\Dev\gemDirect1\COMPREHENSIVE_AGENT_HANDOFF_20251119.md` – This is your bible
3. `C:\Dev\gemDirect1\WORKFLOW_ARCHITECTURE_REFERENCE.md` – Node mappings and save strategies
4. `C:\Dev\gemDirect1\VALIDATION_PROGRESS.md` – Milestone tracking and current status

**Time limit**: 30 minutes. Skim if needed, but MUST read README + handoff.

### Section 1.2: Understand the Architecture (From Handoff)

The system has this data flow:
```
User Story → LM Studio (Mistral 7B) → 3 Scenes + Keyframes
                ↓
        SVD Text-to-Video → 25 frames per scene (WORKING ✓)
                ↓
        WAN2 Image-to-Video → MP4 per scene (BLOCKED ✗)
                ↓
        Artifact Snapshot UI Display
```

**Your mission target**: Fix the "BLOCKED" arrow (WAN2 → MP4).

### Section 1.3: Understand Why It's Blocked

**Current behavior**:
```
[Scene scene-001] Wan2 prompt queued: prompt_id=e50a7891-... duration=0s  ← HTTP 200 received ✓
[Scene scene-001] Wan2 polling started (attempt 1/3)
... wait 240 seconds ...
[Scene scene-001] Wan2 video generation failed: No video after 723.5s  ← Output never found ✗
```

**What works**:
- ✅ Keyframe uploaded to ComfyUI
- ✅ SaveVideo node configuration applied
- ✅ `/prompt` endpoint accepts the payload (HTTP 200)
- ✅ Valid prompt_id returned

**What fails**:
- ❌ `/history/<prompt_id>` queries return no SaveVideo outputs
- ❌ No `.mp4` files appear in output directories
- ❌ Polling times out after 240+ seconds

---

## PART 2: PHASE 1 – DIAGNOSTICS (2-3 hours)

**Goal**: Determine root cause of SaveVideo output failure.

### Diagnostic Task 1: Baseline Health Check (30 minutes)

```powershell
# Create diagnostics directory
$diagDir = "C:\Dev\gemDirect1\logs\diagnose-wan2-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $diagDir -Force | Out-Null
Write-Host "Diagnostics directory: $diagDir"

# 1.1: ComfyUI system stats
Write-Host "Collecting ComfyUI system stats..."
$stats = Invoke-WebRequest "http://127.0.0.1:8188/system_stats" | ConvertFrom-Json
$stats | ConvertTo-Json -Depth 10 | Out-File "$diagDir\system_stats.json"
Write-Host "✓ GPU: $($stats.devices[0].name)"
Write-Host "  VRAM: $($stats.devices[0].vram_total)MB total"

# 1.2: Check queue status
Write-Host "Checking queue..."
$queue = Invoke-WebRequest "http://127.0.0.1:8188/queue" | ConvertFrom-Json
Write-Host "  Running: $($queue.queue_running.Count)"
Write-Host "  Pending: $($queue.queue_pending.Count)"

# 1.3: List available models
Write-Host "Checking models..."
$models = Invoke-WebRequest "http://127.0.0.1:8188/models" -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
if ($models) {
  $models | ConvertTo-Json -Depth 5 | Out-File "$diagDir\available_models.json"
}

# 1.4: Verify WAN2 workflow file exists
$wan2Workflow = "C:\Dev\gemDirect1\workflows\video_wan2_2_5B_ti2v.json"
if (Test-Path $wan2Workflow) {
  Write-Host "✓ WAN2 workflow found: $wan2Workflow"
  $workflowJson = Get-Content $wan2Workflow | ConvertFrom-Json
  Write-Host "  Nodes in workflow: $($workflowJson.PSObject.Properties.Name -join ', ')"
} else {
  Write-Host "✗ WAN2 workflow NOT found!"
  exit 1
}

Write-Host "✓ Baseline diagnostics complete"
Write-Host "  Results saved to: $diagDir"
```

**After running**: Review output files and document in `$diagDir\baseline-findings.txt`.

---

### Diagnostic Task 2: Manual WAN2 Workflow Test via ComfyUI UI (60 minutes)

**Purpose**: Verify SaveVideo node works when triggered manually through the UI (bypasses PowerShell script).

**Steps**:

1. **Open ComfyUI WebUI**
   ```powershell
   Start-Process "http://127.0.0.1:8188/"
   ```
   Wait for browser to load the ComfyUI interface.

2. **Load WAN2 Workflow**
   - Click the folder icon (top-left) or use menu
   - Select: `Load from file`
   - Browse to: `C:\Dev\gemDirect1\workflows\video_wan2_2_5B_ti2v.json`
   - Click "Load"

3. **Prepare Test Keyframe**
   - Use an existing keyframe: `C:\Dev\gemDirect1\logs\20251119-011556\story\keyframes\scene-001.png`
   - Or use the sample: `C:\Dev\gemDirect1\sample_frame_start.png`

4. **Configure LoadImage Node**
   - Find the LoadImage node in the workflow
   - Click the image selector
   - Upload or select your test keyframe
   - Confirm image loads in preview

5. **Configure CLIPTextEncode Nodes**
   - Find positive CLIPTextEncode node
   - Enter test prompt: `"A courier in analog rain, neon bioluminescence"`
   - Find negative CLIPTextEncode node
   - Enter negative prompt: `"blurry, low quality"`

6. **Queue the Workflow**
   - Click the red "Queue Prompt" button (bottom-right)
   - Browser console should show: `Prompt ID: <uuid>`
   - **Note this prompt_id for next task**

7. **Monitor Execution**
   - Watch for "Execution complete" message in console
   - OR check bottom-right corner for progress indication
   - **Expected time**: 3-8 minutes for WAN2 model inference + encoding

8. **Check Output Directory**
   ```powershell
   # After ~10 minutes, check for MP4 output
   $outputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video"
   Get-ChildItem $outputDir -Recurse -Filter "*.mp4" | ForEach-Object {
     Write-Host "✓ Found MP4: $($_.FullName)"
     Write-Host "  Size: $($_.Length / 1MB)MB"
   }
   
   # If no MP4 found
   Write-Host "✗ No MP4 files found in $outputDir"
   ```

9. **Document Result**
   - SaveVideo executed: [YES / NO]
   - MP4 file created: [YES / NO]
   - Location: [path to MP4 or "N/A"]
   - Observations: [any errors in console, node status, etc.]

**Save findings to**: `$diagDir\manual-ui-test-results.txt`

---

### Diagnostic Task 3: Query History Endpoint (45 minutes)

**Purpose**: Examine what ComfyUI reports after workflow execution.

```powershell
$diagDir = "C:\Dev\gemDirect1\logs\diagnose-wan2-<timestamp>"  # Use your timestamp

# 3.1: Query the most recent prompt from manual test
# If you noted the prompt_id from browser console, use that
# Otherwise, query all recent history entries

$promptId = "e50a7891-2a62-4f1c-a6ea-c3c69d37c3c5"  # REPLACE with your prompt_id

Write-Host "Querying history for prompt: $promptId"

try {
  $historyResponse = Invoke-WebRequest "http://127.0.0.1:8188/history/$promptId" -TimeoutSec 10
  $history = $historyResponse.Content | ConvertFrom-Json
  
  # Save full response
  $history | ConvertTo-Json -Depth 20 | Out-File "$diagDir\history-response.json"
  
  # Parse key fields
  $promptData = $history.$promptId
  
  Write-Host ""
  Write-Host "=== HISTORY ANALYSIS ==="
  Write-Host "Execution Success: $($promptData.outputs.execution_success)"
  Write-Host "Number of outputs: $($promptData.outputs.PSObject.Properties.Count)"
  
  # List all output nodes
  Write-Host ""
  Write-Host "Output nodes found:"
  $promptData.outputs.PSObject.Properties | ForEach-Object {
    Write-Host "  - $($_.Name): $($_.Value | ConvertTo-Json -Compress)"
  }
  
  # Specifically check for SaveVideo outputs
  if ($promptData.outputs.images) {
    Write-Host ""
    Write-Host "✓ SaveVideo images detected: $($promptData.outputs.images.Count)"
    $promptData.outputs.images | ForEach-Object {
      Write-Host "  - $_"
    }
  } else {
    Write-Host ""
    Write-Host "✗ NO SaveVideo outputs found!"
    Write-Host "  This suggests SaveVideo node did not execute."
  }
  
  Write-Host ""
  Write-Host "Full history saved to: $diagDir\history-response.json"
  
} catch {
  Write-Host "✗ History query failed: $_"
  Write-Host "  This might mean the prompt_id was invalid or ComfyUI isn't responding."
}
```

**Analysis checklist**:
- [ ] Did `/history/<prompt_id>` return a valid response?
- [ ] Is `execution_success: true`?
- [ ] Are SaveVideo output fields present?
- [ ] What node IDs are present in outputs?

**Save findings to**: `$diagDir\history-analysis.txt`

---

### Diagnostic Task 4: Workflow JSON Audit (30 minutes)

**Purpose**: Verify SaveVideo node configuration in workflow file.

```powershell
$wan2Workflow = "C:\Dev\gemDirect1\workflows\video_wan2_2_5B_ti2v.json"

Write-Host "=== WORKFLOW JSON AUDIT ==="
Write-Host "File: $wan2Workflow"

$workflow = Get-Content $wan2Workflow | ConvertFrom-Json

# Find SaveVideo node
$saveVideoNode = $null
$saveVideoNodeId = $null

foreach ($prop in $workflow.PSObject.Properties) {
  $nodeId = $prop.Name
  $node = $prop.Value
  
  if ($node.class_type -eq "SaveVideo") {
    $saveVideoNode = $node
    $saveVideoNodeId = $nodeId
    break
  }
}

if ($saveVideoNode) {
  Write-Host ""
  Write-Host "✓ Found SaveVideo node: $saveVideoNodeId"
  Write-Host "  Configuration:"
  Write-Host "    - filename_prefix: $($saveVideoNode.inputs.filename_prefix)"
  Write-Host "    - format: $($saveVideoNode.inputs.format)"
  Write-Host "    - codec: $($saveVideoNode.inputs.codec)"
  Write-Host "    - quality: $($saveVideoNode.inputs.quality)"
  Write-Host "    - fps: $($saveVideoNode.inputs.fps)"
  
  # Check inputs
  Write-Host ""
  Write-Host "  Input connections:"
  $saveVideoNode.inputs.PSObject.Properties | Where-Object { $_.Value -is [array] } | ForEach-Object {
    Write-Host "    - $($_.Name): connects to node $($_.Value[0]), output $($_.Value[1])"
  }
  
  # Verify path uses forward slashes
  $prefixPath = $saveVideoNode.inputs.filename_prefix
  if ($prefixPath -contains '\') {
    Write-Host ""
    Write-Host "⚠ WARNING: filename_prefix contains backslashes!"
    Write-Host "  ComfyUI prefers forward slashes. Fix to: video/scene-001"
  } else {
    Write-Host ""
    Write-Host "✓ filename_prefix uses forward slashes"
  }
  
} else {
  Write-Host "✗ SaveVideo node NOT found in workflow!"
  Write-Host "  Available node types:"
  $workflow.PSObject.Properties | ForEach-Object {
    Write-Host "    - $($_.Value.class_type)"
  }
}

# Save audit report
@"
=== WORKFLOW AUDIT REPORT ===
Timestamp: $(Get-Date)
File: $wan2Workflow

SaveVideo Node ID: $saveVideoNodeId
SaveVideo Config: $(if ($saveVideoNode) { $saveVideoNode | ConvertTo-Json -Compress } else { "NOT FOUND" })

Nodes in workflow:
$($workflow.PSObject.Properties | ForEach-Object { "  - $($_.Name): $($_.Value.class_type)" })
"@ | Out-File "$diagDir\workflow-audit.txt"

Write-Host ""
Write-Host "Audit report saved to: $diagDir\workflow-audit.txt"
```

**Checklist**:
- [ ] SaveVideo node exists in workflow
- [ ] filename_prefix uses forward slashes (e.g., `video/scene-001`)
- [ ] Input connections are valid (LoadImage → SaveVideo)
- [ ] Codec and format are compatible

---

### Diagnostic Task 5: PowerShell Script Trace (30 minutes)

**Purpose**: Re-run the WAN2 script with verbose logging to see what's happening.

```powershell
# Create a test scene ID
$sceneId = "diag-001"
$maxWait = 600  # 10 minutes (extended from default 240s)

Write-Host "Running WAN2 generation with verbose logging..."
Write-Host "Scene ID: $sceneId"
Write-Host "Max wait: $maxWait seconds"

# Note: You may need to adjust this path based on your setup
$wan2ScriptPath = "C:\Dev\gemDirect1\scripts\generate-scene-videos-wan2.ps1"

if (Test-Path $wan2ScriptPath) {
  Write-Host "✓ WAN2 script found: $wan2ScriptPath"
  
  # Run with verbose output
  & $wan2ScriptPath -SceneId $sceneId -MaxWaitSeconds $maxWait -Verbose *> "$diagDir\wan2-script-output.log"
  
  Write-Host ""
  Write-Host "Script execution complete. Output saved to: $diagDir\wan2-script-output.log"
  Write-Host ""
  
  # Extract key lines
  Write-Host "=== KEY LOG LINES ==="
  Get-Content "$diagDir\wan2-script-output.log" | Select-String "Wan2|queued|polling|failed|Success|Error"
  
} else {
  Write-Host "✗ WAN2 script not found!"
}
```

**After this task, you should have**:
- Full script execution log
- Any error messages
- Confirmation of HTTP 200 or failure details
- Polling attempt count before timeout

---

### Diagnostic Summary Template

**Create a file**: `$diagDir\DIAGNOSTIC_SUMMARY.md`

```markdown
# WAN2 Diagnostics Summary
Date: [timestamp]

## Baseline Health
- ComfyUI Status: [online/offline]
- VRAM Available: [MB]
- Queue Status: [queue_running/queue_pending]
- WAN2 Workflow File: [found/not found]

## Manual UI Test
- SaveVideo Execution: [YES/NO]
- MP4 File Created: [YES/NO]
- Expected Location: [path]
- Errors Observed: [list]

## History Query Analysis
- Prompt ID Tested: [uuid]
- execution_success Flag: [true/false/not found]
- SaveVideo Outputs Present: [YES/NO]
- Output Node Names: [list]

## Workflow JSON Audit
- SaveVideo Node Found: [YES/NO]
- filename_prefix: [value]
- Codec: [value]
- Path Separator Issue: [YES/NO – explain]

## PowerShell Script Trace
- HTTP 200 Received: [YES/NO]
- prompt_id Returned: [uuid or FAILED]
- Polling Attempts: [N]
- Timeout Reason: [maxWait/other]

## Root Cause Hypothesis
[Your best guess based on above findings]

## Next Steps
[What should be tried next]
```

---

## PART 3: ROOT CAUSE ANALYSIS (30 minutes)

**After completing Phase 1 diagnostics**, analyze your findings and identify the root cause.

### Root Cause Decision Tree

**Question 1**: Did the manual UI test produce an MP4?
- **YES** → SaveVideo node works. Problem is in PowerShell script or configuration. → PATH A
- **NO** → SaveVideo node not executing. Problem is in workflow or ComfyUI. → PATH B

---

#### **PATH A: SaveVideo Works, but PowerShell Script Has Issue**

**Likely causes**:
1. Output path mismatch (script expects `C:\ComfyUI\...\video\scene-001\scene-001.mp4`, but ComfyUI saves to different location)
2. Filename mismatch (script looking for `scene-001.mp4`, but ComfyUI saved `output_001.mp4`)
3. Polling stopped too early (240s timeout not enough)

**Quick fix verification**:
```powershell
# Search for all MP4 files in ComfyUI output directory
Get-ChildItem "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output" -Recurse -Filter "*.mp4" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Found: $($_.FullName)"
  Write-Host "  Size: $($_.Length / 1MB) MB"
  Write-Host "  Modified: $($_.LastWriteTime)"
}

# If files found in unexpected location, note the pattern
```

**Fix strategy for PATH A**:
- [ ] Determine where ComfyUI actually saves MP4s
- [ ] Update `generate-scene-videos-wan2.ps1` line ~450-480 to look in correct directory
- [ ] Extend polling timeout to match actual encoding time

---

#### **PATH B: SaveVideo Not Executing**

**Likely causes**:
1. SaveVideo node not connected in workflow (LoadImage → SaveVideo connection broken)
2. SaveVideo node ID mismatch (workflow references node "10", but actual SaveVideo is node "12")
3. Workflow loading error (corrupted JSON or syntax error)
4. Model execution failure (WAN2 model crashing before reaching SaveVideo)

**Quick fix verification**:
```powershell
# Check workflow for SaveVideo node connections
$workflow = Get-Content "C:\Dev\gemDirect1\workflows\video_wan2_2_5B_ti2v.json" | ConvertFrom-Json

# Find all SaveVideo nodes
$workflow.PSObject.Properties | Where-Object { $_.Value.class_type -eq "SaveVideo" } | ForEach-Object {
  Write-Host "SaveVideo node: $($_.Name)"
  Write-Host "  Inputs: $($_.Value.inputs | ConvertTo-Json -Compress)"
}

# If no SaveVideo nodes found, the workflow itself is broken
```

**Fix strategy for PATH B**:
- [ ] Download reference WAN2 workflow from ComfyUI community
- [ ] Compare node connections
- [ ] Repair `workflows/video_wan2_2_5B_ti2v.json` with correct structure
- [ ] OR use ComfyUI UI to rebuild workflow and export

---

#### **PATH C: ComfyUI Crash or Hang**

**Symptoms**:
- prompt_id returned, but ComfyUI process crashes
- Polling timeout reaches max with no execution_success flag
- `/history/<prompt_id>` returns incomplete/empty response

**Verification**:
```powershell
# Check ComfyUI process is still running
Get-Process | Where-Object { $_.Name -like "*python*" -and $_.Path -like "*ComfyUI*" } | ForEach-Object {
  Write-Host "Process: $($_.Name) (PID: $($_.Id))"
}

# Check ComfyUI log for crashes
$logPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output.log"
if (Test-Path $logPath) {
  Get-Content $logPath -Tail 100 | Select-String -Pattern "error|crash|exception|traceback"
}
```

**Fix strategy for PATH C**:
- [ ] Restart ComfyUI: stop and restart task
- [ ] Check for model corruption (re-download WAN2 model)
- [ ] Increase ComfyUI memory settings or reduce batch size
- [ ] Check Windows Event Viewer for system-level crashes

---

### Document Your Root Cause

**Create a file**: `$diagDir\ROOT_CAUSE_DETERMINATION.md`

```markdown
# Root Cause Determination

## Finding Summary
[Paragraph explaining what you found during diagnostics]

## Root Cause Category
- [ ] PATH A: SaveVideo works, but PowerShell script has issue
  - Specific issue: [describe]
- [ ] PATH B: SaveVideo not executing
  - Specific issue: [describe]
- [ ] PATH C: ComfyUI crash/hang
  - Specific issue: [describe]

## Evidence
- Diagnostic task results: [reference files]
- Manual test outcome: [YES/NO and details]
- History query findings: [what was/wasn't in response]

## Confidence Level
[HIGH (>80%) / MEDIUM (50-80%) / LOW (<50%)]

## Recommended Fix (Next Phase)
[Description of fix to implement]

## Estimated Implementation Time
[hours]

## Risk Level
[LOW / MEDIUM / HIGH – explain]
```

---

## PART 4: PHASE 2 – IMPLEMENTATION (Varies: 1-4 hours)

**Only proceed after completing Phase 1 AND documenting root cause.**

### Implementation Path A: PowerShell Script Fix

**If issue**: Output path or polling config

**Step 1**: Update `scripts/generate-scene-videos-wan2.ps1`
```powershell
# Around line 450-480, the section that waits for/copies MP4 files

# CURRENT (possibly wrong):
$expectedOutput = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\$sceneId\$sceneId.mp4"

# FIX (if MP4 is in different location):
$expectedOutput = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\<ACTUAL_LOCATION_FROM_DIAGNOSTICS>\<ACTUAL_FILENAME>"

# Then test:
if (Test-Path $expectedOutput) {
  Write-Host "✓ MP4 found at: $expectedOutput"
} else {
  Write-Host "✗ Expected location: $expectedOutput"
  Get-ChildItem (Split-Path $expectedOutput) -Filter "*.mp4"
}
```

**Step 2**: Increase polling timeout
```powershell
# Around line ~920 in run-comfyui-e2e.ps1:
$env:WAN2_MAX_WAIT = 600  # Increase from 240 to 600 seconds (10 minutes)
```

**Step 3**: Re-test
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File "C:\Dev\gemDirect1\scripts\run-comfyui-e2e.ps1" -FastIteration
```

**Validation**: Check `logs/<timestamp>/video/` for `.mp4` files

---

### Implementation Path B: Workflow Fix

**If issue**: SaveVideo node not connected or corrupted

**Step 1**: Download reference workflow
- Visit: https://github.com/comfyanonymous/ComfyUI/discussions or https://civitai.com
- Search for "WAN2 image to video workflow"
- Download a working `.json` example

**Step 2**: Compare structures
```powershell
$broken = Get-Content "C:\Dev\gemDirect1\workflows\video_wan2_2_5B_ti2v.json" | ConvertFrom-Json
$reference = Get-Content "C:\Downloads\reference_wan2_workflow.json" | ConvertFrom-Json

# Compare node types
Write-Host "Broken workflow nodes:"
$broken.PSObject.Properties | ForEach-Object { "  $($_.Value.class_type)" }

Write-Host "Reference workflow nodes:"
$reference.PSObject.Properties | ForEach-Object { "  $($_.Value.class_type)" }

# Identify differences
```

**Step 3**: Repair or replace workflow
```powershell
# Option 1: Replace entirely
Copy-Item "C:\Downloads\reference_wan2_workflow.json" "C:\Dev\gemDirect1\workflows\video_wan2_2_5B_ti2v.json" -Force

# Option 2: Manual repair
# Edit workflow JSON in VS Code, fix SaveVideo node connections
```

**Step 4**: Verify via UI test
- Open ComfyUI → Load repaired workflow → Manual test (as in Phase 1)

**Validation**: Manual UI test produces MP4 successfully

---

### Implementation Path C: ComfyUI Troubleshooting

**If issue**: Process crash, memory leak, or model corruption

**Step 1**: Restart and re-test
```powershell
# Stop ComfyUI
Stop-Process -Name python -Force -ErrorAction SilentlyContinue

# Clear queue
pwsh -Command "
  \$null = Invoke-RestMethod http://127.0.0.1:8188/interrupt -Method POST
  Start-Sleep -Seconds 2
  \$null = Invoke-RestMethod http://127.0.0.1:8188/queue -Method POST -Headers @{'Content-Type'='application/json'} -Body '{\"clear\":true}'
"

# Restart ComfyUI via task
# (Use VS Code task runner or manual start)
```

**Step 2**: Check for model corruption
```powershell
$modelDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models"

# List WAN2 model files
Get-ChildItem "$modelDir\*wan*" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "$($_.FullName) - Size: $($_.Length / 1GB) GB"
}

# If missing or corrupted, you may need to re-download
```

**Step 3**: Increase memory allocation (if available)
```powershell
# In ComfyUI startup, add flags:
# --listen 0.0.0.0 --port 8188 --enable-cors-header '*' --disable-mmap

# OR in ComfyUI config (if config.json exists):
# { "memory": { "gpu_memory_fraction": 0.8 } }
```

**Step 4**: Re-test
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File "C:\Dev\gemDirect1\scripts\generate-scene-videos-wan2.ps1" -SceneId test-001 -MaxWaitSeconds 600
```

---

## PART 5: VALIDATION & TESTING (1-2 hours)

**After implementing fix, validate thoroughly.**

### Validation Task 1: Single Scene Test

```powershell
Write-Host "=== SINGLE SCENE VALIDATION ==="

# Generate one scene with detailed logging
$testRunDir = "C:\Dev\gemDirect1\logs\validation-test-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $testRunDir -Force | Out-Null

# Run single scene generation
& "C:\Dev\gemDirect1\scripts\generate-scene-videos-wan2.ps1" `
  -SceneId "val-scene-001" `
  -MaxWaitSeconds 600 `
  -OutputDir $testRunDir `
  *> "$testRunDir\wan2-generation.log"

# Check output
if (Test-Path "$testRunDir\video\val-scene-001\*.mp4") {
  Write-Host "✓ MP4 generated successfully"
  Get-ChildItem "$testRunDir\video\val-scene-001\*.mp4" | ForEach-Object {
    Write-Host "  File: $($_.Name)"
    Write-Host "  Size: $($_.Length / 1MB) MB"
  }
} else {
  Write-Host "✗ MP4 NOT generated"
  Write-Host "  Check logs: $testRunDir\wan2-generation.log"
  Get-Content "$testRunDir\wan2-generation.log" -Tail 50
  exit 1
}
```

**Success criteria**:
- ✅ MP4 file created (>500KB)
- ✅ File is valid MP4 (can be opened with video player)
- ✅ No errors in logs

---

### Validation Task 2: Full E2E Test

```powershell
Write-Host "=== FULL E2E VALIDATION ==="

# Run complete pipeline
pwsh -NoLogo -ExecutionPolicy Bypass -File "C:\Dev\gemDirect1\scripts\run-comfyui-e2e.ps1" -FastIteration

# Check results
$latestRun = Get-ChildItem "C:\Dev\gemDirect1\logs\*" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1

Write-Host ""
Write-Host "Latest run: $($latestRun.Name)"

# Count videos
$videoCount = @(Get-ChildItem "$($latestRun.FullName)\video\*\*.mp4" -ErrorAction SilentlyContinue).Count
Write-Host "Videos generated: $videoCount"

# Check run summary
Get-Content "$($latestRun.FullName)\run-summary.txt" | Select-String "Wan2 video generation|ERROR|FAILED"

# Validate metadata
$metadata = Get-Content "$($latestRun.FullName)\artifact-metadata.json" | ConvertFrom-Json
Write-Host ""
Write-Host "Metadata validation:"
$metadata.Scenes | ForEach-Object {
  $videoStatus = $_.Video.Status
  Write-Host "  Scene $($_.Id): video=$videoStatus"
}
```

**Success criteria**:
- ✅ Run completes without errors
- ✅ All 3 scenes have MP4 files
- ✅ `videosDetected === 3` in metadata
- ✅ Run time < 45 minutes

---

### Validation Task 3: Stability Test (2-3 runs)

```powershell
Write-Host "=== STABILITY VALIDATION (3 runs) ==="

$results = @()

for ($i = 1; $i -le 3; $i++) {
  Write-Host ""
  Write-Host "Run $i of 3..."
  
  $start = Get-Date
  pwsh -NoLogo -ExecutionPolicy Bypass -File "C:\Dev\gemDirect1\scripts/run-comfyui-e2e.ps1" -FastIteration -ErrorAction SilentlyContinue
  $duration = (Get-Date) - $start
  
  # Get latest run metadata
  $latestRun = Get-ChildItem "C:\Dev\gemDirect1\logs\*" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1
  $metadata = Get-Content "$($latestRun.FullName)\artifact-metadata.json" | ConvertFrom-Json
  $videoCount = @(Get-ChildItem "$($latestRun.FullName)\video\*\*.mp4" -ErrorAction SilentlyContinue).Count
  
  $results += @{
    Run = $i
    Duration = $duration.TotalSeconds
    VideosGenerated = $videoCount
    Success = ($videoCount -eq 3)
  }
  
  Write-Host "  Duration: $($duration.TotalSeconds) seconds"
  Write-Host "  Videos: $videoCount/3"
}

# Summary
Write-Host ""
Write-Host "=== STABILITY RESULTS ==="
$results | Format-Table -AutoSize
$successRate = ($results | Where-Object { $_.Success } | Measure-Object).Count / 3 * 100
Write-Host "Success rate: $successRate%"

if ($successRate -ge 100) {
  Write-Host "✓ All 3 runs successful – READY FOR PRODUCTION"
} elseif ($successRate -ge 67) {
  Write-Host "⚠ 2/3 runs successful – INVESTIGATE INTERMITTENT FAILURES"
} else {
  Write-Host "✗ Stability issue – MORE FIXES NEEDED"
}
```

---

## PART 6: DOCUMENTATION & HANDOFF (30-60 minutes)

**After successful validation, document your changes.**

### Update Task 1: README.md

Add a section documenting the fix:

```markdown
## Fix Applied: WAN2 Video Generation (November 19, 2025)

### The Problem
WAN2 prompts were queueing successfully (HTTP 200 + prompt_id), but SaveVideo outputs were not being detected, resulting in zero MP4 files generated.

### Root Cause
[Describe what you found during Phase 1 diagnostics]

### Solution Applied
[Describe the fix you implemented]

### Validation
- Single scene test: ✓ MP4 generated
- Full e2e test: ✓ All 3 videos produced
- Stability test (3 runs): ✓ 100% success rate

### Performance Impact
- Story generation: [time]
- SVD frame generation: [time per scene]
- WAN2 video generation: [time per scene]
- Total e2e time: [time]

### Next Steps
1. Re-enable local LLM GPU offload for 3-4x faster story generation
2. Investigate scene-002/003 frame generation variability
3. Performance optimization and streaming output
```

---

### Update Task 2: VALIDATION_PROGRESS.md

Update milestone status:

```markdown
## Milestone 1: At Least One WAN2 Video
- [x] WAN2 prompt queues (HTTP 200 + prompt_id)
- [x] At least 1 MP4 file generated
- [x] File size > 500KB
- [x] Metadata shows successful video
- **STATUS**: ✅ ACHIEVED

## Milestone 2: All Scenes Yield Videos
- [x] All 3 scenes produce MP4s
- [x] All files valid and playable
- [x] videosDetected === 3
- [x] Run time < 45 minutes
- **STATUS**: ✅ ACHIEVED

## Milestone 3: Robust, Production-Ready Runs
- [x] 3+ consecutive full e2e runs
- [x] 100% success rate
- [ ] Frame floor attainment (needs work for scene-002/003)
- [ ] GPU offload re-enabled
- **STATUS**: 🟡 IN PROGRESS
```

---

### Update Task 3: Create Session Summary

```markdown
# Session Summary: WAN2 Video Generation Fix
Date: November 19, 2025

## What Was Fixed
- WAN2 SaveVideo node outputs now being detected
- MP4 files now being generated and saved correctly
- All 3 scenes produce videos

## Root Cause
[Your findings]

## Fix Implementation
[What you changed]

## Validation Results
- Single scene: ✓
- Full e2e: ✓
- Stability (3 runs): ✓

## Remaining Issues
1. Scene-002/003 frame generation variability (1-8 frames vs. 25 target)
2. Local LLM GPU offload deferred (stability trade-off)
3. UI integration of video results

## Files Modified
- scripts/generate-scene-videos-wan2.ps1 (if path/timeout changed)
- scripts/run-comfyui-e2e.ps1 (if timeout changed)
- workflows/video_wan2_2_5B_ti2v.json (if workflow fixed)

## Confidence for Next Agent
[HIGH/MEDIUM/LOW + explanation]
```

---

### Update Task 4: Git Commit

```powershell
cd C:\Dev\gemDirect1

git add .
git commit -m "Fix: WAN2 video generation blocker

- [Describe fix briefly]
- Validated with 3+ successful e2e runs
- All 3 scenes now produce MP4 files
- Ready for Milestone 2 validation

Fixes: #[issue number if applicable]"

git tag -a v0.4.0-wan2-fix -m "WAN2 video generation fix"
git push origin main --tags
```

---

## PART 7: NEXT PRIORITIES (For Future Agent)

If you complete WAN2 fix, these are recommended next steps:

### Priority 1: Scene-002/003 Frame Stability
**Issue**: Getting 1-8 frames instead of 25  
**Estimated effort**: 2-3 hours  
**Impact**: Ensures all scenes meet quality floor

**Tasks**:
- Add fixed seed to SVD prompt generation
- Investigate VRAM contention during requeue
- Increase requeue budget from 1 to 2

---

### Priority 2: Local LLM GPU Offload
**Issue**: Currently CPU-only (~90s per story)  
**Estimated effort**: 1 hour  
**Impact**: 3-4x faster story generation

**Tasks**:
- Configure LM Studio GPU offload (32 layers for Mistral 7B)
- Run 3 stability tests
- Monitor VRAM for OOM during concurrent SVD/WAN2 loads

---

### Priority 3: Performance Optimization
**Issue**: Total e2e time ~40-50 minutes  
**Estimated effort**: 2-4 hours  
**Impact**: Faster iteration for users

**Tasks**:
- Profile each phase (story, SVD, WAN2)
- Identify bottlenecks
- Implement parallel processing where possible

---

## FINAL CHECKLIST

**Before marking your work COMPLETE**, verify**:

- [ ] Diagnostics Phase completed and documented
- [ ] Root cause identified with high confidence
- [ ] Fix implemented and tested
- [ ] Single scene validation passed
- [ ] Full e2e validation passed
- [ ] Stability test (3+ runs) passed
- [ ] README.md updated with fix details
- [ ] VALIDATION_PROGRESS.md updated
- [ ] Session summary created
- [ ] Changes committed to git
- [ ] No TypeScript compilation errors: `npm run build`
- [ ] All tests passing: `npm test` (or vitest runs)
- [ ] Next agent can read README + understand current state

**If ALL boxes checked**: You've successfully completed the handoff! 🎉

---

## APPENDIX: QUICK COMMAND REFERENCE

```powershell
# Start ComfyUI
# Use VS Code task: "Start ComfyUI Server (Patched - Recommended)"

# Check ComfyUI status
curl http://127.0.0.1:8188/system_stats

# Query history for a prompt
$history = Invoke-WebRequest "http://127.0.0.1:8188/history/<prompt_id>" | ConvertFrom-Json

# Run full e2e
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration

# Run single scene WAN2 test
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/generate-scene-videos-wan2.ps1 -SceneId scene-001

# View latest run summary
Get-Content (Get-ChildItem "C:\Dev\gemDirect1\logs\*" -Directory | Sort-Object CreationTime -Descending | Select-Object -First 1).FullName"\run-summary.txt"

# Build project
npm run build

# Start dev server
npm run dev

# Run tests
node ./node_modules/vitest/vitest.mjs run --pool=vmThreads
```

---

## FINAL WORDS

You have been given:
1. ✅ Complete architectural understanding
2. ✅ Clear root cause hypotheses  
3. ✅ Detailed diagnostic procedures
4. ✅ Implementation pathways for each scenario
5. ✅ Validation checklist
6. ✅ Documentation templates

**Your job**: Execute this plan methodically, starting with Phase 1 Diagnostics. Don't skip steps. Don't guess at fixes without evidence.

**Expected outcome**: By end of Day 2, WAN2 video generation working and production-ready.

**Questions?**: Re-read the COMPREHENSIVE_AGENT_HANDOFF_20251119.md file – it contains answers.

**Good luck!** 🚀

*This prompt was generated with 15+ hours of accumulated context from a complex AI video generation system. Use it well.*
