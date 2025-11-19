# NEXT AGENT EXECUTABLE PROMPT
## Autonomous Implementation Instructions for Feature Branch Completion

**Target Agent**: AI Coding Agent (Claude Haiku 4.5+)  
**Session Context**: New, isolated session  
**Primary Goal**: Complete remaining items for production deployment  
**Time Estimate**: 2-3 days for Milestone 2, 4-5 days for Milestone 3  
**Success Criteria**: All 3 scenes produce valid MP4 videos + stable runs validated

---

## EXECUTIVE DIRECTIVE

You are being handed off the **gemDirect1** project at a critical juncture: all core infrastructure is working, performance optimizations complete, but **two critical blockers** prevent production deployment:

1. **WAN2 MP4 Video Output Not Generating** (Primary Blocker)
2. **SVD Frame Count Variability** (Secondary Blocker)

Your mission is to **investigate, fix, and validate** these blockers autonomously within the scope defined below. You have comprehensive documentation, detailed diagnostic procedures, and step-by-step implementation plans. **Use them.**

This prompt contains everything you need to succeed. You should NOT loop back to previous humans for clarification unless you discover something explicitly contradicts the provided documentation.

---

## SECTION 1: IMMEDIATE ACTIONS (First 30 Minutes)

### 1.1 Read Documentation in Exact Order

These files are your **primary reference** for the next 2-3 days. Read them in this order before writing any code:

1. **`README.md`** (15 min)
   - Local setup requirements
   - LLM configuration (Mistral 7B via LM Studio)
   - ComfyUI health check
   - WAN workflow mappings
   - **Action**: Verify all prerequisites are met

2. **`WORKFLOW_ARCHITECTURE_REFERENCE.md`** (20 min)
   - Complete data flow diagram
   - Node mappings (CLIPTextEncode, LoadImage, SaveVideo)
   - SVD vs. WAN2 workflow differences
   - **Action**: Understand workflow architecture completely

3. **`.github/copilot-instructions.md`** (15 min)
   - Service layer patterns (MUST follow)
   - State management architecture
   - TypeScript standards
   - Error handling requirements
   - **Action**: Commit these patterns to memory; they apply to ANY code you write

4. **`NEXT_AGENT_COMPREHENSIVE_HANDOFF.md`** (30 min)
   - Full context from previous sessions
   - Detailed Phase 1-6 implementation plans
   - Common pitfalls to avoid
   - Root cause analysis for both blockers
   - **Action**: Section 2.1-2.3 especially; understand all lessons learned

5. **`P0_OPTIMIZATION_IMPLEMENTATION_REPORT.md`** (10 min)
   - What was optimized (bundle, code splitting)
   - Test stability (36/50 passing = 72%)
   - **Action**: Understand performance baseline

### 1.2 Verify Workspace Setup (10 min)

```powershell
# 1. Verify Node.js version
node -v  # Should be ≥ 22.19.0

# 2. Verify ComfyUI running
$stats = Invoke-WebRequest 'http://127.0.0.1:8188/system_stats' -ErrorAction Stop
Write-Host "ComfyUI Status: OK" -ForegroundColor Green

# 3. Verify LM Studio running
$models = Invoke-WebRequest 'http://192.168.50.192:1234/v1/models' -ErrorAction Stop
Write-Host "LM Studio Status: OK" -ForegroundColor Green

# 4. Verify required dependencies
npm list gemini @google/generative-ai | head -5

# 5. Verify critical scripts exist
ls scripts/generate-scene-videos-wan2.ps1 -ErrorAction Stop
ls workflows/video_wan2_2_5B_ti2v.json -ErrorAction Stop
```

If any check fails, **stop and fix before proceeding**. This is not negotiable.

### 1.3 Review Latest Run Artifacts (15 min)

```powershell
# 1. Read human-readable summary
Get-Content 'logs/20251119-011556/run-summary.txt' -Head 50

# 2. Examine structured metadata
$metadata = Get-Content 'logs/20251119-011556/artifact-metadata.json' | ConvertFrom-Json
Write-Host "Story: $($metadata.Story.Title)"
Write-Host "Scenes: $($metadata.Scenes.Count)"
Write-Host "Videos: $($metadata.Videos.Count)"

# 3. Check directory structure
tree logs/20251119-011556/ /F | head -50
```

