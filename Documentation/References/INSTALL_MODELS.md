# Quick Model Installation Guide

## Problem
The WebSocket, HTTP API, and workflow engine are all working correctly. However, the AI models required for video generation are **not installed**, so ComfyUI is generating blank placeholder frames.

## Solution: Install 2 Models (Total ~2.3 GB)

### Option 1: Download via Browser (Easiest) ✅ RECOMMENDED

#### Step 1: Open ComfyUI Manager
```
1. Open http://127.0.0.1:8188 in your web browser
2. Look for "Manager" button (usually bottom-right corner)
3. Click it
```

If no Manager button visible, see **Option 2** below.

#### Step 2: Search & Download Model 1
```
1. In Manager, click "Install" or "Search" tab
2. Search for: "SVD XT" 
3. Click the result for "stabilityai/stable-video-diffusion"
4. Click "Install" or "Download"
5. Wait for download (1-2 GB, ~5-15 minutes depending on internet)
```

#### Step 3: Search & Download Model 2
```
1. In Manager search box, clear and type: "CLIP Vision"
2. Look for "openai/clip-vit-large-patch14" or similar
3. Click "Install"
4. Wait for download (~350 MB, ~1-5 minutes)
```

#### Step 4: Restart ComfyUI
```
PowerShell:
  - Press Ctrl+Shift+P in VS Code
  - Select "Tasks: Run Task"
  - Choose "Restart ComfyUI Server"
  
Or manually:
  - Close ComfyUI window
  - Wait 5 seconds
  - Run: C:\ComfyUI\start-comfyui.bat
```

---

### Option 2: Manual Download (If Manager Not Available)

#### Model 1: SVD XT (Stable Video Diffusion)

**Step 1**: Create folder
```powershell
mkdir "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD" -Force
```

**Step 2**: Visit and download
- Go to: https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt
- Click green "Clone repository" button (on right side)
- Or download individual files:
  - Download: `svd_xt.safetensors` 
  - Size: ~2 GB

**Step 3**: Move to correct location
```powershell
# If downloaded to Downloads folder:
Move-Item "$env:UserProfile\Downloads\svd_xt.safetensors" `
  "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\" -Force
```

#### Model 2: CLIP Vision ViT-L-14

**Step 1**: Create folder
```powershell
mkdir "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip_vision" -Force
```

**Step 2**: Visit and download
- Go to: https://huggingface.co/openai/clip-vit-large-patch14
- Click "Files" tab
- Download: `pytorch_model.bin` (or `model.safetensors` if available)

**Step 3**: Move to correct location
```powershell
# Rename to expected name:
Move-Item "$env:UserProfile\Downloads\pytorch_model.bin" `
  "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip_vision\ViT-L-14-BEST-smooth-GmP-HF-format.safetensors" -Force
```

---

### Option 3: Download via PowerShell Script (Advanced)

If you have `wget` or `curl` available:

```powershell
# Create directories
mkdir "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD" -Force
mkdir "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip_vision" -Force

# Download SVD (Note: This is a large file, will take 10-30 minutes)
curl -L "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors" `
  -o "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"

# Download CLIP Vision
curl -L "https://huggingface.co/openai/clip-vit-large-patch14/resolve/main/pytorch_model.bin" `
  -o "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip_vision\ViT-L-14-BEST-smooth-GmP-HF-format.safetensors"
```

---

## Verify Installation

### Check Files Exist
```powershell
# Check SVD model
Get-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"

# Check CLIP model  
Get-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip_vision\ViT-L-14-BEST-smooth-GmP-HF-format.safetensors"

# Both should show file info (size > 100MB)
```

### Expected Output
```
    Directory: C:\ComfyUI\...\SVD

Name                  Length    LastWriteTime
----                  ------    -------------
svd_xt.safetensors    2GB       11/10/2025 4:45 PM
```

---

## Test Generation (After Installing Models)

```powershell
cd C:\Dev\gemDirect1
python test_workflow.py
```

### Expected Success Output
```
✅ ComfyUI Server: Running
✅ Workflow loaded: 8 nodes
✅ Prompt queued - ID: xxxxx
⏳ Waiting for generation...
✅ Generation complete!
✅ Output files generated: 125 PNG files
✅ ALL TESTS PASSED - Workflow is working!
```

### Expected Visual Output
Browse to:
```
C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\output\
```

Open any `gemdirect1_shot_XXXXX_.png` file and you should see:
- ✅ Detailed video frames (not solid brown)
- ✅ Progressive motion/changes
- ✅ Content matching cinematic prompts

---

## Disk Space Check

Before downloading, verify you have ~3 GB free:

```powershell
$drive = Get-Volume C:
$freeGB = [math]::Round($drive.SizeRemaining / 1GB, 2)
Write-Host "Free space on C: drive: $freeGB GB"

if ($freeGB -lt 3) {
  Write-Host "⚠️  WARNING: Less than 3GB free space!"
  Write-Host "Consider freeing up space or using external drive"
}
```

---

## Alternative: Pre-built Model Packs

If downloads are slow or unstable, ComfyUI has pre-packaged model downloads:

1. Go to: https://comfyui.com/managerinstall
2. Choose your config (Windows)
3. Download the "Essential Models" bundle

---

## Troubleshooting

### Download Failing
- Check internet connection
- Try different time (servers might be congested)
- Use VPN if geographic restrictions apply

### File Corruption
```powershell
# Re-download if file seems corrupted
Remove-Item "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\svd_xt.safetensors"
# Then re-download via Manager or manual method
```

### Out of Disk Space
```powershell
# Check available space
Get-Volume C: | Format-Table DriveLetter, SizeRemaining
# Free up space or use external storage
```

### Models Not Recognized
```powershell
# Verify exact filenames match workflow requirements
ls "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\SVD\"
ls "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\clip_vision\"

# Names must match exactly:
# - svd_xt.safetensors
# - ViT-L-14-BEST-smooth-GmP-HF-format.safetensors
```

---

## Time Estimates

| Task | Time |
|------|------|
| Download SVD (2 GB) | 5-30 min (depends on internet) |
| Download CLIP (350 MB) | 1-5 min |
| Install via Manager (both) | 10-40 min |
| Manual download & setup | 20-60 min |
| Restart ComfyUI | ~2 min |
| **Total** | **30 min - 1.5 hours** |

---

## Next: Run Tests

Once models are installed:

```powershell
# Test workflow
python test_workflow.py

# Expected: 125 PNG files with actual video content
```

Then the React app at `http://localhost:3000` can use the same workflow for UI-driven generation!

---

**Priority**: 🔴 HIGH - Models must be installed for any video generation to work

