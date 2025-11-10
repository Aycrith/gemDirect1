# ComfyUI Quick Reference

## 🚀 Starting ComfyUI

### Method 1: VS Code Task (Recommended)
```
Ctrl+Shift+P → Tasks: Run Task → Start ComfyUI Server
```

### Method 2: Batch File
```powershell
C:\ComfyUI\start-comfyui.bat
```

### Method 3: Direct Command
```powershell
cd "C:\ComfyUI\ComfyUI_windows_portable"
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --listen 0.0.0.0 --port 8188 --enable-cors-header "*"
```

## 🌐 Access ComfyUI
**URL**: http://127.0.0.1:8188

## 📦 ComfyUI Manager

### Opening Manager
- Click **Manager** button in ComfyUI menu
- Or press `Ctrl+M`

### Common Tasks
1. **Install Models**: Manager → Install Models → Search and install
2. **Install Nodes**: Manager → Install Custom Nodes → Search and install
3. **Update**: Manager → Update ComfyUI or Update All

### Recommended First Models
- **SD 1.5**: `v1-5-pruned-emaonly.safetensors` (4GB)
- **SDXL Base**: `sd_xl_base_1.0.safetensors` (6.9GB)
- **VAE**: `vae-ft-mse-840000-ema-pruned.safetensors` (334MB)

## 📁 Important Directories

### Models
```
C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\
├── checkpoints\      - SD/SDXL models
├── vae\             - VAE models
├── loras\           - LoRA files
├── controlnet\      - ControlNet models
├── upscale_models\  - Upscalers
└── embeddings\      - Textual inversions
```

### Custom Nodes
```
C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\custom_nodes\
├── ComfyUI-Manager\           - Manager extension
├── ComfyUI_essentials\        - Utility nodes
└── comfyui_controlnet_aux\    - ControlNet preprocessors
```

## 🛠️ Installed Extensions

✅ **ComfyUI Manager** - Essential for managing everything
✅ **ComfyUI Essentials** - Useful utility nodes
✅ **ControlNet Auxiliary** - Preprocessors for ControlNet

## 🔧 Common Commands

### Check if Running
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -Method Get
```

### Stop Server
```powershell
Get-Process python* | Where-Object { $_.Path -like '*ComfyUI*' } | Stop-Process -Force
```

### Check Processes
```powershell
Get-Process python* | Where-Object { $_.Path -like '*ComfyUI*' }
```

## 🔄 Integration with gemDirect1

### Start Both Services
1. **Terminal 1**: Start ComfyUI Server (VS Code task)
2. **Terminal 2**: Start gemDirect1 (`npm run dev`)
3. Access gemDirect1: http://localhost:3000
4. Access ComfyUI: http://127.0.0.1:8188

### Verify Connection
- Check gemDirect1 settings for ComfyUI connection status
- Green indicator = Connected
- Red indicator = Check if ComfyUI is running

## ❓ Troubleshooting

### Server Won't Start
```powershell
# Kill stuck processes
Get-Process python* | Where-Object { $_.Path -like '*ComfyUI*' } | Stop-Process -Force

# Restart
C:\ComfyUI\start-comfyui.bat
```

### "No checkpoints found"
- Install a model via Manager: http://127.0.0.1:8188
- Click Manager → Install Models → Search "SD 1.5" or "SDXL"
- Or manually place .safetensors file in `models\checkpoints\`

### Manager Not Showing
- Restart ComfyUI completely
- Clear browser cache
- Check console for errors (F12)

### CORS Errors
- Verify startup command includes `--enable-cors-header "*"`
- Our startup scripts include this automatically

### Reinstall Everything
```powershell
.\scripts\setup-comfyui.ps1
```

## 📚 Documentation

- **Installation Guide**: `COMFYUI_CLEAN_INSTALL.md`
- **Model Download Guide**: `COMFYUI_MODEL_DOWNLOAD_GUIDE.md`
- **Project Instructions**: `.github\copilot-instructions.md`

## 🔗 External Resources

- **ComfyUI Manager**: https://github.com/ltdrdata/ComfyUI-Manager
- **ComfyUI GitHub**: https://github.com/comfyanonymous/ComfyUI
- **Models**: https://huggingface.co/models
- **Community**: https://civitai.com/

## 💡 Pro Tips

1. **Use Manager for everything** - It handles dependencies automatically
2. **Start with SD 1.5** - Faster and smaller than SDXL for testing
3. **Monitor VRAM** - Keep an eye on GPU memory usage
4. **Save workflows** - Export workflows as JSON for reuse
5. **Update regularly** - Manager → Update ComfyUI

## 🎯 Next Steps

1. ✅ ComfyUI is installed
2. ✅ Manager is ready
3. ⬜ Install your first model (via Manager)
4. ⬜ Test default workflow
5. ⬜ Integrate with gemDirect1
6. ⬜ Create custom workflows

---

**Current Status**: 
- ComfyUI: **INSTALLED** ✅
- Manager: **INSTALLED** ✅
- Models: **PENDING** (Install via Manager)
- Server: Check with `curl http://127.0.0.1:8188/system_stats`
