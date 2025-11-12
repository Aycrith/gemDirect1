# Windows-Agent Testing Iteration Plan

**Date**: November 11, 2025  
**Environment**: Windows 10, Node v22.19.0, PowerShell 7.5.3, ComfyUI v0.3.68  
**Status**: Environment Validated ✓ | Ready for E2E Execution (with model caveats)

---

## 1. Environment Verification Checklist ✓
> **Update:** Before every run, confirm the helper prints `Story LLM status: ...` and `[Scene ...] Telemetry:` lines—`validate-run-summary.ps1` now enforces both so GPU/VRAM stats stay in sync with `public/artifacts/latest-run.json` and the Artifact Snapshot / Timeline UI.


### 1.1 Node Version
- **Required**: ≥ 22.19.0
- **Actual**: v22.19.0 ✓
- **Scripts**: Both `run-comfyui-e2e.ps1` and `run-vitests.ps1` enforce minimum version check
- **Failure Mode**: Scripts abort early with clear error message if version is older

### 1.2 PowerShell Configuration
- **Required**: pwsh.exe (PowerShell 7+)
- **Actual**: PowerShell 7.5.3 (Core) ✓
- **Location**: System PATH
- **Scripts**: Both main E2E script and Vitest helper explicitly invoke `pwsh -NoLogo -ExecutionPolicy Bypass`
- **Issue Avoided**: Prevents PS5.1 parsing failures with modern syntax (ternary, null-coalescing operators)

### 1.3 ComfyUI Server Status ✓
- **Server**: Running (Python process PID 7388)
- **Endpoint**: http://127.0.0.1:8188 ✓ (TCP 8188 connection successful)
- **Configuration**: CORS enabled via `--enable-cors-header "*"` ✓
- **Startup Command**:
  ```powershell
  cd "C:\ComfyUI\ComfyUI_windows_portable"
  .\python_embeded\python.exe -s ComfyUI\main.py `
    --windows-standalone-build `
    --listen 0.0.0.0 `
    --port 8188 `
    --enable-cors-header "*"
  ```

### 1.4 Directory Structure
- **ComfyUI Root**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\`
- **Input Directory**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\input\` ✓ (writable)
- **Output Directory**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\` ✓ (writable)
- **Models Base**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\`
  - Checkpoints: `models\checkpoints\` (⚠️ **EMPTY** - see section 2)
  - VAE: `models\vae\` ✓
  - ControlNet: `models\controlnet\` ✓
  - Clip Vision: `models\clip_vision\` ✓ (updated Nov 10)
  - LORAS: `models\loras\` ✓ (updated Nov 11)

---

## 2. Critical Blocker: SVD Model Missing ⚠️

### 2.1 Issue
The workflow `workflows/text-to-video.json` requires:
```json
"ckpt_name": "SVD\\svd_xt.safetensors"
```

**Current Status**: Checkpoint folder contains only placeholder file (`put_checkpoints_here`).

### 2.2 SVD Model Information
- **Model Name**: Stable Video Diffusion (SVD)
- **File Required**: `svd_xt.safetensors`
- **File Size**: ~2.5 GB
- **Source**: Hugging Face (https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/blob/main/svd_xt.safetensors)
- **Location to Place**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors`

### 2.3 Resolution Options

#### **Option A: Manual Download (Recommended for One-Time Setup)**
1. Download from Hugging Face:
   ```
   https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors
   ```
2. Create directory: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\`
3. Place file there: `svd_xt.safetensors`
4. Verify: Run command below to confirm
   ```powershell
   Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"
   ```

#### **Option B: ComfyUI Manager Download (In-Browser)**
1. Start ComfyUI and open http://127.0.0.1:8188
2. Click **Manager** button (top menu)
3. Click **"Install Models"**
4. Search for `svd_xt`
5. Click **Install**
6. Manager will auto-place file in correct location

#### **Option C: Scripted Download (Batch Processing)**
Create `scripts/download-svd-model.ps1`:
```powershell
param(
    [string] $OutputPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors",
    [string] $HuggingFaceUrl = "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors"
)

$OutputDir = Split-Path $OutputPath
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "Downloading SVD model from Hugging Face..."
$ProgressPreference = 'SilentlyContinue'  # Suppress progress bar for cleaner logs
Invoke-WebRequest -Uri $HuggingFaceUrl -OutFile $OutputPath -UseBasicParsing

