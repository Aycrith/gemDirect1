# Development Scripts

This directory contains utility scripts for development and diagnostics.

## Available Scripts

### diagnose.ps1
Comprehensive environment diagnostic script that checks:
- Node.js and npm installation
- Project dependencies
- Environment variables (GEMINI_API_KEY)
- ComfyUI server status
- GPU/VRAM availability
- Python installation for ComfyUI

**Usage:**
```powershell
.\scripts\diagnose.ps1
```

Run this script before starting development or when troubleshooting integration issues.

## Adding New Scripts

When creating new utility scripts:
1. Use descriptive names (e.g., `setup-comfyui.ps1`, `test-api.ps1`)
2. Add documentation to this README
3. Include error handling and user-friendly output
4. Use color-coded output (Green for success, Red for errors, Yellow for warnings)
