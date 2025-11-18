<#
Start ComfyUI with memory-mapping disabled for safetensors.

This is a convenience script to start ComfyUI with the --disable-mmap flag.
Useful when your server crashes on large safetensors files with OSError 1455
(pagefile too small).
#>

param(
    [string]$comfyPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI",
    [int]$port = 8188
)

if (-not (Test-Path $comfyPath)) {
    Write-Host "⚠ ComfyUI path not found: $comfyPath" -ForegroundColor Yellow
    exit 1
}

$pythonCandidates = @(
    Join-Path $comfyPath ".\python_embeded\python.exe",
    Join-Path $comfyPath ".venv\Scripts\python.exe",
    "python"
)

$pythonPath = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $pythonPath) { $pythonPath = 'python' }

Write-Host "Starting ComfyUI from $comfyPath with --disable-mmap" -ForegroundColor Cyan
Set-Location $comfyPath
& "$pythonPath" main.py --windows-standalone-build --listen 0.0.0.0 --port $port --enable-cors-header "*" --disable-mmap
