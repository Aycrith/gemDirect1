# ComfyUI Clean Installation Guide

## Overview
This document describes the clean installation of ComfyUI that was performed on November 7, 2025. This installation completely replaced previous problematic installations and provides a reliable, properly configured setup.

## Installation Location
**Primary Location**: `C:\ComfyUI\ComfyUI_windows_portable\`

This is the official ComfyUI portable Windows distribution with:
- Embedded Python runtime (no separate Python installation required)
- All dependencies pre-installed
- NVIDIA GPU support (CUDA 13.0, PyTorch 2.9.0)
- Ready-to-use configuration

## What Was Removed
1. **ComfyUI Desktop App** (Electron-based): `C:\Users\camer\AppData\Local\Programs\@comfyorgcomfyui-electron`
2. **Previous Standalone Installation**: `C:\COMFYUI` (with venv)

Both installations had CORS issues and conflicting configurations that were causing problems with the gemDirect1 application.

## New Installation Details

### Directory Structure
```
C:\ComfyUI\
├── ComfyUI_windows_portable\          # Main installation
│   ├── ComfyUI\                       # Core application
│   │   ├── main.py                    # Entry point
│   │   ├── comfy\                     # Core modules
│   │   └── user\                      # User settings
│   ├── python_embeded\                # Embedded Python 3.12
│   │   └── python.exe                 # Python executable
│   ├── run_nvidia_gpu.bat             # Official startup script
│   ├── run_cpu.bat                    # CPU-only startup
│   └── README_VERY_IMPORTANT.txt      # Official documentation
├── start-comfyui.bat                  # Custom startup with CORS
└── start-comfyui.py                   # Alternative Python startup

```

### CORS Configuration
The new installation includes proper CORS configuration via command-line arguments:

```bash
--enable-cors-header "*"
```

This allows the gemDirect1 web application (running on `http://localhost:3000`) to communicate with ComfyUI without CORS errors.

**Key Point**: CORS is configured via startup arguments, NOT by modifying `server.py`. This ensures updates don't break the configuration.

## Starting ComfyUI

### Option 1: VS Code Task (Recommended)
1. Press `Ctrl+Shift+P`
2. Select "Tasks: Run Task"
3. Choose "Start ComfyUI Server"

This runs: `python -s main.py --windows-standalone-build --listen 0.0.0.0 --port 8188 --enable-cors-header "*"`

### Option 2: Custom Batch File
```powershell
C:\ComfyUI\start-comfyui.bat
```

### Option 3: Official Script
```powershell
C:\ComfyUI\ComfyUI_windows_portable\run_nvidia_gpu.bat
```
Note: This doesn't include custom CORS configuration by default.

## Verification

### Check if Server is Running
```powershell
# Test API endpoint
Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -Method Get

# Check process
Get-Process python* | Where-Object { $_.Path -like '*ComfyUI*' }
```

### Expected Response
```json
{
  "system": {
    "os": "nt",
    "comfyui_version": "0.3.68",
    "ram_total": 34278559744,
    "ram_free": 13094404096,
    "device": {
      "name": "NVIDIA GeForce RTX 3090",
      "type": "cuda",
      "vram_total": 25769803776,
      "vram_free": 24805818368
    }
  }
}
```

## Integration with gemDirect1

### Service Configuration
The `services/comfyUIService.ts` file automatically tries multiple endpoints:
- `http://127.0.0.1:8188` (default)
- `http://localhost:8188`
- `http://127.0.0.1:8000` (legacy)
- `http://localhost:8000` (legacy)

### Pre-flight Checks
Before generating content, the app performs these checks:
1. **Server Connection**: Verifies API accessibility
2. **System Resources**: Checks available VRAM (warns if < 2GB)
3. **Queue Status**: Shows current queue position
4. **Workflow Validation**: Ensures workflow nodes match mappings

## Troubleshooting

### Server Won't Start
```powershell
# Kill any stuck processes
Get-Process python* | Where-Object { $_.Path -like '*ComfyUI*' } | Stop-Process -Force

# Check for port conflicts
Test-NetConnection -ComputerName 127.0.0.1 -Port 8188

# Restart from clean state
.\scripts\setup-comfyui.ps1
```

### CORS Errors in Browser
1. Verify the server was started with `--enable-cors-header "*"`
2. Check browser console for specific error
3. Try accessing `http://127.0.0.1:8188` directly in browser

### Connection Refused
1. Wait 15-20 seconds after starting (initialization takes time)
2. Check if Python process is running
3. Look for error messages in the ComfyUI terminal window
4. Verify firewall isn't blocking port 8188

### Reinstallation
If problems persist, run the clean installation script:
```powershell
.\scripts\setup-comfyui.ps1
```

This script:
1. Stops all ComfyUI processes
2. Removes old installations
3. Downloads latest portable version
4. Extracts and configures properly
5. Creates startup scripts with CORS enabled

## System Requirements

### Verified Configuration
- **OS**: Windows 11
- **GPU**: NVIDIA GeForce RTX 3090 (24GB VRAM)
- **RAM**: 32GB
- **Python**: 3.12 (embedded)
- **PyTorch**: 2.9.0+cu130
- **CUDA**: 13.0

### Minimum Requirements
- **GPU**: NVIDIA GPU with 4GB+ VRAM (recommended 8GB+)
- **RAM**: 16GB (8GB may work for simple workflows)
- **Disk**: 10GB+ for installation, more for models
- **OS**: Windows 10/11 (64-bit)

## ComfyUI Manager Installed! 🎉

ComfyUI Manager is now installed and ready to use. This is the easiest way to install models and custom nodes.

### Access ComfyUI Manager:
1. Open http://127.0.0.1:8188 in your browser
2. Click the **Manager** button in the menu bar (or press Ctrl+M)
3. Use "Install Models" to download checkpoints, VAEs, LoRAs, etc.
4. Use "Install Custom Nodes" to add functionality

### Installed Custom Nodes:
- **ComfyUI Manager** - Model and node management
- **ComfyUI Essentials** - Utility nodes
- **ControlNet Auxiliary** - Preprocessors for ControlNet

## Models Location
Default model paths (for manual installation):
- Checkpoints: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\`
- VAE: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\vae\`
- LoRAs: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\loras\`
- ControlNet: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\controlnet\`

**Recommended**: Use ComfyUI Manager to install models instead of manual download. It handles dependencies and organization automatically.

## Performance Tips
1. **First Run**: Initial startup takes 15-30 seconds while loading models
2. **VRAM Usage**: Close other GPU applications for better performance
3. **Queue Management**: Check queue before adding multiple prompts
4. **Model Selection**: Use smaller models for testing, larger for production

## Version Information
- **ComfyUI Version**: 0.3.68
- **Frontend Version**: 1.28.8+
- **Installation Date**: November 7, 2025
- **Installation Method**: Official portable distribution

## Updates
To update ComfyUI:
1. Stop the server
2. Run the update script: `C:\ComfyUI\ComfyUI_windows_portable\update\update_comfyui.bat`
3. Restart the server

Alternatively, re-run `.\scripts\setup-comfyui.ps1` for a clean installation of the latest version.

## Support
- **Official Documentation**: https://github.com/comfyanonymous/ComfyUI
- **Project Issues**: Check `.github\copilot-instructions.md` for integration-specific help
- **Diagnostic Tool**: Run `.\scripts\diagnose.ps1` for automated checks