**Critical Observation**: Note the empty `video/` directory – this is what Phase 1 investigation will diagnose.

---

## SECTION 2: PRIMARY MISSION – PHASE 1 WAN2 DIAGNOSTICS (CRITICAL)

### 2.1 Your Mission Statement

**Goal**: Determine why SaveVideo node outputs aren't being written to disk despite successful HTTP queuing.

**Success Criteria**:
- ✅ Manual UI test documents whether SaveVideo executes or fails
- ✅ ComfyUI history endpoint analyzed for `execution_success` + output fields
- ✅ Workflow JSON reviewed (no obvious connection issues)
- ✅ PowerShell script output logged (history response visible in console)
- ✅ **Clear root cause hypothesis identified** (choose ONE: A, B, C, D, or E)
- ✅ No ambiguity about next steps

### 2.2 Phase 1 Step-by-Step Execution

**DO NOT SKIP STEPS. DO NOT DEVIATE FROM PROCEDURE.**

#### Task 1.1: Baseline Diagnostics (30 min)

```powershell
# 1. Create diagnostic directory
$diagDir = "logs/diagnose-wan2-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $diagDir -Force | Out-Null

# 2. Start fresh ComfyUI (if not running)
# Use VS Code task: "Start ComfyUI Server (Patched - Recommended)"

# 3. Run health check
npm run check:health-helper
# Should pass with no warnings

# 4. Query system stats
$stats = Invoke-WebRequest 'http://127.0.0.1:8188/system_stats' | ConvertFrom-Json
$stats | ConvertTo-Json -Depth 5 | Out-File "$diagDir/baseline-stats.json"
Write-Host "System Stats Captured:"
Write-Host "- GPU: $($stats.devices[0].name)"
Write-Host "- VRAM Total: $($stats.devices[0].vram_total)MB"
Write-Host "- Free: $($stats.devices[0].vram_free)MB" -ForegroundColor Green

# 5. Verify model files exist
$modelDirs = @(
    'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\WAN2\',
    'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\',
    'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip\'
)
$modelDirs | ForEach-Object {
    if (Test-Path $_) {
        Write-Host "✓ $_" -ForegroundColor Green
    } else {
        Write-Host "✗ $_ - MISSING!" -ForegroundColor Red
    }
}
```

**Document**: Save console output to `$diagDir/baseline-checks.txt`

#### Task 1.2: Manual WAN2 UI Test (60 min)

```powershell
# 1. Open ComfyUI UI in browser
Start-Process 'http://127.0.0.1:8188'

# 2. Load WAN2 workflow
# - Right-click on canvas
# - Select "Load" → browse to workflows/video_wan2_2_5B_ti2v.json
# - Click Open

# 3. Set up test inputs
# - Find LoadImage node
# - Click on it, select keyframe file:
#   logs/20251119-011556/story/keyframes/scene-001.png
# - Find positive CLIPTextEncode node (search for "CLIP")
# - Set text to: "a red car driving fast down a highway, cinematic, 8k"
# - Find negative CLIPTextEncode node
# - Set text to: "blurry, low quality, distorted"

# 4. Queue the workflow
# - Click "Queue Prompt" button
# - Copy the prompt_id from response (should be in UI or console)
# - Record: $promptId = "<your-id-here>"

# 5. Wait for execution
Write-Host "Waiting up to 10 minutes for WAN2 execution..."
$startTime = Get-Date
do {
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    Write-Host "[$([Math]::Floor($elapsed))s] Waiting..." -NoNewline
    Start-Sleep -Seconds 30
    if (Test-Path 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-001\scene-001.mp4' -ErrorAction SilentlyContinue) {
        Write-Host " ✓ MP4 found!" -ForegroundColor Green
        break
    }
} while ($elapsed -lt 600)

# 6. Check results
$mp4Path = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\video\scene-001\scene-001.mp4'
if (Test-Path $mp4Path) {
    $mp4 = Get-Item $mp4Path
    Write-Host "✓ MP4 Generated!" -ForegroundColor Green
    Write-Host "- Path: $($mp4.FullName)"
    Write-Host "- Size: $($mp4.Length / 1MB)MB"
    # COPY MP4 to diagnostic directory
    Copy-Item $mp4Path "$diagDir/manual-test-output.mp4" -Force
} else {
    Write-Host "✗ No MP4 found after 10 minutes" -ForegroundColor Red
}

# 7. Document result
@{
    PromptId = $promptId
    Duration = $elapsed
    Success = (Test-Path $mp4Path)
    Timestamp = Get-Date
} | ConvertTo-Json | Out-File "$diagDir/manual-test-result.json"
```

