<#
Revert ComfyUI safetensors pagefile fallback patch

This script restores a backup made by patch-comfyui-handle-pagefile.ps1.
#>
param(
    [string]$comfyPath = "C:\ComfyUI\ComfyUI_windows_portable\ComfyUI"
)

$target = Join-Path $comfyPath "comfy\utils.py"
$backup = "$target.gemDirect1.bak"

if (-not (Test-Path $target)) {
    Write-Host "Target not found: $target" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $backup)) {
    Write-Host "Backup not found: $backup" -ForegroundColor Yellow
    exit 1
}

Write-Host "Restoring backup: $backup -> $target" -ForegroundColor Cyan
Copy-Item -Path $backup -Destination $target -Force
Write-Host "Backup restored" -ForegroundColor Green
Write-Host "✓ If you want to re-run verification, run scripts/validate-comfyui-patch.ps1 -comfyPath '$comfyPath'" -ForegroundColor Cyan