if (Test-Path $OutputPath) {
    $sizeGB = (Get-Item $OutputPath).Length / 1GB
    Write-Host "✓ SVD model downloaded successfully ($sizeGB GB)"
} else {
    throw "Failed to download SVD model"
}
```

---

## 3. Full Test Suite Execution Flow

### 3.1 Automated Run Script
**Command**:
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

**Expected Duration**: ~3-5 minutes per scene (depending on SVD inference time)

**What Happens**:

1. **Node Version Check** (instant)
   - Parses `node -v`
   - Compares against minimum v22.19.0
   - Aborts if version is too old

2. **Story Generation** (30-60 seconds)
   - Invokes: `node --loader ts-node/esm scripts/generate-story-scenes.ts`
   - Generates 3 sample scenes with:
     - Scene ID
     - Prompt (cinematic description)
     - Negative prompt (quality guidelines)
     - Expected frame count
     - Keyframe path
   - Outputs: `logs/{timestamp}/story/story.json`

3. **ComfyUI Startup** (if not already running)
   - Launches Python ComfyUI process
   - Waits for health check via `GET /system_stats` (up to 60 retries × 2s)
   - Logs startup time

4. **Scene Processing per Scene** (3-5 minutes each, 3 scenes = 9-15 minutes total)
   - **Workflow Loading**: Reads `workflows/text-to-video.json`
   - **Payload Injection**: Substitutes placeholders:
     - `__KEYFRAME_IMAGE__` → actual keyframe file
     - `__SCENE_PROMPT__` → scene.prompt
     - `__NEGATIVE_PROMPT__` → scene.negativePrompt
     - `__SCENE_PREFIX__` → gemdirect1_scene_{id}
   - **REST Queue**: `POST /prompt` with workflow JSON
     - ComfyUI returns: `prompt_id`
   - **History Poll Loop** (up to 600 seconds max):
     - `GET /history/{prompt_id}` every 2 seconds
     - Waits for status: `"status": {"status_str": "success"}`
     - Timeout: If max wait exceeded, logs warning but continues
   - **Frame Collection**:
     - Scans multiple possible output directories for PNG frames
     - Expected: 25 frames (per workflow configuration)
     - Copies to: `logs/{timestamp}/scene_{id}/generated-frames/`
   - **History Archival**:
     - Saves: `logs/{timestamp}/scene_{id}/history.json`
   - **Retry Logic**:
     - If frames < 25 or history missing, can retry (default: max 1 retry)
     - Logs: `[Scene {id}][Attempt 1] Frames=25 Duration=180s Prefix=gemdirect1_scene_{id}`

5. **Vitest Suite Execution** (30-60 seconds)
   - Invokes: `pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-vitests.ps1 -ProjectRoot {root} -RunDir {rundir}`
   - Runs 3 test suites:
     - **ComfyUI Integration Tests** (`vitest run src/tests/comfyui.test.ts`)
       - Tests: Workflow loading, payload mapping, REST API interaction
       - Exit code stored in `logs/{timestamp}/vitest-results.json`
     - **E2E Scenario Tests** (`vitest run src/tests/e2e.test.ts`)
       - Tests: Full story-to-video pipeline
       - Validates frame outputs, metadata consistency
     - **Scripts Validation** (`vitest run scripts/tests/*.test.ts` if present)
       - Tests: Helper script correctness
   - Outputs:
     - `logs/{timestamp}/vitest-comfyui.log`
     - `logs/{timestamp}/vitest-e2e.log`
     - `logs/{timestamp}/vitest-scripts.log`
     - `logs/{timestamp}/vitest-results.json` (machine-readable exit codes)

6. **Metadata & Artifact Generation**
   - Creates: `logs/{timestamp}/artifact-metadata.json`
     - Includes: Story info, scene results, frame counts, test exit codes, history paths
   - Publishes: `public/artifacts/latest-run.json` (for UI dashboard)
   - Archives: `artifacts/comfyui-e2e-{timestamp}.zip` (contains logs, generated frames, metadata)
   - Run Summary: `logs/{timestamp}/run-summary.txt`
     - Human-readable timeline of all steps and warnings

7. **Validation & Completion**
   - Runs: `scripts/validate-run-summary.ps1`
   - Checks: All expected sections present in run-summary
   - Exit Code: 0 if all checks pass, 1 if failures detected

### 3.2 Expected Log Structure
```
logs/
  {yyyyMMdd-HHmmss}/
    run-summary.txt                  # Human-readable execution log
    artifact-metadata.json           # Machine-readable results
    story/
      story.json                     # Generated story with 3 scenes
      scene-screenshot-*.png         # (Optional) keyframe preview
    scene_1/
      scene.json                     # Scene definition
      keyframe.png                   # Input keyframe
      generated-frames/
        gemdirect1_scene_1_00001.png  # Frame 1
        gemdirect1_scene_1_00002.png  # Frame 2
        ...
        gemdirect1_scene_1_00025.png  # Frame 25
      history.json                   # ComfyUI execution history
    scene_2/
      [same structure]
    scene_3/
      [same structure]
    vitest-comfyui.log              # ComfyUI test output
    vitest-e2e.log                  # E2E test output
    vitest-scripts.log              # Scripts test output
    vitest-results.json             # Exit codes: {"comfyExit": 0, "e2eExit": 0, "scriptsExit": 0}
```

---

## 4. Capture & Analysis Workflow

### 4.1 Post-Run Review (After E2E Completes)

#### Step 1: Check Run Summary
```powershell
$timestamp = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
$summaryPath = "logs/$timestamp/run-summary.txt"
Get-Content $summaryPath | head -50  # First 50 lines for overview
```

**Look for**:
- ✓ `[Story ready: ... (scenes=3)]` - Story generation succeeded
- ✓ `[ComfyUI ready after X seconds]` - Server ready time
- ✓ `[Scene scene_1][Attempt 1] Frames=25 Duration=...` - Per-scene completion
- ⚠️ `[Scene scene_X] HISTORY WARNING: ...` - History retrieval issues
- ❌ `[Scene scene_X] ERROR: ...` - Scene failures
- ✓ `[Validation] run-summary validation passed` - All checks passed

#### Step 2: Verify Frame Outputs
```powershell
$timestamp = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
for ($i = 1; $i -le 3; $i++) {
    $frameDir = "logs/$timestamp/scene_$i/generated-frames"
    $frameCount = @(ls $frameDir -File).Count
    Write-Host "Scene $i: $frameCount frames"
}
```

**Expected**: 25 frames per scene (75 total)

#### Step 3: Review Artifact Metadata
```powershell
$metadata = Get-Content "logs/$timestamp/artifact-metadata.json" | ConvertFrom-Json
$metadata.Scenes | ForEach-Object {
    Write-Host "Scene $($_.SceneId): Frames=$($_.FrameCount) Success=$($_.Success) HistoryRetrieved=$($_.HistoryRetrieved)"
}
```

**Expected Output**:
```
Scene scene_1: Frames=25 Success=True HistoryRetrieved=True
Scene scene_2: Frames=25 Success=True HistoryRetrieved=True
Scene scene_3: Frames=25 Success=True HistoryRetrieved=True
```

#### Step 4: Check Vitest Results
```powershell
$vitestResults = Get-Content "logs/$timestamp/vitest-results.json" | ConvertFrom-Json
Write-Host "ComfyUI Tests: Exit Code = $($vitestResults.comfyExit)"
Write-Host "E2E Tests: Exit Code = $($vitestResults.e2eExit)"
Write-Host "Scripts Tests: Exit Code = $($vitestResults.scriptsExit)"
```

**Expected**: All exit codes = 0

### 4.2 Troubleshooting Key Issues

#### Issue: Frames < 25 Per Scene
**Root Causes**:
1. SVD inference incomplete (long GPU processing)
2. History polling timeout (max 600s exceeded)
3. Output directory mismatch (frames saved to unexpected location)

**Investigation**:
- Check `artifact-metadata.json` → `Scenes[].HistoryPollLog` for poll timeline
- Check `artifact-metadata.json` → `Scenes[].OutputDirsScanned` for where helper searched
- Review ComfyUI logs: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\` for unexpected subdirectories
- Increase `$MaxWaitSeconds` parameter in workflow script if inference is slow

**Fix**:
```powershell
# Increase max wait time for slower GPUs
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -MaxSceneRetries 2  # Also enables 1 retry
```

#### Issue: History Retrieval Failed
**Root Causes**:
1. ComfyUI execution error (bad workflow)
2. Network timeout
3. Prompt ID mismatch

**Investigation**:
- Check `artifact-metadata.json` → `Scenes[].HistoryErrors` for actual error message
- Verify ComfyUI is still running: `Get-Process | Where-Object { $_.ProcessName -eq 'python' }`
- Check ComfyUI console output (if running interactively)

#### Issue: Vitest Suite Failed (Exit Code ≠ 0)
**Investigation**:
```powershell
$logPath = "logs/$timestamp/vitest-comfyui.log"  # or vitest-e2e.log
Get-Content $logPath | tail -50  # Last 50 lines for error context
```

**Common Failures**:
- Missing files in `src/tests/`
- Incomplete mock setup for ComfyUI API
- Timeout in test suite

---

## 5. LLM Integration & Storyline Quality

### 5.1 Local LLM Enhancement (Optional)
If using a local LLM provider (e.g., Ollama, vLLM), enhance story generation:

```powershell
$env:LOCAL_STORY_PROVIDER_URL = "http://127.0.0.1:11434/api/generate"  # Ollama endpoint
$env:LOCAL_LLM_SEED = "42"

pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

This will:
- Generate richer scene prompts with local model
- Include mood, cinematography, character details
- Improve visual coherence across scenes

### 5.2 Prompt Quality Metrics
Review generated story in `logs/{timestamp}/story/story.json`:

```json
{
  "scenes": [
    {
      "id": "scene_1",
      "prompt": "Cinematic wide shot of...",  // ← Check for cinematic vocabulary
      "expectedFrames": 25,
      "mood": "dramatic",                      // ← Check mood consistency
      "cameraMovement": "slow pan",           // ← Check technical details
      "negativePrompt": "blurry, watermark..."
    }
  ]
}
```

---

## 6. Preventive & Remediation Measures

### 6.1 Environment Monitoring
Before each run, verify:

```powershell
# Check Node version
node -v  # Should be v22.19.0+

# Check ComfyUI status
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188  # TcpTestSucceeded = True

# Check GPU memory (if NVIDIA)
nvidia-smi  # Should show > 2GB free VRAM

# Check SVD model present
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"
```

### 6.2 Log Rotation & Archiving
Keep workspace clean:

```powershell
# Archive old logs (> 7 days)
$oldLogs = Get-ChildItem -Path "logs" -Directory | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }
foreach ($log in $oldLogs) {
    $archiveName = "archived-logs-$($log.Name).zip"
    Compress-Archive -Path $log.FullName -DestinationPath $archiveName -Force
    Remove-Item -Path $log.FullName -Recurse -Force
}
```

### 6.3 ComfyUI Restart (If Hung)
```powershell
# Stop ComfyUI
Get-Process | Where-Object { $_.Path -like '*ComfyUI*' } | Stop-Process -Force
Start-Sleep -Seconds 3

# Restart via VS Code task
Run-Task -WorkspaceFolder "c:\Dev\gemDirect1" -Id "shell: Start ComfyUI Server"
```

---

## 7. Documentation & Reporting

### 7.1 Create Test Execution Report
Update `E2E_TEST_EXECUTION_REPORT_20251111_ITERATION2.md`:

```markdown
# E2E Test Execution Report - November 11, 2025 (Iteration 2)

## Environment
- **Date**: November 11, 2025
- **Node Version**: v22.19.0
- **PowerShell**: 7.5.3 (Core)
- **ComfyUI**: v0.3.68
- **Status**: ✓ Environment Validated

## Test Run
- **Start Time**: {actual_time}
- **Duration**: {actual_duration} minutes
- **Scenario**: 3-scene story-to-video generation

## Results
| Metric | Value |
|--------|-------|
| Total Scenes | 3 |
| Successful Scenes | {X}/3 |
| Total Frames Generated | {Y}/75 |
| ComfyUI Tests Exit Code | {code} |
| E2E Tests Exit Code | {code} |
| Scripts Tests Exit Code | {code} |
| Overall Success | {Yes/No} |

## Issues Encountered
- {If any}

## Remediation Taken
- {If any}

## Artifacts Generated
- Story: `logs/{ts}/story/story.json`
- Frames: `logs/{ts}/scene_*/generated-frames/`
- Metadata: `logs/{ts}/artifact-metadata.json`
- Archive: `artifacts/comfyui-e2e-{ts}.zip`

## Next Steps
- {Recommendations}
```

