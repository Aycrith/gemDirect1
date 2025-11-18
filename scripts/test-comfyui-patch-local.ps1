<#
Quick test harness to apply pagefile fallback patch to a local sample copy
of ComfyUI so we can validate the replace logic in this repository without
touching a real ComfyUI installation.
#>

param(
    [string]$testRoot = "$PSScriptRoot\..\test",
    [switch]$Verbose
)

$testComfy = Join-Path $testRoot "ComfyUI"
if (Test-Path $testComfy) { Remove-Item $testComfy -Recurse -Force }
New-Item -Path $testComfy -ItemType Directory -Force | Out-Null

New-Item -Path (Join-Path $testComfy "comfy") -ItemType Directory -Force | Out-Null

Copy-Item -Path (Join-Path $testRoot "comfy-utils-sample.py") -Destination (Join-Path $testComfy "comfy\utils.py") -Force

Write-Host "Sample ComfyUI copied to: $testComfy" -ForegroundColor Green

Write-Host "Running patch script in test mode..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "patch-comfyui-handle-pagefile.ps1") -customComfyPath $testComfy

Write-Host "Validate patch..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "validate-comfyui-patch.ps1") -comfyPath $testComfy
Write-Host "Compiling patched sample to verify Python syntax..." -ForegroundColor Cyan
try {
    python -m py_compile (Join-Path $testComfy "comfy\utils.py")
    Write-Host "✓ Python syntax check passed." -ForegroundColor Green
} catch {
    Write-Host "✗ Python syntax check failed. See errors above" -ForegroundColor Red
}

Write-Host "Test complete — check the patched file at: $(Join-Path $testComfy 'comfy\utils.py')" -ForegroundColor Green
