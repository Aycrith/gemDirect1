# ComfyUI Model Download Guide

## ComfyUI Manager is Now Installed! 🎉

You now have ComfyUI Manager and essential custom nodes installed. Here's how to download models:

## Quick Start - Getting Your First Models

### Option 1: Using ComfyUI Manager (Recommended)

1. **Start ComfyUI**:
   - Press `Ctrl+Shift+P` in VS Code
   - Select "Start ComfyUI Server"
   - Or run: `C:\ComfyUI\start-comfyui.bat`

2. **Access ComfyUI in Browser**:
   - Open http://127.0.0.1:8188

3. **Open ComfyUI Manager**:
   - Click the **Manager** button in the ComfyUI menu bar
   - Or press `Ctrl+M`

4. **Install Models**:
   - Click **"Install Models"**
   - Search for and install these recommended models:
     - **SD 1.5**: `v1-5-pruned-emaonly.safetensors` (4GB)
     - **SDXL**: `sd_xl_base_1.0.safetensors` (6.9GB)
     - **VAE**: `vae-ft-mse-840000-ema-pruned.safetensors` (334MB)

5. **Install Custom Nodes** (if needed):
   - In Manager, click **"Install Custom Nodes"**
   - Search for additional nodes you need

### Option 2: Manual Download

If you prefer to download models manually:

1. **Visit Model Sources**:
   - Hugging Face: https://huggingface.co/models
   - Civitai: https://civitai.com/

2. **Recommended Models for Testing**:
   - **Stable Diffusion 1.5**: https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5
   - **SDXL Base**: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0

3. **Place Models in Correct Folders**:
   ```
   C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\
   ├── checkpoints\       (Put .safetensors checkpoint files here)
   ├── vae\              (Put VAE files here)
   ├── loras\            (Put LoRA files here)
   ├── controlnet\       (Put ControlNet models here)
   └── upscale_models\   (Put upscalers here)
   ```

## Installed Custom Nodes

✓ **ComfyUI Manager** - Essential for managing models and nodes
✓ **ComfyUI Essentials** - Useful utility nodes
✓ **ControlNet Auxiliary** - Preprocessors for ControlNet

## Recommended Models to Download

### For Image Generation:
1. **Stable Diffusion XL Base 1.0** (6.9GB) - Best quality
2. **SD 1.5** (4GB) - Faster, lighter weight
3. **SD XL VAE** (334MB) - Better color accuracy

### For Video Generation (gemDirect1):
1. **Stable Video Diffusion** (SVD)
2. **AnimateDiff models**

### For Upscaling:
1. **RealESRGAN x4**
2. **4x-UltraSharp**

## Testing Your Installation

### Create a Simple Workflow:

1. Start ComfyUI
2. Load the default workflow
3. Make sure you have a checkpoint model loaded
4. Click "Queue Prompt"
5. Check that image generates successfully

### Verify gemDirect1 Integration:

1. Start ComfyUI server
2. Run your gemDirect1 app: `npm run dev`
3. Test the connection in your app's settings
4. Generate a test workflow from your app

## Model Storage Tips

- **Models are large** - SDXL checkpoints are 6-7GB each
- **Use .safetensors format** - Safer than .ckpt files
- **Free up space** - Delete unused models from the folders above
- **Organize with subfolders** - You can create subfolders in each model directory

## Troubleshooting

### "No checkpoints found" Error
- Make sure you've downloaded at least one checkpoint
- Place it in: `C:\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\`
- Refresh ComfyUI or restart the server

### Manager Button Missing
- Restart ComfyUI server completely
- Clear browser cache and reload http://127.0.0.1:8188

### Model Download Fails in Manager
- Check your internet connection
- Some models are very large (6+ GB)
- Try downloading manually from Hugging Face instead

## Next Steps

1. Start ComfyUI: `C:\ComfyUI\start-comfyui.bat`
2. Open browser to: http://127.0.0.1:8188
3. Click "Manager" button
4. Install your first model via "Install Models"
5. Test with default workflow
6. Integrate with gemDirect1 app

## Need More Help?

- ComfyUI Manager GitHub: https://github.com/ltdrdata/ComfyUI-Manager
- ComfyUI Documentation: https://github.com/comfyanonymous/ComfyUI
- Model Database: https://comfyanon.github.io/ComfyUI_examples/

---

**Note**: The first startup after installing custom nodes may take longer as dependencies are installed automatically.