### 7.2 Archive Artifacts
```powershell
$timestamp = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
$archivePath = "artifacts/comfyui-e2e-$timestamp.zip"

Write-Host "Archive available at: $archivePath"
Write-Host "Artifact metadata at: logs/$timestamp/artifact-metadata.json"
Write-Host "Public snapshot at: public/artifacts/latest-run.json"
```

---

## 8. Quick Start for Next Run

### 8.1 Pre-Run Checklist
```powershell
# 1. Verify Node version
node -v                            # ✓ v22.19.0

# 2. Verify ComfyUI is running
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188

# 3. Verify SVD model exists (⚠️ BLOCKER - see section 2)
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"

# 4. Clear old logs if needed (optional)
Remove-Item -Path "logs/*" -Recurse -Force -ErrorAction SilentlyContinue
```

### 8.2 Execute Full Suite
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1
```

### 8.3 Review Results
```powershell
$timestamp = (Get-ChildItem -Path "logs" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name
Get-Content "logs/$timestamp/run-summary.txt"
Get-Content "logs/$timestamp/artifact-metadata.json" | ConvertFrom-Json | Format-Table
```

---

## 9. Outstanding Actions

### 🔴 BLOCKER: SVD Model Download Required
**Action**: Download and place `svd_xt.safetensors` before running E2E tests.  
**Time Estimate**: 15-20 minutes (depending on download speed).  
**Instructions**: See Section 2.3 above.

### 🟡 OPTIONAL: LLM Integration
**Action**: Set up local LLM if enhanced story quality is desired.  
**Time Estimate**: 30 minutes (if Ollama not already installed).  
**Instructions**: See Section 5.1 above.

### 🟢 READY: Full E2E Test Suite
**Action**: Execute `run-comfyui-e2e.ps1` after SVD model is in place.  
**Time Estimate**: 10-20 minutes (3 scenes × 3-5 minutes each + Vitest + archiving).  
**Expected Outcome**: 75 generated frames + test reports + validation success.

---

## 10. Summary Table: Environment Status

| Component | Required | Actual | Status | Notes |
|-----------|----------|--------|--------|-------|
| **Node.js** | ≥22.19.0 | v22.19.0 | ✓ | Early abort enforced in scripts |
| **PowerShell** | 7+ (pwsh) | 7.5.3 | ✓ | Prevents PS5.1 syntax errors |
| **ComfyUI Server** | Running | ✓ (PID 7388) | ✓ | CORS enabled, port 8188 open |
| **SVD Model** | svd_xt.safetensors | ⚠️ Missing | 🔴 **BLOCKER** | ~2.5GB download needed |
| **Input Directory** | Writable | ✓ | ✓ | `ComfyUI/input/` |
| **Output Directory** | Writable | ✓ | ✓ | `ComfyUI/output/` |
| **Clip Vision Models** | Optional | ✓ | ✓ | Updated Nov 10 |
| **LoRA Models** | Optional | ✓ | ✓ | Updated Nov 11 |

---

## 11. Success Criteria for Full E2E Run

✓ **Story Generation**: 3 scenes created with valid prompts  
✓ **Scene 1-3**: Each generates 25 frames (75 total)  
✓ **History Retrieval**: All prompts successfully polled from ComfyUI  
✓ **ComfyUI Tests**: Exit code = 0  
✓ **E2E Tests**: Exit code = 0  
✓ **Scripts Tests**: Exit code = 0  
✓ **Validation**: run-summary passes all checks  
✓ **Artifacts**: Metadata JSON and archive generated successfully  

**Overall Success**: All above criteria met → **PASS** ✓

---

## Appendix: File Locations Reference

```
c:\Dev\gemDirect1\
  scripts/
    run-comfyui-e2e.ps1              ← Main orchestration script
    run-vitests.ps1                  ← Vitest suite executor
    queue-real-workflow.ps1          ← Scene processing helper
    generate-story-scenes.ts         ← Story & scene generator
    validate-run-summary.ps1         ← Post-run validation
  workflows/
    text-to-video.json               ← SVD workflow template
  logs/
    {yyyyMMdd-HHmmss}/
      run-summary.txt                ← Human-readable log
      artifact-metadata.json         ← Machine-readable results
      vitest-*.log                   ← Test suite outputs
      scene_*/generated-frames/      ← PNG frames
  artifacts/
    comfyui-e2e-{ts}.zip             ← Compressed archive
  public/artifacts/
    latest-run.json                  ← Live dashboard feed
  src/tests/
    comfyui.test.ts                  ← ComfyUI integration tests
    e2e.test.ts                      ← End-to-end scenario tests

C:\ComfyUI\ComfyUI_windows_portable\
  ComfyUI/
    main.py                          ← Server entry point
    input/                           ← Scene keyframes placed here
    output/                          ← ComfyUI writes frames here
    models/
      checkpoints/
        SVD/
          svd_xt.safetensors         ← ⚠️ NEED TO DOWNLOAD
      vae/
      clip_vision/
      loras/
```

---

**Report Generated**: November 11, 2025 | **Next Review**: After SVD model download + E2E test execution