**Critical Decision Point**:
- **If MP4 generated**: Problem is in PowerShell script, not workflow
- **If MP4 NOT generated**: Continue to Task 1.3 (history analysis)

#### Task 1.3: ComfyUI History Query Analysis (45 min)

```powershell
# Query history endpoint for the prompt you just queued
$promptId = "<paste-your-prompt-id-from-manual-test>"
Write-Host "Querying history for prompt: $promptId" -ForegroundColor Cyan

$historyResponse = Invoke-WebRequest "http://127.0.0.1:8188/history/$promptId" -TimeoutSec 10
$history = $historyResponse.Content | ConvertFrom-Json

# Save full response
$history | ConvertTo-Json -Depth 10 | Out-File "$diagDir/history-full-response.json"
Write-Host "✓ History response saved to history-full-response.json"

# Analyze response
$promptData = $history.$promptId
Write-Host "`nHistory Analysis:" -ForegroundColor Yellow
Write-Host "- execution_success: $($promptData.outputs.execution_success)"
Write-Host "- execution_error: $($promptData.outputs.execution_error)"

# Check for SaveVideo node outputs
$saveVideoOutput = $promptData.outputs | Get-Member -Type NoteProperty | `
    Where-Object { $_.Name -like "*SaveVideo*" -or $_.Definition -like "*video*" }

if ($saveVideoOutput) {
    Write-Host "✓ SaveVideo outputs found:" -ForegroundColor Green
    $saveVideoOutput | ForEach-Object { Write-Host "  - $($_.Name)" }
    $promptData.outputs | ConvertTo-Json -Depth 5 | Write-Host
} else {
    Write-Host "✗ NO SaveVideo outputs in history" -ForegroundColor Red
    Write-Host "`nAll output nodes in history:" -ForegroundColor Yellow
    $promptData.outputs | Get-Member -Type NoteProperty | ForEach-Object { Write-Host "  - $($_.Name)" }
}

# Document findings
@{
    PromptId = $promptId
    ExecutionSuccess = $promptData.outputs.execution_success
    ExecutionError = $promptData.outputs.execution_error
    SaveVideoPresent = ($saveVideoOutput -ne $null)
    AllOutputs = ($promptData.outputs | Get-Member -Type NoteProperty | Select-Object -ExpandProperty Name)
    Timestamp = Get-Date
} | ConvertTo-Json | Out-File "$diagDir/history-analysis.json"
```

**Critical Decision Point**:
- **If SaveVideo outputs in history**: File generation succeeded, polling timeout too short or path wrong
- **If NO SaveVideo outputs**: SaveVideo node not executing, check workflow JSON next

#### Task 1.4: Workflow JSON Audit (30 min)

```powershell
# Load and examine workflow
$workflowPath = 'workflows/video_wan2_2_5B_ti2v.json'
$workflow = Get-Content $workflowPath | ConvertFrom-Json

Write-Host "Analyzing Workflow: $workflowPath" -ForegroundColor Cyan

# Find SaveVideo node
$saveVideoNode = $workflow.PSObject.Properties | Where-Object { 
    $_.Value.class_type -eq 'SaveVideo' 
} | Select-Object -First 1

