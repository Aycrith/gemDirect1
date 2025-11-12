# ComfyUI Windows Unicode Encoding Issue - Remediation Guide

**Issue ID:** COMFYUI-WIN-UNICODE-001  
**Severity:** CRITICAL  
**Status:** DIAGNOSED & READY FOR IMPLEMENTATION  
**Date:** November 11, 2025

---

## Problem Statement

ComfyUI fails to complete video generation on Windows due to a **UnicodeEncodeError** in the tqdm progress bar rendering. The error occurs in the KSampler node when tqdm attempts to render Unicode block characters (█ `\u258e`) in a Windows console with cp1252 encoding.

### Error Signature

```
UnicodeEncodeError: 'charmap' codec can't encode character '\u258e' in position 6: character maps to <undefined>
Location: tqdm/std.py line 1191 (progress bar rendering)
Impact: Halts KSampler execution, prevents VAEDecode and SaveImage from running
Result: 0 video frames generated (expected: ≥25 per scene)
```

### Root Cause

1. Windows default console encoding is **cp1252** (Windows-1252)
2. Python's embedded runtime inherits this encoding
3. tqdm library renders Unicode progress bar characters that don't exist in cp1252
4. Progress bar rendering exception halts the entire KSampler execution
5. No exception handling allows the error to cascade to execution.py and fail the prompt

---

## Solution: Force UTF-8 Console Encoding

### Implementation Method

Set environment variables BEFORE starting ComfyUI to force Python to use UTF-8 encoding:

```powershell
# Set UTF-8 environment variables
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"

# Verify encoding is set
Write-Host "PYTHONIOENCODING: $env:PYTHONIOENCODING"
Write-Host "PYTHONLEGACYWINDOWSSTDIO: $env:PYTHONLEGACYWINDOWSSTDIO"

# Start ComfyUI
$ComfyPython = 'C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe'
$ComfyMain = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\main.py'

& $ComfyPython -s $ComfyMain `
    --windows-standalone-build `
    --listen 0.0.0.0 `
    --port 8188 `
    --enable-cors-header "*"
```

### Environment Variables Explained

| Variable | Value | Purpose |
|----------|-------|---------|
| `PYTHONIOENCODING` | `utf-8` | Forces Python stdin/stdout/stderr to use UTF-8 encoding instead of cp1252 |
| `PYTHONLEGACYWINDOWSSTDIO` | `0` | Disables legacy Windows stdio behavior, enabling native UTF-8 support |

### Where to Apply

#### Option A: Permanent (Recommended for Production)

Add to Windows System Environment Variables:

1. **Settings → Environment Variables**
2. **System variables → New**
3. Create:
   - `PYTHONIOENCODING = utf-8`
   - `PYTHONLEGACYWINDOWSSTDIO = 0`
4. Restart all Python processes

#### Option B: VS Code Task (Recommended for Development)

Update the VS Code task `Start ComfyUI Server`:

**File:** `.vscode/tasks.json` or `tasks.json`

```json
{
  "label": "Start ComfyUI Server",
  "type": "shell",
  "command": "powershell",
  "args": [
    "-NoLogo",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "$env:PYTHONIOENCODING='utf-8'; $env:PYTHONLEGACYWINDOWSSTDIO='0'; cd 'C:\\ComfyUI\\ComfyUI_windows_portable'; .\\python_embeded\\python.exe -s ComfyUI\\main.py --windows-standalone-build --listen 0.0.0.0 --port 8188 --enable-cors-header '*'"
  ],
  "isBackground": true,
  "problemMatcher": {
    "pattern": {
      "regexp": "^.*$",
      "file": 1,
      "location": 2,
      "message": 3
    },
    "background": {
      "activeOnStart": true,
      "beginsPattern": "^.*Starting server.*",
      "endsPattern": "^.*To see the GUI.*"
    }
  }
}
```

#### Option C: PowerShell Script Wrapper

Create a file: `scripts/start-comfyui-utf8.ps1`

```powershell
#!/usr/bin/env pwsh

# Force UTF-8 encoding for Windows console
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"

Write-Host "Starting ComfyUI with UTF-8 encoding enabled..."
Write-Host "  PYTHONIOENCODING = $env:PYTHONIOENCODING"
Write-Host "  PYTHONLEGACYWINDOWSSTDIO = $env:PYTHONLEGACYWINDOWSSTDIO"
Write-Host ""

$ComfyPython = 'C:\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe'
$ComfyMain = 'C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\main.py'
$ComfyDir = 'C:\ComfyUI\ComfyUI_windows_portable'

& $ComfyPython -s $ComfyMain `
    --windows-standalone-build `
    --listen 0.0.0.0 `
    --port 8188 `
    --enable-cors-header "*"
```

