# ACTION PLAN: CLEANUP & VERIFICATION

**Status**: Fix in Progress  
**Issue**: Two ComfyUI directories causing confusion

---

## WHAT HAPPENED

I made a directory navigation mistake:

1. ❌ **I created**: `C:\ComfyUI\ComfyUI\custom_nodes\ComfyUI-Manager\`
2. ✅ **Should have used**: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\`
3. **Result**: Two installations, but only the `ComfyUI_windows_portable` one is actually running

---

## THE GOOD NEWS

✅ **The REAL ComfyUI installation ALREADY HAS:**
- ComfyUI Manager v3.37
- ComfyUI Essentials
- ControlNet Auxiliary preprocessors  
- 8+ other custom nodes
- Everything is properly installed and running

✅ **Currently Running From:**
```
C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\
```

✅ **Server Status:**
- Port 8188 ✅
- CORS Enabled ✅
- Python 3.13 ✅
- PyTorch with CUDA ✅

---

## IMMEDIATE NEXT STEPS (Choose One)

### Option A: Leave As-Is (Simplest)
- Do nothing
- The orphaned `C:\ComfyUI\ComfyUI\` won't affect anything
- Use `C:\ComfyUI\ComfyUI_windows_portable\` for everything
- Download all models to the portable installation

### Option B: Clean Slate (Recommended)
Delete the orphaned directory:

```powershell
# Stop ComfyUI
.\scripts\comfyui-stop.ps1

# Delete orphaned installation
Remove-Item -Recurse -Force "C:\ComfyUI\ComfyUI\"

# Verify cleanup
Get-ChildItem "C:\ComfyUI\" | Select-Object Name
# Should only show: ComfyUI_windows_portable, start files

# Restart ComfyUI
.\scripts\comfyui-start.ps1
```

---

## VERIFICATION CHECKLIST

Run these after cleanup (or right now):

```powershell
# 1. Verify ComfyUI is running from portable
Get-Process python | Select-Object CommandLine
# Should contain: "ComfyUI_windows_portable"

# 2. Verify Manager exists in right place
Test-Path "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-Manager"
# Should return: True

# 3. Verify orphaned directory (should exist but we'll ignore it)
Test-Path "C:\ComfyUI\ComfyUI"
# Can be True or False - doesn't matter

# 4. Open ComfyUI and click Manager button
# URL: http://127.0.0.1:8188
# Should show: "ComfyUI Manager V3.37"
```

---

## WHERE TO DOWNLOAD MODELS

### ✅ CORRECT: Models go here
```
C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\
```

### ❌ WRONG: NOT here
```
C:\ComfyUI\ComfyUI\models\  ← IGNORE THIS
```

---

## WHAT I'LL DO NEXT

1. Delete the orphaned `C:\ComfyUI\ComfyUI\` directory
2. Verify everything is clean
3. Confirm Manager is accessible
4. You can proceed with model downloads and workflow creation

**Everything is actually working correctly. This was just a navigation mistake on my part.**

---

## COMMANDS TO VERIFY EVERYTHING

Run these in PowerShell to confirm:

```powershell
# Show the ONLY directory structure that matters
Get-ChildItem "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\" | Select-Object Name | Sort-Object

# Should show all these nodes:
# - ComfyUI-Manager ✅
# - ComfyUI_essentials ✅
# - comfyui_controlnet_aux ✅
# - (and others...)

# Verify the running process
Get-Process python | Select-Object @{Name="Command";Expression={$_.CommandLine}}

# Check Manager version
Invoke-WebRequest -Uri "http://127.0.0.1:8188/manager/get_version" -UseBasicParsing | Select-Object -ExpandProperty Content
```

---

## MY APOLOGY

I created unnecessary confusion by:
1. Not checking which ComfyUI instance was actually running
2. Creating a new directory instead of verifying the existing one
3. Not cross-referencing the startup command in tasks.json

**Result**: Everything is actually fine, but I pointed you to the wrong directory initially.

The good news: ComfyUI was pre-installed with Manager and all nodes. Nothing was broken, I just added an orphaned directory.

---

## BOTTOM LINE

✅ ComfyUI is running
✅ Manager is installed  
✅ Custom nodes are installed
✅ Models can be downloaded
✅ You're ready to build workflows

**Just ignore the orphaned `C:\ComfyUI\ComfyUI\` directory and use the portable one for everything.**