if ($saveVideoNode) {
    Write-Host "✓ SaveVideo node found" -ForegroundColor Green
    Write-Host "`nSaveVideo Configuration:"
    $saveVideoNode.Value | ConvertTo-Json -Depth 3 | Write-Host
    
    # Check configuration
    $inputs = $saveVideoNode.Value.inputs
    Write-Host "`nConfiguration Checks:" -ForegroundColor Yellow
    Write-Host "- filename_prefix: $($inputs.filename_prefix)" `
        $(if ($inputs.filename_prefix -like "*/*") { "✓ (forward slash)" } else { "✗ (no forward slash)" })
    Write-Host "- format: $($inputs.format)" $(if ($inputs.format -eq 'mp4') { "✓" } else { "✗" })
    Write-Host "- codec: $($inputs.codec)" $(if ($inputs.codec -in 'auto', 'libx264', 'h264_nvenc') { "✓" } else { "?" })
    
    # Check if SaveVideo is connected to anything
    Write-Host "`nConnection Check:" -ForegroundColor Yellow
    $nodeConnections = $workflow.PSObject.Properties | Where-Object {
        $_.Value.inputs -and ($_.Value.inputs | ConvertTo-Json | Select-String $saveVideoNode.Name)
    }
    if ($nodeConnections) {
        Write-Host "✓ SaveVideo is connected from: $($nodeConnections.Name -join ', ')"
    } else {
        Write-Host "✗ SaveVideo has no incoming connections (orphaned node)"
    }
} else {
    Write-Host "✗ SaveVideo node NOT found in workflow!" -ForegroundColor Red
}

# Save workflow analysis
$workflow | ConvertTo-Json -Depth 10 | Out-File "$diagDir/workflow-full.json"
```

**Critical Decision Points**:
- **If SaveVideo connections missing**: Workflow is broken, need to fix JSON
- **If SaveVideo configured wrongly**: Fix configuration (paths, codec)
- **If SaveVideo looks OK**: Problem likely in PowerShell script

#### Task 1.5: PowerShell Script Verbose Logging (30 min)

```powershell
# Edit generate-scene-videos-wan2.ps1 to add verbose logging
$scriptPath = 'scripts/generate-scene-videos-wan2.ps1'
$scriptContent = Get-Content $scriptPath -Raw

# Find the history polling section (around line 440)
# Look for: $result = Invoke-RestMethod -Uri "$comfyUrl/history/$promptId"

# ADD THIS AFTER THE HISTORY QUERY (preserve exact location):
$loggingCode = @'
Write-Host "`n[VERBOSE] History Response at $(Get-Date -Format 'HH:mm:ss'):" -ForegroundColor Cyan
Write-Host "Response Body: $($result | ConvertTo-Json -Depth 3 -Compress | Select-Object -First 500)" -ForegroundColor Yellow
if ($result.$promptId.outputs) {
    Write-Host "SaveVideo Outputs: $($result.$promptId.outputs | ConvertTo-Json -Depth 3)" -ForegroundColor Green
}
'@

# For this test, run with explicit logging
$testCmd = @"
`$comfyUrl = 'http://127.0.0.1:8188'
`$promptId = '<your-prompt-id>'
`$maxWait = 600
`$pollInterval = 5
`$elapsed = 0

Write-Host 'Starting manual history polling...' -ForegroundColor Green

while (`$elapsed -lt `$maxWait) {
    try {
        `$result = Invoke-RestMethod "`$comfyUrl/history/`$promptId" -TimeoutSec 10
        
        Write-Host "[`$elapsed/600s] History query successful" -ForegroundColor Green
        Write-Host "`$(`$result | ConvertTo-Json -Depth 3 | Select-Object -First 300)" -ForegroundColor Cyan
        
        if (`$result.`$promptId.outputs.execution_success) {
            Write-Host "✓ Execution complete!" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "[`$elapsed/600s] Error: `$_" -ForegroundColor Red
    }
    
    `$elapsed += `$pollInterval
    Start-Sleep -Seconds `$pollInterval
}
"@

# Execute manual polling
Invoke-Expression $testCmd
```