**Usage:**
```powershell
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/start-comfyui-utf8.ps1
```

#### Option D: E2E Test Update

Modify `scripts/run-comfyui-e2e.ps1` line 2 to include UTF-8 setup:

```powershell
param(
    [int] $MaxSceneRetries = 1,
    [switch] $UseLocalLLM,
    [string] $LocalLLMProviderUrl,
    [string] $LocalLLMSeed,
    [int] $LocalLLMTimeoutMs = 8000
)

# CRITICAL: Force UTF-8 encoding to avoid tqdm Unicode errors on Windows
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"

$MinimumNodeVersion = '22.19.0'
# ... rest of script
```

---

## Verification Steps

### Step 1: Verify Environment Variables Are Set

```powershell
# Check current session
Write-Host "PYTHONIOENCODING: $env:PYTHONIOENCODING"
Write-Host "PYTHONLEGACYWINDOWSSTDIO: $env:PYTHONLEGACYWINDOWSSTDIO"

# Expected output:
# PYTHONIOENCODING: utf-8
# PYTHONLEGACYWINDOWSSTDIO: 0
```

### Step 2: Check ComfyUI Startup Log

Look for these indicators in ComfyUI startup output:

✅ **GOOD** - No tqdm Unicode errors:
```
Prompt executed in X.XX seconds
[Real E2E][scene-001] Workflow completed after X.Xs
```

❌ **BAD** - Still seeing UnicodeEncodeError:
```
UnicodeEncodeError: 'charmap' codec can't encode character '\u258e'
```

### Step 3: Verify Frame Generation

Check for generated frames:

```powershell
# Navigate to output directory
$OutputDir = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs"

# List frames for a scene
Get-ChildItem -Path $OutputDir -Filter "gemdirect1_scene-001*.png" | Measure-Object

# Expected: At least 25 PNG files for each scene
# Count: 25+
```

### Step 4: Check Artifact Metadata

Inspect the generated metadata:

```powershell
# After e2e test completes
$MetadataFile = "logs\<timestamp>\artifact-metadata.json"
$Metadata = Get-Content $MetadataFile -Raw | ConvertFrom-Json

# Check scene frame counts
$Metadata.Scenes | ForEach-Object {
    Write-Host "Scene $($_.SceneId): $($_.FrameCount) frames"
}

# Expected output:
# Scene scene-001: 25 frames
# Scene scene-002: 25 frames
# Scene scene-003: 25 frames
```

---

## Testing Plan After Fix

### Quick Test (5 minutes)

```powershell
# 1. Set UTF-8 encoding
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"

# 2. Start ComfyUI manually or via task
# (Terminal 1)

# 3. Run minimal e2e test with 1 scene only
# (Terminal 2)
pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -MaxSceneRetries 0

# 4. Check for frames
Get-ChildItem -Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\outputs" -Filter "gemdirect1_*.png"

# Success criteria:
# ✅ KSampler completes without UnicodeEncodeError
# ✅ VAEDecode executes
# ✅ SaveImage creates PNG files
# ✅ At least 25 frames per scene
```

### Full Test (10-15 minutes)

```powershell
# Run full e2e with 3 scenes and retries
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"
$env:LOCAL_STORY_PROVIDER_URL = "http://localhost:11434/api/generate"
$env:LOCAL_LLM_SEED = "42"
$env:LOCAL_LLM_TIMEOUT_MS = "10000"

pwsh -NoLogo -ExecutionPolicy Bypass -File scripts/run-comfyui-e2e.ps1 -MaxSceneRetries 1 -UseLocalLLM

# Check logs
cat logs\<timestamp>\run-summary.txt | Select-String "Frames=|HISTORY|ERROR"

# Success criteria:
# ✅ 0 scene failures
# ✅ Total frames >= 75 (25 per scene × 3 scenes)
# ✅ All Vitest suites pass
# ✅ Archive created successfully
```

---

## Verification Checklist

After implementing the fix, verify:

- [ ] `PYTHONIOENCODING` environment variable is set to `utf-8`
- [ ] `PYTHONLEGACYWINDOWSSTDIO` environment variable is set to `0`
- [ ] ComfyUI starts without tqdm errors
- [ ] KSampler node completes execution
- [ ] VAEDecode receives and processes output
- [ ] SaveImage creates PNG files in output directory
- [ ] E2E test completes with frame count ≥ 25 per scene
- [ ] Artifact metadata shows correct frame counts
- [ ] No UnicodeEncodeError in history.json files
- [ ] Vitest suites pass
- [ ] Archive is created and contains all logs

---

## Rollback Plan

If UTF-8 encoding causes other issues:

### Temporary Rollback
```powershell
# Unset the problematic environment variables
Remove-Item env:PYTHONIOENCODING
Remove-Item env:PYTHONLEGACYWINDOWSSTDIO

# ComfyUI will revert to system default (likely cp1252)
```

### Permanent Rollback
1. Remove system environment variables if set globally
2. Revert any modified task definitions
3. Restart ComfyUI normally

---

## Alternative Solutions (If UTF-8 Fails)

### Alternative 1: Disable tqdm Progress Bar

Modify ComfyUI to disable tqdm:

```python
# File: C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\comfy\samplers.py
# Look for tqdm imports and add disable parameter

# Change:
# for i in trange(len(sigmas) - 1):
# To:
# for i in trange(len(sigmas) - 1, disable=True):
```

### Alternative 2: ASCII-Only Progress Bar

Edit tqdm configuration:

```python
# In ComfyUI config or environment
import os
os.environ['TQDM_POSITION'] = '-1'  # Disable progress bar entirely
```

### Alternative 3: Run ComfyUI in WSL2

Use Windows Subsystem for Linux to get native Linux UTF-8 support.

---

## Long-Term Improvements

### 1. CI/CD Windows Detection

Add to `scripts/run-comfyui-e2e.ps1`:

```powershell
# Auto-detect Windows and apply UTF-8 fix
if ($IsWindows) {
    Write-Host "Windows detected, applying UTF-8 encoding fix..."
    $env:PYTHONIOENCODING = "utf-8"
    $env:PYTHONLEGACYWINDOWSSTDIO = "0"
}
```

### 2. Documentation Update

Add to `LOCAL_SETUP_GUIDE.md`:

```markdown
### Windows Console Encoding

On Windows, Python defaults to cp1252 encoding which causes tqdm (progress bar library) to fail 
with Unicode errors. To fix this:

**Set these environment variables before running ComfyUI:**
- `PYTHONIOENCODING=utf-8`
- `PYTHONLEGACYWINDOWSSTDIO=0`

See [REMEDIATION_GUIDE_UNICODE_ISSUE.md](REMEDIATION_GUIDE_UNICODE_ISSUE.md) for detailed steps.
```

### 3. ComfyUI Wrapper Script

Create official wrapper in `scripts/start-comfyui.ps1`:

```powershell
# Automatically handles platform-specific requirements
```

### 4. GitHub Actions CI

Update CI configuration to set environment variables:

```yaml
- name: Start ComfyUI (Windows)
  if: runner.os == 'Windows'
  env:
    PYTHONIOENCODING: utf-8
    PYTHONLEGACYWINDOWSSTDIO: 0
  run: |
    # Start ComfyUI
```

---

## Related Issues & References

- **GitHub Issue:** ComfyUI-Manager/issues (matplotlib missing in dwpose)
- **Python Bug:** https://bugs.python.org/issue37380 (Windows console encoding)
- **tqdm Issue:** https://github.com/tqdm/tqdm/issues (Unicode on Windows)
- **Workaround:** https://stackoverflow.com/questions/59693029/...

---

## Support & Escalation

### If UTF-8 Fix Works
- [x] Update all documentation
- [x] Update CI/CD pipeline
- [x] Test in production environment
- [x] Archive this guide

### If UTF-8 Fix Fails
- [ ] Document failure reason
- [ ] Test Alternative Solution #1 (disable tqdm)
- [ ] Test Alternative Solution #2 (ASCII progress)
- [ ] Consider WSL2 migration
- [ ] Open issue with ComfyUI maintainers

### Questions?
Refer to `WINDOWS_TESTING_REPORT_20251111.md` for full test execution details and logs.

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-11  
**Status:** READY FOR IMPLEMENTATION  
**Owner:** Development Team