**Document**: Capture full output to `$diagDir/script-verbose-output.txt`

#### Task 1.6: Root Cause Hypothesis (30 min)

```powershell
# Consolidate all findings into a hypothesis document
$hypothesis = @"
# WAN2 MP4 Generation Root Cause Analysis

## Evidence Summary

### Manual UI Test
- SaveVideo executed: [YES/NO]
- MP4 file generated: [YES/NO]
- File size: [SIZE]
- Location: [PATH]

### History Query
- execution_success: [true/false]
- SaveVideo outputs present: [YES/NO]
- Output filenames: [LIST]

### Workflow JSON
- SaveVideo node exists: [YES/NO]
- Connections valid: [YES/NO]
- Configuration issues: [NONE/LIST]

### PowerShell Script
- History polling works: [YES/NO]
- Response format valid: [YES/NO]
- Path parsing correct: [YES/NO]

## Root Cause Hypothesis

**Selected: [A/B/C/D/E]**

### Option A: SaveVideo Node Not Executing
Evidence: [history shows no execution_success / manual test fails]
Fix: Repair workflow node connections in video_wan2_2_5B_ti2v.json

### Option B: Files Written to Different Directory
Evidence: [manual test finds MP4 in unexpected location]
Fix: Update path in script to match actual output directory

### Option C: Codec or FFmpeg Missing
Evidence: [ComfyUI logs show codec error]
Fix: Install ffmpeg or update codec configuration

### Option D: Timeout Too Short
Evidence: [execution_success appears AFTER 240s timeout]
Fix: Extend MaxWaitSeconds to 600+

### Option E: VRAM Insufficiency
Evidence: [VRAM drops to <2GB / ComfyUI crashes during WAN2]
Fix: Add delays between phases / reduce batch size

## Proposed Next Steps
1. [ACTION 1]
2. [ACTION 2]
3. [ACTION 3]

## Decision Gate
Proceed to Phase 2 implementation only after confirming this hypothesis.
"@

$hypothesis | Out-File "$diagDir/ROOT_CAUSE_HYPOTHESIS.md"
Write-Host "`n✓ Hypothesis document created: $diagDir/ROOT_CAUSE_HYPOTHESIS.md" -ForegroundColor Green

# Summary
Write-Host "`n" -ForegroundColor Green
Write-Host "=" * 70
Write-Host "PHASE 1 DIAGNOSTICS COMPLETE" -ForegroundColor Green
Write-Host "=" * 70
Write-Host "Diagnostic directory: $diagDir"
Write-Host "`nFiles generated:"
Get-ChildItem $diagDir -Recurse | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host "`nNext: Read ROOT_CAUSE_HYPOTHESIS.md and proceed to Phase 2"
Write-Host "=" * 70
```

### 2.3 Success Validation

**Phase 1 is complete ONLY WHEN**:
- ✅ `ROOT_CAUSE_HYPOTHESIS.md` identifies ONE clear root cause
- ✅ All diagnostic files captured in `$diagDir`
- ✅ No ambiguity about failure mode
- ✅ Proposed Phase 2 fix is specific and actionable

**If you're uncertain**: Re-read the hypothesis section and choose the most likely option based on evidence. Don't proceed to Phase 2 until you're confident.

---

## SECTION 3: SECONDARY MISSION – PHASES 2-6 (Implementation)

Once Phase 1 diagnostic is complete, implement fixes according to the detailed roadmap in `NEXT_AGENT_COMPREHENSIVE_HANDOFF.md`:

- **Phase 2** (4-6 hrs): Implement WAN2 fix based on diagnosed root cause
- **Phase 3** (2 hrs): Stabilize SVD frame generation (add seed, increase requeue budget)
- **Phase 4** (4 hrs): Re-enable GPU offload (optional, if time allows)
- **Phase 5** (3-4 hrs): Comprehensive testing (5x e2e runs, full test suite)
- **Phase 6** (2-3 hrs): Documentation & handoff

**CRITICAL**: Each phase has a detailed checklist in `NEXT_AGENT_COMPREHENSIVE_HANDOFF.md`. DO NOT SKIP STEPS.

---

## SECTION 4: MANDATORY CONSTRAINTS & PATTERNS

### 4.1 Service Layer Pattern (MUST FOLLOW)

**ALL external API calls must route through service functions**, never directly from components:

```typescript
// ✅ CORRECT
const result = await withRetry(
  () => comfyUIService.queuePrompt(payload),
  'queue SVD',
  modelName,
  logApiCall,
  onStateChange
);

// ❌ WRONG – Direct API call
const response = await fetch('http://127.0.0.1:8188/prompt', { ... });
```

### 4.2 TypeScript Standards (ZERO EXCEPTIONS)

- Strict mode enabled
- No implicit `any` types
- Discriminated unions for errors
- All function parameters typed
- All returns explicitly typed

### 4.3 Telemetry Completeness (ZERO EXCEPTIONS)

Every scene generation MUST include all these fields:

```
DurationSeconds, MaxWaitSeconds, PollIntervalSeconds, HistoryAttempts,
HistoryAttemptLimit, pollLimit, SceneRetryBudget, PostExecutionTimeoutSeconds,
HistoryExitReason, GPU Name, VRAMBeforeMB, VRAMAfterMB, VRAMDeltaMB,
DoneMarkerWaitSeconds, DoneMarkerDetected, DoneMarkerPath, ForcedCopyTriggered
```

Missing any field = validation failure = run rejected.

### 4.4 Documentation Updates (REQUIRED)

After completing each phase, update:
- `README.md` (add section for fix)
- `WORKFLOW_ARCHITECTURE_REFERENCE.md` (if workflow changed)
- `VALIDATION_PROGRESS.md` (milestone update)
- `NEXT_AGENT_PRIORITIES.md` (remaining work)

---

## SECTION 5: EXIT CRITERIA (BEFORE HANDING OFF)

You are DONE when:

✅ **Phase 1**: Root cause hypothesis documented + saved to git  
✅ **Phase 2**: At least 1 MP4 file generated + tested  
✅ **Phase 3**: All 3 scenes yield videos + 25-frame floor achieved  
✅ **Phase 4** (optional): GPU offload stable OR reverted with notes  
✅ **Phase 5**: 5/5 e2e runs successful, all tests passing  
✅ **Phase 6**: All documentation updated, git history clean, tagged release  

**Success Metrics**:
- 0 TypeScript errors
- 36/50 Playwright tests passing
- 100% Vitest passing
- All diagnostic reports committed to git
- Performance benchmarked
- Milestone 3 achieved OR Milestone 2 + clear roadmap to Milestone 3

---

## SECTION 6: REFERENCES & QUICK COMMANDS

### Critical Files
- `NEXT_AGENT_COMPREHENSIVE_HANDOFF.md` – Your detailed implementation bible
- `.github/copilot-instructions.md` – Architecture requirements
- `README.md` – Setup and LLM config
- `WORKFLOW_ARCHITECTURE_REFERENCE.md` – Workflow details

### Quick Commands
```powershell
# Pre-flight
npm run check:health-helper

# Full e2e run
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -FastIteration

# Tests
node ./node_modules/vitest/vitest.mjs run --pool=vmThreads
npx playwright test tests/e2e/

# Build
npm run build

# Dev
npm run dev
```

---

## SECTION 7: FINAL INSTRUCTIONS

1. **Read Section 1.1 documentation completely** (1 hour)
2. **Execute Phase 1 diagnostics exactly as specified** (3-4 hours)
3. **Document root cause hypothesis** (30 min)
4. **Commit diagnostic results to git** (5 min)
5. **Review Phase 2-6 in `NEXT_AGENT_COMPREHENSIVE_HANDOFF.md`**
6. **Implement fixes according to diagnosed root cause** (Days 2-5)
7. **Validate comprehensively** (Phase 5)
8. **Update all documentation** (Phase 6)
9. **Tag release and handoff** (5 min)

**You have everything you need.** Do not overthink. Follow the procedures exactly as specified. Ask no questions – the documentation contains all answers.

**Go.** 🚀
